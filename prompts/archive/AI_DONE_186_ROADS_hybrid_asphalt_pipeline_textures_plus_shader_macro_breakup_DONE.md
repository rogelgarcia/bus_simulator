DONE
#Problem

Our road/asphalt look needs to be both realistic up close and non-repetitive across huge city road areas. Texture-only asphalt often tiles noticeably at distance, while shader-only procedural noise can look “CG”/plastic when the camera gets close. The best results are typically a hybrid:

- Textures provide believable micro detail (aggregate, pores, tiny cracks) via albedo + normal + roughness (and optionally height/AO).
- Shader/procedural noise provides believable macro variation (patchiness, tire wear, dirt, subtle color shifts) and helps kill tiling over very large surfaces.


Note: The current configurations for coarse and fine effects are good. The goal now is to keep those as the baseline and expand the system with more art-direction controls (overall color adjustments) and additional “lived-in” effects (dirt accumulation, cracks, corner wear) that remain subtle and believable.


### Use shader noise as an overlay (recommended for big city roads)

Best when:
- Roads are huge and tiling becomes obvious.
- You want “lived-in” asphalt: stains, fading, patch repairs, subtle gradients.
- You want to avoid storing many huge textures.

Shader noise is great for:
- macro tint variation (slightly warmer/cooler patches)
- roughness variation (some areas shinier / more worn)
- dirt accumulation near curbs
- wetness mask (puddles or damp patches)

# Request

Implement a “correct” asphalt pipeline that uses the current procedural pbr textures for micro detail, plus subtle world-space shader macro variation to break tiling and add lived-in realism.

Tasks:
- Keep the base asphalt material built on PBR textures (tileable, consistent normal + roughness response).

- Add art-direction color controls on top of the base material so we can tune the overall asphalt look without swapping textures:
  - Overall brightness/darkness control (value).
  - Subtle hue/tint shift control (warm/cool bias).
  - Optional saturation control (keep realistic ranges; avoid “gamey” oversaturation).

- Add additional “lived-in” shader overlays (subtle, mostly macro-to-mid scale), beyond generic noise:
  - Dirt buildup near road edges/corners (ex: curb-adjacent grime / accumulation mask).
  - Crack and patch-repair breakup (very subtle; should not read as a procedural pattern up close).
  - Tire wear / polished areas as roughness variation where appropriate.
- Add localized features using decals or separate meshes (not baked into the base asphalt):
  - cracks, repaired patches, oil stains, manhole grime, lane markings.
- Make the system configurable and tunable:
  - Provide clear parameters for the new color controls and “lived-in” overlays (strengths and scales).

- Verify behavior in both close-up and long-distance views:
  - Up close: reads like real asphalt (micro detail).
  - Far away: reduced tiling/repetition; macro breakup looks natural and not camo/plastic.

- Update the asphalt setup screen with the shader configurations and controls for easy tweaking by artists.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_186_ROADS_hybrid_asphalt_pipeline_textures_plus_shader_macro_breakup_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Extended asphalt settings with art-direction controls (value, warm/cool tint, saturation) and lived-in overlays (edge dirt, cracks, patch repairs, tire wear).
- Updated asphalt material pipeline to apply color controls + new macro overlays on top of existing coarse/fine baseline.
- Added an edge-wear overlay mesh (inward strip) with a dedicated shader for curb-adjacent grime and roughness buildup.
- Updated the Options Asphalt tab to expose the new controls and apply them live.
