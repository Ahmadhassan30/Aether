"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

const colorByKind: Record<string, string> = {
  keyword: 'border-teal-700/15 bg-white/35 text-teal-950',
  identifier: 'border-stone-400/20 bg-white/35 text-stone-800',
  integer: 'border-amber-700/15 bg-amber-50/55 text-amber-950',
  operator: 'border-rose-700/15 bg-white/35 text-rose-950',
  punctuation: 'border-stone-400/20 bg-white/25 text-stone-600',
};

export default function TokenViewer() {
  const { artifacts, setHighlightedSpan } = useCompilerStore();
  const tokens = artifacts?.tokens ?? [];

  return (
    <div className="h-full overflow-auto border-t border-white/35 bg-white/10 p-8">
      <div className="mx-auto flex max-w-5xl flex-wrap gap-3">
        {tokens.map((token) => (
          <button
            key={token.id}
            onMouseEnter={() => setHighlightedSpan(token.span)}
            onMouseLeave={() => setHighlightedSpan(null)}
            className={`rounded-xl border px-3 py-2 text-left font-mono text-xs shadow-sm shadow-stone-900/5 backdrop-blur transition hover:-translate-y-0.5 ${colorByKind[token.kind] ?? colorByKind.punctuation}`}
          >
            <div>{token.text}</div>
            <div className="mt-1 text-[10px] opacity-60">{token.kind} · {token.span.start}:{token.span.end}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
