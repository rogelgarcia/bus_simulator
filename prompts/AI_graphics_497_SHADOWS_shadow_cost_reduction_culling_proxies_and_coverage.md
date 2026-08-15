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

## Option 4 — Per-building shadow proxies

Highest ceiling, most work. At 0.185 m/texel a building's ledges and window
frames contribute nothing to its shadow, so a coarse box is indistinguishable
from the real facade.

- Build one coarse proxy per building (extruded footprint, or the merged
  bounding box) and substitute it for that building's ~20 merged material
  chunks beyond ~90 m.
- Proxies must sit inside the real geometry so they never poke out, and are
  slightly inset to avoid z-fighting.
- Note the layer finding above: a proxy that casts shadows is also drawn in the
  main pass. That is acceptable (it is occluded, ~100 extra calls) but must be
  measured, not assumed.
- The per-cascade version — proxies for far cascades only, detail for near — is
  the bigger win, and needs the manual `shadowMap.render` path above.
- Savings multiply against Option 3 on the remainder, not on top of it: a
  building already culled gains nothing from having a proxy.

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
