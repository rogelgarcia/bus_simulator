# Problem [DONE]

The current road system couples (A) grid/tile planning with (B) the actual road
geometry generation. This makes non-90° roads feel like special cases and
causes intersection/join complexity to grow quickly. Several parts of the app
also derive road behavior from tile-based assumptions instead of a continuous
road network.

# Request

Refactor the road building process to separate road topology from road geometry
so arbitrary-angle roads become normal edges in a network.

The new pipeline should follow these outcomes:
- Road tiles are only a snapping/planning strategy (not the geometry source).
- Roads are represented as a continuous graph (nodes + edges) using centerlines
  in world coordinates.
- Streets can have direction; represent two-way streets as two directed edges
  (one per direction) or an equivalent approach that best supports the new
  geometry + intersection pipeline (verify and document the choice).
- Road geometry is generated from centerlines (tiles are not used here).
- Joins and intersections work for arbitrary angles using robust strategies.
- Keep existing Dubins code, but use a tangent-arc-tangent approach as the new
  default for road corner smoothing (Dubins remains a helper where needed).
- Use road centerlines as the source for calculations (width, lanes, joins,
  intersections, placement, debugging).
- Lanes have a constant width; adding lanes increases the total road width.
- Update all scenes/tools to use the new road engine (city/map debugger, build
  fabrication, gameplay).

Tasks (use the codebase to refine these as needed):
- Audit the current road pipeline entry points and consumers, including:
  `src/app/city/CityMap.js`, `src/app/city/City.js`,
  `src/graphics/assets3d/generators/RoadGenerator.js`, road submodules under
  `src/graphics/assets3d/generators/road/`, and road-editing states such as
  `src/states/MapDebuggerState.js` and building fabrication road editing.
- Introduce a road graph representation (nodes + edges) with stable ids and
  metadata (lanes, tag/class, speed/width inputs), and ensure it can be built
  deterministically from a city spec + seed.
- Decide on the direction model for streets:
  - Streets can be one-way or two-way.
  - Verify whether two-way streets should be encoded as two directed edges (one
    per direction) or as a single edge with bidirectional lane metadata.
  - Choose the approach that best facilitates implementation of centerline
    offsets, joins, intersections, and lane-accurate placement, and document it
    in code/spec conventions.
- Define how city specs provide road topology in the new system:
  - Keep backwards compatibility by converting existing segment specs into the
    graph.
  - Support snapping to grid as an authoring/editing convenience without
    leaking tile constraints into geometry.
- Implement centerline-based road geometry generation (world-space) including
  consistent lane width scaling, join handling for polyline corners, and
  support for arbitrary road angles.
- Implement intersection generation as its own node-based surface mesh that
  cleanly connects incoming road boundaries (robust for diagonal crossings and
  multi-lane widths).
- Preserve Dubins utilities and keep them available, but migrate default road
  smoothing to tangent-arc-tangent segments derived from centerlines.
- Replace tile-derived road calculations with centerline/graph-derived
  calculations wherever roads are used for logic or rendering.
- Update/patch all major integrations to use the new engine:
  - City/map debugger road editing and visualization.
  - Building fabrication road preview/editing.
  - Gameplay city generation (rendering + any road-related gameplay logic).
- Add/update browser-run tests that validate:
  - Graph construction from specs (including diagonal roads) is stable and
    deterministic for a fixed seed.
  - Geometry generation works for arbitrary angles without special casing.
  - Intersections/joins produce valid geometry and remain stable across runs.
  - Existing demo/spec content still loads (compat layer works).

Constraints:
- Keep app logic in `src/app/` and rendering/mesh generation in `src/graphics/`.
- Do not delete the existing Dubins implementation.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Introduced a centerline-based RoadNetwork graph (with automatic crossing splits) and a new road mesher that builds roads/intersections from centerlines (TAT corner fillets), updating traffic control placement to use the graph and adding browser tests for determinism and geometry validity.
