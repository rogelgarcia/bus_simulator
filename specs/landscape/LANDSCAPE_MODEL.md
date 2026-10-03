# Landscape model, version 1

D1 provides persistent, renderer-independent source data, one bounded overview, validation, and provisional point context. D2 adds bounded authoritative acquisition and terrain/soil edits through `LANDSCAPE_EDITING.md`. D3 adds complete hierarchies and bounded automatic streaming through `LANDSCAPE_HIERARCHY.md` and `LANDSCAPE_STREAMING.md`. Appearance pages and city integration remain later deliverables of AI 576. Opening this data does not make current game physics or city construction terrain-aware.

The public entry point is `src/app/landscape/index.js`. Its modules import no renderer, DOM, Three.js, or Node facilities. The valid retained example is `assets/public/landscape/coastal-city/manifest.json`. `tests/node/unit/landscape_model_fixture.js` generates a small deterministic example containing flat submerged ground, a slope/hill, and several soil regions for `landscape_model.test.js`.

## Authority and identity

The JSON manifest and its independently hashed native height/land-cover channels are authoritative. Float32 heights are stored in meters at native vertices. Imported land cover is a separate semantic source channel. Initial soil is resolved by the explicit land-cover-to-soil mapping; D2 applies ordered hard soil-region overrides afterward. The default `unknown` soil reserves a whole-extent substrate identity without claiming knowledge under planning pavement. Published height channels already contain their edits; loading never reapplies the audit operation log.

Overview/intermediate channels, mesh vertices and normals are derived. A coarse sample cannot be used as an exact edit instruction. Camera pose, inspection mode, hover, selection, and bookmarks do not belong to the source heightfield. Selection context is a separate document.

Landscape IDs and chunk IDs are independent of meshes, vertex numbers, and residency. Content revisions and channel hashes identify their contents. An unchanged chunk can retain its revision and URLs through a later landscape revision. Changing the native grid, origin, or extent changes the addressing frame and requires a new landscape ID or an explicit migration of every spatial record; it must not silently reinterpret an existing ID.

## Manifest fields

`validateLandscapeManifest(value)` validates, copies, and deeply freezes plain JSON data; it throws an actionable `[Landscape]` error for an invalid document. Inputs must not contain typed arrays, nonfinite numbers, functions, custom objects, or executable state. Unknown optional JSON properties are retained, while unknown required `capabilities` are rejected. There are no silent schema migrations.

| Field | Contract |
| --- | --- |
| `format`, `schemaVersion` | Exactly `landscape`, `1`. |
| `id`, `revision` | Nonempty stable strings, at most 160 characters, using letters, digits, `.`, `_`, `/`, `-`; first character alphanumeric. |
| `name` | Nonempty string of at most 200 characters. |
| `bounds` | Finite `minX`, `maxX`, `minZ`, `maxZ`; strictly positive spans in meters. Both outer edges include samples. |
| `coordinates` | `units: meters`, `upAxis: Y`, `xDirection: east`, `zDirection: north`, `rasterRow0: north`; finite `origin: {x,y,z}` identifying the southwest datum and finite world-Y `seaLevel`. Origin X/Z equal minimum X/Z bounds. |
| `grid` | `columns`, `rows`, positive `spacingX`, `spacingZ`, `chunkIntervals`, `maxLevel`. V1 is a dyadic square sample grid; physical X/Z spans may differ. |
| `elevation` | `units: meters`, `encoding: float32-le`, `interpolation: triangulated-nw-se`, `noData: forbidden`, `outside: outside`. |
| `soil` | `defaultId`, nonempty `catalog`, complete `landCoverMapping`, and `overrides: []` in D1 or validated ordered region assignments with D2's editing capability. Soil IDs must resolve in the catalog. |
| `landCover` | `encoding: uint8`, `sampling: nearest`, and unique catalog IDs in 0–255. Every encountered payload ID must be declared. |
| `overviewId` | Exactly `l0/c0/r0`, referencing one full-extent covering descriptor. |
| `chunks` | Nonempty bounded array of descriptors. All finest-level spatial keys are present. Prepared coarser parents are required, with acyclic level ordering. |
| `provenance` | `kind: designed-prototype` or `synthetic-fixture`, `sourceName`, lowercase `sourceSha256`, positive `nativeResolutionMeters`, and `preparation.algorithm`; preparation can preserve additional plain settings. |
| `references` | Array of `{id,role,url,sha256,byteLength,encoding}`. IDs are unique; URLs are safe relative asset paths. These preserve planning/source information without creating gameplay objects. |
| `capabilities` | Unique required capability IDs. Base documents support `heightfield`, `land-cover`, `coarse-preview`; the first two are mandatory. D2 adds `terrain-editing-v1`; D3 adds `chunk-hierarchy-v1`. |
| `hierarchy` | With D3's complete-tree capability: `algorithm: native-hierarchy-v1`, `errorPolicy: measured-native-vertices` or `conservative-after-edit`. Every level has all spatial keys and direct quadtree parents. |
| `operations`, `editHistory` | Operations are empty and history absent in D1. D2 requires validated ordered operations and revision/snapshot/batch-ID history under its capability; see `LANDSCAPE_EDITING.md`. |
| `regions`, `attachments` | Empty arrays in D1–D2. Reserved for explicitly supported later semantics. Nonempty unsupported blocks fail rather than being ignored. |

