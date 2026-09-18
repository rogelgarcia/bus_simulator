# Architectural glass and bounded transmitted sunlight

AI 549 repairs authored Burban, B Glass and Terra & Mar glazing through the
existing window mesh and HDRI paths. It does not require local reflection probes
or new interiors. The material contract is in
[`WINDOWS_MATERIALS_AND_FINISH_SPEC.md`](../windows/WINDOWS_MATERIALS_AND_FINISH_SPEC.md).

## Diagnosis and surface response

The old configurations mixed metalness 0.28–0.72, alpha opacity 0.84–0.90,
partial physical transmission and HDR multipliers 2.8–5. A material therefore
combined tinted metallic reflection, residual diffuse scattering and alpha
reveal. The repair uses a non-scattering thin dielectric with an explicit
effective coating F0 and white grazing reflectance, retaining GGX roughness and
the existing environment sampler. Tint affects the transmitted term.

The generated glass is already a single surface, with no bevel normal map and
front-side rendering. The previous 0.01 m optical thickness was unrelated to
authored shell depth; the new thin-sheet mode uses zero optical thickness.
The curved geometry uses arc-length subdivision and analytic rotated normals.
Numerical tests verify radius and unit normal alignment; no topology change is
needed. There are no added duplicate panes or backface draws. Existing room
walls and slabs become easier to see through lower glazing; empty rooms are
still a limitation for AI 552. The calibrated sky cannot reflect absent city
geometry; detailed street-HDRI captures demonstrate the existing reflection path.

## Bounded offline transport

`node tools/bake.mjs --target lighting/illumination/glass-transmission` runs an
explicit registered leaf. It shares the framework configuration, lock, input
hashing and receipts, remains outside production parent traversal and rejects
publication. No Blender work is required: an analytic solver is used for the
declared planar thin-sheet domain. General city Cycles glass export remains
unsupported and is not certified by this fixture.

The accepted source is a complete `parallel-thin-sheet` version-1 profile:
rectangular parallel panes at fixed Z with linear RGB transmittance and effective
F0; one normalized sun direction above a static horizontal receiver; fixed
receiver bounds/height/identity. Unknown pane or receiver geometry fields and
other transport models fail. Ray/rectangle intersections, Schlick transmission
and multiplicative sheet overlap are evaluated offline with 2x2 deterministic
spatial integration. There is no ray concentration from these parallel thin
surfaces. Thick prisms, curved lenses, multiple scattering, spectral dispersion
and caustics remain unsupported. The daylight demonstration contains clear,
amber and blue architectural panels on a porch receiver beside Burban; it is
an explicit showcase fixture, not automatic city-wide glazing transport.

The 128² RGB output stores dimensionless linear direct transmittance, a light-only
coefficient. It includes no receiver albedo, exposure, tone map, AO, environment
light or view-dependent reflection. Runtime sampling multiplies the receiver's
existing directional direct diffuse and direct specular once, after normal PBR
and shadow evaluation. Therefore the receiver's real color/roughness remain live,
moving opaque shadows still occlude the same sun, and indirect GI/AO/environment
terms remain independently owned. A mapped direct-receiver bake, clearcoat, or
non-directional local lights is rejected by this bounded adapter.

Only the represented pane casters are disabled while the map is active. Frames
and other opaque objects keep ordinary shadow casting. When disabled, corrupt
or incompatible, the adapter restores ordinary pane shadow casting and disables
the multiplier; it never adds colored energy behind an opaque glass mask.
Corrupt payloads throw before texture allocation. Changed profiles report
`stale-profile-opaque-shadow-fallback`. Camera, receiver albedo and exposure do
not invalidate a transmittance coefficient. Sun direction, pane geometry/tint/F0
and receiver geometry do. The owner must call `update(currentProfile)` before
rendering; the showcase owner reads the live geometry, color and sun each frame.
Profile numbers are quantized at 1e-8 to ignore arithmetic roundoff, not authored
movement. Radiance scaling stays live because the stored quantity is a coefficient.

The adapter allocates one 128² RGBA32F map (256 KiB), adds one lookup on the
bounded receiver and adds no scene render. No production assets or default
lighting settings are changed. Existing production bake validation/publication
gates remain intact.

## Evidence workflow

The standard `building_showcase` scenario now clears a stale inherited HDR URL
when a different catalog HDRI is requested. AI 549 capture also waits for shader
preparation and decoded textures, checks actual render counts, and compares the
before/after camera, actual HDR URL, exposure, lighting and post settings.

Select `tests/headless/visual/specs/ai549_glass_capture.pwtest.js` with the standard
runner. `GLASS_PHASE=before` requires an explicit `GLASS_BASELINE_REF` and replays
the five historical material/config modules through browser routing. `after`
uses current source. `GLASS_ENV=daylight` is calibrated ordinary daytime;
`street` is a separately labeled detailed HDRI diagnostic with fixed legacy
presentation settings. `GLASS_BUILDING` optionally selects one of the three.

All source reference copies, matched 1920×1080 images, Burban upper/lower angle
sweeps, raw metrics and the comparison gallery remain gitignored under
`tests/artifacts/screens/buildings/<id>/`. No new building has been modeled.
The bounded transport capture separates glass-only, contribution-only, combined
and stale output. The actual-game control is in
`tests/headless/perf/specs/ai549_glass_gameplay.pwtest.js`; it also requires an
explicit historical ref. The default BigCity2 scene has none of these three
catalog models, so its measurements are a compatibility control, not a glass
speedup demonstration. Facade workloads are measured separately. See the
[validation report](architectural_glass_validation.md) for measured costs,
preserved evidence links and test outcomes.
