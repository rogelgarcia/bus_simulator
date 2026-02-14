# Problem [DONE]

In Road Debugger, keyboard arrow movement is smooth, but mouse-based map
movement/panning causes visible shaking/jitter, making precision editing hard.

# Request

Fix mouse-based camera movement in Road Debugger so panning is stable and
smooth (no shaking), matching the feel of keyboard movement.

Tasks:
- Reproduce and identify the source of the camera shake during mouse drag pan:
  - Determine whether jitter is caused by raycast-to-plane instability,
    rounding/snap interactions, inconsistent pointer capture, or frame-order
    issues between input and render updates.
- Stabilize mouse panning:
  - Use a consistent drag reference (e.g., store world-space anchor on drag
    start and compute camera delta from that anchor).
  - Ensure pointer capture is used correctly so deltas are continuous.
  - Avoid mixing screen-space deltas and world-space raycast deltas in a way
    that causes feedback loops.
  - Ensure camera updates happen in a single place per frame (avoid double
    application between event handlers and `update()`).
- Prevent UI interference:
  - Ensure dragging over UI panels does not start or continue camera panning.
- Add/update browser-run tests validating:
  - Mouse drag pan updates camera position deterministically for a synthetic
    sequence of pointer events (smoke test).
  - No additional camera delta is applied when no pointer movement occurs.

Constraints:
- Keep changes scoped to Road Debugger input/camera modules.
- Do not change other scenes.
- Follow the comment policy in `PROJECT_RULES.md`.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Stabilized mouse drag panning by anchoring world-space deltas and applying incremental target translation, with browser tests for deterministic/stable motion.
