"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '../store/useStore';
import init, { compile } from 'aether-wasm';
import ResizableLayout from './ResizableLayout';
import PanelTabs from './PanelTabs';
import { Terminal, ShieldCheck, Loader2 } from 'lucide-react';

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
  } = useStore();

  const [latency, setLatency] = useState<number | null>(null);
  const [editor, setEditor] = useState<any>(null);
  const [monaco, setMonaco] = useState<any>(null);
  const decorationsRef = useRef<string[]>([]);

  // Initialize WASM
  useEffect(() => {
    async function loadWasm() {
      try {
        console.log("Initializing WASM...");
        await init('/aether_wasm_bg.wasm');
        setIsWasmReady(true);
        console.log("WASM Initialized!");
      } catch (err) {
        console.error("Failed to initialize WASM:", err);
      }
    }
    loadWasm();
  }, [setIsWasmReady]);

  // Debounced compilation
  useEffect(() => {
    if (!isWasmReady) return;

    const handler = setTimeout(() => {
      setIsCompiling(true);
      const start = performance.now();
      try {
        const res = compile(source);
        const end = performance.now();
        const duration = end - start;
        setLatency(duration);
        console.log(`Compilation finished in ${duration.toFixed(2)}ms`);
        setCompileResult(res);
      } catch (err) {
        console.error("Compile execution panicked/failed:", err);
      } finally {
        setIsCompiling(false);
      }
    }, 400);

    return () => clearTimeout(handler);
  }, [source, isWasmReady, setCompileResult, setIsCompiling]);

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
      editor.revealRangeInCenterIfOutsideViewport(range);
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
        const list = activeTab === 'AST' ? compileResult.ast : activeTab === 'HIR' ? compileResult.hir : [];
        const matchingDecl = list.find(d => offset >= d.start && offset <= d.end);
        if (matchingDecl) {
          setHighlightedSpan({ start: matchingDecl.start, end: matchingDecl.end });
        } else {
          setHighlightedSpan(null);
        }
      }
    });

    return () => disposable.dispose();
  }, [editor, compileResult, setHighlightedSpan]);

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
            <div className="h-full flex flex-col p-4 bg-zinc-950">
              <div className="flex-1 border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/20 backdrop-blur-sm relative">
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
