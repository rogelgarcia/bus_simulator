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

Materials receive interests from the displayed soils referenced by visible mask tiles; resident
fine pages add their soils to their visible native ancestor. Each material's texel demand comes
only from the visible pages where it occurs (see Material demand and budget fitting). A mask page
still loading or fading in lends no density, so its materials keep their interests at the coarse
fallback until its detail is resident. Unrelated materials remain at their 32-pixel fallback.
Material identity is shared across tiles: each visible mask interest leases the currently used
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

Material resources contain one sRGB base-color `DataTexture` and a linear
`DataArrayTexture` holding OpenGL normals, ORM and, when the companion multiscale sidecar
pairs one (AI577 D4), the micro-detail layer at the same resolution. Prepared pages have
independent 32, 128 and 512-pixel files; the companion adds 1024-pixel files (see Companion
multiscale tiers). Both GPU textures use a real mip chain;
base-color mip generation and sampling use the sRGB texture format. A resource
key includes soil-binding identity, material ID, tier, every channel hash and the
appearance instance. Two soils may bind the same material; their independently
allocated textures are charged and released separately. This implementation does
not claim physical GPU deduplication merely because their page hashes match.
The six soil bindings use twelve texture samplers. One active material tier
transition adds two samplers and the semantic mask array adds one: fifteen in
total, within the WebGL2 minimum of sixteen fragment texture units. The paired micro layer is a
third layer of the existing surface array, so the count stays fifteen.

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
is parsed from the actual shader source plus the vectors Three.js adds (142 since AI577 D4: the
twelve per-soil relief/resolution scalars became six `uSoilState` vectors and the landscape-scale
field (`uMacroOctaves[4]`, `uMacroSalts`, `uMacroSettings`, `uSoilMacro[6]`) and the surface layers
(`uSurfaceLayers`, `uMicroSampling`) were added; 134 in D3, 125 in D2). Seventeen native mask slots are always required; the remainder (at
most 64) is the fine-page capacity of [LANDSCAPE_SURFACE_DETAIL.md](LANDSCAPE_SURFACE_DETAIL.md).
The RTX 3060 / ANGLE D3D11 test machine reports 1,024 vectors and compiles 81 slots; the WebGL2
minimum of 224 yields 20 slots (3 fine); devices below 210 vectors cannot fit seventeen slots and
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

Since AI577 D4 (`landscape-physical-tiling-v1`, `LandscapeMaterialTiling.js`) every material is
sampled at its calibrated physical period at every distance; the former four-times-larger macro
lattice, which magnified ripples and pebbles fourfold wherever the footprint exceeded
`tileMeters/128`, is removed. Stochastic tiling hides repetition, mips and anisotropic filtering
remove detail that the footprint cannot resolve, normal mip filtering keeps the filtered response,
and landscape-scale variation comes from the separate macro field (see Distinct appearance
layers). Grass keeps its four-meter period and sand its 30-meter period at all distances. The
planner receives each calibrated period as `materialTiling: {soilId: {tileMeters}}` and budgets
texels for it; `snapshot().appearance.materialTiling` reports `{model, tileMeters, microTileMeters,
microFadeStartMetersPerPixel, microFadeEndMetersPerPixel}` per soil.

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
chunk `chunks/landscape/stochastic_tiling.glsl`). Each lattice (base or micro layer, one per active projection) is an equilateral
triangle grid in texture periods: `uv` (world X/Z ÷ period, after the catalog UV rotation) is
turned by a salt-derived angle in [0°, 60°) and scaled by the soil's cells per period. The
fragment's triangle gives three vertices and barycentric weights. Each vertex has a hashed
offset (uniform over one period along U and over the catalog V spread along V) and a rotation
uniform in the catalog range; the sample coordinate is the fragment rotated about the vertex
center plus the offset, wrapped to one period. Hashing reuses the surface-warp murmur finalizer
on `(i·0x27d4eb2d)^(j·0x165667b1)^salt`; rotations re-hash it with `0x9e3779b9`. Top-projection
salts derive from `landscapeSurfaceDetailSeed` and `material-sampling/<soilId>`; side projections
hash the top salt with `0x9b05688c` (side X) or `0x1f83d9ab` (side Z), and a paired micro layer
hashes its projection salt with `0x510e527f` (D4). The lattice never depends on the camera.

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
±180° and V spread 1 for unknown, loam, forest and rock (1.33 m patches
for 4 m tiles); rotation 0° and V spread 0 for sand and seabed, so ripple orientation and phase
continue across patch borders (10 m patches); contrast exponent 7.

