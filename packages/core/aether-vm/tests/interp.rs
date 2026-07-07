use aether_vm::interp::{MockStdin, Vm, VmStdout};
use aether_vm::isa::Instr;
use aether_vm::program::{ConstEntry, FuncEntry, GlobalEntry, Program, Trap};

// --- Test Stdout Capture ---
struct TestStdout {
    buffer: String,
}

impl TestStdout {
    fn new() -> Self {
        Self {
            buffer: String::new(),
        }
    }
}

impl VmStdout for TestStdout {
    fn write_str(&mut self, s: &str) {
        self.buffer.push_str(s);
    }
}

#[test]
fn test_basic_arithmetic() {
    let mut prog = Program::new();

    // Constant pool
    let idx_10 = prog.push_const(ConstEntry::from_i64(10));
    let idx_3 = prog.push_const(ConstEntry::from_i64(3));

    // Func table
    prog.register_func(FuncEntry {
        name: "main".to_string(),
        arity: 0,
        local_count: 0,
        code_offset: 0,
    });

    // Instructions: (10 - 3) * 3 = 21
    prog.emit(Instr::Enter {
        arity: 0,
        local_count: 0,
    });
    prog.emit(Instr::PushConst { pool_idx: idx_10 });
    prog.emit(Instr::PushConst { pool_idx: idx_3 });
    prog.emit(Instr::SubI);
    prog.emit(Instr::PushConst { pool_idx: idx_3 });
    prog.emit(Instr::MulI);
    prog.emit(Instr::Return { has_value: true });

    let mut vm = Vm::new(prog).expect("Program must validate");
    let res = vm
        .run_to_completion()
        .expect("VM must execute without traps");

    assert_eq!(res.exit_code, 21);
}

#[test]
fn test_float_arithmetic() {
    let mut prog = Program::new();

    // Constants
    let idx_pi = prog.push_const(ConstEntry::from_f64(3.14));
    let idx_2 = prog.push_const(ConstEntry::from_f64(2.0));

    prog.register_func(FuncEntry {
        name: "main".to_string(),
        arity: 0,
        local_count: 0,
        code_offset: 0,
    });

    // pi * 2.0
    prog.emit(Instr::Enter {
        arity: 0,
        local_count: 0,
    });
    prog.emit(Instr::PushConst { pool_idx: idx_pi });
    prog.emit(Instr::PushConst { pool_idx: idx_2 });
    prog.emit(Instr::MulF);
    // Convert to i64 for exit code
    prog.emit(Instr::F64ToI64);
    prog.emit(Instr::Return { has_value: true });

    let mut vm = Vm::new(prog).expect("Program must validate");
    let res = vm.run_to_completion().expect("VM must execute");

    // 3.14 * 2.0 = 6.28. Truncated to i64 is 6.
    assert_eq!(res.exit_code, 6);
}

#[test]
fn test_recursive_factorial() {
    let mut prog = Program::new();

    // Constant pool
    let idx_1 = prog.push_const(ConstEntry::from_i64(1));
    let idx_5 = prog.push_const(ConstEntry::from_i64(5));

    // Functions
    // Index 0: main() -> Int
    prog.register_func(FuncEntry {
        name: "main".to_string(),
        arity: 0,
        local_count: 0,
        code_offset: 0,
    });

    // Index 1: fact(n: Int) -> Int
    prog.register_func(FuncEntry {
        name: "fact".to_string(),
        arity: 1,
        local_count: 1,
        code_offset: 4,
    });

    // main instructions
    prog.emit(Instr::Enter {
        arity: 0,
        local_count: 0,
    }); // pc = 0
    prog.emit(Instr::PushConst { pool_idx: idx_5 }); // pc = 1 (push 5)
    prog.emit(Instr::Call {
        func_idx: 1,
        arg_count: 1,
    }); // pc = 2 (call fact(5))
    prog.emit(Instr::Return { has_value: true }); // pc = 3

    // fact instructions
    prog.emit(Instr::Enter {
        arity: 1,
        local_count: 1,
    }); // pc = 4
    prog.emit(Instr::LoadLocal { slot: 0 }); // pc = 5 (load n)
    prog.emit(Instr::PushConst { pool_idx: idx_1 }); // pc = 6 (push 1)
    prog.emit(Instr::LeI); // pc = 7 (n <= 1)
    prog.emit(Instr::JumpIfFalse { target: 11 }); // pc = 8 (if not, jump to 11)
    prog.emit(Instr::PushConst { pool_idx: idx_1 }); // pc = 9 (return 1)
    prog.emit(Instr::Return { has_value: true }); // pc = 10
                                                  // recurse
    prog.emit(Instr::LoadLocal { slot: 0 }); // pc = 11 (load n)
    prog.emit(Instr::LoadLocal { slot: 0 }); // pc = 12 (load n)
    prog.emit(Instr::PushConst { pool_idx: idx_1 }); // pc = 13 (push 1)
    prog.emit(Instr::SubI); // pc = 14 (n - 1)
    prog.emit(Instr::Call {
        func_idx: 1,
        arg_count: 1,
    }); // pc = 15 (call fact(n-1))
    prog.emit(Instr::MulI); // pc = 16 (n * fact(n-1))
    prog.emit(Instr::Return { has_value: true }); // pc = 17

    let mut vm = Vm::new(prog).expect("Program must validate");
    let res = vm
        .run_to_completion()
        .expect("VM must execute successfully");

    // 5! = 120
    assert_eq!(res.exit_code, 120);
}

