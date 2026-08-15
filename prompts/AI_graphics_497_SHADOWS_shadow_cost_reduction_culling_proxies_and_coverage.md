#Problem

Cascaded shadows (AI_484) cost roughly 4x what the old single fitted map cost,
and the whole increase is draw calls. Measured on 2026-08-15 (RTX 3060,
1280x720, bus-level camera, baselines saved in `tests/benchmarks/`):

| mode | frame | draw calls | shadow cost over `off` |
| --- | --- | --- | --- |
| off | 7.10 ms | 1,549 | — |
| high (single fitted, 110 m) | 10.97 ms | 4,033 | 3.9 ms |
| cascaded x4 (340 m) | 24.18 ms | 9,862 | 17.1 ms |

Shadow map *resolution* is nearly free — every single-map preset costs 3.4-4.0
ms whether its map is 1024 or 4096, so the pass is **draw-call bound, not fill
bound**. Cascade *count* is what costs, at roughly one extra full caster pass
each.

Per-cascade isolation (minus the 1,549-call base scene):

| cascade | band | box | shadow draw calls |
| --- | --- | --- | --- |
| 0 | 0-45 m | 99 m | ~1,356 |
| 1 | 45-90 m | 198 m | ~1,593 |
| 2 | 90-190 m | 420 m | ~4,144 |
| 3 | 190-340 m | 757 m | ~3,363 |

**The two far cascades are ~65% of the cost.** Their boxes contain the entire
city — including everything behind the camera — because three culls casters
only against the shadow camera's box, never against what can actually cast into
the view.

# Request

Cut shadow draw calls without giving up range or sharpness. Three independent
levers, additive rather than exclusive: they multiply different factors of
`casters surviving cull x draws per caster x cascades each appears in`.

## Verified groundwork (2026-08-15 — do not re-derive)

- **Small-caster culling is pointless here.** Median caster radius is 8.7 m and
  only 86 of 2,065 casters are sub-4-texel even in the coarsest cascade. The
  geometry merge (AI_483) already removed the small stuff.
- **Layers cannot select casters per cascade.** three's shadow pass tests
  `object.layers` against the **scene camera's** layers, not the shadow
  camera's (`WebGLShadowMap.js`, `renderObject`). Putting proxies on their own
  layer hides them from the main pass *and* from every shadow map alike.
- **Shadow updates cannot be staggered per cascade.** `autoUpdate` /
  `needsUpdate` live on `WebGLShadowMap` globally, not per light. Toggling
  `castShadow` on individual cascade lights would re-index three's shadow
  arrays and break CSM's cascade-to-map mapping.
- **But `renderer.shadowMap.render(lights, scene, camera)` is directly
  callable**, and with `autoUpdate = false` its early-out leaves already
  rendered maps intact. That is the escape hatch for anything needing
  per-cascade caster sets: render near cascades and far cascades in separate
  manual calls, swapping caster state between them, without touching
  `castShadow` on the lights. Entry point confirmed; the full flow is not yet
  proven — validate it before designing on top of it.

## Option 3 — Visible-region caster culling — DONE 2026-08-15

Implemented in `src/graphics/lighting/ShadowCasterCulling.js`, driven from
`City.update` while cascaded shadows are active. Results below; the rest of
this section is kept as the record of what was built.

Measured (same methodology as the saved baselines, 3.1% reference drift):

| mode | before | after | draw calls |
| --- | --- | --- | --- |
| cascaded x4 | 24.18 ms | **20.15 ms** | 9,862 -> 6,100 |
| x4 `splitScale=0.75` | 20.90 ms | **16.25 ms** | 8,170 -> 5,443 |
| cascaded x3 | 21.33 ms | **14.02 ms** | 8,098 -> 5,038 |
| cascaded x2 | 18.45 ms | **12.99 ms** | 6,907 -> 4,255 |

Only 250-400 of 2,051 casters survive a typical frame. The win grows with sun
angle: at 28 deg elevation the bus-level frame went 30.27 -> 15.02 ms
(19,553 -> 7,281 calls), because long shadows had been forcing the whole city
through every cascade.

**Correctness gate passed: the rendered image is pixel-identical with culling
on and off** (max channel delta 0-1) at four camera/sun combinations including
a low sun. Data in `tests/benchmarks/shadow_culling_correctness_*.json`.

