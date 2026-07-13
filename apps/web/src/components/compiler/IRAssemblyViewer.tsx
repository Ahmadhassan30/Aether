"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function IRAssemblyViewer() {
  const mappings = useCompilerStore((state) => state.artifacts?.irMappings ?? []);

  return (
    <div className="h-full overflow-auto border-t border-sky-200/10 bg-slate-950/20 p-8">
      <div className="mx-auto grid max-w-6xl gap-4">
        {mappings.map((item) => (
          <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_28px_minmax(0,1fr)] items-stretch gap-4">
            <pre className="min-h-[92px] overflow-auto rounded-2xl border border-sky-200/10 bg-slate-950/48 p-4 font-mono text-xs leading-relaxed text-slate-200 shadow-xl shadow-black/20 backdrop-blur">{item.hir}</pre>
            <div className="flex items-center justify-center text-slate-600">/</div>
            <pre className="min-h-[92px] overflow-auto rounded-2xl border border-sky-200/10 bg-slate-950/48 p-4 font-mono text-xs leading-relaxed text-slate-200 shadow-xl shadow-black/20 backdrop-blur">{item.clif}</pre>
            <div className="flex items-center justify-center text-slate-600">/</div>
            <pre className="min-h-[92px] overflow-auto rounded-2xl border border-sky-200/10 bg-slate-950/48 p-4 font-mono text-xs leading-relaxed text-slate-200 shadow-xl shadow-black/20 backdrop-blur">{item.assembly}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
