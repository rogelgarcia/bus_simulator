# Two-dimensional branching study

The current review is page revision 10, graph version 9, numeric preset revision 5
(`shared-v2-ramification-1`). It extends the accepted page v8 / graph v7 architecture.
It does not rebuild or publish enhanced 3D assets.

## Registered workflow

```powershell
node tools/bake.mjs --target vegetation/branching-study --set vegetation/branching-study:reference=<bare-elm.png> --set vegetation/branching-study:studies=<newer-reference-manifest.json> --set vegetation/branching-study:complete-studies=<complete-study-manifest.json> --set vegetation/branching-study:output=tests/artifacts/screens/vegetation_branching_study/<new-review>
```

This registered leaf now uses Node plus the shared `browserExecutable` in
`tools/baking/blender.local.json` for Chromium screenshots. It requires no Blender
process. Each completed output is immutable: choose a new directory for another
iteration. Publication is rejected. Inputs are hashed and rechecked after the run.

Both reference collections are optional. A supplied collection must contain one
entry per species. `studies` accepts the earlier photographic-study array or the
new `{images:[...]}` collection. `complete-studies` accepts the same formats.
Rows retain `species`, relative `file`, `source` and `sha256`. PNG and JPEG are
verified against extension, signature and hash, copied without conversion, then
decoded by the browser. Paths outside the manifest directory are rejected.
The bare elm reference also accepts PNG/JPEG; it is never substituted for another
species. Supplied image provenance is not a claim of photographic authenticity.

The bake exports `index.html` (editor), `comparison.html`, both reference sets,
all five presets, three seeds per species (1, 31, 92), isolated branch structures,
attachment/root details and a surface-exposure illustration. Every comparison
image links to its original resolution. It captures the editor and each species
comparison, validates all 15 graphs, and records output SHA-256 hashes, browser
version, source provenance and audits in `manifest.json`. Old artifacts remain.

Prompt 649 evidence:
`tests/artifacts/screens/vegetation_branching_study/649_v2_species_reference_review/`.
The `final_v3/` subdirectory is the completed review; `final/` and `iterations/` preserve earlier
passes and `inputs/` preserves complete source-study copies and hashes.

## Ramification follow-up

The user clarified that bifurcations and subdivision levels are the priority;
exact trunk curvature and wood surface detail are not required. The current
review is `tests/artifacts/screens/vegetation_branching_study/649_ramification_followup/review_v4/`.
Open `ramification.html` for the reference beside the generated canopy and four
stages of the same graph. `comparison.html` retains the three-seed review.
Previous artifacts and the completed prompt 649 document remain intact.

`depth` now labels the framework recursion. `ramificationLevels` adds 0–6 explicit
daughter-fork tiers after it; `growthLevels` is their sum. Both daughters can
subdivide again, including terminal-role branches. Optional intermediate side
forks use separate attachment sites. Daughter length ratio and divergence are
independent of the earlier lateral-order angle reduction. Existing generic
presets use zero extra tiers. `ramification.mjs` is a shared rule module, not a
species generator or a plugin. All five ordinary numeric presets use it.

`primaryLimbs` permits up to eight distributed major limbs in mixed architecture,
independently of the ordinary framework child counts. Plane and oak use seven.
`ramificationOutward` optionally steers descendants away from the crown guide at
initial trunk-tip height; it is not an occupancy or light solver. Directions are
normalized to the same interval before rejection, so descending left-hand limbs
keep their descendants just as descending right-hand limbs do.

Exports include `phase` and `ramificationLevel` per shoot. Every child advances
one graph level, and each ramification child advances one order. Same-tip radii
share the available parent area even at zero fork inequality. Minimum size and
direction constraints can terminate candidates before the requested final tier;
budget omissions remain explicit. Adding a tier preserves existing centerlines
and keys; downstream support sizing can enlarge radii to support the added wood.
Support includes the summed cross-sections of daughters at all downstream
attachment sites, rather than counting only daughters sharing the tip.
Replay uses the total levels, and inspection identifies the phase/tier. No
separate decorative twigs or raster tracing are used.

The supplied London Plane SVG was inspected: it contains one compound filled
path, not parent/child branch data. Its unchanged copy and hash receipt are under
`649_ramification_followup/inputs/`; the supplied PNG is the visible comparison.
Other complete-study images retain their earlier provenance. References are
visual targets, not measured level counts. No wood-surface or 3D-root work was
added in this follow-up. The comparison still shows gaps in crown balance,
relative branch thickness and spatial distribution; passing topology tests does
not establish reference-level visual parity.

## Shared architecture

- `species.mjs`: sourced traits and editable ordinary numeric presets.
- `parameters.mjs`: shared UI schema and boundary validation.
- `architecture.mjs`: basal initialization, role/order/height profiles, spaced
  candidate sites, unequal forks and dimension rules; no species-name dispatch.
- `geometry.mjs`: equal-length curve samples, attachment frames and radius lookup.
- `model.mjs`: ancestry-keyed random streams, generation and independent audits.
- `support.mjs`: downstream-reach sizing adapted from `growth_v2/support.py`.
- `roots.mjs`: common base ownership, collars, lateral roots, sinkers and taproot.
- `draw.mjs`: actual tapered geometry, view cropping and optional exposure mask.
- `app.mjs`, `help.mjs`, `help-popup.mjs`: editable controls, inspection and exports.
- `references.mjs`, `review.mjs`, `job.mjs`: authenticated, repeatable review bake.

`ramification.mjs` supplies the additional daughter forks and intermediate side branches.

