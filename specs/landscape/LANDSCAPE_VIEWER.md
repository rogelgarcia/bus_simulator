# Landscape Fabrication viewer

Status: D1–D5 verified; D6 planning integration verified in the standalone viewer (AI 576).

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

## Navigation

The perspective camera defaults to **55°**, matching `src/app/core/GameEngine.js`.
Its 0.1-meter near plane matches the game; the 25,000-meter far plane accommodates
the coastal landscape. Initial overview coverage is preserved. Overview, Top and
Beach approach remain available, as do orthographic projection/span/zoom, saved
bookmarks and source reload without moving the camera.

`LandscapeCameraController` adapts the existing `FirstPersonCameraController`:

- **Left drag** turns the view around a fixed camera position. A plain left click
  still selects terrain. Motion up to five CSS pixels counts as a click and does
  not turn the camera; crossing that threshold counts as a drag even if the
  pointer returns to its starting position. Canceled/lost pointer capture does
  not select terrain.
- **Arrow keys or WASD** translate horizontally relative to the camera heading,
  including while looking straight down. **PageUp/PageDown** raise/lower the
  camera in world Y. These are free-flight camera controls; terrain elevations
  remain unchanged and ground following/collision is not enabled.
- Movement is 36 meters/second, or 84 with **Shift**. Combined axes are normalized
  and each update admits at most 0.1 seconds of movement after a frame stall.
- Canvas focus owns navigation. Clicking the canvas focuses it; editing any
  field, canvas/window blur, hidden-page pause, reload or disposal clears held
  movement and pointer state. Releasing a key outside the canvas also clears it.
- **Right drag** retains orbit, **middle drag or Shift+right drag** pans, and the
  wheel dollies in perspective. Orthographic wheel input changes projection
  zoom at a fixed camera position; panning uses the actual visible span.

**Game POV** resolves native ground at the selected point, or the current look
target clamped to the landscape if no point is selected. It then uses the
existing `gameplay_bus` inspection pose from
`src/app/grass/GrassLabValidationContract.js`: 4.5 meters above native ground,
12-meter horizontal look distance, 1.6-meter target height, and 55° perspective
with zoom 1. The gameplay chase camera itself varies with the chosen vehicle.
POV acquisition uses the existing bounded native query lease and releases it
after sampling; later navigation, reload, hiding or disposal cancels obsolete
requests. It does not replace the terrain selection or publish an edit. Subsequent
movement is free flight, so camera height is not locked to the ground.

The shared controller's click threshold/callback and focus requirement are
opt-in. Existing callers keep immediate left-drag looking and their existing
shortcuts. `tests/node/unit/landscape_navigation.test.js` verifies movement math
and release behavior; `tests/headless/e2e/landscape_navigation.pwtest.js` exercises
actual pointer/keyboard focus, canceled clicks, native POV, projection, bookmarks,
reload and disposal. Verification artifacts go under
`tests/artifacts/screens/landscape/navigation/step1/`.

## D6 planning aids

The compact Planning references & views panel adds authenticated retained
district/road/shoreline/beach guides, named reference navigation, local camera
bookmarks, and live elevation/5-meter-contour, slope, and water-depth diagnostics.
Guides retain source XZ and use explicitly approximate overview heights;
diagnostics use the actual displayed terrain LOD. Their legend does not present
coarse display values as authoritative native terrain.

Inspect area requests a bounded renderer-independent native footprint report
through the public local API. It shows coverage, sampling resolution, elevation,
slope, soil/cover probe fractions, water, area, and evaluated source polygon
overlaps. Reports invalidate on selection/source changes. Unspecified road or
reservation extents are not guessed into footprint constraints. Bookmarks live
in browser-local source-scoped metadata and survive reopen without changing
terrain revisions. All added guide buffers use the shared residency ledger and
remaining frame upload allowance, and release on disable/reload/teardown.

