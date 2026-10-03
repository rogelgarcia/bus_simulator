# Landscape Fabrication handoff

Landscape Fabrication provides saved native terrain, bounded viewing and independent appearance streaming, exact AI edit context, recoverable terrain/soil authoring, and city planning references. It does not make the coastal city playable or implement terrain-aware roads, buildings, vehicles or collision.

## Open the landscape

From this worktree:

```sh
node tools/landscape_server/run.mjs
```

Open `http://127.0.0.1:8002/screens/landscape_fabrication.html`, or use **Landscape Fabrication / shortcut 8** in the Fabrication menu. Port 8001 is reserved for other worktrees. Starting this loopback server does not open a browser or allocate GPU resources. Close inspection pages when finished.

The screen uses the shared first-person camera and live game performance bar. Arrows/WASD move horizontally, PageUp/PageDown change camera elevation, Shift moves faster, left-drag looks around and a plain click selects terrain. Game POV uses the game's 55° lens and bus inspection pose. It also supports perspective and orthographic navigation/zoom, focus/home and explicit poses, shaded/wireframe/combined inspection, grid/axes, resident LOD/chunk inspection, water reference, planning guides, named locations, saved camera bookmarks and elevation/contour/slope/water-depth views. Camera and display settings are separate from terrain ownership. Reload retains camera pose. Invalid new data leaves the last valid terrain visible with an error.

Canonical current data is `assets/public/landscape/coastal-city/manifest.json`. Immutable `manifest.<sha256>.json` snapshots and content-addressed `payloads/` preserve previous source states. Appearance has its own `appearance/manifest.json` and independently loadable pages. No runtime request depends on the source ZIP, `downloads/`, preview OBJ or complete original rasters.

The follow-up nature pass installs clean CC0 beach sand and replaces the visual pavement treatment with inferred natural ground while retaining source classifications. See [natural material provenance](LANDSCAPE_NATURE_MATERIALS.md) for the material-only revision, immutable appearance snapshot and source hashes. D7 measurements below remain historical; the nature pass is verified separately.

## Source and fidelity

The source is the user-supplied **coastal_city_terrain_v2.zip**, SHA-256:

`21702aab6210e2b576666b3fd5a4b6d48884e0372447357bee10dd8ea3d463ce`

It is designed prototype terrain, **not survey measurements**. The supplied package does not specify a license. `PROVENANCE.json` retains that distinction without inventing license terms. All 29 supplied records, including the unexecuted generator, original rasters, districts, XYZ road references, shoreline, beach points, contours and placement masks, are retained byte-for-byte under `source/<archive-sha256>/`.

The 4,000×4,000m landscape contains 2,049×2,049 vertices at **1.953125m native spacing**. Raster row zero is north/Z=4,000; columns increase east/+X; source Y is elevation in meters. Heights retain original little-endian float32 bits, including negative seabed, with no vertical exaggeration. Sea level is Y=0. Native source range is -30 to 49.21965408325195m. Upsampling or material microdetail cannot create new measured/authored elevation detail.

The complete tree has 85 independent 257×257 pages: one root, four level-1, sixteen level-2 and sixty-four native pages. Shared border vertices duplicate the same exact source values. Land-cover IDs 0–7 remain a separate nearest-sampled categorical channel. Urban/road/runway classes are planning cover over unspecified substrate; they are not finished pavement or authoritative soil composition. Ordered soil overrides preserve those imported IDs.

The D7 read-only source audit authenticates the pinned manifest, 29 retained records totaling **32,860,674 bytes**, and all **150 unique hierarchy channels**. It compares every native tile against source bytes: **4,227,136 vertex occurrences**, covering 4,198,401 unique source samples and all 112 shared borders, plus seven named checkpoints. The current canonical native hashes matched the original during this audit. Evidence: `tests/artifacts/screens/landscape/ai576/d7/source-fidelity.json`. This test audits immutable original authority, so later legitimate authored current revisions are not mistaken for damaged originals.

## Select, edit, reload and revert

Point at terrain and choose an explicit positive selection radius for an area edit. A displayed-surface hit is provisional until native acquisition succeeds. Use context only when `editingReady:true` and `sourceRevision` matches the current source. The local handoff is written atomically to:

