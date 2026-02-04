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
import { createBigCity2Spec } from '../app/city/specs/BigCity2Spec.js';
import { fadeIn } from '../graphics/gui/shared/utils/screenFade.js';
import { GameHUD } from '../graphics/gui/gameplay/GameHUD.js';
import { GameplayCameraTour } from '../graphics/gui/gameplay/GameplayCameraTour.js';
import { GameLoop } from '../app/core/GameLoop.js';
import { VehicleController } from '../app/vehicle/VehicleController.js';
import { InputManager } from '../app/input/InputManager.js';
import { createVehicleFromBus } from '../app/vehicle/createVehicle.js';
import { GameplayDebugPanel } from '../graphics/gui/gameplay/GameplayDebugPanel.js';
import { VehicleMotionDebugOverlay } from '../graphics/gui/debug/VehicleMotionDebugOverlay.js';
import { getSelectableSceneShortcuts } from './SceneShortcutRegistry.js';
import { SetupUIController } from '../graphics/gui/setup/SetupUIController.js';

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

// Manual camera drag state lives in `this._cameraDrag` and auto-returns after `CAMERA_DRAG.idleReturnSec`.
// While the Options overlay is open, pointer controls stay active and idle return is suppressed.

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function normalizeCityParam(value) {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase().replaceAll('_', '').replaceAll('-', '');
}

function resolveCityIdFromUrl() {
    if (typeof window === 'undefined') return null;

    const params = new URLSearchParams(window.location.search);
    const key = normalizeCityParam(params.get('city') ?? params.get('citySpec') ?? params.get('citySpecId'));
    if (!key) return null;

    if (key === 'bigcity' || key === 'city1' || key === '1') return 'bigcity';
    if (key === 'bigcity2' || key === 'bigcitytwo' || key === 'city2' || key === '2') return 'bigcity2';
    return null;
}

function isValidGameplayCitySpec(spec) {
    if (!spec || typeof spec !== 'object') return false;
    if (!Number.isFinite(spec.tileSize) || !Number.isFinite(spec.width)) return false;
    if (!Array.isArray(spec.roads) || spec.roads.length < 1) return false;
    return true;
}

