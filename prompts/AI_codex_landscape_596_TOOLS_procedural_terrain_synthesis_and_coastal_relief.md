# Procedural terrain synthesis and coastal relief (AI 596)

# Problem

The coastal landscape is set up (AI 576/577), but it looks too soft. It has no sharp terrain definition
and no meaningful transitions. The user expected proper hills, a recognizable high city area higher
than the centre, and a beach that slopes down to the sea. None of these can be recognized in the
renders.

Measured on the current source (coastal-city terrain v2, see
`specs/landscape/LANDSCAPE_NATURAL_WORLD_ROADMAP.md` §1):

- Heights match the v2 plan: high city 48.6–49.2 m, low city about 18 m, beach arrival 2.6 m. The plan
  itself lowered the relief: high city from 160 m nominal to 49 m, with a 50 m terrain cap.
- 92.4% of land is below 5° and only 0.05% is above 20°. The steepest native sample is 34.9°. There are
  no cliffs, gullies, ridgelines or breaks in slope.
- The high city flanks average about 7°. From the beach the plateau subtends about 1.3°, so it reads as
  a faint bump.
- The beach-to-centre rise is a 6–12° ramp painted as a flat exposed-rock band. The swim beach climbs
  0 → 2.6 m and then stays flat.
- The seabed is a planar ramp ending in a flat −30 m floor.
- `build_terrain.py` makes the terrain from Gaussian hills and a sinusoidal roll. Districts are
  feathered over 65–150 m and roads over 72 m shoulders, then a final blur is applied. There is no
  erosion, geology or coastal process.
- The 1.953125 m native spacing cannot hold features narrower than about 4 m.
- The flyover (`tests/artifacts/screens/landscape/flyover/frames/`) shows featureless ground and the
  world ending at the 4 km boundary.

The references (R03, R04, R07, R10 in the roadmap) show eroded ridges and gullies, escarpments, layered
coastal bluffs, talus and real beach profiles. These come from erosion and geology, not from textures.

# Request

Build an in-repository, deterministic terrain synthesis engine, comparable to Gaea, World Machine or
Houdini heightfields, and use it to publish coastal terrain v3. The new terrain must:

- keep the plan's hard constraints;
- read as natural, legible relief with sharp definition;
- have a real beach profile and natural bathymetry;
- expose geology and erosion channels for later surfaces and ecosystems;
- raise authoritative resolution where measurement justifies it;
- surround the 4 km extent with a far field.

Work procedurally first. Do not sculpt or paint by hand. Keep recipes, seeds and override hooks as data
so the user can fine-tune later.

## Execution and scope

- Start only after AI 595 PROJECTMAINTENANCE (removing the landscape cache from Git history) is
  complete: it rewrites this branch and moves the landscape cache to a gitignored location. Generated
  landscape data (terrain revisions, pages, fields, channels, placement tiles, caches) is a local bake
  output that is never committed or sent through Git LFS. Commit recipes, small authored configuration,
  code, tests and specs. Paths written as `assets/public/landscape/` mean the cache location AI 595
  documents.
- Read `specs/landscape/LANDSCAPE_NATURAL_WORLD_ROADMAP.md` first. It defines the layer model (this AI
  owns L0 and the far-field land of L8), the procedural-first contract, the coastal catena, the
  NW-01..NW-13 review poses and the references.
- References are in `tests/artifacts/screens/landscape/references/natural_world/`. The plan maps,
  `districts.json`, `roads.json`, `shoreline.json` and `beach_points.json` are in the retained source
  package under `assets/public/landscape/coastal-city/source/`.
- Implement one deliverable at a time, using subagents with maximum reasoning. Verify and commit each
  completed deliverable before starting the next.
- `assets/` is a junction to the main checkout's shared store. Before each deliverable, confirm that the
  coastal landscape data is present. If it is missing, stop and report it; do not restore it silently.
- Use port 8002 for this worktree, never 8001. Open a renderer only for verification and captures, then
  close it.
- Put evidence under `tests/artifacts/screens/landscape/ai596/<deliverable>/`. It stays gitignored.
  Reference comparisons ship as single `[reference | before | after]` composites.
- Register offline stages as `landscape/*` leaves in the `node tools/bake.mjs` hierarchy
  (`tools/baking/README.md`, `specs/tools/bake_framework.md`). Keep validation and publication gates.
  No standalone machine-specific commands.
- Keep v2 and every published revision immutable. v3 is a new revision. Do not reopen AI 576/577.
- External tools are optional. Gaea, World Machine or Houdini heightmaps and data maps may be imported
  as provenance-tracked inputs. They must never become a runtime or mandatory build dependency. Gaea
  Community exports are capped at 1024² and are non-commercial.
- Realism comes first. Budgets may grow, but they stay accounted and measured
  (see `LANDSCAPE_AI577_SURFACES.md` for the current profiles).

## Hard plan constraints

These hold in every variant. Report any deliberate exception for user approval.

- **Districts.** Buildable district areas keep their target elevation bands (`districts.json`; the high
  city per the D1 decision). They keep slopes below 8° on the flat urban placement areas. Edges use
  designed treatments (escarpments, embankments, retaining slopes, ramps) instead of wide feathers.
- **Roads.** Every plan road keeps its network topology. It must stay drivable by a bus under a
  declared maximum sustained grade (default 6%, short sections 8%). Report actual grades. Any
  realignment needed by higher relief stays inside the plan network and is reported.
- **Shoreline.** It stays within a declared tolerance of `shoreline.json` (default ±10 m). Deliberate
  headlands or coves must be reported.
- **Beach arrival and swim beach.**
  - The beach arrival at (1090, 2.6, 490) meets the sand flush, with no boulders and no tall walls.
  - The bus-stop reservation at (1260, 2.6, 520) is kept.
  - The open-view corridor keeps a sightline to the sea.
  - The southwest swim zone keeps a clean sandy seabed.
- **Sea level and land cover.** Sea level stays Y = 0. Planning land-cover classes (urban, road, runway)
  are preserved exactly.

## Deliverables and dependencies

| Deliverable | Depends on | Usable outcome |
| --- | --- | --- |
| D1. Relief study and decision | Existing landscape | Measured diagnosis, pinned review poses, rendered relief variants and a user-approved target |
| D2. Terrain synthesis engine | D1 | Deterministic, tested operator graph producing height and geology channels on fixtures |
| D3. Finer authoritative resolution | D2 | Chosen native spacing with streaming, editing and query support proven on fixtures |
| D4. Coastal terrain v3 | D1–D3 | Published v3 terrain, geology channels and all derived products, passing constraints and targets |
| D5. Far-field surround | D4 | No visible world edge on land from flyover and aerial views |
| D6. Integrated acceptance | D5 | Regression, performance, comparisons, specs and handoff |

### D1. Relief study and decision

- [x] **Diagnose v2.** Measure natural land: slope histogram, local relief over 100 m and 500 m
  windows, curvature extremes, and drainage incision. Also measure beach cross-profiles, plateau edge
  profiles, and the angle the high city subtends from NW-01, NW-08 and NW-09. Record why the terrain
  reads flat.
- [x] **Pin the review poses.** Pin NW-01..NW-13 as a versioned pose file (XZ, eye height above ground,
  heading, pitch, FOV) that later prompts reuse. Ground height re-resolves on newer revisions.
