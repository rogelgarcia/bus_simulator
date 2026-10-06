# Grass distance-transition lab

Entry point: `debug_tools/grass_transition_scene.html`. This separate lab reuses
the authored field's grass, litter and 1K canopy maps (now LOD5 in this lab). Lighting resolves from
the same live settings as the game, rather than the geometry export. The existing
single-field lab links to it and retains its manual LOD comparisons.
The transition lab now defaults to 4× canopy anisotropic filtering and simple
edge/corner strips. The previous 8×/edge-grid baseline remains selectable; see the
adoption measurements below. Whole-field batching is unchanged.

Startup goes through `GrassDebugV2TransitionEntry.js`, which dynamically imports
the scene and exposes its readiness promise before loading the module graph.
Module-link and shader-source failures display a visible error instead of leaving
the loading message indefinitely. The page import map versions the shared shader
hook registry for every consumer; versioning only the blend import would create
two registries and lose access to the source materials' hooks. Cache regression
tests supply the old registry without the rendered-variant export and verify that
the scene bypasses it, while deliberate missing-export failures remain visible.

## Scene and selection

### Opaque dissolve (2026-10-05)

`?revision=opaque-dissolve-1&lod3=cards` replaces the broad card opacity fade
with a shared, static, one-pixel interleaved-gradient threshold. Adjacent levels
use opposite sides of the threshold at equal fade weights; surviving fragments
keep their original color and depth writes. Existing MSAA alpha coverage remains
on atlas leaf edges, but no longer carries transition opacity. There is no
frame-varying seed, extra texture lookup, render target, or CPU card sorting.
The existing cached candidate selection and distance bands are unchanged.

The Fade control and `setFadeStyle` API retain `coverage` (previous), `alpha`
(ordinary transparency on card handoffs), and `staggered` (short, world-seeded
per-card windows at LOD3/4). `dissolve` is the default; `?fade=...` persists a
comparison choice. Staggering applies only while the larger-card bridge is active.

Matched front, rear and side bus renders show the dissolve's classified leaf
green channel stays between isolated LOD3/4 values in the middle of the band.
Ordinary alpha darkens those samples, and whole-card staggering increases local
coverage variation. Reversing draw order changed 132,789 pixels with alpha and
177 with the dissolve, at a 3/255 threshold. The latter is not a claim of exact
order invariance for coincident grass geometry; synthetic boundary probes are
order independent and have no holes. The color classifier is a fixed green
proxy, not a semantic leaf-ID mask.

All alternatives use the same atlas memory. Previous coverage and dissolve
both draw 109 batches / 880,047 triangles front, 109 / 880,185 rear, and
100 / 388,289 side, including scene passes. No GPU-time improvement is claimed:
external GPU utilization remained 100%. Tests cover three matched views, eight
bearings, all five boundary probes, front/rear 6 m drives, reload and UI toggles.

Evidence and interactive comparison:
`tests/artifacts/screens/grass_debug_v2/transition_lab/fade_styles/index.html`.
Generate it after the visual tests with
`node tests/headless/visual/grass_transition_fade_report.mjs`.
Fine pixel grain can remain without TAA. Different card clump shapes and the
flat canopy are still representation differences, beyond what a fade can fix.

### Card continuity correction (2026-10-05)

`?revision=card-continuity-1&lod3=cards` keeps the six levels and the
0.6 / 0.8 / 1 / 16 / 32 m switches below, with these corrections:

- Fade weights use the decoded, expanded vertex position, rather than one
  weight for an entire one-metre cell. Narrow near-camera bands therefore
  remain spatially continuous. MSAA and complementary coverage policies stay
  unchanged; there are no extra fragment texture samples.
- CPU candidate selection adds a 1.4 m geometry envelope to its existing
  1.45 m movement guard. This covers leaf/card overhangs while retaining the
  50 ms / 0.2 m scan gates. Bounding volumes include card size variation.
- Both card populations use world-seeded jitter within evenly distributed
  strata. The former repeated two-metre best-candidate layout is removed.
  Stable yaw variation (±31.5°), width (88–112%), depth (90–110%) and height
  (90–100%) break aligned silhouettes. Roots and source images do not shuffle
  during camera movement; height only decreases from the existing source-calibrated card.
- LOD4 captures a 75 × 32 cm strip instead of 75 × 22 cm, and spans 62 cm of
  ground instead of 37 cm. Four cards/m² and all three atlas sizes are unchanged.
  The rejected 42 cm source-depth trial produced excessively dense clumps.
- Entry points, card materials and shader sources share a new cache revision,
  preventing a refreshed lab from borrowing earlier blend or placement code.

Evidence: `tests/artifacts/screens/grass_debug_v2/transition_lab/card_continuity/`.
`grass_cards_continuity.pwtest.js` compares blended and isolated levels from
front, rear, steep and low cameras. Every measured foreground band below 2 m
retains at least 65% of the matching LOD2 green coverage (fixed classifier,
excluding litter). `grass_transition_blending.pwtest.js` now exercises cards,
all five boundaries, and moving-camera cache rebuilds. Rebuild changes fell
by over 99% relative to patch switching in the matched front/rear test.
The unit support sweep includes ±1.4 m vertex offsets between cached scans.

The paired GPU rerun is retained under `card_continuity/performance/`, but its
timings are inconclusive: round variance was large, including unchanged
canopy-only rendering, and GPU load was still 100% after the test exited.
Do not compare these means with the historical timings below. The three
capture atlases still occupy 67.1 MB per card population, including mipmaps;
these corrections add no textures. Large cards can still look grouped when
forced close, outside their intended range, and the far canopy remains flat.

### Initial larger-card LOD4 bridge (2026-10-05; prior to continuity correction)

The transition lab adds a sixth level. The former 1K opaque canopy becomes
**LOD5** here; the single-field lab's LOD4 names and geometry are unchanged.
The new **LOD4** uses **75 cm-wide cards at four cards/m²**, versus the
experimental LOD3's 25 cm-wide cards at twenty/m². It has eight triangles/m²
rather than forty. Original geometric LOD3 remains selectable and the default;
use `?lod3=cards` for the calibrated card chain.

New captures use four 75 × 22 cm source strips, eight source bearings, and the
canonical bus pitch (13.586°). Each capture selects 126–141 source leaves,
including lateral padding, compared with roughly 47–54 for the near cards.
Ground span is 37 cm; blade height remains the source's 14.14 cm. These are
fresh wider captures, not stretched copies of the near atlas. Continuous yaw,
stable source-image selection, periodic best-candidate placement and width-scaled
world jitter reuse the existing card shader. No captures or per-card CPU work
are performed during movement. The initial 30 cm source-depth trial was too
full; three cards/m² left gaps and six were too dense. Four remains the default,
with both density alternatives exposed in the LOD4 selector.

Defaults are **0.6 / 0.8 / 1 / 16 / 32 m**. The first four retain the requested
values; 32 m is the experimental far-canopy default, editable in the new LOD5
input. The 50% bands are 8.5–16 m for LOD3→4 and 24–32 m for LOD4→5. The
`LOD4 bridge` checkbox, or `?bridge=off`, bypasses the intermediate population
and transitions directly from LOD3 to the canopy at 8.5–16 m. Both material
slots share that band; no LOD4 draw candidates remain. Cached atlases stay
resident when this comparison switch is off. Helpers show the direct 3→5 band.
The existing `lod4-*` configuration URLs, `setLod4Surface` and canopy snapshot
property names remain legacy aliases; the UI correctly labels these as LOD5.

Near/card and card/card boundaries use the existing MSAA sample-coverage path;
card/canopy remains complementary screen-door coverage. Selection supports six
levels and five uniform limits, retaining 50 ms / 0.2 m update gates and the
35 m independent canopy-side cutoff. Shape and material changes are contained
in the transition lab. The canopy's existing inverse-elevation correction now
caps its denominator at 0.3 for this lab, and its leaf tint is less saturated.
This is a constant calibration change, with no new texture fetch or shader
stage. Litter retains its separate material. The far plane still has less
parallax and fine contrast than the cards; it is not visually identical.

Evidence and reproducible tests:
- `tests/headless/visual/specs/grass_wide_cards.pwtest.js`: four bus bearings,
  isolated 3/4/5 comparisons, 3/4/6 density trials, three full-scene poses,
  motion, and preserved-source before/after renders.
- `tests/headless/perf/specs/grass_wide_cards.pwtest.js`: opt in with
  `GRASS_TRANSITION_BENCHMARK=1`; six paired rounds of thirty hardware queries
  per variant and matched soil, three 1920 × 1080 bus views, DPR 1, RTX 3060.
  Staged real batches have independent blend uniforms. Query draining between
  complete paired cycles prevents overflow of the timer's 24-query queue;
  incomplete/disjoint blocks fail instead of silently dropping samples.
