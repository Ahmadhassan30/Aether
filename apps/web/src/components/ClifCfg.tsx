"use client";

import React, { useMemo } from 'react';
import { parseClifGraph } from '../utils/clifParser';
import { computeCfgLayout, LAYOUT, LayoutEdge, LayoutNode } from '../utils/cfgLayout';

// ---------------------------------------------------------------------------
// Edge colour palette (matches legend)
// ---------------------------------------------------------------------------
const C = {
  jump:   '#818cf8', // indigo  — unconditional jump
  taken:  '#34d399', // emerald — first branch target (brz/brnz taken path)
  fall:   '#fbbf24', // amber   — second branch target / explicit jump after branch
  back:   '#f43f5e', // rose    — loop back-edge
} as const;

type EdgeKind = keyof typeof C;

function edgeKind(e: LayoutEdge): EdgeKind {
  if (e.isBackEdge)     return 'back';
  if (e.totalEdges > 1) return e.edgeIndex === 0 ? 'taken' : 'fall';
  return 'jump';
}

// ---------------------------------------------------------------------------
// SVG path builders
// ---------------------------------------------------------------------------

function forwardPath(from: LayoutNode, to: LayoutNode, e: LayoutEdge): string {
  // Source point: offset left/right based on edge index so two edges from the
  // same block don't overlap at the source.
  const offset = e.totalEdges > 1 ? (e.edgeIndex === 0 ? -12 : 12) : 0;
  const sx = from.x + from.width / 2 + offset;
  const sy = from.y + from.height;
  const tx = to.x + to.width / 2;
  const ty = to.y;
  const cy = Math.max(30, (ty - sy) * 0.45);
  return `M ${sx},${sy} C ${sx},${sy + cy} ${tx},${ty - cy} ${tx},${ty}`;
}

/**
 * Back edges are routed to the RIGHT of the diagram (outside all nodes)
 * so the loop arc is visually unambiguous and never overlaps nodes.
 *
 * The +80px in cfgLayout's totalWidth reserves exactly this margin.
 */
