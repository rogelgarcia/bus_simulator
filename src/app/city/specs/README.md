# City specs

Source of truth:
- `src/app/city/specs/*.js` modules are the authoritative city spec definitions consumed by the runtime (see `CitySpecRegistry.js`).

Generated artifacts (not part of runtime source):
- Export specs to JSON under `tests/artifacts/` for tooling/inspection:
  - `node tools/city_spec_exporter/run.mjs`
  - Writes `tests/artifacts/city_specs/city_spec_bigcity.json`
