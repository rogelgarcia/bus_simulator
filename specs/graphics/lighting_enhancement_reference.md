# Lighting enhancement reference

## Purpose and interpretation

Reference assessment requested by the user on 2026-09-05. It preserves the full
lighting/baking comparison and identifies daytime opportunities for subsequent
planning. It does not change renderer behavior, enable experimental features,
close AI prompts, or replace the acceptance requirements of the owning specs.

Implementation status is a snapshot of this checkout, based on code, specifications
and prompt completion/disposition records. An open prompt may contain shipped
slices; a DONE prompt may record a rejected, reverted or deferred result.
"No dedicated prompt found" describes the audit, not a permanent absence.

- 🟢 High visual benefit; 🟡 moderate; 🔴 low. Ranges indicate scene dependence.
- Ratings are qualitative expectations, not measured performance or promised
  improvements over the current frame. Foundational effects already present are
  identified separately from additional improvements that baking might deliver.
- Baked means precomputed data tied to a declared geometry/material/light profile,
  including static data generated on demand. It still requires runtime sampling.
- Runtime means calculating the relevant changing contribution while playing.
- Baked strategy can include normal runtime texture/probe evaluation. That alone
  does not turn every bake into a hybrid strategy.
- Hybrid strategy combines precomputed static lighting with independently updated
  direct light, moving shadows, dynamic contributions or reflection updates.
- Preferences describe a target architecture, not approval to promote current
  preview assets or a claim that they save frame time.

## Full numbered comparison

