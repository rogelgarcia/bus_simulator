# Grass Auto-LOD and Cluster Handoff v1

## Runtime contract

AI 355 completes the Grass Lab field handoff without changing gameplay. `GrassEngine` owns three representations of one maintained lawn:

| Effective range | Representation | Default cost shape |
|---|---|---|
| `0-9 m` | AI 353 near carpet patches | deterministic `1 m` instanced patches |
| `9-30 m` | atlas-backed mid clusters | one global instanced batch, two crossed cards per `2 m` patch |
| `30 m+` | AI 352/354 PBR coverage surface | texture only; zero grass geometry |

Distance is measured on the ground plane and multiplied by a view-angle scale. The default scale progresses from `0.8` for grazing views to `1.2` for top-down views. Consequently the `30 m` effective cutoff is approximately `37.5 m` in a grazing view and `25 m` from above. Automatic selection is canonical. Manual near, cluster, and texture forcing remains a bounded diagnostic override and never puts geometry beyond the cutoff.

## Stable transition policy

LOD is evaluated per near patch or cluster patch, never per blade. A deterministic sample derived from the patch key masks instances through each `2 m` transition band. Retained patches receive a bounded `0.75 m` hysteresis bias, preventing camera-cell motion from repeatedly adding and removing the same patch. Both geometry tiers remain opaque and depth-writing; transitions change instance occupancy rather than applying blended transparency or broad alpha overdraw.

The far PBR surface is always present below the geometry, so a removed instance reveals the same maintained-grass color, normal, roughness, AO, density, and dryness response. AI 354's binary footprint is not dithered: roads, sidewalks, corners, and irregular substrate exclusions remain hard physical cuts throughout the handoff.

## Mid-cluster geometry and material

`GrassMidClusterSystem` renders one `THREE.InstancedMesh` and one shared `MeshStandardMaterial`. The default `2 m` patch contains two intersecting `1.15 m × 55 mm` cards, totaling four triangles. Each patch gets deterministic yaw, scale, brightness, and one of eight variants in the canonical `4 × 2` atlas. Frustum culling remains enabled, instance bounds are recomputed after writes, and clusters neither cast nor receive shadows.

The Lab obtains the material family through `PbrTextureLoaderService` using `pbr.grass_low_cut_maintained_v1`. The one material consumes the shared payload's auxiliary `cluster_atlas.png`, `cluster_normal_gl.png`, `cluster_roughness.png`, and `cluster_ao.png`. All maps use matching atlas-cell UVs, clamp-to-edge wrapping, generated mipmaps, trilinear minification, linear magnification, a `0.35` alpha test, alpha-to-coverage when MSAA is available, and opaque rendering.

## Coverage and diagnostics

The AI 354 exclusion rectangles are expanded by `0.621 m`, the largest half-extent required by the near patch or rotated cluster card. Cluster roots and complete near patches therefore remain outside road, sidewalk, and irregular substrate areas.

The Lab reports the active representation, focus distance, view angle and effective distance scale, transition state, near and cluster instances/triangles/draws, atlas material state, and actual geometry found beyond the cutoff. Repeatable **Grazing**, **Top-down**, and **Past cutoff** cameras are part of the Cluster LOD panel.

### AI 355 reference observation

At the canonical default camera on the 2026-08-29 WebGL2 RTX 3060 lab environment, the system displayed `34` near patches (`1,632` blade instances, `1,632` triangles, `3` chunk draws) and `591` mid clusters (`2,364` triangles, `1` draw). The total field geometry was `3,996` triangles through `4` logical grass draws. A grazing inspection produced `725` clusters; a top-down inspection produced `386`; the **Past cutoff** focus resolved to texture only. All three checks reported zero grass geometry beyond the configured effective cutoff. Timing is hardware-dependent and remains a supporting observation rather than a universal gate.

## Scope and next owner

This V1 contract is Lab-only and historical for downstream work. AI 356 added bounded localized accents through `LOCALIZED_GRASS_ACCENTS_V1.md`; its grass cards consumed the automatic near mask and did not replace or extend these field tiers. Corrective AI 361 owns the V2 hierarchy and handoffs, AI 362 owns current approval, and AI 363 is the only phase authorized to attach that approved runtime to gameplay.
