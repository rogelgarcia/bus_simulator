# Native game display references

`node tools/bake_lighting/experiments/lighting_configurations/capture_display_variants/run.mjs --set lighting/experiments/configurations:run=tests/artifacts/screens/illumination_560/runs/<run-id>`

Uses the prepared poses, original saved game settings and installed bakes. Captures the native ACESFilmic, AgX and Neutral tone mappers with Vivid, Off, Warm and Cool grading at the tracked exposure/intensity in `config/baseline_display.json`. Runs sequential isolated browsers for 1080p and 4K and closes them on completion/failure/cancellation. No Blender work or bake publication.

Writes 120 PNGs, effective settings/pose/bake evidence and an authenticated manifest under the run's gitignored `runtime/G01_display_variants/`. G00 originals remain intact. Missing bakes, mismatched poses, unavailable grading LUTs and page errors fail the stage. The gallery's game grading menu is independent from the AgX column's offline look controls.
