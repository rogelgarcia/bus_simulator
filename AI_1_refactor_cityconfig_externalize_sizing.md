# Request

About moving sizes out of CityConfig

I didn't change src/city/CityConfig.js yet, because removing config.road / config.ground is very likely to break whichever files currently read those values (physics, terrain, world init, etc.), and I don't have those consumers here.

Please attach the files that read config.road / config.ground (quick guesses: src/city/City.js, src/city/CityWorld.js, graphics/assets3d/generators/TerrainGenerator.js, and anything in src/physics/** referencing curb/road height). Once I have those, I'll:

1. Strip all sizing from CityConfig so it's layout-only
2. Switch the consumers to use generator-owned params (or shared generator params where needed)

I needed the parameters for city and road creation to be externalized. CityConfig should not have to define how the road is created, but only define the layout.

For this refactoring, attach more files: City, Terrain, etc.

## Additional Requirements

- Make each curb corner one different color, so by the screenshot it is possible to identify. Group by orientation NW, NE, etc. and by junction type.
- Do the same coloring for the corner sidewalks

## Project Rules

## Directory Structure

**Graphics Organization:**
- All graphics-related code → `/graphics`
  - 3D assets (models, geometries, generators, Three.js code) → `/graphics/assets3d/`
  - GUI/Visual (CSS, widgets, HUD, UI components) → `/graphics/gui/`

**Principle:** Keep rendering/visual code separate from business logic in `/src`

## Code Style

**Comments:**
- No comments in code files
- Exception: First line must be a comment with the file path (e.g., `// graphics/assets3d/generators/RoadGenerator.js`)

## Requirements

- All outputs must be the entire file (modified or created)
- If a refactoring is needed, that can be done
- If there is a convention but it seems wrong, that can be changed
- In the beginning of the response, include the list of files that were changed, include also a separator between the contents
- If a crucial file is missing, request the file prior to making any changes

## Project Structure

./AI_PROMPT_INSTRUCTIONS.md
./PROJECT_RULES.md
./graphics/assets3d/buses.js
./graphics/assets3d/environment.js
./graphics/assets3d/factories/BusCatalog.js
./graphics/assets3d/factories/BusFactory.js
./graphics/assets3d/factories/tuneBusMaterials.js
./graphics/assets3d/generators/GeneratorParams.js
./graphics/assets3d/generators/RoadGenerator.js
./graphics/assets3d/generators/SkyGenerator.js
./graphics/assets3d/generators/TerrainGenerator.js
./graphics/assets3d/models/buses/CityBus.js
./graphics/assets3d/models/buses/CoachBus.js
./graphics/assets3d/models/buses/DoubleDeckerBus.js
./graphics/assets3d/models/buses/components/BusWheel.js
./graphics/assets3d/models/buses/components/WheelRig.js
./graphics/assets3d/models/environment/GarageModel.js
./graphics/assets3d/models/environment/ProceduralTextures.js
./graphics/assets3d/textures/CityMaterials.js
./graphics/assets3d/textures/CityTextures.js
./graphics/gui/GameHUD.js
./graphics/gui/HUDStyles.js
./graphics/gui/index.js
./graphics/gui/styles.css
./graphics/gui/utils/screenFade.js
./graphics/gui/widgets/GaugeWidget.js
./graphics/gui/widgets/PedalWidget.js
./graphics/gui/widgets/SteeringWheelWidget.js
./src/city/City.js
./src/city/CityConfig.js
./src/city/CityMap.js
./src/city/CityRNG.js
./src/city/CityWorld.js
./src/core/EventBus.js
./src/core/GameEngine.js
./src/core/GameLoop.js
./src/core/SimulationContext.js
./src/core/StateMachine.js
./src/core/VehicleManager.js
./src/input/InputManager.js
./src/input/RampedControl.js
./src/main.js
./src/physics/CurbCollisionDetector.js
./src/physics/DriveSim.js
./src/physics/PhysicsController.js
./src/physics/PhysicsLoop.js
./src/physics/SuspensionSim.js
./src/physics/systems/BrakeSystem.js
./src/physics/systems/CollisionSystem.js
./src/physics/systems/DemoDrivetrainSim.js
./src/physics/systems/DrivetrainSystem.js
./src/physics/systems/LocomotionSystem.js
./src/physics/systems/RearAxleBicycleModelSystem.js
./src/physics/systems/SuspensionSystem.js
./src/skeletons/buses/BusSkeleton.js
./src/utils/animate.js
./src/vehicle/VehicleController.js
./src/vehicle/createVehicle.js
./states/BusSelectState.js
./states/CityState.js
./states/GameplayState.js
./states/TestModeState.js
./states/WelcomeState.js
./tests/core.test.js

## Attached Files

Files attached:
- src/city/City.js
- src/city/CityConfig.js
- src/city/CityWorld.js
- graphics/assets3d/generators/TerrainGenerator.js
- graphics/assets3d/generators/RoadGenerator.js
- graphics/assets3d/generators/GeneratorParams.js
- src/physics/CurbCollisionDetector.js
- src/physics/systems/CollisionSystem.js


---
src/city/City.js
---
// src/city/City.js
import * as THREE from 'three';
import { createCityWorld } from './CityWorld.js';
import { createCityConfig } from './CityConfig.js';
import { CityMap } from './CityMap.js';
import { CityRNG } from './CityRNG.js';
import { getCityMaterials } from '../../graphics/assets3d/textures/CityMaterials.js';
import { generateRoads } from '../../graphics/assets3d/generators/RoadGenerator.js';
import { createGradientSkyDome } from '../../graphics/assets3d/generators/SkyGenerator.js';

export class City {
    constructor(options = {}) {
        const {
            size = 800,
            tileMeters = 2,
            mapTileSize = 16,
            seed = 'demo-001',
            mapSpec = null
        } = options;

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

        // Sky
        this.sky = createGradientSkyDome({
            top: '#2f7fe8',
            horizon: '#eaf7ff',
            sunDir: this.sun.position.clone().normalize(),
            sunIntensity: 0.28
        });
        this.group.add(this.sky);

        // Generation config + deterministic RNG
        this.genConfig = createCityConfig({ size, tileMeters, mapTileSize, seed });
        this.rng = new CityRNG(this.genConfig.seed);

        // Map
        const spec = mapSpec ?? CityMap.demoSpec(this.genConfig);
        this.map = CityMap.fromSpec(spec, this.genConfig);

        // World (raised ground tiles using map)
        this.world = createCityWorld({
            size,
            tileMeters,
            map: this.map,
            groundY: this.genConfig.ground.surfaceY
        });
        this.group.add(this.world.group);

        // Roads + sidewalks + curbs
        this.materials = getCityMaterials();
        this.roads = generateRoads({ map: this.map, config: this.genConfig, materials: this.materials });
        this.group.add(this.roads.group);

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
        this.sky.position.copy(engine.camera.position);
    }
}

export function getSharedCity(engine, options = {}) {
    engine.context.city ??= new City(options);
    return engine.context.city;
}

---
src/city/CityConfig.js
---
export function createCityConfig({
                                     size = 800,
                                     tileMeters = 2,
                                     mapTileSize = 16,
                                     seed = 'city-demo'
                                 } = {}) {
    const gridW = Math.max(1, Math.floor(size / mapTileSize));
    const gridH = gridW;

    const originX = -size / 2 + mapTileSize / 2;
    const originZ = -size / 2 + mapTileSize / 2;

    // Scale references:
    // - Typical bus wheel radius knowing this project’s conventions is ~0.55m
    // - Good visible curb height is ~0.15–0.18m => pick 0.17m (~31% of wheel radius)
    const curbHeight = 0.17;

    const roadSurfaceY = 0.02;
    const groundSurfaceY = roadSurfaceY + curbHeight;

    return {
        size,
        tileMeters,
        seed,
        map: {
            tileSize: mapTileSize,
            width: gridW,
            height: gridH,
            origin: { x: originX, z: originZ }
        },

        road: {
            surfaceY: roadSurfaceY,
            laneWidth: 3.2,
            shoulder: 0.35,

            sidewalk: {
                extraWidth: 1.25,
                cornerRadius: 1.8,
                lift: 0.001,

                // Small overlap to ensure sidewalks meet curbs at corners (prevents tiny grass wedges).
                inset: 0.06
            },

            // Smooth street turns (visual-only)
            curves: {
                // IMPORTANT: For tileSize=16, max usable is ~8. We intentionally allow large radius.
                // Big radius makes corner connections read like proper curved streets.
                turnRadius: 6.8,

                // Smoothness
                asphaltArcSegments: 40,
                curbArcSegments: 24
            },

            markings: {
                lineWidth: 0.12,
                edgeInset: 0.22,
                lift: 0.003
            },

            curb: {
                thickness: 0.32,
                height: curbHeight,
                extraHeight: 0.0,
                sink: 0.03
            }
        },

        ground: {
            surfaceY: groundSurfaceY
        }
    };
}

---
src/city/CityWorld.js
---
// src/city/CityWorld.js
// Re-export from TerrainGenerator for backward compatibility
export { createCityWorld } from '../../graphics/assets3d/generators/TerrainGenerator.js';
export { createCityWorld as default } from '../../graphics/assets3d/generators/TerrainGenerator.js';

---
graphics/assets3d/generators/TerrainGenerator.js
---
// graphics/assets3d/generators/TerrainGenerator.js
import * as THREE from 'three';
import { TILE } from '../../../src/city/CityMap.js';

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if ('colorSpace' in tex) tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

export function createCityWorld({ size = 800, tileMeters = 2, map = null, groundY = 0 } = {}) {
    const group = new THREE.Group();
    group.name = 'CityWorld';

    // Base floor at y=0 (background)
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

    // Raised ground tiles (skip ROAD tiles)
    let groundTiles = null;
    let tilesMat = null;

    if (map) {
        const tileGeo = new THREE.PlaneGeometry(map.tileSize, map.tileSize, 1, 1);
        tileGeo.rotateX(-Math.PI / 2);

        tilesMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0
        });

        groundTiles = new THREE.InstancedMesh(tileGeo, tilesMat, map.width * map.height);
        groundTiles.name = 'GroundTiles';
        groundTiles.receiveShadow = true;

        const dummy = new THREE.Object3D();
        let k = 0;

        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const idx = map.index(x, y);
                if (map.kind[idx] === TILE.ROAD) continue;

                const p = map.tileToWorldCenter(x, y);
                dummy.position.set(p.x, groundY, p.z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();

                groundTiles.setMatrixAt(k++, dummy.matrix);
            }
        }

        groundTiles.count = k;
        groundTiles.instanceMatrix.needsUpdate = true;

        group.add(groundTiles);
    }

    // Grass texture
    const grassUrl = new URL('../../../assets/grass.png', import.meta.url);
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

            if (tilesMat && map) {
                const t2 = tex.clone();
                t2.wrapS = THREE.RepeatWrapping;
                t2.wrapT = THREE.RepeatWrapping;

                const tileRepeat = Math.max(1, map.tileSize / Math.max(0.1, tileMeters));
                t2.repeat.set(tileRepeat, tileRepeat);
                t2.anisotropy = 16;
                applyTextureColorSpace(t2, { srgb: true });

                tilesMat.map = t2;
                tilesMat.needsUpdate = true;
            }
        },
        undefined,
        (err) => console.warn('[CityWorld] Failed to load grass texture:', grassUrl.href, err)
    );

    return { group, floor, groundTiles };
}

---
graphics/assets3d/generators/RoadGenerator.js
---
// graphics/assets3d/generators/RoadGenerator.js
import * as THREE from 'three';
import { TILE, AXIS, DIR } from '../../../src/city/CityMap.js';
import { ROAD_DEFAULTS, GROUND_DEFAULTS } from './GeneratorParams.js';

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function bitCount4(m) {
    // DIR is {N:1,E:2,S:4,W:8} -> only 4 bits
    m = m & 0x0f;
    m = (m & 0x05) + ((m >> 1) & 0x05);
    m = (m & 0x03) + ((m >> 2) & 0x03);
    return m;
}

function isObj(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, over) {
    if (!isObj(base)) return over;
    const out = { ...base };
    if (!isObj(over)) return out;

    for (const k of Object.keys(over)) {
        const bv = base[k];
        const ov = over[k];
        if (isObj(bv) && isObj(ov)) out[k] = deepMerge(bv, ov);
        else out[k] = ov;
    }
    return out;
}

/**
 * IMPORTANT (curves + rotation):
 * - RingGeometry / Shape arcs are authored in XY (angles measured toward +Y).
 * - We rotate them onto XZ using rotateX(-PI/2) so normals point +Y.
 * - That mapping sends local +Y -> world -Z, which mirrors Z.
 *
 * Therefore: any "quadrant" angle mapping that is based on world (+X,+Z) must flip signZ.
 */
function cornerStartAngle(signX, signZ) {
    // Map world quadrant (signX, signZ) into geometry-angle quadrant.
    // Because local +Y becomes world -Z, we must invert signZ.
    const sz = -signZ;

    // Returns start angle for arc in the quadrant:
    // NE: 0..90, NW: 90..180, SW: 180..270, SE: 270..360
    if (signX === 1 && sz === 1) return 0;
    if (signX === -1 && sz === 1) return Math.PI * 0.5;
    if (signX === -1 && sz === -1) return Math.PI;
    return Math.PI * 1.5; // (1, -1)
}

function wrapAngle(a) {
    const twoPi = Math.PI * 2;
    a = a % twoPi;
    if (a < 0) a += twoPi;
    return a;
}

function turnStartAngle(signX, signZ) {
    // For CORNER (turn) tiles, we need the *inside* quadrant relative to the arc center.
    return wrapAngle(cornerStartAngle(signX, signZ) + Math.PI);
}

function intersectionCornerStartAngle(signX, signZ) {
    // For intersection sidewalk corners we want the fillet arc that is tangent to the two straight curb segments.
    // That fillet is the *opposite* quadrant relative to the fillet center.
    return wrapAngle(cornerStartAngle(signX, signZ) + Math.PI);
}

function connToCornerSigns(connMask) {
    const n = (connMask & DIR.N) !== 0;
    const e = (connMask & DIR.E) !== 0;
    const s = (connMask & DIR.S) !== 0;
    const w = (connMask & DIR.W) !== 0;

    if (n && e) return { signX: 1, signZ: 1, dirs: 'NE' };
    if (n && w) return { signX: -1, signZ: 1, dirs: 'NW' };
    if (s && e) return { signX: 1, signZ: -1, dirs: 'SE' };
    if (s && w) return { signX: -1, signZ: -1, dirs: 'SW' };
    return null;
}

function ensureNonIndexedWithUV(g) {
    const gg = g.index ? g.toNonIndexed() : g;
    if (!gg.attributes.uv) {
        const pos = gg.attributes.position;
        const uv = new Float32Array((pos.count || (pos.array.length / 3)) * 2);
        gg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    return gg;
}

function mergeBufferGeometries(geoms) {
    if (!geoms || geoms.length === 0) return null;

    let totalVerts = 0;
    for (const g0 of geoms) {
        const g = ensureNonIndexedWithUV(g0);
        totalVerts += g.attributes.position.count;
    }

    const outPos = new Float32Array(totalVerts * 3);
    const outNor = new Float32Array(totalVerts * 3);
    const outUv = new Float32Array(totalVerts * 2);

    let v = 0;
    for (const g0 of geoms) {
        const g = ensureNonIndexedWithUV(g0);

        outPos.set(g.attributes.position.array, v * 3);
        outNor.set(g.attributes.normal.array, v * 3);
        outUv.set(g.attributes.uv.array, v * 2);

        v += g.attributes.position.count;
    }

    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(outNor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(outUv, 2));
    out.computeBoundingSphere?.();
    return out;
}

/**
 * Mirrors a (non-indexed) geometry across X/Z by scale(signX, 1, signZ),
 * but fixes triangle winding for odd reflections so faces stay front-facing.
 */
function applyQuadrantMirrorNonIndexed(geom, signX, signZ) {
    const g = geom.index ? geom.toNonIndexed() : geom;

    const m = new THREE.Matrix4().makeScale(signX, 1, signZ);
    g.applyMatrix4(m);

    // Odd number of axis flips (determinant < 0) => reverse winding
    if (signX * signZ < 0) {
        const pos = g.attributes.position.array;
        const nor = g.attributes.normal?.array;
        const uv = g.attributes.uv?.array;

        // Each tri: 3 verts => pos stride 9, uv stride 6, nor stride 9
        for (let i = 0; i < pos.length; i += 9) {
            // swap v1 and v2
            for (let k = 0; k < 3; k++) {
                const a = i + 3 + k;
                const b = i + 6 + k;
                const tmp = pos[a];
                pos[a] = pos[b];
                pos[b] = tmp;
            }

            if (nor) {
                for (let k = 0; k < 3; k++) {
                    const a = i + 3 + k;
                    const b = i + 6 + k;
                    const tmp = nor[a];
                    nor[a] = nor[b];
                    nor[b] = tmp;
                }
            }

            if (uv) {
                const tri = (i / 9) | 0;
                const u = tri * 6;

                // swap uv1 and uv2 (2 floats each)
                for (let k = 0; k < 2; k++) {
                    const a = u + 2 + k;
                    const b = u + 4 + k;
                    const tmp = uv[a];
                    uv[a] = uv[b];
                    uv[b] = tmp;
                }
            }
        }

        g.attributes.position.needsUpdate = true;
        if (g.attributes.normal) g.attributes.normal.needsUpdate = true;
        if (g.attributes.uv) g.attributes.uv.needsUpdate = true;

        // Ensure lighting normals are sane after reflection/winding fix
        g.computeVertexNormals?.();
    }

    return g;
}

export function generateRoads({ map, config, materials } = {}) {
    const group = new THREE.Group();
    group.name = 'Roads';

    const ts = map.tileSize;

    // Generators own sizing defaults; config may optionally override (but CityConfig should not author these).
    const roadCfg = deepMerge(ROAD_DEFAULTS, config?.road ?? {});
    const groundCfg = deepMerge(GROUND_DEFAULTS, config?.ground ?? {});

    const roadY = roadCfg.surfaceY ?? 0.02;
    const laneWidth = roadCfg.laneWidth ?? 3.2;
    const shoulder = roadCfg.shoulder ?? 0.35;

    // Sidewalk / curb tuning
    const sidewalkExtra = roadCfg.sidewalk?.extraWidth ?? 0.0;
    const sidewalkLift = roadCfg.sidewalk?.lift ?? 0.001;

    // small intersection-only “snug” to eliminate tiny grass wedges between curb + sidewalk
    const sidewalkInset = roadCfg.sidewalk?.inset ?? 0.06;

    const curbCornerRadius = roadCfg.sidewalk?.cornerRadius ?? 1.4;

    const curbT = roadCfg.curb?.thickness ?? 0.32;
    const curbHeight = roadCfg.curb?.height ?? 0.17;
    const curbExtra = roadCfg.curb?.extraHeight ?? 0.0;
    const curbSink = roadCfg.curb?.sink ?? 0.03;

    // Overlap straight curb segments into curved arcs to hide seam/miter artifacts.
    const curbJoinOverlap = clamp(roadCfg.curb?.joinOverlap ?? curbT * 0.75, 0.0, curbT * 2.5);

    // Ground (sidewalk/grass) sits at curb top
    const groundY = groundCfg.surfaceY ?? (roadY + curbHeight);

    const curbTop = groundY + curbExtra;
    const curbBottom = roadY - curbSink;
    const curbH = Math.max(0.04, curbTop - curbBottom);
    const curbY = (curbTop + curbBottom) * 0.5;

    // Markings
    const markLineW = roadCfg.markings?.lineWidth ?? 0.12;
    const markEdgeInset = roadCfg.markings?.edgeInset ?? 0.22;
    const markLift = roadCfg.markings?.lift ?? 0.003;
    const markY = roadY + markLift;

    // Curves config
    const turnRadiusPref = roadCfg.curves?.turnRadius ?? 4.2;
    const asphaltArcSegs = clamp(roadCfg.curves?.asphaltArcSegments ?? 32, 12, 96) | 0;
    const curbArcSegs = clamp(roadCfg.curves?.curbArcSegments ?? 18, 8, 96) | 0;

    const roadMat = materials?.road ?? new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.95 });
    const sidewalkMat = materials?.sidewalk ?? new THREE.MeshStandardMaterial({ color: 0x8b8b8b, roughness: 1.0 });
    const curbMat = materials?.curb ?? new THREE.MeshStandardMaterial({ color: 0x6f6f6f, roughness: 1.0 });

    const laneWhiteMat = materials?.laneWhite ?? new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35 });
    const laneYellowMat = materials?.laneYellow ?? new THREE.MeshStandardMaterial({ color: 0xf2d34f, roughness: 0.35 });

    // unit plane (XZ)
    const planeGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    planeGeo.rotateX(-Math.PI / 2);

    // unit box
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    const roadCount = map.countRoadTiles();

    // Instanced layers
    const asphalt = new THREE.InstancedMesh(planeGeo, roadMat, Math.max(1, roadCount * 4));
    asphalt.name = 'Asphalt';
    asphalt.receiveShadow = true;

    const sidewalk = new THREE.InstancedMesh(planeGeo, sidewalkMat, Math.max(1, roadCount * 10));
    sidewalk.name = 'Sidewalk';
    sidewalk.receiveShadow = true;

    const curbBlocks = new THREE.InstancedMesh(boxGeo, curbMat, Math.max(1, roadCount * 72));
    curbBlocks.name = 'CurbBlocks';
    curbBlocks.castShadow = true;
    curbBlocks.receiveShadow = true;

    const markingsWhite = new THREE.InstancedMesh(planeGeo, laneWhiteMat, Math.max(1, roadCount * 10));
    markingsWhite.name = 'MarkingsWhite';

    const markingsYellow = new THREE.InstancedMesh(planeGeo, laneYellowMat, Math.max(1, roadCount * 8));
    markingsYellow.name = 'MarkingsYellow';

    const dummy = new THREE.Object3D();

    let a = 0;
    let s = 0;
    let cb = 0;
    let mw = 0;
    let my = 0;

    function addAsphaltPlane(x, y, z, sx, sz, ry = 0) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, 1, sz);
        dummy.updateMatrix();
        asphalt.setMatrixAt(a++, dummy.matrix);
    }

    function addSidewalkPlane(x, y, z, sx, sz, ry = 0) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, 1, sz);
        dummy.updateMatrix();
        sidewalk.setMatrixAt(s++, dummy.matrix);
    }

    function addMarkWhite(x, y, z, sx, sz, ry = 0) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, 1, sz);
        dummy.updateMatrix();
        markingsWhite.setMatrixAt(mw++, dummy.matrix);
    }

    function addMarkYellow(x, y, z, sx, sz, ry = 0) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, 1, sz);
        dummy.updateMatrix();
        markingsYellow.setMatrixAt(my++, dummy.matrix);
    }

    function addCurbBox(x, y, z, sx, sy, sz, ry = 0) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        curbBlocks.setMatrixAt(cb++, dummy.matrix);
    }

    // Curved geometry collectors
    const asphaltCurves = [];
    const sidewalkCurves = [];
    const curbCurves = [];

    function pushRingSectorXZ({ centerX, centerZ, y, innerR, outerR, startAng, spanAng, segs, outArray }) {
        if (!(outerR > innerR + 0.01)) return;

        const g = new THREE.RingGeometry(innerR, outerR, segs, 1, startAng, spanAng);
        g.rotateX(-Math.PI / 2);
        g.translate(centerX, y, centerZ);
        outArray.push(g);
    }

    function pushCurbArcSolid({ centerX, centerZ, radiusCenter, startAng, spanAng, curveSegs }) {
        // True curved curb: extruded ring sector (no block stepping).
        const innerR = Math.max(0.01, radiusCenter - curbT * 0.5);
        const outerR = radiusCenter + curbT * 0.5;

        const a0 = startAng;
        const a1 = startAng + spanAng;

        const shape = new THREE.Shape();
        // Outer arc CCW a0->a1
        shape.absarc(0, 0, outerR, a0, a1, false);
        // Inner arc back a1->a0 (to close the ring sector)
        shape.absarc(0, 0, innerR, a1, a0, true);
        shape.closePath();

        const g = new THREE.ExtrudeGeometry(shape, {
            depth: curbH,
            bevelEnabled: false,
            curveSegments: clamp(curveSegs ?? 24, 8, 128) | 0
        });

        // Shape is in XY plane; map to XZ with Y-up.
        // With rotateX(-90), extrusion depth (+Z) becomes +Y.
        g.rotateX(-Math.PI / 2);
        g.translate(centerX, curbBottom, centerZ);

        curbCurves.push(g);
    }

    function addCurvedCornerCurbsAndSidewalk({ pos, xInner, zInner, cornerXeff, cornerZeff, signX, signZ }) {
        // Sidewalk shape in this quadrant, avoiding curb overlap.
        // small inset to snug sidewalk into curb for intersections (prevents grass wedge)
        const xMin = xInner + curbT - sidewalkInset;
        const zMin = zInner + curbT - sidewalkInset;

        const xMax = ts * 0.5 + sidewalkExtra;
        const zMax = ts * 0.5 + sidewalkExtra;

        const dx = xMax - xMin;
        const dz = zMax - zMin;
        if (dx <= 0.02 || dz <= 0.02) return;

        // Fillet radius r is used for the curb centerline.
        const r = clamp(curbCornerRadius, 0.35, Math.min(cornerXeff, cornerZeff));
        if (r < 0.35) return;

        const x0 = xInner + curbT * 0.5; // straight curb centerline intersection (local quadrant)
        const z0 = zInner + curbT * 0.5;

        // Fillet center (offset outward by r in both axes)
        const cxLocal = x0 + r;
        const czLocal = z0 + r;

        // Sidewalk inner boundary should follow the *sidewalk-facing* curb face:
        // - For this intersection fillet (center sits in the corner), sidewalk is toward the circle center.
        // - Therefore sidewalk boundary matches the curb's INNER radius at the arc:
        //   rr = r - curbT/2 (plus inset overlap).
        // Ensure rr matches our chosen xMin/zMin so the arc meets the straight edges without a "chord" gap.
        const rrWanted = (r - curbT * 0.5) + sidewalkInset;
        const rrMaxX = cxLocal - xMin;
        const rrMaxZ = czLocal - zMin;
        const rr = clamp(rrWanted, 0.05, Math.min(rrMaxX, rrMaxZ));

        // Build the shape in +X/+Z quadrant then mirror, with winding fix (no backface holes).
        const shape = new THREE.Shape();
        shape.moveTo(xMin, zMax);
        shape.lineTo(xMax, zMax);
        shape.lineTo(xMax, zMin);
        shape.lineTo(cxLocal, zMin);
        shape.absarc(cxLocal, czLocal, rr, Math.PI * 1.5, Math.PI, true);
        shape.lineTo(xMin, zMax);

        let gSide = new THREE.ShapeGeometry(shape, Math.max(18, curbArcSegs));
        gSide.rotateX(-Math.PI / 2);
        gSide = applyQuadrantMirrorNonIndexed(gSide, signX, signZ);
        gSide.translate(pos.x, groundY + sidewalkLift, pos.z);
        sidewalkCurves.push(gSide);

        // ---- Curbs (straight segments + arc) ----
        // Straight segments shortened by r, but overlapped into the arc to hide the end-face mismatch.
        const segZBase = Math.max(0.05, cornerZeff - r);
        const segXBase = Math.max(0.05, cornerXeff - r);

        const segZLen = Math.max(0.05, segZBase + curbJoinOverlap);
        const segXLen = Math.max(0.05, segXBase + curbJoinOverlap);

        const segZStart = z0 + Math.max(0.0, r - curbJoinOverlap);
        const segZEnd = z0 + cornerZeff;
        const segZCenter = (segZStart + segZEnd) * 0.5;

        addCurbBox(
            pos.x + signX * x0,
            curbY,
            pos.z + signZ * segZCenter,
            curbT,
            curbH,
            Math.max(0.05, segZEnd - segZStart),
            0
        );

        const segXStart = x0 + Math.max(0.0, r - curbJoinOverlap);
        const segXEnd = x0 + cornerXeff;
        const segXCenter = (segXStart + segXEnd) * 0.5;

        addCurbBox(
            pos.x + signX * segXCenter,
            curbY,
            pos.z + signZ * z0,
            Math.max(0.05, segXEnd - segXStart),
            curbH,
            curbT,
            0
        );

        // Arc itself (curb centerline radius = r)
        const cx = pos.x + signX * cxLocal;
        const cz = pos.z + signZ * czLocal;
        const start = intersectionCornerStartAngle(signX, signZ);

        pushCurbArcSolid({
            centerX: cx,
            centerZ: cz,
            radiusCenter: r,
            startAng: start,
            spanAng: Math.PI * 0.5,
            curveSegs: curbArcSegs * 2
        });
    }

    function addCornerTileCurvedTurn({ pos, wNS, wEW, connMask }) {
        const corner = connToCornerSigns(connMask);
        if (!corner) {
            addAsphaltPlane(pos.x, roadY, pos.z, ts, ts, 0);
            return;
        }

        // Conservative turn width (must fit both legs)
        const wTurn = clamp(Math.min(wNS, wEW), 1.0, ts);
        const halfW = wTurn * 0.5;

        // Clamp so arc stays inside tile, including curb thickness.
        const eps = 0.02;
        const rMax = Math.max(0.05, (ts * 0.5) - halfW - (curbT * 0.5) - eps);
        const rTurn = clamp(turnRadiusPref, 0.05, rMax);

        const cxLocal = corner.signX * rTurn;
        const czLocal = corner.signZ * rTurn;

        const legLen = Math.max(0.0, ts * 0.5 - rTurn);

        // Legs
        if (legLen > 0.001) {
            if ((connMask & DIR.N) || (connMask & DIR.S)) {
                const zCenter = corner.signZ * (rTurn + ts * 0.5) * 0.5;
                addAsphaltPlane(pos.x, roadY, pos.z + zCenter, wTurn, legLen, 0);
            }

            if ((connMask & DIR.E) || (connMask & DIR.W)) {
                const xCenter = corner.signX * (rTurn + ts * 0.5) * 0.5;
                addAsphaltPlane(pos.x + xCenter, roadY, pos.z, legLen, wTurn, 0);
            }
        }

        // Arc: inside quadrant relative to arc center
        const start = turnStartAngle(corner.signX, corner.signZ);

        // Asphalt arc
        pushRingSectorXZ({
            centerX: pos.x + cxLocal,
            centerZ: pos.z + czLocal,
            y: roadY + 0.00015,
            innerR: Math.max(0.01, rTurn - halfW),
            outerR: rTurn + halfW,
            startAng: start,
            spanAng: Math.PI * 0.5,
            segs: asphaltArcSegs,
            outArray: asphaltCurves
        });

        // Curbs around the turn
        const outerCurbCenterR = rTurn + halfW + curbT * 0.5;
        const innerCurbCenterR = rTurn - halfW - curbT * 0.5;

        pushCurbArcSolid({
            centerX: pos.x + cxLocal,
            centerZ: pos.z + czLocal,
            radiusCenter: outerCurbCenterR,
            startAng: start,
            spanAng: Math.PI * 0.5,
            curveSegs: curbArcSegs * 2
        });

        if (innerCurbCenterR > 0.20) {
            pushCurbArcSolid({
                centerX: pos.x + cxLocal,
                centerZ: pos.z + czLocal,
                radiusCenter: innerCurbCenterR,
                startAng: start,
                spanAng: Math.PI * 0.5,
                curveSegs: curbArcSegs * 2
            });
        }

        // Straight curbs along legs
        if (legLen > 0.001) {
            if ((connMask & DIR.N) || (connMask & DIR.S)) {
                const zCenter = corner.signZ * (rTurn + ts * 0.5) * 0.5;
                const zLen = legLen;
                addCurbBox(pos.x + (halfW + curbT * 0.5), curbY, pos.z + zCenter, curbT, curbH, zLen, 0);
                addCurbBox(pos.x - (halfW + curbT * 0.5), curbY, pos.z + zCenter, curbT, curbH, zLen, 0);
            }

            if ((connMask & DIR.E) || (connMask & DIR.W)) {
                const xCenter = corner.signX * (rTurn + ts * 0.5) * 0.5;
                const xLen = legLen;
                addCurbBox(pos.x + xCenter, curbY, pos.z + (halfW + curbT * 0.5), xLen, curbH, curbT, 0);
                addCurbBox(pos.x + xCenter, curbY, pos.z - (halfW + curbT * 0.5), xLen, curbH, curbT, 0);
            }
        }

        // Sidewalk pads: conservative (non-road quadrants)
        const xMin = halfW + curbT;
        const zMin = halfW + curbT;
        const xMax = ts * 0.5 + sidewalkExtra;
        const zMax = ts * 0.5 + sidewalkExtra;

        const sx = Math.max(0.05, xMax - xMin);
        const sz = Math.max(0.05, zMax - zMin);

        const quads = [
            { signX: 1, signZ: 1 },
            { signX: -1, signZ: 1 },
            { signX: 1, signZ: -1 },
            { signX: -1, signZ: -1 }
        ];

        for (const q of quads) {
            // Skip the road quadrant (the one that matches the corner directions)
            if (q.signX === corner.signX && q.signZ === corner.signZ) continue;

            const cx = pos.x + q.signX * (xMin + sx * 0.5);
            const cz = pos.z + q.signZ * (zMin + sz * 0.5);
            addSidewalkPlane(cx, groundY + sidewalkLift, cz, sx, sz, 0);
        }

        // ✅ OUTER CORNER SIDEWALK (the previously-missing “crescent” along the curved curb)
        // This follows the curved curb closely by using a ring sector just outside the outer curb's outer face.
        const sidewalkInnerR = (outerCurbCenterR + curbT * 0.5) - sidewalkInset; // outside curb face
        const sidewalkOuterR = Math.max(sidewalkInnerR + 0.05, ts * 0.5 + sidewalkExtra);

        pushRingSectorXZ({
            centerX: pos.x + cxLocal,
            centerZ: pos.z + czLocal,
            y: groundY + sidewalkLift,
            innerR: sidewalkInnerR,
            outerR: sidewalkOuterR,
            startAng: start,
            spanAng: Math.PI * 0.5,
            segs: Math.max(18, curbArcSegs * 2),
            outArray: sidewalkCurves
        });
    }

    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            const idx = map.index(x, y);
            if (map.kind[idx] !== TILE.ROAD) continue;

            const pos = map.tileToWorldCenter(x, y);
            const lanes = map.getLanesAtIndex(idx);

            const widthNS = laneWidth * (lanes.n + lanes.s) + 2 * shoulder;
            const widthEW = laneWidth * (lanes.e + lanes.w) + 2 * shoulder;

            const wNS = clamp(widthNS, 1, ts);
            const wEW = clamp(widthEW, 1, ts);

            const ax = map.axis[idx];

            // STRAIGHT: EW
            if (ax === AXIS.EW) {
                addAsphaltPlane(pos.x, roadY, pos.z, ts, wEW, 0);

                const tBase = (ts - wEW) * 0.5;
                const t = Math.max(0, tBase + sidewalkExtra - curbT);
                if (t > 0.001) {
                    const zOut = (wEW * 0.5 + curbT + t * 0.5);
                    addSidewalkPlane(pos.x, groundY + sidewalkLift, pos.z + zOut, ts, t, 0);
                    addSidewalkPlane(pos.x, groundY + sidewalkLift, pos.z - zOut, ts, t, 0);

                    addCurbBox(pos.x, curbY, pos.z + (wEW * 0.5 + curbT * 0.5), ts, curbH, curbT, 0);
                    addCurbBox(pos.x, curbY, pos.z - (wEW * 0.5 + curbT * 0.5), ts, curbH, curbT, 0);
                }

                const half = wEW * 0.5;
                const edge = half - markEdgeInset;
                if (edge > markLineW * 0.6) {
                    addMarkWhite(pos.x, markY, pos.z + edge, ts, markLineW, 0);
                    addMarkWhite(pos.x, markY, pos.z - edge, ts, markLineW, 0);
                }

                const twoWay = lanes.e > 0 && lanes.w > 0;
                if (twoWay) addMarkYellow(pos.x, markY, pos.z, ts, markLineW, 0);
                else addMarkWhite(pos.x, markY, pos.z, ts, markLineW, 0);

                continue;
            }

            // STRAIGHT: NS
            if (ax === AXIS.NS) {
                addAsphaltPlane(pos.x, roadY, pos.z, wNS, ts, 0);

                const tBase = (ts - wNS) * 0.5;
                const t = Math.max(0, tBase + sidewalkExtra - curbT);
                if (t > 0.001) {
                    const xOut = (wNS * 0.5 + curbT + t * 0.5);
                    addSidewalkPlane(pos.x + xOut, groundY + sidewalkLift, pos.z, t, ts, 0);
                    addSidewalkPlane(pos.x - xOut, groundY + sidewalkLift, pos.z, t, ts, 0);

                    addCurbBox(pos.x + (wNS * 0.5 + curbT * 0.5), curbY, pos.z, curbT, curbH, ts, 0);
                    addCurbBox(pos.x - (wNS * 0.5 + curbT * 0.5), curbY, pos.z, curbT, curbH, ts, 0);
                }

                const half = wNS * 0.5;
                const edge = half - markEdgeInset;
                if (edge > markLineW * 0.6) {
                    addMarkWhite(pos.x + edge, markY, pos.z, ts, markLineW, Math.PI * 0.5);
                    addMarkWhite(pos.x - edge, markY, pos.z, ts, markLineW, Math.PI * 0.5);
                }

                const twoWay = lanes.n > 0 && lanes.s > 0;
                if (twoWay) addMarkYellow(pos.x, markY, pos.z, ts, markLineW, Math.PI * 0.5);
                else addMarkWhite(pos.x, markY, pos.z, ts, markLineW, Math.PI * 0.5);

                continue;
            }

            // CORNER (90° turn): smooth curved road, not a crossing
            if (ax === AXIS.CORNER) {
                const connMask = map.conn[idx] ?? 0;
                addCornerTileCurvedTurn({ pos, wNS, wEW, connMask });
                continue;
            }

            // INTERSECTION / T-JUNCTION:
            addAsphaltPlane(pos.x, roadY, pos.z, ts, ts, 0);

            const xInner = wNS * 0.5;
            const zInner = wEW * 0.5;

            const cornerX = (ts - wNS) * 0.5;
            const cornerZ = (ts - wEW) * 0.5;

            if (cornerX <= 0.001 || cornerZ <= 0.001) continue;

            const cornerXeff = cornerX + sidewalkExtra;
            const cornerZeff = cornerZ + sidewalkExtra;

            const connMask = map.conn[idx] ?? 0;
            const degree = bitCount4(connMask);
            const doRounded = (degree >= 2);

            if (doRounded) {
                addCurvedCornerCurbsAndSidewalk({ pos, xInner, zInner, cornerXeff, cornerZeff, signX: 1, signZ: 1 });
                addCurvedCornerCurbsAndSidewalk({ pos, xInner, zInner, cornerXeff, cornerZeff, signX: -1, signZ: 1 });
                addCurvedCornerCurbsAndSidewalk({ pos, xInner, zInner, cornerXeff, cornerZeff, signX: 1, signZ: -1 });
                addCurvedCornerCurbsAndSidewalk({ pos, xInner, zInner, cornerXeff, cornerZeff, signX: -1, signZ: -1 });
            } else {
                // Conservative fallback: sharp corners, avoid overlap.
                const xMin2 = xInner + curbT;
                const zMin2 = zInner + curbT;
                const xMax2 = ts * 0.5 + sidewalkExtra;
                const zMax2 = ts * 0.5 + sidewalkExtra;

                const sx2 = Math.max(0.05, xMax2 - xMin2);
                const sz2 = Math.max(0.05, zMax2 - zMin2);

                const xOff = xMin2 + sx2 * 0.5;
                const zOff = zMin2 + sz2 * 0.5;

                addSidewalkPlane(pos.x + xOff, groundY + sidewalkLift, pos.z + zOff, sx2, sz2, 0);
                addSidewalkPlane(pos.x - xOff, groundY + sidewalkLift, pos.z + zOff, sx2, sz2, 0);
                addSidewalkPlane(pos.x + xOff, groundY + sidewalkLift, pos.z - zOff, sx2, sz2, 0);
                addSidewalkPlane(pos.x - xOff, groundY + sidewalkLift, pos.z - zOff, sx2, sz2, 0);

                addCurbBox(pos.x + (xInner + curbT * 0.5), curbY, pos.z + zOff, curbT, curbH, sz2, 0);
                addCurbBox(pos.x + (xInner + curbT * 0.5), curbY, pos.z - zOff, curbT, curbH, sz2, 0);
                addCurbBox(pos.x - (xInner + curbT * 0.5), curbY, pos.z + zOff, curbT, curbH, sz2, 0);
                addCurbBox(pos.x - (xInner + curbT * 0.5), curbY, pos.z - zOff, curbT, curbH, sz2, 0);

                addCurbBox(pos.x + xOff, curbY, pos.z + (zInner + curbT * 0.5), sx2, curbH, curbT, 0);
                addCurbBox(pos.x - xOff, curbY, pos.z + (zInner + curbT * 0.5), sx2, curbH, curbT, 0);
                addCurbBox(pos.x + xOff, curbY, pos.z - (zInner + curbT * 0.5), sx2, curbH, curbT, 0);
                addCurbBox(pos.x - xOff, curbY, pos.z - (zInner + curbT * 0.5), sx2, curbH, curbT, 0);
            }
        }
    }

    // Finalize instanced counts
    asphalt.count = a;
    sidewalk.count = s;
    curbBlocks.count = cb;
    markingsWhite.count = mw;
    markingsYellow.count = my;

    asphalt.instanceMatrix.needsUpdate = true;
    sidewalk.instanceMatrix.needsUpdate = true;
    curbBlocks.instanceMatrix.needsUpdate = true;
    markingsWhite.instanceMatrix.needsUpdate = true;
    markingsYellow.instanceMatrix.needsUpdate = true;

    group.add(asphalt);
    group.add(sidewalk);
    group.add(curbBlocks);
    group.add(markingsWhite);
    group.add(markingsYellow);

    // Add merged curved meshes
    const asphaltCurveGeo = mergeBufferGeometries(asphaltCurves);
    if (asphaltCurveGeo) {
        const m = new THREE.Mesh(asphaltCurveGeo, roadMat);
        m.name = 'AsphaltCurves';
        m.receiveShadow = true;
        group.add(m);
    }

    const sidewalkCurveGeo = mergeBufferGeometries(sidewalkCurves);
    if (sidewalkCurveGeo) {
        const m = new THREE.Mesh(sidewalkCurveGeo, sidewalkMat);
        m.name = 'SidewalkCurves';
        m.receiveShadow = true;
        group.add(m);
    }

    const curbCurveGeo = mergeBufferGeometries(curbCurves);
    if (curbCurveGeo) {
        const m = new THREE.Mesh(curbCurveGeo, curbMat);
        m.name = 'CurbCurves';
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
    }

    return { group, asphalt, sidewalk, curbBlocks, markingsWhite, markingsYellow };
}

