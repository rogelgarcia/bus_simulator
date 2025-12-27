# src/buses/

## Contents

- `BusCatalog.js` - Array of available bus specifications (id, name, variant, color)
- `BusFactory.js` - Factory function that creates bus instances by variant type
- `BusSkeleton.js` - Unified API for bus transforms, wheel control, lights, and suspension tuning
- `tuneBusMaterials.js` - Utility to adjust material properties for consistent appearance
- `models/` - Individual bus model implementations and wheel components

## Overview

This folder contains everything related to bus creation and control. It provides a complete pipeline from specification to interactive 3D model.

**BusCatalog.js** defines the available bus types with their identifiers, display names, variant keys, and default colors. This serves as the source of truth for what buses exist in the game.

**BusFactory.js** is the main entry point for creating buses. Given a spec object, it routes to the appropriate model constructor (CityBus, CoachBus, DoubleDeckerBus) and ensures the skeleton interface is attached.

**BusSkeleton.js** restructures the bus hierarchy to enable independent control of body and wheels. It provides methods for positioning, rotation, tilt (whole vehicle or body-only), wheel steering/spin, light control (headlights, brake lights, turn signals), and exposes suspension tuning parameters. The skeleton creates a pivot hierarchy: root → yawPivot → vehicleTiltPivot → (wheelsRoot + bodyTiltPivot → bodyRoot).

**tuneBusMaterials.js** traverses a bus and adjusts material properties (color brightness, roughness, metalness) for visual consistency across different lighting conditions.

## References

- Used by `../states/BusSelectState.js` and `../states/TestModeState.js` to create and display buses
- BusSkeleton API is used by `../physics/DriveSim.js` and `../physics/SuspensionSim.js` for vehicle dynamics
- Models subfolder contains the actual 3D geometry implementations
- See `models/_readme.md` for individual bus model details

