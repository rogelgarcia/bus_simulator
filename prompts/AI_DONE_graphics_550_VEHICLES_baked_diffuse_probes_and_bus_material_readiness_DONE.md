# DONE

# Problem

The moving bus does not receive the spatial baked diffuse illumination of its
surroundings. Uniform ambient/environment lighting cannot reproduce nearby
wall and road bounce or the change between exposed and sheltered streets.

The user also reports that the bus appears nonreflective. The source audit
finds that City Bus loads OBJ/MTL materials through MTLLoader, which creates
MeshPhongMaterial; the managed IBL hookup skips materials without
`envMapIntensity`. Coach and Double Decker use GLTF materials and set body
roughness to 0.62 and metalness to 0.12. Global lighting defaults enable IBL,
but the user's current saved settings and selected bus were not inspected.
Diffuse GI and glossy reflections are different contributions.

# Request

This owns daytime-shortlist item 1, originally scheduled second after AI 549.
AI 549's architectural glass changes are not a technical prerequisite for the
bus material/probe implementation; use the actual current static scene as the
source and preserve its validation contracts. Add baked spatial diffuse GI for
the moving bus and make its materials ready to receive the intended lighting.
Preferred strategy: **hybrid** — static baked irradiance plus runtime sampling,
live direct sunlight and moving shadows.

Deliver the complete material and diffuse-probe scope behind a reversible,
default-off feature toggle. AI 560's lighting experiment is not a prerequisite:
the feature can be completed and evaluated using today's accepted lighting.
Changing the source lighting later requires compatible probe data to be rebaked
and revalidated, not a new implementation of the probe system. Local specular
reflection probes remain AI 551's separate scope.

Tasks:

- Verify resolved materials and environment assignment on City Bus, Coach and
  Double Decker after asynchronous loading, cloning and switching models.
  Distinguish absent environment binding from disabled/overridden IBL,
  excessive roughness, inappropriate material response and lighting balance.
- Bring City Bus's relevant surfaces into the game's supported PBR lighting
  path, preserving texture/color-space intent, paint identity, glass/lens
  visibility, wheel materials and lamp/rig behavior. Tune the other buses only
  where the audit demonstrates a need. Give paint, rubber, glass and exposed
  metal distinct plausible responses; ordinary paint must not become a chrome
  bus. Consider clear coat for a justified painted finish, not as a prerequisite
  for diffuse GI. Do not increase metalness merely to make paint reflect more.
- Bake a spatial representation of indirect diffuse illumination for a
  representative daytime route, including useful wall/road color bounce and
  local sky visibility. Reuse the existing bake source/profile/publication
  contracts. The bus is a moving receiver, not a stationary object stamped
  into the static bake; it must not contaminate captures at its initial pose.
  Register the process as a domain/leaf in the established `node tools/bake.mjs`
  hierarchy and reuse `tools/baking/blender.local.json`; do not add a separate
  machine-specific bake runner. Build the initial field for the current accepted
  source profile, with explicit coverage, rather than waiting for AI 560.
- Sample illumination across the bus with directional response sufficient for
  its size, orientation and surface normals. Long vehicles crossing shelter
  boundaries must not change as one uniformly lit point. Keep interpolation
  stable in motion and limit leakage through walls and overhangs.
- Integrate indirect light into the material's diffuse response without baking
  receiver paint color into the irradiance. Retain direct sun and the existing
  static-world/moving-object shadow system. Replace or coordinate overlapping
  hemisphere/environment diffuse fill and AO; adding probes on top of the
  full old ambient term must not overlight the bus. Preserve specular IBL.
- Define coverage, density/quality budgets, scene/profile freshness, streaming
  and a continuous fallback outside valid coverage. Make it possible to see
  which contribution is active and why data is absent or stale. Support model
  replacement and cleanup without stale material bindings or resource growth.
- Keep future local reflection probes (AI 551) compatible with these materials.
  They supply a separate specular contribution. Pure metal receives little or
  no base diffuse response; glass is not made realistic by diffuse GI alone.
- Update the illumination and vehicle/material specs and the lighting reference
  with the actual coverage, material migration, composition and limitations.

## Reversible rollout and comparisons

- [x] Add one player-facing **Enhanced bus lighting** toggle, off by default for
  new and existing settings. On requests corrected materials and compatible
  spatial diffuse probes; Off restores the pre-AI-550 bus rendering path,
  including its material/environment bindings and ambient/AO composition under
  the same current user settings. Do not restore an old snapshot of unrelated
  global lighting settings or disable accepted static-world AI 548 lighting.
