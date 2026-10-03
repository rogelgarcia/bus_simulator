# Read-only landscape planning aids

AI576 D6 adds planning navigation and terrain diagnostics to Landscape
Fabrication. These aids do not place a road, building, bus stop, or collider.
Viewer state is separate from authoritative terrain; the shared performance bar,
geometry/appearance streaming, native selection, and authoring workflow remain
available. City bindings and future nonflat adapters have their own contracts.

## Retained source references

`src/app/landscape/LandscapePlanningReferences.js` is a renderer-independent
loader/normalizer for the actual retained coastal JSON formats. The viewer loads
four declared reference roles, sequentially, and verifies exact byte lengths and
SHA-256 before interpreting coordinates:

| Role | Retained records | Interpretation |
| --- | --- | --- |
| `planning-districts` | Seven named district polygons and supplied numeric IDs | Informational boundaries and source design elevations. |
| `planning-road-centerlines` | 41 named XYZ centerlines and supplied widths | Advisory planned corridors, preserving original Y elevation separately from XZ. |
| `planning-shoreline` | 801 XYZ points at retained sea level | Informational source shoreline; not a new water simulation. |
| `planning-beach-reservations` | Bus-stop reservation, level beach arrival, open view polygon | Point references and an advisory view corridor; no placed geometry. |

The four files total 326,439 encoded bytes. A single JSON file is capped at
512 KiB, their total at 768 KiB, and normalized data at 512 features/32,768 points.
Invalid format, bounds, coordinate convention, duplicate identity, truncated
response, or wrong hash fails visibly. Missing optional planning data does not
replace valid terrain or turn an approximate position into native authority.
The loader receives an `AbortSignal`; revision reload and teardown abort obsolete
requests. It never fetches the retained full rasters, placement-mask images,
source ZIP, or full-resolution materials.

The normalized feature contract is:

```text
{id, sourceId, name, kind, classification,
 geometry:{type:'point'|'polyline'|'polygon',points:[{x,y,z},...]},
 bounds:{minX,maxX,minZ,maxZ},
 source:{id,sha256,url}, metadata}
```

`kind` is `district`, `road`, `shoreline`, `point`, or `view-corridor`.
`classification` is `informational`, `advisory`, or `reservation`. Two-dimensional
source polygons use `y:null`; source XYZ arrays map their third component to
world Z, never the legacy city-tile Y coordinate. Geometry retains every source
point. For example, the first Industrial service-loop point is
`{x:1872,y:26,z:3496}`, and the bus-stop reference is
`{x:1260,y:2.6,z:520}`.

Supplied district IDs remain `sourceId:1` through `7`, with namespaced feature
IDs `district/1` through `district/7`. Road and beach-point records supply names
but no IDs, so deterministic name-derived IDs are explicit adapter identities:
`road/industrial-service-loop`, `point/bus-stop-reservation`, and
`point/level-beach-arrival`. The source name and content identity remain present.
`shoreline/source` and `view-corridor/beach-open-view` identify the single supplied
records. These identifiers survive terrain revisions while reference bytes stay
the same. Original files are neither rewritten nor promoted into placed objects.

The bus-stop record provides a 30 × 6 meter footprint with no orientation.
`metadata.footprintMeters.orientation` is `source-unspecified`. The viewer shows
its point and dimensional note; it does not invent a rotated or axis-aligned
parcel. District target elevations and original road Y coordinates are source
design information, not live terrain-query results. The imported open view
polygon remains advisory; a future explicit placement policy may treat it as a
constraint, but visibility alone has no placement effect.

## Compact navigation and bookmarks

The collapsible Planning references & views panel contains category toggles, a
named reference list, Focus reference, a diagnostic selector, and camera
bookmarks. Names and notes use text nodes. Focusing a reference uses its world-XZ
bounds or point and a current overview height, labeled `overview-navigation`.
The camera moves; no selection, source sample, or city object is authored.

Camera bookmarks persist in local browser storage, namespaced by landscape ID
and absolute manifest URL. At most 24 names of 1–60 characters retain position,
target, projection, field of view, orthographic span, and zoom. Saving an existing
name updates its camera while preserving its bookmark ID. The storage document
has its own `landscape-view-bookmarks` schema and no terrain revision, edit log,
height, soil, or city state. Reload/reopen restores the list; Go applies a saved
camera. Delete removes only that local bookmark. Camera state is validated and
copied at the boundary. Malformed stored data is not used; storage failures are
visible and cannot silently replace a saved view. Bookmarks are specific to the
browser/origin and are not synchronized project assets.

## Display accuracy and diagnostic overlays

