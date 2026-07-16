# Aether Context

Last updated: July 16, 2026

This is the durable project handoff for Aether. It is written for future agents, maintainers, reviewers, and contributors who need to understand what the app is, how it is built, what makes it unusual, where the important files live, and which boundaries must be respected when making changes.

## 1. What Aether Is

Aether is a browser-native compiler laboratory for a MiniLang++ / C-subset compiler written in Rust.

The product lets a user type or load C-like source code, compile it in the browser through WebAssembly, and inspect every major compiler and runtime phase:

- source text
- preprocessing / tokenization
- lexer output
- AST parser output
- semantic HIR
- CFG
- Cranelift IR
- native assembly disassembly
- custom bytecode
- custom VM execution
- VM timeline, stack, call stack, memory, stdout, traps, and rewindable state

The central idea is not just "show compiler output." Aether makes compiler state navigable. Users can click through stages, inspect graph structure, map semantic code to IR and assembly, step VM bytecode, rewind VM state, and see source spans tied back to the editor.

The app is intentionally split into two surfaces:

| Route | Purpose |
|---|---|
| `/` | Visual landing entry screen with shader background, Aether logo, animated gradient button, and decorative text hover signature |
| `/playground` | Full compiler playground and debugger workspace |

The landing page is a visual entry point. The playground is the actual application.

## 2. What Makes Aether Unique

Aether is unusual because the compiler and runtime are real, but the deployment model is still static:

1. The Rust compiler runs in the browser through WebAssembly.
2. The web app is exported statically with Next.js.
3. There is no application server doing compilation, execution, debugging, persistence, or artifact generation.
4. The compiler exposes both a native-code inspection path and a VM execution path.
5. The VM supports interactive stepping and rewindable snapshots.
6. Source, compiler graphs, IR, assembly, bytecode, and VM state are connected through source spans and UI selection.
7. The AST, semantic HIR, and CFG are not plain text dumps. They are rendered as readable interactive graph/tree layouts.
8. The Assembly & IR view has an explicit translation-matching interaction between Semantic HIR, Cranelift IR, and native assembly rows.
9. The app can demonstrate compiler education, systems programming, static hosting, Rust/WASM integration, and runtime debugging in one project.

In short: Aether is a static website that behaves like a small compiler IDE and VM debugger.

## 3. High-Level Runtime Architecture

```text
MiniLang++ / C-like source
  |
  v
Rust compiler core
  |
  |-- Preprocessor
  |-- Lexer
  |-- Parser
  |-- Semantic analysis / HIR
  |
  |-- Native inspection branch
  |     |-- CFG
  |     |-- Cranelift IR
  |     `-- native disassembly
  |
  `-- VM branch
        |-- bytecode lowering
        |-- bytecode verification
        |-- VM interpreter
        |-- snapshots
        |-- stdout
        `-- rewind history

Rust/WASM boundary
  |
  v
Next.js React app
  |
  |-- landing page
  `-- playground UI
        |-- Monaco editor
        |-- visual compiler stages
        |-- graph/tree viewers
        |-- IR/assembly translation view
        `-- VM debugger
