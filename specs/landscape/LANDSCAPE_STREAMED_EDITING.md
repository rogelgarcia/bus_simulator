# Bounded landscape editing

D5 extends schema version 1 with the required `terrain-editing-v2` capability.
It also retains `terrain-editing-v1`. Older readers reject this unknown required
capability instead of ignoring polygon geometry, named references, smoothing, or
grading. Existing D1–D4 documents remain valid. This contract is independent from
the renderer, camera, geometry LOD, and appearance residency.

The public domain entry point is `applyLandscapeEditBatchStreamed`, exported from
`src/app/landscape/index.js`. Persistence, CLI binding, atomic publication, and
last-batch revert are defined in [LANDSCAPE_EDITING.md](LANDSCAPE_EDITING.md).
The earlier `applyLandscapeEditBatch` retains its four-native-chunk limit and
explicitly rejects advanced operations with a pointer to the streamed API.
Exact interactive queries retain their separate four-chunk/2 MiB limit.

## Operation data

Batches keep the established format, schema version, stable batch/operation IDs,
landscape identity, expected revision, and ordered `operations` array. All
operations require explicit geometry or a named region reference, plus explicit
`falloff: {type:'none'}` or `{type:'linear',distance:<meters>}`. Linear weights rise
from zero on the region boundary to one at the declared inward distance. Hard
soil assignment still requires `falloff:none`.

An optional `regions` array creates records `{id,name,region}`. IDs, names and
geometry are immutable once published; a changed extent receives a new ID.
Names are nonempty strings of at most 120 characters. There are at most 256 named
regions. Operations may use `regionId` instead of inline `region`; validation
resolves and persists both the stable reference and explicit world geometry.
Supplying both is allowed only when their complete geometry matches. JSON key
order does not affect equality. Existing regions, operations and soil overrides
survive later batches and reproducible hierarchy/appearance preparation.

Polygons are `{type:'polygon',points:[{x,z},...]}` with 3–128 finite world-meter
vertices. The closing vertex is implicit. Clockwise and counterclockwise simple
polygons, including concave polygons, are supported. Crossing edges, overlapping
adjacent edges, repeated vertices, zero area, and holes are rejected. Boundaries
are included. Linear falloff uses distance to the nearest polygon edge. Chunk
intersection considers the shape, rather than including every tile in its box.
Persisted soil overrides are checked against the entire authored polygon, so a
different shape with the same bounding box is invalid.

Existing signed `raise`, `set-height`, and `assign-soil` parameters are unchanged.
Raise remains `float32(original + deltaMeters * weight)`. Each height operation
rounds its output once to float32 before the following operation reads it.

`smooth` adds `radiusMeters` and `strength`. Strength must be in `(0,1]`.
The rectangular box kernel has native half-widths
`floor(radiusMeters / spacingX)` and `floor(radiusMeters / spacingZ)`; each must
be 1–8 samples. Every value in that `(2*radiusX+1) × (2*radiusZ+1)` window has equal
weight. Source-extent edges repeat the clamped boundary sample. Samples outside
the edit region remain valid halo inputs; the region/falloff controls which
outputs change. First compute `target = original + (boxMean - original) * strength`
in float64, then `float32(original + (target - original) * weight)`; full weight
rounds the target directly. A smooth operation is one pass. Use
multiple ordered smooth operations for explicit repeated passes.

`grade` adds two points:

```json
{
  "start": {"x": 1200, "z": 2000, "heightMeters": 8},
  "end": {"x": 2800, "z": 2000, "heightMeters": 28}
}
```

Both endpoints must be distinct finite positions inside the landscape, and their
heights must be within ±100,000 meters. The target height is the linear blend
between those heights using the point's projection onto the endpoint segment.
Projection clamps to `[0,1]`, so points beyond either endpoint use its height.
The region remains the explicit affected area. Falloff blends the current
elevation toward that target. No road, pavement, or city placement is created.

## Immutable passes and staged callback API

```text
applyLandscapeEditBatchStreamed(manifest, batch, {
    readChunk(id, {descriptor, signal}),
    stageChunk({descriptor, heights, landCover}, progress),
    newRevision,
    signal?,
    maxWorkingBytes?,
    chunkOrder?: 'forward' | 'reverse'
}) -> {manifestDraft, summary}
```

