DONE
#Problem

The current road surface noise/variation is only applied to the asphalt base material. Road markings (yellow/white) remain too clean/uniform in comparison, which can make them look pasted-on. In real roads, markings pick up subtle variation from the underlying surface and wear (micro roughness breakup, slight tint/brightness variation), but this should be controllable since it can reduce readability if overdone.

# Request

Add a toggle to optionally apply the existing asphalt noise/variation to road markings as well.

Tasks:
- Add a toggle switch (UI + persisted setting) that controls whether the existing asphalt noise/variation influences the road marking material(s).
- When enabled, apply the same noise signals to markings in a subtle way:
  - Prefer roughness variation and very small albedo modulation so markings keep good readability.
  - Ensure yellow/white target colors are still achievable (don’t drift too far; keep the effect mild).
- When disabled, preserve current behavior (noise affects asphalt only; markings remain clean).
- Keep the implementation consistent with the current road material/shader architecture (shared uniforms/noise textures where possible, avoid duplicating expensive shader work).
- Ensure changes update live when toggled (no restart required) and do not introduce visible artifacts (banding, shimmering, moiré) in motion.

Nice to have:
- Provide separate strength multipliers for markings vs asphalt (markings default lower).
- Add a small debug view/visualization mode to confirm the noise is being applied to markings without guessing.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_188_ROADS_toggle_apply_asphalt_noise_to_road_markings_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added persisted `asphaltNoise.markings` settings (toggle, color/roughness strengths, debug) and exposed them in the Options Asphalt tab.
- Applied asphalt fine roughness noise to road marking mesh materials via shader injection, with live uniform updates.
- Extended baked-road-markings overlay shader to optionally modulate markings using asphalt noise (kept subtle by default).
