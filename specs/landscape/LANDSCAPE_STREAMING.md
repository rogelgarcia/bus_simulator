# Landscape streaming

This contract adds D3 hierarchy selection and bounded residency to the landscape
model. Elevation and semantic source data remain authoritative on disk. A render
partition is a temporary view of that data, never a saved terrain edit.

Status: AI 596 D5 shipped the render-only far-field surround and the raised
profiles (640/352 MiB with the surface cache off, 640/544 MiB with it on at
1920 × 1080; "Resource admission and ownership" and "Far-field surround" below).
Coastal terrain v3 (341 nodes, 0.9765625 m) is the pinned production landscape;
the 85-node v2 remains the default directory of the viewer, server and suites.
The measured tables of this page are kept as recorded, each with its conditions;
the D6 same-condition tables are in `LANDSCAPE_PERFORMANCE.md`.

## Prepared hierarchy

`chunk-hierarchy-v1` declares a complete quadtree with direct parent identities.
The coastal dataset contains 85 nodes: 1 overview, 4 level-1 tiles, 16 level-2
tiles and 64 native tiles. Every tile has 257 by 257 samples. The native spacing
is 1.953125 meters; coarser levels select aligned native samples without changing
their float32 bits or categorical class IDs. Coastal terrain v3 (`coastal-city-v3`,
AI 596 D4, the landscape the city spec pins) is the same contract one level deeper:
341 nodes, 256 natives of 250 m at 0.9765625 m, measured errors from the synthesis
writer (`LANDSCAPE_HIERARCHY.md`).

The registered `landscape/hierarchy` bake leaf reads the current canonical native
payloads, including saved edits. It preserves the retained ZIP, soil overrides,
operation history and reference data. It validates immutable output payloads and
publishes a manifest switch last. It does not reimport the ZIP over authored work.
Its measured geometric error is the maximum absolute elevation difference from
the declared NW-SE triangulation over descendant native vertices. Native nodes
have zero source error. Edits rebuild every affected ancestor and conservatively
increase its error bound until the hierarchy is measured again.

A finer synthesized grid is a deeper tree of the same 257² tiles (AI 596 D3:
4097² at 0.9765625 m is maxLevel 4 with 341 nodes and 250 m natives, 8193² at
0.48828125 m is maxLevel 5 with 1,365 nodes and 125 m natives). What scales with
the depth: the planner's per-frame cost, which projects the error and tests the
visibility of every node each frame (85, 341 or 1,365 nodes; the appearance
planner loops the same nodes); the root-to-native refinement of one view path,
which is `maxLevel` sequential refine tasks (one four-sibling task at a time),
each at least four upload frames plus the 0.3 s morph — 3 tasks at 1.953125 m, 4 at
0.9765625 m, 5 at 0.48828125 m; and the prefetch margin `min(250 m, span / 4)`
of a candidate child, 125 m for 500 m natives, 62.5 m for 250 m, 31.25 m for 125 m.
What does not: the per-tile CPU and GPU reservation, the one-tile 8 MiB upload
per frame, the 1.5 px target and the startup contract — nothing native is fetched
before the first frame at any depth, only the manifest and the root's two channels.

## Camera planning

`createLandscapeViewPlanner(manifest)` validates and indexes metadata once. Its
`plan(camera, options)` method returns a complete desired leaf partition, visible
leaf IDs, per-node projected errors and an explicit quality target. It allocates
no height, mesh or texture payloads.

Camera input contains `projection`, world `position`, `viewportHeight` in physical
pixels, `zoom`, and inward-facing `frustumPlanes` as `{x,y,z,w}`. Perspective input
adds `fovYRadians` and a normalized viewing `direction`; orthographic input adds
`orthoHeight` before zoom. The renderer supplies direction so perspective error
uses conservative closest view depth through each tile's native elevation
envelope. The public helper also supports Euclidean distance when direction is
omitted; consumers requiring the conservative quality bound must supply direction.

Perspective error bounds both transverse displacement and the magnification caused
by a height change also changing view depth. It multiplies height error and pixel
focal length by `sqrt(1-forwardY²) + abs(forwardY) * transverseRadius / minDepth`,
then divides by closest positive view depth. The radius is the maximum transverse
distance of the native elevation AABB's corners. Orthographic error uses physical viewport
height divided by view span. Frustum tests use tile bounds and the native height
envelope. Zero native error stops geometric refinement. Small field of view or
increased orthographic zoom can refine without moving the camera.

