#Problem [DONE]

Trees can spawn in areas that overlap with buildings, causing visual and
gameplay collisions.

# Request

Prevent trees from spawning on tiles occupied by buildings.

Tasks:
- Ensure tree generation excludes any tiles/cells that are part of building
  footprints.
- Apply this consistently across all relevant modes/scenes that generate
  trees.
- Keep current tree density/placement behavior unchanged in non-building
  areas.
- Add a simple validation (test or debug check) that confirms no trees are
  placed on building tiles.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Tree placement now skips tiles occupied by configured buildings, with
an added test to validate no tree spawns on building footprints.
