# Original urban vegetation library

Current revisions are London plane v6, arrowwood viburnum v6, silver linden v5
and northern red oak v5, plus [American elm v1](american_elm.md). [Solid species leaves](solid_species_leaves.md) defines
the current opaque 3D foliage contract and supersedes the earlier card material
rules below. `detailed_tree_trunks.md` describes the preserved wood. The manifest
schema remains v3; historical inventories below are explicitly earlier versions.

## Scope

The library contains five species and three mature forms per species, fifteen
models total. AI578 replaces the original low-cost wood with detailed 3D trunks;
its current contract is [detailed_tree_trunks.md](detailed_tree_trunks.md).
The historical v2 costs and evidence below describe AI577 and do not cap the
new detailed geometry. There is one implementation, with no Desktop/Mobile
choice, duplicate edition or quality parameter for this original family.

The existing city's tree models, placement and derived lighting/visibility data
remain on their existing path. Original models are available in the Inspector
Room and through the library loader. The earlier `treeSpecies` gameplay hook and
its provisional bake-identity fields are removed. Future city replacement is a
separate request, including the required production bake validation.

"Bold leaves" means plentiful foliage and crown coverage. Variants are mature
structures, not young/mature age swaps or the same model at different scales.
The shrub is not a shrunken tree: it grows from multiple low stems.

## Species and identifiers

| Species key | Scientific name | Collection ID | Growth habit |
| --- | --- | --- | --- |
| `london-plane` | *Platanus × acerifolia* | `mesh_collection.london_plane` | Broad irregular crowns, pale exfoliating bark, lobed leaves |
| `silver-linden` | *Tilia tomentosa* | `mesh_collection.silver_linden` | Tapered mature crowns, gray ridged bark, heart-shaped leaves with pale undersides |
| `northern-red-oak` | *Quercus rubra* | `mesh_collection.northern_red_oak` | Substantial spreading branches, broad bark ridges, elongated pointed-lobed leaves |
| `arrowwood-viburnum` | *Viburnum dentatum* | `mesh_collection.arrowwood_viburnum` | Rounded, irregular and hedge-like mature multi-stem bushes with serrate ovate leaves |
| `american-elm` | *Ulmus americana* | `mesh_collection.american_elm` | Tall clear stems, broad elevated vase crowns, arching branches, asymmetric double-serrated leaves |

Every species has `mature_01`, `mature_02`, `mature_03`. Catalog entry IDs follow
`tree.<species-key>.<variant>`. Each records `growthStage: 'mature'` and the kind
`tree` or `shrub`; no original entry carries a quality field. Existing legacy
collection IDs retain their previous meanings independently of this library.

## Authoring and publication

Reproducible sources live in `tools/bake_vegetation/`, with shared geometry/map
authoring under `authoring/` and distinct species recipes. The existing framework
owns planning, input authentication, staged validation and optional publication:

```sh
node tools/bake.mjs --target vegetation --dry-run
node tools/bake.mjs --target vegetation
node tools/bake.mjs --target vegetation --publish
node tools/bake.mjs --target vegetation/silver-linden --publish
```

The domain contains five independently callable species leaves, is opt-in and is
not added to `all`. Headless Blender uses the shared ignored
`tools/baking/blender.local.json`, isolated output paths and limited CPU resources.
No occupied interactive Blender session is reused. Asset publication alone never
publishes city lighting, shadow or visibility data.

Outputs use underscore folder names under `assets/public/vegetation/`:
`london_plane`, `silver_linden`, `northern_red_oak`, `arrowwood_viburnum`, `american_elm`.
Each contains `mature_01.glb`, `mature_02.glb`, `mature_03.glb`, texture maps,
`index.json` and `PROVENANCE.md`. AI578 advances authoring revision IDs to
`<species-key>-v3` and adds editable per-form Blender sources.
The existing ignored/shared asset-distribution policy remains in effect.