`tests/artifacts/screens/landscape/ai576/selection.latest.json`

The panel also supports copying/downloading context. It records identity/revision, exact world location/region, native accuracy, soil/cover/elevation, camera and acquisition limits; mesh/vertex IDs are not edit coordinates. The shared CLI accepts declarative JSON operations, not generated code patches:

```sh
node tools/landscape_authoring/run.mjs state
node tools/landscape_authoring/run.mjs bind --template tools/landscape_authoring/examples/raise_and_sand.template.json --context tests/artifacts/screens/landscape/ai576/selection.latest.json --batch-id coastal-patch-001 --output tests/artifacts/screens/landscape/ai576/d7/batch.json
node tools/landscape_authoring/run.mjs apply --batch tests/artifacts/screens/landscape/ai576/d7/batch.json
```

Review the bound batch and use a new batch ID each time. The example raises the selected area by 2m with an explicit inner falloff and assigns sand. Reload the viewer after publication; query again for a new revision-bound context. Revert the complete latest batch using the revision returned by apply:

```sh
node tools/landscape_authoring/run.mjs revert --expected-revision <edited-revision> --batch-id coastal-patch-001
```

Replace the revision placeholder before running. Revert publishes a new revision and retains accepted batch IDs, including the reverted ID. It works from saved manifests independently of Git. Stale/duplicate requests fail without changing the current manifest.

Large edits bind `examples/grade_smooth_polygon.template.json` to `state --output ...` using `bind --state`, rather than claiming that a small selection acquired a whole district. Supported ordered operations are signed raise/lower, set-height, grade between explicit height endpoints, bounded deterministic smoothing and soil assignment. Regions are circles, rectangles or simple polygons with stable optional named IDs. Each smoothing operation reads a fixed previous-operation snapshot, including neighbor halos. Immutable outputs stage one unit at a time, all affected ancestors rebuild, validation runs, and one final manifest switch publishes the whole batch.

See [authoring CLI](../../tools/landscape_authoring/README.md), [edit semantics](LANDSCAPE_EDITING.md) and [bounded streamed editing](LANDSCAPE_STREAMED_EDITING.md). Every command supports `--directory` for an isolated copy. Test workflows use isolated copies and never edit the canonical coastal data.

## Delivered components and public contracts

| Deliverable | Usable result and canonical contract |
| --- | --- |
| D1 | Independent viewer, native import/provenance, validated model, source coordinates, bounded overview and selection handoff. [Model](LANDSCAPE_MODEL.md), [import](COASTAL_IMPORT.md), [viewer](LANDSCAPE_VIEWER.md). |
| D2 | Authoritative bounded acquisition, saved raise/set-height/soil batches, atomic publication, stale/duplicate refusal and whole-batch revert. [Editing](LANDSCAPE_EDITING.md). |
| D3 | Complete current-source hierarchy, measured offline errors, view-dependent mesh requests, mixed-LOD transitions, worker cancellation, consumer leases and CPU/GPU admission. [Hierarchy](LANDSCAPE_HIERARCHY.md), [streaming](LANDSCAPE_STREAMING.md). |
| D4 | Geometry-independent categorical mask and 32/128/512 PBR page selection, existing global catalog/calibration, shared material ownership, semantic-preserving transitions and separate water reference. [Appearance](LANDSCAPE_APPEARANCE.md), [runtime](LANDSCAPE_APPEARANCE_RUNTIME.md). |
| D5 | Named polygons, snapshot/halo smoothing, grading, unbounded-footprint sequential edits with bounded working buffers, exact seams and impact receipts. [Streamed editing](LANDSCAPE_STREAMED_EDITING.md). |
| D6 | Optional pinned city bindings through actual JS builder normalization/export/reload, reservation adapters, planning references/bookmarks, native footprint/corridor reports and revision/content invalidation. [City binding](LANDSCAPE_CITY_BINDING.md), [planning](LANDSCAPE_PLANNING.md), [reports](LANDSCAPE_PLANNING_REPORTS.md). |
| D7 | Integrated edit/revisit/preparation/revert correctness, retained-source audit, repeatable performance/pressure profiles and consolidated handoff. [Performance](LANDSCAPE_PERFORMANCE.md). |

