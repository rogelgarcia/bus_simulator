# Enhanced botanical references

`phase=leaf-wireframe` reads an authenticated `candidate` reference into an isolated
scene and renders its actual leaf prototype as textured, triangle-wire and grazing
views. Select `models=london_plane/mature_01` and a new ignored `output`; use the
same `source` and shared Blender configuration as the other phases. It records
counts for every saved prototype, verifies opaque shader alpha and unchanged mesh,
UV and source hashes, and never saves the source scene or publishes assets.

Use `node tools/bake.mjs --target vegetation/enhanced-reference`. Supply `source`
as the user-provided `references_ideas/trees` directory and a fresh ignored
`output`. The shared Blender configuration supplies all executable paths.

Phases: `materials` stages and validates fifteen supplied AI-generated PBR sets;
`materials --publish` installs the validated sets and updates the material catalog
last, preserving its previous contents in the review directory. `build` generates
three new mature specimens per species. `render` produces full-tree, trunk and
leaf-area views of the enhanced and preserved current references. `gallery`
compares both models with the supplied illustrative and photographic image styles.
The two supplied styles are original raster references, with labeled detail crops,
not additional 3D reconstructions. `validate` checks saved model/render identities.
The gallery also includes `mature_forms.png`, a contact sheet of all fifteen
enhanced specimens, and `overview.png`, the four-way full-tree comparison.

`models` is `all` or comma-separated `species/mature_0N`. Primary comparisons use
mature_01; all other forms receive full-tree previews. `width` and `samples`
control rendering. Choose `engine=eevee` for geometry reviews or the default
`engine=cycles` for CPU Cycles comparisons.
`views=full|trunk|leaves` can render a selected view. Existing views are reused
only when their model, image hash, camera, resolution, samples and lighting
revision and render engine match. Partial render receipts retain authenticated untouched views;
replaced frames and their earlier receipts are preserved under `render_history`.
The complete gallery still requires all forty views. Leaf details use an outer
shoot camera and a softbox shared by both model versions for readable tissue.

The prior reference index is authenticated before every phase and checked again
afterward. No baseline model, installed tree LOD, historical file or source image
is overwritten. Enhanced models remain ignored review artifacts. Only the new
PBR sets can publish. Their catalog provenance explicitly says `AI generated`;
the supplied height, normal and roughness maps are inferred artistic proxies,
not measured scans. Leaf fronts and backs retain their registered source UVs.

The new architecture has connected, tapered branches and curved attached shoots.
Unequal crown lobes receive a branching hierarchy rather than uniform random leaf
points. Species profiles control trunk division, crown envelope, shoot arrangement
and drooping tips. All leaves are curved geometry with separate upper/lower tissue.
These are reference meshes without a runtime triangle budget or wind rig.

## Shared fork revision

London plane, silver linden and northern red oak now use guided successor growth
with explicit shared fork nodes. A backward crown-demand pass sizes supporting
wood, while species profiles retain linden's leader and the spreading plane/oak
scaffolds. Historical radii can be retained after shedding. This is an artistic
growth approximation, not a complete physiological or volumetric-strand simulation.

The `structure` phase renders the scaffold without foliage using a 4 cm diagnostic
voxel mesh. Final builds retain the 2.2 cm wood mesh and separate fine shoots.
Successor volumes extend inside their parents; a buried continuation and shoulder
volumes make the fork continuous without an exposed flat cap or narrowed bole.
Bark coordinates remain intact. Around forks a vertex mask blends UV and object
box projections of the same installed PBR; projected height supplies local bump
detail, while UV displacement fades out in that region. Source maps are unchanged.

Set `previous` to the prior enhanced `summary.json` to authenticate that collection
and add before/after renders. Selected-species galleries require all three mature
forms of each selected species. With three species, the complete gallery validates
nine models and 39 renders: eleven per primary specimen and one per other form.
Each primary includes two neutral clay views of its actual final wood geometry.
Fork close-ups look up from a camera height of 1.6 m. The original four-way style
comparisons remain alongside the new `*_growth_changes.png` sheets.

