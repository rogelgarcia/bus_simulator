# AI Question: City Map Format and Street Generation

## Request

What I need to do is create a city map that is formatted and defined by you. In this map, you can represent:
- **Roads**: single way, double way, 1 lane, 2 lanes, and combinations
- **Buildings**: various types
- **Houses**: residential structures
- **Other elements**: parks, intersections, etc.

We need to generate 3D models for those elements with simulated textures and features.

**For now, let's focus on:**
1. Creating the map format with the streets
2. Making it load in the city

## Relevant File Paths

### Core City Files
- `src/city/City.js` - Main city container with sky dome, lights, fog, and world management
- `src/city/CityWorld.js` - Ground plane with grass texture
- `src/city/CityConfig.js` - Configuration constants for city generation (currently empty placeholder)
- `src/city/CityMap.js` - Grid-based city layout and tile management (currently empty placeholder)
- `src/city/CityNavGraph.js` - Navigation graph for pathfinding (currently empty placeholder)
- `src/city/CityRNG.js` - Seeded random number generator for deterministic generation (currently empty placeholder)

### Generators (All currently empty placeholders)
- `src/city/generators/RoadGenerator.js` - Road network generation
- `src/city/generators/BuildingGenerator.js` - Procedural building generation
- `src/city/generators/MarkingsGenerator.js` - Road markings and lane lines
- `src/city/generators/PropGenerator.js` - Street furniture and props
- `src/city/generators/TerrainGenerator.js` - Terrain height and features
- `src/city/generators/VegetationGenerator.js` - Trees, grass, and foliage placement
- `src/city/generators/SkyGenerator.js` - Sky and atmospheric effects

### Materials and Models
- `src/city/materials/CityTextures.js` - Procedural texture generation (has grass texture generator)
- `src/city/materials/CityMaterials.js` - Shared materials (currently empty placeholder)
- `src/city/models/StreetLamp.js` - Street lamp 3D model (placeholder)
- `src/city/models/TrafficLight.js` - Traffic light 3D model (placeholder)
- `src/city/models/Trees.js` - Tree 3D models (placeholder)

### State Management
- `src/states/CityState.js` - City exploration state with camera controls
- `src/main.js` - Application entry point
- `src/engine/GameEngine.js` - Core game engine with Three.js renderer

## Current Implementation Context

