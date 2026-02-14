#Problem [DONE]

Buildings are not aligned to the sidewalk level, causing visual mismatches
between road/sidewalk elevation and the building base. This also impacts
relative facade features (like window Y positioning) that assume a ground-level
baseline.

# Request

Align buildings to the sidewalk level by extending the first floor height to
include the sidewalk height and adjust all dependent vertical parameters.

Tasks:
- Ensure buildings sit at sidewalk level (their base aligns with the sidewalk
  surface).
- Extend the first floor height by the sidewalk height so the building’s
  street-level facade matches sidewalk elevation.
- Adjust all relative vertical parameters that reference floor baselines so
  they start from the sidewalk height, including (but not limited to) window Y
  positioning.
- Keep upper floor heights and overall building proportions consistent with the
  new baseline.
- Ensure defaults preserve current behavior when sidewalk height is zero or
  when buildings are rendered without sidewalks.
- Verify the change in both building fabrication and gameplay/city rendering. They should be using the same engine nevertheless. So, changing code in just once place should reflect in all scenes.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Buildings now align their base to sidewalk elevation and extend the
first floor by the sidewalk height, updating window/floor baseline math via
the shared building generator.