- `tests/headless/visual/grass_wide_cards_report.mjs`: build the local report
  under `tests/artifacts/screens/grass_debug_v2/transition_lab/wide_cards/`.
  Its `before/` source snapshot and trial captures are gitignored evidence.

Measured GPU milliseconds **above soil**, with cached scene shadows enabled:

| Configuration | Front | Rear | Border | Mean |
|---|---:|---:|---:|---:|
| Direct LOD3→canopy | 0.920 | 0.851 | 0.855 | 0.876 |
| Full chain with wide-card bridge | 1.357 | 1.280 | 1.299 | 1.312 |
| Isolated LOD3 cards | 1.518 | 1.471 | 1.210 | 1.400 |
| Isolated LOD4 cards | 1.112 | 1.054 | 0.899 | 1.021 |
| Isolated canopy, retained side state | 0.163 | 0.147 | 0.148 | 0.153 |

The bridge costs **0.437 ms** over direct-to-canopy in this run. Isolated LOD4
is about 27% cheaper than isolated LOD3; lower triangle count does not remove
fragment shading or alpha overlap. CPU selection plus rebuilding averages
0.341 ms/frame direct versus 0.498 ms/frame with the bridge, across three
60-frame movement repeats with twelve scans each. No shadow recaptures occur
in those sequences. GPU clocks are not locked; compare variants within this
paired run rather than absolute timings from older sessions. Direct mode uses
the same newly calibrated canopy as the bridge; preserved-source screenshots
also show the appearance before that calibration.

Three 4096 × 1024 RGBA8 atlases with mipmaps add **67.1 MB (64 MiB)** for LOD4.
Both card levels total 134.2 MB, excluding existing canopy/source/shadow maps
and driver overhead. These are uploaded texture-size estimates, not a process
VRAM reading. Capture targets are released after initialization. Offline asset
publication remains a separate bake-framework task; no standalone bake command
was introduced.


### Experimental camera-facing LOD3 cards (2026-10-03)

The current `lod3=cards` experiment uses **20 cards/m², each 25 cm wide**.
`cards-sparse` uses 10 and `cards-full` uses 32; these alternate densities are
available for experiments but only 20/m² is calibrated and benchmarked here.
Original geometric LOD3 remains the default. LOD0–2 source geometry/materials,
The cached geometric shadow source is retained. The later bridge change above
renumbers the old canopy to LOD5 in this transition lab.

The rejected 50 cm, 10/m² version still had upright tufts and translucent wisps.
Matched close captures exposed two causes hidden by average-color measurements:
large capture groups and blending two images containing different source leaves.
The new 25 × 17 cm source strips are captured at 30° depression, preserving more
of the diagonal leaf shapes. Eighty periodic best-candidate positions cover each
2 × 2 m template, with exactly 20 per cell. Ground span stays 32 cm and maximum
height is unchanged apart from the capture gutter. Splitting the width in half
keeps roughly the same total support area, at 40 triangles/m² instead of 20.

Each card retains one deterministic image from the 32 captures while continuously
turning in azimuth. Its captured normal basis rotates with it; no image-sector
crossfade, recapture or per-card CPU update occurs. This replaces six fragment
texture fetches with three. Constant linear material tint is 0.76 / 0.84 / 0.305.
The three 4096 × 1024 RGBA8 atlases remain **67.1 MB / 64 MiB with mipmaps**,
shared across fields and density settings, with 512 × 256 captures and 4× filtering.

Only when cards are selected, the LOD2-outgoing / LOD3-incoming band uses MSAA
alpha-to-coverage instead of the conspicuous 8 × 8 screen-door pattern. The square
root coverage ramp limits density loss between unrelated leaf populations.
Depth testing/writing stays enabled without transparency sorting. Other bands
and original leaf mode keep the previous complementary dither. The lab's
multisampled framebuffer is required for this coverage variant. This is an
approximation: finite sample counts and per-cell band weights can still change
density, and inclined cards cannot reproduce per-leaf parallax or world-fixed
blade orientation at every angle.

Eight bus poses (14/24 m field-centre positions × 0/45/90/180°) are supplemented
by three close 2 m-high, 30°-tilted views, an azimuth orbit, and a 2 m advance
through the near boundary. The optional saved previous source produces matched
before/after close captures. All outputs remain gitignored in
`tests/artifacts/screens/grass_debug_v2/transition_lab/view_cards_fidelity/`.
The report includes LOD2, preceding cards, current cards and real transitions.
Classified green coverage over 6–18 m is 73.96% for LOD2, 75.59% for previous
cards and 73.69% for current cards. Classified grass-only RGB is respectively
107.69/129.08/55.02, 109.33/129.45/59.28 and 106.92/128.63/56.48. These are
screen-space proxies, not semantic masks or proof of visual equivalence.

Current paired RTX 3060 / Chrome benchmark at 1920 × 1080, DPR 1, shadows cached.
GPU milliseconds **above matched soil-only rendering**:

| Configuration / view | Original LOD3 leaves | Revised 20 cards/m² |
|---|---:|---:|
| Full distance LODs / front | 3.919 | 2.974 |
| Full distance LODs / rear | 4.183 | 2.976 |
| Full distance LODs / border | 3.978 | 2.328 |
| LOD3 only / front | 7.047 | 2.778 |
| LOD3 only / rear | 7.360 | 2.439 |
| LOD3 only / border | 6.586 | 2.198 |

Six paired rounds × 30 samples with rotating/reversed order. Mean savings:
31.5% full scene and 64.7% isolated LOD3. All six paired saving intervals exclude
zero. Moving selection plus batch CPU averages 0.413 ms/frame for leaves and
0.366 for cards; this small difference is not a demonstrated CPU improvement.
No scans, uploads or shadow regeneration occur during stationary timed blocks.
Absolute times differ from previous sessions; GPU clocks/desktop load are not
locked. Compare variants within this run, not timings across historical runs.

Run the selected visual and opt-in perf `grass_view_cards.pwtest.js` tests, then
`node tests/headless/visual/grass_view_cards_report.mjs` to regenerate the report.

#### Previous 50 cm coverage attempt (historical)

The following describes the preceding implementation and its measurements;
its source is preserved only in the local comparison artifacts.

The LOD3 selector retains original geometric leaves as the default and adds
50 cm alpha cards at 4, **10** or 16 cards/m². URLs use `lod3=cards-sparse`,
`lod3=cards` or `lod3=cards-full`. Only the 10-card mode is calibrated against
LOD2 in the revised experiment. LOD0–2 and geometric LOD3 are unchanged.

The revised capture uses four 50 × 13 cm source strips, each seen from eight
azimuths at bus pitch. Lateral neighbour leaves are included before cropping,
so the strips do not taper into isolated clumps. Forty best-candidate positions
are balanced periodically over a 2 × 2 m area, with exactly ten in each 1 m cell.
World-space jitter is limited to ±1.75 cm instead of ±15 cm; source-image variants
also vary across the field. Cards turn continuously in azimuth but preserve a
shallow incline with a 32 cm ground span. This distributes coverage over the
ground instead of crushing it into an upright billboard. Captured leaf normals
remain in world space, and adjacent captured views blend smoothly.

Grass-only color samples under game lighting calibrate one constant material
tint in linear space (0.88 / 0.98 / 0.40), without changing litter or introducing
a per-fragment color-correction operation. The existing lighting, tip compression
and complementary LOD blending remain shared. No per-card CPU updates, ongoing
captures or texture uploads occur during motion. The cached LOD2 shadow source
is unchanged. There are two triangles per card and no extra ground layer. A trial
reusing LOD4's ground texture filled holes but produced excessive green coverage;
it was rejected in favour of the inclined cards over the existing litter floor.

Each capture remains 512 × 256 pixels. Three 4096 × 1024 RGBA8 atlases with
mipmaps and 4× anisotropic filtering add **67.1 MB (64 MiB)**, unchanged from the
initial experiment. Textures are shared by every field and density. They remain
resident when switching back to leaves for comparison and are disposed with the
scene. `fields.extraTextureBytes` reports the active representation, whereas
`viewCards.textureBytes` reports the retained atlas allocation.

