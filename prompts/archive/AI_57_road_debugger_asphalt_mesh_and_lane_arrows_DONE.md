# Problem [DONE]

Road Debugger currently focuses on line/point overlays, but we also need to
validate the asphalt surface visually and confirm lane direction with clear
markings.

# Request

Add asphalt mesh rendering and lane direction overlays to Road Debugger:
- Render asphalt per segment as a filled mesh (toggleable).
- Add lane markings and white direction arrows (toggleable).

Tasks:
- Add an asphalt render toggle:
  - Render each segment (or kept piece) as a filled asphalt mesh/polygon.
  - Ensure asphalt width matches lane widths + 10% margin rules.
  - Keep asphalt rendering separate from line overlays so both can be toggled.
- Add lane markings and direction arrows:
  - Add a toggle to render lane markings.
  - Render white arrows indicating travel direction in each lane group.
  - Ensure arrows update with lane counts and segment direction.
- Ensure viewport highlighting works on asphalt:
  - Selecting/hovering a road/segment highlights the asphalt region.
- Add/update browser-run tests validating:
  - Toggling asphalt affects scene object visibility (or render primitives).
  - Arrow/marking toggles affect expected overlay visibility.

Constraints:
- Keep Road Debugger disconnected from city/gameplay systems.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added asphalt mesh rendering plus lane markings/direction arrows with toggles, highlighting support, and tests for visibility toggles.
