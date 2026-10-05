# DONE

# Problem

The game depends on an existing licensed tree pack and needs original replacement
assets, more species and shape variation, bushes, and fuller canopies. The new
vegetation must look convincing from a bus and at street level while remaining
efficient in dense city scenes. Abundant leaves and good canopy coverage, credible
bark, and natural sunlight response are priorities.

# Request

Build an original urban vegetation asset library for the four species below.
The user's 2026-10-03 scope replaces the earlier rollout plan:

- Use only the earlier lower-cost ("Mobile") geometry approach, exposed as one
  implementation with no quality-tier names, duplicate editions or selector.
- Deliver three structurally distinct **mature** variants per species. Replace
  the London plane young/mature/spreading age split with three mature forms.
- Implement silver linden, northern red oak and the planned arrowwood viburnum
  shrub. The result is nine mature tree models and three mature bush forms.
- Add the models to the asset library and Inspector Room. Do **not** replace
  current city trees or alter gameplay placements, current assets or city bakes.
- Blender may be used **headless only**. CC0/free downloads are permitted after
  checking reuse terms and recording provenance.

"Bold leaves" means abundant foliage and good canopy coverage, not oversized
leaves. Keep species-appropriate leaf size, believable branching and full crowns.
The initial visual setting is temperate urban planting. Botanical guidance is
for asset appearance, not a universal real-world planting recommendation.

## Historical first-species pass (superseded contract)

The first pass produced London plane young/mature/spreading forms in two quality
tiers and an opt-in gameplay hook. The new scope replaces those interfaces and
removes that hook. The completed items below remain immutable history; they do
not describe the current library contract. Current specifications live in
`specs/trees/urban_vegetation_assets.md`.

Completed first-species work:

- [x] Author three London plane structures in Desktop/Mobile tiers, original leaf
  and bark maps, mixed flat/folded leaf cards and restrained bark-peel geometry.
- [x] Register the reproducible headless authoring job, validate all six GLBs and
  publish them through the existing framework's authenticated asset gate.
- [x] Add original-tree catalog/inspector entries and explicit gameplay selection;
  verify the Lab city's 73 trees load without the licensed pack, and preserve
  placement, ground contact, scale and source-identity invalidation.
- [x] Capture 14 UHD views, verify original leaf/AO masks, and record a repeated
  same-condition isolated benchmark with its coverage and timing limitations.

The first-pass performance measurements and three pre-existing AO/bloom fixture
failures are retained under `tests/artifacts/screens/ai577_urban_vegetation/london_plane/`.
Those measurements do not certify the new twelve-model library. The existing
failures were reproduced against pre-change HEAD; do not weaken their assertions.
## Four starter species

The botanical traits below are sourced; their proposed modeling uses are art and
engineering choices. These are visual candidates for the game, not universal
planting recommendations for every city.

