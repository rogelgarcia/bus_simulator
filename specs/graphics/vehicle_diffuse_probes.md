# Vehicle materials and spatial diffuse lighting (AI 550)

The Baked Lighting tab exposes independent **Glass reflections**, **Body
reflections**, and **Rim shine** controls, default on. These use the shared global
HDRI on the existing shading model. They preserve the original base color, diffuse
fill, direct lighting, opacity, textures and black trim. Rim shine applies to the
City Bus's named rim material without turning its gray diffuse color into a dark
pure-metal response. No local capture or new environment texture is allocated.

The earlier **Enhanced bus lighting** master now lives in Developer diagnostics,
with separate **Enhanced bus materials** and **Baked bus diffuse probes** preferences.
It remains an optional experiment; the user rejected its broad appearance change.
Leave that master off to retain original shading while using the reflection controls.
All controls participate in Options Save, Cancel, Reset, import and export.
Current mode never fetches or applies probe data; reflections work in either mode.

Saved settings predating `busAppearanceVersion: 2` migrate the old experimental
master to Off without resetting the world bakes or the three reflection preferences.
Saving a new explicit developer opt-in records that version and retains it.
Off removes the selected enhancement and restores the authored material; it does
not remove intrinsic environment reflection from authored PBR materials or from
the developer experiment when that experiment is explicitly enabled.

### Selective reflection contract

`BusReflections` classifies only named glass/window surfaces, City paint, Coach
`bus_body`, Double Decker `dubledecker-body`/`dubledecker-red`, and City `rimmetal`.
Lamps, trim, rubber, mirrors and unidentified materials receive no new response.
On Phong, a Fresnel-weighted, roughness-filtered HDRI specular term is added after
lighting accumulation and before AO. Existing diffuse and direct terms are kept.
On authored Standard/Physical surfaces, the existing indirect specular term is
increased modestly (glass 20%, body/rim 10%), preserving authored roughness and
metalness. The reflection effect uses the existing environment rotation/intensity.
It does not change global IBL settings or the world bake identity.

Bus-only switches prepare and compile detached material candidates in the
background while the applied world bake and bus appearance keep rendering.
Candidates commit at a frame boundary; rapid requests coalesce and superseded
work cannot commit. Preparation failure keeps the previous appearance and reports
a bus-only error. They do not request diffuse probe data when the experiment is
off. Turning all controls off restores exact original material references. The
reflection shader adds no draw calls or scene captures; measurements are whole-frame
GPU timings, not an isolated shader cost.

Preparation includes changed material slots only, including buses represented by
one mesh with a material array. Scene-shadow/CSM and existing dynamic-AO hooks are
installed on the staged materials before compilation. AO preparation retains the
live mesh's receiver ancestry and alpha exclusions without rendering a depth pass.
The engine supplies the main scene pass's render target, so preparation uses the
same tone-mapping/output-color-space shader variant as the actual draw. Renderer
state is restored before yielding. IBL assignment/intensity is applied to those
detached candidates, with no whole-city IBL rescan at commit. The pinned
Three r183 compiler submits one material per browser turn against a snapshot containing
only the world's lights and environment. Submission starts after a short 50 ms
settling delay and yields between objects, so superseded requests can stop before
submitting further shaders. Owned readiness polling is cancellable and has a 15 s
deadline; it replaces the library's unbounded `compileAsync` polling for bus-only
edits. Page closure cancels the coordinator's entire pending bus queue. Context
loss and disposal also abort preparation. Already-submitted driver work cannot be
preempted by JavaScript; a single driver call may still stall on some systems.

Measured comparisons and acceptance evidence: [AI 550 validation](vehicle_diffuse_probes_validation.md).

## Material ownership

