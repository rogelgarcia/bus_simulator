# DONE — AI 553 complete baked illumination coverage and image repairs

# Problem

AI 548 is marked complete, but its installed preview has incomplete receiver
coverage, inconsistent grass-cell brightness and shadow tones, missing platform
sides, dark building sections, and sidewalk artifacts. The follow-up coverage
contract correctly rejects incomplete new bakes; it has not repaired the installed
images. The present per-plane chart layout is too expensive for full coverage,
oversized faces cannot fit a page, and some static materials lack transport support.

# Request

Repair the enhanced baked illumination path and produce a validated replacement
bake. Preserve the independent original engine, existing AI 548 opt-in toggle,
linked direct/indirect controls and cached maps when disabled. Use the installed
Blender in isolated headless mode; do not download another installation.

## Requirements

- [x] Require complete eligible receiver coverage and explicit material exclusions;
  reject focus, face-size and page-budget selection that silently drops surfaces.
- [x] Verify in Blender that supported non-lightmapped static objects remain present
  for occlusion and colored bounce, independently of runtime lighting reception.
- [x] Replace inefficient chart construction and handle oversized surfaces without
  excluding their faces. Record full-scene coverage and actual memory costs.
- [x] Resolve missing static transport semantics explicitly, including materials
  that will continue to use live lighting. Do not omit objects to make validation pass.
- [x] Correct direct/indirect composition and shading-normal behavior. Apply static
  and moving shadows once each, with consistent visibility across receiver types.
- [x] Validate actual raster coverage in addition to UV inventory. Give narrow
  details independent sample footprints where the connected chart has no interior
  texel. Keep every face, authenticate any additional page packages, and report
  the resulting memory cost.
- [x] Repair the reported incomplete platform, mismatched ground cells, dark facade
  sections and sidewalk streaks. Treat overlapping geometry as a geometry problem.
- [x] Bake and inspect a new candidate; validate matched platform, curb, ground-cell
  and facade views with channels isolated before publishing it.
- [x] Verify startup, cached toggles and stable program/resource counts, and measure
  before/after performance under the same camera and graphics settings.

## Constraints

Selection is defined by resolved source roles and supported material semantics,
not location, view direction, an asset-name allowlist, or whichever charts fit.
All eligible faces and instances must be covered. Keep static non-receivers in the
bake scene, while moving objects remain outside the static bake.

Preserve the existing high-resolution visibility cache. A different density for
smooth indirect illumination must be explicit in the profile and justified with
matched visual evidence; never disguise reduced resolution as an implementation
performance gain. Longer sampling addresses noise, not missing geometry or invalid
lighting composition. Do not tune exposure/material color to hide inconsistencies.

Keep the existing preview warning until image acceptance passes. Do not modify
the historical AI 548 completed checklist. Full architectural-glass appearance,
vehicle GI probes, reflection probes and interior authoring remain in AI 549–552;
this repair owns the source transport required by the current static bake.

## Evidence

- `tests/artifacts/screens/illumination_consistency/report.md`
- `tests/artifacts/screens/illumination_consistency/complete-coverage-summary.md`
- New evidence: `tests/artifacts/screens/illumination_553/`
- Specification: `specs/graphics/receiver_lightmaps.md`

### Initial implementation and candidate history

- Complete opaque diffuse reception: 1,904,820 triangles, including all 448 ground
  instances and 40/40 starting-platform triangles. Alpha receivers remain live.
- Deterministic connected UV islands, explicit singular-projection fallback,
  minimum rasterizable island footprint, stable packing, and no budget truncation.
- Three 4096² pages, 0.5 m indirect density, two explicit mip levels and 64 samples.
  Existing 4 cm static sun visibility supplies direct lighting consistently.
- Primary white diffuse sampling preserves source PBR materials on secondary rays;
  alpha participants, vertex colors, color factors, roughness/metalness and normal/bump
  inputs contribute to transport. Opaque depth proxies do not override alpha bounce.
- Hardware-filtered RGB9E5 HDR, exact row-sharded float32 coordinates, full-source
  compatibility and inherited original/enhanced cache lifecycle.
- CPU and RTX 3060 OptiX fixture renders pass; original directional shader tests,
  complete scalar/shared-shadow GPU tests and 50 focused Node tests pass.
- Full-scene image acceptance and performance measurements are still pending;
  the installed historical preview has not been replaced yet.

### Raster acceptance follow-up

The initial three-page candidate completed in 583.58 seconds and passed runtime
source checks, channel comparisons and six cached off/on cycles. It removed the
reported grass-cell boundary and large curb patch in the captured views, and lit
the platform sides. It is not accepted for publication: a centroid audit found
609,162 triangles sampling unwritten raster texels, predominantly narrow branches
and facade details. UV inventory completeness alone did not detect this defect.

