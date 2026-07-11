"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore, VmSnapshot } from '../store/useStore';
import { VmHandle } from 'aether-wasm';
import { RotateCcw, Cpu, Layers, Activity, AlertCircle, CheckCircle, SkipForward, SkipBack, ChevronsRight, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Helper to extract parameter and local variable names from source code
function getLocalNamesForFunction(source: string, funcName: string): string[] {
  try {
    const regex = new RegExp(`(?:int|void|char|float|double|long)\\s+${funcName}\\s*\\(([^)]*)\\)\\s*\\{`, 'g');
    const match = regex.exec(source);
    if (!match) return [];

    const paramsStr = match[1];
    const names: string[] = [];

    // Parse parameters
    if (paramsStr.trim()) {
      const params = paramsStr.split(',');
      for (const p of params) {
        const parts = p.trim().split(/\s+/);
        const name = parts[parts.length - 1].replace(/[*]/g, '').trim();
        if (name) {
          names.push(name);
        }
      }
    }

    // Parse local variables inside body (approximate using regex)
    const startIdx = match.index + match[0].length - 1;
    let braceCount = 1;
    let endIdx = startIdx + 1;
    while (braceCount > 0 && endIdx < source.length) {
      if (source[endIdx] === '{') braceCount++;
      else if (source[endIdx] === '}') braceCount--;
      endIdx++;
    }
    const body = source.substring(startIdx + 1, endIdx - 1);

    const declRegex = /(?:int|char|float|double|long)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*=\s*[^;]+)?;/g;
    let declMatch;
    while ((declMatch = declRegex.exec(body)) !== null) {
      const varName = declMatch[1].trim();
      if (!names.includes(varName)) {
        names.push(varName);
      }
    }

    return names;
  } catch (e) {
    console.error("Failed to parse names for:", funcName, e);
    return [];
  }
}

