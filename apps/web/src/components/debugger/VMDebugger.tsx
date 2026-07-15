"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { compilerService } from '../../lib/wasm/compiler';
import { useCompilerStore } from '../../stores/compilerStore';
import MemoryViewer from './MemoryViewer';
import StackViewer from './StackViewer';
import CallStackViewer from './CallStackViewer';
import Timeline from './Timeline';
import {
  Activity,
  Database,
  ListTree,
  Play,
  RotateCcw,
  StepBack,
  StepForward,
  Terminal,
  Trash2,
} from 'lucide-react';

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
  const [sidebarTab, setSidebarTab] = useState<'callstack' | 'stack' | 'memory'>('callstack');

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
    <div className="flex h-full min-h-0 flex-col bg-[#08090b]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-[13px] font-semibold text-zinc-100">VM Debugging</span>
          <span className="font-mono text-[11px] text-zinc-500">{pcLabel}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={reset}
            title="Reset VM"
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={rewind}
            title="Rewind (Shift+F10)"
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
          >
            <StepBack className="h-4 w-4" />
          </button>
          <button
            onClick={step}
            title="Step Forward (F10)"
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-100 transition hover:bg-white/[0.06]"
          >
            <StepForward className="h-4 w-4" />
          </button>
          <button
            onClick={run}
            title="Run VM (F5)"
            className="ml-1 flex h-8 items-center gap-1.5 rounded-md bg-zinc-100 px-3 text-[12px] font-semibold text-zinc-950 transition hover:bg-white"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Run
          </button>
        </div>
      </div>

      <Timeline />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(360px,1fr)_292px] max-[760px]:grid-cols-1">
        <div className="min-h-0 flex-1 flex flex-col gap-3 overflow-hidden p-3">
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="mb-2 flex h-8 shrink-0 items-center justify-between px-1">
              <span className="text-[12px] font-medium text-zinc-300">Bytecode</span>
              <span className="font-mono text-[11px] text-zinc-500">{bytecode.length} instructions</span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-white/[0.06] bg-[#0d0e11] flex flex-col scrollbar-thin">
              {bytecode.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-[12px] text-zinc-500">
                  No VM bytecode instructions generated.
                </div>
              ) : (
                bytecode.map((inst) => {
                  const active = inst.pc === activePc;

                  return (
                    <button
                      key={`${inst.pc}-${inst.text}`}
                      onMouseEnter={() => setHighlightedSpan(inst.span ?? null)}
                      onMouseLeave={() => setHighlightedSpan(vmSnapshot?.span ?? null)}
                      className={`grid w-full grid-cols-[56px_104px_minmax(0,1fr)] items-center gap-3 border-b border-white/[0.04] px-4 py-2 text-left font-mono text-[12px] transition last:border-b-0 outline-none ${
                        active 
                          ? 'bg-white/[0.055] text-white shadow-[inset_2px_0_0_#a1a1aa]' 
                          : 'text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-200'
                      }`}
                    >
                      <span className="text-zinc-600">{inst.pc.toString().padStart(4, '0')}</span>
                      <span className={active ? 'font-semibold text-zinc-100' : 'font-medium text-zinc-400'}>{inst.opcode}</span>
                      <span className="truncate text-zinc-400">{inst.text}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="h-[156px] shrink-0 rounded-lg border border-white/[0.06] bg-[#0d0e11] flex flex-col overflow-hidden">
            <div className="flex h-9 items-center justify-between border-b border-white/[0.05] px-3 select-none">
              <div className="flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 text-zinc-500" />
                <span className="text-[12px] font-medium text-zinc-300">Console</span>
              </div>
              <button
                onClick={() => setConsoleOutput('')}
                title="Clear Console"
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-relaxed text-zinc-300 select-text scrollbar-thin">
              {consoleOutput ? (
                consoleOutput.split('\n').filter(line => line.length > 0).map((line, idx) => (
                  <div key={idx} className="flex gap-2 py-0.5">
                    <span className="select-none text-zinc-600">&gt;</span>
                    <span>{line}</span>
                  </div>
                ))
              ) : (
                <div className="text-zinc-500">No program output yet.</div>
              )}
            </div>
          </div>
        </div>
        
        <aside className="flex h-full flex-col gap-3 overflow-hidden border-l border-white/[0.06] bg-[#0b0c0f] p-3 max-[760px]:hidden">
          <div className="shrink-0 rounded-lg border border-white/[0.06] bg-[#0f1013] p-3">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-medium text-zinc-300">
              <Activity className="h-3.5 w-3.5 text-zinc-500" />
              Runtime
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-zinc-500">Exit code</span>
              <span className="font-mono text-zinc-200">
                {exitCode !== null ? exitCode : 'running'}
              </span>
            </div>
            {runtimeError && (
              <div className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 p-2 text-[11px] leading-relaxed text-red-200 break-words">
                {runtimeError}
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/[0.06] bg-[#0f1013] p-1 shrink-0">
            <button
              title="Call Stack"
              onClick={() => setSidebarTab('callstack')}
              className={`flex h-8 items-center justify-center rounded-md transition ${
                sidebarTab === 'callstack'
                  ? 'bg-white/[0.08] text-zinc-100'
                  : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
              }`}
            >
              <ListTree className="h-4 w-4" />
            </button>
            <button
              title="VM Stack"
              onClick={() => setSidebarTab('stack')}
              className={`flex h-8 items-center justify-center rounded-md transition ${
                sidebarTab === 'stack'
                  ? 'bg-white/[0.08] text-zinc-100'
                  : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
              }`}
            >
              <Activity className="h-4 w-4" />
            </button>
            <button
              title="Memory"
              onClick={() => setSidebarTab('memory')}
              className={`flex h-8 items-center justify-center rounded-md transition ${
                sidebarTab === 'memory'
                  ? 'bg-white/[0.08] text-zinc-100'
                  : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
              }`}
            >
              <Database className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-lg border border-white/[0.06] bg-[#0f1013]">
            {sidebarTab === 'callstack' && <CallStackViewer />}
            {sidebarTab === 'stack' && <StackViewer />}
            {sidebarTab === 'memory' && <MemoryViewer />}
          </div>
        </aside>
      </div>
    </div>
  );
}
