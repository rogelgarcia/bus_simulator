# Landscape flyover video

Renders a feature-showcase flyover of a saved landscape (with its far-field surround) from the headless landscape
viewer: a versioned route of key poses becomes a smooth, timed camera path that is validated against the ground,
flown frame by frame on a virtual clock, composited with a HUD and encoded to mp4.

The HUD shows the **height above ground** (or **above water** over the sea) as the main readout, the altitude above
sea level with the ground or seabed height, speed, heading and elapsed time, a minimap of the route with the camera
and its field of view, and a numbered caption for each feature while it is on screen.

## Route files (`landscape-flyover-route` v1)

`routes/<id>.json`, validated by `FlyoverRoute.mjs` (`validateFlyoverRoute`, strict keys):

```text
{format:'landscape-flyover-route', schemaVersion:1, id, landscapeId, description, conventions:[...],
 camera:{fovDegrees, minClearanceMeters, maxTurnDegreesPerSecond, captionFadeSeconds},
 features:[{id, title, caption, mapHint}], keys:[{position:[x,y,z], target:[x,y,z], speed, feature}]}
```

- World X east, Y up, Z north, meters. Heading 0° = north, 90° = east, clockwise. `conventions` repeats
  `FLYOVER_ROUTE_CONVENTIONS` verbatim.
- The camera passes through each key's `position` looking at its `target`; `speed` (m/s) is the pace at that key.
- `feature` names the caption shown from that key until the next key with another feature (`null` shows none);
  every feature must be shown by some key. `mapHint` records which map/plan source placed it.
- `landscapeId` must match the manifest of `--landscape`. A route edit is a new plan (new fingerprint); a published
  route that others compare against becomes a new versioned file instead of an edit.

### Path and timing

- Positions and targets run on **centripetal Catmull-Rom** splines through the keys (no cusps or overshoot on uneven
  spacing) sharing one curve parameter, so each key's target is met at its position.
- The path is re-timed by **arc length** under a speed profile that eases between the keys' speeds (smoothstep in arc
  length): continuous velocity, no abrupt pace change on short segments. The last key's speed is the closing pace.