---
graphics/assets3d/generators/GeneratorParams.js
---
// graphics/assets3d/generators/GeneratorParams.js

/**
 * Generator-owned visual parameters (sizes/proportions).
 * CityConfig should focus on layout (seed/map dims), not art scale.
 */

export const ROAD_DEFAULTS = {
    // Vertical placement
    surfaceY: 0.02,

    // Lanes
    laneWidth: 3.2,
    shoulder: 0.35,

    sidewalk: {
        // Extra sidewalk beyond the tile half-extent
        extraWidth: 1.25,

        // Intersection curb fillet radius (visual)
        cornerRadius: 1.8,

        // Small lift to avoid z-fighting with ground
        lift: 0.001,

        // Small intersection-only snug to remove tiny grass wedges
        inset: 0.06
    },

    // Smooth street turns (visual-only)
    curves: {
        // For tileSize=16, usable max is ~8. We intentionally allow large pref values; RoadGenerator clamps.
        turnRadius: 6.8,

        // Smoothness
        asphaltArcSegments: 40,
        curbArcSegments: 24
    },

    markings: {
        lineWidth: 0.12,
        edgeInset: 0.22,
        lift: 0.003
    },

    curb: {
        thickness: 0.32,
        height: 0.17,
        extraHeight: 0.0,
        sink: 0.03,

        // Overlap straight curb boxes into curved curb arcs to avoid visible seams at joins.
        joinOverlap: 0.24
    }
};

