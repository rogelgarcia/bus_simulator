# DONE

## Summary
- Added `gtao.updateMode` and `gtao.motionThreshold` to persisted AO settings (defaults + sanitization).
- Added GTAO update/caching controls under Options → Graphics → Ambient Occlusion (Update mode + motion thresholds).
- Implemented GTAO caching/amortized update scheduling in `PostProcessingPipeline` (compute-pass skipping + cached blend pass).
- Surfaced live GTAO cache/update status in the Options “Post-processing” debug panel and engine AO debug info.
- Added Node unit tests for AO settings + scheduler determinism.

#Problem

GTAO is currently very expensive in the game and can reduce FPS dramatically (often ~half). In practice, much of the rendered scene is static most of the time, and the player experience would benefit from a “good enough” AO solution that avoids recomputing GTAO every frame when it is not necessary.

Even though screen-space AO depends on the camera view, we can still reduce cost significantly by:
- reusing the previous AO result when the camera is effectively still
- updating AO at a reduced rate (every N frames)
- optionally lowering AO resolution during motion

# Request

Add GTAO caching / amortization options under **Graphics → Ambient Occlusion** to reduce GTAO runtime cost while keeping a stable look when the camera is not moving.

Tasks:
- Add new AO performance settings to the persisted AO settings model (defaults + sanitization).
- Expose the new settings in the Options UI under **Ambient Occlusion**, shown only when `Mode = GTAO`.
- Implement the runtime behavior in the post-processing pipeline so GTAO can:
  - reuse/cached the last valid AO output texture when updates are skipped
  - update at a configurable rate or only on camera motion
  - remain stable and not introduce flicker/popping beyond acceptable levels

## New settings (first pass)

Add a GTAO “Update mode” setting:
- `gtao.updateMode` (enum):
  - `every_frame` (current behavior)
  - `when_camera_moves` (cache when camera is still)
  - `half_rate` (update every 2 frames)
  - `third_rate` (update every 3 frames)
  - `quarter_rate` (update every 4 frames)

Add camera motion thresholds (used by `when_camera_moves`):
- `gtao.motionThreshold.positionMeters` (number, default small, e.g. 0.01–0.05)
- `gtao.motionThreshold.rotationDeg` (number, default small, e.g. 0.05–0.2)
- `gtao.motionThreshold.fovDeg` (number, default 0)

Optional (first pass if feasible; otherwise defer):
- `gtao.motionQualityMode` (enum):
  - `locked` (always use selected quality/resolution)
  - `degrade_on_motion` (reduce AO resolution/quality while camera is moving, restore when still)

## UI requirements

- In **Graphics → Ambient Occlusion**:
  - show `Update mode` only when `Mode = GTAO`
  - show thresholds only when `Update mode = when_camera_moves`
  - keep the AO section layout stable (no reflow) per existing UX rules (use visibility toggles / overlap approach)

## Runtime behavior requirements

- When GTAO updates are skipped:
  - The compositor must still apply the last valid GTAO result (cached AO texture), not “turn AO off”.
  - Output must not become stale/incorrect when the camera moves beyond thresholds; the next frame must update AO.
- When `updateMode` is a fixed rate:
  - Updates occur deterministically based on frame count.
  - On any change of AO settings (intensity/radius/quality/denoise), force an immediate update (do not wait N frames).
- When `updateMode = when_camera_moves`:
  - Track camera “view state” including:
    - position (world)
    - rotation/quaternion (world)
    - projection parameters that affect the view (FOV/near/far/zoom/aspect)
  - If view state change is below thresholds, skip GTAO update and reuse cached result.
  - If above thresholds, update GTAO and refresh cached result.
- Ensure resizing the renderer / changing resolution forces an update and resets the cached AO appropriately.

## Compatibility notes

- Must work with existing `GTAOPass` integration used by `PostProcessingPipeline`.
- Must not change SSAO behavior.
- Must continue to respect the existing GTAO denoise setting (but should still allow caching when denoise is enabled if it is stable).
- If AO alpha handling (foliage cutout/exclude) is implemented, caching must remain compatible with that path.

## Validation / testing

- Add a debug overlay or dev logging (implementation-defined) to confirm:
  - whether GTAO updated this frame or reused cached output
  - current update mode
- Verify visually:
  - When camera is still: AO remains stable and FPS improves.
  - When camera moves: AO updates and tracks correctly with minimal lag given the chosen mode.
- Add a deterministic sanity test where possible:
  - For `when_camera_moves`, ensure repeated frames with identical camera state do not trigger updates.
  - For fixed rates, ensure update cadence is deterministic.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_315_UI_graphics_options_gtao_caching_and_update_rate_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
