# DONE

# Problem

BigCity2 contains substantial static geometry that passes normal camera-frustum culling even when nearer geometry fully hides it. Two completed experiments show a strong opportunity for buildings and discrete static props, but they also show that nearest-pose lookup, low-resolution baking, and indiscriminate road-mesh subdivision are unsafe or counterproductive.

The original building-only report is at `tests/artifacts/occlusion_experiment/REPORT.md`. The completed expanded report is at `tests/artifacts/occlusion_experiment_v2/REPORT.md`, with full machine-readable results and CSV tables in the same directory. Treat the expanded report as the current evidence baseline. If gitignored artifacts are unavailable, the quantitative summary below is authoritative; reproduce only the evidence needed to validate the implementation environment or close a remaining production gate.

# Completed research baseline

The corrected BigCity2 experiment measured 1,583 independently identifiable units across buildings, building slabs, traffic controls, alpha-tested trees, and hypothetical one-cell road chunks. It rendered 571,405 views, including:

- the full 625-cell x 3 x 3 horizontal x 3-height x 8-direction baseline;
- low-height +30, +60, and straight-up +90-degree views;
- middle-height -15-degree and top-height -30/-45-degree views;
- a 4 x 4 x 3 comparison;
- 4/8/12/16 direction comparisons;
- 2,000 continuous normal-chase poses;
- 2,000 continuous arbitrary/manual-pitch poses;
- a 250-pose direct 384 x 216 truth audit.

The original three height layers already had real chase-camera pitches because they looked toward a fixed Y target: -0.38 degrees at 1.22 m, -9.67 degrees at 3.683 m, and -18.48 degrees at 6.146 m. The added pitch profiles increased retained table bits by 6.74% without increasing allocated mask size.

## Exact sampled road-view opportunity

| Category | Avg frustum candidates | Avg depth-visible | Candidate draws rejected | Candidate triangles rejected |
|---|---:|---:|---:|---:|
| Buildings | 17.78 | 6.10 | 68.83% | 67.35% |
| Building slabs | 16.18 | 2.69 | 83.35% | 82.06% |
| Traffic lights | 2.40 | 0.60 | 74.99% | 74.99% |
| Traffic signs | 6.38 | 0.52 | 91.80% | 91.80% |
| Trees | 30.08 | 4.00 | 86.70% | 86.69% |

Traffic lights, traffic signs, and trees jointly rejected 86.05% of their candidate draws and 86.55% of their candidate triangles at exact sampled poses. Trees are especially important: 124 independently placed alpha-cutout tree roots represent 248 draws and approximately 1.17 million triangles.

## Spatial/directional conclusions

Equal-resolution continuous validation produced:

| Strategy | Visible observations missed | Candidates rejected |
|---|---:|---:|
| 3 x 3, 4 directions, current cell | 6.210% | 79.20% |
| 3 x 3, 8 directions, current cell | 2.430% | 75.99% |
| 3 x 3, 12 directions, current cell | 1.516% | 74.88% |
| 3 x 3, 16 directions, current cell | 1.377% | 74.74% |
| 4 x 4, 8 directions, current cell | 1.943% | 74.53% |
| 3 x 3, 8 directions, neighboring cells | 0.429% | 63.33% |
| 3 x 3, 12 directions, neighboring cells | 0.417% | 66.25% |
| 3 x 3, 16 directions, neighboring cells | 0.410% | 66.10% |
| 4 x 4, 8 directions, neighboring cells | 0.616% | 66.07% |
| Pitch-expanded 3 x 3, 8 directions, neighboring cells | 0.295% | 62.08% |

Use 12 directions. Four are insufficient, eight leave materially more yaw gaps, and sixteen add little beyond twelve while growing storage and bake time by one third. Keep 3 x 3 rather than the tested 4 x 4: the 4 x 4 grid has no center sample, is not a superset, costs 48 instead of 27 poses per cell, and performs worse after neighboring-cell expansion. If more horizontal samples are investigated later, use a nested center-preserving grid such as 5 x 5 or 3 x 3 plus selected edge samples.

Neighboring-cell expansion matters more than increasing from 12 to 16 directions. Pre-union the surrounding 3 x 3 cells during the bake so runtime lookup remains small.

## Pitch conclusion

