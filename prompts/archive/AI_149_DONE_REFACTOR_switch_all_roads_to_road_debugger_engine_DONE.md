# DONE

#Problem

The project currently has two separate road generation/rendering “engines” used across different parts of the app. Gameplay and some screens still rely on the older road system, while the Road Debugger uses a newer road engine/pipeline. This causes inconsistent visuals/behavior, duplicated logic, and makes it harder to evolve roads because fixes/features need to be implemented twice.

## Current observed road generation paths (2–3)

- **Road Debugger engine (“RoadEngine”)**: `src/app/road_engine/RoadEngineCompute.js` (`computeRoadEngineEdges`) used directly by `src/graphics/gui/road_debugger/RoadDebuggerView.js`.
- **Gameplay / most screens (“RoadGenerator”)**: `src/graphics/assets3d/generators/RoadGenerator.js` (`generateRoads`) used by `src/app/city/City.js` and `src/graphics/gui/building_fabrication/BuildingFabricationScene.js`.
  - This code path uses **road2/centerline** when `map.roadNetwork` exists (`src/graphics/assets3d/generators/road2/CenterlineRoadGenerator.js`), otherwise it falls back to a **legacy** tile-based renderer (`generateRoadsLegacy(...)`).
- **Map Debugger direct usage**: `src/states/MapDebuggerState.js` calls `generateRoadsFromRoadNetwork(...)` directly for road draft preview rendering.

Net: there are currently multiple road geometry/rendering stacks in runtime (RoadEngine vs road2/centerline vs legacy fallback).

# Request

Make the Road Debugger road engine/pipeline the single source of truth for roads across the entire project.

Tasks:
- Ensure gameplay and every screen/state that renders roads uses the same road engine/pipeline currently used by the Road Debugger.
- Fully disconnect the older road systems from gameplay and all other screens (they may remain in the repo temporarily, but must not be used by runtime code paths):
  - `src/graphics/assets3d/generators/RoadGenerator.js` (including its `generateRoadsLegacy(...)` fallback)
  - `src/graphics/assets3d/generators/road2/CenterlineRoadGenerator.js` (including any direct calls from states like Map Debugger)
- Unify the road data model so road specs/configs used by gameplay match what the Road Debugger engine expects (including any necessary conversions when loading older specs).
- Keep road-related debug tooling working (Road Debugger remains functional) and ensure other screens that depend on road visuals continue to function.
- Preserve or improve road rendering parity compared to the Road Debugger (lanes, curbs, sidewalks, intersections, debug overlays where applicable).
- Ensure performance remains acceptable for typical city sizes.
- Add minimal browser-run tests to validate that the “global road path” uses the Road Debugger engine (RoadEngine) and that a representative map/spec produces expected road outputs without falling back to the old/legacy engines.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_149_DONE_REFACTOR_switch_all_roads_to_road_debugger_engine_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added a shared RoadEngine road renderer for non-debug scenes (`src/graphics/visuals/city/RoadEngineRoads.js`).
- Added a CityMap → RoadEngine schema adapter (`src/app/road_engine/RoadEngineCityMapAdapter.js`).
- Switched City/gameplay, Building Fabrication, and Map Debugger draft previews to the RoadEngine renderer (removed runtime usage of `RoadGenerator.js` / `CenterlineRoadGenerator.js`).
- Added browser-run tests validating the global road path is RoadEngine-based (`tests/core.test.js`).
