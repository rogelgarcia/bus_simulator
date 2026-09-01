DONE

> **Human visual validation: REJECTED (2026-08-31).** The user rejected the complete offline-first grass solution spanning AI 350–362 and AI 537 after reviewing the final renders. This prompt is historical implementation evidence only: its DONE state does not approve the visual result, authorize gameplay integration, or define an acceptable baseline for future grass work. Any replacement must start from a new visual direction and receive explicit human approval.

# Problem

The V1 automatic LOD reduces a continuous turf surface to sparse crossed cards and isolated localized accents. Middle-distance grass therefore appears as individual highlighted pixels or tufts, and representation handoffs reveal rings, gaps, or a color change instead of simplifying one cohesive carpet.

# Request

Build the remaining cohesive offline hierarchy in the dedicated Grass Lab: close mesh, dense billboard coverage, cohesive middle patches, then texture-only turf. Reconcile localized tree accents with that hierarchy while preserving their deterministic placement inputs. This prompt owns tier selection and handoffs, not the underlying boundary or asset family.

This is step 12 of the offline-first grass sequence.

Tasks:
- Consume AI 358's physical asset/material family and shared zero-emissive `nearBladeAppearance`, AI 359's exact polygon coverage/root-eligibility sampler, and AI 360's cohesive near carpet without forking them.
- Treat AI 360's finalized near contract as immutable input: deterministic `1 m` ownership cells, `64` root bins per eligible square metre, exactly `3` fibers per represented root, and final per-root AI 359 exact-polygon postchecks. Preserve `coverageMode: exact_polygon`, `boundarySignature`, `placementSignature`, `candidateBins`, `eligibleBins`, `representedBins`, `unrepresentedEligibleBins`, `eligibleAreaSquareMeters`, `representedAreaSquareMeters`, `rejectedByKind`, and `exactPostcheckFailures` through the combined hierarchy diagnostics; default exact fixtures require `unrepresentedEligibleBins === 0` and `exactPostcheckFailures === 0`.
- Evolve `bus-simulator.grass-auto-lod` to version `2` and increment the Grass Lab snapshot contract to version `10`. Use force values `auto|near|billboard|middle|texture`, weights `{ near, billboard, middle, texture }`, transition progress, and canonical defaults `nearEndMeters: 3`, `billboardEndMeters: 8`, `middleEndMeters: 25`, `transitionWidthMeters: 2`, and `hysteresisMeters: 0.75`. Retain the `12/70 deg` view-angle anchors and `0.8/1.2` grazing/top-down distance scales.
- Implement the canonical representation order `close mesh -> dense billboard coverage -> cohesive middle patches -> far texture` at effective `0-3 m`, `3-8 m`, `8-25 m`, and texture-only beyond `25 m`; adjust these starting values only with documented visual and performance evidence.
- Ensure every eligible area in each active tier is represented until its handoff. Do not use one visible card every few metres, sparse whole-cell lotteries, or isolated tufts as the primary field representation.
- Build one deterministic world-aligned `1 m` AI 359 exact-coverage field-unit layout shared by billboard and middle tiers. Retain partially excluded units when a canonical sample is root-eligible, postcheck every root and transformed card envelope, and require `unrepresentedEligibleUnits`, `exactPostcheckFailures`, and `exactEnvelopeFailures` to remain zero in exact fixtures.
- Make billboard and middle representations cover an area collectively: one low `1.15 x 0.055 m` card per eligible billboard unit and two deterministic crossed cards per eligible middle unit. Their silhouettes, scale, orientation variation, and density must read as a low carpet rather than separate upright objects.
- Preserve the selected profile's blade-length and directional irregularity across simplified tiers. Longer grass is allowed, but it must remain cohesive and must not turn into isolated tall cards or highlighted tufts.
- Match every tier and localized accent to AI 358's far-surface appearance under daylight, overcast, golden-hour, and night lighting, with zero emissive contribution. Billboard and middle batches share AI 358's V2 `MID_CLUSTER` material; accent clumps use its physically separate V2 `ACCENT_CLUMP` material. Preserve the split coverage `alphaMap`, `0.35` cutoff, atlas UV/mip policy, `world_up_blend: 1.0`, opaque PBR channels, and global `PbrTextureLoaderService` ownership.
- Use AI 359's root eligibility at sufficient granularity that no tier crosses the physical grass cut and no whole-cell exclusion produces a visible moat.
- Preserve AI 359's signed-distance orientation, root clearance, source/onset identities, boundary signature, tree holes, opaque cap, and shared-substrate ownership. Rebuild affected tier placement when that signature changes; do not fall back to rectangle approximations or alpha-derived occupancy.
- Implement stable spatial handoffs with overlap and hysteresis. The outgoing and incoming tiers must use the same world-unit key and handoff sample with complementary thresholds; independent tier hashes that can make both tiers absent are forbidden. Report overlap and unrepresented units, and remove representations coherently so transitions leave no isolated remnants, empty rings, or grid patterns.
- Keep automatic distance and view-angle evaluation canonical. Manual tier forcing remains diagnostic and must never create geometry beyond the effective cutoff.
- Preserve AI 356's deterministic city-shaped tree and feature placement inputs, but render each eligible V2 accent root as a two-card low clump using AI 358's `ACCENT_CLUMP` material. Consume AI 359's exact root/envelope eligibility and real substrate hole, report `substrateOwnership: coverage_tree_hole`, and emit zero worn patches, triangles, draws, or materials. Accent visibility follows `1 - textureWeight` and the final middle-to-texture mask/hysteresis rather than disappearing at the close-tier boundary.
- Evolve the historical cluster renderer into exactly two global field batches, billboard and middle, sharing one layout/material; keep one global accent batch and no worn batch. Keep shadows disabled, retain valid bounds and frustum culling, and perform zero recurring stationary uploads.
- Tune default quality toward `5-6` typical grass logical draws with a hard ceiling of `12` and approximately `50,000` visible field-hierarchy triangles where practical. Enforce the V2 hard ceiling of `200,000` as a combined visible-grass total across the AI 359 cap/edge boundary, AI 360 near carpet, billboard, middle, and localized-accent geometry; the recorded `95,219`-triangle AI 359 reference boundary must be included rather than hidden behind the field-only target.
- Add diagnostics for AutoLOD schema/version, weights, active tier, transition state/progress, effective distance/cutoff, shared handoff samples, field `boundarySignature`/`placementSignature`, `candidateUnits`, `eligibleUnits`, `representedUnits`, `unrepresentedEligibleUnits`, areas, `rejectedByKind`, exact root/envelope failures, and per-tier occupancy, instances, triangles, draws, transition/overlap units, batches, culling, and buffer updates. Keep the finalized AI 360 diagnostics named above visible and report boundary, near, billboard, middle, accent, and combined triangle/draw totals separately.
- Add deterministic forward, reverse, strafe, flyover, grazing, top-down, tree, physical-cut, cutoff, and reload regressions for both still and moving handoffs.
- Add deterministic evidence roles `auto`, `texture_only`, `close`, `billboard`, `middle`, and `accent`; three handoff cameras with repeatable pre/center/post offsets; fixed-progress `forward`, `reverse`, `strafe`, and `flyover` seeking; and an explicit hysteresis reset for repeated routes.
- Capture UI-free native `3840x2160` stills and lossless transition frames required by the V2 specs: identical texture/auto pairs at all three handoffs; tree, far, grazing, top-down, bus, physical-cut, and cutoff views; the four-light texture/close/billboard/middle/accent matrix; forward/reverse pre/center/post handoff frames; three strafe frames; and six fixed-progress flyover frames.
- Keep AI 358 asset rebaking, AI 359 boundary/substrate construction, AI 360 near-patch architecture, final whole-system approval, and gameplay unchanged.

