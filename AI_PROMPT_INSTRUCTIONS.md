# AI Prompt Creation Instructions

This file contains guidelines for creating effective AI prompts for code modifications and development tasks.

## File Naming (Required)

Every prompt must be saved as its own file using this naming scheme:

- New prompt: `AI_##_SUBJECT_title`
- Completed prompt: `AI_##_DONE_SUBJECT_title`

Rules:
- `##` is the numeric prompt id (keep it stable).
- `DONE` appears **immediately after the number** when the work is completed.
- `SUBJECT` is the *problem space* and must be uppercase, one of:
  - `ROADS`
  - `VEHICLES`
  - `TRAFFIC`
  - `BUILDINGS`
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
- `title` is lowercase, words separated by `_`.
- Prefer no file extension (match existing `AI_*` files in the repo).

Examples:
- `AI_82_ROADS_manual_junction_authoring`
- `AI_82_DONE_ROADS_manual_junction_authoring`

## Prompt Structure

Every AI prompt request should consist of the following parts:

### 1. The Request Itself
- State the problem
- State the overall goal or objective in high-level terms
- Break down the desired outcome as an itemized list of **what** needs to be accomplished, not **how**
- Focus on behavior, features, and outcomes rather than specific code implementations
- Include any constraints or requirements
- **Avoid specifying implementation details!!** - let the AI determine the best approach

Example:
```
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
- Also rename the AI file to `AI_##_DONE_SUBJECT_title` (DONE comes right after the number)
- Provide a summary of the changes made in the AI document (very high level, one liner)
```

## Best Practices

1. **Be Specific About Outcomes**: Clearly articulate what you want to achieve, not how to achieve it
2. **Avoid Implementation Details**: Don't specify class names, function signatures, or code structure - let the AI determine the best approach
3. **Focus on Behavior**: Describe what the system should do, not how it should be coded
4. **Keep It Simple**: The AI has repository access - just describe what you need
5. **Trust the AI**: It will retrieve necessary files, determine implementation details, and follow project conventions automatically
6. **Save the Request**: Store the complete request in a file for reference using `AI_##_SUBJECT_title`.
7. **New file**: Always create a new file for each request. Unless expecitely stated in the last message that it is to update an existing request.
8. **Request improvement**: Try to understand the nature of the user request and add inference of nice to have features when translating the user request to the document.
