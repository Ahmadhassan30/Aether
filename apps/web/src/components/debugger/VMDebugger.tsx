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
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_340px] border-t border-sky-200/10 bg-slate-950/20">
      <div className="min-h-0 overflow-auto p-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="font-mono text-sm text-slate-500">{pcLabel}</div>
          <div className="flex gap-2">
            <button onClick={reset} className="rounded-full border border-sky-200/10 bg-slate-950/45 px-4 py-2 text-xs text-slate-300 shadow-sm backdrop-blur hover:bg-slate-900/60">Reset</button>
            <button onClick={rewind} className="rounded-full border border-sky-200/10 bg-slate-950/45 px-4 py-2 text-xs text-slate-300 shadow-sm backdrop-blur hover:bg-slate-900/60">Back</button>
            <button onClick={step} className="rounded-full border border-sky-300/20 bg-sky-400/12 px-4 py-2 text-xs text-sky-100 shadow-sm backdrop-blur hover:bg-sky-400/18">Step</button>
            <button onClick={run} className="rounded-full border border-sky-300/20 bg-sky-300/90 px-4 py-2 text-xs text-slate-950 shadow-sm backdrop-blur hover:bg-sky-200">Run</button>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-sky-200/10 bg-slate-950/42 shadow-2xl shadow-black/20 backdrop-blur">
          {bytecode.map((inst) => {
            const active = inst.pc === activePc;
            return (
              <button
                key={`${inst.pc}-${inst.text}`}
                onMouseEnter={() => setHighlightedSpan(inst.span ?? null)}
                onMouseLeave={() => setHighlightedSpan(vmSnapshot?.span ?? null)}
                className={`grid w-full grid-cols-[56px_96px_minmax(0,1fr)] gap-3 border-b border-sky-200/10 px-4 py-3 text-left font-mono text-xs transition last:border-b-0 ${
                  active ? 'bg-sky-400/12 text-sky-100' : 'text-slate-500 hover:bg-white/[0.045]'
                }`}
              >
                <span className="text-slate-600">{inst.pc}</span>
                <span className={active ? 'text-sky-100' : 'text-slate-300'}>{inst.opcode}</span>
                <span className="truncate">{inst.text}</span>
              </button>
            );
          })}
        </div>
      </div>
      <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)_120px] gap-3 border-l border-sky-200/10 p-5">
        <div className="rounded-2xl border border-sky-200/10 bg-slate-950/42 p-4 shadow-xl shadow-black/20 backdrop-blur">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Runtime</div>
          <div className="mt-2 font-mono text-xs text-slate-300">exit: {exitCode ?? '-'}</div>
          {runtimeError && <div className="mt-2 text-xs text-rose-300">{runtimeError}</div>}
        </div>
        <StackViewer />
        <MemoryViewer />
        <Timeline />
      </aside>
    </div>
  );
}