Acceptance outcomes:
- The default field reads as one cohesive carpet from the camera through the far texture; it never looks like a flat surface sprinkled with bright objects.
- No eligible near, billboard, or middle occupancy bin is unintentionally empty because of sparse random tier placement.
- Billboard and middle tiers share the same exact-coverage one-metre unit keys, report zero unrepresented eligible units and zero exact root/envelope failures, and use complementary handoff masks with no both-hidden gap.
- The near tier still reports `64` root bins per eligible square metre, `3` fibers per represented root, `coverageMode: exact_polygon`, matching AI 359/AI 360 boundary signatures, `unrepresentedEligibleBins === 0`, and `exactPostcheckFailures === 0` while using AI 358's shared material response.
- Tier identity is not apparent from color or luminance alone under any required lighting preset.
- Moving forward, backward, sideways, and through grazing views reveals no obvious ring, pop, halo, checkerboard, or isolated remnant at any handoff.
- Localized accents remain bounded to explicit features and no longer use an opaque substrate disc over grass.
- Localized accents use two-card V2 `ACCENT_CLUMP` geometry, remain coherent through close/billboard/middle states, share the final texture handoff, and report zero worn-substrate geometry or material cost.
- Sidewalk and tree roots are rejected through the same V2 polygon query, while the AI 359 cap/edge remains a separate maximum-two-draw boundary subsystem.
- No grass geometry crosses a hard exclusion or exists beyond the effective cutoff.
- Default views remain near `5-6` typical grass draws, never exceed `12`, and never exceed the V2 hard ceiling of `200,000` combined visible grass triangles including the AI 359 boundary and every field/accent tier.
- Low quality remains a coherent corrected texture, substrate, and physical-boundary fallback with field geometry disabled.
- Every required PNG is native `3840x2160`, UI-free, and accompanied by repeatable state metadata.
- Gameplay remains untouched.

