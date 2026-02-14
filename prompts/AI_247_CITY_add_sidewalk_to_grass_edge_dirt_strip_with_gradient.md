#Problem

Where sidewalks meet grass, the transition currently looks too clean and visually “cuts” hard. We want a subtle darker dirt/wear strip along the sidewalk edge to blend the sidewalk into the grass/ground more naturally.

# Request

Add a cheap “edge dirt strip” along the outer edge of sidewalks where they meet grass/ground. The strip should be a thin mesh band with a smooth fade/gradient away from the sidewalk, and it should be tunable.

Tasks:
- Generate a thin strip mesh along sidewalk-to-ground boundaries:
  - Follow the sidewalk outer perimeter where it borders grass/ground.
  - Use a small configurable width (in meters).
  - Ensure edges connect cleanly around corners and across segments (no gaps).
- Apply a smooth fade/gradient across the strip:
  - Darkest at the sidewalk edge, fading out toward the grass side.
  - Implement the gradient cheaply (e.g., vertex colors interpolated across the strip width).
- Material/shading:
  - Use a simple material that supports the gradient (e.g., `MeshStandardMaterial` with `vertexColors`).
  - Allow tuning at minimum: color (darkness), opacity (if used), roughness/metalness, and optional normal strength if applicable.
  - Ensure it does not look glossy by default (dirt-like).
- Rendering correctness:
  - Avoid z-fighting with the sidewalk/ground using a small height lift and/or `polygonOffset`.
  - Ensure the strip renders correctly at grazing angles and does not shimmer excessively.
  - Ensure it doesn’t affect road surfaces or appear inside sidewalks (only at the grass edge).
- Performance:
  - Keep it cheap in draw calls (merge where possible; reuse materials).
  - Avoid excessive geometry density—just enough vertices to support corners and the gradient across width.
- Debug/tuning:
  - Add controls in the relevant Options/debug tool (e.g., Road/Grass/Terrain debugger) to enable/disable and tune width/intensity.
  - Provide a debug visualization toggle to show the strip mesh bounds/coverage (optional).

Nice to have:
- Option to add subtle noise breakup to the strip (very low-frequency) without making it shimmer.
- Per-biome/per-terrain material variations later (out of scope now).

## Quick verification
- In a scene with sidewalks adjacent to grass:
  - A thin darker strip appears along the sidewalk edge and fades into the grass.
  - No z-fighting at typical camera distances and low angles.
  - Performance impact is negligible.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_247_CITY_add_sidewalk_to_grass_edge_dirt_strip_with_gradient_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
