# LOD1 canopy volume review

Use `node tools/bake.mjs --target vegetation/lod1`. The `phase` option selects
`build`, `compress`, `render`, `gallery`, or `validate` using the framework's
`--set vegetation/lod1:phase=...` syntax. `models` can restrict work to one or
more installed `species/mature_0N` identifiers; `all` processes all 15 forms.
`device=CPU` isolates work from an occupied GPU. Shared Blender configuration,
input hashing and output isolation remain mandatory. Publication is rejected.
`render-threads` bounds rendering to one through four CPU threads (default two).

Inputs are the accepted AI591 review and installed LOD0 manifest. Outputs go
under `tests/artifacts/screens/ai593_lod1_canopies/final/`. Every model must fit
40% of its combined LOD0 wood and leaf count, allowing downward triangle rounding.
Wood receives the triangles needed to protect exposed stems and endpoints; the
canopy receives the remainder, so the complete tree still satisfies the 40% cap.

The new interior cards reproject neighboring baked LOD0 surfaces. Compact
spatial clusters replace exterior six-leaf cards with grouped leaf patches.
Coverage is measured from multiple azimuths/elevations; no whole-tree billboard
tracks the camera. Wood collapse preserves tree vertices below five metres and
shrub vertices below ten centimetres. Bounded quadric collapse tests edge endpoints,
rejects folds and empty-fork bridging, and tracks source-point lineage to prevent
branch tips shrinking away. Both source-to-reduced and reverse surface distances
are checked. Fresh UV charts and a selected-to-active bark bake
retain photographic color, cavity/roughness and the correct tangent normals.
All PBR comes from the accepted photographic bake; no synthetic noise is added.

`compress` reuses the existing UASTC encoder, alpha-preserving mip chain and
quality gates. `render` reimports final decoded GLBs and compares every full
tree under the same HDRI/sun/ground/camera; `views=all` adds reverse views.
`gallery` makes labeled comparison boards and an HTML index. No close-ups.

`geometry` tests all reduction constraints without modifying final meshes or
textures, writing `wood-quality-trial.json`. `inspect-wood` measures existing
LOD1 wood in both surface-distance directions without changing it. These two
diagnostic phases do not require final packaged GLBs.
