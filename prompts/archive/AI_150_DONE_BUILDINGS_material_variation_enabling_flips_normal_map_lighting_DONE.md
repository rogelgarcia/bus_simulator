# DONE

#Problem

In Building Fabrication, enabling the Material Variation system for the wall material causes the red brick PBR material (at least) to look like its surface detail is “inverted”. The lighting response flips: highlights become shadows and vice‑versa, as if the light source were coming from below. This happens immediately when Material Variation is enabled, even if no specific variation features are turned on (no anti‑tiling/macro/micro tweaks).

This looks like a normal map interpretation problem (tangent-space normal map being treated with the wrong convention or being transformed incorrectly once variation is enabled), not a height/displacement issue.

# Request

Debug and fix the red brick PBR material so enabling Material Variation does not invert the perceived surface lighting.

Tasks:
- Reproduce the issue reliably in Building Fabrication using the red brick wall PBR material:
  - Enable Material Variation for the layer.
  - Do not enable any additional variation features beyond the main toggle.
  - Observe that the shading looks inverted (embossed vs debossed).
- Add debugging capabilities to isolate which shader/variation step causes the inversion:
  - Add a “Material Variation Debug” section in Building Fabrication with step-by-step checkboxes (or a small debug panel) that can enable/disable individual shader features independently.
  - The goal is to be able to turn on mat-var features one at a time and observe exactly when the lighting flips.
  - Expose toggles that map directly to shader stages/operations, for example:
    - Enable `USE_MATVAR` define (master switch for injection).
    - UV transform toggles:
      - Enable Stair Shift UV.
      - Enable Anti‑tiling UV (offset only).
      - Enable Anti‑tiling rotation.
      - Enable UV warp (if applicable).
    - Variation contribution toggles:
      - Enable roughness variation contribution.
      - Enable tint/value/saturation contribution.
      - Enable AO/ORM remap usage.
      - Enable normalFactor contribution (macro/micro layers affecting normal strength).
    - Normal map handling toggles:
      - Use original `vNormalMapUv` vs transformed UV for tangent basis reconstruction.
      - Flip normal Y (green channel) for diagnostic purposes.
  - Include a “Reset to Defaults” button and a small text readout showing which toggles are active (so screenshots are self-describing).
  - Ensure debug toggles can be enabled without changing saved building data (debug-only, session-only state).
- Identify the exact cause of the inversion:
  - Confirm whether it’s a normal map convention mismatch (OpenGL vs DirectX green channel), a tangent basis issue, UV transform issue, or shader injection ordering bug.
  - Verify whether the problem only occurs when Material Variation defines/patches are active (`USE_MATVAR`) and disappears when disabled.
  - Check whether the normal map used for red brick differs between variation-enabled and variation-disabled paths (e.g., `normal_gl` vs `normal_dx`, texture `flipY`, or `normalScale.y` changes).
- Implement a fix that keeps shading consistent:
  - Ensure mat-var UV transforms (anti-tiling rotation/warp/stair shift) do not corrupt tangent-space normal reconstruction.
  - Ensure the same normal convention is used before/after enabling variation (including correct `normalScale` sign and texture selection).
  - Keep visuals stable across other PBR materials as well (avoid fixing red brick by breaking others).
- Add a minimal browser-run test (or debug check) that validates the “variation enabled” shader path does not invert normals:
  - Prefer testing deterministic code paths (material config normalization, shader string patch invariants, or a small renderless sanity check that prevents regression).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_150_DONE_BUILDINGS_material_variation_enabling_flips_normal_map_lighting_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

Summary:
- Fixed the mat-var normal-map shader path so enabling Material Variation no longer inverts perceived lighting.
- Added a Building Fabrication “Material variation debug” panel with session-only toggles + reset + self-describing readout.
- Added/updated browser-run tests to lock in the mat-var debug uniforms and normal perturbation implementation.
