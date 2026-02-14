# DONE

#Problem

The “System Setup” screen is currently a dedicated state that hides the game canvas and replaces the background, which prevents using it as an in-game overlay. This makes it inconvenient to access setup/scene navigation while already in gameplay, and it’s not possible to keep the world visible and updating behind the panel.

# Request

Allow the Setup screen to be opened during gameplay as a transparent overlay that can update in real time while the game remains visible.

Tasks:
- Make the Setup UI accessible from gameplay (hotkey and/or an in-game UI entry point) without forcing a full state transition that clears/hides the active scene.
- When the overlay is open, keep the 3D scene visible and updating behind it (no forced canvas hiding); ensure input focus and key handling do not interfere with driving controls while the overlay is active.
- Keep the existing Setup UI look/structure, but make the panel visually transparent/translucent so gameplay remains readable behind it (and maintain good contrast/legibility).
- Add an expand/collapse control (icon button) on the Setup panel to quickly minimize the panel and reveal more of the gameplay view while keeping the overlay available.
- Reduce the overlay panel footprint: narrow the panel layout and reduce any slider/control widths by ~50% (while staying readable/usable and responsive across window sizes).
- Support closing the overlay to immediately return to gameplay without restarting/reloading the scene; ensure event listeners and DOM state are cleaned up correctly.
- Ensure selecting a target scene from the overlay still works (navigates to the chosen scene/state), but does not introduce regressions for the original “from Welcome → Setup” flow.
- Verify the overlay behaves well across window resizes and different aspect ratios (layout stays correct and usable).

Nice to have:
- Add a subtle dim/blur behind the panel (optional) that still preserves visibility of the world.
- Provide a small “You are here” indicator or highlight for the currently active scene when the overlay opens.
- Persist collapsed/expanded state during the session (and optionally across reloads) for convenience.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_180_REFACTOR_setup_overlay_in_gameplay_with_live_background_and_transparency_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added a shared `SetupUIController` used by both the dedicated Setup state and the in-game overlay (menu + ASCII frame sizing + cleanup).
- Added gameplay hotkey (`Q`) to open Setup as a live, translucent overlay without clearing/hiding the active 3D scene; `Esc/Q` closes and restores controls.
- Added collapse/expand control with persisted collapsed state, plus overlay-focused styling (smaller footprint, translucency, click-outside-to-close).
- Added a Playwright smoke test ensuring the gameplay Setup overlay does not trigger the old canvas-hiding path.
