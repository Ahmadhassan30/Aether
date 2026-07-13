"use client";

import React, { useMemo } from 'react';
import {
  Background,
  Controls,
  MiniMap,
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
  emerald: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
  cyan: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100',
  indigo: 'border-indigo-400/30 bg-indigo-400/10 text-indigo-100',
  amber: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
};

function graphNodeToFlowNode(item: CompilerGraphNode, accent: GraphCanvasProps['accent']): Node {
  return {
    id: item.id,
    position: { x: item.x, y: item.y },
    data: {
      label: (
        <div className={`min-w-[132px] max-w-[210px] rounded-md border px-3 py-2 shadow-lg shadow-black/20 ${accentClasses[accent]}`}>
          <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">{item.kind}</div>
          <div className="mt-1 truncate text-sm font-semibold">{item.label}</div>
          {item.detail && <div className="mt-1 line-clamp-2 text-[11px] opacity-75">{item.detail}</div>}
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
      markerEnd: { type: MarkerType.ArrowClosed, color: '#71717a' },
      style: {
        stroke: edge.kind === 'back' ? '#fb7185' : '#71717a',
        strokeWidth: 1.5,
        strokeDasharray: edge.kind === 'back' ? '6 4' : undefined,
      },
      labelStyle: { fill: '#a1a1aa', fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: '#09090b', fillOpacity: 0.78 },
    }));
  }, [graph.edges]);

  const selected = graph.nodes.find((item) => item.id === selectedInspectorId) ?? graph.nodes[0] ?? null;

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_280px] border-t border-zinc-800/70">
      <div className="min-h-0 bg-zinc-950">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          onNodeClick={handleNodeClick}
          proOptions={{ hideAttribution: true }}
          className="compiler-flow"
        >
          <Background color="#27272a" gap={22} />
          <MiniMap pannable zoomable nodeColor="#155e75" maskColor="rgba(9,9,11,0.72)" />
          <Controls position="bottom-left" />
        </ReactFlow>
      </div>
      <aside className="min-h-0 overflow-y-auto border-l border-zinc-800/70 bg-zinc-950/95 p-4">
        {selected ? (
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Inspector</div>
            <h3 className="mt-2 text-sm font-semibold text-zinc-100">{selected.meta.title}</h3>
            {selected.meta.detail && <p className="mt-2 text-xs leading-relaxed text-zinc-400">{selected.meta.detail}</p>}
            <div className="mt-4 space-y-2">
              {(selected.meta.rows ?? []).map((row) => (
                <div key={row.label} className="rounded-md border border-zinc-800 bg-zinc-900/55 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{row.label}</div>
                  <div className="mt-1 break-words font-mono text-xs text-zinc-200">{row.value}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-xs text-zinc-500">No graph nodes.</div>
        )}
      </aside>
    </div>
  );
}
