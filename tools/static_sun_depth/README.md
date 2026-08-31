# Static-sun depth fixture compiler

This offline AI 531 tool converts one strictly validated AI 529
`static_sun_depth` intermediate from canonical lower-left RGBA32F
`(light-space x, light-space y, positive depth, occupancy)` into a guarded,
content-addressed RG8 packed-depth fixture artifact.

It is intentionally a fixture compiler, not a production-cache claim. The
checked AI 529 profiles render a 32 x 32 proof scene even when the resolved city
was reconstructed in full. The tool rejects that proof unless `--fixture` is
present, and every emitted definition/report repeats:

- `artifactClass: "fixture"`;
- `productionEligible: false`; and
- `ai530DirectlyPackable: false`; AI 531 registers RG8 transport/runtime
  support, but this fixture definition is not itself an `.ilpkg`, production
  tile-array descriptor, or city-ready payload.

## Run

From the repository root:

```powershell
node tools/static_sun_depth/run.mjs `
  --input tests/artifacts/illumination_529/full_reconstruction_final/runs/proof_cpu_12.v1/run-01/promoted/3a5e67da49d6a0f5c3ba9130d551ae828c990910027ce8b6497d97ca1f499ac3/intermediate_manifest.json `
  --output-root tests/artifacts/illumination_531/static_sun_depth `
  --guard-pixels 2 `
  --run-id proof-cpu12-fixture `
  --fixture
```

Omitting `--fixture` for this input exits nonzero before creating a staging
directory. Run `node tools/static_sun_depth/run.mjs --help` for the compact CLI
reference.

## Input validation

The tool uses the AI 529 common-intermediate validator rather than Blender
receipts or sidecars. Before encoding, it:

- requires exact canonical manifest JSON and the pinned Blender 5.2.1/Cycles
  CPU compiler identity;
- rehashes all manifest-declared raw EXR and canonical files;
- requires exactly one `static_sun_depth` output;
- validates the complete canonical proof descriptor, component order,
  orthographic camera, bounds, clip range, zero empty sentinel, binary
  occupancy, nearest-visibility rule, and deterministic alpha silhouette
  declaration;
- requires finite occupied x/y/depth values within the declared projection;
  and
- snapshots the selected manifest, EXR, and canonical input again immediately
  before atomic promotion to close input-change races.

Fractional occupancy, non-finite values, nonzero empty sentinels, out-of-bounds
positions, and occupied depths outside near/far are fatal. There is no clamping
or material fallback for invalid source data.

## Encoding and guards

Occupied depths map the closed near/far interval to integer codes `0..65534`
with round-to-nearest quantization. Code `65535` is reserved exclusively for an
empty texel. RG bytes are stored as R = most-significant byte and G =
least-significant byte:

```text
code = (R << 8) | G
depthMeters = nearMeters + (code / 65534) * (farMeters - nearMeters)
```

The single fixture tile receives the configured number of guards on all four
sides under `copy-adjacent-clamp-exterior-v1`. A production multi-tile compiler
copies the owning adjacent interior at internal seams; this one-tile fixture
therefore clamps every exterior guard to its nearest interior edge texel. Tile
coordinates, stored/interior dimensions, light-space bounds, texel size, row
origin, mip level, encoding, and exact payload SHA-256 are recorded in
`channel_definition.json`.

## Atomic artifact

Output is staged and then renamed on the same volume into:

```text
<output-root>/
  staging/<content-sha256>.<run-id>.partial/
  promoted/<content-sha256>/
    artifact_manifest.json
    channel_definition.json
    metrics.json
    payload/static_sun_depth.tile_0000_0000.mip_0.rg8
```

Existing content addresses are never overwritten. Each file has an ordinary
raw SHA-256. The directory identity is a domain-separated SHA-256 of canonical
source provenance plus the exact file inventory. The complete stage is
rehashed and semantically validated before rename, then validated once more at
the promoted path.

`metrics.json` contains deterministic tables for exact input/output/guard bytes,
quantization unit and measured error, occupied/empty counts, compiler logical
working-set bytes, and projected RG8 runtime logical residency. Physical GPU
residency is explicitly `not_measured`; this offline tool and WebGL cannot
measure it.

The promoted fixture artifact is suitable for deterministic unit/headless
integration. It is not an `.ilpkg`, a measured production city layout, or a
multi-tile residency result. AI 531 registers the RG8 vocabulary independently;
the artifact remains explicitly non-packable until a caller constructs and
validates the complete production channel/package metadata.
