DONE

# Problem

Building Fabrication window authoring controls are not aligned with the newer Building Fabrication 2 behavior, and the window picker experience is inconsistent with the Window Debugger picker.

# Request

Bring Building Fabrication window authoring to the same control model as Building Fabrication 2, and replace its window picker flow with the same picker used by Window Debugger so users can select a window and adjust quick parameters in a consistent way.

Tasks:
- Make Building Fabrication window-related controls match the Building Fabrication 2 control model and interaction behavior.
- Reuse the same window picker component/experience used by Window Debugger in Building Fabrication.
- Enforce picker flow as: choose window first, then apply quick parameters.
- Ensure selected window + quick parameters are applied consistently across Building Fabrication previews/runtime behavior.
- Remove or retire conflicting legacy picker/control paths in Building Fabrication once parity behavior is in place.
- Preserve existing behavior where not explicitly changed by this request, and avoid regressions in window placement/material flows.
- Update relevant specs under `specs/windows/` and/or `specs/buildings/` to document control parity and shared picker behavior.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_412_BUILDINGS_building_fabrication_controls_parity_and_window_debugger_picker_reuse_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_412_BUILDINGS_building_fabrication_controls_parity_and_window_debugger_picker_reuse_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Summary
- Replaced legacy Building Fabrication bay-window controls with BF2-style quick params and picker-first interaction.
- Wired Building Fabrication to use shared `PickerPopup` (Window Debugger-style) for bay window definition select/create/edit flows.
- Added cached window-definition preview thumbnails in face editor state sync so picker/inline selection show consistent visual previews.
- Updated core UI/scene tests for canonical `bay.window` behavior and retired legacy `floorSkip`/override expectations.
- Updated building specs to document BF1/BF2 bay-window control parity and shared picker behavior.
