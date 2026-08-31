# Problem

The corrected V2 grass hierarchy is functionally deterministic and visually
cohesive, but its inherited whole-scene Grass Lab GPU cost exceeds the existing
`1.50 ms` `1920x1080` gate on the RTX 3060 reference. AI 361 field geometry is
not the dominant cost: profiling with the near, billboard, and middle field
removed still measured the inherited scene near `2.67 ms`. Keeping this
whole-scene optimization inside the hierarchy or visual-approval prompts would
mix ownership and prevent otherwise complete architecture and evidence work
from closing.

# Request

After AI 362 completes the V2 visual, functional, motion, and determinism
approval, optimize the complete offline Grass Lab rendering path until every
required performance fixture satisfies the unchanged runtime budgets. Preserve
the AI 358-362 appearance, geometry, coverage, hierarchy, diagnostics, and
native-4K approval result. Create a separate performance approval that is a
mandatory dependency for gameplay AI 363.

This is step 14 of the offline-first grass sequence and the final offline
performance gate. AI 363 becomes step 15.

Tasks:
- Require completed AI 358 through AI 362 and
  `specs/grass/GRASS_LAB_APPROVAL_AI362.json` with
  `schema: "grass-lab-approval-v2"`,
  `status: "approved"`,
  `approvalScope: "visual_functional_motion_determinism"`, and
  `performance.status: "deferred_to_ai537"`,
  `performanceOwnership: { "status": "deferred_to_ai537", "ownerPrompt": "AI537" }`,
  `performance.ownership: { "status": "deferred_to_ai537", "ownerPrompt": "AI537" }`,
  `gameplayTouched: false`, and
  `authorization.gameplayAuthorized: false` before changing the renderer.
  The scoped AI 362 status is the frozen visual/functional baseline, not a
  performance pass or gameplay authorization.
- Treat the AI 361 RTX 3060 measurements as the initial failure baseline, then
  recapture a same-condition baseline before the first optimization. Use real
  WebGL2 disjoint timer queries rather than a CPU proxy or the last query.
- Optimize the complete Grass Lab frame, including shared scene ordering,
  overdraw, material submissions, coverage-cap/substrate interaction, lighting,
  and renderer scheduling where evidence identifies cost. Do not assume the
  AI 361 field is the dominant workload.
- Preserve AI 358 material identities and separated PBR/coverage channels, AI
  359 exact polygon footprint and physical boundary, AI 360 root density and
  fiber geometry, and AI 361 field keys, card geometry, handoffs, accents,
  culling, cutoff, signatures, and diagnostics. Do not hide work by disabling a
  required representation, reducing native resolution, changing the camera,
  changing the scene, lowering MSAA, dropping a required material channel, or
  weakening visual quality.
- Keep the existing `1920x1080` performance budgets unchanged: average
  GrassEngine CPU `<=0.60 ms`, measured whole-frame GPU timer-query mean
  `<=1.50 ms` when supported on the reference hardware, approximately `5-6`
  typical grass logical draws with `12` hard ceiling, `<=200,000` combined
  visible grass triangles, zero geometry beyond cutoff, and zero recurring
  stationary uploads.
- Measure the five canonical states independently after warm-up: low, default,
  high, default top-down/worst view, and default close/billboard overlap. Use at
  least `120` warm-up frames and `1 s`, `120` CPU/frame samples, at least `30`
  unique valid GPU query samples, zero disjoint events, and report mean,
  median, p95, sample count, frame time/FPS, memory, renderer calls, triangles,
  and grass/boundary costs.
- Compare every optimization in a fresh-context alternating A/B where practical.
  Reject changes whose apparent gain is within run variance or that improve
  only some rows while regressing another required row.
- Re-run the AI 362 functional, exact-coverage, motion, cutoff, and native-4K
  visual gates after optimization. The optimized result must retain the same
  contract/signature inputs and remain visually equivalent within the approved
  pixel and human-review tolerances.
- Capture and retain multiple native-4K angles for the final visual parity
  handoff, including at minimum a low grazing view, forward view, three-quarter
  oblique view, top-down view, close/billboard handoff, and physical-cut/tree
  view under representative lighting.
- In the completion response, display representative final screenshots inline
  in the conversation from multiple angles. File links may accompany them but
  must not be the only visual handoff.
- Create
  `specs/grass/GRASS_LAB_GPU_PERFORMANCE_OPTIMIZATION_AI537.md` and
  `specs/grass/GRASS_LAB_PERFORMANCE_APPROVAL_AI537.json`. The JSON must carry
  `schema: "grass-lab-performance-approval-v1"`,
  `approvalScope: "performance"`,
  `sourceVisualApproval.path: "specs/grass/GRASS_LAB_APPROVAL_AI362.json"`,
  the SHA-256 of the exact UTF-8 file bytes of the current AI 362 record in
  `sourceVisualApproval.sha256`,
  hardware/browser/graphics identity, exact benchmark conditions, raw aggregate
  statistics, per-state costs, visual-equivalence verdicts, source signatures,
  exactly one row for each canonical sample ID (`quality_low`,
  `quality_default`, `quality_high`, `default_worst_view`, and
  `default_transition_overlap`), and `status: "approved"` only when every
  performance and regression gate passes. The performance approval is stale
  and invalid whenever its recorded AI 362 digest does not match the current
  AI 362 approval record.
