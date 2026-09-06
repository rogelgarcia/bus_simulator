# Lighting bake hierarchy

Run `node tools/bake_lighting/run.mjs` after the shared setup in
[`../baking/README.md`](../baking/README.md). All domain/leaf entry points use that
same configuration and resolve prerequisites automatically.

- `source/run.mjs`: complete current-city export and semantic validation.
- `shadows/candidates/run.mjs`: authenticated Blender candidate geometry.
- `shadows/cutouts/run.mjs`: maintained direct Depth24 foliage capture for selected sun profiles.
- `shadows/provisional/run.mjs`: compose opaque and foliage depth for validation.
- `shadows/parity/run.mjs`: native foliage parity evidence required before packing.
- `shadows/run.mjs`: existing static-sun depth compiler; candidate output preserves
  the live shadow index and the existing strict AI531 release gate.
- `occlusion/run.mjs`: independently authenticated, sun-free sky irradiance.
- `illumination/indirect/run.mjs`: diffuse bounce transport.
- `illumination/direct/run.mjs`: enhanced shared-sun reference, without another bake.
- `illumination/run.mjs`: prepare, bake separate passes, consolidate and authenticate.
- `preview_reference/run.mjs`: authenticate the installed historical comparison.
- `illumination/preview/run.mjs`: original scalar variant, including its actual
  separate direct pass at `illumination/preview/direct/run.mjs` and its sky pass at
  `occlusion/preview/run.mjs`.

The default lighting tree verifies the existing historical comparison packages
instead of attempting a new partial preview. Those explicit compatibility targets
retain strict coverage checks and reject the current complete city, which exceeds
the original four-page budget and scalar transport capabilities. The supported
full-city production path is enhanced illumination; no old selection heuristics
are restored.

Examples: `--samples 64 --device OPTIX` for enhanced passes;
`--profile ai527.sun.az045.el35` for shadows; `--dry-run` for an execution plan.
The enhanced defaults remain 896 samples, CPU, 4096px pages and complete receiver
coverage. The original preview remains 64 samples with its existing atlas policy.
Sky visibility/occlusion is not SSAO/GTAO or runtime static vertex AO.

Legacy implementations remain in `receiver_lightmaps`, `illumination_bake_exporter`
and `static_sun_depth`; these adapters reuse them. Receiver `--prepare-only true`
and independent Python `--pass` modes are internal phase boundaries. Missing or
altered pass pages cannot be consolidated. `publish.mjs --validate-only` performs
the same receiver authentication as publication without changing the live index.

See [`../../specs/tools/bake_framework.md`](../../specs/tools/bake_framework.md)
for provenance, registration and publication requirements.
