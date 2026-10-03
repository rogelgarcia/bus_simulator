# Persistent landscape authoring

## Read-only planning reports

`node tools/landscape_authoring/run.mjs report --request <request.json> --output <report.json>`
surveys a footprint or corridor using one authenticated native chunk at a time.
The request pins `expectedRevision` and declares `sampleSpacingMeters`; it may
include resolved reservation/advisory shapes. Results distinguish ready, partial,
unknown and outside coverage, with sampled height/slope/soil/water statistics and
a terrain dependency record. See `specs/landscape/LANDSCAPE_PLANNING_REPORTS.md`
for the JSON contract, bounds, exact overlap semantics, and future consumer rules.
The saved `examples/coastal_corridor_report.json` runs against the supplied coastal
revision. After editing, replace its revision with the current `state` output.

## Persistent edits

The authoring CLI and store edit retained landscape revisions through plain JSON
operations. AI576 D5 adds named polygons, grading, smoothing, and large-area
batches while preserving D2 exact queries and last-batch revert. The store uses
the pure API from `src/app/landscape/index.js`; no edit depends on camera LOD,
mesh indices, filtered cover imagery, or runtime appearance settings.

The default directory is `assets/public/landscape/coastal-city`. Every command
accepts `--directory <directory>` for an isolated saved landscape. Source
preparation remains under the registered `landscape/coastal-import`,
`landscape/hierarchy`, and `landscape/appearance` bake leaves.

## Exact selection workflow

Read the current revision, acquire an explicit native region, and bind a fresh
batch ID to the returned context:

```sh
node tools/landscape_authoring/run.mjs state
node tools/landscape_authoring/run.mjs query --x 2000 --z 2000 --radius 80 --selection-id low-city-patch --expected-revision <current-revision> --output tests/artifacts/screens/landscape/ai576/d5/selection.json
node tools/landscape_authoring/run.mjs bind --template tools/landscape_authoring/examples/raise_and_sand.template.json --context tests/artifacts/screens/landscape/ai576/d5/selection.json --batch-id low-city-raise-sand-001 --output tests/artifacts/screens/landscape/ai576/d5/batch.json
node tools/landscape_authoring/run.mjs apply --batch tests/artifacts/screens/landscape/ai576/d5/batch.json
```

The template raises the selected region by 2 meters, tapers within the inner
5 meters of its boundary, then assigns semantic sand. Binding copies the exact
context's landscape/revision/region and prefixes operation IDs with the batch
ID. It refuses provisional and point-only contexts. `bind` saves reviewable
JSON without changing terrain; a stale batch still fails at apply time.

Exact queries retain a four-native-chunk and 2 MiB decoded-input limit. A coastal
four-way query acquires 1,320,980 decoded bytes. A larger query fails before I/O;
it never substitutes an approximate sample. Point ownership is deterministic
at shared borders. The resolved context releases arrays before returning.

## Large named-region workflow

Large operations carry explicit world-space geometry and bind to saved state;
they do not pretend the full region was acquired by a small selection query:

```sh
node tools/landscape_authoring/run.mjs state --output tests/artifacts/screens/landscape/ai576/d5/state.json
node tools/landscape_authoring/run.mjs bind --template tools/landscape_authoring/examples/grade_smooth_polygon.template.json --state tests/artifacts/screens/landscape/ai576/d5/state.json --batch-id coastal-grade-study-001 --output tests/artifacts/screens/landscape/ai576/d5/large-batch.json
node tools/landscape_authoring/run.mjs apply --batch tests/artifacts/screens/landscape/ai576/d5/large-batch.json
```

Review the example's explicit 1,200-meter polygon and target elevations before
applying. It grades between two world-space endpoints, smooths one snapshot
pass with an 8-meter radius and strength 0.6, then assigns sand. The named region
ID `coastal-interior-grade` remains stable; operation IDs use the fresh batch
prefix. Reuse an existing region with `regionId` and omit it from the next
batch's `regions` array. Names and shapes are immutable: changed extents require
a new region ID. State binding carries source identity only, with no
`editingReady` or native-acquisition claim.

Every batch requires `format:"landscape-edit-batch"`, `schemaVersion:1`, a new
`id`, the saved `landscapeId`, `expectedRevision`, and 1–64 ordered operations.
Operations are `raise`, `set-height`, `grade`, `smooth`, or `assign-soil`.
Regions are circles, rectangles, or simple 3–128-vertex polygons without holes,
fully inside the landscape. All coordinates, elevations, and distances are
world meters. Height operations support explicit hard or inward linear falloff;
soil assignment uses a hard boundary. Grade endpoints and smooth radius/strength
are mandatory. Source cover IDs, including roads/runways, remain unchanged.
See [editing semantics](../../specs/landscape/LANDSCAPE_EDITING.md) and the
[streamed algorithm contract](../../specs/landscape/LANDSCAPE_STREAMED_EDITING.md).

## Reload and revert

Reload Fabrication after publication to display the saved revision; camera
state is independent. Query again against that new revision for exact context.
Revert the entire latest batch, including every native and ancestor change,
soil overrides, named regions, and operation records:

```sh
node tools/landscape_authoring/run.mjs revert --expected-revision <edited-revision> --batch-id coastal-grade-study-001
```

Revert publishes a new revision and retains accepted batch-ID tombstones.
Previously exported selections become stale; the reverted batch ID cannot be
replayed. Another revert is unavailable until a new batch is applied. Revert
uses saved landscape data, independent of Git.

## Store API and admission

`createLandscapeAuthoringStore({directory,maxWorkingBytes?})` returns a frozen
interface. The optional edit working limit can reduce the default 8 MiB ceiling.