`BusMaterialVariants` owns lazy, vehicle-local variants. City Bus Phong paint and
opaque/glazed surfaces become Physical materials, with existing color,
maps, alpha, depth, side, normals and emissive semantics preserved. Paint uses
roughness 0.32 and clearcoat 0.25; glazing uses roughness 0.14. Paint and glazing
are nonmetallic. The revised experimental rim conversion uses metalness 0.25 and
roughness 0.30 to retain gray diffuse response and some shine; mirror surfaces
retain metalness 1 and roughness 0.04. Named black `glossy`/`plastic` trim uses
specular intensity 0.15 to avoid the previous bright gray response.
Rubber uses roughness 0.88. This supports
the PBR environment response, not a new transmission/interior simulation. Lamps,
signals, signs and unnamed emissive rig materials retain their original identities
for their controllers, including lamps whose initial emissive intensity is zero.
An emissive value on a named imported body material does not identify a lamp;
those values are preserved on its enhanced variant.
Coach and Double Decker already use Standard/Physical materials; their authored
properties remain intact. Geometry, pivots, collision, rig and wheel transforms
are unchanged.

The coordinator stages matching static-shadow hooks and validates dynamic caster
semantics before swapping material arrays. It adopts the new receiver bindings
and caster references in the same synchronous frame transaction, retaining the
active world depth texture, moving-shadow target and receiver lightmaps. The
shader hook registry restores custom uniform ownership when cached programs are
revisited, avoiding stale sampler bindings that previously caused missing draws.
Off restores exact
original material references, with current global IBL settings applied. At most eight
variant choices per original material and live vehicle are retained (original or
experimental shading, probes included or excluded, with or without the selected reflection term);
textures are shared, not duplicated. Removing vehicles or
disposing the runtime releases variants.
Cold off with all reflection controls off allocates neither variants nor a probe texture.
Probe and non-probe variants are separate, so adding a probe hook during background
preparation cannot trigger compilation on the material still being drawn.

## Probe field

`tools/bake_lighting/diffuse_probes/` is part of the master bake hierarchy. It
first calibrates diffuse units and packed-image persistence in Blender, exports
the current static city, constructs tiny non-occluding diffuse receivers,
and runs separate Cycles sky and indirect-bounce jobs. The bus is excluded from
both transport and source identity. The publication contains six-axis RGB
irradiance (scene-linear E, not albedo or E/π), validity and an 8×8 octahedral
static visibility-distance map at each point. Four grid regions cover the
supplied camera routes. Grid spacing is 4 m horizontally and 1.5 m vertically.
The default 2,640×70 RGBA32F texture consumes 2,956,800 bytes on CPU and GPU each.

Per surface point, eight trilinear neighbors contribute six-direction ambient-cube
irradiance. Normal-squared weights preserve constant fields and nonnegative energy.
Static distance rejection limits interpolation through walls; invalid probes are
excluded. Incomplete support and region boundaries smoothly blend to live diffuse
lighting. Sampling occurs in the vehicle material shader, with no fullscreen pass.
Visibility rays reach 8 m, beyond the 5.85 m maximum grid-cell diagonal. A bounded
static BVH is built once for the regions plus this reach; it does not replace the
full city used by Cycles for light transport. Generated environment images are
packed into the reusable Blender scene so separate passes retain the same sky.

The field replaces hemisphere/environment **diffuse** fill before material AO.
Direct sun, dynamic sun shadows, specular IBL, emissive light and existing dynamic
AO remain separate. Probe-only mode cannot light legacy Phong materials; diagnostics
report their unsupported count. With no compatible receiver materials, probe-only
preparation fails explicitly before fetching the field. An initial whole-world
transaction uses Current lighting; a bus-only background change retains the
previous bus and world lighting. The field is deliberately low-frequency: it does
not replace wheel contact, high-frequency AO, local reflection probes (AI 551),
or full dynamic GI. Coarse depth maps can conservatively reject valid samples at
thin or alpha-covered geometry; that falls back to live diffuse instead of black.

## Validation and lifecycle

Initial world activation prepares the selected world and bus channels serially,
then activates them at a frame boundary. Initial loading/failure retains Current
lighting. Bus-only edits to an applied bake use the background transaction above
and never suspend the world channels. Switching the world mode, source or profile
still uses the complete validation transaction.
The field requires the exact resolved city source hash and actual sun, hemisphere
and environment profiles. Exposure and tone mapping are live. Changing IBL or
sun/hemisphere lighting revalidates the complete selection; mismatches use Current.
Source watches detect static edits. Off or Current aborts pending probe requests;
generation checks prevent a stale completion from reactivating them. Reload drops
the bounded one-publication cache and validates anew.