```

## 4. Repository Layout

```text
Aether/
├─ apps/
│  └─ web/
│     ├─ copy_wasm.js
│     ├─ next.config.mjs
│     ├─ package.json
│     ├─ public/
│     ├─ pkg/
│     └─ src/
│        ├─ app/
│        │  ├─ page.tsx
│        │  ├─ playground/page.tsx
│        │  ├─ layout.tsx
│        │  ├─ globals.css
│        │  ├─ logo.png
│        │  ├─ logo1.png
│        │  ├─ logo2.png
│        │  ├─ logo3.png
│        │  └─ fonts/
│        ├─ components/
│        │  ├─ LandingPage.tsx
│        │  ├─ Visualizer.tsx
│        │  ├─ ResizableLayout.tsx
│        │  ├─ compiler/
│        │  ├─ debugger/
│        │  ├─ editor/
│        │  ├─ ui/
│        │  └─ workspace/
│        ├─ lib/wasm/compiler.ts
│        ├─ stores/compilerStore.ts
│        ├─ store/useStore.ts
│        ├─ types/
│        └─ utils/
├─ packages/
│  └─ core/
│     ├─ aether-parser/
│     ├─ aether-codegen/
│     ├─ aether-vm/
│     ├─ aether-wasm/
│     ├─ aether-cli/
│     ├─ tests/
│     └─ benches/
├─ fuzz/
├─ minimizer/
├─ reference/
├─ docs/
├─ Cargo.toml
├─ package.json
├─ pnpm-workspace.yaml
├─ turbo.json
├─ vercel.json
└─ context.md
```

## 5. Rust Compiler Workspace

The Rust workspace is the semantic heart of the project. React should never become the owner of compiler truth.

Workspace members are declared at the root in `Cargo.toml` and include:

- `packages/core`
- `packages/core/aether-parser`
- `packages/core/aether-codegen`
- `packages/core/aether-vm`
- `packages/core/aether-cli`
- `packages/core/aether-wasm`

### 5.1 Parser, Preprocessor, Lexer, Semantic Analysis

Primary location: `packages/core/aether-parser/`

Important directories and files:

| Path | Role |
|---|---|
| `lex/cpp.rs` | C-like preprocessing |
| `lex/replace.rs` | macro replacement support |
| `lex/mod.rs` | tokenization |
| `parse/decl.rs` | declarations |
| `parse/expr.rs` | expressions |
| `parse/stmt.rs` | statements |
| `parse/mod.rs` | parser orchestration |
| `analyze/` | semantic analysis and HIR creation |
| `data/ast.rs` | AST data model |
| `data/hir.rs` | HIR data model |
| `data/types.rs` | type model |
| `data/error.rs` | diagnostics |
| `arch/` | target-dependent sizes and layout |
| `headers/` | built-in headers |

The parser side handles a substantial C-subset surface: declarations, functions, structs, arrays, pointers, casts, control flow, returns, globals, local variables, and enough semantics to lower meaningful examples into IR and bytecode.

The frontend receives snapshots through WASM, not raw internal Rust structs.

### 5.2 Cranelift Codegen

Primary location: `packages/core/aether-codegen/`

Important files:

| File | Role |
|---|---|
| `lib.rs` | codegen facade and module-level orchestration |
| `expr.rs` | expression lowering |
| `stmt.rs` | statement and control-flow lowering |
| `static_init.rs` | static/global initialization |

This branch lowers HIR into Cranelift IR and supports native disassembly for inspection. In the browser, this is used for learning and visualization, not for executing arbitrary native code in the browser.

### 5.3 Custom VM

Primary location: `packages/core/aether-vm/`

Important files:

| File | Role |
|---|---|
| `src/isa.rs` | bytecode instruction set |
| `src/lower.rs` | HIR to VM bytecode lowering |
| `src/verifier.rs` | bytecode verifier |
| `src/program.rs` | program and trap representation |
| `src/interp.rs` | interpreter, stepping, run, rewind |
| `src/snapshot.rs` | VM snapshot type |
| `src/lib.rs` | public VM API |

The VM path is the interactive/debuggable execution backend. It supports:

- reset
- step
- rewind
- run
- run-to-cursor behavior in the Rust VM API
- stdout capture
- snapshot views
- trap reporting
- stack and memory inspection

The Rust VM maintains a bounded rewind history. The frontend timeline shows snapshots surfaced through UI interaction, not necessarily every internal Rust history entry.

### 5.4 WASM Bridge

Primary location: `packages/core/aether-wasm/`

The WASM bridge exposes compile and VM operations to JavaScript. The web app imports the generated package as `aether-wasm` from `apps/web/pkg`.

The web build expects the generated `.wasm` binary at:

```text
apps/web/pkg/aether_wasm_bg.wasm
```

`apps/web/copy_wasm.js` copies it to:

```text
apps/web/public/aether_wasm_bg.wasm
```

That copy step is built into the web package scripts:

```json
"dev": "node copy_wasm.js && next dev",
"build": "node copy_wasm.js && next build"
```

Do not run bare `next build` for deployment unless the WASM file has already been copied.

## 6. Web Stack

The active web application uses:

- Next.js 14 App Router
- React 18
- TypeScript strict mode
- Tailwind CSS 3
- Zustand 4
- Monaco Editor
- React Flow
- D3 hierarchy
- Framer Motion
- GSAP / `@gsap/react`
- Lucide React icons
- local Geist fonts
- shadcn-style `src/components/ui` folder

The app is configured as a static export:

```js
// apps/web/next.config.mjs
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
};
```

There are no Next API routes, server actions, databases, backend sessions, auth providers, or server-side compiler calls.

## 7. Routes

### 7.1 `/`

File: `apps/web/src/app/page.tsx`

Renders `LandingPage`.

Current landing page pieces:

- WebGL shader background from `components/ui/valley-of-the-mind.tsx`
- radial overlay for readability/depth
- centered Aether logo from `src/app/logo.png`
- animated gradient pill button from `components/ui/shiny-button.tsx`
- button routes to `/playground`
- footer outlined hover signature from `components/ui/text-hover-effect.tsx`

The landing page is intentionally visual and minimal. It is not the place for compiler documentation, large marketing copy, or app instructions unless the user explicitly asks.

### 7.2 `/playground`

File: `apps/web/src/app/playground/page.tsx`

Renders `Visualizer`, the full compiler lab.

This route is the primary product surface.

## 8. Frontend State Model

Primary store: `apps/web/src/stores/compilerStore.ts`

This Zustand store is the active state source for the compiler playground.

State fields:

| Field | Purpose |
|---|---|
| `source` | current source code |
| `artifacts` | current compiled artifact bundle |
| `selectedStage` | active compiler/debugger view |
| `selectedInspectorId` | selected graph/inspector entity |
| `highlightedSpan` | source span highlighted in Monaco |
| `vmSnapshot` | current VM snapshot |
| `vmTimeline` | surfaced VM snapshots |
| `vmCursor` | current timeline cursor |
| `consoleOutput` | VM stdout text |
| `status` | `booting`, `ready`, `compiling`, or `error` |
| `latency` | compile latency in milliseconds |
| `error` | current compile/init error |

Important behaviors:

- Default source is `DEFAULT_EXAMPLE`.
- Default selected stage is `execution`, so the VM debugger is the initial workspace.
- `pushVmSnapshot` truncates future snapshots if the user rewinds and then steps again.
- `setVmCursor` updates both `vmSnapshot` and `consoleOutput`.
- `resetVmTimeline` creates a clean timeline from a reset snapshot.

Legacy store: `apps/web/src/store/useStore.ts`

This file still defines older WASM result types and legacy state. Some type imports still reference it, especially `CompileResult`. New UI work should generally use `stores/compilerStore.ts`.

## 9. Compiler Artifact View Models

Primary file: `apps/web/src/types/compiler.ts`

Important types:

- `CompilerStageId`
- `SourceSpan`
- `CompilerToken`
- `CompilerGraph`
- `CompilerGraphNode`
- `CompilerGraphEdge`
- `PipelineStage`
- `IrAssemblyMapping`
- `BytecodeInstruction`
- `VmSnapshotView`
- `CompilerDiagnostic`
- `CompilerArtifacts`
- `CompilerService`

`CompilerArtifacts` is the frontend bundle generated after compile:

```text
CompilerArtifacts
├─ success
├─ tokens
├─ ast
├─ hir
├─ cfg
├─ pipeline
├─ irMappings
├─ bytecode
├─ diagnostics
├─ rawText
│  ├─ ast
│  ├─ hir
│  ├─ clif
│  └─ assembly
└─ wasmResult
```

React components should consume this structured frontend model rather than parsing arbitrary WASM output themselves, unless they are specifically part of the mapping/transformation layer.

## 10. WASM Compiler Service Facade

Primary file: `apps/web/src/lib/wasm/compiler.ts`

This is the only intended frontend boundary around the WASM compiler.

Responsibilities:

- initialize WASM
- compile source
- map WASM snapshots into frontend artifacts
- build token views
- build AST graphs
- build semantic HIR graphs
- build CFG graphs
- expose Cranelift IR and assembly text
- build bytecode instruction view models
- reset VM
- step VM
- rewind VM
- run VM
- execute VM in the background for stdout
- create fallback artifacts when WASM is unavailable

Important rule: React components should not call generated WASM exports directly. They should call `compilerService`.

This keeps the app debuggable because the raw compiler boundary remains centralized.

## 11. Playground Composition

Primary file: `apps/web/src/components/Visualizer.tsx`

Current high-level shape:

```text
Visualizer
├─ optional collapsed sidebar restore button
├─ left navigation sidebar
│  ├─ logo
│  ├─ collapse control
│  └─ stage navigation
├─ top workspace header
│  ├─ active title
│  ├─ example selector
│  ├─ latency/status
│  └─ compile button
├─ main content
│  ├─ Code Editor view
│  ├─ Lexer / Tokens
│  ├─ AST Parser
│  ├─ Semantic HIR
│  ├─ CFG Graph
│  ├─ Assembly & IR
│  └─ VM Debugger
└─ console strip / compiler problems area
```

The sidebar is collapsible. When hidden, a compact restore button appears at the top-left.

`StageView` maps selected stages as follows:

| Selected stage | Rendered view |
|---|---|
| `source`, `lexer`, `parser` | `TokenViewer` |
| `ast` | `ASTViewer` |
| `hir` | `HIRViewer` |
| `cfg` | `CFGViewer` |
| `codegen`, `assembly` | `IRAssemblyViewer` |
| everything else | `VMDebugger` |

Compile behavior:

- compiler service initializes on mount
- source can be restored from `?source=...`
- `Ctrl/Cmd+Enter` compiles immediately
- normal edits are compiled through the existing debounce flow
- successful compile also runs the VM in the background to populate console output
- source is encoded into the URL after compile
- compile latency is stored in the global store

## 12. Landing UI Components

### 12.1 Shader Background

File: `apps/web/src/components/ui/valley-of-the-mind.tsx`

This is a dependency-free WebGL canvas component.

Key traits:

- client component
- creates a WebGL context manually
- compiles vertex and fragment shaders
- uses packed uniforms to stay within WebGL1 limits
- handles resizing with `ResizeObserver`
- pauses rendering when not visible via `IntersectionObserver`
- responds to visibility changes
- releases WebGL context on cleanup
- caps pixel count for performance
- currently used as full-screen landing background

It should remain isolated under `components/ui` and should not leak shader logic into route components.

### 12.2 Shiny Button

File: `apps/web/src/components/ui/shiny-button.tsx`

This is the animated pill button used on the landing page.

Current behavior:

- black pill base
- blue radial glow
- dotted right-side texture
- moving blue sweep across the button
- optional visible children
- `ariaLabel` support for textless usage
- `onClick` callback

The current landing page passes visible text and an ARIA label. If the design changes to no visible text, keep the ARIA label for accessibility.

### 12.3 Text Hover Effect

File: `apps/web/src/components/ui/text-hover-effect.tsx`

This is a decorative SVG text effect used near the landing footer.

It uses:

- React state for pointer position
- SVG text and masks
- `@gsap/react`
- `gsap`

This is decorative landing-page motion. Do not use it as a model for compiler-state motion inside the playground.

## 13. Code Editor

File: `apps/web/src/components/editor/CodeEditor.tsx`

The editor uses Monaco.

Important behavior:

- editable source
- automatic layout
- predictable indentation
- source span decorations driven by `highlightedSpan`
- source changes update `compilerStore.source`

Important rule: do not apply global permanent `user-select: none` to the editor area in a way that breaks Monaco's hidden textarea, cursor, selection, or spacing behavior.

## 14. Pipeline Visualizer

File: `apps/web/src/components/compiler/PipelineVisualizer.tsx`

This component renders an explicit compiler pipeline with frontend stages and two backend branches.

Frontend branch:

1. Source
2. Preprocess
3. Lexer
4. Parser · AST
5. Semantic · HIR

Native branch:

6. CFG
7. Cranelift
8. Native

VM branch:

9. Bytecode
10. Verifier
11. VM

Some displayed stages alias the nearest available `CompilerStageId` because the frontend type does not currently include independent IDs for `Preprocess` and `Verifier`.

The pipeline:

- reads status from `artifacts.pipeline`
- changes `selectedStage`
- shows active and complete states
- animates a thin compile progress line while `status === 'compiling'`
- uses Framer Motion for active underline movement

## 15. Token Viewer

File: `apps/web/src/components/compiler/TokenViewer.tsx`

The token viewer shows lexer output from the current `CompilerArtifacts`.

Its job is to make lexical structure inspectable:

- token text
- token kind
- source span
- hover/selection back to source
- compact scanning layout

This view also doubles as the current display for the `source`, `lexer`, and `parser` stage entries in `StageView`.

## 16. AST, HIR, and CFG Graphs

Entry files:

- `apps/web/src/components/compiler/ASTViewer.tsx`
- `apps/web/src/components/compiler/HIRViewer.tsx`
- `apps/web/src/components/compiler/CFGViewer.tsx`

Shared graph renderer:

- `apps/web/src/components/compiler/GraphCanvas.tsx`

### 16.1 GraphCanvas Responsibilities

`GraphCanvas` renders compiler graphs from `CompilerGraph`.

It owns:

- layout selection
- node rendering
- edge rendering
- active path calculation
- selected node state
- source span highlighting
- fit-view controls
- visual styling by graph type

It supports three layout modes:

| Layout | Used for | Description |
|---|---|---|
| `tree` | AST and Semantic HIR | top-down tree layout with branch spacing |
| `flow` | CFG | flow/block layout based on graph coordinates |
| `layered` | fallback/general | topological depth layout |

### 16.2 AST Viewer

The AST parser view now uses the `tree` layout.

It is intended to read like a proper syntax tree, not a vertical list or cluttered arbitrary graph. Tree spacing, edge arrows, node sizing, and pulse movement were tuned for readability.

### 16.3 Semantic HIR Viewer

The Semantic HIR view also uses the `tree` layout.

Unique traits:

- semantic values are visually highlighted
- type/value/binding nodes receive differentiated translucent colors
- users can distinguish parse structure from semantic enrichment

The point is to make semantic analysis visibly different from the AST.

### 16.4 CFG Viewer

The CFG view uses the `flow` layout.

It emphasizes:

- entry/exit blocks
- basic blocks
- branch edges
- back edges
- true/false labels
- readable flow instead of generic graph clutter

## 17. Assembly & IR Translation View

File: `apps/web/src/components/compiler/IRAssemblyViewer.tsx`

This is one of the most specialized frontend components.

It presents three synchronized columns:

1. Semantic HIR
2. Cranelift IR
3. Native Assembly

Main features:

- function tabs / scope selection
- side-by-side translation pipeline
- syntax highlighting for HIR, CLIF, and assembly
- independent scroll panes
- non-wrapping rows for stable row math
- click-to-pin translation selection
- hover translation preview only when no selection is pinned
- automatic scroll to matched translated rows
- row highlighting across columns
- operation-aware mapping between CLIF and assembly

### 17.1 Mapping Strategy

The mapping is best-effort because the native disassembly does not expose perfect instruction-level source provenance for every row.

The component improves the mapping with several heuristics:

- strict source-span mapping for CLIF rows
- whole-function fallback spans are ignored to prevent giant same-match highlights
- HIR rows are mapped sequentially so repeated `return`, constants, and calls do not all point to the first occurrence
- arithmetic operator matching is prioritized before constants for arithmetic assignment rows
- broad matches are collapsed into narrow windows around the expected translated region
- assembly rows are anchored by operation kind when possible

Recognized operation kinds include:

- call
- return
- arithmetic
- compare
- branch
- memory
- constant
- other

### 17.2 Pinned Interaction

Clicking a row pins the translation selection.

While pinned:

- moving the cursor over other rows does not change highlights
- the pinned translation stays visible
- clicking another row replaces the pinned selection

This was added because hover-only matching became unusable when users had to scroll long IR/assembly columns.

## 18. VM Debugger

File: `apps/web/src/components/debugger/VMDebugger.tsx`

Supporting files:

- `Timeline.tsx`
- `StackViewer.tsx`
- `CallStackViewer.tsx`
- `MemoryViewer.tsx`

The VM debugger is designed as a simple instrument panel rather than a cluttered dashboard.

It includes:

- compact top control bar
- current PC label
- reset
- rewind
- step
- run
- timeline scrubber
- bytecode list
- console output
- right-side inspector tabs for call stack, stack, and memory

Keyboard commands:

| Key | Action |
|---|---|
| `F10` | step forward |
| `Shift+F10` | rewind one step |
| `F5` | run |

Keyboard handlers ignore text inputs, selects, textareas, and content-editable elements so they do not steal editor input.

VM snapshot flow:

```text
resetVM(source)
  -> resetVmTimeline(snapshot)

