#Problem [DONE]

Building wall textures are stored directly under textures/buildings, which does
not scale as more texture categories (windows, roofs, belts, etc.) are added.

# Request

Reorganize building textures by moving wall textures into a dedicated subfolder
and update all references.

Tasks:
- Move all existing assets under textures/buildings into a new subfolder:
  textures/buildings/walls.
- Update every source/reference (loading paths, catalogs, UI pickers, configs)
  to the new wall texture paths.
- Ensure nothing else in textures/buildings breaks; preserve behavior and
  visuals after the move.
- Add/update any documentation that mentions the old path.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Moved wall textures into `assets/public/textures/buildings/walls/` and updated the building wall texture base URL to match.
