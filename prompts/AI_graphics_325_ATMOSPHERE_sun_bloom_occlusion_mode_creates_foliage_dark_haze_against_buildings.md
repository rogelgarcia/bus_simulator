#Problem

Distance-dependent dark shading/haze appears around tree foliage when **Sun Bloom** is set to **Mode = occlusion** (occlusion-aware path).  
The artifact is most visible when foliage is seen against **buildings/opaque geometry** and is not visible (or is much lower) when foliage is seen against the sky.

Key observations from repro:
- `AO = Off` and `Shadows = Off` do not remove the artifact.
- `Sun Bloom mode = selective` does not show the occlusion-aware distance fog tint on buildings, but foliage shading uses this selective-look coloration.
- `Sun Bloom mode = occlusion` changes distant building color (fog-like/tinted look), but foliage shading around leaves does not follow that mode change and appears to stay in the selective-mode color response.
- This indicates a mode mismatch/inconsistent compositing path: background/buildings react to occlusion-aware mode while foliage-adjacent shading appears sampled/composited from a different path.
- The issue becomes more apparent with distance.

# Request

Fix Sun Bloom occlusion-aware behavior so foliage does not produce unintended dark haze/shading against background buildings while preserving intended sun/occlusion bloom behavior.

Tasks:
- Reproduce and isolate the artifact in the Sun Bloom occlusion pipeline using foliage + opaque background geometry.
- Ensure occlusion-aware mode does not introduce darkening around alpha-cutout foliage cards at distance.
- Ensure foliage shading/color response is driven by the same bloom mode path as the rest of the scene (no selective/occlusion mixing in final composite).
- Keep the visual intent of occlusion-aware sun bloom (sun occlusion behavior) intact.
- Ensure behavior remains stable across camera distance changes and does not introduce new halo/flicker regressions.
- Add deterministic regression coverage for this scenario (foliage against sky vs foliage against opaque building background).
- Confirm selective mode remains unchanged.

## Validation expectations
- With `Sun Bloom mode = selective`: foliage and background should both show selective-mode-consistent color response (no occlusion-aware distance tint leakage).
- With `Sun Bloom mode = occlusion`: distant buildings and foliage-adjacent shading should both switch consistently to the occlusion-aware response.
- No persistent selective-mode foliage shading should remain when occlusion-aware mode is active.
- Foliage should not gain extra dark shading/haze when background is buildings.
- Artifact should not appear solely due to distance.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line.
- Rename the file in `prompts/` to `prompts/AI_DONE_graphics_325_ATMOSPHERE_sun_bloom_occlusion_mode_creates_foliage_dark_haze_against_buildings_DONE.md`.
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change).
