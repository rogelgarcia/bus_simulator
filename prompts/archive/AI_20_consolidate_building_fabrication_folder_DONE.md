#Problem [DONE]

Building fabrication code is currently scattered across the project (e.g.,
`BeltCourseColor` living under `src/app/city/`), making the system harder to
maintain, reuse, and evolve.

# Request

Consolidate all building fabrication-related code into a single, clearly named
folder and update the project structure so building fabrication responsibilities
are easy to find and correctly layered.

Tasks:
- Perform a project-wide review to identify all code that belongs to building
  fabrication (building generation, facade features like belts, window layout,
  materials/styles, building-specific helpers, and related UI where applicable).
- Move building fabrication code into a dedicated building folder (choose a
  location that fits the repo conventions, e.g., under graphics generators for
  rendering/generation code).
- Ensure building-related modules are no longer located in unrelated domains
  (e.g., remove building fabrication utilities from `src/app/city/`).
- Update all imports/exports and relative paths so the app builds and runs with
  the new layout (no bundler; browser-friendly module paths).
- Keep the separation of concerns intact:
  - App/city logic stays in `src/app/`.
  - Rendering/generation code stays in `src/graphics/`.
- Preserve current building fabrication behavior and visuals after the move.
- Add or update lightweight documentation (README or relevant docs) describing
  the new folder location and how to add new building fabrication features.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Consolidated shared building enums into `src/app/buildings/`, moved building generators under `src/graphics/assets3d/generators/buildings/`, and documented the new structure in `README.md`.
