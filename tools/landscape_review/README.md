# Landscape review poses and matched-camera captures

Versioned natural-world review poses (NW-01..NW-13 from
`specs/landscape/LANDSCAPE_NATURAL_WORLD_ROADMAP.md` §8, contract in
`specs/landscape/LANDSCAPE_TERRAIN_SYNTHESIS.md` "Review poses"), the resolver that
turns them into viewer cameras against the authoritative native ground, the headless
capture tool that renders them from the landscape viewer, and the composite builder for
`[reference | before | after]` sheets. Every natural-world prompt verifies against the same
poses; a new pose set is a new versioned file, never an edit of a published one.

## Pose file (`landscape-review-poses` v1)

`poses/natural-world-v1.json`:

```text
{format:'landscape-review-poses', schemaVersion:1, id:'natural-world-v1', conventions:{...}, poses:[pose, ...]}
pose = {id, intent, x, z, eyeHeightMeters | altitudeMeters, headingDegrees, pitchDegrees, fovDegrees, lookDistanceMeters, references, notes}
     | {id, intent, camera:{position:[x,y,z], target:[x,y,z]}, fovDegrees, references, notes}
```

Conventions (the `conventions` block must repeat them verbatim; `validateReviewPoses` checks it):

- World X east, Y up, Z north, meters. Heading 0° = north (+Z), 90° = east (+X), clockwise.
  Pitch is degrees above the horizon, negative looks down.
- `eyeHeightMeters` is above the authoritative native ground at (x, z) and is re-resolved on
  every terrain revision, so a standing pose follows the ground when the terrain changes.
- `altitudeMeters` is above sea level and ignores the ground (poses over water or outside the
  landscape); the ground is still recorded in the receipt, `null` outside the landscape.
