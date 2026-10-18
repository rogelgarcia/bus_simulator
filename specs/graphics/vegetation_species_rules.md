# Vegetation species presets and proposed procedural rules

## Status and scope

The ramification follow-up implements page revision 10 / graph version 9 /
preset revision 5. Prompt 649 previously established page 9 / graph 8 / preset 4. The earlier assessments below are retained as historical
research; the implementation section at the end supersedes their gap/status lists.

The 2D branching study implements five **numeric context presets**. The species
function/plugin design below is **documentation only**. There is no script
registry, plugin loader, function evaluator, or script-controlled UI in this
revision. Shared core functions evaluate numeric profiles; there is no arbitrary
species function provider. It does not rebuild the enhanced 3D models or foliage.

Species data and source links live in
`tools/bake_vegetation/branching_study/species.mjs`; the shared numeric schema and
resolved presets live in `parameters.mjs`. They cover London plane, silver linden,
northern red oak, American elm and arrowwood viburnum, matching the enhanced
reference collection. The latter is a shrub, not a single-trunk tree.

Study UI help is hidden by default. Hovering or focusing a control label or
section title opens its explanation; tapping also works. Species titles expose
the source links and limitations. Popups remain open while being read and close
on Escape, an outside click, or their close button. Values and operational
status remain visible; explanatory paragraphs and research tables do not.

## Evidence versus modeling estimates

Target open-grown landscape specimens, not a forest-grown bole, pollarded crown,
or a named cultivar unless explicitly selected. Age, site and management can
substantially change architecture within one species.

