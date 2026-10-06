# Independent landscape appearance

D4 adds retained soil PBR bindings, bounded texture pages, and categorical mask
requests independent from geometry LOD. Native elevation, land-cover IDs and
soil operations remain authoritative landscape data. Appearance refinement does
not alter those identities or the results of exact terrain queries.

Base source selection and material boundary acceptance follow
[LANDSCAPE_BASE_MATERIALS.md](LANDSCAPE_BASE_MATERIALS.md): repeating tiles must be
homogeneous single materials, and near-camera boundaries must interleave using
material relief within the continuous terrain coverage support.

## Sidecar and material identity

The canonical sidecar is `assets/public/landscape/coastal-city/appearance/manifest.json`.
It has `format: landscape-appearance`, `schemaVersion: 1`, a content-derived
`revision`, `landscapeId`, `preparedFromRevision`, `bounds`, `grid`, `orientation`,
`materials` and `provenance`. Spatial identity compares required values, not JSON
key order. `preparedFromRevision` records preparation provenance; later height or
soil edits do not invalidate reusable material pages. A different addressing
frame, landscape ID, or semantic soil-to-material binding is rejected.

`landscapeAppearanceBindingKey(landscapeOrAppearance)` hashes normalized required
spatial numbers and the ordered `{soilId,materialId}` bindings with SHA-256.
Terrain revision, height/cover contents, soil overrides and JSON key insertion
order do not affect this compatibility key. The registered publisher keeps
`appearance/binding.<key>.json` aliases beside canonical and immutable sidecars,
so their `pages/...` URLs have the same base directory. Aliases are atomically
replaceable with a newer compatible preparation; `manifest.<sha256>.json`
snapshots and content-addressed pages remain immutable.

The viewer's default lookup opts into
`loadLandscapeAppearanceManifest(url,{landscape,resolveBindingFallback:true})`.
It tries current metadata first and reads exactly one expected binding alias
only if structurally valid metadata fails spatial/material compatibility.
Each metadata request is capped at 256 KiB; no terrain payload is requested.
Network errors, malformed/oversized metadata, invalid page descriptors and
cancellation remain failures. Returned alias metadata must pass the complete
schema and expected landscape binding checks. Explicit appearance URLs default
to strict loading and do not silently select another sidecar.

Publication preserves the previous valid current binding before switching to
the new sidecar. For a pre-alias retained snapshot, the registered leaf accepts
one optional `landscape/appearance:compatibility-snapshot=manifest.<sha256>.json`
input from that landscape's appearance directory. It checks filename SHA-256,
bounded metadata and all referenced page hashes before creating the alias;
these inputs participate in framework stability checks. It never scans history
or changes an older terrain manifest or city binding.

The optional `landscape/appearance:material-bindings=<json>` input explicitly
replaces the soil catalog's material references. It requires
`format: landscape-material-bindings`, `schemaVersion: 1`, the selected
`landscapeId`, and a `materialIds` object naming every soil exactly once. The
registered leaf derives a deterministic material revision and proves that restoring
the previous material IDs and revision restores the complete original manifest.
Heights, cover, soil operations, regions and authoring history therefore stay
unchanged. No-change bindings keep the existing revision.

Publication retains both terrain snapshots, installs authenticated material pages,
and preserves the previous appearance binding alias before switching current
appearance. Current terrain switches last under the existing authoring lock and
input-stability gates. A reader in the handoff interval can still resolve its old
terrain through the compatible alias. The shipped homogeneous binding request is
`tools/bake_landscape/appearance/uniform-materials-v1.json`; this is an optional
operation within the existing leaf, not a separate bake entry point.

Materials follow the landscape soil catalog order; those indices identify visual
soil-mask samples. Each binding contains `soilId`, stable `materialId`, physical
`tileMeters`, retained `calibration` (`presetId`, config hash and adjustments),
`roughnessInputRange`, and ordered `tiers` with IDs/resolutions 32, 128 and 512.
Each tier has independently readable `baseColor`, `normal` and `orm` channels:

```text
{url,width,height,encoding:'rgba8',colorSpace,byteLength,decodedByteLength,sha256,revision}
```

URLs are safe relative paths. Dimensions must be one of the supported square
tiers; byte lengths are exactly width × height × 4. Base color is sRGB; normals
and ORM are linear. ORM RGB channels are AO, roughness and metalness. Base-color
and normal alpha remain 255. Legacy ORM alpha is also 255 and carries no relief.
An optional per-material field opts into retained relative surface height:

