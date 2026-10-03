# Landscape editing and authoritative acquisition

D2 extends the schema-1 landscape with bounded native queries, raise/lower, flatten/set-height, hard soil assignment, ordered batches, immutable publication, and one-batch revert. D3 rebuilds every affected prepared ancestor. D5 adds named polygons, grading, smoothing, and large-area streamed edits under `terrain-editing-v2`, while retaining base and D2 document compatibility.

The public pure-domain entry is `src/app/landscape/index.js`. Persistence is owned by `tools/landscape_authoring/LandscapeAuthoringStore.mjs`; the local server and viewer adapt it without adding renderer dependencies to the domain. The full streaming callback, smoothing, and buffer contract is in [LANDSCAPE_STREAMED_EDITING.md](LANDSCAPE_STREAMED_EDITING.md); CLI and transaction behavior is in the [authoring README](../../tools/landscape_authoring/README.md).

## Authoritative region acquisition

World regions are plain data:

```json
{"type":"point","x":2000,"z":2000}
```

```json
{"type":"circle","center":{"x":2000,"z":2000},"radius":80}
```

```json
{"type":"rectangle","minX":1920,"maxX":2080,"minZ":1920,"maxZ":2080}
```

Circles require a positive radius; rectangles require finite bounds and positive area. D5 also accepts simple polygons as `{type:"polygon",points:[{x,z},...]}` with 3–128 vertices, no repeated closing vertex, crossings, overlapping edges, or holes. Either winding is valid. Coordinates and lengths are world meters. A query region must fit completely inside the landscape; partially outside requests return `outside` without fetching or clamping. A point query acquires exactly one native chunk. At shared boundaries its owner is the east/south chunk, with the landscape's maximum edges owned by the last chunk. The selected native triangle and category are therefore independent of render LOD or current camera state.

Area acquisition includes every intersected native chunk, including shared-edge/corner duplicates. Circle and polygon intersection are geometric, not merely enclosing rectangles. Exact acquisition retains a maximum of four native chunks. `maxNativeChunks` may reduce that maximum, never raise it. Native decoded input has a separate default/hard ceiling of 2 MiB; callers can set a lower `maxDecodedBytes` and admission must honor it before I/O. One coastal native chunk is 330,245 bytes; a four-way selection is 1,320,980 bytes. A larger query fails rather than falling back to approximate data. D5 mutation uses the separate bounded streaming contract and can cover more than four chunks.

`planLandscapeRegion(manifest,region,{maxNativeChunks?,maxDecodedBytes?})` returns `{status,region,bounds,chunkIds,decodedBytes}` without loading samples. It expects a validated manifest. `outside` carries an empty chunk list; malformed input or budget conflicts throw actionable errors.

`acquireLandscapeRegion(manifest,region,{readChunk,signal?,maxNativeChunks?,maxDecodedBytes?})` returns a Promise. While it is unresolved, the caller exposes `pending`; it must not present a previous/coarse value as an authoritative answer. The injected `readChunk(chunkId,{signal})` must read and authenticate the selected manifest's immutable channels. The runtime loader and authoring store verify channel hashes. Domain acquisition additionally validates native identity/revision, source windows/bounds, decoded lengths, height envelopes, known category IDs, and shared edges.

The resolved states are:

| State | Meaning |
| --- | --- |
| `ready` | Native coverage exists for the complete region. The returned handle provides `sample(x,z)`, `chunkIds`, `decodedBytes`, and idempotent `release()`. |
| `outside` | The region lies partly or wholly outside source bounds. No payload is read. |
| `unavailable` | A native request failed, was canceled, was corrupt, or had inconsistent seams. `reason` explains the failure; already-acquired arrays are released. |

`sample` on a ready handle returns the same native elevation/normal/slope/soil/cover contract as `sampleLandscapeChunk`. Sampling outside the acquired region is `unavailable`, not an unplanned fetch. After `release`, source-array references are cleared, `decodedBytes` is zero, `status` is `unavailable`, and further sampling returns `region-released`. The Node store uses sequential reads; runtime queries use D3 shared source leases and admission. Each caller owns its bounded acquisition, and the persistence owner serializes mutations.