export const GROUND_DEFAULTS = {
    // By default, ground/sidewalk top sits at curb top (roadY + curbHeight)
    surfaceY: ROAD_DEFAULTS.surfaceY + ROAD_DEFAULTS.curb.height
};

---
src/physics/CurbCollisionDetector.js
---
// src/physics/CurbCollisionDetector.js
/**
 * Core curb/surface collision detection implementation.
 * Used by CollisionSystem and TestModeState.
 * This is the shared implementation - do not remove.
 */
import * as THREE from 'three';

export const SURFACE = {
    UNKNOWN: 0,
    ASPHALT: 1,
    CURB: 2,
    GRASS: 3,
};

const WHEELS = ['fl', 'fr', 'rl', 'rr'];

// Assumptions consistent with your docs
const TILE_ROAD = 1;
const AXIS_NONE = 0;
const AXIS_EW = 1;
const AXIS_NS = 2;
const AXIS_INTERSECTION = 3;

export class CurbCollisionDetector {
    constructor(city, opts = {}) {
        this.city = city;
        this.map = city?.map ?? null;
        this.config = city?.genConfig ?? city?.cityConfig ?? city?.config ?? null;

        this.roadY = this.config?.road?.surfaceY ?? 0.02;
        this.groundY = this.config?.ground?.surfaceY ?? 0.08;

        this.curbThickness = this.config?.road?.curb?.thickness ?? 0.25;
        this.laneWidth = this.config?.road?.laneWidth ?? 3.2;
        this.shoulder = this.config?.road?.shoulder ?? 0.35;

        // hysteresis to prevent rapid toggling near the edge
        this.hysteresis = opts.hysteresis ?? 0.04; // meters

        this.prevSurfaces = { fl: SURFACE.UNKNOWN, fr: SURFACE.UNKNOWN, rl: SURFACE.UNKNOWN, rr: SURFACE.UNKNOWN };
        this.surfaces = { fl: SURFACE.UNKNOWN, fr: SURFACE.UNKNOWN, rl: SURFACE.UNKNOWN, rr: SURFACE.UNKNOWN };
        this.heights = { fl: this.roadY, fr: this.roadY, rl: this.roadY, rr: this.roadY };
        this.transitions = [];

        this._tmp = new THREE.Vector3();
    }