A fixed green-pixel classifier applied to browser-composited screenshots excludes
sky, paths and field edges. Mean coverage over 6–10 / 10–14 / 14–18 m bands,
14/24 m field-centre positions and front/side/rear bearings is 73.9% for LOD2,
82.0% for the previous cards, and 75.2% for revised cards. Grass-only mean RGB is
105.8/127.2/53.8, 116.6/138.0/61.9 and 107.7/127.8/58.3 respectively. Low-coverage
32-pixel blocks fall from 2.93% to 0.89% (LOD2: 0.28%). These are classification
proxies, not semantic masks or proof of visual equivalence. Close views retain
softer detail and some repeated structures. Captures have one elevation and no
per-leaf depth reprojection; original leaves remain the default.

Revised paired benchmark on RTX 3060 / Chrome, 1920 × 1080, DPR 1. GPU
milliseconds **above matched soil-only rendering**, shadows enabled and cached:

| Configuration / view | Original LOD3 leaves | Revised 10 cards/m² |
|---|---:|---:|
| Full distance LODs / front | 2.049 | 1.368 |
| Full distance LODs / rear | 2.168 | 1.318 |
| Full distance LODs / border | 2.303 | 1.548 |
| LOD3 only / front | 5.155 | 1.958 |
| LOD3 only / rear | 4.721 | 1.890 |
| LOD3 only / border | 4.098 | 1.500 |

Six paired rounds × 30 samples per view/version and soil, with rotating/reversed
order. All six saving intervals exclude zero. Average savings are 35.1% for the
full scene and 61.7% for isolated LOD3. Moving selection plus batch CPU averages
0.377 ms/frame for leaves and 0.348 for cards; this small difference is not a
proven CPU speedup. Full/front triangle submissions fall from 1,590,575 to 685,579
at the same 90 draw calls. Isolated/front falls from 4,696,119 to 90,167 triangles
at 23 draws. Timed stationary blocks have zero LOD scans, uploads or shadow
regenerations. GPU clocks/desktop load were not locked: compare paired variants
within this run, not absolute timings across historical runs.

Run the selected visual and opt-in performance `grass_view_cards.pwtest.js`
tests, then `node tests/headless/visual/grass_view_cards_report.mjs`. The visual
set uses eight bus-height poses (14/24 m field-centre distances, 0/45/90/180°),
LOD2 references and a 30–60° orbit. Original geometric LOD3 restoration, zero
GL errors, unchanged capture metadata through motion and default-disabled
helpers are checked. Images, raw samples and the split-view report live under
`tests/artifacts/screens/grass_debug_v2/transition_lab/view_cards_coverage/`.
The original card screenshots and report remain in `view_cards/` as historical
evidence; they are not visual pass/fail baselines.

#### Initial trial (historical; before coverage correction)

The first trial used circular source patches, upright camera-facing billboards,
large random placement offsets and 4/9/16 cards per square metre. Its dense
clumps, bare holes and brighter shading motivated the revised strips above.

RTX 3060 / Chrome, 1920 × 1080, DPR 1; GPU milliseconds **above matched soil**:

| Configuration / view | Original LOD3 | 16 cards/m² | 9 cards/m² | 4 cards/m² |
|---|---:|---:|---:|---:|
| Full distance LODs / front | 1.715 | 1.631 | 1.203 | 0.855 |
| Full distance LODs / rear | 1.667 | 1.563 | 1.157 | 0.781 |
| Full distance LODs / border | 1.684 | 1.501 | 1.032 | 0.780 |
| LOD3 only / front | 4.796 | 2.606 | 1.673 | 0.959 |
| LOD3 only / rear | 4.357 | 2.575 | 1.606 | 0.908 |
| LOD3 only / border | 3.166 | 2.073 | 1.298 | 0.757 |

Six paired rounds × 30 samples per mode/view, interleaved with soil in rotated
and reversed order; no outlier filtering. Shadows remain enabled/cached.
Average full-scene grass savings are 7.3% (16), 33.0% (9), 52.3% (4), with
visibly lower coverage at smaller densities. The moving CPU selection+batch
cost averaged 0.349 ms/frame for original leaves and 0.308–0.312 ms/frame for
cards. These are debug-lab measurements, not whole-game budgets.

### Field layout

Four 32 × 32 m fields form a 2 × 2 layout, separated by 1 m soil paths. The total
planted area is 4,096 m². Every field contains 1 m selection cells; the same
four source quadrants from a 2 × 2 m grass template are instanced across them.
LOD0 uses the current smart geometric LOD0, not the older full reference mesh.
LOD3 offers compact geometric leaves or the calibrated near cards. LOD4 uses
the wider-card bridge. LOD5 uses the paired opaque canopy albedo, normal and
roughness maps at 1024².

The user-confirmed first four nominal switches, plus the experimental 32 m
far-canopy switch (updated 2026-10-05), are below. The default
50% transition band now mixes adjacent levels over the latter half of each range.

| Level | Full distances | Half distances |
|---|---|---|
| LOD0 | 0–0.6 m | 0–0.3 m |
| LOD1 | 0.6–0.8 m | 0.3–0.4 m |
| LOD2 | 0.8–1 m | 0.4–0.5 m |
| LOD3 | 1–16 m | 0.5–8 m |
| LOD4 | 16–32 m | 8–16 m |
| LOD5 | ≥32 m | ≥16 m |

The original transition-lab benchmark tables later in this document predate this
distance edit and retain their specified 1 / 3 / 6 / 25 m switches. The newer
lighting, boundary and band comparisons explicitly use 1 / 2 / 5 / 18 m.
The card comparison captures/benchmark also explicitly retain 1 / 2 / 5 / 18 m.
With the current defaults, LOD3→4 blends from 8.5 to 16 m and LOD4→5 from 24 to 32 m.
Historical sections below retain their original LOD4 canopy terminology and timings.
The independent side-leaf cutoff remains 35 m.

Distances are horizontal, from the camera's ground projection to each cell's
center. This lets the 4.5 m-high gameplay bus camera exercise near bands.
At the outer threshold every cell selects the more distant level. A 1 m cell
introduces up to approximately 0.71 m of spatial quantization. The default pixel
blend replaces each patch progressively. The previous whole-patch switching
method remains available in the Method control.

## Transition band ranges

The `Transition band` control defaults to 50% of each preceding LOD range.
For a range from `previous` to `end`, the band starts at
`end - (end - previous) * fraction`. The first range starts at zero.

| Transition | Full distances | Half distances |
|---|---|---|
| LOD0 → LOD1 | 0.5–1 m | 0.25–0.5 m |
| LOD1 → LOD2 | 1.5–2 m | 0.75–1 m |
| LOD2 → LOD3 | 3.5–5 m | 1.75–2.5 m |
| LOD3 → LOD4 | 11.5–18 m | 5.75–9 m |

## Blending inside each patch

Pixel blend is the default. Both adjacent LODs are submitted only inside a band
and its cached movement margin. A smoothstep coverage value follows the current
camera every rendered frame, independently of CPU batch updates. Complementary
8 x 8 screen-door samples discard before material sampling/lighting, preserve
opaque depth, and need no extra texture, transparency sorting or frame noise.
Vertices compute the horizontal distance from their shared instance center.
Outside the candidate bands, ordinary materials remain unchanged.

The litter floor remains opaque under mixed LOD3/4 cells. Its projected edges
do not coincide with the raised canopy at oblique angles; fading both floors
caused dark pinholes. The canopy replaces the floor through normal depth testing.
This adds ground overdraw locally inside the band, not across distant fields.
Canopy edge profiles use the candidate support envelope, placing geometry changes
outside the visible fade. Texture resolution and cached scene shadows are unchanged.

The selector still uses squared distances, borrowed arrays, 50 ms / 0.2 m gates.
Candidate support extends by movement threshold + interval times the maximum lab
speed (25 m/s including Shift), currently 1.45 m. This avoids missing LODs between
scans; a teleport beyond that support forces an immediate safety update. The
conservative margin increases vertex work, especially in the tiny near ranges.
Dominant-LOD counts/colors do not include both submitted candidates; the triangle
counter includes all submitted geometry. `transition=0` restores abrupt switching;
`transitionMode=patches` selects the earlier spatial method. Both full/half presets
scale band ends and starts. Helper rings remain dashed at starts, solid at ends.

Eight bearings at the bus height/tilt and front/rear 6 m drives are captured in
`tests/artifacts/screens/grass_debug_v2/transition_lab/blending/`. At 24 checkpoints
per drive the same camera pose is rendered before/after a forced batch rebuild.
Pixels changing by more than 3/255 fell from 244,865 to 2,126 (front) and 238,968
to 2,118 (rear), about 99%. These are summed update discontinuities, not a claim
that all camera-motion aliasing disappears. A rendered coverage probe checks all
four LOD pairs at five fractions in both draw orders, with no missing samples.
Fine stippling is visible at intermediate coverage; LOD4 still has less parallax.

