// Layered/hierarchical CFG layout engine.
//
// Algorithm:
//   1. DFS (white/gray/black colouring) to classify every edge as
//      tree/forward/cross or BACK-EDGE. Back edges are the loop edges.
//   2. BFS (ignoring back edges) from the entry block to assign each
//      node a layer = longest path distance from entry (Sugiyama-style
//      rank assignment without the crossing-minimisation pass).
//   3. Within each layer, nodes are ordered by their original text
//      position in the CLIF output for deterministic output.
//   4. Each layer is centred horizontally inside the total canvas width.

import { ClifBlock, ClifGraph } from './clifParser';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  bodyLines: string[];
  terminators: string[];
  layer: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  /** True iff this edge creates a cycle (loop back-edge). */
  isBackEdge: boolean;
  /** 0-indexed position among all edges leaving `from`. */
  edgeIndex: number;
  /** Total edges leaving `from`. */
  totalEdges: number;
}

export interface CfgLayout {
  nodes: LayoutNode[];
  nodeMap: Map<string, LayoutNode>;
  edges: LayoutEdge[];
  totalWidth: number;
  totalHeight: number;
}

// ---------------------------------------------------------------------------
// Layout constants (must match ClifCfg.tsx rendering constants)
// ---------------------------------------------------------------------------

export const LAYOUT = {
  NODE_WIDTH: 230,
  H_GAP: 56,          // horizontal gap between nodes in the same layer
  V_GAP: 72,          // vertical gap between layers
  HEADER_H: 28,
  LINE_H: 15,
  PADDING: 10,
  NODE_MIN_H: 56,
  MAX_BODY_LINES: 5,   // cap body display; show "+ N more" line if exceeded
} as const;

// ---------------------------------------------------------------------------
// Node height calculation
// ---------------------------------------------------------------------------

function nodeHeight(block: ClifBlock): number {
  const shownBody = Math.min(block.bodyLines.length, LAYOUT.MAX_BODY_LINES);
  const hasMore = block.bodyLines.length > LAYOUT.MAX_BODY_LINES ? 1 : 0;
  const totalLines = shownBody + hasMore + block.terminators.length;
  return Math.max(
    LAYOUT.NODE_MIN_H,
    LAYOUT.HEADER_H + LAYOUT.PADDING * 2 + totalLines * LAYOUT.LINE_H
  );
}

// ---------------------------------------------------------------------------
// Step 1 — DFS back-edge detection
// ---------------------------------------------------------------------------

function findBackEdges(graph: ClifGraph): Set<string> {
  const backEdges = new Set<string>();
  const color = new Map<string, 'white' | 'gray' | 'black'>();

  for (const b of graph.blocks) color.set(b.id, 'white');

  function dfs(id: string) {
    color.set(id, 'gray');
    const block = graph.blockMap.get(id);
    if (!block) { color.set(id, 'black'); return; }

    for (const succ of block.successors) {
      const c = color.get(succ);
      if (c === 'gray') {
        // succ is an ancestor → back edge
        backEdges.add(`${id}→${succ}`);
      } else if (c === 'white') {
        dfs(succ);
      }
    }
    color.set(id, 'black');
  }

  dfs(graph.entry);
  // Handle unreachable blocks (unusual but be safe)
  for (const b of graph.blocks) {
    if (color.get(b.id) === 'white') dfs(b.id);
  }

  return backEdges;
}

// ---------------------------------------------------------------------------
// Step 2 — BFS layer assignment (longest path, ignoring back edges)
// ---------------------------------------------------------------------------

