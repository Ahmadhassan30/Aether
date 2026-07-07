//! # Aether VM — Program representation and Runtime Traps
//!
//! This module defines the top-level data structures that the bytecode lowering
//! pass (future `aether-lower` crate) produces and the interpreter
//! (future `aether-interp` crate) consumes.
//!
//! ## Constant pool encoding
//! All immediate values — integers, floats, and string literals — are stored
//! in the constant pool as raw 64-bit words.  Floats are stored as their
//! IEEE-754 bit pattern (i.e. `f64::to_bits()`).  String literals are stored
//! as an index into a separate string table that carries the actual UTF-8
//! bytes; the pool slot holds the string-table index.
//!
//! ## Function table
//! Each entry records the byte-code offset of the function's `Enter`
//! instruction, plus human-readable metadata used by the disassembler and
//! debugger.  The index into this table is what `Instr::Call` encodes.

use crate::isa::Instr;

// ---------------------------------------------------------------------------
// Constant pool
// ---------------------------------------------------------------------------

/// A single entry in the constant pool.
///
/// The interpreter decides how to interpret the `bits` field based on the
/// surrounding instructions (e.g. `PushConst` followed by `I64ToF64`).
#[derive(Debug, Clone, PartialEq)]
pub struct ConstEntry {
    /// Raw 64-bit storage for any immediate value.
    ///
    /// - **Integer** (i64/u64): stored as its two's-complement bit pattern.
    /// - **Float** (f64): stored as `f64::to_bits(value)`.
    /// - **String reference**: stores a `u32` index into
    ///   [`Program::string_table`]; the upper 32 bits are zero.
    pub bits: u64,
}

impl ConstEntry {
    /// Convenience constructor for a signed-integer constant.
    #[inline]
    pub fn from_i64(v: i64) -> Self {
        Self { bits: v as u64 }
    }

    /// Convenience constructor for an unsigned-integer constant.
    #[inline]
    pub fn from_u64(v: u64) -> Self {
        Self { bits: v }
    }

    /// Convenience constructor for an IEEE-754 double constant.
    #[inline]
    pub fn from_f64(v: f64) -> Self {
        Self { bits: v.to_bits() }
    }

    /// Re-interpret the stored bits as a signed i64.
    #[inline]
    pub fn as_i64(&self) -> i64 {
        self.bits as i64
    }

    /// Re-interpret the stored bits as an f64.
    #[inline]
    pub fn as_f64(&self) -> f64 {
        f64::from_bits(self.bits)
    }
}

// ---------------------------------------------------------------------------
// Function table entry
// ---------------------------------------------------------------------------

/// Metadata for a single function in the bytecode program.
#[derive(Debug, Clone, PartialEq)]
pub struct FuncEntry {
    /// Human-readable name (from the source `FunctionDeclaration`).
    pub name: String,

    /// Number of parameters this function expects.
    pub arity: u32,

    /// Number of local variable slots (parameters + stack-allocated locals).
    pub local_count: u32,

    /// Byte-code index of the first instruction of this function body
    /// (always an [`Instr::Enter`]).
    pub code_offset: u32,
}

// ---------------------------------------------------------------------------
// Global variable table entry
// ---------------------------------------------------------------------------

/// Metadata for a single global variable slot.
#[derive(Debug, Clone, PartialEq)]
pub struct GlobalEntry {
    /// Source-level name of the global.
    pub name: String,

