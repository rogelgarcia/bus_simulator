# Problem

In `b8.png`, the residential roof ends in a deep pale slab with rounded corners, thicker than the floor fascias. A
continuous frameless glass guard with a slim top rail runs along it, with planters and small trees behind. The aerial
shows the guard all the way round (from the superseded AI 620).

The user kept the penthouse, set back out of b8's view (AI 642): about 10 × 7.5 m at the rear of the roof. Seen from
`CAM_B8`, its front wall stays hidden up to 5.49 m above the roof top. The supplementary aerial also shows:
- a darker annex with a louvred, slatted roof on the penthouse's −X side (from the superseded AI 622);
- solar panels over most of the penthouse roof and a few mechanical units (from the superseded AI 623).

# Request

Build the roof layer: the roof edge and its glass guard, the terrace surface, and the penthouse with its annex and
roof equipment, all out of b8's view.

Tasks:
- Build the roof slab edge on the plan's roof-edge outline, with its thickness and rounded corners, and the glass
  guard with a slim top rail on the roof guard line.
- Lay the terrace surface, with the drainage falls hidden.
- Build the penthouse on the plan rectangle:
  - walls and glazing as the aerial suggests;
  - the annex with its louvred roof;
  - the solar array and the mechanical units.
- Keep all of it below the `CAM_B8` sightline. Prove it with a `CAM_B8` render that shows none of it (the massing
  check in `compose_massing.py` counts the penthouse's pixels the same way).
- Reserve the terrace zones for planters, trees, furniture and paving (props AI 629 and AI 630). The penthouse
  interior is AI 638.
- Evidence:
  - `CAM_B8` beside b8;
  - the aerial roof comparison (roof plane only);
  - a rear three-quarter view with the penthouse;
  - the audit.

## Context
- Part of the Terra & Mar from-scratch rebuild (AI 642, DONE).
  - Plan file: `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/terramar_plan.json` (the
    `roof_edge`, `roof_guard_line` and `penthouse` layers; new dimensions go in through `make_plan.py`).
  - Work file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend`, with one idempotent layer
    script under `rebuild/`.
  - Needs AI 643 (structure, including the core under the penthouse).
- **The target is `b8.png`**, judged from `CAM_B8`. The aerial is supplementary: its roof plane matches the fitted
  `CAM_AERIAL`, but its facades do not. The AI 3D models are for consultation only.
- Blender only:
  - no engine code, building config or catalog change;
  - nothing of the Bradbury's is edited;
  - prefer the headed Blender through MCP; scripts must also run headless.
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/647_roof/`, holding
  [b8 | before | after] composites.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_647_BUILDINGS_terramar_rebuild_roof_edge_guard_penthouse_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the layer script, its collections, the penthouse
  sightline check, the evidence paths and the audit result