| # | Type of light / enhancement | Implemented / future AI status | Baked doable? | Runtime doable? | Preferred approach | Visual improvement expected |
|---|---|---|---|---|---|---|
| 1 | Direct sunlight — diffuse | Runtime and optional baked controls retained; AI 533 accepted with AI 548. | Yes, fixed sun/static surfaces. | Yes, already relatively inexpensive. | Runtime with cached static shadows. | 🔴 Little additional visual improvement from baking the existing sun calculation. |
| 2 | Sky / ambient diffuse illumination | Runtime exists; sky contribution included in mapped baked indirect. | Yes, including local sky obstruction. | Yes; accurate local visibility costs more than uniform ambient. | Hybrid: runtime environment plus baked local illumination. | 🟡–🟢 Better sheltered/exposed-area contrast. |
| 3 | Static indirect light / bounce / color bleeding | Partial baked preview. AI 533 still needs coverage and quality work. | Yes, strong candidate. | Yes, but accurate calculation is expensive. | Baked for static surroundings. | 🟢 Richer shaded facades, entrances and bounce color. |
| 4 | Directional GI with normal/bump maps | Optional enhanced preview implemented in AI 548. | Yes, with directional data. | Yes; fully dynamic GI costs more. | Baked, with live normal evaluation. | 🟡–🟢 Preserves surface detail under GI. |
| 5 | GI on the moving bus through probes | AI 550 implements default-off vehicle material variants and a published 2,640-probe field over four BigCity2 route regions. See [coverage and validation](vehicle_diffuse_probes.md). AI 521's interior probes remain separate. | Yes, bake illumination throughout space. | Yes, sample probes or update illumination dynamically. | Hybrid: baked probes plus live direct lighting/shadows. | 🟢 Bus inherits surrounding bounced light and color within valid coverage; this is not whole-city or fully dynamic GI. |
| 6 | Fully dynamic GI / realtime ray or path tracing | Not implemented; no dedicated implementation prompt found. | Static portions only. | Technically yes; major renderer work and performance constraints. | Runtime for fully dynamic transport; hybrid is more practical for this game. | 🟢 High potential, substantial performance cost. |
| 7 | Emissive surfaces — lamps, signs, windows | Runtime emission and fake illuminated interiors exist. | Yes for fixed light spill; not arbitrary changing emission. | Yes; glowing appearance is inexpensive, lighting neighbors is additional work. | Hybrid: live emission plus baked static spill. | 🟡 Appearance alone; 🟢 with useful surrounding illumination. |
| 8 | Interior, street, spot and area lights | Garage runtime lights exist. General physical-interior illumination authoring is planned in AI 521. | Yes, fixed fixtures; current sun/sky workflow needs appropriate extension. | Yes, within light/shadow budgets. | Hybrid: bake fixed fixtures, calculate changing lights/highlights live. | 🟢 Indoors/at night; smaller daylight benefit for artificial fixtures. |
| 9 | Headlight beams illuminating the scene | Lamp emission exists; projected illumination not found. No dedicated prompt found. | Beam pattern only; not moving illumination. | Yes, spotlights/projected patterns and optional shadows. | Runtime. | 🟢 At night. |
| 10 | HDRI/environment reflections and highlights | Prefiltered HDRI runtime implementation; not a local-city reflection bake. AI 77/92 lineage. | Yes, environment images and roughness filtering; not fixed surface highlights. | Yes, view-dependent sampling and optionally live captures. | Hybrid: precomputed environment plus live material/direct-light response. | 🟢 Foundational benefit, already present. |
| 11 | Local reflection probes | Not implemented; AI 551 now owns the planned local reflection system. AI 521 light probes must not be assumed to mean reflection probes. | Yes, local cubemap captures. | Yes, more expensive live captures. | Baked for static surroundings; selectively hybrid for dynamic content. | 🟢 Glass/metal reflect the actual neighborhood. |
| 12 | Live reflections — SSR / planar | Not implemented; no dedicated prompt found. | No as these view-dependent techniques; baked probes are an alternative. | Yes. SSR has screen-coverage limits; planar reflections require another view render. | Runtime, supported by probes where useful. | 🟡–🟢 Mirrors, wet roads and moving reflections. |
| 13 | Glass transmission / refraction | Runtime exists; AI 237 done. AI 549 now prioritizes Burban, B Glass and Terra & Mar appearance repairs; AI 521/552 cover interiors. | Only limited fixed-view approximations for a changing camera/background. | Yes, already supported with limitations. | Runtime. | 🟡–🟢 Better depth and distortion through glass. |
| 14 | Colored transparent shadows / caustics | City feature not implemented; AI 549 now plans a bounded daylight transport extension after its primary glass repair. Current bake has unsupported transmission cases. | Yes, fixed light/glass/receiver relationships with an appropriate transport solver. | Yes; accurate dynamic caustics can be expensive. | Baked for fixed architectural effects; runtime for moving effects. | 🟢 Locally; 🔴 limited city-wide impact. |
| 15 | Normal maps, roughness, metalness, clear coat | Runtime support exists. AI 548 addresses baked-GI normal response; AI 549/550 now plan targeted glass/bus material readiness fixes. | Material/detail maps yes; general changing appearance no. | Yes, already present. | Runtime material response using authored/baked maps. | 🟢 Foundational material detail, already present. |
| 16 | Static-world sun shadows — baked depth cache | Opt-in/development implementation in AI 531. AI 546 closed through accepted defer with retained visual deviations; no strict release certificate. | Yes, strong candidate for fixed geometry/sun. | Yes, by rerendering static casters. | Hybrid: cached static plus live moving casters. | 🔴 Baking mainly saves work; quality depends on resolution and filtering. |
| 17 | Runtime single/cascaded sun shadows | Implemented through AI 484/499. AI 497 has shipped culling/merging and remaining optimization work. | Static visibility can be baked; camera-fitted cascades are runtime structures. | Yes, already present. | Runtime for changing sun/scene; hybrid for fixed profiles. | 🟢 Foundational grounding and shadow coverage. |
| 18 | Moving shadows / self-shadowing / mutual shadows | Hybrid implementation in AI 532. AI 498 bus-map/cascade phases superseded; renderer upgrade remains separate. | Not changing object poses; static-world data remains reusable. | Yes, already implemented. | Runtime moving casters combined with static cache. | 🟢 Coherent bus/road/vehicle interactions. |
| 19 | Streamed, sharper nearby baked shadows | AI 547 partial: moving-map resolution controls exist; static paging/multiresolution remains open. | Yes, multiple spatial resolutions. | Yes, page selection/streaming or live detailed shadows. | Hybrid: baked pages plus runtime residency/selection. | 🟡–🟢 Sharper nearby foliage and trim. |
| 20 | Physical soft shadows / contact hardening | Filtering exists; dedicated physical penumbra implementation/prompt not found. | Yes, fixed light size and caster/receiver relationships. | Yes, approximations or tracing. | Baked static; runtime moving. | 🟡 More natural shadow softness. |
| 21 | Bus contact-shadow blobs | Runtime feature exists, default off. Visibility repair AI 324 open. | Blob shape only; not moving placement/contact. | Yes, cheaply. | Runtime. | 🟡 Stronger wheel/chassis grounding. |
| 22 | Material AO — cracks, joints, cavities | PBR AO texture support exists. | Yes, strong candidate when tied to the represented detail. | Possible; usually unnecessary to reconstruct fine cavities dynamically. | Baked. | 🔴–🟡 Close-up surface depth. |
| 23 | Static-world vertex/instance AO | On-demand geometry bake exists, default off. AI 317 implemented; visibility repair AI 323 open. | Yes, per geometry/instance. | Yes, geometry queries or approximations. | Baked where it adds useful detail beyond GI. | 🟡 Stable curb and wall/ground contact. |
| 24 | SSAO | Runtime implementation; AI 303/318 lineage. | No as SSAO; static AO can replace part of its purpose. | Yes, already present. | Runtime for justified dynamic contacts. | 🟡 Contact detail, with possible halos/missing occlusion. |
| 25 | GTAO | Runtime implementation, current default. AI 304 and later fixes. AI 524 exclusion-depth reuse shipped; AI 525 alternatives rejected. | No as a camera-dependent screen-space result. | Yes, already present. | Runtime, reducing overlap with baked GI/AO. | 🟡 Cleaner contact definition; no colored bounce. |
| 26 | Cycles AO / bent-normal city maps | AI 529 contains an AO proof bake. City evaluation/adoption considered in AI 534; bent-normal runtime integration is not shipped. | Yes. | Yes, approximately or at higher sampling cost. | Baked where useful beyond GI. | 🟡 Potentially small if GI already captures occlusion. |
| 27 | Foliage/canopy AO | AI 540 reverted and closed; no longer shipped. | Yes; removed prototype demonstrated it. | Yes, with significant screen-space limitations. | Defer based on recorded benefit/cost evidence. | 🔴 Recorded gameplay improvement was subtle. |
| 28 | Coordinating GI, AO and contact shadows | Existing AO composition remains; baked-GI migration planned in AI 534. | Individual contributions can be baked; coordination is composition logic. | Yes, masks/shader/settings logic. | Hybrid. | 🟡–🟢 Fewer black corners, halos and lost bounce colors. |
| 29 | Foliage translucency / subsurface-style backlighting | Dedicated implementation/prompt not found; double-sided leaves are not equivalent. | Partial static transport/response data. | Yes, practical material approximations. | Runtime for changing backlighting response. | 🟡 More natural backlit leaves. |
| 30 | Analytic sky / distance fog / aerial perspective | Runtime implementation; AI 183/198 and fog-tuning lineage. | Sky images/lookup tables partly; view-dependent fog still needs evaluation. | Yes, already present. | Runtime, optionally with precomputed lookup data. | 🟡–🟢 Atmospheric depth and horizon integration. |
| 31 | Volumetric fog / actual light shafts | Not implemented; no dedicated prompt found. Existing sun starburst is a billboard, not illuminated fog. | Limited static light fields; changing viewing paths/shadows still matter. | Yes, potentially expensive. | Runtime, possibly assisted by baked data. | 🟢 In suitable weather: beams and illuminated mist. |
| 32 | Sun glare / flare / starburst / occlusion filtering | Runtime implementation; AI 179/184/198/523 lineage. | Reusable shapes/textures only. | Yes, already present. | Runtime. | 🟡 Stronger sun presence and cleaner occlusion. |
| 33 | Bloom | Runtime implementation in AI 172. | No for arbitrary changing scene/camera/exposure. | Yes, already present. | Runtime. | 🔴–🟡 Restrained glow around bright surfaces. |
| 34 | Exposure / tone mapping / color grading | Runtime controls exist; AI 178/541. Automatic exposure not found. | LUTs yes; do not embed final display exposure into light-only maps. | Yes; adaptive exposure could be added. | Runtime, with precomputed LUTs where useful. | 🟡–🟢 Better highlights, contrast and color; not a transport repair. |
| 35 | Continuous day/night lighting | Fixed shadow profiles exist; complete cycle not found. AI 526 preserves extensibility; AI 521 requests interior day/night intensity. | Partly, multiple baked lighting states with storage/transition limits. | Yes, coordinated sun/sky/lights/shadows. | Hybrid. | 🟢 Strong change in time, mood and night lighting. |

