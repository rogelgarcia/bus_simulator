# Problem

The baked illumination framework is an optional add-on and may have no payload for the current city or sun profile. Players still need the existing engine to work normally, and they need a clear runtime choice without restarting the page. A half-loaded or stale baked state must never leave the scene partially lit or silently change the user's current shadow/AO settings.

# Request

Expose the optional illumination capability through runtime Options, profile/status diagnostics, and a coherent activation workflow. Make current live rendering, baked rendering, and automatic fallback switchable during gameplay while preserving transactional Options behavior and atomic resource lifecycle.

## Execution gate

- Do not start until AI 527 through AI 534 and AI 546 are DONE.
- Use the lifecycle/mode controller from AI 530, AI 531 Part A's deterministic
  channel/package contract, AI 546's final static-sun visual disposition, and
  the final channel/preset decisions from AI 532–534. Do not redesign shader
  algorithms, bake formats, or AO composition here.

## Incremental progress — 2026-09-03

The user authorized a staged AI 535 slice before AI 533/534: expose the
default-off AI 531/532 baked-shadow path now, while keeping this prompt open for
direct/indirect lighting and the complete Current/Baked/Auto workflow.

- [x] Add a **Baked lighting** Options tab with a concise performance/fallback explanation.
- [x] Add persisted, live-previewed **Enable baked shadows** intent with Save/Cancel/Reset and preset support.
- [x] Disable the legacy shadow controls while baked shadows are requested without changing their retained values.
- [x] Add exact city/sun package lookup, atomic AI 530/531 activation, and visible Current fallback status for missing, stale, invalid, or unsupported data.
- [x] Keep baked shadows off by default so normal startup has no package fetch or baked-asset dependency.
- [x] Move the staged shadow package index and generator output to `assets/baked_lighting/shadows/`, while keeping evidence under `tests/artifacts/`.
- [x] Retain a validated/uploaded/compiled exact shadow publication while the user toggle is off, then re-enable it through a uniform-only cached apply with no repeat fetch, decode, upload, or city-shader compilation.
- [ ] Add direct baked-light controls after AI 533 records its promote/defer decision.
- [ ] Add indirect baked-light and AO policy controls after AI 533/534 are complete.
- [ ] Complete the original Current/Baked/Auto diagnostics, reload/revalidate, lifecycle matrix, screenshots, and performance measurements below.

Focused validation for this slice passes: 21 settings/preset/engine-lifecycle
tests and the real-gameplay Baked lighting Options test (about 39 seconds).
Final captures are under `tests/artifacts/screens/illumination_535/`. The runtime
also invalidates in-flight index/package work before engine disposal. On
2026-09-04, the runtime, offline generator, validators, and release finalizer
were moved to the `assets/baked_lighting/shadows/` authority; the existing
eight publications were copied there without rerunning Blender.

On 2026-09-04, the baked-shadow lifecycle gained an explicit inactive cache.
Turning the option off restores legacy shadow ownership on the frame boundary
but keeps the exact package resource set and compiled receiver shader variant
resident. Re-enabling the same canonical request performs only the cached
activation transaction. Identity mismatch, live drift, uninstall, context
loss, or teardown still invalidates and retires the cache exactly once.
The focused cache/lifecycle/settings/graphics checks pass 60/60, including a
canonical reordered-request reuse test proving one fetch/upload allocation
across disable and re-enable and one final disposal at teardown.

On 2026-09-04, baked-shadow activation also took explicit ownership of the
legacy single/CSM shadow-map pass. The transition renders one empty legacy map
set after City and registered moving casters are suppressed, then freezes every
live sun shadow with per-light `autoUpdate=false` and `needsUpdate=false`.
This preserves the CSM light/shader shape while preventing later gameplay
renders from binding or clearing those legacy shadow targets. Returning to
Current restores the captured per-light update policy and forces one fresh live
map rebuild. The focused deterministic lifecycle/graphics/tool suite passes
118/118; the real-gameplay two-vehicle validation also passes and observed zero
legacy sun-shadow target binds in a steady baked frame. A separate pinned-Three
browser check passes with two real CSM cascades: both targets remain unbound in
the steady baked render and both original per-light update policies are restored
for Current.

## Implementation issues — 2026-09-03

- The sandboxed browser could not load the game's existing Three.js CDN modules
  (`ERR_NETWORK_ACCESS_DENIED`), so the focused check was rerun with approved
  network access. No dependency or Blender download was needed.
- The first shadow-pass gameplay rerun likewise remained on the title screen
  until its 180-second launch wait expired because the sandboxed browser could
  not complete the CDN-backed startup. With approved network access it reached
  baked gameplay; an initial test-only inventory assertion then omitted the
  non-CSM `city.sun`. The corrected exact runtime inventory (`city.sun` plus any
  CSM lights) passed. The final GPU run took about 4.6 minutes under the reported
  machine contention and produced the existing AI 532 gameplay captures.
- Physical Playwright clicks stalled while the GPU-rendered gameplay frame was
  busy. The focused test now launches a paused deterministic gameplay pose,
  stops the render loop after entry, and dispatches the same DOM change/click
  events used by the existing Options test suite. It passes in about 39 seconds.
- The older all-tabs Options smoke still uses a four-minute keyboard/physical-
  click flow and made no progress for more than three minutes under the same
  machine contention, so it was stopped. The focused AI 535 test covers the new
  tab and its Save/Cancel/Reset compatibility without that nondeterminism.
- This slice validates missing-package fallback without loading the active
  high-elevation package (about 505 MiB). The complete eight-package set is
  3,023,798,656 bytes (about 2.82 GiB); the complete copied resumable asset
  publications are 9,043,884,819 bytes (about 8.42 GiB) because they also keep
  canonical RG8 and tile interiors. Full baked-active screenshots and
  performance measurements remain part of the open release-validation work
  below.
- The copied packages pass byte-for-byte SHA-256 comparison against all eight
  source `.ilpkg` files, and their rewritten index/publication/certification
  paths are internally consistent. A real offline-generator resume correctly
  refused the old publications because the authenticated Blender renderer
  script changed from SHA-256 `05bb7666...` to `bbbc6687...` after those bakes.
  This is a freshness guard, not a copy failure. The user-requested existing
  maps remain available to the default-off staged runtime; a new certified
  bake from the current renderer script must use a fresh asset output root and
  be promoted separately rather than forging the old input identity.

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
- Treat missing bake data as normal availability information, not a boot failure. Display AI 527's six public states and concise structured phase/reason text without repeating notifications every frame: for example loading/ready-to-commit, unavailable/unsupported-device, failed/corrupt, stale/profile-mismatch, and fallback with its retained cause.
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
