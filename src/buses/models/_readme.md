# src/buses/models/

## Contents

- `CityBus.js` - City transit bus with UV-mapped texture atlas (uses `citybus.webp`)
- `CoachBus.js` - Long-distance touring coach model (procedural materials, taller with luggage bay)
- `DoubleDeckerBus.js` - Two-level iconic bus model (procedural materials, upper and lower decks)
- `components/` - Reusable wheel geometry and rig controller

## Overview

This folder contains individual bus model implementations. Each file exports a factory function that creates a complete 3D bus with body geometry, windows, lights, wheels, and all necessary metadata.

All bus models follow a consistent pattern: they create a THREE.Group containing the body meshes, attach wheels using components from the `components/` subfolder, register headlights and brake lights in `userData.parts`, and call `attachBusSkeleton()` to enable the unified control API.

**CityBus.js** uses a texture atlas (`assets/citybus.webp`) with UV mapping for realistic appearance. Key UV regions are defined in `COACH_TEMPLATE_UV` and applied via `applyCoachTemplateUVs()`. The body geometry is segmented and shaped with `shapeFrontOnly()` for a rounded nose.

**CoachBus.js** and **DoubleDeckerBus.js** use procedural MeshStandardMaterial/MeshPhysicalMaterial for body, trim, and glass.

### Wheel Position Parameters (per model)

| Parameter | Description |
|-----------|-------------|
| `wheelR` | Wheel radius (typically 0.55m) |
| `wheelW` | Wheel width (0.30-0.32m) |
| `axleFront` | Front axle Z position (fraction of length) |
| `axleRear` | Rear axle Z position (negative, fraction of length) |
| `wheelX` | Lateral position from center (half width ± offset) |

## References

- Uses `components/BusWheel.js` and `components/WheelRig.js` for wheel assemblies
- Uses `../BusSkeleton.js` to attach the control interface
- Called by `../BusFactory.js` based on variant specification
- Specs defined in `../BusCatalog.js`
- CityBus texture: `../../../assets/citybus.webp`

