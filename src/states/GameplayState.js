// src/states/GameplayState.js
// Runs the main gameplay loop and HUD interactions.
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
import { getSharedCity } from '../graphics/visuals/city/City.js';
import { createBigCitySpec } from '../app/city/specs/BigCitySpec.js';
import { fadeIn } from '../graphics/gui/shared/utils/screenFade.js';
import { GameHUD } from '../graphics/gui/gameplay/GameHUD.js';
import { GameplayCameraTour } from '../graphics/gui/gameplay/GameplayCameraTour.js';
import { GameLoop } from '../app/core/GameLoop.js';
import { VehicleController } from '../app/vehicle/VehicleController.js';
import { InputManager } from '../app/input/InputManager.js';
import { createVehicleFromBus } from '../app/vehicle/createVehicle.js';
import { GameplayDebugPanel } from '../graphics/gui/gameplay/GameplayDebugPanel.js';

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

const CAMERA_DRAG = {
    rotateSpeed: 0.0045,
    tiltSpeed: 0.0035,
    minPhi: 0.28,
    maxPhi: Math.PI - 0.28,
    idleReturnSec: 10,
    returnDurationSec: 2,
    returnEaseSec: 0.5
};

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function getGameplayCityOptions() {
    const mapSpec = createBigCitySpec();
    const mapTileSize = Number.isFinite(mapSpec?.tileSize) ? mapSpec.tileSize : 24;
    const mapWidth = Number.isFinite(mapSpec?.width) ? mapSpec.width : 25;
    const seed = typeof mapSpec?.seed === 'string' ? mapSpec.seed : 'x';

    return {
        size: mapWidth * mapTileSize,
        tileMeters: 2,
        mapTileSize,
        seed,
        mapSpec,
        generatorConfig: { render: { roadMode: 'normal' } }
    };
}

function easeWithHold(t, edge) {
    const x = clamp(t, 0, 1);
    const e = clamp(edge, 0.001, 0.49);
    if (x <= e) {
        const k = x / e;
        return e * (k * k);
    }
    if (x >= 1 - e) {
        const k = (x - (1 - e)) / e;
        return (1 - e) + e * (1 - (1 - k) * (1 - k));
    }
    return x;
}

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

