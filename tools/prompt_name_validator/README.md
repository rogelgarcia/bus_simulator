# prompt_name_validator

Validate AI prompt file placement and naming conventions.

## Usage

```bash
node tools/prompt_name_validator/run.mjs
```

Strict mode (treat warnings as failures):

```bash
node tools/prompt_name_validator/run.mjs --strict
```

## What it checks

- `prompts/` and `prompts/archive/` exist.
- No prompt task files are left at repo root.
- In-progress prompt files under `prompts/` follow:
  - `AI_##_SUBJECT_title.md` on `main`
  - `AI_<branch>_##_SUBJECT_title.md` on non-main branches
- Completed (not yet archived) prompt files under `prompts/` follow:
  - `AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Completed prompt files under `prompts/archive/` follow:
  - `AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Active prompts do not duplicate `(namespace, id)`.

## Legacy archive behavior

Historical files in `prompts/archive/` that do not match the new naming scheme are reported as warnings by default, not errors.
