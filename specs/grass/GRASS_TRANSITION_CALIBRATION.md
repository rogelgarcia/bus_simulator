# LOD4 transition calibration

## Decision

Accepted for gameplay on 2026-10-14. The Grass quality buttons select Flat,
Low, Medium, High (default), or Ultra; the three Auto presets use this shortening
method with terminal cutoffs 16/24, 18/36, and 22/42 m respectively.
The lab keeps the explicit `handoff=shorten` comparison URL.

The 2026-10-14 reach adjustment changes the shared fixed-patch defaults from
`0.6 / 0.8 / 8 / 16 / 24 m` to `0.6 / 0.8 / 8 / 18 / 36 m`.
LOD3's requested 10% extension was rounded from 17.6 to 18 m; LOD4's cutoff
increases by 50%, from 24 to 36 m. These are camera-to-ground distances in 3D.
This is a fixed-distance extension, with no screen-size selection or new fade
method. The shortened exit now spans 18–36 m; each blade shortens over 2.25 m,
with its start distributed over 18–33.75 m. Ground blends over 15.75–36 m.
The implementation and earlier calibration described below used 16–24 m;
their measurements remain historical. The live brightness and motion checks
derive their measured interval from the renderer's configured cutoffs.

Retain a separate lab option, `?grass=patches&handoff=shorten`, that scales blade
height toward its fixed root instead of translating or cutting the blade.
At ground-anchor distance `d`, including camera elevation, each blade uses a
stable phase `p` in `[0,1]`, hashed from its baked blade index and world tile.
Use `start = 16 + 7*p`, `s = smoothstep(start, start + 1, d)` and
`y = originalY * (1 - s)`. The ground litter-to-canopy blend uses
`smoothstep(15, 24, d)`. For custom LOD distances, the blade span and the ground
lead are one eighth of the terminal distance interval. No blade shortens before
16 m, all blades are gone by 24 m, and nearby blades no longer shorten together
as one moving ring. Baked bridge blades contain six consecutive vertices;
the endpoint regression validates that layout. This replaces the original
synchronized 16–24 m S-curve after the motion-seam reproduction below.
The roots and horizontal placement remain fixed. Original tip/root colors and
external shadow shading remain; the geometry gets shorter rather than losing
only bright tips or only dark roots. No extra texture samples or new assets.

The incoming LOD3-to-4 dissolve still operates over 13.6–16 m. Terminal opacity
and color dissolution remain disabled. At 24 m an explicit zero-height fragment
guard prevents residual MSAA samples along the field boundary; it does not
gradually discard fragments within the transition. Forced LOD4 bypasses both
height reduction and that endpoint guard. The shared renderer supports this
option; gameplay quality presets now select it explicitly, while the ordinary
lab URL retains its comparison default.

## Initial synchronized-profile research

1. Compare original trim/rise and 135 combinations of three geometry strategies,
   five curve biases (-0.6/-0.3/0/0.3/0.6), three ground starts (14/16/18 m), and
   three ground ends (20/21.6/24 m). Measure six fixed camera poses at 960×640:
   bus, close, forward, lower, reverse and diagonal. Reuse the same assets,
   geometry, tone mapping, exposure, camera and light for every comparison.
2. Refine shortening with 48 combinations: biases -0.45/-0.3/-0.15/0, ground
   starts 15/16/17/18 m and ends 22/23/24 m. Bias warps normalized distance `t`
   to `t + bias*t*(1-t)` before smoothstep. Positive bias cuts/shortens earlier.
3. Compare final candidates on 57 further samples: eight headings at heights
   3.5/6.883/9 m, plus 33 bus-height positions over 24 m forward through patch
   boundaries. Use different world offsets/headings from the sweep.
4. The lowest six-view RMS candidate (bias -0.3) had a 5.64% bright excess at
   9 m height; bias -0.15 still reached 5.17%. Symmetric smoothstep passed the
   5% bright/dark limits at every half-meter band in the expanded fixture.
   Keep the simpler curve rather than optimizing only the first six views.
5. The endpoint test found 29 residual pixels (83 differing color bytes) at
   the MSAA field edge with zero-height geometry. The explicit far-distance
   guard restores exact equality with forced LOD5, without moving roots.

