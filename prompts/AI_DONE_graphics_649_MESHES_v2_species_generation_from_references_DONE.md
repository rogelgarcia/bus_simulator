# DONE

# Problem

Our procedural vegetation work needs to approach the structure and proportions
of the supplied species references. Earlier revisions became too repetitive,
wavy, excessively subdivided, or arranged foliage into visible artificial domes.
We moved to a 2D study to establish understandable branching and root rules.
The current presets still cannot express all five species convincingly,
particularly arrowwood's multiple basal stems.

# Request

Use and extend the V2 vegetation generator work, retaining useful existing code
and the accepted improvements from the latest 2D branching study. Generate and
visually review every species listed below against its own supplied references.
Aim for believable, species-specific structure. If a reference requires a feature
that configuration cannot express, add that capability to the shared generator
and use it in the appropriate species preset. This is an implementation request,
not another research-only assessment.

Keep the immediate branch/root review in the current 2D study. Establish sound
architecture there before carrying it into 3D; a schematic drawing is not a
photorealistic render. If producing Blender geometry previews, use EEVEE.

## Working context and starting points

Work in `C:/Users/rogel/Projects/bus_simulator_worktrees/graphics`.
Read `AGENTS.md`, `ai_rules/PROJECT_RULES.md`, applicable local rules and:

- `tools/bake_vegetation/branching_study/README.md`
- `tools/bake_vegetation/branching_study/` — current 2D generator, parameters,
  presets, roots, controls, exports and audits.
- `specs/graphics/vegetation_species_rules.md` — existing research, verified
  feature gaps, species mappings and the proposed function-provider contract.
- `specs/graphics/vegetation_enhanced_reference.md` — previous experiments,
  accepted assets and limitations.
- `tools/bake_vegetation/enhanced_reference/growth_v2/` — earlier experimental
  3D elm growth core, not an accepted all-species solution.

Version names matter: `growth_v2/` predates the current 2D architecture work.
The latest review is
`http://127.0.0.1:4192/tests/artifacts/screens/vegetation_branching_study/20261016_species_2d_v8/index.html`.
Its page revision is v8 and exported graph version is 7. Inspect the actual code
and identify which V2 components can be retained. Do not reset the study to an
older page or reintroduce the rejected incremental, hairlike growth just because
its folder is named V2. Build a coherent reusable generator from the current work.

## Species and supplied references

Generate all five:

1. London plane — `london_plane`, *Platanus × acerifolia*.
2. Silver linden — `silver_linden`, *Tilia tomentosa*.
3. Northern red oak — `northern_red_oak`, *Quercus rubra*.
4. American elm — `american_elm`, *Ulmus americana*.
5. Arrowwood viburnum — `arrowwood_viburnum`, *Viburnum dentatum*; a shrub with
   multiple basal canes, not a small single-trunk tree.

The newer photorealistic references have unmodified, hash-verified copies at:

`tests/artifacts/screens/vegetation_branching_study/20261016_photorealistic_references/references/`

Read `manifest.json` there for original paths and hashes. Files are named
`london_plane.jpg`, `silver_linden.jpg`, `northern_red_oak.jpg`,
`american_elm.jpg` and `arrowwood_viburnum.jpg`.

Original-to-species mapping, under `C:/Users/rogel/Downloads/`:

| Species | Newer outdoor-looking reference | Earlier complete leafless/root study |
| --- | --- | --- |
| London plane | `image_4f6cbaaf.jpg` | `Leafless London Plane Root Study-1.png` |
| Silver linden | `image_a07e8d09.jpg` | `Leafless Silver Linden with Exposed Roots-2.png` |
| Northern red oak | `image_a7aac71a.jpg` | `Leafless Northern Red Oak with Exposed Roots-5.png` |
| American elm | `image_e72a53a3.jpg` | `Mature American Elm Root Study-3.png` |
| Arrowwood viburnum | `image_80521aa6.jpg` | `Arrowwood Viburnum Root Structure-4.png` |

