# Repository Guidelines

## Project Structure & Module Organization
- `src/app/` holds application logic (city, core, geometry, input, physics, skeletons, utils, vehicle)
- `src/graphics/` is strictly rendering/UI code
  - `src/graphics/assets3d/` for Three.js models, generators, textures, and factories
  - `src/graphics/gui/` for HUD, widgets, and CSS
  - `src/graphics/visuals/` for visual effects and rendering utilities
- `src/states/` contains high-level gameplay state modules
- `tests/` contains browser-run test modules
- `assets/` stores non-code artifacts (images, textures, 3D models, etc.)
- `downloads/` stores third-party resources before integration
- `tools/` contains utility scripts

Keep visual/rendering concerns in `src/graphics/` and game/physics logic in `src/app/`.

## Build, Test, and Development Commands
This repo runs as a static web app (no bundler).
- `python3 -m http.server` (or `npx serve .`) to start a local server.
- Open `http://localhost:8000` to run the app.
- Tests run automatically in the browser via `tests/core.test.js`; check the console for pass/fail output.

Note: `index.html` uses CDN imports for `three`, so a network connection is required when running locally.

## Coding Style & Naming Conventions
- JavaScript modules use ES module syntax and file-level exports
- Indentation uses 4 spaces (see existing `src/` files)
- Follow comment policies defined in `PROJECT_RULES.md`

## Testing Guidelines
- Tests live in `tests/core.test.js` and run in the browser on page load.
- Add new tests near related sections and keep naming descriptive (e.g., `System: behavior should ...`).
- If adding new modules, ensure they are importable from the browser (relative import paths).

## Commit & Pull Request Guidelines
- Commit messages in history are short, imperative, and sentence case (e.g., “Add AI prompt for RoadGenerator refactoring”).
- Stage changes with `git add -A` before committing.
- Use a one-line commit message.
- When committing, choose a concise one-line message yourself; do not ask the user for it.
- Never commit AI prompt files named `AI_#_title`.
- Commit whatever is pending (but follow the above rules)

## Project Rules & AI Prompting
- Follow `PROJECT_RULES.md` for directory and comment policies
- When preparing AI prompt requests, see `AI_PROMPT_INSTRUCTIONS.md` for the required structure and attachment steps

## Debug suggestion
- If a problem doesn't resolve after multiple prompts, it might be another issue
  - Add a test to validate some assumptions 
    - Did the resources loaded?
    - Quick unit test the APIs
    - Other kinds of tests you find suitable to verify