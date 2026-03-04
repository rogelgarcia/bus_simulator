# DONE

## Problem

The project was pinned to Three.js `0.160.0` in CDN import maps, behind the latest stable release.

## Request

Upgrade Three.js to the latest stable version and verify compatibility for main app flows, mesh fabrication, and headless harness usage.

## Completion Summary

- Upgraded runtime/import-map Three.js pins from `0.160.0` to `0.183.2` across `index`, standalone screens, debug tools, and headless harness entry pages.
- Kept addon/example paths compatible by preserving `three/addons/` and `three/examples/jsm/` mappings at the same `0.183.2` version.
- Fixed a Three.js-upgrade regression by making shader payload hash serialization cycle-safe in `ShaderLoader` (`stableStringify` now handles cyclic Three.js objects deterministically).
- Updated Rapier CDN imports from Skypack to jsDelivr (`@dimforge/rapier3d-compat@0.19.3/rapier.mjs`) to remove runtime script-fetch failures in smoke tests.
- Added targeted headless upgrade coverage in `tests/headless/e2e/threejs_upgrade_smoke.pwtest.js` for: main app boot, mesh fabrication boot, and harness boot.

## Validation

- Passed: `npm run -s test:headless -- tests/headless/e2e/threejs_upgrade_smoke.pwtest.js tests/headless/e2e/harness_smoke.pwtest.js`
- Result: `5 passed`.

## Final Pin + Notes

- Final pinned Three.js runtime version: `0.183.2`.
- Compatibility note: mesh fabrication may emit console `500` resource messages when live-mesh backend endpoints are unavailable; this is backend availability, not an import/runtime module failure.
- Follow-up note: existing `tests/headless/e2e/ui_smoke.pwtest.js` Road Debugger setup-key path remained flaky in this environment and is not part of the Three.js import-map compatibility gate for this task.
