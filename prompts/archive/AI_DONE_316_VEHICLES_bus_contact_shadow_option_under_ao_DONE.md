# DONE

## Summary
- Added `ambientOcclusion.busContactShadow` to persisted AO settings (defaults + sanitization).
- Implemented `BusContactShadowRig` (wheel/chassis blobs + ground raycast + smoothing) and wired it into `GameEngine`.
- Added Options UI controls under Graphics → Ambient Occlusion (toggle + intensity/radius/softness/max distance).
- Updated AO spec and unit tests for the new setting.

#Problem

Even when SSAO is enabled (or when GTAO is configured for performance), the bus can look like it is “floating” above the road because the strongest grounding cue is the tight contact shadow directly under the bus. GTAO Ultra provides a good “bus sits on the ground” result, but it is too expensive to run at full quality for the entire screen all the time.

We need a cheaper, dedicated solution that primarily benefits the bus (the hero object), while integrating cleanly with the existing Ambient Occlusion (AO) graphics options.

# Request

Implement a **Bus Contact Shadow** feature that improves grounding under the bus without requiring GTAO Ultra, and expose its controls under the existing **Graphics → Ambient Occlusion** options group.

Tasks:
- Add a bus-specific contact shadow solution that:
  - visually anchors the bus to the ground with a tight, soft shadow under/near the wheels and chassis
  - works regardless of whether SSAO/GTAO is enabled (and can be used as a cheaper alternative)
  - remains stable (no noticeable jitter) during motion and camera movement
  - handles common cases: bus on flat road, slight slopes, near curbs
- Integrate the feature under the **AO group** in the graphics/options menu:
  - Provide an `Off/On` toggle (or mode selector if multiple implementations are supported).
  - Provide first-pass tuning controls (implementation-defined), such as:
    - intensity/opacity
    - radius/spread
    - blur/softness
    - max distance from ground (fade out if bus is airborne)
- Ensure performance goals:
  - The contact shadow should be significantly cheaper than full-screen GTAO.
  - It should scale with one bus (or a small number of hero vehicles) without large full-screen cost.
- Ensure compatibility:
  - Does not break existing directional shadows.
  - Plays well with existing AO modes (Off/SSAO/GTAO) and with the GTAO caching/update-rate options if enabled.

Notes / constraints:
- Treat the bus as the “hero” target for this feature (first pass).
- Avoid solutions that require heavy per-frame full-screen postprocessing.
- The implementation may be a dedicated pass, a projected/decal-style shadow, or another performant approach — choose what fits the engine best.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_316_VEHICLES_bus_contact_shadow_option_under_ao_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