stepVM()
  -> pushVmSnapshot(snapshot)
  -> highlighted source span updates

rewindVM(1)
  -> pushVmSnapshot(snapshot)
  -> highlighted source span updates

runVM()
  -> push final snapshot
  -> update exit code
  -> update console output
```

The bytecode list highlights the active PC. Hovering bytecode rows can highlight source spans.

The inspector area is intentionally tabbed to avoid the earlier cluttered VM layout.

## 19. Console Behavior

The playground has compiler/VM console concepts.

On successful compile, `Visualizer.performCompile` calls `compilerService.executeVM(source)` in the background to populate stdout immediately. The VM debugger can then reset/step/run independently.

Console output comes from:

- background VM execution after compile
- VM snapshots
- `runVM()` output
- manual clear action in `VMDebugger`

## 20. Example Programs

File: `apps/web/src/utils/examplePrograms.ts`

Bundled examples include:

| ID | Purpose |
|---|---|
| `console-stream` | default straight-line execution warmup |
| `recursive-fib` | recursion and call-stack growth |
| `array-bounds-trap` | structured bounds trap |
| `cfg-loop-gauntlet` | nested loops and branches for CFG/HIR/IR |
| `struct-pointer-walk` | struct and pointer member access |
| `arithmetic-assembly` | simple CPU arithmetic for assembly inspection |
| `accumulator-powers` | chained functions and arithmetic |
| `stdout-print` | print-style stdout demo |

The examples are product-critical because they keep first-run users away from an empty editor and demonstrate different compiler features.

## 21. URL Permalinks

File: `apps/web/src/utils/permalink.ts`

The source buffer is encoded into the `source` query parameter.

`Visualizer`:

- restores source from URL on hydration
- listens to `popstate`
- updates URL after compile

This makes examples and user edits shareable without server storage.

## 22. Styling and Design System

Global styles live at:

```text
apps/web/src/app/globals.css
```

Current CSS tokens:

| Token | Current role |
|---|---|
| `--graphite` | deep application background |
| `--panel` | panel surface |
| `--raised` | raised/active surface |
| `--hairline` | borders and dividers |
| `--ink` | primary text |
| `--signal` | active/live blue |
| `--danger` | error/trap red |
| `--workspace` | core workspace background |
| `--body-strong` | stronger body text |
| `--muted` | muted labels |
| `--accent` | active accent |

Important global utilities/effects:

- scrollbar styling
- selection color
- React Flow node/handle styling
- VM scrubber input styling
- tree edge pulse animation
- path flow animation
- reduced-motion media query

Design direction:

- The playground should feel like a mature compiler/debugger tool.
- Data density is good when it is organized.
- Cards should not be nested.
- Debugger surfaces should be quiet, simple, and readable.
- Decorative motion belongs mostly on the landing page.
- Compiler-stage motion should represent actual state.

## 23. Motion Model

There are two separate motion contexts:

### 23.1 Landing Motion

Landing page uses decorative motion:

- WebGL shader background
- moving gradient pill button
- SVG text hover effect

This motion is brand/entry-page motion.

### 23.2 Playground Motion

Playground motion should communicate compiler or debugger state:

- pipeline compile progress
- AST/HIR/CFG edge pulse/flow
- selected graph path
- VM timeline and snapshot transitions
- stack/memory changes

Do not use landing-page decorative motion as a pattern for compiler-state UI.

## 24. Accessibility

Current accessibility considerations:

- buttons use real `button` elements
- landing button supports `ariaLabel`
- graph controls use button affordances
- sidebar collapse buttons have `aria-label`
- pipeline is a `nav` with `aria-label`
- timeline uses a native range input
- keyboard shortcuts avoid input fields
- reduced motion is globally respected

Areas to keep improving:

- graph node keyboard navigation
- richer screen-reader descriptions for AST/HIR/CFG
- explicit labels for all icon-only debugger controls
- preserving accessible names when visual button text is removed

## 25. Build and Development Commands

Root scripts:

```bash
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm type-check
pnpm core:build
pnpm core:build:workspace
pnpm core:test
pnpm wasm:build
pnpm wasm:verify
pnpm vercel-build
```

Web-only:

```bash
cd apps/web
npm run dev
npm run build
npm run type-check
```

In this workspace, direct TypeScript verification has been reliable with:

```bash
cd apps/web
..\..\node_modules\.bin\tsc.CMD --noEmit --pretty false
```

WASM build:

```bash
pnpm wasm:build
```

This runs:

```bash
npx wasm-pack build packages/core/aether-wasm --target web --out-dir ../../../apps/web/pkg
```

Deployment build:

```bash
pnpm vercel-build
```

This builds WASM first and then builds the static web app.

## 26. Deployment

The project is designed for static deployment.

Important deployment files:

- `apps/web/next.config.mjs`
- `apps/web/copy_wasm.js`
- `vercel.json`
- root `package.json`

The exported Next app must serve:

```text
/aether_wasm_bg.wasm
```

with content type:

```text
application/wasm
```

`vercel.json` handles this header.

## 27. Testing and Verification

Important verification layers:

| Layer | Command |
|---|---|
| TypeScript | `npm run type-check` in `apps/web` or direct `tsc.CMD` |
| Web build | `npm run build` in `apps/web` |
| Rust workspace build | `pnpm core:build:workspace` |
| Rust tests | `pnpm core:test` |
| WASM comparison | `pnpm wasm:verify` |
| CLI behavior | `cargo run -p aether-cli -- ...` |

Core test directories include:

- parser tests
- VM lower/interp/snapshot tests
- CLI pipeline tests
- runner tests
- stack overflow regression tests
- fuzz scripts
- C test-suite scripts

## 28. Important Guardrails

### 28.1 Do Not Mix UI and Compiler Truth

The Rust compiler and VM own semantics.

Frontend may:

- render artifacts
- organize views
- add highlighting
- add interaction
- map existing artifacts into readable shapes
- improve layout
- improve accessibility

Frontend must not silently redefine:

- parser semantics
- type system behavior
- bytecode ISA
- VM execution semantics
- trap behavior
- Cranelift lowering
- compiler diagnostics

### 28.2 Keep WASM Access Centralized

Use:

```text
apps/web/src/lib/wasm/compiler.ts
```

Do not scatter generated WASM imports through UI components.

### 28.3 Be Honest About Mapping Precision

The IR/assembly translation view uses best-effort mapping. Native assembly rows do not carry perfect source provenance. The UI should make matches useful and narrow, but should not claim impossible exactness.

### 28.4 Preserve Monaco Usability

Monaco depends on hidden textareas and selection behavior. Avoid global pointer/selection styles that break editing.

### 28.5 Keep Landing and Playground Design Separate

Landing page can be expressive.

Playground should remain a precise engineering instrument.

## 29. Recently Important Product Changes

The current branch includes these major frontend changes:

- landing page added at `/` with shader background, logo, animated gradient button, and footer hover text
- full compiler app moved to `/playground`
- `src/components/ui` folder added for shadcn-style UI components
- `valley-of-the-mind.tsx` WebGL shader component added
- `shiny-button.tsx` animated gradient pill button added
- `text-hover-effect.tsx` GSAP/SVG hover signature exists
- Visualizer sidebar can collapse and restore
- VM Debugger redesigned into a simpler mature layout
- AST graph changed to a real tree layout
- Semantic HIR graph changed to tree layout with semantic value highlighting
- CFG graph updated to flow layout
- Graph nodes gained translucent semantic coloring and cleaner text sizing
- tree edge pulse animation made continuous
- Assembly & IR view gained pinned click selection
- Assembly & IR matching improved with strict spans, sequential matching, operation-aware anchors, and auto-scroll

## 30. Known Limitations

1. Preprocess and Verifier appear as pipeline stages but do not yet have independent `CompilerStageId` values.
2. IR/assembly mapping is heuristic because native disassembly lacks complete source-level provenance.
3. The frontend VM timeline contains surfaced UI snapshots, not necessarily every internal Rust rewind entry.
4. Some legacy components remain in `apps/web/src/components` and should not be assumed current.
5. `store/useStore.ts` remains for legacy type/data compatibility.
6. The landing page currently has decorative GSAP/WebGL motion; keep it separate from compiler instrumentation motion.
7. Static deployment depends on the WASM copy/build sequence.
8. Mobile behavior exists but should be manually checked after major layout changes.

## 31. Active Files by Feature

Landing:

- `apps/web/src/app/page.tsx`
- `apps/web/src/components/LandingPage.tsx`
- `apps/web/src/components/ui/valley-of-the-mind.tsx`
- `apps/web/src/components/ui/shiny-button.tsx`
- `apps/web/src/components/ui/text-hover-effect.tsx`
- `apps/web/src/app/logo.png`

Playground route:

- `apps/web/src/app/playground/page.tsx`
- `apps/web/src/components/Visualizer.tsx`

Compiler service:

- `apps/web/src/lib/wasm/compiler.ts`
- `apps/web/src/types/compiler.ts`
- `apps/web/src/stores/compilerStore.ts`

Editor:

- `apps/web/src/components/editor/CodeEditor.tsx`

Compiler views:

- `apps/web/src/components/compiler/TokenViewer.tsx`
- `apps/web/src/components/compiler/ASTViewer.tsx`
- `apps/web/src/components/compiler/HIRViewer.tsx`
- `apps/web/src/components/compiler/CFGViewer.tsx`
- `apps/web/src/components/compiler/GraphCanvas.tsx`
- `apps/web/src/components/compiler/IRAssemblyViewer.tsx`
- `apps/web/src/components/compiler/PipelineVisualizer.tsx`

Debugger:

- `apps/web/src/components/debugger/VMDebugger.tsx`
- `apps/web/src/components/debugger/Timeline.tsx`
- `apps/web/src/components/debugger/StackViewer.tsx`
- `apps/web/src/components/debugger/CallStackViewer.tsx`
- `apps/web/src/components/debugger/MemoryViewer.tsx`

Utilities:

- `apps/web/src/utils/examplePrograms.ts`
- `apps/web/src/utils/permalink.ts`
- `apps/web/src/utils/clifMapper.ts`
- `apps/web/src/utils/clifParser.ts`
- `apps/web/src/utils/treeParser.ts`
- `apps/web/src/utils/cfgLayout.ts`

Rust core:

- `packages/core/aether-parser`
- `packages/core/aether-codegen`
- `packages/core/aether-vm`
- `packages/core/aether-wasm`
- `packages/core/aether-cli`

## 32. Invented, Adapted, and Library-Powered Architecture

This section is important for authorship, maintenance, and future explanation. Aether is not a single borrowed template. It is a composed system: some parts are original Aether-specific engineering, some parts adapt known compiler and UI patterns, and some parts intentionally delegate infrastructure to mature libraries.

### 32.1 Ownership Categories

Use these categories when describing the project:

| Category | Meaning |
|---|---|
| Aether-specific | Designed and implemented specifically for this app and product experience |
| Compiler technique | A known compiler/runtime concept implemented in this codebase |
| Library-powered | A feature built on an external library, where Aether owns integration, data mapping, styling, and behavior |
| Generated/vendor-style | Code generated by tools or copied/adapted as a reusable UI asset |
| Legacy/retained | Older implementation still in the repo but not the primary active path |

### 32.2 System-Level Breakdown

| Layer | Aether-specific work | Borrowed/library-powered part |
|---|---|---|
| Language pipeline | source-to-artifact orchestration, exposed snapshots, web-facing artifact shaping | compiler theory patterns such as lexing, parsing, HIR, CFG, lowering |
| Native backend | integration into visual pipeline and IR/assembly view | Cranelift concepts and backend infrastructure |
| VM backend | bytecode lowering integration, snapshot display, rewindable debugger UX | VM/interpreter patterns are known systems techniques |
| WASM bridge | exported compile/debug API shape consumed by the app | wasm-bindgen/wasm-pack build tooling |
| Web app shell | landing/playground split, sidebar workflow, stage mapping, compiler-lab product flow | Next.js App Router, React |
| Editor | source-span feedback loop and compile integration | Monaco Editor |
| Graph views | AST/HIR/CFG data mapping, styling, tree/flow choices, semantic coloring | React Flow viewport, D3 hierarchy math |
| VM debugger UI | product-specific layout, timeline integration, console/inspector composition | React state, Framer Motion transitions, browser range input |
| Landing visuals | composition, placement, routing, logo usage | WebGL shader component, GSAP text effect |
| State model | compiler-specific Zustand store and artifact state transitions | Zustand library |

## 33. Component-by-Component Architecture Inventory

This inventory describes what each active component does and whether the core idea is original Aether work or powered by a library.

### 33.1 Routes and App Shell

| File | Role | Built or borrowed |
|---|---|---|
| `src/app/layout.tsx` | Root HTML/body shell, local Geist fonts, global CSS import | Aether integration on top of Next.js App Router |
| `src/app/page.tsx` | Landing route entry | Aether-specific route composition |
| `src/app/playground/page.tsx` | Playground route entry | Aether-specific route composition |
| `src/app/globals.css` | Design tokens, scrollbars, graph styling, VM scrubber, motion utilities | Aether-specific styling using Tailwind/CSS |

Architecture notes:

- Next.js provides routing, static export, image handling, and app structure.
- Aether owns the distinction between the visual landing page and the compiler playground.
- The app is static. There are no server routes or backend API handlers.

### 33.2 Landing Components

| Component | File | Role | Built or borrowed |
|---|---|---|---|
| `LandingPage` | `components/LandingPage.tsx` | Composes shader, logo, button, footer signature, and route navigation | Aether-specific composition |
| `ShaderBackground` | `components/ui/valley-of-the-mind.tsx` | Full-screen WebGL shader canvas | Reusable shader asset integrated into Aether |
| `ShinyButton` | `components/ui/shiny-button.tsx` | Animated gradient pill button for entering playground | UI asset adapted and restyled for Aether |
| `TextHoverEffect` | `components/ui/text-hover-effect.tsx` | Decorative SVG hover text | Library-powered by GSAP and SVG masks |
| `Avatar` | `components/ui/avatar.tsx` | shadcn/Radix-style avatar primitive | Library-powered by Radix Avatar |

Landing architecture:

```text
LandingPage
  |
  |-- ShaderBackground      WebGL visual layer
  |-- radial overlay        CSS depth/readability layer
  |-- Image logo            Next Image static asset
  |-- ShinyButton           animated route control
  `-- TextHoverEffect       decorative footer signature
```