function snapToGroundY(object3d, groundY) {
    if (!object3d) return;
    const y = Number.isFinite(groundY) ? groundY : 0;
    object3d.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object3d);
    if (box.isEmpty()) return;
    const delta = y - box.min.y;
    if (Number.isFinite(delta) && Math.abs(delta) > 1e-5) {
        object3d.position.y += delta;
        object3d.updateMatrixWorld(true);
    }
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
        this._busCenterBox = new THREE.Box3();
        this._busCenter = new THREE.Vector3();
        this._cameraTour = null;
        this._dragSpherical = new THREE.Spherical();
        this._cameraDrag = {
            active: false,
            pointerId: null,
            lastX: 0,
            lastY: 0,
            hasOverride: false,
            idleTime: 0,
            returning: false,
            returnElapsed: 0,
            offset: new THREE.Vector3(),
            originalOffset: new THREE.Vector3(),
            returnStart: new THREE.Vector3()
        };

        // Event handlers
        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onPointerDown = (e) => this._handlePointerDown(e);
        this._onPointerMove = (e) => this._handlePointerMove(e);
        this._onPointerUp = (e) => this._handlePointerUp(e);

        this._debugPanel = null;
        this._debugEnabled = false;
    }

    enter() {
        // Hide UI overlays and splash background
        document.body.classList.remove('splash-bg');
        document.getElementById('ui-welcome')?.classList.add('hidden');
        document.getElementById('ui-select')?.classList.add('hidden');
        document.getElementById('ui-test')?.classList.add('hidden');

        // Clear previous scene
        this.engine.clearScene();
        this.engine.context.city = null;

        // Get simulation context
        const sim = this.engine.simulation;

        // Create game loop (pass engine for world updates)
        this.gameLoop = new GameLoop(sim, { engine: this.engine });

        // Create input manager
        this.inputManager = new InputManager(sim.events);
        this.inputManager.attach();
        this.gameLoop.setInputManager(this.inputManager);

        // Setup city
        this.city = getSharedCity(this.engine, getGameplayCityOptions());
        this.city.attach(this.engine);
        this.gameLoop.setWorld(this.city);

        // Setup HUD
        this.hud = new GameHUD({ mode: 'bus' });
        this.hud.show();
        this.gameLoop.setUI(this.hud);

        const params = new URLSearchParams(window.location.search);
        this._debugEnabled = params.get('debug') === 'true';
        if (this._debugEnabled) {
            this._debugPanel = new GameplayDebugPanel({ events: sim.events });
            this._debugPanel.attach(document.body);
            this._debugPanel.log(`selectedBus: ${this.engine.context.selectedBusId ?? this.engine.context.selectedBus?.userData?.id ?? '—'}`);
        }

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
        this._debugPanel?.setContext?.({
            vehicleId: this.vehicle.id,
            physics: sim.physics,
            anchor: this.busAnchor,
            api: this.busApi,
            model: this.busModel
        });

        // Store resolved model back to context
        this.engine.context.selectedBus = this.busModel;

        // Position anchor on road
        const roadY = this.city?.generatorConfig?.ground?.surfaceY ?? this.city?.generatorConfig?.road?.surfaceY ?? 0;
        this.busAnchor.position.set(0, roadY, 0);
        this.busAnchor.rotation.set(0, 0, 0);
        snapToGroundY(this.busAnchor, roadY);
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
        this._cameraTour = new GameplayCameraTour({
            engine: this.engine,
            getTarget: () => this._getBusCenter()
        });

        // ✅ Ensure physics systems have the real anchor/api so locomotion can use rear-axle kinematics.
        sim.physics?.setEnvironment?.(this.city);
        sim.physics?.removeVehicle?.(this.vehicle.id);
        sim.physics?.addVehicle?.(this.vehicle.id, this.vehicle.config, this.vehicle.anchor, this.vehicle.api);
        this._debugPanel?.log(`physics.addVehicle(${this.vehicle.id})`);

        // Create vehicle controller
        this.vehicleController = new VehicleController(this.vehicle.id, sim.physics, sim.events);
        this.vehicleController.setVehicleApi(this.vehicle.api, this.vehicle.anchor);
        this.gameLoop.addVehicleController(this.vehicleController);

        const readyPromise = this.busModel?.userData?.readyPromise;
        readyPromise?.then?.(() => {
            if (!this.busAnchor || !this.vehicle?.id) return;
            this._debugPanel?.log('readyPromise: bus model loaded');
            snapToGroundY(this.busAnchor, roadY);
            sim.physics?.removeVehicle?.(this.vehicle.id);
            sim.physics?.addVehicle?.(this.vehicle.id, this.vehicle.config, this.busAnchor, this.vehicle.api);
            this.vehicleController?.setVehicleApi?.(this.vehicle.api, this.busAnchor);
            this._debugPanel?.setContext?.({
                vehicleId: this.vehicle.id,
                physics: sim.physics,
                anchor: this.busAnchor,
                api: this.vehicle.api,
                model: this.busModel
            });
            this._debugPanel?.log(`physics.reAddVehicle(${this.vehicle.id})`);
        });

        // Subscribe to frame events for telemetry
        this._unsubFrame = sim.events.on('gameloop:frame', () => {
            this._updateTelemetry();
        });

        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        const canvas = this.engine?.renderer?.domElement;
        if (canvas) {
            canvas.addEventListener('pointerdown', this._onPointerDown, { passive: false });
        }
        window.addEventListener('pointermove', this._onPointerMove, { passive: false });
        window.addEventListener('pointerup', this._onPointerUp, { passive: false });
        window.addEventListener('pointercancel', this._onPointerUp, { passive: false });
        fadeIn({ duration: 1.2 });
    }

    exit() {
        window.removeEventListener('keydown', this._onKeyDown);
        const canvas = this.engine?.renderer?.domElement;
        if (canvas) {
            canvas.removeEventListener('pointerdown', this._onPointerDown);
        }
        window.removeEventListener('pointermove', this._onPointerMove);
        window.removeEventListener('pointerup', this._onPointerUp);
        window.removeEventListener('pointercancel', this._onPointerUp);

        // Unsubscribe from events
        this._unsubFrame?.();

        // Dispose game loop (disposes controllers and input)
        this.gameLoop?.dispose();
        this.gameLoop = null;
        this.inputManager = null;
        this.vehicleController = null;

        if (this.vehicle?.id) {
            this.engine.simulation?.physics?.removeVehicle?.(this.vehicle.id);
        }
        this.vehicle = null;

        // Cleanup HUD
        this.hud?.destroy();
        this.hud = null;

        this._debugPanel?.destroy();
        this._debugPanel = null;
        this._debugEnabled = false;

        // Cleanup scene
        if (this.busAnchor) {
            if (this.busModel) this.busAnchor.remove(this.busModel);
            this.engine.scene.remove(this.busAnchor);
        }
        this.busAnchor = null;
        this.busModel = null;
        this.busApi = null;
        this._cameraTour?.stop(true);
        this._cameraTour = null;

        // Detach city
        this.city?.detach(this.engine);
        this.city = null;

        this.engine.clearScene();
    }

    update(dt) {
        // Run game loop (handles input, physics, controllers, world, UI)
        this.gameLoop?.update(dt);

        // Update chase camera
        const touring = this._cameraTour?.update(dt) ?? false;
        if (!touring) {
            const manual = this._updateManualCamera(dt);
            if (!manual) this._updateChaseCamera(dt);
        }
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

        if (this._debugEnabled && this._debugPanel) {
            this._debugPanel.setContext?.({
                vehicleId: 'player',
                physics: this.engine.simulation?.physics,
                anchor: this.busAnchor,
                api: this.busApi,
                model: this.busModel
            });
            this._debugPanel.setKeys(this.inputManager?.getKeys?.() ?? this.inputManager?.keys ?? null);
            this._debugPanel.setRapierDebug(this.engine.simulation?.physics?.getVehicleDebug?.('player') ?? null);
        }
    }

    _getBusCenter() {
        if (!this.busModel) return null;
        this._busCenterBox.setFromObject(this.busModel);
        if (this._busCenterBox.isEmpty()) {
            this.busModel.getWorldPosition(this._busCenter);
        } else {
            this._busCenterBox.getCenter(this._busCenter);
        }
        if (this.busAnchor) {
            this._busCenter.y = this.busAnchor.position.y + this._chase.lookY;
        }
        return this._busCenter;
    }

    _applyManualCamera() {
        const cam = this.engine.camera;
        const target = this._getBusCenter();
        if (!target) return;
        cam.position.copy(target).add(this._cameraDrag.offset);
        cam.lookAt(target);
    }

    _updateManualCamera(dt) {
        const drag = this._cameraDrag;
        if (!drag.hasOverride || !this.busModel) return false;
        if (drag.active) {
            this._applyManualCamera();
            return true;
        }

        drag.idleTime += Math.max(0, dt || 0);

        if (!drag.returning && drag.idleTime >= CAMERA_DRAG.idleReturnSec) {
            drag.returning = true;
            drag.returnElapsed = 0;
            drag.returnStart.copy(drag.offset);
        }

        if (drag.returning) {
            drag.returnElapsed = Math.min(CAMERA_DRAG.returnDurationSec, drag.returnElapsed + (dt || 0));
            const t = drag.returnElapsed / CAMERA_DRAG.returnDurationSec;
            const eased = easeWithHold(t, CAMERA_DRAG.returnEaseSec / CAMERA_DRAG.returnDurationSec);
            drag.offset.lerpVectors(drag.returnStart, drag.originalOffset, eased);
            this._applyManualCamera();
            if (drag.returnElapsed >= CAMERA_DRAG.returnDurationSec) {
                drag.returning = false;
                drag.hasOverride = false;
            }
            return true;
        }

        this._applyManualCamera();
        return true;
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

    _handlePointerDown(e) {
        if (e.button !== 0 || this._cameraTour?.active) return;
        const target = this._getBusCenter();
        if (!target) return;
        const cam = this.engine.camera;
        const drag = this._cameraDrag;
        drag.active = true;
        drag.pointerId = e.pointerId;
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        drag.idleTime = 0;
        drag.returning = false;
        drag.returnElapsed = 0;
        drag.hasOverride = true;
        drag.offset.copy(cam.position).sub(target);
        drag.originalOffset.copy(drag.offset);
        const canvas = this.engine?.renderer?.domElement;
        if (canvas?.setPointerCapture) {
            try {
                canvas.setPointerCapture(e.pointerId);
            } catch {
            }
        }
        e.preventDefault();
    }

    _handlePointerMove(e) {
        const drag = this._cameraDrag;
        if (!drag.active || (drag.pointerId !== null && e.pointerId !== drag.pointerId)) return;
        const dx = e.clientX - drag.lastX;
        const dy = e.clientY - drag.lastY;
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        this._dragSpherical.setFromVector3(drag.offset);
        this._dragSpherical.theta -= dx * CAMERA_DRAG.rotateSpeed;
        this._dragSpherical.phi = clamp(
            this._dragSpherical.phi - dy * CAMERA_DRAG.tiltSpeed,
            CAMERA_DRAG.minPhi,
            CAMERA_DRAG.maxPhi
        );
        drag.offset.setFromSpherical(this._dragSpherical);
        drag.idleTime = 0;
        drag.returning = false;
        drag.returnElapsed = 0;
        drag.hasOverride = true;
        this._applyManualCamera();
        e.preventDefault();
    }

    _handlePointerUp(e) {
        const drag = this._cameraDrag;
        if (!drag.active || (drag.pointerId !== null && e.pointerId !== drag.pointerId)) return;
        drag.active = false;
        drag.pointerId = null;
        drag.idleTime = 0;
        const canvas = this.engine?.renderer?.domElement;
        if (canvas?.releasePointerCapture) {
            try {
                canvas.releasePointerCapture(e.pointerId);
            } catch {
            }
        }
        e.preventDefault();
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

        if (e.code === 'KeyT') {
            e.preventDefault();
            this._cameraTour?.start();
        }
    }
}
