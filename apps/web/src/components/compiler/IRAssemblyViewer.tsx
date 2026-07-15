"use client";

import React, { useRef, useState } from 'react';
import { useCompilerStore } from '../../stores/compilerStore';
import { mapClifLineToSourceSpan } from '../../utils/clifMapper';

interface MappingItem {
  id: string;
  hir: string;
  clif: string;
  assembly: string;
}

type TranslationSelection = {
  unit: string;
  column: 'hir' | 'clif' | 'asm';
  hirIdxs: number[];
  clifIdxs: number[];
  asmIdxs: number[];
  scrollHirIdx: number;
  scrollClifIdx: number;
  scrollAsmIdx: number;
};

// Pastel hover colors matching the source translation
const HIGHLIGHT_COLORS = [
  { bg: 'rgba(159, 232, 112, 0.08)', border: '#9FE870' }, // Green
  { bg: 'rgba(96, 165, 250, 0.08)',  border: '#60A5FA' }, // Blue
  { bg: 'rgba(167, 139, 250, 0.08)', border: '#A78BFA' }, // Purple
  { bg: 'rgba(244, 63, 94, 0.08)',   border: '#F43F5E' }, // Pink
  { bg: 'rgba(234, 179, 8, 0.08)',   border: '#EAB308' }, // Yellow/Gold
];

const RETURN_COLOR = { bg: 'rgba(239, 68, 68, 0.08)', border: '#EF4444' }; // Red
const DEFAULT_HOVER_COLOR = { bg: 'rgba(255, 255, 255, 0.03)', border: '#71717A' }; // Zinc/Gray

function highlightSegment(text: string, type: 'hir' | 'clif' | 'asm'): React.ReactNode {
  if (!text) {
    return <span className="text-[var(--muted)] opacity-30 select-none">—</span>;
  }

  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  if (type === 'hir') {
    escaped = escaped.replace(
      /\b(extern|int|void|return|struct|char|unsigned|if|else|while|for)\b/g,
      '<span class="tok-kw">$1</span>'
    );
    escaped = escaped.replace(/([{}()[\];,])/g, '<span class="tok-delim">$1</span>');
  } else if (type === 'clif') {
    escaped = escaped.replace(
      /\b(function|gv\d+|v\d+|symbol|collocated|iconst|iadd|return|system_v|sig\d+)\b/g,
      '<span class="tok-kw">$1</span>'
    );
    escaped = escaped.replace(/\b(i32|i64|f32|f64)\b/g, '<span class="tok-type">$1</span>');
  } else if (type === 'asm') {
    escaped = escaped.replace(
      /\b(mov|add|sub|jmp|ret|push|pop|call|eax|ebx|ecx|edx|esp|ebp|rsi|rdi|rax|rcx|rdx|rbx|rsp|rbp|rip)\b/g,
      '<span class="tok-asm">$1</span>'
    );
  }

  escaped = escaped.replace(/\b(0x[0-9a-fA-F]+|\d+)\b/g, '<span class="tok-num">$1</span>');

  return <code dangerouslySetInnerHTML={{ __html: escaped }} />;
}

const splitAssemblyIntoFunctions = (assemblyText: string): string[] => {
  if (!assemblyText) return [];
  const lines = assemblyText.split('\n');
  const functions: string[] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    const isNewFunctionStart = 
      line.includes('push rbp') || 
      line.includes('push {') || 
      line.includes('stp x29') || 
      line.includes('sub sp,');
    
    if (isNewFunctionStart && currentBlock.length > 0) {
      functions.push(currentBlock.join('\n'));
      currentBlock = [];
    }
    currentBlock.push(line);
  }
  if (currentBlock.length > 0) {
    functions.push(currentBlock.join('\n'));
  }
  return functions;
};

const overlaps = (
  a: { start: number; end: number } | null,
  b: { start: number; end: number } | null
) => {
  if (!a || !b) return false;
  return a.start < b.end && b.start < a.end;
};

const uniqueSorted = (items: number[]) => Array.from(new Set(items)).sort((a, b) => a - b);

const closestIndex = (items: number[], target: number) => {
  if (items.length === 0) return Math.max(0, target);
  return items.reduce((best, item) => (
    Math.abs(item - target) < Math.abs(best - target) ? item : best
  ), items[0]);
};

const isWholeFunctionSpan = (
  span: { start: number; end: number } | null,
  funcStart: number,
  funcEnd: number
) => Boolean(span && span.start <= funcStart && span.end >= funcEnd);