`src/app/landscape/index.js` is the renderer-independent public API. It exposes validated manifests/loaders, coordinate conversion, height/normal/slope/soil/cover sampling, explicit asynchronous region acquisition, selection context, streamed editing, dependency identity, reports, planning reference normalization and city binding transforms. Non-editor tests load the same saved manifest and sample native terrain without importing a screen, Three.js or DOM code. The reusable worker/graphics adapter is under `src/graphics/engine3d/landscape/`; the screen merely composes it with controls and panels.

Current-source preparation uses the existing registered hierarchy, never a standalone machine-specific bake:

```sh
node tools/bake.mjs --target landscape/hierarchy --publish
node tools/bake.mjs --target landscape/appearance --set "landscape/appearance:source-root=<existing-public-pbr-folder>" --publish
```

Hierarchy preparation authenticates **current saved native chunks**, preserving edits/soil/history and repairing tight measured errors without reimporting the ZIP. Appearance preparation uses the shared configured Python runtime; replace its source-folder placeholder with the existing public PBR image folder. This metadata-only checkout retains prepared runtime pages and the catalog/config closure, not the original full-resolution images. Rebuilding appearance requires those offline inputs; viewing does not. Original import remains the explicit `landscape/coastal-import` leaf with a configurable source path. All leaves preserve shared validation/publication gates and avoid unrelated expensive bakes. See [preparation](../../tools/bake_landscape/README.md).

## Budgets and accuracy limits

| Resource/operation | Declared default or ceiling |
| --- | --- |
| Combined terrain controlled CPU buffers/reservations | 128 MiB |
| Combined estimated terrain GPU buffers/reservations | 64 MiB |
| Background jobs | Two geometry workers plus one appearance worker |
| Per-frame upload allowance | One geometry tile and 8 MiB shared upload bytes |
| Geometry quality goal | 1.5 pixels, subject to source/detail availability and hard budgets |
| Exact point/area selection | At most four native chunks and 2 MiB decoded input |
| Persistent edit/validation working buffers | 8 MiB, sequential units independent of footprint size |
| Smoothing | Explicit radius of 1–8 native samples per axis; clamped source-edge halo |
| Native footprint/corridor reports | 8,192 probes, 256 supplied constraints, one decoded native chunk and 8 MiB binary admission |
| Input/schema bounds | 1 MiB terrain manifests; 64 KiB batches/context; 64 operations per batch; 128 polygon vertices; 256 named regions |

Buffer ledgers are controlled allocations and reservations, **not total process heap/RSS or measured VRAM**. Worker staging, old/new transitions, decoded sources, textures/mips, inspection resources and consumer leases are counted. Metadata objects, browser/driver overhead and filesystem caches are outside those buffer estimates. Detail can remain coarse under pressure; the viewer reports the desired/achieved error and degradation reason while retaining valid coverage. If minimum coverage cannot fit, loading fails visibly.

Native queries use float32 vertices and the specified NW–SE triangulation, with categorical nearest-neighbor sampling and ordered semantic overrides. They never substitute a displayed coarse sample for authoritative input. Reports identify their probe spacing and unavailable/outside coverage; sampled extrema and equally weighted fractions are not exhaustive survey bounds, exact area composition or buildability approval. Diagnostic overlays and reference-guide draping show displayed/overview geometry and explicitly remain approximate. Water is a reference plane, not simulation.

## Integrated correctness and performance evidence

The D7 coastal workflow applies a large polygon grade, a local raise, snapshot smoothing and soil assignment; it edits **16 native chunks plus 9 ancestors** with a **2,349,043 / 8,388,608-byte** working reservation. All **112 native borders** match exactly. The independent center formula yields **18.49382781982422m**; signed source-relative changes span **-6.668035507202148 to +12.172953944653273m**. The edit survives geometry/appearance eviction, revisit, page reopen and registered hierarchy preparation, then reverts every saved channel. Teardown releases all controlled CPU/GPU reservations.

The same gate reports **907 authoritative probes** across **16 sequential native reads**, with at most one decoded chunk and **1,320,980 bytes** of binary report admission. Original cover and reservation footprints remain unchanged; soil becomes sand within the explicit polygon. Affected dependencies become stale, unrelated/channel-independent content remains reusable only through explicit content validation, and strict revision pins remain stale even after a content-restoring revert. A pinned immutable city continues loading its original landscape, while binding it to the changed current manifest is refused. Saved report responses with old revisions are rejected.

