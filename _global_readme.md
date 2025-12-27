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


---

# assets/

## Contents

- `main.png` - Background image for the welcome/splash screen
- `splash.svg` - Vector graphic for branding elements
- `citybus.webp` - Texture atlas for the CityBus model (UV-mapped sides, front, rear, roof)
- `grass.png` - Grass texture for city environment ground plane

## Overview

This folder contains static assets used by the application. These are non-code resources that are referenced directly from HTML, CSS, or JavaScript modules.

**main.png** is displayed as the full-screen background when the welcome screen is active. It is applied via CSS when the body has the `splash-bg` class.

**splash.svg** is a vector graphic asset available for branding or decorative purposes.

**citybus.webp** is a texture atlas used by `CityBus.js` for UV-mapped bus body rendering. The atlas contains regions for side panels, front, rear, and roof with baked-in window and detail artwork.

**grass.png** is a tileable grass texture used by the city environment floor. It is loaded by `CityWorld.js` and applied with repeating wrapping to cover large ground planes.

## References

- Referenced by `../index.html` in embedded CSS styles
- Background image is shown/hidden by `../src/states/WelcomeState.js` via body class toggle
- `citybus.webp` is loaded by `../src/buses/models/CityBus.js` for texture mapping
- `grass.png` is loaded by `../src/city/CityWorld.js` for ground texture


---

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


---

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


---

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


---

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


---

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

---

# src/city/engines/

## Contents

- `PedestrianEngine.js` - Pedestrian simulation and pathfinding (placeholder)
- `TrafficLightEngine.js` - Traffic light state management and timing (placeholder)
- `VehicleEngine.js` - Vehicle traffic simulation and routing (placeholder)

## Overview

This folder contains simulation engines that manage dynamic city elements. These are currently placeholder implementations for future traffic and pedestrian systems.

**PedestrianEngine.js** will handle pedestrian spawning, pathfinding along sidewalks, and animation.

**TrafficLightEngine.js** will manage traffic light states, timing cycles, and synchronization across intersections.

**VehicleEngine.js** will handle vehicle spawning, routing along roads, lane following, and traffic behavior.

## References

- Intended to be used by `../City.js` for city simulation updates
- Will interact with `../CityNavGraph.js` for pathfinding
- Will use models from `../models/` for visual representation


---

# src/city/generators/

## Contents

- `BuildingGenerator.js` - Procedural building generation (placeholder)
- `MarkingsGenerator.js` - Road markings and lane lines (placeholder)
- `PropGenerator.js` - Street furniture and props (benches, bins, signs) (placeholder)
- `RoadGenerator.js` - Road network generation with asphalt, sidewalks, and curbs
- `SkyGenerator.js` - Sky and atmospheric effects (placeholder)
- `TerrainGenerator.js` - Terrain height and features (placeholder)
- `VegetationGenerator.js` - Trees, grass, and foliage placement (placeholder)

## Overview

This folder contains procedural content generators for city elements.

**BuildingGenerator.js** will create procedural buildings with varying heights, styles, and details based on city zones (placeholder).

**MarkingsGenerator.js** will generate road surface markings including lane lines, crosswalks, arrows, and parking spaces (placeholder).

**PropGenerator.js** will place street furniture like benches, trash bins, street signs, and other urban details (placeholder).

**RoadGenerator.js** generates the road network from a CityMap. It creates instanced meshes for asphalt surfaces, sidewalks, and curbs. Handles both straight road segments (EW/NS) and intersections with proper corner sidewalks. Curbs are positioned at the edges of asphalt to create realistic street boundaries. Uses configurable lane widths, shoulder widths, and curb dimensions from CityConfig.

**SkyGenerator.js** will handle advanced sky rendering, clouds, and atmospheric scattering (placeholder - currently sky is handled by `City.js` gradient dome).

**TerrainGenerator.js** will generate terrain elevation, hills, and natural features (placeholder).

**VegetationGenerator.js** will place trees, bushes, grass patches, and other vegetation based on terrain and city layout (placeholder).

## References

- Intended to be used by `../City.js` or `../CityWorld.js` during city construction
- Will use `../CityMap.js` for layout information
- Will use `../CityRNG.js` for deterministic randomness
- Will use materials from `../materials/` for visual appearance


---

# src/city/materials/

## Contents

