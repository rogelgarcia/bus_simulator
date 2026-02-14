#Problem (DONE)

BF2 facade mesh generation currently relies on assumptions that are hard to generalize:
- Faces are effectively treated as axis-aligned (X/Z) and tied to hardcoded face IDs.
- Corner behavior can be surprising because adjacent faces are coupled through shared corner points.
- Depth changes and wedge transitions can produce inconsistent geometry and artifacts.

We need a future-proof core that works when:
- Buildings are rotated in the city.
- Facade edges (faces) are not axis-aligned (and may be generalized beyond simple rectangles over time).

We also need to preserve the intended rule: faces contribute depth along their outward normal (normal-only), and corners are resolved by a deterministic but swappable strategy.

# Request

Implement the BF2 facade “core outline” computation using per-face frames and a pluggable corner resolution strategy, producing a stable top-down outline that later phases can mesh deterministically.

Tasks:
- Face frames (generalized orientation):
  - Represent each facade face with a local coordinate frame:
    - Tangent `t` along the face edge (ground plane).
    - Outward normal `n` (ground plane).
  - Ensure the system works for rotated buildings (no hardcoded axis assumptions).
- Normal-only depth contribution:
  - Ensure face depth offsets affect geometry only along `n` for that face.
  - Document and enforce how depth is measured/applied in local face coordinates.
- Core outline (top-down) construction:
  - Compute a top-down “core” outline that represents the resolved building perimeter after applying face depth effects.
  - Corners are allowed to move (corner coupling is expected), but must be deterministic and consistent.
- Pluggable corner resolution:
  - Integrate a corner resolution strategy interface (do not hardcode winner logic into the outline builder).
  - Provide a default strategy using the established winner rule (odd faces win over even faces; e.g., A/C win over B/D).
  - Ensure it is easy to swap the strategy later without rewriting outline construction.
- Determinism and debuggability:
  - Ensure the core outline is stable across runs for the same inputs.
  - Provide optional debug outputs that help validate:
    - computed face frames
    - resolved corner winners
    - resolved corner positions/conditions

## Proposal (optional implementation idea)
- Treat each face as defining an offset line/curve in its local frame, then resolve corners by combining adjacent face end conditions through the strategy.

## Quick verification
- Rotating a building does not change the correctness of face depth application (works for arbitrary orientation).
- Changing a face depth adjusts the core outline predictably via corner resolution (no nondeterministic corner flips).
- Corner winner decisions are visible via debug tooling/logging when enabled.
- A second corner strategy can be swapped in with minimal code changes (prove plugability).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_300_BUILDINGS_building_fabrication2_face_frames_and_core_outline_with_pluggable_corners_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Implemented per-face tangent/normal frames derived from the footprint loop (no axis-aligned assumptions) and applied facade depth as normal-only offsets.
- Implemented a deterministic top-down facade outline builder that uses a pluggable corner resolution strategy and computes mitered corner join points.
- Added optional corner debug output including resolved corner join positions and face frames.
