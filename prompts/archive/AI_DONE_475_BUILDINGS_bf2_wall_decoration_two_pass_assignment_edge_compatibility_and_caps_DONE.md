DONE
# Problem

In Building Fabrication 2 wall decorations, placement over adjacent bays/walls is still inconsistent due to ordering-dependent logic. Decorations can be duplicated, edge/corner decisions can be wrong, and cap generation may not align with the final contiguous decoration span.

# Request

Rework wall-decoration placement resolution to use deterministic staged processing so compatibility across adjacent bays is evaluated before geometry edge/cap decisions.

Tasks:
- Build a first pass that resolves which bays/wall segments will receive a decoration and assigns a stable decoration configuration identifier (full config identity, not only type).
- Build a second pass that resolves per-edge shape mode (edge/corner vs flat) by checking adjacent resolved decorations and compatibility at the same placement zone.
- Render caps from the resolved edge decisions and resolved contiguous width span (wall width plus compatible left/right extensions), reusing existing wall-decoration debugger mesh logic instead of duplicating a separate renderer.
- Ensure split-by-opening behavior uses independent drawable areas per valid segment, and each segment applies edge/cap logic based on its own local adjacency.
- Add tests validating resolved decoration count and face count for adjacency/corner/opening cases, including regression coverage for duplicate floating decorations.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_475_BUILDINGS_bf2_wall_decoration_two_pass_assignment_edge_compatibility_and_caps_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_475_BUILDINGS_bf2_wall_decoration_two_pass_assignment_edge_compatibility_and_caps_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
