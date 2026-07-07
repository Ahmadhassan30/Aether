//! # aether-vm
//!
//! Bytecode ISA, `Program` representation, and `Trap` definitions for the
//! Aether stack-based virtual machine.
//!
//! This crate is intentionally scope-limited to the *data model* only:
//!
//! | Module | Contents |
//! |--------|----------|
//! | [`isa`] | `Instr` enum — every opcode the VM can execute |
//! | [`program`] | `Program`, `ConstEntry`, `FuncEntry`, `GlobalEntry`, `Trap` |
//!
//! The interpreter loop and the HIR → bytecode lowering pass live in
//! separate crates (`aether-interp`, `aether-lower`) that depend on this one.
//! Keeping the data model in its own crate lets the WASM front-end, the
//! native test harness, and the future language server all share the exact
//! same type definitions without pulling in interpreter machinery.
//!
//! ## `#![no_std]` note
//! The crate currently requires `std` only through `String` and `Vec` inside
//! `Program` and `FuncEntry`.  A future `alloc`-only feature flag can be added
//! to support `no_std` + allocator environments (e.g. a custom WASM runtime)
//! without changing any public APIs.

pub mod isa;
pub mod program;

// Re-export the two most commonly used top-level types for ergonomics.
pub use isa::Instr;
pub use program::{ConstEntry, FuncEntry, GlobalEntry, Program, Trap};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Construct the bytecode for the constant expression `2 + 3 * 4` and
    /// validate that:
    ///
    /// 1. The `Program` structural validator accepts the program.
    /// 2. The constant pool round-trips integer values correctly.
    /// 3. The instruction sequence expresses the correct evaluation order
    ///    for a stack machine (multiplication has higher precedence, so
    ///    `3 * 4` must be computed before adding `2`).
    ///
    /// This test does **not** run the interpreter (which lives in a separate
    /// crate).  It validates ISA expressiveness and `Program` structural
    /// correctness.
    ///
    /// Expected evaluation trace on a stack machine:
    /// ```text
    /// PushConst(2)  → stack: [2]
    /// PushConst(3)  → stack: [2, 3]
    /// PushConst(4)  → stack: [2, 3, 4]
    /// MulI          → stack: [2, 12]
    /// AddI          → stack: [14]
    /// Return        → returns 14 to caller
    /// ```
    #[test]
    fn expr_2_plus_3_times_4() {
        let mut prog = Program::new();

        // --- Constant pool entries ---
        let idx_2 = prog.push_const(ConstEntry::from_i64(2));
        let idx_3 = prog.push_const(ConstEntry::from_i64(3));
        let idx_4 = prog.push_const(ConstEntry::from_i64(4));

        // Verify pool round-trips.
        assert_eq!(prog.const_pool[idx_2 as usize].as_i64(), 2);
        assert_eq!(prog.const_pool[idx_3 as usize].as_i64(), 3);
        assert_eq!(prog.const_pool[idx_4 as usize].as_i64(), 4);

        // --- Function metadata ---
        // Record the code offset *before* emitting instructions so the
        // FuncEntry's code_offset points at the Enter instruction.
        let code_start = prog.instructions.len() as u32;
        let func_idx = prog.register_func(FuncEntry {
            name: "expr_main".to_string(),
            arity: 0,
            local_count: 0,
            code_offset: code_start,
        });

        // --- Instruction stream ---
        // Enter: no params, no locals.
        prog.emit(Instr::Enter {
            arity: 0,
            local_count: 0,
        });

        // Push 2
        prog.emit(Instr::PushConst { pool_idx: idx_2 });

        // Push 3
        prog.emit(Instr::PushConst { pool_idx: idx_3 });

        // Push 4
        prog.emit(Instr::PushConst { pool_idx: idx_4 });

        // 3 * 4 → 12
        prog.emit(Instr::MulI);

        // 2 + 12 → 14
        prog.emit(Instr::AddI);

        // Return the result (has_value = true).
        prog.emit(Instr::Return { has_value: true });

        // --- Structural assertions ---

        // Correct number of instructions: Enter + 3×PushConst + MulI + AddI + Return = 7.
        assert_eq!(prog.instructions.len(), 7);

        // func_idx must be 0 (first and only function registered).
        assert_eq!(func_idx, 0);

        // func_table entry is coherent.
        assert_eq!(prog.func_table[0].name, "expr_main");
        assert_eq!(prog.func_table[0].arity, 0);
        assert_eq!(prog.func_table[0].code_offset, 0);

        // Spot-check instruction identities.
        assert_eq!(
            prog.instructions[0],
            Instr::Enter {
                arity: 0,
                local_count: 0
            }
        );
        assert_eq!(
            prog.instructions[1],
            Instr::PushConst { pool_idx: idx_2 }
        );
        assert_eq!(prog.instructions[4], Instr::MulI);
        assert_eq!(prog.instructions[5], Instr::AddI);
        assert_eq!(
            prog.instructions[6],
            Instr::Return { has_value: true }
        );

        // --- Program validation ---
        prog.validate()
            .expect("structural validation must pass for a well-formed program");
    }

    /// Verify that `Program::validate()` correctly rejects a program with an
    /// out-of-range constant pool reference.
    #[test]
    fn validate_catches_invalid_pool_idx() {
        let mut prog = Program::new();
        // Emit a PushConst that references pool index 99, but the pool is empty.
        prog.emit(Instr::PushConst { pool_idx: 99 });

        let result = prog.validate();
        assert!(
            result.is_err(),
            "validate() must reject an out-of-range pool_idx"
        );
        let errors = result.unwrap_err();
        assert_eq!(errors.len(), 1);
        assert!(
            errors[0].contains("pool_idx=99"),
            "error message must mention the bad index"
        );
    }

    /// Verify that `Program::validate()` correctly rejects a program with an
    /// out-of-range jump target.
    #[test]
    fn validate_catches_invalid_jump_target() {
        let mut prog = Program::new();
        prog.emit(Instr::Jump { target: 999 });

        let result = prog.validate();
        assert!(result.is_err(), "validate() must reject an out-of-range jump target");
        let errors = result.unwrap_err();
        assert!(errors[0].contains("target=999"));
    }

    /// Verify that `Trap` variants display correct human-readable messages.
    #[test]
    fn trap_display() {
        assert_eq!(Trap::DivByZero.to_string(), "trap: division by zero");
        assert_eq!(
            Trap::OutOfBounds {
                index: 5,
                length: 3
            }
            .to_string(),
            "trap: array index out of bounds (index=5, length=3)"
        );
        assert_eq!(Trap::StackOverflow.to_string(), "trap: call stack overflow");
        assert_eq!(Trap::NullDeref.to_string(), "trap: null pointer dereference");
        assert_eq!(Trap::IntegerOverflow.to_string(), "trap: integer overflow");
        assert_eq!(
            Trap::Unreachable.to_string(),
            "trap: unreachable instruction executed"
        );
    }

    /// Verify `ConstEntry` conversion helpers round-trip correctly.
    #[test]
    fn const_entry_round_trips() {
        let e_i = ConstEntry::from_i64(-42);
        assert_eq!(e_i.as_i64(), -42);

        let e_f = ConstEntry::from_f64(3.14);
        // Use approximate equality for floats.
        assert!((e_f.as_f64() - 3.14).abs() < f64::EPSILON);

        let e_u = ConstEntry::from_u64(u64::MAX);
        assert_eq!(e_u.bits, u64::MAX);
    }
}
