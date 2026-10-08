# Global terrain fields (AI577 D5)

The registered `landscape/terrain-fields` leaf analyzes the **current** authoritative native height and
land-cover grid of a saved landscape globally, then slices the results into pages aligned with the
categorical mask hierarchy. It produces the additive `landscape-terrain-fields` v1 sidecar
(`<landscape>/fields/manifest.json`) that the appearance runtime streams beside its mask pages. The
fields are derived, unmeasured visual inputs; heights, cover, soil semantics, queries, appearance and
terrain manifests are never written.

```sh
node tools/bake.mjs --target landscape/terrain-fields --dry-run
node tools/bake.mjs --target landscape/terrain-fields
node tools/bake.mjs --target landscape/terrain-fields --publish
node tools/bake_landscape/terrain_fields/run.mjs --publish
```

The leaf declares `configurationPaths: []`: it runs in Node through the shared planner and the shared
gitignored `tools/baking/blender.local.json` without requiring any machine executable. Python was not
used because the global algorithms (Priority-Flood, flat resolution, ordered accumulation, convex-hull
horizon sweeps, dead reckoning) are sequential loops that need SciPy/numba to be practical in Python,
while Node typed arrays run the whole coastal grid in about 11 seconds with deterministic float64
arithmetic. It is excluded from production `all` and from the `landscape` import parent.

Scoped options (`--set landscape/terrain-fields:<option>=<value>`):

