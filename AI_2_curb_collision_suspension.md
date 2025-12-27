# AI Prompt #2: Curb Collision and Suspension Response

## Goal

Implement realistic curb collision detection and suspension response when bus wheels interact with curbs (sidewalk edges). When a wheel goes onto a curb, the suspension should compress immediately by the curb height, the bus body should be adjusted to stay level, and then the suspension system should naturally settle. When a wheel goes down from a curb, the opposite should happen.

## Requirements

### Curb Up Transition (Wheel onto Sidewalk)
1. **Immediate Spring Compression**: When any wheel goes on top of a curb, that wheel's spring should compress immediately by the curb height
2. **Body Compensation**: Move the bus body immediately so it stays flat/level (compensate for the wheel compression)
3. **Natural Settling**: Let the suspension engine take over and naturally bounce/settle the bus body

### Curb Down Transition (Wheel onto Asphalt)
1. **Immediate Spring Extension**: When a wheel goes down from sidewalk to asphalt, extend that wheel's spring so it touches the asphalt surface
2. **Body Compensation**: Move the bus body to maintain the same position (compensate for the wheel extension)
3. **Natural Settling**: Let the suspension engine adjust back to idle state naturally

### Multi-Wheel Support
- Handle all four wheels independently (FL, FR, RL, RR)
- Each wheel can be on different surfaces (some on curb, some on asphalt)
- Smooth transitions when wheels cross curb boundaries

## Current System Architecture

### City/Road System
- **CityConfig.js**: Defines road surface heights
  - `road.surfaceY`: 0.02m (asphalt height)
  - `ground.surfaceY`: 0.08m (sidewalk/grass height)
  - Curb height difference: ~0.06m
  - `road.curb.thickness`: 0.25m (curb width)

- **CityMap.js**: Grid-based tile system
  - Tile types: EMPTY, ROAD
  - Axis types: NONE, EW, NS, INTERSECTION
  - Methods: `tileToWorldCenter()`, `worldToTile()`, `index()`, `inBounds()`
  - Lane data per direction (N, E, S, W)

- **RoadGenerator.js**: Creates instanced meshes
  - Asphalt surfaces at `roadY`
  - Sidewalks at `groundY`
  - Curbs at edges (box geometry blockers)

### Physics System
- **PhysicsLoop.js**: Fixed timestep loop (60Hz default)
  - Calls `fixedUpdate(dt)` on all registered systems
  - Prevents physics instability from variable frame rates

- **SuspensionSim.js**: 4-corner spring-damper system
  - State per wheel: `{ x, v, cmd, eff }` (compression, velocity, command, effective)
  - Positions: `p.fl`, `p.fr`, `p.rl`, `p.rr` (x, z coordinates)
  - Spring parameters: `k` (stiffness), `c` (damping), `m` (mass)
  - Travel limits: `travel` (max compression/extension in meters)
  - Progressive spring: `springNonlinear`, `springNonlinearPow`
  - Load transfer from lateral/longitudinal acceleration
  - Outputs: `pose.pitch`, `pose.roll`, `pose.heave`
  - Method: `setTargetsCm({ fl, fr, rl, rr })` - sets compression targets in cm
  - Method: `setChassisAccel({ aLat, aLong })` - sets chassis acceleration
  - Method: `setLayoutFromBus(busApi)` - configures from bus geometry

- **DriveSim.js**: Vehicle movement and kinematics
  - Rear-axle bicycle model
  - Speed control, steering, wheel spin
  - Feeds longitudinal/lateral acceleration to suspension
  - Updates `worldRoot.position` (x, z, y)
  - Property: `_baseY` - base Y position of bus
  - Property: `wheelRadius` - for ground contact

### Bus System
- **BusSkeleton.js**: Hierarchical pivot structure
  ```
  root (bus group)
   -> yawPivot (Y rotation)
      -> vehicleTiltPivot (X/Z rotation for whole vehicle)
         -> wheelsRoot (wheels only, planted)
         -> bodyTiltPivot (X/Z rotation + Y heave for body only)
            -> bodyRoot (everything except wheels)
  ```
  - Methods: `setBodyTilt(pitch, roll)`, `setBodyHeave(y)`
  - Methods: `setVehicleTilt(pitch, roll)`
  - Property: `wheelRig` - manages wheel geometry

