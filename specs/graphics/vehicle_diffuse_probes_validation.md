# AI 550 validation — 2026-09-08

The implementation provides optional vehicle-local material variants and an
authenticated spatial diffuse field. It does not change the default bus appearance
or replace the accepted static-world indirect bake. The field's representation,
coverage, units and publication identity are documented in
[Vehicle diffuse lighting](vehicle_diffuse_probes.md).

## Evidence and reproduction

All generated evidence is gitignored under
`tests/artifacts/screens/ai550_bus_diffuse_probes/`:

- `before/`: immutable original game screenshots for all five supplied cameras,
  resolved settings/materials and existing bake identities.
- `comparison-final/`: matched Off, materials-only, fixed-PBR probes-only and
  combined renders, actual material/field diagnostics, motion and measurements.
- `after/`: cold-Off and On/Off/On lifecycle checks against the real publication.
- `comparison/`: an earlier rejected material-classification iteration. Only its
  pre-change runtime baseline is reused; its enhanced comparisons are not evidence
  for the final implementation.

The tracked camera catalog is `tests/fixtures/lighting/ai550_camera_poses.json`.
Cameras 01 and 02 share one bus placement. City Bus uses all five cameras; Coach
and Double Decker use 01 and 05 with their existing model dimensions and a deterministic
ground alignment. No model geometry or physics was modified.

Use the selected-test runner with `bus_lighting_comparison_550.pwtest.js` and
`AI550_CAPTURE_COMPARISONS=1` for the expensive route captures. Optional
`AI550_MODELS=city,coach,double` selects catalog IDs and preserves other completed
model records. The original runtime is captured separately; it is not inferred
from the new feature's Off setting. Shader contract tests use controlled fields
to distinguish actual diffuse contribution from a glossy material change.

## Performance and memory

Windows, Chrome WebGL2 / ANGLE D3D11, NVIDIA GeForce RTX 3060; 1920×1080 viewport,
1920×1056 game canvas, pixel ratio 1. BigCity2, supplied camera 01, one registered
dynamic bus, simulation paused, accepted baked world shadows and indirect light.
Sun 7, hemisphere 1.22, IBL 0.28, exposure 1.02, ACES tone mapping; high shadow
resolution, Dynamic Only GTAO with medium analytic underbody, MSAA, bloom off,
Vivid grading at 0.65. Full settings are recorded per measurement.

Each state/camera warms for 60 frames, then records 120 frames, discarding the
first five. The table reports medians of 115 samples; GPU p95 is also shown.
GPU timing is the engine's whole-frame timer, not an isolated lighting pass.
FPS is 1000 / median frame interval. Shader compilation is outside the samples.

| City Bus state | Frame ms | FPS | GPU median / p95 ms | Draw calls | Triangles | Probe CPU / GPU MiB | Cached variant entries |
|---|---:|---:|---:|---:|---:|---:|---:|
| Original runtime baseline | 33.30 | 30.03 | 11.46 / 15.24 | 911 | 958,493 | 0 / 0 | 0 |
| New implementation, cold feature Off | 18.00 | 55.56 | 9.75 / 13.32 | 911 | 958,493 | 0 / 0 | 0 |
| Materials only | 34.60 | 28.90 | 11.20 / 15.82 | 911 | 958,493 | 0 / 0 | 19 |
| Materials and probes | 17.80 | 56.18 | 10.24 / 13.55 | 911 | 958,493 | 2.82 / 2.82 | 19 |
| Off after use | 17.60 | 56.82 | 9.35 / 12.81 | 911 | 958,493 | 2.82 / 2.82 | 19 |

Sequential browser scheduling, driver warming and frame pacing varied: these
measurements do **not** establish a speedup, and no performance promotion is claimed.
The useful structural result is unchanged draw/triangle workload, no new fullscreen
pass and one bounded probe texture. Probe interpolation adds vehicle fragment work.
Isolated CPU/GPU lighting time is **not measured** because there is no dedicated
timer for this material contribution. Multi-vehicle traffic cost is **not measured**;
the measured workload has one bus. Total driver memory is **not measured** because
WebGL does not expose it.

