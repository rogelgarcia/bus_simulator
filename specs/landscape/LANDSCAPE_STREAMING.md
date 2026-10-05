# Landscape streaming

This contract adds D3 hierarchy selection and bounded residency to the landscape
model. Elevation and semantic source data remain authoritative on disk. A render
partition is a temporary view of that data, never a saved terrain edit.

## Prepared hierarchy

`chunk-hierarchy-v1` declares a complete quadtree with direct parent identities.
The coastal dataset contains 85 nodes: 1 overview, 4 level-1 tiles, 16 level-2
tiles and 64 native tiles. Every tile has 257 by 257 samples. The native spacing
is 1.953125 meters; coarser levels select aligned native samples without changing
their float32 bits or categorical class IDs.

The registered `landscape/hierarchy` bake leaf reads the current canonical native
payloads, including saved edits. It preserves the retained ZIP, soil overrides,
operation history and reference data. It validates immutable output payloads and
publishes a manifest switch last. It does not reimport the ZIP over authored work.
Its measured geometric error is the maximum absolute elevation difference from
the declared NW-SE triangulation over descendant native vertices. Native nodes
have zero source error. Edits rebuild every affected ancestor and conservatively
increase its error bound until the hierarchy is measured again.

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
| Controlled terrain CPU buffers and reservations | 512 MiB (128 MiB before AI577 D2, 384 MiB in D2–D3) |
| Estimated terrain GPU buffers and reservations | 256 MiB (64 MiB before AI577 D2, 192 MiB in D2–D3) |
| Concurrent geometry fetch/decode/mesh workers | 2 |
| Concurrent independent appearance worker | 1 |
| Concurrent surface-detail generation workers (AI577 D2) | 2 |
| Tile uploads per animation frame | 1 |
| Upload bytes per animation frame | 8 MiB |
| Terrain-field array and decodes (AI577 D5) | own ceiling of 1/8 of each total (64 MiB CPU / 32 MiB GPU shipped), inside the shared limit |
| With the runtime surface cache on (AI577 D6, `LANDSCAPE_SURFACE_CACHE_BUDGETS`) | 512 MiB CPU / 448 MiB GPU; the cache atlases take at most min(3/8 of the GPU limit, GPU limit − 256 MiB), so the streams keep the 256 MiB of the uncached profile |
| Geometric screen error goal | 1.5 pixels |

URL budgets may not exceed the profile of the selected mode (surface cache off: 512/256 MiB; on: 512/448 MiB).

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

## Verification

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
