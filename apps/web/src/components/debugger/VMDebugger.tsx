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

  const pcLabel = useMemo(() => (activePc >= 0 ? `PC ${activePc}` : 'PC -'), [activePc]);

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(280px,1fr)_240px] bg-[var(--workspace)] max-[760px]:grid-cols-1">
      <div className="min-h-0 overflow-auto p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono text-[10px] text-[var(--muted)]">{pcLabel}</div>
          <div className="flex gap-1">
            <button onClick={reset} className="rounded-[3px] border border-[var(--hairline)] bg-[var(--canvas)] px-2.5 py-1.5 text-[10px] text-[var(--body)] transition hover:bg-[var(--canvas-raised)]">Reset</button>
            <button onClick={rewind} className="rounded-[3px] border border-[var(--hairline)] bg-[var(--canvas)] px-2.5 py-1.5 text-[10px] text-[var(--body)] transition hover:bg-[var(--canvas-raised)]">Back</button>
            <button onClick={step} className="rounded-[3px] border border-[#526788] bg-[#29313f] px-2.5 py-1.5 text-[10px] text-[#c3d4f7] transition hover:bg-[#303b4c]">Step</button>
            <button onClick={run} className="rounded-[3px] bg-[var(--ink)] px-2.5 py-1.5 text-[10px] text-[var(--canvas)] transition hover:bg-white">Run</button>
          </div>
        </div>
        <div className="overflow-hidden rounded-[4px] border border-[var(--hairline)] bg-[var(--canvas)]">
          {bytecode.map((inst) => {
            const active = inst.pc === activePc;
            return (
              <button
                key={`${inst.pc}-${inst.text}`}
                onMouseEnter={() => setHighlightedSpan(inst.span ?? null)}
                onMouseLeave={() => setHighlightedSpan(vmSnapshot?.span ?? null)}
                className={`grid w-full grid-cols-[36px_80px_minmax(0,1fr)] gap-2 border-b border-[var(--hairline)] px-3 py-2 text-left font-mono text-[10px] transition last:border-b-0 ${
                  active ? 'bg-[#8fb4ff14] text-[#c3d4f7]' : 'text-[var(--muted)] hover:bg-[var(--canvas-soft)]'
                }`}
              >
                <span className="text-[#6f6962]">{inst.pc}</span>
                <span className={active ? 'text-[#c3d4f7]' : 'text-[var(--body-strong)]'}>{inst.opcode}</span>
                <span className="truncate">{inst.text}</span>
              </button>
            );
          })}
        </div>
      </div>
      <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)_90px] gap-2 border-l border-[var(--hairline)] p-3 max-[760px]:hidden">
        <div className="rounded-[4px] border border-[var(--hairline)] bg-[var(--canvas)] p-3">
          <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--muted)]">Runtime</div>
          <div className="mt-1.5 font-mono text-[10px] text-[var(--body-strong)]">exit: {exitCode ?? '-'}</div>
          {runtimeError && <div className="mt-1.5 text-[10px] text-[#e9a2a8]">{runtimeError}</div>}
        </div>
        <StackViewer />
        <MemoryViewer />
        <Timeline />
      </aside>
    </div>
  );
}
