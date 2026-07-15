"use client";

import React, { useMemo } from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

interface MappingItem {
  id: string;
  hir: string;
  clif: string;
  assembly: string;
}

function highlightSegment(text: string, type: 'hir' | 'clif' | 'asm'): React.ReactNode {
  const lower = text.toLowerCase().trim();
  if (lower === 'semantic value' || lower === 'target instruction' || lower === 'lowered operation') {
    return <span className="text-[var(--muted)] italic opacity-60 font-sans text-[12px]">{text}</span>;
  }

  // Escape HTML characters first to prevent parsing issues
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  if (type === 'hir') {
    // Keywords
    escaped = escaped.replace(
      /\b(extern|int|void|return|struct|char|unsigned|if|else|while|for)\b/g,
      '<span class="tok-kw">$1</span>'
    );
    // Delimiters/brackets
    escaped = escaped.replace(/([{}()[\];,])/g, '<span class="tok-delim">$1</span>');
  } else if (type === 'clif') {
    // CLIF Keywords and instructions
    escaped = escaped.replace(
      /\b(function|gv\d+|v\d+|symbol|collocated|iconst|iadd|return|system_v)\b/g,
      '<span class="tok-kw">$1</span>'
    );
    // Constants or types
    escaped = escaped.replace(/\b(i32|i64|f32|f64)\b/g, '<span class="tok-type">$1</span>');
  } else if (type === 'asm') {
    // Registers & Instructions
    escaped = escaped.replace(
      /\b(mov|add|sub|jmp|ret|push|pop|call|eax|ebx|ecx|edx|esp|ebp|rsi|rdi|rax|rcx|rdx|rbx|rsp|rbp|rip)\b/g,
      '<span class="tok-asm">$1</span>'
    );
  }

  // Highlight numbers
  escaped = escaped.replace(/\b(\d+)\b/g, '<span class="tok-num">$1</span>');

  return <code dangerouslySetInnerHTML={{ __html: escaped }} />;
}

export default function IRAssemblyViewer() {
  const mappings = useCompilerStore((state) => state.artifacts?.irMappings ?? []) as MappingItem[];

  return (
    <div className="h-full w-full bg-[var(--workspace)] flex flex-col overflow-hidden select-none font-sans">
      {/* 1. Sticky Table Header */}
      <div className="grid grid-cols-[1fr_32px_1fr_32px_1fr] px-6 py-4 border-b border-[var(--hairline)] bg-[rgba(18,19,17,0.45)] backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-2 font-mono text-[11px] font-[900] uppercase tracking-wider text-[var(--muted)]">
          <span className="text-[#9FE870] font-bold">01</span> Semantic HIR
        </div>
        <div className="w-5" />
        <div className="flex items-center gap-2 font-mono text-[11px] font-[900] uppercase tracking-wider text-[var(--muted)]">
          <span className="text-[#60A5FA] font-bold">02</span> Cranelift IR
        </div>
        <div className="w-5" />
        <div className="flex items-center gap-2 font-mono text-[11px] font-[900] uppercase tracking-wider text-[var(--muted)]">
          <span className="text-[#F59E0B] font-bold">03</span> Native Assembly
        </div>
      </div>

      {/* 2. Scrollable Rows Stream */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 scrollbar-thin">
        {mappings.map((item) => (
          <div 
            key={item.id} 
            className="grid grid-cols-[1fr_32px_1fr_32px_1fr] items-stretch group rounded-[var(--rounded-card)] border border-transparent hover:border-[rgba(96,165,250,0.15)] hover:bg-[rgba(96,165,250,0.02)] p-2 transition-all duration-200"
          >
            {/* HIR Card */}
            <div className="flex flex-col bg-[rgba(24,24,27,0.5)] border border-[var(--hairline)] group-hover:border-[var(--hairline-strong)] rounded-[12px] p-4 min-h-[100px] justify-center transition-all duration-200">
              <pre className="overflow-auto font-mono text-[12px] leading-relaxed text-[var(--body-strong)] whitespace-pre-wrap break-all select-text scrollbar-none">
                {highlightSegment(item.hir, 'hir')}
              </pre>
            </div>

            {/* Pipeline Flow Connector 1 */}
            <div className="flex items-center justify-center text-[var(--muted)] group-hover:text-[#60A5FA] transition-colors duration-200">
              <svg className="w-5 h-5 transform group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Cranelift Card */}
            <div className="flex flex-col bg-[rgba(24,24,27,0.5)] border border-[var(--hairline)] group-hover:border-[var(--hairline-strong)] rounded-[12px] p-4 min-h-[100px] justify-center transition-all duration-200">
              <pre className="overflow-auto font-mono text-[12px] leading-relaxed text-[var(--body-strong)] whitespace-pre-wrap break-all select-text scrollbar-none">
                {highlightSegment(item.clif, 'clif')}
              </pre>
            </div>

            {/* Pipeline Flow Connector 2 */}
            <div className="flex items-center justify-center text-[var(--muted)] group-hover:text-[#F59E0B] transition-colors duration-200">
              <svg className="w-5 h-5 transform group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Assembly Card */}
            <div className="flex flex-col bg-[rgba(24,24,27,0.5)] border border-[var(--hairline)] group-hover:border-[var(--hairline-strong)] rounded-[12px] p-4 min-h-[100px] justify-center transition-all duration-200">
              <pre className="overflow-auto font-mono text-[12px] leading-relaxed text-[var(--body-strong)] whitespace-pre-wrap break-all select-text scrollbar-none">
                {highlightSegment(item.assembly, 'asm')}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
