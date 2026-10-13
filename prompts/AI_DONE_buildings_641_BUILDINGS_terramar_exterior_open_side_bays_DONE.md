DONE (SUPERSEDED)

# Problem

Terra & Mar (exterior): on the residential floors of the sides (runs C and G), the game's recessed-balcony conversion
left a solid brick "prow". It is a 2.44 m wall at the facade line (t 2.18–4.62 on each side run), flanked by splayed
walls that are the end walls of the neighbouring chamfer loggias. The side window (`window_b8_residential_side`,
about 1.88 m wide) sits 1.75 m behind that wall, buried and invisible, with its platform and guard buried with it.

Since AI 616, the deep wrap-around balconies run along the whole side in front of this prow, so each side's deep
balcony fronts a blank brick wall with no door. The supplementary aerial shows the sides glazed behind continuous
balconies; `b8.png` barely sees the sides.

# Request

Open the side bays so that the deep wrap-around balconies front glazing, as the aerial suggests, while staying
consistent with `b8.png`.

Tasks:
- On a copy of the residential wall shell (`wall__14`, original set aside), remove the prow's front wall on floors
  1–5 of C and G. Build the side cavity: side walls, a back wall with the window opening, and the floor (the buried
  side platform or new). The ceiling comes from the AI 615 slab rings.
- Bring the side window to the cavity's back wall, or forward to the facade line if that reads closer to the
  reference. Decide from the aerial, record the choice, and move copies (originals set aside).
- Give the splayed end walls and the new cavity the stone (or reveal) finish the reference shows instead of brick
  (coordinate with AI 618 and AI 619).
- Evidence: `side_right_faceon`, `full_rear_right_aerial` and `chamfer_left_balconies`, before and after
  (`render_poses.py -- items=641`; tag those poses with 641 in `poses.json`). Run the audit afterwards.

## Context
- Work file `tests/artifacts/blender/terramar_recessed/edit/terramar_recessed_edit.blend`; follow the authoring
  README's editing rules (piece script under `pieces/`, `TM_REPLACED`, copied shared meshes, UVs, `TM_*` materials,
  evidence and audit).
- The target is `b8.png`; the aerial is supplementary; the AI 3D models are for consultation only.
- Blender only; nothing of the Bradbury's is edited.
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/641_exterior_open_side_bays/`.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_641_BUILDINGS_terramar_exterior_open_side_bays_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what
  went to `TM_REPLACED`, the evidence paths and the audit result

## Superseded (2026-10-12, by the owner's decision)
Not implemented as written. The user restarted Terra & Mar as a from-scratch, layered Blender model (AI 642: approved
plan option E, `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/terramar_plan.json`), so this edit
to the game-extracted copy will not be made. Its findings carry over to AI 644 (envelope): the side runs C and G glazed behind the continuous balconies. The edit copy
(`tests/artifacts/blender/terramar_recessed/edit/terramar_recessed_edit.blend`, with AI 615/616) stays as a reference.
