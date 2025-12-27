# AI Prompt #3: Architecture Refactoring for Modular Vehicle Systems

## Problem Statement

The current codebase has vehicle simulation features (suspension, collision, acceleration, braking, steering, engine/transmission) scattered across multiple components, making it difficult to:
1. Adjust individual features without touching unrelated code
2. Reuse vehicle systems for different vehicle types (buses, cars, trucks)
3. Understand where specific functionality lives
4. Test features in isolation
5. Integrate new features into the game loop cleanly

**Example Issues**:
- Curb collision logic is in `GameModeState.js` instead of being part of the physics engine
- Suspension adjustments are manually applied in the game state
- No clear separation between "what the vehicle can do" vs "how the game uses the vehicle"
- Engine/transmission simulation is in HUD folder (`DemoDrivetrainSim.js`)
- Physics systems directly manipulate bus API instead of going through interfaces

## Goal

Refactor the project to create:
1. **Clear interfaces and responsibilities** for each feature
2. **Modular organization** where each system is self-contained
3. **Well-defined integration points** with the main game loop
4. **Reusable vehicle systems** that work for any vehicle type
5. **Easy feature tweaking** without touching unrelated code

## Current Architecture Overview

### File Structure
```
src/
├── main.js                          # Entry point
├── buses/                           # Bus models and skeleton API
│   ├── BusCatalog.js
│   ├── BusFactory.js
│   ├── BusSkeleton.js              # Pivot hierarchy, lights, wheel control
│   ├── tuneBusMaterials.js
│   └── models/                      # Individual bus 3D models
├── city/                            # Procedural city generation
│   ├── City.js                      # Main container
│   ├── CityConfig.js                # Constants
│   ├── CityMap.js                   # Grid-based layout
│   ├── CityNavGraph.js              # Pathfinding
│   ├── CityRNG.js                   # Seeded random
│   ├── engines/                     # City simulation engines (placeholders)
│   │   ├── PedestrianEngine.js
│   │   ├── TrafficLightEngine.js
│   │   └── VehicleEngine.js
│   ├── generators/                  # Procedural content
│   │   ├── BuildingGenerator.js
│   │   ├── MarkingsGenerator.js
│   │   ├── PropGenerator.js
│   │   ├── RoadGenerator.js
│   │   ├── SkyGenerator.js
│   │   ├── TerrainGenerator.js
│   │   └── VegetationGenerator.js
│   └── materials/                   # Shared materials
├── engine/                          # Core game engine
│   ├── GameEngine.js                # Renderer, scene, camera
│   └── StateMachine.js              # State management
├── environment/                     # Scene generation
│   ├── GarageModel.js
│   └── ProceduralTextures.js
├── hud/                             # DOM-based UI
│   ├── GameHUD.js                   # Main HUD controller
│   ├── HUDStyles.js
│   ├── input/
│   │   └── RampedControl.js         # Keyboard input smoothing
│   ├── sim/
│   │   └── DemoDrivetrainSim.js     # ⚠️ Engine/transmission simulation
│   └── widgets/
│       ├── GaugeWidget.js
│       ├── PedalWidget.js
│       └── SteeringWheelWidget.js
├── physics/                         # Vehicle physics
│   ├── PhysicsLoop.js               # Fixed timestep loop
│   ├── DriveSim.js                  # Movement, steering, acceleration
│   ├── SuspensionSim.js             # 4-corner spring-damper
│   ├── CurbCollisionDetector.js     # Surface detection
│   └── SuspensionAdjuster.js        # Curb response
├── states/                          # Game states
│   ├── WelcomeState.js
│   ├── BusSelectState.js
│   ├── CityState.js
│   ├── GameModeState.js             # ⚠️ Main gameplay (too much responsibility)
│   └── TestModeState.js
└── utils/                           # Utilities
    ├── animate.js
    └── screenFade.js
```

### Current System Responsibilities

#### GameModeState.js (⚠️ TOO MUCH RESPONSIBILITY)
- Creates and manages City
- Creates and manages HUD
- Creates PhysicsLoop
- Creates DriveSim, SuspensionSim
- Creates CurbCollisionDetector, SuspensionAdjuster
- Creates DemoDrivetrainSim (engine/transmission)
- Handles keyboard input for driving
- Updates chase camera
- **Manually orchestrates** physics updates
- **Manually applies** curb collision effects
- **Manually applies** suspension pose to bus
- **Manually feeds** telemetry to HUD

#### DriveSim.js
- Target speed control
- Acceleration/braking with limits
- Steering (rear-axle bicycle model)
- Curvature inertia
- Wheel spin calculation
- **Directly manipulates** bus API (setSteerAngle, addSpin)
- **Directly updates** worldRoot position
- Feeds lateral/longitudinal acceleration to suspension

#### SuspensionSim.js
- 4-corner spring-damper simulation
- Progressive spring stiffness
- Load transfer from acceleration
- Pitch/roll/heave calculation
- **Does NOT apply** results (just calculates pose)

