#Problem [DONE]

The texture inspector scene is missing key visualization options needed to
evaluate textures in different contexts (single texture vs tiled), and to
check alignment using a reference grid.

# Request

Extend the texture inspector scene with additional visualization controls for
previewing textures.

Tasks:
- Add a preview mode toggle: `Single` (one texture) vs `Tiled` (repeating).
- Add a toggle to show/hide the 3D plane grid in the preview.
- In `Tiled` mode, add a control to adjust spacing (gap) between repeated
  texture tiles.
- Ensure the preview updates immediately when the controls change.
- Keep the UI consistent with existing inspector UX and control styling.
- Preserve existing texture selection/catalog behavior.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added preview controls (Single/Tiled, grid toggle, tile gap) to Texture Inspector and updated the scene to reflect changes instantly.
