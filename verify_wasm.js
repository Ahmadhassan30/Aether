const fs = require('fs');
const path = require('path');

async function main() {
    console.log("Loading WASM module...");

    // Resolve paths
    const jsPath = path.resolve(__dirname, 'apps/web/pkg/aether_wasm.js');
    const wasmPath = path.resolve(__dirname, 'apps/web/pkg/aether_wasm_bg.wasm');

    if (!fs.existsSync(jsPath) || !fs.existsSync(wasmPath)) {
        console.error("WASM build artifacts not found! Please run 'pnpm wasm:build' first.");
        process.exit(1);
    }

    // Dynamically import the ES module wrapper
    const { default: init, compile, disassemble, VmHandle } = await import('file://' + jsPath);

    // Read the WASM binary
    const wasmBytes = fs.readFileSync(wasmPath);

    // Initialize the WASM module
    await init({ module_or_path: wasmBytes });
    console.log("WASM module initialized successfully!");

    // Program 1: simple arithmetic (AST, HIR, VM execution)
    const src1 = "int main() {\n    return 42;\n}\n";
    console.log("\n--- Testing Program 1 (Simple return 42) ---");
    const result1 = compile(src1);
    console.log("Compile Result Keys:", Object.keys(result1));
    console.log("Success:", result1.success);
    console.log("Tokens count:", result1.tokens.length);
    console.log("AST nodes count:", result1.ast.length);
    console.log("HIR nodes count:", result1.hir.length);
    console.log("Diagnostics count:", result1.diagnostics.length);

    // Check AST and HIR strings
    console.log("AST text representation:", result1.ast.map(a => a.text));
    console.log("HIR text representation:", result1.hir.map(h => h.text));

    // Run VM Handle step-by-step
    const vm = new VmHandle(src1);
    console.log("Stepping VM...");
    let stepSnap = vm.step();
    console.log("Step 1 pc:", stepSnap.pc);
    console.log("Step 1 operand_stack:", stepSnap.operand_stack);
    console.log("Step 1 call_stack:", stepSnap.call_stack);

    const runRes = vm.run();
    console.log("Run completion result:", runRes);
    if (runRes.exit_code !== 42) {
        throw new Error(`Expected exit code 42, got ${runRes.exit_code}`);
    }

    // Program 2: Recursive Fibonacci (fibonacci(10) -> 55)
    const src2 = "int fib(int n) {\n    if (n <= 1) {\n        return n;\n    }\n    return fib(n-1) + fib(n-2);\n}\nint main() {\n    return fib(10);\n}\n";
    console.log("\n--- Testing Program 2 (Recursive Fibonacci 10) ---");
    const result2 = compile(src2);
    console.log("Success:", result2.success);
    console.log("Diagnostics count:", result2.diagnostics.length);

    const vm2 = new VmHandle(src2);
    const runRes2 = vm2.run();
    console.log("Fibonacci(10) exit code:", runRes2.exit_code);
    if (runRes2.exit_code !== 55) {
        throw new Error(`Expected exit code 55, got ${runRes2.exit_code}`);
    }

    // Verify VM bytecode disassembly
    const disassembly = disassemble(src2);
    console.log("\nVM Bytecode Disassembly:");
    console.log(disassembly);

    console.log("\nAll checks passed successfully!");
}

main().catch(err => {
    console.error("Verification failed:", err);
    process.exit(1);
});