#### CurbCollisionDetector.js
- Detects which wheels are on curbs vs asphalt
- Queries CityMap for surface types
- Tracks transitions between surfaces
- **Does NOT apply** effects (just detects)

#### SuspensionAdjuster.js
- Applies immediate spring compression/extension on curb transitions
- Adjusts bus base Y position for compensation
- **Directly manipulates** suspension state and drive._baseY

#### DemoDrivetrainSim.js (⚠️ IN WRONG FOLDER)
- Engine RPM simulation
- Automatic gear shifting
- Launch control
- Clutch engagement
- **Should be** in physics/ or vehicle/ folder

#### BusSkeleton.js
- Pivot hierarchy for independent body/wheel control
- Methods: setBodyTilt, setBodyHeave, setVehicleTilt
- Methods: setSteerAngle, setSpinAngle, addSpin
- Light control (headlights, brake, turn signals)
- Exposes suspension tuning parameters
- **Is both** a data structure AND a controller

#### PhysicsLoop.js
- Fixed timestep accumulator (60Hz default)
- Calls fixedUpdate() on registered systems
- **Simple and clean** ✅

## Problems with Current Architecture

### 1. **Tight Coupling**
- GameModeState knows about internal details of physics systems
- Physics systems directly manipulate bus API
- No abstraction between "vehicle capabilities" and "physics simulation"

### 2. **Scattered Responsibilities**
- Engine simulation in `hud/sim/` instead of `physics/` or `vehicle/`
- Curb collision orchestration in GameModeState instead of physics engine
- Suspension application split between SuspensionSim and GameModeState

### 3. **Hard to Reuse**
- Can't easily create a second vehicle (car, truck) without duplicating code
- Physics systems are tightly bound to "bus" concept
- No clear "Vehicle" interface that different types can implement

### 4. **Hard to Test**
- Can't test suspension in isolation without creating entire game state
- Can't test curb collision without city, map, and bus
- No clear input/output contracts for systems

### 5. **Hard to Extend**
- Adding new vehicle features requires touching GameModeState
- No plugin architecture for new physics systems
- No event system for vehicle state changes

## Proposed Architecture

### Core Principles

1. **Separation of Concerns**: Each system does ONE thing well
2. **Dependency Inversion**: High-level code depends on interfaces, not implementations
3. **Composition over Inheritance**: Build complex behavior from simple components
4. **Clear Contracts**: Well-defined inputs/outputs for each system
5. **Event-Driven**: Systems communicate through events, not direct calls

### New Folder Structure

```
src/
├── main.js
├── core/                            # NEW: Core game systems
│   ├── GameEngine.js                # (moved from engine/)
│   ├── StateMachine.js              # (moved from engine/)
│   ├── GameLoop.js                  # NEW: Main game loop coordinator
│   └── EventBus.js                  # NEW: Event system
├── vehicle/                         # NEW: Vehicle abstraction layer
│   ├── Vehicle.js                   # NEW: Base vehicle interface
│   ├── VehicleController.js         # NEW: High-level vehicle control
│   ├── VehicleState.js              # NEW: Vehicle state container
│   ├── components/                  # NEW: Vehicle component systems
│   │   ├── ChassisComponent.js      # Body/chassis management
│   │   ├── WheelComponent.js        # Wheel management
│   │   ├── LightComponent.js        # Light control
│   │   └── SuspensionComponent.js   # Suspension configuration
│   └── types/                       # Vehicle type implementations
│       ├── Bus.js                   # Bus-specific implementation
│       ├── Car.js                   # (future)
│       └── Truck.js                 # (future)
├── physics/                         # Physics simulation systems
│   ├── PhysicsWorld.js              # NEW: Physics world coordinator
│   ├── PhysicsLoop.js               # Fixed timestep loop (existing)
│   ├── systems/                     # NEW: Physics system modules
│   │   ├── LocomotionSystem.js      # Movement, steering (from DriveSim)
│   │   ├── SuspensionSystem.js      # Spring-damper (from SuspensionSim)
│   │   ├── DrivetrainSystem.js      # Engine/transmission (from DemoDrivetrainSim)
│   │   ├── CollisionSystem.js       # Ground/curb collision
│   │   └── BrakeSystem.js           # NEW: Dedicated braking
│   └── integrators/                 # NEW: System integrators
│       └── VehiclePhysicsIntegrator.js  # Connects all vehicle physics
├── world/                           # NEW: Renamed from city/
│   ├── World.js                     # (renamed from City.js)
│   ├── WorldConfig.js
│   ├── WorldMap.js
│   ├── terrain/                     # NEW: Renamed from generators/
│   │   ├── RoadGenerator.js
│   │   ├── BuildingGenerator.js
│   │   └── ...
│   └── simulation/                  # NEW: Renamed from engines/
│       ├── TrafficSimulation.js
│       ├── PedestrianSimulation.js
│       └── TrafficLightSimulation.js
├── assets/                          # NEW: Renamed from buses/
│   ├── vehicles/                    # Vehicle 3D models
│   │   ├── buses/
│   │   │   ├── CityBus.js
│   │   │   ├── CoachBus.js
│   │   │   └── DoubleDeckerBus.js
│   │   └── catalog.js               # Vehicle catalog
│   └── environment/                 # (moved from environment/)
│       ├── GarageModel.js
│       └── ProceduralTextures.js
├── ui/                              # NEW: Renamed from hud/
│   ├── GameUI.js                    # (renamed from GameHUD.js)
│   ├── input/
│   │   ├── InputManager.js          # NEW: Centralized input
│   │   └── RampedControl.js
│   └── widgets/
│       ├── GaugeWidget.js
│       ├── PedalWidget.js
│       └── SteeringWheelWidget.js
├── states/                          # Game states (simplified)
│   ├── WelcomeState.js
│   ├── VehicleSelectState.js        # (renamed from BusSelectState)
│   ├── FreeRoamState.js             # (renamed from CityState)
│   └── GameplayState.js             # (renamed from GameModeState, MUCH simpler)
└── utils/
    ├── animate.js
    ├── screenFade.js
    └── math.js                      # NEW: Math utilities
```