Evidence is `tests/artifacts/screens/landscape/ai576/d7/large-editing/verification.json`, its five captures, and `hierarchy-validation.json`. The test backs up/restores the earlier hierarchy validation receipt. Historical D1–D6 evidence remains in the matching deliverable directories.

The D7 lifecycle gate also passes **2/2** checks. A real SetupState Fabrication-menu click opens the canonical landscape entry, with one shared performance bar and native picking unchanged through resize and HUD show/hide. Only unrelated game bootstrap is omitted from that focused menu document. Navigating from the coast to a synthetic landscape while a height request is held records the departing page's disposed state with zero controlled CPU/GPU/source bytes; the next source loads and repeated disposal remains safe. Evidence: `d7/lifecycle/menu-entry.json`, `landscape-switch.json` and the lifecycle capture under the same artifact root.

Measured hardware/browser, cold/warm conditions, route/zoom sequence, sample counts, startup/detail latency, frame time/FPS, draw/triangle counts, transfer bytes and residency/transient tables are maintained separately in [LANDSCAPE_PERFORMANCE.md](LANDSCAPE_PERFORMANCE.md), with raw receipts under `tests/artifacts/screens/landscape/ai576/d7/performance/`. This handoff does not substitute inventory estimates or an unsafe hypothetical full-resident run for those measurements. Unavailable metrics are labeled with their reason there.

Repeatable gates use the repository's selected-test runner. Relevant suites are `landscape_source_audit.test.js`, the model/import/hierarchy/authoring/planning/city Node suites, and browser suites `landscape_fabrication`, `landscape_authoring`, `landscape_streaming`, `landscape_appearance`, `landscape_planning`, `landscape_city_binding`, `landscape_large_editing`, `landscape_lifecycle` and `landscape_performance`. They cover valid/invalid schemas, deterministic edits and atomic failures, native fidelity, menu/direct entry, camera/inspection controls, stale/corrupt/canceled requests, independent leases, budget pressure, exact source queries, semantic appearance independence, persistence, source navigation and release. Browser verification is sequential and closes its pages afterward; generated captures/receipts remain ignored artifacts.

## Remaining integration work

The city fixture `coastal-landscape` preserves parcel squares/limits, reservation IDs, fixed design dimensions, rendered flags and catalog references. Seed/dimension edits cannot recenter or regenerate its landscape. Map Debugger shows a labeled schematic reference plan. Production flat-city rendering, visibility and illumination export explicitly refuse bound input; they cannot activate old flat caches as terrain support.

These concrete adapters remain future work:

| Existing system | Required terrain work |
| --- | --- |
| `src/graphics/assets3d/generators/TerrainGenerator.js` | Replace its flat ground assumption through an explicit landscape consumer. |
| `src/graphics/visuals/city/City.js` | Terrain-relative content/foundation/slab placement and supported landscape-dependent cache identities. |
| `src/app/road_engine/RoadEngineCityMapAdapter.js` | Explicit XYZ elevation/grade and road-surface ownership; source road Y is retained separately from horizontal XZ references. |
| `src/states/GameplayState.js` | Safe terrain-aware spawn/elevation/availability policies. |
| `src/app/physics/simulations/RapierVehicleSim.js` | Terrain colliders, offscreen safety-region residency and vehicle validation. |

Future placement must explicitly choose terrain-relative or absolute height, vertical offset, upright or slope-aligned orientation, footprint accuracy and missing-data policy. Foundations requiring flattened/graded pads must request a separate explicit terrain batch. Placing/removing a building or overlay must not erase underlying terrain/soil. Terrain changes invalidate dependent products by bounds, channels, source revisions and algorithm versions.

Placed-content streaming for roads/asphalt, buildings, props, vegetation and collision is **not implemented**. Versioned layer identity, cross-tile feature ownership, independent LOD/resource costs, non-camera leases, dependencies and readiness are defined extension contracts only. Vehicle traction, enforceable protected zones, automatic construction, cut/fill estimates and higher-resolution imported local patches are also outside this delivery.
