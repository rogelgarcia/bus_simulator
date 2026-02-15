#Problem

GTAO alpha handling appears ineffective for foliage/cutout materials: areas that should be fully transparent (alpha = 0) still contribute AO shading.

# Request

Fix GTAO alpha handling so cutout transparency is respected and AO contribution matches visible coverage.

Tasks:
- Ensure alpha-0 regions do not generate AO contribution for cutout foliage/alpha-card geometry.
- Ensure both supported alpha handling modes behave distinctly and match their intended outcomes.
- Validate behavior on real tree/leaf assets and representative alpha-cutout content.
- Keep AO stable under camera motion and avoid introducing new halo/noise artifacts.
- Add deterministic repro/coverage to prevent regressions in foliage alpha AO behavior.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line.
- Rename the file in `prompts/` to `prompts/AI_DONE_graphics_322_MATERIAL_gtao_alpha_handling_not_respecting_cutout_transparency_DONE.md`.
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change).
