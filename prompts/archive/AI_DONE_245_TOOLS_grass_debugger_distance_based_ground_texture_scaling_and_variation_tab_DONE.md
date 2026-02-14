#Problem (DONE)

In the Grass Debugger, ground textures can look repetitive and visually noisy depending on camera distance. A single fixed UV scale often looks too “busy” in the distance and too “blurry/low detail” up close. We want the ground material to adapt: larger-scale detail far away and smaller-scale detail up close.

At the same time, we need better organization of “variation” controls (anti-tiling layers, hue/sat/value adjustments, breakup noise) so they don’t clutter the main Terrain controls.

# Request

Implement distance-based ground texture scaling (2-level macro/micro) in the Grass Debugger terrain material UI, and move variation layers into a dedicated **Variation** tab. Ensure saturation controls have enough range for strong art direction when needed.

Tasks:
- Add distance-based ground texture scaling with **two levels**:
  - **Near (micro)**: smaller UV scale for close-up detail.
  - **Far (macro)**: larger UV scale for distant readability.
  - Smoothly blend between near and far based on camera distance (avoid sudden popping).
  - Avoid “texture swimming” during camera movement (prefer blending two stable samples rather than continuously rescaling one sample).
- UI placement:
  - Put the 2-level distance scaling controls in the **Terrain** tab.
  - Controls should include:
    - Near UV scale (U/V or unified)
    - Far UV scale (U/V or unified)
    - Blend start distance and blend end distance (or equivalent curve controls)
    - Optional intensity/weight for macro contribution
- Variation tab:
  - Move ground “variation layers” controls into a new dedicated tab named **Variation**.
  - Include anti-tiling/breakup layers (noise masks, rotation/offset jitter, macro color variation, etc.) consistent with existing project patterns.
  - Ensure the variation tab still affects the ground material live.
  - Make variation distance-aware (2 levels) similar to the PBR macro/micro blending:
    - **Near variation** set for close-up views.
    - **Far variation** set for long-distance views.
    - Blend near/far variation with the same smooth transition distances/curve used for the PBR texture macro/micro blend (no separate popping thresholds).
    - Ensure the transition is stable during camera motion (no “swimming” or sudden shifts).
- Saturation range:
  - Ensure saturation controls are not overly clamped; allow a wide enough range to both desaturate and strongly saturate the ground look (while keeping sensible defaults).
  - Ensure the UI labels/ranges are intuitive (e.g., `0..2` or `0..3` for saturation multiplier).
- Rendering correctness:
  - Ensure the system works with full PBR maps (albedo/normal/roughness/ORM).
  - Ensure correct color space behavior (albedo in sRGB, data maps linear) and stable results under tone mapping.
  - Ensure grazing-angle stability (avoid extra shimmer from the macro/micro blend).
- Persistence:
  - Ensure these new Terrain/Variation settings persist in the Grass Debugger config (and are exportable if the tool supports export/import).

Nice to have:
- Add a “show macro only / show micro only / blended” debug view to validate blending behavior.
- Add a “recommended defaults” button for a good baseline at 4K/grazing angles.

## Quick verification
- In the Grass Debugger:
  - Close-up ground shows micro detail.
  - Far ground shows macro readability without noisy repetition.
  - Camera movement does not cause obvious texture swimming.
- Variation tab:
  - Adjust saturation and breakup layers; changes are visible and stable.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_245_TOOLS_grass_debugger_distance_based_ground_texture_scaling_and_variation_tab_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added Terrain distance-based macro/micro texture scaling controls (near/micro from existing UV tiling + new far/macro scale, blend distances, macro weight, and debug view).
- Added a dedicated Variation tab (moved variation layers UI) and added near/far variation intensity blended using the same distance curve as macro/micro.
- Implemented shader-side stable dual-sampling for PBR maps via `MaterialVariationSystem` (avoids “swimming” rescale artifacts).
