# Original mature vegetation authoring

Five explicit leaves reuse the shared configuration and bake framework:

```sh
node tools/bake.mjs --target vegetation --dry-run
node tools/bake.mjs --target vegetation --publish
node tools/bake.mjs --target vegetation/london-plane --publish
node tools/bake.mjs --target vegetation/silver-linden --publish
node tools/bake.mjs --target vegetation/northern-red-oak --publish
node tools/bake.mjs --target vegetation/arrowwood-viburnum --publish
node tools/bake.mjs --target vegetation/american-elm --publish
node tools/bake.mjs --target vegetation/prototype-oak
node tools/bake.mjs --target vegetation/prototype-plane
node tools/bake.mjs --target vegetation/prototype-shrub
node tools/bake.mjs --target vegetation/prototype-elm
```

The `vegetation` domain is excluded from default production `all` baking. Every
domain/species entrypoint uses the same planner and ignored
`tools/baking/blender.local.json`; no machine-specific command or configuration
is introduced. Authoring uses an isolated factory-startup headless Blender process,
two CPU numerical threads, no render and no GPU work. Check for occupied Blender
processes first and never attach to or mutate their scenes.

Each species recipe owns three **mature structural variants** and a single
geometry profile. There is no device-quality or age selection. All meshes use
metres, Y-up, base y=0, one bark material and one foliage material. AI578 replaces
the original simplified wood with fused volumes, smooth collars, organic roots
and geometrically displaced species bark. Historical v2 triangle budgets are
superseded; the current pass prioritizes physical detail and defers optimization.
AI582 replaces twig cards with closed 3D leaf blades and modeled petioles for
all species. Upper and lower surfaces use separate opaque tissue coordinates,
with green/silver linden surfaces and front-face culling, still one foliage draw.
Alpha-plate creation and optimization are deferred.

`authoring/geometry.py` shares primitive construction but uses species recipes
for crown/branch habits. Plane crowns use major rounded spreading forks; linden
uses a central leader and pyramidal laterals; oak uses heavier spreading limbs;
viburnum has separate multiple arching stems from ground level. Forms have distinct
seeds, branching counts and structure, not only different scales or colors.
American elm adds a tall clear stem and arching vase-shaped scaffolds below a
full elevated crown, with offset leaf bases and double-toothed leaf margins.

`authoring/textures.py` creates the original foliage and tree bark maps.
Arrowwood v5 uses CC0 photographed bark from Rob Tuytel's Poly Haven
`bark_brown_02`. Source URLs and SHA-256 checksums are tracked in
`arrowwood_viburnum/source/source.json`; original PNGs follow the shared asset
convention under `assets/public/vegetation_sources/bark_brown_02/`.
No downloaded geometry is used.
Species use different leaf outlines, venation and bark recipes. Botanical URLs
in each recipe and publication are references only. The six maps per species are
PNG: bark maps are 2048px and opaque foliage tissue maps are 1024px. Base color is
sRGB; tangent normals use OpenGL +Y; ORM is R=1,
G=roughness, B=0. Foliage alpha is uniformly 255; geometry defines the outline. No sunlight,
emission, canopy AO or transmission is baked into base color.

AI580 bakes macro bark color into linear vertex colors on the fused surface.
Color and physical relief blend between separately sampled branch fields at
junctions, avoiding the pinched patterns produced by interpolating angular UVs.
Bark maps now carry neutral micrograin and fine normal/roughness detail. The
standard material multiplies texture and vertex colors; there is no extra shader
or draw. Tree roots are asymmetric flares integrated into the basal trunk rings,
without separate capped toe-like tubes. Ground caps remain at zero height.

The manifest schema remains v3; each asset revision follows its recipe's
`revision`. London plane v4 replaced the even-cell bark palette with irregular
overlapping peel layers and restrained variation within each layer. Its color,
roughness and shallow geometric relief use the same field. AI580 advances plane
to v5 and the other species to v4 for continuous junctions and integrated roots.
AI581 advances arrowwood to v5 with photographic bark, individually curved and
varied stems, and continuous root crowns. Photo macro color is blended into
vertex colors; the base-color texture carries its fine residual detail. Original
normal, height and roughness maps supply reduced stem-scale relief and shading.
The generic bark source is not claimed to be a species-specific Viburnum scan.
AI582 advances plane/shrub to v6 and linden/oak to v5 for solid leaves while
preserving accepted wood. The runtime catalog revision must match the publication.

Each publication directory under `assets/public/vegetation/<species_folder>/`
contains `mature_01.glb`, `mature_02.glb`, `mature_03.glb`, `index.json`,
`PROVENANCE.md`, six maps in `textures/`, and packed editable `.blend` sources
for all three forms under `authoring/`, plus `leaf_study.blend` and
`leaf_study.glb` with eight forms for future plate baking. GLBs embed maps; the runtime shares
decoded resources within each species. Existing ignored/shared asset distribution
rules apply. Original licensed game assets and production lighting are untouched.

Generation stages under the shared ignored bake artifact directory. Validation
authenticates payload/map/source hashes, finite positions/unit normals, two
primitives, metric bounds, woody topology and solid leaf integrity. Detail-first
recipes use a generous failure safety ceiling instead of a performance budget.
`accepted_wood.json` freezes the preceding wood attributes and bark map hashes;
regeneration does not require an older installed asset directory. Position, UV,
normal, color and index values must match. `accepted_foliage.json` is historical
and superseded for the requested leaf replacement. The explicitly registered
American elm revision 1 uses `woodContract: original-authoring-v1` because it has
no preceding wood. Only that initial species/revision may author without an
accepted wood record; any existing accepted record is always enforced. Its new
wood still passes the same topology, source/map authentication and publication
checks. Its detail-first failure ceiling is 46M triangles, allowing many smaller
modeled elm leaves; this is not a runtime performance budget. See the
[elm contract](../../specs/trees/american_elm.md).
Leaf templates must be closed,
and exported foliage must be opaque with finite positions and unit normals.
`--publish` uses the existing rollback directory publisher.
Only the six retired first-pass London-plane filenames are removed from the new
active directory after the previous full directory is preserved for rollback.
Publication never certifies old city shadows, irradiance or visibility products.

`vegetation/prototype-oak`, `vegetation/prototype-plane`,
`vegetation/prototype-shrub` and `vegetation/prototype-elm` stage only the first mature form for detailed clay
and material review. They are not children of the full-family domain and reject
`--publish`. They keep the same configuration,
input authentication and validation path during iteration. See
[`detailed_tree_trunks.md`](../../specs/trees/detailed_tree_trunks.md) for the
wood contract and [`solid_species_leaves.md`](../../specs/trees/solid_species_leaves.md)
for current foliage and evidence requirements.
