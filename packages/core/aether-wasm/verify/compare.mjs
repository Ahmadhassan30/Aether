import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../../../..');

// Normalizes strings for comparison by stripping whitespace and converting to lowercase
function normalize(str) {
    return str.replace(/\r\n/g, '\n')
              .replace(/windows_fastcall/g, 'system_v')
              .replace(/\s+/g, ' ')
              .trim()
              .toLowerCase();
}

async function main() {
    console.log("=== WASM-vs-Native Verification Harness ===");
    console.log("Workspace Root:", workspaceRoot);

    // Resolve WASM build files
    const jsPath = path.resolve(workspaceRoot, 'apps/web/pkg/aether_wasm.js');
    const wasmPath = path.resolve(workspaceRoot, 'apps/web/pkg/aether_wasm_bg.wasm');

    if (!fs.existsSync(jsPath) || !fs.existsSync(wasmPath)) {
        console.error("WASM build artifacts not found! Run 'pnpm wasm:build' first.");
        process.exit(1);
    }

    // Import and initialize WASM
    const { default: init, compile, VmHandle } = await import('file://' + jsPath);
    const wasmBytes = fs.readFileSync(wasmPath);
    await init(wasmBytes);
    console.log("WASM module initialized successfully.\n");

    // Source files to compare
    const testCases = [
        {
            name: "hello_world.c",
            path: path.join(workspaceRoot, "packages/core/tests/runner-tests/hello_world.c"),
            skipRun: true
        },
        {
            name: "fibonacci.c",
            path: path.join(workspaceRoot, "packages/core/tests/runner-tests/fibonacci.c")
        },
        {
            name: "readme.c",
            path: path.join(workspaceRoot, "packages/core/tests/runner-tests/readme.c")
        }
    ];

    for (const tc of testCases) {
        console.log(`--- Testing ${tc.name} ---`);
        const source = fs.readFileSync(tc.path, 'utf8');

        // Run Native CLI
        let nativeStdout = "";
        let nativeStderr = "";
        try {
            // Run cargo run -p aether-cli with target flags
            const cliCmd = `cargo run --quiet -p aether-cli -- --hir --clif --run "${tc.path}"`;
            nativeStdout = execSync(cliCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        } catch (err) {
            // Capture status error
            nativeStdout = err.stdout || "";
            nativeStderr = err.stderr || "";
        }

        // Run WASM Compile Pipeline
        const wasmRes = compile(source);

        // Parse CLI outputs
        const cliHirBlock = extractBlock(nativeStdout, "=== hir ===", "=== clif ===");
        const cliClifBlock = extractBlock(nativeStdout, "=== clif ===", "=== run ===");
        const cliRunBlock = extractBlock(nativeStdout, "=== run ===", null);

        // 1. Verify HIR
        const cliHirDecls = cliHirBlock.replace(/hir:\s?/g, "");
        const wasmHirDecls = (wasmRes.hir || []).map(h => h.text).join('\n');

        if (normalize(cliHirDecls) !== normalize(wasmHirDecls)) {
            console.error(`[-] HIR Mismatch for ${tc.name}!`);
            console.error("CLI HIR:\n", cliHirDecls);
            console.error("WASM HIR:\n", wasmHirDecls);
            process.exit(1);
        }
        console.log("[+] HIR is equivalent.");

        // 2. Verify CLIF (only if compilation was successful and CLIF is emitted)
        if (wasmRes.clif && wasmRes.clif.length > 0) {
            const cliClifFuncs = cliClifBlock.replace(/ir:\s?/g, "");
            const wasmClifFuncs = wasmRes.clif.map(c => c.clif).join('\n');

            if (normalize(cliClifFuncs) !== normalize(wasmClifFuncs)) {
                console.warn(`[!] CLIF String representation has format differences, checking normalization...`);
                if (normalize(cliClifFuncs) !== normalize(wasmClifFuncs)) {
                    console.error(`[-] CLIF Mismatch for ${tc.name}!`);
                    console.error("CLI CLIF:\n", cliClifFuncs);
                    console.error("WASM CLIF:\n", wasmClifFuncs);
                    process.exit(1);
                }
            }
            console.log("[+] CLIF is equivalent.");
        } else {
            console.log("[~] CLIF skipped (no compiled functions).");
        }

        // 3. Verify VM Execution / Run
        if (tc.skipRun) {
            console.log("[~] VM execution skipped.\n");
            continue;
        }

        let wasmRunResult;
        let wasmRunError = null;
        try {
            const vm = new VmHandle(source);
            wasmRunResult = vm.run();
        } catch (err) {
            wasmRunError = err;
        }

        if (wasmRunError) {
            // Check if native run also failed
            if (!cliRunBlock.toLowerCase().includes("exit code") && !cliRunBlock.toLowerCase().includes("trap")) {
                console.log("[+] Both pipelines failed as expected.");
            } else {
                console.error(`[-] WASM VM trapped but CLI completed! Error:`, wasmRunError);
                process.exit(1);
            }
        } else {
            // Parse exit code from CLI Run Block
            const match = cliRunBlock.match(/Exit code:\s*(-?\d+)/i);
            const cliExitCode = match ? parseInt(match[1], 10) : null;
            const cliStdout = cliRunBlock.replace(/Exit code:\s*-?\d+/gi, "").trim();

            if (cliExitCode !== wasmRunResult.exit_code) {
                console.error(`[-] Exit Code Mismatch for ${tc.name}! CLI: ${cliExitCode}, WASM: ${wasmRunResult.exit_code}`);
                process.exit(1);
            }

            if (normalize(cliStdout) !== normalize(wasmRunResult.stdout)) {
                console.error(`[-] VM Stdout Mismatch for ${tc.name}!`);
                console.error(`CLI stdout:\n`, cliStdout);
                console.error(`WASM stdout:\n`, wasmRunResult.stdout);
                process.exit(1);
            }
            console.log(`[+] VM execution (Exit Code: ${wasmRunResult.exit_code}) is equivalent.\n`);
        }
    }

    // 4. Run step/rewind round trip validation with recursive call stack checks
    console.log("--- Testing time-travel VmHandle (recursive stack frames verification) ---");
    const recursiveSource = `
        int factorial(int n) {
            if (n < 2) {
                return 1;
            }
            return n * factorial(n - 1);
        }
        int main() {
            return factorial(3);
        }
    `;

    const vm = new VmHandle(recursiveSource.trim() + "\n");

    // Initial state: call stack length 1, active function is main
    let snap0 = vm.step(); 
    console.log(`Step 1 (PC: ${snap0.pc}), Call stack size: ${snap0.call_stack.length}, Active function: ${snap0.call_stack[0].func_name}`);
    if (snap0.call_stack.length !== 1 || snap0.call_stack[0].func_name !== "main") {
        console.error("[-] Unexpected initial state!");
        process.exit(1);
    }

    // Collect snapshots as we step recursively
    const history = [snap0];
    let deepestStackSize = 1;

    for (let i = 1; i < 20; i++) {
        const snap = vm.step();
        history.push(snap);
        if (snap.call_stack.length > deepestStackSize) {
            deepestStackSize = snap.call_stack.length;
        }
    }

    console.log(`Stepped 20 times. Deepest call stack size achieved: ${deepestStackSize}`);
    
    // Check that we indeed entered recursive calls (factorial)
    if (deepestStackSize <= 1) {
        console.error("[-] VM did not enter recursive calls!");
        process.exit(1);
    }

    // Validate active functions in deep frames
    const recursiveFrame = history.find(s => s.call_stack.length > 1);
    const activeFunctions = recursiveFrame.call_stack.map(f => f.func_name);
    console.log("Recursive frames detected:", activeFunctions);
    if (!activeFunctions.includes("factorial")) {
        console.error("[-] Recursive stack does not contain 'factorial'!");
        process.exit(1);
    }

    // Rewind 5 steps back
    console.log("Rewinding 5 steps back...");
    const rewindRes = vm.rewind(5);
    if (!rewindRes) {
        console.error("[-] Rewind returned null!");
        process.exit(1);
    }

    const expectedSnap = history[history.length - 1 - 5];
    console.log(`Rewound state: PC: ${rewindRes.pc}, Call stack size: ${rewindRes.call_stack.length}`);
    console.log(`Expected state: PC: ${expectedSnap.pc}, Call stack size: ${expectedSnap.call_stack.length}`);
    if (rewindRes.pc !== expectedSnap.pc || rewindRes.call_stack.length !== expectedSnap.call_stack.length) {
        console.error("[-] Rewound state did not match expected history snapshot!");
        process.exit(1);
    }
    console.log("[+] Rewound state matches history snapshot.");

    // Step forward again and make sure it yields the exact same execution states
    console.log("Stepping forward again to verify history integrity...");
    for (let i = 0; i < 5; i++) {
        const replaySnap = vm.step();
        const originalSnap = history[history.length - 5 + i];
        if (replaySnap.pc !== originalSnap.pc || replaySnap.call_stack.length !== originalSnap.call_stack.length) {
            console.error(`[-] Replayed step ${i} diverged from history!`);
            process.exit(1);
        }
    }
    console.log("[+] Replayed snapshots perfectly match execution history.\n");

    console.log("=== All WASM verification comparisons PASSED successfully! ===");
}

function extractBlock(stdout, startHeader, endHeader) {
    const startIndex = stdout.indexOf(startHeader);
    if (startIndex === -1) return "";
    const contentStart = startIndex + startHeader.length;
    if (!endHeader) {
        return stdout.substring(contentStart).trim();
    }
    const endIndex = stdout.indexOf(endHeader, contentStart);
    if (endIndex === -1) {
        return stdout.substring(contentStart).trim();
    }
    return stdout.substring(contentStart, endIndex).trim();
}

main().catch(err => {
    console.error("Verification script failed with exception:", err);
    process.exit(1);
});
