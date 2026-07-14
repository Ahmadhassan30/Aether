"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

const colorByKind: Record<string, string> = {
  keyword: 'border-[#526788] bg-[#29313f] text-[#c3d4f7]',
  identifier: 'border-[var(--hairline-strong)] bg-[var(--canvas-soft)] text-[var(--body-strong)]',
  integer: 'border-[#5e506a] bg-[#302a36] text-[#d2bae5]',
  operator: 'border-[#456063] bg-[#263234] text-[#b6d6d8]',
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