    update(busApi, worldRoot) {
        if (!this.map || !busApi?.wheelRig || !worldRoot) return;

        this.transitions.length = 0;
        this.prevSurfaces = { ...this.surfaces };

        worldRoot.updateMatrixWorld(true);

        const pivots = this._getWheelPivots(busApi.wheelRig);

        for (const k of WHEELS) {
            const pivot = pivots[k];
            if (!pivot?.getWorldPosition) continue;

            pivot.getWorldPosition(this._tmp);
            const x = this._tmp.x;
            const z = this._tmp.z;

            const prev = this.prevSurfaces[k];
            const surface = this._detectSurface(x, z, prev);
            const h = this._heightForSurface(surface);

            this.surfaces[k] = surface;
            this.heights[k] = h;

            if (prev !== SURFACE.UNKNOWN && prev !== surface) {
                const dh = h - this._heightForSurface(prev);
                if (Math.abs(dh) > 1e-6) {
                    this.transitions.push({ wheel: k, from: prev, to: surface, height: dh });
                }
            }
        }
    }

    getWheelSurfaces() { return this.surfaces; }
    getWheelHeights() { return this.heights; }
    getTransitions() { return this.transitions; }

    // ----- internals -----

    _heightForSurface(surface) {
        if (surface === SURFACE.ASPHALT) return this.roadY;
        if (surface === SURFACE.CURB || surface === SURFACE.GRASS) return this.groundY;
        return this.roadY;
    }

