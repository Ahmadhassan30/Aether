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
  emerald: 'border-white/60 bg-white/45 text-stone-900',
  cyan: 'border-white/60 bg-white/45 text-stone-900',
  indigo: 'border-white/60 bg-white/45 text-stone-900',
  amber: 'border-white/60 bg-white/45 text-stone-900',
};

function graphNodeToFlowNode(item: CompilerGraphNode, accent: GraphCanvasProps['accent']): Node {
  return {
    id: item.id,
    position: { x: item.x, y: item.y },
    data: {
      label: (
        <div className={`min-w-[132px] max-w-[200px] rounded-2xl border px-4 py-3 shadow-[0_22px_60px_rgba(68,55,38,0.12)] backdrop-blur-xl ${accentClasses[accent]}`}>
          <div className="text-[9px] uppercase tracking-[0.22em] text-stone-400">{item.kind}</div>
          <div className="mt-1 truncate text-[13px] font-semibold">{item.label}</div>
          {item.detail && <div className="mt-1 line-clamp-1 text-[10px] text-stone-500">{item.detail}</div>}
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
      markerEnd: { type: MarkerType.ArrowClosed, color: '#a99f8e' },
      style: {
        stroke: edge.kind === 'back' ? '#8f8272' : '#b8ad9d',
        strokeWidth: 1.35,
        strokeDasharray: edge.kind === 'back' ? '6 4' : undefined,
      },
      labelStyle: { fill: '#7c6f60', fontSize: 10, fontWeight: 500 },
      labelBgStyle: { fill: '#fffaf0', fillOpacity: 0.75 },
    }));
  }, [graph.edges]);

  const selected = graph.nodes.find((item) => item.id === selectedInspectorId) ?? graph.nodes[0] ?? null;

  return (
    <div className="relative h-full min-h-0 border-t border-white/35 bg-white/10">
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
          <Background color="#d9cfbf" gap={30} size={0.85} />
        </ReactFlow>
      </div>

      {selected && (
        <aside className="absolute right-5 top-5 w-[260px] rounded-3xl border border-white/55 bg-white/45 p-5 shadow-2xl shadow-stone-900/10 backdrop-blur-xl">
          <div className="text-[9px] uppercase tracking-[0.24em] text-stone-400">Inspector</div>
          <h3 className="mt-2 text-sm font-semibold text-stone-900">{selected.meta.title}</h3>
          {selected.meta.detail && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-stone-500">{selected.meta.detail}</p>}
          <div className="mt-3 grid gap-2">
            {(selected.meta.rows ?? []).slice(0, 3).map((row) => (
              <div key={row.label} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-xs">
                <div className="text-[10px] uppercase tracking-[0.14em] text-stone-400">{row.label}</div>
                <div className="truncate font-mono text-stone-700">{row.value}</div>
              </div>
            ))}
          </div>
        </aside>
      )}

      <div className="pointer-events-none absolute bottom-5 left-5 rounded-full border border-white/55 bg-white/35 px-4 py-2 text-[11px] text-stone-500 shadow-xl shadow-stone-900/5 backdrop-blur-xl">
        drag to pan · scroll to zoom · click a node
      </div>
    </div>
  );
}
