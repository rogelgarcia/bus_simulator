#Problem [DONE]

Buildings need more facade control for larger footprints and higher floor
counts. Window layouts should support intentional "breaks" in repetition, and
walls should support offset features (extrusions and insets) to create more
realistic massing.

# Request

Add facade features for window spacers and wall offsets (extrude and inset),
configurable for street floors and regular floors.

Tasks:
- Add a "Window spacer" feature that can be enabled independently for street
  floors and for regular floors.
- A window spacer is a vertical band that appears between windows along a wall.
- Allow configuring the number of consecutive windows rendered before inserting
  a spacer (e.g., after every N windows).
- After inserting a spacer, reset the window disposition on the remaining span
  (i.e., restart window layout as if beginning a new segment).
- Ensure spacer insertion works across multi-tile building faces without
  resetting per tile.
- Allow optionally extruding the wall where the spacer band is located.
- Make the extrusion distance configurable.
- Add a separate wall "inset" (shrink) feature:
  - Instead of rendering exterior walls exactly on the building footprint
    boundary, render walls inset inward by a configurable distance.
  - This should uniformly move exterior wall surfaces toward the interior of
    the footprint while preserving the footprint used for placement and
    collision.
- Expose new configuration options in building properties with sensible
  defaults that preserve current behavior when features are disabled.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added configurable facade window spacer bands (with optional extrusion) and a configurable exterior wall inset, exposed for both regular and street floors.
