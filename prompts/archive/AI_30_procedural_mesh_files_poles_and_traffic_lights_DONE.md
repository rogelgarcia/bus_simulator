#Problem [DONE]

Procedural meshes are currently defined inline in
`src/graphics/assets3d/procedural_meshes/ProceduralMeshCatalog.js`, which makes
the catalog hard to grow and reuse. We also need additional procedural meshes
for street/traffic props (poles and traffic lights) that can be inspected with
stable region selection.

# Request

Refactor procedural meshes so each mesh lives in its own module and add new
procedural mesh assets for street poles and traffic lights, fully integrated
with the existing Mesh Inspector.

Tasks:
- Create a subdirectory `src/graphics/assets3d/procedural_meshes/meshes/` and
  move each procedural mesh implementation into its own file.
- Extract the existing ball mesh into its own module file and keep the mesh id
  stable (`mesh.ball.v1`) and the existing region ids stable.
- Update `ProceduralMeshCatalog.js` to act as a catalog/dispatcher that imports
  mesh assets from the new `meshes/` modules and exposes the same public API.
- Add a new procedural mesh asset for a street sign pole:
  - A single vertical hexagonal pole (6-sided prism).
  - Material is near-black and looks realistic under light (subtle specular /
    clearcoat / physically-based shading).
  - Provide stable region ids for selection (at least the main pole body).
- Add a new procedural mesh asset for a traffic light pole:
  - Includes the vertical segment, an inclined segment, and a horizontal arm.
  - Provide stable region ids per segment for selection.
- Add a separate procedural mesh asset for a traffic light head:
  - Includes a base housing and three lights (red/yellow/green).
  - Provide stable region ids for housing and each light.
  - Ensure the lights read visually as lights (e.g., emissive or distinct
    material behavior) while still working with wireframe/solid modes.
- Ensure the Mesh Inspector can pick regions on these new assets:
  - Keep assets compatible with the current inspector assumptions (a single
    `THREE.Mesh` with geometry groups mapping to `regions` indices).
- Add/update browser-run tests to validate:
  - New mesh modules are importable.
  - The catalog exposes the new mesh ids in its options list.
  - Region identifiers are stable and non-empty for the new meshes.

Constraints:
- Keep all work under `src/graphics/` (procedural meshes are rendering assets).
- Follow the repo comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Split procedural meshes into per-mesh modules and added street sign pole + traffic light pole/head procedural assets with stable regions, catalog integration, and browser-run tests.
