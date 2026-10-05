# Species growth form and London plane crevice relief

AI588 separates metre-scale growth sweep from millimetre-scale bark structure.
The profiles below guide an artistic reconstruction, not measured species
curvature or a simulation of historical wind/loading. No universal corkscrew or
periodic sine-wave trunk is applied. Seeded knot positions vary between specimens.

| Species | Documented habit | Modeling interpretation |
| --- | --- | --- |
| London plane, Platanus × acerifolia | Opens and spreads with age; exfoliating irregular bark; young stems zigzag. [NC State](https://plants.ces.ncsu.edu/plants/platanus-x-acerifolia/) | Broad direction changes in the main framework and moderate bole sweep. Twig zigzag is not evidence for a sharply zigzagging adult trunk. |
| Silver linden, Tilia tomentosa | Broad pyramidal crown and erect branches. [NC State](https://plants.ces.ncsu.edu/plants/tilia-tomentosa/). Twigs zigzag and older bark becomes furrowed. [Utah State](https://extension.usu.edu/treebrowser/catalog/linden-silver) | A retained upright leader with restrained, asymmetric sweep and ascending scaffolds. |
| Northern red oak, Quercus rubra | Forest trees develop straight columnar boles; open-grown trees have shorter trunks and spreading crowns. [US Forest Service, Silvics](https://research.fs.usda.gov/silvics/northern-red-oak) | Modest lean/recovery and broad scaffold deflection; keep forest suitability rather than imposing a strongly twisted bole. |
| American elm, Ulmus americana | Long clear forest bole; open-grown trees can fork low and develop an arching, vase-shaped crown. [NC State](https://plants.ces.ncsu.edu/plants/ulmus-americana/) | Smooth trunk sweep and increasingly outward-curving scaffolds; retain the tall-trunk variant requested earlier. |
| Arrowwood, Viburnum dentatum | Multiple ascending basal shoots with straight or arching slender twigs. [Missouri Department of Conservation](https://mdc.mo.gov/discover-nature/field-guide/arrowwood-viburnum). Naturally arching stems. [Mt. Cuba Center](https://mtcubacenter.org/plants/arrowwood/) | Multiple canes bow outward at different azimuths, with restrained individual sweep and a pinned ground transition. |

## Surface versus silhouette

The AI587 London plane review PNG compressed its source heights into 148–176 of
255. Most pixels fell between 163 and 169, so an 8 mm displacement scale yielded
very weak relief. AI588 rereads the authenticated original Poly Haven
`bark_platanus` floating-point EXR, calibrates its percentile range, and expands
valleys without generating unrelated noise. A floating-point height image is
retained with the editable detailed mesh. The 28 mm authoring range is a visual
choice, attenuated on upper wood; it is not a measured species-wide bark depth.
The shaded photographic pattern, crevices and actual surface displacement stay
registered through rest-coordinate attributes when the trunk bends.

## Contract

Use `vegetation/growth` through `node tools/bake.mjs`; shared Blender configuration,
source authentication and stage-only publication policy apply. Preserve connected
closed wood and face orientation. Roots remain fixed at the ground plane. Leaves
retain template geometry, counts, scales and tints while their positions and
orientations follow the wood; twig endpoints are transported explicitly.
Detailed wood and calibrated height are retained for later optimized mesh/PBR
baking. Existing gameplay trees remain unchanged.

Photo references and credits: `downloads/vegetation/ai588/references/`.
Review artifacts: `tests/artifacts/screens/ai588_trunk_growth/`.

## AI588 measured build

The completed authoring scene contains all 15 specimens and 42,714,158 wood
triangles. All wood retains zero boundary and nonmanifold edges, validated face
orientation and pinned root planes. Leaf form, scale and tint signatures match
before and after transport; the maximum numerical twig-endpoint reconstruction
error is 0.000000202 m. The detailed London plane variants contain 2,783,602,
3,162,180 and 3,415,786 wood triangles respectively, within the existing per-model
safety gate. These are source meshes for later optimization, not mobile budgets.

The calibrated height and its authoring amplitude are recorded in `relief.json`.
The copied `material-approximations.json` retains the earlier material recipes
and scan/proxy notes; its original London plane relief value is superseded by
`relief.json`. Existing normal maps are retained source data; optimized normal/AO
maps for the revised surface have not been baked.
