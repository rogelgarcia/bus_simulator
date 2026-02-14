DONE

#Problem

We have a tuned Options preset for the new asphalt look (`downloads/bus_sim_options_preset_new_asphalt.json`), but current defaults are still whatever is hard-coded in the app. Options tuning is persisted only in browser localStorage, so the “good” configuration isn’t becoming the project-wide default for fresh installs, and it’s hard to ensure everyone is using the same baseline.

# Request

Use `downloads/bus_sim_options_preset_new_asphalt.json` as the new built-in default configuration for the app (i.e., the defaults used when there is no localStorage override).

Tasks:
- Treat `downloads/bus_sim_options_preset_new_asphalt.json` as the source of truth and update the project’s default settings constants accordingly (lighting, bloom, color grading, sun flare, building window visuals, road/asphalt/markings variation controls, and any other settings present in the preset).
- Ensure the Options “Reset” behavior resets to these new defaults.
- Handle existing users gracefully:
  - If localStorage contains older defaults (unchanged by the user), migrate them forward to the new defaults where appropriate.
  - Avoid clobbering user-customized settings.
  - Document the migration rules/heuristics used.
- Keep the preset file as a reference input (do not load from `downloads/` at runtime); ensure runtime defaults are defined in code in the normal locations.
- Add a small verification step:
  - A quick dev assertion/test or a deterministic debug readout that confirms the resolved defaults match the preset values (for the settings included).
- Document how to repeat this workflow in the future (tune in Options → export preset → promote to code defaults).

Nice to have:
- Add a dev-only script under `tools/` that can ingest a preset JSON and emit code patches (or a report) for default constants so promoting presets is repeatable and reviewable.
- Add a “Reset to project defaults” action distinct from “Clear local overrides” if needed.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_200_PROJECTMAINTENANCE_apply_bus_sim_options_preset_new_asphalt_as_defaults_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Migration rules / heuristics (done)
- Each settings group is persisted in its own localStorage key (lighting/bloom/colorGrading/sunFlare/asphaltNoise).
- On load: if the saved settings match the previous built-in defaults for that group exactly, they are migrated to the new defaults and written back to localStorage.
- Otherwise, the user’s saved settings are left untouched (no partial/field-by-field migration) to avoid clobbering custom tuning.

## Workflow: promote a preset to defaults (done)
1) Tune settings in-game via Options (key `0`).
2) Export a preset JSON (Options → Export).
3) Copy/keep the preset under `downloads/` as the reference input for the promotion.
4) Promote values into code defaults (update `*_DEFAULTS` constants in the settings modules).
5) Run `npm run test:node` (includes the preset-vs-defaults verification test).
6) Run `npm run test:headless` locally to confirm rendering behavior (ex: road markings screenshots).

## Summary (done)
- Promoted `downloads/bus_sim_options_preset_new_asphalt.json` values into code defaults (lighting/bloom/color grading/sun flare/asphalt noise).
- Added safe “legacy defaults → new defaults” migration on localStorage load for each settings group.
- Added a Node unit test to verify code defaults remain in sync with the preset JSON.
- Updated headless road markings regression test to load default configs and capture before/after screenshots.