- **WheelRig.js**: Wheel collection manager
  - Arrays: `front[]`, `rear[]` (wheel objects)
  - Each wheel has: `root`, `steerPivot`, `rollPivot`, `spinSign`
  - Property: `wheelRadius` - radius of wheels
  - Methods: `setSteerAngle(rad)`, `setSpinAngle(rad)`, `addSpin(deltaRad)`

### Game State
- **GameModeState.js**: Main gameplay state
  - Creates City, HUD, Physics systems
  - Binds DriveSim and SuspensionSim to bus
  - Updates camera chase position
  - Handles keyboard input for driving

## Implementation Strategy

### 1. Create Curb Collision Detector
**File**: `src/physics/CurbCollisionDetector.js`

**Purpose**: Detect which wheels are on curbs vs asphalt

**Key Features**:
- Query CityMap to determine surface type at wheel positions
- Track per-wheel surface state (ASPHALT, CURB, UNKNOWN)
- Detect transitions (ASPHALT→CURB, CURB→ASPHALT)
- Return curb height for each wheel

**Interface**:
```javascript
class CurbCollisionDetector {
  constructor(city) // city has map, config

  update(busApi, worldRoot) // call each frame

  getWheelSurfaces() // returns { fl, fr, rl, rr } with surface type

  getWheelHeights() // returns { fl, fr, rl, rr } in meters

  getTransitions() // returns array of { wheel, from, to, height }
}
```

**Algorithm**:
1. Get world positions of all 4 wheels from `busApi.wheelRig`
2. Convert each wheel position to CityMap tile coordinates
3. Query map to determine if tile is ROAD or EMPTY
4. For ROAD tiles, check distance to curb edges using road width calculations
5. Determine surface height: `roadY` for asphalt, `groundY` for curb/sidewalk
6. Compare with previous frame to detect transitions
7. Return transition events with height delta

### 2. Create Suspension Adjuster
**File**: `src/physics/SuspensionAdjuster.js`

**Purpose**: Apply immediate suspension adjustments on curb transitions

**Key Features**:
- Listen for curb transition events
- Immediately adjust spring compression (`s[wheel].cmd`)
- Compensate bus body position to maintain level
- Work with SuspensionSim to apply changes

**Interface**:
```javascript
class SuspensionAdjuster {
  constructor(suspension, drive)

  handleTransition({ wheel, from, to, height })

  // Internal methods
  _compressWheel(wheel, amount) // compress spring immediately
  _extendWheel(wheel, amount)   // extend spring immediately
  _compensateBody(adjustments)  // move body to stay level
}
```

**Algorithm for Curb Up (ASPHALT → CURB)**:
1. Get curb height delta (e.g., 0.06m)
2. Set `suspension.s[wheel].cmd += heightDelta` (compress spring)
3. Set `suspension.s[wheel].x += heightDelta` (immediate compression)
4. Adjust `drive._baseY += heightDelta / 4` (compensate body, divided by 4 wheels)
5. Let suspension engine settle naturally

**Algorithm for Curb Down (CURB → ASPHALT)**:
1. Get curb height delta (e.g., -0.06m)
2. Set `suspension.s[wheel].cmd -= heightDelta` (extend spring)
3. Set `suspension.s[wheel].x -= heightDelta` (immediate extension)
4. Adjust `drive._baseY -= heightDelta / 4` (compensate body)
5. Let suspension engine settle naturally

### 3. Integrate into Physics Loop
**File**: `src/states/GameModeState.js` (modifications)

**Changes**:
1. Create `CurbCollisionDetector` instance in `enter()`
2. Create `SuspensionAdjuster` instance in `enter()`
3. In `update(dt)`:
   - Before physics loop: `detector.update(busApi, worldRoot)`
   - Get transitions: `const transitions = detector.getTransitions()`
   - Apply each transition: `adjuster.handleTransition(transition)`
   - Run physics loop as normal

### 4. Enhanced Curb Detection (Optional)
**File**: `src/city/CityMap.js` (additions)

