# Dirt-strip default and bake compatibility

## Cause

Disabling `asphaltNoise.livedIn.sidewalkGrassEdgeStrip.enabled` changes the resolved
city geometry/material source. The installed `ai553.cycles.surface.complete512.v6`
publication was generated with the strip enabled. A fresh default browser reports
`indirect_irradiance_source_mismatch`, `causeState: stale`, and live fallback.

The enhanced baker reconstructs the strip's procedural alpha coverage and includes
it as a static transport participant. This is a real source change, not an invalid
hash comparison. Keep source, package, coverage and publication gates intact.

## Resolution and validation

- [x] Retain the requested disabled default.
- [x] Confirm the mismatched state in the actual game and preserve its screenshot.
- [x] Rebuild the matching full-city source, shadow parent, sky and bounce maps.
- [x] Retain 4096px pages, 0.33m texels, 512 samples, and the calibrated 55-degree sun.
- [x] Validate the candidate in all five comparison poses and through lighting transitions.
- [x] Install only after native calibration and candidate validation pass.
- [x] Restore matching fine-shadow detail and validate its publication.
- [x] Capture the user's latest pose with baked illumination actually active.

## Evidence

The initial failed comparison and explicit live-fallback capture are under
`tests/artifacts/screens/ai562_acesfilmic_reference_matching/pose_comparison_20260912_southwest*`.
The fallback capture retained the authored defaults; no incompatible bake was forced.

The first rebuild attempt, `run-1789191130325-2996-daed7904`, stopped at the source
exporter's request-failure gate after an aborted bus-model request. It produced no
publishable candidate. A fresh retry uses the same validation gates.

The replacement is staged in
`tests/artifacts/screens/ai556_bake_framework/run-1789191264829-27048-f7f9a013`.
It uses the registered `lighting/illumination` target with 512 samples, OPTIX,
0.33m texels, and `ai527.sun.az045.el55`. Preparation retains 10 4096px pages,
1,903,239 receiver triangles, and 1,382,871 charts. Native foliage parity passed
all 124 occupied samples with zero depth mismatches (maximum depth error
0.00003052m). Installed indexes remain unchanged until candidate validation.

The replacement resolved source is
`c19801f9fb7ba873960e86e3eb3fffb823768f768bfe19d3d234f8ae50090fe5`;
its indirect source is
`10a79cce7b3471a4fbf663b60290df400b7339bda340555cb5369d87278aa149`.
The static-sun channel source itself is unchanged, but the parent and streamed
detail publication also authenticate the complete resolved source. Regenerate
and validate that publication rather than editing its hashes.

The full replacement completed all 11 validation stages in 4,246.1 seconds
(70 minutes 46 seconds). The bounce and sky jobs took 1,458.1 and 1,203.0 seconds
respectively. Both used OptiX; all 10 pages passed their authenticated receipts.
The fresh native calibration check under
`tests/artifacts/screens/ai562_acesfilmic_reference_matching/dirt_strip_native_20260912`
passed all 14 checks in 6.5 seconds.

`dirt_strip_capture_20260912` under the same reference-matching artifact directory
validated all five poses in 330.4 seconds. Every pose reported `active`, effective
mode `baked`, indirect enabled, and activation blend 1. Transition checks recorded
zero world dropouts and stable program, texture and geometry counts. The worst
measured transition frame was 512.1ms (below the existing 2000ms publication gate;
this does not establish a stutter-free startup or route benchmark).

The maintained installation job passed in 9.3 seconds, with backups and receipt in
`dirt_strip_install_20260912`. The installed receiver directory is
`c1ac105133a666a0b261f5fe1f6ee4484cf31d847c075166dec997194660e444`.

## Installed fine shadows and final pose

The registered streamed city job generated all 2,016 matching 3x detail pages in
332.2 seconds under `tests/artifacts/screens/illumination_547/dirt_strip_city_20260912`.
The corresponding `dirt_strip_review_20260912` passed 12 parent/detail measurements
in two fresh browser processes (306.2 seconds). Every pass retained baked indirect
illumination. The corrupt-page test reported four failures, zero resident detail
pages, and effective mode `baked`, preserving the valid parent shadow map.

Across the six passes per variant, mean GPU medians were 10.112ms for the parent
and 11.380ms with detail; maximum logical detail texture allocation was 51.765MiB.
These are measurements at the supplied southwest pose, not a route benchmark.
The maintained publisher authenticated and installed the detail in 30.9 seconds.

Final evidence: `tests/artifacts/screens/illumination_547/dirt_strip_review_20260912/streamed.png`
and `review.json`. The recorded bus/camera transforms match the user's supplied
pose (within quaternion normalization precision). With no saved settings, runtime
reports requested mode `auto`, effective mode `baked`, state `active`, no fallback
reason, indirect illumination enabled, and the new resolved source hash. The
publisher validates the installed copy against the reviewed manifest before
switching the streaming index. The dirt-strip disabled default remains intact.

`git diff --check` passed. This repair installs compatible local bake assets; it
does not bypass validation or claim to eliminate remaining game/Cycles differences.
