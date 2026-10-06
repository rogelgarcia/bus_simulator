# Landscape references in city specs

D6 adds an optional city-owned landscape reference. It does not make flat-city rendering, roads, foundations, vehicles, collision, visibility or illumination bakes terrain-aware. A landscape remains independently loadable and editable without a city.

## Persisted contract

`spec.landscape` is validated, copied and deeply frozen by `validateLandscapeCityBinding`:

```js
{
    format: 'city-landscape-binding', schemaVersion: 1,
    landscapeId: 'coastal-city',
    manifestUrl: 'assets/public/landscape/coastal-city/manifest.<sha256>.json',
    revision: 'hierarchy-afaf934f8eb8fe074a0affb0',
    transform: { translation: { x: -2000, y: 0, z: -2000 }, yawDegrees: 0, scale: 1 },
    extent: { minX: 1000, maxX: 1500, minZ: 1800, maxZ: 2200 },
    capabilities: ['landscape-reference-v1']
}
```

The binding owns a landscape ID, pinned revision, explicit supported subregion and landscape-to-city rigid transform. IDs use the landscape stable-identifier contract. Manifest URLs are safe relative JSON paths under retained `assets/public/landscape/`: no external origin, machine path, traversal, encoded path, query or fragment. Unknown schema/capabilities fail. Scale must equal one; nonfinite values fail. Validation against a loaded manifest also checks exact ID/revision and subregion containment. Stale revisions require explicit rebinding after dependent plans are reviewed; loading never silently adopts changed terrain.

`loadCityLandscape(binding,{baseUrl,fetchImpl,signal})` loads only the bounded manifest and returns `{binding,manifest,manifestUrl}` after verification. `baseUrl` is the HTTP(S) application root; the browser default derives it from this module's location. Native acquisition/reports then use the existing public APIs. No editor, DOM, Three.js, Node filesystem, full-raster or displayed-LOD dependency is introduced.

The terrain manifest has no reverse city binding. Several cities may reference the same terrain. The reserved terrain-manifest `cityBinding` property remains rejected.

## Coordinates and partial tiles

All distances remain meters. The transform maps landscape to city world using the right-handed Y rotation:

```
cityX = cos(yaw) * landscapeX + sin(yaw) * landscapeZ + translation.x
cityZ = -sin(yaw) * landscapeX + cos(yaw) * landscapeZ + translation.z
cityY = landscapeY + translation.y
```

`landscapePointToCity` and `cityPointToLandscape` are inverses. Optional Y is transformed only when supplied. Reports and samples return **landscape-world elevation**; a city consumer must apply the Y translation. Yaw changes horizontal placement only. Vertical Y never becomes horizontal Z.

`CityMap.origin` is the **center** of tile `(0,0)`. Columns increase +X and tile row/Y increases world +Z, independently of source raster rows increasing southward. Centers are `origin + index * tileSize`; boundaries lie half a tile either side. Public city-tile addressing uses half-open intervals, with the outer maximum outside the grid. Landscape sample bounds include their outer vertices. Native spacing, streaming chunks and parcel tiles are independent.

`extent` stays in landscape XZ and does not change with city dimensions. `cityRegionToLandscape` preserves points and circle radius; rectangles become transformed polygons rather than expanded bounding boxes. `cityTileLandscapeCoverage` clips a transformed tile against extent, returning `inside`, `partial` or `outside` plus polygon/covered area. Partial tiles never shift or scale terrain. The retained 500×400m fixture uses 24m tiles: its last corner covers 20×16m; expanding the grid adds outside tiles.

## Actual authoring path

`src/app/city/specs/CoastalLandscapeCitySpec.js`, registry ID `coastal-landscape`, pins an immutable retained coastal manifest with negative city origin. It uses the existing `burban` catalog/parcel model and a fixed-size `bus_start` reservation. Source roads, districts and reference markers remain separate planning data, not automatically placed objects.

