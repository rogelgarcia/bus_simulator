# DONE

#Problem

AO is still causing visible dark shading on foliage/leaves, and foliage-related flicker remains when AO is enabled.

Current behavior is still incorrect after prior fixes:
- Leaves/cutout foliage can darken against buildings/opaque backgrounds when AO is on.
- Foliage shading can flicker/shimmer over distance/camera movement.
- Prior workaround attempts appear to have reduced quality in some areas (for example mipmapping and related foliage quality paths), and quality should not be sacrificed to hide the artifact.

# Request

Fix AO foliage behavior so leaf/cutout foliage no longer gets unintended dark haze or flicker, while preserving intended AO on the rest of the scene and restoring/keeping expected foliage quality.

Tasks:
- Reproduce and isolate the remaining AO-driven foliage darkening in gameplay-representative scenes.
- Reproduce and isolate the AO-related foliage flicker/shimmer under camera motion and distance changes.
- Ensure AO does not add unintended dark shading around foliage alpha-cutout regions against opaque backgrounds.
- Ensure foliage rendering remains visually stable frame-to-frame with AO enabled (no persistent AO flicker artifacts).
- Preserve intended AO contribution on non-foliage world geometry.
- Ensure SSAO/GTAO/static AO composition remains balanced and does not create double-darkening on foliage.
- Re-enable and preserve foliage quality paths that may have been reduced during prior mitigation attempts (including mipmapping and other relevant foliage-quality features), unless a specific quality reduction is proven necessary.
- Ensure Sun Bloom behavior from AI 325 remains correct and does not regress while fixing AO behavior.
- Add deterministic regression coverage for both: (1) foliage darkening against opaque backgrounds and (2) foliage stability/flicker under motion.
- Verify behavior in both debug repro scenes and normal gameplay rendering paths.

## Validation expectations
- With AO enabled, foliage should not gain extra dark haze/shading solely from alpha-cutout/background interactions.
- With AO enabled, foliage shading should remain stable across camera movement and distance changes (no AO flicker/shimmer artifacts).
- Non-foliage AO contacts should remain visible and believable.
- Previously fixed Sun Bloom occlusion behavior should remain intact.
- Foliage visual quality should not be degraded as a side effect of the AO fix.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line.
- Rename the file in `prompts/` to `prompts/AI_DONE_graphics_326_MATERIAL_ao_foliage_darkening_and_flicker_persists_DONE.md`.
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change).

## Summary (implemented)
- Removed forced foliage exclusion from AO override handling and restored alpha-cutout AO depth behavior so foliage pixels no longer inherit background AO darkening.
- Made AO alpha handling apply reliably to active AO override materials and made threshold controls drive the AO cutout threshold directly.
- Restored foliage quality paths in tree materials/textures (leaf + leaf-normal mipmapping/anisotropy, normal map usage, and alpha-to-coverage cutout rendering).
- Added deterministic coverage for AO foliage behavior in debug and gameplay paths, including GTAO baseline darkening checks and a gameplay motion-stability regression for both SSAO and GTAO.
