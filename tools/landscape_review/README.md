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

### AI 596 D3 fixture poses (`poses/ai596-d3-fixture-v1.json`)

Eight poses for the 1 × 1 km terrain-synthesis fixture (`tools/bake_landscape/terrain_synthesis/fixture/`),
pinned on the D2 fixture landscape (recipe `plateau-road-shoreline`, 513² at 1.953125 m; the D3 resolution
study writes the same recipe at 0.9765625 m and 0.48828125 m, so the poses compare the spacings on one set of
world-anchored landforms). Pose ids are `F-01`..`F-08` (ids are one to four capital letters, a dash and two
digits). Positions were measured on the saved landscape with the exact NW–SE sampler; the notes carry the
transects.

| Pose | Intent | x, z | Height | Heading / pitch | How it was chosen |
| --- | --- | --- | --- | --- | --- |
| F-01 | Bluff crest along the coast | 363, 300 | eye 1.7 m | 355° / −8° | Crest bench (7.85 m) 6 m behind the crest edge; the face climbs 0.67 → 7.06 m over x 345–357 on row Z 300, the platform (0.4–0.67 m) lies at x 330–345 |
| F-02 | Bluff toe on the platform, at the face | 334, 300 | eye 1.7 m | 90° / +2° | On the wave-cut platform (0.47 m); the toe 13 m ahead, the crest 23 m ahead spanning −6.6° to +12° |
| F-03 | Beach berm along the beach | 279, 300 | eye 1.7 m | 0° / −5° | On the 1.80 m berm crest (flat x 275–283), 35 m behind the waterline (x 243.7) |
| F-04 | Gully in the hills | 449, 164 | eye 1.7 m | 95° / −8° | North rim of the drainage map's gully D (floor 6.0 m at Z 150, rims 8.4 m at Z 139/164); looks up the gully whose floor rises to 14 m at x 524 |
| F-05 | Ridge crest | 556, 100 | eye 1.7 m | 15° / −4° | 8 m north of the 21.0 m hilltop at (556.6, 91.8), the most prominent natural maximum; looks along the ridge toward (560, 290) |
| F-06 | Plateau escarpment rim from below | 572, 557 | eye 1.7 m | 90° / +8° | 40 m west of the rim (x 612, 36 m) below the 36 → 25.6 m face and the 24 m bench; natural land at 20.5 m |
| F-07 | Low oblique over the coast | 160, 180 | altitude 40 m | 15° / −12° | Over water 84 m off the waterline (seabed −4.9 m), looking NNE across the berm at the bluff |
| F-08 | 1 km overview from the sea | −250, 500 | altitude 450 m | 90° / −30° | 250 m outside the western edge (ground null); the center ray meets sea level at x 529, mid-landscape |

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
     [--water on|off] [--planning on|off] [--width 1920 --height 1080] [--allow-missing-appearance on|off]
```

A landscape saved without an appearance sidecar (`writeSynthesizedLandscape` with `appearance: 'none'`, as
the AI 596 D3 fixtures are) loads and settles, but the viewer records the appearance error
`[Landscape] appearance manifest HTTP 404` and draws its fallback soil colors (no PBR materials, no generated
surface detail; the terrain-fields sidecar 404 is handled as `absent`). The tool aborts on appearance errors
unless `--allow-missing-appearance on` accepts exactly that one error; the receipts then carry it in
`appearanceErrors` so a fallback-color capture is never mistaken for a PBR one.

Example (the v2 "before" set):

```text
node tools/landscape_review/capture.mjs --landscape assets/public/landscape/coastal-city --poses tools/landscape_review/poses/natural-world-v1.json --output tests/artifacts/screens/landscape/ai596/d1/poses/v2 --label v2
```

Coastal terrain v3 (AI 596 D4) is its own cache directory; `--landscape` selects it the same
way, and once its appearance is published the capture must settle with PBR materials (no
`--allow-missing-appearance`):

```text
node tools/landscape_review/capture.mjs --landscape assets/public/landscape/coastal-city-v3 --select NW-13 --output tests/artifacts/screens/landscape/ai596/d4/viewer-check --label v3
```

The tool serves the directory itself (`createLandscapeServer({landscapeDirectory})` on a free
loopback port), so the default server and its v2 default directory are not involved. To open
v3 interactively instead, see `tools/landscape_server/README.md` ("Opening coastal terrain v3").

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
 timing:{settleMs, tailMs, screenshotMs, totalMs}, viewer:{water, planning, width, height, allowMissingAppearance}, appearanceErrors:[...]}
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

## Ocean captures, clips and periodicity (AI 597)

`capture.mjs` fixes the sea surface and its deterministic clock for every capture:
`--ocean animated|flat` (the spectral sea or the AI577 flat reference plane), `--sea-state calm|moderate|rough`
and `--ocean-time <seconds>` (default 30: the ocean clock is set to that time before the first frame, so a pose
renders the same wave phase on every run). The receipt's `snapshotSummary.ocean` records the status, sea state,
clock, wave height, simulation GPU time and program compile.

`clip.mjs` renders a short deterministic motion clip from a pose:

```text
node tools/landscape_review/clip.mjs --landscape <saved landscape directory> --output <dir> --pose NW-12 [--frames 90] [--fps 30]
     [--ocean animated|flat] [--sea-state <id>] [--ocean-time 30] [--move dx,dy,dz] [--region l,t,r,b] [--width 1920 --height 1080] [--surround auto|off|<url>]
