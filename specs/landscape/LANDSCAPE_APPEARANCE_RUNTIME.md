# Landscape appearance runtime

AI 576 D4 adds an independent appearance adapter in
`src/graphics/engine3d/landscape/`. `LandscapeAppearanceStreamer` consumes the
prepared `appearance/manifest.json` alongside a landscape manifest. It has no DOM
dependency and does not change terrain geometry, semantic queries or saved data.
The prepared format, source retention and offline resampling belong to the
landscape appearance preparation contract.

## Independent view planning

`createLandscapeAppearancePlanner` chooses categorical mask levels and individual
soil texture tiers from screen footprint, projection, FOV, orthographic span,
zoom, viewport size and visible bounds. Height error is not an appearance input.
A flat zero-error landscape can retain its root mesh while its masks and material
pages refine. Mask targets and material targets have their own hysteresis.

Visible desired mask IDs acquire their ancestor chain first. The root always
covers the landscape. Capacity prioritizes the largest visible mask footprint,
then camera proximity; a bounded subset may remain coarser than requested.
The normal profile has 17 mask slots, including retained ancestors. Profiles with
less than 8 MiB of appearance GPU capacity have five. This is a deliberate
bounded working set, not an allocation for all 85 prepared masks.

Materials receive interests from the displayed soils referenced by visible mask tiles.
An unresolved fine mask uses coarse materials until its detail is resident.
Unrelated materials remain at their small 32-pixel fallback. Material identity
is shared across tiles: each visible mask interest leases the currently used
material resource. Texture changes cannot change a soil ID or imported cover ID.

## Acquisition, identity and storage

One appearance module worker joins the two geometry workers; AI577 D2 adds two surface-detail
workers for generated fine pages (see [LANDSCAPE_SURFACE_DETAIL.md](LANDSCAPE_SURFACE_DETAIL.md)). It performs cover
fetch/hash verification, ordered soil-override rasterization and raw RGBA page
fetch/hash verification. There are at most five active worker jobs overall:
two geometry, one appearance and two surface-detail jobs. New controlled ledger kinds are
`appearance-surface-detail-array`, `-worker-context`, `-generation`, `-upload-pending`,
`-resident-slot`, `-inspection` and `-cache`. No image decoder or soil-region scan
runs in the render loop. The original full-resolution PBR imagery is not fetched.

Cover masks load their own `landCover` channel without a height request. Each
257 by 257 source page produces a 261 by 261 RGBA8 display page with a two-sample
stored halo. R is a packed soil byte and G is the original cover ID.
The low four soil bits identify the semantic soil; the high four identify the
display soil. Both use validated catalog order; the current shader supports six
bindings. B/A hold a derived contour pair and quantized signed distance; invalid
pair payload `0xf001` marks an exactly uniform 6 by 6 kernel neighborhood so the
shader can return its one-hot soil directly. Other invalid fits use `0xf000`.
The source-byte channels remain exact. A GPU RGBA8 texture array
uses nearest filtering, no mipmaps, no color-space conversion and exact texel
centers. Original cover bytes remain unchanged. Canonical same-level cover
neighbors provide a six-sample worker halo for the bounded contour fit; the
worker authenticates and reads them serially. Each record includes landscape
revision, spatial ID, halo source IDs, channel hash and the instance identity, so soil overrides
invalidate rasterized masks even when source cover payload hashes are unchanged.

Material resources contain one sRGB base-color `DataTexture` and a two-layer,
linear `DataArrayTexture` holding OpenGL normals and ORM. Prepared pages have
independent 32, 128 and 512-pixel files. Both GPU textures use a real mip chain;
base-color mip generation and sampling use the sRGB texture format. A resource
key includes soil-binding identity, material ID, tier, every channel hash and the
appearance instance. Two soils may bind the same material; their independently
allocated textures are charged and released separately. This implementation does
not claim physical GPU deduplication merely because their page hashes match.
The six soil bindings use twelve texture samplers. One active material tier
transition adds two samplers and the semantic mask array adds one: fifteen in
total, within the WebGL2 minimum of sixteen fragment texture units.

AI577 D1a optionally packs relative material relief into ORM alpha. The manifest
must explicitly declare `orm-alpha-unorm8`; absent metadata means neutral 0.5,
not the legacy opaque alpha value. Height uses the same world coordinates,
texture gradients, mip chain and old/new material-tier transition as the other
surface channels. The existing RGBA allocation and fifteen-sampler count stay
unchanged. The material snapshot exposes the active blend recipe and each
material's height declaration for inspection.

