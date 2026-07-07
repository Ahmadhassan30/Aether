//! # Aether VM — Instruction Set Architecture
//!
//! This module defines the complete bytecode ISA for the Aether stack-based
//! virtual machine.  The VM is deliberately simple (stack machine, no register
//! file) so that the interpreter loop is easy to audit and the WASM binary
//! stays small.
//!
//! ## Design goals
//! - **Expressiveness**: every C operator and control-flow construct lowerable
//!   from HIR must have a corresponding opcode or sequence of opcodes.
//! - **Safety**: every potentially-trapping operation carries enough metadata
//!   for the interpreter to emit a precise [`Trap`](crate::program::Trap)
//!   without a separate bounds-check pass.
//! - **Portability**: the enum is `#[no_std]`-compatible and has no pointer
//!   types wider than `u64`, so the same ISA description compiles to
//!   `wasm32-unknown-unknown` without modification.
//!
//! ## Numeric convention
//! All arithmetic is defined in terms of **64-bit values** on the operand
//! stack.  Integer operations use `i64`/`u64` semantics (indicated by the
//! variant name suffix `I` / `U`).  Floating-point operations use IEEE-754
//! `f64` semantics (suffix `F`).  The interpreter is responsible for
//! reinterpreting the stack slot bits when switching domains.
//!
//! ## Calling convention
//! Arguments are pushed left-to-right by the caller before `Call`.  The
//! callee's `Enter` instruction records the arity so the interpreter can
//! set up a fresh locals frame.  The return value (if any) is left on top of
//! the caller's stack after `Return`.

/// The complete bytecode instruction set for the Aether VM.
///
/// Each variant encodes exactly the operands that the interpreter needs;
/// implicit operands (the operand stack, the locals frame, the call stack)
/// are managed by the interpreter loop in [`crate::interpreter`] (future
/// crate).
#[derive(Debug, Clone, PartialEq)]
pub enum Instr {
    // -----------------------------------------------------------------------
    // § 1  Stack Operations
    // -----------------------------------------------------------------------
    /// Push a 64-bit integer constant from the constant pool onto the stack.
    ///
    /// `pool_idx` indexes into [`Program::const_pool`](crate::program::Program::const_pool).
    PushConst { pool_idx: u32 },

    /// Duplicate the top-of-stack value.
    Dup,

    /// Pop (discard) the top-of-stack value.
    Pop,

    /// Swap the top two stack values.
    Swap,

    // -----------------------------------------------------------------------
    // § 2  Local Variable Load / Store
    // -----------------------------------------------------------------------
    /// Load a local variable onto the stack.
    ///
    /// `slot` is zero-based within the current activation frame.
    LoadLocal { slot: u32 },

    /// Pop the top-of-stack value and store it in a local variable slot.
    StoreLocal { slot: u32 },

    // -----------------------------------------------------------------------
    // § 3  Global Variable Load / Store
    // -----------------------------------------------------------------------
    /// Load a global variable (by index into the global table) onto the stack.
    LoadGlobal { global_idx: u32 },

    /// Pop the top-of-stack value and store it into a global variable slot.
    StoreGlobal { global_idx: u32 },

    // -----------------------------------------------------------------------
    // § 4  Arithmetic — Integer (signed)
    // -----------------------------------------------------------------------
    /// Signed 64-bit addition.  Traps on overflow when overflow-checks are on.
    AddI,

    /// Signed 64-bit subtraction.  Traps on overflow when overflow-checks are on.
    SubI,

    /// Signed 64-bit multiplication.  Traps on overflow when overflow-checks are on.
    MulI,

    /// Signed 64-bit division.  Always traps on divisor == 0 ([`Trap::DivByZero`]).
    /// Traps on `MIN / -1` ([`Trap::IntegerOverflow`]).
    DivI,

    /// Signed 64-bit remainder.  Traps on divisor == 0 ([`Trap::DivByZero`]).
    RemI,

    /// Unary negation (two's complement).  Traps on `NEG(MIN)` when
    /// overflow-checks are on.
    NegI,

    // -----------------------------------------------------------------------
    // § 5  Arithmetic — Unsigned
    // -----------------------------------------------------------------------
    /// Unsigned 64-bit addition.
    AddU,

    /// Unsigned 64-bit subtraction.
    SubU,

    /// Unsigned 64-bit multiplication.
    MulU,

