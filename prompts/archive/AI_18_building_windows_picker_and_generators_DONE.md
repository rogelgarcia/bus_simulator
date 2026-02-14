#Problem [DONE]

Building fabrication needs a richer window system than a single square texture.
As more window variants and parametric styles are added, users need a consistent
way to choose window types and preview them, and the system needs a clean way
to generate window textures procedurally (or fall back to static textures).

# Request

Add a windows picker (popup) to building fabrication and refactor windows into
"type + params + generator" so window textures can be generated from
parameters with sensible defaults.

Tasks:
- Add a reusable "Windows picker" control in building fabrication properties.
- The windows picker opens a popup listing available window types with visual
  previews.
- Once a window type is selected, the picker shows the chosen window type in
  the properties panel (name + preview).
- Refactor window selection so windows are represented as:
  - A window type id and name.
  - A parameter object (with defaults).
  - A generation function responsible for producing the final window material/
    texture (procedural generation or loading a static asset).
- Add a window texture generation API that accepts window parameters and
  returns a texture/material, with caching so identical params do not
  regenerate every frame.
- Implement a new window type with an arched top:
  - The top is a half circle.
  - Increasing window height must not stretch the half circle vertically;
    instead extend the rectangular portion below the arch.
  - Increasing window width scales the half circle so it keeps its circular
    shape relative to width.
  - The arched window type must compute its texture from parameters.
- Add additional window types:
  - At least one type that is fully parametric (no external texture), with
    configurable color, frame width, and a gradient.
- Ensure the building preview updates when window type or parameters change.
- Keep sensible defaults so existing buildings look reasonable without extra
  configuration.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Implemented a window type+params system with procedural texture generation (arched + parametric types) and integrated popup pickers + param controls into building fabrication.