**New Methods**:
```javascript
// Get surface height at world position
getSurfaceHeightAt(worldX, worldZ) {
  // Returns: { height, type: 'asphalt'|'curb'|'grass' }
}

// Check if position is on curb edge
isOnCurb(worldX, worldZ, threshold = 0.3) {
  // Returns: boolean
}

// Get distance to nearest curb
getDistanceToCurb(worldX, worldZ) {
  // Returns: { distance, direction }
}
```

## Technical Details

### Coordinate Systems
- **World Space**: Three.js global coordinates (Y-up)
- **Tile Space**: CityMap grid coordinates (integer x, y)
- **Local Space**: Bus-relative coordinates

### Surface Heights (from CityConfig)
```javascript
const roadY = 0.02;      // Asphalt surface
const groundY = 0.08;    // Sidewalk/grass surface
const curbHeight = groundY - roadY; // ~0.06m
```

### Wheel Position Calculation
```javascript
// From BusSkeleton/WheelRig
const wheels = [...busApi.wheelRig.front, ...busApi.wheelRig.rear];
const tmp = new THREE.Vector3();

for (const wheel of wheels) {
  const pivot = wheel.rollPivot || wheel.steerPivot;
  pivot.getWorldPosition(tmp);
  // tmp now contains wheel world position

  // Convert to tile coordinates
  const tile = cityMap.worldToTile(tmp.x, tmp.z);
}
```

### Suspension State Access
```javascript
// SuspensionSim state structure
suspension.s = {
  fl: { x: 0, v: 0, cmd: 0, eff: 0 },  // front-left
  fr: { x: 0, v: 0, cmd: 0, eff: 0 },  // front-right
  rl: { x: 0, v: 0, cmd: 0, eff: 0 },  // rear-left
  rr: { x: 0, v: 0, cmd: 0, eff: 0 }   // rear-right
};

// x: actual compression (meters, positive = compressed)
// v: compression velocity (m/s)
// cmd: target compression command (meters)
// eff: effective target after load transfer (meters)
```

### Body Position Adjustment
```javascript
// DriveSim controls worldRoot.position.y via _baseY
drive._baseY += deltaY;  // Adjust base height

// This affects the entire bus position
// Suspension will then settle relative to this new base
```

## Testing Strategy

### Test Cases
1. **Single Wheel on Curb**: Drive with one wheel onto sidewalk
   - Expected: Bus tilts slightly, then settles

2. **Two Wheels on Curb**: Drive with left/right side onto sidewalk
   - Expected: Bus rolls to one side, then settles

3. **Front Wheels on Curb**: Drive front wheels onto sidewalk
   - Expected: Bus pitches forward, then settles

4. **All Wheels on Curb**: Drive completely onto sidewalk
   - Expected: Bus rises smoothly, minimal tilt

5. **Curb to Asphalt**: Drive from sidewalk back to road
   - Expected: Reverse of above behaviors

### Debug Visualization (Optional)
- Draw spheres at wheel contact points
- Color code by surface type (red=curb, green=asphalt)
- Display suspension compression values in HUD
- Show transition events in console

## File Structure

```
src/physics/
  ├── CurbCollisionDetector.js  (NEW)
  ├── SuspensionAdjuster.js     (NEW)
  ├── DriveSim.js               (MODIFY - expose _baseY adjustment)
  ├── SuspensionSim.js          (MODIFY - allow external state changes)
  └── PhysicsLoop.js            (no changes)

src/city/
  ├── CityMap.js                (MODIFY - add surface query methods)
  └── CityConfig.js             (no changes)

src/states/
  └── GameModeState.js          (MODIFY - integrate new systems)
```

## Implementation Examples

### Example 1: CurbCollisionDetector.js (Skeleton)

