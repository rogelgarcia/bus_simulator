# AI Prompt Creation Instructions

This file contains guidelines for creating effective AI prompts for code modifications and development tasks.

## Prompt Structure

Every AI prompt request should consist of the following parts:

### 1. The Request Itself
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
- The AI is aware of PROJECT_RULES.md and AGENTS.md conventions
- No need to manually attach files or project structure


## Template

```markdown
# Request

[State the overall goal in high-level terms - describe WHAT, not HOW]

When the work is finished, update the prompt file to add "DONE" at the beginning of the first line.

Tasks:
- [Describe desired behavior or outcome 1]
- [Describe desired behavior or outcome 2]
- [Describe desired behavior or outcome 3]
- [etc.]

## Overriding Project Rules

- **If importing library source code into the project, preserve all original comments** (This overrides the project's no-comments rule)

## Context (Optional)

[Add any additional context, examples, or constraints here]
[Avoid specifying implementation details - focus on requirements and behavior]
```

## Best Practices

1. **Be Specific About Outcomes**: Clearly articulate what you want to achieve, not how to achieve it
2. **Avoid Implementation Details**: Don't specify class names, function signatures, or code structure - let the AI determine the best approach
3. **Focus on Behavior**: Describe what the system should do, not how it should be coded
4. **Provide Context**: Add relevant examples, constraints, or edge cases when needed
5. **Keep It Simple**: The AI has repository access - just describe what you need
6. **Trust the AI**: It will retrieve necessary files, determine implementation details, and follow project conventions automatically
7. **Save the Request**: Store the complete request in a file for reference (Use an specific file name AI_#_title)


