# DONE

#Problem

GTAO alpha handling appears ineffective for foliage/cutout materials: areas that should be fully transparent (alpha = 0) still contribute AO shading.

# Request

Fix GTAO alpha handling so cutout transparency is respected and AO contribution matches visible coverage.

Tasks:
- Ensure alpha-0 regions do not generate AO contribution for cutout foliage/alpha-card geometry.
- Ensure both supported alpha handling modes behave distinctly and match their intended outcomes.
- Validate behavior on real tree/leaf assets and representative alpha-cutout content.
- Keep AO stable under camera motion and avoid introducing new halo/noise artifacts.
- Add deterministic repro/coverage to prevent regressions in foliage alpha AO behavior.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line.
- Rename the file in `prompts/` to `prompts/AI_DONE_graphics_322_MATERIAL_gtao_alpha_handling_not_respecting_cutout_transparency_DONE.md`.
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change).

## Summary (implemented)

- Refactored AO alpha-cutout logic into a dedicated helper module and fixed override-material resolution so GTAO/SSAO hooks apply consistently in override render paths.
- Updated AO override material priming to always enable alpha texture sampling (`map`/`alphaMap`) and improved cutout-candidate detection for tagged foliage and transparent alpha-card materials.
- Added deterministic AO foliage debugger hooks and a synthetic split-alpha cutout card, while still validating real tree leaf textures in the repro scene.
- Added deterministic regression coverage with a new node-unit suite for AO alpha handling helpers and a headless GTAO alpha-handling e2e test.
- Switched gameplay tree leaf rendering from blended transparency to strict alpha-test cutouts to eliminate residual in-air foliage shading artifacts that are outside AO pass compositing.
- Added cutout texture edge-bleed preprocessing for gameplay tree leaves and tightened leaf alpha-test threshold to reduce background-dependent dark fringe artifacts on buildings.
- Hardened gameplay leaf alpha to a binary cutout mask, disabled leaf mipmaps on cutout cards, and enabled alpha-to-coverage to minimize building-background halo/fringe artifacts in non-AO paths.
- Switched leaf cards to front-face cutout rendering and strengthened foliage-material remapping heuristics during FBX import to avoid opaque non-foliage material assignments inside canopies.
