#DONE #Problem

Lighting tuning (IBL, exposure, hemisphere/sun intensity, background) currently requires code changes or URL params, and it’s hard to iterate on “washed out” vs “too dark” balance. There is no in-game options screen to adjust these settings and persist them.

# Request

Introduce an in-game **Options** screen accessible via key `0`, using a tabbed UI. Add a **Lighting** tab that exposes the key lighting parameters with current code defaults pre-filled. Provide a `Save` button that persists the config and restarts the game so all scenes use the new parameters.

Tasks:
- Add a new Options state/screen:
  - Accessible via key `0` from both Welcome and Setup (and from other scenes if it doesn’t conflict).
  - Uses a tabbed UI (folder-tab style consistent with other panels where applicable).
  - Includes at least one tab: `Lighting` (additional tabs can be placeholders for future settings).
- Lighting tab controls (use current defaults as initial values):
  - Toggle: IBL enabled.
  - Slider/number: IBL intensity (`envMapIntensity`).
  - Toggle: IBL background on/off (`setBackground`) if supported.
  - Slider/number: tone mapping exposure.
  - Slider/number: Hemisphere light intensity (global/default behavior).
  - Slider/number: Directional “sun” light intensity (global/default behavior).

- Apply behavior:
  - `Save` writes config and then restarts the game/app flow so the new settings apply consistently everywhere.
  - Restart should be implemented as a clean state reset (avoid full page reload).
  - Ensure the engine/renderer and scenes pick up the new settings after restart.
- UX:
  - Provide `Cancel/Back` to return without saving.
  - Ensure keyboard focus doesn’t break gameplay/map interactions after closing options.
- Safety/compat:
  - Validate numeric ranges (no negative intensities; reasonable exposure bounds).
  - Ensure this does not break existing URL-param overrides; decide precedence (URL vs saved settings) and document it in the prompt.
  - Add an option to reset to defaults in the Lighting tab (defaults = code configured).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_104_DONE_MATERIAL_options_screen_key0_tabs_lighting_and_restart_apply`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Precedence: code defaults → saved settings (localStorage) → URL params (URL wins; existing `ibl`, `iblIntensity`, `iblBackground`, `iblId` still work).

Summary: Added an Options screen (key `0`) with tabbed Lighting controls (IBL/exposure/hemi/sun), persisted settings, and a clean in-app restart so new lighting applies across scenes.
