# AI Prompt Creation Instructions

This file contains guidelines for creating effective AI prompts for code modifications and development tasks.

## File Location (Required)

All AI prompts are tracked in git and stored under:

- Active and completed prompts: `prompts/`
- Archived prompts (only when explicitly requested): `prompts/archive/`

Do not place prompt task files at repo root.

## File Naming (Required)

Every prompt must be saved as its own file using this naming scheme.

On `main`:
- New prompt: `AI_##_SUBJECT_title.md`
- Completed prompt: `AI_DONE_##_SUBJECT_title_DONE.md`

On non-`main` branches:
- New prompt: `AI_<branch>_##_SUBJECT_title.md`
- Completed prompt: `AI_DONE_<branch>_##_SUBJECT_title_DONE.md`

Rules:
- `##` is the numeric prompt id (keep it stable within the branch namespace).
- Completed prompts include `DONE` near the front and at the end (`AI_DONE_..._DONE.md`).
- `<branch>` is required on non-`main` branches and omitted on `main`.
- `<branch>` should be filename-safe:
  - lowercased
  - replace `/` and spaces with `_`
  - replace any remaining non `[a-z0-9._-]` with `_`
  - collapse repeated `_`
- `SUBJECT` is the *problem space* and must be uppercase, one of:
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
- If multiple prompts share the same numeric id, implement the prompt in the current branch namespace.
- If prompt selection is still ambiguous (or there is a conflict), stop and ask the user for guidance.

Examples:
- `prompts/AI_82_ROADS_manual_junction_authoring.md`
- `prompts/AI_feature_material-linter_01_MATERIAL_calibration_panel_split.md`
- `prompts/AI_DONE_82_ROADS_manual_junction_authoring_DONE.md`
- `prompts/archive/AI_DONE_feature_material-linter_01_MATERIAL_calibration_panel_split_DONE.md`

## Prompt Structure

Every AI prompt request should consist of the following parts.

### 1. The Request Itself
- State the problem
- State the overall goal or objective in high-level terms
- Break down the desired outcome as an itemized list of **what** needs to be accomplished, not **how**
- Focus on behavior, features, and outcomes rather than specific code implementations
- Include any constraints or requirements
- **Avoid specifying implementation details!!** - let the AI determine the best approach

Example:
```text
Implement user authentication system:
- Allow users to log in with credentials
- Validate password strength requirements
- Maintain user session across page refreshes
- Allow users to log out
```

## Notes

- The AI has access to the repository and can retrieve files as needed
- The AI is aware of `PROJECT_RULES.md` and `AGENTS.md` conventions
- No need to manually attach files or project structure
- Legacy files in `prompts/archive/` may follow older naming formats; new files must follow the naming rules above

## Template

```markdown
#Problem

[State the problem related by the user]

# Request

[State the overall goal in high-level terms - describe WHAT, not HOW]

Tasks:
- [Describe desired behavior or outcome 1]
- [Describe desired behavior or outcome 2]
- [Describe desired behavior or outcome 3]
- [etc.]

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
```

## Best Practices

1. **Be Specific About Outcomes**: Clearly articulate what you want to achieve, not how to achieve it
2. **Avoid Implementation Details**: Don't specify class names, function signatures, or code structure - let the AI determine the best approach
3. **Focus on Behavior**: Describe what the system should do, not how it should be coded
4. **Keep It Simple**: The AI has repository access - just describe what you need
5. **Trust the AI**: It will retrieve necessary files, determine implementation details, and follow project conventions automatically
6. **Save the Request**:
   - `prompts/AI_##_SUBJECT_title.md` on `main`
   - `prompts/AI_<branch>_##_SUBJECT_title.md` on non-main branches
7. **New file**: Always create a new file for each request, unless explicitly asked to update an existing request
8. **Request improvement**: Try to understand the nature of the user request and add inferred nice-to-have features when translating the user request to the document
