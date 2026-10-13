DONE

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
- Installed by AI 640 (2026-10-13): `assets/public/pbr/terramar_continuous_limestone/` (basecolor, normal_gl, arm =
  AO/roughness/metallic, 16-bit height; 4 x 4 m repeat, OpenGL +Y normals, displacement 1.5 mm total at midpoint 0.5),
  and the two sign sets the podium layer already uses. Not registered in the game catalog; see the authoring README,
  "The Terra & Mar PBR kit sets".

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_648_MATERIAL_terramar_rebuild_materials_limestone_joints_wood_steel_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the scripts, the materials and their sources, the
  joint layout, and the evidence paths

## Summary (2026-10-13)
- **References read:**
  - b8, gridded and high-pass enhanced crops: the pilasters carry five stone courses per storey; the sign band reads as three courses with panels about 0.7-0.9 m wide; the joints are faint thin lines;
  - the stone is pale warm cream with soft veining and no grime; the reveals are honey teak; the soffits are darker orange-brown; the frames are black and the guards clear.
- **Plan** (`rebuild/make_plan.py` `MATERIALS` + `materials()`, written to `plan["materials"]`):
  - families -> `TM_RB_*` slots, each with its tone;
  - the joint layout: 8 mm grooves, 6 mm deep, 3 mm bevels;
  - 15 datums -> 14 bands -> 48 course planes near 0.67 m (five per tower storey, three courses across the sign band with the slab edge);
  - vertical joints: equal panels of at most 1.2 m per flat face at least 0.2 m tall.
- **Materials pass** (`rebuild/layer_materials.py`; `build.py` appends it after any geometry layer it rebuilds, `materials=0` skips it):
  - **stone:** the kit limestone `assets/public/pbr/terramar_continuous_limestone` (AI 640: basecolor, arm, normal_gl, 4 m repeat) through the node group `TM_RB_limestone`, tone (1.24, 1.113, 1.115) on fascia, pilaster, column, podium and penthouse stone; the same group at 0.86 for paving, thresholds and slab tops;
  - **wood:** warm teak (0.46, 0.25, 0.10) on `TM_RB_wood`, flat, since no wood texture is installed;
  - **soffit:** AI 645's b8-matched tone (0.31, 0.125, 0.085);
  - **the rest:** black powder-coated steel on frames and louvres, clear glass (IOR 1.5), plaster ceilings, a warm interior floor, concrete;
  - **lettering:** the kit's own dark-bronze sign sets, kept from AI 646.
- **Joints in geometry** (same script):
  - z-planes are cut only into course faces whose height holds the groove; vertical joints are cut per flat face and carried over the stone soffit or top they meet;
  - each original face is tracked through its splits with an int face layer;
  - strip vertices are pushed by the least-squares direction of the faces they lie on; groove floors get `TM_RB_stone_joint`; twisted bevel crossings are split along their mitre;
  - each panel gets a seeded UV offset, so the 4 m repeat never lines up;
  - objects are tagged `rb_joints` and cut once.
  - Result: 22 objects, 779 vertical joints, 1284 panels, 1.9 s. Degenerate, non-planar and non-manifold faces: all 0. The same counts headless from a fresh session, and a podium-only rebuild re-cuts just its 2 stone objects.
- **Fixes the audit drove:** float32 coordinates defeated a 1 µm strip tolerance (now 0.2 mm), and a soffit got the same plane from both of its faces (planes are now canonical).
- **Tones** (`rebuild/sample_tones.py`, b8 boxes vs the `CAM_B8` Cycles render):
  - soffit 89/53/27 vs 86/53/26;
  - shaded teak reveal 101/69/33 vs 100/69/45;
  - podium stone 200/191/181 vs 203/193/187;
  - lit pilasters and fascia 205-206 vs 215-220. The hue matches, but they stay ~12 levels short: the kit's red albedo is already ~0.95, and the rig's AgX shoulder would need more than 1.
  - No weathering or soiling noise.
- **Joint layout evidence:** `rebuild/compose_joint_layout.py` draws one elevation per run from `tests/artifacts/blender/terramar_recessed/rebuild/joint_layout.json`.
- **Poses:** new `pilaster_closeup` and `joint_detail_pilaster`; 648 tagged on `b8_calibrated`, `full_front_left`, `corner_slabs_front_right`, `soffits_worms_eye`, `front_centre_bays`, `stone_cladding_closeup`, `entrance_sign`.
- **Checks:** audit 81 objects, 0 z-fights, 0 penetrations; hidden parts visible from b8: 0 px.
- **Evidence** in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/648_materials/`:
  - `poses/rebuild_pre648_vs_rebuild/`: [b8 | before | after] for `b8_calibrated`, [before | after] for the other 8 poses;
  - `joint_layout.png`, `joint_layout_summary.json`;
  - `tone_boxes.png`, `tone_samples.json`;
  - `check_sheet.png`, `checks.json`, `terramar_rebuild.audit.json`.
  - The "before" file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre648.blend`.
