# Grass Debug v2

## Scope

Grass Debug v2 is the isolated scene for developing and comparing 3D grass. It
provides a dirt surface, asphalt road, game trees and city bus, camera navigation,
performance diagnostics, three ground substrates and a fixed grass LOD comparison.
It does not instantiate the v1 grass system or integrate grass into gameplay.
There are no additional setup, quality or lighting configuration panels or saved
scene settings.

Benchmark conclusions, their limits and the proposed direction for preserving
blade tips are recorded in [Grass LOD3 findings](GRASS_LOD3_FINDINGS.md).

## Versioned entry points

- `debug_tools/grass_debug_v2.html`: current screen, reached through Setup → Debugs →
  Grass Debug v2 (`G`). The unversioned `grass_debug.html` redirects here.
- `debug_tools/grass_debug_v1.html`: preserved historical lab, including its controls,
  asset families and `window.__grassLab` API. It remains available at its direct URL.
- `grass_lod_debug.html`, the historical capture runner and the historical browser
  validation suite explicitly target v1. Historical material/LOD “V2” terminology
  within that lab does not refer to the new screen version.

## Fixed baseline

- Plane dimensions derive from `BIG_CITY_SPEC_SOURCE`: 25 × 25 tiles at 24 metres,
  currently 600 × 600 metres, centered at the Big City map centre.
- Land defaults to the game's brown `pbr.gravelly_sand` catalog material (Gravelly
  Sand), with a four-metre repeat. Forest Soil selects `pbr.forest_ground_06`, the
  Planter reference substrate, with a local 2.5 m repeat. The shared catalog uses
  Poly Haven's 2.1 m physical width; Grass Debug explicitly overrides that scale.
  Brown Earth selects `pbr.brown_mud`, a finer bare-soil surface with small clumps,
  using Poly Haven's official 4K maps at the catalog's 1.3 m physical width.
  Its Grass Debug material has a damp-earth appearance: linear RGB albedo
  multipliers `(0.32, 0.29, 0.26)` and a 0.78 roughness multiplier retain the
  scanned texture variation with darker diffuse color and restrained sheen.
  These scene-local settings also reach both leaf studies through the shared land
  factory; source textures, global catalog calibration and game lighting are unchanged.
  All substrates resolve through the global PBR pipeline, using catalog defaults
  plus the local settings above, without calibration overrides. They use colour,
  OpenGL normal and packed AO/roughness/metalness
  maps, and up to 8× anisotropy. Forest Ground 06 uses official 2K Poly Haven maps
  stored in `assets/public/pbr/forest_ground_06/`, registered in the game catalog.
  No embedded Planter images or runtime dependency on its HTML are used.
  The plane renders both faces with the same textures and correctly flipped
  back-face normals, so views from below do not see through the ground.
- One two-way road runs through the field using `createRoadEngineRoads`, game road
  materials, asphalt defaults, lane markings, curbs and sidewalks.
- One full city bus uses `createBus` and the game bus catalog. It is grounded on the
  asphalt after the model finishes loading. Twelve fixed trees use the desktop
  game templates at varied positions, headings and heights.
- The renderer follows the display pixel ratio, capped at 2 like Planter, and
  refreshes it on viewport resize, including layout changes when the stats rows
  appear. The scene and postprocessing targets use the
  same drawing-buffer resolution, with MSAA and a cached static shadow map.
  Benchmarks record the actual buffer dimensions and pixel ratio for comparison.
  Sun direction, linear color, intensity, display exposure,
  tone mapping, hemisphere and HDR environment use the game's lighting and
  atmosphere resolvers, including saved game overrides and supported URL options.
  Without overrides, this is the calibrated afternoon sun at azimuth 45° and
  elevation 55°. The shared sky, SunBloomRig, SunRaysRig, SunFlareRig and sun bloom
  pipeline provide the game's visible sun and effects using its resolved settings.
  Lighting is resolved on page load; no lighting configuration controls are added.
- The initial camera uses the game's 55° FOV and `GameplayState.computeChaseParams`
  sizing rule: distance = max(8.5, longest bus bound × 1.35), height = max(3.2,
  longest bound × 0.55), look height = max(1.1, bus height × 0.32). Far clip is
  extended to 1600 m to inspect the whole terrain. The bus is stationary.
- Shared tool camera navigation provides orbit, pan and zoom. `1` restores the
  bus view; `2` selects Overview at XYZ `(19, 22, -22)` and yaw/pitch/roll
  `(138°, -38°, 0°)` using the stats row's YXZ convention. The orbit target is
  where this view direction meets the ground. Escape returns to the game.
- `W`/`S` move forward/backward along the view direction, `A`/`D` strafe left/right,
  and `Q`/`E` move down/up in world space. Movement translates the camera and its
  orbit target together at 8 m/s (24 m/s while holding Shift), preserving the view
  direction and the Y = 0.01 floor. Releasing keys or losing focus stops movement;
  text fields and browser shortcuts do not trigger camera movement.
- The camera can descend to world Y = 0.01 m during orbit, pan and zoom. V2 opts
  into the shared tool camera's `minHeight` floor; other screens keep their existing
  unconstrained height. Minimum orbit distance is 0.01 m. The near clipping plane
  shrinks with camera height, from 0.1 m normally to 0.005 m at the ground limit.
- A left control panel sits below the stats rows. Its Camera section contains the
  Bus camera, Overview, Grass comparison and Copy buttons. Grass comparison frames
  the four-block line experiment from above at an oblique angle and works independently
  of the selected grass mode.
  Copy writes the current camera pose to the clipboard as space-separated
  `X Y Z yaw pitch roll`, with angles in degrees using YXZ and values rounded to
  three decimal places. The button briefly confirms success or reports failure.
  The scene viewport uses the remaining width. The panel scrolls independently
  and provides space for future control sections, with no screen title, terrain
  summary or camera movement help.
- The Land section follows Grass, with side-by-side Gravelly Sand, Forest Soil
  and Brown Earth buttons and a visible selected state. Hover identifies Forest
  Ground 06 as the Planter substrate and Brown Mud as the fine bare earth.
  All three materials and their textures preload and compile before
  readiness; switching reuses the same terrain mesh. Inactive textures/materials
  are released with the scene. Planter's separate near-camera detail layer and
  ground-shadow shader are not included in this substrate selection.
- The shared top performance bar shows frame time/FPS, GPU time when supported,
  calls, triangles, memory and renderer identity. Its second row shows frame index
  and camera/bus world position and rotation.
- `Loading...` appears at the bottom center of the scene viewport from initial
  HTML load until readiness completes. It also clears if startup fails.
- Required asset failures remain visible as a startup error; readiness waits for
  models and textures. `window.__grassDebugV2` exposes `readiness`, `getSnapshot()`
  `setCamera('bus' | 'overview' | 'grass')`, `setGrassMode('OFF' | 'LOD0' | 'LOD3' | 'MIXED')`,
  `setLandSurface('gravelly_sand' | 'forest_ground_06' | 'brown_mud')`,
  `setMixedCardBounds(boolean)`,
  `startBenchmark()` and `cancelBenchmark()` for
  subsequent measurement work. Snapshots include the current benchmark state/result
  camera direction and the selected land material/scale.
- The HTML import map versions the scene module's Land contract and the expanded
  land module and PBR catalog index, so existing tabs do not combine the new controls with cached
  pre-Land scene exports or a catalog missing Forest Ground 06 or Brown Earth. Partial startup
  cleanup tolerates content that has not initialized its road or land owner and
  preserves the original startup error.

