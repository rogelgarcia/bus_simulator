#Problem [DONE]

Building configuration is tightly coupled to the city map configuration. This
makes it hard to reuse building designs, iterate on individual buildings, and
keep the city map focused on layout rather than detailed building design.

# Request

Externalize building configuration so the city map only defines building tile
footprints, while full building designs live in separate per-building config
files.

Tasks:
- Refactor building configuration so `CityMap` (or city map config) only
  specifies the building tile footprint (the list of tiles).
- Move all building design parameters (floors, dimensions, materials/styles,
  belts, roof, windows, features, etc.) into external config files.
- Create a new folder `src/app/city/buildings/` to store building
  configurations.
- Use one file per building setup/design, with a stable id and name.
- Update city map building entries to reference/select one of these building
  config files (by id or import).
- Ensure the system supports multiple buildings each referencing different
  configs.
- Preserve current behavior/visuals for existing buildings after migration.
- Keep browser-friendly imports (relative paths) consistent with the repo’s
  no-bundler setup.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Externalized city building designs into `src/app/city/buildings/` and updated `CityMap` specs to reference them via `configId` while keeping only footprints in the map.
