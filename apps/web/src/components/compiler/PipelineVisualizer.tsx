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

const canonicalStep: Partial<Record<CompilerStageId, string>> = {
  source: 'source',
  lexer: 'lexer',
  parser: 'ast',
  ast: 'ast',
  hir: 'hir',
  cfg: 'cfg',
  codegen: 'cranelift',
  assembly: 'native',
  bytecode: 'bytecode',
  execution: 'vm',
};

function PipelineButton({ step, index }: { step: PipelineStep; index: number }) {
  const { artifacts, selectedStage, setSelectedStage } = useCompilerStore();
  const stageStatus = artifacts?.pipeline.find((stage) => stage.id === step.statusFrom)?.status ?? 'idle';
  const active = canonicalStep[selectedStage] === step.key;
  const complete = stageStatus === 'success';

  return (
    <button
      onClick={() => setSelectedStage(step.view)}
      className={`pipeline-step relative flex min-w-0 items-center gap-2 rounded-[4px] border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[var(--signal)] ${active ? 'border-[var(--hairline-strong)] bg-[var(--raised)] text-[var(--ink)]' : complete ? 'border-transparent text-[var(--ink)] hover:bg-[var(--panel)]' : 'border-transparent text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--body-strong)]'}`}
    >
      <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] font-medium text-[var(--muted)]">
        {String(index).padStart(2, '0')}
        <span className={`h-2 w-2 rounded-full border ${stageStatus === 'error' ? 'border-[var(--danger)] bg-[var(--danger)]' : active ? 'border-[var(--signal)] bg-[var(--signal)]' : complete ? 'border-[#7b8994] bg-[#7b8994]' : 'border-[var(--hairline-strong)] bg-transparent'}`} />
      </span>
      <span className={`truncate ${active ? 'text-[14px] font-semibold' : 'text-[13px] font-normal opacity-60'}`}>{step.label}</span>
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

        <div className="pipeline-backends grid min-w-0 flex-1 grid-rows-2 gap-1 border-l border-[var(--hairline)] pl-2">
          <div className="grid grid-cols-3 items-center gap-1">
            {NATIVE.map((step, index) => <PipelineButton key={step.key} step={step} index={index + 6} />)}
          </div>
          <div className="grid grid-cols-3 items-center gap-1 border-t border-[var(--hairline)] pt-1">
            {VM.map((step, index) => <PipelineButton key={step.key} step={step} index={index + 9} />)}
          </div>
        </div>
      </div>
    </nav>
  );
}