    /// Initial value (as a pool-encoded 64-bit word).  `None` means the
    /// global is zero-initialised.
    pub init: Option<u64>,
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

/// A complete, self-contained Aether VM bytecode program.
///
/// The lowering pass produces exactly one `Program` per translation unit.
/// The interpreter's entry point is always `func_table[0]` (the `main`
/// function or the top-level expression in REPL mode).
///
/// # Memory layout (logical)
///
/// ```text
/// ┌─────────────────────────────┐
/// │  instructions  []Instr      │  flat list; jumps use absolute indices
/// ├─────────────────────────────┤
/// │  const_pool    []ConstEntry │  indexed by PushConst::pool_idx
/// ├─────────────────────────────┤
/// │  string_table  []String     │  UTF-8 literals; indexed from const_pool
/// ├─────────────────────────────┤
/// │  func_table    []FuncEntry  │  indexed by Call::func_idx
/// ├─────────────────────────────┤
/// │  globals       []GlobalEntry│  indexed by LoadGlobal / StoreGlobal
/// └─────────────────────────────┘
/// ```
#[derive(Debug, Clone, PartialEq)]
pub struct Program {
    /// Flat list of all instructions in this translation unit.
    ///
    /// Functions are laid out contiguously; each begins with `Instr::Enter`.
    /// Control flow uses absolute indices into this vector.
    pub instructions: Vec<Instr>,

    /// Constant pool — all immediate numeric and string-reference values.
    pub const_pool: Vec<ConstEntry>,

    /// String literal table.  Indices into this vector are stored in the
    /// constant pool (see [`ConstEntry`]).
    pub string_table: Vec<String>,

    /// Function table — one entry per function defined in this program.
    pub func_table: Vec<FuncEntry>,

    /// Global variable table.
    pub globals: Vec<GlobalEntry>,
}

impl Program {
    /// Construct an empty program.  The caller must populate all fields before
    /// handing the `Program` to the interpreter.
    pub fn new() -> Self {
        Self {
            instructions: Vec::new(),
            const_pool: Vec::new(),
            string_table: Vec::new(),
            func_table: Vec::new(),
            globals: Vec::new(),
        }
    }

    /// Add a constant to the pool and return its index.
    pub fn push_const(&mut self, entry: ConstEntry) -> u32 {
        let idx = self.const_pool.len() as u32;
        self.const_pool.push(entry);
        idx
    }

    /// Add an instruction and return its index (useful for back-patching jumps).
    pub fn emit(&mut self, instr: Instr) -> u32 {
        let idx = self.instructions.len() as u32;
        self.instructions.push(instr);
        idx
    }

    /// Register a function and return its `func_idx`.
    ///
    /// `code_offset` should be the index of the `Enter` instruction that will
    /// be emitted immediately after calling this method.
    pub fn register_func(&mut self, entry: FuncEntry) -> u32 {
        let idx = self.func_table.len() as u32;
        self.func_table.push(entry);
        idx
    }

    /// Register a global variable and return its `global_idx`.
    pub fn register_global(&mut self, entry: GlobalEntry) -> u32 {
        let idx = self.globals.len() as u32;
        self.globals.push(entry);
        idx
    }

