"use client";

import React, { useState } from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

interface MappingItem {
  id: string;
  hir: string;
  clif: string;
  assembly: string;
}

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

const findConstants = (text: string): number[] => {
  const matches = text.match(/\b\d+\b/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map(Number)))
    .filter(n => n > 1 && n !== 32 && n !== 64);
};

const getLineKey = (line: string, type: 'hir' | 'clif' | 'asm', constants: number[]): string | null => {
  const lower = line.toLowerCase();
  
  if (type === 'asm' && (lower.includes('ret') || lower.includes('leave'))) {
    return 'return';
  }
  if ((type === 'hir' || type === 'clif') && lower.includes('return')) {
    return 'return';
  }

  for (const c of constants) {
    const hex = c.toString(16);
    
    const decRegex = new RegExp(`\\b${c}\\b`);
    if (decRegex.test(line)) {
      return `const-${c}`;
    }
    
    if (type === 'asm') {
      const hexRegex = new RegExp(`\\b(0x)?0*${hex}h?\\b`, 'i');
      if (hexRegex.test(line)) {
        return `const-${c}`;
      }
    }
  }
  
  return null;
};

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

export default function IRAssemblyViewer() {
  const artifacts = useCompilerStore((state) => state.artifacts);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [hoveredHirIdx, setHoveredHirIdx] = useState<number | null>(null);

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
    });
  });

  const visibleUnits = activeTab === 'all' 
    ? units 
    : units.filter(u => u.name === activeTab);

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
          const constants = findConstants(u.hir);
          
          const hirLines = u.hir.split('\n').filter(l => l.trim() !== '');
          const clifLines = u.clif.split('\n').filter(l => l.trim() !== '');
          const asmLines = u.assembly.split('\n').filter(l => l.trim() !== '');

          // State Machine: Build accurate source-line translation map
          const clifToHir: number[] = [];
          let activeHirIdx = 0;
          clifLines.forEach((line) => {
            const key = getLineKey(line, 'clif', constants);
            if (key) {
              if (key === 'return') {
                const retIdx = hirLines.findIndex(l => l.toLowerCase().includes('return'));
                if (retIdx !== -1) activeHirIdx = retIdx;
              } else if (key.startsWith('const-')) {
                const val = Number(key.split('-')[1]);
                const constIdx = hirLines.findIndex(l => new RegExp(`\\b${val}\\b`).test(l));
                if (constIdx !== -1) activeHirIdx = constIdx;
              }
            }
            clifToHir.push(activeHirIdx);
          });

          const asmToHir: number[] = [];
          activeHirIdx = 0;
          asmLines.forEach((line) => {
            const key = getLineKey(line, 'asm', constants);
            if (key) {
              if (key === 'return') {
                const retIdx = hirLines.findIndex(l => l.toLowerCase().includes('return'));
                if (retIdx !== -1) activeHirIdx = retIdx;
              } else if (key.startsWith('const-')) {
                const val = Number(key.split('-')[1]);
                const constIdx = hirLines.findIndex(l => new RegExp(`\\b${val}\\b`).test(l));
                if (constIdx !== -1) activeHirIdx = constIdx;
              }
            }
            asmToHir.push(activeHirIdx);
          });

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
              </div>
              
              {/* Columns Grid */}
              <div className="grid grid-cols-[1fr_24px_1fr_24px_1fr] items-stretch">
                {/* Column 1: Semantic HIR */}
                <div className="flex flex-col bg-[rgba(10,10,12,0.45)] border border-[var(--hairline)] rounded-xl overflow-hidden py-2.5">
                  {hirLines.map((line, idx) => {
                    const isHighlighted = hoveredHirIdx === idx;
                    const highlight = isHighlighted ? getActiveColor(idx) : null;
                    const style = highlight 
                      ? { backgroundColor: highlight.bg, borderLeft: `3.5px solid ${highlight.border}` } 
                      : { borderLeft: '3.5px solid transparent' };

                    return (
                      <div 
                        key={idx}
                        style={style}
                        onMouseEnter={() => setHoveredHirLineIdx(idx)}
                        onMouseLeave={() => setHoveredHirLineIdx(null)}
                        className="flex items-stretch hover:bg-[rgba(255,255,255,0.02)] transition-all duration-150 py-0.5 px-3 cursor-pointer"
                      >
                        <span className="w-8 shrink-0 text-[10px] font-mono text-[var(--muted)] opacity-30 select-none text-right pr-3 pt-0.5">
                          {idx + 1}
                        </span>
                        <pre className="flex-1 font-mono text-[12px] leading-relaxed text-[var(--body-strong)] whitespace-pre-wrap break-all select-text scrollbar-none m-0">
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
                <div className="flex flex-col bg-[rgba(10,10,12,0.45)] border border-[var(--hairline)] rounded-xl overflow-hidden py-2.5">
                  {clifLines.map((line, idx) => {
                    const mappedHirIdx = clifToHir[idx];
                    const isHighlighted = hoveredHirIdx === mappedHirIdx;
                    const highlight = isHighlighted ? getActiveColor(mappedHirIdx) : null;
                    const style = highlight 
                      ? { backgroundColor: highlight.bg, borderLeft: `3.5px solid ${highlight.border}` } 
                      : { borderLeft: '3.5px solid transparent' };

                    return (
                      <div 
                        key={idx}
                        style={style}
                        onMouseEnter={() => setHoveredHirLineIdx(mappedHirIdx)}
                        onMouseLeave={() => setHoveredHirLineIdx(null)}
                        className="flex items-stretch hover:bg-[rgba(255,255,255,0.02)] transition-all duration-150 py-0.5 px-3 cursor-pointer"
                      >
                        <span className="w-8 shrink-0 text-[10px] font-mono text-[var(--muted)] opacity-30 select-none text-right pr-3 pt-0.5">
                          {idx + 1}
                        </span>
                        <pre className="flex-1 font-mono text-[12px] leading-relaxed text-[var(--body-strong)] whitespace-pre-wrap break-all select-text scrollbar-none m-0">
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
                <div className="flex flex-col bg-[rgba(10,10,12,0.45)] border border-[var(--hairline)] rounded-xl overflow-hidden py-2.5">
                  {asmLines.map((line, idx) => {
                    const mappedHirIdx = asmToHir[idx];
                    const isHighlighted = hoveredHirIdx === mappedHirIdx;
                    const highlight = isHighlighted ? getActiveColor(mappedHirIdx) : null;
                    const style = highlight 
                      ? { backgroundColor: highlight.bg, borderLeft: `3.5px solid ${highlight.border}` } 
                      : { borderLeft: '3.5px solid transparent' };

                    return (
                      <div 
                        key={idx}
                        style={style}
                        onMouseEnter={() => setHoveredHirLineIdx(mappedHirIdx)}
                        onMouseLeave={() => setHoveredHirLineIdx(null)}
                        className="flex items-stretch hover:bg-[rgba(255,255,255,0.02)] transition-all duration-150 py-0.5 px-3 cursor-pointer"
                      >
                        <span className="w-8 shrink-0 text-[10px] font-mono text-[var(--muted)] opacity-30 select-none text-right pr-3 pt-0.5">
                          {idx + 1}
                        </span>
                        <pre className="flex-1 font-mono text-[12px] leading-relaxed text-[var(--body-strong)] whitespace-pre-wrap break-all select-text scrollbar-none m-0">
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

  // Helper setter that handles bounds safety
  function setHoveredHirLineIdx(idx: number | null) {
    setHoveredHirIdx(idx);
  }
}
