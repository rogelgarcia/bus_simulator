# DONE

#Problem

Terrain LOD behavior needs a stable finite-map baseline with minimal controls and clear debug visibility.

# Request

Implement a finite-map terrain LOD mode with fixed bounds, full upfront tile rendering, and a minimal debugger widget set.

Tasks (checkbox tracking for iterative reuse):
- [x] Finite map mode: define terrain as a bounded grid of tiles with explicit map limits.
- [x] Render strategy: draw all tiles in the finite map upfront (no incremental tile spawning for this phase).
- [x] Widgets: add only essential controls, specifically terrain LOD on/off, rebuild terrain button, wireframe debug, and LOD markers debug.
- [x] Detail presets: provide exactly three terrain detail presets named low, medium, and high.
- [x] Tile variation: support visible per-tile variation, but keep it deterministic from world seed and tile position so results are stable across rebuilds.
- [x] Tile quad density levels: use 5 fixed levels with near-to-far mapping `256` (near), `64`, `16`, `4`, and `1`.
- [x] Terrain LOD debug section: report tile counts per LOD level (`256`, `64`, `16`, `4`, `1`) using stable LOD band widths, and report total quads currently rendered.
- [x] Diagnostics formatting update: in the Terrain LOD section show only Terrain LOD data, specifically on/off status, tile counts for each LOD detail (`256`, `64`, `16`, `4`, `1`), and total quads; present values in a table with one column per LOD.
- [x] In `Config`, add a performance toggle for terrain `Fragment Shader` path (enabled by default, independently disableable for profiling).
- [x] In `Config`, add performance toggles for `Shadows` and `High-DPI/Pixel Ratio` scaling (both enabled by default, independently disableable for profiling).
- [x] Add LOD panel shader diagnostics: show estimated terrain fragment sampler usage and GPU max texture units (for example, `samplers used` vs `max textures`).
- [x] Add a global top-bar performance output visible in every debugger screen/tab that reports current GPU frame usage time.
- [x] In `Diagnostics`, add a dedicated `GPU` section: estimate fragment-shader texture/sampler usage, and include richer GPU diagnostics when available (for example `max fragment texture units`, `sampler headroom`, `WebGL version`, and current `GPU frame time`).
- [x] Expand shader diagnostics to show fragment-path breakdown when `Fragment Shader` is enabled: explicitly list which paths are active (`Albedo biome blend`, `Distance blend`, `Anti-tiling`, `Macro variation`, `Humidity edge noise`, `Surface Normal/ORM`, `Displacement source sampling`) so users can see what still runs when `Surface (Normal+ORM)` is off.
- [x] In `Diagnostics > GPU`, add an estimated per-path sampler contribution table (one row per active fragment path) and show `total estimated samplers` vs `max fragment texture units`, so the `Surface off` vs `Shader off` cost gap is explainable.
- [x] Reorganize the biome tiling UI with two top sections: `Texture` and `Focus`.
- [x] In `Texture`, show a single row `PBR Texture` with the texture picker.
- [x] In `Focus`, provide camera focus buttons `Overview`, `Bus`, `Focus Eye`, and `Flyover`, plus `Calibration Rig Debug` toggle and `Flyover debug` button.
- [x] In `Focus`, add a hover visual effect for the focus buttons (`Overview`, `Bus`, `Focus Eye`, `Flyover`) so interactive affordance is clearer.
- [x] In `Focus`, make `Overview`, `Bus High`, and `Focus Eye` buttons reflect active camera pose: clicking a focus button sets it active; if camera/target changes away from that exact preset pose for any reason, the button becomes inactive.
- [x] In `Focus`, move the `Focus Eye` camera preset by `-16m` on the world `Z` axis from its current pose.
- [x] Add a `Sun Orbit` animation mode (rename from "sun flyover"): perform one full sky rotation with a very strong ease-in-out profile (very slow start, very fast middle, very slow end). Group `Sun Orbit` controls with `Flyover debug` and provide a dedicated `Run` button there.
- [x] For `Sun Orbit Run`, reduce ease-in-out strength so acceleration/deceleration is smoother and less extreme than the current very-strong curve.
- [x] Add tabs for `Config`, `Dynamic Size`, `Variation`, `LOD`, `Displacement`, and `Diagnostics`.
- [x] In Terrain LOD, merge enable/disable into the `Detail Preset` button group using `Off`, `Low`, `Medium`, and `High` options (no separate on/off toggle for this control).
- [x] In `Detail Preset`, keep `Off` as the first button and remove any leading blank/empty button that appears before it.
- [x] In Terrain LOD controls, add rebuild cadence with options: `No Auto Rebuild` and `Every X Seconds` (user-configurable interval in seconds).
- [x] In `Config`, include all on/off toggles that exist in other tabs as linked mirrors (same state/source of truth).
- [x] Keep `Heatmap Wireframe` as a single control available only in `Config` (remove duplicates from other tabs).
- [x] Normalize button visuals in this screen so they appear neutral by default (no persistent checked-style appearance); if style is global/shared, update the shared CSS accordingly.
- [x] When `Heatmap Wireframe` and `LOD Markers` are both enabled, render LOD markers aligned to the current active mesh division/subdivision (not stale or previous rebuild partitioning).
- [x] LOD markers visibility fallback: show `LOD Markers` even when LOD is disabled or terrain has not been generated yet; in that case, compute/display marker values from quads-per-tile for the current configured division.
- [x] Fix `LOD Markers` fallback in non-LOD/uniform mode: do not show `1` by default; compute actual quads-per-tile from the active non-LOD geometry division and display that value on every marker.
- [x] Align biome-tiling tab names with their corresponding content names, using identical labels (for example, rename both tab and content to `Distance Blend` instead of mixed naming).
- [x] Apply consistent label alignment for all biome-tiling tabs/content pairs so each tab uses the same wording as its widgets/section title.
- [x] Rename biome-tiling tab `Variation` to `Anti-tiling`, and keep tab/content labels aligned to the same wording.
- [x] In `Config`, visually space on/off controls into three unlabeled groups: feature toggles (from feature tabs), visual toggles, and performance toggles.
- [x] Remove nested retractable panels inside biome-tiling subtabs; for each subtab render widgets directly in the tab body (no extra collapsible section layer).
- [x] In `LOD`, replace auto-rebuild controls with a button group using exactly: `Off`, `1F`, `2F`, `8F`, `1S`.
- [x] When `Detail Preset` changes (`Off`, `Low`, `Medium`, `High`), trigger a terrain rebuild immediately (no extra click required).
- [x] Remove the manual `Rebuild Terrain` button from `LOD` (auto-rebuild controls + preset changes are the rebuild path).
- [x] In `Config`, move `Capture Camera Center` into the same visual-toggle group as `Heatmap Wireframe`, `Show LOD Overlay`, and `LOD Markers`.
- [x] In `Config`, toggling `Enable Anti-tiling` must also toggle `Enable Macro Variation` to the same state.
- [x] Fix Diagnostics update flow so Terrain LOD details always refresh correctly (on/off, per-LOD tile counts, and total quads) after rebuilds and during auto-rebuild cadence.
- [x] Fix `Detail Preset` button group interaction so `Medium` is clickable/selectable and updates state like `Off`, `Low`, and `High`.
- [x] In `LOD`, render `Detail Preset` as the shared segmented button-group style (single combined rectangle for the whole group, not standalone button pills).
- [x] If not already done, render `Auto Rebuild` as the same shared segmented button-group style (single combined rectangle for all options).
- [x] In `Config`, under `Fragment Shader`, add two tabbed sub-items: `Albedo` and `Surface (Normal+ORM)`.
- [x] In `Config`, under `Fragment Shader`, add left padding/indentation to `Albedo` and `Surface (Normal+ORM)` so they read visually as child controls.
- [x] In `Config`, under `Fragment Shader`, use simple `On/Off` toggle controls for `Albedo` and `Surface (Normal+ORM)` (keep them as child controls with the same source of truth).
- [x] In `Config`, remove `Show LOD Overlay` (do not mirror this toggle in Config; keep it only where it is controlled in `LOD`).
- [x] In `Config`, add an `Enable LOD` mirror toggle (linked to the same source of truth as `Detail Preset` on/off state).
- [x] Flyover tuning: start path at `30m` camera height; move keyframes 2 and 3 farther from each other/along path; reduce overall flyover speed by `40%`; set keyframe 2 height between keyframe 1 and keyframe 3 heights.
- [x] Flyover timing/easing update: slow down flyover by `50%` (keep return segment at current speed), and add an ease-in when reaching the last keyframe.
- [x] Default Terrain `LOD` to `Off` on startup/load (initial preset state off until user enables it).
- [x] In `Config`, under `Fragment Shader`, use a single `Biome` on/off child toggle that controls all biome-related shader paths together; when off, disable biome-mask decode/sampling and all biome-dependent fragment contributions (including albedo biome path, humidity/edge-noise biome weighting, and biome normal/ORM blending).
- [x] In `Config`, under `Fragment Shader`, add a separate `PBR Lighting` (or `Surface Shading`) on/off child toggle for full lighting/shading cost, while keeping `Surface (Normal+ORM)` as a distinct detail toggle (do not rename `Surface (Normal+ORM)` to `PBR`).
- [x] Define and implement explicit fragment-toggle precedence rules (effective runtime behavior + diagnostics reporting) for `Fragment Shader`, `PBR Lighting`, `Biome`, `Albedo`, and `Surface (Normal+ORM)` so toggles can be changed in any order without ambiguous states.

## On completion
- For each iteration, only implement tasks that are still unchecked (`[ ]`).
- After implementing a task, mark it as checked (`[x]`) in this file.
- Keep this file active for multiple iterations; do not rename it to a `DONE` filename.
- This iterative checkbox rule overrides the standard project prompt completion rename rule for this specific file.
- Keep the file in `prompts/` (do not move to `prompts/archive/` unless explicitly requested).
