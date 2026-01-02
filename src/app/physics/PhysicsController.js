// src/app/physics/PhysicsController.js
import * as THREE from 'three';
import { PhysicsLoop } from './PhysicsLoop.js';
import { loadRapier } from './rapier/RapierLoader.js';

const DEFAULT_CONFIG = {
    fixedDt: 1 / 60,
    maxSubSteps: 10,
    gravity: { x: 0, y: -9.81, z: 0 },
    groundSize: 2000,
    groundThickness: 2,
    engineForce: 12000,
    brakeForce: 8000,
    handbrakeForce: 12000,
    wheelRadius: 0.55,
    suspensionRestLength: 0.35,
    maxSteerDeg: 35
};

const FALLBACK_DIMENSIONS = {
    width: 2.5,
    height: 3.0,
    length: 10.0
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function degToRad(deg) {
    return deg * (Math.PI / 180);
}

function yawFromQuat(q) {
    if (!q) return 0;
    const siny = 2 * (q.w * q.y + q.x * q.z);
    const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
    return Math.atan2(siny, cosy);
}

function resolveModel(entry) {
    return entry.anchor?.userData?.model ?? entry.api?.root ?? (entry.vehicle?.isObject3D ? entry.vehicle : null);
}

function resolveVehicleConfig(vehicle, api, model) {
    const base = (vehicle && typeof vehicle === 'object' && !vehicle.isObject3D) ? { ...vehicle } : {};

    let dimensions = base.dimensions ?? null;
    if (!dimensions && model) {
        const box = new THREE.Box3().setFromObject(model);
        if (!box.isEmpty()) {
            const size = box.getSize(new THREE.Vector3());
            dimensions = { width: size.x, height: size.y, length: size.z };
        }
    }

    dimensions = dimensions ?? { ...FALLBACK_DIMENSIONS };

    const wheelRadius = Math.max(0.05, base.wheelRadius ?? api?.wheelRig?.wheelRadius ?? DEFAULT_CONFIG.wheelRadius);
    const wheelbaseRaw = base.wheelbase ?? Math.max(2.5, dimensions.length * 0.6);
    const wheelbase = clamp(wheelbaseRaw, 2.5, 10.0);

    return {
        ...base,
        dimensions,
        wheelRadius,
        wheelbase,
        maxSpeedKph: base.maxSpeedKph ?? 80,
        maxSteerDeg: base.maxSteerDeg ?? DEFAULT_CONFIG.maxSteerDeg
    };
}

function computeBoundsLocal(anchor, model, dimensions) {
    const fallbackSize = new THREE.Vector3(
        dimensions?.width ?? FALLBACK_DIMENSIONS.width,
        dimensions?.height ?? FALLBACK_DIMENSIONS.height,
        dimensions?.length ?? FALLBACK_DIMENSIONS.length
    );
    const fallbackCenter = new THREE.Vector3(0, fallbackSize.y * 0.5, 0);

    if (!anchor || !model) {
        return { centerLocal: fallbackCenter, size: fallbackSize };
    }

    anchor.updateMatrixWorld(true);
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) {
        return { centerLocal: fallbackCenter, size: fallbackSize };
    }

    const centerWorld = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const centerLocal = anchor.worldToLocal(centerWorld.clone());

    return { centerLocal, size };
}

