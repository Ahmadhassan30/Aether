"use client";

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useCompilerStore } from '../../stores/compilerStore';
import type { CompilerGraph, CompilerGraphNode, SourceSpan } from '../../types/compiler';

interface GraphCanvasProps {
  graph: CompilerGraph;
  accent: 'emerald' | 'cyan' | 'indigo' | 'amber';
  layout?: 'layered' | 'tree' | 'flow';
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

function layoutGraph(
  graph: CompilerGraph,
  layout: 'layered' | 'tree' | 'flow' = 'layered'
): {
  positions: Map<string, PositionInfo>;
  depthNodes: Map<number, CompilerGraphNode[]>;
  depthY: Map<number, number>;
  rootId: string | null;
} {
  const positions = new Map<string, PositionInfo>();
  const depthNodes = new Map<number, CompilerGraphNode[]>();
  const depthY = new Map<number, number>();

  if (graph.nodes.length === 0) {
    return { positions, depthNodes, depthY, rootId: null };
  }

  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  
  graph.nodes.forEach((n) => {
    adjacency.set(n.id, []);
    inDegree.set(n.id, 0);
  });

  graph.edges.forEach((edge) => {
    if (edge.kind === 'back') return;
    if (adjacency.has(edge.source)) {
      adjacency.get(edge.source)!.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
  });

  const roots = graph.nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0);
  const rootId = roots[0]?.id ?? graph.nodes[0].id;

  if (layout === 'flow') {
    const minX = Math.min(...graph.nodes.map((item) => item.x));
    const maxX = Math.max(...graph.nodes.map((item) => item.x));
    const centerOffset = (minX + maxX) / 2;
    const orderedY = Array.from(new Set(graph.nodes.map((item) => item.y))).sort((a, b) => a - b);

    graph.nodes.forEach((item) => {
      const depth = Math.max(0, orderedY.findIndex((y) => y === item.y));
      const y = depth * 132;
      positions.set(item.id, { x: item.x - centerOffset, y, depth });
      depthY.set(depth, y);
      if (!depthNodes.has(depth)) depthNodes.set(depth, []);
      depthNodes.get(depth)!.push(item);
    });

    return { positions, depthNodes, depthY, rootId };
  }

  if (layout === 'tree') {
    const nodeById = new Map(graph.nodes.map((item) => [item.id, item]));
    const buildDatum = (id: string, seen = new Set<string>()): LayoutDatum => {
      const item = nodeById.get(id) ?? graph.nodes[0];
      if (seen.has(id)) return { item, children: [] };
      const nextSeen = new Set(seen);
      nextSeen.add(id);
      return {
        item,
        children: (adjacency.get(id) ?? []).map((childId) => buildDatum(childId, nextSeen)),
      };
    };

    const rootDatum = buildDatum(rootId);
    const horizontalSpacing = 188;
    const verticalSpacing = 138;
    let leafIndex = 0;
    const staged: Array<{ item: CompilerGraphNode; x: number; y: number; depth: number }> = [];

    const place = (datum: LayoutDatum, depth: number): number => {
      const childXs = datum.children.map((child) => place(child, depth + 1));
      const x = childXs.length > 0
        ? (childXs[0] + childXs[childXs.length - 1]) / 2
        : leafIndex++ * horizontalSpacing;
      const y = depth * verticalSpacing;
      staged.push({ item: datum.item, x, y, depth });
      return x;
    };

    place(rootDatum, 0);
    const minX = Math.min(...staged.map((item) => item.x));
    const maxX = Math.max(...staged.map((item) => item.x));
    const centerOffset = (minX + maxX) / 2;

    staged.forEach((datum) => {
      const x = datum.x - centerOffset;
      positions.set(datum.item.id, { x, y: datum.y, depth: datum.depth });
      depthY.set(datum.depth, datum.y);
      if (!depthNodes.has(datum.depth)) depthNodes.set(datum.depth, []);
      depthNodes.get(datum.depth)!.push(datum.item);
    });

    return { positions, depthNodes, depthY, rootId };
  }

  const queue = roots.map((r) => r.id);
  const nodeDepths = new Map<string, number>();
  roots.forEach((r) => nodeDepths.set(r.id, 0));

  // Process nodes in topological order to determine max path depth
  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topoOrder.push(curr);

    const currDepth = nodeDepths.get(curr) ?? 0;
    const neighbors = adjacency.get(curr) ?? [];

    neighbors.forEach((next) => {
      const currentNextDepth = nodeDepths.get(next) ?? 0;
      nodeDepths.set(next, Math.max(currentNextDepth, currDepth + 1));

      const deg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, deg);
      if (deg === 0) {
        queue.push(next);
      }
    });
  }

  // Fallback for cycle elements or isolated components
  graph.nodes.forEach((n) => {
    if (!nodeDepths.has(n.id)) {
      nodeDepths.set(n.id, 0);
    }
  });

  // 4. Group nodes by their computed depths
  const nodesByDepth = new Map<number, string[]>();
  graph.nodes.forEach((n) => {
    const d = nodeDepths.get(n.id) ?? 0;
    if (!nodesByDepth.has(d)) {
      nodesByDepth.set(d, []);
    }
    nodesByDepth.get(d)!.push(n.id);
  });

  const sortedDepths = Array.from(nodesByDepth.keys()).sort((a, b) => a - b);
  const horizontalSpacing = 440;
  const verticalSpacing = 260;

  // Calculate final positions
  sortedDepths.forEach((d) => {
    const nodeIds = nodesByDepth.get(d) ?? [];
    const y = d * verticalSpacing;
    depthY.set(d, y);

    const count = nodeIds.length;
    nodeIds.forEach((id, index) => {
      // Center nodes horizontally around x = 0
      const x = (index - (count - 1) / 2) * horizontalSpacing;
      positions.set(id, { x, y, depth: d });

      const nodeItem = graph.nodes.find((n) => n.id === id)!;
      if (!depthNodes.has(d)) {
        depthNodes.set(d, []);
      }
      depthNodes.get(d)!.push(nodeItem);
    });
  });

  return { positions, depthNodes, depthY, rootId };
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

