# Grass Lab Validation and Approval V2

## Authority and current status

This specification is the normative approval contract for the corrected V2
Grass Lab assembled by AI 358 through AI 361. AI 362 owns the scoped visual,
functional, motion, and determinism review defined here. AI 537 separately owns
whole-scene performance optimization and performance approval. AI 363 is the
only stage authorized to connect the approved system to gameplay.

The existence of this specification is not evidence that an AI 362 review has
run or passed. Approval exists only when fresh evidence satisfies every scoped
gate below and `specs/grass/GRASS_LAB_APPROVAL_AI362.json` is emitted with the
required approved state. Missing evidence, missing measurements, or a failed
non-performance gate leaves that record pending.

`specs/grass/GRASS_LAB_VALIDATION_AND_APPROVAL_V1.md` and
`specs/grass/GRASS_LAB_APPROVAL_AI357.json` remain historical V1 evidence. They
cannot satisfy this contract and cannot authorize gameplay.

## Current AI 362 result

The completed 2026-08-31 review emits the scoped approved record at
`specs/grass/GRASS_LAB_APPROVAL_AI362.json`; its ignored raw manifest remains
at `tests/artifacts/screens/grass/ai362/capture_manifest.json`. This measured
result does not replace the normative contract above. The approval adapter
reports `ready: true` with zero gaps, and the record reports
`status: "approved"`, `gameplayTouched: false`, and
`authorization.gameplayAuthorized: false`.

- All `114/114` lossless PNGs were reverified on disk at an exact native
  `3840 x 2160` drawing buffer and against their recorded SHA-256 hashes.
- All `29/29` regressions and `36/36` immutable AI 361 baseline pairs pass.
- The default structural row records `113,677` combined grass triangles and
  `5` logical grass draws, with zero geometry beyond cutoff and zero recurring
  stationary uploads.
- The five canonical `1920 x 1080` timing rows and separate native-4K
  informational row all contain complete 120-frame warm-up and 120 measured
  samples. Chromium used SwiftShader without
  `EXT_disjoint_timer_query_webgl2`, so GPU timing is explicitly unsupported
  and the real failed hardware-adapter verdicts are retained for AI 537.

| Timing row | CPU mean | Whole-frame mean | FPS | Recorded verdict |
|---|---:|---:|---:|---|
| `quality_low` | `0.048333 ms` | `537.953 ms` | `1.859` | failed: hardware adapter |
| `quality_default` | `0.375000 ms` | `734.297 ms` | `1.362` | failed: hardware adapter |
| `quality_high` | `0.595000 ms` | `797.142 ms` | `1.254` | failed: hardware adapter |
| `default_worst_view` | `0.254167 ms` | `563.470 ms` | `1.775` | failed: hardware adapter |
| `default_transition_overlap` | `0.323333 ms` | `785.195 ms` | `1.274` | failed: hardware adapter |

The separate native-4K row records a `0.654167 ms` CPU mean,
`2451.933 ms` whole-frame mean, and `0.408 FPS`; it is informational and
also retains its failed CPU-mean and hardware-adapter checks. Performance is
`deferred_to_ai537`. AI 537 is the next required stage, while AI 363 remains
blocked on its digest-linked performance approval.

## Normative inputs

The V2 review consumes these frozen contracts without substituting a tuned or
validation-only variant:

- `specs/grass/LOW_CUT_GRASS_MATERIAL_V2.md`;
- `specs/grass/GRASS_COVERAGE_AND_SIDEWALK_EDGE_V2.md`;
- `specs/grass/NEAR_GRASS_CARPET_PATCH_V2.md`;
- `specs/grass/GRASS_AUTO_LOD_AND_COHESIVE_HANDOFF_V2.md`;
- `specs/grass/LOCALIZED_GRASS_ACCENTS_V2.md`;
- `src/app/grass/GrassLabValidationContract.js`, validation contract version
  `2` and Grass Lab snapshot contract version `10`.

The five implementation specifications continue to own their detailed material,
footprint, geometry, LOD, and accent semantics. This specification owns the
assembled-system approval decision. The executable evaluator and this document
must agree; a mismatch is a contract defect and must be reconciled before an
approval record is issued.

## Approval scope

The only AI 362 approval scope is
`visual_functional_motion_determinism`. An approved scoped result certifies all
of the following:

- the frozen AI 358 through AI 361 identities and numeric invariants remain
  intact;