## Initial measurements and limitations

For each pose, render forced LOD4, forced LOD5 and Auto. Project each pixel onto
the ground and average display luminance in 0.5 m annuli within a 12 m wide
central strip. The envelope measures excess over the brighter endpoint and
deficit below the darker endpoint. Ranking uses RMS relative deviation from
a smooth interpolation of the endpoint means over 16–24 m. That interpolation
is a calibration target, not proof of perceptual equivalence. Texture contrast,
silhouette and motion also require matched visual inspection.

Across the six calibration views, symmetric shortening has 1.63% RMS error
versus 6.47% for original trim and 4.60% for corrected rise. Tip cutting retains
dark stubble: at the lower camera its worst half-meter band is about 20% below
both endpoint means, a feature hidden by the earlier coarse two-meter averages.
Shortening is a better balance, but geometry still gives way to a flat texture;
this work does not establish a completely invisible handoff in every scene.

The geometry contract verifies exact forced-LOD4 and fully-hidden endpoint
pixels, zero movement uploads/allocations, stable resources and no GL errors.
The 57-pose regression enforces the 5% brightness envelope without changing
exposure, LOD endpoint colors or texture brightness globally.

The final expanded fixture measured at most 4.49% bright excess and 4.39% dark
deficit across the 24 angle/height poses. Its 33 bus-height forward samples had
at most 1.09% bright excess and 0.14% dark deficit.

## Initial forward performance

Two alternating passes per method on the RTX 3060 at 3814×1672, with full lab
lighting/postprocessing and 360 identical poses over 71.06 m per pass:

| Method | Mean whole-frame GPU | GPU p95 | Frame interval p95 | Intervals >33.5 ms |
| --- | --- | --- | --- | --- |
| Corrected rise | 5.38 ms | 6.07 ms | 16.8 ms | 0 / 718 |
| Cut tips | 5.36 ms | 6.16 ms | 16.8 ms | 0 / 718 |
| Shorten | 5.32 ms | 5.97 ms | 16.8 ms | 0 / 718 |

All 2,160 GPU samples were valid and disjoint-checked, with identical per-pose
draw/triangle counts, zero buffer/texture uploads, stable resources and no GL
errors. Shortening's paired mean GPU differences were -0.053 ms versus rise
and -0.035 ms versus trimming. These small differences do not establish a
meaningful speedup. This run was smooth in all methods; it does not isolate the
cause of the previous session's slowdown. Raw data is under
`benchmark/2026-10-14T00-46-21-700Z/` within the calibration artifacts.

## Reproduction and evidence

- Select `tests/headless/e2e/grass_patch_transition_calibration.pwtest.js` using
  `node tools/run_selected_test/run.mjs --set <path>`, then run the same runner.
  Use `GRASS_TRANSITION_SWEEP=refine` for the second grid. The test temporarily
  injects calibration uniforms through network routes; normal source defaults
  are not modified by running the sweep.
- `tests/headless/e2e/grass_patch_shorten_transition.pwtest.js` exercises the
  real renderer with no shader/source interception. The current fixture includes
  32 angle/height poses, 33 moving samples, the two reported camera poses, and
  24 additional offset/heading/elevation holdouts (91 total).
- `tests/headless/e2e/grass_patch_rise_transition.pwtest.js` checks the geometry
  contract and captures matched full-scene bus, field and close views.
  `GRASS_RISE_CAPTURE_MOTION=1` adds matched forward videos.
- `GRASS_LEAF_BUS_TRANSITION=shorten` selects the hardware bus-camera benchmark;
  use the existing opt-in/resolution settings in `tests/headless/perf/README.md`.
  Do not encode videos concurrently with GPU timing.

Generated sweep/refinement results, angle/movement data, comparisons and timed
laps live under `tests/artifacts/screens/grass/transition_calibration/`.
Full-scene images/videos and endpoint validation live under
`tests/artifacts/screens/grass/lod4_rise_transition/`. All are gitignored.

## Forward/reverse and curved-boundary follow-up

