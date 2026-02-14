# DONE

#Problem

In the Material view, when a wall material is PBR, the material picker thumbnail does not show the actual texture; it shows a generic shape instead. This makes it hard to identify/select materials visually. The preview also needs better framing/zoom so the shape/readability is clearer.

# Request

Improve the material picker thumbnail rendering for PBR wall materials so the picker shows the material’s texture (albedo/base color is sufficient) and the preview is zoomed/framed to better show the shape and texture detail.

Tasks:
- Fix PBR wall material thumbnails so the picker shows the material texture rather than a generic placeholder shape.
- It is acceptable to use only the albedo/baseColor texture (or equivalent “diffuse”/color map) for the thumbnail preview.
- Improve the thumbnail preview framing/zoom so the previewed shape is larger and easier to read (while still showing enough surface area to see the texture).
- Preserve existing behavior for non-PBR materials and any existing UI interactions (select, hover, tooltips, disabled states).
- Keep performance acceptable: avoid per-frame thumbnail rerenders; reuse cached thumbnails where possible.

Nice to have:
- Handle missing/failed texture loads gracefully (show a clear fallback, but surface errors in DEV).
- Ensure thumbnails remain consistent across different material types (PBR vs non-PBR) and across different wall material catalogs.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_177_MATERIAL_pbr_material_picker_thumbnail_show_albedo_and_zoom_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- PBR material options now use the material baseColor (albedo) URL as `previewUrl` when PBR assets are enabled, with cached placeholder fallback.
- Picker thumbnails are zoomed/framed better (no padding for image thumbs + slight scale) for clearer texture readability.
- Missing/failed thumbnail image loads fall back to a text label and warn once per URL on dev hosts.