Paired RTX 3060 timings at 1920 x 1080, six rounds of 30 samples per variant and
matched soil, rotating/reversed order with pre-uploaded actual batches and cached
shadows, in GPU milliseconds **above soil-only**:

| Pose | Abrupt | Previous patches | Pixel blend | Added vs patches, 95% CI |
|---|---|---|---|---|
| Front | 1.299 | 1.048 | 1.701 | 0.652 +/- 0.053 |
| Rear | 1.150 | 0.942 | 1.597 | 0.655 +/- 0.081 |
| Border | 1.218 | 0.890 | 1.642 | 0.752 +/- 0.030 |

Three real 60-frame movement runs average 0.382 ms/frame for selection plus batch
updates with blending, versus 0.260 ms/frame for patches. Stationary measured
blocks perform no scans, instance uploads or shadow regenerations. No new texture
maps are allocated; additional material variants and instance buffers are cached.
Run visual/perf `grass_transition_blending.pwtest.js`, then
`node tests/headless/visual/grass_transition_blending_report.mjs` for the comparison.

## Previous spatial patch method and measurements

These measurements predate per-pixel blending and apply to `transitionMode=patches`.

A deterministic world-coordinate rank assigns each patch a switch distance
inside its band. Inverse smoothstep distributes the ranks so the proportion of
the farther LOD changes gently near both ends. Ranks and squared thresholds are
precomputed; scans retain squared-distance comparisons and reuse their arrays.
The selection storage adds approximately 160 KiB for 4,096 cells. Camera rotation,
returning to a previous position and changing batch order never reshuffle ranks.

`transition=0` in the URL, or 0% in the control, restores the abrupt reference.
Values through 100% are supported; full/half presets scale both ends. Helpers use
dashed start rings, solid end rings and the actual patch colors. This is a spatial
mixture, not a temporal fade: 1 m patch changes and reduced LOD4 parallax remain
visible from some angles. The earlier LOD4 coverage trades geometric detail for
lower rendering cost. Texture maps, materials, shaders and terrain coverage are
unchanged, with one opaque LOD and one ground surface per patch.

Eight bus bearings and front/rear 6 m drives were captured. Each 120-frame drive
performs 24 scans at 3 m/s with the 50 ms / 0.2 m gates. The largest side-connected
group of simultaneously changed cells decreases from five to three; the average
largest group per scan falls from 2.75 to 1.96 / 2.00. This measures grouping, not
perceptual invisibility. All 16 static captures retain exactly one LOD and one
ground surface per cell, with no WebGL errors or moving shadow regeneration.

Paired RTX 3060 measurements, 1920 × 1080 / DPR 1, 1 / 2 / 5 / 18 m switches,
game lighting, 4× filtering and cached edge/corner strips, in GPU milliseconds
**above the same pose's soil-only cost**:

| Pose | Abrupt | 50% band | Paired saving, 95% CI | Draw calls |
|---|---|---|---|---|
| Front | 1.295 | 1.102 | 0.193 ± 0.051 | 70 → 90 |
| Rear | 1.210 | 1.024 | 0.186 ± 0.124 | 70 → 91 |
| Border | 1.362 | 1.063 | 0.299 ± 0.178 | 57 → 77 |

Six rounds of 30 hardware samples interleave pre-uploaded actual grass batches
and matched soil batches in each RAF, with rotating/reversed order and cached
shadows. Helpers are excluded. More canopy edge shapes increase calls, while
earlier LOD4 selection reduces submitted triangles. Active textures remain
78.29 MB. Existing shape caches retain geometry and instance buffers as different
arrangements are encountered; this is not an allocation-free transition mode.

Three 60-frame, 3 m CPU drives averaged:

| Configuration | Scans | Selection total | Batch total | Combined per frame |
|---|---|---|---|---|
| Abrupt, 100 ms / 0.25 m | 10 | 0.70 ms | 13.87 ms | 0.243 ms |
| Abrupt, 50 ms / 0.2 m | 12 | 0.73 ms | 14.90 ms | 0.261 ms |
| 50% band, 50 ms / 0.2 m | 12 | 0.60 ms | 13.77 ms | 0.239 ms |

Stationary blocks perform no scans, uploads or shadow regenerations. These CPU
samples are short diagnostic measurements, not proof of a CPU speedup.
Run the selected visual/perf `grass_transition_bands.pwtest.js` suites and then
`node tests/headless/visual/grass_transition_bands_report.mjs` to rebuild the
slider, motion playback and raw evidence in
`tests/artifacts/screens/grass_debug_v2/transition_lab/bands/`.

## Camera and panel

The bus front, rear and field-border presets use the same gameplay height,
pitch and 55° vertical field of view. An overhead preset exposes the assignment
layout. WASD moves along the horizontal plane using the camera heading,
independent of its tilt; Q/E lowers/raises the camera. Middle-mouse drag looks
around. R restores bus height (4.5 m), bus downward tilt and zero roll while
preserving horizontal position and heading. It does not trigger while editing
controls. Reset view still returns to the entire selected preset. Speed and
forward driving help inspect moving borders.

The top-right Collapse/Expand button hides the edit controls while retaining a
compact heading and the reopening control. It exposes `aria-expanded` and
`aria-controls`, supports keyboard activation, and leaves error/status messages
available while collapsed.

## Material continuity and game daylight

The transition lab uses `GrassDebugV2Lighting` and the game's lighting/atmosphere
resolvers, including saved overrides. The source manifest is geometry metadata;
its old extra hemisphere intensity of 12 must not overwrite the game lighting.
The calibrated defaults are sun azimuth 45°, elevation 55°, intensity
162.714329883607, linear RGB `[1, 0.8587931781765412, 0.6757006518788592]`,
exposure 0.0511001705221839, hemisphere intensity 0, and environment
`ibl.calibrated.clear_afternoon_55`. The visible sky, sun effects, live directional
light and tile self-shadow capture all read that resolved sun. Compiled tile
layout and compressed-map sun compatibility checks remain enforced.

Geometric LODs share a material response. Existing distant diffuse filtering
and tip compression now start at the LOD3 switch and finish at the LOD4 switch,
instead of continuing until 30 m after switching to LOD4 at 18 m. Editing either
range or choosing half distances updates the existing uniforms once; there is
no new per-frame CPU calculation. As before, material filtering uses view-space
range while cell selection uses horizontal distance. Finishing filtering slightly
before the horizontal switch avoids carrying full leaf contrast into the boundary.

`GRASS_TRANSITION_CANOPY_COVERAGE` scales the existing oblique coverage exponent
by `0.6 + 0.55 * viewElevation`, matching the shortened leaf volume. It is enabled
only in this lab and does not change the underlying tile maps or the single-field
reference. This appearance calibration alone adds no texture fetch, pass, draw, allocation,
LOD fade or dither. The optional transition method is described separately above. The geometric filter strength (.85) and maximum tip compression
(.3 above the rooted lower 4 cm) remain unchanged.
The existing leaf-only base-color multiplier is `[1.04, 1.03, 1.02]`, calibrated
from linear diffuse radiance divided by rendered grass coverage, with litter
removed from the probe. Litter's material color is unchanged. This removes the
small mean grass energy bias without adding shader operations.

The visual check `tests/headless/visual/specs/grass_transition_lighting.pwtest.js`
compares identical patches at 14 / 18 / 24 m across 32 bearings at the gameplay
bus height/tilt. It renders separate grass masks and isolated leaf diffuse
radiance, with litter excluded. Sixteen intermediate bearings are holdouts.
At the 18 m switch the mean contrast gap falls from 5.29 to 2.03 display-luminance
levels (62%); absolute green coverage mismatch falls from 2.85 to 0.48 percentage
points. Patch-mean RGB RMS gap is 1.54/255, down from 1.91. Mean leaf-only linear
RGB ratios (LOD4/LOD3) are `[1.0002, 1.0010, 0.9985]`; per-angle mean absolute
channel deviation is 2.67%, and every tested channel is within 8.5%. These metrics do not
establish identical silhouettes: flat LOD4 still lacks leaf parallax.

Paired hardware timing at 1920×1080 / DPR 1 on RTX 3060, with the current
1 / 2 / 5 / 18 m ranges and game lighting, measures GPU cost **above soil-only**:

| Pose | Previous response | Updated response | Paired saving, 95% CI |
|---|---|---|---|
| Front | 1.433 ms | 1.345 ms | 0.087 ± 0.168 ms |
| Rear | 1.133 ms | 1.120 ms | 0.013 ± 0.043 ms |
| Border | 1.302 ms | 1.194 ms | 0.109 ± 0.071 ms |