## Fixed grass comparison

- The Grass section offers OFF, LOD0, LOD3 and MIX, with LOD0 selected initially.
  OFF/LOD0/LOD3 use one count line showing only the selected grass's source leaves
  and actual mesh triangles, including all 144 instances. OFF shows zero for both.
  MIX shows separate LOD0 and LOD3 counts. Hover for density, dimensions and the
  meaning of the card leaf count.
- The full-field LOD0/LOD3 options use 144 patches of 1 m × 1 m in four adjacent rows of 36 beside the bus.
  The strip runs from bus Z − 4 m to Z + 32 m, on the negative-X (right when facing
  forward along +Z) side, 5 cm outside the game's outer sidewalk edge.
- Each reusable square metre has sixteen 0.25 m cells, with 128 seeded random
  leaves per cell: 2,048 leaves/m² and 294,912 leaves total. An 8 × 16 jittered
  root grid fills each cell. Blades may extend beyond cell and one-metre patch
  boundaries, interleaving with their neighbors instead of leaving inset seams.
  Patch origins remain exactly one metre apart; their canopies merge into a
  continuous strip with a natural outer edge. All instances share the same
  source patch and seed.
- LOD0 uses low inclined, tapered blades with four curved longitudinal sections,
  an open folded ribbon and a pointed tip. This follows Planter's folded-surface
  approach, retaining this prototype's own curve, width profile and distribution.
  The former closed underside averaged opposing normals at the edges and caused
  a dark outline. Both ribbon sides render, but the surface normals stay smooth
  across each lit half. A four-stop gradient tuned under game lighting spans the
  blade: moderately darker green roots (`#466d31` at 0), richer green through the
  middle (`#4a7a2c` at 0.35 and `#53832f` at 0.8), and restrained yellow-green tips
  (`#658a36` at 1). Colors are converted from sRGB to linear vertex colors. Every
  blade uses the same gradient, without per-blade color variation or an additional
  root darkening multiplier. The geometry's random sequence remains unchanged.
  LOD3's albedo atlas is baked from those same colors at startup.
  Each blade is 14 triangles; LOD0 totals 4,128,768 triangles. Reach is 14–21.5 cm,
  width 9–16 mm, and tip height approximately 5–11 cm. Roots lie at ground Y = 0.
- LOD3 uses four inclined alpha cards per quarter-metre cell: 64 cards/m²,
  9,216 cards total, and 18,432 triangles. Source leaves are partitioned by facing;
  every leaf contributes to exactly one card, rather than copying the entire tuft
  onto every plane. Each slice is baked from the side with world Y retained in
  the image's vertical coordinate, placing every root on its bottom edge. That
  edge is anchored at Y = 0 through the source roots' mean ground position. Card
  inclination derives from the group's mean root-to-tip chord, and its vertical
  visible height matches that slice's source maximum. The proxy and bake camera
  include two transparent texel rows above it, preserving scale and grounded roots
  while keeping blade tips away from the quad's top edge.
  0.25 m refers to the planting cell, not the diagonal size of a projected card.
- At startup, the same source geometry is rendered into in-memory 2048² albedo
  and normal atlases (256² slots with four-pixel gutters), using 4× MSAA during
  baking. The 0.15 alpha cutoff retains partially covered tip pixels that the
  former un-antialiased 128² slots lost. This increases atlas memory, not leaf,
  triangle or draw-call counts; all baking finishes before benchmarks.
  Tile viewports are expressed directly in render-target pixels. Display pixel
  ratio must not scale or shift atlas tiles: the same complete silhouettes and
  normals must be baked at 1×, fractional and 2× display scaling.
  Transparent texels retain a grass
  color and neutral normal so mip filtering does not pull black/inverted normals
  into the leaf edges. Normals are captured in patch object space so changing a
  card's inclination cannot rotate its baked leaf lighting. The grass card shader
  keeps these source-leaf normals oriented consistently when the proxy is viewed
  from its back face. Instances use translation only. The material uses the game's
  current light and IBL, alpha testing, alpha-to-coverage and depth writes. There
  is no alpha blending or baked sun color. Both grass materials use roughness 0.68
  and transmit 35% of back-facing direct diffuse light, following Planter's thin-leaf
  model. Transmission uses the shadow-attenuated light, and adds no emissive glow
  or extra render pass. This keeps unlit undersides from turning black in sunlight.
  Both modes receive scene shadows;
  grass shadow casting and wind are absent in this initial geometry comparison.
- Both full-field LODs attenuate direct sunlight with a texture-free canopy approximation.
  A ray toward the light intersects the whole strip's world-space bounds and
  source height envelope. Leaf density decreases linearly toward the canopy top;
  Beer-Lambert attenuation integrates that density along the ray, using optical
  depth 8. Sunward outer edges and exposed tips receive more sunlight than buried
  roots. Internal one-metre and quarter-metre boundaries do not restart shading.
  The same visibility attenuates direct reflection and thin-leaf transmission,
  after scene shadows; skylight, base colors and alpha silhouettes are unchanged.
  This approximates average canopy occlusion, not individual blade shadows. It
  adds no texture, geometry, shadow map, render pass or per-frame CPU update.
- Each full-field mode is one static instanced mesh. Selecting a mode only changes visibility;
  no per-frame generation, rebucketing or instance-buffer uploads are performed.
  Both shaders compile before readiness, and atlas baking precedes all benchmarks.
  This is a prototype comparison, without automatic distance switching or a claim
  of visual equivalence between card projections and the full 3D geometry.

## Mixed line comparison

- Mixed replaces the visible full field with four outlined 1 m × 1 m blocks:
  two LOD0 blocks in the row nearest the road, and two LOD3 blocks in the outer
  row. Blocks and rows have 0.5 m gaps; columns run along the road. Their starting
  Z is the same as the full field. The outlines identify the square metre even
  while most of its area is unplanted.
- Every block contains the same single line of 16 identical blades. Roots are
  equally spaced along local Z, centered in their 1/16 m intervals, at X = 0.65
  and Y = 0. Blades lean toward negative X, with reach 0.18 m, height parameter
  0.10 m, width 0.012 m and no twist or random variation. The blade builder is
  shared with the full field, preserving its four curved sections, folded surface,
  14 triangles and uniform green gradient.
- LOD3 is baked directly from that line, split into four quarter-metre groups of
  four leaves each. It uses four curved cards per block and the same source
  colors, object-space normals, grounded roots and height mapping. The atlas grid
  scales with the number of slices: four cards use a 2 × 2 grid (512² albedo and
  normals), while the full field retains its 8 × 8 grid. Viewport pixels remain
  independent of display scaling. Each comparison card follows the source's four
  curve segments (8 triangles/card); its vertical UV coordinate follows source
  height. This preserves the line's bend in oblique views instead of collapsing
  into an edge-on flat plane. Full-field LOD3 continues using flat cards.
- Both rows use game sun, environment, scene shadows and shared thin-leaf lighting.
  The dense-field canopy approximation is omitted for these sparse lines so
  differences in row placement do not create artificial differences in lighting.
  The card still approximates the blade's small crosswise fold with baked normals.
  Curved comparison cards follow the source surface's front/back normal flip,
  including the transmitted light on undersides. Flat full-field proxies retain
  their existing orientation rule; applying it to the curved line would make
  the card undersides much brighter than LOD0.
