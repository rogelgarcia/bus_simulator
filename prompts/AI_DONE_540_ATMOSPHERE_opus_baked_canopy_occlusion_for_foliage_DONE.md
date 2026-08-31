DONE

# Problem

Tree canopies read flat and low-contrast because they receive no ambient occlusion at all, while every surface around them is darkened at GTAO intensity 1.05.

Foliage is excluded from AO twice over. As an occluder, `PostProcessingPipeline._installAoSceneExclusions` (lines 672-695) sets `object.visible = false` on every object matching `isWholeObjectAoExcludedReceiver`, so leaf meshes vanish from the AO depth/normal pass and cast no AO onto themselves, each other, or the ground. As a receiver, `_renderAoReceiverExclusionMask` rasterises a foliage mask and the patched blend shader at `postprocessing_gtao_blend.frag.glsl:14` does `factor = mix(factor, 1.0, exclusion);`, forcing the AO factor to exactly 1.0 on every foliage pixel.

The predicate is `AoAlphaCutoutSupport.js:36-41`, which matches `userData?.isFoliage === true`; `TreeGenerator.js:499` tags every tree mesh accordingly. `AMBIENT_OCCLUSION_DEFAULTS` is `mode: 'gtao'`, `alpha: { handling: 'exclude', threshold: 0.36 }`, `gtao: { intensity: 1.05, radius: 2.42 }`, with `staticAo.mode` off and `busContactShadow.enabled` false — so there is no other occlusion term to compensate.

The ambient this competes against is entirely unoccluded. The rig is one DirectionalLight at 5.75, one `HemisphereLight(0xffffff, 0x2a3b1f)` at 1.46 (`City.js:125`), and a PMREM of `german_town_street_2k.hdr` at `envMapIntensity` 0.28, with no AmbientLight. Hemisphere lights are never shadowed in three, and the env map carries no occlusion. For a vertical leaf plate that is roughly 1.6 ambient against 5.75 direct — and none of the ambient is occluded anywhere in the canopy, including deep inside the crown, which is exactly where a real tree gets its dark core.

Two constraints that must shape the solution:

- **This affects tone, not silhouette.** It cannot make a canopy denser. AI 537 is what addresses thinness; this document addresses flatness. Do not conflate them.
- **The obvious fix is a trap.** Flipping `alpha.handling` to `'alpha_test'` so foliage participates in screen-space GTAO hands three's GTAOPass a single-layer depth buffer of the canopy's *front surface*. That produces noisy horizon-search darkening, not the volumetric multi-bounce occlusion an offline renderer supplies. The exclusion was a deliberate choice to avoid halo artifacts on alpha-cutout geometry, documented in the AI 313 lineage.

Note also that trees are not unlit in shadow terms: `TreeGenerator.js:500-501` sets `castShadow` and `receiveShadow` true, and `City.js:62-63` preserves `shadowSide` DoubleSide for foliage, so canopies do get cascaded shadow-map self-shadowing. The missing GTAO is a 2.42 m contact term on top of that, which is why this is a moderate improvement rather than a dramatic one.

Ruled out already, so it is not re-litigated: `applyTreeMaterials` (`TreeGenerator.js:487-503`) replaces every source material, which would discard baked vertex-colour canopy AO if the assets carried any. They do not — the desktop FBX files contain only `LayerElementUV` and `LayerElementNormal`, no `LayerElementColor`. Nothing is being thrown away.

# Request

Give tree canopies an interior occlusion gradient via a baked per-plate canopy-depth term driven as an `aoMap` or vertex-colour multiply, rather than by admitting foliage into screen-space GTAO.

## Execution gate

- Do not start until AI 537 is DONE. Tone changes to a canopy are not meaningfully assessable while its silhouette is still eroding with distance.

## Motivation and relevance

The driving motivation for this batch is **increasing tree fullness and correcting colour**. Other issues were captured incidentally during the same investigation and are tracked in their own AI documents.

**Relevance of this document: PRIMARY, second order — it serves the "fullness" goal through perceived depth rather than actual coverage, and it serves the colour goal by restoring tonal range to the canopy.** A canopy with a dark interior reads as volumetric and full even at identical leaf coverage. It is the natural follow-on to AI 537 but is worth strictly less, and should not delay it.

Tasks:

- Compute a per-plate canopy-depth term offline. For each leaf plate, derive an occlusion scalar from its position within the crown — candidates include distance from the crown hull, number of sibling plates occluding it along the ambient hemisphere, or a ray-cast visibility sample against the tree's own plates. State the method and why it approximates hemispherical visibility.
- Bake the term to whichever channel is cheapest to consume. Vertex colours on the plate corners are likely sufficient given plates are 4 or 6 vertices; an `aoMap` needs a second UV set and is probably not warranted. Justify the choice.
- Wire it into the leaf material as a multiply on the ambient/indirect contribution specifically, not on the direct sun term, so lit leaves stay lit and only the ambient floor drops in the crown interior.
- Do **not** change `alpha.handling` from `'exclude'` unless you can demonstrate with screenshots that the alternative does not introduce the halo and horizon-search artifacts described above. If you test it, report the result either way — a documented negative is valuable here.
- Calibrate against a reference rather than by eye. The current unoccluded lit-to-shadowed ratio for a leaf is roughly 3:1; a realistic canopy sky-visibility factor would put it far higher. Choose a target, state it, and show the achieved ratio.
- Confirm the term is stable across the catalog. Trees range from 152 to 280 plates on desktop and 136 to 232 on mobile; a depth heuristic tuned to one tree may misbehave on `SM_H_Tree_14` or `SM_H_Tree_15`, which have markedly fewer plates.
- Report the cost: bake time, added asset size, and any per-frame shader cost.
- Verify the change does not interact badly with the cascaded shadow maps that already self-shadow the canopy, producing doubled darkening in the crown interior.

