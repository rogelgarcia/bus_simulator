#Problem

Building Fabrication now needs an overall wall albedo/tint control, but selecting colors via the existing UI is not ergonomic. The current popup controls don’t provide a dedicated color picker experience for wall tint selection.

# Request

Improve the Building Fabrication wall albedo tint UX by adding a **Color Picker** tab inside the tint popup, and (if it improves art direction) include a control to adjust the **tint intensity**.

Tasks:
- In the Building Fabrication UI, for the wall albedo/tint control:
  - Add a tab within the popup dedicated to a color picker (in addition to any existing input modes, if present).
  - Ensure the chosen color updates the wall tint live in the preview.
  - Ensure keyboard/text entry for exact hex values still works (or provide it alongside the picker).
- Add a tint intensity control (if it makes sense for the material system and improves usability):
  - Allow scaling/blending the tint influence from “no tint” to “full tint” with an intuitive label and range.
  - Ensure defaults preserve the current look (tint intensity default should not unexpectedly recolor existing buildings).
  - Ensure the intensity behaves consistently and predictably across different wall materials/textures.
- Persistence/export:
  - Ensure the selected tint color and tint intensity persist in Building Fabrication state and are included in exported building configs.
  - Maintain backward compatibility for older saved/exported configs (missing fields use safe defaults).
- UX:
  - Keep the popup compact and consistent with other color/material controls.
  - Include a “Reset” action (or equivalent) to return tint color/intensity to defaults quickly.

Nice to have:
- Add a small palette of recent colors or presets for fast iteration.
- Add optional “copy/paste color” support between walls/belts/roofs if applicable.

## Quick verification
- Pick a color via the new Color Picker tab:
  - Wall updates immediately and matches the chosen color.
- Adjust tint intensity:
  - 0 disables tint effect; higher values increase influence without artifacts.
- Export and reload:
  - Tint color/intensity are preserved.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_219_BUILDINGS_building_fabrication_wall_albedo_tint_color_picker_tab_and_intensity_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