On 2,000 arbitrary/manual camera poses spanning -45 to +75 degrees with 10% straight-up views:

| Strategy | Visible observations missed | Candidates rejected |
|---|---:|---:|
| Original pitch table, current cell | 2.494% | 74.12% |
| Expanded pitch table, current cell | 1.866% | 72.87% |
| Expanded pitch table, neighboring cells | 0.351% | 60.42% |

The added upward/downward orientations are necessary. The research pitch pass used eight yaw directions; the production candidate must repeat those pitch profiles at the selected 12-direction yaw count.

## High-resolution truth result

At 384 x 216 truth, the 12-direction neighboring-cell mask missed 0 of 1,549 building observations, 0 of 194 traffic-light observations, 0 of 217 traffic-sign observations, and 0 of 1,384 tree observations in the 250-pose audit. Its conservative candidate reductions were 38.06% for buildings, 49.17% for traffic lights, 69.36% for traffic signs, and 64.61% for trees.

Building slabs missed 13 observations and road categories jointly missed about 0.93%. They are not approved for the first implementation phase. The 250-pose audit is evidence, not a proof; native-resolution deterministic route testing remains a production gate.

## Road decision

The current asphalt, edge wear, curbs, sidewalks, edge dirt, white/yellow markings, crosswalks, and arrows are only nine city-wide draws totaling 71,189 triangles. Hypothetical one-cell chunks reduced sampled submitted triangles to about 1,509, but raised visible draws from 9 to 31.31: 97.88% fewer triangles at 3.48 times the draw calls.

Do not subdivide or visibility-cull these road layers in the first implementation. Their theoretical chunk-occlusion percentages are not net renderer savings. A later phase may test 2 x 2, 4 x 4, or regional chunks with the real renderer, or a shader/visibility-buffer approach that preserves merged draws.

Treat a road mesh with ten times the current triangle density as a materially different case, not as evidence that the current recommendation remains valid. If coverage and visibility ratios stayed comparable, the modeled submitted-triangle comparison would scale from approximately 711,890 merged triangles to 15,090 visible one-cell-chunk triangles, avoiding about 696,800 triangles while retaining the same modeled 9-to-31.31 draw increase (22.31 additional draws). This is a sensitivity estimate, not a measured renderer result. At that density, reopen the road decision and require a full-renderer A/B to determine whether the much larger triangle saving outweighs the draw, traversal, memory, and chunk-management costs.

## Shadow-map decision

The gameplay-camera visibility map is not a valid shadow-caster visibility map. A building or prop can be outside the camera frustum or fully hidden in the color view while its projected shadow still reaches a visible road, sidewalk, vehicle, or facade. Reusing the color PVS to disable `castShadow`, a merged shadow caster, or an ancestor of that caster would therefore create missing or popping shadows.

The game already has conservative visible-region shadow-caster culling in `src/graphics/lighting/ShadowCasterCulling.js`. It sweeps caster bounds along the shadow direction before testing the gameplay frustum, and existing benchmarks report pixel-identical culling A/B results. Keep that system authoritative for sun-shadow relevance in the first implementation. Do not bake or enable a second shadow PVS by default. A new full 625-cell camera bake is not required solely for shadows unless the integration validation finds a mismatch; a dedicated deterministic shadow-preservation run is required.

# Request

Implement and validate a first-phase baked static-visibility system for buildings, traffic lights, traffic signs, and trees using the completed research. Keep building slabs, all road/surface/marking layers, ground tiles, and unapproved categories always visible. Do not enable any category until it has zero observed false negatives in the final native-resolution route and camera test suite.

Tasks:

- Inspect the completed reports and current scene/shadow ownership before changing production code.
- Create deterministic stable visibility IDs for exactly the approved first-phase roots: buildings, traffic lights, traffic signs, and trees.
- Ensure the ID mapping and baked payload are versioned and invalidated by all inputs that can alter visibility, including city/layout data, static geometry/assets, camera FOV/near/far, camera height/pitch profiles, direction count, sample offsets, bake resolution, alpha rules, and bake format version.
- Add an explicit city/config freshness hash to every visibility-map payload:
  - deterministically canonicalize and hash the complete resolved city configuration that affects static visibility, including the map/city spec, road/layout configuration, building placement list, every referenced building configuration, and other approved static-prop placement/configuration inputs;
  - make the hash independent of object-key insertion order and other nondeterministic serialization details;
  - save the hash and hash-schema/version identifier in the visibility-map metadata;
  - recompute the same hash from the live resolved city/building configuration before activating a visibility map;
  - require an exact match; a missing, malformed, unsupported-version, or mismatched hash must mark the map stale, keep every affected category visible, and expose the reason in diagnostics;
  - add a test proving that a meaningful city, building placement, or building configuration change invalidates the map, while semantically identical reordered configuration data produces the same hash.
