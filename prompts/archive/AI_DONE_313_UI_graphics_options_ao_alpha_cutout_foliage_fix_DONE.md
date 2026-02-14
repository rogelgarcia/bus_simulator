# DONE

#Problem

When Ambient Occlusion (AO) is enabled (SSAO or GTAO), tree leaves and other foliage that use alpha textures on flat planes (“leaf cards”) produce incorrect occlusion:

- AO darkens/shadows areas that are visually transparent (alpha = 0).
- This happens because SSAO/GTAO rely on depth/normal buffers, and alpha-blended foliage planes still write depth as if the whole quad were solid.
- The result is “phantom occlusion” in the transparent parts of leaf textures.

We need a fix that supports foliage materials while allowing different quality/performance tradeoffs.

# Request

Fix SSAO/GTAO alpha foliage artifacts and expose the relevant strategy as options under **Graphics → Ambient Occlusion**.

Tasks:
- Implement a robust AO foliage handling strategy so transparent leaf card pixels do not create AO where they should be empty.
- Provide multiple solution options with different cost/quality and expose them in the AO options menu.
- Ensure the solution works for both SSAO and GTAO passes currently used by the game.
- Document any required authoring/material conventions for foliage (e.g., alpha test threshold).

## Strategy options (choose defaults; expose in UI)

Add an AO setting (and UI control) that defines how foliage/alpha materials are treated by AO:

1) **Alpha-test foliage for AO depth** (recommended default, low cost)
   - Enforce/enable alpha-test behavior for foliage materials in the AO depth/normal stage:
     - `transparent = false`
     - `alphaTest = threshold` (user-adjustable)
     - `depthWrite = true`
   - Optionally enable MSAA-friendly smoothing where supported:
     - `alphaToCoverage = true` when MSAA is active (if feasible)
   - Notes:
     - This creates correct “holes” in depth for fully transparent pixels.
     - Edges may be sharper than blended alpha; threshold is tuneable.

2) **Exclude foliage from AO** (cheapest, lowest quality)
   - Render AO from opaque-only depth/normal, excluding objects/materials tagged as foliage/alpha.
   - Composite AO onto the main scene excluding foliage.
   - Notes:
     - Eliminates artifacts completely.
     - Leaves won’t contribute occlusion (may look slightly less grounded).

3) **Dithered cutout for AO** (higher quality edges, moderate cost) (optional)
   - Use a screen-space or hashed alpha technique during the AO depth/normal stage to approximate partial coverage:
     - alpha-hash/dither instead of hard alphaTest threshold
   - Notes:
     - Better edge stability than hard cutout.
     - More complex and can introduce noise if not filtered well.

## Required engine/plumbing changes

- Add an AO “alpha handling” setting to the persisted AO settings model (defaults + sanitization).
- Add AO UI controls under `Graphics → Ambient Occlusion`:
  - `Alpha handling` (choice): `alpha_test | exclude | dither` (as implemented)
  - `Alpha threshold` slider (only when `alpha_test` is selected)
  - If `dither` is implemented: a `Dither strength` or `Dither scale` (optional)
- Update `PostProcessingPipeline` AO setup so SSAO/GTAO receives a depth/normal input that respects the selected alpha handling option.
  - Important: if SSAO/GTAO uses internal override materials for depth/normal, ensure the override respects alpha maps and thresholds for foliage.

## Options UI behavior (additional requirement)

Improve the Ambient Occlusion options UX so that only the parameters for the currently selected AO mode are shown:
- When `Mode = SSAO`, show only SSAO controls (intensity/radius/quality + alpha handling controls).
- When `Mode = GTAO`, show only GTAO controls (intensity/radius/quality/denoise + alpha handling controls).
- When `Mode = Off`, hide both SSAO and GTAO parameter groups (alpha handling controls may be hidden as well since AO is disabled).

Layout constraint:
- Keep the section layout “fixed” (no vertical reflow/jumping when switching modes) by rendering both parameter groups but toggling visibility:
  - Use `visible = false` for the inactive group(s) so they do not render but the layout can be kept stable.
  - Position the SSAO and GTAO parameter groups so they overlap at the top of the AO section (implementation-defined), avoiding large layout changes.

## Material authoring / tagging

Define a first-pass way to identify foliage/alpha-cutout geometry, such as:
- `material.userData.isFoliage = true` (or similar tag), and/or
- object layer membership (e.g., `LAYER_FOLIAGE`), and/or
- name-based conventions (not preferred, but acceptable as a temporary fallback).

## Validation / testing

- Add a deterministic repro scene (or debug tool toggle) containing:
  - a plane with an alpha leaf texture
  - a nearby wall/ground behind it
- Verify:
  - With AO enabled, transparent pixels do not create phantom occlusion.
  - The chosen option behaves as expected (alpha-test vs exclude).
  - Performance remains acceptable at the target quality presets.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_313_UI_graphics_options_ao_alpha_cutout_foliage_fix_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (implemented)

- Added `ambientOcclusion.alpha` settings (handling + threshold) and surfaced them in `Graphics → Ambient Occlusion`.
- Updated `PostProcessingPipeline` SSAO/GTAO setup so AO depth/normal respects alpha-cutout foliage via AO override materials.
- Tagged tree leaf materials with `material.userData.isFoliage = true`.
- Added `debug_tools/ao_foliage_debug.html` repro scene and registered it in `src/states/DebugToolRegistry.js`.
- Added node unit coverage for AO settings sanitization + persistence.
