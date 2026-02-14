#Problem [DONE]

Road junctions need to support curved/rounded behavior consistently across:
- Simple bends (2-way junctions between two connectors of the same road)
- T junctions (3-way)
- Crossings with 4, 5, 6+ incident roads

Currently the system has multiple curve-related capabilities (TAT/fillets for polylines and Dubins-based connector solving), but junction geometry needs a unified, robust strategy that scales to arbitrary junction degree without special-casing per N.

# Request

Implement curved junctions using a unified strategy:
1) Build a junction surface footprint (asphalt polygon) from incident road offsets.
2) Round/shape junction corners using circular fillets (TAT/fillet arcs) with a consistent radius policy.
3) Defer lane/curb/marking connector work for a later task (this prompt focuses on asphalt junction surfaces only).

Tasks:
- Determine how junctions are represented in the current road pipeline (RoadNetwork nodes + incident edges) and implement junction shaping on top of that representation.
- For every junction node (degree >= 2):
  - Compute the incident road “mouth” boundaries using each road’s direction + half-width (asphalt only; do not implement curbs/lanes yet).
  - Construct a watertight junction asphalt footprint polygon that merges the incident road strips into a single surface:
    - Must work for degree 2 (bend), 3 (T), and N>=4 (multi-way intersections).
    - Avoid self-intersections; handle near-parallel/colinear cases robustly.
  - Apply circular fillet corner rounding to the junction footprint corners using a single consistent fillet primitive:
    - Use a configurable radius policy (global default + optional per-road/per-junction overrides).
    - Fillets must be tangent-continuous relative to adjacent boundary segments.
    - Keep the rounding consistent across all degrees (2/3/4/5/6+).
- Degree-2 junctions (same road bend):
  - Treat as a junction surface with two mouths and generate a rounded join using the same fillet logic (no special bespoke curve type).
- Road mesh generation integration:
  - Update asphalt mesh generation to use the new junction surface polygon (instead of sharp/mitre-only joins).
  - Ensure UVs remain stable (world-space UV recommended) and that normals are correct.
- Do not update curbs, sidewalks, lanes, or markings in this task; asphalt surface only.
- Configuration and controls:
  - Add/extend road settings to control:
    - `junctions.enabled`
    - `junctionFilletRadius` (or equivalent), including defaults and limits
    - any radius fallback policy needed for tight geometry
  - Ensure settings can be inspected/edited via existing road debugger tooling where applicable.
- Backwards compatibility:
  - Existing roads/junctions should still render if the new junction feature is disabled.
  - When enabled, behavior should improve without breaking road topology or traffic control placement.
- Verification:
  - Visual: bends, T junctions, and 4/5/6-way crossings show rounded corners with no gaps/overlaps.
  - Robustness: no NaNs, no console errors, no exploded geometry at near-parallel or tight junctions.
  - Determinism: same input map/spec produces identical junction geometry across runs.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_142_ROADS_unified_junction_surfaces_with_fillet_corners_and_optional_dubins_connectors`
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Summary
Implemented filleted/rounded asphalt-only junction surface polygons in the Road Engine pipeline and exposed a junction fillet radius control in the Road Debugger UI.
