#Problem

The fabrication system has no balconies. The references need three looks: modern glass/metal balconies both projecting from and recessed into the facade (ref 4), and flat wrought-iron balconets in front of tall windows (ref 5). A draft spec exists at `specs/windows/WINDOWS_BALCONY_SPEC.md` (platform slab + per-side railing kit) but nothing is implemented.

Reference images: `downloads/buildings_references/` — 4 (modern residential: recessed balconies in massing notches, projecting glass-front balconies, full-height glazed doors behind), 5 (wrought-iron balconets on every window), 2/3 (fire-escape landings — a later consumer of the same railing kit, see AI 490).

# Request

Implement balconies as ONE feature with modes — not separate embedded/external/corner balcony types. This is the project-wide design principle: a single feature whose behavior varies by mode and by context.

Core design:
- Balcony is a per-bay facade feature (attached like the awning decorator), with `placement: 'projecting' | 'recessed'`.
  - `projecting`: slab + railings outside the facade plane, plus a support mode: `cantilever` (clean slab, visible thickness), `corbel_brackets`, or `posts_to_below` (posts landing on the balcony/ground below, ref 4).
  - `recessed`: reuse the existing bay recession (`depth`) for the notch. The balcony contributes the slab (floor of the notch), the front railing at/near the facade plane, and the notch ceiling soffit. The window/door and interior parallax must sit correctly on the recessed plane — verify the existing bay-depth path handles this and fix if not.
- Side covers are adjacency-driven, not authored per type: for each of the three sides (left/front/right), the generator determines whether the side abuts wall or open air. Wall-abutting sides get no infill (the building wall does the job); air-facing sides get the configured infill. This one rule yields mid-facade recessed (no side covers), corner recessed (one side cover), and projecting (all sides covered). Provide a per-side override `auto | always | never` for art control.
- Component kit (take ideas from `specs/windows/WINDOWS_BALCONY_SPEC.md`, but do NOT be constrained by it — where implementation reality disagrees, do it better and update the spec as part of this task): platform slab (width/depth/thickness, soffit underside), per-side railing with infill `open | solidWall | glassPanel | grid`, posts (corner + spacing modes), top rail cap, per-part materials.
- Juliet balconet is a preset of the same feature: depth ≈ 0, front side only, `grid` infill (wrought-iron look) — attaches at the window surround plane. Ship it as a catalog preset; it instantly serves the ref-5 style.
- Balcony door: add a full-height glazed door/slider catalog entry (windows catalog) since refs pair balconies with floor-height glazing.

Constraints:
- Glass railing panels must use the existing window-glass material/pass so transparency sorting and geometry merging stay sane (`BuildingGeometryMerger`).
- Correct shadows and AO for the notch (recessed) and the slab overhang (projecting) with the game's sun setup.
- Corner-wrap balconies that turn the building corner (ref 4's corner units) are explicitly OUT OF SCOPE — the generator is per-face; note it as a future extension and do not attempt it.
- Repeat/linking/mirroring semantics inherit from the bay system like other per-bay features.

Tasks:
- Schema: `balcony` feature block (placement, support mode, side policy, component kit params, materials), normalization + clamps.
- Generator: both placements, adjacency detection for side covers, soffits, supports; merged output.
- Catalog: balcony door asset; presets for `modern_glass_projecting`, `modern_recessed`, `juliet_iron`.
- GUI: `BuildingFabrication2` editing + thumbnails for the presets.
- Spec: update `specs/windows/WINDOWS_BALCONY_SPEC.md` to match what is actually implemented (placement modes + adjacency policy included).
- Showcase: a modern residential config in the ref-4 style (mixing recessed and projecting) and a balconet variant on a classical config; validate in `tests/headless/harness/scenarios/scenario_building_showcase.js`.
- Tests: schema round-trip; adjacency resolution unit tests (mid-facade recessed → no side covers; recessed at facade end/corner → exactly one; projecting → all air-facing sides covered; overrides win); generator-level test asserting slab/railing/support meshes are emitted per placement mode.

## Delivery requirements
- Engine 2 only: target the facade/bay building engine (facades/bays + window definitions). Do not extend engine 1 (the fixed-spacing `layer.windows`/`spaceColumns` path or the old `BuildingGenerator.js`); it is deprecated and frozen.
- Finish with a screenshot showing the feature in a rendered building — a before/after pair when the change improves something that already renders — and additionally a close-up version of the feature.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
