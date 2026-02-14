# DONE

#Problem

In the Road Debugger, junction creation currently requires manual steps or separate validation/fix actions. When roads are sliced into segments (during creation), when roads cross, or when they form a T junction, the system already has enough information to create junctions automatically at the time of cutting/splitting. This causes friction when iterating on road layouts.

# Request

Enable automatic junction creation in the Road Debugger so that junctions are created immediately when road segments are cut/split due to crossings, T junctions, or segment slicing during road creation.

Tasks:
- Identify where and when road segments are split/cut in the Road Debugger pipeline (including:
  - roads being sliced into multiple segments during creation/import
  - intersections between roads
  - T junction formation where one road terminates into another)
- Add an “Auto junction” feature (toggle) in the Road Debugger UI/settings:
  - When enabled, automatically create junction records whenever a cut/split operation produces a junction candidate.
  - When disabled, preserve current behavior (manual junction creation workflow).
- Implement automatic junction creation logic:
  - Detect junction candidates at the time of split/cut (use existing candidate id generation logic if present).
  - Create the corresponding junction entries immediately (equivalent to the existing “Create junction” fix).
  - Avoid duplicates (idempotent creation).
  - Respect existing junction suppression/hide settings if applicable.
- Ensure compatibility with both:
  - “segment slicing during creation” (single road becoming multiple segments)
  - multi-road crossings and T junctions (shared nodes)
- Verification:
  - With Auto junction enabled, drawing/splitting roads automatically yields created junctions without running separate fixes.
  - No duplicate junctions are created when re-running the builder.
  - Existing junction UI continues to work (list, hide/suppress, delete).
  - No console errors.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_145_DONE_ROADS_road_debugger_auto_create_junctions_on_segment_cuts_and_intersections_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Summary
Added an `Auto junction` toggle that auto-creates junctions from corner cuts + endpoint clusters during road rebuilds, respecting hide/suppress and avoiding duplicates.