## Daytime shortlist requested by the user

Selection: missing or runtime-only capabilities with high expected daytime visual
impact and a meaningful benefit from baking. Night-focused artificial lighting,
headlights and day/night cycling are excluded. High local impact is distinguished
from broad gameplay impact. The shortlist is sorted by expected additional visual
impact in normal daytime gameplay, considering screen prominence and how often
the effect is visible: moving-bus GI, local reflections, visible daylight
interiors, then specialized glass effects. This is a qualitative assessment, not
a measured ranking or an instruction to implement. A route dominated by glass
facades could place local reflections first.

| # | Enhancement | Current status / future owner | Preferred strategy | What is precomputed | Expected daytime improvement |
|---|---|---|---|---|---|
| 1 | Diffuse GI probes for the moving bus | Implemented behind AI 550's default-off Enhanced bus lighting toggle, with independent developer material/probe controls. Initial coverage is four documented route regions. | Hybrid | Spatial samples of static sun/sky bounce and local ambient visibility, independent of bus position. | 🟢 Broad impact on the repeatedly visible bus: paint receives nearby wall/road bounce colors and changes ambient illumination through sheltered streets and overhangs. Existing runtime direct light and moving shadows remain. Pure metal and glass still need their separate reflection/transmission paths. |
| 2 | Local reflection probes for windows, metal and glossy surfaces | Missing local captures; current runtime uses a global HDRI. Planned in AI 551. | Baked | Static city cubemaps, spatial influence and roughness-filtered reflection data; optional parallax correction. | 🟢 Reflections show nearby facades, street, trees and sky openings instead of the same distant environment everywhere. Greatest where reflective surfaces occupy substantial screen area. Camera/Fresnel/roughness response stays live; moving buses require a separate dynamic reflection source to appear in the captures. |
| 3 | Daylight GI in visible physical storefronts, entrances and lobbies | Missing application; AI 552 adds a high-fidelity reference, derived LODs and selective parallax to AI 521's interior scope. Geometry strategy requires user approval before implementation. | Hybrid overall; baked daylight GI | Static diffuse daylight entering real room geometry, multiple bounces, sky obstruction and material color transfer; derived LOD/parallax content from the same reference. | 🟢 Rooms visible through glass show lit floors/walls/ceilings and a natural gradient from opening to depth, instead of a black void or flat ambient fill. Lower LODs retain that appearance within declared view limits. Runtime glass and parallax remain separate from baked transport. |
| 4 | Static sunlight through glass: colored transmission shadows and caustics | Missing; planned in AI 549. User addendum makes fixing plastic-looking glass the main goal, especially Burban, also B Glass and Terra & Mar. | Hybrid overall; baked static transmitted illumination | Static receiver illumination from fixed sun/glass geometry, including supported transmitted/focused light paths. The glass surface repair itself uses runtime material/geometry response. | 🟢 Localized transmitted color or focused sunlight patterns on floors/walls where physically appropriate. The additional glass appearance repair may have broader benefit, but is not evidence of caustics working. Ordinary clear planar panes may show little dramatic caustic detail; the current unsupported transport path needs an extension. |