Interface: viewer parameter `landscapeMaterialSampling=single|hex-linear|hex-contrast|hex-variance`,
hooks `setMaterialSampling(mode)` (recompiles all terrain programs, a test-only hitch of about
5.5 s since D4) and `setMaterialSamplingEnabled(boolean)` (zeroes the cells, keeping one unrotated sample),
and `snapshot().appearance.materialSampling`.

Cost: nine fragment uniform vectors (`uSoilStochastic[6]`, `uSoilStochasticSalts[2]`,
`uStochasticSettings`) and no sampler, page or allocation. The per-lattice sample count is a uniform
(three) and every lattice evaluation of a soil (base and micro layers of each active projection)
runs through one runtime-bounded loop, so the D3D compiler builds one lattice body per soil. Measured on the RTX 3060 / ANGLE D3D11 at the AI577 poses: +0.36–1.2 ms
GPU (7–10%), +2.7 ms (16%) at the aerial oblique, and compile plus first draw 2.3 → 3.6 s.
Tile-period autocorrelation of rendered uniform regions falls from 0.76–0.998 to 0.002–0.06.
hex-linear lost about a quarter of the rendered contrast; hex-variance and an offline
Gaussianized/inverse-LUT variant (evaluated only, not implemented: it needs new pages and a
lookup per material) preserved variance at higher cost; hex-contrast keeps rendered contrast
within −4.8…+1.2% of single sampling.

## Distinct appearance layers (AI577 D4)

The terrain surface is the sum of three separately filtered layers. None changes heights, cover,
soil semantics, queries, picking or collision; all are anchored to world coordinates, never to the
camera, tiles, geometry LOD or residency order.

**Landscape-scale variation** (`landscape-macro-variation-v1`, `LandscapeMacroVariation.js`, chunk
`chunks/landscape/macro_variation.glsl`). Two decorrelated unit fields, tone and chroma, sum four
rotated, salt-offset octaves of quintic value noise at 400, 160, 64 and 25.6 m (amplitudes 1,
0.65, 0.35, 0.18); one murmur hash per lattice corner yields both fields. Octave salts derive from
`landscapeSurfaceDetailSeed` and `macro-variation`. Each octave fades between 1/16 and 1/4 of its
wavelength per pixel of the 3D screen-derivative major axis and the sum is divided by its unfaded
deviation (0.4525), so a removed octave contributes its zero mean and never aliases. Per-material
responses per unit field are data (log2 value, saturation, hue degrees, roughness): unknown
0.08/0.06/1/0.03, seabed 0.06/0.05/1/0.02, sand 0.05/0.06/1/0.03, loam 0.10/0.10/3/0.03, forest
0.09/0.06/1.5/0.04, rock 0.07/0.05/1/0.03. Hue turns about the gray axis and saturation about
Rec.709 luminance with chroma; value (×2^(response·tone)) and roughness follow tone.
`vec2 landscapeMacroField(world, footprint)` is the D5 input point: terrain-driven terms are added
to the field vector before the unchanged per-material responses apply.

**Local material at its physical period** (see PBR, world coordinates and transitions). Normal mip
filtering (`landscape-normal-mip-vmf-v1`) widens GGX alpha² by
`normalStrength² · 2(1 − l²)/(3l − l³)`, where l is the mean length of the mip-filtered base
normals with a 0.01 dead zone, so distant ripples keep their averaged roughness instead of turning
glossy.

