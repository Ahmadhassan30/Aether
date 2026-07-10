use std::path::PathBuf;
use wasm_bindgen::prelude::*;
use aether_parser::{Opt, preprocess, check_semantics, Parser, PreProcessor};
use cranelift_codegen::settings::Configurable;

#[derive(serde::Serialize)]
pub struct TokenSnapshot {
    pub text: String,
    pub start: u32,
    pub end: u32,
}

#[derive(serde::Serialize)]
pub struct AstNodeSnapshot {
    pub text: String,
    pub start: u32,
    pub end: u32,
}

#[derive(serde::Serialize)]
pub struct HirSnapshot {
    pub text: String,
    pub start: u32,
    pub end: u32,
}

#[derive(serde::Serialize)]
pub struct ClifIrSnapshot {
    pub func_name: String,
    pub clif: String,
    pub start: u32,
    pub end: u32,
}

#[derive(serde::Serialize)]
pub struct DisassemblySnapshot {
    pub text: String,
    pub start: Option<u32>,
    pub end: Option<u32>,
}

#[derive(serde::Serialize)]
pub struct DiagnosticSnapshot {
    pub severity: String,
    pub message: String,
    pub start: Option<u32>,
    pub end: Option<u32>,
}

#[derive(serde::Serialize)]
pub struct CompileResult {
    pub success: bool,
    pub tokens: Vec<TokenSnapshot>,
    pub ast: Vec<AstNodeSnapshot>,
    pub hir: Vec<HirSnapshot>,
    pub clif: Option<Vec<ClifIrSnapshot>>,
    pub native_disassembly: Option<Vec<String>>,
    pub vm_bytecode: Option<Vec<DisassemblySnapshot>>,
    pub diagnostics: Vec<DiagnosticSnapshot>,
}