### Existing partial baking excluded from the strict shortlist

Broader static facade/overhang GI and directional normal-mapped GI remain high-value
daytime work, but AI 533/548 already contain partial baked implementations. They
are continuation/coverage/correctness work, not missing or runtime-only techniques.
Sky visibility on those same surfaces is already part of the published indirect
channel; do not count it as another independent missing lighting system.

The daylight-interior entry above is explicitly an unimplemented application of
that existing GI foundation, not a claim that the underlying baking algorithm is
absent. AI 521 currently leaves the exact bounded-cost lighting technique open;
AI 552 now commits the bounded daylight scenario to baked GI, with a required
geometry/LOD/parallax strategy review before implementing that scene. The broader
AI 521 interior authoring requirements remain separately tracked.

Static soft shadows, streamed shadow detail and AO may be useful daytime followups,
but the current assessment rates them moderate or context dependent, and some are
already baked. Do not increase their rating merely to lengthen this shortlist.
Volumetric shafts are high-impact in suitable daylight but favor a runtime volume
solution; precomputation alone is not the central missing feature. They are not
included in this bake-focused shortlist.

## Requested implementation sequence and current status

The user's 2026-09-05 follow-up changes execution priority to **4 -> 1 -> 2 -> 3**.
The impact-ranked shortlist retains its original item numbers for continuity.
All four prompts were unimplemented when created. The later user request brought
AI 550 forward: its optional material and probe paths are implemented, using the
accepted static source without making AI 549 or AI 560 prerequisites. The other
entries retain their independent scope. The user rejected the broad experimental
bus appearance. Public Glass reflections, Body reflections and Rim shine now
preserve authored materials; the earlier conversion/probe master remains a
default-off developer experiment. Bus-only switches prepare in the background
without suspending the accepted world bake. See
[the current controls and lifecycle](vehicle_diffuse_probes.md).

