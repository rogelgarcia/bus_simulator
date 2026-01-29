# Regression Research Log — <short title>

Date: <YYYY-MM-DD>  
Owner: <name>  
AI prompt / ticket: <link or filename>  

## 0) Summary

- Symptom: <what is broken / how it presents>
- Expected: <what should happen>
- Scope: <where it reproduces; what it affects>

## 1) Deterministic Repro (required)

- Headless target:
  - `tests/.selected_test`: `<target>` (example: `tests/headless/e2e/road_markings_visible.pwtest.js`)
  - Run command (stable): `node tools/run_selected_test/run.mjs`
- Repro is deterministic:
  - Seed: <value or N/A>
  - Camera: <fixed pose or N/A>
  - Resolution/viewport: <value or N/A>
  - Notes: <query params, config, etc.>

## 2) Debug Tool (preferred)

- Debug scene/tool: <path + how to open>
- Controls exposed for bisecting: <toggles/sliders>
- Headless driver: <how the test drives/inspects it>

## 3) Toggle/Bisect Plan

Suspected subsystems (start broad, then narrow):

- [ ] Base rendering
- [ ] Materials
- [ ] Decals/markings
- [ ] Post-processing
- [ ] Variations/noise
- [ ] Debug overlays

Rules:

- Do not delete code while isolating (use reversible gates/flags).
- Re-run the same headless test after every change.
- Keep artifacts under `tests/artifacts/` (don’t commit them).

## 4) Experiment Log (every step)

| Step | Change / Toggle | Target | Result | Artifact paths | Notes |
|---:|---|---|---|---|---|
| 1 | <ex: Disable X> | `<target>` | FAIL/PASS | `tests/artifacts/...` | <what changed> |
| 2 | <ex: Re-enable X, disable Y> | `<target>` | FAIL/PASS | `tests/artifacts/...` | <what changed> |

## 5) Root Cause

- Root cause: <one paragraph>
- Why it happened: <one paragraph>
- Why tests didn’t catch it sooner: <one paragraph>

## 6) Fix

- Fix summary: <what changed>
- Regression tests added/updated: <list>
- Any debug gates kept (optional): <list>

## 7) Artifacts Index

- Logs: `tests/artifacts/...`
- Screenshots: `tests/artifacts/...`
- Traces/videos: `tests/artifacts/...`

## 8) Follow-ups

- [ ] Remove temporary gates not worth keeping
- [ ] Promote useful gate to real setting (if applicable)
- [ ] Update docs/specs/baselines (explicitly)

