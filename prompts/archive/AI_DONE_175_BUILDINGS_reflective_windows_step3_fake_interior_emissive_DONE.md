# DONE

#Problem

Even with reflections, building windows can still look “dead” if they are only reflective glass. A common game technique is a “fake interior” effect: some windows appear lit from inside via an emissive map/tint, which also works especially well when Bloom is available. This must be deterministic and must avoid obvious repeating patterns.

# Request

Phase 3: Add an optional “fake interior” effect for building windows using emissive maps/tints, designed to work well with Bloom. All new options introduced in this phase must be **enabled by default**.

Tasks:
- Add an emissive “fake interior” window look that can be enabled/disabled via Options, and ensure it is **enabled by default**.
- Implement the effect in a deterministic way (stable results for the same building/seed) and avoid obvious repeating patterns (no stacked circles/stamps that read as a pattern).
- Prefer an emissive-map based approach:
  - Provide an emissive map (greyscale or tinted) where some window areas are “lit”.
  - Set emissive intensity to a strong-but-reasonable default (starting point: ~`2.0`) so it reads at gameplay distances.
- Ensure the emissive effect composes well with reflective glass from Phase 2 (ex: emissive belongs to the frame/interior layer, while reflections remain on the glass layer).
- Ensure the effect works across building generation paths (city gameplay buildings and building fabrication previews).
- Ensure performance and memory are acceptable (texture caching/reuse; no leaks on rebuilds).

Nice to have:
- Offer simple tunables in Options (enabled toggle, intensity, lit-window density/seed offset) with all toggles **enabled by default**.
- If Bloom is enabled, ensure lit windows glow pleasantly without washing out the scene (tune emissive intensity and/or bloom threshold accordingly).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_175_BUILDINGS_reflective_windows_step3_fake_interior_emissive_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added persisted “Fake interior (emissive windows)” settings (enabled by default) with intensity/density/seed offset controls in Options → Gameplay.
- Implemented deterministic per-window lit selection and pattern variation using cached emissive-map textures, avoiding obvious repeats and working with Bloom.
- Applied the emissive interior effect to both city buildings and building fabrication previews, composing with the reflective glass layer from Phase 2.
