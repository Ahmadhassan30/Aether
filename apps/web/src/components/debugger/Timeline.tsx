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
    <div className="shrink-0 border-b border-white/[0.06] bg-[#08090b] px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-4">
        <span className="text-[12px] font-medium text-zinc-400">Timeline</span>
        <div className="flex items-center gap-3 font-mono text-[11px] text-zinc-500">
          <span>PC {currentSnapshot?.pc ?? '-'}</span>
          <span>{vmCursor} / {maxSteps}</span>
        </div>
      </div>

      <div className="relative flex h-5 items-center group">
        <div className="absolute inset-x-0 h-px bg-white/10" />
        
        <motion.div
          className="absolute left-0 h-px bg-zinc-300"
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.1, ease: 'easeOut' }}
        />

        <motion.div
          className="absolute h-2.5 w-2.5 rounded-full border border-zinc-950 bg-zinc-200 pointer-events-none"
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