`cityBinding` is reserved and rejected in D1–D2. D6 will add its explicit capability and validator. Schema-1 readers continue to load unchanged D1 documents. D2 implements operations/soil overrides under its required capability; masked no-data and content layers remain unsupported until their capability is implemented. Optional diagnostic/provenance additions do not change the meaning of existing fields. The manifest factory continues producing base documents without an editing history.

`createLandscapeManifest({id,name,revision,bounds,grid,chunks,provenance,coordinates?,overviewId?,references?})` fills the fixed v1 contracts, standard catalogs, empty authoring/content blocks, and capabilities, then validates. The default coordinate datum is `{x: minX,y: 0,z: minZ}`, sea level is zero, the overview ID is `l0/c0/r0`, and references default to `[]`. Other required data has no fallback.

## Coordinates and surface sampling

Persisted height values are absolute world Y, relative to the declared datum. Neither loading nor rendering adds `origin.y`, rescales heights, or applies vertical exaggeration. Sea level is an independent world Y value; valid zero heights and negative seabed elevations are never missing data.

For native row/column coordinates:

```text
x = bounds.minX + column * grid.spacingX
z = bounds.maxZ - row * grid.spacingZ
column = (x - bounds.minX) / grid.spacingX
row = (bounds.maxZ - z) / grid.spacingZ
```

The coastal package is 2049×2049 samples, 2048 intervals, and 4000×4000 meters. Native spacing is exactly 1.953125 meters. Its row 0 maps to Z=4000, column 0 maps to X=0, and sample (2048,2048) maps to (4000,0). Upsampling does not add source detail.

Each cell uses the northwest-to-southeast diagonal. With vertices `a=NW`, `b=NE`, `c=SW`, `d=SE`, upward-facing index triangles are `[a,d,c]` and `[a,b,d]`. Let `u` increase east and `v` increase south within the cell:

```text
u >= v: height = a + (b-a)*u + (d-b)*v
u <  v: height = a + (d-c)*u + (c-a)*v
```

This is triangle interpolation, not bilinear filtering. Sampling normals use the selected triangle's world-space derivatives: normalize `(-dY/dX, 1, -dY/dZ)`. Slope is `atan(hypot(dY/dX,dY/dZ))` in degrees. At the diagonal, the first triangle owns the normal. At a chunk boundary, elevation and categorical samples agree from either side; a triangle normal can differ across the crease. A future authoritative query owner must choose one deterministic cell at boundaries independently of the render LOD.

Land-cover IDs use nearest native/resident sample with exact half ties choosing east and south. They are not averaged, gamma-corrected, or interpreted as colors. Coarse land cover samples the aligned native vertex categorically, so its visual coverage is approximate. Soil results from coarse data are explicitly provisional.

`landscapeGridToWorld(manifest,column,row)` accepts fractional in-bounds raster coordinates. `landscapeWorldToGrid(manifest,x,z)` returns `ready` with fractional `column,row`, or `outside`. No clamping outside the landscape is allowed. V1 forbids source no-data values: nonfinite samples are validation errors; introducing a validity mask requires an explicit later contract.

`sampleLandscapeChunk(manifest,chunk,x,z)` returns:

```text
ready: {landscapeId,revision,chunkId,accuracy,provisional,
        position:{x,y,z},height,normal:{x,y,z},slopeDegrees,
        soilId,landCoverId,sampleSpacing:{x,z},nativeSample:{column,row},
        seaLevel,waterDepth,submerged}
outside: point is outside the landscape
unavailable: point is in the landscape but outside this supplied chunk
```

`accuracy` is `authoritative` only for stride-1 native data; otherwise it is `approximate` and `provisional` is true. `waterDepth=max(0,seaLevel-height)` and `submerged=height<seaLevel`; land-cover class 0 alone is not a water surface. `sampleLandscapeChunk` calls only resident data. D2's asynchronous region-acquisition contract exposes pending/ready/outside/unavailable states without substituting a camera-dependent coarse sample; its native point owner is the east/south chunk at shared boundaries.

