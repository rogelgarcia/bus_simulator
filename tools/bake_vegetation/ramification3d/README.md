# Shared 3D ramification

This stage-only leaf consumes the **current** `branching_study/` grammar. It does
not use the older elm-only `growth_v2` generator. The same generation loop,
ancestry streams, branch sites, dimension profiles, repeated daughter tiers,
minimum sizes and support sizing serve the planar and spatial adapters.

```powershell
node tools/bake.mjs --target vegetation/ramification-3d --set vegetation/ramification-3d:output=tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/<new-revision>
```

Defaults review five species and seeds 1, 31 and 92 at 1400 pixels with 16 EEVEE
samples. `species` accepts `all` or comma-separated species IDs; `seeds` accepts
a subset of those three validation seeds. Partial pilots are labeled incomplete.
`width` accepts 640–2400 and `samples` 8–64. Both supplied reference manifests are
authenticated and copied unchanged. Completed or partial output directories
are never overwritten. Publication is always rejected.

`phase=preview` produces four SVG projections of the real spatial graph for
iteration while Blender is busy. Its receipt is explicitly incomplete; it does
not satisfy saved-geometry or EEVEE review. The default `phase=full` does both.

`phase=review` with `source=<previous-650-revision>` refreshes the two junction
views in a new output directory. It authenticates every source output, requires
exact equality with the current generated graphs and source render settings,
copies the saved models, and rebuilds only the hidden junction diagnostic.
Reopening must preserve the visible wood/root coordinates, loop indices and
transforms exactly. GLB and all other renders remain authenticated copies;
all saved-mesh audits, browser sheets and final publication gates run again.

`phase=finish` with `source=<neutral-review>` adds roots and species PBR in a new
revision. It authenticates the source, requires the current graph to match, and
checks the saved shoot coordinates, topology and transforms byte for byte after
reopening. This is an additive material/root pass; the completed 650 prompt and
earlier neutral models remain unchanged. Example:

```powershell
node tools/bake.mjs --target vegetation/ramification-3d --set vegetation/ramification-3d:phase=finish --set vegetation/ramification-3d:source=tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/<current-neutral-revision> --set vegetation/ramification-3d:output=tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/<new-roots-pbr-revision>
```

The existing shared root graph drives directional flares, local buttress surfaces
and a fused coarse root network. Fine tails retain the original graph endpoints;
arrowwood's crown links remain buried and the eleven cane origins remain separate.
No new root or shoot random rules replace the shared generator. All root paths,
including fine tips and sinkers, are retained. The export still contains three
meshes: major wood, fine wood and complete roots.

Voxel union can enclose tiny internal cavities. Only closed negative-volume
pockets smaller than four voxels across and eight cubic voxels are sealed before
UV transfer. Detached positive-volume pieces fail the connected coarse-root check,
except quantization slivers with exactly eight vertices and six closed quads,
extent below 0.1 voxel and 5 percent of the smallest coarse source diameter, and
volume below 0.001 cubic voxel. Fine roots are joined afterward and never filtered.
Every removal is recorded with its measurements. Component volumes use centered
double-precision coordinates: float32
world-space determinants can reverse the sign of cavities only micrometres wide.
The same bounded repair runs before smoothing so collapsed cavities cannot invert.
Silver linden seed 31 and the revised arrowwood seed 1 are retained regression cases.

Retained `tree_ai_<species>_bark` maps are copied into the new revision and
authenticated as inputs. Base color uses sRGB; OpenGL normal and packed ORM use
Non-Color. Branch-aligned UV charts are projected onto the fused wood and roots;
tile scale comes from each retained material's metadata. The normal map supplies
relief without displacing the preserved branches. Base color, normal and ORM
are packed in Blender and embedded in GLB with UVs and tangents. The material
metadata and 16-bit height source accompany the review. These AI-authored maps
and their approximate physical scales are not measurements.