Fork volumes also receive local surface relaxation scaled by physical voxel size
and branch radius. This removes hard union shoulders while limiting smoothing on
small limbs. `refine` can apply that pass once to authenticated v2 candidates:
set `candidate` to their preserved review directory and use a different `output`.
It preserves leaf and twig data, topology and source files, measures vertex
displacement, and writes v3 models. Ordinary `build` applies the same relaxation
before transferring bark charts. Refinement and all reference phases are staging
only; publication remains restricted to materials.

Focused numerical regressions live in `tests/python/test_vegetation_growth.py`.
They check shared nodes, demand conservation, retained thickness, cap enclosure,
bole width and the spatial extent of the bark projection mask.

`inspect` reads a preserved `candidate` directory and writes mesh-coordinate and
edge-length diagnostics to a separate `output`; invalid saved geometry fails the
job. Render checks the saved mesh before tracing. Gallery/validate always reopen
every selected model in Blender and require an authenticated passing mesh audit.
The build checks bounds after each wood modifier, and runs each mature specimen
in its own Blender process to isolate Blender state between models.

## London plane ramification revision

The v7 `distributed-plane` profile grows unequal successors outward without a
spherical target cloud or clipped crown boundary. Two unequal mature leaders
carry staggered spreading limbs and inner ascending branches. Longer apical
successors and shorter lateral successors form projecting tips. Terminal foliage
follows those tips in elongated sprays. Intermediate branch orders connect the
major scaffold to foliage supports, with a 0.57 m basal radius and a 2.05 pipe
exponent. Successor surfaces inherit the parent's cross-section and tangent,
then taper to their individual radii. This is an artistic growth hierarchy, not a
complete physiological simulation. Original and earlier enhanced collections,
including the rejected spherical v6, remain authenticated inputs. A v7 plane gallery
requires three mature forms and seventeen renders when a previous collection is
supplied, including matched old/new bare-wood and root views.

For fast bare-shape review, `structure-surface=clay` skips bark UV transfer and
relief only in the diagnostic structure phase. It renders the whole scaffold,
lower forks and root crown with clay. Full reference builds always retain PBR.
The plane's root crown uses tall coordinated bole flutes and eight descending
structural roots with secondary and tertiary surface divisions. Small branches
and roots below 6 cm radius retain explicit surfaces outside the voxel union.
These tangent-continuous plane forks omit the older shrinking relaxation pass;
three measured bole cross-sections must retain at least 88% of designed radius.
Other species keep their existing growth and root generators.

Plane bark coordinates use a BVH lookup of the nearest source triangle per
remeshed face, followed by affine UV projection of its corners within that chart.
This preserves the source PBR and lengthwise charts while avoiding the very slow
generic UV transfer modifier. Projection distances, finite coordinates and the
existing bark-junction mask remain validated. Other species retain their
previous transfer method. Fifteen pure-Python regressions cover growth and the
projection math; the actual mesh gates and rendered inspection remain required.
Use `wood-study` for the supplied leafless London plane image. It is authenticated
as an input and copied unchanged into the comparison gallery. The revised plane
adds textured leafless and root-crown renders, with a dedicated side-by-side sheet.
The outward-growth regression measures local progress away from the first fork
and rejects sustained backward curling. Shape acceptance still requires bare
and leafy inspection; numerical checks do not establish botanical realism.

## London plane branchlets (v8)

The accepted v7 scaffold is retained. `branchlets.py` grows two unequal sprigs
from each terminal support; three further fork orders produce shorter spreading
shoots with finite tips instead of six fans carrying long nearly parallel hairs.
The same connected graph drives leaf placement and bare diagnostic geometry.
Leaves retain the existing alternate placement and crowding rejection. Other
species retain their previous interleaved shoot/leaf random sequence.