- the material families form one cohesive, physically lit maintained-grass
  appearance without bright points, card bands, or self-lit tiers;
- exact coverage, boundary, root, envelope, tier, and fallback behavior passes;
- all required camera, lighting, motion, determinism, regression, capture, and
  traceability evidence is complete;
- every non-timing structural gate passes;
- the five canonical performance rows are measured and recorded without
  changing their result; and
- gameplay remains untouched and unauthorized.

The scoped approval does not certify the CPU or GPU timing budgets. Those
verdicts are explicitly deferred to AI 537 and remain visible as measured
results rather than being relabeled, omitted, or treated as unavailable.

The default quality preset with automatic LOD is the primary approval path.
Manual `near`, `billboard`, `middle`, `texture`, accent isolation, and other
forced views are diagnostic evidence only and must not define a second runtime
policy.

## Frozen AI 358 appearance contract

All tiers must retain material ID `pbr.grass_low_cut_maintained_v2`, asset ID
`grass.natural.maintained.material.v2`, and the global catalog, texture-loading,
composition, calibration, and physical-scale path.

The far surface keeps independent base-color, OpenGL-normal, roughness, AO,
height, and coverage maps. The `MID_CLUSTER` and `ACCENT_CLUMP` families remain
physically distinct atlases; one family may not substitute for the other. Each
card family keeps its separate PBR maps and its separate grayscale coverage map:

- middle: `midClusterColor`, `midClusterCoverage`, `midClusterNormal`,
  `midClusterRoughness`, and `midClusterAo`;
- accent: `accentClumpColor`, `accentClumpCoverage`, `accentClumpNormal`,
  `accentClumpRoughness`, and `accentClumpAo`.

Both card materials retain the `4 x 2` eight-variant layout, green-channel
`alphaMap`, `0.35` alpha cutoff, alpha-to-coverage when MSAA is available,
16-pixel zero-coverage cell gutters, cell-local UV remapping, opaque PBR
channels, trilinear generated mips through required level `7`, depth writing,
`vertexColors: false`, `world_up_blend: 1.0`, and emissive intensity `0`.
They remain alpha-tested, not transparently sorted, and use no local loader,
URL convention, palette, or calibration override.

The opaque near fibers retain the shared `nearBladeAppearance`: base color
`#494E30`, tip color `#616743`, roughness `0.94`, metalness `0`, black emissive
color, and emissive intensity `0`. They use one opaque, depth-writing material
path with physical mesh normals. Their occupancy may not be derived from alpha
or material color.

## Frozen AI 359 footprint and physical-boundary contract

The canonical coverage identity is `bus-simulator.grass-coverage` version `2`.
The visible sidewalk and grass exclusion must derive from the exact
RoadEngine-rendered sidewalk outer loops and source identities. A reconstructed
rectangle, route envelope, texture mask, or hand-authored approximation is not
an approval source. Exact polygons take unconditional precedence over legacy
compatibility rectangles.

The assembled snapshot must prove all of these invariants:

- `roadEngineSourceLoopIdentity` exactly equals the non-empty
  `sourceLoopIdentity`;
- `boundarySignature` is non-empty, stable, shared by coverage, near, field,
  and accent consumers, and invalidates dependent placement when it changes;
- signed distance is `positive_grass_negative_exclusion` and evidence includes
  occupied, excluded, and root-eligible samples;
- sidewalk-to-grass substrate reveal is `0.080 m` by default and every measured
  sidewalk reveal bound lies in the accepted `0.060-0.100 m` range;
- tree substrate reveal is reported separately and has positive, ordered
  minimum and maximum values;
- the structural base is in `0.025-0.030 m`, with `0.0275 m` canonical;
- visible near-fiber tips span exactly `0.040-0.075 m` above terrain rather than
  treating the structural base as a canopy ceiling;
- grass-onset antialias width is no greater than `0.015 m`;
- root clearance is exactly `0.003 m`;
- straight, curved, diagonal, inside-corner, outside-corner, irregular, and
  tree-base topology is represented;
- hard-exclusion intrusions, grass-onset intrusions, and ineligible cut-edge
  roots are all zero;
- the continuous substrate remains beneath the lawn, exposed strip, and tree
  holes;
- the cap is opaque, neither transparent nor alpha-tested, and the cap plus
  physical edge uses at most two logical draws, excluding the substrate; and
- the canonical reference boundary contributes exactly `95,219` triangles to
  the relevant fixture accounting.

