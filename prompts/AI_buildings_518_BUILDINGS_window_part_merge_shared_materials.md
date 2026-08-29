# Problem

After the per-building geometry merge (BuildingGeometryMerger, used by City on
load and by BF2's "Compile (game preview)" toggle), the remaining draw calls
are almost all WINDOW PARTS. Measured on bradbury_block (2026-08-28):

- Building merges 612 → 31 meshes, 358 → 29 materials. What stays: ~380
  window-part meshes (78 frame, 66 glass, 66 shade, 65 parallax interior,
  61 muntins, 44 sills, 5 handles) — one mesh per part per window.
- BF2 editor with the always-on merged shadow caster: 3227 calls authoring,
  1484 compiled (game parity), FPS 2 → 29 under SwiftShader. The window parts
  are most of the remaining 1484.

Two deliberate blockers keep them unmerged:

1. **Scope**: every window assembly group carries userData (`settings`,
   `ownedGeometries`, `materials`, `geometryKey`, `buildingWindowSource`,
   `windowDefinitionId`, `windowAssetType`, `instanceVariations`), so the
   merger's `preserveGroupsWithUserData` keeps each assembly its own merge
   scope. That userData is the disposal lifecycle + the hook game systems use
   to find windows (night window lighting, per-window state).
2. **Materials**: `createWindowMeshMaterials` builds a fresh material set per
   assembly. Frame/muntins/glass/handles/sills are plain standard materials
   (bevel normal textures already cached/shared) — the merger's identity
   dedup would collapse them if the scopes allowed. Shade and parallax
   interior are custom-shader materials with per-window uniforms
   (`window_shade_v2`, `window_interior_v4`: atlas cell, openness) — sharing
   an instance today would make every window identical.

# Desired feature

Merge window parts per building without losing per-window behavior:

1. **Attribute-driven variation**: move the shade/interior per-window uniforms
   (atlas cell offset, shade openness, night-lit state) into per-vertex
   attributes (or an instance-id attribute + small uniform arrays / a data
   texture), so one shared material can render every window of a def.
2. **Shared material sets per def**: cache `createWindowMeshMaterials` output
   keyed by the sanitized settings, so assemblies of the same def share
   instances — meshes sharing an instance merge even without identity dedup.
3. **Merge-friendly scopes**: after (1) and (2), let the merger flatten window
   assembly groups — either an allowlist of authoring-only userData keys, or
   the window builder emitting a "mergeable" marker — while keeping whatever
   handle the night-lighting/game systems actually need (likely a per-window
   record with a merged-range index instead of a live group).
4. **Night windows keep working**: whatever drives lit windows at night must
   address windows inside merged meshes (attribute/range-based), not
   per-window materials.

# Acceptance

- bradbury_block compiled: window parts collapse to ~a dozen meshes (one per
  material family, plus whatever genuinely cannot share); compiled calls
  drop well under 1000 in the BF2 header; no visual change (viewport
  pixel-diff ≤ 0.1%).
- Night window lighting still varies per window in-game.
- BF2 authoring mode unaffected (parts stay individual for picking/debug);
  the Compile toggle reflects the improvement automatically.
