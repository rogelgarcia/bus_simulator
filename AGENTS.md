# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds simulation logic (core, physics, input, city, vehicle, skeletons).
- `graphics/` is strictly rendering/UI code.
  - `graphics/assets3d/` for Three.js models, generators, textures, and factories.
  - `graphics/gui/` for HUD, widgets, and CSS.
- `states/` contains high-level gameplay state modules.
- `tests/` contains browser-run test modules.
- `assets/` stores non-code artifacts (images, notes, etc.).

Keep visual/rendering concerns in `graphics/` and game/physics logic in `src/`.

## Build, Test, and Development Commands
This repo runs as a static web app (no bundler).
- `python3 -m http.server` (or `npx serve .`) to start a local server.
- Open `http://localhost:8000` to run the app.
- Tests run automatically in the browser via `tests/core.test.js`; check the console for pass/fail output.

Note: `index.html` uses CDN imports for `three`, so a network connection is required when running locally.

## Coding Style & Naming Conventions
- JavaScript modules use ES module syntax and file-level exports.
- Indentation uses 4 spaces (see existing `src/` files).
- **Comment rule:** code files should have no comments except the first line, which must be a comment containing the file path (e.g., `// src/core/GameLoop.js`).
- Keep rendering/UI work under `graphics/` and avoid mixing it with core logic.

## Testing Guidelines
- Tests live in `tests/core.test.js` and run in the browser on page load.
- Add new tests near related sections and keep naming descriptive (e.g., `System: behavior should ...`).
- If adding new modules, ensure they are importable from the browser (relative import paths).

## Commit & Pull Request Guidelines
- Commit messages in history are short, imperative, and sentence case (e.g., “Add AI prompt for RoadGenerator refactoring”).
- PRs should include a clear description of behavior changes, testing notes (what was run), and screenshots for UI/visual changes.
- Link related issues or tasks when applicable.

## Project Rules & AI Prompting
- Follow `PROJECT_RULES.md` for directory and comment policies.
- When preparing AI prompt requests, see `AI_PROMPT_INSTRUCTIONS.md` for the required structure and attachment steps.
