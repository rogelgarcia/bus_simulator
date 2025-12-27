# src/states/

## Contents

- `WelcomeState.js` - Splash screen with title and start button
- `BusSelectState.js` - Garage scene for browsing and selecting buses
- `CityState.js` - Free-roam city exploration with first-person camera controls
- `GameplayState.js` - Chase-camera gameplay mode with selected bus in city (⚠️ partially refactored)
- `TestModeState.js` - Debug environment with full bus control HUD and physics

## Overview

This folder contains game state implementations that plug into the StateMachine.

**WelcomeState.js** displays the splash screen with the game title and a "Press Start" button:
- Listens for keyboard (Enter/Space to start, T for test mode, C for city explore)
- Listens for pointer input on start button
- Clears scene and shows splash background image
- Transitions to BusSelectState on start

**BusSelectState.js** creates a garage environment with all available buses displayed:
- Players can browse using keyboard arrows or mouse hover
- Select a bus with Enter or click
- Selection triggers an animation sequence with fade-out
- Stores selected bus in `engine.context.selectedBus`
- Transitions to GameplayState

**CityState.js** provides a free-roam exploration mode of the procedurally generated city:
- First-person camera controls with WASD movement
- Mouse-look (hold left button to look around)
- Uses the shared City instance for consistent world state
- Press Escape to return to welcome screen

**GameplayState.js** is the main gameplay state where the selected bus is placed in the city:
- Chase camera follows bus from behind with smooth interpolation
- Camera distance and height computed based on bus dimensions
- ⚠️ **Current Status**: Partially refactored, uses some new architecture components
- ⚠️ **Note**: May still have some manual orchestration (see AI_3_architecture_refactoring.md for full refactoring plan)
- Uses the shared City instance
- Press Escape to return to welcome screen

**TestModeState.js** provides a debug/testing environment:
- Checkerboard floor and city skyline backdrop
- Full DOM-based HUD with sliders and toggles
- Controls for steering, lights, vehicle tilt, speed, suspension tuning
- Uses legacy physics (DriveSim + SuspensionSim) for testing
- Useful for testing vehicle dynamics in isolation

## Architecture Status

### Current State
- **GameplayState.js** exists but may be in transition between old and new architecture
- Some states may reference components that don't exist yet (core/GameLoop, vehicle/VehicleController, etc.)
- Legacy physics systems (DriveSim, SuspensionSim) are still in use

### Proposed Refactoring (See ../../AI_3_architecture_refactoring.md)
- Simplify GameplayState to ~80 lines (thin coordinator)
- Delegate to GameLoop for all system coordination
- Use VehicleController for high-level vehicle control
- Use InputManager for centralized input handling
- Rename BusSelectState → VehicleSelectState (vehicle-agnostic)
- Rename CityState → FreeRoamState (clarity)

## References

- All states receive `../engine/GameEngine.js` and `../engine/StateMachine.js` in constructor
- `BusSelectState.js` uses `../buses/BusFactory.js`, `../buses/BusCatalog.js`, `../environment/GarageModel.js`, `../utils/screenFade.js`
- `CityState.js` and `GameplayState.js` use `../city/City.js` (shared instance via `getSharedCity()`)
- `GameplayState.js` may use components from `../core/`, `../vehicle/`, `../ui/` (if they exist)
- `TestModeState.js` uses `../buses/` for bus creation and `../physics/` for driving and suspension
- States use `../utils/animate.js` for transition animations
- See `../../AI_3_architecture_refactoring.md` for proposed architecture changes

