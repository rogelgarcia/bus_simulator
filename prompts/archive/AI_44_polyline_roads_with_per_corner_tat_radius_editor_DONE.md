# Problem [DONE]

Roads are currently authored as simple segments, which makes it hard to express
realistic road intent (multi-point routes) and leads to sharp corners or
special casing for non-90° turns. The road editor also lacks a way to control
corner curvature.

# Request

Support roads as polylines (multiple control points) and generate a drivable
centerline by applying Tangent–Arc–Tangent (TAT) fillets at corners. Each
polyline corner must support its own radius configuration, and the editor must
allow editing per-corner radius interactively.

Tasks:
- Update the road spec representation so a road can be defined by a polyline of
  control points in world coordinates.
- Add per-point radius configuration:
  - Each interior point can optionally define a corner radius override.
  - Provide a default radius for the road when no per-point override exists.
- Generate the drivable centerline from the polyline using TAT fillets:
  - Replace each corner with tangent-in / circular arc / tangent-out geometry.
  - Handle cases where a chosen radius does not fit between segments:
    - Either reduce the radius for that corner, or fall back to a sharp corner
      / bevel, but keep the result robust.
  - Sample arcs by chord length (or equivalent) so geometry density remains
    consistent across different radii.
- Update the city debugger road editor to support polyline authoring:
  - Allow placing multiple points to form a polyline road.
  - Allow selecting a point and editing its radius in the UI.
  - Provide visual feedback when editing a point (show tangents and arc preview
    for that corner).
  - Prefer a small contextual popup near the selected point for radius editing.
- Ensure the new polyline + TAT workflow integrates with existing road
  rendering, intersections, and gameplay driving behavior.
- Add/update browser-run tests validating:
  - Polyline road specs are importable and deterministic for a fixed seed.
  - Centerline generation is G1-continuous at filleted corners.
  - Radius "does not fit" cases are handled without invalid geometry.
  - Per-point radius overrides take precedence over default radius.

Constraints:
- Keep road topology separate from generated geometry (centerline-driven).
- Do not delete existing Dubins code; it may remain as a helper where needed.
- Keep app logic in `src/app/` and rendering/UI in `src/graphics/`.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added polyline road specs with per-corner radius overrides, a TAT centerline generator, map debugger polyline authoring + radius editing popup/preview, and browser tests for determinism and continuity.