- Build or adapt a reproducible offline baker that:
  - covers all 625 BigCity2 cells;
  - uses the existing 3 x 3 horizontal positions;
  - includes all three original height/chase-pitch poses;
  - includes low +30/+60/+90, middle -15, and top -30/-45-degree pitch coverage;
  - samples all pitch profiles at 12 yaw directions;
  - respects tree foliage alpha cutouts rather than treating leaf cards as opaque rectangles;
  - excludes invalid camera positions inside opaque buildings from evaluation statistics;
  - renders at least 384 x 216 for the first production candidate and validates against native or higher resolution;
  - applies a small measured ID-edge visibility dilation or an equally conservative rule;
  - unions the 27 spatial/height observations and all approved pitch observations into the cell/direction masks;
  - pre-unions each mask with its surrounding 3 x 3 cells.
- Store one compact bit mask per all-cell/direction entry. Buildings + traffic controls + trees are 228 units and require eight `Uint32` words per mask; 625 x 12 directions is approximately 240,000 bytes before compression/metadata.
- At runtime:
  - retain normal Three.js frustum culling;
  - resolve the camera cell and the two 12-direction yaw bins bracketing actual yaw;
  - union those two masks;
  - apply only changed visibility bits;
  - use cell/yaw hysteresis or a short temporal grace period so boundary jitter cannot cause popping;
  - use a safe all-visible fallback whenever data is missing, stale, malformed, unsupported, or still loading.
- Add a persistent user-facing `Visibility map` toggle to the gameplay configuration/options menu:
  - default it on for supported gameplay once the production profile passes its gates;
  - when off, bypass visibility-map loading/application and immediately restore every affected root to visible;
  - distinguish an intentional user disable from a load/application failure and show the corresponding warning message;
  - integrate it with the existing save/cancel/reset and persisted-settings behavior.
- Show a non-blocking visibility-map status warning at the bottom of the gameplay screen whenever the optimization is unavailable:
  - when the toggle is on but the map cannot be loaded or safely applied, show: `The visibility map could not be loaded. Performance may be impacted.`;
  - when the user intentionally turns the toggle off, show the distinct message: `The visibility map is disabled. Performance may be impacted.`;
  - keep the all-visible fallback in both states, avoid repeated/toast spam, expose technical failure reasons only in diagnostics, update the displayed message when state changes, and clear the warning once an enabled visibility map becomes valid and active.
- Do not hide a shared building/prop/tree parent when that would remove a merged shadow caster, collider, light, animation, trigger, audio source, or unrelated child. Introduce or use independently safe visual subgroups as needed.
- Treat the visibility-map decision as color-pass visibility only. It must not disable or overwrite `castShadow`, hide/detach a merged shadow caster, set an ancestor of a required caster to `visible = false`, or replace the decision made by the existing `ShadowCasterCuller`.
- Preserve the existing building, traffic-control, and tree shadow behavior. Measure current merged/instanced shadow ownership and verify it explicitly under PVS toggles. If a category cannot be excluded from the gameplay color pass without changing its shadow contribution, leave that category visible and report the isolation failure.
- Run a dedicated deterministic shadow-preservation experiment with the new PVS enabled and disabled:
  - keep the existing `ShadowCasterCuller` enabled and in the same state on both sides of each A/B so the test isolates the new PVS;
  - freeze camera, sun, animation, weather, and temporal effects;
  - include supported single-map and cascaded-shadow modes, representative bus/raised/manual camera poses, default and low sun elevations, multiple sun azimuths, and shadow-receiving roads, sidewalks, vehicles, and facades;
  - include adversarial cases where a building or prop is absent from the color PVS but its shadow projects into the visible receiver region;
  - compare the generated shadow-map/depth contents where readable and compare native-resolution shadow-only and final-color captures;
  - require pixel-identical shadow contribution between PVS off and on, apart from an explicitly documented zero-impact numerical tolerance;
  - if any mismatch appears, fix the render-pass isolation or keep the affected category all-visible; do not expand the main-camera visibility mask heuristically and call that shadow-safe.
