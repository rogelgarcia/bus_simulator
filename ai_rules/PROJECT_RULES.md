# Project Rules

## Local Rules

- MUST READ root-level `PROJECT_RULES.local.md`

## Coding / Architecture (Canonical)

- Follow `ai_rules/PROJECT_CODING_RULES.md` for:
  - Directory structure and layering (`src/app/` vs `src/graphics/`)
  - Code style, comments policy, GUI/CSS rules, naming conventions
  - Architecture rules (validation boundaries, no junk-drawer utils, no silent fallbacks, etc.)
- All shader programs must be stored in dedicated shader source files (`.glsl`, `.vert.glsl`, `.frag.glsl`) under `src/graphics/shaders/` and loaded via shader loader modules.
- Shader source layout and naming conventions are defined in `specs/shaders/shader_layout.md`.
- Inline shader source strings are forbidden in application/source files (`.js`/`.mjs`), except for:
  - Tests/mocks when intentionally validating loader behavior
  - Non-shader helper strings such as preprocessor directives built from loader configuration

## Specifications

Project specifications are stored in `specs/` (use subfolders when appropriate).

Domain specs should live in dedicated subfolders (examples):
- Buildings: `specs/buildings/`
- Windows: `specs/windows/`

Any AI prompt or change that modifies a specification/model MUST update one or more relevant specs under `specs/` (in the appropriate subfolder, or at top-level if the spec is global).

## Testing

- During AI/dev iteration, prefer the standardized runner: `node tools/run_selected_test/run.mjs` (reads `tests/.selected_test`) instead of ad-hoc long inline test commands.
- Browser-run console tests live in `tests/core.test.js` (can be run by opening `index.html` locally and checking the console, or by selecting `core` in `tests/.selected_test`).
- For hard-to-reproduce rendering regressions, follow `ai_rules/TESTING_RULES.md` → “Regression Debugging Playbook (headless + bisect)” (create a deterministic headless repro, then bisect with repeated test runs and a research log).
- Add new tests near related sections and keep naming descriptive (e.g., `System: behavior should ...`).
- If adding new modules, ensure they are importable from the browser (relative import paths).
- Expanded testing policy and conventions: `ai_rules/TESTING_RULES.md`
- Any screenshot or visual evidence generated for an AI prompt/task MUST be written under a prompt-specific `tests/artifacts/screens/<topic>/` subdirectory and remain gitignored/untracked. If a prompt names `screens/` or another tracked evidence directory, update the prompt/output path before capture. Tracked summaries may reference workspace-relative artifact paths, but generated files and machine-readable manifests must not be staged or committed. The only exception is an explicitly requested visual-regression baseline under `tests/headless/visual/baselines/`, updated through the explicit baseline workflow in `ai_rules/TESTING_RULES.md`.

## AI Guidance

**Commits:**
- Don't commit. Don't play with git. Unless explicitly requested, never create or modify git commits.

**AI Prompt files:**
- AI prompt files are tracked in git.
- Active and completed prompts live in `prompts/`.
- Archived prompts live in `prompts/archive/`.
- Do not move prompts to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move only when explicitly requested by the user.
- Interactive prompt mode is triggered by `start ai` and uses `AI_i_...` naming (see `ai_rules/AI_PROMPT_INSTRUCTIONS.md`).

**Mesh Fabrication JSON prompts:**
- For mesh-generation/editing requests for the mesh fabrication editor, follow:
  - `specs/graphics/mesh_fabrication_live_mesh_handoff.md`
  - `specs/graphics/mesh_fabrication_ai_workflow.md`
- Treat `create mesh` and `edit mesh` as triggers to generate/update mesh JSON for the mesh fabrication editor.
- If intent is ambiguous, ask whether the prompt is to generate mesh JSON for the mesh fabrication editor before proceeding.

**Tasks:**
These are the ones from AI prompt files.
- Building Fabrication 1 is deprecated. Any prompt related to building fabrication must target Building Fabrication 2 by default, unless the user explicitly requests otherwise.

### New building modeling / fabrication

When a user request or AI prompt creates/models a new building or adds a new building catalog entry, its prompt, implementation plan, and completion criteria MUST include the following:

- Target Building Fabrication 2. Before implementation, inspect the relevant canonical framework documents, starting with:
  - `specs/buildings/BUILDING_2_SPEC_engine.md`
  - `specs/buildings/BUILDING_2_SPEC_model.md`
  - `specs/buildings/BUILDING_2_SPEC_ui.md`
  - the applicable facade/layout/topology specs under `specs/buildings/`
- Use `tests/headless/harness/scenarios/scenario_building_showcase.js` as the standard rendered-building scenario and `tests/headless/visual/specs/harness_building_showcase_capture.pwtest.js` as the standard capture workflow, extending them when the building requires additional deterministic setup.
- Produce at least three distinct final screenshots, each at UHD 4K (exactly 3840×2160):
  1. a straight-on front/elevation view;
  2. a three-quarter angle view;
  3. a low-angle close-up looking upward from the base toward the top.
- When finishing the model, accompany the final screenshots with every source reference image actually used to create the model. Clearly label the references and rendered poses in the completion handoff so they can be compared directly. Preserve the originals and place artifact copies under `tests/artifacts/screens/buildings/<building-id>/references/`; if a reference cannot legally or technically be copied, include a stable link to its existing local source or original URL instead.
- Render every required pose in a showcase scenario that uses an HDRI image as both the visible background and the environment/reflection source. Wait for all textures and the HDRI environment to finish loading, and verify that reflective materials visibly receive environment reflections before capture.
- Save these generated deliverables under `tests/artifacts/screens/buildings/<building-id>/`. This path is gitignored. Never save them under `screens/`, `tests/assets/`, beside source files, or as committed visual baselines unless the user explicitly requests a baseline update.
- New textures may be generated when needed. Integrate retained textures according to the project asset, licensing, and provenance rules; temporary generation outputs remain artifacts.
- Blender may be used when needed. Before launching or automating Blender, check for an existing Blender process, render job, or unsaved interactive session. Never interrupt, close, or repurpose an occupied session; if its status cannot be established safely, do not use it without user confirmation.

- Even if explicitly requested, never start prompts whose filename indicates DONE (`AI_DONE_##_..._DONE.md`, `AI_DONE_<branch>_##_..._DONE.md`, `AI_i_DONE_##_..._DONE.md`, or `AI_i_DONE_<branch>_##_..._DONE.md`) without double confirming with the user.
- If multiple prompts share the same numeric id, prefer the prompt in the current branch namespace for implementation within the same mode (standard or interactive).
- If id selection is still ambiguous or conflicting, stop and ask the user for guidance before implementing.
- In interactive mode (`start ai`):
  - If subject is missing, ask for `SUBJECT` before creating the file.
  - If an interactive AI is already open, ask whether to continue it, `make final` and start a new one, or start a new one without closing the current one.
  - As soon as trigger + subject are known, start/create the interactive `AI_i_...` file (do not wait for a full requirement list).
  - Keep the session in conversation mode until the user says `implement`.
  - Track requirements with markdown checkboxes (`- [ ]` pending, `- [x]` implemented) and keep them updated after each implementation cycle.
  - Treat `make final` in interactive mode as follows:
    - if all checklist items are complete, rename to `AI_i_DONE_..._DONE.md`
    - if items remain open, rename to regular AI naming (`AI_...`) so it continues as a standard AI prompt with checklists preserved
  - Never edit completed checklist items (`- [x]`).
  - If completed behavior needs a fix, add a new requirement item for the fix.
  - Contradictions between completed and new requirements are allowed; keep the completed item unchanged.
  - If contradiction is with a non-completed item (`- [ ]`), patch the existing non-completed requirement.

- Prompt numbering:
  - Use the highest existing prompt id across all active, completed, and archived files (standard and interactive) plus 1.

**AI Prompt naming:**
- Follow `ai_rules/AI_PROMPT_INSTRUCTIONS.md` (naming, template, and completion steps).

**3P libraries, assets, models**
If using resources from downloads/ folder, always copy to the application.
- if 3d meshes, put in assets
- if libraries, copy the source to src/lib 
- always organize subfolders accordingly

## Tools

- New tools under `tools/` must live in their own subfolder and include a `README.md`.
- Register all tools in `PROJECT_TOOLS.md`.
