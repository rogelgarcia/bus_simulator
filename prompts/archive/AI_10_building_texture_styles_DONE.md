#Problem [DONE]

Building textures are currently treated as a single file path, which makes it
hard to evolve buildings into coherent visual themes and to add new facade
variants.

# Request

Treat building appearance as a "style" instead of a single texture file, and
refactor existing building texture usage to use a style enum.

Tasks:
- Introduce a building style concept represented as an enum (stable ids).
- For now, include at least one style that maps to the current texture-based
  behavior.
- Refactor all places that currently select, store, or apply a building texture
  file to instead select/store/apply a building style.
- Keep existing visuals unchanged by default.
- Ensure the building properties UI and any configuration schemas use the new
  style enum.


## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Introduced `BUILDING_STYLE` ids and refactored building rendering and
UI/config to select a style enum instead of a raw texture path.
