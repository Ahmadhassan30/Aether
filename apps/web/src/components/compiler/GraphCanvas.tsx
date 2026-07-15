"use client";

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { hierarchy, tree } from 'd3-hierarchy';
import { useCompilerStore } from '../../stores/compilerStore';
import type { CompilerGraph, CompilerGraphNode, SourceSpan } from '../../types/compiler';

interface GraphCanvasProps {
  graph: CompilerGraph;
  accent: 'emerald' | 'cyan' | 'indigo' | 'amber';
}

interface LayoutDatum {
  item: CompilerGraphNode;
  children: LayoutDatum[];
}

function nodeType(item: CompilerGraphNode): string {
  const source = `${item.kind} ${item.label}`.toLowerCase();
  if (source.includes('entry') || source.includes('start')) return 'ENTRY';
  if (source.includes('exit') || source.includes('return')) return 'EXIT';
  if (source.includes('block') || item.kind.toLowerCase() === 'cfg') return 'BLOCK';
  return item.kind.replaceAll(/[^a-zA-Z0-9]+/g, '').toUpperCase() || 'NODE';
}

function findRoot(graph: CompilerGraph): CompilerGraphNode | null {
  if (graph.nodes.length === 0) return null;
  const targeted = new Set(graph.edges.filter((edge) => edge.kind !== 'back').map((edge) => edge.target));
  return graph.nodes.find((node) => !targeted.has(node.id)) ?? graph.nodes[0];
}

interface PositionInfo {
  x: number;
  y: number;
  depth: number;
}

function layoutGraph(graph: CompilerGraph): {
  positions: Map<string, PositionInfo>;
  depthNodes: Map<number, CompilerGraphNode[]>;
  depthY: Map<number, number>;
  rootId: string | null;
} {
  const root = findRoot(graph);
  const positions = new Map<string, PositionInfo>();
  const depthNodes = new Map<number, CompilerGraphNode[]>();
  const depthY = new Map<number, number>();

  if (!root) {
    return { positions, depthNodes, depthY, rootId: null };
  }

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, string[]>();
  graph.edges.forEach((edge) => {
    if (edge.kind === 'back') return;
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
  });

  const visited = new Set<string>();
  const build = (item: CompilerGraphNode): LayoutDatum => {
    visited.add(item.id);
    const children = (adjacency.get(item.id) ?? [])
      .map((id) => byId.get(id))
      .filter((node): node is CompilerGraphNode => node !== undefined && !visited.has(node.id))
      .map(build);
    return { item, children };
  };

  const rootDatum = build(root);
  graph.nodes.filter((node) => !visited.has(node.id)).forEach((node) => rootDatum.children.push(build(node)));

  const d3Root = hierarchy(rootDatum, (datum) => datum.children);
  
  // Generous spacing math scale: minimum 48px sibling gap, minimum 120px horizontal spacing.
  // Using 400px horizontal step & 180px vertical step ensures very clear spacing.
  tree<LayoutDatum>().nodeSize([400, 180])(d3Root);

  const minX = Math.min(...d3Root.descendants().map((node) => node.x));
  
  d3Root.descendants().forEach((d3Node) => {
    const itemId = d3Node.data.item.id;
    const nodeItem = d3Node.data.item;
    const x = d3Node.x - minX;
    const y = d3Node.y;

    positions.set(itemId, { x, y, depth: d3Node.depth });

    if (!depthNodes.has(d3Node.depth)) {
      depthNodes.set(d3Node.depth, []);
    }
    depthNodes.get(d3Node.depth)!.push(nodeItem);
    depthY.set(d3Node.depth, y);
  });

  return { positions, depthNodes, depthY, rootId: root.id };
}

function activePath(graph: CompilerGraph, rootId: string | null, activeId: string | null) {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  if (!rootId) return { nodeIds, edgeIds };
  let current = activeId ?? rootId;
  nodeIds.add(current);
  const seen = new Set<string>();
  while (current !== rootId && !seen.has(current)) {
    seen.add(current);
    const incoming = graph.edges.find((edge) => edge.target === current && edge.kind !== 'back');
    if (!incoming) break;
    edgeIds.add(incoming.id);
    nodeIds.add(incoming.source);
    current = incoming.source;
  }
  if (activeId === null) nodeIds.add(rootId);
  return { nodeIds, edgeIds };
}

function getBezierPath(x0: number, y0: number, x1: number, y1: number) {
  const ym = (y0 + y1) / 2;
  return `M ${x0} ${y0} C ${x0} ${ym}, ${x1} ${ym}, ${x1} ${y1}`;
}

