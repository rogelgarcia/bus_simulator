# Problem [DONE]

When a building has both a belt ring and extruded space columns, the column
extrusions are split per floor, creating visible seams instead of one continuous
column.

# Request

Make extruded space columns span vertically as a single continuous column across
all floors in a layer, even when belt rings are present.

Tasks:
- Treat extruded space columns as continuous geometry across the full layer
  height instead of per-floor segments.
- Ensure belt rings do not cut or interrupt the column extrusion.
- Preserve spacing, materials, and offsets for space columns on each face.
- Keep behavior correct for multi-tile faces and corners.
- Update any related config/schema and UI controls if needed.
- Add a browser-run test that validates continuous column extrusion with belt
  rings enabled.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Made space column extrusions continuous per layer (not per-floor) even with belt rings, and added a browser-run regression test.
