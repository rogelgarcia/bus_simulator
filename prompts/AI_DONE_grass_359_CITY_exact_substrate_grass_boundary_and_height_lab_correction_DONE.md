# DONE

> **Human visual validation: REJECTED (2026-08-31).** The user rejected the complete offline-first grass solution spanning AI 350–362 and AI 537 after reviewing the final renders. This prompt is historical implementation evidence only: its DONE state does not approve the visual result, authorize gameplay integration, or define an acceptable baseline for future grass work. Any replacement must start from a new visual direction and receive explicit human approval.

The V1 Grass Lab does not clearly show the physical order from sidewalk to exposed substrate to a shallow raised grass carpet. Its canonical irregular cuts are stepped rectangles, the road edge can read as a broad fading brown overlay, the far cap exposes artificial square or micro-cutout patterns, and sparse fringe blades do not create a convincing cut edge.

# Request

Correct the grass footprint, exposed substrate, shallow height, and physical sidewalk/tree boundary in the dedicated Grass Lab. This prompt owns where grass exists and how the cut edge reveals substrate. It must consume AI 358's corrected material family without changing field density, LOD tiers, or gameplay.

This is step 10 of the offline-first grass sequence.

Tasks:
- Derive the canonical grass exclusion boundary from the same actual road and sidewalk outer loops used to render the fixture, including straight runs, curves, diagonal cuts, inside corners, and outside corners.
- Replace the stepped-rectangle approval fixture with deterministic polygonal, diagonal, and curved cuts. Rectangle compatibility may remain, but it must not be the approval path.
- Define one deterministic polygon and boundary-distance contract that reports hard grass occupancy, distance from the physical cut, and root eligibility without coupling footprint coverage to material blending.
- Preserve continuous PBR substrate under the whole lawn and expose a real narrow substrate strip after the sidewalk before grass begins. Use a documented default of `80 mm` with an accepted range of `60-100 mm`.
- Keep the structural root/thatch base shallow and separately documented from visible blade-tip height. Use `25-30 mm` only as the initial base-height reference, not as a universal canopy limit; visible blades may be longer and irregular according to the selected profile. Provide a plausible cut side rather than a green vertical wall.
- Disable the legacy broad translucent dirt-strip fade wherever the maintained-grass boundary is active. The substrate reveal must come from uncovered substrate, not color blending.
- Keep the far grass cap opaque and stable inside its hard footprint. Do not use auxiliary far-surface alpha noise to punch visible square or micro holes through complete distant turf.
- Replace isolated sparse fringe blades with one continuous batched cut-edge treatment that reads as dense cut vegetation. Keep the combined physical edge to no more than two grass-boundary logical draws, excluding the existing substrate draw.
- Convert worn tree substrate from an opaque disc over live grass into a deterministic exclusion that reveals the shared substrate around the trunk.
- Expose the corrected occupancy, boundary-distance, and root-eligibility contract to later near and middle tiers without modifying their representation in this prompt.
- Add deterministic diagnostics for source-loop identity, grass-onset width, canopy height, boundary deviation, occupied and excluded samples, antialias width, root eligibility, triangles, and logical draws.
- Add regression fixtures for straight, curved, diagonal, inside-corner, outside-corner, tree-base, and reload-stability behavior, including proof that no cap, root/thatch, or cut-edge geometry owned here reaches road or sidewalk.
- Capture UI-free native `3840x2160` paired substrate-only and boundary-final images from identical cameras at `0.30 m`, `0.50 m`, and `1.00 m`, plus zoomable straight, curve, diagonal, inside-corner, outside-corner, and tree-base views. Disable legacy near, cluster, and localized grass geometry in these boundary-approval views so V1 tiers cannot hide or invalidate this prompt's ownership result.
- Keep near density, patch geometry, billboard/cluster geometry, automatic LOD, AI 358 grass appearance assets, quality presets, and gameplay unchanged.