export default function GraphCanvas({ graph, accent }: GraphCanvasProps) {
  const { highlightedSpan, setHighlightedSpan, selectedInspectorId, setSelectedInspectorId } = useCompilerStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const { positions, depthNodes, depthY, rootId } = useMemo(() => layoutGraph(graph), [graph]);

  const activeNodeId = useMemo(() => {
    if (highlightedSpan) {
      const found = graph.nodes.find(
        (item) => item.span && item.span.start === highlightedSpan.start && item.span.end === highlightedSpan.end
      );
      if (found) return found.id;
    }
    return selectedInspectorId;
  }, [graph.nodes, highlightedSpan, selectedInspectorId]);

  const path = useMemo(() => activePath(graph, rootId, activeNodeId), [graph, rootId, activeNodeId]);

  const accentColor = useMemo(() => {
    switch (accent) {
      case 'emerald': return '#10b981';
      case 'cyan': return '#06b6d4';
      case 'indigo': return '#6366f1';
      case 'amber': return '#f59e0b';
      default: return '#78a6c2';
    }
  }, [accent]);

  // Set card dimensions
  const cardWidth = 260;
  const cardHeight = 100;

  // Auto fit to view
  const fitToView = React.useCallback(() => {
    if (!containerRef.current || positions.size === 0) return;
    const { width, height } = containerRef.current.getBoundingClientRect();

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    positions.forEach(({ x, y }) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });

    const treeWidth = maxX - minX;
    const treeHeight = maxY - minY;

    const totalWidth = treeWidth + cardWidth;
    const totalHeight = treeHeight + cardHeight;

    const padding = 60;
    const scaleX = (width - padding * 2) / totalWidth;
    const scaleY = (height - padding * 2) / totalHeight;
    let scale = Math.min(scaleX, scaleY);
    // Cap minimum scale at 0.70 so the nodes don't shrink into tiny unreadable lines
    scale = Math.min(Math.max(scale, 0.7), 1.1);

    // Center horizontally, position slightly down from the top
    const x = (width - totalWidth * scale) / 2 - (minX - cardWidth / 2) * scale;
    const y = padding;

    setTransform({ x, y, scale });
  }, [positions]);

  useEffect(() => {
    fitToView();
  }, [fitToView]);

  // Mouse pan/zoom handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.interactive-node') || target.closest('button')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setTransform((prev) => ({
      ...prev,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.05;
    const direction = e.deltaY < 0 ? 1 : -1;
    const factor = direction > 0 ? zoomFactor : 1 / zoomFactor;

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setTransform((prev) => {
      const nextScale = Math.min(Math.max(prev.scale * factor, 0.15), 3);
      const dx = mouseX - prev.x;
      const dy = mouseY - prev.y;
      return {
        x: mouseX - dx * (nextScale / prev.scale),
        y: mouseY - dy * (nextScale / prev.scale),
        scale: nextScale,
      };
    });
  };

  const minXOfAllNodes = useMemo(() => {
    let minX = Infinity;
    positions.forEach((pos) => {
      if (pos.x < minX) minX = pos.x;
    });
    return minX === Infinity ? 0 : minX;
  }, [positions]);

  const levelLabels = useMemo(() => {
    const labels: Array<{ depth: number; y: number; text: string }> = [];
    depthNodes.forEach((nodes, depth) => {
      const y = depthY.get(depth) ?? 0;
      const counts: Record<string, number> = {};
      nodes.forEach((node) => {
        const type = nodeType(node);
        counts[type] = (counts[type] || 0) + 1;
      });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      labels.push({ depth, y, text: sorted[0]?.[0] || 'NODE' });
    });
    return labels.sort((a, b) => a.depth - b.depth);
  }, [depthNodes, depthY]);

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--workspace)] text-[13px] font-medium text-[var(--muted)]">
        This stage produced no graph nodes.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onDoubleClick={fitToView}
      className={`relative h-full min-h-0 w-full overflow-hidden select-none bg-[var(--workspace)] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
    >
      {/* HUD reset button */}
      <button
        onClick={fitToView}
        className="absolute bottom-4 right-4 z-10 rounded-[4px] border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-[12px] font-semibold text-[var(--body)] transition hover:bg-[var(--raised)] hover:text-[var(--ink)] active:scale-95"
      >
        Fit View
      </button>

      {/* Pinned vertical level labels (scrolls vertically, scales, but stays fixed horizontally on the left margin) */}
      <div
        style={{
          position: 'absolute',
          left: '18px',
          top: '0',
          bottom: '0',
          width: '100px',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        <div
          style={{
            transform: `translateY(${transform.y}px) scale(${transform.scale})`,
            transformOrigin: 'left top',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          {levelLabels.map((lbl) => (
            <div
              key={lbl.depth}
              style={{
                position: 'absolute',
                left: '0',
                top: `${lbl.y}px`,
                transform: 'translateY(-50%)',
                color: accentColor,
                backgroundColor: 'rgba(24, 25, 22, 0.85)',
                backdropFilter: 'blur(8px)',
                border: '1px solid var(--hairline)',
                borderLeft: `3px solid ${accentColor}`,
              }}
              className="font-mono text-[10px] font-bold uppercase tracking-[0.03em] select-none rounded-[6px] px-2 py-1 shadow-lg"
            >
              {lbl.text}
            </div>
          ))}
        </div>
      </div>

      {/* Main Zoom/Pan container */}
      <div
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
        }}
        className="absolute inset-0 pointer-events-none"
      >
        {/* SVG layer for edges */}
        <svg className="absolute inset-0 overflow-visible pointer-events-none">
          <g>
            {graph.edges.map((edge) => {
              const p1 = positions.get(edge.source);
              const p2 = positions.get(edge.target);
              if (!p1 || !p2) return null;

              // connection point calculations: bottom of parent to top of child
              const x0 = p1.x;
              const y0 = p1.y + cardHeight / 2;
              const x1 = p2.x;
              const y1 = p2.y - cardHeight / 2;

              const pathD = getBezierPath(x0, y0, x1, y1);
              const isActiveEdge = path.edgeIds.has(edge.id);

              return (
                <g key={edge.id}>
                  {/* Base path - static, clean, solid highlight */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isActiveEdge ? accentColor : 'var(--hairline-strong)'}
                    strokeWidth={isActiveEdge ? 2.5 : 1.5}
                    opacity={isActiveEdge ? 1 : 0.25}
                    style={{ transition: 'stroke 0.2s, stroke-width 0.2s, opacity 0.2s' }}
                  />

                  {/* Edge label if present */}
                  {edge.label && (
                    <foreignObject
                      x={(x0 + x1) / 2 - 25}
                      y={(y0 + y1) / 2 - 10}
                      width={50}
                      height={20}
                      className="overflow-visible"
                    >
                      <div
                        className={`flex items-center justify-center rounded-[3px] px-1 py-0.5 font-mono text-[10px] font-bold ${
                          isActiveEdge ? 'bg-[var(--raised)] border border-[rgba(120,166,194,0.3)] text-[var(--ink)]' : 'bg-[var(--panel)] text-[var(--muted)] opacity-60'
                        }`}
                        style={isActiveEdge ? { borderColor: `${accentColor}40`, color: accentColor } : {}}
                      >
                        {edge.label}
                      </div>
                    </foreignObject>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* DOM elements layer for node cards */}
        <div className="absolute inset-0 pointer-events-none">
          {graph.nodes.map((item) => {
            const pos = positions.get(item.id);
            if (!pos) return null;

            const isExecuting = item.id === activeNodeId;

            return (
              <div
                key={item.id}
                style={{
                  position: 'absolute',
                  left: `${pos.x - cardWidth / 2}px`,
                  top: `${pos.y - cardHeight / 2}px`,
                  width: `${cardWidth}px`,
                  height: `${cardHeight}px`,
                  backgroundColor: 'rgba(18, 19, 15, 0.65)',
                  backdropFilter: 'blur(10px)',
                  border: isExecuting ? `2.5px solid ${accentColor}` : '1.5px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: isExecuting ? `0 0 20px ${accentColor}45` : '0 4px 16px rgba(0, 0, 0, 0.2)',
                  opacity: isExecuting ? 1 : 0.6,
                  transition: 'border 0.2s, box-shadow 0.2s, opacity 0.2s',
                }}
                onClick={() => {
                  setSelectedInspectorId(item.id);
                  setHighlightedSpan(item.span ?? null);
                }}
                className="interactive-node pointer-events-auto flex flex-col justify-center rounded-[12px] p-[16px_18px] cursor-pointer hover:!opacity-100 hover:border-[var(--hairline-strong)]"
              >
                {/* Live pulse dot if active */}
                {isExecuting && (
                  <span className="absolute top-3 right-3 flex h-2 w-2">
                    <span
                      className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                      style={{ backgroundColor: accentColor }}
                    />
                    <span
                      className="relative inline-flex rounded-full h-2 w-2"
                      style={{ backgroundColor: accentColor }}
                    />
                  </span>
                )}

                {/* Primary Content: Geist Mono | 16px | 600 */}
                <div className="font-mono text-[16px] font-semibold text-[var(--ink)] leading-snug break-words overflow-y-auto max-h-[50px] pr-2">
                  {item.label}
                </div>

                {/* Secondary Metadata: Geist Mono | 12px | 400 | 55% opacity */}
                {item.detail && (
                  <div className="mt-1 font-mono text-[12px] font-normal leading-tight text-[var(--body)] opacity-55 truncate">
                    {item.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
