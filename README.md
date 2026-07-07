# ◈ Aether

> See the invisible. Understand the machine.

Aether is a live compiler visualization environment for MiniLang++ (a C subset).
Write source code. Watch it compile — token by token, node by node —
through every phase of compilation in real time, **running entirely in your browser
as WebAssembly with zero server infrastructure**.

Built for **CS3045 Compiler Construction · Spring 2026**  
University of Management and Technology, Lahore, Pakistan

---

## Architecture

```
aether/
├── packages/
│   ├── core/                  Rust compiler workspace
│   │   ├── src/               swcc CLI binary (main.rs)
│   │   ├── saltwater-parser/  Lexer → Preprocessor → Parser → Semantic Analysis → HIR
│   │   ├── saltwater-codegen/ Cranelift CLIF IR + native disassembly
│   │   ├── aether-vm/         (planned) Bytecode VM: HIR→bytecode lowering + interpreter
│   │   └── aether-wasm/       (planned) wasm-bindgen boundary crate
│   ├── types/                 Shared TypeScript type definitions
│   └── ui/                    Shared React component library
└── apps/
    └── web/                   Next.js 14 visualizer (static export → Vercel)
```

### Execution Model

```
Browser
 └── WASM module (aether-wasm)
      ├── tokens()        → token stream JSON
      ├── ast()           → AST JSON
      ├── hir()           → HIR JSON
      ├── clif_ir()       → Cranelift CLIF text
      ├── disassemble()   → x86-64/aarch64 disassembly text
      ├── vm_step()       → single bytecode step (VM)
      ├── vm_run()        → run to completion
      └── vm_rewind()     → time-travel debug
```

No server required. No cold starts. Zero hosting cost.

---

## Quick Start

```bash
# Prerequisites: Node 20+, pnpm 9+, Rust 1.75+, wasm-pack

cp .env.example .env
pnpm install                   # install JS deps
pnpm core:build                # compile Rust binary (native swcc)
pnpm dev                       # start Next.js dev server
```

| Service | URL |
|---------|-----|
| Web     | http://localhost:3000 |

---

## Tech Stack

| Layer      | Technology                              |
|------------|-----------------------------------------|
| Compiler   | Rust (saltwater fork)                   |
| VM Backend | Rust bytecode interpreter (aether-vm)   |
| WASM Bridge| wasm-bindgen + wasm-pack                |
| Web        | Next.js 14 + TypeScript + Tailwind      |
| Animation  | Framer Motion                           |
| State      | Zustand                                 |
| Editor     | Monaco Editor                           |
| Monorepo   | Turborepo + pnpm                        |
| Hosting    | Vercel (static export, no functions)    |
| CI         | GitHub Actions                          |

---

## Credits

Compiler core forked from
[saltwater](https://github.com/jyn514/rcc) by Jynn Nelson (GPL-2.0).
Aether extensions by Ahmad Hassan, UMT Lahore.
