"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useCompilerStore } from '../../stores/compilerStore';

export default function Timeline() {
  const { vmTimeline, vmCursor, setVmCursor } = useCompilerStore();

  return (
    <div className="shrink-0 border-b border-[var(--hairline)] bg-[var(--graphite)] px-4 py-3">
      <div className="mb-2 flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-medium text-[var(--body-strong)]">Time travel</div>
          <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--muted)]">VM snapshot history · 5,000 instruction rewind buffer</div>
        </div>
        <div className="flex items-center gap-3 font-mono text-[9px] text-[var(--muted)]">
          <span>PC {vmTimeline[vmCursor]?.pc ?? '—'}</span>
          <span>{vmCursor}/{Math.max(0, vmTimeline.length - 1)}</span>
        </div>
      </div>
      <div className="relative h-7">
        <div className="absolute inset-x-0 top-3 h-px bg-[var(--hairline-strong)]" />
        <motion.div
          className="absolute left-0 top-3 h-px bg-[var(--signal)]"
          animate={{ width: `${vmTimeline.length > 1 ? (vmCursor / (vmTimeline.length - 1)) * 100 : 0}%` }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
        />
        <input
          aria-label="Scrub VM snapshot history"
          type="range"
          min={0}
          max={Math.max(0, vmTimeline.length - 1)}
          value={Math.min(vmCursor, Math.max(0, vmTimeline.length - 1))}
          onChange={(event) => setVmCursor(Number(event.target.value))}
          className="vm-scrubber absolute inset-0 w-full cursor-ew-resize accent-[var(--signal)]"
        />
      </div>
    </div>
  );
}
