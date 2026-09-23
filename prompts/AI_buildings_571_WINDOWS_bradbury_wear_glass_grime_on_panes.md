# Problem

The Bradbury block's window glass is spotless on every floor. Real window glass collects dirt in a
consistent way:
- Rain runs down the pane and dries along the bottom rail, leaving its dirt there.
- Dust gathers in the lower corners.
- Glass sheltered under a deep head or transom stays dustier.
- Upper floors are cleaned less often than the storefronts, which are washed at street level.

On this building the panes are the upper-floor sashes on floors 2 to 4, the top floor's arched lights,
and the storefront and transom glass. This is a feature of the wear layer (AI 563) and follows its rule
#1: nothing placed by noise.

Sources:
- https://www.urbanphysics.net/2013_BAE_Runoff_Review__Preprint.pdf

# Request

Add glass grime to the wear layer: dirt on window panes where water and dust actually leave it.

Tasks:
- Each pane is dirtiest along its bottom rail and in its lower corners, as a soft gradient rising from
  the bottom. It is not an even film across the pane.
- Faint drying lines from the top edge of each pane downward, anchored to the pane's frame, not scattered.
- Panes in deep, sheltered reveals are a little dustier than panes flush with the wall.
- Upper floors take more grime than the ground-floor storefronts, which stay nearly clean.
- Grime lowers the glass's clarity and reflection where it lies, and never makes it opaque.
- The layout follows each pane's own frame, so panes of the same kind match, differing only for physical
  reasons (height, shelter).
- Own strength control through AI 563; visible in the debug view.

## Evidence
- Save everything under `tests/artifacts/screens/bradbury_wear/glass_grime/` (gitignored).
- Off and on side by side for `st_along` and `st_up`, plus a close-up of one upper-floor sash and one
  top-floor arched light.
- Include the debug view.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_571_WINDOWS_bradbury_wear_glass_grime_on_panes_DONE.md` on `main`
  - `prompts/AI_DONE_buildings_571_WINDOWS_bradbury_wear_glass_grime_on_panes_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
