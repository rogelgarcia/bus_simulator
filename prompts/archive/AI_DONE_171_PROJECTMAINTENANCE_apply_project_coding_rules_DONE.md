# DONE

# Problem

`PROJECT_CODING_RULES.md` defines the desired coding/architecture organization rules, but the current codebase still contains many violations (scattered defensive checks, mixed domain/render/UI responsibilities, junk-drawer helpers, internal imports leaking across modules, large “god files”, inconsistent naming, hidden globals/singletons, and mutable state leaks). Without applying the rules and adding guardrails, the codebase will keep drifting and become harder to test and maintain.

# Request

Apply `PROJECT_CODING_RULES.md` across the codebase in a behavior-preserving way, prioritizing high-churn and high-complexity areas first, and add lightweight automation/guardrails so new code stays compliant.

Tasks:
- Audit the codebase for the highest-impact rule violations and identify an initial “Phase 1” target list (a small set of modules/files) to refactor first.
- Refactor selected targets to validate at boundaries only: centralize assertions/sanitization at public entry points and remove scattered `typeof`/`isFinite`/silent fallback defaults from core logic.
- Reorganize modules to remove loose helpers and junk drawers: introduce clear public module APIs (ex: `index.js`) and move helpers to `internal/*` or private closures; update imports so `internal/` remains private.
- Separate domain data from rendering where mixed: systems should produce/consume models; renderers should adapt models into meshes/materials; remove direct mesh creation from domain logic in the refactored targets.
- Replace hidden global state/singletons with factory-created systems (`createX(deps)`) and dependency injection at the composition root; freeze public interfaces and prevent mutable state leaks.
- Apply naming conventions consistently (`createX`, `*System`, `*Renderer`, `*Tool`, `*Panel`, `*Asset`/`*Catalog`) and split oversized files by concern into predictable structures.
- Add/expand JSDoc typedefs + `@ts-check` for public APIs in the refactored targets so shapes/contracts are explicit and editor-checked.
- Ensure update contracts are explicit for ticked systems (`update(dt)` / optional `fixedUpdate`) and that tick order is discoverable/consistent.
- Add “repro-first” minimal sandboxes/scenarios for any sticky refactors/bugs encountered during this work (small isolated repros instead of project-wide patch layering).
- Standardize logging for touched modules: structured, searchable logs including module name + entity IDs + coordinates/seed when relevant.
- Add lightweight automated guardrails to prevent regressions (ex: checks that flag imports from `internal/`, detect forbidden silent fallback patterns in core logic, and surface naming/layering drift).
- Ensure existing tests still pass; add minimal tests only where it materially reduces risk of the refactor.

Nice to have:
- Provide a short “migration notes” section documenting patterns used (factories, internal module layout, assert utilities) and examples from refactored targets.
- Provide optional “next targets” list after Phase 1 is complete.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_171_PROJECTMAINTENANCE_apply_project_coding_rules_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (Phase 1)
- Defined a small “Phase 1” slice and moved rendering-heavy city scene code out of `src/app/` into `src/graphics/` (`src/graphics/visuals/city/City.js`) with behavior-preserving import updates.
- Removed the `src/app/city/CityWorld.js` re-export shim and updated callers to import the generator directly.
- Added lightweight automated guardrails as Node tests to prevent new `internal/*` import leaks and junk-drawer `utils.js` files (`tests/node/unit/project_coding_rules_guardrails.test.js`).
- Added `PROJECT_CODING_RULES_MIGRATION_NOTES.md` to track applied patterns and propose next targets.
