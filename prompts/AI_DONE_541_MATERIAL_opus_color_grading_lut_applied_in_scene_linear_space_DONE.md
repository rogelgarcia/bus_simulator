DONE

# Problem

The colour-grading pass applies a display-referred `.cube` LUT to a scene-linear HDR buffer, and clamps that buffer to `[0,1]` before tone mapping ever runs.

The composer order is `renderPass -> aoExclusionPass -> AO -> compositePass -> colorGradingPass -> TAA -> SMAA -> FXAA -> outputPass` (`PostProcessingPipeline.js:547-555`), and tone mapping happens **only** in `outputPass` — three sets a program's tone mapping to `NoToneMapping` unless the current render target is null, so the entire chain before that is scene-linear. `color_grading.frag.glsl:34` then does:

```glsl
vec3 srcLinear = clamp(base.rgb, 0.0, 1.0);
```

`COLOR_GRADING_DEFAULTS` is preset `vivid` at intensity 0.65.

There are two distinct defects here, and they are not equally important:

**The wrong-space problem is the real one.** A `.cube` LUT authored against display-referred values is being evaluated on pre-tone-map linear values. The transfer function the LUT expects is not the one it receives, so the grade does not do what it was authored to do at any input level. This is a correctness issue affecting every pixel in the frame.

**The clamp is real but minor, and the obvious rationale for it is wrong.** AgX's white point is 2^4.026069 = 16.29 scene-linear, so clamping input at 1.0 discards about 4 stops of highlight headroom. But almost nothing in this rig actually reaches 1.0. Running three r182's AgX at exposure 0.86: sunlit asphalt is 0.205 linear and lands at sRGB 127, nowhere near the clamp; the sky dome cannot clip either, since `ATMOSPHERE_DEFAULTS.sky.exposure` is 1.0 and horizon colour `#A8D2EE` peaks at 0.86 linear. What actually clips is the sun disc (~1.5 linear, 196 instead of ~209), the sun-bloom halo, specular highlights, and bright white bodywork (1.71 linear, 196 instead of 215). That is 10-20 sRGB levels on a small set of bright pixels.

Critically, **the clamp touches no leaf pixel at all** — leaves peak at 0.82 linear. Do not expect this document to improve foliage.

One caveat on the pass being active: `ColorGradingPass.js:30` sets `p.enabled = !!lutTexture && (p.uniforms.intensity.value > 0)`, and `vivid.cube` (970 KB, in `assets/public/luts/`) loads asynchronously. The pass is off until the LUT resolves, and off entirely without WebGL2. Any before/after comparison must account for that so an un-loaded LUT is not mistaken for a fix.

# Request

Apply colour grading in display-referred space — either by moving the LUT pass after tone mapping or by converting the LUT to operate correctly on scene-linear input — and remove the `[0,1]` clamp on the HDR buffer.

## Motivation and relevance

The driving motivation for this batch is **increasing tree fullness and correcting colour**. Other issues were captured incidentally during the same investigation and are tracked in their own AI documents.

**Relevance of this document: PRIMARY — this is the colour-correction half of the motivation.** It is the only document in the batch that addresses colour directly. Note the honest limitation: it will visibly change the frame's overall grade and recover highlight detail on bright objects, but it will **not** make foliage denser, and it will barely move leaf pixels at all, since leaves never approach the clamp. If the goal is greener or richer leaves specifically, that comes from AI 537 and AI 540, not from here.

Tasks:

- Decide and justify the approach. Moving `colorGradingPass` after `outputPass` is the direct fix but changes where TAA/SMAA/FXAA sit relative to the grade; converting the LUT to a linear-input variant preserves pass order but requires re-authoring the `.cube` files. Weigh both and state the choice.
- Remove the `clamp(base.rgb, 0.0, 1.0)` at `color_grading.frag.glsl:34`, ensuring whatever replaces it handles values above 1.0 without producing NaNs or wrapping in the LUT lookup.
- Verify the LUT lookup itself is correct for the chosen space, including its clamping and interpolation at the edges of the cube.
- Handle all three shipped presets (`cool`, `vivid`, `warm` in `assets/public/luts/`), not just the default, and confirm each still reads as its authored intent afterwards.
- Establish before/after with the LUT confirmed loaded. Because the pass silently disables until `vivid.cube` resolves, gate every capture on the LUT actually being active and record that fact in the capture metadata.
- Quantify the recovered highlight range. Report measured sRGB output for the sun disc, bloom halo, specular highlights and white bodywork before and after, rather than describing the change qualitatively.
- Confirm no regression on WebGL1 or wherever the pass is disabled — the un-graded path must still look correct.
- State explicitly, in the summary, the measured effect on leaf pixels. The expectation is approximately none; if it turns out otherwise, that is a finding worth recording.

## Visual evidence (mandatory)

Capture exactly four screenshots at 4K (3840x2160), all sharing the same city, seed, time of day, weather and graphics settings:

1. **Far** — trees at roughly 70-150 m, with enough of them in frame to judge canopy density across distance.
2. **Medium A** — trees at roughly 25-40 m, pose A.
3. **Medium B** — trees at roughly 25-40 m, a clearly different pose and heading from A.
4. **Close** — a single tree at roughly 8-15 m, filling most of the frame.

This change is visual, so capture the full set **before and after** from byte-identical camera poses and settings, and present them as before/after pairs. At least one pose must include sky, a specular highlight and white bodywork in frame, since those are the pixels this change actually affects — if none of the four standard poses does, add a fifth capture that does rather than substituting it for one of the four.

