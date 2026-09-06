# Visibility bake

Use `node tools/bake_visibility/run.mjs`. The shared configuration, dry-run,
checkpoints, cancellation and optional `--publish` are described in
[`../baking/README.md`](../baking/README.md).

This adapter runs `static_visibility_baker/run.mjs` against current BigCity2 and
stages its table/report. The existing native-resolution zero-miss validation must
pass before publication to `src/app/city/visibility/bakes/bigcity2.v1.json`.
It reuses the shared current-city source identity for checkpoint freshness.
SSAO/GTAO are runtime effects and do not belong to this offline branch.