The 2,640-probe field stores exactly 2,956,800 bytes on CPU and GPU each. Off stops
sampling but retains inactive hooks on cached variants and the one-field cache
until reload or runtime disposal. Material textures share their original storage;
the initial experiment used two variant choices. Selective reflection and isolated
probe preparation now allow at most eight choices per original material. The renderer also
retains shader programs from visited world/material modes: City camera 01 recorded
245 programs at the original baseline, 370 at cold feature Off, 437 combined and
444 after restoring Off. The cold-feature capture includes earlier world-mode
warm-up, so it is not a cold-driver comparison. A later fix avoids a redundant
world refresh when changing developer preferences while the master remains Off.
No zero-memory claim is made for Off after use.

The same camera/settings comparison on the other authored PBR buses produced:

| Model / state | Frame ms | FPS | GPU median / p95 ms | Draw calls | Triangles | Cached variant entries |
|---|---:|---:|---:|---:|---:|---:|
| Coach / cold Off | 35.00 | 28.57 | 15.18 / 19.59 | 994 | 1,957,315 | 0 |
| Coach / materials only | 35.30 | 28.33 | 18.88 / 22.12 | 994 | 1,957,315 | 68 |
| Coach / probes on authored PBR | 35.00 | 28.57 | 15.23 / 16.36 | 994 | 1,957,315 | 136 |
| Coach / combined | 34.80 | 28.74 | 14.84 / 15.90 | 994 | 1,957,315 | 136 |
| Coach / restored Off | 34.70 | 28.82 | 14.33 / 15.72 | 994 | 1,957,315 | 136 |
| Double Decker / cold Off | 17.80 | 56.18 | 11.57 / 14.27 | 899 | 1,079,354 | 0 |
| Double Decker / materials only | 35.10 | 28.49 | 13.07 / 18.31 | 899 | 1,079,354 | 22 |
| Double Decker / probes on authored PBR | 17.80 | 56.18 | 11.77 / 14.36 | 899 | 1,079,354 | 44 |
| Double Decker / combined | 17.80 | 56.18 | 11.77 / 14.35 | 899 | 1,079,354 | 44 |
| Double Decker / restored Off | 17.70 | 56.50 | 11.50 / 14.14 | 899 | 1,079,354 | 44 |

These share the same 2.82 MiB CPU/GPU field budget, not a field per vehicle.
Coach/Double Decker materials-only and original modes intentionally retain the
same authored appearance. Their probes-only and combined modes also use the same
PBR values; matching results in those two modes are expected, unlike a failed
GI on/off switch. All three models completed the motion checks. The final capture
manifest contains 46 records and no reported page errors.

## Visual and correctness interpretation

City paint resolves to Physical only in its enhanced-material state; Coach and
Double Decker retain their authored PBR values. Controller-owned lamps retain
their original references. Original runtime captures already had environment maps
bound, correcting the earlier source-audit inference of absent IBL.

The final City comparisons show a distinct probe contribution on the same PBR
materials, including sheltered versus exposed regions. The top-800-row image
comparison excludes the animated HUD: materials-only versus combined mean absolute
RGB byte differences range from 0.11 to 1.70 across the five views. This is evidence
of a contribution, not a photorealism score. Off versus restored-Off differences
range from 0.004 to 0.664; background foliage/LOD/temporal state prevents claiming
bit-identical full frames. Tests separately assert exact original material and
geometry reference restoration.

The moving sequence traverses 12 m in 0.5 m steps while the field remains active;
City captures at 0, 3, 6, 9 and 12 m expose interpolation changes. An outside-region
capture exercises the live fallback. Controlled GPU fixtures verify directional
diffuse response, direct-sun preservation, blocked-depth and outside-volume fallback.
The coarse visibility field and half-cell boundary fade remain approximations;
local reflections, detailed glass transport and fully dynamic GI are separate work.

Focused checks cover corrupt/oversized data, irradiance units, default-off settings,
presets, atomic baked transactions, cancellation, late model loads, shared-original
isolation, removal/disposal, unsupported Phong probe-only selection, UI Save/Reset,
and fixed HUD status slots. Actual scene sun, hemisphere and IBL changes reject
incompatible data and restore probes after returning to the accepted profile;
exposure and AgX changes preserve valid probes. Those compatibility assertions stop
rendering during the deliberately incompatible intermediate state to avoid measuring
unrelated cold Current-mode compilation. Current-mode rendering/restoration is also
covered by the separate real-game lifecycle test.

Final real-game lifecycle: passed in 6.7 minutes, including cold-Off zero requests,
material-only, published combined mode, rendered Current mode, return to Auto and
two Off/restoration cycles. The existing real-model underside/contact-footprint
regression also passed. Rehashing the accepted static receiver index confirmed it
still matches the immutable pre-change baseline.
## Follow-up: original appearance and selective HDRI reflections