| Species | Urban role and recognizable traits | Modeling priorities |
| --- | --- | --- |
| **1. London plane — Platanus × acerifolia** | Parkway/shade tree with a broad crown, large three-to-five-lobed leaves, and exfoliating bark with pale, gray and green patches. [Botanical reference](https://mortonarb.org/plant-and-protect/trees-and-plants/london-planetree/) | Broad irregular canopy masses, substantial branching and large leaf silhouettes. Use mottled bark with restrained peeling detail; do not give it uniformly deep furrows. |
| **2. Silver linden — Tilia tomentosa** | Street tree with a pyramidal crown, heart-shaped serrated leaves, dark upper surfaces and silvery-white undersides. Gray young bark becomes ridged with age. [Botanical reference](https://mortonarb.org/plant-and-protect/trees-and-plants/silver-linden/) | Full tapered crown and strong, natural upper/lower leaf contrast. Preserve the pale underside as a material trait rather than an artificial glow. |
| **3. Northern red oak — Quercus rubra** | Street/shade tree with a rounded or spreading crown, pointed lobed leaves, and mature bark with broad ridges and shallow furrows. [Botanical reference](https://plants.ces.ncsu.edu/plants/quercus-rubra/) | Broad asymmetric branching and elongated lobed leaves. Use the trunk to compare selective ridge geometry with normal mapping alone. |
| **4. Arrowwood viburnum — Viburnum dentatum** | Dense, rounded, multi-stemmed shrub used for hedges, screens, mass planting and parking-lot landscaping. Toothed, prominently veined leaves have lustrous green upper surfaces. [Urban-use reference](https://plants.ces.ncsu.edu/plants/viburnum-dentatum/) and [form/leaf reference](https://mortonarb.org/plant-and-protect/trees-and-plants/southern-arrowwood/) | A full freestanding bush, an irregular bush and an informal hedge form. Preserve low multi-stem growth and rounded toothed foliage; do not create bushes by shrinking tree models. |

## Starting point and constraints

Inspect the live implementation before making changes:

- `src/graphics/assets3d/generators/TreeGenerator.js`
- `src/graphics/assets3d/generators/TreeConfig.js`
- `src/graphics/content3d/catalogs/TreeMeshCatalog.js`
- `src/graphics/gui/inspector_room/InspectorRoomTreeMaterialUtils.js`
- `specs/trees/tree_placement_exclusions.md`
- `specs/graphics/illumination_bake_input.md`
- `specs/graphics/lighting_enhancement_reference.md`
- `ai_rules/PROJECT_RULES.md`, `ai_rules/PROJECT_CODING_RULES.md`, and
  `ai_rules/TESTING_RULES.md`; read `PROJECT_RULES.local.md` if present.

At prompt creation, the catalog uses 15 Desktop and 15 Mobile FBX assets plus
shared TGA textures under `assets/trees/`. Replacing only meshes would leave the
old texture dependency. The existing foliage path uses double-sided alpha-tested
materials, with `transparent: false` and `alphaToCoverage: false`, and foliage/AO/
shadow metadata consumed by other passes. Recheck these facts during implementation.

Completed-prompt filenames are not proof that every proposed change shipped:
AI 540 canopy AO was reverted; AI 543's LOD audit and AI 545's provenance work were
closed without implementation. Dedicated foliage translucency is not currently
documented as shipped. Do not assume those systems or manifests exist.

## Current implementation requirements

- [x] Build all twelve models: three mature London planes, three mature silver
  lindens, three mature northern red oaks and three mature arrowwood viburnums.
  Vary scaffold structure, crown proportions, branch direction and asymmetry;
  rotation, uniform scaling and recoloring alone do not count as variants.
- [x] Use a single low-cost geometry profile, based on the first pass's Mobile
  version. Keep new filenames, APIs and catalog labels free of quality tiers.
  Mature trees must stay within 12,000 triangles; bushes should cost less.
- [x] Give each species distinct bark, leaf silhouette and growth habit. London
  plane uses mottled exfoliating bark and a broad crown; linden has a tapered
  crown and heart-shaped serrate leaves; red oak has a broad scaffold, ridged
  bark and elongated bristle-tipped lobes; viburnum has low multiple stems,
  opposite serrate leaves and rounded/irregular/hedge forms.
- [x] Preserve full layered foliage coverage with natural gaps, multiple card
  orientations, padding and stable alpha cutoff. Do not make crowns fuller by
  enlarging their leaves or using solid opaque canopy blobs.
- [x] Author original meshes and bark/leaf color, normal and roughness maps;
  reuse no geometry or maps from the licensed tree pack. Record botanical
  references, source ownership, channel meanings and actual external licenses.
- [x] Keep low-sided trunks and useful root/branch silhouette geometry. Use
  normal-mapped bark for surface detail; do not carry expensive optional desktop
  folds, fine twig tubes or peel geometry into the single low-cost profile.
- [x] Retain standard supported materials and foliage coverage/shadow/AO metadata.
  Represent silver linden's pale leaf underside affordably if possible, and
  document any approximation. Alpha denotes coverage, not transmission. Custom
  wind or physically based leaf transmission is outside this model-library pass.
- [x] Add four species collections with three mature entries each to the Inspector
  Room and a shared species loader. Preserve authored metric size and ground
  alignment. Remove the earlier original-tree gameplay hook and its now-unused
  bake-identity changes; keep the existing game's trees and bakes intact.
- [x] Register all species leaves under the shared vegetation bake domain. Use
  isolated headless Blender, the existing configuration, authenticated staging,
  validation and explicit publication. The vegetation domain remains opt-in.
- [x] Validate all twelve GLBs, exact variant mapping, independent loading, bounds,
  triangle/material budgets, ready textures, cutout semantics and AO masks. For
  any explicit back-face geometry, verify matching silhouettes and correct
  material sidedness. Verify the original game still uses its existing trees.
- [x] Inspect a UHD three-variant lineup for each species, whole-plant angles,
  leaf/bark details and fixed-exposure front/side/back sunlight. Keep screenshots,
  reports and reference copies under the prompt-specific artifact directory.
- [x] Update canonical specs and tool documentation with current IDs, sources,
  dimensions, counts, visual evidence, measured costs and honest limitations.
  Preserve prior completed history without presenting it as current behavior.

## Deferred by the current scope

Replacing city trees, removing the licensed pack from gameplay, changing city
placement, publishing new city lighting/visibility bakes, full-city route profiling,
automatic distance LOD, wind and a new transmission shader are not part of this
implementation. They require a later explicit integration request. Publication of
library assets must not certify or install derived city lighting data.
## Production workflow

- For this implementation the user's explicit preference is **headless Blender**.
  Check for occupied sessions/render jobs and use a separate, isolated headless
  process with limited resource use; never repurpose another task's session.
  If unsafe to proceed, finish independent work and report exactly which Blender
  work remains incomplete and what the user must free.
- Route offline baking through `node tools/bake.mjs` and the hierarchy in
  `tools/baking/README.md` and `specs/tools/bake_framework.md`. Register any needed
  domain/leaf, reuse `tools/baking/blender.local.json`, and preserve validation
  and publication gates. Do not add a machine-specific standalone bake command.
- Put rendering code in the appropriate `src/graphics/` layer. Keep shader source
  in dedicated files under `src/graphics/shaders/`. Register any new tools with
  their own folder/README and `PROJECT_TOOLS.md`. Do not create commits.

## Validation and acceptance

1. Deliver twelve reproducible, textured GLBs at metric scale, with exactly three
   mature variants per species and one cost profile. Preserve existing asset
   distribution and gitignore rules.
2. All twelve entries must load in the Inspector Room without requesting the old
   pack. Existing game tree loading must retain its previous behavior.
3. Show distinct mature silhouettes, species-specific leaves/bark and full crowns
   in native-renderer UHD 3840x2160 evidence. Use an HDRI for environment and visible
   background with fixed exposure. Store final captures and reports under
   `tests/artifacts/screens/ai577_urban_vegetation/mature_family/`.
4. Record triangle counts, draw calls, file sizes and available geometry/material
   measurements. Report only measured performance, with hardware, resolution,
   settings, workload, warmup, samples and statistic. Mark full-game FPS, actual
   GPU allocation or overdraw as unmeasured when not instrumented; do not infer
   a speedup from triangle count alone.
5. Use focused asset/catalog/default-game regressions through
   `node tools/run_selected_test/run.mjs`. Preserve validation/publication gates
   and check that captures correspond to unchanged published asset hashes.
6. Completion covers the model library and inspector delivery above. City rollout
   is explicitly excluded by the user's current request.
## On completion

- Mark this AI document DONE in the first line and rename it to
  `prompts/AI_DONE_graphics_577_MESHES_original_urban_trees_and_bushes_DONE.md`.
- Keep it in `prompts/`; do not move it to `prompts/archive/` automatically.
- Add a high-level one-line summary per completed change and relevant file paths.
- Include the same-condition before/after performance table with hardware,
  resolution, settings, workload/cameras, warm-up, sample counts and statistics.
  Separate measured results from estimates and mark missing metrics honestly.
- Link the final models/authoring sources, updated specs, provenance records,
  source references, screenshots and test evidence. State which trunk and leaf
  techniques were retained, why, and any remaining limitations.

## Completion — mature library scope, 2026-10-03

- Published twelve original models under `assets/public/vegetation/`: three mature
  forms each of London plane, silver linden, northern red oak and arrowwood viburnum.
- Replaced the first prototype's tier/age interface with one geometry profile;
  retired its six tiered GLBs from the active plane directory while retaining rollback.
- Added original bark/leaf base color, normals and packed roughness maps. Paired
  linden cards provide actual green upper and silver lower surfaces with one
  foliage material. All other cards are double-sided; no custom shader is needed.
- Filled crowns using thirteen normal-size leaves per tree card, more retained
  cards and foliage along inner/middle branches. Shrubs retain nine leaves per
  card and independently generated low multi-stem structure.
- Added four Inspector collections and `UrbanVegetationLoader.js`; fixed camera
  refitting after asynchronous loading while preserving native metre scale.
- Removed the previous original-tree gameplay/bake hook. Current game tree and
  bake identity sources match the original HEAD and default loading stays legacy.
- Registered all four leaves through `tools/bake_vegetation/jobs.mjs`, with original
  recipes, reproducible headless sources, shared configuration and authenticated
  staged validation/publication. No existing Blender session was altered.
- Passed catalog tests (3), generic import/default-game checks (2), Inspector
  framing (1), actual Inspector material/readiness checks (1), and final capture (1).
  Captured 41 UHD showcase images plus one actual Inspector image with final assets.

Detailed inventory, references, source paths, validation receipts, limitations,
and exact per-form comparisons are in
[`specs/trees/urban_vegetation_assets.md`](../specs/trees/urban_vegetation_assets.md).
The [authoring guide](../tools/bake_vegetation/README.md) documents rebuilding.
Each published species directory contains `index.json` and `PROVENANCE.md`.

### Same-condition density/cost comparison

Before means the initial twelve-model candidate, after means the final library;
the prior two-tier first-species pass is not the baseline here. Crown occupancy
uses the same orthographic front projection, normalized height 1 and 256px over
1.3 vertical units. Bark is hidden; leaf pixels are divided by their convex-hull
area. Values below span each species' three forms. This is a single-view density
measure, not volumetric fullness or a frame-rate benchmark.

| Species | Triangles before → after | Crown occupancy before → after | Material draws |
| --- | --- | --- | --- |
| London plane | 8,690–9,354 → 10,592–11,282 | 55.7–59.3% → 75.7–78.8% | 2 → 2 |
| Silver linden | 9,246–9,622 → 11,038–11,566 | 18.7–24.8% → 56.2–59.7% | 2 → 2 |
| Northern red oak | 9,922–10,674 → 10,812–11,664 | 56.5–66.4% → 70.5–73.5% | 2 → 2 |
| Arrowwood viburnum | 3,542–4,830 → 3,542–4,830 | 69.0–75.0% → 69.0–75.0% | 2 → 2 |

| Timing / memory metric | Before | After | Reason |
| --- | --- | --- | --- |
| Frame time / FPS / GPU pass time | Not measured | Not measured | No timing instrumentation or timed workload |
| Actual GPU allocation / fragment overdraw | Not measured | Not measured | Only geometry array bytes and projected masks were measured |
| Full-game FPS | Not measured | Not measured | The new models are intentionally outside gameplay |

Captured on NVIDIA GeForce RTX 3060 / Chrome ANGLE D3D11 at 3840×2160, ACES,
exposure 1, 2048px alpha-tested shadows and a real HDRI background/environment.
Geometry and projection measurements use one deterministic sample per model per
revision; timing warmup/sample counts/statistics are not applicable because no
timing benchmark was performed. No speedup is claimed for the density pass.

Evidence is under `tests/artifacts/screens/ai577_urban_vegetation/mature_family/`:
`capture_report.json`, `density_comparison.json`, the four species lineups, detail
and sunlight views, and `inspector/silver_linden_mature_01.png` with readiness data.
All generated evidence and published assets follow the existing ignored/shared
asset rules. Tracked sources and this prompt provide the reproducible handoff.