The boundary may not be moved, softened into a color fade, hidden, or simplified
to obtain an evidence or performance result.

## Frozen AI 360 closest-mesh contract

The closest representation remains `bus-simulator.near-grass-carpet` version
`2`, reported by the evaluator as `near-grass-carpet-v2`. It must retain:

- deterministic world-aligned `1 m x 1 m` ownership cells;
- exactly `64` root bins per eligible square metre, one represented root per
  eligible bin, and a nominal `0.125 m x 0.125 m` bin footprint;
- exactly `3` deterministic one-triangle fibers per represented root;
- exact AI 359 polygon sampling and final per-root postchecks;
- canonical base and blade-tip elevations and the AI 358 near material above;
- one shared micro-clump geometry and material, bounded world-chunk batching,
  frustum culling, disabled grass shadows, and zero recurring stationary
  uploads; and
- deterministic placement and cache invalidation keyed by the AI 359 boundary
  signature and every placement-relevant setting.

Approval diagnostics must record non-empty boundary and placement signatures,
`coverageMode` equal to `exact_polygon` or `exact_polygon_v2`, candidate,
eligible, represented, and unrepresented eligible bins, eligible and
represented area, rejection counts by kind, and exact postcheck failures. The
fixture must contain a positive eligible-bin count, represented bins must equal
eligible bins, represented area must equal eligible area within `1e-6`, and
`unrepresentedEligibleBins` and `exactPostcheckFailures` must both be zero.

## Frozen AI 361 hierarchy and accent contract

The primary evaluator remains `bus-simulator.grass-auto-lod` version `2` with
the exact force-value set `auto`, `near`, `billboard`, `middle`, and `texture`.
Its weight vector contains exactly `near`, `billboard`, `middle`, and `texture`,
with each value in `[0, 1]` and the total equal to `1` within `1e-6`.

The canonical effective thresholds are `3 m`, `8 m`, and `25 m`; transition
width is `2 m`; hysteresis is `0.75 m`; grazing and top-down anchors are
`12 deg` and `70 deg`; and their distance scales are `0.8` and `1.2`. Evidence
must contain exactly one in-progress sample for each named transition
`near_to_billboard`, `billboard_to_middle`, and `middle_to_texture`, with a
valid weight vector and progress strictly between `0` and `1`.

The field renderer remains `bus-simulator.grass-cohesive-field-renderer`
version `2`. Near, billboard, and middle use one shared world-aligned one-metre
exact-coverage layout and complementary stable samples. Billboard and middle
diagnostics must each prove positive eligible coverage, represented units equal
eligible units, equal represented and eligible areas within `1e-6`, and zero
unrepresented eligible units and exact envelope failures. Field-wide exact
root and envelope failures are zero.

Every named handoff must report shared samples, complementary masks,
non-negative outgoing, incoming, transition, and overlap counts, and zero
unrepresented eligible units, both-hidden units, and non-adjacent overlap
units. Billboard units use one card, middle units use two cards, and both use
one shared AI 358 `MID_CLUSTER` material path.

Localized accents remain `bus-simulator.grass-localized-accents` version `2`.
They retain four clumps per canonical tree and two crossed cards per clump, use
the separate AI 358 `ACCENT_CLUMP` path, derive geometry weight as
`1 - textureWeight`, and use the same exact AI 359 definition and boundary
signature. Candidate, eligible, represented, and unrepresented roots, areas,
rejections, postchecks, and envelope failures are recorded. Represented roots
must equal a positive eligible-root count, and unrepresented roots, postcheck
failures, and envelope failures must be zero.

Accent substrate ownership is exactly `coverage_tree_hole`. The historical worn
batch must remain absent: worn patches, triangles, logical draws, and material
paths are all zero. Low quality disables near, billboard, middle, and accent
geometry while retaining the corrected far texture, continuous substrate,
opaque cap, and physical boundary.

## Native-4K capture and baseline contract

Every delivered visual-approval frame must be a lossless PNG captured from an
actual `3840 x 2160` drawing buffer at pixel ratio `1`. Its decoded dimensions
must be verified as `3840 x 2160`. Browser-scaled images, screenshots of a
lower-resolution canvas, JPEGs, and upscaled images fail the gate.

