"use client";

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCompilerStore } from '../../stores/compilerStore';

export default function StackViewer() {
  const stack = useCompilerStore((state) => state.vmSnapshot?.stack ?? []);

  return (
    <div className="min-h-0 overflow-auto rounded-[4px] border border-[var(--hairline)] bg-[var(--canvas)] p-3">
      <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">Stack</div>
      <motion.div layout className="flex flex-col-reverse gap-1">
        {stack.length === 0 ? (
          <div className="rounded-[3px] border border-[var(--hairline)] px-2 py-1.5 text-[13px] font-normal text-[var(--muted)]">empty</div>
        ) : (
          <AnimatePresence initial={false}>
            {stack.map((value, idx) => (
              <motion.div
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.14 }}
                key={`${idx}-${value}`}
                className="rounded-[3px] border border-[var(--hairline)] bg-[var(--canvas-soft)] px-2 py-1.5 font-mono text-[10px] text-[var(--body-strong)]"
              >
                <span className="text-[var(--muted)]">#{idx}</span> {value}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </motion.div>
    </div>
  );
}
