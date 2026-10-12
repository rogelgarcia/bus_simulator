DONE

# Implementation — 2026-10-12

- Reused the Grass tab with Texture / 3D, 3D defaults, per-mode future-details text, local persistence and preset import/export.
- Integrated immediate previews, Save, Cancel, Reset and Use defaults through the existing Options lifecycle.
- Shared the current baked bus-lab appearance, field batching and LOD0–5 selection/transitions with production gameplay.
- Registered and published a 26,868,480-byte authenticated runtime payload; gameplay fetches no lab modules or test-artifact source files.
- Added camera-following detail fields with stable world placement, distant canopy batches and shared road/sidewalk/building/reservation masking at the city surface height.
- Integrated prepared lighting, static and moving-caster visibility, game loading readiness, mode suspension and scene disposal/re-entry.
- Removed sidewalk edge-blend geometry, material/shader plumbing, settings, preset/tool/export adapters, dedicated builder tests and active specification.
- Updated canonical grass/bake specifications and stale Options/lab test assumptions; recognized the foliage/bark classes already present in the shared material catalog so the current game and lab can boot.

## Validation

- 54 focused Node tests passed: grass settings, asphalt sanitization, Options presets/default promotion, shared transition selection, illumination reconstruction and bake framework.
- All 10 relevant browser cases passed across `grass_gameplay_modes`, `grass_debug_v2_grass`, `options_live_settings`, `options_use_defaults` and `options_ui_tab_modules_refactor_smoke`.
- Gameplay verified saved Texture reload without loading 3D assets, live preview/revert, reset, repeated switching, normal scene exit/re-entry, camera-window movement, physical driving, ground height and road/building exclusion samples. No browser/shader errors or production authoring requests were recorded.
- External-shadow pixel comparison affected 6,130 grass pixels with a maximum RGB-average drop of 69; dynamic shadow generations changed after moving the bus.
- Both baked/default and original comparison bus-lab strategies passed; the baked regression rendered every LOD and verified shadows.
- Final registered bake published after SHA-256, size, all-six-LOD fresh-loader and input-stability gates. Payload SHA-256: `2edb472e86216b31a89b27b674daa3c7d55c8dd1a13bd80ac187293127affe07`.
- `git diff --check` passed. No commits were created.
- The full browser core run had 526 passing checks and six unrelated failures. A read-only browser routing comparison using original HEAD source reproduced the same six failures: sun elevation default, three building geometry assertions, map debugger disconnected sidewalk contours and fog distance default. The shared material catalog compatibility fix was retained in that baseline to permit startup; the checkout was never reset.

## Performance and limits

Same browser, RTX 3060 via ANGLE D3D11, 1600×900, current source graphics defaults,
high shadows, requested MSAA 8×, high GTAO every frame, sun bloom enabled, default
daylight, BigCity2. Each mode received 30 rendered warm-up
frames and 120 measured rendered frames. Frame time is mean requestAnimationFrame
cadence, FPS is its reciprocal; draws/triangles are maximum whole-frame submitted
counts including rendering passes. These are frame-cadence observations with a
browser/display cap, not isolated GPU timings or an optimization speedup claim.

| View | Mode | Mean frame ms | FPS | p95 ms | Draw calls | Triangles |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Civic center front | Texture baseline | 17.62 | 56.75 | 18.10 | 2,305 | 5,254,368 |
| Civic center front | New 3D | 17.78 | 56.26 | 18.10 | 2,851 | 8,843,876 |
| Close lawn, camera (-159.5, 0.82, 69.5) | Texture baseline | 17.61 | 56.77 | 18.10 | 2,397 | 5,229,973 |
| Close lawn, same camera | New 3D | 17.58 | 56.89 | 18.10 | 2,971 | 11,692,405 |

GPU pass time: not measured with an isolated timer query. Moving/far views were
inspected and captured but do not have sampled FPS claims. The new 3D mode adds
substantial geometry and draw work despite similar cadence on this machine.
The installed city illumination package reports `city_map_not_current`, and its
visibility map is unavailable; tests used the supported Current/live fallback.
This task does not regenerate those city-wide packages. Their publication gates
remain intact. Current gameplay terrain is flat; arbitrary heightfield placement
is outside that city's existing terrain contract.

## Evidence

All generated evidence is gitignored under `tests/artifacts/screens/grass/ai611_game_migration/`:

- `gameplay-3d.png`, `gameplay-texture.png`, `options-3d.png`, `options-texture.png`.
- `gameplay-grass-close.png`, `gameplay-texture-close.png`, `gameplay-near.png`, `gameplay-transition.png`, `gameplay-distant.png`, `gameplay-after-driving.png`.
- `performance.json`, `core-baseline.json`, `core-tests-console.log`.
- Bus-lab regression captures: `tests/artifacts/screens/grass_debug_v2/roadside_baked/`.
- Final asset publication: `tests/artifacts/screens/ai556_bake_framework/run-1791830610300-22900-7d9b1492/summary.json`.

# Original problem

The new grass system is available in the Grass Debug v2 lab with the city bus, but it has not been integrated into actual gameplay. The game already has a Grass options tab, currently containing the sidewalk grass-edge dirt-strip toggle. That edge-blend feature and its implementation should be removed. Players need to choose between textured ground and the new 3D grass, with 3D as the game default.

# Request

Migrate the current bus-lab grass renderer into the actual game and expose it through the existing Grass configuration tab. Provide exactly two grass rendering modes, **Texture** and **3D**, and prepare a mode-dependent details section for future settings.