`tests/headless/e2e/grass_patch_shorten_motion.pwtest.js` compares dissolve and
shorten at 3814×1672, DPR 2, with the full lab lighting and postprocessing.
The six routes cover full bus framing, the same camera shifted onto the field,
and inner/outer curbs at both 18 m and 30 m bends. Every route travels 24 m
and returns along the same path. Curved routes rotate with the bend while
retaining the bus camera height and pitch. Baked leaf fill remains disabled.

The regression samples 121 poses per direction and checks nine corresponding
forward/return poses for matching whole-frame image hashes and patch placements.
It compares camera transforms, draw/triangle counts, lighting and package hashes
between methods, plus forced LOD4/LOD5 image hashes at the route midpoint.
Movement probes cover buffer and texture uploads, buffer allocation, GPU resource
counts and GL errors after route prewarming. Image hashing is a deterministic
return-path check; it does not measure perceptual continuity between poses.

The RTX 3060 run passed all 2,904 deterministic movement renders across the
twelve method/route combinations. All 108 return-pose checks matched, all twelve
forced-reference comparisons matched, and every route recorded zero buffer or
texture uploads, zero buffer allocations, stable resources and no GL errors.
Both gameplay cases also passed, tracking 36 grass buffers across six moving
coverage anchors with all six detail levels exercised.

Set `GRASS_SHORTEN_CAPTURE_MOTION=1` to add paired videos, approximately sixteen
seconds each: eight seconds forward and eight seconds reversing. Recording runs
separately after the deterministic upload/pixel checks so readback cannot create
artificial pauses in the clips. Prime the encoder on stationary frames before
recording: a cold first VP9 encode initially lost about 0.6 seconds from the bus
baseline, so that clip was recaptured and all twelve final durations verified.
These captures are not GPU timing benchmarks.
Use hardware Chrome and point `E2E_BASE_URL` at the grass worktree server.
Evidence lives in `tests/artifacts/screens/grass/shorten_motion/`, including
`validation.json`, full-resolution Auto/LOD4/LOD5 stills, paired videos, and the
generated `comparison.html` review page. Select this spec with the standard
`tools/run_selected_test/run.mjs` runner.

`grass_gameplay_patches.pwtest.js` now exercises both the ordinary dissolve path
and a test-only shortening override of `GameplayGrassRenderer.js`. The override
only modifies the browser's fetched module; application defaults are unchanged.
Both cases check immutable geometry buffers and attribute versions, stable
placements on reversal, all LODs, and GTAO/SSAO with alpha-test/exclude handling.
The candidate's gameplay evidence is saved under
`tests/artifacts/screens/grass/gameplay_patches/shorten/`.

The rebased checkout reproduced the existing 57-pose brightness limits: 4.49%
maximum bright excess and 4.39% maximum dark deficit. This does not extend the
5% claim to the new full-scene curved views, which use visual comparison and
deterministic return checks. No curve, shading or runtime default was tuned in
this follow-up. Visual acceptance remains open, and the prior session-to-session
whole-game slowdown remains unexplained.

## Moving seam reproduction and staggered shortening (2026-10-13)

Reported poses, in the lab's copy format `x y z yaw pitch roll` (degrees):

- `-12.668 6.883 -1.296 180 -19.206 0`
- `-12.668 10.654 34.478 180 -19.206 0`

The user confirms forward/backward travel makes the seam clearest. The higher
camera exposes the ring even when stopped. The prior 57-pose brightness and
return-hash checks did not establish motion continuity or cover this elevation.

Hypothesis: synchronized height changes create a coherent moving ring. The
focused repro `grass_patch_motion_seam.pwtest.js` holds the rendered camera
stationary and shifts only the grass distance camera by ±0.133333 m. This removes
perspective flow while isolating the distance-driven changes of one 30 Hz frame
at 8 m/s. It freezes height and ground independently, renders both forced
references, and measures mean absolute RGB change weighted by luminance divided
by mean brightness in 0.5 m annuli across a central 12 m strip. The canvas is
1200×1000; these percentages are resolution-specific diagnostic sensitivities.

