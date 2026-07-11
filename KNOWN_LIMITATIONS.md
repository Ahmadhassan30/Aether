# Aether — Known Compiler & Virtual Machine Limitations

This document maps all known unimplemented features, divergence points between backends, and virtual machine limitations in the Aether codebase.

---

## 1. Virtual Machine (aether-vm) ISA Limitations

The Aether Virtual Machine (`aether-vm`) is a stack-based interpreter designed to run entirely in the browser. It does not map 1:1 to the native x86_64 target.

- **Union Types**: Unions are explicitly rejected by the VM's lowering pass (`aether-vm/src/lower.rs`). There is no memory layout support for overlapping union fields in the stack-based VM.
- **Variadic Functions (`va_list`)**: The VM does not support variable arguments (`va_list` or `stdarg.h` macros) during lowering, and attempts to lower them will fail.
- **Aggregates by Value**: Struct parameters or struct return values passed by value are not supported. Only scalar values (integers, floats, pointers) are supported as function parameters/returns on the operand stack.
- **External Declarations without Bodies**: Declaring a function without a body (e.g., `int puts(const char *);`) and attempting to call it will cause the VM to panic. The VM's call mechanism expects `local_count` to be at least `arity`, but external declarations without bodies compile with `local_count = 0`.

---

## 2. Compiler & Codegen Limitations

- **Float Initializers & Casts**: Floating-point constants are supported, but compile-time evaluation and casting of complex floating-point expressions in static initializers are restricted. 
- **Legacy Numeric Methods**: The codebase avoids standard library legacy numeric methods (`max_value()` and type-prefix constants like `std::i64::MIN`), instead resolving to modern associated constants (e.g., `i64::MIN`, `usize::MAX`).
- **Target Calling Convention Divergence**: Cranelift IR code generation uses target-dependent calling conventions (`windows_fastcall` on Windows hosts, `system_v` on UNIX hosts and WebAssembly target). These are syntactically different but represent the same semantic compiler logic.

---

## 3. The JIT Compiler vs. Bytecode VM Split

Aether maintains two distinct execution backends for different visualizer panels:

1. **Native JIT Compiler (`aether-codegen`)**:
   - Compiles AST/HIR directly to native machine instructions (e.g. x86_64 or AArch64 assembly) via Cranelift.
   - Emits actual machine code for the target processor.
   - Used for the disassembly/assembly inspection view.
2. **Bytecode VM (`aether-vm`)**:
   - Compiles HIR down to custom stack-based bytecode instructions (`aether-vm/src/isa.rs`).
   - Run via the in-browser interpreter.
   - Enables time-travel debugging features (such as stepping forward and rewinding stack states).