```

Every frame steps the ocean clock by exactly 1 / fps seconds and, with `--move`, translates the camera by a fixed
vector (a moving-camera stability clip); frames go to `<dir>/frames/NNNNN.png`, `clip.json` records the mean and
maximum absolute luminance difference between consecutive frames inside the region (default the lower half of the
frame) with the frames whose mean difference exceeds four times the median plus one (popping), and `clip.mp4` is
encoded when ffmpeg is on the PATH. The exit code is 1 when a spike was found.

`periodicity.py` measures whether a rendered sea repeats across a capture (the spectral patches are periodic):

```text
python tools/landscape_review/periodicity.py --image <capture.png> --region left,top,right,bottom [--min-lag 64] [--threshold 0.5] [--output receipt.json]
```

It detrends every row of the region's luminance, averages the normalized autocorrelation over the rows and reports the
strongest correlation beyond the minimum lag; above the threshold the sea counts as repeating (exit code 1).

`--ocean-debug <0-14>` replaces the shading by one of the ocean surface's verification views after the settle (see
`ocean_surface.frag.glsl`; 7 the per-cascade depth fades, 8 the AI 597 D2 shore wave: red its depth weight, green its
crest sharpening, blue its bore strength; 9 the D3 foam: red its density, green its coverage, blue the shoreline supply the sand
keeps for the swash; 10 the D4 swash sheet: red the wetness, green the water film, blue its front foam, over the surface's view 9) and
records it in the receipt's `viewer.oceanDebug`.

The AI 597 D2 shore poses live in `poses/ocean-shore-v1.json` (`OS-01` surf-zone oblique, `OS-02` crest lines from
above, `OS-03` the bluff sector shore, `OS-04` the reef shadow, `OS-05` the open-sea handover) with the AI 597 D4 swash poses
(`OS-06` the swash from the berm, `OS-07` the wet line from above, looking away from the sun's mirror point); capture them with
`--poses tools/landscape_review/poses/ocean-shore-v1.json`. Debug view 10 is the swash sheet's (wetness, film, front foam); the
AI 597 D5 views are 11 the seabed read through the surface, 12 the water below it, 13 the caustic ratio and 14 the crest scattering.

`shore_statistics.mjs` tabulates the shore wave of a saved landscape offline, per sea state, from its level-2 chunks and
its geology sidecar with the same pure modules the viewer runs (`LandscapeOceanShore.js`, `LandscapeOceanCoast.js`):

```text
node tools/landscape_review/shore_statistics.mjs --landscape <saved landscape directory> --output <json file> [--sea-states calm,moderate,rough]
```

It prints and writes the crest angle against the beach, the breaking-depth quantiles against `H / γ`, the deepest
breaking texel and the breaking share of every coastal zone: the numbers the browser suite asserts
(`snapshot().ocean.shore`), reproducible without a GPU.

## Tests

`node --test tests/node/unit/landscape_review_poses.test.js` validates the pose file, the
direction and resolution math, the schema rejections and this tool's registration.
