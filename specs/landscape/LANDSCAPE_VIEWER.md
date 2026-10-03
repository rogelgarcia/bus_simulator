# Landscape Fabrication viewer

Status: D1-D2 verified; D3 streamed viewer integrated (AI 576).

## Entry and ownership

`screens/landscape_fabrication.html` is the independent viewer. The Fabrication
menu registers it as shortcut **8**. It renders the canonical prepared manifest at
`assets/public/landscape/coastal-city/manifest.json`; the optional `landscape`
query parameter selects a different compatible manifest for inspection/testing.
Models, view planning and the residency ledger belong to `src/app/landscape/`.
The reusable Three.js/worker adapter lives under
`src/graphics/engine3d/landscape/`; the screen composes that adapter with its camera
and DOM panel. Neither the adapter nor the domain requires the Fabrication panel.
It does not create a city, game simulation, or flat placeholder ground.

## D3 streamed geometry and inspection

The viewer starts with validated root coverage, then selects a covering quadtree
partition using camera position/direction, physical viewport height, projection,
field of view and zoom. Perspective FOV and orthographic span/zoom controls change
detail while the camera remains stationary. The existing `ToolCameraController`
owns orbit, pan and perspective wheel movement. Orthographic wheel input changes
projection zoom; orthographic panning uses the effective visible span.

Two module workers acquire, hash-check, decode and build bounded tile buffers.
Root source data remains pinned for overview coverage and common border normals.
Each worker owns one accounted root copy. Other source arrays, mesh/index arrays,
queued jobs, staging copies and optional inspection buffers use the shared
`LandscapeResidencyBudget`. Defaults are 128 MiB controlled CPU buffers and
64 MiB estimated GPU buffers, with one tile upload and at most 8 MiB of uploads
per frame. No PBR pages or full-resolution masks are loaded in D3. Terrain colors
come from the original cover palette and ordered semantic soil overrides.

Refinement reserves all four children, including temporary overlap, before work
starts. The parent remains visible while children load and upload individually.
One atomic leaf-set change replaces the parent only after all four children are
ready. Their heights morph from the exact parent triangulation to the child
surface over 0.3 seconds. Coarsening reverses that transition before substituting
the parent. Both directions preserve adjacent level differences of at most one.
During a morph the achieved-error diagnostic conservatively includes the parent
error. The desired error is a quality goal and may remain unmet under pressure.
The aggregate bound also covers stitched edges: a visible static seam lies in
the adjacent coarser leaf's visible bounds, whose error is already included.
A synchronized edge during a transition lies on the active group's parent
boundary, whose error is included for the whole transition. These bounds rely
on canonical shared samples, balanced neighbors and one active morph group.
Per-tile inspection reports its source LOD error; it is not a separate claim
about the entire stitched display.

Fine outer-edge vertices adjacent to a coarser tile stay on their parent edge.
Equal-level neighbors share the smaller transition amount along their common
edge, including the previously resident neighbor, so adjacent group changes do
not suddenly release a stitched edge. Only one sibling group morphs at a time;
the balancing gate keeps any lower-level neighbor static during that transition.
Shared boundary normals use the root gradient, blended over three vertex rows;
this deliberately softens fine shading near tile boundaries to keep normals
continuous without loading a full-map normal raster. Downward skirts hide the
remaining transient edge exposure during independent group transitions. Skirts
are included in triangle and memory counts. Wireframe uses the surface triangle
edges and the same morph/edge shader, with owned indexed buffers disposed when
disabled. It excludes vertical skirt diagonals so the inspected lattice remains
readable. Chunk boundaries and LOD colors are separately selectable.
Raycasts synchronously read the same morph and edge-stitch positions as the
display shaders, then restore all CPU positions from the retained native height
and skirt data in `finally`. Picking creates no new full-tile scratch buffer and
does not mark GPU positions dirty or change authoritative source samples.

