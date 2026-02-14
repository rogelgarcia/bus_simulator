DONE

#Problem

Building fabrication windows currently rely mostly on color/emissive-style textures and shader tricks, but they don’t behave like full PBR materials. Without per-window normal and roughness information, windows can look flat and the layering between glass, internal grids (muntins), and frames/borders can read incorrectly.

# Request

Upgrade building-fabrication windows to support runtime-generated PBR textures, including normal and roughness maps that are generated relative to the window textures, and expose these controls in the Windows section of the building fabrication UI, also expose the controls in the material inspector for windows.

Tasks:
- Generate runtime PBR maps for windows:
  - Add runtime generation of a **normal map** and **roughness map** for each window texture variant, derived from/relative to the window’s base texture patterns (frame, muntins/grid, mullions, etc.).
  - Ensure these maps are stable/deterministic 
  - Ensure correct color space and texture settings (normal map type, roughness map linear, mipmaps) so the results are physically plausible.
- Expose controls in Building Fabrication UI (Windows section):
  - Add toggles/options to enable runtime normal map generation and runtime roughness map generation for windows.
  - Add basic strength controls (normal intensity, roughness contrast/scale) with sensible defaults that don’t look exaggerated.
- Embedded-border effect:
  - Add a very thin “border lip” layer around the window opening so the window appears embedded/inserted into the wall.
  - This border is not the window frame; it’s a subtle bevel/normal feature at a slightly higher surface level to sell depth.
  - Expose a control to enable/disable and tune this border thickness/strength.
- Fix window layering with internal grids:
  - Some window styles have an internal white grid that should read as being above the glass surface.
  - Make the glass surface sit slightly “lower” than the internal grid by using the generated normal map (and/or parallax-like shading) so the grid appears raised without changing geometry.
  - Ensure the effect remains subtle and does not introduce obvious artifacts (shimmering, aliasing) during camera motion.
- Integration:
  - Ensure these runtime maps integrate with the existing window material pipeline (including existing fake depth/parallax options).
  - Ensure the changes work across all window styles/types in the fabrication system.
- Export controls in the material inspector room.

Nice to have:
- Add a “preview”/look-dev mode in the fabrication scene to quickly cycle window styles and validate the PBR maps under different lighting.


## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_194_BUILDINGS_runtime_pbr_window_textures_normal_roughness_and_embedded_border_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Quick validation
- Run `python3 -m http.server 8000`, open `index.html`, then press `5` (Building Fabrication).
- Load a catalog building (ex: `brick_midrise`) and open the Windows controls for a floor layer.
- Toggle `Window PBR` settings and confirm changes are visible (normals/roughness/border) and don’t shimmer during camera motion.
- Press `6` (Inspector Room) → `Textures` → `Windows` and verify the window preview responds to the new Window PBR controls.

## Summary (done)
- Added runtime-generated window normal + roughness maps (cached) and integrated them into window materials (including fake-depth shader path).
- Added Window PBR controls to Building Fabrication Windows UI (normal/roughness + border lip tuning).
- Added Window PBR controls to Inspector Room texture preview for windows.
- Added core tests for window PBR map caching and window pbr schema cloning/defaults.
