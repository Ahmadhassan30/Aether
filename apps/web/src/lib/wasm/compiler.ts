"use client";

import init, { compile, disassemble, VmHandle } from 'aether-wasm';
import type { CompileResult as WasmCompileResult, VmSnapshot } from '../../store/useStore';
import type {
  BytecodeInstruction,
  CompilerArtifacts,
  CompilerDiagnostic,
  CompilerGraphEdge,
  CompilerGraph,
  CompilerGraphNode,
  CompilerService,
  CompilerToken,
  IrAssemblyMapping,
  PipelineStage,
  SourceSpan,
  VmSnapshotView,
} from '../../types/compiler';

const STAGES: PipelineStage[] = [
  { id: 'source', label: 'Source', status: 'idle' },
  { id: 'lexer', label: 'Lexer', status: 'idle' },
  { id: 'parser', label: 'Parser', status: 'idle' },
  { id: 'ast', label: 'AST', status: 'idle' },
  { id: 'hir', label: 'HIR', status: 'idle' },
  { id: 'cfg', label: 'CFG', status: 'idle' },
  { id: 'codegen', label: 'Codegen', status: 'idle' },
  { id: 'assembly', label: 'Assembly', status: 'idle' },
  { id: 'bytecode', label: 'Bytecode', status: 'idle' },
  { id: 'execution', label: 'Execution', status: 'idle' },
];

const keywordSet = new Set([
  'int',
  'return',
  'if',
  'else',
  'while',
  'for',
  'void',
  'char',
  'struct',
  'unsigned',
]);

function classifyToken(text: string): string {
  if (keywordSet.has(text)) return 'keyword';
  if (/^\d+$/.test(text)) return 'integer';
  if (/^[A-Za-z_]\w*$/.test(text)) return 'identifier';
  if (/^[{}()[\];,]$/.test(text)) return 'punctuation';
  return 'operator';
}

function lexSource(source: string): CompilerToken[] {
  const tokens: CompilerToken[] = [];
  const re = /[A-Za-z_]\w*|\d+|==|!=|<=|>=|\+\+|--|\+=|-=|->|&&|\|\||[{}()[\];,+\-*/%=<>.&]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    tokens.push({
      id: `tok-${match.index}-${tokens.length}`,
      text: match[0],
      kind: classifyToken(match[0]),
      span: { start: match.index, end: match.index + match[0].length },
    });
  }
  return tokens;
}

function fromWasmTokens(result: WasmCompileResult | null | undefined, source: string): CompilerToken[] {
  if (!result?.tokens?.length) return lexSource(source);
  return result.tokens
    .map((token, idx) => ({
      id: `tok-${token.start}-${idx}`,
      text: token.text,
      kind: classifyToken(token.text),
      span: { start: token.start, end: token.end },
    }))
    .filter((tok) => tok.text.trim() !== '');
}

function node(
  id: string,
  label: string,
  kind: string,
  x: number,
  y: number,
  detail?: string,
  span?: SourceSpan
): CompilerGraphNode {
  return {
    id,
    label,
    kind,
    detail,
    span,
    x,
    y,
    meta: {
      title: label,
      type: kind,
      detail,
      span,
      rows: [
        { label: 'kind', value: kind },
        ...(detail ? [{ label: 'detail', value: detail }] : []),
        ...(span ? [{ label: 'span', value: `${span.start}..${span.end}` }] : []),
      ],
    },
  };
}

