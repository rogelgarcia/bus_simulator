# DONE
#Problem

The PBR texture packs are too large to keep in the repository. We still want to use these materials locally in the app (buildings, inspectors, and other tools), but storing the full-resolution PBR maps in git will bloat the repo and slow down development.

# Request

Move all heavy PBR texture assets into a dedicated local-only folder `assets/public/pbr/` and ensure that folder is ignored by git, while keeping the app functional and able to reference these materials when the folder is present.

Tasks:
- Create `assets/public/pbr/` as the canonical location for heavy PBR textures used by the app.
- Update `.gitignore` so `assets/public/pbr/` (and its contents) are excluded from version control, even though `assets/public/` is otherwise tracked.
- Relocate existing PBR texture assets currently stored under tracked paths (e.g., any large “pbr” texture subfolders under `assets/public/`) into `assets/public/pbr/` and update any in-code references/catalogs accordingly.
- Ensure materials still work across the app when `assets/public/pbr/` exists locally:
  - Buildings can use PBR materials where applicable.
  - Inspector/texture tooling can preview and inspect those materials.
- Ensure the app behaves gracefully when `assets/public/pbr/` is missing (e.g., in a fresh clone):
  - No console errors on load.
  - Missing PBR textures fall back to lightweight placeholders or non-PBR alternatives suitable for development.
- Add lightweight, repo-safe metadata and/or previews that remain committed (e.g., small thumbnails, ids, labels, license/attribution files) so tools can still list materials even if the heavy maps are not present.

Verification:
- Repo is not bloated by PBR texture binaries after the change (PBR binaries live only in `assets/public/pbr/` and are ignored by git).
- App loads without console errors whether or not `assets/public/pbr/` exists.
- When `assets/public/pbr/` exists, PBR materials are usable in buildings and previewable in inspector tooling.
- Browser tests still pass (`tests/core.test.js`).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_118_MATERIAL_move_pbr_textures_to_gitignored_assets_public_pbr`
- Provide a summary of the changes made in the AI document (very high level, one liner)

# Summary
Moved heavy PBR maps into local-only `assets/public/pbr/` (gitignored), added runtime availability gating + placeholders, and updated catalogs/tools to keep the app usable with or without the folder.