The user rejected the initial AI 550 appearance (dark metallic rims, washed-out
paint and bright black trim). The initial implementation evidence above records that
earlier experiment, not visual approval. The public controls now expose Glass
reflections, Body reflections and City Bus Rim shine on the authored materials.
Enhanced bus lighting remains a separate developer experiment, default off.

Recalibration validation on 2026-09-08:

- `bus_reflections.pwtest.js`: two tests pass. Actual GPU pixels verify an added
  environment response for Phong and PBR while direct/diffuse light without the
  environment remains identical. Categories are independent; trim, lamps, rubber,
  mirrors and shared materials outside the vehicle remain unchanged. Repeated
  switches have bounded allocation and restore exact originals. Save/Reset retain
  separate reflection intent without enabling the diffuse experiment.
- `bus_diffuse_probe_contract.pwtest.js`: five tests pass, including the revised
  experimental gray-rim and low-specular black-trim calibration.
- `baked_lighting_transactions_535.pwtest.js`: three tests pass, including
  Save/Cancel, dormant preferences, cancellation and failure rollback.
- `baked_lighting_settings.test.js`: five tests pass. Shader policy passes.
- `bus_reflections_capture.pwtest.js`: real City Bus before/after capture passes.
  All reflection modes retain active world bakes, allocate zero probe bytes,
  request no probe payloads and restore the original material references.

Artifacts: `tests/artifacts/screens/bus_reflection_recalibration/` contains
`original.png`, `glassReflections.png`, `bodyReflections.png`, `rimShine.png`,
`combined.png`, `restored.png` and `measurements.json`.
All six captures use 911 draw calls and 958,493 triangles. Whole-frame GPU medians
were 11.26, 13.71, 11.60, 10.50, 10.90 and 10.74 ms respectively. These sequential
measurements have warm-up/pacing variation; they do not establish a speedup or an
isolated shader cost. The new path adds no scene capture or fullscreen pass.

The first `roof-*` captures in that folder retained the old camera because the
pose object was immutable; do not use them as overhead roof evidence. The capture
script now clones the pose before editing it. Actual overhead on/off comparisons
are in `tests/artifacts/screens/bus_roof_probe_diagnosis/`, generated by
`bus_roof_probe_capture.pwtest.js` at all five saved poses. No duplicate top-facing
roof surfaces were found in the 0.2 m ray grid audit. The imported flat roof has
upward-facing normals; its perimeter retains authored rounded-edge normals.

**Open investigation:** the user's moving polygon/circle roof patches were not
reproduced at those five poses. Their movement relative to the bus argues against
fixed topology defects. Probe visibility lookup and sun-shadow sampling remain
hypotheses, not a confirmed diagnosis. The user could not reproduce those patches
at the subsequently copied pose and identified a separate static indirect-light
artifact there. That investigation is tracked in
[AI 561](../../prompts/AI_graphics_561_ATMOSPHERE_unwanted_baked_indirect_shadow_at_civic_route.md).
Neither defect is marked fixed by the clean saved-pose captures.

## Follow-up: stale reflections, missing draws and background activation

The user's saved configuration retained the old experimental master behind the
new reflection controls. Unversioned saved settings now migrate that master Off;
the new reflection flags and accepted world settings survive. New explicit
developer opt-ins persist with storage version 2.

At the supplied reflection pose, repeated material switches reproduced missing
bus parts and buildings. Mesh and material references still existed, but Chrome
reported `GL_INVALID_OPERATION` because different texture sampler types shared a
sampler location. Cached shader programs had lost custom uniform ownership. The
shared material-hook registry now restores those bindings before drawing;
probe variants retain stable uniform cells and inactive hooks between uses.

Bus-only changes now stage and compile detached variants, keeping the applied
world and bus visible until a synchronous frame-boundary swap. Static receiver
bindings and dynamic caster references are adopted together. A failed or
superseded candidate cannot disable the accepted world bake.

Latest validation (2026-09-08):

- Real-game `bus_reflection_toggle_lifecycle.pwtest.js` passed at the user's exact
  pose: two repeated experimental/reflection On/Off cycles, 15 rapid mixed
  requests, selective-only reflections and final original restoration. No sampled
  frame left baked world mode, original mesh/material references were restored,
  and no GPU sampler errors were reported. Completed captures show the bus and
  surrounding buildings intact, with selective glass reflections removed on Off.
