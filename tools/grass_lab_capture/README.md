# Grass Lab Capture

Captures deterministic, UI-free Grass Lab comparison evidence as lossless PNGs from an actual `3840x2160` WebGL drawing buffer at renderer pixel ratio `1`.

The runner uses the Lab's supported `window.__grassLab` evidence API. Before every screenshot it records the exact camera position and target, focus/pose, lighting, exposure, quality preset, active representation, grass triangles, logical grass draw calls, total renderer draw calls, CPU/GPU measurements, viewport, canvas, and drawing-buffer dimensions. It measures color from the saved compositor PNG rather than attempting to read back the non-preserved WebGL canvas.

Each phase also records low/default/high cost samples at `1920x1080`, including a verdict against the corrective V2 ceilings of 200,000 visible grass triangles and 12 logical grass draw calls.

The optional AI 359 boundary matrix records exact paired substrate-only and final-boundary approval frames. In that matrix the legacy near/mid/accent grass group is hidden, the final boundary is limited to two logical coverage draws, and the manifest records hard-exclusion/root-eligibility diagnostics.

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

Add `--inspect-boundary` for a read-only live boundary snapshot and the two
problem topology windows without writing images or a manifest. Inspection is a
diagnostic aid only and does not count as completion evidence.

The default output is `tests/artifacts/screens/grass/ai358/`. The two runs merge into `capture_manifest.json`; matching phase files are never overwritten unless `--overwrite` is provided.

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