The `structure` phase now includes all plane fine shoots and an outer branchlet
close-up. Final reviews use the highest unchanged structural support to match
the old/new close-up camera. With a previous collection, the three-form v8 gallery
requires nineteen renders and includes `london_plane_branchlets.png`.
Pure graph regressions check unchanged scaffold coordinates, connected forks,
reduced shoot count, finite tip thickness, slenderness and sibling divergence.

## London plane foliage (v9)

`phase=foliage` reads an authenticated v8 `candidate`, also supplied as `previous`,
and preserves its wood/branchlet vertices, topology and UVs exactly. It replaces
only the leaf instances and prototypes. Supply `foliage-study` for the user's
branchlet image; gallery copies that original unchanged. Long curved cylindrical
petioles carry alternate leaves with varied orientation, size and small young tip
leaves. Crowding uses blade centers beyond the petioles. Existing catalog PBR
front/back textures remain the source materials; the supplied study is a guide.

`views=shoot` previews an isolated actual shoot extracted from the saved tree.
The complete v9 three-form review requires twenty frames. Preserved comparison
frames may be copied only when image/model hashes, camera, resolution, samples
and lighting revision match. Leafy shoot comparisons are in
`london_plane_foliage_study.png`. All foliage edits remain staging-only.

## London plane lower limb posture (v10)

`phase=posture` requires the preserved v9 collection as both `candidate` and
`previous`. It copies mature_01 byte-for-byte. For mature_02 and mature_03 it
raises the first low scaffold to 38 degrees above horizontal. A smooth bend
preserves the inherited tangent at the proximal fork; all descendants and their
existing leaf instances rotate together beyond that blend. Other source paths,
all radii, leaf counts, prototypes and PBR materials remain unchanged. The wood
meshes are rebuilt through the existing union and bark-transfer pipeline.

The v10 collection includes the unchanged v9 first model and two corrected v10
models. Its complete gallery requires 26 frames and adds leafy/bare before-and-
after views for both corrected forms in `london_plane_posture.png`. All phases
use isolated outputs and the existing validation/publication gates.

## London plane foliage spacing (v11)

Use `phase=foliage` with `foliage-layout=spatial`, the latest v9/v10 collection
as `candidate`, and its authenticated summary as `previous`. The old `branchlet`
layout remains available for reproducing v9 from v8. The spatial layout derives
uneven node spacing from actual twig length, extends curved petioles, and tries
sixteen alternate-rank directions/orientations against oriented blade volumes.
Nodes without adequate space are omitted; no leaf-count target is imposed.
Candidate order is randomized so the first scaffold cannot monopolize space.
The volume proxy is not an exact intersection test or physiological simulation.

Wood, branchlets, UVs and architecture remain exact preserved copies, including
the v10 limb corrections. A matched isolated-shoot comparison shows old/new
placement alongside the source study. The three-form gallery requires 21 frames.

## London plane shallow outward sprays (v12)

Use `phase=foliage`, `foliage-layout=dome` and an authenticated v11 collection as
`candidate` and `previous`. The trunk, roots and major-wood mesh stay exact. Each
connected fine-shoot family becomes a shallow fan whose normal follows the local
crown exterior. This is a static all-around arrangement, not camera tracking.
Shared attachment positions and basal tangents remain connected. Leaves keep
their count, sizes, forms and tint; alternate stalks and modest blade tilt share
the fan plane, with spatial candidates avoiding local piles. Leaf curvature and
petiole arch are reduced, retaining true geometry for a later card bake.

`views=canopy` previews three matched perspective views at 2.7 m camera height,
foliage-only alpha coverage masks, and an isolated leafy shoot. `views=all` also
includes an edge view of that shoot and the established structure comparisons.
The complete three-model review requires 35 render records. Coverage uses actual
saved leaf geometry with identical cameras, one-sample emission masks and no
wood, ground or shadows. It is a projected-area measurement, not a GPU benchmark.
The saved graph records each spray normal and the stable study-shoot identity.

