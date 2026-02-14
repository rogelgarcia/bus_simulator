#Problem [DONE]

In Road Debugger, lane counts per direction are a core part of the road schema (`lanesF` and `lanesB`, asymmetric allowed). However:

- While creating a new road, there is currently no UI to define `lanesF` and `lanesB`.
- In the roads table, there is currently no way to edit/update `lanesF` and `lanesB` after the road is created.

This blocks testing of asymmetric roads and makes the road debugger incomplete for lane-width/edge computations.

# Request

Add UI controls to set and edit the lane counts per direction (`lanesF`, `lanesB`) in Road Debugger, including during creation and after creation in the table/details view.

Tasks:
- Road creation flow:
  - When starting a new road draft, provide controls to set `lanesF` and `lanesB` before placing points.
  - Allow adjusting `lanesF` and `lanesB` while the road is still being drafted (changes should immediately update preview geometry/lines if applicable).
  - Enforce valid ranges (1..5 per direction).
  - Use clear labels that match the forward definition (Pi → Pi+1 is forward) and right-hand driving.
- Road editing flow:
  - In the roads table (or an associated details panel), provide per-road controls to update `lanesF` and `lanesB`.
  - Updates should recompute derived geometry deterministically (pipeline rerun) and update rendering immediately.
  - Ensure edit controls do not require deleting/recreating the road.
- UX requirements:
  - Make it easy to understand which side is `lanesF` vs `lanesB` (include short helper text or tooltip).
  - Ensure hover/selection sync continues to work while interacting with the controls.
- State/history:
  - Integrate lane-count changes with undo/redo (Ctrl+Z) and export/import.
- Validation/regression:
  - Add a quick manual verification checklist: create a road with `lanesF=1, lanesB=5` and confirm the divider centerline stays fixed while the asphalt becomes asymmetric.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_74_road_debugger_add_lanesF_lanesB_controls_create_and_edit_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)
