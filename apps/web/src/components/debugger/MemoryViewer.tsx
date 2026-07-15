"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function MemoryViewer() {
  const snapshot = useCompilerStore((state) => state.vmSnapshot);
  const vmTimeline = useCompilerStore((state) => state.vmTimeline);
  const vmCursor = useCompilerStore((state) => state.vmCursor);
  const cells = useMemo(() => snapshot?.memory ?? [], [snapshot]);

  const [flashingAddresses, setFlashingAddresses] = useState<Record<string, boolean>>({});

  // Detect memory writes (value changes)
  useEffect(() => {
    if (!snapshot || vmCursor <= 0) return;
    const prevSnapshot = vmTimeline[vmCursor - 1];
    if (!prevSnapshot) return;

    const writes: Record<string, boolean> = {};
    snapshot.memory.forEach((cell) => {
      const prevCell = prevSnapshot.memory.find((c) => c.address === cell.address);
      if (!prevCell || prevCell.value !== cell.value) {
        writes[cell.address] = true;
      }
    });

    if (Object.keys(writes).length > 0) {
      setFlashingAddresses(writes);
      const timer = setTimeout(() => {
        setFlashingAddresses({});
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [snapshot, vmCursor, vmTimeline]);

  // Convert decimal number to 64-bit Hex string padding
  const formatHexValue = (val: number) => {
    // Handle negative numbers or standard conversions
    const hex = (val >>> 0).toString(16).toUpperCase();
    return `0x${hex.padStart(8, '0')}`;
  };

  return (
    <div className="flex flex-col gap-3 min-h-0 overflow-y-auto rounded-xl border border-[var(--hairline)] bg-[#0d0f12] p-4 scrollbar-thin">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-[#10B981]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
            <line x1="12" y1="2" x2="12" y2="22" />
          </svg>
          Memory
        </h2>
        {cells.length > 0 && (
          <span className="font-mono text-[10px] text-zinc-500 font-semibold bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
            {cells.length} Cell{cells.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {cells.length === 0 ? (
          <div className="flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-8 text-[11px] font-mono text-zinc-500 opacity-60">
            No active frame variables
          </div>
        ) : (
          cells.map((cell) => {
            const isFlashing = Boolean(flashingAddresses[cell.address]);

            return (
              <div
                key={`${cell.address}-${cell.variable}`}
                className={`flex flex-col gap-1.5 rounded-lg border p-3 transition-all duration-200 ${
                  isFlashing
                    ? 'bg-[#0f1d16] border-[#10b981]/50 shadow-[0_0_12px_rgba(16,185,129,0.1)] scale-[1.01]'
                    : 'bg-zinc-900/40 border-zinc-800/60 hover:border-zinc-700/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-zinc-500">{cell.address}</span>
                  <span className="font-mono text-xs font-semibold text-zinc-300 truncate max-w-[140px]">
                    {cell.variable}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-0.5">
                  {/* Hex representation */}
                  <span className="font-mono text-[10px] text-zinc-600">
                    {formatHexValue(cell.value)}
                  </span>
                  
                  {/* Decimal value */}
                  <span className="font-mono text-xs font-bold text-white flex items-center gap-1.5">
                    {isFlashing && (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-ping" />
                    )}
                    {cell.value}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
