DONE

# Problem

The user identified blocky, flat camouflage-like patches on the London plane
trunk. The regular cell shapes and one-color-per-cell palette need refinement.

# Request

Replace the regular bark mosaic with irregular overlapping peeling layers,
restrained gray-green and buff color variation, and coherent shallow physical
relief. Apply the correction to all three mature plane forms.

Tasks:
- [x] Refine original procedural plane bark without changing foliage, other
  species or existing gameplay trees.
- [x] Rebuild all three plane GLBs and editable sources through the registered
  headless bake workflow, preserving authentication and geometry gates.
- [x] Review matching textured/clay close-ups and whole models; verify preserved
  foliage and successful runtime imports.

Evidence belongs under `tests/artifacts/screens/ai579_plane_bark/`.

## On completion

- Mark DONE on the first line and rename in `prompts/` to
  `AI_DONE_graphics_579_MATERIAL_plane_bark_patches_DONE.md`.
- Record the final receipts and update the tree specification.
- Keep optimization and gameplay replacement deferred.

## Completion - 2026-10-03

- Replaced regular Voronoi palette blocks with warped, multiscale overlapping
  peel layers, smaller color differences and variation within patches. Color,
  roughness and shallow relief remain coherent.
- Published all three London plane forms and packed Blender sources as v4;
  updated runtime cache revision. Other species remain v3 and byte-unchanged.
- Preserved all fifteen plane foliage attribute hashes and three leaf maps.
  All three wood surfaces remain connected, closed, manifold and nondegenerate.
- The final capture test passed with sixteen UHD native/clay images; both
  all-species import and unchanged default-loader tests passed. Field continuity
  and exact preservation of other species' fields were checked separately.
- Broad collar-chart stretching remains at some forks; this correction addresses
  the flat regular patch appearance. No geometry optimization was applied.

Final evidence: `tests/artifacts/screens/ai579_plane_bark/final/`.
Verification: `field_verification.json`, `publication_verification.json`,
`final_capture.log` and `import_checks.log` in the same task's evidence directory.
Bake receipt:
`tests/artifacts/screens/ai556_bake_framework/run-1791046609832-37472-3e315530/summary.json`.
