# Problem

The baked illumination framework is an optional add-on and may have no payload for the current city or sun profile. Players still need the existing engine to work normally, and they need a clear runtime choice without restarting the page. A half-loaded or stale baked state must never leave the scene partially lit or silently change the user's current shadow/AO settings.

# Request

Expose the optional illumination capability through runtime Options, profile/status diagnostics, and a coherent activation workflow. Make current live rendering, baked rendering, and automatic fallback switchable during gameplay while preserving transactional Options behavior and atomic resource lifecycle.

## Execution gate

- Do not start until AI 527 through AI 534 are DONE.
- Use the lifecycle/mode controller from AI 530 and the final channel/preset decisions from AI 531–534. Do not redesign shader algorithms, bake formats, or AO composition here.

Tasks:
- Add an Options control for illumination mode with clear semantics:
  - `Current`: always available; existing live lights, shadows, and AO operate as before and no baked asset is required;
  - `Baked`: requests the exact compatible baked profile and activates only after complete validation/loading; otherwise remains on Current with a specific visible reason;
  - `Auto`: uses a complete compatible baked profile when available and Current otherwise.
- Apply mode changes at runtime without page refresh. While baked resources load, keep the complete Current scene active; switch atomically on a frame boundary only when every required channel is ready.
- Switching back to Current must immediately restore the current-engine render path and the user's current shadow/AO/lighting settings, then dispose or retain optional resources according to the documented cache policy without leaks.
- Preserve Options Save/Cancel/Reset behavior, entry-state restoration, preset import/export, persistence, and live preview conventions.
- Keep independent settings for current and baked modes where values differ. Changing modes must not overwrite the inactive mode's saved settings.
- Expose named baked profile status and exact matching rules for city, sun azimuth/elevation, environment/IBL, channel inventory, and bake version.
- Define behavior when the user changes sun/atmosphere settings during baked mode:
  - switch to another exact compatible baked profile if already validated;
  - otherwise stay/return atomically to Current;
  - never continue using a stale approximate profile without an explicitly supported tolerance/profile rule.
- Treat missing bake data as normal availability information, not a boot failure. Display concise states such as unavailable for city/profile, loading, ready, active, stale, unsupported device, corrupt, and fallback reason without repeating notifications every frame.
- Disable or explain Baked selection when capability is known unavailable; do not present a selectable mode that silently produces incomplete lighting.
- Add developer diagnostics for source/profile/compiler hashes, payload/channel versions, validation state, lifecycle timing, active mode, fallback reason, loaded/resident chunks, CPU/GPU memory, and per-channel debug views created by earlier AIs.
- Connect the documented offline workflow from exporter through Blender compiler, package validation, and promotion. Blender remains an offline development dependency and is never invoked from normal game Options.
- Provide a safe reload/revalidate action for developers without requiring full page reload, while preventing partially promoted data from activating.
- Test opening/closing Options during loading, rapid mode changes, Save/Cancel/Reset, city/state changes, sun-profile changes, missing files, corruption, unsupported capabilities, load cancellation, lost context/resize where relevant, and repeated activation/deactivation.
- Verify current-mode screenshots and performance remain equal to the pre-framework current baseline within the accepted tolerance when baked assets are absent and present-but-inactive.

Acceptance requirements:
- The game always works through Current mode, including builds/distributions with no baked assets and machines with no Blender installation.
- Current/Baked/Auto can be changed in gameplay without restart and without a mixed-lighting frame.
- Baked mode cannot activate stale, partial, corrupt, incompatible, or unsupported data.
- Options transactions restore both rendering and persisted settings correctly.
- Availability and fallback reasons are clear but non-spamming.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_535_UI_optional_baked_illumination_runtime_modes_and_diagnostics_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking UI/runtime modules, lifecycle/status model, offline workflow documentation, diagnostics, tests, and screenshots for every state.
- Include same-condition Current-active, Baked-active, Auto-current, Auto-baked, loading, and fallback timing/memory results: frame time/FPS, switch latency, fetch/hash/decode/upload time, peak/resident CPU/GPU memory, hardware/browser, resolution/settings, warm-up, sample count, statistic, and variance. Mark unavailable metrics as `not measured` with a reason.
