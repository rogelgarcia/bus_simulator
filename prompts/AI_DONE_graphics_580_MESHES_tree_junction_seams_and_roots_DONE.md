# Problem

The user annotated visible bark seams around oak branch junctions and an
unrealistic projecting root stub. Continuous topology alone did not produce
convincing surface transitions or root grounding.

# Request

Correct the branch-junction seams and make the tree bases flow naturally into
the ground. Inspect an oak prototype first and apply the shared correction to
the affected mature library models. Preserve foliage and existing gameplay trees.

Tasks:
- [x] Remove visible bark seams and stretched patterns at branch collars and verify
  textured and clay close-ups.
- [x] Replace the separate toe-like root volumes with integrated asymmetric
  root flares that taper into the ground.
- [x] Rebuild affected mature variants through the registered headless bake
  framework, retain editable sources, and verify geometry and foliage.

This task changes geometry, mapping and the baked bark-color representation. The photographed bark materials
discussed previously remain a separate material change.
Evidence belongs under `tests/artifacts/screens/ai580_tree_junctions/`.

## On completion

- Mark DONE and rename to
  `prompts/AI_DONE_graphics_580_MESHES_tree_junction_seams_and_roots_DONE.md`.
- Update the canonical tree spec with verification and final evidence.
- Retain one implementation; do not optimize or replace production game trees.