Acceptance outcomes:
- Every approval view clearly reads as sidewalk, then `80 +/- 20 mm` of exposed substrate, then a hard root/thatch cut, then a shallow raised grass carpet.
- The shallow structural base height and the separate visible blade-height distribution are documented and visible in side profile. Longer or irregular blade tips are allowed and are not clipped to a universal `25-30 mm` canopy.
- The grass-onset antialias region is no wider than `15 mm`.
- Straight, curved, diagonal, inside-corner, and outside-corner cuts follow the rendered sidewalk geometry without rectangular stepping or square brown fades.
- No cap, root/thatch, or cut-edge geometry owned by AI 359 crosses the road, sidewalk, trunk, or other hard exclusion. Eligibility diagnostics prove that later blade/card/patch roots will be rejected there; AI 360 and AI 361 own enforcement by their respective geometry tiers.
- No isolated sparse fringe remains along the canonical edge.
- The corrected cap and cut edge use no more than two grass-boundary logical draws, excluding substrate.
- Reloading the same topology and seed reproduces identical boundary geometry and diagnostics.
- All required PNGs are native `3840x2160`, UI-free, and clearly expose the sidewalk/substrate/grass profile.
- Gameplay remains untouched.

## Sequence dependency

- Requires completed AI 358, `specs/grass/LOW_CUT_GRASS_MATERIAL_V2.md`, and the historical AI 354 boundary work as the V1 correction baseline.
- Creates `specs/grass/GRASS_COVERAGE_AND_SIDEWALK_EDGE_V2.md` and supplies its footprint/root-eligibility contract to AI 360 through AI 363.
- The V2 handoff records each rendered physical `sourceLoop` separately from its grass `onsetLoop`, defines positive signed distance on occupied grass and negative distance in exclusions, and keys downstream caches to `boundarySignature`/`sourceLoopIdentity`. Rectangle compatibility is not an approval source when exact polygon exclusions are present.
- Does not issue whole-system approval.

## Dynamic AI coordination

- `prompts/AI_grass_349_REFACTOR_global_texture_catalog_loader_and_calibration_pipeline.md` is a long-lived dynamic checklist. Leave the file active, in place, and under its current name.
- Before marking this prompt DONE, update its scoped AI 359 grass-sequence checklist item with the cap, substrate, root/thatch, edge, loader, calibration, and consumer work completed here. Mark that item complete only after implementation and verification finish.
- Do not mark unrelated pending AI 349 follow-ups complete, and do not replace the global pipeline with a Grass Lab-local loader.
- If this prompt changes a contract, update `specs/grass/GRASS_OFFLINE_FIRST_AI_SEQUENCE.md` and every downstream grass prompt that consumes it.
- Leave completed AI 350 through AI 357 prompts in place as historical records; record corrections in V2 contracts and explicit supersession notes.

## Required completion summary

Before marking this prompt DONE, add a `## Completion evidence` section to this file containing:

- A before/after cost table for every representative fixture and quality preset used here. Report visible grass triangles, boundary/cap triangles, grass logical draw calls, total renderer draw calls, and measured CPU/GPU timing when available.
- An explicit cost delta and budget verdict, including the physical edge's logical draws. Costs may not be replaced by qualitative statements.
- A screenshot manifest with workspace-relative file paths under the prompt-specific ignored evidence directory, before/after or substrate-only/final role, camera position/target/height, pose, lighting, exposure, quality preset, triangle count, and grass/total draw-call counts.
- Only UI-free lossless PNG screenshots captured from a real `3840x2160` drawing buffer at pixel ratio `1`. Do not use JPEG, browser-scaled screenshots, or upscaled lower-resolution captures.
- All straight, curved, diagonal, inside-corner, outside-corner, tree-base, and `0.30/0.50/1.00 m` boundary comparisons required above. State any missing image or measurement explicitly; the prompt cannot be marked DONE while required evidence is missing.

## Generated evidence location

