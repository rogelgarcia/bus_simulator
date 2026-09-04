**DONE — master planning and decomposition completed 2026-08-30. Production implementation continues in the descendant AIs listed below.**

# Problem

The game needs one coherent illumination framework instead of independently evolving runtime shadows, ambient occlusion, environment lighting, contact shadows, and future baked-lighting features.

The gameplay city is mostly static. At present, the bus is the principal moving object, yet the renderer repeatedly processes static city geometry to produce camera-relative sun shadow maps. Static geometry should not require a complete shadow-caster pass every frame when the resolved city geometry and selected sun profile have not changed.

A flat ground decal is not a sufficient replacement. Static shadows land on roads, roofs, walls, curbs, vegetation, and elevated surfaces. Static objects must also cast partial shadows onto the moving bus. A cached static sun-depth/visibility representation can be sampled at the world position of each receiving fragment, including bus fragments, without rerendering the static casters every frame.

Static shadowing, baked direct illumination, baked indirect illumination, and ambient occlusion are related but distinct:

- a static sun-shadow cache represents directional visibility to the sun;
- a direct-light bake stores the direct illumination received by static surfaces;
- an indirect-light/GI bake stores bounced irradiance received by static surfaces;
- AO represents local ambient visibility and must not be confused with, or silently multiplied into, directional sun shadowing.

Full baked GI may substantially reduce the need for static AO, but direct-only baked lighting or a static shadow cache does not replace AO. Dynamic bus grounding, bus-to-world contact, and other future dynamic interactions still need an explicit dynamic solution. The framework must keep these contributions separable to prevent double-darkening and allow each system to be measured, debugged, enabled, or replaced independently.

This document is a master rationale and architecture plan. The work is intentionally too broad for one implementation pass and must be decomposed into smaller AI prompts with explicit contracts, dependencies, validation gates, and measured acceptance criteria.

The existing Three.js illumination engine is not being replaced as a prerequisite for gameplay. It must continue to boot, render, expose its current controls, and support every city without Blender or baked assets. Baked illumination is an optional add-on that may be unavailable and must be switchable at runtime.

## Planning completion record

AI 526 is closed because its analysis, engine choice, system boundaries, and ordered decomposition are complete. Closing this master does not claim that the baked illumination runtime has shipped.

### Baking-engine decision

- Pin the production compiler to the exact official Blender **5.2.1 LTS portable x64** archive, including archive SHA-256 and `bpy.app` version/build hash. Do not track an unversioned `latest` or silently accept another installed patch.
- Use **Cycles CPU** as the authoritative radiometric bake engine. It is Blender's documented texture/lightmap baking path and supports distinct direct, indirect, AO, and related passes.
- Keep EEVEE preview-only. Its approximate GPU-only path and documented headless Windows limitation make it unsuitable as the authoritative compiler.
- Permit GPU Cycles only for non-authoritative drafts or a separately pinned device/backend/driver profile that passes comparison against CPU.
- Produce the reusable static sun cache as deterministic orthographic light-space Z/depth tiles. Do not use the Cycles surface `SHADOW` bake as the world-to-bus cache.
- Store authoritative intermediates as linear/raw lossless data, initially 32-bit OpenEXR for depth/light proofs, then canonicalize, quantize, and package with project scripts.
- Fix seeds, sampling, samples, bounces, thread/device policy, alpha semantics, object order, color management, precision, margins, and every bake-affecting setting. Disable adaptive sampling, animated seed, time limits, and denoising for authoritative outputs unless a later separately signed deterministic postprocess is approved.
- Official decision sources:
  - `https://www.blender.org/releases/5-2/`
  - `https://docs.blender.org/manual/en/5.2/render/cycles/baking.html`
  - `https://docs.blender.org/manual/en/5.2/render/layers/passes.html`
  - `https://docs.blender.org/manual/en/5.2/render/eevee/limitations/limitations.html`
  - `https://developer.blender.org/docs/handbook/testing/render/`

