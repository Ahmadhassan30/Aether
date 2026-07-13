"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function Timeline() {
  const { vmTimeline, vmCursor, setVmCursor } = useCompilerStore();

  return (
    <div className="rounded-2xl border border-white/50 bg-white/35 p-4 shadow-xl shadow-stone-900/5 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400">Timeline</div>
        <div className="font-mono text-xs text-stone-500">{vmCursor}/{Math.max(0, vmTimeline.length - 1)}</div>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, vmTimeline.length - 1)}
        value={Math.min(vmCursor, Math.max(0, vmTimeline.length - 1))}
        onChange={(event) => setVmCursor(Number(event.target.value))}
        className="w-full accent-teal-700"
      />
      <div className="mt-2 flex justify-between font-mono text-[10px] text-stone-400">
        {vmTimeline.slice(0, 12).map((snapshot, idx) => (
          <span key={`${snapshot.pc}-${idx}`}>{idx}</span>
        ))}
      </div>
    </div>
  );
}