`CitySpecAuthoring.normalizeCitySpec` is used by `MapDebuggerState._normalizeSpec` and bound `CityMap.fromSpec`. Bound inputs require explicit positive dimensions/tile size and finite tile-center origin. `CityMap.exportSpec`, existing editor JSON export and **Download JS** retain binding, authored parcel squares/limits, reservation records, stable IDs/catalog references and disabled `rendered:false` entries. Parcel data does not become solved footprints. `serializeCitySpecToModule` creates an executable factory; `importCitySpecModule` passes it through the same normalization boundary. JS modules remain authoritative; test exports remain ignored artifacts.

`applyCitySpecSettings`, called by the real settings handler, preserves bound origin, landscape transform, extent, source and revision under dimension/seed changes. Shrinks excluding authored building/reservation/segment squares fail visibly before rebuilding; moving/removing those entries requires an explicit edit. Population seeds have no ownership of terrain seeds/payloads. Unbound cities keep their centered-grid behavior.

## Reference rendering and connected caches

Map Debugger uses `LandscapeReferenceCity`: schematic grid, extent, road centerlines, footprint/reservation outlines and existing editor overlays. Its persistent notice identifies a reference plan and points to Landscape Fabrication for terrain. It creates no flat terrain, roads, fabricated buildings, trees, slabs, collision, visibility or lighting bakes. Private resources are disposed on replacement/exit. It is never installed as the shared gameplay city.

The production `City` constructor refuses bound input before geometry allocation or `CityInputPlans` access. Resolved illumination export refuses it before source extraction. Static visibility returns `landscape_binding_unsupported` before any payload fetch/activation. Its existing canonical city hash also includes binding-bearing authored/resolved specs, so binding changes affect identity. Matching flat parcel IDs/dimensions cannot authorize landscape caches.

Legacy cache algorithms and keys are unchanged. Future terrain-aware adapters must declare support and include terrain dependencies, transform/contact policy and algorithm/schema versions in identity; removing these refusals alone is insufficient. See [planning reports and dependencies](LANDSCAPE_PLANNING_REPORTS.md).

## Reservations and future placement

`cityReservationsToLandscapeConstraints(binding,map.reservations)` transforms each resolved single footprint loop, preserves its ID, and returns `{id,classification:'reservation',shape:{type:'footprint',region}}`. Duplicate IDs or ambiguous multiple loops fail. The adapter does not inflate/reconstruct reservations. Canonical reservation `yawDeg` controls consumer pose; the reserved rectangle remains axis-aligned. Only the landscape binding rotates that footprint. Clearance and parcel limits remain owned by the construction planner.

Future placement must explicitly select terrain-relative/absolute elevation, vertical offset, upright/surface-normal alignment, footprint/corridor accuracy and unavailable-data policy. Dependent placements record terrain identity/contact footprint; intersecting edits make them stale. Foundations needing flat/graded pads submit explicit terrain batches and resolve against the published revision. Adding/removing buildings never alters terrain implicitly. Road surfaces, foundation/collision adapters, vegetation/exclusions and traction remain future work; see [construction placement](../city/construction_placement.md).

## Verification

`tests/node/unit/landscape_city_binding.test.js` covers retained identity, invalid data/paths/capabilities, nonzero origins/yaw/Y conversion, partial tiles, actual CityMap and JS module roundtrips, stable seed/dimension behavior, shrink refusal, disabled entries, reservation transforms and renderer-free native sampling. Existing city map/placement/spec tests remain regression gates.

`tests/headless/e2e/landscape_city_binding.pwtest.js` exercises real Map Debugger load/apply/settings/rendered toggle/export/import/reload and City/PVS/illumination refusal. Its tiny routed test document reuses the canonical importmap without expanding server access. Evidence belongs under `tests/artifacts/screens/landscape/ai576/d6/city-binding/`.

The fixture keeps its AI 576 pin. The nature pass (`materials-a7f93a9…`, `manifest.12fc8d5c….json`) and AI577 D1a
(`materials-bfcf20f7…`, `manifest.496f91b9….json`) published material-only revisions: only the landscape revision and the soil
material IDs differ from the pinned snapshot. The strict pin refuses both; `landscape_city_binding.test.js` proves the refusals,
records that difference (the review basis a future explicit rebind would cite) and validates the explicit rebind path.
