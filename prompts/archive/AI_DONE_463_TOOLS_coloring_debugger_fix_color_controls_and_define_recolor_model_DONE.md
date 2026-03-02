# DONE

Color controls in the Coloring Debugger are not producing expected material results. Current behavior prevents reliable tinting/whitening, independent saturation reduction, and predictable hue/value control.

# Request

Use the Coloring Debugger to fix and calibrate material color controls, and define a clear control model that supports full recolor workflows.

Tasks:
- Fix white response:
  - Selecting pure white in the color picker must be able to brighten/reach white as expected (not stuck below).
- Fix saturation behavior:
  - Allow saturation reduction independently (user must be able to desaturate without unintended hue/value coupling).
- Propose and implement a robust recolor control model that supports:
  - recoloring material to any hue,
  - saturate/desaturate control,
  - brightness/value control that can push toward white,
  - hue shift/control.
- Ensure controls are intuitive and stable in the Coloring Debugger and suitable for reuse in BF2/decorator color widgets.
- Validate with visual checks in the debugger scene that each control dimension behaves independently and predictably.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_463_TOOLS_coloring_debugger_fix_color_controls_and_define_recolor_model_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_463_TOOLS_coloring_debugger_fix_color_controls_and_define_recolor_model_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed change summary
- Updated the shared wall tint compose model so brightness above `1` lifts color toward white instead of clipping, enabling reliable whitening while keeping predictable HSV tinting.
- Reworked the shared HSVB tint picker with explicit `Hue`, `Saturation`, and `Value` sliders plus improved SV triangle projection for stable, independent control adjustments.
- Added/updated unit coverage for tint model behavior (legacy compatibility, whiten response, saturation independence, and pure-white composition) and aligned building/decorator specs with the new control model.
