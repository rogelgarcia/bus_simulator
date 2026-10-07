# Mature branchlet asset installation

Run `node tools/bake.mjs --target vegetation/branchlet-library --publish` to
install the latest 30 reviewed trees in `assets/public/vegetation_lods/`.
Without `--publish`, the same leaf stages and validates only. It reuses the
shared bake framework and directory rollback publisher; no Blender run is needed.

The source is AI594, with AI591/AI593 accepted geometry inputs. Checks include
unchanged wood/core, attached branchlets, physical card aspect, coverage, wood
error, 40% LOD1 budgets, compression quality and every exported texture hash.
Standalone GLBs embed compressed PBR and are copied byte-for-byte. This preserves
the reviewed export without requiring review folders at runtime. Embedded canopy
maps repeat across variants; a renderer still needs resource sharing/streaming.

Each species directory contains `mature_01_lod0.glb` through `mature_03_lod1.glb`.
The root manifest authenticates 30 models and credits, with separate wood/leaf
counts. Assets remain shared and gitignored. Source code is committed under
`tools/bake_vegetation/`; review renders and editable scenes stay in artifacts.
Existing city placements and the older `vegetation_lod0` catalog are preserved.