GLB export triangulates evaluated copies to support capped tubes. Blender's
fixed-axis tangent fallback at degenerate cap UVs is orthogonalized against the
exported normal, preserving the handedness sign. Only tangent buffer values are
changed; positions, normals, topology and embedded texture bytes are preserved.

Finished reviews add side/top underground views, a close root-collar view and
bark detail. New builds also save neutral front, side and oblique trunk close-ups:
seventeen views in a neutral review, twenty-one in a finished review. Historical
fourteen/eighteen-view receipts remain valid. Full-tree views show the visible root
flare at soil grade. Hidden generation diagnostics retain neutral level colors.
Validation checks saved material wiring, packed images, UVs, root/cane overlap,
fine-root center fidelity, unchanged shoots, and exported PBR channels as well as
the existing geometry and provenance gates.

Use the shared `tools/baking/blender.local.json`. Check existing Blender activity
before starting. The registered leaf uses the isolated framework backend only
when the headed session is occupied and an independent low-thread run is safe.
Do not interrupt or repurpose an occupied session or compete with active renders.

## Representation

Graphs use metres and right-handed Y-up `(x,y,z)`. Blender receives `(x,-z,y)`,
which preserves handedness with Z up. Shoot `parentT` remains normalized arc
length because curve samples are equal-distance. Root `parentT` remains a
sample-index fraction on the existing cubic curve; it is **not** arc length.

Initial canes occupy separate seeded radial anchors. Major branches depart around
their real parent tangents. Daughter pairs share a branch-local fork plane,
rotated between generations; both can fork again. A single bounded vertical bend
and optional recovery apply to each whole axis. The proximal blend inherits the
actual parent tangent. Direction rejection uses a vertical vector component,
avoiding left/right angle wrapping. Projected crossing rejection is unavailable.

`leaderLaterals` independently controls order-zero leader nodes; subordinate
framework counts remain unchanged. `primaryApicalScale` shortens only the top
primary limb in mixed crowns. Both are shared controls with compatibility
defaults. Numeric `spatialParameters` in `species.mjs` tune the 3D presets without
changing the preserved 2D presets or introducing species-specific code paths.

Spatial order-zero stems spread each discrete support-radius reduction over a
bounded downstream interval with a quintic blend and add an eight-percent basal
taper allowance. Every original support sample remains a lower bound; the final
tip radius and fork-area constraints remain intact. This removes cylindrical
shelves without thinning the support calculation. Other branch orders and the
planar sizing path retain their original rules. Tree presets set broader trunk
bends and partial tip recovery; the basal frame supplies a seeded bend plane.
The shape changes happen before daughter attachment, so children inherit the
curved parent's actual position and tangent. Arrowwood keeps separate anchors.

The root grammar is shared too: counts, levels, sizes, sinkers, hosts and random
streams remain independent of shoots. Root destinations are radial and each
side root turns in three dimensions from its parent. No soil-section silhouette
is replicated around the trunk. Arrowwood retains a shared root crown and eleven
individual cane origins. Full underground roots are stored separately from wood.

`planar-compatibility.json` lifts the exact planar model with zero Z. It is a
compatibility fixture, never presented as a volumetric specimen. The unit test
also compares the current 2D paths and roots with the preserved page-10 fixtures.

## Meshing and review

`mesh_adapter.py` inserts exact attachment samples, then reuses
`enhanced_reference/junctions.py::flow_surfaces` and `wood.py::mesh_paths`.
Major wood is voxel-unioned with inherited-tangent shoulders. Fine tubes retain
the complete descendants and taper. Neutral materials and no leaves expose the
structure. Existing leaf meshes, UVs, materials and installed assets are untouched.

