# DONE

## Completion summary — 2026-09-03

AI 546 is complete through the prompt's explicit user-approved defer path. The
user accepted every visual-only deviation whose affected pixel area is below
0.5% as successful for this workflow. All 69 retained cases satisfy that
boundary: the maximum `pixelsOverFourBytePercent` is 0.486896749%, with zero
nonvisual failures. No visual result created a corrective action item.

This is a product/workflow acceptance decision, not a rewritten strict result.
The unchanged production report remains `failed` at 128/197, its thresholds and
raw metrics remain intact, and no exact-eight release certificate was issued or
claimed. Cache activation remains development-only and disabled by default;
Current mode remains the normal gameplay path and permanent fallback.

- The frozen AI 531 handoff was reauthenticated without changing its source,
  accepted-caster set, compiler/runtime configuration, packages, validation
  policy, or report data. No new lineage or remediation artifacts were needed.
- The authoritative package index is
  [`package_index.json`](../tests/artifacts/illumination_531/production_accepted_casters_v1_all8/package_index.json),
  and the resumable handoff is
  [`part_a_checkpoint.json`](../tests/artifacts/illumination_531/production_accepted_casters_v1_all8/part_a_checkpoint.json).
- The no-action-item record is
  [`part_a_failure_inventory.json`](../tests/artifacts/illumination_531/production_accepted_casters_v1_all8/part_a_failure_inventory.json).
  It records 69 visual-only cases, zero nonvisual failures, and no case at or
  above the approved 0.5% affected-area ceiling.
- The strict Lab report remains 8/8 at
  [`lab_validation_report.json`](../tests/artifacts/screens/illumination_531/lab_accepted_casters_v1_part_a/lab_validation_report.json).
  The complete strict production report remains 128/197 at
  [`production_validation_report.json`](../tests/artifacts/screens/illumination_531/production_accepted_casters_v1_part_a/production_validation_report.json).
- All 69 authenticated Current/cache pairs referenced by the inventory were
  already embedded during commentary/reasoning for human verification. The
  user subsequently reviewed representative and top-difference examples and
  approved the below-0.5% boundary. No Part B screenshots, case-specific
  investigations, generated-field corrections, or final-passing claims were
  created.
- Reauthentication produced these unchanged SHA-256 identities: package index
  `6a1d3db704e94ed6713eac3781ed9e6ada2c84bca2d231ffb08f1f682c5dceea`,
  checkpoint
  `6f45cb0ee278035c94480ef786066bb669cfa434ee943a63333ec34df4620b22`,
  failure inventory
  `95cf26af111e2ad294626ee19dd6e79e7dbc8fd0246cbc12f5c67074628f4858`,
  Lab report
  `2bfe524af04b330a529930b1e0c93429d7b4a9f69354737b7e225839d9f0bc02`,
  and production report
  `83cf37365774ddcc27785f1011807da175568b5a92c1e0f759c89e665b7524da`.
- Existing authenticated fallback, lifecycle, package, browser, and
  determinism-isolation evidence is reused because the frozen lineage was not
  modified. A new GPU/catalog cycle would duplicate the same accepted evidence
  and was intentionally not run on the contended shared machine.

Same-condition visual evidence uses the 197 paired 1280×720 views from the
frozen WebGL2/ANGLE production catalog on an RTX 3060:

| Metric | Current / oracle | Clean baked cache | AI 546 disposition |
|---|---:|---:|---|
| Catalog coverage | 197/197 authoritative views | 197/197 authenticated views | complete |
| Unchanged strict result | reference | 128/197 pass; 69/197 visual-only fail | retained honestly; no certificate |
| Cases below approved 0.5% affected-area ceiling | reference | 197/197; maximum 0.486896749% | user accepted |
| Maximum missing-occluder area | 0% self-difference | 0.030044856% | accepted visual residual |
| Maximum seam-error area | 0% self-difference | 0.167963379% | accepted visual residual |
| Maximum aligned RGB error | 0 B self-difference | 95 B | strict failure retained |