- Any screenshots, capture manifests, comparison images, traces, logs, or reports produced by this AI must be saved under `tests/artifacts/screens/grass/ai359/`.
- This directory is gitignored. Do not write generated evidence to `screens/`, stage it, or commit it. Only tracked prompt/spec summaries may reference workspace-relative artifact paths.

## Completion evidence

### Implemented result

- RoadEngine now exports identified sidewalk outer loops from the same historical primitives and settings used by its visible sidewalk mesh. The Grass Lab alone uses `filletRadiusFactor: 1.0` to keep that fixture's rendered loop simple, and a canonical pair builder derives the onset from the same normalized point list. Shared curb, sidewalk, asphalt, and dirt builders are unchanged.
- Grass coverage V2 exposes hard polygon occupancy, signed boundary distance, root eligibility, source/signature identity, separate sidewalk/tree reveal diagnostics, and deterministic straight/curve/diagonal/corner/tree fixtures.
- The continuous substrate remains underneath an opaque polygon cap and one batched root/thatch plus dense-cut-edge mesh; the legacy broad sidewalk dirt fade is suppressed in the maintained-grass fixture.
- Structural base height is `0.0275 m`, visible cut-edge tips span `0.040-0.075 m`, onset antialiasing is `0.012 m`, and the declared sidewalk reveal is `0.080 m`.
- Tree wear is a hard hole revealing the shared substrate. Legacy near, cluster, and localized representations are disabled in boundary-approval captures.
- Each cut-edge candidate is contract-tested before emission. Static geometry construction and safety evaluation are visibility-independent, including disable/rebuild/re-enable transitions. The final fixture emits `46,879` eligible roots with zero rejected and zero post-build ineligible roots.

The machine-readable record is
`tests/artifacts/screens/grass/ai359/capture_manifest.json`
(`grass-lab-capture-manifest-v2`, generated `2026-08-30T20:30:18.141Z`).
The boundary gate passed all `9` matched pairs / `18` captures with the exact
required set. Its stable boundary identity is
`road-engine-sidewalk-outer-v1-6753c620|road-engine-sidewalk-outer-1914a459|grass-lab-tree:tree_northwest:1.050000:-120.000000,91.200000:r0.577500|grass-lab-tree:tree_southwest:0.920000:-120.000000,-28.800000:r0.506000|grass-lab-tree:tree_southeast:1.120000:120.000000,-81.600000:r0.616000|grass-lab-tree:tree_northeast:0.980000:120.000000,108.000000:r0.539000`,
and the boundary signature is `grass-coverage-v2-8dfb0734`.

Final coverage diagnostics report `495` cap triangles, `966` root/thatch
triangles, `93,758` dense-edge triangles, `95,219` total boundary triangles,
and exactly `2` logical draws (`1` cap + `1` combined edge). There are `0` hard
road/sidewalk/trunk-source intrusions and `0` grass-onset intrusions across
`380,876` geometry safety samples. The `1,690` onset-boundary contacts have a
maximum quantization depth of `0.000005722 m`, below the scale-aware Float32
tolerance of `0.000030517578125 m`, so they are contacts rather than crossings.
The sidewalk onset range is `0.079999999-0.100000000 m`, within the accepted
`0.060-0.100 m` tolerance; the maximum source/onset deviation is `0.020000000 m`
at a miter-limited outside corner. All representation checks, exact-source checks, opaque-cap checks,
shape checks, and pair-alignment checks passed, and the capture run recorded no
runtime errors.

### Cost measurements

Cost samples use the canonical Grass Lab at `1920x1080`, daylight exposure `1`,
a stationary camera, and the low/default/high density multipliers
`0.55/1.00/1.25`. Each preset was reset and settled for `60` capture frames.
The statistic is the single current runtime snapshot after settling, not a
multi-run average. The V1 before phase used `height_150`; the V2 after phase used
`boundary_straight_100` with `boundary_final` active. Geometry and logical-draw
deltas are deterministic contract deltas; CPU/GPU comparisons are directional
only because the manifest's before and after cameras differ.

