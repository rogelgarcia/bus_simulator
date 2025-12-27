# src/

## Contents

### Current Implementation ✅
- `main.js` - Application entry point and bootstrap
- `buses/` - Bus models, factory, skeleton API, and control systems
- `city/` - Procedural city generation and simulation systems
- `engine/` - Core game engine and state machine (legacy, to be migrated)
- `environment/` - Scene and environment generation (garage, procedural textures)
- `hud/` - DOM-based HUD with gauges, steering wheel, and pedal widgets
- `physics/` - Physics simulation systems (DriveSim, SuspensionSim, collision detection)
- `states/` - Game state implementations (welcome, bus select, city explore, game mode, test mode)
- `utils/` - Utility functions (animation tweening, screen fades)

### Proposed Architecture 🚧 (See AI_3_architecture_refactoring.md)
- `core/` - Core engine, state machine, game loop, and infrastructure (NEW)
- `vehicle/` - Vehicle abstraction and control (NEW)
- `physics/systems/` - Modular physics systems (NEW)
- `ui/` - User interface components and input handling (REFACTORED from hud/)

## Overview

This is the main source code folder for the Simulation Bus application. All JavaScript modules are organized by domain/responsibility.

**main.js** is the entry point that bootstraps the application. It creates the GameEngine instance, sets up the StateMachine with all available states (WelcomeState, BusSelectState, CityState, GameModeState, TestModeState), connects them together, starts the render loop, and transitions to the initial welcome state.

### Current Folder Organization

- **buses/** - Vehicle models and control (3D geometry, skeleton API, lights, wheels)
- **city/** - Procedural world generation (roads, buildings, terrain, navigation)
- **engine/** - Core systems (GameEngine, StateMachine)
- **environment/** - Garage scene construction and procedural textures
- **hud/** - DOM-based user interface widgets and input handling
- **physics/** - Vehicle dynamics (DriveSim, SuspensionSim, CurbCollisionDetector, SuspensionAdjuster)
- **states/** - Screen/mode logic (WelcomeState, BusSelectState, CityState, GameModeState, TestModeState)
- **utils/** - Shared helpers (animation, screen effects)

### Architecture Notes

The project is currently undergoing an architecture refactoring (see `../AI_3_architecture_refactoring.md`). The proposed changes will:
- Create `core/` folder for GameLoop, EventBus, and coordination
- Create `vehicle/` folder for modular vehicle abstraction
- Refactor `physics/` into independent, reusable systems
- Simplify game states to be thin coordinators
- Move `hud/` to `ui/` with better input management

All JavaScript files follow the convention of starting with a file path comment (see `../_readme.md` for details).

## References

- `main.js` imports from `engine/GameEngine.js` and `engine/StateMachine.js`
- `main.js` imports states from `states/` folder
- Entry point is loaded by `../index.html` as a module script
- See individual subfolder `_readme.md` files for detailed documentation
- See `../AI_3_architecture_refactoring.md` for proposed architecture changes

