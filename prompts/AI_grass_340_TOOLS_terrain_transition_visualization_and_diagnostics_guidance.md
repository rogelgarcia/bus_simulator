#Problem

Transition tuning is slow and error-prone without clear visualization of intermediate terrain and biome blending signals.

# Request

Create high-level guidance for a terrain transition visualization and diagnostics debugger that makes tuning decisions fast and evidence-based.

Tasks:
- Define required visualization modes for intermediate and final transition signals.
- Define pair-isolation behavior so one biome-pair transition can be evaluated without unrelated scene noise.
- Define guidance for inspecting boundary behavior, transition width behavior, and blend-shape behavior directly in-view.
- Define diagnostics expectations for stability and performance while tuning transition settings.
- Define preset/save/load guidance so reviews and comparisons can be reproduced across sessions.
- Define usability expectations for rapid iteration in both close-up and flyover camera contexts.

## Scope boundary

- This prompt concerns transition inspection in Terrain Debugger.
- AI 350 and AI 357 remain the historical V1 Grass Lab and validation owners. Corrective fixtures are owned by AI 358 through AI 361, and current native-4K visual/performance approval belongs to AI 362.
- Do not create another grass renderer or duplicate Grass Lab controls in Terrain Debugger as part of this guidance.

## Generated evidence location

- Any screenshots, capture manifests, comparison images, traces, logs, or reports produced by this AI must be saved under `tests/artifacts/screens/grass/ai340/`.
- This directory is gitignored. Do not write generated evidence to `screens/`, stage it, or commit it. Only tracked prompt/spec summaries may reference workspace-relative artifact paths.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_340_TOOLS_terrain_transition_visualization_and_diagnostics_guidance_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