```text
height: {encoding:'orm-alpha-unorm8',interpretation:'relative-relief',neutral:0.5}
```

For that material only, ORM alpha contains linear normalized displacement from
the retained source height map, filtered with the other surface channels. This
packing adds no page, texture sampler or resident allocation. Relative relief
is not a claim of measured metric elevation or collision geometry. Materials
without this metadata use neutral height 0.5, irrespective of their alpha bytes;
historical sidecars with no height metadata retain legacy coverage mixing.
The maximum page is 1 MiB and the maximum sidecar is 256 KiB. Hash authentication
precedes use. Invalid/truncated/oversized data fails explicitly.

Runtime materials resolve stable IDs through the existing global
`PbrTexturePipeline` and `PbrTextureCalibrationResolver`. Catalog defaults,
calibration and explicit local overrides retain their existing precedence. The
entire existing catalog/config import closure is retained byte-for-byte, plus
the correction and optional landscape-preparation configs used here; source imagery
is not needed by runtime.
The prepared page URLs are bounded derivatives of those catalog map slots,
not replacement material identities. BaseColor/normal/ORM are not loaded again
through unbounded original map URLs.

The D1a bindings are unknown→landscape_soil_uniform_v1,
seabed→aerial_beach_01, sand→aerial_beach_01,
loam→landscape_grass_uniform_v1, forest→landscape_forest_soil_uniform_v1 and
rock→landscape_rock_uniform_v1, all with the `pbr.` prefix. Source-selection
reasons and preparation policy are in
[LANDSCAPE_BASE_MATERIALS.md](LANDSCAPE_BASE_MATERIALS.md). Imported planning classes 5–7
retain their original urban/road/runway meaning and map to unknown substrate;
they do not create physical pavement, roads, or city objects. Water class 0
remains seabed substrate. The separate sea-level water reference is a visual
inspection surface, never a replacement elevation channel or hydrology model.
The beach replacement retains its 30-meter source scale and authenticated CC0
provenance in [LANDSCAPE_NATURE_MATERIALS.md](LANDSCAPE_NATURE_MATERIALS.md).
Older immutable material bindings remain part of their saved landscape snapshots.

## Spatial masks and semantic preservation

`loadLandscapeCoverMask(landscape,chunkId,{manifestUrl,fetchImpl,signal,maxDecodedBytes})`
fetches only that descriptor's existing `landCover` channel and authenticates
its hash/size. It returns `{descriptor,landCover,soilIndices,sourceRevision}`.
No height channel, original raster or full terrain mask is read. At most
257×257 input class bytes and 257×257 derived soil-index bytes are retained per
mask; decoded admission is 132,098 bytes for a coastal tile. Fetch/hash staging
is additional transient residency owned by the appearance scheduler.

`rasterizeLandscapeSoilMask(manifest,descriptor,landCover,soilIds?)` preserves
the raw class array and evaluates current ordered semantic soil overrides at
each world-space sample. `soilIds` must contain the complete catalog exactly
once; default order matches the sidecar. Mask cache identity includes landscape
revision, spatial key, cover channel identity and appearance/soil ordering. A
soil-only edit therefore refreshes every requested appearance level even though
its original cover hashes do not change. Unload/reload cannot restore an older
revision's overrides.

The graphics adapter derives a continuous visual field from those authenticated
categories using canonical halo reads and a bounded local contour fit. Its RGBA8
page packing, world-meter blending, filtering limits and resource costs are
specified in [LANDSCAPE_SURFACE_COVERAGE.md](LANDSCAPE_SURFACE_COVERAGE.md). This
runtime derivative does not modify this prepared source format, material pages,
categorical API or ordered semantic overrides.

Source masks keep row zero north, matching terrain coordinates. Category and
soil IDs use nearest sampling and never ordinary color filtering, gamma
correction, numeric class blending, or color mip averages. Coarse masks use
aligned native categorical samples and explicitly approximate visual coverage;
exact native semantic queries stay camera independent. Visual transitions may
blend rendered material responses while retaining both discrete input IDs.

The renderer's `natural-overview-infill-v1` presentation leaves this domain mask
unchanged. It derives a separate display soil from the bounded overview for
`planningOnly` cover entries, then applies current explicit soil overrides. Exact
queries continue to report the imported planning class and unknown substrate when
no authored override exists. The shared worker helper, packed display mask,
continuous material response and memory costs are specified in
[LANDSCAPE_APPEARANCE_RUNTIME.md](LANDSCAPE_APPEARANCE_RUNTIME.md).

## Selection independent from geometry

