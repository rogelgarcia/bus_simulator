#Problem

Even with a PBR catalog-first workflow, it is still easy to introduce subtle texture/content issues that cause unstable lighting and inconsistent appearance across the scene:

- wrong channel packing (ORM/ARM swapped)
- inverted roughness (glossiness mistaken for roughness)
- “gray” metalness maps where metalness should be mostly binary
- overly saturated albedo that looks cartoonish under sunlight/IBL
- normal maps that are too strong and cause noisy shading/shadows
- roughness distributions that are out-of-family for the assigned material class

We need an automated way to detect and surface these issues early, while still allowing subjective review where needed.

We also want the linter results visible inside the Material Calibration Tool so that calibration is not only visual, but also guided by objective signals.

# Request

Implement the material linter described in `specs/materials/PBR_MATERIAL_NORMALIZATION_PIPELINE_SPEC.md` Phase 5, including:
- a CLI linter tool for repeatable analysis
- an in-game “Calibration” panel integration in the Material Calibration Tool (Phase 2)

Tasks:
- Implement `tools/material_lint/` (with its own `README.md`) and register it in `PROJECT_TOOLS.md`.
- The linter MUST implement the two-level reporting model:
  - **Automatic (Error)**: objective, high-confidence issues
  - **Suggested (Suggestion)**: heuristic/outlier signals that need human review
- The linter MUST operate on the canonical PBR catalog and its categories/classes (Phase 1/3), not ad-hoc materials.
- The linter MUST produce:
  - a machine-readable JSON report
  - a human-readable summary output (console)

## Linter checks (first pass)

Automatic (Error) checks MUST include (as applicable):
- missing required maps (per class or per standard pipeline requirements)
- images that cannot be loaded/decoded
- extreme resolution mismatches across maps in a set (beyond tolerance)
- likely ORM/ARM channel misconfiguration (strong signals only)
- likely roughness inversion (strong signals only)
- metalness policy violations where policy expects binary metalness (e.g., “gray metalness”)

Suggested (Suggestion) checks SHOULD include:
- albedo luminance out-of-range for class
- albedo saturation out-of-range for class
- roughness mean/variance out-of-family for class
- normal intensity proxy out-of-family for class

The exact thresholds/ranges MUST be sourced from class metadata (Phase 3), with reasonable defaults for first pass.

## Calibration tool integration (in-game)

In the Material Calibration Tool (Phase 2), add a “Calibration” section in the **right-side panel** that:
- shows linter output for the currently active material (selected by clicking in the viewport)
- clearly separates **Errors** from **Suggestions**
- shows actionable details per finding:
  - which map/texture triggered it
  - measured values and thresholds (where applicable)
  - a short recommended next action

Behavior requirements:
- Results must be stable/repeatable for the same inputs.
- Limit scope to the currently selected materials (max 3 selected in the calibration tool) so performance remains acceptable.
- Linter must not silently “fix” content in first pass; it only reports.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_312_MATERIAL_phase5_material_linter_errors_vs_suggestions_and_calibration_panel_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