The default target is 1.5 pixels. A previously refined branch coarsens below 65%
of that target to avoid repeated switching near a threshold. Invisible regions
keep coarse covering leaves. A balancing pass limits adjacent leaf differences
to one level, including coarse neighbors outside the camera. Missing intermediate
levels retain their covering parent and report an unmet target rather than
inventing detail. Desired partition and achieved residency are separate outputs:
budgets and failed requests may prevent achieving the desired detail.

Optional camera `velocity` is in meters per second. The planner returns at most
two `prefetchIds`, one level below coarse leaves outside the visible partition.
Candidates intersect a narrow expanded frustum or the frustum translated by half
a second of motion, capped at 500 meters. Predicted candidates take priority.
These hints acquire source buffers only, at lower priority than camera/query work,
using spare admitted capacity. They never force GPU allocations or evict useful
coverage; changing the view cancels obsolete prefetch work.

## Resource admission and ownership

`LandscapeResidencyBudget` is a renderer-independent synchronous ledger shared by
camera resources, worker jobs and non-camera consumers. Its default profile is:

| Resource or work limit | Default |
| --- | ---: |
| Controlled terrain CPU buffers and reservations | 640 MiB since AI 596 D5 (512 MiB in AI577 D4 – AI 596 D4, 128 MiB before AI577 D2, 384 MiB in D2–D3) |
| Estimated terrain GPU buffers and reservations | 352 MiB since AI 596 D5 (256 MiB in AI577 D4 – AI 596 D4, 64 MiB before AI577 D2, 192 MiB in D2–D3) |
| Render-only surround share inside the totals (AI 596 D5, `LANDSCAPE_SURROUND.budgets`, kind `landscape-surround`) | 128 MiB CPU / 96 MiB GPU: the raise above is exactly this share, so the authoritative streams keep their 512/256 MiB |
| Concurrent geometry fetch/decode/mesh workers | 2 |
| Concurrent independent appearance worker | 1 |
| Concurrent surface-detail generation workers (AI577 D2) | 2 |
| Tile uploads per animation frame | 1 |
| Upload bytes per animation frame | 8 MiB |
| Terrain-field array and decodes (AI577 D5) | own ceiling of 1/8 of each total (64 MiB CPU / 32 MiB GPU shipped), inside the shared limit |
| With the runtime surface cache on (AI577 D6/D7, the default since D7, `landscapeSurfaceCacheBudgets`) | 640 MiB CPU / 544 MiB GPU up to 1920×1080, 684 at 2560×1440, 1046 at 3840×2160 (the display's capacity; 512/448, 588 and 950 before AI 596 D5); the cache takes at most the GPU limit less the streams' reserve (352 MiB, the uncached GPU limit), so its 192 MiB ceiling and the streams' room are unchanged by the raise |
| Geometric screen error goal | 1.5 pixels (the render-only surround streams at 3 pixels) |

URL budgets may not exceed the profile of the selected mode (surface cache off: 640/352 MiB; on: the display's cache profile, 640/544 MiB up to 1920×1080).

The upload byte cap includes the optional owned wireframe buffers; one inspection
tile must fit the same admission path as an ordinary shaded tile. A mode toggle
may reduce achievable detail when inspection resources consume the available
budget. It must not bypass admission or allocate a full-resolution debug mesh.

`reserve(key, {cpuBytes,gpuBytes,kind,pinned})` admits a complete reservation before
work starts. `update` replaces its size atomically and refuses excess growth.
Both return `{admitted,reason}` with `cpu-budget` or `gpu-budget` on refusal.
Reservations count old/new transition overlap and temporary fetch, decode, worker,
mesh construction, typed-array transfer and inspection resources. Decoded arrays
retained after an upload continue to count toward CPU residency. Shared allocations
have one entry and references rather than duplicated byte estimates.

The natural presentation pass reserves each worker's bounded overview label grid
and construction queue before initialization or replacement. Mesh workers reuse
their existing overview source copies; the appearance worker's cover copy is
separately accounted. The combined additional CPU reservation is 1,056,784 bytes
for coastal 257² root pages; GPU mask capacity is unchanged. Details and exact
semantic/display separation are in `LANDSCAPE_APPEARANCE_RUNTIME.md`.

AI577 D1 keeps the mask slot count and sampler count, while each slot becomes a
padded RGBA8 categorical/derived-contour page. Its controlled storage and source
halo reservations are described in `LANDSCAPE_SURFACE_COVERAGE.md`. The appearance
planner protects bounded view demand before geometry admission; real allocations
replace that credit and shrinking demand releases unused credit. All of it remains
inside the existing shared and per-appearance ceilings.

`acquireLease(key, {consumer,priority,accuracy})` returns an idempotent release
handle. A resource with any lease cannot be evicted when the main camera turns
away. Query/edit, shadow and future collision or content-layer consumers use this
same ownership mechanism. Accuracy is `approximate` or `authoritative`; reserving
memory never changes coarse samples into authoritative native results. Bounded
consumers receive explicit budget failure instead of unbounded allocation.

Root coverage is pinned during the active session. If even minimum coverage cannot
fit a requested profile, loading fails visibly before publication. Lower-priority
detail must not remove the last valid covering representation. Releasing a lease
does not silently free memory: the owner must dispose the actual resource and
release its ledger entry together. Teardown disposes workers and graphics resources,
then clears all reservations. The ledger reports current and peak CPU/GPU bytes,
denials, resource kinds and lease owners for tests and live diagnostics.

GPU bytes are estimates of owned terrain buffers and later texture/mip allocations,
not measurements of total device VRAM. Browser, JavaScript object overhead, WebGL
driver caches, drawing buffers and the rest of the operating system are outside
these terrain-buffer limits. The local Node authoring process has its own bounded
working-set contract in `LANDSCAPE_EDITING.md`; its bytes are not device VRAM.

## Request identity and failure

`landscapeResourceKey` includes landscape identity, manifest revision, spatial
tile, LOD, channel, channel revision and payload hash. Request completion must also
match the active session generation. Cancellation disposes obsolete completed
work; an old landscape or revision must never replace current tiles. Failed or
corrupt detail retains parent coverage, exposes a diagnostic and receives only a
bounded number of retries. A camera teleport or rapid zoom change must cancel or
reprioritize stale work before admitting a new batch.

The runtime may preload a bounded set of neighboring siblings needed for an atomic
transition. It must not fetch all 64 native coastal tiles at startup, decode the
source raster, or allocate the full 8,388,608-triangle native mesh. Appearance
residency is independently selected in D4, so low triangle count cannot disguise
full-resolution mask or texture residency.

An evicted record leaves the prefetch set at once. A consumer lease (a Game POV or selection query) released over a prefetched
source chunk evicts it; its stale prefetch ID previously made the next refinement's prefetch cancellation evict that chunk's newly
reserved build record before the task was set, so the refinement waited forever and streaming never settled (AI577 D7 fix,
`landscape_streaming` regression test).

The viewer clamps a frame interval at zero: an animation frame's time is the time its frame began and can precede a resume that
ran just before its callbacks (a tab shown again, the pause hook). The negative interval drove a running LOD morph below zero and
the edge stitching assertion stopped the frame loop for good (AI577 D7 fix, `landscape_lifecycle` regression test).

## Far-field surround (AI 596 D5)

A landscape may publish a **render-only surround** beside its manifest: `surround/manifest.json`, a
standalone saved landscape document (coastal v3: `coastal-city-v3-surround`, 2049² at 15.625 m,
chunkIntervals 256, maxLevel 3, 85 nodes, bounds −14000..18000 on X and Z, 32 × 32 km centred on the
4 km extent, sea level 0, no appearance, no fields, no geology) whose `provenance.preparation.surround`
block binds it to one landscape: `{landscapeId, revision, manifestSha256, extent, boundaryHash}` with
`extent` the landscape bounds and `boundaryHash` the SHA-256 of the native heights along the four
boundary rows/columns. Inside the extent it carries the landscape decimated ×16; outside it continues
the landform. The surround is not authoritative: it is never edited, queried, reported or picked, and
a picking ray that leaves the landscape reports no terrain whatever the surround draws there.

Runtime (`src/graphics/engine3d/landscape/LandscapeSurround.js`, contract constants in
`LandscapeSurroundModel.js`, `landscape-surround-v1`): the sidecar is fetched with the bounded manifest
loader and validated as a landscape document; `landscapeSurroundBinding` then compares the block with
the loaded landscape **before anything is reserved**. A sidecar that is absent (404), `unbound` (no
block), `stale` (another landscape id, another revision, or an extent that is not the landscape bounds),
`invalid` (a malformed block, or bounds that do not contain the extent) or `failed` holds no resources
and is reported with its reason in the view snapshot; only `bound` is drawn, so a terrain edit can never
show the surround of the terrain before it. An active surround is a second `LandscapeStreamer` over the
surround document in render-only mode: program variant `{diagnostics: false, terrainAppearance: false,
surfaceCache: false}` in **soil-palette mode** (below; one far colour and fallback surface per display
soil, lit by the shared lighting uniforms with the same aerial perspective and water column as the
authoritative tiles), natural inference `overview` (no fields request), target error **3 px** instead of
1.5, one worker, and the per-frame upload allowance the authoritative stream left (`update(dt, camera,
viewportHeight, uploadAllowance)`; the combined uploads of geometry, surround, appearance and planning
stay under the 8 MiB cap).

**Soil palette** (`LandscapeSoilPalette.js`, `landscape-soil-palette-v1`; streamer option `soilPalette`).
A stream in soil-palette mode builds its tiles with each vertex's display soil index in the red byte of the
colour attribute (`buildLandscapeMeshBuffers({soilPalette: true})`, the same `presentation.sample` index
the catalog colours use) and binds one set of palette cells to every tile (`uSoilPalette[6]`,
`uSoilPaletteResponse[6]`, `uSoilPaletteSurface[6]`, `uSoilPaletteMode`), which the terrain vertex
shader reads into the fallback surface varyings (`vLandscapeColor`, `vLandscapeResponse`,
`vLandscapeSurface`); outside palette mode the attribute is the colour and the fallback surface is the
plain one (no response, roughness 0.9, no occlusion), so every other stream is unchanged. The cells start
on the land-cover catalog colours the vertex path carries (`landscapeCatalogSoilPalette`, byte-identical)
and each soil's natural-ground response (`LandscapeMaterialResponse`: EON diffuse roughness, specular
shadowing weight, opposition amplitude — a property of the soil, applied in both states), and take the
loaded appearance's palette once every material has its coarse page (`LandscapeMaterialPages.soilPalette()`,
versioned by coarse arrivals and calibration changes): per soil the **mean linear albedo of the 32 px
base-colour page under the material's albedo correction** (`correctedAlbedo` in JavaScript: brightness ×
landscape-local calibration gain, hue, saturation, tint — what the authoritative tiles show once their
mips average the page) and the **mean roughness and ambient occlusion of the 32 px ORM page** after the
material's remap and intensity. The view feeds it every frame (`surround.setPalette(palette)`, a no-op
for an applied version; null restores the catalog), so a calibration switch or a late appearance never
rebuilds a tile. Without an appearance the surround keeps the catalog colours. The terrain-field macro
variation, catena tinting, rock exposure and coastal wetting need the appearance's field pages and stay
with the authoritative tiles; the response alone accounted for most of the boundary step (with it off on
the authoritative tiles the NW-11 band step fell from 50 to 13 sRGB units, `d5/colour/attribution/`).
Seabed and sand bind the same beach material, so the surround sea floor and beach follow the beach.

