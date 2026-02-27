# DONE

## Completed Summary
- Added a `Show dummy` toggle to the wall decoration debugger View panel and wired it to UI state/callbacks.
- Hooked dummy visibility to the debugger scene so sky/ground/grid hide and show immediately without affecting wall/decorator editing.
- Added regression coverage for UI callback + runtime visibility behavior and updated the wall-decoration spec contract.

# Problem

The wall decoration debugger is missing a view control to toggle dummy visualization, making it harder to inspect decorations with and without the dummy context.

# Request

Add a `Show dummy` option to the wall decoration debugger view controls.

Tasks:
- Add a `Show dummy` toggle in the wall decoration debugger View panel.
- When enabled, render the dummy helper/preview context used by this screen.
- When disabled, hide the dummy while keeping wall/decorator visualization and editing fully functional.
- Ensure the toggle updates immediately and behaves reliably across repeated on/off changes in the same session.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_444_BUILDINGS_wall_decoration_debugger_add_view_show_dummy_option_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_444_BUILDINGS_wall_decoration_debugger_add_view_show_dummy_option_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
