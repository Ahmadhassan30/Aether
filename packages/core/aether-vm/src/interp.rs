//! # Aether VM — Interpreter
//!
//! This module implements the stack-based execution environment for Aether
//! bytecode programs.

use crate::isa::Instr;
use crate::program::{Program, Trap};

// ---------------------------------------------------------------------------
// Execution Status
// ---------------------------------------------------------------------------

/// The current status of the Virtual Machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VmStatus {
    /// The VM is actively executing instructions.
    Running,
    /// The VM has halted normally with a given 64-bit exit code.
    Halted { exit_code: i64 },
}

// ---------------------------------------------------------------------------
// Activation Frame
// ---------------------------------------------------------------------------

/// A single call stack activation frame.
#[derive(Debug, Clone, PartialEq)]
pub struct Frame {
    /// Saved program counter to return to when this function returns.
    pub ret_addr: u32,
    /// Local variable slots (includes function arguments and local variables).
    pub locals: Vec<u64>,
}

// ---------------------------------------------------------------------------
// Execution Result
// ---------------------------------------------------------------------------

/// The result returned upon normal completion of the program.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecutionResult {
    /// All text written to standard output during execution.
    pub stdout: String,
    /// The 64-bit exit code returned by the program.
    pub exit_code: i32,
}

// ---------------------------------------------------------------------------
// Injectable I/O Traits
// ---------------------------------------------------------------------------

/// An interface for capture/redirect of the virtual machine's stdout.
pub trait VmStdout {
    /// Write a string slice to stdout.
    fn write_str(&mut self, s: &str);
}

/// An interface for mock/capture of the virtual machine's stdin.
pub trait VmStdin {
    /// Read a line of text from stdin. Returns `None` on EOF.
    fn read_line(&mut self) -> Option<String>;
}

// --- Standard Implementations of VmStdout ---

impl VmStdout for String {
    fn write_str(&mut self, s: &str) {
        self.push_str(s);
    }
}

/// A stdout target that drops all written data.
pub struct NoopStdout;
impl VmStdout for NoopStdout {
    fn write_str(&mut self, _s: &str) {}
}

/// A stdout wrapper around any standard `std::io::Write` destination.
pub struct WriteStdout<W: std::io::Write>(pub W);
impl<W: std::io::Write> VmStdout for WriteStdout<W> {
    fn write_str(&mut self, s: &str) {
        let _ = self.0.write_all(s.as_bytes());
        let _ = self.0.flush();
    }
}

/// A callback-based stdout writer.
pub struct CallbackStdout<F: FnMut(&str)>(pub F);
impl<F: FnMut(&str)> VmStdout for CallbackStdout<F> {
    fn write_str(&mut self, s: &str) {
        (self.0)(s);
    }
}

// --- Standard Implementations of VmStdin ---

/// A mock stdin that feeds pre-configured lines sequentially.
pub struct MockStdin {
    lines: Vec<String>,
    index: usize,
}

impl MockStdin {
    /// Create a new `MockStdin` with the given lines.
    pub fn new(lines: Vec<String>) -> Self {
        Self { lines, index: 0 }
    }
}

impl VmStdin for MockStdin {
    fn read_line(&mut self) -> Option<String> {
        if self.index < self.lines.len() {
            let res = Some(self.lines[self.index].clone());
            self.index += 1;
            res
        } else {
            None
        }
    }
}

/// A stdin target that reads from standard console input.
pub struct RealStdin;
impl VmStdin for RealStdin {
    fn read_line(&mut self) -> Option<String> {
        let mut s = String::new();
        if std::io::stdin().read_line(&mut s).is_ok() {
            Some(s)
        } else {
            None
        }
    }
}

// ---------------------------------------------------------------------------
// Virtual Machine
// ---------------------------------------------------------------------------

