# src/city/

## Contents

### Current Implementation ✅
- `City.js` - Main city container with sky dome, lights, fog, and world management
- `CityWorld.js` - Ground plane with grass texture
- `CityConfig.js` - Configuration constants for city generation
- `CityMap.js` - Grid-based city layout and tile management
- `CityNavGraph.js` - Navigation graph for pathfinding
- `CityRNG.js` - Seeded random number generator for deterministic generation
- `engines/` - Simulation engines (traffic lights, vehicles, pedestrians) - mostly placeholders
- `generators/` - Procedural content generators
  - `RoadGenerator.js` - Road network with asphalt, sidewalks, curbs ✅
  - `BuildingGenerator.js` - Building generation (placeholder)
  - `MarkingsGenerator.js` - Road markings (placeholder)
  - `PropGenerator.js` - Street furniture (placeholder)
  - `SkyGenerator.js` - Sky effects (placeholder)
  - `TerrainGenerator.js` - Terrain features (placeholder)
  - `VegetationGenerator.js` - Trees and foliage (placeholder)
- `materials/` - Shared materials and procedural textures for city objects
- `models/` - Reusable 3D models (street lamps, traffic lights, trees)

### Proposed Refactoring 🚧 (See ../../AI_3_architecture_refactoring.md)
- Rename folder to `world/` for clarity
- Rename `City.js` → `World.js`
- Rename `CityMap.js` → `WorldMap.js`
- Rename `CityConfig.js` → `WorldConfig.js`
- Rename `generators/` → `terrain/`
- Rename `engines/` → `simulation/`

## Overview

This folder contains the procedural city generation and simulation system. It provides a complete open-world environment with sky, lighting, terrain, roads, and placeholder infrastructure for future traffic and pedestrian systems.

**City.js** is the main entry point that creates and manages the city. It builds a gradient sky dome with sun glow, sets up hemisphere and directional lighting with shadows, creates the ground plane via `CityWorld`, generates roads via `RoadGenerator`, and manages fog and camera settings. The `getSharedCity()` function ensures both CityState and GameModeState use the same city instance (cached in `engine.context.city`). The city can be attached/detached from the engine, preserving and restoring previous scene settings.

**CityWorld.js** creates the ground plane with grass texture. It loads `assets/grass.png` and applies it with repeating wrapping based on the city size and tile configuration.

**CityConfig.js** provides configuration constants for city generation including map dimensions, tile sizes, road parameters (lane width, shoulder, curb dimensions), and surface heights for roads and sidewalks.

**CityMap.js** implements a grid-based city layout system with tile types (EMPTY, ROAD), axis directions (EW, NS, INTERSECTION), and lane counts per direction. Provides methods for tile-to-world coordinate conversion and road network construction.

**CityNavGraph.js** and **CityRNG.js** provide infrastructure for future navigation and deterministic procedural generation (currently minimal implementations).

The `engines/`, `generators/`, `materials/`, and `models/` subfolders contain modular systems for city content generation and simulation.


## Key Features

### Implemented ✅
- Procedural road network generation (see `../../AI_1_city_map_and_streets.md`)
- Grid-based tile system with road segments
- Asphalt surfaces, sidewalks, and curbs
- Surface height differentiation for physics (asphalt at 0.02m, sidewalk at 0.08m)
- Shared city instance across game states
- Sky dome with gradient and sun glow
- Lighting with shadows

### Planned 🚧
- Building generation
- Road markings (lane lines, crosswalks)
- Street furniture (benches, bins, signs)
- Traffic simulation
- Pedestrian simulation
- Traffic lights

## References

- Used by `../states/CityState.js` and `../states/GameplayState.js` via `getSharedCity()`
- `City.js` imports `CityWorld.js` for ground plane creation
- `CityWorld.js` loads `../../assets/grass.png` for ground texture
- `CityMap.js` is queried by `../physics/CurbCollisionDetector.js` for surface types
- `CityConfig.js` is used by physics systems for surface heights
- See subfolder `_readme.md` files for details on engines, generators, materials, and models
- See `../../AI_1_city_map_and_streets.md` for city generation implementation details
- See `../../AI_2_curb_collision_suspension.md` for how physics uses city data
