# DONE - Problem

Road lane markings become extremely jagged/disconnected at distance and low viewing angles when AA is Off/SMAA/FXAA. MSAA (especially 8×) greatly improves these thin, high-contrast details, but is expensive. We need a dedicated, reproducible debug scene focused on lane markings so we can evaluate AA modes and future approaches (e.g., separate markings buffers) without the noise of full gameplay.

# Request

Introduce a new dedicated debugger scene for testing **road markings anti-aliasing** and occlusion behavior, with a docked control panel that is independent from the main game UI.

Tasks:
- Add a new “Markings AA Debugger” scene/tool that follows the same conventions as existing debug scenes (lifecycle, cleanup, scene registration/selection, UI patterns, etc.).
- Build a compact test map:
  - 9×9 layout/area (same scale conventions as other debug scenes).
  - A road crossing with:
    - X-axis road: 2 lanes each direction (2+2).
    - Y-axis road: 3 lanes each direction (3+3).
  - Include surrounding land/ground so low-angle horizon aliasing is visible.
- Render the asphalt with the game engine so we can see the markings effects.
- Place random occluding objects on/near the road (deterministic via seed):
  - Use simple geometry with a “fake texture” / two-color checker pattern so occlusion and edge clarity are obvious.
- Add a right-side docked debug panel (separate from the game options UI) that includes:
  - AA mode selector (all supported AA modes in the project: Off / MSAA / SMAA / FXAA, and automatically include new modes if they are added later, e.g., TAA).
  - Per-mode settings controls, organized into sections:
    - `MSAA` section (samples, and any other MSAA-relevant settings)
    - `SMAA` section (existing tunables)
    - `FXAA` section (existing tunables)
    - Any future AA mode sections (e.g., `TAA`) should be shown only when that mode is selected
  - A view mode selector that replaces the main viewport with:
    - Normal scene view
    - Depth buffer visualization (the whole viewport shows depth)
    - Markings buffer visualization (the whole viewport shows the markings-only output)
    - Composite visualization (scene + markings buffer composited)
  - For the markings buffer visualization:
    - Use a dark gray background by default.
    - Provide a control to change the visualization background color.
- Render path requirements:
  - Support rendering markings into a dedicated high-resolution MSAA render target (configurable scale factor) intended for AA experimentation.
  - Depth visualization should be accurate and helpful for diagnosing occlusion issues.
  - Composite visualization should clearly show whether markings pass is correctly occluded by scene geometry.
- Add small quality-of-life debug controls:
  - Deterministic seed control and “re-roll” button for occluder placement.
  - Allow moving the camera with arrow keys.
  - Display current resolution, pixel ratio, and markings-buffer resolution/sample count (read-only).
- Add minimal tests/guardrails appropriate for this repo to ensure the debugger is loadable and its settings sanitization (if any) is stable.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_229_TOOLS_markings_aa_debugger_scene_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Adds a new `Markings AA` standalone debug tool (`debug_tools/markings_aa_debug.html`) and registers it in the Setup → Debugs menu.
- Builds a deterministic 9×9 road-crossing scene (2+2 lanes ×-axis, 3+3 lanes y-axis) with seeded occluders using a two-tone checker texture.
- Implements AA mode switching + view modes (normal/depth/markings buffer/composite) including a dedicated high-res MSAA markings render target with configurable scale + samples and read-only resolution stats.
