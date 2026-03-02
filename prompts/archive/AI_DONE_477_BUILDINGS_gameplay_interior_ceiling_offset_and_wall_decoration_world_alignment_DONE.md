# DONE

In gameplay building rendering, interior ceiling meshes are appearing outside the building with an offset, indicating unstable local/world transform handling for interior shell placement.

Wall decorations are also missing in gameplay (or rendered in the wrong position), indicating the gameplay placement path is not using consistent world-space alignment and/or bay/face anchoring compared to BF2/debugger behavior.

# Request

Stabilize gameplay building mesh placement so interior ceilings are always generated and positioned correctly inside the building envelope, and ensure wall decorations render in gameplay with correct world alignment and expected ownership behavior.

Tasks:
- Fix interior shell ceiling placement logic so it remains inside the intended interior volume for all floors, independent of footprint origin, transforms, and layer offsets.
- Ensure gameplay wall decoration placement uses stable world-space anchoring and the same wall/bay reference basis used by the building geometry (no center snap drift, no missing placements).
- Align gameplay decoration positioning behavior with BF2/debugger decorator logic and ownership assumptions (including continuation/corner ownership where applicable), without introducing duplicate/floating instances.
- Add regression tests for:
  - interior ceiling containment (ceiling stays within building interior bounds),
  - gameplay decoration presence/count on configured decorated faces,
  - gameplay decoration world-position correctness against wall span references.
- Validate at least one real exported building config path used in gameplay so the fix covers runtime catalog usage and not only isolated scene/debug cases.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_477_BUILDINGS_gameplay_interior_ceiling_offset_and_wall_decoration_world_alignment_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_477_BUILDINGS_gameplay_interior_ceiling_offset_and_wall_decoration_world_alignment_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed changes
- Fixed interior floor/ceiling generation to use local-loop anchoring and corrected ceiling winding so off-origin buildings no longer mirror/offset interior ceilings outside the shell.
- Propagated `wallDecorations` through gameplay building data flow (`CityMap` import/export and `City` fabrication call) so decoration configs from catalog entries reach runtime rendering.
- Added gameplay wall-decoration mesh generation in `BuildingFabricationGenerator` with stable bay-segment anchoring, per-edge compatibility/corner handling, and material resolution against active wall material state.
- Added regression tests for off-origin interior ceiling containment, gameplay decoration presence/world anchoring on targeted bays, config-path validation with real `beige_1` exported config, and `CityMap` wall-decoration roundtrip preservation.
