# Bake framework

Start with `node tools/bake.mjs`. On first use it creates
`tools/baking/blender.local.json`, prints the absolute path, and exits with code 2.
Configure `executable` with the **existing** Blender executable and `archive` with
the existing pinned archive required by the shadow compiler. Optionally configure
`browserExecutable` with an installed Chrome/Chromium executable. Paths can be
absolute or repository-relative and may contain spaces. No installation is downloaded.
Image experiments additionally use `pythonExecutable` (NumPy/OpenImageIO/OCIO) and
`renderDevice` (`CPU` or `OPTIX`). Standalone image processing does not require Blender.
The exact local file is gitignored; `blender.example.json` is the shareable template.
Never put machine paths in tracked defaults or documentation.

After setup, the master needs no flags or intermediate filenames:

```sh
node tools/bake.mjs
node tools/bake.mjs --dry-run
node tools/bake_lighting/run.mjs
node tools/bake_lighting/diffuse_probes/run.mjs --samples 256 --publish
node tools/bake_lighting/shadows/run.mjs
node tools/bake_lighting/occlusion/run.mjs --samples 64 --device OPTIX
node tools/bake_lighting/illumination/run.mjs --samples 896 --device OPTIX
node tools/bake_lighting/illumination/indirect/run.mjs --samples 64
node tools/bake_lighting/illumination/preview/direct/run.mjs --samples 64
node tools/bake_visibility/run.mjs
node tools/bake_materials/run.mjs
node tools/bake_materials/brownstone/run.mjs
```

`--help` does not require configuration. `--dry-run` uses the same setup discovery
as execution but launches no Blender/browser process. It prints and saves the
resolved plan, including dependencies, settings, declared outputs and job identities.

## Hierarchy and inventory

Vehicle spatial diffuse lighting lives in `tools/bake_lighting/diffuse_probes/`
and is included by the lighting/master jobs. Its independently callable children
are `prepare`, `sky` and `bounce`; the parent consolidates and optionally publishes.
See that folder's README for tracked coverage defaults and runtime compatibility.

`registry.mjs` registers domain-owned definitions. The master contains no domain
conditions. Each independently callable script enters the same planner; dependencies
are included even when invoked directly and shared prerequisites run only once.
The first implementation executes sequentially, including Blender and browser jobs.

