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

## Production live-shadow oracle

`production.mjs` builds the eight non-lab release profiles against the observed
effective Three r183 `single_high` directional-shadow allocation. The semantic
resolved-source channel is `bus-sim-static-sun-depth-source-v4`; the production
request is `ai531-static-sun-production-request-v4`, the raw Blender receipt is
`ai531-static-sun-production-render-receipt-v5`, and the normalized receipt is
`bus-sim-static-sun-depth-production-blender-receipt-v5`. All four contracts
carry the complete policy under `sampling: {bias, pcf}`. The exact policy is:

- capability `three-r183-single-high-effective-16384-v1`, with an effective
  shadow-map size of `16384 x 16384` texels and a `680 x 680` metre world extent;
- the five-tap Three r183 Vogel filter, interleaved-gradient-noise screen
  rotation, linear four-compare hardware taps, radius `1.5` texels, and the
  resulting `0.062255859375` metre world-space filter radius; and
- geometric receiver displacement of `0.0232` metres along the world normal,
  followed by a constant depth relief of `0.0697915` metres.

Each profile derives and records the source shadow-map right/up axes from its
exact sun direction using Three r183's world-up directional-camera convention.
The capability size/extent are repeated in `sampling.pcf` and must match
exactly. Legacy scalar-bias/box-PCF descriptors, the stale pre-profile
`8192 x 8192` allocation, and swapped source-map axes are rejected at every
production artifact, validation, and release-certification boundary.

The production request is also exact-density and phase locked. Its isotropic
pitch is exactly `680 / 16384 = 0.04150390625` metres, matching the live shadow
map one cache texel to one source texel. The rejected 65:64 candidate was
commensurate but did not satisfy strict parity. Every production tile therefore
has rectangular interior `[1870, 1821]`, four guards per edge, stored dimensions
`[1878, 1829]`, and tile size
`[77.6123046875, 75.57861328125]` metres. Bounds are anchored to
`absolute-stable-basis-texel-edge-lattice-v1`; the authenticated minimum bound,
stable-basis origin, and pitch must resolve to integral texel-edge coordinates
on both axes.

The 77-layer RG8 array is 6,869,724 bytes per guarded layer and
528,968,748 bytes (504.46 MiB) of exact payload. Canonical 64 MiB layer-window
partitioning yields nine chunks: eight 9-layer chunks followed by one 5-layer
chunk. The current package model is 529,189,392 bytes (504.67 MiB), leaving
7,681,520 bytes below the immutable 512 MiB package cap. This is modeled
accounting, not a measured production artifact.

Only `development.static_sun_v1` admits the corresponding static-sun logical
limits: 512 MiB steady CPU, 512 MiB steady GPU, 1536 MiB peak CPU, and 1024 MiB
peak GPU. The tier is internal and requires the transfer-owned production fetch
path during atomic replacement. Generic runtime defaults and player-selectable
promotion budgets are unchanged; this candidate still requires
reduction/streaming before player-facing promotion.

```powershell
node tools/static_sun_depth/production.mjs --repeat 2
```

## Authenticated residual fields

`calibrate_static_shadow_residual_field.mjs` applies a deliberately narrow
post-bake correction to an authenticated v9, v10, or already corrected v11
native field. It accepts only fresh one-case localization reports captured
from the genuine pre-activation gameplay renderer that contain native live-shadow depth
samples from the same package authority. A correction may fill an empty texel
or replace an occupied texel only with a finite, nonzero, nearer measured
depth. It cannot clear a texel, invent depth, accept a farther hit, or promote
its own output.

The resulting v11 receipt records every source report and five-image capture
set, package/certification hashes, caster class, exact global texel, old depth,
measured live depth, correction count, producer inventory, and inherited field
provenance. Promotion still requires a fresh exact occupancy/first-hit parity
artifact for every profile. Changing any listed producer invalidates old
Blender receipts and requires rebuilding the affected provisional/production
outputs; copied parity directories are likewise rejected because evidence
paths remain bound to their original authority.

Residual calibration is not a substitute for release validation. The strict
Lab and 197-case production runners remain authoritative, and a failed
production report cannot produce a release certificate. Normal gameplay also
continues to request the current shadow engine: baked activation is wired for
development validation but disabled by default.

## AI 531 validation runners

`validate_production.mjs` consumes the production package index and covers the
197 non-lab catalog cases. `validate_lab.mjs` consumes exactly the eight
`ILLUMINATION_LAB_VALIDATION_CASES` in the standalone Lab Scene:

Production RGB, missing-occluder, and seam metrics cover only eligible
static-world pixels. A deterministic depth-equality identity pass masks pixels
that are positively identified as registered non-City dynamic shadow
receivers; an aggregate empty mask is invalid. The runner separately proves
that the bus remains registered outside `City.group`, retains its live caster
inventory while static City casters are suppressed, is submitted to the cache
mode shadow pass, and changes visible City receiver pixels in a cast-shadow
on/off differential.

```powershell
node tools/static_sun_depth/validate_lab.mjs `
  --timing-contaminated-reason "concurrent processes and shared GPU contention"

node tools/static_sun_depth/validate_production.mjs `
  --timing-contaminated-reason "concurrent processes and shared GPU contention"
```

The lab runner creates an in-browser, four-layer guarded WebGL2 depth fixture
from the live static `lab_scene` city group, packages it through AI 530, and
activates the real `StaticSunDepthPipeline`. It is explicitly a test fixture:
`productionEligible` is false and it makes no Blender/Cycles provenance claim.
The dynamic bus lives outside static city caster ownership. Paired current/cache
PNGs and the strict zero-missing-occluder/seam report are written only below
`tests/artifacts/screens/illumination_531/lab/`. Timings are non-promotable
when the host or GPU is shared. In the current shared-process/shared-GPU
session, performance, load, decode, upload, residency, and wall-clock timing are
recorded as `not measured` for promotion. Correctness and strict-parity
evidence remain independently reviewable.

The Lab v3 and production v4 reports record every expected PNG as an exact
`{ path, byteLength, sha256 }` object. Before writing a releasable report, each
runner independently resolves every repository-relative path below
`tests/artifacts/screens/illumination_531/`, rejects symbolic links and
non-PNG payloads, requires the PNG IHDR to record the native `1280 x 720`
capture policy, and re-reads/re-hashes exactly 24 Lab or 591 production
captures. The Lab page uses a `1280 x 744` viewport so its `#game-canvas`
element remains exactly `1280 x 720`. Missing, extra, duplicate, traversing,
wrong-dimension, or tampered entries fail closed.

Final release certification requires independently recorded raw SHA-256 values
for both passed reports. It re-reads both reports and all 615 referenced PNGs,
reapplies the exact eight-Lab and 197-production catalogs and correctness
gates, and rejects legacy report schemas:

```powershell
node tools/static_sun_depth/certify_release.mjs `
  --lab-validation-report tests/artifacts/screens/illumination_531/lab/lab_validation_report.json `
  --lab-validation-report-sha256 <independently-recorded-lab-sha256> `
  --validation-report tests/artifacts/screens/illumination_531/production_validation_report.json `
  --validation-report-sha256 <independently-recorded-production-sha256>
```
