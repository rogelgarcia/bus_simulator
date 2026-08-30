# Low-Cut Grass Material Family v1

> Historical V1 contract: later native-4K and zoomed visual review found color, physical atlas-scale, and mip-coverage defects. Preserve this file and its assets as completed AI 352 evidence, but use AI 358 and `LOW_CUT_GRASS_MATERIAL_V2.md` as the downstream appearance authority for AI 359 through AI 363.

## Approved scope

`pbr.grass_low_cut_maintained_v1` was the canonical far/top-down surface and cluster-atlas family for the V1 offline Grass Lab. AI 352 did not connect it to gameplay. V1 tiers consumed this identity rather than inventing unrelated grass colors or materials; corrective tiers must consume the stable V2 identity defined by AI 358.

The material is derived from ambientCG Grass 004 under CC0 1.0. The source's published physical footprint is retained as `1.4 × 1.4 m`; this replaces the old visually convenient `4 m` interpretation for this derived family. The authored blade profile remains `25–30 mm` high and `2.2–3.2 mm` wide.

## Asset contract

Assets live in `assets/public/pbr/grass_low_cut_maintained_v1/`:

| File | Role | Color space |
|---|---|---|
| `far_basecolor.png` | Far/top-down albedo, without baked lighting | sRGB |
| `far_normal_gl.png` | Short-blade normal detail | Linear |
| `far_ao.png` | Far ambient occlusion | Linear |
| `far_roughness.png` | Roughness remapped into the maintained-turf range | Linear |
| `far_height.png` | Height/displacement data | Linear |
| `far_coverage.png` | Micro-coverage cutout data consumed by the AI 354 hard grass surface | Linear |
| `cluster_atlas.png` | 4×2, eight-variant cluster base color plus alpha | sRGB + alpha |
| `cluster_normal_gl.png` | Cluster normal plus matching alpha | Linear + alpha |
| `cluster_roughness.png` | Cluster roughness plus matching alpha | Linear + alpha |
| `cluster_ao.png` | Cluster AO plus matching alpha | Linear + alpha |
| `grass_low_cut_maintained_v1.blend` | Inspectable deterministic bake source | Blender |
| `asset.manifest.json` | Hashes, roles, license, scale, profile, tool, and seeds | JSON |

The cluster atlas is one material path for eight variants. Its runtime contract uses an alpha cutoff of `0.35`, alpha-to-coverage when MSAA is available, trilinear mip filtering, clamp-to-edge atlas sampling, and `10 px` RGB dilation outside coverage. These rules prevent bright mip halos and reduce rapid card disappearance without transparent blending. AI 355 consumes all four atlas maps through the shared PBR payload in one global instanced cluster batch; `GRASS_AUTO_LOD_AND_CLUSTER_HANDOFF_V1.md` is the runtime handoff contract.

## Material response

The derived far surface reduces the source's uniform saturation and introduces deterministic dry-color variation. Roughness is stored separately and bakes to approximately `0.72–0.96`, so grazing light reads as cut fiber rather than smooth plastic. The normal remains a separate OpenGL normal map and retains short-blade structure.

The Lab material adds a bounded second albedo sample and stable world-space macro modulation. Defaults are:

- macro scale: `18 m`;
- macro strength: `0.13`;
- secondary scale: `1.071`;
- secondary blend: `0.38`.

This shader changes color response only. It does not displace vertices, expand coverage, move with the camera, or alter the grass footprint. The explicit compatible substrate is `pbr.forrest_ground_01`; the completed AI 354 contract in `GRASS_COVERAGE_AND_SIDEWALK_EDGE_V1.md` owns the hard occupancy boundary and raised carpet edge above it. Its surface uses `far_coverage.png` as an opaque alpha-tested micro cutout, never as a soft grass/substrate blend.

## Shared pipeline ownership

`LowCutGrassMaterialCatalog.js` registers the material family with the global `PbrMaterialCatalog`. Standard and auxiliary maps resolve through `PbrTextureLoaderService`, so URL resolution, physical tiling, calibration, and optional Lab-local response overrides preserve the global precedence contract. The Grass Lab contains no local texture loader.

## Deterministic generation

Run `tools/grass_material_baker/blender_bake.py` through Blender's Python environment. The checked-in recipe uses generation seed `grass-material-bake-v1` and authoring profile seed `maintained-turf-v1`. `asset.manifest.json` records Blender version, source file roles, output roles, SHA-256 hashes, dimensions, atlas policy, and both seeds.

## Grass Lab review

Open `debug_tools/grass_debug.html`, choose **Material**, and focus the fixture. Floor swatches are source Grass004, approved low-cut far surface, and substrate; the vertical board renders the single alpha atlas. Use Daylight, Overcast, and Grazing buttons to repeat the acceptance review. Reference captures are `tests/artifacts/screens/grass/ai352/daylight_material_fixture.png`, `overcast_material_fixture.png`, and `grazing_material_fixture.png`.
