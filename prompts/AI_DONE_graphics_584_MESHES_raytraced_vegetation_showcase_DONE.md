DONE

# Problem

The mature vegetation library needs a cohesive outdoor ray-traced review scene.

# Request

Use headless Blender to place every mature variant in a separate area for each
species, add a sky HDRI and sun, reuse the existing dirt texture, and render
several camera poses.

Tasks:
- Preserve all 15 mature models and group the three forms of each species.
- Create an editable scene with photographic sky lighting and Brown Mud ground.
- Render and visually inspect overview and species views using Cycles.
- Reuse the shared offline baking framework and keep scene/render evidence under
  `tests/artifacts/screens/ai584_vegetation_cycles/`.

## On completion
- Mark DONE in the first line and rename to `AI_DONE_graphics_584_MESHES_raytraced_vegetation_showcase_DONE.md`.
- Add a high-level completion summary and evidence paths.

## Completion

- Created one packed editable Blender scene with all 15 original mature models
  in five separated species plots, preserving original wood and reconstructing
  833,332 solid leaves with exact seeded instances.
- Reused the CC0 Kloofendal 4K sky and Brown Mud maps; matched the Sun to the
  photographed solar core and removed duplicated direct energy from the sky.
- Suppressed repeating dirt tiles with smoothly weighted random texture offsets
  that preserve physical texel scale and align color, roughness and normals.
- Rendered and visually reviewed 11 Cycles PNGs at 2560×1440, 128 adaptive samples,
  AgX, denoising and RTX 3060 OptiX. Actual final render time totals 296 seconds.
- Validated all source Blender hashes, 15 foliage counts/triangle counts/bounds,
  five closed-leaf unit tests, image dimensions and distinct camera outputs.
- Registered the explicit artifact-only bake leaf with the shared framework;
  original asset publication and production gameplay remain untouched.

Final handoff: `tests/artifacts/screens/ai584_vegetation_cycles/final/` contains
`gallery.html`, eleven unmodified PNGs, `mature_tree_arboretum.blend` (1.38 GB),
scene/render metadata and a completion receipt. Final build source:
`run-1791062025495`; final rendered source: `run-1791062135462` in the same topic.
Framework render receipt:
`tests/artifacts/screens/ai556_bake_framework/run-1791062134515-27496-4b67e743/summary.json`.
