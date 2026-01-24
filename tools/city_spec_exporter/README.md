# citySpecExporter

Exports authoritative JS city specs to JSON artifacts under `tests/artifacts/` (deterministic, generated files).

## Run

- Write/update artifacts:
  - `node tools/city_spec_exporter/run.mjs`

- Check whether artifacts match:
  - `node tools/city_spec_exporter/run.mjs --check`

## Notes

- `src/app/city/specs/*.js` is the source of truth.
- JSON exports are generated artifacts and should not be edited by hand (they are gitignored under `tests/artifacts/`).
