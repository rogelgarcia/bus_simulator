# Ecosystem scatter (AI 599 D2)

The `landscape/ecosystem` leaf generates the **offline layers** of a `landscape-ecosystem-recipe` over the
current saved landscape and publishes them as the additive `landscape-ecosystem` v1 sidecar
(`<landscape>/ecosystem/manifest.json`): one content-addressed tile index per layer and one
content-addressed payload of `ecosystem-instance-v1` records per world-anchored cell. Runtime layers of
the recipe are listed without tiles; the browser worker generates them on demand with the same domain
code (`src/app/landscape/ecosystem/`). Terrain, appearance, field and geology files are never written.

```sh
node tools/bake.mjs --target landscape/ecosystem --dry-run
node tools/bake.mjs --target landscape/ecosystem/blue-noise
node tools/bake.mjs --target landscape/ecosystem
node tools/bake.mjs --target landscape/ecosystem --publish
node tools/bake.mjs --target landscape/ecosystem --set "landscape/ecosystem:layers=boulders" --set "landscape/ecosystem:density=0.5"
```

Both leaves declare `configurationPaths: []` (Node only, no machine executable) and are excluded from
production `all` and from the `landscape` import parent. `landscape/ecosystem` depends on
`landscape/ecosystem/blue-noise`, so every tiles bake first proves the committed lattice table.

Scoped options (`--set landscape/ecosystem:<option>=<value>`):

