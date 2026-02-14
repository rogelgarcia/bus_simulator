# DONE
Summary: Building Fabrication can load a catalog building config into the scene with deterministic 3x2 placement and edit it via existing controls.

#Problem

Building Fabrication can author buildings and export configs, but it cannot load an existing building config from the catalog back into the fabrication scene for inspection/editing. This makes iterating on catalog buildings cumbersome (export → manually recreate → compare).

# Request

Add the ability to load an existing building config from the building catalog into the Building Fabrication scene, placing it onto a default 3x2 tile footprint using the “highest index” tiles in the current grid, and syncing the UI/state so it can be edited like a locally created building.

Tasks:
- Add a “Load building config” flow in Building Fabrication:
  - Provide a UI control to select a building config from the catalog (by id/name).
  - When a config is selected, instantiate that building in the fabrication scene and select it in the UI.
  - Ensure loaded buildings can be edited with the existing Building Fabrication controls (layers, materials, windows, etc.).
- Default placement footprint:
  - Place the loaded building on a 3x2 tile footprint.
  - Choose the tiles using the highest available indices/coordinates in the current grid (e.g., the far/top-right corner region), so the placement is deterministic and avoids overlapping the origin area.
  - If the current grid is too small for 3x2, handle gracefully (e.g., auto-increase grid size to fit, or show an error and do nothing).
- Preserve visual equivalence:
  - The loaded building should match the catalog config’s appearance (layers/materials/windows).
  - If the config includes legacy fields, the layer-based design must still be the source of truth when present.
- Keep existing flows intact:
  - Don’t break tile selection, road/building authoring, exporting, or deleting buildings.
  - Avoid unrelated refactors; keep changes scoped to adding the load-from-catalog feature.

Verification:
- Building Fabrication loads without console errors.
- Selecting a catalog building loads it into the scene on the correct 3x2 tile footprint (highest-index placement) and selects it in the UI.
- Editing the loaded building works with existing controls and updates the viewport as expected.
- Browser tests still pass (`tests/core.test.js`) and add a minimal test for the deterministic 3x2 “highest index” tile selection logic (pure logic, no DOM pointer events required).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_130_TOOLS_building_fabrication_load_existing_building_config_from_catalog`
- Provide a summary of the changes made in the AI document (very high level, one liner)
