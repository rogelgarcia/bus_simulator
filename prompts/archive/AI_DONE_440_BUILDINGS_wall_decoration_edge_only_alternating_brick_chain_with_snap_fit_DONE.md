# DONE

## Completed Summary
- Added a new wall decorator subtype `edge_brick_chain` that generates edge-only vertical brick-chain courses (not full-face strips).
- Added edge targeting controls (`Left`, `Right`, `Both`) with alternating course sequence based on `brickHeight` (`1.0x`, `0.5x` repeating).
- Added range controls (`startY`, `endY`, `brickHeight`) and snap behavior (`Snap to fit`) with uniform scaling to remove partial terminal courses when enabled.
- Implemented parity-consistent multi-edge generation and corner-mode continuation with 45-degree miter flags for edge/corner intersections.
- Added debugger-view geometry support for mitered edge-brick courses and expanded unit/core/spec coverage for the new type and behavior.

# Problem

The wall decoration system needs a decorator subtype that applies only on bay vertical edges and generates an alternating brick chain profile with clean range control and no partial bricks when snap mode is enabled.

# Request

Add an edge-only brick-chain decorator for wall decoration that supports left/right/both edge targeting, alternating course sizing, start/end range control, and uniform snap-to-fit behavior.

Tasks:
- Add a new wall decorator subtype that is applied only to bay edges (not full-face spans).
- Edge targeting options:
  - `Left`
  - `Right`
  - `Both`
- Generate alternating vertical brick courses using the sequence:
  - `0.30m`, `0.15m`, `0.30m`, `0.15m`, repeating.
- Use extruded outward geometry (same non-overlap/outside-wall concept used by skirt-like decorators).
- Add range controls:
  - `startY`
  - `endY`
  - `brickHeight` (base vertical sizing control as applicable to this style)
- Add snap mode behavior:
  - When enabled, adjust course heights uniformly so bricks fit exactly from `startY` to `endY` with no partial terminal brick.
  - When disabled, keep raw sizing behavior (partial terminal brick allowed if range does not divide cleanly).
- For `Both` edge mode, use the same `startY` and `endY` and same parity sequence on both sides (both begin with the same first course at `startY`).
- Apply 45-degree cut/miter handling at corners where edge/corner conditions intersect.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_440_BUILDINGS_wall_decoration_edge_only_alternating_brick_chain_with_snap_fit_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_440_BUILDINGS_wall_decoration_edge_only_alternating_brick_chain_with_snap_fit_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
