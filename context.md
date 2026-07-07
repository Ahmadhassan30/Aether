# ◈ Aether — Developer Context & Architectural Onboarding

Welcome to Aether! This document is the source of truth for the codebase, architecture,
internal compiler design, testing infrastructure, and monorepo state. It gets any
incoming engineer fully oriented and code-ready immediately.

---

## 1. Project Vision & Purpose

Aether is a **live compiler visualization environment** for **MiniLang++** (a C subset).
It exposes every internal compilation phase — tokens, AST, HIR, Cranelift CLIF IR,
native disassembly, and bytecode VM execution — in real time, running **entirely in the
browser as WebAssembly** with zero server infrastructure.

### Core Goals
- **Real-Time Visual Feedback**: Stream compiler phase data to a modern Next.js UI.
- **Two Independent Backends**:
  1. **Cranelift disassembly path** — shows real x86-64/aarch64 machine code, what a
     production compiler would emit.
  2. **Bytecode VM** (aether-vm, planned) — interprets HIR via a custom ISA for live,
     steppable, time-travel execution inside the browser.
- **Zero Infrastructure Cost**: 100% client-side WASM, hosted statically on Vercel.
- **Academic Context**: CS3045 Compiler Construction · Spring 2026, UMT Lahore.

---

## 2. Repository Layout

```
Aether/
├── packages/
│   ├── core/                        ← Cargo package root (the swcc binary)
│   │   ├── Cargo.toml               ← package manifest (bin + test + bench targets)
│   │   ├── src/main.rs              ← CLI driver (argument parsing, error display)
│   │   ├── saltwater-parser/        ← library crate: lex, preprocess, parse, analyze
│   │   │   ├── Cargo.toml
│   │   │   ├── lib.rs               ← public API: preprocess(), check_semantics(), compile()
│   │   │   ├── lex/                 ← Lexer, PreProcessor, macro replacement
│   │   │   ├── parse/               ← recursive-descent Parser
│   │   │   ├── analyze/             ← Analyzer (AST → HIR, type checking)
│   │   │   ├── data/                ← Token, AST, HIR, Type, Error structs
│   │   │   ├── arch/                ← target architecture type sizes
│   │   │   └── headers/             ← built-in stdarg.h / stddef.h
│   │   ├── saltwater-codegen/       ← library crate: Cranelift IR generation
│   │   │   ├── Cargo.toml
│   │   │   ├── lib.rs               ← compile(), assemble(), link(), initialize_*_module()
│   │   │   ├── expr.rs              ← HIR expression → Cranelift instructions
│   │   │   ├── stmt.rs              ← HIR statement → Cranelift blocks
│   │   │   └── static_init.rs      ← global/static initializers
│   │   ├── tests/                   ← integration test suites
│   │   │   ├── runner.rs            ← iterates tests/runner-tests/*.c
│   │   │   ├── varargs.rs           ← variadic function output tests
│   │   │   ├── stack-overflow.rs    ← recursion guard tests (exit 102)
│   │   │   ├── headers.rs           ← C standard header compilation tests
│   │   │   ├── jit.rs               ← JIT execution tests (feature-gated)
│   │   │   ├── runner-tests/        ← C test programs (annotated with // compile etc.)
│   │   │   ├── stack-overflow/      ← deeply nested C files for recursion tests
│   │   │   └── utils/mod.rs         ← compile/run/assert helpers
│   │   └── benches/                 ← Criterion benchmarks
│   ├── types/                       ← Shared TypeScript type definitions (placeholder)
│   └── ui/                          ← Shared React component library (placeholder)
├── apps/
│   └── web/                         ← Next.js 14 visualizer (placeholder)
├── fuzz/                            ← cargo-fuzz targets (own [workspace], excluded from main)
├── minimizer/                       ← test-case minimization shell scripts
├── reference/                       ← state machine diagrams (if_state.dot / .svg)
├── Cargo.toml                       ← Rust workspace root (workspace members, profiles)
├── package.json                     ← monorepo scripts (pnpm + Turborepo)
├── pnpm-workspace.yaml              ← pnpm workspace layout
└── turbo.json                       ← Turborepo build/dev task pipelines
```

---

## 3. Workspace Configuration

### Rust Workspace (root Cargo.toml)
```toml
[workspace]
members = [
    "packages/core",
    "packages/core/saltwater-parser",
    "packages/core/saltwater-codegen",
]
resolver = "2"
```
- Profiles (`release`, `dev`, `test`, `bench`) are centralised here.
- Future crates (`aether-vm`, `aether-wasm`) will be added as additional members.
- `fuzz/` has its own `[workspace]` and is intentionally excluded.

### JS/TS Workspace (pnpm-workspace.yaml)
```yaml
packages:
  - "apps/*"
  - "packages/types"
  - "packages/ui"
```

### Key Scripts (package.json)
| Script | Description |
|---|---|
| `pnpm core:build` | `cargo build --release --manifest-path packages/core/Cargo.toml` |
| `pnpm core:build:workspace` | `cargo build --workspace` |
| `pnpm core:test` | `cargo test --workspace` |
| `pnpm wasm:build` | `wasm-pack build packages/core --target web --out-dir pkg` |
| `pnpm dev` | Turborepo dev (Next.js) |

---

## 4. Rust Compiler Core: Compilation Phases

