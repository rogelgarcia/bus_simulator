// src/states/GameplayState.js
/**
 * GameplayState - Main gameplay state using the modular architecture.
 *
 * Uses:
 * - GameLoop for coordinated updates
 * - VehicleController for vehicle control
 * - InputManager for keyboard input
 * - PhysicsController via SimulationContext
 */
import * as THREE from 'three';
import { getSharedCity } from '../city/City.js';
import { fadeIn } from '../assets3d/utils/screenFade.js';
import { GameHUD } from '../hud/GameHUD.js';
import { GameLoop } from '../core/GameLoop.js';
import { VehicleController } from '../vehicle/VehicleController.js';
import { InputManager } from '../ui/input/InputManager.js';
import { createVehicleFromBus } from '../vehicle/createVehicle.js';

// Camera tuning
const CAMERA_TUNE = {
    distanceMul: 1.35,
    minDistance: 8.5,
    heightMul: 0.55,
    minHeight: 3.2,
    lookYMul: 0.32,
    minLookY: 1.1,
    followSharpness: 7.0
};

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function computeChaseParams(vehicle) {
    const model = vehicle?.model ?? vehicle;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const d = Math.max(size.x, size.y, size.z);

    return {
        distance: Math.max(CAMERA_TUNE.minDistance, d * CAMERA_TUNE.distanceMul),
        height: Math.max(CAMERA_TUNE.minHeight, d * CAMERA_TUNE.heightMul),
        lookY: Math.max(CAMERA_TUNE.minLookY, size.y * CAMERA_TUNE.lookYMul)
    };
}