**Trap found while building it:** an `InstancedMesh`'s *geometry* bounding
sphere covers a single instance at the origin, not the spread of all of them.
Using it culled whole blocks of instanced facade detail — visible as a small
but real image diff (~0.04% of pixels) that only disappeared after switching to
`InstancedMesh.boundingSphere` (via `computeBoundingSphere()`), which does span
every instance. Buildings alone hold 1,091 instanced meshes over 31,812
instances, so this is not an edge case. The pixel-diff gate is what caught it;
a visual check would not have.

Remaining ideas for this option, not done: extend culling to the single fitted
map path (its box is already small, so the gain is likely marginal), and skip
the per-frame sphere test for casters far outside the frustum by bucketing them
spatially if the CPU cost ever shows up (it does not today).

### Original brief

Cheapest to build, no new geometry, helps all four cascades at once.

- Each frame, switch `castShadow` off for casters that cannot cast into the
  camera's view, and back on when they can.
- Test: sweep the caster's world bounding sphere along the anti-sun direction
  by its own shadow length (`height / tan(sun elevation)`), and keep the caster
  if that swept capsule intersects the camera frustum.
- Clamp the frustum's far plane to the CSM `maxFar` — shadows past the horizon
  do not matter.
- Cache the world bounding sphere per static mesh; the city does not move.
  Never cull registered dynamic roots (the bus).
- Be conservative: pad the test. Missing a caster is a visible popping bug,
  keeping a spare one costs a draw call.
- Restore every `castShadow` flag on teardown and when the mode is switched
  off.

## Option 4 — Merged shadow casters (silhouette merge) — DONE 2026-08-15

Implemented in `src/graphics/lighting/ShadowCasterMerge.js`, built once per
city in `City`, switched by the `mergeCasters` shadow setting (Options ->
Graphics -> Shadows -> Merged shadow casters, or `?shadowMergeCasters=0`).

**Earlier drafts of this section proposed coarse box proxies. That was wrong
and has been replaced.** A box deletes geometry, so rooftop bulkheads, plant
rooms and cornice lines stop casting — and since the proxy has to be inset, the
facade renders lit exactly where its roof shadow belongs. Those details are
what cascaded shadows were bought for; the mask overlay from AI_484 shows them
as the bulk of what cascaded added over the fitted map.

The real cost was never geometry, it was **material splits**. A building is
drawn as several meshes, and meshes carry multiple material groups, each of
which is its own draw — in the shadow pass too. The shadow pass is depth-only
and ignores materials entirely, so all of a building's opaque geometry can cast
from one mesh holding the same triangles. Same silhouette, same self-shadowing,
fewer draws. Lossless.

Measured (bus-level, cascaded x4, with Option 3 also active):

| scene | merge off | merge on |
| --- | --- | --- |
| bus level | 8,183 calls | **4,618** |
| raised | 6,697 | **3,948** |
| rooftop level | 6,697 | **3,810** |
| rooftop level, low sun | 5,557 | **3,436** |

66 buildings merged, collapsing 1,602 source draws to 66. **Pixel-identical
with the merge on and off** across all four scenes, including a rooftop-level
camera framing exactly the bulkhead and cornice self-shadowing this had to
preserve.

Constraints found while building it:

- **Not merged: `InstancedMesh`.** Its instances would need expanding into real
  geometry (31k+ city-wide) and it already draws in one call.
- **Not merged: alpha-tested or transparent casters.** Their silhouette comes
  from a texture an untextured merged mesh cannot reproduce.
- **`mergeGeometries` returns null — silently — when some inputs are indexed
  and others are not.** Buildings hit this every time (indexed wall mesh with
  material groups, non-indexed roof mesh), so the merge produced nothing at all
  until every part was given an index. There is no exception to catch; the only
  symptom is an empty result.
- **The culler (Option 3) owns `castShadow` at runtime.** It captures its caster
  list once, so toggling the merge has to release the culler, switch the caster
  set, then let it re-capture — otherwise the culler restores the flags it
  remembered and the toggle appears to do nothing on some cameras.
- The merged mesh must stay visible to the camera (see the layer finding
  above); `colorWrite: false` + `depthWrite: false` make it draw nothing.

## Option 1 — Coverage tuning defaults

`splitScale` already exists (`?shadowSplitScale=`, clamped 0.5-2.5) and scales
every cascade split plus `maxFar`. It is a range-versus-sharpness dial that
happens to help cost, because shrinking the boxes drops casters *and* tightens
texels at once:

| setting | frame | draw calls | reach | m/texel |
| --- | --- | --- | --- | --- |
| 1.0 (default) | 24.18 ms | 9,862 | 340 m | 0.012 / 0.024 / 0.051 / 0.185 |
| 0.75 | 20.90 ms | 8,170 | 255 m | 0.009 / 0.018 / 0.038 / 0.138 |
| 0.55 | 19.62 ms | 7,291 | 187 m | 0.007 / 0.013 / 0.028 / 0.101 |

