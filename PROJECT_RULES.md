# Project Rules

## Directory Structure

** Local Rules **
- MUST READ PROJECT_RULES.local.md

**Project Structure & Module Organization**
- Application logic → `src/app/` (city, core, geometry, input, physics, rigs, utils, vehicle)
- Rendering/UI code → `src/graphics/`
  - Engine 3D fabrication code → `src/graphics/engine3d/`
  - Content 3D catalogs/definitions → `src/graphics/content3d/`
  - Legacy / in-migration 3D code → `src/graphics/assets3d/`
  - GUI/HUD/CSS → `src/graphics/gui/`
  - Visual effects & rendering utilities → `src/graphics/visuals/`
- High-level gameplay states → `src/states/`
- Browser-run tests → `tests/`
- Assets:
  - `assets/public/` is shareable/public
  - other `assets/` subfolders may be licensed/private
- `downloads/` stores third-party resources before integration
- `tools/` contains utility scripts

**Physics:**
- This project uses the Rapier physics library
- Documentation can be found in `/docs/`

**Principle:** Keep rendering/visual code in `/src/graphics` and app logic in `/src/app`

## Code Style

**JavaScript:**
- Use ES module syntax and file-level exports.

**Logic:**
- Don't create fallback logics with IF statements as a hacky way to solve a problem. Adjust formulas so the problem is solved in a more definitive way.

**Comments:**
- No comments in code files (see exceptions bellow)
- Exception: First line must be a comment with the file description (e.g., `// Generates roads from city data`) (if first line is already the file path, use second line)
- Exception: Design decisions (do not explain the code, but why it is written a certain way)
  - Always write design decisions as a high level comment on top of the file (try to be concise)
- Exception: Library source code (preserve all original comments)
- Exception: Hackish solutions (explain what you did and why it's necessary)
- Exception: Extremely high level logic blocks inside functions (e.g. `// render curbs`, `// compute asphalt`)

**CSS Styling:**
- Avoid putting css styling in JS files. Use CSS files and import classes instead. One CSS per screen. And also a global (for reusable components)
- Make the components reuse the classes from the global CSS file and from the specific screen CSS file whenever possible.

**GUI / DOM Construction (Vanilla JS)**
- Prefer reusable “row factories” / “mini controllers” over repeating `document.createElement` boilerplate for common UI patterns.
- For repeated patterns (label + control rows, material pickers, toggle rows, range+number rows, details sections), create a small controller/factory under the relevant screen folder (e.g. `src/graphics/gui/<screen>/mini_controllers/`).
- Controllers should be:
  - Declarative to call (configure in one concise statement rather than many imperative assignments).
  - Consistent in DOM structure and CSS classes (match existing screen styles).
  - Leak-safe (provide `destroy()` to remove event listeners/popups when unmounted).
  - Testable where possible (pure helpers live outside controllers and can be covered by `tests/core.test.js`).
- Avoid introducing a DOM framework unless it’s a deliberate project-level decision (the project currently uses direct ES modules in the browser without a build step).

**Icons:**
- Use Material Symbols Outlined glyphs for all UI icons (via `.ui-icon` / `createMaterialSymbolIcon()`), not ad-hoc SVGs or mixed icon sets.

## Testing

- Tests run in the browser via `tests/core.test.js`; check the console for pass/fail output.
- Add new tests near related sections and keep naming descriptive (e.g., `System: behavior should ...`).
- If adding new modules, ensure they are importable from the browser (relative import paths).

## AI Guidance

**Commits:**
- Only commit when explicitly asked by the user
- Never commit automatically after making changes
- If committing, use a short, one-line, imperative commit message (sentence case).
- AI files are in gitignore, don't worry about them.

**Tasks:**
These are the ones from AI prompt files.
- Even if explicitly requested, never start prompts whose filename indicates DONE (`AI_DONE_##_..._DONE`) without double confirming with the user.

**AI Prompt naming:**
- Follow `AI_PROMPT_INSTRUCTIONS.md` (naming, template, and completion steps).

**3P libraries, assets, models**
If using resources from downloads/ folder, always copy to the application.
- if 3d meshes, put in assets
- if libraries, copy the source to src/lib 
- always organize subfolders accordingly

## Tools

- New tools under `tools/` must live in their own subfolder and include a `README.md`.
- Register all tools in `PROJECT_TOOLS.md`.
