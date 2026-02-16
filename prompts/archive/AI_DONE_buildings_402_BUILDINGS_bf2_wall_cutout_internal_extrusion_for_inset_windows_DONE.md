# DONE

#Problem
In Building Fabrication 2 (BF2), wall openings are cut as a single zero-thickness hole on the facade surface. When a window is inset, the opening reveals a visible gap because the wall cut does not include any interior “reveal” geometry.

# Request
Improve BF2 wall opening construction so inset windows never reveal a gap, by adding an interior extrusion/reveal around each opening and applying correct UVs/materials to the new faces.

Tasks:
- Generate interior “reveal” geometry for each BF2 wall cutout so the wall opening has thickness into the building (enough depth to cover common inset values).
- Ensure the reveal geometry is watertight with the facade wall surface and does not create cracks at corners or floor slice boundaries.
- Apply the same wall material/texture to the reveal faces.
- Compute reveal UVs in meters (not normalized 0..1) so the wall texture is not stretched on the reveal surfaces; preserve consistent texel density with the main wall mapping.
- Keep arched openings working (no missing triangles or inverted normals on the arched portion).
- Preserve existing per-floor slicing behavior and outward wall normals.
- Add/extend a regression test to cover the inset-gap case (e.g., when `frame.inset > 0`, the opening should not expose empty space; reveal geometry exists and is oriented correctly).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.

## Summary
- Added inward “reveal” extrusion surfaces for BF2 wall openings (depth driven by window `frame.inset`) and mapped UVs in meters so the wall texture does not stretch on reveal faces.
- Kept arched openings working by extruding reveal geometry along the arched boundary while preserving the existing spandrel fill.
- Extended the headless regression test to assert reveal faces exist and have correct orientation on both A and C faces when inset is enabled.
- Documented deterministic cutlines + inset reveal guidance in the facade mesh construction spec.
