# Species showroom video

## Matched leaf close-ups

`phase=closeups` renders both the accepted high-detail reference and installed
LOD0, with identical cameras, lighting and world-space placement. It retains
the full tree and frames an outer shoot twice: a wider branchlet study and an
upward leaf-underside study. No leaves are moved or selectively removed.

```sh
node tools/bake.mjs --target vegetation/turntable --set vegetation/turntable:phase=closeups --set vegetation/turntable:width=1280 --set vegetation/turntable:output=tests/artifacts/screens/vegetation_leaf_closeups/review
```

Use a dedicated output directory. `width` is each source image's width, with
4:3 framing. The phase writes twenty source PNGs for all five species, camera
and source-hash receipts, five labeled comparison sheets and an HTML index.
The shared `browserExecutable` renders the sheets after checking image hashes,
dimensions and matched camera records. `species` and `variant` also apply.

## Orbit videos

Render a 360-degree orbit of one mature reference or LOD0 specimen per species in headless
Eevee, with common and botanical names visible throughout each clip.

```sh
node tools/bake.mjs --target vegetation/turntable --set vegetation/turntable:phase=proof
node tools/bake.mjs --target vegetation/turntable --set vegetation/turntable:phase=render
node tools/bake.mjs --target vegetation/turntable --set vegetation/turntable:phase=assemble
```

Defaults: five species, mature_01, 1920×1080, 24 fps, twelve seconds per species,
32 Eevee samples. `species`, `variant`, `width`, `fps`, `seconds` and `samples`
bound a proof or render. Four proof angles check framing and foliage before
animation. `inspect` records the installed Blender media API without rendering.

Use `representation=reference` with a separate `output` to render the immutable
AI588 high-detail source, including its detailed wood and original solid-leaf
instances. `reference` selects the source directory and `reference-receipt`
selects its accepted LOD bake fingerprint; the entire scene must match before
loading. No mesh reduction or alpha-card substitution occurs in reference mode.
The footer and receipts identify the representation. For example, run proof,
render, then assemble with these same extra options:

```sh
node tools/bake.mjs --target vegetation/turntable --set vegetation/turntable:representation=reference --set vegetation/turntable:phase=proof --set vegetation/turntable:output=tests/artifacts/screens/vegetation_turntable/references
```

Uses the existing shared `tools/baking/blender.local.json` executable and native
Blender H.264 encoding; no separate FFmpeg installation or machine-specific
command. The accepted compressed LOD0 source hashes must match the installed
library, and the exact decoded review GLBs supply Blender's textures. Clips
are resumed only when their input identity and movie hash match. Assembly checks
every clip's dimensions and frame count, then verifies the final movie.

The neutral stage, lights, animated cameras, labeled clips, editable scenes and
final video stay under `tests/artifacts/screens/vegetation_turntable/final/`.
The explicit leaf is excluded from production defaults and rejects publication.
Trees, textures, existing placements and other Blender sessions remain untouched.

API reference: [Blender 5.0 Python changes](https://developer.blender.org/docs/release_notes/5.0/python_api/)
documents the Eevee identifier and image/video media settings used here.

## Revised natural references

Set `representation=reference` and `reference-index` to the complete staged
natural-foliage `summary.json`. Every specimen hash must match the index, whose
original provenance must match the accepted reference receipt. The renderer
loads detailed wood, curved branchlets and solid 3D leaves from the revised
per-model files. It checks the rendered instance count against the manifest.
`reference-index` is not supported by the older fixed-stride close-up phase.

Run `proof`, `render`, then `assemble` with identical options and a fresh output:

```sh
node tools/bake.mjs --target vegetation/turntable --set vegetation/turntable:representation=reference --set vegetation/turntable:reference-index=tests/artifacts/screens/vegetation_natural_foliage/coverage_20261011/summary.json --set vegetation/turntable:phase=proof --set vegetation/turntable:seconds=8 --set vegetation/turntable:samples=16 --set vegetation/turntable:output=tests/artifacts/screens/vegetation_turntable/20261011_fuller_references
```

Assembly also verifies that the four-angle previews use the movie's exact source
and settings, writes an HTML video gallery, and captures a labeled five-species
overview using the shared headless browser configuration.

The key light casts shadows; fill and rim lights illuminate without additional
shadow passes. This keeps one coherent stage shadow and avoids repeatedly drawing
the full reference geometry into three shadow systems for every orbit frame.
`threads` bounds CPU worker use from one to eight, defaulting to two. Solid leaves
remain instanced in the showroom to keep reference memory use bounded.
