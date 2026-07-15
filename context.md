# Aether — Engineering and Product Context

Last updated: July 2026

This document is the durable handoff reference for Aether. It describes the product intent, compiler architecture, browser integration, active frontend implementation, UI design system, state and data flow, testing commands, boundaries, and known limitations.

## 1. Product definition

Aether is a live compiler visualization environment for MiniLang++, a C-subset compiler written from scratch in Rust.

The compiler is compiled to WebAssembly and runs entirely in the browser. There is no application server involved in compilation, execution, state inspection, or debugger history.

The product exposes two execution backends after semantic analysis:

1. A Cranelift path that produces real compiler IR and machine disassembly.
2. A custom stack VM path that supports verification, instruction stepping, execution, and rewindable snapshots.

The signature interaction is VM time travel: users can step bytecode, inspect the operand stack and memory, and scrub backwards through previously recorded VM state without a server round trip. The Rust VM maintains a bounded rewind history of up to 5,000 instructions.

Primary audiences:

- Compiler-construction students
- Programming-language and systems engineers
- Engineers learning AST, HIR, CFG, lowering, and runtime design
- Recruiters or reviewers evaluating systems and infrastructure work

This is an engineering instrument, not a marketing dashboard. UI elements should correspond to real compiler state or a real user action.

## 2. Real compiler pipeline

```text
Source
  ↓
Preprocessor
  ↓
Lexer / token stream
  ↓
Parser / AST
  ↓
Semantic analysis / HIR
  ├─→ CFG / Cranelift codegen / machine disassembly
  └─→ Bytecode lowering / verifier / VM interpreter
                                      ├─ step
                                      ├─ rewind
                                      └─ run to cursor
```

The frontend pipeline rail uses the compiler's real artifact status while presenting some lower-level stages more explicitly than the current artifact ID union permits:

| UI step | Store/artifact status source | Opens view |
|---|---|---|
| Source | `source` | source/tokens view |
| Preprocess | `source` | source/tokens view |
| Lexer | `lexer` | token view |
| Parser · AST | `ast` | AST graph |
| Semantic · HIR | `hir` | HIR graph |
| CFG | `cfg` | CFG graph |
| Cranelift | `codegen` | IR/assembly mapping |
| Native | `assembly` | IR/assembly mapping |
| Bytecode | `bytecode` | VM bytecode/debugger |
| Verifier | `bytecode` | VM bytecode/debugger |
| VM | `execution` | VM bytecode/debugger |

`Preprocess` and `Verifier` are real compiler operations but do not yet have independent `CompilerStageId` values. The UI aliases them to the nearest available status/view instead of fabricating data.

## 3. Repository layout

```text
Aether/
├─ apps/
│  └─ web/                         Next.js browser visualizer
│     ├─ DESIGN.md                 Generated GetDesign Warp analysis
│     ├─ copy_wasm.js              Copies the built WASM artifact
│     ├─ next.config.mjs           Static export configuration
│     ├─ public/                    Static WASM and showcase assets
│     └─ src/
│        ├─ app/                    App Router routes and global styles
│        ├─ components/             Active and retained UI components
│        ├─ lib/wasm/compiler.ts    Browser compiler service facade
│        ├─ stores/compilerStore.ts Active visualizer Zustand store
│        ├─ store/useStore.ts       Retained legacy visualizer store
│        ├─ types/compiler.ts       Frontend compiler view models
│        └─ utils/                  Graph, parser, example, permalink helpers
├─ packages/
│  └─ core/
│     ├─ aether-parser/             Preprocessor, lexer, parser, analyzer
│     ├─ aether-codegen/            Cranelift lowering/codegen
│     ├─ aether-vm/                 Bytecode, verifier, interpreter, snapshots
│     ├─ aether-wasm/               WASM boundary exposed to the web app
│     ├─ aether-cli/                Native verification CLI
│     ├─ tests/                      Compiler integration tests
│     └─ benches/                    Compiler benchmarks
├─ fuzz/                             Fuzzing workspace
├─ minimizer/                        Test-case reduction utilities
├─ reference/                        State-machine and audit references
├─ Cargo.toml                        Rust workspace root
├─ package.json                      JS workspace scripts
├─ pnpm-workspace.yaml
└─ turbo.json
```

