# DONE

# Problem

Project coding/architecture rules are currently scattered and informal, which makes it easy for “garbage patterns” to creep in (defensive checks inside core logic, junk-drawer utilities, mixed domain/rendering code, hidden global state, inconsistent naming, and ever-growing files). We need a single canonical rules document referenced from `PROJECT_RULES.md`, so contributors (and AI) have one obvious source of truth.

# Request

Write and centralize project coding organization rules in a new `PROJECT_CODING_RULES.md`, and update `PROJECT_RULES.md` to reference it. This phase is documentation-only (no refactors yet).

Tasks:
- Create `PROJECT_CODING_RULES.md` and move all coding/architecture rules there (including any relevant “Code Style / GUI DOM Construction” rules currently described in `PROJECT_RULES.md`).
- Include the following rules in `PROJECT_CODING_RULES.md` (structured, concise, and written as enforceable rules with short “do this instead” guidance):
  - Validate at module boundaries only (assert/sanitize once; avoid scattered `typeof`/`isFinite`/silent fallbacks in core logic).
  - No loose utility functions / no junk-drawer `utils.js` (use module `internal/` helpers or keep helpers private in module closure).
  - Separate domain data from rendering (systems produce models; renderers adapt models into meshes/materials).
  - Prefer factory-based systems over globals (use `createX(deps)` + dependency injection at the composition root).
  - Freeze public interfaces and avoid shared mutable state leaks (`Object.freeze` public API objects; keep state private).
  - “Internal” code is private by convention and by structure (`internal/` not imported from outside the module; public access via module API).
  - Naming conventions communicate intent/layer (`createX`, `*System`, `*Renderer`, `*Tool`, `*Panel`, `*Asset`/`*Catalog`).
  - No silent fallback defaults for impossible states (assert/throw in DEV; explicit boundary fallbacks only when intended).
  - Prefer data-driven catalogs/maps over conditionals (replace repeated `if/else`/`switch` ladders with declarative catalogs).
  - Keep files small and predictable (split by concern; keep public APIs easy to scan).
  - Use JSDoc types + `@ts-check` for public APIs (typedefs for inputs/outputs; no “guess the shape” objects).
  - Define update contracts (`update(dt)` / optional `fixedUpdate`; explicit tick order discoverable).
  - Debugging is repro-first (minimal repro sandboxes/scenarios instead of layering fixes).
  - AI bugfix workflow rule (hypothesis → minimal patch (≤10 lines) → test expectation; avoid layer-on-layer fixes).
  - Logging is structured/searchable (include module + entity IDs + coordinates/seed when relevant).
- Update `PROJECT_RULES.md` to reference `PROJECT_CODING_RULES.md` as the canonical place for coding/style/architecture rules, and remove duplicated rule text from `PROJECT_RULES.md` so there is one source of truth.

Nice to have:
- Add a small “module template” section in `PROJECT_CODING_RULES.md` showing the intended `index.js` + `internal/*` + `types.js` layout and naming conventions.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_170_PROJECTMAINTENANCE_enforce_code_organization_rules_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added `PROJECT_CODING_RULES.md` as the canonical home for coding style, architecture, and code organization rules.
- Updated `PROJECT_RULES.md` to reference `PROJECT_CODING_RULES.md` and removed duplicated coding/style text so there is one source of truth.
