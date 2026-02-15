# DONE

#Problem

`OptionsUI` has grown into a very large file that mixes tab rendering logic for multiple domains (graphics, lighting, sun bloom, asphalt, buildings, debug). This increases maintenance cost, makes changes riskier, and causes frequent merge conflicts when multiple efforts touch different tabs.

# Request

Refactor the options UI so each tab has its own module/file, while preserving current behavior and external API.

Tasks:
- Split tab-specific UI rendering into separate files/modules (one module per tab).
- Keep the existing `OptionsUI` public behavior unchanged for callers (`OptionsState` and related runtime flows).
- Preserve all existing tab functionality and controls:
  - Graphics
  - Lighting
  - Sun Bloom
  - Asphalt
  - Buildings
  - Debug
- Preserve current tab switching behavior, tab visibility rules, and URL-gated debug tab behavior.
- Keep live update flow unchanged (`onLiveChange`) and ensure all controls continue applying runtime changes exactly as before.
- Keep save/cancel/reset flows unchanged and ensure draft serialization/deserialization behavior remains consistent.
- Maintain or improve readability by centralizing shared helpers and reducing cross-tab coupling in the main UI file.
- Ensure no regressions in styles and tab layout.
- Update docs/spec references if needed to reflect the new module layout.
- Add or update targeted tests/verification steps that confirm:
  - Each tab still renders.
  - Core controls still update draft values and propagate live changes.
  - Save/cancel/reset behavior remains correct.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to `prompts/AI_DONE_320_REFACTOR_options_ui_split_tabs_into_separate_modules_DONE.md`
- Do not move to `prompts/archive/` automatically
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Split tab renderers out of `OptionsUI` into per-tab modules under `src/graphics/gui/options/tabs/` while keeping public `OptionsUI` API unchanged.
- Extracted shared row/control factory helpers into `src/graphics/gui/options/OptionsUiControls.js` and reused them across all tab modules.
- Kept tab switching, URL-gated debug tab visibility, live update (`onLiveChange`), and save/cancel/reset draft flows intact by delegating tab methods from `OptionsUI`.
- Added targeted headless e2e coverage in `tests/headless/e2e/options_ui_tab_modules_refactor_smoke.pwtest.js` validating tab rendering, control interactions, and cancel/save/reset behavior.
