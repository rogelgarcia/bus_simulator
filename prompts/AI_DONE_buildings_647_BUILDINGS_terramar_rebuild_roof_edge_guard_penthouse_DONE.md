DONE

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

## Summary (2026-10-13)
- **References read:**
  - b8: the deep rounded roof edge with a frameless glass guard and slim rail, and no penthouse in view;
  - the aerial (gridded crop): a pale stone penthouse with a parapet lip, a wood door and a black-framed slider on its front, a tall side window, slatted dark panels over its roof, three mechanical units, and a darker glazed annex with a louvred roof on its −X side.
- **Roof layout in the plan** (`make_plan.py` `roof()`, written to `plan["roof"]`):
  - the guard halves on the roof guard line and the terrace outline;
  - the penthouse rectangle, openings, cap and roof slab; the annex; four solar rows clear of the units' corner; the units;
  - the CAM_B8 sightline margins for every part above the roof;
  - the terrace prop zones (planter ring for AI 629, three furniture zones for AI 630).
  - The core now ends under the penthouse roof slab (30.45), which covers it.
- **Roof layer** (`rebuild/layer_roof.py` -> `RB_ROOF`, 14 objects, 1884 faces, all manifold):
  - the guard all round, two mitred halves meeting at the front and rear centres;
  - the flat 50 mm terrace deck, with the falls left in the slab;
  - penthouse walls with a 3.8 m parapet and the aerial's openings, frames, glass and wood doors; its roof slab and cap;
  - the annex: posts, beams, 17 louvre blades and three glazed sides;
  - 28 tilted solar modules on edge rails, and the units.
  - `rb_lib` gains `glass_frame` (now shared with the podium), `equal_spans` and `boxes()`; new placeholder materials for penthouse stone, solar, units and louvres; `build.py` registers the layer.
- **Out of b8's view:**
  - every part above the roof carries `rb_hide_from_b8`;
  - the plan's sightline table passes them all: penthouse wall 3.86 / 5.15 m, front solar row 3.86 / 5.46, units 4.6 / 5.43, annex 3.05 / 5.66;
  - `check_layers.py` renders them red from `CAM_B8` beside stand-in walls: 0 pixels;
  - in the lit b8 frame only the guard shows over the roof edge, as in b8.
- **Aerial roof comparison** (new `check_aerial` render, roof level only, from `CAM_AERIAL`):
  - the roof's front edge and guard line sit on the aerial's;
  - the penthouse lands behind the aerial's, because the approved plan is deeper than the aerial's roof plane;
  - moving it to the aerial's spot (about 7 m behind the roof front) would put its cap 0.1 m into b8's view, so b8 wins and it stays.
- **Audit:** 81 objects, 0 z-fights, 0 penetrations.
- **Evidence** in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/647_roof/`:
  - `check_sheet.png`, `check_b8_overlay.png`, `check_b8_sightline.png`, `check_aerial_overlay.png`, `checks.json`;
  - `terramar_rebuild.audit.json`;
  - `poses/`: Cycles [b8 | edit | rebuild] for `b8_calibrated`, and [edit | rebuild] for `penthouse_closeup`, `roof_terrace_aerial`, `roof_edge_street`, `full_rear_right_aerial`, `rebuild_rear`, `rebuild_top`.
