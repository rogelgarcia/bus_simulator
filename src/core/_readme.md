# src/core/

## Status: 🚧 PLANNED (Not Yet Implemented)

This folder is part of the proposed architecture refactoring (see `../../AI_3_architecture_refactoring.md`).

**Current State**: Core systems are currently in `../engine/` folder.

**Planned Migration**: The following files will be created/moved here:
- `GameEngine.js` (moved from `../engine/GameEngine.js`)
- `StateMachine.js` (moved from `../engine/StateMachine.js`)
- `GameLoop.js` (NEW - main update loop coordinator)
- `EventBus.js` (NEW - pub/sub event system)

## Proposed Contents

### To Be Moved from ../engine/
- `GameEngine.js` - Main game engine with Three.js renderer, scene, camera
- `StateMachine.js` - State machine for game state transitions

### To Be Created (NEW)
- `GameLoop.js` - Coordinated update loop for physics, vehicles, world, and UI
- `EventBus.js` - Pub/sub event system for decoupled communication

## Proposed Overview

This folder will contain the core engine and infrastructure systems.

**GameEngine.js** will be the main entry point that:
- Creates the Three.js WebGLRenderer with proper color space and shadows
- Manages the main scene and camera
- Runs the main render loop
- Provides context for game states

**StateMachine.js** will manage game state transitions:
- Register states by name
- Transition between states with enter/exit lifecycle
- Update current state each frame

**GameLoop.js** (NEW) will coordinate updates across systems:
- Update input managers
- Update physics world (fixed timestep)
- Update vehicles (apply physics results)
- Update world simulation (traffic, pedestrians)
- Update UI
- Emit frame events

**EventBus.js** (NEW) will enable decoupled communication:
- Subscribe to events by topic
- Publish events to all subscribers
- Used for input events, physics events, vehicle events, etc.

## Current Workaround

Until this refactoring is complete, use:
- `../engine/GameEngine.js` for renderer and scene management
- `../engine/StateMachine.js` for state transitions
- Manual coordination in `../states/GameModeState.js` (to be simplified to GameplayState)

## References

- See `../../AI_3_architecture_refactoring.md` for complete refactoring plan
- Current engine systems are in `../engine/`
- GameLoop pattern will be used by future `../states/GameplayState.js`

