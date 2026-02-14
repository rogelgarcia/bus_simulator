#Problem [DONE]

Buildings are currently not configurable as part of the city configuration, and
building fabrication/rendering logic appears to be tied to the building
fabrication scene instead of being reusable by gameplay.

# Request

Add configurable buildings to the city config and refactor building generation
so both the building fabrication scene and gameplay share the same building
builder/rendering component.

Tasks:
- Extend the city configuration to include a buildings list, similar in spirit
  to how roads are configured.
- Define a building entry schema that includes:
  - A list of tile coordinates that form the building footprint.
  - Floor height.
  - Number of floors.
  - Wall texture / material selection.
- Enforce footprint validity: all tiles in a building footprint must be
  adjacent as a single connected set.
- If the first non-adjacent tile is encountered, ignore that tile and all
  subsequent tiles in that building’s tile list.
- Refactor building fabrication logic so it is not isolated to the building
  fabrication scene; extract building generation/rendering into a reusable
  component/module.
- Update both the building fabrication scene and gameplay/city rendering to use
  the same extracted building component.
- Add one configured building in an empty area of the city using 3 meters per
  floor and 5 floors, and verify it renders correctly.
- Ensure existing behavior remains unchanged when no buildings are configured.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added configurable city buildings with footprint validation, and
shared building mesh generation between gameplay city rendering and the
building fabrication scene.