The harness did not record the hardware/driver identity. Full frame time and
FPS were not measured because the manifest records only the GrassEngine update
CPU value and a whole-frame GPU timer proxy. CPU/GPU memory was not measured
because the harness exposes no allocation counter. Those unavailable values are
not replaced by projections.

The V1 boundary split (`130` cap + `40` lip + `2,600` fringe = `2,770`
triangles, `3` logical draws) is the deterministic historical V1 fixture cost;
the remaining before/after values below come from the manifest.
For default/high V2 cost samples, the snapshot retains the underlying field
engine's geometry counters even though `boundary_final` hides that group. The
combined column conservatively sums those counters with coverage for budgeting;
the paired approval screenshots correctly report zero visible field triangles.

| Preset | Phase / camera | Field triangles | Cap triangles | Edge triangles | Boundary triangles | Combined grass triangles | Field + boundary logical draws | Total renderer draws | Grass CPU ms | Whole-frame GPU proxy ms | Budget verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Low | Before V1 / `height_150` | 0 | 130 | 2,640 | 2,770 | 2,770 | 3 | 15 | 0.028319 | 1.092608 | Pass |
| Low | After V2 / `boundary_straight_100` | 0 | 495 | 94,724 | 95,219 | 95,219 | 2 | 12 | 0.046930 | 0.813056 | Pass |
| Default | Before V1 / `height_150` | 21,464 | 130 | 2,640 | 2,770 | 24,234 | 8 | 19 | 0.094027 | 1.816576 | Pass |
| Default | After V2 / `boundary_straight_100` | 5,868 | 495 | 94,724 | 95,219 | 101,087 | 7 | 12 | 0.133947 | 1.067008 | Pass |
| High | Before V1 / `height_150` | 61,688 | 130 | 2,640 | 2,770 | 64,458 | 9 | 20 | 0.092370 | 4.923392 | Pass |
| High | After V2 / `boundary_straight_100` | 27,184 | 495 | 94,724 | 95,219 | 122,403 | 7 | 12 | 0.098154 | 0.992256 | Pass |

| Preset | Combined triangle delta | Combined logical-draw delta | Total-renderer-draw delta | Grass CPU delta ms | GPU-proxy delta ms | Explicit verdict |
|---|---:|---:|---:|---:|---:|---|
| Low | +92,449 | -1 | -3 | +0.018611 | -0.279552 | Pass: 95,219 < 200,000 triangles; 2 <= 12 grass draws; boundary = 2 draws |
| Default | +76,853 | -1 | -7 | +0.039919 | -0.749568 | Pass: 101,087 < 200,000 triangles; 7 <= 12 grass draws; boundary = 2 draws |
| High | +57,945 | -2 | -8 | +0.005784 | -3.931136 | Pass: 122,403 < 200,000 triangles; 7 <= 12 grass draws; boundary = 2 draws |

The boundary itself changes by `+365` cap triangles, `+92,084` edge triangles,
`+92,449` total triangles, and `-1` logical draw. The higher triangle count is
the measured cost of replacing the sparse V1 fringe with the required
continuous dense cut edge. Every preset remains below the corrective V2
`200,000` visible-grass-triangle ceiling and `12` grass-draw ceiling, while the
physical cap/edge meets its stricter `2`-draw ceiling. This is an AI 359
boundary verdict, not whole-system approval; AI 362 retains final approval.

### Native-4K screenshot manifest

Positions and targets below are world `(x, y, z)` coordinates rounded to six
decimal places; the JSON manifest retains the full values. `Boundary / field
tris` separates AI 359 coverage from the deliberately hidden near/mid/accent
field. `Boundary / field / total draws` ends with the measured renderer total.