    /// Unsigned 64-bit division.  Traps on divisor == 0 ([`Trap::DivByZero`]).
    DivU,

    /// Unsigned 64-bit remainder.  Traps on divisor == 0 ([`Trap::DivByZero`]).
    RemU,

    // -----------------------------------------------------------------------
    // § 6  Arithmetic — Floating-point (IEEE-754 f64)
    // -----------------------------------------------------------------------
    /// IEEE-754 double-precision addition.
    AddF,

    /// IEEE-754 double-precision subtraction.
    SubF,

    /// IEEE-754 double-precision multiplication.
    MulF,

    /// IEEE-754 double-precision division.  Never traps (produces ±∞ / NaN).
    DivF,

    /// IEEE-754 double-precision negation.
    NegF,

    // -----------------------------------------------------------------------
    // § 7  Bitwise & Shift
    // -----------------------------------------------------------------------
    /// Bitwise AND.
    BitAnd,

    /// Bitwise OR.
    BitOr,

    /// Bitwise XOR.
    BitXor,

    /// Bitwise NOT (complement all 64 bits).
    BitNot,

    /// Logical shift left.  Shift amount is taken from TOS (mod 64).
    Shl,

    /// Arithmetic (signed) shift right.  Shift amount is taken from TOS (mod 64).
    ShrI,

    /// Logical (unsigned) shift right.  Shift amount is taken from TOS (mod 64).
    ShrU,

    // -----------------------------------------------------------------------
    // § 8  Comparisons
    // -----------------------------------------------------------------------
    //
    // All comparison instructions pop two values and push a boolean result
    // encoded as `1i64` (true) or `0i64` (false).
    /// Signed integer equal.
    EqI,

    /// Signed integer not-equal.
    NeI,

    /// Signed integer less-than.
    LtI,

    /// Signed integer less-than-or-equal.
    LeI,

    /// Signed integer greater-than.
    GtI,

    /// Signed integer greater-than-or-equal.
    GeI,

    /// Unsigned integer less-than.
    LtU,

    /// Unsigned integer less-than-or-equal.
    LeU,

    /// Unsigned integer greater-than.
    GtU,

    /// Unsigned integer greater-than-or-equal.
    GeU,

    /// IEEE-754 double equal (NaN-sensitive: NaN == NaN is false).
    EqF,

    /// IEEE-754 double not-equal.
    NeF,

    /// IEEE-754 double less-than.
    LtF,

    /// IEEE-754 double less-than-or-equal.
    LeF,

    /// IEEE-754 double greater-than.
    GtF,

    /// IEEE-754 double greater-than-or-equal.
    GeF,

    // -----------------------------------------------------------------------
    // § 9  Logical (boolean short-circuit NOT possible at this level)
    // -----------------------------------------------------------------------
    /// Logical NOT: `0 → 1`, non-zero → `0`.
    LogNot,

    /// Logical AND (non-short-circuit; both operands are already evaluated).
    LogAnd,

    /// Logical OR (non-short-circuit).
    LogOr,

    // -----------------------------------------------------------------------
    // § 10  Type Conversions
    // -----------------------------------------------------------------------
    /// Reinterpret the top 64-bit stack slot as a signed integer (no-op at
    /// runtime; used by the type checker / verifier pass).
    ToI64,

    /// Reinterpret the top 64-bit stack slot as an unsigned integer.
    ToU64,

    /// Convert a signed integer (i64) on TOS to IEEE-754 f64.
    I64ToF64,

    /// Convert an unsigned integer (u64) on TOS to IEEE-754 f64.
    U64ToF64,

    /// Truncate IEEE-754 f64 on TOS to i64.  Traps on out-of-range values.
    F64ToI64,

    /// Truncate IEEE-754 f64 on TOS to u64.  Traps on out-of-range values.
    F64ToU64,

    /// Zero-extend / sign-extend a narrower integer (encoded width in bits).
    ///
    /// `bits` must be one of 8, 16, 32.
    SignExtend { bits: u8 },

    /// Zero-extend a narrower unsigned integer (encoded width in bits).
    ///
    /// `bits` must be one of 8, 16, 32.
    ZeroExtend { bits: u8 },

    // -----------------------------------------------------------------------
    // § 11  Control Flow — Unconditional
    // -----------------------------------------------------------------------
    /// Unconditional jump to instruction at `target` (absolute byte-code index).
    Jump { target: u32 },

