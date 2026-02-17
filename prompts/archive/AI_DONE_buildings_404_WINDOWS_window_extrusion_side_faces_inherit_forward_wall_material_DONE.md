#Problem [DONE]

When wall openings are extruded, the generated side faces do not deterministically inherit the intended adjacent wall material. The result currently depends on incidental face/UV ordering, so the visible side material can be incorrect.

# Request

Implement deterministic material ownership for wall extrusion side faces so each side face inherits material from the wall that is forward (closer to the observer when viewing the wall from the front).

Tasks:
- Ensure each extrusion side face between neighboring wall regions resolves a single owner wall based on forward depth (closer-to-observer wins).
- Apply the owner wall material to that side face, instead of relying on incidental geometry/group ordering.
- Make behavior deterministic across UV layout differences and face/winding order, so left-ahead and right-ahead cases both resolve correctly.
- Keep existing non-side wall material behavior unchanged (front/back/base wall behavior should not regress).
- Cover both arched and rectangular openings if they share the same extrusion side-face path.
- Add/update tests that validate side-face material ownership for at least:
- a case where the left wall is forward and owns the side face
- a case where the right wall is forward and owns the side face
- a regression check proving result does not depend on UV ordering alone

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

Summary:
- Added deterministic side-segment material ownership resolution that selects the forward (higher depth) wall, independent of range/UV ordering.
- Updated facade strip override metadata to include depth-aware range entries for all strips (including base material) so side-face ownership has complete adjacency data.
- Added `tests/core.test.js` coverage for left-forward rectangular opening ownership, right-forward arched opening ownership, and UV/range-ordering invariance regression.
