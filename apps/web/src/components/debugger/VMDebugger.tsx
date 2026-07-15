"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { compilerService } from '../../lib/wasm/compiler';
import { useCompilerStore } from '../../stores/compilerStore';
import MemoryViewer from './MemoryViewer';
import StackViewer from './StackViewer';
import Timeline from './Timeline';

export default function VMDebugger() {
  const {
    source,
    artifacts,
    vmSnapshot,
    resetVmTimeline,
    pushVmSnapshot,
    setHighlightedSpan,
    consoleOutput,
    setConsoleOutput,
  } = useCompilerStore();
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const bytecode = artifacts?.bytecode ?? [];
  const activePc = vmSnapshot?.pc ?? -1;

  const reset = React.useCallback(() => {
    setRuntimeError(null);
    setExitCode(null);
    try {
      const snapshot = compilerService.resetVM(source);
      resetVmTimeline(snapshot);
      setHighlightedSpan(snapshot?.span ?? null);
    } catch (error) {
      resetVmTimeline(null);
      setRuntimeError(error instanceof Error ? error.message : String(error));
    }
  }, [resetVmTimeline, setHighlightedSpan, source]);

  useEffect(() => {
    if (artifacts?.success) reset();
  }, [artifacts?.success, reset]);

  const step = () => {
    try {
      const snapshot = compilerService.stepVM();
      if (snapshot) {
        pushVmSnapshot(snapshot);
        setHighlightedSpan(snapshot.span);
      }
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    }
  };

  const rewind = () => {
    try {
      const snapshot = compilerService.rewindVM(1);
      if (snapshot) {
        pushVmSnapshot(snapshot);
        setHighlightedSpan(snapshot.span);
      }
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    }
  };

  const run = () => {
    try {
      const result = compilerService.runVM();
      setExitCode(result.exitCode);
      if (result.snapshot) pushVmSnapshot(result.snapshot);
      setConsoleOutput(result.stdout || result.snapshot?.stdout || consoleOutput);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    const handleDebuggerKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('textarea, input, select, [contenteditable="true"]')) return;
      if (event.key === 'F10' && event.shiftKey) {
        event.preventDefault();
        rewind();
      } else if (event.key === 'F10') {
        event.preventDefault();
        step();
      } else if (event.key === 'F5') {
        event.preventDefault();
        run();
      }
    };
    window.addEventListener('keydown', handleDebuggerKeys);
    return () => window.removeEventListener('keydown', handleDebuggerKeys);
  });

  const pcLabel = useMemo(() => (activePc >= 0 ? `PC ${activePc}` : 'PC -'), [activePc]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--workspace)]">
      <Timeline />
      
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,1fr)_280px] max-[760px]:grid-cols-1">
        <div className="min-h-0 flex-1 flex flex-col p-4 gap-4 overflow-hidden">
          {/* Top: Bytecode list with controls */}
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Debugger controls bar */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-[#0f1115] border border-[var(--hairline)] rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#60A5FA] animate-pulse" />
                <div className="font-mono text-[12px] font-bold text-[#60A5FA] tracking-widest">{pcLabel}</div>
              </div>
              
              <div className="flex flex-wrap justify-end gap-1.5">
                <button 
                  onClick={reset} 
                  title="Reset VM" 
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] bg-zinc-900/60 px-3 py-1.5 text-[12px] font-semibold text-zinc-300 hover:text-white transition hover:bg-zinc-800 hover:border-zinc-700"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  <span>Reset</span>
                </button>
                
                <button 
                  onClick={rewind} 
                  title="Rewind (Shift+F10)" 
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] bg-zinc-900/60 px-3 py-1.5 text-[12px] font-semibold text-zinc-300 hover:text-white transition hover:bg-zinc-800 hover:border-zinc-700"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="19 20 9 12 19 4 19 20" />
                    <line x1="5" y1="19" x2="5" y2="5" />
                  </svg>
                  <span>Rewind</span>
                </button>
                
                <button 
                  onClick={step} 
                  title="Step Forward (F10)" 
                  className="flex items-center gap-1.5 rounded-lg border border-[#2b3547] bg-[#1e2530] px-3.5 py-1.5 text-[12px] font-semibold text-[#60a5fa] hover:text-[#93c5fd] hover:bg-[#252f3f] transition hover:border-[#384860]"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 4 15 12 5 20 5 4" />
                    <line x1="19" y1="5" x2="19" y2="19" />
                  </svg>
                  <span>Step</span>
                </button>
                
                <button 
                  onClick={run} 
                  title="Run VM (F5)" 
                  className="flex items-center gap-1.5 rounded-lg bg-[#10b981] hover:bg-[#059669] px-3.5 py-1.5 text-[12px] font-semibold text-white transition shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
                  </svg>
                  <span>Run</span>
                </button>
              </div>
            </div>

            {/* Bytecode list container */}
            <div className="flex-1 min-h-0 overflow-y-auto rounded-[var(--rounded-card)] border border-[var(--hairline)] bg-[#0c0d10] flex flex-col scrollbar-thin">
              {bytecode.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-[var(--muted)] font-mono text-xs opacity-50 py-12">
                  No VM bytecode instructions generated.
                </div>
              ) : (
                bytecode.map((inst) => {
                  const active = inst.pc === activePc;
                  // opcodes syntax classifications
                  const isControl = ['JUMP', 'JUMPIF', 'CALL', 'RET', 'ENTER', 'HALT', 'TRAP', 'JUMP IFFALSE', 'JUMP IFTRUE'].some(c => inst.opcode.toUpperCase().includes(c));
                  const isStack = ['PUSH', 'POP', 'DUP', 'SWAP', 'STORE', 'LOAD'].some(s => inst.opcode.toUpperCase().includes(s));
                  
                  let badgeColor = 'text-sky-400';
                  if (isControl) badgeColor = 'text-amber-400';
                  else if (isStack) badgeColor = 'text-purple-400';

                  return (
                    <button
                      key={`${inst.pc}-${inst.text}`}
                      onMouseEnter={() => setHighlightedSpan(inst.span ?? null)}
                      onMouseLeave={() => setHighlightedSpan(vmSnapshot?.span ?? null)}
                      className={`grid w-full grid-cols-[48px_110px_minmax(0,1fr)_auto] gap-3 border-b border-[var(--hairline)] px-4 py-2.5 text-left font-mono text-[13px] font-normal transition last:border-b-0 outline-none ${
                        active 
                          ? 'bg-[#181d26] text-white border-l-[3px] border-l-[#60A5FA] pl-[13px]' 
                          : 'text-[var(--muted)] hover:bg-zinc-900/40 hover:text-white'
                      }`}
                    >
                      <span className="text-zinc-600 text-xs pt-0.5">{inst.pc}</span>
                      <span className={`font-semibold ${active ? 'text-[#60A5FA]' : badgeColor}`}>{inst.opcode}</span>
                      <span className="truncate text-zinc-300">{inst.text}</span>
                      {active && (
                        <span className="relative flex h-2 w-2 items-center justify-center self-center justify-self-end mr-1">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#60A5FA] opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#60A5FA]" />
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Bottom: Real IDE Console Terminal */}
          <div className="h-[180px] shrink-0 rounded-[var(--rounded-card)] border border-[var(--hairline)] bg-[#07080a] flex flex-col overflow-hidden shadow-2xl">
            {/* Terminal Tabs / Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--hairline)] bg-[rgba(255,255,255,0.02)] select-none">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444] opacity-80" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b] opacity-80" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#10b981] opacity-80" />
                <span className="font-mono text-[10px] font-bold text-zinc-300 ml-2 uppercase tracking-wider">
                  Aether Debug Console
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setConsoleOutput('')}
                  title="Clear Console"
                  className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded hover:bg-zinc-800"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
                <div className="font-mono text-[9px] text-[var(--muted)] font-semibold uppercase tracking-wider">stdout · bash</div>
              </div>
            </div>
            {/* Terminal Content Box */}
            <div className="flex-1 p-4 font-mono text-[12px] text-[#e4e4e7] overflow-y-auto leading-relaxed select-text scrollbar-thin">
              {consoleOutput ? (
                consoleOutput.split('\n').filter(line => line.length > 0).map((line, idx) => (
                  <div key={idx} className="flex gap-2.5 items-center py-0.5">
                    <span className="text-[#9fe870] font-bold select-none">$</span>
                    <span className="text-zinc-200">{line}</span>
                  </div>
                ))
              ) : (
                <div className="text-[var(--muted)] italic">
                  $ No program output yet.
                  <br />
                  $ Tip: Run (F5) or Step (F10) the program to print variables and runtime logs.
                </div>
              )}
            </div>
          </div>
        </div>
        
        <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1.2fr)_minmax(0,1.2fr)] gap-3 border-l border-[var(--hairline)] p-4 max-[760px]:hidden bg-[#090b0e]">
          {/* Runtime stats */}
          <div className="rounded-xl border border-[var(--hairline)] bg-[#0d0f12] p-4 shadow-sm">
            <div className="text-[11px] font-mono font-bold uppercase tracking-[0.08em] text-[var(--muted)] flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
              <span>Runtime Engine</span>
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-xs text-zinc-400">Exit Code:</span>
              <span className="font-mono text-sm font-semibold text-white bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">{exitCode !== null ? exitCode : 'running'}</span>
            </div>
            {runtimeError && (
              <div className="mt-2 rounded bg-red-950/20 border border-red-900/30 p-2 text-[10px] text-[#e9a2a8] font-mono leading-relaxed break-words">
                [TRAP] {runtimeError}
              </div>
            )}
          </div>
          
          <StackViewer />
          <MemoryViewer />
        </aside>
      </div>
    </div>
  );
}
