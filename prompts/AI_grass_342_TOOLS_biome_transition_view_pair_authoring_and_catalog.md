#Problem

Biome transition quality is not acceptable with a generic blend approach, and current tooling is not focused enough to tune biome-pair behavior quickly. Transitions show gradient/square artifacts and lack a dedicated authoring workflow.

# Request

Create a new debugger view named `Biome Transition` focused on biome-pair transition authoring, validation, and reusable presets.

Tasks:
- Add a dedicated `Biome Transition` view where the user selects exactly two biomes (`Biome 1` and `Biome 2`) for focused tuning.
- Build a deterministic 3x3 terrain layout for this view:
  - Left side cells represent `Biome 1`.
  - Right side cells represent `Biome 2`.
  - Center cells represent the transition zone between the two.
- Initialize this view using default gameplay options so tuning reflects real gameplay baseline behavior by default.
- Provide a right-side editing panel that shows only transition-relevant controls for this view and hides unrelated terrain/debug controls.
- Model transitions as explicit biome-pair profiles rather than a single global blend so each pair can be tuned independently.
- Support per-pair visual intent categories (`soft`, `medium`, `hard`) to guide artistic outcome and reduce trial-and-error tuning.
- Expose a minimal but complete per-pair control set covering:
  - transition width intent,
  - blend/falloff shape intent,
  - edge irregularity intent,
  - material dominance/height influence intent,
  - final contrast/clarity intent.
- Ensure deterministic behavior for repeatability (stable outputs for the same inputs, no random drift between runs).
- Include transition-focused visualization/debug modes so tuning is evidence-based:
  - pair isolation,
  - final transition result,
  - transition weight/intensity view,
  - supporting transition contribution views needed to diagnose artifacts.
- Provide export of the current biome-pair configuration to JSON for reuse outside the session.
- Provide loading/apply flow from a catalog of saved biome-pair presets with snapshots/previews for quick visual selection.
- Ensure catalog usage supports side-by-side comparison workflow (baseline vs tuned) for fast iteration.
- Define and enforce acceptance criteria for this view and transition output:
  - no obvious square/grid transition artifacts in standard camera heights,
  - stable appearance during camera movement (no popping/flicker),
  - consistent near/mid distance behavior,
  - transition tuning remains within practical runtime cost expectations.
- Support a practical rollout workflow in-tool:
  - start with shared defaults,
  - tune critical biome pairs first,
  - allow later extension to advanced boundary modeling without replacing authored pair profiles.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_342_TOOLS_biome_transition_view_pair_authoring_and_catalog_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
