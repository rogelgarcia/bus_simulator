# DONE

Curved ring decoration geometry currently includes a back face that sits directly against the wall. This face is unnecessary and wastes rendering work.

# Request

Update curved ring decorator geometry generation to omit the wall-facing back face.

Tasks:
- In curved ring geometry generation, remove/skip the back face that is flush against the wall.
- Keep visible/exposed curved ring surfaces unchanged.
- Ensure no visual gaps are introduced in normal viewing while reducing unnecessary hidden geometry.
- Keep behavior consistent in wall decoration debugger and BF2 decoration rendering paths that use curved ring geometry.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_465_BUILDINGS_curved_ring_remove_wall_facing_back_face_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_465_BUILDINGS_curved_ring_remove_wall_facing_back_face_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed change summary
- Updated curved-ring geometry generation to remove wall-facing back-plane triangles for both indexed and non-indexed BufferGeometry inputs.
- Kept visible curved-ring surfaces unchanged while preserving shared geometry behavior across BF2 and wall decoration debugger paths.