Front/rear differences are inconclusive; no reliable regression was measured.
The benchmark uses six rounds of 30 samples with old/new/soil interleaved per
RAF and matched cached shadows. No shadow regeneration or instance uploads occur
inside timed blocks. Texture residency is unchanged. Captures, raw measurements,
timings and the before/after slider are under the ignored
`tests/artifacts/screens/grass_debug_v2/transition_lab/lighting/`; rebuild the
report with `node tests/headless/visual/grass_transition_lighting_report.mjs`.

## Watertight canopy corners (2026-10-03)

The remaining dotted dark line at the geometric/canopy boundary included real
holes. Four-neighbor ramps could drop one tile to the 5 mm litter floor while a
diagonally adjacent canopy tile kept its corner at 100 mm. The resulting 95 mm
height disagreement left narrow triangular gaps. Removing the ramp enlarged the
open seam; widening it enlarged the triangular gaps. Disabling shadows retained
them. Those ablations are captured under the `boundary/` artifacts below.

Recommended edge strips now account for diagonal geometric cells as well as the
four edge neighbors. `GrassDebugV2TransitionCanopy` builds matching corner/edge
positions once per profile and caches the instanced meshes. Physical field edges
still meet soil at zero; internal boundaries meet litter at 5 mm. The existing
world-space maps and canopy lighting normals are retained. No leaf recoloring,
texture rebake, shader edits, extra texture fetches or blending logic are used.
The repaired strips use the existing flat-canopy material with authored vertex
heights, so they no longer need per-instance ramp attributes or vertex deformation.
The historical grid configuration remains unchanged for comparison.

The transition HTML import map pins the floor-material module to the version
that exposes the leaf-color uniform. This also covers imports inside older cached
canopy modules. Without the pin, the new asset loader could dereference a missing
`grassFloorLeafColorScale.value` and prevent startup. The entry and field module
URLs are revised with the corner repair. The cache regression E2E serves the old
unversioned floor module and verifies that the lab requests the compatible module,
finishes loading, and retains the calibrated leaf color.

The boundary visual test checks eight bus-height bearings, all shared canopy
edges, and both sides' edge subdivision positions. Previously 22–86 shared edges
per view disagreed; all repaired edges agree within 0.01 mm. It also checks a
120-frame drive and zero stationary uploads. Coverage, chunk/filter restoration
and the original transition E2E tests remain applicable. The flat canopy still
has less leaf parallax; eliminating geometric cracks does not eliminate every
visual difference at an abrupt LOD switch.

RTX 3060 GPU time above matched soil-only, 1920×1080 / DPR 1, same game lighting,
1 / 2 / 5 / 18 m ranges, six paired rounds of 30 samples:

| Pose | Previous strips | Repaired corners | Paired saving, 95% CI | Draw calls |
|---|---|---|---|---|
| Front | 1.413 ms | 1.410 ms | 0.003 ± 0.196 ms | 69 → 70 |
| Rear | 1.182 ms | 1.135 ms | 0.047 ± 0.028 ms | 69 → 70 |
| Border | 1.264 ms | 1.216 ms | 0.047 ± 0.050 ms | 55 → 57 |

No regression is demonstrated; front/border differences remain within uncertainty.
The timing harness reconstructs the previous simple-strip batches with their
original geometry/material/instance attributes and freezes both versions before
interleaved timing. No uploads or shadow regeneration occur in measured blocks.
Texture allocation remains unchanged at 78.29 MB for the active maps.

Run `tests/headless/visual/specs/grass_transition_boundary.pwtest.js` and the opt-in
`tests/headless/perf/specs/grass_transition_boundary.pwtest.js` with the selected
test runner. Generate the report with
`node tests/headless/visual/grass_transition_boundary_report.mjs`. Evidence lives
in `tests/artifacts/screens/grass_debug_v2/transition_lab/boundary/`.

## CPU and draw-call policy

Selection compares squared distances and reuses typed arrays. With the default
settings, it scans only after at least 0.2 m of horizontal movement and at
least 50 ms since the last scan (at most 20 scans/second). Stationary and rotation-only frames perform
no cell scan. Editing limits or choosing a preset forces an immediate refresh.
Both gates can be edited, including zero for a per-moving-frame comparison.

Per-field, per-LOD and per-template instancing retains 80 original main batches,
plus four flat interior LOD4 batches (one per field) and lazily allocated batches
for the selected edge masks. The default uses strips instead of border grids.
Instance buffers upload
only when batch membership changes. Whole-field
batch bounds support normal frustum culling; this first version does not cull
individual instances on the CPU each frame. Snapshots expose selection scan
time, skips, visited cells, changes, instance uploads and application time.

LOD0–3 cells use one merged litter/soil ground layer. LOD4 replaces that ground
with its opaque canopy. Soil-only mode replaces all field surfaces with soil;
paths and surroundings have holes under the fields, avoiding a second floor.
Field bevels and LOD2 fringe leaves occur only at actual field perimeters.
An exposed LOD4 edge next to a geometric LOD slopes down over 5 cm to meet
the litter floor, closing the otherwise visible gap beneath the raised canopy.
Adjacent LOD4 cells stay flat and continuous; no duplicate fringe grass or
opacity transition is added at internal cell borders.
World-space UVs preserve the canopy pair's phase across instance boundaries.

LOD4 side/fringe leaves are omitted when their selection cell's horizontal
distance exceeds 35 m. The separate `LOD4 sides (m)` control adjusts this
absolute cutoff; full/half presets do not scale it, and zero hides all side
leaves. Visibility is classified in the same cached distance scan as the LOD,
including updates that cross only the side-leaf cutoff. Hidden fringe instances
are removed from draw batches, while the canopy surface and cached shadows
remain unchanged. LOD0–3 leaves are unaffected.

The scene caches an 8192² directional shadow map from LOD2 geometry. Distance
selection changes reuse it. Switching to/from soil-only regenerates the cache
outside benchmark samples. LOD4 uses its baked tile self-shadow visibility,
using a compile-time baked-only shadow path because this lab has no external
occluders. It eliminates the white external-visibility lookup and unused live
shadow branch after baking. The shared canopy material defaults to the general
path, preserving external shadows in the single-field lab. Any future external
occluder in this lab must opt out of `GRASS_CANOPY_BAKED_SHADOW_ONLY` and provide
the matching external-visibility cache.
Canopy self-shadow maps remain separate. This lab
does not include the single-field lab's shade-screen object.

## Helpers and measurement

Colored cell overlays, field outlines and labeled distance rings show the
selected LOD areas. The legend lists cell counts. Helpers are off by default,
can be enabled with “LOD colors and distance rings”, and remain disabled for
all timing samples. The HUD's GPU number is explicitly the
total scene cost; the benchmark report subtracts a matched soil-only baseline.
The bottom status also shows actual submitted triangles and draw calls from
the renderer's accumulated frame counters, including postprocessing and any
enabled helpers. Frustum-culled batches are excluded; these counts differ
from the field snapshot's total assigned geometry. Reading the counters adds
no extra render or per-mesh traversal.

The `Configuration` selector also offers `LOD4 only · flat, no sides`, linked
by `?configuration=lod4-flat`. It forces all 4,096 cells to LOD4, replaces each
canopy grid with a two-triangle horizontal quad at the existing canopy height,
and omits the bevel, side leaves, and all LOD0–3 geometry. Soil is not drawn
below the canopy. Distance controls are disabled but retain their values.
Returning to `Distance LODs` restores normal selection and beveled geometry.
Flat mode performs no distance scans or instance uploads while moving; helpers
can still display cell colors/outlines, but distance rings are hidden.
The shadow cache in flat mode contains no hidden LOD2 casters. Switching
configurations refreshes it once; tile self-shadow visibility remains baked.
Each LOD control stacks its label, full-distance input and half-distance readout
in one column. Equal-width full/half preset buttons align with those two rows.

Run the focused E2E through `node tools/run_selected_test/run.mjs` with
`tests/headless/e2e/grass_debug_v2_transition_scene.pwtest.js` selected.
Pure selector behavior is covered by
`tests/node/unit/grass_debug_v2_transition_selection.test.js`.

The scene E2E validates every cell's selected level and single ground surface,
stationary/rotation reuse, movement gates and the three gameplay camera poses.
GPU probes check world-continuous soil/canopy UVs and the internal edge height.
The half-range capture checks the former dark gap, while the compiled shader
check verifies the baked-shadow branch and white external visibility texture.

