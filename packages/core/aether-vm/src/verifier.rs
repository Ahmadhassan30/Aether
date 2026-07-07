//! # Aether VM — Bytecode Verifier
//!
//! This module implements bytecode verification for Aether VM programs.
//! The verifier ensures that all program instructions satisfy basic safety
//! invariants (such as jump targets within bounds, valid constant pool indices,
//! valid function indices, and local slot boundaries) before the interpreter
//! starts executing.

use crate::program::Program;

/// Validate structural invariants of the compiled Aether Program bytecode.
///
/// Returns `Ok(())` on success, or `Err(Vec<String>)` containing human-readable
/// diagnostic verification errors.
pub fn verify(program: &Program) -> Result<(), Vec<String>> {
    program.validate()
}
