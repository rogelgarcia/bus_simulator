# Natural world roadmap: from textured terrain to a layered ecosystem

Status: planning reference written 2026-10-08 after the AI 576/577 landscape work. It records why the
coastal landscape still reads flat and soft, what the reference images contain that the landscape lacks,
the layer model and generator engines needed to close that gap, and the dependency-ordered prompts
AI 596–604 that own the work. Each prompt owns its contracts and must update the specification it
changes; this page keeps the shared vocabulary, the review poses and the status table.

## 1. Measured starting point

### Terrain data (coastal-city terrain v2)

These are the v2 measurements that motivated AI 596. Coastal terrain v3 (AI 596 D4, 2026-10-09) superseded
them; the measured v3 state is recorded in [LANDSCAPE_TERRAIN_SYNTHESIS.md](LANDSCAPE_TERRAIN_SYNTHESIS.md)
and handed over in [LANDSCAPE_AI596_HANDOFF.md](LANDSCAPE_AI596_HANDOFF.md).

- The terrain matches its plan numerically: the high city plateau is 48.6–49.2 m, the low city
  17.3–19.0 m, the airport 19.3–21.5 m and the beach arrival 2.6 m (`districts.json` percentiles).
  The heights are not wrong relative to the v2 plan; the plan itself was deliberately lowered
  (high city nominal 160 m → 49 m, 50 m terrain cap, see the package `README.txt`).
- The relief does not read. On the 3,078,650 native land samples: 92.4% below 5°, 5.4% 5–10°,
  1.7% 10–15°, 0.4% 15–20°, 0.05% above 20°; the steepest sample is 34.9°. There are no cliffs,
  gullies, ridgelines or breaks in slope.
- The high city flanks average about 7° (for example 35.7 → 47.4 m over 100 m at Z = 3100). From the
  low city it subtends about 2° and from the beach about 1.3°, so it appears as a soft bump on the
  horizon. Its plateau shows inferred natural soil because buildings do not exist yet.
- The beach-to-centre rise is a ramp: at Z = 2000 the sand strip is 40–60 m wide (0 → 1.3 m), then the
  "exposed rock" band climbs 1.3 → 17 m over about 140 m (6–12°). At the swim beach the sand rises
  0 → 2.6 m over about 80 m and then stays flat at the 2.6 m plaza level.
- The seabed is a planar ramp (about 1–2.3°) ending in a flat −30 m floor; no bars, reefs or
  equilibrium profile.
- `build_terrain.py` explains the softness: Gaussian hills plus a sinusoidal roll, district plateaus
  feathered over 65–150 m, roads blended over 72 m shoulders, a final Gaussian blur and a 50 m cap.
  There is no erosion, geology or coastal process.
- 1.953125 m native spacing cannot hold features narrower than about 4 m (rills, ledges, berms,
  crest lines).
- Forest soil covers about 7.9 km² (2,067,193 native samples), roughly two thirds of the land, and is
  rendered as bare soil because no trees are placed.

### Rendering and content

Evidence: `tests/artifacts/screens/landscape/flyover/` (frames 300, 900, 1350 and 1800 show the beach,
featureless forest soil, the high city approach and the world edge) and
`tests/artifacts/screens/landscape/ai577/d5/views/final/` (`d5-coast-bluff.png`, `d4-grass-near.png`).

| Area | Today |
| --- | --- |
| Ground | AI 577 surfaces: continuous coverage, homogeneous anti-tiled PBR per soil class, terrain fields, catena, wet beach. One material per soil class, so grass reads as a lawn and forest as bare soil. |
| Vegetation | None placed. A 5-species × 3-form tree catalog exists (LOD0 grid cards, LOD1 branchlet canopies, LOD3–LOD6 distant set) with no runtime loader for LOD1, no LOD switching, no wind and no instancing. The Grass Lab is human-rejected (`specs/grass/GRASS_LAB_HUMAN_REJECTION.md`). |
| Rocks and props | None. No rock, cliff, boulder, pebble, log or debris meshes exist. |
| Water | A flat 4 × 4 km quad with good single-pass optics (Fresnel, sky reflection, water column, glint). No time-dependent surface exists anywhere in the repository. |
| Lighting | Calibrated game daylight, HDR sky, aerial perspective, horizon-based terrain shadows. No shadow maps, no screen-space AO, no clouds or cloud shadows, no mist. |
| World edge | Terrain and water end at the 4 km boundary; a haze backdrop paints below the horizon. |
| Placement infrastructure | Dressing inputs (`LandscapeDressingInputs.js`: grass, shrub, tree, rock and debris suitability) are a contract only. No Poisson/blue-noise sampler, instancing manager, content-layer streaming or GPU culling exists. Manifest `attachments` must be empty today. |
| Platform | three.js r183, WebGL2 only (ANGLE/D3D11 on the reference machine): no compute shaders; cold program compiles are expensive (see `LANDSCAPE_AI577_SURFACES.md`). |

