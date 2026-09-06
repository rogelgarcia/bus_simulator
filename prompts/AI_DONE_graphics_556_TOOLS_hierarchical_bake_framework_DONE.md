DONE

# Problem

Baking is spread across independent tools with different invocation, configuration,
preparation and publication workflows. Rebuilding illumination, shadows, occlusion
and other assets requires knowledge of script order and machine-specific paths.
There is no single command to build everything required by the game, and long
runs need clearer progress and failure reporting.

# Request

Create a hierarchical bake framework that organizes existing baking processes and
provides an extension point for future processes. Reuse the working bakers and
their validation contracts; this task organizes execution rather than changing
lighting models, coverage rules or visual quality by accident.

## Script ownership and hierarchy

- Put the master entry point at `tools/bake.mjs`, invoked with
  `node tools/bake.mjs` without required parameters after local setup. The master
  file in the tools root is explicitly requested; keep its supporting code and
  all domain scripts in their respective subfolders under `tools/`.
- Keep the master thin: it traverses its declared children in dependency order.
  A child with children performs the same orchestration for its own domain.
  Leaf scripts own one baking responsibility. Avoid a central script containing
  every domain's bake logic or an ever-growing list of domain-specific branches.
- Provide a lighting parent and independently callable scripts for shadows,
  illumination and occlusion. If direct and indirect illumination are separate
  bake passes, give each its own leaf script. Their parent consolidates their
  validated results into the illumination/lighting output; it does not hide both
  baking operations inside one leaf.
- Audit the actual implementation before choosing leaves. The current enhanced
  direct-light package reuses shared sun visibility and contains a reference
  rather than a second sunlight atlas. Preserve that dependency and identify
  packaging accurately; do not invent a duplicate direct bake to fill a slot.
  Distinguish static AO, sky visibility/occlusion and indirect bounce from
  screen-space SSAO/GTAO, which are runtime effects. Give actual offline occlusion
  generation its own script, with explicit consumers and independently valid
  output. Reuse existing algorithms where generation currently lives in runtime
  code rather than introducing a new occlusion model just for the framework.
- Inventory every current baking process, including visibility and material/
  texture bakers, not just lighting. Integrate supported production bakes into
  their corresponding branches. Clearly identify diagnostic/proof tools and
  runtime-only effects so they are not accidentally run as production bakers.
  Future bake types must be addable through a folder and declared registration
  without editing the master orchestration algorithm.
- The default tree must cover all bake outputs required by the configured game
  content. Publish/document this inventory; do not quietly limit "everything"
  to one lighting preview. Required inputs must have configured defaults or
  produce an actionable setup error, not silently skip a required job.
- Direct invocation of any domain/leaf entry point must resolve its own needed
  preparation. Shared source export, texture readiness, geometry/UV preparation
  and other prerequisites execute once per compatible run, not once per sibling.
  Validate dependency order and reject cycles or duplicate/conflicting outputs.
  Prefer sequential execution initially to avoid competing Blender/GPU jobs.

An illustrative hierarchy, with exact domain folder names decided during the
inventory, is:

```text
tools/bake.mjs
  lighting
    shadows
    occlusion
    illumination
      direct (when separately baked)
      indirect (when separately baked)
  visibility
  materials
    individual material/texture bakes
  future bake domains
```

## Local Blender configuration

- Use one shared machine-local configuration file, such as
  `tools/baking/blender.local.json`, for the existing Blender executable target
  and necessary machine-specific toolchain/backend paths. Gitignore this exact
  local file and provide a tracked example/schema with no personal absolute paths.
  Keep reproducible bake defaults and toolchain contracts in tracked files.
- Every bake entry point must use the same configuration discovery/bootstrap
  behavior, including when called directly. If the local file is missing, create
  a template, print its absolute location and the fields the user must configure,
  then stop with a clear setup-required result and nonzero exit code. Do not
  launch a bake with an empty or guessed Blender target. Never overwrite an
  existing configuration; malformed values get a useful correction message.
- Resolve configuration relative to the repository/tool location, not the shell's
  current directory. Handle spaces in paths and Windows, Linux and macOS
  executable conventions without shell-specific invocation assumptions.
- Use the configured existing Blender headlessly for batch baking; never download
  or install another Blender or repurpose an interactive session. Preserve the
  existing version/build verification. If a backend/platform is unsupported,
  report that explicitly rather than silently substituting another toolchain.

## Defaults and optional parameters

