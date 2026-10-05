# Mature vegetation Cycles showcase

Run through the shared, isolated headless Blender configuration:

```powershell
node tools/bake.mjs --target vegetation/showcase --timeout-seconds 7200
```

The explicit review job is excluded from `vegetation` authoring and production
`all`. It rejects `--publish`. It authenticates installed editable tree sources,
builds five separate plots with all three mature variants, packs their maps,
and saves `mature_tree_arboretum.blend`. Twenty-one named cameras cover the complete
layout, two full views and two close-ups per species. Outputs remain under the
ignored directory `tests/artifacts/screens/ai585_warm_bark/run-<timestamp>/`.
The preceding AI584 scene and eleven-view render set remain available unchanged.

To build separately, set `vegetation/showcase:phase=build`. Render a saved scene
with `phase=render` and `scene=<scene directory>`. `views` accepts `all` or a
comma-separated set of saved camera names. `width` defaults to 2560 (16:9),
`samples` to 128; `--device CPU` or `--device OPTIX` overrides the shared device.
No silent renderer/device fallback is allowed. CPU renders use four threads.

Original wood geometry is appended unchanged. `bark_appearance.py` applies the
requested darker brown color to the connected bark albedo in the editable scene,
after the original texture/vertex-color combination. Species-specific linear
RGB multipliers retain local variation, normal maps and roughness. The material
revision and exact tints are recorded per model. This is a scene material edit;
the published source library is not recolored by this review-only job.
The shared deterministic foliage generator
supplies identical templates, transforms, UVs and colors to Geometry Nodes
instances. Counts, virtual triangles and bounds are checked against each
installed manifest. This avoids expanding repeated leaves solely for a render;
it does not create game LODs or change the asset library. Instancer color uses
the [Blender Attribute node](https://docs.blender.org/manual/en/latest/render/shader_nodes/input/attribute.html).

Brown Mud reuses the original CC0 4K color, roughness and OpenGL normal maps at
their 1.3 m physical scale. The CC0 Kloofendal pure-sky 4K HDRI supplies both
the visible background and environment. Its solar core is removed from the
lighting map and integrated into one aligned Sun to avoid double sunlight.
Nine randomly offset texture samples blend across compact smooth world-space
weights to suppress ground repetition. Color, normal and roughness share their
offsets. The original maps and their physical texel scale are unchanged; no UV
warping, zooming or image recoloring is used.
Source HDRI pixels remain the visible background. AgX display transform, Cycles
indirect bounces, denoising and mild leaf tissue scattering are scene-only.

The packed scene contains every plot simultaneously. Species renders hide the
other plot collections; hero views also isolate mature_01 and fit its complete
bounds with a six-percent image margin. The overview shows all fifteen models.
The scene JSON
records inventory, source bounds checks, plot layout, cameras and lighting.
`gallery.html` groups the untouched full-resolution PNGs and links the editable
scene. Validation rejects missing images, wrong dimensions and duplicate poses.

Close-ups isolate mature_01: `trunk_closeup` frames an authored primary branch
junction (or the shrub's lower stems); `roots_closeup` shows basal flare and soil
contact. They use 72 mm cameras, the same daylight/exposure as the full views,
and retain the leaves. The gallery labels all close-ups explicitly. Version 1
saved scenes remain renderable with their original eleven-camera contract.