## Visual evidence (mandatory)

Capture exactly four screenshots at 4K (3840x2160), all sharing the same city, seed, time of day, weather and graphics settings:

1. **Far** — trees at roughly 70-150 m, with enough of them in frame to judge canopy density across distance.
2. **Medium A** — trees at roughly 25-40 m, pose A.
3. **Medium B** — trees at roughly 25-40 m, a clearly different pose and heading from A.
4. **Close** — a single tree at roughly 8-15 m, filling most of the frame.

This change is visual, so capture the full set **before and after** from byte-identical camera poses and settings, and present them as before/after pairs. The "before" is the post-AI-537 build; state this explicitly.

Record for every capture: resolution, camera pose, city and seed, resolved `treeQuality`, AA mode, AO mode, colour-grading preset, and any localStorage overrides in effect.

Acceptance requirements:

- Canopy interiors are visibly darker than canopy edges in the close and medium screenshots, with a stated and achieved lit-to-shadowed ratio.
- No doubled darkening where the baked term overlaps cascaded shadow-map self-shadowing.
- `alpha.handling` remains `'exclude'`, or the alternative is demonstrated artifact-free with screenshots.
- The depth heuristic behaves correctly on the low-plate-count outliers as well as the typical trees.
- Bake time, asset size delta and per-frame cost are reported.
- The summary states plainly that this changes tone and not silhouette, and does not claim credit for density improvements belonging to AI 537.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_540_ATMOSPHERE_opus_baked_canopy_occlusion_for_foliage_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the four before/after screenshot pairs, the depth-term method and channel choice, the target and achieved lit-to-shadowed ratio, the outlier-tree verification, the cost figures, and the result of any `alpha_test` experiment.

# Closure notes

**Final disposition: REVERTED AND CLOSED.** The prototype produced a measurable result, but the improvement was difficult to see without direct side-by-side comparison at normal gameplay distances. Its custom shader hook, generated 30-model catalog, runtime geometry coupling, baker, and maintenance surface were not justified by the visual gain.

All AI540 production code, generated data, tests, baker tooling, and tool-registry wiring were removed. The 4K captures are retained as decision evidence. The measurements below describe the evaluated prototype, not the current runtime.

- Method: the offline baker measures each plate centroid inside a 95th-percentile ellipsoidal crown hull. Normalized depth from that hull is raised to exponent 0.85 and mapped to 1.0 at the hull and 0.6 at the deepest plate. For a roughly isotropic crown, hull depth is a deterministic proxy for the solid angle of sky hidden by sibling foliage, so it approximates hemispherical visibility without runtime rays.
- Channel: one normalized `Uint8` vertex attribute (`treeCanopyAo`) is expanded from one generated byte per plate. This avoids a texture fetch, an AO texture, and a second UV set. The shader adds one interpolator, one clamp, one indirect-diffuse multiply, and—when an environment map is active—one indirect-specular multiply. Direct diffuse/specular and cascaded shadow-map terms are untouched.
- Calibration: minimum ambient visibility is 0.6. Applied to the measured 3:1 baseline, the deepest quantized value is 153/255 = 0.6 and produces the 5:1 target exactly. Rendered central-green tone deltas were -0.08% far, -0.51% medium A, -0.73% medium B, and -7.78% close.
- Catalog: all 30 desktop/mobile models baked successfully. Low-card outliers remained within the catalog distribution: H14 608 plates/mean 0.8312, H15 640/0.8239, M14 544/0.8109, and M15 280/0.8294; all span 0.6-1.0.
- Cost: the final full-catalog bake took 871.1 ms. The generated module is 43,052 bytes and contains 20,653 raw factor bytes. If all 30 quality variants are resident, the runtime vertex attributes total 559,155 bytes. There are no added textures, uniforms, draw calls, or per-frame CPU work.
- GTAO/CSM: `alpha.handling` remains `exclude`; no `alpha_test` experiment was run. The focused shader-contract test proves the new scalar appears only on `indirectDiffuse`/`indirectSpecular`, so it cannot double-multiply direct CSM self-shadowing. All four production renders completed without runtime errors or visible CSM overlap artifacts.
- Evidence (all 3840x2160, byte-identical camera/settings; before is post-AI537): [far before](../tests/artifacts/screens/trees/ai540/before_01_far.png) / [far after](../tests/artifacts/screens/trees/ai540/after_01_far.png), [medium A before](../tests/artifacts/screens/trees/ai540/before_02_medium_a.png) / [medium A after](../tests/artifacts/screens/trees/ai540/after_02_medium_a.png), [medium B before](../tests/artifacts/screens/trees/ai540/before_03_medium_b.png) / [medium B after](../tests/artifacts/screens/trees/ai540/after_03_medium_b.png), [close before](../tests/artifacts/screens/trees/ai540/before_04_close.png) / [close after](../tests/artifacts/screens/trees/ai540/after_04_close.png). The single comparison sheet is [comparison_side_by_side.png](../tests/artifacts/screens/trees/ai540/comparison_side_by_side.png).
- Validation: AI540 focused tests pass 3/3. The full Node unit run was 677 passed, 3 skipped, and 7 unrelated existing failures. The local 4K game capture passed with 8x MSAA, GTAO exclude, Vivid 0.65, desktop trees, `bigcity2`, seed `x`, and no page/runtime errors.

The evaluated prototype changed canopy tone and perceived depth only; it did not change silhouette, plate coverage, or density. After this revert, AI540 makes no change to the current production runtime.