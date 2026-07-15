"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

const colorByKind: Record<string, string> = {
  keyword: 'border-[#3a4651] bg-[#171c22] text-[#d6dee5]',
  identifier: 'border-[var(--hairline-strong)] bg-[var(--canvas-soft)] text-[var(--body-strong)]',
  integer: 'border-[#333d46] bg-[#151a1f] text-[#aeb9c2]',
  operator: 'border-[#36434d] bg-[#151b20] text-[#c0c9d0]',
  punctuation: 'border-[var(--hairline)] bg-[var(--canvas)] text-[var(--muted)]',
};

export default function TokenViewer() {
  const { artifacts, setHighlightedSpan } = useCompilerStore();
  const tokens = artifacts?.tokens ?? [];

  return (
    <div className="h-full overflow-auto bg-[var(--workspace)] p-4">
      <div className="mx-auto flex max-w-5xl flex-wrap gap-1.5">
        {tokens.map((token) => (
          <button
            key={token.id}
            onMouseEnter={() => setHighlightedSpan(token.span)}
            onMouseLeave={() => setHighlightedSpan(null)}
            className={`rounded-[3px] border px-2 py-1.5 text-left font-mono text-[10px] transition hover:-translate-y-px hover:border-[#77716a] ${colorByKind[token.kind] ?? colorByKind.punctuation}`}
          >
            <div>{token.text}</div>
            <div className="mt-0.5 text-[8px] opacity-55">{token.kind} · {token.span.start}:{token.span.end}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
