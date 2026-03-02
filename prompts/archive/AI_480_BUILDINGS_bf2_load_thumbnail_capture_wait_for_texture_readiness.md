# Problem

Building Fabrication load thumbnails are sometimes captured before textures finish loading, resulting in black/untextured areas in thumbnails.

# Request

Update load-thumbnail capture flow so screenshots are taken only after required textures are ready.

Tasks:
- Review BF2/building fabrication thumbnail capture timing in load flow.
- Ensure texture/material assets required for visible surfaces are fully loaded/resolved before screenshot capture starts.
- Add readiness gating (or equivalent synchronization) so thumbnail capture does not run on partially loaded texture state.
- Verify resulting thumbnails consistently show textured surfaces (no black placeholders caused by early capture).

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_480_BUILDINGS_bf2_load_thumbnail_capture_wait_for_texture_readiness_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_480_BUILDINGS_bf2_load_thumbnail_capture_wait_for_texture_readiness_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