function assignLayers(graph: ClifGraph, backEdges: Set<string>): Map<string, number> {
  // Use longest-path rank: initialise all to 0, relax forward edges.
  const layer = new Map<string, number>();
  for (const b of graph.blocks) layer.set(b.id, 0);

  // Topological BFS (back edges excluded)
  const inDegree = new Map<string, number>();
  for (const b of graph.blocks) inDegree.set(b.id, 0);
  for (const b of graph.blocks) {
    for (const succ of b.successors) {
      if (!backEdges.has(`${b.id}→${succ}`)) {
        inDegree.set(succ, (inDegree.get(succ) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const b of graph.blocks) {
    if (inDegree.get(b.id) === 0) queue.push(b.id);
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    const block = graph.blockMap.get(id);
    if (!block) continue;

    for (const succ of block.successors) {
      if (backEdges.has(`${id}→${succ}`)) continue;

      const newLayer = (layer.get(id) ?? 0) + 1;
      if (newLayer > (layer.get(succ) ?? 0)) {
        layer.set(succ, newLayer);
      }
      const remaining = (inDegree.get(succ) ?? 1) - 1;
      inDegree.set(succ, remaining);
      if (remaining === 0) queue.push(succ);
    }
  }

  return layer;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function computeCfgLayout(graph: ClifGraph): CfgLayout {
  const backEdgeSet = findBackEdges(graph);
  const layers = assignLayers(graph, backEdgeSet);

  // Group nodes by layer, preserving CLIF text order within each layer
  const textOrder = new Map<string, number>(graph.blocks.map((b, i) => [b.id, i]));
  const layerGroups = new Map<number, string[]>();

  for (const [id, ly] of layers) {
    if (!layerGroups.has(ly)) layerGroups.set(ly, []);
    layerGroups.get(ly)!.push(id);
  }
  for (const arr of layerGroups.values()) {
    arr.sort((a, b) => (textOrder.get(a) ?? 0) - (textOrder.get(b) ?? 0));
  }

  const maxLayer = Math.max(0, ...layers.values());
  const { NODE_WIDTH, H_GAP, V_GAP, PADDING: PAD } = LAYOUT;

  // Width of the widest layer (for centering)
  const maxLayerW = Math.max(
    ...Array.from(layerGroups.values()).map(
      (arr) => arr.length * NODE_WIDTH + (arr.length - 1) * H_GAP
    )
  );

  // Compute y-start of each layer (accounts for variable node heights)
  const layerY: number[] = [];
  let curY = PAD;
  for (let ly = 0; ly <= maxLayer; ly++) {
    layerY.push(curY);
    const arr = layerGroups.get(ly) ?? [];
    const maxH = arr.reduce((acc, id) => {
      const b = graph.blockMap.get(id)!;
      return Math.max(acc, nodeHeight(b));
    }, LAYOUT.NODE_MIN_H);
    curY += maxH + V_GAP;
  }

  // Position nodes
  const nodes: LayoutNode[] = [];
  for (let ly = 0; ly <= maxLayer; ly++) {
    const arr = layerGroups.get(ly) ?? [];
    const layerW = arr.length * NODE_WIDTH + (arr.length - 1) * H_GAP;
    const startX = PAD + (maxLayerW - layerW) / 2;

    for (let col = 0; col < arr.length; col++) {
      const id = arr[col];
      const block = graph.blockMap.get(id)!;
      nodes.push({
        id,
        x: startX + col * (NODE_WIDTH + H_GAP),
        y: layerY[ly],
        width: NODE_WIDTH,
        height: nodeHeight(block),
        bodyLines: block.bodyLines,
        terminators: block.terminators,
        layer: ly,
      });
    }
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build edges
  const edges: LayoutEdge[] = [];
  for (const block of graph.blocks) {
    const total = block.successors.length;
    block.successors.forEach((succ, edgeIndex) => {
      edges.push({
        from: block.id,
        to: succ,
        isBackEdge: backEdgeSet.has(`${block.id}→${succ}`),
        edgeIndex,
        totalEdges: total,
      });
    });
  }

  // Last layer bottom
  const lastLayerArr = layerGroups.get(maxLayer) ?? [];
  const lastH = lastLayerArr.reduce(
    (acc, id) => Math.max(acc, nodes.find((n) => n.id === id)?.height ?? LAYOUT.NODE_MIN_H),
    LAYOUT.NODE_MIN_H
  );

  return {
    nodes,
    nodeMap,
    edges,
    totalWidth: maxLayerW + PAD * 2 + 80, // +80 for back-edge routing margin
    totalHeight: layerY[maxLayer] + lastH + V_GAP,
  };
}
