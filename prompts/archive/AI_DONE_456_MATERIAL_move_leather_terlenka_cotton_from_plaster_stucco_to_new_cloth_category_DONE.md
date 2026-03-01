DONE

# Problem

`Leather`, `Terlenka`, and `Cotton` PBR textures were added under `Plaster / Stucco`, but they belong to a distinct material family and should be categorized separately.

# Request

Create a new material category `Cloth` and move/reclassify `Leather`, `Terlenka`, and `Cotton` PBR entries from `Plaster / Stucco` into that new category.

Tasks:
- Add a new material catalog category: `Cloth`.
- Reassign `Leather`, `Terlenka`, and `Cotton` PBR entries to `Cloth`.
- Remove those entries from `Plaster / Stucco` category listing.
- Keep asset references and metadata intact (no broken links/previews/material loading).
- Ensure the material picker/category UI reflects the new taxonomy consistently.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_456_MATERIAL_move_leather_terlenka_cotton_from_plaster_stucco_to_new_cloth_category_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_456_MATERIAL_move_leather_terlenka_cotton_from_plaster_stucco_to_new_cloth_category_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Changes
- Added a new PBR material class/category `cloth` to the runtime PBR material catalog metadata and class ordering.
- Reclassified `Leather White`, `Terlenka`, and `Waffle Pique Cotton` material config entries from `plaster_stucco` to `cloth`.
- Reclassified the corresponding material correction config entries to `cloth` to keep catalog and correction metadata aligned.
- Updated the PBR material catalog specification class list to include `cloth` for taxonomy consistency.
- Verified building material sections now show the three materials under `Cloth` and no longer under `Plaster / Stucco`.
