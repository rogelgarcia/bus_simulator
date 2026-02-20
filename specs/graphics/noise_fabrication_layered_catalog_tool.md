# Noise Fabrication Layered Catalog Tool Spec

## Scope
- Tool: `noise_fabrication`
- State model version: `2`
- Authoring mode: layered stack with catalog-driven noise selection
- Export mode in this scope: recipe JSON only (no baked map file export)

## Performance Limits
- `maxLayers = 8`
- `maxResolution = 1024`
- Sanitization behavior when exceeded:
  - Clamp values to limits
  - Emit visible warning text in tool status
  - Keep deterministic generation output

## Catalog Contract (Authoritative Source)
The picker must read entries from a dedicated catalog source (`NoiseFabricationCatalog.js`) only.

Each catalog entry includes:
- `id`
- `generatorId`
- `displayName`
- `shortDescription`
- `usageExample`
- `hoverDetails`
- `mixGuidance`
- `mapTargetHints.normal`
- `mapTargetHints.albedo`
- `mapTargetHints.orm`
- `defaultPresetId`
- `defaultLayerTarget`

No implicit generator-metadata fallback is used for picker population.

## Layer Model
Each layer contains:
- `id`
- `noiseId`
- `generatorId`
- `name`
- `description`
- `presetId`
- `blendMode`
- `strength`
- `lock`
- `solo`
- `mapTarget` (`normal`, `albedo`, `orm_ao`, `orm_roughness`, `orm_metalness`)
- `transform` (`space`, `scale`, `rotationDeg`, `offsetU`, `offsetV`)
- `params` (generator-specific parameter model)
- `execution`:
  - `mode` (`auto`, `manual`)
  - `manualPath` (`shader`, `texture_baked`, `hybrid`)
  - `dynamicRuntime` (boolean)
  - `largeScaleWorld` (boolean)

Coordinate-space support in this scope:
- `transform.space = "uv"` only
- World-space transforms are unsupported and sanitized back to UV with warning

## Execution Path Checker
Each layer receives a checker recommendation for runtime path selection:
- `shader`
- `texture_baked`
- `hybrid`

Checker signals:
- Dynamic runtime flag (`execution.dynamicRuntime`)
- Dynamic propagation (once a dynamic layer appears, later layers default to shader unless explicitly overridden)
- High-frequency detail score/classification
- Large-scale/world-use score/classification
- Static-cost score/classification

Override semantics:
- Layer-level manual override remains available and authoritative when `execution.mode = manual`.
- Export decision-assistant overrides can adjust final per-layer path for export metadata without mutating generator math.

## Picker Semantics
- Selecting from `+` tab mode creates a new layer from catalog defaults.
- Selecting while an existing layer tab is active replaces that layer's noise implementation.
- Add defaults:
  - `preset = catalog defaultPresetId`
  - `name = <displayName> <index>`
  - `blendMode = normal`
  - `strength = 1.0`
- Replace defaults:
  - Preserve `name`, `description`, `blendMode`, `strength`, `mapTarget`, and `transform`
  - Apply new catalog default preset/params for the replacement generator

## Blend Modes and Deterministic Evaluation
Evaluation order is strictly left-to-right tab order.

Blend math (`dst` = accumulated signal, `src` = layer signal, `a` = layer strength):
- `normal`: `mix(dst, src, a)`
- `add`: `clamp01(dst + src * a)`
- `multiply`: `mix(dst, dst * src, a)`
- `screen`: `mix(dst, 1 - (1 - dst) * (1 - src), a)`
- `subtract`: `clamp01(dst - src * a)`
- `max`: `max(dst, src * a)`
- `min`: `mix(dst, min(dst, src), a)`

All outputs are clamped to `[0, 1]`.

## Export Contract
Recipe export contains:
- Full layered state
- Per-map-target export scope
- Explicit ORM packing
  - `R = AO`
  - `G = Roughness`
  - `B = Metalness`
- Baked-map availability metadata (`available = false` in this scope)
- Execution checker scope:
  - Questions (`dynamicSceneContext`, `largeWorldContext`, `preferBakedPerformance`)
  - Per-layer recommended/final path, flags, and scores
- Optional `executionDecisionAssistant` object with confirmed export-time decisions

Validation rules:
- If Normal export is enabled, at least one `normal` target layer is required.
- If Albedo export is enabled, at least one `albedo` target layer is required.
- If ORM export is enabled, each channel source list must be non-empty:
  - AO (`orm_ao`)
  - Roughness (`orm_roughness`)
  - Metalness (`orm_metalness`)

## Migration
Legacy v1 single-generator recipes are imported by converting to one v2 layer:
- Preserve legacy generator and parameters
- Resolve preset when available
- Initialize layered fields with defaults
- Emit migration warning in status

## Minimum Validation Coverage
Node unit coverage includes:
- Catalog schema and generator alignment
- Layer stack actions (`add`, `replace`, `duplicate`, `rename`, `lock`, `solo`, reorder)
- Layer-mix determinism and order sensitivity
- Export determinism and ORM validation
- Execution checker behavior:
  - Dynamic propagation
  - Static + expensive classification to baked
  - High-frequency classification
  - Large-scale/world-space classification
- Legacy-to-layered migration
- Import/export generation roundtrip compatibility
