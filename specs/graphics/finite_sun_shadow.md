# Finite directional sun shadows

`src/graphics/lighting/FiniteSunShadow.js` is an opt-in runtime material adapter. The physical calibration harness uses it for finite-source fixtures. Existing gameplay PCF, CSM and baked shadow packages retain their current contracts; this result does not automatically enable contact hardening in the city.

## Model and ownership

The adapter implements the blocker-search / penumbra-estimation / filtering approach described in [NVIDIA's PCSS paper](https://download.nvidia.com/developer/SDK/Individual_Samples/MEDIA/docPix/docs/PCSS.pdf). For an orthographic directional source, the world-space filter radius is `receiver-to-blocker distance along the light axis * tan(angular diameter / 2)`. Dividing by the orthographic frustum spans converts this radius to texture coordinates. This uses no perspective light-distance ratio.

Receiver-plane depth derivatives correct both the blocker search and final comparisons, including oblique receivers. A half-texel slope allowance suppresses quantized self intersections. The usual light depth bias and shadow intensity remain applicable. Native `shadow.radius` does not determine the physical penumbra. Zero angular diameter uses a hard depth comparison.

Thirty-two deterministic disc samples find the average blocker separation; 64 disc samples estimate visibility. The near plane provides a conservative search bound. There are no additional shadow passes, CPU depth readbacks, temporal history buffers, random frame seeds or bake jobs. Geometry, skinning and alpha handling remain in Three's native shadow depth renderer. The shader assets and material variant identity are registered through the shared shader loader/hook registry; global Three chunks are not modified.

This is a sampled PCSS approximation, not general finite-source ray tracing. Thin blockers can be missed, multiple depths are reduced to an average, receiver derivatives are unreliable at discontinuities, and finite-angle changes in BRDF evaluation are not integrated. Very large angles and detailed glossy response need separate validation. Shadow frustum coverage must include the penumbra and relevant blockers. The supported angle is 0–0.2 radians; 0.12 in the original fixture is a deliberately large diagnostic emitter, not a recommended daylight setting.

## Runtime API

The unmipped native depth texture is sampled with explicit LOD zero, including
within blocker/filter loops. This preserves its sampling/filtering while avoiding
implicit derivatives under divergent control flow on ANGLE/D3D11.

The caller owns its renderer configuration and light. Explicitly select `THREE.BasicShadowMap`, whose native depth texture is readable without a comparison sampler. Create `new FiniteSunShadow({renderer, scene, light, angularDiameter})`, `attach(material)` to receiving native Lambert/Phong/Standard/Physical materials, and call `update()` before rendering after changes to the angle, shadow frustum, zoom or map size. `setAngularDiameter(radians)` updates a uniform through `update()`, without changing the shader variant.

`update()` validates one visible shadow-casting directional light, a forward-depth orthographic camera, and supported map dimensions. It resizes an existing native map when `mapSize` changes; Three otherwise changes the viewport without resizing its existing target. `detach(material)` restores other registered hooks, and `dispose()` removes only this adapter's hooks. Repeated attachment is idempotent; a second owner is rejected. The caller restores the renderer's previous shadow type when leaving this mode. The calibration scenario does so on disposal.

CSM, reversed depth, native PCF comparison samplers, VSM and other baked visibility adapters are outside this adapter's integration contract. Unsupported light/sampler modes fail explicitly. Applying it to the production city belongs to AI 562 and requires compatible baked-depth filtering, material-hook composition, cascade handling and a city GPU budget. Passing these isolated checks does not establish that rollout.

## Evidence

The [executed results](physical_calibration_results.md#finite-sun-fix--2026-09-09) preserve the original failed capture and the corrected run. No tolerance, analytical equation or reference exposure was changed. Additional 0.00925, 0.06 and 0.18-radian fixtures cover other gap/angle combinations.

`tests/headless/e2e/finite_sun_shadow.pwtest.js` checks gap/angle-dependent widths, resolution/frustum/zoom invariance, hard-shadow fallback, four lit material families, shadows off, repeated toggles, unchanged companion hooks and invalid ownership/mode rejection. It records 24-frame GPU timestamp samples per filter at 1280×720 with a 2048² shadow map and native shadow updates each frame. The result is an isolated two-plane workload, not a city performance forecast. GPU-query unavailability/disjoint samples remain explicit; no synchronous readback is used in the timing loop.
