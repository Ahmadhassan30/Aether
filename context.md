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

## 32. Mental Model for Future Work

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

## 33. One-Sentence Summary

Aether is a statically deployed Next.js + Rust/WASM compiler playground that turns a C-subset compiler into an interactive visual system: syntax trees, semantic HIR, CFG, IR, assembly, bytecode, and a rewindable VM debugger all connected in one browser UI.
