# Nine-field baked appearance experiment

The current detailed appearance includes the shared
[bus palette and repetition correction](GRASS_DEBUG_V2.md#bus-palette-and-repetition-correction-2026-10-11):
LOD5 vertex elevation calibration, closer prepared blade colors, and stable
placement/UV variation. Earlier appearance presets retain their previous assets.

## Static endpoint alignment (v13, 2026-10-11)

The detailed profile now corrects the LOD5 texture before increasing transition
complexity. LOD0–4, field distribution, switch distances, fade widths, texture
resolution, anisotropy and draw counts are unchanged from bus-blend-12.

Each prepared mip receives a luminance-dependent cavity curve (power 0.65).
Per-channel square-root means approximately preserve perceived brightness;
this avoids turning the restored dark roots into an overall darkening of the
far canopy. RGB is encoded over a 3× range in the existing RGBA8 allocation,
decoded through the material's existing color multiplier. Coarse levels above
4 use 1.58× compensation. Texture preparation occurs once at initialization;
there are no new shader instructions, color samples, textures or geometry.
The existing vertex elevation factors are retuned to RGB 0.80 / 0.88 / 0.73
at shallow angles and 0.47 / 0.48 / 0.44 from above. The projected dissolve
and cached external shadows are retained.

The mismatch depends on angle: the v12 bus-height canopy was brighter than
LOD4, while the 1.4 m grazing view was darker and had much less fine detail.
A uniform darkening cannot fix both. Raising raw mip contrast alone also
changed brightness after clipping. The retained correction separates mip
contrast, brightness normalization and the already-existing elevation tint.
This is static appearance matching, not proof of matching silhouettes; the
flat canopy still lacks upright blades at extreme grazing angles.

`grass_lod_alignment.pwtest.js` captures forced LOD0–5 and AUTO at identical
20/30/40 m bus poses, 1.4 m grazing and 32 m elevated views without the shelter.
`GRASS_ALIGNMENT_PHASE=before` reuses the preserved pre-correction source
artifacts; other phase names capture the current implementation into separate
folders. `grass_lod_alignment_report.mjs` builds the all-six-LOD contact sheet,
adjacent-LOD and before/after split controls, and bus-scene comparison under
`tests/artifacts/screens/grass_debug_v2/lod_alignment/`.
It verifies identical cameras and submitted geometry before/after. These
counts establish unchanged work submission, not new GPU timing results.

The seam regression measures extra dark pixels relative to both endpoint
images, rather than counting intentional root cavities as missing coverage.
Its original brightness, detail and coverage limits remain in force.

Final v13 captures pass those seam limits in four bus poses: absolute mean
luminance error is 1.11–1.76 / 255 and LOD5/LOD4 fine-contrast ratio is
1.00–1.04. The bus scene passes adjacent RGB limits in all five camera poses
(maximum channel difference 7.69 / 255). Its separate 80-frame movement test
uses 17 scans; forcing a fresh selection changes at most 0.00614% of pixels
by more than eight RGB levels. These are separate appearance and cache checks,
not a claim that the visible grazing-angle shape change has disappeared.

Entrypoint: `debug_tools/grass_baked_lighting_scene.html`. The original
`grass_litter_scene.html` and transition lab retain their rendering defaults.
The bus scene now shares this lab's detailed baked appearance and ranges by
default; `grass_debug_v2.html?grass=current` retains its previous lit strategy.
The baked entrypoints request the additional 60% source population bake.
Current/baked/split views share nine 12 × 12 m fields, 1 m paths, the camera,
game sun, exposure, environment and central shelter.

## Wider detailed-profile transitions (2026-10-11)

The current detailed appearance and baked bus scene use the last 30% of each
distance band for the existing opaque dissolve. The distant fades are
14.24–20 m (LOD2/3), 27–30 m (LOD3/4), and 37–40 m (LOD4/5).
All switch endpoints stay at 0.6 / 0.8 / 20 / 30 / 40 m. Historical ranged
appearance retains its 10% bands; the separate original-lit bus mode is unchanged.

The previous one-metre LOD3/4 and LOD4/5 bands completed in one third of a second
at 3 m/s. They now take one second, without changing the dissolve shader,
texture reads, shadow cache, 50 ms scan interval or 0.2 m movement threshold.
The increased overlap does submit additional geometry; it is not a free
performance improvement. In a deterministic 12 m bus-height flight, mean
submitted triangles rose from 2.076 M to 2.258 M (8.8%), while mean draw calls
changed from 392.1 to 385.8. No new GPU timing claim is made from those counts.

`grass_bus_blend_motion.pwtest.js` first reproduces the too-short bands, then
checks the widened ranges and compares cached versus freshly rebuilt selections
at identical moving-camera poses. The 80-frame flight uses 17 selection scans;
at most 0.0062% of pixels change by more than eight RGB levels on a forced
refresh, below the 0.1% regression limit. This separates the visible spatial
handoff from CPU selection popping. Before/after captures and metrics live in
`tests/artifacts/screens/grass_debug_v2/blend_motion/`.

Four nine-field views also pass the original coverage bounds (no blend luminance
below 98% of the darker endpoint and no more than 2% additional dark pixels).
At v12 the older strict endpoint appearance gate failed with both narrow and wide
bands: 3.544 display-luminance levels at `bus_19m_front` versus a limit of 3,
and LOD5 fine contrast of 0.78–0.81 times LOD4 versus a target of 0.9. Endpoint
measurements are identical across both runs, so this remains a separate
appearance issue, not a regression from widening the fade; v13 addresses the
prepared endpoint appearance separately. The thresholds were
not relaxed. `grass_bus_blend_report.mjs` verifies the coverage and unchanged
endpoint data and creates the before/after viewer and `coverage-validation.json`.

## Detailed distant canopy (v10, default)

`appearance=detailed` keeps v9's geometry, distances and LOD0–4 appearance.
Only the LOD5 preparation and material palette change. `appearance=ranged`
preserves v9 and remains available in both comparison menus.

The generated `DataTexture` inherited nearest magnification. Three r183 skips
anisotropic filtering with that setting, so the advertised 4× value was not
being applied. V10 explicitly selects linear magnification and trilinear
minification, with anisotropy capped at the device limit or 16×. Both periodic
maps remain 1024². Texture preparation adds no texture lookups, geometry, mip
levels or resident texture bytes; hardware filtering does more sampling. The
seam and perimeter corrections below add a small blend calculation and prepared
vertex colors respectively.

The color mip pyramid is prepared once in linear RGB. Each level is filtered
from the unmodified parent in floating point, avoiding repeated byte-rounding
drift and cumulative contrast. Leaf/cavity luminance contrast ramps from 1× at
the base to 4.9× at mip 4 and below, preserving the source hue per texel. A fixed
material calibration of RGB 1.06 / 1.05 / 0.946 matches LOD4 near 40 m while
keeping the surface from becoming a uniform green wash. This remains a flat
surface; it does not reproduce upright blade parallax or silhouettes.
The original v10 levels 5 and coarser received 1.33× linear RGB compensation before
quantization. A mip-isolation capture identified level 4/5 mixing around 40–45 m
and mainly level 5 around 64 m at 1360 × 900; applying one radiance reduction to
every level made the farther surface too dark. Hardware trilinear filtering
interpolates the prepared values, requiring no runtime color correction branch.

Diagnostic sequence (matched 1360 × 900 bus renders, 40–50 m field interiors):

- Increasing anisotropy alone had no effect with nearest magnification.
- Disabling mipmaps restored sharpness but produced extreme aliasing; rejected.
- Correct linear filtering at 4× improved detail but retained broad blur.
- Strong contrast at 4× produced coarse patches; rejected.
- Correct filtering at 16× with moderate prepared contrast retained finer,
  distributed detail. Palette calibration was then checked at 45 and 64 m
  from front, rear and side, against unchanged LOD4.

`grass_baked_canopy_detail.pwtest.js` captures v9/v10, checks actual renderer
anisotropy, fine-detail contrast, palette and unchanged draw counts/texture
bytes. `GRASS_CANOPY_PERF=1` adds four alternating soil/LOD5 GPU pairs, with
four separately timed renders per frame. Desktop GPU clocks/load are not
controlled; round ranges and soil baselines are retained in `performance.json`.
Artifacts: `tests/artifacts/screens/grass_debug_v2/baked_lighting/canopy_detail/`.
The main comparison accepts `#lod5` to open LOD4 versus LOD5 at 40–50 m.

### LOD4–5 seam correction

This correction originally used a 39–40 m blend; the current detailed profile
uses the wider 37–40 m band described above. Its
outgoing blades and incoming flat canopy now evaluate the final dissolve weight
at one common point on each view ray, projected onto a 7 cm horizontal turf plane.
The fragment shader evaluates that weight instead of interpolating separately
computed vertex weights. The old weights disagreed because blade and canopy
heights, triangle sizes and vertex spacing differ, exposing dark understory
between their supposedly complementary masks. A vertex-only projection fixed
most of the stripe but left interpolation gaps at the start of the band.

Only the latest profile's LOD4/5 blend material variants enable this calculation.
It adds a varying and projection/smoothstep arithmetic in candidate transition
batches, with no additional texture reads, geometry, draw calls or CPU scans.
Opaque dissolve and depth writing are retained. The separate preparation
correction below changes the LOD5 palette, including forced LOD5 rendering.
Original lit and historical baked profiles retain their existing shaders.

The first seam correction removed missing coverage but left a brightness/detail
step. At 910 × 866 CSS pixels, DPR 2 (renderer capped at 1.5), LOD5 was 5–7 display
luminance levels brighter and had 20–25% less neighboring-pixel contrast than LOD4.
Increasing the prepared mip contrast alone still raised the average after dark
values clipped to zero. Recalibrating its fixed radiance together with the mips
reduced that brightness difference to under 2 levels and retained at least 90%
of blade-scale contrast in the 36–42 m interior strip across front/rear/side views.
No distance-based color correction or additional texture sampling is used.

The detailed profile also prepares a neutral root gradient on the existing
perimeter-strip vertices: 0.32 linear reflectance at ground level, rising to 1
at the canopy top. Only strip materials enable standard vertex colors; flat
interiors retain their existing material path. The close-up wall renders about
22% darker on average while the top stays unchanged. There are no extra
triangles or draw calls. This opt-in preparation applies to the optimized edge
strips used by the baked lab; the preserved original grid experiment is unchanged.

`grass_baked_seam.pwtest.js` reproduces the old path by disabling the opt-in
define, then checks front/rear/side bus views with the fix. Across 36–42 m field
interiors, AUTO must retain at least 98% of the darker endpoint's brightness and
avoid extra dark holes. Matched before/after draws and distances are asserted.
`GRASS_SEAM_TALL=1` reproduces the taller viewport in `canopy_seam/tall/`.
Both viewport modes also check endpoint brightness and fine contrast, plus a
forced-LOD5 edge close-up with its prepared vertex shade disabled/enabled. The
wall must darken without changing the top or draw counts. Original captures from
the first shader-only fix are retained under `tall/first-fix/` for comparison.
`GRASS_SEAM_PERF=1` adds six balanced soil/before/after GPU triplets at 40 m,
96 samples each, four renders per animation frame. Captures and raw measurements
are under `baked_lighting/canopy_seam/`. As with the other measurements, GPU
clocks and desktop load are uncontrolled.

## Individual blades in assigned distance bands (v9, preserved)

`appearance=ranged` keeps geometric LOD2 until 20 m, uses LOD3 from 20–30 m,
LOD4 from 30–40 m, and LOD5 beyond 40 m. The unchanged close switches are
0.6 / 0.8 m. Existing complementary dissolve blending is retained over the last
10% of each preceding band (18.08–20, 29–30, 39–40 m for the distant switches).
Selection remains cached at 50 ms / 0.2 m. Earlier appearances retain their
original selection distances and blend widths; the other scene entrypoints
are unchanged.

Broad camera-facing tuft captures still looked like clumps with gaps, even when
their average color matched. V9 instead retains a nested subset of individual
LOD2 leaves, ranked deterministically inside 10 cm ground cells. Every occupied
cell keeps at least one leaf. Width is expanded across each leaf's UV rows,
without scaling its length or height; roots and face contrast remain intact.
RGB calibration is prepared in vertex colors, with no new shader operations.

| Level | Source fraction | Width | Prepared RGB gain | Intended band |
| --- | ---: | ---: | --- | --- |
| LOD3 | 1/2 | 2× | 1.35 / 1.33 / 1.42 | 20–30 m |
| LOD4 | 1/3 | 2.7× | 1.55 / 1.48 / 1.63 | 30–40 m |

Per-cell rounding makes the actual retained fractions slightly higher. These
representations contain more geometry than the v8 cards but fewer triangles
than LOD2. They reuse the leaf material and omit both card atlases and their
billboard projection. Active prepared color textures decrease from about 64 to
21.3 MiB; original reference assets and startup bakes remain resident separately.
This is not a claim of lower total GPU memory or unchanged runtime cost.

LOD5 remains texture-only and uses the existing material multiplier with RGB
gains 1.42 / 1.43 / 1.6 to match the far-range palette. Filtering and texture
resolution are unchanged. Its lack of upright detail remains visible; color
matching is not geometric equivalence.

The comparison removes v5/v6 menu entries while retaining their source profiles.
It includes direct 20–30 / 30–40 / 40–50 m pair buttons, a cropped 2× band view
and a full-scene toggle. Measurements use only field pixels in the actual
distance band, not the closer foreground. The default is LOD2 versus LOD3 at
25 m. Camera height and tilt are fixed. V8, v7, v4 and original lit remain
available on either side.

Validation: `grass_baked_ranges.pwtest.js` measures color, fine-detail contrast,
broad clump contrast and coverage from front/rear/side at 20–45 m. Adjacent
levels are checked in their assigned 20–30 and 30–40 m strips. Set
`GRASS_RANGE_PERF=1` for paired soil-relative timings of v8 versus v9 at 25 m,
with four rounds of 32 frames and four individually timed renders per frame.
Results are milliseconds per render under a sustained workload, not game FPS.
Artifacts go to `tests/artifacts/screens/grass_debug_v2/baked_lighting/ranges/`.

## Preserved fine cards at bus distance (v8)

`appearance=midrange` retains v7's geometric LOD0–2, dark understory and LOD5.
LOD3/4 use smaller source strips and more evenly spaced cards to approach LOD2's
individual upright blades around 20 m, instead of broad clumps separated by gaps.
The fixed capture pitch is 12.5°, matching the approximate ground viewing angle
from the 4.5 m bus camera at that distance; v7 captured at 25°.

| Profile | Cards/m² | Source width × depth | Ground span | Material gain |
| --- | ---: | --- | ---: | ---: |
| LOD3 | 24 | 0.25 × 0.12 m | 0.18 m | 1.8 |
| LOD4 | 12 | 0.42 × 0.16 m | 0.24 m | 1.4 |

The same prepared LOD2 leaves supply both captures. Card RGB stays unboosted in
the 8-bit atlas; the gain and RGB calibration (0.93 / 1 / 0.85) are folded into
the existing material color multiplier to avoid clipping bright captured leaves.
Atlas dimensions, draw-call counts, runtime texture lookups and shader operations
per fragment are unchanged. Card triangles double versus v7; projected coverage
and fragment work can change, so this is an appearance improvement, not a claim
of unchanged GPU cost. No per-card CPU updates or additional transition shader
logic are introduced. The original scene entrypoints retain their card defaults.

Matched 20 m front/rear/side captures measure only field interiors 16–24 m from
the camera. They check color, fine detail and low-frequency clump contrast against
LOD2. The smaller strips reduce broad clumps, but do not make planar cards identical
to geometric leaves, especially in close or overhead views.

## Preserved natural appearance (v7)

The natural profile prioritizes visible blade separation and shaded roots over
matching the original lit palette exactly. It uses the same geometry, card
coverage, texture dimensions, runtime materials and cached external shadows as
v6. All changes are prepared in cloned vertex colors and RGB textures.

- Each geometric leaf uses its own bottom/top height for a 0.045–1.0 root curve
  (`h^0.8`), multiplied by 0.65–1.0 canopy-height occlusion. The curve is never
  averaged back toward the leaf mean. That earlier averaging brightened roots
  and reduced visible cavities.
- The two existing blade faces receive 0.5/1.15 brightness, with a stable choice
  of the brighter side and ±25% variation per leaf. Existing vertices, positions,
  leaf counts and indices are retained. Lower leaves have a slightly cooler tint.
  LOD0–2 share LOD2's area-weighted palette with RGB gains 0.95/1.0/0.9.
- The dense grass/litter floor remains opaque and uses the same two prepared
  layers. Its RGB gain is 0.38 so the floor no longer illuminates gaps between
  the standing blades. This is shading, not reduced grass coverage.
- LOD3/4 capture the same prepared LOD2 blades. Capture gains of 1.5/1.3 balance
  their oblique projection and overlap against geometric LODs before mipmaps
  are generated. Alpha, card counts, footprints and placement are unchanged.
- LOD5 retains three composited leaf layers in two 1K tiles. Prepared height and
  face shading use the same root/canopy curve; face brightness is approximated
  from the captured up component. Litter visibility maps to 0.22–0.65. Canopy
  luminance contrast is expanded 1.55× before filtering, scaling RGB together
  to preserve hue in dark cavities. The surface still lacks blade silhouettes
  and parallax; a close forced-LOD5 view exposes this limitation.

At extreme grazing angles (the 48/64 m comparison poses), forcing geometric
LOD0–2 exposes mostly their bright tips. They remain brighter than the flat
canopy at those distances; preserving root contrast does not eliminate this
projection difference. The comparison keeps these views visible rather than
flattening all leaf colors to match their mean.

`appearance=natural` retains v7. `appearance=tuned` retains v6 exactly;
`appearance=soft` retains v5 and `appearance=previous` retains v4. The original
lit strategy and all other scene entrypoints keep their existing defaults.

## Preserved v6 appearance and coverage

- LOD0–2 clone authored geometry without changing source meshes. Vertex RGB
  starts with the authored leaf palette and a height gradient from 0.225
  at roots to 0.9 at the tallest tips. Each leaf's colors are then moved 50%
  toward its own triangle-area-weighted mean. This retains stronger dark roots
  than the preceding 85% compression, which looked flat. Stable per-leaf
  brightness variation of ±28% is shared across geometric LODs and card captures.
  Prepared RGB is then
  normalized across LODs to LOD2's area-weighted palette with RGB calibration
  gains 0.98 / 0.91 / 1.08. This removes color shifts caused by tessellation
  while retaining variation between leaves. No per-frame calibration occurs.
  Leaf counts and triangle counts stay unchanged.
- LOD3/4 capture the same color treatment into 30/50 cm source strips.
  Captured RGB receives a 0.94 / 0.94 / 0.79 calibration before mip generation;
  this reduces the bright, pale appearance of the oblique strips.
  Card densities stay at 12/6 per m². Materials sample color/alpha only, without
  normal, roughness, transmission, specular, environment or directional lighting.
  The isolated LOD4 profile captures 0.50 × 0.34 m strips across a 0.45 m ground
  span, filling more space between cards. The original strategy keeps its
  0.45 × 0.27 m source and 0.35 m span. Atlas dimensions and card counts do not
  change; broader cards can increase fragment coverage and overdraw.
- A 60% paired-shoot population, chosen by the existing periodic coverage
  selector, supplies the grass/litter floor beneath **all LOD0–4**, replacing
  litter rather than adding a floor. Reference card LODs retain their 45% floor;
  reference geometric LODs retain litter.
  A second shifted leaf-only layer is precomposited into this base texture to
  fill exposed litter, without extra runtime layers, texture samples or geometry.
- LOD5 uses the full population in two alternating 1K RGB tiles. Both floors
  share a global 2 m phase. Root/litter occlusion is encoded in RGB; normal,
  packed soil and self-shadow visibility channels are read during preparation
  only. The captured grass shadow modulates litter from 0.4 to 1.0. It adds no
  runtime texture sample. The full canopy retains a 4K visibility capture while
  color is 1K: each color texel averages the corresponding 4 × 4 visibility
  footprint. Equal-resolution card bases use one visibility texel. Resolution
  changes must preserve the shadow's UV alignment, not reuse color-array indices.
  Leaf and litter contributions are calibrated separately
  against the original renders: texture leaf gain 1.2; litter RGB gains
  1.82 / 1.92 / 1.68 before the shared fixed radiance.
- The full LOD5 canopy additionally composites two shifted leaf-only
  captures over the original tile. Top-down capture exposes more litter than
  the bus sees through upright LOD2 leaves; the added leaf coverage prevents
  that litter from averaging into pale distant grass. Added leaves retain
  authored RGB and root shading, with a 1.14 brightness gain calibrated against
  baked LOD2 bus views. Shifted samples select the neighboring checkerboard
  variant across tile boundaries. The three layers are combined during
  preparation into the same two 1K maps, with no additional runtime samples,
  geometry or texture residency. LOD0–4 use two prepared layers from the sparser
  source; LOD5 uses three from the full source.
  Prepared RGB contrast is expanded about each tile's mean by 1.25× for the
  base and 1.35× for LOD5, before normal mip filtering. Coverage is unchanged;
  this restores leaf/litter separation rather than cutting holes in the floor.
- Linear reflectance is multiplied by fixed radiance: linear RGB
  (1, 1, 1.25) × initial game sun intensity / (2π). The cool fill approximates
  the original daylight palette without baking the sun's yellow tint into every
  leaf and litter texel. Separate litter gains retain the original background
  color instead of applying the leaf exposure to the ground.
  This puts colors in the range expected by the game's low exposure.
  It does not track normals, sun direction or later lighting changes. Exposure,
  tone mapping and a shared baked-brightness control remain effective.
- Opaque textures use linear RGB mip averaging. Card mips average alpha coverage
  and alpha-weight RGB, retaining padding in empty texels. No alpha-test coverage
  inflation is applied to MSAA coverage. Baked materials omit the former
  distance-dependent color/lighting correction.

## Shadows and comparison

One 2048² world-space visibility map retains the shelter's external shadow, at
one texture lookup per baked grass fragment. This cache is static: moving objects
or sun require rebuilding. Root shading and the source tile's baked litter
shadows approximate local self-occlusion and cannot replace arbitrary external
shadows. These corrections change prepared colors only; runtime shader work and
geometry counts are unchanged.

The current strategy retains its lighting and cached shadows. A separate
external-only shadow map serves OFF and the baked strategy's surrounding soil,
so OFF does not inherit grass self-shadows. Disabling external shadows retains
the shelter geometry.

Both sides use matching direct WebGL rendering with canvas MSAA, excluding
bloom/postprocessing. Split mode renders the same full-frustum camera with two
complementary scissors; its cost is not a single-strategy performance result.
Full-screen current and baked modes are used for benchmarks.

Controls: AUTO, forced LOD0–5, OFF, bus poses at 14/19/20/24/25/30/32/35/40/45/48/64 m (front/rear/side),
overview, WASD horizontal, QE height, middle-mouse look, R bus height/tilt, forward
drive, brightness, split and collapse. Both sides share the selected appearance's
AUTO ranges: v9/v10 use 0.6 / 0.8 / 20 / 30 / 40 m with 10% blend bands;
earlier profiles use 0.6 / 0.8 / 1 / 16 / 32 m with half-band opaque dissolve.
Selection caching is 50 ms / 0.2 m. Forced LODs omit border fringes.

The isolated lab also offers 32/48/64 m front/rear/side bus views at unchanged
height, tilt and field of view. Range is to the field-layout center, not every
individual field. `shelter=0` omits the roof/posts before building shadow caches.
`appearance=previous` restores the earlier v4 full-contrast baked palette,
single-layer sparse base and narrower cards. `appearance=soft` preserves the v5
color-matched palette (15% leaf contrast, no added variation), denser base and
wider cards. `appearance=tuned` uses v6 restored depth and reduced card
brightness; `appearance=natural` uses v7 shaded roots and blade faces. These
switches do not alter the original lit scenes.

## Measurement and limits

The benchmark covers forced LOD0–5 and AUTO in both strategies. Before timing,
it prewarms all configurations so shader compilation and texture upload cannot
inflate the first soil baseline. For each level and round it measures a
soil/current/baked triplet, cycling through all six permutations and reversing
LOD order every round. It also warms each block and subtracts that triplet's
same-pose OFF cost. Incomplete blocks (fewer than 95% of requested samples),
GPU disjoints and disabled timers fail the run. The report shows soil baseline + grass overhead =
total GPU time, overhead ranges, CPU submission cost and its soil-relative delta,
triangles and draw calls. OFF retains terrain, sky, shelter and its external
shadow. New interactive runs are prepended. Preparation, shader compilation and
shadow generation are excluded.

`tests/headless/e2e/grass_baked_matched_benchmark.pwtest.js` compares the original
lit grass system used by the bus scene with the latest detailed v10 strategy in
the same nine-field lab, without the shelter, bus or trees. Both use the same
0.6 / 0.8 / 20 / 30 / 40 m switches, 10% blend bands, side-leaf cutoff and update
cache. Every measured block checks matching LOD assignments and blend candidates.
The historical measurements predate the bus default's migration to detailed
baked grass. The original strategy remains available at `?grass=current` and retains
12/m² LOD3 and 6/m² LOD4 cards; v10 uses reduced individual blades at those levels.
This measures the complete strategies, including geometry and filtering changes,
not lighting shader savings alone. Baked rendering still uses drawing, texture,
fog, blend and cached external-shadow shaders.

That benchmark measures 14 m front, 25 m rear and 45 m side bus poses at
1360 × 900, DPR 1, MSAA, six rounds of 96 samples per version/LOD, with four
separately timed renders per animation frame. It reports AUTO first, then each
forced LOD, with shared soil baseline, overhead, total, paired round differences,
CPU submission cost, draw/triangle counts and hardware. Raw samples and matched
AUTO screenshots are saved to timestamped folders under
`tests/artifacts/screens/grass_debug_v2/baked_lighting/matched_benchmark/`.
Its index retains newest-first run links. GPU clocks and desktop load remain
uncontrolled; small differences with mixed-sign round ranges are inconclusive.

`rendersPerFrame` optionally submits 1–8 separately timed renders per animation
frame to investigate idle/scheduling bias. The default is 1; results record the
batch size and remain milliseconds per render. Set `GRASS_BAKED_BATCH=4` for the
headless comparison with four renders per animation frame. This is a sustained
render workload, not a measurement of game FPS; CPU submission cost also reflects
that batching. Preserve an earlier frame-paced run when changing the protocol.

This comparison retains reference assets and both field sets in memory. Baked
active color maps total about 21.3 MiB for v9/v10 (about 64 MiB for card profiles), excluding external visibility, terrain,
reference assets and startup/debug bakes; this is **not total resident memory**.
No production asset publication or standalone offline bake process is introduced.

Color consistency does not remove card parallax differences, clumps or LOD5's
flat silhouette. Close/overhead views remain more revealing than bus views.
60% describes source shoots, not screen coverage.

Validation: `tests/headless/e2e/grass_baked_lighting.pwtest.js`. Set
`GRASS_BAKED_PERF=1` for four rounds of 40 GPU samples in six bus poses.
Artifacts: `tests/artifacts/screens/grass_debug_v2/baked_lighting/`.
Palette validation includes matched front/rear/side bus views, overview and a
root close-up. It checks prepared leaf color balance across LODs, shaded litter
brightness, and root contrast as well as independence from live sun intensity. A visual-only
run does not substitute older palette timings for new measurements.
LOD5 hue and brightness are checked against baked LOD4 within the 40–50 m ground strip in all three bus views. Root close-ups check the shaded litter beneath LOD3/4; the flat LOD5 palette is evaluated at its intended distance.
`tests/headless/e2e/grass_baked_consistency.pwtest.js` captures original lit,
v4 baked, natural v7, fine cards v8, range-matched v9 and detailed canopy v10 LOD0–5 and AUTO without the shelter
at 27 bus poses, overview and a root close-up. It measures RGB, green-pixel
coverage and neighboring-pixel luminance contrast inside field boundaries and
the selected distance strip. `GRASS_COMPARE_VERSION=<id>` refreshes only one
version after a complete capture, validating and reusing the other versions'
unchanged images and measurements. Omit it for a full regression capture.
Checks include adjacent distant brightness, restored detail, fewer exposed
litter pixels and preserved historical draw/triangle/texture counts. V8 keeps
texture and draw counts while deliberately increasing card triangles. Matching mean RGB
alone does not validate depth; stronger root shading permits more variation
in shallow-angle geometric LOD renders than the former flattened palette.
The visual-only report under `baked_lighting/consistency/` has independently
selectable version/LOD menus on both sides and matching live-view links.
Historical performance results remain separate;
these appearance captures are not new timing measurements.

`tests/headless/e2e/grass_baked_midrange.pwtest.js` compares v7/v8 LOD2–4 at
20 m from three directions and checks finer detail and fewer broad clumps in
the 16–24 m field region. Set `GRASS_MIDRANGE_PERF=1` for four reversed-order
rounds of 32 GPU samples paired with soil-only at the front pose. Results retain
baseline, overhead, total, CPU submission cost, round ranges and draw counts
under `baked_lighting/midrange/`. GPU clocks and competing desktop work are
uncontrolled; large baseline drift makes small timing deltas inconclusive.

`tests/headless/e2e/grass_baked_roots.pwtest.js` compares v6 and v7 at matching
front/rear/side bus poses, overview and a root close-up. It checks root-to-tip
ratios and floor brightness directly, exact card-alpha signatures, texture
bytes, draw/triangle counts and increased rendered blade contrast. Captures and
measurements go under `baked_lighting/natural_depth/`. These checks distinguish
darker occlusion from missing coverage; color averages alone cannot do that.