- `CityMaterials.js` - Shared material definitions for city objects (road, sidewalk, curb)
- `CityTextures.js` - Procedural texture generation for city surfaces

## Overview

This folder contains material and texture systems for city rendering.

**CityMaterials.js** provides cached material definitions for city infrastructure. The `getCityMaterials()` function returns shared materials for:
- `road` - Dark asphalt material (0x2b2b2b, high roughness)
- `sidewalk` - Light concrete material (0x8b8b8b, full roughness)
- `curb` - Medium gray curb material (0x6f6f6f, full roughness)

Materials are cached after first creation for performance.

**CityTextures.js** provides procedural texture generation for city surfaces. Currently implements `generateGrass()` which creates a tileable grass texture with pixel noise, color variation, and roughness mapping. The `getCityTextures()` function caches generated textures and returns them for reuse.

The grass texture generation:
- Creates a 512x512 canvas with base green color
- Adds per-pixel color variation for organic appearance
- Generates separate roughness map for realistic lighting
- Returns both color map and roughness map as Three.js CanvasTextures
- Configured for 200x repeat to cover large ground planes

## References

- `CityMaterials.js` is used by `../generators/RoadGenerator.js` for road surface materials
- `CityTextures.js` is currently unused (grass texture loaded from `assets/grass.png` instead)
- Intended to be used by `../generators/` for procedural surface materials
- Will be used by `../models/` for object materials
- Similar pattern to `../../environment/ProceduralTextures.js` for garage textures


---

# src/city/models/

## Contents

- `StreetLamp.js` - Street lamp 3D model with light source (placeholder)
- `TrafficLight.js` - Traffic light 3D model with signal states (placeholder)
- `Trees.js` - Tree 3D models with LOD variants (placeholder)

## Overview

This folder contains reusable 3D model factories for city objects. These are currently placeholder implementations for future city detail features.

**StreetLamp.js** will create street lamp models with geometry for pole, fixture, and bulb, plus associated light sources for nighttime illumination.

**TrafficLight.js** will create traffic light models with geometry for pole, housing, and signal lights (red, yellow, green), with materials that can change emissive intensity based on state.

**Trees.js** will create tree models with procedural or pre-defined geometry, potentially with multiple LOD (Level of Detail) variants for performance optimization at different distances.

## References

- Intended to be used by `../generators/PropGenerator.js` and `../generators/VegetationGenerator.js`
- Will be placed in the city scene by `../City.js` or `../CityWorld.js`
- Will use materials from `../materials/` for consistent appearance
- Similar pattern to `../../buses/models/` for reusable model components


---

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



---

# src/environment/

## Contents

- `GarageModel.js` - Creates a detailed 3D garage environment with geometry and lighting
- `ProceduralTextures.js` - Generates canvas-based procedural textures for surfaces

## Overview

This folder contains environment and scene generation code.

**GarageModel.js** builds a complete garage scene including floor, walls, ceiling, corner posts, ceiling beams, a roll-up gate, floor lane markings, and multiple light fixtures (ceiling downlights and wall-mounted tube lamps). It returns both the geometry group and an array of lights to be added to the scene.

**ProceduralTextures.js** generates textures programmatically using the Canvas API. It creates an asphalt texture (with noise, specks, stains, and cracks) for the floor and a corrugated metal texture (with ridges, panel seams, rivets, and grime) for the walls. Textures are cached after first generation.

## References

- `GarageModel.js` is used by `../states/BusSelectState.js` to create the bus selection environment
- `ProceduralTextures.js` is used internally by `GarageModel.js` for floor and wall materials
- Textures use Three.js CanvasTexture with proper color space settings


---

# src/hud/

## Contents

### Current Implementation ✅
- `GameHUD.js` - Main HUD controller that manages all widgets and input
- `HUDStyles.js` - CSS styles for HUD elements
- `index.js` - Re-exports for convenient imports
- `input/` - Input handling and control systems
  - `RampedControl.js` - Smooth control ramping for keyboard input
- `sim/` - Simulation systems (⚠️ should be in physics/)
  - `DemoDrivetrainSim.js` - Engine RPM and gear simulation
- `widgets/` - Visual widget components
  - `SteeringWheelWidget.js` - Animated steering wheel
  - `GaugeWidget.js` - Circular gauges for speed and RPM
  - `PedalWidget.js` - Visual pedal indicators

