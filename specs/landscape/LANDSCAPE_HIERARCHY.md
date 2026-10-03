# Landscape hierarchy preparation and editing

Schema 1 capability `chunk-hierarchy-v1` requires a complete quadtree. Level L
contains exactly `4^L` spatial keys; every non-root node names its direct level
L−1 parent. The coast has 85 nodes across levels 0–3. All tiles retain the same
257×257 payload shape; native IDs and source payloads remain unchanged.

`hierarchy.algorithm` is `native-hierarchy-v1`. Its `errorPolicy` is either
`measured-native-vertices` after offline preparation, or
`conservative-after-edit` after a height edit. Base D1/D2 documents with only
root/native nodes remain supported without this capability. A partial hierarchy
cannot claim the complete-tree capability.

## Current native source and tight errors

The explicit registered `landscape/hierarchy` bake leaf reads the currently
published manifest, not the original ZIP. It verifies native channel hashes,
finite heights, class IDs, exact native min/max envelopes and all shared borders.
At every coarser level it selects aligned native samples with no averaging or
rescaling, preserving float32 bits and categorical IDs. Derived node envelopes
cover all descendant native descriptor envelopes.

For each derived node, the maximum absolute vertical difference is evaluated
between native heights and the node's declared NW-SE triangulation at every
descendant native vertex. Nested aligned NW-SE grids have a common fine-triangle
partition, on which their difference is linear; its extrema occur at native
vertices. Thus this maximum also bounds the continuous triangle surfaces.
Native nodes have geometric error zero. A derived tile's measured error need not
be monotonic relative to its parent, so consumers use each descriptor's error.

Preparation holds one native chunk at a time and fixed arrays for one derived
tile. The admitted scratch/channel estimate is `sampleCount * 24` bytes, capped
at 4 MiB; the coast uses 1,585,176 bytes. Repeated sequential native reads replace
a full source raster allocation. Metadata, file caches and runtime overhead are
outside this array estimate. Source reads and actual comparisons are recorded.

## Manifest-last publication

Preparation shares the authoring mutation lock and framework input-stability
gates. The candidate preserves native channel descriptors/revisions, terrain
values, semantic overrides, operations, accepted batch IDs, provenance and
references. New coarse channels are content addressed. Identical channel bytes
reuse the existing content revision; metadata changes still invalidate their
descriptor and manifest revisions. Direct parent links are the sole native
descriptor change during initial hierarchy preparation.

Before publication, current and upgraded previous-snapshot manifests are
validated; staged payloads are checked for hashes, sizes, ranges and classes.
Every installed payload is reauthenticated while copying. Immutable payloads and
saved manifests are installed before the atomic `manifest.json` switch. Failure
leaves the previous current revision active. Existing saved files are retained.
Repeated identical preparation produces the same manifest bytes and revision.

An existing last-batch pre-edit snapshot with only root/native nodes is prepared
as a complete tree in the same transaction. The current snapshot pointer then
addresses that upgraded immutable document. Its terrain, semantic operations
and accepted batch history are preserved, and the original snapshot is retained.
This makes last-batch revert preserve complete hierarchy capability even when
the batch predates D3. Revert still clears the last-batch pair and retains replay
tombstones, as documented in `LANDSCAPE_EDITING.md`.

## Bounded ancestor updates

Height edits keep the four-native-chunk, 2 MiB native-input and 8 MiB edit-working
limits. Before I/O, admission includes every potentially affected prepared
ancestor. Each changed native vertex updates every ancestor grid on which that
vertex is aligned. Ancestors are read sequentially and rebuilt bottom-up; no
unrelated native payload is fetched. Their envelopes are recomputed from native
descriptor envelopes, and errors use the safe bound:

```text
newError = oldError + maxAbsoluteNativeDelta + maxAbsoluteAncestorDelta
```

The triangle inequality bounds both native and coarse surface changes. The
native-delta bound may include other edited tiles, so it is conservative rather
than tight. A native edit between all coarse vertices still updates ancestor
error metadata. If an ancestor's height bytes did not change, its channel hash,
URL and content revision remain unchanged while its descriptor/manifest revision
changes. Unaffected ancestor descriptors and all category channels stay intact.
Soil-only batches require no height rebuild. The complete edited candidate is
validated and published under one manifest revision. Revert restores the saved
consistent native/ancestor state after authenticating the changed resources.

The working estimate includes retained native inputs, native height copies,
resulting ancestor height/category arrays, one ancestor input-height scratch
buffer and three largest height channels for bounded I/O/encoding/hash staging.
At the central coastal four-tile intersection this includes nine ancestors and
uses 6,406,753 bytes. Deeper trees may reject a small edit if ancestor working
buffers exceed the cap; they do not allocate an unbounded tree.

Focused tests are `landscape_hierarchy.test.js`, the earlier authoring/editing
suites and the importer source-authentication regression. Runtime planning and
residency are specified separately in `LANDSCAPE_STREAMING.md`.
