DONE

# Problem

Every long line of the Bradbury block's trim is perfectly straight and flat: the cornice nose, the dentil course, the
band mouldings, the sills and string courses, the parapet's top edge run ruler-straight for 50 m, which only a computer
draws. A real 1893 facade was set by hand, piece by piece, and has settled since: its long lines undulate slightly, each
terracotta block a little out of line with the next. The owner, on the suggested weathered version of the top floor
(2026-10-10): "one thing also present in the suggestion is that the lines are not straight, they are like 'waves' not
perfectly flat (on the edges)".

# Request

Let the long lines of the trim read hand-set: slightly uneven along their length, visible on their edges and in their
silhouettes against the sky, without looking bent or broken.

Tasks:
- Along each long run of trim (the cornice and its parts, the dentil course, the band mouldings, the sills and string
  courses, the parapet top), the line undulates by a few millimetres: each piece set slightly out of line with its
  neighbours (in and out, up and down, a hair of rotation), seeded per piece, so the run reads as a row of hand-set
  blocks; optionally a gentle settlement along the run between supports. No visible kinks, gaps or overlaps between
  pieces, and the pieces stay in contact with the wall behind them.
- The irregularity has a physical source (the pieces and how they were set and have settled), not a noise field; it
  follows the same piece boundaries as AI 607's tones, so a block's tone and its set go together.
- The silhouette changes, so this is geometry: a texture or normal map only shades a ruler-straight edge, and the
  waves show exactly where it cannot help (lines against the sky, edges at grazing angles). The approach, chosen by the
  owner on 2026-10-10 ("lets use geometry copies"): geometry copies through the wear layer's geometry-feature mechanism,
  as AI 570's chips are made -- each long run of trim copied, given vertices along its length where it has none
  (rings every 20 to 30 cm), divided into pieces at a terracotta block's length along the run (the same run coordinate
  and piece boundaries as AI 607's tones), each piece moved by its own seeded few millimetres and a hair of rotation,
  blended smoothly across the joints; the copies in WEAR_GEO_<feature>, the originals kept in WEAR_ORIG_<feature> and
  switched at render time. Not Cycles true displacement (heavy subdivision, bulging along normals, cracks at corners)
  and not a modifier on the linked originals. The meshes themselves are not edited, and the wear layer's masks, the
  render-time rounding and the ground floor's UV maps keep lining up.
- Named controls: the feature's switch at render time (off: the originals, today's straight lines exactly; the group
  switch turns it off too), and the amplitude and seed as build parameters of the copies (a wear-layer rebuild).
- Evidence: the shared composites, the cornice against the sky (render_poses.py pose 12 and a raking view along a
  facade where the lines read best, e.g. along_broadway), and the revert check.

## Group: Bradbury weathering realism (AI 605-610)

This prompt is step 6 of a six-step group, done in this order, each reviewed and approved by the owner before the next
one starts (the next step starts from the approved state):

1. AI 605 -- light staining beneath ledges, up high:
   `prompts/AI_buildings_605_BUILDINGS_bradbury_weathering_ledge_staining_up_high.md`
2. AI 606 -- dust in the carving's recesses:
   `prompts/AI_buildings_606_BUILDINGS_bradbury_weathering_cavity_dirt_in_carving.md`
3. AI 607 -- a tone of its own for every terracotta piece:
   `prompts/AI_buildings_607_BUILDINGS_bradbury_weathering_per_piece_terracotta_tone.md`
4. AI 608 -- per-pane glass, for more natural reflections:
   `prompts/AI_buildings_608_WINDOWS_bradbury_weathering_per_pane_glass_variation.md`
5. AI 609 -- worn arrises and chips on the upper trim:
   `prompts/AI_buildings_609_BUILDINGS_bradbury_weathering_worn_arrises_and_chips_up_high.md`
6. AI 610 -- hand-set lines: the long edges not ruler-straight (owner, same day: "the lines are not straight, they are
   like 'waves' not perfectly flat (on the edges)"):
   `prompts/AI_buildings_610_BUILDINGS_bradbury_weathering_hand_set_uneven_lines.md` (this prompt)

A warmer, less pastel overall grade (the suggestion is also more saturated) is deliberately not part of the group: a
grade change touches everything, and the ground floor's pink cast was rejected on 2026-10-08.

Shared reference: the owner's render of the top floor and the suggested weathered version, copies in
`tests/artifacts/screens/bradbury_weathering/references/` (`render_cornice_top_2026-10-10.png`,
`suggestion_weathered_cornice_top.png`).

Shared rules (every step):
- The owner's rule for wear, rejected twice otherwise: no procedural noise, no random scatter, no mottle. Every mark
  comes from a physical source on the model -- a ledge, a recess, a joint, a pane, an arris -- and follows a physical
  path from it; irregularity inside a mark comes from the surface's own maps or from its source's shape.
- No repeated patterns: identical marks at every window read as fake too. Vary per instance (seeded); rare marks stay
  rare and unique.
- Revertible: every change is a named control with one documented value that reproduces the look before the step
  exactly (checked: the same pose rendered on OptiX alone before the step and after it with the control at that value,
  at most 1 8-bit level apart at any pixel), and one group switch reverts every step at once to the look before AI 605.
  AI 605 creates that switch; this step plugs its own controls into it.
  Controls work at render time where possible (scene properties the materials read, like `wear_<feature>`), so trying
  a value needs no rebuild; `render_wear.py` and `build_scene.py` accept them.
- Non-destructive: the meshes' geometry is not edited (UV maps and attributes may be added; geometry features keep
  their originals and switch, as AI 570 does).
- Part of the pipeline (wear_layer.py, assemble_building.py), so `python use_capital_stage.py 2` rebuilds keep it, and
  documented in the BradburyBlock README (what, the controls and their revert values, render-time cost).
- Evidence under `tests/artifacts/screens/bradbury_weathering/<id>/`, gitignored: for each pose one composite
  [suggestion | before | after] (the suggestion where the pose matches it), poses from `render_poses.py`: 12
  cornice_top_closeup, 02 hero_southeast, 04 along_broadway, 07 ground_floor_street (nothing at street level breaks),
  plus the step's own close-up. Report the render time before and after for one pose.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_610_BUILDINGS_bradbury_weathering_hand_set_uneven_lines_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completion summary (2026-10-12, approved by the owner; the group AI 605-610 is complete)
- New wear feature `hand_set` (`wear/features/hand_set.py`, `wear_hand_set`, 0 shows the originals): geometry copies of 124 pieces (crown, band 4-5 with its brackets, impost course, sills) whose long lines undulate as hand-set, settled blocks -- per AI 607 block a sha256-drawn settle (<=3 mm), roll (<=2.5 mm), nose pitch about the wall (<=0.006 rad) and plan yaw (<=0.004 rad), plus three long settlement waves per course (<=4 mm); blended over 8 cm at joints, faded at facade ends, all downward or about the wall (no gaps); long edges cut every 0.127 m first; 254,455 vertices, at most 14 mm of movement.
- Pieces AI 609 also chipped exist in four combinations (`wear_combo`, `controls.COMBO`, `apply_combos`); all eight states of the two features and the group switch show each piece exactly once.
- Revert: `wear_hand_set=0` against step 5 on pose 12, mean 0.007, max 4 levels; render time unchanged.
- Evidence: `tests/artifacts/screens/bradbury_weathering/610/v1/` (raking crops along Broadway's crown and band, sheets, composite); README "The weathering-realism group".
