# Grass Debug v2

## Scope

Grass Debug v2 is the new isolated scene for developing 3D grass. This first pass
provides infrastructure only: a dirt surface, asphalt road, game trees and city bus,
camera navigation and performance diagnostics. It does not instantiate the v1
grass system, implement grass, or integrate grass into gameplay. There are no
setup, material, quality or lighting configuration panels or saved scene settings.

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
- Dirt uses the game's brown `pbr.gravelly_sand` asset definition: colour, normal and
  packed AO/roughness/metalness maps, a four-metre repeat and up to 8× anisotropy.
  The plane renders both faces with the same textures and correctly flipped
  back-face normals, so views from below do not see through the ground.
- One two-way road runs through the field using `createRoadEngineRoads`, game road
  materials, asphalt defaults, lane markings, curbs and sidewalks.
- One full city bus uses `createBus` and the game bus catalog. It is grounded on the
  asphalt after the model finishes loading. Twelve fixed trees use the desktop
  game templates at varied positions, headings and heights.
- The renderer uses native CSS resolution (pixel ratio 1), MSAA and a cached
  static shadow map. Sun direction, linear color, intensity, display exposure,
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
  Bus camera, Overview and Copy buttons.
  Copy writes the current camera pose to the clipboard as space-separated
  `X Y Z yaw pitch roll`, with angles in degrees using YXZ and values rounded to
  three decimal places. The button briefly confirms success or reports failure.
  The scene viewport uses the remaining width. The panel scrolls independently
  and provides space for future control sections, with no screen title, terrain
  summary or camera movement help.
- The shared top performance bar shows frame time/FPS, GPU time when supported,
  calls, triangles, memory and renderer identity. Its second row shows frame index
  and camera/bus world position and rotation.
- Required asset failures remain visible as a startup error; readiness waits for
  models and textures. `window.__grassDebugV2` exposes `readiness`, `getSnapshot()`
  and `setCamera('bus' | 'overview')` for subsequent measurement work.

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