Clean, UI-free visual frames and diagnostic-overlay frames are separate evidence
roles. Diagnostic text must not obscure the clean image used for visual review.
Each designated before/after comparison must have identical camera position,
target, and height; lighting; exposure; quality; fixture; and review state.
A clean/overlay pair is not a before/after pair. Required review-only cameras
with no true AI 361 counterpart remain after evidence and must not be relabeled
as baseline pairs.

The before side may use the immutable final-code AI 361 native-4K manifest and
PNG only when every designated AI 362 comparison maps to one exact AI 361
recipe. The review must verify both files, decoded dimensions, SHA-256 hashes, camera
position and target, lighting, exposure, and quality state. A missing file,
missing hash, changed state, or misaligned recipe fails the baseline gate.

Every captured image record must include its workspace-relative path, before or
after role, camera ID, position, target, height and pose, lighting ID, exposure,
quality preset, evidence role, active tiers, AutoLOD weights and transition
progress, coverage and placement signatures, eligible, represented, overlap,
and unrepresented counts, instances, per-tier and combined triangles, per-tier
and combined grass logical draws, total renderer draws, material/asset contract
signatures, image hash, drawing-buffer dimensions, pixel ratio, and decoded
dimension-verification result. State metadata must be complete and derived from
the captured frame, not reconstructed afterward.

Generated images, manifests, traces, logs, and comparisons belong only under
`tests/artifacts/screens/grass/ai362/`. That directory is ignored evidence and
must not be staged. Representative final frames from multiple angles must be
shown inline in the AI 362 completion handoff; a list of paths alone is not a
visual handoff.

## Required camera, lighting, boundary, fallback, and motion evidence

All of these camera IDs are mandatory:

- `height_030`, `height_050`, `height_100`, `height_150`, `height_200`,
  `height_300`, and `height_500`;
- `near_grazing`, `near_forward`, and `near_oblique`;
- `gameplay_bus`;
- `close_billboard_handoff`, `billboard_middle_handoff`, and
  `middle_texture_handoff`;
- `top_down` and `far_texture`.

All of these lighting IDs are mandatory: `daylight`, `overcast`, `golden`, and
`night`. Each lighting state must include aligned material, boundary, and
handoff evidence. Lighting and exposure remain fixed within every comparison.

All of these motion-path IDs are mandatory: `stationary`, `forward`, `reverse`,
`strafe`, and `flyover`. Forward and reverse paths cross all three handoffs;
strafe crosses ownership-cell boundaries; flyover crosses close, billboard,
middle, and texture states. Runs use fixed progress points and reset hysteresis
before repeated or reversed traversal. They record deterministic equality,
temporal flicker, alpha disappearance, popping, both-hidden and overlap units,
geometry beyond cutoff, changed batches, and buffer updates. Stationary evidence
must prove stable tier state and zero recurring uploads.

The following evidence IDs are all required:

- capture and comparison: `clean_ui_free_visuals`,
  `diagnostic_overlay_frames`, `matched_before_after_pairs`, and
  `complete_state_metadata`;
- boundary and substrate: `straight_sidewalk`, `curved_sidewalk`,
  `diagonal_cut`, `inside_corner`, `outside_corner`, `irregular_cut`,
  `low_side_profile`, `exposed_substrate`, `tree_base`, and `tree_substrate`;
- fallback: `texture_only_fallback` and `geometry_disabled_fallback`;
- four-light matrix: `daylight_material`, `daylight_boundary`,
  `daylight_handoff`, `overcast_material`, `overcast_boundary`,
  `overcast_handoff`, `golden_material`, `golden_boundary`,
  `golden_handoff`, `night_material`, `night_boundary`, and `night_handoff`;
- motion: `stationary_all_handoffs`, `forward_all_handoffs`,
  `reverse_all_handoffs`, `strafe_all_handoffs`, and
  `flyover_all_handoffs`.

The straight, curved, diagonal, inside-corner, outside-corner, irregular-cut,
low-side, exposed-substrate, tree-base, and tree-substrate images must make the
sidewalk, exposed substrate, opaque structural base, grass onset, and hard tree
hole visually distinguishable. Texture-only and geometry-disabled views must
show a cohesive low-quality far surface, continuous substrate, and physical
boundary without field or accent geometry.

## Required regression verdicts

Every following regression ID must be present with value `true`:

