# Problem [DONE]

After adding the Road Debugger and related changes, a new bug appeared during the initial app boot:

- On a fresh page load, after all resources finish loading and the app transitions to the Welcome screen, the view turns **black**.
- The app is still responsive: pressing `Q` enters the debug screen.
- Pressing `Q` again returns to the Welcome screen and it renders correctly.
- The black screen only happens on the first attempt to show the Welcome screen after loading.

# Request

Fix the Welcome screen rendering so it never turns black after resources load, while preserving all existing state transitions and debug shortcuts.

Tasks:
- Reproduce the issue reliably (fresh reload) and identify the root cause of the initial black screen.
- Ensure the Welcome screen renders correctly the first time it becomes active after resources are loaded.
- Ensure state transitions are robust:
  - Switching Welcome → Debug (`Q`) → Welcome should work (already works) and should not be required to “unstick” rendering.
  - Any renderer/canvas/UI visibility and sizing behavior must be correct immediately on first entry.
- Ensure the fix does not break other scenes (gameplay, city debugger, road debugger, texture/mesh inspectors) or keyboard shortcuts.
- Add lightweight diagnostics/guardrails appropriate for this repo so similar issues are easier to catch:
  - Validate that the active scene/state has a valid render target and the render loop is active on first entry.
  - Ensure resize/layout is applied at the correct time so the canvas is not left at 0×0 or hidden behind overlays.
- Add a small regression check:
  - Fresh reload with cache disabled should not produce the black Welcome screen.
  - The first Welcome screen entry after loading must render without requiring any state toggling.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_70_fix_welcome_screen_black_on_first_load_after_resources_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Prevented the first-load black Welcome screen by scoping `RoadDebuggerState` UI mutations to the real app canvas (so browser tests don’t hide Welcome UI), with a regression test to catch future DOM leaks.