Same-condition workload evidence used one synchronized measured workload frame
per mode and case across those 197 paired views:

| Metric | Current | Baked cache | Change |
|---|---:|---:|---:|
| Catalog aggregate whole-frame calls | 361,283 | 306,107 | -55,176 (-15.27%) |
| Mean whole-frame calls per view | 1,834 | 1,554 | -280 |
| Catalog aggregate whole-frame triangles | 615,470,222 | 296,542,140 | -318,928,082 (-51.82%) |
| Mean whole-frame triangles per view | 3,124,214 | 1,505,290 | -1,618,924 |
| Static-city shadow calls per view | 70–332 | 0 | -100% |
| Static-city shadow triangles per view | 236,069–1,909,836 | 0 | -100% |
| Active-profile logical cache residency | 0 B | 226,700,892 B or 528,968,748 B CPU plus the same declared GPU bytes | added cache cost |
| Eight-profile package bytes | 0 B | 3,023,801,792 B | added offline payload |
| Frame time/FPS, CPU/GPU time, physical GPU memory, load/decode/upload, bake duration, warm-up, and variance | not measured | not measured | concurrent processes and shared GPU contention |

The workload counters are deterministic, but timing-derived measurements are
not promoted from the declared contended environment. The catalog defines the
route/poses, sun profiles, render settings, and sample count; no projections
replace the unavailable timing evidence.

# Problem

AI 531 Part A produces a deterministic, authenticated, development-ready
static-sun-depth pipeline and a complete strict validation report, but permits a
small bounded set of honestly reported visual-only failures. Fixed world-cache
and camera-relative live shadow lattices, Blender-versus-WebGL rasterization,
PCF footprint phase, alpha-cutout filtering, and thin facade silhouettes can
leave difficult residuals that should not force repeated manual analysis of the
entire production pipeline. Earlier AI 531 experiments used screenshot-driven
residual depth-field corrections; those artifacts are diagnostic-only and are
not eligible for production promotion in this prompt.

# Request

Complete Part B of the static-sun-depth work by consuming AI 531 Part A's frozen
packages, checkpoint, reports, and deterministic inventory. Run the final clean
validation and present Current-versus-baked screenshots in chat for human
verification only. Do not use screenshots, image metrics, or human-visible
differences to create refinement work. Correct only canonical source defects or
generic compiler/runtime defects already proven by independent non-screenshot
tests. Close the unchanged strict visual gates or explicitly document a
user-approved defer/rejection without misrepresenting it as release
certification. Keep gameplay activation disabled by default.

## Execution gate

- Do not start until
  `AI_DONE_531_ATMOSPHERE_static_sun_depth_deterministic_pipeline_DONE.md`
  exists and its completion summary links a complete eight-profile package
  index, strict 8-case Lab report, complete 197-case production report, and
  machine-readable failure inventory.
- Treat Part A's exact source, caster inventory, compiler/toolchain identities,
  packages, validation settings, and baseline report as frozen authority. Any
  source or policy change must create a new authenticated lineage and explain
  why the Part A evidence is no longer applicable.
- Keep the current shadow engine as the correctness oracle and permanent
  fallback. Do not enable the baked path by default or expose it to players.

Tasks:
- Reauthenticate the Part A checkpoint, package index, packages, Lab report,
  production report, failure inventory, and every referenced image/evidence
  file before using them.
- Record visual failures in deterministic report order for reproducible human
  presentation. They are not a prioritized correction queue and must not create
  automated or manual action items.
- Use native live/cache occupancy, first-hit depth, PCF taps, receiver identity,
  caster membership, and tile/seam coordinates only in independently scheduled
  nonvisual conformance tests. Do not start those tests because a screenshot or
  image-comparison metric failed, and do not use screenshot pixels as inputs.
- Prohibit generated-field correction of every kind, even when a source texel
  and depth are authenticated. Do not add exact-texel overrides, occupancy/depth
  patch lists, case/profile exceptions, camera-dependent settings, or manually
  edited generated fields. Screen color alone is never source evidence, and no
  threshold or caster may be altered merely to satisfy a screenshot.
