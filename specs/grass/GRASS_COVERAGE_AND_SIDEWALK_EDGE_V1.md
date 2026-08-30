# Grass Coverage and Sidewalk Edge v1

## Purpose

AI 354 defines the hard footprint used by maintained grass in the canonical Grass Lab. The substrate is a continuous ground surface. Grass is a separate, shallow layer that exists only where binary occupancy permits it; substrate or biome color transitions never decide grass occupancy by themselves.

This V1 contract is lab-only and historical for downstream work. Corrective footprint ownership belongs to AI 359, and gameplay integration remains owned exclusively by AI 363 after AI 362 approval.

## Deterministic control semantics

`GrassCoverageContract.js` sanitizes and snapshots the following independent controls:

| Control | Meaning |
|---|---|
| `occupancy` / `coverage` | Binary inclusion of the raised grass surface at a world position |
| `exclusions` | Rectangular road, sidewalk, and fixture cuts removed from occupancy |
| `densityMultiplier` | Scales eligible near-patch density without expanding the footprint |
| `humidity` / `dryness` | Bounded material-response inputs; neither changes occupancy |
| `accentEligible` | Permission for later localized accents; it does not place tufts in AI 354 |

The v1 footprint source is `binary_rect_partition`. Identical terrain bounds, exclusion rectangles, and seed-independent configuration produce the same cells, boundary segments, and corner counts after reload.

## Physical layer

- Default layer height: `27.5 mm`, constrained to the `25-30 mm` maintained-turf target.
- The PBR substrate remains visible below the layer and through all excluded cells and boundary gaps.
- The top surface consumes `far_coverage.png` as linear cutout data with the material family's `0.35` alpha threshold. It stays opaque and uses alpha-to-coverage when available; grayscale is not a blend weight between grass and substrate.
- Footprint antialiasing is limited to a narrow `15 mm` maximum edge treatment. Broad material crossfades are prohibited.
- Humidity and dryness adjust bounded color/roughness response only. Density changes eligible near geometry only. None of these controls moves the physical edge.

## Boundary construction

`createGrassCoveragePartition()` partitions the terrain by all exclusion boundaries and returns the exact occupied complement. It derives and merges axis-aligned boundary segments with stable outward normals and classifies inside/outside corners. The canonical fixture covers straight sidewalk runs, both corner directions, and three stepped rectangles that approximate an irregular cut.

`GrassCoverageSurfaceSystem` batches the result into exactly three meshes:

1. one top-surface mesh using the approved low-cut PBR material;
2. one vertical grass lip/skirt mesh;
3. one sparse one-triangle fringe mesh shared by the complete boundary.

The lip and fringe share one opaque vertex-color material, so the full coverage feature uses three logical draws and two material paths rather than one draw per edge. All three meshes retain frustum culling and disable grass shadows.

The default Lab fixture reports `130` surface triangles, `40` lip triangles, `2,600` sparse-fringe triangles, `3` draws, and `2` materials. These deterministic counts are regression signals, not gameplay budgets.

## Patch and root rejection

Near-patch centers are tested against every coverage exclusion. The Lab additionally expands exclusions by the full possible patch half-extent (`0.52 m` for the default one-metre patch and scale variation), so a patch whose blades could cross a road, sidewalk, corner, or irregular cut is rejected as a unit. AI 356's `GrassLocalizedAccentContract` queries this same binary coverage and `accentEligible` flag for every root and independently rejects roots inside scaled tree trunks. Humidity and dryness still cannot expand placement.

## Terrain and biome-mask interoperability

Future terrain code may supply a precomputed scalar or binary biome mask to the coverage adapter. The adapter must threshold that input once into binary occupancy before partitioning or placement. Soft biome weights may still blend substrate materials underneath, but those weights remain a separate channel and cannot create a translucent grass/substrate transition.

The contract depends only on a sampled mask or exclusion result, not on the authoring tool that produced it. Its V2 successor lets AI 363 connect completed terrain/biome data without coupling the Grass Lab renderer to unfinished biome tooling.

## Lab acceptance views

The Coverage tab exposes the physical height, density, threshold, narrow edge limit, layer visibility, fringe spacing/inset, and deterministic cameras for straight, corner, and irregular cuts. Diagnostics report semantics, response controls, segment/corner counts, geometry split, draw/material cost, and render-safety flags.

Reference captures are stored in `tests/artifacts/screens/grass/ai354/`:

- `straight_substrate_only_reference.png`
- `straight_hard_coverage_27_5mm.png`
- `corner_hard_coverage.png`
- `irregular_cut_lip_and_fringe.png`