AI577 D2 sizes the per-slot coverage uniform arrays (`uMaskBounds`, `uMaskMeta`,
`uMaskNeighbors0/1`) with the compile-time `LANDSCAPE_COVERAGE_SLOTS` define instead of a
hardcoded seventeen. `chooseLandscapeCoverageSlots(renderer)` picks the count once per view
and renderer: `min(81, floor((maxFragmentUniforms - fixed) / 4))`, where the fixed vector count
is parsed from the actual shader source plus the vectors Three.js adds (134 since the AI577 D3
stochastic tiling uniforms; 125 in D2). Seventeen native mask slots are always required; the remainder (at
most 64) is the fine-page capacity of [LANDSCAPE_SURFACE_DETAIL.md](LANDSCAPE_SURFACE_DETAIL.md).
The RTX 3060 / ANGLE D3D11 test machine reports 1,024 vectors and compiles 81 slots; the WebGL2
minimum of 224 yields 22 slots (5 fine); devices below 202 vectors cannot fit seventeen slots and
fail with an explicit `[Landscape]` error.
The geometry streamer's materials and the appearance uniforms receive the same count, and
`setAppearance` rejects arrays of another length. The finest-page search loop is bounded by
the mask array depth, so unused slots cost no fragment work. `snapshot().appearance.coverageSlots`
reports `{total,native,detail,detailMax,maxFragmentUniforms,fixedUniformVectors,slotUniformVectors}`.
The terrain shader still uses fifteen samplers. Pure slot arithmetic is tested in
`tests/node/unit/landscape_coverage_slots.test.js`.

Worker cancellation terminates obsolete active work and removes queued work.
Completed stale records are rejected by abort and record-identity checks. Source
reload disposes the old appearance instance and all worker/texture references
before publishing the new instance. A failed fine resource retains its coarse
fallback, exposes the failed identity, and has at most one delayed retry.

## PBR, world coordinates and transitions

The adapter awaits the shared PBR correction resolver, then calls
`resolvePbrMaterialPipeline` with the explicit cached correction object. This is
necessary because the pipeline's default `calibrationOverrides = null` would
otherwise suppress that correction. The global catalog remains the authority
for physical tile size and UV calibration. `applyTextureColorSpace` assigns the
base and data texture color spaces. Source-map URLs are resolved for metadata but
are not passed to the global full-resolution image loader.

World X/Z, divided by physical `tileMeters`, is the near texture coordinate. +U points
east and +V points north before the catalog UV rotation. Prepared material rows
start in the south; `flipY` remains false. The same rotation applies to UV
derivatives and the inverse rotation to tangent-space normal XY. Terrain masks
retain the source's north-first rows. This mapping does not restart at mesh or
mask boundaries.

The second, macro coordinate uses a period four times the calibrated physical
tile size. The shader samples these two stationary world lattices and blends
their responses; it never animates or interpolates the UV scale itself. The
blend uses `max(length(dFdx(worldXZ)),length(dFdy(worldXZ)))`, in meters per
screen pixel, with smoothstep endpoints `tileMeters/128` and `tileMeters/16`.
Thus perspective distance/FOV and fixed-position orthographic zoom all select
detail consistently. Both derivatives scale with their sampled period. Fully
near or fully macro fragments sample only one lattice; transition fragments
sample both. Grass retains its calibrated four-meter near period and uses a
16-meter macro period; the new sand retains 30 meters near and 120 meters macro.
These artistic scales do not claim new source resolution. Since AI577 D3 both lattices are
sampled stochastically (see Stochastic material sampling); periods and the footprint blend are
unchanged. The planner receives
the same periods and conservatively budgets texels for the larger one.

The external terrain shader applies normal strength, AO intensity, metalness,
albedo correction and roughness interval/gamma/inversion controls from the
resolved pipeline. Roughness percentile normalization uses the retained original
source range at every tier. A constant input range preserves the raw scalar.
The surface uses a GGX sun response and hemisphere ambient illumination. It does
not introduce terrain displacement, extra measured elevation, an environment
bake or gameplay lighting integration.

