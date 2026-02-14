DONE

#Problem

In the Building Fabrication screen there are many wall controls, but there is no control to change the overall wall tinting/albedo for the entire wall surface. Right now the only way to influence color is via “marks” controls, which makes it hard to art-direct the base wall material quickly and consistently.

# Request

Add first-class controls to adjust the full wall material PBR look in Building Fabrication, including overall albedo tinting and (if missing) roughness and normal controls that apply to the entire wall (not only marks).

Tasks:
- Add an overall wall albedo/tint control that affects the full wall surface (not only marks) and updates live in the fabrication preview.
- Keep compatibility with existing marks/decals behavior (marks remain independent overlays and continue to work as before).
- Add overall wall roughness controls if they are missing (or if current controls only affect marks):
  - Allow tuning the wall’s base roughness for the entire wall surface.
  - Keep results physically plausible and stable (no inverted ranges, no obvious artifacts during camera motion).
- Add overall wall normal controls if they are missing (or if current controls only affect marks):
  - Allow tuning the wall’s base normal strength/intensity for the entire wall surface.
  - Ensure strength=0 (or disabled) behaves sensibly without shading artifacts.
- Persistence/export:
  - Ensure the new parameters persist with Building Fabrication state and are included in the exported building config so generated buildings keep the chosen look.
  - Maintain backward compatibility with older saved/exported configs (new fields optional with safe defaults).
- UX:
  - Place controls in an obvious “Wall/Base Material” area near existing wall settings.
  - Use clear labels and intuitive ranges (e.g., “Wall Albedo Tint”, “Wall Roughness”, “Wall Normal Strength”).

Nice to have:
- Per-control “Reset to defaults” for wall base material settings.
- If a material inspector exists for walls, mirror the same controls there for quick look-dev.
- Optional separation between base wall tint and marks tint for more art-direction flexibility.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_209_BUILDINGS_building_fabrication_wall_base_material_tint_roughness_normals_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (done)
- Added per-floor-layer wall base material settings (`tintHex`, `roughness`, `normalStrength`) with safe defaults + clamping and ensured they export with building configs.
- Added Building Fabrication UI controls under “Walls → Wall base material” to live-edit tint/roughness/normal (with reset).
- Applied the wall base settings during wall material creation so they affect the full wall surface (before material variation) and added a core test covering defaults/clamping.
