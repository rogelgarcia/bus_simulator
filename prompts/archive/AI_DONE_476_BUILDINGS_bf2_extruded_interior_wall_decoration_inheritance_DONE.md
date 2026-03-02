DONE
# Problem

When walls are extruded in Building Fabrication 2, the interior wall surfaces formed by that extrusion are not inheriting the decoration from the owning outermost decorated face under the adjacency/corner ownership rules.

# Request

Fix decoration inheritance so extruded interior wall faces correctly receive continuation of the owning outer-face decoration according to the same ownership and corner rules used for wall textures.

Tasks:
- Resolve decoration ownership for extruded interior faces based on the outmost face rule at adjacent bay transitions.
- Ensure inherited decoration is applied on the correct side/orientation and uses wall-width-based coverage consistent with base face rendering.
- Ensure inheritance behaves consistently for face mode and corner mode where applicable, without creating extra floating decoration instances.
- Add regression tests for extruded wall inheritance scenarios, including adjacent decorated bays and ownership at intruded/extruded junctions.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_476_BUILDINGS_bf2_extruded_interior_wall_decoration_inheritance_DONE.md` on `main`
- `prompts/AI_DONE_<branch>_476_BUILDINGS_bf2_extruded_interior_wall_decoration_inheritance_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed changes
- Extended BF2 wall decoration continuation to handle face-boundary ownership transitions with depth deltas, so owner bays now render inherited right-face continuation over extruded interior walls.
- Applied the continuation path consistently for flat-cap-family decorators and non-flat corner right-face trimming when continuation depth is present.
- Added a regression test for face-boundary outmost-depth ownership to validate mesh/decorator counts and prevent duplicate or floating continuation instances.