function computeWheelLayout(anchor, api, config, centerLocal) {
    const wheelRadius = Math.max(0.05, config.wheelRadius ?? DEFAULT_CONFIG.wheelRadius);
    const restLength = Math.max(0.15, config.suspensionRestLength ?? DEFAULT_CONFIG.suspensionRestLength);

    const rig = api?.wheelRig ?? null;
    const wheels = [];
    const front = [];
    const rear = [];

    const readLocal = (wheel) => {
        const pivot = wheel?.rollPivot ?? wheel?.steerPivot ?? null;
        if (!pivot?.getWorldPosition) return null;
        const tmp = new THREE.Vector3();
        pivot.getWorldPosition(tmp);
        return anchor.worldToLocal(tmp.clone());
    };

    if (rig && anchor?.updateMatrixWorld) {
        anchor.updateMatrixWorld(true);
        for (const w of rig.front ?? []) {
            const p = readLocal(w);
            if (p) front.push(p);
        }
        for (const w of rig.rear ?? []) {
            const p = readLocal(w);
            if (p) rear.push(p);
        }
    }

    if (front.length && rear.length) {
        const frontZ = front.reduce((sum, p) => sum + p.z, 0) / front.length;
        const rearZ = rear.reduce((sum, p) => sum + p.z, 0) / rear.length;
        const forwardSign = frontZ >= rearZ ? 1 : -1;

        for (const p of front) {
            wheels.push({ position: p.clone().sub(centerLocal), isFront: true });
        }
        for (const p of rear) {
            wheels.push({ position: p.clone().sub(centerLocal), isFront: false });
        }

        return { wheels, wheelRadius, restLength, forwardSign };
    }

    const width = config.dimensions?.width ?? FALLBACK_DIMENSIONS.width;
    const wheelbase = config.wheelbase ?? Math.max(2.5, (config.dimensions?.length ?? FALLBACK_DIMENSIONS.length) * 0.6);
    const halfTrack = Math.max(0.6, width * 0.45);
    const frontZ = wheelbase * 0.5;
    const rearZ = -wheelbase * 0.5;
    const wheelY = wheelRadius;

    const fallback = [
        { position: new THREE.Vector3(-halfTrack, wheelY, frontZ), isFront: true },
        { position: new THREE.Vector3(halfTrack, wheelY, frontZ), isFront: true },
        { position: new THREE.Vector3(-halfTrack, wheelY, rearZ), isFront: false },
        { position: new THREE.Vector3(halfTrack, wheelY, rearZ), isFront: false }
    ];

    for (const w of fallback) {
        wheels.push({ position: w.position.sub(centerLocal), isFront: w.isFront });
    }

    return { wheels, wheelRadius, restLength, forwardSign: 1 };
}

export class PhysicsController {
    /**
     * @param {import('../core/EventBus.js').EventBus} eventBus
     * @param {object} [config]
     */
    constructor(eventBus, config = {}) {
        this.eventBus = eventBus;

        this.config = { ...DEFAULT_CONFIG, ...config };

        const fixedDt = this.config.fixedDt ?? DEFAULT_CONFIG.fixedDt;
        const maxSubSteps = this.config.maxSubSteps ?? DEFAULT_CONFIG.maxSubSteps;

        this.loop = new PhysicsLoop({ fixedDt, maxSubSteps });
        this.loop.add({
            fixedUpdate: (dt) => this._fixedUpdate(dt)
        });

        this._vehicles = new Map();
        this._pendingVehicles = new Map();
        this._vehicleIds = new Set();

        this._environment = null;
        this._groundY = 0;
        this._groundBody = null;

        this._rapier = null;
        this._world = null;
        this._ready = false;

        this._initPromise = this._initRapier();

        this._unsubAdded = this.eventBus.on('vehicle:added', (e) => {
            this.addVehicle(e.id, e.vehicle, e.anchor, e.api);
        });

        this._unsubRemoved = this.eventBus.on('vehicle:removed', (e) => {
            this.removeVehicle(e.id);
        });
    }

    async _initRapier() {
        try {
            const rapier = await loadRapier();
            this._rapier = rapier;

            const gravity = this._resolveGravity(this.config.gravity);
            this._world = new rapier.World(gravity);
            this._world.timestep = this.loop.fixedDt;
            this._ready = true;

            this._refreshGround();
            this._flushPendingVehicles();
        } catch (err) {
            console.error('[PhysicsController] Failed to initialize Rapier.', err);
        }
    }

    _resolveGravity(gravity) {
        if (typeof gravity === 'number' && Number.isFinite(gravity)) {
            return { x: 0, y: gravity, z: 0 };
        }
        if (gravity && typeof gravity === 'object') {
            return {
                x: gravity.x ?? 0,
                y: gravity.y ?? -9.81,
                z: gravity.z ?? 0
            };
        }
        return { x: 0, y: -9.81, z: 0 };
    }