The revised planner tests actual UV raster footprints, splits faces without a
nearby interior sample, aligns their centroid to a pixel center, and retains every
source triangle. It requires seven 4096² pages at the same nominal indirect density.
Additional pages travel in packages authenticated by the root package; individual
containers retain the existing 512 MiB limit. The revised bake and image acceptance
are pending. No performance improvement is established by the variable first-run
timings.

## Final implementation and acceptance — 2026-09-05

The three-page and seven-page candidates above were rejected. The final layout
requires each face to own its centroid sample, preventing neighboring faces from
masking missing coverage. Nine 4096² pages cover all 1,904,820 eligible triangles
and 1,757,473 charts. No chart is empty; every triangle center is written.
Chart-isolated padding fills raw edge gaps, preserves valid black samples and
regenerates explicit mips. The mapping authenticates the exact processed page
hashes; publication and runtime reject missing or inconsistent raster evidence.

The enhanced renderer also subtracts same-material, same-facing coplanar overlap
from private geometry, preserving the surface union and interpolating source
attributes/lightmap coordinates. At the reported curb point, source triangles
11442 and 11521 become one rendered surface. The original geometry is restored
on disable. Neither the original AI 533 publication nor the live engine was replaced.

Installed enhanced profile: `ai553.cycles.surface.complete64.v2`, identity
`20744ee4a1a8f9bccf5837f64f49b4e2f5e0366074e3c01290dd85d279697898`.
The existing Blender 5.2.1 OptiX installation took 633.77 seconds for the two
64-sample/four-bounce passes and reconstruction. Package transfer is 175.41 MiB.

### Comparable performance

RTX 3060, Ryzen 5 9600X, Windows/Chrome 151, D3D11, 3520×1624, pixel ratio 1,
default lighting, high moving-shadow resolution and both illumination channels on.
Camera [-35,18,39] looks at [-47,1,21]. Frozen simulation; city visibility/render
updates remain active. Three alternating rounds per mode, 60 warmup frames and
240 measured frames each: 720 frame intervals and 708 GPU timer samples per mode,
no disjoint events. FPS is derived from mean frame interval; memory below counts
the active lighting resources, excluding geometry and other cached banks.

| Mode | Mean frame ms | FPS | Mean GPU ms | GPU p95 ms | Calls | Triangles | Lighting GPU MiB |
|---|---:|---:|---:|---:|---:|---:|---:|
| Original AI 533 | 29.75 | 33.6 | 28.95 | 29.85 | 630 | 1,102,879 | 347.00 |
| Previous AI 548 | 27.94 | 35.8 | 27.20 | 27.99 | 621 | 830,322 | 344.09 |
| AI 553 repair | 28.20 | 35.5 | 27.44 | 28.27 | 621 | 877,286 | 817.88 |

The repair costs approximately 0.25 ms more GPU time than the previous enhancement
in this view; no new FPS improvement is claimed. Full coverage increases memory,
and overlap clipping increases triangle count without adding draw calls. Earlier
runs varied substantially, so these results do not establish whole-route performance.

### Validation and limitations

65 focused Node tests, GPU lighting/HDR-mip and geometry-interpolation tests, and
authenticated page-shard/resource-lifecycle tests pass. Full-city and fresh
installed-URL tests pass. Matched screenshots verify platform sides, facade/ground
coverage and curb streak removal. Six cached toggle cycles make no new package
requests and keep program, texture and geometry counts stable. The original index
SHA-256 and installed package bytes were verified.

The warning remains: this is a first-quality preview. At 64 samples and nominal
0.5 m indirect density, deep shade is visibly mottled and acute chart tips may need
substantial nearest-sample extension. Scalar indirect lighting omits the unstable
affine normal-direction approximation; runtime normal/bump maps retain direct PBR
response. Glass stays live and its appearance remains AI 549 work; AI 550–552 retain
vehicle GI, reflection and interior scope. These limits are explicit, not hidden by
material-color or exposure adjustments.

Evidence: `tests/artifacts/screens/illumination_553/report-final.md`,
`summary-final.json`, `installed-proof.json`, `validation-final/` and
`validation-installed/`. Code is not committed by this implementation pass.

## On completion

- Mark this document DONE in the first line and rename it within `prompts/` to
  `AI_DONE_graphics_553_MATERIAL_complete_baked_illumination_coverage_and_image_repairs_DONE.md`.
- Do not archive automatically or commit unless the user requests it.
- Summarize completed changes and retain explicit limitations.
- Include a same-condition before/after performance table with frame time, FPS,
  GPU timing, draw calls, triangles and resident memory; identify hardware,
  resolution, settings, camera, warm-up, sample count and statistics. Unavailable
  metrics must say `not measured` with a reason. Projections do not establish gains.
- Keep captures, reports, logs and bake outputs in the gitignored artifact folder.
