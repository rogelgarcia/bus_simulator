# Enhanced reference collection

Reference showcase videos must use the selected collection's saved geometry and
matching accepted mesh-audit hashes. Revision labels come from authenticated model
metadata, including the v16 balanced crowns. Regeneration uses a fresh ignored
video directory and preserves older animations and all source reference meshes.

Leaf topology diagnostics must render actual saved prototype meshes, without
rebuilding their outline, realizing the entire canopy or exaggerating thickness.
The artifact-only `leaf-wireframe` phase authenticates the source, reports exact
vertex/triangle counts and shader alpha inputs, and preserves mesh/UV/source hashes.
Textured, opaque wireframe and grazing views show the same selected prototype.

London plane corrections must become reusable species rules, expressed through
growth parameters and measurable acceptance criteria rather than specimen IDs,
branch indices or review-camera directions. New seeds retain natural variation;
failed candidates must be rejected instead of bypassing the constraints.

The v16 crown rule measures 36 horizontal azimuths using robust 1–99% terminal
shoot extents. Its minimum-width target is max(0.88 × prior maximum breadth,
0.72 × crown height). It redistributes scaffold directions, then extends the
structural centerlines into remaining underfilled directions. Descendant leafy
shoots remain rigid, real leaf geometry and counts remain exact, and branch radii
retain their pipe-model allocation. Shared fork positions, root/bole paths and
minimum scaffold elevations are checked. No spherical crown boundary or camera
dependent geometry is permitted. Six independently generated seeds exercise the
same rule. Actual saved foliage breadth must also fill the resulting envelope.

The v15 London plane leaf-only revision preserves the accepted v14 wood and
instance transforms. Its real blades have shallow convex upper surfaces and
lowered margins, exposing the dark front material without the deep upward cup.
Modest bend and twist remain; this is static geometry rather than sun tracking.
The bake audits exact wood, attachment transforms, stalks, silhouette coordinates,
material assignments and UVs, plus at least 60% less blade depth and upward-facing
local front normals. All three mature forms and matched single-leaf/branchlet
comparisons remain required through the existing 63-render review contract.

Preserve the current fifteen references indexed by
`tests/artifacts/screens/vegetation_natural_foliage/coverage_20261011/summary.json`.
Create a separate fifteen-specimen enhanced collection informed by the supplied
`references_ideas/trees` studies. Neither the current references nor game LODs are
replaced. The intended style is consistent photographic bark and leaf tissue,
with the clear branching and readable crown grouping of the illustrative studies.

## Species features

| Species | Structural target | Foliage target |
| --- | --- | --- |
| London plane | Muscular, unequal ascending forks; broad mature crown; exfoliating olive/tan/cream bark | Alternate 3–5-lobed leaves on connected zigzag shoots; overlapping crown lobes with irregular openings |
| Silver linden | Dominant upright leader, gently curved ascending laterals; dense rounded-pyramidal crown | Alternate heart-shaped leaves with pale felted undersides; broad sheets of shoots rather than isolated puffs |
| Northern red oak | Substantial root flare and trunk, strong spreading limbs; broad rounded crown; vertically ridged bark | Alternate bristle-tipped lobed leaves; several growth flushes near twig ends, with gaps between major limbs |
| American elm | Upright lower trunk dividing into ascending, outward-arching leaders; vase-shaped crown | Alternate, predominantly two-ranked serrated leaves; fine hanging outer shoots and overlapping branch fans |
| Arrowwood viburnum | Multiple unequal ground stems, branching above the base; rounded shrub outline | Opposite toothed leaves on connected shoots; dense lower and middle foliage with irregular projecting tips |

