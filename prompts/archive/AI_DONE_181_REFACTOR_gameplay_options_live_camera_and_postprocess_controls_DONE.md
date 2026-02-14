# DONE

#Problem

In gameplay mode, opening the Options panel makes it hard to adjust/view the scene because camera input is blocked or gets reset after a timeout. Also, post-processing controls are confusing/inaccurate: enabling Color Grading appears to also apply Bloom (washing the sky white/foggy), Sun Flare controls don’t match desired UX (checkbox + strength that doesn’t visibly change), and the Options readouts (ex: “postprocessing pipeline”, “color grading active now”) don’t update live as settings change.

# Request

Improve the gameplay Options experience so camera control and post-processing settings behave correctly and update in real time.

Tasks:
- When the Options panel is open during gameplay, allow manually moving the camera in the viewport (mouse/keys as appropriate) without the camera auto-resetting after an idle timeout; preserve the manual camera state while the panel remains open.
- Ensure the Options overlay does not unintentionally “steal” all pointer/keyboard input from the game viewport; only the panel itself should capture UI interactions, and the rest of the screen should allow camera interaction.
- Fix post-processing coupling: enabling Color Grading must not implicitly enable Bloom or otherwise over-brighten/wash out the sky; Bloom should only affect the scene when explicitly enabled and with sane defaults.
- Make post-processing status readouts update live as the user changes settings (no stale “pipeline active” / “color grading active now” text).
- Update Sun Flare options UX:
  - Use 3 buttons for presets: Off, Subtle, Cinematic (remove the checkbox).
  - Ensure the selected preset produces a clearly different result (not just a no-op strength slider).
  - If “strength” cannot be made meaningful, remove the strength control and keep only On/Off (or Off/Subtle/Cinematic) to avoid misleading UI.
- Use toggle-style controls for on/off settings instead of plain checkboxes (consistent visuals across Options), while keeping keyboard accessibility and clear labels.
- Verify changes work in gameplay mode and do not regress the Options experience in non-gameplay contexts (welcome/setup/debug screens).

Nice to have:
- Add a small “apply live” mode for post-processing settings so users can preview changes instantly, but keep “Save” persistence behavior consistent with existing Options flows.
- Add a short developer note describing where the camera timeout/reset logic lives and how Options interacts with it.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_181_REFACTOR_gameplay_options_live_camera_and_postprocess_controls_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Kept gameplay camera pointer controls active while the Options overlay is open, so you can drag/orbit the camera in the remaining viewport.
- Made Bloom opt-in by default and prevented Color Grading from implicitly enabling Bloom; adjusted the grading shader to avoid washed-out output when post-processing activates.
- Updated Options → Lighting to show live post-processing status, and simplified Sun Flare UX to 3 presets (Off/Subtle/Cinematic) with consistent switch-style toggles.
