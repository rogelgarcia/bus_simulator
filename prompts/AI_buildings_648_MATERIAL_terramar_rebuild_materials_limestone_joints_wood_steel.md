# Problem

The rebuild's layers (AI 643–647) carry material slots, not the final look. In `b8.png`:
- the walls, pilasters, podium and slab edges are clad in a pale, warm, travertine-like limestone, with visible
  large-format panel joints, soft veining and no grime (from the superseded AI 619);
- the soffits and reveals are warm wood;
- the frames are black steel, the guards clear glass, and the lettering dark bronze.

The user's PBR kit (installed by AI 640) supplies the stone, `assets/public/pbr/terramar_continuous_limestone/`:
- a seamless ivory-beige honed limestone, 4096 × 4096 for a 4 × 4 m repeat;
- on purpose, it has no joints, grout or block outlines. The kit README says to make the gaps and edge bevels in
  geometry, and to give the blocks different UV regions to hide the repeat;
- its displacement range is 1.5 mm.

# Request

Give the rebuild its materials, with the kit limestone's panel joints made in geometry.

Tasks:
- Assign the materials across every layer: the kit limestone, warm wood, black steel, glass, and dark bronze for the
  lettering. Match each to b8 under the calibrated rig (sun azimuth 45° / elevation 55°, the game's calibrated
  exposure).
- Make the limestone's joints as geometry. Choose a large-format panel layout per run from b8, with bevelled panel
  edges and a UV offset per panel so the 4 m repeat does not show.
- Keep the stone clean: no procedural weathering or soiling noise (the user rejected it twice on the Bradbury).
  Correct the tone and the material contrast instead.
- Evidence:
  - `CAM_B8` beside b8;
  - close-ups of a pilaster, a slab edge, a soffit and the sign;
  - the joint layout per run.

## Context
- Part of the Terra & Mar from-scratch rebuild (AI 642, DONE).
  - Work file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend`, with one idempotent
    script under `rebuild/`.
  - Panel sizes and joint widths go into the plan file through `make_plan.py`.
  - Needs AI 640 (kit install) and the geometry layers it dresses (AI 643–647).
- **The target is `b8.png`**, judged from `CAM_B8`. The aerial is supplementary, and the AI 3D models are for
  consultation only.
- Blender only:
  - no engine code, building config or catalog change;
  - nothing of the Bradbury's is edited;
  - prefer the headed Blender through MCP; scripts must also run headless.
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/648_materials/`, holding
  [b8 | before | after] composites.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_648_MATERIAL_terramar_rebuild_materials_limestone_joints_wood_steel_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the scripts, the materials and their sources, the
  joint layout, and the evidence paths
