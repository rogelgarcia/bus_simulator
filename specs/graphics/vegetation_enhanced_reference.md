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

## Northern red oak open crown (v4)

The `open-oak` profile replaces overlapping crown clouds with three ascending
axes, twelve staggered scaffold families and five orders of unequal outward
successors. The basal radius is 0.62 m and first division is 17.5% of target
height. Branches inherit their parent tangent and supporting radius; reuse the
continuous root crown and bark projection rather than adding side tubes.
The crown emerges from branch extension without a clipped spherical boundary.
Measure breadth over 36 azimuths, requiring minimum/maximum breadth >= 0.70 and
minimum breadth/tree height >= 0.85. Pure tests cover eighteen seed/size cases.

Leaf-bearing sprays grow along the outer three structural branch orders, not
only at the tips. Short, visibly forked branchlets carry alternate, arc-length-spaced leaf nodes.
Coherent outward/upward spray normals retain bounded organic leaf rotations.
Ten placement candidates are checked against oriented blade volumes; crowded
nodes may be omitted. Counts follow available space, not the previous leaf count.
The oak's narrower blade uses relative exclusion half-axes 0.44/0.49/0.12 and
a minimum proxy clearance of 0.80 to allow modest natural overlap. Spray faces
combine outward radial and upward directions rather than being constrained
perpendicular to each twig; this keeps foliage readable from road height.
Curved opaque blade geometry retains source front/back PBR and gains short
volumetric petioles. The separation proxy does not guarantee zero intersections.

Build and render all three forms through `vegetation/enhanced-reference` into a
new ignored collection. Reopen saved meshes and repeat bole-width and crown
breadth checks before the standard previous/current/enhanced/study gallery gate.
Existing tree collections and installed runtime LODs remain preserved.

