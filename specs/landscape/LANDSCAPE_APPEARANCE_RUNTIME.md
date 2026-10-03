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

Materials receive interests from the soils referenced by visible mask tiles.
An unresolved fine mask uses coarse materials until its detail is resident.
Unrelated materials remain at their small 32-pixel fallback. Material identity
is shared across tiles: each visible mask interest leases the currently used
material resource. Texture changes cannot change a soil ID or imported cover ID.

## Acquisition, identity and storage

One appearance module worker joins the two geometry workers. It performs cover
fetch/hash verification, ordered soil-override rasterization and raw RGBA page
fetch/hash verification. There are at most three active worker jobs overall,
with at most one appearance job running. No image decoder or soil-region scan
runs in the render loop. The original full-resolution PBR imagery is not fetched.

Cover masks load their own `landCover` channel without a height request. Each
257 by 257 page is interleaved as unsigned-byte soil index and original cover ID.
The soil index order is the validated soil catalog order. A GPU RG8 texture array
uses nearest filtering, no mipmaps, no color-space conversion and exact texel
centers. Original cover bytes remain unchanged. Each record includes landscape
revision, spatial ID, channel hash and the instance identity, so soil overrides
invalidate rasterized masks even when source cover payload hashes are unchanged.

Material resources contain one sRGB base-color `DataTexture` and a two-layer,
linear `DataArrayTexture` holding OpenGL normals and ORM. Prepared pages have
independent 32, 128 and 512-pixel files. Both GPU textures use a real mip chain;
base-color mip generation and sampling use the sRGB texture format. A resource
key includes material ID, tier, every channel hash and the appearance instance.
The six soil bindings use twelve texture samplers. One active material tier
transition adds two samplers and the semantic mask array adds one: fifteen in
total, within the WebGL2 minimum of sixteen fragment texture units.

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

World X/Z, divided by physical `tileMeters`, is the texture coordinate. +U points
east and +V points north before the catalog UV rotation. Prepared material rows
start in the south; `flipY` remains false. The same rotation applies to UV
derivatives and the inverse rotation to tangent-space normal XY. Terrain masks
retain the source's north-first rows. This mapping does not restart at mesh or
mask boundaries.

The external terrain shader applies normal strength, AO intensity, metalness,
albedo correction and roughness interval/gamma/inversion controls from the
resolved pipeline. Roughness percentile normalization uses the retained original
source range at every tier. A constant input range preserves the raw scalar.
The surface uses a GGX sun response and hemisphere ambient illumination. It does
not introduce terrain displacement, extra measured elevation, an environment
bake or gameplay lighting integration.

New mask pages blend their visual material response from their resident parent
over 0.3 seconds. IDs themselves are never interpolated. Coarsening reverses the
fade and removes children before their parent. At mixed mask boundaries a
two-texel band approaches the resident coarser ancestor; active neighbor fades
also participate in the boundary weight. Equal-level masks use shared canonical
border samples and shared world UVs. Geometry normals continue to use the D3
common-border gradient policy. Material tier changes blend the old and new PBR
responses for 0.3 seconds; only one such transition runs at a time. The old tier
is released after the replacement is ready and the transition completes.

Planning covers 5, 6 and 7 retain distinct urban/road/runway tints over **unknown**
substrate. These are planning references, not finished pavement geometry or soil
composition. An explicit sand, rock or other known soil override displays that
soil while the original planning cover ID remains available to inspection.

## Shared memory and frame-work limits

The default total remains **128 MiB controlled CPU buffers / 64 MiB estimated GPU
buffers**. Geometry, native queries, appearance and the water reference use the
same ledger. Appearance protects a small default allowance of 12 MiB CPU / 8 MiB
GPU before geometry begins view refinement. Real appearance resources replace
that credit; the unused part is separately labeled `appearance-unused-reservation`.
Detail can borrow spare shared capacity, up to appearance ceilings of 40 MiB CPU
and 28 MiB GPU. These ceilings are not additional memory above the shared limit.

For smaller profiles, the protected CPU/GPU allowances are respectively
`min(12 MiB, totalCPU * 3/32)` and `min(8 MiB, totalGPU / 8)`. Appearance ceilings
are bounded by half the corresponding total budget. A 16/8 MiB test profile
therefore protects 1.5/1 MiB and uses five mask slots. An appearance failure frees
its allocations and allowance and leaves the valid terrain palette available.
A profile too small for the terrain root still rejects minimum coverage.

An allocated 17-slot RG8 array is 2,245,666 bytes on CPU and GPU; a five-slot array
is 660,490 bytes on each. Empty slots are reserved capacity, not claimed as
resident source pages. A decoded material tier has `resolution² * 12` CPU bytes.
GPU accounting sums every mip of all three RGBA maps: one 512-pixel material is
4,194,300 bytes including mips. Decode admissions reserve twice the material's
raw bytes for worker, fetch/hash and assembly overlap. Mask decode reserves six
bytes per sample before work starts; after upload only the shared array remains.

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
texel and reports soil ID, cover ID, spatial mask ID, level, spacing and revision.
It is an appearance inspection value; authoritative editing still uses native
terrain queries. `setWater(boolean)` and `snapshot().water` expose the separate
reference surface for deterministic verification.

Pure budget transaction/mip tests live in
`tests/node/unit/landscape_appearance_budget.test.js`. The browser acceptance suite
is `tests/headless/e2e/landscape_appearance.pwtest.js`; its generated captures and
measurements remain under `tests/artifacts/screens/landscape/ai576/d4/appearance/`.

The initial six-test D4 browser run passed with no collected shader errors. Its
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
