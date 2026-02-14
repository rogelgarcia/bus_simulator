#Problem (DONE)

The Grass Debugger needs better camera presets to evaluate grass/terrain at gameplay-relevant viewpoints (behind-bus perspective, low grazing-angle horizon view, and high overview). It also needs a repeatable flyover camera animation to preview grass LOD/variation behavior over a consistent camera path without manual input.

# Request

Add more camera presets to the Grass Debugger (including gameplay-like “behind the bus” viewpoints) and implement a smooth 15-second flyover camera animation that follows a precomputed path.

Tasks:
- Add camera presets in the Grass Debugger UI:
  - **Behind Bus (Gameplay)**: camera positioned like gameplay chase view behind the bus.
  - **Behind Bus (Low / Horizon)**: lower-to-the-ground variant looking toward the horizon (grazing angle).
  - **High (Far)**: higher overview position but further away (wide framing).
  - Keep existing presets and ensure “Apply” behavior is clear and consistent with other debug tools.
- Add a Flyover Animation feature:
  - Add controls (e.g., a button) to start/stop (and optionally replay) the flyover.
  - The flyover is a single smooth motion along a precomputed camera path (do not compute per-frame stage jumps).
  - Total duration: **15 seconds**, composed of these timing weights:
    - Move to High position: **3s**
    - Transition to Behind Bus: **3s**
    - Move forward while transitioning to Low / Horizon angle (following terrain angle / looking toward horizon): **5s**
    - Finalization returning to the starting High position: **4s**
  - Ensure motion is smooth with ease-in/ease-out between segments (no hard stage boundaries). Use overlapping blends between segments rather than abrupt switches.
  - Path design:
    - Define a deterministic path (position + target, or position + orientation) that can be replayed exactly.
    - Follow terrain angle during the low-angle forward segment so the camera respects the ground slope visually.
- Input integration:
  - While flyover runs, ensure manual camera inputs don’t fight the animation (either temporarily disable manual input or provide a clear “stop animation” interaction).
  - Ensure arrow-key movement still works when animation is not running.
- Debug value:
  - Expose a readout of the active camera preset / flyover progress time (optional).

Nice to have:
- Allow saving/loading custom camera paths (later expansion), but keep this implementation focused on the built-in path.
- Add a “Loop” toggle to repeat the flyover continuously for extended tuning sessions.

## Quick verification
- Apply each new preset:
  - Camera jumps to expected framing and orientation (behind bus, low horizon, high far).
- Run flyover:
  - Takes ~15s total, smooth continuous movement, returns to start.
  - No abrupt camera snapping at segment boundaries.
  - Low-angle segment moves forward and shifts viewpoint to horizon-facing while respecting terrain slope.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_246_TOOLS_grass_debugger_camera_presets_and_flyover_animation_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added camera preset buttons that apply immediately (kept Low/High; added Behind Bus presets and High (Far)).
- Implemented a deterministic 15s flyover camera animation with Start/Stop and Loop controls.
- Disabled manual camera input during flyover and added a UI readout for preset + flyover progress time.