| Relative PNG path | Role | Pose | Camera position | Camera target | Height m | Lighting / exposure / quality | Boundary / field tris | Boundary / field / total draws |
|---|---|---|---|---|---:|---|---:|---:|
| `tests/artifacts/screens/grass/ai359/after_substrate_only_straight_030.png` | `substrate_only` | straight | `(71.550000, 0.30, 155.825711)` | `(72.000000, 0.03, 158.645711)` | 0.30 | daylight / 1 / low | 0 / 0 | 0 / 0 / 10 |
| `tests/artifacts/screens/grass/ai359/after_boundary_final_straight_030.png` | `boundary_final` | straight | `(71.550000, 0.30, 155.825711)` | `(72.000000, 0.03, 158.645711)` | 0.30 | daylight / 1 / low | 95,219 / 0 | 2 / 0 / 12 |
| `tests/artifacts/screens/grass/ai359/after_substrate_only_straight_050.png` | `substrate_only` | straight | `(71.550000, 0.50, 155.825711)` | `(72.000000, 0.03, 158.645711)` | 0.50 | daylight / 1 / low | 0 / 0 | 0 / 0 / 10 |
| `tests/artifacts/screens/grass/ai359/after_boundary_final_straight_050.png` | `boundary_final` | straight | `(71.550000, 0.50, 155.825711)` | `(72.000000, 0.03, 158.645711)` | 0.50 | daylight / 1 / low | 95,219 / 0 | 2 / 0 / 12 |
| `tests/artifacts/screens/grass/ai359/after_substrate_only_straight_100.png` | `substrate_only` | straight | `(71.550000, 1.00, 155.825711)` | `(72.000000, 0.03, 158.645711)` | 1.00 | daylight / 1 / low | 0 / 0 | 0 / 0 / 10 |
| `tests/artifacts/screens/grass/ai359/after_boundary_final_straight_100.png` | `boundary_final` | straight | `(71.550000, 1.00, 155.825711)` | `(72.000000, 0.03, 158.645711)` | 1.00 | daylight / 1 / low | 95,219 / 0 | 2 / 0 / 12 |
| `tests/artifacts/screens/grass/ai359/after_substrate_only_straight_zoom.png` | `substrate_only` | straight | `(71.550000, 0.40, 157.175711)` | `(72.000000, 0.03, 158.645711)` | 0.40 | daylight / 1 / low | 0 / 0 | 0 / 0 / 10 |
| `tests/artifacts/screens/grass/ai359/after_boundary_final_straight_zoom.png` | `boundary_final` | straight | `(71.550000, 0.40, 157.175711)` | `(72.000000, 0.03, 158.645711)` | 0.40 | daylight / 1 / low | 95,219 / 0 | 2 / 0 / 12 |
| `tests/artifacts/screens/grass/ai359/after_substrate_only_curve.png` | `substrate_only` | curve | `(16.486460, 0.50, -35.339365)` | `(15.702238, 0.03, -38.282135)` | 0.50 | daylight / 1 / low | 0 / 0 | 0 / 0 / 11 |
| `tests/artifacts/screens/grass/ai359/after_boundary_final_curve.png` | `boundary_final` | curve | `(16.486460, 0.50, -35.339365)` | `(15.702238, 0.03, -38.282135)` | 0.50 | daylight / 1 / low | 95,219 / 0 | 2 / 0 / 13 |
| `tests/artifacts/screens/grass/ai359/after_substrate_only_diagonal.png` | `substrate_only` | diagonal | `(77.155230, 0.50, 117.007404)` | `(79.975355, 0.03, 115.857711)` | 0.50 | daylight / 1 / low | 0 / 0 | 0 / 0 / 11 |
| `tests/artifacts/screens/grass/ai359/after_boundary_final_diagonal.png` | `boundary_final` | diagonal | `(77.155230, 0.50, 117.007404)` | `(79.975355, 0.03, 115.857711)` | 0.50 | daylight / 1 / low | 95,219 / 0 | 2 / 0 / 13 |
| `tests/artifacts/screens/grass/ai359/after_substrate_only_inside_corner.png` | `substrate_only` | inside_corner | `(14.922135, 0.50, -25.410167)` | `(13.747785, 0.03, -22.377235)` | 0.50 | daylight / 1 / low | 0 / 0 | 0 / 0 / 11 |
| `tests/artifacts/screens/grass/ai359/after_boundary_final_inside_corner.png` | `boundary_final` | inside_corner | `(14.922135, 0.50, -25.410167)` | `(13.747785, 0.03, -22.377235)` | 0.50 | daylight / 1 / low | 95,219 / 0 | 2 / 0 / 13 |
| `tests/artifacts/screens/grass/ai359/after_substrate_only_outside_corner.png` | `substrate_only` | outside_corner | `(77.706211, 0.50, 157.718510)` | `(79.906266, 0.03, 158.581283)` | 0.50 | daylight / 1 / low | 0 / 0 | 0 / 0 / 7 |
| `tests/artifacts/screens/grass/ai359/after_boundary_final_outside_corner.png` | `boundary_final` | outside_corner | `(77.706211, 0.50, 157.718510)` | `(79.906266, 0.03, 158.581283)` | 0.50 | daylight / 1 / low | 95,219 / 0 | 2 / 0 / 9 |
| `tests/artifacts/screens/grass/ai359/after_substrate_only_tree_base.png` | `substrate_only` | tree_base | `(-116.602000, 0.50, 92.350000)` | `(-119.322000, 0.03, 91.200000)` | 0.50 | daylight / 1 / low | 0 / 0 | 0 / 0 / 10 |
| `tests/artifacts/screens/grass/ai359/after_boundary_final_tree_base.png` | `boundary_final` | tree_base | `(-116.602000, 0.50, 92.350000)` | `(-119.322000, 0.03, 91.200000)` | 0.50 | daylight / 1 / low | 95,219 / 0 | 2 / 0 / 12 |

