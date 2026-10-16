# AI 596 handoff: channels later prompts consume

Status: written 2026-10-11 for AI 596 D6 (integrated acceptance); D1–D6 are delivered (`LANDSCAPE_TERRAIN_SYNTHESIS.md`,
completion records in the AI 596 prompt file). The D6 regression, flyover and performance receipts live under
`tests/artifacts/screens/landscape/ai596/d6/`; its `before-after/` folder holds the same-pose render set that shows the change
(coastal v2 against v3 with the surround at seven natural-world poses, one labelled sheet per pose plus a contact sheet and the
D4 plan hillshade; `build_sheets.sh` there rebuilds it from `tools/landscape_review/capture.mjs` captures of both landscapes and
`tools/landscape_review/composite.py`). This page is the contract the natural-world prompts
AI 597–604 build on: what AI 596 delivers, where it lives, how it is encoded and sampled, and what is known to be
missing. Every number is copied from a receipt or a published manifest (paths given); nothing here is projected.

The data itself is a local, gitignored bake output (`tools/bake_landscape/README.md`, "Local landscape cache"): recipes,
code, tests and specs are committed, the published landscapes are regenerated or installed from a bundle. A consumer
that finds the cache missing stops and reports it (the AI 596 rule); it never regenerates it silently.

## 1. What exists and where

| Product | Where | Identity | Notes |
| --- | --- | --- | --- |
| Coastal terrain v3 (authoritative) | `assets/public/landscape/coastal-city-v3/` (`manifest.json`, immutable snapshot `manifest.3846aed4c17a7125df21eab7f3b486eff82daa2e5e0f3fc0ab084dc02689e9ef.json`, `payloads/`) | id `coastal-city-v3`, revision `synthesis-7045f619de9de74a367bc3a8` | 4097² samples at **0.9765625 m**, bounds 0..4000 m on X and Z, sea level Y = 0, `chunkIntervals` 256, `maxLevel` 4, 341 nodes (256 natives of 250 m, 257² each), the seabed on a −30 m shelf floor and the land under the recipe's 90 m cap (the high city at 80 m); `provenance.kind: procedural-synthesis` (recipe `ai596-coastal-v3`, identity `synthesis-da623d87a672561647b22b5b`, operators at 0.9765625 m, `upsampled: false`, statement "procedurally synthesized, not measured"); the 29 v2 planning references copied with their identities; no authoring history. Pinned by `src/app/city/specs/CoastalLandscapeCitySpec.js` (`LANDSCAPE_CITY_BINDING.md`, "Coastal terrain v3 pin"). |
| Geology sidecar | `coastal-city-v3/geology/manifest.json` (+ snapshot, `pages/`) | `landscape-geology` v1, revision `geology-cf24152c9156cf1bc425da74` | 341 pages, bound to the v3 revision and native chunk hashes and to the recipe identity; section 3 |
| Terrain fields sidecar | `coastal-city-v3/fields/manifest.json` | `landscape-terrain-fields` v1, revision `terrain-fields-8ae5a126ff397de346c5aea3` | 341 field pages, 172 natural-soil pages; section 8 |
| Appearance sidecar | `coastal-city-v3/appearance/manifest.json` | revision `appearance-b9c951722dd0824f9f25d8a9` (re-issued 2026-10-16 by AI 598 D2 as `appearance-befbfb0bb88d214ab3e00501` with byte-identical pages when the layers companion was published; the former snapshot stays retained) | baked for the v3 grid (binding key `30bb4ee6…`), 66.1 MiB in 57 files; the soil masks, PBR tiers and multiscale pages of `LANDSCAPE_APPEARANCE.md` |
| Far-field surround (render only) | `coastal-city-v3/surround/manifest.json` (+ snapshot `manifest.245cc76309c269195cca5a51c1ccaf51494daa09cb8ca20f8768ba0abfc951fb.json`, `payloads/`) | id `coastal-city-v3-surround`, revision `synthesis-857ae85a2b611d24990fafdc` | 2049² at 15.625 m over −14,000..18,000 m, 85 nodes, bound to v3 by `provenance.preparation.surround`; section 9 |
| Coastal terrain v2 (unchanged) | `assets/public/landscape/coastal-city/` | id `coastal-city` (current `materials-bfcf20f7e27aa79db4d9983b`; the v2 suites pin snapshot `hierarchy-afaf934f8eb8fe074a0affb0`) | 2049² at 1.953125 m, 85 nodes; stays the viewer, server and bake default directory and the base the v3 recipe imports (upsampled ×2 with Catmull-Rom, never counted as detail) |
| Review poses and tools | `tools/landscape_review/` | `landscape-review-poses` v1 | section 10 |
| Recipes and leaves | `tools/bake_landscape/terrain_synthesis/recipes/`, `landscape/synthesis/*` leaves | — | section 11 |

Sizes (receipt `tests/artifacts/screens/landscape/ai596/d4/v3/coastal-v3.md`, the cache bundle verifier): the synthesis
publication is 762.9 MiB in 1,146 written files (fields 365.1, geology 262.6, terrain payloads 102.9, source references
31.3, root 0.9 MiB); with the appearance 1,885 files / 829.0 MiB; with the surround 2,003 files / 847.5 MiB. Manifests on
disk: terrain 459,703 B (the snapshot), geology 286,648 B, fields 260,174 B, appearance 65,855 B, surround 116,087 B — all
under the 1 MiB limit every bounded reader enforces.

Opening v3: the viewer with `?landscape=/assets/public/landscape/coastal-city-v3/manifest.json`, or the server with
`LANDSCAPE_DIRECTORY=assets/public/landscape/coastal-city-v3 node tools/landscape_server/run.mjs` (port 8002; the default
directory stays v2, `tools/landscape_server/README.md` "Opening coastal terrain v3"). Suites that must run on v3 serve it
themselves (`landscape_resolution.pwtest.js` with `LANDSCAPE_RESOLUTION_FIXTURES=coastal-city-v3`,
`landscape_surround.pwtest.js`) or take the directory through `LANDSCAPE_DIRECTORY`.

