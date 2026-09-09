# report

Builds a pose-first HTML matrix and screenshots its contact sheets using an owned isolated Chrome process. Columns are ACESFilmic, AgX and ACES 2.0; rows are lighting configurations. Sticky column controls have independent 0.5 EV sliders, with a look selector only in AgX. The game reference appears first and has separate native tone/grading menus. Image clicks open an in-page carousel ordered baseline then tones, with arrow buttons/keys and Escape. The diagnostic page retains crop, wipe and blind-label tools. No game scene or Blender is launched.

See the [workflow README](../README.md) for commands, configuration, provenance and limitations.

```sh
node tools/bake_lighting/experiments/lighting_configurations/report/run.mjs --set lighting/experiments/configurations:run=tests/artifacts/screens/illumination_560/runs/<run-id>
```

Inputs are the saved game baselines, authenticated scene metadata, display images
and analyses in the explicit run. The stage can report a pilot-only run; it labels
that output partial rather than complete. Missing/corrupt required inputs fail
without loading the game or Blender. Outputs include `report/index.html`, one
comparison sheet per pose/quality, `review.md`, `report_manifest.json` and root
count/timing summaries. Images and carousel work offline. Material Symbols uses
the same optional font service as the game, with text symbols if unavailable.
