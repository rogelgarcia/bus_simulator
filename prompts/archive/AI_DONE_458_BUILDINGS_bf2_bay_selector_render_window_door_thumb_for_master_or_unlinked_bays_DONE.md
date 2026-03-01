# DONE

In Building Fabrication 2 bay selector cards, openings are not clearly represented in the thumbnail preview for eligible bays.

# Request

Update BF2 bay selector thumbnail rendering to show selected window/door previews on eligible bays while preserving the bay wall texture context.

Tasks:
- In bay selector cards, when a bay is either:
  - a master bay, or
  - a non-linked bay,
  and it has a window/door assigned, render the selected window/door in the bay picker thumbnail.
- Preserve the wall texture/background for that bay in the same thumbnail (do not replace with a generic background).
- Render the window/door preview at `50%` scale relative to the current window/door picker thumb sizing.
- Keep existing linked-slave bay behavior unchanged unless covered by the above eligibility rule.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_458_BUILDINGS_bf2_bay_selector_render_window_door_thumb_for_master_or_unlinked_bays_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_458_BUILDINGS_bf2_bay_selector_render_window_door_thumb_for_master_or_unlinked_bays_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed change summary
- Updated BF2 bay selector card rendering to overlay assigned opening previews on eligible master/non-linked bay thumbnails.
- Preserved bay wall texture/background context by drawing opening preview as an overlay layer on top of the existing bay material thumbnail.
- Enforced existing linked-slave card behavior by keeping slave previews unchanged (no opening overlay on slave-only cards).
- Sized bay opening overlay previews to 50% visual scale relative to the existing opening picker thumbnail presentation.
- Added a UI regression test covering master/non-linked preview overlays, preserved wall thumb context, and unchanged slave behavior.
