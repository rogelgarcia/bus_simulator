#Problem

Building wall aging/wear currently requires too much per-face/per-texture manual setup, which is heavy to author and hard to scale. Window-to-wall transitions also look visually flat because there is no convincing integration detail (contact darkening/cavity effect around frames).

# Request

Implement a building-level wear system that can be authored with a single main ruler per building, while still allowing controlled variation and visual richness.

Tasks:
- Add a building-level wear control (single primary value) that drives wall aging intensity without requiring per-face manual configuration.
- Ensure wear behavior applies consistently across facade surfaces and supports procedural variation so repeated buildings do not look identical.
- Add a window-to-wall integration effect so frames feel embedded in the wall (for example contact darkening/cavity-style detail around frame boundaries) and reduce the current flat look.
- Keep wear and integration behavior configurable through reusable presets (for example clean/medium/heavy) that can be selected quickly.
- Create a dedicated debugger screen for this system where presets can be selected and individual wear components can be enabled/disabled and tuned.
- In the debugger, allow adjusting component intensities with live visual feedback and clear separation between global wear level and component-level overrides.
- Add JSON export for the current debugger configuration so tuned settings can be saved and reused by gameplay/building pipelines.
- Support injecting/importing that JSON configuration back into the game so authored looks can be applied deterministically.
- Define and enforce a stable configuration shape so invalid or partial JSON inputs fail safely with clear feedback instead of silent fallback behavior.
- Preserve backward compatibility: buildings without explicit wear configuration should continue rendering with existing/default behavior.
- Add/update tests for at least configuration validation, export/import roundtrip consistency, and runtime application of imported wear settings.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
