import { create } from 'zustand';
import { DEFAULT_EXAMPLE } from '../utils/examplePrograms';

export interface TokenSnapshot {
  text: string;
  start: number;
  end: number;
}

export interface AstNodeSnapshot {
  text: string;
  start: number;
  end: number;
}

export interface HirSnapshot {
  text: string;
  start: number;
  end: number;
}

export interface ClifIrSnapshot {
  func_name: string;
  clif: string;
  start: number;
  end: number;
}

export interface DisassemblySnapshot {
  text: string;
  start?: number;
  end?: number;
}

export interface DiagnosticSnapshot {
  severity: string;
  message: string;
  start?: number;
  end?: number;
}

export interface CompileResult {
  success: boolean;
  tokens: TokenSnapshot[];
  ast: AstNodeSnapshot[];
  hir: HirSnapshot[];
  clif: ClifIrSnapshot[] | null;
  native_disassembly: string[] | null;
  vm_bytecode: DisassemblySnapshot[] | null;
  diagnostics: DiagnosticSnapshot[];
}

export interface VmSnapshot {
  pc: number;
  operand_stack: number[];
  call_stack: Array<{ func_name: string; locals: number[] }>;
  location: { start: number; end: number } | null;
  stdout_delta: string;
  stdout_full: string;
}

export interface TrapInfo {
  kind: string;
  index?: number;
  length?: number;
  message: string;
  span: { start: number; end: number } | null;
}

export interface VisualizerState {
  source: string;
  compileResult: CompileResult | null;
  activeSnapshot: VmSnapshot | null;
  selectedPanel: string;
  highlightedSpan: { start: number; end: number } | null;
  executionTargetOffset: number | null;
  isWasmReady: boolean;
  isCompiling: boolean;
  consoleOutput: string;
  trapInfo: TrapInfo | null;

  setSource: (source: string) => void;
  setCompileResult: (result: CompileResult | null) => void;
  setActiveSnapshot: (snapshot: VmSnapshot | null) => void;
  setSelectedPanel: (panel: string) => void;
  setHighlightedSpan: (span: { start: number; end: number } | null) => void;
  setExecutionTargetOffset: (offset: number | null) => void;
  setIsWasmReady: (ready: boolean) => void;
  setIsCompiling: (compiling: boolean) => void;
  setConsoleOutput: (output: string) => void;
  setTrapInfo: (trap: TrapInfo | null) => void;
}

export const useStore = create<VisualizerState>((set) => ({
  source: DEFAULT_EXAMPLE.source,
  compileResult: null,
  activeSnapshot: null,
  selectedPanel: 'Tokens',
  highlightedSpan: null,
  executionTargetOffset: null,
  isWasmReady: false,
  isCompiling: false,
  consoleOutput: '',
  trapInfo: null,

  setSource: (source) => set({ source }),
  setCompileResult: (compileResult) => set({ compileResult }),
  setActiveSnapshot: (activeSnapshot) => set({ activeSnapshot }),
  setSelectedPanel: (selectedPanel) => set({ selectedPanel }),
  setHighlightedSpan: (highlightedSpan) => set({ highlightedSpan }),
  setExecutionTargetOffset: (executionTargetOffset) => set({ executionTargetOffset }),
  setIsWasmReady: (isWasmReady) => set({ isWasmReady }),
  setIsCompiling: (isCompiling) => set({ isCompiling }),
  setConsoleOutput: (consoleOutput) => set({ consoleOutput }),
  setTrapInfo: (trapInfo) => set({ trapInfo }),
}));