| Option | Default | Meaning |
| --- | --- | --- |
| `directory` | `assets/public/landscape/coastal-city-v3` | Saved landscape to generate over (the gitignored [local landscape cache](../README.md#local-landscape-cache)) |
| `recipe` | `tools/bake_landscape/ecosystem/recipes/coastal-v3-ecosystem-v1.json` | The recipe (validated, embedded in the sidecar with its identity and SHA-256) |
| `overrides` | none | Optional `landscape-ecosystem-overrides` document (region parameters, masks, removed and pinned instances) |
| `density` | `1` | Global density scale applied to every layer (0..16) |
| `layers` | every offline layer | Comma-separated offline layer ids to generate; the others publish without tiles |
| `receipt` | `tests/artifacts/screens/landscape/ai599/d2/ecosystem-bake.json` | Where the receipt is copied |

## Blue-noise table (`landscape/ecosystem/blue-noise`)

Every lattice site of every layer reads its rank from one 64 x 64 toroidal table committed in
`src/app/landscape/ecosystem/EcosystemBlueNoise.js` (Ulichney void-and-cluster, toroidal Gaussian of
sigma 1.5 texels quantized to integers, seeded with the murmur hash of the surface noise; the
void-filling phase and the inverted cluster phase coincide for a toroidal kernel). A site is kept when
`rank < density`, so any density threshold is a blue-noise subset that is seamless across cells and
changes only where the density changes. The leaf regenerates the table (0.1 s), requires identical
bytes, and compares the selection at 2 %, 10 % and 30 % of a jittered lattice (jitter 0.35) with a
white-noise selection of the same density: mean nearest-neighbour distance at least 10 % larger,
coefficient of variation at most 90 %, pairs closer than one spacing at most 60 %, no worse a minimum,
and isotropic nearest-neighbour directions (chi-square of 8 sectors below the 99 % quantile 18.48). At
30 % both selections contain axis-adjacent pairs, so the minimum alone does not separate them. With
`--publish` a differing regeneration rewrites the marked block of the module and then fails the run on
purpose: rerun so every job imports the new table. Receipt: `tests/artifacts/screens/landscape/ai599/d2/blue-noise.json`.

## Generation

For each offline layer in descending priority, every cell intersecting the landscape bounds is generated
by `generateEcosystemLayerCells` through one shared cell cache; the cells of higher-priority layers a
cell reaches into (competitors within the competition distance, the parent layer within the child
radius, `distance.layer.*` targets within their curve reach) are generated first and memoized. Inside a
cell (`generateEcosystemCell`), in this order per site: the blue-noise rank; sites whose rank exceeds the
layer's largest reachable density are skipped without sampling (exact, and the reason a sparse layer is
cheap); the jittered position; the input vector at that position (terrain contact from the exact native
triangle, field and geology pages, planning distances, cover distances, neighbouring layers); the
exclusion zones in recipe order unless an include mask lifts them; the density (curve groups times the
biome `where` terms, clumping noise and the override and global density scales); `rank < density`;
competition against the bucketed features of higher-priority layers; variation (scale, yaw, variant,
tint) from independent hash channels. A layer with `rules.parent` has no sites of its own: for every
parent feature whose disc reaches the cell it spawns `count` children (hash of the parent identity) at
hashed radii and directions, keeps those anchored inside the cell whose keep hash is below the local
density, and ranks them by that hash; pinned parents spawn no children. Finally the post-generation
overrides apply (exclude masks, removed ids, pinned instances on the exact ground) and the tile is rank
sorted.

Inputs the browser worker must reproduce for identical bytes (`EcosystemCellSources.js`):

- A position belongs to the native chunk and page whose column is `min(count − 1, floor((x − minX) / chunkMeters))`
  and row `min(count − 1, floor((maxZ − z) / chunkMeters))` (east and south neighbours own shared borders).
- `distance.cover.*` is an exact Euclidean distance transform of each cover class over the native samples
  of the cell grown by 40 m (`ECOSYSTEM_COVER_DISTANCE_METERS`), read at the nearest native sample and
  saturated at 40 m; `distance.layer.*` is the nearest supplied feature saturated at the generation halo.
- Field and geology sidecars must be bound to the current terrain with no stale native; an absent sidecar
  leaves its inputs neutral and is recorded as absent.
- Planning: `distance.roads` is the nearest centerline segment less half the road width (0 on the road),
  `distance.districts` 0 inside a district polygon else the distance to its edge, `view-corridor` the
  retained open-view polygons; only features whose bounds come within 256 m of the cell are consulted.

## Gates, receipt and publication

After generation the leaf re-opens the landscape with fresh caches and regenerates 8 sampled cells per
layer alone (bytes must match) and the 3 x 3 blocks around 4 sampled cells, neighbours first (the centre
and the neighbours must match the first pass). Site layers must show no pair closer than their declared
bound `spacing × (1 − 2 × jitter)`. The spatial statistics (`EcosystemStatistics.js`: nearest-neighbour
mean, minimum and coefficient of variation, close pairs, pair correlation up to three spacings, the
8-sector anisotropy chi-square) are reported per layer; anisotropy is informational on real terrain,
whose linear habitats (shores, forest edges) are anisotropic by nature. The receipt also records the
instances per layer, per-km² densities over the landscape, the land and every cover class against
`recipe.targets`, the native cover histogram, timings, reads and the staged sidecar sizes.

Staging (`EcosystemPublication.mjs`) writes `layers/<layerId>.<sha256>.json`, the payloads
`layers/tiles/<sha256>.bin` (an index lists them as `tiles/<sha256>.bin`: every url is relative to the file
that lists it, the convention the cache bundle verifier and installer assume, so a loader resolves payloads
against the index URL) and the manifest whose revision `ecosystem-<24 hex>` derives from its own bytes
(timings stay in the receipt); every tile's `contentKey`
hashes the algorithm, recipe identity, cell, density scale, the natives within the layer's dependency
reach (its halo, the cover halo and the referenced layers' own reaches), the field and geology revisions
and the override entries touching the cell. Validation re-reads every byte (hashes, strict schema and
terrain binding, every index against the recipe and recomputed keys, every payload decoded, inside its
cell and rank sorted). Publication holds the authoring lock, refuses a terrain manifest that changed since
planning and a current sidecar of another landscape, installs the immutable files, keeps the previous
current sidecar's snapshot, writes `manifest.<sha256>.json` and switches `ecosystem/manifest.json` last.

## Tests

`tests/node/unit/landscape_ecosystem_blue_noise.test.js`, `landscape_ecosystem_generation.test.js`
(fixture with hill, slope, cover bands and a planning road; determinism, seams, local stability,
competition, children, exclusions, overrides, statistics) and `landscape_ecosystem_sidecar.test.js`
(strict validation, content keys, staleness, loaders, publication round trip).
