# DONE

# Problem

Tree canopies in game read far thinner and paler than the same FBX assets rendered offline, and the effect worsens with distance: close-up trees look correct while distant trees look like bare twigs with sky bleeding through.

The cause has been measured. `TreeGenerator.js:360` sets `leaf.alphaToCoverage = true` on the leaf material alongside `alphaTest: 0.5`. In three.js r183 (pinned in `index.html:78` as `three@0.183.2`) the `ALPHA_TO_COVERAGE` define replaces the binary cutout in `alphatest_fragment` with:

```glsl
diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
if ( diffuseColor.a == 0.0 ) discard;
```

The ramp width is the local alpha gradient, which grows every time the atlas is minified. MSAA is genuinely active — `ANTIALIASING_DEFAULTS` is `mode: 'msaa'` / `samples: 8`, and `PostProcessingPipeline.js:1420` puts those samples on the composer render targets — so the smoothstepped alpha becomes a real fractional sample mask rather than an inert value.

Measured on the real `T_Leaf_Realistic9.TGA` (2048x2048, 19.79% alpha coverage above 0.5), box-filtering alpha to each mip and evaluating exactly that formula with `fwidth = |dFdx| + |dFdy|` at one screen pixel per texel:

| mip | plate on screen | approx distance | hard cutout | with A2C |
|---|---|---|---|---|
| 0 | 2048 px | — | 19.79% | 19.34% (98%) |
| 3 | 256 px | ~9 m | 19.79% | 16.89% (85%) |
| 4 | 128 px | ~18 m | 19.80% | 14.79% (75%) |
| 5 | 64 px | ~37 m | 19.24% | 11.78% (61%) |
| 6 | 32 px | ~74 m | 19.43% | 8.44% (43%) |
| 7 | 16 px | ~147 m | 17.58% | 4.30% (25%) |

Distances assume 1080p and a 60 degree vertical FOV. Because every leaf plate maps the **full** 0-1 UV range of the 2048 atlas (verified for all 6,385 plates in the catalog), mips 4-7 are the ordinary operating range, not an edge case.

A hard cutout does not have this problem — its coverage holds at ~19.8% through mip 7. The erosion is caused specifically by the A2C code path.

Two supporting facts worth knowing before changing anything:

- Because `transparent: false`, three sets `NoBlending` for the leaf draw, so the partial alpha cannot affect framebuffer RGB directly. The MSAA coverage mask is the only visible mechanism. This is what makes the fix a one-line change rather than a blending investigation.
- Overlapping plates do accumulate somewhat — hardware A2C masks are nested, so per-pixel coverage tends toward `max(alpha_i)`, not zero accumulation. Density builds, just far more weakly than with a hard cutout. Do not claim in the completion summary that plates "never" accumulate.

Provenance: `prompts/archive/AI_DONE_313_UI_graphics_options_ao_alpha_cutout_foliage_fix_DONE.md` introduced `alphaToCoverage`, but recommends it only "when MSAA is active (if feasible)" as part of strategy 1, *alpha-test foliage for the AO depth stage* — not for the beauty material. This looks like the flag was applied one level too broadly.

# Request

Stop distance-dependent canopy erosion on tree foliage by removing or bounding the alpha-to-coverage ramp on the leaf beauty material, without regressing leaf edge quality or the AO alpha-cutout behaviour that AI 313 was written to fix.

## Motivation and relevance

The driving motivation for this batch is **increasing tree fullness and correcting colour**. Other issues were captured incidentally during the same investigation and are tracked in their own AI documents.

**Relevance of this document: PRIMARY — this is the tree fullness fix.** It is the single highest-value change in the batch and the only one that addresses the reported symptom directly. Everything else in the batch is either a follow-on that is invisible until this lands, or an unrelated finding.

Tasks:

- Reproduce the symptom first and record the baseline. Load the game with `?aa=off` so `setComposerSamples` drops the composer targets to 0 samples; the smoothstep still runs but coverage has no effect. If the canopy visibly thickens, the diagnosis is confirmed. Record this A/B before changing any code.
- Confirm the sampled mip range in practice. Instrument or compute the on-screen pixel footprint of a leaf plate at the far, medium and close poses used for the screenshots, and state the mip level each corresponds to. Do not assume the table above transfers unchanged to the project's actual FOV and resolution.
- Implement the fix. Preferred: set `leaf.alphaToCoverage = false` in `makeTreeMaterials` so the hard 0.5 cutout is restored; leaf edges then get MSAA geometric antialiasing only, with no per-fragment feathering. If per-fragment edge softening is judged worth keeping, instead bound the ramp via `onBeforeCompile` overriding `alphatest_fragment` with a clamped width, for example `smoothstep(alphaTest, alphaTest + min(fwidth(diffuseColor.a), 0.08), diffuseColor.a)`, and justify the chosen bound with measurements rather than taste.
- Verify that the AO alpha-cutout path that AI 313 introduced is unaffected. `userData.aoAlphaMap` feeds AO prepass override materials only and never reaches the beauty shader; confirm this still holds and that AO depth/normal behaviour for foliage is unchanged by this edit.
- Check whether `alphaToCoverage` is set on any other cutout material in the project (grass, signs, fences, any other foliage) and report whether they have the same defect. Fix only what is in scope for trees; file the rest as findings.
- Re-measure coverage after the fix using the same method as the baseline, and report the corrected table.
- Evaluate leaf edge quality at the close pose specifically. A hard cutout with 8x MSAA should be acceptable, but if aliasing on leaf silhouettes is objectionable at 4K, say so with evidence rather than silently reverting to A2C.

## Visual evidence (mandatory)

Capture exactly four screenshots at 4K (3840x2160), all sharing the same city, seed, time of day, weather and graphics settings:

1. **Far** — trees at roughly 70-150 m, with enough of them in frame to judge canopy density across distance.
2. **Medium A** — trees at roughly 25-40 m, pose A.
3. **Medium B** — trees at roughly 25-40 m, a clearly different pose and heading from A.
4. **Close** — a single tree at roughly 8-15 m, filling most of the frame.

This change is visual, so capture the full set **before and after** from byte-identical camera poses and settings, and present them as before/after pairs.

Record for every capture: resolution, camera pose, city and seed, resolved `treeQuality`, AA mode, AO mode, colour-grading preset, and any localStorage overrides in effect.

Acceptance requirements:

- The `?aa=off` A/B is recorded before any code change, and its result is stated plainly whether or not it confirms the diagnosis.
- Foliage coverage no longer falls off with distance beyond what ordinary mip filtering of a hard cutout produces; the post-fix coverage table is included.
- The far screenshot shows a visibly denser canopy than its before counterpart, and the close screenshot shows no regression in leaf edge quality.
- AO behaviour for foliage is unchanged, and the AI 313 alpha-cutout AO path still works as designed.
- Any other material carrying `alphaToCoverage` is listed, with a stated judgement on whether it has the same defect.
- The completion summary does not overstate the mechanism: it must reflect that A2C coverage tends toward `max(alpha_i)` across overlapping plates rather than failing to accumulate at all.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_537_MATERIAL_opus_foliage_alpha_to_coverage_canopy_thinning_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the four before/after screenshot pairs, the `?aa=off` A/B result, the before and after coverage tables with the measured mip range for each pose, the chosen fix and why, and any other cutout materials found to share the defect.

## Completion summary

### Result

- Restored a hard 0.5 alpha cutout on the gameplay tree beauty material by setting `leaf.alphaToCoverage = false` in `TreeGenerator.js`. The material remains opaque/cutout (`transparent: false`) and keeps ordinary 8x MSAA geometric edge antialiasing.
- The distance-dependent A2C ramp is removed. Overlapping plates did accumulate before the fix, but hardware A2C masks tend toward `max(alpha_i)` across overlaps, so density built much more weakly than with the corrected hard cutout; they did not fail to accumulate entirely.
- Native-pixel inspection of the 4K close pose found no objectionable silhouette aliasing. The post-fix canopy is visibly fuller while individual leaf edges remain acceptable.

### Required 4K before/after pairs

All files are exactly 3840x2160. Each pair uses byte-identical camera coordinates and common settings.

| Pose | Distance | Median plate footprint | Measured mip | Evidence |
|---|---:|---:|---:|---|
| Far | 110.678 m | 17.04 px | 6.91 | [before](../tests/artifacts/screens/trees/ai537/before_01_far.png) / [after](../tests/artifacts/screens/trees/ai537/after_01_far.png) |
| Medium A | 32.009 m | 58.80 px | 5.13 | [before](../tests/artifacts/screens/trees/ai537/before_02_medium_a.png) / [after](../tests/artifacts/screens/trees/ai537/after_02_medium_a.png) |
| Medium B | 34.001 m | 56.94 px | 5.20 | [before](../tests/artifacts/screens/trees/ai537/before_03_medium_b.png) / [after](../tests/artifacts/screens/trees/ai537/after_03_medium_b.png) |
| Close | 11.232 m | 188.57 px | 3.44 | [before](../tests/artifacts/screens/trees/ai537/before_04_close.png) / [after](../tests/artifacts/screens/trees/ai537/after_04_close.png) |

