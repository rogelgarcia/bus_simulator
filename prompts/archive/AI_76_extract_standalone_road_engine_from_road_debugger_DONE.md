# Problem [DONE]

The Road Debugger currently contains (or directly owns) the logic that computes and draws roads. This couples the road construction logic to a specific screen/scene and makes it hard to reuse the same road engine in other scenes (city debugger, gameplay, future tools).

Additionally, constants are currently mixed: some values are true “world parameters” (tile size, world scale) while others are road-specific defaults/derived values (lane width usage, asphalt margin rules, derived widths). This makes it unclear which scene owns which configuration.

# Request

Refactor the Road Debugger so the road construction logic is implemented as a **standalone road engine** that can be reused by any scene. The Road Debugger scene/view should become a debugger UI for that engine (inputs + visualization), not the owner of the core road logic.

Tasks:
- Split the standalone road engine into two distinct parts/modules:
  - **(1) Road edges computation**: pure/mostly-pure math that derives centerlines, per-direction offsets, lane edges, asphalt edges, junction/connectors topology, trimming/splitting intervals, and telemetry/debug artifacts. This module must not allocate/render Three.js meshes.
  - **(2) 3D geometry/mesh generation**: takes the computed edge/topology outputs and produces renderable 3D mesh data (e.g., triangulated asphalt surfaces, junction surface meshes, debug mesh primitives). This module must not contain editor/UI state and should be reusable by any renderer/scene.
- Extract the current road computation logic into a reusable module in `src/app/` (standalone “road engine”), separate from any Road Debugger scene/UI code.
- Define a clear public API for the road engine that:
  - Accepts **world parameters** as inputs (passed in by the scene), such as tile size/world scale and any other global world sizing needed for computations.
  - Does not directly depend on Road Debugger UI state, DOM, or rendering-layer concerns.
  - Returns the road-specific computed outputs needed by renderers/debuggers (derived geometry, segment data, edge lines, asphalt outlines/meshes data, junction/connectors data when applicable, telemetry/debug artifacts when enabled).
- Configuration ownership rules:
  - If a constant is a world parameter (e.g., base tile size/world units) that multiple systems must agree on, it must be passed into the engine as a parameter.
  - Road-specific defaults and derived values (lane width usage, asphalt margins, near-overlap thresholds, derived half-widths, styling-relevant derived widths) must be produced by (or sourced from) the road engine so other scenes can reuse consistent road behavior.
- Update the Road Debugger to consume the engine API:
  - Road Debugger keeps editor state (selection, hover, UI toggles, undo/redo stacks) and passes the necessary inputs into the engine.
  - Road Debugger renders using the engine outputs (no duplicated road math inside the scene/UI).
  - No behavior regressions: existing Road Debugger features should keep working the same.
- Ensure the engine can be reused by other scenes without pulling in Road Debugger UI code:
  - Other scenes should be able to import the engine and feed it data/config to get consistent road outputs.
- Keep code organization aligned with repo rules:
  - Application/logic in `src/app/`.
  - Rendering/UI in `src/graphics/`.
  - Avoid adding rendering-specific dependencies to the engine layer.
- Add/adjust minimal tests or browser-run assertions (following existing project patterns) to validate that:
  - Given the same inputs, the engine outputs are deterministic.
  - Export/import round-trips still produce equivalent engine outputs when fed back in.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_76_extract_standalone_road_engine_from_road_debugger_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Moved RoadDebuggerPipeline math into reusable `src/app/road_engine/` compute+mesh-data modules and updated Road Debugger to consume the standalone engine.
