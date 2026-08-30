# Low-Cut Grass Profile v1

## Purpose and scope

`bus-simulator.low-cut-grass-profile` version 1 is the canonical deterministic input shared by Grass Lab authoring, later offline bakes, and lightweight runtime derivation. AI 351 does not attach this profile to gameplay.

The default maintained-turf target is `25–30 mm` high and `2.2–3.2 mm` wide. These dimensions describe the visible blade silhouette; a substrate/far-surface material remains responsible for most carpet coverage.

## Contract

The public implementation is `src/graphics/engine3d/grass/LowCutGrassProfile.js`. A serialized profile contains:

- `schema`, `version`, `profileId`, and `seed` identity fields;
- blade height and width ranges;
- bend, inclination, and curvature means plus bounded variation;
- base/tip colors, color variation, dryness, and humidity;
- an `area_patch` carpet recipe;
- a separate `localized_tufts` accent recipe.

Import requires the exact schema and supported version, then sanitizes all numeric and color inputs. Export serializes the sanitized shape with stable key order. Identical serialized profile, seed, fixture blade count, and fixture patch size reproduce identical blade descriptors and the same `grass-source-v1-*` signature.

## Authoring-to-runtime derivation

| Stage | Representation | Intended use |
|---|---|---|
| Authoring source | `mesh.soccer_grass_blade_hires.v1`, 18×26 segmented procedural surface | Lab inspection and later offline texture/atlas baking only |
| Runtime silhouette source | Adapted low-resolution `mesh.soccer_grass_blade.v1` outline | Stable physical dimensions and bend direction |
| Derived runtime blade | One indexed triangle, vertex colors, one material slot, no geometry groups | Instanced near/patch representations in later phases |

The high-resolution blade is instantiated only in the Lab's small 24-blade Authoring fixture. It is hidden outside the Authoring tab and is never repeated across the live GrassEngine field. Runtime data contains no high-resolution segment, prefab, or authoring-only parameters.

Base and tip color are expressed through vertex colors on the one runtime material path. Dryness and humidity deterministically derive roughness, saturation, and brightness response; they do not require extra materials or draw groups.

## Carpet versus accents

`carpet.layout` is fixed to `area_patch`. It owns field density, patch size, coverage, and subtle clumpiness. It must not be interpreted as one tuft instance per lawn placement.

`accents.layout` is fixed to `localized_tufts`. It owns enabled state, blades per tuft, radius, and density multiplier for tree bases, worn areas, and eligible boundary irregularities. AI 356 consumes this recipe through `LOCALIZED_GRASS_ACCENTS_V1.md`; AI 351 does not distribute these accents across the field.

## Grass Lab workflow

Open `debug_tools/grass_debug.html`, select **Authoring**, and focus the comparison fixture. Edit the profile, inspect the high-resolution source beside its derived runtime form, then:

1. Save to browser storage to verify deterministic reload.
2. Export canonical JSON for asset/bake provenance.
3. Import only schema/version-compatible JSON.
4. Compare the source geometry hash and stable signature after reload.

`window.__grassLab` exposes `getAuthoringProfile()`, `exportAuthoringProfile()`, `saveAuthoringProfile()`, and the existing snapshot API. Snapshot authoring diagnostics include source triangle/hash/signature data and the runtime triangle/material/group/draw contract.

## Downstream ownership

- AI 352 completed the `pbr.grass_low_cut_maintained_v1` far surface and one-path cluster atlas documented in `LOW_CUT_GRASS_MATERIAL_V1.md`.
- AI 353 completed efficient area-patch placement and batching in `NEAR_GRASS_CARPET_PATCH_V1.md`.
- AI 356 implements localized use of the accent recipe in `LOCALIZED_GRASS_ACCENTS_V1.md`.
- AI 363 is the only phase allowed to connect the AI 362-approved V2 result to gameplay; AI 358 now owns corrective material assets.
