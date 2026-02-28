# DONE

# Problem

The wall decorator catalog needs a new cornice-style variant based on existing Cornice Block behavior, but with adjusted cover mesh rules.

# Request

Create a new decorator type named `Cornice Rounded Inverse` as a direct copy of the current Cornice Block logic and parameters, then apply the requested cover adjustments.

Tasks:
- Add a new decorator type `Cornice Rounded Inverse`.
- Implement it as a copy/paste-level clone of Cornice Block logic, preserving the same parameter set, defaults, and configuration behavior.
- For now, keep the base rendered shape equivalent to Cornice Block.
- Modify cover generation rules for this new type:
  - Add side covers on both sides.
  - Replace full front and full bottom covers with reduced covers sized to `10%` of the block-cover size.
  - Front reduced cover must start from the top.
  - Bottom reduced cover must start from the wall side.
  - Connect the front and bottom covers using a convex circular arc in side profile:
    - With wall on the left in side view, the arc must connect the bottom vertex of the front cover to the rightmost vertex of the bottom cover.
    - Arc must be circular with auto-derived radius based on endpoints.
  - Build a closed side-profile silhouette from front segment + circular arc + bottom segment, and generate the side covers following this silhouette.
  - Apply the same profile-based side cover generation to both side covers.
  - Arc segmentation rule based on block size in centimeters:
    - `5cm` block size -> `3` segments
    - `10cm` block size -> `5` segments
    - `15cm` block size -> `8` segments
    - Use `ceil(blockSizeCm / 2)` for generalization.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_445_BUILDINGS_wall_decorator_add_cornice_rounded_inverse_as_cornice_block_clone_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_445_BUILDINGS_wall_decorator_add_cornice_rounded_inverse_as_cornice_block_clone_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Change Summary
- Added new wall decorator type `cornice_rounded_inverse` (`Cornice Rounded Inverse`) in the cornice catalog section.
- Cloned cornice-block placement/config behavior (same properties, defaults, preset groups, and spacing/snap logic) for the new type.
- Added new mesh kind `cornice_rounded_inverse_block` and renderer path with reduced front/bottom covers plus circular side-profile generation.
- Implemented profile arc segmentation using `ceil(blockSizeCm / 2)` and applied the same closed side-profile caps on both sides.
- Added/updated catalog and renderer tests and updated the wall-decoration debugger spec with the new decorator contract.
