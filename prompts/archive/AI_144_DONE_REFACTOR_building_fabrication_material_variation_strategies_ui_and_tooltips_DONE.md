# DONE

#Problem

Building fabrication now needs a clean, industry-style way to configure material/texture variation for walls/roofs/floors. The current variation approach has become confusing (too many masks, repeated-looking results, unclear purpose per mask/effect), and the UI does not clearly explain what each strategy does or which parameters are essential vs optional.

# Request

Refactor building fabrication’s material variation controls to expose a coherent set of industry-standard variation strategies, with a structured UI, must-have parameter indicators, and tooltips everywhere. This is primarily a UI/UX + configuration refactor: prioritize clarity, consistency, and cleanup of existing implementation.

Tasks:
- Audit current implementation:
  - Identify the existing “material variation” configuration, how it is stored in building configs, and how it maps to the renderer/shader pipeline.
  - Identify redundant/unused masks/params and places where multiple effects are driven by the same mask in a way that collapses variation.
  - Refactor/cleanup for readability and maintainability (remove dead config paths, consolidate duplicates, keep naming consistent).
- Implement an industry-style strategy layout (grouped and documented):
  - Add a “Material variation” section in building fabrication for applicable layers (at minimum walls; include roof/floor if supported).
  - Organize parameters into clear subject groups (at minimum):
    - Basics
    - Anti-tiling
    - Macro variation
    - Mid variation (patches)
    - Micro variation (surface response)
    - Weathering (directional/height/orientation)
    - Brick-specific (bonding, per-brick/mortar)
    - Advanced (projection/warping/perf/debug)
  - Each strategy and each parameter must have a tooltip explaining purpose, typical use, and what “too much” looks like.
- Add and/or expose the following strategies (as options/toggles with parameters):
  - Anti-tiling (fast vs quality modes)
  - Macro variation using 1–2 independent macro masks (macroA/macroB roles should be clear)
  - Mid variation “patches” mask (repairs/batches/fade)
  - Micro variation primarily for roughness (and optional normal strength)
  - Weathering masks (purpose-driven, not “random”):
    - Streaks/runoff (gravity-aligned)
    - Height bands (ground grime / roofline deposits)
    - Orientation exposure (sun bleaching / windward rain)
    - Optional wetness/dust/moss/soot/efflorescence controls (if supported by the pipeline)
  - Brick-specific:
    - Brick bond UV staggering (per-row offset pattern like 0 / 0.4 / 0.8)
    - Per-brick variation (subtle hue/value/roughness per brick)
    - Mortar variation (separate-ish look: different roughness/value + grime in mortar lines)
  - Optional warping/projection:
    - UV/domain warping (for concrete/grass break-up)
    - Optional triplanar/world-space projection mode (where appropriate)
- Must-have vs optional parameters:
  - Define a “must-have” minimal set of controls per strategy (the few parameters a user should touch first).
  - Define optional/advanced parameters per strategy (rarely adjusted).
  - In the UI, add a small red dot marker after the label for must-have parameters (and ensure it is consistently styled and accessible).
  - Every parameter (must-have and optional) must have its own tooltip.
- Defaults and safety:
  - Provide sensible defaults that produce subtle but visible improvement without obvious repetition.
  - Provide safe min/max ranges and stop at settings that obviously break visuals (e.g., extreme warping, extreme hue shifts). 
- Configuration + persistence:
  - No need to persist locally. All settings will be exported via building configs as before.
  - Maintain backwards compatibility for existing building configs:
    - Old configs should render as before unless the user enables/edits new strategies.
    - Provide clear migration behavior where necessary (mapping legacy params to the new grouped structure).
- UI behavior and polish:
  - Keep the panel scannable: avoid overwhelming the user (collapsed groups, sensible ordering, “reset to defaults” affordances).
  - Ensure toggles are clearly active/inactive (pressable state, consistent with existing UI conventions).
  - Use Material Symbols Outlined icons where icons are needed.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_144_DONE_REFACTOR_building_fabrication_material_variation_strategies_ui_and_tooltips_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Summary
- Refactored Building Fabrication “Material variation” into an industry-style, grouped UI for walls and roofs with tooltips + must-have markers.
- Added strategy coverage + parity (anti-tiling, macro A/B, patches+coverage, micro roughness, exposure, brick layout/per-brick/mortar, stair/bonding patterns) and wired everything to exported configs.
- Added reset-to-defaults affordances and safe ranges, preserving backwards compatibility via normalization/migration behavior.