## Sequence dependency

- Requires completed AI 358, AI 359, and AI 360, including `specs/grass/LOW_CUT_GRASS_MATERIAL_V2.md`, `specs/grass/GRASS_COVERAGE_AND_SIDEWALK_EDGE_V2.md`, and the finalized `specs/grass/NEAR_GRASS_CARPET_PATCH_V2.md` contract with `64` root bins per eligible square metre, `3` fibers per represented root, exact AI 359 coverage diagnostics, and shared AI 358 material ownership.
- Implements the normative `specs/grass/GRASS_AUTO_LOD_AND_COHESIVE_HANDOFF_V2.md` and `specs/grass/LOCALIZED_GRASS_ACCENTS_V2.md` contracts. Their presence does not mark this prompt complete; runtime, regression, cost, and native-4K evidence gates still apply.
- Supplies the complete corrective lab runtime to AI 362's visual/functional
  approval and AI 537's whole-scene performance optimization. AI 363 consumes
  both approvals.
- The V1 AI 355 handoff remains historical and is not the downstream approval contract.

## Dynamic AI coordination

- `prompts/AI_grass_349_REFACTOR_global_texture_catalog_loader_and_calibration_pipeline.md` is a long-lived dynamic checklist. Leave the file active, in place, and under its current name.
- Before marking this prompt DONE, update its scoped AI 361 grass-sequence checklist item with the billboard, middle-patch, accent, loader/calibration, and consumer work completed here. Mark that item complete only after implementation and verification finish.
- Do not mark unrelated pending AI 349 follow-ups complete, and do not replace the global pipeline with a Grass Lab-local loader.
- If this prompt changes a contract, update `specs/grass/GRASS_OFFLINE_FIRST_AI_SEQUENCE.md` and every downstream grass prompt that consumes it.
- Leave completed AI 350 through AI 357 prompts in place as historical records; record corrections in V2 contracts and explicit supersession notes.

## Required completion summary

Before marking this prompt DONE, add a `## Completion evidence` section to this file containing:

- A before/after and per-tier cost table for every representative fixture and quality preset. Report AI 359 boundary, near, billboard, middle-patch, accent, and combined visible grass triangles; per-tier and total grass logical draw calls; total renderer draw calls; and measured CPU/GPU timing when available. Include AutoLOD/coverage/placement signatures, eligible/represented/unrepresented units and areas, overlap units, exact root/envelope failures, and stationary/moving buffer updates for every measured state.
- An explicit structural-cost delta and budget verdict for default, high,
  worst-view, and transition-overlap states. Report the measured CPU/GPU rows
  and their failed verdict unchanged as the baseline transferred to AI 537;
  do not relabel the GPU measurements as passing. Costs may not be replaced by
  patch/card/instance counts alone.
- For every comparison, state the hardware, resolution, graphics settings, grass density/coverage, workload and camera route, warm-up, sample count, and statistic. Include frame time/FPS and relevant memory alongside the required geometry, draw-call, and CPU/GPU measurements; mark unavailable metrics as `not measured` with a reason instead of using projections.
- A screenshot manifest with workspace-relative file paths under the prompt-specific ignored evidence directory, before/after role, camera position/target/height, pose, lighting, exposure, quality preset, active tiers, triangle count, and grass/total draw-call counts.
- Only UI-free lossless PNG screenshots captured from a real `3840x2160` drawing buffer at pixel ratio `1`. Do not use JPEG, browser-scaled screenshots, or upscaled lower-resolution captures.
- All close/billboard, billboard/middle, middle/texture, tree, far, grazing, top-down, bus-scale, and motion-transition comparisons required above. State any missing image or measurement explicitly; the prompt cannot be marked DONE while required evidence is missing.

## Completion evidence

### Implementation and verification

- Implemented AutoLOD schema version `2` and Grass Lab snapshot version `10`
  with canonical `3/8/25 m` near/billboard/middle/texture thresholds,
  complementary shared handoff samples and hysteresis, deterministic evidence
  forcing/seeking, and zero geometry beyond the effective cutoff.
- Implemented one deterministic world-aligned `1 m` exact-coverage field layout
  shared by one-card billboard and two-card middle tiers, rendered as exactly
  two global field batches through AI 358's shared
  `pbr.grass_low_cut_maintained_v2` `MID_CLUSTER` material. The final field
  placement signature is `cohesive-field-v2-227007d0`.
- Preserved AI 360's `64` roots per eligible square metre and `3` fibers per
  represented root through boundary signature
  `grass-coverage-v2-8dfb0734` and near placement signature
  `near-carpet-v2-381c4a48`. Final exact fixtures report zero unrepresented
  eligible bins/units, zero root postcheck failures, and zero card-envelope
  failures.
- Reconciled localized accents as one global two-card `ACCENT_CLUMP` batch with
  exact root/envelope eligibility, the final middle-to-texture mask, and zero
  worn-patch geometry, draw, or material cost.
- The bounded billboard-only `10 mm` base sink retained the mandated card
  dimensions, roots, shared zero-emissive material, triangles, and draws while
  reducing the affected native-crop silhouette area from `1.7164%` to
  `0.5114%` (`-70.2%`). Texture and middle experiment references remained
  byte-identical.
- Focused unit/contract verification passed `84/84`; the Grass Lab Playwright
  regression slice passed `5/5`. No source/test rerun was performed while
  writing this documentation; these are the final verified implementation
  results supplied with the manifest.

### Final-code native-4K gate

The final manifest is
`tests/artifacts/screens/grass/ai361/capture_manifest.json`, generated
`2026-08-31T04:11:20.412Z`. Its gated AFTER phase passes all `60/60` required
final-code captures: `33/33` static and `27/27` deterministic motion frames,
each a UI-free lossless `3840x2160` PNG from a `3840x2160` drawing buffer at
pixel ratio `1`, using material V2. All `60/60` files record a valid SHA-256 and
all `60/60` per-capture contract checks pass; there are no missing or unexpected
recipe IDs. The manifest has `52` distinct hashes overall because aligned
static/reference and mirrored route states intentionally repeat, while each
motion route is internally unique (`9/9` forward, `9/9` reverse, `3/3`
strafe, and `6/6` flyover). Handoff cameras, lighting, and exposure are aligned,
`visualFunctionalPass` is true, and the hierarchy gate passes with performance
explicitly non-required and owned by AI 537.

