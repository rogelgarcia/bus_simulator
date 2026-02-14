# Problem [DONE]

Building fabrication currently offers a limited set of window textures/styles.
We need two additional window texture options so buildings can use a brighter
light-blue glass look and a green-tinted glass look.

# Request

Add two new building window textures/styles: Light Blue and Green, and make
them selectable anywhere window textures/styles are chosen.

Tasks:
- Add a new window style/texture option for "Light Blue" that is visually
  distinct from the existing "Blue" style (brighter/lighter).
- Add a new window style/texture option for "Green".
- Ensure both new styles appear in the building fabrication windows picker and
  any other relevant window style selectors.
- Ensure both new styles appear in the Texture Inspector catalog with correct
  labels and previews.
- Ensure window texture generation and caching work for the new styles (no
  per-frame regeneration).
- Keep existing saved building configs compatible (old style ids still load and
  default behavior remains unchanged).
- Add a browser-run test that validates the new styles are registered and can
  generate textures without errors.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added Light Blue and Green window types/styles across selectors and the Texture Inspector, with cached texture generation and browser-run validation tests.