Botanical checks: [plane](https://plants.ces.ncsu.edu/plants/platanus-x-acerifolia/),
[linden](https://plants.ces.ncsu.edu/plants/tilia-tomentosa/),
[oak](https://plants.ces.ncsu.edu/plants/quercus-rubra/),
[elm](https://plants.ces.ncsu.edu/plants/ulmus-americana/), and
[arrowwood](https://plants.ces.ncsu.edu/plants/viburnum-dentatum/).
The supplied AI pictures are visual studies, not botanical ground truth. Numeric
growth parameters are artistic approximations. Use summer foliage consistently;
the flowering arrowwood study does not require flowers on the summer model.

## Materials and preservation

Register `vegetation/enhanced-reference` in the existing bake framework. Reuse
`blender.local.json`; force bounded CPU work while the GPU is occupied. Authenticate
all current model hashes and source PBR checksums. Stage first, validate channel
dimensions and packing, then publish only new PBR folders and their catalog entries.
Preserve any differing existing copy rather than overwrite it. Catalog metadata
must identify source as `AI generated`, describe inferred data maps, retain source
filenames/hashes, record front/back registration and physical scale assumptions,
and state an unspecified license when none is supplied.

Use Bark and Foliage material classes, neither building nor ground eligible.
Color is sRGB; normal/ORM/height/opacity/translucency are data. The existing
auxiliary-map inventory carries opacity and translucency. Source PNG bytes are
preserved for provenance even for opaque bark. Do not commit image assets.

## Review

For each species present four labeled versions: current 3D reference, enhanced 3D
reference, supplied illustrative study, supplied photorealistic study. Each version
has a whole-tree view, trunk detail and foliage detail. Generate separate species
comparison sheets for the three views plus a single complete species sheet. The
supplied studies are original images and detail crops, explicitly labeled; their
baked lighting and limited detail resolution prevent photometric equality.

Render the two actual models with the same neutral light and display transform,
framed individually at mature scale. Shape equality is not a requirement. Inspect
root seating, fork continuity, branch taper, leaf attachments, front/back appearance,
species silhouette, density and branch-group readability. Hash inputs and outputs;
report leaf counts and geometry separately, without claiming GPU performance.

The oak and elm profiles keep their upper leaders within an overlapping crown
envelope, with broader branch groups and varied leaf inclinations to improve
coverage from street height. Review leaf-area views on outer shoots with the same
soft fill for current and enhanced models. Preserve earlier candidates and their
renders in separate artifact directories before assembling a revised review.
Rendering may resume authenticated views only when source identity, image hash,
camera, resolution, sample count and lighting revision match.

## Artifact layout

The enhanced collection is stored separately under
`tests/artifacts/screens/vegetation_enhanced_reference/20261012_review/`.
Each species has `mature_01`, `mature_02` and `mature_03` directories containing
an editable, packed `enhanced.blend`, growth paths in `architecture.json`, and
source/geometry identities in `model.json`. Detailed leaves remain instances of
eight curved prototypes; the reported expanded leaf triangle count is not a
runtime budget. The original collection and the earlier enhancement candidates
remain in their existing directories.

`index.html` is the review gallery. Per-species `*_comparison.png` sheets contain
all four versions and three views; `*_full.png`, `*_trunk.png` and `*_leaves.png`
provide separate view sheets. The model/render inventory is `summary.json`;
`mature_forms.png` shows all fifteen enhanced forms together, and `overview.png`
shows the full-tree four-way comparison for all five species.
`gallery.json` and `source-studies.json` authenticate the sheets and copied source
studies. Primary model renders use 1440-square CPU Cycles images; the other ten
mature forms receive 1200-square full-tree previews. Both use sixteen samples
and denoising. Reference models are review artifacts; the fifteen PBR sets are
installed under `assets/public/pbr/tree_ai_<species>_<role>/` with catalog metadata.

## Branch growth research — 2026-10-12

Status: the rendered collection above remains preserved. The correction is
implemented and validated for all nine mature plane, linden and red oak forms.
The user's London plane, silver linden and northern red oak comparisons identify
the same structural defect: thin limbs appear appended to an almost unchanged
main cylinder. Treat this as a growth and junction-shape problem.

The current `architecture.py::scaffold` creates the complete trunk with a fixed
taper before assigning leaders and lateral arms. Arm radii are capped by
`min(parent_radius * .6, basal_radius * .32)`; adding a large crown does not
increase the supporting trunk or change its taper at a fork. Curves are joined
in `wood.py::build_wood` by voxel remeshing and five smoothing iterations. This
makes a connected surface but supplies neither a growth history nor a deliberately
shaped fork. More smoothing or a larger basal radius alone will not address all
three defects: branch hierarchy, shared thickness, and junction geometry.

### Relevant algorithms and their roles

- [Self-organizing tree models, Palubicki et al. 2009](https://algorithmicbotany.org/papers/selforg.sig2009.html):
  grow terminal and lateral buds in time steps; competition and apical control
  determine which axes develop. This provides control over a persistent leader
  versus a spreading mature crown. Its diameter pass accumulates contributions
  toward the root using `d_parent^p = sum(d_child^p)`, commonly with `p` between
  2 and 3. The model remembers previous thickness after branch shedding.
- [Space colonization, Runions et al. 2007](https://www.algorithmicbotany.org/papers/colonization.egwnp2007.html):
  use attraction points to guide growth into available crown space. Suitable for
  uneven crown occupancy and competition; insufficient by itself to specify
  species bud architecture or close-up fork surfaces.
- [Interactive Invigoration, Li et al. 2024](https://storage.googleapis.com/pirk.io/projects/invigoration/index.html):
  represents wood with volumetric strands and addresses lateral development as
  well as branch extension. This is the strongest research direction for the
  shared wood volume and complex cross-sections missing from our current tubes.
  A simplified strand-inspired prototype must not be described as a complete
  implementation or reproduction of this paper.
- [Modeling the Mighty Maple, Bloomenthal 1985](https://www.unchainedgeometry.com/JBloom/papers.html)
  connects generalized cylinders with free-form junction surfaces. The discussion
  in [Kochhar's 2010 thesis, section on ramiforms](https://algorithmicbotany.org/papers/kochhar.th2010.pdf)
  compares this with implicit methods that preserve bark ridges and collars,
  and notes the unwanted bulging that unconstrained blending can cause.

### Proposed generator revision

1. Store an explicit internode graph with continuation and lateral successors,
   age, parent attachment, growth direction and supported crown demand. A major
   fork divides an existing axis into successors; it does not leave the whole
   trunk geometrically unaffected while adding a separate arm.
2. Grow a small number of substantial scaffold axes first, then secondary limbs
   and finer shoots. Use species-dependent apical control, crown-space demand,
   tropism and correlated directional variation. Do not make every junction a
   symmetric Y or apply independent high-frequency positional noise.
3. Compute radii from accumulated downstream demand with retained historical
   thickness, normalize to a mature size target, then shape taper locally around
   forks. Treat pipe scaling as a modeling approximation, not a universal exact
   botanical law; [biomechanical research](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0093535)
   documents departures from exact area preservation.
4. Generate a shared transition volume extending below and above major forks.
   Prototype bundled cross-sections or explicit junction patches, with a broad
   underside shoulder, an asymmetric crotch and a restrained bark ridge. Keep
   secondary lateral collars distinct from large division forks. Prevent balloon
   bulges, pinching, disconnected parts and a simple intersecting-tube silhouette.
5. Carry bark direction through the fork, then apply the installed PBR relief.
   Random texture phases transferred from independent tubes are not a substitute
   for continuous wood shape and coordinated bark orientation.

For London plane, target a substantial lower bole dividing into unequal spreading
axes; its mature open/spreading habit is documented by the species source above.
For silver linden, retain a stronger upright leader with substantial ascending
laterals and a dense broad-pyramidal crown. For red oak, retain a robust bole with
heavy ascending/spreading scaffold limbs supporting a rounded crown. These are
modeling targets informed by botanical descriptions and the supplied studies,
not instructions to copy one image or force identical forks across species.

### Validation before regenerating foliage

Prototype one mature specimen of each of the three reported species in a new
ignored staging directory. Render leafless neutral clay views of the whole wood
structure and close-ups of its first major forks, including a bus-height angle.
Review silhouette, diameter redistribution and shoulders before expensive foliage
renders. Check graph connectivity, positive radii, parent/child continuity and
meshed junctions. Then review PBR flow and the restored full canopy. Frame the
actual first major forks: the previous oak trunk crop cuts off the main junction.
Keep both existing reference collections and all PBR inputs unchanged while
developing this revision through the registered bake framework.

## Shared fork implementation

`growth.py` generates explicit successor axes and crown demand, and accumulates
that demand toward the bole before assigning radii. It retains historical radius
inputs when provided. `junctions.py` embeds successor bases and parent continuation
caps inside shared wood, with longitudinal shoulders. These are simplified guided
growth and overlapping-volume methods, not a reproduction of the full 2009 or
2024 simulations. Plane and oak divide into substantial uneven scaffold axes;
linden retains an upright segmented leader with ascending laterals.

`bark_flow.py` leaves source UVs and material files intact. A junction vertex mask
blends UV-mapped bark with a continuous object-space box projection of the same
base color, ORM and height. At forks, height supplies bump detail; outside, the
original tangent normal and UV displacement remain in use. Blending coordinates
themselves was rejected after previewing stretched bark bands.

`structure` is an explicit phase of `vegetation/enhanced-reference`. It renders
only the scaffold and roots at a 4 cm diagnostic voxel size; final builds use
2.2 cm voxels, the complete canopy, and separate finer shoots. The final gallery
also renders actual finished wood with foliage hidden, avoiding reliance on the
coarser diagnostic mesh. A `previous` manifest option authenticates the earlier
enhanced collection and adds before/after comparisons. Original references and
both previous enhanced candidates remain immutable inputs.

The current correction targets all nine mature forms of London plane, silver
linden and northern red oak. Elm and arrowwood remain in the previous enhanced
collection. The growth review is staged at
`tests/artifacts/screens/vegetation_enhanced_reference/20261012_growth_final/`.
It includes full-tree, actual-fork and foliage views, plus full and close-up clay
views for each primary specimen. Fork close-ups use a 1.6 m camera height.

The v3 surface pass relaxes the hard union locally, with its physical extent tied
to voxel spacing and branch radius. A clay review exposed a raised shoulder that
was partially hidden by the v2 bark; the v3 diagnostic removes that abrupt ridge.
The three already-built primary specimens were refined into a separate directory,
with unchanged foliage/twig data and wood topology. Maximum local movement was
under 8.3 cm. Other mature forms receive relaxation during their normal build.
The preserved `20261012_growth_review` directory contains the v2 candidate and
its diagnostic renders, not the final accepted surface treatment.

### Saved-mesh regression check

Final rendering exposed out-of-range wood vertices in plane mature_03, although
its source growth graph was valid. The first saved-mesh audit isolated this to
that specimen; all eight other models and every branchlet mesh had valid bounds.
The issue did not reproduce in a fresh single-specimen Blender build, so its
specific Blender-side origin is unproven. The rejected files remain under the
final review's `preserved_candidates/` directory; the isolated rebuild is retained
in `20261012_plane_repair/` and was copied only after a verified backup.

Builds now isolate specimens in separate Blender processes and check bounds after
every wood modifier. Rendering rejects invalid saved coordinates before tracing.
The `inspect` phase checks both coordinates and edge lengths; its regression run
in `20261012_mesh_guard_regression/` correctly rejects the preserved bad model.
Gallery validation reopens all selected models in Blender and authenticates a
passing saved-mesh audit against each final model hash.

Final validation: nine models, 39 CPU Cycles renders at 1440 × 1440 and 16 samples,
17 comparison sheets, and 15 authenticated installed AI material sets. All nine
saved-mesh audits pass. Seven numerical regressions pass, with shared forks, cap
enclosure and retained bole width checked across all nine variants. The gallery
receipt is `run-1791841739644-40228-e861e6f0`; input hashes confirm preservation of
the original and previous enhanced references. Runtime tree LODs are unchanged.

## London plane crown proportions and ramification

The following revision is scoped to London plane only. The v3 forks are smoother,
but its two long leaders leave too much exposed wood below a shallow, split crown.
The visual target is a short clear bole, a deep broad crown, and major limbs
distributed through multiple heights and directions, informed by the supplied
studies and the mature spreading habit in the NC State species reference above.

`plane_growth.py` replaces the plane's paired leader scaffold with a wandering
segmented main axis and seven staggered major limbs. Each divides into secondary
and tertiary branches, with crown groups along those successive axes. The first
scaffold is at 18% of target height; the remaining origins span the lower to upper
crown. Supporting diameter still follows accumulated demand and uses the shared
fork volumes and bark projection. This is guided artistic growth, not a complete
implementation of space colonization or a physiological simulation.

Record major scaffold origin heights and crown-support height quantiles. Numerical
checks reject one-level ramifications, an excessively high lower crown, missing
upper coverage, and concentration of crown demand in only two scaffold limbs.
Review the bare structure before the full model; render full-tree, trunk and leaf
comparisons plus actual clay geometry. All three mature plane variants remain
separate review outputs. Other species, current references, PBR source maps and
runtime LODs are unchanged.

The plane-only v5 review is staged separately at
`tests/artifacts/screens/vegetation_enhanced_reference/20261012_plane_ramification_v2/`.
It adds a textured leafless view and a root-crown detail, alongside the full-tree,
trunk, foliage and clay comparisons. The `wood-study` input authenticates the
supplied `Leafless London plane tree with exposed roots.png`; the gallery copies
it unchanged and labels its root detail as a crop. Three plane forms require
fifteen model renders and eight comparison sheets when that study is supplied.

The primary v5 model has seven major scaffold origins and 28 successive shared
forks, with 233 supported crown groups and 105,495 curved reference leaves. Its
lowest 1% leaf-centre height is 5.80 m in a 20.72 m rendered tree (28.0%), versus
9.44 m in the previous 18.27 m enhanced specimen (51.7%). This percentile measures
crown proportions while excluding isolated low leaves; it is not a coverage or
silhouette-area measurement. These are reference geometry counts, not LOD budgets.

The first plane ramification prototype was rejected for excessive main-axis
zigzag and toe-like root additions. Its outputs remain preserved. Correct the
axis with a continuous gentle drift and use thickness-weighted successor offsets
so a minor lateral cannot displace the dominant trunk equally. Coordinate basal
flutes with six descending structural root paths; roots originate within the
lower bole and taper beneath grade, rather than finishing as exposed toes.
The [UF/IFAS natural-root-flare reference](https://hort.ifas.ufl.edu/woody/natural-root-flare.shtml)
provides a photographic check for the trunk/root-crown transition. The optional
`structure-surface=clay` diagnostic bypasses only bark transfer and relief and adds
a root-crown view. Production-quality reference builds retain the complete PBR
path. Check all three plane seeds for gradual axis curvature and attached roots.

The completed v5 review contains three mature London planes, fifteen CPU Cycles
renders and eight comparison sheets. All three saved Blender models share the
same generator identity and pass the reopened wood/branchlet mesh audit with no
outlier edges. Original and previous enhanced model identities remain verified;
the installed material source hashes and copied study images are also verified.
The eleven growth regression tests pass, including dominant-axis continuity,
distributed crown demand and root-crown ground contact across all three seeds.
Final gallery validation receipt:
`tests/artifacts/screens/ai556_bake_framework/run-1791847446020-29936-e4221277/summary.json`.

Visual review confirms the deeper crown, staggered scaffold origins, smoother
dominant trunk and integrated basal flare. The textured leafless comparison also
shows the remaining artistic approximation: the fine twig hierarchy and surface
root subdivisions are simpler than the supplied leafless study. Do not describe
this reference revision as an exact reconstruction of that image.

## London plane hierarchy and inherited fork surfaces

The v5 review is retained as the comparison input. Its thick scaffolds still
transitioned directly into fine foliage supports, and surface roots appeared
attached at ground level. The v6 revision replaces that London-plane-only growth
graph with recursive partition of 224 uneven crown-space targets. Every group
divides into two successor groups until each terminal supports a foliage lobe.
This adds intermediate wood sizes and seven or more successive branch orders.
All supporting radii follow accumulated terminal demand with a 2.05 pipe exponent;
the bole starts at 0.57 m radius instead of 0.80 m. This is an artistic spatial
partition, not an implementation of the entire
[space-colonization algorithm](https://www.algorithmicbotany.org/papers/colonization.egwnp2007.html).
The paper informs the use of crown space and bottom-up support allocation.

Successors inherit the incoming tangent and the parent's surface cross-section
at their shared node. Their surface radii blend to their individual support
radii over a bounded portion of each segment. Thickening is confined to the
junction; finite-length blending keeps parent caps buried even for short final
segments. The old iterative fork relaxation is excluded for these plane forks:
it shrank the bole under the junction. A Blender mesh gate measures three actual
cross-sections below the first fork and rejects a lower 5th-percentile radius
below 88% of its designed value. This evidence is saved in the model record.
Other species retain their earlier meshing and growth paths.

Eight descending structural roots now emerge from higher within the bole and
share angular flutes that fade completely before the first branch fork. Their
centreline height follows a smooth descending profile constrained to ground
contact outside the base. Secondary and tertiary root divisions remain partly
exposed before their tips enter the ground. Fine crown wood below 6 cm radius
stays in the separate branchlet mesh rather than being erased by the 2.2 cm
wood voxel union.

Stage the revision at
`tests/artifacts/screens/vegetation_enhanced_reference/20261012_plane_hierarchy_v6_final/`.
With the previous collection and leafless study supplied, the three-form gallery
requires seventeen model renders and eight comparison sheets. The wood study
adds previous/revised/source columns for both leafless structure and roots.
Fourteen numerical growth/projection tests cover intermediate wood, inherited surfaces,
support conservation, buried caps and ground contact. Visual acceptance remains
separate from these numerical checks; neither proves botanical equivalence.

The first full v6 attempt was stopped during Blender's generic UV transfer after
more than 23 minutes; its staging and failed receipt remain preserved. London
plane now transfers bark charts by BVH selection of one source triangle per
remeshed face and affine UV projection of its loops. Face-local projection avoids
averaging across source UV islands. Finite coordinates and a maximum source
distance of six voxel widths are enforced, followed by the existing junction
projection blend and PBR relief. Source maps are unchanged. A full PBR wood
diagnostic and three renders completed in 52.2 seconds using this route; final
full-reference timing is recorded separately in the framework receipt.

The three final models built in 116.1 seconds under
`tests/artifacts/screens/ai556_bake_framework/run-1791857807186-49136-2c43928a/`.
They share one generator identity, each contains 447 structural paths and 224
terminal foliage supports, and their maximum branch orders are 10, 9 and 10.
Leaf counts are 103,393 / 102,874 / 102,398. The minimum measured bole-radius
ratios are 0.9674 / 0.9707 / 0.9676, and maximum bark-projection distances are
17.4 / 17.2 / 18.3 mm at a 22 mm wood voxel size. Fine root subdivisions remain
in the explicit branchlet mesh when they fall below the voxel-union threshold.

The completed v6 review contains all three mature forms, seventeen CPU Cycles
renders and eight comparison sheets. Reopening the saved models passes the wood
and branchlet bounds/edge audit with zero outlier edges. Original and previous
enhanced references, installed AI material files, supplied study copies and all
render identities pass authentication. The render receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1791857969950-18280-1441e810/summary.json`;
the final gallery/mesh-validation receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1791858690820-5508-a96ca423/summary.json`.
The gallery is `index.html` in the v6 output directory above; the direct
before/revised/source wood-and-root sheet is `london_plane_wood_study.png`.

Visual review covers all three full crowns, the primary specimen's trunk and
leaf views, and the leafless/root comparison. Intermediate limbs now continue
through successive forks, and the slimmer bole descends into taller flutes and
subdivided surface roots. The supplied study still has finer irregular twig
ramification and root relief; this revision remains a generated botanical
approximation rather than an exact reconstruction. No game LOD was replaced.

## London plane outward apical extension

The user rejected the v6 crown-space partition because its rounded target cloud
made the outer limbs turn sideways or inward along a common shell. Preserve v6
and replace that London-plane-only algorithm with unconfined branch extension.
The v7 crown has no sphere/ellipsoid target points, endpoint clipping or common
outer radius. Branch reach follows successive growth lengths. Two unequal mature
leaders support staggered spreading limbs; every limb continues into a longer
apical successor and a shorter side successor. Local directional persistence and
unequal reach produce projecting tips. An angular forward constraint prevents
descendants turning back against their supporting limb; it does not constrain
their endpoint positions to a crown surface.

Terminal foliage groups follow the wood direction as elongated branch sprays.
Their fan branches and leaf shoots extend forward with narrower lateral spread,
instead of creating spherical groups around every terminal. Other species keep
their existing foliage distribution. Shared fork surfaces, support-derived taper,
the 0.57 m basal radius, root integration and installed AI-generated PBR remain.

The first v7 structural diagnostic was rejected for a regular single-axis tiered
habit. Its staging remains at `20261012_plane_apical_structure_v1`; the next
diagnostic reviewed unequal mature leaders at `20261012_plane_apical_structure_v2`.
These are wood-only clay previews, not replacement final references. Diagnostic
framing now measures actual wood extent so projecting tips are not cropped.

The first leafy candidate is retained at `20261012_plane_apical_v7`; its central
gap was too large. Ascending inner branches now grow at intermediate shared
forks between the outer scaffold launches. They fill the interior without
redirecting outer tips back into a crown boundary. The final candidate directory is
`tests/artifacts/screens/vegetation_enhanced_reference/20261012_plane_apical_v7_final/`.
Fifteen numerical regressions cover growth, root/fork integrity and bark projection,
including a new check for persistent inward growth. Comparing structural segment
directions against their radial direction from the first fork gives backward
segment proportions of 34.435% / 31.785% / 33.880% for v6 and
0.000% / 0.000% / 0.000% for v7's three final seeds. Each contains 545 structural
paths and 272 terminal sprays. This metric diagnoses curling;
it does not establish botanical realism or replace visual silhouette review.

All three final v7 models share generator identity
`3b3a73266a80b4e83b7b6a4dd197524ed7ba038450133e6b06cf7b1dee378bd4`.
The registered build completed in 177.3 seconds with receipt
`tests/artifacts/screens/ai556_bake_framework/run-1791860130977-33356-fcb5c59e/summary.json`.
Leaf counts are 107,602 / 108,691 / 107,675; wood triangles are
946,916 / 914,536 / 940,256 and branchlet triangles are
1,765,304 / 1,773,864 / 1,783,432. These remain high-detail references.
Minimum measured bole-radius ratios are 0.9678 / 0.9697 / 0.9680.

Visual review of the first final specimen confirms outward terminal sprays and
an uneven canopy outline; its additional inner shoots reduce the rejected
prototype's central gap. A bark UV chart boundary is still visible on the large
branch behind the leaves in `enhanced_leaves.png`. The existing bark projection
was retained for this growth pass; that visible material limitation is not
covered by the successful geometry checks.

The completed v7 gallery contains three mature models, seventeen CPU Cycles
renders and eight comparison sheets. The saved-model mesh audit passes for all
three forms, and original/v6 references, rendered image identities and all fifteen
installed material sets remain authenticated. Render receipt:
`tests/artifacts/screens/ai556_bake_framework/run-1791860371836-51924-a5be5fd1/summary.json`.
Final gallery and reopened-mesh validation receipt:
`tests/artifacts/screens/ai556_bake_framework/run-1791861115393-25448-d10f6d84/summary.json`.
All three leafy silhouettes and the direct v6/v7/supplied leafless comparison were
visually reviewed. The gallery is `index.html` in the final v7 directory; editable
Blender sources are linked alongside each mature form. No game LOD was replaced.

## London plane spreading fine branchlets (v8)

The user accepted v7's main silhouette but rejected its hair-like terminal sprays.
Keep the 545 structural paths and root crown. Replace only the London plane's
fine-shoot generator with two unequal sprigs per terminal support, followed by
three nested fork orders. Short continuations and wider lateral successors vary
in length, fork plane and gentle curvature. Tips retain finite thickness instead
of tapering toward zero. Shared nodes, inherited attachment surfaces and buried
caps connect these shoots to the existing wood.

`branchlets.py` produces a pure geometry graph used by both leaf construction and
the bare `structure` preview. The old preview omitted the fine foliage supports;
it could not diagnose the hair-like sprays. A new close-up frames the highest
unchanged structural support, with the same target and scale for v7 and v8.
Leaves use the existing alternate-node placement and local crowding rejection.
Other species retain their previous generation sequence. This remains an artistic
growth approximation; no physiological simulation or runtime optimization is claimed.

The first clay diagnostic is preserved in
`tests/artifacts/screens/vegetation_enhanced_reference/20261013_plane_branchlets_v8_structure/`.
Its framework receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1791864347979-10060-8e5f2a77/summary.json`.
The new graph has 8,160 fine shoot segments instead of v7 mature_01's 14,299
leaf-bearing shoots plus 1,632 fan supports. Its shortest tip radius is 1.8 mm
instead of 0.45 mm. Terminal sibling directions diverge by more than 40 degrees.
Eighteen pure-Python regressions pass, including unchanged scaffold coordinates,
connected fine nodes, shoot slenderness and spreading fork angles.

Final build/review staging is
`tests/artifacts/screens/vegetation_enhanced_reference/20261013_plane_branchlets_v8/`.
The v7 summary is the authenticated previous input. A complete three-form v8
gallery requires nineteen CPU Cycles renders, including two matched branchlet
close-ups, and adds `london_plane_branchlets.png`. No installed game trees,
material maps, baseline models or prior review files are replaced.

The three v8 builds share identity
`fdbce31c09d851235f24ce5bafe7cf7985c0896d981a148254d0130d8382129f`.
The build receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1791864502917-37688-138629c7/summary.json`
(104.2 seconds). The saved architecture files retain all 601 structural and root
centerlines/radius arrays exactly from v7. Each model has 8,761 total paths.
Leaf counts are 38,861 / 39,137 / 38,932; wood triangles are
946,972 / 915,140 / 940,416 and fine-branch triangles are
1,641,600 / 1,647,136 / 1,643,296. Explicit fork surface overlap adds triangles;
this pass is a reference-shape correction, not runtime optimization.
Minimum measured bole-radius ratios are 0.9684 / 0.9705 / 0.9680.

The first leafy render is visibly airier than v7. The reduction in overlapping
shoots also reduces leaf count; equal canopy opacity is not claimed. The v7
branch/root design, projecting crown tips, installed PBR and leaf template meshes
are retained. The existing bark chart-seam limitation remains outside this pass.

The final v8 review has three saved mature models, nineteen CPU Cycles renders
and nine comparison sheets. Saved wood/branchlet mesh audits pass for all models;
baseline/v7 model identities, all rendered images, and fifteen installed AI PBR
sets pass authentication. Render receipt (662.1 seconds):
`tests/artifacts/screens/ai556_bake_framework/run-1791864641302-37808-26e2bd08/summary.json`.
Gallery and reopened-mesh validation receipt (21.4 seconds):
`tests/artifacts/screens/ai556_bake_framework/run-1791865329982-45252-867f9f26/summary.json`.
All three leafy forms, the primary leafless model, leaf view and matched twig
close-up were visually inspected. `london_plane_branchlets.png` directly compares
v7 and v8 at the same outer support; `index.html` contains the full review and
editable Blender links. Previous references and installed game LODs are preserved.

## London plane reference-guided foliage (v9)

The supplied `Branching London Plane Branchlet.png` guides a foliage-only pass
over the accepted v8 wood. NC State's London plane entry documents alternate
leaves and petioles 2–4 inches long:
https://plants.ces.ncsu.edu/plants/platanus-x-acerifolia/ .
The image is an artistic arrangement reference, not a measured scan. Copy it
unchanged into the review's references directory and record its hash.

The registered `foliage` phase authenticates the v8 candidate and previous
summary. It preserves wood and branchlet mesh positions, loop topology and UVs,
copies the architecture manifest unchanged, and replaces foliage in separate
v9 files. Curved cylindrical petioles support individual geometric blades;
alternate attachment, uneven internodes, mixed blade orientation and smaller
young tip leaves follow the supplied study. Existing installed AI-generated
front/back PBR maps retain their catalog provenance. No new map is generated.
Leaf crowding is evaluated around blade centers beyond the petiole, using six
orientation candidates. This does not prove absence of all triangle intersections.

An isolated shoot view extracts faces and leaf instances from the actual saved
tree, without reconstructing a different display model. Its image is compared
with the user's original branchlet study. The complete three-form v9 gallery
requires twenty frames. Earlier comparison images may be reused only with
matching image/model hashes, camera, samples, resolution and lighting revision.

The first foliage candidate remains preserved in
`tests/artifacts/screens/vegetation_enhanced_reference/20261013_plane_foliage_v9/`.
Its isolated preview exposed opaque triangles spanning the transparent basal
notch and stalk UVs outside the narrow source petiole. The corrected blade uses
the first mask exit along each radial ray, retains basal lobes, and locates the
petiole junction from the connected central mask run. Cylindrical stalk UVs
follow the source stalk centerline. This remains actual opaque leaf geometry,
not alpha cards. Twenty growth/foliage regression tests pass, including a
notched-blade test which checks radial tissue against the mask.

Final staging is
`tests/artifacts/screens/vegetation_enhanced_reference/20261013_plane_foliage_v9_final/`.
The v8 collection, older references and game LOD assets remain preserved.

The three v9 forms contain 38,422 / 38,784 / 38,546 leaves, including
4,318 / 4,328 / 4,317 smaller young leaves. Each of eight reusable reference
leaf prototypes has 5,376 triangles, including front/back tissue and the
volumetric petiole; these are instanced high-detail reference models. The build
verifies the accepted wood and fine-branch mesh digests, and all three copied
architecture files have identical hashes to v8. The code identity is
`f7e523321f06f50aeeb0ac5d7e557fc9e1855cdebbf7f0f5654fed1f403e84ac`.
Build receipt (92.7 seconds):
`tests/artifacts/screens/ai556_bake_framework/run-1791869145244-41048-70afe8bc/summary.json`.
The isolated shoot was rendered and visually inspected before the complete
review render; its receipt (25.6 seconds) is
`tests/artifacts/screens/ai556_bake_framework/run-1791869292090-50856-4402b039/summary.json`.

The complete v9 review contains twenty authenticated render frames and nine
comparison sheets, including the actual isolated shoot beside the supplied
branchlet image. All three mature forms and both foliage detail views were
visually inspected. The reopened-model audit independently confirms both wood
mesh digests for each form, and verifies saved mesh bounds. All fifteen installed
AI PBR sets and the baseline/previous reference identities pass authentication.
Full-render receipt (212.1 seconds):
`tests/artifacts/screens/ai556_bake_framework/run-1791869358183-28264-c8da1c48/summary.json`.
Gallery and reopened-mesh receipt (21.6 seconds):
`tests/artifacts/screens/ai556_bake_framework/run-1791869645173-45088-6eb13d6f/summary.json`.
The gallery is `index.html`; `london_plane_foliage_study.png` shows the supplied
branchlet comparison, and `mature_forms.png` shows the three complete trees.

## London plane lower limb posture (v10)

The user accepted mature_01 and marked the low outward limb on mature_02 and
mature_03 as too horizontal. The first scaffold in those forms launches at
14.6 and 10.9 degrees above horizontal. The `posture` bake phase raises only
that scaffold family in each form to 38 degrees. Its first 12 percent retains
the original tangent; rotation blends smoothly to full strength by 58 percent
of scaffold length. Descendant paths and their existing leaf instances receive
the same rigid transform. All path radii and unrelated source paths remain
unchanged. The existing fused-wood and bark-transfer pipeline remeshes the wood.
The first specimen is copied exactly, including its Blender file and metadata.

Source collection:
`tests/artifacts/screens/vegetation_enhanced_reference/20261013_plane_foliage_v9_final/`.
New isolated collection:
`tests/artifacts/screens/vegetation_enhanced_reference/20261013_plane_posture_v10/`.
All previous collections and installed game LODs remain preserved. The gallery
has 26 frames, including leafy/bare before-and-after views of both adjusted
specimens. The focused regression checks connection continuity, unchanged
unrelated paths, preserved radii, rigid descendant lengths and the new elevation.

Twenty-one growth/foliage tests pass. Each correction moves 1,023 paths within
one scaffold family. It rotates 4,512 leaves in mature_02 and 4,549 in mature_03;
the total leaf counts remain 38,784 and 38,546. All unrelated saved path positions,
all radii and the shoot manifest compare exactly with v9. The copied mature_01
Blender file has the same SHA-256 as v9. The rebuilt bole width ratios remain
above 0.967 in both corrected specimens. The before/after cameras reuse each
specimen's v9 full-tree camera, so framing is identical.

Build receipt (47.5 seconds):
`tests/artifacts/screens/ai556_bake_framework/run-1791904183246-46736-bdbd5671/summary.json`.
The supplied branchlet image is no longer present at its original Downloads
path; both branchlet and leafless studies are read from the v9 review's preserved
copies. Their SHA-256 values match the previous source-study manifest exactly.

The completed review has three models, 26 authenticated render frames and ten
comparison sheets. Both adjusted trees were inspected with and without leaves;
their paired cameras match exactly. Reopened mesh audits pass for all models,
and baseline/prior identities and installed material provenance pass validation.
Render receipt (203.6 seconds):
`tests/artifacts/screens/ai556_bake_framework/run-1791904323104-44360-d8d193c9/summary.json`.
Gallery and saved-mesh receipt (22.5 seconds):
`tests/artifacts/screens/ai556_bake_framework/run-1791904583224-50356-cc7ea5cb/summary.json`.
`mature_forms.png` shows the updated trio; `london_plane_posture.png` contains
both leafy and bare before/after pairs. The first specimen's render is reused
from the authenticated v9 review. No game assets or earlier reference files
were replaced.

## London plane spatial foliage placement (v11)

The user rejected the crowded v9 leaf arrangement and explicitly permits a
different leaf count. The spatial foliage mode uses the v10 collection as its
source so the accepted lower-limb corrections remain intact. The existing
wood, fine-branch meshes and architecture manifests are preserved exactly.

Leaf-bearing nodes now depend on the usable arc length of each twig instead
of its old fixed station count. Uneven intervals, alternating rank with angular
variation, longer curved petioles and smaller young tip leaves remain part of
the layout. Sixteen candidate directions and orientations compete for space
against oriented ellipsoidal blade proxies. Candidates are processed in a
seeded randomized order; a node is omitted if every candidate remains crowded.
The result has no fixed leaf quota. Proxy clearance does not prove absence of
all triangle intersections or view-dependent occlusion.

The source is
`tests/artifacts/screens/vegetation_enhanced_reference/20261013_plane_posture_v10/`.
New preview staging is
`tests/artifacts/screens/vegetation_enhanced_reference/20261013_plane_spacing_v11/`.
The review compares the same actual isolated shoot in both models with identical
framing, alongside the unchanged supplied branchlet image. All three mature
forms receive full-tree renders. The complete collection requires 21 frames.

The first spacing preview made the full canopy too sparse, despite the improved
isolated shoot. It remains preserved in the preview directory. The final candidate
uses a mean node pitch of about 44% of nominal blade length and young tip blades
at 65–82% of adult scale, while retaining the same spatial rejection threshold.
This fills available gaps rather than reinstating the previous per-shoot quota.
Final staging is
`tests/artifacts/screens/vegetation_enhanced_reference/20261013_plane_spacing_v11_final/`.

Twenty-three focused growth and foliage tests pass. Final leaf counts are
15,739 / 16,108 / 15,694 for mature_01 / mature_02 / mature_03, respectively,
compared with 38,422 / 38,784 / 38,546 previously. The total is 47,541 rather
than 115,752 (about 59% fewer); these counts are an outcome of spacing, not
an imposed budget. All three architecture.json files match their v10 sources
byte-for-byte. During generation, wood vertex, topology and UV digests remain
exactly equal to the authenticated source meshes.

Build receipt (120.3 seconds):
`tests/artifacts/screens/ai556_bake_framework/run-1791905996004-29748-f1b64d6e/summary.json`.

The completed review contains 3 models and 21 authenticated render frames.
Reopened saved-mesh audits confirm wood topology, positions and UVs are preserved
for all three models. Installed PBR provenance and unchanged baseline/prior file
identities pass the existing framework gates. The isolated before/after shoot
and all three full-tree renders were visually inspected.

Render receipt (242.4 seconds):
`tests/artifacts/screens/ai556_bake_framework/run-1791906146359-23860-e2d77699/summary.json`.
Gallery and saved-mesh receipt (24.4 seconds):
`tests/artifacts/screens/ai556_bake_framework/run-1791906426492-29504-5507967f/summary.json`.
`london_plane_foliage_study.png` presents the matched old/new isolated shoot and
supplied branchlet. `mature_forms.png` presents the three full trees. Earlier
reference files and runtime assets remain intact; this is reference-only work.

## Shallow branchlet sprays and fuller crown (v12)

The user requests flatter leaves along each branchlet for subsequent alpha-card
conversion, outward-facing branchlets around a dome-like crown, and a fuller
canopy closer to the supplied study. London plane remains the sole species in
this pass. The v11 collection is preserved as the source. A first candidate
retains every accepted leaf, including scale, form and tint, to evaluate coverage
from placement alone before deciding whether extra foliage is necessary.

Fine-shoot families become shallow connected fans with normals distributed around
the local crown exterior. No camera-facing behavior is added to the game. Leaves
alternate in the fan plane with small tilt and reduced tissue curvature; they
remain 3D geometry. Roots, trunk and major wood stay exact, while the fine twig
surfaces are rebuilt around the adjusted connected centerlines. Shared fork
positions and radii are preserved. The preceding low-limb posture fixes remain.

Candidate staging:
`tests/artifacts/screens/vegetation_enhanced_reference/20261013_plane_dome_v12/`.
Three 2.7 m road-height viewpoints compare old/new foliage coverage using alpha
masks that exclude wood, shadows and ground. Matched isolated shoot face and
edge views expose planarity. The complete three-model review requires 35 frames.

The first v12 preview used one fan per complete fine-shoot family. Its road-view
coverage changed by approximately -2.8%, -1.4% and +15.9%; neighboring fans were
visibly aligned edge-on around some crown edges. That preview is preserved and
is not the final choice. The next candidate splits at the following fork order,
uses paired staggered normals, broadens the local fan spread, and searches both
petiole direction and node position. It still retains the accepted leaf count.
Staging: `tests/artifacts/screens/vegetation_enhanced_reference/20261013_plane_dome_v12_staggered/`.

The staggered candidate preserves 15,739 leaves in mature_01. Each of its 1,088
smaller fan families is shallow, and adjoining families use different directions
around their branch group. Average leaf-normal alignment with its own fan is
0.9983. No leaves are added and the existing instance scales and tints remain.
The 960 px preview at three matched road-height views measured +20.48%, +18.99%
and +17.42% foliage-only projected alpha area compared with v11. The first
large-fan attempt therefore remains a rejected preview. The staggered layout is
selected for all three variants and the final 1440 px comparisons.

Twenty-five targeted tests pass, including preserved structural paths/radii,
shared fine-fork connections, shallow fans, retained leaf count/scale/tint and
attached planar leaf frames. Preview build receipt (66.7 seconds):
`tests/artifacts/screens/ai556_bake_framework/run-1791909122583-50044-21eee78b/summary.json`.
Preview render receipt (69.7 seconds):
`tests/artifacts/screens/ai556_bake_framework/run-1791909228694-39520-ff359632/summary.json`.

All three saved architecture files were compared against v11: zero changed
structural centerlines and zero changed radius profiles. Their leaf counts are
unchanged at 15,739 / 16,108 / 15,694. The trunk mesh digests match the preserved
sources. Fine branchlets alone are repositioned and remeshed; prototype curl,
fold and petiole arch are reduced to 30% for the shallower sprays.
Remaining-variant build receipt (125.3 seconds):
`tests/artifacts/screens/ai556_bake_framework/run-1791909384866-51312-5e9b41d0/summary.json`.

Final rendering completed at 1440 px / 16 Cycles samples, with one-sample
foliage-only masks. The completed review has 3 models and 35 authenticated render
frames. Reopened mesh audits pass, preserved trunk digests match, and the 15
installed PBR sets retain authenticated AI provenance. All full-tree renders
and both isolated shoot views were visually inspected. Earlier references,
rejected previews, and lower-resolution frames remain preserved.
Render receipt (496.9 seconds):
`tests/artifacts/screens/ai556_bake_framework/run-1791909547546-52140-df1bfdb4/summary.json`.
Gallery and saved-model validation receipt (24.1 seconds):
`tests/artifacts/screens/ai556_bake_framework/run-1791910083691-24568-65203a14/summary.json`.
The gallery includes `london_plane_canopy.html` (three matched road views and a
branchlet edge comparison), `london_plane_foliage_study.png` (leaf arrangement)
and `mature_forms.png` (all three trees). No game LODs or binary assets are
published or committed during this reference-only change.

Final 1440 px foliage-only projected-area gains for mature_01 are +20.43%, +18.94% and +17.63% at the three matched road-height viewpoints. This metric is measured on the first specimen; all three forms are rendered and inspected. No leaf-count increase was needed.

## Organic aligned foliage (v13, October 13)

The user found v12 overly planar and card-like. The new `organic` foliage layout
uses the authenticated v12 models and retains their outward-facing sprays. It
restores full prototype curl, twist, fold and curved petioles, and introduces
coherent shoot lean with modest alternating blade roll. Twelve nearby orientation
candidates avoid crowding; accepted leaf normals stay within 36 degrees of their
spray normal. The existing node positions, forms, sizes and tints are retained.
The user permits additional leaves if necessary to compensate for coverage loss;
the first candidate is measured before deciding whether they are needed.

The entire architecture and both woody mesh digests remain unchanged, including
roots and corrected lower limbs. This changes reference leaf geometry only.
The v12 collection, original reference collection and runtime LODs are preserved.
New staged outputs: `tests/artifacts/screens/vegetation_enhanced_reference/20261013_plane_organic_v13/`.

Twenty-six focused tests pass, including attached nodes, invariant wood paths,
proper orthonormal leaf frames, meaningful out-of-plane variation and bounded
deviation from the parent spray. Final coverage and visual review are pending.

The 960 px first-specimen preview retained 99.1–99.3% of v12's foliage-only
projected area at three road-height views, without adding leaves. The edge and
front details show full petiole arch, curved tissue and modest orientation
variation. A rare combined source/new tilt exhausted the candidate search on
mature_03; the initial partial preview is preserved. The local pitch/roll vector
is now capped at 27 degrees before composing it with the saved fan orientation,
retaining the absolute 36-degree acceptance limit. An extreme-source-tilt
regression test brings the passing focused suite to 27 checks.

All three final models use that same bound and are regenerated in
`tests/artifacts/screens/vegetation_enhanced_reference/20261013_plane_organic_v13_final/`.
Their completed renders and saved-mesh validation will be recorded below.

Final model generation completed successfully for all three variants in 61.4 s.
They retain 15,739 / 16,108 / 15,694 leaves respectively; median fan deviations
are 15.02 / 14.97 / 14.99 degrees, with maxima below 33.77 degrees. All three
architecture files are byte-identical to v12. The common generator identity is
`b4f4bd7653233bc1b3723a39e3e17b9b92a30db5be2d37bf70a51c0c3c41843c`.
Build receipt:
`tests/artifacts/screens/ai556_bake_framework/run-1791916214182-44436-106b1d20/summary.json`.

The final 1440 px / 16-sample CPU Cycles review completed with three models and
35 authenticated render records. The reopened wood and fine-branchlet mesh
audits pass; original and previous reference hashes remain intact. All fifteen
installed PBR sets still pass their existing AI-provenance and file-hash checks.
Full renders of each mature form, the isolated front/edge shoot, and the leaf-area
close-up were visually reviewed. Final first-specimen coverage retention versus
v12 is 99.26%, 99.33% and 99.11% at identical road-height cameras. These results
do not require extra leaves. They are projected foliage area, not GPU timings.

Render receipt (322.1 s):
`tests/artifacts/screens/ai556_bake_framework/run-1791916302658-51544-07c297e4/summary.json`.
Gallery/validation receipt (25.7 s):
`tests/artifacts/screens/ai556_bake_framework/run-1791916651597-20876-2d10e65e/summary.json`.
The gallery includes `mature_forms.png`, `london_plane_foliage_study.png` and
`london_plane_canopy.html`. This pass publishes no game models or binary assets.

## Additional specimen poses and branchlet context (October 13)

The user requested a source commit and additional renders in the existing v13
page. `views=poses` adds a side and rear three-quarter view for each mature form,
plus an oblique close-up of the first model's study branchlet both in the canopy
and isolated. These are eight additional frames; the same saved model identities
and all existing render records are preserved. The existing front in-canopy and
isolated branchlet views provide a second pair. The expanded gallery requires
43 authenticated frames and verifies the oblique pairs' camera, scale, lighting,
source, resolution and sampling settings.

The same page embeds all three full-tree angles and both close-up pairs, with a
separate `london_plane_poses.html` sheet linked for focused review. The previous
root-level page, comparison sheets and manifests are preserved in
`review_history/before-extra-poses-20261013/`. No model regeneration, texture
replacement or runtime asset publication is part of this presentation update.

Source validation before rendering: all 27 geometry tests and both botanical
PBR catalog tests pass. The commit includes only the vegetation workflow,
specifications, tests, catalog code and fifteen text material configurations.
Generated binary assets and unrelated material edits are excluded.

Eight new 1440 px / 16-sample CPU Cycles frames completed in 251.9 seconds.
The gallery validated all 43 renders, reopened all three models, and checked
every new pair. Model SHA-256 identities and all 35 previous image hashes match
the pre-update snapshot. The complete pose sheet was visually inspected.
Render receipt:
`tests/artifacts/screens/ai556_bake_framework/run-1791931009821-47140-7e107bb0/summary.json`.
Gallery receipt (29.0 s):
`tests/artifacts/screens/ai556_bake_framework/run-1791931327700-43128-6db97374/summary.json`.

## Spatial scaffold and intrinsic leaf curvature revision (v14)

Preserve v13, including its showcase video, before changing the three London
plane references. The staging-only `shape` phase redirects six low/middle
scaffold families per specimen into unequal rising directions and azimuths.
Forks inherit their parent's tangent and retain connected descendants, branch
orders and attached leaves. The bole, root paths and radii remain unchanged;
the existing union/UV pipeline rebuilds continuous woody surfaces. No common
spherical crown boundary is imposed.

Leaf blades themselves must bend: a bowed midrib, cupped lobes, modest torsion
and drooping tips replace shallow sheets without randomizing the entire spray.
Preserve the eight prototype identities, source UVs, petiole junctions, node
attachment, sizes, counts and tints. Reopened prototype geometry must exceed a
best-plane RMS residual of 0.02 blade lengths. Pure geometry tests also cover
fork continuity, upward scaffold elevation and unchanged root paths.

The comparison includes all three trees from front/side/rear, matched prior
side/rear views, bare structure from multiple angles, and individual leaf
oblique/edge views using actual saved geometry. Existing hash, provenance,
wood-bounds, input-stability and complete-gallery gates remain required.
This revision changes only enhanced reference artifacts, not runtime assets.

Validated output:
`tests/artifacts/screens/vegetation_enhanced_reference/20261013_plane_spatial_v14_final/`.
All three saved models and 63 render records passed the geometry, hash and
material provenance gates. All 29 growth/foliage tests and 14 shared bake tests
pass. The source checkpoint is `c5ff56a7`; new geometry work follows that commit.

The 57 bole/root paths per model retain their exact source points. All radii
and leaf counts remain unchanged (15,739 / 16,108 / 15,694). Fork separation in
the saved graph is below 1e-10 m. The six corrected scaffold axes span 41.5–54.5
degrees above horizontal across the three forms, with unequal azimuth changes.
The eight saved blades have best-plane RMS residuals of 0.063–0.095 blade lengths.

The rising branches make the crown outline more compact. First-specimen
projected foliage area retains 85.46%, 80.89% and 73.12% of v13 across the three
matched road-height views. Within the convex outline, binary foliage fill
increases from 56–59% to 63–68%. These measures describe changed silhouette and
packing; they are not a performance benchmark or a preserved-volume claim.
The gallery exposes the matched masks and unchanged leaf counts.

Build receipt (73.1 s):
`tests/artifacts/screens/ai556_bake_framework/run-1791938237222-31932-19632690/summary.json`.
Render receipt (838.3 s):
`tests/artifacts/screens/ai556_bake_framework/run-1791938551581-9448-4a84976e/summary.json`.
Gallery receipt (29.9 s):
`tests/artifacts/screens/ai556_bake_framework/run-1791939515657-10228-298a642b/summary.json`.
Study images were recovered for presentation from the authenticated v13 copies;
their recorded SHA-256 values match. No binary assets were committed or published.

## Silver linden proportional growth revision (October 14, v4)

Replace the enhanced linden's oversized bole and rectangular crown with a slimmer
dominant leader and a progressively narrowing crown. Keep the existing v3 models
and original references intact. The rule applies to all three mature variants
and independent seeds; no camera or selected specimen determines the shape.

The profile's basal radius becomes 0.43 m (previously 0.64 m), and the first fork
starts at 20% of target height. Eighteen ascending scaffold families are staggered
around the leader with unequal spacing and azimuth variation. Three additional
orders of unequal successor growth distribute the crown in three dimensions.
Branches inherit the parent's tangent and share descendant-demand thickening.
Both extension length and foliage-group size decrease toward the top, retaining
an irregular conical silhouette rather than pruning against a geometric shell.
Foliage groups must also grow along intermediate branch sections, not only at
the terminal forks. Wider fan and shoot spread fills the intervening volume;
leaf counts may change to preserve a dense crown with discernible branch groups.

Reuse the continuous root-crown surfaces, inherited fork transitions, voxel union
and lengthwise bark projection proven for London plane. Skip the old shrinking
fork relaxation for this architecture. Check fourteen clear-bole cross sections
after meshing/displacement and again after reopening: their fifth-percentile
radius must remain at least 88% of the specified radius. Check actual saved leaf
origins: upper crown radius must be below 80% of the lower crown radius, and the
middle below 110%, using the same height-band metric recorded during generation.

Validate seed-independent topology, monotonically tapering radii, demand
conservation, inherited directions and crown proportions. Render the three forms
plus full-tree, trunk and foliage comparisons with the preserved v3 models and
both supplied study styles through the existing enhanced-reference bake leaf.
Retain AI material provenance; this pass publishes no runtime assets or textures.

Surface overlap must fit the actual parent segment: burial stations may not
collapse onto the same endpoint when a trunk segment is shorter than its radius
would otherwise require. Test every generated surface for distinct adjacent
rings. In addition to the clear-bole width check, radial rays from centerline
stations throughout the dominant leader must exit solid wood in at least four
of six directions. Reopen and repeat this test on saved files; overall bounds
alone cannot detect a missing trunk section. The existing `refine` phase can
remesh authenticated v4 linden candidates while retaining the complete growth
graph, foliage placements and prototype geometry. Preserve all earlier outputs.

Validated collection:
`tests/artifacts/screens/vegetation_enhanced_reference/20261014_linden_conical_v4c_final/`.
All three saved models, thirteen 1440 px / 24-sample CPU Cycles frames, both
supplied study copies and fifteen installed material sets pass the gallery gates.
The three forms retain 195,682 / 195,934 / 196,245 leaves after the wood repair.
All 596 sampled leader sections have six valid outward exits; foliage placement
and prototype digests match the preserved pre-remesh candidates. The audit
detects twelve invalid sections in the earlier second specimen and none in its
replacement. Clear-bole radius checks remain above 96% of the intended radius.
All 33 focused vegetation tests pass, including eighteen linden seed/size cases
and the formerly failing coincident-ring regression. The complete mature-form,
full-tree, trunk, leaf and source-study comparison sheets were visually reviewed.

Wood repair receipt (79.1 s):
`tests/artifacts/screens/ai556_bake_framework/run-1792000078231-22004-4fdf0306/summary.json`.
Final render receipt (665.1 s):
`tests/artifacts/screens/ai556_bake_framework/run-1792000212335-25836-adf6e659/summary.json`.
Gallery/audit receipt (88.7 s):
`tests/artifacts/screens/ai556_bake_framework/run-1792000951473-27096-7c709be8/summary.json`.
The preserved baseline and previous enhanced model hashes remain unchanged.
