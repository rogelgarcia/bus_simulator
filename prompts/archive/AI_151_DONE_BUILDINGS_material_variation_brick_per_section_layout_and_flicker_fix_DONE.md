# DONE

#Problem

The Material Variation system has a brick-specific section, but brick variation currently uses a single global brick layout pattern across all subsections/areas. This makes different building sections look unnaturally synchronized (the brick grid aligns the same way everywhere). Additionally, enabling “per-brick variation” causes visible flickering.

# Request

Improve brick material variation so each subsection can have its own brick layout, and fix the flickering when per-brick variation is enabled.

Tasks:
- Allow each relevant subsection/root (e.g., building fabrication layer/section) to have its own brick layout parameters instead of relying on a single global brick layout.
  - Ensure subsections can vary brick layout independently (e.g., bricksPerTileX/Y, mortarWidth, offsets/phase/rotation if applicable).
  - Keep defaults sensible so existing buildings look similar unless explicitly changed.
  - Ensure serialization/backward compatibility: existing configs that rely on the global layout continue to render the same, but new configs can override per subsection.
- Fix flickering when per-brick variation is enabled:
  - Reproduce the flicker reliably and identify its root cause (unstable hash input, time-dependent seed, precision/derivative instability, UV discontinuities, camera-dependent planar mapping, or aliasing from high-frequency noise).
  - Make the per-brick randomization deterministic and stable across frames/camera motion:
    - Ensure the hash/seed basis is derived from stable inputs (brick cell id + stable seed) rather than values that change with view derivatives or precision noise.
    - Avoid discontinuities at brick boundaries that can cause temporal aliasing; if necessary, add smoothing or reduce frequency at distance.
  - Verify the fix across common brick materials (including red brick) and with/without anti-tiling enabled.
- Add minimal browser-run tests for the new config normalization/backward compatibility and for deterministic per-brick hashing inputs (where feasible without rendering).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_151_DONE_BUILDINGS_material_variation_brick_per_section_layout_and_flicker_fix_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

Summary:
- Added per-section brick layout offsets (`offsetX`/`offsetY`) with shader support and Building Fabrication UI controls.
- Reduced per-brick flicker by fading per-brick variation based on pixel footprint (derivative-based).
- Added browser tests for brick layout normalization/backward compatibility and for stable per-brick hashing inputs.