Probe hooks stay attached to cached variants with a stable uniform dictionary;
Off disables their contribution and restores original materials. Disposal removes
the hooks. Updating uniform values does not replace their cells, and the registry
rebinds their ownership before drawing a reused shader program.

Payload schema, shape/allocation limits, sample validity and SHA-256 are checked
before texture upload. The offline publisher authenticates both passes, source,
toolchain and unchanged inputs, writes immutable content first, then publishes
the index atomically. New probe regions are authored in tracked defaults and
require a new bake; unsupported cities use the existing live fallback.

## Reproduction

Default camera and shared-bus placements: `tests/fixtures/lighting/ai550_camera_poses.json`.
Original pre-implementation screenshots and settings are retained under
`tests/artifacts/screens/ai550_bus_diffuse_probes/before/`; lifecycle captures use
`after/`, and the final matched route/model comparisons use `comparison-final/`.
The earlier `comparison/` directory contains a rejected material-classification
iteration; only its immutable original-runtime baseline is reused.
Generated captures and machine-readable evidence remain gitignored.
Use `tests/headless/e2e/bus_lighting_550.pwtest.js` through the selected-test runner.
The exact user reflection pose is tracked in
`tests/fixtures/lighting/bus_reflection_toggle_pose.json`. The real-game
`bus_reflection_toggle_lifecycle.pwtest.js` captures repeated and rapid switches,
asserts original references, monitors every sampled frame for world-bake dropout,
and treats GPU sampler warnings as failures. Its screenshots and diagnostics go
under `tests/artifacts/screens/bus_reflection_toggle_lifecycle/`.
`bus_material_preparation.pwtest.js` provides small cancellation, timeout, context
loss and per-turn submission regressions. `bus_lighting_toggle_cost.pwtest.js`
measures a bounded seven-toggle real-game sequence separately from startup;
its timing artifacts use `tests/artifacts/screens/bus_lighting_toggle_cost/`.

For the full route/model comparison, select
`tests/headless/e2e/bus_lighting_comparison_550.pwtest.js` and set
`AI550_CAPTURE_COMPARISONS=1`. It captures the five supplied cameras, all three
bus families, fixed-material probe comparisons, motion, coverage fallback and
lighting compatibility. It records actual GPU timers and full-frame timing;
these are not isolated GPU/CPU lighting-pass timings. Expensive evidence runs
are opt-in; field/variant contracts have separate focused tests.

## Initial publication

The accepted BigCity2 source is
`9f25d16a39920b3980914ece887b2c3852a9699a408e11b6b4b8bba60198f7e8`.
The 256-sample field hash is
`e680ccf7cd91e822c6f665b02489cce1e23f8d0d53cc8dfc6a64663ffc5049e4`.
It contains 2,628 valid probes out of 2,640 and uses the current sun azimuth 45°,
elevation 35°, intensity 7; hemisphere intensity 1.22; and environment intensity
0.28. Exact source profiles, device and Blender signatures accompany the index.

| Region | X extent (m) | Y extent (m) | Z extent (m) | Probes |
|---|---:|---:|---:|---:|
| Civic route | −168 to −64 | 0.7 to 5.2 | 24 to 64 | 1,188 |
| East route | 24 to 64 | 0.7 to 5.2 | 24 to 64 | 484 |
| North route | 56 to 96 | 0.7 to 5.2 | 160 to 200 | 484 |
| Park route | −168 to −128 | 0.7 to 5.2 | 208 to 248 | 484 |

Blender 5.2.1, CPU, four threads: sky integration 49.50 s, bounce integration
40.34 s; complete export, reconstruction, calibration, passes and publication
282.1 s. The reusable scene and authenticated receipts remain under
`tests/artifacts/screens/ai556_bake_framework/run-1788847165547-4300-b1622363/`.
Assets use the existing shared, ignored bake publication directory.

These regions are the initial route coverage, not a whole-city GI volume. The
outer half-cell blends back to live fill, including near the lowest Y layer;
surfaces below 0.7 m use live fill. Tall receivers and vehicles leaving these
regions remain usable, but their uncovered surfaces do not receive spatial GI.
There is one resident field, loaded on demand rather than a streaming atlas.
