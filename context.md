# ◈ Aether — Developer Context & Architectural Onboarding

Welcome to Aether! This document is the source of truth for the codebase, architecture, internal compiler design, virtual machine, testing infrastructure, and monorepo state. It gets any incoming engineer fully oriented and code-ready immediately.

---

## 1. Project Vision & Purpose

Aether is a **live compiler visualization environment** for **MiniLang++** (a C subset). It exposes every internal compilation phase — tokens, AST, HIR, Cranelift CLIF IR, native disassembly, and bytecode VM execution — in real time, running **entirely in the browser as WebAssembly** with zero server infrastructure.

### Core Goals
- **Real-Time Visual Feedback**: Stream compiler phase data to a modern Next.js UI.
- **Two Independent Backends**:
  1. **Cranelift disassembly path** — shows real x86-64/aarch64 machine code, representing what a production compiler would emit.
  2. **Bytecode VM** ([aether-vm](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-vm)) — lowers HIR to custom stack-based bytecode and interprets it via an execution engine supporting live, single-steppable, and time-travel (rewindable) debugger states inside the browser.
- **Zero Infrastructure Cost**: 100% client-side WASM, hosted statically on Vercel.
- **Academic Context**: CS3045 Compiler Construction · Spring 2026, UMT Lahore.

---

## 2. Repository Layout

```
Aether/
├── packages/
│   ├── core/                        ← Cargo workspace package containing core libraries
│   │   ├── Cargo.toml               ← [Cargo.toml](file:///c:/Users/ahmad/Desktop/Aether/packages/core/Cargo.toml)
│   │   ├── src/main.rs              ← swcc compiler driver binary
│   │   ├── aether-parser/           ← [aether-parser](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-parser) library crate
│   │   │   ├── Cargo.toml
│   │   │   ├── lib.rs               ← [lib.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-parser/lib.rs) exports preprocess(), check_semantics()
│   │   │   ├── lex/                 ← Lexer, PreProcessor, macro replacement
│   │   │   ├── parse/               ← recursive-descent Parser
│   │   │   ├── analyze/             ← Analyzer (AST → HIR, type checking)
│   │   │   ├── data/                ← Token, AST, HIR, Type, Error structs
│   │   │   ├── arch/                ← target architecture type sizes
│   │   │   └── headers/             ← built-in stdarg.h / stddef.h
│   │   ├── aether-codegen/          ← [aether-codegen](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-codegen) library crate
│   │   │   ├── Cargo.toml
│   │   │   ├── lib.rs               ← [lib.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-codegen/lib.rs) exports compile(), initialize_aot_module()
│   │   │   ├── expr.rs              ← HIR expression → Cranelift IR translation
│   │   │   ├── stmt.rs              ← HIR statement → Cranelift blocks
│   │   │   └── static_init.rs       ← global/static initializers
│   │   ├── aether-vm/               ← [aether-vm](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-vm) bytecode interpreter & debugger
│   │   │   ├── Cargo.toml
│   │   │   ├── src/lib.rs           ← [lib.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-vm/src/lib.rs) VM facade
│   │   │   ├── src/isa.rs           ← [isa.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-vm/src/isa.rs) custom bytecode ISA definition
│   │   │   ├── src/program.rs       ← [program.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-vm/src/program.rs) binary representation and Trap variants
│   │   │   ├── src/verifier.rs      ← [verifier.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-vm/src/verifier.rs) structural verifier for safety
│   │   │   ├── src/lower.rs         ← [lower.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-vm/src/lower.rs) HIR → bytecode compiler pass
│   │   │   ├── src/interp.rs        ← [interp.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-vm/src/interp.rs) interpreter runtime, stepping & rewind history buffer
│   │   │   └── src/snapshot.rs      ← [snapshot.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-vm/src/snapshot.rs) state snapshots for debugger visualizer
│   │   ├── aether-cli/              ← [aether-cli](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-cli) native E2E command-line tool
│   │   │   ├── Cargo.toml
│   │   │   ├── src/main.rs          ← [main.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-cli/src/main.rs) cli pipeline orchestrator
│   │   │   └── tests/               ← pipeline verification tests
│   │   ├── tests/                   ← integration test suites
│   │   │   ├── runner.rs            ← iterates tests/runner-tests/*.c
│   │   │   ├── varargs.rs           ← variadic function output tests
│   │   │   ├── stack-overflow.rs    ← recursion guard tests
│   │   │   └── headers.rs           ← standard library header compilation tests
│   │   └── benches/                 ← Criterion compiler benchmarks
│   ├── types/                       ← [packages/types](file:///c:/Users/ahmad/Desktop/Aether/packages/types) (JS/TS type placeholders)
│   └── ui/                          ← [packages/ui](file:///c:/Users/ahmad/Desktop/Aether/packages/ui) (React/TS components placeholders)
├── apps/
│   └── web/                         ← [apps/web](file:///c:/Users/ahmad/Desktop/Aether/apps/web) (Next.js 14 visualizer; placeholder)
├── fuzz/                            ← cargo-fuzz targets (own workspace, excluded from main)
├── minimizer/                       ← test-case minimization shell scripts
├── reference/                       ← state machine diagrams
├── Cargo.toml                       ← [Cargo.toml](file:///c:/Users/ahmad/Desktop/Aether/Cargo.toml) workspace root configuration
├── package.json                     ← monorepo configuration scripts
├── pnpm-workspace.yaml              ← JS monorepo setup
└── turbo.json                       ← Turborepo build pipeline
```

