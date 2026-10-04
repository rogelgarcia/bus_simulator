# Landscape base materials and relief transitions

## Base tile quality

A repeating landscape base tile represents one homogeneous material. It must not
contain recognizable islands of another material, bare patches, isolated stones,
twigs, moss clusters or broad dark/light regions. Even subtle tile-scale tonal
changes become a visible pattern when repeated across a large terrain. Fine sand
grain, grass blades and mineral detail remain appropriate when evenly distributed
and at a consistent physical scale. The accepted `pbr.aerial_beach_01` sand is the
visual reference for an even base; this rule does not require a flat untextured
color or removal of physical normal/roughness detail.

Choose replacement sources by inspecting both one tile and repeated views at game
POV, oblique and aerial scales. A seamless edge alone does not satisfy this rule.
Do not hide mixed-material source content through a global contrast adjustment.
Source selection comes before later stochastic anti-tiling. AI577 D3 samples every natural
material with world-anchored stochastic hex tiling: it reshuffles, rotates and blends copies of
the tile, so a distinctive feature would still recur at random positions, and homogeneous
sources remain required. Sand and seabed keep their ripple orientation (no rotation, offsets
along the crests only). Random rotation removes a page's mean normal lean; the grass page's
2.15° lean shifts sunlit grass by about −0.45 sRGB bytes. Broad ecological,
moisture and soil variation belongs to the terrain coverage/appearance model,
where it can have an intentional landscape-scale distribution.

Retain CC0 source URLs, license, dimensions, physical scale and hashes for new
downloads. Install bounded runtime derivatives through `landscape/appearance`
under `node tools/bake.mjs`; never consume `downloads/` at runtime. New landscape
bindings must preserve older immutable terrain/appearance snapshots and avoid
changing unrelated consumers of shared PBR materials.

## D1a source audit

The D1 publication used the following sources. Inspection covered their albedo
and landscape repetition, rather than relying on an asset's descriptive name.

| Soil binding | Previous source | Finding |
| --- | --- | --- |
| Unspecified substrate | `ground_037` | Moss, exposed soil and debris create recognizable mixed patches. Replace. |
| Seabed | `gravelly_sand` | Distinct pebbles and twigs become landmarks in every repetition. Replace with the accepted sand source. |
| Sand | `aerial_beach_01` | Accepted even sand, retained unchanged. |
| Loam / grassy cover | `grass_004` | Broad dark areas reveal the repeated tile despite dense grass detail. Replace with more uniform grass. |
| Forest soil | `forrest_ground_01` | Grass, dirt and twigs are mixed within one tile. Replace with plain soil; forest dressing is a separate future layer. |
| Exposed rock | `rocky_terrain_02` | Green moss islands and stone patches expose repetition. Replace with a continuous stone surface. |

Where a replacement source is already a single material but retains broad source
illumination or tonal drift, a declared landscape-specific derivative may remove
that low-frequency drift through the registered preparation pipeline. Preserve
its small-scale surface detail and retain the exact processing recipe with source
identity. This is not a substitute for replacing a mixed-material source.

