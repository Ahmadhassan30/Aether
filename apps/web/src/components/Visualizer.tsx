"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { EXAMPLE_PROGRAMS } from '../utils/examplePrograms';
import { decodeSourceFromUrl, encodeSourceForUrl } from '../utils/permalink';
import { compilerService } from '../lib/wasm/compiler';
import { useCompilerStore } from '../stores/compilerStore';
import CodeEditor from './editor/CodeEditor';
import TokenViewer from './compiler/TokenViewer';
import Image from 'next/image';
import logo from '../app/logo.png';
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
  PlayCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      } else {
        try {
          const runResult = compilerService.executeVM(sourceText);
          useCompilerStore.getState().setConsoleOutput(
            runResult.stdout || `[VM] Program exited with status ${runResult.exitCode ?? 0}.\n`
          );
        } catch (vmError) {
          useCompilerStore.getState().setConsoleOutput(
            `[VM ERROR] ${vmError instanceof Error ? vmError.message : String(vmError)}`
          );
        }
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

  useEffect(() => {
    if (selectedStage && selectedStage !== activeTab && activeTab !== 'editor') {
      setActiveTab(selectedStage);
    }
  }, [selectedStage, activeTab]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
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
    <div className="relative flex h-[100dvh] min-h-[100svh] w-full overflow-hidden bg-[#000000] text-[var(--ink)] select-none">
      {/* Desktop Sidebar Collapse Toggle Button */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          title="Show sidebar"
          aria-label="Show sidebar"
          className="hidden md:flex absolute left-4 top-4 z-30 h-9 w-9 items-center justify-center rounded-[10px] border border-white/[0.06] bg-[#0c0d12] text-white hover:bg-zinc-800 transition shadow-lg"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      {/* Mobile Drawer Overlay Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden transition-opacity"
        />
      )}

      {/* 1. Left Navigation Sidebar (Desktop Sidebar & Mobile Drawer) */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 md:z-20 w-[min(82vw,270px)] md:w-[260px] h-full shrink-0 flex flex-col p-4 sm:p-5 bg-[#090a0f] border-r border-white/[0.04] transition-transform duration-300 ease-in-out ${
          sidebarCollapsed ? 'hidden md:hidden' : 'flex'
        } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* Workspace title & Collapse Button at the top */}
        <div className="flex items-center justify-between px-3 mb-6 pt-2">
          <span className="font-ubuntu text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Workspace</span>
          <button
            onClick={() => {
              setSidebarCollapsed(true);
              setMobileMenuOpen(false);
            }}
            title="Hide sidebar"
            aria-label="Hide sidebar"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 flex flex-col gap-1.5 overflow-y-auto scrollbar-none" aria-label="Workspace navigation">
          {NAVIGATION_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg font-ubuntu text-[12px] font-extrabold uppercase tracking-[0.08em] text-left transition-all ${
                  isActive
                    ? 'bg-white/[0.06] text-white shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/[0.04] font-black'
                    : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-zinc-200' : 'text-zinc-500'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Brand header with Logo */}
        <div className="border-t border-white/[0.04] pt-4 mt-auto flex flex-col items-center justify-center pb-2 shrink-0">
          <Link href="/" aria-label="Go to landing page" className="-mb-5 rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-white/35">
            <Image
              src={logo}
              alt="Aether Logo"
              priority
              className="h-auto w-32 object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.65)]"
            />
          </Link>
          <div className="flex items-center gap-1.5 mt-0 pb-1 z-10">
            <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6] animate-pulse shadow-[0_0_8px_#3b82f6]" />
            <span className="font-ubuntu text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
              CORE ENGINE
            </span>
          </div>
          <div className="px-3 text-[10px] font-medium text-zinc-600 font-mono pt-1 w-full text-center">
            v0.1.0 · stable
          </div>
        </div>
      </aside>

      {/* 2. Main Content Workspace */}
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden relative">
        {/* Unified Top Header */}
        <header className={`flex min-h-14 sm:h-16 shrink-0 items-center justify-between gap-2 border-b border-white/[0.04] px-2.5 sm:px-6 py-2 sm:py-0 bg-[#090a0f] z-10 transition-all duration-200 ${
          sidebarCollapsed ? 'md:pl-16' : ''
        }`}>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile Hamburger Menu Toggle Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              title="Toggle Menu"
              aria-label="Toggle Menu"
              className="flex md:hidden h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-zinc-900 text-zinc-200 hover:bg-zinc-800 shrink-0"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>

            <h1 className="font-ubuntu text-[12px] xs:text-sm sm:text-2xl font-black uppercase tracking-wider text-white truncate max-w-[92px] xs:max-w-[135px] sm:max-w-none">
              {NAVIGATION_ITEMS.find((n) => n.id === activeTab)?.label ?? 'Workspace'}
            </h1>
            <span className="hidden sm:inline-block h-4 w-px bg-white/[0.06]" />

            {/* Example Selection dropdown */}
            <select
              aria-label="Example program"
              value={activeExample?.id ?? 'custom'}
              onChange={(event) => {
                const example = EXAMPLE_PROGRAMS.find((item) => item.id === event.target.value);
                if (example) setSource(example.source);
              }}
              className="hidden xs:block border border-white/[0.06] bg-zinc-950 px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-[13px] font-medium text-zinc-300 rounded-md outline-none max-w-[120px] sm:max-w-[200px] truncate"
            >
              {!activeExample && <option value="custom">Custom source</option>}
              {EXAMPLE_PROGRAMS.map((example) => (
                <option key={example.id} value={example.id}>
                  {example.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
            {/* Latency and compiler status indicator */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  status === 'error'
                    ? 'bg-red-500'
                    : status === 'compiling' || status === 'booting'
                    ? 'animate-pulse bg-emerald-500 shadow-[0_0_8px_#10b981]'
                    : 'bg-emerald-500'
                }`}
                title={status}
              />
              {latency !== null && status === 'ready' && (
                <span className="hidden xs:inline-block font-mono text-[11px] sm:text-[13px] font-medium text-zinc-500">
                  {latency.toFixed(1)} ms
                </span>
              )}
            </div>

            {/* Recompile CTA */}
            <button
              onClick={() => void performCompile(source)}
              aria-label="Compile"
              className="relative group overflow-hidden flex h-8 sm:h-9 items-center gap-1.5 sm:gap-2 rounded-lg bg-[#00077F] px-2.5 sm:px-5 text-[11px] sm:text-[12px] font-bold uppercase tracking-[0.08em] text-white transition-all duration-300 hover:bg-[#00055c] active:scale-98 shadow-[0_4px_20px_rgba(0,7,127,0.35)] border border-white/10 shrink-0"
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
              {status === 'compiling' ? (
                <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
              ) : status === 'ready' ? (
                <Check className="h-3.5 w-3.5 text-sky-300" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current text-sky-200" />
              )}
              <span className="hidden xs:inline">Compile</span>
            </button>
          </div>
        </header>

        {/* 3. Panel Container */}
        <main className="flex-1 min-h-0 min-w-0 overflow-hidden relative bg-[#050508]">
          {activeTab === 'editor' ? (
            /* Code Editor fullscreen mode with bottom drawer split */
            <section className="flex h-[calc(100%-0.75rem)] sm:h-[calc(100%-2rem)] min-h-0 flex-col bg-[#0c0d12] m-1.5 sm:m-4 rounded-[12px] sm:rounded-[var(--rounded-card)] border border-white/[0.04] shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] overflow-hidden">
              <div className="flex h-9 sm:h-11 shrink-0 items-center justify-between border-b border-[var(--hairline)] bg-[var(--canvas-soft)] px-3 sm:px-4">
                <div className="flex items-center gap-2 text-xs sm:text-[14px] font-semibold text-[var(--body-strong)]">
                  <FileCode2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--signal)]" />
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
                <div className="h-[34dvh] max-h-[220px] min-h-[132px] shrink-0 bg-[#07080a] flex flex-col overflow-hidden">
                  {/* Drawer Tabs */}
                  <div className="flex h-8 sm:h-9 shrink-0 items-center justify-between border-b border-[var(--hairline)] bg-[rgba(255,255,255,0.01)] px-3 sm:px-4 select-none">
                    <div className="flex gap-3 sm:gap-5 h-full">
                      <button
                        onClick={() => setConsoleTab('compiler')}
                        className={`font-mono text-[9px] sm:text-[10px] font-bold uppercase tracking-wider relative h-full flex items-center ${consoleTab === 'compiler' ? 'text-[var(--signal)] border-b-2 border-[var(--signal)]' : 'text-[var(--body)] opacity-70 hover:opacity-100'
                          }`}
                      >
                        Output
                      </button>
                      <button
                        onClick={() => setConsoleTab('vm')}
                        className={`font-mono text-[9px] sm:text-[10px] font-bold uppercase tracking-wider relative h-full flex items-center ${consoleTab === 'vm' ? 'text-[var(--signal)] border-b-2 border-[var(--signal)]' : 'text-[var(--body)] opacity-70 hover:opacity-100'
                          }`}
                      >
                        Terminal
                      </button>
                      <button
                        onClick={() => setConsoleTab('problems')}
                        className={`font-mono text-[9px] sm:text-[10px] font-bold uppercase tracking-wider relative h-full flex items-center gap-1.5 ${consoleTab === 'problems' ? 'text-[var(--signal)] border-b-2 border-[var(--signal)]' : 'text-[var(--body)] opacity-70 hover:opacity-100'
                          }`}
                      >
                        Problems
                        <span className={`px-1.5 py-0.2 rounded-full text-[8px] sm:text-[9px] font-bold ${artifacts?.diagnostics?.length ? 'bg-[var(--danger)] text-white' : 'bg-white/10 text-[var(--muted)]'
                          }`}>
                          {artifacts?.diagnostics?.length ?? 0}
                        </span>
                      </button>
                    </div>
                    <div className="hidden sm:block font-mono text-[9px] text-[var(--muted)] font-bold uppercase tracking-wider">stdout · aether-cc</div>
                  </div>

                  {/* Drawer Content */}
                  <div className="flex-1 p-2.5 sm:p-4 font-mono text-[11px] sm:text-[12px] overflow-y-auto leading-relaxed select-text scrollbar-thin">
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

              <div className="flex h-6 sm:h-7 shrink-0 items-center justify-between border-t border-[var(--hairline)] bg-[var(--canvas-soft)] px-3 sm:px-4 font-mono text-[9px] sm:text-[10px] text-[var(--muted)]">
                <span>C · UTF-8</span>
                <span>Spaces: 4&nbsp;&nbsp; Ln {source.split('\n').length}</span>
              </div>
            </section>
          ) : (
            /* Compiler stage visualization fullscreen mode */
            <section className="flex h-[calc(100%-0.75rem)] sm:h-[calc(100%-2rem)] min-h-0 flex-col bg-[var(--panel)] glass-panel m-1.5 sm:m-4 rounded-[12px] sm:rounded-[var(--rounded-card)] border border-[var(--hairline)] overflow-hidden relative">
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