export function getGameplayCityOptions() {
    const requestedCityId = resolveCityIdFromUrl();
    const cityId = requestedCityId === 'bigcity' ? 'bigcity' : 'bigcity2';

    let mapSpec = null;
    try {
        mapSpec = cityId === 'bigcity' ? createBigCitySpec() : createBigCity2Spec();
        if (!isValidGameplayCitySpec(mapSpec)) {
            throw new Error(`Invalid city spec shape for '${cityId}'`);
        }
    } catch (err) {
        console.warn(`[GameplayState] Failed to load '${cityId}', falling back to 'bigcity'.`, err);
        mapSpec = createBigCitySpec();
    }

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
        this._tmpDebugQ = new THREE.Quaternion();
        this._tmpDebugForward = new THREE.Vector3();
        this._tmpDebugDesired = new THREE.Vector3();
        this._tmpDebugTarget = new THREE.Vector3();
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
        this._vehicleMotionDebugOverlay = null;

        this._iblProbe = null;

        this._cameraMotionDebug = {
            mode: 'init',
            chase: { desired: { x: 0, y: 0, z: 0 }, alpha: 0 },
            manual: {
                hasOverride: false,
                active: false,
                returning: false,
                idleTime: 0,
                returnElapsed: 0,
                returnDuration: CAMERA_DRAG.returnDurationSec,
                applied: false,
                anchorPos: { x: 0, y: 0, z: 0 },
                anchorMatrixPos: { x: 0, y: 0, z: 0 },
                anchorMatrixNeedsUpdate: null,
                anchorMatrixErr: null,
                busModelMatrixPos: { x: 0, y: 0, z: 0 },
                busModelMatrixNeedsUpdate: null,
                appliedTarget: { x: 0, y: 0, z: 0 },
                appliedOffset: { x: 0, y: 0, z: 0 },
                appliedCamera: { x: 0, y: 0, z: 0 }
            },
            desired: { x: 0, y: 0, z: 0 },
            target: { x: 0, y: 0, z: 0 }
        };

        this._setupUi = new SetupUIController();

        this._pausedByOverlay = false;
        this._pauseKeepsCameraInput = false;
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

        this._vehicleMotionDebugOverlay = new VehicleMotionDebugOverlay();
        this._vehicleMotionDebugOverlay.attach(document.body);

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

        const probeGeo = new THREE.SphereGeometry(1, 64, 32);
        const probeMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 1.0,
            roughness: 0.18
        });
        const probe = new THREE.Mesh(probeGeo, probeMat);
        probe.position.set(0, 4, 0);
        probe.castShadow = true;
        probe.receiveShadow = true;
        probe.name = 'ibl_probe_sphere';
        probe.visible = false;
        this.busAnchor.add(probe);
        this._iblProbe = probe;
        this.engine.applyCurrentIBLIntensity?.({ force: true });

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
        this._closeSetupOverlay({ restoreInput: false });

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

        this._vehicleMotionDebugOverlay?.destroy?.();
        this._vehicleMotionDebugOverlay = null;

        this._debugPanel?.destroy();
        this._debugPanel = null;
        this._debugEnabled = false;

        // Cleanup scene
        if (this.busAnchor) {
            if (this.busModel) this.busAnchor.remove(this.busModel);
            this.engine.scene.remove(this.busAnchor);
        }
        if (this._iblProbe) {
            this._iblProbe.removeFromParent?.();
            this._iblProbe.geometry?.dispose?.();
            const mat = this._iblProbe.material ?? null;
            if (Array.isArray(mat)) {
                for (const entry of mat) entry?.dispose?.();
            } else {
                mat?.dispose?.();
            }
            this._iblProbe = null;
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

    pause({ nextName = null } = {}) {
        if (this._pausedByOverlay) return;
        this._pausedByOverlay = true;
        this._pauseKeepsCameraInput = nextName === 'options';

        this._closeSetupOverlay({ restoreInput: false });

        window.removeEventListener('keydown', this._onKeyDown);
        if (!this._pauseKeepsCameraInput) {
            const canvas = this.engine?.renderer?.domElement;
            if (canvas) {
                canvas.removeEventListener('pointerdown', this._onPointerDown);
            }
            window.removeEventListener('pointermove', this._onPointerMove);
            window.removeEventListener('pointerup', this._onPointerUp);
            window.removeEventListener('pointercancel', this._onPointerUp);
        }

        this.inputManager?.reset?.();
        this.inputManager?.detach?.();
        this.hud?.hide?.();
        document.activeElement?.blur?.();
    }

    resume() {
        if (!this._pausedByOverlay) return;
        this._pausedByOverlay = false;

        this.hud?.show?.();
        this.inputManager?.reset?.();
        this.inputManager?.attach?.();

        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        if (!this._pauseKeepsCameraInput) {
            const canvas = this.engine?.renderer?.domElement;
            if (canvas) {
                canvas.addEventListener('pointerdown', this._onPointerDown, { passive: false });
            }
            window.addEventListener('pointermove', this._onPointerMove, { passive: false });
            window.addEventListener('pointerup', this._onPointerUp, { passive: false });
            window.addEventListener('pointercancel', this._onPointerUp, { passive: false });
        }
        this._pauseKeepsCameraInput = false;
    }

    update(dt) {
        const debugSettings = this.engine?.vehicleMotionDebugSettings ?? null;
        const freezeCamera = debugSettings?.camera?.freeze === true;
        const manualDebug = this._cameraMotionDebug?.manual ?? null;
        if (manualDebug) {
            manualDebug.applied = false;
            manualDebug.anchorMatrixNeedsUpdate = null;
            manualDebug.anchorMatrixErr = null;
            manualDebug.busModelMatrixNeedsUpdate = null;
        }

        // Run game loop (handles input, physics, controllers, world, UI)
        this.gameLoop?.update(dt);

        // Update chase camera
        let cameraMode = freezeCamera ? 'frozen' : 'none';
        if (!freezeCamera) {
            const touring = this._cameraTour?.update(dt) ?? false;
            if (touring) {
                cameraMode = 'tour';
            } else {
                const manual = this._updateManualCamera(dt);
                if (manual) {
                    cameraMode = 'manual';
                } else {
                    cameraMode = 'chase';
                    this._updateChaseCamera(dt);
                }
            }
        }

        // Debug: compute chase target/desired regardless of active mode.
        if (this.busAnchor) {
            this._tmpDebugTarget.copy(this.busAnchor.position);
            this._tmpDebugTarget.y += this._chase.lookY;

            this.busAnchor.getWorldQuaternion(this._tmpDebugQ);
            this._tmpDebugForward.set(0, 0, 1).applyQuaternion(this._tmpDebugQ);
            this._tmpDebugForward.y = 0;
            if (this._tmpDebugForward.lengthSq() > 1e-8) this._tmpDebugForward.normalize();
            else this._tmpDebugForward.set(0, 0, 1);

            this._tmpDebugDesired.copy(this.busAnchor.position);
            this._tmpDebugDesired.addScaledVector(this._tmpDebugForward, -this._chase.distance);
            this._tmpDebugDesired.y += this._chase.height;
        }

        const cam = this.engine?.camera ?? null;
        const target = this._getBusCenter();
        this._cameraMotionDebug.mode = cameraMode;
        if (target) {
            this._cameraMotionDebug.target.x = target.x;
            this._cameraMotionDebug.target.y = target.y;
            this._cameraMotionDebug.target.z = target.z;
        }
        if (this.busAnchor) {
            this._cameraMotionDebug.chase.desired.x = this._tmpDebugDesired.x;
            this._cameraMotionDebug.chase.desired.y = this._tmpDebugDesired.y;
            this._cameraMotionDebug.chase.desired.z = this._tmpDebugDesired.z;
            const sharp = Number.isFinite(CAMERA_TUNE.followSharpness) ? CAMERA_TUNE.followSharpness : 7.0;
            const safeDt = Math.max(0, Number(dt) || 0);
            this._cameraMotionDebug.chase.alpha = 1 - Math.exp(-safeDt * sharp);
        }
        const drag = this._cameraDrag;
        this._cameraMotionDebug.manual.hasOverride = !!drag.hasOverride;
        this._cameraMotionDebug.manual.active = !!drag.active;
        this._cameraMotionDebug.manual.returning = !!drag.returning;
        this._cameraMotionDebug.manual.idleTime = Number.isFinite(drag.idleTime) ? drag.idleTime : 0;
        this._cameraMotionDebug.manual.returnElapsed = Number.isFinite(drag.returnElapsed) ? drag.returnElapsed : 0;
        if (cameraMode === 'chase') {
            this._cameraMotionDebug.desired.x = this._tmpDesired.x;
            this._cameraMotionDebug.desired.y = this._tmpDesired.y;
            this._cameraMotionDebug.desired.z = this._tmpDesired.z;
        } else if (cam?.position) {
            this._cameraMotionDebug.desired.x = cam.position.x;
            this._cameraMotionDebug.desired.y = cam.position.y;
            this._cameraMotionDebug.desired.z = cam.position.z;
        }
        const loco = this.engine?.simulation?.physics?.getVehicleState?.('player')?.locomotion ?? null;
        const canvas = this.engine?.renderer?.domElement ?? null;
        const vpW = Number(canvas?.clientWidth ?? canvas?.width ?? 0);
        const vpH = Number(canvas?.clientHeight ?? canvas?.height ?? 0);
        this._vehicleMotionDebugOverlay?.update?.({
            nowMs: this.engine?.frameTimingDebugInfo?.nowMs ?? null,
            dt,
            timing: this.engine?.frameTimingDebugInfo ?? null,
            physicsLoop: this.engine?.getPhysicsLoopDebugInfo?.() ?? null,
            anchor: this.busAnchor,
            locomotion: loco,
            cameraMotion: this._cameraMotionDebug,
            camera: this.engine?.camera ?? null,
            viewport: { width: vpW, height: vpH },
            settings: debugSettings
        });
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
        if (this.busAnchor?.updateMatrixWorld) this.busAnchor.updateMatrixWorld(true);
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
        if (this.busAnchor?.updateMatrixWorld) this.busAnchor.updateMatrixWorld(true);
        const manualDebug = this._cameraMotionDebug?.manual ?? null;
        if (manualDebug) {
            const anchor = this.busAnchor ?? null;
            const anchorPos = anchor?.position ?? null;
            if (anchorPos) {
                manualDebug.anchorPos.x = anchorPos.x;
                manualDebug.anchorPos.y = anchorPos.y;
                manualDebug.anchorPos.z = anchorPos.z;
            }
            const anchorMw = anchor?.matrixWorld?.elements ?? null;
            if (anchorMw) {
                manualDebug.anchorMatrixPos.x = anchorMw[12];
                manualDebug.anchorMatrixPos.y = anchorMw[13];
                manualDebug.anchorMatrixPos.z = anchorMw[14];
                manualDebug.anchorMatrixNeedsUpdate = anchor?.matrixWorldNeedsUpdate === true ? true : anchor?.matrixWorldNeedsUpdate === false ? false : null;
                if (anchorPos) {
                    const ex = anchorPos.x - anchorMw[12];
                    const ey = anchorPos.y - anchorMw[13];
                    const ez = anchorPos.z - anchorMw[14];
                    manualDebug.anchorMatrixErr = Math.hypot(ex, ey, ez);
                } else {
                    manualDebug.anchorMatrixErr = null;
                }
            }
            const model = this.busModel ?? null;
            const modelMw = model?.matrixWorld?.elements ?? null;
            if (modelMw) {
                manualDebug.busModelMatrixPos.x = modelMw[12];
                manualDebug.busModelMatrixPos.y = modelMw[13];
                manualDebug.busModelMatrixPos.z = modelMw[14];
                manualDebug.busModelMatrixNeedsUpdate = model?.matrixWorldNeedsUpdate === true ? true : model?.matrixWorldNeedsUpdate === false ? false : null;
            }
            manualDebug.appliedOffset.x = this._cameraDrag.offset.x;
            manualDebug.appliedOffset.y = this._cameraDrag.offset.y;
            manualDebug.appliedOffset.z = this._cameraDrag.offset.z;
        }
        const target = this._getBusCenter();
        if (!target) {
            if (manualDebug) manualDebug.applied = false;
            return;
        }
        if (manualDebug) {
            manualDebug.applied = true;
            manualDebug.appliedTarget.x = target.x;
            manualDebug.appliedTarget.y = target.y;
            manualDebug.appliedTarget.z = target.z;
        }
        cam.position.copy(target).add(this._cameraDrag.offset);
        cam.lookAt(target);
        if (manualDebug) {
            manualDebug.appliedCamera.x = cam.position.x;
            manualDebug.appliedCamera.y = cam.position.y;
            manualDebug.appliedCamera.z = cam.position.z;
        }
    }

    _updateManualCamera(dt) {
        const drag = this._cameraDrag;
        if (!drag.hasOverride || !this.busModel) return false;
        if (drag.active) {
            this._applyManualCamera();
            return true;
        }

        if (this.sm?.isOverlayOpen?.('options')) {
            drag.idleTime = 0;
            drag.returning = false;
            drag.returnElapsed = 0;
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
        if (this._setupUi?.isOpen?.()) return;

        if (e.code === 'KeyQ') {
            e.preventDefault();
            this._openSetupOverlay();
            return;
        }

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

    _openSetupOverlay() {
        if (!this._setupUi || this._setupUi.isOpen()) return;

        this.inputManager?.reset?.();
        this.inputManager?.detach?.();
        this.hud?.hide?.();

        this._cameraTour?.stop?.(true);
        this._cameraDrag.active = false;
        this._cameraDrag.pointerId = null;
        this._cameraDrag.idleTime = 0;

        const scenes = getSelectableSceneShortcuts().map((scene) => ({
            key: scene.key,
            label: scene.label,
            state: scene.id
        }));

        this._setupUi.open({
            mode: 'overlay',
            sceneItems: scenes,
            closeItem: { key: 'Q', label: 'Close overlay' },
            currentStateId: this.sm?.currentName ?? null,
            currentStateLabel: 'Gameplay',
            onSelectState: (state) => {
                const id = typeof state === 'string' ? state : '';
                if (!id) return;
                this._closeSetupOverlay({ restoreInput: false });
                this.sm.go(id);
            },
            onRequestClose: () => this._closeSetupOverlay()
        });
    }

    _closeSetupOverlay({ restoreInput = true } = {}) {
        if (!this._setupUi?.isOpen?.()) return;
        this._setupUi.close();
        if (!restoreInput) return;

        this.hud?.show?.();
        this.inputManager?.reset?.();
        this.inputManager?.attach?.();
    }
}