#[wasm_bindgen]
pub fn compile(source: &str) -> Result<JsValue, JsValue> {
    std::panic::set_hook(Box::new(|info| {
        let msg = if let Some(s) = info.payload().downcast_ref::<&str>() {
            *s
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            &s[..]
        } else {
            "Box<Any>"
        };
        let loc = if let Some(l) = info.location() {
            format!("at {}:{}", l.file(), l.line())
        } else {
            "unknown location".to_string()
        };
        eprintln!("PANIC: {} ({})", msg, loc);
    }));

    let opt = Opt {
        filename: PathBuf::from("main.c"),
        ..Opt::default()
    };

    // 1. Tokens stage
    let token_prog = preprocess(source, opt.clone());
    let mut token_snapshots = Vec::new();
    if let Ok(tokens) = &token_prog.result {
        for tok in tokens {
            token_snapshots.push(TokenSnapshot {
                text: format!("{}", tok.data),
                start: tok.location.span.start,
                end: tok.location.span.end,
            });
        }
    }

    // 2. Parser stage (extract AST declarations manually via public Parser)
    let path = opt.search_path.iter().map(|p| p.into());
    let mut cpp = PreProcessor::new(
        source,
        opt.filename.clone(),
        opt.debug_lex,
        path,
        opt.definitions.clone(),
    );
    let mut parser = Parser::new(&mut cpp, false);
    let mut ast_snapshots = Vec::new();
    while !parser.is_empty() {
        if let Some(Ok(decl)) = parser.next() {
            ast_snapshots.push(AstNodeSnapshot {
                text: format!("{}", decl.data),
                start: decl.location.span.start,
                end: decl.location.span.end,
            });
        }
    }

    // 3. Semantic checking (HIR)
    let hir_prog = check_semantics(source, opt.clone());
    let mut hir_snapshots = Vec::new();
    if let Ok(hir_decls) = &hir_prog.result {
        for decl in hir_decls {
            hir_snapshots.push(HirSnapshot {
                text: format!("{}", decl.data),
                start: decl.location.span.start,
                end: decl.location.span.end,
            });
        }
    }

    // 4. VM bytecode lowering and verification
    let mut vm_bytecode_snapshots = None;
    if let Ok(hir_decls) = &hir_prog.result {
        if let Ok(bytecode) = aether_vm::lower::lower_program(hir_decls) {
            if aether_vm::verifier::verify(&bytecode).is_ok() {
                let mut snaps = Vec::new();
                for (idx, instr) in bytecode.instructions.iter().enumerate() {
                    let loc = bytecode.instruction_locations[idx];
                    snaps.push(DisassemblySnapshot {
                        text: format!("{:?}", instr),
                        start: loc.map(|l| l.span.start),
                        end: loc.map(|l| l.span.end),
                    });
                }
                vm_bytecode_snapshots = Some(snaps);
            }
        }
    }

    // 4.5. CLIF IR generation
    let mut clif_snapshots = None;
    if hir_prog.result.is_ok() {
        let codegen_opt = Opt {
            filename: PathBuf::from("main.c"),
            debug_asm: true,
            ..Opt::default()
        };
        let module = aether_codegen::initialize_aot_module("aether-wasm-clif".to_owned());
        if let Ok((_, clif_list)) = aether_codegen::compile(module, source, codegen_opt).result {
            let mut snaps = Vec::new();
            for (func_name, clif_text) in clif_list {
                let mut start = 0;
                let mut end = source.len() as u32;
                if let Ok(hir_decls) = &hir_prog.result {
                    for decl in hir_decls {
                        if decl.data.symbol.get().id.to_string() == func_name {
                            start = decl.location.span.start;
                            end = decl.location.span.end;
                            break;
                        }
                    }
                }
                snaps.push(ClifIrSnapshot {
                    func_name,
                    clif: clif_text,
                    start,
                    end,
                });
            }
            clif_snapshots = Some(snaps);
        }
    }

    // 5. Gather diagnostics
    let mut diagnostics = Vec::new();

    // Preprocessor and lexer warnings/errors
    for warning in &token_prog.warnings {
        diagnostics.push(DiagnosticSnapshot {
            severity: "warning".to_string(),
            message: format!("{}", warning.data),
            start: Some(warning.location.span.start),
            end: Some(warning.location.span.end),
        });
    }
    if let Err(errors) = &token_prog.result {
        for err in errors {
            diagnostics.push(DiagnosticSnapshot {
                severity: "error".to_string(),
                message: format!("{}", err.data),
                start: Some(err.location.span.start),
                end: Some(err.location.span.end),
            });
        }
    }

    // Semantic analysis warnings/errors
    if token_prog.result.is_ok() {
        for warning in &hir_prog.warnings {
            let start = warning.location.span.start;
            let end = warning.location.span.end;
            let msg = format!("{}", warning.data);
            if !diagnostics.iter().any(|d| d.message == msg && d.start == Some(start)) {
                diagnostics.push(DiagnosticSnapshot {
                    severity: "warning".to_string(),
                    message: msg,
                    start: Some(start),
                    end: Some(end),
                });
            }
        }
        if let Err(errors) = &hir_prog.result {
            for err in errors {
                diagnostics.push(DiagnosticSnapshot {
                    severity: "error".to_string(),
                    message: format!("{}", err.data),
                    start: Some(err.location.span.start),
                    end: Some(err.location.span.end),
                });
            }
        }
    }

    let success = token_prog.result.is_ok() && hir_prog.result.is_ok();

    let compile_result = CompileResult {
        success,
        tokens: token_snapshots,
        ast: ast_snapshots,
        hir: hir_snapshots,
        clif: clif_snapshots,
        native_disassembly: None,
        vm_bytecode: vm_bytecode_snapshots,
        diagnostics,
    };

    serde_wasm_bindgen::to_value(&compile_result)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

fn disassemble_x86_64(bytes: &[u8]) -> String {
    use iced_x86::{Decoder, DecoderOptions, Formatter, Instruction, NasmFormatter};
    
    let mut decoder = Decoder::new(64, bytes, DecoderOptions::NONE);
    let mut formatter = NasmFormatter::new();
    let mut output = String::new();
    let mut instruction = Instruction::default();
    
    decoder.set_ip(0x1000);
    
    while decoder.can_decode() {
        decoder.decode_out(&mut instruction);
        let mut line = String::new();
        formatter.format(&instruction, &mut line);
        output.push_str(&format!("{:08x}: {}\n", instruction.ip(), line));
    }
    output
}

fn disassemble_aarch64(bytes: &[u8]) -> String {
    use yaxpeax_arch::{Arch, Decoder, U8Reader};
    use yaxpeax_arm::armv8::a64::ARMv8;
    
    let mut output = String::new();
    let mut reader = U8Reader::new(bytes);
    let decoder = <ARMv8 as Arch>::Decoder::default();
    let mut ip = 0x1000;
    
    while let Ok(inst) = decoder.decode(&mut reader) {
        output.push_str(&format!("{:08x}: {}\n", ip, inst));
        ip += 4;
    }
    output
}

#[wasm_bindgen]
pub fn disassemble(source: &str, target: Option<String>) -> Result<String, JsValue> {
    use object::{Object, ObjectSection};
    
    let opt = Opt {
        filename: PathBuf::from("main.c"),
        ..Opt::default()
    };
    
    let mut flags_builder = cranelift_codegen::settings::builder();
    flags_builder.set("is_pic", "true").unwrap();
    flags_builder.set("enable_probestack", "false").unwrap();
    let flags = cranelift_codegen::settings::Flags::new(flags_builder);

    let target_str = target.as_deref().unwrap_or("x86-64");
    let triple_str = match target_str {
        "aarch64" => "aarch64-unknown-unknown",
        _ => "x86_64-unknown-unknown-elf",
    };
    let triple: target_lexicon::Triple = triple_str.parse()
        .map_err(|_| JsValue::from_str("Invalid target triple"))?;
    
    let isa = cranelift_codegen::isa::lookup(triple)
        .map_err(|e| JsValue::from_str(&e.to_string()))?
        .finish(flags);
    
    let builder = cranelift_object::ObjectBuilder::new(
        isa,
        "main".to_string(),
        cranelift_module::default_libcall_names(),
    ).map_err(|e| JsValue::from_str(&e.to_string()))?;
    
    let module = cranelift_module::Module::new(builder);
    
    let program = aether_codegen::compile(module, source, opt);
    let (compiled_module, _): (cranelift_module::Module<cranelift_object::ObjectBackend>, _) = program.result.map_err(|errs| {
        let err_msgs: Vec<String> = errs.iter().map(|e| format!("{}", e.data)).collect();
        JsValue::from_str(&err_msgs.join("\n"))
    })?;
    
    let product = compiled_module.finish();
    let bytes = product.emit().map_err(|e| JsValue::from_str(&e.to_string()))?;
    
    let obj_file = object::File::parse(&bytes)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    
    if let Some(section) = obj_file.section_by_name(".text") {
        let text_bytes = section.data().map_err(|e| JsValue::from_str(&e.to_string()))?;
        let output = match target_str {
            "aarch64" => disassemble_aarch64(text_bytes),
            _ => disassemble_x86_64(text_bytes),
        };
        Ok(output)
    } else {
        Err(JsValue::from_str("No .text section found in compiled binary"))
    }
}

#[wasm_bindgen]
pub struct VmHandle {
    vm: aether_vm::interp::Vm,
}

#[wasm_bindgen]
impl VmHandle {
    #[wasm_bindgen(constructor)]
    pub fn new(source: &str) -> Result<VmHandle, JsValue> {
        let opt = Opt {
            filename: PathBuf::from("main.c"),
            ..Opt::default()
        };
        let hir_prog = check_semantics(source, opt);
        let hir_decls = hir_prog.result.map_err(|e| {
            JsValue::from_str(&format!("Compilation failed: {:?}", e))
        })?;
        let bytecode = aether_vm::lower::lower_program(&hir_decls).map_err(|e| {
            JsValue::from_str(&format!("Lowering failed: {}", e))
        })?;
        let vm = aether_vm::interp::Vm::new(bytecode).map_err(|e| {
            JsValue::from_str(&format!("VM initialization failed: {:?}", e))
        })?;
        Ok(VmHandle { vm })
    }

    pub fn step(&mut self) -> Result<JsValue, JsValue> {
        match self.vm.step() {
            Ok(snapshot) => {
                serde_wasm_bindgen::to_value(&snapshot)
                    .map_err(|e| JsValue::from_str(&e.to_string()))
            }
            Err(trap) => Err(JsValue::from_str(&trap.to_string())),
        }
    }

    pub fn run(&mut self) -> Result<JsValue, JsValue> {
        match self.vm.run_to_completion() {
            Ok(result) => {
                #[derive(serde::Serialize)]
                struct ExecutionResultSnapshot {
                    stdout: String,
                    exit_code: i32,
                }
                let res = ExecutionResultSnapshot {
                    stdout: result.stdout,
                    exit_code: result.exit_code,
                };
                serde_wasm_bindgen::to_value(&res)
                    .map_err(|e| JsValue::from_str(&e.to_string()))
            }
            Err(trap) => Err(JsValue::from_str(&trap.to_string())),
        }
    }

    pub fn rewind(&mut self, n: usize) -> Result<JsValue, JsValue> {
        match self.vm.rewind(n) {
            Some(snapshot) => {
                serde_wasm_bindgen::to_value(&snapshot)
                    .map_err(|e| JsValue::from_str(&e.to_string()))
            }
            None => Ok(JsValue::NULL),
        }
    }

    pub fn run_to_cursor(&mut self, target_offset: usize) -> Result<JsValue, JsValue> {
        match self.vm.run_to_cursor(target_offset) {
            Ok(snapshot) => {
                serde_wasm_bindgen::to_value(&snapshot)
                    .map_err(|e| JsValue::from_str(&e.to_string()))
            }
            Err(trap) => Err(JsValue::from_str(&trap.to_string())),
        }
    }
}
