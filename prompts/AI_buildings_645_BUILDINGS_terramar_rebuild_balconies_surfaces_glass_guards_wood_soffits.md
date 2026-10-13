# Problem

In `b8.png`, every residential balcony is a projecting slab 1.5 m deep all around the building, with rounded corners
and a frameless glass guard with a slim top rail. Every slab underside is a warm orange-brown wood ceiling: the
balconies, the loggia ceilings and the overhangs (from the superseded AI 617). The first residential floor's guards
run right along the podium edge, with flower planters behind them, so its terrace reaches that edge (from the
superseded AI 621). The front centre bay is a flush loggia between the pilasters. The rebuild's structure (AI 643) has
the bare slabs only.

# Request

Build the balconies layer: walking surfaces, glass guards and wood soffits, all around the building.

Tasks:
- Add walking surfaces on every balcony slab, with a small step at the door line, and the first residential floor's
  terrace on the podium roof out to the podium edge.
- Run the glass guards along the balcony edge: continuous, curving through the rounded corners, with a slim top rail
  and fixing shoes. They stop against the pilasters and columns where b8 shows that. Also add the flush loggia's
  guards between the pilasters and the first floor's guards on the podium edge.
- Put warm wood soffits on every slab underside, matched in tone to b8 under the calibrated rig.
- Reserve the planter positions for the props: AI 627 (balconies) and AI 628 (podium edge).
- Evidence:
  - `CAM_B8` beside b8;
  - close-ups of a rounded corner and its guard, a soffit, and the podium-edge guard;
  - the audit.

## Context
- Part of the Terra & Mar from-scratch rebuild (AI 642, DONE).
  - Plan file: `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/terramar_plan.json` (the
    `balcony_edge` layer with its slab tops and `centre_bay`; new dimensions go in through `make_plan.py`).
  - Work file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend`, with one idempotent layer
    script under `rebuild/`.
  - Needs AI 643 (structure); AI 644 (envelope) gives the door positions.
- **The target is `b8.png`**, judged from `CAM_B8`. The aerial is supplementary, and the AI 3D models are for
  consultation only.
- Blender only:
  - no engine code, building config or catalog change;
  - nothing of the Bradbury's is edited;
  - prefer the headed Blender through MCP; scripts must also run headless.
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/645_balconies/`, holding
  [b8 | before | after] composites.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_645_BUILDINGS_terramar_rebuild_balconies_surfaces_glass_guards_wood_soffits_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the layer script, its collections, the evidence paths
  and the audit result
