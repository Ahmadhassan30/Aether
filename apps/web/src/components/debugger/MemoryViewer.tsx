"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { useCompilerStore } from '../../stores/compilerStore';
import { Database } from 'lucide-react';

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
    const hex = (val >>> 0).toString(16).toUpperCase();
    return `0x${hex.padStart(8, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto bg-transparent p-3 scrollbar-thin">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="flex items-center gap-2 text-[12px] font-medium text-zinc-300">
          <Database className="h-3.5 w-3.5 text-zinc-500" />
          Memory Viewer
        </h2>
        {cells.length > 0 && (
          <span className="font-mono text-[11px] text-zinc-500">
            {cells.length} Cell{cells.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto pr-1 scrollbar-none">
        {cells.length === 0 ? (
          <div className="flex-1 flex items-center justify-center rounded-md border border-dashed border-white/[0.08] p-8 text-[12px] text-zinc-500">
            No active frame variables
          </div>
        ) : (
          cells.map((cell) => {
            const isFlashing = Boolean(flashingAddresses[cell.address]);

            return (
              <div
                key={`${cell.address}-${cell.variable}`}
                className={`flex flex-col gap-1.5 rounded-md border p-3 transition ${
                  isFlashing
                    ? 'border-zinc-400/30 bg-white/[0.07]'
                    : 'border-white/[0.06] bg-white/[0.025]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-zinc-500">{cell.address}</span>
                  <span className="font-mono text-xs font-semibold text-zinc-300 truncate max-w-[140px]">
                    {cell.variable}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-mono text-[10px] text-zinc-600">
                    {formatHexValue(cell.value)}
                  </span>
                  
                  <span className="font-mono text-[12px] text-zinc-100 flex items-center gap-1.5">
                    {isFlashing && (
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
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
