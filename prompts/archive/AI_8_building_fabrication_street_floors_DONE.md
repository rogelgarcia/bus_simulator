#Problem [DONE]

All building floors currently share the same height and textures, which limits
the ability to create realistic facades where the lower (street-facing) floors
differ from upper floors.

# Request

Add support for "street floors" in building fabrication so the first floors can
use different height/materials, with an optional architectural border between
street and upper floors.

Tasks:
- Add a "Street floors" feature flag in building properties.
- When enabled, allow configuring how many initial floors are considered street
  floors and differ from the remaining upper floors.
- Allow street floors to use a different floor height than upper floors.
- Allow street floors to use different textures/materials than upper floors.
- Add an option to render an architectural border between street floors and
  upper floors.
  - Use a clear, user-facing label for this border (e.g., a facade band /
    belt course) and keep terminology consistent across UI and code.
  - When enabled, render an off-white box band at the transition height.
  - The band should be slightly larger than the building footprint (a
    configurable margin).
- Place this band margin setting under a "Features" section in the properties
  UI so future feature margins can be added alongside it.
- Ensure defaults preserve current behavior when street floors are disabled.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added configurable street floors + optional belt course (margin) to building fabrication, including thumbnail texture pickers and shared generator support.
