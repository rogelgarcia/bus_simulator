# Agent Notes

- Follow `PROJECT_RULES.md` (and `PROJECT_RULES.local.md` when pushing code to github) for repo structure, coding style, comments, commits, and asset rules.
- When creating AI prompt files, follow `AI_PROMPT_INSTRUCTIONS.md` for naming and structure.
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
