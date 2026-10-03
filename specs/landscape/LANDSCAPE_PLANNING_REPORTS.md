# Terrain planning reports and dependencies

Status: D6 implementation (AI 576).

## Independent query contract

`reportLandscapeTerrain` in `src/app/landscape/LandscapeTerrainReports.js` consumes
a validated manifest and an injected authenticated native-chunk reader. It has no
renderer, editor, city, DOM, or resident-camera dependency. The reader must not
retain decoded arrays and must authenticate payload hashes, as the provided file
and browser readers do. Reports load one native chunk at a time. All probes for
that chunk are evaluated before its reference is released.

The request supplies `expectedRevision`, `sampleSpacingMeters`, and either
`shape: {type:'footprint', region}` (circle, rectangle, simple polygon) or
`shape: {type:'corridor', points:[{x,z},...], widthMeters}`. Coordinates are
landscape world meters. Corridor ends are round. Spacing cannot be finer than
the source grid. Default probe limit is 4,096; callers may lower it or raise it
to 8,192. Candidate grids are capped at 65,536 before I/O. Constraints are capped
at 256, polygons/corridors at 128 vertices. Large requests must explicitly choose
coarser sampling rather than silently reducing accuracy.

Probe locations are regular cell centers inside the exact shape, footprint
anchors, and corridor centerline samples. Results label this method and spacing.
`spacingMeters` is the requested maximum probe interval; `gridSpacingMeters`
records actual X/Z cell spacing after dividing the bounds into complete cells.
Elevation, slope, soil/cover composition, sea level, depth and submerged fraction
describe sampled points, not exhaustive extrema or area-weighted statistics.
Corridor profiles retain distance and signed percent grade between adjacent ready
samples; unavailable samples break the grade chain. The report does not grant
buildability permission. Footprint area is analytical; a straight corridor has
exact capsule area. Bent/self-overlapping corridors declare their sweep-area
upper bound because overlap area is not subtracted.

Statuses are `ready`, `partial`, `outside`, or `unavailable`; pending is the
caller's asynchronous state. Missing/corrupt chunks contribute unknown counts and
reasons. Missing elevation/water aggregates are `null`, never zero. Requests
partially outside terrain retain explicit out-of-bounds coverage. Source probes
use deterministic east/south native ownership, including the closed outer edge.

The binary I/O/decode reservation is four times the largest requested native
chunk's decoded height+cover bytes, admitted against the shared authoring 8 MiB
working-set ceiling. For coastal 257² chunks this is 1,320,980 bytes. Probe and
result object counts are capped separately; JavaScript object overhead, garbage
collection, and process heap are not claimed as measured binary residency.

## Exact planning exclusions

Optional `constraints` use `{id, classification, shape}`. Classifications are
`informational`, `advisory`, or `reservation`; they describe provenance and intent,
not automatic enforcement. Intersections use actual circle, simple polygon,
rectangle, or round-ended corridor geometry, including containment and touching
edges. Bounding-box or tile occupancy alone is insufficient. The API does not
create or own constructions; city adapters resolve the existing authored
parcel/reservation rules first, preserve their IDs, and transform resulting
geometry into landscape coordinates. Unspecified source widths/orientations must
not be presented as authoritative exclusions. Polyline reference roads retain
their source elevation separately from horizontal planning shapes.
`constraintCoverage` distinguishes no requested evaluation from evaluated inputs
and records their count. Zero overlaps do not prove a site has no constraints.

## CLI, HTTP, and snapshot consistency

`node tools/landscape_authoring/run.mjs report --request request.json --output report.json`
uses the same domain API as `POST /api/landscape/report`. Both are read-only.
The local server applies JSON-size, origin, cancellation, and single-working-set
admission gates. It rechecks current manifest bytes after report completion,
so concurrent external publication cannot return a report labeled current.
Saved reports include a revision pin and dependency record, revalidated after edits.

Example request (substitute current revision from `state`):

```json
{
  "expectedRevision": "CURRENT_REVISION",
  "shape": {
    "type": "corridor",
    "points": [{"x": 1200, "z": 1200}, {"x": 1600, "z": 1500}],
    "widthMeters": 20
  },
  "sampleSpacingMeters": 10,
  "maxSamples": 4096
}
```

## Product dependency and invalidation contract

`createLandscapeDependency` records landscape ID, revision, source hash, schema,
coordinate/grid identity, query bounds, requested channels, algorithm version,
intersecting native payload hashes, and relevant soil overrides/catalogs.
Its `contentKey` is an exact serialized identity, not a cryptographic signature.
`checkLandscapeDependency` rejects stale revision pins by default. Explicit
`requireRevision:false` permits unchanged content reuse after revision advancement,
but does not convert a stale city binding into a current one. Geometry envelopes
are conservative; border-sharing chunks can invalidate both neighbors.

`landscapeChangeInvalidates` checks affected bounds and channels; height changes
also invalidate water-depth products, cover changes also invalidate inferred soil.
Pass `{bounds: edit.summary.affectedBounds, channels: edit.summary.channels}`
from D5 edits. Bounds must have positive area; `changedSampleBounds` can be
degenerate for a one-vertex edit and is not the invalidation envelope.
Soil operation IDs/geometry and payload hashes identify evaluated data. Unrelated
native payloads remain reusable. D3/D4 worker and resource identities already
include revision/channel/content and reject late old work. D5 publication rebuilds
affected ancestors and preserves unrelated hashes. Report dependencies cover
terrain only; a product consuming city objects or reference geometry must also
key those owners' stable IDs/content and its binding transform.

Future road, foundation, vegetation, collider, visibility and lighting products
must declare channels, bounds/halo, algorithm and schema before reuse. An edit
dirties intersecting dependencies; a source/grid/schema change invalidates the
product wholesale. Existing flat-only city caches reject a landscape binding
until supported. No terrain edit invokes a whole-city rebuild for this viewer.

## Future content-layer residency

Terrain is authoritative independently of any renderer. A future layer descriptor
must own a stable layer ID, schema/capabilities, source revision/content key,
world bounds, independent spatial index, payload LOD/error semantics, residency
costs, and explicit terrain dependencies. Roads, buildings and props need not
share the terrain quadtree or sample spacing. Consumer leases declare required
accuracy, bounds, priority and cancellation, then release references separately
from color-pass visibility. Collision/safety interests can retain offscreen data;
missing authoritative data returns pending/unavailable, never a synthetic flat
surface. Existing D3 lease/budget contracts are the integration point. This
deliverable does not implement placed-content streaming or gameplay colliders.
