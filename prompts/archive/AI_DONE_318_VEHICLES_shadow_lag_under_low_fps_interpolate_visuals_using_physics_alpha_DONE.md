# DONE

## Summary
- Added fixed-timestep → render-time vehicle pose interpolation via `PhysicsLoop.interpolate(alpha)` + `FixedTimestepPoseBuffer`.
- Updated vehicle visuals/camera alignment by applying `state.renderPose` to the vehicle anchor transform used for rendering/shadows.
- Added a deterministic browser-run regression test for smooth per-frame pose deltas and documented the behavior in a new spec.

#Problem

When framerate drops or becomes uneven (e.g., heavy post-processing like Bloom/GTAO), the bus shadow can appear to **lag behind** the bus. This reads as a “low FPS shadow” or a one-frame delay even though shadow maps are rendered every frame.

The likely root cause is that physics runs on a fixed timestep and bus visuals (and/or camera) are updated using the last completed physics state without interpolation. Under uneven render dt, this produces visible stepping and can make the bus transform appear one frame “late” relative to the camera/ground markings, which also makes the shadow appear to lag.

We need to make vehicle visuals (and therefore shadow-casting transforms) smooth and correctly aligned with the render frame by interpolating between physics steps using the physics accumulator alpha.

# Request

Fix the “shadow lag behind the bus” issue under low/uneven FPS by implementing deterministic **render-time interpolation** for vehicle visuals driven by the physics fixed-timestep loop.

Tasks:
- Reproduce the issue deterministically:
  - Provide a real-GPU-load repro (enable heavy post effects).
  - Provide a synthetic uneven-dt repro mode (deterministic) so the issue reproduces even on fast GPUs.
- Instrument and confirm the root cause:
  - Log/overlay physics loop state per render frame:
    - fixedDt, substeps this frame, accumulator alpha (`PhysicsLoop.lastAlpha`), dt
  - Log/overlay bus visual pose vs physics pose to confirm stepping/lag.
- Implement visual interpolation using physics alpha:
  - Capture per-vehicle “previous physics pose” and “current physics pose” each fixed update (position + rotation/yaw at minimum).
  - In the render/visual update, compute an interpolated pose:
    - `pose = lerp(prev, curr, alpha)` for position
    - `rotation = slerp(prevQuat, currQuat, alpha)` for orientation
  - Apply the interpolated pose to the vehicle’s 3D model transform used for rendering/shadow casting.
- Ensure camera alignment:
  - If the chase camera targets the vehicle anchor, it should target the interpolated pose (not the raw physics step pose), so camera + bus + shadow remain consistent.
- Add regression validation:
  - A browser-run deterministic test that:
    - runs a synthetic uneven-dt pattern
    - verifies the per-frame delta of the rendered bus pose does not “snap” beyond a threshold given constant physics motion
    - verifies no 1-frame discontinuity spikes (position and yaw)
- Keep behavior stable:
  - Do not change physics simulation behavior or vehicle dynamics.
  - Only change how visuals are sampled/interpolated for rendering.

Constraints / notes:
- Use the existing physics loop alpha hook: `src/app/physics/PhysicsLoop.js` already computes `lastAlpha` and calls `system.interpolate(alpha)` if implemented.
- Prefer implementing interpolation as part of the physics/vehicle integration boundary so all vehicles benefit, not only the bus.
- Ensure interpolation is deterministic and does not create “rubber banding” when physics substeps clamp (e.g., maxSubSteps reached).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_318_VEHICLES_shadow_lag_under_low_fps_interpolate_visuals_using_physics_alpha_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
