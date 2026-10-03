# Persistent landscape authoring

AI576 D2 adds exact bounded queries, saved data-operation batches, and last-batch
revert to the canonical landscape. This tool edits retained source revisions; it
does not import the original coastal ZIP, run Blender, create a city, or implement
the later movement/zoom streamer. Source preparation continues through the
registered `landscape/coastal-import` bake leaf.

The default directory is `assets/public/landscape/coastal-city`. Pass
`--directory <directory>` to operate on a separately saved landscape. Tests always
use isolated directories under `tests/artifacts/screens/landscape/ai576/d2/`.

## Query, change, reload, revert

First read the current source revision:

```sh
node tools/landscape_authoring/run.mjs state
```

Copy that exact `revision` into the query. The example selects an 80-meter circle
around a real native chunk intersection in the coastal low city. It acquires four
native chunks and returns exact terrain/soil context:

```sh
node tools/landscape_authoring/run.mjs query --x 2000 --z 2000 --radius 80 --selection-id low-city-patch --expected-revision <current-revision> --output tests/artifacts/screens/landscape/ai576/d2/selection.json
```

Use a fresh batch ID when binding the saved template to that context:

```sh
node tools/landscape_authoring/run.mjs bind --template tools/landscape_authoring/examples/raise_and_sand.template.json --context tests/artifacts/screens/landscape/ai576/d2/selection.json --batch-id low-city-raise-sand-001 --output tests/artifacts/screens/landscape/ai576/d2/batch.json
node tools/landscape_authoring/run.mjs apply --batch tests/artifacts/screens/landscape/ai576/d2/batch.json
```

The template raises the selected terrain by 2 meters, tapering within the inner
5 meters of its boundary, then assigns semantic sand throughout that same region.
It copies the selection's landscape ID, source revision and explicit region;
operation IDs are prefixed with the supplied batch ID. It refuses provisional
contexts and point contexts without an area. The resulting ordinary JSON batch
is reviewable and can be saved or passed to the local authoring API. `bind` does
not edit terrain. A context that becomes stale after binding still fails when
the batch is applied.

Reload the Fabrication viewer to display the saved revision; its camera remains
viewer state. Query again with the new revision to obtain fresh exact context.
Revert only the most recent applied batch, using the current revision printed by
`apply` or `state`:

```sh
node tools/landscape_authoring/run.mjs revert --expected-revision <edited-revision> --batch-id low-city-raise-sand-001
```

Revert publishes another revision. Previously exported selections become stale,
and the accepted batch ID remains recorded, so the same ID cannot be replayed
after revert. Further work uses a newly queried revision and a new batch ID.
The initial original source and every saved payload/snapshot remain retained.

## Data-operation contract

An ordinary batch has this shape; values here are illustrative and must be bound
to the actual selected source revision before applying:

```json
{
  "format": "landscape-edit-batch",
  "schemaVersion": 1,
  "id": "flatten-patch-002",
  "landscapeId": "coastal-city",
  "expectedRevision": "<current-revision>",
  "operations": [
    {
      "id": "flatten-patch-002/flatten",
      "type": "set-height",
      "region": { "type": "rectangle", "minX": 2010, "maxX": 2050, "minZ": 2010, "maxZ": 2050 },
      "falloff": { "type": "linear", "distance": 5 },
      "heightMeters": 18
    }
  ]
}
```

Supported operations are `raise` with signed `deltaMeters` (negative lowers),
`set-height` with `heightMeters` (zero is valid), and `assign-soil` with a catalog
`soilId`. Every operation declares a circle or rectangle in world meters and
`falloff: {type: "none"}` or an inward linear transition with positive `distance`.
Soil assignments require `none`; their region boundary is hard and deterministic.
Height operations evaluate in array order on the result of earlier operations;
later saved batches evaluate on the current saved samples. Last matching soil
assignment wins. Cover IDs remain unchanged, including planning road/runway IDs.

The domain API in `src/app/landscape/index.js` owns validation, region planning,
sampling, soil precedence and numeric edits. The store only handles local file
I/O, identities and publication. No edit relies on mesh indices, camera LOD,
filtered source imagery, or ad-hoc source-code patches.

## Store API and admission

`LandscapeAuthoringStore.mjs` exports
`createLandscapeAuthoringStore({directory})`, returning a frozen interface:

| Method | Result and contract |
| --- | --- |
| `readState()` | `{landscapeId,revision,lastBatchId,canRevert,budgets}` from the current validated manifest. |
| `query({x,z,selectionId,expectedRevision,radius?,camera?,signal?})` | Exact versioned selection context; `provisional:false`, `editingReady:true`, authoritative sample and acquisition diagnostics. |
| `select(options)` | Alias of `query`. |
| `apply(batch)` | `{status:"applied",landscapeId,batchId,beforeRevision,revision,summary,canRevert:true}` after atomic publication. |
| `revert({expectedRevision,batchId?})` | `{status:"reverted",landscapeId,revertedBatchId,beforeRevision,revision,canRevert:false}` after restoring the last batch's source state under a new revision. |

