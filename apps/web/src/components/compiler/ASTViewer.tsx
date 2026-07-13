"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';
import GraphCanvas from './GraphCanvas';

export default function ASTViewer() {
  const graph = useCompilerStore((state) => state.artifacts?.ast);
  return graph ? <GraphCanvas graph={graph} accent="emerald" /> : null;
}