Growth references: [NC State Extension](https://plants.ces.ncsu.edu/plants/quercus-rubra/)
describes a broad spreading crown; [Oregon State University](https://landscapeplants.oregonstate.edu/plants/quercus-rubra)
describes ascending major branches and alternate lobed leaves. These support the
species habit; the numerical growth rules are artistic approximations informed
by the user-supplied illustrative and photorealistic studies, not biology simulation.

Validated collection:
`tests/artifacts/screens/vegetation_enhanced_reference/20261014_oak_open_v4b_review/`.
All three reopened models pass the crown and continuous-bole checks. Crown
minimum/maximum width ratios are 0.864 / 0.936 / 0.892; measured bole radii remain
above 96% of their intended values. The forms carry 40,757 / 40,535 / 40,781
geometry leaves. These remain detailed reference models, not runtime LODs.
Thirteen 1440 px / 16-sample CPU Cycles frames and seven comparison sheets show
the full trees, trunk forks, foliage and unchanged supplied study images.
All 35 focused vegetation tests pass, including eighteen oak seed/size cases.
The gallery verifies all saved geometry, fifteen installed material sets and
preservation of the original and previous enhanced model hashes.

Final render receipt (220.3 s):
`tests/artifacts/screens/ai556_bake_framework/run-1792014234794-22132-94b1cda1/summary.json`.
Gallery/audit receipt (30.0 s):
`tests/artifacts/screens/ai556_bake_framework/run-1792014478590-18280-ca0a6237/summary.json`.
The earlier sparse review and structure probes remain preserved separately.

## Northern red oak spatial ramification (v5)

Major limbs must bear branches in depth as well as across the silhouette. The
v4 outer forks already rotated in space, but retained a fixed guide and left
long proximal sections without foliage-bearing successors. Each major scaffold
now grows three shorter offshoot families at staggered intermediate stations.
Their azimuth advances around the actual limb axis with seeded variation. The
nine lateral scaffold bearings interleave around the trunk, with angular gaps
below 70 degrees in the seed regression, avoiding three narrow leader sectors;
successive forks update their growth guide toward the local parent direction.
No camera direction, spherical boundary or specimen-specific correction enters
the rule. The same continuous fork meshing, gradual taper and organic leaf
placement remain in use. Leaf count follows the resulting available space.

Regression tests require intermediate offshoots between 20–85% of every major
limb and a largest empty azimuth sector below 170 degrees around its axis. Test
six seeds at all three mature sizes, alongside existing crown, tangent, taper,
pipe conservation and spacing checks. The preserved v4 collection is the
comparison source. A new isolated collection adds side, rear and elevated views
for all forms, matched old/new primary views and a bare elevated structure pair.
The review validates those camera pairs and saved model hashes before delivery.

## Northern red oak spaced terminal sprays (v6)

Retain the v5 scaffold distribution in all three dimensions, but do not place
complete foliage fans on both a parent support and its descendants. Only terminal
structural supports may start a fine spray, with one four-level spray per support
instead of two complete fans at every outer structural level.
Each shoot tests six locally rotated directions against previously occupied
sprays. Reject its subtree if all directions enter the leaf-scale spacing margin
(0.85 times the species leaf length). Competition order is seeded and shuffled;
neither model name nor camera orientation drives it. Organic leaf placement and
blade shapes remain independent, with no required fixed leaf count. Each spray
also has a seeded bounded face azimuth around its outward/upward direction, so
an entire side of the crown does not align its blades edge-on together. Leaves
within each spray retain coherent normals and bounded individual variation.
Candidate alternate leaf internodes use 0.24–0.34 times the species blade length;
the existing blade exclusion test still rejects crowded nodes. Coverage comes
from leaf-bearing length on these spaced shoots, not additional stacked fans.

The spacing measure samples shoot centrelines beyond their proximal attachment;
it does not guarantee exact mesh nonintersection or prevent overlap within a
single natural spray. Record accepted supports, rejected subtrees, shoot count
and measured minimum clearance in each model's `crowding.branchletSpacing`.
The `structure` phase must include these actual fine shoots in its clay views,
including a branchlet detail and elevated view, before the full foliage review.
The regression first reproduced the ancestor/descendant fan duplication, then
checks terminal-only unique launches, connected origins and the spacing margin.
All prior candidates and original references remain preserved.

The v6c review collection is staged at
`tests/artifacts/screens/vegetation_enhanced_reference/20261014_oak_spaced_v6c_review/`.
Its three forms retain all 981 scaffold/root paths from the v5b candidates
exactly, including sampled centres and radii; recorded branch-anchor error is
zero. Fine shoot segments fall from 25,200 per form to 6,624 / 6,688 / 6,488
(73.7% / 73.5% / 74.3% fewer), distributed among 456 / 458 / 451 accepted sprays.
Leaf counts are 23,568 / 23,895 / 23,059, with the existing oriented-blade spacing
threshold retained. Crown minimum/maximum azimuth width ratios are
0.918 / 0.895 / 0.932. These are reference models, not new runtime LOD assets.

Build receipt (308.8 s):
`tests/artifacts/screens/ai556_bake_framework/run-1792031733274-24292-c0b1bb1a/summary.json`.
The complete 37-test vegetation suite passed after twig and face-orientation
changes; all four oak tests passed again after the leaf-internode adjustment.
Sparse v6 and v6b trials remain preserved in their separate review directories.
The complete 27-frame, 1440 px, 16-sample CPU Cycles render passed source
stability validation; its receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1792032086188-2944-c3147cc6/summary.json`.
Saved-mesh audits, comparison-camera gates, original/previous hashes and installed
AI-material checks passed before gallery delivery. Gallery receipt (35.3 s):
`tests/artifacts/screens/ai556_bake_framework/run-1792033362078-28332-a9018d64/summary.json`.

## Northern red oak ascending growth and sparse-region fill (v7)

Prevent persistent downward structural offshoots by smoothly biasing their
elevation above 0.20 radians while preserving horizontal bearing, unequal fork
lengths and inherited tangents. Fine shoots use a gentler 0.06-radian bias.
This is a local growth rule, not a post-build deformation or camera correction.
Retain the nine lateral bearings around the bole and three intermediate buds
per scaffold. The all-seed azimuth test allows an empty local sector below
210 degrees after uplift, replacing v5's 170-degree limit; it still rejects
collapsed branching while permitting lower offshoots to turn toward the sky.

Only terminal structural supports carry full terminal sprays. After the primary
sprays compete for space, try one shorter lateral spray at a separate interior
node of each support and each long secondary successor (orders 4–7, over 3.2 leaf
lengths). Exclude the bole and major scaffolds. Accept it only with sampled outer-half launch clearance at least
2.1 times the 0.85-leaf-length spacing margin. Its descendants and all leaves
retain the existing crowding checks. Record primary/supplemental counts and
minimum launch clearance; do not require a fixed leaf count. This is a local
occupancy proxy rather than exact intersection or physiological simulation.

The regression reproduces downward wood before the fix and checks ascending
centrelines, connected unique attachment nodes, sparse-region launches and
retained 3D crown breadth. Build new isolated references and compare them with
the preserved v6c collection through the existing mesh and 27-frame review gates.

The revised three-form collection is staged at
`tests/artifacts/screens/vegetation_enhanced_reference/20261014_oak_uplift_v7b_review/`.
Leaves total 28,352 / 28,261 / 27,855; fine shoot segments total
7,779 / 7,711 / 7,625. Supplemental sprays total 194 / 183 / 170, including
135 / 137 / 123 on exposed intermediate secondary branches. All three retain
the 0.80 leaf-volume spacing threshold, 0.187 m inter-spray sampled margin and
0.3927 m outer-half clearance required to launch a supplemental spray.
Their minimum structural elevation is 11.71–11.73 degrees and the saved
foliage's narrowest/widest horizontal breadth ratios are 0.911 / 0.910 / 0.933.

Build receipt (448.0 s):
`tests/artifacts/screens/ai556_bake_framework/run-1792036105277-25108-1bd317a3/summary.json`.
All 38 vegetation tests passed after the elevation change; the targeted spacing
regression passed again after the final selective secondary-shoot extension.
The v7 bare probe and first leafy trial remain preserved separately. No runtime
tree assets or installed materials are changed by this reference-only revision.

The 27-frame review at 1440 px and 16 CPU Cycles samples passed input-stability
validation (1098.6 s):
`tests/artifacts/screens/ai556_bake_framework/run-1792036599891-22712-146e35ef/summary.json`.
Saved meshes, matched comparison cameras, image/source hashes and installed
AI-material sets passed gallery validation (31.7 s):
`tests/artifacts/screens/ai556_bake_framework/run-1792037740039-20120-02fae6cb/summary.json`.
The review includes all three forms from four directions, primary full-tree,
trunk and leaf details, bare structure and the unchanged supplied examples.

## Northern red oak fork shoulders (v8)

Model the branch collar as a local positive change in the shared wood surface.
Use parent radius, child/parent radius ratio and the opening between their axes
to size an asymmetric shoulder descending along the parent and continuing under
the child. The field rotates with the growth graph, fades over a few parent
radii, and excludes axial continuations and fine twigs. Bound added radial growth
to 22%; never cut into the parent to create a crease. Fuse and smooth through the
existing wood pipeline rather than attaching a separate visible connector.

For this directional oak bark, retain branch-aligned UV/PBR shading at unions;
the previous fixed box projection turned lengthwise ridges across lateral limbs.
Blend adjacent parent/child surface charts only within three voxel widths
(minimum 4.5 cm) of their equidistant boundary. Use complementary smooth weights
so a change in the nearest chart does not introduce a new hard texture seam.
Keep each chart's coordinates separate; do not average unrelated UV coordinates.
Retain the existing junction mask for geometric displacement suppression. The
installed AI-generated maps and other species' material rules remain unchanged.
This is an artistic geometric approximation of collars/shoulders, not a wood
mechanics simulation. Botanical guidance: [UF/IFAS branch collar and bark ridge](https://blogs.ifas.ufl.edu/charlotteco/2022/10/27/callus-after-the-storm-time-to-seal/).

Preserve v7 growth, foliage and previous candidates. First inspect matched clay
and bark fork views with `structure` and `views=trunk`; then regenerate isolated
references and pass the existing saved-mesh and complete gallery gates. Pure
tests require local support, no radial shrinkage, rotation covariance and no
spurious knuckles on axial continuations or tiny shoots.

The v8 collection is staged at
`tests/artifacts/screens/vegetation_enhanced_reference/20261015_oak_shoulders_v8_final/`.
All three architecture JSON files match v7b byte-for-byte. An independent saved
Blender audit also confirms identical leaf instance data (including tint), all
eight leaf prototypes, and fine-wood positions/topology/UVs for each specimen.
Leaves remain 28,352 / 28,261 / 27,855. Major wood has
1,473,420 / 1,490,588 / 1,457,376 triangles; these are reference surfaces, not LODs.
The branch-chart blend is confined to a 6.6 cm surface-distance margin, with
180,540 / 182,567 / 180,765 affected faces. Finite chart coordinates, bounded
weights, crown dimensions, mesh bounds and fourteen bole sections pass.

The complete 42-test vegetation suite passes. Structure probes remain in
`20261015_oak_shoulders_v8_probe/` and `20261015_oak_shoulders_v8b_probe/`.
Build receipt (398.1 s):
`tests/artifacts/screens/ai556_bake_framework/run-1792039085832-28564-004070e8/summary.json`.
Saved-model/preservation audit receipt (21.8 s):
`tests/artifacts/screens/ai556_bake_framework/run-1792039589733-6976-1d3f8418/summary.json`.

The complete 27-frame review at 1440 px and 16 CPU Cycles samples passed input
stability and render identity checks (645.2 s, resumed using verified frames):
`tests/artifacts/screens/ai556_bake_framework/run-1792039880257-10956-26c94c81/summary.json`.
Gallery and repeated saved-model/preservation checks passed (34.1 s):
`tests/artifacts/screens/ai556_bake_framework/run-1792040608791-23292-fca0c0ee/summary.json`.
The `northern_red_oak_forks.html` sheet places previous, revised, neutral clay
and supplied photographic-study views in one row. The main page retains the
full-tree, leaf-detail and volume comparisons for all three forms.

## American elm arching reference revision

Preserve the original enhanced American elms. Generate a separate species-wide
vase architecture with staggered, unequal rising axes; progressively reduce their
elevation as they extend into the upper crown. Intermediate buds rotate around
each supporting limb, and recursive successors distribute branches in three
dimensions. Shared nodes, inherited tangents, descendant-demand radii, positive
fork shoulders and branch-aligned PBR chart blends replace straight attached arms.
The shared integrated root-crown generator continues the bole into its roots.

Species guidance: [Minnesota DNR](https://www.dnr.state.mn.us/trees/american-elm.html)
describes a vase crown, wide-spreading branches with drooping ends, and alternate
doubly toothed leaves. [UF/IFAS](https://ask.ifas.ufl.edu/publication/ST649) describes
a broad or upright vase, moderate crown density, upper dark green tissue and
lighter undersides. The artistic growth model keeps structural wood ascending
and limits downward freedom to fine distal shoots; it is not a physiological
simulation or a reconstruction of a specific photographed tree.

Reuse crowding-aware terminal sprays and short lateral infill. Do not place a
complete fan on both an ancestor and its descendants. Keep finite tip thickness,
alternate irregular arc-length leaf nodes and oriented leaf exclusion. The leaf
blades remain curved closed geometry with bounded rotation around a local spray
orientation and separate front/back AI PBR; no cards or quotas are introduced.
Elm petioles are shorter than the oak profile. Existing PBR source provenance
and other accepted references remain intact.

The staging-only review uses the existing enhanced-reference bake leaf. Inspect
all three mature forms from four directions, matched previous views, clay fork
structure, foliage detail and an isolated copy of the same saved branchlet.
Authenticate the supplied illustrative and photorealistic studies and all source
models. Numerical gates cover repeatable vase proportions, connected/tangent
branch origins, upward major growth, non-increasing radii and locally separated
shoots; saved-mesh gates verify bole continuity, bark chart weights and bounds.

The first two elm trials remain preserved at `20261015_elm_arching_v2_review`
and `20261015_elm_arching_v2b_review`. Visual review found their canopies too sparse.
The selected growth policy uses three staggered lateral bud stations per main
segment and four intermediate fork levels. Elm shoots extend 22% farther than
the shared default, and their narrower oval blades use a species exclusion
half-width of 0.34 leaf lengths. Internode candidates remain variable and
subject to the same oriented-volume rejection, with no fixed leaf quota.

### Validated elm review, 2026-10-15

The separate `20261015_elm_arching_v2c_final` collection contains three packed
`enhanced-elm-arching-growth-v2` models. Their leaf counts are 106,320 / 109,238 /
104,480, with 1,387 / 1,422 / 1,338 accepted sprays. The preserved enhanced models
had 303,124 / 304,800 / 306,334 leaves. Leaf count is an outcome of placement,
not a target or a performance measurement. Projected overlap remains possible.

The geometry tests cover twelve seed/form combinations, shared attachments,
tangent continuity, major-limb elevation, demand conservation, circumferential
coverage and finite spaced shoots. The vegetation suite passed 44 tests during
integration; the two elm tests passed again after the final density tuning.
All three saved-mesh audits passed with zero detected edge outliers, intact
local bark blending and minimum bole radius ratios of 0.969 / 0.975 / 0.970.
Measured crown width aspects are 0.911 / 0.934 / 0.893.

Registered bake receipts under `tests/artifacts/screens/ai556_bake_framework/`:

- Build: `run-1792086055366-2780-8ba77b56/summary.json` (1043.5 s).
- Complete 28-view render: `run-1792087158942-4016-eccd2f84/summary.json` (722.1 s).
- Isolated shoot framing: `run-1792088021832-23272-96960245/summary.json` (36.5 s).
- Matching in-tree detail: `run-1792088080939-12704-26192b8f/summary.json` (58.8 s).
- Gallery and saved-model audit: `run-1792088183549-28208-e1b27368/summary.json` (30.6 s).

Renders use CPU Cycles, 1440 square pixels and 16 samples. The close-up camera
fits projected geometry bounds and views the average upper leaf face; it does
not change the generated model. The gallery validates identical inside/outside
branchlet cameras, all 28 render identities, both supplied study copies, the
installed AI PBR provenance and preserved original/enhanced source hashes.
All outputs remain in ignored review staging; runtime LOD assets are unchanged.

## American elm spreading revision (v3)

Preserve the v2c elms and grow the next revision from the same seeds. Main limbs
must transition earlier from rising wood near the bole to outward arches. The
elm profile defines segment lengths, declining elevation and a gradual lift for
higher axes. The end hierarchy inherits the final arch direction instead of
resetting to an upward vector. Successors still inherit parent tangents, receive
descendant-demand radii and distribute around the supporting axis in 3D.
Minor curvature can dip locally as an arch levels out; no substantial branch
has a descending endpoint. Regression checks require every major outer segment
below 23 degrees elevation and a support width/height ratio above 1.05, across
twelve seed/form combinations. The previous v2 geometry failed the new outer
angle test, establishing the regression.

Audit both supplied photorealistic specimens for every species against the
sidecar's scientific name, asset ID, relative image path and image checksum.
Reject image reuse across these ten records. The earlier elm page already used
`american_elm_01.png` (SHA-256 `fa653be0bd49c102e7bb9fcb7038ee32edfc09909070093fa57338f3f0a90339`),
which is distinct from the oak, linden, plane and viburnum studies. Make the
species, botanical name and source filename visible in each photographic
caption, and include both verified specimens beside the illustrative example.
Copy each selected original unchanged into the new ignored review directory.

Final profile segments use length fractions `[0.23, 0.19, 0.12]`, elevations
`[1.10, 0.70, 0.16]` radians and upper-axis lifts `[0.12, 0.18, 0.18]`.
The upper-axis lift varies with the staggered launch order; bounded seed jitter
retains different forms. A first trial spread too far into horizontal wings,
so its longer outer growth was shortened before the three-form build. That
trial remains in `20261015_elm_spreading_v3_final`; the accepted candidate
collection is staged separately in `20261015_elm_spreading_v3b_final` under
`tests/artifacts/screens/vegetation_enhanced_reference/`.

The v3b forms contain 98,034 / 101,519 / 97,803 leaves on 1,242 / 1,309 /
1,217 accepted sprays. Crown width/height measures are 1.122 / 1.210 / 1.163,
with circumferential width aspects 0.918 / 0.938 / 0.896. Leaf exclusion proxy
clearance remains at least 0.80. The two elm regressions cover spaced shoots
and twelve seed/form architectures; the final angle threshold also allows the
bounded seed jitter while rejecting the earlier upward terminal reset.

The authenticated source audit found no wrong-species reuse in the prior elm,
oak or linden galleries: their HTTP-served photographic image bytes matched
their distinct species source files. The new gallery makes this explicit and
adds the second elm specimen rather than substituting an unrelated image.

Validated registered bake receipts under
`tests/artifacts/screens/ai556_bake_framework/`:

- Three-form build: `run-1792094984615-4572-efa8efe8/summary.json` (861.2 s).
- Complete 28-view render: `run-1792095874679-26172-c258f97b/summary.json` (701.3 s).
- Saved-mesh audit and ten-sheet gallery: `run-1792096620776-28748-a90d1833/summary.json` (45.1 s).

The review uses 1440-square CPU Cycles renders at 16 samples. The gallery
authenticates all three saved meshes, every render and both elm study copies;
`study-species-audit.json` records all ten source study identities. Full-tree,
side, fork-clay and isolated-shoot outputs were visually inspected. Original
and v2c model hashes remain preserved; no runtime assets were published.

## American elm connected rounded crown (v4)

The supplied lawn photograph calls for a substantial, irregularly rounded
crown with joined foliage masses and descending fine tips. The v3b recursive
heading bias still produced an inverted vase with long independent plumes.
Preserve v3b and replace that growth policy, rather than flattening the mesh.

The elm generator samples 4,500 stratified buds across a softly lobed crown
volume, including its upper centre and lower sides. Five staggered rising bases
carry branches grown toward recursively partitioned 3D target neighbourhoods.
Forks inherit their parent tangent; downstream demand determines continuous
radius transitions. Shorter fine shoots have a bounded upward angle and
progressively drooping tips. The shared oak policy is unchanged.

This artistic branching approximation is informed by the attraction-point
approach in [Runions et al., 2007](https://www.algorithmicbotany.org/papers/colonization.egwnp2007.html),
but uses hierarchical spatial partitioning rather than claiming to implement
the full space-colonization algorithm. The [University of Kentucky elm account](https://ufi.mgcafe.uky.edu/treetalk/ecobot-american-elm)
describes outward arches and downward-sweeping ends. The supplied photograph
is the visual target; a perfect spherical shell is not a requirement.

The registered `crown-study` option authenticates the original supplied image
and includes an unchanged copy beside the preserved and revised models.
Tests check twelve seed/form combinations for connected forks, circumferential
spread, broad lower crown, a narrower rounded top and occupied upper centre.
Other species and runtime LODs remain unchanged.

The rounded-crown trials remain preserved in `20261015_elm_rounded_v4_review`
and `20261015_elm_rounded_v4b_final`. The final candidate is built separately in
`20261015_elm_rounded_v4c_final`. Its elm profile uses crown radius 1.38 times
the species radius, vertical half-depth 0.32 times height, centre height 0.58,
and scaffold elbow heights 0.36–0.42. Low-frequency azimuthal lobes vary the
crown outline, while targets occupy its interior as well as the outer volume.
Fine-shoot length scale 1.05 and nominal blade scale 0.17 improve coverage;
twig competition and oriented leaf exclusion retain their clearance gates.

The elm regressions pass for twelve seed/form architectures and a full foliage
spacing case. The shared oak regression suite also passes (five tests), and the
two source-study tests reject mismatched species and image identities.

The three saved v4c forms have 122,527 / 123,557 / 123,360 leaves on 3,495 /
3,526 / 3,518 accepted sprays. Structural crown width aspects are 0.904 / 0.886 /
0.921; oriented leaf clearance is at least 0.80 for every accepted leaf.
Registered build receipts are `run-1792105936361-3672-26585dd2/summary.json`
(first form, 427.9 s) and `run-1792106485190-23960-b8e21ad4/summary.json`
(remaining forms, 871.5 s), under `tests/artifacts/screens/ai556_bake_framework/`.

The complete 28-view CPU Cycles render is recorded by
`run-1792107372054-14448-0c921b50/summary.json` (879.5 s); saved-mesh validation
and the eleven-sheet gallery passed in `run-1792108258732-26032-d42deb08/summary.json`
(40.5 s). All three full-tree views, a side view, bare wood, the in-tree leaf
close-up, isolated branchlet and final crown-photo comparison were inspected.
The gallery starts its new comparison at `index.html#american_elm_crown_photo`.
The original photograph is copied unchanged and hash-checked; the preserved v3b
models and runtime assets are not replaced.

## American elm branch-owned clusters (v5)

The v4 continuous bud volume made a single rounded mass. Preserve that collection
and grow distinct foliage regions owned by the five main axes. Each axis supports
unequal lower-side, middle and upper regions at staggered attachment nodes. Their
union forms the rounded crown, with gaps and recessed boundaries between lateral
masses. Recursive forks progress outward toward their own region's buds.

Elm fine growth uses `elm_shoots.py`: one continuing shoot, three staggered side
shoots and at most two short secondary shoots. A coherent fan normal retains
small three-dimensional bends. The collision search includes siblings within a
spray; only the immediate supporting twig is exempt at the shared connection.
Leaf placement retains alternate nodes, bounded blade rotations and oriented
exclusion volumes. Do not maintain the previous leaf count by stacking sprays.
The isolated detail shows the complete fan, with the identical camera used for
its in-tree view. Twelve seeded crown cases and a full branchlet case check
cluster ownership, unique attachment nodes, outward progress, finite tips,
within-spray spacing and bounded fan complexity.

Geometry review rendering supports the registered `engine=eevee` option, with
ray tracing disabled for faster iteration. Engine identity is included in render
receipts and cache matching; gallery validation requires all frames to use the
selected engine. Eevee previews are for geometry review, not performance results.

### Clustered elm geometry review, 2026-10-15

Validated output: `tests/artifacts/screens/vegetation_enhanced_reference/20261015_elm_clusters_v5b_review`.
All three saved forms pass mesh audit; 28 frames use Eevee at 1440 square and
16 samples. Eleven comparison sheets include the unchanged supplied crown photo,
species-verified illustrative/photographic studies, orthogonal views, hidden-leaf
wood views, and the same actual branchlet inside/outside the crown.

| Form | Leaves | Accepted sprays | Fine shoot segments |
| --- | ---: | ---: | ---: |
| mature_01 | 73,479 | 1,829 | 9,457 |
| mature_02 | 76,248 | 1,875 | 9,757 |
| mature_03 | 73,907 | 1,832 | 9,485 |

The first candidate's separated tiers were rejected visually. The retained
version overlaps unequal lower/middle/upper regions and directs sprays using
both their supporting twig and local cluster position, rather than one global
outward direction. Fine fans retain at most six paths, each attached at a separate
node. Minimum sampled neighbour clearance is at least 0.1904 m; leaf proxy
clearance is at least 0.80. These are spacing proxies, not exact nonintersection
proofs. The new collection and earlier candidates remain staged; previous
references, runtime assets and installed PBR materials are preserved.

Checks: twelve seed/form growth combinations, fine-fan spacing/attachment/leaf
checks, five oak regression tests, renderer cache isolation, and species-study
identity checks pass. Geometry review is not a runtime performance benchmark.

Bake receipts under `tests/artifacts/screens/ai556_bake_framework/`:
- First final form: `run-1792112046536-2552-a345e13a/summary.json`.
- Remaining forms: `run-1792112575208-29908-783dbcd6/summary.json`.
- First form Eevee views: `run-1792112409360-28828-d7f7fded/summary.json`.
- Other Eevee views: `run-1792113263352-25768-c2602457/summary.json`.
- Saved geometry audit and gallery: `run-1792113379475-30484-51e39783/summary.json`.
- Caption-corrected gallery: `run-1792113536974-28492-9105822e/summary.json`.
