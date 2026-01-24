# Project Coding Rules (Canonical)

This file is the single source of truth for **coding style**, **architecture**, and **code organization** rules in this repo.

If `PROJECT_RULES.md` and this file disagree, follow this file.

## Layers and directory structure

- Keep **application/domain logic** in `src/app/`.
- Common domains in `src/app/`: `city/`, `core/`, `geometry/`, `input/`, `physics/`, `rigs/`, `utils/`, `vehicle/`.
- Keep **rendering/UI/engine visuals** in `src/graphics/`.
  - 3D engine fabrication → `src/graphics/engine3d/`
  - 3D content catalogs/definitions → `src/graphics/content3d/`
  - Legacy / in-migration 3D code → `src/graphics/assets3d/`
  - GUI/HUD/CSS → `src/graphics/gui/`
  - Visual effects & rendering utilities → `src/graphics/visuals/`
- Keep high-level gameplay states in `src/states/`.
- Keep browser-run tests under `tests/` (see `TESTING_RULES.md` for structure).
- Assets:
  - `assets/public/` is shareable/public.
  - other `assets/` subfolders may be licensed/private.
- `downloads/` stores third-party resources before integration (never consume directly at runtime).
- `tools/` contains utility scripts (registered in `PROJECT_TOOLS.md`).

## Physics

- This project uses the Rapier physics library.
- Documentation can be found under `docs/` (see `tools/download_rapier_docs.sh` if needed).

Rule: **Rendering/visual code stays in `src/graphics/`; application logic stays in `src/app/`.**

Do this instead:
- If you need “visuals” for an app system, return a renderer-agnostic model from `src/app/` and adapt it in `src/graphics/`.

## Validate at module boundaries only

Rule:
- Validate/sanitize inputs **once**, at the public module boundary (constructor/factory/public function).
- Internal logic should not be littered with scattered `typeof`, `Number.isFinite`, or silent fallback defaults.

Do this instead:
- Use a `sanitizeX(options)` or `assertX(options)` at entry.
- Make invalid states fail fast (throw/assert) during development and tests.

## No junk-drawer utilities

Rule:
- Don’t add loose helpers in “global” `utils.js` files or unrelated dumping grounds.

Do this instead:
- Keep helpers private in the module closure, or place them under `internal/` within the module folder.
- If a helper becomes shared, promote it to a small, well-named module in the correct domain folder.

## Separate domain data from rendering

Rule:
- Domain systems produce **data models**, not meshes/materials/DOM.
- Rendering adapts domain models into `THREE` objects or DOM.

Do this instead:
- `src/app/**` returns plain objects/arrays (geometry, placements, rules).
- `src/graphics/**` consumes those and builds meshes/materials/GUI.

## Prefer factories + dependency injection over globals

Rule:
- Avoid hidden global state/singletons as the default.

Do this instead:
- Prefer `createX(deps)` or `new XSystem(deps)` and wire dependencies at the composition root (typically `src/main.js` / state entry points).

## Freeze public interfaces; keep mutable state private

Rule:
- Public API objects should be stable and hard to misuse.

Do this instead:
- `Object.freeze(...)` returned API shapes and catalogs.
- Keep state private (closure/private fields); expose methods that enforce invariants.
- Avoid leaking references that allow outside mutation of internal collections.

## “internal/” is private by convention and structure

Rule:
- `internal/` modules are not imported from outside their owning module folder.

Do this instead:
- Re-export the intended public API from the module root (`index.js`) and import from there.

## Naming conventions communicate intent

Rule:
- Names must communicate layer and role.

Conventions:
- `createX(...)` for factories.
- `*System` for domain orchestration.
- `*Renderer` for graphics/render adapters.
- `*Tool` for developer tools.
- `*Panel` for GUI panels.
- `*Asset` / `*Catalog` for stable content registries.

## No silent fallbacks for impossible states

Rule:
- Don’t “paper over” impossible/bug states with silent defaults in core logic.
- Don’t add “patchy” `if (...) return default` branches as a hack to avoid fixing the underlying math/rules.

