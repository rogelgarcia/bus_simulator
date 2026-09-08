# Problem

The Lighting tab's IBL intensity currently couples environment diffuse lighting and runtime reflections. Adjusting reflections therefore changes the source profile used by baked indirect lighting, causing the selected baked setup to fall back to Current lighting. The controls do not explain this consequence before the user changes them.

# Request

Separate reflection intensity from environment diffuse lighting, and identify settings that can invalidate the selected bake with an alert icon and an explanatory popup. Preserve the accepted AI 535 runtime modes and the enhanced indirect lighting promoted from AI 548.

Tasks:

- [ ] Add a clearly labeled reflection-intensity control independent of the environment diffuse/source intensity. It must adjust environment specular reflections on supported static and dynamic materials, including the bus and glazing, without changing diffuse illumination, baked indirect values, direct sunlight, emissive output, or visible background brightness. Preserve material-specific reflection response and appearance at the default setting.
- [ ] Keep environment lighting intensity separately adjustable and clearly explain that its diffuse contribution participates in the indirect bake. Define the existing IBL enabled control's scope explicitly; if it continues to affect the diffuse source, it remains a bake-sensitive control. Reflection intensity zero must suppress environment reflections without disabling the diffuse source or the bake.
- [ ] Reflection-only edits must retain effective Baked lighting, the active indirect publication and baked AO scope. They must not trigger source invalidation, bake-resource reloads, fallback, or rebaking. Keep the actual diffuse source, HDR identity, sun and hemisphere compatibility checks intact; do not make incompatible illumination appear valid by weakening validation.
- [ ] Preserve these independent values across live preview, Save, Cancel, Reset, presets, import/export, reload and Current/Baked/Auto transitions. Migrate older settings and presets so their initial appearance remains unchanged, with documented defaults and no invalidation solely because the new reflection field was absent.
- [ ] Audit settings against the actual compatibility rules and show an alert icon beside controls whose changes can invalidate a selected baked channel. Cover environment lighting enabled/intensity/source identity, hemisphere intensity/colors, and sun intensity/color/direction wherever exposed. Explain the affected channel: sun direction affects shadows and indirect lighting; source intensities affect indirect illumination. A shadow-only setup must not receive an inaccurate indirect-lighting warning.
- [ ] Clicking or tapping an alert icon opens a compact explanatory popup. Include the setting name, why it affects the bake, which selected channel is affected, and the consequence: without an exact matching bake the selected setup uses Current lighting while the requested mode remains selected. Explain how to restore the matching setting or use a matching offline bake. Where available, show the current and compatible profile values; never invent a compatible value when metadata is unavailable.
- [ ] Use concise, setting-specific language. Example for environment lighting intensity: "Changing this value changes the environment light included in baked indirect lighting. Without a matching bake, lighting switches to Current. To adjust reflections while keeping the bake, use Reflection intensity." Show requested versus effective status when relevant, including after a mismatch, so a selected baked option cannot conceal fallback.
- [ ] Make the icon and popup accessible by keyboard, pointer and touch, with an accessible label, visible focus, Escape/outside-click dismissal and appropriate focus handling. Treat the popup as contextual information, not a mandatory confirmation on every edit or slider movement. Explain the risk before editing through the icon, and keep the actual fallback reason visible after editing.
- [ ] Keep warnings consistent with selected channels and actual compatibility, including loading, Current mode, Baked/Auto fallback and restoration. Do not mark exposure, tone mapping, display-only HDR background/sky controls, the probe-sphere display, or the new reflection-only intensity as bake-invalidating settings. Reuse the compatibility definitions rather than maintaining an unrelated list that can drift from runtime behavior.
- [ ] Update the Lighting interaction policy and user-facing setting descriptions in the relevant specs. Record the separation of diffuse source intensity and specular reflection intensity, persistence migration, warning/popup behavior, and the unchanged exact-profile fallback rules.

## Validation

- [ ] With an accepted indirect bake active, vary reflection intensity including zero, restore it, and switch Current/Baked/Auto repeatedly. Verify a visible reflection change while diffuse lighting, active bake identity, activation generation and resource requests remain stable during reflection-only edits. Include a reflective building/window surface and the bus; account for supported material paths rather than checking only one test sphere.
- [ ] Change each exposed bake-sensitive setting with the relevant channel selected. Verify that the icon/popup identifies the correct consequence, actual mismatch uses Current, and restoring compatible settings reactivates the bake. Check shadow-only and indirect selections separately, and ensure display-only controls do not cause false warnings or invalidation.
- [ ] Exercise Save/Cancel/Reset, legacy preset migration and import/export with both intensity values, plus keyboard and touch popup operation. Ensure opening or dismissing the popup never changes a lighting value.
- [ ] Capture before/after reflection examples and the warning/popup states under `tests/artifacts/screens/illumination_557/`. Keep generated screenshots, logs and capture manifests gitignored. Summarize the verified behavior and remaining limitations in the completion handoff.

## References and boundaries

- Current runtime contract: `specs/graphics/illumination_runtime_modes.md` and `specs/graphics/illumination_framework.md`.
- Existing Lighting controls: `src/graphics/gui/options/tabs/renderLightingTab.js`.
- This extends completed AI 535; do not reopen its completed checklist or restore the retired AI 548 warning/toggle or baked-direct control.
- This is independent intensity control for the existing environment/reflection path. Local baked reflection probes remain the separate AI 551 task and are not a prerequisite.
- Existing bake assets should remain usable. If an actual bake is needed for validation, use `node tools/bake.mjs` and the shared bake framework; do not add machine-specific commands.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_graphics_557_UI_independent_ibl_reflections_and_baked_lighting_warnings_DONE.md`.
- Add a high-level one-line summary per completed change and the validation results.
- Do not move it to `prompts/archive/` automatically; archive only when explicitly requested.