    _refreshGround() {
        if (!this._ready || !this._world || !this._rapier) return;

        if (this._groundBody) {
            this._world.removeRigidBody(this._groundBody);
            this._groundBody = null;
        }

        const size = this.config.groundSize ?? DEFAULT_CONFIG.groundSize;
        const thickness = this.config.groundThickness ?? DEFAULT_CONFIG.groundThickness;
        const halfSize = size * 0.5;
        const halfThickness = thickness * 0.5;

        const bodyDesc = this._rapier.RigidBodyDesc.fixed().setTranslation(0, this._groundY - halfThickness, 0);
        const body = this._world.createRigidBody(bodyDesc);

        const colliderDesc = this._rapier.ColliderDesc.cuboid(halfSize, halfThickness, halfSize);
        colliderDesc.setFriction(1.0);
        this._world.createCollider(colliderDesc, body);

        this._groundBody = body;
    }

    _resolveGroundY(env) {
        const roadY = env?.genConfig?.road?.surfaceY ?? env?.generatorConfig?.road?.surfaceY ?? env?.config?.road?.surfaceY;
        if (typeof roadY === 'number' && Number.isFinite(roadY)) return roadY;

        const groundY = env?.genConfig?.ground?.surfaceY ?? env?.generatorConfig?.ground?.surfaceY ?? env?.config?.ground?.surfaceY;
        if (typeof groundY === 'number' && Number.isFinite(groundY)) return groundY;

        return 0;
    }

    _flushPendingVehicles() {
        if (!this._pendingVehicles.size) return;
        for (const [id, entry] of this._pendingVehicles) {
            if (this._tryCreateVehicle(entry)) {
                this._pendingVehicles.delete(id);
            }
        }
    }

    _fixedUpdate(dt) {
        if (!this._ready || !this._world) return;

        if (this._pendingVehicles.size) {
            this._flushPendingVehicles();
        }

        for (const entry of this._vehicles.values()) {
            if (!entry.controller) continue;
            this._applyVehicleInput(entry);
            entry.controller.updateVehicle(dt);
        }

        this._world.step();

        for (const entry of this._vehicles.values()) {
            if (!entry.controller || !entry.body) continue;
            this._syncVehicleState(entry, dt);
        }
    }

    _applyVehicleInput(entry) {
        const input = entry.input;
        const steering = -input.steering * entry.maxSteerRad;
        const driveForce = input.throttle * entry.engineForce * (entry.forwardSign ?? 1);
        const brakeForce = (input.brake * entry.brakeForce) + (input.handbrake * entry.handbrakeForce);

        if (entry.body && (Math.abs(steering) > 1e-4 || input.throttle > 0.01 || input.brake > 0.01 || input.handbrake > 0.01)) {
            entry.body.wakeUp();
        }

        const allWheels = entry.wheelIndices.all;
        const steerWheels = entry.wheelIndices.front.length ? entry.wheelIndices.front : allWheels;
        const driveWheels = entry.wheelIndices.rear.length ? entry.wheelIndices.rear : allWheels;
        const steerLeftWheels = entry.wheelIndices.frontLeft?.length ? entry.wheelIndices.frontLeft : [];
        const steerRightWheels = entry.wheelIndices.frontRight?.length ? entry.wheelIndices.frontRight : [];

        const steerAngles = this._computeSteerAngles(entry, steering);

        for (const i of allWheels) {
            entry.controller.setWheelSteering(i, 0);
            entry.controller.setWheelEngineForce(i, 0);
            entry.controller.setWheelBrake(i, brakeForce);
        }

        if (steerLeftWheels.length || steerRightWheels.length) {
            for (const i of steerLeftWheels) {
                entry.controller.setWheelSteering(i, steerAngles.left);
            }
            for (const i of steerRightWheels) {
                entry.controller.setWheelSteering(i, steerAngles.right);
            }
        } else {
            for (const i of steerWheels) {
                entry.controller.setWheelSteering(i, steering);
            }
        }

        for (const i of driveWheels) {
            entry.controller.setWheelEngineForce(i, driveForce);
        }

        entry._steerAngle = steerAngles.center;
        entry._steerAngleLeft = steerAngles.left;
        entry._steerAngleRight = steerAngles.right;
    }

