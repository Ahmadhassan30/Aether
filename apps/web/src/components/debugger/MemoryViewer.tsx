"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

// Custom lightweight scale functions
function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return (value: number) => {
    if (d1 === d0) return r0;
    return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
  };
}

function scaleBand(domain: number[], range: [number, number], padding = 0) {
  const [r0, r1] = range;
  const count = domain.length;
  const totalWidth = r1 - r0;
  const step = count > 0 ? totalWidth / count : totalWidth;
  const bandwidth = Math.max(1, step * (1 - padding));
  return {
    bandwidth,
    x: (index: number) => r0 + index * step + (step * padding) / 2
  };
}

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
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [snapshot, vmCursor, vmTimeline]);

  // Compute Layout scale
  const cellHeight = 56;
  const totalHeight = cells.length * cellHeight;
  const yScaler = useMemo(() => {
    const domain = cells.map((_, i) => i);
    return scaleBand(domain, [0, totalHeight], 0.15);
  }, [cells, totalHeight]);

  const maxVal = useMemo(() => {
    if (cells.length === 0) return 10;
    return Math.max(...cells.map((c) => Math.abs(c.value)), 10);
  }, [cells]);

  const widthScaler = useMemo(() => scaleLinear([0, maxVal], [0, 75]), [maxVal]);

  return (
    <div className="flex flex-col gap-2.5 min-h-0 overflow-auto rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-4">
      <div className="flex items-center justify-between">
        {/* Section Header: Geist / Inter | 20px | 700 */}
        <h2 className="font-sans text-[20px] font-bold text-[var(--ink)] leading-none">
          Memory
        </h2>
        {cells.length > 0 && (
          <span className="font-mono text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--signal)]">
            {cells.length} cells
          </span>
        )}
      </div>

      <div 
        style={{ height: `${Math.max(60, totalHeight)}px` }}
        className="relative w-full rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas-soft)] overflow-hidden"
      >
        {cells.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-[12px] font-normal opacity-55 text-[var(--muted)]">
            NO ACTIVE FRAME VARIABLES
          </div>
        ) : (
          cells.map((cell, idx) => {
            const yPos = yScaler.x(idx);
            const isFlashing = Boolean(flashingAddresses[cell.address]);

            return (
              <div
                key={`${cell.address}-${cell.variable}`}
                style={{
                  position: 'absolute',
                  top: `${yPos}px`,
                  left: '8px',
                  right: '8px',
                  height: `${yScaler.bandwidth}px`,
                  backgroundColor: 'var(--panel)',
                  border: isFlashing ? '2px solid var(--signal)' : '1px solid var(--hairline)',
                  boxShadow: isFlashing ? '0 0 10px rgba(120, 166, 194, 0.4)' : 'none',
                  transition: 'border 0.1s ease-out, box-shadow 0.1s ease-out',
                }}
                className="flex items-center rounded-[6px] px-3 gap-3"
              >
                {/* 1. Address (Secondary Metadata): Geist Mono | 12px | 400 | 55% opacity */}
                <div className="font-mono text-[12px] font-normal text-[var(--muted)] opacity-55 w-[42px] shrink-0">
                  {cell.address}
                </div>

                {/* 2. Variable (Primary Content): Geist Mono | 16px | 600 */}
                <div className="font-mono text-[16px] font-semibold text-[var(--body-strong)] truncate max-w-[85px] shrink-0">
                  {cell.variable}
                </div>

                {/* 3. Value size horizontal bar (Math scale driven) */}
                <svg width="75" height="12" className="overflow-visible pointer-events-none shrink-0">
                  <rect
                    width={widthScaler(Math.abs(cell.value))}
                    height="6"
                    y="3"
                    fill="var(--signal)"
                    rx="1.5"
                    style={{ transition: 'width 250ms cubic-bezier(0.16, 1, 0.3, 1)' }}
                    className="opacity-70"
                  />
                </svg>

                {/* 4. Value (Primary Content): Geist Mono | 16px | 600 */}
                <div className="ml-auto font-mono text-[16px] font-semibold text-[var(--ink)] shrink-0">
                  {cell.value}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
