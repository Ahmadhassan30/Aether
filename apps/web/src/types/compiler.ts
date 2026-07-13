import type { CompileResult as WasmCompileResult } from '../store/useStore';

export type CompilerStageId =
  | 'source'
  | 'lexer'
  | 'parser'
  | 'ast'
  | 'hir'
  | 'cfg'
  | 'codegen'
  | 'assembly'
  | 'bytecode'
  | 'execution';

export interface SourceSpan {
  start: number;
  end: number;
}

export interface CompilerToken {
  id: string;
  text: string;
  kind: string;
  span: SourceSpan;
}

export interface GraphNodeMeta {
  title: string;
  type?: string;
  detail?: string;
  span?: SourceSpan;
  rows?: Array<{ label: string; value: string }>;
}

export interface CompilerGraphNode {
  id: string;
  label: string;
  kind: string;
  detail?: string;
  span?: SourceSpan;
  x: number;
  y: number;
  meta: GraphNodeMeta;
}

export interface CompilerGraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind?: string;
}

export interface CompilerGraph {
  nodes: CompilerGraphNode[];
  edges: CompilerGraphEdge[];
}

export interface PipelineStage {
  id: CompilerStageId;
  label: string;
  status: 'idle' | 'running' | 'success' | 'error';
  count?: number;
}

export interface IrAssemblyMapping {
  id: string;
  hir: string;
  clif: string;
  assembly: string;
  span?: SourceSpan;
}

export interface BytecodeInstruction {
  pc: number;
  text: string;
  opcode: string;
  span?: SourceSpan;
}

export interface VmFrameView {
  funcName: string;
  locals: Array<{ name: string; value: number }>;
}

export interface VmMemoryCell {
  address: string;
  variable: string;
  value: number;
}

export interface VmSnapshotView {
  pc: number;
  stack: number[];
  frames: VmFrameView[];
  memory: VmMemoryCell[];
  stdout: string;
  span: SourceSpan | null;
}

export interface CompilerDiagnostic {
  severity: string;
  message: string;
  span?: SourceSpan;
}

export interface CompilerArtifacts {
  success: boolean;
  tokens: CompilerToken[];
  ast: CompilerGraph;
  hir: CompilerGraph;
  cfg: CompilerGraph;
  pipeline: PipelineStage[];
  irMappings: IrAssemblyMapping[];
  bytecode: BytecodeInstruction[];
  diagnostics: CompilerDiagnostic[];
  rawText: {
    ast: string;
    hir: string;
    clif: string;
    assembly: string;
  };
  wasmResult: WasmCompileResult | null;
}

export interface CompilerService {
  initialize(): Promise<boolean>;
  compile(source: string): Promise<CompilerArtifacts>;
  getTokens(source: string): CompilerToken[];
  getAST(source: string, result?: WasmCompileResult | null): CompilerGraph;
  getHIR(source: string, result?: WasmCompileResult | null): CompilerGraph;
  getCFG(source: string, result?: WasmCompileResult | null): CompilerGraph;
  getCraneliftIR(result?: WasmCompileResult | null): string;
  getAssembly(result?: WasmCompileResult | null): string;
  getBytecode(result?: WasmCompileResult | null): BytecodeInstruction[];
  resetVM(source: string): VmSnapshotView | null;
  stepVM(): VmSnapshotView | null;
  rewindVM(steps: number): VmSnapshotView | null;
  runVM(): { snapshot: VmSnapshotView | null; exitCode: number | null };
}
