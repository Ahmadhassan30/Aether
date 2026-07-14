"use client";

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import ResizableLayout from './ResizableLayout';
import { EXAMPLE_PROGRAMS } from '../utils/examplePrograms';
import { decodeSourceFromUrl, encodeSourceForUrl } from '../utils/permalink';
import { compilerService } from '../lib/wasm/compiler';
import { useCompilerStore } from '../stores/compilerStore';
import CodeEditor from './editor/CodeEditor';
import TokenViewer from './compiler/TokenViewer';
import ASTViewer from './compiler/ASTViewer';
import HIRViewer from './compiler/HIRViewer';
import CFGViewer from './compiler/CFGViewer';
import IRAssemblyViewer from './compiler/IRAssemblyViewer';
import VMDebugger from './debugger/VMDebugger';
import type { CompilerStageId } from '../types/compiler';
import WorkspaceHeader from './workspace/WorkspaceHeader';
import { AlertTriangle, FileCode2 } from 'lucide-react';

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
      <div className="flex h-full items-center justify-center border-t border-sky-200/10 bg-slate-950/20 text-sm text-slate-500">
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
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--canvas)] text-[var(--ink)]">
      <WorkspaceHeader
        documentName={activeExample?.title ?? 'Custom source'}
        status={status}
        latency={latency}
        onCompile={() => void performCompile(source)}
        examples={EXAMPLE_PROGRAMS}
        activeExampleId={activeExample?.id ?? null}
        onSelectExample={(example) => setSource(example.source)}
      />
      <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--workspace)]">
        <ResizableLayout
          left={
            <section className="flex h-full min-h-0 flex-col border-r border-[var(--hairline)] bg-[#1f1d1b]">
              <div className="flex h-9 shrink-0 items-center border-b border-[var(--hairline)] bg-[var(--canvas)] px-3">
                <div className="flex items-center gap-2 text-[10px] text-[var(--body-strong)]">
                  <FileCode2 className="h-3.5 w-3.5 text-[#8fb4ff]" />
                  main.c
                </div>
              </div>
              <div className="min-h-0 flex-1"><CodeEditor /></div>
              <div className="flex h-6 shrink-0 items-center justify-between border-t border-[var(--hairline)] bg-[var(--canvas)] px-2.5 font-mono text-[9px] text-[var(--muted)]">
                <span>C · UTF-8</span>
                <span>Spaces: 4&nbsp;&nbsp; Ln {source.split('\n').length}</span>
              </div>
            </section>
          }
          right={
            <section className="flex h-full min-h-0 flex-col bg-[var(--workspace)]">
              <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--hairline)] bg-[var(--canvas)] px-2">
                {VIEWS.map((view) => (
                  <button
                    key={view.id}
                    onClick={() => setSelectedStage(view.id)}
                    className={`relative h-7 rounded-[3px] px-2.5 text-[10px] transition ${selectedStage === view.id ? 'text-[var(--ink)]' : 'text-[var(--muted)] hover:text-[var(--body-strong)]'}`}
                  >
                    {view.label}
                    {selectedStage === view.id && <span className="absolute inset-x-2 -bottom-1 h-px bg-[#8fb4ff]" />}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1"><StageView /></div>
              {artifacts?.diagnostics.length ? (
                <div className="flex shrink-0 items-start gap-2 border-t border-[#e06c7540] bg-[#e06c750d] px-3 py-2 text-[10px] text-[#e9a2a8]">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {artifacts.diagnostics[0].message}
                </div>
              ) : null}
            </section>
          }
        />
        {error && (
          <div role="alert" className="absolute bottom-3 left-3 right-3 z-50 flex items-start gap-2 rounded-[4px] border border-[#e06c7555] bg-[#3a2525f2] px-3 py-2 text-[10px] text-[#f0b0b5] shadow-[0_8px_30px_rgba(0,0,0,.3)]">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
