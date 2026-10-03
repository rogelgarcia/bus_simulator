# Landscape Fabrication viewer

Status: D1-D2 implemented and verified (AI 576).

## Entry and ownership

`screens/landscape_fabrication.html` is the independent viewer. The Fabrication
menu registers it as shortcut **8**. It renders the canonical prepared manifest at
`assets/public/landscape/coastal-city/manifest.json`; the optional `landscape`
query parameter selects a different compatible manifest for inspection/testing.
Models and decoding belong to `src/app/landscape/`; the viewer is their Three.js
adapter. It does not create a city, game simulation, or flat placeholder ground.

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
