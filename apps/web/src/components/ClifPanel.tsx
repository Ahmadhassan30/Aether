"use client";

import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { mapClifLineToSourceSpan } from '../utils/clifMapper';
import { Cpu, Terminal } from 'lucide-react';

export default function ClifPanel() {
  const { compileResult, source, setHighlightedSpan } = useStore();
  const [selectedFuncIdx, setSelectedFuncIdx] = useState(0);
  const [hoveredLineIdx, setHoveredLineIdx] = useState<number | null>(null);

  if (!compileResult || !compileResult.clif || compileResult.clif.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="p-4 rounded-full bg-zinc-900 border border-zinc-850 text-indigo-400 mb-4 shadow-inner">
          <Cpu className="h-8 w-8" />
        </div>
        <h3 className="text-sm font-semibold text-zinc-200 mb-1">No CLIF IR</h3>
        <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
          Compile a valid program to generate Cranelift Intermediate Representation.
        </p>
      </div>
    );
  }

  const clifList = compileResult.clif;
  const currentFunc = clifList[selectedFuncIdx] || clifList[0];
  const lines = currentFunc.clif.split('\n');

  const handleLineMouseEnter = (lineText: string, idx: number) => {
    setHoveredLineIdx(idx);
    const span = mapClifLineToSourceSpan(
      lineText,
      source,
      currentFunc.start,
      currentFunc.end
    );
    if (span) {
      setHighlightedSpan(span);
    }
  };

  const handleLineMouseLeave = () => {
    setHoveredLineIdx(null);
    setHighlightedSpan(null);
  };

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950/20 text-zinc-300">
      {/* Function Selector Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-850 bg-zinc-900/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Cranelift IR</span>
        </div>

        {clifList.length > 1 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-zinc-500 font-sans uppercase">Function:</span>
            <select
              value={selectedFuncIdx}
              onChange={(e) => setSelectedFuncIdx(Number(e.target.value))}
              className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-300 font-sans focus:outline-none focus:border-indigo-500/50"
            >
              {clifList.map((f, idx) => (
                <option key={f.func_name} value={idx}>
                  {f.func_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* CLIF Monospace Listing */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed selection:bg-indigo-500/20 scrollbar-thin">
        <div className="min-w-max space-y-[2px]">
          {lines.map((line, idx) => {
            const trimmed = line.trim();
            if (!trimmed && idx === lines.length - 1) return null;

            // Syntax highlighting classes
            let textClass = 'text-zinc-400';
            if (trimmed.startsWith('function')) {
              textClass = 'text-indigo-400 font-bold';
            } else if (trimmed.startsWith('block') || trimmed.endsWith(':')) {
              textClass = 'text-amber-500 font-semibold';
            } else if (trimmed.startsWith('jump') || trimmed.startsWith('brz') || trimmed.startsWith('brnz')) {
              textClass = 'text-purple-400';
            } else if (trimmed.startsWith('return')) {
              textClass = 'text-rose-400 font-medium';
            } else if (trimmed.includes('=')) {
              textClass = 'text-zinc-300';
            }

            const isLineHovered = hoveredLineIdx === idx;

            return (
              <div
                key={idx}
                onMouseEnter={() => handleLineMouseEnter(line, idx)}
                onMouseLeave={handleLineMouseLeave}
                className={`px-3 py-0.5 rounded transition-all cursor-pointer ${
                  isLineHovered 
                    ? 'bg-indigo-500/10 text-zinc-100 shadow-[inset_0_0_8px_rgba(99,102,241,0.02)]' 
                    : ''
                }`}
              >
                {/* Visual Line Number */}
                <span className="inline-block w-8 text-[10px] text-zinc-600 select-none mr-2 text-right">
                  {idx + 1}
                </span>

                {/* Highlighted text */}
                <span className={textClass}>
                  {line}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
