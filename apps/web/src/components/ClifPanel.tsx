"use client";

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useStore } from '../store/useStore';
import { mapClifLineToSourceSpan } from '../utils/clifMapper';
import { Cpu, Terminal, AlignLeft, GitBranch } from 'lucide-react';

// ClifCfg renders an SVG — load client-side only
const ClifCfg = dynamic(() => import('./ClifCfg'), { ssr: false });

// ---------------------------------------------------------------------------
// Empty-state placeholder
// ---------------------------------------------------------------------------
function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="p-4 rounded-full bg-zinc-900 border border-zinc-800 text-indigo-400 mb-4 shadow-inner">
        <Cpu className="h-8 w-8" />
      </div>
      <h3 className="text-sm font-semibold text-zinc-200 mb-1">No CLIF IR</h3>
      <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
        Compile a valid program to generate Cranelift Intermediate Representation.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View-mode toggle button
// ---------------------------------------------------------------------------
interface ViewToggleProps {
  showCfg: boolean;
  onToggle: (v: boolean) => void;
}
function ViewToggle({ showCfg, onToggle }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
      <button
        onClick={() => onToggle(false)}
        title="Text view"
        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
          !showCfg
            ? 'bg-zinc-700 text-zinc-100 shadow-sm'
            : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <AlignLeft className="h-3 w-3" />
        Text
      </button>
      <button
        onClick={() => onToggle(true)}
        title="Control-flow graph view"
        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
          showCfg
            ? 'bg-zinc-700 text-zinc-100 shadow-sm'
            : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <GitBranch className="h-3 w-3" />
        CFG
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function ClifPanel() {
  const { compileResult, source, setHighlightedSpan } = useStore();

  const [selectedFuncIdx, setSelectedFuncIdx] = useState(0);
  const [hoveredLineIdx,  setHoveredLineIdx]  = useState<number | null>(null);
  const [showCfg,         setShowCfg]         = useState(false);

  // ---- Guard: no CLIF data ---------------------------------------------------
  if (!compileResult?.clif?.length) {
    return <EmptyState />;
  }

  const clifList   = compileResult.clif;
  const currentFunc = clifList[Math.min(selectedFuncIdx, clifList.length - 1)];
  const lines      = currentFunc.clif.split('\n');

  // ---- Hover handlers (text view only) --------------------------------------
  const handleLineEnter = (lineText: string, idx: number) => {
    setHoveredLineIdx(idx);
    const span = mapClifLineToSourceSpan(lineText, source, currentFunc.start, currentFunc.end);
    if (span) setHighlightedSpan(span);
  };
  const handleLineLeave = () => {
    setHoveredLineIdx(null);
    setHighlightedSpan(null);
  };

  // ---- Shared header --------------------------------------------------------
  const header = (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/10 flex-shrink-0 gap-3">
      {/* Left: icon + title */}
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-indigo-400 flex-shrink-0" />
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Cranelift IR
        </span>
      </div>

      {/* Centre: function selector (only when > 1 function) */}
      {clifList.length > 1 && (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase whitespace-nowrap">
            fn:
          </span>
          <select
            value={selectedFuncIdx}
            onChange={(e) => {
              setSelectedFuncIdx(Number(e.target.value));
              setShowCfg(false);
            }}
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-xs text-zinc-300 font-sans focus:outline-none focus:border-indigo-500/50 truncate"
          >
            {clifList.map((f, idx) => (
              <option key={f.func_name} value={idx}>
                {f.func_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Right: Text / CFG toggle */}
      <ViewToggle showCfg={showCfg} onToggle={setShowCfg} />
    </div>
  );

  // ---- CFG view -------------------------------------------------------------
  if (showCfg) {
    return (
      <div className="flex flex-col h-full w-full bg-zinc-950/20 text-zinc-300">
        {header}
        <div className="flex-1 min-h-0">
          <ClifCfg clifText={currentFunc.clif} />
        </div>
      </div>
    );
  }

  // ---- Text view ------------------------------------------------------------
  return (
    <div className="flex flex-col h-full w-full bg-zinc-950/20 text-zinc-300">
      {header}

      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed selection:bg-indigo-500/20">
        <div className="min-w-max space-y-[2px]">
          {lines.map((line, idx) => {
            const trimmed = line.trim();
            // Skip trailing empty line
            if (!trimmed && idx === lines.length - 1) return null;

            // Syntax highlighting
            let textClass = 'text-zinc-400';
            if (trimmed.startsWith('function')) {
              textClass = 'text-indigo-400 font-bold';
            } else if (/^block\d+/.test(trimmed) || trimmed.endsWith(':')) {
              textClass = 'text-amber-500 font-semibold';
            } else if (trimmed.startsWith('jump') || trimmed.startsWith('brz') || trimmed.startsWith('brnz')) {
              textClass = 'text-purple-400';
            } else if (trimmed.startsWith('return')) {
              textClass = 'text-rose-400 font-medium';
            } else if (trimmed.includes('=')) {
              textClass = 'text-zinc-300';
            }

            const isHovered = hoveredLineIdx === idx;

            return (
              <div
                key={idx}
                onMouseEnter={() => handleLineEnter(line, idx)}
                onMouseLeave={handleLineLeave}
                className={`px-3 py-0.5 rounded transition-all cursor-pointer ${
                  isHovered ? 'bg-indigo-500/10 text-zinc-100' : ''
                }`}
              >
                <span className="inline-block w-8 text-[10px] text-zinc-600 select-none mr-2 text-right">
                  {idx + 1}
                </span>
                <span className={textClass}>{line}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
