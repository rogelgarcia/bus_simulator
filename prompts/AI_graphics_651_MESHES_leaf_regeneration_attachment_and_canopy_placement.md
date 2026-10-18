# Problem

The shared vegetation generator now has reviewed 3D branches, curved supported
stems, integrated root collars and species PBR bark. The next step is to
regenerate leaves and place them on these trees with believable shape,
orientation and physical attachment. Leaf flatness, inclination, curvature and
the connection to the branch need deliberate review; adding foliage must not
hide structural defects or turn a volumetric tree into flat sprays.

The user has paused implementation for a project refactor. This is a deferred
follow-up handoff, not authorization to start leaf work or the refactor now.
Resume only when the user explicitly asks to implement this follow-up. After the
refactor, locate the current equivalents of the paths below before changing code.

# Request

Regenerate and integrate species-specific leaves for London plane, silver linden,
northern red oak, American elm and arrowwood viburnum on the current shared 3D
trees. Establish convincing individual leaves and attached leafy shoots before
scaling placement to complete crowns. Keep one reusable implementation with
species data, deterministic variation and inspectable attachment ownership.

## Starting point and preserved work

- Working checkout: `C:/Users/rogel/Projects/bus_simulator_worktrees/graphics`.
- Commit `53b4ad61`: shared 3D architecture, smooth stems and roots/PBR checkpoint.
- Commit `30d8d191`: improved trunk/root collar integration, continuous basal bark
  flow, matched neutral/PBR reviews and validated tangent exports.
- Latest saved collection:
  `tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/r36_integrated_roots/index.html`.
  It contains all fifteen packed Blender/GLB pairs, graphs, material sources,
  provenance and 390 EEVEE renders for seeds **1, 31 and 92**.
- Root before/after review:
  `tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/root-integration-comparison.html`.
- Current structural source: `tools/bake_vegetation/branching_study/` and
  `tools/bake_vegetation/ramification3d/`. Preserve the shared generator and its
  2D study; the older `enhanced_reference/growth_v2/` folder is an elm-only
  experiment, not the authoritative branching generator.

Read `AGENTS.md`, `ai_rules/PROJECT_RULES.md`, applicable local rules,
`specs/graphics/vegetation_species_rules.md`,
`specs/graphics/vegetation_enhanced_reference.md`,
`specs/graphics/vegetation_reference_foliage.md`, the current generator READMEs,
`tools/baking/README.md` and `specs/tools/bake_framework.md`. Follow the refactored
architecture if these responsibilities move. Update the relevant specs when
implementing; do not restart or rewrite completed prompt 650.

Inspect earlier leaf infrastructure for reusable geometry, materials and audits:
`authoring/leaf_geometry.py`, `authoring/leaf_surfaces.py`,
`enhanced_reference/leaf_outline.py`, `enhanced_reference/leaf_curvature.py`,
`enhanced_reference/leaf_wireframe.py`, and `natural_foliage/`, all under
`tools/bake_vegetation/`. These are reuse candidates, not permission to import
an older tree generator or discard unrelated experiments.

The saved galleries and their authenticated reference manifests identify the
species references. Use those sources and retained leaf material provenance;
supplement missing leaf/attachment evidence with documented species references
when needed. Distinguish reference-supported traits from artistic estimates.
Artifacts are local and gitignored. If missing after refactoring, regenerate
through the registered framework rather than silently substituting old models.

## Required outcomes

- [ ] Regenerate a small, deterministic set of leaf variants for each species,
  with convincing outline, proportions, lobes or serration where applicable,
  blade base, tip and scale. Compare the actual saved geometry with references.
- [ ] Establish how flat each blade should be. Review longitudinal midrib bow,
  transverse cupping or folding, tip droop, twist and edge curl independently.
  Use restrained, species-appropriate variation; avoid uniformly flat cards and
  exaggerated crumpling. Curvature must exist in geometry and read edge-on.
- [ ] Define leaf inclination, azimuth and roll relative to its supporting shoot,
  with species-appropriate node arrangement, spacing and bounded variation.
  Verify arrangement against references instead of using uniform random rotation
  or one global facing direction. The blade's orientation and its petiole's
  departure angle must be separately understandable and controllable.
- [ ] Make the connection from branch to petiole to blade physically credible.
  Establish whether each placement needs a petiole alone or an additional fine
  shoot/branchlet. Add only the supporting structure required for believable
  leaf-bearing growth, with appropriate length, taper, curvature and attachment
  to the actual parent surface. No floating blades, detached stalks, blunt
  intersections or leaves emerging arbitrarily from thick limbs.