## London plane organic aligned sprays (v13)

Use `phase=foliage`, `foliage-layout=organic` and the authenticated v12 collection
as `candidate` and `previous`. The complete woody meshes, fine branchlets,
architecture and leaf attachment nodes remain exact. Blades and petioles regain
their full curved shape. A shared shoot lean, alternate blade roll and bounded
local variation give the sprays depth without losing their common orientation.
Leaf normals remain within 36 degrees of the parent fan normal. Twelve modest
orientation candidates use the existing crowding proxy. This is a static model,
not camera-facing geometry. Counts, forms, sizes and tints are initially retained;
matched coverage renders determine whether extra leaves would be necessary.

The same 35-view review includes matched front/edge shoot details and three
road-height foliage masks. Earlier references and runtime LODs remain untouched.

`phase=render` with `views=poses` adds side and rear three-quarter views to each
v13 mature specimen. The first specimen also gets an oblique branchlet close-up
within the tree and isolated from it, with identical cameras, scales and lighting.
The existing front leaf-area and isolated-shoot views supply a second matched
pair. The resulting 43-frame collection is checked for complete per-model pose
sets and consistent oblique pairs. `gallery` inserts these poses on the same
index page and produces `london_plane_poses.html` and its comparison sheet.
Models remain unchanged; older galleries without extra poses remain valid.

## London plane spatial scaffolds and blade shape (v14)

`phase=shape` consumes the authenticated v13 collection as `candidate` and its
summary as `previous`, writing to a separate ignored output. Six scaffold
families per specimen receive unequal upward and azimuth changes. Cubic growth
curves inherit the parent's tangent; each descendant and its attached foliage
move together in three dimensions. Bole/root paths, branch radii, leaf counts,
sizes, tints and source PBR are retained. The existing continuous wood union and
bark transfer rebuild the meshes. This is an artistic growth correction, not a
physiological simulation.

The eight real leaf prototypes gain a bowed midrib, cupped shoulders, torsion
and lobe/tip curl. Their attachment junction and texture UVs are retained.
Saved-mesh validation checks each blade's deviation from its best-fitting plane.
No leaf cards or new textures are introduced. Runtime LODs remain unchanged.

`render` with `views=all` adds matched old/new side and rear views, bare clay
structure, and individual blade oblique/edge views at identical scale and
lighting. The complete three-form gallery requires 63 authenticated frames,
including the existing canopy, source-study and branchlet comparisons.
`london_plane_spatial.html` focuses on the new corrections. Use the ordinary
`gallery` phase to audit saved models and assemble the complete review.
`views=blade` renders only the matched isolated blade pair and its edge views.

## London plane open leaf surfaces (v15)

Use `phase=foliage`, `foliage-layout=open`, the authenticated v14 collection as
`candidate` and its summary as `previous`, with a separate ignored output.
This changes only the eight prototype blade heights: a shallow midrib arch,
lowered margins and modest twist replace the deep upward cup. The dark upper
material remains on local +Z, with surface normals verified after saving.
No light tracking is introduced. Wood, branchlets, graph, leaf placements,
counts, petioles, silhouette coordinates, material assignments and UVs stay exact.
Saved-model audits require over 60% less blade depth, retained intrinsic curvature,
open upper-face normals and matching preservation digests. The existing 63-frame
review remains required; `views=blade` supplies a quick matched preview first.

## London plane reusable crown spread (v16)

`phase=crown` consumes authenticated v15 candidates and their `previous` summary.
`profiles.json` owns the species-wide `crownSpreadRule`. The pure growth rule
selects scaffold families by topology, measures the 1–99% crown breadth over 36
horizontal directions, and first redistributes their azimuths into open sectors.
Remaining width deficits drive modest structural centerline growth. Attached fine
shoots and their leaves undergo rigid transport, preserving their local shapes.
No camera, specimen name or hand-picked branch index enters the growth rule.