| Branch | Offline responsibility | Default/release behavior |
| --- | --- | --- |
| `materials/<material>` | Eight procedural PBR sets from the existing bank, Bradbury and AI491 recipes; albedo, normal, packed AO/roughness/metalness | 1024px, deterministic recipes; stage and validate |
| `materials/grass` | Grass V2 far maps and separate blade/clump atlases, including their AO maps | Existing calibrated 1024px recipe; validated proposal, existing gameplay review retained |
| `lighting/source` | Current BigCity2 resolved source, ready textures and repeated deterministic BSIB export | Always refresh; once for the requested tree |
| `lighting/shadows/candidates` | Authenticated Blender candidate lattices | Shared preparation for native foliage capture |
| `lighting/shadows/streamed/city`, `/prototype`, `/review`, `/publish`, `/parent-control`, `/filter-review`, `/toggle-review` | Authenticated native 3x detail pages, bounded complete-city generation, route and shader comparisons | Explicit leaves; generation stages only, publication requires complete coverage and a matching cold/warm review; complete installed parent and its gates retained; [workflow](../bake_lighting/shadows/streamed/README.md) |
| `lighting/shadows/cutouts` | Source-derived direct Depth24 foliage fields needed by the shadow compiler | Maintained accepted-caster pipeline; all eight certified sun profiles by default |
| `lighting/shadows/provisional` | Compose opaque depth and native foliage into validation descriptors | Intermediate only; prepares parity evidence |
| `lighting/shadows/parity` | Authenticate native foliage against the live reference | Required proof for mipmapped/anisotropic cutouts before packing |
| `lighting/shadows` | Static sun depth maps | 16384 source map: 680m historical grid, 864m calibrated high-sun grid; CPU, one sample; validated development candidate, strict release gate retained |
| `lighting/illumination/prepare` | Complete opaque-surface UV layout and receiver atlas | 4096px pages, 0.5m texels, up to nine pages, unchanged complete-coverage contract |
| `lighting/occlusion` | Sun-free occluded sky irradiance | Separate independently authenticated Cycles pass; consumed by enhanced indirect lighting |
| `lighting/illumination/indirect` | Indirect diffuse bounce from all contributing static surfaces | 896 samples, CPU by default; excludes runtime-only receivers according to existing transport rules |
| `lighting/illumination/direct` | Reference to the existing shared sun visibility | **No duplicate direct sunlight bake** in the enhanced representation |
| `lighting/illumination` | Consolidate sky and bounce, pad/encode maps, package and authenticate | Existing receiver package format and runtime switches preserved |
| `lighting/illumination/reprocess` | Refilter authenticated completed sky/bounce samples | Explicit maintenance leaf; requires unchanged current source, original UV layout/profile and toolchain; see [reprocess](../bake_lighting/illumination/reprocess/README.md) |
| `lighting/preview-reference` | Authenticate installed historical comparison packages | Read-only; no claim of current-source coverage |
| `lighting/experiments/configurations` | AI 560 game baselines, city export, Cycles matrix, display variants, analysis, 4K shortlist and pose-first gallery | Explicit diagnostic target, outside production defaults; standalone stages validate only their shared tool paths; [workflow](../bake_lighting/experiments/lighting_configurations/README.md) |
| `lighting/experiments/physical-calibration` | AI 564 analytical Cycles/native fixtures, Cornell data/provenance, partial CIE axis and raw/HDR/display validation | Explicit diagnostic, no publication; standalone `references`, `prepare`, `capture`, `render`, `analyze`; [workflow and limitations](../bake_lighting/experiments/physical_calibration/README.md) |
| `lighting/experiments/daylight-calibration` | AI 565 coherent multiple-scattering daylight and normalized CIE overcast, native fixtures and 30 city transport renders | Explicit diagnostic, no publication; standalone `prepare`, `render`, `fixtures`, `capture`, `analyze`, and `afternoon` (35°/55°/65° comparison from AI567); [workflow](../bake_lighting/experiments/daylight_calibration/README.md) |
| `lighting/experiments/material-calibration` | AI 566 material audit, native/neutral Cycles lobes and five-pose daylight candidate comparisons | Explicit experiment, no publication; standalone `audit`, `prepare`, `capture`, `render`, `analyze`; [workflow](../bake_lighting/experiments/material_calibration/README.md) |
| `lighting/experiments/automated-calibration` | AI 567 independent checks, fresh game baselines, bounded search, full-render finalists and AI562 handoff | Explicit experiment, no publication; standalone `validate`, `baseline`, `prepare`, `calibrate`, `search`, `render`, `analyze`, `review`; [workflow](../bake_lighting/experiments/automated_calibration/README.md) |
| `lighting/experiments/reference-matching` | AI562 actual game integration, immutable baseline/candidate captures, revised Cycles exporter, E55 native validation and progress comparisons | Explicit workflow; independently callable `baseline`, `sky`, `capture`, `reference`, `native-validation`, `diagnostics`, `review`; [workflow](../bake_lighting/experiments/reference_matching/README.md) |
| `lighting/experiments/sun-sky-ratios` | AI 563 stronger-sun matrix from an existing AI 560 Blender export, neutral-card exposure matching, ACESFilmic/AgX and pose sheets | Explicit diagnostic, no export or publication; `source-run` required; Python/browser-only `/review`; [workflow](../bake_lighting/experiments/sun_sky_ratios/README.md) |
| `lighting/illumination/preview/...` | Compatibility-only scalar preparation, direct sunlight and bounce | Explicit target, outside the default production tree; strict coverage checks retained |
| `lighting/occlusion/preview` | Compatibility-only original sky irradiance | Explicit target, outside default tree |
| `visibility` | Conservative BigCity2 PVS table | Existing view sampling, repair and native-resolution zero-miss validation |

