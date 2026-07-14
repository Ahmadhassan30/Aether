"use client";

import React, { useMemo } from 'react';
import {
  Background,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  MarkerType,
} from '@xyflow/react';
import { useCompilerStore } from '../../stores/compilerStore';
import type { CompilerGraph, CompilerGraphNode } from '../../types/compiler';

interface GraphCanvasProps {
  graph: CompilerGraph;
  accent: 'emerald' | 'cyan' | 'indigo' | 'amber';
}

const accentClasses = {
  emerald: 'border-[#506048] bg-[#272824] text-[var(--ink)]',
  cyan: 'border-[#455c61] bg-[#242829] text-[var(--ink)]',
  indigo: 'border-[#4b5365] bg-[#25272d] text-[var(--ink)]',
  amber: 'border-[#605746] bg-[#292722] text-[var(--ink)]',
};

function graphNodeToFlowNode(item: CompilerGraphNode, accent: GraphCanvasProps['accent']): Node {
  return {
    id: item.id,
    position: { x: item.x, y: item.y },
    data: {
      label: (
        <div className={`min-w-[128px] max-w-[190px] rounded-[4px] border px-3 py-2.5 transition-shadow ${accentClasses[accent]}`}>
          <div className="text-[8px] uppercase tracking-[0.16em] text-[var(--muted)]">{item.kind}</div>
          <div className="mt-1 truncate font-mono text-[11px] font-medium">{item.label}</div>
          {item.detail && <div className="mt-1 line-clamp-1 font-mono text-[9px] text-[var(--muted)]">{item.detail}</div>}
        </div>
      ),
    },
    type: 'default',
    style: {
      background: 'transparent',
      border: 'none',
      padding: 0,
      width: 'auto',
    },
  };
}

export default function GraphCanvas({ graph, accent }: GraphCanvasProps) {
  const { highlightedSpan, setHighlightedSpan, selectedInspectorId, setSelectedInspectorId } = useCompilerStore();
  const handleNodeClick: NodeMouseHandler = (_, clicked) => {
    const sourceNode = graph.nodes.find((item) => item.id === clicked.id);
    setSelectedInspectorId(clicked.id);
    setHighlightedSpan(sourceNode?.span ?? null);
  };

  const nodes = useMemo<Node[]>(() => {
    return graph.nodes.map((item) => {
      const flowNode = graphNodeToFlowNode(item, accent);
      const isSelected = selectedInspectorId === item.id;
      const isHighlighted = highlightedSpan && item.span?.start === highlightedSpan.start && item.span?.end === highlightedSpan.end;
      return {
        ...flowNode,
        selected: isSelected || Boolean(isHighlighted),
      };
    });
  }, [accent, graph.nodes, highlightedSpan, selectedInspectorId]);

  const edges = useMemo<Edge[]>(() => {
    return graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
      style: {
        stroke: edge.kind === 'back' ? '#38bdf8' : '#64748b',
        strokeWidth: 1.35,
        strokeDasharray: edge.kind === 'back' ? '6 4' : undefined,
      },
      labelStyle: { fill: '#94a3b8', fontSize: 10, fontWeight: 500 },
      labelBgStyle: { fill: '#020617', fillOpacity: 0.75 },
    }));
  }, [graph.edges]);

  return (
    <div className="relative h-full min-h-0 bg-[var(--workspace)]">
      <div className="absolute inset-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.24 }}
          onNodeClick={handleNodeClick}
          proOptions={{ hideAttribution: true }}
          className="compiler-flow"
          nodesDraggable={false}
        >
          <Background color="#48433e" gap={30} size={0.65} />
        </ReactFlow>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-[3px] border border-[var(--hairline)] bg-[var(--canvas)] px-2 py-1 font-mono text-[8px] text-[var(--muted)]">
        drag to pan · scroll to zoom · click a node
      </div>
    </div>
  );
}
