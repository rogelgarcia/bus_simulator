# Mesh Fabrication Architecture

## Scope
Mesh fabrication runtime modules under `src/graphics/gui/mesh_fabrication/` are organized into explicit layers so UI and geometry logic can evolve independently while preserving deterministic topology IDs.

## Folder Ownership
- `ui/`: DOM controls and toolbar composition only.
- `view_state/`: viewport/layout/interaction UI state.
- `mesh_state/`: loaded source, parsed topology, sync/runtime mesh state.
- `file_loader/`: endpoint resolution, transport polling, payload parser/validator coordination.
- `render_passes/`: pass-level rendering orchestration (`surface`, `wire`, `vertices`, `gizmos`, `rulers`, `highlights`).
- `picking/`: raycast threshold setup, tile hit location, hit ranking.
- `primitives/`: primitive compiler registry and primitive-specific compile entrypoints.
- `operations/`: stage APIs for extrude/boolean flows.
- `command_pipeline/`: parse/normalize/execute/audit stage boundaries.
- `validators/`: reusable boundary assertions and deterministic error formatting.
- `math/`: shared vector/polygon/quantization helpers.
- `errors/`: stable error codes + UI message mapping.
- `id_policy/`: deterministic canonical id helpers.

## Dependency Direction
1. `math/`, `errors/`, `validators/`, `id_policy/` are foundational.
2. `primitives/`, `operations/`, `command_pipeline/`, `file_loader/`, `picking/`, `render_passes/` depend only on foundational modules and external libs.
3. `mesh_state/` and `view_state/` depend only on foundational modules.
4. `MeshFabricationView` composes all feature modules and should not re-implement stage logic.
5. `ui/` modules depend on shared UI helpers and receive callbacks from `MeshFabricationView` (no geometry/kernel access).

## Contracts
- Command pipeline stage order: `parse -> normalize -> execute -> audit_log`.
- Boolean stage order: `input conversion -> kernel invocation -> regrouping -> deterministic remap -> topology validation`.
- File loader stage order: `source resolve -> fetch transport -> parser/validator -> sync store update -> view callback`.
- Deterministic IDs are produced by `id_policy/` helpers and never by ad-hoc UI code.

## Testing Expectations
- Unit tests cover each module folder contract.
- Fixture/golden tests assert stable topology IDs and canonical mapping from deterministic inputs.
- Loader tests run headless (no `MeshFabricationView` requirement).