GLBs use metres, Y up and ground-level base Y=0. Each contains bark and foliage
primitives. The v2 profile capped trees at 12,000 triangles, using low-sided
branch tubes, selective roots and leaf cards. AI578 supersedes that wood and its
triangle cap with physical bark relief and continuous branch junctions while
preserving foliage. Models and textures are independently authored, without
licensed-pack inputs. Optimization of the detailed wood is deferred.

Tree atlases contain thirteen natural-size leaves per twig cell; shrub cells
contain nine. Greater card retention and foliage along inner/middle branches
provide coverage. Linden has narrower mature crowns to retain density within the
paired-face budget. Leaf enlargement and opaque crown shells are not used.

## Historical v2 inventory (AI577, 2026-10-03)

Dimensions below are actual exported bounds, width × height × depth in metres.
File size includes embedded PNG maps; MiB means 1,048,576 bytes. All models have
two material draws per plant in a single color pass, before shadow/other passes.

| Species | Mature form | Bounds (m) | Triangles | GLB MiB |
| --- | --- | --- | ---: | ---: |
| London plane | 01 | 12.75 × 12.51 × 12.65 | 10,592 | 3.33 |
| London plane | 02 | 12.58 × 11.35 × 14.03 | 11,282 | 3.38 |
| London plane | 03 | 13.01 × 14.81 × 13.32 | 11,020 | 3.34 |
| Silver linden | 01 | 9.01 × 16.04 × 8.21 | 11,566 | 2.25 |
| Silver linden | 02 | 9.48 × 15.28 × 8.90 | 11,168 | 2.20 |
| Silver linden | 03 | 8.98 × 16.69 × 7.88 | 11,038 | 2.20 |
| Northern red oak | 01 | 13.54 × 13.68 × 15.01 | 10,952 | 2.28 |
| Northern red oak | 02 | 14.84 × 11.93 × 16.01 | 11,664 | 2.33 |
| Northern red oak | 03 | 12.02 × 14.68 × 14.05 | 10,812 | 2.26 |
| Arrowwood viburnum | 01 | 3.56 × 2.69 × 3.55 | 3,542 | 1.31 |
| Arrowwood viburnum | 02 | 4.71 × 3.40 × 4.11 | 4,186 | 1.35 |
| Arrowwood viburnum | 03 | 5.34 × 2.35 × 3.24 | 4,830 | 1.39 |

## Loading and materials

`src/graphics/engine3d/vegetation/UrbanVegetationLoader.js` exposes
`loadUrbanVegetation({species})`. It resolves a cached, ready family with three
templates, shared `{leaf, trunk}` materials, species key and asset revision. It
rejects invalid species or failed assets explicitly. Inspector entries use the
loader directly and retain authored metric dimensions and ground alignment.
The Inspector fits the actual bounds once the asynchronous original model is
ready, then preserves subsequent manual camera movement. The previous placeholder
fit was too small for mature trees. The existing legacy model scale is unchanged.

Current foliage uses opaque closed shells, front-face culling, no alpha test and
separate upper/lower tissue coordinates, as defined in `solid_species_leaves.md`.
The following card material description records the historical v2–v5 behavior.

All materials use standard metallic/roughness shading: zero metalness, sRGB base
color, linear normals and packed material maps. Texture alpha means coverage.
Hard alpha cutoff 0.5, depth writes and foliage metadata are retained;
`transparent` and alpha-to-coverage are disabled. AO coverage is derived exactly
from the original alpha channel. Shared resources survive inspector disposal.

London plane, oak and viburnum use double-sided flat cards. Silver linden uses
paired front/back geometry with matched silhouettes and distinct atlas color for
the pale underside. Its foliage material renders only front-facing triangles
(`FrontSide`), so the two authored surfaces are visible from their respective
sides without a custom shader or an extra material draw. This exception must be
validated in the manifest, loader and browser tests.

Normal/roughness shading and actual alpha-tested shadows govern sunlight response.
No thickness-dependent transmission, artificial leaf glow, wind or automatic
distance LOD is claimed. These models remain compatible with standard glTF
materials; future game/bake integration still needs its own validation.