| Method | Contract |
| --- | --- |
| `readState()` | Current `landscapeId,revision,lastBatchId,canRevert,regions,budgets`; metadata only. |
| `query({x,z,selectionId,expectedRevision,radius?,camera?,signal?})` | Exact selection context, with native acquisition diagnostics and released source arrays. |
| `select(options)` | Alias of `query`. |
| `apply(batch,{signal?,onProgress?}?)` | Applied revision identity, impact `summary`, and `canRevert:true` after publication. |
| `revert({expectedRevision,batchId?,signal?,onProgress?})` | Restored revision identity, bounded validation summary, and `canRevert:false`. |

The store admits one query/edit/revert working set at a time. Overlap receives
`Working-set budget busy`, without an unbounded request queue. Separate
mutation processes share the directory's exclusive authoring lock. There is
no long-lived native-array cache.

Edits have no four-chunk footprint cap. Each operation streams a native chunk
and its bounded halo, persists its immutable output, then releases the unit.
The next operation reads a frozen map of those persisted descriptors. Ancestors
rebuild one at a time. Array/staging admission stays within 8 MiB independently
of region area; a bigger region increases I/O and elapsed work, not resident
chunk count. `summary.workingBytes` is a conservative buffer estimate, not process
RSS or filesystem cache. The final validation phase independently admits two
decoded chunks and decode scratch, checking every height/cover hash, native
envelope, same-level border, and aligned parent sample. The reported peak is the
maximum of these sequential phases.

Impact summaries include requested `affectedBounds`, actual
`changedSampleBounds`, `channels`, stable `regionIds`, native/ancestor IDs,
signed batch-net `heightDeltaRange`, before/after `changedHeightRange`,
duplicated `changedVertexOccurrences`, and I/O/working-set diagnostics.
Height ranges are null for no net height change. Staging counters distinguish
written units from unique newly installed content; intermediate outputs may
be reused or become unreferenced when later operations cancel their effect.

An optional awaited `onProgress` callback receives frozen metadata only:
`chunk-staged` (persisted URL/hash, phase, operation, completed/total),
`candidate-validated`, or `publication-ready`. It never receives sample arrays.
A callback rejection cancels publication and releases the transaction. Signals
are checked between bounded reads, work units, staging, validation, and directly
before the current-manifest rename. CLI SIGINT/SIGTERM uses the same cancellation
path. Once that rename succeeds the revision is committed; cancellation cannot
retroactively undo it.

Current/snapshot manifests and metadata-state CLI inputs have a 1 MiB file limit.
Batch/template/context CLI inputs have a 64 KiB limit. There are at most 1,024 operation/history records
and 256 named regions. Channels must fit exact declared byte sizes before
decoding; hashes, ranges, and classes are authenticated. Lock files are bounded
to 512 bytes. These metadata limits are separate from the edit buffer cap.

## Persistence, dirty state, and preparation

Changed height channels use `payloads/<sha256>.f32le`; unchanged channel bytes
keep their content URL/hash/revision. Each dirty work unit remains owned until
its replacement file is flushed and atomically installed. No unsaved unit is
evicted, and readers continue using the old current manifest throughout staging.
There is no mutable operation journal that can disagree with saved heights.

After every unit succeeds, the store validates the complete candidate, writes
immutable `manifest.<sha256>.json` snapshots beside the current file, verifies
that current bytes still match the transaction's input, and switches
`manifest.json` last by a same-directory rename. Failure, corruption, callback
error, or cancellation before that switch leaves current terrain/history
unchanged and does not consume batch IDs. Completed unreferenced immutable
payloads/snapshots may remain after a failed attempt; loaders cannot discover
them through the unchanged current manifest. Temporary `.partial` files are
removed on handled failures. This phase retains saved versions rather than
garbage-collecting history.

Revert authenticates the prior snapshot filename/hash and validates its complete
payload graph with the same bounded two-chunk pass. Native and ancestor state
restore together, without a native-count limit. A missing/corrupt old file
prevents the switch and leaves the edited current revision intact.

Hierarchy preparation reads current native authority, remeasures derived
errors, and preserves soil, named regions, operation/history records, and the
last-batch snapshot. It can upgrade an older root/native snapshot while
retaining the original. Repeated coastal source import refuses to replace any
changed/authored current landscape; it requires an explicit migration instead
of resetting local work. Appearance preparation changes derived appearance
resources without replaying height edits.

A live authoring lock owner is refused. A known dead owner can be recovered
under an exclusive guard, preserving an interrupted-owner note; malformed locks
require inspection. CLI `--output` cannot overwrite managed manifests, locks,
payloads, retained source files, appearance files, or chunk files.

## Verification

The focused store/CLI suites are `landscape_authoring_store.test.js`,
`landscape_authoring_streamed_store.test.js`, and
`landscape_authoring_cli.test.js` under `tests/node/unit/`. They cover exact
query bounds, 16/64-chunk constant-footprint edits, named state templates,
cross-border grade/smooth/soil results, immutable inputs, stage/candidate/commit
cancellation, injected staging failure, current-byte races, complete corruption
checks, and whole-batch reopen/revert. Synthetic artifacts stay under the
gitignored `tests/artifacts/screens/landscape/ai576/d5/authoring-tests/`
(the original regression fixture paths retain their D2 grouping).

The real coastal D5 browser workflow independently verifies 16 native and nine
ancestor changes, all 112 native borders, appearance eviction/reload, registered
hierarchy preparation, reopen, and full revert. Its evidence is under
`tests/artifacts/screens/landscape/ai576/d5/large-editing/`.