```javascript
// src/physics/CurbCollisionDetector.js
import * as THREE from 'three';

const SURFACE = {
  UNKNOWN: 0,
  ASPHALT: 1,
  CURB: 2,
  GRASS: 3
};

export class CurbCollisionDetector {
  constructor(city) {
    this.city = city;
    this.map = city?.map;
    this.config = city?.cityConfig;

    // Previous frame state
    this.prevSurfaces = { fl: SURFACE.UNKNOWN, fr: SURFACE.UNKNOWN,
                          rl: SURFACE.UNKNOWN, rr: SURFACE.UNKNOWN };

    // Current frame state
    this.surfaces = { fl: SURFACE.UNKNOWN, fr: SURFACE.UNKNOWN,
                      rl: SURFACE.UNKNOWN, rr: SURFACE.UNKNOWN };

    this.heights = { fl: 0, fr: 0, rl: 0, rr: 0 };
    this.transitions = [];

    this.roadY = this.config?.road?.surfaceY ?? 0.02;
    this.groundY = this.config?.ground?.surfaceY ?? 0.08;
    this.curbHeight = this.groundY - this.roadY;
  }

  update(busApi, worldRoot) {
    if (!this.map || !busApi?.wheelRig) return;

    this.transitions = [];
    this.prevSurfaces = { ...this.surfaces };

    const wheelKeys = ['fl', 'fr', 'rl', 'rr'];
    const wheels = this._getWheelPositions(busApi, worldRoot);

    for (let i = 0; i < wheelKeys.length; i++) {
      const key = wheelKeys[i];
      const pos = wheels[i];
      if (!pos) continue;

      const surface = this._detectSurface(pos.x, pos.z);
      const height = this._getSurfaceHeight(surface);

      this.surfaces[key] = surface;
      this.heights[key] = height;

      // Detect transition
      if (this.prevSurfaces[key] !== SURFACE.UNKNOWN &&
          this.prevSurfaces[key] !== surface) {
        this.transitions.push({
          wheel: key,
          from: this.prevSurfaces[key],
          to: surface,
          height: height - this._getSurfaceHeight(this.prevSurfaces[key])
        });
      }
    }
  }

  _getWheelPositions(busApi, worldRoot) {
    const rig = busApi.wheelRig;
    const tmp = new THREE.Vector3();
    const positions = [];

    worldRoot.updateMatrixWorld(true);

    // Order: FL, FR, RL, RR
    const wheelOrder = [
      rig.front?.find(w => w.root.position.x < 0),  // FL
      rig.front?.find(w => w.root.position.x >= 0), // FR
      rig.rear?.find(w => w.root.position.x < 0),   // RL
      rig.rear?.find(w => w.root.position.x >= 0)   // RR
    ];

    for (const wheel of wheelOrder) {
      if (!wheel) {
        positions.push(null);
        continue;
      }

      const pivot = wheel.rollPivot || wheel.steerPivot;
      if (pivot) {
        pivot.getWorldPosition(tmp);
        positions.push({ x: tmp.x, y: tmp.y, z: tmp.z });
      } else {
        positions.push(null);
      }
    }

    return positions;
  }

  _detectSurface(worldX, worldZ) {
    const tile = this.map.worldToTile(worldX, worldZ);

    if (!this.map.inBounds(tile.x, tile.y)) {
      return SURFACE.GRASS;
    }

    const idx = this.map.index(tile.x, tile.y);
    const kind = this.map.kind[idx];

    if (kind !== 1) { // TILE.ROAD = 1
      return SURFACE.GRASS;
    }

    // On a road tile - check if on curb or asphalt
    const tileCenter = this.map.tileToWorldCenter(tile.x, tile.y);
    const axis = this.map.axis[idx];

    // Get road width based on lanes
    const lanes = this.map.getLanesAtIndex(idx);
    const laneWidth = this.config?.road?.laneWidth ?? 3.2;
    const shoulder = this.config?.road?.shoulder ?? 0.35;

    const widthNS = laneWidth * (lanes.n + lanes.s) + 2 * shoulder;
    const widthEW = laneWidth * (lanes.e + lanes.w) + 2 * shoulder;

    // Check distance from tile center
    const dx = Math.abs(worldX - tileCenter.x);
    const dz = Math.abs(worldZ - tileCenter.z);

    // AXIS: 0=NONE, 1=EW, 2=NS, 3=INTERSECTION
    if (axis === 1) { // EW
      return (dz < widthEW / 2) ? SURFACE.ASPHALT : SURFACE.CURB;
    } else if (axis === 2) { // NS
      return (dx < widthNS / 2) ? SURFACE.ASPHALT : SURFACE.CURB;
    } else if (axis === 3) { // INTERSECTION
      return (dx < widthNS / 2 && dz < widthEW / 2) ? SURFACE.ASPHALT : SURFACE.CURB;
    }

    return SURFACE.ASPHALT;
  }

  _getSurfaceHeight(surface) {
    if (surface === SURFACE.ASPHALT) return this.roadY;
    if (surface === SURFACE.CURB || surface === SURFACE.GRASS) return this.groundY;
    return 0;
  }

  getWheelSurfaces() { return this.surfaces; }
  getWheelHeights() { return this.heights; }
  getTransitions() { return this.transitions; }
}
```