AI577 D1 reconstructs normalized material coverage independently from geometry.
An interpolating cubic one-hot field preserves narrow source features; a bounded
worker contour fit removes longer digitized steps only when one two-material
separator still classifies every sample in its 9 by 9 neighborhood. Other regions
retain the cubic field. The approximate material transition is 0.75 world meters,
with local analytic antialiasing and a bounded positive minification filter.
Category IDs are never linearly filtered or treated as numerical blend values.
The recipe, packed contour format, canonical halos and precise filtering limits
are specified in [Continuous surface coverage](LANDSCAPE_SURFACE_COVERAGE.md).

New mask pages blend coverage weights from their resident parent over 0.3 seconds.
Coarsening reverses the fade and removes children before their parent. A common
per-level availability field uses neighboring tile progress, including diagonals,
to approach the same ancestor at mixed-LOD edges and corners. Its world band is
twice the parent sample spacing, capped at one tile width. Coverage is combined
before shading so each contributing PBR soil is sampled once. Albedo, roughness,
metalness and AO blend by normalized weights; the final world normal is normalized.
Geometry normals continue to use the D3 common-border gradient policy. Material
tier changes still blend old/new PBR responses for 0.3 seconds, one transition at
a time, releasing the old tier only after replacement is ready and the fade ends.

With D1a height metadata, near-camera material weights instead use
`landscape-height-competition-v1`. For supported coverage `c` and normalized
relative relief `h`, the score is `q = c * (1 + 0.7 * (2*h - 1))`. Each score
competes against the maximum supported score over a 0.12 score-width band. A
coverage-weighted ramp integral removes lower scores and normalizes the remaining
contributions. Its conservative footprint uses maximum pairwise score derivatives;
those derivatives are evaluated before any nonuniform return. Raised detail thus
survives the transition while lower areas admit the adjacent material, without
introducing a zero-coverage layer. All PBR properties use the same final weights.

Since AI577 D2 the competition first reweights coverage with world-anchored per-material clump
relief (`landscape-material-clumps-v1`; model, parameters and invariants in
[LANDSCAPE_SURFACE_DETAIL.md](LANDSCAPE_SURFACE_DETAIL.md) "Physical interleaving"), so
transitions interleave in tussocks, patches and boulders at 0.3–1.5 m before blade-scale
relief resolves the edges; `setMaterialClumps` and `snapshot().appearance.materialClumps`
expose it. Texture competition detail fades between 0.04 and 0.20 meters per effective sample. The
effective sample size is the larger of projected world footprint and the active
physical texture period divided by resident tier resolution. Detail readiness
blends continuously between old and incoming tiers and is coverage weighted across
the contributing materials. At unresolved distances it returns to the existing
filtered terrain coverage. This is relative surface competition, not geometric
displacement or an inferred physical material thickness. Historical sidecars with
no height declaration keep their previous coverage mixing behavior. Source and
visual acceptance rules are in [LANDSCAPE_BASE_MATERIALS.md](LANDSCAPE_BASE_MATERIALS.md).

The box primitive integrates a locally planar score margin. Maximum-score
selection, multiplication by coverage and final normalization make the combined
multi-material filter approximate; it is not an exact area average of nonlinear
height competition. It neither removes D1's source-resolution limitations nor
implements the independently streamed fine coverage pages planned for D2.

## Stochastic material sampling (AI577 D3)

Repeating material pages are sampled with world-anchored stochastic hex tiling
(`landscape-hex-tiling-v1`; catalog and exact JavaScript mirror in `LandscapeMaterialSampling.js`,
chunk `chunks/landscape/stochastic_tiling.glsl`). Each lattice, near and macro, is an equilateral
triangle grid in texture periods: `uv` (world X/Z ÷ period, after the catalog UV rotation) is
turned by a salt-derived angle in [0°, 60°) and scaled by the soil's cells per period. The
fragment's triangle gives three vertices and barycentric weights. Each vertex has a hashed
offset (uniform over one period along U and over the catalog V spread along V) and a rotation
uniform in the catalog range; the sample coordinate is the fragment rotated about the vertex
center plus the offset, wrapped to one period. Hashing reuses the surface-warp murmur finalizer
on `(i·0x27d4eb2d)^(j·0x165667b1)^salt`; rotations re-hash it with `0x9e3779b9`. Near salts
derive from `landscapeSurfaceDetailSeed` and `material-sampling/<soilId>`; the macro salt is
the near salt hashed with `0x6a09e667`. The lattice never depends on the camera.