### src/city/City.js (176 lines)
```javascript
// src/city/City.js
import * as THREE from 'three';
import { createCityWorld } from './CityWorld.js';

function srgbToLinearColor(hex) {
    const c = new THREE.Color(hex);
    if (c.convertSRGBToLinear) c.convertSRGBToLinear();
    return c;
}

function createGradientSkyDome({
    radius = 1400,
    top = '#2f7fe8',
    horizon = '#eaf7ff',
    sunDir = new THREE.Vector3(0.6, 0.9, 0.25).normalize(),
    sunIntensity = 0.28
} = {}) {
    const geom = new THREE.SphereGeometry(radius, 32, 16);
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTop: { value: srgbToLinearColor(top) },
            uHorizon: { value: srgbToLinearColor(horizon) },
            uSunDir: { value: sunDir.clone().normalize() },
            uSunIntensity: { value: sunIntensity }
        },
        vertexShader: `
            varying vec3 vDir;
            void main() {
                vDir = normalize(position);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uTop;
            uniform vec3 uHorizon;
            uniform vec3 uSunDir;
            uniform float uSunIntensity;
            varying vec3 vDir;

            void main() {
                float y = clamp(vDir.y, -0.25, 1.0);
                float t = smoothstep(-0.05, 0.85, y);
                t = pow(t, 1.35);
                vec3 col = mix(uHorizon, uTop, t);
                float haze = 1.0 - smoothstep(-0.02, 0.20, y);
                col = mix(col, uHorizon, haze * 0.25);
                float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
                float sun = pow(s, 900.0) * uSunIntensity;
                float glow = pow(s, 12.0) * uSunIntensity * 0.35;
                col += vec3(1.0) * (sun + glow);
                gl_FragColor = vec4(col, 1.0);
            }
        `,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: true,
        toneMapped: false
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = 'CitySkyDome';
    mesh.frustumCulled = false;
    mesh.renderOrder = -1000;
    return mesh;
}

export class City {
    constructor({ size = 800, tileMeters = 2 } = {}) {
        this.config = {
            size,
            tileMeters,
            fogColor: '#dff3ff',
            fogNear: 80,
            fogFar: 900,
            cameraFar: 2500
        };

        this.group = new THREE.Group();
        this.group.name = 'City';

        // Lights
        this.hemi = new THREE.HemisphereLight(0xffffff, 0x2a3b1f, 0.85);
        this.hemi.position.set(0, 100, 0);
        this.group.add(this.hemi);

        this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
        this.sun.position.set(80, 140, 60);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        this.sun.shadow.camera.near = 1;
        this.sun.shadow.camera.far = 600;
        this.sun.shadow.camera.left = -220;
        this.sun.shadow.camera.right = 220;
        this.sun.shadow.camera.top = 220;
        this.sun.shadow.camera.bottom = -220;
        this.group.add(this.sun);

        // Sky (world-up anchored)
        this.sky = createGradientSkyDome({
            top: '#2f7fe8',
            horizon: '#eaf7ff',
            sunDir: this.sun.position.clone().normalize(),
            sunIntensity: 0.28
        });
        this.group.add(this.sky);

        // Ground/world
        this.world = createCityWorld({ size, tileMeters });
        this.group.add(this.world.group);

        this._attached = false;
        this._restore = null;
    }

    attach(engine) {
        if (this._attached) return;
        this._restore = {
            bg: engine.scene.background,
            fog: engine.scene.fog,
            far: engine.camera.far
        };
        engine.scene.background = null;
        engine.scene.fog = new THREE.Fog(this.config.fogColor, this.config.fogNear, this.config.fogFar);
        engine.camera.far = Math.max(engine.camera.far, this.config.cameraFar);
        engine.camera.updateProjectionMatrix();
        engine.scene.add(this.group);
        this._attached = true;
    }

    detach(engine) {
        if (!this._attached) return;
        engine.scene.remove(this.group);
        if (this._restore) {
            engine.scene.background = this._restore.bg ?? null;
            engine.scene.fog = this._restore.fog ?? null;
            engine.camera.far = this._restore.far ?? engine.camera.far;
            engine.camera.updateProjectionMatrix();
        }
        this._restore = null;
        this._attached = false;
    }

    update(engine) {
        // Keep sky centered on camera (no parallax)
        this.sky.position.copy(engine.camera.position);
    }
}

export function getSharedCity(engine, options = {}) {
    // cache inside engine context so both states use the SAME city instance
    engine.context.city ??= new City(options);
    return engine.context.city;
}
```


### src/city/CityWorld.js (56 lines)
```javascript
// src/city/CityWorld.js
import * as THREE from 'three';

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if ('colorSpace' in tex) tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

export function createCityWorld({ size = 800, tileMeters = 2 } = {}) {
    const group = new THREE.Group();
    group.name = 'CityWorld';

    // Floor
    const floorGeo = new THREE.PlaneGeometry(size, size, 1, 1);
    floorGeo.rotateX(-Math.PI / 2);

    const floorMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 1.0,
        metalness: 0.0
    });

    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.name = 'CityFloor';
    floor.receiveShadow = true;
    group.add(floor);

    // Grass texture
    const grassUrl = new URL('../../assets/grass.png', import.meta.url);
    const loader = new THREE.TextureLoader();

    loader.load(
        grassUrl.href,
        (tex) => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            const repeats = Math.max(1, size / Math.max(0.1, tileMeters));
            tex.repeat.set(repeats, repeats);
            tex.anisotropy = 16;
            applyTextureColorSpace(tex, { srgb: true });
            floor.material.map = tex;
            floor.material.needsUpdate = true;
        },
        undefined,
        (err) => console.warn('[CityWorld] Failed to load grass texture:', grassUrl.href, err)
    );

    return { group, floor };
}

export default createCityWorld;
```

### src/city/CityConfig.js (currently empty)
```javascript
// src/city/CityConfig.js
```

### src/city/CityMap.js (currently empty)
```javascript
// src/city/CityMap.js
```

### src/city/CityNavGraph.js (currently empty)
```javascript
// src/city/CityNavGraph.js
```

### src/city/CityRNG.js (currently empty)
```javascript
// src/city/CityRNG.js
```

### src/city/generators/RoadGenerator.js (currently empty)
```javascript
// src/city/generators/RoadGenerator.js
```

### src/city/generators/BuildingGenerator.js (currently empty)
```javascript
// src/city/generators/BuildingGenerator.js
```


### src/city/materials/CityTextures.js (124 lines - procedural texture generation)
```javascript
// src/city/materials/CityTextures.js
import * as THREE from 'three';

let _cached = null;

function makeCanvas(size) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    return { c, ctx };
}

function rand(seedObj) {
    seedObj.v = (seedObj.v * 1664525 + 1013904223) >>> 0;
    return seedObj.v / 4294967295;
}

function clamp255(v) {
    return Math.max(0, Math.min(255, v));
}

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if ('colorSpace' in tex) tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function canvasToTexture(canvas, { repeatX = 1, repeatY = 1, srgb = true } = {}) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = 16;
    applyTextureColorSpace(tex, { srgb });
    tex.needsUpdate = true;
    return tex;
}

function generateGrass({ size = 512, repeat = 200 } = {}) {
    const seedObj = { v: 13371337 };
    const { c, ctx } = makeCanvas(size);

    // Base fill
    ctx.fillStyle = '#2f6f33';
    ctx.fillRect(0, 0, size, size);

    // Pixel noise (tile-friendly)
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;

    for (let i = 0; i < d.length; i += 4) {
        const n1 = rand(seedObj);
        const n2 = rand(seedObj);
        const baseG = 105 + n1 * 70;
        const baseR = 35 + n2 * 35;
        const baseB = 30 + (rand(seedObj)) * 25;
        d[i + 0] = clamp255(baseR);
        d[i + 1] = clamp255(baseG);
        d[i + 2] = clamp255(baseB);
        d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    // Soft patches (darker + lighter)
    for (let i = 0; i < 60; i++) {
        const x = rand(seedObj) * size;
        const y = rand(seedObj) * size;
        const rx = 18 + rand(seedObj) * 70;
        const ry = 18 + rand(seedObj) * 70;
        const alpha = 0.04 + rand(seedObj) * 0.05;
        const dark = rand(seedObj) < 0.6;
        ctx.fillStyle = dark
            ? `rgba(10,20,10,${alpha})`
            : `rgba(255,255,255,${alpha * 0.6})`;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, rand(seedObj) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
    }

    // Tiny specks (flowers-ish noise)
    for (let i = 0; i < 1800; i++) {
        const x = rand(seedObj) * size;
        const y = rand(seedObj) * size;
        const r = 0.3 + rand(seedObj) * 0.9;
        const a = 0.05 + rand(seedObj) * 0.10;
        const bright = 160 + rand(seedObj) * 80;
        ctx.fillStyle = `rgba(${bright * 0.6},${bright},${bright * 0.6},${a})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Roughness map
    const { c: rC, ctx: rCtx } = makeCanvas(size);
    const rImg = rCtx.getImageData(0, 0, size, size);
    const rd = rImg.data;
    const seedObj2 = { v: 42424242 };

    for (let i = 0; i < rd.length; i += 4) {
        const v = clamp255(220 + (rand(seedObj2) - 0.5) * 30);
        rd[i] = v; rd[i + 1] = v; rd[i + 2] = v; rd[i + 3] = 255;
    }
    rCtx.putImageData(rImg, 0, 0);

    const map = canvasToTexture(c, { repeatX: repeat, repeatY: repeat, srgb: true });
    const roughnessMap = canvasToTexture(rC, { repeatX: repeat, repeatY: repeat, srgb: false });

    return { map, roughnessMap };
}

