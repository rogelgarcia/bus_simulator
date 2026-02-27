# DONE

# Problem

When loading the app with a screen redirect query parameter like `http://localhost:8001/index.html?screen=building_fabrication2`, the app still enters the Welcome screen first, runs its startup behavior, and only then navigates to the requested screen.

# Request

Make startup go directly to the requested screen when a valid `screen` query parameter is present, fully bypassing Welcome screen loading/entry behavior for that launch.

Tasks:
- When `screen=<valid_scene_id>` is present on first load, launch directly into that scene as the initial state.
- Ensure Welcome state does not run enter/exit side effects for direct-launch flows.
- Preserve current behavior when `screen` is missing or invalid (default launch remains Welcome).
- Keep URL sync behavior consistent with existing scene navigation logic.
- Ensure there is no visible/flicker transition through Welcome before the target screen.
- Add or update a small regression check so direct launch with query param is covered.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
- `prompts/AI_DONE_432_UI_direct_screen_launch_bypass_welcome_boot_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Added shared launch-screen URL utilities to resolve direct-launch state ids, sync `screen` query state, and support deterministic startup behavior.
- Updated app boot flow to compute initial state before startup, pre-hide Welcome UI for direct launches, and enter target scene directly without Welcome state entry.
- Added node unit regression tests covering valid/invalid `screen` parsing, URL query synchronization, and direct-launch Welcome pre-hide behavior.
