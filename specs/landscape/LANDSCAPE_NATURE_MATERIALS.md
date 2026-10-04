# Natural coastal materials

This document records the original nature pass and its retained evidence. AI577
D1a subsequently replaces unsuitable repeating base materials and adds relief
transitions; its current quality contract and source audit are in
[LANDSCAPE_BASE_MATERIALS.md](LANDSCAPE_BASE_MATERIALS.md). The original beach
appearance and all historical snapshots described below remain retained.

The October 2026 nature pass binds beach soil to `pbr.aerial_beach_01` and uses
natural ground presentation for the imported urban/road/runway planning areas.
It adds no city objects and changes no source heights or land-cover bytes.
Camera controls are documented in [LANDSCAPE_VIEWER.md](LANDSCAPE_VIEWER.md);
mask interpretation and texture transitions remain under
[LANDSCAPE_APPEARANCE.md](LANDSCAPE_APPEARANCE.md) and
[LANDSCAPE_APPEARANCE_RUNTIME.md](LANDSCAPE_APPEARANCE_RUNTIME.md).

## Beach asset and publication

[Aerial Beach 01](https://polyhaven.com/a/aerial_beach_01), by Rob Tuytel,
was downloaded from the official Poly Haven file API on 2026-10-03. Poly Haven
licenses its texture assets under [CC0](https://polyhaven.com/license).
The retained 1K diffuse JPEG, OpenGL normal PNG and AO/roughness/metalness PNG
are unchanged originals. Their individual URLs, byte lengths and SHA-256 hashes
are recorded in `assets/public/pbr/aerial_beach_01/pbr.material.config.js`.
The catalog retains the documented 30-meter physical width. Since AI577 D4 the viewer samples it
at that period at every distance; stochastic tiling and the landscape-scale variation field are
display treatments, not additional source resolution.

The material is installed in the shared public game PBR catalog. Its correction
config uses neutral albedo, 0.7 normal strength, nonmetal response and matte
0.65–0.98 roughness through the existing resolver. These are authored settings;
no automatic calibration or measured physical accuracy is asserted.

Raw source maps follow the existing local-only PBR asset policy. Tracked bounded
runtime pages make the landscape viewer independent of those raw files. To
reprepare, retain/download the source files identified by catalog metadata and run:

```sh
node tools/bake.mjs --target landscape/appearance --publish
```

Use the existing shared `tools/baking/blender.local.json` Python configuration.
The registered leaf validates sources, filtering, normals, byte limits and hashes,
then publishes immutable pages before switching the appearance manifest. The
new sand contributes nine pages across 32/128/512 tiers; each request is at most
1 MiB. The other five soil materials reuse their existing page hashes.

The material-only terrain snapshot is
`manifest.12fc8d5c72fa47bd41946c98a8acced91b70738a5c6da469a08843683dc0f95b.json`,
revision `materials-a7f93a903d6500c4fa79d2c2`. Its only differences from the original
hierarchy snapshot are the sand material ID and landscape revision. Current
`manifest.json` initially points to these bytes; future authoring can advance it.
All original immutable snapshots and the city fixture's original binding remain
retained.

The matching appearance snapshot is
`appearance/manifest.aec36e5b53837b67b6316803460980d4b805ce17bc8db7a1919f954bc4781b0b.json`,
revision `appearance-532fbfe060154d1d94ef549d`. The retained-source license for the
user-supplied coastal ZIP is unchanged; the new sand's CC0 terms apply to that
material, not to the entire terrain package or other materials.

`tests/node/unit/landscape_nature_assets.test.js` authenticates both snapshots,
proves the terrain-only difference is a material binding, checks CC0 source
metadata against bake provenance, and authenticates all nine sand pages.
The new bake receipt is under
`tests/artifacts/screens/landscape/nature/appearance-validation.json`.
Historical D7 performance evidence predates this shader/material pass and must
not be presented as measurements of the new appearance.

AI577 D4 adds a native 1024 tier of Aerial Beach 01 (29.3 mm per texel) and the Ground054 micro
layer for sand and seabed in the multiscale companion
([LANDSCAPE_APPEARANCE.md](LANDSCAPE_APPEARANCE.md)); the sand pages above are unchanged. The
source's 1K JPEG base color shows 8×8 blocking at 1024 (block-boundary steps 2.04× the interior
step, 1.15× at 512); near the camera the micro luminance masks it. Removing it requires a
lossless sand source, which would change the accepted sand bytes, or a declared deblocking step.

## Nature-pass performance

The existing 11-stop route was rerun on 2026-10-03 with the natural shader,
55-degree default camera, new sand pages and worker-infill accounting. It uses
30 warm-up frames and 120 sampled frames per stop: 1,320 settled frames for
each cold/warm run, 5,280 total. Hardware was Ryzen 5 9600X, RTX 3060 through
ANGLE/D3D11 and Chromium 151.0.7922.34. The viewport was 1920×1080 at DPR 1,
with a 1920×1056 drawing buffer below the shared performance bar.

| CPU / estimated GPU budget MiB | Run | Mean FPS | Frame median / p95 ms | GPU median / p95 ms | Controlled CPU / estimated GPU lifetime peak MiB |
| --- | --- | ---: | --- | --- | --- |
| 128 / 64 | Cold | 59.99 | 16.70 / 16.80 | 3.20 / 5.63 | 99.58 / 63.82 |
| 128 / 64 | Warm | 59.99 | 16.70 / 16.80 | 3.21 / 5.62 | 99.58 / 63.82 |
| 48 / 24 | Cold | 59.99 | 16.70 / 16.80 | 2.96 / 5.31 | 38.67 / 23.77 |
| 48 / 24 | Warm | 59.99 | 16.70 / 16.80 | 2.96 / 5.26 | 38.67 / 23.77 |

These are measurements of settled windows on this machine, not a portable FPS
guarantee. Loading and travel are recorded separately; cold default startup
took 4,174.50 ms to coarse coverage and 4,931.10 ms to settled readiness.
CPU figures cover controlled buffers/reservations, not total browser heap;
GPU figures estimate allocations, not measured VRAM. Warm high-water marks
include the preceding cold run. Quality falls back within the declared budget.
No full-resolution resident reference was rendered.

Set `LANDSCAPE_EVIDENCE_PHASE=nature` when running
`tests/headless/e2e/landscape_performance.pwtest.js` to retain follow-up evidence
under `tests/artifacts/screens/landscape/nature/performance/`. That folder contains
the full report, per-frame samples, network receipts and route screenshots.
