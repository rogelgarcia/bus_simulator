# Problem [DONE]

Road Debugger introduces many math and pipeline concepts (lane divider,
asymmetric widths, snapping, AABB/OBB/SAT, overlap polygons, trim intervals).
Without in-UI explanations, the tool is hard to use and debug correctly.

# Request

Add a detailed Help panel and per-control tooltips to Road Debugger explaining
the key concepts and how they affect the design and results.

Tasks:
- Add a Help UI entry point (button or panel) that is always accessible.
- Add per-control tooltips and/or inline help for key controls and toggles.
- Include explanations for at least:
  - Lane model (F/B counts, right-hand driving, divider centerline).
  - Width derivation (lane width + 10% asphalt margin).
  - Direction centerlines (when present and where they are positioned).
  - Tangent factor (future TAT radius scale) and what changing it implies.
  - Snapping (tile/10 grid), temporary snap disable hotkey, axis-lock.
  - Crossing threshold and what "near overlap" means.
  - Pipeline debug toggles and what each step visualizes.
  - AABB vs OBB bounds and why both exist.
  - SAT (Separating Axis Theorem) for OBB overlap.
  - Convex clipping (e.g., Sutherland-Hodgman) for overlap polygons.
  - Removed interval [t0,t1], symmetric trimming, splitting, dropped pieces.
- Add/update browser-run tests validating the help UI is created and contains
  the expected sections/keys.

Constraints:
- Keep changes limited to Road Debugger UI/modules.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added an always-available Help modal with concept explanations plus per-control tooltips, and browser tests validating the help UI contents.
