# DONE

Building Fabrication 2 view controls do not currently expose a dedicated sky render toggle in the View options.

# Request

Add a `Render sky` option to BF2 View settings and keep it enabled by default.

Tasks:
- In Building Fabrication 2 View options, add a toggle named `Render sky`.
- Wire this option to sky visibility/render behavior in BF2 viewport.
- Default state must be `enabled`.
- Ensure on/off changes apply immediately and persist consistently during the session.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_459_BUILDINGS_bf2_view_option_render_sky_enabled_by_default_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_459_BUILDINGS_bf2_view_option_render_sky_enabled_by_default_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed change summary
- Added a `Render sky` view toggle to the BF2 UI and wired it through a dedicated `onRenderSkyChange` callback.
- Connected BF2 view state and scene state so sky background updates immediately and defaults to enabled on entry.
- Added regression coverage for UI toggle presence/callback behavior and scene background on/off behavior.
