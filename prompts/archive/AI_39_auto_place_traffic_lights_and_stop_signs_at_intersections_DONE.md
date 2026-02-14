# Problem [DONE]

The city view and gameplay currently do not place traffic control props (traffic
lights / stop signs) at intersections, which makes the city feel less alive and
reduces driving realism.

# Request

Automatically place traffic lights and stop signs at intersections in both the
city view and gameplay:
- For intersections that are 2x2 lanes or more, add traffic lights.
- For other intersections, add stop signs.

Tasks:
- Identify intersections from the generated/loaded `CityMap` (use existing road
  intersection data/metadata where available).
- Define a lane threshold rule for "2x2 lanes or more" using the map lane data
  (e.g., per-tile lane counts on crossing roads) and apply it consistently.
- Add a traffic control placement pass during city generation/rendering that:
  - Places a traffic light at qualifying intersections.
  - Places stop signs at non-qualifying intersections.
  - Avoids placing props on invalid tiles (buildings/road geometry conflicts)
    and avoids duplicates.
- Use the traffic light arm control to adjust the light head position so it is
  centered over the street, and place an additional traffic light on the
  opposite side of the intersection.
- Ensure props are oriented correctly relative to the road direction and
  intersection layout.
- Use the existing procedural meshes:
  - `mesh.traffic_light.v1` for traffic lights.
  - `mesh.stop_sign.v1` for stop signs.
- Integrate rendering in both:
  - The city view (static city rendering).
  - Gameplay (drivable city scene), sharing placement logic where possible.
- Add/update browser-run tests validating:
  - The intersection classifier correctly chooses traffic lights vs stop signs
    for representative lane configurations.
  - Placement produces stable, deterministic results for a fixed city seed/spec
    (same intersections -> same prop count/positions).
  - No props are placed outside map bounds.

Constraints:
- Keep placement logic in `src/app/city/` and rendering/mesh creation in
  `src/graphics/`.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added deterministic intersection-based traffic light/stop sign placement and rendering (including post-intersection traffic light placement), with browser tests for classification, determinism, and bounds.
