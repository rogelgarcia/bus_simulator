# Illumination bake-input exporter

Exports the fully resolved gameplay city into the deterministic, self-describing
AI 528 illumination bake-input container. The exporter inspects the evaluated
Three.js scene in Chromium, after required asynchronous content is ready. It
does not run Blender, bake lighting, or change gameplay lighting.

## Run

```text
node tools/illumination_bake_exporter/run.mjs
```

Default outputs are generated, gitignored artifacts:

- `tests/artifacts/illumination_528/packages/bigcity2/default/representative_bigcity2.bsib`
- `tests/artifacts/illumination_528/reports/bigcity2/default/inventory.json`
- `tests/artifacts/illumination_528/reports/bigcity2/default/size_by_category_and_channel.json`
- `tests/artifacts/illumination_528/reports/bigcity2/default/source_hash_sensitivity.json`
- `tests/artifacts/illumination_528/reports/bigcity2/default/round_trip.json`
- `tests/artifacts/illumination_528/reports/bigcity2/default/validation.json`
- `tests/artifacts/illumination_528/reports/bigcity2/default/export_metrics.json`
- `tests/artifacts/illumination_528/reports/bigcity2/default/determinism.json`

Useful options:

```text
node tools/illumination_bake_exporter/run.mjs --repeat 2
node tools/illumination_bake_exporter/run.mjs --output tests/artifacts/illumination_528/packages/bigcity2/candidate/candidate.bsib --reports tests/artifacts/illumination_528/reports/bigcity2/candidate
node tools/illumination_bake_exporter/run.mjs --url http://127.0.0.1:4173
node tools/illumination_bake_exporter/run.mjs --validate tests/artifacts/illumination_528/packages/bigcity2/default/representative_bigcity2.bsib
```

`PLAYWRIGHT_EXECUTABLE_PATH` may select an installed Chromium/Chrome binary.
Without `--url`, the tool starts the repository static server on a free local
port. Generated packages and reports must remain under approved asset or
artifact locations; the default representative output intentionally remains an
artifact until a later AI owns shipped runtime assets.

## Determinism and authority

The v1 container uses canonical sorted-key UTF-8 JSON and exact little-endian
typed buffers. Stable source IDs, provenance, instance transforms, material
groups, texture/alpha inputs, participant/caster/receiver semantics, and separate SHA-256
freshness domains are preserved. GLB is not the canonical source package: its
exporter/container normalization does not retain every custom attribute and
identity contract with stable bytes. A later diagnostic GLB derivative may be
created from this authoritative package.

The exporter constructs two independent, fully prewarmed production gameplay
cities by default and requires their canonical manifests, inventories, source
hashes, and complete package bytes to match. The already-running city supplies
the canonical configuration/source-record check and evaluated lighting-profile
provenance; its geometry is not exported because optional ornament preload can
complete after its synchronous construction.

The browser-side semantic pass parses the built package and compares its
canonical manifest and every logical buffer byte with the fully prewarmed
Three.js source used for that export. After download, a separate Node-side
semantic validator reads only the downloaded bytes, verifies the container and
every binary digest, rebuilds geometry/topology/bounds/transforms/directions and
all freshness projections, and only then promotes the staged package. That
package-only pass explicitly leaves comparison with an already-running runtime
inventory unperformed; AI 530 must perform that check before eventual runtime
activation.

Before launching Chromium, the tool runs the source-hash sensitivity unit test
and records its actual command/status in `source_hash_sensitivity.json`; a
failing sensitivity test aborts the export.

`--repeat` accepts 2 through 10 and never permits fewer than two independent
clean rebuilds. `--output` and `--reports` must stay below
`tests/artifacts/illumination_528/`.
