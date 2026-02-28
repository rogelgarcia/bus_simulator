# DONE

# Problem

Rounded cornice rendering currently appears faceted/hard-shaded because it is composed from multiple straight block segments. The same visual issue applies to curved ring decoration when segment-based construction is used.

# Request

Switch rounded decorator generation to a continuous curved mesh strategy to produce smooth shading and cleaner curved silhouettes.

Tasks:
- Update `Cornice Rounded` decorator geometry generation to use continuous curved mesh construction instead of segmented straight blocks.
- Preserve existing parameter behavior, placement behavior, and overall silhouette intent while changing only the mesh construction strategy.
- Ensure the continuous mesh uses smooth shading-ready topology (no visible per-segment hard breaks under normal lighting).
- Apply the same continuous curved mesh strategy to the `Curved Ring` decorator.
- Keep corner/placement compatibility and avoid regressions in existing wall decorator workflows.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_446_BUILDINGS_wall_decorators_use_continuous_curved_mesh_for_cornice_rounded_and_curved_ring_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_446_BUILDINGS_wall_decorators_use_continuous_curved_mesh_for_cornice_rounded_and_curved_ring_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Change Summary
- Reworked `Cornice Rounded` generation from per-block segmented specs to continuous span specs per active face while preserving placement and spacing-derived footprint behavior.
- Updated rounded renderer geometry to a continuous curved extrusion path (`cornice_rounded_continuous`) with curvature mode support (`Convex`/`Concave`) and smooth-shading-ready indexed topology.
- Updated `Curved Ring` mesh construction to use continuous indexed curved topology with smooth normals and preserved wall-cap removal + corner miter behavior.
- Kept corner/placement compatibility and preserved existing wall decorator workflows by maintaining existing mode/position semantics and spacing/snap influence.
- Added/updated catalog, renderer, and specification coverage to validate continuous curved mesh behavior and prevent regressions.
