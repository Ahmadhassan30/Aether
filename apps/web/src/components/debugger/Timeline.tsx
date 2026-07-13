"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function Timeline() {
  const { vmTimeline, vmCursor, setVmCursor } = useCompilerStore();

  return (
    <div className="rounded-2xl border border-sky-200/10 bg-slate-950/42 p-4 shadow-xl shadow-black/20 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Timeline</div>
        <div className="font-mono text-xs text-slate-400">{vmCursor}/{Math.max(0, vmTimeline.length - 1)}</div>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, vmTimeline.length - 1)}
        value={Math.min(vmCursor, Math.max(0, vmTimeline.length - 1))}
        onChange={(event) => setVmCursor(Number(event.target.value))}
        className="w-full accent-sky-300"
      />
      <div className="mt-2 flex justify-between font-mono text-[10px] text-slate-600">
        {vmTimeline.slice(0, 12).map((snapshot, idx) => (
          <span key={`${snapshot.pc}-${idx}`}>{idx}</span>
        ))}
      </div>
    </div>
  );
}
