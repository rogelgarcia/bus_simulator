DONE

#Problem

When any post-processing or shader-based rendering path is enabled, the app can lose the effective MSAA path and distant edges/lines become jagged and shimmer. There is no dedicated gameplay Options area to control anti-aliasing modes and tune quality/performance tradeoffs.

# Request

Add a new gameplay Options tab named **Graphics** and provide anti-aliasing controls that let me choose between:
- WebGL2 multisampled (MSAA) rendering for the post-processing pipeline (when supported),
- SMAA,
- FXAA,
- or no AA.

The UI should support choosing **MSAA or nothing**, or switching directly to the other AA methods, with sensible parameters exposed for each mode.

Tasks:
- Add a **Graphics** tab to the in-game Options menu.
- Add an Anti-aliasing section with a clear mode selection model:
  - Support **Off**, **MSAA (WebGL2 multisampled)**, **SMAA**, and **FXAA**.
  - Ensure modes are mutually exclusive (no confusing combinations), unless a combination is explicitly intentional and clearly labeled.
  - Make it possible to use **MSAA or nothing**, or switch directly to **SMAA/FXAA**.
- MSAA (WebGL2 multisampled) support:
  - Add a toggle or mode option that enables multisampled rendering for the post-processing pipeline when WebGL2 is available.
  - Provide a sample count control (e.g., 2/4/8) with safe defaults.
  - If WebGL2 multisampling is not supported on the current device/browser, disable the option and show a clear “not supported” message.
  - Ensure switching MSAA on/off updates rendering correctly without requiring a full page refresh (or document if a refresh is required).
- SMAA support:
  - Add a toggle/mode option to enable SMAA.
  - Expose any meaningful SMAA parameters used by the implementation (quality preset/edge detection threshold/search steps, etc.), with defaults that don’t over-blur.
- FXAA support:
  - Add a toggle/mode option to enable FXAA.
  - Expose meaningful FXAA parameters (e.g., edge thresholds) with sensible defaults.
- Persistence:
  - Ensure the AA mode and its parameters persist like other Options settings.
  - Ensure they are included in Options export/import preset workflows (if applicable), with backward compatible defaults.
- Safety and performance:
  - Ensure AA options don’t crash when post-processing is disabled/enabled.
  - Avoid large performance regressions at default settings; use conservative defaults.

Nice to have:
- A small live readout in the Graphics tab showing the currently active AA mode and whether MSAA is actually active (supported + enabled).
- Tooltips or short helper text describing the quality/perf tradeoffs (MSAA vs SMAA vs FXAA).

## Quick verification
- With AA set to Off / MSAA / SMAA / FXAA:
  - Confirm the setting takes effect immediately (or follows documented apply/restart behavior).
  - Confirm jagged edges/shimmer is reduced appropriately when AA is enabled.
  - Confirm no console errors when toggling post-processing features on/off.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_218_UI_options_graphics_tab_antialiasing_msaa_smaa_fxaa_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (done)
- Added a new persisted `antiAliasing` options group (localStorage + preset export/import) supporting Off/MSAA/SMAA/FXAA with tunable params.
- Added a new **Graphics** tab to the in-game Options UI with AA mode selection, per-mode controls, and a live status readout (active mode + MSAA support/active samples).
- Wired AA settings into `GameEngine` + `PostProcessingPipeline` to restore MSAA in the composer path and to support SMAA/FXAA passes safely at runtime.