- The MIX button sits on its own row with a Card bounds checkbox on the right.
  The checkbox is off initially, enabled only in MIX, and locked during benchmarks.
  It draws purple outer boundaries around all eight curved LOD3 alpha cards,
  including transparent areas, without internal triangle edges. The boundaries
  follow the actual card geometry and remain visible over the grass. One static
  line mesh is built at startup and hidden when off; toggling rebuilds no grass.
  Its selection persists when switching modes. Benchmark snapshots/hover text
  record whether the boundaries were enabled.
- Mixed has two static instanced meshes, each with two instances, plus the block
  outlines and optional card boundaries. Its grass-only count uses two compact
  lines: **LOD0 · 32 leaves · 448 tris** and **LOD3 · 32 leaves · 64 tris**.
  Aggregate snapshots retain 64 leaves and 512 triangles alongside per-LOD counts.
  Guide lines are excluded from grass triangle counts.
  Switching to OFF, LOD0 or LOD3 hides all Mixed meshes and outlines. Hover text
  identifies the rows, gaps and line layout. Other modes retain one count line.
- Both line materials preload/compile with the scene. Camera and mode changes are
  locked during benchmarks. Mixed benchmark results retain `MIXED`, its line
  layout, four block placements and its actual counts; these runs are not a
  density-matched comparison against the full-field benchmark options.

## Detailed LOD0 blade study

- `GrassDebugV2DetailedBlade.js` defines the isolated authoring candidate for the
  next LOD0. It is rendered as one leaf rooted 6 mm into Brown Earth, before
  rebuilding the field, cards or far textures from the revised shape.
- One continuous cubic curve forms a fuller arch with 22 cm horizontal reach.
  The initial raised-tip revision appeared too straight, so its two nearly
  collinear curve segments were replaced with a single centerline. The source
  begins about 38° above horizontal, bends progressively through the middle and
  relaxes to a near-level end at the same 5.92 cm height. The paired plants'
  existing pitch leaves both terminal tangents above horizontal. This produces
  a visible bow without a sharp joint, near-vertical emergence or returning hook.
  The contour opens from a root width of 62% of the 15 mm maximum, then narrows
  gradually to 80% at the rounded taper's start (72% of its parameter, about 65%
  of its horizontal reach). The final width follows `sqrt(1 - q³)` over the
  remaining length. Quintic body envelopes match its first and second
  derivatives at the join, spreading the convergence into a rounded end
  instead of appending a short cap at 94%. Sixteen of the existing 48 sections
  sample the rounded taper by angle, retaining a small rounded extremity and
  sufficient resolution along the changing contour without a long needle.
  The transverse section forms a shallow concave channel near the root, with
  raised edges. The channel opens into a flatter surface by 72% of the blade.
- 48 longitudinal sections and eight transverse spans produce 433 vertices and
  760 triangles in one double-sided open surface with smooth vertex normals.
  Transverse samples cluster around a rounded central midrib, up to 0.35 mm
  above the channel floor, tapering with the leaf width and fading toward the tip.
  Relief follows the same underlying curve.
  `GrassDebugV2DetailedBladeSurface.js` creates deterministic 256 × 1024 normal
  and roughness maps for this candidate. Longitudinal relief uses 28 µm primary
  and 9 µm secondary amplitudes, fading at the outline and tip; roughness stays
  within 0.64–0.72. These maps contain no baked sunlight, shadows or color noise.
  Both use linear data and mip filtering; the normal map is tangent-space and
  derives its physical relief scale from the same width profile as the geometry.
  The maps are generated once and owned/disposed together by the study caller.
  Future card baking must explicitly include this material-level relief; the
  current card baker only captures geometric normals and vertex colors.
  The shared root-to-tip green gradient has no per-leaf color variation. The
  current 14-triangle field/line prototype remains unchanged while the candidate
  shape is reviewed; these source triangles are not a proposed distant-LOD cost.
- `GrassDebugV2SoilIntegration.js` adds separate study-only soil geometry around
  the leaf's insertion. Relief is confined to a 6 × 8 cm region with a uniform
  0.25 mm surface grid and smooth elliptical falloff. Rounded soil shoulders
  rise up to 2.8 mm alongside the entry, joined by a softer rise behind the root,
  suggesting displaced earth without loose blocks or a separate mound mesh.
  The shoulders taper into the terrain and meet the emerging blade; the deeper
  root burial seats its raised channel edges beneath
  the surface. There are no scattered clumps, block-like cracks or clearance
  trench beneath the blade.
  One continuous surface extends into the surrounding flat terrain with zero
  boundary height and slope and continuous world-aligned UVs. It replaces the
  study's flat floor, avoiding overlapping geometry, and borrows the exact
  Brown Earth material, including its damp appearance, without an extra root tint
  or material boundary.
  Leaf alpha bake inputs remain separate. The soil owner disposes only its
  geometry; the borrowed material and textures stay with their original owner.
  Capture validation checks buried root edges, no soil reentries after emergence,
  flat boundaries, shared material identity and nondegenerate surface triangles.
  This is an accuracy-first authoring source: triangle counts may increase to
  improve the model. Gameplay performance budgets apply to its derived runtime
  representations, not to this isolated soil/leaf study.
- The three review captures show the same blade from three-quarter, side and
  elevated angles, using the game's sun/environment, Brown Earth and grass
  material. A 30 cm macro shadow frustum with a 4096² shadow map and 0.1 mm
  normal bias reduces the detached bright fringe at the soil/leaf junction
  without introducing shadow acne. These are study capture settings only.
  Close-ups examine the junction from the root and the side. Captures and camera/geometry
  metadata live in the gitignored
  `tests/artifacts/screens/grass_debug_v2/detailed_blade/` folder.

### Paired plant authoring study

`GrassDebugV2Plant.js` assembles two continuous sheath-to-blade meshes around
one compact crown. The local reference `the_grass.html` supplies the nested
sheath/crown idea; the reviewed detailed blade supplies the curve, rounded
tip, channel and color gradient. Its shared sampler also builds the unchanged
single-blade study.

The pair uses fixed azimuths of -4° and 168°, lengths of approximately 22 cm
and 19 cm, and slightly staggered insertions into the same roughly 3 mm-wide
base. Sheaths begin 6 mm underground, unroll into each blade without a raised
tubular lip, and sit in a compact soil shoulder selected with
`rootProfile: 'crown'`. The blades receive 8° and 10° of additional elevation
around their buried origins before the sheath transition, preserving the root
contact and reviewed curve while lifting the flattened silhouette. Maximum
plant height is approximately 10.23 cm after the curvature revision.
The two centerline endpoints are 9.82 cm and 10.23 cm high, with terminal
elevations of approximately 5.1° and 6.7°. The centerlines bow about 16.3 mm and
16.7 mm above the chord from the lower blade body to its tip, compared with
2.3-2.4 mm in the overly straight raised-tip revision. Their rounded taper, root contact,
triangle counts, surface maps and uniform colors are retained. Blade
surfaces retain their existing normal/roughness detail and uniform gradient;
there is no random color variation. This remains an accuracy-first source:
9,664 leaf triangles plus a 960-triangle crown, with soil separate from leaf
bake inputs. The factory owns geometry and crown material, but borrows the
shared leaf material.

The nearly opposite, low leaves keep both silhouettes visible from above,
providing the source for the twenty-leaf LOD3 experiment below. The full-field
and MIX representations are unchanged. The original study and four rendered views live under
`tests/artifacts/screens/grass_debug_v2/paired_plant/`. Capture validation checks
nondegenerate triangles, normalized normals, both buried roots in the same
compact crown, full-width emergence without soil reentry, bounded height and
clean asset loading. The original single-blade capture also remains valid.

## Twenty-leaf card comparison

