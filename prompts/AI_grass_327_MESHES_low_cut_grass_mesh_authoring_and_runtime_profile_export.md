#Problem

The high-res grass mesh has many low-level parameters, but runtime tuning needs simple high-level controls. Without a stable profile export, iteration remains expensive and inconsistent.

# Request

Create a low-cut grass authoring flow that preserves rich mesh design controls while exporting a high-level runtime profile.

Tasks:
- Support high-res mesh authoring for low-cut grass blades while keeping runtime usage independent from full source complexity.
- Define exported high-level controls for runtime, including bend, inclination, and humidity.
- Include tuft-related controls in the exported profile so grouped grass behavior is consistent.
- Ensure exported profiles are versioned and stable across iterations.
- Maintain deterministic visual output when using the same profile and seed/config values.
- Keep profile semantics clear so designers can tune results without low-level mesh editing.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_327_MESHES_low_cut_grass_mesh_authoring_and_runtime_profile_export_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