## 2. What each consumer takes from AI 596

The channels are named as in section 3 (geology), section 8 (terrain fields) and `LANDSCAPE_MODEL.md` (terrain).

| Prompt | Consumes | Where and how |
| --- | --- | --- |
| **AI 597** ocean, shore waves, foam | Bathymetry (the native heights below sea level: Dean profile, bar, reef, shelf, swim zone — section 6); the signed shoreline distance (fields `shoreDistance`, ±256 m, section 8); the coastal zone classes `offshore`, `reef`, `bar`, `surf`, `swash`, `berm`, `platform`, `bluff-toe` and `waveExposure` (geology, section 3) for breaking, damping over reefs and in the sheltered swim zone, surge over rock; the water extent and binding of the surround (section 9) for the sea to the horizon; hydrology for D6 inland water (section 7: v3 publishes no inland water surface — record that and close D6, or derive pond floors from `drainage` class 4 and the fields' fill depth); the wet-beach and wrack inputs of AI 577 D5 (`LANDSCAPE_AI577_SURFACES.md`) that the swash replaces | Native heights through `src/app/landscape/index.js` (`sampleLandscapeChunk`, `acquireLandscapeRegion`) or the streamed tiles; geology categories through `sampleLandscapeGeologyCategory`; fields through `terrainFieldsSample` / `landscapeTerrainFieldsAt` |
| **AI 598** layered substrate and cover surfaces | Every geology channel: `lithology` (strata index with the recipe's dip, thickness and hardness pattern, section 3.4) for strata-aligned banding, `regolith`, `depositType` + `depositThickness` (talus, colluvium, alluvium, beach sand, dune sand, reef rock), `bedrockOffset` (exposed bedrock where ≈ 0), `wear`, `deposition`, `flow`, `faceMask` (where faces belong), `coastalZone`, `waveExposure`; the derived land cover classes and their rules (section 4); the terrain fields (wetness, flow, sky view, shore distance, convexity, slope, horizons) unchanged from AI 577 | Geology pages are mask aligned (same ids, grid and two-sample halo as the categorical mask pages), so a surface layer can bind them beside the field pages; the GLSL decode mirror `chunks/landscape/geology.glsl` is ready (no program includes it yet: AI 598 binds the samplers) |
| **AI 599** ecosystem scatter engine | Rule inputs: the geology channels and categories, the terrain fields, soil and cover (v3's derived cover, section 4), slope/aspect/altitude from the native heights, shoreline distance, the plan constraints (districts, roads, runway, swim zone, open-view corridor from the retained references), the budgets (section 12) and the surround's exclusion semantics (nothing is ever placed on the surround: it is not authoritative, section 9) | Node and browser read the same sidecars through `index.js`; the fixtures of D2/D3 (`landscape/synthesis/fixture`, `resolution-study`) are deterministic test terrains with geology candidates for engine development |
| **AI 600** shadows, AO, clouds, mist | `drainage` (0 hillslope … 4 flat-pond) and the fields' `wetness`/`depressions` for valley and hollow mist pooling; the surround for the horizon (mist and haze must cover the surround's land and sea out to its bounds, section 9); the terrain horizons/sky view of the fields (unchanged); the raised budgets (section 12) when adding passes | Fields and geology samplers as above; the surround is a second `LandscapeStreamer` with its own program variant (shadow casters must treat it as a receiver-only far field) |
| **AI 601** forests | Habitat inputs: fields `wetness` (moisture), `flow`, `slope`, aspect from the native normal, `regolith` depth, `shoreDistance`, `waveExposure` (coastal exposure effects), `depositType` (alluvium hollows, talus/rock exclusions), the derived forest (3) and grass (2) classes (section 4; forest 8,039,340 samples ≈ 7.67 km² at 0.954 m² per sample), the plan exclusions (roads, districts, corridor, beach, bluff faces, swim zone) | As AI 599; the forest-cover speckle of section 13 is a known artifact to filter |
| **AI 602** rocks, cliffs, bluffs | `faceMask` (≥ 0.5 where the heightfield cannot represent the slope: 10,320 natural samples at or beyond 65°, all masked), the coastal zone classes `platform`, `bluff-toe`, `bluff-face`, `bluff-crown`, `reef`; `lithology` and the strata parameters (section 3.4) for strata-following faces; `depositType` 1 talus / 2 colluvium with `depositThickness` for size-sorted talus and scree (v3: 299,370 talus and 10,521 colluvium samples; `depositThickness` reaches 16.9 m over all deposit types); the geometry targets met (section 5: rim faces 26.6 m at 59°, bluff faces 11.6 m at 68° over a 30 m platform at +0.64 m); the AI 598 blending contract | Faces are a presentation/content layer: authoritative heights never change (`LANDSCAPE_MODEL.md`); the heightfield faces render as planar walls until AI 602 (section 13) |
| **AI 603** ground vegetation and clutter | Fields `wetness` and geology `drainage` (sedges in wet hollows), `shoreDistance` and the coastal zones `swash`/`berm`/`backshore`/`foredune` (wrack line, dune grass), `depositType` (pebbles on talus and thin soils, sand), the derived cover, `faceMask` (nothing grows through faces), light under the canopy from AI 600/601 | As AI 599 |
| **AI 604** species set | No direct channel: it feeds the AI 601 palette; the habitats its species must cover are the v3 landforms (bluff crown and heath, escarpment flanks, alluvial floors, foredunes) and the exposure gradient `waveExposure` | — |

## 3. The geology sidecar (`landscape-geology` v1)

Contract: `src/app/landscape/LandscapeGeology.js` (catalogs, encoding, strict validation, exact samplers, staleness),
`LandscapeGeologyPayload.js` (bounded loaders `loadLandscapeGeology(url, {landscape})`, `loadLandscapeGeologyPage(entry,
{manifestUrl})`), all exported from `src/app/landscape/index.js`; GLSL decode mirror `src/graphics/shaders/chunks/landscape/geology.glsl`;
preparation `tools/bake_landscape/terrain_synthesis/geology/`; spec section "Geology channels" in
`LANDSCAPE_TERRAIN_SYNTHESIS.md`. The sidecar is derived (`provenance.measured: false`), never measured, and carries the
recipe identity in its provenance and every page's `contentKey` (the same terrain under another recipe yields other
channels).

### 3.1 Layout

`<landscape>/geology/manifest.json` (format `landscape-geology`, schema 1, revision `geology-<24 hex>`, at most 1 MiB)
lists every node of the hierarchy as a page with the chunk id, a `contentKey` = SHA-256 of `{algorithm, recipe, page,
natives:[[id, heightHash, landCoverHash]…]}`, a `fields` payload and a `categorical` payload:

- **Field pages**: two RGBA8 layers on the mask-aligned page grid with the two-sample halo — texel (c + 2, r + 2) is sample
  (c, r), row 0 north, 261 × 261 texels for 257² chunks, `layerBytes` 272,484, `pageBytes` 544,968 (layer k at k × layerBytes).
  Linear filtering on the encoded bytes, decode after filtering: value = (byte / 255) × scale.
- **Categorical pages**: one uint8 label per aligned sample without halo, four layers of 257² = 66,049 B each,
  `byteLength` 264,196; nearest sampling only. A page of any level holds the native labels at its aligned samples, so
  every level reads identical labels at shared positions.
- Native pages copy the global bytes; a coarser field page is the separable tent average of the decoded native values,
  re-encoded; borders and halos of adjacent pages are bit identical (validated).

### 3.2 Field channels (layer.component, decode = unit × scale)

| Channel | Layer.component | Scale, unit | Meaning | v3 (statistics of `geology/manifest.json`) |
| --- | --- | --- | --- | --- |
| `bedrockOffset` | 0.r | 32 m | `height − bedrock`: regolith plus deposit above the bedrock surface, saturating at 32 m | max 16.93 m, land mean 0.075 m, 0 clipped |
| `regolith` | 0.g | 8 m | weathered in-place mantle thickness (thermal weathering) | max 3.30 m, land mean 0.016 m |
| `depositThickness` | 0.b | 30 m | thickness of the dominant loose deposit (`depositType`) | max 16.93 m, land mean 0.059 m |
| `wear` | 0.a | 1 | normalized cumulative fluvial and hydraulic erosion depth (Gaea "wear") | land mean 0.110 |
| `deposition` | 1.r | 1 | normalized cumulative sediment deposition | land mean 0.057 |
| `flow` | 1.g | 1 | normalized ln(A / spacing) of the final surface (terrain-fields convention) | land mean 0.079 |
| `waveExposure` | 1.b | 1 | exposure of the shore to the open-sea fetch (headlands 1, sheltered 0), carried inland over surf and swash | land mean 0.010 |
| `faceMask` | 1.a | 1 | smoothstep(55°, 75°) of the slope: where L3 rock faces belong | land mean 0.0011; 10,320 of 10,320 natural samples ≥ 65° carry ≥ 0.5 |

Invariant published with the sidecar: `height = bedrock + regolith + depositThickness` (v3 max residual 4 × 10⁻⁶ m,
`statistics.invariant`); the bedrock surface is `height − bedrockOffset` wherever the offset is below its 32 m saturation
(v3 never saturates: 0 clipped samples on every channel).

### 3.3 Categorical layers (uint8 page, layer k)

| Layer | k | Labels | v3 histogram (16,785,409 samples) |
| --- | --- | --- | --- |
| `depositType` | 0 | 0 none, 1 talus, 2 colluvium, 3 alluvium, 4 beach-sand, 5 dune-sand, 6 reef-rock | none 4,977,400 / talus 299,370 / colluvium 10,521 / alluvium 6,716,968 / beach-sand 4,334,567 / dune-sand 111,988 / reef-rock 334,595 |
| `lithology` | 1 | stratum index 1..255 of a dipping stack, 0 unstratified (section 3.4) | labels 1–17 and 244–255; 0 does not occur |
| `drainage` | 2 | 0 hillslope, 1 rill, 2 gully, 3 channel, 4 flat-pond, 5 sea | hillslope 10,080,384 / rill 213,646 / gully 119,628 / channel 12,831 / flat-pond 1,911,463 / sea 4,447,457 |
| `coastalZone` | 3 | 0 inland, 1 offshore, 2 reef, 3 bar, 4 surf, 5 swash, 6 berm, 7 backshore, 8 foredune, 9 platform, 10 bluff-toe, 11 bluff-face, 12 bluff-crown | inland 11,858,979 / offshore 3,628,976 / reef 290,488 / bar 108,883 / surf 333,258 / swash 214,689 / berm 51,489 / backshore 65,757 / foredune 105,459 / platform 71,744 / bluff-toe 15,044 / bluff-face 11,935 / bluff-crown 28,708 |

GLSL constants for every label exist in `geology.glsl` (`LANDSCAPE_GEOLOGY_DEPOSIT_TYPE_*`, `_DRAINAGE_*`,
`_COASTAL_ZONE_*`, the layer indices and the channel scales); `tests/node/unit/landscape_synthesis_geology.test.js` keeps
them equal to the JavaScript catalogs.

### 3.4 Lithology: recovering the stratum from the label

`strata` writes `lithology = 1 + ((index mod 255) + 255) mod 255` where `index` is the signed stratum number relative to the
dipping datum (`operators/Strata.mjs`). Unwrap: `index = L − 1` for L ≤ 128, `index = L − 256` for L ≥ 129 (v3 holds
L 1–17 → strata 0–16 and L 244–255 → strata −12..−1). Stratum geometry from `recipes/coastal-v3.json` (operator `strata`):
datum dipping **12 m/km east and −4 m/km north**, warped 3 m at a 350 m wavelength; thickness **4 m × [1, 0.6, 1.2, 0.5]**
and hardness **[0.9, 0.3, 0.7, 0.2]** (1 hardest) cycling with the pattern slot `k = ((index mod 4) + 4) mod 4`, plus a
±0.1 grain noise on the hardness (two octaves, 50 m). The hardness layer itself is engine internal (not published);
`derive-land-cover` used it (threshold 0.6) for the exposed-bedrock rock rule. Banding on a face therefore follows planes
of that dip, not the slope axes; AI 598's strata and AI 602's faces read the same labels.

### 3.5 Samplers

- `sampleLandscapeGeologyPage(pixels, layout, chunk, x, z)` → decoded field channels: bilinear on the encoded bytes at texel
  centres, then decode (exactly the GPU path); `sampleLandscapeGeologyPageUnits` gives the eight unit values,
  `decodeLandscapeGeology(units)` the decode.
- `sampleLandscapeGeologyCategory(labels, chunk, x, z)` → the four labels of the nearest aligned sample (never interpolated).
- `landscapeGeologyStaleness(geology, landscape)` applies the terrain-field staleness: a native whose height or land-cover
  hash changed is stale, a page stale/partial/fresh, an 8 × 8 cell grid of stale cells. Stale pages are never used silently;
  re-run the leaf after an edit (section 11).
- GLSL: `landscapeGeologyDecode(vec4 l0, vec4 l1)` → `LandscapeGeology` struct, `landscapeGeologyCategory(float texel)` →
  label; the chunk declares no uniforms, the consumer binds the pages (the terrain-field array shows the pattern:
  `LANDSCAPE_TERRAIN_FIELDS.md`, "Runtime").

## 4. Derived natural land cover

`derive-land-cover` (output family, after `geology-channels`, `outputs.coverPolicy: 'derive'`) writes the native land
cover of v3 in a fixed precedence, every rule a catalog parameter recorded in the recipe and the receipt
(`d4/v3/coastal-v3.md`, "Land cover derivation"):

1. planning classes **5 urban, 6 road, 7 runway** copied from the source cover exactly (2,991,592 samples; 0 mismatches);
2. **0 water** below sea level (4,447,457 samples);
3. **1 sand** where the deposit is beach or dune sand (372,837 decided) or the coastal zone is swash, berm, backshore or
   foredune (0 further samples);
4. **4 rock** where `faceMask` ≥ 0.5 (10,315), the slope ≥ 40° (56,407), talus ≥ 0.5 m (46,306) or hard bedrock is exposed
   (mantle ≤ 0.05 m, slope ≥ 25°, hardness ≥ 0.6: 82,997);
5. **2 grass and scrub** on alluvium valley floors (alluvium ≥ 0.3 m on slopes ≤ 6°: 60,547);
6. otherwise the source class where it is natural (8,716,951 kept: the v2 forest/grass partition wherever the geology is
   neutral) and class 2 where the source held water (0 emerged samples).

Result (classes of `LANDSCAPE_LAND_COVER_CATALOG`): water 4,447,457 (−2,009), sand 405,956 (+34,966), grass 645,862
(+56,260), forest 8,039,340 (−222,423), rock 255,202 (+133,206), planning 2,760,708 / 211,900 / 18,984 (identical);
260,848 of 16,785,409 samples changed; the full from → to matrix is in the receipt. The soil of each class is the
catalog mapping of `LANDSCAPE_MODEL.md` (seabed, sand, loam, forest, rock; planning → `unknown` with the terrain-driven
natural inference of the fields). Land cover is a semantic channel: AI 598's substrate and cover layers refine it, they
never rewrite it.

## 5. Coastal zone classes and the geometry targets met

Measured natively on v3 (`d4/v3/targets.md`, 44 of 44 rows pass; the declared column-B targets of the D1 decision):

| Landform | Measured | Target |
| --- | --- | --- |
| High-city rim (zone `inland`, district 4 escarpment) | face 26.6 m at 59.1°, talus 33.0° (4 rim profiles) | 20–30 m at 55–65°, talus 30–35° |
| West bluff (`bluff-crown` / `bluff-face` / `bluff-toe`, 55–120 m from the design shoreline) | face 11.6 m at 68.0° (14 of 14 transects, foot 112–114 m from the shoreline) | 10–16 m at 60–75° |
| Wave-cut platform (`platform`) | 30 m wide at +0.64 m (median of 13 transects, 26–32 m, +0.53…+0.89 m) | 20–40 m at +0.5…+1.5 m |
| Beach berm (`berm`, `backshore`) | 1.80 m high at 31.5 m from the waterline (13 of 13 transects) | 1.5–2.0 m at 25–40 m |
| Foreshore (`swash`) | 2.81° (1:20) | 1.9–3.8° |
| Foredune (`foredune`) | 3.27 m on 11 of 13 transects, 105,459 samples, none in the open-view corridor or a district | 3–6 m where space permits |
| Talus | 299,370 talus samples; rim talus 33.0°; bluff wedge 4% of the cut volume | repose 30–35° |
| Natural slope shares ≥ 10 / 20 / 30° | 17.7 / 3.3 / 2.3 %, steepest 85.8° | ≥ 10 / 3 / 1 %, ≥ 65° |
| Local relief p90 over 100 / 500 m | 14.23 / 48.41 m | ≥ 14 / 40 m |
| High city above the skyline from NW-08 / NW-01 / NW-09 | 3.69° / 1.35° / 1.70° | ≥ 3.5 / 1.3 / 1.7° |

Hard plan constraints (all pass): district bands and ≥ 99.2% flat urban samples, designed district edges (30° embankments
with a 5 m blend on districts 1, 2, 3, 5, 6, 7, the escarpment on 4; never a feather), 41 of 41 roads on their alignments
at 5.80% sustained / 5.81% short, shoreline within 0.50 m of the design (tolerance 10 m, no headlands or coves inside the
extent), beach arrival 2.51 m flush, bus stop 2.65 m ± 0.02, sea visible from 1,164 m of the corridor descent, swim zone
0 disallowed samples with a seabed p95 slope of 4.8°, sea level Y = 0, planning cover exact.

## 6. Bathymetry (for AI 597)

The seabed is the native heightfield below Y = 0 (3,628,976 `offshore` + reef, bar and surf samples), shaped by
`coastal-beach` (`offshoreMode: replace`), `coastal-nearshore` and `coastal-reef` (`recipes/coastal-v3.json`), measured on
13 shore-normal transects Z 300 … 3900 (`d4/v3/targets.md`, profiles `d4/v3/profiles-bathymetry.png`):

| Element | Measured | Where |
| --- | --- | --- |
| Equilibrium profile | Dean `h = A·x^(2/3)` with **A = 0.137 m^(1/3)** (least squares, rmse 0.05–0.32 m) from the waterline to **−8 m at a median 444 m** offshore | the whole coast |
| Shelf | **1.98°** from −8 m to the **−30 m floor** (the floor is reached on 6 of 13 transects; elsewhere the sea is narrower than the shelf) | west of the extent |
| Nearshore bar (`bar`) | crest **−2.21 m at 111 m** seaward (13 of 13 transects: −2.08…−2.32 m at 107–118 m); the trough lies shoreward | the whole coast |
| Reef (`reef`, deposit `reef-rock`) | 290,488 samples 150–450 m off the bluff sector, tops p05 −3.99 / p50 −3.11 / p95 −1.81 m (min −6.29, max −1.00); 0 in the swim zone | off the west bluff |
| Swim zone | clean sand, 0 disallowed samples, seabed p95 slope 4.8° (47,184 land / 117,969 water samples) | southwest |
| Surf and swash (`surf` 333,258, `swash` 214,689 samples) | the 1:20 foreshore (2.81°) from the bar to the berm crest | the whole beach |
| Beyond the extent | the surround continues the Dean/shelf profile to a **−60 m floor** (`recipes/coastal-v3-surround.json`, `coastal-beach` shelf to 20 km; the seabed differs from v3's −30 m floor by at most 4.5 m at the boundary, blended over 30 m) | surround, section 9 |

`waveExposure` carries the open-fetch exposure of each shore sample inland over surf and swash (headlands 1, sheltered 0;
`coastal-exposure` in the recipe; v3 land mean 0.010 because the channel is zero away from the shore). Sample it rather than
assume it: the shoreline inside the extent has no headlands or coves (within 0.50 m of the design line). The water reference
plane stays at Y = 0 and never converts seabed into sea; picking and queries use the heightfield.

## 7. Hydrology (for AI 597 D6, AI 600, AI 603)

- **Drainage classes** (`drainage`, from the final surface's contributing area and incision): hillslope 10,080,384, rill
  213,646, gully 119,628, channel 12,831, flat-pond 1,911,463, sea 4,447,457 samples. The incised network measured on
  natural land: **65 drainage lines with ≥ 3 m incision over ≥ 50 m** (536 networks hold such a sample), incision p90
  5.77 m (`d4/v3/targets.md`); the map `d4/v3/drainage.png`.
- **Ponds and creek floors**: fluvial erosion routes through Priority-Flood ponds and `sediment-deposit` fills valley floors
  (alluvium 6,716,968 samples, of which 60,547 became grass on floors ≥ 0.3 m thick at ≤ 6°). The terrain fields' depression
  analysis of the same surface (`fields/manifest.json`, `statistics.flood`) fills **1,911,391 samples** in **1,080 flats**
  (1,911,463 flat samples, 0 undrained) with a **maximum fill depth of 9.70 m**; `flat-pond` also includes the flat
  district pads, so a pond candidate is a `flat-pond` sample with a positive fill depth outside planning cover.
- **No inland water surface is published**: cover class 0 is exactly the 4,447,457 samples below sea level (= drainage
  `sea`), and no channel carries a water level above Y = 0. AI 597 D6 either records that and closes, or derives calm
  water from the pond candidates above (its own data-only product, never a terrain edit).
- Fields `wetness` (TWI), `flow` and `deposition` are the moisture inputs of AI 600/601/603; `shoreDistance` is signed,
  land positive, clamped ±256 m, exact at the sea-level polyline (4,882 segments on v3).

## 8. The terrain fields sidecar on v3

`LANDSCAPE_TERRAIN_FIELDS.md` is unchanged in contract; on v3 (`fields/manifest.json`): revision
`terrain-fields-8ae5a126ff397de346c5aea3`, 341 field pages of 1,089,936 B (261² × 4 layers; 371,668,176 B, every page
unique), 172 natural-soil pages (161 unique, 10,633,889 B) for the 2,991,592 planning samples (inferred sand 17,132 / loam
1,127,093 / forest 1,624,678 / rock 222,689, 64 speckle samples), recipe `recipes/terrain-fields-coastal-v3.json` (the v1
recipe with `workingLimitBytes` 1,879,048,192 = 1,792 MiB for the 4097² full-grid assembly), baked in 103.4 s inside the
synthesis write. Channels and decode: wetness, flow, deposition, rockExposure (layer 0), skyView, shoreDistance
(signed-square ±256 m), convexity, slope (layer 1), eight horizons (layers 2–3). The runtime mirror is
`chunks/landscape/terrain_fields.glsl` and the hook `terrainFieldsSample`.

## 9. The far-field surround (for AI 597 and AI 600; excluded by AI 599–603)

Contract: `LANDSCAPE_STREAMING.md` "Far-field surround (AI 596 D5)", `LANDSCAPE_VIEWER.md` "AI 596 D5 far-field surround",
runtime `src/graphics/engine3d/landscape/LandscapeSurround.js`, `LandscapeSurroundModel.js` (`landscape-surround-v1`).

- **Document**: a standalone schema-1 landscape `coastal-city-v3-surround` (revision `synthesis-857ae85a2b611d24990fafdc`)
  published 2026-10-10 under `coastal-city-v3/surround/`: 2049² at 15.625 m, bounds −14,000..18,000 m on X and Z (32 × 32 km
  centred on the extent), `chunkIntervals` 256, `maxLevel` 3, 85 nodes, heights −60.0..428.6 m, land/sea 53.2 / 46.8 %
  (73.4 / 26.6 inside the extent), 118 payload files, 26.99 MB by manifest; no references, appearance, fields or geology;
  provenance `procedural-synthesis` with `preparation.surround = {landscapeId: 'coastal-city-v3', revision:
  'synthesis-7045f619de9de74a367bc3a8', manifestSha256: '3846aed4…', extent: {0, 4000, 0, 4000}, boundaryHash:
  '638288327f66421a4b4e4e9c598b5c7b2b665a63e4ec7a643b1c085d74d78508'}` (the SHA-256 of v3's native heights along the north
  row west → east, the south row west → east, the west column north → south and the east column north → south, float32
  little-endian). Receipt `tests/artifacts/screens/landscape/ai596/d5/surround/surround.md`: inside the extent the surround
  equals v3 decimated ×16 (66,049 samples, 0 mismatches); boundary steps to the first outside sample max / p90 north
  3.99 / 0.48 m, south 4.51 / 0.30, west 2.51 / 2.38 (the shelf below v3's −30 m floor), east 0.39 / 0.25; the far shoreline
  continues the design line within 0.8–1.0 m at z 4000 / z 0; 8 spur headlands displace the far coast 420–604 m seaward;
  4 massifs (242–421 m, 17–22 km away) stand 0.27–0.88° above the far-edge line from NW-11.
- **Binding**: the runtime draws the surround only when `bound` (same landscape id, revision and manifest hash, extent =
  landscape bounds); `unbound`, `stale`, `invalid`, `absent` and `failed` hold no resources and are reported in
  `snapshot().surround`. A terrain edit or regeneration changes the revision and the boundary hash, so the surround must be
  re-published (`landscape/synthesis/surround --publish`) after every new v3 revision; the cache bundle verifier refuses a
  surround that names another terrain.
- **Not authoritative**: never edited, queried, reported or picked; `pickPoint` uses only the authoritative meshes and a
  ray that leaves the landscape reports no terrain; `select` beyond the bounds is refused. No content layer places anything
  on it.
- **Water extent contract (AI 597)**: while the surround is active the water reference spans the surround bounds
  (`createLandscapeWaterReference({bounds})`, `snapshot().water.extent === 'surround'`), otherwise the landscape bounds. The
  animated ocean must cover every surround sample below sea level out to the surround bounds, must never intersect
  surround land, continues over the surround's seabed (the Dean/shelf profile to the −60 m floor; v3's own shelf flattens at
  −30 m inside the extent), and reads `preparation.surround` to know which landscape revision its far field continues (a
  stale block means the ocean's far field is stale too).
- **Runtime shape**: a second `LandscapeStreamer` in render-only mode (no appearance, no surface cache, natural inference
  `overview`, target 3 px, one worker, the upload allowance the authoritative stream leaves), soil-palette shading (per
  display soil the mean linear albedo of the material's 32 px base-colour page under its correction, its natural-ground
  response and its mean roughness/AO), mesh exclusion over the landscape bounds (inside tiles never built; straddling tiles
  take the authoritative overview samples on the boundary, a 1.5 m skirt inside and a 4.5 m boundary wall, drawn behind
  coincident authoritative tiles), ledger kind `landscape-surround` with its own 128 MiB CPU / 96 MiB GPU share.
- **Cost** (`LANDSCAPE_PERFORMANCE.md`, "Far-field surround"): on the natural-world route at 640/544 MiB, 19 tiles resident
  (L2 15, L3 4), 108.0 / 70.1 MiB CPU / GPU, ≈ 2.5 M triangles, +0.45–0.8 ms GPU at the route median, ≈ 15 authoritative
  leaves per ground stop; frames stay vsync-bound.

## 10. Review poses and capture tools

- Poses: `tools/landscape_review/poses/natural-world-v1.json` (NW-01..NW-13, the roadmap §8 intents; eye-height poses
  re-resolve the ground on every revision — on v3 NW-03 1.84 m, NW-04 15.13 m, NW-07 40.99 m) and
  `poses/ai596-d3-fixture-v1.json` (F-01..F-08 on the 1 km fixture). A new pose set is a new versioned file.
- Capture: `node tools/landscape_review/capture.mjs --landscape <saved landscape directory> --output <dir> [--poses <file>]
  [--select NW-01,NW-04] [--label <text>] [--water on|off] [--planning on|off] [--width 1920 --height 1080]
  [--surround auto|off|<url>] [--allow-missing-appearance on]` — serves the directory itself on a free port, settles streaming,
  appearance, lighting (and the surround), screenshots the canvas and writes a receipt per pose with the resolved ground,
  revision and settle state.
- Composite: `python tools/landscape_review/composite.py --output out.png [--grid N] [--title …] reference=ref.webp
  before=v2/NW-04.png after=v3/NW-04.png` (fixed layout and colours; `[reference | before | after]` is the project rule).
- Matched sets on disk: v2 at every pose `tests/artifacts/screens/landscape/ai596/d1/poses/v2/`, v3 `d4/poses/v3/`,
  composites `d4/composites/` (`pose-NW-01..13.png`, `v3-R03-NW-07.png`, `v3-R04-hillshade.png`, `v3-R07-NW-11.png`,
  `v3-R10-NW-03.png`, …), surround on/off `d5/poses/`, `d5/composites/`; the review report `d4/REPORT.md`.
- Measurement harness: `tests/headless/e2e/landscape_resolution.pwtest.js` with `LANDSCAPE_RESOLUTION_FIXTURES=<id or
  directory>`, `LANDSCAPE_RESOLUTION_ROUTE=natural-world`, `LANDSCAPE_RESOLUTION_SURROUND=on|off|<url>`,
  `LANDSCAPE_RESOLUTION_ARTIFACTS=<dir>` (serves the landscape itself; startup, residency, uploads, GPU/CPU ms, picking and
  query exactness per stop; `LANDSCAPE_PERFORMANCE.md`, "Fixture resolution harness").
- Flyover: `tools/landscape_flyover/` (tracked; see its README) renders a feature-showcase video from a versioned route
  (`routes/coastal-v3-features-v1.json`: offshore view, reef and bar, west bluff, beach, swim beach, terraced districts,
  eroded hills, high city, surround), validated per frame against the native and surround ground before flying, with a
  HUD (height above ground or water, altitude, minimap, feature captions); `--mode plan|stills|render`. The earlier
  70 s keyframed route scripts remain as gitignored artifacts under `tests/artifacts/screens/landscape/flyover/scripts/`
  and the D5/D6 copies (world-edge detector) under `tests/artifacts/screens/landscape/ai596/d5|d6/flyover/scripts/`.

## 11. Leaves, recipes, regeneration and the edit replay order

Leaves (`node tools/bake.mjs --target …`; all Node only, excluded from `all` and the `landscape` import parent;
`tools/bake_landscape/terrain_synthesis/README.md`):

| Leaf | Recipe | Produces |
| --- | --- | --- |
| `landscape/synthesis/relief-study [--publish]` | `terrain_synthesis/relief_study/recipes/relief-{a-v2-sharpened,b-raised-80,c-dramatic-160}.json` | D1 diagnosis and variants (`d1/`), published as `coastal-city-ai596-<variant>` |
| `landscape/synthesis/fixture` | `terrain_synthesis/fixture/recipes/plateau-road-shoreline.json` | D2 gate on the 1 km fixture (19/19 checks, geology candidate, review maps, `d2/fixture/`) |
| `landscape/synthesis/resolution-study [--publish] [--set "landscape/synthesis/resolution-study:city-extent=true\|only"]` | `fixture/recipes/plateau-road-shoreline{,-0977,-0488}.json`, `city-extent-{1953,0977}.json` | D3 fixtures `ai596-d3-fixture-<tag>` and the measurements (`d3/resolution/`) |
| `landscape/synthesis/coastal-v3 --publish` (options `working=1953`, `fields=none`, `geology=none\|publish`, `replay-edits=<previous landscape>`, `landscape-root`) | `terrain_synthesis/recipes/coastal-v3.json` (34 operators), `terrain-fields-coastal-v3.json` | v3 terrain, hierarchy, references, fields and geology (1,028 s on the native grid, engine 863 s, peak 1,985 MB tracked of the 3 GiB ledger; the geology preparation under a 1.5 GiB limit); receipt `d4/v3/coastal-v3.{json,md}` |
| `landscape/appearance --set "landscape/appearance:directory=assets/public/landscape/coastal-city-v3" --set "landscape/appearance:multiscale=tools/bake_landscape/appearance/multiscale-v1-coastal-city-v3.json" --publish` | the shipped multiscale request for the v3 id | the v3 appearance (6.1 s; needs the shared `pythonExecutable`) |
| `landscape/synthesis/surround --publish` (options `landscape`, `recipe`, `output`) | `terrain_synthesis/recipes/coastal-v3-surround.json`, plan `terrain_synthesis/surround/plan/far_shoreline.json` (re-authored by `surround/plan/author.mjs`) | the surround sidecar bound to the installed v3 (43.6 s); receipt `d5/surround/surround.{json,md}` |

Regeneration (`LANDSCAPE_EDITING.md`, "Regeneration and replay"; `tools/bake_landscape/README.md`, "Publishing v3"):
**recipe → saved landscape → fields and geology sidecars → replay of accepted batches → appearance bake → surround**.
Explicit edits are never baked into the recipe: `node tools/landscape_authoring/run.mjs replay --previous <previous
landscape> --directory <regenerated landscape>` (or the leaf's `replay-edits`) re-applies the previous publication's
accepted batches in acceptance order through the bounded store with `replayedFrom` provenance, idempotently; a batch the
new terrain invalidates is reported with a code, never dropped. A replay or any edit stales the field and geology pages of
the changed natives and the surround's binding (new revision and boundary hash): re-run `landscape/terrain-fields`, the
geology publication and `landscape/synthesis/surround`. Recipe overrides (`recipe.overrides[]`: `import`, `region`,
`operator`, `exclude`) are the data-only fine-tuning hooks of the procedural-first contract; interchange maps (RAW
float32, PNG 8/16, EXR with `<file>.meta.json`) import external terrain as provenance-tracked inputs.

Determinism: repeat runs of a recipe are bit identical for the same identity (gate check `determinism`), the fields and
geology bakes verify a second identical run, and a regenerated publication reproduces its manifest bytes and snapshot
name only if nothing in the recipe, inputs or engine changed — verify with `verifyLandscapeCacheBundle` and the pin test
(`landscape_cache_availability.test.js`) rather than assuming it.

## 12. Budgets after AI 596 (`LANDSCAPE_STREAMING.md`, `LANDSCAPE_PERFORMANCE.md`)

| Budget | Value |
| --- | --- |
| `LANDSCAPE_STREAMING_BUDGETS` (surface cache off) | 640 MiB controlled CPU / 352 MiB estimated GPU (512/256 before D5) |
| `landscapeSurfaceCacheBudgets` (cache on, the default) | 640 / 544 MiB up to 1920 × 1080, 640 / 684 at 2560 × 1440, 640 / 1046 at 3840 × 2160 (448 / 588 / 950 before D5); `streamReserveGpuBytes` 352 MiB, cache ceiling 192 MiB unchanged |
| Render-only surround share inside both profiles | 128 MiB CPU / 96 MiB GPU (`LANDSCAPE_SURROUND.budgets`, kind `landscape-surround`); the raise above is exactly this share, so the authoritative streams keep their pre-D5 512 / 256 |
| Appearance ceilings | 320 / 176 MiB |
| Terrain-field array and decodes | one eighth of each total, inside the shared limit |
| Per frame | one geometry tile and 8 MiB of combined uploads (geometry, surround, appearance, planning) |
| Geometry target | 1.5 px authoritative, 3 px surround |
| Sidecar manifests | 1 MiB (terrain, fields, geology; 256 KiB before D3); fields/geology runtime decode credit 3 MiB |
| Query radius | `landscapeQueryRadiusLimit(manifest)` = half the native chunk span: 125 m on v3 (250 m on v2) |
| Smoothing | 16 native samples per axis below 1.5 m spacing (15.625 m reach on v3), 8 above |

Measured residency on v3 with the surround at the shipped profile (`d5/browser/`, natural-world route, 1920 × 1080, cache on,
RTX 3060 through ANGLE/D3D11): lifetime peaks 565.6 / 543.9 MiB, GPU 6.65 / 8.18 ms median / p95, 60 FPS vsync-bound, the
1.5 px goal met at the overview, NW-08, orthographic and return stops and missed with `gpu-budget` at NW-10, NW-03 and
NW-01 (the D4 finding carried into D6). The D6 same-condition tables against v2 are written under
`tests/artifacts/screens/landscape/ai596/d6/performance/` (cache on at 640/544: v2 GPU 1.03 / 2.74 ms, v3 with the
surround 5.01 / 6.83 ms, both vsync-bound at 17.50 / 18.10 ms; cache off at 640/352: v2 stays vsync-bound, v3 is GPU-bound
at 17.60 / 35.10 ms cold, 51.4 FPS — the surface cache is what keeps v3 at vsync; the GPU was not idle, the Codex desktop
app's process held 29–41%). A later prompt that adds GPU work measures against these
numbers and grows a budget only with the accounting the roadmap §10 requires.

## 13. Known limitations and open items

- **Heightfield faces vs rock geometry (AI 602).** The high-city rim faces (26.6 m at 59°) and the bluff faces (11.6 m at
  68°) render as pale, vertically stretched walls with sawtooth shading; `faceMask` marks exactly where the heightfield
  stops being faithful (smoothstep 55–75°). Rock geometry is AI 602's layer; AI 598's strata banding reduces the stretch
  but does not replace geometry.
- **Bluff reads as one dark rock band.** Talus, platform and face are measured and classified but not yet distinguishable by
  material (AI 598 lithologies and AI 602 slabs).
- **Forest rock speckle.** The derived rock class peppers the forest with isolated samples (about 1.6% of forest; the rock
  rules decide per sample, so single steep or thin-mantle samples flip). AI 598/601 should treat an isolated rock sample
  inside forest as an outcrop candidate, not a cover break, or filter it by a minimum patch size.
- **Needles.** The native run leaves one one-sample spike of 2.39 m at (672, 3587), −4.0 m in the sea off the bluff sector
  (reported, below the land gate); the surround carries 32 spikes up to 7.16 m within the 30° repose plane of its 15.6 m
  cells. Neither is on land inside the extent.
- **R10 reference missing on disk.** Only R01–R07 are saved under `tests/artifacts/screens/landscape/references/natural_world/`;
  R08–R10 were supplied in conversation, so the R10 composite sheets carry a labelled placeholder in the reference slot.
  Save `ref10_coastal_bluff_strata_platform.webp` (and R08, R09) before AI 597/602/603 compare against them.
- **Near-boundary seam ring.** Looking along the extent boundary from within 300 m, the chord error between the surround's
  15.625 m samples and the native relief (max 3.4 m, p95 ≤ 0.7 m) shows as a scalloped colour edge, sub-pixel beyond about
  1 km; a finer boundary ring (the native boundary rows as a small sidecar) is the recorded fix. The surround also carries no
  field pages, so macro variation, catena tinting, rock exposure and wetting stop at the boundary (the soil palette matches
  the mean tones: NW-11 step 17.6 sRGB, NW-10 57.7 of which most is aerial perspective).
- **Surface-detail mode naming at 0.977 m.** `landscapeSurfaceDetail=50cm|25cm` counts levels below the native grid
  (`LANDSCAPE_SURFACE_DETAIL_MODES = {off: 0, '50cm': 2, '25cm': 3}`), so on v3 the modes generate pages at 0.244 m and
  0.122 m; the names describe the 1.953 m grid. The viewer's `25cm` default therefore costs more on v3 than on v2; a
  rename or a spacing-based mode is open.
- **Surround residency of the published revision.** The timed surround runs used the earlier published revision
  `synthesis-3034994a…` (same grid and node count); the refined `synthesis-857ae85a…` was not re-timed in D5 (the GPU was
  held by another session). D6's performance tables re-measure it.
- **The massif stays a smoothstep dome under the erosion**, the plateau's rock rims are faces of a heightfield, and
  `inputs.plan.landCover` PNG decoding in `plan-inputs` is not implemented (cover comes from the imported landscape).
- **The viewer defaults stay v2**: the default server's authoring API targets v2 unless `LANDSCAPE_DIRECTORY` points at v3,
  and the existing e2e suites keep their v2 constants (`COASTAL_V2`); v3-specific runs serve v3 themselves.