The target minimum breadth is the larger of 88% of the starting maximum breadth
and 72% of crown height. Scaffold elevation remains at least 30 degrees, directional
growth is bounded, and unsupported candidates fail validation. Unequal apical
extensions remain unconstrained by a spherical envelope. Existing bole/root paths,
pipe radii, leaf templates, sizes and counts are preserved. Validation additionally
checks actual leaf-center breadth, all branch attachment positions and prototype
hashes. Tests exercise six independent seeds and a crown requiring no correction.

The existing 63-frame review remains required. Road-height cameras match v15;
the isolated branchlet cameras follow the corresponding branchlet's local frame.
Use `views=canopy` for an early width review before completing `views=all`.

## Silver linden conical crown (v4)

The ordinary `build` phase now selects `conical-linden` from the species profile.
It grows one dominant leader with eighteen unevenly spaced, ascending scaffold
families and three further orders of unequal successors. Every fork inherits
its parent's tangent. Extension length and foliage-group size decrease toward
the tip, producing the crown's taper without clipping it to an envelope.
Connected foliage groups occur along the main laterals as well as successive
forks and tips. The species profile broadens the fans and their shoot spread,
avoiding isolated terminal tufts while retaining openings between branch groups.

The basal radius is 0.43 m, down from 0.64 m. The existing continuous root-crown,
fork-union and bark-projection pipeline also serves linden. Inherited junctions
skip the old iterative fork relaxation that could pinch the bole. Fourteen
cross sections of the actual saved bole must retain at least 88% of their
specified radius; saved foliage must retain the taper measured at build time.

Use `structure` for an isolated clay review, then `build`, `render` and `gallery`
in a separate ignored output directory with the previous v3 summary. The review
includes all three forms, full-tree/trunk/leaf comparisons, bare structure and
the unchanged supplied illustrative and photorealistic studies. Old references,
London plane generation and installed runtime LODs are preserved. Pure tests
exercise eighteen seed/size combinations, connected forks, pipe conservation,
radius taper and crown proportions.

Fork burial is bounded by the available parent segment length, preventing
coincident rings on short leader sections. A saved-mesh radial-ray audit follows
the entire central leader, so missing segments cannot pass only a bounds check.
`refine` also supports authenticated v4 linden candidates: it rebuilds wood from
the preserved architecture, retains all leaf placements and prototype digests,
and carries forward only verified original/previous comparison frames. Revised
model frames are always rendered again. Use a separate output directory.

## Northern red oak open crown (v4)

The ordinary `build` phase selects `open-oak` for northern red oak. It grows
twelve staggered, ascending scaffold families with five additional fork orders,
inherited tangents, continuous roots, and a 0.62 m basal radius. Finite branched
sprays replace dense overlapping shoot clouds. Alternate leaf nodes are spaced
by twig length, with oriented-volume crowding rejection and bounded organic
rotation around a coherent outward/upward spray face. Curved leaves use short
3D petioles and the existing catalog PBR. No fixed leaf count is required.

Use the preserved v3 `summary.json` as `previous` and a fresh ignored output for
`build`, `render`, and `gallery`. All three mature forms are required by the
existing gallery. Saved-mesh audits additionally repeat the clear-bole radius
and all-azimuth crown-breadth checks. Pure regressions are in
`tests/python/test_vegetation_oak.py`. This does not publish runtime assets.

`threads=1..4` limits the CPU render and numerical worker budget (default 4).
Use a reduced value for isolated work alongside other jobs; still check available
memory and active render processes before launching Blender.

## Northern red oak spatial forks (v5)

The oak scaffold adds shorter intermediate offshoots around each main limb,
using staggered attachment stations and rotating local azimuths. The nine lateral
scaffolds also interleave their bearings around the whole bole. Terminal fork
guides follow their recent parent direction rather than a fixed scaffold cone.
Use the preserved v4 collection as `previous` and a new ignored output. `build`,
`render` (`views=all`) and `gallery` create and validate all three mature forms.
The complete review has 27 render records: the previous comparison set plus
side/rear/elevated views and a matched primary bare-structure pair from above.
The gallery adds `northern_red_oak_volume.html` and its captured sheet. The rule
is independent of camera, variant name and handedness. Old references remain
unchanged; no runtime assets are published by these phases.

