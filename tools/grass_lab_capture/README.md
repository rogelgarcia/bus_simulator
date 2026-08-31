# Grass Lab Capture

Captures deterministic, UI-free Grass Lab comparison evidence as lossless PNGs from an actual `3840x2160` WebGL drawing buffer at renderer pixel ratio `1`.

The runner uses the Lab's supported `window.__grassLab` evidence API. Before every screenshot it records the exact camera position and target, focus/pose, lighting, exposure, quality preset, active representation, grass triangles, logical grass draw calls, total renderer draw calls, CPU/GPU measurements, viewport, canvas, and drawing-buffer dimensions. It measures color from the saved compositor PNG rather than attempting to read back the non-preserved WebGL canvas.

Each phase also records low/default/high cost samples at `1920x1080`, including a verdict against the corrective V2 ceilings of 200,000 visible grass triangles and 12 logical grass draw calls.

The optional AI 359 boundary matrix records exact paired substrate-only and final-boundary approval frames. In that matrix the legacy near/mid/accent grass group is hidden, the final boundary is limited to two logical coverage draws, and the manifest records hard-exclusion/root-eligibility diagnostics.

The AI 361 LOD matrix always requests V2 in both phases. It preserves the
frozen 15-image BEFORE baseline (ten representative stills plus five flyover
checkpoints) and uses the complete 60-role approval matrix for AFTER. Handoff
views use deterministic handoff focus, hierarchy roles are explicitly
isolated, and all motion frames use fixed-progress seeking with an explicit LOD
hysteresis reset. The older BEFORE runtime can fall back to the supported
wall-clock flyover and freezes each compositor frame before PNG encoding.

## Run

Capture the unchanged baseline before material edits:

```powershell
node tools/grass_lab_capture/run.mjs --phase=before
```

Capture the corrected result from the same recipes:

```powershell
node tools/grass_lab_capture/run.mjs --phase=after
```

Capture the AI 359 polygon-boundary approval matrix:

```powershell
node tools/grass_lab_capture/run.mjs --phase=after --matrix=ai359-boundary
```

Capture the unchanged and corrected AI 361 hierarchy with:

    node tools/grass_lab_capture/run.mjs --phase=before --matrix=ai361-lod
    node tools/grass_lab_capture/run.mjs --phase=after --matrix=ai361-lod

Capture the scoped AI 362 V2 reapproval matrix with:

    node tools/grass_lab_capture/run.mjs --phase=after --matrix=ai362-validation

After a measurement-only runner correction, refresh the six timing rows and all
AI 362 gates without rewriting any PNGs with:

    node tools/grass_lab_capture/run.mjs --phase=after --matrix=ai362-validation --measurements-only

This mode fails closed unless the existing manifest contains exactly the 114
canonical AFTER recipes and every output-local lossless native-4K PNG still
matches its recorded dimensions and SHA-256. It cannot be combined with
`--recipes`, `--overwrite`, or `--inspect-boundary`.

AI 362 consumes the immutable, verified AI 361 final-code manifest and PNGs as
its designated BEFORE comparison source. It does not accept a separate AI 362
`--phase=before` run.

After the user-authorized transfer of the whole-scene GPU optimization to AI
537, AI 361 final-code evidence uses the explicit scoped handoff:

    node tools/grass_lab_capture/run.mjs --phase=after --matrix=ai361-lod --defer-performance-to=AI537

This option is accepted only for the AI 361 AFTER matrix. It does not convert a
failed timing row into a pass: the manifest retains the real performance gate,
`performanceCostPass: false`, and the raw measurements while recording
`performanceRequired: false` plus ownership `{ status: "deferred", owner:
"AI537" }`. Missing timing evidence, structural-budget failures, visual
failures, or deterministic-motion failures still fail the capture.

Selected recipes can be replaced without touching the other phase entries:

    node tools/grass_lab_capture/run.mjs --phase=before --matrix=ai361-lod --recipes=flyover_0000,flyover_2250 --overwrite

Add `--inspect-boundary` for a read-only live boundary snapshot and the two
problem topology windows without writing images or a manifest. Inspection is a
diagnostic aid only and does not count as completion evidence.

