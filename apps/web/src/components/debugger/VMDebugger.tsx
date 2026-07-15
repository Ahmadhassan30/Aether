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
      setConsoleOutput(result.snapshot?.stdout ?? consoleOutput);
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
      <div className="min-h-0 overflow-auto p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono text-[13px] font-semibold text-[var(--signal)]">{pcLabel}</div>
          <div className="flex flex-wrap justify-end gap-1 max-[760px]:w-full max-[760px]:justify-start">
            <button onClick={reset} title="Reset VM" className="rounded-[3px] border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-2 text-[13px] font-medium text-[var(--body)] transition hover:bg-[var(--canvas-raised)]">Reset</button>
            <button onClick={rewind} title="Shift+F10" className="rounded-[3px] border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-2 text-[13px] font-medium text-[var(--body)] transition hover:bg-[var(--canvas-raised)]">Rewind 1</button>
            <button onClick={step} title="F10" className="rounded-[3px] border border-[#526788] bg-[#29313f] px-3 py-2 text-[13px] font-medium text-[#c3d4f7] transition hover:bg-[#303b4c]">Step forward</button>
            <button onClick={run} title="F5" className="rounded-[3px] bg-[var(--ink)] px-3 py-2 text-[13px] font-medium text-[var(--canvas)] transition hover:bg-white">Run</button>
          </div>
        </div>
        <div className="overflow-hidden rounded-[4px] border border-[var(--hairline)] bg-[var(--canvas)] flex flex-col">
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