- [x] Keep separate developer comparison controls for material correction and
  probe contribution. Support original, materials-only, compatible-material
  probe-off/probe-on, and combined comparisons. Probe-only means toggling GI on
  a fixed compatible material; it must not silently convert legacy City Bus
  materials or pretend that an unsupported legacy-material combination works.
  Show an explicit reason for unsupported combinations. These controls must not
  turn into multiple redundant player-facing feature switches.
- [x] Preserve the original material definitions and construct isolated enhanced
  variants without destructively modifying shared model templates or textures.
  Switch the complete material/binding set at a frame boundary, including any
  depth/shadow variants that need matching alpha semantics. Preserve rigs,
  lamps, glass visibility, paint selection and wheel state. Repeated toggling,
  asynchronous loads and model replacement must not leave mixed old/new shaders,
  stale probe uniforms or accidentally changed materials on another vehicle.
- [x] Integrate toggle persistence, Save/Cancel/Reset and preset import/export
  with the existing settings conventions. Distinguish requested enhancement
  from effective material/probe state. Global Current mode must perform no
  probe bake fetches or application; Auto/Baked must honor current channel
  selection, compatibility and activation contracts. An enhanced material may
  still use valid live lighting when probes are unavailable. Clearly expose
  loading, applied, off and fallback/unavailable reasons without claiming that
  enabling the toggle guarantees baked GI.
- [x] On missing, stale or out-of-coverage probes, retain usable enhanced
  materials and restore their ordinary live diffuse fill while keeping direct
  lighting and specular IBL coherent. Blend spatial coverage transitions; never
  blend in stale/incompatible data. Follow the existing runtime coordinator's
  atomic activation rules when probes participate in a selected baked set, and
  document that transaction boundary rather than introducing a bypass.
- [x] Turning the feature off must cancel pending feature-specific activation,
  prevent late asynchronous callbacks from reapplying it, and stop probe
  sampling/updates and feature-specific render passes. A cold start with Off
  must not load probe data or prepare enhanced variants. Any previously loaded
  resource cache must be bounded, disclosed in memory measurements and disposed
  on the appropriate scene/model lifetime; do not claim zero memory overhead
  after toggling off if resources remain cached.
- [x] Verify interactions with sun/hemisphere/IBL source changes, reflections,
  exposure/tone mapping, global lighting modes, static indirect/AI 548, dynamic
  AO/underbody and shadow settings. Source changes must use exact-compatible
  probe data or an explicit fallback; display-only changes must not rebake.
  Changing only a moving receiver's material mode must not contaminate the
  static bake source or unnecessarily invalidate unchanged world lighting.
- [x] Before altering materials or publishing new probe data, preserve original
  game captures, settings and existing bake identities at the supplied AI 560
  cameras where available. Keep those G00 baselines immutable. Record feature
  state, resolved materials and probe identity in later captures so AI 560 can
  compare original and enhanced game results explicitly. For controlled Cycles
  variants, use a fixed chosen material set and let Cycles calculate transport;
  do not multiply the game's probe lighting into the exported materials.

## Acceptance and evidence

- Capture a fixed daylight route with a colored wall, open road, overhang and
  shelter transition. Show all three buses, with City Bus as a required material
  regression case. Verify visible wall-color bounce and sheltered/exposed
  differences while direct shadows and wheel/chassis grounding remain coherent.
- Compare the same camera/lighting in four states: original baseline,
  material correction only, probes only on a compatible fixed material, and
  corrected materials plus probes. An improved glossy highlight must not be
  reported as proof that diffuse GI works. Include a moving-camera/vehicle
  sequence to reveal leakage, popping or flicker.
- Verify actual published data loading, probe contribution, expected material
  types and environment bindings, transition behavior, invalidation/fallback
  and resource lifetime with focused tests. Run the appropriate existing vehicle,
  illumination and visual checks.
- Test cold-start Off, On/Off/On restoration, toggling during loading, model
  switching, Save/Cancel/Reset and reload, invalid probe profiles, and leaving
  coverage. Verify Off reproduces the original rendering under matched settings
  and that On becomes effective again after earlier cancellation/fallback.
  Compare the full toggle and individual developer contribution controls so
  identical-looking results cannot conceal a broken material/probe switch.
- Save captures, diagnostics and generated reports under
  `tests/artifacts/screens/ai550_bus_diffuse_probes/`.
- Measure gameplay cost and memory at representative traffic/probe coverage,
  including all enabled lighting and shadows. A baking benefit must be
  supported by visible results and measured cost, not assumed from the label.
  Report original baseline, feature Off, materials-only and combined On under
  matched conditions, including cold-start and retained-cache memory where
  relevant. Completing this AI requires the actual probe bake, runtime delivery,
  material integration and evidence, not just the toggle or a material-only pass.

