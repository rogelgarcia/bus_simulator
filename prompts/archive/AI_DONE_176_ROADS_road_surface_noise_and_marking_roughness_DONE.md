# DONE

#Problem

Road surfaces and line markings currently look too clean/uniform, which makes the city visuals feel flat and “procedural”. Attempts to add detail risk introducing obvious repeating patterns (ex: stacked circles/stamps) that look artificial and distracting.

# Request

Improve road visual realism by adding subtle, non-repeating surface variation (“noise”) and roughness variation to both asphalt and road line markings, without introducing obvious repeating patterns.

Tasks:
- Add subtle road surface variation so asphalt does not look uniformly flat (ex: small-scale color/roughness variation that reads as wear/dirt).
- Add subtle variation to lane/line markings so they don’t look perfectly clean and uniform (ex: slight roughness/edge breakup/imperfection consistent with paint wear).
- Avoid obvious pattern repetition: do not use stacked circles/stamps or any repeating motif that reads as a pattern; prefer noise-like variation that is hard to detect as repeating.
- Keep performance acceptable: avoid heavy per-fragment work or high-frequency animated noise; ensure the approach scales across the full city.
- Preserve existing road/marking readability: markings must remain clear at typical gameplay camera distances and angles.
- Ensure the solution works consistently across road renderers where markings/asphalt appear (gameplay city roads and any relevant debug views that show final materials).

Nice to have:
- Provide a small set of tunables (ex: noise scale, intensity, roughness range) to quickly adjust the look without code changes (could be in an existing debugger/options UI if appropriate).
- Keep results deterministic (stable across runs for the same city/seed) so visual changes are reproducible.
- Add a quick visual “before/after” verification checklist (not screenshots) to confirm no obvious tiling/patterns are introduced.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_176_ROADS_road_surface_noise_and_marking_roughness_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added deterministic world-space asphalt variation (subtle color + roughness noise), configurable via `road.visuals.asphalt`.
- Added deterministic world-space marking variation (subtle color + roughness noise), configurable via `road.visuals.markings`.
- Improved baked markings mode with noise-driven wear/dirtying, slight edge breakup, and distinct marking roughness.
