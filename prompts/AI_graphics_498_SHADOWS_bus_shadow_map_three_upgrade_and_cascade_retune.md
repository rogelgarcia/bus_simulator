#Problem

Cascaded shadows cost ~8.5 ms over `off` at bus level, and the cost is
**geometry throughput**: the city's triangles are transformed once per cascade.
The sharpest cascade exists almost entirely to serve one object — the bus,
which the player looks at constantly and which sits a few metres from the
camera. Everything else in the near band could tolerate far less.

The tension that follows is structural. With a fixed cascade count and reach,
making the near band sharper means bigger density steps between bands, and a
step is a visible seam where a shadow crosses it. Measured spans: near 0.0055
to far 0.185 is 33x across three steps; near 0.0121 to far 0.185 is 15x. You
cannot have a very sharp near band, long reach, few cascades and gentle
transitions — pick three.

Giving the bus its own shadow map breaks the tension: the cascades stop having
to be sharp near, so they can be fewer and coarser, and the bus gets a map
fitted to it alone.

# Request

Ship a bus-specific shadow map composited with the cascade result, then re-tune
the cascade tiers around it. Upgrade three first so nothing is built on a
version we are about to leave.

## Expected payoff (measured components, projected total)

| approach | shadow cost over `off` | bus sharpness |
| --- | --- | --- |
| today, 4 cascades 45/90/190/340 | +10.23 ms | 0.0121 m/texel |
| 3 cascades 60/160/340 + bus map | ~+8.1 ms | ~0.010 |
| 2 cascades 60/340 + bus map | ~+6.6 ms | ~0.010 |

A ~30% reduction in shadow cost with a sharper bus and no cascade seam across
its shadow. Real, but not transformative — confirm that is the intended trade
before building.

## Phase 0 — upgrade three to 0.185.1

Currently pinned at 0.183.2 in `index.html` lines 78-80 (three, three/addons/,
three/examples/jsm/), CDN only — there is no local `node_modules/three`.

- **`csm/CSM.js` and `csm/CSMShader.js` are byte-identical between 0.183.2 and
  0.185.1** (verified by hash). The shadow work should survive untouched, and
  the string the Phase 2 patch targets is unchanged.
- Re-verify after upgrading, in this order: full node suite and
  `threejs_upgrade_smoke`; then the shadow stack specifically — CSM addon API,
  chained `onBeforeCompile` still composing, the dispose/uniform crash fix, the
  caster merge still producing pixel-identical output, and whether
  `PCFSoftShadowMap` is still merely deprecated rather than removed.
- Do not start Phase 2 until this is clean.

## Phase 1 — deterministic shadow lab scenario

Verification stays in the real game (that is what ships), but add
`tests/headless/harness/scenarios/scenario_shadow_lab.js` for stable pixel
gates and timings: fixed camera, no tree streaming, no physics settle, a bus
and a few buildings at known distances.

AO was already switched from `half_rate` to `every_frame` in
`AmbientOcclusionSettings.js` for this reason — see the pitfalls below.

## Phase 2 — bus shadow map

- Own `WebGLRenderTarget`, 2048-4096. Ortho camera fitted to the bus **plus the
  extent of its cast shadow** — at low sun that stretches 20-30 m, so fitting
  the bus bounding box alone will clip the shadow's tail.
- **Texel-snap the box** exactly as `CityCascadedShadows` does, or the edges
  crawl while driving. This bit us once already.
- Render the bus alone with a depth material: 1-2 draw calls, ~0.1-0.3 ms.
- Composite by patching the fragment shader inside the existing chained
  `onBeforeCompile` — sample the bus map and `min()` it into the directional
  light's shadow term. **Not a forked chunk file**: a targeted string replace,
  the same technique `MaterialVariationSystem` and `MaterialUvTilingSystem`
  already use here. Target text is CSM's `lights_fragment_begin`, which appears
  in both the fade and non-fade branches — replace all occurrences and
  **assert the match count**, so a future three upgrade fails loudly instead of
  silently rendering wrong.
- Behind a settings toggle so it A/Bs like `mergeCasters`.
- Watch for a seam where the bus map meets the cascade result: `min()` is
  idempotent on overlap, but a bias mismatch between two maps of very different
  texel size will show at the join. The bus map needs its own bias tuned for
  its much finer texels.

## Phase 3 — re-tune cascade tiers, implement type + quality

Once the bus is independent, collapse the settings to two controls, because
splitting quality and distance produced nonsense combinations (16K at 110 m
measured *slower* than 16K at 340 m — a distance dial that makes things worse
is a broken control).

**type:** off | single | cascade   **quality:** low | med | high
(quality governs resolution *and* distance together, so every step down is
cheaper)

Single map, one geometry pass:

| quality | map | reach | m/texel | VRAM | frame |
| --- | --- | --- | --- | --- | --- |
| low | 2048 | 110 m | 0.107 | 16 MiB | 9.80 ms (measured) |
| med | 8192 | 220 m | 0.054 | 256 MiB | ~12 ms |
| high | 16384 | 340 m | 0.042 | 1024 MiB | 13.24 ms (measured) |

