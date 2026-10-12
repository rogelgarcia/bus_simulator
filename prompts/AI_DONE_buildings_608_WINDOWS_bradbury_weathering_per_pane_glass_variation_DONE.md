DONE

# Problem

Every window pane of the Bradbury block is perfectly flat, perfectly aligned with its neighbours and made of the same
glass, so along a facade the windows reflect one continuous, uniform gradient of sky. Real panes in an old building are
never coplanar: each sits at its own slight angle in its frame and carries its own faint tint and polish, so each
reflects a slightly different piece of the sky and the street. The owner's suggested weathered version of the top floor
(2026-10-10) asks for "more natural glass reflections".

# Request

Make each pane reflect a little differently from its neighbours, so the windows read as separate panes of old glass.

Tasks:
- Each pane is tilted by its own small seeded angle (a fraction of a degree to about a degree, chosen with the owner),
  so its reflection shifts against its neighbours'; each takes a slight seeded difference of roughness and tint. The
  panes stay flat (no ripples) unless the owner asks for old wavy glass.
- If the reflections still read as one smooth gradient because the sky map is cloudless, consider giving the
  reflections (not the visible sky) a sky with some cloud, as the scene's world already separates what the camera sees
  from what lights the block; decide with the owner.
- The glass grime (AI 571), the glass's transmission and the interiors behind the panes (the backdrops, the parallax
  lobby) keep working as they do.
- Named controls: the tilt (revert value 0), the roughness and tint variation (revert 0) and the reflection sky (revert
  off), each reproducing today's look at its revert value.
- Evidence: the shared composites, a close-up of a run of windows at an angle that shows reflections (along_broadway
  and the top floor), and the revert check.

## Group: Bradbury weathering realism (AI 605-610)

This prompt is step 4 of a six-step group, done in this order, each reviewed and approved by the owner before the next
one starts (the next step starts from the approved state):

1. AI 605 -- light staining beneath ledges, up high:
   `prompts/AI_buildings_605_BUILDINGS_bradbury_weathering_ledge_staining_up_high.md`
2. AI 606 -- dust in the carving's recesses:
   `prompts/AI_buildings_606_BUILDINGS_bradbury_weathering_cavity_dirt_in_carving.md`
3. AI 607 -- a tone of its own for every terracotta piece:
   `prompts/AI_buildings_607_BUILDINGS_bradbury_weathering_per_piece_terracotta_tone.md`
4. AI 608 -- per-pane glass, for more natural reflections:
   `prompts/AI_buildings_608_WINDOWS_bradbury_weathering_per_pane_glass_variation.md` (this prompt)
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
  - `prompts/AI_DONE_buildings_608_WINDOWS_bradbury_weathering_per_pane_glass_variation_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completion summary (2026-10-11, approved by the owner)
- New wear feature `pane_glass` (`wear/features/pane_glass.py`, `wear_pane_glass`, 0 reverts; `_tilt`, `_vary`): per pane a seeded tilt of the shading normal up to 1.2 deg about two in-plane axes, roughness +-0.03 and tint +-4.5 % green/blue; panes = connected glass per mesh (235) x Object Info Random per window.
- `nodes.wear_material` now routes glass normals through the layer even without a normal map (the surface's own shading normal: no change by itself).
- Strength from an internal sweep, chosen to the owner's new standing rule (subtle, not clearly visible); the optional reflection-only cloud sky was not needed (the sky map already carries cloud).
- Revert: `wear_pane_glass=0` against step 3 on poses 04 and 12, max 1 level; render time unchanged.
- Evidence: `tests/artifacts/screens/bradbury_weathering/608/` (sweep, v1 sheets with 1:1 crops, x8 heat maps); README "The weathering-realism group".