function getTreePath(x0: number, y0: number, x1: number, y1: number) {
  const ym = y0 + Math.max(20, (y1 - y0) * 0.45);
  return `M ${x0} ${y0} V ${ym} H ${x1} V ${y1}`;
}

function getEdgeColor(edge: { label?: string; kind?: string }, fallback: string) {
  if (edge.kind === 'back' || edge.label === 'back') return '#f59e0b';
  if (edge.label === 'true') return '#22c55e';
  if (edge.label === 'false') return '#ef4444';
  return fallback;
}

function getNodeTheme(item: CompilerGraphNode): { border: string; text: string; glow: string; fill: string } {
  const label = item.label.toLowerCase();
  const kind = item.kind.toLowerCase();
  
  if (label.includes('start') || label.includes('entry') || kind.includes('entry')) {
    return {
      border: '#9fe870', // Wise Lime Green
      text: '#9fe870',
      glow: 'rgba(159, 232, 112, 0.45)',
      fill: 'rgba(159, 232, 112, 0.08)',
    };
  }
  if (label.includes('end') || label.includes('exit') || kind.includes('exit')) {
    return {
      border: '#d03238', // Wise Red
      text: '#d03238',
      glow: 'rgba(208, 50, 56, 0.45)',
      fill: 'rgba(208, 50, 56, 0.08)',
    };
  }
  if (label.includes('condition') || label.includes('if') || kind.includes('cond') || label.includes('test')) {
    return {
      border: '#38c8ff', // Wise Cyan
      text: '#38c8ff',
      glow: 'rgba(56, 200, 255, 0.45)',
      fill: 'rgba(56, 200, 255, 0.08)',
    };
  }
  if (kind.includes('basicblock') || kind.includes('block')) {
    return {
      border: '#f59e0b',
      text: '#fbbf24',
      glow: 'rgba(245, 158, 11, 0.32)',
      fill: 'rgba(245, 158, 11, 0.08)',
    };
  }
  if (kind.includes('function')) {
    return {
      border: '#60a5fa',
      text: '#93c5fd',
      glow: 'rgba(96, 165, 250, 0.35)',
      fill: 'rgba(96, 165, 250, 0.08)',
    };
  }
  if (kind.includes('semanticmodule')) {
    return {
      border: '#818cf8',
      text: '#a5b4fc',
      glow: 'rgba(129, 140, 248, 0.35)',
      fill: 'rgba(129, 140, 248, 0.08)',
    };
  }
  if (kind.includes('semantictype') || kind.includes('signature')) {
    return {
      border: '#2dd4bf',
      text: '#5eead4',
      glow: 'rgba(45, 212, 191, 0.32)',
      fill: 'rgba(45, 212, 191, 0.075)',
    };
  }
  if (kind.includes('resolvedcall') || kind.includes('symbol')) {
    return {
      border: '#38bdf8',
      text: '#7dd3fc',
      glow: 'rgba(56, 189, 248, 0.32)',
      fill: 'rgba(56, 189, 248, 0.08)',
    };
  }
  if (kind.includes('value') || kind.includes('binding')) {
    return {
      border: '#facc15',
      text: '#fde047',
      glow: 'rgba(250, 204, 21, 0.34)',
      fill: 'rgba(250, 204, 21, 0.09)',
    };
  }
  if (kind.includes('effect') || kind.includes('terminator') || kind.includes('instruction')) {
    return {
      border: '#a78bfa',
      text: '#c4b5fd',
      glow: 'rgba(167, 139, 250, 0.32)',
      fill: 'rgba(167, 139, 250, 0.08)',
    };
  }
  if (kind.includes('param')) {
    return {
      border: '#22d3ee',
      text: '#67e8f9',
      glow: 'rgba(34, 211, 238, 0.32)',
      fill: 'rgba(34, 211, 238, 0.075)',
    };
  }
  if (kind.includes('call') || kind.includes('expr') || kind.includes('literal') || kind.includes('identifier')) {
    return {
      border: '#f59e0b',
      text: '#fbbf24',
      glow: 'rgba(245, 158, 11, 0.32)',
      fill: 'rgba(245, 158, 11, 0.075)',
    };
  }
  // Default block
  return {
    border: '#c084fc', // Purple/Violet
    text: '#c084fc',
    glow: 'rgba(192, 132, 252, 0.4)',
    fill: 'rgba(192, 132, 252, 0.075)',
  };
}