What is Aether-specific:

- the page composition
- logo placement
- `/playground` navigation behavior
- visual relationship between shader, logo, button, and footer signature
- button restyling to match the desired blue moving-gradient pill

What is library/tool powered:

- WebGL is browser platform API
- `next/image` handles image optimization/static import behavior
- GSAP powers the text hover effect
- Radix powers the avatar primitive if used

### 33.3 Playground Orchestrator

| Component | File | Role | Built or borrowed |
|---|---|---|---|
| `Visualizer` | `components/Visualizer.tsx` | Main compiler workspace shell, stage routing, compile orchestration, sidebar, header, console area | Aether-specific |
| `StageView` | inside `Visualizer.tsx` | Maps selected compiler stage to the right visual component | Aether-specific |
| `ResizableLayout` | `components/ResizableLayout.tsx` | Resizable editor/output split where used | Aether-specific UI behavior using browser pointer events |
| `WorkspaceHeader` | `components/workspace/WorkspaceHeader.tsx` | Older/alternate header component | Aether-specific but not the current primary header path |

Visualizer responsibilities:

- read source and artifact state from `compilerStore`
- initialize the WASM compiler service
- compile source
- update URL permalinks
- run VM once after successful compile to populate stdout
- manage sidebar collapse/restore
- render navigation items
- select active compiler stage
- display status, latency, diagnostics, and console state