## 2. Reference set

Saved copies (gitignored): `tests/artifacts/screens/landscape/references/natural_world/`. R08–R10 were
supplied in conversation after the others; save them under the listed names before using them.

| ID | File | Shows | Layers it exercises |
| --- | --- | --- | --- |
| R01 | `ref01_aerial_wetland_forest_clouds.webp` | Aerial plain with forest clumps, low cumulus below the camera, cloud shadows | L4, L7, L8 |
| R02 | `ref02_misty_valley_conifers_mossy_rocks.webp` | Conifers on a slope, mossy boulders, puddles, mixed grass/moss/rock ground, mist | L2, L3, L4, L5, L6, L7 |
| R03 | `ref03_grass_hillside_path_eroded_mountain.webp` | Tall mixed grass, dirt path with stones, broadleaf canopy masses, eroded mountain faces, golden light | L0, L2, L4, L5, L7 |
| R04 | `ref04_eroded_landscape_patch_heightfield.webp` | Eroded heightfield: sharp ridges, gullies, alluvial fans | L0 |
| R05 | `ref05_lake_island_pines_snow_peak.webp` | Water ripples and reflections, pine forest edge, ground mist | L1, L4, L7 |
| R06 | `ref06_lakeshore_pines_mud_sedge_mist.webp` | Muddy shore, sedge clumps, puddles, forest mist, strata on the peak | L0, L1, L2, L5, L7 |
| R07 | `ref07_alpine_valley_conifer_forest_aerial.webp` | Thousands of trees with cast shadows, glinting lake, snow in gullies | L0, L4, L7 |
| R08 | `ref08_beach_cove_turquoise_boulders.webp` | Turquoise shallows, small shore break, boulder-lined shore under a wooded hill with pale exposed rock, beach scrub foreground | L1, L3, L4, L5 |
| R09 | `ref09_shore_break_foam_band.webp` | Spectral open sea, a breaking-wave foam band rolling onto sand, residual foam patches | L1 |
| R10 | `ref10_coastal_bluff_strata_platform.webp` | Layered sandstone bluff with a vegetated crown, talus, wave-cut rock platform, boulders, cobbles, pebbles, driftwood | L0, L2, L3, L6 |

## 3. Why the references read as real

None of the references gets its detail from a single ground texture. Each visible scale band is carried
by its own layer, and the ground texture fills only the smallest band:

| Scale band | What the references show | What the landscape has |
| --- | --- | --- |
| 0.5–4 km | Landform silhouettes, ridge lines, valleys, forest masses, haze, clouds | Soft bumps, flat colour fields, world edge |
| 10–500 m | Escarpments, bluffs, gullies, stands and clearings, rock outcrops, beach and surf zones | Ramps and colour bands |
| 1–10 m | Individual trees and shrubs, boulders, ledges, berms, paths, patches of grass/stone/dirt | Material boundaries only |
| 0.05–1 m | Grass clumps, flowers, ferns, pebbles, litter, roots, foam patches, ripples | Normal-mapped texture relief |
| < 5 cm | Grains, blades, bark | Present (AI 577 micro detail) |

At a 2 m eye height the frame is dominated by the 0.05–10 m bands, which are almost entirely geometry
(instanced plants, stones, litter, rocks, trunks) standing on a layered material. The required change is
therefore structural: add the missing layers rather than refine the textures further.

## 4. Layer model

