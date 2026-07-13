"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
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
  const [optionsOpen, setOptionsOpen] = useState(false);

  const activeExample = useMemo(() => {
    return EXAMPLE_PROGRAMS.find((example) => example.source === source) ?? null;
  }, [source]);

  const pushSourceToUrl = useCallback((sourceText: string) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('source', encodeSourceForUrl(sourceText));
    window.history.replaceState({}, '', url.toString());
  }, []);

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
  }, [performCompile, setError, setStatus, source]);

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
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[linear-gradient(135deg,#f7efdf_0%,#efe1c8_42%,#d8eee8_100%)] text-stone-900">
      <header className="mx-3 mt-3 flex h-14 shrink-0 items-center justify-between rounded-[28px] border border-white/55 bg-white/35 px-5 shadow-2xl shadow-stone-900/5 backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.04em] text-stone-900">Aether</h1>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {latency !== null && <span className="font-mono text-[11px] text-stone-500">{latency.toFixed(1)}ms</span>}
          <div className="flex items-center gap-2 rounded-full border border-white/50 bg-white/35 px-3 py-1.5 text-[11px] text-stone-500 backdrop-blur">
            {status === 'compiling' || status === 'booting' ? (
              <Loader2 className="h-3 w-3 animate-spin text-teal-700" />
            ) : null}
            {status}
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <ResizableLayout
          left={
            <div className="relative flex h-full min-h-0 flex-col p-4">
              <div className="absolute right-8 top-8 z-20">
                <button
                  onClick={() => setOptionsOpen((open) => !open)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/55 bg-white/45 px-4 py-2.5 text-xs font-medium text-stone-700 shadow-xl shadow-stone-900/10 backdrop-blur-xl transition hover:bg-white/65"
                >
                  Options
                  <ChevronDown className={`h-3.5 w-3.5 text-stone-400 transition ${optionsOpen ? 'rotate-180' : ''}`} />
                </button>

                {optionsOpen && (
                  <div className="mt-3 w-80 rounded-[28px] border border-white/55 bg-white/55 p-4 shadow-2xl shadow-stone-900/10 backdrop-blur-2xl">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.22em] text-stone-400">Document</div>
                        <div className="mt-1 text-sm font-medium text-stone-900">{activeExample?.title ?? 'Custom source'}</div>
                      </div>
                      <button
                        onClick={() => void performCompile(source)}
                        className="rounded-full border border-stone-900/10 bg-stone-900 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-stone-900/10 transition hover:bg-stone-800"
                      >
                        Compile
                      </button>
                    </div>
                    <div className="space-y-1">
                      {EXAMPLE_PROGRAMS.map((example) => {
                        const active = activeExample?.id === example.id;
                        return (
                          <button
                            key={example.id}
                            onClick={() => {
                              setSource(example.source);
                              setOptionsOpen(false);
                            }}
                            className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-xs transition ${
                              active ? 'bg-white/70 text-stone-900 shadow-sm' : 'text-stone-500 hover:bg-white/45 hover:text-stone-800'
                            }`}
                          >
                            <span>{example.title}</span>
                            <span className="text-[10px] uppercase tracking-[0.16em] text-stone-400">{example.tag}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 border-t border-white/50 pt-3 font-mono text-[10px] text-stone-400">
                      Ctrl/Cmd+Enter compiles the current buffer.
                    </div>
                  </div>
                )}
              </div>

              <section className="min-h-0 flex-1 overflow-hidden rounded-[34px] border border-white/55 bg-white/40 shadow-2xl shadow-stone-900/10 backdrop-blur-2xl">
                <CodeEditor />
              </section>
              {error && (
                <div className="absolute bottom-8 left-8 right-8 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-xs text-rose-800 shadow-xl shadow-stone-900/10 backdrop-blur-xl">
                  {error}
                </div>
              )}
            </div>
          }
          right={
            <div className="flex h-full min-h-0 flex-col p-4">
              <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[34px] border border-white/55 bg-white/32 shadow-2xl shadow-stone-900/10 backdrop-blur-2xl">
                <PipelineVisualizer />
                <div className="flex h-14 shrink-0 items-center gap-1 border-b border-white/35 bg-white/20 px-5">
                  {VIEWS.map((view) => (
                    <button
                      key={view.id}
                      onClick={() => setSelectedStage(view.id)}
                      className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                        selectedStage === view.id
                          ? 'bg-white/70 text-stone-900 shadow-sm'
                          : 'text-stone-500 hover:bg-white/35 hover:text-stone-800'
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
                  <div className="shrink-0 border-t border-rose-200/70 bg-rose-50/65 px-5 py-3 text-xs text-rose-800">
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
