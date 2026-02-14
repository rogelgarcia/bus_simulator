#Problem [DONE]

Building fabrication properties that require selecting a color or a texture
(style) use inconsistent controls. This makes it hard to reuse the same UX for
walls, belts, and roof materials.

# Request

Create a reusable material picker UI that supports choosing solid colors and
texture styles, and use it across building-related properties.

Tasks:
- Create a reusable "Material picker" control for building fabrication
  properties that require selecting either a color or a texture (style).
- The material picker opens a popup where the user can choose:
  - Solid colors (a curated set of common colors).
  - Textures/styles (with a visual preview).
- After selection, the material picker should display the chosen material
  (color swatch or texture preview) in the property panel.
- Use the same material picker control for walls, belts, and any other building
  properties that require a color or texture/style.
- For roof material selection, limit choices to solid colors only (no textures
  or styles).
- Ensure existing defaults and visuals remain unchanged until the user changes
  a selection.
- Keep the solution consistent with existing GUI/popup patterns in the project.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added a reusable popup material picker and refactored building fabrication properties to use consistent texture/color pickers for walls, belts, and roof.