Unused tile GPU allocations and source/mesh references are released after a
750 ms reuse window, or immediately to admit new work. The hidden root remains
resident. A detail failure keeps its covering parent, reports the failed identity
and attempts at most one retry after 2.5 seconds. At most two source-only prefetch
tiles near the expanded frustum or projected half-second motion can use spare
capacity after visible work. They have no GPU allocation and lower priority than
camera/query requests; obsolete prefetch is canceled. Canceled workers are terminated;
their replacements reject stale worker events and stale revision results. Camera
changes replan every frame and cancel obsolete loading groups. Mode changes return
to bounded root coverage before admitting the new inspection cost and refining
again. Retained consumer leases can prevent source eviction.

Live statistics sit directly below the source header, adjacent to the shared
performance bar: rendered LOD range, tile count, pending/queued/canceled work,
loaded/evicted tiles, controlled CPU bytes, estimated GPU bytes, achieved/target
pixel error, degradation cause, per-frame upload bytes and streaming frame cost.
The selection panel identifies the rendered tile, level, residency and source
error. These metrics describe controlled buffers, not total browser heap or VRAM.

Exact selection now uses worker-acquired native source chunks in the browser and
the renderer-independent `queryLandscapeSelection` sampler. Its bounded lease is
independent of camera visibility and shares an existing decoded tile when present.
The lease is released after the context is produced. The Node server continues to
validate/save that context and owns persistent editing; the viewer does not create
a second edit engine. Fake shadow/query/collision interests can exercise the same
`acquireChunks` ownership API without introducing gameplay collision.

`window.__landscapeTestHooks` adds `setCamera`, `setInspection`, `setBudgets`,
`acquireConsumer` and `releaseConsumer`. The streaming snapshot includes desired
and rendered partitions, all resident source IDs, transitions, reservations and
lease owners. Explicit budget reconfiguration tears down the previous session;
a profile too small for root coverage produces a visible error. Source reload,
in contrast, retains the previous root until the new validated revision is ready.

The sections below retain the original D1/D2 scope and measured evidence. D3
supersedes their single-overview rendering and server-query implementation notes.

Use `node tools/landscape_server/run.mjs` on loopback port **8002**. Port 8001 is
reserved for the other worktree. The development server remains idle without a
viewer and starts no browser. Close test/viewer pages after verification. Hidden
pages pause animation, and `pagehide` tears down the renderer and pending loads.

## D1 geometry and inspection

The initial runtime requests only the manifest and its bounded overview height
and land-cover channels. No native chunks or retained source files are fetched.
The mesh follows the domain's NW-SE diagonal with Y-up winding and uses class
colors as a provisional appearance. Original native data is retained unchanged.
The preview rejects a geometry build above its conservative **32 MiB** per-build
allocation estimate; native-resolution mesh construction is not a fallback.
This estimate covers terrain buffers and construction/inspection overhead; it
is not a measured browser heap or total GPU-memory limit. D3 introduces shared
residency accounting and admission for simultaneous/transient resources.

Right-drag orbits, middle-drag or Shift+right-drag pans, and the wheel zooms.
Overview, top, and beach-approach poses are available. Top is a perspective
inspection pose in D1; orthographic streaming is a later D3 addition. Grid/axes
are view-only, with a 200-meter grid. World orientation is X east, Y up, Z north.

Shaded, wireframe-only, and shaded-plus-wireframe modes share the same actual
rendered terrain triangles and raycast target. Both wire modes use owned line
resources, created only while enabled and disposed on return to shaded. This
avoids retaining Three.js's internal material-wireframe index cache. Camera position, source
data, and selection remain unchanged by inspection modes. Material state belongs
to this viewer, not shared catalog materials.

The existing global `PerfBar` owns FPS/frame time, GPU timing when supported,
calls/triangles/lines/points, resource counts, and GPU identity. The viewer supplies
real unclamped frame duration and uses the same GPU timer. Resource counts are
not memory bytes. Canvas sizing/picking uses the bar's live
`--global-top-bar-height`; hiding/showing it triggers resize.

