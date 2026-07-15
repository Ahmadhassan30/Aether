//! # Aether VM — HIR Lowering Pass
//!
//! This module implements the compilation pass from the Aether High Intermediate
//! Representation (HIR) to Aether VM Program bytecode.

use crate::isa::Instr;
use crate::program::{ConstEntry, FuncEntry, GlobalEntry, Program};
use aether_parser::data::hir::{
    BinaryOp, Declaration, Expr, ExprType, Initializer, Stmt, StmtType, Symbol,
};
use aether_parser::data::lex::{ComparisonToken, Locatable};
use aether_parser::data::types::{ArrayType, StructType, Type};
use aether_parser::data::Location;
use std::collections::{HashMap, HashSet};

// ---------------------------------------------------------------------------
// Diagnostics / Errors
// ---------------------------------------------------------------------------

/// A compile-time error encountered during Aether HIR lowering.
#[derive(Debug, Clone, PartialEq)]
pub struct LowerError {
    /// Source code location of the offending HIR node.
    pub location: Location,
    /// Debug representation of the offending HIR node.
    pub node: String,
    /// Detailed description of the error.
    pub explanation: String,
}

impl std::fmt::Display for LowerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "LowerError at {:?}: {}, explanation: {}",
            self.location, self.node, self.explanation
        )
    }
}

impl std::error::Error for LowerError {}

// ---------------------------------------------------------------------------
// Compiler State
// ---------------------------------------------------------------------------

struct Compiler {
    program: Program,
    func_map: HashMap<Symbol, u32>,
    global_map: HashMap<Symbol, u32>,
    string_literals: HashMap<Vec<u8>, u32>,
    func_return_types: Vec<Type>,
}

impl Compiler {
    fn new() -> Self {
        Self {
            program: Program::new(),
            func_map: HashMap::new(),
            global_map: HashMap::new(),
            string_literals: HashMap::new(),
            func_return_types: Vec::new(),
        }
    }

    /// Allocate a string literal in the globals segment
    fn allocate_string_literal(&mut self, bytes: &[u8]) -> u64 {
        if let Some(&addr) = self.string_literals.get(bytes) {
            return addr as u64;
        }

        // String needs to be null-terminated
        let mut data = bytes.to_vec();
        data.push(0);

        let size = data.len();
        let slots = size.div_ceil(8);
        let global_idx = self.program.globals.len() as u32;

        for s in 0..slots {
            let mut val = 0u64;
            for b in 0..8 {
                let idx = s * 8 + b;
                if idx < size {
                    val |= (data[idx] as u64) << (b * 8);
                }
            }
            self.program.globals.push(GlobalEntry {
                name: format!("str_{}", global_idx),
                init: Some(val),
            });
        }

        let addr = global_idx as u64 * 8;
        self.string_literals.insert(bytes.to_vec(), global_idx);
        addr
    }
}

// ---------------------------------------------------------------------------
// Function Compilation State
// ---------------------------------------------------------------------------

struct FnCompiler<'a> {
    parent: &'a mut Compiler,
    local_map: HashMap<Symbol, u32>,
    next_local_slot: u32,
    stack_locals: HashSet<Symbol>,
    break_targets: Vec<u32>,
    continue_targets: Vec<u32>,
    labels: HashMap<aether_parser::intern::InternedStr, u32>,
    unresolved_gotos: Vec<(u32, aether_parser::intern::InternedStr, Location)>,
    switch_stack: Vec<SwitchInfo>,
    stack_offset: u64,
    current_stack_depth: usize,
    max_stack_depth: usize,
}

#[allow(dead_code)]
struct SwitchInfo {
    cond_slot: u32,
    dispatch_jump_pc: u32,
    cases: Vec<(u64, u32)>, // (value, target_pc)
    default_pc: Option<u32>,
}

impl<'a> FnCompiler<'a> {
    fn new(parent: &'a mut Compiler) -> Self {
        Self {
            parent,
            local_map: HashMap::new(),
            next_local_slot: 0,
            stack_locals: HashSet::new(),
            break_targets: Vec::new(),
            continue_targets: Vec::new(),
            labels: HashMap::new(),
            unresolved_gotos: Vec::new(),
            switch_stack: Vec::new(),
            stack_offset: ADDR_STACK_START,
            current_stack_depth: 0,
            max_stack_depth: 0,
        }
    }

    fn new_temp_slot(&mut self) -> u32 {
        let slot = self.next_local_slot;
        self.next_local_slot += 1;
        slot
    }

    fn needs_stack_allocation(&self, ctype: &Type) -> bool {
        matches!(ctype, Type::Array(_, _) | Type::Struct(_) | Type::Union(_))
    }

    fn is_sym_stack_allocated(&self, sym: Symbol) -> bool {
        self.stack_locals.contains(&sym) || self.needs_stack_allocation(&sym.get().ctype)
    }

    /// Helper to emit instruction and track stack depth change
    fn emit(&mut self, instr: Instr, loc: Location) -> Result<u32, LowerError> {
        let (pops, pushes) = match &instr {
            Instr::PushConst { .. } => (0, 1),
            Instr::Dup => (1, 2),
            Instr::Pop => (1, 0),
            Instr::Swap => (2, 2),

            Instr::LoadLocal { .. } => (0, 1),
            Instr::StoreLocal { .. } => (1, 0),
            Instr::LoadGlobal { .. } => (0, 1),
            Instr::StoreGlobal { .. } => (1, 0),

            Instr::AddI | Instr::SubI | Instr::MulI | Instr::DivI | Instr::RemI => (2, 1),
            Instr::NegI => (1, 1),

            Instr::AddU | Instr::SubU | Instr::MulU | Instr::DivU | Instr::RemU => (2, 1),

            Instr::AddF | Instr::SubF | Instr::MulF | Instr::DivF => (2, 1),
            Instr::NegF => (1, 1),

            Instr::BitAnd | Instr::BitOr | Instr::BitXor => (2, 1),
            Instr::BitNot => (1, 1),
            Instr::Shl | Instr::ShrI | Instr::ShrU => (2, 1),

            Instr::EqI | Instr::NeI | Instr::LtI | Instr::LeI | Instr::GtI | Instr::GeI => (2, 1),
            Instr::LtU | Instr::LeU | Instr::GtU | Instr::GeU => (2, 1),
            Instr::EqF | Instr::NeF | Instr::LtF | Instr::LeF | Instr::GtF | Instr::GeF => (2, 1),

            Instr::LogNot => (1, 1),
            Instr::LogAnd | Instr::LogOr => (2, 1),

            Instr::ToI64 | Instr::ToU64 => (1, 1),
            Instr::I64ToF64 | Instr::U64ToF64 => (1, 1),
            Instr::F64ToI64 | Instr::F64ToU64 => (1, 1),
            Instr::SignExtend { .. } | Instr::ZeroExtend { .. } => (1, 1),

            Instr::Jump { .. } => (0, 0),
            Instr::JumpIfFalse { .. } | Instr::JumpIfTrue { .. } => (1, 0),

            Instr::BlockEnter | Instr::BlockExit => (0, 0),

            // Call pushes are handled dynamically in compile_expr to support void functions correctly
            Instr::Call { arg_count, .. } => (*arg_count as usize, 0),
            Instr::CallIndirect { arg_count } => (*arg_count as usize + 1, 0),

            Instr::Enter { .. } => (0, 0),
            Instr::Return { has_value } => (if *has_value { 1 } else { 0 }, 0),

            Instr::ArrayLoad { .. } => (1, 1),
            Instr::ArrayStore { .. } => (2, 0),

            Instr::PtrLoad { .. } => (0, 1),
            Instr::PtrStore { .. } => (1, 0),

            Instr::PrintI | Instr::PrintU | Instr::PrintF | Instr::PrintChar => (1, 0),
            Instr::PrintStr { .. } => (0, 0),

            Instr::ReadI | Instr::ReadF => (0, 1),

            Instr::Halt => (1, 0),
            Instr::Trap(_) => (0, 0),
        };

        if self.current_stack_depth < pops {
            return Err(LowerError {
                location: loc,
                node: format!("{:?}", instr),
                explanation: format!(
                    "Stack underflow: trying to pop {} values, but stack has depth {}",
                    pops, self.current_stack_depth
                ),
            });
        }
        self.current_stack_depth -= pops;
        self.current_stack_depth += pushes;
        self.max_stack_depth = self.max_stack_depth.max(self.current_stack_depth);

        let idx = self.parent.program.emit_with_location(instr, Some(loc));
        Ok(idx)
    }

