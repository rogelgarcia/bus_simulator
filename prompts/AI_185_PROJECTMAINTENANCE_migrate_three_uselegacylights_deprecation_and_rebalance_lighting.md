#Problem

The console reports `THREE.WebGLRenderer: The property .useLegacyLights has been deprecated...` and notes the default switched from `true` → `false` (and the property will be removed in r165). This suggests the project is either explicitly setting `renderer.useLegacyLights` or relying on older “legacy” scaling/decay behavior, which can cause lighting to look wrong or inconsistent as Three.js versions change.

# Request

Verify our renderer lighting mode and migrate away from `useLegacyLights` so lighting behaves predictably on current Three.js and remains forward-compatible if needed.

Tasks:
- Locate any usage of `WebGLRenderer.useLegacyLights` / `renderer.useLegacyLights` (including indirect setup code) and remove/replace it, if needed, so the deprecation warning goes away.
- Decide on a single lighting mode for the project:
  - Prefer physically-correct lighting (legacy lights disabled) to align with Three.js direction and future removal.
  - If an immediate migration is too risky, implement a temporary compatibility fallback that can be removed later (but still document the migration plan).
- If migrating to non-legacy mode:
  - Rebalance light intensities for Ambient/Hemisphere/Directional lights (Three.js guidance: restore previous look by multiplying prior intensities by `Math.PI` where appropriate).
  - Audit Point/Spot lights for physically-correct decay (keep default decay of 2; update intensities as needed since they’re effectively in candela now and may require much larger numbers).
  - Validate the look in key scenes (gameplay/city, setup/debug scenes, building fabrication, test mode) and ensure “obviously broken” lighting issues are resolved.
  - Confirm tone mapping/exposure behavior remains sensible (ACES + exposure sliders) and that any postprocessing (bloom/flare/grade) is not masking lighting regressions.
- Add a short developer note documenting:
  - Which lighting mode we use and why.
  - How to tune intensities (including the `Math.PI` rule of thumb).
  - Any assumptions about world scale (1 unit = 1 meter) and decay defaults.


## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_185_PROJECTMAINTENANCE_migrate_three_uselegacylights_deprecation_and_rebalance_lighting_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
