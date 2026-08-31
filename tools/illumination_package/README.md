# Illumination package tool

AI 530's package tool converts strictly validated AI 529 canonical intermediates into deterministic browser-loadable `.ilpkg` artifacts. It never packages OpenEXR container bytes and never needs Blender.

The format and lifecycle authority is [`specs/graphics/illumination_binary_package.md`](../../specs/graphics/illumination_binary_package.md).

## Commands

```powershell
node tools/illumination_package/run.mjs pack `
  --input tests/artifacts/illumination_529/<run>/promoted/<hash>/intermediate_manifest.json `
  --city-id bigcity2 `
  --lighting-profile-id default `
  --capability-profile-id development.static_sun_v1 `
  --output-root tests/artifacts/illumination_530/packages

node tools/illumination_package/run.mjs inspect --package <package.ilpkg>
node tools/illumination_package/run.mjs verify --package <package.ilpkg>
node tools/illumination_package/run.mjs promote `
  --package <package.ilpkg> `
  --artifact-root tests/artifacts/illumination_530/production `
  --run-id run-01

node tools/illumination_package/profile.mjs `
  --package <package.ilpkg> `
  --output tests/artifacts/illumination_530/reports/runtime_profile.json `
  --samples 20
```

`pack` re-parses the canonical intermediate manifest and rehashes every declared raw EXR and canonical float32 output before reading payload bytes. The default checked-in profile is [`profiles/uncompressed_rgba32f.v1.json`](profiles/uncompressed_rgba32f.v1.json): no compression, exact little-endian RGBA float32, lower-left rows, explicit base mip, zero alignment padding, and unpack alignment 1.

`inspect` fully verifies the artifact before returning its compact identity/channel/chunk summary. `verify` additionally applies any supplied city, lighting-profile, capability-profile, source-hash, compiler-signature, or runtime-capability expectations. Neither command trusts a sidecar.

`promote` fully verifies the package, writes a complete stage, verifies the staged copy, and atomically renames it into a previously absent content-addressed release directory. Existing releases are never overwritten. A failed or partial stage cannot replace a valid release.

`profile.mjs` runs one warmup followed by same-condition package load, WebGL2 upload, frame-boundary activation, deactivation, and safe-disposal samples. In that same real WebGL2 session it surveys deterministic 32x32 `rgba32f_le`, `rgba16f_le`, and `r8_unorm` texture upload/disposal costs and records float-linear, color-buffer-float, ETC, BPTC, ASTC, and S3TC extension availability. Compressed sizes and uploads remain explicitly unmeasured until a deterministic compiler-signed semantic encoder exists; uncompressed RGBA32F remains the correctness default because it preserves AI 529 canonical values without a transcode. The harness records mean/median/p90 timing and logical memory metrics in canonical JSON written by an atomic rename. It uses an installed headless Chromium and real WebGL2 context when available and never downloads a browser. If Chromium or WebGL2 is unavailable, it measures the real package/runtime with logical Node resources and labels unavailable browser and physical-GPU metrics with a reason.

Run `node tools/illumination_package/run.mjs <command> --help` for the exact flags.

## Generated outputs

Development outputs belong under `tests/artifacts/illumination_530/` and remain gitignored. A package release contains:

- `package.ilpkg`;
- canonical `manifest.json` sidecar;
- canonical `validation_report.json` with final file SHA-256, aggregate identity, sizes, and timing measurements.

Production binaries are generated/distributed artifacts, not tracked source. Deploy immutable packages at content-addressed URLs. A small revalidated catalog may point to the current hash, but runtime SHA-256 validation is still mandatory.

## Safety and limits

V1 enforces exact file/section/chunk lengths, 16-byte alignment, zero padding, non-overlap, bounds, stable inventories, channel/profile minimum sets, per-chunk and aggregate SHA-256, decoded-size formulas, and a 512 MiB hard file ceiling. Required unsupported channels or encodings reject activation; explicitly optional unknown channels can be skipped only by the V1 policy.

The browser fetch path streams under the 64 MiB default preactivation cap and a 384 MiB default peak logical CPU budget. It validates declared/observed length, fails closed without a bounded stream reader, reserves a bounded trust-boundary working set before parsing, counts oversized backing buffers, and snapshots mutable package bytes once before asynchronous integrity work. Per-generation reservations keep partial superseded allocations in the shared budget until they unwind; replacement loads also include active, staged, retiring, and safety-retained resource sets in their CPU/GPU baseline. A configured baked/auto load must provide live city, lighting-profile, capability-profile, and resolved-source expectations before any fetch; missing identity and missing packages remain quiet supported conditions.

No payload affects rendering until the graphics resource loader finishes capability and device-limit preflight, integrity, decode, upload, and prewarm and the mode controller commits the complete immutable set at a frame boundary.
