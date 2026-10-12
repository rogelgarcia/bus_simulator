# Gameplay grass

The existing **Grass** Options tab selects **Texture** or **3D**. Source defaults,
Reset and settings without a supported mode resolve to `3d`. An explicit
`texture` override persists in `bus_sim.grass.v1` and the `grass` preset group.
Preview is immediate; Cancel restores the original mode, Save retains the edited
group, Reset previews defaults, and Use defaults removes overrides. Each mode has
its own details heading and an empty state for future controls. No density,
distance, quality or experimental lab controls are exposed.

Texture uses the existing textured terrain and stops grass updates and rendering.
A fresh Texture session does not fetch the grass package. After a live switch,
the hidden renderer retains its resources for reuse until city detach. City
detach disposes the renderer, including shadow targets and instance buffers;
re-entry creates one renderer. The gameplay loading cover waits for grass readiness.

## Shared renderer and assets

`src/graphics/engine3d/grass/runtime/` owns the shared baked appearance, field
batching, transitions and selection. The bus lab imports compatibility re-exports
and retains both its default baked strategy and the previous `?grass=current`
comparison. Gameplay imports no lab scene, diagnostic UI or authoring assets.

The authenticated `assets/public/grass/gameplay/` package contains the central
2 m LOD0–2 source tile, exact reduced individual blades for LOD3/4, paired prepared
canopy/litter maps and their mip chains. It preserves `canopy-palette-17`, shaded
roots, source variation, view correction and the continuous terminal handoff.
Generate it through `node tools/bake.mjs --target materials/grass/gameplay-runtime
--publish`; see the [registered workflow](../../tools/bake_materials/grass/gameplay_runtime/README.md).
Missing or invalid payloads are reported as loading errors; there is no hidden
substitution with the old grass renderer.

## Coverage, camera and lighting

Gameplay uses the current flat city's authored surface height. A conservative
coverage mask removes road and junction polygons expanded by curb/sidewalk width,
building footprints and reservations. Every leaf, transition, litter and far
canopy fragment uses that same mask. Sampling is capped at 4096², and the mask
adds one texel of clearance. Non-flat terrain remains outside the current city's
supported terrain contract.

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

The camera drives automatic horizontal LOD ranges of 0.6 / 0.8 / 20 / 30 / 40 m,
30% transition bands and a 31.5–40 m final handoff. Selection is cached at
50 ms / 0.2 m. Detailed instances occupy a 128 m square, translated on a 16 m
grid. A periodic 16 m blade-variation block and world-space texture variation keep
overlapping leaves stable across anchor changes. There are no exposed window
perimeter walls. Outside the window, spatially culled 32 m batches of one-metre
canopy tiles cover valid city ground. No lab roadside rectangles are used.

Prepared radiance follows the game's sun intensity. Separate cached visibility
targets capture authored static casters and moving dynamic participants without
changing game meshes or baked-shadow ownership. The static target refreshes when
sun direction changes; the window target follows camera-window and vehicle
movement, with a 100 ms update interval. Shading combines both visibility fields.
Grass does not cast duplicate live self-shadows. Texture suspends these passes.

## Removed edge blend

The sidewalk grass-edge dirt strip has been removed from rendering, materials,
settings, presets, offline export adapters and tools. Old
`sidewalkGrassEdgeStrip` fields are ignored and disappear on sanitized export.
Its dedicated specification and builder tests are retired. This removal does not
remove sidewalk geometry or the exclusion boundaries consumed by gameplay grass.

## Verification

`tests/node/unit/grass_settings.test.js` covers default/legacy/persistence behavior.
`tests/headless/e2e/grass_gameplay_modes.pwtest.js` exercises the production game,
mode previews, cancellation, save/reload, reset, repeated switching and disposal.
It also drives the bus, moves the camera, checks road/building exclusion samples,
and compares rendered grass with and without cached external shadows.
The existing bus-lab regression continues to cover all six shared LODs.
Generated captures and measurements live under
`tests/artifacts/screens/grass/ai611_game_migration/`.