    _getWheelPivots(wheelRig) {
        const front = Array.isArray(wheelRig.front) ? [...wheelRig.front] : [];
        const rear = Array.isArray(wheelRig.rear) ? [...wheelRig.rear] : [];

        const xOf = (w) =>
            w?.root?.position?.x ??
            w?.steerPivot?.position?.x ??
            w?.rollPivot?.position?.x ??
            0;

        front.sort((a, b) => xOf(a) - xOf(b));
        rear.sort((a, b) => xOf(a) - xOf(b));

        const fl = front[0] ?? null;
        const fr = front[1] ?? null;
        const rl = rear[0] ?? null;
        const rr = rear[1] ?? null;

        const pickPivot = (w) => w?.rollPivot ?? w?.steerPivot ?? w?.root ?? null;

        return {
            fl: pickPivot(fl),
            fr: pickPivot(fr),
            rl: pickPivot(rl),
            rr: pickPivot(rr),
        };
    }

    _detectSurface(worldX, worldZ, prevSurface) {
        const tile = this.map.worldToTile?.(worldX, worldZ);
        if (!tile) return SURFACE.UNKNOWN;

        if (!this.map.inBounds?.(tile.x, tile.y)) return SURFACE.GRASS;

        const idx = this.map.index?.(tile.x, tile.y);
        if (!Number.isFinite(idx)) return SURFACE.UNKNOWN;

        const kind = this.map.kind?.[idx];
        if (kind !== TILE_ROAD) return SURFACE.GRASS;

        const axis = this.map.axis?.[idx] ?? AXIS_NONE;
        const center = this.map.tileToWorldCenter?.(tile.x, tile.y);
        if (!center) return SURFACE.ASPHALT;

        const lanes = this.map.getLanesAtIndex?.(idx) ?? { n: 1, e: 1, s: 1, w: 1 };
        const lanesNS = (lanes.n ?? 0) + (lanes.s ?? 0);
        const lanesEW = (lanes.e ?? 0) + (lanes.w ?? 0);

        const widthNS = this.laneWidth * Math.max(1, lanesNS) + 2 * this.shoulder;
        const widthEW = this.laneWidth * Math.max(1, lanesEW) + 2 * this.shoulder;

        const dx = Math.abs(worldX - center.x);
        const dz = Math.abs(worldZ - center.z);

        let distOut = 0; // >0 means outside asphalt band

        if (axis === AXIS_EW) {
            distOut = dz - widthEW * 0.5;
        } else if (axis === AXIS_NS) {
            distOut = dx - widthNS * 0.5;
        } else if (axis === AXIS_INTERSECTION) {
            const outX = dx - widthNS * 0.5;
            const outZ = dz - widthEW * 0.5;
            distOut = Math.max(outX, outZ);
        } else {
            // If axis is NONE but kind is ROAD, assume asphalt.
            return SURFACE.ASPHALT;
        }

        const h = this.hysteresis;

        // Definitely asphalt
        if (distOut <= -h) return SURFACE.ASPHALT;

        // Definitely grass (beyond curb thickness)
        if (distOut >= this.curbThickness + h) return SURFACE.GRASS;

        // In edge bands, prefer previous to avoid rapid toggling
        if (distOut < +h) return (prevSurface === SURFACE.ASPHALT) ? SURFACE.ASPHALT : SURFACE.CURB;

        if (distOut <= this.curbThickness - h) return SURFACE.CURB;

        return (prevSurface === SURFACE.GRASS) ? SURFACE.GRASS : SURFACE.CURB;
    }
}