### Example 2: SuspensionAdjuster.js (Skeleton)

```javascript
// src/physics/SuspensionAdjuster.js

export class SuspensionAdjuster {
  constructor(suspension, drive) {
    this.suspension = suspension;
    this.drive = drive;
  }

  handleTransition({ wheel, from, to, height }) {
    console.log(`[SuspensionAdjuster] ${wheel}: ${from} -> ${to}, height: ${height.toFixed(3)}m`);

    if (height > 0) {
      // Going UP (asphalt -> curb)
      this._handleCurbUp(wheel, height);
    } else if (height < 0) {
      // Going DOWN (curb -> asphalt)
      this._handleCurbDown(wheel, Math.abs(height));
    }
  }

  _handleCurbUp(wheel, heightDelta) {
    const s = this.suspension.s[wheel];
    if (!s) return;

    // 1. Compress spring immediately
    s.cmd += heightDelta;
    s.x += heightDelta;

    // 2. Compensate body to stay level
    // Divide by 4 because we're adjusting for one wheel out of four
    this.drive._baseY += heightDelta / 4;

    // 3. Suspension engine will naturally settle from here
  }

  _handleCurbDown(wheel, heightDelta) {
    const s = this.suspension.s[wheel];
    if (!s) return;

    // 1. Extend spring immediately
    s.cmd -= heightDelta;
    s.x -= heightDelta;

    // 2. Compensate body to stay level
    this.drive._baseY -= heightDelta / 4;

    // 3. Suspension engine will naturally settle from here
  }
}
```

### Example 3: GameModeState.js Integration

```javascript
// src/states/GameModeState.js (additions)

import { CurbCollisionDetector } from '../physics/CurbCollisionDetector.js';
import { SuspensionAdjuster } from '../physics/SuspensionAdjuster.js';

// In constructor, add:
this.curbDetector = null;
this.suspAdjuster = null;

// In enter() method, after physics setup:
this.curbDetector = new CurbCollisionDetector(this.city);
this.suspAdjuster = new SuspensionAdjuster(this.susp, this.drive);

// In update(dt) method, before physics.update(dt):
if (this.curbDetector && this.suspAdjuster && this.busModel) {
  const busApi = resolveBusApi(this.busModel);
  const worldRoot = this.anchor; // or wherever the bus root is

  // Detect curb collisions
  this.curbDetector.update(busApi, worldRoot);

  // Handle transitions
  const transitions = this.curbDetector.getTransitions();
  for (const transition of transitions) {
    this.suspAdjuster.handleTransition(transition);
  }
}

// Then run physics as normal
this.physics.update(dt);

// In exit() method:
this.curbDetector = null;
this.suspAdjuster = null;
```

## Advanced Considerations

### 1. Smooth Transitions
For smoother curb transitions, consider:
- **Hysteresis**: Add a small buffer zone to prevent rapid surface switching
- **Gradual Compression**: Ramp compression over 2-3 frames instead of instant
- **Velocity Damping**: Reduce spring velocity on transition to prevent bounce

### 2. Multi-Surface Handling
Handle edge cases:
- **Diagonal Curbs**: Wheels crossing at angles
- **Intersection Corners**: Complex curb geometry
- **Partial Contact**: Wheel partially on curb edge

### 3. Performance Optimization
- Cache tile lookups per frame
- Only update when bus is moving
- Use spatial hashing for large cities

### 4. Visual Feedback
- Tire deformation on curb contact
- Dust/particle effects on surface transitions
- Sound effects for curb impacts

## Relevant Code Sections