- Four `baked_lighting_transactions_535.pwtest.js` tests passed, including controlled
  delayed preparation, latest-request ownership, shader failure retaining the
  previous appearance, and explicit Current mode canceling stale work.
- Five probe contract tests passed. Six saved-settings tests and eight shader-hook
  registry tests cover migration and cached uniform ownership.
- The static-sun adapter regression and three status-strip tests passed. Bus-only
  loading/failure is reported separately while the world channels remain Applied.

Gitignored evidence: `tests/artifacts/screens/bus_reflection_toggle_lifecycle/`.
`before-bus-missing.png`, `before-world-missing.png` and `before-diagnostics.json`
preserve the failure. `cycle-1-all.png`, `selective-only.png`, `final-original.png`
and `diagnostics.json` record the corrected run. These are correctness captures,
not an isolated GPU-performance benchmark.

## Follow-up: CPU stalls and uncancellable preparation

The user subsequently reported freezes while toggling. The previous lifecycle
test proved appearance/ownership continuity, not responsiveness. A small controlled
reproduction confirmed that canceling a pending bus compile left its promise
unsettled and could block the next queued request. The preparation scene also
contained unchanged bus meshes, and commit rescanned the whole city for IBL.

Bus-only preparation now uses changed material slots, a lights-only target snapshot,
one shader submission batch per material with event-loop yields, explicit aborts
and a 15 s readiness deadline. Page closure invalidates pending coordinator work;
context loss/disposal stop preparation. IBL is applied to the staged bus materials.
Probe variants are isolated from non-probe variants to avoid compiling the currently
visible material when adding probe hooks. The bounded cache may hold up to eight
variant choices per original, sharing existing geometry/textures. No new bake was run.

The failing cancellation fixture returned `still-pending` before the change and
`AbortError` afterward, with zero further polling/submission. Four preparation tests,
two reflection tests, five probe contract tests and four coordinator transaction tests passed. Coverage
includes timeout, context loss, yielding between objects, unchanged-mesh exclusion,
probe isolation, page closure canceling queued work and preservation of world bakes.
The material-array test also failed before the fix: a glass toggle included glass,
paint and trim, with no scene-shadow registration before prewarming. It now includes
only glass and registers its shadow hook before compilation. On the real City Bus,
this changes one-mesh/14-material compilation into one changed-material submission.

The first real-game measurement still found a 1,431 ms long CPU task on activation:
dynamic AO patched new materials after preparation, and preparation used the canvas
output variant instead of the main HDR scene target. These are now prepared together.
A small real-WebGL regression verifies that the first HDR draw creates zero extra
programs, while retaining AO receiver exclusions and restoring the renderer target.
The corrected three-switch city run recorded zero long CPU tasks, zero world-bake
dropouts, zero sampler errors and zero new programs on warm switches. Glass On took
2,158 ms in background preparation; Off took 333 ms; warm On took 311 ms. The maximum
sampled frame interval was 150 ms, so this is not a claim of perfectly smooth frames.
Evidence: `tests/artifacts/screens/bus_lighting_toggle_cost/glass-final.json`.

The final seven-switch run also covered Body reflections, Rim shine, all Off and
all On again. First glass preparation took 2,348 ms in the background; the remaining
switches took 331–554 ms. Programs stayed at 224 after the first glass activation,
with zero new programs on subsequent switches, zero world-bake dropouts, no GPU
sampler errors and no city IBL rescans. The largest long CPU task was 54 ms and the
largest frame interval was 183.4 ms. This removes the reproduced 1.4 s CPU stall;
it does not establish a bound for every driver, machine or initial city load.
All 16 focused/preparation/real-game tests passed in the final validation set.
Evidence: `tests/artifacts/screens/bus_lighting_toggle_cost/current.json`.

Process review found no leftover test browser before this investigation. Existing
Chrome processes belonged to the normal user session; a two-second CPU sample was
nearly idle (the highest process consumed about 0.03 CPU seconds). Their presence
alone does not establish that this game was still running. No user browser process
was terminated. Two initial real-game timing attempts exceeded the 100 s startup
limit before reaching the first toggle; those are startup stalls and cannot be used
as before/after toggle timings. Already-submitted driver compilation is not
cancelable by the page, so the preparation fix does not promise zero driver stalls.
