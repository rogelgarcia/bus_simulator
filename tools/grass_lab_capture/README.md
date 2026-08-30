# Grass Lab Capture

Captures deterministic, UI-free Grass Lab comparison evidence as lossless PNGs from an actual `3840x2160` WebGL drawing buffer at renderer pixel ratio `1`.

The runner uses the Lab's supported `window.__grassLab` evidence API. Before every screenshot it records the exact camera position and target, focus/pose, lighting, exposure, quality preset, active representation, grass triangles, logical grass draw calls, total renderer draw calls, CPU/GPU measurements, viewport, canvas, and drawing-buffer dimensions. It measures color from the saved compositor PNG rather than attempting to read back the non-preserved WebGL canvas.

Each phase also records low/default/high cost samples at `1920x1080`, including a verdict against the corrective V2 ceilings of 200,000 visible grass triangles and 12 logical grass draw calls.

## Run

Capture the unchanged baseline before material edits:

```powershell
node tools/grass_lab_capture/run.mjs --phase=before
```

Capture the corrected result from the same recipes:

```powershell
node tools/grass_lab_capture/run.mjs --phase=after
```

The default output is `tests/artifacts/screens/grass/ai358/`. The two runs merge into `capture_manifest.json`; matching phase files are never overwritten unless `--overwrite` is provided.

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

Each phase produces eleven native-4K PNGs:

- material fixture under daylight, overcast, golden-hour, and night lighting;
- close geometry at `0.30 m`;
- identical-camera geometry-on and texture-only daylight captures at `0.50 m`;
- identical-camera geometry-on and texture-only overcast captures at `0.50 m` (the geometry view also supplies the required grazing-angle evidence);
- near handoff;
- far texture at night.

The tool fails rather than accepting a browser-scaled image, non-PNG payload, wrong canvas bounds, wrong drawing-buffer dimensions, or local runtime/request error.

Every capture stores measurements from the same normalized turf ROI (`x=0.20`, `y=0.55`, `width=0.60`, `height=0.35`). The manifest calculates daylight and overcast geometry-on/texture-only median-luminance ratios and records the `0.90–1.10` verdict.

The independent live-card regression gate reuses those pixel-aligned `height_050` pairs and samples the horizon/card strip at `x=0.05`, `y=0.35`, `width=0.90`, `height=0.08`. A pixel is darkened when its geometry-on luminance is below `0.70 ×` texture-only luminance and the absolute luminance drop exceeds `0.06`. The tool averages the darkened fraction across every three-row window and requires the maximum to remain at or below `0.10`. This spatial gate catches a thin dark card band that a broad median can miss.

The automated card-band gate samples the live field cards, where runtime card scale, placement, and LOD interaction are visible. The material fixture has no identical texture-only counterpart, so its atlas previews remain required human-review evidence rather than an automated pixel-pair gate. Both gate results are stored separately for both phases in manifest schema V2. A corrected after phase failing either gate is retained as evidence but returns a failing exit status.
