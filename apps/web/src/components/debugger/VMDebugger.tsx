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
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,1fr)_240px] max-[760px]:grid-cols-1">
      <div className="min-h-0 flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        {/* Top: Bytecode list with controls */}
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Debugger controls bar */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="font-mono text-[13px] font-semibold text-[var(--signal)]">{pcLabel}</div>
            <div className="flex flex-wrap justify-end gap-1 max-[760px]:w-full max-[760px]:justify-start">
              <button onClick={reset} title="Reset VM" className="rounded-[var(--rounded-control)] border border-[var(--hairline)] bg-[var(--canvas)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--body)] transition hover:bg-[var(--canvas-raised)]">Reset</button>
              <button onClick={rewind} title="Shift+F10" className="rounded-[var(--rounded-control)] border border-[var(--hairline)] bg-[var(--canvas)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--body)] transition hover:bg-[var(--canvas-raised)]">Rewind 1</button>
              <button onClick={step} title="F10" className="rounded-[var(--rounded-control)] border border-[#526788] bg-[#29313f] px-3.5 py-1.5 text-[13px] font-medium text-[#c3d4f7] transition hover:bg-[#303b4c]">Step forward</button>
              <button onClick={run} title="F5" className="rounded-[var(--rounded-control)] bg-[var(--ink)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--canvas)] transition hover:bg-white">Run</button>
            </div>
          </div>
          {/* Bytecode list container */}
          <div className="flex-1 min-h-0 overflow-y-auto rounded-[var(--rounded-card)] border border-[var(--hairline)] bg-[var(--canvas)] flex flex-col scrollbar-thin">
            {bytecode.map((inst) => {
              const active = inst.pc === activePc;
              return (
                <button
                  key={`${inst.pc}-${inst.text}`}
                  onMouseEnter={() => setHighlightedSpan(inst.span ?? null)}
                  onMouseLeave={() => setHighlightedSpan(vmSnapshot?.span ?? null)}
                  style={{
                    border: active ? '2px solid var(--signal)' : '1px solid transparent',
                    boxShadow: active ? '0 0 12px rgba(120, 166, 194, 0.25)' : 'none',
                    opacity: active ? 1 : 0.45,
                    borderRadius: active ? '6px' : '0px',
                    zIndex: active ? 10 : 1,
                    position: 'relative',
                    margin: active ? '2px 0' : '0',
                  }}
                  className={`grid w-full grid-cols-[42px_92px_minmax(0,1fr)_auto] gap-2 border-b border-[var(--hairline)] px-3 py-2.5 text-left font-mono text-[13px] font-normal transition last:border-b-0 ${
                    active ? 'bg-[#8fb4ff14] text-[var(--ink)]' : 'text-[var(--muted)] hover:bg-[var(--canvas-soft)] hover:opacity-100'
                  }`}
                >
                  <span className="text-[#6f6962]">{inst.pc}</span>
                  <span className={active ? 'text-[var(--signal)] font-semibold' : 'text-[var(--body-strong)]'}>{inst.opcode}</span>
                  <span className="truncate">{inst.text}</span>
                  {active && (
                    <span className="relative flex h-2 w-2 items-center justify-center self-center justify-self-end">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--signal)] opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--signal)]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom: Real IDE Console Terminal */}
        <div className="h-[180px] shrink-0 rounded-[var(--rounded-card)] border border-[var(--hairline)] bg-[#07080a] flex flex-col overflow-hidden shadow-2xl">
          {/* Terminal Tabs / Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--hairline)] bg-[rgba(255,255,255,0.02)] select-none">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#ef4444] opacity-80" />
              <span className="h-2 w-2 rounded-full bg-[#f59e0b] opacity-80" />
              <span className="h-2 w-2 rounded-full bg-[#10b981] opacity-80" />
              <span className="font-mono text-[10px] font-[900] text-[var(--body-strong)] ml-2 uppercase tracking-wider">
                Aether Debug Console
              </span>
            </div>
            <div className="font-mono text-[9px] text-[var(--muted)] font-semibold uppercase tracking-wider">stdout · bash</div>
          </div>
          {/* Terminal Content Box */}
          <div className="flex-1 p-4 font-mono text-[12px] text-[#e4e4e7] overflow-y-auto leading-relaxed select-text scrollbar-thin">
            {consoleOutput ? (
              consoleOutput.split('\n').filter(line => line.length > 0).map((line, idx) => (
                <div key={idx} className="flex gap-2.5 items-center">
                  <span className="text-[#9fe870] font-bold select-none">$</span>
                  <span className="text-[var(--body-strong)]">{line}</span>
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
      <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-l border-[var(--hairline)] p-3 max-[760px]:hidden">
        <div className="rounded-[4px] border border-[var(--hairline)] bg-[var(--canvas)] p-3">
          <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">Runtime</div>
          <div className="mt-1.5 font-mono text-[13px] font-medium text-[var(--body-strong)]">exit: {exitCode ?? '-'}</div>
          {runtimeError && <div className="mt-1.5 text-[10px] text-[#e9a2a8]">{runtimeError}</div>}
        </div>
        <StackViewer />
        <MemoryViewer />
      </aside>
      </div>
    </div>
  );
}
