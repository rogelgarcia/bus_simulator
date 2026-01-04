// src/app/physics/simulations/RapierVehicleSim.js
// Rapier vehicle integration; does not handle rendering or UI.
import * as THREE from 'three';
import { PhysicsLoop } from '../PhysicsLoop.js';
import { loadRapier } from '../rapier/RapierLoader.js';
import {
    DEFAULT_ENGINE_GEARS,
    buildEngineConfig,
    computeEngineOutput,
    createEngineState,
    gearLabelToNumber
} from './EngineTransmissionSim.js';

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

const DEFAULT_TUNING = {
    mass: 10500,
    engineForce: 19000,
    brakeForce: 14000,
    handbrakeForce: 16000,
    maxSteerDeg: 35,
    linearDamping: 0.28,
    angularDamping: 0.9,
    brakeBias: 0.6,
    chassisFriction: 0.2,
    bodyTiltScale: 0.9,
    maxBodyAngleDeg: 7,
    suspension: {
        restLength: 0.35,
        stiffness: 30000,
        compression: 3600,
        relaxation: 4200,
        travel: 0.2,
        maxForce: 90000
    },
    frictionSlip: 7.8,
    sideFrictionStiffness: 1.3
};

const BUS_TUNING = {
    city: {
        mass: 10000,
        engineForce: 20000,
        brakeForce: 15000,
        handbrakeForce: 17000,
        maxSteerDeg: 38,
        linearDamping: 0.32,
        angularDamping: 1.0,
        bodyTiltScale: 0.8,
        maxBodyAngleDeg: 6,
        suspension: {
            restLength: 0.32,
            stiffness: 34000,
            compression: 4000,
            relaxation: 4600,
            travel: 0.18,
            maxForce: 95000
        },
        frictionSlip: 8.2,
        sideFrictionStiffness: 1.45,
        engine: {
            maxTorque: 1300,
            finalDrive: 4.4
        }
    },
    coach: {
        mass: 11800,
        engineForce: 21000,
        brakeForce: 15500,
        handbrakeForce: 17500,
        maxSteerDeg: 36,
        linearDamping: 0.26,
        angularDamping: 0.85,
        bodyTiltScale: 1.0,
        maxBodyAngleDeg: 8,
        suspension: {
            restLength: 0.38,
            stiffness: 26000,
            compression: 3200,
            relaxation: 3800,
            travel: 0.22,
            maxForce: 85000
        },
        frictionSlip: 7.4,
        sideFrictionStiffness: 1.22,
        engine: {
            maxTorque: 1500,
            finalDrive: 4.1
        }
    },
    double: {
        mass: 13500,
        engineForce: 22000,
        brakeForce: 16500,
        handbrakeForce: 18500,
        maxSteerDeg: 32,
        linearDamping: 0.34,
        angularDamping: 1.15,
        bodyTiltScale: 0.75,
        maxBodyAngleDeg: 5,
        suspension: {
            restLength: 0.36,
            stiffness: 36000,
            compression: 4300,
            relaxation: 5200,
            travel: 0.2,
            maxForce: 110000
        },
        frictionSlip: 8.6,
        sideFrictionStiffness: 1.35,
        engine: {
            maxTorque: 1650,
            finalDrive: 4.6
        }
    }
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function computeBoxInertia(mass, width, height, length) {
    if (!Number.isFinite(mass) || mass <= 0) return { x: null, y: null, z: null };
    const w2 = width * width;
    const h2 = height * height;
    const l2 = length * length;
    const k = mass / 12;
    return {
        x: k * (h2 + l2),
        y: k * (w2 + l2),
        z: k * (w2 + h2)
    };
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

function setControllerAxis(controller, propName, setterName, value) {
    if (!controller) return;
    const proto = Object.getPrototypeOf(controller);
    const setter = controller[setterName];
    if (typeof setter === 'function') {
        setter.call(controller, value);
        return;
    }

    const setterDesc = Object.getOwnPropertyDescriptor(controller, setterName)
        ?? Object.getOwnPropertyDescriptor(proto, setterName);
    if (setterDesc?.set) {
        setterDesc.set.call(controller, value);
        return;
    }

    try {
        controller[setterName] = value;
        if (controller[propName] === value) return;
    } catch {
        // ignore
    }

    const desc = Object.getOwnPropertyDescriptor(controller, propName)
        ?? Object.getOwnPropertyDescriptor(proto, propName);
    if (desc?.set) {
        desc.set.call(controller, value);
        return;
    }
    if (desc?.writable) {
        controller[propName] = value;
    }
}

function resolveBusId(entry, model) {
    const raw = model?.userData?.id
        ?? entry?.api?.root?.userData?.id
        ?? entry?.anchor?.userData?.id
        ?? entry?.vehicle?.id
        ?? entry?.config?.name;
    if (!raw || typeof raw !== 'string') return null;
    const id = raw.toLowerCase();
    if (id.includes('city')) return 'city';
    if (id.includes('coach')) return 'coach';
    if (id.includes('double')) return 'double';
    return id;
}

function resolveBusTuning(entry, model) {
    const busId = resolveBusId(entry, model);
    const base = {
        ...DEFAULT_TUNING,
        ...(busId && BUS_TUNING[busId] ? BUS_TUNING[busId] : {})
    };

    const length = entry?.config?.dimensions?.length ?? model?.userData?.length ?? FALLBACK_DIMENSIONS.length;
    const lengthScale = clamp(length / FALLBACK_DIMENSIONS.length, 0.85, 1.35);

    const suspension = {
        ...DEFAULT_TUNING.suspension,
        ...(base.suspension ?? {})
    };
    const engine = buildEngineConfig(base.engine ?? null, lengthScale);

    return {
        ...base,
        mass: base.mass * lengthScale,
        engineForce: base.engineForce * lengthScale,
        brakeForce: base.brakeForce * lengthScale,
        handbrakeForce: base.handbrakeForce * lengthScale,
        suspension,
        engine
    };
}

function averageWheelValue(controller, indices, getter) {
    if (!controller || !indices?.length) return null;
    let sum = 0;
    let count = 0;
    for (const i of indices) {
        const value = getter(i);
        if (typeof value === 'number') {
            sum += value;
            count += 1;
        }
    }
    return count ? sum / count : null;
}

function buildWheelLayoutSnapshot(entry) {
    const indices = entry?.wheelIndices?.all ?? [];
    if (!indices.length) return [];

    const wheelCenters = entry.wheelCenters ?? [];
    const wheelConnections = entry.wheelConnections ?? [];

    const wheels = indices.map((i) => ({
        index: i,
        label: `W${i}`,
        labelEx: null,
        center: wheelCenters[i] ?? null,
        connection: wheelConnections[i] ?? null,
        isFront: (entry.wheelIndices?.front ?? []).includes(i)
    }));

    const zTol = Math.max(0.25, Math.min(1.25, (entry.wheelRadius ?? DEFAULT_CONFIG.wheelRadius) * 1.5));
    const withConn = wheels.filter((w) => Number.isFinite(w.connection?.z) && Number.isFinite(w.connection?.x));
    if (withConn.length) {
        const sortedByZ = [...withConn].sort((a, b) => (b.connection.z - a.connection.z)); // front -> rear
        const groups = [];
        for (const w of sortedByZ) {
            const last = groups[groups.length - 1];
            if (!last || Math.abs(w.connection.z - last.z) > zTol) {
                groups.push({ z: w.connection.z, wheels: [w] });
            } else {
                last.wheels.push(w);
                last.z = last.wheels.reduce((sum, it) => sum + it.connection.z, 0) / last.wheels.length;
            }
        }

        const axleCharForRank = (rank, count) => {
            if (count <= 1) return 'F';
            if (count === 2) return rank === 0 ? 'F' : 'R';
            if (count === 3) return rank === 0 ? 'F' : (rank === 1 ? 'M' : 'R');
            if (rank === 0) return 'F';
            if (rank === count - 1) return 'R';
            return 'A';
        };

        const counts = new Map();
        for (let g = 0; g < groups.length; g++) {
            const axleChar = axleCharForRank(g, groups.length);
            for (const w of groups[g].wheels) {
                const sideChar = (w.connection.x ?? 0) < 0 ? 'L' : 'R';
                const base = `${axleChar}${sideChar}`;
                const n = (counts.get(base) ?? 0) + 1;
                counts.set(base, n);
                w.labelEx = n > 1 ? `${base}${n}` : base;
            }
        }
    }

    wheels.sort((a, b) => {
        const az = a.connection?.z ?? a.center?.z ?? 0;
        const bz = b.connection?.z ?? b.center?.z ?? 0;
        if (bz !== az) return bz - az; // front -> rear
        const ax = a.connection?.x ?? a.center?.x ?? 0;
        const bx = b.connection?.x ?? b.center?.x ?? 0;
        return ax - bx; // left -> right
    });

    return wheels;
}

const TMP_QUAT = new THREE.Quaternion();
const TMP_EULER = new THREE.Euler();

function resolveModel(entry) {
    return entry.anchor?.userData?.model ?? entry.api?.root ?? (entry.vehicle?.isObject3D ? entry.vehicle : null);
}

function resolveBoundsTarget(model, api) {
    if (api?.bodyRoot?.isObject3D) return api.bodyRoot;
    if (api?.root?.isObject3D) return api.root;
    return model;
}

function isBoxUsable(box) {
    if (!box || box.isEmpty()) return false;
    const size = box.getSize(new THREE.Vector3());
    return size.x > 0.5 && size.y > 0.5 && size.z > 0.5;
}

function resolveVehicleConfig(vehicle, api, model) {
    const base = (vehicle && typeof vehicle === 'object' && !vehicle.isObject3D) ? { ...vehicle } : {};

    let dimensions = base.dimensions ?? null;
    if (!dimensions && model) {
        const boundsTarget = resolveBoundsTarget(model, api);
        if (boundsTarget) {
            boundsTarget.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(boundsTarget);
            if (isBoxUsable(box)) {
                const size = box.getSize(new THREE.Vector3());
                dimensions = { width: size.x, height: size.y, length: size.z };
            }
        }
    }

    dimensions = dimensions ?? { ...FALLBACK_DIMENSIONS };

    const rawWheelRadius = base.wheelRadius ?? api?.wheelRig?.wheelRadius ?? DEFAULT_CONFIG.wheelRadius;
    const height = dimensions?.height ?? FALLBACK_DIMENSIONS.height;
    const maxWheelRadius = Math.min(1.2, Math.max(0.55, height * 0.45));
    const wheelRadius = clamp(Number.isFinite(rawWheelRadius) ? rawWheelRadius : DEFAULT_CONFIG.wheelRadius, 0.2, maxWheelRadius);
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

function computeBoundsLocal(anchor, model, api, dimensions) {
    const fallbackSize = new THREE.Vector3(
        dimensions?.width ?? FALLBACK_DIMENSIONS.width,
        dimensions?.height ?? FALLBACK_DIMENSIONS.height,
        dimensions?.length ?? FALLBACK_DIMENSIONS.length
    );
    const fallbackCenter = new THREE.Vector3(0, fallbackSize.y * 0.5, 0);

    const target = resolveBoundsTarget(model, api);
    if (!anchor || !target) {
        return { centerLocal: fallbackCenter, size: fallbackSize };
    }

    anchor.updateMatrixWorld(true);
    target.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(target);
    if (!isBoxUsable(box)) {
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
        for (const p of front) {
            wheels.push({ position: p.clone().sub(centerLocal), isFront: true });
        }
        for (const p of rear) {
            wheels.push({ position: p.clone().sub(centerLocal), isFront: false });
        }

        return { wheels, wheelRadius, restLength };
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

    return { wheels, wheelRadius, restLength };
}

export class RapierVehicleSim {
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
        this._initError = null;
        this._initStartMs = Date.now();
        this._fatalTimer = null;
        this._fatalReported = false;

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
            this._initError = err;
            this._queueFatal('Rapier', err);
            console.error('[RapierVehicleSim] Failed to initialize Rapier.', err);
        }
    }

    _queueFatal(label, err) {
        if (this._fatalReported) return;
        const elapsed = Date.now() - this._initStartMs;
        const delay = Math.max(0, 1000 - elapsed);
        const report = () => {
            if (this._fatalReported) return;
            this._fatalReported = true;
            if (typeof window === 'undefined') return;
            if (!Array.isArray(window.__testFatals)) window.__testFatals = [];
            const message = err?.message ?? String(err);
            window.__testFatals.push({ name: label, message });
        };
        if (delay > 0) {
            if (this._fatalTimer) {
                clearTimeout(this._fatalTimer);
            }
            this._fatalTimer = setTimeout(report, delay);
        } else {
            report();
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
        let driveForceTotal = input.throttle * entry.engineForce;
        const brakeForceTotal = (input.brake * entry.brakeForce) + (input.handbrake * entry.handbrakeForce);
        let drivetrain = entry.state.drivetrain;

        if (entry.engineConfig && entry.engine && entry.controller?.currentVehicleSpeed) {
            let speed = entry.controller.currentVehicleSpeed();
            if (!Number.isFinite(speed) || (!entry._spawnSettled && (entry._contactCount ?? 0) === 0)) {
                speed = 0;
            }
            const wheelRadius = Math.max(1e-3, entry.wheelRadius ?? DEFAULT_CONFIG.wheelRadius);
            const output = computeEngineOutput(entry.engineConfig, entry.engine, speed, wheelRadius, input.throttle);
            entry.engine.gearIndex = output.gearIndex;
            entry.engine.rpm = output.rpm;
            entry.engine.torque = output.torque;
            driveForceTotal = output.driveForce;
            drivetrain = entry.state.drivetrain;
            drivetrain.rpm = output.rpm;
            drivetrain.gear = output.gearNumber;
            drivetrain.torque = output.torque;
        }

        entry._driveForce = driveForceTotal;
        entry._brakeForce = brakeForceTotal;

        if (entry.body && (Math.abs(steering) > 1e-4 || input.throttle > 0.01 || input.brake > 0.01 || input.handbrake > 0.01)) {
            entry.body.wakeUp();
        }

        const allWheels = entry.wheelIndices.all;
        const steerWheels = entry.wheelIndices.front.length ? entry.wheelIndices.front : allWheels;
        const driveWheels = entry.wheelIndices.rear.length ? entry.wheelIndices.rear : allWheels;
        const steerLeftWheels = entry.wheelIndices.frontLeft?.length ? entry.wheelIndices.frontLeft : [];
        const steerRightWheels = entry.wheelIndices.frontRight?.length ? entry.wheelIndices.frontRight : [];
        const frontWheels = entry.wheelIndices.front ?? [];
        const rearWheels = entry.wheelIndices.rear ?? [];

        const steerAngles = this._computeSteerAngles(entry, steering);

        for (const i of allWheels) {
            entry.controller.setWheelSteering(i, 0);
            entry.controller.setWheelEngineForce(i, 0);
        }

        if (brakeForceTotal > 0 && allWheels.length) {
            const frontCount = frontWheels.length;
            const rearCount = rearWheels.length;
            const totalCount = allWheels.length;
            const bias = Number.isFinite(entry.brakeBias) ? clamp(entry.brakeBias, 0, 1) : 0.6;
            let frontBrake = brakeForceTotal;
            let rearBrake = brakeForceTotal;
            if (frontCount && rearCount) {
                frontBrake = brakeForceTotal * bias;
                rearBrake = brakeForceTotal * (1 - bias);
            }
            const frontPerWheel = frontCount ? frontBrake / frontCount : brakeForceTotal / totalCount;
            const rearPerWheel = rearCount ? rearBrake / rearCount : brakeForceTotal / totalCount;
            for (const i of allWheels) {
                const isFront = frontCount ? frontWheels.includes(i) : false;
                entry.controller.setWheelBrake(i, isFront ? frontPerWheel : rearPerWheel);
            }
        } else {
            for (const i of allWheels) {
                entry.controller.setWheelBrake(i, 0);
            }
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

        const driveForce = driveForceTotal;
        for (const i of driveWheels) {
            entry.controller.setWheelEngineForce(i, driveForce);
        }

        entry._steerAngle = steerAngles.center;
        entry._steerAngleLeft = steerAngles.left;
        entry._steerAngleRight = steerAngles.right;
    }

    _syncVehicleState(entry, dt) {
        const pos = entry.body.translation();
        let rot = entry.body.rotation();
        let contactCount = 0;
        if (entry.controller?.wheelIsInContact && entry.wheelIndices?.all?.length) {
            for (const i of entry.wheelIndices.all) {
                if (entry.controller.wheelIsInContact(i)) contactCount += 1;
            }
        }
        entry._contactCount = contactCount;
        if (!entry._spawnSettled) {
            if (contactCount > 0) entry._contactFrames += 1;
            else entry._contactFrames = 0;

            if (!entry._spawnSnapped && contactCount > 0) {
                const yaw = yawFromQuat(rot);
                TMP_EULER.set(0, yaw, 0, 'YXZ');
                TMP_QUAT.setFromEuler(TMP_EULER);
                entry.body.setRotation(TMP_QUAT, true);
                entry.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
                entry.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
                entry._spawnSnapped = true;
                rot = entry.body.rotation();
            }

            if (entry._contactFrames >= 3) entry._spawnSettled = true;
        }

        const yaw = yawFromQuat(rot);

        const anchorPos = {
            x: pos.x - entry.centerLocal.x,
            y: pos.y - entry.centerLocal.y,
            z: pos.z - entry.centerLocal.z
        };

        let speed = entry.controller.currentVehicleSpeed();
        if (!Number.isFinite(speed) || (!entry._spawnSettled && contactCount === 0)) speed = 0;
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
        let bodyPitch = 0;
        let bodyRoll = 0;
        if (rot && entry._spawnSettled) {
            TMP_QUAT.set(rot.x, rot.y, rot.z, rot.w);
            TMP_EULER.setFromQuaternion(TMP_QUAT, 'YXZ');
            bodyPitch = TMP_EULER.x * (entry.bodyTiltScale ?? 1);
            bodyRoll = TMP_EULER.z * (entry.bodyTiltScale ?? 1);
        }

        const maxAngle = entry.maxBodyAngle ?? degToRad(8);
        susp.bodyPitch = clamp(bodyPitch, -maxAngle, maxAngle);
        susp.bodyRoll = clamp(bodyRoll, -maxAngle, maxAngle);

        let heave = 0;
        if (entry.controller && entry.suspensionRestLength) {
            const avgLen = averageWheelValue(entry.controller, entry.wheelIndices.all, (i) => entry.controller.wheelSuspensionLength(i));
            if (typeof avgLen === 'number') {
                const travel = entry.suspensionTravel ?? entry.suspensionRestLength;
                heave = clamp(avgLen - entry.suspensionRestLength, -travel, travel);
            }
        }
        susp.bodyHeave = heave;
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

        const { centerLocal, size } = computeBoundsLocal(entry.anchor, model, entry.api, entry.config.dimensions);
        const safeSize = new THREE.Vector3(
            Math.max(0.5, size.x || entry.config.dimensions.width || FALLBACK_DIMENSIONS.width),
            Math.max(0.5, size.y || entry.config.dimensions.height || FALLBACK_DIMENSIONS.height),
            Math.max(0.5, size.z || entry.config.dimensions.length || FALLBACK_DIMENSIONS.length)
        );

        const layout = computeWheelLayout(entry.anchor, entry.api, entry.config, centerLocal);
        if (!layout || !layout.wheels.length) return false;

        entry.chassisSize = safeSize.clone();

        const tuning = resolveBusTuning(entry, model);
        entry.tuning = tuning;
        const suspension = tuning.suspension ?? {};
        const restLength = Number.isFinite(suspension.restLength) ? suspension.restLength : layout.restLength;

        const startX = entry.anchor.position?.x ?? 0;
        const startY = entry.anchor.position?.y ?? 0;
        const startZ = entry.anchor.position?.z ?? 0;

        const bodyDesc = this._rapier.RigidBodyDesc.dynamic()
            .setTranslation(startX + centerLocal.x, startY + centerLocal.y, startZ + centerLocal.z)
            .enabledRotations(true, true, true)
            .setLinearDamping(tuning.linearDamping ?? 0.2)
            .setAngularDamping(tuning.angularDamping ?? 0.6)
            .setAdditionalMass(tuning.mass ?? 0);

        const body = this._world.createRigidBody(bodyDesc);

        const colliderDesc = this._rapier.ColliderDesc.cuboid(
            safeSize.x * 0.5,
            safeSize.y * 0.5,
            safeSize.z * 0.5
        );
        colliderDesc.setFriction(tuning.chassisFriction ?? DEFAULT_TUNING.chassisFriction);
        colliderDesc.setRestitution(0.0);
        this._world.createCollider(colliderDesc, body);

        const controller = this._world.createVehicleController(body);
        setControllerAxis(controller, 'indexUpAxis', 'setIndexUpAxis', 1);
        setControllerAxis(controller, 'indexForwardAxis', 'setIndexForwardAxis', 2);

        const direction = { x: 0, y: -1, z: 0 };
        const axle = { x: -1, y: 0, z: 0 };

        const frontIndices = [];
        const rearIndices = [];
        const frontLeftIndices = [];
        const frontRightIndices = [];
        const rearLeftIndices = [];
        const rearRightIndices = [];
        const frontXs = [];
        const wheelCenters = [];
        const wheelConnections = [];

        for (const wheel of layout.wheels) {
            const connection = {
                x: wheel.position.x,
                y: wheel.position.y + restLength,
                z: wheel.position.z
            };
            controller.addWheel(connection, direction, axle, restLength, layout.wheelRadius);
            const idx = controller.numWheels() - 1;
            wheelCenters[idx] = { x: wheel.position.x, y: wheel.position.y, z: wheel.position.z };
            wheelConnections[idx] = { x: connection.x, y: connection.y, z: connection.z };

            controller.setWheelSuspensionRestLength(idx, restLength);
            controller.setWheelRadius(idx, layout.wheelRadius);

            if (wheel.isFront) {
                frontIndices.push(idx);
                frontXs.push(wheel.position.x);
                if (wheel.position.x < 0) frontLeftIndices.push(idx);
                else frontRightIndices.push(idx);
            } else {
                rearIndices.push(idx);
                if (wheel.position.x < 0) rearLeftIndices.push(idx);
                else rearRightIndices.push(idx);
            }

            if (Number.isFinite(suspension.travel)) {
                controller.setWheelMaxSuspensionTravel(idx, suspension.travel);
            }
            if (Number.isFinite(suspension.stiffness)) {
                controller.setWheelSuspensionStiffness(idx, suspension.stiffness);
            }
            if (Number.isFinite(suspension.compression)) {
                controller.setWheelSuspensionCompression(idx, suspension.compression);
            }
            if (Number.isFinite(suspension.relaxation)) {
                controller.setWheelSuspensionRelaxation(idx, suspension.relaxation);
            }
            if (Number.isFinite(suspension.maxForce)) {
                controller.setWheelMaxSuspensionForce(idx, suspension.maxForce);
            }
            if (Number.isFinite(tuning.frictionSlip)) {
                controller.setWheelFrictionSlip(idx, tuning.frictionSlip);
            }
            if (Number.isFinite(tuning.sideFrictionStiffness)) {
                controller.setWheelSideFrictionStiffness(idx, tuning.sideFrictionStiffness);
            }
        }

        entry.body = body;
        entry.controller = controller;
        entry.centerLocal = centerLocal;
        entry.wheelRadius = layout.wheelRadius;
        entry.wheelSpinAccum = entry.state.locomotion.wheelSpinAccum ?? 0;
        entry.wheelCenters = wheelCenters;
        entry.wheelConnections = wheelConnections;
        entry.wheelIndices = {
            front: frontIndices,
            rear: rearIndices,
            frontLeft: frontLeftIndices,
            frontRight: frontRightIndices,
            rearLeft: rearLeftIndices,
            rearRight: rearRightIndices,
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
        entry.maxSteerRad = degToRad(tuning.maxSteerDeg ?? entry.config.maxSteerDeg ?? DEFAULT_CONFIG.maxSteerDeg);
        entry.engineForce = tuning.engineForce ?? this.config.engineForce ?? DEFAULT_CONFIG.engineForce;
        entry.brakeForce = tuning.brakeForce ?? this.config.brakeForce ?? DEFAULT_CONFIG.brakeForce;
        entry.handbrakeForce = tuning.handbrakeForce ?? this.config.handbrakeForce ?? DEFAULT_CONFIG.handbrakeForce;
        entry.brakeBias = tuning.brakeBias ?? entry.brakeBias;
        entry.suspensionRestLength = restLength;
        entry.suspensionTravel = suspension.travel ?? entry.suspensionTravel;
        entry.bodyTiltScale = tuning.bodyTiltScale ?? entry.bodyTiltScale;
        entry.maxBodyAngle = degToRad(tuning.maxBodyAngleDeg ?? 8);
        entry.engineConfig = tuning.engine ?? null;
        entry.engine = entry.engineConfig ? createEngineState(entry.engineConfig) : null;
        if (entry.engine) {
            entry.state.drivetrain.rpm = entry.engine.rpm;
            const gear = entry.engine.gears[entry.engine.gearIndex];
            entry.state.drivetrain.gear = gear ? gearLabelToNumber(gear.label) : 1;
            entry.state.drivetrain.torque = entry.engine.torque;
        }

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
            tuning: null,
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
                    gear: 1,
                    torque: 0
                },
                collision: null,
                brake: null
            },
            body: null,
            controller: null,
            centerLocal: new THREE.Vector3(),
            chassisSize: null,
            wheelRadius: DEFAULT_CONFIG.wheelRadius,
            wheelSpinAccum: 0,
            wheelIndices: { front: [], rear: [], frontLeft: [], frontRight: [], rearLeft: [], rearRight: [], all: [] },
            wheelCenters: [],
            wheelConnections: [],
            frontTrack: 0,
            wheelbase: 0,
            maxSteerRad: degToRad(DEFAULT_CONFIG.maxSteerDeg),
            _steerAngleLeft: 0,
            _steerAngleRight: 0,
            engineForce: this.config.engineForce ?? DEFAULT_CONFIG.engineForce,
            brakeForce: this.config.brakeForce ?? DEFAULT_CONFIG.brakeForce,
            handbrakeForce: this.config.handbrakeForce ?? DEFAULT_CONFIG.handbrakeForce,
            brakeBias: DEFAULT_TUNING.brakeBias,
            suspensionRestLength: DEFAULT_TUNING.suspension.restLength,
            suspensionTravel: DEFAULT_TUNING.suspension.travel,
            bodyTiltScale: DEFAULT_TUNING.bodyTiltScale,
            maxBodyAngle: degToRad(DEFAULT_TUNING.maxBodyAngleDeg),
            engineConfig: null,
            engine: null,
            _driveForce: null,
            _brakeForce: null,
            _contactCount: 0,
            _contactFrames: 0,
            _spawnSettled: false,
            _spawnSnapped: false
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

        let driveDirty = false;
        let brakeDirty = false;
        if (typeof input.throttle === 'number') {
            entry.input.throttle = clamp(input.throttle, 0, 1);
            driveDirty = true;
        }
        if (typeof input.brake === 'number') {
            entry.input.brake = clamp(input.brake, 0, 1);
            brakeDirty = true;
        }
        if (typeof input.steering === 'number') {
            entry.input.steering = clamp(input.steering, -1, 1);
        }
        if (typeof input.handbrake === 'number') {
            entry.input.handbrake = clamp(input.handbrake, 0, 1);
            brakeDirty = true;
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

        if (driveDirty) entry._driveForce = null;
        if (brakeDirty) entry._brakeForce = null;
    }

    setGear(vehicleId, gear) {
        const entry = this._vehicles.get(vehicleId) ?? this._pendingVehicles.get(vehicleId);
        if (!entry?.engine) return;
        const gears = entry.engine.gears ?? [];
        let index = null;
        if (typeof gear === 'number' && Number.isFinite(gear)) {
            index = Math.round(gear);
        } else if (typeof gear === 'string') {
            const target = gear.toUpperCase();
            index = gears.findIndex((g) => String(g.label ?? '').toUpperCase() === target);
        }
        if (index == null || index < 0 || index >= gears.length) return;
        entry.engine.gearIndex = index;
        entry.engine.manual = true;
        const label = gears[index]?.label;
        entry.state.drivetrain.gear = gearLabelToNumber(label);
    }

    setAutoShift(vehicleId, enabled) {
        const entry = this._vehicles.get(vehicleId) ?? this._pendingVehicles.get(vehicleId);
        if (!entry?.engine) return;
        entry.engine.manual = !enabled;
    }

    getGearOptions(vehicleId) {
        const entry = this._vehicles.get(vehicleId) ?? this._pendingVehicles.get(vehicleId);
        const gears = entry?.engine?.gears ?? entry?.engineConfig?.gears ?? DEFAULT_ENGINE_GEARS;
        return gears.map((gear, index) => ({ index, label: gear.label }));
    }

    getGearIndex(vehicleId) {
        const entry = this._vehicles.get(vehicleId) ?? this._pendingVehicles.get(vehicleId);
        return entry?.engine?.gearIndex ?? null;
    }

    update(dt) {
        this.loop.update(dt);
    }

    getVehicleState(vehicleId) {
        const entry = this._vehicles.get(vehicleId);
        return entry ? entry.state : null;
    }

    getVehicleDebug(vehicleId) {
        const entry = this._vehicles.get(vehicleId) ?? this._pendingVehicles.get(vehicleId);
        if (!entry) return null;

        const controller = entry.controller ?? null;
        const indices = entry.wheelIndices?.all ?? [];
        const ordered = [];
        const seen = new Set();
        const orderLists = [
            entry.wheelIndices?.frontLeft ?? [],
            entry.wheelIndices?.frontRight ?? [],
            entry.wheelIndices?.rearLeft ?? [],
            entry.wheelIndices?.rearRight ?? []
        ];

        for (const list of orderLists) {
            for (const i of list) {
                if (!seen.has(i)) {
                    seen.add(i);
                    ordered.push(i);
                }
            }
        }

        for (const i of indices) {
            if (!seen.has(i)) {
                seen.add(i);
                ordered.push(i);
            }
        }

        const frontLeft = new Set(entry.wheelIndices?.frontLeft ?? []);
        const frontRight = new Set(entry.wheelIndices?.frontRight ?? []);
        const rearLeft = new Set(entry.wheelIndices?.rearLeft ?? []);
        const rearRight = new Set(entry.wheelIndices?.rearRight ?? []);

        const wheelCenters = entry.wheelCenters ?? [];
        const wheelConnections = entry.wheelConnections ?? [];

        const wheels = ordered.map((i) => {
            let label = `W${i}`;
            if (frontLeft.has(i)) label = 'FL';
            else if (frontRight.has(i)) label = 'FR';
            else if (rearLeft.has(i)) label = 'RL';
            else if (rearRight.has(i)) label = 'RR';

            return {
                index: i,
                label,
                center: wheelCenters[i] ?? null,
                connection: wheelConnections[i] ?? null,
                inContact: controller?.wheelIsInContact ? controller.wheelIsInContact(i) : null,
                steering: controller?.wheelSteering ? controller.wheelSteering(i) : null,
                suspensionLength: controller?.wheelSuspensionLength ? controller.wheelSuspensionLength(i) : null,
                suspensionForce: controller?.wheelSuspensionForce ? controller.wheelSuspensionForce(i) : null,
                forwardImpulse: controller?.wheelForwardImpulse ? controller.wheelForwardImpulse(i) : null,
                sideImpulse: controller?.wheelSideImpulse ? controller.wheelSideImpulse(i) : null,
                engineForce: controller?.wheelEngineForce ? controller.wheelEngineForce(i) : null,
                brakeForce: controller?.wheelBrake ? controller.wheelBrake(i) : null
            };
        });

        // Extended wheel labels for multi-axle vehicles (e.g., 6 wheels).
        // Computes axle groups by chassis-space connection Z, then assigns FL/FR/ML/MR/RL/RR when possible.
        const zTol = Math.max(0.25, Math.min(1.25, (entry.wheelRadius ?? DEFAULT_CONFIG.wheelRadius) * 1.5));
        const withConn = wheels.filter((w) => Number.isFinite(w.connection?.z) && Number.isFinite(w.connection?.x));
        if (withConn.length) {
            const sortedByZ = [...withConn].sort((a, b) => (b.connection.z - a.connection.z)); // front -> rear
            const groups = [];
            for (const w of sortedByZ) {
                const last = groups[groups.length - 1];
                if (!last || Math.abs(w.connection.z - last.z) > zTol) {
                    groups.push({ z: w.connection.z, wheels: [w] });
                } else {
                    last.wheels.push(w);
                    last.z = last.wheels.reduce((sum, it) => sum + it.connection.z, 0) / last.wheels.length;
                }
            }

            const axleCharForRank = (rank, count) => {
                if (count <= 1) return 'F';
                if (count === 2) return rank === 0 ? 'F' : 'R';
                if (count === 3) return rank === 0 ? 'F' : (rank === 1 ? 'M' : 'R');
                if (rank === 0) return 'F';
                if (rank === count - 1) return 'R';
                return 'A';
            };

            const counts = new Map();
            for (let g = 0; g < groups.length; g++) {
                const axleChar = axleCharForRank(g, groups.length);
                for (const w of groups[g].wheels) {
                    const sideChar = (w.connection.x ?? 0) < 0 ? 'L' : 'R';
                    const base = `${axleChar}${sideChar}`;
                    const n = (counts.get(base) ?? 0) + 1;
                    counts.set(base, n);
                    w.labelEx = n > 1 ? `${base}${n}` : base;
                }
            }
        }

        wheels.sort((a, b) => {
            const az = a.connection?.z ?? a.center?.z ?? 0;
            const bz = b.connection?.z ?? b.center?.z ?? 0;
            if (bz !== az) return bz - az; // front -> rear
            const ax = a.connection?.x ?? a.center?.x ?? 0;
            const bx = b.connection?.x ?? b.center?.x ?? 0;
            return ax - bx; // left -> right
        });

        const input = { ...entry.input };
        const driveForce = Number.isFinite(entry._driveForce)
            ? entry._driveForce
            : (input.throttle * (entry.engineForce ?? 0));
        const brakeForce = Number.isFinite(entry._brakeForce)
            ? entry._brakeForce
            : ((input.brake * (entry.brakeForce ?? 0)) + (input.handbrake * (entry.handbrakeForce ?? 0)));
        const engine = entry.engine;
        const gearIndex = engine?.gearIndex ?? null;
        const gearLabel = gearIndex != null ? (engine?.gears?.[gearIndex]?.label ?? null) : null;

        return {
            ready: !!controller,
            input,
            forces: { driveForce, brakeForce },
            locomotion: { ...entry.state.locomotion },
            suspension: { ...entry.state.suspension, restLength: entry.suspensionRestLength, travel: entry.suspensionTravel },
            drivetrain: {
                ...entry.state.drivetrain,
                gearIndex,
                gearLabel,
                gears: engine?.gears ? engine.gears.map((gear, index) => ({ index, label: gear.label, ratio: gear.ratio })) : null
            },
            wheels
        };
    }

    getVehicleConfig(vehicleId) {
        const entry = this._vehicles.get(vehicleId) ?? this._pendingVehicles.get(vehicleId);
        if (!entry) return null;

        const tuning = entry.tuning ?? null;
        const suspension = tuning?.suspension ?? {};
        const size = entry.chassisSize;
        const width = Number.isFinite(size?.x)
            ? size.x
            : (entry.config?.dimensions?.width ?? FALLBACK_DIMENSIONS.width);
        const height = Number.isFinite(size?.y)
            ? size.y
            : (entry.config?.dimensions?.height ?? FALLBACK_DIMENSIONS.height);
        const length = Number.isFinite(size?.z)
            ? size.z
            : (entry.config?.dimensions?.length ?? FALLBACK_DIMENSIONS.length);

        const invMass = entry.body?.invMass?.();
        const massKg = (Number.isFinite(invMass) && invMass > 0) ? (1 / invMass) : null;
        const additionalMassKg = Number.isFinite(tuning?.mass) ? tuning.mass : null;
        const inertia = computeBoxInertia(
            Number.isFinite(massKg) ? massKg : additionalMassKg,
            width,
            height,
            length
        );

        let com = { x: 0, y: 0, z: 0 };
        const comRaw = entry.body?.localCenterOfMass?.() ?? entry.body?.centerOfMass?.();
        if (comRaw && Number.isFinite(comRaw.x) && Number.isFinite(comRaw.y) && Number.isFinite(comRaw.z)) {
            com = { x: comRaw.x, y: comRaw.y, z: comRaw.z };
        }

        const wheelLayout = buildWheelLayoutSnapshot(entry);

        return {
            massKg,
            additionalMassKg,
            com,
            inertia,
            dimensions: { width, height, length },
            centerLocal: entry.centerLocal ? { x: entry.centerLocal.x, y: entry.centerLocal.y, z: entry.centerLocal.z } : null,
            halfExtents: { x: width * 0.5, y: height * 0.5, z: length * 0.5 },
            chassis: {
                linearDamping: Number.isFinite(tuning?.linearDamping) ? tuning.linearDamping : null,
                angularDamping: Number.isFinite(tuning?.angularDamping) ? tuning.angularDamping : null,
                friction: Number.isFinite(tuning?.chassisFriction) ? tuning.chassisFriction : null,
                bodyTiltScale: Number.isFinite(tuning?.bodyTiltScale) ? tuning.bodyTiltScale : null,
                maxBodyAngleRad: Number.isFinite(entry.maxBodyAngle) ? entry.maxBodyAngle : null
            },
            suspension: {
                restLength: entry.suspensionRestLength ?? suspension.restLength ?? null,
                travel: entry.suspensionTravel ?? suspension.travel ?? null,
                stiffness: Number.isFinite(suspension.stiffness) ? suspension.stiffness : null,
                compression: Number.isFinite(suspension.compression) ? suspension.compression : null,
                relaxation: Number.isFinite(suspension.relaxation) ? suspension.relaxation : null,
                maxForce: Number.isFinite(suspension.maxForce) ? suspension.maxForce : null
            },
            wheels: {
                radius: entry.wheelRadius ?? entry.config?.wheelRadius ?? DEFAULT_CONFIG.wheelRadius,
                wheelbase: entry.wheelbase ?? entry.config?.wheelbase ?? 0,
                frontTrack: entry.frontTrack ?? 0,
                frictionSlip: Number.isFinite(tuning?.frictionSlip) ? tuning.frictionSlip : null,
                sideFrictionStiffness: Number.isFinite(tuning?.sideFrictionStiffness) ? tuning.sideFrictionStiffness : null
            },
            wheelLayout,
            forces: {
                engineForce: Number.isFinite(entry.engineForce) ? entry.engineForce : null,
                brakeForce: Number.isFinite(entry.brakeForce) ? entry.brakeForce : null,
                handbrakeForce: Number.isFinite(entry.handbrakeForce) ? entry.handbrakeForce : null,
                brakeBias: Number.isFinite(entry.brakeBias) ? entry.brakeBias : null,
                maxSteerRad: Number.isFinite(entry.maxSteerRad) ? entry.maxSteerRad : null
            }
        };
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

        if (this._fatalTimer) {
            clearTimeout(this._fatalTimer);
            this._fatalTimer = null;
        }

        this._rapier = null;
        this._ready = false;
    }
}