- The plan samples every frame and measures clearance over `max(ground, sea level)` at the camera and an 8 m ring
  of probes (authoritative native heights inside the landscape, the surround's natives outside it) and the view's
  turn rate. Any frame below `minClearanceMeters` or above `maxTurnDegreesPerSecond` is a violation and nothing is
  rendered. The renderer never lifts or corrects the camera: what the plan accepts is what is flown.

### `coastal-v3-features-v1` (coastal terrain v3, revision `synthesis-7045f619de9de74a367bc3a8`)

Nine features in flight order, placed from the D4 maps (`tests/artifacts/screens/landscape/ai596/d4/v3/`:
hillshade, coastal zones, cover, drainage, elevation), the D5 surround hillshade, the plan's `districts.json` and
`beach_points.json`, and native ground transects (waterline, bluff crest, plateau rim):

| # | Feature | Where |
| --- | --- | --- |
| 1 | Coastal terrain v3 | offshore north-west at 380 m, looking south-east over the extent and the coast beyond it |
| 2 | Reef and nearshore bar | reef patches x 540–830 m off the bluff, descending to 45 m |
| 3 | West bluff and platform | 100–130 m off the waterline at 22–26 m (the face ~115 m inland), z 3200 → 1500 |
| 4 | Beach, berm and foredunes | south beach at 20 m, z 1500 → 520 |
| 5 | Swim beach and arrival plaza | off the arrival plaza (1090, 490) and bus stop (1260, 520), turning inland |
| 6 | Terraced districts | over old town, hillside homes and the low city at 70–130 m |
| 7 | Eroded hills and drainage | the hills east of the low city at 95 m, looking east toward the surround's ranges |
| 8 | High city plateau | from the south rim and the south ascent around the east side to the north ascent, at 115–150 m |
| 9 | Far-field surround | crane-up from the north-east corner to 960 m, looking south-west over the extent, the coast and the sea |

11.3 km in 3 min 50 s (plus a 1.5 s hold on the last frame in the mp4); minimum clearance 19.8 m, maximum turn
7.2°/s (`--mode plan` prints the table). The east-side orbit and the finale stay inside the 4 km extent and look
away from its edges: seen from outside at altitude, the boundary between the authoritative terrain and the surround
reads as a pale outline (the near-boundary seam of `specs/landscape/LANDSCAPE_AI596_HANDOFF.md` §13).

## Running

```text
node tools/landscape_flyover/render.mjs [--mode plan|stills|render] [--route tools/landscape_flyover/routes/coastal-v3-features-v1.json]
     [--landscape assets/public/landscape/coastal-city-v3] [--output <dir>] [--fps 30] [--width 1920 --height 1080]
     [--surround auto|off] [--hud on|off] [--quality 0.92] [--from <frame>] [--to <frame>] [--fresh] [--encode on|off]
     [--keys 3,4,12]
```

- `--mode plan` writes `plan.json` (per-frame cameras, ground, clearance, captions, the segment table and the
  fingerprint) and `plan.png` (the route on a hillshaded land-cover map with keys `K<n>` and caption starts `F<n>`),
  prints the table and exits non-zero on a violation. No browser.
- `--mode stills` settles the viewer at each key (or `--keys`) and writes `stills/key-NN.jpg` with the HUD: the quick
  framing review before a full render.
- `--mode render` (default) flies every frame: `frames/NNNNN.jpg`, `frames.jsonl` (camera, heights, caption and the
  stream state per frame), `render.json` (status, fingerprint, viewer receipt, page errors), then
  `<route id>.mp4` (libx264 preset slow, crf 17, 4:2:0 with the JPEG frames' full range — ffprobe reports yuvj420p/pc —, faststart, the last frame held 1.5 s) once every frame exists.
- Output defaults to `tests/artifacts/screens/landscape/flyover/<route id>/` (gitignored).
- Resumable: a restart continues after the last contiguous frame present as JPEG and log line; `--from <frame>`
  re-renders from there (pre-warmed and settled at that pose), `--to` stops early, `--fresh` starts over. Frames of a
  different plan fingerprint are refused unless `--fresh`.

The viewer is served by a private `createLandscapeServer({landscapeDirectory})` on a free port and opened with
headless Chromium (`PLAYWRIGHT_EXECUTABLE_PATH` or the Playwright chromium-1234 build, ANGLE D3D11), exactly as
`tools/landscape_review/capture.mjs` does (it shares `fitCanvas` and `settleViewer`). The surface cache and the
budgets are the viewer defaults. Before the first frame the viewer is settled at that frame's pose; then its
`requestAnimationFrame` is taken over so every video frame advances exactly 1/fps of viewer time, paced so the wall
clock never runs faster than real time (streaming gets at least the time of a live flight). Each frame is composed
with the HUD in the same task as its render, because the WebGL drawing buffer is not preserved. A busy GPU only
slows the wall clock, not the frames.

## Files

| File | Role |
| --- | --- |
| `FlyoverRoute.mjs` | route schema, centripetal Catmull-Rom, arc-length timing, caption intervals, the per-frame plan and its checks |
| `FlyoverMap.mjs` | base map raster from the landscape and surround chunks; plan image with the route burnt in |
| `FlyoverHud.mjs` | page-side HUD (serialized into the page by Playwright, so self-contained) |
| `render.mjs` | CLI: plan, stills, render, encode |
| `routes/` | versioned routes |

## Tests

`node --test tests/node/unit/landscape_flyover_route.test.js`: the shipped route validates and shows every feature in
order within its limits, schema rejections, spline interpolation, the timed path (keys met at their times and
speeds, no jump or jerk between frames), caption merging and fades, the clearance/turn checks, the map raster, and
this tool's registration.