### Runtime compatibility decision

- `Current` is the always-available existing engine and cannot depend on Blender, a payload, or baked-capable hardware.
- `Baked` is optional and activates only after an exact compatible payload is completely validated and loaded.
- `Auto` may select Baked when compatible and otherwise remains on Current.
- Runtime Options must switch modes without reload. Current rendering remains active while optional resources load, and transitions occur atomically at a frame boundary.
- Missing baked assets are a normal supported state. Stale, corrupt, incomplete, unsupported, or mismatched payloads must stay or return to Current with an exact non-spamming reason.
- The Current engine remains permanently supported even if Baked is later promoted.

### Descendant AI index

| Step | Descendant | Depends on | Exclusive outcome |
| ---: | --- | --- | --- |
| 1 | `AI_DONE_527_ATMOSPHERE_illumination_composition_architecture_and_baselines_DONE.md` | AI 526 | **Complete.** Linear composition/specification, engine/profile/coordinate contracts, current-engine baselines, budgets, and render-hook ownership. |
| 2 | `AI_DONE_528_TOOLS_resolved_city_bake_export_and_source_hash_DONE.md` | AI 527 | **Complete.** Evaluated city export, stable IDs/provenance, material/alpha semantics, canonical source identity, and round-trip validation. |
| 3 | `AI_DONE_529_TOOLS_blender_cycles_headless_bake_compiler_DONE.md` | AI 527–528 | **Complete.** Exact Blender/Cycles pin, clean scripted reconstruction, deterministic proof bakes, repeatability, and compiler signatures. |
| 4 | `AI_DONE_530_TOOLS_illumination_binary_package_and_runtime_loader_DONE.md` | AI 527–529 | **Complete.** Versioned binary/chunk transport, integrity/freshness validation, async optional loading, lifecycle, and programmatic Current/Baked/Auto controller. |
| 5 | `AI_DONE_531_ATMOSPHERE_static_sun_depth_deterministic_pipeline_DONE.md` | AI 527–530 | **Complete.** Part A: tiled static sun depth, exact alpha silhouettes, deterministic/resumable production and triage, stable world sampling, and user-approved development-readiness evidence. |
| 6 | `AI_532_VEHICLES_static_world_to_bus_and_dynamic_bus_shadows.md` | AI 527–531 | Static-world shadows received per bus fragment plus a separate bus-only dynamic self/world shadow layer; supersedes overlapping AI 498 bus-map work. |
| 7 | `AI_533_MATERIAL_baked_direct_and_indirect_illumination.md` | AI 527–532 | Deterministic receiver/atlas mapping, separate Cycles direct/indirect channels, linear PBR integration, and measured ship/defer decisions. |
| 8 | `AI_534_MATERIAL_baked_gi_and_ambient_occlusion_migration.md` | AI 527–533 | Measured static AO/SSAO/GTAO/contact disposition, double-darkening prevention, and AI 323/524/525 migration status. |
| 9 | `AI_DONE_546_ATMOSPHERE_static_sun_depth_visual_parity_refinement_DONE.md` | AI 531; disposition accepted before AI 532 | **Complete by explicit user-approved defer.** All 69 visual-only cases are below the accepted 0.5% affected-area ceiling; the unchanged 128/197 strict report remains failed, no certificate was issued, and runtime activation remains disabled by default. |
| 10 | `AI_535_UI_optional_baked_illumination_runtime_modes_and_diagnostics.md` | AI 527–534, AI 546 | Runtime Options, Current/Baked/Auto switching, profile availability, transactional settings, diagnostics, and offline-workflow visibility. |
| 11 | `AI_536_TESTS_illumination_framework_release_validation.md` | AI 527–535, AI 546 | End-to-end visual, hash/corruption, absence/fallback, memory/loading, performance, rollback, and promotion/default gate. |

Required execution order:

`527 → 528 → 529 → 530 → 531 (Part A) → 546 (Part B defer) → 532 → 533 → 534 → 535 → 536`

