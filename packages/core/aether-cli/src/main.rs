//! # aether-cli
//!
//! A native end-to-end pipeline verification tool for the Aether language.
//!
//! Runs a MiniLang++ source file through the full compiler + VM pipeline so
//! that each stage can be inspected before any WASM boundary is introduced.
//!
//! ## Usage
//!
//! ```text
//! aether-cli [--tokens] [--ast] [--hir] [--clif] [--run] <file>
//! ```
//!
//! ## Flags
//!
//! | Flag       | Stage                                        |
//! |------------|----------------------------------------------|
//! | `--tokens` | Print preprocessed tokens                    |
//! | `--ast`    | Print the parsed AST (via debug facility)    |
//! | `--hir`    | Print the type-checked HIR (via debug print) |
//! | `--clif`   | Print Cranelift CLIF IR (via debug facility) |
//! | `--run`    | Lower to VM bytecode and execute             |
//!
//! ## Pipeline ordering
//!
//! Stages always execute in dependency order regardless of argument order:
//!
//! ```text
//! tokens → ast → hir → clif → run
//! ```
//!
//! A failure at any stage aborts all subsequent stages and exits with code 1.
//! If no stage flags are provided, usage is printed and exits with code 2.

use std::path::{Path, PathBuf};
use std::process;

use aether_parser::{check_semantics, preprocess, Opt};
use aether_vm::{
    interp::{CallbackStdout, RealStdin, Vm},
    lower::lower_program,
    verifier::verify,
};

// ---------------------------------------------------------------------------
// Usage / Help
// ---------------------------------------------------------------------------

const VERSION: &str = env!("CARGO_PKG_VERSION");
const NAME: &str = env!("CARGO_PKG_NAME");

const USAGE: &str = "\
Usage: aether-cli [FLAGS] <file>

FLAGS:
    --tokens    Print preprocessed tokens (lex stage)
    --ast       Print parsed AST declarations
    --hir       Print type-checked HIR declarations
    --clif      Print Cranelift CLIF IR for each function
    --run       Lower to VM bytecode and execute; prints stdout then 'Exit code: N'
    -h, --help    Print this help message
    -V, --version Print version

ARGS:
    <file>      Path to the MiniLang++ source file (required)

NOTES:
    Stages execute in fixed dependency order (tokens -> ast -> hir -> clif -> run)
    regardless of argument order. Failure at any stage aborts subsequent stages.
    If no stage flags are given, usage is printed and the tool exits with code 2.";

// ---------------------------------------------------------------------------
// Parsed arguments
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
struct Args {
    file: PathBuf,
    tokens: bool,
    ast: bool,
    hir: bool,
    clif: bool,
    run: bool,
}

fn parse_args() -> Result<Args, String> {
    let mut parsed = Args::default();
    let mut got_file = false;

    for arg in std::env::args().skip(1) {
        match arg.as_str() {
            "--tokens" => parsed.tokens = true,
            "--ast" => parsed.ast = true,
            "--hir" => parsed.hir = true,
            "--clif" => parsed.clif = true,
            "--run" => parsed.run = true,
            "-h" | "--help" => {
                println!("{}", USAGE);
                process::exit(0);
            }
            "-V" | "--version" => {
                println!("{} {}", NAME, VERSION);
                process::exit(0);
            }
            flag if flag.starts_with('-') => {
                return Err(format!("unknown flag: {}", flag));
            }
            path => {
                if got_file {
                    return Err("only one source file may be specified".to_string());
                }
                parsed.file = PathBuf::from(path);
                got_file = true;
            }
        }
    }

    if !got_file {
        return Err("no source file specified".to_string());
    }

    Ok(parsed)
}

// ---------------------------------------------------------------------------
// Helper: build a base Opt for the given file
// ---------------------------------------------------------------------------

fn make_opt(file: &Path) -> Opt {
    Opt {
        filename: file.to_path_buf(),
        ..Opt::default()
    }
}

// ---------------------------------------------------------------------------
// Stage: Tokens
// ---------------------------------------------------------------------------

/// Print all preprocessed tokens to stdout.
///
/// Uses `aether_parser::preprocess()` which handles macro expansion, `#include`,
/// and `#define`. Tokens are printed one per line using their `Display` impl.
fn stage_tokens(source: &str, file: &Path) -> Result<(), ()> {
    let opt = make_opt(file);
    let program = preprocess(source, opt);

    for w in &program.warnings {
        eprintln!("warning: {}", w.data);
    }

    match program.result {
        Ok(tokens) => {
            println!("=== tokens ===");
            for tok in tokens {
                println!("{}", tok.data);
            }
            Ok(())
        }
        Err(errs) => {
            for e in errs {
                eprintln!("error: {}", e.data);
            }
            Err(())
        }
    }
}

// ---------------------------------------------------------------------------
// Stage: AST
// ---------------------------------------------------------------------------

/// Print each parsed AST declaration.
///
/// Uses `aether_parser::Opt { debug_ast: true }` which causes the parser to
/// call `println!("ast: {}", decl.data)` for each parsed declaration
/// (see `aether-parser/parse/mod.rs` line 101). No new parser API is needed.
fn stage_ast(source: &str, file: &Path) -> Result<(), ()> {
    let mut opt = make_opt(file);
    opt.debug_ast = true;
    println!("=== ast ===");
    let program = check_semantics(source, opt);
    for w in &program.warnings {
        eprintln!("warning: {}", w.data);
    }
    program.result.map(|_| ()).map_err(|errs| {
        for e in errs {
            eprintln!("error: {}", e.data);
        }
    })
}

