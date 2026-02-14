DONE

#Problem

Under uneven frame pacing (dt spikes), the bus can appear to “jump forward then back” for a single frame, most visible when viewing from the side and especially while the camera is returning from a manual drag override.

This is NOT AO-specific (can reproduce with Bloom / general GPU load) and is reproducible deterministically with synthetic stall patterns (ex: `alt60_20` stall).

## Root cause (confirmed by instrumentation)

The visual jump is caused by a **camera target mismatch** (manual camera) rather than physics teleportation:
- When `cameraMode: "manual"` (camera drag override / auto-return), the manual camera computes its target from **stale world transforms** for one frame under dt spikes.
- The manual camera then “catches up” on the next frame, producing the illusion that the bus moved forward and then back relative to static ground markings.

Key evidence from event-only logs (from the in-game VehicleMotionDebug overlay/logger):
- During visible jitter, a `cameraCatchup` event occurs with:
  - `cameraMode: "manual"` and `manual.returning: true`
  - `manual.anchorMatrixErr` being **non-trivial** and, critically, matching the bus step for the frame:
    - `manual.anchorMatrixErr ≈ anchorStep.dist`
  - This means the bus anchor moved in “world state” for the frame, but the `matrixWorld`-derived position used by manual targeting lagged behind by ~one step.

Example (from user capture):
- `anchorStep.dist: 0.12278355`
- `manual.anchorMatrixErr: 0.12278355`
- Followed by manual camera catch-up behavior.

Additional supporting observations:
- The effect tends to stop once the camera fully settles behind the bus because the camera mode returns to `chase` (manual override ends).
- Chase camera behavior can still log “catchup” events under dt spikes (expected due to smoothing), but these do not correlate with the visible “bus jumped then back” artifact in the same way as manual-mode mismatch.

# Request

Fix the **manual camera** so it never targets a stale bus transform under dt spikes. The fix must remove the single-frame bus “jump forward then back” illusion while keeping vehicle physics and chase camera behavior unchanged.

Tasks:
- Repro + validation setup:
  - Use the synthetic stall dt patterns to reproduce deterministically:
    - `alt60_20` stall is the primary repro; also verify with `spike20` stall.
  - Repro steps:
    - Enter gameplay, start driving.
    - Drag the camera to the side (enabling manual override), release, and let the camera auto-return.
    - Observe the one-frame jitter during return under dt spikes.
- Implement the fix (manual camera only):
  - Ensure manual camera target computation uses the **current** bus position/orientation for the frame (no one-frame lag due to stale matrices).
  - Keep the chase camera smoothing and physics stepping unchanged.
  - Avoid adding any “visual smoothing” or “hide it” hacks that only mask the issue.
- Remove vehicle visual smoothing (requested cleanup):
  - Remove the “Vehicle visual smoothing” feature entirely (logic + settings + persistence).
  - Remove the corresponding Graphics UI group/controls.
  - Ensure removal does not break gameplay, options saving/loading, or tests.
  - If any saved settings exist in localStorage, handle them gracefully (ignore / migrate) without console errors.
- Instrumentation and logging (keep / improve):
  - Keep event-only logs and the `cameraTargetMismatch` signal (it’s used to prove the fix).
  - After the fix, `cameraTargetMismatch` should not fire during manual returning under the repro patterns at reasonable thresholds (see Acceptance).
- Tests (required):
  - Add at least one automated check that fails before the fix and passes after:
    - Preferred: a headless/harness test that enables synthetic stall dt, forces manual camera return state, and asserts no `cameraTargetMismatch` events above threshold over N frames.
    - If headless cannot drive manual camera state easily, add a browser-run test/harness scenario + documented manual verification checklist and a deterministic log-based assertion hook.

## Acceptance

- With synthetic stall dt enabled (`alt60_20` stall) and manual camera returning:
  - The visible “jump forward then back” artifact is gone (side view + return path).
  - No `[VehicleMotionDebug] cameraTargetMismatch` events fire with `minAnchorMatrixErrMeters >= 0.02` while `cameraMode:"manual"`.
- Vehicle motion stays identical (no physics/gameplay change).
- Chase camera behavior is unchanged (aside from fewer false-positive debug logs if any gating is used).
- “Vehicle visual smoothing” is no longer present in the UI and no longer affects runtime behavior.
- A regression check exists (automated preferred).

## Notes (current debug tooling)

Existing debug tools that should be used for validation:
- Graphics → Debug tab (gated by `?debug=true` / `?debugOptions=true`)
- Synthetic dt stall patterns (`alt60_20`, `spike20`, etc.)
- Event-only logs:
  - `[VehicleMotionDebug] cameraLag`
  - `[VehicleMotionDebug] cameraCatchup`
  - `[VehicleMotionDebug] cameraTargetMismatch`
  - `[VehicleMotionDebug] cameraMode`, `[VehicleMotionDebug] manualReturn`

## On completion

- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_319_VEHICLES_fix_manual_camera_stale_target_jitter_under_dt_spikes_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
