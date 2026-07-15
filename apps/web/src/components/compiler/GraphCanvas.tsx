"use client";

import React, { useMemo } from 'react';
import { hierarchy, tree } from 'd3-hierarchy';
import {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from '@xyflow/react';
import { useCompilerStore } from '../../stores/compilerStore';
import type { CompilerGraph, CompilerGraphNode } from '../../types/compiler';

interface GraphCanvasProps {
  graph: CompilerGraph;
  accent: 'emerald' | 'cyan' | 'indigo' | 'amber';
}

interface LayoutDatum {
  item: CompilerGraphNode;
  children: LayoutDatum[];
}

interface CompilerNodeData extends Record<string, unknown> {
  item: CompilerGraphNode;
  active: boolean;
}

interface CompilerEdgeData extends Record<string, unknown> {
  active: boolean;
  label?: string;
}

type CompilerFlowNode = Node<CompilerNodeData, 'compilerNode'>;
type CompilerFlowEdge = Edge<CompilerEdgeData, 'compilerEdge'>;

function nodeType(item: CompilerGraphNode): string {
  const source = `${item.kind} ${item.label}`.toLowerCase();
  if (source.includes('entry') || source.includes('start')) return 'ENTRYBLOCK';
  if (source.includes('exit') || source.includes('return')) return 'EXITBLOCK';
  if (source.includes('block') || item.kind.toLowerCase() === 'cfg') return 'BASICBLOCK';
  return item.kind.replaceAll(/[^a-zA-Z0-9]+/g, '').toUpperCase() || 'NODE';
}

function CompilerNode({ data }: NodeProps<CompilerFlowNode>) {
  const { item, active } = data;
  return (
    <div
      className={`min-w-[190px] max-w-[250px] rounded-[5px] border-2 px-4 py-4 transition-colors ${active ? 'border-[var(--signal)] bg-[#19232a] text-[var(--ink)]' : 'border-[var(--hairline)] bg-[var(--panel)] text-[var(--body-strong)]'}`}
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-[var(--hairline-strong)]" />
      <div className={`font-mono text-[12px] font-bold uppercase tracking-[0.02em] ${active ? 'text-[var(--signal)]' : 'text-[var(--body)]'}`}>
        {nodeType(item)}
      </div>
      <div className="mt-2 truncate font-mono text-[14px] font-semibold text-[var(--ink)]">{item.label}</div>
      {item.detail && <div className="mt-2 line-clamp-2 font-mono text-[12px] font-normal leading-5 text-[var(--muted)]">{item.detail}</div>}
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-[var(--hairline-strong)]" />
    </div>
  );
}

function CompilerEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data }: EdgeProps<CompilerFlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 18,
    offset: 24,
  });
  const branch = data?.label?.toLowerCase();
  const isBranch = branch === 'true' || branch === 'false';

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: data?.active ? 'var(--signal)' : '#53616c',
          strokeWidth: data?.active ? 2 : 1.7,
          opacity: data?.active ? 1 : 0.72,
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <span
            className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-[2px] bg-[var(--graphite)] px-1.5 py-0.5 font-mono text-[12px] font-bold ${isBranch || data.active ? 'text-[var(--signal)]' : 'text-[var(--body)]'}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data.label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { compilerNode: CompilerNode };
const edgeTypes = { compilerEdge: CompilerEdge };

function findRoot(graph: CompilerGraph): CompilerGraphNode | null {
  if (graph.nodes.length === 0) return null;
  const targeted = new Set(graph.edges.filter((edge) => edge.kind !== 'back').map((edge) => edge.target));
  return graph.nodes.find((node) => !targeted.has(node.id)) ?? graph.nodes[0];
}

function layoutGraph(graph: CompilerGraph): { positions: Map<string, { x: number; y: number }>; rootId: string | null } {
  const root = findRoot(graph);
  const positions = new Map<string, { x: number; y: number }>();
  if (!root) return { positions, rootId: null };

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
  tree<LayoutDatum>().nodeSize([270, 150])(d3Root);
  const minX = Math.min(...d3Root.descendants().map((node) => node.x));
  d3Root.descendants().forEach((node) => positions.set(node.data.item.id, { x: node.x - minX, y: node.y }));
  return { positions, rootId: root.id };
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

export default function GraphCanvas({ graph }: GraphCanvasProps) {
  const { highlightedSpan, setHighlightedSpan, selectedInspectorId, setSelectedInspectorId, status } = useCompilerStore();
  const { positions, rootId } = useMemo(() => layoutGraph(graph), [graph]);
  const path = useMemo(() => activePath(graph, rootId, selectedInspectorId), [graph, rootId, selectedInspectorId]);

  const handleNodeClick: NodeMouseHandler<CompilerFlowNode> = (_, clicked) => {
    const sourceNode = graph.nodes.find((item) => item.id === clicked.id);
    setSelectedInspectorId(clicked.id);
    setHighlightedSpan(sourceNode?.span ?? null);
  };

  const nodes = useMemo<CompilerFlowNode[]>(() => graph.nodes.map((item) => {
    const spanActive = highlightedSpan && item.span?.start === highlightedSpan.start && item.span?.end === highlightedSpan.end;
    return {
      id: item.id,
      position: positions.get(item.id) ?? { x: item.x, y: item.y },
      data: { item, active: path.nodeIds.has(item.id) || Boolean(spanActive) },
      type: 'compilerNode',
      selected: selectedInspectorId === item.id,
    };
  }), [graph.nodes, highlightedSpan, path.nodeIds, positions, selectedInspectorId]);

  const edges = useMemo<CompilerFlowEdge[]>(() => graph.edges.map((edge) => {
    const active = path.edgeIds.has(edge.id);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'compilerEdge',
      animated: status === 'compiling' && active,
      data: { active, label: edge.label },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: active ? '#78A6C2' : '#53616C',
        width: 18,
        height: 18,
      },
    };
  }), [graph.edges, path.edgeIds, status]);

  if (graph.nodes.length === 0) {
    return <div className="flex h-full items-center justify-center bg-[var(--workspace)] text-[13px] font-medium text-[var(--muted)]">This stage produced no graph nodes.</div>;
  }

  return (
    <div className="relative h-full min-h-0 bg-[var(--workspace)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: 0.35, maxZoom: 1.1 }}
        onNodeClick={handleNodeClick}
        proOptions={{ hideAttribution: true }}
        className="compiler-flow"
        nodesDraggable={false}
        nodesConnectable={false}
        defaultEdgeOptions={{ interactionWidth: 24 }}
      >
        <Background color="#27313a" gap={30} size={0.65} />
      </ReactFlow>
    </div>
  );
}
