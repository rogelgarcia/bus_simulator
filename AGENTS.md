# Agent Notes

- Follow `PROJECT_RULES.md` (and `PROJECT_RULES.local.md` when pushing code to github) for repo structure, coding style, comments, commits, and asset rules.
- When creating AI prompt files, follow `AI_PROMPT_INSTRUCTIONS.md` for naming and structure.
  - Active prompt files live in `prompts/`; archived prompt files live in `prompts/archive/`.
  - User requested `create promtpt` or `create ai` or `create ai prompt`. Or similar variations.
  - User requested `start ai`: use interactive mode with `AI_i_` prompt naming and conversational requirement gathering.
  - Interactive mode rules:
    - If subject is not specified, ask for subject first.
    - If an interactive AI is already open, ask whether to continue it, close and start new, or start new without closing current.
    - Track requirements as markdown checkboxes (`- [ ]` pending, `- [x]` implemented) and update after each implementation cycle.

## Debug suggestion
- If a problem doesn't resolve after multiple prompts, it might be another issue
  - Add a test to validate some assumptions 
    - Did the resources loaded?
    - Quick unit test the APIs
    - Other kinds of tests you find suitable to verify
