"use client";

import { motion } from 'framer-motion';
import { useCompilerStore } from '../../stores/compilerStore';
import type { CompilerStageId } from '../../types/compiler';

interface PipelineStep {
  key: string;
  label: string;
  view: CompilerStageId;
  statusFrom: CompilerStageId;
}

const FRONTEND: PipelineStep[] = [
  { key: 'source', label: 'Source', view: 'source', statusFrom: 'source' },
  { key: 'cpp', label: 'Preprocess', view: 'source', statusFrom: 'source' },
  { key: 'lexer', label: 'Lexer', view: 'lexer', statusFrom: 'lexer' },
  { key: 'ast', label: 'Parser · AST', view: 'ast', statusFrom: 'ast' },
  { key: 'hir', label: 'Semantic · HIR', view: 'hir', statusFrom: 'hir' },
];

const NATIVE: PipelineStep[] = [
  { key: 'cfg', label: 'CFG', view: 'cfg', statusFrom: 'cfg' },
  { key: 'cranelift', label: 'Cranelift', view: 'assembly', statusFrom: 'codegen' },
  { key: 'native', label: 'Native', view: 'assembly', statusFrom: 'assembly' },
];

const VM: PipelineStep[] = [
  { key: 'bytecode', label: 'Bytecode', view: 'bytecode', statusFrom: 'bytecode' },
  { key: 'verifier', label: 'Verifier', view: 'bytecode', statusFrom: 'bytecode' },
  { key: 'vm', label: 'VM', view: 'execution', statusFrom: 'execution' },
];

function PipelineButton({ step, index }: { step: PipelineStep; index: number }) {
  const { artifacts, selectedStage, setSelectedStage } = useCompilerStore();
  const stageStatus = artifacts?.pipeline.find((stage) => stage.id === step.statusFrom)?.status ?? 'idle';
  const active = selectedStage === step.view;

  return (
    <button
      onClick={() => setSelectedStage(step.view)}
      className={`pipeline-step relative flex min-w-0 items-center gap-2 rounded-[3px] border px-2.5 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[var(--signal)] ${active ? 'border-[var(--hairline-strong)] bg-[var(--raised)] text-[var(--ink)]' : 'border-transparent text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--body-strong)]'}`}
    >
      <span className="font-mono text-[8px] text-[var(--muted)]">{String(index).padStart(2, '0')}</span>
      <span className="truncate text-[10px] font-medium">{step.label}</span>
      <span className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${stageStatus === 'error' ? 'bg-[var(--danger)]' : active ? 'bg-[var(--signal)]' : stageStatus === 'success' ? 'bg-[#59656f]' : 'bg-[#303841]'}`} />
      {active && <motion.span layoutId="active-pipeline-step" className="absolute inset-x-2 -bottom-px h-px bg-[var(--signal)]" transition={{ duration: 0.18 }} />}
    </button>
  );
}

export default function PipelineVisualizer() {
  const status = useCompilerStore((state) => state.status);

  return (
    <nav aria-label="Compiler pipeline" className="pipeline-spine relative shrink-0 border-b border-[var(--hairline)] bg-[var(--graphite)] px-3 py-2">
      {status === 'compiling' && (
        <motion.div
          aria-hidden="true"
          className="absolute left-0 top-0 h-px w-24 bg-[var(--signal)]"
          initial={{ x: 0 }}
          animate={{ x: 'calc(100vw - 6rem)' }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
        />
      )}
      <div className="pipeline-layout mx-auto flex max-w-[1500px] items-stretch gap-2">
        <div className="pipeline-front grid min-w-0 flex-1 grid-cols-5 gap-1">
          {FRONTEND.map((step, index) => <PipelineButton key={step.key} step={step} index={index + 1} />)}
        </div>

        <div className="pipeline-branch-label flex w-10 shrink-0 items-center justify-center font-mono text-[9px] text-[var(--muted)]">HIR</div>

        <div className="pipeline-backends grid min-w-0 flex-1 grid-rows-2 gap-1 border-l border-[var(--hairline)] pl-2">
          <div className="grid grid-cols-[54px_repeat(3,minmax(0,1fr))] items-center gap-1">
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--muted)]">Native</span>
            {NATIVE.map((step, index) => <PipelineButton key={step.key} step={step} index={index + 6} />)}
          </div>
          <div className="grid grid-cols-[54px_repeat(3,minmax(0,1fr))] items-center gap-1">
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--muted)]">Debug</span>
            {VM.map((step, index) => <PipelineButton key={step.key} step={step} index={index + 9} />)}
          </div>
        </div>
      </div>
    </nav>
  );
}
