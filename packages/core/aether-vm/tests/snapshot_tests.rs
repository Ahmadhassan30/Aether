use aether_parser::{check_semantics, Opt};
use aether_vm::interp::Vm;
use aether_vm::lower::lower_program;
use aether_vm::program::Trap;

#[test]
fn test_step_rewind_round_trip() {
    let source = "
        int main() {
            int a = 10;
            int b = 20;
            int c = a + b;
            return c;
        }
    ";
    let opt = Opt::default();
    let clean_source = format!("{}\n", source.trim());
    let res = check_semantics(&clean_source, opt).result.unwrap();
    let program = lower_program(&res).unwrap();

    let mut vm = Vm::new(program).unwrap();

    // Check starting state
    let initial_snapshot = vm.take_snapshot();
    assert_eq!(initial_snapshot.pc, 0);
    assert!(initial_snapshot.operand_stack.is_empty());
    assert_eq!(initial_snapshot.call_stack.len(), 1);
    assert_eq!(initial_snapshot.call_stack[0].func_name, "main");

    // Step 3 times
    let snap1 = vm.step().unwrap();
    let snap2 = vm.step().unwrap();
    let snap3 = vm.step().unwrap();

    assert_eq!(snap1.pc, 1);
    assert_eq!(snap2.pc, 2);
    assert_eq!(snap3.pc, 3);

    // Rewind 3 times back
    let rewind_snap = vm.rewind(3).unwrap();
    assert_eq!(rewind_snap.pc, 0);
    assert_eq!(vm.take_snapshot().pc, 0);

    // Let's assert restored state is identical to initial_snapshot
    let current_snapshot = vm.take_snapshot();
    assert_eq!(current_snapshot.pc, initial_snapshot.pc);
    assert_eq!(
        current_snapshot.operand_stack,
        initial_snapshot.operand_stack
    );
    assert_eq!(current_snapshot.call_stack, initial_snapshot.call_stack);

    // Interleaved step/rewind to test history integrity
    let snap_step1 = vm.step().unwrap();
    assert_eq!(snap_step1.pc, 1);
    let snap_rewind1 = vm.rewind(1).unwrap();
    assert_eq!(snap_rewind1.pc, 0);

    let snap_step2 = vm.step().unwrap();
    assert_eq!(snap_step2.pc, 1);
    let snap_rewind2 = vm.rewind(1).unwrap();
    assert_eq!(snap_rewind2.pc, 0);

    // Run to completion and assert we get the correct result
    let execution_res = vm.run_to_completion().unwrap();
    assert_eq!(execution_res.exit_code, 30);
}

#[test]
fn test_run_to_cursor_and_bounds() {
    let source = "
        int main() {
            int sum = 0;
            for (int i = 0; i < 5; i = i + 1) {
                sum = sum + i;
            }
            return sum;
        }
    ";
    let opt = Opt::default();
    let clean_source = format!("{}\n", source.trim());
    let res = check_semantics(&clean_source, opt).result.unwrap();
    let program = lower_program(&res).unwrap();

    let mut vm = Vm::new(program).unwrap();

    // Verify target PC out of bounds returns Err(Trap::Unreachable)
    let bad_cursor = vm.run_to_cursor(9999);
    assert!(bad_cursor.is_err());
    assert_eq!(bad_cursor.err().unwrap(), Trap::Unreachable);

    // Run to PC offset 10 (inside loop body)
    let cursor_snap = vm.run_to_cursor(10).unwrap();
    assert_eq!(cursor_snap.pc, 10);
    assert_eq!(vm.take_snapshot().pc, 10);

    // Complete program execution
    let execution_res = vm.run_to_completion().unwrap();
    assert_eq!(execution_res.exit_code, 10); // sum = 0 + 1 + 2 + 3 + 4 = 10
}