| Option | Default | Meaning |
| --- | --- | --- |
| `directory` | `assets/public/landscape/coastal-city` | Saved landscape to analyze (the gitignored [local landscape cache](../README.md#local-landscape-cache)) |
| `recipe` | `tools/bake_landscape/terrain_fields/recipe-v1.json` | Exact algorithm parameters (embedded in provenance with its SHA-256) |
| `imports` | none | Optional retained interoperable maps (see Imports) |
| `verify-determinism` | `true` | Run the global stage twice and require identical channel hashes and statistics |

## Global first, pages second

1. **Source.** All native chunks are read once through the authenticated authoring IO into one
   2049 x 2049 grid; duplicated border samples must agree bit for bit.
2. **Gradient.** Central differences matching the mesh vertex normals (one-sided at the landscape
   edge); slope in degrees.
3. **Depressions.** Hydrology runs on a lightly smoothed routing surface (three-pass box Gaussian,
   sigma 3 samples, which removes the source's ~10 m road-shoulder terracing). Priority-Flood with a
   FIFO pit queue (Barnes et al. 2014) fills every closed depression; outlets are the landscape edge and
   every sample below sea level (exact authoritative sea mask); heap ties break by (elevation, index).
4. **Flats.** Barnes et al. (2014) flat resolution: twice the breadth-first distance toward the flat's
   low edges plus the inverted distance away from its high edges, so water converges along the middle of
   a flat to its outlet.
5. **Accumulation.** Donors before receivers (filled level descending; inside a level, flat samples by
   descending mask, then draining samples). Quinn et al. (1991) multiple flow directions with exponent
   1.1 and contour factors 0.5/0.354 on non-flat samples; flat samples split by mask differences; low
   edges drain equally into equal-level draining neighbors. Outlets keep their inflow; total area is
   conserved (unit-tested).
6. **Flow channel.** `ln(A / spacing)` normalized by land percentiles p60..p99.7, then faded over flats
   (smoothed flat share, sigma 2 samples) because ponds and level ground carry sheet flow, not channels.
7. **Wetness.** TWI `ln(a / max(0.001, tan beta_filled))`, smoothed over land only (normalized
   convolution, sigma 3), normalized by land p2..p98; 1 below sea level.
8. **Curvature.** Negative Laplacian of the height smoothed at sigma 4, 12 and 40 samples (7.8, 23 and
   78 m), each divided by its land p98 magnitude, clamped and weighted 0.35/0.35/0.30.
9. **Deposition.** `flow_smooth^0.7 * (1 - smoothstep(1.5, 12 deg, slope)) * (0.5 + 0.5 * concavity) +
   0.6 * smoothstep(0.05, 1.5 m, fill depth)`, clamped; 0 below sea level.
10. **Rock exposure (restrained).** `smoothstep(18, 32 deg, slope) * (0.65 + 0.35 * max(0, convexity)) *
    (1 - 0.75 * flow) * (1 - 0.8 * deposition)`, at most 0.95; 0 below sea level.
11. **Horizons and sky view.** Every grid line in 16 integer directions is swept from its far end with
    an upper convex hull of the samples ahead (O(samples) per direction; no ray marches, no page
    boundaries). The 8 row/column/diagonal directions are exact on the triangulated surface and stored;
    the 8 knight-move directions only refine the sky view. Sky view is the cosine-weighted visible sky of
    the facet above both the terrain horizon and the horizontal, integrated in closed form per azimuth
    with trapezoidal azimuth weights (open ground 1, open slope (1 + cos S) / 2).
12. **Shore distance.** Marching-squares sea-level polyline (linear crossings on row/column edges,
    saddles by the quad mean), nearest segment propagated by two dead-reckoning passes repeated twice;
    land positive, water negative, clamped to 256 m by the encoding.
13. **Natural soil inference** (`natural-terrain-inference-v1`, planning-only samples only): argmax of
    `log(regional prior + 0.02) + 0.5 * smoothed terrain log-likelihood`. The prior is the confidence-
    weighted normalized convolution of natural one-hot soils at 23.4/93.75/375 m on a stride-4 grid;
    the likelihood is a naive Bayes of shore distance, height above sea level, smoothed slope and
    smoothed wetness learned from the landscape's own natural samples (64 tent-binned bins, bin
    smoothing 1.5, pseudo-count 1), smoothed spatially (sigma 6 samples) so narrow planning strips follow
    their surroundings. Non-planning samples keep their semantic soil exactly.

Every full-grid array is allocated through a tracked ledger with a declared 768 MiB limit; the coastal
peak is about 380 MiB of tracked typed arrays (process RSS about 690 MiB including Node). Every float
field is checked finite before encoding.

**Pages.** Every manifest chunk gets a page of its 257 samples plus the two-sample halo of the mask
pages (261 x 261 texels, row 0 north), four RGBA8 layers (1,089,936 bytes). Native pages copy the
global bytes; a coarser page sample is the separable tent average (weights `s - |offset|`, `s` = sample
stride) of the decoded native values, re-encoded. Natural soil pages (257 x 257 uint8, no halo, aligned
native labels) exist only where an aligned sample is planning-only cover. Pages are content addressed
(`pages/<sha256>.rgba8`, `pages/<sha256>.u8`).

## Validation, determinism and publication

Validation re-reads every byte: sizes and hashes, strict sidecar schema and binding, the sea-level sign
of every native shore sample (bytes >= 128 exactly when height >= sea level), bit-identical shared
borders and halos between all adjacent pages, coarse texels recomputed from native pages with the same
prefilter, and natural soils (non-planning samples keep their semantic soil; planning samples never
receive `unknown`). The global stage runs twice by default and must produce identical channel hashes.
The revision is `terrain-fields-` plus 24 hex digits of the sidecar hash with a null revision, so
identical inputs rebuild byte for byte.

Publication holds the authoring lock, refuses a terrain manifest that changed since planning (the
fields would be bound to a revision that is no longer current) and a current sidecar of another
landscape, installs pages, keeps the previous current sidecar's immutable snapshot, writes
`manifest.<sha256>.json`, and switches `fields/manifest.json` last. Terrain and appearance files are
never written. The receipt is `tests/artifacts/screens/landscape/ai577/d5/terrain-fields-validation.json`
(timings, tracked memory, determinism hashes, page sizes and every validation count).

## Imports (optional)

A `landscape-terrain-field-imports` v1 request may override `flow`, `deposition`, `wetness` or
`rockExposure` (Gaea's "wear" belongs to rock exposure) from retained grayscale 8- or 16-bit PNG maps
that exactly cover the native grid with row 0 north. Modes are `replace`, `max` (with weight) and
`blend`; overrides apply on land before encoding. Each map's SHA-256, size, encoding and tool provenance
are recorded in the sidecar. Maps are bake inputs only; no proprietary tool or file is a runtime
dependency. Map paths are relative to the request file:

```json
{ "format": "landscape-terrain-field-imports", "schemaVersion": 1, "landscapeId": "coastal-city",
  "maps": [{ "id": "gaea-flow", "field": "flow", "file": "gaea/flow16.png", "encoding": "png-gray16", "mode": "replace",
             "weight": 1, "rowOrder": "north-first", "provenance": { "tool": "Gaea", "toolVersion": "2.x", "node": "Erosion2/Flow" } }] }
```

## Authoring compatibility

Fields bind the exact terrain revision and every native chunk's height and land-cover hashes. After an
authored height edit, `landscapeTerrainFieldsStaleness` marks exactly the changed native chunks stale
(pages wholly inside them are never loaded and their 8 x 8 cells fall back to analytic terms in the
shader); soil-only and material-only revisions stale nothing. Fields outside stale chunks are reused
with a bounded inaccuracy until re-baked: a horizon changes by at most `atan(max|dh| / d)` at distance
`d` from the edited chunk, the sky view by at most `sin^2` of that angle, shore distance by at most the
displacement of the shoreline inside the edited chunk, and flow, wetness and deposition only downstream
of (or dammed by) the edit by at most the catchment draining through it. Re-run this leaf after edits.

## Tests

`tests/node/unit/landscape_terrain_fields_analysis.test.js` (synthetic flow, depressions, flats,
horizons, sky view, shore distance, determinism), `landscape_terrain_fields.test.js` (bake, strict
sidecar, staleness and authoring, loaders, sampler, publication, imports),
`landscape_terrain_fields_framework.test.js`, `landscape_terrain_fields_assets.test.js` (published
coastal data), `landscape_terrain_field_pages.test.js` (runtime streaming and the GLSL mirror) and
`landscape_dressing_inputs.test.js`; browser checks are in `tests/headless/e2e/landscape_terrain_fields.pwtest.js`.