- With configuration complete, the master requires no flags, manual intermediate
  filenames or commands between stages. Use documented, reproducible defaults
  for the current content, profiles, quality, input discovery and output locations.
- Support optional parameters at the master, domain and leaf levels. Pass options
  down the hierarchy through one consistent contract, allowing scoped overrides
  for a child. Define precedence and show the effective settings in the run plan.
  Children must not silently drop overrides or confuse options for another baker.
- Expose meaningful existing controls, including Cycles samples, supported device,
  quality/profile and target selection. Samples and resolution are different
  controls; a shadow-depth bake must not interpret samples as extra shadow quality.
  Unknown or unsupported options must produce useful feedback.
- Where a duration option is supported, distinguish an estimated target bake
  duration from a hard cancellation timeout. Clearly define whether it covers a
  leaf or the whole requested run, and allocate a parent budget rather than giving
  every child that entire budget. Never claim an exact time guarantee from sample
  count. At minimum retain sample-based control and report actual elapsed time.
- Include help and a dry-run/plan mode that lists the hierarchy, dependencies,
  effective configuration, outputs and work to execute without running Blender.

## Logs and progress

- Use a consistent log format with indentation by hierarchy depth so a master,
  domain and leaf can be followed together. Include the full job identity on
  important messages and preserve readable child-process error context.
- Try lightweight terminal colors on capable Windows, Linux and macOS terminals.
  Respect `NO_COLOR`, provide a plain-text fallback, and avoid ANSI control codes
  in redirected logs or unsupported terminals. If reliable color support becomes
  complicated, keep plain text rather than adding substantial infrastructure.
- Try a progress bar for the overall run and active job. Use real phase/sample/
  completed-work progress where available. Otherwise clearly label estimates and
  show elapsed time plus estimated remaining time, or an indeterminate indicator
  when there is no defensible percentage. Do not report 100% before successful
  completion of required processing and validation.
- Keep interactive bars compact and preserve their indentation while child logs
  arrive. In noninteractive output, emit readable periodic progress lines without
  cursor animation or excessive per-sample logging. Finish with a per-job summary
  of success, authenticated reuse, failure/cancellation, durations and output paths.

## Reliable execution and migration

- Preserve source hashes, complete receiver coverage, transport validation,
  package authentication and atomic publication. A changed script/path must not
  make an old bake falsely appear current; handle provenance/version migration
  explicitly. Retain the current game rendering paths and illumination toggles.
- Keep generated intermediate data in task/run directories under
  `tests/artifacts/`, and runtime outputs in their established locations. Use fresh
  staging directories and keep the last valid publication intact on failure.
  Publication must honor each baker's existing validation and release policy;
  show whether a result is baked, validated or published instead of treating those
  states as interchangeable.
- Propagate failures and cancellation to the master; never run consolidation on
  incomplete child output or report overall success with missing required jobs.
  Preserve valid checkpoints and reuse them only after authenticating their
  inputs/settings/toolchain. Provide an explicit rebuild path. Handle interrupted
  runs and concurrent attempts without overwriting one another's working files.
- Migrate existing commands and references deliberately. Prefer reusing existing
  implementations under the hierarchy; document any compatibility entry points
  and avoid maintaining two independent implementations of the same baker.
- Add a framework README and relevant domain READMEs, register commands in
  `PROJECT_TOOLS.md`, and add/update the framework and affected domain contracts
  under `specs/`. Document first-run setup, one-command defaults, individual jobs,
  forwarded/scoped options, logs, progress, cancellation and recovery.

## Acceptance and evidence

- Test missing/invalid local configuration, template preservation, ignored local
  paths and executable paths containing spaces. Test discovery from a different
  working directory. The first missing-config invocation must explain setup;
  a configured invocation must not require extra command-line parameters.
- Test master-to-domain-to-leaf traversal, dependency deduplication, option
  forwarding/precedence, direct leaf invocation, cycle detection and failure/
  cancellation propagation with small deterministic fixture jobs.
- Test plain/colored terminal output and redirected logs, nested indentation,
  estimated/real progress and truthful final states. Use fixtures to avoid costly
  full-city bakes for these orchestration checks.
- Exercise real shadow, illumination and occlusion integrations with bounded
  fixtures, plus other existing bake branches identified by the inventory. Verify
  output compatibility and existing relevant regression checks. Do not substitute
  a fake occlusion success for an actual integrated bake.
- Demonstrate the no-argument master on the configured production tree, recording
  which jobs ran, which verified checkpoints were reused, and their validation/
  publication results. Do not require an unnecessary high-sample rebake merely to
  test traversal, but do not claim production coverage from mock tests alone.
