"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Circle, XCircle } from 'lucide-react';
import { useCompilerStore } from '../../stores/compilerStore';
import type { CompilerStageId } from '../../types/compiler';

const stageViews: CompilerStageId[] = ['source', 'lexer', 'ast', 'hir', 'cfg', 'codegen', 'assembly', 'bytecode', 'execution'];

export default function PipelineVisualizer() {
  const { artifacts, selectedStage, setSelectedStage, status } = useCompilerStore();
  const stages = artifacts?.pipeline.filter((stage) => stageViews.includes(stage.id)) ?? [];

  return (
    <div className="border-b border-zinc-800 bg-zinc-950/95 px-4 py-3">
      <div className="flex items-center gap-2 overflow-x-auto">
        {stages.map((stage, idx) => {
          const active = selectedStage === stage.id;
          const failed = stage.status === 'error';
          const Icon = failed ? XCircle : stage.status === 'success' ? CheckCircle2 : Circle;
          return (
            <React.Fragment key={stage.id}>
              <button
                onClick={() => setSelectedStage(stage.id)}
                className={`relative flex min-w-[108px] items-center gap-2 rounded-md border px-3 py-2 text-left transition ${
                  active
                    ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                    : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="pipeline-active"
                    className="absolute inset-0 rounded-md ring-1 ring-cyan-300/20"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon className={`h-4 w-4 ${failed ? 'text-rose-400' : stage.status === 'success' ? 'text-emerald-400' : 'text-zinc-600'}`} />
                <div className="relative min-w-0">
                  <div className="truncate text-xs font-semibold">{stage.label}</div>
                  {stage.count !== undefined && <div className="font-mono text-[10px] text-zinc-500">{stage.count}</div>}
                </div>
              </button>
              {idx < stages.length - 1 && (
                <motion.div
                  animate={{ opacity: status === 'compiling' ? [0.35, 1, 0.35] : 0.55 }}
                  transition={{ duration: 1.4, repeat: status === 'compiling' ? Infinity : 0 }}
                  className="shrink-0 text-zinc-600"
                >
                  <ArrowRight className="h-4 w-4" />
                </motion.div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