Cascade candidates, all measured this session (cost is over `off` = 8.45 ms):

| id | layout | maps | vs off | near | VRAM |
| --- | --- | --- | --- | --- | --- |
| I | 2c 25/340 | 8/4K | +5.66 | 0.0068 | 320 M |
| H | 3c 20/90/340 | 8/8/4K | +6.97 | 0.0055 | 576 M |
| C | 3c 60/160/340 | 8/8/4K | +7.79 | 0.0161 | 576 M |
| D | 3c 45/150/340 | 8/8/4K | +8.27 | 0.0121 | 576 M |
| G | 4c 20/60/160/340 | 8/8/8/4K | +8.78 | 0.0055 | 832 M |
| A | 4c 45/90/190/340 (today) | 8/8/8/4K | +10.23 | 0.0121 | 832 M |
| B | 3c 90/190/340 | 16/8/4K | +14.10 | 0.0121 | 1344 M |

Re-measure after Phase 2: with the bus served separately, the near band no
longer needs to be sharp, which changes which row wins.

## Phase 4 — verify and document

- Pixel-identity gates for anything claimed lossless.
- Seam checks at every tier, driving (not static poses) and at low sun.
- Benchmarks against `tests/benchmarks/` baselines, same methodology.
- Fold results back into AI_497 and close it.

# Pitfalls — measurement

Every one of these produced a wrong conclusion during AI_484/497 before being
caught. The methodology that survives all of them is in
`tests/benchmarks/README.md`: **one warm page, configs switched at runtime,
visited round-robin, medians compared, reference config measured first and
last, GPU otherwise idle.**

- **Never compare configs across page loads.** A fresh browser warms up over
  its first loads: the same `off` config measured 19.15 ms on the first page
  and 4.42 ms on the last, 77% drift. Whichever config runs last looks fastest.
  This manufactured a false finding that had to be withdrawn.
- **Close the game before benchmarking.** External GPU load inflates results
  1.5-1.7x and can invert the ranking of two configs. It happened repeatedly;
  if two configs rank opposite to what the texel/triangle math predicts,
  suspect this before believing the numbers.
- **GTAO at `half_rate` alternates frame cost on a two-frame cycle** (3,132 /
  4,099 draw calls in a frozen scene). `renderer.info.render.calls` read after
  a burst is phase-dependent. Now defaulted to `every_frame`; if that is ever
  reverted, force AO off when measuring.
- **`?pose=` pauses the game loop but not the rAF render loop**, and
  `GameplayState._updateChaseCamera` re-stomps `engine.camera` between
  evaluates. Neutralise it before setting a custom camera.
- **Screenshot via `renderer.domElement.toDataURL()` in the same synchronous
  evaluate as the render.** `page.screenshot()` races the live loop.
- **Same-session capture pairs have a near-zero noise floor** (max channel
  delta 0-1), unlike fresh-page pairs (~7-9% of pixels differ). So a
  "should be visually neutral" change must be captured in ONE page and demand a
  pixel-identical diff.
- **Effects under ~2 ms are not resolvable** even with everything controlled
  (per-config spread 2-8% at best). Report them as bounded, not as values.
- **Verify the dev server serves the working tree.** A server rooted in another
  checkout silently served pre-CSM code for an entire investigation; the
  reported "bug" was the old code's behaviour. Fetch a changed file over HTTP
  and grep for the change.
- **The perf bar's draw-call number is a whole-frame accumulation** across
  shadow, scene and post passes — not "objects on screen".

# Pitfalls — engine and three.js

- **`InstancedMesh.geometry.boundingSphere` covers one instance at the origin**,
  not the spread of all of them. Use `InstancedMesh.boundingSphere`. Buildings
  hold ~1,091 instanced meshes over ~31,812 instances, so anything doing bounds
  or culling work must handle this — it silently dropped whole blocks of facade
  detail from the shadow cull until the pixel gate caught it.
- **`mergeGeometries` returns null silently when some inputs are indexed and
  others are not.** No exception, just an empty result. Buildings hit this every
  time (indexed wall mesh with material groups, non-indexed roof mesh).
- **A geometry with material groups issues one draw per group**, in the shadow
  pass too. The unit of cost is draws, not meshes.
- **three's shadow pass tests `object.layers` against the SCENE camera's
  layers**, not the shadow camera's. Layers cannot feed different casters to
  different cascades, and an object hidden from the camera is hidden from
  shadows too. A shadow-only mesh must therefore still be drawn — use
  `colorWrite: false, depthWrite: false` to make it inert.
- **Shadow `autoUpdate` / `needsUpdate` live on `WebGLShadowMap` globally**, not
  per light, so cascades cannot be refreshed at different rates. Toggling
  `castShadow` per cascade would re-index three's shadow arrays and break the
  cascade-to-map mapping.