- Retain diagnostic localization tools for explicit non-screenshot engineering
  investigations only. The standard Part B screenshot workflow must not invoke
  them. Their outputs remain non-promotable and must not emit or modify any
  production field, descriptor, package, package index, or release certificate.
- Correct a failure only when an independent non-screenshot test has already
  proven a defect in canonical map geometry/material data or in generic
  compiler/runtime configuration or algorithms applied uniformly to their
  declared domain. Record that independent causal evidence and the new identity,
  then cleanly rebuild every affected profile and its dependent
  descriptors/packages. Preserve immutable before/after roots and update the
  package index atomically only after reauthentication and repeat verification.
- Treat a correct source visibility result with a bounded live-versus-baked
  raster/filter difference as a reported strict failure, not a request to modify
  depth texels or create work. Keep the result development-only unless an
  independently justified generic change closes the unchanged gate or the user
  explicitly accepts a waiver.
- Enforce Part A's production provenance/taint policy. Production lineage may
  depend only on authenticated map/caster/material source, sun profile, and
  versioned generic toolchain/configuration inputs; it must reject validation
  case IDs, camera poses, screenshot pixels/colors, reports, observation files,
  residual patches, and manual edits to generated output.
- Re-run the determinism isolation test for every new lineage: with identical
  legitimate inputs, production artifact bytes must remain identical when all
  validation evidence is removed or independently changed.
- Do not create focused screenshot investigations for ambiguous residuals.
  Generate only the standard Current-versus-clean-bake pairs required for human
  verification, store them under `tests/artifacts/screens/illumination_546/`,
  and take no follow-up action from their content. Generated artifacts remain
  gitignored and must not be committed.
- After each canonical-source or generic-pipeline change, run bounded
  affected-profile checks first. Run the complete Lab and 197-case production
  matrices only when the bounded evidence passes, avoiding redundant
  full-catalog cycles.
- Preserve the existing strict validator thresholds and raw/alignment-aware
  metrics. Do not filter browser errors, suppress failed cases, alter masks, or
  weaken missing-occluder/seam gates to obtain a pass.
- Require the final strict Lab report to pass 8/8 and the final production report
  to pass 197/197 with zero missing occluders and all lifecycle, package,
  workload, boundary, dynamic-receiver, browser-diagnostic, and image
  authentication gates valid.
- Produce the exact-eight static-sun release certificate only from those final
  passing reports and packages. If the user explicitly accepts a remaining
  visual limitation instead, document the waiver and keep the result
  development-only; do not issue or claim the strict certificate.
- Reverify that Current mode remains unchanged without any payload and that all
  unavailable, stale, corrupt, incompatible, partial, cancelled, and teardown
  paths atomically retain or restore Current.
- Record timing-derived metrics as `not measured` while the machine/GPU remains
  under declared contention. Calls, triangles, hashes, correctness, and visual
  results may still be retained independently.

## Chat screenshot evidence policy

- For every visual test case that fails, retain the authenticated Part A or
  current-run oracle image and clean baked candidate image, then embed exactly
  one labeled before/after pair in a visible commentary/reasoning update
  immediately after the authoritative result is available. Never defer this
  pair to the final response. Use absolute local image paths so the images
  render in Codex; do not provide only filenames or links.
- Label the authoritative Current/oracle capture **Before** and the failing
  baked capture **After — failed**. Include the case ID and failed gates beside
  the pair so the human can verify it without the agent interpreting the image
  into a correction.
- Screenshot generation and chat embedding end the screenshot workflow. Do not
  inspect the images for corrective decisions, run localization or calibration,
  create an action item, modify source/configuration, or schedule a case-specific
  rerun because of their content or image-comparison metrics.
