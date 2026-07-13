"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function Timeline() {
  const { vmTimeline, vmCursor, setVmCursor } = useCompilerStore();

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Timeline</div>
        <div className="font-mono text-xs text-zinc-400">{vmCursor}/{Math.max(0, vmTimeline.length - 1)}</div>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, vmTimeline.length - 1)}
        value={Math.min(vmCursor, Math.max(0, vmTimeline.length - 1))}
        onChange={(event) => setVmCursor(Number(event.target.value))}
        className="w-full accent-cyan-400"
      />
      <div className="mt-2 flex justify-between font-mono text-[10px] text-zinc-600">
        {vmTimeline.slice(0, 12).map((snapshot, idx) => (
          <span key={`${snapshot.pc}-${idx}`}>{idx}</span>
        ))}
      </div>
    </div>
  );
}