    // -----------------------------------------------------------------------
    // § 12  Control Flow — Conditional
    // -----------------------------------------------------------------------
    /// Pop TOS; jump to `target` if TOS == 0 (false).
    JumpIfFalse { target: u32 },

    /// Pop TOS; jump to `target` if TOS != 0 (true).
    JumpIfTrue { target: u32 },

    // -----------------------------------------------------------------------
    // § 13  Control Flow — Structured (for optimizer / verifier use)
    // -----------------------------------------------------------------------
    /// Open a new lexical block scope (hint for verifier; no runtime effect).
    BlockEnter,

    /// Close a lexical block scope.
    BlockExit,

    // -----------------------------------------------------------------------
    // § 14  Functions — Call / Return
    // -----------------------------------------------------------------------
    /// Call a function by index in the function table.
    ///
    /// `func_idx` indexes into [`Program::func_table`](crate::program::Program::func_table).
    /// `arg_count` is the number of arguments already pushed by the caller.
    /// The callee's `Enter` instruction will validate that
    /// `arg_count == func.arity`.
    Call { func_idx: u32, arg_count: u32 },

    /// Indirect (function-pointer) call.
    ///
    /// Pops a `func_idx` from TOS, then calls that function index with
    /// `arg_count` previously-pushed arguments.
    CallIndirect { arg_count: u32 },

    /// Function prologue: reserves `local_count` stack slots for locals and
    /// records `arity` for caller-side validation.
    ///
    /// Must be the first instruction of every function body.
    Enter { arity: u32, local_count: u32 },

    /// Return from a function.
    ///
    /// `has_value` indicates whether the function leaves a return value on the
    /// stack (for void functions, `has_value = false`).
    Return { has_value: bool },

    // -----------------------------------------------------------------------
    // § 15  Memory / Array — with Bounds-Check Metadata
    // -----------------------------------------------------------------------
    /// Load `width` bytes from the array/heap at `[base_slot + index_on_stack]`.
    ///
    /// - `base_slot`: local slot holding the base pointer / array reference.
    /// - `elem_width`: element size in bytes (1, 2, 4, or 8).
    /// - `array_len_slot`: local slot holding the array length (number of
    ///   elements); the interpreter uses this to emit a precise
    ///   [`Trap::OutOfBounds`] instead of a segfault.
    ArrayLoad {
        base_slot: u32,
        elem_width: u8,
        array_len_slot: u32,
    },

    /// Store `width` bytes to the array/heap at `[base_slot + index_on_stack]`.
    ///
    /// Stack layout before this instruction (top-to-bottom): `value`, `index`.
    /// Same bounds-check metadata as [`Instr::ArrayLoad`].
    ArrayStore {
        base_slot: u32,
        elem_width: u8,
        array_len_slot: u32,
    },

    /// Dereference a pointer (local slot `ptr_slot`).
    ///
    /// Traps with [`Trap::NullDeref`] if the pointer value is zero.
    /// `elem_width` is the size in bytes of the pointed-to element.
    PtrLoad { ptr_slot: u32, elem_width: u8 },

    /// Store through a pointer (local slot `ptr_slot`).
    ///
    /// Traps with [`Trap::NullDeref`] if the pointer value is zero.
    PtrStore { ptr_slot: u32, elem_width: u8 },

    // -----------------------------------------------------------------------
    // § 16  I/O Opcodes (host-provided, resolved at VM init time)
    // -----------------------------------------------------------------------
    /// Write a signed integer (i64) from TOS to stdout.
    PrintI,

    /// Write an unsigned integer (u64) from TOS to stdout.
    PrintU,

    /// Write an IEEE-754 f64 from TOS to stdout.
    PrintF,

    /// Write a single ASCII character (low byte of TOS) to stdout.
    PrintChar,

    /// Write a null-terminated UTF-8 string whose base address lives in a
    /// local slot to stdout.
    PrintStr { str_slot: u32 },

    /// Read a signed integer from stdin and push it onto the stack.
    ReadI,

    /// Read an IEEE-754 f64 from stdin and push it onto the stack.
    ReadF,

    // -----------------------------------------------------------------------
    // § 17  VM Control
    // -----------------------------------------------------------------------
    /// Terminate execution normally with a 64-bit exit code from TOS.
    Halt,

    /// Raise a specific trap unconditionally (used to lower `__builtin_trap`
    /// or unreachable code after semantic analysis).
    Trap(crate::program::Trap),
}