- [x] **Render relief variants.** Produce at least three fast coarse variants:
  - v2 heights with sharpened transitions (50 m cap);
  - a raised high city near 80 m;
  - a dramatic relief closer to the original 160 m concept.

  Each variant needs a constraint report (road grades, plateau compliance), the A→B profile, slope
  statistics, a hillshade and previews at NW-01, 04, 08, 09, 10 and 11. Include composites against
  R03, R04 and the plan's topographic map.
- [x] **Declare targets.** For the chosen variant, declare measurable landform targets: slope
  distribution of natural land, escarpment heights and face slopes, number and incision of drainage
  lines, beach profile parameters (berm height, foreshore slope, nearshore bar), and bathymetry.
  Justify them against the references or real coastal analogues. (Declared per variant in the D1 record
  below; they become binding with the gate decision.)
- [x] **Gate.** The user selects a variant and approves its targets. Record the decision and date in
  this file. No later deliverable may assume a variant before this. **Decided 2026-10-09: variant B
  `relief-b-raised-80` (80 m high city, roads on the plan alignments at ≤ 6%); the B column of the declared
  targets is binding; the user left the remaining recommended steps to my judgement.**

### D2. Terrain synthesis engine

- [x] **Recipe model.** Provide a versioned, renderer-independent recipe and graph model: ordered
  operators with typed parameters, units, seeds and masks. Its identity covers the recipe and the
  input revisions. Outputs are bit-identical on repeat runs, consistent across tile halos, and kept
  within documented working-set limits, with progress and cancellation.
- [x] **Operators.** Support these capabilities:
  - plan-constraint inputs;
  - landform primitives (plateau or mesa with escarpment, hills and ridges, valleys, headlands and
    coves);
  - world-anchored warping and multi-scale noise;
  - landscape-scale fluvial erosion over a drainage network, plus detail-scale hydraulic erosion;
  - thermal weathering with talus;
  - sediment transport and deposition;
  - lithology-driven strata and terraces;
  - coastal processes: bluff retreat with a wave-cut platform, an equilibrium beach profile with
    berm and swash zone, foredunes, nearshore bars, and rocky reefs off headlands;
  - constraint re-imposition with designed edge profiles;
  - selectors by slope, curvature, height, flow and distance.
- [x] **Geology channels.** Output the geology and erosion channels of roadmap layer L0, with exact
  renderer-independent samplers: bedrock surface, regolith depth, deposit type and thickness,
  lithology/strata index, wear, deposition, flow and drainage, face mask, coastal zone class, and wave
  exposure.
- [x] **Interchange.** Import and export heightmaps and masks (16/32-bit PNG, EXR, RAW) with coordinate
  metadata and provenance. An imported map can replace a stage's output.
- [x] **Tests.** Cover erosion mass balance, talus-angle convergence, determinism, constraint
  preservation, tile-seam equality and interchange round trips. Add review images per operator.
- [x] **Gate.** A synthetic 1 × 1 km fixture with a plateau, a road and a shoreline erodes into
  convincing relief. It must meet its declared constraints, be deterministic and be seam-free.

### D3. Finer authoritative resolution

- [x] **Compare spacings.** Compare 1.953 m, about 0.98 m and about 0.49 m native spacing for generated
  terrain. Measure visible gain at the review poses (ridges, gullies, berms, bluff crests), data size,
  hierarchy depth, CPU and GPU residency, uploads, compile and frame cost, and query, edit and picking
  accuracy.
- [x] **Extend contracts.** Extend the model, import, hierarchy, streaming, editing and query contracts
  to the chosen spacing. Use explicit provenance: "procedurally synthesized, not measured". Upsampling
  never counts as new source detail. Older revisions stay readable.
- [x] **Gate.** A synthetic high-resolution fixture streams within the declared budgets. Nothing is
  fetched at full resolution on startup. Edits, queries and picking are exact at the new spacing. Record
  the choice with its measurements.

### D4. Coastal terrain v3

- [x] **Generate v3.** Use the approved variant and spacing. The terrain must include:
  - a legible high city: plateau, rims and escarpments, with ramps where roads climb;
  - hills and valleys with drainage, and gullies;
  - the coastal bluff sector with layered faces, talus and a wave-cut platform (R10);
  - beach profiles with berm and foreshore slope;
  - foredunes where space permits;
  - natural bathymetry with bars, reefs off the bluff, and the clean sandy swim zone;
  - seasonal creek beds or ponds where hydrology demands them.
- [x] **Derive land cover.** Derive natural land cover (sand, grass and scrub, forest soil, rock) from
  the geology and record the derivation recipe. Keep planning classes exact. Report every class change.
- [x] **Publish.** Publish through the registered leaves: terrain, hierarchy, appearance bindings,
  terrain fields, surface detail, natural inference, and the new geology channels (versioned, with GLSL
  mirrors where rendering needs them).
  - Re-pin the coastal city fixture deliberately.
  - Editing, reports and revert must work on v3.
  - Explicit local edits must survive regeneration in a documented evaluation order.
- [x] **Gate.** All hard constraints and D1 targets pass in a measured report. Provide matched
  before/after captures at every review pose and composites against R03, R04, R07, R10 and the plan.
  The user reviews them visually.

### D5. Far-field surround

- [ ] **Surround.** Add a render-only surround beyond the 4 km extent out to the horizon: continuing
  coastline and headlands, and inland hills consistent with v3's style. It is not authoritative, not
  editable, and picking reports it as outside the landscape. There must be no visible seam at the
  boundary. Coordinate the sea surface with AI 597.
- [ ] **Gate.** NW-10, NW-11 and the existing flyover route show no world edge on land. Measure the cost
  and account for it in the budget.

### D6. Integrated acceptance

- [ ] **Regressions.** Run all landscape Node and browser suites in both surface-cache modes. Also run
  editing, reports and revert on v3, plus cold and warm loads.
- [ ] **Flyover.** Re-render the flyover on the same route as
  `tests/artifacts/screens/landscape/flyover/` and compare it with the original.
- [ ] **Performance.** Record same-condition performance and residency tables against the v2 baseline.
- [ ] **Specs and handoff.** Update the specs: model, import (or a new `LANDSCAPE_TERRAIN_SYNTHESIS.md`),
  hierarchy, streaming, terrain fields, handoff, and the roadmap status. Write a handoff listing the
  channels later prompts consume.

## Evidence and measurements

- **Composites.** Use real renderer captures at the pinned review poses with matched cameras, plus
  hillshade, slope and profile plots and statistics JSON. Composites pair the user's references and the
  plan with before and after.
- **Performance.** Report frame time, FPS, GPU time, draws, triangles, controlled CPU and estimated GPU
  bytes, upload and load behaviour. State hardware, browser, viewport, warm-up, sample count and the
  statistics used. Mark missing metrics as not measured, with a reason. Projections are not results.
- **Determinism and seams.** Provide determinism hashes, seam checks and constraint reports for every
  published product.

## Research basis

