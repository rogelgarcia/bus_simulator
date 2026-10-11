DONE

# Problem

The carved and moulded relief of the Bradbury block reads flat and washed out: the floral frieze under the main cornice,
the medallion field of the band between floors 4 and 5, the dentil courses, the brackets and the capitals all show
their relief only through light and shade, with every hollow as clean as the faces around it. In the owner's suggested
weathered version of the top floor (2026-10-10), dust and grime have settled into the recesses -- the scrolls of the
frieze, the gaps between dentils, the undersides of the brackets -- which is what gives the carving its depth.

# Request

Let dirt settle into the carving's recesses, as it does on a real 1893 facade, so the relief reads deep without the
faces getting dirtier.

Tasks:
- The hollows of the relief hold darker dust: the frieze tiles' scrolls, the band's medallions, the gaps between the
  dentils and the brackets, the capitals' leaves and volutes, the arch rings' mouldings; the faces and the outer edges
  stay as clean as now. More on hollows that face up or out of the rain (where dust settles and stays), less where
  water washes.
- Two kinds of relief, one rule: modelled relief (dentils, brackets, mouldings, capitals) takes its recesses from the
  geometry at render time; texture relief (the frieze tiles, the band ornament, the lettering, the carved capitals'
  atlas) from the texture set's own occlusion and height maps. Nothing is painted where there is no recess.
- The step's grime is a cavity effect, not a new colour: the darkening keeps the hue of the wear layer's soiling, so it
  reads as the same dirt.
- Named controls: the strength (revert value 0, today's look exactly) and how far into the relief it reaches; report
  the render-time cost of any render-time occlusion (same pose, before and after).
- Evidence: the shared composites and a close-up of the frieze and dentils (render_poses.py pose 12 at least, plus a
  closer frame of the frieze), and the revert check.

## Group: Bradbury weathering realism (AI 605-610)

This prompt is step 2 of a six-step group, done in this order, each reviewed and approved by the owner before the next
one starts (the next step starts from the approved state):

1. AI 605 -- light staining beneath ledges, up high:
   `prompts/AI_buildings_605_BUILDINGS_bradbury_weathering_ledge_staining_up_high.md`
2. AI 606 -- dust in the carving's recesses:
   `prompts/AI_buildings_606_BUILDINGS_bradbury_weathering_cavity_dirt_in_carving.md` (this prompt)
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
  - `prompts/AI_DONE_buildings_606_BUILDINGS_bradbury_weathering_cavity_dirt_in_carving_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completion summary (2026-10-11, approved by the owner)
- New wear feature `cavity` (`wear/features/cavity.py`, `wear_cavity`, 0 reverts; `wear_cavity_reach`): dust in the relief's hollows -- modelled relief by Cycles AO over 6 cm on masonry, drawn relief (flower tiles, medallion band, lettering, frieze flowers) by the low of each set's height map on faces `apply()` tags (7 block + 3 portal objects); soiling's deposit colour; capitals (unclassed) keep their baked AO.
- Strength from the owner's sweep (0.6 / 1 / 1.6, "use a more subtle approach; value 1 or even less"): calibrated amount 0.44 = 0.8 x the first.
- Revert: `wear_cavity=0` (and `realism=off`) give step 1's look, pose 12 max 1 level; render time unchanged (pose 12 28-31 s off/on at 1600x1000, 96 spp, OptiX).
- Mid-step, the shared assets were deleted by another session's worktree archival and restored from a snapshot; the Bradbury area was audited exact (`tests/artifacts/screens/bradbury_fix/recovery_audit_2026-10-11/AUDIT.md`), and `make_ground_floor_pbr.py` gained `--stage DIR` for regenerating into staging.
- Evidence: `tests/artifacts/screens/bradbury_weathering/606/` (sweep, v1 sheets with 1:1 crops, x8 heat maps, debug view); README "The weathering-realism group".
