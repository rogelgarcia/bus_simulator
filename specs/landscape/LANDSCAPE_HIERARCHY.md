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

A deeper tree (AI 596 D3: 4097² = maxLevel 4 with 341 nodes, 8193² = maxLevel 5
with 1365 nodes) keeps that per-tile memory and grows only the sequential I/O:
every derived node reads each descendant native twice (the aligned copy, then the
exact error), `4^L + 2·L·4^L` reads over a depth-L tree — 448 at maxLevel 3,
2,304 at 4 and 11,264 at 5 (measured on 4-interval fixtures,
`tests/artifacts/screens/landscape/ai596/d3/limits/sidecar-limits.json`).

Since AI 596 D4 the production tree is coastal terrain v3 (`coastal-city-v3`,
4097² at 0.9765625 m, the landscape the city spec pins): maxLevel 4, 341 nodes
(1 + 4 + 16 + 64 + 256), 250 m natives, prepared by the synthesis writer through
the same `prepareLandscapeHierarchy` (`measured-native-vertices`; 6.2 s inside
the landscape write of the receipt
`tests/artifacts/screens/landscape/ai596/d4/v3/coastal-v3.md`). The registered
`landscape/hierarchy` leaf re-measures it after edits exactly as it does the
85-node v2 tree, which stays the default directory. The v3 edit gate
(`d4/editing/edit-gate.md`) rebuilt 5 ancestors at depth 4 for 4 changed natives
in 2.87 s with conservative errors and reverted them bit for bit in 2.44 s. The
render-only surround beside v3 (`surround/manifest.json`, `LANDSCAPE_STREAMING.md`
"Far-field surround") is a separate complete tree of the same contract: 2049² at
15.625 m over 32 km, maxLevel 3, 85 nodes, 4 km natives, written by the same
preparation with measured errors (L0 101.3 m, L1 102.4 m, L2 97.2 m: its massifs
sampled at 125 / 62.5 / 31.25 m strides, `d5/surround/surround.md`); it is never
edited, so its ancestors never carry the conservative policy, and it is never a
source for picking or queries.

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

The legacy D2 bounded kernel keeps its four-native-chunk, 2 MiB native-input and
8 MiB edit-working limits. The D5 authoring store uses streamed native/halo work
units under the same 8 MiB edit ceiling and admits larger footprints. Both paths
update every ancestor grid aligned with changed native vertices. D5 rebuilds
one ancestor at a time, bottom-up, by reading its immediate children sequentially;
each child is already persisted before its parent consumes it. Ancestor envelopes
come from the children's native envelopes, and errors use the safe bound:

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
consistent native/ancestor state after authenticating the complete restored
payload graph with a bounded two-chunk validation pass.

The legacy bounded kernel's estimate includes retained native inputs, native
height copies, all resulting ancestor arrays, ancestor scratch, and three
height channels for I/O/encoding/hash staging. Its central coastal four-tile
intersection includes nine ancestors and uses 6,406,753 bytes; a deeper tree
can exceed that legacy estimate. The D5 streamed path retains one ancestor
output and source plus one child, stages the finished output immediately, and
keeps only immutable descriptors between ancestors. It never retains a whole
ancestor list as decoded arrays. Its working cap is independent of how many
native chunks or ancestors are affected; larger regions increase sequential
I/O. See `LANDSCAPE_STREAMED_EDITING.md` for exact buffer admission and callback
ownership. Final candidate validation runs separately, so its peak combines by
maximum rather than by summing buffers from completed phases.

Focused tests are `landscape_hierarchy.test.js`, the earlier authoring/editing
suites and the importer source-authentication regression. Runtime planning and
residency are specified separately in `LANDSCAPE_STREAMING.md`.
