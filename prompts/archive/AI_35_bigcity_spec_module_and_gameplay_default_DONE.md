# Problem [DONE]

`src/app/city/specs/city_spec_bigcity.json` is a JSON city layout spec, but the
codebase primarily consumes city specs as JS modules (ESM). Gameplay currently
uses the demo city spec instead of this big city spec.

# Request

Convert `city_spec_bigcity.json` into a JS city spec module and make gameplay
use the big city spec by default instead of the demo spec.

Tasks:
- Create a new city spec module under `src/app/city/specs/` that exports the
  Big City spec as an ES module (matching what `CityMap.fromSpec()` expects).
- Ensure the JS spec preserves all data from
  `src/app/city/specs/city_spec_bigcity.json` (roads, buildings, dimensions,
  seed, and any metadata).
- Decide whether to keep the JSON file as a source artifact or deprecate it:
  - If kept, document which file is the source of truth.
  - If deprecated, update references accordingly.
- Update gameplay city creation so it uses the Big City spec by default instead
  of the demo spec (without breaking other states/tools that still rely on the
  demo spec).
- Ensure the new spec is importable in the browser (relative ESM imports only).
- Add/update browser-run tests validating:
  - The Big City spec module can be imported.
  - The spec shape is compatible with `CityMap.fromSpec()`.
  - Gameplay uses the Big City spec by default (at least at the configuration
    level).

Constraints:
- Keep city/logic code in `src/app/` and rendering/UI code in `src/graphics/`.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Converted `city_spec_bigcity.json` into an importable ES-module spec, switched GameplayState to use it by default, and added browser tests for importing/using the spec and the gameplay default selection.