| Layer | Content | Authority | Owner |
| --- | --- | --- | --- |
| L0 Landform and geology | Authoritative height at a finer native spacing; geology channels: bedrock surface, regolith depth, deposit type and thickness (talus, colluvium, alluvium, beach and dune sand), lithology/strata index, erosion wear, deposition, flow/drainage, face mask (slopes a heightfield cannot represent), coastal zone class, wave exposure | Authoritative terrain revision plus versioned derived channels | AI 596 — delivered 2026-10-09 as `coastal-city-v3` (0.9765625 m, `assets/public/landscape/coastal-city-v3/`) with the `landscape-geology` v1 sidecar `geology/`; contract [LANDSCAPE_AI596_HANDOFF.md](LANDSCAPE_AI596_HANDOFF.md) §3 |
| L1 Water | Ocean surface to the horizon, shoaling and breaking shore waves, foam, swash and wet beach, optional inland water | Presentation; sea level stays authoritative | AI 597 |
| L2 Surface | Substrate (what the ground is made of) + cover (what grows or lies on it) with fractional cover, wetness, disturbance and worn paths; strata-aware rock faces | Derived appearance; semantic soil queries unchanged | AI 598 |
| L3 Rock geometry | Cliff and bluff faces, outcrops, boulders, talus and scree, shore platform | Derived content layer | AI 602 |
| L4 Trees and tall shrubs | Stands, edges, clearings, understory, solitary trees, species by habitat | Derived content layer | AI 601, species from AI 604 |
| L5 Ground vegetation | Grass species and heights, sedges, forbs and flowers, ferns, moss cushions, low shrubs, dune grass | Derived content layer | AI 603 |
| L6 Natural clutter | Pebbles, stones, litter, twigs and branches, logs, stumps, roots, beach wrack (driftwood, seaweed, shells) | Derived content layer | AI 603 |
| L7 Light and atmosphere | Sun shadows for terrain and instances, ambient occlusion, clouds and cloud shadows, mist, lighting presets | Presentation | AI 600 |
| L8 Far field | Land and sea beyond the 4 km extent to the horizon | Presentation only, never authoritative | AI 596 (land) — delivered 2026-10-10 as the render-only surround `coastal-city-v3/surround/` (32 × 32 km at 15.625 m, bound to the v3 revision; [LANDSCAPE_STREAMING.md](LANDSCAPE_STREAMING.md) "Far-field surround"); AI 597 (sea, over the surround's bounds and seabed) |

L3–L6 share one placement and rendering framework (AI 599). Substrate decides what can grow and what
lies loose; cover and clutter decide what is seen at 2 m; rocks and trees decide what is seen at 10–500 m.

## 5. Generator engines

| Engine | Role | Industry equivalents | Decision |
| --- | --- | --- | --- |
| Terrain synthesis graph | Plan constraints, landform primitives, warps, terraces/strata, hydraulic and thermal erosion, deposition, coastal processes, constraint re-imposition, geology channels | Gaea, World Machine, Houdini heightfields | Build in the repository as registered `landscape/*` bake leaves (AI 596). Reuse the existing Priority-Flood/MFD hydrology and the bit-exact `LandscapeSurfaceNoise`. |
| External terrain interchange | Optional import of heightmaps and data maps from Gaea, World Machine or Houdini for later fine tuning | Gaea build swarm (`Gaea.Build.exe`), exported maps | Optional, provenance-tracked inputs; never a runtime or mandatory build dependency. Gaea Community exports are capped at 1024² and non-commercial; larger builds need a paid tier. |
| Surface layer compositor | Substrate + cover + wetness + worn ground evaluated from geology and fields, cached by the AI 577 surface cache | UE landscape layers with runtime virtual texturing, Far Cry 5 terrain texturing | Extend AI 577 through its documented surface-layer contract (AI 598). |
| Ecosystem rule engine | Biomes as layered rule sets; deterministic hierarchical placement with clustering, competition and exclusion | UE PCG + Biome Core, Gaia spawners and stamps, Horizon Zero Dawn GPU placement, Far Cry 5 biome recipes | Build in the repository (AI 599). Gaia and UE PCG are engine-bound; adopt their rule models, not their code. |
| Instanced content renderer | Streamed placement tiles, instancing, LOD selection with cross-fade, impostors, wind, shadow casters | UE HISM/foliage, SpeedTree runtime, octahedral impostors | Build in the repository on WebGL2 (AI 599), with GPU-friendly data layouts so a later WebGPU path stays possible. |
| Asset generators | Rocks and cliffs from CC0 scans plus procedural variation; trees from the existing `tools/bake_vegetation` pipeline; ground cover from CC0 sources | Megascans, SpeedTree | CC0 only, with retained provenance (Poly Haven lists 90+ relevant CC0 models: coastal cliffs, coast rocks, boulders, stones, ferns, grasses, shrubs, stumps, dead trunks, roots, shells, pines). |
| Ocean simulator | Spectral wind sea and swell with finite depth, shoaling, refraction, breaking, foam, swash | Tessendorf FFT ocean, Crest, Atlas, HDRP water | Build in the repository (AI 597) as WebGL2 render-to-texture passes. |

## 6. Procedural-first contract

Every generator in AI 596–604 follows these rules:

- Inputs, parameters and seeds live in a versioned recipe. Outputs are derived products bound to the
  recipe identity and the input revisions; repeat runs reproduce them exactly where the prompt says so.
- Nothing is hand-sculpted, painted or placed now. Fine tuning later happens through data-only override
  layers evaluated after the procedural pass in a documented order: region masks with parameter
  overrides, include/exclude zones, pinned or removed instance IDs, and imported external maps.
  Overrides survive regeneration.
- Local stability: changing one region regenerates only that region and its halo; instance identities
  elsewhere do not reshuffle.
- Terrain edits from the AI 576 editing loop invalidate dependent products by bounds and channel;
  global processes such as erosion are not silently re-run by a local edit.
- Authoritative heights, soil queries, picking and future collision never depend on presentation-only
  displacement or instance detail.

## 7. Coastal catena and transitions

Transitions must follow landforms and processes, not alpha fades. The target sequence for this map,
from sea to the high city:

1. Offshore: deepening sandy floor, rocky reef off the bluff sector, at least one nearshore bar.
2. Surf and swash: shoaling and breaking waves, foam bands, a moving swash line on a 1:15–1:30
   foreshore (fine sand, about 2–4°), wet sand that darkens and dries behind the backwash.
3. Berm and backshore: dry sand, a wrack line (driftwood, seaweed, shells) at the upper swash limit.
4. Foredune where space permits: dune grass, then low back-dune scrub. The beach arrival open-view
   corridor keeps low vegetation.
5. Bluff sector (the plan's exposed-rock band): a wave-cut platform with tide pools and boulders, a
   talus apron, a layered cliff face, a vegetated crown (R10).
6. Bluff top and hills: heath and grassland with wind-shaped shrubs, rock outcrops on convex slopes.
7. Woodland edge: shrub mantle and saplings, then forest with understory, litter, logs and clearings.
8. Escarpment around the high city: rock rims, scree, forest on lower slopes, ramps where roads climb.

Hard plan constraints remain: district buildable areas and target elevations, road corridors and
grades, the beach arrival (1090, 2.6, 490) flush with the sand and free of boulders or tall walls, the
bus-stop reservation (1260, 2.6, 520), the open-view corridor, and clean sand in the southwest swim zone.

## 8. Natural-world review poses

All prompts verify against the same poses. AI 596 D1 pins exact positions (XZ, eye height above local
ground, heading, pitch, FOV) in a versioned pose file; later prompts reuse that file and re-resolve the
ground height on newer terrain revisions. Heading 0° faces north (+Z) and 90° faces east (+X).

| Pose | Intent | Approximate placement |
| --- | --- | --- |
| NW-01 | Swim beach at eye height, along the shore | (1090, 490), 1.7 m, heading 340° |
| NW-02 | Beach arrival towards the sea across the open-view corridor | (1260, 700), 1.7 m, heading 270° |
| NW-03 | Bluff toe on the sand, along the bluff (R10 composition) | sand 15 m seaward of the bluff toe near Z 2600, 1.7 m, heading 20° |
| NW-04 | Bluff top looking out to sea | bluff crest near (1400, 2400), 1.7 m, heading 250° |
| NW-05 | Forest interior | south forest near (2600, 450), 1.7 m, heading 45° |
| NW-06 | Forest edge and clearing | north forest near (2450, 3750), 1.7 m, heading 180° |
| NW-07 | Steep natural slope with outcrops below the high city | escarpment flank near (3300, 2700), 1.7 m, upslope |
| NW-08 | High city seen from the low city | (2600, 2200), 1.7 m, heading 45° |
| NW-09 | Beach-to-centre rise from the water | (1000, 1500), 1.5 m above sea level, heading 90° |
| NW-10 | Low oblique flyover of the coast | (900, 1200), 25 m above ground, heading 45°, pitch −10° |
| NW-11 | Aerial overview from the sea | (−400, 2000), 800 m altitude, heading 90°, pitch −30° |
| NW-12 | Shore break at water level (R09 composition) | swash zone near (1170, 1800), 1.0 m above sea level, heading 0° |
| NW-13 | 4 km top-down overview | existing overview pose |

Reference comparisons ship as single `[reference | before | after]` composite images.

## 9. Gap list and prompt index

| Gap | Prompt |
| --- | --- |
| G1 Soft relief, no sharp landforms, high city and beach-to-centre rise not legible, beach not a profile, planar seabed, coarse native spacing, world edge on land | AI 596 `TOOLS` procedural terrain synthesis and coastal relief — **delivered** by D1–D5 (2026-10-09/10): coastal terrain v3 at 0.9765625 m with the 80 m high city, eroded hills and drainage, the bluff sector, berm beaches and foredunes, Dean bathymetry with bar and reef, 44 of 44 targets and constraints, the geology sidecar and the far-field surround; D6 acceptance delivered 2026-10-11 (regressions, flyover, performance, handoff) |
| G2 Flat water without waves, foam, breaking or swash; sea ends at the boundary | AI 597 `MATERIAL` animated ocean, shore waves and foam |
| G3 One material per soil class; no substrate/cover layering, small-area mixing, strata, litter, moss, scree or worn paths | AI 598 `MATERIAL` layered substrate and ground-cover surfaces |
| G4 No placement, streaming or instanced rendering framework for natural content | AI 599 `TOOLS` procedural ecosystem scatter engine |
| G5 No shadow maps, AO, clouds, cloud shadows or mist in the landscape | AI 600 `ATMOSPHERE` natural scene shadows, AO, clouds and mist |
| G6 Forest soil is bare; the LOD tree catalog is unused | AI 601 `MESHES` procedural forests from the LOD tree catalog |
| G7 No cliffs, bluffs, outcrops, boulders, talus or shore platform | AI 602 `MESHES` rocks, cliffs and coastal bluffs |
| G8 No ground vegetation or clutter at 2 m | AI 603 `MESHES` ground-level vegetation and natural clutter |
| G9 Catalog species are urban broadleaves; references need conifers, coastal trees, shrubs, snags | AI 604 `MESHES` coastal tree and shrub species set |

Dependency order:

```
AI 596 terrain synthesis ──┬─> AI 597 ocean (bathymetry, shoreline)
                           ├─> AI 598 layered surfaces (geology channels)
                           └─> AI 599 scatter engine ──> AI 600 lighting ──┬─> AI 601 forests <── AI 604 species
                                                                            ├─> AI 602 rocks and cliffs
                                                                            └─> AI 603 ground level (also needs AI 598, 601, 602)
```

All of them start after `AI 595 PROJECTMAINTENANCE` (removing the landscape cache from Git history)
completes, because it rewrites this branch and moves the landscape cache to a gitignored location.
AI 597 and AI 598 can run in parallel after AI 596. AI 599 can start on the current terrain with
synthetic fixtures, but its final acceptance uses the AI 596 terrain. AI 604 can run at any time and
feeds AI 601's palette.

What AI 597–604 consume from AI 596 (the contract, with encodings, samplers and receipt numbers, is
[LANDSCAPE_AI596_HANDOFF.md](LANDSCAPE_AI596_HANDOFF.md)):

- the terrain: `assets/public/landscape/coastal-city-v3/` (revision `synthesis-7045f619de9de74a367bc3a8`,
  4097² at 0.9765625 m, 341 nodes, pinned by the city spec; v2 stays the default directory of the viewer,
  server and suites);
- the geology sidecar `geology/` (`landscape-geology` v1, `src/app/landscape/LandscapeGeology.js`, GLSL
  mirror `chunks/landscape/geology.glsl`): bedrock offset, regolith, deposit thickness, wear, deposition,
  flow, wave exposure, face mask; deposit type, lithology, drainage, coastal zone;
- the derived natural land cover and its rules (`derive-land-cover`), the terrain fields `fields/` and the
  appearance re-baked for the v3 grid;
- bathymetry for AI 597 (Dean A 0.137 to −8 m, 1.98° shelf to −30 m, bar −2.21 m at 111 m, reef off the
  bluff, the surround's −60 m shelf); drainage classes and the fields' fill depths for inland water, mist
  and wet habitats (no inland water surface is published);
- the render-only surround `surround/` (bound to the v3 revision and boundary hash; the water extent spans
  its bounds while it is active) for AI 597 and AI 600 — nothing is ever placed on it;
- the review poses `tools/landscape_review/poses/natural-world-v1.json` with the capture and composite
  tools, the leaves and recipes under `tools/bake_landscape/terrain_synthesis/`, the edit replay order of
  [LANDSCAPE_EDITING.md](LANDSCAPE_EDITING.md) and the raised budgets (640/352 and 640/544 MiB with the
  128/96 MiB surround share).

| Prompt | Status |
| --- | --- |
| AI 596 | D1–D5 delivered 2026-10-09/10 (variant B decided 2026-10-09; `coastal-city-v3` published and pinned, geology sidecar, far-field surround; [LANDSCAPE_TERRAIN_SYNTHESIS.md](LANDSCAPE_TERRAIN_SYNTHESIS.md)); D6 integrated acceptance delivered 2026-10-11 (regressions, flyover and performance tables under `tests/artifacts/screens/landscape/ai596/d6/`; prompt closed as DONE); consumer handoff [LANDSCAPE_AI596_HANDOFF.md](LANDSCAPE_AI596_HANDOFF.md) |
| AI 597 | D1 spectral ocean surface, D2 depth-aware shore waves, D3 foam lifecycle and D4 swash and wet beach delivered 2026-10-12, D5 water colour, refraction and light 2026-10-14 (the linear frame pipeline, the refracted seabed through the water column of three water types, caustics, crest scattering, a heightfield terrain reflection; [LANDSCAPE_OCEAN.md](LANDSCAPE_OCEAN.md): band-limited JONSWAP/TMA cascades, camera-snapped clipmap to the far plane over the surround, deterministic clock, the flat plane kept as the inspection surface; the swell marched over the bathymetry with the finite-depth phase speed, shoaled by energy flux, broken at γ h on sand with the bars and reefs shadowing, surging on rock, damped by the geology's shore exposure; a foam state over the extent with breaker bands, whitecaps, the shoreline line and the sand deposit, pre-rolled to any fixed time); D4–D7 pending |
| AI 598 | pending |
| AI 599 | pending |
| AI 600 | pending |
| AI 601 | pending |
| AI 602 | pending |
| AI 603 | pending |
| AI 604 | pending |

## 10. Cross-cutting rules

- Realism first, then optimisation behind measured gates with an explicit off switch; budgets may grow
  but stay accounted in the residency ledger and are reported with same-condition measurements.
- Grass and ground-cover visuals restart under AI 603 with human acceptance before optimisation or
  gameplay use; nothing from the rejected Grass Lab look is a baseline.
- Offline work runs through `node tools/bake.mjs` leaves with validation and publication gates; Blender,
  when needed, uses `tools/baking/blender.local.json`.
- Generated landscape data (terrain revisions, pages, fields, geology channels, placement tiles, caches)
  is a local, gitignored bake output and is never committed or distributed through Git LFS (AI 595
  PROJECTMAINTENANCE). Commit recipes, small authored configuration, code, tests and specs. Use the
  landscape cache location that AI 595 documents; references to `assets/public/landscape/` in this
  roadmap mean that location.
- Downloads are CC0 with source URL, author, license, dimensions and hash retained. `assets/` in this
  worktree is a junction to the main checkout's shared store, so installed and published files affect
  every checkout; verify the landscape data is present before starting a deliverable.
- Use port 8002 for this worktree; open a renderer only for verification and close it afterwards.
  Evidence goes under `tests/artifacts/screens/landscape/ai<id>/` and stays untracked.
- The landscape still runs only in Landscape Fabrication. Gameplay adapters (terrain colliders, road
  elevations, spawn, city rendering on terrain) remain separate work listed in `LANDSCAPE_HANDOFF.md`.

## 11. Research basis

Terrain synthesis and geology:
- Galin et al., [A Review of Digital Terrain Modeling](https://diglib.eg.org/handle/10.1111/cgf13657), Eurographics STAR 2019.
- Cordonnier et al., [Large Scale Terrain Generation from Tectonic Uplift and Fluvial Erosion](https://hal.archives-ouvertes.fr/hal-01262376), 2016; [Physically-based Analytical Erosion for fast Terrain Generation](https://diglib.eg.org/handle/10.1111/cgf15033), 2024.
- QuadSpinner Gaea: [erosion data maps](https://docs.quadspinner.com/Guide/Using-Gaea/Erosion.html), [build swarm command line](https://docs.quadspinner.com/Guide/Build/Swarm.html), [licensing](https://quadspinner.com/Support/FAQ/Licensing), [editions](https://quadspinner.com/Download).
- SideFX Houdini [heightfield erosion](https://www.sidefx.com/docs/houdini/heightfields/erosion.html) and [layers](https://www.sidefx.com/docs/houdini/heightfields/layers.html) (sediment, debris, bedrock, flow).
- Bosboom and Stive, [Coastal Dynamics: cross-shore profile](https://geo.libretexts.org/Bookshelves/Oceanography/Coastal_Dynamics_(Bosboom_and_Stive)/01%3A_Overview/1.04%3A_Examples_of_engineering_applications/1.4.2%3A_Cross-shore_profile) (profile slopes, equilibrium shape).

Ecosystems and placement:
- Epic [PCG framework](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-overview), [Biome Core](https://dev.epicgames.com/documentation/unreal-engine/procedural-content-generation-pcg-biome-core-and-sample-plugins-overview-guide-in-unreal-engine), [generation modes](https://dev.epicgames.com/documentation/unreal-engine/using-pcg-generation-modes-in-unreal-engine).
- Procedural Worlds Gaia feature model (stamps; spawners gated by height, slope, texture, proximity, noise and masks): [Unity forum thread](https://discussions.unity.com/t/gaia-aaa-terrain-generator-procedural-texturing-planting-and-scene-creation-part-1/581505).
- Guerrilla, [GPU-based procedural placement in Horizon Zero Dawn](https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn), GDC 2017.
- Ubisoft, [Procedural world generation of Far Cry 5](https://www.sidefx.com/learn/talks/procedural-world-generation-far-cry-5/), GDC/HIVE 2018; [PlayStation Blog summary](https://blog.playstation.com/2018/03/22/the-procedural-world-generation-of-far-cry-5/).
- Sucker Punch, [Procedural Grass in Ghost of Tsushima](https://gdcvault.com/play/1027214/Advanced-Graphics-Summit-Procedural-Grass) and [Samurai Landscapes](https://gdcvault.com/play/1027352/Samurai-Landscapes-Building-and-Rendering), GDC 2021.
- [Octahedral impostor forest for three.js](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735) (about 200,000 instanced trees with impostor LODs).
- Poly Haven CC0 model catalog: `https://api.polyhaven.com/assets?type=models`.

Ocean:
- Tessendorf, [Simulating Ocean Water](https://jtessen.people.clemson.edu/reports/papers_files/coursenotes2004.pdf).
- [TMA finite-depth spectrum](https://wavespectra.readthedocs.io/en/latest/generated/wavespectra.construct.frequency.tma.html).
- Crest ocean: [shallows and shorelines](https://crest.readthedocs.io/en/4.17/user/shallows-and-shorelines.html), [ocean simulation](https://crest.readthedocs.io/en/4.11/user/ocean-simulation.html).
- Atlas [shoreline tooling](https://atlas-devkit.readthedocs.io/en/latest/Guides/Shorelines.html); Unity, [shoreline distance fields in Survival Kids](https://unity.com/blog/graphics-and-rendering-tips-from-survival-kids).
- Jeschke et al., [Making Procedural Water Waves Boundary-aware](https://diglib.eg.org/handle/10.1111/cgf14100), 2020.
