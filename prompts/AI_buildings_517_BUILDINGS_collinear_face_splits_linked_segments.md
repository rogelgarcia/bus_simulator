# Problem

The reference Bradbury organization (user drawing, 2026-08-28) reads each
street wall as CONTIGUOUS DESIGN SEGMENTS on one straight plan line: raised
pavilion strips, inset wall fields, corner stacks. The side street and the
entry face SHARE segments (the entry face equals the side face's back field),
so the natural authoring model is: split a straight wall into several
first-class faces and LINK the duplicates to one master — design once, reuse
everywhere (the existing per-layer `faceLinking` already does this for whole
faces, e.g. D→A).

Today this is impossible: `buildExteriorRunsFromLoop` merges collinear
consecutive edges into one run, so collinear footprint vertices cannot
produce separate faces. The 2026-08-28 workaround is config-level segment
builder functions in `BradburyBlock.js` (`sideStreetFaceItems` /
`entryFaceItems` share `pavilionSeg` / `fieldSeg` / `cornerStackBay`), which
reuses the DESIGN in code but leaves each face one long bay list in the
editor.

# Desired feature

1. **Split markers in the footprint loop**: a loop point may carry
   `split: true` (or a parallel `faceSplits` config listing u-positions per
   run). The frames path (`computeFacadeFramesFromLoop`) keeps a face break
   at marked points; every other consumer of `buildExteriorRunsFromLoop`
   (cornice module fitting, corner treatments, caps) KEEPS merging collinear
   runs — the physical wall is still one run there.
2. **Collinear corner joins**: two adjacent faces on the same line share the
   split point when their resolved depths match; when they differ (a raised
   pavilion face beside an inset field face) the join is a depth STEP with a
   return wall, not a mitre — `cornerJoinPointWithDepths` must not intersect
   parallel lines (today it would blow up or fall back). The interior shell,
   cap slabs, closure bands and the zero-depth cornice loop must all handle
   the 180° "corner".
3. **BF2 editor**: split faces appear as their own face pills (ids A–Z
   already support it); the plan-view picker highlights the sub-run; linking
   a split face works like any face link. A way to ADD/REMOVE a split from
   the editor plan view would complete it (can be a later step).
4. **Face-level plane offset** (optional, pairs naturally): letting a whole
   face sit N cm behind the nominal line would replace the per-bay
   `FIELD_INSET` depth plumbing in the Bradbury config; AI_514's push/pull
   edit is the editor-side of the same idea.

# Acceptance

- Bradbury reauthored as the user's drawing: side street =
  [1][3][1][4][2-corner], entry = [2-corner][3][1] (numbers = the drawing's
  face types), with the [3] field and the pavilion faces designed once and
  linked; renders identical to the 2026-08-28 segment-kit build.
- No visual change to buildings without split markers.
- Core tests keep passing; a new test covers: split faces solve on their own
  lengths, links re-solve, caps/cornice/shell watertight at a collinear join
  with differing depths.
