DONE

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

## Summary (2026-10-13)
- **b8 read** (gridded crops of the entrance and both podium chamfers, heights through the plan-fitted `CAM_B8`):
  - stone piers at the corners and under each chamfer column, two bays per chamfer;
  - black-steel storefronts (2–3 panes, transom band at 3.4–4.0 m, awning zone to 4.75 m) under a stone band;
  - deep upper recesses (5.79–9.15 m, transom at 8.55 m) with a glass guard and planter boxes at their base;
  - the projecting entrance: stone jambs about 0.57 m, a sign band from the 4.0 m portal head, a wood-lined vestibule with black-framed double doors, sidelights and a transom row on a 1 m grid, and a terrace on top before a wood-lined loggia with the same grid;
  - small dark lanterns on the entrance jambs and the outer chamfer piers.
- **Layout in the plan** (`rebuild/podium_layout.py`, called by `make_plan.py`, written to `plan["podium"]`):
  - runs, 8 corner piers (on the front they reach the entrance volume), 6 column piers, 13 bays with their storefront and upper pane spans;
  - the entrance, loggia and lantern details, and the sign placement;
  - prop reservations: awnings per storefront bay (AI 631), upper planter strips (AI 628), café zones before the chamfers (AI 632), planters beside the entrance (AI 633).
  - The structure's entrance jambs widen to b8's 0.57 m.
- **Podium layer** (`rebuild/layer_podium.py` -> `RB_PODIUM`, 14 objects, 6659 faces, all manifold): piers and lintels in `TM_RB_podium_stone`; storefront, upper-recess and entrance frames with 24 mm glass; guards (the entrance terrace's as one mitred run); recess and terrace paving; wood linings and panels; lanterns; the two sign lines. `rb_lib` gains `band`, `sub_path`, `panels` and `guard_along`; `build.py` registers the layer.
- **Real letters:**
  - `rebuild/trace_sign.py` traces the kit's opacity masks: sub-pixel marching squares at the 0.5 cutoff, Douglas-Peucker, holes nested. That gives 9 glyphs / 7 holes and 14 / 3, written to `tests/artifacts/blender/terramar_recessed/rebuild/sign/`.
  - The layer fills and extrudes them 30 mm, 15 mm off the sign band, with the kit's base colour, roughness, metallic and normal maps mapped from the card.
  - They are sized from b8 (visible widths 3.85 / 2.54 m), not the kit's suggested 3.2 / 2.1 m.
  - The maps come from the AI 640 sets when installed, else from the extracted kit. AI 640 has not run, and nothing under `assets/` was touched.
- **Audit sharpened** (`audit_collisions.py`):
  - why: `BVHTree.overlap()` never reports exactly coplanar triangles;
  - a plane-hash pass now compares same-plane faces directly, and classes them as z-fight (same facing and overlapping), adjacent (same facing, sharing an edge) or contact (opposed);
  - overlap is tested with triangle centroids, since a concave face's centroid can lie outside it;
  - the synthetic self-test covers twins, flush neighbours, stacked and sunk cubes.
  - The first run found a real bug: the podium glass had the frames' full depth. It is now 24 mm, like the residential glazing.
- **Checks:**
  - from `CAM_B8` the traced letters land on b8's lettering, the portal and loggia grids on b8's, and the chamfer storefronts and recesses with their central piers on b8's;
  - the core stays hidden over the roof (0 px).
- **Audit:** 67 objects, 0 z-fights, 0 penetrations.
- **Evidence** in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/646_podium/`:
  - `check_sheet.png`, `check_b8_overlay.png`, `zoom_podium_b8_vs_overlay.png`, `checks.json`;
  - `terramar_rebuild.audit.json`;
  - `poses/`: Cycles [b8 | edit | rebuild] for `b8_calibrated`, and [edit | rebuild] for `entrance_sign`, `stone_cladding_closeup`, `podium_top_chamfer_right`, `storefront_canopies_left`, `street_frontage`, `full_front_left`.
