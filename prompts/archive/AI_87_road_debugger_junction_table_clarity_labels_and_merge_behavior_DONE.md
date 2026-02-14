# Problem [DONE]

In the Road Debugger, after creating a junction, the junction table UI is confusing:
- It shows a first level of “roads”, and then a second level of “roads” with a `Merge` button.
- It is not clear what each level represents (connected road approaches vs connector/movement entries vs same-road corner fixes).
- It is not clear what the `Merge` action does, when it is available, and what data/geometry changes it causes.

This confusion makes it hard to trust junction editing and prevents users from using junctions to fix broken corners or to prepare the network for driving.

# Request

Make the Road Debugger junction table self-explanatory by clarifying what each hierarchy level represents, and by making the `Merge` action explicit, contextual, and predictable.

Tasks:
- Clarify junction table hierarchy:
  - Rename/relabel the first-level entries so it’s obvious they represent **junction approaches / connected road pieces** (not “roads” generically).
  - Rename/relabel second-level entries so it’s obvious they represent **connector edges / movement options** (or equivalent), not another list of roads.
  - Ensure indentation and grouping visually matches the meaning (junction → approaches → connectors/movements).
- Explain junction concepts in the UI:
  - Add short helper text (tooltip or inline) that explains:
    - What a “junction” is (one physical node, not pairwise).
    - What an “approach” is (a road piece endpoint that participates in the junction).
    - What a “connector/movement” is (topology/allowed movement, not a separate asphalt mesh).
- Make `Merge` behavior explicit:
  - Only show `Merge` where it applies (connections between two pieces of the **same** road).
  - Rename the button to something unambiguous (e.g., “Merge into road” / “Convert to continuous road”) and add a tooltip explaining exactly what it does.
  - Ensure `Merge` clearly describes the expected outcome:
    - The connection is removed from the junction connector list for that pair.
    - The parent road becomes continuous across that breakpoint (no longer needs a junction connector for continuity).
    - Junction asphalt behavior remains correct (if the junction still has other approaches) or the junction is removed if it becomes unnecessary.
- Improve the bottom-right info panel for junction selection:
  - When a junction, approach, or connector is highlighted/selected, show a concise explanation of what it is plus the key data (IDs, endpoints, same-road vs multi-road, allowed directions).
  - If `Merge` is available, show a preview/summary of what will change if clicked.
- Consistency and robustness:
  - Ensure hover/selection highlighting matches the clarified levels (hovering an approach highlights that approach only; hovering a connector highlights only the specific connection).
  - Ensure expand/collapse state remains stable across pipeline rebuilds and undo/redo.
- Update help documentation (Road Debugger help panel/tooltips) so the same definitions appear in one place.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_87_road_debugger_junction_table_clarity_labels_and_merge_behavior_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Reworked the junction table into clear Approaches/Movements sections with explicit “Merge into road” behavior, plus approach-level hover/selection and improved info/help text.