## Independent payloads and hierarchy

`chunkIntervals` is a power of two in 1–256; each descriptor contains `(chunkIntervals+1)²` vertex samples, at most 257×257. `maxLevel` is in 0–20. Grid dimensions equal `chunkIntervals * 2^maxLevel + 1`. Finer source packages increase hierarchy depth rather than requiring larger per-request arrays.

Spatial IDs are `l<level>/c<column>/r<row>`, where level 0 covers the whole landscape, and level `maxLevel` is native. Chunk rows increase southward. At level L there are `2^L` chunks per axis. For a descriptor:

```text
sampleStride = 2^(grid.maxLevel - level)
startColumn = column * grid.chunkIntervals * sampleStride
startRow = row * grid.chunkIntervals * sampleStride
columns = rows = grid.chunkIntervals + 1
```

Descriptors carry `id,level,column,row,startColumn,startRow,sampleStride,columns,rows,bounds,minHeight,maxHeight,geometricError,revision,parentId,channels`. Bounds follow the same coordinate equations. `minHeight/maxHeight` conservatively enclose the native source covered by the descriptor, including extrema missed by coarse samples. `geometricError` bounds vertical difference from native triangulated terrain; native descriptors use zero. A source edit rebuilds every affected ancestor and updates its conservative error; offline preparation measures tight errors again.

For the coast, D1 prepares level 0 plus all 64 level-3 chunks. The overview has stride 8 and spacing 15.625 meters; each native chunk spans 500 meters. Level-3 descriptors initially name the root as their prepared parent. D3 adds all four level-1 and sixteen level-2 nodes and direct parent links without renaming native spatial IDs or changing native payloads. Adjacent native chunks duplicate their shared edge vertices exactly, including land-cover values; source preparation validates those duplicates. The current-source hierarchy workflow is specified in `LANDSCAPE_HIERARCHY.md`.

Each `channels.height` and `channels.landCover` descriptor contains:

| Field | Contract |
| --- | --- |
| `url` | Path relative to the manifest, with no absolute URL, `..`, `.` segments, empty segments, backslashes, query, or fragment. Runtime assets never reference `downloads/` or an absolute machine path. |
| `encoding` | Height: `float32-le`; land cover: `uint8`. Headerless, uncompressed, row-major samples. |
| `byteLength`, `decodedByteLength` | Exact sample count times 4 for height, times 1 for land cover. |
| `sha256` | Required lowercase hexadecimal SHA-256 of the encoded bytes. |
| `revision` | Stable channel content revision; independent from an unchanged channel in a changed chunk. |

There is no giant runtime raster or JSON sample array. A coastal chunk has 66,049 samples, 264,196 height bytes, and 66,049 category bytes: 330,245 decoded bytes total. The root has the same bounded footprint. D1 loads the manifest and root channels only; the importer alone reads the original ZIP/native rasters.

`encodeLandscapeChannel(values,encoding)` validates and writes a bounded channel. `decodeLandscapeChannel(bytes,channel,{minHeight?,maxHeight?,allowedIds?})` checks lengths, encoding, finite elevations/range, and known category IDs and returns a consumer-owned typed array. Hash checks belong to the loader. Decoded arrays are mutable caller-owned resources, while public wrappers and manifests are frozen; callers must not modify an active saved source in place.

`loadLandscapeManifest(url,{fetchImpl?,signal?})` fetches at most 1 MiB, parses JSON, and validates. `loadLandscapeChunk(manifest,id,{manifestUrl,fetchImpl?,signal?,maxDecodedBytes?})` performs byte admission before I/O, sequentially fetches only that descriptor's two channels, verifies hashes and decoded contents, and returns `{descriptor,heights,landCover}`. `maxDecodedBytes` defaults to 1 MiB. Bounded response readers reject oversized `Content-Length`, oversized bodies, truncation, and unsuccessful HTTP responses. Web Crypto is required for SHA-256; unavailable verification fails explicitly. Abort signals prevent canceled work from becoming a successful result.

`loadLandscapeOverview(url,options)` composes these functions and returns `{manifest,chunk,manifestUrl,encodedBytes,decodedBytes}`. Root and native payloads share the same format. Scratch bytes and Web Crypto/browser response allocations are distinct from returned decoded residency; D3 must account for them when reserving streaming work. D1 caps the manifest at 1 MiB and a payload at its exact declared byte count, and the viewer separately admits its mesh/inspection allocations before construction.

