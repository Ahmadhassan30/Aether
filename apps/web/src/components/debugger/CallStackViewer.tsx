"use client";

import React, { useMemo } from 'react';
import { useCompilerStore } from '../../stores/compilerStore';
import { ListTree } from 'lucide-react';

export default function CallStackViewer() {
  const snapshot = useCompilerStore((state) => state.vmSnapshot);
  const frames = useMemo(() => snapshot?.frames ?? [], [snapshot]);

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto bg-transparent p-3 scrollbar-thin">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="flex items-center gap-2 text-[12px] font-medium text-zinc-300">
          <ListTree className="h-3.5 w-3.5 text-zinc-500" />
          Call Stack
        </h2>
        {frames.length > 0 && (
          <span className="font-mono text-[11px] text-zinc-500">
            {frames.length} Frame{frames.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto pr-1 scrollbar-none">
        {frames.length === 0 ? (
          <div className="flex-1 flex items-center justify-center rounded-md border border-dashed border-white/[0.08] p-6 text-[12px] text-zinc-500">
            No active frames
          </div>
        ) : (
          [...frames].reverse().map((frame, index) => {
            const originalIndex = frames.length - 1 - index;
            const isActive = originalIndex === frames.length - 1;

            return (
              <div
                key={`${originalIndex}-${frame.funcName}`}
                className={`flex flex-col gap-2 rounded-md border p-3 transition ${
                  isActive 
                    ? 'border-white/[0.12] bg-white/[0.055]' 
                    : 'border-white/[0.06] bg-white/[0.025] opacity-70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12px] font-medium text-zinc-100 flex items-center gap-1.5">
                    {frame.funcName}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">depth #{originalIndex}</span>
                </div>

                {frame.locals && frame.locals.length > 0 && (
                  <div className="border-t border-white/[0.06] pt-2 mt-1">
                    <table className="w-full text-left font-mono text-[11px]">
                      <thead>
                        <tr className="text-zinc-500 text-[10px]">
                          <th className="pb-1 font-medium">Local</th>
                          <th className="pb-1 text-right font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {frame.locals.map((local) => (
                          <tr key={local.name} className="border-b border-white/[0.04] last:border-0">
                            <td className="py-1.5 text-zinc-400">{local.name}</td>
                            <td className="py-1.5 text-right text-zinc-200">{local.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