#[test]
fn test_division_by_zero_trap() {
    let mut prog = Program::new();

    let idx_10 = prog.push_const(ConstEntry::from_i64(10));
    let idx_0 = prog.push_const(ConstEntry::from_i64(0));

    prog.register_func(FuncEntry {
        name: "main".to_string(),
        arity: 0,
        local_count: 0,
        code_offset: 0,
    });

    prog.emit(Instr::Enter {
        arity: 0,
        local_count: 0,
    });
    prog.emit(Instr::PushConst { pool_idx: idx_10 });
    prog.emit(Instr::PushConst { pool_idx: idx_0 });
    prog.emit(Instr::DivI);
    prog.emit(Instr::Return { has_value: true });

    let mut vm = Vm::new(prog).expect("Program must validate");
    let res = vm.run_to_completion();

    assert_eq!(res, Err(Trap::DivByZero));
}

#[test]
fn test_array_out_of_bounds_trap() {
    let mut prog = Program::new();

    // Constants
    let idx_10 = prog.push_const(ConstEntry::from_i64(10)); // out-of-bounds index

    prog.register_func(FuncEntry {
        name: "main".to_string(),
        arity: 0,
        local_count: 3, // slot 0: base ptr, slot 1: length, slot 2: index
        code_offset: 0,
    });

    prog.emit(Instr::Enter {
        arity: 0,
        local_count: 3,
    });
    // Initialize slot 0: base ptr = 0x10000 (heap start)
    // Initialize slot 1: array length = 5
    // Initialize slot 2: index = 10 (loaded via PushConst)
    // Set base ptr
    let idx_heap = prog.push_const(ConstEntry::from_i64(0x10000));
    prog.emit(Instr::PushConst { pool_idx: idx_heap });
    prog.emit(Instr::StoreLocal { slot: 0 });

    // Set array length = 5
    let idx_len = prog.push_const(ConstEntry::from_i64(5));
    prog.emit(Instr::PushConst { pool_idx: idx_len });
    prog.emit(Instr::StoreLocal { slot: 1 });

    // Try ArrayLoad with out-of-bounds index 10
    prog.emit(Instr::PushConst { pool_idx: idx_10 });
    prog.emit(Instr::ArrayLoad {
        base_slot: 0,
        elem_width: 4,
        array_len_slot: 1,
    });
    prog.emit(Instr::Return { has_value: true });

    let mut vm = Vm::new(prog).expect("Program must validate");
    let res = vm.run_to_completion();

    assert_eq!(
        res,
        Err(Trap::OutOfBounds {
            index: 10,
            length: 5
        })
    );
}

#[test]
fn test_pointer_null_deref_trap() {
    let mut prog = Program::new();

    prog.register_func(FuncEntry {
        name: "main".to_string(),
        arity: 0,
        local_count: 1, // slot 0: pointer (defaults to 0 / null)
        code_offset: 0,
    });

    prog.emit(Instr::Enter {
        arity: 0,
        local_count: 1,
    });
    prog.emit(Instr::PtrLoad {
        ptr_slot: 0,
        elem_width: 4,
    });
    prog.emit(Instr::Return { has_value: false });

    let mut vm = Vm::new(prog).expect("Program must validate");
    let res = vm.run_to_completion();

    assert_eq!(res, Err(Trap::NullDeref));
}

#[test]
fn test_instruction_limit_trap() {
    let mut prog = Program::new();

    prog.register_func(FuncEntry {
        name: "main".to_string(),
        arity: 0,
        local_count: 0,
        code_offset: 0,
    });

    prog.emit(Instr::Enter {
        arity: 0,
        local_count: 0,
    });
    prog.emit(Instr::Jump { target: 1 }); // Infinite loop back to Jump

    let mut vm = Vm::new(prog)
        .expect("Program must validate")
        .with_max_instructions(100);

    let res = vm.run_to_completion();

    assert_eq!(res, Err(Trap::InstructionLimitExceeded));
}

#[test]
fn test_print_and_globals() {
    let mut prog = Program::new();

    // Globals
    prog.register_global(GlobalEntry {
        name: "my_global".to_string(),
        init: Some(42),
    });

    // Constants
    let idx_newline = prog.push_const(ConstEntry::from_i64('\n' as i64));

    prog.register_func(FuncEntry {
        name: "main".to_string(),
        arity: 0,
        local_count: 0,
        code_offset: 0,
    });

    prog.emit(Instr::Enter {
        arity: 0,
        local_count: 0,
    });
    prog.emit(Instr::LoadGlobal { global_idx: 0 });
    prog.emit(Instr::PrintI);
    prog.emit(Instr::PushConst {
        pool_idx: idx_newline,
    });
    prog.emit(Instr::PrintChar);
    prog.emit(Instr::Return { has_value: false });

    let stdout = TestStdout::new();
    let mut vm = Vm::new(prog)
        .expect("Program must validate")
        .with_io(Box::new(stdout), Box::new(MockStdin::new(Vec::new())));

    let res = vm
        .run_to_completion()
        .expect("VM must execute successfully");

    // The captured stdout should be "42\n"
    assert_eq!(res.stdout, "42\n");
}