- If shadow-map visibility optimization is investigated later, treat it as a separate experiment keyed by all relevant sun direction/elevation, shadow distance, shadow type/quality, cascade, and receiver-region inputs. Never infer shadow casters from the gameplay color PVS alone.
- Handle asynchronous trees safely. Until all expected tree roots and matching baked IDs are ready, keep the category fully visible.
- Keep building slabs, asphalt, asphalt edge wear, curbs, sidewalks, sidewalk edge dirt, all markings, crosswalks, arrows, terrain/ground tiles, and all unsupported categories out of the runtime PVS.
- Add global and per-category enable/disable controls for A/B profiling and emergency rollback. Default to safe visibility if a category fails validation.
- Ensure gameplay, debug scenes, map/city editors, reflection/auxiliary cameras, photo modes, and unsupported camera configurations cannot inherit the main gameplay-camera mask accidentally.
- Add diagnostics that show the current cell, yaw bins, pitch profile coverage, active/changed bits, visible/culled roots by category, bake version/stale state, fallback reason, and update timings without normal release overhead.
- Add automated tests for:
  - stable ID generation and version invalidation;
  - mask encoding/decoding and two-direction lookup;
  - map-edge neighboring-cell expansion;
  - cell/yaw hysteresis;
  - missing/stale/malformed payload fallback;
  - asynchronous tree readiness/mismatch fallback;
  - category opt-outs;
  - visual-group isolation;
  - building, traffic-control, and tree shadow preservation, including an off-camera or color-occluded caster whose shadow reaches a visible receiver;
  - PVS updates not mutating `castShadow`, merged-caster attachment/ancestor visibility, or the existing `ShadowCasterCuller` result;
  - unsupported-camera all-visible behavior;
  - gameplay visibility-map toggle persistence, immediate all-visible restoration, and save/cancel/reset behavior;
  - bottom-screen warning behavior for missing, stale, malformed, unsupported, and failed-to-apply maps, plus the distinct intentional-disable warning, state transitions between both messages, clearing after successful activation, and no repeated-warning spam.
- Add deterministic visual regression routes covering southern dense streets, open northern streets, intersections, cell/yaw boundaries, turns, camera smoothing, bus pitch/roll/suspension movement, and the full manual pitch range including straight up.
- Compare baked decisions with native-or-higher resolution truth. Record false negatives by category, screen-space pixels, distance, pose, and cause. The final enabled profile must have zero observed visible-root false negatives; otherwise expand/dilate the masks or leave the failing category disabled.
- Benchmark the completed implementation against an unmodified baseline with the full active renderer, current shadows, GTAO/post-processing, and normal batching. Include warmed low/median/high/worst-opportunity views and representative routes.
- Report actual net frame/GPU time, draw calls, triangles, CPU traversal, visibility writes, table load/decode time, memory, bake duration, and compression. Do not infer whole-frame improvement from visibility-unit percentages.
- Prioritize trees in renderer A/B because their 124 roots contain approximately 1.17 million alpha-tested triangles; verify that alpha overdraw and shadow behavior translate the visibility reduction into a real gain.
- Update `tests/artifacts/occlusion_experiment_v2/REPORT.md` or create a clearly linked production-validation report with final implementation results.

## Deferred road follow-up

Do not include this in the first enabled production profile. If time remains after the approved categories pass every gate, produce a separate non-default experiment that:

- compares current nine merged road draws with 2 x 2, 4 x 4, and regional chunk sizes using actual materials;
- repeats the comparison with road geometry tessellated to ten times the current triangle count while preserving the same visible shape, materials, coverage, and shading as closely as possible;
- treats approximately 711,890 merged triangles versus a modeled approximately 15,090 visible one-cell-chunk triangles and 9 versus 31.31 draws only as a sensitivity hypothesis, then records the actual submitted triangles and draws from the generated 10x meshes;
- measures added draws, traversal, memory, build/load cost, triangles, fragments, and full-renderer frame time;
- reports CPU and GPU frame-time break-even behavior for the current 1x and required 10x cases on representative low-, median-, and high-opportunity views; optionally add intermediate densities if needed to locate the crossover;
- tests native-resolution thin-feature correctness and conservative dilation;
- compares object chunks with approaches that retain merged draws;
- enables a road category only if it has both a measured net frame-time win and zero observed visual omissions.

