"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '../store/useStore';
import init, { compile } from 'aether-wasm';
import ResizableLayout from './ResizableLayout';
import PanelTabs from './PanelTabs';
import { Terminal, ShieldCheck, Loader2, Sparkles, Play } from 'lucide-react';
import { EXAMPLE_PROGRAMS } from '../utils/examplePrograms';
import { decodeSourceFromUrl, encodeSourceForUrl } from '../utils/permalink';

export default function Visualizer() {
  const {
    source,
    setSource,
    compileResult,
    setCompileResult,
    isWasmReady,
    setIsWasmReady,
    isCompiling,
    setIsCompiling,
    highlightedSpan,
    setHighlightedSpan,
    setExecutionTargetOffset,
  } = useStore();

  const [latency, setLatency] = useState<number | null>(null);
  const [editor, setEditor] = useState<any>(null);
  const [monaco, setMonaco] = useState<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const compileTimerRef = useRef<number | null>(null);
  const hasHydratedSourceRef = useRef(false);

  const activeExample = useMemo(() => {
    return EXAMPLE_PROGRAMS.find((example) => example.source === source) ?? null;
  }, [source]);

  const pushSourceToUrl = useCallback((sourceText: string) => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    url.searchParams.set('source', encodeSourceForUrl(sourceText));
    window.history.replaceState({}, '', url.toString());
  }, []);

  const performCompile = useCallback((sourceText: string) => {
    if (!isWasmReady) return;

    setIsCompiling(true);
    const start = performance.now();

    try {
      const res = compile(sourceText);
      const end = performance.now();
      const duration = end - start;
      setLatency(duration);
      console.log(`Compilation finished in ${duration.toFixed(2)}ms`);
      setCompileResult(res);
    } catch (err) {
      console.error('Compile execution panicked/failed:', err);
    } finally {
      pushSourceToUrl(sourceText);
      setIsCompiling(false);
    }
  }, [isWasmReady, pushSourceToUrl, setCompileResult, setIsCompiling]);

  // Initialize WASM
  useEffect(() => {
    async function loadWasm() {
      try {
        console.log("Initializing WASM...");
        await init({ module_or_path: '/aether_wasm_bg.wasm?t=' + Date.now() });
        setIsWasmReady(true);
        console.log("WASM Initialized!");
      } catch (err) {
        console.error("Failed to initialize WASM:", err);
      }
    }
    loadWasm();
  }, [setIsWasmReady]);

  // Restore shareable source on first load or when the browser navigates back/forward.
  useEffect(() => {
    const syncFromUrl = () => {
      if (typeof window === 'undefined') return;
      const encodedSource = new URL(window.location.href).searchParams.get('source');
      if (!encodedSource) return;

      const restoredSource = decodeSourceFromUrl(encodedSource);
      if (restoredSource !== null && restoredSource !== source) {
        setSource(restoredSource);
      }
    };

    if (!hasHydratedSourceRef.current) {
      hasHydratedSourceRef.current = true;
      syncFromUrl();
    }

    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [setSource, source]);

  // Debounced compilation
  useEffect(() => {
    if (!isWasmReady) return;

    if (compileTimerRef.current !== null) {
      window.clearTimeout(compileTimerRef.current);
    }

    compileTimerRef.current = window.setTimeout(() => {
      performCompile(source);
    }, 400);

    return () => {
      if (compileTimerRef.current !== null) {
        window.clearTimeout(compileTimerRef.current);
      }
    };
  }, [source, isWasmReady, performCompile]);

  // Keyboard shortcut: Ctrl/Cmd+Enter forces an immediate compile.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!(event.metaKey || event.ctrlKey) || key !== 'enter') {
        return;
      }

      event.preventDefault();
      if (compileTimerRef.current !== null) {
        window.clearTimeout(compileTimerRef.current);
      }
      performCompile(source);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [performCompile, source]);

  // Synchronize decorations with highlightedSpan from store
  useEffect(() => {
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    if (highlightedSpan) {
      const startPos = model.getPositionAt(highlightedSpan.start);
      const endPos = model.getPositionAt(highlightedSpan.end);

      const range = new monaco.Range(
        startPos.lineNumber,
        startPos.column,
        endPos.lineNumber,
        endPos.column
      );

      const activeTab = useStore.getState().selectedPanel;
      const highlightClassName = activeTab === 'AST'
        ? 'bg-emerald-500/10 border-b-2 border-dashed border-emerald-400/50'
        : activeTab === 'Execution'
        ? 'bg-amber-500/10 border-b-2 border-solid border-amber-400/60 shadow-inner'
        : 'bg-indigo-500/10 border-b-2 border-dashed border-indigo-400/50';

      const decorations = [
        {
          range,
          options: {
            isWholeLine: false,
            className: highlightClassName,
            inlineClassName: highlightClassName,
          },
        },
      ];

      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations);
      if (activeTab === 'Execution') {
        editor.revealLineInCenter(startPos.lineNumber);
      } else {
        editor.revealRangeInCenterIfOutsideViewport(range);
      }
    } else {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
    }
  }, [editor, monaco, highlightedSpan]);

  // Listen to cursor position changes in Monaco Editor to trigger cross-highlighting
  useEffect(() => {
    if (!editor) return;

    const disposable = editor.onDidChangeCursorPosition((e: any) => {
      const model = editor.getModel();
      if (!model) return;
      const offset = model.getOffsetAt(e.position);

      if (compileResult) {
        const activeTab = useStore.getState().selectedPanel;

        if (activeTab === 'Execution') {
          // Resolve clicked source span against VM bytecode span mapping exposed by CompileResult.
          // If the WASM API doesn't expose it or it's not present, we clear target.
          const instructions = compileResult.vm_bytecode || [];

          // Try exact match first
          let idx = instructions.findIndex(inst => inst.start !== undefined && inst.end !== undefined && offset >= inst.start && offset <= inst.end);

          // Try matching line number if exact match not found
          if (idx === -1) {
            const line = e.position.lineNumber;
            idx = instructions.findIndex(inst => {
              if (inst.start === undefined) return false;
              const instLine = model.getPositionAt(inst.start).lineNumber;
              return instLine === line;
            });
          }

          if (idx !== -1) {
            setExecutionTargetOffset(idx);
          } else {
            setExecutionTargetOffset(null);
          }
        } else {
          // Standard AST / HIR highlighting
          const list = activeTab === 'AST' ? compileResult.ast : activeTab === 'HIR' ? compileResult.hir : [];
          const matchingDecl = list.find(d => offset >= d.start && offset <= d.end);
          if (matchingDecl) {
            setHighlightedSpan({ start: matchingDecl.start, end: matchingDecl.end });
          } else {
            setHighlightedSpan(null);
          }
        }
      }
    });

    return () => disposable.dispose();
  }, [editor, compileResult, setHighlightedSpan, setExecutionTargetOffset]);

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-850 bg-zinc-900/40 backdrop-blur-md z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Terminal className="h-5 w-5 text-indigo-400" />
          <h1 className="text-md font-bold tracking-tight">
            AETHER <span className="text-zinc-500 font-normal">Visualizer</span>
          </h1>
        </div>
        
        {/* Status indicator */}
        <div className="flex items-center gap-4 text-xs">
          {latency !== null && (
            <span className="text-zinc-500">
              Latency: <span className="font-mono text-zinc-300">{latency.toFixed(1)}ms</span>
            </span>
          )}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800">
            {isCompiling ? (
              <>
                <Loader2 className="h-3.5 w-3.5 text-indigo-400 animate-spin" />
                <span className="text-zinc-400 font-medium">Compiling...</span>
              </>
            ) : isWasmReady ? (
              <>
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-zinc-400 font-medium">WASM Ready</span>
              </>
            ) : (
              <>
                <Loader2 className="h-3.5 w-3.5 text-zinc-500 animate-spin" />
                <span className="text-zinc-500">Loading WASM...</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 min-h-0 relative">
        <ResizableLayout
          left={
            <div className="h-full flex flex-col p-4 bg-zinc-950 gap-3 min-h-0">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/20 backdrop-blur-sm px-4 py-3 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
                      <Sparkles className="h-3.5 w-3.5" />
                      Curated examples
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      Start from a proven program, then share the exact source with a permalink.
                    </p>
                  </div>
                  <button
                    onClick={() => performCompile(source)}
                    disabled={!isWasmReady || isCompiling}
                    className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/15 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Compile now
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_PROGRAMS.map((example) => {
                    const isActive = activeExample?.id === example.id;
                    return (
                      <button
                        key={example.id}
                        onClick={() => setSource(example.source)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          isActive
                            ? 'border-cyan-400/30 bg-cyan-400/15 text-cyan-100 shadow-sm'
                            : 'border-zinc-700 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                        }`}
                      >
                        <span className="text-[10px] uppercase tracking-[0.22em] text-current/70">{example.tag}</span>
                        <span>{example.title}</span>
                      </button>
                    );
                  })}
                  {!activeExample && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200">
                      <Sparkles className="h-3.5 w-3.5" />
                      Custom source
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-500">
                  <span>{activeExample ? activeExample.summary : 'Editing a custom source program.'}</span>
                  <span className="font-mono">Ctrl/Cmd+Enter to compile</span>
                </div>
              </div>

              <div className="flex-1 border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/20 backdrop-blur-sm relative min-h-0">
                <Editor
                  height="100%"
                  language="cpp"
                  theme="vs-dark"
                  value={source}
                  onChange={(val) => setSource(val || '')}
                  onMount={(editorInstance, monacoInstance) => {
                    setEditor(editorInstance);
                    setMonaco(monacoInstance);
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    fontFamily: "Geist Mono, JetBrains Mono, monospace",
                    padding: { top: 12 },
                    lineNumbersMinChars: 3,
                    scrollbar: {
                      verticalScrollbarSize: 10,
                      horizontalScrollbarSize: 10,
                    },
                    overviewRulerBorder: false,
                    hideCursorInOverviewRuler: true,
                    renderLineHighlight: "all",
                  }}
                />
              </div>
            </div>
          }
          right={
            <div className="h-full flex flex-col p-4 bg-zinc-950">
              <div className="flex-1 border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/20 backdrop-blur-sm flex flex-col">
                <PanelTabs />
              </div>
            </div>
          }
        />
      </main>
    </div>
  );
}