- `isolated_bright_points`;
- `tier_color_luminance_continuity`;
- `zero_coverage_mip_stability`;
- `complete_near_coverage_bins`;
- `complete_field_coverage_units`;
- `sidewalk_root_exclusion`;
- `boundary_conformance`;
- `card_envelope_conformance`;
- `no_square_substrate_fades`;
- `no_worn_discs`;
- `antialias_width`;
- `height_distribution`;
- `both_hidden_handoff_gaps`;
- `nonadjacent_tier_overlap`;
- `deterministic_reload`;
- `temporal_flicker`;
- `alpha_disappearance`;
- `handoff_popping`;
- `material_cohesion`;
- `physical_boundary_readability`;
- `signed_distance_orientation`;
- `source_loop_identity`;
- `low_quality_texture_fallback`;
- `geometry_disabled_fallback`;
- `stationary_stability`;
- `forward_handoff_continuity`;
- `reverse_handoff_continuity`;
- `strafe_handoff_continuity`;
- `flyover_handoff_continuity`.

Equivalent seed, fixture, quality, camera, coverage, and configuration inputs
must reproduce boundary, placement, and material signatures; bin, unit, root,
instance, triangle, and draw counts; tier transforms and masks; rejection and
postcheck diagnostics; and fixed-progress motion state after reset and reload.

## Mandatory non-timing structural gates

The structural gates are part of AI 362's scoped approval and are not deferred
to AI 537. They must pass in every applicable required fixture:

- `trianglesByTier` has exactly the keys `boundary`, `near`, `billboard`,
  `middle`, and `accent`, each with a non-negative integer;
- `drawCallsByTier` has exactly those same keys and non-negative integer values;
- each per-tier sum exactly equals its recorded combined total;
- boundary triangles equal the canonical `95,219` reference in the relevant
  fixture;
- combined visible grass triangles are no greater than `200,000`;
- combined visible grass logical draws are no greater than `12`;
- boundary logical draws are no greater than `2`;
- AutoLOD, field, and combined diagnostics each report zero geometry beyond the
  effective cutoff; and
- combined stationary buffer updates are zero, near and accent report their
  stationary-upload-zero flags, and the settled field reports zero last buffer
  updates.

Approximately `5-6` typical grass logical draws and approximately `50,000`
field-geometry triangles are reporting targets, not substitutes for the exact
combined ceilings. Instance counts and total renderer calls are context and do
not replace per-tier triangle or logical-draw accounting.

## Recorded performance rows and AI 537 deferral

AI 362 must remeasure the unchanged `1920 x 1080` runtime conditions and record
exactly one row for each canonical sample ID:

| Sample ID | Required state |
|---|---|
| `quality_low` | low-quality canonical camera and scene |
| `quality_default` | default-quality canonical camera and scene |
| `quality_high` | high-quality canonical camera and scene |
| `default_worst_view` | default quality at the top-down/worst-view fixture |
| `default_transition_overlap` | default quality at close/billboard overlap |

Each row must contain a `performanceGate` with schema
`grass-lab-performance-gate-v1`, statistic `arithmetic_mean`, a measurements
object, and the actual boolean `pass` result. The run records the hardware,
operating system, browser, WebGL backend and renderer, hardware-acceleration
state, MSAA, resolution, pixel ratio, scene, camera, quality, lighting, warm-up,
sample count, timer-query sequence, disjoint state, raw samples, and aggregate
mean, median, p95, and maximum. It also records frame time and FPS, relevant
memory, renderer calls, per-tier and combined triangles and draws, cutoff state,
and buffer updates.

The unchanged timing budgets and minimum measurement conditions are:

- average GrassEngine CPU time no greater than `0.60 ms` from at least `120`
  CPU samples;
- measured whole-frame GPU timer-query mean no greater than `1.50 ms` when the
  reference context supports it, using at least `30` unique valid queries with
  an active timer and zero disjoint events;
- at least `120` frame and stationary-upload samples;
- at least `120` warm-up frames and at least `1,000 ms` warm-up duration; and
- at least `30` stable zero-upload warm-up frames.

Unsupported GPU timing must be explicitly recorded with support status,
backend, and a concrete `not measured` reason; a CPU proxy, stale last query,
projection, or omitted row is forbidden. Native-4K timing is separate
informational hardware evidence and may not replace a canonical `1920 x 1080`
row.

AI 362 records every timing result exactly as measured, including a failed
result. CPU and GPU timing pass/fail values do not participate in the scoped
AI 362 approval decision. Performance measurements must nevertheless be
complete, and every non-timing structural gate above must pass. Optimization,
the final timing verdict, and the performance approval belong only to AI 537.

## V2 approval record