## 4. Rust workspace and compiler core

The Rust workspace contains:

```toml
[workspace]
members = [
  "packages/core",
  "packages/core/aether-parser",
  "packages/core/aether-codegen",
  "packages/core/aether-vm",
  "packages/core/aether-cli",
  "packages/core/aether-wasm",
]
resolver = "2"
```

### 4.1 Parser and semantic analysis

Location: `packages/core/aether-parser/`

- `lex/cpp.rs`, `lex/replace.rs`: preprocessing and macro expansion
- `lex/mod.rs`: tokenization
- `parse/`: recursive-descent parsing
- `analyze/`: type checking, scope resolution, implicit casts, and HIR construction
- `data/`: tokens, AST, HIR, types, and errors
- `arch/`: target-dependent type sizes
- `headers/`: built-in headers

Important public APIs include:

- `preprocess(buf, opt)`: source to tokens
- `check_semantics(buf, opt)`: source to type-checked HIR

### 4.2 Cranelift backend

Location: `packages/core/aether-codegen/`

- `expr.rs`: HIR expression lowering
- `stmt.rs`: statement and block lowering
- `static_init.rs`: global/static initialization
- `lib.rs`: codegen facade and module initialization

This path turns HIR into Cranelift IR and native-machine output for inspection.

### 4.3 Custom VM backend

Location: `packages/core/aether-vm/`

- `src/isa.rs`: bytecode instruction set
- `src/lower.rs`: HIR to bytecode lowering
- `src/verifier.rs`: structural bytecode verification
- `src/program.rs`: program representation and traps
- `src/interp.rs`: interpreter, stepping, execution, and rewind history
- `src/snapshot.rs`: debugger snapshot representation
- `src/lib.rs`: public VM facade

Important APIs include:

- `lower_program(...)`
- `verify(...)`
- `Vm::new(...)`
- `vm.step()`
- `vm.rewind(n)`
- `vm.run_to_cursor(target_offset)`

The VM rewind buffer is bounded to 5,000 instructions.

### 4.4 WASM boundary

Location: `packages/core/aether-wasm/`

The WASM crate exposes compiler and VM operations to JavaScript. The web app consumes it through `apps/web/src/lib/wasm/compiler.ts`, not directly from React components.

The generated browser artifact is copied into `apps/web/public/` by `apps/web/copy_wasm.js` before development and production builds.

## 5. Web application stack

The active web application uses:

- Next.js 14 App Router
- React 18
- TypeScript strict mode
- Tailwind CSS 3
- Zustand 4
- Monaco Editor
- React Flow
- D3 hierarchy (`d3-hierarchy`)
- Framer Motion
- Lucide icons

It is statically exported:

```js
// apps/web/next.config.mjs
{
  output: 'export',
  images: { unoptimized: true }
}
```

There are no Next.js API routes, server actions, authentication handlers, database models, or server-side compiler calls.

Routes:

| Route | Component |
|---|---|
| `/` | `Visualizer` |
| `/playground` | `Visualizer` |

Both routes currently render the same full-screen workspace.

## 6. Active frontend architecture

### 6.1 Composition

```text
Visualizer
├─ WorkspaceHeader
├─ PipelineVisualizer
└─ ResizableLayout
   ├─ CodeEditor
   └─ selected StageView
      ├─ TokenViewer
      ├─ ASTViewer → GraphCanvas
      ├─ HIRViewer → GraphCanvas
      ├─ CFGViewer → GraphCanvas
      ├─ IRAssemblyViewer
      └─ VMDebugger
         ├─ Timeline
         ├─ bytecode instruction list
         ├─ StackViewer
         └─ MemoryViewer
```

### 6.2 Main orchestration

File: `apps/web/src/components/Visualizer.tsx`

Responsibilities:

- Initializes the browser compiler service
- Reads and writes the active source through `compilerStore`
- Compiles after a 450 ms edit debounce
- Supports manual compile with Ctrl/Cmd+Enter
- Stores compiler artifacts, latency, status, and errors
- Synchronizes source to a URL-safe permalink
- Restores source from the URL on load and browser navigation
- Renders the selected compiler-stage output
- Keeps source and output resizable on desktop

Do not move compiler implementation into `Visualizer`. It should remain the UI orchestrator around `compilerService` and `compilerStore`.

### 6.3 Compiler service facade

File: `apps/web/src/lib/wasm/compiler.ts`

This is the frontend boundary around WASM. It:

- Initializes the WASM package
- Compiles source and maps raw WASM output into `CompilerArtifacts`
- Produces tokens, AST, HIR, CFG, IR/assembly mappings, bytecode, and diagnostics
- Resets, steps, rewinds, and runs the VM
- Contains fallback/mock artifact construction for environments where WASM initialization is unavailable

UI components should not bypass this facade or call WASM exports directly.

### 6.4 Active state store

File: `apps/web/src/stores/compilerStore.ts`

Key state:

- `source`
- `artifacts`
- `selectedStage`
- `selectedInspectorId`
- `highlightedSpan`
- `vmSnapshot`
- `vmTimeline`
- `vmCursor`
- `consoleOutput`
- `status`
- `latency`
- `error`

Key actions:

- Source/artifact/status setters
- Stage and inspector selection
- Source-span highlighting
- VM snapshot reset/push/cursor movement
- Console output updates

The default selected stage is `execution`, intentionally placing VM time travel in the initial product view.

`apps/web/src/store/useStore.ts` belongs to the older panel implementation. It is retained because legacy components still import it, but it is not the state source for the active `Visualizer` flow. New active UI should use `compilerStore` unless deliberately migrating a legacy component.

## 7. Design system and information architecture

The current product direction is instrumentation-first: restrained, dense, and explicitly structured around compiler state.

### 7.1 Color tokens

Defined in `apps/web/src/app/globals.css`:

| Token | Hex | Role |
|---|---|---|
| `graphite` | `#0B0E11` | application background |
| `panel` | `#11151A` | editor/output surfaces |
| `raised` | `#171C22` | active rows and controls |
| `hairline` | `#28313A` | structural boundaries |
| `ink` | `#E4EAF0` | primary information |
| `signal` | `#78A6C2` | live/current compiler state only |
| `danger` | `#B97972` | diagnostics and traps |

Rules:

- Signal blue represents active or live state, not decoration.
- Elevation comes from surface contrast and hairlines, not glass or shadows.
- No background gradients, ambient glow, decorative blobs, or card-grid marketing patterns.
- Errors should be integrated into the workspace, not emitted as generic red toasts.

### 7.2 Typography

- Geist: UI chrome, labels, and prose
- Geist Mono: source, tokens, bytecode, PC values, addresses, spans, and VM state

Both fonts are local under `apps/web/src/app/fonts/`.

### 7.3 Layout

Desktop:

```text
Header
Pipeline spine with HIR backend split
Resizable source editor | selected stage output
```

Mobile at 760 px and below:

- Pipeline becomes a scrollable vertical stepper
- Source and output panes stack vertically
- The drag splitter is removed
- VM stack/memory side panel is hidden to protect the primary bytecode/timeline interaction

At 520 px and below, the example selector is hidden so Compile remains reachable.

### 7.4 Pipeline spine

File: `apps/web/src/components/compiler/PipelineVisualizer.tsx`

- Uses real artifact status from `compilerStore`
- Shows frontend stages and the HIR split into Native and Debug paths
- Changes `selectedStage` when a step is activated
- Shows a moving progress line only while compilation is active
- Uses numbered stages because the numbers correspond to real pipeline order
- Exposes keyboard focus states

### 7.5 VM time travel

Files:

- `components/debugger/VMDebugger.tsx`
- `components/debugger/Timeline.tsx`
- `components/debugger/StackViewer.tsx`
- `components/debugger/MemoryViewer.tsx`

The timeline is full-width and visible at the top of the VM debugger. It displays:

- Current VM history cursor
- Current program counter
- Real snapshot-history length
- A scrubbable range control tied to `setVmCursor`
- The underlying 5,000-instruction rewind capacity

Debugger keyboard commands:

| Command | Key |
|---|---|
| Step forward | F10 |
| Rewind 1 | Shift+F10 |
| Run | F5 |

Global debugger shortcuts are ignored while focus is inside an input, editor, select, or content-editable element.

Stack and memory transitions are driven by actual `VmSnapshotView` state through Framer Motion. The timeline progress interpolates between actual cursors. No animation creates synthetic compiler state.

Important distinction: the Rust VM can retain up to 5,000 rewindable instructions. The frontend `vmTimeline` contains snapshots surfaced during the current UI interaction and is not necessarily a rendered array of all 5,000 internal history entries.

### 7.6 Graph layout and motion

File: `components/compiler/GraphCanvas.tsx`

- D3 `hierarchy()` and `tree()` compute graph coordinates from real node/edge relationships
- React owns node and edge rendering; D3 never mutates the DOM
- React Flow owns only viewport behavior, pan/zoom, selection, and graph interaction
- Custom compiler nodes use 2 px structural borders, 12 px bold type labels, and 14 px titles
- Custom rounded orthogonal edges use visible arrowheads and bold midpoint branch labels
- The selected node's root path uses the signal token at full visual weight
- Edges animate only while `status === 'compiling'`; idle graphs remain still
- Node selection highlights the corresponding source span

All transitions respect `prefers-reduced-motion` through the global stylesheet.

## 8. Editor behavior

File: `apps/web/src/components/editor/CodeEditor.tsx`

Monaco is explicitly configured as editable:

- `readOnly: false`
- `domReadOnly: false`
- spaces enabled
- tab size 4
- indentation detection disabled for predictable formatting
- normal Tab input enabled
- automatic layout enabled

The resizable parent applies `user-select: none` only while the divider is being dragged. Applying it permanently interferes with Monaco's hidden textarea, selection, cursor, and spacing behavior and must not be reintroduced.

Source-span decorations synchronize selected tokens, graph nodes, or VM instructions back to the editor.

## 9. Active versus retained components

Active components are mounted by `Visualizer` and should receive current design work:

- `workspace/WorkspaceHeader.tsx`
- `ResizableLayout.tsx`
- `editor/CodeEditor.tsx`
- `compiler/PipelineVisualizer.tsx`
- `compiler/TokenViewer.tsx`
- `compiler/ASTViewer.tsx`
- `compiler/HIRViewer.tsx`
- `compiler/CFGViewer.tsx`
- `compiler/GraphCanvas.tsx`
- `compiler/IRAssemblyViewer.tsx`
- `debugger/VMDebugger.tsx`
- `debugger/Timeline.tsx`
- `debugger/StackViewer.tsx`
- `debugger/MemoryViewer.tsx`

Retained legacy/alternate components are currently not mounted by the active route:

- `LandingPage.tsx`
- `PanelTabs.tsx`
- `ExecutionPanel.tsx`
- `ClifPanel.tsx`
- `ClifCfg.tsx`
- `DisassemblyPanel.tsx`
- `TreeView.tsx`
- `store/useStore.ts`

Do not assume a retained component reflects the current design system. Before reusing one, migrate its state dependency and styling deliberately.

## 10. Motion policy

Motion must encode state:

- Compilation may animate pipeline progress and graph data flow.
- VM cursor changes may interpolate timeline, stack, and memory state.
- Idle UI stays still.
- No ambient looping animation is allowed outside a running compiler operation.
- No animation is required to understand the current state.
- `prefers-reduced-motion` must be respected.

Current division of responsibility:

- D3 hierarchy: AST/HIR/CFG layout coordinates
- React Flow: compiler graph viewport and interaction
- Framer Motion: pipeline selection, VM timeline, stack, and memory transitions
- React: DOM ownership and all UI state

Only the focused `d3-hierarchy` package is installed; the broad D3 bundle is not. A small local declaration in `src/types/d3-hierarchy.d.ts` covers the exact strict-typing surface used by the layout component. GSAP is not installed. If VM scrubbing later requires velocity-aware, multi-property timeline orchestration beyond the current snapshot interpolation, GSAP may be evaluated specifically for that interaction. Do not add either library as generic UI chrome.

