DONE (2026-08-15)

#Problem

Sun shadows use a single directional light with a single shadow map, so shadow
resolution and shadow coverage are one dial traded against each other.

As of 2026-08-15 the shadow camera is fitted to the view
(`City._updateSunShadowFocus`, added in `7c49366`): 110 m half extent, texel
snapped, centred slightly ahead of the camera. Measured in BigCity2:

- 0.161 m/texel (whole-map extent) -> **0.054 m/texel** (view fitted), 3x sharper
- scene render 2,084 -> 1,515 draw calls
- but **buildings beyond ~110 m of the camera no longer cast ground shadows**

Tightening the radius further sharpens near shadows and loses more distant ones;
widening it restores distant shadows and brings back jagged edges. A single map
cannot do both. Cascaded shadow maps (CSM) split the view frustum into depth
ranges, each with its own shadow map, giving crisp shadows near the bus *and*
shadows out to the skyline.

# Request

Add cascaded shadow maps behind a shadow-quality option, keeping the current
single fitted map as the fallback. This needs two ownership refactors first,
because CSM wants to own things the codebase currently owns.

## Verified groundwork (2026-08-15 — do not re-derive)

- **The addon is reachable at the pinned version.** `index.html` maps
  `three/addons/` to `https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/`;
  both `csm/CSM.js` and `csm/CSMShader.js` return HTTP 200 there. three is CDN
  only — there is no local `node_modules/three`.
- **The shader architecture is compatible.** `MaterialVariationSystem.js:1792`
  and `MaterialUvTilingSystem.js:94` both *chain* `onBeforeCompile` (capture the
  previous function, call it inside the new one). three's `CSM.setupMaterial()`
  **overwrites** `material.onBeforeCompile`, so CSM must be applied *before*
  those wrappers, or its injection must be adapted into the same chaining style.
- **VRAM improves.** 3 cascades at 2048^2 ~= 50 MB total vs the current single
  4096^2 map at ~67 MB.
- Expected texel density for a 3-cascade split at 2048^2 (today: 0.054):
  near 0-30 m -> ~0.020 m/texel; mid 30-90 m -> ~0.054; far 90-300 m -> ~0.161.
  At 4096^2 per cascade, halve each.

## Stage 1 — Sun light ownership refactor

`City` creates one `THREE.DirectionalLight` (`City.js`, sun setup ~line 98) that
currently serves four separate purposes: scene lighting, shadow casting,
direction reference, and visual rig anchor. CSM replaces the lighting+shadow
half with N cascade lights, so the other halves must stop depending on that one
object.

Tasks:
- Identify a single "sun reference" (direction + intensity + colour) that is
  independent of whichever light object actually renders shadows.
- Re-point the rigs that currently take the light directly:
  `SunFlareRig` (constructor throws without `light`; derives direction from
  `light.position - light.target.position`), `SunBloomRig`, `SunRaysRig` — all
  constructed in `City.js` with `{ light: this.sun, ... }`.
- Keep `_applyAtmosphere` (azimuth/elevation -> direction) driving that reference
  rather than mutating a specific light. Note it already had to stop reading
  `sun.position.length()` as a radius, because the shadow focus moves the light;
  the nominal distance is cached in `City._sunShadowFocus.nominalDistance`.
- Preserve `applyShadowSettings(engine)` behaviour (bias/normalBias/radius/
  mapSize/`twoSidedCasting`) for whichever light(s) end up casting.
- No visual change at this stage: flare, bloom, rays, atmosphere and shadows must
  look identical before and after.

## Stage 2 — Material shader-chain choke point

Every shadow-receiving material must be registered with CSM, and registration
must not clobber the existing chained `onBeforeCompile` hooks.

Tasks:
- Add one place that prepares a material for scene shadows, applied at material
  creation, before `MaterialVariationSystem` / `MaterialUvTilingSystem` wrap it.
- Cover all receivers: buildings (fabrication + legacy), roads, terrain, props,
  vehicles. Materials are created in many systems; prefer a choke point over a
  scene traversal, but handle materials that appear later (the city rebuilds, and
  `BuildingGeometryMerger` may hand back canonical shared instances).
- Chain rather than overwrite: adapt CSM's injection to the existing
  "capture previous, call it" convention instead of calling `setupMaterial`
  directly if that is what it takes.