- [ ] Keep blade flatness separate from the flatness of a leafy shoot or canopy
  layer. Review whether local sprays should be flatter or more spatial for each
  species, including their tilt and depth. Preserve the tree's overall volume
  from front, side, top and oblique views; foliage must not become repeated flat
  fans or a uniformly filled shell.
- [ ] Place foliage on appropriate fine growth with believable density, gaps,
  branch hierarchy and species silhouette. Resolve obvious blade collisions,
  stacked coplanar leaves and repetitive orientation patterns. Do not conceal
  missing support or structural faults by increasing leaf density or leaf size.
- [ ] Give the regenerated blades suitable leaf materials, including coherent
  veins/UVs, front/back appearance, roughness and transmitted-light behavior.
  Regenerate or adapt textures only where needed for the new geometry; preserve
  existing sources, licensing/provenance and publication gates. Review geometry
  with neutral material as well as final PBR so texture cannot hide shape errors.
- [ ] Preserve the accepted wood/root geometry, bark materials, smooth taper,
  trunk curvature, ancestry, repeated daughter forks and arrowwood's separate
  basal canes. New leaf-bearing supports must be identifiable additions. Give
  leaves and supports stable host/attachment identities and independent seeded
  variation so foliage settings do not reshuffle the existing tree structure.

Use species configuration for differences where possible, and extend the shared
generator when configuration cannot express the required leaf or support
structure. Keep leaf geometry, attachment rules and spatial placement distinct
enough to inspect and tune independently within the refactored architecture.
Do not force a new module layout before reading that architecture.

## Validation and visual review

- Begin with individual leaves and one representative attached shoot per species.
  Save top, underside, edge-on and oblique leaf views, neutral/wireframe geometry
  views, and attachment close-ups showing branch, supporting twig, petiole and
  blade together. Include examples of the range of inclination and curvature.
- Validate complete trees for all five species and seeds **1, 31 and 92**. Save
  matched leaf-on/leaf-off front, side and oblique views, plus top views for canopy
  depth and layering. Include in-canopy and isolated leafy-shoot close-ups with
  the actual references alongside. Inspect the saved models, not just generators
  or temporary previews, and iterate on visible problems.
- Check deterministic regeneration, host ancestry and attachment positions,
  unchanged accepted wood/roots, finite geometry, normals, UVs, material maps
  and saved/exported equivalence. Record leaf/support counts and geometry cost.
  Report any geometric collision approximation honestly. Passing tests alone
  does not establish realism; record the actual visual inspection scope and
  remaining shortcomings separately.
- Use `node tools/bake.mjs` through a registered vegetation domain/leaf and shared
  `tools/baking/blender.local.json`. Extend/register the workflow in the framework
  docs and `PROJECT_TOOLS.md` as needed, retaining validation/publication gates.
  Use EEVEE for geometry reviews and follow the project Blender occupancy rules.
  Never interrupt an unrelated render or repurpose an occupied Blender session.
- Stage all new models, maps, renders, comparisons, manifests and logs under
  `tests/artifacts/screens/vegetation_leaf_integration/651_leaf_regeneration/`
  in fresh revision directories. Preserve the r36 collection and all earlier
  artifacts. Keep generated evidence gitignored; do not publish assets or start
  runtime LOD, wind-animation or renderer refactoring as part of this task.
- Save a review gallery linking editable Blender sources, material-bearing GLBs,
  leaf prototypes, placement/attachment data, references and validation results.
  Report changes, visual findings, limitations and exact saved output locations.

Known baseline limitations include minor root UV stretching/creases, regular
radial root layouts, separate fitted root/shoot meshes and open/regular crowns.
Do not silently expand this leaf task into another root or trunk rewrite. Record
structural issues exposed during foliage review for an explicit follow-up.
Preserve unrelated work. Never archive, remove or clean up this worktree.

## On completion

- Mark the AI document as DONE in the first line only after the implementation
  and visual review are complete.
- Rename it in `prompts/` to
  `AI_DONE_graphics_651_MESHES_leaf_regeneration_attachment_and_canopy_placement_DONE.md`.
- Add a high-level one-line summary per completed change, validation results,
  visual inspection scope, artifact links and remaining limitations.
- Do not move the prompt to `prompts/archive/` unless explicitly requested.
