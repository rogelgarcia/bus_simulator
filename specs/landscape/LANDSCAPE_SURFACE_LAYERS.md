# Landscape surface layers: substrate, cover, wetness and disturbance (AI 598)

Status: canonical contract of the layered surface model, written per deliverable of AI 598 (prompt
`prompts/AI_codex_landscape_598_MATERIAL_layered_substrate_and_ground_cover_surfaces.md`; completion records there).
D1 (the surface layer model, 2026-10-15) is delivered; D2–D7 extend this page as they land. The roadmap vocabulary is in
[LANDSCAPE_NATURAL_WORLD_ROADMAP.md](LANDSCAPE_NATURAL_WORLD_ROADMAP.md) (§4 layer L2, §7 the coastal catena); the inputs come from
[LANDSCAPE_AI596_HANDOFF.md](LANDSCAPE_AI596_HANDOFF.md) (the geology sidecar) and [LANDSCAPE_TERRAIN_FIELDS.md](LANDSCAPE_TERRAIN_FIELDS.md).

## 1. Why a layered model and what it keeps

AI 577 draws one homogeneous material per semantic soil (`LANDSCAPE_BASE_MATERIALS.md`), so grass reads as a lawn, forest soil as
bare ground and the bluff as one dark band. The surface model separates what the ground is made of (the **substrate**) from what
grows or lies on it (the **cover**, with a fractional coverage) and adds a per-pixel **wetness** and **disturbance**. It refines each
of the six semantic soils (catalog order unknown, seabed, sand, loam, forest, rock) and never rewrites land cover, soil, queries, the
mask pages, the fine pages, the warp, the appearance binding key or any published snapshot. Materials for the classes are AI 598 D2;
drawing them per pixel is D3; D1 delivers the model, its samplers and inspection views and streams the geology the model reads.

Decision record (the 16-sampler wall): the uncached terrain program already binds every fragment sampler WebGL2 allows (six soil base
and surface samplers, the blend pair, the masks, the fields), so the model's inputs ride in the existing terrain-field array (no sampler)
and D3 moves the materials to resolution-grouped texture arrays with streamed slots before it can draw more than six.

## 2. The model (`landscape-surface-model-v1`)

Contract: `src/app/landscape/surface/` (`SurfaceModel.js` catalogs, input vector, strict recipe validation, canonical JSON and
identity; `SurfaceRecipe.js` the default recipe; `SurfaceInputs.js`; `SurfaceDerivation.js`; `SurfaceOverrides.js`), re-exported from
`src/app/landscape/index.js`; GLSL mirror `src/graphics/shaders/chunks/landscape/surface_model.glsl`; runtime
`src/graphics/engine3d/landscape/LandscapeSurfaceModel.js`.

**Substrate classes** (catalog order): `sandstone` (the soft layered coastal strata), `caprock` (the hard strata of rims and ledges),
`scree` (talus, scree and gravel), `dirt` (colluvial dirt, the plain soil), `mud` (alluvial silt and mud of wet floors), `sand` (dry
beach sand), `wet-sand` (saturated, at and below the waterline), `compacted-sand` (the firm damp foreshore inside the swash reach),
`dune-sand`, `cobble` (pebble and cobble beach, the wave-cut platform), `shell-grit` (exposed berms).

**Cover classes** (catalog order): `none`, `turf` (turf and grass sward), `dry-grass`, `moss`, `broadleaf-litter`, `needle-litter`,
`lichen` (crustose lichen of stable rock), `algae` (intertidal algae of the platform and the bluff toe), `wrack` (the line at the
upper swash limit).