function backEdgePath(
  from: LayoutNode,
  to: LayoutNode,
  totalWidth: number
): string {
  const rightX = totalWidth - 20;
  const sx = from.x + from.width;
  const sy = from.y + from.height / 2;
  const tx = to.x + to.width;
  const ty = to.y + to.height / 2;
  // Right side orthogonal routing: exit right → sweep up → enter right
  return [
    `M ${sx},${sy}`,
    `L ${rightX},${sy}`,
    `L ${rightX},${ty}`,
    `L ${tx + 8},${ty}`, // stop 8px short for arrowhead
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Truncation helper
// ---------------------------------------------------------------------------
function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ClifCfgProps {
  clifText: string;
  entryBlockId?: string;
}

export default function ClifCfg({ clifText }: ClifCfgProps) {
  const graph  = useMemo(() => parseClifGraph(clifText), [clifText]);
  const layout = useMemo(() => (graph ? computeCfgLayout(graph) : null), [graph]);

  if (!graph || !layout || layout.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-xs font-mono">
        No block structure found in CLIF text.
      </div>
    );
  }

  const { HEADER_H, LINE_H, PADDING, MAX_BODY_LINES } = LAYOUT;
  const FONT = LAYOUT.NODE_WIDTH <= 200 ? 10 : 11;

  return (
    <div className="overflow-auto w-full h-full flex flex-col">
      {/* SVG canvas */}
      <div className="flex-1 overflow-auto p-3">
        <svg
          width={layout.totalWidth}
          height={layout.totalHeight}
          viewBox={`0 0 ${layout.totalWidth} ${layout.totalHeight}`}
          style={{ fontFamily: "'JetBrains Mono','Fira Code',ui-monospace,monospace", display: 'block' }}
        >
          {/* ---- Arrow-head markers (one per colour kind) ---- */}
          <defs>
            {(Object.entries(C) as [EdgeKind, string][]).map(([kind, color]) => (
              <marker
                key={kind}
                id={`ah-${kind}`}
                markerWidth="9" markerHeight="7"
                refX="8" refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 9 3.5, 0 7" fill={color} />
              </marker>
            ))}
          </defs>

          {/* ---- Edges (drawn behind nodes) ---- */}
          {layout.edges.map((edge, i) => {
            const from = layout.nodeMap.get(edge.from);
            const to   = layout.nodeMap.get(edge.to);
            if (!from || !to) return null;

            const kind  = edgeKind(edge);
            const color = C[kind];

            const d = edge.isBackEdge
              ? backEdgePath(from, to, layout.totalWidth)
              : forwardPath(from, to, edge);

            // Label for conditional branches ("=0" / "≠0")
            const label: string | null = !edge.isBackEdge && edge.totalEdges > 1
              ? (edge.edgeIndex === 0 ? '=0' : '≠0')
              : null;

            // Midpoint for label placement (rough)
            const midX = (from.x + from.width / 2 + to.x + to.width / 2) / 2
              + (edge.edgeIndex === 0 ? -14 : 14);
            const midY = (from.y + from.height + to.y) / 2;

            return (
              <g key={`e-${i}`}>
                <path
                  d={d}
                  stroke={color}
                  strokeWidth={1.6}
                  fill="none"
                  strokeDasharray={edge.isBackEdge ? '6 3' : undefined}
                  markerEnd={`url(#ah-${kind})`}
                  opacity={0.85}
                />
                {label && (
                  <text
                    x={midX}
                    y={midY}
                    fontSize={10}
                    fill={color}
                    textAnchor="middle"
                    fontWeight="600"
                    style={{ userSelect: 'none' }}
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}

          {/* ---- Nodes ---- */}
          {layout.nodes.map((node) => {
            const isEntry = node.id === graph.entry;
            const bodyShown = node.bodyLines.slice(0, MAX_BODY_LINES);
            const extraBody = node.bodyLines.length > MAX_BODY_LINES
              ? node.bodyLines.length - MAX_BODY_LINES
              : 0;

            return (
              <g key={node.id} transform={`translate(${node.x},${node.y})`}>
                {/* Background rect */}
                <rect
                  x={0} y={0}
                  width={node.width} height={node.height}
                  rx={8} ry={8}
                  fill={isEntry ? '#1e1b4b' : '#18181b'}
                  stroke={isEntry ? '#818cf8' : '#3f3f46'}
                  strokeWidth={isEntry ? 1.5 : 1}
                />

                {/* Header background */}
                <rect
                  x={0} y={0}
                  width={node.width} height={HEADER_H}
                  rx={8} ry={8}
                  fill={isEntry ? '#2d2a7e' : '#27272a'}
                />
                {/* Fill bottom corners of header */}
                <rect
                  x={0} y={HEADER_H - 8}
                  width={node.width} height={8}
                  fill={isEntry ? '#2d2a7e' : '#27272a'}
                />

                {/* Block label */}
                <text
                  x={node.width / 2}
                  y={HEADER_H / 2 + FONT / 3 + 1}
                  textAnchor="middle"
                  fontSize={FONT + 1}
                  fontWeight="700"
                  fill={isEntry ? '#c4b5fd' : '#d4d4d8'}
                  style={{ userSelect: 'none' }}
                >
                  {node.id}:
                </text>

                {/* Separator */}
                <line
                  x1={0} y1={HEADER_H}
                  x2={node.width} y2={HEADER_H}
                  stroke={isEntry ? '#4c1d95' : '#3f3f46'}
                  strokeWidth={1}
                />

                {/* Body instructions */}
                {bodyShown.map((line, li) => (
                  <text
                    key={li}
                    x={PADDING}
                    y={HEADER_H + PADDING + li * LINE_H + FONT}
                    fontSize={FONT}
                    fill="#71717a"
                    style={{ userSelect: 'none' }}
                  >
                    {trunc(line, 30)}
                  </text>
                ))}
                {extraBody > 0 && (
                  <text
                    x={PADDING}
                    y={HEADER_H + PADDING + bodyShown.length * LINE_H + FONT}
                    fontSize={FONT}
                    fill="#52525b"
                    fontStyle="italic"
                    style={{ userSelect: 'none' }}
                  >
                    +{extraBody} more…
                  </text>
                )}

                {/* Terminator instructions */}
                {node.terminators.map((line, ti) => {
                  const baseRows = bodyShown.length + (extraBody > 0 ? 1 : 0);
                  const y = HEADER_H + PADDING + (baseRows + ti) * LINE_H + FONT;
                  const termColor = line.startsWith('return') ? '#f87171'
                    : line.startsWith('trap')                 ? '#fb923c'
                    : line.startsWith('jump')                 ? '#818cf8'
                    : line.startsWith('brz') || line.startsWith('brnz') || line.startsWith('br_') ? '#fbbf24'
                    : '#a1a1aa';
                  return (
                    <text
                      key={`t-${ti}`}
                      x={PADDING}
                      y={y}
                      fontSize={FONT}
                      fill={termColor}
                      fontStyle="italic"
                      style={{ userSelect: 'none' }}
                    >
                      {trunc(line, 30)}
                    </text>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* ---- Legend ---- */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-2.5 border-t border-zinc-800/60 flex-shrink-0">
        {(([
          { kind: 'jump',  label: 'jump (unconditional)', dashed: false },
          { kind: 'taken', label: 'branch taken (=0 / ≠0)', dashed: false },
          { kind: 'fall',  label: 'branch fallthrough', dashed: false },
          { kind: 'back',  label: 'back-edge (loop)', dashed: true },
        ]) as Array<{ kind: EdgeKind; label: string; dashed: boolean }>).map(({ kind, label, dashed }) => (
          <span key={kind} className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
            <svg width="22" height="4" style={{ overflow: 'visible' }}>
              <line
                x1="0" y1="2" x2="22" y2="2"
                stroke={C[kind]}
                strokeWidth="1.5"
                strokeDasharray={dashed ? '5 2.5' : undefined}
              />
            </svg>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