## Northern red oak spaced sprays (v6)

`oak_branchlets.py` replaces repeated parent/descendant fans with one terminal
spray per structural support. Four fine levels retain foliage-bearing length;
six local direction candidates and leaf-scale spacing reject crowded subtrees.
Fine-shoot proof is saved under `crowding.branchletSpacing`. Spray face azimuths
vary coherently between groups to avoid whole crown sectors becoming edge-on.
The `structure` phase includes the actual fine shoots, a detail and elevated
clay view. The v5 volume review and saved geometry gates also apply to v6.
Use new ignored directories for each experiment and preserve rejected previews.

## Northern red oak ascending shoots and local fill (v7)

Structural successors use a smooth upward elevation bias while preserving their
horizontal bearing and inherited fork tangent. Fine shoots use a gentler bias.
Terminal supports retain their primary sprays; a shorter three-level lateral
spray can grow from a distinct interior node of a terminal support or a long
secondary branch only if its outer-half clearance is
at least 2.1 times the ordinary inter-spray margin. Its proximal section and all descendants retain the
ordinary spacing and leaf-exclusion tests. Secondary candidates are successor
orders 4–7 longer than 3.2 leaf lengths, excluding the trunk and major scaffolds.
This fills available neighbourhoods
without reinstating fans on every ancestor or targeting a fixed leaf count.
Records include supplemental counts and launch-clearance measurements.

Use the preserved v6c summary as `previous`, then the existing `structure`,
`build`, `render` and `gallery` phases in new ignored directories. The 27-frame
volume review and saved-mesh audits apply to v7. No runtime assets are published.

## Northern red oak fork shoulders (v8)

The oak profile enables `forkShoulders`. Parent/child radii and the local opening
angle drive descending shoulders and an asymmetric collar under each substantial
branch. The added radius is bounded and fades locally; no separate connector is
added. Source growth curves and leaf placement rules remain those of v7.

Oak fork bark now uses two branch-aligned source charts, blended only near their
shared boundary by surface distance. Each normal map uses its own UV tangent
frame before normal blending. The previous fixed box projection is retained for
other species. Existing PBR catalog files are unchanged. Saved-mesh validation
checks the alternate UVs, finite bounded weights and the recorded blended-face
count in addition to the established crown and unpinched-bole checks.
The independent inspection also compares the predecessor's growth graph, leaf
instance attributes (including tint), all leaf prototypes and fine-wood geometry.

Use `structure` with `views=trunk` for a small matched clay/bark diagnostic.
Then use `build`, `render` and `gallery` with the preserved v7b summary as
`previous`, in a new ignored output directory. The complete 27-frame comparison
and original-reference preservation gates still apply.
The gallery includes a dedicated `northern_red_oak_forks.html` comparison row.

## American elm arching growth (v2)

The elm uses five staggered rising axes with progressively outward arching
segments. Rotated lateral buds and unequal successors distribute smaller
branches through crown depth; they inherit the supporting tangent and receive
pipe-demand radii. Integrated root flutes, fork shoulders and locally blended
lengthwise bark charts reuse the accepted wood pipeline. No spherical clipping
volume or camera-specific branch direction is used.

`shoot_growth.py` and `spray_foliage.py` share the oak spacing strategy while
keeping species settings. Elm shoot length and narrower blade exclusion widths are profile parameters.
Elm fine tips may gently droop; structural limbs
remain ascending. One spray per terminal support, optional lateral infill in
empty neighbourhoods, finite twig thickness and leaf exclusion prevent repeated
fans at one node. Alternate leaves retain a coherent local orientation, slight
blade curvature, bounded roll and short three-dimensional petioles.

