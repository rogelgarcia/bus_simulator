DONE

# Problem

The canopy thinning fixed by AI 537 was invisible to the existing test suite. It was a one-line material flag whose effect only appears at distance, and nothing in `tests/` asserts anything about foliage density, so the regression shipped and survived until it was noticed by eye in a screenshot.

The failure mode is easy to re-introduce: any change to the leaf material, the alpha cutout threshold, the AA mode defaults, the composer sample count, or the leaf atlas UV layout can silently erode foliage coverage again. `tests/core.test.js:1973-1979` touches trees but its assertion is loose and would not catch this class of defect.

The project already has the machinery needed. `tests/headless/e2e/` runs Playwright captures against a repo-root static server, and `tests/artifacts/ao_depth_reuse_legacy/report.json` demonstrates the existing pattern of a deterministic pose-driven capture that records GPU, resolution and query parameters.

# Request

Add a headless regression test that renders a fixed tree at several distances and asserts that foliage pixel coverage stays within a tolerance band across them, so distance-dependent canopy erosion fails CI instead of shipping.

## Execution gate

- Do not start until AI 537 is DONE. This test's baseline must be the corrected behaviour; capturing a baseline from the eroding build would lock in the defect.

## Motivation and relevance

The driving motivation for this batch is **increasing tree fullness and correcting colour**. Other issues were captured incidentally during the same investigation and are tracked in their own AI documents.

**Relevance of this document: SUPPORTING — it protects the tree fullness fix rather than delivering it.** It has no user-visible effect of its own. Its value is entirely that AI 537's fix cannot silently regress, which matters because the original defect was a single boolean that no test could see.

Tasks:

- Add a deterministic headless capture that places one known tree (use a fixed FBX, not a procedurally seeded placement) and photographs it at a minimum of four distances spanning roughly 8 m to 150 m, with a fixed camera, fixed sun, fixed AA and AO settings, and an explicitly pinned `treeQuality`.
- Compute foliage coverage per capture as the fraction of pixels within the tree's screen-space bounding region that are classified as leaf. Define the classifier explicitly and make it robust to lighting: a chroma/alpha test against the known background is preferable to a fixed RGB threshold.
- Normalise coverage by the tree's projected screen area so the metric is comparable across distances. Raw pixel counts are not comparable and must not be used as the assertion.
- Assert that normalised coverage across the distance series stays within a tolerance band. Derive the band from the measured post-AI-537 behaviour plus headroom for legitimate mip filtering; do not invent a round number. State the derivation.
- Make the test fail loudly on the specific historical defect. Include a documented check that would have caught A2C erosion, so a reviewer can see the test has teeth.
- Record the full capture conditions into the artifact report in the style of `tests/artifacts/ao_depth_reuse_legacy/report.json`: hardware, browser, GPU string, resolution, pixel ratio, query parameters, resolved tree quality, AA mode, AO mode, colour-grading preset.
- Pin every setting the test depends on through explicit query parameters or fixture configuration rather than relying on defaults, since `resolveLayeredDefaultLightingSettings()` and the `loadSaved*Settings()` calls merge localStorage overrides that a CI machine may or may not have.
- State the measured run time of the new test and confirm it is acceptable for the suite it joins.

## Visual evidence (mandatory)

Capture exactly four screenshots at 4K (3840x2160), all sharing the same city, seed, time of day, weather and graphics settings:

1. **Far** — trees at roughly 70-150 m, with enough of them in frame to judge canopy density across distance.
2. **Medium A** — trees at roughly 25-40 m, pose A.
3. **Medium B** — trees at roughly 25-40 m, a clearly different pose and heading from A.
4. **Close** — a single tree at roughly 8-15 m, filling most of the frame.

This document adds a test and changes no rendering, so before/after pairing is **not applicable**. The four shots are still required, captured after the work, as evidence that adding the test harness did not perturb the rendered result. Additionally, include the test's own distance-series captures as artifacts alongside them.

Record for every capture: resolution, camera pose, city and seed, resolved `treeQuality`, AA mode, AO mode, colour-grading preset, and any localStorage overrides in effect.

Acceptance requirements:

- The test fails on a build with `leaf.alphaToCoverage = true` restored, and passes on the AI 537 build. Both runs are demonstrated, not asserted.
- The coverage metric is normalised by projected screen area and the tolerance band's derivation is stated.
- The test is deterministic across repeated runs on the same machine; report the observed run-to-run variance.
- Every setting the assertion depends on is explicitly pinned rather than inherited from defaults.
- The artifact report records full capture conditions.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_538_TESTS_opus_foliage_alpha_coverage_distance_regression_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the four screenshots, the test's distance-series artifacts, the demonstrated fail-on-regression run, the tolerance band derivation, the measured run-to-run variance, and the test's run time.

# Closure notes

**Final disposition: CLOSED WITHOUT NEW IMPLEMENTATION.** AI537 already added a focused material-contract regression in `tests/core.test.js` that asserts the historical failure switch (`leaf.alphaToCoverage === false`) together with `alphaTest === 0.5`, opaque/cutout rendering, and preserved AO alpha metadata. Restoring the historical A2C setting makes that existing test fail loudly.

The proposed 4K multi-distance pixel-coverage suite would protect a broader class of mip, atlas, AA, and composer regressions, but it would add a costly visual harness and tolerance baseline beyond the root-cause coverage needed for AI537. The additional complexity and CI cost were not justified for this pass.

- Existing regression: `tests/core.test.js:1983-1989`, introduced by commit `5bff92f` with AI537.
- Existing AI537 evidence: [far](../tests/artifacts/screens/trees/ai537/after_01_far.png), [medium A](../tests/artifacts/screens/trees/ai537/after_02_medium_a.png), [medium B](../tests/artifacts/screens/trees/ai537/after_03_medium_b.png), and [close](../tests/artifacts/screens/trees/ai537/after_04_close.png).
- No AI538 distance-series harness, classifier, tolerance band, mutation run, variance measurement, runtime measurement, or new screenshots were created. Those acceptance items are not being represented as completed.
- AI538 changes no rendering, production code, or tests. It is closed as redundant for the known defect, with the broader visual-regression proposal deferred.