---
src/physics/systems/CollisionSystem.js
---
// src/physics/systems/CollisionSystem.js
import { CurbCollisionDetector, SURFACE } from '../CurbCollisionDetector.js';

/**
 * Surface type constants (re-exported for convenience).
 */
export { SURFACE };

/**
 * Surface name lookup.
 */
const SURFACE_NAMES = {
    [SURFACE.UNKNOWN]: 'unknown',
    [SURFACE.ASPHALT]: 'asphalt',
    [SURFACE.CURB]: 'curb',
    [SURFACE.GRASS]: 'grass'
};

/**
 * Default collision configuration.
 */
const DEFAULT_CONFIG = {
    // Default surface heights (meters)
    roadY: 0.02,
    groundY: 0.08,

    // Curb impact parameters
    curbImpactVelocity: 0.15,  // m/s impulse on curb hit
    curbDamping: 0.7           // Damping factor for curb impacts
};

/**
 * CollisionSystem handles ground/curb collision detection and response.
 *
 * Responsibilities:
 * - Detect wheel surface types (asphalt, curb, grass)
 * - Track surface transitions
 * - Provide wheel height offsets for suspension
 * - Detect curb impacts for suspension response
 */
export class CollisionSystem {
    constructor(config = {}) {
        /** @type {Map<string, object>} */
        this.vehicles = new Map();

        /** @type {object} */
        this.config = { ...DEFAULT_CONFIG, ...config };

        /** @type {object|null} */
        this.environment = null;

        /** @type {CurbCollisionDetector|null} */
        this._detector = null;
    }

