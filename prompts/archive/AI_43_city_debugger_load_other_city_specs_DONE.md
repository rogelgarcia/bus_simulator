# Problem [DONE]

The city/map debugger currently starts from a single base spec (demo) and has
no in-UI way to switch to other available city specs (e.g. BigCity) without
changing code.

# Request

In the city debugger, add a UI action to load/select other available city specs
and rebuild the city accordingly.

Tasks:
- Define a central list/registry of available city specs under
  `src/app/city/specs/` (stable ids + labels + module exports) so the debugger
  can present them to the user.
- Update the city debugger UI (`src/graphics/gui/map_debugger/`) to add a
  "Load spec" control (button and/or dropdown) that shows the available specs
  and allows selecting one.
- When a spec is selected, rebuild the city in the debugger using that spec:
  - Update the current `_spec` state and refresh the editor panel fields.
  - Re-render roads/buildings and keep existing toggles (render modes, trees,
    overlays) working.
  - Reset camera optionally (or provide an explicit "Reset camera" action).
- Ensure the feature works without relying on dynamic filesystem directory
  listing at runtime (static web app constraint).
- Decide how to handle non-module artifacts like
  `src/app/city/specs/city_spec_bigcity.json` (ignore, convert, or include) and
  document the expected source of truth for specs.
- Add/update browser-run tests validating:
  - The spec registry is importable and contains expected entries.
  - Selecting a different spec triggers a city rebuild path without errors.

Constraints:
- Keep spec data/logic in `src/app/` and UI code in `src/graphics/`.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added a static city spec registry and a Map Debugger “Load spec” UI that switches between registered specs (e.g. Demo/Big City) and rebuilds the city, with browser tests covering registry entries and the load path.