Its tiles reserve in the shared `LandscapeResidencyBudget` through `createLandscapeSurroundLedger`: every
reservation carries the kind `landscape-surround` and is admitted against the surround's own share
(`LANDSCAPE_SURROUND.budgets`) before the shared ledger admits it; a share denial reads like a ledger
denial (`cpu-budget` / `gpu-budget`), so the stream prunes, retries and settles on coarser coverage, and
the authoritative stream keeps the rest of the ledger. The share is accounted inside the shipped profiles
(`LANDSCAPE_STREAMING_BUDGETS` and `landscapeSurfaceCacheBudgets` grew by it; the measured peaks are in
`LANDSCAPE_PERFORMANCE.md`), and the unit test `landscape_surround.test.js` pins that both profiles keep
the authoritative streams at least their pre-D5 room beside the share.

**Exclusion.** The surround stream runs with a mesh exclusion equal to the landscape bounds
(`landscapeMeshExclusion`, `LandscapeMeshBuffers.js`): a surround tile whose bounds lie inside the
extent is never built, fetched or reserved (`excludedIds` in the stream snapshot; the centred coastal
sidecar has none, since the extent's centre is a native tile corner, so four natives straddle it); a tile
straddling the extent takes the **reference surface** — the authoritative overview chunk the view
passes (`loaded.chunk`, the exact native samples at 15.625 m) — exactly on the boundary line and,
lowered by the **1.5 m skirt**, for vertices strictly inside, written into positions and parent heights
alike so no LOD transition moves them; no cell without a corner outside the extent is triangulated,
so the surround ends on the boundary line and nothing of it lies under or over the authoritative
surface (an apron one cell deep, lowered by the skirt, was tried first: at grazing views within 300 m it
showed through wherever the native relief dips below the 15.625 m chord); and a **boundary wall**
(`LANDSCAPE_SURROUND.boundaryWallMeters`, 4.5 m, deeper than the native relief between samples) hangs
from the boundary vertices as a quad per boundary edge in both windings, so a grazing ray from inside
that passes under the surround's edge meets the wall, never the backdrop, while below the authoritative
surface the wall is never seen. The wall's bytes are admitted through `estimateLandscapeMeshExclusionBytes`
(a copy and an edge per vertex of the ring a tile can hold) on top of the tile estimate. Its tiles also
draw behind coincident authoritative ones (`depthBehind`: render order 1, `LessDepth`, one polygon-offset unit).
The only remaining seam error is the native relief between the shared samples along the boundary: where
the authoritative rises above the chord its own LOD skirt faces the surround as a wall of that height,
where it dips below, the surround's edge stands that much above it (measured in the D5 record: max 3.4 m
at the north coast crossing, p95 ≤ 0.7 m on every edge; sub-pixel beyond about 1 km, visible as a scalloped
colour boundary when looking along the edge from within 300 m). Picking restores an excluded tile to its
displayed heights (`exclusionHeights`), not to the replaced source samples.