The default `debug_tools/grass_plant_study.html` now displays six copies of the
twenty-leaf tuft inside the centered 1 m × 1 m square: 120 leaves, at their original
size. `GrassDebugV2PlantPatch.js` stores deterministic randomly sampled translations
and yaw rotations (seed 39818). Tuft footprints may overlap and blades can pass
through gaps in adjacent tufts; blade bodies from different tufts must not intersect.
The accepted layout uses approximately 0.861 m × 0.987 m, centered in the square.
No blades are moved individually, resized, removed or recolored.

The same transforms apply to LOD0 and every LOD3 variant. Geometry, materials and
baked atlases are shared. Displayed totals are 637,440 triangles in LOD0;
144 / 72 / 36 / 24 cards and 288 / 144 / 72 / 48 triangles in LOD3 · 24 / 12 / 6 / 4.
The counts exclude soil. The blue square starts visible; 3/4, Side, Top and Far
frame the patch, while Base inspects a placed crown. Shadow bounds cover the patch.
All 60 rotated root positions feed one continuous soil surface with world-aligned
UVs and local crown displacement, avoiding overlapping ground planes.

`?layout=row` preserves the original inline authoring view. Historical regression
tests and benchmarks select it explicitly so their source size, lighting bounds,
cameras and leaf counts stay unchanged. The study API keeps `plant` and `cards`
as the canonical twenty-leaf sources; `patch` exposes the displayed clones,
placements and aggregate counts (null in row mode).

`grass_debug_v2_patch.pwtest.js` checks every displayed leaf vertex against the
square and source transform, and tests all pairs of tufts using conservative 3D
prisms enclosing consecutive blade cross-sections, inflated by 0.4 mm on each
local axis. Shared sheaths inside an original paired plant are unchanged; the
clearance constraint applies between tufts. Tests also check all LOD placements,
bounds/correction toggles, soil contact and counts. Captures and validation data
live under `tests/artifacts/screens/grass_debug_v2/six_tufts/`.

The 1,000-leaf spike experiment remains inactive, with captures and material tuning
preserved. The single row at `debug_tools/grass_plant_study.html?layout=row`
compares twenty leaves: ten instances of the
paired plant above, repeated along X with 44 mm between roots. This doubles the
former 22 mm pitch while keeping all ten pairs, equivalent to moving alternating
pairs to the end at the wider spacing. The centered root line spans 396 mm;
the leaves occupy approximately 442 mm along X. All LOD3 layouts and their
atlases expand with the row. Earlier benchmark results used the 22 mm spacing.
Their roots share
Z = 0; no rotation or color variation is introduced. LOD0 retains the detailed
source curves, totaling 96,640 leaf triangles plus 9,600 crown triangles. Source
geometry and materials are shared between instances. Four LOD3 options cover the
entire row. Four cards / eight triangles use two connected, inclined planes on
each side. Each outer card exactly reuses the six-card layout's tip plane and
UVs; the lower card merges its two remaining segments into one root-to-join
plane. The lower inclinations are 39.18° and 32.17°, so no root overlap is needed.
The root position and visible connection between paired leaves are preserved.
Six cards / twelve triangles use three connected, inclined planes on each side
of the paired leaves; twelve cards / twenty-four triangles use six per side,
and twenty-four cards / forty-eight triangles use twelve per side.
No horizontal plane spans the top. Adjacent segments share
exact positions and UVs at their joins, and each samples the same continuous leaf
projection. The cards form one mesh with one shared material and no material groups.

The live representations and their boundaries use `cards.split` (four),
`cards.curved` (six), `cards.detailed` (twelve) and `cards.refined` (twenty-four),
selected with the corresponding `setMode` keys. Snapshots expose all four as
live variants. The former three-card geometry is
retained as `cards.joined.mesh`, detached from the scene, for historical benchmark
comparisons and reported separately under `baseline`. An independent four-card
flat-top reconstruction in `tests/headless/perf/helpers/grass_legacy_split_geometry.js`
serves the historical benchmarks; it is different from the live inclined four-card
geometry. The study page does not load the test helper.

All live layouts fit the upper contour of the source blade margins. At each
longitudinal station, the fitter intersects both margin polylines with the same
world-Z plane and takes their upper height. This accounts for the blade's
crosswise concavity and azimuth, especially its rounded volume near the base.
The previous centerline-only fit flattened this volume even with 24 cards;
adding collar samples alone did not improve the measured shadow silhouette.
No sun direction is used to generate the contour. Unique source geometries are
sampled once on page load; the cards still share the original PBR atlas.

For the 6/12/24-card layouts, dynamic programming chooses the requested number
of connected segments with minimum maximum sampled vertical error, keeping the
earliest joins on ties and requiring each card to rise by at least 2 degrees.
The four-card layout instead removes the six-card layout's first interior
station on each side. This keeps the outer silhouette stationary through the
6-to-4 transition at the cost of a less accurate lower contour. All variants
share their endpoints and continuous UVs. Maximum card height is 10.249 cm. At the current
44 mm root spacing, measured fit errors and geometric areas are:

| Cards | Segments per side | Maximum outer-profile error | Area |
| --- | ---: | ---: | ---: |
| 4 | 2 | 12.638 mm | 0.197530 m² |
| 6 | 3 | 4.210 mm | 0.199037 m² |
| 12 | 6 | 1.003 mm | 0.199769 m² |
| 24 | 12 | 0.214 mm | 0.199923 m² |

These are errors against the outer-margin contour, not the old centerline or
the full surface. Snapshots report `fitTarget: 'upper_blade_margins'`,
`maximumProfileDeviation` and the corresponding variant-prefixed fields.
The historical baseline retains its `maximumCenterlineDeviation` field.

The root line stays at Y = 3 mm, above the local crown soil mound. Its former
1 mm height buried the connection between the paired leaves. The fitted tip
endpoints include 2 mm atlas padding. No extra cards, triangles, materials or
shadow-only LOD0 geometry are added by the contour fit. The 24-card version
still uses one mesh and 48 triangles. Source leaves, normals, albedo and alpha
are unchanged.

The old four-card and three-card baselines end their V at 40% of the projected
reach and use a horizontal top at 78% of source height (7.98 cm), with 22.51 mm
maximum centerline error. No performance benchmark has yet been run for the
current twelve- or twenty-four-card variants.

Planar segments still show angular joins, and the near-vertical sheath/crown
loses volume in the top projection. This remains a layout study, not an approved
LOD transition. Layouts and atlases regenerate from the source on page load.
The earlier benchmark source was about 7.8 cm high, with a 6.06 cm card top and
17.39 mm maximum centerline error. Its measurements remain historical and must
not be treated as measurements of this revised source.

On startup, the source leaf meshes are projected from above into in-memory
4096 × 2048 albedo/alpha, object-space normal and roughness maps. Two 2048 × 2048
pages retain the full leaf projection and the historical upper projection with
its empty strip. All live variants use the full first page with continuous UVs
at their joins. Only the historical benchmark references use the second page.
Source translations are
included in the projection, so all twenty leaves
appear in the shared atlas. The normal map includes the detailed source's fine surface normal map;
the roughness projection preserves its internal detail. Coverage uses 4× MSAA,
with eight texels of RGB edge dilation, mipmaps, up to 8× anisotropy, alpha testing
and alpha-to-coverage. Neither sunlight nor soil is baked into these channels.
The separate crown mesh is not included in the leaf projection. This is a live
debug atlas, not a published offline asset bake.

