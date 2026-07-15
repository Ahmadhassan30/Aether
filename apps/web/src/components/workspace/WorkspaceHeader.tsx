"use client";

import { Check, Play } from 'lucide-react';
import type { ExampleProgram } from '../../utils/examplePrograms';

interface WorkspaceHeaderProps {
  documentName: string;
  status: 'booting' | 'ready' | 'compiling' | 'error';
  latency: number | null;
  onCompile: () => void;
  examples: ExampleProgram[];
  activeExampleId: string | null;
  onSelectExample: (example: ExampleProgram) => void;
}

export default function WorkspaceHeader({ documentName, status, latency, onCompile, examples, activeExampleId, onSelectExample }: WorkspaceHeaderProps) {
  const busy = status === 'booting' || status === 'compiling';

  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--hairline)] bg-[var(--canvas)] px-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-[18px] font-bold tracking-[-0.03em] text-[var(--ink)]">Aether</span>
        <span className="h-3 w-px bg-[var(--hairline-strong)] max-[520px]:hidden" />
        <select
          aria-label="Example program"
          value={activeExampleId ?? 'custom'}
          onChange={(event) => {
            const example = examples.find((item) => item.id === event.target.value);
            if (example) onSelectExample(example);
          }}
          className="max-w-[200px] truncate border-0 bg-transparent text-[13px] font-medium text-[var(--muted)] outline-none max-[520px]:hidden"
        >
          {!activeExampleId && <option value="custom">{documentName}</option>}
          {examples.map((example) => <option key={example.id} value={example.id}>{example.title}</option>)}
        </select>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className={`h-1.5 w-1.5 rounded-full ${status === 'error' ? 'bg-[#e06c75]' : busy ? 'animate-pulse bg-[#8fb4ff]' : 'bg-[#7db88a]'}`} title={status} />
        {latency !== null && !busy && <span className="hidden font-mono text-[13px] font-medium text-[var(--muted)] sm:block">{latency.toFixed(1)} ms</span>}
        <button onClick={onCompile} className="flex h-8 items-center gap-1.5 rounded-[3px] bg-[var(--ink)] px-3 text-[13px] font-medium text-[var(--canvas)] transition hover:bg-white">
          {status === 'ready' ? <Check className="h-3 w-3" /> : <Play className="h-3 w-3 fill-current" />}
          Compile
        </button>
      </div>
    </header>
  );
}
