DONE

#Problem

There is currently no persistent, always-visible performance/status area across the app. For fast iteration (especially when using debugger-specific pages), it’s hard to quickly see FPS and core rendering/performance metrics without opening separate tooling or overlays.

# Request

Add a small global performance/status bar at the very top of the page (24px tall) that is present on **every page** (including debugger-specific screens). This bar must take layout space (it steals height from the main viewport canvas) and must not be an overlay.

Tasks:
- Add a global top bar (24px height) to the base page layout:
  - Present on all pages, including all debug tools pages.
  - Not an overlay: the main viewport/canvas should be resized to accommodate it.
  - Ensure viewport resizing and any canvas sizing logic remains correct (no stretching, no misalignment).
- Add output widgets in the bar showing performance metrics for the main viewport:
  - FPS (and optionally frame time) with stable/low-noise readout.
  - Render stats where available (e.g., triangles rendered, draw calls, objects/instances, geometry/texture counts).
  - Any other meaningful performance metrics already available in the engine/runtime.
- Add GPU/renderer information where available:
  - Display basic renderer info (API/version, renderer/vendor strings if accessible).
  - Attempt to show GPU memory usage / GPU load if the platform exposes it, but gracefully degrade when it’s not available (no crashes, show “N/A” or omit).
  - Keep collection lightweight; avoid introducing expensive per-frame queries that reduce FPS.
- UX/quality:
  - Keep the bar readable within 24px (compact layout, consistent styling).
  - Ensure it doesn’t interfere with existing keyboard shortcuts or UI interactions.
  - Provide safe fallbacks if metrics are unavailable (still show FPS at minimum).

Nice to have:
- Click/hover affordance to reveal a slightly more detailed breakdown (without changing the 24px base layout height).
- A simple toggle to hide/show the bar (useful for screenshots), defaulting to visible.
- A small warning indicator when FPS drops below a threshold (configurable).

## Quick verification
- Open the main game page and multiple debug tool pages:
  - Confirm the top bar is present everywhere and the viewport canvas is reduced in height accordingly.
  - Confirm FPS updates and there are no console errors on pages where GPU stats are not available.
  - Confirm draw calls/triangles update as the scene changes (where supported).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_215_UI_global_top_perf_bar_fps_gpu_metrics_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (done)
- Added a global 24px top performance bar (non-overlay) with FPS + render stats + GPU/renderer info and a click-to-expand details panel.
- Added a lightweight `GameEngine.addFrameListener()` hook and wired the perf bar into the main app and all debug tool pages.
- Updated layout/CSS so the canvas and UI layers resize to accommodate the bar, and added a core test to validate the top inset behavior.
