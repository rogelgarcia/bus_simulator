# Gameplay grass

The **Grass** Options tab uses five mutually exclusive quality buttons, with
**High** selected by default. The accepted lab shortening transition is used by
all automatic quality levels as of 2026-10-14.

| Button | Rendering | LOD3 cutoff | LOD4 cutoff |
| --- | --- | --- | --- |
| Flat | Original terrain texture, patch renderer disabled | — | — |
| Low | LOD5 canopy only, no blade meshes drawn | — | — |
| Medium | Previous Auto reach | 16 m | 24 m |
| High | Accepted current Auto reach (default) | 18 m | 36 m |
| Ultra | Extended Auto reach | 22 m | 42 m |

LOD0/1/2 retain 0.6 / 0.8 / 8 m cutoffs. Settings persist as lowercase button
names in `bus_sim.grass.v1` and the `grass` preset group. Previous `texture`
settings migrate to `flat`; `3d`, absent and unsupported settings resolve to
`high`. Preview is immediate; Cancel restores the original quality, Save retains
it, Reset previews High, and Use defaults removes overrides.

Flat uses the existing textured terrain and stops grass updates and rendering.
A fresh Flat session does not fetch the grass package. After a live switch,
the hidden renderer retains its resources for reuse until city detach. City
detach disposes the renderer, including shadow targets and shared patch buffers;
re-entry creates one renderer. The gameplay loading cover waits for grass readiness.
The patch pools are reserved for Ultra's 42 m reach during loading. Quality
changes update distance uniforms and selection without replacing the asset,
geometry, materials or buffers. A selection made while loading is applied after
shader preparation before the group becomes visible.

## Shared renderer and assets

`src/graphics/engine3d/grass/runtime/GrassPatchRenderer.js` owns the immutable
patch geometry, bounded mesh pools, transitions and selection shared by gameplay
and the bus lab's `?grass=patches` strategy. Gameplay snapshots identify
`strategy: patches`; the old camera-dependent instance batches are no longer
part of gameplay. The lab retains its default baked reference and the previous
`?grass=current` comparison. Gameplay imports no lab scene, diagnostic UI or
authoring assets. The lab's baked reference and patch path consume the same
authenticated gameplay package. See [GRASS_RUNTIME_REDESIGN.md](GRASS_RUNTIME_REDESIGN.md)
for measurements and remaining performance targets.

The runtime loader generates mipmaps for textures containing only a base level
and preserves supplied multi-level mip chains. A lone base level must not be
passed as a complete manual chain; otherwise minified litter can sample black.

