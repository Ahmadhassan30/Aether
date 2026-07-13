"use client";

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Cpu, Loader2, Play, ShieldCheck, Sparkles, Terminal } from 'lucide-react';
import ResizableLayout from './ResizableLayout';
import { EXAMPLE_PROGRAMS } from '../utils/examplePrograms';
import { decodeSourceFromUrl, encodeSourceForUrl } from '../utils/permalink';
import { compilerService } from '../lib/wasm/compiler';
import { useCompilerStore } from '../stores/compilerStore';
import CodeEditor from './editor/CodeEditor';
import PipelineVisualizer from './compiler/PipelineVisualizer';
import TokenViewer from './compiler/TokenViewer';
import ASTViewer from './compiler/ASTViewer';
import HIRViewer from './compiler/HIRViewer';
import CFGViewer from './compiler/CFGViewer';
import IRAssemblyViewer from './compiler/IRAssemblyViewer';
import VMDebugger from './debugger/VMDebugger';
import type { CompilerStageId } from '../types/compiler';

const VIEWS: Array<{ id: CompilerStageId; label: string }> = [
  { id: 'lexer', label: 'Tokens' },
  { id: 'ast', label: 'AST' },
  { id: 'hir', label: 'HIR' },
  { id: 'cfg', label: 'CFG' },
  { id: 'assembly', label: 'IR ⇢ ASM' },
  { id: 'execution', label: 'VM' },
];

function StageView() {
  const selectedStage = useCompilerStore((state) => state.selectedStage);
  const artifacts = useCompilerStore((state) => state.artifacts);

  if (!artifacts) {
    return (
      <div className="flex h-full items-center justify-center border-t border-zinc-800 bg-zinc-950 text-sm text-zinc-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Preparing compiler laboratory
      </div>
    );
  }

  if (selectedStage === 'lexer' || selectedStage === 'source' || selectedStage === 'parser') return <TokenViewer />;
  if (selectedStage === 'ast') return <ASTViewer />;
  if (selectedStage === 'hir') return <HIRViewer />;
  if (selectedStage === 'cfg') return <CFGViewer />;
  if (selectedStage === 'codegen' || selectedStage === 'assembly' || selectedStage === 'bytecode') return <IRAssemblyViewer />;
  return <VMDebugger />;
}

export default function Visualizer() {
  const {
    source,
    setSource,
    artifacts,
    selectedStage,
    setSelectedStage,
    status,
    setStatus,
    setArtifacts,
    setLatency,
    latency,
    setError,
    error,
  } = useCompilerStore();

  const compileTimerRef = useRef<number | null>(null);
  const hydratedRef = useRef(false);

  const activeExample = useMemo(() => {
    return EXAMPLE_PROGRAMS.find((example) => example.source === source) ?? null;
  }, [source]);

  const pushSourceToUrl = useCallback((sourceText: string) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('source', encodeSourceForUrl(sourceText));
    window.history.replaceState({}, '', url.toString());
  }, [performCompile, setError, setStatus, source]);

  const performCompile = useCallback(async (sourceText: string) => {
    setStatus('compiling');
    setError(null);
    const start = performance.now();
    try {
      const nextArtifacts = await compilerService.compile(sourceText);
      setArtifacts(nextArtifacts);
      setLatency(performance.now() - start);
      setStatus(nextArtifacts.success ? 'ready' : 'error');
      pushSourceToUrl(sourceText);
    } catch (compileError) {
      setStatus('error');
      setError(compileError instanceof Error ? compileError.message : String(compileError));
    }
  }, [pushSourceToUrl, setArtifacts, setError, setLatency, setStatus]);

  useEffect(() => {
    let cancelled = false;
    compilerService
      .initialize()
      .then(() => {
        if (!cancelled) {
          setStatus('ready');
          void performCompile(source);
        }
      })
      .catch((initError) => {
        if (!cancelled) {
          setStatus('error');
          setError(initError instanceof Error ? initError.message : String(initError));
          void performCompile(source);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      if (typeof window === 'undefined') return;
      const encoded = new URL(window.location.href).searchParams.get('source');
      if (!encoded) return;
      const decoded = decodeSourceFromUrl(encoded);
      if (decoded !== null && decoded !== source) setSource(decoded);
    };

    if (!hydratedRef.current) {
      hydratedRef.current = true;
      syncFromUrl();
    }
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [setSource, source]);

  useEffect(() => {
    if (compileTimerRef.current !== null) window.clearTimeout(compileTimerRef.current);
    compileTimerRef.current = window.setTimeout(() => {
      void performCompile(source);
    }, 450);
    return () => {
      if (compileTimerRef.current !== null) window.clearTimeout(compileTimerRef.current);
    };
  }, [performCompile, source]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'enter') return;
      event.preventDefault();
      if (compileTimerRef.current !== null) window.clearTimeout(compileTimerRef.current);
      void performCompile(source);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [performCompile, source]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-cyan-400/20 bg-cyan-400/10">
            <Cpu className="h-4 w-4 text-cyan-300" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">AETHER Compiler Laboratory</h1>
            <div className="text-[11px] text-zinc-500">MiniLang++ internal visualization</div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {latency !== null && <span className="font-mono text-zinc-500">{latency.toFixed(1)}ms</span>}
          <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-300">
            {status === 'compiling' || status === 'booting' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
            ) : status === 'ready' ? (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
            ) : (
              <Terminal className="h-3.5 w-3.5 text-rose-300" />
            )}
            {status}
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <ResizableLayout
          left={
            <div className="flex h-full min-h-0 flex-col gap-3 bg-zinc-950 p-4">
              <section className="shrink-0 rounded-md border border-zinc-800 bg-zinc-900/45 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    Programs
                  </div>
                  <button
                    onClick={() => void performCompile(source)}
                    className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/15"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Compile
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_PROGRAMS.map((example) => {
                    const active = activeExample?.id === example.id;
                    return (
                      <button
                        key={example.id}
                        onClick={() => setSource(example.source)}
                        className={`rounded-md border px-3 py-1.5 text-xs transition ${
                          active
                            ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100'
                            : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                        }`}
                      >
                        {example.title}
                      </button>
                    );
                  })}
                </div>
                {error && <div className="mt-3 rounded border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{error}</div>}
              </section>

              <section className="min-h-0 flex-1 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/30">
                <CodeEditor />
              </section>
            </div>
          }
          right={
            <div className="flex h-full min-h-0 flex-col bg-zinc-950 p-4">
              <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/20">
                <PipelineVisualizer />
                <div className="flex shrink-0 gap-1 border-b border-zinc-800 bg-zinc-950 px-3 py-2">
                  {VIEWS.map((view) => (
                    <button
                      key={view.id}
                      onClick={() => setSelectedStage(view.id)}
                      className={`rounded-md px-3 py-2 text-xs font-medium transition ${
                        selectedStage === view.id
                          ? 'bg-cyan-400/10 text-cyan-100'
                          : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200'
                      }`}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1">
                  <StageView />
                </div>
                {artifacts?.diagnostics.length ? (
                  <div className="shrink-0 border-t border-rose-400/20 bg-rose-950/20 px-4 py-2 text-xs text-rose-200">
                    {artifacts.diagnostics[0].message}
                  </div>
                ) : null}
              </section>
            </div>
          }
        />
      </main>
    </div>
  );
}
