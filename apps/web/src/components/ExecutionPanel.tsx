"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore, VmSnapshot, TrapInfo } from '../store/useStore';
import { VmHandle } from 'aether-wasm';
import { RotateCcw, Cpu, Layers, Activity, AlertCircle, CheckCircle, SkipForward, SkipBack, ChevronsRight, Target, Terminal, Zap } from 'lucide-react';
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
    consoleOutput,
    setConsoleOutput,
    trapInfo,
    setTrapInfo,
  } = useStore();

  const vmRef = useRef<VmHandle | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [historyCount, setHistoryCount] = useState<number>(0);
  const consoleEndRef = useRef<HTMLDivElement | null>(null);

  // Re-instantiate VM when source code changes or compileResult succeeds
  const resetVm = useCallback(() => {
    if (!isWasmReady || !compileResult?.success) {
      vmRef.current = null;
      setActiveSnapshot(null);
      setExitCode(null);
      setTrapInfo(null);
      setHistoryCount(0);
      setExecutionTargetOffset(null);
      setHighlightedSpan(null);
      setConsoleOutput('');
      return;
    }

    try {
      const handle = new VmHandle(source);
      vmRef.current = handle;
      // Fetch initial snapshot by stepping once
      const initialSnap = handle.step() as VmSnapshot;
      setActiveSnapshot(initialSnap);
      setConsoleOutput(initialSnap.stdout_full ?? '');
      setExitCode(null);
      setTrapInfo(null);
      setHistoryCount(0);
      setExecutionTargetOffset(null);
      setHighlightedSpan(null);
    } catch (err: unknown) {
      console.error("Failed to initialize VM:", err);
      const trap = parseTrap(err, null);
      setTrapInfo(trap);
      setActiveSnapshot(null);
    }
  }, [isWasmReady, compileResult?.success, source, setActiveSnapshot, setExecutionTargetOffset, setHighlightedSpan, setConsoleOutput, setTrapInfo]);

  useEffect(() => {
    resetVm();
    return () => {
      vmRef.current = null;
    };
  }, [resetVm]);

  // Sync execution source span with Monaco cross-highlighting
  useEffect(() => {
    if (trapInfo?.span) {
      // When trapped, keep the trap span highlighted
      setHighlightedSpan(trapInfo.span);
    } else if (activeSnapshot?.location) {
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
  }, [activeSnapshot, trapInfo, setHighlightedSpan]);

  // Auto-scroll console to bottom whenever output changes
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleOutput]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Parse the structured TrapSnapshot thrown by the WASM layer into TrapInfo.
   *
   * The WASM layer throws a JS object { kind, ...fields } serialized via
   * serde_wasm_bindgen.  We extract `kind`, `index`, and `length` directly
   * from that object if available.  The `span` comes from the snapshot that
   * was active at the time of the trap.
   */
  function parseTrap(
    err: unknown,
    lastSnap: VmSnapshot | null
  ): TrapInfo {
    const span = lastSnap?.location ?? null;

    // WASM errors are thrown as plain objects from serde_wasm_bindgen
    if (err !== null && typeof err === 'object') {
      const obj = err as Record<string, unknown>;
      if (typeof obj['kind'] === 'string') {
        return {
          kind: obj['kind'] as string,
          index: typeof obj['index'] === 'number' ? (obj['index'] as number) : undefined,
          length: typeof obj['length'] === 'number' ? (obj['length'] as number) : undefined,
          span,
        };
      }
    }

    // Fallback: treat as a generic unknown trap
    return { kind: 'Unknown', span };
  }

  // ---------------------------------------------------------------------------
  // Transport handlers
  // ---------------------------------------------------------------------------

  const handleStepForward = () => {
    if (!vmRef.current) return;

    try {
      const snap = vmRef.current.step() as VmSnapshot;
      setActiveSnapshot(snap);
      setConsoleOutput(snap.stdout_full ?? '');
      setHistoryCount(c => c + 1);
      setTrapInfo(null);
    } catch (err: unknown) {
      // Trap: capture structured trap info using the last known snapshot
      const trap = parseTrap(err, activeSnapshot);
      setTrapInfo(trap);
      // Highlight the faulting source span in Monaco
      if (trap.span) {
        setHighlightedSpan(trap.span);
      }
    }
  };

  const handleStepBackward = () => {
    if (!vmRef.current) return;

    try {
      const snap = vmRef.current.rewind(1) as VmSnapshot | null;
      if (snap) {
        setActiveSnapshot(snap);
        setConsoleOutput(snap.stdout_full ?? '');
        setExitCode(null);
        setTrapInfo(null);
        setHistoryCount(c => Math.max(0, c - 1));
      } else {
        setHistoryCount(0);
      }
    } catch (err: unknown) {
      console.error('Rewind failed:', err);
      setTrapInfo(parseTrap(err, activeSnapshot));
    }
  };

  const handleRunToCursor = () => {
    if (!vmRef.current || executionTargetOffset === null) return;

    try {
      const snap = vmRef.current.run_to_cursor(executionTargetOffset) as VmSnapshot;
      setActiveSnapshot(snap);
      setConsoleOutput(snap.stdout_full ?? '');
      setHistoryCount(999);
      setTrapInfo(null);

      // If execution halted (call stack empty), retrieve exit code
      if (snap.call_stack.length === 0) {
        try {
          const result = vmRef.current.run() as { exit_code: number; stdout: string };
          setExitCode(result.exit_code);
          setConsoleOutput(result.stdout);
        } catch (_runErr) {
          // already halted — ignore
        }
      }
    } catch (err: unknown) {
      const trap = parseTrap(err, activeSnapshot);
      setTrapInfo(trap);
      if (trap.span) setHighlightedSpan(trap.span);
    }
  };

  const handleRunToCompletion = () => {
    if (!vmRef.current) return;

    try {
      const result = vmRef.current.run() as { exit_code: number; stdout: string };
      setExitCode(result.exit_code);
      setConsoleOutput(result.stdout);
      setHistoryCount(999);
      setTrapInfo(null);
      // Retrieve the final snapshot
      try {
        const snap = vmRef.current.step() as VmSnapshot;
        setActiveSnapshot(snap);
      } catch (_) {
        // halted — no more steps
      }
    } catch (err: unknown) {
      const trap = parseTrap(err, activeSnapshot);
      setTrapInfo(trap);
      if (trap.span) setHighlightedSpan(trap.span);
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
            disabled={exitCode !== null || !!trapInfo || historyCount === 0 || !vmRef.current}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/5 disabled:opacity-30 disabled:pointer-events-none transition-all duration-200"
            title="Step Backward (Rewind 1 instruction)"
          >
            <SkipBack className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <button
            onClick={handleStepForward}
            disabled={exitCode !== null || !!trapInfo || !vmRef.current}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/5 disabled:opacity-30 disabled:pointer-events-none transition-all duration-200"
            title="Step Forward (Execute 1 instruction)"
          >
            <SkipForward className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Step</span>
          </button>

          <button
            onClick={handleRunToCursor}
            disabled={exitCode !== null || !!trapInfo || executionTargetOffset === null || !vmRef.current}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-zinc-400 hover:text-amber-400 hover:bg-amber-500/5 disabled:opacity-30 disabled:pointer-events-none transition-all duration-200"
            title={executionTargetOffset !== null ? `Run to Selected Instruction (#${executionTargetOffset})` : "Run to Cursor (Click a source line to set target)"}
          >
            <Target className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">To Cursor</span>
          </button>

          <button
            onClick={handleRunToCompletion}
            disabled={exitCode !== null || !!trapInfo || !vmRef.current}
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

        {/* Right: Stacks + Console */}
        <div className="w-full md:w-1/2 flex flex-col min-h-0 divide-y divide-zinc-800">
          
          {/* Call Stack */}
          <div className="flex-none" style={{ height: '30%', minHeight: '120px', maxHeight: '220px' }}>
            <div className="h-full flex flex-col min-h-0">
              <div className="px-4 py-1.5 border-b border-zinc-800 bg-zinc-900/10 flex items-center gap-1.5 flex-shrink-0">
                <Cpu className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-[10px] font-semibold text-zinc-500 uppercase">Call Stack Frame Cards</span>
              </div>
              <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-4 items-center bg-zinc-950/10 min-h-0">
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
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            className={`w-56 flex-shrink-0 border rounded-xl p-3 bg-zinc-900/30 backdrop-blur-md shadow-lg ${
                              isTopFrame
                                ? 'border-indigo-500/30 shadow-indigo-500/5 ring-1 ring-indigo-500/10'
                                : 'border-zinc-800/80'
                            }`}
                          >
                            <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                              <span className="text-[11px] font-bold text-zinc-200 truncate max-w-[100px]">{frame.func_name}</span>
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                                isTopFrame ? 'bg-indigo-500/15 text-indigo-400' : 'bg-zinc-800 text-zinc-500'
                              }`}>
                                {isTopFrame ? 'Active' : `Frame ${idx}`}
                              </span>
                            </div>
                            <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
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
                                <div className="text-[10px] text-zinc-600 text-center py-1 italic">No locals</div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="flex-1 text-center text-zinc-500 text-xs italic">Call stack empty.</div>
                )}
              </div>
            </div>
          </div>

          {/* Operand Stack */}
          <div className="flex-none" style={{ height: '25%', minHeight: '100px', maxHeight: '180px' }}>
            <div className="h-full flex flex-col min-h-0">
              <div className="px-4 py-1.5 border-b border-zinc-800 bg-zinc-900/10 flex items-center gap-1.5 flex-shrink-0">
                <Layers className="h-3.5 w-3.5 text-violet-400" />
                <span className="text-[10px] font-semibold text-zinc-500 uppercase">Operand Stack (LIFO)</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 bg-zinc-950/20 relative min-h-0">
                {activeSnapshot?.operand_stack && activeSnapshot.operand_stack.length > 0 ? (
                  <div className="w-full max-w-xs mx-auto space-y-1.5 py-1">
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
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            className={`border rounded-lg px-3 py-2 flex justify-between items-center font-mono text-xs shadow-md ${
                              isTop
                                ? 'bg-violet-500/10 border-violet-500/30 text-violet-300 font-bold ring-1 ring-violet-500/10'
                                : 'bg-zinc-900/40 border-zinc-800 text-zinc-400'
                            }`}
                          >
                            <span className="text-[10px] text-zinc-500 select-none">[{idx}] {isTop ? 'TOP' : ''}</span>
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

          {/* Console Output — Terminal Panel */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-1.5 border-b border-zinc-800 bg-zinc-900/10 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[10px] font-semibold text-zinc-500 uppercase">Console Output</span>
              </div>
              {consoleOutput && (
                <span className="text-[9px] text-zinc-600 font-mono">
                  {consoleOutput.split('\n').filter(Boolean).length} line(s)
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto bg-zinc-950 p-3 min-h-0">
              {consoleOutput ? (
                <pre className="font-mono text-xs text-emerald-400 leading-relaxed whitespace-pre-wrap break-words">
                  {consoleOutput}
                </pre>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <span className="text-zinc-600 text-xs italic font-mono">// no output yet</span>
                </div>
              )}
              <div ref={consoleEndRef} />
            </div>
          </div>

        </div>
      </div>

      {/* Trap Visualization Panel — only shown when VM is trapped */}
      <AnimatePresence>
        {trapInfo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 border-t border-rose-800/60 bg-rose-950/60 overflow-hidden"
          >
            <div className="px-4 py-3 flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/25 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-rose-400" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                    VM Trap
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/20 text-rose-400 font-mono font-semibold">
                    {trapInfo.kind.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-4 font-mono text-[11px]">
                  {trapInfo.kind === 'OutOfBounds' && (
                    <>
                      <span className="text-zinc-400">
                        index: <span className="text-rose-300 font-bold">{trapInfo.index ?? '?'}</span>
                      </span>
                      <span className="text-zinc-600">·</span>
                      <span className="text-zinc-400">
                        length: <span className="text-rose-300 font-bold">{trapInfo.length ?? '?'}</span>
                      </span>
                    </>
                  )}
                  {trapInfo.span && (
                    <span className="text-zinc-600 text-[10px]">
                      @ src[{trapInfo.span.start}..{trapInfo.span.end}]
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => { setTrapInfo(null); resetVm(); }}
                className="flex-shrink-0 text-[10px] text-rose-400/60 hover:text-rose-300 transition-colors font-medium"
                title="Clear trap and reset VM"
              >
                Reset
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Status Panel */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-zinc-800 bg-zinc-900/20 flex items-center justify-between text-[11px] font-medium text-zinc-500">
        {exitCode !== null ? (
          <div className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle className="h-3.5 w-3.5" />
            <span>Execution Halts Successfully — Exit Code: <span className="font-mono font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">{exitCode}</span></span>
          </div>
        ) : trapInfo ? (
          <div className="flex items-center gap-1.5 text-rose-400">
            <AlertCircle className="h-3.5 w-3.5 animate-pulse" />
            <span>Execution trapped — see panel above</span>
          </div>
        ) : activeSnapshot ? (
          <span className="text-zinc-400">VM Active &amp; Running</span>
        ) : (
          <span>Waiting for valid compiled program</span>
        )}
      </div>
    </div>
  );
}


            
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