The default output is `tests/artifacts/screens/grass/ai358/`. AI 359, AI 360,
AI 361, and AI 362 matrices default to their matching
`tests/artifacts/screens/grass/ai359/` through `ai362/` directories. Runs merge
into `capture_manifest.json`; matching phase files are never overwritten unless
`--overwrite` is provided.

For `--matrix=ai359-boundary`, the default output changes to `tests/artifacts/screens/grass/ai359/`. Pass `--output=...` to override either matrix destination.

The runner starts the existing local static server when `http://127.0.0.1:4173` is not already healthy. Use an existing server or browser installation when required:

```powershell
node tools/grass_lab_capture/run.mjs --phase=after --base-url=http://127.0.0.1:4173 --browser-executable=C:\path\to\chrome.exe
```

Keep a corrective bake in the Lab without installing it into shared gameplay assets:

```powershell
node tools/grass_lab_capture/run.mjs --phase=after --v2-asset-root=tests/artifacts/grass_material_baker/grass_low_cut_maintained_v2_split
```

The repository-relative override intercepts only
`assets/public/pbr/grass_low_cut_maintained_v2/*` requests. The manifest records
`lab_staging_override` and the staging root so evidence cannot be mistaken for an
installed gameplay asset.

Run `node tools/grass_lab_capture/run.mjs --help` for all options.

## Capture matrix

The default `--matrix=material` behavior is unchanged. Each phase produces eleven native-4K PNGs:

- material fixture under daylight, overcast, golden-hour, and night lighting;
- close geometry at `0.30 m`;
- identical-camera geometry-on and texture-only daylight captures at `0.50 m`;
- identical-camera geometry-on and texture-only overcast captures at `0.50 m` (the geometry view also supplies the required grazing-angle evidence);
- near handoff;
- far texture at night.

### AI 361 LOD matrix

The ai361-lod matrix writes to tests/artifacts/screens/grass/ai361/.
BEFORE remains the frozen 15-image representative set:

- close/billboard, billboard/middle, and middle/texture center views;
- tree accent, far turf, grazing, top-down, bus-scale, physical-cut, and
  cutoff views;
- flyover checkpoints at requested progress 0, 0.25, 0.50, 0.75, and
  0.988889.

AFTER contains the complete 60-role approval set:

- identical-camera auto / texture_only pairs at all three handoffs;
- the seven tree, far, grazing, top-down, bus-scale, physical-cut, and cutoff
  stills;
- daylight, overcast, golden-hour, and night captures for each of
  texture_only, close, billboard, middle, and accent;
- forward and reverse pre/center/post frames at every handoff;
- three fixed-progress strafe frames and six fixed-progress flyover frames.

Every entry records the V2 material version, exact coverage and near
diagnostics, per-tier billboard/middle/accent costs when exposed, cutoff
geometry, camera state, content SHA-256, and whether fixed-progress seek was
used. The phase-aware gate requires all 15 frozen BEFORE IDs or all 60 AFTER
IDs, exact 3840x2160 PNGs, V2, no more than 200,000 combined visible grass
triangles, no more than 12 grass logical draws, no more than two boundary
draws, and zero geometry beyond cutoff. AFTER also requires aligned handoff
pairs, a paired PNG card-band continuity pass at every handoff, an explicit
hysteresis reset, deterministic seek, and distinct frame hashes within every
motion route. The PNG continuity check is a regression gate for dark rows and
material discontinuities; final cohesive-carpet acceptance still requires
human review of the native-4K frames.

The AFTER run also requires the five `1920x1080` performance states (low,
default, high, default worst/top-down, and default close/billboard overlap) to
pass as one aggregate gate. Each state warms for at least `120` frames and one
second, waits for stable zero stationary uploads, then records `120` CPU/frame
samples and at least `30` real GPU timer-query samples. The manifest records
mean, median, p95, count, graphics vendor/renderer, WebGL backend, hardware
acceleration, query sequences, and disjoint state. Unsupported GPU timing is
reported explicitly; it is never replaced by a CPU proxy. A supported GPU row
above `1.50 ms` fails the matrix and the runner exit status.

### AI 362 validation matrix

