# Independent city authoring

Run `node tools/bake.mjs --target city/standalone-check` (or the `city` parent). This explicit authoring target
is outside production `all`. It uses the existing `tools/baking/blender.local.json` executable and the framework's
isolated Blender lifecycle, input hashes, run lock and validation receipts. It does not claim lighting compiler
certification or publish assets.

The leaf starts with a new, empty `blender_files/city-candidates/<run-id>/` root. It imports fifteen game FBX trees
and the installed street lamp through `blender/scripts/city/build_context.py`, then runs `build_city.py`. Outputs:

- `city/city_context_library.blend`
- `city/city.blend`
- `city/city_site.json`

`BLENDER_FILES_ROOT` may select another shared generated-files root. Existing candidate destinations and
`--publish` are rejected. No source `.blend`, hero script or hero-generated file is an input. The context and city
are reopened; validation checks collection/rig ownership, image and library dependencies, imported source modules
and the absence of hero files. The context contains sixteen objects and no linked libraries. All external images
must resolve to installed game assets; city libraries must stay inside the new city's directory.

The receipt authenticates all three output hashes. This structural gate does not replace the AI 651 visual gate:
relink fresh copies of both current compositions to the candidate city, then compare the six fixed views through
`blender/scripts/validation/parity_render.py` and `parity_compare.py`. Preserve active compositions and create an
external dated backup before any later replacement. Phase 5's complete hero regeneration is separate.

City-owned measured defaults and their history are documented in
[`blender/scripts/city/README.md`](../../blender/scripts/city/README.md) and `city_site.py`.

`node tools/bake.mjs --target city/rebuild-all` invokes the same context-then-city build order through
`blender/scripts/city/rebuild_all.py`, the common full-regeneration orchestrator. It additionally requires the
shared `pythonExecutable` setting. Outputs go into a fresh `blender_files/rebuild-candidates/city/<run-id>/`.
It takes no hero source, baseline or generated-file input, refuses publication, reopens its outputs and
authenticates every saved hash. It remains outside production `all` and does not change the `city` parent default.
