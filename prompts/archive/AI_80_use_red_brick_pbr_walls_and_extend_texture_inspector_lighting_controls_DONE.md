# Problem [DONE]

Building walls currently use a flat brick texture (`brick_wall.png`) without a full PBR material set, so walls look visually flat. Additionally, the Texture Inspector can preview textures but does not provide sufficient lighting controls to evaluate PBR maps (normal/roughness) under different light directions/intensities.

# Request

Replace the current brick wall look with the new red brick 2K PBR texture set and extend the Texture Inspector so the new wall material is visible and can be evaluated with adjustable lighting.

Tasks:
- Update the building wall “Brick” style so it uses the new red brick 2K material set from `assets/public/` (basecolor + supporting PBR maps) instead of the old single `brick_wall.png` texture.
- Ensure the new brick wall rendering is applied consistently anywhere the Brick wall style appears (city buildings, building fabrication, any previews).
- Extend the Texture Inspector catalog so building wall materials can be browsed and selected:
  - Add a new collection for building wall materials (e.g., “Building Walls”) and include the new red brick texture/material entry.
  - The inspector preview should clearly show the effect of PBR maps (not just the base color image).
- Add lighting controls to the Texture Inspector UI so PBR effects can be inspected:
  - Provide controls to move the primary light direction/position.
  - Provide controls to adjust light intensity and optionally toggle/add an additional fill/rim light (or similar) so normal/roughness differences are obvious.
  - Ensure controls are interactive and update the preview immediately.
- Keep the Texture Inspector UX consistent with existing panel styling and patterns (collections menu, options list, bottom/right info areas if present).
- Ensure color space handling remains correct (basecolor treated as color, PBR data maps treated as non-color).
- Add a quick verification checklist:
  - Brick walls show clear normal/roughness response when moving the light.
  - The new red brick entry is selectable in Texture Inspector and previews correctly.
  - No regressions to existing Texture Inspector collections (Windows, Traffic Signs).
- Keep the old brick texture/material in the assets for backward compatibility (with a deprecated name) but ensure it is not used in any new walls or previews.  

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_80_use_red_brick_pbr_walls_and_extend_texture_inspector_lighting_controls_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Verification checklist:
- Brick walls show clear normal/roughness response when moving the light (Texture Inspector → Building Walls → Brick (PBR)).
- New red brick entry is selectable in Texture Inspector and previews with adjustable lighting controls.
- No regressions to existing Texture Inspector collections (Windows, Traffic Signs).

Summary: Switched the Brick building style to use the red brick 2K PBR set (basecolor/normal/roughness) and extended Texture Inspector with a Building Walls collection plus interactive lighting controls.
