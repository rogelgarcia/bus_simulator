#Problem (DONE)

In the Window Mesh Debugger, changing glass IOR and envMap intensity does not produce a visible difference. This suggests the parameters are not wired into the glass material/shader correctly, or are overridden/ignored by current rendering settings.

# Request

Fix glass IOR and envMap intensity so they have a visible, physically plausible effect on glass appearance in the Window Mesh Debugger.

Tasks:
- Diagnose why IOR and envMap intensity appear to do nothing (material type mismatch, wrong uniform mapping, tone mapping issues, missing envMap, transmission path not active, etc.).
- Ensure glass IOR affects refraction/appearance in a visible, controlled way (consistent with the chosen glass model).
- Ensure envMap intensity affects reflection strength in a visible, controlled way.
- Ensure changes apply only to the glass layer (not frames/muntins).
- Ensure the debugger scene lighting/IBL makes the effect easy to see (provide sensible defaults and a “high contrast IBL” preset if needed).

Nice to have:
- Add a simple “glass debug” view mode that isolates reflection/refraction contributions to validate the parameter wiring.

## Quick verification
- Increase envMap intensity:
  - Reflections visibly intensify.
- Adjust IOR across a wide range:
  - Refraction/appearance changes are visible and stable during camera motion.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_237_WINDOWS_window_debugger_fix_glass_ior_and_envmap_intensity_response_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Fixed IBL envMap intensity application for rebuilt window groups so glass envMap intensity changes take effect immediately.
- Made IOR-driven refraction more visible by giving glass a small physical thickness.
- Added quick presets to make validation easier (IBL soft/high/off and a “Glass Only” layer preset).
