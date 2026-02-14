# Problem [DONE]

Building fabrication has no way to export a fabricated building configuration
for reuse in city creation.

# Request

Add an `EXPORT` action to building fabrication so the current building
configuration can be exported as a reusable building config file for city
creation.

Tasks:
- Add an `EXPORT` button to the building fabrication screen UI.
- Export the current building configuration (including the full layer-based
  definition) as a downloadable ES module file.
- Ensure the exported module contains stable `id` and `name` fields suitable
  for use as a `configId` in city map specs.
- Ensure the exported config can be integrated by placing it under
  `src/app/city/buildings/` and registering it in
  `src/app/city/buildings/index.js`.
- If possible, include reasonable legacy fields (`floors`, `floorHeight`,
  `style`, `windows`) so the city can still render something even when a
  layer-aware path is not used.
- Update city building loading/rendering so exported layer-based configs can be
  used by city creation without breaking existing (non-layer) buildings.
- Add a small browser-run test that validates the exported/loaded config shape
  needed for city usage (ids, layers presence, and backwards compatibility).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added an `EXPORT` action to download layer-based building configs as ES modules and updated city loading/rendering to support `layers` configs with legacy fallbacks.