`--matrix=ai362-validation` writes to
`tests/artifacts/screens/grass/ai362/` and captures 114 deterministic native-4K
frames: 40 clean/diagnostic-overlay still pairs, three stationary handoff
repeats, 27 primary fixed-progress motion frames, and four representative
motion repeats. The stills cover all seven inspection heights, grazing,
forward, oblique, top-down, bus, tree-base, and far views; every required
sidewalk/substrate shape including tree-substrate; all four lights for material,
edge, and handoff review; and low-quality plus geometry-disabled fallbacks.

Every close/billboard, billboard/middle, and middle/texture handoff has clean,
diagnostic, and exact-pixel stationary-repeat evidence. Forward and reverse
retain pre/center/post checkpoints at every handoff, with fixed-progress strafe
and flyover paths. Seven repeat pairs must match camera/state and PNG SHA-256
exactly. One diagnostic frame is the canonical enriched approval source for the
V2 AutoLOD, shared-field, material, accent, and boundary facts.

The matrix exact-maps 36 designated comparisons to the immutable AI 361 final
manifest: all 27 primary motion checkpoints, three automatic stationary
handoffs, grazing, top-down, bus, tree, far, and the low-side physical cut. The
gate verifies each source PNG on disk, its lossless native-4K dimensions and
SHA-256, and matching camera position/target, lighting, exposure, and quality.
New AI 362-only review angles and diagnostic overlays are not mislabeled as
BEFORE comparisons.

The manifest keeps exactly five canonical `1920x1080` performance rows and a
separate informational `3840x2160` timing row with same-run hardware metadata.
Timing remains owned by AI 537 whether it measures pass or fail; the actual
verdict is retained under `performanceOwnership: deferred_to_ai537`. Missing
rows, incomplete metadata, stationary uploads, structural/cutoff failures,
baseline mismatches, failed regression evidence, or nondeterministic repeats
still fail AI 362.

`--measurements-only` re-verifies the complete existing PNG set before starting
the browser, then skips every screenshot recipe. It reloads the immutable AI
361 baseline, regenerates approval enrichment and regression/aggregate gates,
and replaces the manifest timing evidence with one fresh native-4K row plus the
five fresh canonical 1080p rows while preserving the verified PNG bytes.

### AI 359 boundary matrix

`--matrix=ai359-boundary` produces 18 native-4K PNGs: a pixel-aligned `substrate_only` / `boundary_final` pair for each of nine poses.

- straight boundary at `0.30 m`, `0.50 m`, and `1.00 m` camera heights;
- a `0.40 m` straight close-up at `1.25 m` camera distance;
- curve, diagonal, inside-corner, outside-corner, and tree-base views at `0.50 m`.

Every pair uses the supported `focusBoundaryCamera` and `setBoundaryEvidenceMode` APIs with low quality, daylight, identical exposure, and an identical camera. The pair gate fails unless all 18 images are exact `3840x2160` PNGs, the shared rendered-sidewalk source identity is stable, the legacy grass engine is hidden in both roles, substrate-only contains no coverage geometry, and final coverage is opaque, intrusion-free, root-eligible, and at most two logical draws. The manifest stores per-frame cap/edge costs, complete coverage diagnostics, pair alignment, and low/default/high boundary cost samples.

The tool fails rather than accepting a browser-scaled image, non-PNG payload, wrong canvas bounds, wrong drawing-buffer dimensions, or local runtime/request error.

Every capture stores measurements from the same normalized turf ROI (`x=0.20`, `y=0.55`, `width=0.60`, `height=0.35`). The manifest calculates daylight and overcast geometry-on/texture-only median-luminance ratios and records the `0.90–1.10` verdict.

The independent live-card regression gate reuses those pixel-aligned `height_050` pairs and samples the horizon/card strip at `x=0.05`, `y=0.35`, `width=0.90`, `height=0.08`. A pixel is darkened when its geometry-on luminance is below `0.70 ×` texture-only luminance and the absolute luminance drop exceeds `0.06`. The tool averages the darkened fraction across every three-row window and requires the maximum to remain at or below `0.10`. This spatial gate catches a thin dark card band that a broad median can miss.

The automated card-band gate samples the live field cards, where runtime card scale, placement, and LOD interaction are visible. The material fixture has no identical texture-only counterpart, so its atlas previews remain required human-review evidence rather than an automated pixel-pair gate. Both gate results are stored separately for both phases in manifest schema V2. A corrected after phase failing either gate is retained as evidence but returns a failing exit status.
