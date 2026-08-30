# Static City Visibility

## Scope

Gameplay may apply a baked potential-visibility set (PVS) to independently hide static color-pass roots that are inside the camera frustum but occluded by nearer geometry. Version 1 covers only:

- 67 building roots;
- 10 traffic-light roots;
- 27 traffic-sign roots;
- 124 alpha-cutout tree roots.

The 228 roots occupy eight `Uint32` words per mask. Building slabs, asphalt, asphalt edge wear, curbs, sidewalks, sidewalk edge dirt, every marking/crosswalk/arrow layer, terrain, and ground are not PVS units and must remain on their existing render path.

## Identity and freshness

Every live root has a deterministic ID. Buildings use their authored building ID; traffic controls and trees use their deterministic placement index and category. The payload preserves the exact ordered `(id, category)` list used by the bit table.

Payload activation requires exact agreement on:

- schema, format version, and canonical-hash schema;
- city ID and geometry revision;
- bake-profile ID;
- map dimensions, tile size, and origin;
- ordered root IDs and categories;
- mask shape and encoding;
- the canonical city-configuration hash.

The FNV-1a 64-bit hash is computed over sorted-key canonical JSON containing the authored and resolved map data, resolved building and reservation lists, generator configuration, traffic-control placements, tree quality/placements, and the complete visibility profile. Object key order does not affect the hash. Any meaningful map, building, prop, geometry-revision, camera, sampling, resolution, or format change invalidates the payload and fails open.

The resolved building list contains only configurations referenced by the active city; adding an unused catalog building does not invalidate the bake. Visibility-neutral disabled schema defaults such as `fitToLot: false` and `footprintStretch: null` are normalized away, while enabling either feature remains hash-significant.

## Production bake profile

The tracked `bigcity2` payload uses:

- all 625 cells of the 25 x 25 map;
- horizontal offsets `[-8, 0, 8]` on both axes (3 x 3);
- baseline heights 1.22 m, 3.683181 m, and 6.146363 m, with their normal chase pitches;
- low-height pitches +30, +60, and +90 degrees;
- middle-height pitch -15 degrees;
- top-height pitches -30 and -45 degrees;
- 12 yaw directions for every baseline and added-pitch profile;
- 384 x 216 color-ID rendering and alpha-tested foliage silhouettes;
- a two-pixel projected thin-feature guard;
- pre-union with every valid cell in the surrounding 3 x 3 neighborhood;
- native 1280 x 720 deterministic route validation;
- a vertical FOV of 55 degrees and supported aspect ratios through 2.5:1.

This is 607,500 bake renders. The compact binary mask is exactly 240,000 bytes before JSON/base64 metadata. The baker is `tools/static_visibility_baker/run.mjs`; generated diagnostic reports belong under `tests/artifacts/static_visibility_bake/`.

The selected 3 x 3 / 12-direction profile is intentional. Research found that four or eight directions left more yaw gaps, sixteen provided little extra safety for one-third more bake work/storage, and the tested 4 x 4 layout was not a center-preserving superset and performed worse after neighbor expansion. A future spatial test should use a nested center-preserving layout such as 5 x 5.

## Runtime lookup

The normal Three.js frustum remains active. For a supported gameplay camera, runtime:

1. rounds world X/Z to the BigCity2 cell;
2. finds the two 12-direction bins bracketing the camera yaw;
3. ORs their pre-expanded masks;
4. retains the previous output for a 250 ms boundary grace period;
5. changes only roots whose output bit changed.

Per-category settings can bypass the PVS for buildings, traffic lights, traffic signs, or trees independently. Global disable and every error state restore all roots immediately. Cameras outside the map or outside the baked FOV, near/far, aspect, or pitch envelope also fail open. Debug/editor cities and unsupported city IDs never load the BigCity2 map. Asynchronous trees must finish with exactly the baked placement/root count before activation.

## Render-pass isolation and shadows

PVS root visibility is a gameplay color-pass decision only. A render bridge restores each root's original visibility while Three.js renders shadow maps, and restores it for any auxiliary camera rendering the gameplay scene. It reapplies the color mask afterward. Teardown restores all original visibility and renderer methods.

The PVS never mutates `castShadow`, merged-caster membership, light/cascade state, or `ShadowCasterCuller`. The existing swept-bound shadow culler remains authoritative because a color-hidden/off-camera building can still cast a visible shadow. A future shadow PVS would require a separate bake keyed by sun direction/elevation, shadow type/quality/range/cascades, and receiver region; the color PVS must never be reused for that purpose.

