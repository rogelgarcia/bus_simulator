# DONE

In Building Fabrication 2, selecting a decoration does not render it in the target bay in the viewport. Newly created decorations are also not appearing immediately.

# Request

Fix BF2 decoration viewport rendering so selected and newly created decorations are visible in the building view.

Tasks:
- Fix decoration rendering in BF2 so selecting a decoration results in visible rendering in its target bay(s) in the viewport.
- Ensure creating a decoration immediately renders it in the viewport without requiring manual refresh/workaround.
- Keep viewport state synchronized with decoration selection/creation state.
- Avoid regressions to existing decoration targeting logic (layer/bay selection behavior remains correct).

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_457_BUILDINGS_bf2_decoration_selection_and_creation_must_render_in_viewport_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_457_BUILDINGS_bf2_decoration_selection_and_creation_must_render_in_viewport_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed change summary
- Added BF2 scene wall-decoration rebuild rendering that consumes `wallDecorations.sets` and instantiates visible decoration meshes in targeted bays/floors.
- Wired decoration rebuild into BF2 building load flow so selection changes and newly created decorations appear immediately in viewport updates.
- Implemented set targeting in scene rendering for layer, bay selection (`allBays`/explicit refs), floor interval filtering, and per-decoration span placement.
- Added BF2 decoration material resolution for `match_wall`, `texture`, and `color` kinds, including tiling/UV transform application on generated meshes.
- Added robust decoration mesh lifecycle cleanup so rebuilds clear stale decoration meshes and keep viewport state synchronized.