- Keep the non-CSM path byte-identical when the option is off.

## Stage 3 — Cascaded shadow maps

Tasks:
- Add a `cascaded` shadow quality (or a `cascades` field) to
  `src/graphics/lighting/ShadowSettings.js`, which currently exposes
  `off/low/medium/high/ultra` presets carrying `mapSize`, `bias`, `normalBias`,
  `radius`, `shadowMapType`, `twoSidedCasting`. Surface it in the options UI
  (`src/graphics/gui/options/tabs/renderGraphicsTab.js`, shadow quality row).
- Thread the setting into city construction: `getSharedCity(engine, options)`
  (`City.js:560`), called from `GameplayState.js:265` via
  `getGameplayCityOptions()` (`GameplayState.js:78`) and from `MapDebuggerState`.
- Default to 3 cascades at 2048^2, configurable to 2 cascades; keep the existing
  single fitted map as the fallback when the option is off, including
  `sunShadowFocusEnabled` / `sunShadowRadiusMeters`.
- Drive `csm.update(camera)` per frame from `City.update(engine)` and keep the
  cascade light direction synced with the atmosphere sun direction.
- Verify texel snapping per cascade (stock CSM.js already snaps — see the
  verified fixes below; without it edges crawl while driving).
- Tune split distances for a bus-level camera; verify no visible seam where
  cascades meet, and that shadow bias works at every cascade scale (bias tuned
  for a 220 m map is usually wrong for a 40 m one).
- Dynamic casters (the bus) must stay correct across cascade boundaries.

### Verified fixes for the two visible failure modes (2026-08-15 — do not re-derive)

Checked against the pinned `three@0.183.2` `examples/jsm/csm/CSM.js` on the CDN:

- **Edge crawl while driving.** Cascades re-fit to the camera every frame, so
  edges would shimmer as the boxes move — but stock `CSM.update()` already
  snaps each cascade centre to whole shadow-map texels in light space
  (`_center.x = Math.floor(_center.x / texelWidth) * texelWidth`), the same
  technique as `City._updateSunShadowFocus`. The fix is built in; the Stage 3
  task is to verify it holds in gameplay, not to reimplement it. Two limits:
  snapping only helps while the light *direction* is stable — a changing
  atmosphere sun re-shimmers edges for a frame (already true today) — and
  `shadowMapSize` is a single constructor value shared by all cascades.
- **Pop when an object crosses a cascade boundary.** The resolution step at a
  split is hidden with `csm.fade = true` — a public property set after
  construction, not a constructor option. It expands each cascade's bounds by
  a fade margin and sets the `CSM_FADE` shader define so neighbouring cascades
  blend across the split instead of hard-switching. Two costs: the margin
  slightly worsens m/texel per cascade, and toggling `fade` at runtime changes
  material defines and forces shader recompiles — so it interacts with the
  Stage 2 chaining choke point. Decide fade on/off at construction and treat
  it as fixed; default it on.

## Verification

Measure and report before/after: scene render draw calls, shadow pass cost
(render with `renderer.shadowMap.enabled = false` to isolate it), m/texel per
cascade, and shadow-map VRAM. Capture gameplay at bus level and from a raised
view to check near sharpness and distant coverage together.

Compare fallback vs CSM at multiple camera poses, not just one:

- **Performance per pose:** measure the metrics above at several `?pose=`
  captures (bus level, raised view, dense downtown, sparse edge). Render each
  pose several times and discard the warm-up build (trap 2 below) so the
  numbers are verified stable, not noise; report a per-pose before/after table.
- **Quality per pose:** paired screenshots at identical poses, fallback vs CSM.
  The expected trade at distance: the fallback shows *no* shadows beyond the
  ~110 m focus radius, CSM shows lower-resolution shadows there — capture both
  so the trade is visible, plus a near-detail crop to confirm the near cascade
  is sharper than today's single map.
- **Motion check:** capture a short drive toward a distant building and confirm
  its shadow sharpens smoothly as it crosses cascade boundaries — no pop at the
  seam, no edge crawl while moving (cascades re-fit to the camera every frame,
  so texel snapping is what keeps edges stable).

Three traps that cost real time on 2026-08-15 — do not fall into them again:

