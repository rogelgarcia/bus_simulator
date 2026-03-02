# DONE

- Added BF2 decoration target propagation across linked faces by resolving bay options/selection through per-layer face-linking topology (including reverse slave ordering) instead of facade-local refs only.
- Added deterministic inherited target expansion for depth-owned adjacent boundary walls, so decoration refs include owner-derived neighbor edges in addition to explicitly selected bays.
- Reworked auto-corner metadata generation to evaluate per-edge connectivity by decoration signature across adjacent faces and same-face bay transitions, with deterministic ownership and per-edge corner style (`exterior`/`interior`) plus resolved effective bay refs.
- Updated BF2 scene decoration rendering to consume resolved effective bay refs, apply interior corner orientation/style behavior, and pass inward miter style for supported geometries when inset corner style is selected.
- Extended shared wall-decorator geometry factory to support inward/outward miter style for curved-ring and edge-brick geometry paths used by BF2 corner-style resolution.
- Added regression tests covering linked-face decoration propagation, owner-based inherited target expansion, and same-face inset interior corner metadata resolution.