Inspect the actual images. Use the newer set for trunk, fork, root-collar and
ground-contact detail; linden and arrowwood also show complete silhouettes.
Plane, oak and elm crowns are cropped in that set: use the complete earlier
studies and botanical evidence for their overall habit. The blurred side panels
duplicate the center image. Background-tree branches are not part of the target.
Treat these as supplied visual targets, not verified field measurements or proof
that each image is a photograph. Preserve originals and record reference usage.

## Desired outcomes

- [x] Each species has a distinct, recognizable branching/root habit and a
  repeatable preset. Validate at least three seeds per species; do not solve
  only one seed or camera with manually placed branches.
- [x] Main branches have mostly restrained curvature between meaningful forks.
  Broad arches and local bends vary by branch role and position. Avoid repeated
  waves, random steering at every point and excessive fine, threadlike branches.
- [x] Unequal forks, continuing leaders and side branches can coexist, with
  appropriate attachment spacing and different branch sizes. Major limbs must
  appear to grow continuously out of their parent with plausible taper.
- [x] Branch dimensions and curvature can vary by role, order, parent attachment
  position and crown height. Use shared rules rather than repeated species-name
  conditionals or five disconnected generators.
- [x] Arrowwood has separate basal origins on a common root crown, varied cane
  heights/thicknesses/lean, and upright inner versus spreading outer growth.
  Root and shoot ownership must support this structure.
- [x] Roots attach to the actual plant base, broaden into the collar and taper
  outward. Separate root-system structure from visible surface exposure. The
  current soil-section view cannot match a perspective image of exposed roots;
  label those views accurately and do not infer depth from the pictures.
- [x] Retain deterministic generation, existing useful controls, meaningful
  exports, attachment audits and inspection. Keep crossing suppression disabled
  by default; projected crossings are not proof of a 3D collision.
- [x] Keep help text hidden in hover/focus/tap popups on labels and titles.
  Expose meaningful controls without filling the page with explanatory prose.

Species-specific targets:

- **Linden:** a relatively slender clear bole, persistent central structure,
  elongated/pyramidal crown, spreading lower branches and shorter steeper upper
  branches. One global lateral-length ratio is insufficient.
- **Oak:** substantial scaffolds, broad irregular spread, unequal forks and
  controlled local changes of direction, with shorter terminal subdivisions.
- **Elm:** ascending main limbs that open into a broad arch, connected secondary
  structure and shorter distal shoots. Avoid an inverted cone, identical rounded
  branch clusters and continuously wavy axes.
- **Plane:** substantial bole, irregular major branches at different heights,
  broad mature spread and strong continuous basal transitions.
- **Arrowwood:** many distinct canes from a shared base, not one trunk with a
  lowered first fork. Use the references to guide relative sizes and spread.

## Known gaps to verify and address

The previous code assessment found a single initial trunk and roots hosted by
`paths[0]`; global nontrunk bend settings; tip forks sharing one endpoint;
child counts independent of available parent length; and no length-to-radius
limit. Branch order is recorded, but most rules do not use it. Root presets are
shared layout estimates, not species-calibrated dimensions.

Existing curve primitives already support broad bends, localized turns and
recovery; side-shoot mode already supports staggered alternate/paired nodes.
Reuse these capabilities. Prioritize basal-cane support, role/position-dependent
rules, spacing based on usable axis length, unequal branching and sensible
slenderness. Diagnose whether each mismatch needs configuration or a new feature
before adding another parameter. Keep improvements generic across seeds.

The generic species plugin/function-provider framework was previously requested
as documentation only. Do not build a plugin loader or arbitrary script editor
as a prerequisite. Implement necessary core behavior and ordinary species
presets; retain the proposed contract in the spec for future work.

For eventual foliage work, preserve the previously established requirements:
leaves must attach through visible petioles to supported shoots, have modest
blade curvature and gravity response, avoid excessive overlap and competing
parallel branchlets, and form coverage through growth. Do not rotate whole
sprays toward the viewer or place them on repeated visible dome shells. Do not
hide poor wood structure with foliage. Leaf counts and projected-area sums alone
do not establish visible canopy coverage.

## Research already available and further research

