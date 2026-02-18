#Problem

The current Terrain Debugger workflow does not have a dedicated setup mode for validating ground texture tiling quality and variation behavior on a large, uniform map. Biome Transition tools are focused on transitions, not on single-material tiling diagnostics.

# Request

Add a new **Biome Tiling Setup** screen in Terrain Debugger focused on evaluating one PBR texture across a deterministic test map and tuning tiling/variation behavior.

Tasks:
- Add a new tab/screen for biome tiling setup with a clear purpose: inspect texture repetition, scale consistency, and variation quality.
- Use a fixed map layout of **5 x 20 tiles** optimized for visual repetition checks.
- Add a top-level **Focus Camera** action that frames the tiling test area for fast inspection.
- Add a **single PBR texture picker** for the setup screen; applying it should set the entire test map to that texture (uniform material assignment).
- Ensure this setup screen is deterministic and stable so visual comparisons across tweaks are reliable.
- Add controls for **texture size by camera distance** (near/far behavior with blend range).
- Use a simple near/far blend by default; if a curve is needed later, make room for an optional curve control without requiring it for v1.
- Add texture variation controls suitable for tiling validation (at minimum anti-tiling and macro variation style controls) so repetition can be reduced and compared.
- Provide visual debugging support for distance behavior (for example blended vs micro/macro inspection) to validate that changes are doing what users expect.
- Keep this setup isolated from the Biome Transition authoring workflow so transition tuning and tiling validation do not conflict.
- Ensure the new screen works with existing Terrain Debugger state/update flows and does not regress existing tabs.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