The manifest requires and records a `3840x2160` drawing buffer at renderer pixel
ratio `1`. Every row has viewport `3840x2160`, CSS canvas `3840x2160`, backing
canvas `3840x2160`, drawing buffer `3840x2160`, renderer pixel ratio `1`, and
decoded lossless PNG dimensions `3840x2160`. All nine substrate/final pairs
passed exact camera, lighting, exposure, quality, and dimension alignment. No
required screenshot or cost row is missing. The full repository test sweep is a
separate finalization gate and is not inferred from this capture manifest.

### Verification

- The AI 359-focused Node suite passed `84/84`, covering polygon occupancy,
  signed distance, root eligibility, reload determinism, the actual Grass Lab
  RoadEngine sidewalk/onset topology, dirt-strip suppression, Lab/capture
  contracts, localized tree exclusions, material opacity, LOD isolation, and
  gameplay non-ownership.
- The staged AI 358 split asset bundle passed its `3/3` hash, dimension,
  provenance, gutter, scale, and mip-alpha checks through
  `GRASS_V2_ASSET_DIR=tests/artifacts/grass_material_baker/grass_low_cut_maintained_v2_split`.
- The real-Chrome boundary capture completed `18/18` native-4K frames and the
  machine boundary gate passed all nine aligned pairs. A final live inspection
  reported zero hard-source intrusions, zero rejected roots, and zero
  post-build ineligible roots.
- The complete Node unit sweep reported `518` tests: `504` passed, `11` failed,
  and `3` skipped. No failure touches an AI 359-modified contract. Four failures
  require the absent `manifold-3d` dependency, one is a sandbox-denied preset
  read, four are unrelated assertion drift, and two target the unpromoted
  production copy of AI 358's asset bundle; the staged bundle used here passes
  as recorded above.
- The standardized browser-core runner could not launch because its pinned
  Playwright Chromium executable is not installed in this workspace. The AI 359
  live-runtime gates instead ran through the installed system Chrome using the
  capture runner. All `17/17` modified JavaScript/module syntax checks and
  `git diff --check` passed.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_359_CITY_exact_substrate_grass_boundary_and_height_lab_correction_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.
- Include the complete cost table and native-4K screenshot manifest required by `## Required completion summary`.
