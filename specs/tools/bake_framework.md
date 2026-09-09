# Offline bake framework

The canonical entry point is `node tools/bake.mjs`. User setup, complete supported
inventory, commands and recovery are documented in
[`tools/baking/README.md`](../../tools/baking/README.md).

## Ownership

`tools/baking` owns configuration, option resolution, graph validation, process
lifecycle, checkpoints, logs and publication primitives. It does not own lighting
or material algorithms. `tools/bake_lighting`, `tools/bake_visibility` and
`tools/bake_materials` own their definitions and adapters. The root master delegates
to declared children. Domain parents delegate recursively and may consolidate
their already validated children. No child process should launch a second master.

A definition declares a unique `id`, description, dependencies/children, output
claims, supported option parsers and tracked defaults, plus `inputs`, `run` and
optional `validate` functions. `run` returns `state`, `files` and domain metadata.
Only `baked`, `validated` and `published` are completion states. Output claims must
not conflict and the graph must have no cycles or missing jobs. Register a new
domain in `tools/baking/registry.mjs`; do not add domain conditions to the planner.
Every public entry uses `runBakeCli`, including standalone leaves.

Explicit browser-only diagnostic plans may declare `configurationPaths` on every
selected job. The shared loader then requires and checks only that union of machine
paths. Jobs without this declaration retain the existing Blender configuration
requirements. AI 560's `lighting/experiments/configurations` branch uses this for
preparation and G00 game baseline capture; it is excluded from production defaults
and rejects publication. Its tracked poses, immutable run artifacts, readiness,
identity checks and measured timing are documented in the
[lighting experiment README](../../tools/bake_lighting/experiments/lighting_configurations/README.md).
The master runs preparation, G00 capture, export, pilot rendering, postprocessing,
analysis, 4K G00 capture, final rendering and reporting. It reports
`experiment_complete` only with the 30 pilot/15 final/10 game image inventory.
Each exporter/renderer/processor/analyzer/reporter also has a standalone entry.
The image stages require `pythonExecutable` with NumPy/OpenImageIO/OCIO; device
selection uses `renderDevice` in the same machine configuration.

AI 563 registers `lighting/experiments/sun-sky-ratios` and its `/review` leaf.
The main job authenticates an explicit existing AI 560 scene/source, reuses its
cameras and geometry, and renders relative sun/sky multipliers through the same
Cycles backend. It derives one card-based exposure per configuration, shared by
all poses and the ACESFilmic/AgX transforms. A uniform radiance control verifies
exposure invariance. `/review` authenticates saved images and only starts Python
and a report browser. Both reject publication and are outside production defaults.
Tracked recipes/scripts are documented in the
[ratio experiment README](../../tools/bake_lighting/experiments/sun_sky_ratios/README.md);
all generated evidence stays under `tests/artifacts/screens/ai563_sun_sky_ratios/`.
The ratio review supports selecting exact saved images across configurations,
poses and tone/exposure choices, a paged 2×2 grid, and a single-image carousel
with a bottom configuration menu and thumbnails. Optional artifact-local visual
references are hash-checked, labeled uncalibrated and excluded from measurements.

Jobs may declare `codePaths` to scope implementation checkpoints and input-stability
checks to their algorithm and adapters. Shared `tools/baking` code is always included.
Jobs without a scope retain the original complete framework/domain code inventory.
Each domain must include the relevant imported algorithms in its own artifact key;
scoping must not permit changed image/scene inputs to pass authenticated reuse.

## Provenance and lifecycle

The shared source export waits for complete current runtime assets and validates
independent deterministic exports. It executes once per invocation. Later jobs
must declare all algorithm and non-source inputs affecting their result. Checkpoints
authenticate input/code/toolchain/settings/dependency identities and every output
file. They may be reused only after revalidation. Rebuilds and failures use isolated
stages. Existing live publications survive a failed run. New compiler hashes never
retag historical radiance as freshly baked. The runtime ABI, complete receiver
coverage, material transport policies and channel authentication remain unchanged.

Blender runs headlessly from the exact configured installation with isolated user,
temporary and cache directories. The framework never downloads Blender or attaches
to an interactive session. Backend version/hash restrictions remain authoritative.
Only owned child process trees may be cancelled. The outer hard timeout is shared
by the whole requested run. No inferred sample-to-time conversion is a guarantee.