`queryLandscapeSelection(manifest,{x,z,selectionId,radius?,expectedRevision,camera?},options)` is the point/circle handoff convenience function. Radius omitted or zero selects a point. It rejects a stale revision before I/O, acquires native coverage, samples the center, builds plain context, and releases the handle in `finally`. Successful context has `provisional:false`, `editingReady:true`, and `sample.accuracy:authoritative`; `acquisition` records native chunk IDs/revisions, source revision, decoded bytes, native spacing, and `releasedAfterQuery:true`. Camera context is optional, supplementary plain data.

The viewer can keep the coarse terrain visible while this request is pending, but its readout must say that the exact context is resolving. A failed request must be visible and must not convert the provisional point into exact context. Reload regenerates context against the new source revision while retaining camera state. The selection document is not terrain authority or an instruction to change it.

## Batch format and operations

The following is a valid example against the original retained coastal revision. After any publication/revert, use the current selection's `sourceRevision` as `expectedRevision` and choose a new batch ID:

```json
{
  "format": "landscape-edit-batch",
  "schemaVersion": 1,
  "id": "coastal-raise-sand-001",
  "landscapeId": "coastal-city",
  "expectedRevision": "coastal-v1-21702aab6210e2b5",
  "operations": [
    {
      "id": "beach-raise-001",
      "type": "raise",
      "region": {"type":"circle","center":{"x":2000,"z":2000},"radius":80},
      "falloff": {"type":"linear","distance":30},
      "deltaMeters": 2
    },
    {
      "id": "beach-sand-001",
      "type": "assign-soil",
      "region": {"type":"circle","center":{"x":2000,"z":2000},"radius":80},
      "falloff": {"type":"none"},
      "soilId": "sand"
    }
  ]
}
```

`validateLandscapeEditBatch(manifest,input)` copies, validates, and freezes a batch. IDs obey the manifest stable-ID rules. A batch requires 1–64 uniquely identified operations and must target the current landscape/revision. Duplicate batch IDs are checked before the stale-revision check, including tombstoned reverted batches. Operation IDs cannot repeat in the currently authored operation log or within the new batch. D2 caps operation records and batch-history IDs at 1,024 each; reaching the limit requires explicit future history compaction, not silent deletion.

Point edits are rejected: every operation must contain an explicit circle, rectangle, or polygon, or reference a named region. Regions fit completely inside the landscape. D5 streamed batches may cover the whole landscape; their chunk/halo/staging buffers must fit the 8 MiB working cap before source I/O. Region area changes the number of sequential work units, not the retained working set. The legacy D2 in-memory API keeps its four-chunk union limit.

`batch.regions` optionally adds `{id,name,region}` records to `manifest.regions`, with at most 256 named regions and names of 1–120 characters. IDs, names, and shapes are immutable; an operation reuses a saved `regionId` without adding the same record again. Changed extents require a new ID. Validation resolves `regionId` into world-space `operation.region` and retains both in the operation log. Supplying both requires full geometric equality, including polygon vertices; matching bounds alone is insufficient. Plain JSON round trips preserve the identity and geometry.

| Type | Parameter and behavior |
| --- | --- |
| `raise` | Finite nonzero `deltaMeters`, absolute value at most 10,000. Positive raises and negative lowers. Each affected native vertex becomes `float32(old + deltaMeters * weight)`. |
| `set-height` | Finite `heightMeters` in ±100,000. Weight 1 assigns the exact float32 target; partial weight assigns `float32(old + (target-old)*weight)`. It explicitly flattens a hard region or blends into a target pad. |
| `grade` | Explicit distinct `start` and `end` with world `x,z,heightMeters`. Heights are within ±100,000 and endpoints are inside the landscape. The target is linear elevation along the endpoint vector, clamped to its two end elevations, blended by region falloff. |
| `smooth` | Explicit `radiusMeters` and `strength` in `(0,1]`. Radius spans 1–8 native samples on each axis after flooring by axis spacing. One box-average pass reads a frozen operation-input snapshot and blends its mean by strength and region falloff; source-edge samples clamp/repeat. |
| `assign-soil` | `soilId` must be in the soil catalog. Only `falloff:{type:none}` is accepted. It adds a hard semantic region assignment and never overwrites land-cover bytes. |

Every operation declares `falloff`. `none` gives weight 1 throughout its closed region, including the perimeter. `linear` declares a positive `distance` in meters, no greater than the circle radius or half the smaller rectangular/polygon bounding span. Weight is `clamp(distanceInsideBoundary / falloff.distance,0,1)`: inside distance is radius minus radial distance for a circle, minimum edge distance for a rectangle, or shortest distance to any polygon segment. The perimeter remains unchanged. Narrow/concave polygon sections may never reach full strength. No radius or falloff is inferred from a camera/screenshot.

