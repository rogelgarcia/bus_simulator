# Exterior branchlet revision

Use `node tools/bake.mjs --target vegetation/branchlets --set vegetation/branchlets:phase=atlas`.
Phases are `atlas`, `build`, `compress`, `render`, `gallery`, `validate`; execute
in that order. `models=species/mature_01` bounds a proof; `lod=0`, `lod=1` or
`lod=both` selects levels. Atlas authoring is shared by three mature variants.

This explicit review leaf uses the shared Blender configuration and authenticated
inputs. It does not belong to the production parent and rejects publication.
AI591 and AI593 are immutable inputs. AI588 supplies original photographic leaf
shells and stem directions. The installed game atlas is an arrangement reference
only; no licensed pixels enter the new textures.

Only the three exterior slots of each PBR atlas are replaced. Interior planes
and accepted wood are preserved. Exterior card orientations follow reference
shoots. Original geometry is patched into preserved GLBs so wood accessors and
materials remain identical. Triangle counts are unchanged in both LODs.
Generated Blender sources, maps, reports and full-tree comparisons belong under
`tests/artifacts/screens/ai594_branchlet_canopies/final/`.
