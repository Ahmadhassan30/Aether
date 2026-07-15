"use client";

import React, { useState } from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

interface MappingItem {
  id: string;
  hir: string;
  clif: string;
  assembly: string;
}

function highlightSegment(text: string, type: 'hir' | 'clif' | 'asm'): React.ReactNode {
  if (!text) {
    return <span className="text-[var(--muted)] opacity-30 select-none">—</span>;
  }

  // Escape HTML characters first to prevent parsing issues
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

  // Highlight numbers (hex and decimal)
  escaped = escaped.replace(/\b(0x[0-9a-fA-F]+|\d+)\b/g, '<span class="tok-num">$1</span>');

  return <code dangerouslySetInnerHTML={{ __html: escaped }} />;
}

// Splits raw assembly text into individual function blocks based on standard function prologue markers
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
  const [hoveredFunc, setHoveredFunc] = useState<string | null>(null);

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

  // Get full lists
  const hirDeclarations = hirSnaps.map(h => h.text.trim());
  const hirFunctions = hirSnaps.filter(h => h.text.includes('{'));
  const asmBlocks = splitAssemblyIntoFunctions(assemblyText);

  // Group functions side-by-side
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
    
    // Extract actual function name
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

  // Filter based on active tab selection
  const visibleUnits = activeTab === 'all' 
    ? units 
    : units.filter(u => u.name === activeTab);

  return (
    <div className="h-full w-full bg-[var(--workspace)] flex flex-col overflow-hidden select-none font-sans">
      {/* 1. Sticky Segmented Control & Navigation Header */}
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

      {/* 2. Column Labels */}
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

      {/* 3. Three-Column Scrollable Container */}
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
          const isHovered = hoveredFunc === u.name;
          const isAnyHovered = hoveredFunc !== null;

          return (
            <div
              key={u.name}
              onMouseEnter={() => setHoveredFunc(u.name)}
              onMouseLeave={() => setHoveredFunc(null)}
              className={`grid grid-cols-[1fr_24px_1fr_24px_1fr] items-stretch transition-all duration-300 rounded-[16px] p-2 border ${
                isHovered
                  ? 'border-[rgba(96,165,250,0.25)] bg-[rgba(96,165,250,0.025)] shadow-[0_0_20px_rgba(96,165,250,0.02)] scale-[1.005]'
                  : isAnyHovered
                  ? 'border-transparent opacity-40 scale-[0.995]'
                  : 'border-transparent'
              }`}
            >
              {/* Semantic HIR Block */}
              <div className={`flex flex-col bg-[rgba(24,24,27,0.5)] border rounded-xl p-4 transition-all duration-300 ${
                isHovered ? 'border-[#9FE870] shadow-[0_0_15px_rgba(159,232,112,0.15)]' : 'border-[var(--hairline)]'
              }`}>
                <pre className="font-mono text-[12px] leading-relaxed text-[var(--body-strong)] whitespace-pre-wrap break-all select-text scrollbar-none">
                  {highlightSegment(u.hir, 'hir')}
                </pre>
              </div>

              {/* Connector 1 */}
              <div className={`flex items-center justify-center transition-colors duration-300 ${
                isHovered ? 'text-[#60A5FA] scale-110' : 'text-[var(--muted)] opacity-40'
              }`}>
                <svg className="w-5 h-5 transform translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>

              {/* Cranelift IR Block */}
              <div className={`flex flex-col bg-[rgba(24,24,27,0.5)] border rounded-xl p-4 transition-all duration-300 ${
                isHovered ? 'border-[#60A5FA] shadow-[0_0_15px_rgba(96,165,250,0.2)]' : 'border-[var(--hairline)]'
              }`}>
                <pre className="font-mono text-[12px] leading-relaxed text-[var(--body-strong)] whitespace-pre-wrap break-all select-text scrollbar-none">
                  {highlightSegment(u.clif, 'clif')}
                </pre>
              </div>

              {/* Connector 2 */}
              <div className={`flex items-center justify-center transition-colors duration-300 ${
                isHovered ? 'text-[#F59E0B] scale-110' : 'text-[var(--muted)] opacity-40'
              }`}>
                <svg className="w-5 h-5 transform translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>

              {/* Native Assembly Block */}
              <div className={`flex flex-col bg-[rgba(24,24,27,0.5)] border rounded-xl p-4 transition-all duration-300 ${
                isHovered ? 'border-[#F59E0B] shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'border-[var(--hairline)]'
              }`}>
                <pre className="font-mono text-[12px] leading-relaxed text-[var(--body-strong)] whitespace-pre-wrap break-all select-text scrollbar-none">
                  {highlightSegment(u.assembly, 'asm')}
                </pre>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
