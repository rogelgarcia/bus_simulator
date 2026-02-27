# DONE

## Completed Summary
- Added a new `Ribbon` wall decorator type with skirt-style surround generation rules for face/corner modes and wall-safe outward placement.
- Added dedicated Ribbon configuration metadata and defaults (preset/offset/near-edge) initialized with the same numeric values as Simple Skirt presets.
- Added a shared ribbon pattern catalog with seeded grayscale patterns (`Circle`, `Flat-base X`) and thumbnail preview metadata.
- Added metadata-driven thumbnail enum picker support in the wall-decoration configuration UI and wired Ribbon `Pattern` to that picker.
- Added runtime grayscale-to-normal generation for Ribbon and applied it as normal-only detail on ribbon surfaces across texture/color/match-wall material modes.
- Added/updated tests and spec coverage for Ribbon catalog metadata, UI configuration behavior, and generated ribbon normal-map output.

# Problem

The wall decoration system needs a new decorator type called `Ribbon` that behaves like the skirt-style surround geometry but adds decorative surface relief using a pattern-driven normal texture workflow.

# Request

Add a `Ribbon` wall decorator style with dedicated configuration and pattern selection, using generated normal detail from grayscale patterns.

Tasks:
- Add a new wall decorator style named `Ribbon`, based on skirt-like surround geometry rules (outside the wall, no wall overlap, corner-compatible).
- Keep ribbon presets as a dedicated config group for this style, but initialize them with the same values currently used by skirt presets.
- Implement pattern-driven normal detailing for ribbon surfaces:
  - pattern source is a grayscale image,
  - resulting ribbon detail is applied through normal mapping (high-relief look without displacement geometry changes).
- Add a configuration section to choose the ribbon pattern via thumbnail picker using grayscale preview images.
- Seed the ribbon pattern catalog with at least:
  - `Circle` pattern (simple circular motif),
  - `Flat-base X` pattern (X motif where the base of the X is flat).
- Keep the initial implementation focused on normal-map detail only (no displacement geometry and no parallax requirement in this pass).

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_439_BUILDINGS_wall_decoration_add_ribbon_pattern_normal_with_thumbnail_picker_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_439_BUILDINGS_wall_decoration_add_ribbon_pattern_normal_with_thumbnail_picker_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