## Selection and reload

A short left click raycasts actual terrain. A miss or Clear removes the visible
selection and clears the saved handoff with `DELETE /api/landscape/selection`.
The point marker first shows a provisional overview sample with world
coordinates, semantic cover/soil, revision, and chunk identity. D2 then requests
native context through `POST /api/landscape/query`, targeting the displayed
revision. An explicit radius field (default 25 meters, zero for a point) defines
the selected area; its circle is drawn on the displayed terrain. The native
query admits at most four chunks and rejects areas outside the landscape or
the acquisition budget. The panel distinguishes resolving, authoritative, and
unavailable states. Late/obsolete replies cannot replace a newer selection.

Native context includes elevation, normal/slope, semantic soil, retained cover
ID, sample spacing, and the acquired chunk identities/revisions. It is marked
`editingReady` only after the entire requested region is acquired successfully.
Temporary native arrays are released after the query. The native point marker
can differ vertically from the coarse preview by the declared overview error;
the chosen world X/Z remains fixed. D3 will refine displayed terrain itself.
Focus selection frames the chosen point/area for inspection.

Selection JSON is copyable/downloadable and sent to
`POST /api/landscape/selection` by the local development server. The server checks
identity, revision, and bounds and atomically writes
`tests/artifacts/screens/landscape/ai576/selection.latest.json`. This temporary
handoff is not a published landscape source. When a generic static server is
used, handoff unavailability is visible and copy/download still work.

Reload validates a complete overview before replacing the scene. Invalid source
updates leave the last valid revision visible with an error. Reload preserves
camera position; retained world selections are resampled and receive fresh
context. A newer load cancels obsolete work. Disposal removes listeners, aborts
loads, stops frames, releases geometry/materials, and releases the WebGL context.

D2 edits are data batches processed by the renderer-independent authoring store
and CLI, documented in `LANDSCAPE_EDITING.md` and
`tools/landscape_authoring/README.md`. Height edits rebuild native chunks and the
affected overview samples; soil assignments remain separate ordered semantic
regions. The preview colors those assignments without overwriting imported
land-cover IDs. Apply/revert publishes one consistent source revision. Reload
preserves the current camera and resolves fresh context against that revision.

## Verification

`tests/headless/e2e/landscape_fabrication.pwtest.js` checks the real coastal source,
request count, bounded preview, actual pointer inspection/handoff, mode changes,
reload, performance-bar layout, and teardown. Captures and numeric snapshots live
under `tests/artifacts/screens/landscape/ai576/d1/`. Browser contexts close when
the test completes; screenshots are not committed visual baselines.

The coastal D1 browser gate observed three startup source requests (manifest,
overview height, overview land cover), 330,245 decoded channel bytes, 66,049
vertices, 131,072 triangles, and 3,950,628 estimated terrain GPU-buffer bytes.
Combined inspection adds a temporary line buffer that returns to zero when
disabled. These are buffer inventories, not a performance benchmark; startup
FPS in the screenshots must not be treated as a settled-frame measurement.

`tests/headless/e2e/landscape_authoring.pwtest.js` verifies native four-chunk
selection, a two-meter raise plus sand assignment, saved reopen, stale/duplicate
refusal, revert, oversized-region diagnostics, and clearing the handoff. It also
checks that float32 rendering coordinates do not corrupt semantic queries at a
fractional world origin. The coastal test uses an isolated retained-data copy;
its saved revisions and screenshots are under `tests/artifacts/screens/landscape/ai576/d2/`.

Regression captures now accept `LANDSCAPE_EVIDENCE_PHASE`; D3 verification writes
the viewer and authoring evidence under `d3/viewer/` and `d3/authoring/`. The
default phase is `regression`. `E2E_OUTPUT_DIR` redirects Playwright's automatic
diagnostics to the selected phase under `tests/artifacts/screens/`.