## Detailed System Design

### 1. Vehicle System (NEW)

#### Vehicle.js - Base Interface
```javascript
// src/vehicle/Vehicle.js
export class Vehicle {
  constructor(model3D, config) {
    this.id = generateId();
    this.model = model3D;           // Three.js Group
    this.config = config;            // Vehicle specifications

    // Components (composition)
    this.chassis = new ChassisComponent(this);
    this.wheels = new WheelComponent(this);
    this.lights = new LightComponent(this);
    this.suspension = new SuspensionComponent(this);

    // State
    this.state = new VehicleState();

    // Physics binding (set by PhysicsWorld)
    this.physics = null;
  }

  // Public API
  getPosition() { return this.chassis.getPosition(); }
  setPosition(x, y, z) { this.chassis.setPosition(x, y, z); }

  getRotation() { return this.chassis.getRotation(); }
  setRotation(yaw, pitch, roll) { this.chassis.setRotation(yaw, pitch, roll); }

  // Component access
  getWheels() { return this.wheels; }
  getChassis() { return this.chassis; }
  getLights() { return this.lights; }
  getSuspension() { return this.suspension; }

  // State access
  getState() { return this.state; }

  // Update (called by game loop)
  update(dt) {
    this.chassis.update(dt);
    this.wheels.update(dt);
    this.lights.update(dt);
    this.suspension.update(dt);
  }
}
```

#### VehicleController.js - High-Level Control
```javascript
// src/vehicle/VehicleController.js
export class VehicleController {
  constructor(vehicle, physicsWorld) {
    this.vehicle = vehicle;
    this.physics = physicsWorld;

    // Input state
    this.input = {
      throttle: 0,      // 0-1
      brake: 0,         // 0-1
      steering: 0,      // -1 to 1
      handbrake: false
    };
  }

  // High-level commands
  setThrottle(value) { this.input.throttle = clamp(value, 0, 1); }
  setBrake(value) { this.input.brake = clamp(value, 0, 1); }
  setSteering(value) { this.input.steering = clamp(value, -1, 1); }
  setHandbrake(on) { this.input.handbrake = !!on; }

  // Lights
  setHeadlights(on) { this.vehicle.lights.setHeadlights(on); }
  setBrakeLights(on) { this.vehicle.lights.setBrakeLights(on); }
  setTurnSignal(side) { this.vehicle.lights.setTurnSignal(side); }

  // Query state
  getSpeed() { return this.vehicle.state.speed; }
  getSpeedKph() { return this.vehicle.state.speed * 3.6; }
  getRPM() { return this.vehicle.state.rpm; }
  getGear() { return this.vehicle.state.gear; }

  // Update (called by game loop)
  update(dt) {
    // Send inputs to physics
    this.physics.setVehicleInput(this.vehicle.id, this.input);
  }
}
```

#### VehicleState.js - State Container
```javascript
// src/vehicle/VehicleState.js
export class VehicleState {
  constructor() {
    // Kinematics
    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.rotation = { yaw: 0, pitch: 0, roll: 0 };
    this.angularVelocity = { x: 0, y: 0, z: 0 };

    // Dynamics
    this.speed = 0;              // m/s
    this.acceleration = 0;       // m/s²
    this.lateralAccel = 0;       // m/s²
    this.longitudinalAccel = 0;  // m/s²

    // Drivetrain
    this.rpm = 0;
    this.gear = 1;
    this.throttle = 0;
    this.brake = 0;

    // Suspension
    this.suspensionCompression = { fl: 0, fr: 0, rl: 0, rr: 0 };
    this.bodyPitch = 0;
    this.bodyRoll = 0;
    this.bodyHeave = 0;

    // Wheels
    this.wheelSpin = { fl: 0, fr: 0, rl: 0, rr: 0 };
    this.wheelSteering = { fl: 0, fr: 0 };
    this.wheelGroundContact = { fl: true, fr: true, rl: true, rr: true };
    this.wheelSurfaceHeight = { fl: 0, fr: 0, rl: 0, rr: 0 };
  }

  // Update from physics
  updateFromPhysics(physicsState) {
    Object.assign(this, physicsState);
  }
}
```

