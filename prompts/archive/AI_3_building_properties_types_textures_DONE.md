#Problem [DONE]

Building properties do not yet provide a way to choose a construction type or
select a wall texture from available public assets.

# Request

Enhance the building properties UI so users can choose a type and apply a wall
texture from the public textures folder.

Tasks:
- Add a "Type" selector with options Business, Industrial, Apartments, House.
- Only enable the Business type for now; keep other types disabled or
  unavailable with a clear "coming later" indication.
- Add a "Wall Texture" selector that reads options from
  /assets/public/textures/buildings.
- The texture selector must present the image previews for the user to select.
- When a texture is selected, apply it to the building walls.
- Ensure the default behavior is preserved when no texture is selected.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added a building Type selector (Business only for now) and a wall texture picker with previews sourced from `assets/public/textures/buildings`, applying selected textures to building walls.
