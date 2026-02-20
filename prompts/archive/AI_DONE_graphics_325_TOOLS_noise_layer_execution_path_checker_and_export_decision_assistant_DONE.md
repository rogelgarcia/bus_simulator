DONE

# Problem

As the noise fabrication screen moves to layered stacking, choosing whether each layer should run as shader-driven, baked texture, or hybrid is becoming complex and inconsistent.

# Request

Implement a layered execution-path checker and export decision assistant so per-layer runtime/bake choices are guided, testable, and explicit before export.

Tasks:
- Add an automatic per-layer execution-path checker that recommends/assigns `Shader`, `Texture (Baked)`, or `Hybrid` based on layer characteristics.
- Add dynamic propagation semantics: when a layer is marked/identified as dynamic at runtime, default that layer and later layers in the stack to dynamic/shader path unless explicitly overridden.
- Add heuristic analysis for high-frequency detail detection and large-scale/world-space usage so checker decisions are grounded in measurable signals.
- Add a static-cost check to detect static but expensive layers and recommend/assign baked texture output.
- Add tests that verify checker behavior for key cases: dynamic propagation, static+expensive to baked, high-frequency classification, and large-scale/world-space classification.
- On export, add a decision assistant flow that asks a short series of questions, shows per-layer path choices, allows adjustments, and requires final confirmation before export.
- Keep manual override controls available per layer so checker recommendations are assistive, not mandatory.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Added a dedicated execution-path checker module with per-layer heuristic scoring and path recommendations for `shader`, `texture_baked`, and `hybrid`.
- Added dynamic propagation behavior so later layers default to shader when an earlier layer is dynamic, while allowing explicit per-layer overrides.
- Added static-cost, high-frequency, and large-scale/world-space signals to drive path recommendations with measurable classifier scores.
- Integrated execution settings into the layered state model, sanitization, export scope, and recipe serialization contracts.
- Added per-layer manual execution controls in the layer editor and execution-path tags in stack tabs.
- Added an export decision-assistant modal with context questions, per-layer final-path adjustments, confirmation gating, and export metadata capture.
- Added node unit coverage for checker behavior (dynamic propagation, static-expensive to baked, high-frequency, and large-scale/world classification) and recipe assistant metadata export.
