"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

const colorByKind: Record<string, string> = {
  keyword: 'border-sky-300/15 bg-sky-300/10 text-sky-100',
  identifier: 'border-slate-300/10 bg-white/[0.045] text-slate-200',
  integer: 'border-indigo-300/15 bg-indigo-300/10 text-indigo-100',
  operator: 'border-cyan-300/15 bg-cyan-300/10 text-cyan-100',
  punctuation: 'border-slate-300/10 bg-white/[0.035] text-slate-400',
};

export default function TokenViewer() {
  const { artifacts, setHighlightedSpan } = useCompilerStore();
  const tokens = artifacts?.tokens ?? [];

  return (
    <div className="h-full overflow-auto border-t border-sky-200/10 bg-slate-950/20 p-8">
      <div className="mx-auto flex max-w-5xl flex-wrap gap-3">
        {tokens.map((token) => (
          <button
            key={token.id}
            onMouseEnter={() => setHighlightedSpan(token.span)}
            onMouseLeave={() => setHighlightedSpan(null)}
            className={`rounded-xl border px-3 py-2 text-left font-mono text-xs shadow-sm shadow-black/20 backdrop-blur transition hover:-translate-y-0.5 ${colorByKind[token.kind] ?? colorByKind.punctuation}`}
          >
            <div>{token.text}</div>
            <div className="mt-1 text-[10px] opacity-60">{token.kind} · {token.span.start}:{token.span.end}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
