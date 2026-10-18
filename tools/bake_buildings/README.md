# Building authoring

`node tools/bake.mjs --target buildings/bradbury/baseline` regenerates a new Bradbury baseline candidate.
It uses the existing `executable` in `tools/baking/blender.local.json` and an isolated background process.
The user must reserve the input/output files first; it never attaches to an interactive Blender session.

The explicit `buildings` parent currently contains only the baseline leaf and is excluded from production `all`.
`node tools/bake_buildings/run.mjs --dry-run` shows the same plan. It does not require the lighting compiler's
pinned archive: this is a glTF authoring import, not a certified lighting bake. The executable, import scripts,
recipe, retained export, expected structural contract and installed texture bytes enter job identity.

Default output: a fresh `blender_files/bradbury/baseline/candidates/<run-id>/bradbury_block_before.blend`.
Use `--set buildings/bradbury/baseline:output=blender_files/<new-path>.blend` to select a new output.
Use `--set buildings/bradbury/baseline:glb=blender_inputs/<new-export>.glb` to validate a fresh game export against
the same retained structural contract; omit it to use the original GLB.
`BLENDER_FILES_ROOT` redirects the permitted output root. Existing files are always refused. A failed structural
comparison saves no blend; a failed reopen check retains the rejected candidate and a failure report for diagnosis.

Validation compares the original's objects, names, transforms, bounds, mesh topology/UVs, material slots and
assignments, shader graphs, image identities, collections and inspection rig. Geometry/image hashes must match
exactly; matrix values allow 0.00001 for Blender decomposition. Generated render-result/viewer buffers are excluded.
`--publish` is rejected. A candidate does not replace the active baseline or rebuild any downstream building.
Before any later replacement, preserve the affected files in a new external dated backup with `MANIFEST.md`.

See [the round trip and provenance limits](../../blender/README.md) and
[the layout contract](../../specs/tools/blender_authoring_layout.md).

## Terra & Mar catalog validation

`node tools/bake.mjs --target buildings/terramar/catalog-check` is a separate explicit leaf, outside `buildings`
and production `all`. It uses the same configured Blender executable and requires Node on PATH for the catalog
bridge. Trace the two signs from installed opacity with the configured Python first; see the Blender guide.

The job builds all five parts, their entry and the city composition under a new
`blender_files/terramar/catalog-candidates/<run-id>/` root. It copies/rebases the retained baseline and existing
city dependencies, without changing the originals. Scripts, installed maps, traced signs, decoded vegetation,
baseline/city inputs and the toolchain enter job identity. Each candidate reopens with all images/libraries
resolved, and its receipt authenticates the saved hash. A failed run is retained for diagnosis; existing output
directories and `--publish` are rejected. No active scene is replaced.

This structural check must be followed by the existing AI 651 `ref_3q,rear_3q,entrance` render parity gate. It does
not regenerate the baseline, decode vegetation, build an independent city, or replace Phase 5's full workflow.

## Full regeneration

Run `node tools/bake.mjs --target buildings/rebuild-all` to generate both heroes and the city from retained
GLB/JSON inputs and installed game assets. The independent leaves `buildings/bradbury/rebuild` and
`buildings/terramar/rebuild` generate one hero plus its city. These explicit leaves stay outside the `buildings`
and production `all` parents. They use `executable` and `pythonExecutable` from the shared local configuration.

Each run creates `blender_files/rebuild-candidates/<all|bradbury|terramar>/<run-id>/` from empty. No previous blend
is copied. The per-family `blender/scripts/<family>/rebuild_all.py` stages run sequentially with two Blender CPU
threads, isolated temporary/config/cache directories and below-normal priority on Windows. Preview renders are
skipped; all authoring geometry, materials, wear, linked parts and composition rigs are still built. Terra & Mar's
sign traces and decoded vegetation are generated inside the candidate instead of overwriting preserved inputs.

Every blend reopens with libraries contained in the candidate and images in the candidate or installed assets.
Building entries retain their single named root collection. Output hashes authenticate the receipt. Existing
destinations and `--publish` are refused. A validated build still requires the separate six-view AI 651 visual
comparison before acceptance; it does not replace active scenes. Logs and receipts live in the framework run's
ignored screen-artifact directory. Failed candidates remain available for diagnosis.
