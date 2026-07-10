use aether_parser::Location;
use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FrameSnapshot {
    pub func_name: String,
    pub locals: Vec<u64>,
}

#[derive(Serialize)]
struct LocationRef {
    start: u32,
    end: u32,
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

impl Serialize for VmSnapshot {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("VmSnapshot", 4)?;
        state.serialize_field("pc", &self.pc)?;
        state.serialize_field("operand_stack", &self.operand_stack)?;
        state.serialize_field("call_stack", &self.call_stack)?;

        let loc_ref = self.location.map(|loc| LocationRef {
            start: loc.span.start,
            end: loc.span.end,
        });
        state.serialize_field("location", &loc_ref)?;
        state.end()
    }
}
