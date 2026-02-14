# DONE

#Problem

To normalize PBR materials and make lighting predictable, we need a **side-by-side calibration workflow** inside the game. Today, material evaluation is fragmented (different scenes, different lighting, different geometry), which makes it hard to compare materials objectively and makes “fixing lighting” devolve into per-object tweaks.

We need a dedicated **Material Calibration** scene/tool that:
- uses stable, repeatable illumination presets
- displays a small number of selected PBR materials side-by-side
- allows choosing materials by **category/class** (as defined in Phase 1)
- allows adjusting material parameters in one place (catalog-driven), with a concept of a baseline material for comparison

# Request

Implement Phase 2 of `specs/materials/PBR_MATERIAL_NORMALIZATION_PIPELINE_SPEC.md` by creating an in-game **Material Calibration** tool accessible from the **Q menu**.

Tasks:
- Add a new Q-menu item: **Material Calibration**.
- Implement a calibration scene/tool that is similar in spirit to the Inspector Room:
  - A dedicated viewport with a controlled environment.
  - Camera can be moved with **arrow keys** (and should feel similar to existing tool camera controls in the project).
- Update/create specs under `specs/materials/` describing:
  - the calibration scene purpose and requirements
  - illumination presets and stability requirements
  - UI layout and interaction rules
  - how adjustments are stored/applied (catalog-first; no per-object hacks)

## Scene / Viewport requirements
- The calibration viewport must show selected materials applied to standardized reference geometry.
- Only allow selecting **up to 3 materials** at a time (first pass).
- Clicking a material sample in the viewport selects it as the **active material** for the right-side adjustment panel.
- The calibration environment must be stable and comparable:
  - Illumination presets must be deterministic and not drift as you switch materials.
  - The light should maintain **relative position** when moving focus between samples, and preserve the camera preset angle when applicable.

## UI layout (first pass)

### Bottom full-width Catalog panel
- A bottom panel spans the **entire width** of the screen.
- At the top of this panel: a **category selection** control (dropdown or segmented control).
- Under the category selector: a grid/row of **cards** for each PBR texture/material in that category.
  - Cards can be selected/unselected.
  - Enforce max 3 selected at once (selecting a 4th should either block or replace deterministically).
  - Each card includes small icon buttons below it:
    - **Focus camera** button: focuses the camera on that material sample in the viewport.
      - If a camera preset (e.g., 45°) is active, focusing another sample must keep the same angle and distance style (only translate to center the target).
      - The illumination should also remain in the same relative framing (no “lighting changes per sample”).

### Left-bottom Illumination panel
- Above the bottom catalog panel on the **left** side, place an **Illumination** panel.
- Provide stable illumination presets (first pass), for example:
  - Neutral studio IBL (baseline)
  - Overcast outdoor IBL (soft)
  - Sunny directional + IBL (hard shadows)
  - Night / low light (optional)
- Switching illumination presets must be stable and repeatable.
- The chosen preset must apply consistently across all samples.

### Left Options panel (above Illumination)
- Above the illumination panel, add an **Options** panel for calibration layout options:
  - toggle or selector for tiling mode (e.g., apply textures as **2x2 tiling** vs default)
  - selector for the base plane / reference geometry layout mode (see proposals below)

### Center overlay icons
- Reuse the center overlay icon area pattern from Inspector Room, but **keep only the ruler**.
- The ruler tool should behave like the BF2 ruler:
  - measure distances/areas in the calibration scene
  - useful for verifying material scale/tiling and texel density consistency
- No other center tools are needed in first pass.

### Right-side Adjustment panel
- On the right side, provide **adjustment controls** for the currently active material.
- You must be able to pick a material sample by clicking in the viewport.
- The adjustment panel must allow:
  - editing the catalog-driven parameters for that material (implementation-defined, but must cover common PBR normalization needs)
  - setting which selected material is the **baseline** material for comparison
    - If no baseline is set, the tool may choose a default baseline (proposal: the first selected material).

Notes:
- The adjustment panel must not introduce per-object tweaks; changes must map back to the catalog/config for that material.
- If the project uses different parameter sets per material (some have extra maps), the UI must handle missing maps gracefully.

## Reference geometry / layout (proposal, do not mandate)
- Provide a small set of standardized sample geometries per material slot, for example:
  - flat wall panel (for tile/scale evaluation)
  - bevel cube or sphere (for specular/roughness evaluation)
  - optional trim/molding strip (for grazing highlights)
- Allow an option to show either:
  - one geometry per selected material (side-by-side), or
  - multiple geometries per selected material (stacked)

## Integration with Phase 1 categories
- The category selector must use the Phase 1 categories/classes (asphalt, concrete, brick, etc.).
- The card list must be driven from the canonical PBR catalog (not ad-hoc lists).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_311_MATERIAL_phase2_material_calibration_tool_q_menu_scene_and_ui_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (implemented)

- Added a new Q-menu scene shortcut and state wiring for the Material Calibration tool (`src/states/SceneShortcutRegistry.js`, `src/main.js`, `src/states/MaterialCalibrationState.js`).
- Implemented a controlled calibration scene with deterministic illumination presets, standardized reference geometry slots (max 3), viewport picking, focus camera, and a BF2-style ruler overlay (`src/graphics/gui/material_calibration/MaterialCalibrationScene.js`).
- Implemented Material Calibration UI: bottom catalog by Phase 1 classes with select/focus actions, left options + illumination panels, center ruler toggle, and right-side baseline + per-material override controls with localStorage persistence (`src/graphics/gui/material_calibration/MaterialCalibrationView.js`, `src/graphics/gui/material_calibration/MaterialCalibrationUI.js`, `src/graphics/gui/material_calibration/styles.css`, `index.html`).
- Added a Phase 2 calibration tool spec and linked it from the normalization pipeline spec (`specs/materials/PBR_MATERIAL_CALIBRATION_TOOL_SPEC.md`, `specs/materials/PBR_MATERIAL_NORMALIZATION_PIPELINE_SPEC.md`).
- Updated the core UI test to allow class-grouped picker tabs while still asserting a Color tab exists (`tests/core.test.js`).