### CityMap.js - Existing Methods
```javascript
// From src/city/CityMap.js

index(x, y) {
  return (x | 0) + (y | 0) * this.width;
}

inBounds(x, y) {
  return x >= 0 && y >= 0 && x < this.width && y < this.height;
}

tileToWorldCenter(x, y) {
  return {
    x: this.origin.x + x * this.tileSize,
    z: this.origin.z + y * this.tileSize
  };
}

worldToTile(x, z) {
  const tx = Math.round((x - this.origin.x) / this.tileSize);
  const ty = Math.round((z - this.origin.z) / this.tileSize);
  return { x: tx, y: ty };
}

getLanesAtIndex(idx) {
  return {
    n: this.lanesN[idx] ?? 0,
    e: this.lanesE[idx] ?? 0,
    s: this.lanesS[idx] ?? 0,
    w: this.lanesW[idx] ?? 0
  };
}
```

### SuspensionSim.js - State Structure
```javascript
// From src/physics/SuspensionSim.js

// Spring state (per wheel)
this.s = {
  fl: { x: 0, v: 0, cmd: 0, eff: 0 },
  fr: { x: 0, v: 0, cmd: 0, eff: 0 },
  rl: { x: 0, v: 0, cmd: 0, eff: 0 },
  rr: { x: 0, v: 0, cmd: 0, eff: 0 }
};

// Wheel positions (local to bus)
this.p = {
  fl: { x: -1.2, z:  2.6 },
  fr: { x:  1.2, z:  2.6 },
  rl: { x: -1.2, z: -2.6 },
  rr: { x:  1.2, z: -2.6 }
};

// Physics parameters
this.k = 360;        // spring stiffness
this.c = 140;        // damping coefficient
this.m = 18.0;       // mass per corner
this.travel = 0.22;  // max travel (meters)
```

### DriveSim.js - Position Control
```javascript
// From src/physics/DriveSim.js

bind(api, worldRoot, suspension = null) {
  this._baseY = this.worldRoot.position.y;
  // ... other initialization
}

fixedUpdate(dt) {
  // ... movement calculations

  // Set bus position
  this.worldRoot.position.x = this._rearPosWorld.x - rearOffsetWorld.x;
  this.worldRoot.position.z = this._rearPosWorld.z - rearOffsetWorld.z;
  this.worldRoot.position.y = this._baseY; // ← This is what we adjust
}
```

## Expected Behavior

### Scenario: Right Wheels on Curb
1. Bus drives with right wheels onto sidewalk
2. **Frame 1**: Detector identifies FR and RR on curb
3. **Frame 1**: Adjuster compresses FR and RR springs by 0.06m
4. **Frame 1**: Adjuster raises `_baseY` by 0.03m (0.06/2 for 2 wheels)
5. **Frames 2+**: Suspension settles, bus rolls slightly right, then stabilizes

### Scenario: All Wheels on Curb
1. Bus drives completely onto sidewalk
2. **Frame 1**: All wheels transition to curb
3. **Frame 1**: All springs compress by 0.06m
4. **Frame 1**: `_baseY` raised by 0.06m (full compensation)
5. **Frames 2+**: Bus stays level, minimal pitch/roll

### Scenario: Curb to Asphalt
1. Bus drives from sidewalk to road
2. **Frame 1**: Wheels transition to asphalt
3. **Frame 1**: Springs extend by 0.06m
4. **Frame 1**: `_baseY` lowered accordingly
5. **Frames 2+**: Suspension settles to normal ride height

## Debug Output Example

```
[CurbDetector] FL: ASPHALT (0.02m)
[CurbDetector] FR: CURB (0.08m) ← TRANSITION from ASPHALT
[CurbDetector] RL: ASPHALT (0.02m)
[CurbDetector] RR: ASPHALT (0.02m)

[SuspensionAdjuster] FR: ASPHALT -> CURB, height: 0.060m
  - Compressing FR spring by 0.060m
  - Adjusting baseY by +0.015m
  - Letting suspension settle...

[Suspension] FR compression: 0.060m -> 0.058m -> 0.055m -> ... (settling)
```

## Summary

This implementation provides realistic curb collision response by:
1. **Detecting** surface changes via CityMap queries
2. **Reacting** immediately with spring compression/extension
3. **Compensating** bus body position to prevent sudden jumps
4. **Settling** naturally via existing suspension physics

The system is modular, performant, and integrates cleanly with existing physics architecture.


