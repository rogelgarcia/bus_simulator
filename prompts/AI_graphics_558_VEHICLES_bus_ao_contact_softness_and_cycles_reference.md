# Problem

The current Dynamic Only / Underbody AO looks too rectangular and harsh beneath the bus when it is close to the raised spawn platform. The rear contact also appears to stop too early. The desired change is a small, physically supported refinement: smoother contact transitions and correct rear coverage, while retaining the accepted ground/wall behavior, indirect lighting and runtime cost advantages.

The user supplied `codex-clipboard-a0f6a9d9-d2ac-4467-8ab1-0769312fb688.png` showing the affected platform. The visible settings are Dynamic Only, Underbody, intensity 0.98, radius 1.18 m, Medium quality and Alpha Exclude. Treat the annotations as reported symptoms, not proof that every marked dark edge comes from AO.

# Request

Reproduce the platform case, establish a matched Blender Cycles reference, and make the smallest deterministic correction supported by the comparison. Use the reference to distinguish approximation errors from actual geometry and lighting; do not simply blur or extend a dark rectangle until it resembles the screenshot.

Tasks:

- [ ] Capture the current platform case with fixed bus/camera transforms and the reported settings. Separate AO Off, Underbody, generic GTAO, dynamic AO factor and direct-sun visibility so the premature rear termination and hard boundary can be attributed to the correct contribution. Preserve the user's reference image under the prompt's gitignored evidence directory if available; do not alter the original.
- [ ] Inspect the actual bus underside, rear overhang, wheels, opaque body bounds and model-to-world transforms against the analytic occluder. Measure clearance to the receiving platform rather than assuming the road height. Check platform top, bevel/side normals, receiver continuity and underbody extent before changing geometry. Include a wireframe/occluder overlay showing the rear bounds and receiver heights. Change the bus or platform model only if this audit demonstrates a geometry defect.
- [ ] Create reproducible Cycles reference scenes using the installed bus and matching platform/ground/wall geometry, scale, poses and relevant lighting/material inputs. Include nearby occluders and bounce contributors; document any export or transport approximation. Compare the true bus mesh and the analytic proxy separately to distinguish integration errors from proxy-shape errors. Do not present a proxy-only reference as validation of the real bus.
- [ ] Produce two complementary references: a controlled, cosine-weighted ambient-visibility experiment with a documented distance/falloff convention, and a path-traced diffuse-lighting reference for the actual contact appearance. Match the runtime finite-range convention for the visibility comparison, or explicitly report the mismatch. Use uniform ambient illumination to isolate contact and a representative environment/sun setup for the composed result. AO is an approximation to visibility, not a complete multiple-bounce lighting solution.
- [ ] Separate environment/ambient contributions, bounced diffuse light and direct sunlight in the comparison. Do not assume Blender's Diffuse Indirect pass alone contains the environment contribution: the directly sampled world illumination can appear in Diffuse Direct. Use explicit source isolation or suitable passes for the installed Blender version. Compare linear values before display transforms, and use consistent exposure/tone mapping for presentation images.
- [ ] Include matched receiver measurements with and without the bus while keeping the static scene fixed, so existing static occlusion is not mistaken for the additional dynamic term. Any ratio must mask near-zero baselines and distinguish visibility from physical radiance changes, which can include added bounce. A diagnostic view may hide the bus from camera rays while preserving its occlusion; clearly label that view.
- [ ] Cover the reported raised-platform/rear view, ordinary asphalt, several valid ground clearances, platform/bevel transitions, and distant/near wall gaps. Include bus translation and rotation. Closing gaps should continuously strengthen contact and allow adjacent dark regions to meet; raising the bus should weaken and soften contact. Retain physically plausible narrow outward falloff instead of imposing an absolute silhouette cutoff or manually drawing a bridge to a wall.
- [ ] Refine the runtime AO so the artificial rectangular boundary becomes smoother and rear coverage follows the actual occluding geometry and receiver clearance. Preserve strong true contact at very small gaps; use the reference to judge how much softness or rear extension is warranted. Avoid broad halos, edge bleeding across unrelated surfaces, platform-specific patches, excessive rear padding, or altered sun-shadow sharpness as a substitute for fixing AO.
- [ ] Preserve the accepted composition: supplemental AO affects indirect illumination, direct sunlight and emission remain unchanged, and static baked occlusion is not applied twice. Keep Underbody/GTAO/Off round trips reliable and retain the AI 535 baked-lighting state and enhanced indirect path. Do not reintroduce retired baked-direct controls or the older sunlight-dependent AO fade.
- [ ] Run the reference generation through the existing bake hierarchy as an explicitly selected validation/reference target, reusing `tools/baking/blender.local.json` and inherited sample/device/time controls where supported. Register any new reference leaf in its domain under `tools/`, document it, and keep it out of the default production bake tree. Preserve first-run configuration discovery and existing publication gates. This is an offline reference for a moving bus, not a static bus shadow/AO baked into the city.
- [ ] Demonstrate reference convergence with recorded sample counts, seed, bounce limits, device, Blender version, denoising policy and elapsed time. Retain an undenoised sufficiently converged reference so denoising cannot manufacture softness or erase the rear edge. Compare a higher-sample run or independent seed on the key contact regions; report residual uncertainty rather than treating a fixed render duration as proof of correctness.
- [ ] Update the current AO spec and validation notes with the measured cause, resulting behavior, reference assumptions and remaining approximation limits. Keep the previous successful physical-contact work and its historical measurements clearly distinguished from this refinement.

