# Shared Dynamic Sun-Shadow Layer

## Status and scope

This is the AI 532 authority for directional shadows involving moving objects
while the optional static-sun cache is active. The bus is the first gameplay
client, not a special case. Any `Object3D` can register a stable ID and declare
whether it casts, receives, or does both.

All registered casters use one shared depth field. Consequently the same
nearest-depth comparison provides self-shadowing, mover-to-world shadows, and
mover A-to-mover B shadows in either direction. Splitting each mover into an
independent map would lose cross-mover occlusion and is not an allowed v1
implementation.

The layer is optional and development-only with the current static-cache
pipeline. Normal startup and gameplay remain on the existing live Three.js
shadow engine. No baked package or Blender installation is required at runtime.

## Registration and lifecycle

`GameEngine.registerDynamicIlluminationObject({ id, root, cast, receive })` is
the generic application boundary. Registrations survive a pipeline install and
are rebound in stable ID order. Gameplay registers its vehicle anchor through
that boundary; future traffic, pedestrians, or other moving roots use the same
API and do not require a shader or cache-format variant.

The optional pipeline performs one atomic ownership change:

1. include the city and every registered receiver root in the audited static
   visibility material set;
2. clone eligible registered caster meshes into an isolated depth-only scene;
3. disable their submission to the current sun map while the hybrid path owns
   them;
4. render the shared dynamic field immediately before the visible render from
   the current `matrixWorld` render pose;
5. restore every original `castShadow` flag and dispose dynamic GPU resources
   on current mode, fallback, replacement, or disposal.

Registration changes while active deliberately return to current mode. Mesh,
geometry, material, custom-depth, or caster-ownership drift does the same.
Activation never leaves a mixed partially owned frame.

## Projection and interaction capacity

The deterministic fitter unions the world bounds of every visible registered
caster and the endpoint of each bound corner's ray on
`receiverMinimumY`. Including these low-sun tails prevents clipped road and
world shadows. A stable light basis is derived from the named static-cache sun,
and the projection center is snapped to the configured world-space texel grid.

The v1 defaults are:

| Setting | Value |
|---|---:|
| Map | 2048 x 2048 RGBA8 color plus depth |
| Density | 0.025 m/texel |
| Full span | 51.2 m |
| Guard | 8 texels (0.2 m) on each side |
| Usable span | 50.8 m |
| Depth padding | 2 m |
| Estimated allocation | 33,554,432 B (32 MiB) |

The fixed density makes stability and cost predictable. If the union of two or
more interacting movers and their tails exceeds the usable span, fitting fails
closed and the static pipeline restores the complete current shadow path. V1
does not silently omit a distant mover or reduce resolution. A later scheduler
may introduce explicit interaction groups, but it must preserve cross-object
occlusion within each group and define overlaps before changing this policy.

## Caster and receiver semantics

Opaque parts cast. Alpha-tested parts copy their map, alpha map, threshold,
side/shadow-side, displacement, and clipping inputs into a packed-depth
material. Blended transparent or transmissive parts do not cast by default,
which prevents windows and lamp lenses from becoming opaque silhouettes.
They can still receive when their stock lit material is compatible with the
shared shader hook. A registered mesh may opt into an audited
`MeshDepthMaterial`; other custom-depth material types fail closed.

V1 supports ordinary, instanced, and skinned meshes. `BatchedMesh` is rejected.
Material arrays preserve group indices. A material or mesh inventory mutation
after activation is treated as ownership drift and falls back to current rather
than guessing new semantics during a frame.

## Shader composition

The moving receiver's pre-bias world position samples the immutable
`static_sun_depth` tiles. The separate dynamic projection samples packed RGBA8
depth with a 3 x 3 PCF kernel. Both values attenuate only the matched named
directional sun inside Three r183's direct-light loop:

```text
Vsun = Vcurrent * VstaticSun * VdynamicSun
```

This reaches direct diffuse, specular, clearcoat, and supported direct
transmission without multiplying albedo, IBL, ambient light, emissive output,
or final color. The static cache contains no moving caster, and the dynamic
target contains no static city geometry.

Debug modes expose dynamic visibility, packed depth, projection membership,
bias, composed visibility, and current-versus-hybrid absolute difference in
addition to the AI 531 static-cache views. Runtime diagnostics report stable
registration IDs, fitted caster IDs, density, allocation estimate, render
count, caster/receiver count, draw calls, and triangles.

## Validation and current limits

Deterministic Node tests cover registry-order independence, texel snapping,
two-object fitting, low-sun tail capacity, invalid input, and equal endpoint
state at 15 Hz and 120 Hz for 8-degree and 45-degree sun elevations. Browser
tests cover one shared target for two moving roots, A-to-B per-fragment
occlusion, current-caster restoration, and a moving receiver sampling different
positions in a fixed world cache. The integrated pipeline test covers atomic
activation, current/comparison switching, and fallback restoration.

Debug captures are generated under
`tests/artifacts/screens/illumination_532/`; they are human-verification
artifacts and never runtime or corrective inputs.

The authoritative visual pair uses the real `game_mode` Big City 2 civic-center
pose, the normal gameplay visibility system, the player City Bus, a second
Coach created through `BusFactory`, and the full AI 531 production package.
The Coach is inserted into the actual gameplay scene and both vehicles are
registered through `GameEngine`; no separate lab scene or substitute geometry
is used for that before/current and after/hybrid comparison.

The real-game receiver proof also selects a genuine Big City 2 tree and places
the tree, Coach, and player bus along the production sun ray. Static-visibility
debug output shows the cached foliage occlusion on the bus receivers. A
dynamic-visibility A/B pair moves only the Coach 16 m laterally: 3,394 of
16,875 pixels (20.11%) in the player-bus side region change by more than 16/255,
while a player-front control region changes by zero pixels. The final-color
set includes a second angle with the buses behind the tree. These remain
human-verification captures from `game_mode`, not inputs to runtime correction.

Production whole-frame, CPU/GPU shadow timing, load, and variance metrics are
not measured for AI 532 because other processes share the machine and GPU. The
browser fixtures prove behavior, not production performance. AI 536 retains the
promotion gate; until controlled same-condition measurements pass, the hybrid
pipeline remains disabled by default.
