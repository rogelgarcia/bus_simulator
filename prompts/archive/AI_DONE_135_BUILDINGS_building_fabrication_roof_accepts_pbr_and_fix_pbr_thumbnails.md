# DONE

#Problem

In building fabrication, roof materials currently only support `color` or `texture`, so roofs cannot use PBR materials. Also, the wall material picker shows PBR thumbnails without the actual texture preview (the PBR texture image isn’t displayed).

# Request

Improve building fabrication + material picking so roofs can use PBR materials and PBR material thumbnails display an actual preview of the baseColor texture when available.

Tasks:
- Update building fabrication so roof material selection accepts PBR materials (in addition to existing color/texture).
- Ensure the roof layer config schema supports PBR in a consistent way with wall layers (including persistence and backwards compatibility for existing configs).
- Update the building fabrication UI to allow picking PBR materials for roofs using the same picker experience as walls where appropriate.
- Fix the wall material picker PBR thumbnails so they show an actual texture preview (use the PBR baseColor map) instead of a placeholder image.
- Ensure thumbnail generation respects the PBR assets runtime availability/enable toggle:
  - If PBR assets are available + enabled, load the baseColor image and render it into the thumbnail.
  - If assets are unavailable/disabled, fall back to a stable placeholder thumbnail (deterministic per material id).
- Keep thumbnails performant: cache generated previews and avoid refetching images repeatedly.
- Validate that thumbnails work for multiple PBR materials and that both roof and wall pickers show consistent previews.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_135_BUILDINGS_building_fabrication_roof_accepts_pbr_and_fix_pbr_thumbnails`
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Summary
Roofs can now use PBR materials and PBR picker thumbnails show baseColor previews when enabled (with deterministic placeholder fallback).