AI577 D2 streams generated fine coverage pages near the camera
([LANDSCAPE_SURFACE_DETAIL.md](LANDSCAPE_SURFACE_DETAIL.md)). `landscapeSurfaceDetail=off|50cm|25cm`
(default `25cm`) selects the fine levels; invalid values fail explicitly. A compact panel line
reports fine residency per level, uniform pages, pending work and cache hits (the toolbar and
side panels sit 14 px lower). Hooks add `detailSample(x,z)`, `setSurfaceWarp` and
`setMaterialClumps`; `snapshot().surfaceDetail` reports the selected mode.
The diagnostic selector also offers AI577 D2 surface diagnostics: *Surface detail level*
tints the shaded terrain by the finest contributing coverage page level and *Surface coverage
weights* shows unlit false-color coverage weights; their colors and semantics are in
[LANDSCAPE_APPEARANCE_RUNTIME.md](LANDSCAPE_APPEARANCE_RUNTIME.md). The translucent water plane
can z-fight over very low land in the Top view; diagnostic checks sample with water hidden.

See [LANDSCAPE_PLANNING.md](LANDSCAPE_PLANNING.md) for source formats and IDs,
accuracy, bookmark scope, report coverage, budgets, and verification hooks.

## D4 appearance and sea-level reference

The viewer now composes independent categorical-mask and PBR-page streaming with
the D3 geometry adapter. Sand, rock, vegetation-related soil and unknown substrate
use the existing global PBR catalog and retained correction profiles, with stable
world scale/orientation. The appearance planner can refine flat root geometry's
materials without requesting fine height meshes. Its raw source page tiers are
32, 128 and 512 pixels; full-resolution PBR images are never startup resources.

The same 384 MiB CPU / 192 MiB estimated GPU ledger (128/64 MiB before AI577 D2) covers both adapters. A base
appearance allowance and bounded view-demand credit protect planned material tiers
before geometry admission. Delayed cover/halo work therefore cannot change their
priority solely through completion order. Geometry and appearance share
one per-frame upload allowance. The compact live strip now includes mask counts,
per-soil texture tiers, pending appearance work and residency/degradation. Complete
policies, shader calibration, world UVs, parent transitions, resource costs and
test hooks are documented in `LANDSCAPE_APPEARANCE_RUNTIME.md`.

Water toggles a separately owned translucent plane at the retained sea level.
Terrain raycasts and native height/soil/submerged queries always use the actual
heightfield. The water reference never converts seabed elevation into sea level.
Planning urban/road/runway classes now display nearby natural ground inferred
from the shared overview. The legend labels those classes as imported surface
references; semantic queries still report their original cover and unknown soil.
Explicit soil assignments, including unknown, override the inferred appearance.
Smooth material responses and stationary near/macro texture lattices respond to
projected footprint, including fixed-position orthographic zoom. The new beach
uses the calibrated CC0 sand documented in `LANDSCAPE_NATURE_MATERIALS.md`.
AI577 D1 adds continuous material coverage, classification-preserving local
contour fits, world-meter transition widths and shared edge/corner availability.
It retains categorical inspection, source elevations and existing PBR patterns;
the precise source and filtering limits are in
[LANDSCAPE_SURFACE_COVERAGE.md](LANDSCAPE_SURFACE_COVERAGE.md).

## D3 streamed geometry and inspection

The viewer starts with validated root coverage, then selects a covering quadtree
partition using camera position/direction, physical viewport height, projection,
field of view and zoom. Perspective FOV and orthographic span/zoom controls change
detail while the camera remains stationary. Camera controls use the shared
first-person controller with the navigation behavior documented above.

Two module workers acquire, hash-check, decode and build bounded tile buffers.
Root source data remains pinned for overview coverage and common border normals.
Each worker owns one accounted root copy. Other source arrays, mesh/index arrays,
queued jobs, staging copies and optional inspection buffers use the shared
`LandscapeResidencyBudget`. Defaults are now 384 MiB controlled CPU buffers and
192 MiB estimated GPU buffers (128/64 MiB in D3), with one tile upload and at most 8 MiB of uploads
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

The D3 section records the geometry contract; its original palette-only appearance
is superseded by D4 above. The sections below retain the original D1/D2 scope and
measured evidence. D3 supersedes their single-overview rendering and server-query
implementation notes.

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

Overview, top, and beach-approach poses are available alongside the Game POV and
free-flight navigation described above. Top began as a perspective inspection
pose in D1; orthographic projection was added in D3. Grid/axes
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

D7 repeatable performance conditions, initial lower-budget URL options, opt-in
bounded capture hooks, measured cold/warm results, and accounting limitations are
documented in `LANDSCAPE_PERFORMANCE.md`. Performance capture is inactive during
ordinary viewing; its buffers are released on completion or teardown.
