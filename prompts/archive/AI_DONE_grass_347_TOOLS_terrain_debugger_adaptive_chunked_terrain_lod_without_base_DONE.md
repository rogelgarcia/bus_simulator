# DONE

#Problem

The current terrain flow depends on dense static geometry and displacement experiments that did not produce the expected visual/performance tradeoff. Terrain should support near-camera detail without keeping a heavy flat base mesh across the full map.

# Request

Implement a unified adaptive terrain LOD system in the Terrain Debugger `Biome Tiling` tab that uses chunked/ringed geometry around the camera and does not require a separate base terrain mesh in normal rendering.

Tasks:
- Add a camera-centered adaptive terrain LOD workflow that increases geometry detail near the camera and reduces detail with distance.
- Use one rendering path for both finite and infinite terrain modes, with finite mode constrained by map bounds and infinite mode continuously extending terrain coverage.
- Ensure terrain continuity across chunk and LOD boundaries so there are no visible cracks during movement or camera rotation.
- Keep geometry updates visually stable while moving so triangle layout does not shimmer or jump unnecessarily.
- Support deterministic terrain variation in world space, including optional macro variation so distant areas can show broad hills instead of remaining visually flat.
- Separate this new system from the existing displacement overlay naming and controls so both features are clearly distinguishable in UI and diagnostics.
- Expose only a minimal set of practical debug controls for validating behavior, keeping the panel compact and avoiding many low-level tuning knobs.
- Add diagnostics focused on adaptive terrain runtime state, including visible chunks, active LOD distribution, triangle/vertex counts, and rebuild cadence.
- Ensure terrain is only rebuilt according to explicit rebuild actions or selected auto-update cadence, without implicit full-map generation when enabling toggles.
- Preserve compatibility with existing terrain materials and map anchoring so texture placement remains spatially stable.
- Prefer smart defaults and preset-driven behavior over many numeric controls; only expose advanced controls when strictly required for debugging.
- Include a single `Wave Strength` control for terrain vertical variation while keeping all other wave shaping parameters internal.
- Enforce wave safety limits with smart defaults and bounded overrides: default absolute terrain wave height limit is `2.0m` and default height delta between neighboring tiles is `0.5m`, while allowing optional increases up to hard caps of `10.0m` absolute height and `2.0m` neighbor delta.

## Strategy details discussed

- Treat terrain as multiple side-by-side chunk meshes managed as concentric LOD rings around the camera (near/mid/far), not a single monolithic mesh.
- Keep this as the standard terrain path (adaptive chunks) in both finite and infinite modes, avoiding a separate always-on base terrain render path.
- In finite mode, clip chunk creation to map bounds; in infinite mode, recycle chunks around the camera so coverage continues without unbounded mesh growth.
- Keep ring/chunk topology stable while moving by using world-grid-aligned placement and controlled update thresholds, minimizing triangle re-layout churn.
- Solve LOD edge transitions with a seam strategy appropriate for differing neighbor resolutions (for example stitching and/or seam-hiding fallback), so no visible cracks at boundaries.
- Use deterministic world-space terrain variation (seeded) so adjacent chunks sample matching border heights and remain continuous.
- Preserve macro terrain character at distance (broad hills) with low-frequency variation on far rings, while keeping high-frequency detail primarily near the camera.
- Keep material sampling spatially consistent in world space so albedo/normal/roughness/displacement-related maps stay aligned and do not drift or rotate inconsistently.
- Keep displacement experimentation clearly separated from this system in UI naming and diagnostics (for example adaptive surface LOD vs displacement overlay terminology).
- Apply `Wave Strength` as a bounded multiplier over deterministic world-space variation, using default safety limits of `2.0m` total height range and `0.5m` per-neighbor transition, with optional limit increases capped at `10.0m` and `2.0m` respectively.

## Suggested debug and diagnostics scope

- Keep the exposed debug controls minimal and focused on verification:
  - enable/disable adaptive terrain LOD
  - wireframe
  - render distance
  - wave strength
  - one compact debug visualization toggle (showing coverage/LOD state)
  - manual rebuild + auto-update cadence combo (default no auto updates)
- Avoid exposing many ring/chunk internals by default; rely on internal smart defaults for ring counts, chunk sizing, seam strategy, and update thresholds.
- Use preset-level or intent-level controls where possible instead of raw per-parameter controls.
- Diagnostics should report adaptive terrain health and cost, including: visible chunk count, LOD/ring distribution, seam/transition state, vertex/triangle totals, and rebuild timing/cadence.
- Keep diagnostics terminology explicit to avoid confusion between adaptive terrain LOD state and displacement validation state.

## Acceptance intent

- Terrain detail should be concentrated near the camera with materially lower far-distance geometry cost.
- Camera movement and rotation should not cause distracting crack artifacts or unstable mesh flicker patterns.
- Finite and infinite terrain should behave consistently under the same adaptive chunk/ring logic, differing only by bounds behavior.
- Feature toggles should not trigger hidden implicit terrain generation outside the explicit rebuild/update policy.
- Debugger controls and diagnostics should make LOD behavior explainable during iteration.
- The UI should remain minimal, with smart defaults handling most behavior and only essential debug controls exposed.
- Wave variation must remain controlled and believable under all settings, defaulting to total vertical amplitude cap `2.0m` and neighboring tile step cap `0.5m`, while never exceeding maximum allowed caps of `10.0m` and `2.0m`.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_347_TOOLS_terrain_debugger_adaptive_chunked_terrain_lod_without_base_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
