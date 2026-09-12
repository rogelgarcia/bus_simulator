# Offline bake framework

The explicit `lighting/shadows/streamed/five-pose-review` diagnostic reuses the
five authored AI560 camera poses and their shared bus placement. It holds current
calibrated lighting and indirect illumination fixed while comparing Single/High,
parent-only baked shadows and fine baked shadows. Two fresh sequential browsers
and balanced repeated passes produce immutable game captures, per-frame CPU/GPU
records, p1/p99 thresholds, draw counters and logical shadow-allocation estimates.
GPU query results must be associated with their original submission rather than
repeated as a last-known sample. Generated data and images stay under
`tests/artifacts/screens/`; this diagnostic cannot publish assets or change defaults.

AI 547 adds explicit `lighting/shadows/streamed/prototype` and `/review` leaves.
They share the configured browser, keep artifacts under
`tests/artifacts/screens/illumination_547/`, and cannot publish. The prototype
authenticates the installed complete parent and independently resolves current
static source identity before capturing actual three-times-density native depth.
See `tools/bake_lighting/shadows/streamed/README.md` for parameters and remaining
full-city/performance acceptance gates.

Calibrated static sun bakes default to the versioned864m/16384 source lattice
(5.2734375cm/texel),2040-square tile interiors and four guard texels per edge.
The historical680m lattice remains unchanged. Shadow-only candidates can be
tested and installed with an existing validated receiver run through the
reference-matching `shadow-run` option; all source, coverage, native parity,
memory, actual-game capture and installation checks remain enforced.

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

## Physical calibration experiments

The AI 564-567 calibration suite is specified in
`specs/graphics/lighting_calibration.md`. AI 564 registers
`lighting/experiments/physical-calibration` with independently callable
`references`, `prepare`, `capture`, `render` and `analyze` stages. It uses the shared
configuration, reusable isolated Blender scenes, actual native renderer captures,
authenticated raw data and predefined analytical/display checks. The shared
`runBlenderStage` supports isolated headed execution; existing `runHeadlessBake`
callers retain their behavior. Calibration never publishes or enters production
defaults. Its framework `validated` state authenticates evidence, not a universal
physical pass; consumers must inspect `report/contract.json` and individual results.
AI 565 registers `lighting/experiments/daylight-calibration`.
`lighting/experiments/daylight-calibration/afternoon` additionally authenticates an
AI567 finalist and compares higher solar elevations using a copied scene, physical
receiver checks and ten new city renders. Its output is experiment-only and never
publishes or replaces a prior calibration. See the daylight tool README.

The original AI565 branch provides standalone
`prepare`, `render`, `capture`, `fixtures` and `analyze` leaves. Preparation
authenticates the reusable city and passing AI 564 prerequisite; solar/receiver
preflight precedes city rendering. Versioned fixture revisions preserve city
transport only while atmospheric inputs remain unchanged. The report separates
model checks, native approximations and legacy artistic controls. See
`specs/graphics/daylight_calibration.md` and its executed results for scope.

AI 566 registers `lighting/experiments/material-calibration` and standalone
`audit`, `prepare`, `capture`, `render`, `analyze` leaves. They authenticate the
passing AI 565 daylight source and use the shared Blender configuration. Material
profiles, original runtime inputs, export adapters and scene identities are frozen
before rendering. All outputs remain under the ignored AI 566 screen-artifact
directory. Routine `all`/production lighting jobs exclude this experiment and it
does not publish material assets or bakes. See `specs/graphics/material_calibration.md`.
AI 567 registers `lighting/experiments/automated-calibration` and independent
`validate`, `baseline`, `prepare`, `calibrate`, `search`, `render`, `analyze`, `review`
stages. It reruns independent reference checks, captures fresh installed-bake game
baselines, searches authenticated unchanged transport, verifies finalists with new
full renders and emits an experiment-only AI562 handoff. See
`specs/graphics/automated_lighting_calibration.md`.
AI 562 owns application of validated results to the game
and production bake pipeline. See the calibration tool READMEs for reference
eligibility, CIE subset, numeric scale and renderer limitations.

AI562 registers `lighting/experiments/reference-matching`, with independent
`baseline`, `sky`, `capture`, `reference`, `native-validation`, `diagnostics` and
`review` leaves. Captures assert the actual effective Current/Baked mode and the
55° profile. Original source/assets can be replayed through streamed local URLs;
validated candidate indexes can be routed in an isolated browser without changing
installed indexes. Receiver publication and native package validation remain
mandatory. Updated reference scenes use the versioned window/Phong translation
policy and preserve previous Cycles targets. The controller resumes complete
stages only when source, settings and recipe identity match. See
`tools/bake_lighting/experiments/reference_matching/README.md`.

## Verification

`lighting/experiments/reference-matching/pose-comparison` accepts a single exact
paused gameplay pose, a new artifact output directory and an authenticated
afternoon source. It reuses baseline readiness/pose checks and the scene export
projection check, with camera and bus counts matched to the supplied pose set.
The canonical five-view resolver and publication gates remain mandatory for
production. This leaf never publishes and emits two images without a gallery.

AI562 also registers `lighting/experiments/reference-matching/transport-reference`
and `transport-textures`. They isolate the primary diffuse transport model and
test raw texture values through native Cycles, respectively. Both require new
artifact directories, use the shared Blender configuration, never publish, and
remain outside no-argument production baking. Scene reconstruction uses a short
workspace staging path for encoded texture loading on Windows.

AI 550 adds `lighting/diffuse-probes` to the lighting domain. It depends on the
same authenticated static-city source and owns separate prepare, sky and bounce
jobs. The parent validates the two irradiance passes and visibility data before
atomic publication. Layout and quality are tracked in its `defaults.json`; all
entrypoints reuse the shared ignored Blender configuration. See
`specs/graphics/vehicle_diffuse_probes.md` for the consumer contract.

Enhanced surface preparation also accepts scoped `texel-size` values `0.5`
(default), `0.33`, and `0.25` metres. Finer profiles permit eleven atlas pages,
subject to complete receiver coverage and the unchanged 1 GiB runtime budget;
individual package shards remain below 512 MiB. Resolution is authenticated in
the shared pass profile and retained by reprocessing. Samples remain independent
of spatial resolution. Static sun depth retains its certified source lattice.

`tests/node/unit/bake_framework.test.js` covers bootstrap, option inheritance,
graph errors, hashes/reuse, child failure, cancellation and terminal behavior.
Use the standard selected-test runner. Integration evidence and production run
summaries belong in `tests/artifacts/screens/ai556_bake_framework/`, never in source
or tracked screenshot folders. See the framework README for the existing-domain
regression tests and release limitations.