- Add focused performance-regression coverage without weakening AI 358-362
  tests or replacing measured hardware evidence with projections.
- Keep gameplay untouched.

Acceptance outcomes:
- All five canonical `1920x1080` fixtures pass the unchanged CPU/GPU, draw,
  triangle, cutoff, and stationary-upload gates on the reference hardware.
- The optimized result remains visually equivalent to the scoped AI
  362-approved V2 Grass Lab at every required camera, lighting state, boundary,
  and handoff.
- AI 358-361 material, footprint, near-carpet, AutoLOD, field-layout, accent,
  batching, and diagnostic contracts remain unchanged.
- No optimization relies on reduced resolution, disabled MSAA, missing PBR
  channels, hidden geometry, changed cameras, stale query samples, or a
  validation-only shortcut.
- Multiple native-4K final angles are retained and representative images are
  shown inline in the completion handoff.
- `GRASS_LAB_PERFORMANCE_APPROVAL_AI537.json` reports no missing benchmark or
  regression item and has `status: "approved"`.
- Gameplay remains untouched.

## Sequence dependency

- Requires completed AI 358 through AI 362 and the visual/functional V2
  approval in `specs/grass/GRASS_LAB_APPROVAL_AI362.json`, with
  `schema: "grass-lab-approval-v2"`,
  `status: "approved"`,
  `approvalScope: "visual_functional_motion_determinism"`, and
  `performance.status: "deferred_to_ai537"`,
  `performanceOwnership: { "status": "deferred_to_ai537", "ownerPrompt": "AI537" }`,
  `performance.ownership: { "status": "deferred_to_ai537", "ownerPrompt": "AI537" }`,
  `gameplayTouched: false`, and
  `authorization.gameplayAuthorized: false`.
- Owns the performance requirement explicitly deferred from AI 361 and AI 362;
  the failed AI 361 measurements remain baseline evidence rather than an
  authorization to weaken the budget.
- AI 363 may begin only after this prompt is DONE,
  `specs/grass/GRASS_LAB_APPROVAL_AI362.json` retains its scoped approved and
  deferred-performance fields above, and
  `specs/grass/GRASS_LAB_PERFORMANCE_APPROVAL_AI537.json` reports
  `schema: "grass-lab-performance-approval-v1"`,
  `approvalScope: "performance"`, `status: "approved"`, and a
  `sourceVisualApproval.sha256` matching the SHA-256 of the exact UTF-8 file
  bytes of the current AI 362 approval JSON.

## Dynamic AI coordination

- Keep
  `prompts/AI_grass_349_REFACTOR_global_texture_catalog_loader_and_calibration_pipeline.md`
  active and in place.
- Add and maintain a scoped AI 537 checklist item there for any material or
  loader-path changes. Mark only that item complete after implementation,
  verification, and performance approval.
- If optimization changes an approved visual/functional contract, invalidate
  the AI 362 approval, return the defect to its owner, and rerun AI 362 before
  completing this prompt.

## Required completion summary

Before marking this prompt DONE, add a `## Completion evidence` section with:

- A same-condition before/after table for all five canonical fixtures,
  including CPU/GPU mean, median, p95, frame time/FPS, sample counts, memory,
  renderer calls, logical draws, per-system/combined triangles, cutoff, and
  uploads.
- Hardware, operating system, browser, WebGL backend, GPU renderer, MSAA,
  resolution, pixel ratio, scene/camera, quality, lighting, warm-up, sample
  count, statistic, and timer-query/disjoint state for every measurement set.
- The measured delta and pass/fail verdict for every row. Projections and
  single-frame values do not count as completion evidence.
- A multi-angle native-4K screenshot manifest under the prompt-specific
  ignored evidence directory, with exact state metadata and visual-equivalence
  verdicts against AI 362.
- A concise list of rejected experiments and why each was rejected.

## Generated evidence location

- Save generated screenshots, comparison images, manifests, traces, logs, and
  reports under `tests/artifacts/screens/grass/ai537/`.
- This directory is gitignored. Do not stage generated evidence or write it to
  `screens/`, beside source files, or into tracked baselines unless explicitly
  requested.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to
  `prompts/AI_DONE_grass_537_REFACTOR_grass_lab_gpu_budget_optimization_and_approval_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add one high-level summary line per completed change.
- Include the complete same-condition performance table and multi-angle
  native-4K manifest required above.