### 2. Physics System (REFACTORED)

#### PhysicsWorld.js - Coordinator
```javascript
// src/physics/PhysicsWorld.js
export class PhysicsWorld {
  constructor(config = {}) {
    this.config = config;
    this.loop = new PhysicsLoop({ fixedDt: 1/60, maxSubSteps: 10 });

    // Systems (order matters!)
    this.systems = {
      locomotion: new LocomotionSystem(),
      drivetrain: new DrivetrainSystem(),
      suspension: new SuspensionSystem(),
      collision: new CollisionSystem(),
      brake: new BrakeSystem()
    };

    // Register systems with loop
    for (const system of Object.values(this.systems)) {
      this.loop.add(system);
    }

    // Vehicles in this world
    this.vehicles = new Map();

    // World environment (for collision)
    this.environment = null;
  }

  setEnvironment(worldMap, worldConfig) {
    this.environment = { map: worldMap, config: worldConfig };
    this.systems.collision.setEnvironment(this.environment);
  }

  addVehicle(vehicle) {
    this.vehicles.set(vehicle.id, vehicle);

    // Initialize physics for this vehicle
    for (const system of Object.values(this.systems)) {
      system.addVehicle(vehicle);
    }

    vehicle.physics = this;
  }

  removeVehicle(vehicleId) {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return;

    for (const system of Object.values(this.systems)) {
      system.removeVehicle(vehicleId);
    }

    this.vehicles.delete(vehicleId);
  }

  setVehicleInput(vehicleId, input) {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return;

    // Distribute input to relevant systems
    this.systems.locomotion.setInput(vehicleId, input);
    this.systems.drivetrain.setInput(vehicleId, input);
    this.systems.brake.setInput(vehicleId, input);
  }

  update(dt) {
    // Run fixed-step physics
    this.loop.update(dt);

    // Update vehicle states from physics
    for (const vehicle of this.vehicles.values()) {
      this._updateVehicleState(vehicle);
    }
  }

  _updateVehicleState(vehicle) {
    const state = vehicle.state;

    // Gather state from all systems
    const locoState = this.systems.locomotion.getState(vehicle.id);
    const driveState = this.systems.drivetrain.getState(vehicle.id);
    const suspState = this.systems.suspension.getState(vehicle.id);
    const collState = this.systems.collision.getState(vehicle.id);

    // Merge into vehicle state
    state.updateFromPhysics({
      ...locoState,
      ...driveState,
      ...suspState,
      ...collState
    });

    // Apply visual updates
    vehicle.chassis.applyPhysicsState(state);
    vehicle.wheels.applyPhysicsState(state);
    vehicle.suspension.applyPhysicsState(state);
  }
}
```

#### LocomotionSystem.js - Movement & Steering
```javascript
// src/physics/systems/LocomotionSystem.js
export class LocomotionSystem {
  constructor() {
    this.vehicles = new Map();
  }

  addVehicle(vehicle) {
    this.vehicles.set(vehicle.id, {
      vehicle,
      speed: 0,
      targetSpeed: 0,
      steerAngle: 0,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
      // ... other state
    });
  }

  removeVehicle(id) {
    this.vehicles.delete(id);
  }

  setInput(vehicleId, input) {
    const state = this.vehicles.get(vehicleId);
    if (!state) return;

    state.targetSpeed = input.throttle * state.vehicle.config.maxSpeed;
    state.steerAngle = input.steering * state.vehicle.config.maxSteerAngle;
  }

  fixedUpdate(dt) {
    for (const state of this.vehicles.values()) {
      this._updateVehicle(state, dt);
    }
  }

  _updateVehicle(state, dt) {
    // Speed control (from DriveSim)
    // Steering (bicycle model)
    // Position integration
    // ... (existing DriveSim logic)
  }

  getState(vehicleId) {
    const state = this.vehicles.get(vehicleId);
    if (!state) return {};

    return {
      position: state.position,
      velocity: state.velocity,
      speed: state.speed,
      yaw: state.yaw,
      // ...
    };
  }
}
```