export default function GraphCanvas({ graph, accent, layout = 'layered' }: GraphCanvasProps) {
  const { highlightedSpan, setHighlightedSpan, selectedInspectorId, setSelectedInspectorId } = useCompilerStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const { positions, depthNodes, depthY, rootId } = useMemo(() => layoutGraph(graph, layout), [graph, layout]);

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

  const isTreeLayout = layout === 'tree';
  const isFlowLayout = layout === 'flow';
  const isCompactLayout = isTreeLayout || isFlowLayout;
  const cardWidth = isTreeLayout ? 168 : isFlowLayout ? 188 : 320;
  const cardHeight = isTreeLayout ? 86 : isFlowLayout ? 92 : 180;

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

    const padding = isCompactLayout ? 84 : 60;
    const scaleX = (width - padding * 2) / totalWidth;
    const scaleY = (height - padding * 2) / totalHeight;
    let scale = Math.min(scaleX, scaleY);
    scale = Math.min(Math.max(scale, isCompactLayout ? 0.26 : 0.45), isCompactLayout ? 1.15 : 1.25);

    // Center horizontally, position slightly down from the top
    const x = (width - totalWidth * scale) / 2 - (minX - cardWidth / 2) * scale;
    const y = isCompactLayout ? padding + 12 : padding;

    setTransform({ x, y, scale });
  }, [cardHeight, cardWidth, isCompactLayout, positions]);

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

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({
        x: touch.clientX - transform.x,
        y: touch.clientY - transform.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setTransform((prev) => ({
      ...prev,
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    }));
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
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

      {/* Main Zoom/Pan container */}
      <div
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
        }}
        className="absolute inset-0 pointer-events-none"
      >
        {/* Vertical level labels - placed inside the zoomable container, positioned relative to the leftmost node */}
        {!isCompactLayout && levelLabels.map((lbl) => {
          const nodesAtDepth = depthNodes.get(lbl.depth);
          const firstNode = nodesAtDepth ? nodesAtDepth[0] : null;
          const themeColor = firstNode ? getNodeTheme(firstNode).border : accentColor;

          return (
            <div
              key={lbl.depth}
              style={{
                position: 'absolute',
                left: `${minXOfAllNodes - 260}px`,
                top: `${lbl.y}px`,
                transform: 'translate(-50%, -50%)',
                color: themeColor,
                backgroundColor: 'rgba(24, 25, 22, 0.85)',
                backdropFilter: 'blur(8px)',
                border: '1px solid var(--hairline)',
                borderLeft: `3px solid ${themeColor}`,
              }}
              className="font-mono text-[10px] font-bold uppercase tracking-[0.03em] select-none rounded-[6px] px-2.5 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] pointer-events-none"
            >
              {lbl.text}
            </div>
          );
        })}
        {/* SVG layer for edges */}
        <svg className="absolute inset-0 overflow-visible pointer-events-none">
          {isCompactLayout && (
            <defs>
              <marker
                id="compact-arrow"
                markerWidth="7"
                markerHeight="7"
                refX="5.8"
                refY="3.5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M 0 0 L 7 3.5 L 0 7 z" fill="context-stroke" opacity="0.75" />
              </marker>
            </defs>
          )}
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

              const pathD = isTreeLayout ? getTreePath(x0, y0, x1, y1) : getBezierPath(x0, y0, x1, y1);
              const isActiveEdge = path.edgeIds.has(edge.id);
              const edgeColor = getEdgeColor(edge, accentColor);

              return (
                <g key={edge.id}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isCompactLayout ? edgeColor : 'var(--hairline-strong)'}
                    strokeWidth={isCompactLayout ? 1.15 : 1.5}
                    opacity={isCompactLayout ? 0.42 : 0.25}
                    markerEnd={isCompactLayout ? 'url(#compact-arrow)' : undefined}
                  />

                  {isCompactLayout && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke={edgeColor}
                      strokeWidth={2.2}
                      className="tree-edge-pulse"
                    />
                  )}

                  {!isCompactLayout && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke={accentColor}
                      strokeWidth={4.5}
                      className="edge-flow-path"
                      opacity={0.8}
                    />
                  )}

                  {(isFlowLayout || !isCompactLayout) && edge.label && (
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
                        style={{
                          borderColor: `${edgeColor}40`,
                          color: edgeColor,
                          backgroundColor: isFlowLayout ? 'rgba(10, 12, 16, 0.86)' : undefined,
                          opacity: isFlowLayout ? 0.92 : undefined,
                        }}
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

            const theme = getNodeTheme(item);
            const isExecuting = item.id === activeNodeId;
            const borderStyle = isExecuting 
              ? `3px solid ${theme.border}` 
              : `2px solid ${theme.border}a0`; // 60% opacity outline when inactive
            const compactTree = isCompactLayout;

            return (
              <div
                key={item.id}
                style={{
                  position: 'absolute',
                  left: `${pos.x - cardWidth / 2}px`,
                  top: `${pos.y - cardHeight / 2}px`,
                  width: `${cardWidth}px`,
                  height: `${cardHeight}px`,
                  backgroundColor: compactTree ? theme.fill : 'rgba(22, 23, 20, 0.85)',
                  backdropFilter: 'blur(12px)',
                  border: compactTree ? `1px solid ${theme.border}90` : borderStyle,
                  boxShadow: isExecuting 
                    ? `0 0 28px ${theme.glow}, inset 0 1px 0 rgba(255,255,255,0.1)` 
                    : compactTree
                      ? `0 8px 18px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255,255,255,0.04)`
                      : `0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255,255,255,0.05)`,
                  opacity: isExecuting ? 1 : compactTree ? 0.86 : 0.65,
                  borderRadius: compactTree ? '8px' : '16px',
                }}
                onClick={() => {
                  setSelectedInspectorId(item.id);
                  setHighlightedSpan(item.span ?? null);
                }}
                className={`interactive-node pointer-events-auto flex flex-col justify-between cursor-pointer hover:!opacity-100 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 ${compactTree ? 'p-2.5' : 'p-5'}`}
              >
                {/* Node kind tag at the top */}
                <div 
                  className={`font-mono font-[900] uppercase tracking-[0.06em] ${compactTree ? 'text-[10px]' : 'text-[13px]'}`}
                  style={{ color: theme.text }}
                >
                  {item.kind}
                </div>

                {/* Primary Content: Geist Mono | 30px | 900 (ultra bold display) */}
                <div className={`font-mono font-[900] text-[var(--ink)] leading-snug break-words pr-1 mt-1 ${compactTree ? 'max-h-[42px] overflow-hidden text-[19px]' : 'text-[30px]'}`}>
                  {item.label}
                </div>

                {/* Secondary Metadata: Geist Mono | 15px | 700 */}
                <div className={`mt-auto border-t border-[var(--hairline)] flex items-center justify-between font-[700] text-[var(--body)] ${compactTree ? 'pt-1 text-[11px]' : 'pt-2 text-[15px]'}`}>
                  <span className={compactTree ? 'truncate max-w-[118px]' : 'truncate max-w-[160px]'}>{item.detail || 'Basic block'}</span>
                  {isExecuting && (
                    <span 
                      className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 uppercase tracking-wider animate-pulse"
                      style={{ color: theme.text }}
                    >
                      Active
                    </span>
                  )}
                </div>

                {/* Pulse ring for active node */}
                {isExecuting && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5">
                    <span
                      className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                      style={{ backgroundColor: theme.border }}
                    />
                    <span
                      className="relative inline-flex rounded-full h-3.5 w-3.5"
                      style={{ backgroundColor: theme.border }}
                    />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