**Micro detail** (`landscape-micro-detail-v1`, encoding `micro-normal-height-luminance-v1`). A
companion micro page per tier is the third layer of the material's surface array at the same
resolution. The published sidecar pairs sand and seabed with `pbr.landscape_sand_micro_v1`
(ambientCG Ground054, CC0, a 3.5 m homogeneous close-up sand: 3.42 mm per texel at 1024, luminance
range 0.625). It is sampled with its own stochastic lattice (3 cells per micro period, rotation
±180°, V spread 1, contrast exponent 7, neutral mean 0.5) at the micro `tileMeters`, through the same
lattice body as the base layer. It contributes (a) its detail slope added to the base slope
(partial-derivative blending of the two height fields) times the material normal strength and the
micro normal strength (1), (b) relief `0.3 · (h − 0.5)` added to the base relief that drives the
D1a competition and the D2 clumps, and (c) an albedo factor `1 + (2A − 1) · luminanceRange ·
luminanceStrength` (1; seabed 0.8). It fades with
`1 − smoothstep(period/96, period/24, max(footprint, period/resolution))`, where the footprint is the
4×-anisotropic mip footprint `max(major/4, minor)` of the 3D screen derivatives and the resolution
is the resident tier (during a tier arrival the old and new fades mix by the transition progress):
micro detail is never magnified beyond its resident texel, leaves before it could alias and costs
no fetch beyond the fade. Micro shows only while the bound tier and any arriving tier both carry it.

**Slope-adaptive projection** (`landscape-slope-projection-v1`, chunk
`chunks/landscape/surface_layers.glsl`). Weights are |n|^8 of the interpolated geometric normal,
normalized; a side projection (X: U = −sign(n.x)·Z, V = up; Z: U = sign(n.z)·X, V = up, never
mirrored seen from outside) is used only above the stochastic weight cutoff 1/512 (about 24.6° of
slope) and fades in over the next cutoff, so gentle ground keeps the established top projection bit
for bit and at the same cost. Each projection has its own lattice salt, samples the base and micro
layers with its own coordinate derivatives and maps its slopes to the tangent plane as surface
gradients `d − n(n·d)`. On tilted probe planes (checker transitions per meter along the fall line,
unstretched 3.875) the result is 3.375 at 30°, 2.875 at 45°, 3.375 at 60° and 3.875 at 80°, against
1.875 and 0.625 for the top projection alone; 0–24° stay identical to the top projection.

**Footprints and hysteresis.** All fades are C1 smoothsteps of the per-pixel footprint, so
perspective motion, FOV changes and orthographic zoom change contributions continuously; discrete
choices stay hysteretic (65% tier coarsening, micro paired with tiers, 0.3 s old/new tier blends).
Measured sand ripple peaks stay at 0.84 m for 20 and 60 m orthographic spans, and the formerly
4×-magnified far-field ripple band loses 72–73% of its power at FOV 55 and 20.

**Displacement.** Rejected for D4. Vertex displacement of the 1.95 m native mesh cannot represent
centimeter relief and would desynchronize rendered geometry from CPU picking, native queries and
future collision. A parallax-occlusion prototype (12 layers plus refinement on the stochastic relief
of sand and seabed, 2.5 cm depth, faded out between 3 and 12 mm per pixel) changed only the sand
close-up (mean 0.9 sRGB bytes, 0.27% of pixels above 4 bytes), added 0.5 ms GPU there and nothing
measurable elsewhere; it cannot change silhouettes, coverage would not follow its parallax at
material boundaries, and the relief channels are relative, not metric.

**Interface.** `setSurfaceLayers({macro, micro, projection, normalFiltering})` (booleans; omitted
keys keep their state, persisted across reloads), `snapshot().appearance.surfaceLayers` (recipes and
state), `snapshot().appearance.materials[].micro`
(`{materialId, tileMeters, luminanceRange, encoding, resident, shown}`). Cost: 14 added fragment
uniform vectors less 6 saved by packing the relief/resolution scalars into `uSoilState` (net
134 → 142) and no sampler.

## Companion multiscale tiers (AI577 D4)