Operations are evaluated strictly in their array order. For height operations, each vertex is rounded to float32 after every operation; the next operation reads that result. Across batches, the next batch reads the previous published native channels. Chunk iteration order does not change values. Regions include shared boundary vertices in every owning payload, so adjacent chunks receive identical arithmetic and stored float32 results. The kernel rejects inconsistent input or output shared-edge heights/category IDs.

Height effects are baked into the published native channels. The operation log is provenance/audit data; loading must not replay it on already-edited heights. Revert restores the prior immutable source channels and authoring metadata. A future source regeneration workflow must deliberately merge/reapply edits onto the intended base rather than resetting or double-applying this log.

## Semantic soil

Edited manifests advertise `terrain-editing-v1`; D5 streamed publications additionally require `terrain-editing-v2`. Each successful operation is appended to `manifest.operations` as its complete validated operation plus `batchId` and contiguous global `sequence`. Soil operations also append exactly one `soil.overrides` entry:

```text
{id: operationId, batchId, sequence, soilId, region}
```

Overrides retain operation order. `resolveLandscapeSoil(manifest,x,z,landCoverId)` starts from the explicit initial cover mapping and chooses the last containing override. It validates only the point/class boundary; callers validate the manifest once, not once per mesh vertex. The source land-cover class, including road/runway/urban planning meaning, remains available and bit-identical. There is no blending or averaging of semantic soil IDs.

The D4 appearance worker rasterizes this resolver into independently streamed categorical masks, with revision-aware invalidation and nearest class sampling. Visual boundaries remain limited by the resident mask resolution; native semantic queries resolve the exact authored region. Changing a visual material never changes the override identity or source cover IDs.

## Preparing and publishing a revision

The store uses `applyLandscapeEditBatchStreamed(manifest,batch,{readChunk,stageChunk,newRevision,signal?,maxWorkingBytes?})`. It returns only `{manifestDraft,summary}`. Each `readChunk(id,{descriptor,signal})` must honor the exact immutable descriptor supplied, including intermediate outputs of earlier operations. Each awaited `stageChunk({descriptor,heights,landCover},progress)` persists height before resolving its authenticated channel descriptor and must not retain sample arrays. A whole batch is never returned as a list of resident chunks. The draft already references persisted channels; the store fills its previous snapshot pointer, validates all payloads/borders/parent samples, and publishes the current manifest last. Detailed algorithm and buffer accounting are specified in [LANDSCAPE_STREAMED_EDITING.md](LANDSCAPE_STREAMED_EDITING.md).

The impact summary includes requested bounds, actual changed sample bounds, affected channels, stable named region IDs, changed native/ancestor IDs, signed height delta range measured against batch input, and before/after changed height ranges. Height ranges are null when no final height changed. Intermediate changes canceled by later operations restore original native descriptors. `changedVertexOccurrences` includes duplicate shared-edge occurrences. The store adds stage counts/bytes and bounded final-validation diagnostics.

### Legacy bounded API

`applyLandscapeEditBatch(manifest,batch,{readChunk,newRevision,signal?,maxNativeChunks?,maxDecodedBytes?})` remains available for existing D2 callers. It supports only circle/rectangle raise, set-height, and soil operations within four native chunks, and refuses advanced operations with a direction to use the streamed API. It returns:

```text
{
  manifestDraft,
  changedChunks: [{descriptor,heights,landCover}],
  summary: {batchId,beforeRevision,revision,affectedBounds,channels,
            changedChunkIds,changedNativeIds,changedAncestorIds,changedVertexOccurrences,
            maxNativeDelta,minHeight,maxHeight,acquiredNativeChunkIds,
            workingBytes,workingByteLimit,overviewErrorIsConservative}
}
```

This function has no filesystem/renderer side effects. Original manifests and source arrays remain unchanged. Only native height arrays whose values changed are returned, plus every affected prepared ancestor when any native height changed. All land-cover arrays/descriptors remain unchanged. Soil-only batches change manifest metadata without writing height or cover payloads. Unaffected native and ancestor descriptors retain their IDs, revisions, URLs, hashes and errors. `changedVertexOccurrences` includes duplicated border occurrences; it is not a count of unique world vertices.

