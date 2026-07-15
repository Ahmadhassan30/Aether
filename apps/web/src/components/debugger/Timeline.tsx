"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useCompilerStore } from '../../stores/compilerStore';

export default function Timeline() {
  const { vmTimeline, vmCursor, setVmCursor } = useCompilerStore();

  const currentSnapshot = vmTimeline[vmCursor];
  const maxSteps = Math.max(0, vmTimeline.length - 1);
  const percentage = maxSteps > 0 ? (vmCursor / maxSteps) * 100 : 0;

  return (
    <div className="shrink-0 border-b border-[var(--hairline)] bg-[#090b0e] px-6 py-4 flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <div className="text-[13px] font-bold text-white font-mono tracking-wide uppercase flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            Time Travel Debugger
          </div>
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest leading-none">
            5,000 Instruction Rewind Buffer · Snapshot History
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="text-zinc-500 bg-zinc-950 border border-zinc-800 px-2 py-0.5 rounded">
            PC <span className="text-[#60A5FA] font-bold">{currentSnapshot?.pc ?? '—'}</span>
          </span>
          <span className="text-zinc-500 bg-zinc-950 border border-zinc-800 px-2 py-0.5 rounded">
            Step <span className="text-white font-bold">{vmCursor}</span> / {maxSteps}
          </span>
        </div>
      </div>

      <div className="relative h-6 flex items-center group">
        {/* Track background */}
        <div className="absolute inset-x-0 h-1 rounded-full bg-zinc-800/80 group-hover:bg-zinc-800 transition-colors" />
        
        {/* Active progress fill */}
        <motion.div
          className="absolute left-0 h-1 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 shadow-[0_0_8px_rgba(96,165,250,0.3)]"
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.1, ease: 'easeOut' }}
        />

        {/* Floating slider thumb indicator */}
        <motion.div
          className="absolute h-3 w-3 rounded-full bg-white border-2 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] pointer-events-none"
          style={{ x: '-50%', left: `${percentage}%` }}
          animate={{ scale: percentage >= 0 ? 1 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />

        <input
          aria-label="Scrub VM snapshot history"
          type="range"
          min={0}
          max={maxSteps}
          value={Math.min(vmCursor, maxSteps)}
          onChange={(event) => setVmCursor(Number(event.target.value))}
          className="w-full cursor-ew-resize opacity-0 absolute inset-0 z-10"
        />
      </div>
    </div>
  );
}
