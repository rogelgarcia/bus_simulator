# Recorded route slowdown around 0x9xx — 2026-09-16

## Request and evidence

Investigate the user's new BUSREC1 run, especially frames 0x900-0x9FF, and test
whether slowdowns recur at the same route position. This follows the stationary
AI574 confirmations; a fixed-pose test cannot establish spatial recurrence.

Original attachment:
`C:/Users/rogel/.codex/attachments/41e3b4fd-9626-431b-886c-69ec1c5ad95d/pasted-text.txt`.
Preserved under `tests/artifacts/screens/recording_9xx_20260916/route.busrec`.
SHA256: `258a60fc29c1a76c15281e5c367841901497842666b12c2f345b15ca72d874c4`.
2,383 contiguous source frames 0x302-0xC50, 56.785 seconds, 3390x1540/DPR2,
RTX3060/ANGLE D3D11. One default-settings event. The capture starts during baked
loading; route replay starts only after readiness. No recorded source revision.

At 0x98F, the input has CPU75.8ms/GPU65.9ms with +11 shader programs, +13
textures, +3 geometries and +44 calls. The next frame interval is 66.6ms.
Nearby normal CPU cost is roughly 10-14ms. Resource growth is evidence of
first use but does not yet identify the owner: effect targets/programs can
produce these counts as well as city assets. Existing AI572 covers preparation
misses, and AI575 covers recurring route cost; do not create duplicate tickets.

## Reproduction plan

- Three fresh private Chrome processes, three complete 2,383-pose laps each.
- Preserve recorded settings and dimensions; match exact camera and bus poses.
- Replay the entire available approach rather than jumping to the hitch.
- No competing headless Blender launch; guard 20 seconds before each process,
  monitor process CPU continuously, and retain GPU/available-memory telemetry.
- Ordinary runs use existing lightweight CPU-phase scopes, without startup CPU
  profiling, draw-list diagnostics or GL resource wrappers. Separate any later
  resource diagnostic from the timing cohort.
- Test first visits versus warm laps, spatial recurrence, phase costs, resource
  increments, bake generation, visibility and GPU submission provenance.

The replay pauses physics, warms its first pose for 90 frames and advances one
source pose per render. It preserves route order, not original wall-clock
timing, loading history or other actors' physics history. Fresh browsers reset
their own resources, not OS/driver caches. Different elapsed visibility grace
can change which route frame initializes a resource.

Artifacts: `tests/artifacts/screens/recording_9xx_20260916/` (input, analysis,
host telemetry and launcher); `tests/artifacts/screens/recorded_slowdown/9xx-20260916-fresh-01/`
through `03/` (per-frame replay and environment data).

Test support adds opt-in `REPLAY_GPU_TELEMETRY=1` using the existing bounded
GPU sampler and `timeOriginMs` to the replay environment for host correlation.
No production source, lighting quality or default configuration changes.

## Results

The initial three fresh browsers / nine laps used the old replay order and did
not reproduce 0x98F. They are preserved as a diagnostic control, not evidence
against the user's report. Inspection found that the old replayer applies the
camera before `GameLoop.update`, whereas gameplay updates world visuals first
and then its camera. Camera-dependent sun emitters therefore had different
transforms even when the final camera/bus poses matched.

Corrected the test's default camera application point to
`GameplayState._applyGameplayPoseCamera`, keeping `before-world` as an explicit
control. Added exact first/last/requested pose assertions and copied bloom/sun
snapshots. No production change. The first separate resource diagnostic now
reproduces 0x98F exactly: CPU 73.3/GPU 57.87ms, sun-bloom CPU 56.2ms, +11 programs,
+13 textures and +3 geometries. At the same frame on lap2: CPU 13.6/GPU 17.48ms,
sun-bloom CPU 2.1ms, no new programs/textures. Resource profiling is excluded from
ordinary timing results. Three ordinary fresh-process confirmations follow.

## Trigger identified

`GameLoop.update` calls `City.updateVisuals` before GameplayState applies the
new camera. `SunBloomRig.update` places/orients the emitter using the previous
camera. `SunBloomOcclusionFilter._projectMeshBounds` then tests that emitter with
the new camera. At 0x98F, the four plane corners span view depth
-1.152542 to +2.109684 with near=0.5. The filter's near-plane uncertainty branch
expands the effect to the whole viewport. The runtime diagnostic matches this
calculation exactly: conservativeEmitterCount=1, effectFarDepth=2.109684,
105 conservatively retained occluders, 40 bloom-pass draws / 84,576 triangles.

Recomputing the same emitter with the final camera puts all corners at depth
0.620153. Projected X spans 755.58-1079.09 and Y 3084.86-3797.00 in NDC: clearly
offscreen. Neighbouring 0x98E/0x990 do not cross the near plane. This identifies
an unnecessary view-dependent pass at the reported location; its first use
creates the bloom shaders/render targets and causes the large isolated hitch.
It is not evidence of periodic baked-light activation or a location-only throttle.