### Proposed Refactoring 🚧 (See ../../AI_3_architecture_refactoring.md)
- Rename folder to `ui/` for clarity
- Move `DemoDrivetrainSim.js` to `../physics/systems/DrivetrainSystem.js`
- Create `InputManager.js` to centralize input handling
- Simplify `GameHUD.js` → `GameUI.js` (presentation only, no input logic)

## Overview

This folder contains the DOM-based HUD system for gameplay. It provides visual feedback for vehicle controls and telemetry.

### Current Components

**GameHUD.js** is the main controller that creates and manages all HUD widgets:
- Handles keyboard input for steering, throttle, and brake controls
- Ramped acceleration (slow start → faster over time)
- Updates all widgets each frame with current control values and telemetry data
- Supports two modes: 'demo' (visual-only with simulated telemetry) and 'bus' (connected to actual bus physics)
- **Issue**: Mixes presentation and input handling (should be separated)

**HUDStyles.js** provides CSS styling for all HUD elements:
- Positioning, colors, and animations
- Responsive layout for different screen sizes

**RampedControl.js** (in `input/`) implements smooth control ramping:
- Keyboard input smoothing
- Slow start → faster acceleration over time
- Prevents jerky control from discrete key presses

**DemoDrivetrainSim.js** (in `sim/`) simulates engine RPM and speed:
- RPM calculation from wheel speed
- Automatic gear shifting
- Clutch engagement
- Launch control
- **Issue**: Should be in `../physics/` folder, not here!

**SteeringWheelWidget.js** (in `widgets/`) displays animated steering wheel:
- 270° rotation range
- Ball indicator for steering angle
- Smooth animation

**GaugeWidget.js** (in `widgets/`) displays circular gauges:
- Speed gauge (0-120 kph)
- RPM gauge (0-3000 rpm)
- Animated needles
- Color-coded zones (green, yellow, red)

**PedalWidget.js** (in `widgets/`) displays visual pedal indicators:
- Throttle pedal position
- Brake pedal position
- Smooth animation

## Key Bindings

- Steering: ← / → (also A / D)
- Throttle: ↑ (also W)
- Brake: ↓ (also S)

## Architecture Issues

1. **Wrong Location**: `DemoDrivetrainSim.js` should be in `../physics/systems/`
2. **Mixed Responsibilities**: `GameHUD.js` handles both presentation and input
3. **Tight Coupling**: HUD directly reads keyboard, should use InputManager
4. **Naming**: "HUD" is game-specific, "UI" is more general

## Proposed Improvements

The refactoring (see `../../AI_3_architecture_refactoring.md`) will:
- Rename folder to `ui/`
- Move `DemoDrivetrainSim.js` to `../physics/systems/DrivetrainSystem.js`
- Create `InputManager.js` for centralized input handling
- Simplify `GameHUD.js` → `GameUI.js` (presentation only)
- Widgets remain unchanged (they're already well-designed)

## References

- Used by `../states/GameModeState.js` or `../states/GameplayState.js` for in-game HUD display
- Widgets are created as DOM elements and styled via `HUDStyles.js`
- Input handling uses `RampedControl.js` for smooth keyboard response
- `DemoDrivetrainSim.js` should be moved to `../physics/` (see architecture refactoring)
- See `../../AI_3_architecture_refactoring.md` for proposed changes


---

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


---

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


---

# src/utils/

## Contents

- `animate.js` - Animation tweening utilities with easing functions
- `screenFade.js` - Full-screen fade-in/fade-out transition effects

## Overview

This folder contains general-purpose utility functions used across the application.

**animate.js** provides a simple tweening system for smooth animations. It includes an `easeInOutCubic` easing function and a `tween()` function that uses `requestAnimationFrame` to interpolate values over a specified duration. The tween function accepts callbacks for per-frame updates and completion, and returns a stop function to cancel the animation early.

**screenFade.js** manages full-screen black overlay transitions for state changes. It creates a singleton fade overlay element and provides `fadeIn()`, `fadeOut()`, and `fadeTo()` functions. The overlay can optionally block user input during transitions. Uses `animate.js` internally for smooth opacity tweening.

## References

- `animate.js` is used by `../states/BusSelectState.js` for bus selection and camera focus animations
- `screenFade.js` is used by `../states/BusSelectState.js` for fade-out before state transition
- `screenFade.js` is used by `../states/GameModeState.js` for fade-in on entry
- Can be used by any module needing smooth value interpolation or screen transitions


