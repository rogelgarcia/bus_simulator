DONE

# Problem

The Bradbury block still reads very clean in the Blender renders, most of all up high: the top floor, its arched
windows and the main cornice look freshly built (owner, 2026-10-10, with a render of the top floor and a suggested
weathered version of it: "the building is still very clean ... there is a 'wear' system that enhance the visuals but
looks like it could be improved"; the suggestion: "subtle terracotta variation, worn edges, light staining beneath
ledges, and more natural glass reflections").

The wear layer (AI 563-573) already has the two features that make staining beneath ledges: runoff streaks below
ledges (AI 564) and soiling in sheltered zones under overhangs (AI 565). Their masks cover the facades (about 590 m2
and 2,500 m2), but they were calibrated to stay faint, so on the upper floors -- under the main cornice and its dentil
course, under the band mouldings, under the arched windows' sills and impost mouldings -- they barely show. The
suggestion shows light, darker staining beneath exactly those ledges.

# Request

Make the staining beneath ledges read on the upper floors as it does in the suggestion: light, soft and clean, every
streak and shadow starting at a real ledge.

Tasks:
- Staining shows under the main cornice and its dentil course, under the band mouldings of the upper floors, and under
  the arched windows' sills and impost mouldings, at about the strength of the suggestion. It grows with exposure
  (higher and deeper ledges, longer drips) rather than through one global boost; the street level stays as calibrated
  unless the owner asks otherwise.
- Start from the existing features' own controls at render time (render_wear.py's wear_<feature>= strengths, and any
  height or zone control they offer) before changing their masks: show the owner a small sweep on the cornice close-up
  (render_poses.py pose 12) and choose the strength with them.
- Whatever is changed is a named control (a strength per zone or per feature, as the wear layer's controls are),
  whose revert value reproduces today's look exactly; this step also introduces the group's one switch that reverts
  every step of the group at once (see below).
- Evidence: the composites listed below, plus the masks' coverage on the upper floors (wear_layer.py elevations=1 or a
  wear=debug render), and the revert check.

## Group: Bradbury weathering realism (AI 605-610)

This prompt is step 1 of a six-step group, done in this order, each reviewed and approved by the owner before the next
one starts (the next step starts from the approved state):

1. AI 605 -- light staining beneath ledges, up high (this prompt):
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
   `prompts/AI_buildings_610_BUILDINGS_bradbury_weathering_hand_set_uneven_lines.md`

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
  This step creates that switch (and documents it); each later step plugs its own controls into it.
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
  - `prompts/AI_DONE_buildings_605_BUILDINGS_bradbury_weathering_ledge_staining_up_high_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completion summary (2026-10-11, approved by the owner)
- The owner's strength sweep on the cornice close-up (runoff and soiling raised alone and together) kept only soiling x3 ("the only one acceptable because it is subtle"); runoff turned up greyed the whole wall.
- Soiling's upper floors: `wear_soiling_upper` (default 2.0 = x3 above the ground floor, ramping in over 5.8-8.0 m above the pavement; 0 reverts), the street level unchanged.
- New wear feature `ledge_stain` (`wear/features/ledge_stain.py`, `wear_ledge_stain`, 0 reverts): the narrow strip under each upper course from runoff's drip lines (258 runs, 62 seeded drips), per-run seeded darkness and height drifting on unrelated long waves (no pattern), its edge held by the wall's joints, soiling's deposit colour.
- The group switch `wear_realism` (`wear/controls.py`): `render_wear.py realism=off` reverts the whole group; checked on pose 12: at most 1 8-bit level from the pre-605 render (mean 0.007).
- Render time (OptiX, 1600x1000, 96 spp, group off / on): pose 12 32 / 34 s, hero_3q 32 / 40, st_along 31 / 32, ground-floor street 35 / 33.
- Evidence: `tests/artifacts/screens/bradbury_weathering/605/` (sweep, v1 composites, sheets with 1:1 crops, x8 heat maps, debug view); README "The weathering-realism group".