For hardware timing, select
`tests/headless/perf/specs/grass_transition_lab.pwtest.js` and set
`GRASS_TRANSITION_BENCHMARK=1`. The benchmark uses 1920 × 1080 at DPR 1,
three fixed bus poses and one matched moving path. Soil-only, full distances
and half distances first receive an untimed 120-frame startup soak at every
fixed pose, then rotate order across six rounds. Each block has 30 warmup
frames and 60 measured GPU queries. Preparation and shadow regeneration are
outside measured blocks. Invalid/disjoint or software-GPU timings fail.

The report presents total scene GPU time and paired **grass scene minus soil
scene** time, with intervals calculated from the six round means. CPU frame
submission, selection scans and buffer application are reported separately.
The difference includes litter and canopy work, not just leaf triangles.
Artifacts, captures and raw samples live in the gitignored directory
`tests/artifacts/screens/grass_debug_v2/transition_lab/`.

The 2 m source repeats intentionally so this lab isolates LOD behavior. It is
not a new procedural field-distribution system. Abrupt silhouette and texture
changes remain visible at cell boundaries and are subjects for the next tuning
pass; the scene intentionally does not conceal those differences with fading.

## Initial hardware measurements

Measured before the side-leaf cutoff optimization on 2026-10-02 using Chrome/ANGLE Direct3D11 on an NVIDIA GeForce
RTX 3060, at 1920 × 1080 and DPR 1. These are paired mean GPU milliseconds
**above the matching soil-only scene**, including litter, canopy and leaves:

| View | Full distances | Half distances |
|---|---:|---:|
| Bus front | 3.286 ms | 2.647 ms |
| Bus rear | 3.376 ms | 2.690 ms |
| Field border | 3.545 ms | 2.192 ms |
| Moving border | 3.952 ms | 2.049 ms |

The three stationary views average 3.402 ms versus 2.510 ms of additional
GPU cost (about 26% less at half distances). The full ranges remain the default
because the half preset brings the visible flat-canopy boundary to 12.5 m.
The report contains all individual samples, total costs and confidence
intervals; desktop GPU workload and clocks were not locked.

Stationary and rotation-only frames need no repeated selection scans. The
moving benchmark averages 9–10 scans per 60 rendered frames. Selector plus
instance-update CPU cost averages 0.201 ms/frame at full distances and
0.126 ms/frame at half distances, versus 0.629 and 0.386 ms when recalculating
each moving frame. This is approximately a 68% / 67% reduction in that CPU
work, not in total frame time.

An earlier complete run showed startup timing variation and is retained under
`transition_lab/post_fix_initial/`; the final complete repeat adds the startup
soak described above. Neither run filters individual samples or outliers.
An initial implementation's pre-repair measurements are separately retained
under `transition_lab/before_fix/` and are not the final reported strategy.

## Almost-all-LOD4 cost audit

The screenshot configuration (0.1 / 0.2 / 0.3 / 0.4 m, half preset,
5 m side-leaf cutoff) is reproduced by the opt-in hardware test
`tests/headless/perf/specs/grass_transition_lod4_cost.pwtest.js`, using
`GRASS_TRANSITION_BENCHMARK=1` through the standard runner.
Artifacts and the readable report are under `transition_lab/lod4_cost/`.

The 2026-10-02 audit checked one ground surface per cell, opaque depth-writing
canopy materials (no alpha test or blending), and zero shadow-map submissions
on steady frames. The front view submits 131,095 triangles / 19 calls versus
8,247 / 7 for soil. Its 4,095 visible canopy instances each submit 32 triangles;
the one LOD0 cell and the near side-leaf batches are outside the camera frustum.
The grid supports perimeter and exposed-LOD boundary ramps, but still uses
that same grid in flat interiors. There is no extra soil beneath the canopy.

At 1920 × 1080, DPR 1, on the RTX 3060, six rotated timing rounds produced:

| Bus view | LOD4 above soil | Single texture scale above soil | Soil shader on canopy geometry above soil |
|---|---:|---:|---:|
| Front | 2.543 ms | 2.555 ms | 0.494 ms |
| Rear | 2.315 ms | 2.290 ms | 0.215 ms |
| Border | 2.009 ms | 2.017 ms | 0.265 ms |

Both diagnostic substitutions retain instance and triangle counts. The soil
material does not apply the canopy's vertex bevel, so it is not a pure
geometry-only measurement. Its large saving points to canopy shading as the
main overhead; reducing only the distance-scale blend gave no measurable
benefit in these views. The full material includes normal/roughness and baked
visibility sampling, separate grass/litter lighting, view coverage, and the
near/far radiance blend. These diagnostics do not change production visuals.

The raw report retains all samples, confidence intervals, and three poses of
each case. GPU clocks and other desktop activity were not locked; front-view
rounds varied noticeably. Optimize the material first, then consider simple
interior quads with separate edge geometry, validating appearance and timing.

## Flat-only decomposition

Select `tests/headless/perf/specs/grass_transition_lod4_decomposition.pwtest.js`
with `GRASS_TRANSITION_BENCHMARK=1`. The test uses the flat-only configuration,
with 8,192 field triangles and no side geometry. It compares each independent
shader ablation with full LOD4 and soil within the same animation cycle,
rotating submission order. Six rounds per bus pose contain 6 warmup and 30
measured triplets, after a 60-frame startup soak per case. Pre-uploaded copies
of the existing soil batches avoid per-sample instance uploads or shadow
regeneration. Each render receives a separate GPU timer query. Helpers are off.

The initial unpaired experiment varied several-fold under desktop GPU load
and was stopped; its completed front-view data is retained under
`transition_lab/lod4_decomposition/noisy_unpaired/`. The final report uses the
paired method, all samples, and confidence intervals across six round means.
Its full-versus-full control is consistent with zero difference. Individual
feature removals affect shared calculations and compiler dead-code elimination;
their measured savings must not be added as an exact component-time breakdown.

Measured on 2026-10-02 at 1920 × 1080, DPR 1, RTX 3060:

| Experiment | Front | Rear | Border |
|---|---:|---:|---:|
| Full flat LOD4 above soil | 0.850 ms | 0.850 ms | 0.680 ms |
| Extra cost of 32-triangle flat cells vs 2-triangle cells | 0.832 ms | 0.652 ms | 0.454 ms |
| Saving from 8× to 4× anisotropic filtering | 0.404 ms | 0.464 ms | 0.293 ms |
| Saving from removing all shadow visibility | 0.633 ms | 0.550 ms | 0.583 ms |
| Saving from removing HDR environment lighting | 0.261 ms | 0.216 ms | 0.191 ms |

The normal-detail, angular-color, view-coverage, standard-direct-lighting,
specular-only and single-texture-scale removals did not show a reliable saving
across these views. Normal RGB and roughness G share textures with grass
coverage/litter RGB; the flat-normal experiment retains the alpha sample and
does not claim to eliminate the normal-map fetch. Unlit-albedo and constant
color cases provide lower bounds, with visible loss of lighting fidelity.

A follow-up (`GRASS_LOD4_VISIBILITY_FOLLOWUP=1`) kept baked tile shadows and
removed only the white external lookup and live-shadow branch. It saved
0.680 / 0.550 / 0.515 ms for front/rear/border, leaving
0.216 / 0.299 / 0.178 ms above matched soil. All three captured scene regions
(1,286,400 pixels each, excluding UI/telemetry) matched full LOD4 exactly.
This identifies overhead in the general shadow path; discarding self-shadows
is not required for that saving. The fast path is now enabled for transition
canopy materials after baking. Scenes with external occluders retain the general
path. Filtering and geometry changes remain isolated experiments.

Raw samples, three poses per experiment, the interactive report, the follow-up
and pixel-equivalence measurements are under
`tests/artifacts/screens/grass_debug_v2/transition_lab/lod4_decomposition/`.
The scene E2E checks preset switching, flat geometry, zero fringe instances,
retained distance settings, and no per-movement scans/uploads/shadow rebuilds.

## Elevation, fringe and shadow factors

The Configuration selector additionally exposes `lod4-ground` (two-triangle
cells at ground level), `lod4-elevated` (the existing 10 cm canopy and 5 cm
perimeter ramp), and `lod4-elevated-sides` (that canopy plus side grass).
All force 4,096 LOD4 cells without a ground layer underneath. The side-grass
preset has its own cutoff input, sharing the retained 35 m setting. It uses
the cached movement/interval gate and classifies only true perimeter cells.
The other forced presets do no moving-camera selection scans. Distance ranges
remain disabled and preserved while any forced LOD4 preset is selected.

