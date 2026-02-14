DONE

#Problem

Many important rendering/gameplay controls can be tuned via the Options panel (key `0`), but they’re currently persisted only in the browser’s localStorage. This makes it hard to:

- Set new project-wide defaults based on tuned values
- Share a “good config” across machines
- Version control presets and quickly roll back/compare

# Request

Add an export workflow for Options configurations so tuned settings can be saved to a file (or JSON) and used to update project defaults intentionally.

Tasks:
- Define a single “Options preset” JSON schema that captures the tunable settings we care about (lighting, bloom, color grading, sun flare, building window visuals, road materials/markings, etc.) while remaining backward compatible as fields evolve.
- Add an **Export** action in the Options UI that:
  - Produces a JSON payload of the current draft settings (including live-tuned values).
  - Offers a download (ex: `bus_sim_options_preset.json`) or copies to clipboard.
  - Clearly indicates which settings are included and which are not (avoid surprises).
- Add a developer-only workflow to apply an exported preset as new project defaults:
  - Provide a script under `tools/` (or a documented manual step) to convert a preset JSON into updates to default settings files/constants.
  - Ensure outputs are deterministic and easy to review in git diffs.
- Safety:
  - Validate and sanitize imported settings (clamp ranges, ignore unknown keys, reject malformed input).
  - Include a version field and migration handling for older presets.
- Documentation:
  - Add a short doc describing how to export, import, and promote a preset to project defaults.

Nice to have:
- Allow multiple named presets (ex: “Bright Noon”, “Cinematic”, “Perf-safe”) stored under a `presets/` folder and selectable in UI.
- Add a “Reset to project defaults” button distinct from “Reset to current built-in defaults” if those diverge.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_197_TOOLS_export_import_options_presets_for_default_tuning_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (done)
- Added an Options preset schema with export/import sanitization + migration helpers.
- Added `Import`/`Export` actions to the in-game Options UI (downloads JSON and supports file import).
- Added a dev tool to promote a preset JSON into project default constants (dry-run by default, `--write` to apply).
- Added docs + tool registry entry, and a Node unit test suite for the preset workflow.
