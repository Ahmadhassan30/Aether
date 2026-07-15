import { create } from 'zustand';
import { DEFAULT_EXAMPLE } from '../utils/examplePrograms';
import type { CompilerArtifacts, CompilerStageId, SourceSpan, VmSnapshotView } from '../types/compiler';

interface CompilerLabState {
  source: string;
  artifacts: CompilerArtifacts | null;
  selectedStage: CompilerStageId;
  selectedInspectorId: string | null;
  highlightedSpan: SourceSpan | null;
  vmSnapshot: VmSnapshotView | null;
  vmTimeline: VmSnapshotView[];
  vmCursor: number;
  consoleOutput: string;
  status: 'booting' | 'ready' | 'compiling' | 'error';
  latency: number | null;
  error: string | null;
  setSource: (source: string) => void;
  setArtifacts: (artifacts: CompilerArtifacts | null) => void;
  setSelectedStage: (stage: CompilerStageId) => void;
  setSelectedInspectorId: (id: string | null) => void;
  setHighlightedSpan: (span: SourceSpan | null) => void;
  setVmSnapshot: (snapshot: VmSnapshotView | null) => void;
  pushVmSnapshot: (snapshot: VmSnapshotView) => void;
  setVmCursor: (cursor: number) => void;
  resetVmTimeline: (snapshot: VmSnapshotView | null) => void;
  setConsoleOutput: (output: string) => void;
  setStatus: (status: CompilerLabState['status']) => void;
  setLatency: (latency: number | null) => void;
  setError: (error: string | null) => void;
}

export const useCompilerStore = create<CompilerLabState>((set) => ({
  source: DEFAULT_EXAMPLE.source,
  artifacts: null,
  selectedStage: 'execution',
  selectedInspectorId: null,
  highlightedSpan: null,
  vmSnapshot: null,
  vmTimeline: [],
  vmCursor: 0,
  consoleOutput: '',
  status: 'booting',
  latency: null,
  error: null,
  setSource: (source) => set({ source }),
  setArtifacts: (artifacts) => set({ artifacts }),
  setSelectedStage: (selectedStage) => set({ selectedStage }),
  setSelectedInspectorId: (selectedInspectorId) => set({ selectedInspectorId }),
  setHighlightedSpan: (highlightedSpan) => set({ highlightedSpan }),
  setVmSnapshot: (vmSnapshot) => set({ vmSnapshot, consoleOutput: vmSnapshot?.stdout ?? '' }),
  pushVmSnapshot: (snapshot) => set((state) => ({
    vmTimeline: [...state.vmTimeline.slice(0, state.vmCursor + 1), snapshot],
    vmCursor: state.vmCursor + 1,
    vmSnapshot: snapshot,
    consoleOutput: snapshot.stdout,
  })),
  setVmCursor: (vmCursor) => set((state) => ({
    vmCursor,
    vmSnapshot: state.vmTimeline[vmCursor] ?? state.vmSnapshot,
    consoleOutput: state.vmTimeline[vmCursor]?.stdout ?? state.consoleOutput,
  })),
  resetVmTimeline: (snapshot) => set({
    vmTimeline: snapshot ? [snapshot] : [],
    vmCursor: 0,
    vmSnapshot: snapshot,
    consoleOutput: snapshot?.stdout ?? '',
  }),
  setConsoleOutput: (consoleOutput) => set({ consoleOutput }),
  setStatus: (status) => set({ status }),
  setLatency: (latency) => set({ latency }),
  setError: (error) => set({ error }),
}));
