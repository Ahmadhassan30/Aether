"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function StackViewer() {
  const stack = useCompilerStore((state) => state.vmSnapshot?.stack ?? []);

  return (
    <div className="min-h-0 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500">Operand Stack</div>
      <div className="flex flex-col-reverse gap-1">
        {stack.length === 0 ? (
          <div className="rounded border border-zinc-800 px-3 py-2 text-xs text-zinc-500">empty</div>
        ) : stack.map((value, idx) => (
          <div key={`${idx}-${value}`} className="rounded border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 font-mono text-xs text-cyan-100">
            <span className="text-cyan-300/60">#{idx}</span> {value}
          </div>
        ))}
      </div>
    </div>
  );
}
