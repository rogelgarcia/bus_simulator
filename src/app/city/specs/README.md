# City specs

Source of truth:
- `src/app/city/specs/*.js` modules are the authoritative city spec definitions consumed by the runtime (see `CitySpecRegistry.js`).
  - When integrating new city specs from `downloads/`, copy/convert them into a JS module here (runtime must not depend on `downloads/`).

Generated artifacts (not part of runtime source):
- Export specs to JSON under `tests/artifacts/` for tooling/inspection:
  - `node tools/city_spec_exporter/run.mjs`
  - Writes `tests/artifacts/city_specs/city_spec_bigcity.json`

Placement model:
- Buildings and reservations may be authored as PARCELS (assigned squares +
  limits) instead of world coordinates. See `specs/city/construction_placement.md`
  and `src/app/city/placement/`.

Optional landscape references:
- `CoastalLandscapeCitySpec.js` / registry ID `coastal-landscape` is a runnable reference-plan fixture pinned to retained coastal terrain. Map Debugger preserves its binding, explicit origin, parcel and bus-start reservation through settings and export/reload.
- `CitySpecAuthoring.js` owns normalization/settings and executable JS export/import helpers used by the real editor. **Download JS** exports a module factory; JSON remains an inspection artifact.
- Bound cities open as labeled schematic reference plans. Gameplay rendering and flat-city bakes reject unsupported terrain input. See `specs/landscape/LANDSCAPE_CITY_BINDING.md` for coordinates, partial tiles, versioning and adapter boundaries.