`createLandscapeAppearancePlanner(landscape,appearance,configuration?).plan(camera,options)`
uses metadata only. Camera fields match the geometry snapshot: projection,
position, viewportHeight, zoom, frustumPlanes, perspective direction/FOV or
orthographic height. Its geometric-error values are irrelevant: flat terrain
can retain one geometry tile while masks and materials refine independently.

Options are `previousMaskIds`, `previousTier`/`previousTiers`,
`targetMaskPixels` (default 4) and `targetTexelPixels` (default 1.5). Outputs include
complete `desiredMaskIds`, visible subset `visibleMaskIds`, `pixelsPerMeterById` (the
projected density of every visible mask page), the view-wide per-soil `desiredTiers` and maximum
`desiredTier` (every soil at the highest visible density; kept for diagnostics and for credit
protected before any mask is resident), `maskPixelsById`, `visibilityById`, `desiredMaskPixels`,
targets, source/appearance revisions and `sourceLimited`. With configured surface detail,
`detail.pixelsPerMeterById` holds the density of every visible fine leaf and
`detail.splitNativeIds` the native pages those leaves refine. Fine pages inherit their native
page's height envelope and tile it, so a split native page without a visible leaf was only
conservatively visible. The renderer admits resources separately; a desired plan is not a claim
that the budget allows every request or that the desired quality is already resident.

Mask selection refines when projected sample spacing exceeds its target,
retaining covering ancestors outside the frustum. Material tier selection uses
world tile size and projected texel footprint, not geometry triangle count.
Perspective bounds include closest view depth and transverse magnification;
orthographic density includes zoom and viewport resolution. FOV changes can
refine at fixed position. Coarsening uses 65% hysteresis. Native mask resolution
and 512-pixel source-page capacity stop refinement; larger values are explicitly
source-limited rather than invented source detail.

Optional factory configuration `materialTiling` maps soil IDs to `{tileMeters}`, the calibrated
physical period the renderer samples at every distance (AI577 D4 removed the four-times macro
lattice and its blend thresholds); soils without it use the sidecar `tileMeters`. Optional
`materialTiers` maps soil IDs to their ascending available resolutions (default 32/128/512; the
companion multiscale sidecar adds 1024). The pure
`desiredMaterialTiers(densityBySoil, {previousTiers, targetTexelPixels})` gives every material its
own tier (AI577 D4): its calibrated period times the highest projected density among the visible
pages where it occurs, divided by the texel target, met by the smallest available tier. Each
material coarsens with its own 65% hysteresis over its previous tier; a soil without a density
requests its smallest tier. Page granularity (500 m native, 62.5 m finest generated pages) can
still request more detail than a fragment uses. The renderer fits all material demands to the
shared budget level by level ([LANDSCAPE_APPEARANCE_RUNTIME.md](LANDSCAPE_APPEARANCE_RUNTIME.md),
"Material demand and budget fitting").

## Filtering, orientation and offline bounds

The registered `landscape/appearance` bake leaf uses existing PBR source maps,
the shared Python configuration, and no unrelated bake branch. Original source
images/configs are read-only. Source hashes, dimensions, original material IDs,
calibration and converter versions remain in provenance; no license is invented.
Basecolor reduction averages linear radiance before sRGB encoding. Normals are
averaged as vectors and normalized; ORM is linearly averaged. Existing calibration
is applied at runtime, not baked into every tier. Roughness percentile endpoints
come from the original map so tiers share one normalization; a constant endpoint
range requires a defined zero-span handling rather than division by zero.

Material page row zero is south after one offline vertical flip. With
`flipY:false`, world UV `(X,Z)/tileMeters` is east/north, using OpenGL tangent
normals. World anchoring and catalog tile size are unchanged across terrain
tiles, geometry LOD and material page tiers. Normal map texel detail remains
separate from native terrain elevation and is not new measured terrain geometry.

Only square power-of-two 512..1024 source images are accepted, checked before
decode. Sequential per-channel conversion uses a conservative 96 MiB tracked
array allowance for source decodes, float/filter scratch and output, separate
from runtime budgets and process overhead. No terrain sample grid is allocated.
Optional `pbr.landscape.config.json` metadata declares a landscape-only preparation
recipe. `periodic-log-microdetail-v1` removes broad per-channel tonal drift from a
homogeneous replacement in linear light using three wrapped box-filter passes on
log color, retaining the original channel mean before output clipping. Source
images remain unchanged. The finite integer filter radius and exact configuration
are retained in provenance. This treatment is opt-in; the accepted sand does not
use it. Relative source height is centered on its median and normalized using its
1st/99th-percentile range before linear area filtering into ORM alpha; constant
source height produces neutral 0.5. Bit-depth normalization never converts a
16-bit source directly into a saturated 8-bit grayscale image.