#### SuspensionSystem.js - Spring-Damper
```javascript
// src/physics/systems/SuspensionSystem.js
export class SuspensionSystem {
  constructor() {
    this.vehicles = new Map();
  }

  addVehicle(vehicle) {
    const config = vehicle.suspension.getConfig();

    this.vehicles.set(vehicle.id, {
      vehicle,
      config,
      springs: {
        fl: { x: 0, v: 0, cmd: 0, eff: 0 },
        fr: { x: 0, v: 0, cmd: 0, eff: 0 },
        rl: { x: 0, v: 0, cmd: 0, eff: 0 },
        rr: { x: 0, v: 0, cmd: 0, eff: 0 }
      },
      pose: { pitch: 0, roll: 0, heave: 0 },
      chassisAccel: { lateral: 0, longitudinal: 0 }
    });
  }

  removeVehicle(id) {
    this.vehicles.delete(id);
  }

  setChassisAcceleration(vehicleId, aLat, aLong) {
    const state = this.vehicles.get(vehicleId);
    if (!state) return;

    state.chassisAccel.lateral = aLat;
    state.chassisAccel.longitudinal = aLong;
  }

  setWheelCompression(vehicleId, wheel, compression) {
    const state = this.vehicles.get(vehicleId);
    if (!state) return;

    state.springs[wheel].cmd = compression;
  }

  fixedUpdate(dt) {
    for (const state of this.vehicles.values()) {
      this._updateSuspension(state, dt);
    }
  }

  _updateSuspension(state, dt) {
    // Load transfer calculation
    // Spring-damper integration
    // Pitch/roll/heave calculation
    // ... (existing SuspensionSim logic)
  }

  getState(vehicleId) {
    const state = this.vehicles.get(vehicleId);
    if (!state) return {};

    return {
      suspensionCompression: {
        fl: state.springs.fl.x,
        fr: state.springs.fr.x,
        rl: state.springs.rl.x,
        rr: state.springs.rr.x
      },
      bodyPitch: state.pose.pitch,
      bodyRoll: state.pose.roll,
      bodyHeave: state.pose.heave
    };
  }
}
```

#### CollisionSystem.js - Ground & Curb Collision
```javascript
// src/physics/systems/CollisionSystem.js
export class CollisionSystem {
  constructor() {
    this.vehicles = new Map();
    this.environment = null;
  }

  setEnvironment(env) {
    this.environment = env;
  }

  addVehicle(vehicle) {
    this.vehicles.set(vehicle.id, {
      vehicle,
      wheelSurfaces: { fl: 'unknown', fr: 'unknown', rl: 'unknown', rr: 'unknown' },
      wheelHeights: { fl: 0, fr: 0, rl: 0, rr: 0 },
      prevSurfaces: { fl: 'unknown', fr: 'unknown', rl: 'unknown', rr: 'unknown' }
    });
  }

  removeVehicle(id) {
    this.vehicles.delete(id);
  }

  fixedUpdate(dt) {
    if (!this.environment) return;

    for (const state of this.vehicles.values()) {
      this._detectCollisions(state);
      this._handleTransitions(state);
    }
  }

  _detectCollisions(state) {
    // Get wheel world positions
    // Query environment map
    // Determine surface type and height
    // ... (existing CurbCollisionDetector logic)
  }

  _handleTransitions(state) {
    // Detect surface changes
    // Apply immediate spring adjustments
    // Compensate chassis position
    // ... (existing SuspensionAdjuster logic)
  }

  getState(vehicleId) {
    const state = this.vehicles.get(vehicleId);
    if (!state) return {};

    return {
      wheelGroundContact: { /* ... */ },
      wheelSurfaceHeight: state.wheelHeights
    };
  }
}
```

#### DrivetrainSystem.js - Engine & Transmission
```javascript
// src/physics/systems/DrivetrainSystem.js
export class DrivetrainSystem {
  constructor() {
    this.vehicles = new Map();
  }

  addVehicle(vehicle) {
    const config = vehicle.config.drivetrain || {};

    this.vehicles.set(vehicle.id, {
      vehicle,
      config,
      rpm: config.idleRPM || 800,
      gear: 1,
      throttle: 0,
      clutchEngaged: false,
      // ... (from DemoDrivetrainSim)
    });
  }

  removeVehicle(id) {
    this.vehicles.delete(id);
  }

  setInput(vehicleId, input) {
    const state = this.vehicles.get(vehicleId);
    if (!state) return;

    state.throttle = input.throttle;
  }

  fixedUpdate(dt) {
    for (const state of this.vehicles.values()) {
      this._updateDrivetrain(state, dt);
    }
  }

  _updateDrivetrain(state, dt) {
    // RPM calculation
    // Gear shifting logic
    // Clutch engagement
    // ... (existing DemoDrivetrainSim logic)
  }

  getState(vehicleId) {
    const state = this.vehicles.get(vehicleId);
    if (!state) return {};

    return {
      rpm: state.rpm,
      gear: state.gear,
      throttle: state.throttle
    };
  }
}
```

### 3. Game Loop Integration (NEW)