function extractFunctionName(source: string): string {
  return source.match(/\b([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/)?.[1] ?? 'main';
}

function buildExpressionAst(source: string): CompilerGraph {
  const functionName = extractFunctionName(source);
  const root = node('ast-root', 'TranslationUnit', 'Program', 320, 20, 'MiniLang++ source file', {
    start: 0,
    end: source.length,
  });
  const fnSpanStart = Math.max(0, source.indexOf(functionName));
  const fn = node('ast-fn', functionName, 'FunctionDecl', 320, 140, 'entry function', {
    start: fnSpanStart,
    end: Math.min(source.length, source.indexOf('{') + 1 || source.length),
  });

  const graph: CompilerGraph = {
    nodes: [root, fn],
    edges: [{ id: 'ast-e-root-fn', source: root.id, target: fn.id, label: 'decl' }],
  };

  const decl = source.match(/\bint\s+([A-Za-z_]\w*)\s*=\s*([^;]+);/);
  const ret = source.match(/\breturn\s+([^;]+);/);

  if (decl) {
    const declStart = decl.index ?? 0;
    const declNode = node('ast-decl', `int ${decl[1]}`, 'VariableDecl', 150, 270, 'local binding', {
      start: declStart,
      end: declStart + decl[0].length,
    });
    graph.nodes.push(declNode);
    graph.edges.push({ id: 'ast-e-fn-decl', source: fn.id, target: declNode.id, label: 'body' });
    addExpressionNodes(graph, decl[2], declStart + decl[0].indexOf(decl[2]), declNode.id, 150, 395);
  }

  if (ret) {
    const retStart = ret.index ?? 0;
    const retNode = node('ast-return', 'Return', 'ReturnStmt', 500, 270, 'function result', {
      start: retStart,
      end: retStart + ret[0].length,
    });
    graph.nodes.push(retNode);
    graph.edges.push({ id: 'ast-e-fn-return', source: fn.id, target: retNode.id, label: 'body' });
    addExpressionNodes(graph, ret[1], retStart + ret[0].indexOf(ret[1]), retNode.id, 500, 395);
  }

  return graph;
}

function addExpressionNodes(
  graph: CompilerGraph,
  expr: string,
  spanStart: number,
  parentId: string,
  x: number,
  y: number
) {
  const binary = expr.match(/^(.+?)\s*([+\-*/%<>])\s*(.+)$/);
  if (binary) {
    const opNode = node(`ast-expr-${graph.nodes.length}`, binary[2], 'BinaryExpression', x, y, `operator ${binary[2]}`, {
      start: spanStart,
      end: spanStart + expr.length,
    });
    graph.nodes.push(opNode);
    graph.edges.push({ id: `ast-e-${parentId}-${opNode.id}`, source: parentId, target: opNode.id, label: 'expr' });
    addLeaf(graph, binary[1].trim(), spanStart, opNode.id, x - 130, y + 125, 'left');
    addLeaf(graph, binary[3].trim(), spanStart + expr.lastIndexOf(binary[3]), opNode.id, x + 130, y + 125, 'right');
    return;
  }
  addLeaf(graph, expr.trim(), spanStart, parentId, x, y, 'expr');
}

function addLeaf(
  graph: CompilerGraph,
  label: string,
  spanStart: number,
  parentId: string,
  x: number,
  y: number,
  edgeLabel: string
) {
  const kind = /^\d+$/.test(label) ? 'IntegerLiteral' : 'Identifier';
  const leaf = node(`ast-leaf-${graph.nodes.length}`, label, kind, x, y, undefined, {
    start: spanStart,
    end: spanStart + label.length,
  });
  graph.nodes.push(leaf);
  graph.edges.push({ id: `ast-e-${parentId}-${leaf.id}`, source: parentId, target: leaf.id, label: edgeLabel });
}

function buildTextGraph(text: string, rootLabel: string, kind: string): CompilerGraph {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 18);
  const root = node(`${kind}-root`, rootLabel, kind, 320, 20, `${lines.length} records`);
  const graph: CompilerGraph = { nodes: [root], edges: [] };
  lines.forEach((line, idx) => {
    const item = node(`${kind}-${idx}`, line.replace(/[{};]/g, '').slice(0, 34) || 'Block', kind, 120 + (idx % 3) * 240, 140 + Math.floor(idx / 3) * 120, line);
    graph.nodes.push(item);
    graph.edges.push({ id: `${kind}-e-${idx}`, source: idx === 0 ? root.id : `${kind}-${idx - 1}`, target: item.id });
  });
  return graph;
}

function buildHIRGraph(source: string, result: WasmCompileResult | null | undefined): CompilerGraph {
  const hirText = result?.hir?.map((h) => h.text).join('\n') ?? '';
  const ret = source.match(/\breturn\s+([^;]+);/);
  const expr = ret?.[1] ?? 'result';
  const binary = expr.match(/^(.+?)\s*([+\-*/%])\s*(.+)$/);
  if (!binary) return buildTextGraph(hirText || source, 'HIR', 'HIR');

  const left = node('hir-left', `const ${binary[1].trim()}`, 'Value', 120, 80, 'rvalue');
  const right = node('hir-right', `const ${binary[3].trim()}`, 'Value', 520, 80, 'rvalue');
  const op = node('hir-op', binary[2] === '+' ? 'ADD' : binary[2], 'Instruction', 320, 230, 'typed arithmetic');
  const retNode = node('hir-return', 'return', 'Terminator', 320, 380, 'function exit');
  return {
    nodes: [left, right, op, retNode],
    edges: [
      { id: 'hir-e-left-op', source: left.id, target: op.id, label: 'lhs' },
      { id: 'hir-e-right-op', source: right.id, target: op.id, label: 'rhs' },
      { id: 'hir-e-op-return', source: op.id, target: retNode.id, label: 'value' },
    ],
  };
}

function buildCFGGraph(source: string): CompilerGraph {
  const hasLoop = /\b(while|for)\b/.test(source);
  const hasIf = /\bif\s*\(/.test(source);
  const start = node('cfg-start', 'START', 'EntryBlock', 320, 20);
  const body = node('cfg-body', hasIf ? 'condition' : hasLoop ? 'loop test' : 'main block', 'BasicBlock', 320, 155);
  const end = node('cfg-end', 'END', 'ExitBlock', 320, hasIf || hasLoop ? 470 : 310);
  const nodes = [start, body, end];
  const edges: CompilerGraphEdge[] = [
    { id: 'cfg-e-start-body', source: start.id, target: body.id },
    { id: 'cfg-e-body-end', source: body.id, target: end.id },
  ];
  if (hasIf) {
    nodes.push(node('cfg-then', 'then', 'BasicBlock', 140, 310), node('cfg-else', 'else', 'BasicBlock', 500, 310));
    edges.splice(1, 1,
      { id: 'cfg-e-body-then', source: body.id, target: 'cfg-then', label: 'true' },
      { id: 'cfg-e-body-else', source: body.id, target: 'cfg-else', label: 'false' },
      { id: 'cfg-e-then-end', source: 'cfg-then', target: end.id },
      { id: 'cfg-e-else-end', source: 'cfg-else', target: end.id });
  } else if (hasLoop) {
    nodes.push(node('cfg-loop', 'loop body', 'BasicBlock', 320, 310));
    edges.splice(1, 1,
      { id: 'cfg-e-test-loop', source: body.id, target: 'cfg-loop', label: 'true' },
      { id: 'cfg-e-loop-test', source: 'cfg-loop', target: body.id, label: 'back' },
      { id: 'cfg-e-test-end', source: body.id, target: end.id, label: 'false' });
  }
  return { nodes, edges };
}

function buildBytecode(result: WasmCompileResult | null | undefined): BytecodeInstruction[] {
  return (result?.vm_bytecode ?? []).map((inst, idx) => {
    const text = inst.text.trim();
    return {
      pc: idx,
      text,
      opcode: text.split(/\s+/)[0] ?? 'op',
      span: inst.start !== undefined && inst.end !== undefined ? { start: inst.start, end: inst.end } : undefined,
    };
  });
}

function buildMappings(result: WasmCompileResult | null | undefined, asmLines?: string[]): IrAssemblyMapping[] {
  const hir = result?.hir?.map((h) => h.text.trim()).filter(Boolean) ?? [];
  const clif = result?.clif?.flatMap((f) => f.clif.split('\n').map((line) => line.trim()).filter(Boolean)) ?? [];
  const asm = asmLines ?? result?.native_disassembly ?? [];
  const size = Math.max(hir.length, clif.length, asm.length, 1);
  return Array.from({ length: Math.min(size, 16) }, (_, idx) => ({
    id: `map-${idx}`,
    hir: hir[idx] ?? 'semantic value',
    clif: clif[idx] ?? 'lowered operation',
    assembly: asm[idx] ?? 'target instruction',
  }));
}

function pipelineFor(result: WasmCompileResult | null, artifacts?: Partial<CompilerArtifacts>): PipelineStage[] {
  const ok = result?.success ?? true;
  return STAGES.map((stage) => ({
    ...stage,
    status: ok ? 'success' : stage.id === 'execution' ? 'idle' : 'error',
    count:
      stage.id === 'lexer' ? artifacts?.tokens?.length :
      stage.id === 'bytecode' ? artifacts?.bytecode?.length :
      undefined,
  }));
}

function mockArtifacts(source: string): CompilerArtifacts {
  const tokens = lexSource(source);
  const ast = buildExpressionAst(source);
  const hir = buildHIRGraph(source, null);
  const cfg = buildCFGGraph(source);
  const bytecode: BytecodeInstruction[] = [
    { pc: 0, opcode: 'PUSH', text: 'PUSH 5' },
    { pc: 1, opcode: 'PUSH', text: 'PUSH 3' },
    { pc: 2, opcode: 'ADD', text: 'ADD' },
    { pc: 3, opcode: 'RET', text: 'RET' },
  ];
  return {
    success: true,
    tokens,
    ast,
    hir,
    cfg,
    pipeline: pipelineFor(null, { tokens, bytecode }),
    irMappings: [
      { id: 'mock-map-0', hir: 'return 5 + 3', clif: 'iadd v1, v2', assembly: 'add eax, ebx' },
    ],
    bytecode,
    diagnostics: [],
    rawText: { ast: 'Return\n  Add\n    5\n    3', hir: 'v0 = iconst 5\nv1 = iconst 3\nv2 = iadd v0, v1', clif: 'iadd v1, v2', assembly: 'add eax, ebx' },
    wasmResult: null,
  };
}

function vmView(snapshot: VmSnapshot): VmSnapshotView {
  const frames = snapshot.call_stack.map((frame) => ({
    funcName: frame.func_name,
    locals: frame.locals.map((value, idx) => ({ name: `local[${idx}]`, value })),
  }));
  const memory = frames.flatMap((frame, frameIdx) =>
    frame.locals.map((local, idx) => ({
      address: `0x${(frameIdx * 64 + idx * 8).toString(16).padStart(4, '0')}`,
      variable: `${frame.funcName}.${local.name}`,
      value: local.value,
    }))
  );
  return {
    pc: snapshot.pc,
    stack: snapshot.operand_stack,
    frames,
    memory,
    stdout: snapshot.stdout_full ?? '',
    span: snapshot.location,
  };
}

class WasmCompilerService implements CompilerService {
  private ready = false;
  private vm: VmHandle | null = null;

  async initialize(): Promise<boolean> {
    if (this.ready) return true;
    await init({ module_or_path: `/aether_wasm_bg.wasm?t=${Date.now()}` });
    this.ready = true;
    return true;
  }

  async compile(source: string): Promise<CompilerArtifacts> {
    try {
      if (!this.ready) await this.initialize();
      const result = compile(source) as WasmCompileResult;
      const tokens = fromWasmTokens(result, source);
      const bytecode = buildBytecode(result);

      // Fetch native disassembly from the separate WASM export
      let asmLines: string[] = [];
      if (result.success) {
        try {
          const rawAsm = disassemble(source, undefined);
          asmLines = rawAsm
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
        } catch {
          // disassembly is best-effort — silently ignore errors
        }
      }

      return {
        success: result.success,
        tokens,
        ast: this.getAST(source, result),
        hir: this.getHIR(source, result),
        cfg: this.getCFG(source),
        pipeline: pipelineFor(result, { tokens, bytecode }),
        irMappings: buildMappings(result, asmLines),
        bytecode,
        diagnostics: (result.diagnostics ?? []).map((d): CompilerDiagnostic => ({
          severity: d.severity,
          message: d.message,
          span: d.start !== undefined && d.end !== undefined ? { start: d.start, end: d.end } : undefined,
        })),
        rawText: {
          ast: result.ast?.map((a) => a.text).join('\n\n') ?? '',
          hir: result.hir?.map((h) => h.text).join('\n\n') ?? '',
          clif: result.clif?.map((c) => c.clif).join('\n\n') ?? '',
          assembly: asmLines.join('\n'),
        },
        wasmResult: result,
      };
    } catch (error) {
      const fallback = mockArtifacts(source);
      fallback.success = false;
      fallback.diagnostics = [{ severity: 'error', message: error instanceof Error ? error.message : String(error) }];
      return fallback;
    }
  }

  getTokens(source: string): CompilerToken[] {
    return lexSource(source);
  }

  getAST(source: string, result?: WasmCompileResult | null): CompilerGraph {
    const text = result?.ast?.map((a) => a.text).join('\n') ?? '';
    return text ? buildTextGraph(text, 'AST', 'AST') : buildExpressionAst(source);
  }

  getHIR(source: string, result?: WasmCompileResult | null): CompilerGraph {
    return buildHIRGraph(source, result);
  }

  getCFG(source: string): CompilerGraph {
    return buildCFGGraph(source);
  }

  getCraneliftIR(result?: WasmCompileResult | null): string {
    return result?.clif?.map((c) => c.clif).join('\n\n') ?? '';
  }

  getAssembly(result?: WasmCompileResult | null): string {
    return result?.native_disassembly?.join('\n') ?? '';
  }

  getBytecode(result?: WasmCompileResult | null): BytecodeInstruction[] {
    return buildBytecode(result);
  }

  resetVM(source: string): VmSnapshotView | null {
    if (!this.ready) return null;
    this.vm = new VmHandle(source);
    return this.stepVM();
  }

  stepVM(): VmSnapshotView | null {
    if (!this.vm) return null;
    return vmView(this.vm.step() as VmSnapshot);
  }

  rewindVM(steps: number): VmSnapshotView | null {
    if (!this.vm) return null;
    const snapshot = this.vm.rewind(steps) as VmSnapshot | null;
    return snapshot ? vmView(snapshot) : null;
  }

  runVM(): { snapshot: VmSnapshotView | null; exitCode: number | null; stdout: string } {
    if (!this.vm) return { snapshot: null, exitCode: null, stdout: '' };
    const result = this.vm.run() as { exit_code: number; stdout: string };
    return {
      snapshot: null,
      exitCode: result.exit_code,
      stdout: result.stdout,
    };
  }

  executeVM(source: string): { exitCode: number | null; stdout: string } {
    if (!this.ready) return { exitCode: null, stdout: '' };
    const vm = new VmHandle(source);
    const result = vm.run() as { exit_code: number; stdout: string };
    return {
      exitCode: result.exit_code,
      stdout: result.stdout,
    };
  }
}

export const compilerService = new WasmCompilerService();
export { mockArtifacts };
