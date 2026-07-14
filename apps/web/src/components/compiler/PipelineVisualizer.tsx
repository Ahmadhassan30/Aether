"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useCompilerStore } from '../../stores/compilerStore';
import type { CompilerStageId } from '../../types/compiler';

const stageViews: CompilerStageId[] = ['source', 'lexer', 'ast', 'hir', 'cfg', 'codegen', 'assembly', 'bytecode', 'execution'];

export default function PipelineVisualizer() {
  const { artifacts, selectedStage, setSelectedStage, status } = useCompilerStore();
  const stages = artifacts?.pipeline.filter((stage) => stageViews.includes(stage.id)) ?? [];

  return (
    <div className="border-b border-[var(--hairline)] bg-[var(--canvas-soft)] px-4 py-3">
      <div className="relative flex items-center justify-between gap-2">
        <div className="absolute left-3 right-3 top-[5px] h-px bg-[var(--hairline-strong)]" />
        {status === 'compiling' && (
          <motion.div
            className="absolute top-[4px] h-[2px] w-16 bg-[#8fb4ff]"
            initial={{ left: '2%' }}
            animate={{ left: ['2%', '84%', '2%'] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        {stages.map((stage, idx) => {
          const active = selectedStage === stage.id;
          const failed = stage.status === 'error';
          return (
            <button
              key={stage.id}
              onClick={() => setSelectedStage(stage.id)}
              className="group relative z-10 flex min-w-0 flex-1 flex-col items-center gap-1.5"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full border-2 border-[var(--canvas-soft)] transition ${
                  failed
                    ? 'bg-[#e06c75]'
                    : active
                    ? 'bg-[#8fb4ff] shadow-[0_0_0_2px_rgba(143,180,255,.16)]'
                    : stage.status === 'success'
                    ? 'bg-[#77716a]'
                    : 'bg-[#4e4944]'
                }`}
              />
              {active && (
                <motion.span
                  layoutId="pipeline-label"
                  className="absolute top-4 whitespace-nowrap rounded-[3px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-2 py-1 text-[9px] font-medium text-[var(--ink)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                >
                  {stage.label}
                </motion.span>
              )}
              <span className="mt-4 h-3 max-w-[64px] truncate text-[8px] uppercase tracking-[0.08em] text-[var(--muted)]">{idx === 0 || active || idx === stages.length - 1 ? stage.label : ''}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