The study exposes independent **Normal facing** and **Alpha coverage** checkboxes,
both enabled initially, for all four LOD3 variants. LOD0 and card geometry are
unchanged. Settings survive representation/camera changes during the session;
turning both off restores the original material and filtering.

- Normal facing undoes the proxy triangle's double-sided normal flip, then
  chooses the leaf side using a structural reference shared across each source
  width station. The reference is the geometric centerline normal, encoded
  octahedrally in the unused red/blue channels of the existing roughness atlas;
  green remains roughness. The shader reuses that roughness sample, transforms
  the reference into view space, and blends front/back lighting with smoothstep
  across a facing dot product of -0.10 to +0.10 (about ±5.7° from grazing).
  Direct diffuse blends the two source-normal responses, including the existing
  0.35 transmission factor. Interpolating normals alone produced a dark midpoint,
  so the diffuse blend is evaluated separately. Specular and environment lighting
  use a normalized blend through the view tangent; it stays nonzero when the
  facing sign crosses zero. Outside the band the original side response is
  retained. Veins, the midrib and crosswise curvature still share one structural
  facing reference, avoiding bright underside stripes.
  Perspective and orthographic cameras are supported. This is a shading
  approximation near grazing, with no tint, new map, extra texture sample,
  vertex motion or camera-dependent shadow deformation.
- Alpha coverage prepares a second albedo/alpha mip chain at startup. Each atlas
  page is processed independently against the 0.15 cutoff, raising alpha only
  where quantized mip coverage would otherwise be lost. Alpha is never reduced:
  attenuation around this low cutoff erases strips under anisotropic/MSAA
  filtering. RGB is alpha-weighted during reduction to avoid dark fringes.
  The enabled shader centers its existing derivative-based MSAA transition on
  the cutoff. Unchecking restores the original GPU mipmaps and one-sided MSAA
  transition. Alpha blending remains disabled and depth writes remain enabled.
- This adds startup work and a comparison texture (about 42.7 MiB GPU storage
  including mips), but no additional per-fragment texture samples or triangles.
  Shader variants are cached after first use. GPU timing has not been measured
  for these corrections; restoring covered pixels can increase raster cost.
- Neither correction restores the transverse geometry missing from row-wide
  cards. An exactly edge-on card can still disappear, and the top-down normal
  bake cannot represent newly exposed, previously hidden source surfaces.

`grass_debug_v2_grazing.pwtest.js` captures independent toggle combinations at
3/4, Side and grazing views, checks unchanged LOD0, measures coverage with an
unlit MSAA render, and compares normal-facing lighting against an actual source
plane from above and below. Captures and measurements are under
`tests/artifacts/screens/grass_debug_v2/grazing/`.

The focused `grass_debug_v2_facing_transition.pwtest.js` sweeps both camera
types from -8° to +8° in 0.25° increments under controlled overhead lighting.
The maximum green-channel step fell from 72/255 (orthographic) and 36/255
(perspective) to 3/255 for both. Endpoint levels remain 36/255 underneath and
107/255 above, with no dark dip below the underside level. Captures and metrics
are under `tests/artifacts/screens/grass_debug_v2/facing_transition/`.
The underside-ridge and independent-toggle regressions still pass. These
checks establish lighting continuity, not a GPU timing improvement.

The shadow regression renders each representation onto the same soil with the
game sun direction and 4096² PCF shadow map, viewed from above over a 60 cm square
at 1536² pixels. Error is the summed absolute shadow-darkening difference from
LOD0 divided by LOD0's summed darkening; the root region is |Z| < 35 mm.
It is a relative silhouette metric, not a percentage of screen pixels or a GPU
timing. The contour-fit measurements below precede the four-card tip-preservation
change; its four-card row describes the former independently fitted layout:

| Cards | Whole shadow, before → after | Root shadow, before → after |
| --- | ---: | ---: |
| 24 | 11.19% → 5.39% | 29.39% → 7.60% |
| 12 | 13.39% → 6.76% | 32.62% → 8.73% |
| 6 | 26.32% → 21.15% | 48.17% → 20.80% |
| 4 | 47.99% → 47.04% | 74.76% → 57.51% |

For 24 cards this is a 52% reduction overall and 74% near the roots. Residual
differences remain because a row-wide plane cannot reproduce each leaf's full
cross-section or sheath volume. This does not establish equality for every
light direction. The source and all card counts remain unchanged.
`tests/headless/e2e/grass_debug_v2_shadow_fit.pwtest.js` measures shadows directly
against LOD0, requires the 24-card error below 7% overall and 10% near the roots,
and captures the normal scene from the same 3/4 and Side cameras. Metrics and
captures are under `tests/artifacts/screens/grass_debug_v2/shadow_fit/`.
The rejected collar-only and profile experiments are retained in `collar/` and
`profiles/`; final comparisons use `before/` and `after/`. The root-connection
regression still passes for every variant, with captures in
`tests/artifacts/screens/grass_debug_v2/root_join/shadow-fit/`.

The historical split-top comparison used the same maps, lighting and texel density.
It removed approximately 40% of the upper plane's geometric area, but showed no
consistent performance advantage across the measured workloads. Some views did
benefit; neither layout was consistently fastest. The four-card option is retained
alongside six cards for continued visual comparison. See
[the findings](GRASS_LOD3_FINDINGS.md) for the retained results and their limits.
Four-camera coverage checks still validate the four-card reconstruction against
the detached three-card baseline in an isolated test render. Those checks do not
validate the live inclined LOD3 variants against the curved LOD0 silhouette. Earlier
performance results do not measure the current four-card inclinations.

All product UI remains in English, regardless of the language of task requests.
The review page orders its buttons as **LOD0**, **LOD3 · 24**,
**LOD3 · 12**, **LOD3 · 6**, **LOD3 · 4**,
leaf and triangle counts,
optional purple card boundaries, orbit controls and five camera presets framing
the row or its central roots. **Far** starts from **3/4** and applies the same
square-fitting calculation as enabling **Square bounds**, including its center
and framing margin for the current viewport. It preserves both overlay toggles.
A separate **Square bounds** checkbox adds a blue
1 m x 1 m outline on the ground. Its center follows the full LOD0 horizontal
bounds, giving the tuft equal margins on opposite sides; this same square stays
fixed when switching to LOD3. It is hidden initially and independent of the
purple card boundaries. Enabling it retains the viewing direction and zooms out
only as needed to fit all four edges, centering the orbit target on the square.
The overlay is excluded from the grass leaf/triangle counters and casts no shadow.
It uses
game lighting and the damp Brown Earth material with the shared crown soil
profile at each of the ten roots, merged into one continuous soil surface with
world-aligned texture coordinates. Switching representations explicitly refreshes the static sun shadow
map, so a hidden representation cannot leave its shadow behind.

## Temporary 1,000-leaf spike experiment

`GrassDebugV2SpikeExperiment.js` previously replaced the default entry of
`debug_tools/grass_plant_study.html` and is now inactive. It scatters exactly 1,000 full-detail LOD0
leaves inside a blue 1 m × 1 m square, using 500 instances of each existing
source leaf (4,832,000 triangles in two instanced batches). There are no crowns
or alpha cards. The detailed source geometry and colors are unchanged; the
experiment's material tuning is described below. Brown Earth and the game lighting are retained, with a larger
static shadow frustum for the square and on-demand rendering.

Seed 192406 gives repeatable random placement, yaw across 360°, pitch ±8°, roll
±6°, height scale 0.85–1.15 and length scale 0.9–1.1. Roots stay at Y = 0 with
their original buried geometry. Root positions are sampled from the range that
keeps each rotated/scaled leaf's full bounding box inside the square; tips are
not clipped. This concentrates roots away from some borders instead of wrapping
geometry to neighboring tiles. The experiment was reduced from the initially
requested 100,000 leaves to 1,000 before final validation.

