# Problem [DONE]

Road Debugger currently supports authoring multi-segment roads and trimming overlaps, but there is no reliable way to author/resolve **junctions**. As a result:
- Intersections between different roads don’t generate a unified “junction asphalt” surface.
- Multi-segment roads can have “broken corners” (gaps or messy slivers) when trimming/splitting interacts with corners, and there is no tool to explicitly resolve those corners into a clean patch.

# Request

Implement junction authoring in the Road Debugger: a workflow to create and manage junctions that (1) generates a single merged asphalt surface per junction and (2) can be used to fix broken corners on multi-segment roads by turning problematic corner regions into junction patches when appropriate.

Tasks:
- Add a Road Debugger “Junction Tool” mode that lets the user create junctions interactively in the viewport:
  - Show clear, hoverable “connection candidates” at road piece endpoints (centerline endpoints) and at eligible corner points where a corner patch may be needed.
  - Allow click-to-select multiple candidates and confirm “Create Junction”.
  - Allow canceling/clearing the pending selection without changing geometry.
- Add a left-panel `Junctions` section (table/list) that integrates with existing hover/selection sync:
  - Each junction row can be selected/hovered to highlight its area in the viewport.
  - Expanding a junction shows its connected endpoints (and any connector edges/movements if present).
  - Provide per-junction actions: delete junction, toggle visibility of junction asphalt mesh, and show debug info.
- Junction behavior requirements:
  - A junction represents **one physical intersection/corner region** (e.g., a T-junction is one junction, not multiple pairwise junctions).
  - Junctions can connect endpoints from:
    - multiple different roads (intersection),
    - or the same road (corner/break repair).
  - Junction creation must be deterministic and stable across rebuilds/export/import (stable IDs, predictable ordering).
- Asphalt geometry requirements:
  - For each junction, generate **one merged junction asphalt surface mesh** that stitches incoming road asphalt edges in a consistent clockwise order.
  - Incoming road piece asphalt meshes must terminate cleanly at the junction boundary so the junction mesh fills the gap without overlaps.
  - The junction asphalt mesh must not depend on per-movement connector meshes (movements are topology for future driving, not separate asphalt patches).
- Fixing broken corners on multi-segment roads:
  - Provide a workflow to resolve a problematic corner by creating a junction at/near the corner so the resulting corner surface is generated as a junction asphalt patch.
  - Ensure this does not require the user to manually micro-adjust trimming; the junction should “own” the corner surface once created.
  - Ensure the UI makes it clear whether the junction is “same-road corner” or “multi-road intersection”.
- Editing/validation:
  - Junctions update live when connected road endpoints move (point dragging), while preserving the junction identity.
  - Junction creation/removal integrates with undo/redo and export/import.
  - Add debug toggles for junction visualization (junction boundary, stitched edge order, connected endpoint markers).
- UX/helper text:
  - Add a concise help panel section explaining: what a junction is, why it’s one node (not pairwise), and how junction asphalt differs from connector movements for driving.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_82_road_debugger_manual_junction_authoring_and_corner_asphalt_fixes_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added a manual Junction Tool with per-junction controls, plus corner cut-based junction asphalt patches and schema/export/import/undo persistence.
