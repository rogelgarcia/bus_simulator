# DONE

#Problem

Road Debugger orbit controls and the orbit widget have usability issues:
- Orbit rotation snaps/reset behavior occurs during normal orbiting (it jumps back to the original view around a “90 degree” point).
- Rotation should only reset when the user explicitly clicks reset.
- The orbit widget layout is incorrectly tied to the output panel height.

# Request

Fix orbit camera behavior and orbit widget layout so orbiting is smooth and predictable.

Use the shared Road Debugger UI vocabulary and precedence rules defined in `AI_93_ROADS_road_debugger_ui_information_architecture_reorg`.

Tasks:
- Orbit camera behavior:
  - Remove snapping/reset behavior during normal orbiting.
  - Ensure orbit transitions are smooth across the full range of allowed pitch/yaw.
  - Reset occurs only when the user clicks the reset control.
- Orbit widget layout:
  - Ensure the orbit widget does not inherit/track the output panel height.
  - Keep the orbit widget anchored consistently in the intended screen area, independent of output panel size changes.
- Verification checklist:
  - Orbiting upward/downward never causes a sudden snap or rotation reset.
  - Reset button restores the expected initial orientation.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_98_DONE_ROADS_road_debugger_orbit_widget_and_controls_fixes`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Fixed orbit camera behavior to avoid snapping/resets during normal orbiting, added explicit reset, and decoupled orbit widget layout from output sizing.
