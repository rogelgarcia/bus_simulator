#Problem

Wherever a bay steps in or out — a proud pier beside a recessed spandrel, any
bay-relief step — the short **return** face (the side wall of the step) gets its
wall texture mapped in the opposite U direction from the return on the other
side of the same pier. Brick courses therefore meet the pier's arris mirrored,
and the pier reads as a chevron / herringbone instead of masonry turning a
corner. It is most obvious at a grazing angle, where both returns of one pier
are visible at once.

This is **pre-existing and unrelated to the plan edge bevel** (AI 499/501): it
reproduces on the stock catalog building with no bevel authored. It was found
while reviewing AI 499 screenshots, so it is filed separately rather than folded
into that work.

Reproduction: render `pier_grid_tower_2` through the `building_showcase` harness
scenario with no config overrides, camera placed close to the front facade at a
grazing angle (e.g. eye `(7.5, 7.0, 26.0)` looking at `(-4.0, 6.0, 20.0)`), and
look at the brick piers where they meet the recessed spandrel panels. Deepening
the bay recesses (`depth: { left: -0.6, right: -0.6 }`) exaggerates it.

Where it comes from: `buildWallSidesGeometryFromLoopDetailXZ` in
`src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js`
maps a relief step's side face along depth (see the `isBoundarySideSegment`
branch, ~line 2217):

```js
uAtA = anchorU;
uAtB = anchorU + (depthB - depthA);
```

`depthB - depthA` is signed by the direction the loop happens to traverse that
step, so the two returns of one pier advance U in opposite directions. The
anchor itself already accounts for faces B/D running their U backwards; the
direction term does not.

# Request

Make a relief step's return continue the wall texture instead of mirroring it.

Tasks:
- Confirm the mechanism before changing it (a wireframe/UV debug capture of one
  pier is enough): both returns of a pier, plus how a return reads against the
  face it steps off.
- Make the return's U advance in a direction consistent with the wall it belongs
  to — i.e. keep marching along the loop rather than flipping with the sign of
  the depth delta — and keep faces B/D consistent with their reversed face U.
  Preserve what the existing branch already gets right: the anchor (the return
  starts where the face left off) and the no-collapse/no-stretch mapping along
  depth that the comment there is about.
- Check the same mapping for concave returns (a bay stepping IN), for stacked
  bays with different depths, and for wedge (`blendAtEdges`-style) bay edges
  where the front span is inset — the return is a diagonal there, not a pure
  side face.
- Verify no regression in the per-bay material/UV overrides: the segment still
  has to resolve its override by exact key or by the `__ranges__:<faceId>`
  fallback, and `uvStart` continuity across a face must be unchanged.
- Tests: a unit-level assertion over the generated wall UVs for a pier between
  two recessed bays — the two returns of one pier must map in the same
  direction, and a return must be continuous with the face it steps off.

## Delivery requirements
- Engine 2 only: target the facade/bay building engine (facades/bays + window definitions). Do not extend engine 1 (the fixed-spacing `layer.windows`/`spaceColumns` path or the old `BuildingGenerator.js`); it is deprecated and frozen.
- Finish with a screenshot showing the feature in a rendered building — a before/after pair when the change improves something that already renders — and additionally a close-up version of the feature.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