- Decide whether the shipped default should stay 1.0 or move to ~0.75, once
  Options 3/4 have changed the cost picture. Re-measure before deciding; the
  right default after culling is probably *higher*, not lower, since range
  becomes affordable again.
- Surface it in the options UI only if it still earns its place as a user-facing
  trade after 3 and 4 land. Cascade *count* should be retired as a performance
  option either way: x4 at 0.55 costs about the same as x2 while being ~4x
  sharper near the bus.

## Where the remaining shadow cost is NOT (2026-08-15)

After Options 3 and 4 landed, each remaining lever was measured with the GPU
idle and the scene frozen. **None of them dominates**, which is why the merge
felt like ~1 ms in live play despite halving draw calls:

| lever | effect | note |
| --- | --- | --- |
| draw calls (the merge) | ~1 ms live, ~5 ms in bursts | CPU submission cost; the frame is not CPU-bound. `gl.finish()` bursts serialise CPU and GPU and so flatter it |
| shadow map resolution | **0 ms** | 8192/8192/8192/4096 vs 2048/2048/2048/1024 — 16x fewer texels, 26.31 vs 26.78 ms |
| tree shadows | 0.1-0.7 ms | ~310 draw calls over 4 cascades, 22-30 casters, none alpha-tested |
| `CSM_FADE` | under 1 ms, unresolvable | medians 13.77 vs 13.15 ms, but per-state spread 23-40% — samples overlap |
| cascade count | flat | x2 / x3 / x4 within noise of each other post-culling |

Two conclusions worth carrying forward:

- **Resolution is free in time, so spend texels.** The 832 MiB buys sharpness
  at no frame cost. It is only worth trimming if a target machine is short of
  VRAM, and that trade is pure quality-for-memory, not quality-for-speed.
- **Keep `fade` on.** It costs under a millisecond and buys the smooth cascade
  transition that the 45 m boundary needed.

### What the cost actually is: geometry throughput

A per-pixel receiver hypothesis was proposed here and **tested and rejected** —
shrinking the viewport did not reduce the shadow delta. The answer came from
measuring configs round-robin inside one warm page (see the methodology note
below) and reading triangle counts alongside time:

| config | median | vs off | triangles/frame |
| --- | --- | --- | --- |
| off | 8.36 ms | — | 1.46M |
| high (single fitted map) | 10.56 ms | +2.20 ms | 2.36M |
| cascade x2 | 13.89 ms | +5.53 ms | 5.46M |
| cascade x4 | 16.82 ms | +8.46 ms | 7.75M |

Cost per extra million triangles: 2.44 / 1.38 / 1.34 ms — near-linear. **The
shadow cost is vertex/geometry throughput**: the city's triangles are
transformed once per cascade, so x4 pushes ~6.3M extra triangles per frame,
about 4.3x the scene's own 1.46M. That single fact explains every earlier
result: resolution is free (not fill-bound), the caster merge bought ~1 ms
(not submission-bound), and per-pixel work is irrelevant (not raster-bound).

**So the remaining lever is triangles, not draws.** Concretely:

- Shadow-caster geometry LOD: a decimated version of each building for the far
  cascades. This is the box-proxy idea resurrected for the right reason — but
  it must preserve the silhouette and roof line, so decimation rather than
  replacement. Every triangle removed from cascade 2 and 3 is removed 1-2x per
  frame.
- Cascade count is a direct multiplier and already exposed: x2 costs 5.53 ms
  against x4's 8.46 ms.
- Do NOT spend more effort on draw calls or map resolution. Both are measured
  and near-free.

# Verification

- Re-run `tests/benchmarks/` methodology and compare against the saved
  baselines. Follow its README exactly: **close the game first**, verify the
  server serves the working tree, and measure a reference config first and last
  (>15% drift voids the run).
- **Correctness gate for Option 3/4: the shadow mask must not change.** Capture
  shadow-on versus `light.shadow.intensity = 0` for each mode and diff the
  masks with culling on and off, at several camera poses and at least one low
  sun elevation (long shadows from off-screen casters are exactly what a naive
  cull drops). Any pixel shadowed before and not after is a bug, not a saving.
- Drive a route, not just static poses: culling bugs show up as shadows popping
  in at the edge of view while moving.
- Report draw calls and ms per cascade, before and after.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