/// Address Space Layout Constants
pub const ADDR_GLOBALS_START: u64 = 0x0000;
pub const ADDR_GLOBALS_END: u64 = 0xFFFF;
pub const ADDR_HEAP_START: u64 = 0x10000;
pub const ADDR_STACK_START: u64 = 0x80000;

/// Memory limit (64 MB) to prevent out-of-memory errors
pub const MAX_MEMORY_LIMIT: u64 = 64 * 1024 * 1024;

/// The Aether Virtual Machine interpreter state.
pub struct Vm {
    /// The compiled program containing instructions and metadata.
    program: Program,
    /// Shared/global operand stack for arithmetic and values.
    operand_stack: Vec<u64>,
    /// The call stack representing active function invocations.
    call_stack: Vec<Frame>,
    /// Program Counter (instruction index).
    pc: u32,
    /// Flat linear memory byte-buffer.
    memory: Vec<u8>,
    /// Capture target or channel for standard output.
    stdout: Box<dyn VmStdout>,
    /// Input reader for standard input.
    stdin: Box<dyn VmStdin>,
    /// Internal buffer collecting all stdout output for the ExecutionResult.
    stdout_buffer: String,
    /// Running state of the interpreter.
    status: VmStatus,
    /// Enable detailed state prints on each step.
    trace: bool,
    /// Number of instructions executed so far.
    instructions_executed: u64,
    /// Maximum allowed instructions before halting with limit trap.
    max_instructions: u64,
}

impl Vm {
    /// Construct a new VM for the given program.
    ///
    /// Validates the program structure, initializes globals in memory,
    /// sets up the initial frame for `main` (func_table[0]), and sets
    /// the program counter to the start of main.
    pub fn new(program: Program) -> Result<Self, Vec<String>> {
        program.validate()?;

        if program.func_table.is_empty() {
            return Err(vec![
                "Program must have at least one entry point function in the function table"
                    .to_string(),
            ]);
        }

        // Initialize flat memory buffer. We start with 1 MB.
        let mut memory = vec![0u8; 1024 * 1024];

        // Populate globals in the globals address space [0x0000 - 0xFFFF].
        // Each global occupies 8 bytes (64 bits).
        for (i, entry) in program.globals.iter().enumerate() {
            let addr = i as u64 * 8;
            if addr + 8 > ADDR_GLOBALS_END + 1 {
                return Err(vec![
                    "Global variables count exceeds the 0x0000 - 0xFFFF globals segment capacity"
                        .to_string(),
                ]);
            }
            let init_val = entry.init.unwrap_or(0);
            for b in 0..8 {
                memory[(addr + b) as usize] = ((init_val >> (b * 8)) & 0xFF) as u8;
            }
        }

        let main_func = &program.func_table[0];
        let main_local_count = main_func.local_count;
        let main_code_offset = main_func.code_offset;
        let initial_frame = Frame {
            ret_addr: u32::MAX, // Sentinel return address indicating termination on return
            locals: vec![0; main_local_count as usize],
        };

        Ok(Self {
            program,
            operand_stack: Vec::new(),
            call_stack: vec![initial_frame],
            pc: main_code_offset,
            memory,
            stdout: Box::new(NoopStdout),
            stdin: Box::new(MockStdin::new(Vec::new())),
            stdout_buffer: String::new(),
            status: VmStatus::Running,
            trace: false,
            instructions_executed: 0,
            max_instructions: 1_000_000,
        })
    }

    /// Inject custom I/O implementations.
    pub fn with_io(mut self, stdout: Box<dyn VmStdout>, stdin: Box<dyn VmStdin>) -> Self {
        self.stdout = stdout;
        self.stdin = stdin;
        self
    }

    /// Enable/disable state tracing.
    pub fn with_trace(mut self, trace: bool) -> Self {
        self.trace = trace;
        self
    }

    /// Configure the instruction count limit.
    pub fn with_max_instructions(mut self, max_instructions: u64) -> Self {
        self.max_instructions = max_instructions;
        self
    }