export default function ExecutionPanel() {
  const {
    source,
    compileResult,
    isWasmReady,
    isCompiling,
    activeSnapshot,
    setActiveSnapshot,
    setHighlightedSpan,
    executionTargetOffset,
    setExecutionTargetOffset,
  } = useStore();

  const vmRef = useRef<VmHandle | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [trapError, setTrapError] = useState<string | null>(null);
  const [historyCount, setHistoryCount] = useState<number>(0);

  // Re-instantiate VM when source code changes or compileResult succeeds
  const resetVm = useCallback(() => {
    if (!isWasmReady || !compileResult?.success) {
      vmRef.current = null;
      setActiveSnapshot(null);
      setExitCode(null);
      setTrapError(null);
      setHistoryCount(0);
      setExecutionTargetOffset(null);
      setHighlightedSpan(null);
      return;
    }

    try {
      const handle = new VmHandle(source);
      vmRef.current = handle;
      // Fetch initial snapshot by stepping once
      const initialSnap = handle.step() as VmSnapshot;
      setActiveSnapshot(initialSnap);
      setExitCode(null);
      setTrapError(null);
      setHistoryCount(0);
      setExecutionTargetOffset(null);
      setHighlightedSpan(null);
    } catch (err: unknown) {
      console.error("Failed to initialize VM:", err);
      setTrapError(err instanceof Error ? err.message : String(err));
      setActiveSnapshot(null);
    }
  }, [isWasmReady, compileResult?.success, source, setActiveSnapshot, setExecutionTargetOffset, setHighlightedSpan]);

  useEffect(() => {
    resetVm();
    return () => {
      vmRef.current = null;
    };
  }, [resetVm]);

  // Sync execution source span with Monaco cross-highlighting
  useEffect(() => {
    if (activeSnapshot?.location) {
      setHighlightedSpan({
        start: activeSnapshot.location.start,
        end: activeSnapshot.location.end,
      });
    } else {
      setHighlightedSpan(null);
    }
    return () => {
      setHighlightedSpan(null);
    };
  }, [activeSnapshot, setHighlightedSpan]);

  const handleStepForward = () => {
    if (!vmRef.current) return;

    try {
      const snap = vmRef.current.step() as VmSnapshot;
      setActiveSnapshot(snap);
      setHistoryCount(c => c + 1);
      setTrapError(null);
    } catch (err: unknown) {
      const errStr = String(err);
      if (errStr.includes("halted") || errStr.includes("completion")) {
        // Try running to completion to get the exit code
        try {
          const result = vmRef.current.run() as { exit_code: number; stdout: string };
          setExitCode(result.exit_code);
          const finalSnap = vmRef.current.step() as VmSnapshot;
          setActiveSnapshot(finalSnap);
        } catch (runErr: unknown) {
          setTrapError(String(runErr));
        }
      } else {
        setTrapError(errStr);
      }
    }
  };

  const handleStepBackward = () => {
    if (!vmRef.current) return;

    try {
      const snap = vmRef.current.rewind(1) as VmSnapshot | null;
      if (snap) {
        setActiveSnapshot(snap);
        setExitCode(null);
        setTrapError(null);
        setHistoryCount(c => Math.max(0, c - 1));
      } else {
        setHistoryCount(0);
      }
    } catch (err: unknown) {
      console.error("Rewind failed:", err);
      setTrapError(String(err));
    }
  };

  const handleRunToCursor = () => {
    if (!vmRef.current || executionTargetOffset === null) return;

    try {
      const snap = vmRef.current.run_to_cursor(executionTargetOffset) as VmSnapshot;
      setActiveSnapshot(snap);
      setHistoryCount(999); // Executed some instructions, enable rewind
      setTrapError(null);

      // If execution halted, retrieve the exit code
      if (snap.call_stack.length === 0) {
        const result = vmRef.current.run() as { exit_code: number; stdout: string };
        setExitCode(result.exit_code);
      }
    } catch (err: unknown) {
      setTrapError(String(err));
    }
  };

  const handleRunToCompletion = () => {
    if (!vmRef.current) return;

    try {
      const result = vmRef.current.run() as { exit_code: number; stdout: string };
      setExitCode(result.exit_code);
      setHistoryCount(999); // Executed some instructions, enable rewind
      setTrapError(null);
      // Retrieve the final snapshot
      const snap = vmRef.current.step() as VmSnapshot;
      setActiveSnapshot(snap);
    } catch (err: unknown) {
      setTrapError(String(err));
    }
  };

  const instructions = compileResult?.vm_bytecode || [];
  const currentPc = activeSnapshot?.pc ?? 0;

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950/20 text-zinc-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/10 flex-shrink-0 gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            VM Execution Monitor
          </span>
        </div>

        {/* Stepping & Execution controls */}
        <div className="flex items-center gap-1.5 bg-zinc-900/40 p-1 rounded-lg border border-zinc-800/65">
          <button
            onClick={resetVm}
            disabled={isCompiling}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 disabled:opacity-30 disabled:pointer-events-none transition-all duration-200"
            title="Reset VM State"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <div className="h-4 w-[1px] bg-zinc-800 self-center mx-0.5" />

          <button
            onClick={handleStepBackward}
            disabled={exitCode !== null || trapError !== null || historyCount === 0 || !vmRef.current}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/5 disabled:opacity-30 disabled:pointer-events-none transition-all duration-200"
            title="Step Backward (Rewind 1 instruction)"
          >
            <SkipBack className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <button
            onClick={handleStepForward}
            disabled={exitCode !== null || trapError !== null || !vmRef.current}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/5 disabled:opacity-30 disabled:pointer-events-none transition-all duration-200"
            title="Step Forward (Execute 1 instruction)"
          >
            <SkipForward className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Step</span>
          </button>

          <button
            onClick={handleRunToCursor}
            disabled={exitCode !== null || trapError !== null || executionTargetOffset === null || !vmRef.current}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-zinc-400 hover:text-amber-400 hover:bg-amber-500/5 disabled:opacity-30 disabled:pointer-events-none transition-all duration-200"
            title={executionTargetOffset !== null ? `Run to Selected Instruction (#${executionTargetOffset})` : "Run to Cursor (Click a source line to set target)"}
          >
            <Target className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">To Cursor</span>
          </button>

          <button
            onClick={handleRunToCompletion}
            disabled={exitCode !== null || trapError !== null || !vmRef.current}
            className="flex items-center gap-2 px-3 py-1 rounded bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-30 disabled:pointer-events-none transition-all duration-200 shadow-sm"
            title="Run to Completion"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Run</span>
          </button>
        </div>
      </div>

      {/* VM Main Panels Layout */}
      <div className="flex-grow min-h-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-zinc-800">
        
        {/* Left: Bytecode Instructions List */}
        <div className="w-full md:w-1/2 flex flex-col min-h-0">
          <div className="px-4 py-1.5 border-b border-zinc-800 bg-zinc-900/10 flex justify-between items-center">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase">Bytecode Instructions</span>
            <span className="text-[10px] font-mono text-zinc-600">PC: {currentPc}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-[2px] bg-zinc-950/20">
            {instructions.map((instr, idx) => {
              const isCurrent = idx === currentPc;
              const isTarget = idx === executionTargetOffset;
              return (
                <div
                  key={idx}
                  className={`px-3 py-1 rounded transition-all flex items-center justify-between gap-3 select-text ${
                    isCurrent 
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-bold shadow-md shadow-emerald-500/2' 
                      : isTarget
                      ? 'bg-amber-500/5 border border-dashed border-amber-500/35 text-amber-300 font-medium'
                      : 'border border-transparent text-zinc-400 hover:bg-zinc-900/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-8 text-[10px] text-right font-semibold select-none ${isCurrent ? 'text-emerald-500' : isTarget ? 'text-amber-400' : 'text-zinc-600'}`}>
                      {idx}
                    </span>
                    <span>{instr.text}</span>
                  </div>
                  {isTarget && !isCurrent && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/15 uppercase">
                      Target
                    </span>
                  )}
                </div>
              );
            })}
            {instructions.length === 0 && (
              <div className="text-zinc-500 text-center py-8">No bytecode generated.</div>
            )}
          </div>
        </div>

        {/* Right: Operand Stack and Call Stack */}
        <div className="w-full md:w-1/2 flex flex-col min-h-0 divide-y divide-zinc-800">
          
          {/* Top Half: Call Stack */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-1.5 border-b border-zinc-800 bg-zinc-900/10 flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-[10px] font-semibold text-zinc-500 uppercase">Call Stack Frame Cards</span>
            </div>
            
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-4 items-center bg-zinc-950/10">
              {activeSnapshot?.call_stack && activeSnapshot.call_stack.length > 0 ? (
                <div className="flex gap-4 items-center">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {activeSnapshot.call_stack.map((frame, idx) => {
                      const varNames = getLocalNamesForFunction(source, frame.func_name);
                      const isTopFrame = idx === activeSnapshot.call_stack.length - 1;

                      return (
                        <motion.div
                          key={`frame-${idx}-${frame.func_name}`}
                          layout
                          initial={{ opacity: 0, x: 50, scale: 0.95 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: 50, scale: 0.95 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className={`w-64 flex-shrink-0 border rounded-xl p-4 bg-zinc-900/30 backdrop-blur-md shadow-lg transition-all ${
                            isTopFrame 
                              ? 'border-indigo-500/30 shadow-indigo-500/5 ring-1 ring-indigo-500/10' 
                              : 'border-zinc-800/80 shadow-black/20'
                          }`}
                        >
                          <div className="flex items-center justify-between border-b border-zinc-850 pb-2 mb-3">
                            <span className="text-xs font-bold text-zinc-200 tracking-tight truncate max-w-[120px]">
                              {frame.func_name}
                            </span>
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                              isTopFrame ? 'bg-indigo-500/15 text-indigo-400' : 'bg-zinc-800 text-zinc-500'
                            }`}>
                              {isTopFrame ? 'Active' : `Frame ${idx}`}
                            </span>
                          </div>

                          {/* Locals list */}
                          <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                            {frame.locals.map((val, localIdx) => {
                              const varName = varNames[localIdx] || `local_${localIdx}`;
                              return (
                                <div key={localIdx} className="flex justify-between items-center text-[10px] font-mono">
                                  <span className="text-zinc-500">{varName}</span>
                                  <span className="text-zinc-300 font-semibold">{val}</span>
                                </div>
                              );
                            })}
                            {frame.locals.length === 0 && (
                              <div className="text-[10px] text-zinc-600 text-center py-2 italic">
                                No local variables
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="flex-1 text-center text-zinc-500 text-xs italic">
                  Call stack empty.
                </div>
              )}
            </div>
          </div>

          {/* Bottom Half: Operand Stack */}
          <div className="flex-grow flex flex-col min-h-0">
            <div className="px-4 py-1.5 border-b border-zinc-800 bg-zinc-900/10 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-violet-400" />
              <span className="text-[10px] font-semibold text-zinc-500 uppercase">Operand Stack (LIFO)</span>
            </div>
            
            <div className="flex-grow overflow-y-auto p-4 bg-zinc-950/20 relative flex flex-col-reverse justify-start min-h-48">
              {activeSnapshot?.operand_stack && activeSnapshot.operand_stack.length > 0 ? (
                <div className="w-full max-w-xs mx-auto space-y-2 py-2">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {activeSnapshot.operand_stack.map((val, idx) => {
                      const isTop = idx === activeSnapshot.operand_stack.length - 1;
                      return (
                        <motion.div
                          key={`operand-${idx}`}
                          layout
                          initial={{ opacity: 0, y: 20, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className={`border rounded-xl px-4 py-2.5 flex justify-between items-center font-mono text-xs shadow-md transition-all ${
                            isTop 
                              ? 'bg-violet-500/10 border-violet-500/30 text-violet-300 font-bold shadow-violet-500/5 ring-1 ring-violet-500/10' 
                              : 'bg-zinc-900/40 border-zinc-850 text-zinc-400'
                          }`}
                        >
                          <span className="text-[10px] text-zinc-500 select-none">
                            [{idx}] {isTop ? 'TOP' : ''}
                          </span>
                          <span>{val}</span>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-xs italic">
                  Operand stack empty.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Footer Status Panel */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-zinc-800 bg-zinc-900/20 flex items-center justify-between text-[11px] font-medium text-zinc-500">
        {exitCode !== null ? (
          <div className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle className="h-3.5 w-3.5" />
            <span>Execution Halts Successfully — Exit Code: <span className="font-mono font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">{exitCode}</span></span>
          </div>
        ) : trapError ? (
          <div className="flex items-center gap-1.5 text-rose-400">
            <AlertCircle className="h-3.5 w-3.5 animate-pulse" />
            <span>VM Trapped: <span className="font-mono text-rose-300 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">{trapError}</span></span>
          </div>
        ) : activeSnapshot ? (
          <span className="text-zinc-400">VM Active & Running</span>
        ) : (
          <span>Waiting for valid compiled program</span>
        )}
      </div>
    </div>
  );
}
