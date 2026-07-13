"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronsRight, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
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
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_360px] border-t border-zinc-800 bg-zinc-950">
      <div className="min-h-0 overflow-auto p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="font-mono text-sm text-cyan-200">{pcLabel}</div>
          <div className="flex gap-2">
            <button onClick={reset} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200 hover:border-zinc-600"><RotateCcw className="h-4 w-4" /></button>
            <button onClick={rewind} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200 hover:border-zinc-600"><SkipBack className="h-4 w-4" /></button>
            <button onClick={step} className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-cyan-100 hover:bg-cyan-400/15"><SkipForward className="h-4 w-4" /></button>
            <button onClick={run} className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-emerald-100 hover:bg-emerald-400/15"><ChevronsRight className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="overflow-hidden rounded-md border border-zinc-800">
          {bytecode.map((inst) => {
            const active = inst.pc === activePc;
            return (
              <button
                key={`${inst.pc}-${inst.text}`}
                onMouseEnter={() => setHighlightedSpan(inst.span ?? null)}
                onMouseLeave={() => setHighlightedSpan(vmSnapshot?.span ?? null)}
                className={`grid w-full grid-cols-[56px_96px_minmax(0,1fr)] gap-3 border-b border-zinc-900 px-3 py-2 text-left font-mono text-xs transition last:border-b-0 ${
                  active ? 'bg-cyan-400/10 text-cyan-100' : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-900'
                }`}
              >
                <span className="text-zinc-600">{inst.pc}</span>
                <span className={active ? 'text-cyan-200' : 'text-zinc-300'}>{inst.opcode}</span>
                <span className="truncate">{inst.text}</span>
              </button>
            );
          })}
        </div>
      </div>
      <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)_120px] gap-3 border-l border-zinc-800 p-4">
        <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Runtime</div>
          <div className="mt-2 font-mono text-xs text-zinc-300">exit: {exitCode ?? '-'}</div>
          {runtimeError && <div className="mt-2 text-xs text-rose-300">{runtimeError}</div>}
        </div>
        <StackViewer />
        <MemoryViewer />
        <Timeline />
      </aside>
    </div>
  );
}