export class GameplayState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        // Core systems
        this.gameLoop = null;
        this.inputManager = null;
        this.vehicleController = null;

        // Vehicle (from factory)
        this.vehicle = null;

        // Scene objects (compatibility aliases)
        this.city = null;
        this.hud = null;
        this.busModel = null;
        this.busAnchor = null;
        this.busApi = null;

        // Camera
        this._chase = { distance: 10, height: 4, lookY: 1.5 };
        this._tmpQ = new THREE.Quaternion();
        this._tmpForward = new THREE.Vector3();
        this._tmpDesired = new THREE.Vector3();
        this._tmpTarget = new THREE.Vector3();

        // Event handlers
        this._onKeyDown = (e) => this._handleKeyDown(e);
    }

    enter() {
        // Hide UI overlays and splash background
        document.body.classList.remove('splash-bg');
        document.getElementById('ui-welcome')?.classList.add('hidden');
        document.getElementById('ui-select')?.classList.add('hidden');
        document.getElementById('ui-test')?.classList.add('hidden');

        // Clear previous scene
        this.engine.clearScene();

        // Get simulation context
        const sim = this.engine.simulation;

        // Create game loop (pass engine for world updates)
        this.gameLoop = new GameLoop(sim, { engine: this.engine });

        // Create input manager
        this.inputManager = new InputManager(sim.events);
        this.inputManager.attach();
        this.gameLoop.setInputManager(this.inputManager);

        // Setup city
        this.city = getSharedCity(this.engine, {
            size: 800,
            tileMeters: 2,
            mapTileSize: 16,
            seed: 'x'
        });
        this.city.attach(this.engine);
        this.gameLoop.setWorld(this.city);

        // Setup HUD
        this.hud = new GameHUD({ mode: 'bus' });
        this.hud.show();
        this.gameLoop.setUI(this.hud);

        // Create vehicle from selected bus using factory
        const selected = this.engine.context.selectedBus || null;
        this.vehicle = createVehicleFromBus(selected, { id: 'player' });

        if (!this.vehicle) {
            console.warn('[GameplayState] No selectedBus. Did BusSelectState set it?');
            this._updateChaseCamera(999);
            window.addEventListener('keydown', this._onKeyDown, { passive: false });
            fadeIn({ duration: 1.2 });
            return;
        }

        // Store references for compatibility
        this.busModel = this.vehicle.model;
        this.busApi = this.vehicle.api;
        this.busAnchor = this.vehicle.anchor;

        // Store resolved model back to context
        this.engine.context.selectedBus = this.busModel;

        // Position anchor on road
        const roadY = this.city?.genConfig?.road?.surfaceY ?? 0;
        this.busAnchor.position.set(0, roadY, 0);
        this.busAnchor.rotation.set(0, 0, 0);
        this.engine.scene.add(this.busAnchor);

        // Enable shadows
        this.busAnchor.traverse((o) => {
            if (o && o.isMesh) {
                o.castShadow = true;
                o.receiveShadow = true;
            }
        });

        // Compute camera params
        this._chase = computeChaseParams(this.vehicle);

        // Register vehicle with physics
        sim.physics.addVehicle(this.vehicle.id, this.vehicle.config, {}, {});

        // Create vehicle controller
        this.vehicleController = new VehicleController(this.vehicle.id, sim.physics, sim.events);
        this.vehicleController.setVehicleApi(this.vehicle.api, this.vehicle.anchor);
        this.gameLoop.addVehicleController(this.vehicleController);

        // Subscribe to frame events for telemetry
        this._unsubFrame = sim.events.on('gameloop:frame', () => {
            this._updateTelemetry();
        });

        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        fadeIn({ duration: 1.2 });
    }

    exit() {
        window.removeEventListener('keydown', this._onKeyDown);

        // Unsubscribe from events
        this._unsubFrame?.();

        // Dispose game loop (disposes controllers and input)
        this.gameLoop?.dispose();
        this.gameLoop = null;
        this.inputManager = null;
        this.vehicleController = null;

        // Cleanup HUD
        this.hud?.destroy();
        this.hud = null;

        // Cleanup scene
        if (this.busAnchor) {
            if (this.busModel) this.busAnchor.remove(this.busModel);
            this.engine.scene.remove(this.busAnchor);
        }
        this.busAnchor = null;
        this.busModel = null;
        this.busApi = null;

        // Detach city
        this.city?.detach(this.engine);
        this.city = null;

        this.engine.clearScene();
    }

    update(dt) {
        // Run game loop (handles input, physics, controllers, world, UI)
        this.gameLoop?.update(dt);

        // Update chase camera
        this._updateChaseCamera(dt);
    }

    _updateTelemetry() {
        if (!this.hud || !this.gameLoop) return;

        const telemetry = this.gameLoop.getTelemetry('player');
        if (telemetry) {
            this.hud.setTelemetry({
                speedKph: telemetry.speedKph,
                rpm: telemetry.rpm,
                gear: telemetry.gear
            });
        }
    }

    _updateChaseCamera(dt) {
        const cam = this.engine.camera;
        if (!this.busAnchor) return;

        this._tmpTarget.copy(this.busAnchor.position);
        this._tmpTarget.y += this._chase.lookY;

        this.busAnchor.getWorldQuaternion(this._tmpQ);

        this._tmpForward.set(0, 0, 1).applyQuaternion(this._tmpQ);
        this._tmpForward.y = 0;
        if (this._tmpForward.lengthSq() > 1e-8) this._tmpForward.normalize();
        else this._tmpForward.set(0, 0, 1);

        this._tmpDesired.copy(this.busAnchor.position);
        this._tmpDesired.addScaledVector(this._tmpForward, -this._chase.distance);
        this._tmpDesired.y += this._chase.height;

        if (dt > 1) {
            cam.position.copy(this._tmpDesired);
        } else {
            const a = 1 - Math.exp(-dt * CAMERA_TUNE.followSharpness);
            cam.position.lerp(this._tmpDesired, a);
        }

        cam.lookAt(this._tmpTarget);
    }

    _handleKeyDown(e) {
        if (e.code === 'Escape') {
            e.preventDefault();
            this.sm.go('welcome');
        }

        // Pause toggle
        if (e.code === 'KeyP') {
            e.preventDefault();
            this.gameLoop?.togglePause();
        }
    }
}

