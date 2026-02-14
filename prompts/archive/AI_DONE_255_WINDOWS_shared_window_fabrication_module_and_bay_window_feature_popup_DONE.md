#Problem (DONE)

Windows need to become a **feature inside bays** (not face-wide window spacing), and Building Fabrication needs to reuse the window editing capabilities from the standalone Window Debugger. Today, window authoring code is not organized for shared reuse between these two UIs.

# Request

Create a shared “Window Fabrication” module used by both the standalone Window Debugger and Building Fabrication, and add a bay-level window feature popup editor in Building Fabrication.

Tasks:
- Refactor window authoring so there is a shared “window fabrication” capability that can be used by:
  - the standalone Window Debugger scene UI, and
  - Building Fabrication (inside a popup editor)
- In Building Fabrication, within a selected bay:
  - Allow enabling/disabling a **Window feature** for that bay.
  - Provide a button: “Fabricate / Edit Window…”
    - Opens a popup with its own viewport + window controls (matching the Window Debugger UI capabilities).
    - Editing should update the bay’s window feature live (or with a clear apply flow if needed).
- Window ownership and reuse:
  - Window definitions are owned by the building being fabricated.
  - Allow reusing an existing window definition (select from building-owned definitions) or fabricating a new one.
  - Allow per-bay overrides for window width/height (while still referencing a shared definition).
- Add a “floor skip” / interval option for bay windows:
  - Default is `1` (window appears on every floor).
  - Larger values (e.g. `2`, `3`) skip floors accordingly.
- Ensure this integrates with the facade layout model from `specs/BUILDING_FABRICATION_FACADE_LAYOUT_SPEC.md`:
  - Windows are part of bay content (feature/segment), not face-global.
  - Width constraints from bay sizing are respected (if it doesn’t fit, it must be omitted with a warning, not overlap).
- Keep this extensible so future bay features (AC units, balconies, etc.) can be added without rewriting the entire bay content model.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_255_WINDOWS_shared_window_fabrication_module_and_bay_window_feature_popup_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

# Summary
- Added a shared `window_fabrication` module and refactored the Window Mesh Debugger to mount its UI in arbitrary parents (supports embedded usage).
- Extended Building Fabrication bay items to support a Window feature (definition reference, per-bay size overrides, floor-skip) and added a bay-level “Fabricate / Edit Window…” popup.
- Added core tests covering bay window UI presence and scene min-width enforcement with window features.