## Settings, warnings, and diagnostics

`Graphics > Static Visibility` provides the persisted global toggle, four category opt-outs, and diagnostics toggle. Changes apply live. Save persists, Cancel restores the entry state, and Reset selects the supported default (enabled).

The HUD has two non-spamming bottom warnings:

- disabled: `The visibility map is disabled. Performance may be impacted.`
- load/application failure: `The visibility map could not be loaded. Performance may be impacted.`

Loading and active states clear the warning. Diagnostics are opt-in and show state/reason, cell, yaw bins, pitch envelope, visible/culled roots, changed bits, lookup time, load/decode time, profile/version, and render-bridge writes.

## Production validation record

The authoritative 2.5:1 production bake completed in 349.5 seconds on an RTX 3060 and rendered 607,500 ID views. It found 228 units and produced 401,851 set bits, averaging 53.58 retained and 174.42 excluded roots per cell/yaw mask. The table is 240,000 raw bytes, 320,000 base64 bytes, and 338,636 bytes with JSON metadata; the complete asset compresses to 70,019 gzip bytes or 42,967 Brotli bytes.

Across 750 deterministic native 1280 x 720 road-camera views, the route gate observed one foliage-edge miss before conservative repair and zero misses afterward:

| Category | Visible truth observations | Frustum candidates | PVS-kept candidates | Candidate reduction | Final misses |
| --- | ---: | ---: | ---: | ---: | ---: |
| Buildings | 3,191 | 7,850 | 5,516 | 29.73% | 0 |
| Traffic lights | 264 | 833 | 817 | 1.92% | 0 |
| Traffic signs | 435 | 2,164 | 2,164 | 0.00% | 0 |
| Trees | 2,155 | 10,702 | 6,534 | 38.95% | 0 |

The traffic-sign result is deliberately fully conservative; category controls make it possible to disable that category independently if its lookup overhead ever outweighs its contribution.

The warmed full-renderer A/B used one frozen page, current low single-map shadows, four interleaved 12-frame bursts per state, `gl.finish()`, and the repository's minimum-sample convention. Median values are retained as a noise signal. Calls and triangles are the whole active renderer, not unit counts:

| Pose | PVS roots hidden | Off/on min ms | Min saving | Off/on median ms | Calls avoided | Triangles avoided |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Open north | 143 | 28.77 / 15.45 | 46.3% | 28.99 / 21.42 | 3,621 | 1,642,757 |
| Central intersection | 57 | 21.61 / 19.53 | 9.6% | 22.17 / 19.79 | 631 | 500,306 |
| Dense south/downward view | 32 | 5.53 / 5.37 | 3.0% | 5.61 / 5.47 | 0 | 0 |

The north timing spread is material, so the frame-time figures are machine-specific A/B evidence, not an FPS guarantee. The deterministic draw/triangle reductions and absence of a regression in all three sampled views support enabling version 1. Ten thousand runtime lookups took 55.2 ms total (0.00552 ms each) and caused only 109 visibility writes (0.0109 per lookup). Payload decode took 2.8 ms; the reported 16.7-second load includes complete asynchronous city/tree readiness, not table parsing.

Twelve direct 1280 x 720 render comparisons covered single and cascaded shadows, low/default sun elevations, four azimuth/mode combinations, and the three camera regions. Every PVS-on/PVS-off image was pixel-identical (zero changed pixels/channels) while 98-143 color roots were hidden in the adversarial captures and the bridge recorded the corresponding shadow visibility restorations. The existing shadow culler remained active and unchanged.

Full machine-readable results are tracked in `tests/benchmarks/ai520_static_visibility_bake_2026-08-29.json` and `tests/benchmarks/ai520_static_visibility_runtime_2026-08-29.json`.

The validation gate is category-specific: an enabled category must have zero observed native-resolution misses. A failure leaves that category all-visible until the bake/guard is corrected.

## Road decision

Road layers stay outside version 1. Current roads are nine merged draws and 71,189 triangles. One-cell chunk modeling reduced visible submitted triangles to roughly 1,509 but raised visible draws from 9 to 31.31; the triangle reduction alone does not demonstrate a frame-time win.

