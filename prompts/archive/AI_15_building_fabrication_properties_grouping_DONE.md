#Problem [DONE]

Building fabrication properties are becoming more complex and need clearer
organization. Belt options also need to be more flexible across floor groups,
and roof color/belt color should be independently configurable.

# Request

Reorganize the building fabrication properties UI into clear sections and
expand belt/color configuration across floors and roof.

Tasks:
- Group building fabrication properties into sections:
  - Floors
  - Street Floors
  - Roof
- Move the street belt options inside the Street Floors section.
- Allow street belts even when Street Floors are disabled (street floors count
  can be zero), so the belt can still be used as a facade feature.
- Add belt options for regular Floors as well (not only street floors).
- In the Street Floors section, place the Street Floors enable checkbox inside
  that section.
- In the Roof section:
  - Add options for roof belt and roof color.
  - Allow choosing roof color and roof belt color independently.
- Ensure defaults preserve current visuals/behavior when belt features are not
  enabled.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Reorganized building properties into collapsible Floors/Street floors/Roof sections, decoupled street belt usage from street floors enable, and added independent roof color + roof belt color controls.
