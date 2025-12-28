# AI Prompt Creation Instructions

This file contains guidelines for creating effective AI prompts for code modifications and development tasks.

## Prompt Structure

Every AI prompt request should consist of the following parts:

### 1. The Request Itself
- State the overall goal or objective
- Break down the desired outcome as an itemized list of tasks
- Be specific about what needs to be accomplished
- Include any constraints or requirements

Example:
```
Implement user authentication system:
- Create login form component
- Add password validation
- Implement JWT token handling
- Add logout functionality
```

### 2. Context (Optional)

If additional context is needed:

- Provide specific examples or use cases
- Include relevant documentation or references
- Describe edge cases or special considerations
- Add any constraints or limitations

## Notes

- The AI has access to the repository and can retrieve files as needed
- The AI is aware of PROJECT_RULES.md and AGENTS.md conventions
- No need to manually attach files or project structure


## Template

```markdown
# Request

[State the overall goal]

Tasks:
- [Task 1]
- [Task 2]
- [Task 3]
- [etc.]

## Overriding Project Rules

- **If importing library source code into the project, preserve all original comments** (This overrides the project's no-comments rule)

## Context (Optional)

[Add any additional context, examples, or constraints here]
```

## Best Practices

1. **Be Specific**: Clearly articulate what you want to achieve
2. **Provide Context**: Add relevant examples, constraints, or edge cases when needed
3. **Keep It Simple**: The AI has repository access - just describe what you need
4. **Trust the AI**: It will retrieve necessary files and follow project conventions automatically
6. **Save the Request**: Store the complete request in a file for reference (Use an specific file name AI_#_title)