    /// Check if stack is empty (or matches expected depth)
    fn verify_stack_depth(
        &self,
        expected: usize,
        loc: Location,
        context: &str,
    ) -> Result<(), LowerError> {
        if self.current_stack_depth != expected {
            return Err(LowerError {
                location: loc,
                node: format!("Stack state: depth={}", self.current_stack_depth),
                explanation: format!(
                    "Stack inconsistency at {}: expected depth {}, but was {}",
                    context, expected, self.current_stack_depth
                ),
            });
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Address layout constants
// ---------------------------------------------------------------------------
const ADDR_STACK_START: u64 = 0x80000;

// ---------------------------------------------------------------------------
// Pass 1: Local Variables Collection & Scan for Address-Taken variables
// ---------------------------------------------------------------------------

fn scan_for_address_taken_locals(stmt: &Stmt, stack_locals: &mut HashSet<Symbol>) {
    match &stmt.data {
        StmtType::Compound(stmts) => {
            for s in stmts {
                scan_for_address_taken_locals(s, stack_locals);
            }
        }
        StmtType::If(_, then_b, else_b) => {
            scan_for_address_taken_locals(then_b, stack_locals);
            if let Some(e) = else_b {
                scan_for_address_taken_locals(e, stack_locals);
            }
        }
        StmtType::Do(body, _) => {
            scan_for_address_taken_locals(body, stack_locals);
        }
        StmtType::While(_, body) => {
            scan_for_address_taken_locals(body, stack_locals);
        }
        StmtType::For(init, _, _, body) => {
            scan_for_address_taken_locals(init, stack_locals);
            scan_for_address_taken_locals(body, stack_locals);
        }
        StmtType::Switch(_, body) => {
            scan_for_address_taken_locals(body, stack_locals);
        }
        StmtType::Label(_, inner) => {
            scan_for_address_taken_locals(inner, stack_locals);
        }
        StmtType::Case(_, inner) => {
            scan_for_address_taken_locals(inner, stack_locals);
        }
        StmtType::Default(inner) => {
            scan_for_address_taken_locals(inner, stack_locals);
        }
        StmtType::Expr(expr) => {
            scan_expr_for_address_of(expr, stack_locals);
        }
        StmtType::Return(Some(expr)) => {
            scan_expr_for_address_of(expr, stack_locals);
        }
        StmtType::Decl(decls) => {
            for decl in decls {
                if let Some(init) = &decl.data.init {
                    match init {
                        Initializer::Scalar(expr) => {
                            scan_expr_for_address_of(expr, stack_locals);
                        }
                        Initializer::InitializerList(list) => {
                            for elem in list {
                                if let Initializer::Scalar(expr) = elem {
                                    scan_expr_for_address_of(expr, stack_locals);
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
        _ => {}
    }
}

fn scan_expr_for_address_of(expr: &Expr, stack_locals: &mut HashSet<Symbol>) {
    match &expr.expr {
        ExprType::StaticRef(inner) => {
            if let ExprType::Id(sym) = &inner.expr {
                stack_locals.insert(*sym);
            }
        }
        ExprType::Id(sym) => {
            if let Type::Pointer(pointee, _) = &expr.ctype {
                if **pointee == sym.get().ctype {
                    stack_locals.insert(*sym);
                }
            }
        }
        ExprType::Binary(_, left, right) => {
            scan_expr_for_address_of(left, stack_locals);
            scan_expr_for_address_of(right, stack_locals);
        }
        ExprType::FuncCall(func, args) => {
            scan_expr_for_address_of(func, stack_locals);
            for arg in args {
                scan_expr_for_address_of(arg, stack_locals);
            }
        }
        ExprType::Member(comp, _) => {
            scan_expr_for_address_of(comp, stack_locals);
        }
        ExprType::Cast(inner) => {
            scan_expr_for_address_of(inner, stack_locals);
        }
        ExprType::Deref(inner) => {
            scan_expr_for_address_of(inner, stack_locals);
        }
        ExprType::Negate(inner) => {
            scan_expr_for_address_of(inner, stack_locals);
        }
        ExprType::BitwiseNot(inner) => {
            scan_expr_for_address_of(inner, stack_locals);
        }
        ExprType::Ternary(cond, then_e, else_e) => {
            scan_expr_for_address_of(cond, stack_locals);
            scan_expr_for_address_of(then_e, stack_locals);
            scan_expr_for_address_of(else_e, stack_locals);
        }
        ExprType::Comma(left, right) => {
            scan_expr_for_address_of(left, stack_locals);
            scan_expr_for_address_of(right, stack_locals);
        }
        ExprType::PostIncrement(inner, _) => {
            scan_expr_for_address_of(inner, stack_locals);
        }
        ExprType::Noop(inner) => {
            scan_expr_for_address_of(inner, stack_locals);
        }
        _ => {}
    }
}

fn collect_local_decls(stmt: &Stmt, locals: &mut Vec<Symbol>) {
    match &stmt.data {
        StmtType::Compound(stmts) => {
            for s in stmts {
                collect_local_decls(s, locals);
            }
        }
        StmtType::If(_, then_b, else_b) => {
            collect_local_decls(then_b, locals);
            if let Some(e) = else_b {
                collect_local_decls(e, locals);
            }
        }
        StmtType::Do(body, _) => {
            collect_local_decls(body, locals);
        }
        StmtType::While(_, body) => {
            collect_local_decls(body, locals);
        }
        StmtType::For(init, _, _, body) => {
            collect_local_decls(init, locals);
            collect_local_decls(body, locals);
        }
        StmtType::Switch(_, body) => {
            collect_local_decls(body, locals);
        }
        StmtType::Label(_, inner) => {
            collect_local_decls(inner, locals);
        }
        StmtType::Case(_, inner) => {
            collect_local_decls(inner, locals);
        }
        StmtType::Default(inner) => {
            collect_local_decls(inner, locals);
        }
        StmtType::Decl(decls) => {
            for d in decls {
                locals.push(d.data.symbol);
            }
        }
        _ => {}
    }
}

// ---------------------------------------------------------------------------
// Lowering Pass Implementation
// ---------------------------------------------------------------------------

/// Compile a verified Aether HIR translation unit to bytecode Program.
pub fn lower_program(decls: &[Locatable<Declaration>]) -> Result<Program, LowerError> {
    let mut compiler = Compiler::new();

    // --- Pass 1: Scan all functions and global variables ---
    for decl in decls {
        let sym = decl.data.symbol;
        let var = sym.get();
        check_type_supported(&var.ctype, decl.location)?;
        let name = var.id.to_string();

        if let Type::Function(func_ty) = &var.ctype {
            // Function Declaration
            if !compiler.func_map.contains_key(&sym) {
                let func_idx = compiler.program.func_table.len() as u32;
                compiler.func_map.insert(sym, func_idx);
                compiler
                    .func_return_types
                    .push((*func_ty.return_type).clone());
                // Dummy entry for now, will backpatch details when lowering definition
                compiler.program.func_table.push(FuncEntry {
                    name: name.clone(),
                    arity: func_ty.params.len() as u32,
                    local_count: 0,
                    code_offset: 0,
                });
            }
        } else {
            // Global Variable
            if !compiler.global_map.contains_key(&sym) {
                let size = var.ctype.sizeof().map_err(|e| LowerError {
                    location: decl.location,
                    node: format!("{:?}", var.ctype),
                    explanation: format!("Invalid global variable type size: {}", e),
                })?;

                let slots = size.div_ceil(8);
                let global_idx = compiler.program.globals.len() as u32;
                compiler.global_map.insert(sym, global_idx);

                // Add slots
                for s in 0..slots {
                    compiler.program.globals.push(GlobalEntry {
                        name: if s == 0 {
                            name.clone()
                        } else {
                            format!("{}_slot{}", name, s)
                        },
                        init: None,
                    });
                }

                // If initializer list exists, parse it
                if let Some(init) = &decl.data.init {
                    match init {
                        Initializer::Scalar(expr) => {
                            let val = eval_constant(expr, &mut compiler)?;
                            compiler.program.globals[global_idx as usize].init = Some(val);
                        }
                        Initializer::InitializerList(list) => {
                            // Pack elements
                            let mut data = vec![0u8; slots as usize * 8];
                            let elem_width = match &var.ctype {
                                Type::Array(t, _) => t.sizeof().unwrap_or(8),
                                _ => 8,
                            } as usize;

                            for (idx, elem) in list.iter().enumerate() {
                                if let Initializer::Scalar(expr) = elem {
                                    let val = eval_constant(expr, &mut compiler)?;
                                    let offset = idx * elem_width;
                                    if offset + elem_width <= data.len() {
                                        for b in 0..elem_width {
                                            data[offset + b] = ((val >> (b * 8)) & 0xFF) as u8;
                                        }
                                    }
                                } else {
                                    return Err(LowerError {
                                        location: decl.location,
                                        node: format!("{:?}", elem),
                                        explanation:
                                            "Nested initializer lists in globals are not supported"
                                                .to_string(),
                                    });
                                }
                            }

                            // Write back to globals
                            for s in 0..slots as usize {
                                let mut val = 0u64;
                                for b in 0..8 {
                                    val |= (data[s * 8 + b] as u64) << (b * 8);
                                }
                                compiler.program.globals[global_idx as usize + s].init = Some(val);
                            }
                        }
                        Initializer::FunctionBody(_) => unreachable!(),
                    }
                }
            }
        }
    }

    // --- Pass 2: Lower all function bodies ---
    for decl in decls {
        if let Some(Initializer::FunctionBody(body)) = &decl.data.init {
            let sym = decl.data.symbol;
            let func_idx = *compiler.func_map.get(&sym).ok_or_else(|| LowerError {
                location: decl.location,
                node: sym.get().id.to_string(),
                explanation: "Internal error: function missing from func_map".to_string(),
            })?;

            let mut fn_comp = FnCompiler::new(&mut compiler);

            // Populate parameters as local slots
            let var = sym.get();
            let func_ty = match &var.ctype {
                Type::Function(t) => t,
                _ => unreachable!(),
            };

            for (i, &param_sym) in func_ty.params.iter().enumerate() {
                fn_comp.local_map.insert(param_sym, i as u32);
                fn_comp.next_local_slot += 1;
            }

            // Perform Pass 1 on local variables
            let mut local_syms = Vec::new();
            for stmt in body {
                collect_local_decls(stmt, &mut local_syms);
                scan_for_address_taken_locals(stmt, &mut fn_comp.stack_locals);
            }

            // Assign slots to local variables
            for local_sym in local_syms {
                check_type_supported(&local_sym.get().ctype, decl.location)?;
                if !fn_comp.local_map.contains_key(&local_sym) {
                    let slot = fn_comp.next_local_slot;
                    fn_comp.next_local_slot += 1;
                    fn_comp.local_map.insert(local_sym, slot);
                }
            }

            // Record function entry offset
            let start_pc = fn_comp.parent.program.instructions.len() as u32;

            // Emit function prologue
            fn_comp.emit(
                Instr::Enter {
                    arity: func_ty.params.len() as u32,
                    local_count: fn_comp.next_local_slot,
                },
                decl.location,
            )?;

            // Initialize stack-allocated local variables (arrays/structs/address-taken scalars)
            let local_map_copied: Vec<(Symbol, u32)> =
                fn_comp.local_map.iter().map(|(&k, &v)| (k, v)).collect();
            for (local_sym, slot) in local_map_copied {
                let ty = &local_sym.get().ctype;
                let is_stack = fn_comp.is_sym_stack_allocated(local_sym);
                if is_stack {
                    let size = ty.sizeof().map_err(|e| LowerError {
                        location: decl.location,
                        node: format!("{:?}", ty),
                        explanation: format!("Invalid local variable size: {}", e),
                    })?;

                    // Align offset to local type requirements
                    let align = ty.alignof().unwrap_or(8);
                    let rem = fn_comp.stack_offset % align;
                    if rem != 0 {
                        fn_comp.stack_offset += align - rem;
                    }

                    // Push address constant
                    let addr = fn_comp.stack_offset;
                    let pool_idx = fn_comp
                        .parent
                        .program
                        .push_const(ConstEntry::from_u64(addr));
                    fn_comp.emit(Instr::PushConst { pool_idx }, decl.location)?;
                    fn_comp.emit(Instr::StoreLocal { slot }, decl.location)?;

                    fn_comp.stack_offset += size;
                }
            }

            // Lower body statements
            for stmt in body {
                fn_comp.compile_stmt(stmt)?;
            }

            // Unconditional implicit return for void functions at end of block
            if *func_ty.return_type == Type::Void {
                fn_comp.verify_stack_depth(0, decl.location, "End of void function")?;
                fn_comp.emit(Instr::Return { has_value: false }, decl.location)?;
            } else {
                // If it is non-void but has no explicit return at the end, just halt or return default
                // to prevent falling off code vector
                fn_comp.verify_stack_depth(
                    0,
                    decl.location,
                    "End of non-void function (implicit return)",
                )?;
                let zero_idx = fn_comp.parent.program.push_const(ConstEntry::from_i64(0));
                fn_comp.emit(Instr::PushConst { pool_idx: zero_idx }, decl.location)?;
                fn_comp.emit(Instr::Return { has_value: true }, decl.location)?;
            }

            // Backpatch function details
            fn_comp.parent.program.func_table[func_idx as usize] = FuncEntry {
                name: var.id.to_string(),
                arity: func_ty.params.len() as u32,
                local_count: fn_comp.next_local_slot,
                code_offset: start_pc,
            };

            // Backpatch the Enter instruction's local_count!
            if let Instr::Enter {
                arity: _,
                local_count: ref mut lc,
            } = &mut fn_comp.parent.program.instructions[start_pc as usize]
            {
                *lc = fn_comp.next_local_slot;
            }

            // Backpatch gotos
            for (patch_pc, label_name, loc) in fn_comp.unresolved_gotos {
                if let Some(&target) = fn_comp.labels.get(&label_name) {
                    match &mut fn_comp.parent.program.instructions[patch_pc as usize] {
                        Instr::Jump { target: t }
                        | Instr::JumpIfFalse { target: t }
                        | Instr::JumpIfTrue { target: t } => {
                            *t = target;
                        }
                        _ => unreachable!(),
                    }
                } else {
                    return Err(LowerError {
                        location: loc,
                        node: label_name.to_string(),
                        explanation: format!("Label '{}' is undefined", label_name),
                    });
                }
            }
        }
    }

    Ok(compiler.program)
}

fn check_type_supported(ctype: &Type, loc: Location) -> Result<(), LowerError> {
    match ctype {
        Type::VaList => Err(LowerError {
            location: loc,
            node: "Type::VaList".to_string(),
            explanation: "va_list is not supported by Aether VM ISA".to_string(),
        }),
        Type::Union(_) => Err(LowerError {
            location: loc,
            node: "Type::Union".to_string(),
            explanation: "Unions are not supported by Aether VM ISA".to_string(),
        }),
        Type::Pointer(pointee, _) => check_type_supported(pointee, loc),
        Type::Array(elem, array_type) => {
            if matches!(array_type, ArrayType::Unbounded) {
                return Err(LowerError {
                    location: loc,
                    node: ctype.to_string(),
                    explanation: "Unbounded arrays (such as 'int a[]') are not supported by the VM"
                        .to_string(),
                });
            }
            check_type_supported(elem, loc)
        }
        Type::Function(func_ty) => {
            check_type_supported(&func_ty.return_type, loc)?;
            for param in &func_ty.params {
                check_type_supported(&param.get().ctype, loc)?;
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

// ---------------------------------------------------------------------------
// Statement Lowering
// ---------------------------------------------------------------------------

impl FnCompiler<'_> {
    fn compile_stmt(&mut self, stmt: &Stmt) -> Result<(), LowerError> {
        match &stmt.data {
            StmtType::Compound(stmts) => {
                for s in stmts {
                    self.compile_stmt(s)?;
                }
            }
            StmtType::Expr(expr) => {
                self.compile_expr(expr)?;
                // Pop result if non-void expression statement to prevent stack leaks
                if expr.ctype != Type::Void {
                    self.emit(Instr::Pop, stmt.location)?;
                }
            }
            StmtType::Return(maybe_expr) => {
                if let Some(expr) = maybe_expr {
                    self.compile_expr(expr)?;
                    self.verify_stack_depth(1, stmt.location, "Return statement (value)")?;
                    self.emit(Instr::Return { has_value: true }, stmt.location)?;
                } else {
                    self.verify_stack_depth(0, stmt.location, "Return statement (void)")?;
                    self.emit(Instr::Return { has_value: false }, stmt.location)?;
                }
            }
            StmtType::If(cond, then_stmt, else_stmt) => {
                self.compile_expr(cond)?;
                let jump_else_idx = self.emit(Instr::JumpIfFalse { target: 0 }, stmt.location)?;

                self.compile_stmt(then_stmt)?;

                if let Some(else_s) = else_stmt {
                    let jump_end_idx = self.emit(Instr::Jump { target: 0 }, stmt.location)?;
                    let else_target = self.parent.program.instructions.len() as u32;
                    self.backpatch(jump_else_idx, else_target);

                    self.compile_stmt(else_s)?;

                    let end_target = self.parent.program.instructions.len() as u32;
                    self.backpatch(jump_end_idx, end_target);
                } else {
                    let end_target = self.parent.program.instructions.len() as u32;
                    self.backpatch(jump_else_idx, end_target);
                }
            }
            StmtType::While(cond, body) => {
                let start_pc = self.parent.program.instructions.len() as u32;

                self.compile_expr(cond)?;
                let jump_end_idx = self.emit(Instr::JumpIfFalse { target: 0 }, stmt.location)?;

                self.break_targets.push(0); // placeholder for switch/loop end
                self.continue_targets.push(start_pc);

                self.compile_stmt(body)?;

                self.emit(Instr::Jump { target: start_pc }, stmt.location)?;

                let end_pc = self.parent.program.instructions.len() as u32;
                self.backpatch(jump_end_idx, end_pc);

                let break_idx = self.break_targets.pop().unwrap();
                // Resolve all breaks in this loop level
                self.resolve_break_placeholder_jumps(break_idx, end_pc);
                self.continue_targets.pop();
            }
            StmtType::Do(body, cond) => {
                let start_pc = self.parent.program.instructions.len() as u32;
                let cond_pc_placeholder = self.parent.program.instructions.len() as u32; // dummy

                self.break_targets.push(0);
                // Continue target is the condition check, which we'll record once reached
                self.continue_targets.push(cond_pc_placeholder);
                let continue_idx = self.continue_targets.len() - 1;

                self.compile_stmt(body)?;

                let cond_pc = self.parent.program.instructions.len() as u32;
                self.continue_targets[continue_idx] = cond_pc;

                self.compile_expr(cond)?;
                self.emit(Instr::JumpIfTrue { target: start_pc }, stmt.location)?;

                let end_pc = self.parent.program.instructions.len() as u32;
                let break_idx = self.break_targets.pop().unwrap();
                self.resolve_break_placeholder_jumps(break_idx, end_pc);
                self.continue_targets.pop();
            }
            StmtType::For(init, cond, post, body) => {
                self.compile_stmt(init)?;

                let start_pc = self.parent.program.instructions.len() as u32;

                let mut jump_end_idx = None;
                if let Some(c) = cond {
                    self.compile_expr(c)?;
                    jump_end_idx =
                        Some(self.emit(Instr::JumpIfFalse { target: 0 }, stmt.location)?);
                }

                self.break_targets.push(0);
                self.continue_targets.push(0); // continue target is post-expression PC
                let continue_idx = self.continue_targets.len() - 1;

                self.compile_stmt(body)?;

                // Post Loop Statement
                let post_pc = self.parent.program.instructions.len() as u32;
                self.continue_targets[continue_idx] = post_pc;

                if let Some(p) = post {
                    self.compile_expr(p)?;
                    if p.ctype != Type::Void {
                        self.emit(Instr::Pop, stmt.location)?;
                    }
                }

                self.emit(Instr::Jump { target: start_pc }, stmt.location)?;

                let end_pc = self.parent.program.instructions.len() as u32;
                if let Some(idx) = jump_end_idx {
                    self.backpatch(idx, end_pc);
                }

                let break_idx = self.break_targets.pop().unwrap();
                self.resolve_break_placeholder_jumps(break_idx, end_pc);
                self.continue_targets.pop();
            }
            StmtType::Switch(cond, body) => {
                self.compile_expr(cond)?;
                let cond_slot = self.new_temp_slot();
                self.emit(Instr::StoreLocal { slot: cond_slot }, stmt.location)?;

                // Emit placeholder dispatch jump
                let dispatch_jump_idx = self.emit(Instr::Jump { target: 0 }, stmt.location)?;

                let switch_info = SwitchInfo {
                    cond_slot,
                    dispatch_jump_pc: dispatch_jump_idx,
                    cases: Vec::new(),
                    default_pc: None,
                };
                self.switch_stack.push(switch_info);
                self.break_targets.push(0);

                self.compile_stmt(body)?;

                // Dispatch implementation
                let dispatch_pc = self.parent.program.instructions.len() as u32;
                self.backpatch(dispatch_jump_idx, dispatch_pc);

                let info = self.switch_stack.pop().unwrap();

                for (val, target) in info.cases {
                    // Check equal: cond_slot == val
                    self.emit(
                        Instr::LoadLocal {
                            slot: info.cond_slot,
                        },
                        stmt.location,
                    )?;
                    let pool_idx = self
                        .parent
                        .program
                        .push_const(ConstEntry::from_i64(val as i64));
                    self.emit(Instr::PushConst { pool_idx }, stmt.location)?;
                    self.emit(Instr::EqI, stmt.location)?;
                    self.emit(Instr::JumpIfTrue { target }, stmt.location)?;
                }

                let end_pc = if let Some(def_target) = info.default_pc {
                    self.emit(Instr::Jump { target: def_target }, stmt.location)?;
                    self.parent.program.instructions.len() as u32
                } else {
                    self.parent.program.instructions.len() as u32
                };

                let break_idx = self.break_targets.pop().unwrap();
                self.resolve_break_placeholder_jumps(break_idx, end_pc);
            }
            StmtType::Case(val, inner) => {
                let current_pc = self.parent.program.instructions.len() as u32;
                if let Some(info) = self.switch_stack.last_mut() {
                    info.cases.push((*val, current_pc));
                }
                self.compile_stmt(inner)?;
            }
            StmtType::Default(inner) => {
                let current_pc = self.parent.program.instructions.len() as u32;
                if let Some(info) = self.switch_stack.last_mut() {
                    info.default_pc = Some(current_pc);
                }
                self.compile_stmt(inner)?;
            }
            StmtType::Label(name, inner) => {
                let current_pc = self.parent.program.instructions.len() as u32;
                self.labels.insert(*name, current_pc);
                self.compile_stmt(inner)?;
            }
            StmtType::Goto(name) => {
                let idx = self.emit(Instr::Jump { target: 0 }, stmt.location)?;
                self.unresolved_gotos.push((idx, *name, stmt.location));
            }
            StmtType::Break => {
                // Emit placeholder break jump: Jump { target: break_idx }
                // where the target slot will hold a linked list of break instruction offsets
                let innermost_break_idx = self.break_targets.len() - 1;
                let current_placeholder = self.break_targets[innermost_break_idx];
                let idx = self.emit(
                    Instr::Jump {
                        target: current_placeholder,
                    },
                    stmt.location,
                )?;
                self.break_targets[innermost_break_idx] = idx;
            }
            StmtType::Continue => {
                let target_pc = *self.continue_targets.last().ok_or_else(|| LowerError {
                    location: stmt.location,
                    node: "continue".to_string(),
                    explanation: "continue statement outside of loop context".to_string(),
                })?;
                self.emit(Instr::Jump { target: target_pc }, stmt.location)?;
            }
            StmtType::Decl(decls) => {
                for d in decls {
                    let slot = *self
                        .local_map
                        .get(&d.data.symbol)
                        .ok_or_else(|| LowerError {
                            location: d.location,
                            node: format!("{:?}", d.data.symbol),
                            explanation: "Local symbol slot map mismatch".to_string(),
                        })?;

                    if let Some(init) = &d.data.init {
                        match init {
                            Initializer::Scalar(expr) => {
                                let is_desugar_ptr =
                                    if let Type::Pointer(pointee, _) = &d.data.symbol.get().ctype {
                                        **pointee == expr.ctype
                                    } else {
                                        false
                                    };

                                if is_desugar_ptr && expr.lval {
                                    self.compile_lval_address(expr)?;
                                } else {
                                    self.compile_expr(expr)?;
                                }
                                self.emit(Instr::StoreLocal { slot }, d.location)?;
                            }
                            Initializer::InitializerList(list) => {
                                let ctype = &d.data.symbol.get().ctype;
                                let elem_width = match ctype {
                                    Type::Array(t, _) => t.sizeof().unwrap_or(8),
                                    _ => 8,
                                };

                                for (idx, elem) in list.iter().enumerate() {
                                    if let Initializer::Scalar(expr) = elem {
                                        // Compute and save the destination address first.
                                        self.emit(Instr::LoadLocal { slot }, d.location)?;
                                        let offset = idx as u64 * elem_width;
                                        let pool_idx = self
                                            .parent
                                            .program
                                            .push_const(ConstEntry::from_u64(offset));
                                        self.emit(Instr::PushConst { pool_idx }, d.location)?;
                                        self.emit(Instr::AddU, d.location)?;
                                        let temp_addr = self.new_temp_slot();
                                        self.emit(
                                            Instr::StoreLocal { slot: temp_addr },
                                            d.location,
                                        )?;

                                        // Compile initializer expression
                                        self.compile_expr(expr)?;

                                        // Store through pointer
                                        self.emit(
                                            Instr::PtrStore {
                                                ptr_slot: temp_addr,
                                                elem_width: elem_width as u8,
                                            },
                                            d.location,
                                        )?;
                                    } else {
                                        return Err(LowerError {
                                            location: d.location,
                                            node: format!("{:?}", elem),
                                            explanation:
                                                "Nested local array initializers are not supported"
                                                    .to_string(),
                                        });
                                    }
                                }
                            }
                            Initializer::FunctionBody(_) => unreachable!(),
                        }
                    }
                }
            }
        }
        Ok(())
    }

    fn backpatch(&mut self, instr_pc: u32, target: u32) {
        match &mut self.parent.program.instructions[instr_pc as usize] {
            Instr::Jump { target: t }
            | Instr::JumpIfFalse { target: t }
            | Instr::JumpIfTrue { target: t } => {
                *t = target;
            }
            _ => unreachable!(),
        }
    }

    fn resolve_break_placeholder_jumps(&mut self, mut break_head_pc: u32, target: u32) {
        while break_head_pc != 0 {
            let next = match &self.parent.program.instructions[break_head_pc as usize] {
                Instr::Jump { target: t } => *t,
                _ => unreachable!(),
            };
            self.backpatch(break_head_pc, target);
            break_head_pc = next;
        }
    }
}

// ---------------------------------------------------------------------------
// Expression Lowering
// ---------------------------------------------------------------------------

impl FnCompiler<'_> {
    fn compile_expr(&mut self, expr: &Expr) -> Result<(), LowerError> {
        let location = expr.location;

        if expr.lval {
            if matches!(expr.ctype, Type::Pointer(_, _)) {
                match &expr.expr {
                    ExprType::Id(sym) if matches!(sym.get().ctype, Type::Array(_, _)) => {
                        self.compile_lval_address(expr)?;
                        return Ok(());
                    }
                    ExprType::Binary(op, left, right) => {
                        self.compile_expr(left)?;
                        self.compile_expr(right)?;
                        self.emit_binary_op(*op, &left.ctype)?;
                        return Ok(());
                    }
                    ExprType::Cast(inner) => {
                        self.compile_expr(inner)?;
                        self.emit_cast(&inner.ctype, &expr.ctype, location)?;
                        return Ok(());
                    }
                    ExprType::Noop(inner) => {
                        self.compile_expr(inner)?;
                        return Ok(());
                    }
                    _ => {}
                }
            }

            if let ExprType::Deref(ptr) = &expr.expr {
                if let ExprType::Binary(BinaryOp::Add, left, right) = &ptr.expr {
                    if let Some((base_sym, index_expr)) = try_match_array_access(left, right) {
                        if let Some(&base_slot) = self.local_map.get(&base_sym) {
                            if let Type::Array(elem_ty, ArrayType::Fixed(len)) =
                                &base_sym.get().ctype
                            {
                                let size = elem_ty.sizeof().unwrap_or(8);

                                self.compile_array_index_expr(index_expr, size)?;

                                let len_slot = self.new_temp_slot();
                                let pool_idx =
                                    self.parent.program.push_const(ConstEntry::from_u64(*len));
                                self.emit(Instr::PushConst { pool_idx }, location)?;
                                self.emit(Instr::StoreLocal { slot: len_slot }, location)?;

                                self.emit(
                                    Instr::ArrayLoad {
                                        base_slot,
                                        elem_width: size as u8,
                                        array_len_slot: len_slot,
                                    },
                                    location,
                                )?;
                                return Ok(());
                            }
                        }
                    }
                }

                self.compile_pointer_address_expr(ptr)?;
                let size = expr.ctype.sizeof().map_err(|e| LowerError {
                    location,
                    node: format!("{:?}", expr),
                    explanation: format!("Invalid pointer dereference size: {}", e),
                })? as u8;

                let temp_addr = self.new_temp_slot();
                self.emit(Instr::StoreLocal { slot: temp_addr }, location)?;
                self.emit(
                    Instr::PtrLoad {
                        ptr_slot: temp_addr,
                        elem_width: size,
                    },
                    location,
                )?;
                return Ok(());
            }

            // Evaluates to value of lvalue
            // Check if it is Deref(Id(sym)) of a register local variable
            if let ExprType::Deref(ptr) = &expr.expr {
                if let ExprType::Id(sym) = &ptr.expr {
                    if let Some(&slot) = self.local_map.get(sym) {
                        if !self.is_sym_stack_allocated(*sym) {
                            self.emit(Instr::LoadLocal { slot }, location)?;
                            return Ok(());
                        }
                    }
                }
            }

            if let ExprType::Id(sym) = &expr.expr {
                if let Some(&slot) = self.local_map.get(sym) {
                    if !self.is_sym_stack_allocated(*sym) {
                        self.emit(Instr::LoadLocal { slot }, location)?;
                        return Ok(());
                    }
                }
            }

            self.compile_lval_address(expr)?;
            let size = expr.ctype.sizeof().map_err(|e| LowerError {
                location,
                node: format!("{:?}", expr),
                explanation: format!("Invalid lvalue type size: {}", e),
            })? as u8;

            let temp_addr = self.new_temp_slot();
            self.emit(Instr::StoreLocal { slot: temp_addr }, location)?;
            self.emit(
                Instr::PtrLoad {
                    ptr_slot: temp_addr,
                    elem_width: size,
                },
                location,
            )?;
            return Ok(());
        }

        // Rvalue compilations
        #[allow(unreachable_patterns)]
        match &expr.expr {
            ExprType::Literal(_lit) => {
                let val = eval_constant(expr, self.parent)?;
                let pool_idx = self.parent.program.push_const(ConstEntry { bits: val });
                self.emit(Instr::PushConst { pool_idx }, location)?;
            }
            ExprType::Id(sym) => {
                if let Some(&slot) = self.local_map.get(sym) {
                    self.emit(Instr::LoadLocal { slot }, location)?;
                } else if let Some(&global_idx) = self.parent.global_map.get(sym) {
                    if is_array_or_struct(&sym.get().ctype) {
                        let addr = global_idx as u64 * 8;
                        let pool_idx = self.parent.program.push_const(ConstEntry::from_u64(addr));
                        self.emit(Instr::PushConst { pool_idx }, location)?;
                    } else {
                        self.emit(Instr::LoadGlobal { global_idx }, location)?;
                    }
                } else if let Some(&func_idx) = self.parent.func_map.get(sym) {
                    let pool_idx = self
                        .parent
                        .program
                        .push_const(ConstEntry::from_u64(func_idx as u64));
                    self.emit(Instr::PushConst { pool_idx }, location)?;
                } else {
                    return Err(LowerError {
                        location,
                        node: format!("{:?}", sym),
                        explanation: format!("Undefined symbol '{}'", sym.get().id),
                    });
                }
            }
            ExprType::Deref(ptr) => {
                // Check if it is a register local variable dereference (implicit rvalue conversion)
                if let ExprType::Id(sym) = &ptr.expr {
                    if let Some(&slot) = self.local_map.get(sym) {
                        if !self.is_sym_stack_allocated(*sym)
                            && !matches!(ptr.ctype, Type::Pointer(_, _))
                        {
                            self.emit(Instr::LoadLocal { slot }, location)?;
                            return Ok(());
                        }
                    }
                }

                // If it is not an lvalue dereference (e.g. array decayed/cast to pointer dereference),
                // evaluate ptr to address and load.
                // Wait! Pattern-matching safe array access: Deref(Binary(Add, base, index))
                if let ExprType::Binary(BinaryOp::Add, left, right) = &ptr.expr {
                    if let Some((base_sym, index_expr)) = try_match_array_access(left, right) {
                        if let Some(&base_slot) = self.local_map.get(&base_sym) {
                            if let Type::Array(elem_ty, ArrayType::Fixed(len)) =
                                &base_sym.get().ctype
                            {
                                let size = elem_ty.sizeof().unwrap_or(8);

                                // Compile index (index_expr)
                                self.compile_array_index_expr(index_expr, size)?;

                                // Allocate len slot
                                let len_slot = self.new_temp_slot();
                                let pool_idx =
                                    self.parent.program.push_const(ConstEntry::from_u64(*len));
                                self.emit(Instr::PushConst { pool_idx }, location)?;
                                self.emit(Instr::StoreLocal { slot: len_slot }, location)?;

                                // Emit safe ArrayLoad bounds check instruction!
                                self.emit(
                                    Instr::ArrayLoad {
                                        base_slot,
                                        elem_width: size as u8,
                                        array_len_slot: len_slot,
                                    },
                                    location,
                                )?;
                                return Ok(());
                            }
                        }
                    }
                }

                // Standard pointer load fallback
                self.compile_pointer_address_expr(ptr)?;
                let size = expr.ctype.sizeof().map_err(|e| LowerError {
                    location,
                    node: format!("{:?}", expr),
                    explanation: format!("Invalid pointer dereference size: {}", e),
                })? as u8;

                let temp_addr = self.new_temp_slot();
                self.emit(Instr::StoreLocal { slot: temp_addr }, location)?;
                self.emit(
                    Instr::PtrLoad {
                        ptr_slot: temp_addr,
                        elem_width: size,
                    },
                    location,
                )?;
            }
            ExprType::Binary(BinaryOp::Assign, lhs, rhs) => {
                self.compile_expr(rhs)?;
                self.emit(Instr::Dup, location)?; // Keep assigned value on stack for assignment expression

                let mut stored = false;
                if let ExprType::Deref(ptr) = &lhs.expr {
                    if let ExprType::Id(sym) = &ptr.expr {
                        if let Some(&slot) = self.local_map.get(sym) {
                            if !self.is_sym_stack_allocated(*sym) {
                                self.emit(Instr::StoreLocal { slot }, location)?;
                                stored = true;
                            }
                        }
                    }
                }

                if !stored {
                    if let ExprType::Id(sym) = &lhs.expr {
                        if let Some(&slot) = self.local_map.get(sym) {
                            if !self.is_sym_stack_allocated(*sym) {
                                self.emit(Instr::StoreLocal { slot }, location)?;
                                stored = true;
                            }
                        } else if let Some(&global_idx) = self.parent.global_map.get(sym) {
                            if !is_array_or_struct(&lhs.ctype) {
                                self.emit(Instr::StoreGlobal { global_idx }, location)?;
                                stored = true;
                            }
                        }
                    }
                }

                if stored {
                    return Ok(());
                }

                // General memory store (ArrayStore / PtrStore check)
                if let ExprType::Deref(ptr) = &lhs.expr {
                    if let ExprType::Binary(BinaryOp::Add, left, right) = &ptr.expr {
                        if let Some((base_sym, index_expr)) = try_match_array_access(left, right) {
                            if let Some(&base_slot) = self.local_map.get(&base_sym) {
                                if let Type::Array(elem_ty, ArrayType::Fixed(len)) =
                                    &base_sym.get().ctype
                                {
                                    let size = elem_ty.sizeof().unwrap_or(8);

                                    // Pushes index to stack (value is already below it, so now stack has [value, index])
                                    self.compile_array_index_expr(index_expr, size)?;
                                    self.emit(Instr::Swap, location)?;

                                    let len_slot = self.new_temp_slot();
                                    let pool_idx =
                                        self.parent.program.push_const(ConstEntry::from_u64(*len));
                                    self.emit(Instr::PushConst { pool_idx }, location)?;
                                    self.emit(Instr::StoreLocal { slot: len_slot }, location)?;

                                    self.emit(
                                        Instr::ArrayStore {
                                            base_slot,
                                            elem_width: size as u8,
                                            array_len_slot: len_slot,
                                        },
                                        location,
                                    )?;
                                    return Ok(());
                                }
                            }
                        }
                    }
                }

                // General PtrStore fallback
                self.compile_lval_address(lhs)?;
                let temp_addr = self.new_temp_slot();
                self.emit(Instr::StoreLocal { slot: temp_addr }, location)?;

                let size = lhs.ctype.sizeof().map_err(|e| LowerError {
                    location,
                    node: format!("{:?}", lhs),
                    explanation: format!("Invalid lvalue assign type size: {}", e),
                })? as u8;

                self.emit(
                    Instr::PtrStore {
                        ptr_slot: temp_addr,
                        elem_width: size,
                    },
                    location,
                )?;
            }
            ExprType::Binary(BinaryOp::LogicalAnd, left, right) => {
                self.compile_expr(left)?;
                self.emit(Instr::Dup, location)?;

                let else_idx = self.emit(Instr::JumpIfFalse { target: 0 }, location)?;
                self.emit(Instr::Pop, location)?;

                self.compile_expr(right)?;
                self.emit(Instr::LogNot, location)?;
                self.emit(Instr::LogNot, location)?; // Normalize to 0 or 1

                let end_pc = self.parent.program.instructions.len() as u32;
                self.backpatch(else_idx, end_pc);
            }
            ExprType::Binary(BinaryOp::LogicalOr, left, right) => {
                self.compile_expr(left)?;
                self.emit(Instr::Dup, location)?;

                let true_idx = self.emit(Instr::JumpIfTrue { target: 0 }, location)?;
                self.emit(Instr::Pop, location)?;

                self.compile_expr(right)?;
                self.emit(Instr::LogNot, location)?;
                self.emit(Instr::LogNot, location)?;

                let end_idx = self.emit(Instr::Jump { target: 0 }, location)?;
                let true_target = self.parent.program.instructions.len() as u32;
                self.backpatch(true_idx, true_target);

                self.emit(Instr::Pop, location)?; // Pop original non-zero value
                let one_idx = self.parent.program.push_const(ConstEntry::from_i64(1));
                self.emit(Instr::PushConst { pool_idx: one_idx }, location)?;

                let end_target = self.parent.program.instructions.len() as u32;
                self.backpatch(end_idx, end_target);
            }
            ExprType::Binary(op, left, right) => {
                self.compile_expr(left)?;
                self.compile_expr(right)?;
                self.emit_binary_op(*op, &left.ctype)?;
            }
            ExprType::Negate(inner) => {
                self.compile_expr(inner)?;
                match &inner.ctype {
                    Type::Double | Type::Float => {
                        self.emit(Instr::NegF, location)?;
                    }
                    _ => {
                        self.emit(Instr::NegI, location)?;
                    }
                }
            }
            ExprType::BitwiseNot(inner) => {
                self.compile_expr(inner)?;
                self.emit(Instr::BitNot, location)?;
            }
            ExprType::Cast(inner) => {
                self.compile_expr(inner)?;
                self.emit_cast(&inner.ctype, &expr.ctype, location)?;
            }
            ExprType::Ternary(cond, then_expr, else_expr) => {
                self.compile_expr(cond)?;
                let else_idx = self.emit(Instr::JumpIfFalse { target: 0 }, location)?;

                self.compile_expr(then_expr)?;
                let end_idx = self.emit(Instr::Jump { target: 0 }, location)?;

                let else_pc = self.parent.program.instructions.len() as u32;
                self.backpatch(else_idx, else_pc);

                self.compile_expr(else_expr)?;

                let end_pc = self.parent.program.instructions.len() as u32;
                self.backpatch(end_idx, end_pc);
            }
            ExprType::FuncCall(func, args) => {
                let mut is_builtin = false;
                if let ExprType::Id(sym) = &func.expr {
                    let name = sym.get().id.to_string();
                    if name == "putchar" {
                        for arg in args {
                            self.compile_expr(arg)?;
                        }
                        self.emit(Instr::PrintChar, location)?;
                        is_builtin = true;
                    } else if name == "print_int" {
                        for arg in args {
                            self.compile_expr(arg)?;
                        }
                        self.emit(Instr::PrintI, location)?;
                        is_builtin = true;
                    }
                }

                if !is_builtin {
                    for arg in args {
                        self.compile_expr(arg)?;
                    }

                    let mut is_direct = false;
                    if let ExprType::Id(sym) = &func.expr {
                        if let Some(&func_idx) = self.parent.func_map.get(sym) {
                            self.emit(
                                Instr::Call {
                                    func_idx,
                                    arg_count: args.len() as u32,
                                },
                                location,
                            )?;
                            is_direct = true;
                        }
                    }

                    if !is_direct {
                        self.compile_expr(func)?;
                        self.emit(
                            Instr::CallIndirect {
                                arg_count: args.len() as u32,
                            },
                            location,
                        )?;
                    }
                }

                // If function call returns non-void, it pushes 1 value to the stack
                if expr.ctype != Type::Void {
                    self.current_stack_depth += 1;
                    self.max_stack_depth = self.max_stack_depth.max(self.current_stack_depth);
                }
            }
            ExprType::Member(compound, member) => {
                self.compile_lval_address(compound)?;
                let offset = match &compound.ctype {
                    Type::Struct(s) | Type::Union(s) => struct_member_offset(s, *member),
                    _ => {
                        return Err(LowerError {
                            location,
                            node: compound.to_string(),
                            explanation: "Trying to access member of non-struct/non-union type"
                                .to_string(),
                        })
                    }
                };

                let pool_idx = self.parent.program.push_const(ConstEntry::from_u64(offset));
                self.emit(Instr::PushConst { pool_idx }, location)?;
                self.emit(Instr::AddU, location)?;

                let size = expr.ctype.sizeof().map_err(|e| LowerError {
                    location,
                    node: expr.to_string(),
                    explanation: format!("Invalid struct member type size: {}", e),
                })? as u8;

                let temp_addr = self.new_temp_slot();
                self.emit(Instr::StoreLocal { slot: temp_addr }, location)?;
                self.emit(
                    Instr::PtrLoad {
                        ptr_slot: temp_addr,
                        elem_width: size,
                    },
                    location,
                )?;
            }
            ExprType::PostIncrement(inner, is_inc) => {
                let temp_addr = self.new_temp_slot();
                self.compile_lval_address(inner)?;
                self.emit(Instr::StoreLocal { slot: temp_addr }, location)?;

                let size = inner.ctype.sizeof().map_err(|e| LowerError {
                    location,
                    node: inner.to_string(),
                    explanation: format!("Invalid post-increment type size: {}", e),
                })? as u8;

                self.emit(
                    Instr::PtrLoad {
                        ptr_slot: temp_addr,
                        elem_width: size,
                    },
                    location,
                )?;
                self.emit(Instr::Dup, location)?;

                let pool_idx = self.parent.program.push_const(ConstEntry::from_i64(1));
                self.emit(Instr::PushConst { pool_idx }, location)?;

                if *is_inc {
                    self.emit_binary_op(BinaryOp::Add, &inner.ctype)?;
                } else {
                    self.emit_binary_op(BinaryOp::Sub, &inner.ctype)?;
                }

                self.emit(
                    Instr::PtrStore {
                        ptr_slot: temp_addr,
                        elem_width: size,
                    },
                    location,
                )?;
            }
            ExprType::Comma(left, right) => {
                self.compile_expr(left)?;
                if left.ctype != Type::Void {
                    self.emit(Instr::Pop, location)?;
                }
                self.compile_expr(right)?;
            }
            ExprType::StaticRef(inner) => {
                // AddressOf in static contexts or global references
                self.compile_lval_address(inner)?;
            }
            ExprType::Noop(inner) => {
                self.compile_expr(inner)?;
            }
            ExprType::Sizeof(ty) => {
                let size = ty.sizeof().unwrap_or(8);
                let pool_idx = self.parent.program.push_const(ConstEntry::from_u64(size));
                self.emit(Instr::PushConst { pool_idx }, location)?;
            }
            _ => {
                return Err(LowerError {
                    location,
                    node: format!("{:?}", expr.expr),
                    explanation: "Unsupported expression HIR node kind".to_string(),
                });
            }
        }

        Ok(())
    }

    /// Evaluates the address of an lvalue expression and pushes it to the stack
    fn compile_lval_address(&mut self, expr: &Expr) -> Result<(), LowerError> {
        let location = expr.location;

        match &expr.expr {
            ExprType::Id(sym) => {
                if let Some(&slot) = self.local_map.get(sym) {
                    let is_stack = self.is_sym_stack_allocated(*sym);
                    if is_stack {
                        self.emit(Instr::LoadLocal { slot }, location)?;
                    } else {
                        return Err(LowerError {
                            location,
                            node: expr.to_string(),
                            explanation: "Cannot take address of local register variable"
                                .to_string(),
                        });
                    }
                } else if let Some(&global_idx) = self.parent.global_map.get(sym) {
                    let addr = global_idx as u64 * 8;
                    let pool_idx = self.parent.program.push_const(ConstEntry::from_u64(addr));
                    self.emit(Instr::PushConst { pool_idx }, location)?;
                } else {
                    return Err(LowerError {
                        location,
                        node: expr.to_string(),
                        explanation: "Symbol is not an lvalue".to_string(),
                    });
                }
            }
            ExprType::Deref(ptr) => {
                self.compile_pointer_address_expr(ptr)?;
            }
            ExprType::Member(compound, member) => {
                self.compile_lval_address(compound)?;
                let offset = match &compound.ctype {
                    Type::Struct(s) | Type::Union(s) => struct_member_offset(s, *member),
                    _ => {
                        return Err(LowerError {
                            location,
                            node: compound.to_string(),
                            explanation: "Cannot take member offset of non-struct/non-union"
                                .to_string(),
                        })
                    }
                };
                let pool_idx = self.parent.program.push_const(ConstEntry::from_u64(offset));
                self.emit(Instr::PushConst { pool_idx }, location)?;
                self.emit(Instr::AddU, location)?;
            }
            ExprType::Noop(inner) => {
                self.compile_lval_address(inner)?;
            }
            _ => {
                return Err(LowerError {
                    location,
                    node: expr.to_string(),
                    explanation: "Expression is not an lvalue".to_string(),
                });
            }
        }

        Ok(())
    }

    fn compile_array_index_expr(
        &mut self,
        scaled_index_expr: &Expr,
        elem_width: u64,
    ) -> Result<(), LowerError> {
        if let ExprType::Binary(BinaryOp::Mul, left, right) = &scaled_index_expr.expr {
            if eval_constant(left, self.parent).ok() == Some(elem_width) {
                return self.compile_expr(right);
            }
            if eval_constant(right, self.parent).ok() == Some(elem_width) {
                return self.compile_expr(left);
            }
        }

        self.compile_expr(scaled_index_expr)
    }

    fn compile_pointer_address_expr(&mut self, expr: &Expr) -> Result<(), LowerError> {
        let location = expr.location;

        match &expr.expr {
            ExprType::Id(sym) if matches!(sym.get().ctype, Type::Array(_, _)) => {
                self.compile_lval_address(expr)
            }
            ExprType::Binary(op, left, right) => {
                self.compile_pointer_address_expr(left)?;
                self.compile_expr(right)?;
                self.emit_binary_op(*op, &left.ctype)
            }
            ExprType::Cast(inner) => {
                self.compile_pointer_address_expr(inner)?;
                self.emit_cast(&inner.ctype, &expr.ctype, location)
            }
            ExprType::Noop(inner) => self.compile_pointer_address_expr(inner),
            _ => self.compile_expr(expr),
        }
    }

    fn emit_binary_op(&mut self, op: BinaryOp, left_type: &Type) -> Result<(), LowerError> {
        let loc = Location::default();
        let is_float = matches!(left_type, Type::Double | Type::Float);

        match op {
            BinaryOp::Add => {
                if is_float {
                    self.emit(Instr::AddF, loc)?;
                } else if is_signed_integral(left_type) {
                    self.emit(Instr::AddI, loc)?;
                } else {
                    self.emit(Instr::AddU, loc)?;
                }
            }
            BinaryOp::Sub => {
                if is_float {
                    self.emit(Instr::SubF, loc)?;
                } else if is_signed_integral(left_type) {
                    self.emit(Instr::SubI, loc)?;
                } else {
                    self.emit(Instr::SubU, loc)?;
                }
            }
            BinaryOp::Mul => {
                if is_float {
                    self.emit(Instr::MulF, loc)?;
                } else if is_signed_integral(left_type) {
                    self.emit(Instr::MulI, loc)?;
                } else {
                    self.emit(Instr::MulU, loc)?;
                }
            }
            BinaryOp::Div => {
                if is_float {
                    self.emit(Instr::DivF, loc)?;
                } else if is_signed_integral(left_type) {
                    self.emit(Instr::DivI, loc)?;
                } else {
                    self.emit(Instr::DivU, loc)?;
                }
            }
            BinaryOp::Mod => {
                if is_signed_integral(left_type) {
                    self.emit(Instr::RemI, loc)?;
                } else {
                    self.emit(Instr::RemU, loc)?;
                }
            }
            BinaryOp::Shl => {
                self.emit(Instr::Shl, loc)?;
            }
            BinaryOp::Shr => {
                if is_signed_integral(left_type) {
                    self.emit(Instr::ShrI, loc)?;
                } else {
                    self.emit(Instr::ShrU, loc)?;
                }
            }
            BinaryOp::BitwiseAnd => {
                self.emit(Instr::BitAnd, loc)?;
            }
            BinaryOp::BitwiseOr => {
                self.emit(Instr::BitOr, loc)?;
            }
            BinaryOp::Xor => {
                self.emit(Instr::BitXor, loc)?;
            }
            BinaryOp::Compare(comp) => {
                self.emit_compare_op(comp, left_type)?;
            }
            _ => {
                return Err(LowerError {
                    location: loc,
                    node: format!("{:?}", op),
                    explanation: "Unsupported binary operation".to_string(),
                })
            }
        };
        Ok(())
    }

    fn emit_compare_op(
        &mut self,
        comp: ComparisonToken,
        left_type: &Type,
    ) -> Result<(), LowerError> {
        let loc = Location::default();
        let is_float = matches!(left_type, Type::Double | Type::Float);

        match comp {
            ComparisonToken::EqualEqual => {
                if is_float {
                    self.emit(Instr::EqF, loc)?;
                } else {
                    self.emit(Instr::EqI, loc)?;
                }
            }
            ComparisonToken::NotEqual => {
                if is_float {
                    self.emit(Instr::NeF, loc)?;
                } else {
                    self.emit(Instr::NeI, loc)?;
                }
            }
            ComparisonToken::Less => {
                if is_float {
                    self.emit(Instr::LtF, loc)?;
                } else if is_signed_integral(left_type) {
                    self.emit(Instr::LtI, loc)?;
                } else {
                    self.emit(Instr::LtU, loc)?;
                }
            }
            ComparisonToken::LessEqual => {
                if is_float {
                    self.emit(Instr::LeF, loc)?;
                } else if is_signed_integral(left_type) {
                    self.emit(Instr::LeI, loc)?;
                } else {
                    self.emit(Instr::LeU, loc)?;
                }
            }
            ComparisonToken::Greater => {
                if is_float {
                    self.emit(Instr::GtF, loc)?;
                } else if is_signed_integral(left_type) {
                    self.emit(Instr::GtI, loc)?;
                } else {
                    self.emit(Instr::GtU, loc)?;
                }
            }
            ComparisonToken::GreaterEqual => {
                if is_float {
                    self.emit(Instr::GeF, loc)?;
                } else if is_signed_integral(left_type) {
                    self.emit(Instr::GeI, loc)?;
                } else {
                    self.emit(Instr::GeU, loc)?;
                }
            }
        };
        Ok(())
    }

    fn emit_cast(&mut self, from: &Type, to: &Type, loc: Location) -> Result<(), LowerError> {
        let from_float = matches!(from, Type::Double | Type::Float);
        let to_float = matches!(to, Type::Double | Type::Float);

        if from_float && !to_float {
            if is_signed_integral(to) {
                self.emit(Instr::F64ToI64, loc)?;
            } else {
                self.emit(Instr::F64ToU64, loc)?;
            }
        } else if !from_float && to_float {
            if is_signed_integral(from) {
                self.emit(Instr::I64ToF64, loc)?;
            } else {
                self.emit(Instr::U64ToF64, loc)?;
            }
        } else if !from_float && !to_float {
            // Integer to integer casting
            let to_size = to.sizeof().unwrap_or(8);
            if to_size < 8 {
                let bits = (to_size * 8) as u8;
                if is_signed_integral(to) {
                    self.emit(Instr::SignExtend { bits }, loc)?;
                } else {
                    self.emit(Instr::ZeroExtend { bits }, loc)?;
                }
            }
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn is_array_or_struct(ctype: &Type) -> bool {
    matches!(ctype, Type::Array(_, _) | Type::Struct(_) | Type::Union(_))
}

fn is_signed_integral(ctype: &Type) -> bool {
    match ctype {
        Type::Char(signed) | Type::Short(signed) | Type::Int(signed) | Type::Long(signed) => {
            *signed
        }
        Type::Enum(_, _) => true,
        _ => false,
    }
}

/// Safely match a base pointer symbol and index expression from left/right addition operands
fn try_match_array_access<'b>(left: &'b Expr, right: &'b Expr) -> Option<(Symbol, &'b Expr)> {
    if let ExprType::Id(sym) = &left.expr {
        if matches!(sym.get().ctype, Type::Array(_, _)) {
            return Some((*sym, right));
        }
    }
    if let ExprType::Id(sym) = &right.expr {
        if matches!(sym.get().ctype, Type::Array(_, _)) {
            return Some((*sym, left));
        }
    }
    // Also support pointer decaying checks
    None
}

fn eval_constant(expr: &Expr, compiler: &mut Compiler) -> Result<u64, LowerError> {
    match &expr.expr {
        ExprType::Literal(lit) => match lit {
            aether_parser::data::hir::LiteralValue::Int(i) => Ok(*i as u64),
            aether_parser::data::hir::LiteralValue::UnsignedInt(u) => Ok(*u),
            aether_parser::data::hir::LiteralValue::Float(f) => Ok(f.to_bits()),
            aether_parser::data::hir::LiteralValue::Char(c) => Ok(*c as u64),
            aether_parser::data::hir::LiteralValue::Str(bytes) => {
                let addr = compiler.allocate_string_literal(bytes);
                Ok(addr)
            }
        },
        ExprType::StaticRef(inner) => {
            if let ExprType::Id(sym) = &inner.expr {
                if let Some(&idx) = compiler.global_map.get(sym) {
                    return Ok(idx as u64 * 8);
                }
            }
            Err(LowerError {
                location: expr.location,
                node: format!("{:?}", expr.expr),
                explanation: "Only static addresses of global variables are supported".to_string(),
            })
        }
        ExprType::Cast(inner) => eval_constant(inner, compiler),
        ExprType::Noop(inner) => eval_constant(inner, compiler),
        _ => Err(LowerError {
            location: expr.location,
            node: format!("{:?}", expr.expr),
            explanation: "Expression is not a compile-time constant".to_string(),
        }),
    }
}

fn struct_member_offset(
    struct_type: &StructType,
    member: aether_parser::intern::InternedStr,
) -> u64 {
    let members = struct_type.members();
    let mut current_offset = 0;
    for formal in members.iter() {
        if formal.id == member {
            return current_offset;
        }
        let align = formal.ctype.alignof().unwrap_or(8);
        let rem = current_offset % align;
        if rem != 0 {
            current_offset += align - rem;
        }
        current_offset += formal.ctype.sizeof().unwrap_or(8);
    }
    0
}