| Handoff pair | Darkened pixel fraction | Max raw/smoothed row fraction | Verdict |
|---|---:|---:|---|
| close -> billboard | `0` | `0.00058 / 0.00019` | pass |
| billboard -> middle | `0` | `0 / 0` | pass |
| middle -> texture | `0` | `0 / 0` | pass |

### Structural cost envelope

Across the `60` final 4K captures, AI 359 boundary geometry remains `95,219`
triangles and two logical draws. Field geometry ranges from `0` to `19,638`
triangles; the combined visible total ranges from `95,219` to `114,857`, below
the `200,000` ceiling. Per-tier maxima are near `10,368`, billboard `5,268`,
middle `12,284`, and accent `16` triangles. Grass logical draws range `0-5`,
combined grass-plus-boundary logical draws `2-7`, total renderer draws `12-18`,
and renderer triangles `104,229-123,879`. Geometry beyond cutoff, maximum
unrepresented eligible bins/units, exact root postcheck failures, and exact
envelope failures are all zero.

The frozen BEFORE phase is a representative `15`-frame baseline, not a complete
matrix. Its aligned low/default/high structural samples compare with the final
runtime as follows; timing deltas are not used as approval evidence because the
final rows use the stronger aggregated measurement protocol documented below.

| Quality | BEFORE field/combined triangles | Final field/combined triangles | Combined delta | Final draws grass/combined/renderer | Structural verdict |
|---|---:|---:|---:|---:|---|
| low | `0 / 95,219` | `0 / 95,219` | `0` | `0 / 2 / 13` | pass |
| default | `75,880 / 171,099` | `18,458 / 113,677` | `-57,422` | `3 / 5 / 16` | pass |
| high | `136,292 / 231,511` | `38,040 / 133,259` | `-98,252` | `3 / 5 / 16` | pass |

The complete `1920x1080` performance-fixture envelope is `0-38,040` field
triangles, `95,219-133,259` combined triangles, `0-3` grass logical draws,
`2-5` combined logical draws, and `13-16` total renderer draws. Every one of
the five rows passes structural triangles, draw limits, cutoff, exact coverage,
and zero recurring stationary uploads.

### Measured performance baseline deferred to AI 537

The unchanged hard means are GrassEngine CPU `<=0.60 ms` and measured
whole-frame GPU `<=1.50 ms`. All five CPU means pass. Four GPU means fail; the
high row passes individually, but the required five-row performance gate fails
overall. The complete set is therefore retained without omission or relabeling
and is deferred to AI 537 for whole-scene optimization and separate performance
approval.

| Fixture | Triangles field/combined | Draws grass/combined/renderer | CPU mean/median/p95 ms | GPU mean/median/p95 ms | Frame mean/p95 ms; FPS | Row verdict |
|---|---:|---:|---:|---:|---:|---|
| low | `0 / 95,219` | `0 / 2 / 13` | `0.022500 / 0 / 0.100000` | `2.999313 / 2.700288 / 5.098496` | `16.668333 / 16.8; 59.994` | CPU pass; GPU fail |
| default | `18,458 / 113,677` | `3 / 5 / 16` | `0.205000 / 0.2 / 0.3` | `3.578501 / 3.296256 / 4.030464` | `16.668333 / 16.8; 59.994` | CPU pass; GPU fail |
| high | `38,040 / 133,259` | `3 / 5 / 16` | `0.304167 / 0.3 / 0.4` | `1.463348 / 1.511424 / 1.642496` | `16.668333 / 16.8; 59.994` | CPU pass; GPU pass |
| default top-down worst view | `8,882 / 104,101` | `3 / 5 / 16` | `0.175000 / 0.2 / 0.3` | `4.245323 / 4.292608 / 6.193152` | `16.668333 / 16.8; 59.994` | CPU pass; GPU fail |
| default close/billboard overlap | `17,702 / 112,921` | `3 / 5 / 16` | `0.204167 / 0.2 / 0.3` | `3.368186 / 3.191808 / 4.856832` | `16.668333 / 16.8; 59.994` | CPU pass; GPU fail |

