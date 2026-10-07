# Problem

LOD0 still uses 97,548 triangles across the 15 mature forms. A lower level of
detail must retain full-tree canopy volume at 40% of the LOD0 triangle counts.

# Request

- Generate all 15 LOD1 forms with no more than 40% of each LOD0 model's triangles.
- Reorganize the canopy instead of merely removing leaves: preserve internal
  coverage and the exterior silhouette with fewer, more useful cards.
- Preserve the installed LOD0 library and all source/reference models.
- Use the registered headless Blender bake workflow and retain material provenance.
- Render matched full-tree LOD0/LOD1 comparisons, with no close-ups, under
  `tests/artifacts/screens/ai593_lod1_canopies/final/`.
- Report measured wood/leaf triangles, projected coverage and material memory;
  do not present geometric savings as measured frame-rate improvements.

## On completion

Record validation and comparison results, mark DONE and rename with DONE naming.

## Completed

- Built all 15 LOD1 models with 39,006 combined triangles: 23,640 wood and
  15,366 foliage. Every form is below its individual 40% LOD0 cap.
- Retained 225 interior planes, reprojected their photographic PBR and regrouped
  exterior foliage using spatial clusters and local density. Across 360 alpha
  projections, coverage is 97.04–109.91% of LOD0; maximum tolerance-envelope
  spill is 1.92%. Larger patches remain visible at some sparse tips.
- Replaced unconstrained branch collapse with bounded edge candidates and
  source-point lineage. Exposed tree trunks remain unchanged geometrically;
  photographic bark is rebaked onto fresh LOD1 UVs and tangent normals.
- Exported compressed PBR GLBs and editable Blender sources. Source LOD0 files
  and installed models remain byte-identical. No gameplay publication or commit.
- Rendered 30 full-tree Cycles images and 15 labeled comparison boards, plus
  a five-species overview and CSV counts. Final renders use isolated CPU work
  while another task occupies the GPU; camera and settings match within each pair.
- All nine `vegetation_lod1.test.js` checks pass. Existing LOD0 asset checks
  (eight) and bake framework checks (thirteen) also passed during implementation.
- See `specs/graphics/vegetation_lod1.md` for measured geometry, coverage,
  texture memory, render settings and limitations. Gameplay FPS is unmeasured.
- Gallery: `tests/artifacts/screens/ai593_lod1_canopies/final/index.html`.