| Toggle/experiment | Result and decision |
| --- | --- |
| Original synchronized profile | Peak sensitivity 10.71% lower / 9.18% higher, both around 20.5 m. The 6% repro limit fails. |
| Freeze height, retain ground motion | Mean sensitivity falls from 7.13% to 0.84% lower, and 6.25% to 0.88% higher. Height motion is the main contributor. |
| Freeze ground, retain height motion | Peak remains 10.00% lower / 8.34% higher. Ground blending alone is not the cause. |
| Freeze both | Nearly zero terminal change; a small incoming transition remains near 16 m. Forced LOD4 and LOD5 have zero change. |
| Broaden shortening to 0/4/6/8/10/12–24 m | Reduces the far ring but moves activity nearer, flattens nearby grass, and exceeds the brightness envelope. Rejected. |
| Compensate for the 5 mm surface depth | Does not reduce total motion; rejected. |
| Delay ground blending for broad height profiles | Trades excess brightness at high cameras for a dark band at low cameras; rejected. |
| Stagger individual blades, spans 1/2/4/6 m | The 1 m span distributes activity most evenly. Hashing the world tile and blade index keeps it fixed on reversal and patch reuse. |
| Ground start 15/15.5/16/17/18 m | A 15 m start coordinates the surface with the distributed blade heights while remaining inside the 5% bright/dark envelope. |

The retained patch adds seven shader lines and adjusts one ground-band expression.
It changes only the `shorten` option. No terminal opacity dissolve or projected
canopy-color blend is introduced; the incoming LOD3→4 transition remains intact.
The roots stay fixed and the existing 24 m fragment guard is retained.

The applied shader reduces peak sensitivity to **4.59% lower / 4.76% higher**
(57% / 48% reductions). Mean sensitivity is 3.58% / 3.60%. The repro passes
against the actual shader; only diagnostic camera/freeze uniforms are injected.
An early diagnostic route omitted the module's query string and therefore did
not intercept it. Those zero-change readings were discarded; the retained test
checks six material probes and nonzero Auto sensitivity to detect that failure.

The brightness regression now covers 91 poses: the 67 expanded calibration
samples plus 24 independent positions/headings at 4.75/8.25/12 m height and a
24.23° downward pitch. The steeper holdout pitch keeps the nearest measured
annulus in frame at 12 m; an initial 19.21° pitch had only 48 pixels there and
correctly failed the sample-count gate. All 91 final poses pass the unchanged
5% bright/dark limits and the >100-pixel requirement for every annulus. Maximum
bright excess is 2.22%; maximum dark deficit is 4.48%. The original synchronized
profile reached 6.50% bright excess at the reported higher pose.

Endpoint/layout checks pass: forced LOD4 pixels match the ordinary renderer,
the hidden endpoint exactly matches forced LOD5, bridge blades use six
consecutive vertices, and movement causes no uploads or resource allocations.
The full-resolution route regression now includes both reported poses (eight
routes, sixteen method/route combinations, 144 matching return samples).
All routes preserve immutable buffers and matched endpoint references. Both
gameplay cases, including the test-only shortening override, pass AO and motion
checks. Gameplay defaults remain unchanged.

The standard two-round GPU comparison passed with 2,160 disjoint-checked samples;
the staggered option averaged 6.04 ms (6.68 ms p95), with zero intervals over
33.5 ms. Because other methods varied noticeably between passes, a separate
original/staggered/staggered/original comparison used the same benchmark helper
and 360 identical poses per pass. Original shortening averaged 5.35 ms (6.67 ms
p95), versus 5.07 ms (6.34 ms p95) for staggered shortening. Both had 720 valid
GPU samples and no intervals over 33.5 ms. Individual pass means varied by
roughly 0.8–1.2 ms, so this does not establish a speedup. All movement upload
counters stayed zero. Timing data lives in `motion_seam/benchmark.json` and
`transition_calibration/benchmark/2026-10-14T02-15-18-140Z/results.json`.

Generated evidence is under `tests/artifacts/screens/grass/motion_seam/`:
`original-isolation.json`, rejected profile sweeps, stagger sweeps, current
`isolation.json`, and the matched `comparison.html` with before/after motion.
The same two camera transforms, lighting, assets, resolution and exposure are
used in each pair. The videos show 24 m forward and backward in sixteen seconds
at 3814×1672, DPR 2. Encoder warmup precedes each clip; GPU timing runs separately.
This is a measured reduction of the moving ring, not proof that geometry turning
into a flat texture is imperceptible. The lab candidate still needs visual acceptance.