The lighting parent rebuilds the complete enhanced variant and verifies the
installed original comparison. The historical four-page scalar recipe cannot
represent the complete current city: the audit requires 303 pages, has eight
unmappable ranges and 14 unsupported transport materials. It therefore remains an
explicit compatibility/fixture target and fails closed on the current full-city
source. The framework does not reinstate the old partial-selection heuristics.
Enhanced surface profile v5 preserves a continuous sampling lattice for verified
flat connected UV islands. Topology or allocation changes require fresh sky and
bounce samples; `reprocess` cannot convert older triangle-isolated maps to v5.
Every material has its
own callable `run.mjs` under `tools/bake_materials/<material>/`. `--target <job/id>`
is equivalent to that entry point and also works for registered preparation jobs.

The following are deliberately not production jobs:

- SSAO/GTAO and the bus contact shadow are runtime effects.
- `StaticAoRuntime` generates its vertex/distance-field AO from the attached scene;
  it has no persistent offline asset contract. It continues using the same runtime
  algorithm. Offline **sky occlusion** above is a different output; the framework
  does not label screen-space AO or runtime-generated vertex AO as an offline bake.
- `illumination_bake_compiler` proof scenes, static-sun lab/parity diagnostics,
  receiver atlas-only inspection and visibility sensitivity/capture tools validate
  other tools; they are not extra production assets.
- Shadow texture-gradient reconstruction and promotion are alternate research
  workflows. The default uses maintained direct Depth24 capture, provisional
  composition and native parity evidence, with complete field authentication and
  the same production provenance allowlist. Strict Lab/production parity and human review remain
  release gates; a successfully packaged development candidate is not a release.
- `pbr_material_importer` imports authored third-party inputs and
  `texture_correction_pipeline` analyzes/corrects selected inputs. They require
  asset-authoring decisions and are not repeated automatically as scene bakes.

## Parameters

Precedence is tracked job defaults, then common options, then scoped overrides
from broadest to narrowest scope. An option with no selected consumer is an error.

```sh
node tools/bake.mjs --samples 128 --device OPTIX
node tools/bake.mjs --set lighting/illumination:samples=896
node tools/bake_lighting/shadows/run.mjs --profile ai527.sun.az045.el35
node tools/bake.mjs --timeout-seconds 1800
```

Cycles samples (1–4096) and resolution are separate controls. Samples do not change
the fixed shadow-depth lattice. The enhanced backend supports CPU or OPTIX;
unsupported devices fail rather than silently falling back.
`--set lighting/illumination:texel-size=0.33` selects 33 cm surface texels instead
of the default 50 cm. The 25 cm option is also available for cities that fit.
Finer layouts permit at most eleven 4096² pages; complete coverage
and the existing 1 GiB runtime allocation / 512 MiB per-container limits must
still pass before rendering. For example, use `--target lighting/illumination
--samples 512 --device OPTIX --set lighting/illumination:texel-size=0.33
--set lighting/shadows:profile=ai527.sun.az045.el55` to create a calibrated
candidate. Validate it through reference-matching capture/native-validation and
install gates before switching live indexes. Reprocessing preserves the original
texel size and page budget.
Cycles settings belong
to the preparation job because sibling passes share its authenticated profile.
Pass entry points accept common options, and parent scopes apply to preparation.
Conflicting or unused leaf-specific overrides are rejected, not ignored.
If the selected tree includes enhanced direct consolidation, its shadow selection
must include the receiver source sun. An incompatible selection fails with the
required profile identity; it cannot produce a reference to a missing sun map.

`--timeout-seconds` is a **hard timeout for the entire invocation**, not a duration
target applied repeatedly to each child. Without it, existing backend safety
timeouts still apply. Sample counts cannot guarantee 30 minutes. Actual elapsed
time is recorded in receipts and logs; an unknown ETA stays unknown.

