use aether_parser::{check_semantics, Opt};
use aether_vm::interp::Vm;
use aether_vm::lower::lower_program;
use aether_vm::program::Trap;
use aether_vm::verifier::verify;

// --- Helper to Compile and Run ---
fn run_aether_program(source: &str) -> Result<i64, String> {
    let mut opt = Opt::default();
    opt.debug_hir = true;

    let clean_source = format!("{}\n", source.trim());
    let res = check_semantics(&clean_source, opt).result;
    let decls = res.map_err(|errs| {
        errs.into_iter()
            .map(|e| e.data.to_string())
            .collect::<Vec<_>>()
            .join("\n")
    })?;

    let program = lower_program(&decls).map_err(|err| err.to_string())?;

    // Bytecode Verification
    verify(&program).map_err(|errs| errs.join("\n"))?;

    // VM Execution
    let mut vm = Vm::new(program).map_err(|errs| errs.join("\n"))?;
    let run_res = vm.run_to_completion().map_err(|trap| match trap {
        Trap::OutOfBounds { .. } => "Trap: OutOfBounds".to_string(),
        Trap::DivByZero => "Trap: DivByZero".to_string(),
        Trap::StackOverflow => "Trap: StackOverflow".to_string(),
        Trap::NullDeref => "Trap: NullDeref".to_string(),
        Trap::IntegerOverflow => "Trap: IntegerOverflow".to_string(),
        Trap::Unreachable => "Trap: Unreachable".to_string(),
        Trap::InstructionLimitExceeded => "Trap: InstructionLimitExceeded".to_string(),
    })?;

    Ok(run_res.exit_code as i64)
}

#[test]
fn test_aether_fibonacci() {
    let source = "
        int fib(int n) {
            if (n <= 1) {
                return n;
            }
            return fib(n - 1) + fib(n - 2);
        }
        int main() {
            return fib(10);
        }
    ";
    let exit_code = run_aether_program(source).unwrap();
    assert_eq!(exit_code, 55);
}

#[test]
fn test_aether_loop() {
    let source = "
        int main() {
            int sum = 0;
            int i = 1;
            while (i <= 10) {
                sum = sum + i;
                i = i + 1;
            }
            return sum;
        }
    ";
    let exit_code = run_aether_program(source).unwrap();
    assert_eq!(exit_code, 55);
}

#[test]
fn test_aether_array_bounds() {
    let source = "
        int main() {
            int a[3] = {10, 20, 30};
            // Accessing out of bounds (valid indices are 0, 1, 2)
            int val = a[3];
            return val;
        }
    ";
    let run_res = run_aether_program(source);
    assert!(run_res.is_err());
    let err_str = run_res.err().unwrap();
    assert!(
        err_str.contains("OutOfBounds"),
        "Expected OutOfBounds trap, got: {}",
        err_str
    );
}

#[test]
fn test_aether_diagnostics() {
    let source = "
        // Using an unsupported storage class or complex type layout
        // to check if lowering generates a proper diagnostic error.
        int main() {
            // va_list is unsupported in our lowering pass
            __builtin_va_list args;
            return 0;
        }
    ";
    let opt = Opt::default();
    let clean_source = format!("{}\n", source.trim());
    let res = check_semantics(&clean_source, opt).result;
    let decls = res.expect("C source semantics check failed for diagnostics test");
    let lower_res = lower_program(&decls);
    assert!(
        lower_res.is_err(),
        "Expected lowering to fail for unsupported type __builtin_va_list"
    );
    let err = lower_res.err().unwrap();
    assert!(!err.explanation.is_empty());
    assert!(
        err.node.contains("VaList") || err.explanation.contains("VaList"),
        "Got node: {}, explanation: {}",
        err.node,
        err.explanation
    );
}
