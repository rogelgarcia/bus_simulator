# src/buses/models/components/

## Contents

- `BusWheel.js` - Creates detailed 3D wheel geometry with tire, rim, hub, and lug nuts
- `WheelRig.js` - Manages collections of wheels for coordinated steering and spin control

## Overview

This folder contains the lowest-level reusable components for building bus models. These are the building blocks that individual bus models use to construct their wheel assemblies.

**BusWheel.js** generates a complete wheel with multiple geometry parts (tread, shoulders, sidewalls, rim barrel, rim faces, hub, lug nuts) and applies appropriate materials for each part. It returns a hierarchical structure with separate pivots for steering (Y-axis) and rolling (X-axis) rotations.

Wheel conventions:
- Wheel axis is X (rotation around X for rolling)
- Outer side is +X
- For LEFT wheels: set `wheel.root.rotation.y = Math.PI` to flip outer face outward

**WheelRig.js** provides a controller that manages multiple wheels together. It tracks front wheels (which can steer) and rear wheels (which only roll), allowing synchronized steering angle and spin updates across all wheels in the rig. Automatically infers spin direction based on wheel root yaw.

## References

- Used by `../CityBus.js`, `../CoachBus.js`, `../DoubleDeckerBus.js` to create wheel assemblies
- WheelRig instances are stored in bus `userData.wheelRig` and accessed by `../../BusSkeleton.js`
- BusWheel re-exports WheelRig for backwards compatibility