Rollback is complete: the HTML module script again loads
`GrassDebugV2PlantStudy.js`. The original study module, card geometry and atlases
were not edited for this experiment. To revisit the density experiment, switch
that single HTML script back to `GrassDebugV2SpikeExperiment.js`; its
`?experiment=off` bypass then loads the authoring study. The experiment test
injects its own entry into the first HTML response, so it remains reproducible
without replacing the restored page for the user.

The focused experiment check validates the actual submitted leaf count, grounded
transforms, varied heights/orientations, contained bounds, static shadow map,
successful rendering and the rollback URL. Captures are under
`tests/artifacts/screens/grass_debug_v2/spike_experiment_1k/`. This is a temporary
silhouette experiment; it makes no runtime performance claim.

### Softer leaf surface comparison

The experiment reduces fine vein-normal strength to 0.4 and adds 0.1 roughness
to its private texture (26/255 after byte quantization). Effective map roughness
changes from about 0.647–0.706 to 0.749–0.808. This softens the regular ribbing
and mildly suppresses highlights without adding per-leaf color variation.
The shared source surface generator and the original card study are not changed;
the adjustment is local to `GrassDebugV2SpikeExperiment.js`, recorded in its
`surfaceTuning` snapshot. To undo just this tuning, use normal strength 1 and
roughness offset 0 in that module.

Real before renders were saved before the material edit. The same 1,000 instance
transforms, cameras, resolution, land and lighting were verified against the
after capture. 3/4, top and supporting close-up views are saved under
`tests/artifacts/screens/grass_debug_v2/spike_experiment_1k/surface_tuning/`, with
untouched full-resolution PNGs in `before/` and `after/` and labeled JPEG pairs
at the root. The focused experiment test accepts `GRASS_SURFACE_CAPTURE=before`
or `after`; after mode checks those invariants against the saved before capture.
The difference is subtle at whole-patch scale and clearer in close-up vein detail.

## 100,000-tuft card benchmark

`tests/headless/perf/specs/grass_plant_cards_100k.pwtest.js` runs a hardware-GPU
experiment using the current twenty-leaf source and the historical three-/four-card
layouts, rather than the live six-card representation. Each instance is the entire
twenty-leaf row: 100,000 tufts represent two million leaves. Three-card instances
submit 300,000 cards / 600,000 triangles; four-card instances submit 400,000 cards /
800,000 triangles. Each case is one instanced draw with the same material and
4096 × 2048 PBR atlases. All instances are submitted without individual culling.

The experiment first places the 400 × 250 tufts side by side using their full
card bounds as spacing. It then compresses the field to exactly half its area
with the same count and unchanged tuft geometry. Both field dimensions shrink
by the square root of one half; spacing accounts for the unchanged outer tuft
extents. The near edge stays at Z = 0 and the field remains centered along X.
The historical 22 mm row-spacing run had extents of approximately
102.05 × 99.31 m and 72.16 × 70.22 m.

Bus-height, low and overview cameras retain exactly the same poses in both
layouts. Six counterbalanced rounds per view compare OFF, three cards and four
cards, with 24 warmup frames followed by 120 GPU queries per block. Compilation,
atlas generation, instance uploads, captures and overdraw diagnostics occur
outside the timed passes. The hardware GPU is required; software rendering,
disjoint queries and missing samples fail the experiment. No hardware-specific
budget or baseline is updated.

This longer experiment is opt-in with `GRASS_TUFT_BENCHMARK=1`, using
`PERF_BASE_URL` and a hardware-accelerated Chrome selected through
`PLAYWRIGHT_EXECUTABLE_PATH`. The default schedule measures one case per frame.
`GRASS_TUFT_SCHEDULE=paired` measures all three cases in each animation frame,
rotating and reversing their order, to reduce exposure to changing GPU clocks
between cases. It retains the same sample counts but increases aggregate GPU
load, so absolute timings from the two schedules must not be pooled. Paired
reports are saved in the artifact folder's `paired/` subdirectory.

Measurements include the isolated grass render, clearing and resolving a
1920 × 1080 RGBA16F target with 4× MSAA. Game sun and HDR environment are shared;
terrain, bus, sky, postprocessing, shadows and wind are excluded. Reports contain
mean, nearest-rank P99, median, raw samples, per-round deltas, CPU submission times,
frame intervals, rendering counts and GPU telemetry. Subtracting the OFF mean
estimates incremental cost; P99 values are never subtracted.

A separate untimed additive pass measures potential card-layer coverage at
960 × 540 with depth and alpha tests disabled. This includes transparent card
regions and is not a count of executed fragment shaders. Report both full-frame
and covered-pixel averages: compressing the field also changes its projected
coverage, especially in the overview. Timing differences between densities
therefore reflect both density and screen coverage, rather than isolating
overdraw as the sole cause. Generated reports, raw samples and actual-scene
captures live under `tests/artifacts/screens/grass_debug_v2/tuft_benchmark_100k/`.

### Controlled interior density comparison

`tests/headless/perf/specs/grass_plant_cards_controlled_100k.pwtest.js` compares
the same two densities and card layouts while keeping the entire screen inside
both fields. Three fixed interior cameras use heights of 6.883 m, 0.2 m and
12 m, with downward views that exclude the field boundaries. These are controlled
experiment poses, not the gameplay chase camera. Camera, resolution, materials,
lighting and tuft geometry remain identical between cases within each view.

Before timing, every ground-frustum corner must lie at least 1 m inside the
smaller field and the additive card-footprint diagnostic must cover over 99.9%
of the screen. Actual lit leaf-pixel coverage is measured separately at native
resolution: alpha holes naturally become less visible with greater density.
Captures and diagnostics are excluded from timing.

All four density/card combinations have separate static instance buffers,
compiled and uploaded before measurement. OFF and all four combinations render
in every measured frame, rotating and reversing their order to reduce clock-drift
bias. Six rounds of 30 warmup and 120 measured frames provide 720 GPU samples per
case/view. Query backpressure prevents queue overflow; incomplete or disjoint
results fail the experiment. Buffer versions and instance counts must remain
unchanged throughout measurement. Reports retain all timing samples and include
per-round density differences, GPU mean/P99, OFF cost and GPU telemetry.

Full-screen field coverage removes changing outer-field visibility as a confound.
The resulting comparison still includes more visible tufts, alpha coverage and
depth rejection, so it does not isolate fragment processing from every other GPU
stage. The five-pass schedule and interior camera angles also differ from the
earlier exterior experiment; absolute timings must not be pooled across them.
Use the same opt-in environment and standardized runner described above.
Evidence lives under
`tests/artifacts/screens/grass_debug_v2/tuft_benchmark_controlled_100k/`.

### Same-visible-tuft pair overlap

`tests/headless/perf/specs/grass_pair_overlap.pwtest.js` isolates overlap without
bringing additional tufts into view. It compares two large tufts and 100,000
small tufts, with all geometry fully inside fixed orthographic top and inclined
cameras. Three- and four-card layouts use the current twenty-leaf source and
shared material. Within each comparison, identity, count, orientation, projected
size, camera depth, camera and material stay fixed. Only horizontal translation
of the second tuft in each pair changes. Independent pairs never overlap.