Record for every capture: resolution, camera pose, city and seed, resolved `treeQuality`, AA mode, AO mode, colour-grading preset, **whether the LUT texture had resolved at capture time**, and any localStorage overrides in effect.

Acceptance requirements:

- Grading is demonstrably applied in display-referred space, with the reasoning and chosen approach stated.
- The `[0,1]` clamp is gone and no NaN, wrap or out-of-range artifact replaces it.
- Measured sRGB values for sun disc, bloom halo, specular highlights and white bodywork are reported before and after.
- All three LUT presets are verified, not just `vivid`.
- Every capture records whether the LUT had actually loaded.
- The summary states the measured effect on leaf pixels and does not claim foliage improvement.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_541_MATERIAL_opus_color_grading_lut_applied_in_scene_linear_space_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the before/after screenshot pairs, the chosen approach and why, the measured highlight-range recovery table, per-preset verification, and the measured leaf-pixel delta.
# Completion summary

## Chosen approach

Color grading is now folded into the final output transform: scene-linear HDR is tone-mapped first, converted to display-referred sRGB for the 3D LUT, converted back to display-linear, and then output-encoded. TAA, SMAA, and FXAA keep their existing positions before the display transform. This avoids re-authoring three shipped LUTs and removes the separate pre-tone-map color-grading pass and its obsolete shaders.

The LUT lookup clamps only the post-tone-map display coordinate and maps normalized cube values to texel centers with (value * (size - 1) + 0.5) / size. Negative values are guarded before transfer-function powers, and grading is bypassed whenever tone mapping is diagnostically disabled, the LUT is missing, the intensity is zero, or WebGL2 support is absent.

## Visual evidence

- [Single 4K side-by-side comparison sheet](../tests/artifacts/screens/color_grading/ai541/comparison_side_by_side.png)
- Far: [before](../tests/artifacts/screens/color_grading/ai541/before_01_far.png) / [after](../tests/artifacts/screens/color_grading/ai541/after_01_far.png)
- Medium A: [before](../tests/artifacts/screens/color_grading/ai541/before_02_medium_a.png) / [after](../tests/artifacts/screens/color_grading/ai541/after_02_medium_a.png)
- Medium B: [before](../tests/artifacts/screens/color_grading/ai541/before_03_medium_b.png) / [after](../tests/artifacts/screens/color_grading/ai541/after_03_medium_b.png)
- Close: [before](../tests/artifacts/screens/color_grading/ai541/before_04_close.png) / [after](../tests/artifacts/screens/color_grading/ai541/after_04_close.png)
- Supplemental sky/sun/specular/bodywork: [before](../tests/artifacts/screens/color_grading/ai541/before_05_highlights.png) / [after](../tests/artifacts/screens/color_grading/ai541/after_05_highlights.png)
- [Measurement report](../tests/artifacts/screens/color_grading/ai541/comparison_report.json)
- [Standard before metadata](../tests/artifacts/screens/color_grading/ai541/before_report.json) / [standard after metadata](../tests/artifacts/screens/color_grading/ai541/after_report.json)
- [Supplemental before metadata](../tests/artifacts/screens/color_grading/ai541/before_highlight_report.json) / [supplemental after metadata](../tests/artifacts/screens/color_grading/ai541/after_highlight_report.json)

The four standard before frames were captured from the committed implementation before production edits. The supplemental before frame replays that exact committed GLSL and pass position at runtime so the corrected sun-inclusive camera can be compared byte-for-byte with the new path. Its metadata records committed-pre-ai541-runtime-replay. Every accepted capture records vivid 0.65, supported true, hasLut true, status ready, 3840x2160, bigcity2 seed x, desktop tree quality, 8x MSAA, GTAO exclude, and the relevant camera and localStorage state.

## Measured sRGB output

| Sample | Before RGB / luma | After RGB / luma |
|---|---:|---:|
| Sun disc | 178.08, 189.69, 196.62 / 187.72 | 184.23, 193.00, 200.85 / 191.70 |
| Bloom halo | 117.39, 156.60, 189.60 / 150.65 | 116.95, 157.04, 187.45 / 150.71 |
| Specular highlights | 189.64, 194.18, 195.41 / 193.30 | 204.00, 206.96, 208.44 / 206.44 |
| White bodywork / neutral bright pixels | 186.76, 192.43, 194.75 / 191.40 | 194.81, 194.83, 188.74 / 194.39 |

Measurements reuse the coordinates selected from each before image. The report records each selection rule and sample count.

## Verification

- Node regression: 5/5 passed, covering transform order, no HDR-buffer clamp, finite edge addressing, final-pass topology, all cube domains, and WebGL1 gating.
- Browser regression: cool, vivid, and warm each reached ready with an active LUT and applicationSpace display-referred-srgb-after-tone-mapping; off remained disabled with no LUT. No page, console, or shader errors were emitted.
- All cool, vivid, and warm cube payloads have complete normalized domains and their expected 16 or 33 cube dimensions.
- The disabled path does not sample the LUT; unsupported WebGL1 renderers remain gated by capabilities.isWebGL2.

## Leaf result

The same 64,348 green-dominant close-view leaf pixels moved from RGB 104.36, 117.61, 48.25 (luma 109.79) to RGB 106.69, 118.26, 47.96 (luma 110.73). This is a small global-grade shift, not a foliage-density improvement.
