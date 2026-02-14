# DONE

## Summary
- Add AO mode selector (Off / SSAO / GTAO) and GTAO controls (intensity/radius/quality/denoise) in Graphics options.
- Integrate GTAO into the post-processing pipeline with live mode switching (no reload).
- Share AO persistence + preset export/import with SSAO.

#Problem

The game currently lacks screen-space ambient occlusion (AO), which makes scenes look less grounded and less realistic compared to raytraced renders. SSAO helps, but a more modern AO technique (GTAO) can look cleaner and more stable at similar or slightly higher cost, especially for large-scale outdoor scenes.

We want an AO option that can better approximate “ground-truth” ambient occlusion (within the constraints of rasterization), while still being optional and performance-aware.

# Request

Add **GTAO (Ground-Truth Ambient Occlusion)** as an optional post-processing effect, configurable from the Options UI under the **Graphics** tab.

Tasks:
- Graphics options UI:
  - Under Graphics → Ambient Occlusion:
    - Add a user-facing control to select AO mode (at minimum: Off, SSAO, GTAO), or add a GTAO toggle if an AO mode selector is not available yet.
    - Provide GTAO-specific controls (keep defaults sane; expose only what is needed):
      - Intensity/strength
      - Radius (world-ish scale)
      - Quality preset (Low/Medium/High) OR sample count/steps
      - Optional denoise/blur (or preset-driven)
  - Persist settings like other graphics options (survive reload).
- Runtime behavior:
  - GTAO applies to the main gameplay renderer/postprocessing pipeline.
  - Switching AO mode should take effect without a full page reload (unless technically impossible; if so, show a note).
  - GTAO and SSAO should not stack; selecting one disables the other.
- Performance considerations:
  - Provide a “Low” mode with acceptable cost on weaker GPUs.
  - Prefer stability over noise (avoid shimmering with camera motion).
  - Consider optional temporal stabilization if the engine already supports TAA/jitter.
- Visual correctness:
  - GTAO should improve grounding (contacts/creases) with fewer halos and better stability than SSAO at comparable settings.
  - Keep AO subtle; avoid overly dark, “dirty” corners.
- Scope:
  - Options/UI + postprocessing only; no changes to mesh generation.

## Proposal (optional implementation ideas)
- If a GTAO pass exists in the project’s Three version or can be implemented as a custom shader pass, integrate it into the existing postprocessing pipeline.
- Consider a shared AO settings object with per-mode overrides, so UI and persistence remain consistent as more AO modes are added.

## Quick verification
- Options → Graphics has Ambient Occlusion controls including GTAO mode (or GTAO toggle).
- Selecting GTAO produces cleaner, more stable contact occlusion than SSAO in the same scenes.
- Switching between Off/SSAO/GTAO is immediate (or clearly communicated if restart required).
- Settings persist after reload.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_304_UI_graphics_options_gtao_ground_truth_ambient_occlusion_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