- Galin et al., [A Review of Digital Terrain Modeling](https://diglib.eg.org/handle/10.1111/cgf13657), 2019.
- Cordonnier et al., [tectonic uplift and fluvial erosion](https://hal.archives-ouvertes.fr/hal-01262376), 2016; [analytical erosion](https://diglib.eg.org/handle/10.1111/cgf15033), 2024.
- Gaea [erosion data maps](https://docs.quadspinner.com/Guide/Using-Gaea/Erosion.html), [build swarm](https://docs.quadspinner.com/Guide/Build/Swarm.html), [licensing](https://quadspinner.com/Support/FAQ/Licensing).
- Houdini [heightfield erosion](https://www.sidefx.com/docs/houdini/heightfields/erosion.html) and [layers](https://www.sidefx.com/docs/houdini/heightfields/layers.html).
- Bosboom and Stive, [cross-shore profile](https://geo.libretexts.org/Bookshelves/Oceanography/Coastal_Dynamics_(Bosboom_and_Stive)/01%3A_Overview/1.04%3A_Examples_of_engineering_applications/1.4.2%3A_Cross-shore_profile).

## Completion record

Record each deliverable here when it passes: a summary, spec and source locations, validation results,
measurements, limitations and artifact paths.

### D1 relief study — delivered 2026-10-09 (gate pending)

**Summary.** The D1 subset of the terrain synthesis engine (recipe model, executor, plan inputs,
landform primitives, warps and noise, designed-edge plateaus, network-graded roads, shoreline, beach-point
and runway constraints, height cap and resample), the measurement and review-image modules, the saved
landscape writer, the pinned review poses with the matched-camera capture tool and the
`landscape/synthesis/relief-study` bake leaf were built. The retained v2 terrain was diagnosed, NW-01..NW-13
were pinned and captured on v2, and three relief variants were synthesized from committed recipes,
measured against every hard plan constraint, rendered as hillshades, slope, relief and elevation maps,
profiles and histograms, published as saved variant landscapes and captured at every review pose.

**Spec and source.** `specs/landscape/LANDSCAPE_TERRAIN_SYNTHESIS.md` (contract, D1 results);
`src/app/landscape/LandscapeSynthesisRecipe.js`, `LandscapeSynthesisOperators.js` (pure recipe model);
`tools/bake_landscape/terrain_synthesis/` (engine, analysis, review, landscape writer, `relief_study/` leaf and
recipes, README); `tools/landscape_review/` (poses `poses/natural-world-v1.json`, `ReviewPoses.mjs`,
`capture.mjs`, `composite.py`, README; registered in `PROJECT_TOOLS.md`).

**Validation.** Node suites `landscape_synthesis_recipe` (5), `landscape_synthesis_graph` (12),
`landscape_synthesis_analysis`, `landscape_synthesis_review`, `landscape_synthesis_png`,
`landscape_synthesis_landscape`, `landscape_synthesis_framework` (2) and `landscape_review_poses` (5): 57
tests pass together with `landscape_terrain_fields_framework` and `bake_framework`. Determinism: two runs of
every recipe produce identical SHA-256 heights and statistics (test and engine report); the engine frees every
tracked array on cancellation. The relief-study leaf plans alone, needs no executable and stays out of `all`
and the `landscape` import parent (`node tools/bake.mjs --target landscape/synthesis/relief-study --dry-run`).

**v2 diagnosis** (`tests/artifacts/screens/landscape/ai596/d1/diagnosis/`, natural land = cover 1–4 above
sea level, 2,335,907 samples):

| Measure | v2 |
| --- | --- |
| Slope bins 0–2 / 2–5 / 5–10 / 10–15 / 15–20 / 20–30 / 30–45 / 45+ ° | 73.7 / 16.4 / 7.1 / 2.3 / 0.5 / 0.06 / 0.00 / 0 % |
| Slope p50 / p90 / p99 / max | 1.15 / 4.96 / 13.65 / 33.68° |
| Local relief over 100 m: mean / p90 / max | 4.1 / 10.0 / 20.2 m |
| Local relief over 500 m: mean / p90 / max | 14.2 / 25.5 / 39.2 m |
| Curvature (σ 2 samples) profile p1 / p99 | −0.0083 / +0.0074 m⁻¹ (about 135 m radius) |
| Drainage (A ≥ 20,000 m²) | 155 km of channel samples in 157 networks, incision mean 0.86 m, p90 2.29 m (road-shoulder troughs) |
| Beach transects Z 490 / 1500 / 2000 / 2600 / 3200 | foreshore 1.6–1.8°, sand 77–99 m, no berm; first rise above 3 m at +59–61 m, 12.6–15.2° over the next 20 m |
| High-city rim from the centroid (W / SW / S / N over 700 m) | drops 18.6 / 20.0 / 14.3 / 18.9 m, steepest 7.8 / 6.7 / 3.2 / 10.3°, mean 1.2–1.6° |
| High city subtended from NW-01 / NW-08 / NW-09 | 0.79 / 1.76 / 1.11° (0.42 / 0.02 / 1.68° below the foreground skyline) |
| A→B route (5,172 m) | 2.6 → 48.5 m, max 2.58% over 20 m |
| Plan constraints | roads pass (max 2.54% / 2.49%), shoreline max deviation 2.6 m, beach arrival 2.600 m flat, bus stop flat, corridor sightline open, swim zone sand, planning cover exact; only district 7 fails its 2–3 m band (p95 4.78 m, the plan's own graded approach) |

Why it reads flat: nine tenths of natural land is below 5°, nothing exceeds 34°, the 100 m relief is a few
metres, there are no gullies or breaks in slope (the only incision is the road-shoulder trough), the beach is a
1.6° ramp without berm or dune, and the plateau rim is a 150 m smoothstep whose crest never rises above the
skyline of the foreground from any pose.

**Pinned poses** (`tools/landscape_review/poses/natural-world-v1.json`, heading 0 = north, 90 = east, pitch
negative down, FOV 55, look distance 100 m; v2 ground in the notes): NW-01 (1090, 490) eye 1.7 hdg 340 pitch −3;
NW-02 (1260, 700) 1.7 / 270 / −3; NW-03 (1228, 2600) 1.7 / 20 / −4 (15 m seaward of the measured bluff toe);
NW-04 (1322, 2400) 1.7 / 250 / −8 (moved 78 m west of the roadmap point onto the bluff crest bench);
NW-05 (2600, 450) 1.7 / 45 / −3; NW-06 (2074, 3316) 1.7 / 180 / −3 (moved 574 m: the north forest has no
clearing in the plan, this is the nearest forest edge; re-pin once an ecosystem revision adds clearings);
NW-07 (3300, 2740) 1.7 / 30 / −2 (uphill gradient); NW-08 (2600, 2200) 1.7 / 45 / 0; NW-09 (1000, 1500)
altitude 1.5 / 90 / 0; NW-10 (900, 1200) altitude 25 / 45 / −10; NW-11 (−400, 2000) altitude 800 / 90 / −30;
NW-12 (1152, 1800) altitude 1.0 / 0 / −6 (18 m west of the roadmap point, on the swash); NW-13 the viewer's
overview camera (4400, 3000, −2300) → (2000, 0, 2000). v2 "before" captures: `d1/poses/v2/` (13 frames,
1920×1080, contact sheet, receipts with the resolved ground and settle state).

**Relief variants** (recipes `tools/bake_landscape/terrain_synthesis/relief_study/recipes/`, synthesized on the
native 2049² grid in 68–71 s each, published as `assets/public/landscape/coastal-city-ai596-<variant>/` with the
canonical appearance and re-baked fields, captured at all 13 poses in 75–77 s per variant; natural land only):

| Measure | v2 | A `relief-a-v2-sharpened` | B `relief-b-raised-80` | C `relief-c-dramatic-160` |
| --- | --- | --- | --- | --- |
| High city / cap | 49 / 50 m | 49 / 50 m | 80 / 90 m | 160 / 170 m |
| Slope p90 / p99 / max | 4.96 / 13.65 / 33.7° | 4.40 / 15.0 / 66.8° | 6.00 / 18.3 / 73.2° | 12.40 / 32.3 / 86.3° |
| Share > 10° / > 20° | 2.8 / 0.06% | 3.1 / 0.53% | 3.1 / 0.92% | 16.2 / 3.72% |
| Relief p90 over 100 / 500 m | 10.0 / 25.5 m | 10.4 / 25.3 m | 12.5 / 43.5 m | 28.9 / 107.0 m |
| High city subtended from NW-01 / NW-08 / NW-09 | 0.79 / 1.76 / 1.11° | 0.80 / 1.79 / 1.04° | 1.35 / 3.70 / 1.71° | 2.78 / 8.60 / 3.45° |
| A→B climb / max 50 m grade | 46.1 m / 2.50% | 50.5 m / 5.80% | 79.7 m / 5.80% | 158.2 m / 7.80% |
| Roads: sustained / short maxima | 2.49 / 2.54% | 5.80 / 5.81% | 5.80 / 5.81% | 7.80 / 7.81% (the two ascents; everything else ≤ 5.8%) |
| Shoreline max deviation | 2.6 m | 2.6 m | 2.6 m | 2.6 m |
| Constraint report | district 7 band only | district 7 band only | district 7 band only | district 7 band only; roads pass under the declared 8% exception |

Hills in A are ±8 m ridged relief at 600–38 m wavelengths, in B ±14 m, in C ±28 m plus a 125 m massif dome
(700 m feather) under the crest; the escarpment faces are 12 m at 50° (A), 25 m at 55° (B) and 40 m at 60° (C)
over a 33° talus on an extrapolated base; the west cliff is the same 65° cut 115 m landward of the shoreline in
all three (12–20 m high depending on the terrace).

Evidence (`tests/artifacts/screens/landscape/ai596/d1/`): `diagnosis/` (v2 maps, profiles, histogram, JSON and
Markdown), `variants/<name>/` (recipe copy, engine report, diagnosis, hillshades, slope, relief, elevation and cover
maps, beach/route/rim profiles, histogram, landscape receipt), `poses/{v2,<name>}/` (13 captures each with
receipts), `composites/pose-NW-01..13.png` (v2 | A | B | C per pose), `composites/<name>-R03.png`,
`-R04.png`, `-plan.png`, `-concept.png`, `-coast-NW-04.png` ([reference | before | after]), `hillshades.png`,
`slope-maps.png`, `profiles-route-ab.png`, `profiles-beach.png`, and `relief-study.json` (the leaf receipt).

**Declared targets** (measurable; the gate binds the chosen column):

| Target | Why | B raised 80 m | C dramatic 160 m |
| --- | --- | --- | --- |
| Natural-land slope share > 10° / > 20° / > 30° | R03, R07 and the concept crest show flanks of 25–40° with rock faces; v2 has 2.8 / 0.06 / 0 % | ≥ 10 / 3 / 1 % | ≥ 25 / 6 / 2 % |
| Steepest natural slope (face mask beyond it) | bluffs and rims need near-vertical rock (R10, coast_2) | ≥ 65° | ≥ 70° |
| Local relief p90 over 100 m / 500 m | the references read at 10–500 m: ridges, gullies, escarpments | ≥ 14 / 40 m | ≥ 25 / 90 m |
| High-city rim: face height and slope, talus | a legible plateau (concept "rocky crest"); talus at the angle of repose | 20–30 m at 55–65°, talus 30–35° | 35–45 m at 60–70°, talus 30–35° |
| West cliff (bluff band 55–120 m from shore) | the concept's west cliff +20 → +3 m; R10 layered bluff over a platform | 10–16 m face at 60–75°, platform 20–40 m at +0.5…+1.5 m | 12–18 m face at 60–75°, same platform |
| Drainage | R04: dendritic gullies, alluvial fans | ≥ 8 lines with ≥ 3 m incision; p90 ≥ 2.5 m | ≥ 12 lines with ≥ 3 m incision, two ≥ 8 m; p90 ≥ 3.5 m |
| Beach profile | Bosboom & Stive fine-sand foreshore 1:15–1:30; coast_1/coast_3 berm and foredune | berm 1.5–2.0 m at 25–40 m from the waterline, foreshore 1.9–3.8°, foredune 3–6 m where space permits (never in the view corridor) | same |
| Bathymetry | Dean equilibrium profile A = 0.10–0.14 m^⅓ (fine sand) to −8 m, then 1.5–2.5° to −30 m; bar crest −2…−3 m at 60–120 m; reef off the bluff sector at −1…−4 m | same | same |
| High city above the foreground skyline from NW-08 / NW-01 / NW-09 | the user must recognize the high city from the centre and the beach | ≥ 3.5 / 1.3 / 1.7° | ≥ 8 / 2.5 / 3.0° |
| Roads | the plan's 6% sustained, 8% short sections | 6% everywhere | 6% everywhere except the two high-city ascents at ≤ 8% on the plan alignments (or switchbacks inside the corridor, a D4 realignment) |

Variant A (`v2-sharpened`, 50 m cap) keeps v2's relief targets except the escarpment (12 m face at 50°) and
the west cliff (10–15 m); it is the minimum-change option and does not meet the legibility target from the
beach (0.8° from NW-01).

**Limitations.** Variants are relief studies, not v3: no erosion, strata, talus geometry, beach profile or
bathymetry yet (D2/D4), so hills are ridged noise and the bluff is a planar cut to the sand level; the massif
of B/C is a smoothstep dome; roads crossing the dome leave a 45 m cut-and-fill bench (the ramps of D4); the
beach-arrival district fails its 2–3 m band exactly as the plan does; the plan's two ascents cannot reach a
160 m crest below about 7.1% on their alignments; a few road stations inside districts report anchor
conflicts where a district plane meets a node outside it (resolved to the band midpoint, grades still pass);
near-vertical heightfield faces render as planar walls with horizon-shadow banding (NW-07), which the D2 face
mask and the L3 rock geometry of AI 602 address, not the terrain.

### D1 decision — 2026-10-09

**Decided: variant B `relief-b-raised-80`.** The user chose B on 2026-10-09 and left the other recommended
steps to my judgement. Consequences: the high city is an 80 m plateau (band 79–81 m) with a 25 m escarpment
face at 55° over a 33° talus; every plan road stays on its alignment under the 6% sustained rule (5.8% in the
recipes, no switchbacks); the B column of the declared targets below is binding for D4; the dramatic
160 m recipe stays in the repository as a study artifact only.

The decision request as it was put (kept for the record):

1. **Variant.** C `relief-c-dramatic-160` matches the original concept (the +160 m crest, the east hill rising
   from +20 m, the west cliff) and is the only variant that makes the high city read from the beach and the
   water (2.8° from NW-01, 3.5° from NW-09, 8.6° from the low city); B `relief-b-raised-80` keeps the plan's
   6% roads unchanged and still doubles the plateau's presence; A keeps the 50 m cap and only sharpens the
   edges. Recommendation: C.
2. **Road treatment for C.** Either accept 7.8–8% on the two high-city ascents on their plan alignments (the
   8% short-section rule stretched to the whole climb), or let D4 realign the ascents with switchbacks inside
   the plan corridor to keep 6% (the north ascent needs about 2.3 km of road for 138 m of climb; it has
   1.96 km). Recommendation: switchbacks in D4 (the concept art shows them), keeping 6%.
3. **Targets.** The C column of the declared targets (or the B column) becomes binding.

D2 (the engine's erosion, geology, coastal and interchange operators on synthetic fixtures) and D3 (the
resolution study on fixtures) do not depend on this choice and proceed; D4 waits for it.

### D2 terrain synthesis engine — delivered 2026-10-09

- **Recipe model.** `landscape-synthesis-recipe` v1 (`src/app/landscape/LandscapeSynthesisRecipe.js`,
  `LandscapeSynthesisOperators.js`): 31 operators in 8 families with typed parameters (units, ranges,
  defaults, nullable objects), masks from selectors (slope, curvature, height, flow, distance, cover,
  polygon, district), per-operator seeds, the identity `synthesis-<24 hex>` over the canonical recipe and
  the input hashes, overrides (import, region, operator re-run, exclude), progress, cancellation and the
  tracked working-set ledger. Repeat runs are bit identical (gate check `determinism`).
- **Operators.** inputs `import-heights`, `plan-inputs`, `import-map`; landforms `landform-plateau`,
  `landform-hills`, `landform-valley`, `landform-headland`, `landform-cove`; warps `warp`, `noise`; erosion
  `fluvial-erosion` (Braun & Willett 2013 implicit stream power over Priority-Flood routing with Quinn
  contributing areas, hillslope diffusion, retain-target uplift, hardness-scaled erodibility),
  `hydraulic-erosion` (Beyer 2015 droplets, reported mass balance), `thermal-weathering` (Musgrave 1989,
  repose settling into talus and colluvium), `sediment-deposit` (transport-limited routing with ponds,
  fans and valley floors); geology `strata` (dipping layered stack → lithology and hardness), `terraces`;
  coastal `coastal-exposure`, `coastal-bluff` (retreat, face, wave-cut platform, talus wedge),
  `coastal-beach` (Dean 1991 equilibrium profile, 1:N foreshore, berm, backshore), `coastal-foredune`,
  `coastal-nearshore`, `coastal-reef`; constraints `constrain-districts`, `constrain-roads`,
  `constrain-shoreline`, `constrain-points`, `constrain-runway`, `height-cap`; output `geology-channels`,
  `export-map`, `resample`. Every erosion and coastal operator moves the surface through the geology
  ledger `height = bedrock + regolith + depositThickness` (gate residual 1.9e-6 m).
- **Geology channels.** `landscape-geology` v1 (`src/app/landscape/LandscapeGeology.js`,
  `LandscapeGeologyPayload.js`, GLSL mirror `src/graphics/shaders/chunks/landscape/geology.glsl`): two
  RGBA8 field layers (bedrock offset, regolith, deposit thickness, wear; deposition, flow, wave exposure,
  face mask) and one categorical uint8 page per chunk (deposit type, lithology, drainage, coastal zone),
  content-addressed pages, candidate preparation and validation (page borders and halos) and
  manifest-last publication (`tools/bake_landscape/terrain_synthesis/geology/`).
- **Interchange.** RAW float32, PNG 8/16-bit and OpenEXR float32 maps with `<file>.meta.json` sidecars
  (frame, row order, sha256, provenance = recipe identity); `import-map` replaces a stage's output under a
  mask; the gate re-imports its own EXR export with 0 differences.
- **Tests.** 84 tests in 12 suites pass in 7.8 s (`node --test tests/node/unit/landscape_synthesis_*.test.js
  tests/node/unit/landscape_review_poses.test.js`): erosion mass balance and invariant, talus-angle
  convergence, determinism, constraint preservation, tile-seam equality, interchange round trips, geology
  page validation, recipe validation, leaf registration. Review images per operator:
  `tests/artifacts/screens/landscape/ai596/d2/fixture/operators/NN-<id>.png` and the sheet `operators.png`.
- **Gate.** `node tools/bake.mjs --target landscape/synthesis/fixture` (leaf `landscape/synthesis/fixture`,
  recipe `tools/bake_landscape/terrain_synthesis/fixture/recipes/plateau-road-shoreline.json` on the
  analytic 1 × 1 km base, 513² at 1.953125 m) passes 18/18 checks; receipt
  `tests/artifacts/screens/landscape/ai596/d2/fixture/fixture-gate.{json,md}`, maps beside it.

| Check | Measured | Target |
| --- | --- | --- |
| determinism | identical hashes of the heights and all 26 layers on two runs | bit identical |
| plateau band (district 1) | p05 36.0 / p95 36.0 m, 99.98% flat | 35–37 m, ≥ 95% flat |
| plaza band (district 2) | p05 2.56 / p95 2.65 m | 2.3–3.3 m |
| roads | sustained 5.82%, short 5.86% | ≤ 6% sustained, ≤ 8% short |
| shoreline | 39.1 m at the 16 headland vertices (reported by the headland operator), the rest within tolerance | 10 m |
| beach arrival, bus stop, view corridor, swim zone, sea level, cover | pass | plan rules |
| relief | 14.0% of land above 10°, 4.1% above 20°, max 81.5°; incision p90 12.5 m; relief p90 18.2 m over 100 m | ≥ 12%, ≥ 3%, ≥ 60°, ≥ 1 m, ≥ 8 m |
| geology invariant | max residual 1.9e-6 m | ≤ 1e-3 m |
| coastal zones | reef, bar, swash, berm, foredune, platform, bluff face present | required classes |
| interchange | EXR export re-imported with 0 differences | 0 |
| seams | standalone saved landscape (5 chunks, level 1) and validated geology candidate | seam free |

Timings on the native 513² grid in one Node process: the whole recipe 9.6 s (fluvial 150 iterations 5.4 s,
hydraulic 30,000 droplets 0.44 s, thermal 30 iterations 0.21 s, sediment 0.17 s, every other operator
≤ 0.7 s); on the 1025² unit fixtures fluvial takes 5–16 s, hydraulic 2.2 s per 200,000 droplets, thermal
1.7 s and sediment 0.9 s. Peak tracked working set 32 MB.

Recipe lessons (also in the spec): the corridor descent runs before the plaza re-imposition and the road
fit; `sediment-deposit` takes 10% of the accumulated wear as supply; the bluff talus is 10% of the cut
volume; broad ridged hills (500–60 m octaves, ±24 m) with fluvial incision at retainRate 0.003 read as
eroded ground, fine octaves plus heavy diffusion read as a blurred plain.

Limitations carried forward: `inputs.plan.landCover` PNG decoding in `plan-inputs` is not implemented
(cover comes from the imported landscape or the base); the fixture landscape carries no planning
references or appearance, so it is reviewed through its maps (hillshade, slope, zones, deposits,
drainage, profiles), not in the game viewer; D4 adds the city-scale recipe and the viewer captures.

### D3 finer authoritative resolution — delivered 2026-10-09

- **Compare spacings.** Leaf `landscape/synthesis/resolution-study` (`tools/bake_landscape/terrain_synthesis/resolution_study/`)
  synthesizes the D2 gate recipe at 1.953125 / 0.9765625 / 0.48828125 m (fixture base and gate parameterized by spacing;
  recipes `plateau-road-shoreline{,-0977,-0488}.json`) plus a 4 km pair at the city's node counts (`city-extent-{1953,0977}.json`,
  `--set "landscape/synthesis/resolution-study:city-extent=true|only"`), measures size, depth, cost, memory, relief,
  landform agreement, feature sharpness (bluff face, berm crest, gully width, ridge crest curvature) and needles, and
  renders `[1.953 | 0.977 | 0.488]` composites. Browser harness `tests/headless/e2e/landscape_resolution.pwtest.js`
  (fixture poses `tools/landscape_review/poses/ai596-d3-fixture-v1.json` F-01..F-08, matched captures and composites
  under `tests/artifacts/screens/landscape/ai596/d3/{poses,composites}/`) measures startup, residency, uploads, compile,
  frame and GPU cost, settle time, picking and query accuracy per fixture.
- **Extend contracts.** `procedural-synthesis` provenance with the statement "procedurally synthesized, not measured"
  and `sourceSpacingMeters` / `upsampled` (upsampling never counts as source detail); model, import, hierarchy, streaming,
  editing (smooth radius 16 samples below 1.5 m spacing) and query (radius span/2, viewer bound from the manifest)
  contracts extended; sidecar manifests 1 MiB; older revisions load unchanged (coastal v2 validated read-only; 548
  landscape unit tests pass, `node --test tests/node/unit/landscape_*.test.js`).
- **Gate.** The 0.977 m fixtures stream within the shipped budgets with nothing native fetched before the first frame;
  edits, queries and picking are exact at the new spacing (tables below); the choice is recorded with its measurements
  in `specs/landscape/LANDSCAPE_TERRAIN_SYNTHESIS.md` (D3 section).

Decision: **0.9765625 m native spacing** for synthesized terrain (the 4 km city as 4097², maxLevel 4, 341 nodes, 250 m
chunks; the 1 km fixtures as 1025²), recorded with the measurements below. 1.953125 m reads the designed coastal edges
5–10° too shallow (the 65° bluff face measures 53° at 1.953 m and 59–64° at 0.977 m), broadens the berm crest 2.7×
(radius 70.8 → 25.8 m) and widens gullies by about 10%, so the roadmap's 2–4 m features (rills, ledges, berms, crest
lines) need the finer grid; 0.48828125 m adds little beyond 0.977 m on the designed edges (the berm is identical, the
bluff face within 0–6°), costs 4× the data and 3.2–4.6× the synthesis time of 0.977 m per km², and over the 4 km city
(8193², 1365 nodes) its measured-hierarchy manifest is 1,762,795 bytes, above the 1 MiB limit every bounded reader
enforces, so it stays a fixture-only spacing until a smaller per-node record or a split index exists.

| Measure | 1.953125 m (513², L1, 5 nodes) | 0.9765625 m (1025², L2, 21 nodes) | 0.48828125 m (2049², L3, 85 nodes) |
| --- | --- | --- | --- |
| saved landscape (by manifest / on disk) | 1.60 MB / 1.60 MB (12 files) | 6.68 MB / 6.30 MB (38 files) | 26.99 MB / 24.28 MB (129 files) |
| synthesis seconds (one Node process) | 9.1 | 46.7 | 177.2 |
| peak tracked memory | 31.12 MB | 124.25 MB | 496.49 MB |
| ancestor max geometric error by level | L0 3.67 m | L0 5.73 m, L1 4.97 m | L0 6.30 m, L1 5.41 m, L2 3.90 m |
| natural slope above 10 / 20 / 30° | 13.77% / 3.73% / 2.50% | 12.79% / 3.43% / 2.62% | 11.90% / 3.32% / 2.72% |
| incision p50 / p90 / max | 4.57 / 8.25 / 16.74 | 4.61 / 10.33 / 16.73 | 4.13 / 11.52 / 16.61 |
| shared vertices within 0.5 / 1 / 3 m of the 1.953 m result | reference | 97.23% / 99.23% / 99.94% | 93.83% / 98.57% / 99.89% |
| needles (one-sample spikes > 2 m) | 0 / 0 | 0 / 0 | 0 / 0 |
| bluff face, tallest coastal steps (B-965 / B-55): mean slope of the ≥ 40° face | 52.8° / 53.4° (2.0 m runs) | 58.5° / 52.6° (1.5–1.75 m) | 58.9° / 59.2° (1.25–1.5 m) |
| B-965 steepest 1 m slope (designed face 65°) | 54.5° | 64.0° | 63.4° |
| berm crest radius T-300 / T-700 | 70.8 / 51.4 m | 25.8 / 22.8 m | 25.8 / 22.8 m |
| gully width 1 m above the floor, mean / median | 36.3 / 37.5 m | 33.4 / 34.5 m | 34.5 / 35.0 m |
| ridge crest radius R1..R6 (re-centred) | 50 / 58 / 78 / 65 / 50 / 127 m | 52 / 76 / 75 / 66 / 52 / 109 m | 57 / 86 / 77 / 71 / 55 / 120 m |

| Measure | 4 km, 1.953125 m (2049², L3, 85 nodes) | 4 km, 0.9765625 m (4097², L4, 341 nodes) |
| --- | --- | --- |
| saved landscape (by manifest / on disk) | 26.99 MB / 22.77 MB (105 files) | 108.25 MB / 90.11 MB (396 files) |
| synthesis seconds (reduced recipe, fluvial 40 iterations) | 60.5 | 253.6 |
| peak tracked memory | 348.37 MB | 1392.74 MB |
| ancestor max geometric error by level | L0 8.34 m, L1 5.95 m, L2 3.24 m | L0 6.20 m, L1 6.00 m, L2 4.30 m, L3 3.39 m |
| natural slope > 10 / > 20°, p90 / p99 / max | 12.16% / 0.81%, 10.55 / 18.51 / 66.3 deg | 11.98% / 0.67%, 10.50 / 17.74 / 71.1 deg |
| manifest.json (exact, measured-hierarchy, limit 1 MiB) | 114,074 B | 443,246 B (1365 nodes at 0.488 m: 1,762,795 B, over) |
| terrain-fields / geology sidecar manifests (exact; limit 1 MiB since D3, was 256 KiB) | 78,864 / 75,553 B | 246,836–293,636 / 283,435 B (1365 nodes: 899,938–1,126,866 / 1,116,668 B) |
| hierarchy preparation native reads | 448 | 2,304 (1365 nodes: 11,264) |

Browser (shipped profile 512/448 MiB, surface cache on, 1920x1080 DPR 1 (drawing buffer 1920x1056), Chromium 151.0.7922.34, NVIDIA GeForce RTX 3060 through ANGLE/D3D11, AMD Ryzen 5 9600X 6-Core Processor; 30 warm-up + 120 sampled frames per stop; route overview from the sea, 30-frame approach to the bluff crest, gully close pose, top-down orthographic close view over the probe patch, return to the overview; all runs vsync-bound at 16.7 ms median frame interval):

| Fixture | Startup natives before the first frame / by settled | Peak controlled CPU / estimated GPU | Upload max per frame / route | GPU ms median / p95 | Max triangles (draws) | Settle ms bluff / gully / ortho | 1.5 px geometry target | Picking max error (level) | Queries exact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1953 (513², L1, 5 nodes) | 0 / 0 of 4 | 33.6 / 189.8 MiB | 3.51 / 14.03 MiB | 2.85 / 3.65 ms | 534,702 (7) | 200 / 196 / 199 | met at every stop | 6e-14 m (L1) | 64/64 |
| 0977 (1025², L2, 21 nodes) | 0 / 0 of 16 | 113.7 / 242.4 MiB | 3.51 / 108.70 MiB | 3.81 / 5.90 ms | 2,132,142 (19) | 600 / 496 / 487 | met at every stop | 6e-14 m (L2) | 64/64 |
| 0488 (2049², L3, 85 nodes) | 0 / 0 of 64 | 279.6 / 351.1 MiB | 3.51 / 462.84 MiB | 5.53 / 6.85 ms | 5,327,022 (43) | 2501 / 5897 / 1998 | met at every stop | 6e-14 m (L3) | 64/64 |
| 4km-1953 (2049², L3, 85 nodes) | 0 / 0 of 64 | 275.6 / 351.2 MiB | 3.51 / 476.87 MiB | 5.66 / 6.49 ms | 4,528,302 (37) | 3000 / 5884 / 3492 | met at every stop | 6e-14 m (L3) | 64/64 |
| 4km-0977 (4097², L4, 341 nodes) | 0 / 0 of 256 | 424.2 / 445.8 MiB | 3.51 / 788.93 MiB | 4.33 / 6.48 ms | 6,924,462 (55) | 6901 / 12088 / 8396 | missed at approach-bluff (gpu-budget) | 8e-14 m (L4) | 64/64 |

Every fixture disposed to zero controlled CPU/GPU bytes; uploads never above 3.51 MiB per frame (cap 8); no native height payload was requested before the first covered frame on any fixture; 1953, 0977, 0488, 4km-1953 met the 1.5 px geometry target at every stop; 4km-0977 missed it at approach-bluff (gpu-budget). The fixtures carry no appearance or terrain-fields sidecars, so they render fallback soil colors (viewer error "[Landscape] appearance manifest HTTP 404") and PBR materials and generated surface detail are not measured; picking and query probes use the gully D patch at world x 430-471, z 135-166 m on every fixture, and the 4 km routes use the 1 km poses scaled onto their bounds.

Edit and query gate on the published 0.977 m and 0.488 m fixtures (copies under `.../d3/editing/<tag>/`, one batch =
grade with 6 m linear falloff + 7 m smooth at strength 0.5 + a sand soil override on a ~60 m hexagon straddling four
natives at (500, 500), through the Node authoring store): every changed native sample equals the independently
recomputed designed height (1,056,784 / 1,056,784 at 0.977 m, 4,227,136 / 4,227,136 at 0.488 m), every ancestor's
aligned samples equal the native float32 bits (330,245 and 1,387,029 samples) with conservative errors, all shared
borders identical (7,196 / 35,980 samples), apply 0.69 / 1.19 s and revert 0.14 / 0.54 s restore the pre-edit
manifest and channels bit for bit; `sampleLandscapeChunk` equals the stored float32 at 1,000 random native vertices
and the NW-SE triangle formula at 1,000 random cell centres on both.

Costs accepted with 0.977 m over the city (the 4 km fixtures measure them at the real node count): ≈ 108 MB per saved
revision (plus the terrain-fields and geology sidecars), synthesis ≈ 4.3 min for the reduced 4 km recipe and ≈ 10–12 min
projected for the full city recipe (150 fluvial iterations at 2.4× the 40-iteration cost), peak tracked synthesis memory
1392.74 MB in one process (above the fixture's 1 GiB working limit: the D4 recipe declares a larger limit or tiles the
erosion), the fields and geology bakes' full-grid assembly ≈ 1.5 GB (above their 768 / 512 MiB limits: streamed assembly
is a D4 prerequisite), hierarchy preparation 5–7 s (2,304 native reads), the appearance pages re-baked (the binding key
covers the grid), and the surface-detail recipe re-derived (the viewer's `50cm` / `25cm` modes count levels below a
1.953 m native grid; at 0.977 m the same spacings are one level fewer).

Limitations recorded: the fixture landscapes carry no appearance or terrain-fields sidecars (the viewer draws fallback
soil colours and reports the missing appearance; `capture.mjs --allow-missing-appearance on`), so the browser numbers
exclude PBR materials and surface detail; the 4 km fixtures run a reduced recipe without plan constraints (budget
evidence at the city's node count, not the v3 content); warm/reload runs were not measured; the updated authoring e2e
constants were smoke-tested in the browser, not run as Playwright. The engine defect the study exposed (one-sample
needle deposits of `sediment-deposit`, `terraces`, `hydraulic-erosion` and `thermal-weathering`, 39 → 162 → 577 per km²
with resolution and up to 135 m on the 4 km pair) is fixed by the repose bound (Operators) and gated by the fixture's
`needles` check; before the fix the ancestor errors (up to 141 m) forced native residency everywhere and the 4 km 0.977 m
fixture to its GPU ceiling.

Engine fix during D3: the depositing operators (`sediment-deposit`, `terraces`, `hydraulic-erosion`, `thermal-weathering`)
now respect the repose plane of a cell's neighbours (refused material continues downstream, rolls to the lowest
neighbour or is exported and counted); the D2 gate gained a `needles` check (19/19) and `tests/node/unit/landscape_synthesis_repose.test.js`.

### D4 coastal terrain v3 — delivered 2026-10-09

- **Generate v3.** `node tools/bake.mjs --target landscape/synthesis/coastal-v3 --publish` (recipe `recipes/coastal-v3.json`,
  4097² at 0.9765625 m, variant B) publishes `assets/public/landscape/coastal-city-v3/` (revision
  `synthesis-7045f619de9de74a367bc3a8`, snapshot `manifest.3846aed4…json`, 341 nodes, 762.9 MiB with fields and geology):
  the legible high city (80 m plateau, 26.6 m escarpment at 59° over a 33° talus, roads climbing at 5.8% through 40 m
  cut/fill shoulders), hills and valleys with 65 incised drainage lines (p90 5.8 m), the bluff sector (11.6 m faces at 68°
  over a 30 m platform at +0.64 m, talus, strata), berm beaches (1.80 m at 31.5 m, foreshore 2.8°), foredunes (3.3 m on 11
  of 13 transects, none in the corridor), bathymetry (Dean A 0.137 to −8 m, 2.0° shelf, bar at −2.2 m / 111 m, reef off
  the bluff at −4…−1 m, swim zone clean sand) and ponds/creek beds where the drainage demands them (fluvial ponds, sediment
  floors). Engine gaps closed: upsampling import, Dean-to-shelf beach, `derive-land-cover`, the 44-row targets evaluator,
  two edge-profile faults fixed.
- **Derive land cover.** `derive-land-cover` (rules in the catalog, recorded in the recipe and the receipt): 260,848 of
  16,785,409 samples changed — sand +34,966, rock +56,260, grass +133,206, forest −222,423, water −2,009; planning classes
  5–7 identical; the full transition matrix is in `tests/artifacts/screens/landscape/ai596/d4/v3/engine-report.json`.
- **Publish.** Terrain, hierarchy (levels 0–4), references, terrain fields (`terrain-fields-8ae5a126…`), geology
  (`geology-cf24152c…`, GLSL mirror `chunks/landscape/geology.glsl`), appearance (revision `appearance-b9c95172…`, 66.1 MiB, bound to the v3 revision, viewer check passed); surface detail and
  natural inference come with the fields sidecar and the runtime recipes. City spec re-pinned to `coastal-city-v3` (snapshot `manifest.3846aed4…`, revision `synthesis-7045f619…`), cache bundle verified (1,885 files, 829 MiB), v2 kept as the default directory for the existing suites. Editing, planning reports and revert verified on a copy of v3 (13 of 13 checks; apply 2.9 s, revert 2.4 s, every sample exact). Explicit edits survive regeneration by replaying the accepted batches in the documented order (`BatchReplay.mjs`, unit-tested).
- **Gate.** 44 of 44 targets and hard constraints pass in the measured report (`.../d4/v3/targets.md`, table in the spec);
  matched captures at NW-01..13 and composites against R03, R04, R07, R10 and the plan: 13 of 13 poses captured on v3 with PBR appearance, 29 composite sheets (pose-NW-xx before/after, R03/R04/R07/R10 and plan references; R10's image is missing on disk, placeholder noted). Browser at the
  shipped profile: nothing native before the first frame, 4 of 256 natives by the settled startup, peaks 416 / 448 MiB (the GPU budget ceiling), uploads ≤ 7.8 MiB per frame, 60 FPS vsync-bound with GPU 5.7 ms median, picking and queries exact at L4; the 1.5 px goal is met only at the overview, orthographic and return stops — the four ground stops degrade on the GPU budget, so the budgets must grow for v3 (D6). The user reviews the composites visually (`tests/artifacts/screens/landscape/ai596/d4/REPORT.md`).

| Row | Measured | Target (column B) | Result |
| --- | --- | --- | --- |
| natural slope share ≥ 10° | 0.177 | >= 0.1 | pass |
| share ≥ 20° | 0.033 | >= 0.03 | pass |
| share ≥ 30° | 0.023 | >= 0.01 | pass |
| steepest natural slope | 85.797 | >= 65 deg | pass |
| face mask beyond 65° | 10,320 of 10,320 samples | every natural sample at or beyond 65 deg carries face mask >= 0.5 | pass |
| local relief p90 over 100 m | 14.228 | >= 14 m | pass |
| local relief p90 over 500 m | 48.414 | >= 40 m | pass |
| high-city rim face height | 26.6 m | 20..30 m | pass |
| rim face slope | 59.1° | 55..65 deg | pass |
| rim talus slope | 33.0° | 30..35 deg | pass |
| west cliff face height | 11.6 m (14 of 14 transects) | 10..16 m | pass |
| west cliff face slope | 68.0° | 60..75 deg | pass |
| wave-cut platform width | 30 m | 20..40 m | pass |
| platform height | +0.64 m | +0.5..+1.5 m | pass |
| drainage lines with ≥ 3 m incision | 65 | >= 8 lines with >= 3 m incision | pass |
| incision p90 | 5.77 m | >= 2.5 m | pass |
| berm height | 1.80 m (13 of 13 transects) | 1.5..2 m | pass |
| berm distance from the waterline | 31.5 m | 25..40 m from the waterline | pass |
| foreshore slope | 2.81° | 1.9..3.8 deg | pass |
| foredune height | 3.27 m (11 of 13 transects) | 3..6 m where space permits | pass |
| foredune in the corridor or districts | 0 samples | no foredune sample inside the open-view corridor or a district | pass |
| Dean A | 0.137 m^(1/3) | 0.1..0.14 m^(1/3) | pass |
| −8 m reached | every transect, median 444 m | the profile reaches -8 m on every transect | pass |
| shelf slope −8 → −30 m | 1.98° | 1.5..2.5 deg from -8 m to -30 m | pass |
| bar crest depth | −2.21 m (13 of 13) | -3..-2 m | pass |
| bar crest distance | 111 m | 60..120 m seaward | pass |
| reef off the bluff sector | tops p05 −3.99 / p95 −1.81 m, none in the swim zone | reef off the bluff sector with tops -4..-1 m, none in the swim zone | pass |
| high city above the skyline from NW-08 | 3.69° | >= 3.5 deg | pass |
| from NW-01 | 1.35° | >= 1.3 deg | pass |
| from NW-09 | 1.704° | >= 1.7 deg | pass |
| roads sustained grade | 5.80% | <= 6% over 50 m | pass |
| roads short grade | 5.81% | <= 8% over 20 m | pass |
| district bands (hard) | all seven inside their bands (7 Beach arrival 2.43–2.77 m) | every district p05..p95 inside its design band | pass |
| districts flat ≤ 8° (hard) | ≥ 99.2% of urban samples | >= 0.95 of the urban samples below 8 deg | pass |
| district edges designed (hard) | embankment 30° on 1, 2, 3, 5, 6, 7; escarpment on 4; median edge width 0–4 m | every district edge a designed treatment (escarpment, embankment, retaining, ramp; never feather) at most 25 m wide unless an escarpment | pass |
| road topology (hard) | 41 of 41 roads on their alignments | 41 plan roads measured on their alignments | pass |
| shoreline (hard) | max 0.50 m, no headlands or coves | every design vertex within +/-10 m | pass |
| beach arrival (hard) | 2.51 m, slope 0.05° | flush at 2.6 m, no walls or boulders | pass |
| bus stop (hard) | 2.65 m ± 0.024 | kept at 2.6 m | pass |
| view corridor (hard) | sea visible from 1,164 m | sea visible from the upper end of the descent road | pass |
| swim zone (hard) | 0 disallowed samples, seabed p95 4.8° | clean sandy seabed and sand on land | pass |
| sea level (hard) | Y = 0 | Y = 0 | pass |
| planning cover 5–7 (hard) | 0 mismatches | planning classes 5-7 identical to the source cover | pass |

Not measured / limitations: The R10 reference image is not saved on disk (placeholder in its sheets); the v2 performance numbers are the historical AI577 D7 run, not re-measured; warm/reload runs were not measured; visual review points for the user: the high-city rim faces render as pale vertically stretched bands with sawtooth shading (heightfield faces, rock geometry is a later layer), the bluff reads as one dark rock band (talus and platform measured, not yet distinguishable by material), and the derived rock class peppers the forest with speckles (1.6% of forest). The cold-checkout cache test passes only once the commit carries the geology pointer (it clones HEAD); the appearance leaf writes its receipts to the fixed AI 576/577 paths (copies kept under `d4/appearance/`); the default landscape server's authoring API targets v2 unless `LANDSCAPE_DIRECTORY` points at v3; the browser e2e suites were not run (they keep their v2 constants).

## On completion

- Mark the first line DONE only after D1–D6 pass.
- Rename to `prompts/AI_DONE_codex_landscape_596_TOOLS_procedural_terrain_synthesis_and_coastal_relief_DONE.md`.
- Keep it in `prompts/`; do not archive automatically.
- Add a one-line summary per completed change, focused validation results, before/after performance
  tables with conditions, and artifact paths. Update the roadmap status table.