**Water.** `createLandscapeWaterReference({bounds})` / `setBounds` size the sea plane: the surround bounds
while a surround is active (`snapshot().water.extent === 'surround'`), the landscape bounds otherwise.
The plane keeps every authoritative rule (never picked, never queried, never converts seabed to sea).

**AI 597 interface.** The animated ocean must cover every surround sample below sea level out to the
surround bounds and must not intersect surround land; the surround's seabed continues the Dean/shelf
profile from v3's −30 m shelf floor inside the extent to a −60 m floor outside it (the two differ by at
most 4.5 m at the boundary, blended over 30 m); the water reference's extent is the surround's bounds; and the sidecar's
`surround` block tells the ocean which landscape revision it continues (a stale block means the ocean's
far field is stale too).

## Verification

AI 596 D5: `tests/node/unit/landscape_surround.test.js` covers the binding and staleness rules, the sidecar address, the water extent, the
mesh exclusion (reference surface, skirt, dropped cells, picking restore, admission bound), the surround ledger (kind, share denials,
release to zero) and the budget accounting; `tests/headless/e2e/landscape_surround.pwtest.js` runs the surround on coastal v3 (served by the
suite on port 8002): binding, no excluded tile resident, straddling tiles with the skirt, water extent, surround bytes under their kind
and share, picking never reaching it, off/on/stale/absent switches and disposal to zero. The cost receipts are in `LANDSCAPE_PERFORMANCE.md`.

