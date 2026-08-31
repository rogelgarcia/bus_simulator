# DONE

# Problem

Every leaf plate in the tree catalog maps the **full** 0-1 UV range of `T_Leaf_Realistic9.TGA`. This was verified across the whole catalog: all 3,565 desktop plates and all 2,820 mobile plates have UV bounds of approximately `u[0.0158, 0.9995] v[0.0005, 0.9999]`, with zero exceptions.

The atlas is 2048x2048 and is not a grid of leaf variants — it is a single photographed branchlet spray containing 82 individual leaves. Each plate is a card averaging 2.52 m across (mean card area 6.37 m2, measured), so the entire 2048px texture is squeezed onto a card that covers only tens of screen pixels at ordinary viewing distance.

The consequence is that the sampled mip level is always high. A plate covering P screen pixels samples mip `log2(2048 / P)`, so:

| plate on screen | sampled mip | approx distance |
|---|---|---|
| 256 px | 3 | ~9 m |
| 128 px | 4 | ~18 m |
| 64 px | 5 | ~37 m |
| 32 px | 6 | ~74 m |

Distances assume 1080p and a 60 degree vertical FOV. At mip 5 a leaf that occupies 80 texels in the atlas is down to about 2.5 texels — individual leaves stop being resolvable and the canopy degrades into mush regardless of how the alpha test is configured.

AI 537 removes the alpha-to-coverage erosion that was destroying coverage on top of this, but it does not change the sampled mip. This document addresses the underlying cause: the atlas is being under-sampled by design because every card wants the whole thing.

Note that fixing this also reduces the severity of any future alpha-cutout filtering issue, since the ramp width that caused the AI 537 defect scales with minification.

# Request

Re-author the leaf plate UVs so each card samples a sub-region of the leaf atlas rather than the full 0-1 range, bringing the typical sampled mip down from 4-6 toward 0-2.

## Execution gate

- Do not start until AI 537 is DONE, and its before/after screenshots are available. This change must be evaluated against the corrected coverage behaviour, not against the eroding build, or its benefit cannot be separated from AI 537's.

## Motivation and relevance

The driving motivation for this batch is **increasing tree fullness and correcting colour**. Other issues were captured incidentally during the same investigation and are tracked in their own AI documents.

**Relevance of this document: PRIMARY — tree fullness and sharpness at distance.** It is the deeper structural fix behind AI 537's symptomatic one. It is also the largest and riskiest piece of work in the batch, because it requires modifying or re-authoring asset UVs rather than changing a runtime flag. Treat AI 537 as the thing that must ship; treat this as the thing that makes the asset correct.

Tasks:

- Establish the design first and record it before touching geometry. The atlas is one spray of 82 leaves, not a grid, so sub-region UVs require deciding how to partition it — for example splitting the spray into N plausible sub-clusters, each a usable standalone card. State the partition and why it reads correctly as foliage.
- Decide and justify where the work happens. Options include retargeting UVs offline in Blender and re-exporting the FBX set, remapping UVs at load time in `TreeGenerator.js`, or authoring a derived atlas. Weigh asset-licensing constraints: the tree pack is third-party licensed content, so prefer a derived/generated artifact over editing the vendor FBX in place, and record which you chose.
- Preserve visual variety. If all plates on a tree end up sampling the same sub-region, the canopy will read as repetitive in a way the current full-atlas mapping does not. Distribute sub-regions across plates and state the distribution strategy.
- Measure the achieved mip level at the far, medium and close poses before and after, using the same instrumentation AI 537 established. The headline claim of this document is a mip reduction, so it must be measured rather than asserted.
- Verify leaf world-scale stays plausible. Sub-region UVs change how many leaves appear per card; if a card still spans 2.52 m but now shows 10 leaves instead of 82, individual leaves become unrealistically large. Either adjust card size, choose sub-regions accordingly, or state explicitly why the resulting leaf scale is acceptable.
- Report the effect on texture bandwidth and memory residency, since lowering the sampled mip means higher mip levels are actually resident and sampled.
- Apply to both the Desktop and Mobile sets, or state explicitly why one is deferred.
- If the work proves disproportionate to the benefit once AI 537 has landed, say so with the measurements that support that conclusion and recommend deferral rather than half-implementing it.

## Visual evidence (mandatory)

Capture exactly four screenshots at 4K (3840x2160), all sharing the same city, seed, time of day, weather and graphics settings:

1. **Far** — trees at roughly 70-150 m, with enough of them in frame to judge canopy density across distance.
2. **Medium A** — trees at roughly 25-40 m, pose A.
3. **Medium B** — trees at roughly 25-40 m, a clearly different pose and heading from A.
4. **Close** — a single tree at roughly 8-15 m, filling most of the frame.

This change is visual, so capture the full set **before and after** from byte-identical camera poses and settings, and present them as before/after pairs. The "before" here is the post-AI-537 build, not the original eroding build; state this explicitly so the two documents' gains are not conflated.

Record for every capture: resolution, camera pose, city and seed, resolved `treeQuality`, AA mode, AO mode, colour-grading preset, and any localStorage overrides in effect.

Acceptance requirements:

- Measured sampled mip at each of the four poses is reported before and after, and shows a real reduction.
- The medium and far screenshots show sharper, better-resolved leaves; the close screenshot shows no loss of detail or obvious repetition.
- Canopy variety is not visibly degraded — the sub-region distribution strategy is stated and its result is visible in the close and medium shots.
- Resulting leaf world-scale is plausible, or its deviation is explicitly justified.
- Texture memory and bandwidth impact is reported.
- The vendor FBX files are not modified in place unless that choice is explicitly justified against the pack's licensing status.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_539_MESHES_opus_leaf_atlas_subregion_uvs_to_lower_sampled_mip_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the four before/after screenshot pairs, the atlas partition design, the before and after mip measurements per pose, the sub-region distribution strategy, the memory and bandwidth deltas, and where the derived asset lives.

