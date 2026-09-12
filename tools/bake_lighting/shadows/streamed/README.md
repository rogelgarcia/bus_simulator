# Streamed static shadows and filter review (AI 547)

All jobs are registered beneath `node tools/bake.mjs`, reuse
`tools/baking/blender.local.json`, and remain outside the default bake tree.
Generated evidence belongs under `tests/artifacts/screens/illumination_547/`.

## Generate, review and publish

1. `/prototype`: native detail over a 110 m square around a supplied pose.
2. `/city`: the complete matching 55-degree city grid, including authenticated
   empty cells. Both generators require `pose` and a new `output` directory.
3. `/review`: requires `pose`, `input` and a new `output`. It captures parent/detail
   in two fresh browsers, runs three paired timing passes each, and corrupts page
   responses to verify parent fallback. Optional `recording` replays BUSREC1
   frames A80-E20 for three paired laps in each browser. Completed GPU queries are
   joined by submission. Recorded transforms are replayed with current defaults;
   original wall-clock pacing, physics and other-actor history are not reproduced.
4. `/publish`: requires `input`, the completed `review` directory, and `--publish`.
   It validates full coverage, source identity, current parent, payloads and exact
   guards, shader hashes, cold/warm GPU results and corruption fallback. It
   installs content-addressed detail assets, authenticates the installed copy,
   then atomically updates the optional streaming index. Existing parent package
   publication and identity gates remain unchanged.

Example (use a new output directory for each run):

```sh
node tools/bake.mjs --target lighting/shadows/streamed/city --set lighting/shadows/streamed/city:pose=tests/artifacts/screens/topic/pose.json --set lighting/shadows/streamed/city:output=tests/artifacts/screens/illumination_547/city-01
node tools/bake.mjs --target lighting/shadows/streamed/review --set lighting/shadows/streamed/review:pose=tests/artifacts/screens/topic/pose.json --set lighting/shadows/streamed/review:input=tests/artifacts/screens/illumination_547/city-01 --set lighting/shadows/streamed/review:output=tests/artifacts/screens/illumination_547/review-01
node tools/bake.mjs --target lighting/shadows/streamed/publish --set lighting/shadows/streamed/publish:input=tests/artifacts/screens/illumination_547/city-01 --set lighting/shadows/streamed/publish:review=tests/artifacts/screens/illumination_547/review-01 --publish
```

`capture-only=true` on `/review` provides a quick image pair and static-only
isolation. Its incomplete timing evidence is deliberately rejected by publish.
The full review binds the exact shaders; editing them requires a new review.

## Capture and runtime contract

The installed parent descriptor and RG8 payload are authenticated. A fresh
complete city must independently match its source/channel identity before native
Three r183 Depth24 capture. Moving objects are excluded and effective source
shadow sidedness is preserved. Pages are genuinely rendered at three times the
parent's linear density, not upsampled. The 1020-texel interiors have guards
covering finite-sun sampling. Original native overlap disagreements are retained;
shared world texels take the nearest measured blocker, never averaged depth.
Reconciliation holds two rows in memory and authenticates final overlaps.

Normal gameplay defaults **Fine building shadows** on. The complete parent stays
resident while at most 16 nearby detail layers are selected within a combined
512 MiB logical static texture budget. Two worker requests and one upload per
frame bound page loading. Arrival/retirement and missing-neighbour transitions
blend visibility, never encoded depth. Minor projected footprint preserves
resolution on angled walls; broad penumbras use the smooth parent filter. Missing,
late, corrupt or unmatched detail keeps the authenticated parent.

`streamedShadowPrototype=0` explicitly disables the extension for diagnostics.
To review without publishing, `/review` routes its candidate index only inside
isolated browsers. Manual experiments may use `streamedShadowPrototype=1` plus
`streamedShadowIndex=/tests/artifacts/screens/illumination_547/city-01/streaming_index.json`.
Custom indexes are limited to that local artifact subtree.

The complete parent remains resident. A reduced far-parent hierarchy, further
sun profiles and dynamic interaction clusters remain broader AI 547 work.

## Diagnostic comparisons

- `/filter-review`: `pose`, archived `before` GLSL, and new `output` under
  `tests/artifacts/screens/`. Compares original/corrected parent filtering at
  identical installed-map density, three passes per variant, and captures legacy,
  nearest, hybrid-hook-off and indirect-off isolation views. `diagnostics-only`
  skips timing. None of those isolation states changes game defaults.
- `/parent-control`: `pose` and `output`; measures the original unextended parent
  shader with identical maps/settings.
- `/toggle-review`: `pose` and `output`; verifies installed detail and baked
  on/off/on while retaining indirect illumination. `compare-live=true` measures
  Single/High with indirect versus fine baked shadows over three paired passes
  in two fresh browsers. `benchmark=true` additionally measures full Current
  and the legacy parent filter; detail is disabled for that legacy comparison.

Actual GPU GLSL regressions live in
`tests/headless/e2e/static_sun_receiver_plane.pwtest.js`. They cover clear slopes,
near contacts, false distant blockers outside the solar cone, and distant
penumbras. `streamed_shadow_residency.pwtest.js` verifies retained decoded pages
are not downloaded again while waiting for a residency lease.

## Five-pose benchmark and captures

`/five-pose-review` uses the tracked AI560 `config/poses.json`, retaining the
shared bus for cameras 01/02. It runs three balanced passes of Single/High,
baked parent, and fine baked shadows in each of two fresh browser processes.
The second process reverses pose order. All variants retain the same calibrated
defaults, baked indirect and 1920x1080 viewport. Each pass waits for activation,
120 settled frames and 60 warmup frames, then collects 360 frames. GPU queries
are joined to their own submission IDs, with a 99% minimum matching requirement.

```sh
node tools/bake.mjs --target lighting/shadows/streamed/five-pose-review --set lighting/shadows/streamed/five-pose-review:output=tests/artifacts/screens/shadow_five_poses/run-01
```

Outputs include 15 images, raw per-frame data, runtime settings and residency
evidence, and JSON/CSV/Markdown tables. GPU/CPU/frame-interval distributions have
interpolated p1/p99 thresholds and separately named fastest/slowest 1% means.
Counters sum every renderer invocation, including the hybrid moving-shadow pass
which the HUD's post-processing counter reset omits. Both counts are retained.
Memory is an allocation estimate, not physical driver VRAM: it includes retained
parent/cache, detail textures, RGBA8/depth32 shadow targets and separately reports
the common indirect maps. Startup and streaming/toggle transients are excluded.
If a second browser fails after all 45 first-browser measurements were saved,
`resume=<previous-output>` with a new `output` reuses those measurements and their
images. It verifies all five poses, all three passes per mode, common settings and
resolved source identity. Same-origin HDRI URLs compare by path because isolated
servers use different ephemeral ports. Parent memory comes from the package
controller even when its material hooks are detached; active and cached bytes
are reported separately.
