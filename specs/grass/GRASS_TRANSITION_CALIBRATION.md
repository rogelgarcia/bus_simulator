# LOD4 transition calibration

## Decision

Retain a separate lab option, `?grass=patches&handoff=shorten`, that scales blade
height toward its fixed root instead of translating or cutting the blade.
At ground-anchor distance `d`, including camera elevation, use
`s = smoothstep(16, 24, d)` and `y = originalY * (1 - s)`.
Use the same `s` for the ground litter-to-canopy blend. At 16/18/20/22/24 m,
blade heights are 100/84.375/50/15.625/0 percent of their authored heights.
The roots and horizontal placement remain fixed. Original tip/root colors and
external shadow shading remain; the geometry gets shorter rather than losing
only bright tips or only dark roots. No extra texture samples or new assets.

The incoming LOD3-to-4 dissolve still operates over 13.6–16 m. Terminal opacity
and color dissolution remain disabled. At 24 m an explicit zero-height fragment
guard prevents residual MSAA samples along the field boundary; it does not
gradually discard fragments within the transition. Forced LOD4 bypasses both
height reduction and that endpoint guard. The shared renderer supports this
option, but gameplay and the ordinary lab URL retain their existing defaults.

## Research sequence

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

## Measures and limitations

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

## Forward performance

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
  real renderer with no shader/source interception, at 24 angle/height poses
  and 33 moving samples.
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
