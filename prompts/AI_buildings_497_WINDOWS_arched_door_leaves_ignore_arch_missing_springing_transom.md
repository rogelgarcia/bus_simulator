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