    _syncVehicleState(entry, dt) {
        const pos = entry.body.translation();
        const rot = entry.body.rotation();
        const yaw = yawFromQuat(rot);

        const anchorPos = {
            x: pos.x - entry.centerLocal.x,
            y: pos.y - entry.centerLocal.y,
            z: pos.z - entry.centerLocal.z
        };

        const speed = entry.controller.currentVehicleSpeed();
        const wheelRadius = Math.max(1e-3, entry.wheelRadius ?? DEFAULT_CONFIG.wheelRadius);
        entry.wheelSpinAccum += (speed / wheelRadius) * dt;

        const loco = entry.state.locomotion;
        loco.position.x = anchorPos.x;
        loco.position.y = anchorPos.y;
        loco.position.z = anchorPos.z;
        loco.yaw = yaw;
        loco.speed = speed;
        loco.speedKph = speed * 3.6;
        loco.steerAngle = entry._steerAngle ?? 0;
        loco.steerAngleLeft = entry._steerAngleLeft ?? entry._steerAngle ?? 0;
        loco.steerAngleRight = entry._steerAngleRight ?? entry._steerAngle ?? 0;
        loco.wheelSpinAccum = entry.wheelSpinAccum;

        const susp = entry.state.suspension;
        susp.bodyPitch = 0;
        susp.bodyRoll = 0;
        susp.bodyHeave = 0;
    }

    _computeSteerAngles(entry, steering) {
        const steerSign = Math.sign(steering);
        const steerAbs = Math.abs(steering);
        const maxSteer = entry.maxSteerRad ?? degToRad(DEFAULT_CONFIG.maxSteerDeg);

        let steerLeft = steering;
        let steerRight = steering;
        const track = entry.frontTrack ?? 0;
        const wheelbase = entry.wheelbase ?? entry.config?.wheelbase ?? 0;

        if (steerAbs > 1e-4 && track > 0.01 && wheelbase > 0.1) {
            const radius = wheelbase / Math.max(1e-4, Math.tan(steerAbs));
            const innerDen = Math.max(1e-3, radius - track * 0.5);
            const outerDen = radius + track * 0.5;
            const inner = clamp(Math.atan(wheelbase / innerDen), 0, maxSteer);
            const outer = clamp(Math.atan(wheelbase / outerDen), 0, maxSteer);
            if (steerSign >= 0) {
                steerLeft = inner;
                steerRight = outer;
            } else {
                steerLeft = -outer;
                steerRight = -inner;
            }
        }

        return { center: steering, left: steerLeft, right: steerRight };
    }