Do this instead:
- Throw/assert with a clear message (include IDs/seed/coordinates).
- If a fallback is intended (ex: user input), keep it at the boundary and document it.
- If a formula/rule produces edge cases, adjust the formula/rule (and add a test) instead of stacking special-case branches.

## Prefer data-driven catalogs over repeated conditionals

Rule:
- Avoid large `if/else` or `switch` ladders for static mappings.

Do this instead:
- Use `Object.freeze({ ... })` maps or catalog arrays with ids.
- Keep mappings close to their domain (ex: `*Catalog.js`).

## Keep files small and predictable

Rule:
- Don’t allow files to become “everything files”.

Do this instead:
- Split by concern (data, rules, helpers, UI wiring, rendering).
- Public APIs should be easy to scan from the top of a file.

## JavaScript module style

Rule:
- Use ES module syntax.
- Prefer file-level exports (named exports) over hidden exports.

## Types: JSDoc + @ts-check for public APIs

Rule:
- Public-facing modules should document inputs/outputs with JSDoc types.

Do this instead:
- Add `// @ts-check` at the top of public API modules.
- Use `@typedef` and explicit parameter/return docs where shapes matter.
- Avoid “guess the shape” objects.

## Update contracts and tick order

Rule:
- Update contracts must be discoverable and consistent.

Do this instead:
- Use `update(dt)` with `dt` in **seconds**.
- If a fixed-timestep phase exists, name it explicitly (`fixedUpdate(dt)`), and document the order at the loop owner (ex: `GameLoop`).

## Debugging is repro-first

Rule:
- Don’t layer fixes on top of fixes without a reproduction.

Do this instead:
- Create a minimal deterministic repro (harness scenario / small unit test).
- Fix the root cause once; avoid adding defensive code in unrelated layers.

## AI bugfix workflow (required)

Rule:
- When fixing a bug: **hypothesis → minimal patch (≤10 lines) → test expectation**.

Do this instead:
- Write/adjust a focused test that fails first.
- Make the smallest change that fixes it.
- Avoid stacking multiple “just in case” checks across layers.

## Logging is structured and searchable

Rule:
- Logs should be actionable and searchable.

Do this instead:
- Prefix logs with a stable module tag (ex: `[RoadEngine]`).
- Include entity ids and relevant context (seed, tile coords, world coords).
- Prefer `console.warn`/`console.error` for issues; avoid noisy per-frame logs.

## Comments policy

Rule:
- No comments in code files except the allowed cases below.

Allowed:
- First line: file description comment (ex: `// Generates roads from city data`).
- Design decisions: high-level rationale at the top (why, not how).
- Library source code: preserve original comments.
- Hackish solutions: explain what and why.
- Extremely high-level function blocks (ex: `// render curbs`, `// compute asphalt`).

## CSS and GUI construction

Rule:
- Keep CSS in CSS files, not embedded in JS.

Do this instead:
- One CSS per screen + shared global reusable classes.
- Reuse classes from the global CSS file and the screen CSS file.

Rule:
- For GUI/DOM (vanilla JS), avoid repeated `document.createElement` boilerplate.

Do this instead:
- Prefer reusable “row factories” / “mini controllers” for common patterns.
- Place mini controllers under the relevant screen folder (ex: `src/graphics/gui/<screen>/mini_controllers/`).
- Controllers should be:
  - Declarative to call (configure in one concise statement).
  - Consistent in DOM structure + CSS classes (match existing screen styles).
  - Leak-safe (`destroy()` removes listeners/popups).
  - Testable where possible (pure helpers can be covered by `tests/core.test.js` or Node tests).
- Don’t introduce a DOM framework unless it’s a deliberate project decision.

## Icons

Rule:
- Use Material Symbols Outlined for UI icons.

Do this instead:
- Use `.ui-icon` / `createMaterialSymbolIcon()` (no ad-hoc SVG sets).

## Module template (recommended)

Example layout:

- `src/app/<domain>/<module>/index.js` (public exports)
- `src/app/<domain>/<module>/types.js` (JSDoc typedefs, schemas)
- `src/app/<domain>/<module>/internal/*` (private helpers, not imported externally)
