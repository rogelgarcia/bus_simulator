# Problem

The rebuild's podium (AI 643) is a bare volume. `b8.png` shows:
- **Ground storefronts:** black steel grids, slender mullions in two or three large panes, under a transom band.
- **Entrance:** a projecting volume with a warm-wood-lined portal, black-framed glass double doors, sidelights and a
  transom.
- **Upper podium:** above the entrance, the centre glazing sits in a wood-lined recess.
- **Sign:** `TERRA & MAR`, with `COASTAL KITCHEN` smaller beneath it, centred on the entrance volume's stone band in
  dark bronze, upright serif capitals (from the superseded AI 625).
- **Chamfers:** a glass guard along the base of the upper-podium glazing, just above the storefront awnings, with long
  planter boxes behind it (from the superseded AI 621).
- **Lanterns:** small dark lanterns on the storefront piers (from the superseded AI 624).

# Request

Build the podium layer: the storefronts, the entrance, the upper-podium glazing and guards, and the sign, following
b8.

Tasks:
- Lay out the podium's stone piers and bands from the podium outline, with the storefront grids between them on the
  ground storey and the upper-podium glazing above.
- Build the entrance portal in the projecting entrance volume, with its wood lining, doors, sidelights and transom,
  and the wood-lined recess above it.
- Make the sign from the user's kit lettering, installed by AI 640 as `assets/public/pbr/terramar_sign_terra_and_mar/`
  and `assets/public/pbr/terramar_sign_coastal_kitchen/`. Use real letter geometry for close side views, with the
  kit's maps sampled onto it, as the kit README says.
- Add the chamfers' upper-podium glass guard and the lanterns.
- Reserve positions for the props: awnings (AI 631), podium planter boxes (AI 628), and the sidewalk café and street
  planters (AI 632, AI 633).
- Evidence:
  - `CAM_B8` beside b8;
  - close-ups of the entrance and sign, a storefront bay and the chamfer guard;
  - the audit.

## Context
- Part of the Terra & Mar from-scratch rebuild (AI 642, DONE).
  - Plan file: `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/terramar_plan.json` (the
    `podium` and `entrance` layers, the levels; new dimensions go in through `make_plan.py`).
  - Work file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend`, with one idempotent layer
    script under `rebuild/`.
  - Needs AI 643 (structure); the sign needs AI 640 (PBR kit install).
- **The target is `b8.png`**, judged from `CAM_B8`. The aerial is supplementary, and the AI 3D models are for
  consultation only.
- Blender only:
  - no engine code, building config or catalog change (the kit is read from where AI 640 installs it);
  - nothing of the Bradbury's is edited;
  - prefer the headed Blender through MCP; scripts must also run headless.
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/646_podium/`, holding
  [b8 | before | after] composites.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_646_BUILDINGS_terramar_rebuild_podium_storefronts_entrance_lettering_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the layer script, its collections, the evidence paths
  and the audit result
