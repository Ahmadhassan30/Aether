"use client";

import React, { useMemo } from 'react';
import { useCompilerStore } from '../../stores/compilerStore';
import { Activity } from 'lucide-react';

export default function StackViewer() {
  const snapshot = useCompilerStore((state) => state.vmSnapshot);
  const stack = useMemo(() => snapshot?.stack ?? [], [snapshot]);

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto bg-transparent p-3 scrollbar-thin">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="flex items-center gap-2 text-[12px] font-medium text-zinc-300">
          <Activity className="h-3.5 w-3.5 text-zinc-500" />
          VM Operand Stack
        </h2>
        {stack.length > 0 && (
          <span className="font-mono text-[11px] text-zinc-500">
            {stack.length} Item{stack.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto pr-1 scrollbar-none">
        {stack.length === 0 ? (
          <div className="flex-1 flex items-center justify-center rounded-md border border-dashed border-white/[0.08] p-8 text-[12px] text-zinc-500">
            Stack Empty
          </div>
        ) : (
          // Render stack in actual vertical order (top of stack is first)
          [...stack].reverse().map((value, i) => {
            const originalIndex = stack.length - 1 - i;
            const isTop = i === 0;

            return (
              <div
                key={`${originalIndex}-${value}`}
                className={`flex items-center justify-between rounded-md border px-3 py-2 transition ${
                  isTop
                    ? 'border-white/[0.12] bg-white/[0.055]'
                    : 'border-white/[0.06] bg-white/[0.025]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-zinc-500 w-5">#{originalIndex}</span>
                  <span className="font-mono text-[12px] text-zinc-100">{value}</span>
                </div>
                {isTop && (
                  <span className="text-[10px] font-mono text-zinc-500 leading-none">
                    TOP
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
