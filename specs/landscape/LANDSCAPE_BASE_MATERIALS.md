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
Source selection comes before later stochastic anti-tiling. Broad ecological,
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

## Transition quality

Continuous coverage identifies which materials may contribute. Within that
support, material relief determines interleaving: elevated details stay exposed
while a neighboring material fills lower areas. Ordinary coverage-only alpha
blending is insufficient for the near-camera boundary. Source height is a surface
appearance input, not terrain elevation, collision or a new measured height field.
Read relief from the retained displacement map; diffuse brightness is not height.

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
