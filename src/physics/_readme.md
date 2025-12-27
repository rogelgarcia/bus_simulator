# src/physics/

## Contents

### Current Implementation ✅
- `PhysicsLoop.js` - Fixed-timestep physics loop with accumulator pattern
- `DriveSim.js` - Driving simulation with speed control, steering, and body inertia
- `SuspensionSim.js` - Four-corner spring-damper suspension simulation
- `CurbCollisionDetector.js` - Detects wheel surface types (asphalt vs curb)
- `SuspensionAdjuster.js` - Applies immediate suspension adjustments on curb transitions

### Proposed Architecture 🚧 (See ../../AI_3_architecture_refactoring.md)
- `PhysicsWorld.js` - Coordinator for all physics systems (PLANNED)
- `systems/LocomotionSystem.js` - Movement and steering (PLANNED - refactored from DriveSim)
- `systems/SuspensionSystem.js` - Spring-damper simulation (PLANNED - refactored from SuspensionSim)
- `systems/DrivetrainSystem.js` - Engine/transmission (PLANNED - moved from ../hud/sim/)
- `systems/CollisionSystem.js` - Ground and curb collision (PLANNED - refactored from CurbCollisionDetector + SuspensionAdjuster)
- `systems/BrakeSystem.js` - Dedicated braking system (PLANNED)

## Overview

This folder contains physics simulation systems for vehicle dynamics.

### Current Systems

**PhysicsLoop.js** implements a fixed-timestep update loop that decouples physics from frame rate:
- Accumulates delta time and runs fixed steps at 60Hz
- Prevents physics instability from variable frame rates
- Limits iterations to avoid spiral-of-death when tab is backgrounded
- Calls `fixedUpdate(dt)` on all registered systems

**DriveSim.js** handles bus movement in world space:
- Target-speed control with acceleration/brake limits
- Nonlinear drag (v²) and rolling resistance
- Rear-axle bicycle kinematics with understeer saturation
- Curvature inertia and rate limiting
- Body inertia pitch/roll fed to suspension
- Wheel spin synchronized to ground travel
- **Issue**: Directly manipulates bus API and world position

**SuspensionSim.js** simulates a 4-corner suspension system:
- Progressive (nonlinear) spring stiffness
- Nonlinear damping
- Load transfer from lateral/longitudinal acceleration
- Least-squares plane fitting for body pitch, roll, and heave
- **Issue**: Only calculates pose, doesn't apply it (GameModeState does that)

**CurbCollisionDetector.js** detects which wheels are on curbs vs asphalt:
- Queries CityMap for surface types at wheel positions
- Tracks transitions between surfaces (ASPHALT ↔ CURB)
- Returns surface heights for each wheel
- **Issue**: Only detects, doesn't apply effects (SuspensionAdjuster does that)

**SuspensionAdjuster.js** applies immediate suspension adjustments on curb transitions:
- Compresses/extends springs when wheels hit/leave curbs
- Adjusts bus base Y position for compensation
- **Issue**: Directly manipulates suspension state and DriveSim._baseY

### Architecture Issues

The current implementation has several problems (see `../../AI_3_architecture_refactoring.md`):

1. **Tight Coupling**: Systems directly manipulate bus API and each other's state
2. **Scattered Logic**: Curb collision orchestration is in GameModeState, not here
3. **Wrong Location**: Drivetrain simulation (`DemoDrivetrainSim.js`) is in `../hud/sim/` instead of here
4. **Hard to Reuse**: Systems are tightly bound to "bus" concept, can't easily add cars/trucks
5. **Hard to Test**: Can't test systems in isolation without creating entire game state
6. **Unclear Responsibilities**: Who applies what? SuspensionSim calculates, GameModeState applies

### Proposed Improvements

The refactoring (see `../../AI_3_architecture_refactoring.md`) will:
- Create `PhysicsWorld` coordinator to manage all systems
- Make each system independent and reusable (vehicle-agnostic)
- Use clear interfaces (`IPhysicsSystem`)
- Remove direct manipulation of vehicle API
- Move all physics logic into this folder (including drivetrain from hud/)
- Each system owns its complete responsibility (detect AND apply)

## References

- Used by `../states/GameModeState.js` and `../states/TestModeState.js`
- `DriveSim.js` and `SuspensionSim.js` use `../buses/BusSkeleton.js` API for bus control
- `CurbCollisionDetector.js` queries `../city/CityMap.js` for surface types
- Registered with `PhysicsLoop.js` for fixed-timestep updates
- Suspension tuning parameters are owned by the bus (`userData.suspensionTuning`)
- See `../../AI_2_curb_collision_suspension.md` for curb collision implementation details
- See `../../AI_3_architecture_refactoring.md` for proposed architecture changes

