# Independent landscape appearance

D4 adds retained soil PBR bindings, bounded texture pages, and categorical mask
requests independent from geometry LOD. Native elevation, land-cover IDs and
soil operations remain authoritative landscape data. Appearance refinement does
not alter those identities or the results of exact terrain queries.

## Sidecar and material identity

The canonical sidecar is `assets/public/landscape/coastal-city/appearance/manifest.json`.
It has `format: landscape-appearance`, `schemaVersion: 1`, a content-derived
`revision`, `landscapeId`, `preparedFromRevision`, `bounds`, `grid`, `orientation`,
`materials` and `provenance`. Spatial identity compares required values, not JSON
key order. `preparedFromRevision` records preparation provenance; later height or
soil edits do not invalidate reusable material pages. A different addressing
frame, landscape ID, or semantic soil-to-material binding is rejected.

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
and ORM are linear. ORM channels are AO, roughness and metalness. Alpha is 255.
The maximum page is 1 MiB and the maximum sidecar is 256 KiB. Hash authentication
precedes use. Invalid/truncated/oversized data fails explicitly.

Runtime materials resolve stable IDs through the existing global
`PbrTexturePipeline` and `PbrTextureCalibrationResolver`. Catalog defaults,
calibration and explicit local overrides retain their existing precedence. The
entire existing catalog/config import closure is retained byte-for-byte, plus
the six correction configs used here; source imagery is not needed by runtime.
The prepared page URLs are bounded derivatives of those catalog map slots,
not replacement material identities. BaseColor/normal/ORM are not loaded again
through unbounded original map URLs.

The six initial bindings remain unknown→ground_037, seabed→gravelly_sand,
sand→coast_sand_rocks_02, loam→grass_004, forest→forrest_ground_01 and
rock→rocky_terrain_02, all with the `pbr.` prefix. Imported planning classes 5–7
retain their original urban/road/runway meaning and map to unknown substrate;
they do not create physical pavement, roads, or city objects. Water class 0
remains seabed substrate. The separate sea-level water reference is a visual
inspection surface, never a replacement elevation channel or hydrology model.

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

Source masks keep row zero north, matching terrain coordinates. Category and
soil IDs use nearest sampling and never ordinary color filtering, gamma
correction, numeric class blending, or color mip averages. Coarse masks use
aligned native categorical samples and explicitly approximate visual coverage;
exact native semantic queries stay camera independent. Visual transitions may
blend rendered material responses while retaining both discrete input IDs.

## Selection independent from geometry

`createLandscapeAppearancePlanner(landscape,appearance).plan(camera,options)`
uses metadata only. Camera fields match the geometry snapshot: projection,
position, viewportHeight, zoom, frustumPlanes, perspective direction/FOV or
orthographic height. Its geometric-error values are irrelevant: flat terrain
can retain one geometry tile while masks and materials refine independently.

Options are `previousMaskIds`, `previousTier`/`previousTiers`,
`targetMaskPixels` (default 4) and `targetTexelPixels` (default 1.5). Outputs include
complete `desiredMaskIds`, visible subset `visibleMaskIds`, per-soil
`desiredTiers`, maximum `desiredTier`, `maskPixelsById`, `visibilityById`,
`desiredMaskPixels`, targets, source/appearance revisions and `sourceLimited`.
The renderer admits resources separately; a desired plan is not a claim that
the budget allows every request or that the desired quality is already resident.

Mask selection refines when projected sample spacing exceeds its target,
retaining covering ancestors outside the frustum. Material tier selection uses
world tile size and projected texel footprint, not geometry triangle count.
Perspective bounds include closest view depth and transverse magnification;
orthographic density includes zoom and viewport resolution. FOV changes can
refine at fixed position. Coarsening uses 65% hysteresis. Native mask resolution
and 512-pixel source-page capacity stop refinement; larger values are explicitly
source-limited rather than invented source detail.

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
Pages, normal ranges, metadata hashes and candidate sizes validate before
immutable installation and the atomic appearance-sidecar switch. The authoring
lock and framework source checks protect publication; the height manifest stays
unchanged. Repeated identical inputs produce byte-identical pages and sidecar.

Focused tests cover schema rejection, JSON key-order independence, fixed-position
appearance zoom on zero-error terrain, independent mask/texture targets,
categorical planning classes, current soil overrides, no-height requests,
pre-I/O admission, failed/canceled/hash-corrupt loads, correct source filtering,
repeatable preparation and manifest-last corruption refusal. Viewer/resource
integration adds shared texture reference counting, GPU mip/staging accounting,
bounded uploads, coarse fallback, transitions and the separate sea reference.
