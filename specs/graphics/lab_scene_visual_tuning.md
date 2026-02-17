# Lab Scene Visual Tuning Spec

## Purpose

`Lab Scene` is a standalone look-development/debug tool for repeatable visual tuning without gameplay simulation dependencies (no bus AI, routing, or fleet updates).

## Entry / navigation

- HTML entrypoint: `debug_tools/lab_scene.html`
- Q menu location: `Setup -> Debuggers -> Lab Scene` (shortcut `L`)
- Exit: `Esc` returns to `index.html` (Welcome)

## Scene composition

- Deterministic city seed with fixed map layout.
- Road network:
  - Main arterial (2+2 lanes)
  - Crossing road (1+1 lanes)
  - One-way curved connector
- Uses the same `RoadEngineRoads` path as gameplay city rendering.
- Open area: large terrain envelope around the road layout.
- Buildings: 5 fixed blocks around the central road/crossing area.
- Buildings use catalog `configId` entries with textured wall materials.
- Trees are enabled using the standard city terrain/tree generator path.
- Traffic controls (stop signs/traffic lights) are placed from RoadEngine/asphalt-derived junction data.
- Curated props:
  - Parked bus for scale/composition
  - Material reference set (metal sphere, rough sphere, clearcoat cube)

## Camera presets

Presets are fixed, named, and bound to keys for repeatable review captures:

1. `Overview` (`1`): wide city framing
2. `Near-road` (`2`): asphalt/curb readability
3. `Bus follow` (`3`): vehicle-scale and grounding read
4. `Corner detail` (`4`): intersection edge detail
5. `Crossing front` (`7`): near crossing framing with bus front visibility
6. `Crossing right wide` (`8`): farther/lower crossing framing from the opposite sidewalk with stop-sign readability
7. `Material close` (`5`): reference object inspection
8. `Building glass` (`6`): window reflection checks

Mouse camera movement:
- Drag: orbit
- Shift + Drag / Middle-drag: pan
- Wheel: zoom

## Visual parameter controls

- Left panel: camera presets only.
- Right panel: gameplay `Options` menu structure with one `Layers` tab.
- On/off items use toggle switches:
  - Shadows
  - Bloom
  - Sun Bloom
  - Sun Flare
  - Window reflections
- Ambient Occlusion mode uses a single choice control: `Off` / `SSAO` / `GTAO`.
- MSAA selector uses a single choice control: `2x` / `8x`.

## Fixed-atmosphere rule

- Atmosphere controls are intentionally hidden in Lab Scene.
- Weather/time-of-day style controls are not exposed in this tool.
- This keeps visual comparisons reproducible across sessions.
- Atmosphere/sun baseline comes from gameplay-resolved settings.

## Persistence

- Local storage key: `bus_sim.lab_scene.v3`
- Persisted payload:
  - current Lab tuning draft (lighting/shadows/AA/AO/bloom/sun bloom/color grading/sun flare/building window visuals)
  - active camera preset id
- Cancel restores the session baseline; reset returns to factory defaults for the lab.