`LandscapeAppearanceStreamer` loads `appearance/multiscale.json` with
`loadLandscapeAppearanceMultiscale` after the schema-1 sidecar (bounded 768 KiB decode reservation;
viewer parameter `landscapeMultiscale=auto|off`, `off` skips the request) and resolves every
material's tiers with `resolveLandscapeMultiscaleTiers` (`LandscapeMultiscaleTiers.js`). Outcomes are
explicit in `snapshot().appearance.multiscale.status` with a reason: `active` (1024 tiers and paired
micro layers), `active-limited` (1024 tiers dropped because the appearance GPU ceiling cannot hold the
working set, `appearance-gpu-budget-1024`, or the device texture limit is below 1024,
`device-capacity-1024`; micro stays paired with 32/128/512), and schema-1 fallbacks `absent`
(HTTP 404), `disabled`, `invalid` (load, validation or binding failure, or a capability this
renderer cannot honour: encoding other than rgba8, GPU compression, pages above 4 MiB, unpaired micro
tiers), `budget-denied` and `device-capacity`. The working set is the fixed mask arrays plus every
material's coarse fallback plus the largest material tier and its transition source. A tier lists
its pages in surface order (base color, normals, ORM, micro) with their source sidecar; the
appearance worker loads schema-1 pages with `loadLandscapeAppearancePage` and companion pages with
`loadLandscapeAppearanceMultiscalePage`. A failed companion page disables that material's multiscale
tiers explicitly (`snapshot().appearance.multiscale.failures`) and streaming resumes with its schema-1
pages.

Bytes per tier with m maps (3, or 4 with micro): decoded CPU `resolution² · 4 · m`, GPU
`landscapeTextureBytes(resolution) · m`, decode admission twice the decoded bytes. A 1024 tier with
micro is 16,777,216 decoded and 22,369,616 GPU bytes (4 × 5,592,404); without micro 12,582,912 and
16,777,212. Planning receives each material's tiers (`materialTiers`) and physical period
(`materialTiling`); demand uses the same map counts. With five materials at 1024 the appearance
share reaches about 112 MiB GPU, which is why D4 raised the shipped total to 512/256 MiB.

Uploads proceed one map per step (the base texture, then each surface array layer through
`addLayerUpdate`; the first array upload allocates every layer and mip level) while the remaining
per-frame allowance fits the map with its mips. A 1024 map is 5,592,404 bytes, so a 1024 tier with
micro spans four frames under the shared 8 MiB cap; 512 and smaller tiers still upload in one frame
when the allowance allows. Only a completely uploaded tier joins the 0.3 s transition, so split
uploads never show partial data. Coarsening to a tier above 32 pixels loads that tier first and
blends to it directly instead of through the coarse fallback; a pending coarser tier is canceled
when the desired tier returns to the bound one. `snapshot().appearance.materialUploads` reports
`{maps, bytes, tiers, splitTiers, maxFramesPerTier, lastTier}` and `pendingMaterialTier` the
uploading tier.

## Material demand and budget fitting (AI577 D4)

`landscape-material-water-filling-v1` (`LandscapeAppearanceDemand.js`) runs before geometry
admission (protected credit) and after the mask update (streaming targets).

**Page densities.** A visible native page that is resident and fully faded in lends its projected
density to the soils of its record. A native page the plan splits lends no density itself; once it
is fully faded in, each of its visible fine leaves lends its density to the soils of the leaf's
finest resolved page (resident or uniform), and while none is resolved, to the native page's soils.
Fine residency narrows demand but never gates it; interests and leases are unchanged.

**Per-material demand.** `desiredMaterialTiers` converts each soil's highest density with its
calibrated period and its own 65% hysteresis over the previous frame's demand. Before any mask is
resident, the root cover's soils request the view-wide tiers for credit only.

**Composition.** Interested materials rise one available level at a time (128, 512, then 1024), in
priority order within a level. A material that does not fit is skipped, and the first level that
cannot be granted to every material wanting it is the last level raised, so no material stays below
a level that fits for all while another holds a finer tier. Priority is the highest density, then
the number of visible pages, then the soil index. A material holding the level (bound, arriving or
pending) keeps it unless a competitor's density exceeds its own by more than 1/0.65. The
composition counts fixed mask/context storage, every coarse fallback, one peak decode allowance and
one transition allowance: the largest tier any material may still hold just below its fitted tier
(a micro-paired 512 is 5,592,400 GPU / 4,194,304 CPU bytes). Tiers whose bounded retries are
exhausted are left out.

**Streaming.** `LandscapeMaterialPages` streams each material toward the smaller of its demand and
its fitted tier. Materials above it coarsen first (directly to the lower tier when admitted,
otherwise through the fallback); materials below it then upgrade, closest first. A pending tier
above the fitted tier is canceled. Fallbacks, the single pending tier, split uploads, 0.3 s
transitions, micro pairing and multiscale fallbacks are unchanged.

