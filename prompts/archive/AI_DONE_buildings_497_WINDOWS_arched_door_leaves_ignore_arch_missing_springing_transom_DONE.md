DONE

#Problem

Arch-enabled door assets cut an arched hole and render an arched outer frame, but the door composition inside ignores the arch. Observed on `stone_lowrise_2`'s entrance (`door_wood_arch`, `arch.enabled: true`, `heightRatio: 0.22`, `meetsRectangleFrame: true`, `topPieceMode: 'frame'`, `doorStyle: 'double'`, `openBottom: true`): the two leaves are flat-topped, there is no top rail on the leaves and no transom/springing-line bar, and the glazing simply continues up into the arch lunette. The result reads as a rectangular glass door floating in an arched hole — the hole has an arch, the door itself doesn't.

The settings say this should compose differently: `meetsRectangleFrame: true` + `topPieceMode: 'frame'` were implemented for the window debugger in archived prompt `AI_DONE_233_WINDOWS_window_debugger_arch_top_frame_modes_and_muntin_row_rules_DONE.md`. The likely defect is a divergence between the Window Mesh Debugger rendering and the building-generator rendering for DOOR assets specifically — door-specific frame settings (`openBottom`, `doorStyle: 'double'`, `doorBottomFrame`, handles) may take a path that skips the arch top-piece/transom composition. Reproduce in both surfaces before fixing.

Evidence: zoom into the entrance of `tests/artifacts/screens/buildings/stone_lowrise_2.png` (bottom center, arched double door) — arched cut and arched outer frame present, leaves flat-topped with glass running uninterrupted into the lunette.

# Request

Make arched doors compose like real arched entries: rectangular leaves terminated by a proper top rail at the springing line, a horizontal transom bar there when `meetsRectangleFrame` is set, and a framed (glazed fanlight) arched top piece above, honoring `topPieceMode`.

Tasks:
- Reproduce `door_wood_arch` in the Window Mesh Debugger and in a fabricated building (stone_lowrise_2 entrance or the showcase scenario) and document which surface is wrong (or both).
- Fix the door composition path so arch-enabled doors emit: leaf top rails at the springing line, the transom bar (`meetsRectangleFrame`), and the arched top piece per `topPieceMode` (`frame` = wood-framed glazed fanlight). Double doors keep the center stile below the transom only; handles stay on the leaves.
- Leaves must never extend into the arch region; the lunette belongs to the top piece.
- Keep window assets' arch behavior unchanged (this is a door-path fix); keep non-arch doors unchanged.
- Verify the wall cut, frame, and shade/interior layers still align with the arched opening (no gaps at the springing line, no z-fighting with the new transom).
- Update the showcase screenshot for `stone_lowrise_2` and confirm the entrance reads as leaves + fanlight.
- Tests: generator-level assertion that an arch-enabled door bucket emits top-piece/transom geometry distinct from the leaves; a debugger/generator parity check if the root cause was divergence between the two paths.

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

## Outcome

### Which surface was wrong

Both, and for the same reason — there is no divergence to reconcile. The Window
Mesh Debugger and the building generator both render from one module,
`WindowMeshGeometry.buildWindowMeshGeometryBundle`, and the defect is inside it:

- every double-door branch (`buildFrameGeometry`, `buildOpeningGeometry`,
  `buildMuntinsGeometry`, `buildDoorHandlesGeometry`) built plain full-height
  rectangles from `s.height`, never consulting `s.arch`;
- `buildArchMeetRectJoinGeometry` opened with `if (isDoorDoubleStyle(s)) return null;`,
  so a double door could never get a transom bar.

Probing `door_wood_arch`'s bundle showed it exactly: frame and glass bounded to a
clean ±1.3 / ±1.21 rectangle, `joinBar: null`, no top-piece geometry anywhere.
The only arched thing about the door was the hole in the wall.

### Changes

- Add `computeDoubleDoorArchProfile`: the springing line, the leaf region below
  it, and whether a transom is wanted — derived from the same outer `archRise`
  the frame and wall cut use, so every layer agrees on one line.
- Leaves (frame, glass, muntins, handles) are built into that region instead of
  the full opening height, so nothing reaches into the lunette. The three
  rect-leaf builders took a `centerY` for it.
- Let `buildArchMeetRectJoinGeometry` serve double doors, on the door's own
  springing line. With `meetsRectangleFrame` the bar spans both leaves and the
  gap between them, so it *is* their top rail — the leaves drop theirs, since two
  rails in one place z-fight.
- Add the fanlight: an arched frame ring above the springing line with the
  lunette glazed inside it (`topPieceMode: 'frame'`). The ring carries a short
  skirt down past the transom, because the arc is vertical where it springs and a
  ring starting exactly on that line pinches to nothing and leaves a notch at
  each corner — visible as white slivers before the skirt was added.
- Index the extruded fanlight before merging it with the box leaves, so the door
  frame keeps the same attribute signature as every other window frame.
- Document arched door composition in `specs/window_mesh_specification.md`.
- Tests: `window_mesh_arched_door_composition` — transom on the springing line
  spanning the full glazed width, leaves/muntins/handles below it, a fanlight
  filling the lunette, plus guards that non-arched doors and arched windows are
  unchanged. The three arch assertions fail before the fix; the two guards pass
  both ways.
- Captures: `tests/artifacts/screens/buildings/ai497_*_{before,after}.png`, and
  the `stone_lowrise_2` showcase shot regenerated.

### Known gap

`building_geometry_merge_invariants` now fails by exactly one mesh: the transom
is a first-class instanced layer (as it is for windows), so `stone_lowrise_2`
goes from 495/123 to 496/124 unmerged/merged and trips
`merged < unmerged / 4` at the boundary. The merge ratio is unchanged at exactly
4x. Folding the door's transom into the frame geometry instead would avoid the
mesh but would make it untestable and would diverge from how arched windows emit
theirs, so the threshold is left alone for a decision rather than tuned to suit
this change.