## 11. Accessibility

- Interactive controls use semantic buttons or inputs.
- Pipeline steps and debugger controls expose keyboard focus outlines.
- Timeline uses a native range input and has an accessible label.
- Compiler status is represented by text/state as well as color where space permits.
- Debugger shortcuts avoid stealing input from Monaco and form controls.
- Reduced motion is supported globally.
- Mobile layouts protect the primary interaction instead of shrinking desktop panels until unusable.

## 12. URL and source persistence

Utilities:

- `utils/permalink.ts`
- `utils/examplePrograms.ts`

The source buffer is encoded into the `source` query parameter after compilation. Browser navigation listens for `popstate` and restores decoded source.

The header exposes real bundled examples. At narrow mobile widths, the selector is visually hidden, but the active source remains editable.

## 13. Build, test, and verification commands

From the repository root:

```bash
pnpm dev
pnpm build
pnpm type-check
pnpm core:build:workspace
pnpm core:test
pnpm wasm:build
pnpm wasm:verify
```

Web-only:

```bash
pnpm --filter web dev
pnpm --filter web type-check
pnpm --filter web build
```

Native CLI:

```bash
cargo run -p aether-cli -- [FLAGS] <file.c>
```

Common CLI flags:

- `--tokens`
- `--ast`
- `--hir`
- `--clif`
- `--run`

The current frontend revision has been validated with:

- TypeScript strict checking
- Next.js optimized production build
- Desktop render review at 1440 × 1000
- Mobile render review at 390 × 844

## 14. Backend and frontend boundaries

Frontend UI work may change:

- React components
- Tailwind/CSS styling
- UI-only selected/default state
- panel composition
- loading/empty/error presentation
- accessibility behavior
- compiler-state visualization motion

Frontend UI work must not silently change:

- Rust compiler semantics
- WASM export behavior
- parser/codegen/VM algorithms
- bytecode ISA
- API/data contracts
- compiler artifact mapping semantics
- VM rewind correctness
- business/data-processing logic

The recent product redesign changed only `apps/web/src` presentation and UI state. It did not modify Rust crates, WASM exports, compiler algorithms, APIs, authentication, database code, or server infrastructure.

## 15. Compiler implementation notes

- Parser recursion is guarded to avoid thread stack crashes.
- `char` is signed and negative right shifts preserve sign; see `IMPLEMENTATION_DEFINED.md`.
- Native JIT support uses Cranelift where available and is not used as browser JIT execution.
- The VM verifier rejects structurally invalid programs before interpretation.
- Traps are structured and should be presented as compiler/runtime state, not generic application errors.
- The `salty` feature changes compiler messaging and is not a frontend design concern.

## 16. Known limitations and next steps

1. `Preprocessor` and `Verifier` need independent frontend stage IDs if they are to expose distinct outputs and status rather than aliases.
2. VM timeline scrubbing interpolates surfaced UI snapshots; it does not yet expose every entry in the Rust VM's internal 5,000-step buffer as an independently rendered tick.
3. Mobile hides stack and memory panels to prioritize source, bytecode, and time travel. A dedicated mobile state-inspector drawer could expose them without compressing the primary interaction.
4. Legacy components and the legacy Zustand store remain in the repository. A future cleanup should migrate or remove them only after confirming no alternate route or test consumes them.
5. The static export requires the WASM artifact to be copied before build. Use the provided web scripts rather than running `next build` in isolation for deployment.

## 17. Product guardrails

- The pipeline is the information architecture, not decoration.
- VM time travel is the signature feature and should remain immediately visible.
- Use real compiler output only.
- Never fabricate metrics, testimonials, instructions, or compiler artifacts.
- Avoid generic dashboard patterns, glassmorphism, marketing gradients, and decorative motion.
- Prefer fewer, more informative controls.
- Every color, animation, and panel should communicate real state.
- Preserve editor usability and backend correctness above visual novelty.
