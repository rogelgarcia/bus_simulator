# Project Rules

## Local Rules

- MUST READ `PROJECT_RULES.local.md`

## Coding / Architecture (Canonical)

- Follow `PROJECT_CODING_RULES.md` for:
  - Directory structure and layering (`src/app/` vs `src/graphics/`)
  - Code style, comments policy, GUI/CSS rules, naming conventions
  - Architecture rules (validation boundaries, no junk-drawer utils, no silent fallbacks, etc.)

## Testing

- Tests run in the browser via `tests/core.test.js`; check the console for pass/fail output.
- Add new tests near related sections and keep naming descriptive (e.g., `System: behavior should ...`).
- If adding new modules, ensure they are importable from the browser (relative import paths).
- Expanded testing policy and conventions: `TESTING_RULES.md`

## AI Guidance

**Commits:**
- Don't commit. Don't play with git. Unless explicitly requested, never create or modify git commits.
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
