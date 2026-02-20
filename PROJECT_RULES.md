# Project Rules

## Local Rules

- MUST READ `PROJECT_RULES.local.md`

## Coding / Architecture (Canonical)

- Follow `PROJECT_CODING_RULES.md` for:
  - Directory structure and layering (`src/app/` vs `src/graphics/`)
  - Code style, comments policy, GUI/CSS rules, naming conventions
  - Architecture rules (validation boundaries, no junk-drawer utils, no silent fallbacks, etc.)

## Specifications

Project specifications are stored in `specs/` (use subfolders when appropriate).

Domain specs should live in dedicated subfolders (examples):
- Buildings: `specs/buildings/`
- Windows: `specs/windows/`

Any AI prompt or change that modifies a specification/model MUST update one or more relevant specs under `specs/` (in the appropriate subfolder, or at top-level if the spec is global).

## Testing

- During AI/dev iteration, prefer the standardized runner: `node tools/run_selected_test/run.mjs` (reads `tests/.selected_test`) instead of ad-hoc long inline test commands.
- Browser-run console tests live in `tests/core.test.js` (can be run by opening `index.html` locally and checking the console, or by selecting `core` in `tests/.selected_test`).
- For hard-to-reproduce rendering regressions, follow `TESTING_RULES.md` → “Regression Debugging Playbook (headless + bisect)” (create a deterministic headless repro, then bisect with repeated test runs and a research log).
- Add new tests near related sections and keep naming descriptive (e.g., `System: behavior should ...`).
- If adding new modules, ensure they are importable from the browser (relative import paths).
- Expanded testing policy and conventions: `TESTING_RULES.md`

## AI Guidance

**Commits:**
- Don't commit. Don't play with git. Unless explicitly requested, never create or modify git commits.

**AI Prompt files:**
- AI prompt files are tracked in git.
- Active and completed prompts live in `prompts/`.
- Archived prompts live in `prompts/archive/`.
- Do not move prompts to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move only when explicitly requested by the user.
- Interactive prompt mode is triggered by `start ai` and uses `AI_i_...` naming (see `AI_PROMPT_INSTRUCTIONS.md`).

**Tasks:**
These are the ones from AI prompt files.
- Even if explicitly requested, never start prompts whose filename indicates DONE (`AI_DONE_##_..._DONE.md`, `AI_DONE_<branch>_##_..._DONE.md`, `AI_i_DONE_##_..._DONE.md`, or `AI_i_DONE_<branch>_##_..._DONE.md`) without double confirming with the user.
- If multiple prompts share the same numeric id, select the prompt in the current branch namespace for implementation (within the same mode: standard or interactive).
- If id selection is still ambiguous or conflicting, stop and ask the user for guidance before implementing.
- In interactive mode (`start ai`):
  - If subject is missing, ask for `SUBJECT` before creating the file.
  - If an interactive AI is already open, ask whether to continue it, close and start a new one, or start a new one without closing the current one.
  - Track requirements with markdown checkboxes (`- [ ]` pending, `- [x]` implemented) and keep them updated after each implementation cycle.
  - Never edit completed checklist items (`- [x]`).
  - If completed behavior needs a fix, add a new requirement item for the fix.
  - Contradictions between completed and new requirements are allowed; keep the completed item unchanged.
  - If contradiction is with a non-completed item (`- [ ]`), patch the existing non-completed requirement.

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
