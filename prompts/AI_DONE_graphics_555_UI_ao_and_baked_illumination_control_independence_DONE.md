# DONE — AO and baked illumination control independence

## Problem

Turning screen ambient occlusion off in Options disables enhanced baked
illumination. Turning AO back on or toggling the receiver controls does not restore
it. The improved bake must remain usable independently of screen AO.

# Request

- [x] Keep baked illumination active and its maps cached when changing screen AO.
- [x] Apply only edited Options settings, preserving Save and Cancel semantics.
- [x] Verify that AO Off/SSAO/GTAO, the enhanced selector and direct/indirect controls
  remain responsive across repeated changes without unbounded shader growth.
- [x] Retain exact source compatibility checks and the existing original preview.

## Investigation

The real gameplay reproduction reached active AI 548, then AO Off caused
`source_or_profile_changed` with a changed material `debug` field. Options replayed
the road-material settings during an unrelated AO edit. A separate focused test
reproduced Cancel replaying unrelated settings because the engine snapshot has
fields that are absent from the UI snapshot.

Evidence belongs under `tests/artifacts/screens/illumination_ao/` and remains
gitignored. This fix changes control application, not the bake or its sampling.

## Completed changes

- Options compares each settings group with the last applied UI snapshot; unrelated
  controls no longer rewrite material configuration or rebuild shadow settings.
- Cancel compares like-for-like UI snapshots and restores full original engine
  values only for edited groups, preserving fields not exposed by the menu.
- Removed the enhanced-only menu shortcut; the same edit isolation applies to
  every settings group and both illumination implementations.

## Validation

- `options_live_settings.pwtest.js`: the Cancel reproduction failed before the
  correction and passed afterward, including restoration of hidden engine fields.
- `receiver_ao_controls.pwtest.js`: the gameplay AO-Off reproduction failed before
  the correction and the full lifecycle passed afterward (Chrome, RTX 3060,
  1280×720, installed 896-sample bake, fixed facade camera).
- AO Off/SSAO/GTAO, Cancel, Save/reopen, original/enhanced selection and three
  linked channel cycles all retained compatible enhanced resource objects.
- No additional receiver-package requests after warming both implementations;
  channel restoration held at 197 shader programs across all three cycles.
- The pre-postprocessing facade RGB probe stayed exactly
  `[0.0565140094, 0.0470378082, 0.0347972141]` across AO modes and restoration.
  Disabling illumination changed it to
  `[0.0501654588, 0.0424763629, 0.0331279863]`; enabling restored the original values.
- No page errors. This is a control/correctness fix; frame-time speedup was not
  measured or claimed. Bake data, shader source and freshness guards are unchanged.
