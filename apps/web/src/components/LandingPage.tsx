"use client";

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Play, Sparkles, Binary, ScanSearch } from 'lucide-react';
import { motion } from 'framer-motion';

const highlights = [
  {
    title: 'Phase-by-phase visibility',
    text: 'Tokens, AST, HIR, Cranelift IR, disassembly, and VM execution all live in one browser tab.',
    image: '/showcase/token-stream.png',
    alt: 'Aether token and AST panels with highlighted source spans',
    tag: 'Compiler',
  },
  {
    title: 'Execution you can rewind',
    text: 'Single-step, run to cursor, rewind, and inspect traps without leaving the page.',
    image: '/showcase/execution-console.png',
    alt: 'Aether execution panel with console output and trap visualization',
    tag: 'VM',
  },
  {
    title: 'Real CFG-worthy programs',
    text: 'Curated examples start visitors on meaningful code instead of an empty editor.',
    image: '/showcase/cfg-graph.png',
    alt: 'Aether Cranelift IR and control-flow heavy example',
    tag: 'IR',
  },
  {
    title: 'Structured traps, not strings',
    text: 'Out-of-bounds, divide-by-zero, and other runtime faults surface with real fields and source spans.',
    image: '/showcase/trap-detail.png',
    alt: 'Aether trap panel showing structured out of bounds data',
    tag: 'Traps',
  },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.16),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(244,63,94,0.14),_transparent_20%),linear-gradient(180deg,_#050816_0%,_#090d18_45%,_#0b1020_100%)] text-zinc-100">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px] opacity-30" />
      <div className="absolute left-1/2 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 md:px-10 lg:px-12">
        <header className="flex items-center justify-between gap-4 rounded-3xl border border-white/8 bg-white/4 px-5 py-4 backdrop-blur-xl shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300/90">
              <Sparkles className="h-4 w-4" />
              Browser-native compiler lab
            </div>
            <h1 className="mt-2 text-lg font-semibold tracking-tight text-zinc-50 md:text-xl">
              Aether
            </h1>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/playground"
              className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/15"
            >
              Try it live
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.3em] text-cyan-200">
              <Binary className="h-3.5 w-3.5" />
              Live compiler visualization
            </div>
            <h2 className="mt-6 text-4xl font-semibold tracking-tight text-zinc-50 md:text-6xl">
              See each compiler phase, trap, and VM step as it happens.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300 md:text-lg">
              Aether runs the full compiler pipeline in the browser, then lets you step a custom VM, rewind state, and inspect structured traps without leaving the page.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/playground"
                className="inline-flex items-center gap-2 rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              >
                <Play className="h-4 w-4" />
                Try it live
              </Link>
              <a
                href="#highlights"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/8"
              >
                <ScanSearch className="h-4 w-4" />
                See highlights
              </a>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/8 bg-white/4 p-4 backdrop-blur">
                <div className="text-sm font-semibold text-zinc-50">All in browser</div>
                <div className="mt-1 text-sm text-zinc-400">Static export, WASM runtime, no backend.</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/4 p-4 backdrop-blur">
                <div className="text-sm font-semibold text-zinc-50">Shared permalinks</div>
                <div className="mt-1 text-sm text-zinc-400">Source is encoded in the URL on every compile.</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/4 p-4 backdrop-blur">
                <div className="text-sm font-semibold text-zinc-50">Keyboard-first</div>
                <div className="mt-1 text-sm text-zinc-400">Compile with Ctrl/Cmd+Enter, step with Space.</div>
              </div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          >
            <div className="flex items-center justify-between px-2 pb-3 text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">
              <span>Real UI</span>
              <span>Captured from the playground</span>
            </div>
            <div className="relative overflow-hidden rounded-[1.5rem] border border-white/8 bg-zinc-950">
              <Image
                src="/showcase/execution-console.png"
                alt="Aether execution panel with trap visualization and console output"
                width={1400}
                height={900}
                className="h-auto w-full"
                priority
              />
            </div>
          </motion.div>
        </section>

        <section id="highlights" className="pb-6">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/80">Feature highlights</div>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">Four views that prove the system is real.</h3>
            </div>
            <div className="hidden max-w-sm text-sm text-zinc-400 md:block">
              Each preview below is a real capture from the working playground, not a mockup.
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {highlights.map((highlight) => (
              <article
                key={highlight.title}
                className="group overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5 shadow-[0_20px_70px_rgba(0,0,0,0.3)] backdrop-blur-xl"
              >
                <div className="relative aspect-[16/10] overflow-hidden border-b border-white/10 bg-zinc-950">
                  <Image
                    src={highlight.image}
                    alt={highlight.alt}
                    fill
                    className="object-cover transition duration-500 group-hover:scale-[1.02]"
                  />
                </div>
                <div className="p-5 md:p-6">
                  <div className="flex items-center justify-between gap-4">
                    <h4 className="text-lg font-semibold text-zinc-50">{highlight.title}</h4>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">
                      {highlight.tag}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">{highlight.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <footer className="flex items-center justify-between gap-4 border-t border-white/8 py-6 text-sm text-zinc-500">
          <span>Static export on Vercel, no server runtime.</span>
          <Link href="/playground" className="font-medium text-cyan-200 transition hover:text-cyan-100">
            Open playground
          </Link>
        </footer>
      </div>
    </main>
  );
}
