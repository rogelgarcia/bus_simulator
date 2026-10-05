DONE

# Problem

The existing bark and leaf surfaces visibly repeat synthetic procedural patterns.
The prior brown tint does not replace those artificial surface structures.

# Request

Replace bark and foliage surfaces for London plane, silver linden, northern red
oak, American elm and arrowwood viburnum with photo-based PBR materials. Use
downloaded photographs as visual references and licensed scanned material maps
when available. Where suitable source maps are unavailable, model the observed
structure with irregular, varied geometry and bake its PBR maps in headless Blender.

Tasks:
- Retain source photos and PBR downloads with attribution, licenses and checksums.
- Remove the old synthetic bark pattern from the editable tree surfaces.
- Match photo-observed scales, crevices and irregularities without repetitive formula patterns.
- Replace uniformly generated leaf tissue and venation with photographic detail and appropriate upper/lower surface response.
- Apply the materials to all three mature variants of all five species.
- Retain the existing headless bake framework, authentication and publication gates.
- Render full trees, bark/root close-ups and leaf details for visual review.
- Save the editable scene, PBR materials, photo references and review gallery.

## On completion
- Mark DONE on the first line and rename to `AI_DONE_graphics_586_MATERIAL_photo_based_bark_and_leaf_pbr_DONE.md`.
- Record sources, material approximations, final artifacts and validation results.

## Implemented

- Registered the stage-only `vegetation/surfaces` leaf in the shared bake hierarchy; all Blender work uses the shared local configuration and isolated headless processes.
- Reconstructed all 15 mature wood meshes before applying photographic scan relief, removing the previous synthetic bark patterns and repeated circular scars. Preserved the existing canopy anchors and species plots.
- Applied Poly Haven CC0 bark scans: bark_platanus, bark_brown_01, jolcham_oak_bark_01, bark_willow_02 and bark_brown_02. Extended aligned PBR channels with offset photographic patches to reduce obvious repetition.
- Rebuilt closed 3D leaf shells from ambientCG CC0 photographed leaf sets 027, 023, 016, 014 and 024; retained tissue/vein maps and varied geometry independently. Corrected silhouette tracing and red-oak UV folding before final renders.
- Retained 11 botanical reference photographs with individual credits/licenses in downloads and the review bundle. Reference photographs are not runtime texture sources.
- Saved 45 reusable PBR maps with dimensions, color spaces and checksums. Bark shaders derive triplanar normals from height; supplied normal maps remain available in the pack.
- Rendered and reviewed all 26 full-tree, bark, root and leaf views in Cycles/OPTIX at 2560 x 1440, 128 samples, with HDRI, sun and Brown Mud ground.
- Existing in-game trees were not replaced. The detailed authoring scene remains separate from optimization and later alpha-plate work.

## Source approximations

Exact species scans were not available for every surface. London plane uses Platanus bark with adapted palmate maple tissue; linden uses fissured bark and cordate leaf proxies; red oak uses another oak scan with adapted pointed lobes; elm uses willow bark with adapted serrated leaf anatomy; arrowwood uses generic bark and an ovate leaf scan. These are explicitly recorded in `tools/bake_vegetation/surfaces/recipes.json` and the delivered `material-approximations.json`. Underside color and light transmission are artistic adaptations, not measured species photometry.

## Artifacts and validation

- Final bundle: `tests/artifacts/screens/ai586_photo_pbr/final/` (gitignored).
- `gallery.html`: 26 renders; `materials.html`: all map/source links; `references/gallery.html`: botanical photographs; `mature_tree_arboretum.blend`: packed editable scene; `completion.json`: hashes and validation receipts.
- Geometry/source validation: closed leaf shells, manifold wood, finite geometry, original canopy anchors, authenticated downloaded source maps.
- Bake-framework unit tests: 13/13 passed through the selected-test runner.
- Render receipt: `tests/artifacts/screens/ai556_bake_framework/run-1791078861866-44780-7c16dd8c/summary.json` reports success/validated.
- Final bundle checks: 26 distinct full-resolution PNGs, 45 maps, 138 resolved local gallery links, packed scene SHA-256 `a35c3a4724338744342a8e44f9d103b97d49481dba6a87b3bff551e22604777c`.