Measurement conditions: Windows `10.0.26200` x64; AMD Ryzen 5 9600X
(`12` logical CPUs); NVIDIA GeForce RTX 3060; headless Chrome `151`;
hardware-accelerated WebGL2 through ANGLE D3D11 (`vs_5_0/ps_5_0`), requested
high-performance context, and `4x` MSAA. Each stationary daylight fixture ran
at `1920x1080` after `120` warm-up frames and `1.970-1.985 s` of warm-up, then
recorded `120` GrassEngine CPU samples, `120` frame-interval samples, and `119`
valid `EXT_disjoint_timer_query_webgl2` whole-frame GPU samples with zero
disjoint events. Statistics above are arithmetic mean/median/p95; CPU scope is
`GrassEngine.update`, GPU scope is `WebGLRenderer.render`, and every row records
zero stationary instance-buffer uploads. Low/default/high use the
billboard-to-middle handoff camera; the other rows use top-down worst-view and
close-to-billboard overlap fixtures respectively.

Measured JS heap usage spans `105,535,049-181,928,625` bytes from
`204,832,269-262,663,289` committed bytes; renderer resources span `18-20`
geometries and `26` textures. Authoritative GPU allocation bytes are **not
measured** because WebGL exposes no authoritative allocation count.

### Final screenshot table

The table is deliberately compact. Triangle values are
`field / combined-with-AI359-boundary`; draw values are
`grass / combined-with-boundary / total-renderer`. Camera names are deterministic
manifest focus IDs. The manifest delegates full camera position/target/height,
pose, exposure, active tier/weights, signatures, exact coverage diagnostics,
per-tier costs, hashes, PNG dimensions, and motion metadata for every row.