## References and ownership

- [Morton Arboretum: London planetree](https://mortonarb.org/plant-and-protect/trees-and-plants/london-planetree/)
  informs crown, lobed foliage and mottled bark. The earlier CC0 bark reference
  copies remain under the first-pass `london_plane/references/` artifact folder.
- [Morton Arboretum: silver linden](https://mortonarb.org/plant-and-protect/trees-and-plants/silver-linden/)
  describes a pyramidal tree, gray bark that develops ridges, and serrate
  heart-shaped leaves with dark upper and silver-white lower surfaces.
- [NC State: northern red oak](https://plants.ces.ncsu.edu/plants/quercus-rubra/)
  informs the rounded mature habit, elongated shallow bristle-tipped lobes and
  broad gray bark ridges with shallow furrows.
- [NC State: arrowwood viburnum](https://plants.ces.ncsu.edu/plants/viburnum-dentatum/)
  informs the arching multi-stem habit, opposite ovate serrate foliage and
  gray-brown fissured stems.

These botanical sources guide morphology; their photographs are not runtime
texture inputs. Geometry and foliage remain original. AI581 uses Rob Tuytel's
[Bark Brown 02](https://polyhaven.com/a/bark_brown_02) from Poly Haven for the
arrowwood bark, under [CC0](https://polyhaven.com/license), verified 2026-10-03.
The source species is unspecified: this is a generic photographic bark treatment
scaled for narrow mature shrub stems. Original maps, download URLs and hashes
are retained with the authoring inputs and publication. Runtime maps remain
embedded in GLBs; no network dependency is introduced. Powered by Poly Haven.

## Historical v2 validation and evidence

The generic `urban_vegetation_showcase` uses an HDRI as environment and visible
background with fixed lighting/exposure. Evidence belongs under
`tests/artifacts/screens/ai577_urban_vegetation/mature_family/`; it remains ignored.
Published asset hashes must remain stable throughout captures.

Focused checks cover all twelve original imports without legacy asset requests,
catalog mappings, mature metadata, distinct geometry, bounds/normal integrity,
triangle/draw budgets, fully ready maps, alpha/AO agreement and linden sidedness.
An existing-game check verifies the library does not change current tree loading.
Screenshots include each species' three-variant lineup, whole plants, low angles,
bark/leaves and front/side/back lighting.

Native-renderer isolated evidence is not full-game profiling or a city bake
certificate. Previous first-pass performance numbers do not describe these new
models. Full-game FPS, actual GPU allocation and fragment overdraw remain
unmeasured unless explicitly instrumented and reported.

### Density and cost comparison

The initial twelve-model export (`candidate_01`) and final library use the same
native alpha-cutout projection: orthographic front view, each plant normalized
to height 1, mask height 256 pixels over 1.3 units, and a sufficiently wide shared
frame within each species. Bark is hidden. Crown occupancy is opaque leaf pixels
divided by the convex hull area of occupied pixel cells. It measures gaps in one
projected crown, not volumetric density, leaf transmission, overdraw or frame rate.
Linden's narrower final shape is part of the authored change, not a camera trick.

| Species | Before triangles, forms 01 / 02 / 03 | Final triangles, forms 01 / 02 / 03 | Before crown occupancy | Final crown occupancy |
| --- | --- | --- | --- | --- |
| London plane | 8,690 / 9,354 / 9,166 | 10,592 / 11,282 / 11,020 | 59.3% / 58.0% / 55.7% | 78.8% / 76.7% / 75.7% |
| Silver linden | 9,622 / 9,328 / 9,246 | 11,566 / 11,168 / 11,038 | 24.8% / 23.6% / 18.7% | 59.7% / 57.9% / 56.2% |
| Northern red oak | 10,020 / 10,674 / 9,922 | 10,952 / 11,664 / 10,812 | 59.1% / 66.4% / 56.5% | 70.5% / 73.5% / 72.7% |
| Arrowwood viburnum | 3,542 / 4,186 / 4,830 | 3,542 / 4,186 / 4,830 | 74.8% / 69.0% / 75.0% | 74.8% / 69.0% / 75.0% |

The density pass spends geometry headroom while keeping two materials. It is not
a measured speedup. Isolated evidence uses Chrome/ANGLE D3D11 on an NVIDIA
GeForce RTX 3060, UHD 3840×2160 captures, ACES tone mapping, exposure 1,
2048-pixel alpha-tested sun shadows, and `german_town_street_2k.hdr` for both
background and environment. The mask probe has the separate resolution above.
There is one deterministic measurement per model per revision; no timing warmup,
timing samples or aggregate timing statistic was collected.

| Performance metric | Before | Final | Scope / reason |
| --- | --- | --- | --- |
| Material draws per plant per color pass | 2 | 2 | One bark and one foliage primitive |
| Triangles | Measured above | Measured above | Actual exported/imported indices |
| Frame time / FPS | Not measured | Not measured | Library and appearance validation; no timing benchmark |
| GPU pass time / fragment overdraw | Not measured | Not measured | No GPU timing or fragment counter instrumentation |
| Actual GPU memory | Not measured | Not measured | Geometry attribute/index byte counts are recorded, not GPU allocation |
| Full-city performance | Not measured | Not measured | New species are deliberately absent from gameplay |

Conservative front-view coverage regression floors are 65% plane, 48% linden,
63% oak and 62% viburnum. These complement visual review and do not require solid,
gap-free crowns. Linden keeps naturally visible inner branches and its pale
reverse surfaces. Standard material limitations described above still apply.

### Completed checks and evidence

- `tests/node/unit/urban_vegetation_catalog.test.js`: 3 passed.
- `tests/headless/e2e/urban_vegetation_assets.pwtest.js`: 2 passed, including the
  default loader's fifteen legacy FBX requests and zero original-family requests.
- `tests/headless/e2e/inspector_urban_vegetation_framing.pwtest.js`: 1 passed;
  the pre-fix camera regression was reproduced before the readiness correction.
- `tests/headless/e2e/inspector_urban_vegetation_assets.pwtest.js`: 1 passed with
  the final 16.04 m linden, seven ready 1024px textures, retained linear packed
  maps, correct paired sides, no legacy requests and no browser errors.
- `tests/headless/visual/specs/harness_urban_vegetation_capture.pwtest.js`:
  1 passed, 41 UHD images and unchanged publication hashes during capture.
- Framework validation passed before and after each publication. Whitespace
  checks passed. Existing `TreeGenerator.js`, `StaticVisibilityCityHash.js` and
  `BakeSourceScene.js` have no changes against the task's original HEAD.

Final evidence root:
`tests/artifacts/screens/ai577_urban_vegetation/mature_family/`.
`capture_report.json` contains the complete authenticated inventory, ready-map
checks and per-model metrics; `density_comparison.json` contains twelve paired
before/after rows. Geometry attribute/index bytes range from 773,976–825,020 for
plane, 827,416–877,060 for linden, 768,036–836,420 for oak and 241,956–329,940 for
viburnum. They are CPU array sizes, not measured graphics-device allocation.

The four `<species_folder>_variants_lineup.png` files show all twelve forms.
Other captures cover each form at three-quarter angle, low angle, bark/leaves,
front/side/back sun, and linden undersides. The actual Inspector capture and its
readiness/framing data are in `inspector/silver_linden_mature_01.png` and `.json`.
That additional capture makes 42 final UHD images. Earlier candidates remain
labeled in their own directories. Close-ups expose the intentional flat twig
cards and simplified intersecting tube junctions; these are low-cost library
models, with no claim of hero-model branch welding or curved individual leaves.

Authenticated framework receipts are under `tests/artifacts/screens/ai556_bake_framework/`:
the final full-family pass is
`run-1791002787397-8480-b281d70f/summary.json`; the later targeted linden shape
pass is `run-1791003225719-34756-94bdc23e/summary.json`. The latter leaves the other
three accepted species payloads intact. No owned Blender/browser process remains.
