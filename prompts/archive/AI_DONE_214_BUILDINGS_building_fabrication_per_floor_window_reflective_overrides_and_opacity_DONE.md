DONE

#Problem

Window reflective material behavior is currently controlled globally, but Building Fabrication needs per-building and per-floor overrides for window reflection settings. Without overrides, it’s not possible to art-direct different buildings (or floors) independently, and it’s unclear how reflective layers should be positioned relative to the window (inside/outside) and how opaque the reflective layer should be.

# Request

Add Building Fabrication window PBR controls to enable/disable and configure reflective window material per floor, with a clear override model: per-building/per-floor settings override global settings, and global settings apply only when a building has not specified its own window reflective settings.

Tasks:
- Override model:
  - Add window reflective configuration at the building level (and per floor as the primary control surface).
  - Ensure per-floor (or building) window settings override the global window reflection configuration.
  - Global settings should be used only when a building has not specified its own window reflective configuration.
- UI/UX in Building Fabrication:
  - Add a “Window PBR” section inside the existing Window section.
  - Provide an enable/disable toggle for reflective material for windows (per floor).
  - Expose the same configuration fields that exist in the global window reflection settings so users don’t have to learn two systems.
  - Add controls to:
    - Move the reflective material layer in/out relative to the window (clear, intuitive depth/offset control).
    - Set opacity of the reflective material layer.
- Rendering behavior:
  - Ensure changes apply only to window glass (not frames/muntins) and behave consistently across window types.
  - Ensure disabling reflective material produces a sensible non-reflective look (no black reflections, no errors).
- Persistence/export:
  - Ensure per-floor reflective settings are stored in Building Fabrication state and exported building configs.
  - Maintain backward compatibility with older configs (missing override fields fall back to global defaults).

Nice to have:
- Add “inherit global” vs “override” UI state so it’s obvious when a floor is using global settings.
- Add a quick “copy settings to all floors” action to speed up configuration.

## Quick verification
- In Building Fabrication:
  - Configure two floors with different reflection/opacity/offset settings and confirm both render distinctly.
  - Toggle “inherit global” (or equivalent) and confirm the building uses global settings when overrides are unset.
- Export and reload:
  - Per-floor overrides persist and do not regress to global unintentionally.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_214_BUILDINGS_building_fabrication_per_floor_window_reflective_overrides_and_opacity_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (done)
- Added building-level and per-floor window reflection overrides (`windowVisuals`) with clear precedence over global window visuals.
- Extended Building Fabrication UI with “Window reflections” controls (inherit/override, enable toggle, copy-to-all-floors, and PBR sliders including opacity + layer offset).
- Ensured global runtime window visuals updates do not override per-building/per-floor window override materials and included `windowVisuals` in export serialization.
