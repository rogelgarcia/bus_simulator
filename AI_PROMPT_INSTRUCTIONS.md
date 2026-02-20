# AI Prompt Creation Instructions

This file contains guidelines for creating AI prompts for code modifications and development tasks.

## File Location (Required)

All AI prompts are tracked in git and stored under:

- Active and completed prompts: `prompts/`
- Archived prompts (only when explicitly requested): `prompts/archive/`

Do not place prompt task files at repo root.

## File Naming (Required)

There are two prompt types: standard prompts and interactive prompts.

### Standard prompts

On `main`:
- New prompt: `AI_##_SUBJECT_title.md`
- Completed prompt: `AI_DONE_##_SUBJECT_title_DONE.md`

On non-`main` branches:
- New prompt: `AI_<branch>_##_SUBJECT_title.md`
- Completed prompt: `AI_DONE_<branch>_##_SUBJECT_title_DONE.md`

### Interactive prompts (`start ai` mode)

On `main`:
- New prompt: `AI_i_##_SUBJECT_title.md`
- Completed prompt: `AI_i_DONE_##_SUBJECT_title_DONE.md`

On non-`main` branches:
- New prompt: `AI_i_<branch>_##_SUBJECT_title.md`
- Completed prompt: `AI_i_DONE_<branch>_##_SUBJECT_title_DONE.md`

### Naming rules

- `##` is the numeric prompt id (keep it stable within each mode namespace).
- Completed prompts include `DONE` near the front and at the end.
- `<branch>` is required on non-`main` branches and omitted on `main`.
- `<branch>` should be filename-safe:
  - lowercased
  - replace `/` and spaces with `_`
  - replace any remaining non `[a-z0-9._-]` with `_`
  - collapse repeated `_`
- `SUBJECT` is the problem space and must be uppercase, one of:
  - `ROADS`
  - `VEHICLES`
  - `TRAFFIC`
  - `BUILDINGS`
  - `WINDOWS`
  - `PEDESTRIANS`
  - `COLLISION`
  - `CITY`
  - `MESHES`
  - `MATERIAL`
  - `PHYSICS`
  - `AUDIO`
  - `TOOLS`
  - `REPORTS`
  - `REFACTOR`
  - `PROJECTMAINTENANCE`
  - `TESTS`
  - `DOCUMENTATION`
  - `ATMOSPHERE`
  - `UI`
- `title` is lowercase, words separated by `_`.
- Use the `.md` extension.
- If prompt selection is ambiguous or conflicting, stop and ask the user for guidance.

Examples:
- `prompts/AI_82_ROADS_manual_junction_authoring.md`
- `prompts/AI_DONE_82_ROADS_manual_junction_authoring_DONE.md`
- `prompts/AI_i_12_UI_options_tab_cleanup.md`
- `prompts/AI_i_DONE_12_UI_options_tab_cleanup_DONE.md`

## Interactive Workflow (`start ai`)

When the user says `start ai`, use interactive prompt mode.

1. Determine subject:
   - If the user did not specify `SUBJECT`, ask for it before creating the file.
2. Check for an open interactive AI file (active `AI_i_...` in `prompts/`):
   - If one exists, ask whether to:
     - Continue the current AI
     - Close current and start a new one
     - Start a new one without closing current
3. Keep the prompt conversational:
   - Add requirements incrementally as discussion continues.
   - Track requirements with checkboxes:
     - `- [ ]` not implemented
     - `- [x]` implemented
4. Implementation loop:
   - On “implement” requests, implement selected pending requirements.
   - Update the checklist status in the interactive AI file after implementation.
   - Continue gathering new requirements and repeating implementation cycles until the user says done.
5. Completion:
   - Rename to interactive DONE naming (`AI_i_DONE_..._DONE.md`).
   - Do not move to `prompts/archive/` automatically.
   - Move to archive only when explicitly requested.

## Prompt Structure

All prompts should clearly state the problem, goal, and expected behavior outcomes.

### Standard prompt template

```markdown
# Problem

[State the problem from the user]

# Request

[State the overall goal in high-level terms - describe WHAT, not HOW]

Tasks:
- [Describe desired behavior or outcome 1]
- [Describe desired behavior or outcome 2]
- [Describe desired behavior or outcome 3]

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
```

### Interactive prompt template

```markdown
# Problem

[State the user need]

# Request

[State the current objective in high-level terms]

## Requirements Checklist
- [ ] [Requirement 1]
- [ ] [Requirement 2]

## Implementation Notes
- [Add short notes for each implementation cycle]

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_i_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_i_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
```

## Notes

- The AI has access to the repository and can retrieve files as needed.
- The AI is aware of `PROJECT_RULES.md` and `AGENTS.md` conventions.
- No need to manually attach files or project structure.
- Legacy files in `prompts/archive/` may follow older naming formats; new files must follow the naming rules above.

## Best Practices

1. Be specific about outcomes.
2. Avoid implementation details.
3. Focus on behavior and expected results.
4. Keep requests concise; the AI can inspect the repo as needed.
5. Create a new file for each new request unless explicitly asked to continue/edit an existing one.
6. For interactive mode, keep checklist state current after every implementation cycle.
