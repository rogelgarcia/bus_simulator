# Landscape editing and authoritative acquisition

D2 extends the schema-1 landscape without changing D1 source documents. It implements bounded native queries, raise/lower, flatten/set-height, hard soil assignment, ordered batches, immutable publication, and one-batch revert. Movement/zoom streaming remains D3; smoothing, polygons, and large-area work remain D5.

The public pure-domain entry is `src/app/landscape/index.js`. Persistence is owned by `tools/landscape_authoring/LandscapeAuthoringStore.mjs`; the local server and viewer adapt it without adding renderer dependencies to the domain. The focused suites are `tests/node/unit/landscape_editing.test.js` and `landscape_model.test.js`.

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

Circles require a positive radius; rectangles require finite bounds and positive area. Coordinates and lengths are world meters. A query region must fit completely inside the landscape; partially outside requests return `outside` without fetching or clamping. A point query acquires exactly one native chunk. At shared boundaries its owner is the east/south chunk, with the landscape's maximum edges owned by the last chunk. The selected native triangle and category are therefore independent of render LOD or current camera state.

Area acquisition includes every intersected native chunk, including shared-edge/corner duplicates. Circle intersection is geometric, not merely the enclosing rectangle. Queries and edit batches have a hard D2 maximum of four native chunks. `maxNativeChunks` may reduce that maximum, never raise it. Native decoded input has a separate default/hard ceiling of 2 MiB; callers can set a lower `maxDecodedBytes` and admission must honor it before I/O. One coastal native chunk is 330,245 bytes; a four-way selection is 1,320,980 bytes. A larger region is rejected with its required chunk count/bytes and a request to reduce the footprint. It does not silently fall back to approximate data.

`planLandscapeRegion(manifest,region,{maxNativeChunks?,maxDecodedBytes?})` returns `{status,region,bounds,chunkIds,decodedBytes}` without loading samples. It expects a validated manifest. `outside` carries an empty chunk list; malformed input or budget conflicts throw actionable errors.

`acquireLandscapeRegion(manifest,region,{readChunk,signal?,maxNativeChunks?,maxDecodedBytes?})` returns a Promise. While it is unresolved, the caller exposes `pending`; it must not present a previous/coarse value as an authoritative answer. The injected `readChunk(chunkId,{signal})` must read and authenticate the selected manifest's immutable channels. The runtime loader and authoring store verify channel hashes. Domain acquisition additionally validates native identity/revision, source windows/bounds, decoded lengths, height envelopes, known category IDs, and shared edges.

The resolved states are:

| State | Meaning |
| --- | --- |
| `ready` | Native coverage exists for the complete region. The returned handle provides `sample(x,z)`, `chunkIds`, `decodedBytes`, and idempotent `release()`. |
| `outside` | The region lies partly or wholly outside source bounds. No payload is read. |
| `unavailable` | A native request failed, was canceled, was corrupt, or had inconsistent seams. `reason` explains the failure; already-acquired arrays are released. |

`sample` on a ready handle returns the same native elevation/normal/slope/soil/cover contract as `sampleLandscapeChunk`. Sampling outside the acquired region is `unavailable`, not an unplanned fetch. After `release`, source-array references are cleared, `decodedBytes` is zero, `status` is `unavailable`, and further sampling returns `region-released`. D2 uses sequential reads; a reusable multi-consumer scheduler and queue admission arrive in D3. Each query/edit owns its bounded acquisition, and the persistence owner serializes mutations.

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

Point edits are rejected: every operation must contain an explicit circle or rectangle. Regions fit completely inside the landscape. The entire batch's union must fit the four-chunk and caller byte limits; many individually small but scattered operations cannot bypass admission.

| Type | Parameter and behavior |
| --- | --- |
| `raise` | Finite nonzero `deltaMeters`, absolute value at most 10,000. Positive raises and negative lowers. Each affected native vertex becomes `float32(old + deltaMeters * weight)`. |
| `set-height` | Finite `heightMeters` in ±100,000. Weight 1 assigns the exact float32 target; partial weight assigns `float32(old + (target-old)*weight)`. It explicitly flattens a hard region or blends into a target pad. |
| `assign-soil` | `soilId` must be in the soil catalog. Only `falloff:{type:none}` is accepted. It adds a hard semantic region assignment and never overwrites land-cover bytes. |

Every operation declares `falloff`. `none` gives weight 1 throughout its closed region, including the perimeter. `linear` declares a positive `distance` in meters, no greater than the circle radius or rectangle half-width/half-depth. Weight is `clamp(distanceInsideBoundary / falloff.distance,0,1)`, where inside distance is radius minus radial distance for a circle, or minimum distance to an edge for a rectangle. Thus the outer perimeter remains unchanged and the inner region reaches full strength. No radius or falloff is inferred from a camera/screenshot.

Operations are evaluated strictly in their array order. For height operations, each vertex is rounded to float32 after every operation; the next operation reads that result. Across batches, the next batch reads the previous published native channels. Chunk iteration order does not change values. Regions include shared boundary vertices in every owning payload, so adjacent chunks receive identical arithmetic and stored float32 results. The kernel rejects inconsistent input or output shared-edge heights/category IDs.

