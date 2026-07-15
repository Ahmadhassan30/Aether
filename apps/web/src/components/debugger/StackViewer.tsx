"use client";

import React, { useMemo } from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function StackViewer() {
  const snapshot = useCompilerStore((state) => state.vmSnapshot);
  const stack = useMemo(() => snapshot?.stack ?? [], [snapshot]);
  const frames = useMemo(() => snapshot?.frames ?? [], [snapshot]);

  return (
    <div className="flex flex-col gap-6 min-h-0 overflow-y-auto rounded-xl border border-[var(--hairline)] bg-[#0d0f12] p-4 scrollbar-thin">
      {/* 1. Call Stack Section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-[#60A5FA]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4 19h16M4 14h16M4 9h16M4 4h16" />
            </svg>
            Call Stack
          </h2>
          {frames.length > 0 && (
            <span className="font-mono text-[10px] text-zinc-500 font-semibold bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
              {frames.length} Frame{frames.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        
        <div className="flex flex-col gap-2 min-h-[50px]">
          {frames.length === 0 ? (
            <div className="flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-6 text-[11px] font-mono text-zinc-500 opacity-60">
              No active frames
            </div>
          ) : (
            [...frames].reverse().map((frame, index) => {
              const originalIndex = frames.length - 1 - index;
              const isActive = originalIndex === frames.length - 1;

              return (
                <div
                  key={`${originalIndex}-${frame.funcName}`}
                  className={`flex flex-col gap-2 rounded-xl border p-3 transition-all duration-200 ${
                    isActive 
                      ? 'bg-[#181d26] border-[#3b82f6]/30 shadow-[0_0_12px_rgba(59,130,246,0.05)]' 
                      : 'bg-zinc-900/40 border-zinc-800/80 opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[13px] font-bold text-white flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-[#60A5FA] animate-pulse' : 'bg-zinc-600'}`} />
                      {frame.funcName}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">depth #{originalIndex}</span>
                  </div>

                  {frame.locals && frame.locals.length > 0 && (
                    <div className="border-t border-zinc-800/80 pt-2 mt-1">
                      <table className="w-full text-left font-mono text-[11px]">
                        <thead>
                          <tr className="text-zinc-500 text-[10px]">
                            <th className="pb-1 font-semibold">Local</th>
                            <th className="pb-1 text-right font-semibold">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {frame.locals.map((local) => (
                            <tr key={local.name} className="border-b border-zinc-800/30 last:border-0 hover:bg-zinc-800/20">
                              <td className="py-1 text-zinc-400">{local.name}</td>
                              <td className="py-1 text-right text-zinc-200 font-semibold">{local.value}</td>
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

      {/* 2. VM Operand Stack Section */}
      <div className="flex flex-col gap-3 border-t border-zinc-800/80 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-[#F59E0B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            VM Stack
          </h2>
          {stack.length > 0 && (
            <span className="font-mono text-[10px] text-zinc-500 font-semibold bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
              {stack.length} Item{stack.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          {stack.length === 0 ? (
            <div className="flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-8 text-[11px] font-mono text-zinc-500 opacity-60">
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
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-all duration-200 ${
                    isTop
                      ? 'bg-[#1c1d15] border-[#a3e635]/30 shadow-[0_0_12px_rgba(163,230,53,0.05)]'
                      : 'bg-zinc-900/40 border-zinc-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-zinc-500 w-5">#{originalIndex}</span>
                    <span className="font-mono text-xs font-bold text-white">{value}</span>
                  </div>
                  {isTop && (
                    <span className="text-[9px] font-mono font-bold text-[#a3e635] bg-[#a3e635]/10 border border-[#a3e635]/20 px-1 py-0.5 rounded leading-none">
                      TOP
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