**Output per pixel**: eleven substrate weights (sum 1), nine cover weights (sum 1), `coverFraction` (the share of the pixel the cover
occupies before interleaving), `wetness`, `disturbance` (0 until D5 publishes the worn-ground pages) and `availability` (the share of
the model's sources bound at the pixel).

**Input vector** (`LANDSCAPE_SURFACE_INPUTS`, 58 entries, every entry with a documented neutral used while its source is unbound): the
six display soil weights (normalized), `planningShare`, the eight terrain fields (wetness, flow, deposition, rockExposure, skyView,
shoreDistance, convexity, slopeDegrees), the eight geology channels (bedrockOffset, regolith, depositThickness, wear, geologyDeposition,
geologyFlow, waveExposure, faceMask), the one-hot fractions of the labelled geology categories (`deposit.*` 7, `drainage.*` 6, `zone.*`
13) reconstructed bilinearly from the four nearest aligned samples (so every class weight is a continuous function of position; the
ramps are about one native sample wide), the stratum `hardness` unwrapped from the lithology label through the recipe's pattern
(`index = L − 1` for L ≤ 128 else `L − 256`, slot `((index mod 4) + 4) mod 4`, 0.5 where unstratified), the fragment's own
`geometricSlopeDegrees` and `heightAboveSea`, the landscape-scale appearance layer's `catenaMoisture` and `coastalReach`
(`LANDSCAPE_APPEARANCE_RUNTIME.md`, terrain-driven natural appearance), the derived `reachFraction` (height above sea over the reach,
clamped), `disturbance`, and two availabilities: `fieldsAvailability` (the fields' arrival progress times freshness: the fade from the
soil defaults) and `availability` (the mean of the field and geology availabilities).

**Derivation** (`sampleLandscapeSurface(vector, recipe)`, allocation-free with an `out`): per soil with a positive weight, every rule of
the recipe adds `base × Π((1 − w_k) + w_k · smoothstep(e0_k, e1_k, input_k))` to its target (a substrate class, a cover class, the cover
fraction, or the wetness, which takes the largest rule); descending edges invert the ramp. Class weights normalize per soil (a soil
without a firing rule keeps its default class), the fraction and wetness clamp to 0..1, the soil's result fades from its default classes
by `fieldsAvailability`, and the soils blend by their coverage weights. Only products, sums, clamps and the cubic ramp are used, so the
GLSL mirror reproduces the result to float precision.

**Recipe** (`landscape-surface-recipe` schema 1): a plain data document — per soil the default classes, the substrate and cover rules,
the cover-fraction and wetness rules; `strata.hardnessPattern`; `defaults.coverFraction`; and `materials`, the binding of every class
to a material id with per-class parameters (sand, wet-sand and compacted-sand are one material in three states; `dirt` is the existing
plain forest soil; `none` binds nothing). The validator (`validateLandscapeSurfaceRecipe`) rejects unknown inputs, classes a soil may not
use, non-finite numbers and more than 255 rules or 8 terms per rule; the identity `surface-recipe-<24 hex>` is the SHA-256 of the
canonical JSON (sorted keys, weights filled), independent of key order. The default `coastal-surface-v1` (`LANDSCAPE_SURFACE_RECIPE`)
encodes the roadmap's catena: wet, compacted and dry sand by the reach fraction, the wrack line at the upper swash limit, shell grit on
exposed berms, dune sand with dry grass on the foredune, cobble with algae on the platform and the bluff toe, turf over dirt on loam
with scree on convex, dry or steep ground and mud with moss in hollows, broadleaf litter over dirt in the forest thinning at the edge
(the fragment's forest weight), needle litter on exposed dry crowns, sandstone and caprock by stratum hardness, scree on talus, lichen
on stable faces, moss on shaded moist rock and turf on ledges. The thresholds were set on coastal v3 transects (D1 evidence).

**Overrides** (`landscape-surface-overrides` schema 1, identity `surface-overrides-<24 hex>`): data-only regions (circle, rectangle,
polygon) that pin a substrate and/or a cover class, scale the cover fraction and offset the wetness (and carry a disturbance pin for D5),
applied after the procedural pass; later regions win per field. The GPU reads them through one RGBA8 root-grid layer rasterized in the
appearance worker (R substrate pin or 255, G cover pin or 255, B fraction scale as byte / 127, A wetness offset as (byte − 128) / 127;
the neutral texel [255, 255, 127, 128] is exact; pins nearest, scales bilinear; 15.6 m resolution: region-level fine tuning). The layer
sits before the appearance layer and exists only while a document is bound; `landscapeSurfaceOverrides=<url>` binds one on every load
and a requested document that cannot be loaded is an error, never a silent neutral layer.

## 3. Runtime: the geology in the terrain-field array

`LandscapeTerrainFieldPages` loads `geology/manifest.json` beside the fields (statuses `pending`, `active`, `active-partial`, `absent`
(404: every geology input neutral), `invalid`, `binding-mismatch`, `stale`, `budget-denied`, `disabled` (model off)) and, when the geology
is active, allocates the array with **seven layers per native slot**: 0–3 the field page, 4–5 the two geology field layers verbatim,
6 one packed categorical layer whose RGBA bytes are the depositType, lithology, drainage and coastalZone labels copied into the halo'd
page layout with the halo ring edge-clamped (read with `texelFetch` at the four aligned samples, never filtered). The geology rides in
the field page's record: one worker job (`geology`: fetch, SHA-256, decode and pack), one 0.3 s fade with the field page, eviction with
the mask record; a stale or missing geology page leaves the slot's neutral geology block. `uTerrainFieldsState.w` carries the layers per
page (4 or 7) and `.z` the flags: 1 fields active, 2 appearance layer resident, 4 geology bound, 8 override layer resident, 16 model on.
Measured on coastal v3 (17 native slots): the array grows from 18,801,396 to 32,698,080 bytes GPU (33,515,532 CPU) under the fields
ceiling (94 MiB GPU, 98 MiB CPU, one eighth of each total); a native page's upload grows from 1,089,936 to 1,907,388 bytes (the root
page with the appearance layer 2,179,872, the peak upload per frame); the decode reservation per page is 3,814,776 bytes.

Switch: the viewer option `landscapeSurfaceModel=on|off` (default on). Off streams no geology (status `disabled`, four layers per page)
and keeps every model output at the soil defaults: the A/B of the model in one build, used by every later before/after capture.

## 4. GLSL mirror, inspection views, hooks and tools

`surface_model.glsl` includes `landscape/geology` (its first inclusion), reads the geology layers through the slot walk of
`landscapeTerrainFieldsAt` (resident ancestors by arrival progress and footprint), decodes the channels after the array's linear
filtering, builds the one-hot fractions and the hardness from the four aligned categorical samples, reads the override layer, and
evaluates the rule tables, which are compile-time constants of `landscapeSurfaceModelDefines(recipe)` (no uniform, no sampler). In D1 the
chunk compiles into the diagnostics variant only (`LANDSCAPE_TERRAIN_DIAGNOSTICS`): the default, cached, near and generation programs are
untouched, verified by a pixel gate against the before set (mean ≤ 0.031 sRGB bytes, worst 32-pixel block ≤ 2.23 bytes at NW-01, 03, 05,
07 and 13). The diagnostics variant's cold link grows to 25–35 s (every inspection view compiles into one variant); it is linked only
when an inspection view is selected.

Inspection views (ids 13–17 of `LANDSCAPE_DIAGNOSTICS`, raw display colours with the alpha-0 sentinel; fixed palettes in
`LandscapeTerrainDiagnostics.js`, planning cover tinted slate): `surface-substrate` (sandstone orange-tan, caprock saddle brown, scree
gray, dirt brown, mud dark brown, sand pale yellow, wet-sand blue, compacted-sand khaki, dune-sand gold, cobble slate, shell-grit white;
mixed pixels blend by weight), `surface-cover` (none near black, turf green, dry-grass yellow, moss sea green, broadleaf-litter red-brown,
needle-litter orange, lichen pale gray-green, algae dark teal, wrack purple), `surface-fraction`, `surface-wetness` and
`surface-disturbance` (gray 0..1). GPU readbacks of the five views agree with the JavaScript mirror within 0.6 bytes; override pins read
back byte-exact.

Hooks: `surfaceSample(x, z, {height, slopeDegrees, dx, dy})` (the exact mirror over the resident data: the substrate and cover weights,
the dominant classes, the fraction, the wetness, every input, the geology slot and contributions, the override), `setSurfaceModel({mode,
overrides})` (reloads; resolves with the surface snapshot), `snapshot().surface` (mode, overrides URL, recipe id and identity, geology
status, revision, pages, layers per page, override layer state, diagnostics). Tools: `tools/landscape_review/capture.mjs --diagnostic
<view>` captures an inspection view after the settle and `--surface-model on|off` switches the model (both recorded in the receipt).

## 5. Verification (D1)

`tests/node/unit/landscape_surface_model.test.js` (validation and rejections, identity order independence, the catena cases with their
expected dominant classes and fraction ranges, the one-hot and hardness helpers, neutral output without sidecars, overrides and the
override layer round trip, the GLSL table mirror); `tests/headless/e2e/landscape_surface_model.pwtest.js` on coastal v3 (self-serving; both
surface-cache modes): geology active with 17 × 7 layers under the ceiling, uploads under the cap, `surfaceSample` at the berm, foredune,
talus, bluff-toe, forest-interior and escarpment points, GPU parity of the five views, the off switch, the override document and its layer,
coastal v2 without a geology sidecar (`absent`, neutral, no console error). Evidence: `tests/artifacts/screens/landscape/ai598/d1/`
(sheets per pose `[shaded | substrate | cover | fraction | wetness]` at NW-03, 05, 07, 13 with `legend.png`, the diagnostic captures,
the pixel gate, `costs.json`, the suite receipts).

## 6. Limitations and what the next deliverables change

- Planning cover keeps the natural inference of its display soil; no rule reads `planningShare` (the catena's planning exclusion
  reaches the model through `catenaMoisture`, which gates the topographic wetness and mud rules so graded flats stay dry).
- The one-hot ramps of the categorical inputs are about one native sample (0.98 m) wide and straight; D3 displaces them with the
  field-modulated breakup and resolves them through the relief competition.
- Materials are not drawn yet: D2 publishes the class materials as the `appearance/layers.json` companion, D3 composites them.
- The analytic strata (the dipping datum of the synthesis recipe) are D4's; D1 reads the 0.98 m lithology labels only.
- `disturbance` is 0 until D5 publishes the worn-ground pages (the model's input and the override pin are ready).