## Lighting contract

Enhanced illumination separates sky irradiance/occlusion (`sky`) from indirect
bounce (`bounce`). Every pass emits NPY pages and a receipt authenticating its
prepared job and every page. A missing or changed page prevents consolidation.
Pass receipts also bind the atlas, chart data and sample settings, including the
legacy scalar job format where the original job identity did not bind the profile.
Occlusion is therefore independently inspectable and has an explicit consumer,
the receiver irradiance assembler. Both passes reconstruct the same complete
contributing scene; runtime-only receivers may still contribute to transport.

The default production tree authenticates the installed historical comparison;
it does not regenerate a partial original preview. Explicit legacy targets retain
the complete-coverage guard and cannot represent the current city within their
original four-page/scalar policy. This limitation must remain visible in the
inventory rather than weakening coverage or silently omitting receivers.

The enhanced direct channel references the certified shared sun visibility rather
than baking another atlas. The original preview retains a separately callable
direct Cycles pass, plus its separate sky and bounce passes. Consolidation reuses
the existing receiver padding, RGB9E5 encoding, coverage checks and authenticated
package writer. It must not change the renderer, HDRI policy, AO settings or UI
switches as a side effect of build organization.

Runtime static vertex AO, SSAO/GTAO and contact shadows are not offline jobs.
Material-map AO remains part of its owning material recipe. Neither is a substitute
for the independently baked sky occlusion pass.

## Publication

The explicit `lighting/illumination/reprocess` maintenance leaf reuses completed,
authenticated enhanced sky/bounce passes for changes limited to filtering and
encoding. It requires the original publication and UV layout, validates a fresh
city export against the original source, and retains profile/toolchain/raw-pass
identity checks. It does not run Cycles or participate in the default full tree.
Fresh bakes and maintenance reprocessing share the same packager and publication
gate; neither overwrites the original raw samples.

When independent sky and bounce passes completed but packaging failed, the same
maintenance leaf accepts their original `.partial` staging directory instead of
a publication. Both pass receipts and every raw page must authenticate against
the same job, atlas and Blender build. Consolidation is rebuilt in a fresh stage;
the current compiler then checks source, layout and profile identity before
packaging. Incomplete passes cannot use this recovery path. The standard receiver
publication gates still apply.

The default invocation produces validated candidates. Explicit `--publish` applies
only where the existing domain release policy allows it. Receiver indexes switch
last after channel authentication. Visibility publishes only after zero-miss native
validation. Procedural material directories retain a rollback version. Shadow
candidate URLs live in a distinct asset namespace because the AI531 package
contract requires repository-relative asset paths; its strict release certification
is not bypassed. Grass V2 retains its existing asset-review boundary.
The shadow branch uses authenticated Blender candidate lattices, maintained
source-derived direct Depth24 native capture, provisional depth composition,
native foliage parity evidence, then production packing. Every phase is a separate
job with authenticated prerequisites. Alternative texture-gradient reconstruction
and promotion stay in the research tools. A full release still requires its
existing certification; the native cutout proof alone does not grant release.

## Planned physical calibration experiments

The planned AI 564-567 calibration suite is specified in
`specs/graphics/lighting_calibration.md`. Its independent fixture, daylight,
material, capture/render, analysis and orchestration stages must register in this
hierarchy as explicit experiments, reuse the shared Blender configuration and
preserve all publication gates. They are not yet implemented and must not enter
the default production bake tree. AI 562 owns application of their validated
results to the actual game and production bake pipeline.

## Verification

AI 550 adds `lighting/diffuse-probes` to the lighting domain. It depends on the
same authenticated static-city source and owns separate prepare, sky and bounce
jobs. The parent validates the two irradiance passes and visibility data before
atomic publication. Layout and quality are tracked in its `defaults.json`; all
entrypoints reuse the shared ignored Blender configuration. See
`specs/graphics/vehicle_diffuse_probes.md` for the consumer contract.

`tests/node/unit/bake_framework.test.js` covers bootstrap, option inheritance,
graph errors, hashes/reuse, child failure, cancellation and terminal behavior.
Use the standard selected-test runner. Integration evidence and production run
summaries belong in `tests/artifacts/screens/ai556_bake_framework/`, never in source
or tracked screenshot folders. See the framework README for the existing-domain
regression tests and release limitations.
