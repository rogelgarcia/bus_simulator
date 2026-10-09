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
- [ ] **Gate.** The user selects a variant and approves its targets. Record the decision and date in
  this file. No later deliverable may assume a variant before this. **Pending: see "D1 decision
  requested" below.**

### D2. Terrain synthesis engine

- [ ] **Recipe model.** Provide a versioned, renderer-independent recipe and graph model: ordered
  operators with typed parameters, units, seeds and masks. Its identity covers the recipe and the
  input revisions. Outputs are bit-identical on repeat runs, consistent across tile halos, and kept
  within documented working-set limits, with progress and cancellation.
- [ ] **Operators.** Support these capabilities:
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
- [ ] **Geology channels.** Output the geology and erosion channels of roadmap layer L0, with exact
  renderer-independent samplers: bedrock surface, regolith depth, deposit type and thickness,
  lithology/strata index, wear, deposition, flow and drainage, face mask, coastal zone class, and wave
  exposure.
- [ ] **Interchange.** Import and export heightmaps and masks (16/32-bit PNG, EXR, RAW) with coordinate
  metadata and provenance. An imported map can replace a stage's output.
- [ ] **Tests.** Cover erosion mass balance, talus-angle convergence, determinism, constraint
  preservation, tile-seam equality and interchange round trips. Add review images per operator.
- [ ] **Gate.** A synthetic 1 × 1 km fixture with a plateau, a road and a shoreline erodes into
  convincing relief. It must meet its declared constraints, be deterministic and be seam-free.

### D3. Finer authoritative resolution

- [ ] **Compare spacings.** Compare 1.953 m, about 0.98 m and about 0.49 m native spacing for generated
  terrain. Measure visible gain at the review poses (ridges, gullies, berms, bluff crests), data size,
  hierarchy depth, CPU and GPU residency, uploads, compile and frame cost, and query, edit and picking
  accuracy.
- [ ] **Extend contracts.** Extend the model, import, hierarchy, streaming, editing and query contracts
  to the chosen spacing. Use explicit provenance: "procedurally synthesized, not measured". Upsampling
  never counts as new source detail. Older revisions stay readable.
- [ ] **Gate.** A synthetic high-resolution fixture streams within the declared budgets. Nothing is
  fetched at full resolution on startup. Edits, queries and picking are exact at the new spacing. Record
  the choice with its measurements.

### D4. Coastal terrain v3

- [ ] **Generate v3.** Use the approved variant and spacing. The terrain must include:
  - a legible high city: plateau, rims and escarpments, with ramps where roads climb;
  - hills and valleys with drainage, and gullies;
  - the coastal bluff sector with layered faces, talus and a wave-cut platform (R10);
  - beach profiles with berm and foreshore slope;
  - foredunes where space permits;
  - natural bathymetry with bars, reefs off the bluff, and the clean sandy swim zone;
  - seasonal creek beds or ponds where hydrology demands them.
- [ ] **Derive land cover.** Derive natural land cover (sand, grass and scrub, forest soil, rock) from
  the geology and record the derivation recipe. Keep planning classes exact. Report every class change.
- [ ] **Publish.** Publish through the registered leaves: terrain, hierarchy, appearance bindings,
  terrain fields, surface detail, natural inference, and the new geology channels (versioned, with GLSL
  mirrors where rendering needs them).
  - Re-pin the coastal city fixture deliberately.
  - Editing, reports and revert must work on v3.
  - Explicit local edits must survive regeneration in a documented evaluation order.
- [ ] **Gate.** All hard constraints and D1 targets pass in a measured report. Provide matched
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

### D1 decision requested

The user gate of D1 is open. Please choose, and the choice is recorded here with its date before D4 starts:

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

## On completion

- Mark the first line DONE only after D1–D6 pass.
- Rename to `prompts/AI_DONE_codex_landscape_596_TOOLS_procedural_terrain_synthesis_and_coastal_relief_DONE.md`.
- Keep it in `prompts/`; do not archive automatically.
- Add a one-line summary per completed change, focused validation results, before/after performance
  tables with conditions, and artifact paths. Update the roadmap status table.