```
Source Code
  │
  ▼
[Preprocessor]  lex/cpp.rs + lex/replace.rs
  Handles #include, #define, #ifdef, #undef, line directives
  │
  ▼
[Lexer]  lex/mod.rs
  Converts preprocessed text → Token stream (punctuators, literals, keywords, ids)
  Supports binary/octal/decimal/hex radix, string/char escapes
  │
  ▼
[Parser]  parse/mod.rs + parse/decl.rs + parse/expr.rs + parse/stmt.rs
  Recursive-descent; 2 tokens lookahead
  Outputs: AST (data/ast.rs) — ExternalDeclaration, Stmt, Expr
  │
  ▼
[Semantic Analyzer]  analyze/mod.rs + analyze/expr.rs + analyze/stmt.rs + analyze/init.rs
  Type checking, implicit casts, scope resolution (4 namespaces), constant folding
  Outputs: HIR (data/hir.rs) — typed, desugared declarations
  │
  ├──▶ [Cranelift Codegen]  saltwater-codegen/lib.rs
  │      HIR → Cranelift CLIF IR → native object → assemble → link
  │      Used for: disassembly visualization panel
  │
  └──▶ [Bytecode VM]  aether-vm (planned)
         HIR → custom bytecode ISA → interpreter with step/breakpoint/rewind
         Used for: live execution in browser
```

### Key Public API (saltwater-parser/lib.rs)
| Function | Input | Output |
|---|---|---|
| `preprocess(buf, opt)` | source string + options | `Program<VecDeque<Token>>` |
| `check_semantics(buf, opt)` | source string + options | `Program<Vec<Declaration>>` (HIR) |
| *(codegen)* `compile(module, buf, opt)` | Cranelift module + source | `Program<Module>` |

### Program<T> struct
Wraps every pipeline result — always returns both `result: Result<T, Errors>` and
`warnings: VecDeque<CompileWarning>` and `files: Files` (the codespan location DB),
even for error cases.

---

## 5. Key Compiler Quirks & Decisions

1. **Recursion Guard** ([lib.rs#L119](file:///c:/Users/ahmad/Desktop/Aether/packages/core/saltwater-parser/lib.rs)):
   `RecursionGuard` tracks parse depth via `Rc` reference count. Limit: 1,000 (debug)
   / 10,000 (release). Graceful exit with code `102` instead of a segfault.

2. **`char` is signed**. Right-shift on negatives is arithmetic (sign-preserving).
   See [IMPLEMENTATION_DEFINED.md](file:///c:/Users/ahmad/Desktop/Aether/IMPLEMENTATION_DEFINED.md).

3. **`inline` and `register` are ignored** (parsed but no-op).

4. **Salty feature**: `--features salty` enables randomized error/warning messages and
   plays `src/R2D2-Scream.ogg` on panics.

5. **Hex float literals** don't require an exponent (diverges slightly from C standard;
   uses `hexponent` crate).

6. **JIT mode** (`--features jit`): uses Cranelift `simplejit` backend to execute code
   directly in process. Not available in WASM builds.

---

## 6. Testing Framework

Tests live in `packages/core/tests/`. Cargo test harness runs them from `packages/core/`
as the working directory.

### A. `runner.rs` — Integration tests
Walks `tests/runner-tests/` recursively. Each `.c` file's **first line** is a directive:

| Directive | Assertion |
|---|---|
| `// compile` | Compilation succeeds (no run) |
| `// no-main` | Compiles even without a `main` function |
| `// fail` / `// compile-error` | Compilation fails |
| `// succeeds` | Compiles, runs, exits 0 |
| `// crash` | Compiles, runs, exits with signal |
| `// code: N` | Compiles, runs, exits with N |
| `// errors: N` | Fails with exactly N errors |
| `// output: X` | Runs, stdout matches X (supports `BEGIN:/END` multiline) |
| `// ignore: URL` | Skipped (must link a GitHub issue) |

### B. `varargs.rs` — Variadic function tests
Compares output of compiled `printf` calls against the host system `printf`.

### C. `stack-overflow.rs` — Recursion guard tests
Passes deeply nested C structures to `swcc`, asserts exit code is `102`.

### D. `headers.rs` — Standard header tests
Preprocesses system C headers via `cpp`, then compiles the result with saltwater.
Requires `_test_headers` feature.

### E. `jit.rs` — JIT execution tests
Requires `jit` feature (Cranelift SimpleJIT). Not WASM-compatible.

---

## 7. Development Utilities

### Crash Minimizer
`minimizer/minimize.sh <input.c> <condition> <args>` — reduces a crashing C file to
the smallest form that still triggers the bug. Conditions: `return_code_equals`,
`output_contains`, `return_code_is_not`.

### mycpp
Shell wrapper that invokes `cpp` with all standard architecture/limit macros needed
to preprocess standard headers correctly.

---

## 8. Getting Started

```bash
# Prerequisites: Rust 1.75+, Node 20+, pnpm 9+, wasm-pack (later)

# 1. Install JS dependencies
pnpm install

# 2. Build the native compiler (swcc binary)
pnpm core:build

# 3. Run all Rust tests
pnpm core:test

# 4. Start the Next.js dev server (once apps/web is scaffolded)
pnpm dev
```

> [!IMPORTANT]
> There is **no backend**. No FastAPI, no Groq API key, no Docker required.
> The entire compiler runs as WebAssembly in the browser.
> The native `swcc` binary is only needed for local development/testing.