AI 546 was satisfied early through its explicit user-approved defer path; no
visual refinement or new bake lineage ran. The remaining executable order is
`532 → 533 → 534 → 535 → 536`.

Each descendant exists. A pending descendant's execution gate requires every
earlier dependency to carry DONE naming before implementation begins.

# Request

Define and deliver a master illumination framework for static and dynamic light, shadow, baked illumination, and AO composition, using an offline Blender-based bake pipeline where it provides a measurable benefit. Establish the shared architecture and then execute the program through scoped child AI prompts rather than implementing all subsystems monolithically.

The baked path must remain an optional runtime capability. The existing engine must continue to function normally, and Current/Baked/Auto selection must eventually be available live through game Options.

## Relationship to existing master work

- Coordinate with `prompts/AI_i_408_PROJECTMAINTENANCE_v1_minimum_features_plan.md`, especially its global shader/rendering pipeline, pass orchestration, lighting-tuning workflow, lab scenarios, and optimization/release gates. This illumination framework should become a defined consumer of that global pipeline rather than a competing renderer.
- Reuse the deterministic principles established by `prompts/AI_i_481_MESHES_interactive_3d_mesh_system_ai_instruction_modeling.md`: canonical versus derived data, stable addressable identities, reproducible compilation, explicit schema/version contracts, provenance, and validation before accepting derived artifacts. Do not directly couple illumination baking to the live mesh-handoff format unless a child AI proves that format satisfies the resolved-city bake requirements.
- Reuse the canonical hashing, freshness validation, versioned payload, fail-open behavior, diagnostics, and reproducible-tooling lessons from `AI_DONE_520_CITY_static_scene_visibility_bake_research_and_implementation_DONE.md`. A color visibility map must never be reused as a sun-shadow map; illumination requires its own bake inputs, profiles, hashes, outputs, and runtime contract.
- Account for the existing static AO implementation and its active repair prompt, the existing cascaded/merged/culling shadow stack, and the planned bus-specific shadow map. Child prompts must explicitly identify what they replace, retain, or migrate.

## Architectural outcomes

Tasks:
- Define a single illumination composition model that identifies direct sun, static sun visibility, indirect/IBL lighting, emissive contribution, static AO, dynamic AO/contact, bus self-shadowing, and bus-to-world shadowing as explicit inputs.
- Apply baked shadow/illumination data in the lighting calculation rather than painting a generic dark decal over final color. Static sun visibility must attenuate direct sunlight without incorrectly darkening ambient light, IBL, emissive surfaces, reflections, or road markings.
- Define the hybrid target architecture:
  - cached static-world sun visibility for static receivers and the moving bus;
  - a small dynamic shadow layer for bus self-shadowing and bus-to-world shadowing;
  - optional baked direct and indirect illumination for static receivers;
  - explicit AO/contact channels retained only where they add information not already represented by the bake.
- Support fragment-level static-object shadowing on the bus so partial shadows move correctly across its body as it drives behind buildings, under overhangs, and through vegetation shadows.
- Keep static-world and dynamic-bus shadow representations separate so updating the bus never invalidates or rerenders the static cache.
- Establish ownership, ordering, and shader-hook contracts compatible with the global rendering pipeline planned by AI 408.
- Preserve normal PBR material behavior. Baked data must be per resolved instance, receiver, or world chunk and must not be written into shared base PBR textures.
- Define compatibility and migration behavior for the current CSM/single-map system, merged casters, shadow culling, static AO, SSAO/GTAO, bus contact shadow, sun bloom/occlusion passes, transparency, and alpha-tested foliage.
- Keep the existing runtime shadow system as a clearly defined fallback for unsupported cities, invalid/missing bake payloads, editable scenes, unsupported cameras or lighting profiles, and future fully dynamic lighting modes.
- Keep the current live illumination engine fully usable when the add-on code or assets are absent, and define atomic runtime Current/Baked/Auto switching with no restart.

## Lighting profiles and invalidation

