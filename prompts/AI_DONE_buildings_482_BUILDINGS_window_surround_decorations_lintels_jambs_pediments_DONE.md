DONE

#Problem

Fabricated windows and doors currently support only a bottom sill decoration (`decoration.sill`, type `bottom_cover`, in `src/app/buildings/window_mesh/WindowFabricationCatalog.js`, consumed by `BuildingFabricationGenerator`). Everything above and beside an opening is bare wall. Real facades — especially stone, plaster, and brick buildings — frame their openings with surrounds: a lintel or header above, jamb trim on the sides, and sometimes a pediment or a projecting hood. The absence of these is the single biggest visual gap noticed while recreating the legacy stone lowrise as `stone_lowrise_2`: sash windows with white sills still read as stickers on a flat wall, because no header or jamb geometry catches light or casts a shadow line over the opening.

# Request

Extend the window/door fabrication decoration schema from "sill only" to a full opening surround, so every catalog window/door can opt into lintels, jambs, and pediment-style headers.

Reference images: `downloads/buildings_references/` — 8 (full stone frames on brick), 11/13/15 (splayed lintels + sills on brick), m1–m4 (clay renders showing the target trim geometry density).

Tasks:
- Extend the window definition `decoration` schema with `header` (lintel above the opening) and `jambs` (vertical trim at both sides), keeping `sill` as-is for backward compatibility.
- Header options: profile style (`flat_band`, `splayed_lintel`, `angled_keystone`, `pediment_triangle`, `arched_band` for arch-enabled assets), height, projection depth, and horizontal overhang beyond the opening width (ears).
- `splayed_lintel` is the priority profile: a trapezoid flaring outward toward the top, with optional stepped "ears" at both ends — the most common window head in the reference photos (refs 11, 13, 15, m1–m4).
- Jamb options: width, projection depth, and whether they run sill-to-header or full bay height.
- Material modes matching the sill's pattern: `match_frame`, `match_wall`, or an explicit material/color selection, so stone surrounds can contrast plaster walls (e.g. `pbr.seaworn_sandstone_brick` surrounds on `pbr.painted_plaster_wall`).
- Generate surround geometry in the same pass that builds the sill cover so it inherits bay recession (`depth.left/right`), repeat counts, and facade linking/mirroring for free.
- Ensure surrounds respect the wall cut: no z-fighting with the wall, the frame, or the shade; correct shadows with the game's sun setup.
- Update `BuildingFabrication2` GUI so surround options are editable and preview correctly in the thumbnail renderer.
- Add at least one catalog entry showcasing surrounds (e.g. a `window_white_sash_2x2` variant with stone header and jambs) and use it in `stone_lowrise_2` to validate in the showcase scenario (`tests/headless/harness/scenarios/scenario_building_showcase.js`).
- Add/update tests: schema normalization round-trip for the new decoration fields, and a generator-level test asserting surround meshes are emitted for a bay window with header+jambs enabled.

## Summary of changes (2026-08-15)
- Extended the window decoration schema with a `jambs` part and header profile styles (`flat_band`, `splayed_lintel`, `angled_keystone`, `pediment_triangle`, `arched_band`), plus `earsMeters` (header overhang) and jambs `runMode` (`sill_to_header` | `full_bay`) fields with normalization round-trip (`WindowMeshDecorationTemplates.js`).
- Added shared surround geometry builders used by both the building generator and the debugger preview (`engine3d/buildings/window_mesh/WindowDecorationSurroundGeometry.js`).
- `BuildingFabricationGenerator` now emits header and jamb instanced meshes in the same pass as the sill cover (bay recession, repeats, linking inherited via instance transforms; full-bay jambs stretch to the floor band via per-instance floor bounds; shared material helper for match_wall/match_frame/pbr modes).
- Window Mesh Debugger GUI: Jambs section, header Ears control, jambs Run control; decorations rig renders all new styles via the plugin registry (BF2 scene + thumbnails render surrounds through the generator automatically).
- New catalog entry `window_white_sash_2x2_stone_surround` (splayed-lintel header + jambs + stone sill in `pbr.seaworn_sandstone_brick` on plaster) used by `stone_lowrise_2`'s plaster floors.
- Tests: template schema round-trips (node unit) and a generator-level test asserting header/jamb emission and full-bay jamb scaling (core suite; 423 passing, 3 failures pre-existing on main).
- Validated in the building showcase scenario; screenshots captured at 2x (`tests/artifacts/screens/buildings/stone_lowrise_2.png`).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