#### GameLoop.js - Main Coordinator
```javascript
// src/core/GameLoop.js
export class GameLoop {
  constructor(engine) {
    this.engine = engine;
    this.running = false;
    this.lastTime = 0;

    // Subsystems
    this.physicsWorld = null;
    this.world = null;
    this.vehicles = new Map();
    this.ui = null;

    // Event bus
    this.events = new EventBus();
  }

  setPhysicsWorld(physicsWorld) {
    this.physicsWorld = physicsWorld;
  }

  setWorld(world) {
    this.world = world;
    if (this.physicsWorld) {
      this.physicsWorld.setEnvironment(world.map, world.config);
    }
  }

  addVehicle(vehicle, controller) {
    this.vehicles.set(vehicle.id, { vehicle, controller });

    if (this.physicsWorld) {
      this.physicsWorld.addVehicle(vehicle);
    }

    this.events.emit('vehicle:added', vehicle);
  }

  removeVehicle(vehicleId) {
    const entry = this.vehicles.get(vehicleId);
    if (!entry) return;

    if (this.physicsWorld) {
      this.physicsWorld.removeVehicle(vehicleId);
    }

    this.vehicles.delete(vehicleId);
    this.events.emit('vehicle:removed', vehicleId);
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    this._tick();
  }

  stop() {
    this.running = false;
  }

  _tick() {
    if (!this.running) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    this.update(dt);

    requestAnimationFrame(() => this._tick());
  }

  update(dt) {
    // 1. Update controllers (process input)
    for (const { controller } of this.vehicles.values()) {
      controller?.update(dt);
    }

    // 2. Update physics (fixed timestep)
    this.physicsWorld?.update(dt);

    // 3. Update vehicles (apply physics results)
    for (const { vehicle } of this.vehicles.values()) {
      vehicle.update(dt);
    }

    // 4. Update world (traffic, pedestrians, etc.)
    this.world?.update(dt);

    // 5. Update UI
    this.ui?.update(dt);

    // 6. Emit frame event
    this.events.emit('frame:update', dt);
  }
}
```

### 4. Simplified GameplayState (REFACTORED)

#### GameplayState.js - Much Simpler!
```javascript
// src/states/GameplayState.js
import { GameLoop } from '../core/GameLoop.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { VehicleController } from '../vehicle/VehicleController.js';
import { InputManager } from '../ui/input/InputManager.js';
import { GameUI } from '../ui/GameUI.js';

export class GameplayState {
  constructor(engine) {
    this.engine = engine;
    this.gameLoop = null;
    this.world = null;
    this.playerVehicle = null;
    this.playerController = null;
    this.input = null;
    this.ui = null;
  }

  enter() {
    // 1. Create game loop
    this.gameLoop = new GameLoop(this.engine);

    // 2. Create physics world
    const physics = new PhysicsWorld();
    this.gameLoop.setPhysicsWorld(physics);

    // 3. Load world
    this.world = getSharedWorld(this.engine);
    this.gameLoop.setWorld(this.world);
    this.world.attach(this.engine);

    // 4. Create player vehicle
    const selectedVehicle = this.engine.context.selectedVehicle;
    this.playerVehicle = createVehicleFromSpec(selectedVehicle);
    this.playerController = new VehicleController(this.playerVehicle, physics);

    // 5. Add vehicle to game loop
    this.gameLoop.addVehicle(this.playerVehicle, this.playerController);

    // 6. Setup input
    this.input = new InputManager();
    this.input.on('throttle', (v) => this.playerController.setThrottle(v));
    this.input.on('brake', (v) => this.playerController.setBrake(v));
    this.input.on('steering', (v) => this.playerController.setSteering(v));
    this.input.on('headlights', (on) => this.playerController.setHeadlights(on));

    // 7. Setup UI
    this.ui = new GameUI({ mode: 'gameplay' });
    this.gameLoop.ui = this.ui;

    // 8. Setup camera
    this._setupChaseCamera();

    // 9. Start game loop
    this.gameLoop.start();

    fadeIn({ duration: 1.2 });
  }

  exit() {
    this.gameLoop?.stop();
    this.input?.destroy();
    this.ui?.hide();
    this.world?.detach();
  }

  update(dt) {
    // Game loop handles everything!
    // Just update camera
    this._updateChaseCamera(dt);
  }

  _setupChaseCamera() {
    // Camera setup logic
  }

  _updateChaseCamera(dt) {
    // Camera follow logic
  }
}
```

**Compare to current GameModeState**:
- **Before**: ~400 lines, manually orchestrates everything
- **After**: ~80 lines, delegates to specialized systems

## Benefits of New Architecture

### 1. **Clear Separation of Concerns**
- ✅ Vehicle knows about its structure (chassis, wheels, lights)
- ✅ Physics systems know about simulation (forces, integration)
- ✅ Game state knows about high-level flow (setup, teardown)
- ✅ UI knows about presentation (widgets, input)

### 2. **Easy to Reuse**
```javascript
// Create a car instead of a bus
const car = new Vehicle(carModel, carConfig);
const carController = new VehicleController(car, physics);
gameLoop.addVehicle(car, carController);

// Physics systems work the same!
```

### 3. **Easy to Test**
```javascript
// Test suspension in isolation
const suspension = new SuspensionSystem();
const mockVehicle = createMockVehicle();
suspension.addVehicle(mockVehicle);
suspension.setChassisAcceleration(mockVehicle.id, 5.0, 0);
suspension.fixedUpdate(1/60);
const state = suspension.getState(mockVehicle.id);
assert(state.bodyRoll > 0);
```

### 4. **Easy to Extend**
```javascript
// Add a new physics system
class AerodynamicsSystem {
  fixedUpdate(dt) { /* ... */ }
  getState(vehicleId) { /* ... */ }
}

physicsWorld.systems.aerodynamics = new AerodynamicsSystem();
physicsWorld.loop.add(physicsWorld.systems.aerodynamics);
```