Each saved `.blend` is reopened before auditing and rendering; the source graph
is embedded as a Blender text datablock and also exported as JSON. GLB exports
contain the neutral tree and complete roots. Review objects are saved but hidden.
The saved mesh audit checks finite coordinates, normal lengths, manifold edges,
positive signed volume and interior thickness at major branch attachments. Fine
ring centers and radii are compared against the graph after reopening. The
isolated junction is cut directly from the saved fused wood; its open cut edges
are explicit and excluded from the otherwise closed-mesh requirement.
Its center is a real major daughter fork, or a major lateral attachment when
the finer daughters are outside the fused set. Only the connected component
nearest that attachment is retained. The receipt records its graph IDs, position
and crop radius; the reopened crop must remain connected.
It adapts the established saved-mesh inspection approach to this graph's format;
the older species-specific `mesh_audit.py` contracts are not incorrectly invoked.

The review includes front, side and two opposite obliques, generation colors,
three progressive stages, the same isolated subtree from two directions, a major
fork in context, its isolated saved surface, full underground roots and the base
at soil grade: fourteen renders per specimen. Cameras share a fitted scale for
the four whole-tree views, with projected bounds checked before rendering. Only
the explicitly labeled context/soil close-ups crop the specimen. HTML embeds both reference collections
for the correct species and links every graph, configuration, model and audit.
Comparison and per-seed diagnostic contact sheets are captured in Chromium.
PNG dimensions, required view names, EEVEE receipts, three-mesh GLB structure,
input stability and SHA-256 identities are required before validation completes.

Numerical audits are separate from visual acceptance. Fine tubes overlap at
attachments and are not one watertight solid. Neither global branch collision
avoidance nor physiological growth is implemented. Root dimensions are geometric
estimates. Review observations belong in the species spec and completion report.

## Tests

Use `node tools/run_selected_test/run.mjs --set <path>`, then the same runner:

- `tests/node/unit/vegetation_spatial_ramification.test.js`
- `tests/node/unit/vegetation_branching_study.test.js`
- `tests/node/unit/vegetation_species_context.test.js`
- `tests/node/unit/vegetation_ramification.test.js`
- `tests/node/unit/vegetation_reference_import.test.js`
- `tests/headless/e2e/vegetation_branching_study.pwtest.js`
- `tests/headless/e2e/vegetation_spatial_ramification.pwtest.js`
- `tests/node/assets/vegetation_ramification_finish.test.js` (saved output tests;
  `VEGETATION_FINISH_REVIEW` selects a staged finish revision)
- `tests/node/unit/vegetation_pbr_export.test.js` (degenerate UV-cap export regression)
- `tests/node/unit/vegetation_stem_taper.test.js` (continuous supported stem taper and seeded trunk bow)

`tests/python/test_vegetation_surface_volume.py` runs with Python's `unittest`
using the shared configuration's `pythonExecutable`. It checks translated tiny
solids and cavities, reversed winding, face triangulation, the recorded arrowwood
sliver and rejection of root-sized components.

## Saved root/PBR review

`tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/r18_roots_pbr_final/index.html`
is the completed five-species, three-seed finishing review. It includes the
packed `.blend` sources, embedded-texture GLBs, 270 EEVEE images, material source
maps and reference comparisons. The framework validated all fifteen models;
34 Node tests and one browser regression passed with no skips. See the
"Root/PBR finishing result" section of
`specs/graphics/vegetation_species_rules.md` for the receipt, inspection scope and
remaining visual limitations. All outputs remain staged under the artifact root.

## Saved smooth-stem review

The current finished collection is
`tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/r27_smooth_stems_pbr/index.html`,
built from `r21_smooth_stems_neutral`. It contains fifteen packed Blender/GLB
pairs and 315 EEVEE renders, including neutral front, side and oblique trunk
close-ups. The registered framework passed all saved-model gates. This follow-up
passed 39 Node checks, five Python checks and one browser regression with no
skips. All fifteen whole-tree and surface sheets were visually inspected, along
with all neutral stem sheets and selected full-resolution details. The broad
support shelves are removed and tree trunks have a gentle seeded bow. Bark
repetition, some UV/junction seams and regular root layouts remain. These are
staged review models, not runtime LODs; the species spec records the full result.