    /**
     * Set the environment (city with map and config) for collision detection.
     * @param {object} env - City object with { map, config/genConfig }
     */
    setEnvironment(env) {
        this.environment = env ?? null;

        // Create detector if we have a valid environment
        if (this.environment?.map) {
            this._detector = new CurbCollisionDetector(this.environment);
        } else {
            this._detector = null;
        }
    }

    /**
     * Register a vehicle with this system.
     * @param {object} vehicle - Vehicle instance with { id, api, anchor }
     */
    addVehicle(vehicle) {
        if (!vehicle?.id) return;

        this.vehicles.set(vehicle.id, {
            vehicle,
            api: vehicle.api ?? null,
            anchor: vehicle.anchor ?? null,

            // Surface state per wheel
            wheelSurfaces: {
                fl: SURFACE.UNKNOWN,
                fr: SURFACE.UNKNOWN,
                rl: SURFACE.UNKNOWN,
                rr: SURFACE.UNKNOWN
            },

            // Height offset per wheel (for suspension)
            wheelHeights: {
                fl: this.config.roadY,
                fr: this.config.roadY,
                rl: this.config.roadY,
                rr: this.config.roadY
            },

            // Previous frame surfaces (for transition detection)
            prevSurfaces: {
                fl: SURFACE.UNKNOWN,
                fr: SURFACE.UNKNOWN,
                rl: SURFACE.UNKNOWN,
                rr: SURFACE.UNKNOWN
            },

            // Transitions this frame
            transitions: [],

            // Aggregate state
            onCurb: false,
            onGrass: false,
            allOnAsphalt: true
        });
    }

