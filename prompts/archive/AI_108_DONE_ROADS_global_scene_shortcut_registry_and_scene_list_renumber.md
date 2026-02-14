#DONE #Problem

Scene selection shortcuts are currently duplicated between the Welcome screen and the Setup screen, making it easy for them to drift out of sync. Adding a new scene requires updating multiple places, and shortcuts may work in one screen but not the other.

Additionally, the scene list needs cleanup and renumbering:
- Remove “Debug corners 2” from the selectable scene list.
- Rename “connector debugger” to “Rubins debugger”.
- Renumber the screens to a new fixed mapping.

# Request

Introduce a single global scene registry that defines the scene list and numeric shortcuts, and make both Welcome and Setup screens use it as the source of truth. Then apply the requested scene removal/rename/renumbering.

Tasks:
- Create a global scene registry:
  - Define a single registry/module that lists all selectable scenes with:
    - Stable scene/state IDs (used by the state machine).
    - Display name (used by Welcome and Setup UI).
    - Numeric shortcut key (1–9).
    - Optional description/help text (if used in UI).
  - Ensure both Welcome and Setup screens read from this registry to:
    - Render the scene list.
    - Bind numeric keyboard shortcuts.
  - Ensure adding a new scene requires updating only this registry to make it available in both screens.
- Remove “Debug corners 2” from the selectable list:
  - The state may still exist internally if needed, but it must not appear in the Welcome/Setup scene selection list.
- Rename “connector debugger” to “Rubins debugger”:
  - Update user-facing labels.
  - Keep internal state IDs stable unless renaming is explicitly desired; ensure references remain valid.
- Renumber the screens and ensure both Welcome and Setup reflect the same mapping:
  - `1` — City map
  - `2` — Test mode
  - `3` — Rubins debugger (was Connector debugger)
  - `4` — Rapier debugger
  - `5` — Building fabrication
  - `6` — Inspector
  - `7` — Road debugger
- Setup screen layout and scrolling:
  - If scrolling is needed, use a scrollbar for the **entire Setup screen** (not just the inner “system setup portion”).
  - Render the scene list in a vertical flow with dynamic column layout:
    - First column shows `1,2,3,4` (then continues if needed).
    - Second column shows `5,6,7,8` (then continues if needed).
  - Implement this using CSS so it adapts automatically as the number of scenes changes (avoid hardcoding positions).
- Consistency checks:
  - Ensure Welcome screen hints reflect the new numbers.
  - Ensure Setup screen menu ordering matches the numeric ordering.
  - Ensure keypress handling works from both Welcome and Setup.
  - Ensure removing Debug corners 2 does not break other navigation/shortcuts.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_108_DONE_ROADS_global_scene_shortcut_registry_and_scene_list_renumber`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Centralized scene shortcuts into a shared registry, removed Debug Corners 2 + Texture Inspector from selection, renamed Connector Debugger to Rubins Debugger, renumbered keys to 1–7, and updated Setup layout to CSS-driven column flow with full-screen scrolling.
