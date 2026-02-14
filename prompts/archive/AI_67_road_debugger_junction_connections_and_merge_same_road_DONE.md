# Problem [DONE]

Road Debugger can author multiple disconnected road pieces (including pieces created by trimming/splitting to resolve crossings). There is currently no “connection” system to:
- represent intersection/junction topology in a deterministic way,
- generate a single, merged junction mesh for rendering,
- represent per-movement connectivity for future driving,
- and optionally merge “same-road” connections back into the parent road for continuity.

This leads to gaps where roads should meet (T / 4-way / Y), unclear turn connectivity, and no way to consolidate same-road breaks once the user decides they should be continuous.

# Request

Add a Road Debugger connections system based on **junctions + connector edges** (Option A): roads remain authored as polylines/segments, while connections between road pieces live under a junction list. Junctions generate a single merged asphalt mesh per junction for rendering, while connector edges define centerline connectivity that can be used for future vehicle driving.

Tasks:
- Add/extend the Road Debugger data schema to include a deterministic `junctions` collection with stable IDs.
- Define a `connector edge` concept owned by a junction:
  - Connects the **centerline endpoint** of two road pieces.
  - Stores metadata needed for future driving (directionality, allowed movements) without forcing separate render meshes per movement.
- Auto-detect junction candidates and connector edges:
  - Detect when road piece endpoints are close enough to be considered connectable.
  - Support multi-road junctions (e.g., 4-way) by clustering endpoints into a single junction.
  - Avoid creating multiple junction records for the same physical location (e.g., a T-junction is 1 junction with 3 approaches, not 3 pairwise junctions).
  - Ensure the generation is deterministic (same inputs => same junction IDs/edge IDs and same output geometry).
- Rendering/geometry rules:
  - For any junction with 2+ connected road pieces, generate **one junction asphalt surface mesh** that stitches incoming road asphalt edges in a consistent clockwise ordering.
  - Do not render separate asphalt meshes per connector movement; the junction surface is the merged render result.
  - Keep the existing road piece asphalt meshes trimmed so they stop at the junction boundary and stitch seamlessly.
- Driving/topology rules (future-facing, but define now):
  - Allow a junction to define multiple possible “movements” (turn combinations) without requiring separate asphalt patches per movement.
  - Make it possible to later expand junction connector edges into per-lane/per-movement directed edges (right-hand driving) while keeping the junction render mesh unchanged.
  - Treat connector edges as movement/topology definitions (e.g., within one T-junction: A↔B, A↔C, B↔C can exist as movement options) while rendering still produces one junction asphalt mesh.
- Same-road connector edges behavior (special case):
  - If a connector edge connects two pieces that originate from the **same road**, still keep it in the `junctions` list initially (treat it like any other connection).
  - Add a UI control on that connector entry (in the connections/junctions table) to **merge this connector into the primary road**.
  - The “merge into road” option must:
    - Be available **only** when both endpoints belong to the same road.
    - Convert the representation so the road becomes continuous again (no connector edge needed for that continuity).
    - Preserve determinism and stable IDs as much as possible (avoid breaking unrelated road/junction identities).
    - Integrate with undo/redo and export/import.
- UI/UX:
  - Add a left-panel table section for `Junctions` and their `Connector edges`.
  - Hover/selection sync between viewport and table:
    - Hovering a junction/connector highlights the affected road pieces and the junction area.
    - Selecting a junction/connector selects it in both the viewport and the table.
  - Provide a clear visualization for junctions and connector endpoints (centerline endpoints) distinct from existing road point markers.
  - Add a bottom-right info panel output for the currently highlighted/selected junction/connector (IDs, connected road IDs, endpoint positions, distances, angles, etc.).
- Pipeline/debug tooling:
  - Add pipeline-step toggles to visualize intermediate artifacts for junction/connector generation (endpoint clusters, junction boundary, stitched edge order, connector endpoints, and any rejected/invalid candidate connections).
  - Keep all connection generation in the deterministic Road Debugger pipeline module so the scene/UI only consumes outputs.
- Export/import:
  - Update Road Debugger export/import JSON to include junctions + connector edges and any “merged connector into road” state.
  - Ensure a round-trip export/import produces the same IDs and geometry.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_67_road_debugger_junction_connections_and_merge_same_road_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added deterministic Road Debugger junction+connector generation (with junction asphalt surface), a Junctions/Connectors UI section with viewport sync and merge-into-road support, plus export/import/undo persistence and tests.