Separate pending correctness work:
[AI 561 — unwanted static indirect shadow at the civic-route pose](../../prompts/AI_graphics_561_ATMOSPHERE_unwanted_baked_indirect_shadow_at_civic_route.md).

| Order | Prompt | User priority and boundary |
|---|---|---|
| 1 | [AI 549 — architectural glass and static transmitted sunlight](../../prompts/AI_graphics_549_WINDOWS_architectural_glass_appearance_and_baked_transmitted_sunlight.md) | Main goal: repair the plastic/bottle appearance on **Burban first**, then required B Glass and Terra & Mar comparisons. Diagnose material response and geometry before attributing the issue to lighting. Keep baked receiver effects independently measurable. |
| 2 | [AI 550 — bus diffuse probes and material readiness](../../prompts/AI_DONE_graphics_550_VEHICLES_baked_diffuse_probes_and_bus_material_readiness_DONE.md) | Complete behind a default-off toggle, with four bounded route regions and separate material/GI comparisons. See the vehicle specification for actual coverage and measured limits. |
| 3 | [AI 551 — local baked reflection probes](../../prompts/AI_graphics_551_MATERIAL_local_baked_reflection_probes.md) | Actual local surroundings reflected in architectural glass, metal and glossy bus paint, preserving earlier material/GI repairs. |
| 4 | [AI 552 — reference interior, derived LODs and selective parallax](../../prompts/AI_graphics_552_BUILDINGS_daylight_interior_reference_lods_and_parallax.md) | First present the interior geometry/LOD/parallax plan and **stop for explicit user approval before implementation**. Then create the high-fidelity daylight reference and derive lower LODs/parallax from it, building on AI 521. |

The glass acceptance cases are the actual `burban`, `bglass` and `terramar`
catalog entries, not a substitute mirror-glass building. Burban's curved runs
must retain their authored shape. B Glass and Terra & Mar have planar canonical
silhouettes; investigate their plastic appearance without inventing curvature.
Do not use the glass task to bypass AI 552's interior strategy review.

## Bus material inspection — source audit, 2026-09-05

The current game defaults enable IBL with environment intensity 0.28 in
[LightingSettings.js](../../src/graphics/lighting/LightingSettings.js). Persisted
settings, URL overrides and calibration can change the resolved result. No game
tab was exposed for inspecting the user's current selection or saved state, so
this is a source/asset audit rather than a diagnosis of that live frame.

