"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';
import GraphCanvas from './GraphCanvas';

export default function CFGViewer() {
  const graph = useCompilerStore((state) => state.artifacts?.cfg);
  return graph ? <GraphCanvas graph={graph} accent="amber" layout="flow" /> : null;
}
