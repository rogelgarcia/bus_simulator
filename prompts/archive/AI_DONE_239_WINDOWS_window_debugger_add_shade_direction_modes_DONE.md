#Problem (DONE)

Shade behavior is limited to top-to-bottom coverage. We need additional shade direction options to support different window styles (e.g., side-drawn shades).

# Request

Add shade direction modes in the Window Mesh Debugger so shades can cover:
- Top → Bottom
- Left → Right
- Right → Left

Tasks:
- Add a shade direction control with the three modes listed above.
- Ensure shade coverage (None/20/50/100) behaves correctly for each direction.
- Ensure shading remains behind the glass and interacts correctly with muntins/frame.
- Ensure defaults preserve current behavior (Top → Bottom).

Nice to have:
- Add a per-window random direction option (left-right only)(seeded/deterministic) to add variety.

## Quick verification
- Set shade to 50% and switch direction:
  - Coverage changes orientation correctly (top half vs left half vs right half).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_239_WINDOWS_window_debugger_add_shade_direction_modes_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added `shade.direction` to window mesh settings (Top→Bottom, Left→Right, Right→Left, Random L↔R) with sanitization and defaults preserving prior behavior.
- Updated window shade shader + instancing attributes so coverage clips correctly for each direction (including deterministic per-window random L↔R).
- Added a Shade Direction control to the Window Mesh Debugger UI.
