# DONE

#Problem

Noise logic is duplicated across multiple systems (CPU sampling and shader-oriented paths), and there is no dedicated in-app stage for authoring/reusing noise texture setups.

# Request

Create a shared noise foundation and a new tooling stage to generate, preview, persist, and reload noise texture setups for future integration.

Tasks:
- Introduce a reusable noise module and refactor existing duplicated noise logic to use it where appropriate, preserving deterministic behavior.
- Add a new stage to the `Q` menu with shortcut `N`, titled `Noise fabrication`.
- In the `Noise fabrication` stage, show the generated texture preview centered, with generation parameters in a right-side panel.
- Provide a preview mode that can visualize output as a normal texture, and allow selecting the base color used by the generation workflow.
- Allow exporting generated texture setups as JSON parameter recipes (parameters only, so textures can be recreated later).
- Allow loading/importing previously exported JSON parameter recipes to recreate the same generated result.
- Add a texture generator registry so new texture types/modes can be added with minimal coupling and minimal UI rewiring.
- Ensure stage lifecycle/state handling is robust (enter/exit, re-open, and preset switching) and does not regress existing debug/tool navigation behavior.
- Add deterministic validation coverage for noise generation consistency and JSON export/import roundtrip behavior.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line.
- Rename the file in `prompts/` to `prompts/AI_DONE_graphics_328_TOOLS_noise_module_refactor_and_noise_fabrication_stage_DONE.md`.
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change).

## Summary (implemented)
- Added a shared deterministic noise foundation module and refactored terrain engine/debugger CPU noise paths to use it without changing deterministic outputs.
- Added a shared GLSL noise-chunk helper and refactored duplicated shader noise blocks in road markings/asphalt edge wear shader injections.
- Added a new `Noise fabrication` debug stage (`Q` menu shortcut `N`) with centered preview canvas and right-docked parameter controls.
- Implemented preview modes (`Texture` and `Normal map`) with base-color workflow support and deterministic field-to-preview rendering.
- Implemented generator-registry-driven authoring with preset switching, so new generator modes can be added with minimal UI rewiring.
- Implemented JSON recipe export/import (parameters only) with state sanitization and local persistence for robust reopen/lifecycle behavior.
- Added deterministic Node unit coverage for shared noise determinism and recipe export/import + regeneration roundtrip consistency.
