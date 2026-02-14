#DONE
#Problem

DO NOT EDIT ANY CODE.

The codebase contains many scattered `if`/`switch`/ternary branches that directly check for specific variants (building styles, concrete bus/model IDs, asset paths, etc.). This spreads “policy” across generic modules and reduces maintainability as catalogs grow.

Example of the problem (generic generator leaking specificity):

```
function resolveBuildingStyleWallMaterialUrls(styleId) {
    const id = isBuildingStyle(styleId) ? styleId : BUILDING_STYLE.DEFAULT;
    const baseColorUrl = resolveBuildingStyleWallTextureUrl(id);
    if (id === BUILDING_STYLE.BRICK) {
```

Building generation logic should be generic; style-specific attributes should live behind a catalog/interface so adding a new style does not require adding `if` statements across many files.

# Request

Create a comprehensive **report** that audits the repository for “specificity leakage” and scattered conditional branching on variants, and proposes a module hierarchy + interfaces/catalogs to eliminate these patterns. This prompt is for analysis only.

DO NOT EDIT ANY CODE (no source changes). You may only add report artifacts (markdown/csv/json) and update this AI prompt file to DONE when finished.

save THE report under `AI_00_REPORT_modularization_specificity_audit.md` if other formats are needed (CSV/JSON) save alongside in `AI_00_modularization_specificity_audit_[data_title].[extension]` folder.

Tasks:
- Define “specificities” for this audit:
  - Treat as specificities: enum members (`BUILDING_STYLE.BRICK`), concrete IDs (`mesh.street_sign_pole.v1`), asset paths (`assets/public/.../brick...`), named models/buses, hardcoded catalog keys, etc.
  - Treat as generic: math/THREE primitives, generic constants, utility functions, generic algorithms.
- Identify “generic” vs “specific” files using practical heuristics:
  - Generic candidates: generators, factories, renderers, solvers, pipelines, managers, shared utils (by folder and by filename/role).
  - Specific candidates: concrete variants (specific bus model file, specific building config, specific mesh definition, specific texture asset set).
  - Include notes where a file’s role is ambiguous.
- Compute and report the following metrics (repo-wide and per-file):
  - **Specificity Count per File (SCF)**: number of distinct specificities referenced by a file.
  - **Conditional Specificity Density (CSD)**: (# branches testing specificities) / KLOC.
  - **Enum/Switch Hotspot Score (EHS)**: count of comparisons against variant enums/types per file and across the repo.
  - **Knowledge Leakage Index (KLI)**: generic files importing/referencing specialized modules/assets.
  - **Scattered Conditional Fingerprint (SCF2)**: number of files branching on the same specificity family (e.g., `BUILDING_STYLE`).
  - **Dependency Direction Violations (DDV)**: import edges that go from “generic layer” → “specific layer”.
- Also include standard industry metrics where feasible (and explain any approximations):
  - Cyclomatic Complexity (CC) per file.
  - Fan-Out / coupling (imports and direct dependencies).
  - Cognitive Complexity (if available via tooling).
- Tooling (allowed):
  - You may use analysis tools (e.g., ESLint complexity rule, Madge dependency graphs, Sonar-like metrics) if they can run in this environment.
  - Prefer non-invasive usage (do not add dependencies to the repo); use ephemeral tooling when possible.
  - If tools cannot be used, fall back to deterministic grep/AST-based counts and clearly state limitations.
- Produce a module hierarchy proposal (report section):
  - Propose a clean module hierarchy and layering based on the repo’s existing structure and the findings.
  - Explicitly define which layers are “generic engine” vs “content definitions”.
  - Identify the main “specificity families” (e.g., Building styles, Window styles, Bus catalog, Procedural mesh catalog, Sign catalog, Road debug entities) and map them to modules.
- Identify and categorize files:
  - List files that are already **generic/clean** (SCF=0 or no specificity branching and low leakage).
  - List files that are **specialized** (SCF=1 and clearly a concrete variant/config).
  - List files that **must be generalized** (SCF≥2), especially when they are in a generic role folder.
  - For each “must be generalized” file, include:
    - which specificity families it leaks,
    - representative conditional patterns (brief),
    - likely interface/catalog needed to fix it.
- Interface/catalog recommendations (report section):
  - For each major specificity family, propose the interface/codeless-catalog shape that would eliminate scattered conditionals.
  - Use recognized patterns where applicable:
    - Strategy pattern for behavioral variation
    - Registry/lookup table for config/value selection
    - Abstract factory for creating composed assets
  - Describe how generic modules should depend only on the interface/registry and not on concrete variants.
- Deliver report artifacts:
  - Create `AI_00_REPORT_modularization_specificity_audit.md` with:
    - executive summary + top offenders
    - module hierarchy proposal
    - tables (SCF/CSD/EHS/KLI + hotspots)
    - prioritized refactor targets (what to fix first and why)
  - Create a machine-readable export (CSV or JSON) containing per-file metrics for future iteration (e.g., `AI_00_REPORT_modularization_specificity_audit.json`,
  `AI_00_REPORT_modularization_specificity_audit.csv`). You may create multiple files if needed.
- Consider creating scripts or tooling and adding to tools/ for future reuse. If tooling is created, document its usage in the report and include in PROJECT_RULES.md.
- Downloading tools, and checking internet resources is allowed if needed for analysis.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_110_DONE_MESHES_modularization_specificity_audit_report`
- Provide a summary of the report generated in this AI document (one liner)

Summary: Generated repo-wide modularization specificity audit report + JSON/CSV exports under `AI_00_REPORT_modularization_specificity_audit.*`.