AI 362 writes the tracked record only at
`specs/grass/GRASS_LAB_APPROVAL_AI362.json` through
`createGrassLabV2ApprovalRecord()`. The following fixed fields and values are
mandatory:

| JSON path | Required value |
|---|---|
| `schema` | `"grass-lab-approval-v2"` |
| `validationContractVersion` | `2` |
| `grassLabContractVersion` | `10` |
| `approvalScope` | `"visual_functional_motion_determinism"` |
| `qualityPreset` | `"default"` |
| `performanceStatus` | `"deferred_to_ai537"` |
| `performanceOwnership.status` | `"deferred_to_ai537"` |
| `performanceOwnership.ownerPrompt` | `"AI537"` |
| `performancePassRequired` | `false` |
| `performance.status` | `"deferred_to_ai537"` |
| `performance.ownership.status` | `"deferred_to_ai537"` |
| `performance.ownership.ownerPrompt` | `"AI537"` |
| `performance.passRequired` | `false` |
| `gameplayTouched` | `false` |
| `authorization.status` | `"blocked_pending_ai537"` |
| `authorization.gameplayAuthorized` | `false` |
| `authorization.requiredPerformancePrompt` | `"AI537"` |
| `authorization.requiredPerformanceRecord` | `"specs/grass/GRASS_LAB_PERFORMANCE_APPROVAL_AI537.json"` |

Top-level `performanceMeasurements` and `performance.measurements` must contain
the same five canonical rows and actual verdicts. Diagnostics must carry the
final AI 358 material identities, AI 359 coverage data, AI 360 bin/density/fiber
data, AI 361 AutoLOD, field, handoff, and accent data, worn-cost zeros, exact
signatures and count/area/rejection diagnostics, per-tier structural totals,
cutoff state, and upload state. Capture evidence must carry the verified native
4K and traceability fields defined above.

`reviewCoverage` must contain all required camera, lighting, motion-path, and
evidence IDs with empty missing lists. `regressions` must contain every required
true verdict, `missingRegressions` and `missingPerformanceSamples` must be empty,
and `visualFunctionalEvaluation.failedChecks` must be empty.

The record may set `status: "approved"` and `approved: true` only when
`visualFunctionalEvaluation.pass` is true and every scoped check in this
specification passes. Otherwise it must set `status: "pending"` and
`approved: false`. Neither state may set gameplay authorization to true.

## Digest-linked performance approval and gameplay authorization

AI 537 may begin only after AI 362 is complete and the current AI 362 record has
all required fields above with scoped `status: "approved"`. AI 537 must preserve
that approved visual, functional, motion, determinism, geometry, coverage,
material, camera, scene, resolution, and MSAA baseline while satisfying the
unchanged performance budgets.

AI 537 writes `specs/grass/GRASS_LAB_PERFORMANCE_APPROVAL_AI537.json` with:

- `schema: "grass-lab-performance-approval-v1"`;
- `approvalScope: "performance"`;
- `sourceVisualApproval.path` equal to
  `specs/grass/GRASS_LAB_APPROVAL_AI362.json`;
- `sourceVisualApproval.sha256` equal to the SHA-256 of the exact UTF-8 file
  bytes of the current AI 362 approval record;
- exactly one result for each of the five canonical sample IDs; and
- `status: "approved"` only when all five unchanged performance gates and all
  required visual-equivalence and regression gates pass.

Any byte change to the AI 362 approval record invalidates the recorded digest
and makes the AI 537 performance approval stale until AI 537 is rerun against
the current record. A stale, missing, pending, differently scoped, or
digest-mismatched record is not authorization.

AI 363 may begin gameplay changes only when AI 362 and AI 537 are both complete
and both current records satisfy their exact schemas, scopes, and approved
statuses; the AI 362 record retains both deferred-ownership objects and all
no-gameplay fields; and the AI 537 digest matches the exact current AI 362 file
bytes. The two records form one authorization gate. The historical AI 357
record, the AI 362 record alone, or a performance record linked to an older
visual record cannot open that gate.

If AI 537 changes an approved visual or functional contract, the AI 362 record
is invalidated and AI 362 must be rerun before performance can be approved. If
AI 363 discovers an offline visual, functional, motion, determinism, contract,
or performance defect, integration stops and the defect returns to its owning
offline stage. AI 363 may adapt approved runtime inputs but must not create a
gameplay-only renderer, material family, footprint, or LOD policy.