export function getCityTextures() {
    if (_cached) return _cached;
    const grass = generateGrass({ size: 512, repeat: 200 });
    _cached = { grass };
    return _cached;
}
```

### src/states/CityState.js (203 lines - how city is loaded and used)
```javascript
// src/states/CityState.js
import * as THREE from 'three';
import { getSharedCity } from '../city/City.js';

export class CityState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;
        this.canvas = engine.canvas;
        this.city = null;
        this._keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
        this._yaw = 0;
        this._pitch = 0;
        this._moveSpeed = 10;
        this._lookSpeed = 0.002;
        // ... event handlers setup
    }

    enter() {
        // Hide menus
        document.body.classList.remove('splash-bg');
        // ... UI cleanup

        // fresh scene
        this.engine.clearScene();

        // attach shared city (city owns sky/lights/fog config)
        this.city = getSharedCity(this.engine, { size: 800, tileMeters: 2 });
        this.city.attach(this.engine);

        // camera start
        const cam = this.engine.camera;
        cam.position.set(0, 2.0, 12);
        cam.rotation.order = 'YXZ';
        cam.lookAt(0, 2.0, 0);

        this._yaw = cam.rotation.y;
        this._pitch = cam.rotation.x;

        // input setup...
    }

    update(dt) {
        const cam = this.engine.camera;

        // city maintenance (sky anchored to horizon/world-up)
        this.city?.update(this.engine);

        // apply look
        cam.rotation.order = 'YXZ';
        cam.rotation.y = this._yaw;
        cam.rotation.x = this._pitch;

        // movement on XZ plane
        const fwd = new THREE.Vector3(-Math.sin(this._yaw), 0, -Math.cos(this._yaw));
        const right = new THREE.Vector3(Math.cos(this._yaw), 0, -Math.sin(this._yaw));

        const move = new THREE.Vector3();
        if (this._keys.ArrowUp) move.add(fwd);
        if (this._keys.ArrowDown) move.addScaledVector(fwd, -1);
        if (this._keys.ArrowRight) move.add(right);
        if (this._keys.ArrowLeft) move.addScaledVector(right, -1);

        if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(this._moveSpeed * dt);
            cam.position.add(move);
        }

        // keep eye height
        cam.position.y = 2.0;
    }
}
```


## Project Structure

```
simulation_bus/
├── index.html                          # Main HTML entry point
├── assets/
│   ├── grass.png                       # Grass texture for ground
│   ├── citybus.webp                    # Bus texture atlas
│   ├── main.png                        # Splash background
│   └── splash.svg                      # Branding graphic
└── src/
    ├── main.js                         # Application bootstrap
    ├── engine/
    │   ├── GameEngine.js               # Three.js renderer & scene
    │   └── StateMachine.js             # State management
    ├── states/
    │   ├── WelcomeState.js             # Welcome screen
    │   ├── BusSelectState.js           # Bus selection
    │   ├── CityState.js                # City exploration (free camera)
    │   ├── GameModeState.js            # Game mode (with bus)
    │   └── TestModeState.js            # Test mode
    ├── city/
    │   ├── City.js                     # Main city container ✅ IMPLEMENTED
    │   ├── CityWorld.js                # Ground plane ✅ IMPLEMENTED
    │   ├── CityConfig.js               # Config constants ⚠️ EMPTY
    │   ├── CityMap.js                  # Grid layout ⚠️ EMPTY
    │   ├── CityNavGraph.js             # Navigation graph ⚠️ EMPTY
    │   ├── CityRNG.js                  # Seeded RNG ⚠️ EMPTY
    │   ├── generators/
    │   │   ├── RoadGenerator.js        # Road generation ⚠️ EMPTY
    │   │   ├── BuildingGenerator.js    # Building generation ⚠️ EMPTY
    │   │   ├── MarkingsGenerator.js    # Road markings ⚠️ EMPTY
    │   │   ├── PropGenerator.js        # Street furniture ⚠️ EMPTY
    │   │   ├── TerrainGenerator.js     # Terrain ⚠️ EMPTY
    │   │   ├── VegetationGenerator.js  # Trees/plants ⚠️ EMPTY
    │   │   └── SkyGenerator.js         # Sky effects ⚠️ EMPTY
    │   ├── materials/
    │   │   ├── CityTextures.js         # Procedural textures ✅ HAS GRASS
    │   │   └── CityMaterials.js        # Shared materials ⚠️ EMPTY
    │   ├── models/
    │   │   ├── StreetLamp.js           # Street lamp model ⚠️ EMPTY
    │   │   ├── TrafficLight.js         # Traffic light model ⚠️ EMPTY
    │   │   └── Trees.js                # Tree models ⚠️ EMPTY
    │   └── engines/
    │       ├── VehicleEngine.js        # Vehicle simulation ⚠️ EMPTY
    │       ├── TrafficLightEngine.js   # Traffic lights ⚠️ EMPTY
    │       └── PedestrianEngine.js     # Pedestrians ⚠️ EMPTY
    ├── buses/                          # Bus models and controls
    ├── physics/                        # Physics simulation
    ├── environment/                    # Garage environment
    ├── hud/                            # HUD elements
    └── utils/                          # Utility functions
