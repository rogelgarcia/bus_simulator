DONE

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

## Summary (2026-10-13)
- **b8 read** (gridded crops of the right corner and the left podium edge): frameless clear glass guards with a slim dark top rail about 1.0 m above the floor, on a dark base shoe just behind the slab fascia, following the rounded corners; floor 1's guards on the podium edge with planters behind; warm wood soffits with small downlights.
- **Layout in the plan** (`rebuild/balcony_layout.py`, called by `make_plan.py`, written to `plan["balconies"]`):
  - walking-surface pieces from the window frames' outer face to the guard shoe, split at the pilasters and stepping round the six column fronts (3 mm clear);
  - guard runs on the guard line, stopping against the pilasters: 71.9 m round the building and 5.3 m across the centre loggia;
  - 32 downlight points per soffit;
  - reserved prop slots: 140 planter slots for AI 627 and five podium-edge planter strips on floor 1 for AI 628.
  - In b8 the chamfer columns break the guard at the slab edge; in the approved plan they stand 1.3 m back, so the guard passes in front of them.
- **Balconies layer** (`rebuild/layer_balconies.py` -> `RB_BALCONIES`, 20 objects, 8930 faces, all manifold), per floor 1–5:
  - 30 mm stone paving; floor 1 is the terrace out to the podium edge;
  - the guard: shoe and rail in black, 245 frameless glass panels of at most 1.6 m with 10 mm joints;
  - a 15 mm stone threshold before every door pane listed in `plan["envelope"]`, the small step up to the 50 mm sill;
  - downlights under the soffit.
  - New placeholder materials `TM_RB_paving`, `TM_RB_threshold`, `TM_RB_downlight`. `build.py` registers the layer. The envelope's corner posts now sample their arc like the plan's fillets, so the paving meets them exactly.
- **Warm wood soffits:** the layer sets `TM_RB_soffit` (every balcony underside) to `plan["balconies"]["soffit_rgb"]`, matched to b8 under the calibrated rig in two Cycles iterations from `CAM_B8`: (0.62, 0.50, 0.38) → (0.31, 0.125, 0.085). Rendered soffits are within about 5 levels of b8's at three soffit boxes: centre 87/55/31 vs 86/53/26, chamfers 106/77/51 vs 102/72/49 and 74/57/32 vs 76/53/34.
- **Checks:** from `CAM_B8` the guard rails follow b8's rails along the balcony edges and the downlights sit where b8 shows its soffit dots; the core stays hidden over the roof (0 px).
- **Audit:** 53 objects, 0 z-fights, 0 penetrations (1042 contacts: glass against frames, paving against frames and the guard shoe).
- **Evidence** in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/645_balconies/`:
  - `check_sheet.png`, `check_b8_overlay.png`, `zoom_corner_b8_vs_overlay.png`, `checks.json`;
  - `terramar_rebuild.audit.json`;
  - `poses/`: Cycles [b8 | edit | rebuild] for `b8_calibrated`, and [edit | rebuild] for `corner_slabs_front_right`, `chamfer_left_balconies`, `soffits_worms_eye`, `podium_top_chamfer_right`, `full_front_left`, `rebuild_rear`.