Tasks:
- Reuse the existing Grass tab rather than creating a duplicate. Remove its existing Sidewalk Edge Blend section and sidewalk grass-edge dirt-strip option.
- Remove the sidewalk grass-edge dirt-strip implementation as well: its dedicated rendering code, mesh/material/shader paths where exclusive to this feature, configuration defaults and sanitization, options/preset/persistence plumbing, tooling support, and obsolete references. Do not leave it hidden or merely disabled. Older saved settings/presets containing the removed field must still load safely without recreating or re-exporting the feature. Preserve shared infrastructure still used by other features and the terrain coverage/exclusion boundaries needed by the new grass system.
- Add a clearly labeled grass mode selector with **Texture** and **3D** choices. This is a rendering-mode choice; do not expose the lab's experimental renderer versions or forced LOD selectors as additional game modes.
- Make **3D** the default for fresh settings, reset-to-defaults, and older saved settings that have no grass mode. Preserve an explicitly saved supported mode, including Texture, across reloads.
- In **Texture** mode, render grass areas as textured terrain without standing grass geometry or active 3D grass update/render work. Maintain the intended grass ground coverage and existing terrain boundaries.
- In **3D** mode, use the latest baked grass strategy that the bus lab currently loads by default, including its shared detailed appearance, automatic LOD selection, transitions, prepared lighting and palette corrections. Do not substitute the old v1 grass engine or the lab's preserved `?grass=current` comparison strategy.
- Integrate the new renderer with real game terrain and grass placement, the active gameplay camera, and the game lighting/shadow lifecycle. Respect roads, sidewalks, buildings, terrain heights, and other existing coverage exclusions. Grass must remain correctly placed as the bus and camera move through the playable world; do not copy the lab's fixed roadside field arrangement into the game.
- Keep the bus lab usable as a reference and share the underlying grass rendering behavior between lab and gameplay. Production gameplay must not require lab HTML, diagnostic UI, benchmark routes, or a second scene to run. Avoid overlapping old and new grass renderers.
- Follow the game's existing options behavior for applying, saving, cancelling/reverting previews, and resetting settings. Switching Texture to 3D and back must update the visible scene correctly, without duplicate grass, stale shadows, or accumulating resources. Scene exit/re-entry must also remain reliable.
- Include a details section whose content follows the selected mode. For this task, use a simple mode-specific empty state explaining that detailed settings will be added later. Do not invent density, quality, distance, or material controls yet. Keep unrelated shared options separate from that future details section.
- Update the relevant specifications under `specs/` to describe the gameplay integration, both modes, default/persistence behavior, and the deferred details controls. Retire the removed edge-blend feature's active specification and update affected tests and tooling expectations.

## Repository context

- Bus lab: `debug_tools/grass_debug_v2.html`, with its scene and rendering modules under `src/graphics/gui/grass_debugger_v2/`. Trace the active scene's renderer before extracting or integrating shared behavior; this folder also contains older experiments.
- Current appearance and LOD contracts: `specs/grass/GRASS_DEBUG_V2.md` (especially "Latest baked bus grass") and `specs/grass/GRASS_BAKED_LIGHTING_LAB.md`.
- Existing Grass tab: `src/graphics/gui/options/tabs/renderGrassTab.js`; options lifecycle and persistence are handled by the surrounding options modules.
- Edge-blend removal starts with `src/graphics/visuals/city/SidewalkEdgeDirtStripVisuals.js`, `RoadEngineRoads.js`, and `AsphaltNoiseSettings.js` in the same directory. Trace `sidewalkGrassEdgeStrip` and `SidewalkGrassEdgeDirtStrip` throughout source, tests, and tools, including preset promotion. The existing feature spec is `specs/graphics/sidewalk_grass_edge_dirt_strip.md`.
- Follow `ai_rules/PROJECT_RULES.md`, the project layering rules, and `ai_rules/TESTING_RULES.md`. If new offline baking is actually required, use the registered `node tools/bake.mjs` framework and preserve its validation/publication gates.

## Validation and acceptance

- Verify fresh/default/reset settings select 3D; older settings without the new field migrate to 3D; an explicit Texture choice persists after reload. Cover this configuration behavior with focused tests.
- Confirm the old edge-blend option, rendering path, and feature-specific settings are removed. Verify old settings/presets containing `sidewalkGrassEdgeStrip` load safely and do not restore the strip, including through preset import/export and defaults promotion.
- Exercise both modes in actual gameplay, repeated mode changes, options apply/cancel behavior, and scene re-entry. Confirm Texture has no active standing-grass rendering and 3D uses the new renderer without duplicate legacy coverage.
- Inspect grass while driving and moving the camera through near, transition, and far distances. Verify terrain alignment, exclusion boundaries, lighting/shadows, and consistency with the current bus-lab appearance. Confirm the original bus lab still works.
- Capture actual gameplay in both modes and the Grass tab with each mode selected. Save screenshots and any generated logs/reports under `tests/artifacts/screens/grass/ai611_game_migration/`, keeping them gitignored and untracked.
- Check representative gameplay frame time/FPS and grass workload to identify material regressions. Report measurement conditions and any unresolved limitations; if performance optimization is needed, include comparable before/after measurements rather than projections.

## On completion

- Mark this AI document as DONE in the first line.
- Rename it in `prompts/` to `AI_DONE_grass_611_CITY_migrate_new_grass_to_game_with_texture_and_3d_modes_DONE.md`.
- Do not move it to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change, the validation results, and paths to the generated evidence.
- For any optimization/performance work, include a same-condition before/after table with frame time, FPS, and relevant workload metrics. Identify hardware, resolution, graphics settings, workload/camera, warm-up, sample count, and statistic used. Mark unavailable metrics as `not measured` with a reason.