The standalone numeric check is saved as `explain_emitter_bounds.py` and
`emitter-bounds.json` in the recording artifact directory. It uses the recorded
camera transforms/projection, recorded sun direction/disc radius and the city
sky radius 1400 from `SkyGenerator.js`. Diagnostic GL events include 22 shader
compile calls, 11 program links and 12 texImage2D calls (the renderer's texture
count increases by 13); these API submission
times alone do not account for all deferred driver/first-draw cost.

## Three ordinary confirmations

All three corrected-order fresh Chrome processes reproduce exactly 0x98F.
Each executes two complete 2,383-pose laps, for 14,298 measured frames total.
These runs have no GL wrappers, startup profiler or draw-list profiling. Existing
lightweight phase scopes remain enabled. Results below are the same source frame,
not independently selected CPU/GPU maxima; CPU and GPU times overlap.

| Run | Cold CPU / GPU (ms) | Cold sun-bloom CPU (ms) | Warm CPU / GPU (ms) | Warm sun-bloom CPU (ms) |
|---|---:|---:|---:|---:|
| Original recording | 75.8 / 65.91 | Not recorded | Not recorded | Not recorded |
| ordered-01 | 72.2 / 64.42 | 55.5 | 12.6 / 17.41 | 1.9 |
| ordered-02 | 72.9 / 55.17 | 56.5 | 12.9 / 18.62 | 2.2 |
| ordered-03 | 83.5 / 52.46 | 65.5 | 12.5 / 17.51 | 1.8 |

Every cold visit adds 11 programs, 13 textures and three geometries; warm visits
add none. Every visit still issues 40 bloom draws, so warm-up hides the large
initialization stall but does not eliminate the unnecessary pass. Cold next-frame
intervals are 72.7/73.6/84.6ms; warm intervals are 16.6/16.8/16.7ms. This is a
repeatable hitch, not a lone benchmark outlier.

All ordinary confirmations match the recorded settings and 3390x1540 buffer,
have exact sampled bus/camera poses, and retain baked mode/generation 2. No hidden
page, GPU disjoint or page error occurred. Hardware GPU timing is matched by
submission. Host samples show only the existing GUI Blender PID20524, averaging
0.0063-0.0073 CPU cores, with no headless render overlap. Fresh browser processes
are not a purge of OS/driver caches. Owned browser/GPU/host samplers were stopped.

The three ordinary confirmations took 128.965/128.524/138.742 seconds, about
6m36s combined excluding the 20-second inter-run guards. The two-lap resource
diagnostic took 137.011 seconds and is excluded from the timing cohort.

Artifacts: `tests/artifacts/screens/recorded_slowdown/9xx-20260916-ordered-01/`
through `03/`; separate `9xx-20260916-ordered-diag-01/`. Combined statistics,
launcher, input and host telemetry are in the recording artifact directory above.
`frames.json` stores exact phase/resource/GPU samples; `poseChecks` includes
0x98E/0x98F/0x990 on both laps. The saved `final.png` files show the route end,
not the hitch pose.

## Other events and interpretation

Two earlier first-use events also recur at exactly their original frames in all
three corrected-order cold replays. Bloom is irrelevant (zero draws) at both:

| Frame | Original CPU / GPU (ms) | Cold CPU / GPU range (ms) | Warm CPU / GPU range (ms) | New geo / tex / programs |
|---|---:|---:|---:|---:|
| 0x672 | 70.2 / 69.96 | 69.5-73.4 / 55.63-73.93 | 16.3-19.5 / 16.48-19.36 | 2 / 3 / 0 |
| 0x689 | 98.2 / 69.43 | 60.8-64.1 / 56.42-60.85 | 16.0-19.3 / 16.89-20.67 | 39 / 3 / 0 |

These fit AI572's existing asset first-use scope. The exact asset ownership is
still to be traced. Some warm CPU outliers remain at different frames across
runs (for example 0x90B, 0x53E and 0x55A); do not claim every outlier is explained.
Across the six corrected-order laps, 9xx CPU medians are 12.8-14.4ms and GPU
medians 15.11-16.00ms. Thus the 98F stall is real, but this recording does not
demonstrate a sustained periodic slowdown throughout 9xx. Recurring view cost
and frame pacing remain AI575's separate scope.

## Next fix and verification

Update existing AI572 with this evidence rather than creating a duplicate prompt.
First synchronize sun-emitter transforms with the final render camera and retain
correct clipping for genuinely visible/near-plane cases. Then cover legitimate
first-use bloom dependencies in bounded preparation, so the stall is not simply
moved to the next real appearance of the sun. Preserve lighting/shadow quality,
bloom settings and intended appearance. Do not disable the effect as a fix.

Repeat this complete route in three fresh browsers after the fix, inspect 0x98F
plus genuine onscreen/partially occluded sun, and compare cold/warm timings and
images. Test fast turns, resizing, large sun discs, teleports and restored poses.
The prior 0x25CE event has similar resource counts but is NOT proven to share
this cause: rerun its full approach with the corrected camera order.

Only investigation/test tooling and documentation changed this pass. Production
rendering is unchanged. Harness syntax and diff checks pass; all three corrected
ordinary E2E runs plus the separate diagnostic passed readiness, settings, pose,
baked-state and GPU validity checks. The selected-test file was restored.