Tasks:
- Treat sun azimuth, sun elevation, directional-light size/filter model, intensity/color where output-dependent, environment/IBL profile where output-dependent, geometry revision, transforms, alpha-cutout inputs, material bake semantics, and bake quality settings as hash-significant inputs.
- Decide explicitly which settings affect static sun visibility, direct lightmaps, indirect lightmaps, AO/bent-normal data, or only runtime shading. Do not invalidate unrelated channels.
- Support one or more named baked lighting profiles. When the gameplay sun changes, the runtime must select an exactly matching compatible profile, request/rebuild a bake in an authoring workflow, or fall back safely to runtime lighting. It must never continue sampling stale data.
- Start with deterministic full-city invalidation if necessary. Incremental chunk invalidation may be introduced later only behind a proven dependency and boundary/seam model.
- Record coordinate system, handedness, axes, units, origin, floating-point quantization, transform order, normal/tangent convention, UV convention, and color-space convention in the bake contract so Three.js and Blender agree exactly.

## Deterministic resolved-map export

Tasks:
- Create an authoritative exporter for the fully resolved gameplay city rather than relying on manually maintained Blender scene files.
- Export a deterministic bake-input package consisting of geometry suitable for Blender plus a canonical machine-readable manifest. A likely baseline is GLB for geometry and a sorted-key canonical JSON manifest, but a child AI must research and lock the format based on fidelity, determinism, size, and Blender import behavior.
- Include stable IDs and provenance for city, chunks, instances, receivers, casters, materials relevant to baking, alpha-tested foliage, and mapping from baked outputs back to runtime objects/materials.
- Include resolved transforms, geometry revisions, shadow casting/receiving semantics, material opacity/alpha-test inputs needed for silhouettes, light profiles, bake settings, and expected output channels.
- Compute a canonical source hash over all bake-relevant resolved inputs. Adding unused catalog content should not invalidate the city, while any used geometry, placement, light-profile, alpha-silhouette, schema, or bake-profile change must invalidate the affected payload.
- Make export reproducible and validation-first: reject duplicate IDs, missing provenance, unsupported geometry/material semantics, inconsistent transforms, and non-finite data before invoking Blender.
- Register every new exporter/baker tool in `PROJECT_TOOLS.md`, document its command line and artifacts, and keep generated diagnostics under `tests/artifacts/` according to repository policy.

## Blender offline compiler strategy

Tasks:
- Require every production use of Blender to be deterministic and script-driven. Baking must run through version-controlled scripts from a documented command line; manual Blender operations must never be part of the authoritative workflow.
- Run Blender headlessly in a clean, script-created scene. The script must reset Blender state, import only declared inputs, create lights/world/cameras/bake nodes programmatically, assign every setting explicitly, and export all outputs without depending on a user's preferences, startup file, UI state, selection, active object, open `.blend`, or previous session.
- Treat `.blend` files as disposable diagnostics or optional inspection artifacts, never as the authoritative source of the city, bake configuration, or production result. Re-running the scripts from the same declared inputs must reconstruct the bake scene from scratch.
- Seed or eliminate all random and sampling-dependent behavior. Record seeds in the manifest, use stable object/material ordering, avoid unordered discovery, and make parallel/device-dependent behavior explicit wherever it can affect outputs.
- Pin Blender 5.2.1 LTS portable x64 and record its archive checksum and build hash, Cycles CPU engine, device/thread policy, sampling settings, denoising policy, color management, precision, add-ons, and every bake-affecting option.
- Have Blender import the resolved-map package, validate the manifest/source hash before baking, reconstruct the authoritative light profile and world-space transforms, and stop with actionable diagnostics on incompatible inputs.
- Treat the Blender script and configuration as compiler inputs. Include script/config hashes and tool-version metadata in the bake signature so results are reproducible and stale compiler outputs are detectable.
- Provide one orchestrating project command that performs export, hash validation, Blender invocation, output validation, and binary packaging in a fixed order. It must propagate failures and never promote partial outputs.
- Research and select separate outputs as appropriate for:
  - tiled or atlased static directional sun-depth/visibility data that the moving bus can sample;
  - static receiver mappings and UV/lightmap atlases;
  - optional baked direct illumination;
  - optional baked indirect irradiance/GI;
  - optional AO or bent-normal data when it remains justified;
  - debug/validation previews that are not shipped as runtime inputs.
