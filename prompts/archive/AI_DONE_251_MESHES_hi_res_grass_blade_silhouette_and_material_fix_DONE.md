#Problem (DONE)

The current **hi-res grass blade** (the procedural “Soccer Grass Blade (hi-res)”) has visual issues:
- The “yellowish” edge/border effect does not read correctly on the outer silhouette when light hits at grazing angles.
- The blade sometimes looks overly shiny/white, suggesting roughness/reflectance some issue (this was fine earlier, and the roughness parameters are correct).
- The blade shape controls are not flexible enough for realistic silhouettes (pointy vs curved tip, width profile, etc.).

# Request

Improve the **hi-res grass blade** so it can be authored to look realistic (accuracy first, optimization later), with strong control over silhouette and correct material response (no unintended white shine).

Tasks:
- Rename the hi-res blade in UI/labels from “Soccer Grass Blade (hi-res)” to “Blade (hi-res)” (no need to keep ids).
- Add sizing controls with larger usable ranges:
  - Blade height: 6 cm to 70 cm
  - Blade widths: 0.5 cm to 9 cm (support a width profile, not just one width)
- Add silhouette/profile controls for the hi-res blade:
  - Bottom/base width
  - Middle width (independent from bottom)
  - Tip width (independent from middle)
  - Tip “start” position (where it begins converging)
  - Tip shape mode: pointy tip vs curved/rounded tip (configurable)
  - Tip curvature/roundness controls so the tip can converge to a vertex or a rounded end
- Ensure the hi-res blade renders with a believable grass material response by default:
  - Fix the overly white/shiny appearance
  - Preserve natural green coloration (no washed-out highlights)
  - Keep the result compatible with built-in Three.js materials (avoid custom shaders unless absolutely necessary)
- Make the **yellow edge tint** read on the **outer silhouette** under grazing light in a controllable way, without turning the whole blade yellow.
- Keep (or improve) compatibility with existing tooling that previews/inspects procedural meshes (mesh inspector / grass debugger selection), so the updated hi-res blade can be inspected and tuned interactively.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_251_MESHES_hi_res_grass_blade_silhouette_and_material_fix_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

# Summary
- Renamed the hi-res blade UI label to “Blade (hi-res)” across inspector + grass debugger selection.
- Added hi-res blade sizing + silhouette controls (height, base/middle/tip widths, tip start, tip mode, tip roundness).
- Rebuilt the hi-res blade geometry generator to support a configurable rounded/pointy tip and improved width profile.
- Tuned the hi-res blade material defaults (reduced white shine, improved grazing-angle edge tint response) while staying on Three.js built-in materials.