**Degradation.** A fitted tier below its demand reports `appearance-gpu-budget` or
`appearance-cpu-budget` (CPU checked first); admission denials keep their own reasons, and nothing
is reported when every demand is met. `materials[]` reports `desiredResolution` (own demand),
`fittedResolution` and `density`; `appearance.materialDemand` reports `{recipe,
incumbentPreference, provisional, densityBySoil, desiredTiers, fittedTiers, limited, reason,
transitionBytes, cpuBytes, gpuBytes}`. Measured at 384/192, the rock close-up fits
sand/loam/forest/rock at 1024 in 90.5 MiB of appearance GPU memory with no degradation, where the
first D4 build had left rock at its 32-pixel fallback.

## Terrain program compile (AI577 D4)

Each soil keeps its own inlined lattice body (a uniform-count soil loop compiles in 3.2–3.7 s but
costs +1.1/+2.0/+0.3/+2.1 ms GPU at the four AI577 poses), so the D4 program takes about 5.5 s to
compile, link and draw first on ANGLE/D3D11 (D3: 3.8 s). `LandscapeStreamer.initialize` therefore
issues the overview program with `renderer.compile` before its first upload and waits for
`KHR_parallel_shader_compile` completion in 16 ms polls, keeping the main thread responsive
(`snapshot().terrainProgram` and `snapshot().streaming.programCompile` report
`{parallel, pending, milliseconds, timedOut}`). The compile is flushed to the driver at once and the
wait is bounded: after 20 s without completion the stream stops waiting, reports `timedOut: true` and
the first upload links the program synchronously. A stream disposed meanwhile stops waiting with an
AbortError; a lost context fails explicitly; without the extension the program reports ready at once
and the first upload compiles it synchronously as before. Planning becomes ready 6.1–6.4 s after navigation
instead of 4.1–4.2 s, but the page no longer freezes (longest main-thread gap 76–90 ms instead of
3.9 s).

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

The default total is **512 MiB controlled CPU buffers / 256 MiB estimated GPU
buffers** since AI577 D4 (384/192 MiB in D2–D3), following the user's realism-first direction (until then
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
half of each total budget (256 MiB CPU / 128 MiB GPU for the shipped profile). D4 raised the
total because its 1024-pixel tiers filled the 96 MiB appearance ceiling of the 384/192 MiB
profile and left terrain geometry GPU-degraded at telephoto beach views (3.07 px against the
1.5 px target at FOV 8); at 512/256 MiB every probe pose meets its target. The
former fixed 40 MiB CPU / 28 MiB GPU caps were removed in AI577 D2; every profile up to
80/56 MiB keeps exactly its previous ceilings. These ceilings are not additional memory
above the shared limit.

For smaller profiles, the protected CPU/GPU allowances are respectively
`min(12 MiB, totalCPU * 3/32)` and `min(8 MiB, totalGPU / 8)`. Appearance ceilings
are half of the corresponding total budget. A 16/8 MiB test profile
therefore protects 1.5/1 MiB and uses five mask slots. An appearance failure frees
its allocations and allowance and leaves the valid terrain palette available.
A profile too small for the terrain root still rejects minimum coverage.
Protected demand is the breadth-first material composition within those appearance
ceilings (see Material demand and budget fitting). It includes fixed mask/context
storage, every coarse fallback, one peak decode allowance and one transition allowance.
For the 16/8 MiB profile, unattainable 512-pixel pages do not pin speculative CPU
credit needed by independent authoritative source leases; attainable 128-pixel
pages still receive their bounded allowance. Full-profile demands that fit add only the
transition allowance to their former totals: five fitted 512 tiers protect one extra 128 tier
(196,608 CPU / 262,140 GPU bytes).

An allocated 17-slot padded RGBA8 array is 4,632,228 bytes on CPU and GPU; a five-slot array
is 1,362,420 bytes on each. Empty slots are reserved capacity, not claimed as
resident source pages. A decoded material tier has `resolution² * 4 * maps` CPU bytes, with
three maps, or four with a paired micro layer since AI577 D4. GPU accounting sums every mip of
every RGBA map: one three-map 512-pixel material is 4,194,300 bytes including mips. Decode admissions reserve twice the material's
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
reports each soil's physical period and micro fade thresholds (see Distinct appearance layers).
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