- Preserve separate logical channels even if some are packed physically. Packing must be versioned, documented, reversible for debugging, and incapable of silently double-applying AO or shadows.
- Define atlas/chunk boundaries, padding/dilation, mip behavior, compression, precision, filtering, seams, maximum texture sizes, streaming policy, and GPU-memory budget before selecting production resolutions.
- Produce a versioned binary runtime artifact plus a compact manifest. The exact container and texture compression formats must be selected by a child AI after WebGL2/browser support, decode cost, GPU upload, cacheability, and size are measured.
- Store integrity hashes for every binary payload/chunk and one aggregate output hash. Input freshness hashes and output-integrity hashes must remain distinct concepts.
- Do not promise cross-device byte-identical Blender rendering without evidence. Record the controlled toolchain and measure reproducibility; define acceptable numeric/image tolerances where exact byte identity is not realistic.

## Runtime binary loading and freshness validation

Tasks:
- Add a runtime loader that validates schema/version, city ID, coordinate contract, ordered stable-ID inventory, source geometry hash, light-profile hash, bake-profile/compiler signature, chunk table, expected byte lengths, and output integrity hashes before activating any baked channel.
- Compare the payload source hash against a canonical hash independently derived from the live resolved city. Never trust only a filename, timestamp, or embedded self-assertion.
- Reject a payload atomically when required compatibility checks fail. Do not partially apply mismatched illumination data unless the format explicitly supports independently validated channels/chunks.
- Fail open to the defined runtime lighting/shadow path, surface one non-spamming user/developer diagnostic with the exact reason, and make invalid/missing/stale states inspectable.
- Decode, stream, and upload asynchronously without showing a mixed or partially initialized lighting state. Define loading-state visuals and memory ownership/disposal.
- Expose debug views for static sun visibility/depth, direct light, indirect light, AO/bent normals, atlas/chunk IDs, UV mapping, hash/profile status, and dynamic bus shadow composition.

## AO policy

Tasks:
- Specify that a static directional shadow cache and direct-light bake do not remove the need for ambient occlusion.
- Measure whether baked indirect illumination contains sufficient static contact and crevice information to disable static AO or reduce it to a subtle detail term.
- Prevent double-darkening when static GI, static AO, SSAO/GTAO, and contact shadows overlap. Each preset must state which channels are active and how they compose.
- Retain a cheap dynamic grounding solution for the bus. Evaluate the existing bus contact shadow and the planned bus dynamic shadow layer before retaining expensive full-screen GTAO solely for the vehicle.
- Make AO reduction a measured outcome, not an assumption. Compare static geometry, vegetation, bus-ground contact, overhangs, interiors, and transitions between baked and dynamic contributions.

## Required child AI decomposition

The decomposition is complete. Use the ten descendant files and strict execution order recorded in the Planning completion record above. Each child references this master, owns one bounded contract, retains Current as the fallback, and must not begin before its named dependencies are DONE.

## Validation and acceptance