    _tryCreateVehicle(entry) {
        if (!this._ready || !this._world || !this._rapier) return false;
        if (!entry.anchor) return false;

        const model = resolveModel(entry);
        entry.config = resolveVehicleConfig(entry.vehicle, entry.api, model);

        const { centerLocal, size } = computeBoundsLocal(entry.anchor, model, entry.config.dimensions);
        const safeSize = new THREE.Vector3(
            Math.max(0.5, size.x || entry.config.dimensions.width || FALLBACK_DIMENSIONS.width),
            Math.max(0.5, size.y || entry.config.dimensions.height || FALLBACK_DIMENSIONS.height),
            Math.max(0.5, size.z || entry.config.dimensions.length || FALLBACK_DIMENSIONS.length)
        );

        const layout = computeWheelLayout(entry.anchor, entry.api, entry.config, centerLocal);
        if (!layout || !layout.wheels.length) return false;

        const startX = entry.anchor.position?.x ?? 0;
        const startY = entry.anchor.position?.y ?? 0;
        const startZ = entry.anchor.position?.z ?? 0;

        const bodyDesc = this._rapier.RigidBodyDesc.dynamic()
            .setTranslation(startX + centerLocal.x, startY + centerLocal.y, startZ + centerLocal.z)
            .enabledRotations(false, true, false)
            .setLinearDamping(0.2)
            .setAngularDamping(0.6);

        const body = this._world.createRigidBody(bodyDesc);

        const colliderDesc = this._rapier.ColliderDesc.cuboid(
            safeSize.x * 0.5,
            safeSize.y * 0.5,
            safeSize.z * 0.5
        );
        colliderDesc.setFriction(1.0);
        colliderDesc.setRestitution(0.0);
        this._world.createCollider(colliderDesc, body);

        const controller = this._world.createVehicleController(body);
        controller.indexUpAxis = 1;
        controller.setIndexForwardAxis = 2;

        const direction = { x: 0, y: -1, z: 0 };
        const axle = { x: 1, y: 0, z: 0 };

        const frontIndices = [];
        const rearIndices = [];
        const frontLeftIndices = [];
        const frontRightIndices = [];
        const frontXs = [];

        for (const wheel of layout.wheels) {
            const connection = {
                x: wheel.position.x,
                y: wheel.position.y + layout.restLength,
                z: wheel.position.z
            };
            controller.addWheel(connection, direction, axle, layout.restLength, layout.wheelRadius);
            const idx = controller.numWheels() - 1;

            if (wheel.isFront) {
                frontIndices.push(idx);
                frontXs.push(wheel.position.x);
                if (wheel.position.x < 0) frontLeftIndices.push(idx);
                else frontRightIndices.push(idx);
            } else {
                rearIndices.push(idx);
            }
        }

        entry.body = body;
        entry.controller = controller;
        entry.centerLocal = centerLocal;
        entry.wheelRadius = layout.wheelRadius;
        entry.wheelSpinAccum = entry.state.locomotion.wheelSpinAccum ?? 0;
        entry.forwardSign = layout.forwardSign;
        entry.wheelIndices = {
            front: frontIndices,
            rear: rearIndices,
            frontLeft: frontLeftIndices,
            frontRight: frontRightIndices,
            all: [...frontIndices, ...rearIndices]
        };
        if (frontXs.length >= 2) {
            entry.frontTrack = Math.max(...frontXs) - Math.min(...frontXs);
        } else if (frontXs.length === 1) {
            entry.frontTrack = Math.abs(frontXs[0]) * 2;
        } else {
            entry.frontTrack = 0;
        }
        entry.wheelbase = entry.config.wheelbase ?? 0;
        entry.maxSteerRad = degToRad(entry.config.maxSteerDeg ?? DEFAULT_CONFIG.maxSteerDeg);
        entry.engineForce = this.config.engineForce ?? DEFAULT_CONFIG.engineForce;
        entry.brakeForce = this.config.brakeForce ?? DEFAULT_CONFIG.brakeForce;
        entry.handbrakeForce = this.config.handbrakeForce ?? DEFAULT_CONFIG.handbrakeForce;

        return true;
    }

    setEnvironment(env) {
        this._environment = env ?? null;
        this._groundY = this._resolveGroundY(env);
        this._refreshGround();
    }