| Bus | Finding | Consequence and planned response |
|---|---|---|
| City Bus | [CityBus.js](../../src/graphics/assets3d/models/buses/CityBus.js) imports Phong body/glass materials. The original source audit inferred absent managed environment assignment, but the AI 550 pre-change runtime captures found environment maps already bound. | Missing IBL binding was not the resolved baseline problem. AI 550 creates isolated PBR variants for the relevant surfaces, preserving originals for Off and preserving controller-owned lamps. Paint remains nonmetallic, with roughness 0.32 and clearcoat 0.25. See [the implementation contract](vehicle_diffuse_probes.md). |
| Coach | The GLB contains PBR body materials; [CoachBus.js](../../src/graphics/assets3d/models/buses/CoachBus.js) sets body roughness to 0.62 and metalness to 0.12. | Reflection-capable, with broad/soft reflections from the configured roughness. Verify live environment assignment and tune the finish where justified; a material-family replacement is not inherently required. |
| Double Decker | The GLB contains PBR body materials; [DoubleDeckerBus.js](../../src/graphics/assets3d/models/buses/DoubleDeckerBus.js) likewise sets body roughness to 0.62 and metalness to 0.12. | Reflection-capable, with the same configured matte tendency. Inspect texture/material overrides and lighting before assigning a single cause to a live appearance. |

For shortlist item 1, the essential change is receiving spatial **diffuse GI**;
increasing gloss is not required for bounced light. PBR integration is the chosen
City Bus readiness improvement so GI and existing/future reflections can share
the supported material path. Coach and Double Decker already have a suitable
material family. A paint/clear-coat refinement can improve their finish, while
AI 551 supplies local reflected scenery. Treat ordinary paint as a dielectric
finish unless a specific coating justifies otherwise; raising metalness toward
one would suppress the diffuse bounce the user wants to improve.

The 2026-09-08 runtime audit verified all three models after asynchronous loading.
Coach and Double Decker retained their authored PBR values. AI 550's comparisons
separate material changes from the probe contribution, preserve the original game
captures for AI 560, and record actual source/field identities and retained cache
cost. See [vehicle diffuse lighting](vehicle_diffuse_probes.md) for coverage,
reproduction, evidence and limitations.

## Implementation references and prompt dispositions

The following sources own actual behavior and acceptance. Recheck them when the
implementation changes rather than treating this dated comparison as live status.

