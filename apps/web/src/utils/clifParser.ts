// Parses the textual CLIF IR output from Cranelift (format!("{}", func))
// into a graph of basic blocks with explicit successor lists.
//
// Terminator instructions recognised:
//   jump block_N              → single successor block_N
//   brz  v, block_N          → successor block_N (zero path) + next block or jump target
//   brnz v, block_N          → successor block_N (nonzero path) + next block or jump target
//   br_icmp cc, va, vb, block_N → successor block_N + next block or jump target
//   return / trap             → no successors
//
// Cranelift always serialises conditional branches followed by an explicit
// `jump` for the other path, so we never need to infer implicit fallthroughs.

export interface ClifBlock {
  /** e.g. "block0" */
  id: string;
  /** Non-terminator instructions in order */
  bodyLines: string[];
  /** One or more terminator instruction lines */
  terminators: string[];
  /** Ordered successor block IDs (same order as branch targets) */
  successors: string[];
}

export interface ClifGraph {
  blocks: ClifBlock[];
  blockMap: Map<string, ClifBlock>;
  /** ID of the entry block (first block in text order) */
  entry: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract all "blockN" identifiers from an instruction line. */
function extractBlockRefs(line: string): string[] {
  return [...line.matchAll(/\b(block\d+)\b/g)].map((m) => m[1]);
}

/** Return true if `line` is a block terminator in Cranelift IR. */
function isTerminatorLine(line: string): boolean {
  return (
    line.startsWith('jump ') ||
    line.startsWith('brz ') ||
    line.startsWith('brnz ') ||
    line.startsWith('br_icmp ') ||
    line.startsWith('br_table ') ||
    line.startsWith('return') ||
    line.startsWith('trap')
  );
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a single Cranelift function's IR text into a block graph.
 * Returns null if no blocks are found (e.g. empty / unrecognised format).
 */
export function parseClifGraph(clifText: string): ClifGraph | null {
  const blocks: ClifBlock[] = [];
  let current: ClifBlock | null = null;

  for (const rawLine of clifText.split('\n')) {
    const line = rawLine.trim();

    // Skip blank lines, function header, and outer braces
    if (!line || line === '{' || line === '}') continue;
    if (line.startsWith('function ')) continue;

    // -----------------------------------------------------------------------
    // Block header: "block0:" or "block0(v1: i64, v2: i32):"
    // -----------------------------------------------------------------------
    const blockMatch = line.match(/^(block\d+)(?:\([^)]*\))?:\s*$/);
    if (blockMatch) {
      current = {
        id: blockMatch[1],
        bodyLines: [],
        terminators: [],
        successors: [],
      };
      blocks.push(current);
      continue;
    }

    if (!current) continue;

    // -----------------------------------------------------------------------
    // Instruction lines
    // -----------------------------------------------------------------------
    if (isTerminatorLine(line)) {
      current.terminators.push(line);
      for (const ref of extractBlockRefs(line)) {
        if (!current.successors.includes(ref)) {
          current.successors.push(ref);
        }
      }
    } else {
      current.bodyLines.push(line);
    }
  }

  if (blocks.length === 0) return null;

  return {
    blocks,
    blockMap: new Map(blocks.map((b) => [b.id, b])),
    entry: blocks[0].id,
  };
}
