"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function StackViewer() {
  const stack = useCompilerStore((state) => state.vmSnapshot?.stack ?? []);

  return (
    <div className="min-h-0 overflow-auto rounded-2xl border border-sky-200/10 bg-slate-950/42 p-4 shadow-xl shadow-black/20 backdrop-blur">
      <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate-500">Operand Stack</div>
      <div className="flex flex-col-reverse gap-1">
        {stack.length === 0 ? (
          <div className="rounded-xl border border-sky-200/10 px-3 py-2 text-xs text-slate-500">empty</div>
        ) : stack.map((value, idx) => (
          <div key={`${idx}-${value}`} className="rounded-xl border border-sky-300/15 bg-sky-400/10 px-3 py-2 font-mono text-xs text-sky-100">
            <span className="text-sky-300/45">#{idx}</span> {value}
          </div>
        ))}
      </div>
    </div>
  );
}