What is Aether-specific:

- the compiler-stage navigation model
- the sidebar workflow
- the route between source edits, compiler service, artifacts, and stage views
- the logo-to-landing-page link
- background VM execution after compile

What is library-powered:

- React component lifecycle and hooks
- Next.js image/link behavior
- Lucide icons
- Zustand state access

### 33.4 State and Data Components

| File | Role | Built or borrowed |
|---|---|---|
| `stores/compilerStore.ts` | Active compiler playground state | Aether-specific state model using Zustand |
| `store/useStore.ts` | Legacy WASM result and older visualizer state | Legacy/retained |
| `types/compiler.ts` | Frontend artifact/view model contracts | Aether-specific TypeScript contracts |
| `lib/wasm/compiler.ts` | Frontend compiler service facade around WASM | Aether-specific integration over generated WASM package |

State architecture:

```text
React component
  -> useCompilerStore
  -> compilerService
  -> generated aether-wasm bindings
  -> Rust compiler / VM
  -> compilerService maps raw output
  -> CompilerArtifacts
  -> useCompilerStore
  -> React views
```

What is Aether-specific:

- `CompilerArtifacts` shape
- graph artifact conversion
- VM snapshot view model
- timeline state transitions
- source-span highlighting state
- selected stage model

What is borrowed:

- Zustand store mechanics
- TypeScript type system
- generated WASM import mechanics

### 33.5 Editor Component

| Component | File | Role | Built or borrowed |
|---|---|---|---|
| `CodeEditor` | `components/editor/CodeEditor.tsx` | Source editor with decorations and source-span feedback | Library-powered by Monaco, integrated by Aether |

What Monaco provides:

- text editing engine
- cursor/selection behavior
- syntax-like rendering surface
- layout engine
- keyboard input handling

What Aether adds:

- default source binding
- `onChange` integration with compiler state
- highlighted source-span decorations
- editor options chosen for compiler-code editing
- synchronization with selected tokens, graph nodes, bytecode, and VM spans

### 33.6 Pipeline Component

| Component | File | Role | Built or borrowed |
|---|---|---|---|
| `PipelineVisualizer` | `components/compiler/PipelineVisualizer.tsx` | Visual compiler pipeline with frontend/native/VM branches | Aether-specific, with Framer Motion for active underline |

Pipeline architecture:

```text
Frontend branch
  Source
  Preprocess
  Lexer
  Parser AST
  Semantic HIR

Native branch
  CFG
  Cranelift
  Native

VM branch
  Bytecode
  Verifier
  VM
```

What is Aether-specific:

- stage grouping
- branch split after HIR
- mapping display stages to `CompilerStageId`
- use of pipeline as navigation and status display

What is library-powered:

- Framer Motion active underline animation
- React rendering

### 33.7 Token Viewer

| Component | File | Role | Built or borrowed |
|---|---|---|---|
| `TokenViewer` | `components/compiler/TokenViewer.tsx` | Lexer/token table and source-span inspection | Aether-specific |

What Aether owns:

- token row layout
- token kind display
- source span display
- hover/click behavior tied to source highlighting
- compact presentation for lexer output

Borrowed/library support:

- React/Tailwind only

### 33.8 Graph View Entrypoints

| Component | File | Role | Built or borrowed |
|---|---|---|---|
| `ASTViewer` | `components/compiler/ASTViewer.tsx` | Passes AST graph into `GraphCanvas` using tree layout | Aether-specific wrapper |
| `HIRViewer` | `components/compiler/HIRViewer.tsx` | Passes Semantic HIR graph into `GraphCanvas` using tree layout | Aether-specific wrapper |
| `CFGViewer` | `components/compiler/CFGViewer.tsx` | Passes CFG graph into `GraphCanvas` using flow layout | Aether-specific wrapper |

These small components are intentionally thin. The important architecture is in `GraphCanvas` and `compilerService` graph construction.

### 33.9 GraphCanvas

| Component | File | Role | Built or borrowed |
|---|---|---|---|
| `GraphCanvas` | `components/compiler/GraphCanvas.tsx` | Shared graph renderer for AST, HIR, and CFG | Aether-specific renderer powered by React Flow and D3 hierarchy |

What React Flow provides:

- pan and zoom viewport
- fit view
- graph coordinate rendering substrate
- selection-friendly graph environment
- node/edge rendering hooks

What D3 hierarchy provides:

- tree layout math for hierarchical data
- node positioning helpers

What Aether builds:

- conversion from compiler graph data to layout datum
- AST/HIR tree layout selection
- CFG flow layout selection
- layered fallback layout
- compiler-specific node card design
- semantic color themes
- active root-to-node path calculation
- edge styling and arrowheads
- branch labels
- fit-view button
- source span highlighting from selected graph nodes
- continuous tree edge pulse animation
- distinct visual treatment for AST, HIR, and CFG

Invented in the Aether UI:

- the specific semantic HIR color language
- the "AST as clean syntax tree" presentation
- the "HIR as semantic enriched tree" presentation
- the "CFG as flow blocks" presentation
- the active path behavior connecting graph inspection back to source

Not invented by Aether:

- graph visualization as a concept
- tree layout algorithms
- React Flow viewport mechanics
- D3 hierarchy layout math

### 33.10 IRAssemblyViewer

| Component | File | Role | Built or borrowed |
|---|---|---|---|
| `IRAssemblyViewer` | `components/compiler/IRAssemblyViewer.tsx` | Side-by-side Semantic HIR, Cranelift IR, and native assembly translation view | Aether-specific |

This component is custom Aether product work. It does not come from a library.

What it does:

- splits HIR, CLIF, and assembly into function units
- renders three independent scroll columns
- syntax-highlights HIR, CLIF, and assembly tokens
- maps semantic rows to translated rows
- scrolls target columns on click
- pins selection after click
- prevents hover from overriding pinned selection
- uses operation-aware matching for assembly targets
- avoids whole-function source-span fallbacks
- uses non-wrapping rows to keep scroll math stable

Internal helper concepts:

| Helper idea | Why it exists |
|---|---|
| strict CLIF spans | prevent every line from matching the whole function |
| sequential HIR spans | repeated tokens map to later source occurrences instead of first occurrence |
| arithmetic priority | `sum = sum - 1` should match subtract operations before constants |
| operation classification | align CLIF calls/returns/arithmetic/branches with similar assembly rows |
| pinned selection | user can scroll without hover changing the match |
| row windows | broad matches collapse into a readable nearby group |

Borrowed concepts:

- source span mapping is a standard compiler tooling concept
- three-column translation views exist in debuggers/compilers generally

Aether-specific implementation:

- the exact heuristics
- the click-to-pin behavior
- the operation-aware assembly anchoring
- the visual styling and row synchronization

### 33.11 VM Debugger Components

| Component | File | Role | Built or borrowed |
|---|---|---|---|
| `VMDebugger` | `components/debugger/VMDebugger.tsx` | Main VM debugger screen | Aether-specific |
| `Timeline` | `components/debugger/Timeline.tsx` | Scrubbable VM snapshot timeline | Aether-specific with native range input and Framer Motion |
| `CallStackViewer` | `components/debugger/CallStackViewer.tsx` | Current VM frames and locals | Aether-specific |
| `StackViewer` | `components/debugger/StackViewer.tsx` | Operand stack display | Aether-specific with Framer Motion |
| `MemoryViewer` | `components/debugger/MemoryViewer.tsx` | VM memory/local-value display | Aether-specific with Framer Motion |

