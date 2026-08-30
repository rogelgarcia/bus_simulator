# Localized Grass Accents v1

## Scope

AI 356 adds a deliberately small localized accent layer to the canonical Grass Lab. It does not replace the AI 353 area-patch carpet, extend the AI 355 geometry cutoff, or modify gameplay. `localized_tufts` is consumed only for explicit tree and worn-feature placement records.

## Placement contract

`GrassLocalizedAccentContract.js` accepts the city tree generator record shape: `x`, `y`, `z`, `rotation`, `scaleVar`, and `variant`. A Lab-only `id` may accompany the record for diagnostics. The canonical fixture contains four tree records plus one explicit optional worn-area feature; no boundary automatically receives accents.

Every candidate root is deterministic for the Lab seed, profile seed, source record, and variant. The contract queries AI 354's binary coverage and `accentEligibility` before emitting a root. Tree rings begin outside the scaled trunk radius, so no card is placed inside a trunk. Roads, sidewalks, irregular exclusions, disabled coverage, and disabled accent eligibility reject placement regardless of humidity, dryness, or biome response.

The canonical defaults are:

| Control | Default |
|---|---:|
| Clusters per tree | `4` |
| Grass triangles per visible tree | `8` |
| Ring inner / outer radius | `0.82 / 1.25 m`, scaled by `scaleVar` |
| Worn substrate radius | `0.76 m`, scaled by `scaleVar` |
| Accent card | `0.24 × 0.075 m` |
| Optional feature clusters | `3` |

The `3-6` clusters-per-tree sanitizer keeps the grass geometry between `6-12` triangles per tree. The default remains eight.

## Rendering contract

`GrassLocalizedAccentSystem` owns exactly two global instanced batches:

1. one single-card accent batch for every visible eligible tree and optional feature;
2. one low-poly circular worn-substrate batch for every eligible tree.

The grass batch shares the AI 355 `pbr.grass_low_cut_maintained_v1` cluster-atlas material and its eight variants, four PBR maps, `0.35` alpha test, alpha-to-coverage, mip, clamp, opacity, and no-shadow policy. Per-instance color supplies a bounded drier tint without adding materials. The worn batch resolves `pbr.forrest_ground_01` through `PbrTextureLoaderService`, then applies a darker, rough response. It uses `18` triangles per tree and one draw for all trees.

Accent grass follows the automatic near-tier distance/angle mask and hysteresis, so it disappears into the maintained surface before the AI 355 cutoff. Worn substrate is ground detail rather than grass geometry and remains batched. Both meshes retain computed instance bounds and frustum culling; neither casts nor receives shadows.

## Determinism and diagnostics

The Lab's **Tree accents** tab exposes the eligibility toggles, bounded ring dimensions, card size, repeatable tree and optional-feature cameras, and the following diagnostics:

- source and eligible tree records;
- potential and visible cluster counts;
- grass and worn triangles/draws;
- grass triangles per tree;
- deterministic layout signature;
- coverage/trunk rejections;
- culling, shadow, opacity, and cutoff safety.

At the canonical tree camera on 2026-08-29, one tree contributes `4` visible clusters, `8` grass triangles, and one shared atlas draw. Four worn patches contribute `72` triangles through one shared substrate draw. The deterministic signature is `grass-accents-v1-4686ae3a`, all roots are eligible, and zero grass accents exist beyond the automatic cutoff.

Reference captures:

- `screens/grass_ai356/tree_base_before_localized_accents.png`
- `screens/grass_ai356/tree_base_after_localized_accents.png`

## Downstream ownership

AI 357 historically owned V1 presets, motion reviews, budget approval, and visual regressions for this layer. AI 359 owns the corrected substrate exclusion, AI 361 owns V2 accent rendering reconciliation, AI 362 owns current approval, and AI 363 alone may adapt the approved tree placement records and renderer to gameplay.
