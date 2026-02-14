# DONE

#Problem

The project currently uses the term “skeleton” for multiple different concepts:
- True skinned mesh skeletons (bone hierarchies)
- Runtime-controllable mesh/material state (e.g., traffic light head state)
- Construction-time parameters that change geometry/layout (e.g., traffic light arm length)
- Composed meshes that expose child controls on a parent “skeleton”

This naming and conceptual overlap makes the system hard to reason about, hard to extend, and confusing in the mesh inspector/UI (what is editable live vs what requires rebuilding).

# Request

Refactor the “skeleton” system into clear, first-class concepts with consistent interfaces so both buses and procedural/composed meshes can expose:
- construction-time prefab parameters (rebuildable),
- runtime rig controls (applyable live),
- and a discoverable schema for the inspector to generate controls.

Tasks:
- Introduce first-class concepts (and consistent naming) across the codebase:
  - `Prefab` (template for creating a model/mesh instance)
  - `PrefabParams` (construction parameters that may require rebuild/re-layout)
  - `Rig` (runtime controllable interface attached to an instance)
  - `RigSchema` (static schema describing rig properties, types, enums/ranges, defaults; used by UI generation)
  - `RigState` (current runtime values for the rig)
  - Optional: `RigBinder`/`RigAdapter` (bind a rig to a concrete mesh/material instance by resolving node/material references)
- Update naming to avoid “skeleton” where it does not mean an actual skinned skeleton:
  - Keep “Skeleton” terminology only for true bone/skinning cases (Three.js skeleton).
  - Migrate existing “skeleton” usages for procedural meshes (e.g., traffic light head) into `Rig`/`RigSchema`/`RigState`.
- Separate construction-time vs runtime controls:
  - Move geometry/layout-affecting settings (e.g., traffic light arm length) into `PrefabParams`.
  - Ensure changing `PrefabParams` triggers a rebuild/re-layout of the prefab (with a clear UX path in the inspector).
  - Keep live state (e.g., traffic light `signal` enum) as `RigState` changes applied without rebuilding.
- Composition support as a first-class feature:
  - Implement a `CompositeRig` (or equivalent) that can expose child rigs under namespaced groups (e.g., `head.signal`) and optionally provide parent-level aliases (e.g., `signal`).
  - Ensure the inspector can display nested rigs clearly (groups/collapsible sections) and still allow parent-level shortcuts where useful.
- Mesh Inspector integration:
  - Update the mesh inspector to consume `RigSchema` and generate appropriate UI controls based on data types (enums, numbers with ranges, booleans, etc.).
  - Add a dedicated “Construction / Prefab Params” section that edits `PrefabParams` and triggers rebuild.
  - Add a dedicated “Runtime / Rig Controls” section that edits `RigState` and applies live.
  - Ensure composed meshes expose children controls as groups, with clear labels.
- Backward compatibility / migration:
  - Provide a minimal migration layer so existing models using the current “skeleton” API keep working during the transition (or are migrated in-place with minimal churn).
  - Ensure existing debug scenes (mesh inspector, road/city debuggers, gameplay bus models) still load and behave correctly after the refactor.
- Documentation and clarity:
  - Update any internal docs/help panels that refer to “skeleton” to use the new terminology (rig/prefab params/schema/state).
  - Ensure any IDs/types used by the inspector are stable and deterministic.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_91_DONE_MESHES_rig_prefab_schema_first_class_refactor`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Introduced first-class prefab params + rig schemas (with composite rigs) and migrated traffic light controls + mesh inspector and bus rigs away from overloaded “skeleton” terminology.
