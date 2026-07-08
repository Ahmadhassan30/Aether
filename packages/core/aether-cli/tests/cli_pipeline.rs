//! Integration tests for the `aether-cli` binary.
//!
//! Each test invokes the real `aether-cli` binary via `std::process::Command`
//! using `env!("CARGO_BIN_EXE_aether-cli")` so that Cargo resolves the binary
//! for the current build profile.
//!
//! Test programs are written to temporary files where no suitable file exists
//! in `packages/core/tests/runner-tests/`; otherwise existing runner-tests
//! programs are used directly.

use std::path::PathBuf;
use std::process::{Command, Output};
use std::{env, fs};

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/// The absolute path to the workspace root (the `Aether` directory).
///
/// `CARGO_MANIFEST_DIR` for this crate is `packages/core/aether-cli`, so we
/// go up three levels to reach the workspace root.
fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .expect("workspace root should exist")
}

/// The absolute path to `packages/core/tests/runner-tests/`.
fn runner_tests_dir() -> PathBuf {
    workspace_root().join("packages/core/tests/runner-tests")
}

/// Run `aether-cli` with the given arguments and return the captured `Output`.
fn run_cli(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_aether-cli"))
        .args(args)
        .output()
        .expect("failed to spawn aether-cli")
}

/// Write `content` to a temporary `.c` file and return its path.
///
/// The file is created inside `$TMPDIR` / `$TEMP` so it outlives the test
/// function without needing cleanup logic (the OS will eventually reclaim it).
fn write_temp_c(name: &str, content: &str) -> PathBuf {
    let dir = env::temp_dir().join("aether-cli-tests");
    fs::create_dir_all(&dir).expect("create temp dir");
    let path = dir.join(format!("{}.c", name));
    fs::write(&path, content).expect("write temp source file");
    path
}

// ---------------------------------------------------------------------------
// Test: no flags → usage printed, exit code 2
// ---------------------------------------------------------------------------

#[test]
fn no_flags_prints_usage_and_exits_2() {
    let path = write_temp_c("no_flags", "int main() { return 0; }");
    let out = run_cli(&[path.to_str().unwrap()]);

    let stderr = String::from_utf8_lossy(&out.stderr);
    let combined = format!("{}{}", String::from_utf8_lossy(&out.stdout), stderr);

    assert_eq!(
        out.status.code(),
        Some(2),
        "expected exit code 2 for no flags; stderr: {}",
        stderr
    );
    assert!(
        combined.to_ascii_lowercase().contains("usage"),
        "expected 'usage' in output; got: {}",
        combined
    );
}

// ---------------------------------------------------------------------------
// Test: --tokens on hello_world.c (existing runner-test file)
// ---------------------------------------------------------------------------

#[test]
fn tokens_hello_world() {
    let file = runner_tests_dir().join("hello_world.c");
    let out = run_cli(&["--tokens", file.to_str().unwrap()]);
    let stdout = String::from_utf8_lossy(&out.stdout);

    assert!(
        out.status.success(),
        "expected success; stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(
        stdout.contains("=== tokens ==="),
        "expected '=== tokens ===' header; got: {}",
        stdout
    );
    // Verify meaningful tokens are present.
    for expected in &["int", "main", "(", ")", ";"] {
        assert!(
            stdout.contains(expected),
            "expected token '{}' in tokens output; stdout: {}",
            expected,
            stdout
        );
    }
}

// ---------------------------------------------------------------------------
// Test: --ast on a simple arithmetic program
// ---------------------------------------------------------------------------

#[test]
fn ast_simple_program() {
    let path = write_temp_c("ast_test", "int main() { return 42; }");
    let out = run_cli(&["--ast", path.to_str().unwrap()]);
    let stdout = String::from_utf8_lossy(&out.stdout);

    assert!(
        out.status.success(),
        "expected success; stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(
        stdout.contains("=== ast ==="),
        "expected '=== ast ===' header; stdout: {}",
        stdout
    );
    // The parser prints "ast: <decl>" — check that at least one "ast:" appears.
    assert!(
        stdout.contains("ast:"),
        "expected 'ast:' prefix in AST output; stdout: {}",
        stdout
    );
    // Check that 'main' appears in the AST output.
    assert!(
        stdout.contains("main"),
        "expected function name 'main' in AST output; stdout: {}",
        stdout
    );
}

// ---------------------------------------------------------------------------
// Test: --hir on a fibonacci program
// ---------------------------------------------------------------------------

#[test]
fn hir_fibonacci() {
    let src = "int fib(int n) { if (n <= 1) { return n; } return fib(n-1) + fib(n-2); } int main() { return fib(10); }";
    let path = write_temp_c("hir_fib", src);
    let out = run_cli(&["--hir", path.to_str().unwrap()]);
    let stdout = String::from_utf8_lossy(&out.stdout);

    assert!(
        out.status.success(),
        "expected success; stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(
        stdout.contains("=== hir ==="),
        "expected '=== hir ===' header; stdout: {}",
        stdout
    );
    // The analyzer prints "hir: <decl>" for each HIR declaration.
    assert!(
        stdout.contains("hir:"),
        "expected 'hir:' prefix in HIR output; stdout: {}",
        stdout
    );
    // Both function names should appear.
    assert!(
        stdout.contains("fib"),
        "expected function name 'fib' in HIR; stdout: {}",
        stdout
    );
    assert!(
        stdout.contains("main"),
        "expected function name 'main' in HIR; stdout: {}",
        stdout
    );
}

// ---------------------------------------------------------------------------
// Test: --run on recursive fibonacci(10) → exit code 55
// ---------------------------------------------------------------------------