## Completion — 2026-09-08

- Added a default-off player master and independent developer material/probe controls, using existing Options persistence and HUD status.
- Added isolated City Bus PBR variants with dielectric paint, clearcoat and distinct glass/rubber/metal response; preserved original materials, shared textures and controller-owned lamps.
- Audited all three buses after loading: the original City Bus already had environment maps bound, correcting the source-audit inference above; Coach and Double Decker retain their authored PBR values.
- Added calibrated, authenticated sky/bounce probe jobs to the shared bake hierarchy and published the accepted-profile field: 2,640 probes, 2,628 valid, four bounded BigCity2 route regions.
- Added per-surface directional diffuse sampling, static depth rejection and continuous live fallback, preserving direct sunlight, moving shadows, material AO and specular IBL.
- Integrated atomic activation, source/profile validation, cancellation, model removal and bounded cache disposal; cold Off does no probe fetch or variant preparation.
- Preserved the five original camera baselines and captured all three bus families, independent contribution modes, a moving sequence and outside-coverage fallback.
- Passed focused field/material/UI/transaction/HUD checks, the real-game On/Off/Current restoration test and the existing bus-underside regression.
- Documented the implementation, actual source/field identities, initial coverage and measured limits in the [vehicle specification](../specs/graphics/vehicle_diffuse_probes.md) and [validation report](../specs/graphics/vehicle_diffuse_probes_validation.md).

Original captures: `tests/artifacts/screens/ai550_bus_diffuse_probes/before/`.
Final comparisons and all-model measurements:
`tests/artifacts/screens/ai550_bus_diffuse_probes/comparison-final/`.
The original static receiver index remains SHA-256
`51c32331bee116823991ce4bbf5d0fe1796c617d4232218bc80f63a51a13c9ea`.

Same-condition City camera 01 measurements on NVIDIA RTX 3060, Windows/Chrome,
1920×1056 game canvas, one paused bus, accepted world shadow/indirect bake, high
shadows, Dynamic Only AO, MSAA, ACES exposure 1.02, sun 7 / hemisphere 1.22 / IBL
0.28. Median of 115 samples after 60 warm-up frames and five discarded samples:

| State | Frame ms | FPS | Whole-frame GPU ms | Draw calls / triangles | Probe CPU / GPU MiB |
|---|---:|---:|---:|---:|---:|
| Original runtime | 33.30 | 30.03 | 11.46 | 911 / 958,493 | 0 / 0 |
| Feature cold Off | 18.00 | 55.56 | 9.75 | 911 / 958,493 | 0 / 0 |
| Materials only | 34.60 | 28.90 | 11.20 | 911 / 958,493 | 0 / 0 |
| Materials and probes | 17.80 | 56.18 | 10.24 | 911 / 958,493 | 2.82 / 2.82 |
| Off after use | 17.60 | 56.82 | 9.35 | 911 / 958,493 | 2.82 / 2.82 |

Sequential frame pacing/driver warming varied; these results do not establish a
speedup. Isolated CPU/GPU lighting time and total driver memory are **not measured**
because the engine/WebGL does not expose those counters. Multi-vehicle traffic
cost is **not measured**. See the report for p95, complete settings, other models,
retained material/program caches and the spatial coverage limits. This initial
field is not whole-city coverage, full dynamic GI or local specular reflections.

## Starting references

- [Lighting reference and material audit](../specs/graphics/lighting_enhancement_reference.md).
- [Illumination composition](../specs/graphics/illumination_framework.md), [receiver lightmaps](../specs/graphics/receiver_lightmaps.md), and [dynamic sun shadows](../specs/graphics/dynamic_sun_shadow.md).
- [City Bus](../src/graphics/assets3d/models/buses/CityBus.js), [Coach](../src/graphics/assets3d/models/buses/CoachBus.js), and [Double Decker](../src/graphics/assets3d/models/buses/DoubleDeckerBus.js).
- [IBL integration](../src/graphics/engine3d/lighting/IBL.js) and [resolved lighting settings](../src/graphics/lighting/LightingSettings.js).

## On completion

- Mark the AI document as DONE in the first line only when all required work is complete.
- Rename in `prompts/` to `AI_DONE_graphics_550_VEHICLES_baked_diffuse_probes_and_bus_material_readiness_DONE.md`.
- Do not move to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change and links to evidence.
- Include a same-condition before/after performance table: frame time/FPS,
  CPU/GPU lighting time, draw calls, probe count, coverage, texture/buffer memory
  and relevant traffic workload. State hardware, resolution, graphics settings,
  workload/camera, warm-up, sample count and statistic. Label unavailable metrics
  `not measured` with a reason; projections do not replace measurements.
