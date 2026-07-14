"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function IRAssemblyViewer() {
  const mappings = useCompilerStore((state) => state.artifacts?.irMappings ?? []);

  return (
    <div className="h-full overflow-auto bg-[var(--workspace)] p-4">
      <div className="mx-auto grid max-w-6xl gap-2">
        {mappings.map((item) => (
          <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)_18px_minmax(0,1fr)] items-stretch gap-2">
            <pre className="min-h-[92px] overflow-auto rounded-[4px] border border-[var(--hairline)] bg-[var(--canvas)] p-3 font-mono text-[10px] leading-relaxed text-[var(--body-strong)]">{item.hir}</pre>
            <div className="flex items-center justify-center text-[var(--muted)]">/</div>
            <pre className="min-h-[92px] overflow-auto rounded-[4px] border border-[var(--hairline)] bg-[var(--canvas)] p-3 font-mono text-[10px] leading-relaxed text-[var(--body-strong)]">{item.clif}</pre>
            <div className="flex items-center justify-center text-[var(--muted)]">/</div>
            <pre className="min-h-[92px] overflow-auto rounded-[4px] border border-[var(--hairline)] bg-[var(--canvas)] p-3 font-mono text-[10px] leading-relaxed text-[var(--body-strong)]">{item.assembly}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
