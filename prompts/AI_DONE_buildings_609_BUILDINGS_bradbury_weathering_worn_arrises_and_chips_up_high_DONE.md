DONE

# Problem

On the Bradbury block's upper floors every arris of the trim is intact: the cornice nose, the band mouldings, the sills
and the arch rings have only the render-time rounding of AI 576, which softens them but never breaks them. The wear
layer's edge wear and chips (AI 570) were built for street level, where people and carts knock the stone. The owner's
suggested weathered version of the top floor (2026-10-10) shows "worn edges": lighter, slightly broken arrises along
the upper trim.

# Request

Let the upper trim's edges show their age: worn, lighter arrises and a few small chips where weather attacks them.

Tasks:
- Worn arrises up high: the exposed outer edges of the cornice nose, the band mouldings, the sills and the arch rings
  read slightly lighter and softer along their length -- weathered, not painted -- following the edges themselves;
  inner and sheltered edges stay crisp.
- A few small chips on the most exposed upper edges (outer corners of sills, the cornice nose, block ends), rare and
  each unique (seeded size and shape), as AI 570's chips are made (worn copies of the pieces, the originals kept and
  switched), never one at every window.
- The street-level edge wear and the render-time rounding keep working as they do.
- Named controls: the upper arrises' strength (revert value 0) and the chips (revert off), each reproducing today's look
  at its revert value.
- Evidence: the shared composites, a close-up of a sill and of the cornice nose, and the revert check.

## Group: Bradbury weathering realism (AI 605-610)

This prompt is step 5 of a six-step group, done in this order, each reviewed and approved by the owner before the next
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
   `prompts/AI_buildings_609_BUILDINGS_bradbury_weathering_worn_arrises_and_chips_up_high.md` (this prompt)
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
  - `prompts/AI_DONE_buildings_609_BUILDINGS_bradbury_weathering_worn_arrises_and_chips_up_high_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completion summary (2026-10-12, approved by the owner)
- Worn arrises up high: the AI 576 edge band's upper term (`wear/edges.py`, `edge_worn_upper`, 0 reverts): on terracotta trim and arch rings, 8 % lighter in hue and +0.10 rough where the arris faces up/out, ramping in over 6.5-9.0 m.
- New wear feature `upper_chips` (`wear/features/upper_chips.py`, `wear_upper_chips`, 0 shows the originals): 29 small chips at block joints on the noses of the crown, the band's top moulding, the impost course and the sills, each site's own sha256 draw (rare, unique; AI 570's chip shapes at 0.85x), cut as worn copies with an exact boolean; fresh-clay scars.
- `controls.REALISM_GEO`: the group switch hides geometry features' copies and shows the originals.
- Strength chosen to the owner's standing subtle rule; a first build's sill-corner chips (hidden in the jambs) were dropped.
- Revert: both off against step 4 on pose 12 and the window close-up, max 1 level; render time unchanged.
- Evidence: `tests/artifacts/screens/bradbury_weathering/609/v1/`; README "The weathering-realism group".