The framework and non-Blender jobs are portable Node scripts. Current lighting
compiler certification pins **Windows x64 Blender 5.2.1** by executable/archive
hash and Blender runtime signature. Another OS needs a reviewed backend contract;
accepting a macOS/Linux executable path does not waive that certification.

## Outputs, logs and recovery

By default the command **bakes and validates**; it does not switch live indexes.
`--publish` installs validated receiver packages, visibility tables and procedural
PBR sets using their existing destinations. Shadow candidates remain under a fresh
`assets/baked_lighting/shadows/framework/<identity>/` namespace without switching
the live shadow index. They still require AI531 release certification. Grass V2
remains a reviewed asset proposal. These distinctions appear in job summaries.

Run plans, logs, checkpoints and generated test evidence live under
`tests/artifacts/screens/ai556_bake_framework/`. AI531 native-field intermediates
retain their required `tests/artifacts/illumination_531/ai556/` authority. Each run
has its own staging tree. Logs are indented by job identity, include full child-log
paths, and report overall **validated jobs** plus indeterminate active-job progress
and elapsed time. TTY output uses basic colors; `NO_COLOR`, `TERM=dumb`, and
redirected output remain plain. Redirected Blender output is retained in full in
the process log, with periodic concise console updates.

Press Ctrl+C to cancel the owned process tree. Cancellation or failure stops later
jobs and consolidation. Completed checkpoints remain; interrupted partial passes
are not treated as complete. Run the same command again to authenticate and reuse
valid checkpoints. `--rebuild` bypasses framework checkpoints. A live run lock
rejects concurrent masters; stale locks from a dead process are retained as
interruption records. Checkpoint identity includes settings, declared inputs,
framework/backend code, Blender identity and dependency digests. Every output is
rehashed before reuse. Historical pre-framework maps remain usable by the game but
are not silently declared current framework checkpoints after compiler changes.

Checkpoints cover completed jobs, not partially rendered tiles within an active
job. A shadow job covers its selected profiles; use `--profile` to bound a run.
If a crash interrupted lock recovery itself, the error identifies the exact
`.recovering` guard. Verify that no bake is running before removing that guard.
Avoid editing bake code during a run: changed inputs stop the run before promotion.

See [the architecture contract](../../specs/tools/bake_framework.md) before adding
another baking process. Legacy commands remain compatibility interfaces to the
same implementations; the hierarchy is the preferred entry point.

## Verification

For a supplied gameplay pose, use `lighting/experiments/reference-matching/pose-comparison`
with leaf options `pose=<pose.json>`, `source-run=<authenticated afternoon run>` and
`output=tests/artifacts/screens/ai562_acesfilmic_reference_matching/<new-name>`.
It captures current game defaults with applied 55-degree bakes, exports the actual
city and bus, and renders one matching 1920x1080 Cycles image with ACESFilmic.
The two images are `game.png` and `cycles.png`; no gallery is generated. Its
diagnostic receipt cannot authorize publication or replace the five-view gates.
It uses an isolated background Blender process and the shared local toolchain.

Select `tests/node/unit/bake_framework.test.js` in `tests/.selected_test`, then run
`node tools/run_selected_test/run.mjs`. Related suites are
`tests/node/unit/static_sun_depth_tool/`, `receiver_complete_coverage.test.js`,
`receiver_atlas_files.test.js`, `illumination_bake_source_validation.test.js` and
`static_visibility.test.js` under `tests/node/unit/`.

`tools/baking/validate_receiver_phases.py` is a diagnostic Blender fixture, outside
the production tree. It exercises real Cycles sky/bounce and original direct passes
on two objects, checks exact assembly, and rejects corrupted or incompatible pass
data. Pass an output directory under `tests/artifacts/screens/ai556_bake_framework/`
after Blender's `--` separator. This fixture does not replace full-city coverage
validation or shadow release certification.
