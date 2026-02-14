# Problem [DONE]

Floor belts are currently specified as a vertical band at the top of each
floor, but there is no way to specify that the belt protrudes out from the
wall face (extrusion).

# Request

Extend building fabrication so floor belts can be extruded from the building
faces.

Tasks:
- Align fabrication with `BUILDING_FABRICATION_SPEC` belt extrusion.
- Allow a belt to define an extrusion amount (out from the wall face).
- Ensure the belt extrusion works across multi-tile faces and around corners.
- Ensure extruded belts respect building placement constraints near streets
  (no overlaps with streets/sidewalk bounds).
- Expose the belt extrusion control in the building fabrication UI.
- Add a small browser-run test that validates the belt config shape supports
  extrusion and that exported configs preserve it.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added belt extrusion support in building fabrication schema/UI and generator, and ensured exports preserve the `belt.extrusion` field.
