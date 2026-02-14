#Problem (DONE)

The “tree 04” desktop asset is imported/placed with the wrong orientation: it appears laid down. It likely needs an X-axis rotation of 90° (direction/sign to be verified) so the trunk is upright.

This kind of issue has been solved for other trees before (either via an import-time transform, a runtime parameter/override, or a preprocessing step), but the current pipeline for tree 04 does not apply the needed correction.

# Request

Investigate and fix the orientation of the **desktop tree 04** asset so it renders upright in-game, using an offline (outside-the-game) investigation workflow and tools if needed.

Tasks:
- Identify where “desktop tree 04” is sourced and how it is loaded/instanced in the game (asset path, loader, catalog entry, generator).
- Offline investigation:
  - Inspect the tree 04 mesh file(s) outside the game to determine the correct X-axis rotation (positive or negative 90°) required to make it upright.
  - Determine whether the mesh’s local axes/up vector match the engine’s conventions.
  - Confirm whether the issue is:
    - The mesh is authored in a different up-axis convention, or
    - The loader/import settings are missing a conversion, or
    - A runtime placement transform is incorrect/missing for this specific tree.
- Implement the fix in the most appropriate place (choose one, keep it consistent with how other trees were fixed previously):
  - Prefer a durable, content-pipeline style fix (e.g., per-asset transform metadata / catalog override) if that is the established pattern.
  - If the repo already has a parameter/transform mechanism for trees, use it (do not hardcode one-off hacks in unrelated code paths).
  - If an offline transform bake is the established pattern, apply it and store the corrected mesh in the proper assets location.
- Tooling:
  - If there isn’t already a good workflow for verifying mesh orientation, add a small tool under `tools/` to inspect/preview mesh orientation/axes and validate the needed rotation.
  - Reuse existing tooling/patterns from previous tree fixes if available.
- Validation:
  - Confirm tree 04 is upright in the main game scene(s) where trees are visible.
  - Confirm no other trees regress (especially other desktop trees).
  - Confirm bounding boxes, shadow direction, and any wind animation (if present) still behave correctly.

Nice to have:
- Add a documented “mesh import troubleshooting” note for common up-axis/orientation issues and how to fix them in this project.
- Add a quick debug toggle or console print showing per-tree asset transform overrides used at runtime (helps future fixes).

## Quick verification
- Load a scene with tree 04 and compare to other trees:
  - Tree 04 trunk is upright (not laid down) and sits correctly on the ground.
- Rotate/orbit camera and check:
  - Lighting and shadows look correct; no unexpected pivot offset.
- If a tool was added:
  - Confirm the tool can reproduce the issue and show the corrected rotation.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_220_MESHES_fix_tree_04_desktop_orientation_x_rotation_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Fixed desktop tree 04 orientation by applying the same -90° X rotation used by other desktop trees.
- Added a Node unit test to prevent the tree 04 rotation from regressing.
