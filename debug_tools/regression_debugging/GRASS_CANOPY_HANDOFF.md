# Grass terminal seam and flicker — 2026-10-11

## Reproduction

The bus scene's detailed baked profile showed a camera-following boundary between
upright reduced blades and the LOD5 surface. Reproduce with these supplied
X/Y/Z, yaw/pitch/roll poses (degrees, YXZ):

- 13.809 15.855 78.109 172.307 -25.421 0
- -35.076 12.444 -45.491 -155.267 -3.457 0
- -2.4 6.883 -18.63 180 -19.206 0

Test: `tests/headless/e2e/grass_canopy_handoff.pwtest.js`. Evidence root:
`tests/artifacts/screens/grass_debug_v2/canopy_handoff/` (ignored).

## Isolation

1. `before`: committed v13 captures and 1 cm horizontal translations. The cached
   selection test from earlier work does not measure temporal flicker.
2. `color-morph`: leave the nearest blade opaque and mix toward the projected far
   texture; alpha-fade the canopy surface over litter. The final band has less
   motion variation, but its old 3 m width still exposes a structural boundary.
3. `wide-morph`: increase only terminal overlap to 31.5–40 m. The 40 m endpoint
   remains fixed. Existing geometry populations remain unchanged.
4. `fine-morph`: 1.6× UV frequency reduces broad far-texture shapes. This exposed
   brighter mips; color needs recalibration, not another lighting evaluation.
5. `calibrated`: prepared color gains compensate the mip brightness. This run's
   timing attempt correctly failed because default headless Chromium selected
   SwiftShader without timer queries. Do not use it as GPU evidence.
6. `hardware-before` and `after`: repeat on verified RTX 3060 / D3D11. The final
   implementation projects color at the real 0.1 m canopy height; using the
   shared 0.07 m fade-distance reference for color caused misaligned features.
   Shared GLSL helpers retain matching UV transforms and elevation correction.
7. `final`: retain finer UV detail with cavity power 0.72. The nine-field lab
   also passes its coverage, local-contrast and root-wall checks (`lab-final`).

## Validation interpretation

The moving-camera test includes ordinary blade/texture aliasing. It reports
46–51% less mean luminance change in the 35–39 m strip across the three poses.
A separate fixed-camera test changes only fade distance. The previous dissolve
causes sparse RGB jumps as large as 131–183. The continuous handoff produces
mostly 1–2-level changes. Compare RMS and large-jump frequency: mean absolute
change alone misleadingly favors sparse large flashes over many small changes.

GPU comparison rotates soil/old/new mode order over four rounds of 64 queries
at each pose, sharing assets, shaders, shadows and camera. The old mode restores
the previous dissolve, 3 m overlap and UV frequency. The earlier `after` candidate
had close mean times (bus 2.26 → 2.30 ms), but the final repeat had a soil baseline
ranging from 0.59 to 26.11 ms across rounds. Its query samples are complete, yet
the run is unsuitable for judging incremental GPU cost. Do not claim final speed
improvement or absence of slowdown from it. Raw samples and draw counts accompany
the renders.
The harness waits for queued GPU queries rather than dropping samples when the
driver takes more than a fixed number of frames to return them.

The fully distant surface remains flat. General subpixel blade aliasing is not
eliminated by this local handoff; no full-scene temporal filtering was added.

## Cached dependency startup failure — 2026-10-12

The v14 entrypoint still imported the blend factory as `?v=opaque-dissolve-1`.
Serving its previous contents at that URL reproduced the reported "Invalid grass
fade style" failure from `material()` during initial field construction. A clean
browser hid this problem. The bus and lab now request matching versioned modules
and GLSL sources throughout the modified canopy dependency chain. The regression
test leaves the old URL available and verifies it is never requested.

## Forced-LOD5 color wave — 2026-10-12

Pose: `-2.4 6.883 -12.934 180 -19.206 0`. The user's forced-LOD5 check ruled
out a purely LOD-switching explanation. `grass_canopy_color_wave.pwtest.js`
captures all LOD endpoints and tracks the same x=7.5–13, z=20–26 m patch during
a 14 m forward drive. Artifacts: `canopy_color_wave/{before,flat-view,
no-coarse-gain,uniform-gain,after}` beneath the grass screenshot directory.

With the angle correction held constant, the spatial band remained (LOD5 mean
luminance approximately 107 → 131 across 23–49 m). Removing only the 1.58 gain
at mip 5 reduced that band to about 100–105, but dimmed the distant surface.
Applying the same compensation uniformly through the existing material tint
retained the far palette while reducing the fixed-patch temporal brightness
range from 11.62 to 2.49 / 255 (about 79%). The 23–39 m spatial range fell from
32.1 to 6.1 / 255. No shader arithmetic or extra texture reads were added.

## Pale LOD5 endpoint — 2026-10-12

Pose: `-2.4 6.883 7.66 180 -19.206 0`, reproduced at 2048×960 and
3818×1716. Forced LOD5, independent of any transition, had brighter highlights
than LOD4. At 25 m its 99th-percentile luminance was 213.8 versus 177.2.
Over 31–39 m, maximum average channel disagreement was 13.1 at bus height,
6.3 elevated, and 17.6 grazing. Captures/measurements are under
`canopy_palette/{before,softer,shoulder,calibrated,after,uhd-calibrated}`.

Reducing cavity power and mip contrast together was rejected: it removed too
much depth and dimmed the distant texture. The retained change uses a soft
highlight shoulder at decoded linear 60/255, bounded asymptotically at 120/255,
on all prepared mip levels. One constant material tint compensates its mean.
A small shared grazing-angle factor follows the upright blade tips; no new
texture fetches, lighting, geometry or draws. Average channel disagreement
over the handoff becomes 2.5 bus, 2.6 elevated, 5.9 grazing; at the larger
resolution it is 2.9, 2.6 and 4.1 respectively. The 25 m highlight percentile
falls to 180.4. Texture pattern and flat far silhouette still differ.

The forward patch changes gradually by 4.59/255 over 14 m, versus LOD4's
11.51/255 natural root-exposure change. The prior test's spatially constant
LOD5 requirement would conflict with matching those blades. It now requires
endpoint agreement in the actual band and limits each 2 m brightness step
to 1.5/255, while retaining a total change limit and constant-input mip test.

The shader include loader previously dropped the root source revision when
fetching shared chunks. Revision propagation and a nested-include test now
prevent an old view helper from being combined with new prepared maps.