| Workspace-relative PNG | Role | Camera/focus | Lighting | Quality | Triangles | Draws |
|---|---|---|---|---|---:|---:|
| `tests/artifacts/screens/grass/ai361/after_handoff_pair_close_billboard_auto.png` | handoff_pair | `close_billboard_handoff` | daylight | default | 17702/112921 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_handoff_pair_close_billboard_texture_only.png` | handoff_pair | `close_billboard_handoff` | daylight | default | 0/95219 | 0/2/13 |
| `tests/artifacts/screens/grass/ai361/after_handoff_pair_billboard_middle_auto.png` | handoff_pair | `billboard_middle_handoff` | daylight | default | 18458/113677 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_handoff_pair_billboard_middle_texture_only.png` | handoff_pair | `billboard_middle_handoff` | daylight | default | 0/95219 | 0/2/13 |
| `tests/artifacts/screens/grass/ai361/after_handoff_pair_middle_texture_auto.png` | handoff_pair | `middle_texture_handoff` | daylight | default | 18998/114217 | 4/6/17 |
| `tests/artifacts/screens/grass/ai361/after_handoff_pair_middle_texture_texture_only.png` | handoff_pair | `middle_texture_handoff` | daylight | default | 0/95219 | 0/2/13 |
| `tests/artifacts/screens/grass/ai361/after_tree_accent.png` | tree | `tree` | daylight | default | 19568/114787 | 5/7/18 |
| `tests/artifacts/screens/grass/ai361/after_far_turf.png` | far | `far_texture` | daylight | default | 18390/113609 | 4/6/17 |
| `tests/artifacts/screens/grass/ai361/after_grazing.png` | grazing | `near_grazing` | daylight | default | 17488/112707 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_top_down.png` | top_down | `top_down` | daylight | default | 8882/104101 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_bus_scale.png` | bus | `gameplay_bus` | daylight | default | 15284/110503 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_physical_cut.png` | physical_cut | `straight` | daylight | default | 11744/106963 | 4/6/16 |
| `tests/artifacts/screens/grass/ai361/after_cutoff.png` | cutoff | `middle_texture_handoff` | daylight | default | 19582/114801 | 4/6/17 |
| `tests/artifacts/screens/grass/ai361/after_light_daylight_texture.png` | lighting_matrix | `far_texture` | daylight | default | 0/95219 | 0/2/13 |
| `tests/artifacts/screens/grass/ai361/after_light_daylight_close.png` | lighting_matrix | `close_billboard_handoff` | daylight | default | 5376/100595 | 1/3/14 |
| `tests/artifacts/screens/grass/ai361/after_light_daylight_billboard.png` | lighting_matrix | `billboard_middle_handoff` | daylight | default | 5268/100487 | 1/3/14 |
| `tests/artifacts/screens/grass/ai361/after_light_daylight_middle.png` | lighting_matrix | `middle_texture_handoff` | daylight | default | 12284/107503 | 1/3/14 |
| `tests/artifacts/screens/grass/ai361/after_light_daylight_accent.png` | lighting_matrix | `tree` | daylight | default | 16/95235 | 1/3/14 |
| `tests/artifacts/screens/grass/ai361/after_light_overcast_texture.png` | lighting_matrix | `far_texture` | overcast | default | 0/95219 | 0/2/13 |
| `tests/artifacts/screens/grass/ai361/after_light_overcast_close.png` | lighting_matrix | `close_billboard_handoff` | overcast | default | 5376/100595 | 1/3/14 |
| `tests/artifacts/screens/grass/ai361/after_light_overcast_billboard.png` | lighting_matrix | `billboard_middle_handoff` | overcast | default | 5268/100487 | 1/3/14 |
| `tests/artifacts/screens/grass/ai361/after_light_overcast_middle.png` | lighting_matrix | `middle_texture_handoff` | overcast | default | 12284/107503 | 1/3/14 |
| `tests/artifacts/screens/grass/ai361/after_light_overcast_accent.png` | lighting_matrix | `tree` | overcast | default | 16/95235 | 1/3/14 |
| `tests/artifacts/screens/grass/ai361/after_light_golden_texture.png` | lighting_matrix | `far_texture` | golden | default | 0/95219 | 0/2/13 |
| `tests/artifacts/screens/grass/ai361/after_light_golden_close.png` | lighting_matrix | `close_billboard_handoff` | golden | default | 5376/100595 | 1/3/14 |
| `tests/artifacts/screens/grass/ai361/after_light_golden_billboard.png` | lighting_matrix | `billboard_middle_handoff` | golden | default | 5268/100487 | 1/3/14 |
| `tests/artifacts/screens/grass/ai361/after_light_golden_middle.png` | lighting_matrix | `middle_texture_handoff` | golden | default | 12284/107503 | 1/3/14 |
| `tests/artifacts/screens/grass/ai361/after_light_golden_accent.png` | lighting_matrix | `tree` | golden | default | 16/95235 | 1/3/14 |
| `tests/artifacts/screens/grass/ai361/after_light_night_texture.png` | lighting_matrix | `far_texture` | night | default | 0/95219 | 0/2/12 |
| `tests/artifacts/screens/grass/ai361/after_light_night_close.png` | lighting_matrix | `close_billboard_handoff` | night | default | 5376/100595 | 1/3/13 |
| `tests/artifacts/screens/grass/ai361/after_light_night_billboard.png` | lighting_matrix | `billboard_middle_handoff` | night | default | 5268/100487 | 1/3/13 |
| `tests/artifacts/screens/grass/ai361/after_light_night_middle.png` | lighting_matrix | `middle_texture_handoff` | night | default | 12284/107503 | 1/3/13 |
| `tests/artifacts/screens/grass/ai361/after_light_night_accent.png` | lighting_matrix | `tree` | night | default | 16/95235 | 1/3/13 |
| `tests/artifacts/screens/grass/ai361/after_forward_close_billboard_pre.png` | motion_transition | `motion_forward_0.000000` | daylight | default | 16300/111519 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_forward_close_billboard_center.png` | motion_transition | `motion_forward_0.113486` | daylight | default | 17362/112581 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_forward_close_billboard_post.png` | motion_transition | `motion_forward_0.163467` | daylight | default | 17894/113113 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_forward_billboard_middle_pre.png` | motion_transition | `motion_forward_0.269355` | daylight | default | 18054/113273 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_forward_billboard_middle_center.png` | motion_transition | `motion_forward_0.298638` | daylight | default | 18258/113477 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_forward_billboard_middle_post.png` | motion_transition | `motion_forward_0.326352` | daylight | default | 18870/114089 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_forward_middle_texture_pre.png` | motion_transition | `motion_forward_0.701362` | daylight | default | 18248/113467 | 4/6/17 |
| `tests/artifacts/screens/grass/ai361/after_forward_middle_texture_center.png` | motion_transition | `motion_forward_0.730645` | daylight | default | 17528/112747 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_forward_middle_texture_post.png` | motion_transition | `motion_forward_0.762103` | daylight | default | 18842/114061 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_reverse_close_billboard_pre.png` | motion_transition | `motion_reverse_1.000000` | daylight | default | 16300/111519 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_reverse_close_billboard_center.png` | motion_transition | `motion_reverse_0.886514` | daylight | default | 17362/112581 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_reverse_close_billboard_post.png` | motion_transition | `motion_reverse_0.836533` | daylight | default | 17894/113113 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_reverse_billboard_middle_pre.png` | motion_transition | `motion_reverse_0.730645` | daylight | default | 18054/113273 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_reverse_billboard_middle_center.png` | motion_transition | `motion_reverse_0.701362` | daylight | default | 18258/113477 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_reverse_billboard_middle_post.png` | motion_transition | `motion_reverse_0.673648` | daylight | default | 18870/114089 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_reverse_middle_texture_pre.png` | motion_transition | `motion_reverse_0.298638` | daylight | default | 18248/113467 | 4/6/17 |
| `tests/artifacts/screens/grass/ai361/after_reverse_middle_texture_center.png` | motion_transition | `motion_reverse_0.269355` | daylight | default | 17528/112747 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_reverse_middle_texture_post.png` | motion_transition | `motion_reverse_0.237897` | daylight | default | 18842/114061 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_strafe_start.png` | motion_transition | `motion_strafe_0.000000` | daylight | default | 15788/111007 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_strafe_middle.png` | motion_transition | `motion_strafe_0.500000` | daylight | default | 18258/113477 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_strafe_end.png` | motion_transition | `motion_strafe_1.000000` | daylight | default | 19638/114857 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_flyover_0000.png` | motion_transition | `motion_flyover_0.000000` | daylight | default | 17256/112475 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_flyover_1800.png` | motion_transition | `motion_flyover_0.200000` | daylight | default | 18306/113525 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_flyover_3600.png` | motion_transition | `motion_flyover_0.400000` | daylight | default | 18314/113533 | 4/6/16 |
| `tests/artifacts/screens/grass/ai361/after_flyover_5400.png` | motion_transition | `motion_flyover_0.600000` | daylight | default | 18512/113731 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_flyover_7200.png` | motion_transition | `motion_flyover_0.800000` | daylight | default | 16104/111323 | 3/5/16 |
| `tests/artifacts/screens/grass/ai361/after_flyover_9000.png` | motion_transition | `motion_flyover_1.000000` | daylight | default | 16486/111705 | 3/5/16 |

## Generated evidence location

- Any screenshots, capture manifests, comparison images, traces, logs, or reports produced by this AI must be saved under `tests/artifacts/screens/grass/ai361/`.
- This directory is gitignored. Do not write generated evidence to `screens/`, stage it, or commit it. Only tracked prompt/spec summaries may reference workspace-relative artifact paths.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_361_MESHES_billboard_mid_patch_auto_lod_and_accent_reconciliation_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.
- Include the complete cost table and native-4K screenshot manifest required by `## Required completion summary`.
