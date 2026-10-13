DONE

# Problem

The Terra & Mar edit prompts (AI 615–638) each need before/after evidence against the target image `b8.png`. There
is no fixed set of camera poses for that yet: the five inspection-rig cameras frame the whole building, not the
places the edits change (slab corners, soffits, podium guards, canopies, the roof terrace, interiors through the
glass, the flicker sites from the overlap check). Without fixed poses, every item would invent its own framing,
and the before and after renders would not line up.

# Request

Create a script that renders a predefined set of comparison poses of the Terra & Mar model from any of its `.blend`
files (the as-extracted baseline or the edit copy). The poses are framed on the changes the edit prompts will make,
plus two different poses of the full building. The script is parameterized so a subset can be rendered.

Tasks:
- Predefine the poses in one data file, each tagged with the edit items (prompt ids) it serves and a group (target,
  full, exterior, props, interior, check), so an item's evidence can be rendered by its id.
- Include the b8 target stand and two different poses of the full building.
- Parameterize the subset: by pose name, by item id, by group, with a list mode that prints the poses and renders
  nothing. Also expose samples, resolution scale and output folder.
- Render with the file's own inspection rig: the game's calibrated sky and sun, and the ground. Never save or change
  the `.blend`.
- Write the renders to a gitignored folder per source file (`baseline`, `edit`, …) with a manifest of what was
  rendered, and provide a companion step that composes before/after sheets per pose (with `b8.png` beside the target
  pose) and a contact sheet.
- Render every pose of the baseline as the fixed "before" set, and show the results to the user.

## Context
- Folder: `src/graphics/content3d/buildings/authoring/terramar_recessed/`. Follow its README (frame: metres, z up,
  front A faces −Y, street z 0, base z 0.201).
- Files: baseline `tests/artifacts/blender/terramar_recessed/before/terramar_recessed_before.blend`, edit copy
  `tests/artifacts/blender/terramar_recessed/edit/terramar_recessed_edit.blend`.
- Target `b8.png`; the aerial references are supplementary.
- Nothing of the Bradbury's is edited; no engine code changes.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_639_TOOLS_terramar_comparison_pose_renderer_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completion summary (2026-10-12)

- Poses: `src/graphics/content3d/buildings/authoring/terramar_recessed/poses.json` defines 20 poses, each tagged with the edit prompt ids it serves and a group:
  - target: `b8_target`, the b8 street stand;
  - full: `full_front_left` (three-quarter) and `full_rear_right_aerial` (elevated: rear, roof, penthouse);
  - 12 exterior and props close-ups: slab corners, H chamfer balconies, soffits from below, front centre bays, stone close-up, roofline telephoto, roof terrace, podium guards, entrance and sign, H storefronts, street frontage, penthouse;
  - interior: 3 views through the glass;
  - check: the two audit sites (`balcony_platform__567`, `mesh__85`).
- Renderer: `render_poses.py` renders a subset from any Terra & Mar `.blend`. Selection is by `poses=`, `items=` or `groups=` (a union), with `list=1`, `samples=`, `pct=`, `engine=cycles|eevee`, `out=` and `tag=`. It uses the file's own calibrated rig through a temporary camera and never saves. Output goes to `tests/artifacts/screens/buildings/terramar_recessed/poses/<baseline|edit|name>/` with a `poses_manifest.json`.
- Sheets: `compose_pose_sheets.py` makes before/after sheets per pose (`b8.png` beside `b8_target`) and contact sheets. Both modes were tested.
- Before set: all 20 poses of the baseline rendered at full resolution with 96 samples on OptiX (7–16 s each, about 4 min), plus `poses/sheets/contact_baseline.png`. The framings were checked on a low-resolution preview first, and 5 poses were re-aimed.
- The 24 item prompts (AI 615–638) now take their evidence from these poses (`render_poses.py -- items=<id>`), and the README documents the poses and commands.
- Observation for AI 620: the roof's cap and soffit bands have sloped wedge pieces at the corners and pier tops (`roof_terrace_aerial`).
