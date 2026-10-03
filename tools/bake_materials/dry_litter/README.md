# Dry litter data-map repair

Run `node tools/bake.mjs --target materials/dry_litter --publish`.
Uses `pythonExecutable` from the shared gitignored `tools/baking/blender.local.json`
and Pillow. No Blender process or separate machine configuration is needed.

The supplied archive's ORM and roughness PNGs are truncated (939 and 358 complete
rows respectively). Their original bytes and the intact AO map are retained in
`assets/public/pbr/dry_litter/source/`. The job keeps all 939 valid roughness rows,
checks the first 358 against the separate roughness map, restores exact AO, and
sets metallic to zero as authored. Only the missing 85 roughness rows are filled
with a smooth per-column bridge from the last valid row to the opposite edge.
This is a bounded reconstruction, not recovery of the missing original data.

Strict PNG decoding, pixel equality, roughness bounds, source hashes and output
hash validation precede optional atomic publication. The damaged original is
retained for audit/rollback; albedo, normal, height and opacity maps are unchanged.