    /// Validate structural invariants:
    ///
    /// 1. Every `PushConst` references a valid pool index.
    /// 2. Every `Jump*` target is within `instructions` bounds.
    /// 3. Every `Call` references a valid function index.
    /// 4. Every `LoadGlobal` / `StoreGlobal` references a valid global index.
    /// 5. Every `LoadLocal` / `StoreLocal` slot is within the enclosing
    ///    function's `local_count` (requires a linear scan with function
    ///    context tracking).
    ///
    /// Returns `Ok(())` on success or a list of human-readable error strings.
    pub fn validate(&self) -> Result<(), Vec<String>> {
        let mut errors: Vec<String> = Vec::new();
        let code_len = self.instructions.len() as u32;
        let pool_len = self.const_pool.len() as u32;
        let func_len = self.func_table.len() as u32;
        let glob_len = self.globals.len() as u32;

        // Track the local_count of the most-recently-seen Enter, so we can
        // validate LoadLocal / StoreLocal slot indices.
        let mut current_local_count: u32 = 0;

        for (pc, instr) in self.instructions.iter().enumerate() {
            let pc = pc as u32;
            match instr {
                Instr::PushConst { pool_idx } => {
                    if *pool_idx >= pool_len {
                        errors.push(format!(
                            "pc={pc}: PushConst pool_idx={pool_idx} out of range (pool has {pool_len} entries)"
                        ));
                    }
                }
                Instr::Jump { target }
                | Instr::JumpIfFalse { target }
                | Instr::JumpIfTrue { target } => {
                    if *target >= code_len {
                        errors.push(format!(
                            "pc={pc}: jump target={target} out of range (code has {code_len} instructions)"
                        ));
                    }
                }
                Instr::Call { func_idx, .. } => {
                    if *func_idx >= func_len {
                        errors.push(format!(
                            "pc={pc}: Call func_idx={func_idx} out of range (func_table has {func_len} entries)"
                        ));
                    }
                }
                Instr::LoadGlobal { global_idx } | Instr::StoreGlobal { global_idx } => {
                    if *global_idx >= glob_len {
                        errors.push(format!(
                            "pc={pc}: global_idx={global_idx} out of range (globals has {glob_len} entries)"
                        ));
                    }
                }
                Instr::Enter { local_count, .. } => {
                    current_local_count = *local_count;
                }
                Instr::LoadLocal { slot } | Instr::StoreLocal { slot } if *slot >= current_local_count => {
                    errors.push(format!(
                        "pc={pc}: local slot={slot} out of range for current function (local_count={current_local_count})"
                    ));
                }
                Instr::LoadLocal { .. } | Instr::StoreLocal { .. } => {}
                // All other instructions require no additional index checks.
                _ => {}
            }
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
}

impl Default for Program {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Trap
// ---------------------------------------------------------------------------

/// A runtime fault raised by the Aether VM interpreter.
///
/// The interpreter halts execution and surfaces the trap to the host
/// (browser console, test harness, etc.) when one of these conditions is
/// detected.  Every trap carries enough context to produce a useful
/// diagnostic message without a stack-unwinding mechanism.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Trap {
    /// Integer division or remainder by zero.
    ///
    /// Raised by [`Instr::DivI`], [`Instr::RemI`], [`Instr::DivU`],
    /// [`Instr::RemU`].
    DivByZero,

    /// Array or pointer access outside the allocated region.
    ///
    /// `index` is the attempted access index; `length` is the array length.
    /// Raised by [`Instr::ArrayLoad`] and [`Instr::ArrayStore`].
    OutOfBounds { index: i64, length: i64 },

    /// The interpreter's call stack has exceeded its configured maximum depth.
    ///
    /// The default depth limit is 1 024 frames; it is configurable at VM
    /// initialisation time to remain well within WASM's linear-memory budget.
    StackOverflow,

    /// A null pointer was dereferenced.
    ///
    /// Raised by [`Instr::PtrLoad`] and [`Instr::PtrStore`] when the pointer
    /// slot contains zero.
    NullDeref,

    /// A checked integer operation produced a result outside the representable
    /// range of i64.
    ///
    /// Raised by [`Instr::AddI`], [`Instr::SubI`], [`Instr::MulI`],
    /// [`Instr::NegI`], [`Instr::DivI`] (on `MIN / -1`), and
    /// [`Instr::F64ToI64`] / [`Instr::F64ToU64`] when the f64 value does not
    /// fit in the target integer type.
    IntegerOverflow,

    /// Execution reached a statically-unreachable instruction
    /// ([`Instr::Trap`]).
    Unreachable,

    /// The number of executed instructions exceeded the configured limit.
    InstructionLimitExceeded,
}

impl core::fmt::Display for Trap {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Trap::DivByZero => write!(f, "trap: division by zero"),
            Trap::OutOfBounds { index, length } => write!(
                f,
                "trap: array index out of bounds (index={index}, length={length})"
            ),
            Trap::StackOverflow => write!(f, "trap: call stack overflow"),
            Trap::NullDeref => write!(f, "trap: null pointer dereference"),
            Trap::IntegerOverflow => write!(f, "trap: integer overflow"),
            Trap::Unreachable => write!(f, "trap: unreachable instruction executed"),
            Trap::InstructionLimitExceeded => write!(f, "trap: instruction limit exceeded"),
        }
    }
}
