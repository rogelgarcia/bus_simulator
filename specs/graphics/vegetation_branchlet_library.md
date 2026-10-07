# Installed branchlet LOD assets

The final AI594 trees belong in `assets/public/vegetation_lods/`, with five
species directories and six GLBs per species: three mature variants at LOD0
and LOD1. Files retain embedded UASTC PBR, making each GLB self-contained and
byte-identical to the reviewed export. An authenticated `index.json` records
each model's level, wood/leaf triangles and texture hashes. Original CC0 source
credits and species approximation disclosures accompany the models.

Generation code is tracked under `tools/bake_vegetation/`: `lod0/` creates the
first optimized set, `lod1/` reduces it, and `branchlets/` rebuilds exterior
foliage for both levels. All commands use `node tools/bake.mjs`. The explicit
`vegetation/branchlet-library --publish` leaf stages and validates before using
the shared rollback publisher. It rechecks accepted source hashes, unchanged
wood/core geometry and core texels, branchlet connectivity and aspect, coverage,
geometry error, compressed texture quality, materials and actual triangle counts.
It does not enable publication on the review-only authoring leaves.

LOD0 totals 47,548 wood and 50,000 foliage triangles; LOD1 totals 23,640 wood and
15,366 foliage. Each LOD1 form stays at or below 40% of its LOD0 total.
Publication changes no geometry or textures, so the existing review renders
remain exact visual evidence. Generated comparisons and editable review scenes
remain under `tests/artifacts/screens/ai594_branchlet_canopies/final/`.

The asset directory is shared through the main checkout's `assets` junction and
is gitignored. Code/specs/tests travel through Git; assets must accompany a game
distribution separately. The existing `vegetation_lod0` catalog and automatic
city placement are unchanged. Runtime LOD selection is not introduced here.
Standalone GLBs repeat canopy textures across forms; disk size does not imply
shared runtime residency. Gameplay performance is not measured by publication.