```

## Key Technical Details

### Three.js Setup
- **Version**: Three.js v0.160.0 (loaded via CDN)
- **Renderer**: WebGL with ACES Filmic tone mapping
- **Color Management**: sRGB color space enabled
- **Shadows**: PCF soft shadows enabled
- **Coordinate System**: Y-up (standard Three.js)

### Current City Configuration
- **Size**: 800 units (configurable)
- **Tile Meters**: 2 (configurable)
- **Camera Far**: 2500 units
- **Fog**: Linear fog (near: 80, far: 900)
- **Lighting**:
  - Hemisphere light (sky: 0xffffff, ground: 0x2a3b1f, intensity: 0.85)
  - Directional light (sun) with shadows (intensity: 1.2)

### How City is Currently Loaded
1. `CityState.enter()` calls `getSharedCity(engine, { size: 800, tileMeters: 2 })`
2. `getSharedCity()` creates or retrieves cached `City` instance
3. `City` constructor creates:
   - Sky dome (gradient shader with sun glow)
   - Hemisphere and directional lights
   - Ground plane via `createCityWorld()`
4. `city.attach(engine)` adds city to scene and sets fog/camera
5. `city.update(engine)` keeps sky centered on camera each frame

### Existing Procedural Texture System
The `CityTextures.js` file demonstrates the pattern for creating procedural textures:
- Canvas-based generation with seeded random numbers
- Support for color maps and roughness maps
- Texture wrapping and repeat configuration
- Proper color space handling (sRGB vs linear)

## What Needs to Be Implemented

Based on the request, you need to:

1. **Define a city map format** that can represent:
   - Roads (single/double way, 1/2 lanes, combinations)
   - Buildings
   - Houses
   - Other urban elements

2. **Implement the map data structure** in `CityMap.js` and `CityConfig.js`

3. **Create the RoadGenerator** to:
   - Generate 3D road geometry from the map
   - Create different road types (single/double way, lanes)
   - Generate procedural road textures (asphalt, lane markings)
   - Handle intersections

4. **Integrate the road generation** into the City class so roads appear when the city loads

5. **Make it extensible** for future building/house generation

## Questions to Consider

1. What map format would work best? (Grid-based? Graph-based? Tile-based?)
2. How should roads be represented in the data structure?
3. What parameters define different road types?
4. How should intersections be handled?
5. How should the road geometry be generated (procedural meshes)?
6. What textures/materials are needed for roads?
7. How should the map integrate with the existing City class?
8. Should the map be procedurally generated or loaded from data?

## Expected Deliverables

Please provide:
1. A city map format specification
2. Implementation plan for `CityMap.js`, `CityConfig.js`, and `RoadGenerator.js`
3. How to integrate road generation into the existing `City.js` workflow
4. Example map data showing different road types
5. Approach for generating 3D road geometry and textures

