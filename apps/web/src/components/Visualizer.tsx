"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  AlertTriangle,
  FileCode2,
  Check,
  Play,
  Code,
  FileText,
  GitFork,
  Layers,
  Network,
  Cpu,
  PlayCircle
} from 'lucide-react';
import type { CompilerStageId } from '../types/compiler';

function StageView() {
  const selectedStage = useCompilerStore((state) => state.selectedStage);
  const artifacts = useCompilerStore((state) => state.artifacts);

  if (!artifacts) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950/20 text-sm text-slate-500 font-mono">
        Preparing compiler laboratory
      </div>
    );
  }

  if (selectedStage === 'lexer' || selectedStage === 'source' || selectedStage === 'parser') return <TokenViewer />;
  if (selectedStage === 'ast') return <ASTViewer />;
  if (selectedStage === 'hir') return <HIRViewer />;
  if (selectedStage === 'cfg') return <CFGViewer />;
  if (selectedStage === 'codegen' || selectedStage === 'assembly') return <IRAssemblyViewer />;
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

  const [activeTab, setActiveTab] = useState<string>('editor');
  const [consoleTab, setConsoleTab] = useState<'compiler' | 'vm' | 'problems'>('compiler');

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
      if (!nextArtifacts.success) {
        setConsoleTab('problems');
      }
      pushSourceToUrl(sourceText);
    } catch (compileError) {
      setStatus('error');
      setError(compileError instanceof Error ? compileError.message : String(compileError));
      setConsoleTab('problems');
    }
  }, [pushSourceToUrl, setArtifacts, setError, setLatency, setStatus]);

  useEffect(() => {
    let cancelled = false;
    compilerService
      .initialize()
      .then(() => {
        if (!cancelled) {
          setStatus('ready');
        }
      })
      .catch((initError) => {
        if (!cancelled) {
          setStatus('error');
          setError(initError instanceof Error ? initError.message : String(initError));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setError, setStatus]);

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
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'enter') return;
      event.preventDefault();
      if (compileTimerRef.current !== null) window.clearTimeout(compileTimerRef.current);
      void performCompile(source);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [performCompile, source]);

  // Keep sidebar highlighted stage in sync with selectedStage store updates
  useEffect(() => {
    if (selectedStage && selectedStage !== activeTab && activeTab !== 'editor') {
      setActiveTab(selectedStage);
    }
  }, [selectedStage, activeTab]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId !== 'editor') {
      setSelectedStage(tabId as CompilerStageId);
    }
  };

  const NAVIGATION_ITEMS = [
    { id: 'editor', label: 'Code Editor', icon: Code },
    { id: 'lexer', label: 'Lexer (Tokens)', icon: FileText },
    { id: 'ast', label: 'AST Parser', icon: GitFork },
    { id: 'hir', label: 'Semantic HIR', icon: Layers },
    { id: 'cfg', label: 'CFG Graph', icon: Network },
    { id: 'assembly', label: 'Assembly & IR', icon: Cpu },
    { id: 'execution', label: 'VM Debugger', icon: PlayCircle },
  ];

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[var(--workspace)] text-[var(--ink)] select-none">
      {/* Background ambient glowing glassmorphic blobs */}
      <div className="absolute top-[-100px] left-[-150px] w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-[rgba(96,165,250,0.16)] to-transparent blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-150px] left-[-100px] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-[rgba(139,92,246,0.14)] to-transparent blur-[140px] pointer-events-none z-0" />
      <div className="absolute top-[20%] right-[-150px] w-[500px] h-[500px] rounded-full bg-gradient-to-bl from-[rgba(147,197,253,0.12)] to-transparent blur-[130px] pointer-events-none z-0" />

      {/* 1. Left Navigation Sidebar */}
      <aside className="glass-sidebar w-[240px] h-full shrink-0 flex flex-col p-4 z-20">
        {/* Brand header */}
        <div className="flex items-center gap-2.5 px-3 py-4 mb-6">
          <span className="font-sans text-[20px] font-bold tracking-[-0.03em] text-[var(--ink)]">
            Aether
          </span>
          <span className="h-2 w-2 rounded-full bg-[var(--signal)] animate-pulse shadow-[0_0_8px_var(--signal)]" />
        </div>

        {/* Navigation list */}
        <nav className="flex-1 flex flex-col gap-1.5" aria-label="Workspace navigation">
          {NAVIGATION_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-[var(--rounded-control)] font-sans text-[14px] font-semibold text-left transition-all ${
                  isActive
                    ? 'border-l-[3px] border-[var(--signal)] bg-[rgba(96,165,250,0.08)] text-[var(--signal)] shadow-[inset_4px_0_12px_rgba(96,165,250,0.05)]'
                    : 'text-[var(--body)] hover:bg-white/[0.03] hover:text-[var(--ink)]'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[var(--signal)]' : 'text-inherit'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer info */}
        <div className="border-t border-[var(--hairline)] pt-4 mt-auto">
          <div className="px-3 text-[11px] font-medium text-[var(--muted)] font-mono">
            v0.1.0 · stable
          </div>
        </div>
      </aside>

      {/* 2. Main Content Workspace */}
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden relative">
        {/* Unified Top Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--hairline)] px-6 bg-[rgba(18,19,17,0.3)] backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <span className="text-[20px] font-bold text-[var(--ink)]">
              {NAVIGATION_ITEMS.find((n) => n.id === activeTab)?.label ?? 'Workspace'}
            </span>
            <span className="h-4 w-px bg-[var(--hairline)]" />
            
            {/* Example Selection dropdown */}
            <select
              aria-label="Example program"
              value={activeExample?.id ?? 'custom'}
              onChange={(event) => {
                const example = EXAMPLE_PROGRAMS.find((item) => item.id === event.target.value);
                if (example) setSource(example.source);
              }}
              className="border border-[var(--hairline)] bg-[var(--panel)] px-3 py-1.5 text-[13px] font-medium text-[var(--body)] rounded-[var(--rounded-control)] outline-none max-w-[200px]"
            >
              {!activeExample && <option value="custom">Custom source</option>}
              {EXAMPLE_PROGRAMS.map((example) => (
                <option key={example.id} value={example.id}>
                  {example.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            {/* Latency and compiler status indicator */}
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  status === 'error'
                    ? 'bg-[var(--danger)]'
                    : status === 'compiling' || status === 'booting'
                    ? 'animate-pulse bg-[var(--signal)] shadow-[0_0_8px_var(--signal)]'
                    : 'bg-[var(--signal)]'
                }`}
                title={status}
              />
              {latency !== null && status === 'ready' && (
                <span className="font-mono text-[13px] font-medium text-[var(--muted)]">
                  {latency.toFixed(1)} ms
                </span>
              )}
            </div>

            {/* Recompile CTA */}
            <button
              onClick={() => void performCompile(source)}
              className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--signal)] hover:bg-[#93c5fd] px-4 text-[13px] font-semibold text-[var(--on-primary)] transition active:scale-95 shadow-lg shadow-[rgba(96,165,250,0.15)]"
            >
              {status === 'compiling' ? (
                <span className="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full" />
              ) : status === 'ready' ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
              Compile
            </button>
          </div>
        </header>

        {/* 3. Panel Container */}
        <main className="flex-1 min-h-0 min-w-0 overflow-hidden relative bg-[var(--workspace)]">
          {activeTab === 'editor' ? (
            /* Code Editor fullscreen mode with bottom drawer split */
            <section className="flex h-[calc(100%-2rem)] min-h-0 flex-col bg-[var(--panel)] glass-panel m-4 rounded-[var(--rounded-card)] border border-[var(--hairline)] overflow-hidden">
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--hairline)] bg-[var(--canvas-soft)] px-4">
                <div className="flex items-center gap-2 text-[14px] font-semibold text-[var(--body-strong)]">
                  <FileCode2 className="h-4 w-4 text-[var(--signal)]" />
                  main.c
                </div>
              </div>
              
              <div className="flex-1 min-h-0 flex flex-col">
                {/* Editor Content (Top Half) */}
                <div className="flex-1 min-h-0 relative">
                  <CodeEditor />
                </div>
                
                {/* Split border */}
                <div className="h-px bg-[var(--hairline)] shrink-0" />
                
                {/* Bottom Terminal Drawer (Bottom Half) */}
                <div className="h-[220px] shrink-0 bg-[#07080a] flex flex-col overflow-hidden">
                  {/* Drawer Tabs */}
                  <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--hairline)] bg-[rgba(255,255,255,0.01)] px-4 select-none">
                    <div className="flex gap-5 h-full">
                      <button 
                        onClick={() => setConsoleTab('compiler')} 
                        className={`font-mono text-[10px] font-bold uppercase tracking-wider relative h-full flex items-center ${
                          consoleTab === 'compiler' ? 'text-[var(--signal)] border-b-2 border-[var(--signal)]' : 'text-[var(--body)] opacity-70 hover:opacity-100'
                        }`}
                      >
                        Output (compiler)
                      </button>
                      <button 
                        onClick={() => setConsoleTab('vm')} 
                        className={`font-mono text-[10px] font-bold uppercase tracking-wider relative h-full flex items-center ${
                          consoleTab === 'vm' ? 'text-[var(--signal)] border-b-2 border-[var(--signal)]' : 'text-[var(--body)] opacity-70 hover:opacity-100'
                        }`}
                      >
                        Terminal (vm)
                      </button>
                      <button 
                        onClick={() => setConsoleTab('problems')} 
                        className={`font-mono text-[10px] font-bold uppercase tracking-wider relative h-full flex items-center gap-1.5 ${
                          consoleTab === 'problems' ? 'text-[var(--signal)] border-b-2 border-[var(--signal)]' : 'text-[var(--body)] opacity-70 hover:opacity-100'
                        }`}
                      >
                        Problems
                        <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                          artifacts?.diagnostics?.length ? 'bg-[var(--danger)] text-white' : 'bg-white/10 text-[var(--muted)]'
                        }`}>
                          {artifacts?.diagnostics?.length ?? 0}
                        </span>
                      </button>
                    </div>
                    <div className="font-mono text-[9px] text-[var(--muted)] font-bold uppercase tracking-wider">stdout · aether-cc</div>
                  </div>
                  
                  {/* Drawer Content */}
                  <div className="flex-1 p-4 font-mono text-[12px] overflow-y-auto leading-relaxed select-text scrollbar-thin">
                    {consoleTab === 'compiler' && (
                      <div className="flex flex-col gap-1 text-[var(--body-strong)]">
                        <div><span className="text-[#9fe870] font-bold select-none">$</span> aether-cc compile main.c</div>
                        {status === 'compiling' && (
                          <div className="text-[var(--muted)]">[INFO] Starting compile build...</div>
                        )}
                        {status === 'ready' && (
                          <>
                            <div className="text-[var(--muted)]">[INFO] Lexical analysis completed ({artifacts?.tokens?.length ?? 0} tokens)</div>
                            <div className="text-[var(--muted)]">[INFO] Abstract Syntax Tree generated</div>
                            <div className="text-[var(--muted)]">[INFO] Semantic validation succeeded (HIR generated)</div>
                            <div className="text-[var(--muted)]">[INFO] Cranelift lowering succeeded</div>
                            <div className="text-[var(--muted)]">[INFO] Native compilation disassembly generated</div>
                            <div className="text-[#9fe870] font-semibold">[SUCCESS] Build completed successfully in {latency?.toFixed(1) ?? '0.0'}ms.</div>
                          </>
                        )}
                        {status === 'error' && (
                          <>
                            <div className="text-[var(--danger)] font-semibold">[ERROR] Compilation failed:</div>
                            <div className="text-red-400 pl-4 whitespace-pre-wrap">{error ?? artifacts?.diagnostics?.[0]?.message ?? 'Semantic analyzer rejected target input.'}</div>
                          </>
                        )}
                      </div>
                    )}
                    
                    {consoleTab === 'vm' && (
                      <div className="text-[#e4e4e7]">
                        {useCompilerStore.getState().consoleOutput ? (
                          useCompilerStore.getState().consoleOutput.split('\n').filter(line => line.length > 0).map((line, idx) => (
                            <div key={idx} className="flex gap-2.5 items-center">
                              <span className="text-[#9fe870] font-bold select-none">$</span>
                              <span className="text-[var(--body-strong)]">{line}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-[var(--muted)] italic">
                            $ No program output yet.
                            <br />
                            $ Tip: Trigger Compile or navigate to the VM Debugger tab to execute the program.
                          </div>
                        )}
                      </div>
                    )}
                    
                    {consoleTab === 'problems' && (
                      <div className="flex flex-col gap-2">
                        {artifacts?.diagnostics?.length ? (
                          artifacts.diagnostics.map((diag, idx) => (
                            <div key={idx} className="flex gap-2 items-start text-[var(--danger)]">
                              <span className="font-bold shrink-0">[Error]</span>
                              <span className="text-[var(--body-strong)]">{diag.message}</span>
                              {diag.span && (
                                <span className="text-[var(--muted)] font-sans text-[11px] ml-auto">
                                  span: {diag.span.start}..{diag.span.end}
                                </span>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="text-[var(--muted)] italic">No problems have been detected in the workspace.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--hairline)] bg-[var(--canvas-soft)] px-4 font-mono text-[10px] text-[var(--muted)]">
                <span>C · UTF-8</span>
                <span>Spaces: 4&nbsp;&nbsp; Ln {source.split('\n').length}</span>
              </div>
            </section>
          ) : (
            /* Compiler stage visualization fullscreen mode */
            <section className="flex h-[calc(100%-2rem)] min-h-0 flex-col bg-[var(--panel)] glass-panel m-4 rounded-[var(--rounded-card)] border border-[var(--hairline)] overflow-hidden relative">
              <div className="min-h-0 flex-1">
                <StageView />
              </div>

              {/* Floating diagnostic errors if present in stage */}
              {artifacts?.diagnostics.length ? (
                <div className="absolute bottom-4 left-4 right-4 z-50 flex items-start gap-2 rounded-[8px] border border-[rgba(208,50,56,0.3)] bg-[rgba(50,7,7,0.85)] backdrop-blur-md px-4 py-3 text-[12px] text-[#f0b0b5] shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
                  <span className="font-mono leading-tight">{artifacts.diagnostics[0].message}</span>
                </div>
              ) : null}
            </section>
          )}

          {/* Critical global initialization or compile error notifications */}
          {error && (
            <div
              role="alert"
              className="absolute bottom-4 left-4 right-4 z-50 flex items-start gap-2 rounded-[8px] border border-[rgba(208,50,56,0.4)] bg-[rgba(50,7,7,0.9)] backdrop-blur-md px-4 py-3 text-[12px] text-[#f0b0b5] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
              <span className="font-mono leading-tight">{error}</span>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