- **`renderer.shadowMap.enabled = false` does NOT change the image** — it skips
  the shadow passes while materials keep sampling the stale populated maps. It
  is valid for isolating cost, useless for isolating appearance. Use
  `light.shadow.intensity = 0` for visual isolation (uniform only, no
  recompile).
- **`PCFSoftShadowMap` is deprecated and silently coerced to `PCFShadowMap`**
  (with a console warning). It was never a distinct filter in 0.183+. All
  presets now name `pcf` directly.
- **Do not delete uniforms in a CSM-style dispose.** three's own
  `CSM.dispose()` deletes `CSM_cascades` and friends from the captured shader
  objects; the compiled program still declares them until the `needsUpdate`
  recompile happens, and `WebGLUniforms.upload` dereferences every declared
  uniform by name. Deleting them crashes the renderer. Remove the defines only.
- **Changing cascade count at runtime needs a forced recompile.**
  `CSM_CASCADES` is baked per material while the `CSM_cascades` uniform array
  is resized every frame, so a material holding a program built for a different
  count gets a wrong-length array and three crashes in `flatten()`. Fixed by
  `renderer.compile()` after re-registering.
- **`CSM.setupMaterial()` overwrites `material.onBeforeCompile`.** This codebase
  chains it. Register materials manually rather than calling `setupMaterial`.
- **Register materials for CSM AFTER geometry merging.** The merger treats any
  material with a custom `onBeforeCompile` as non-deduplicable, so registering
  first defeats the merge.
- **The caster culler owns `castShadow` at runtime** over a list it captures
  once. Anything else that changes which meshes cast must release it, change
  the set, then let it re-capture — otherwise the culler restores the flags it
  remembered and the change appears to do nothing.
- **The options UI used to emit only `shadows.quality`**, silently dropping
  every other shadow field. Fixed, but any new setting must be checked end to
  end through the real UI, not just the URL parameter or the settings API.

# Assumptions that turned out to be WRONG

Recorded so they are not re-adopted. Each cost real time.

- **"Shadow cost is fill / resolution."** No: 16x fewer texels changed nothing
  (8192/8192/8192/4096 vs 2048/2048/2048/1024, 26.31 vs 26.78 ms). Resolution
  is nearly free at cascade sizes — but NOT at 16384 in a near-field box, where
  magnification and overdraw make it expensive (12.09 -> 16.11 ms at a ~220 m
  box). Both facts are true; the box size decides which applies.
- **"Shadow cost is draw-call submission."** No: halving draw calls (the caster
  merge, 8,183 -> 4,618) bought ~1 ms in live play. Real, but small.
- **"The remaining cost is per-pixel receiver work"** (four cascades x 5-tap
  PCF per lit fragment). Tested and rejected: the shadow delta did not fall
  with viewport area. It is geometry throughput, ~1.3-2.4 ms per extra million
  triangles.
- **"A 16384 map fails to allocate."** No — it allocates, reports no GL error,
  and renders. The earlier claim came from a contaminated timing that made it
  look like nothing rendered.
- **"Config G strictly dominates today's layout."** Overstated. G is cheaper
  and sharper near, but it moves the first cascade seam from 45 m to 20 m,
  where it occupies far more screen space, and its step is slightly larger
  (2.9x vs 2.0x). Cheaper and sharper, but not free — needs a visual check.
- **"Box proxies are the big win for distant buildings."** Wrong twice over:
  they destroy roof-line and bulkhead self-shadowing (the detail cascaded
  shadows were bought for), and the draw-call saving they targeted was not the
  bottleneck. Superseded by the silhouette merge, which is lossless.
- **"Widening PCF radius fixes jagged edges."** It hides them and reads as
  overcast. The sun subtends ~0.53 deg, so an honest penumbra is ~0.0093 x
  caster-to-receiver distance — about 3 cm under a bus roof, i.e. the ~1.5
  texels the presets already had. Sharpen with resolution, not radius.
- **"Halving the near cascade is safe because the eye cannot resolve 2.4 cm
  texels at 45 m."** Distance reasoning does not apply to the bus: it sits a
  few metres away and fills the screen. Reported as degraded immediately.
- **"A tree-only or bus-only cascade can just be added."** Cascades partition by
  *receiver depth* and are mutually exclusive — a map containing only one
  object erases everything else's shadows in that band. Compositing requires
  `min()` of two lookups, which is precisely what Phase 2 builds.

# Assumptions still UNVERIFIED

- The projected +6.6 to +8.1 ms totals are arithmetic on separately measured
  parts, not a measured whole.
- The bus map's cost (~0.1-0.3 ms) is estimated from its draw-call count.
- Whether the `min()` join between two maps of very different texel size shows
  a seam in practice.
- Whether a 20-25 m first cascade seam is visible in motion (config G/H/I).
- Single-map `med` (8192 @ 220 m, ~12 ms) is interpolated, not measured.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
