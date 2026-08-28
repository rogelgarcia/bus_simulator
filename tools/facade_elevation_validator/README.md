# facadeElevationValidator

Compares a rendered building elevation against the reference photo it
reproduces and reports which proportions do NOT match, so a reference-chasing
pass has a checklist instead of an impression.

Both images are measured with the same scale-invariant algorithms inside a
building rectangle, so a 1122px reference and a 2560px capture are directly
comparable: every metric is a ratio, a count, or a fraction of the building
box. Metrics outside tolerance print as FAIL with the measured delta; a metric
that could not be resolved in one of the two images prints as `n/a` rather
than as a mismatch.

## Run

```bash
node tools/facade_elevation_validator/run.mjs --ref "downloads/buildings_references/10 front.png" --refRect 110,111,906,1115 --shot tests/artifacts/screens/buildings/modern_bank_elevation.png
```

| flag | meaning |
|---|---|
| `--ref <png>` | the reference elevation |
| `--shot <png>` | the engine capture to check |
| `--refRect`, `--shotRect` | `x,y,w,h` of the building. Omit to auto-detect against sky/grass (works on harness renders; a street photo needs an explicit rect) |
| `--json` | dump every raw measurement instead of the table |

Exit code is 1 while any measured metric is outside tolerance, so it can gate a
capture loop.

## Metrics

`width / height`, `base height / building height`, `curtain modules across`,
`curtain floors`, `vision : spandrel height`, `base openings`,
`base opening width`, `base pier width`, `base opening : pier width`, and
`base tone / curtain tone`.

Periodic quantities (module pitch, floor pitch) come from the normalised
autocorrelation of a luminance profile rather than from counting dark lines: a
mullion shows up as two edges and a glazing bar as a third, so counting
over-reports. The base/shaft boundary is found from horizontal CONTRAST — a
base has a few deep openings between broad piers, a shaft has a near-uniform
module grid — because whether the base is lighter than the shaft depends on the
light.

The shot should be a long-lens, head-on capture; see
`tests/headless/visual/specs/modern_bank_capture.pwtest.js` for one.

Related: `tools/reference_image_inspector` measures the reference by hand and
shares its PNG codec.