    /**
     * Unregister a vehicle from this system.
     * @param {string} vehicleId
     */
    removeVehicle(vehicleId) {
        this.vehicles.delete(vehicleId);
    }

    /**
     * Fixed timestep update.
     * @param {number} dt - Delta time in seconds
     */
    fixedUpdate(dt) {
        if (dt <= 0) return;

        for (const state of this.vehicles.values()) {
            this._updateCollisions(state);
        }
    }

    /**
     * Update collision state for a single vehicle.
     * @param {object} s - Vehicle state
     */
    _updateCollisions(s) {
        // Clear transitions from previous frame
        s.transitions.length = 0;

        // Store previous surfaces
        s.prevSurfaces.fl = s.wheelSurfaces.fl;
        s.prevSurfaces.fr = s.wheelSurfaces.fr;
        s.prevSurfaces.rl = s.wheelSurfaces.rl;
        s.prevSurfaces.rr = s.wheelSurfaces.rr;

        // Use detector if available
        if (this._detector && s.api && s.anchor) {
            this._detector.update(s.api, s.anchor);

            const surfaces = this._detector.getWheelSurfaces();
            const heights = this._detector.getWheelHeights();
            const transitions = this._detector.getTransitions();

            // Copy surfaces and heights
            s.wheelSurfaces.fl = surfaces.fl;
            s.wheelSurfaces.fr = surfaces.fr;
            s.wheelSurfaces.rl = surfaces.rl;
            s.wheelSurfaces.rr = surfaces.rr;

            s.wheelHeights.fl = heights.fl;
            s.wheelHeights.fr = heights.fr;
            s.wheelHeights.rl = heights.rl;
            s.wheelHeights.rr = heights.rr;

            // Copy transitions
            for (const t of transitions) {
                s.transitions.push({
                    wheel: t.wheel,
                    from: t.from,
                    to: t.to,
                    fromName: SURFACE_NAMES[t.from] ?? 'unknown',
                    toName: SURFACE_NAMES[t.to] ?? 'unknown',
                    height: t.height,
                    impactVelocity: this.config.curbImpactVelocity
                });
            }
        }

        // Update aggregate state
        const wheels = ['fl', 'fr', 'rl', 'rr'];
        s.onCurb = wheels.some(w => s.wheelSurfaces[w] === SURFACE.CURB);
        s.onGrass = wheels.some(w => s.wheelSurfaces[w] === SURFACE.GRASS);
        s.allOnAsphalt = wheels.every(w =>
            s.wheelSurfaces[w] === SURFACE.ASPHALT ||
            s.wheelSurfaces[w] === SURFACE.UNKNOWN
        );
    }

    /**
     * Get the current state for a vehicle.
     * @param {string} vehicleId
     * @returns {object|null}
     */
    getState(vehicleId) {
        const state = this.vehicles.get(vehicleId);
        if (!state) return null;

        return {
            wheelSurfaces: { ...state.wheelSurfaces },
            wheelSurfaceNames: {
                fl: SURFACE_NAMES[state.wheelSurfaces.fl] ?? 'unknown',
                fr: SURFACE_NAMES[state.wheelSurfaces.fr] ?? 'unknown',
                rl: SURFACE_NAMES[state.wheelSurfaces.rl] ?? 'unknown',
                rr: SURFACE_NAMES[state.wheelSurfaces.rr] ?? 'unknown'
            },
            wheelHeights: { ...state.wheelHeights },
            transitions: [...state.transitions],
            onCurb: state.onCurb,
            onGrass: state.onGrass,
            allOnAsphalt: state.allOnAsphalt
        };
    }

    /**
     * Get transitions that occurred this frame.
     * @param {string} vehicleId
     * @returns {Array}
     */
    getTransitions(vehicleId) {
        const state = this.vehicles.get(vehicleId);
        return state?.transitions ?? [];
    }

    /**
     * Check if any wheel is on a specific surface.
     * @param {string} vehicleId
     * @param {number} surfaceType - SURFACE constant
     * @returns {boolean}
     */
    isOnSurface(vehicleId, surfaceType) {
        const state = this.vehicles.get(vehicleId);
        if (!state) return false;

        return Object.values(state.wheelSurfaces).some(s => s === surfaceType);
    }

    /**
     * Get the dominant surface (most wheels on).
     * @param {string} vehicleId
     * @returns {number} SURFACE constant
     */
    getDominantSurface(vehicleId) {
        const state = this.vehicles.get(vehicleId);
        if (!state) return SURFACE.UNKNOWN;

        const counts = { [SURFACE.ASPHALT]: 0, [SURFACE.CURB]: 0, [SURFACE.GRASS]: 0 };

        for (const s of Object.values(state.wheelSurfaces)) {
            if (s in counts) counts[s]++;
        }

        let max = 0;
        let dominant = SURFACE.ASPHALT;
        for (const [surface, count] of Object.entries(counts)) {
            if (count > max) {
                max = count;
                dominant = parseInt(surface);
            }
        }

        return dominant;
    }
}