    // --- Helper Stack Operations ---

    /// Push a value onto the operand stack.
    #[inline]
    pub fn push_stack(&mut self, val: u64) {
        self.operand_stack.push(val);
    }

    /// Pop a value from the operand stack, returning a trap on stack underflow.
    #[inline]
    pub fn pop_stack(&mut self) -> Result<u64, Trap> {
        self.operand_stack.pop().ok_or(Trap::Unreachable)
    }

    /// Access the active call stack frame.
    #[inline]
    fn current_frame(&self) -> Result<&Frame, Trap> {
        self.call_stack.last().ok_or(Trap::Unreachable)
    }

    /// Access the active call stack frame mutably.
    #[inline]
    fn current_frame_mut(&mut self) -> Result<&mut Frame, Trap> {
        self.call_stack.last_mut().ok_or(Trap::Unreachable)
    }

    // --- Memory Operations ---

    /// Dynamic helper to ensure memory is allocated up to the required size.
    #[inline]
    fn ensure_memory_size(&mut self, addr: u64, size: usize) -> Result<(), Trap> {
        let limit = addr as usize + size;
        if addr > MAX_MEMORY_LIMIT || limit > MAX_MEMORY_LIMIT as usize {
            return Err(Trap::OutOfBounds {
                index: addr as i64,
                length: MAX_MEMORY_LIMIT as i64,
            });
        }
        if limit > self.memory.len() {
            self.memory.resize(limit.max(self.memory.len() * 2), 0);
        }
        Ok(())
    }

    // --- Interpreter Step Loop ---