Use official SpeedTree documentation for procedural design ideas and primary
botanical/modeling research for growth behavior. SpeedTree is a useful reference
for capabilities, not a source of calibrated coefficients for these species.
Recheck relevant sources when implementing; record observations, assumptions and
artistic estimates separately. Existing research and gaps are consolidated in
`specs/graphics/vegetation_species_rules.md`.

Useful SpeedTree sources:

- [Modeling approach](https://docs9.speedtree.com/modeler/doku.php?id=kcmodelingapproach):
  component/generator hierarchy.
- [Parent and profile curves](https://docs8.speedtree.com/modeler/doku.php?id=curves_overview):
  attachment-position dependence versus variation along an axis.
- [Interval generation](https://docs8.speedtree.com/modeler/doku.php?id=genmode_interval):
  spacing, groups and counts based on available length.
- [Branch generator](https://docs8.speedtree.com/modeler/doku.php?id=branch_generator):
  shape, relative dimensions, length-to-radius limits, late variation, flare and
  junction controls. These are procedural tools, not a full mechanics solver.
- [Generation properties](https://docs9.speedtree.com/modeler/doku.php?id=generation_properties)
  and [bifurcation mode](https://docs9.speedtree.com/modeler/doku.php?id=genmode_bifurcation):
  placement, continuation and selecting branch sites. Bend-based site selection
  is an artistic strategy, not a biological rule that every bend creates a bud.

Other relevant research:

- [Pałubicki et al., 2009, Self-organizing tree models for image synthesis](https://algorithmicbotany.org/papers/selforg.sig2009.small.pdf):
  local branching, bud fate, apical control, competition and width updates.
- [Bastien, Douady and Moulia, 2015](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1004037):
  light/gravity response and curvature feedback; a geometric bend slider does
  not implement this physiological model.
- [Jirasek, Prusinkiewicz and Moulia, 2000](https://algorithmicbotany.org/papers/biomechanics00.html):
  distinguish mechanical bending, tropisms and contact.
- Botanical descriptions: [plane](https://plants.ces.ncsu.edu/plants/platanus-x-acerifolia/),
  [linden](https://plants.ces.ncsu.edu/plants/tilia-tomentosa/),
  [red oak](https://plants.ces.ncsu.edu/plants/quercus-rubra/),
  [elm](https://research.fs.usda.gov/silvics/american-elm),
  [arrowwood](https://plants.ces.ncsu.edu/plants/viburnum-dentatum/), and
  [arrowwood roots and habit](https://mortonarb.org/plant-and-protect/trees-and-plants/southern-arrowwood/).
  Site and age affect habit; elm rooting depth in particular varies with soil.

## Review and validation

- [x] Produce an updated comparison page with every species beside its matching
  supplied references. Include complete plants, isolated branch structures,
  junction/root close-ups and a multiple-seed comparison. Images must be clickable
  at full resolution. Label references, generated studies and rendering methods.
- [x] Keep old artifacts intact. Put this prompt's screenshots, references,
  manifests and review outputs under
  `tests/artifacts/screens/vegetation_branching_study/649_v2_species_reference_review/`.
  Generated evidence remains gitignored; never put it beside source code.
- [x] Use `node tools/bake.mjs` and the registered baking hierarchy, preserving
  existing validation and publication gates. Extend the registered leaf when
  necessary; do not add a machine-specific standalone bake command. The current
  reference importer accepts PNG only: support these supplied JPEGs deliberately
  if needed, preserving provenance and hashes rather than mislabeling extensions.
- [x] Test meaningful geometry invariants and multiple seeds: attachment
  continuity, finite values, taper, size/branch budgets, deterministic exports,
  root ownership and UI behavior. Visually inspect results; passing graph audits
  alone does not establish realism.
- [x] Update relevant specs and explain what was configuration, what new shared
  features were needed, what research informed them and what remains approximate.

Preserve unrelated workspace changes and approved 3D assets. Do not commit,
publish, archive or remove worktrees. Follow the project's Blender occupancy
rules if 3D tools are used. Complete the requested implementation and visual
review without stopping at a proposal or asking permission for routine fixes.

## On completion

- Mark this AI document as DONE in the first line only once the requested work
  and review are complete.
- Rename it in `prompts/` to
  `AI_DONE_graphics_649_MESHES_v2_species_generation_from_references_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a high-level one-line summary per completed change, links to the review
  page and reference comparisons, validation results and remaining limitations.


## Implementation handoff — 2026-10-17

- Extended accepted 2D v8 into page 9 / graph 8 / preset 4 using shared numeric role, order, attachment and crown-height rules.
- Added separate basal canes with varied origins/dimensions/lean and explicit common root-crown ownership for arrowwood.
- Added available-length spacing, unequal fork allocation and coexisting continuations/side branches without species-name dispatch.
- Reused bounded whole-axis curves and added parent-tangent blending, contextual arches and shorter terminal growth.
- Adapted the earlier V2 downstream-reach support principle and added independent slenderness, fork-area, taper and ownership audits.
- Added separate species root estimates, collars at actual anchors and a display-only surface-exposure mask beside the complete soil section.
- Tuned all five repeatable species presets and generated seeds 1, 31 and 92 without manually positioned branches.
- Extended the registered bake leaf with deliberate PNG/JPEG provenance checks, ten unchanged reference copies and linked whole/branch/junction/root/seed comparisons.
- Preserved hidden hover/focus/tap help, inspection and exports; corrected slider rounding and mobile reference sizing found during screenshot review.
- Updated the species research/implementation spec, 3D/V2 relationship and registered tool documentation with remaining visual mismatches.

Review links:

- [Interactive study](http://127.0.0.1:4192/tests/artifacts/screens/vegetation_branching_study/649_v2_species_reference_review/final_v3/index.html).
- [All five reference comparisons](http://127.0.0.1:4192/tests/artifacts/screens/vegetation_branching_study/649_v2_species_reference_review/final_v3/comparison.html).
- [Plane](http://127.0.0.1:4192/tests/artifacts/screens/vegetation_branching_study/649_v2_species_reference_review/final_v3/comparison.html#london_plane), [linden](http://127.0.0.1:4192/tests/artifacts/screens/vegetation_branching_study/649_v2_species_reference_review/final_v3/comparison.html#silver_linden), [oak](http://127.0.0.1:4192/tests/artifacts/screens/vegetation_branching_study/649_v2_species_reference_review/final_v3/comparison.html#northern_red_oak), [elm](http://127.0.0.1:4192/tests/artifacts/screens/vegetation_branching_study/649_v2_species_reference_review/final_v3/comparison.html#american_elm), [arrowwood](http://127.0.0.1:4192/tests/artifacts/screens/vegetation_branching_study/649_v2_species_reference_review/final_v3/comparison.html#arrowwood_viburnum).

Validation: 37 focused Node tests and two browser cases pass. All 15 seeded graphs
pass independent geometry/root audits without hitting budgets. The final bake
passes its validation gates; all 100 recorded output hashes and ten original
reference/copy identities were rechecked. Browser settings equal baked presets;
geometry agrees within 1e-10 m across Node/Chromium. Exports, reset, basal editing,
view-only exposure, help and mobile reference visibility pass. All five final
comparison sheets and the editor/mobile screenshots were visually inspected.
Bake receipt: `tests/artifacts/screens/ai556_bake_framework/run-1792210504996-13708-433af558/summary.json`.
Detailed findings: `specs/graphics/vegetation_species_rules.md`, final implementation
and visual-review section. Earlier artifacts remain intact.

Remaining limits: these are schematic 2D architecture studies, not photorealistic
or approved production trees. Crowns remain more open/regular than the references;
oak retains too much central dominance and elm's distal groups can look
featherlike. Root section/exposure views cannot reproduce radial perspective or
terrain contact. Junctions are connected tapered outlines, not blended 3D bark.
Age/resources, true 3D occupancy, radial roots, foliage and surfaces remain future
work. Existing approved 3D assets and foliage requirements were preserved. No
Blender work, asset publication, commit or worktree removal was performed.
