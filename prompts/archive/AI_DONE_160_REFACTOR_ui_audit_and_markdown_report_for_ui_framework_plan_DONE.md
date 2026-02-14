# DONE

#Problem

UI code is spread across many files with inconsistent patterns (manual DOM construction, repeated widget implementations, mixed shared vs screen-specific styling, and ad-hoc event wiring). This increases maintenance cost, makes UI changes slow, and prevents consistent theming. We need a systematic audit to understand current UI structure, identify reusable widgets, and propose a uniform UI framework approach that reduces source code repetition and improves developer velocity.

# Request

Perform a full UI review of the repository and generate a Markdown report that inventories all UI-related files, identifies shared vs unique styling, repetition patterns, widget reuse opportunities, and recommends a clear folder organization + reusable JS widget classes to standardize UI development going forward.

Tasks:
- Generate a Markdown report file (in the repo root) named `UI_AUDIT_REPORT.md`.
- The report must scan and list every file that contains UI code, including but not limited to:
  - `src/graphics/gui/**` (screens, panels, mini controllers, shared helpers)
  - any UI logic outside that folder (e.g., state files that construct UI, overlays, debug UIs)
  - CSS files used by UI and how they are referenced
- Identify non-UI code embedded inside UI files:
  - For each UI file, call out sections of code that are not UI responsibilities (e.g., geometry/math, simulation logic, asset loading, catalog building, heavy data normalization, procedural generation, business rules).
  - Recommend where that logic should live instead (e.g., `src/app/**` for app logic, `src/graphics/content3d/**` for catalogs, `src/graphics/assets3d/**` for 3D generators/material systems, `src/graphics/gui/shared/**` for reusable UI-only helpers).
  - Highlight the top “worst offenders” (largest non-UI blocks) and estimate the potential LOC reduction if extracted.
- For each UI file found, include:
  - File path
  - UI “theme” classification:
    - Shared (fully uses shared widgets/styles)
    - Unique (screen-specific, not reused)
    - Hardcoded (heavy inline styles / direct DOM assignment patterns repeated)
    - Partially shared (mix of shared + bespoke)
  - Notes on repetition patterns (e.g., repeated DOM construction blocks, repeated slider/range row patterns, repeated picker patterns)
  - Whether the file/folder organization follows project rules and a consistent pattern
- Identify and list reusable widget candidates observed across screens, especially:
  - Numeric input with increment/decrement
  - Slider/range with number input
  - Toggle/checkbox rows
  - Dropdown/select rows
  - Material/texture picker rows (thumb + label + status)
  - Collapsible details sections
  - Tooltip patterns
  - Toast/notification patterns
- For each widget candidate, propose a dedicated JS “widget class” (not CSS-only) that encapsulates:
  - DOM construction
  - State setters/getters
  - Event handling
  - `destroy()` lifecycle cleanup
  - Styling hooks via CSS classes (so appearance can change later without rewriting callers)
- Provide a proposed “UI framework / widget layer” plan:
  - Suggested folder organization for reusable widgets and shared UI utilities (e.g., `src/graphics/gui/shared/widgets/`, `src/graphics/gui/shared/controllers/`, etc.).
  - Suggested naming conventions and expectations for widget/controller interfaces.
  - Migration strategy (incremental adoption without large rewrites):
    - Start with highest-reuse widgets
    - Convert biggest UI files first
    - Establish “no new ad-hoc widget” guideline
- Identify whether the UI framework could be extended toward a descriptor-driven UI:
  - Evaluate the feasibility of giving each “engine” (systems like road pipeline stages, material variation, building fabrication parameters, etc.) a declarative descriptor/schema of its properties and constraints.
  - The goal: UI code can read these descriptors and generate controls dynamically (with consistent widgets, validation, defaults, tooltips, grouping, and persistence) instead of hand-constructing UI for every parameter.
  - In the report, propose:
    - A minimal descriptor format (type, label, default, min/max/step, group/section, tooltip, visibility/enabled rules, serialization key, etc.).
    - How descriptors map to widget classes (range, number, toggle, select, color/material picker, details groups).
    - How to support computed/derived values and per-screen overrides without losing flexibility.
    - An incremental adoption plan starting with one subsystem (e.g., Road Debugger pipeline settings or Building Fabrication numeric controls).
    - Risks/tradeoffs (complexity, edge cases, debugging, customization) and how to mitigate them.
  - Check existing patterns already in the repo that resemble descriptor-driven UI (e.g., Mesh/Inspector Room systems):
    - Identify where the mesh inspector defines option collections/entries and how the UI renders them.
    - Assess whether that pattern can be generalized into a shared “property descriptor → widget” framework.
    - Call out any gaps (validation, min/max/step metadata, grouping, tooltips, persistence) and propose how to extend the existing pattern rather than inventing a new one from scratch.
- Include a “What else?” section with additional improvement opportunities beyond widgets, such as:
  - Standardizing theming via CSS variables and a single theme source of truth
  - Reducing inline DOM property assignment via factories/controllers
  - Consistent event wiring patterns (delegation vs per-element listeners)
  - Performance considerations (render batching, avoiding layout thrash)
  - Documentation and examples for building new screens with the framework

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_160_REFACTOR_ui_audit_and_markdown_report_for_ui_framework_plan_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
