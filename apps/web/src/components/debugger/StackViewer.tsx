"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function StackViewer() {
  const stack = useCompilerStore((state) => state.vmSnapshot?.stack ?? []);

  return (
    <div className="min-h-0 overflow-auto rounded-2xl border border-white/50 bg-white/35 p-4 shadow-xl shadow-stone-900/5 backdrop-blur">
      <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-stone-400">Operand Stack</div>
      <div className="flex flex-col-reverse gap-1">
        {stack.length === 0 ? (
          <div className="rounded-xl border border-white/45 px-3 py-2 text-xs text-stone-400">empty</div>
        ) : stack.map((value, idx) => (
          <div key={`${idx}-${value}`} className="rounded-xl border border-teal-700/15 bg-teal-50/60 px-3 py-2 font-mono text-xs text-teal-950">
            <span className="text-teal-800/45">#{idx}</span> {value}
          </div>
        ))}
      </div>
    </div>
  );
}
