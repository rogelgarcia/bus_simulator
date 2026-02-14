DONE

#Problem

The game’s current default grass texture/material is not using the desired PBR set. There is a higher-quality grass material set (“grass 004”) available in the `downloads/` folder, but it is not integrated into the game’s asset pipeline and not used as the default.

# Request

Import the “grass 004” **full PBR** texture set from `downloads/` into the game’s PBR assets, and make it the new **default grass** material/texture used by the world (replacing the current default grass texture).

Tasks:
- Asset integration:
  - Locate the “grass 004” asset set in `downloads/`.
  - Copy the full PBR texture set into the game under the appropriate PBR assets location (do not reference `downloads/` at runtime).
  - Ensure all required maps are included (not just albedo): at minimum albedo/baseColor, normal, roughness (and any other maps provided by the set such as AO/height/metalness).
  - Ensure texture settings are correct (color space: albedo sRGB, data maps linear; normal map flagged correctly; mipmaps/repeat settings appropriate).
- Replace default grass:
  - Identify where the current default grass texture/material is defined and used (terrain/ground material, grass planes, etc.).
  - Switch the default to use the new “grass 004” PBR set everywhere the default grass is used.
  - Ensure any “old default grass” remains available if referenced by other content (unless it is safe to fully replace).
- Consistency + tiling:
  - Ensure the grass tiling/scale looks correct at typical camera heights and across large ground surfaces (avoid obvious repeating artifacts).
  - If the current system supports it, keep/verify UV scale controls still work with the new textures.
- Performance/safety:
  - Avoid introducing extremely large textures as defaults without downscaling/compressing if needed.
  - Ensure there are no missing-texture console warnings and no runtime fetches from `downloads/`.

Nice to have:
- Add an Options/debug control to quickly swap between “Default Grass” variants for A/B comparisons.
- Add a simple validation in a test/debug scene that confirms all grass PBR maps are bound (albedo/normal/roughness at minimum).

## Quick verification
- Load the main city scene and confirm the ground uses the new grass look (with normal/roughness visibly affecting lighting).
- Move the camera across a large area:
  - No obvious seams, correct repeat behavior, and stable shading (no shimmering).
- Confirm there are no runtime references to `downloads/` and no missing-texture warnings.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_217_MATERIAL_import_grass_004_pbr_and_set_as_default_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (done)
- Copied the Grass004 full PBR texture set into `assets/public/pbr/grass_004/` (basecolor/normal/roughness/AO + displacement kept).
- Updated city ground generation to use the new grass_004 PBR maps by default (with UV2 for AO) and warn+fallback to `assets/public/grass.png` if needed.
- Expanded public asset smoke tests to verify the grass_004 PBR maps are served.
