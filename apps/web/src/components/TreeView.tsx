"use client";

import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useStore } from '../store/useStore';

export interface TreeNode {
  id: string;
  label: string;
  typeInfo?: string;
  start?: number;
  end?: number;
  children: TreeNode[];
}

interface TreeViewProps {
  node: TreeNode;
  colorClass: 'emerald' | 'indigo';
  depth?: number;
}

export default function TreeView({ node, colorClass, depth = 0 }: TreeViewProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { highlightedSpan, setHighlightedSpan } = useStore();

  const hasChildren = node.children && node.children.length > 0;
  
  // Check if this node matches the highlighted span in the store (cross-highlight)
  const isHighlighted = highlightedSpan && 
                        node.start !== undefined && 
                        node.end !== undefined && 
                        highlightedSpan.start === node.start && 
                        highlightedSpan.end === node.end;

  const handleMouseEnter = () => {
    if (node.start !== undefined && node.end !== undefined) {
      setHighlightedSpan({ start: node.start, end: node.end });
    }
  };

  const handleMouseLeave = () => {
    setHighlightedSpan(null);
  };

  
  const hoverBg = colorClass === 'emerald' 
    ? 'hover:bg-emerald-500/5' 
    : 'hover:bg-indigo-500/5';

  const highlightedBg = colorClass === 'emerald'
    ? 'bg-emerald-500/10 border-l-2 border-emerald-400/80 shadow-md shadow-emerald-500/5'
    : 'bg-indigo-500/10 border-l-2 border-indigo-400/80 shadow-md shadow-indigo-500/5';

  return (
    <div className="flex flex-col select-none">
      {/* Node Row */}
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`flex items-center gap-1.5 py-1.5 px-3 rounded-md transition-all cursor-pointer text-xs font-mono group my-[1px] ${
          isHighlighted ? highlightedBg : hoverBg
        }`}
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
      >
        {/* Expand/Collapse Caret */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <div className="w-[22px] h-[22px] flex-shrink-0" />
        )}

        {/* Node Content */}
        <span className="text-zinc-300 break-all leading-relaxed flex-1 select-text">
          {node.label}
        </span>

        {/* Inline Type Info (prominently displayed) */}
        {node.typeInfo && (
          <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border tracking-wide font-mono transition-colors ${
            colorClass === 'emerald'
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.05)]'
              : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30 shadow-[0_0_8px_rgba(99,102,241,0.05)]'
          }`}>
            {node.typeInfo}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="flex flex-col relative before:absolute before:left-[18px] before:top-0 before:bottom-2 before:w-[1px] before:bg-zinc-850">
          {node.children.map((child) => (
            <TreeView
              key={child.id}
              node={child}
              colorClass={colorClass}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
