use aether_parser::Location;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrameSnapshot {
    pub func_name: String,
    pub locals: Vec<u64>,
}

/// A presentation-only snapshot of the VM's state.
///
/// NOTE: This is for debugging visualization only and is NOT used to save or restore execution.
#[derive(Debug, Clone, PartialEq)]
pub struct VmSnapshot {
    pub pc: u32,
    pub operand_stack: Vec<u64>,
    pub call_stack: Vec<FrameSnapshot>,
    pub location: Option<Location>,
}