Methods return promises. The UI owns pending-request presentation. A failed,
outside, stale, corrupt or over-budget request rejects with a diagnostic; it
never supplies an invented zero height or an approximate sample as exact data.
Selection acquisition reports native chunk IDs/revisions, decoded bytes, native
spacing and `releasedAfterQuery:true`; leases/arrays are released before the
context returns. If the manifest changes during a query, its result is rejected.

Admission happens before native I/O: at most **four native chunks** across the
entire query or batch, with inclusive boundaries so all shared sample copies are
included. A point alone chooses the deterministic owning chunk. A circle must
stay completely inside the landscape. The query decoded budget is **2 MiB**;
four coastal chunks use **1,320,980 bytes**. Height editing additionally acquires
one bounded root and copies affected height arrays. The domain admits its encoded,
decoded, copied and scratch-buffer estimate against **8 MiB**, and reports
`summary.workingBytes`; this is a buffer estimate, not measured process RSS.

The store admits one native query/edit/revert working set at a time. Concurrent
requests receive `Working-set budget busy` without entering an unbounded queue;
the caller can cancel/retry using fresh state. `readState` reads only metadata.
Separate authoring processes are protected by the directory mutation lock, while
each process owns its own bounded request working set. No long-lived native-array
cache is retained by this D2 store.

Current manifests and saved manifest snapshots each have a **1 MiB** file limit.
Batch/template/context CLI inputs have a **64 KiB** limit. Channel files must fit
their exact declared byte lengths before decoding, and hashes/ranges/classes are
checked. Lock files have a separate 512-byte bound. File reads use a fixed admitted
buffer and detect size changes; a small declaration cannot cause an unlimited
read. The manifest limit is independent from the batch/context limit.

## Persistence and failure behavior

Changed height channels use `payloads/<sha256>.f32le`. Unchanged channel URLs,
native IDs, cover bytes, planning references and unrelated chunks remain intact.
The derived overview copies changed native vertices at its existing stride,
updates the source envelope and receives a conservative error bound; a tiny edit
between overview vertices can remain visually unresolved while exact native
queries correctly report it. Soil overrides are authoritative semantic regions;
they do not replace the original land-cover raster.

The store writes immutable `manifest.<sha256>.json` snapshots beside
`manifest.json`, so their relative resource URLs stay valid. The published
manifest's `terrain-editing-v1` capability and `editHistory` record accepted batch
IDs, the last batch, and its previous snapshot. There is no separate mutable
journal that could disagree with the current terrain after a crash.

Each mutation takes the directory's exclusive `authoring.lock`, validates the
complete batch and bounded inputs, writes immutable replacement payloads and
snapshots, checks that current manifest bytes have not changed, then atomically
replaces `manifest.json` last. Temporary files are flushed and renamed on the same
filesystem. Any failure before that switch leaves the prior current revision
active; unreferenced completed payloads/snapshots may remain and are not loaded by
the viewer. D2 keeps saved versions rather than deleting history during edits.

Revert authenticates the snapshot filename/hash and the changed payloads it will
restore before publishing. It restores terrain, cover references and semantic
operations from that snapshot while keeping the union of accepted batch IDs.
It is a one-level last-batch revert, independent of Git; after reverting, another
revert is unavailable until a new batch is applied. Invalid/stale/duplicate
requests never consume an ID or modify the current revision.

The lock refuses a live process owner. A known dead owner can be recovered under
an exclusive recovery guard, preserving an interrupted-owner note. An incomplete
or malformed lock fails with an explicit recovery diagnostic. Temporary `.partial`
files and lock/recovery notes are operational artifacts; immutable manifests and
payloads are saved landscape data. CLI `--output` cannot overwrite managed source
manifests or payload/reference trees.

The local server integrates these methods through
`tools/landscape_server/AuthoringApi.mjs`; it does not implement another editing
engine. See the domain model and Fabrication viewer specs for source/viewer
ownership and reload behavior. Smoothing, grading, polygons, oversized bounded
work, intermediate LOD rebuilding and streaming remain later AI576 deliverables.

## Verification

Select `tests/node/unit/landscape_authoring_store.test.js` or
`tests/node/unit/landscape_authoring_cli.test.js` in `tests/.selected_test` and run
`node tools/run_selected_test/run.mjs`. Tests use synthetic saved files in the D2
artifact directory; they never edit the canonical coastal source. They cover
exact boundary-spanning context, pre-I/O budget refusal, concurrent admission,
saved cross-border height/soil operations, reopen, immutable inputs, atomic
failure, authenticated revert, replay rejection after revert, lock ownership and
the public CLI/template workflow. The root integration test separately performs
the complete real coastal viewer/API workflow.