The Shadows checkbox disables renderer shadow mapping, including LOD4's
baked visibility multiplication. Authored texture color and ambient occlusion
remain. Re-enabling refreshes the cache once, outside steady-frame timings.

The opt-in `tests/headless/perf/specs/grass_transition_lod4_factors.pwtest.js`
compares 13 cases in front/rear/border bus poses. A same-geometry height change
isolates elevation; a flat 32-triangle grid isolates tessellation; enabling the
vertex ramp isolates bevel deformation; 35 m and 200 m side-leaf cutoffs then
isolate fringe geometry. Shadow probes separately remove tile visibility,
scene shadow receiving, or all shadow mapping. The previous general shader is
retained only on benchmark clones for paired performance and pixel equivalence.

Each animation cycle submits the variant, its named reference, and each one's
matched soil baseline in rotating order. All receive separate hardware GPU
queries. Six rounds use six warmup and 30 measured quartets after program/texture
warmup. Prebuilt empty and grass shadow caches and pre-uploaded soil/fringe
batches avoid shadow rendering, instance uploads and LOD scans during sampling.
Disabling scene shadows still retains the baked canopy visibility; disabling
all shadows compiles out shadow mapping. Shadow toggle setup is outside the
reported CPU submission timer. CPU numbers describe render submission, not
interactive checkbox changes. Confidence intervals use the six round means;
all samples are retained. Independent ablations are not additive stage timers.

Artifacts, raw timings, draw audits, pixel-equivalence checks and the interactive
three-pose comparison are under `transition_lab/lod4_factors/` within the usual
`tests/artifacts/screens/grass_debug_v2/` root.

The 2026-10-02 run (RTX 3060, 1920 × 1080, DPR 1) measured these GPU milliseconds
above each configuration's matched soil baseline:

| Configuration | Front | Rear | Border |
|---|---:|---:|---:|
| Optimized raised quad, no sides | 0.299 | 0.292 | 0.355 |
| Elevation + bevel, no leaves | 0.722 | 0.732 | 0.594 |
| Elevation + side grass within 35 m | 0.746 | 1.072 | 0.829 |
| Same elevation + side grass, all shadows off | 0.678 | 0.871 | 0.586 |

Paired comparisons showed a 0.512 / 0.627 / 0.526 ms saving from the production
shadow fast path. Adding the flat 32-triangle grid cost 0.459 / 0.391 / 0.548 ms;
adding side grass within 35 m cost 0.050 / 0.384 / 0.259 ms. Grid cost is separate
from elevation: height alone and bevel deformation did not show a consistent
significant penalty across all views (height in the border pose added 0.091 ms).
Removing every shadow from the side-grass case saved 0.191 / 0.190 / 0.306 ms
of raw scene GPU time, but also made the grass visibly brighter. Disabling
only scene-shadow receiving did not produce a reliable saving across views.
All steady-frame shadow-map draw counts were zero.

The report preserves confidence intervals and raw totals: desktop GPU clocks
were not locked, so absolute costs from different blocks should not be
subtracted. The equivalent-shader recheck differed by at most one RGB level
in 14 / 17 / 12 of 2,073,600 pixels. The initial strict bit-exact assertion
failed on 12 one-level pixels in the border view; timings had completed and
were retained. A capture-only replay completed the visual checks and cleanup
using the documented one-level tolerance. This replay is available with
`GRASS_LOD4_FACTORS_CAPTURE_ONLY=1`; it never replaces timing samples.

`grass_debug_v2_canopy_external_shadow.pwtest.js` separately verifies the
single-field lab retains the general material and a nonconstant 2048² external
visibility cache. Replacing that cache with white brightened 9,670 probe pixels;
the transition optimization did not remove the shade-screen shadow.

## Interior quads and retained rendering versions

The default `LOD4 version` is `Interior quads + shadow fix` (`optimized`).
An LOD4 cell uses a two-triangle quad if it is away from the true field
perimeter and all four orthogonal neighbors are also LOD4. Other LOD4 cells
retain the original 32-triangle grid, its field bevel and its exposed-LOD
boundary ramp. World-space texture coordinates preserve the phase when a
cell changes batch. Classification runs during changed assignment rebuilds,
not every frame. Side grass retains its independent distance cutoff.

The selector also provides `Shadow fix only` (`shadow`) and
`Original · before both fixes` (`original`). The latter restores both the
general shadow shader and the grid for every LOD4 cell; it reconstructs the
rendering strategy before the two optimizations within the same current scene.
All versions share camera, distances, assets and texture memory. URL parameter
`optimization=original|shadow` retains the comparison choice. Version changes
do not regenerate shadows. The four new instance buffers require 256 KiB;
retained original materials share textures and shader uniform state.

With all 4,096 cells in LOD4, 3,600 interior cells use quads and 496 edge cells
retain grids. Canopy triangles fall from 131,072 to 23,072 (82.4% fewer), before
fringe leaves, culling and scene/postprocessing geometry. Up to four extra
visible draws trade a small submission overhead for much less tessellation.
The explicit ground/flat diagnostic presets remain two-triangle cells in all
versions because those configurations intentionally have no bevel.

The opt-in `tests/headless/perf/specs/grass_transition_lod4_versions.pwtest.js`
compares all three versions against soil in six rotated/reversed paired rounds
of 30 same-animation-cycle quartets. Every camera/version gets 45 startup
frames and each round gets six warmup quartets. Frozen copies of production
batches preserve instance-specific edge flags while sharing materials and
textures. Shadows are enabled, cached, and never regenerated in timed frames.
It also captures all versions in three poses for forced LOD4, full distances
and half distances, followed by three real 60-frame moving-camera checks per
version. Earlier factor/shadows-disabled reports remain available unchanged.

2026-10-02, RTX 3060, 1920 × 1080, DPR 1; GPU milliseconds above matched soil:

| Configuration / view | Original | Shadow fix only | Interior quads + shadow fix |
|---|---:|---:|---:|
| LOD4 + sides / front | 1.454 | 1.032 | 0.649 |
| LOD4 + sides / rear | 1.466 | 0.861 | 0.671 |
| LOD4 + sides / border | 1.088 | 0.522 | 0.290 |
| Full distances / front | 2.280 | 2.059 | 1.920 |
| Full distances / rear | 2.101 | 2.043 | 1.844 |
| Full distances / border | 2.180 | 2.177 | 2.031 |
| Half distances / front | 1.755 | 1.399 | 1.097 |
| Half distances / rear | 1.494 | 1.190 | 0.905 |
| Half distances / border | 1.409 | 1.109 | 0.933 |

Desktop GPU clocks and load were not locked. In particular, the LOD4 front
and rear absolute estimates have wide confidence intervals. Paired savings
against the original are consistently positive in all nine configurations.
The geometry-only saving versus shadow-fix-only crosses zero at 95% confidence
for LOD4 rear and full-distance front; do not claim a proven improvement in
each individual view. No samples are filtered. The report retains round means,
confidence intervals and raw samples under `transition_lab/lod4_interior_quads/`.

Across the nine image comparisons, optimized-versus-original mean RGB error
is at most 0.056 of 255 and the 99th-percentile pixel error is one RGB level.
The images are visually equivalent but not bit-identical: the largest isolated
channel difference is 37, with at most 93 of 2,073,600 pixels differing by more
than eight. The scene E2E additionally checks one surface per cell, interior
classification, exposed edge flags, world UV continuity and all three versions.
There are no GL/browser errors or steady-frame shadow submissions.

Each 3 m camera drive required eight selection scans over 60 frames. Mean
selection plus batch-update cost was 0.129 / 0.120 / 0.118 ms per rendered frame
for original / shadow-only / optimized, respectively. These CPU measurements
are a cache/regression check, not evidence of a CPU speedup.

## Isolated filtering, edge, lighting, compression and batch experiments

The Experiment selector under “Selection cost and helpers” exposes the independent
`baseline`, `aniso4`, `strips`, `simple_ibl`, `compressed`, `chunks4` and `chunks8`
options (`?experiment=<id>`). These isolated options retain the pre-adoption
baseline; `recommended` is now the default combined option. Isolated options do
not stack; their individual savings must not be added as a combined prediction.
The original/shadow/optimized version selector remains available separately.

- Filtering applies 4× instead of 8× to all canopy material/visibility samplers.
  Render-target textures need real GPU copies, not `Texture.clone()` with empty
  render-target storage. Diagnostic sampler overrides are owned by the shader
  hook registry so pre-render uniform refresh cannot silently undo the experiment.
