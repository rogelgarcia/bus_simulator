#Problem

Fabricated windows and doors currently support only a bottom sill decoration (`decoration.sill`, type `bottom_cover`, in `src/app/buildings/window_mesh/WindowFabricationCatalog.js`, consumed by `BuildingFabricationGenerator`). Everything above and beside an opening is bare wall. Real facades — especially stone, plaster, and brick buildings — frame their openings with surrounds: a lintel or header above, jamb trim on the sides, and sometimes a pediment or a projecting hood. The absence of these is the single biggest visual gap noticed while recreating the legacy stone lowrise as `stone_lowrise_2`: sash windows with white sills still read as stickers on a flat wall, because no header or jamb geometry catches light or casts a shadow line over the opening.

# Request

Extend the window/door fabrication decoration schema from "sill only" to a full opening surround, so every catalog window/door can opt into lintels, jambs, and pediment-style headers.

Tasks:
- Extend the window definition `decoration` schema with `header` (lintel above the opening) and `jambs` (vertical trim at both sides), keeping `sill` as-is for backward compatibility.
- Header options: profile style (`flat_band`, `angled_keystone`, `pediment_triangle`, `arched_band` for arch-enabled assets), height, projection depth, and horizontal overhang beyond the opening width (ears).
- Jamb options: width, projection depth, and whether they run sill-to-header or full bay height.
- Material modes matching the sill's pattern: `match_frame`, `match_wall`, or an explicit material/color selection, so stone surrounds can contrast plaster walls (e.g. `pbr.seaworn_sandstone_brick` surrounds on `pbr.painted_plaster_wall`).
- Generate surround geometry in the same pass that builds the sill cover so it inherits bay recession (`depth.left/right`), repeat counts, and facade linking/mirroring for free.
- Ensure surrounds respect the wall cut: no z-fighting with the wall, the frame, or the shade; correct shadows with the game's sun setup.
- Update `BuildingFabrication2` GUI so surround options are editable and preview correctly in the thumbnail renderer.
- Add at least one catalog entry showcasing surrounds (e.g. a `window_white_sash_2x2` variant with stone header and jambs) and use it in `stone_lowrise_2` to validate in the showcase scenario (`tests/headless/harness/scenarios/scenario_building_showcase.js`).
- Add/update tests: schema normalization round-trip for the new decoration fields, and a generator-level test asserting surround meshes are emitted for a bay window with header+jambs enabled.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
