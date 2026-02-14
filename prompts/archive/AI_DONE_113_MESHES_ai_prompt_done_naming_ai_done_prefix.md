#Problem [DONE]

AI prompt file naming rules have changed. The repository currently uses (and documents) the completed-prompt naming pattern with `DONE` after the numeric id. We want to change completed prompt filenames so `AI_DONE` comes first for easier scanning and filtering.

# Request

Update the AI prompt naming rules so completed prompts use the pattern:

- For prompt: `AI_##_SUBJECT_title`
- Completed prompt: `AI_DONE_##_SUBJECT_title`

Then update all documentation and repo rules that mention the old completed naming scheme. Also ensure completed prompt files are ignored by git by adding an `AI_DONE*` ignore rule.

Tasks:
- Update `AI_PROMPT_INSTRUCTIONS.md`:
  - Replace the old completed naming scheme with `AI_DONE_##_SUBJECT_title`.
  - Update the examples and the “On completion” rename instruction to the new scheme.
  - Keep the existing `SUBJECT` problem space list and title formatting rules unchanged.
- Update `PROJECT_RULES.md`:
  - Update any mention of `_DONE_` naming to the new `AI_DONE_` prefix scheme.
  - Keep any behavioral rules tied to “DONE prompts” aligned with the new naming.
- Update `AGENTS.md` if it references DONE naming (should be minimal; keep it as a pointer).
- Update `.gitignore`:
  - Add an ignore entry so files starting with `AI_DONE` are ignored (e.g., `AI_DONE*` or `AI_DONE_*`).
  - Ensure this works alongside `old_prompts/` ignoring (do not remove existing ignores).
- Clarify migration policy:
  - Existing DONE files will be left as-is 
  - Ensure the docs reflect that policy so contributors don’t get confused.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_113_MESHES_ai_prompt_done_naming_ai_done_prefix`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Updated docs/rules to use `AI_DONE_##_SUBJECT_title` for completed prompts and ignored `AI_DONE_*` in git.
