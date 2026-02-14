#Problem

Building Fabrication 2 supports floor layers, per-floor-layer face selection/linking, and bay authoring per face. We now need to support configuring **windows inside bays** with a reusable selection/fabrication workflow that leverages the existing Window Debugger window creation UI (no duplicated window-authoring code).

# Request

Add “Window” configuration for bays in Building Fabrication 2. Windows are configured per bay (per floor layer face) and must follow the same face master/slave inheritance rules used for bays/materials: a slave face does not copy window configuration; it inherits from its master face.

Tasks:
- Scope + linking rules (important):
  - Window configuration is part of the bay configuration and is authored **per face** (per floor layer face).
  - If a face is linked as a slave, it must not duplicate/copy window configuration; it only declares that it inherits from its master face and uses the master’s bay+window configuration.
- Bay UI: enable/disable Window
  - Add a `Window` section on each bay with an enable/disable toggle.
  - When disabled, no window is placed/previewed for that bay.
- Window picker UI (building-owned window definitions):
  - The window picker uses the same “thumbnail rectangle” layout as the material picker:
    - no label text,
    - shows the selected window thumbnail.
  - Clicking the window picker opens a selector popup that lists **building-owned window definitions**.
  - The selector popup includes:
    - select an existing definition,
    - a `Create New` button.
- Window fabrication popup (reuse Window Debugger authoring):
  - `Create New` opens a window fabrication popup that reuses the Window Debugger window creation UI (do not duplicate window-authoring UI logic).
  - The window fabrication panel width must be adjusted to fit the components (avoid cramped layout).
  - Use a **2×2 wall** sample for previewing the window (contextual preview).
  - The viewport can be smaller to allow for bigger/clearer controls.
  - Saving/confirming creates a building-owned window definition and selects it for the bay.
- Edit existing window:
  - After a window is selected, clicking the picker again reopens the selector with an option to `Edit` the currently selected window definition.
  - `Edit` opens the same fabrication popup, preloaded with that window definition.
- Window sizing + padding controls (per bay):
  - In the bay window section, allow adjusting window dimensions:
    - include support for `max` with “infinite” (use all available bay space).
  - The window can specify minimum padding on left and right:
    - padding values are linked by default (editing one edits the other unless unlinked).
- Window ↔ bay sizing interaction:
  - When Window is enabled, the window’s minimum width requirement overrides/clamps the bay minimum width for that bay.
  - The UI must reflect this clearly (e.g., show the effective min).

Specs update:
- Update relevant specs under `specs/buildings/` to reflect:
  - windows as bay content/configuration authored per floor-layer face,
  - building-owned window definitions and the picker/fabrication workflow,
  - per-bay window size constraints + infinite max semantics,
  - per-side padding (linked by default),
  - window-min-width clamping the bay minimum width,
  - slave faces inheriting window config via face linking (no copying).

Constraints:
- Reuse existing UI builders and the Window Debugger fabrication UI; do not fork/duplicate large UI code.
- Implement only what is listed above (window configuration in bays).

## Quick verification
- Enabling Window on a bay shows the window picker and per-bay window controls.
- Selecting an existing building-owned window definition updates the bay’s window thumbnail.
- `Create New` opens the window fabrication popup with a 2×2 wall preview and produces a reusable building-owned window definition.
- Clicking the selected window opens the selector with an `Edit` option that reopens the fabrication popup for that definition.
- When window constraints require it, the bay min width is effectively clamped up and this is reflected in UI and validation.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_265_BUILDINGS_building_fabrication2_windows_in_bays_picker_and_fabrication_popup_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
