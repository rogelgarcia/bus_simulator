# Problem [DONE]

While drafting a road in the Road Debugger, the workflow is mouse-heavy and lacks key drafting affordances:

- There are no keyboard shortcuts to quickly finish a draft.
- Pressing `ESC` should  finish drafting.
- While drafting, it’s not clear that drawing is still active because there is no live preview from the last point to the cursor.

# Request

Improve Road Debugger road drafting UX with keyboard shortcuts, exit confirmation, and a live segment preview while drafting.

Tasks:
- Draft completion shortcuts:
  - When a road is currently being drafted, pressing `ESC` should behave the same as clicking the `DONE` button for that draft.
  - When a road is currently being drafted, pressing `ENTER` should also behave the same as clicking the `DONE` button.
- Exit behavior:
  - When not drafting, pressing `ESC` should attempt to exit the Road Debugger scene.
  - When attempting to exit via `ESC`, show a confirmation popup: “Do you want to exit?” with confirm/cancel. (ESC can also be used to cancel the exit.)
  - Ensure this confirmation does not trigger while the user is drafting (first `ESC` should finish drafting).
- Live drafting preview:
  - While drafting, render a preview line segment between the last placed centerline point and the current mouse position on the ground plane.
  - The preview should update continuously as the mouse moves.
  - The preview should disappear immediately when the draft is completed/canceled.
- Integration requirements:
  - The preview should respect snapping rules (if snap is enabled, preview endpoint should snap).
  - Ensure this works with existing hover/selection logic and does not interfere with point dragging.
  - Ensure the behavior works even if the user drafts a road with only 1 point (preview still shows from first point to mouse until another point is added or draft is completed).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_72_road_debugger_drafting_keyboard_shortcuts_exit_confirm_and_live_mouse_preview_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added Enter/Escape drafting shortcuts, an exit confirmation modal when not drafting, and a live snap-aware draft preview segment that follows the mouse.