The replacement source selection is [ambientCG Grass008](https://ambientcg.com/view?id=Grass008)
for dense short grass, [ambientCG Ground006](https://ambientcg.com/view?id=Ground006)
for plain soil and forest substrate, and [ambientCG Granite005A](https://ambientcg.com/view?id=Granite005A)
for evenly distributed mineral grains. Ground006 is an approximation, Grass008 is
procedural with bitmap elements, and Granite005A is procedural, as identified by
the provider; their supplied relief maps are
not presented as measured terrain. ambientCG releases these assets under CC0.
Seabed reuses the already accepted sand source. A darker uniform calibration may
distinguish forest substrate without baking twigs, foliage or soil patches into
the repeating tile. Forest cover IDs and future vegetation placement remain
separate from this base material choice.

The default landscape soil catalog uses these corrected bindings for future
imports and newly created landscapes. Saved revision manifests retain their own
material IDs and continue to resolve their original appearance snapshots.

## D4 micro detail source

AI577 D4 adds a micro layer only where measured texel density requires it. The 4-meter
materials reach 3.9 mm per texel at their 1024 tier, so only sand and seabed (30-meter accepted
sand, 29.3 mm per texel at 1024) receive one. About 25 Poly Haven and ambientCG close-up sand
candidates were compared with contact sheets, shaded one-tile and 4×4 renders and stationarity
metrics. Every candidate in the preferred 0.5–2 m range was disqualified: sand_02 has shoe prints
in its relief, sand_03 a tile-scale relief band (1.94× energy variation across X),
damp_beach_sand pits, damp_sand debris, dense_sand and park_sand footprints or tracks,
Ground055S directional wind ripples, Ground080 a diagonal track and Ground052 rib-like features.
Ground054 was the only stationary candidate: block-variance coefficient of variation 0.07 for
luminance and 0.15 for slope, directional profiles within 1.32×.

| Source | Provider | License | Technique | Stated size | Retained maps | Archive | Retained originals |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [Ground054](https://ambientcg.com/a/Ground054) | ambientCG | CC0-1.0 | Surface photogrammetry | ca. 3.5 m × 3.5 m | 1K PNG color `bb3b8b28…`, NormalGL `33125854…`, 16-bit displacement `ee83f71d…` | `Ground054_1K-PNG.zip` `19aafb7d…` (17,930,839 bytes) | `downloads/landscape/ai577_d4/ambientcg_Ground054/` |

The landscape-local material `pbr.landscape_sand_micro_v1` keeps the three maps unchanged at the
provider's real 3.5 m scale (3.42 mm per texel at 1024; the close-up camera's footprint spans
1.47–22.4 mm per pixel). It is deliberately not registered in the global catalog. Its recipe
`micro-periodic-highpass-v1` (radius 9 pixels, half-power wavelength about 0.173 m, luminance
range from the 0.1/99.9 percentiles = 0.625, 0.14% clamped texels at 1024) keeps only grain and
dimple detail, so the source hue never reaches the rendered sand. Limitation: a smoothed oval
impression about 35 × 20 cm recurs every 3.5 m in the relief; runtime stochastic sampling of the
micro layer breaks its repetition up.

## Transition quality

Continuous coverage identifies which materials may contribute. Within that
support, material relief determines interleaving: elevated details stay exposed
while a neighboring material fills lower areas. Ordinary coverage-only alpha
blending is insufficient for the near-camera boundary. Source height is a surface
appearance input, not terrain elevation, collision or a new measured height field.
Read relief from the retained displacement map; diffuse brightness is not height.

Since AI577 D2, generated fine coverage pages supply irregular natural boundaries and
profile-specific band widths, and world-anchored per-material clump relief interleaves the
materials in tussocks, patches and boulders before texture relief resolves blade and grain
edges (see [LANDSCAPE_SURFACE_DETAIL.md](LANDSCAPE_SURFACE_DETAIL.md)).

Use one normalized result for base color, normals, roughness, metalness and AO.
Zero-coverage layers remain absent, single-material interiors remain unchanged,
and degenerate/equal-height combinations must retain a valid base. Height-driven
contrast must reduce as the projected footprint or resident source resolution
can no longer represent its features, retaining stable filtered coverage at
distance. Residency changes must not change physical feature scale or introduce
abrupt boundary motion.

Validation includes swapped-height dominance, absent-layer preservation, valid
normalization, distant filtering, material-tier arrival, tile/LOD continuity,
legacy bindings and low-budget behavior. Four matched real-terrain captures and
same-condition resource measurements accompany the correction in AI 577 D1a.
Evidence remains under `tests/artifacts/screens/landscape/ai577/d1a/`.

See [LANDSCAPE_APPEARANCE.md](LANDSCAPE_APPEARANCE.md) for retained material identity,
[LANDSCAPE_SURFACE_COVERAGE.md](LANDSCAPE_SURFACE_COVERAGE.md) for terrain coverage,
and [LANDSCAPE_APPEARANCE_RUNTIME.md](LANDSCAPE_APPEARANCE_RUNTIME.md) for streaming.