const mapClifLineToStrictSourceSpan = (
  line: string,
  source: string,
  funcStart: number,
  funcEnd: number
) => {
  const span = mapClifLineToSourceSpan(line, source, funcStart, funcEnd);
  return isWholeFunctionSpan(span, funcStart, funcEnd) ? null : span;
};

const findInFunction = (
  source: string,
  funcStart: number,
  funcEnd: number,
  pattern: RegExp,
  cursor = 0
) => {
  const funcSource = source.substring(funcStart, funcEnd);
  const fromCursor = funcSource.slice(cursor).search(pattern);
  if (fromCursor !== -1) return funcStart + cursor + fromCursor;

  const fromStart = funcSource.search(pattern);
  return fromStart === -1 ? -1 : funcStart + fromStart;
};

const spanToStatementEnd = (source: string, start: number, funcEnd: number) => {
  let end = start;
  while (end < funcEnd && ![';', '{', '}'].includes(source[end])) end += 1;
  return { start, end: Math.min(funcEnd, end + 1) };
};

const mapHirLineToSourceSpan = (
  line: string,
  source: string,
  funcStart: number,
  funcEnd: number,
  cursor = 0
): { start: number; end: number } | null => {
  const cleanLine = line.trim();
  if (!cleanLine) return null;

  const lower = cleanLine.toLowerCase();

  const keyword = cleanLine.match(/^(extern\s+)?(?:register\s+)?(?:unsigned\s+)?(?:int|void|char|long)?\s*\*?\s*([A-Za-z_]\w*)\s*\(/);
  if (keyword && !['if', 'while', 'for', 'return'].includes(keyword[2].toLowerCase())) {
    const idx = findInFunction(source, funcStart, funcEnd, new RegExp(`\\b${keyword[2]}\\s*\\(`), cursor);
    if (idx !== -1) return { start: idx, end: idx + keyword[2].length };
  }

  const controlKeyword = lower.match(/^(if|else|while|for)\b/)?.[1];
  if (controlKeyword) {
    const idx = findInFunction(source, funcStart, funcEnd, new RegExp(`\\b${controlKeyword}\\b`), cursor);
    if (idx !== -1) return spanToStatementEnd(source, idx, funcEnd);
  }

  if (lower.includes('return')) {
    const retIdx = findInFunction(source, funcStart, funcEnd, /\breturn\b/, cursor);
    if (retIdx !== -1) return spanToStatementEnd(source, retIdx, funcEnd);
  }

  if (cleanLine.includes('=') && /[+\-*/%]/.test(cleanLine)) {
    const arithmeticOps = ['+', '-', '*', '/', '%'];
    for (const op of arithmeticOps) {
      if (!cleanLine.includes(op)) continue;
      const escaped = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const idx = findInFunction(source, funcStart, funcEnd, new RegExp(escaped), cursor);
      if (idx !== -1) return { start: idx, end: idx + op.length };
    }
  }

  const callMatch = cleanLine.match(/\b([A-Za-z_]\w*)\s*\(/);
  if (callMatch) {
    const idx = findInFunction(source, funcStart, funcEnd, new RegExp(`\\b${callMatch[1]}\\s*\\(`), cursor);
    if (idx !== -1) return { start: idx, end: idx + callMatch[1].length };
  }

  const constants = cleanLine.match(/\b\d+\b/g) ?? [];
  for (const value of constants) {
    const idx = findInFunction(source, funcStart, funcEnd, new RegExp(`\\b${value}\\b`), cursor);
    if (idx !== -1) return { start: idx, end: idx + value.length };
  }

  const operators = ['==', '!=', '<=', '>=', '+', '-', '*', '/', '%', '<', '>'];
  for (const op of operators) {
    if (!cleanLine.includes(op)) continue;
    const escaped = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const idx = findInFunction(source, funcStart, funcEnd, new RegExp(escaped), cursor);
    if (idx !== -1) return { start: idx, end: idx + op.length };
  }

  const identifier = cleanLine.match(/\b([A-Za-z_]\w*)\b/)?.[1];
  if (identifier) {
    const idx = findInFunction(source, funcStart, funcEnd, new RegExp(`\\b${identifier}\\b`), cursor);
    if (idx !== -1) return { start: idx, end: idx + identifier.length };
  }

  return null;
};

const buildHirLineSourceSpans = (
  lines: string[],
  source: string,
  funcStart: number,
  funcEnd: number
) => {
  let cursor = Math.max(0, source.slice(funcStart, funcEnd).indexOf('{') + 1);
  return lines.map((line) => {
    const span = mapHirLineToSourceSpan(line, source, funcStart, funcEnd, cursor);
    if (span) cursor = Math.max(cursor, span.end - funcStart);
    return span;
  });
};

const mapClifLineToSourceSpanFrom = (
  line: string,
  source: string,
  funcStart: number,
  funcEnd: number,
  cursor = 0
): { start: number; end: number } | null => {
  const cleanLine = line.trim();
  if (!cleanLine || cleanLine.startsWith('function') || cleanLine.startsWith('block') || cleanLine === '}') {
    return null;
  }

  if (cleanLine.includes('return')) {
    const retIdx = findInFunction(source, funcStart, funcEnd, /\breturn\b/, cursor);
    if (retIdx !== -1) return spanToStatementEnd(source, retIdx, funcEnd);
  }

  if (cleanLine.includes('call')) {
    const idx = findInFunction(source, funcStart, funcEnd, /\b(?!if\b|for\b|while\b|return\b)[A-Za-z_]\w*\s*\(/, cursor);
    if (idx !== -1) {
      const name = source.slice(idx).match(/^[A-Za-z_]\w*/)?.[0] ?? '';
      return { start: idx, end: idx + name.length };
    }
  }

  const constMatch = cleanLine.match(/(?:iconst|fconst)\.[a-z0-9]+\s+(-?[0-9.]+)/);
  if (constMatch) {
    const value = constMatch[1];
    const idx = findInFunction(source, funcStart, funcEnd, new RegExp(`\\b${value.replace('.', '\\.')}\\b`), cursor);
    if (idx !== -1) return { start: idx, end: idx + value.length };
  }

  if (cleanLine.includes('icmp') || cleanLine.includes('fcmp')) {
    const operators = ['<=', '>=', '==', '!=', '<', '>'];
    for (const op of operators) {
      const escaped = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const idx = findInFunction(source, funcStart, funcEnd, new RegExp(escaped), cursor);
      if (idx !== -1) return { start: idx, end: idx + op.length };
    }
  }

  const binaryOps = [
    { clif: 'iadd', op: '+' },
    { clif: 'isub', op: '-' },
    { clif: 'imul', op: '*' },
    { clif: 'sdiv', op: '/' },
    { clif: 'urem', op: '%' },
    { clif: 'srem', op: '%' },
  ];
  for (const item of binaryOps) {
    if (!cleanLine.includes(item.clif)) continue;
    const escaped = item.op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const idx = findInFunction(source, funcStart, funcEnd, new RegExp(escaped), cursor);
    if (idx !== -1) return { start: idx, end: idx + item.op.length };
  }

  return mapClifLineToStrictSourceSpan(line, source, funcStart, funcEnd);
};

const buildClifLineSourceSpans = (
  lines: string[],
  source: string,
  funcStart: number,
  funcEnd: number
) => {
  let cursor = Math.max(0, source.slice(funcStart, funcEnd).indexOf('{') + 1);
  return lines.map((line) => {
    const span = mapClifLineToSourceSpanFrom(line, source, funcStart, funcEnd, cursor);
    if (span) cursor = Math.max(cursor, span.end - funcStart);
    return isWholeFunctionSpan(span, funcStart, funcEnd) ? null : span;
  });
};

type OperationKind = 'call' | 'return' | 'arithmetic' | 'compare' | 'branch' | 'memory' | 'constant' | 'other';

const classifyClifOperation = (line: string): OperationKind => {
  const clean = line.trim();
  if (/\bcall\b/.test(clean)) return 'call';
  if (/\breturn\b/.test(clean)) return 'return';
  if (/\b(iadd|isub|imul|sdiv|udiv|srem|urem)\b/.test(clean)) return 'arithmetic';
  if (/\b(icmp|fcmp)\b/.test(clean)) return 'compare';
  if (/\b(brif|brz|brnz|jump)\b/.test(clean)) return 'branch';
  if (/\b(load|store|stack_addr|uextend|sextend|ireduce)\b/.test(clean)) return 'memory';
  if (/\b(iconst|fconst)\b/.test(clean)) return 'constant';
  return 'other';
};

const classifyAsmOperation = (line: string): OperationKind => {
  const clean = line.trim().toLowerCase();
  if (/\bcall\b/.test(clean)) return 'call';
  if (/\bret\b/.test(clean)) return 'return';
  if (/\b(add|sub|imul|mul|idiv|div|inc|dec)\b/.test(clean)) return 'arithmetic';
  if (/\b(cmp|test|set[a-z]+)\b/.test(clean)) return 'compare';
  if (/\b(jmp|j[a-z]+)\b/.test(clean)) return 'branch';
  if (/\b(mov|lea|push|pop)\b/.test(clean)) return 'memory';
  return 'other';
};

export default function IRAssemblyViewer() {
  const artifacts = useCompilerStore((state) => state.artifacts);
  const source = useCompilerStore((state) => state.source);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [hoveredSelection, setHoveredSelection] = useState<TranslationSelection | null>(null);
  const [lockedSelection, setLockedSelection] = useState<TranslationSelection | null>(null);
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lineRefs = useRef<Record<string, HTMLDivElement | null>>({});

  if (!artifacts) {
    return (
      <div className="h-full w-full bg-[var(--workspace)] flex items-center justify-center text-[var(--muted)] font-mono text-[13px]">
        No compiled program loaded. Run compile first.
      </div>
    );
  }

  const hirSnaps = artifacts.wasmResult?.hir ?? [];
  const clifSnaps = artifacts.wasmResult?.clif ?? [];
  const assemblyText = artifacts.rawText?.assembly ?? '';

  const hirDeclarations = hirSnaps.map(h => h.text.trim());
  const hirFunctions = hirSnaps.filter(h => h.text.includes('{'));
  const asmBlocks = splitAssemblyIntoFunctions(assemblyText);

  interface FunctionUnit {
    name: string;
    hir: string;
    clif: string;
    assembly: string;
    start: number;
    end: number;
  }

  const units: FunctionUnit[] = [];
  clifSnaps.forEach((clifSnap, index) => {
    const hirSnap = hirFunctions[index];
    const assembly = asmBlocks[index] ?? '';
    
    let name = clifSnap.func_name;
    if (hirSnap) {
      const nameMatch = hirSnap.text.match(/\b([A-Za-z_]\w*)\s*\(/);
      if (nameMatch) {
        name = nameMatch[1];
      }
    }
    
    units.push({
      name,
      hir: hirSnap ? hirSnap.text.trim() : '',
      clif: clifSnap.clif.trim(),
      assembly: assembly.trim(),
      start: clifSnap.start,
      end: clifSnap.end,
    });
  });

  const visibleUnits = activeTab === 'all' 
    ? units 
    : units.filter(u => u.name === activeTab);

  const setColumnRef = (key: string) => (element: HTMLDivElement | null) => {
    columnRefs.current[key] = element;
  };

  const setLineRef = (key: string) => (element: HTMLDivElement | null) => {
    lineRefs.current[key] = element;
  };

  const scrollColumnToLine = (unit: string, column: 'hir' | 'clif' | 'asm', index: number) => {
    const pane = columnRefs.current[`${unit}-${column}`];
    const row = lineRefs.current[`${unit}-${column}-${index}`];
    if (!pane || !row) return;

    const paneRect = pane.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const nextTop = pane.scrollTop + rowRect.top - paneRect.top - pane.clientHeight * 0.38 + rowRect.height / 2;
    pane.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
  };

  const proportionalIndex = (sourceIdx: number, sourceCount: number, targetCount: number): number => {
    if (targetCount <= 1 || sourceCount <= 1) return 0;
    const ratio = sourceIdx / (sourceCount - 1);
    return Math.max(0, Math.min(targetCount - 1, Math.round(ratio * (targetCount - 1))));
  };

  return (
    <div className="h-full w-full bg-[var(--workspace)] flex flex-col overflow-hidden select-none font-sans">
      {/* Sticky Scope Bar Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--hairline)] bg-[rgba(18,19,17,0.45)] backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase tracking-wider text-[var(--muted)] mr-2">Scope:</span>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 ${
              activeTab === 'all'
                ? 'bg-zinc-800 text-[#60A5FA] border border-[rgba(96,165,250,0.3)] shadow-[0_0_8px_rgba(96,165,250,0.1)]'
                : 'text-[var(--muted)] hover:text-white hover:bg-zinc-900 border border-transparent'
            }`}
          >
            All Functions
          </button>
          {units.map((u) => (
            <button
              key={u.name}
              onClick={() => setActiveTab(u.name)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 ${
                activeTab === u.name
                  ? 'bg-zinc-800 text-[#60A5FA] border border-[rgba(96,165,250,0.3)] shadow-[0_0_8px_rgba(96,165,250,0.1)]'
                  : 'text-[var(--muted)] hover:text-white hover:bg-zinc-900 border border-transparent'
              }`}
            >
              fn {u.name}()
            </button>
          ))}
        </div>
        <div className="text-[10px] font-mono text-[var(--muted)] tracking-wider uppercase">
          Side-By-Side Translation Pipeline
        </div>
      </div>

      {/* Column Labels */}
      <div className="grid grid-cols-[1fr_24px_1fr_24px_1fr] px-8 py-3 border-b border-[var(--hairline)] bg-[rgba(10,10,12,0.6)] shrink-0">
        <div className="flex items-center gap-2 font-mono text-[11px] font-[900] uppercase tracking-wider text-[var(--muted)]">
          <span className="text-[#9FE870] font-bold">01</span> Semantic HIR
        </div>
        <div />
        <div className="flex items-center gap-2 font-mono text-[11px] font-[900] uppercase tracking-wider text-[var(--muted)]">
          <span className="text-[#60A5FA] font-bold">02</span> Cranelift IR
        </div>
        <div />
        <div className="flex items-center gap-2 font-mono text-[11px] font-[900] uppercase tracking-wider text-[var(--muted)]">
          <span className="text-[#F59E0B] font-bold">03</span> Native Assembly
        </div>
      </div>

      {/* Three-Column Scrollable Container */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 scrollbar-thin">
        {/* Render Non-Function Prototypes / Globals if showing 'All' */}
        {activeTab === 'all' && hirDeclarations.filter(h => !h.includes('{')).length > 0 && (
          <div className="grid grid-cols-[1fr_24px_1fr_24px_1fr] items-stretch opacity-60">
            <div className="bg-[rgba(24,24,27,0.25)] border border-[var(--hairline)] rounded-xl p-4 min-h-[60px] justify-center flex flex-col">
              <pre className="overflow-auto font-mono text-[11px] leading-relaxed text-[var(--body-muted)] whitespace-pre-wrap break-all scrollbar-none">
                {hirDeclarations.filter(h => !h.includes('{')).map((decl, i) => (
                  <div key={i} className="py-0.5">{highlightSegment(decl, 'hir')}</div>
                ))}
              </pre>
            </div>
            <div />
            <div className="bg-[rgba(24,24,27,0.15)] border border-dashed border-[var(--hairline)] rounded-xl p-4 justify-center flex flex-col items-center">
              <span className="text-[10px] font-mono text-[var(--muted)] opacity-50 uppercase tracking-widest">Prototypes / Globals</span>
            </div>
            <div />
            <div className="bg-[rgba(24,24,27,0.15)] border border-dashed border-[var(--hairline)] rounded-xl p-4 justify-center flex flex-col items-center">
              <span className="text-[10px] font-mono text-[var(--muted)] opacity-50 uppercase tracking-widest">No Codegen</span>
            </div>
          </div>
        )}

        {/* Render Functions */}
        {visibleUnits.map((u) => {
          const hirLines = u.hir.split('\n').filter(l => l.trim() !== '');
          const clifLines = u.clif.split('\n').filter(l => l.trim() !== '');
          const asmLines = u.assembly.split('\n').filter(l => l.trim() !== '');

          const clifSpans = buildClifLineSourceSpans(clifLines, source, u.start, u.end);
          const hirSpans = buildHirLineSourceSpans(hirLines, source, u.start, u.end);
          const rowWindow = (center: number, count: number, radius = 1) => {
            if (count === 0) return [];
            return uniqueSorted(
              Array.from({ length: radius * 2 + 1 }, (_, i) => center - radius + i)
                .filter((idx) => idx >= 0 && idx < count)
            );
          };
          const pickTranslationRows = (matches: number[], fallback: number, count: number, maxRows: number, radius = 1) => {
            const sorted = uniqueSorted(matches);
            if (sorted.length === 0) return rowWindow(fallback, count, radius);
            if (sorted.length <= maxRows) return sorted;

            const anchor = closestIndex(sorted, fallback);
            const nearby = sorted.filter((idx) => Math.abs(idx - anchor) <= Math.max(2, radius));
            return nearby.length > 0 && nearby.length <= maxRows
              ? nearby
              : rowWindow(anchor, count, radius);
          };
          const asmRowsForClif = (clifIdx: number) => {
            if (asmLines.length === 0) return [];
            const expected = proportionalIndex(clifIdx, clifLines.length, asmLines.length);
            const kind = classifyClifOperation(clifLines[clifIdx] ?? '');
            const compatible = kind === 'other'
              ? []
              : asmLines
                .map((line, idx) => (classifyAsmOperation(line) === kind ? idx : -1))
                .filter((idx) => idx >= 0);
            const anchor = compatible.length > 0 ? closestIndex(compatible, expected) : expected;
            return rowWindow(anchor, asmLines.length, kind === 'call' || kind === 'memory' ? 2 : 1);
          };
          const asmWindowFromClif = (indexes: number[]) => {
            if (asmLines.length === 0) return [];
            return uniqueSorted((indexes.length > 0 ? indexes : [0]).flatMap((idx) => asmRowsForClif(idx)));
          };
          const clifRowsForHir = (hirIdx: number) => {
            const span = hirSpans[hirIdx];
            const matches = clifSpans
              .map((clifSpan, idx) => (overlaps(span, clifSpan) ? idx : -1))
              .filter((idx) => idx >= 0);
            const fallback = proportionalIndex(hirIdx, hirLines.length, clifLines.length);
            return pickTranslationRows(matches, fallback, clifLines.length, 10, 1);
          };
          const hirRowsForClif = (clifIdx: number) => {
            const span = clifSpans[clifIdx];
            const matches = hirSpans
              .map((hirSpan, idx) => (overlaps(span, hirSpan) ? idx : -1))
              .filter((idx) => idx >= 0);
            const fallback = proportionalIndex(clifIdx, clifLines.length, hirLines.length);
            return pickTranslationRows(matches, fallback, hirLines.length, 3, 0);
          };

          const makeSelectionFromHir = (hirIdx: number): TranslationSelection => {
            const clifIdxs = clifRowsForHir(hirIdx);
            const expectedClifIdx = proportionalIndex(hirIdx, hirLines.length, clifLines.length);
            const scrollClifIdx = closestIndex(clifIdxs, expectedClifIdx);
            const asmIdxs = asmWindowFromClif([scrollClifIdx]);
            const expectedAsmIdx = proportionalIndex(scrollClifIdx, clifLines.length, asmLines.length);
            const scrollAsmIdx = closestIndex(asmIdxs, expectedAsmIdx);

            return {
              unit: u.name,
              column: 'hir',
              hirIdxs: [hirIdx],
              clifIdxs,
              asmIdxs,
              scrollHirIdx: hirIdx,
              scrollClifIdx,
              scrollAsmIdx,
            };
          };

          const makeSelectionFromClif = (clifIdx: number): TranslationSelection => {
            const hirIdxs = hirRowsForClif(clifIdx);
            const expectedHirIdx = proportionalIndex(clifIdx, clifLines.length, hirLines.length);
            const scrollHirIdx = closestIndex(hirIdxs, expectedHirIdx);
            const asmIdxs = asmWindowFromClif([clifIdx]);
            const expectedAsmIdx = proportionalIndex(clifIdx, clifLines.length, asmLines.length);
            return {
              unit: u.name,
              column: 'clif',
              hirIdxs,
              clifIdxs: [clifIdx],
              asmIdxs,
              scrollHirIdx,
              scrollClifIdx: clifIdx,
              scrollAsmIdx: closestIndex(asmIdxs, expectedAsmIdx),
            };
          };

          const makeSelectionFromAsm = (asmIdx: number): TranslationSelection => {
            const clifIdx = proportionalIndex(asmIdx, asmLines.length, clifLines.length);
            const hirIdxs = hirRowsForClif(clifIdx);
            const expectedHirIdx = proportionalIndex(clifIdx, clifLines.length, hirLines.length);
            return {
              unit: u.name,
              column: 'asm',
              hirIdxs,
              clifIdxs: [clifIdx],
              asmIdxs: [asmIdx],
              scrollHirIdx: closestIndex(hirIdxs, expectedHirIdx),
              scrollClifIdx: clifIdx,
              scrollAsmIdx: asmIdx,
            };
          };

          const scrollToTranslation = (selection: TranslationSelection) => {
            setLockedSelection(selection);
            setHoveredSelection(selection);

            window.requestAnimationFrame(() => {
              scrollColumnToLine(selection.unit, 'hir', selection.scrollHirIdx);
              scrollColumnToLine(selection.unit, 'clif', selection.scrollClifIdx);
              scrollColumnToLine(selection.unit, 'asm', selection.scrollAsmIdx);
            });
          };

          const isCompleteTranslationHighlight = (
            selection: TranslationSelection | null,
            column: 'hir' | 'clif' | 'asm',
            idx: number
          ) => {
            if (!selection || selection.unit !== u.name) return false;
            if (column === 'hir') return selection.hirIdxs.includes(idx);
            if (column === 'clif') return selection.clifIdxs.includes(idx);
            return selection.asmIdxs.includes(idx);
          };

          // Determine highlight color details based on the currently hovered HIR line index
          const getActiveColor = (hirIdx: number) => {
            const line = hirLines[hirIdx] || '';
            if (line.toLowerCase().includes('return')) {
              return RETURN_COLOR;
            }
            return HIGHLIGHT_COLORS[hirIdx % HIGHLIGHT_COLORS.length];
          };

          return (
            <div
              key={u.name}
              className="flex flex-col gap-2 p-4 rounded-2xl border border-transparent"
            >
              {/* Function Label */}
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-[11px] font-mono text-[#60A5FA] font-bold">fn</span>
                <span className="text-xs font-mono text-white font-bold">{u.name}()</span>
                {(lockedSelection?.unit === u.name || hoveredSelection?.unit === u.name) && (
                  <span className="ml-auto rounded border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-[var(--muted)]">
                    matched translated rows
                  </span>
                )}
              </div>
              
              {/* Columns Grid */}
              <div className="grid grid-cols-[1fr_24px_1fr_24px_1fr] items-stretch">
                {/* Column 1: Semantic HIR */}
                <div
                  ref={setColumnRef(`${u.name}-hir`)}
                  className="flex max-h-[560px] min-w-0 flex-col overflow-auto bg-[rgba(10,10,12,0.45)] border border-[var(--hairline)] rounded-xl py-2.5 scrollbar-thin"
                >
                  {hirLines.map((line, idx) => {
                    const hoverForUnit = hoveredSelection?.unit === u.name ? hoveredSelection : null;
                    const lockForUnit = lockedSelection?.unit === u.name ? lockedSelection : null;
                    const isLocked = isCompleteTranslationHighlight(lockForUnit, 'hir', idx);
                    const isHovered = isCompleteTranslationHighlight(hoverForUnit, 'hir', idx);
                    const isPrimary = Boolean((lockForUnit ?? hoverForUnit)?.column === 'hir' && (lockForUnit ?? hoverForUnit)?.hirIdxs[0] === idx);
                    const isHighlighted = isLocked || isHovered;
                    const selectionForColor = lockForUnit ?? hoverForUnit;
                    const colorIdx = selectionForColor?.hirIdxs[0] ?? idx;
                    const highlight = isHighlighted ? getActiveColor(colorIdx) : null;
                    const style = highlight 
                      ? { backgroundColor: highlight.bg, borderLeft: `${isPrimary ? 4.5 : 3.5}px solid ${highlight.border}` } 
                      : { borderLeft: '3.5px solid transparent' };

                    return (
                      <div 
                        key={idx}
                        ref={setLineRef(`${u.name}-hir-${idx}`)}
                        style={style}
                        onMouseEnter={() => {
                          if (!lockedSelection) setHoveredSelection(makeSelectionFromHir(idx));
                        }}
                        onMouseLeave={() => {
                          if (!lockedSelection) setHoveredSelection(null);
                        }}
                        onClick={() => scrollToTranslation(makeSelectionFromHir(idx))}
                        className={`flex min-w-max items-stretch hover:bg-[rgba(255,255,255,0.02)] transition-all duration-150 py-0.5 px-3 cursor-pointer ${isPrimary ? 'ring-1 ring-inset ring-white/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]' : isLocked ? 'ring-1 ring-inset ring-white/10' : ''}`}
                      >
                        <span className="w-8 shrink-0 text-[10px] font-mono text-[var(--muted)] opacity-30 select-none text-right pr-3 pt-0.5">
                          {idx + 1}
                        </span>
                        <pre className="flex-1 font-mono text-[12px] leading-relaxed text-[var(--body-strong)] whitespace-pre select-text scrollbar-none m-0">
                          {highlightSegment(line, 'hir')}
                        </pre>
                      </div>
                    );
                  })}
                </div>

                {/* Connector 1 */}
                <div className="flex items-center justify-center text-[var(--muted)] opacity-30">
                  <svg className="w-4 h-4 transform translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>

                {/* Column 2: Cranelift IR */}
                <div
                  ref={setColumnRef(`${u.name}-clif`)}
                  className="flex max-h-[560px] min-w-0 flex-col overflow-auto bg-[rgba(10,10,12,0.45)] border border-[var(--hairline)] rounded-xl py-2.5 scrollbar-thin"
                >
                  {clifLines.map((line, idx) => {
                    const mappedHirIdx = proportionalIndex(idx, clifLines.length, hirLines.length);
                    const hoverForUnit = hoveredSelection?.unit === u.name ? hoveredSelection : null;
                    const lockForUnit = lockedSelection?.unit === u.name ? lockedSelection : null;
                    const isLocked = isCompleteTranslationHighlight(lockForUnit, 'clif', idx);
                    const isHovered = isCompleteTranslationHighlight(hoverForUnit, 'clif', idx);
                    const isPrimary = Boolean((lockForUnit ?? hoverForUnit)?.column === 'clif' && (lockForUnit ?? hoverForUnit)?.clifIdxs[0] === idx);
                    const isHighlighted = isLocked || isHovered;
                    const selectionForColor = lockForUnit ?? hoverForUnit;
                    const colorIdx = selectionForColor?.hirIdxs[0] ?? mappedHirIdx;
                    const highlight = isHighlighted ? getActiveColor(colorIdx) : null;
                    const style = highlight 
                      ? { backgroundColor: highlight.bg, borderLeft: `${isPrimary ? 4.5 : 3.5}px solid ${highlight.border}` } 
                      : { borderLeft: '3.5px solid transparent' };

                    return (
                      <div 
                        key={idx}
                        ref={setLineRef(`${u.name}-clif-${idx}`)}
                        style={style}
                        onMouseEnter={() => {
                          if (!lockedSelection) setHoveredSelection(makeSelectionFromClif(idx));
                        }}
                        onMouseLeave={() => {
                          if (!lockedSelection) setHoveredSelection(null);
                        }}
                        onClick={() => scrollToTranslation(makeSelectionFromClif(idx))}
                        className={`flex min-w-max items-stretch hover:bg-[rgba(255,255,255,0.02)] transition-all duration-150 py-0.5 px-3 cursor-pointer ${isPrimary ? 'ring-1 ring-inset ring-white/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]' : isLocked ? 'ring-1 ring-inset ring-white/10' : ''}`}
                      >
                        <span className="w-8 shrink-0 text-[10px] font-mono text-[var(--muted)] opacity-30 select-none text-right pr-3 pt-0.5">
                          {idx + 1}
                        </span>
                        <pre className="flex-1 font-mono text-[12px] leading-relaxed text-[var(--body-strong)] whitespace-pre select-text scrollbar-none m-0">
                          {highlightSegment(line, 'clif')}
                        </pre>
                      </div>
                    );
                  })}
                </div>

                {/* Connector 2 */}
                <div className="flex items-center justify-center text-[var(--muted)] opacity-30">
                  <svg className="w-4 h-4 transform translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>

                {/* Column 3: Native Assembly */}
                <div
                  ref={setColumnRef(`${u.name}-asm`)}
                  className="flex max-h-[560px] min-w-0 flex-col overflow-auto bg-[rgba(10,10,12,0.45)] border border-[var(--hairline)] rounded-xl py-2.5 scrollbar-thin"
                >
                  {asmLines.map((line, idx) => {
                    const mappedHirIdx = proportionalIndex(idx, asmLines.length, hirLines.length);
                    const hoverForUnit = hoveredSelection?.unit === u.name ? hoveredSelection : null;
                    const lockForUnit = lockedSelection?.unit === u.name ? lockedSelection : null;
                    const isLocked = isCompleteTranslationHighlight(lockForUnit, 'asm', idx);
                    const isHovered = isCompleteTranslationHighlight(hoverForUnit, 'asm', idx);
                    const isPrimary = Boolean((lockForUnit ?? hoverForUnit)?.column === 'asm' && (lockForUnit ?? hoverForUnit)?.asmIdxs[0] === idx);
                    const isHighlighted = isLocked || isHovered;
                    const selectionForColor = lockForUnit ?? hoverForUnit;
                    const colorIdx = selectionForColor?.hirIdxs[0] ?? mappedHirIdx;
                    const highlight = isHighlighted ? getActiveColor(colorIdx) : null;
                    const style = highlight 
                      ? { backgroundColor: highlight.bg, borderLeft: `${isPrimary ? 4.5 : 3.5}px solid ${highlight.border}` } 
                      : { borderLeft: '3.5px solid transparent' };

                    return (
                      <div 
                        key={idx}
                        ref={setLineRef(`${u.name}-asm-${idx}`)}
                        style={style}
                        onMouseEnter={() => {
                          if (!lockedSelection) setHoveredSelection(makeSelectionFromAsm(idx));
                        }}
                        onMouseLeave={() => {
                          if (!lockedSelection) setHoveredSelection(null);
                        }}
                        onClick={() => scrollToTranslation(makeSelectionFromAsm(idx))}
                        className={`flex min-w-max items-stretch hover:bg-[rgba(255,255,255,0.02)] transition-all duration-150 py-0.5 px-3 cursor-pointer ${isPrimary ? 'ring-1 ring-inset ring-white/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]' : isLocked ? 'ring-1 ring-inset ring-white/10' : ''}`}
                      >
                        <span className="w-8 shrink-0 text-[10px] font-mono text-[var(--muted)] opacity-30 select-none text-right pr-3 pt-0.5">
                          {idx + 1}
                        </span>
                        <pre className="flex-1 font-mono text-[12px] leading-relaxed text-[var(--body-strong)] whitespace-pre select-text scrollbar-none m-0">
                          {highlightSegment(line, 'asm')}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

}