### 5. **Easy to Tweak**
```javascript
// Adjust suspension without touching game state
const suspConfig = vehicle.suspension.getConfig();
suspConfig.stiffness = 400;
suspConfig.damping = 150;
vehicle.suspension.setConfig(suspConfig);

// Adjust collision behavior without touching vehicle
const collSystem = physicsWorld.systems.collision;
collSystem.setCurbResponseMode('smooth'); // vs 'instant'
```

## Migration Strategy

### Phase 1: Create New Structure (No Breaking Changes)
1. Create `src/vehicle/` folder with new classes
2. Create `src/physics/systems/` folder
3. Create `src/core/GameLoop.js`
4. Keep existing code working

### Phase 2: Migrate Physics Systems
1. Extract `DriveSim` → `LocomotionSystem`
2. Extract `SuspensionSim` → `SuspensionSystem`
3. Extract `DemoDrivetrainSim` → `DrivetrainSystem`
4. Extract `CurbCollisionDetector` + `SuspensionAdjuster` → `CollisionSystem`
5. Create `PhysicsWorld` coordinator
6. Test each system in isolation

### Phase 3: Migrate Vehicle Abstraction
1. Create `Vehicle` base class
2. Create `VehicleController`
3. Create `VehicleState`
4. Adapt `BusSkeleton` → `ChassisComponent`, `WheelComponent`, etc.
5. Test vehicle creation and control

### Phase 4: Migrate Game State
1. Create `GameLoop`
2. Simplify `GameModeState` → `GameplayState`
3. Wire everything together
4. Test gameplay

### Phase 5: Cleanup
1. Remove old files
2. Update imports
3. Update documentation
4. Celebrate! 🎉

## File Mapping (Old → New)

### To Create (NEW)
```
src/core/GameLoop.js
src/core/EventBus.js
src/vehicle/Vehicle.js
src/vehicle/VehicleController.js
src/vehicle/VehicleState.js
src/vehicle/components/ChassisComponent.js
src/vehicle/components/WheelComponent.js
src/vehicle/components/LightComponent.js
src/vehicle/components/SuspensionComponent.js
src/physics/PhysicsWorld.js
src/physics/systems/LocomotionSystem.js
src/physics/systems/SuspensionSystem.js
src/physics/systems/DrivetrainSystem.js
src/physics/systems/CollisionSystem.js
src/physics/systems/BrakeSystem.js
src/ui/input/InputManager.js
```

### To Refactor (MODIFY)
```
src/states/GameModeState.js → src/states/GameplayState.js (simplify)
src/buses/BusSkeleton.js → integrate with Vehicle components
src/physics/DriveSim.js → extract to LocomotionSystem
src/physics/SuspensionSim.js → extract to SuspensionSystem
src/hud/sim/DemoDrivetrainSim.js → move to DrivetrainSystem
src/physics/CurbCollisionDetector.js → integrate into CollisionSystem
src/physics/SuspensionAdjuster.js → integrate into CollisionSystem
src/hud/GameHUD.js → src/ui/GameUI.js (rename)
```

### To Move (RELOCATE)
```
src/engine/GameEngine.js → src/core/GameEngine.js
src/engine/StateMachine.js → src/core/StateMachine.js
src/hud/ → src/ui/
src/buses/ → src/assets/vehicles/
```

### To Keep (NO CHANGE)
```
src/physics/PhysicsLoop.js ✅
src/city/* (most files) ✅
src/utils/* ✅
src/states/WelcomeState.js ✅
src/states/BusSelectState.js ✅
src/states/CityState.js ✅
```

## Interface Contracts

### IPhysicsSystem
```javascript
interface IPhysicsSystem {
  addVehicle(vehicle: Vehicle): void;
  removeVehicle(vehicleId: string): void;
  fixedUpdate(dt: number): void;
  getState(vehicleId: string): object;
}
```

### IVehicleComponent
```javascript
interface IVehicleComponent {
  update(dt: number): void;
  applyPhysicsState(state: VehicleState): void;
  getConfig(): object;
  setConfig(config: object): void;
}
```

### IController
```javascript
interface IController {
  update(dt: number): void;
  setInput(input: object): void;
  getState(): object;
}
```

## Configuration Example

### Vehicle Config
```javascript
// Bus configuration
const busConfig = {
  type: 'bus',
  name: 'City Bus',

  // Physical properties
  mass: 18000,        // kg
  wheelbase: 5.5,     // m
  track: 2.4,         // m
  cgHeight: 1.1,      // m

  // Performance
  maxSpeed: 80,       // kph
  maxSteerAngle: 0.52, // rad (~30°)

  // Drivetrain
  drivetrain: {
    idleRPM: 800,
    maxRPM: 2400,
    gears: [
      { ratio: 3.5, maxSpeed: 20 },
      { ratio: 2.0, maxSpeed: 40 },
      { ratio: 1.2, maxSpeed: 60 },
      { ratio: 0.8, maxSpeed: 80 }
    ]
  },

  // Suspension
  suspension: {
    stiffness: 360,
    damping: 140,
    travel: 0.22,
    springNonlinear: 2.0,
    springNonlinearPow: 2.0
  },

  // Wheels
  wheels: {
    radius: 0.5,
    width: 0.25,
    positions: {
      fl: { x: -1.2, z: 2.6 },
      fr: { x: 1.2, z: 2.6 },
      rl: { x: -1.2, z: -2.6 },
      rr: { x: 1.2, z: -2.6 }
    }
  }
};
```