- [Illumination composition and framework](illumination_framework.md).
- [Receiver lightmaps: original/enhanced coverage, directional approximation, repairs and measurements](receiver_lightmaps.md).
- [Static sun-depth cache](static_sun_depth_cache.md) and [dynamic sun shadows](dynamic_sun_shadow.md).
- [AO settings, static geometry AO, screen-space AO and contact shadows](ambient_occlusion.md).
- [Sun bloom occlusion filtering](sun_bloom_occlusion_filtering.md).
- [AI 533: accepted optional direct/indirect lighting and recorded limits](../../prompts/AI_DONE_533_MATERIAL_baked_direct_and_indirect_illumination_DONE.md).
- [AI 548: gated enhanced implementation](../../prompts/AI_DONE_graphics_548_MATERIAL_baked_illumination_runtime_cost_and_coverage_improvements_DONE.md).
- [AI 534: measured GI/AO/contact composition](../../prompts/AI_DONE_534_MATERIAL_baked_gi_and_ambient_occlusion_migration_DONE.md).
- [AI 535: completed runtime modes and diagnostics; see its final policy for current behavior](../../prompts/AI_DONE_535_UI_optional_baked_illumination_runtime_modes_and_diagnostics_DONE.md).
- [AI 536: release validation remains open](../../prompts/AI_536_TESTS_illumination_framework_release_validation.md).
- [AI 531: static sun-depth implementation](../../prompts/AI_DONE_531_ATMOSPHERE_static_sun_depth_deterministic_pipeline_DONE.md).
- [AI 546: accepted defer, not a strict visual-parity release certificate](../../prompts/AI_DONE_546_ATMOSPHERE_static_sun_depth_visual_parity_refinement_DONE.md).
- [AI 532: shared generic moving-object shadows](../../prompts/AI_DONE_532_VEHICLES_static_world_to_bus_and_dynamic_bus_shadows_DONE.md).
- [AI 547: dynamic resolution slice shipped; static streaming/multiresolution open](../../prompts/AI_547_ATMOSPHERE_streamed_multiresolution_hybrid_shadows.md).
- [AI 497: current-shadow optimizations, partial](../../prompts/AI_graphics_497_SHADOWS_shadow_cost_reduction_culling_proxies_and_coverage.md).
- [AI 498: bus-map phases superseded by AI 532; Three upgrade independent](../../prompts/AI_graphics_498_SHADOWS_bus_shadow_map_three_upgrade_and_cascade_retune.md).
- [AI 323: static AO visibility repair open](../../prompts/AI_graphics_323_MATERIAL_static_ao_not_visible_or_not_applied.md).
- [AI 324: contact-shadow visibility repair open](../../prompts/AI_graphics_324_VEHICLES_bus_contact_shadow_not_visible_in_gameplay.md).
- [AI 540: canopy AO reverted and removed](../../prompts/AI_DONE_540_ATMOSPHERE_opus_baked_canopy_occlusion_for_foliage_DONE.md).
- [AI 521: physical interiors, bounded-cost illumination and glass composition](../../prompts/AI_buildings_521_BUILDINGS_transparent_storefront_interior_authoring.md).
- [AI 237: existing glass IOR/transmission response](../../prompts/archive/AI_DONE_237_WINDOWS_window_debugger_fix_glass_ior_and_envmap_intensity_response_DONE.md).
- [Current atlas exclusions](../../src/app/illumination/receiver_lightmaps/ReceiverAtlas.js) and [exporter material support](../../src/graphics/illumination/bake_source/BakeSourceMaterials.js).
- [Current PBR map bindings](../../src/graphics/content3d/materials/PbrTexturePipeline.js), [window glass](../../src/graphics/engine3d/buildings/window_mesh/WindowMeshMaterials.js), and [bus lamp emission](../../src/app/rigs/buses/BusRig.js).

## Technical background

- [Three.js cubemap capture](https://threejs.org/docs/pages/CubeCamera.html) supplies the basic environment-capture mechanism; local influence, parallax, freshness and publication still need project-specific design.
- [Light probes for moving objects](https://docs.unity.cn/Manual/LightProbes.html) explain how spatially baked diffuse illumination can be reused on dynamic receivers. This reference is conceptual; the project is not using Unity's implementation.
- [Specular reflection and transmission](https://www.pbr-book.org/4ed/Reflection_Models/Specular_Reflection_and_Transmission) describes the directional transport that ordinary diffuse lightmaps cannot replace.
- [Diffuse/specular occlusion](https://google.github.io/filament/main/filament.html#lighting/occlusion) distinguishes AO from light transport and explains why a generic AO multiply is not a universal reflection solution.
- [Three.js physical materials](https://threejs.org/docs/pages/MeshPhysicalMaterial.html) documents runtime reflection/transmission/material response, distinct from the project's baked diffuse channels.
- [Pinned Three.js r183 MTLLoader source](https://raw.githubusercontent.com/mrdoob/three.js/r183/examples/jsm/loaders/MTLLoader.js) constructs MeshPhongMaterial for imported MTL materials; [Phong material documentation](https://threejs.org/docs/pages/MeshPhongMaterial.html) describes its nonphysical specular model and explicit environment-map support.

## Maintenance

When an owning implementation changes, update the relevant status, evidence link
and assessment date. Preserve the distinction between shipped, preview, planned,
rejected and reverted outcomes. Expand the daytime shortlist only with an explicit
scene/use case and a concrete benefit from precomputation. Avoid double-counting
the same indirect-light or sky-visibility contribution under several names.