What the Rust VM provides:

- bytecode instruction stream
- current PC
- stack values
- call frames
- local values
- memory view model
- stdout
- source span
- traps
- rewind behavior

What Aether frontend builds:

- debugger layout
- simple top control bar
- bytecode row rendering
- timeline scrubber
- stack/callstack/memory tabs
- console panel
- keyboard shortcuts
- snapshot pushing and cursor movement through Zustand
- source highlighting while stepping

What is library-powered:

- Framer Motion for stack/memory/timeline polish
- Lucide icons for controls
- React for component state
- native HTML range input for scrubber

Not borrowed:

- the product decision to make VM time travel a primary visible feature
- the specific debugger layout
- the integration between VM snapshots and source spans

### 33.12 Utility Modules

| File | Role | Built or borrowed |
|---|---|---|
| `utils/examplePrograms.ts` | curated compiler demo programs | Aether-specific examples |
| `utils/permalink.ts` | source encode/decode for URLs | Aether-specific utility using browser URL concepts |
| `utils/clifMapper.ts` | maps CLIF lines to source spans | Aether-specific heuristic mapping |
| `utils/clifParser.ts` | parses CLIF-ish text into helper structures | Aether-specific utility |
| `utils/treeParser.ts` | parses tree-like text into graph helpers | Aether-specific utility |
| `utils/cfgLayout.ts` | CFG layout helper logic | Aether-specific utility |

The utilities are not framework code. They are glue code that turns compiler artifacts into UI-friendly data.

### 33.13 Legacy and Retained Components

These files exist but are not the current primary architecture:

| File | Status |
|---|---|
| `components/PanelTabs.tsx` | legacy/alternate tab shell |
| `components/ExecutionPanel.tsx` | older execution/debugger panel |
| `components/ClifPanel.tsx` | older CLIF display |
| `components/ClifCfg.tsx` | older CLIF CFG display |
| `components/DisassemblyPanel.tsx` | older disassembly panel |
| `components/TreeView.tsx` | retained generic tree view |
| `store/useStore.ts` | legacy store/types still referenced by some WASM result typing |

Future maintainers should not assume these reflect the current design direction. If reused, migrate them deliberately.

## 34. Compiler Core Architecture Inventory

The Rust core implements known compiler stages, but the concrete code organization, WASM exports, VM integration, and frontend artifact pipeline are part of Aether.

### 34.1 `aether-parser`

| Area | Path | What it does | Built or borrowed |
|---|---|---|---|
| Preprocessor | `lex/cpp.rs`, `lex/replace.rs` | handles preprocessing and macro-like replacement | Compiler technique implemented in Rust |
| Lexer | `lex/mod.rs` | tokenizes source | Compiler technique implemented in Rust |
| Parser | `parse/` | recursive descent style parsing for declarations, expressions, statements | Compiler technique implemented in Rust |
| AST model | `data/ast.rs` | syntax tree structures | Project data model |
| Semantic analysis | `analyze/` | types, scopes, casts, HIR construction | Compiler technique implemented in Rust |
| HIR model | `data/hir.rs` | semantic intermediate representation | Project data model |
| Type model | `data/types.rs` | C-like type representation | Project data model |
| Diagnostics | `data/error.rs` | compiler errors | Project data model |
| Architecture data | `arch/` | target sizes/layout assumptions | Project-specific target support |
| Built-in headers | `headers/` | minimal header support | Project support files |

Known compiler ideas used here:

- preprocessing
- tokenization
- recursive descent parsing
- AST
- symbol/scope analysis
- HIR
- type checking
- implicit/explicit casts
- source spans
- diagnostics

These ideas are not invented by Aether, but their implementation and integration in this project are part of the codebase.

### 34.2 `aether-codegen`

| File | What it does | Built or borrowed |
|---|---|---|
| `lib.rs` | codegen orchestration and module handling | Aether integration with Cranelift |
| `expr.rs` | expression lowering | Project code using Cranelift APIs |
| `stmt.rs` | statement/control-flow lowering | Project code using Cranelift APIs |
| `static_init.rs` | global/static initialization lowering | Project code |

Cranelift is the external compiler backend infrastructure. Aether uses it to produce IR and native-code/disassembly artifacts. Aether owns the lowering from its HIR into that backend and the web visualization of the output.

### 34.3 `aether-vm`

| File | What it does | Built or borrowed |
|---|---|---|
| `isa.rs` | bytecode instruction set | Aether-specific VM design |
| `lower.rs` | HIR to bytecode lowering | Aether-specific compiler backend |
| `verifier.rs` | structural bytecode checks | Aether-specific verifier |
| `program.rs` | program/trap representation | Aether-specific runtime model |
| `interp.rs` | interpreter, step, run, rewind | Aether-specific VM implementation using known interpreter patterns |
| `snapshot.rs` | debugger snapshot shape | Aether-specific |
| `lib.rs` | public VM facade | Aether-specific |

The idea of a stack VM and bytecode interpreter is a known systems technique. The concrete instruction set, lowering, snapshot format, traps, and rewind integration are Aether-specific.

### 34.4 `aether-wasm`

| File | What it does | Built or borrowed |
|---|---|---|
| `src/lib.rs` | exposes compile/debug functions to JavaScript | Aether-specific API over wasm-bindgen |
| `verify/compare.mjs` | compares/validates WASM behavior | Aether-specific verification helper |

The build is powered by `wasm-pack` and `wasm-bindgen`. Aether owns the exported API shape and how those exports are mapped into frontend artifacts.

### 34.5 `aether-cli`

| File | What it does | Built or borrowed |
|---|---|---|
| `src/main.rs` | native command-line compiler/debug interface | Aether-specific CLI |
| `tests/cli_pipeline.rs` | CLI pipeline behavior tests | Aether-specific tests |

The CLI is important because it keeps compiler behavior testable outside the browser.

## 35. External Libraries and What They Are Used For

| Library/tool | Used where | Why it exists in Aether |
|---|---|---|
| Next.js | `apps/web` routing/build/export | App Router, static export, image/font handling |
| React | all UI components | component model and hooks |
| TypeScript | web app | strict frontend contracts |
| Tailwind CSS | web styling | fast utility styling with global design tokens |
| Zustand | `compilerStore` | small predictable client state store |
| Monaco Editor | `CodeEditor` | production-grade code editing surface |
| React Flow | `GraphCanvas` | graph viewport, pan, zoom, fit view, node/edge substrate |
| D3 hierarchy | `GraphCanvas` | tree layout math |
| Framer Motion | pipeline/debugger transitions | small state-driven animations |
| GSAP | `TextHoverEffect` landing decoration | SVG stroke/mask animation |
| Lucide React | icons | consistent icon set |
| Radix Avatar | `ui/avatar.tsx` | accessible avatar primitive |
| Cranelift | Rust codegen | compiler IR/native backend infrastructure |
| wasm-pack | build script | Rust to web-targeted WASM packaging |
| wasm-bindgen | WASM bridge | JavaScript bindings for Rust functions/types |
| Turbo | root JS scripts | workspace task orchestration |
| Vercel static hosting | deployment | static site hosting with WASM headers |