Pages, normal ranges, metadata hashes and candidate sizes validate before
immutable installation and the atomic appearance-sidecar switch. The authoring
lock and framework source checks protect publication. Default preparation leaves
the terrain manifest unchanged. An explicit material-binding publication may
advance only material references and landscape revision, retaining terrain
channels and authoring history; compatible historical appearance bindings remain
available. Repeated identical inputs produce byte-identical pages and sidecar.

Focused tests cover schema rejection, JSON key-order independence, fixed-position
appearance zoom on zero-error terrain, independent mask/texture targets,
categorical planning classes, current soil overrides, no-height requests,
pre-I/O admission, failed/canceled/hash-corrupt loads, correct source filtering,
repeatable preparation and manifest-last corruption refusal. Viewer/resource
integration adds shared texture reference counting, GPU mip/staging accounting,
bounded uploads, coarse fallback, transitions and the separate sea reference.

## Multiscale companion (AI577 D4)

`appearance/multiscale.json` is an optional, additive companion of one schema-1 sidecar; the
schema-1 tiers and bytes stay unchanged. Format `landscape-appearance-multiscale` version 1
records `landscapeId`, a content-derived `revision`, the extended `appearanceRevision` and its
`bindingKey`, capabilities `{encoding: "rgba8", gpuCompression: "none", maxPageBytes: 4194304,
tiers: [32, 128, 512, 1024]}`, `materials`, and provenance
`{format: "landscape-appearance-multiscale-v1", sources, recipes}`. Every level has an exact field
set and unknown fields are rejected. The file is at most 256 KiB, with an immutable
`multiscale.<sha256>.json` snapshot and content-addressed pages.

Each appearance soil, in appearance order, gets exactly one extra native 1024 tier with schema-1
channel semantics (base color, normals, ORM with relief alpha); a smaller source fails instead of
being upsampled. An optional `micro` entry
`{materialId, tileMeters, encoding: "micro-normal-height-luminance-v1", luminanceRange,
provenanceSourceIds, tiers}` adds one micro page per tier (32/128/512/1024, channel `micro`) so
each micro page pairs with one base tier. RG hold the OpenGL detail-normal XY, B holds relative
height (median-centered, normalized by the 1st/99th-percentile range) and A holds
`0.5 + 0.5 · (L/mean − 1)/luminanceRange`, clamped, decoded as the luminance ratio
`1 + (2A − 1) · luminanceRange`. Micro pages keep the schema-1 orientation and filters and are
mean-neutral: a periodic three-pass box high-pass on log luminance, slopes and height keeps only
detail finer than the recorded half-power wavelength.

`validateLandscapeAppearanceMultiscale` is asynchronous (the binding key is verified with Web
Crypto) and throws the typed `LandscapeAppearanceMultiscaleBindingError` for another landscape,
appearance revision or binding, so pinned older appearances fall back to schema 1 explicitly.
`loadLandscapeAppearanceMultiscale` returns null only for HTTP 404 and otherwise fails
explicitly; `loadLandscapeAppearanceMultiscalePage` loads and authenticates the 1024 and micro
pages that the schema-1 page loader rejects. Publication order is pages, immutable snapshot,
schema-1 sidecar, `multiscale.json`, terrain; publishing a new appearance revision that would
orphan an existing companion is refused.

The D4 publication is `multiscale-eedd520219823e11ff6c7381` (`multiscale.07ec6c0a….json`,
28,778 bytes, 38 provenance sources), extending `appearance-b3b39f64367c43336b3f45bd`. It adds
1024 tiers for all six soils (12 unique 1024 pages, 50,331,648 bytes) and the Ground054 micro
layer for sand and seabed (one unique page per tier, 5,312,512 bytes in all). Repeated
preparation from the same inputs is byte-identical. Runtime selection, fallbacks and accounting
are specified in [LANDSCAPE_APPEARANCE_RUNTIME.md](LANDSCAPE_APPEARANCE_RUNTIME.md).

A pinned older revision with other material bindings (the city pin, the nature-pass snapshot) resolves its retained appearance
through its binding alias, reports the companion `invalid` with reason `multiscale-binding-mismatch: …` and keeps schema-1 tiers;
its terrain fields stay `active` with `bound:false` and no stale chunk, because material-only revisions share the native channel
hashes the fields bind (`landscape_appearance_binding`).