Cases are adjacent, half-footprint overlap and full-footprint overlap. These
reduce each pair's footprint union by 0%, 25% and 50%, respectively. Near-first
and far-first submission orders are measured for both overlap levels. A fixed
4 mm separation along camera depth avoids coplanar cards; positions remain
unchanged when order reverses. These aligned duplicate pairs are controlled
limits, not a natural randomized field. Empty image regions created by overlap
are intentional; camera zoom or extra tufts would confound this comparison.

Tuft width is an even integer number of pixels, so overlap translations preserve
texture sampling phase. Before timing, all instance bounds must fit inside the
frustum, projected sizes and depth ranges must match, and total additive card
and alpha-tested raster-layer area must agree within 1% across cases. Additive
diagnostics disable depth and MSAA; the alpha diagnostic uses the material's
cutoff. They report total layers, unique covered pixels and redundant coverage,
which are potential raster work rather than executed fragment-shader counts.
Timed rendering retains the study's depth testing, alpha test and alpha-to-coverage.

OFF and all five placements/orders render in each measured frame, rotating and
reversing case order. Eight rounds of 30 warmup and 120 measured frames collect
960 GPU samples per case. Static matrices, draw counts and complete timer queries
are verified. The report includes mean/P99, differences from adjacent, per-round
difference ranges and the OFF baseline. All 100,000 tufts fit on screen at only
a few pixels each; the two-tuft case covers large projected cards. Compare within
each configuration rather than interpreting the two counts as equal screen load.
Use the existing opt-in environment and standardized runner. Evidence lives under
`tests/artifacts/screens/grass_debug_v2/pair_overlap/`.

### Removing completely hidden tufts

`tests/headless/perf/specs/grass_hidden_tufts.pwtest.js` compares fully aligned
pairs with their visible front instances alone. The shared pair-overlap helper
adds `visible_only`, physically omitting the rear member: two tufts become one,
and 100,000 become 50,000. The remaining instance matrices must match the front
subset exactly. Camera, material, projected scale, light and front depth remain
unchanged. Submitted triangle counts are checked per case; omitted instances
are not merely made transparent or moved outside the camera.

Before timing, raw RGB images for both pair submission orders are compared with
visible-only. Mean absolute channel difference must be below 0.05 out of 255
levels, and fewer than 0.1% of pixels may differ by more than two levels.
Additive diagnostics must preserve unique pixel coverage within 0.1% while
halving total potential card/leaf layers. Front instances stay fully in frame.

OFF, adjacent, both full-overlap orders and visible-only are measured together
in each frame with rotating/reversed order. Eight rounds of 30 warmup and 120
samples collect 960 GPU samples per case. All static buffers and complete GPU
queries are checked. Reports include mean/P99, mean minus the same OFF baseline,
and full-overlap minus visible-only savings. Approximate 95% Student t intervals
use the eight paired round-mean differences. These are exploratory comparisons;
P99 values are never subtracted and estimates must retain their uncertainty.

This measures rendering savings when hidden instances are already known. It
does not implement or time gameplay visibility detection, and cannot remove
partially visible tufts. The prior scope limits still apply: 100,000 tufts are
only a few pixels wide, while the two-tuft case tests large projected cards.
Use the newly interleaved OFF and cases instead of pooling earlier schedules.
Evidence lives under `tests/artifacts/screens/grass_debug_v2/hidden_tufts/`.

The same spec accepts `GRASS_HIDDEN_LAYERS=10` for one visible tuft hiding nine
copies. Single-stack cases contain 10 tufts; the 100,000-tuft cases contain
10,000 independent stacks on a 100 x 100 grid. The shared helper keeps 4 mm
camera-depth spacing between consecutive layers, with an unchanged front
matrix and no projected scale change. All ten layers must remain in frame.

OFF, visible-only, two-layer controls and ten-layer stacks are interleaved in
each frame. Case order rotates through every slot before reversing, with equal
per-slot counts asserted for every case in each round; reversal must not be
coupled to odd/even frame parity. Both near-first and far-first submission orders are measured for
the two- and ten-layer cases. The image checks apply to every stack/control;
additive diagnostics must preserve unique coverage while total potential raster
layers scale by two or ten. Visible-only physically submits just one member per
stack, so the large case changes from 100,000 to 10,000 instances. Draw and
triangle counts are validated per case. Eight rounds retain the same 960 GPU
samples per case as the pair experiment.

The report includes mean/P99, the fresh OFF baseline, incremental cost ratios
for 1/2/10 layers, absolute savings from removing hidden instances, and round
intervals. A ratio against a small OFF-subtracted value can be noisy; retain
the absolute differences and do not assume ten layers cost exactly ten times
one layer. The grid, projected sizes and interleaved workload differ from the
pair experiment, so compare controls within this run. Artifacts are kept under
`tests/artifacts/screens/grass_debug_v2/hidden_tufts_10/`.

## Flight benchmark

- The Benchmark section provides Run (Stop while active) and a stack of completed
  results beneath it, oldest first. Each one-line result starts with the run's grass configuration (OFF, LOD0 or LOD3), then
  shows GPU average/P99 in milliseconds when available, otherwise
  explicitly labeled frame timings. Hover the line for GPU, frame-interval and CPU
  averages/P99, sample counts, duration, distance, drawing-buffer resolution, DPR
  and GPU coverage notes. Completed results remain visible while later runs are
  active or cancelled. History lasts for the page session and is exposed as
  `benchmark.results`; `benchmark.result` remains the current run's result.
- Each run resets to the Overview preset at `(19, 22, -22)`, yaw/pitch/roll
  `(138°, -38°, 0°)`. The first path tangent matches that viewing direction.
  After a two-second stationary warmup, the measured flight descends smoothly
  through the game-derived bus camera position, then visits:
  `(-2.4, 6.883, 5.421)`, `(-8.012, 1.258, 14.806)`,
  `(-8.012, 1.258, 24.806)`, and `(14.39, 8.247, 48.256)`.
  The middle leg stays at the low height and follows the sidewalk for exactly 10 m.
- Quintic Hermite legs share tangent directions and zero endpoint curvature.
  The original 24-second nominal duration scales with the added Overview-to-bus
  distance, preserving the route's nominal average pace. The quintic distance
  profile is then retimed: the entire 10 m sidewalk leg moves at half the base
  profile's speed at each route position. Quintic
  speed transitions over the 5 m before and after that leg ease into the slowdown
  and accelerate out toward the final position. This extends the flight duration;
  the added Overview leg does not compress the whole route into the old duration.
  Traversal accelerates and decelerates smoothly without stopping at intermediate
  points. The camera looks along the actual
  path tangent with world-up and no roll. Intermediate supplied rotations are
  adjusted to the path; the final arc approaches with the supplied yaw/pitch
  `(21.273°, -23.461°)`. At arrival it holds that exact pose for at least one second
  before ending measurement; the final pose remains after the run. The hover details
  separate flight and final-stop durations. Frame, CPU and GPU statistics include
  that stop, and controls remain suspended during it.
- Frame intervals include VSync and scheduling delays; CPU measures JavaScript
  work in the frame; GPU timer queries cover the full scene rendering. Warmup and
  result-draining frames are excluded. P99 uses nearest rank without trimming
  hitches. GPU samples are matched by submission sequence, including late results,
  with at most two seconds to drain. Unsupported/disjoint timers yield no GPU
  statistic; missing samples are reported as partial coverage, never zero cost.
- Mouse, movement keys, presets, grass and land selection are suspended during the
  flight. Results retain the run's grass mode, counts and land substrate, exposed
  in the hover details and
  snapshot even after a different mode is selected. Stop or Escape
  cancels without publishing partial timings. Losing window focus, hiding the tab,
  or resizing cancels the run to avoid mixing incompatible measurement conditions.
  Controls resume without jumping away from the last camera pose.
