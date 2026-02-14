#Problem [DONE]

Building fabrication currently assigns tiled PBR materials to floor and roof layers but does not provide controls for procedural variation/weathering, and users cannot override texture size (tile meters) per layer from the building fabrication workflow.

# Request

Update building fabrication so floor and roof layers can opt into the Material Variation system and expose parameters for tweaking, including a per-building seed and per-layer overrides.

Tasks:
- Add a new section to *flooring* and *roof* layers to configure Material Variation settings (enable/disable, seed behavior, and per-effect parameters).
- Ensure the per-building seed is supported and stable; allow an override at the building level and allow per-layer seed offsets (so different surfaces can vary while staying deterministic).
- Provide parameter controls to tweak the procedural effects for floors and roofs (intensity, macro scale, streaking, edge wear, grime, etc.), with sensible defaults and safe ranges.
- Flooring constraint: apply the variation as a single continuous unit over the entire flooring face (not one independent application per floor level).
- Add an option on flooring and roof layers to override texture size/tiling (e.g., tile meters) even when the underlying PBR material defaults are used.
- Keep backwards compatibility for existing building configs that don’t specify the new section; the default behavior should remain unchanged unless enabled.
- Ensure the inspector/building fabrication UI shows the new section clearly and supports editing + persistence in the building config.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_133_BUILDINGS_building_fabrication_add_material_variation_controls`
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Summary
Added opt-in per-layer material variation + tile-meters overrides for fabrication floor/roof layers, plus a per-building seed override that persists through config export and city generation.
