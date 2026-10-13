# Enhanced botanical references

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
control CPU Cycles rendering. GPU use remains disabled for this pass.
`views=full|trunk|leaves` can render a selected view. Existing views are reused
only when their model, image hash, camera, resolution, samples and lighting
revision match. Partial render receipts retain authenticated untouched views;
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