Use the original enhanced collection as `previous`, select all three elm forms,
and use a fresh ignored `output` with `build`, `render`, then `gallery`. The
28-frame review includes front/side/rear/elevated views, old/new comparisons,
clay forks and an actual isolated branchlet matching the in-tree close-up.
Existing saved-model, material-provenance and source-hash gates still apply.
No reference model or runtime asset is replaced. Pure regressions in
`tests/python/test_vegetation_elm.py` check twelve seed/form combinations,
connected tangent growth, circumferential distribution and finite spaced shoots.

## American elm spreading arches (v3)

Elm axis lengths, successive elevation angles and the staggered upper-axis lift
are now species profile parameters. Limbs rise near the bole, then progressively
level outward. Terminal ramification inherits the last arch heading instead of
resetting upward. The same rules apply to every seed and view; they do not squash
the finished tree. Use the preserved v2c collection as `previous`, with a fresh
ignored output for all three forms. The existing 28-view render and saved-mesh
validation gates apply. Twelve seed/form cases check the outward terminal axes,
broad support crown, shared fork positions and inherited tangents.

The gallery verifies all ten supplied photorealistic studies against each
species' scientific name, specimen ID, relative filename and metadata SHA-256.
Duplicate image identities are rejected. Photographic panels show the species
and filename, and a dedicated examples sheet includes both verified specimens
alongside the illustrative study. Source images are copied unchanged; the
original collections and runtime assets remain intact.

## American elm rounded crown (v4)

`elm_growth.py` grows toward stratified buds throughout an irregular ellipsoidal
volume. Five staggered bases carry recursively partitioned 3D neighbourhoods,
including upper-centre and lower-side foliage. This is an artistic spatial
growth model inspired by attraction-point methods, not a physiological
simulation. No completed geometry is clipped to a sphere or flattened.

The elm profile controls crown radius, depth, centre and bud count. Fine shoots
use shorter lengths, bounded upper elevation and progressive tip droop; oak
retains its existing heading policy. Connected tangent forks, pipe-demand
radii, continuous roots, bark charts and leaf exclusion remain in use.

Use the preserved v3b summary as `previous`, and supply `crown-study` with the
user's photograph. The gallery copies it unchanged, records its hash and adds a
previous/new/photo comparison. Build a fresh candidate, inspect the full view,
then complete all three forms and the 28-view review. The twelve seed/form
checks require a rounded top, broad lower crown and occupied upper centre.

## American elm branch-owned clusters (v5)

`clusterTiers` describes the lower, middle and upper foliage regions carried by
each main axis. Region targets guide outward forks without filling a single
continuous global volume. `elm_shoots.py` generates open fans with staggered
laterals and at most six paths. Clearance includes same-fan neighbours, excluding
only the immediate parent. A shared fan normal guides curved alternate leaves.
Use the preserved v4c summary as `previous` and a fresh output; the same 28-view
review and saved-mesh validation gates apply. The isolated close-up now includes
the whole fan, so its internal spacing can be reviewed.

Geometry reviews can select `--set vegetation/enhanced-reference:engine=eevee`.
The default remains CPU Cycles. Eevee uses the configured render samples with
ray tracing disabled. Render receipts identify the engine per frame, comparison
caches require the same engine, and gallery validation rejects mixed engines.
# Arrowwood leaf spacing

The paired-leaf shrub revision uses the existing `build`, `render`, and `gallery`
phases with `engine=eevee`, a fresh ignored output and the preserved enhanced
`previous` summary. It adds subtle fused root collars and arc-length opposite
leaf pairs with shared oriented-volume rejection. Counts are allowed to decrease.
All three mature forms are required. With a previous collection, the primary
specimen has 15 frames, including root and isolated shoot pairs; the other forms
have one each. `tests/python/test_vegetation_shrub.py` checks cross-shoot clearance,
opposite pairs and connected small roots. Source images and installed maps remain
unchanged.
