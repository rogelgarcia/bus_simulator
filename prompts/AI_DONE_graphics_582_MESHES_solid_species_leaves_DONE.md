# DONE

# Problem

The vegetation library still uses flat alpha twig cards. The user requests actual 3D leaves first, postpones alpha-plate creation, and wants renders of every tree when complete.

# Request

- Author species-shaped opaque 3D leaves, including curved blades, edge thickness, petioles, veins, and distinct upper/lower surfaces.
- Apply to London plane, silver linden, northern red oak and arrowwood viburnum, preserving three mature forms and the completed trunks.
- Preserve dense coverage, use one implementation, and keep existing gameplay trees untouched.
- Retain editable source models suitable for future alpha-plate baking; do not create replacement alpha plates in this pass.
- Validate source geometry, materials, preserved trunks, publication and runtime loading through the registered baking framework.
- Render each species and all twelve forms under HDRI lighting, plus leaf close-ups, under `tests/artifacts/screens/ai582_solid_leaves/`.

## On completion

- Mark DONE, rename to `AI_DONE_graphics_582_MESHES_solid_species_leaves_DONE.md`, and document results and actual asset costs.
- Update vegetation specifications, material contracts, provenance and relevant checks.

## Completion

Implemented all twelve mature forms with opaque, closed 3D blades and petioles,
eight leaf forms per species, curved surfaces, geometric margins, tissue veins
and distinct undersides. The library contains 462,892 individual modeled leaves.
Accepted woody geometry and bark maps match their preceding fingerprints exactly.
Editable whole-plant sources and leaf specimen scenes are retained for the later
alpha-plate pass. Gameplay still requests the existing fifteen legacy assets.

The final models have 4,608,238–13,903,240 triangles and 171.01–472.81 MiB GLBs,
with two material draws per plant. These are detailed source models; optimization,
alpha plates, wind, transmission and game-scale performance remain separate work.

Validation passed: catalog (3), independent exported leaf topology/volume (4),
complete runtime family and legacy isolation (2), actual Inspector (1), and
final UHD capture (1). Canopy coverage failures in the first solid-leaf pass were
fixed by adding individual leaves, without weakening the coverage thresholds.
The final independent leaf specimens retain the tested GLB hashes.

Evidence: `tests/artifacts/screens/ai582_solid_leaves/final/` contains 36 showcase
renders plus the actual Inspector image, all 3840×2160. All twelve plants appear
individually and in four species lineups, with textured and clay leaf studies.
The sibling `validation/`, `inventory.json` and `density_comparison.json` contain
authenticated final runtime metrics and measured coverage/costs. See
`specs/trees/solid_species_leaves.md` for the complete contract and build receipts.