The full batch and working-buffer admission validate before source I/O. For each
height operation, the domain freezes the input descriptor map, visits native
chunks sequentially, and writes replacements into a separate next-pass map.
Only after the entire operation finishes does that map become the next input.
`readChunk` must read the exact supplied immutable descriptor, including an
earlier operation's staged output; reading the current published manifest by
chunk ID alone is incorrect. Descriptor revision/content identity and decoded
values are checked on every read.

Each native unit acquires its height/cover halo through sequential chunk reads.
Duplicate native edge and corner samples must agree exactly. Smoothing sums each
horizontal kernel west-to-east, then the resulting row sums north-to-south in
float64. This fixed global neighborhood order avoids differences caused by
chunk-local prefix-sum rounding. Reversing chunk visitation produces identical
payloads and final metadata. Operations themselves retain their declared order.

`stageChunk` must encode/authenticate and persist immutable height bytes before
resolving a complete height-channel descriptor. It must not retain decoded
arrays after returning. Land cover is unchanged. Its progress object includes
`phase` (`native` or `ancestor`), `operationId` (null for ancestors), `completed`,
`total`, `workingBytes`, `workingByteLimit`, and optional `signal`.
The domain validates the returned channel shape before using it in a later pass.
No current-manifest publication occurs inside the domain or staging callback.

After the last operation, final native values are compared with the original
batch input, and all changed native borders/corners are revalidated. Intermediate
changes which cancel completely restore the original descriptors, hashes and
resource revisions. Staged files no longer referenced by the final candidate
are harmless immutable intermediate output; cleanup is a separate store concern.

Affected ancestors rebuild deepest-first, one node at a time, reading immediate
children sequentially. Their aligned samples exactly match the final native
source. Shared child samples are checked before accepting an ancestor. Elevation
envelopes include all children. Error bounds conservatively add the maximum
native batch delta and the ancestor's maximum sampled delta to the prior error.
Unchanged height channels remain reusable even if their bounds/error descriptor
must change. Unaffected nodes and all land-cover channels retain their identities.

The returned result contains metadata and impact information, never a batch of
decoded arrays. The store fills `editHistory.previousManifestUrl`, validates the
complete saved candidate and resource dependencies, then atomically switches the
current manifest. Failure/cancellation leaves the published revision intact.
There is no partial-pass visibility. Revert restores a complete saved hierarchy
under a fresh revision while retaining accepted batch IDs to reject replay.

## Buffer bounds and impact

The maximum domain working allowance is 8 MiB; callers may lower it. Admission
depends on chunk dimensions and kernel radius, not the selected footprint. A
work unit reserves height and cover halo arrays, separate retained target cover,
float64 horizontal kernel sums, output height, current source decode, and three
height-channel buffers for callback encoding, hashing, or existing-file checks.
Ancestor/final validation phases reserve two source chunks plus output/coverage
scratch and callback staging. At most two complete decoded chunks are held by
the domain at a time. I/O is sequential.

For a 257×257 coastal chunk, a four-sample halo reserves **2,349,043 bytes**.
The maximum eight-sample halo reserves **2,387,011 bytes**. Sixteen and sixty-four
affected chunks have the same reservation with otherwise identical inputs.
These are conservative tracked-array bounds, not total process RSS/heap.
Manifest/descriptor indexes are metadata; the file store separately enforces its
1 MiB manifest limit. Scratch disk/I/O and total work grow with the footprint and
number of operations; decoded terrain residency does not.

The summary reports batch/input/output revision, requested `affectedBounds`,
actual `changedSampleBounds`, terrain `channels` (`height` and/or `soil`), named
`regionIds`, changed native/ancestor/chunk IDs, and current terrain min/max.
`heightDeltaRange:{min,max}` is the signed minimum/maximum change from the batch
input over changed sample occurrences. `changedHeightRange` gives
`{before:{min,max},after:{min,max}}` over those same changed samples. Both are null
if the batch has no net height change. Shared sample occurrences may be counted
in both owning native chunks; that count is explicitly named
`changedVertexOccurrences`. Read counts, acquired native IDs, halo reads, work
units, working-buffer breakdown and byte limit support budget diagnostics.

Focused tests live in `tests/node/unit/landscape_streamed_editing.test.js`.
They cover concavity and invalid polygons, immutable named references, grading,
falloff, snapshot smoothing across native borders, source-edge clamping, repeated
passes, reversed visitation, complete ancestor rebuilding, net-zero preservation,
16/64-chunk reservations, maximum-size pages/halos, pre-I/O validation, stale
readers, corrupted halos, failed staging, and cancellation. The original model
and bounded D2 editor remain regression-tested independently.