Tasks:
- Establish deterministic lab and real-game route scenarios covering direct sun, deep static shadows, partial building shadows moving across the bus, overhangs, rooflines, vertical receivers, alpha-cutout trees, long low-sun shadows, bus self-shadow, and bus-ground contact.
- For the static shadow cache, compare against the current renderer under exactly matching geometry, camera, sun, materials, and post-processing. Require zero missing occluders and define strict image-error/seam thresholds before accepting any non-identical filtering representation.
- For baked direct/indirect illumination, use approved reference captures and perceptual/error metrics rather than claiming pixel identity where the intended illumination model changes.
- Validate hash sensitivity and normalization: every bake-relevant change must invalidate, irrelevant unused catalog changes must not, object-key order must not matter, and corrupt/truncated/swapped binary chunks must be rejected.
- Validate Blender import/export transforms, normals, alpha silhouettes, UV mappings, receiver IDs, world bounds, and representative geometry against the runtime source.
- Add repeat-run determinism tests: run the complete scripted bake more than once from a clean state, compare manifests and binary hashes, investigate every mismatch, and document any controlled numeric tolerance that prevents byte-identical output.
- Test missing Blender, wrong Blender version, script/config drift, unsupported material, interrupted bake, stale source, wrong city/profile, invalid binary header, checksum failure, WebGL capability limits, load cancellation, and runtime teardown/reload.
- Measure bake duration, input/output size, compression ratio, runtime download/decode/upload time, peak CPU and GPU memory, texture count/residency, lookup/shader cost, static shadow-pass draws eliminated, remaining dynamic shadow cost, complete frame time, and FPS.
- Every performance result must use same-condition before/after runs and record hardware, browser, Blender version/device where relevant, resolution, graphics settings, city/camera/route, warm-up, sample count, statistic, variance/noise signal, and synchronization method. Mark unavailable metrics as `not measured` with a reason; projections are not final results.
- Do not remove the existing runtime fallback until the baked path passes visual, freshness, corruption, unsupported-state, and performance gates and demonstrates a meaningful net win including memory/loading costs.

## Non-goals and guardrails

- Do not bake illumination into shared base PBR texture sets.
- Do not treat a final-color dark decal as a physically correct sun-shadow replacement.
- Do not use surface lightmaps alone as evidence that static objects can shadow the moving bus.
- Do not merge static and dynamic shadow updates into one texture that forces the static city to rerender when the bus moves.
- Do not silently accept stale, partially matching, corrupt, or unknown-version outputs.
- Do not require Blender at game runtime; Blender is an offline development/asset-build dependency only.
- Do not make manual Blender editing, clicking, scene preparation, or export an undocumented prerequisite for a production bake.
- Do not require baked assets for game startup or normal gameplay, and do not remove the existing engine or its runtime Options.
- Do not require a restart to move between compatible Current, Baked, and Auto modes.
- Do not lock out future moving traffic, pedestrians, animated vegetation, or changing time of day. Define how additional dynamic casters and multiple/precomputed light profiles can extend the framework.
- Do not implement the entire master plan in one code pass. Research decisions and production phases must remain independently reviewable, testable, benchmarkable, and revertible.

## On completion

- Mark the AI document as DONE in the first line.
- Rename in `prompts/` to `prompts/AI_DONE_526_ATMOSPHERE_illumination_framework_light_shadow_baking_master_plan_DONE.md` on `main`.
- Do not move to `prompts/archive/` automatically.
- Move to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed master/child outcome and link every child AI/specification produced.
- Include a same-condition before/after performance table for every optimization that ships. Report frame time and FPS plus relevant shadow-pass draws, triangles, CPU/GPU pass time, memory, load/decode/upload time, and bake/storage metrics together with complete benchmark conditions. Mark unavailable metrics as `not measured` with a reason; do not replace final measurements with projections.

## Completion summary

- Selected Blender 5.2.1 LTS portable x64 with Cycles CPU as the authoritative deterministic radiometric compiler; EEVEE and GPU Cycles are non-authoritative unless separately validated.
- Selected orthographic light-space depth tiles as the static world-to-any-receiver shadow representation, separate from surface direct/indirect/AO bakes.
- Made baked illumination an optional add-on with Current/Baked/Auto runtime semantics and permanent Current-engine fallback.
- Created the ten ordered descendant prompts AI 527–536 covering architecture, export/hash, Blender compilation, binary loading, static shadows, bus shadows, illumination, AO, Options, and release validation.
- Shipped no runtime code or optimization in this master-planning closure; performance is therefore `not measured` here and is mandatory in the relevant descendants.
