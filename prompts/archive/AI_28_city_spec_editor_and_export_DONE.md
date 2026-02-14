# Problem [DONE]

The demo city layout is hardcoded inside `CityMap.demoSpec()` and there is no
in-app way to edit roads/buildings or export a city layout for reuse as a new
spec.

# Request

Make the city layout spec a first-class, reusable asset and add an editor in
the city/map building scene so roads/buildings can be edited and exported as a
new spec.

Tasks:
- Extract the `demoSpec` city spec data out of `CityMap.js` into its own module
  under `src/app/city/specs/`.
- Update `CityMap` to use the extracted spec module while keeping
  `CityMap.demoSpec()` as a placeholder/backwards-compatible entry point.
- In the city/map building scene (the map/city building debug view), add editor
  actions to reset the city to clear state.
- Add editor support to add roads interactively, including choosing a road
  "type" (tag) and lane configuration before placing the road.
- Add editor support to place buildings by editing building tiles on the map,
  including adding new buildings, removing buildings. Allow choosing the building style from the catalog.
- Add controls to set horizontal and vertical tile counts independently (map
  width/height) and rebuild the city using those values.
- Add a "randomize seed" option; ensure the seed is stored in the exported
  city spec and used when reloading/rebuilding the city.
- Add a city spec export function that produces a reusable configuration
  matching what `CityMap.fromSpec()` accepts, and expose it in the editor UI
  (e.g. copy to clipboard and/or download).
- Add/update browser-run tests validating that the extracted demo spec is
  importable, `CityMap.demoSpec()` still works, and exported specs have the
  expected shape.

Constraints:
- Keep city/physics logic in `src/app/` and UI/rendering code in
  `src/graphics/`.
- Follow the repo comment policy in `PROJECT_RULES.md`.
- Keep the app working as a static web app (no bundler assumptions).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Extracted the demo city spec into `src/app/city/specs/`, added a map debugger city editor for seed/size + interactive road/building placement, and implemented spec export + browser tests.