Gameplay and the [bus lab's curved layout experiment](GRASS_DEBUG_V2.md#curved-boundary-experiment-ai-613-2026-10-12)
share `GrassBoundaryMask` for filtered vector-contour coverage. The gameplay
adapter combines the city's final road contours with building and slab exclusions.
The lab's experimental road layout and controls remain isolated from gameplay.

The authenticated `assets/public/grass/gameplay/` package contains the central
2 m LOD0–2 source tile, exact reduced individual blades for LOD3/4, paired prepared
canopy/litter maps and their mip chains. It preserves `canopy-palette-17`, shaded
roots, source variation, view correction and the continuous terminal handoff.
Generate it through `node tools/bake.mjs --target materials/grass/gameplay-runtime
--publish`; see the [registered workflow](../../tools/bake_materials/grass/gameplay_runtime/README.md).
Missing or invalid payloads are reported as loading errors; there is no hidden
substitution with the old grass renderer.

## Coverage, camera and lighting

Gameplay uses the current flat city's authored surface height. Road exclusion
comes from the road builder's final `sidewalkOuterBoundaryLoops`, including
curved sidewalk edges and junction corners. All road loops are filled together
with even-odd winding so enclosed grass islands remain available. When roads
have no sidewalk contour, the adapter uses the authored asphalt polygons and
their hardscape margin. Building footprints and reservations remain separate
exclusion groups so overlapping obstacles cannot cancel each other.

The mask retains antialiased coverage and uses linear filtering without mipmaps;
the 0.5 contour follows the hardscape within each one-metre rendering cell.
Blade roots and litter/canopy surface fragments use
the same world-space mask; eligible blades retain complete overhanging tips.
CPU coverage queries use matching bilinear sampling
and the same threshold; batch culling conservatively includes partial cells.
Sampling remains capped at 4096² (about 14.65 cm texels for the 600 m city),
with filtered contours between texels instead of square nearest-neighbour steps.
Final sidewalk contours receive no additional grass setback. Non-flat terrain
remains outside the current city's supported terrain contract.

Building and bus-start foundation slabs additionally supply the final slab plan's
`foot` contour, after placement, apron merging and sidewalk clipping. This is the
outer ground-contact boundary of the sloped skirt, not the top outline or the
original building/reservation footprint. All slab surfaces and slopes are
excluded from grass; the slab contour uses only the mask's texel clearance,
without an extra fixed grass setback. The same mask covers every grass LOD and
camera window. Slab geometry and the grass asset package are unchanged.

`grass_slab_exclusion.pwtest.js` checks all rendered city slabs, both base types,
rotated and merged footprints, sidewalk joins and preserved gaps. Visual evidence
is gitignored under `tests/artifacts/screens/grass/ai612_sloped_base_exclusion/`.

High uses automatic LOD ranges of 0.6 / 0.8 / 8 / 18 / 36 m, measured
from camera to ground in three dimensions. LOD0/1 use 2 m patches; LOD2–4 use
4 m patches. Conservative coverage grids and frustum/range culling choose from
bounded pools each frame. Geometry and 40 bytes of shared placement attributes
are uploaded during loading and remain immutable during travel. Ordinary mesh
transforms place selected patches on a stable world grid; reversing or crossing
boundaries preserves the same grass at each position. No lab rectangles are used.

Static 32 m quads, coplanar with the authored ground and depth-biased, blend litter into canopy
appearance. During the incoming LOD4 band (15–18 m), bright leaf shapes from the
existing canopy maps fill some of the exposed litter beneath the sparse blades.
This positive-only blend preserves dark soil and adds no geometry or texture assets.
LOD4 blades shorten over a staggered interval within 18–36 m. Each blade takes
2.25 m to shorten, with a stable world-tile/blade phase selecting its start.
The ground blends from litter to canopy over 15.75–36 m. Medium uses a 16–24 m
height band, a 1 m blade span and 15–24 m ground blend; Ultra uses 22–42 m,
a 2.5 m blade span and 19.5–42 m ground blend. Adjacent blade levels retain
complementary opaque dissolve. Every representation uses the shared coverage mask.
Loading prewarms all five blade levels and the surface, including invisible levels.
Disposal while shader compilation is pending cancels the warmup draw; preparation
does not restore renderer state saved before an asynchronous loading interval.

Grass already contains baked local shading. SSAO/GTAO depth and normal passes
exclude its group and use the underlying city terrain; they do not draw dense
blades with generic override materials. Dynamic AO follows the same exclusion.
The surface samples its textures through the grass shader, without a redundant
material map that would misclassify it as an AO alpha-cutout receiver. Grass
still renders in the color pass and receives the scene's screen-space AO.

Prepared radiance follows the game's sun intensity. Separate cached visibility
targets capture authored static casters and moving dynamic participants without
changing game meshes or baked-shadow ownership. The static target refreshes when
sun direction changes; the 128 m dynamic target follows camera anchors on a
16 m grid and vehicle movement, with a 100 ms update interval. Anchors affect
only shadow caching, not grass geometry or coverage. Shading combines both visibility fields.
Grass does not cast duplicate live self-shadows. Flat suspends these passes.

## Removed edge blend

The sidewalk grass-edge dirt strip has been removed from rendering, materials,
settings, presets, offline export adapters and tools. Old
`sidewalkGrassEdgeStrip` fields are ignored and disappear on sanitized export.
Its dedicated specification and builder tests are retired. This removal does not
remove sidewalk geometry or the exclusion boundaries consumed by gameplay grass.

## Verification

`tests/node/unit/grass_settings.test.js` covers default/legacy/persistence behavior.
`tests/headless/e2e/grass_gameplay_modes.pwtest.js` exercises the production game,
all five quality previews, cancellation, save/reload, reset, repeated switching
and disposal. It verifies cold Flat loading, selections made during loading,
Ultra persistence, restoration of High defaults, and live shader distance bands
without replacing geometry or changing buffer versions.
It also drives the bus, moves the camera, checks road/building exclusion samples,
and compares rendered grass with and without cached external shadows.
The existing bus-lab regression continues to cover all six shared LODs.
Generated captures and measurements live under
`tests/artifacts/screens/grass/quality_presets/`.

`grass_gameplay_patches.pwtest.js` runs Medium, High and Ultra through the same
movement and AO checks. It tracks the production grass's 36 GPU buffers
through 120 forward/reverse camera poses, six shadow anchors and all blade
levels. It checks zero grass uploads, unchanged attribute versions and identical
patch placements on return. It exercises SSAO/GTAO with both alpha handling modes,
requiring color rendering, terrain depth rendering and no grass override draws
or false alpha-cutout candidates. Captures and data are under
`tests/artifacts/screens/grass/gameplay_patches/`.

`grass_gameplay_curves.pwtest.js` validates 18 m / 30 m contours with enclosed
grass islands, overlapping slab exclusions, and actual city sidewalk curves.
It captures matching close and overhead game views before and after, plus
unobstructed transition and far views with camera-window shifts. Evidence is gitignored under
`tests/artifacts/screens/grass/gameplay_curved_boundaries/`. The bus-lab curved
boundary suite, gameplay mode lifecycle and sloped-base suites verify the shared
mask and retained exclusions together.