## Validation and deliverables

- [ ] Provide aligned runtime-before, runtime-after and Cycles reference images for the platform rear, asphalt contact and near-wall contact, plus factor/geometry views that explain the correction. Save screenshots, EXR/pass data, reference scenes, manifests and raw metrics under `tests/artifacts/screens/illumination_558/`; keep generated evidence gitignored.
- [ ] Measure rear and side contact profiles in receiver/world coordinates and report coverage, transition smoothness and reference error. Exercise small changes in clearance and pose to catch discontinuities; do not validate only one hand-picked camera pixel or one subjective image.
- [ ] Benchmark AO Off, Underbody before/after and generic GTAO under matching conditions. Include frame time and equivalent FPS, AO/full-frame GPU time where available, CPU submission time, draw calls and target memory, with hardware, resolution, graphics settings, camera/workload, warm-up, sample count and statistics. Label equivalent FPS and unavailable metrics accurately. Keep this minor visual refinement within the existing runtime cost envelope; investigate any measurable regression.
- [ ] Verify repeated method switches, moving bus/stationary camera, baked indirect active/inactive, source compatibility, no shader errors and no unintended bake reloads. Summarize any geometry changes explicitly, or state that the existing model was sufficient.

## References and boundaries

- Current physical-contact contract: `specs/graphics/ambient_occlusion.md` and `specs/graphics/illumination_534_ao.md`.
- Existing lab history and capture workflows: `specs/graphics/dynamic_ao_bus_lab.md`. Its original floor-only algorithm is historical; use the current hemisphere-clipped closed-bus-volume implementation as the starting point.
- Runtime modes: `specs/graphics/illumination_runtime_modes.md`.
- Bake entry point and registration: `tools/baking/README.md` and `specs/tools/bake_framework.md`.
- Blender reference: [Cycles render passes](https://docs.blender.org/manual/en/latest/render/layers/passes.html); check the installed version's semantics when implementing.
- Follow the repository's Blender occupancy/isolation rules. A converged Cycles scene is a reference for its specified geometry, materials and illumination, not an unconditional physical ground truth for mismatched scene inputs.
- Keep this scoped to bus contact refinement and its validation. A full city rebake, production runtime ray tracing, precomputed textures for every bus pose, and unrelated IBL/UI work are not required.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_graphics_558_VEHICLES_bus_ao_contact_softness_and_cycles_reference_DONE.md`.
- Add a high-level one-line summary per completed change, the aligned image links, measured reference agreement and the same-condition before/after performance table with benchmark conditions.
- Do not move it to `prompts/archive/` automatically; archive only when explicitly requested.
