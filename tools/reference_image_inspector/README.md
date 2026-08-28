# referenceImageInspector

Inspect reference photos while reproducing them as buildings: print image size,
write scaled crops for close reading, sample average colours, and print
row/column luminance profiles so facade grid pitches can be measured in pixels.

Dependency-free — it ships its own minimal PNG codec (`png.mjs`, 8-bit
non-interlaced, colour types 0/2/4/6), which the other reference-chasing tools
reuse.

## Run

```bash
node tools/reference_image_inspector/run.mjs --file "downloads/buildings_references/10 front.png" --info
```

| flag | meaning |
|---|---|
| `--file <png>` | image to inspect (also accepted positionally) |
| `--info` | print `{ file, width, height }` |
| `--crop x,y,w,h --out <png> [--scale N]` | write a resampled crop, `--scale 4` to magnify |
| `--color x,y,w,h` | print the average RGB of a rect, plus its hex |
| `--profile rows\|cols [--rect x,y,w,h] [--minSpacing N]` | print the luminance profile's local minima along that axis — the dark lines of a facade grid |

Example — measure a curtain wall's mullion pitch:

```bash
node tools/reference_image_inspector/run.mjs --file "downloads/buildings_references/10 front.png" --profile cols --rect 105,160,915,80 --minSpacing 20
```

Related: `tools/facade_elevation_validator` compares a render against the
reference measured this way.
