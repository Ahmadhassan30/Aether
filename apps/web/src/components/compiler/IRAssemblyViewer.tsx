"use client";

import React from 'react';
import { ArrowDown } from 'lucide-react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function IRAssemblyViewer() {
  const mappings = useCompilerStore((state) => state.artifacts?.irMappings ?? []);

  return (
    <div className="h-full overflow-auto border-t border-zinc-800 bg-zinc-950 p-4">
      <div className="grid gap-3">
        {mappings.map((item) => (
          <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)_32px_minmax(0,1fr)] items-stretch gap-3">
            <pre className="min-h-[74px] overflow-auto rounded-md border border-indigo-400/15 bg-indigo-400/10 p-3 font-mono text-xs leading-relaxed text-indigo-100">{item.hir}</pre>
            <div className="flex items-center justify-center text-zinc-600"><ArrowDown className="-rotate-90" /></div>
            <pre className="min-h-[74px] overflow-auto rounded-md border border-cyan-400/15 bg-cyan-400/10 p-3 font-mono text-xs leading-relaxed text-cyan-100">{item.clif}</pre>
            <div className="flex items-center justify-center text-zinc-600"><ArrowDown className="-rotate-90" /></div>
            <pre className="min-h-[74px] overflow-auto rounded-md border border-emerald-400/15 bg-emerald-400/10 p-3 font-mono text-xs leading-relaxed text-emerald-100">{item.assembly}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
