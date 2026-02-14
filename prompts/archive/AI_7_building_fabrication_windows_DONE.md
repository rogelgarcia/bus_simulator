#Problem [DONE]

Buildings fabricated in the building fabrication scene do not include windows,
so results look unfinished and lack configurable facade detail.

# Request

Add procedural windows to building fabrication with sensible defaults and
configurable window layout and appearance.

Tasks:
- Add windows to building walls in the building fabrication flow with sensible
  default parameters so buildings immediately look reasonable.
- Add building/window properties to configure:
  - Window width.
  - Distance between windows.
  - Window height.
  - Window Y position, defined relative to the current floor’s baseline
    (i.e., referencing floor height/position).
- Create a blue/dark window texture to be used where windows appear.
- Include a window frame in that texture as well.
- Ensure window placement avoids corners:
  - If a window would end at a corner, remove that window.
  - Recompute/reposition remaining windows so they are evenly spaced and
    equidistant across the available wall span.
- Ensure window layout behaves consistently across floors.
- Keep rendering and configuration consistent with existing building materials
  and property UI patterns.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added procedural window meshes with a generated window texture and
new per-building window controls in the building fabrication properties panel.
