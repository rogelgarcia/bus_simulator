# DONE

# Problem

The LOD0 edge cards arrange disconnected leaves in regular rows. LOD1 repeats
those grids into larger patches. The accepted wood is already satisfactory.

# Request

Rebuild exterior foliage for all fifteen mature models in both LOD0 and LOD1
using connected, organically arranged branchlets, taking the existing game
atlas and the supplied branchlet screenshot as arrangement references.

- Preserve accepted wood, interior card geometry and triangle budgets.
- Retain original photographic leaf PBR; do not copy licensed game textures.
- Bake visible branching twigs, connected petioles, varied leaf angles and gaps.
- Orient exterior sprays along growth directions from the detailed reference.
- Use the registered headless bake framework and shared Blender configuration.
- Preserve prior outputs and the installed catalog; write new review assets to
  `tests/artifacts/screens/ai594_branchlet_canopies/final/`.
- Compare full trees at bus eye height and provide isolated branchlet proofs.
- Validate exported geometry, materials, alpha coverage and unchanged wood.

## On completion

Mark DONE and rename in place to
`AI_DONE_graphics_594_MESHES_branchlet_canopies_DONE.md`.
Report actual counts and comparison conditions. Gameplay FPS and frame time
remain not measured because this task produces offline review assets.

## Completed

- Rebuilt all fifteen mature forms at both LOD0 and LOD1 with connected exterior
  branchlets, attached petioles, varied spacing, tapered twigs and original photo PBR.
- Aligned exterior cards with detailed-reference shoot growth and retained the
  physical branchlet proportions; added a regression for the old narrow-grid stretch.
- Preserved every accepted wood/core geometry attribute and the exact compressed
  bark payloads; retained base-level interior atlas pixels and installed LOD0 assets.
- Validated all thirty exported models, 720 coverage views and foliage compression.
  Coverage is 97.71–102.92% of the previous corresponding LOD; maximum envelope
  spill is 1.20% with the existing two-pixel tolerance.
- Rendered sixty final Cycles images and assembled fifteen four-way full-tree
  boards plus five card studies and a browsable gallery with GLB/Blender downloads.
- Passed six branchlet regression tests, the proportion regression and thirteen
  bake-framework tests. Restored the prior selected-test setting.

| All fifteen mature forms | Previous | Revised |
| --- | ---: | ---: |
| LOD0 wood triangles | 47,548 | 47,548 |
| LOD0 foliage triangles | 50,000 | 50,000 |
| LOD1 wood triangles | 23,640 | 23,640 |
| LOD1 foliage triangles | 15,366 | 15,366 |
| Gameplay frame time / FPS | Not measured | Not measured |

Comparison conditions: Blender 5.2.1 Cycles, RTX 3060 OPTIX, 1200×1080,
32 samples, denoising, matching 2.2 m bus-eye camera and inherited HDRI/sun/soil.
FPS remains unmeasured because these are offline review assets. Triangle parity
does not establish equal runtime pixel cost. Outputs and the final gallery are at
`tests/artifacts/screens/ai594_branchlet_canopies/final/`.