Height effects are baked into the published native channels. The operation log is provenance/audit data; loading must not replay it on already-edited heights. Revert restores the prior immutable source channels and authoring metadata. A future source regeneration workflow must deliberately merge/reapply edits onto the intended base rather than resetting or double-applying this log.

## Semantic soil

Edited manifests advertise the required `terrain-editing-v1` capability. Each successful operation is appended to `manifest.operations` as its complete validated operation plus `batchId` and contiguous global `sequence`. Soil operations also append exactly one `soil.overrides` entry:

```text
{id: operationId, batchId, sequence, soilId, region}
```

Overrides retain operation order. `resolveLandscapeSoil(manifest,x,z,landCoverId)` starts from the explicit initial cover mapping and chooses the last containing override. It validates only the point/class boundary; callers validate the manifest once, not once per mesh vertex. The source land-cover class, including road/runway/urban planning meaning, remains available and bit-identical. There is no blending or averaging of semantic soil IDs.

The renderer may call this pure resolver at resident vertices to update visible soil colors. A small hard region can still have an approximate visual boundary in D2's 15.625-meter coarse overview, while native semantic queries remain exact for that authored region. Appearance streaming and higher-resolution visual boundaries arrive in D3–D4. Changing a visual material never changes the override identity.

## Preparing and publishing a revision

`applyLandscapeEditBatch(manifest,batch,{readChunk,newRevision,signal?,maxNativeChunks?,maxDecodedBytes?})` validates the whole batch and reserves its bounded working arrays before dispatching any source read. It returns:

```text
{
  manifestDraft,
  changedChunks: [{descriptor,heights,landCover}],
  summary: {batchId,beforeRevision,revision,affectedBounds,channels,
            changedChunkIds,changedNativeIds,changedVertexOccurrences,
            maxNativeDelta,minHeight,maxHeight,acquiredNativeChunkIds,
            workingBytes,workingByteLimit,overviewErrorIsConservative}
}
```

This function has no filesystem/renderer side effects. Original manifests and source arrays remain unchanged. Only native height arrays whose values changed are returned, plus the covering root when any native height changed. All land-cover arrays/descriptors remain unchanged. Soil-only batches change manifest metadata without writing height or cover payloads. Unaffected native descriptors retain their IDs, revisions, URLs, and hashes. `changedVertexOccurrences` includes duplicated border occurrences; it is not a count of unique world vertices.

The draft is deliberately unpublished and incomplete: changed height channel references/hashes still refer to their old contents, and the previous snapshot pointer is not filled. The persistence owner must encode/hash/write immutable changed height payloads, replace those channel references with the new content revision, set `editHistory.previousManifestUrl`, validate the complete candidate and its payloads, save its immutable manifest, and atomically replace `manifest.json` last. Failure before the final switch leaves the last valid saved terrain active. Server/CLI locking prevents concurrent writers from interleaving batches. The viewer similarly retains its last valid displayed revision on reload failure.

The authoring record is:

```text
editHistory: {
  batchIds: [...all accepted and reverted batch IDs],
  lastBatchId: <last applied batch ID> | null,
  previousManifestUrl: <relative immutable snapshot path> | null
}
```

`lastBatchId` and `previousManifestUrl` must be present together. The snapshot is relative to the manifest and passes the same path restrictions as payload URLs. One-batch revert verifies the requested current revision, restores the saved pre-batch source/soil/operation state as a new current revision, retains the union of batch-ID tombstones, and clears both last-batch fields. This prevents a retried relative edit from being applied twice even after revert. Revert is an authoring operation backed by saved data; it does not use Git.

## Root rebuild, memory, and limitations

D2 accepts the prepared root/native hierarchy. For every changed native sample aligned with the root stride, the root is updated to that exact float32 value. Shared duplicate writes are identical. The root's native min/max envelope is recomputed from all native descriptor envelopes, without reading unrelated native chunks. Its safe vertical error becomes:

```text
newError <= oldError + maxAbsoluteNativeHeightChange + maxAbsoluteRootHeightChange
```

The stored value is this conservative upper bound, not a new measured tight error. It follows from the triangle inequality and the unchanged nested triangulations. Source sample changes bound the change of each native triangle, and root vertex changes bound the change of each root triangle. D3 may tighten errors during hierarchy preparation. Even when an edited patch misses all root vertices, its native-envelope/error metadata must change; the root is still a dependency of that edit.

The kernel reserves up to 8 MiB of tracked working buffers, covering loaded native height/cover arrays, copied edited heights, loaded/copied overview data, and a three-height-channel allowance for read/encode/hash staging. A four-chunk coastal height edit reserves 3,764,793 bytes under this formula. This is array/staging accounting, not a measurement of the entire Node/browser heap or filesystem cache. Metadata is separately bounded by batch/operation limits. No full-resolution source grid is assembled. Actual general streaming CPU/GPU/cache budgets, concurrent consumers, and transient accounting are D3 work.

Native inputs load sequentially; abort/failure prevents publication. Editing never evicts unsaved authoritative data because the pure kernel owns its temporary copies until persistence completes. D2 rejects manifests with intermediate prepared levels rather than leave stale ancestors; D3 must extend rebuilding to every affected ancestor before enabling such manifests. Large regions, smoothing halos, polygon operations, arbitrary streaming consumers, and bounded multi-pass edits are explicitly deferred to D3/D5.
