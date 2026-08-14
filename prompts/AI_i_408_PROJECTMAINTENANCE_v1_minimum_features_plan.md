# Problem

Need a concrete minimum-feature plan to finalize a V1 release of the game.

# Request

Define and maintain a V1-minimum scope and implementation plan, then execute it in controlled implementation passes when requested.

## Requirements Checklist
- [ ] Phase 0: V1 scope lock and release criteria.
- [ ] Phase 1: Finalize shader pipeline subsystem (foundation).
- [ ] Phase 2: Finalize noise subsystem (foundation for wear/texture).
- [ ] Phase 3: Finalize curb system.
- [ ] Phase 4: Finalize sidewalk system.
- [ ] Phase 5: Finalize city props system.
- [ ] Phase 6: Finalize city hero landmarks.
- [ ] Phase 7: Finalize building fabrication for V1 gameplay.
- [ ] Phase 8: Finalize asphalt wear.
- [ ] Phase 9: Finalize physics and bus handling for gameplay realism.
- [ ] Phase 10: Finalize grass system for scene volume.
- [ ] Phase 11: Optimization pass (LOD, occlusion, and runtime performance).
- [ ] Phase 12: V1 hardening and release gate.

## Phase 1 Draft Requirements (Shader/Rendering Pipeline)
- [ ] Establish a global rendering pipeline with a global shader pipeline architecture.
- [ ] Define clear pass orchestration so core visual systems use the same pipeline path.
- [ ] Use the existing lab screen as the main rendering validation lab with scenario presets.
- [ ] Add scenario presets to the lab workflow for fast, repeatable visual comparisons.
- [ ] Add a lighting tuning workflow for fast iteration and calibration.
- [ ] Add a city horizon/backdrop solution so the map does not end into visible empty space.
- [ ] Add a sea-side fog curtain with ocean-plane blending to hide far-edge seams.

## Phase 2 Draft Requirements (Noise Subsystem)
- [ ] Improve the existing noise system usability; current workflows are hard to use for production.
- [ ] Simplify noise authoring/tuning flow so curb, sidewalk, building wear, and asphalt wear teams can use it consistently.
- [ ] Provide practical defaults/presets so useful results are reachable without excessive manual parameter tweaking.
- [ ] Reduce friction in connecting noise outputs to texture/wear/normal pipelines.

## Phase 3 Draft Requirements (Curb)
- [ ] Curb cross-section is not square-only: add a beveled/rounded top edge for a less boxy silhouette.
- [ ] Curb side profile is not vertical-only: introduce a visible angle/slope on the curb face.
- [ ] Add a bevel/transition detail at the curb-to-asphalt junction.
- [ ] Add a lowered cement shoulder at asphalt corners before the asphalt layer begins.
- [ ] Add curb block divisions/joints so the curb reads as segmented blocks instead of one continuous slab.
- [ ] Add curb texturing detail so the surface does not read as flat.
- [ ] Use the noise subsystem to generate normal-map detail for curb stretch/groove micro-variation.

## Phase 4 Draft Requirements (Sidewalk)
- [ ] Use noise to drive sidewalk texture breakup so sidewalk surfaces do not look uniform or flat.
- [ ] Add sidewalk joints/divisions so slabs are visually segmented.
- [ ] Use noise-driven wear for sidewalks (aging/distress variation), not a clean uniform finish.
- [ ] Use noise to generate cement-like stretched groove normal-pattern detail for sidewalk surfaces.