Camera positions, all targeting `(-140.128, 5.740, -72.271)` at FOV 55 degrees:

- Far: `(-93.640, 17.970, 27.422)`
- Medium A: `(-121.774, 4.970, -46.059)`
- Medium B: `(-125.759, 5.970, -103.086)`
- Close: `(-149.655, 3.470, -66.771)`

Common capture state: `bigcity2`, seed `x`, desktop tree quality, 3840x2160 viewport/drawing buffer at pixel ratio 1, compositor MSAA active at 8 samples, GTAO with foliage exclusion and threshold 0.36, Vivid grading at intensity 0.65, default static clear atmosphere, sun azimuth 45 degrees/elevation 35 degrees. The only localStorage override was `bus_sim.tree_quality.v1=desktop`. Full machine-readable metadata is in [before_report.json](../tests/artifacts/screens/trees/ai537/before_report.json) and [after_report.json](../tests/artifacts/screens/trees/ai537/after_report.json).

### Pre-change `?aa=off` A/B

Before the code change, the game was reloaded at the identical far pose with `?aa=off`. Diagnostics confirmed compositor samples dropped from 8 to 0 while every other recorded setting remained fixed. The no-AA view visibly retained more distant leaf coverage, confirming the diagnosis. The broad canopy ROI also became slightly more saturated (`0.38129` versus `0.38009` with MSAA/A2C). The diagnostic image and full settings are recorded in the before report.

### Coverage measurement

The real 2048x2048 `T_Leaf_Realistic9.TGA` alpha was box-filtered 2x2 per mip. The pre-change column evaluates the three.js A2C ramp with finite-difference `fwidth`; the post-fix effective coverage is the hard 0.5 cutout.

| Mip | Hard cutout / post-fix | Pre-change A2C | A2C retention |
|---:|---:|---:|---:|
| 0 | 19.7880% | 19.3399% | 97.74% |
| 1 | 19.7908% | 18.9713% | 95.86% |
| 2 | 19.8219% | 18.2422% | 92.03% |
| 3 | 19.7922% | 16.8714% | 85.24% |
| 4 | 19.7998% | 14.7964% | 74.73% |
| 5 | 19.2383% | 11.8309% | 61.50% |
| 6 | 19.4336% | 8.1197% | 41.78% |
| 7 | 17.5781% | 4.5386% | 25.82% |

The measured gameplay poses therefore exercise the problematic range directly: the far pose samples near mip 6.91, both medium poses near mip 5.2, and the close pose near mip 3.44.

### AO verification

- `userData.aoAlphaMap` remains present on the post-fix tree leaf material in all four captures. The beauty material flag is false in the isolated post-fix report, while GTAO and 8x MSAA remain active.
- `AoAlphaCutoutSupport` still feeds `userData.aoAlphaMap` only into AO override materials; it does not feed the beauty shader.
- `tests/node/unit/ao_alpha_cutout_support.test.js`: 13/13 passed.
- `tests/headless/e2e/ao_foliage_gtao_alpha_handling.pwtest.js`: 2/2 passed.
- The new core expectation for hard tree beauty cutout plus retained AO alpha metadata passes. The broader core target still has the same five unrelated pre-existing failures present before this fix.

### Other alpha-to-coverage findings

- `AOFoliageDebuggerView.js` explicitly re-enables A2C on cloned debug-tree leaf materials. Because it uses the same full-atlas tree cards, it has the same erosion mechanism, but it is isolated to the AO debugger and was not changed in this gameplay-tree fix.
- The offline Grass Lab/GrassEngine contracts enable A2C at alpha cutoff 0.35 for coverage surfaces, mid-cluster cards, and accent cards. The same shader mechanism can thin minified grass coverage, but those atlases use eight subregion variants/gutters and dedicated LOD contracts rather than full-atlas tree cards. GrassEngine is documented as having no gameplay integration; it needs a separate distance-coverage study and was not changed here.
- `AoExclusionMaskRenderer.js` only mirrors a source material flag onto an AO override; it is not an independent beauty cutout material.
- No sign, fence, or other production foliage material in `src/` independently enables alpha-to-coverage.