1. **The `?pose=` capture harness pauses the game loop** (`GameLoop.update`
   returns early when `paused`), so `City.update` never ticks and per-frame
   shadow code appears dead. Tick the city explicitly in probes.
2. **A scenario's first build in a fresh page renders differently from later
   builds** (cold caches; builds 2+ are pixel-identical). Always discard a
   warm-up build before comparing screenshots, or a ~18% pixel diff will be
   misattributed to whatever was just changed.
3. **The perf bar's draw call number is a whole-frame accumulation** across
   shadow + scene + AO/bloom/composite passes — `PostProcessingPipeline.render()`
   sets `info.autoReset = false` and resets once per frame. It is not "objects on
   screen".

## Risks

- CSM touches scene-wide lighting; subtle regressions are most likely in sun
  flare, sun bloom, sun rays and atmosphere response. Keep the fallback path and
  A/B against it.
- N cascades means N shadow renders per frame. Total cost should land between
  today's fitted map and the old whole-map behaviour, but it must be measured,
  not assumed.
- Shadow acne/peter-panning tuning is per-cascade work, not a single bias value.

## Completion summary (2026-08-15)

- Stage 1: `City.sunRef` (direction/intensity/color) is the single sun source; flare/bloom/rays rigs, atmosphere, shadow focus, and the OptionsState intensity poke all read it (rigs keep `light` fallback for debugger scenes). Verified pixel-identical to pre-refactor baseline: diff vs HEAD == same-code noise floor on all 3 poses, draw calls exactly equal.
- Stage 2: `SceneShadowMaterials.js` choke point — global registry, hard no-op when no system is active; registration is post-merge (BuildingGeometryMerger dedup preserved) at `City.attach`, plus `city.registerShadowReceivers(busAnchor)` from GameplayState.
- Stage 3: `CityCascadedShadows.js` wraps the three CSM addon with chained (not overwritten) `onBeforeCompile`, custom teardown (stock `csm.dispose()` would delete chained wrappers), fade on, custom splits 30/90/300 m, per-cascade normalBias scaled by texel density; `cascaded` quality in ShadowSettings (+`cascades` field, `?shadowCascades=`), options UI row, per-frame `updateFrame` from `City.update`.
- Setting threading deviation: the mode rides `engine.shadowSettings` through `applyShadowSettings(engine)` (same channel as other shadow knobs) rather than `getSharedCity` construction options — works for Gameplay + MapDebugger, and makes the mode live-switchable (verified cascaded->high->cascaded: lights, defines, and materials restore cleanly).
- Latent bug fixed by Stage 1: SunBloomRig/SunRaysRig derived direction from `light.position.normalize()`, which drifts once the shadow focus moves the light off-origin; they now read the stable sunRef direction.
- Measured (1280x720, RTX 3060, burst renders with gl.finish, 3 rounds x 40 frames, warm-up discarded; poses: bus_level/raised/street_far):
  - m/texel per cascade 0.033 / 0.097 / 0.325 (vs 0.054 single fitted, 0.161 old whole-map); VRAM 48 MB (3x2048^2) vs 67 MB (4096^2).
  - Whole-frame draw calls high->cascaded: 6094->14450 / 2653->8041 / 4649->11673 (shadow passes re-render the city up to 3x; scene pass unchanged).
  - Shadow-pass burst cost: high ~3.5-4.2 ms, cascaded ~15-23 ms — ABOVE the predicted "between fitted and whole-map" ceiling because every cascade box overlaps the city core. Candidate mitigations if it matters in play: per-cascade caster culling, staggered far-cascade updates, maxFar 200, or 2 cascades (`?shadowCascades=2`).
  - Quality: near shadows crisp in both; fallback's shadow cutoff at the 110 m focus edge visible in `raised` pose; cascaded carries the same shadow fully across. No seam/pop crossing 90 m and 30 m splits during a simulated drive. Sun flare/bloom/rays pixel-identical between modes. Zero console/page errors.
  - Artifacts: `tests/artifacts/screens/csm/` (paired per-pose PNGs, motion keyframes, sun-gaze pair, per-mode report JSONs).
- Tests: `tests/node/unit/shadow_settings_cascaded.test.js` (8) — settings sanitization + choke-point contract. Full node suite: only pre-existing failures (wall decorator catalog, options preset promotion gap, assets pipeline, markings AA registry, texture correction — all fail on clean HEAD too).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
