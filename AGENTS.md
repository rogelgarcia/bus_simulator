# Agent Notes

- Follow `ai_rules/PROJECT_RULES.md` (and root-level `PROJECT_RULES.local.md` when pushing code to github) for repo structure, coding style, comments, commits, and asset rules.
- Generated screenshots and debug captures go under `tests/artifacts/screens/<topic>/` (gitignored). Never save them into `screens/` or next to source code (see `ai_rules/TESTING_RULES.md`, "Artifacts and baselines").
- New-building modeling/fabrication requests MUST follow `ai_rules/PROJECT_RULES.md` → "New building modeling / fabrication". Target Building Fabrication 2, inspect its canonical specs under `specs/buildings/`, and use the building showcase harness/capture workflow identified there.
  - Completion requires at least three distinct UHD 4K (3840×2160) final screenshots: a straight-on front view, a three-quarter angle view, and a low-angle close-up looking from the building base toward the top.
  - When finishing the model, accompany the final screenshots with the source reference image(s) actually used to create the model, clearly labeled so the reference and rendered result can be compared. Include them in the completion handoff and place artifact copies under `tests/artifacts/screens/buildings/<building-id>/references/` without altering the originals.
  - Render the captures in a scenario that uses an HDRI as both the visible background and the environment/reflection source. Save them under `tests/artifacts/screens/buildings/<building-id>/` so they remain gitignored.
  - New textures may be generated when needed and must follow the project asset rules. Blender may be used when needed, following the global Blender guidance in `ai_rules/PROJECT_RULES.md` → "Tools". Prefer headed Blender controlled through MCP so the user can watch progress; use isolated headless Blender only as the fallback when the headed session is occupied.
  - If Blender is occupied and the required work cannot run safely in a separate headless process, skip only the Blender-dependent portion. In the final handoff, explicitly state that Blender was busy, exactly what Blender would have been used for, what remains skipped/incomplete, and ask the user to free Blender so that work can be finished.
- When creating AI prompt files, follow `ai_rules/AI_PROMPT_INSTRUCTIONS.md` for naming and structure.
  - Active prompt files live in `prompts/`; archived prompt files live in `prompts/archive/`.
  - User requested `create promtpt` or `create ai` or `create ai prompt`. Or similar variations.
  - User requested `start ai`: use interactive mode with `AI_i_` prompt naming and conversational requirement gathering.
  - Interactive mode rules:
    - If subject is not specified, ask for subject first.
    - If an interactive AI is already open, ask whether to continue it, `make final` and start new, or start new without closing current.
    - As soon as trigger + subject are known, create/start the `AI_i_...` file; do not wait for full requirements.
    - Enter conversation mode after creating or opening an interactive AI.
    - Do not implement anything until explicitly asked with `implement`.
    - After each `implement` pass, return to conversation mode.
    - Track requirements as markdown checkboxes (`- [ ]` pending, `- [x]` implemented) and update after each implementation cycle.
    - Never edit completed checklist items (`- [x]`).
    - If a completed requirement needs a fix, add another requirement item for that fix.
    - If a new requirement contradicts a non-completed requirement (`- [ ]`), patch the non-completed requirement.
- Interactive finalize options:
  - Trigger is exactly `make final` on request.
  - If all checklist items are complete, rename to `AI_i_DONE_..._DONE.md`.
  - If any checklist item is still open, rename to standard naming (`AI_...` or `AI_<branch>_...`) and keep the checklist intact so it can continue as a regular AI prompt.

- Prompt numbering:
  - New prompts (standard or interactive) must use the highest existing prompt id across active, completed, and archived files plus 1.

## Debug suggestion
- If a problem doesn't resolve after multiple prompts, it might be another issue
  - Add a test to validate some assumptions 
    - Did the resources loaded?
    - Quick unit test the APIs
    - Other kinds of tests you find suitable to verify
