"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

const colorByKind: Record<string, string> = {
  keyword: 'border-sky-400/25 bg-sky-400/10 text-sky-100',
  identifier: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100',
  integer: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
  operator: 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-100',
  punctuation: 'border-zinc-600 bg-zinc-800/60 text-zinc-200',
};

export default function TokenViewer() {
  const { artifacts, setHighlightedSpan } = useCompilerStore();
  const tokens = artifacts?.tokens ?? [];

  return (
    <div className="h-full overflow-auto border-t border-zinc-800 bg-zinc-950 p-4">
      <div className="flex flex-wrap gap-2">
        {tokens.map((token) => (
          <button
            key={token.id}
            onMouseEnter={() => setHighlightedSpan(token.span)}
            onMouseLeave={() => setHighlightedSpan(null)}
            className={`rounded-md border px-2.5 py-2 text-left font-mono text-xs transition hover:-translate-y-0.5 ${colorByKind[token.kind] ?? colorByKind.punctuation}`}
          >
            <div>{token.text}</div>
            <div className="mt-1 text-[10px] opacity-60">{token.kind} · {token.span.start}:{token.span.end}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
