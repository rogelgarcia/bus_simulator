DONE

# Problem

Terra & Mar (interior): In the reference, the residential sliders show white sheer curtains, partly drawn, with hints of furniture inside (`b8.png`; the AI smart model agrees). The extracted model has no curtains (the game draws no shades; they sit hidden in `TM_WINDOWS_SHADES_HIDDEN`) and plain interior shells.

# Request

Hang sheer curtains behind the residential sliders and add simple furniture inside the units.

Tasks:
- Hang translucent sheer curtain panels with folds behind each residential slider, drawn to varied positions by seed so no floor repeats another.
- Add simple furniture near the windows of each unit (a sofa, a table, a lamp), working with AI 634's partitions.
- Collection: `TM_EDIT_INTERIOR/RESIDENTIAL`.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=637` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 637`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

## Context
- Work file: `tests/artifacts/blender/terramar_recessed/edit/terramar_recessed_edit.blend`, the editable copy of the model extracted from the game (`terramar_recessed`). The baseline `tests/artifacts/blender/terramar_recessed/before/terramar_recessed_before.blend` is never edited. The work adjusts the extracted model; it is not a rebuild.
- **The target is `b8.png`** (user, 2026-10-12), in `tests/artifacts/screens/buildings/terramar_recessed/references/`. The result is judged against it, mainly from the `ref_front_b8` camera.
- The aerial (`aerial-unannotated.png`) and the annotated aerials are supplementary. They only fill in what b8 cannot show (the roof, the rear, face letters); where they disagree with b8, b8 wins.
- The user's AI-generated 3D models are for consultation only: `REF_AI_SMART`, hidden in the edit copy, and `REF_AI_DENSE` in `tests/artifacts/blender/terramar_recessed/reference_models/terramar_ai_reference_models.blend`. They were made automatically and are not sharp. Never copy their geometry.
- Follow `src/graphics/content3d/buildings/authoring/terramar_recessed/README.md`, section "Editing: the copy, the references and the rules (AI 615+)":
  - one idempotent piece script under `pieces/`, building into its own collection;
  - game parts that get replaced go to `TM_REPLACED`, never deleted;
  - copy shared meshes before editing them;
  - new meshes get UVs, and materials use the `TM_*` families;
  - before/after evidence from the rig cameras, plus close-ups;
  - run the audit after geometry changes.
- Frame: metres, z up, front run A faces −Y, street z 0, building base z 0.201. Runs: A front, B/H front chamfers, C/G sides, D/F rear chamfers, E rear. Level tops: ground 5.412, upper podium 10.012, residential 27.862 (5 floors), penthouse 31.662.
- Blender only: no engine code, building config or catalog change. Nothing of the Bradbury's is edited. Prefer the headed Blender through MCP.
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/637_interior_residential_curtains_and_furniture/`. It holds the [reference | before | after] composites and the audit report.

## Retargeted to the rebuild (2026-10-12, AI 642)
The user restarted Terra & Mar as a from-scratch, layered Blender model (AI 642). This item stays valid but now targets
the rebuild, not the game-extracted edit copy; where this section and the text above disagree, this section wins:
- Work file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend` (created by AI 643), with one
  idempotent script under `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/` building its own
  collection. Nothing goes to `TM_REPLACED`: there is no game geometry to replace.
- Outlines, runs and levels come from `rebuild/terramar_plan.json` (approved plan option E, 27.0 x 24.5 m): runs A front,
  B/H front chamfers, C/G sides, D/F rear chamfers, E a short rear face; its levels replace the level tops above.
- Wait for the layers this item stands on: AI 644 (envelope) and AI 634 (base interiors).
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/637_interior_residential_curtains_and_furniture/`.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_637_BUILDINGS_terramar_interior_residential_curtains_and_furniture_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result

## Summary (2026-10-13)
- **Layout** (`rebuild/props_layout.py` `residential()`, written to `plan["interior"]["residential"]` by `make_plan.py`):
  - **Curtains:** ceiling tracks behind every bay's glazed span on floors 1-5, split at the partitions. Panels are drawn to seeded styles (pair, one side, stacked open), and a floor is re-rolled until its pattern differs from every other floor's.
  - **Furniture:** a seeded lounge, dining or reading set with a floor lamp near the window of every bay of 3 m and more, kept clear of the bay ends, the partitions and the core (up to 12 tries per bay).
- **Layer** (`rebuild/layer_residential.py`, registered in `build.py` after `dining_l1`) builds `RB_INTERIOR/RB_RESIDENTIAL`:
  - `rb_res_curtains_f1-5`: 131 folded sheer panels, `TM_RB_sheer`;
  - `rb_res_tracks`: 85;
  - `rb_res_furniture_f1-5`: 198 pieces in 55 sets;
  - `rb_res_lamps`: 55.
  - Nothing went to `TM_REPLACED`.
- **Iteration:**
  - First try: one try per bay left too many bays empty, so each bay now gets up to 12 tries. On D1 and F1 the rear partitions cross the band, so those bays stay empty.
  - The curtains at 45% opacity read as a grey veil; they are now 80% cloth, mostly diffuse.
  - The lamp shades at 30 read as white squares; they are now 10.
  - The close-up camera was behind a palm crown; it was raised to first-floor height across the street.
- **Checks:** audit 114 objects, 0 z-fights, 0 penetrations; hidden parts visible from b8: 0 px; a fresh headless build gives the same counts.
- **Poses:** new `residential_curtains_closeup`; 637 added to `b8_calibrated`.
- **Evidence** in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/637_interior_residential_curtains_and_furniture/`:
  - `poses/rebuild_pre637_vs_rebuild/` (6 sheets);
  - `check_sheet.png`, `checks.json`, `terramar_rebuild.audit.json`.
  - The "before" file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre637.blend`.