---

## 3. Workspace Configuration

### Rust Workspace ([Cargo.toml](file:///c:/Users/ahmad/Desktop/Aether/Cargo.toml))
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

- Optimised compiler options, LTO, and symbols strip settings are configured centrally at the root.
- The `fuzz/` directory represents a separate Rust workspace to isolate fuzz dependencies.

### JS/TS Workspace ([pnpm-workspace.yaml](file:///c:/Users/ahmad/Desktop/Aether/pnpm-workspace.yaml))
```yaml
packages:
  - "apps/*"
  - "packages/types"
  - "packages/ui"
```

### Key Monorepo Scripts ([package.json](file:///c:/Users/ahmad/Desktop/Aether/package.json))
| Script | Command / Target | Description |
|---|---|---|
| `pnpm core:build` | `cargo build --release --manifest-path packages/core/Cargo.toml` | Builds the native CLI compiler binary (`swcc`) |
| `pnpm core:build:workspace` | `cargo build --workspace` | Compiles the entire Rust workspace (parser, codegen, vm, cli, wasm) |
| `pnpm core:test` | `cargo test --workspace` | Runs all Rust unit, integration, and doc tests |
| `pnpm wasm:build` | `npx wasm-pack build packages/core/aether-wasm --target web --out-dir ../../../apps/web/pkg` | Builds WASM compiler bundles for browser inclusion |
| `pnpm wasm:verify` | `node packages/core/aether-wasm/verify/compare.mjs` | Verifies and compares WASM outputs against native CLI |
| `pnpm dev` | Turborepo pipeline execution | Starts Next.js development server (once frontend is scaffolded) |

---

## 4. Rust Compiler Core & Virtual Machine Pipeline

```
          [ Source Code ]
                 │
                 ▼
     [ Preprocessor (aether-parser) ]   ← lex/cpp.rs + lex/replace.rs
        - Handles #include, #define, #ifdef, macro expansions
                 │
                 ▼
        [ Lexer (aether-parser) ]       ← lex/mod.rs
        - Outputs Token stream (literals, keywords, escapes)
                 │
                 ▼
       [ Parser (aether-parser) ]       ← parse/mod.rs
        - Recursive-descent; parses external decls, statements, exprs
        - Outputs: Abstract Syntax Tree (AST)
                 │
                 ▼
  [ Semantic Analyzer (aether-parser) ] ← analyze/mod.rs
        - Type checking, implicit casts, scope resolution, folding
        - Outputs: High-Level Intermediate Representation (HIR)
                 │
        ┌────────┴──────────────────────────────┐
        ▼                                       ▼
[ Cranelift Codegen ]                   [ Bytecode Lowering ]
(aether-codegen/lib.rs)                 (aether-vm/src/lower.rs)
- Translates HIR → Cranelift IR         - Compiles HIR → custom bytecode ISA
- Outputs: Machine disassembly          - Outputs: Program representation
        │                                       │
        ▼                                       ▼
[ JIT / Disassembly Panel ]             [ Bytecode Verifier ]
- Feeds interactive compiler panels    (aether-vm/src/verifier.rs)
                                        - Structurally validates instruction set
                                                │
                                                ▼
                                        [ VM Execution Engine ]
                                        (aether-vm/src/interp.rs)
                                        - Interprets program on stack-based VM
                                        - Supports step, rewind (history = 5000), 
                                          and run_to_cursor debugger operations
```

### Key Public APIs

#### 1. aether-parser ([lib.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-parser/lib.rs))
- `preprocess(buf: &str, opt: Opt) -> Program<VecDeque<Locatable<Token>>>`: Converts source code strings into a queue of tokens.
- `check_semantics(buf: &str, opt: Opt) -> Program<Vec<Locatable<hir::Declaration>>>`: Compiles source code into type-checked High-Level Intermediate Representation (HIR) declarations.

#### 2. aether-codegen ([lib.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-codegen/lib.rs))
- `compile(module: Module, buf: &str, opt: Opt) -> Program<Module>`: Compiles source code into Cranelift assembly output.