| Species | Evidence that guides the starting point | Numeric mapping and remaining limitation |
| --- | --- | --- |
| London plane, *Platanus × acerifolia* | Mature habit opens and spreads; young crowns are more pyramidal. Alternate nodes. [NC State](https://plants.ces.ncsu.edu/plants/platanus-x-acerifolia/) | Broad primary forks and substantial lateral reach. An age transition and node-scale shoot zigzag are future rules. |
| Silver linden, *Tilia tomentosa* | Broad pyramidal, dense crown; erect branches. Single-leader training is recommended, and older limbs may droop. [NC State](https://plants.ces.ncsu.edu/plants/tilia-tomentosa/), [UF/IFAS](https://hort.ifas.ufl.edu/trees/TILTOMA.pdf) | Continuing leader, shorter laterals and restrained bends. A crown-height function would be more expressive than the constant lateral-length ratio. |
| Northern red oak, *Quercus rubra* | Broad rounded crown and relatively low branching in open conditions; alternate nodes. [NC State](https://plants.ces.ncsu.edu/plants/quercus-rubra/) | Wider forks, modest curvature and a substantial scaffold. Do not substitute pin oak's distinctive descending lower branches. |
| American elm, *Ulmus americana* | Several ascending limbs form a wide arch in open-grown trees; forks often originate around 3–6 m. [US Forest Service](https://research.fs.usda.gov/feis/species-reviews/ulmame) | Primary forks and spaced side shoots, with outward bending. Global curvature cannot yet distinguish young shoots from older, loaded limbs. |
| Arrowwood, *Viburnum dentatum* | Multiple stems, opposite nodes, suckering, and more arching older growth. [NC State](https://plants.ces.ncsu.edu/plants/viburnum-dentatum/), [Morton Arboretum](https://mortonarb.org/plant-and-protect/trees-and-plants/southern-arrowwood/) | Small scale, low fork and paired candidate nodes. This shared-base proxy does not implement separate basal canes or suckering. |

All numerical counts, angles, length ratios, taper losses, bend strengths and
survival probabilities are **our editable modeling estimates**. Sources do not
measure these procedural coefficients. Reported adult dimensions are context,
not acceptance bounds or a promise that the current drawings attain those sizes.
Leaf arrangement suggests candidate nodes; it does not mean every bud produces
a branch, nor that alternate leaves imply all limbs alternate in one plane.
Bark and leaf traits are recorded for later work, not implemented by this study.

The page shows the matching supplied AI species study when an authenticated
collection is provided. Those images are visual guides, separate from botanical
evidence. The original bare elm example remains preserved. Never reuse it as an
unlabeled reference for another species.

## Future provider contract — not implemented

A feature has exactly one provider selected by its preset:

- **Constant:** editable numeric value.
- **Range:** editable bounds with the core's deterministic sampling rule.
- **Species function:** a versioned function supplied exclusively by the preset.

Do not expose an editable number that is silently ignored by a function. The
numeric value and function are alternatives, not two competing sources. Manual
edits to other numeric features can produce a customized preset while retaining
its function providers and provenance.

A declarative record could identify a function as follows (illustrative only):

```json
{
  "feature": "child.length",
  "provider": "species-function",
  "functionId": "silver_linden.lateral_length",
  "functionVersion": 1,
  "explanation": "Shorter laterals higher in the crown; preserve the leader."
}
```

Use named, repository-owned modules per species and algorithm stage. Shared
functions can serve multiple species. A preset composes providers; the generator
must not become a chain of species-name conditionals. This is our proposed
interface, not a claim about SpeedTree's plugin API.

### Context and stage boundaries

Keep the coordinate meanings explicit:

- `hierarchyDepth`: generation depth, distinct from `branchOrder` (which increases
  on a lateral, not a continuation).
- `axisRole`: trunk, basal cane, continuation, scaffold, lateral or terminal shoot.
- `attachmentT`: position along the parent axis, normalized by arc length.
- `axisT`: position along the current axis, also normalized by arc length.
- Parent length, local attachment radius, tangent/frame and ancestry key.
- Normalized crown position, including height; physical lengths in metres.
- Species/preset version, tree seed and a stage/ancestry-scoped random interface.
- Age, season, light exposure and load only when an actual model supplies them.
  Mark unavailable context explicitly; do not invent a proxy and call it biology.

| Proposed stage | Inputs and output | Species-specific purpose |
| --- | --- | --- |
| `initialAxes` | Ground/root context → initial connected axes | Single bole versus multiple basal canes; later suckering. |
| `budSites` | Parent geometry, role, order, age → attachment sites and roles | Internode spacing, paired/alternate candidates, eligible zones and fork events. Count can be derived from available length. |
| `budFate` | Candidate site and available environmental context → grow/dormant/rejected, reason | Separate available buds from actual developing branches. |
| `childDimensions` | Parent dimensions, `attachmentT`, crown position → length and base radius | Crown-height length curves, leader dominance and slenderness limits. |
| `axisDirection` | Parent frame and child role → initial direction | Ascending scaffolds, lateral opening and leader continuation. |
| `curvature` | Axis context and `axisT` → curvature or a bounded direction profile | Age/order-dependent arches, directional growth and eventual sag modeling. Choose one documented representation per API version. |
| `radiusProfile` | Axis dimensions and `axisT` → radius | Taper variation and later demand/pipe-based sizing. |
| Future leaf stages | Supported shoot nodes/frame → petiole and blade placements | Species leaf spacing, orientation and blade bending, with explicit woody support. |

Evaluation order must be declared and acyclic. Dimensions and initial direction
precede curve construction; a child samples its finished parent's real frame.
Functions cannot edit unrelated axes or read partially constructed neighbors
unless a separate, deterministic population pass explicitly provides them.
Demand-based sizing may require a declared bottom-up pass rather than circular
calls between child length and parent radius.

### UI ownership

For a function-controlled feature:

1. Keep the feature label visible and disable its numeric/range editor.
2. Display **“Controlled by script for American elm”**, substituting the selected
   species, next to that feature. Give a short explanation of the rule.
3. Optionally show a read-only sampled curve or resolved value for the selected
   branch. Identify the context being sampled; it is not a single universal value.
4. Offer no UI code editor, function selector or numeric override for that feature.
   Switching to another preset changes ownership. A preset with a numeric
   provider re-enables the control.
5. Preserve keyboard accessibility and an accessible description explaining why
   the editor is disabled. Do not depend on a tooltip alone.

Missing provider code/version is an explicit error, not a fallback to the stale
slider value. Inactive numeric values must not affect generation or be exported
as active overrides. These disabled states are planned, not simulated in v5.

### Determinism, exports and validation

Functions must be pure and deterministic from declared context, with no DOM,
network, filesystem, clock, unseeded randomness or mutable shared state. Scope
random streams by tree seed, ancestry, stage and candidate identity so suppressing
one bud does not reshuffle unrelated wood. Use trusted modules; never evaluate
JavaScript supplied in an exported configuration.

Future exports must retain species ID, preset version, function IDs/versions,
core algorithm version, seed, active numeric overrides, resolved graph and audit
data. Imports resolve the exact providers or stop with a version error. Changing
a function implementation requires a version change; previous exports must not
quietly acquire a different tree.

The core owns invariants after function evaluation: finite values, valid local
frames, attachment continuity, sensible parent/child dimensions, positive radii,
declared curvature bounds, stage budgets and deterministic rejection reasons.
Functions cannot bypass these. Preserve the optional crossing rule, **off by
default**; a projected crossing does not prove a 3D collision.

Before enabling providers, verify each stage independently, composition order,
repeatability, import/export versions, UI ownership and multi-seed geometry.
Then compare species-specific examples from several views. Do not equate a
branch-count, occupancy or screenshot check with botanical fidelity.

## SpeedTree documentation review

The user requested a separate agent for this research. It consulted official
SpeedTree documentation (some direct pages return 403; indexed official text was
available). Useful concepts, to reuse as design ideas rather than source code:

- [Parent and profile curves](https://docs8.speedtree.com/modeler/doku.php?id=curves_overview)
  separate dependence on parent attachment position from variation along an axis.
  This motivates the distinct `attachmentT` and `axisT` inputs above.
- [Interval generation](https://docs8.speedtree.com/modeler/doku.php?id=genmode_interval)
  separates spacing, groups and count, supporting child counts derived from
  usable parent length instead of only hand-entered level counts.
- [Bifurcation generation](https://docs9.speedtree.com/modeler/doku.php?id=genmode_bifurcation)
  can select sites using bends and locality constraints. This is an artistic
  procedural strategy, not a rule that every natural bend sprouts a branch.
- [Generation properties](https://docs9.speedtree.com/modeler/doku.php?id=generation_properties)
  separate child placement, continuation and pruning/knockout behavior.
- [Branch generator](https://docs8.speedtree.com/modeler/doku.php?id=branch_generator)
  describes relative dimensions, radius constraints, slenderness pruning and
  separate shape/variation controls. A future length-to-radius limit directly
  addresses the long hairlike branches seen in earlier studies.
- [Hand drawing](https://docs8.speedtree.com/modeler/doku.php?id=kchanddrawing)
  distinguishes fitting/resampling from secondary variation. Keep accepted
  attachments and topology stable while adding bounded shape detail.

SpeedTree's documentation provides procedural design patterns, not calibrated
parameter sets for our five species. Botanical sources and visual review remain
necessary for the presets.

## Five-species reference assessment — 2026-10-16

This assessment compares the supplied leafless/root studies with the current
2D implementation, including the new roots in the v8 review page (graph format
7). It records research and proposed work only; it does not implement providers
or change presets. The user-supplied files are:

- `Leafless Silver Linden with Exposed Roots-2.png`
- `Leafless Northern Red Oak with Exposed Roots-5.png`
- `Arrowwood Viburnum Root Structure-4.png`
- `Mature American Elm Root Study-3.png`
- `Leafless London Plane Root Study-1.png`

The images guide appearance. Their exposed roots show a perspective view of the
root collar and surface roots, not an underground soil section. They cannot
establish rooting depth, a taproot, or universal species architecture. The 2D
root study currently depicts a soil section, so its silhouette should not be
scored against those perspectives as if they represented the same view.

### Configuration versus missing capability

The problem is both configuration and representation. Increasing global bend or
randomness alone would restore the unwanted hairlike growth. Retain the graph,
deterministic random streams, attachment frames, bounded centerline primitives,
taper, inspection and exports. Extend rule selection and plant initialization.

| Species | Existing controls can approximate | Missing capability for the supplied target |
| --- | --- | --- |
| Silver linden | Continuing leader, narrow upper growth, restrained curvature, trunk proportions. | Lateral length and direction varying with crown height; separate rules for spreading lower scaffolds and ascending upper shoots. A single lateral ratio applies too uniformly. |
| Northern red oak | Broad spread, substantial radii, asymmetry from seeded length/angle variation. | Unequal scaffold forks, local direction changes associated with branching, and distinct short terminal growth. Global curvature cannot selectively shape substantial limbs while keeping twigs restrained. |
| American elm | Low primary division, ascending starts and outward bends. | Independent rules for ascending scaffolds, outward arches and short distal shoots. The drawing needs a hierarchy of those behaviors rather than the same bend profile at every level. |
| London plane | Broad forks, leaning/bending trunk, varied angles and lengths. | Major forks distributed along a continuing axis and node-local changes of direction; scale-dependent branch rules. Multiple continuations should not all be treated as progressively smaller copies of one branch. |
| Arrowwood viburnum | Small overall scale, low clearance, paired candidate nodes, limited bends. | Separate basal canes at distributed origins on a shared root crown, different cane sizes and lean, and selective arching of older outer growth. A low fork on one trunk is structurally different. |

These are mappings from the visual targets to generator features, not measured
species coefficients. The botanical distinctions remain supported by the sources
in the species table above. In particular, [Morton Arboretum's arrowwood account](https://mortonarb.org/plant-and-protect/trees-and-plants/southern-arrowwood/)
describes multiple stems, suckering and shallow fibrous roots; [NC State](https://plants.ces.ncsu.edu/plants/viburnum-dentatum/)
describes older branches becoming more arching. That supports a cane-based
architecture, not simply stronger curvature throughout a miniature tree.

### Verified implementation limitations

Inspection of `model.mjs`, `geometry.mjs`, `parameters.mjs` and `roots.mjs` found:

- Initialization creates exactly one trunk at `[0, 0]`. Roots are generated from
  `paths[0]`; the collar and main roots assume one trunk host. A species function
  cannot provide a correct multistem shrub until the core accepts that structure.
- Fork mode puts all daughters at the parent's endpoint. Side-shoot mode already
  supports staggered alternate or paired attachments and an apical continuation;
  those capabilities should be reused rather than recreated.
- Nontrunk axes share curvature controls. The existing primitive can make a
  gradual arch, localized turn and partial recovery. The immediate gap is choosing
  profiles by role/order/position; additional oscillation is not the priority.
- Branch order is already recorded separately from recursion depth, but bend,
  length ratios, taper and bud survival do not use it to select growth rules.
  Recursion depth still limits both continuations and lateral subdivisions.
- Child counts are fixed or sampled from a shared range, independent of usable
  parent length. There are no explicit internode lengths or shoot-length classes.
- Child radius inherits local parent radius with shared losses. Main fork
  daughters receive the same radius rule, with no asymmetric allocation or
  supported-growth sizing pass. Minimum length and diameter exist, but there is
  no length-to-radius limit.
- All roles share a fixed initial-heading rejection range. It can suppress
  downward starts; it does not prevent an accepted curved axis from dipping.
  Direction eligibility should eventually depend on role and crown position.
- Root reach and depth presets are shared estimates scaled from initial trunk
  length. They are not species-calibrated root systems. Root controls already
  cover reach, depth, branching, taper, bend, sinkers, taproot and collar flare.
- The drawing uses tapered outlines and covers at joins. Attached centerlines
  are not equivalent to a continuous 3D branch union or a lobed buttress surface.

### Research implications and implementation order

SpeedTree separates components into a [generator hierarchy](https://docs9.speedtree.com/modeler/doku.php?id=kcmodelingapproach).
Its parent curves and profile curves address two different questions: where an
axis originates and how a property varies along that axis. This fits the proposed
role/context providers better than adding more global sliders. Its branch
generator also distinguishes shaping from later noise, and supports
length-to-radius rejection; these are useful controls for bounded organic
variation and for avoiding long, implausibly thin shoots. Those are procedural
modeling tools, not proof of a mechanical growth simulation.

[Pałubicki et al., 2009](https://algorithmicbotany.org/papers/selforg.sig2009.small.pdf)
model local branching together with bud fate and competition for light and space.
Their approach explains why repeating geometric ratios alone is insufficient:
not every potential bud develops into a scaled copy of its parent. Reuse this
architectural distinction; a full resource/light simulation is not required for
the next 2D study.

Recommended sequence, still unimplemented:

1. **Plant base and axis roles.** Support one bole or multiple basal canes with a
   common root crown. Give canes independent seeded dimensions and starts. Retain
   explicit common ownership instead of overlapping several unrelated trees.
2. **Context-dependent profiles.** Select length, direction, curvature and taper
   by role, order and attachment/crown position. Keep numeric providers where
   adequate; future species presets can supply functions at the existing planned
   stages. Apply script ownership UI rules only when providers are implemented.
3. **Nodes and unequal forks.** Derive candidate spacing from available length,
   distinguish continuation from lateral growth, allocate unequal daughter
   dimensions, and constrain slenderness. Couple meaningful direction changes
   with branching events without requiring every bend to produce a branch.
4. **Species and seed review.** First check elm's ascending-to-spreading scaffold
   and arrowwood's basal canes. Then tune the other three presets. Compare whole
   plants and isolated axes; retain crossing suppression off by default.
5. **Later growth and surfaces.** Add age/renewal, leader replacement and actual
   environment responses only with explicit context. Radial 3D roots, terrain
   exposure, collars and buttress/junction surfaces belong to the later 3D pass.

Root depth also needs site context: the [US Forest Service elm silvics account](https://research.fs.usda.gov/silvics/american-elm)
reports shallow spreading roots in heavy wet soils and potentially deeper rooting
on dry sands. A single exposed-root image cannot choose that setting. Arrowwood's
shared base is a genuine structural requirement; changing root depth or bend alone
cannot supply it.

### Additional photorealistic references — 2026-10-16

The user supplied a second, outdoor-looking set. Preserve these as the newer
visual targets alongside the earlier studies. Unmodified, hash-verified copies
and source paths are recorded under
`tests/artifacts/screens/vegetation_branching_study/20261016_photorealistic_references/references/manifest.json`.
This is a reference archive, not a replacement bake or a generator change.
Species mapping follows each image's label; photographic origin has not been
independently established. The blurred side panels duplicate the center view
and must not count as additional geometry or evidence.

| Species | Supplied file | Observation and resulting visual target |
| --- | --- | --- |
| London plane | `image_4f6cbaaf.jpg` | Substantial trunk with unequal branch attachments at multiple heights; rounded transitions into broad basal root ridges. Use for trunk, forks and ground contact; the full crown is outside the frame. |
| Silver linden | `image_a07e8d09.jpg` | A relatively slender clear bole, continuing central structure and an elongated crown. Lower branches spread before turning upward; upper branches are shorter and steeper. Use the complete center silhouette to assess height-dependent branch rules. |
| Northern red oak | `image_a7aac71a.jpg` | Long, substantial scaffold sections with restrained curvature and unequal side branches. Forks are distributed vertically. Use for structural proportions and connections; the cropped crown cannot establish its complete outline. |
| American elm | `image_e72a53a3.jpg` | Major limbs rise and open gradually, with strong curved transitions near their origins and less curvature over much of the subsequent span. Use for scaffold shape and junctions; do not infer the unseen crown boundary. |
| Arrowwood viburnum | `image_80521aa6.jpg` | Numerous canes have distinct basal origins, lengths and lean. Upright inner canes and spreading outer canes create the silhouette together. Preserve those individual axes and a common root crown rather than replacing them with a low central fork. |

Across this set, exposed roots broaden into the trunk base, taper outward and
become partly obscured by ground cover. Model visible root exposure separately
from the complete underground root graph; uniformly exposing all fine roots
would reproduce the earlier isolated display rather than this grounded target.
The apparent canopy detail also includes background trees and projected
crossings. Do not translate every visible line into a branch of the foreground
specimen or re-enable planar crossing suppression.

These observations strengthen the priorities above: basal-cane support,
role-dependent broad curvature, distributed unequal forks and terrain-aware
root exposure. They do not justify a global increase in bending or randomness.


## Prompt 649 implementation and visual review — 2026-10-17

The implemented study is page revision 9, graph version 8, preset revision 4,
`shared-v2-context-1`. It extends accepted page v8 / graph v7; the historical
"still unimplemented" assessment above describes the state before this pass.
The proposed function-provider contract remains a future extension. Ordinary
numeric presets now drive a shared core without a plugin loader or script editor.

[Interactive study](http://127.0.0.1:4192/tests/artifacts/screens/vegetation_branching_study/649_v2_species_reference_review/final_v3/index.html)
and [five-species reference comparison](http://127.0.0.1:4192/tests/artifacts/screens/vegetation_branching_study/649_v2_species_reference_review/final_v3/comparison.html)
are the review entry points. Evidence is gitignored under
`tests/artifacts/screens/vegetation_branching_study/649_v2_species_reference_review/`.
`final_v3/manifest.json` authenticates the inputs, output files, browser and 15
seed audits. The previous `final/` and `iterations/` remain intact. The final review corrects slider quantization and narrow-screen reference sizing found
by visual inspection, and selects lateral junction close-ups with their attached continuation and siblings.

### Reference use and evidence boundaries

All ten supplied images were inspected. The newer JPEGs guide bole dimensions,
unequal attachments, collar transitions and ground contact; the linden and shrub
also supply complete outlines. The earlier complete PNG studies guide the crown
of plane, oak and elm. Cropped tops, blurred duplicate panels and background
branches were not treated as target geometry. Both collections appear beside
each generated plant and link to unmodified, full-resolution files. Original
paths and SHA-256 hashes are retained; copies match the supplied sources.
The bare elm image from v8 is preserved as an authenticated fallback input.

The source recheck used official [SpeedTree parent/profile curves](https://docs8.speedtree.com/modeler/doku.php?id=curves_overview),
[interval generation](https://docs8.speedtree.com/modeler/doku.php?id=genmode_interval)
and [branch generator documentation](https://docs8.speedtree.com/modeler/doku.php?id=branch_generator).
The site denied direct retrieval during this pass; indexed official excerpts
supported the limited procedural ideas used here: attachment-dependent profiles,
length-based intervals, relative radii, length/radius limits and flare controls.
No SpeedTree species coefficients or physical simulation are claimed.

Botanical habit was rechecked against NC State's
[plane](https://plants.ces.ncsu.edu/plants/platanus-x-acerifolia/),
[linden](https://plants.ces.ncsu.edu/plants/tilia-tomentosa/),
[red oak](https://plants.ces.ncsu.edu/plants/quercus-rubra/) and
[arrowwood](https://plants.ces.ncsu.edu/plants/viburnum-dentatum/) accounts,
[Morton Arboretum's arrowwood account](https://mortonarb.org/plant-and-protect/trees-and-plants/southern-arrowwood/)
and [US Forest Service elm silvics](https://research.fs.usda.gov/silvics/american-elm).
These support broad habit and multi-stem/root-system distinctions. The supplied
images are visual targets, not measured specimens. Every length multiplier,
angle, probability, root depth/reach and support ratio remains an artistic
estimate. Soil-dependent elm roots are not inferred from an exposed-root image.
The research discussion above distinguishes bud development and width support
from geometric recursion; no resource, light, tropism or biomechanical solver
has been added.

### Configuration versus necessary shared changes

| Required behavior | Core capability added | Preset interpretation |
| --- | --- | --- |
| Separate basal canes | Seeded initial axes, independent ground anchors, common base ownership, per-cane collars and root-crown connector | Arrowwood uses eleven varied canes, with outer lean and upright inner origins |
| Height and role variation | Shared dimension/angle/bend profiles by role, order, parent attachment and crown height | Linden shortens and steepens upper laterals; terminals shorten in all five species |
| Irregular but restrained limbs | Reused accepted localized/gradual curves, independent trunk shaping, role-specific bend strength and bounded outward arches | Elm opens ascending scaffolds into broad arches; oak uses localized turns; plane retains distributed scaffolds |
| Unequal branching without repeating one fork | Separate continuation/lateral/fork events, distributed primary fork sites, unequal daughter allocation and a tip-fork probability | Mixed oak/elm hierarchies; continuing plane/linden boles; paired shrub candidates |
| Spacing and thickness | Available-length node intervals, individual length/radius clamp, same-tip area allocation and bottom-up downstream support | Shared limits with a more slender shrub estimate; no preset reaches the shoot/root cap |
| Continuous attachments | Real parent frames and a proximal tangent blend, local radii and propagated support | Every child begins on its parent and changes heading gradually; 2D outlines do not prove a continuous 3D union |
| Honest root visibility | Explicit base/shoot host records, collars at actual anchors, independently seeded root graph and display-only exposure mask | Separate species root estimates; full soil section or masked surface elevation of the same graph |

`growth_v2/support.py` supplied the useful downstream-reach sizing principle.
Its distance accounting was adapted to the current continuous `parentT` graph in
`branching_study/support.mjs`, not copied as incremental growth. Accepted 2D
ancestry-keyed randomness, whole-axis curves, taper, frames, bud survival,
inspection, controls and exports remain. The older 3D bark adapter, saved-mesh
audits, attached petiole/leaf work, topology/UV preservation and EEVEE review are
retained for a later 3D stage. No approved 3D asset was regenerated or published.

### Visual findings across seeds 1, 31 and 92

All five comparison sheets were inspected at their saved resolution, including
complete plants, isolated branch hierarchies, junctions, root sections and all
three seeds. The seed variation is generated by shared rules; no branch was
hand-positioned to fit a camera or seed.

| Species | Result in this pass | Remaining visual mismatch |
| --- | --- | --- |
| London plane | Substantial continuing bole, major branches at different heights and broad unequal spread | Planar overlaps and regular recursive detail remain; the reference has a richer irregular crown |
| Silver linden | Persistent central structure, clear bole, spreading lower branches and shorter, steeper upper branches | More open and less evenly filled than the supplied crown; some upright distal extensions remain long |
| Northern red oak | Thick unequal scaffolds and shorter terminal divisions with local direction changes | Still narrower and more centrally dominated than the complete open-grown reference |
| American elm | Main limbs ascend then arch outward; secondary axes remain connected and waves are restrained | Seed 1 is narrower than seeds 31/92; distal branch groupings still look more featherlike and sparse than the complete reference |
| Arrowwood viburnum | Distinct varied canes share an anchored root crown, with outward spread and paired candidates | Static cane mixture and schematic base; no renewal/suckering history or radial stem depth |

These are improved structural studies, not photorealistic renders or accepted
production trees. The model has no 3D azimuth, self-occlusion or age/resource
competition. Increasing recursive counts to fill every empty region would risk
reintroducing the rejected fine branching. Root close-ups show broadening into
the collar and outward taper, but the flattened soil-section geometry cannot
match the radial perspective of the supplied exposed roots. The exposure mask
separates visibility from structure; it is not terrain reconstruction. Junctions
are tangent-connected tapered outlines and may show silhouette steps at unequal
attachments; they are not blended bark surfaces. Foliage is absent and cannot
hide these limits.

### Validation and reproducibility

The registered `vegetation/branching-study` bake now deliberately imports PNG
and JPEG, verifies extension/signature/hash, decodes references in Chromium and
rejects publication or replacement of an already completed review. It uses the
shared `browserExecutable` configuration. It writes 15 complete JSON/SVG graphs,
matching reference copies, five comparison captures and the editor capture.
Root/shoot budgets remain 600/4,000. All seed graphs pass finite-coordinate,
parent attachment, taper, fork-area, minimum node-spacing, individual/downstream
slenderness, base ownership and independently recomputed root checks. No budget
truncation occurs. Source and artifact hashes are checked by the bake gates.

| Species | Shoot axes for seeds 1 / 31 / 92 | Root axes for seeds 1 / 31 / 92 |
| --- | --- | --- |
| London plane | 1247 / 984 / 1185 | 48 / 51 / 54 |
| Silver linden | 1284 / 918 / 1217 | 42 / 45 / 48 |
| Northern red oak | 651 / 609 / 771 | 48 / 51 / 54 |
| American elm | 1024 / 1011 / 1363 | 48 / 51 / 54 |
| Arrowwood viburnum | 1046 / 957 / 992 | 188 / 194 / 212 |

Focused tests are `vegetation_branching_study.test.js` (29),
`vegetation_species_context.test.js` (7) and `vegetation_reference_import.test.js`
(1), plus `vegetation_branching_study.pwtest.js` (2 browser cases). The browser
checks compare editor settings exactly and geometry within 1e-10 m of baked
presets (Node/Chromium floating-point tolerance), exercise
species switching, reference decoding, basal edits, inspection, exports, reset,
view-only exposure, hidden hover/focus/tap help and narrow-screen image layout.
The final review's `ui-validation.json` records that separate UI run. Numerical
validity is reported separately from the visual limitations above.


## Ramification follow-up — 2026-10-17

The user clarified the acceptance priority: a simple trunk representation is
sufficient; exact curvature, bark detail and side-view wood rendering are not
required. The work should reproduce meaningful bifurcations and the hierarchy of
large limbs, secondary branches and smaller subdivisions. This is a follow-up
implementation; the completed prompt 649 document was not restarted or rewritten.

The additional supplied `London_Plane_Branches.svg` is an untextured vector with
one compound filled path. It cannot directly provide branch adjacency or order.
The matching supplied PNG is the visible silhouette target. Both original bytes
were preserved under
`tests/artifacts/screens/vegetation_branching_study/649_ramification_followup/inputs/`
with SHA-256 provenance. The vector contents were treated as reference data.

The previous grammar maintained long continuing axes and reduced divergence
with increasing order. Terminal-role axes could no longer produce tip forks.
Adding only more final twigs left the coarse hierarchy unchanged. The shared
`ramification.mjs` now provides an explicit second phase: each tip divides into
two unequal daughters, either daughter can subdivide again, and optional smaller
side branches attach at a separate intermediate node. The first daughter tier
uses the scaffold bend role, the second the lateral role, and later tiers the
terminal role. Classification no longer prevents subdivision. The existing
whole-axis curve primitive and parent-frame attachment are retained.

Six numeric controls govern the new architecture: primary-limb count, tier count,
daughter length ratio, divergence angle, intermediate side-fork probability and
outward growth preference. The primary-limb override allows up to eight major
limbs independently of later child counts; zero retains the earlier count mode.
Outward preference biases growth away from a crown guide at initial trunk-tip
height. It is an artistic direction field, not collision or light simulation.
Mixed primary limbs
now distribute along the configured clear-bole interval when context rules are
enabled. Generic experiments with context zero and zero extra tiers retain their
previous placement. These are shared numeric rules; no species-name conditional,
hand-placed branch, traced silhouette or alternate generator was introduced.

| Species | Framework levels | Additional fork tiers | Intended architecture |
| --- | --- | --- | --- |
| London plane | 1 | 6 | Seven distributed primary limbs with repeated daughter forks |
| Silver linden | 3 | 4 | Retained leader/height profile followed by finer bifurcations |
| Northern red oak | 1 | 6 | Seven unequal primary limbs with broader daughter divergence |
| American elm | 2 | 4 | Ascending/arching framework with connected finer subdivisions |
| Arrowwood viburnum | 2 | 3 | Eleven independent basal canes with shorter finer tiers |

Graph version 9 exports `growthLevels`, shoot `phase` and `ramificationLevel`;
preset revision is 5. Every child advances one graph level. A ramification child
advances one branch order; a normal continuation retains its order. Same-tip
area allocation applies even when daughter inequality is zero. Intermediate
side branches do not count as simultaneous tip daughters. Minimum sizes and
bounded directions can stop individual candidates; a tier count is a maximum,
not a guarantee that every branch survives to that tier. All tested species
reach their requested final tier without hitting the 4,000-axis budget.

The direction gate now normalizes `atan2` tangents to a common -90 to 270 degree
interval before applying bounds. Previously a descending leftward tangent could
wrap below -90 and lose all daughters, even though its rightward counterpart
survived. A regression fixture exercises those missing descendants. Downstream
support now includes the sum of daughter cross-sections at distributed nodes,
so the trunk can support all primary limbs instead of only the tip daughters.

The registered bake adds `ramification.html`, canopy SVGs and four matched-frame
stage SVGs per species, plus five captured level-comparison sheets. Review at
[branching levels](http://127.0.0.1:4192/tests/artifacts/screens/vegetation_branching_study/649_ramification_followup/review_v4/ramification.html)
or the linked three-seed comparison. Replay and export retain the complete graph;
stages only reveal existing levels. The trunk and root drawings remain schematic.

Validation includes an exact binary fixture with levels 1, 2, 4, 8, 16 and 32 axes;
repeated forks after terminal classification; unequal/zero-inequality area limits;
intermediate side attachments; unchanged existing centerlines when adding a tier;
independent phase/tier auditing; and all five species over seeds 1, 31 and 92.
Browser checks cover current preset equality, tier editing, replay visibility,
exports, help, mobile layout and all linked stage images. Visual inspection is
separate from these invariants.

The new hierarchy is inspectable and contains real subdivisions at each stage.
It still does not reproduce the supplied silhouette's balanced spread, relative
limb weight or distribution of gaps. London plane retains uneven open regions,
and some smaller branches are visually too faint at whole-tree scale. Linden
and elm remain more open than their supplied examples. These are remaining
ramification/proportion limitations, not a request for bark textures or more
precise trunk curvature. No visual-parity or production-asset acceptance is claimed.

Final follow-up verification: 45 Node tests and 3 browser tests passed. The bake
validated 15 species/seed graphs, all requested final tiers and zero budget
omissions. All 132 manifest outputs and 11 reference identities (ten raster
references plus the supplied SVG) were hash-verified against their sources.
The five level-comparison sheets and editor hierarchy view were visually reviewed.
The registered bake receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1792251873931-10220-12acf931/summary.json`.
Final artifacts are under `649_ramification_followup/review_v4/`; the browser
checks also cover primary-limb editing, stable existing geometry when reducing
a tier, stage visibility, and image/caption containment on the comparison page.

## Prompt 650: shared volumetric ramification — 2026-10-17

`branching_study/model3d.mjs` supplies a spatial geometry adapter to the existing
generation loop. Framework sites, ancestry keys/random streams, daughter tiers,
dimension profiles, local taper and downstream support are shared with 2D.
`spatial.mjs` provides unit orthogonal branch frames, seeded radial primary
distribution and paired daughter planes that rotate between tiers. Direction
limits use the vertical vector component, so descending-left angle wrapping
cannot selectively prune descendants. The optional planar crossing policy is
rejected for spatial generation; a projected overlap is not a collision test.

Graphs use metres and right-handed Y-up. Blender receives `(x,-z,y)` for
right-handed Z-up. Shoot `parentT` is normalized arc length on equal-distance
centerline samples; root `parentT` is the retained cubic sample-index fraction.
The exact planar fixture is exported separately and is not presented as a 3D
specimen. Regressions compare all fifteen preserved page-10 path/root fixtures
exactly. The existing 2D editor still runs the default planar geometry adapter.

The root grammar now has radial destinations and local 3D side-root departures.
Each main root retains its shoot/base host, and each child attaches to its actual
parent. Arrowwood retains eleven seeded ground anchors, separate canes and a
common below-grade crown. Lean leaves the anchors fixed. Root random streams,
depth/reach constraints and omissions remain independent of crown generation.
The saved root mesh and review distinguish complete underground geometry from
soil-plane exposure; these dimensions are geometric estimates, not excavation data.

Two new shared numeric controls address spatial distribution exposed in pilots:
`leaderLaterals` allocates lateral nodes independently on order-zero leader axes,
while subordinate branches retain ordinary counts; `primaryApicalScale` shortens
the initial top limb of a mixed crown without shortening the other primary
families. Defaults zero/one preserve earlier planar behavior. The spatial presets
use separate numeric overrides in the existing species catalog:

| Species | Spatial tuning | Retained hierarchy |
| --- | --- | --- |
| London plane | Reduced nominal base thickness/outward bias; shorter apical family | Seven spreading primary limbs, six daughter tiers |
| Silver linden | Four laterals per leader axis; stronger height profile; shorter continuation ratio | Persistent leader, three framework and four daughter tiers |
| Northern red oak | Reduced nominal base thickness/outward bias; shorter top family | Seven unequal major limbs, six daughter tiers |
| American elm | Five primary limbs, longer daughters, reduced outward bias and shorter apex | Two framework levels, four daughter tiers |
| Arrowwood viburnum | Existing sizes/tier counts; radial anchors and local paired nodes | Eleven individual canes, three fine daughter tiers |

Support may enlarge configured base radii. No species-specific executable hook,
camera-dependent growth, replicated silhouette or incremental attraction field
is used. Linden's initial six-lateral pilot hit the explicit shoot budget and was
rejected; the retained four-lateral preset stays within it across the three seeds.
The first saved linden pilot also exposed an overly long leader extension. Its
spatial `mainRatio` was reduced from .79 to .60, bringing the seed-1 height from
23.24 m to 15.37 m while preserving its three framework levels and four daughter
tiers. All three revised seeds were compared in four graph projections before
returning to the saved-mesh review.

The registered `vegetation/ramification-3d` leaf stages inspectable `.blend` and
GLB files, graph/configuration JSON, both unchanged supplied reference sets and
fourteen EEVEE renders per specimen. It reuses the existing longitudinal tubes
and inherited-tangent junction shoulders. Major wood is voxel-unioned; small
terminal axes remain intact tubes. Reopened saved geometry is audited for finite
coordinates, normals, closed surfaces/positive volume, interior radius at major
attachments and fine-ring center/radius fidelity to the source graph. The isolated
fork is cut directly from the fused saved mesh; its open cut boundaries are
intentional. Subtree diagrams retain the selected ancestry family. Neither capped
tube overlap nor these numerical checks establishes global mesh nonintersection.

The review includes front, side and two opposite obliques; colored generation
levels; framework/first/third daughter stages; an isolated subtree from two views;
a major fork in context and isolated; complete roots; and soil-grade visibility.
Whole-tree views share a projected fit across all four directions. Explicit
pre-render bounds reject clipping outside the labeled contextual close-ups.
PNG dimensions, required views, GLB contents, source/output hashes and reference
identities are validation gates. All outputs stay in a fresh prompt-650 revision;
publication and overwriting existing output directories are rejected.

The final visual pass found that the initial junction diagnostic sometimes used
a continuation endpoint and included disconnected neighboring fragments. Junction
selection now requires a real fork of fused major axes, with a major lateral
attachment as the explicit fallback when daughter axes belong to the fine mesh.
The crop retains only the connected saved surface nearest the attachment. Its
parent/child IDs, attachment coordinate and radius are recorded, and connectivity
is checked again after reopening. The registered `phase=review` authenticates a
previous revision, requires identical current graphs/render settings, copies its
sources, and refreshes only these diagnostics. Visible geometry must remain
identical; GLB and the other twelve renders must retain their original hashes.

### Visual findings

All fifteen specimens were inspected without foliage from front, side and two
opposite oblique views, alongside both supplied reference collections. The side
views contain independent branch depth and occlusion, and successive generation
views expose real major, secondary and finer descendants. The complete references
govern silhouette comparisons where the newer images crop the crowns. The
following limitations remain visible across the three seeds:

| Species | Result and remaining reference differences |
| --- | --- |
| London plane | Distributed spreading limbs and repeated daughter forks read in depth; large gaps and clustered upper families remain uneven, with faint outer twigs. |
| Silver linden | A persistent leader and height-dependent laterals remain visible after shortening the excessive leader extension; the upper crown and interior remain too open. |
| Northern red oak | Broad, unequal branching is volumetric; overall family distribution remains too similar to plane and needs stronger species separation. |
| American elm | Ascending primary families open outward, with repeated secondary forks; the vase remains open and the supplied reference's arching outer crown is only approximate. |
| Arrowwood viburnum | Eleven separate anchored canes form a radial shrub in every view; its silhouette is too spreading and finer subdivisions remain sparse compared with the references. |

Major junctions are connected but retain simplified shoulders and occasional
voxel smoothing irregularities. Fine tubes are separate overlapping surfaces,
not a single watertight union, and there is no global branch-collision solver.
Root forms are schematic estimates. These are heavy geometry-review models,
not optimized runtime LOD assets. Passing audits does not establish botanical
accuracy or reference-level realism; no production acceptance is claimed.

### Final validation and saved evidence

The retained collection is
`tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/r13_final/`.
Its [comparison page](http://127.0.0.1:4192/tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/r13_final/index.html)
links all five species, all three seeds, the ten copied reference images, fifteen
Blender sources/GLB exports, graphs, configurations and saved-mesh audits.
There are 210 EEVEE PNG renders at 1400×1400, five species comparison sheets and
fifteen four-view/diagnostic sheet pairs. All 352 manifest outputs were hashed.

Validation passed 61 Node tests (45 existing plus 16 spatial) and four browser
tests (three existing plus one live-source regression). The final spatial rerun
passed all sixteen tests with no skips. All fifteen graphs reach their requested
last daughter tier with zero shoot/root budget omissions. All saved-mesh checks
pass; the minimum major-attachment interior depth is 0.9438 child base radii.
Maximum fine-ring center error is 0.01526 radii and relative radius error is
0.001495 against the meshing adapter. Every isolated saved junction is connected.
The existing 132-file 2D review and eleven source reference identities remain
unchanged, including the supplied SVG.

The original full bake receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1792258954797-28380-88b601c7/summary.json`.
The final diagnostic-refresh receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1792260388865-7800-fa94bc55/summary.json`.
It reopens and audits all fifteen copied sources, verifies unchanged visible
geometry and GLB, re-renders thirty corrected junction images, and authenticates
the remaining 180 renders from the full bake. All final junction close-ups and
the assembled review were visually inspected. No Blender-dependent step remains
blocked. Outputs remain staged; installed vegetation and unrelated work are
preserved, with no publication, commit or worktree cleanup.

## Shared 3D root and PBR finishing

The follow-up finishing pass retains the current shared graph, seed streams and
all saved shoot coordinates, polygon loops and transforms. It develops the
existing radial root graph into fused coarse roots, directional basal flares and
buttresses. The collar's upper rings taper inside the preserved bole surface;
the visible transition does not end in an exposed cylindrical rim. Every fine
root endpoint is retained in overlapping tapered tubes. Arrowwood retains eleven
individual cane origins and a shared crown connected below soil grade.

The registered `vegetation/ramification-3d` leaf owns `phase=finish`. It requires
an authenticated neutral source revision and a new artifact directory. The
source graph must equal the current shared generator exactly. There are no new
species-specific growth functions and the planar study is unchanged.

Each species uses its installed `tree_ai_<species>_bark` material, copied with all
metadata-declared maps. Longitudinal charts are projected onto fused major wood
and root surfaces. Fine wood retains its charts, scaled to the material's
documented approximate tile size. Base color is sRGB; normal/ORM are non-color;
metalness is supplied by the zero-valued ORM blue channel. OpenGL tangent normals
provide relief without changing the saved branch silhouette. Blender sources
pack the maps; GLB embeds original base-color, normal and ORM PNG bytes. The
metadata identifies AI-authored appearance and inferred data maps, not scans or
measured material properties.

Finished reviews retain colored generation diagnostics and add root side/top,
root collar and bark detail views. All images use EEVEE. The main views expose
the flares at soil grade and the underground views omit soil for inspection.
All five species and seeds 1, 31 and 92 are required for a complete collection.

In addition to existing mesh tests, saved validation checks one connected coarse
root component, overlap at every cane/ bole anchor, retained fine-root centers,
packed material maps and finite UVs. Export validation requires UVs, tangents,
base color, roughness/metallic, normal and occlusion channels. Independent tests
inspect every exported tangent frame and authenticate the embedded PNG bytes.
Closed negative-volume voxel pockets may be sealed only below the explicit
four-voxel extent/eight-cubic-voxel volume bounds; root-sized detached positive-volume
surfaces remain a validation failure. The receipt records each repair.
The original crown limitations remain; this pass does not establish reference
parity or convert the heavy review meshes into production LODs. Roots remain
geometric estimates and fine tubes overlap rather than forming one closed union.

### Root/PBR finishing result

The completed follow-up is staged at
`tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/r18_roots_pbr_final/`.
Its `index.html` links fifteen packed Blender sources, fifteen embedded-texture
GLBs, the shared graphs, material provenance and all saved-mesh audits. The
registered framework receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1792267874420-11768-2ea550ff/summary.json`.
The collection contains 270 EEVEE renders at 1400 by 1400, five reference
comparison sheets, fifteen surface sheets and fifteen whole-tree/diagnostic
sheet pairs. The manifest authenticates 472 output files, including 45 retained
material files. No assets were published or replaced.

All five species and seeds 1, 31 and 92 pass the reopened saved-mesh gates.
Coarse roots form one connected component for every specimen; all original root
paths and tips survive. Arrowwood keeps eleven cane origins, with its connecting
crown surface bounded at least 6.1 mm below soil grade. The bounded voxel-pocket
repair affected only linden 31 and arrowwood 92. Source graphs and saved shoot
coordinates, polygon loops and transforms remain unchanged. Independent checks
verify every exported tangent frame and the exact embedded source PNG bytes.
The follow-up passed 34 Node tests (16 shared spatial/planar regression, two
tangent export regression and 16 saved-output checks), plus one live browser
regression; none were skipped. The bake's review browser reported no errors.

Visual inspection covered every seed's front, side, opposite obliques, root
collar, bark detail and underground front/side through the saved comparison and
surface sheets, with full-resolution close-ups and arrowwood root-top views.
Both supplied reference collections remain beside the rendered species. Plane
has the mottled cream/olive appearance, linden finer gray ridges, oak stronger
furrows, elm darker interlaced ridges and arrowwood pale scaly canes. Root collars
now flare into the coarse lateral roots without the pilot's exposed upper rim;
arrowwood's separate canes remain visible above grade.

The root networks remain sparse, regular geometric approximations of the
references. Root-scale differences are present, but the four tree species still
share similar radial layouts. Texture chart seams are visible near some major
forks, particularly plane and oak; bark repetition and mature bark on fine wood
remain visible. Relief uses normal maps, with no height displacement or
cross-chart blending. Whole-tree architecture is preserved from `r13_final`, so
its open crowns, limited fine branching and imperfect species silhouettes remain.
These are heavy review models, not optimized runtime LODs or a claim of botanical
or photographic parity. No Blender-dependent finishing step remains blocked.

## Shared 3D stem taper and curvature follow-up

The annotated trunk review identified cylindrical shelves followed by abrupt
width reductions. These came from stepwise downstream support cross-sections,
not from bark. The spatial support pass now spreads each reduction through a
quintic transition over up to 30 percent of that axis, finishing at the original
tip. An eight-percent basal allowance supplies continuous taper between branch
sites. It only increases radii relative to the original support samples; child
attachment thickness, downstream reach and daughter tip-area requirements still
apply. The adjustment runs bottom-up on order-zero trunks, leaders and canes.
Higher-order branches and the exact planar fixture path retain their rules.

The tree species' spatial presets use trunk bend amplitudes of 18 degrees for
plane, 14 for linden, 22 for oak and 18 for elm, a full-axis curved zone, 55
percent tip recovery and up to 25 percent seeded amplitude reduction. Single
trunks use the basal frame's seeded radial plane. All daughter origins and
tangents are generated from these real curved paths; the model is not bent after
meshing. Arrowwood keeps its existing independent cane curvature controls and
eleven grounded anchors, with the same continuous stem support rule.

New saved reviews add three neutral trunk close-ups and a `stems.png` sheet per
specimen. A neutral override is also required for these views in the PBR finish;
bark must not conceal the silhouette. Original neutral and PBR revisions remain
intact. A fresh neutral bake is required before finishing because the graph and
saved geometry have changed. The registered leaf continues to reject graph
mismatches, overwrites and publication.

Root finishing also measures component winding in centered double precision.
The former float32 world-space determinant could reverse the sign of very small
voxel cavities. Bounded cavity sealing runs before smoothing as well as after.
A positive-volume quantization sliver can be removed only if it has eight vertices
and six closed quads, is smaller than 0.1 voxel and five percent of the smallest
coarse source diameter, and encloses less than 0.001 cubic voxel. The recorded
arrowwood seed-1 failure was approximately 74 micrometres across. Root-sized
components remain connectivity failures. Fine roots are appended after this
bounded cleanup and are never filtered; all original paths and endpoints are
still independently checked after saving. Receipts retain every removal's size,
volume and topology alongside the smallest coarse source diameter.

### Saved neutral stem review

The revised neutral collection is staged at
`tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/r21_smooth_stems_neutral/`.
It contains all five species and seeds 1, 31 and 92, with 255 EEVEE renders and
fifteen Blender/GLB pairs. Its registered framework receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1792269762896-31356-87566a8f/summary.json`.
All graph, saved-mesh and output-identity gates passed. The independent graph
comparison recorded zero cylindrical stem-radius shelves, no reduction below
the original support requirement, and maximum attachment error below 4e-15 m.

Visual inspection covered every seed's neutral front, side and oblique stem
sheet, plus full-resolution tree and trunk views. The broad support-width steps
are gone; the single trunks have a gentle bow that reads differently across
viewpoints. Arrowwood's centerlines and ancestry match the preserved previous
collection exactly. Small marks at branch unions and some surface faceting
remain visible. The support fix does not eliminate every mesh-junction seam or
change the previously documented crown-density and species-silhouette limits.

### Finished smooth-stem result

The completed root/PBR collection is staged at
`tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/r27_smooth_stems_pbr/`.
The gallery links fifteen packed `.blend` sources and fifteen GLBs with embedded
PBR textures, both supplied reference collections, graphs and saved audits. Its
315 EEVEE renders are 1400 by 1400 pixels at 32 samples. The manifest authenticates
532 files, including 45 retained material files. The registered framework receipt
is `tests/artifacts/screens/ai556_bake_framework/run-1792274592060-36496-56c23086/summary.json`.
All fifteen saved models passed; the review browser reported no errors.

Independent validation passed 39 Node checks: seven stem-taper checks, sixteen
shared spatial/planar checks and sixteen saved-output checks. Five Python volume
and sliver checks and one live browser regression also passed, with no skips.
These cover deterministic structure, original support minima, daughter
attachments, arrowwood's exact prior cane centerlines, planar compatibility,
retained root paths, unchanged neutral shoot geometry during finishing, all
exported tangent frames and original embedded PNG bytes. All coarse root systems
are connected. Arrowwood's eleven canes remain distinct above grade; the shared
crown surface remains below grade. One bounded quantization sliver was removed
from arrowwood seed 1 before smoothing; no fine root paths were filtered.

Final visual inspection covered every specimen's four whole-tree views and four
root/material views through thirty saved contact sheets. All fifteen neutral
stem sheets were inspected in the source collection, with the five seed-31
finished stem sheets checked again and selected full-resolution trunk and collar
images examined. The broad staircase silhouette is gone, and the seeded trunk
bow remains visible after finishing. Plane retains mottled bark, linden fine gray
ridges, oak deeper furrows, elm darker ridges and arrowwood pale scaly canes.
The root flares meet the trunks, and the separate arrowwood canes emerge from
soil without an exposed shared crown.

This pass resolves the annotated taper and straight-trunk issue. Small surface
marks at some branch unions, bark repetition and UV seams remain. Roots are
sparse radial approximations, with similar layouts among the four tree species;
crowns are more open and regular than the supplied studies. Bark relief uses
normal maps rather than displacement. The meshes remain heavy review assets,
not optimized runtime LODs or a claim of photographic realism. Existing outputs
and installed assets were preserved; no assets were published. No required
Blender step remains blocked.

## Root-to-trunk integration follow-up

The annotated elm root collar exposed abrupt shoulder contours and unrelated
bark directions. The shared finishing adapter now begins each shoulder at the
upper collar with a vertical tangent and joins the retained root tangent. A
taller directional flare and localized coarse-surface smoothing soften the
union. The neck is fitted to the actual saved trunk with a quintic transition;
its hidden upper edge is inset by 0.2 percent of the basal radius. Fine root
vertices and all shoot geometry retain their source identities. Roots and shoots
remain separate meshes; this is not a claim of a globally watertight solid.

The basal material uses one cylindrical-to-radial coordinate field, transitioning
to root-axis coordinates outward. It preserves the original chart frame on
slanted canes, evaluates cane ownership at the actual height, and follows hosted
root paths when they pass other canes. Angular seams use each root's circumference
instead of the larger trunk circumference. Unwrapping retains the chart's
absolute texture phase: a geometric circumference is not an integer texture
repeat, so per-face phase reduction would produce artificial bark bands.
The lower shoot and root surfaces
share the field; original shoot charts are retained above three basal radii.
The original PBR images remain packed and embedded without pixel changes.

The review contract adds matched front, side and oblique collar inspections in
both PBR and neutral material: 26 EEVEE views per finished specimen. This exposes
the shape independently of bark detail. All five species and seeds 1, 31 and 92
remain the required full-collection validation scope.

### Saved integration result

The completed collection is staged at
`tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/r36_integrated_roots/`.
It contains fifteen packed `.blend`/embedded-PBR `.glb` pairs and 390 EEVEE
renders at 1400 by 1400 pixels and 32 samples. Its manifest authenticates 622
files. The registered finish receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1792280905018-10600-8249c519/summary.json`;
the export repair receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1792282351518-17040-3c0acccd/summary.json`.
Both passed, and the review browser reported no errors. The export phase retained
every Blender file, render, texture and graph byte for byte from r35, changing
only GLB tangent XYZ and validation receipts. It repaired 116 zero-length frames;
all 49,166,902 final exported tangent frames passed the unit/orthogonality audit.
Thirteen Python root-flow tests, four Node export regression tests and sixteen
independent saved-output checks passed with no skips.

Visual review covered all fifteen six-view collar sheets (matched PBR and neutral
front/side/oblique), all fifteen four-view whole-tree sheets, five seed-31 surface
sheets and eleven selected full-resolution details. The inspection inventory is
saved in the artifact-root `root-integration-review.json`; the before/after page
is `root-integration-comparison.html`. Collar silhouettes turn gradually from
trunk into root shoulders, and bark grain follows the same turn. The artificial
horizontal texture-phase bands found during iteration are removed. Arrowwood's
canes remain separate above grade; its shared crown remains below grade. Saved
shoot geometry and fine-root paths retain their source identities.

Minor UV stretching, creases and seams remain locally. Root layouts are still
sparse radial approximations with similar arrangements among the four trees.
Roots and shoots remain fitted separate meshes, not a globally watertight union.
Bark relief uses normal maps, and the heavy review meshes are not runtime LODs.
The earlier open/regular crown limitation remains outside this root integration
pass. Existing assets and previous revisions were preserved, and nothing was
published. No required Blender work remains blocked.
