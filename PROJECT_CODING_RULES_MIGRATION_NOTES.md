# Project Coding Rules - Migration Notes (Phase 1)

This doc tracks incremental, behavior-preserving refactors that apply `PROJECT_CODING_RULES.md` to the existing codebase.

## Phase 1 (this pass)

Targets (small, high-impact slice):
- City “scene” code: move rendering-heavy city scene builder out of `src/app/` into `src/graphics/`.
- Remove app-layer re-export shims that pointed back into `src/graphics/`.
- Add lightweight guardrails so new code stays compliant.

Implemented:
- Moved the city scene implementation to `src/graphics/visuals/city/City.js` and updated callers.
- Removed `src/app/city/CityWorld.js` re-export shim; callers import the generator directly.
- Added Node guardrails in `tests/node/unit/project_coding_rules_guardrails.test.js`.

## Patterns used

- **Layering**: rendering-heavy modules belong in `src/graphics/` even if they were historically under `src/app/`.
- **Guardrails as tests**: rule checks live in Node tests so they can run quickly and gate regressions without a build step.

## Next targets (suggested)

- Reduce cross-layer re-export shims in `src/app/**` that forward to `src/graphics/**` (replace with direct imports or relocate catalogs to the correct layer).
- Introduce `internal/` folders for large modules (ex: debugger UIs) and enforce the internal import privacy rule for newly-split modules.
- Add `// @ts-check` + JSDoc typedefs to a few high-churn public APIs (pick 1–2 modules at a time).