## Acceptance criteria

- Buildings, traffic lights, traffic signs, and trees use the implemented PVS only after passing the final native-resolution zero-miss route suite.
- The production bake uses 3 x 3 horizontal samples, the complete original and added pitch set, 12 directions, neighboring-cell pre-union, and a measured conservative visibility guard.
- Four/eight-direction, tested 4 x 4, and 16-direction profiles are not selected unless new same-or-better evidence is documented.
- Building slabs and all road/terrain/marking layers remain outside the enabled PVS.
- Every visibility-map payload stores its deterministic city/building configuration hash and hash-schema version, and runtime activation verifies them against the live resolved configuration.
- Missing/stale data, configuration-hash mismatch, ID mismatch, async tree mismatch, unsupported city, and unsupported camera states all fail open to visible.
- Gameplay exposes a persisted visibility-map toggle. Intentional disable restores all affected roots and shows the distinct disabled-state performance warning; an enabled map that cannot be loaded or applied fails open and shows the load-failure performance warning. Both appear at the bottom of the gameplay screen without spamming and clear after successful activation.
- Shadows and non-gameplay cameras retain safe behavior.
- With the existing shadow culler held constant, PVS-on and PVS-off shadow maps/shadow-only captures are pixel-identical across the required camera, sun, and shadow-mode matrix. Any category that fails remains outside the enabled PVS.
- The runtime can be disabled globally and per category.
- Current-density roads remain outside the first enabled PVS. The deferred road experiment includes the required 10x-triangle-density full-renderer A/B, and no road mode is recommended from modeled triangle counts alone.
- Runtime lookup and visibility-write costs are measured.
- Full-renderer and deterministic visual regression tests pass.
- Generated captures are stored only under `tests/artifacts/screens/<topic>/`; other generated experiment output stays under `tests/artifacts/<topic>/`.
- No unrelated behavior or user changes are overwritten.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_520_CITY_static_scene_visibility_bake_research_and_implementation_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.

# Completion summary

- Added deterministic stable IDs for 67 buildings, 10 traffic lights, 27 traffic signs, and 124 asynchronously loaded trees while keeping slabs and every road/ground layer outside the PVS.
- Added sorted-key canonical city hashing over the resolved map, building configurations/placements, generator configuration, traffic controls, trees, and bake profile, with strict payload freshness validation and fail-open reasons.
- Added a versioned compact base64 little-endian `Uint32` payload and tracked 240,000-byte raw visibility table for all 625 cells and 12 yaw directions.
- Added the reproducible 607,500-view 3x3/three-height/all-pitch baker with alpha-tested tree IDs, two-pixel projected edge guards, neighboring-cell pre-union, and native-resolution validation/repair.
- Added runtime cell lookup, bracketing-yaw mask union, 250 ms boundary grace, category opt-outs, dirty visibility writes, camera compatibility gates, and safe all-visible recovery.
- Added renderer isolation that restores original roots for shadow and auxiliary-camera passes without mutating `castShadow`, merged casters, cascade ownership, or the existing shadow culler.
- Added persistent global/per-category Graphics options, live Save/Cancel/Reset behavior, opt-in diagnostics, and the exact distinct bottom-screen warnings for disabled and failed visibility maps.
- Added unit, payload, options, gameplay, async-tree, unsupported-camera/city, auxiliary-camera, and real single/cascade shadow integration coverage.
- Produced the authoritative 2.5:1 bake with zero final misses in 750 native 1280x720 views and recorded full storage, inventory, lookup, draw, triangle, and frame-time tables.
- Verified 12 single/cascade low/default-sun shadow comparisons are pixel-identical with 98-143 color-hidden roots restored for shadow rendering.
- Completed the separate real-renderer road sensitivity run at 1x and 10x geometry across merged and 1/2/4/5-cell layouts; every chunk layout regressed frame time, so roads remain excluded.
- Added the production contract, tracked machine-readable benchmark records, baker/runtime/road tools, and tool documentation.