## Summary

This refactoring creates a **clean, modular architecture** where:

1. **Vehicle** is a self-contained entity with components
2. **Physics systems** are independent, testable modules
3. **Game state** is a thin coordinator, not a god object
4. **Features** are easy to find, test, and modify
5. **New vehicles** can be added without duplicating code

The result is a codebase that's:
- ✅ **Maintainable**: Clear responsibilities
- ✅ **Testable**: Isolated systems
- ✅ **Extensible**: Plugin architecture
- ✅ **Reusable**: Vehicle-agnostic physics
- ✅ **Understandable**: Obvious structure

## Quick Reference: Where Things Live

### Current (BEFORE)
```
Suspension logic:        SuspensionSim.js + GameModeState.js + SuspensionAdjuster.js
Curb collision:          CurbCollisionDetector.js + SuspensionAdjuster.js + GameModeState.js
Engine/transmission:     hud/sim/DemoDrivetrainSim.js + GameModeState.js
Movement/steering:       DriveSim.js + GameModeState.js
Vehicle control:         BusSkeleton.js + DriveSim.js + GameModeState.js
Input handling:          GameModeState.js + GameHUD.js
```

### Proposed (AFTER)
```
Suspension logic:        physics/systems/SuspensionSystem.js
Curb collision:          physics/systems/CollisionSystem.js
Engine/transmission:     physics/systems/DrivetrainSystem.js
Movement/steering:       physics/systems/LocomotionSystem.js
Vehicle control:         vehicle/VehicleController.js
Input handling:          ui/input/InputManager.js
Game coordination:       core/GameLoop.js
```

## Key Takeaways

### Problems Solved
1. ❌ **Before**: Features scattered across multiple files → ✅ **After**: Each feature in one place
2. ❌ **Before**: GameModeState does everything → ✅ **After**: GameplayState delegates to specialists
3. ❌ **Before**: Hard to test in isolation → ✅ **After**: Each system is independently testable
4. ❌ **Before**: Can't reuse for other vehicles → ✅ **After**: Vehicle-agnostic physics systems
5. ❌ **Before**: Tight coupling everywhere → ✅ **After**: Clear interfaces and contracts

### Design Patterns Used
- **Composition**: Vehicle built from components (chassis, wheels, lights, suspension)
- **Strategy**: Physics systems are interchangeable strategies
- **Observer**: EventBus for loose coupling
- **Facade**: VehicleController provides simple interface to complex systems
- **Coordinator**: GameLoop orchestrates without knowing implementation details

### Next Steps
1. Review this architecture proposal
2. Discuss any concerns or modifications
3. Begin Phase 1: Create new structure
4. Incrementally migrate existing code
5. Test each phase before moving to next
6. Celebrate when complete! 🎉

## Questions to Consider

1. **Should we support multiple vehicles simultaneously?**
   - Current design: Yes, PhysicsWorld manages multiple vehicles
   - Alternative: Single vehicle only (simpler)

2. **Do we need an event system?**
   - Current design: Yes, EventBus for loose coupling
   - Alternative: Direct method calls (simpler but more coupled)

3. **Should physics systems be plugins?**
   - Current design: Yes, can add/remove systems dynamically
   - Alternative: Fixed set of systems (simpler)

4. **How granular should components be?**
   - Current design: Chassis, Wheels, Lights, Suspension as separate components
   - Alternative: Fewer, larger components (simpler but less flexible)

5. **Should we keep backward compatibility during migration?**
   - Recommended: Yes, migrate incrementally
   - Alternative: Big-bang rewrite (risky)

## Appendix: Code Size Comparison

### GameModeState.js
- **Before**: ~400 lines (creates, orchestrates, applies everything)
- **After**: ~80 lines (creates GameLoop, delegates everything)
- **Reduction**: 80% smaller, 5x simpler

### Physics Systems
- **Before**: DriveSim (400 lines) + SuspensionSim (400 lines) + scattered logic
- **After**: 5 focused systems (~200 lines each), total ~1000 lines
- **Change**: More total lines, but each system is simpler and focused

### Vehicle Abstraction
- **Before**: BusSkeleton (400 lines) does everything
- **After**: Vehicle (100 lines) + 4 components (100 lines each) = 500 lines
- **Change**: More lines, but much more flexible and reusable

### Overall
- **Before**: ~1500 lines of tightly coupled code
- **After**: ~2000 lines of loosely coupled, modular code
- **Trade-off**: 33% more code, but 10x easier to maintain and extend


