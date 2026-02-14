#Problem [DONE]

PBR materials currently have per-material tile size defaults that are not consistently 4x4 meters, and `red_brick` has a custom override that should be removed in favor of a consistent global default.

# Request

Make PBR textures default to a 4x4 meter tile size when a specific tile size is not explicitly set, and remove the special-case tile size override for `red_brick`.

Tasks:
- Change the global/default PBR tile size behavior so that when a PBR material does not specify a tile size, it uses 4.0 meters (assume square tiling unless the system supports separate X/Y).
- Do not edit every individual material entry; implement this by changing the defaults/fallback logic.
- Remove the custom configuration/override that sets a special tile size for `pbr.red_brick`.
- Preserve existing explicit per-material tile size settings (if any) and ensure they still take precedence over the new default.
- Verify that texture inspector and building materials that rely on defaults now render with 4m tiling.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_134_MATERIAL_pbr_default_tile_size_4m_and_remove_red_brick_override`
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Summary
Updated PBR tiling fallbacks to default to 4m and removed the `pbr.red_brick` special-case tile override.