## Phase 5 Draft Requirements (City Props)
- [ ] Add bus stop props suitable for street placement.
- [ ] Add garbage bin props.
- [ ] Add more sign variants for city navigation/traffic context.
- [ ] Add light pole props.
- [ ] Upgrade traffic signal mesh quality for V1.
- [ ] Add traffic signal idle animation behavior (light cycle and subtle emissive pulse).
- [ ] Add a first-pass sea-side pier as the minimum coastal anchor solution.
- [ ] Add distant skyline ring elements for map-edge closure on non-sea sides.
- [ ] Add terrain berm + tree-belt edge treatment on non-sea sides to hide hard boundaries.
- [ ] Add edge-dressing strips (warehouse/industrial-style blocks) to break border readability.
- [ ] Add barrier props.
- [ ] Add hydrant props.
- [ ] Add street name sign props.
- [ ] Add debris props.
- [ ] Add simple floating debris/leaves motion loops to bring ambient movement to the scene.
- [ ] Add distant traffic illusion motion on far roads (simple loops/cards).
- [ ] Add simple bird-flock loop motion in the sky.
- [ ] Add simple water-surface motion near the pier.
- [ ] Add occasional ambient particles (dust/leaves/mist puffs) for background movement.
- [ ] Add small garbage/litter props.
- [ ] Break the current square city read with layout/edge variation so the city does not visually feel box-shaped.
- [ ] Improve tree placement workflow/rules for more natural and controllable distribution.
- [ ] Adjust/improve tree textures so vegetation reads better in-game.

## Phase 6 Draft Requirements (City Hero Landmarks)
- [ ] Add a city-level patio hero element as a landmark set piece (not tied to a specific store/building).
- [ ] Add a city-level park hero element as a landmark set piece.

## Phase 7 Draft Requirements (Buildings)
- [ ] Finish building fabrication for V1 stability and production readiness.
- [ ] Add roofline decoration (cornice/parapet trim) support.
- [ ] Add awning decoration support for storefront/sidewalk shade treatment.
- [ ] Create reusable presets for roofline decoration.
- [ ] Add silhouette-wrapping decorative rings/bands as 3D forms.
- [ ] Support ring/band variants that read like skirt-style facade trims.
- [ ] Add garage door support as a first-class building feature.
- [ ] Use a unified window+door fabrication workflow instead of per-building window-only fabrication flow.
- [ ] Add window decoration presets and export each decoration part independently (not only embedded inside window fabrication).
- [ ] Move selected window properties to building fabrication ownership when they are building-level controls.
- [ ] Add a system to generate building wear variation.
- [ ] Add door fabrication support integrated with the window fabrication system.
- [ ] Add garage presets/variants for building fronts.
- [ ] Finalize building-to-sidewalk connection behavior.
- [x] Window fabrication debugger: add top-level Window/Door switch with per-mode catalog selections.
- [x] Window fabrication debugger: door mode renders a single bottom-centered door with no bottom frame and no interior parallax.
- [x] Window fabrication debugger: export window/door configuration without decoration payload.
- [x] Window fabrication debugger: export window/door configuration with catalog-name field, decoration payload, wall-material hint, and thumbnail metadata.
- [x] Window fabrication debugger: add Load flow with thumbnail picker and catalog-entry selection by name.
- [x] Window fabrication debugger: simplify decoration material options for header/sill to match-frame or match-wall.
- [x] Window fabrication debugger: generate picker thumbnails from a dedicated offscreen render buffer (window/door against a wall 20% larger than the asset).

## Phase 8 Draft Requirements (Asphalt Wear)
- [ ] Replace the current asphalt wear system with a less repetitive result that does not scream pattern.
- [ ] Ensure asphalt wear breakup is non-uniform across large surfaces and avoids obvious tiling repetition.
- [ ] Extend asphalt wear treatment into road markings so marking paint also reflects wear.
- [ ] Add missing road markings needed for V1, including stop line markings.

## Phase 9 Draft Requirements (Physics and Bus Handling)
- [ ] Finish physics engine work needed for reliable collision behavior.
- [ ] Improve collision response quality/stability for gameplay use.
- [ ] Tune bus driving parameters so handling is less harsh and more realistic.
- [ ] Improve overall bus feel (steering, acceleration, braking, and damping response) for V1 playability.
- [ ] Add subtle bus idle shake when stopped/near-idle to improve perceived vehicle liveliness.
- [ ] Add a bus engine sound system tied to runtime driving state.
- [ ] Add suspension spring sound cues tied to bus movement/weight transfer events.
- [ ] Improve engine/transmission tuning so the bus can accelerate and sustain higher speed progression up to 5th gear.