    /// Execute a single instruction.
    ///
    /// Returns `Ok(None)` if execution is continuing, `Ok(Some(ExecutionResult))`
    /// if the VM halted normally, and `Err(Trap)` if a trap occurred.
    #[allow(clippy::manual_range_contains)]
    pub fn step(&mut self) -> Result<Option<ExecutionResult>, Trap> {
        if let VmStatus::Halted { exit_code } = self.status {
            let stdout = std::mem::take(&mut self.stdout_buffer);
            return Ok(Some(ExecutionResult {
                stdout,
                exit_code: exit_code as i32,
            }));
        }

        // Limit Check
        if self.instructions_executed >= self.max_instructions {
            return Err(Trap::InstructionLimitExceeded);
        }

        // Program Counter Check
        if (self.pc as usize) >= self.program.instructions.len() {
            return Err(Trap::Unreachable);
        }

        let instr = self.program.instructions[self.pc as usize].clone();
        let mut next_pc = self.pc + 1;

        // Trace
        if self.trace {
            println!("PC={:04}", self.pc);
            println!("{:?}", instr);
            println!("\nStack:");
            println!("{:?}", self.operand_stack);
            println!();
        }

        match instr {
            // ----------------------------------------------------------------
            // § 1  Stack Operations
            // ----------------------------------------------------------------
            Instr::PushConst { pool_idx } => {
                let entry = &self.program.const_pool[pool_idx as usize];
                self.push_stack(entry.bits);
            }
            Instr::Dup => {
                let val = *self.operand_stack.last().ok_or(Trap::Unreachable)?;
                self.push_stack(val);
            }
            Instr::Pop => {
                let _ = self.pop_stack()?;
            }
            Instr::Swap => {
                let len = self.operand_stack.len();
                if len < 2 {
                    return Err(Trap::Unreachable);
                }
                self.operand_stack.swap(len - 1, len - 2);
            }

            // ----------------------------------------------------------------
            // § 2  Local Variable Load / Store
            // ----------------------------------------------------------------
            Instr::LoadLocal { slot } => {
                let val = self.current_frame()?.locals[slot as usize];
                self.push_stack(val);
            }
            Instr::StoreLocal { slot } => {
                let val = self.pop_stack()?;
                self.current_frame_mut()?.locals[slot as usize] = val;
            }

            // ----------------------------------------------------------------
            // § 3  Global Variable Load / Store
            // ----------------------------------------------------------------
            Instr::LoadGlobal { global_idx } => {
                let addr = global_idx as u64 * 8;
                self.ensure_memory_size(addr, 8)?;
                let mut val = 0u64;
                for b in 0..8 {
                    val |= (self.memory[(addr + b) as usize] as u64) << (b * 8);
                }
                self.push_stack(val);
            }
            Instr::StoreGlobal { global_idx } => {
                let val = self.pop_stack()?;
                let addr = global_idx as u64 * 8;
                self.ensure_memory_size(addr, 8)?;
                for b in 0..8 {
                    self.memory[(addr + b) as usize] = ((val >> (b * 8)) & 0xFF) as u8;
                }
            }

            // ----------------------------------------------------------------
            // § 4  Arithmetic — Integer (signed)
            // ----------------------------------------------------------------
            Instr::AddI => {
                let b = self.pop_stack()? as i64;
                let a = self.pop_stack()? as i64;
                let res = a.checked_add(b).ok_or(Trap::IntegerOverflow)?;
                self.push_stack(res as u64);
            }
            Instr::SubI => {
                let b = self.pop_stack()? as i64;
                let a = self.pop_stack()? as i64;
                let res = a.checked_sub(b).ok_or(Trap::IntegerOverflow)?;
                self.push_stack(res as u64);
            }
            Instr::MulI => {
                let b = self.pop_stack()? as i64;
                let a = self.pop_stack()? as i64;
                let res = a.checked_mul(b).ok_or(Trap::IntegerOverflow)?;
                self.push_stack(res as u64);
            }
            Instr::DivI => {
                let b = self.pop_stack()? as i64;
                let a = self.pop_stack()? as i64;
                if b == 0 {
                    return Err(Trap::DivByZero);
                }
                let res = a.checked_div(b).ok_or(Trap::IntegerOverflow)?;
                self.push_stack(res as u64);
            }
            Instr::RemI => {
                let b = self.pop_stack()? as i64;
                let a = self.pop_stack()? as i64;
                if b == 0 {
                    return Err(Trap::DivByZero);
                }
                let res = if a == i64::MIN && b == -1 { 0 } else { a % b };
                self.push_stack(res as u64);
            }
            Instr::NegI => {
                let a = self.pop_stack()? as i64;
                let res = a.checked_neg().ok_or(Trap::IntegerOverflow)?;
                self.push_stack(res as u64);
            }

            // ----------------------------------------------------------------
            // § 5  Arithmetic — Unsigned
            // ----------------------------------------------------------------
            Instr::AddU => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                self.push_stack(a.wrapping_add(b));
            }
            Instr::SubU => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                self.push_stack(a.wrapping_sub(b));
            }
            Instr::MulU => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                self.push_stack(a.wrapping_mul(b));
            }
            Instr::DivU => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                if b == 0 {
                    return Err(Trap::DivByZero);
                }
                self.push_stack(a / b);
            }
            Instr::RemU => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                if b == 0 {
                    return Err(Trap::DivByZero);
                }
                self.push_stack(a % b);
            }

            // ----------------------------------------------------------------
            // § 6  Arithmetic — Floating-point (f64)
            // ----------------------------------------------------------------
            Instr::AddF => {
                let b = f64::from_bits(self.pop_stack()?);
                let a = f64::from_bits(self.pop_stack()?);
                self.push_stack((a + b).to_bits());
            }
            Instr::SubF => {
                let b = f64::from_bits(self.pop_stack()?);
                let a = f64::from_bits(self.pop_stack()?);
                self.push_stack((a - b).to_bits());
            }
            Instr::MulF => {
                let b = f64::from_bits(self.pop_stack()?);
                let a = f64::from_bits(self.pop_stack()?);
                self.push_stack((a * b).to_bits());
            }
            Instr::DivF => {
                let b = f64::from_bits(self.pop_stack()?);
                let a = f64::from_bits(self.pop_stack()?);
                self.push_stack((a / b).to_bits());
            }
            Instr::NegF => {
                let a = f64::from_bits(self.pop_stack()?);
                self.push_stack((-a).to_bits());
            }

            // ----------------------------------------------------------------
            // § 7  Bitwise & Shift
            // ----------------------------------------------------------------
            Instr::BitAnd => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                self.push_stack(a & b);
            }
            Instr::BitOr => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                self.push_stack(a | b);
            }
            Instr::BitXor => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                self.push_stack(a ^ b);
            }
            Instr::BitNot => {
                let a = self.pop_stack()?;
                self.push_stack(!a);
            }
            Instr::Shl => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                self.push_stack(a << (b % 64));
            }
            Instr::ShrI => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()? as i64;
                self.push_stack((a >> (b % 64)) as u64);
            }
            Instr::ShrU => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                self.push_stack(a >> (b % 64));
            }

            // ----------------------------------------------------------------
            // § 8  Comparisons
            // ----------------------------------------------------------------
            Instr::EqI => {
                let b = self.pop_stack()? as i64;
                let a = self.pop_stack()? as i64;
                self.push_stack(if a == b { 1 } else { 0 });
            }
            Instr::NeI => {
                let b = self.pop_stack()? as i64;
                let a = self.pop_stack()? as i64;
                self.push_stack(if a != b { 1 } else { 0 });
            }
            Instr::LtI => {
                let b = self.pop_stack()? as i64;
                let a = self.pop_stack()? as i64;
                self.push_stack(if a < b { 1 } else { 0 });
            }
            Instr::LeI => {
                let b = self.pop_stack()? as i64;
                let a = self.pop_stack()? as i64;
                self.push_stack(if a <= b { 1 } else { 0 });
            }
            Instr::GtI => {
                let b = self.pop_stack()? as i64;
                let a = self.pop_stack()? as i64;
                self.push_stack(if a > b { 1 } else { 0 });
            }
            Instr::GeI => {
                let b = self.pop_stack()? as i64;
                let a = self.pop_stack()? as i64;
                self.push_stack(if a >= b { 1 } else { 0 });
            }
            Instr::LtU => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                self.push_stack(if a < b { 1 } else { 0 });
            }
            Instr::LeU => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                self.push_stack(if a <= b { 1 } else { 0 });
            }
            Instr::GtU => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                self.push_stack(if a > b { 1 } else { 0 });
            }
            Instr::GeU => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                self.push_stack(if a >= b { 1 } else { 0 });
            }
            Instr::EqF => {
                let b = f64::from_bits(self.pop_stack()?);
                let a = f64::from_bits(self.pop_stack()?);
                self.push_stack(if a == b { 1 } else { 0 });
            }
            Instr::NeF => {
                let b = f64::from_bits(self.pop_stack()?);
                let a = f64::from_bits(self.pop_stack()?);
                self.push_stack(if a != b { 1 } else { 0 });
            }
            Instr::LtF => {
                let b = f64::from_bits(self.pop_stack()?);
                let a = f64::from_bits(self.pop_stack()?);
                self.push_stack(if a < b { 1 } else { 0 });
            }
            Instr::LeF => {
                let b = f64::from_bits(self.pop_stack()?);
                let a = f64::from_bits(self.pop_stack()?);
                self.push_stack(if a <= b { 1 } else { 0 });
            }
            Instr::GtF => {
                let b = f64::from_bits(self.pop_stack()?);
                let a = f64::from_bits(self.pop_stack()?);
                self.push_stack(if a > b { 1 } else { 0 });
            }
            Instr::GeF => {
                let b = f64::from_bits(self.pop_stack()?);
                let a = f64::from_bits(self.pop_stack()?);
                self.push_stack(if a >= b { 1 } else { 0 });
            }

            // ----------------------------------------------------------------
            // § 9  Logical
            // ----------------------------------------------------------------
            Instr::LogNot => {
                let a = self.pop_stack()?;
                self.push_stack(if a == 0 { 1 } else { 0 });
            }
            Instr::LogAnd => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                self.push_stack(if a != 0 && b != 0 { 1 } else { 0 });
            }
            Instr::LogOr => {
                let b = self.pop_stack()?;
                let a = self.pop_stack()?;
                self.push_stack(if a != 0 || b != 0 { 1 } else { 0 });
            }

            // ----------------------------------------------------------------
            // § 10  Type Conversions
            // ----------------------------------------------------------------
            Instr::ToI64 | Instr::ToU64 => {
                // No-op at runtime
            }
            Instr::I64ToF64 => {
                let a = self.pop_stack()? as i64;
                self.push_stack((a as f64).to_bits());
            }
            Instr::U64ToF64 => {
                let a = self.pop_stack()?;
                self.push_stack((a as f64).to_bits());
            }
            Instr::F64ToI64 => {
                let f = f64::from_bits(self.pop_stack()?);
                if f.is_nan() || f < -9223372036854775808.0 || f >= 9223372036854775808.0 {
                    return Err(Trap::IntegerOverflow);
                }
                self.push_stack(f as i64 as u64);
            }
            Instr::F64ToU64 => {
                let f = f64::from_bits(self.pop_stack()?);
                if f.is_nan() || f < 0.0 || f >= 18446744073709551616.0 {
                    return Err(Trap::IntegerOverflow);
                }
                self.push_stack(f as u64);
            }
            Instr::SignExtend { bits } => {
                let val = self.pop_stack()?;
                let extended = match bits {
                    8 => (val as i8) as i64 as u64,
                    16 => (val as i16) as i64 as u64,
                    32 => (val as i32) as i64 as u64,
                    _ => return Err(Trap::Unreachable),
                };
                self.push_stack(extended);
            }
            Instr::ZeroExtend { bits } => {
                let val = self.pop_stack()?;
                let extended = match bits {
                    8 => (val as u8) as u64,
                    16 => (val as u16) as u64,
                    32 => (val as u32) as u64,
                    _ => return Err(Trap::Unreachable),
                };
                self.push_stack(extended);
            }

            // ----------------------------------------------------------------
            // § 11  Control Flow — Unconditional
            // ----------------------------------------------------------------
            Instr::Jump { target } => {
                next_pc = target;
            }

            // ----------------------------------------------------------------
            // § 12  Control Flow — Conditional
            // ----------------------------------------------------------------
            Instr::JumpIfFalse { target } => {
                let a = self.pop_stack()?;
                if a == 0 {
                    next_pc = target;
                }
            }
            Instr::JumpIfTrue { target } => {
                let a = self.pop_stack()?;
                if a != 0 {
                    next_pc = target;
                }
            }

            // ----------------------------------------------------------------
            // § 13  Control Flow — Structured
            // ----------------------------------------------------------------
            Instr::BlockEnter | Instr::BlockExit => {
                // No-op at runtime
            }

            // ----------------------------------------------------------------
            // § 14  Functions — Call / Return
            // ----------------------------------------------------------------
            Instr::Call {
                func_idx,
                arg_count,
            } => {
                let func = self.program.func_table[func_idx as usize].clone();
                if arg_count != func.arity {
                    return Err(Trap::Unreachable);
                }
                if self.call_stack.len() >= 1024 {
                    return Err(Trap::StackOverflow);
                }
                let mut locals = vec![0u64; func.local_count as usize];
                // Pop arguments in reverse order (stack top is rightmost arg)
                for i in (0..arg_count as usize).rev() {
                    locals[i] = self.pop_stack()?;
                }
                self.call_stack.push(Frame {
                    ret_addr: self.pc + 1,
                    locals,
                });
                next_pc = func.code_offset;
            }
            Instr::CallIndirect { arg_count } => {
                let func_idx = self.pop_stack()? as u32;
                if func_idx as usize >= self.program.func_table.len() {
                    return Err(Trap::Unreachable);
                }
                let func = self.program.func_table[func_idx as usize].clone();
                if arg_count != func.arity {
                    return Err(Trap::Unreachable);
                }
                if self.call_stack.len() >= 1024 {
                    return Err(Trap::StackOverflow);
                }
                let mut locals = vec![0u64; func.local_count as usize];
                for i in (0..arg_count as usize).rev() {
                    locals[i] = self.pop_stack()?;
                }
                self.call_stack.push(Frame {
                    ret_addr: self.pc + 1,
                    locals,
                });
                next_pc = func.code_offset;
            }
            Instr::Enter {
                arity: _,
                local_count,
            } => {
                // Validate calibration checks
                let current_frame = self.current_frame()?;
                if current_frame.locals.len() != local_count as usize {
                    return Err(Trap::Unreachable);
                }
                // Verify that parameters were copied (main arity might be 0)
                // Just an assert validation
            }
            Instr::Return { has_value } => {
                let frame = self.call_stack.pop().ok_or(Trap::Unreachable)?;
                if self.call_stack.is_empty() {
                    // Halts the VM on return from the entry point function
                    let exit_code = if has_value {
                        self.pop_stack()? as i64
                    } else {
                        0
                    };
                    self.status = VmStatus::Halted { exit_code };
                } else {
                    next_pc = frame.ret_addr;
                }
            }

            // ----------------------------------------------------------------
            // § 15  Memory / Array — with Bounds-Check Metadata
            // ----------------------------------------------------------------
            Instr::ArrayLoad {
                base_slot,
                elem_width,
                array_len_slot,
            } => {
                let index = self.pop_stack()? as i64;
                let frame = self.current_frame()?;
                let base_ptr = frame.locals[base_slot as usize];
                let array_len = frame.locals[array_len_slot as usize] as i64;

                if index < 0 || index >= array_len {
                    return Err(Trap::OutOfBounds {
                        index,
                        length: array_len,
                    });
                }

                let target_addr = base_ptr
                    .checked_add(
                        (index as u64)
                            .checked_mul(elem_width as u64)
                            .ok_or(Trap::Unreachable)?,
                    )
                    .ok_or(Trap::Unreachable)?;

                if target_addr == 0 {
                    return Err(Trap::NullDeref);
                }

                self.ensure_memory_size(target_addr, elem_width as usize)?;
                let mut val = 0u64;
                for i in 0..elem_width as usize {
                    val |= (self.memory[(target_addr as usize) + i] as u64) << (i * 8);
                }
                self.push_stack(val);
            }
            Instr::ArrayStore {
                base_slot,
                elem_width,
                array_len_slot,
            } => {
                let val = self.pop_stack()?;
                let index = self.pop_stack()? as i64;
                let frame = self.current_frame()?;
                let base_ptr = frame.locals[base_slot as usize];
                let array_len = frame.locals[array_len_slot as usize] as i64;

                if index < 0 || index >= array_len {
                    return Err(Trap::OutOfBounds {
                        index,
                        length: array_len,
                    });
                }

                let target_addr = base_ptr
                    .checked_add(
                        (index as u64)
                            .checked_mul(elem_width as u64)
                            .ok_or(Trap::Unreachable)?,
                    )
                    .ok_or(Trap::Unreachable)?;

                if target_addr == 0 {
                    return Err(Trap::NullDeref);
                }

                self.ensure_memory_size(target_addr, elem_width as usize)?;
                for i in 0..elem_width as usize {
                    self.memory[(target_addr as usize) + i] = ((val >> (i * 8)) & 0xFF) as u8;
                }
            }
            Instr::PtrLoad {
                ptr_slot,
                elem_width,
            } => {
                let ptr = self.current_frame()?.locals[ptr_slot as usize];
                if ptr == 0 {
                    return Err(Trap::NullDeref);
                }
                self.ensure_memory_size(ptr, elem_width as usize)?;
                let mut val = 0u64;
                for i in 0..elem_width as usize {
                    val |= (self.memory[(ptr as usize) + i] as u64) << (i * 8);
                }
                self.push_stack(val);
            }
            Instr::PtrStore {
                ptr_slot,
                elem_width,
            } => {
                let val = self.pop_stack()?;
                let ptr = self.current_frame()?.locals[ptr_slot as usize];
                if ptr == 0 {
                    return Err(Trap::NullDeref);
                }
                self.ensure_memory_size(ptr, elem_width as usize)?;
                for i in 0..elem_width as usize {
                    self.memory[(ptr as usize) + i] = ((val >> (i * 8)) & 0xFF) as u8;
                }
            }

            // ----------------------------------------------------------------
            // § 16  I/O Opcodes
            // ----------------------------------------------------------------
            Instr::PrintI => {
                let val = self.pop_stack()? as i64;
                let s = format!("{}", val);
                self.stdout.write_str(&s);
                self.stdout_buffer.push_str(&s);
            }
            Instr::PrintU => {
                let val = self.pop_stack()?;
                let s = format!("{}", val);
                self.stdout.write_str(&s);
                self.stdout_buffer.push_str(&s);
            }
            Instr::PrintF => {
                let val = f64::from_bits(self.pop_stack()?);
                let s = format!("{}", val);
                self.stdout.write_str(&s);
                self.stdout_buffer.push_str(&s);
            }
            Instr::PrintChar => {
                let val = self.pop_stack()?;
                let s = format!("{}", val as u8 as char);
                self.stdout.write_str(&s);
                self.stdout_buffer.push_str(&s);
            }
            Instr::PrintStr { str_slot } => {
                let ptr = self.current_frame()?.locals[str_slot as usize];
                let mut bytes = Vec::new();
                let mut curr = ptr;
                loop {
                    if curr > MAX_MEMORY_LIMIT {
                        return Err(Trap::OutOfBounds {
                            index: curr as i64,
                            length: MAX_MEMORY_LIMIT as i64,
                        });
                    }
                    self.ensure_memory_size(curr, 1)?;
                    let b = self.memory[curr as usize];
                    if b == 0 {
                        break;
                    }
                    bytes.push(b);
                    curr += 1;
                }
                let s = String::from_utf8_lossy(&bytes);
                self.stdout.write_str(&s);
                self.stdout_buffer.push_str(&s);
            }
            Instr::ReadI => {
                let line = self.stdin.read_line().unwrap_or_default();
                let val = line.trim().parse::<i64>().unwrap_or(0);
                self.push_stack(val as u64);
            }
            Instr::ReadF => {
                let line = self.stdin.read_line().unwrap_or_default();
                let val = line.trim().parse::<f64>().unwrap_or(0.0);
                self.push_stack(val.to_bits());
            }

            // ----------------------------------------------------------------
            // § 17  VM Control
            // ----------------------------------------------------------------
            Instr::Halt => {
                let exit_code = self.pop_stack()? as i64;
                self.status = VmStatus::Halted { exit_code };
            }
            Instr::Trap(trap) => {
                return Err(trap.clone());
            }
        }

        self.pc = next_pc;
        self.instructions_executed += 1;

        if let VmStatus::Halted { exit_code } = self.status {
            let stdout = std::mem::take(&mut self.stdout_buffer);
            return Ok(Some(ExecutionResult {
                stdout,
                exit_code: exit_code as i32,
            }));
        }

        Ok(None)
    }

    /// Run program until it halts normally or traps.
    pub fn run_to_completion(&mut self) -> Result<ExecutionResult, Trap> {
        loop {
            if let Some(res) = self.step()? {
                return Ok(res);
            }
        }
    }
}