- Edge strips lazily allocate the necessary inset geometry for exposed edge masks.
  A single edge uses four triangles, adjacent corner edges eight, and flat interiors
  two. World UVs, heights and per-instance exposed-edge flags remain continuous.
  All-LOD4 canopy geometry drops from 23,072 to 9,248 triangles before culling.
- Environment lighting replaces canopy PMREM lookups with six precomputed rough
  directional lobes (72 bytes of uniforms). Other scene lighting is unchanged.
- Compression exports only All-layer maps through the registered offline leaf
  `materials/grass/lod4-maps`. `?assets=compressed` bypasses runtime canopy baking;
  the normal `compressed` experiment retains both versions for comparison. The
  loader authenticates layout/map hashes and requires S3TC. See the map baker
  README for publication and loading gates. This candidate fails visual acceptance
  and is deliberately not a default.
- 4 m / 8 m chunks partition all selected grass LODs, field litter/soil and fringe
  instances for tighter frustum culling. Paths, sky and postprocessing are unchanged.
  Membership and bounds rebuild only after changed assignments; idle frames do not
  repack or upload. The prototype retains original reference batch staging, so its
  measured CPU includes that plus chunk repacking. Buffer/geometry allocations and
  uploads are exposed in the field snapshot. Returning to baseline detaches chunks.

Select `tests/headless/perf/specs/grass_transition_experiments.pwtest.js` with the
standard test runner and set `GRASS_TRANSITION_BENCHMARK=1` plus one of
`GRASS_EXPERIMENT=filtering|edges|environment|compression|chunks|adoption`. Each experiment
runs independently against the interior-quad/shadow-fix baseline. Six paired rounds
use 30 samples per variant and a common camera-matched soil scene. Preparation uses
90 frames per pose/variant, 120 warmup cycles before round one, and six before later
rounds. Shadows are enabled and cached. Timed GPU blocks perform no LOD scans,
instance uploads or shadow regeneration. CPU motion uses three real 60-frame
3 m diagonal drives at half distances. All samples, intervals and three-pose image
comparisons live in `transition_lab/experiments/` under the standard artifact root.

Measured 2026-10-02 on RTX 3060, 1920 × 1080, DPR 1. These are paired **GPU savings**
against each experiment's baseline, in milliseconds; all scene costs in the reports
also include the requested soil-only subtraction:

| Change | Front | Rear | Border | Assessment |
|---|---:|---:|---:|---|
| 4× filtering | 0.569* | 0.205 | 0.130 | Small softness; rear/border saving supported |
| Edge strips/corners | 0.085 | 0.061 | 0.045 | Nearly identical images; all three savings supported |
| Approximate environment | 0.150* | -0.029* | 0.015* | No reliable performance improvement |
| BC3 / BC1 maps | 0.126 | 0.125 | 0.087 | Faster but visible color/lighting damage |

An asterisk means the 95% confidence interval crosses zero. Desktop load and GPU
clocks were not locked; in particular, a front filtering block has large variation.
No samples are discarded. The earlier decomposition filtering diagnostic predates
the sampler/target-copy fix, so its anisotropy numbers are not the validated result.
Other earlier diagnostic results remain historical measurements.

Edge strips submit 39,877 versus 52,997 triangles in the front view, while draws
increase from 50 to 59; the border pose drops from 35 to 32 draws. Full-frame mean
RGB difference stays below 0.003 of 255 in all three views, with 99th percentile
zero. Filtering has approximately 0.9–1.0 mean RGB error; the environment candidate
stays below 0.09. Full-frame metrics include unchanged soil and sky and are not a
substitute for inspecting grass. Compression has obvious shifts despite lower cost.

Active All-layer map allocation including mips drops from **78,293,666 bytes**
(78.29 MB / 74.67 MiB) to **30,758,416 bytes** (30.76 MB / 29.33 MiB), 60.7% less.
This is format-derived logical GPU allocation, not measured process VRAM residency.
Each of two tiles uses three 1024² RGBA packed maps plus one 4096² visibility map.
BC3 preserves alpha as a data channel; BC1 stores visibility. Lossy errors in packed
normal and litter contributions cause the unacceptable appearance. Keep the offline
pipeline but evaluate a better encoder/format or uncompressed sensitive channels
before adopting compressed maps. Debug alternatives, bake targets, other scene
textures and shadow maps are excluded from the active-set comparison.

Whole-scene grass batching results, GPU milliseconds above the **same whole-field
soil-only baseline**, including additional draw overhead:

| Range / view | 32 m baseline | 4 m chunks | 8 m chunks |
|---|---:|---:|---:|
| Full / front | 1.904 | 1.655 | 1.697 |
| Full / rear | 1.737 | 1.446 | 1.447 |
| Full / border | 2.017 | 1.517 | 1.540 |
| Half / front | 1.029 | 0.955 | 1.071 |
| Half / rear | 0.896 | 0.809 | 0.782 |
| Half / border | 0.907 | 0.961 | 1.240 |

Full-range savings are significant for both chunk sizes in all three views. At
half distances only the rear saving is supported; the other intervals cross zero.
The forced-LOD4 chunk comparisons show no reliable benefit. Full/front draws rise
from 66 to 495 / 203 for 4 m / 8 m, while triangles fall from 1,491,643 to
668,281 / 862,199. Moving CPU averages 0.740 / 1.669 / 1.071 ms per frame for
32 m / 4 m / 8 m. Batch-update portions are 0.169 / 0.317 / 0.278 ms per frame.
Eight scans occur per 60-frame drive, without shadow regeneration. Eight-meter
batches are the more promising dense-grass compromise; a hybrid retaining large
LOD4 batches has not yet been implemented or measured.

`tests/headless/e2e/grass_debug_v2_transition_experiments.pwtest.js` checks one ground
surface per cell, real compiled anisotropy samplers and restoration, strip triangle
counts, chunk coverage, idle reuse and zero steady shadow regeneration across
distance, elevated and flat configurations. The original transition E2E also passes.

## Adopted filtering and edge combination (2026-10-03)

`recommended` combines 4× canopy filtering with edge/corner strips and is selected
when no experiment is specified. Canopy maps are created at 4× directly: default
loading allocates no comparison texture copies. The retained `baseline` lazily
creates 8× copies only when requested, so frozen A/B draws can coexist without
changing sampler state between measurements. The default active map set remains
78.29 MB including mipmaps. Other labs retain their existing 8× creation default.
Compressed maps, approximate lighting and chunk sizes remain opt-in experiments.

`?experiment=baseline` restores the previous 8×/edge-grid configuration. To compare
the strategy before both earlier optimizations, also set `optimization=original`.
A direct original/shadow-version URL without an explicit experiment selects the
retained baseline. Existing historical suites explicitly request baseline, while
the experiment E2E checks default adoption, zero initial comparison copies, all
eight compiled samplers, toggling/restoration, cell ownership and idle work reuse.

The combined benchmark uses the same six-round method described above, with
front/rear/border views at full and half ranges plus forced LOD4 with side grass.
Measured GPU milliseconds **above the camera-matched soil-only scene**:

| Configuration / view | Previous 8× + grids | Default 4× + strips | Paired saving |
|---|---:|---:|---:|
| LOD4 / front | 0.480 | 0.199 | 0.281 |
| LOD4 / rear | 0.443 | 0.153 | 0.290 |
| LOD4 / border | 0.355 | 0.175 | 0.180 |
| Full / front | 1.911 | 1.772 | 0.139 |
| Full / rear | 1.756 | 1.609 | 0.146 |
| Full / border | 2.017 | 1.934 | 0.083 |
| Half / front | 1.220 | 1.054 | 0.167 |
| Half / rear | 1.006 | 0.795 | 0.211 |
| Half / border | 1.103 | 0.913 | 0.189 |

All nine paired-saving 95% intervals are above zero. Half-range blocks are noisier;
raw samples are retained without filtering. These remain hardware-specific results,
with desktop clocks/load uncontrolled. Mean moving CPU is 0.843 ms/frame before
versus 0.810 after; this small difference is not claimed as a proven CPU speedup.
Each drive performs eight scans and zero shadow regenerations. Timed stationary
blocks perform zero scans, uploads or shadow regenerations.

The combined appearance is slightly softer at distance, preserving the field edges.
Mean full-frame RGB error is 0.28–0.98 of 255 across nine comparisons, including
unchanged sky/soil; inspect the image split rather than interpreting this as a
grass-only metric. Draw-call changes match the isolated strip experiment (for
example forced-LOD4/front 50 → 59 calls, 52,997 → 39,877 submitted triangles).
Images, raw timings and the split-view report are under
`tests/artifacts/screens/grass_debug_v2/transition_lab/experiments/adoption/`.