The required real-renderer follow-up constructed actual-material 1x and 10x road geometry, preserving the source shape and barycentrically interpolating every attribute. It compared the nine merged meshes with 1-, 2-, 4-, and 5-cell chunks at three frozen views. The 10x geometry contains exactly 711,890 triangles and 59,141,760 bytes of generated vertex attributes; build cost was 313-332 ms. Current-density chunks used 5,914,176 bytes and 67-82 ms of build time.

Minimum synchronized full-frame measurements are below. `delta` is relative to the merged mesh at the same density; positive values are regressions. Draws and triangles are whole-renderer submissions:

| Pose | Density/layout | Frame ms | Delta | Calls | Triangles |
| --- | --- | ---: | ---: | ---: | ---: |
| Open north | 1x merged | 99.34 | — | 7,428 | 3,514,204 |
| Open north | 1x span 1 / 2 / 4 / 5 | 105.14 / 102.19 / 100.82 / 100.20 | +5.80 / +2.85 / +1.48 / +0.86 | 9,200 / 8,696 / 8,076 / 7,852 | 3,327,712 / 3,345,480 / 3,363,300 / 3,387,136 |
| Open north | 10x merged | 99.48 | — | 7,428 | 6,077,008 |
| Open north | 10x span 1 / 2 / 4 / 5 | 102.78 / 101.94 / 99.72 / 102.25 | +3.30 / +2.46 / +0.24 / +2.77 | 9,200 / 8,696 / 8,076 / 7,852 | 4,212,088 / 4,389,768 / 4,567,968 / 4,806,328 |
| Central | 1x merged | 54.78 | — | 5,735 | 3,163,386 |
| Central | 1x span 1 / 2 / 4 / 5 | 63.28 / 59.51 / 57.30 / 56.77 | +8.50 / +4.73 / +2.52 / +1.99 | 9,155 / 7,867 / 6,731 / 6,459 | 3,059,962 / 3,077,822 / 3,112,322 / 3,132,654 |
| Central | 10x merged | 54.14 | — | 5,735 | 5,726,190 |
| Central | 10x span 1 / 2 / 4 / 5 | 62.65 / 59.24 / 57.58 / 56.76 | +8.51 / +5.10 / +3.44 / +2.62 | 9,155 / 7,867 / 6,731 / 6,459 | 4,691,950 / 4,870,550 / 5,215,550 / 5,418,870 |
| Dense south | 1x merged | 41.35 | — | 3,121 | 1,330,765 |
| Dense south | 1x span 1 / 2 / 4 / 5 | 46.56 / 44.54 / 42.86 / 42.92 | +5.21 / +3.19 / +1.51 / +1.57 | 4,949 / 4,253 / 3,673 / 3,497 | 1,135,525 / 1,139,825 / 1,164,853 / 1,181,957 |
| Dense south | 10x merged | 42.12 | — | 3,121 | 3,893,569 |
| Dense south | 10x span 1 / 2 / 4 / 5 | 47.02 / 44.86 / 42.84 / 42.36 | +4.90 / +2.74 / +0.72 / +0.24 | 4,949 / 4,253 / 3,673 / 3,497 | 1,941,169 / 1,984,169 / 2,234,449 / 2,405,489 |

Every current-density and 10x chunk layout was slower than its same-density merged reference at every measured pose. At 10x, four-cell chunks avoided as many as 1.66 million whole-frame triangles but added 552 draws and still regressed 0.72 ms in the dense-south view. Standard WebGL2 did not expose portable fragment counters or separate CPU/GPU timers, so these are CPU+GPU synchronized full-pipeline measurements. The generated 10x meshes stayed within the documented evidence-only raster tolerance (mean absolute channel difference at most 0.0146); current-density regional chunks changed at most one of 921,600 pixels. This does not approve a road mode.

The full 30-row table, all four timing samples, memory/build inventory, and 12 native direct-render comparisons are tracked in `tests/benchmarks/ai520_road_sensitivity_2026-08-29.json`. Roads remain excluded. Revisit only if road materials, batching, hardware target, or density changes enough to justify a new measured experiment; no road mode may be enabled without a consistent net frame-time win and zero unacceptable thin-feature omissions.

## Rebuild rule

Never hand-edit the payload. Run the baker after any hashed input or visibility-affecting geometry/profile change, run the native zero-miss gate and runtime/shadow validator, review storage and renderer A/B results, then commit the new payload and validation summary together.
