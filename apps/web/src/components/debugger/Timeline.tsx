"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function Timeline() {
  const { vmTimeline, vmCursor, setVmCursor } = useCompilerStore();

  return (
    <div className="rounded-[4px] border border-[var(--hairline)] bg-[var(--canvas)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--muted)]">Timeline</div>
        <div className="font-mono text-[9px] text-[var(--muted)]">{vmCursor}/{Math.max(0, vmTimeline.length - 1)}</div>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, vmTimeline.length - 1)}
        value={Math.min(vmCursor, Math.max(0, vmTimeline.length - 1))}
        onChange={(event) => setVmCursor(Number(event.target.value))}
        className="w-full accent-[#8fb4ff]"
      />
      <div className="mt-1 flex justify-between font-mono text-[8px] text-[var(--muted)]">
        {vmTimeline.slice(0, 12).map((snapshot, idx) => (
          <span key={`${snapshot.pc}-${idx}`}>{idx}</span>
        ))}
      </div>
    </div>
  );
}