The draft is deliberately unpublished and incomplete: changed height channel references/hashes still refer to their old contents, and the previous snapshot pointer is not filled. The persistence owner must encode/hash/write immutable changed height payloads, replace those channel references with the new content revision, set `editHistory.previousManifestUrl`, validate the complete candidate and its payloads, save its immutable manifest, and atomically replace `manifest.json` last. Failure before the final switch leaves the last valid saved terrain active. Server/CLI locking prevents concurrent writers from interleaving batches. The viewer similarly retains its last valid displayed revision on reload failure.

### Transaction and saved history

The store retains each dirty unit until its immutable payload is written, flushed, and installed. Eviction never discards unpersisted authoritative data. During all staging and validation, readers continue using the prior current manifest. All outputs must finish and the complete candidate must validate before current bytes are checked and `manifest.json` is renamed last. An `AbortSignal` or awaited progress-callback error before that rename leaves current bytes/history unchanged and releases the mutation lock; completed unreferenced immutable files may remain. They are unreachable from current terrain and do not consume batch IDs. The rename is the commit point; a subsequent cancellation cannot undo a committed revision. The CLI handles SIGINT/SIGTERM through this same signal path.

The authoring record is:

```text
editHistory: {
  batchIds: [...all accepted and reverted batch IDs],
  lastBatchId: <last applied batch ID> | null,
  previousManifestUrl: <relative immutable snapshot path> | null
}
```

`lastBatchId` and `previousManifestUrl` must be present together. The snapshot is relative to the manifest and passes the same path restrictions as payload URLs. One-batch revert verifies the requested current revision and snapshot hash, authenticates every restored channel with the same bounded two-chunk validation pass, restores the saved pre-batch terrain/soil/named-region/operation state, retains batch-ID tombstones, and clears both last-batch fields. Revert has no four-chunk limit. Corrupt or missing old payloads and cancellation leave the edited current revision unchanged. This prevents a retried relative edit from being applied twice even after revert. Revert uses saved data, independent of Git.

## Ancestor rebuild, memory, and limitations

D3 accepts the complete prepared hierarchy while retaining base root/native compatibility. For every changed native sample aligned with an affected ancestor's stride, that ancestor is updated to the exact float32 value. Shared duplicate writes are identical. Each affected ancestor's native min/max envelope is recomputed from descendant native descriptor envelopes, without reading unrelated native chunks. Its safe vertical error becomes:

```text
newError = oldError + maxAbsoluteNativeHeightChange + maxAbsoluteAncestorHeightChange
```

The stored value is a conservative upper bound, not a new measured tight error. It follows from the triangle inequality and the unchanged nested triangulations. Source sample changes bound the change of each native triangle, and ancestor vertex changes bound the change of each coarse triangle. The registered `landscape/hierarchy` leaf tightens errors from current saved native channels. Even when an edited patch misses every coarse vertex, ancestor envelope/error metadata must change; those nodes remain dependencies of the edit. Identical channel bytes retain their previous channel hash, URL and content revision while descriptor/manifest revisions change.

The legacy bounded kernel retains its native inputs and resulting ancestor arrays, with a 6,406,753-byte estimate for the central coastal four-chunk edit. The D5 store instead uses fixed work units: a native chunk/halo and smoothing scratch, or one ancestor rebuilt from sequential child reads, plus bounded decode/encode/hash/existing-file staging. It reserves at most 8 MiB before I/O without retaining the whole ancestor list as arrays. Full candidate validation uses two decoded chunks at a time; sequential phase peaks are combined by maximum. This is array/staging accounting, not process heap or filesystem-cache measurement. Metadata is separately capped by 1 MiB manifests, 64 KiB batches, 1,024 operation/history records, and 256 named regions. No full-resolution source grid is assembled. Runtime CPU/GPU budgets remain in `LANDSCAPE_STREAMING.md`.

Hierarchy preparation reads current saved native channels and preserves named regions, operations, soil, accepted IDs, and last-batch revert. It can upgrade a pre-D3 saved snapshot while retaining its original. Coastal re-import refuses to replace a changed/authored current source; an explicit migration is required instead of silently resetting edits. See `LANDSCAPE_HIERARCHY.md` for preservation details. Focused coverage is in `landscape_streamed_editing.test.js`, `landscape_authoring_streamed_store.test.js`, the legacy editing/store suites, and the real coastal `landscape_large_editing.pwtest.js` workflow.