Reference guides preserve source XZ and drape on the retained overview using its
canonical NW-SE triangles. The coastal root spacing is 15.625 meters. Guide
heights are approximate and do not replace retained source Y values or native
queries. A small vertical offset and depth-independent line drawing keep these
informational guides readable. They do not participate in terrain raycasts.

The live diagnostic shader reuses the displayed, stitched, morphed terrain
positions; it allocates no new terrain raster, texture, mesh, or height source:

| Diagnostic | Display |
| --- | --- |
| `none` | Existing soil PBR/material surface. |
| `elevation` | Height tint over the root native envelope, with antialiased 5-meter contours. |
| `slope` | Displayed triangle slope: green 0°, yellow 15°, red 35° and above. Material normal maps do not change this value. |
| `water` | `max(0, seaLevel − displayedHeight)`: cyan at zero depth to dark blue at 10 meters and beyond, gray-green for dry ground. |

The legend explicitly says displayed terrain LOD / approximate. Coarse triangles
and active morphs can omit native extrema and slopes. The contour display derives
from the current displayed terrain, so edits cannot accidentally reuse stale
imported `contours_5m.json` as if it described new heights; that original remains
retained reference data. The existing separate sea-level plane can be toggled
independently. Neither the plane nor any planning guide changes height, soil,
submerged status, or raycast authority.

## Native terrain reports

Inspect area submits the explicit selected footprint and displayed revision to
`POST /api/landscape/report`. It uses a native-derived bounded sampling spacing,
4096 maximum probes, and reports pending, ready, partial, unavailable, or outside
coverage without inventing a height. The readout gives sampled elevation range,
slope range/mean, soil and cover probe fractions, area, water depth/submerged
fraction, and evaluated overlaps. Sampled extrema and probe fractions are not
continuous-surface guarantees. The report engine and its version/dependency
validation are public domain APIs, independent of the renderer.

The viewer supplies only actual bounded source polygons: district boundaries
and the explicit open-view polygon, each retaining its classification. The
readout says “Reference polygons only; other guides were not evaluated.”
Undimensioned lines and the bus-stop footprint with unspecified orientation are
not converted into guessed constraints. A zero overlap count therefore does not
mean no roads or reservations exist. Callers with explicit footprint, corridor,
or existing resolved city-reservation shapes can use the report API directly.
Selecting a new area or reloading source invalidates displayed reports and aborts
the old request. A late response cannot replace the current report. Successful
responses must match the requested landscape/revision.

## Residency and teardown

`LandscapePlanningOverlay` reserves source staging before fetch, then reduces it
to bounded reference numeric/metadata residency. It creates no guide geometry
until a category is enabled. Each category uses one nonindexed line buffer;
its actual `Float32Array.byteLength` is reserved on CPU and estimated GPU before
construction. First upload waits for the shared frame's remaining upload bytes
after terrain geometry and appearance. Disabling a category removes/disposes
its mesh/material, drops typed-array references, and releases its ledger entry.
Re-enabling reconstructs within the same bounds. Reload/teardown aborts source
loads and clears all owned records. There is no unaccounted second overlay cache.
Reference numeric/metadata accounting is an estimate of controlled data, not a
measurement of all JavaScript object overhead or driver memory.

The existing 128 MiB CPU / 64 MiB estimated GPU profile and 8 MiB shared upload
allowance remain unchanged. Planning is optional and displays an admission
diagnostic if spare capacity is unavailable; it cannot evict native consumer
leases or discard valid terrain to display a guide.

## Verification hooks and evidence

`window.__landscapeTestHooks` exposes `setPlanning(options)`,
`focusReference(id)`, `saveBookmark(name)`, `focusBookmark(id)`,
`removeBookmark(id)`, and asynchronous `reportSelection()`. Planning options are
`districts`, `roads`, `shoreline`, `points`, `corridors`, and `diagnostic`.

`snapshot.planning` includes readiness/settlement, current source revision,
compact feature identities/provenance/first XYZ point, active visibility,
diagnostic, accuracy, errors, CPU/GPU residency, upload counters, and reference
hash dependencies. `snapshot.bookmarks` contains saved camera records;
`snapshot.report` contains `{status,pending,result,error}`. Full normalized
geometry is available through the domain loader, not duplicated in telemetry.

Focused Node coverage is `landscape_planning_references.test.js` and
`landscape_viewer_helpers.test.js`. It checks real retained coastal identities,
axis ordering, authentication/admission/cancellation, malformed data, independent
bookmark persistence, and exact guide buffer costs. The real viewer gate
`landscape_planning.pwtest.js` checks all diagnostic modes, navigation, native
reporting, bookmarks across reopen, unchanged source bytes, and zero remaining
budget after teardown. Screenshots and its verification receipt are under
`tests/artifacts/screens/landscape/ai576/d6/planning/`.
