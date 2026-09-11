# Automated calibration (AI 567)

This experiment consumes the accepted AI564/565/566 evidence. It produces isolated
lighting/material/display candidates and an AI562 integration handoff. It does
not change game settings, publish bakes, or certify artistic targets as measurements.

```powershell
node tools/bake.mjs --target lighting/experiments/automated-calibration --set lighting/experiments/automated-calibration:material-run=tests/artifacts/screens/ai566_material_calibration/runs/material-08 --set lighting/experiments/automated-calibration:output=tests/artifacts/screens/ai567_automated_calibration/runs/calibration-01
```

Machine paths use `tools/baking/blender.local.json`. Existing headed Blender is
checked before launch. `mode=background` is available for safe isolated work when
an interactive session is occupied; do not contend with someone else's render.
The framework supports cancellation and its global `--timeout-seconds` bound.

Append `/validate`, `/baseline`, `/prepare`, `/calibrate`, `/search`, `/render`,
`/analyze` or `/review` for standalone stages; scope `output` to that full target.
Only validation requires `material-run`. The master runs all eight in order.
`/review-revision` accepts `source-run=<completed run>` and a new `output` directory
for presentation-only changes. It authenticates the completed baseline/analysis/report
and original image bytes; it never changes raw results or re-certifies current game
parity. The original report remains available. This also allows rebuilding a viewer
after presentation code changes without regenerating unchanged transport.
Resume uses the same output and authenticates receipts, code, source, scene,
display resources, bakes and raw image hashes. Changed inputs require a new run.
Failed attempts are retained in `attempts/`; partial baseline captures are copied
to `baseline_attempts/` before a retry. Images are never deleted on rejection.

Validation reruns AI564's independent equations, transfer checks and negative
controls on unchanged authenticated raw data, writing a new report. It validates
AI565 atmosphere and AI566 materials separately. Unsupported cases stay explicit.
The baseline is a fresh five-pose game capture with installed shadows/indirect,
ACESFilmic and grading Off in a disposable browser. It records active packages,
requested/effective controls, render resources and exact bus/camera placement.
It does not import personal browser preferences.

Preparation copies the frozen material scene byte-for-byte and checks all five
cameras and four bus placements. Views 01/02 share a bus; other buses are excluded
from each view's transport. Calibration imports 30 exact full-render EXRs with
unchanged scene/material/atmosphere. No linear light-group recombination is used.

The tracked canonical poses remain in the AI560 `config/poses.json`; their full
identity is frozen. `defaults.json` defines fit views 01/04/05, held-out views
02/03, six material/daylight combinations, global EV offsets -0.5/0/+0.5, neutral
ACESFilmic and AgX, region annotations and broad display guards. Raw physical
checks precede display evaluation. The clear gray-card scale stays fixed across
poses. Weather/material variants are declared assumptions, not continuous fitted
parameters; albedo, sky tint, light energy and grades cannot absorb exposure errors.

Selection uses the published lexicographic training rule, separately within each
material family. Held-out views never affect selection. Overcast is a stress case,
outside sunny intent. Both finalists get independent full renders (128 samples,
new seed) and quantitative verification on every pose before lab promotion.
Display guard failure blocks promotion and remains visible; no opaque realism score.
Original Cycles targets and the generated blue-sky target retain hashes and labels
in `references.json`; missing or altered references fail the review stage.

The report has a pose/tone selector, all iterations, image selection, a 2×2 view,
and keyboard/thumbnail carousel. `profile.json` provides source, material, daylight,
tone/OCIO, raw/display expectations, assumptions, bake requirements and AI562 work.
Each image exposes its actual parameters. Legacy game lighting differs from the
calibrated Cycles reference and is not an equal-light renderer benchmark.

One browser or renderer runs at a time, with four Cycles CPU threads. Images are
decoded individually rather than loading the full matrix into memory. Owned
working-set peaks are sampled every five seconds; shared pages may be counted
twice. GPU memory/time and production before/after FPS are unavailable, explicitly
labeled. Browser/server cleanup uses the established owned-process lifecycle.
Generated data stay under ignored `tests/artifacts/screens/ai567_automated_calibration/`.

Tests: select `tests/node/unit/automated_calibration.test.js` in
`tests/.selected_test`, then run `node tools/run_selected_test/run.mjs`.