- Measurements cover the whole scene with the selected grass mode. They do not
  directly measure incremental grass cost; matched OFF/LOD0/LOD3 runs enable
  comparison, but the sub-1 ms objective still requires isolated bus-view profiling.

## Grass objective and references

The objective is convincing 3D grass with minimal incremental cost, ideally
**less than 1 ms GPU time at the bus camera**. Measure future grass-on versus the
same scene with grass off, after asset/shader warmup, at matching camera, viewport,
lighting, AA and hardware. Whole-scene GPU time is not grass cost. This baseline
reports the grass cost as unmeasured; it cannot establish a grass performance pass.

Primary reference: the local MCP grass project found at
`C:/Users/rogel/Projects/blender_mcp_tests/trees/public/grass/` (the older
`blender/_mcp/_tests/trees/public/grass` path does not exist). Study `planter.html`,
`the_grass.html`, `fable.html`, `engine2/README.md` and
`fable_experiment/README.md`: particularly blade/far-surface agreement, stable LOD
coverage, and interleaved grass-on/off GPU measurements. Its documented timings
are reference results, not measurements of this application. No runtime import
or machine-path dependency on that project is introduced.

Secondary reference: the preserved Grass Debug v1 runtime and specs. Its final
visual result remains human-rejected (`GRASS_LAB_HUMAN_REJECTION.md`); keeping it
accessible does not reinstate visual approval or authorize gameplay integration.

## Verification

`tests/headless/e2e/grass_debug_v2.pwtest.js` exercises real asset startup,
dimensions, rendering, diagnostics, orbit, camera reset, resize, redirects and
v1 boot. Evidence is gitignored under `tests/artifacts/screens/grass_debug_v2/`.
`tests/headless/e2e/grass_debug_v2_startup.pwtest.js` checks partial scene cleanup
and startup when old unversioned scene/catalog responses remain cached.
`tests/headless/e2e/grass_debug_v2_benchmark.pwtest.js` verifies route waypoints,
the Overview start, continuous bus-camera join, straight low pass, tangent tracking,
two accumulated results, timing collection
and interruption recovery without losing history.
`tests/headless/e2e/grass_debug_v2_benchmark_timing.pwtest.js` checks late GPU
attribution, unavailable/disjoint timers, partial coverage, run reset, half-speed
sidewalk travel, smooth exit acceleration and the measured stationary final second.
`tests/node/unit/grass_debug_v2_benchmark.test.js` checks the timing statistics.
`tests/headless/e2e/grass_debug_v2_grass.pwtest.js` checks deterministic geometry,
all 64 atlas slices, source-leaf preservation, count changes, benchmark mode locking
and result attribution. Bus/close-up captures for all three modes are saved under
`tests/artifacts/screens/grass_debug_v2/grass/`.
`tests/headless/e2e/grass_debug_v2_card_normals.pwtest.js` renders both sides of a
card under overhead light to prevent inverted baked normals darkening back faces,
and verifies transparent normal-atlas padding and shader compilation.
`tests/headless/e2e/grass_debug_v2_blade_cards.pwtest.js` checks upward blade-edge
normals, grounded card bottom edges, bounded transparent headroom, rendered narrow
blade tips retaining at least 95% of their source height without stretching at
1×, 1.5× and 2× display scaling, and
light transmission through a blade without emissive light in darkness.
Actual runtime atlas exports, individual LOD tuft captures and a single-blade
capture are saved under `tests/artifacts/screens/grass_debug_v2/shapes/`.
`tests/headless/e2e/grass_debug_v2_mixed.pwtest.js` checks collinear grounded roots,
the line/card silhouette from front, inclined and reverse views at DPR 2, compact atlas size, separated rows,
visibility switching, purple card boundaries, per-LOD counters, camera preset
and Mixed benchmark result attribution (including boundary visibility).
Mixed captures and verification output live under
`tests/artifacts/screens/grass_debug_v2/mixed/`.
The card-normal suite also compares curved-line brightness against LOD0 from
above and below the blades.
`tests/headless/e2e/grass_debug_v2_plant_cards.pwtest.js` checks live review-page
startup, English UI, twenty source leaves, all ten leaf silhouettes on each side
of the atlas, enlarged upper coverage, shared PBR maps, transparent upper-center
coverage, normalized normals, roughness range, mesh counts, soil at every root
and static-shadow refresh. It asserts five mode buttons ordered LOD0, 24, 12, 6,
4 cards with no three-card UI option, 4/6/12/24 card boundaries, 8/12/24/48
triangles and all live variants
in the snapshot. Every live card, including the four-card variant's upper panels,
must be inclined by more than 2°. This assertion fails on the previous flat tops.
The four-card tip planes must exactly match the six-card tips in positions,
UVs and inclination. Their merged lower planes keep the same root and upper
join and remain steeper than 30°. The focused root-connection test also passes
with this layout; its captures are under
`tests/artifacts/screens/grass_debug_v2/root_join/preserved-tips/`.
Switching must hide other meshes
and refresh shadows using only the selected representation.
The planes on each side must have distinct inclinations, share exact position/UV
joins and sample the full atlas page. Sampled outer-profile errors must stay
below 13 mm for four cards, 5 mm for six cards, 2 mm for twelve cards and 0.5 mm
for twenty-four cards. The fitted geometry also remains within 9 mm of the source centerline. The test
also verifies that the old three-card mesh is detached from the live scene. The historical benchmark
geometry is compared in an isolated test render from four views. The test saves
LOD0/LOD3 captures and purple boundary diagrams
under `tests/artifacts/screens/grass_debug_v2/row_cards/`.
The initial raised-tip revision is retained in `raised_tips/`, and the curvature
revision in `curved_blades/`, and the simplified UI in `three_cards_only/`;
the square overlay revision in `square_bounds/` and the six-card revision in
`six_cards/`; the restored flat-top four-card version is in `four_and_six_cards/`,
and the inclined four-card captures use `four_inclined_cards/`.
Captures with 44 mm root spacing use `double_spacing/`; captures adding
the twelve-card option use `twelve_cards/`. Initial captures with twenty-four
cards use `twenty_four_cards/`. The connected-root revision is under
`tests/artifacts/screens/grass_debug_v2/root_join/layouts/`; current contour-fit captures use
`tests/artifacts/screens/grass_debug_v2/shadow_fit/layouts/`.
The focused `tests/headless/e2e/grass_debug_v2_root_join.pwtest.js` renders the
actual alpha cards and source above the same depth-writing soil, then checks a
continuous foreground path between both blades across the root in a top-down
12 mm crop. It reproduced connected LOD0 but disconnected 4/6/12/24-card LOD3
at the former 1 mm join; all five pass at the corrected 3 mm join. Root masks
and close-up scene captures are retained under `root_join/before/` and
`root_join/after/` alongside the layout captures.
The test verifies the square's exact
one-metre sides, equal margins around the tuft, blue color, visibility across
LOD changes, independent toggles, unchanged counters and initial camera fit.
The same test checks that both source ends remain above
9.5 cm, that the blade body bows 12-30 mm above its chord, and that its slope
relaxes by more than 20° without abrupt changes or downward-facing ends. This
check failed for the previous nearly straight shape and passes for the new arch.
LOD0 and all LOD3 variants are captured from the same cameras. The test
does not assert visual approval of the LOD0-to-LOD3 transition.