- The look target lies `lookDistanceMeters` along the view direction (100 m for every pose).
- A `camera` pose is an explicit viewer camera and passes through unchanged (NW-13 is the
  viewer's `home` overview preset written as absolute numbers).
- `references` are roadmap reference ids (R01–R10) the pose is compared against; `notes`
  record how the position, heading and pitch were chosen on the terrain revision used to pin it.

### Natural-world v1 poses (pinned on coastal-city v2, revision `materials-bfcf20f7e27aa79db4d9983b`)

| Pose | Intent | x, z | Height | Heading / pitch | How it was chosen |
| --- | --- | --- | --- | --- | --- |
| NW-01 | Swim beach, along the shore | 1090, 490 | eye 1.7 m | 340° / −3° | The plan's beach arrival point (ground 2.60 m, arrival plaza); sand 80 m west |
| NW-02 | Beach arrival towards the sea | 1260, 700 | eye 1.7 m | 270° / −3° | Inside the open-view corridor polygon on grass (5.15 m) |
| NW-03 | Bluff toe on the sand (R10) | 1228, 2600 | eye 1.7 m | 20° / −4° | 15 m seaward of the toe: on row Z 2600 the slope first exceeds 8° at x 1243.4 going east from the sand; rock band x 1268–1305 |
| NW-04 | Bluff top looking out to sea | 1322, 2400 | eye 1.7 m | 250° / −8° | Crest bench (12 m) just east of the rock band's east edge (x 1310.5); 78 m west of the roadmap point, which sits on the second rise |
| NW-05 | Forest interior | 2600, 450 | eye 1.7 m | 45° / −3° | Forest soil with no cover change within 80 m |
| NW-06 | Forest edge and clearing | 2074, 3316 | eye 1.7 m | 180° / −3° | Nearest forest-to-grass edge (airport grass apron); the north forest around (2450, 3750) is unbroken on v2, so moved 574 m SW |
| NW-07 | Steep slope below the high city | 3300, 2740 | eye 1.7 m | 30° / −2° | Steepest part of the flank at X 3300 (5°); heading = averaged uphill gradient |
| NW-08 | High city from the low city | 2600, 2200 | eye 1.7 m | 45° / 0° | Low-city ground (18.5 m) aimed at the plateau |
| NW-09 | Beach-to-centre rise from the water | 1000, 1500 | altitude 1.5 m | 90° / 0° | Over water 100 m off the waterline |
| NW-10 | Low oblique flyover of the coast | 900, 1200 | altitude 25 m | 45° / −10° | Over water; altitude keeps the height stable across bathymetry changes |
| NW-11 | Aerial overview from the sea | −400, 2000 | altitude 800 m | 90° / −30° | Outside the landscape (ground null); the center ray meets sea level at the waterline |
| NW-12 | Shore break at water level (R09) | 1152, 1800 | altitude 1.0 m | 0° / −6° | At the waterline (sea-level crossing x 1148 on row Z 1800); 18 m west of the roadmap point |
| NW-13 | 4 km overview | camera (4400, 3000, −2300) → (2000, 0, 2000) | — | — | The viewer's `home` preset as an absolute camera |

## Resolver (`ReviewPoses.mjs`)

- `loadReviewPoses(file)` / `validateReviewPoses(value)`: strict schema (exact keys, unique ids,
  ranges, exactly one of `eyeHeightMeters`, `altitudeMeters`, `camera`), deep-frozen result.
- `reviewPoseDirection(headingDegrees, pitchDegrees)` → unit `[x, y, z]`.
- `resolveReviewPose(pose, sampleGround)` → `{id, position, target, fov, zoom:1, projection:'perspective', groundHeight}`;
  `sampleGround(x, z)` returns the native height (sync or async) or `null` outside the landscape.
- `createNativeGroundSampler(directory)` → `async (x, z) => height | null` over a saved landscape
  directory: reads the owning native chunk through `readLandscapeFileChunk` (hash-authenticated,
  cached per chunk) and samples the exact NW-SE triangulation with `sampleLandscapeChunk`; at
  shared borders the east/south chunk owns the point. The sampler carries `revision` and `bounds`.

## Capture

```text
node tools/landscape_review/capture.mjs --landscape <saved landscape directory> --output <directory>
     [--poses tools/landscape_review/poses/natural-world-v1.json] [--select NW-01,NW-04] [--label <text>]
     [--water on|off] [--planning on|off] [--width 1920 --height 1080]
```

Example (the v2 "before" set):

```text
node tools/landscape_review/capture.mjs --landscape assets/public/landscape/coastal-city --poses tools/landscape_review/poses/natural-world-v1.json --output tests/artifacts/screens/landscape/ai596/d1/poses/v2 --label v2
```

The tool serves the landscape directory with `createLandscapeServer` on a free loopback port,
launches headless Chromium (`PLAYWRIGHT_EXECUTABLE_PATH` or the Playwright chromium-1234 build,
`--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`), opens `/screens/landscape_fabrication.html`,
waits up to 180 s for `snapshot().ready`, enlarges the viewport until the WebGL canvas is exactly
width×height, applies the water/planning switches and hides the DOM overlays (header, panels,
footer and the global performance bar sit over the canvas). For each selected pose it resolves the
camera against the directory's native ground, calls `setCamera`, waits until streaming pending is 0,
streaming and appearance are settled and lighting is ready on two consecutive polls (120 s limit),
renders a 1.5 s tail, then screenshots the canvas box to `<output>/<poseId>.png` and writes
`<output>/<poseId>.json`:

```text
{poseId, label, landscapeDirectory, revision, poseFile, pose, camera, groundHeight, file, settled, waitedMs, canvas, clip,
 snapshotSummary:{streaming:{lodRange, tiles, pending, settled}, appearance:{pending, settled, ready}, lighting:{status, tier}, terrainFields:{status}, ...},
 timing:{settleMs, tailMs, screenshotMs, totalMs}, viewer:{water, planning, width, height}}
```

`captures.json` indexes the run (label, directory, revision, pose file, viewer settings, per-pose
files, timings, recorded page errors). Page, browser and server always close, also on errors. A
pose that does not settle is still captured, flagged `settled:false` with its last state, and the
process exits 1. The viewer is deterministic once settled, so re-capturing a pose on the same
landscape repeats the image; the receipt's `revision` and `groundHeight` tie a capture to its terrain.

## Composite

```text
python tools/landscape_review/composite.py --output out.png [--label-height 36] [--height 720] [--title "..."] [--grid <columns>] <label>=<image> ...
python tools/landscape_review/composite.py --output composites/nw04.png --title "NW-04 bluff top" reference=ref10_coastal_bluff_strata_platform.webp before=v2/NW-04.png after=v3/NW-04.png
```

Images (PNG/JPG/WebP) are scaled to a common height and laid out in one row, or in a grid of
`--grid` columns for N-up sheets, each under a label strip (Segoe UI or Arial when present, else
Pillow's default font). Fixed colors, no timestamps: the same inputs give the same PNG.

## Tests

`node --test tests/node/unit/landscape_review_poses.test.js` validates the pose file, the
direction and resolution math, the schema rejections and this tool's registration.