- Save generated logs, run plans, receipts and any screenshots under
  `tests/artifacts/screens/ai556_bake_framework/`; keep them gitignored.

## On completion

- Mark this document DONE in the first line and rename it to
  `prompts/AI_DONE_graphics_556_TOOLS_hierarchical_bake_framework_DONE.md`.
- Keep it in `prompts/`; do not archive automatically.
- Summarize the implemented hierarchy, supported bake inventory, configuration
  path, default command, optional controls, verification and remaining limitations.

## Implementation summary — 2026-09-06

- Added the thin `node tools/bake.mjs` master, domain-owned registration and 25-job
  default plan covering existing production materials, lighting and visibility.
- Added independently callable sky occlusion and bounce passes, authenticated
  consolidation and legacy direct-pass compatibility. Enhanced direct lighting
  references a compatible shared sun profile instead of baking duplicate sunlight.
- Integrated authenticated shadow candidates, maintained native Depth24 foliage,
  provisional composition, native parity proof and production candidate packing.
- Integrated all eight procedural PBR recipes and the existing grass V2 bake;
  preserved their algorithms, output formats and publication policies.
- Added shared machine-local configuration bootstrap, ignored local paths, pinned
  existing Blender verification and isolated headless execution without downloads.
- Added common/scoped options, dry-run plans, hierarchical terminal logs, truthful
  progress, owned-process cancellation, concurrency locks and authenticated reuse.
- Preserved live rendering and release gates; explicit publication is supported
  where the existing baker permits it. Shadow candidates and grass proposals keep
  their separate certification/review requirements.
- Added discoverability in `AGENTS.md`, `PROJECT_TOOLS.md`, framework/domain/legacy
  READMEs and the canonical `specs/tools/bake_framework.md` architecture contract.

### Verification

220 selected Node tests passed: framework 12, static shadow tools 167, receiver
coverage 17, receiver atlas files 1, source validation 13 and visibility 10.
All 52 framework modules passed Node syntax checks; `git diff --check` passed.

| Real integration | Result |
| --- | --- |
| No-argument master, final code | Eight PBR recipes, grass and historical comparison validated; deliberately cancelled at source export; cancellation summary and lock cleanup verified |
| Same no-argument command restarted | Ten completed material jobs/parent authenticated and reused; historical comparison revalidated; cancelled cleanly before expensive city work |
| Current BigCity2 visibility branch | Fresh source validated; 607,500 bake views; 750 native-resolution validation views; zero misses after existing repair; 584.9 seconds including source export |
| Shadow integration, azimuth 45 / elevation 8 | Current-city Blender candidates and direct native fields, provisional render, 228-sample native parity with zero mismatches, and authenticated production candidate packaging passed |
| Actual Cycles phase fixture | Two objects, 64px, 64 samples; enhanced sky/bounce and original direct/sky/bounce; exact consolidation; missing/corrupt data and changed settings rejected |

Evidence lives under `tests/artifacts/screens/ai556_bake_framework/`. Final master
summaries are `run-1788725737983-24624-1c7df2db/summary.json` and
`run-1788725805846-2304-e22316f4/summary.json`; visibility is
`run-1788723914474-3048-a13769fa/summary.json`; phase checks are
`native-phases-final/verification.json`; shadow packaging is
`shadow-verified-result.json`. Shadow native intermediate authority remains under
`tests/artifacts/illumination_531/ai556/`, as required by the existing compiler.

### Scope and limitations

- This implementation organizes offline execution; it makes no runtime FPS or
  lighting-quality improvement claim. No game rendering settings were changed.
- The complete eight-profile, 896-sample master was not rerun end to end merely
  to verify orchestration. Real bounded integrations and cancellation/reuse were
  exercised; the recorded master runs are deliberately incomplete bake runs.
- Current Blender lighting certification remains Windows x64 / 5.2.1. The CLI,
  path handling and terminal fallback are portable; other Blender platforms need
  an explicit reviewed backend contract.
- The historical scalar preview cannot cover the complete current city within
  its original policy. Its installed comparison packages are authenticated by
  default; explicit legacy bake targets retain strict coverage rejection.
- Static runtime vertex AO, SSAO/GTAO and contact shadows are runtime processes.
  Sky occlusion is the separate offline light-transport job; material AO remains
  part of each owning material bake.
- Defaults bake and validate. `--publish` applies only under the existing release
  policy. No live asset index was replaced by these integration checks.
