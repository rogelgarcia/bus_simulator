# Simulation Bus

## Contents

- `index.html` - Main HTML entry point with embedded styles and UI structure
- `assets/` - Static assets (images, graphics, textures)
- `src/` - Application source code
- `AI_*.md` - AI prompt documents for feature implementation and architecture
- `generate_global_readme.sh` - Script to auto-generate `_global_readme.md` from all individual readmes

## Overview

Simulation Bus is a 3D bus simulation prototype built with Three.js. The application features:
- **Bus Selection**: Browse and select different bus models in a garage environment
- **City Exploration**: Drive buses through a procedurally generated city with roads, sidewalks, and curbs
- **Realistic Physics**: 4-corner suspension system, curb collision detection, drivetrain simulation
- **Test Mode**: Interactive environment for exploring vehicle controls and suspension dynamics

**index.html** is the single HTML file that contains the full-screen canvas element, all CSS styles (splash screen, buttons, HUD elements), UI layer structure (welcome screen, bus selection overlay, blink effect), and the import map for Three.js module resolution via CDN. It loads the application by importing `src/main.js` as a module.

The project uses native ES modules with no build step required. Three.js (v0.160.0) is loaded from a CDN via import map.

## Current Features

### Implemented ✅
- Procedural city generation with grid-based road network
- Multiple bus models (City Bus, Coach Bus, Double Decker)
- 4-corner suspension simulation with progressive springs
- Curb collision detection and response
- Drivetrain simulation (RPM, gear shifting, clutch)
- Chase camera with smooth following
- DOM-based HUD with gauges and controls
- Fixed-timestep physics loop (60Hz)

### In Development 🚧
- Architecture refactoring for modular vehicle systems (see `AI_3_architecture_refactoring.md`)
- Traffic simulation
- Pedestrian simulation
- Traffic lights

## Coding Conventions

**File Path Comment**: Every JavaScript file must start with a comment containing its path relative to the project root.

```javascript
// src/folder/FileName.js
```

This convention helps with navigation, debugging, and ensures clarity when viewing code snippets out of context.

## AI Prompt Documents

The project includes comprehensive AI prompt documents for feature implementation:

- **AI_1_city_map_and_streets.md** - City generation system with grid-based roads, sidewalks, and curbs
- **AI_2_curb_collision_suspension.md** - Curb collision detection and suspension response implementation
- **AI_3_architecture_refactoring.md** - Proposed architecture refactoring for modular vehicle systems

These documents provide detailed specifications, code examples, and implementation strategies for AI-assisted development.

## Global README

The `_global_readme.md` file in the root folder is an aggregation of all `_readme.md` files in the project, organized from top to bottom. When updating any `_readme.md` file, run `./generate_global_readme.sh` to regenerate the global README.

## Architecture Notes

The project is currently undergoing an architecture refactoring to improve modularity and maintainability. See `AI_3_architecture_refactoring.md` for details.

**Current Architecture** (as of Dec 2024):
- Game states in `src/states/` manage high-level flow
- Physics systems in `src/physics/` handle vehicle dynamics
- Bus models in `src/buses/` provide 3D geometry and skeleton API
- City generation in `src/city/` creates the world environment

**Proposed Architecture** (future):
- Modular vehicle system with component-based design
- Physics systems as independent, reusable modules
- Clear separation between vehicle capabilities and game logic
- Event-driven communication between systems

## References

- `index.html` loads `src/main.js` as the application entry point
- `index.html` references `assets/main.png` for splash background
- See `src/_readme.md` for source code organization
- See `assets/_readme.md` for static asset details
- See `_global_readme.md` for a complete aggregation of all README files
- See `AI_3_architecture_refactoring.md` for proposed architecture changes