## Phase 10 Draft Requirements (Grass System)
- [ ] Improve the current grass solution beyond flat textured grass to add visible scene volume.
- [ ] Expand the existing grass system with richer density/shape variation for V1 visual quality.
- [ ] Keep grass rendering practical for gameplay performance while improving depth perception in streetscape areas.
- [ ] Add simple wind sway animation for grass and trees to introduce constant environmental motion.

## Phase 11 Draft Requirements (Optimization)
- [ ] Add/finish LOD strategy for heavy scene assets (buildings, props, vegetation).
- [ ] Add/finish occlusion culling to reduce rendering work for non-visible geometry.
- [ ] Tune frustum-distance culling and visibility thresholds for stable performance.
- [ ] Reduce expensive rendering overhead (draw calls/material passes) where practical.
- [ ] Define and validate V1 runtime performance targets for the technical demo.

Rules:
- Do not edit text of completed items (`- [x]`).
- Add a new item for any fix/change to previously completed behavior.
- You may patch contradictory non-completed (`- [ ]`) items in place.

## Implementation Notes
- Interactive AI started on 2026-02-22 for V1 minimum feature planning.
- Added Phase 3 curb detail requirements from discussion on 2026-02-22.
- Added initial Phase 4 sidewalk detail requirements from discussion on 2026-02-22.
- Added initial Phase 5 city props requirements from discussion on 2026-02-22.
- Added initial Phase 6 building requirements from discussion on 2026-02-22.
- Added window decoration preset/export and ownership-split requirements for Phase 6 on 2026-02-22.
- Added initial Phase 7 asphalt wear and markings requirements from discussion on 2026-02-22.
- Added initial Phase 2 noise-system usability requirements from discussion on 2026-02-22.
- Added initial Phase 1 rendering/shader pipeline requirements from discussion on 2026-02-22.
- Added initial Phase 8 physics/collision and bus-handling requirements from discussion on 2026-02-22.
- Added initial Phase 9 grass-system volume requirements from discussion on 2026-02-22.
- Added tree placement and tree texture improvement requirements from discussion on 2026-02-22.
- Added city horizon/backdrop requirement from discussion on 2026-02-22.
- Added bus engine sound and 5th-gear drivetrain tuning requirements from discussion on 2026-02-22.
- Added suspension spring sound-cue requirement for technical-demo scope on 2026-02-22.
- Added selected easy ambient-motion items (tree/grass sway, traffic-light idle animation, floating debris/leaves) on 2026-02-22.
- Added bus idle shake requirement on 2026-02-22.
- Added optimization phase requirements (LOD, occlusion, culling, perf targets) on 2026-02-22.
- Added first-pass sea-side pier requirement on 2026-02-22.
- Added city-shape breakup requirement so the city does not look square on 2026-02-22.
- Added selected city-closure items (distant skyline ring, berm+tree-belt, sea-side fog/ocean blend, edge-dressing strips) on 2026-02-22.
- Added selected movement items (distant traffic illusion, bird loops, water motion near pier, ambient particles) on 2026-02-22.
- Added awning decoration requirement to building phase on 2026-02-22.
- Moved patio hero requirement to city phase (not building-specific) on 2026-02-22.
- Inserted dedicated Phase 6 city-hero landmarks with patio hero and park hero; renumbered subsequent phases on 2026-02-22.
- Implemented window fabrication debugger pass: window/door mode switch, per-mode catalog, door preview behavior, and config export without decoration payload on 2026-02-22.
- Implemented follow-up window fabrication debugger export/load pass: name-driven catalog export, decoration-inclusive payloads, wall-material thumbnail hints, embedded downloads catalog entry, and thumbnail picker load flow on 2026-02-22.
- Implemented material-mode simplification for header/sill decorations (match frame / match wall only) on 2026-02-22.
- Reduced window catalog to only the embedded downloaded entry, renamed to `Black 6 panels tall`, and switched picker thumbnail capture to an offscreen wall-backed render on 2026-02-22.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_i_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_i_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested

## On `make final` without full completion
- If the user asks for `make final` while checklist items are still open, do not use `DONE` naming.
- Rename to regular mode naming (`AI_...`) and keep all checklist items.