#### 3. aether-vm ([lib.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-vm/src/lib.rs))
- `lower_program(decls: &[hir::Declaration]) -> Result<Program, LowerError>`: Lowers type-checked HIR declarations into virtual machine bytecode instructions.
- `verify(prog: &Program) -> Result<(), Vec<String>>`: Runs structural and static bytecode sanity assertions.
- `Vm::new(prog: Program) -> Result<Vm, Vec<String>>`: Instantiates a virtual machine execution context.
- `vm.step() -> Result<VmSnapshot, Trap>`: Executes exactly one bytecode instruction, tracking state in a history buffer.
- `vm.rewind(n: usize) -> Option<VmSnapshot>`: Rewinds execution state back up to `n` cycles using the recorded history buffer.
- `vm.run_to_cursor(target_offset: usize) -> Result<VmSnapshot, Trap>`: Executes instructions sequentially until the program counter hits `target_offset`.

---

## 5. Key Compiler Quirks & Decisions

1. **Recursion Guard** ([lib.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-parser/lib.rs#L119)):
   `RecursionGuard` tracks recursive parser depth using reference counts. Depth limits: 1,000 (debug) / 10,000 (release). Clean exit with exit code `102` rather than crashing the thread.
2. **Signed Characters**:
   `char` is signed; right-shifts on negatives preserve sign (arithmetic shift). See [IMPLEMENTATION_DEFINED.md](file:///c:/Users/ahmad/Desktop/Aether/IMPLEMENTATION_DEFINED.md).
3. **VM History Limit**:
   The execution engine maintains a bounded queue of past VM states (up to 5,000 instructions) to support responsive, high-performance time-travel debugging inside the frontend visualizer.
4. **Salty mode**:
   Compiling with `--features salty` introduces randomized error/warning text messages and plays a panic sound helper.
5. **Hexadecimal Floats**:
   C99 hexadecimal floats are parsed without demanding an exponent (deviating from standard specification to improve developer readability; relies on `hexponent`).
6. **JIT compilation**:
   Uses Cranelift simplejit backend for execution inside native tests. Disabled on WASM targets due to architectural limitations.

---

## 6. Native verification CLI ([aether-cli](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-cli))

An end-to-end CLI driver for testing compilation and execution pipelines natively before loading the modules in a WebAssembly sandbox environment.

### Usage
```bash
cargo run -p aether-cli -- [FLAGS] <file.c>
```

### Stage Flags
| Flag | Pipeline Stage | Description |
|---|---|---|
| `--tokens` | Preprocessor + Lexer | Prints the preprocessed token list |
| `--ast` | Parser | Outputs debug AST declarations |
| `--hir` | Semantic Analysis | Prints type-checked HIR declarations |
| `--clif` | Codegen | Prints translated Cranelift CLIF IR |
| `--run` | VM Lowering + Runtime | Runs program on VM; outputs stdout and program exit code |

*Stages always execute sequentially (`tokens` → `ast` → `hir` → `clif` → `run`). Failure at any step halts subsequent actions.*

---

## 7. Testing & Verification Infrastructure

All workspace unit and integration tests compile and run cleanly. The test suites verify compiler phase compliance, code generation, error recovery, and VM behavior:

1. **Parser & Lexer Tests**: Internal parser/lexer module tests confirming correct recursive descent and preprocessor behaviors.
2. **Virtual Machine Tests** ([interp.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-vm/tests/interp.rs) & [lower.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-vm/tests/lower.rs)):
   Validates basic arithmetic, recursion execution (e.g. factorial, fibonacci), memory array boundaries, execution limits, I/O streaming, and division-by-zero trapping.
3. **Debugger Snapshot Tests** ([snapshot_tests.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-vm/tests/snapshot_tests.rs)):
   Verifies stepping, execution history verification, multi-cycle rewinding, state restoration consistency, and program cursor executions.
4. **CLI Pipeline Tests** ([cli_pipeline.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/aether-cli/tests/cli_pipeline.rs)):
   Runs integration source file assertions passing arguments natively through the orchestrator.
5. **C Crate Integrations** ([runner.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/tests/runner.rs)):
   Walks `runner-tests/` directory files asserting correctness through custom annotations (e.g. `// compile`, `// fail`, `// output: X`).
6. **Variadic Arguments** ([varargs.rs](file:///c:/Users/ahmad/Desktop/Aether/packages/core/tests/varargs.rs)):
   Ensures variadic function compatibility matching native compiler outputs.

---

## 8. Current Project Status

- **Rust Compiler & Virtual Machine (Backends)**: **100% Completed, Verified & Passing**. Core parser modules, Cranelift codegen, bytecode compilation, execution interpreter, structural verifiers, step-by-step history snapshots, and rewinding mechanisms compile and execute flawlessly under the Rust workspace.
- **Native Verification CLI**: **Completed & Fully Functional**. The `aether-cli` driver is used to run pipeline steps directly.
- **WASM Integration Layer**: **Partially Planned**. Facilitated by the `wasm-pack` command and the standalone architecture of the crates.
- **JS/TS Workspace & React Frontend**: **Not Started (Placeholder State)**. `apps/web` contains only a `.gitkeep` file. Once developed, it will consume the Rust compiler WASM output, displaying token streams, AST nodes, HIR trees, Cranelift assembly disassemblies, and an interactive Virtual Machine panel with stepping and execution rewinding controls.