## Completion summary

### Result: measured deferral, no production asset change

The requested UV-only re-authoring was prototyped and rejected rather than shipped. The atlas is one continuous branch photograph, not a variant grid, and a smaller UV span can reduce the sampled mip only by enlarging the photographed leaves on an unchanged card. That violates the prompt's leaf-world-scale requirement. Shrinking or subdividing each card by the same factor restores leaf scale but also restores the original UV derivative and sampled mip exactly.

No vendor FBX, gameplay source, Desktop model, Mobile model, texture, or derived asset was modified. AI 537's corrected hard-cutout production result remains unchanged.

### Partition prototype and distribution

An artifact-only runtime prototype evaluated eight curated overlapping 0.25 by 0.25 atlas regions, distributed round-robin across foliage cards:

[0.25,0.66]-[0.50,0.91], [0.38,0.52]-[0.63,0.77], [0.50,0.45]-[0.75,0.70], [0.62,0.48]-[0.87,0.73], [0.09,0.32]-[0.34,0.57], [0.22,0.20]-[0.47,0.45], [0.48,0.18]-[0.73,0.43], and [0.68,0.08]-[0.93,0.33].

The regions were chosen around visible leaf groups to avoid the atlas's completely empty corner cells. They still cut through the continuous branch structure, and the round-robin distribution visibly repeats a small set of enlarged leaf groups. A non-overlapping grid is worse: measured 4 by 4 hard-alpha coverage ranges from 0.0% to 44.8%, with two entirely empty cells and several cells containing clipped leaves or branch fragments.

### Four-pose 4K evidence

The comparison sheet is [AI 539 side-by-side](../tests/artifacts/screens/trees/ai539/ai539_side_by_side.png). It contains the four required post-AI-537 production baselines beside the artifact-only prototype, using identical byte-for-byte camera poses and settings. Raw pairs:

| Pose | Distance | Production baseline | UV prototype |
|---|---:|---|---|
| Far | 110.678 m | [before](../tests/artifacts/screens/trees/ai539/before_01_far.png) | [prototype](../tests/artifacts/screens/trees/ai539/after_01_far.png) |
| Medium A | 32.009 m | [before](../tests/artifacts/screens/trees/ai539/before_02_medium_a.png) | [prototype](../tests/artifacts/screens/trees/ai539/after_02_medium_a.png) |
| Medium B | 34.001 m | [before](../tests/artifacts/screens/trees/ai539/before_03_medium_b.png) | [prototype](../tests/artifacts/screens/trees/ai539/after_03_medium_b.png) |
| Close | 11.232 m | [before](../tests/artifacts/screens/trees/ai539/before_04_close.png) | [prototype](../tests/artifacts/screens/trees/ai539/after_04_close.png) |

Common state: 3840 by 2160 viewport and drawing buffer at pixel ratio 1, bigcity2, seed x, desktop tree quality, 8-sample compositor MSAA, GTAO foliage exclusion at threshold 0.36, Vivid grading at intensity 0.65, FOV 55 degrees, default clear atmosphere, sun azimuth 45 degrees/elevation 35 degrees, and only bus_sim.tree_quality.v1=desktop in localStorage. Full metadata is in [before_report.json](../tests/artifacts/screens/trees/ai539/before_report.json) and [after_report.json](../tests/artifacts/screens/trees/ai539/after_report.json).

### Mip and scale measurements

The mip calculation uses the measured projected card footprint and actual UV span: max(log2(2048 * spanU / pixelsU), log2(2048 * spanV / pixelsV)). Each pose measured the same 464 visible foliage cards before and in the prototype.

| Pose | Baseline UV span | Baseline mip | Prototype UV span | Prototype mip | Delta |
|---|---:|---:|---:|---:|---:|
| Far | 0.9837 | 6.91 | 0.25 | 4.91 | -2.00 |
| Medium A | 0.9837 | 5.12 | 0.25 | 3.13 | -1.99 |
| Medium B | 0.9837 | 5.18 | 0.25 | 3.20 | -1.98 |
| Close | 0.9837 | 3.44 | 0.25 | 1.44 | -2.00 |

The two-level reduction costs a 4 times increase in linear leaf scale and 16 times increase in depicted leaf area on the unchanged approximately 2.52 m cards. Reaching mip 2 at the far pose would require an approximately 0.033 UV span, enlarging atlas content about 30 times linearly. Reaching mip 2 at Medium A would require an approximately 0.115 span, or about 8.7 times linear enlargement. Those are not plausible leaves.

If card geometry is reduced by the same factor s as its UV span to preserve leaf world scale, both the numerator and projected footprint in log2(textureSize * uvSpan / screenPixels) are multiplied by s; the ratio and mip do not change. A UV-only implementation therefore cannot satisfy both the requested mip reduction and plausible world scale.

### Visual, memory, and bandwidth conclusion

The prototype makes individual sampled regions sharper, but the medium and close views show oversized leaves, clipped branch groups, and obvious repetition. It fails the world-scale and variety acceptance requirements and was not promoted into production.

Because WebGL allocates the complete mip chain, the same 2048 by 2048 color, normal, and AO-alpha textures remain resident. The prototype adds 0 bytes of texture allocation, but sampling a 0.25 linear region two mips earlier expands the accessed mip footprint by roughly 16 times per card, reducing cache locality without changing the fixed shader texture-sample count. No derived atlas was created, so the production memory and bandwidth delta is zero.

Desktop and Mobile are both deferred. The visual prototype used the required desktop production capture path; the UV-derivative/world-scale contradiction is independent of model quality, so applying the same invalid remap to Mobile would not change the conclusion.
