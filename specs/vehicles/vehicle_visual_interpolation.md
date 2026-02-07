# Vehicle visual interpolation (physics alpha)

## Overview

Vehicle physics runs on a fixed timestep (`PhysicsLoop.fixedDt`). Rendering can occur at a variable rate (uneven FPS), which can produce visible stepping if vehicle transforms are sampled only at fixed-step boundaries.

To keep vehicle visuals (and therefore shadow-casting transforms and chase camera targeting) smooth and deterministic, the engine supports render-time interpolation driven by the physics accumulator alpha.

## Physics loop alpha

After fixed substeps are processed, `PhysicsLoop` computes:

- `alpha = accum / fixedDt` clamped to `[0, 1]`

Each registered physics system may implement `interpolate(alpha)` to produce a render-time view of its state.

## Vehicle integration

- `RapierVehicleSim` captures each vehicle’s locomotion pose every fixed step and stores an interpolated `state.renderPose` each render frame using `FixedTimestepPoseBuffer`.
- Vehicle visuals (the vehicle anchor transform used for rendering/shadow casting) are updated from `state.renderPose` when present.
- Chase camera targeting is derived from the vehicle anchor, so camera + bus + shadows stay consistent under uneven render timing.

## Debug / repro

Use the Vehicle motion debug overlay to inspect per-frame values:

- `dt`, `fixedDt`, `substeps`, `alpha`
- render pose vs physics pose deltas

To force uneven timing deterministically, enable synthetic frame timing patterns via Vehicle motion debug settings (including URL overrides like `syntheticDt=alt60_20` and `syntheticDtMode=stall|dt`).

For real GPU load, enable heavier post-processing (e.g., Bloom + GTAO).

