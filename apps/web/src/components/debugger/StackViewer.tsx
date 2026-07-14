"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function StackViewer() {
  const stack = useCompilerStore((state) => state.vmSnapshot?.stack ?? []);

  return (
    <div className="min-h-0 overflow-auto rounded-[4px] border border-[var(--hairline)] bg-[var(--canvas)] p-3">
      <div className="mb-2 text-[9px] uppercase tracking-[0.14em] text-[var(--muted)]">Stack</div>
      <div className="flex flex-col-reverse gap-1">
        {stack.length === 0 ? (
          <div className="rounded-[3px] border border-[var(--hairline)] px-2 py-1.5 text-[10px] text-[var(--muted)]">empty</div>
        ) : stack.map((value, idx) => (
          <div key={`${idx}-${value}`} className="rounded-[3px] border border-[var(--hairline)] bg-[var(--canvas-soft)] px-2 py-1.5 font-mono text-[10px] text-[var(--body-strong)]">
            <span className="text-[var(--muted)]">#{idx}</span> {value}
          </div>
        ))}
      </div>
    </div>
  );
}