`tests/node/unit/landscape_streaming.test.js` exercises fixed-position perspective
and orthographic zoom, viewport and altitude changes, frustum exit, hysteresis,
balanced coverage, unsupported hierarchies, invalid inputs, transient budget
refusal, independent query/shadow/collision leases and repeated release cycles.
Browser integration additionally verifies actual requests, uploads, atomic
transitions, inspected geometry, source reload and teardown. Generated receipts
and captures belong in `tests/artifacts/screens/landscape/ai576/d3/`.

The D3 browser gate uses a 1920×1080 viewport on the real coastal dataset. Its numbers below are historical measurements under the former 128/64 MiB default. It
exercises a close view, LOD/boundary inspection, combined wireframe, fixed-position
perspective FOV change, orthographic zoom, two repeated full routes and teardown.
Its historical geometry-only controlled-buffer observations are:

| Observation | Bytes / result |
| --- | ---: |
| Root-only resident CPU buffers | 6,260,782 |
| Root-only estimated GPU buffers | 3,676,703 |
| Peak CPU reservations, including transitions and inspection | 106,749,666 |
| Peak estimated GPU reservations | 66,475,566 |
| Largest upload in one frame | 6,326,831 |
| Shaded close-view leaves | 16 |
| Combined-wire close-view leaves under the same budget | 7, explicit GPU-budget degradation |
| Return after each repeated route | Exact root CPU/GPU counts and one terrain geometry |

The constrained profile uses CPU 16 MiB / GPU 8 MiB. It retains root coverage,
reports unmet detail, and still admits bounded source-only consumers. A one-byte
GPU profile rejects minimum coverage and leaves no reservation. Separate browser
regressions hold/release a native query during a camera refinement, deny a sibling
group while it shares a source lease, and cancel/rejoin a leased in-flight build.
They verify camera ownership, rollback to source-only costs and one worker dispatch
per pending tile. These are resource-lifecycle gates; D7 supplies the controlled
frame-time and cold/warm performance comparison.