    addVehicle(vehicleId, vehicle, anchor, api) {
        if (this._vehicleIds.has(vehicleId)) {
            return;
        }

        const startX = anchor?.position?.x ?? 0;
        const startY = anchor?.position?.y ?? 0;
        const startZ = anchor?.position?.z ?? 0;
        const startYaw = anchor?.rotation?.y ?? 0;

        const entry = {
            id: vehicleId,
            vehicle,
            anchor,
            api,
            config: null,
            input: { throttle: 0, brake: 0, steering: 0, handbrake: 0 },
            state: {
                locomotion: {
                    position: { x: startX, y: startY, z: startZ },
                    yaw: startYaw,
                    speed: 0,
                    speedKph: 0,
                    steerAngle: 0,
                    steerAngleLeft: 0,
                    steerAngleRight: 0,
                    wheelSpinAccum: 0
                },
                suspension: {
                    bodyPitch: 0,
                    bodyRoll: 0,
                    bodyHeave: 0
                },
                drivetrain: {
                    rpm: 0,
                    gear: 1
                },
                collision: null,
                brake: null
            },
            body: null,
            controller: null,
            centerLocal: new THREE.Vector3(),
            wheelRadius: DEFAULT_CONFIG.wheelRadius,
            wheelSpinAccum: 0,
            forwardSign: 1,
            wheelIndices: { front: [], rear: [], frontLeft: [], frontRight: [], all: [] },
            frontTrack: 0,
            wheelbase: 0,
            maxSteerRad: degToRad(DEFAULT_CONFIG.maxSteerDeg),
            _steerAngleLeft: 0,
            _steerAngleRight: 0,
            engineForce: this.config.engineForce ?? DEFAULT_CONFIG.engineForce,
            brakeForce: this.config.brakeForce ?? DEFAULT_CONFIG.brakeForce,
            handbrakeForce: this.config.handbrakeForce ?? DEFAULT_CONFIG.handbrakeForce
        };

        this._vehicles.set(vehicleId, entry);
        this._vehicleIds.add(vehicleId);

        if (this._ready) {
            if (!this._tryCreateVehicle(entry)) {
                this._pendingVehicles.set(vehicleId, entry);
            }
        } else {
            this._pendingVehicles.set(vehicleId, entry);
        }

        this.eventBus.emit('physics:vehicleRegistered', { vehicleId });
    }

    removeVehicle(vehicleId) {
        const entry = this._vehicles.get(vehicleId);
        if (!entry) return;

        if (entry.controller && this._world) {
            this._world.removeVehicleController(entry.controller);
        }
        if (entry.body && this._world) {
            this._world.removeRigidBody(entry.body);
        }

        this._vehicles.delete(vehicleId);
        this._pendingVehicles.delete(vehicleId);
        this._vehicleIds.delete(vehicleId);

        this.eventBus.emit('physics:vehicleUnregistered', { vehicleId });
    }

    setInput(vehicleId, input) {
        const entry = this._vehicles.get(vehicleId) ?? this._pendingVehicles.get(vehicleId);
        if (!entry) return;

        if (typeof input.throttle === 'number') {
            entry.input.throttle = clamp(input.throttle, 0, 1);
        }
        if (typeof input.brake === 'number') {
            entry.input.brake = clamp(input.brake, 0, 1);
        }
        if (typeof input.steering === 'number') {
            entry.input.steering = clamp(input.steering, -1, 1);
        }
        if (typeof input.handbrake === 'number') {
            entry.input.handbrake = clamp(input.handbrake, 0, 1);
        }

        if (typeof input.steering === 'number') {
            const steering = -entry.input.steering * entry.maxSteerRad;
            const steerAngles = this._computeSteerAngles(entry, steering);
            entry._steerAngle = steerAngles.center;
            entry._steerAngleLeft = steerAngles.left;
            entry._steerAngleRight = steerAngles.right;
            const loco = entry.state.locomotion;
            loco.steerAngle = entry._steerAngle ?? 0;
            loco.steerAngleLeft = entry._steerAngleLeft ?? entry._steerAngle ?? 0;
            loco.steerAngleRight = entry._steerAngleRight ?? entry._steerAngle ?? 0;
        }
    }

    update(dt) {
        this.loop.update(dt);
    }

    getVehicleState(vehicleId) {
        const entry = this._vehicles.get(vehicleId);
        return entry ? entry.state : null;
    }

    getSystem(name) {
        return null;
    }

    getVehicleIds() {
        return Array.from(this._vehicleIds);
    }

    hasVehicle(vehicleId) {
        return this._vehicleIds.has(vehicleId);
    }

    dispose() {
        this._unsubAdded?.();
        this._unsubRemoved?.();

        this.loop.clear();

        for (const id of [...this._vehicleIds]) {
            this.removeVehicle(id);
        }

        if (this._world) {
            this._world.free();
            this._world = null;
        }

        this._rapier = null;
        this._ready = false;
    }
}
