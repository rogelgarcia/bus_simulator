# DONE
#Problem

The `AI_00_REPORT_modularization_specificity_audit.md` identifies several high-impact modularization violators where generic or mixed layers contain variant-specific branching, embedded asset IDs/paths, and/or dependency-direction violations (generic importing specific). This causes specificity leakage, duplicated mapping logic, and makes adding new variants harder.

Top targets to fix include:
- `src/graphics/engine3d/buildings/WindowTextureGenerator.js` (generic layer importing `src/app/buildings/WindowStyle.js` + heavy branching)
- `src/graphics/visuals/city/TrafficControlProps.js` (generic visuals hardcoding kind->mesh mapping + rig internals)
- `src/graphics/visuals/city/CityConnectorDebugOverlay.js` (generic visuals importing sampling from `assets3d`)
- `src/graphics/assets3d/generators/buildings/BuildingGenerator.js` (style branching + embedded wall texture paths/labels)
- `src/graphics/gui/building_fabrication/BuildingFabricationScene.js` and `src/graphics/gui/building_fabrication/BuildingFabricationUI.js` (duplicated legacy<->new mapping + variant branching scattered across UI/scene/types)

# Request

Refactor the above hotspots to remove dependency-direction violations and reduce variant-specific branching in generic/mixed layers by introducing registries/catalogs and small interfaces so variant selection is data-driven and localized.

Tasks:
- Eliminate generic-layer -> specific-layer imports for the targets listed above, while keeping behavior the same for existing variants.
- Window textures:
  - Make `engine3d` window texture generation generic and independent of app-level window style enums.
  - Centralize window type definitions (labels, default params, preview configuration, and type-specific rendering behavior) behind a single registry/catalog that callers use.
  - Preserve backwards compatibility for legacy window style inputs by translating them outside the generic renderer (so `engine3d` does not import `src/app/buildings/*`).
- Traffic control visuals:
  - Remove hardcoded conditional mapping from traffic-control kind to procedural mesh IDs inside `TrafficControlProps`.
  - Centralize all traffic-control kind->visual selection and rig parameter application behind a registry/catalog so visuals code just asks for a spec and applies it.
  - Ensure behavior continues to work with both the current rig API and any legacy mesh userData APIs already supported.
- Connector sampling:
  - Move connector sampling utilities used by overlays/debug UIs into `src/app/geometry/` (or equivalent generic geometry layer) and have visuals/debug modules depend only on that generic geometry API.
  - Keep `assets3d` road generator modules working (they can import/re-export the generic sampling utilities as needed).
- Building style materials:
  - Centralize building style label + wall material/texture URL specification into a single catalog/registry instead of branching in `BuildingGenerator.js`.
  - Keep the generator spec-driven so adding a new style is a catalog change rather than adding new `if/switch` branches.
- Building fabrication UI/scene modularity:
  - Remove duplicated legacy window-style <-> window-type conversion logic from UI/scene modules by centralizing it (single source of truth).
  - Ensure UI option lists (styles, roof colors, belt colors, window types) are sourced from catalogs/registries rather than scattered conditional logic.
- Verification:
  - Ensure the app loads without console errors.
  - Ensure browser-run tests still pass (`tests/core.test.js`).
  - Add/adjust minimal tests where appropriate to validate the new registries/adapters (especially legacy compatibility and connector sampling behavior).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_113_REFACTOR_decouple_specificity_with_registries`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added content-driven registries for window types, building styles, traffic-control visuals, and connector sampling; removed generic->specific imports in the targeted hotspots while preserving existing behavior and adding minimal regression tests.
