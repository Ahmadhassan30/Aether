"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';
import GraphCanvas from './GraphCanvas';

export default function HIRViewer() {
  const graph = useCompilerStore((state) => state.artifacts?.hir);
  return graph ? <GraphCanvas graph={graph} accent="indigo" layout="tree" /> : null;
}
