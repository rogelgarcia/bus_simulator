# src/engine/

## Status: ⚠️ LEGACY (To Be Migrated)

This folder contains legacy core systems that will be migrated to `../core/` as part of the architecture refactoring (see `../../AI_3_architecture_refactoring.md`).

## Contents

- `GameEngine.js` - Main game engine with Three.js renderer, scene, camera
- `StateMachine.js` - State machine for game state transitions

## Overview

This folder currently contains the core engine systems, but they will be moved to `../core/` in the future.

**GameEngine.js** is the main entry point that:
- Creates the Three.js WebGLRenderer with proper color space (sRGB) and shadows
- Manages the main scene and camera (PerspectiveCamera)
- Provides context object for game states
- Runs the main render loop
- Handles window resize events

**StateMachine.js** manages game state transitions:
- Register states by name
- Transition between states with enter/exit lifecycle
- Update current state each frame
- Provides state history for back navigation

## Migration Plan

As part of the architecture refactoring:
1. Move `GameEngine.js` → `../core/GameEngine.js`
2. Move `StateMachine.js` → `../core/StateMachine.js`
3. Create `../core/GameLoop.js` (NEW - main update loop coordinator)
4. Create `../core/EventBus.js` (NEW - pub/sub event system)
5. Update all imports in game states
6. Remove this folder

## References

- `GameEngine.js` is instantiated in `../main.js`
- `StateMachine.js` is instantiated in `../main.js`
- All game states in `../states/` receive GameEngine and StateMachine in constructor
- See `../../AI_3_architecture_refactoring.md` for complete migration plan
- See `../core/_readme.md` for proposed new structure