One weight set drives base color, ORM (including the relief alpha consumed by the height
competition and the D2 clump relief) and normals. UV gradients rotate with each sample before
`textureGrad`, so mip and anisotropic selection match an unrotated sample. Tangent normals become
slopes `n.xy / max(|n.z|, max(|n.x|,|n.y|)/128)`, are rotated back by the inverse sample
rotation, blended, and rebuilt as `normalize(slope, 1)` before the unchanged catalog rotation,
strength and terrain mapping. Arriving tiers blend inside every sample.

The compile-time define `LANDSCAPE_MATERIAL_SAMPLING` selects `single` (0, pre-D3 path),
`hex-linear` (1, barycentric weights), `hex-contrast` (2, default: barycentric^7 ×
(0.4 + 0.6·signal), where signal is relief or, without height metadata, linear luminance) or
`hex-variance` (3: barycentric³ weights and `μ + Σw(x−μ)/√Σw²` with μ from the one-texel mip and
slope mean 0). Samples whose largest possible final weight is below 1/512 are skipped and fade in
up to 2/512, keeping the blend continuous. Catalog: 3 cells per period for every soil; rotation
±180° and V spread 1 for unknown, loam, forest and rock (patches of 1.33 m near / 5.33 m macro
for 4 m tiles); rotation 0° and V spread 0 for sand and seabed, so ripple orientation and phase
continue across patch borders (10 m / 40 m patches); contrast exponent 7.

Interface: viewer parameter `landscapeMaterialSampling=single|hex-linear|hex-contrast|hex-variance`,
hooks `setMaterialSampling(mode)` (recompiles all terrain programs, a test-only hitch of about
3.5 s) and `setMaterialSamplingEnabled(boolean)` (zeroes the cells, keeping one unrotated sample),
and `snapshot().appearance.materialSampling`.

Cost: nine fragment uniform vectors (`uSoilStochastic[6]`, `uSoilStochasticSalts[2]`,
`uStochasticSettings`) and no sampler, page or allocation. The per-lattice sample count is a uniform
(three) and the near/macro lattices share a footprint-bounded loop, so the D3D compiler builds
one lattice body per soil. Measured on the RTX 3060 / ANGLE D3D11 at the AI577 poses: +0.36–1.2 ms
GPU (7–10%), +2.7 ms (16%) at the aerial oblique, and compile plus first draw 2.3 → 3.6 s.
Tile-period autocorrelation of rendered uniform regions falls from 0.76–0.998 to 0.002–0.06.
hex-linear lost about a quarter of the rendered contrast; hex-variance and an offline
Gaussianized/inverse-LUT variant (evaluated only, not implemented: it needs new pages and a
lookup per material) preserved variance at higher cost; hex-contrast keeps rendered contrast
within −4.8…+1.2% of single sampling.

## Natural presentation and imported reference data

`LandscapeNaturalPresentation` uses the catalog's `planningOnly` flag; the coastal
planning IDs are 5, 6 and 7. It removes their former pavement tint and distinct
unknown-ground material silhouettes without editing imported cover or heights.
The reference is one authenticated overview cover page, not an independently
inferred result for every child tile. Every nonplanning root sample seeds its
base soil into a deterministic four-neighbor flood fill. Seeds enter in row-major
order and neighbors are visited north, west, east, south; this resolves equal
Manhattan-distance ties reproducibly. If no natural seed exists, the explicit
display fallback is loam when present, otherwise the declared default soil.

Every planning sample at every LOD looks up the same nearest world-coordinate
root label. The coastal reference spacing is 15.625 meters. Child arrival order,
worker replacement and mask eviction therefore cannot choose different inferred
substrates along a shared border. Nonplanning samples keep their semantic soil.
The current ordered authored overrides apply last, including an explicit override
to unknown; an overridden unknown is not mistaken for unassigned planning ground.
The same pure helper creates fallback mesh colors and packed appearance masks.
This keeps a failed or not-yet-ready appearance stream from restoring pavement
colors. Native road grading shoulders remain in the retained height field.