#[test]
fn run_fibonacci_10() {
    let src = "int fib(int n) { if (n <= 1) { return n; } return fib(n-1) + fib(n-2); } int main() { return fib(10); }";
    let path = write_temp_c("run_fib", src);
    let out = run_cli(&["--run", path.to_str().unwrap()]);
    let stdout = String::from_utf8_lossy(&out.stdout);

    assert!(
        out.status.success(),
        "expected process exit success; stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(
        stdout.contains("=== run ==="),
        "expected '=== run ===' header; stdout: {}",
        stdout
    );
    assert!(
        stdout.contains("Exit code: 55"),
        "expected 'Exit code: 55' for fib(10); stdout: {}",
        stdout
    );
}

// ---------------------------------------------------------------------------
// Test: --run on loop sum 1..=10 → exit code 55
// ---------------------------------------------------------------------------

#[test]
fn run_loop_sum() {
    let src = "int main() { int sum = 0; int i = 1; while (i <= 10) { sum = sum + i; i = i + 1; } return sum; }";
    let path = write_temp_c("run_loop", src);
    let out = run_cli(&["--run", path.to_str().unwrap()]);
    let stdout = String::from_utf8_lossy(&out.stdout);

    assert!(
        out.status.success(),
        "expected process exit success; stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(
        stdout.contains("Exit code: 55"),
        "expected 'Exit code: 55' for loop-sum 1..=10; stdout: {}",
        stdout
    );
}

// ---------------------------------------------------------------------------
// Test: --run on divide-by-zero → exit code 1, stderr contains trap message
// ---------------------------------------------------------------------------

#[test]
fn run_divide_by_zero_trap() {
    let src = "int main() { int a = 10; int b = 0; return a / b; }";
    let path = write_temp_c("run_divzero", src);
    let out = run_cli(&["--run", path.to_str().unwrap()]);
    let stderr = String::from_utf8_lossy(&out.stderr);

    assert_eq!(
        out.status.code(),
        Some(1),
        "expected exit code 1 for trap; stderr: {}",
        stderr
    );
    // The CLI prints the trap directly, which displays "trap: division by zero".
    assert!(
        stderr.contains("division by zero"),
        "expected 'division by zero' in stderr for DivByZero trap; got: {}",
        stderr
    );
}

// ---------------------------------------------------------------------------
// Test: --run on a program with compile error → exit code 1, stderr has error
// ---------------------------------------------------------------------------

#[test]
fn run_compile_error() {
    let src = "int main() { return undefined_var; }";
    let path = write_temp_c("run_err", src);
    let out = run_cli(&["--run", path.to_str().unwrap()]);
    let stderr = String::from_utf8_lossy(&out.stderr);

    assert_eq!(
        out.status.code(),
        Some(1),
        "expected exit code 1 for compile error; stderr: {}",
        stderr
    );
    assert!(
        !stderr.is_empty(),
        "expected error message in stderr; got nothing"
    );
}

// ---------------------------------------------------------------------------
// Test: --tokens --run combined → both sections appear, correct exit code
// ---------------------------------------------------------------------------

#[test]
fn combined_tokens_and_run() {
    let src = "int main() { return 7; }";
    let path = write_temp_c("combined_test", src);
    let out = run_cli(&["--tokens", "--run", path.to_str().unwrap()]);
    let stdout = String::from_utf8_lossy(&out.stdout);

    assert!(
        out.status.success(),
        "expected success; stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(
        stdout.contains("=== tokens ==="),
        "expected tokens section; stdout: {}",
        stdout
    );
    assert!(
        stdout.contains("=== run ==="),
        "expected run section; stdout: {}",
        stdout
    );
    assert!(
        stdout.contains("Exit code: 7"),
        "expected 'Exit code: 7'; stdout: {}",
        stdout
    );
}

// ---------------------------------------------------------------------------
// Test: --tokens on the existing hello_world.c verifies the lexer stage
// works on a real runner-tests file without crashing.
// ---------------------------------------------------------------------------

#[test]
fn tokens_on_existing_runner_test() {
    let file = runner_tests_dir().join("hello_world.c");
    let out = run_cli(&["--tokens", file.to_str().unwrap()]);
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);

    assert!(
        out.status.success(),
        "expected --tokens to succeed on hello_world.c; stderr: {}",
        stderr
    );
    // Must have the section header.
    assert!(
        stdout.contains("=== tokens ==="),
        "expected tokens section header; stdout: {}",
        stdout
    );
    // Verify key identifiers appear in the token list.
    for expected in &["main", "puts"] {
        assert!(
            stdout.contains(expected),
            "expected '{}' in token output; stdout: {}",
            expected,
            stdout
        );
    }
}

// ---------------------------------------------------------------------------
// Test: --hir --run combined on a simple program — both stages produce output
// and the exit code is correct.
// ---------------------------------------------------------------------------

#[test]
fn combined_hir_and_run() {
    let src = "int double_it(int x) { return x * 2; } int main() { return double_it(21); }";
    let path = write_temp_c("hir_run_combined", src);
    let out = run_cli(&["--hir", "--run", path.to_str().unwrap()]);
    let stdout = String::from_utf8_lossy(&out.stdout);

    assert!(
        out.status.success(),
        "expected success; stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(
        stdout.contains("=== hir ==="),
        "expected hir section; stdout: {}",
        stdout
    );
    assert!(
        stdout.contains("hir:"),
        "expected 'hir:' declarations; stdout: {}",
        stdout
    );
    assert!(
        stdout.contains("=== run ==="),
        "expected run section; stdout: {}",
        stdout
    );
    assert!(
        stdout.contains("Exit code: 42"),
        "expected 'Exit code: 42' for double_it(21); stdout: {}",
        stdout
    );
}
