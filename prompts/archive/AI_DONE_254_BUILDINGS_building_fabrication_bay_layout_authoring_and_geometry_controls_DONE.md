#Problem (DONE)

We need to adopt the Facade Layout model (bays) so that each face is authored as a **horizontal sequence of bays** that partitions the full face width. Each bay can optionally become a “feature bay” later (starting with windows), can override wall material, and can modify wall depth (extrude/inset) including an angled (wedge) bay form.

# Request

Implement bay-based facade layout authoring in Building Fabrication (per face), aligned with `specs/BUILDING_FABRICATION_FACADE_LAYOUT_SPEC.md`, with strong UI controls for bay sizing and bay geometry depth.

Tasks:
- For each face (A–D), represent its facade as an ordered list of **bays** that fully partition the face width (no uncovered horizontal gaps).
- Add bay editing UI on the selected face:
  - Add Bay
  - Remove Bay
  - Reorder bays (if that makes sense with constraints)
  - Resize bay width with center-anchored resizing (“grows/shrinks to both sides”)
- Enforce minimum width rules:
  - Bays have a minimum width.
  - If a bay contains a window feature (added in a later prompt), its minimum width must be at least the window’s required width.
- Add “padding” support between bays:
  - Authoring a padding interval should result in that interval being **regular wall** at the regular depth (not extruded with neighboring bay).
  - Padding should be represented in the bay model (so the full face is still partitioned by bays).
- Add per-bay wall material override:
  - A bay can inherit the building/face wall material, or override it with a different wall material.
- Add per-bay depth controls:
  - A bay can be extruded out from the wall or inset into the wall.
  - A bay can be an **angled wedge** with side faces slanted, with angle in **15° step increments**.
  - The angled bay form must work whether or not the bay later contains a window feature.
- Keep the result compatible with existing Building Fabrication layers/belts/roofs flow; bays are strictly a facade/face concern for now.
- Add validation + clear warnings in the UI for invalid bay layouts (min widths, total fit, etc.) rather than silently producing bad geometry.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_254_BUILDINGS_building_fabrication_bay_layout_authoring_and_geometry_controls_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

# Summary
- Added per-face facade bay layout model (bays + padding) with center-anchored resizing, per-bay wall material override, depth offset, and wedge angle snapping.
- Added bay layout validation (min widths, wedge constraints, and partition fit) surfaced as clear UI warnings in the Face Editor.
- Wired new UI controls and scene APIs, and expanded core tests to cover bay layout UI + scene behaviors.