This is an inferred visual treatment, not an assertion that urban or road samples
actually contain forest, grass, or sand. Queries, reports and saved source cover
continue to expose the imported reference and authored semantic soil. There is
no new durable full-terrain raster, terrain write, or unbounded neighborhood fetch.
Display material interests use the inferred/overridden soil rather than unknown
source semantics, so referenced fine pages are admitted and released correctly.

## Shared memory and frame-work limits

The default total is **384 MiB controlled CPU buffers / 192 MiB estimated GPU
buffers** since AI577 D2, following the user's realism-first direction (until then
it was 128/64 MiB; that historical profile left terrain geometry GPU-degraded in every
AI577 capture view). Geometry, native queries, appearance and the water reference use the
same ledger. Appearance protects a small default allowance of 12 MiB CPU / 8 MiB
GPU before geometry begins view refinement. Real appearance resources replace
that credit; the unused part is separately labeled `appearance-unused-reservation`.
Before geometry admission each frame, appearance estimates the materials needed
by visible interests at their planned tiers and protects that bounded demand in
the same ledger. Actual resources replace this credit; delayed halo reads cannot
let geometry consume a material's planned capacity merely by finishing first.
The provisional source-soil set is cached once during initialization, and the
plan/reservation work remains included in appearance frame timing. Demand credit
shrinks promptly when the plan shrinks and disappears at disposal. Its lower bound
is the base allowance above; its upper bounds are the appearance ceilings, which are
half of each total budget (192 MiB CPU / 96 MiB GPU for the shipped profile). The
former fixed 40 MiB CPU / 28 MiB GPU caps were removed in AI577 D2; every profile up to
80/56 MiB keeps exactly its previous ceilings. These ceilings are not additional memory
above the shared limit.

For smaller profiles, the protected CPU/GPU allowances are respectively
`min(12 MiB, totalCPU * 3/32)` and `min(8 MiB, totalGPU / 8)`. Appearance ceilings
are half of the corresponding total budget. A 16/8 MiB test profile
therefore protects 1.5/1 MiB and uses five mask slots. An appearance failure frees
its allocations and allowance and leaves the valid terrain palette available.
A profile too small for the terrain root still rejects minimum coverage.
Protected demand uses only an attainable material composition within those
appearance ceilings, in material-interest priority order. It includes fixed
mask/context storage, every coarse fallback and one peak decode allowance.
For the 16/8 MiB profile, unattainable 512-pixel pages do not pin speculative CPU
credit needed by independent authoritative source leases; attainable 128-pixel
pages still receive their bounded allowance. Full-profile demands that fit retain
the same protected byte totals.

An allocated 17-slot padded RGBA8 array is 4,632,228 bytes on CPU and GPU; a five-slot array
is 1,362,420 bytes on each. Empty slots are reserved capacity, not claimed as
resident source pages. A decoded material tier has `resolution² * 12` CPU bytes.
GPU accounting sums every mip of all three RGBA maps: one 512-pixel material is
4,194,300 bytes including mips. Decode admissions reserve twice the material's
raw bytes for worker, fetch/hash and assembly overlap. Coastal mask decode reserves
945,598 bytes: padded RGBA output, a temporary 269² RG source neighborhood, and
eight bytes per original sample for serial fetch/hash/decode and transfer overlap.
The contour fitter allocates no additional typed-array scratch. After upload only
the shared array remains.

Each worker's natural reference retains one 66,049-byte label array and builds
it with a temporary 264,196-byte `Uint32Array` queue. Its 330,245-byte allowance
stays reserved so terminated workers can be reconstructed safely. The two mesh
workers already have accounted copies of the overview channels. Their context
reservation adds two such allowances. The appearance worker additionally owns
one 66,049-byte overview cover copy and reserves 396,294 bytes for that copy plus
infill construction. Combined natural-presentation worker reservations remain
1,056,784 CPU bytes, including scratch; contour/mask storage is counted separately above.
All context allowances are released only after their worker pool is disposed.

The geometry adapter uploads first. Appearance receives only the remainder of
the same **8 MiB per-frame** allowance. The initial mask array is uploaded once;
subsequent mask uploads use the texture array's layer-update API. Material costs
include mip-generation output in the reported upload workload. Old/new texture
overlap, fixed mask capacity, query leases and inspection lines all remain within
their admissions. Turning away or returning to overview releases fine material
arrays/textures and mask interests. Buffer credit is restored when resources
shrink or disappear. Disposed textures clear their CPU image references, including
inactive blend uniforms.