// ---------------------------------------------------------------------------
// Stage: HIR
// ---------------------------------------------------------------------------

/// Print each type-checked HIR declaration.
///
/// Uses `aether_parser::Opt { debug_hir: true }` which causes the analyzer to
/// call `println!("hir: {}", decl.data)` for each declaration
/// (see `aether-parser/analyze/mod.rs` line 90).
fn stage_hir(source: &str, file: &Path) -> Result<(), ()> {
    let mut opt = make_opt(file);
    opt.debug_hir = true;
    println!("=== hir ===");
    let program = check_semantics(source, opt);
    for w in &program.warnings {
        eprintln!("warning: {}", w.data);
    }
    program.result.map(|_| ()).map_err(|errs| {
        for e in errs {
            eprintln!("error: {}", e.data);
        }
    })
}

// ---------------------------------------------------------------------------
// Stage: CLIF
// ---------------------------------------------------------------------------

/// Print Cranelift CLIF IR for each compiled function.
///
/// Uses `aether_codegen::compile()` with `debug_asm: true`.
///
/// ASSUMPTION: `Compiler::compile_func` in aether-codegen/lib.rs calls
/// `println!("ir: {}", func)` when `debug` is true (line 319-321).
/// This prints to stdout. If this internal mechanism changes and output
/// stops appearing, update this section and document the missing public API
/// rather than duplicating compiler logic.
fn stage_clif(source: &str, file: &Path) -> Result<(), ()> {
    let mut opt = make_opt(file);
    opt.debug_asm = true;
    println!("=== clif ===");
    let module = aether_codegen::initialize_aot_module("aether-cli-clif".to_owned());
    let program = aether_codegen::compile(module, source, opt);
    for w in &program.warnings {
        eprintln!("warning: {}", w.data);
    }
    program.result.map(|_| ()).map_err(|errs| {
        for e in errs {
            eprintln!("error: {}", e.data);
        }
    })
}

// ---------------------------------------------------------------------------
// Stage: Run
// ---------------------------------------------------------------------------

/// Full VM pipeline: source → HIR → VM bytecode → execute.
///
/// Prints whatever the program writes to stdout (via CallbackStdout writing
/// directly to the process stdout), then prints `Exit code: N`.
///
/// On any failure (semantic error, lowering error, verification error, VM trap)
/// the error is printed to stderr and `Err(())` is returned.
///
/// ASSUMPTION: `aether_vm::lower_program()` is the canonical HIR → bytecode
/// lowering entry point. If additional VM preparation steps are added to the
/// workspace, update this call site rather than duplicating lowering logic.
fn stage_run(source: &str, file: &Path) -> Result<(), ()> {
    // 1. Semantic analysis → HIR
    let opt = make_opt(file);
    let program = check_semantics(source, opt);
    for w in &program.warnings {
        eprintln!("warning: {}", w.data);
    }
    let decls = program.result.map_err(|errs| {
        for e in errs {
            eprintln!("error: {}", e.data);
        }
    })?;

    // 2. Lower HIR → VM bytecode
    let bytecode = lower_program(&decls).map_err(|e| {
        eprintln!("lowering error: {}", e);
    })?;

    // 3. Structural verification
    verify(&bytecode).map_err(|errors| {
        for e in errors {
            eprintln!("verification error: {}", e);
        }
    })?;

    // 4. Execute
    println!("=== run ===");
    let mut vm = Vm::new(bytecode).map_err(|errors| {
        for e in errors {
            eprintln!("vm init error: {}", e);
        }
    })?;

    // Wire stdout to a callback that writes directly to process stdout so that
    // program output appears immediately, interleaved with real terminal I/O.
    vm = vm.with_io(
        Box::new(CallbackStdout(|s: &str| {
            print!("{}", s);
        })),
        Box::new(RealStdin),
    );

    match vm.run_to_completion() {
        Ok(result) => {
            println!("Exit code: {}", result.exit_code);
            Ok(())
        }
        Err(trap) => {
            // Trap::Display already emits "trap: <message>", e.g. "trap: division by zero".
            eprintln!("{}", trap);
            Err(())
        }
    }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

fn main() {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("{}: {}", NAME, e);
            eprintln!("{}", USAGE);
            process::exit(2);
        }
    };

    // Require at least one stage flag.
    let any_flag = args.tokens || args.ast || args.hir || args.clif || args.run;
    if !any_flag {
        eprintln!("{}: no stage flags specified", NAME);
        eprintln!("{}", USAGE);
        process::exit(2);
    }

    // Read source file.
    let source = match std::fs::read_to_string(&args.file) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("{}: cannot read '{}': {}", NAME, args.file.display(), e);
            process::exit(1);
        }
    };

    // Stages execute in fixed dependency order. Failure at any stage aborts the rest.
    if args.tokens && stage_tokens(&source, &args.file).is_err() {
        process::exit(1);
    }

    if args.ast && stage_ast(&source, &args.file).is_err() {
        process::exit(1);
    }

    if args.hir && stage_hir(&source, &args.file).is_err() {
        process::exit(1);
    }

    if args.clif && stage_clif(&source, &args.file).is_err() {
        process::exit(1);
    }

    if args.run && stage_run(&source, &args.file).is_err() {
        process::exit(1);
    }
}
