#Problem

Window reflection overrides in Building Fabrication are over-scoped: we don’t need a per-building override layer. What we actually need is per-floor control, where each floor can have its own window reflection configuration.

Extra override layers increase UI complexity and make it harder to understand which settings are active.

# Request

Simplify window reflection overrides in Building Fabrication so **reflection configuration is per-floor only**. Each floor should own its own reflection settings, and there should be no per-building override layer.

Tasks:
- Data model:
  - Remove/avoid any per-building window reflection override layer.
  - Store window reflection settings per floor, with each floor having its own independent config object.
  - If there is a global reflection configuration, define clear fallback behavior:
    - A floor uses global defaults only when that floor’s override fields are unset/absent (or when “inherit global” is enabled, if applicable).
- UI/UX:
  - In the Windows section, expose “Window PBR / Reflection” controls at the per-floor level.
  - Make it obvious which floor is being edited and which settings apply to that floor.
  - Avoid duplicating a “building-level” reflection panel.
- Compatibility/migration:
  - If per-building overrides already exist in saved/exported configs, provide a migration path:
    - Prefer mapping the previous building-level settings into each floor’s settings (or into a default floor template) to preserve appearance.
    - Maintain backward compatibility so older exports still load without errors.
- Export/persistence:
  - Ensure per-floor reflection configs persist and are included in exported building configs.
  - Ensure generated buildings respect the per-floor reflection configs at runtime.

Nice to have:
- Add “copy this floor’s reflection settings to all floors” and “reset to global defaults” actions.

## Quick verification
- Configure two floors with different reflection settings:
  - Both floors render with their own reflection look.
- Load an older config (if applicable):
  - Reflection settings map correctly and visuals are preserved.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_223_BUILDINGS_building_fabrication_window_reflection_overrides_floor_only_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
