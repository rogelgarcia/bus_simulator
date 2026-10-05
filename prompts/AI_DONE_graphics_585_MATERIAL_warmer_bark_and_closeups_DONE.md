DONE

# Problem

The trunks look too gray in the ray-traced vegetation scene. The render set also
needs close views that reveal the bark and root detail.

# Request

Make all trunks more brown and darker, regenerate the scene and its existing
views, and add close-ups for each species using the existing headless workflow.

Tasks:
- Warm and darken bark on all 15 mature models in the editable Blender scene.
- Retain visible grain, mottling, furrows and other original surface variation.
- Regenerate the overview and species views under the same HDRI, sun and exposure.
- Add branch-junction and root/ground close-ups for all five species.
- Review the images and save the scene, renders and gallery under
  `tests/artifacts/screens/ai585_warm_bark/`.

## On completion
- Mark DONE on the first line and rename to `AI_DONE_graphics_585_MATERIAL_warmer_bark_and_closeups_DONE.md`.
- Record the final artifacts and relevant validation results.

## Completion

- Applied darker, warmer species-specific bark materials to all 15 models in the editable showcase scene, retaining original texture variation and surface relief.
- Regenerated the overview and species views and added ten trunk/branch and root/ground close-ups through the shared `vegetation/showcase` headless bake leaf.
- Rendered and visually reviewed all 21 PNGs at 2560x1440 with Cycles, OptiX and 128 adaptive samples; actual image rendering took 596.81 seconds.
- Verified the original lighting, geometry counts and exact foliage bounds remain unchanged; all 15 source models were authenticated and validated by the build.
- Verified scene/image copy hashes, distinct render outputs, dimensions and local gallery links. The source asset library and gameplay trees remain unchanged.
- Final scene, images, gallery and completion receipt: `tests/artifacts/screens/ai585_warm_bark/final/`.
- Framework receipt: `tests/artifacts/screens/ai556_bake_framework/run-1791073832246-45164-1cf21e0c/summary.json`.