- Do not generate intermediate manual or automated refinement screenshots. If a
  separately justified canonical-source or generic-pipeline change later causes
  the case to pass, embed exactly one final pair during validation: the same
  authoritative **Before** image and the **After — final passing result**. The
  independent change must already have non-screenshot justification. Do not
  claim a final-passing pair for a waived or still-failing case.
- Consume and extend Part A's per-case chat-evidence state so restarts do not
  duplicate a pair. Record canonical image paths and delivery states as
  presentation metadata only; they must not feed triage, production provenance,
  or action-item generation.
- If a failing test is genuinely nonvisual and has no renderable before/after
  output, state that explicitly in a commentary/reasoning update and report it
  normally; never fabricate a screenshot or use an unrelated capture.
- The final response may summarize case IDs, metrics, and artifact paths, but it
  must not postpone, duplicate, or substitute for the required in-progress
  human-verification pair posts.
- Store all generated Part B captures under a case-specific child of
  `tests/artifacts/screens/illumination_546/`. They remain gitignored and must
  not be staged or committed.

Acceptance requirements:
- Every Part A deferred case has its strict result recorded and its required
  screenshot pair embedded for human verification. No visual-only result creates
  a corrective action item, and no case is silently omitted.
- Every production artifact passes the provenance/taint gate and determinism
  isolation test. No selected field, descriptor, package, package index, or
  release certificate derives from screenshot-driven residual calibration or
  generated-output editing.
- Completion follows one of the two paths permitted by this prompt: either the
  final certified path passes strict Lab 8/8 and production 197/197 without
  threshold or evidence-policy weakening, or an explicit user-approved defer
  records every remaining visual failure while keeping the result
  development-only. This completion uses the defer path.
- If issued, the exact-eight package index and release certificate authenticate
  the same authoritative source, profile set, artifacts, and final reports. No
  certificate is issued for the defer path used here.
- Current mode and all fallback/failure paths remain complete and independent of
  Blender or baked assets.
- Gameplay activation remains disabled pending AI 535; AI 546 contains no
  bus-specific integration or player-facing Options work.

## Accepted Part A handoff — 2026-09-03

AI 531's deterministic finishing driver completed the exact-eight package
index, determinism isolation, Lab 8/8, the full authenticated 197-case report,
and a no-action-item failure inventory. On 2026-09-03 the user reviewed
representative Current/cache evidence and approved the clean 128/197 result,
with 69 visual-only failures and zero nonvisual failures, as the Part A
development-readiness boundary. The strict report remains failed and no release
certificate exists. All 69 Current/cache pairs were already presented in chat
and checkpointed as delivered. The frozen handoff artifacts are:

- `tests/artifacts/illumination_531/production_accepted_casters_v1_all8/package_index.json`;
- `tests/artifacts/illumination_531/production_accepted_casters_v1_all8/part_a_checkpoint.json`;
- `tests/artifacts/illumination_531/production_accepted_casters_v1_all8/part_a_failure_inventory.json`;
- `tests/artifacts/screens/illumination_531/lab_accepted_casters_v1_part_a/lab_validation_report.json`;
- `tests/artifacts/screens/illumination_531/production_accepted_casters_v1_part_a/production_validation_report.json`.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to
  `prompts/AI_DONE_546_ATMOSPHERE_static_sun_depth_visual_parity_refinement_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the frozen Part A handoff, failure
  inventory, every independently justified canonical-source or generic-pipeline
  remediation lineage, final packages/index, strict Lab and production reports,
  release certificate or explicit defer decision, human-verification captures,
  tests, and fallback verification. Confirm that each visual failure pair was
  posted during commentary/reasoning and did not create an action item. If an
  independently justified change resolved a case, confirm its final passing pair
  was posted there before the final response.
- Include same-condition before/after visual and workload tables. Include frame
  time/FPS, calls/triangles, CPU/GPU time, memory, payload/load/upload, bake
  duration, hardware, browser/renderer, resolution/settings, routes/poses,
  warm-up, sample count, statistic, and variance. Mark unavailable timing
  metrics as `not measured` with the contention reason; never substitute
  projections.