Important phrasing: Aether is not claiming to have invented Monaco, React Flow, D3, Cranelift, GSAP, Next.js, React, or WebAssembly. Aether's work is the compiler, VM, WASM API, artifact model, visual mapping, debugger product design, and integration of those tools into a coherent browser compiler lab.

## 36. What Is Original Product Work

The strongest original product work in Aether is the way compiler and runtime artifacts are connected:

1. Rust compiler and VM artifacts are exposed through a browser-friendly WASM boundary.
2. Source spans flow from compiler output into editor highlights.
3. AST/HIR/CFG are converted into interactive visual graph models.
4. HIR, CLIF, and assembly are shown as a translation pipeline.
5. The VM debugger treats execution as a timeline that can be stepped and rewound.
6. The UI is organized around compiler phases rather than generic tabs.
7. The landing page is separate from the serious compiler tool so marketing motion does not pollute the debugger workspace.

These are the parts to emphasize when explaining "what I built."

## 37. What Is Standard Technique or Borrowed Infrastructure

These are standard ideas or external capabilities that Aether uses:

- lexers
- parsers
- ASTs
- HIR
- CFGs
- bytecode
- stack VMs
- interpreters
- source maps/spans
- compiler diagnostics
- graph visualization
- tree layout algorithms
- WebGL shader rendering
- static site export
- browser-based WASM execution

Using standard techniques is normal. The value of Aether is in implementing, integrating, visualizing, and productizing them as one working compiler lab.

## 38. Mental Model for Future Work

When changing Aether, think in layers:

1. Rust compiler layer: owns real language/runtime behavior.
2. WASM facade layer: converts Rust output into stable frontend artifacts.
3. Store layer: owns current UI state and VM timeline.
4. View layer: renders compiler artifacts and user interactions.
5. Landing layer: visual entry point only.

If a change affects correctness, start in Rust and add tests.

If a change affects artifact shape, update the WASM facade and frontend types.

If a change affects visualization, keep it in React components and consume existing artifact data.

If a change affects polish, make sure it does not break source editing, compiler truth, or debugger clarity.

## 39. One-Sentence Summary

Aether is a statically deployed Next.js + Rust/WASM compiler playground that turns a C-subset compiler into an interactive visual system: syntax trees, semantic HIR, CFG, IR, assembly, bytecode, and a rewindable VM debugger all connected in one browser UI.

## 40. Execution Speed and Compiler Comparison Policy

Performance matters in Aether, but speed claims must be handled carefully. The project should never claim to be faster than another compiler unless that claim is backed by a reproducible benchmark on the same machine, same source programs, same optimization assumptions, and same measurement boundary.

### 40.1 What Speed Means in Aether

Aether has several different kinds of speed. Do not mix them together.

| Speed type | What it measures | Current implementation |
|---|---|---|
| Browser compile latency | Time from `compilerService.compile(source)` start to frontend artifacts being produced | measured in `Visualizer.tsx` with `performance.now()` and shown in the UI |
| Rust compile throughput | Native Rust benchmark time for parser/codegen workloads | Criterion benchmarks in `packages/core/benches/` |
| WASM compile responsiveness | How quickly the browser WASM compiler returns artifacts for interactive examples | observable through the UI latency counter |
| VM execution speed | How fast the custom bytecode VM runs a program | not currently exposed as a stable benchmark table |
| Debugger step speed | How fast one VM instruction can step and update UI state | interactive product behavior, not a standalone compiler benchmark |
| UI render speed | How fast graphs/tables/debug panels render after artifacts are available | React rendering concern, separate from compiler execution |

The latency shown in the playground is compile artifact latency. It starts before `compilerService.compile(source)` and ends after compile artifacts are returned and stored. It does not include all later user interactions, browser paint cost, manual graph inspection, or long-term VM stepping.

### 40.2 Why Aether Feels Fast in the Browser

Aether is designed for low-friction interactive feedback:

1. The compiler runs locally in WebAssembly, so there is no network round trip to compile source.
2. Example programs are small and purpose-built for fast iteration.
3. The compiler service keeps the WASM boundary centralized, reducing extra UI-level work.
4. The UI stores normalized `CompilerArtifacts`, so views do not repeatedly call into WASM.
5. Graphs are generated once per compile and then rendered from frontend data.
6. The VM debugger steps snapshots directly through the compiler service rather than re-compiling on every step.
7. Native disassembly and CLIF inspection are generated as artifacts, not as remote requests.

This is a product-speed advantage: Aether can feel immediate because it avoids server latency and because each phase is already local to the browser.

### 40.3 Existing Benchmark Hooks

The repository already contains Criterion benchmarks:

| File | Benchmark focus |
|---|---|
| `packages/core/benches/examples.rs` | in-memory compile benchmark for Fibonacci and Factorial examples |
| `packages/core/benches/parens.rs` | parser stress benchmark for deeply nested parentheses |

These benchmarks are useful for tracking Aether against itself over time. They are not, by themselves, proof that Aether is faster than another compiler.

Run Rust benchmarks with the appropriate Cargo bench command from the Rust workspace when benchmark dependencies are available. Record:

- commit SHA
- machine CPU
- operating system
- Rust version
- benchmark command
- input source program
- optimization flags, if any
- mean time
- variance or confidence interval

### 40.4 Comparison With Other Compilers

Only add a public comparison against another compiler if Aether is faster in a fair reproducible test.

Valid comparison candidates:

- Clang
- GCC
- TCC
- another C-subset teaching compiler
- a previous Aether revision

Rules for a fair comparison:

1. Use the same source program.
2. Measure the same boundary, such as parse-only, compile-to-IR, compile-to-object, or execute-program.
3. Avoid comparing Aether in-memory compilation against another compiler that includes filesystem startup unless the difference is explicitly stated.
4. Run warmups.
5. Use multiple iterations.
6. Report median or mean with variance.
7. Keep the hardware and OS fixed.
8. State whether the comparison is native Rust, WASM in browser, or CLI.
9. Do not compare UI latency to another compiler's backend compilation time.
10. If Aether is not faster, omit the competitor comparison from promotional docs and keep the result only as internal engineering data.

### 40.5 Current Public Claim

Current safe claim:

```text
Aether is optimized for interactive browser feedback: compilation, artifact generation, visualization, and VM debugging happen locally without a server round trip.
```

Current unsafe claim:

```text
Aether is faster than Clang, GCC, or TCC.
```

There is no checked-in benchmark result in this repository proving that Aether is faster than those compilers. Therefore the context and README should not make that claim.

### 40.6 When to Add a Faster-Than Comparison

If reproducible benchmark results show Aether is faster, add a small table like this:

```text
Benchmark: parse and compile factorial.c to internal IR
Machine: <CPU>, <OS>, <date>
Command: <exact command>

Compiler      Median time      Notes
Aether        <time>           <native or WASM, in-memory or file input>
Other         <time>           <compiler name and flags>
```

Only include the table if Aether is the faster result for that exact measured boundary. If Aether is faster in one boundary but slower in another, state only the faster boundary and do not generalize beyond it.

### 40.7 Recommended Future Benchmark Work

To make stronger speed claims later, add:

1. A dedicated VM execution benchmark suite.
2. A browser WASM benchmark page that runs fixed programs and exports JSON results.
3. CLI benchmarks against `clang`, `gcc`, and `tcc` with identical inputs.
4. Separate benchmark groups for parse-only, semantic analysis, codegen, VM execution, and full compile.
5. A saved benchmark-results file under `docs/benchmarks/` with hardware and command metadata.
