# Problem

With AI 512 the facade model handles N straight faces at arbitrary angles,
but curved street frontages — the rounded-corner plan in the user's sketch
(2026-08-26 discussion), rounded bows, quarter-circle corners — remain out of
reach. Curved facades are explicitly split out of the N-face core (AI 512)
because every decoration must FOLLOW the curve, which touches far more than
the wall mesh.

# Agreed direction

- Footprint runs gain an arc form: a run is either a straight segment or an
  arc (center/radius/sweep or bulge on the segment), authored in
  `footprintLoops` metadata. An arc run is ONE face.
- The face frame generalizes: u = arc length along the curve; the frame
  yields position AND tangent/normal per u (today's straight `t`/`n` become
  functions of u).
- Bays and windows solve on arc length with the existing repetition/
  expansion/grouping rules; each placed opening gets its own tangent frame
  (windows stay planar chords with per-slot orientation; document the chord
  vs curved-glass approximation).
- Decorations follow the curve: belts, cornices (profile sweeps), dentil and
  bracket ornaments, impost bands, capitals, sills and arched-band headers
  sweep along the arc; wall meshes tessellate the arc with a curvature-based
  segment budget; UV continuity keeps texture meters continuous along arc
  length (AI 506 rule).
- Corner resolution handles arc-line and arc-arc meetings (tangent mitre).
- Interior shell, roof loops, parapet and coping follow the tessellated loop.

# Request

Implement curved facade runs per the direction above, with one showcase
config: a rounded-corner block (straight faces + one quarter-arc corner face
carrying windows, a belt and a cornice).

## Delivery requirements
- Engine 2 only. Depends on AI 512 — implement after it (AI 514 stretch
  edits may exclude arc faces in their validity rule until this lands).
- Core guards: an arc face solves bays/windows on arc length; cornice/belt
  vertex distance to the arc stays within tolerance; UV meters continuous
  along the arc.
- Screenshots of the rounded-corner showcase plus a close-up of the curved
  cornice and windows.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
