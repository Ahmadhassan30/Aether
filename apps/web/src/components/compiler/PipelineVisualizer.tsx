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
    <div className="border-b border-white/35 bg-white/20 px-7 py-5">
      <div className="relative flex items-center justify-between gap-2">
        <div className="absolute left-4 right-4 top-[18px] h-px bg-stone-300/70" />
        {status === 'compiling' && (
          <motion.div
            className="absolute top-[16px] h-[3px] w-20 rounded-full bg-teal-600/55 blur-[1px]"
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
              className="group relative z-10 flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full border transition ${
                  failed
                    ? 'border-rose-400 bg-rose-400/40'
                    : active
                    ? 'border-teal-700 bg-teal-700 shadow-[0_0_18px_rgba(15,118,110,0.3)]'
                    : stage.status === 'success'
                    ? 'border-stone-400 bg-stone-300'
                    : 'border-stone-300 bg-white/40'
                }`}
              />
              {active && (
                <motion.span
                  layoutId="pipeline-label"
                  className="absolute top-5 rounded-full border border-white/60 bg-white/65 px-3 py-1.5 text-[10px] font-medium text-stone-800 shadow-xl shadow-stone-900/10 backdrop-blur-xl"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                >
                  {stage.label}
                </motion.span>
              )}
              <span className="mt-5 hidden max-w-[72px] truncate text-[10px] text-stone-400 group-hover:block">{idx === 0 || active ? stage.label : ''}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