A failed reload rejects its candidate without mutating a prior returned manifest/chunk. The viewer owns the current display and camera: it publishes a fully valid replacement together, retains its last valid display on failure, reports an error, and releases superseded objects on success or teardown. The domain loader has no scene ownership or whole-city reconstruction side effects.

## Soil and reference semantics

`LANDSCAPE_SOIL_CATALOG` binds semantic IDs to existing ground-eligible PBR IDs and an explicit TerrainEngine biome:

| Soil | Material | Biome |
| --- | --- | --- |
| `unknown` | `pbr.ground_037` | `land` |
| `seabed` | `pbr.gravelly_sand` | `land` |
| `sand` | `pbr.coast_sand_rocks_02` | `land` |
| `loam` | `pbr.grass_004` | `grass` |
| `forest` | `pbr.forrest_ground_01` | `land` |
| `rock` | `pbr.rocky_terrain_02` | `stone` |

The material ID is a visual binding, not a soil identity or traction implementation. D1 uses a small categorical color palette; resolving/loading material assets belongs to D4 and the graphics adapter. Existing catalog IDs are referenced without importing the graphics catalog into the domain. Humidity and vegetation are not inferred from this mapping.

Land cover 0–4 maps respectively to seabed, sand, loam, forest, and rock. Classes 5–7 retain urban, road, and runway planning cover while mapping to unspecified substrate. Those classes do not create roads, prove pavement construction, or determine buried soil. Reference channels retain separately hashed originals with explicit roles. Imported roads retain XYZ elevations; future adapters must explicitly extract XZ for horizontal planning rather than confusing vertical Y with a legacy tile-Y coordinate.

This adapts the semantic biome vocabulary from `specs/grass/TERRAIN_ENGINE_BIOME_PATCH_MASKS_SPEC.md` and keeps Terrain Debugger's transient settings outside persisted authority (`TERRAIN_DEBUGGER_ENGINE_CONTRACT_SPEC.md`). Appearance bindings follow `specs/materials/PBR_MATERIAL_CATALOG_SPEC.md`. Future roads/asphalt, foundations, props, vegetation, collision, exclusion records, and illumination products need their own attachment channels and dependency versions; terrain must continue loading without them.

## Selection and city-frame handoff

`createLandscapeSelectionContext(manifest,chunk,{x,z,selectionId,radius?,camera?})` returns frozen plain JSON with `format: landscape-selection`, `schemaVersion: 1`, `landscapeId`, `sourceRevision`, `selectionId`, explicit coordinate convention, `position`, `region`, `sample`, `provisional`, and `editingReady`. The region is a point or an explicit world-meter circle wholly inside the landscape. Optional camera data is supplementary plain JSON. The supplied coastal overview always produces `provisional: true` and `editingReady: false`. D2's `queryLandscapeSelection` reacquires complete native area coverage and records its exact source revision before producing editing-ready context; a displayed coarse center alone does not authorize the whole region.

The handoff follows the explicit source/revision/context separation used by `specs/graphics/mesh_fabrication_live_mesh_handoff.md`, without adopting its editor UI. Navigation/selection does not mutate the manifest. The screen and local handoff endpoint own persistence of the transient selection document.

CityMap's origin is the center of tile `(0,0)`, not its southwest boundary. City tile Y increases toward world +Z, opposite raster-row direction:

```text
worldX = city.origin.x + tileColumn * city.tileSize
worldZ = city.origin.z + tileRow * city.tileSize
tileColumn = floor((worldX-city.origin.x)/tileSize + 0.5)
tileRow = floor((worldZ-city.origin.z)/tileSize + 0.5)
```

`landscapeCityTileToWorld` and `landscapeWorldToCityTile` implement these conventions with explicit ready/outside results. Tile boundaries are half-open toward the next positive tile, matching CityMap's `Math.round` for spatial ownership, including negative world coordinates. D6's binding will preserve an explicit identity/translation frame and supported landscape subregion; partial edge tiles use the intersection of their tile footprint and that subregion. Terrain spacing, chunk span, and city tile size remain independent. City reseeding or resizing must never recenter, rescale, or regenerate a bound landscape. Actual normalize/export integration remains D6.

Current terrain, slab, road, spawn, and collider systems still need future nonflat adapters. Foundation flattening will require explicit authored terrain operations, separate from parcel/reservation footprints described in `specs/city/construction_placement.md`. A single-valued heightfield cannot represent tunnels, caves, overhangs, bridges, or stacked surfaces; these require independent geometry/content layers.