A whole branch axis retains the accepted bounded curve: one gradual/localized
turn and optional distal recovery, never random steering at every sample. Trunk
curvature is independent. A nonzero attachment blend starts a child on its
parent's real tangent and smoothly turns into its insertion direction. Sampling
remains equal-distance, so shoot `parentT` is normalized arc length. Root curves
use cubic sample-index fractions instead; root `parentT` retains that convention.

`level` is generation depth; `order` increases on a lateral/fork and stays the
same on a continuation. `kind` records the attachment event; `role` distinguishes
trunk, leader, basal cane, scaffold, lateral and terminal. Numeric context
influence blends dimension/angle/curvature rules by those roles, order,
attachment position and normalized crown height. The crown-height guide is a
profile coordinate, not a clipping surface. Upper lateral length and angle can
be reduced independently. Distal orders have shorter subdivisions and less bend.
An outward scaffold arch stops adding downward curvature as it approaches the
horizontal. These are geometric rules, not tropism or load simulation.

Usable parent length and `nodeSpacing` cap lateral-node counts. Paired buds may
share a node; distinct nodes retain the minimum interval after jitter. Counts
remain upper budgets, including continuation. An unequal tip fork can use one
slot while other slots create side branches. Same-tip radii respect the parent's
cross-sectional area. Distributed primary forks have separate attachment sites.
`maximumSlenderness` limits each axis's length/base-radius ratio. Optional
`supportedSlenderness` sizes radii bottom-up from all downstream arc reach,
propagates attachment support and maintains monotonic taper. It may enlarge the
configured initial base diameter; resolved radii are exported and inspectable.
This is artistic allometry, not a structural engineering calculation.

The older uniform experiment remains available as `organic`; generic fork and
straight modes also remain. Context influence zero disables role profiles;
spacing, support and junction controls are independently enabled/disabled.
Crossing suppression stays **off** in every preset and on reset. It rejects
projected centerlines only; a planar crossing does not imply a 3D collision.
Shoot/root budgets remain 4,000/600 with explicit omissions. Presets do not hit them.

## Plant base, roots and visibility

`base.anchors` records each initial stem's stable ID, ground position, shoot ID
and resolved radius. A single bole retains primary-root hosts
`{domain:'shoot',id:0,t:0}`. Multiple basal canes have distinct origins, vigor,
lean and thickness on one `base` with `kind:'root-crown'`. Their primary roots
explicitly use `{domain:'base',id:0,anchor:<id>}`. The crown connector and per-cane
collars attach to those same positions. Whole-plant lean rotates each stem family
around its own ground anchor. It never lifts a cane base or rotates roots upward.

Roots use separate random streams and remain bounded below the soil plane.
Root topology, optional sinkers/taproot, reach, depth, taper and minimum diameter
are independent of the shoots. Presets now provide separate root estimates,
including a shallow, more subdivided shrub system. These are not measured species
root dimensions. The roots cannot infer soil depth from an exposed-root image.

The complete root graph is shown in a **soil section**. The optional **surface
exposure / elevation** view masks wood below a chosen grade/erosion depth without
changing any graph data. Neither view is the radial perspective of the references.
This is a visibility separation, not terrain simulation. JSON always contains
the complete graph; SVG export follows the selected display mode. The dedicated
root inspection remains a soil section.

## Retained V2 work and limits

The older `enhanced_reference/growth_v2/` remains an isolated elm experiment.
Its downstream-reach support principle is reused in this core. Existing 2D
seeded ancestry, curves, local frames, taper, bud survival, controls, inspection
and exports are retained. Incremental attraction-field growth is not reinstated.
The existing 3D bark adapter, saved-mesh audits, attached petiole/leaf pipeline,
leaf topology/UV preservation and EEVEE review remain useful for a later 3D pass;
they have not been applied to these schematic graphs.

No plugin loader, arbitrary script editor, physiological age/resource model,
spatial competition, bark surface or leaf canopy is implemented here. The proposed
function-provider contract remains documentation in
`specs/graphics/vegetation_species_rules.md`. Help stays hidden in hover/focus/tap
popups; exceptions are short operational labels and comparison captions.

## Validation

Use `node tools/run_selected_test/run.mjs --set <test-path>`, then
`node tools/run_selected_test/run.mjs` for:

- `tests/node/unit/vegetation_branching_study.test.js`
- `tests/node/unit/vegetation_species_context.test.js`
- `tests/node/unit/vegetation_reference_import.test.js`
- `tests/node/unit/vegetation_ramification.test.js`
- `tests/headless/e2e/vegetation_branching_study.pwtest.js` (requires the final bake).

The audits check finite coordinates, attachments, taper, parent size, spacing,
fork area, individual/downstream slenderness, root ownership and budgets. Browser
checks cover references, species switching, basal edits, independent exposure,
inspection, reset, exports and help access. Visual judgment is separate from these
checks; see the species spec for the review observations and remaining mismatch.

## Shared 3D adapter (prompt 650)

`model3d.mjs` calls this same generation loop with branch-local vector geometry
from `spatial.mjs` and radial root geometry from `spatial_roots.mjs`. It retains
the current ancestry, framework, repeated daughter tiers, dimensions and support
rules; `growth_v2/` is not the generator. The default planar adapter is unchanged.
`leaderLaterals` (default zero) and `primaryApicalScale` (default one) extend shared
controls while preserving old defaults. `species.mjs` contains ordinary numeric
3D overrides separately from the page-10 presets. Fifteen retained 2D fixtures
are checked for exact path/root equality.

Use the registered `vegetation/ramification-3d` leaf for staged `.blend`, GLB,
graph/config exports, saved-mesh audits and fourteen EEVEE leafless views per
specimen. See [its workflow](../ramification3d/README.md) for axes, attachment
conventions, immutable revision directories, references and review limitations.
The existing 2D editor, presets and historical review remain regression tools.