These counters inventory controlled typed arrays, reserved capacity and estimated
GPU buffers/textures. They exclude browser objects, shader program/driver overhead,
render targets owned by the main viewer and total browser heap/VRAM.

## Water and inspection

The Water toggle owns a separate two-triangle plane at `coordinates.seaLevel`.
Its 140 bytes of geometry attributes/indices are accounted on CPU and GPU. It is
transparent and never joins terrain picking or native query acquisition. Sea
level does not replace submerged terrain heights. The reference has no waves,
hydrology, buoyancy or collision behavior.

The viewer reports mask residency, per-soil texture resolution, pending work,
actual appearance CPU/GPU bytes and degradation alongside the shared performance
bar. `snapshot().appearance` also exposes desired/resident masks, source revision,
material interest counts, reserved credit, decode/upload state, errors and peak
upload bytes. `appearanceSample(x,z)` reads the nearest resident categorical
texel and reports semantic `soilId`, inferred/overridden `displaySoilId`, unchanged
`coverId`, spatial mask ID, level, spacing and revision. `appearance.presentation`
identifies the root-infill policy and reference spacing, while `materialTiling`
reports the calibrated near/macro periods and footprint thresholds.
`coverageSample(x,z,{dx,dy})` reports the continuous resident-page weights, raw
cubic weights, fitted-pair confidence and world footprint before hierarchy fades.
It does not replace categorical inspection or claim to reproduce another page's
ancestor/arrival blend. `appearance.coverage` exposes the versioned recipe,
ordered soil/material bindings, world units, revision, native/infill source
spacings, root policy/hash, halo dependencies and exact controlled storage costs.
`demandReservation` distinguishes planned protected credit from actual resources.
It is an appearance inspection value; authoritative editing still uses native
terrain queries. `setWater(boolean)` and `snapshot().water` expose the separate
reference surface for deterministic verification.

Two terrain diagnostics (AI577 D2) support transition review. **Surface detail level**
(`surface-level`) keeps the shaded surface and tints albedo 50% toward the level color of
the finest page that actually contributes at the fragment (non-zero availability): L0 blue,
L1 cyan, L2 green, L3 yellow (coastal native), L4 orange, L5 red, L6 violet, L7 white.
**Surface coverage weights** (`surface-coverage`) writes unlit false colors of the normalized
coverage after hierarchy availability and before height competition, after tone mapping so
pure regions reproduce exact bytes: unknown 210,60,210 · seabed 96,124,138 · sand 217,197,143 ·
loam 118,160,78 · forest 104,76,48 · rock 186,183,176. These are the same colors as the
generator review images. Both branches run only when selected; the default path is unchanged.

Pure budget transaction/mip tests live in
`tests/node/unit/landscape_appearance_budget.test.js`. The browser acceptance suite
is `tests/headless/e2e/landscape_appearance.pwtest.js`; its default generated
captures remain under `tests/artifacts/screens/landscape/ai576/d4/appearance/`.
`LANDSCAPE_EVIDENCE_PHASE=nature` selects `landscape/nature/appearance/` without
overwriting historical evidence. `landscape_natural_presentation.test.js` covers
deterministic inference, shared boundaries, metadata-selected planning classes,
explicit unknown overrides, fallback colors, source preservation and footprint
weights. `landscape_nature.pwtest.js` captures the actual coastal overview, clean
beach, 55-degree Game POV, forest planning area and fixed-position orthographic
near/macro progression under `tests/artifacts/screens/landscape/nature/`.

The following are historical D4 observations, before the natural presentation
and new sand material. The initial six-test D4 browser run passed with no collected shader errors. Its
flat-height fixture retained one geometry leaf at both the overview and close
poses. Mask residency changed from one root to four ancestor/native pages; only
the referenced unknown/forest materials rose from 32 to 512 pixels. Actual
appearance residency rose from 2,319,394 CPU / 2,343,946 GPU bytes to 8,610,850 CPU /
10,732,546 GPU bytes. Two complete return-to-overview cycles restored the exact
initial resource counts and byte totals. The peak appearance upload was 4,194,300
bytes in one frame. These are deterministic resource measurements, not a general
FPS guarantee. The same run covered soil persistence/revert, material-content
changes preserving semantics, corrupt-page fallback and cancellation of an old
revision's delayed mask response.
