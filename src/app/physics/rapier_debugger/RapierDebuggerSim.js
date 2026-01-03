// src/app/physics/rapier_debugger/RapierDebuggerSim.js
import { loadRapier } from '../rapier/RapierLoader.js';
import { RAPIER_DEBUGGER_TUNING, RAPIER_DEBUGGER_VEHICLE_CONFIG, RAPIER_DEBUGGER_WORLD_CONFIG } from './RapierDebuggerConstants.js';

function yawFromQuat(q) {
    if (!q) return 0;
    const x = q.x ?? 0;
    const y = q.y ?? 0;
    const z = q.z ?? 0;
    const w = q.w ?? 1;

    const fwdX = 2 * (x * z + y * w);
    const fwdZ = 1 - 2 * (x * x + y * y);
    return Math.atan2(fwdX, fwdZ);
}

function rotateVecByQuat(v, q) {
    const x = v.x ?? 0;
    const y = v.y ?? 0;
    const z = v.z ?? 0;

    const qx = q.x ?? 0;
    const qy = q.y ?? 0;
    const qz = q.z ?? 0;
    const qw = q.w ?? 1;

    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;

    return {
        x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
        y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
        z: iz * qw + iw * -qz + ix * -qy - iy * -qx
    };
}

function rotateVecByQuatConjugate(v, q) {
    return rotateVecByQuat(v, { x: -(q.x ?? 0), y: -(q.y ?? 0), z: -(q.z ?? 0), w: q.w ?? 1 });
}

function safeGet(obj, prop) {
    try {
        return obj?.[prop];
    } catch {
        return undefined;
    }
}

function safeCall(obj, prop, ...args) {
    try {
        const fn = obj?.[prop];
        if (typeof fn !== 'function') return undefined;
        return fn.apply(obj, args);
    } catch {
        return undefined;
    }
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

export class RapierDebuggerSim {
    constructor({
        worldConfig = RAPIER_DEBUGGER_WORLD_CONFIG,
        vehicleConfig = RAPIER_DEBUGGER_VEHICLE_CONFIG
    } = {}) {
        this.worldConfig = { ...worldConfig };
        this.vehicleConfig = { ...vehicleConfig };
        this.tuning = JSON.parse(JSON.stringify(RAPIER_DEBUGGER_TUNING));

        this._rapier = null;
        this._world = null;
        this._controller = null;
        this._body = null;
        this._groundBody = null;
        this._groundCollider = null;
        this._chassisCollider = null;

        this._ready = false;
        this._initError = null;

        this._fixedDt = this.worldConfig.fixedDt ?? 1 / 60;
        this._accum = 0;

        this._inputs = {
            engineForce: 0,
            brakeForce: 0,
            handbrakeForce: 0,
            steerAngle: 0
        };

        this._wheelIndices = { front: [], rear: [], all: [] };
        this._wheelLabels = [];

        this._snapshot = null;
    }

    get ready() {
        return this._ready;
    }

    get initError() {
        return this._initError;
    }

    async init() {
        try {
            this._rapier = await loadRapier();
            this._world = new this._rapier.World(this.worldConfig.gravity);
            this._world.timestep = this._fixedDt;

            this._createGroundPhysics();
            this._createVehiclePhysics();

            this._ready = true;
            this._initError = null;
        } catch (err) {
            this._ready = false;
            this._initError = err;
            console.error('[RapierDebuggerSim] Failed to init Rapier:', err);
        }
    }

    dispose() {
        this._ready = false;
        this._snapshot = null;
        this._controller = null;
        this._body = null;
        this._groundBody = null;
        this._groundCollider = null;
        this._chassisCollider = null;
        this._world = null;
        this._rapier = null;
    }

    resetPose() {
        if (!this._ready || !this._body) return;
        const cfg = this.vehicleConfig;
        const spawnY = Number.isFinite(cfg.spawnHeight) ? cfg.spawnHeight : 3;
        this._body.setTranslation({ x: 0, y: spawnY, z: 0 }, true);
        this._body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        this._body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this._body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this._body.wakeUp();
    }

    setVehicleConfig(next) {
        if (!next) return;
        Object.assign(this.vehicleConfig, next);
        this._snapshot = null;
        this._body?.wakeUp?.();
    }

    setTuning(next) {
        if (!next) return;
        if (next.chassis) Object.assign(this.tuning.chassis, next.chassis);
        if (next.suspension) Object.assign(this.tuning.suspension, next.suspension);
        if (next.tires) Object.assign(this.tuning.tires, next.tires);
        this._snapshot = null;
        this._body?.wakeUp?.();
    }

    setInputs(next) {
        if (!next) return;
        if (Number.isFinite(next.engineForce)) this._inputs.engineForce = next.engineForce;
        if (Number.isFinite(next.brakeForce)) this._inputs.brakeForce = next.brakeForce;
        if (Number.isFinite(next.handbrakeForce)) this._inputs.handbrakeForce = next.handbrakeForce;
        if (Number.isFinite(next.steerAngle)) this._inputs.steerAngle = next.steerAngle;
    }

    getInputs() {
        return { ...this._inputs };
    }

    step(dt) {
        if (!this._ready || !this._world || !this._controller || !this._body) return this.getSnapshot();

        const clampedDt = Math.min(Math.max(dt ?? 0, 0), 0.05);
        this._accum += clampedDt;

        while (this._accum >= this._fixedDt) {
            this._applyTuning();
            this._applyInputs();
            this._controller.updateVehicle(this._fixedDt);
            this._world.step();
            this._accum -= this._fixedDt;
        }

        this._snapshot = this._buildSnapshot();
        return this._snapshot;
    }

    getSnapshot() {
        if (this._snapshot) return this._snapshot;
        if (!this._ready || !this._world || !this._controller || !this._body) {
            return {
                status: this._initError ? 'Init failed' : 'Loading',
                initError: this._initError ? String(this._initError?.message ?? this._initError) : null,
                inputs: this.getInputs(),
                body: null,
                speedMps: 0,
                speedProjMps: 0,
                yawRad: 0,
                controllerAxes: { up: null, forward: null },
                massKg: null,
                contacts: { count: 0, total: 0 },
                wheelStates: [],
                world: { bodies: 0, colliders: 0 },
                rayDown: { hit: false, toi: null }
            };
        }
        this._snapshot = this._buildSnapshot();
        return this._snapshot;
    }

    getDebugRenderBuffers() {
        if (!this._world?.debugRender) return null;
        return this._world.debugRender();
    }

    _createGroundPhysics() {
        if (!this._world || !this._rapier) return;

        const halfSize = (this.worldConfig.groundSize ?? RAPIER_DEBUGGER_WORLD_CONFIG.groundSize) * 0.5;
        const thickness = this.worldConfig.groundThickness ?? RAPIER_DEBUGGER_WORLD_CONFIG.groundThickness;
        const halfThickness = thickness * 0.5;

        if (this._groundBody) {
            this._world.removeRigidBody(this._groundBody);
            this._groundBody = null;
            this._groundCollider = null;
        } else if (this._groundCollider) {
            this._world.removeCollider(this._groundCollider, true);
            this._groundCollider = null;
        }

        const bodyDesc = this._rapier.RigidBodyDesc.fixed().setTranslation(0, -halfThickness, 0);
        const body = this._world.createRigidBody(bodyDesc);

        const colliderDesc = this._rapier.ColliderDesc.cuboid(halfSize, halfThickness, halfSize);
        colliderDesc.setFriction(1.0);
        colliderDesc.setRestitution(0.0);
        const collider = this._world.createCollider(colliderDesc, body);

        this._groundBody = body;
        this._groundCollider = collider;
    }

    _createVehiclePhysics() {
        const cfg = this.vehicleConfig;
        const halfW = cfg.width * 0.5;
        const halfH = cfg.height * 0.5;
        const halfL = cfg.length * 0.5;

        const wheelY = -halfH - (cfg.groundClearance ?? 0) + cfg.wheelRadius;
        const wheelX = halfW - (cfg.wheelWidth * 0.5) - (cfg.wheelSideInset ?? 0);
        const wheelZ = halfL * cfg.wheelbaseRatio;

        const startY = Number.isFinite(cfg.spawnHeight) ? cfg.spawnHeight : (halfH + cfg.restLength);

        const chassisCfg = this.tuning.chassis ?? {};
        const bodyDesc = this._rapier.RigidBodyDesc.dynamic()
            .setTranslation(0, startY, 0)
            .setLinearDamping(chassisCfg.linearDamping ?? 0.3)
            .setAngularDamping(chassisCfg.angularDamping ?? 0.8)
            .setCcdEnabled(!!(chassisCfg.ccdEnabled ?? true));
        const body = this._world.createRigidBody(bodyDesc);
        if (Number.isFinite(chassisCfg.gravityScale)) {
            body.setGravityScale(chassisCfg.gravityScale, true);
        }
        if (Number.isFinite(chassisCfg.additionalMass)) {
            body.setAdditionalMass(chassisCfg.additionalMass, true);
        }

        const colliderDesc = this._rapier.ColliderDesc.cuboid(halfW, halfH, halfL);
        colliderDesc.setFriction(0.9);
        colliderDesc.setRestitution(0.0);
        this._chassisCollider = this._world.createCollider(colliderDesc, body);

        const controller = this._world.createVehicleController(body);
        setControllerAxis(controller, 'indexUpAxis', 'setIndexUpAxis', 1);
        setControllerAxis(controller, 'indexForwardAxis', 'setIndexForwardAxis', 2);

        const direction = { x: 0, y: -1, z: 0 };
        const axle = { x: -1, y: 0, z: 0 };

        const wheels = [
            { key: 'FL', pos: { x: -wheelX, y: wheelY, z: wheelZ }, isFront: true },
            { key: 'FR', pos: { x: wheelX, y: wheelY, z: wheelZ }, isFront: true },
            { key: 'RL', pos: { x: -wheelX, y: wheelY, z: -wheelZ }, isFront: false },
            { key: 'RR', pos: { x: wheelX, y: wheelY, z: -wheelZ }, isFront: false }
        ];

        const front = [];
        const rear = [];
        const all = [];
        const labels = [];

        for (const wheel of wheels) {
            const connection = {
                x: wheel.pos.x,
                y: wheel.pos.y + cfg.restLength,
                z: wheel.pos.z
            };
            controller.addWheel(connection, direction, axle, cfg.restLength, cfg.wheelRadius);
            const idx = controller.numWheels() - 1;

            controller.setWheelSuspensionRestLength(idx, cfg.restLength);
            controller.setWheelRadius(idx, cfg.wheelRadius);
            controller.setWheelChassisConnectionPointCs?.(idx, connection);

            if (wheel.isFront) front.push(idx);
            else rear.push(idx);
            all.push(idx);
            labels[idx] = wheel.key;
        }

        this._controller = controller;
        this._body = body;
        this._wheelIndices = { front, rear, all };
        this._wheelLabels = labels;
    }

    _applyTuning() {
        if (!this._body || !this._controller) return;

        const chassisCfg = this.tuning.chassis ?? {};
        if (Number.isFinite(chassisCfg.linearDamping)) this._body.setLinearDamping(chassisCfg.linearDamping);
        if (Number.isFinite(chassisCfg.angularDamping)) this._body.setAngularDamping(chassisCfg.angularDamping);
        if (Number.isFinite(chassisCfg.gravityScale)) this._body.setGravityScale(chassisCfg.gravityScale, false);
        if (Number.isFinite(chassisCfg.additionalMass)) this._body.setAdditionalMass(chassisCfg.additionalMass, false);
        if (typeof chassisCfg.ccdEnabled === 'boolean') this._body.enableCcd(chassisCfg.ccdEnabled);

        const cfg = this.vehicleConfig;
        const halfW = cfg.width * 0.5;
        const halfH = cfg.height * 0.5;
        const halfL = cfg.length * 0.5;
        const wheelY = -halfH - (cfg.groundClearance ?? 0) + cfg.wheelRadius;
        const wheelX = halfW - (cfg.wheelWidth * 0.5) - (cfg.wheelSideInset ?? 0);
        const wheelZ = halfL * cfg.wheelbaseRatio;

        const hardpoints = [
            { x: -wheelX, y: wheelY + cfg.restLength, z: wheelZ },
            { x: wheelX, y: wheelY + cfg.restLength, z: wheelZ },
            { x: -wheelX, y: wheelY + cfg.restLength, z: -wheelZ },
            { x: wheelX, y: wheelY + cfg.restLength, z: -wheelZ }
        ];

        const susp = this.tuning.suspension ?? {};
        const tires = this.tuning.tires ?? {};

        for (let i = 0; i < this._wheelIndices.all.length; i++) {
            const idx = this._wheelIndices.all[i];
            const hp = hardpoints[i];
            if (hp) this._controller.setWheelChassisConnectionPointCs?.(idx, hp);

            if (Number.isFinite(cfg.restLength)) this._controller.setWheelSuspensionRestLength(idx, cfg.restLength);
            if (Number.isFinite(cfg.wheelRadius)) this._controller.setWheelRadius(idx, cfg.wheelRadius);

            if (Number.isFinite(susp.maxTravel)) this._controller.setWheelMaxSuspensionTravel(idx, susp.maxTravel);
            if (Number.isFinite(susp.stiffness)) this._controller.setWheelSuspensionStiffness(idx, susp.stiffness);
            if (Number.isFinite(susp.compression)) this._controller.setWheelSuspensionCompression(idx, susp.compression);
            if (Number.isFinite(susp.relaxation)) this._controller.setWheelSuspensionRelaxation(idx, susp.relaxation);
            if (Number.isFinite(susp.maxForce)) this._controller.setWheelMaxSuspensionForce(idx, susp.maxForce);

            if (Number.isFinite(tires.frictionSlip)) this._controller.setWheelFrictionSlip(idx, tires.frictionSlip);
            if (Number.isFinite(tires.sideFrictionStiffness)) this._controller.setWheelSideFrictionStiffness(idx, tires.sideFrictionStiffness);
        }
    }

    _applyInputs() {
        if (!this._controller) return;

        const engineForce = this._inputs.engineForce ?? 0;
        const brakeForce = this._inputs.brakeForce ?? 0;
        const handbrakeForce = this._inputs.handbrakeForce ?? 0;
        const steerAngle = this._inputs.steerAngle ?? 0;

        const all = this._wheelIndices.all;
        for (const i of all) {
            this._controller.setWheelEngineForce(i, 0);
            this._controller.setWheelBrake(i, 0);
            this._controller.setWheelSteering(i, 0);
        }

        for (const i of this._wheelIndices.front) {
            this._controller.setWheelSteering(i, steerAngle);
        }

        for (const i of this._wheelIndices.rear) {
            this._controller.setWheelEngineForce(i, engineForce);
        }

        for (const i of all) {
            this._controller.setWheelBrake(i, brakeForce);
        }

        if (handbrakeForce > 0) {
            for (const i of this._wheelIndices.rear) {
                this._controller.setWheelBrake(i, brakeForce + handbrakeForce);
            }
        }

        if (this._body && (Math.abs(engineForce) > 0.01 || brakeForce > 0.01 || handbrakeForce > 0.01 || Math.abs(steerAngle) > 1e-4)) {
            this._body.wakeUp();
        }
    }

    _buildSnapshot() {
        const pos = this._body.translation();
        const rot = this._body.rotation();
        const linvel = this._body.linvel();
        const angvel = this._body.angvel();
        const speed = this._controller.currentVehicleSpeed ? this._controller.currentVehicleSpeed() : 0;
        const yaw = yawFromQuat(rot);

        const upAxis = safeGet(this._controller, 'indexUpAxis');
        const forwardAxis = safeGet(this._controller, 'indexForwardAxis');
        const forwardIndex = Number.isFinite(forwardAxis) ? forwardAxis : 2;
        const localForward = forwardIndex === 0
            ? { x: 1, y: 0, z: 0 }
            : forwardIndex === 1
                ? { x: 0, y: 1, z: 0 }
                : { x: 0, y: 0, z: 1 };
        const worldForward = rotateVecByQuat(localForward, rot);
        const speedProj = (linvel.x * worldForward.x) + (linvel.y * worldForward.y) + (linvel.z * worldForward.z);

        const invMass = safeCall(this._body, 'invMass') ?? safeGet(this._body, 'invMass');
        const massKg = (Number.isFinite(invMass) && invMass > 0) ? (1 / invMass) : null;

        let contactCount = 0;
        for (const i of this._wheelIndices.all) {
            if (this._controller.wheelIsInContact?.(i)) contactCount += 1;
        }

        const wheelStates = [];
        const cfg = this.vehicleConfig;
        const halfW = cfg.width * 0.5;
        const halfH = cfg.height * 0.5;
        const halfL = cfg.length * 0.5;
        const wheelY = -halfH - (cfg.groundClearance ?? 0) + cfg.wheelRadius;
        const wheelX = halfW - (cfg.wheelWidth * 0.5) - (cfg.wheelSideInset ?? 0);
        const wheelZ = halfL * cfg.wheelbaseRatio;
        const expectedCenters = [
            { x: -wheelX, y: wheelY, z: wheelZ },
            { x: wheelX, y: wheelY, z: wheelZ },
            { x: -wheelX, y: wheelY, z: -wheelZ },
            { x: wheelX, y: wheelY, z: -wheelZ }
        ];
        const maxTravel = this.tuning?.suspension?.maxTravel ?? 0;
        const minSuspLen = Math.max(0, (cfg.restLength ?? 0) - maxTravel);
        const maxSuspLen = (cfg.restLength ?? 0) + maxTravel;

        for (let i = 0; i < this._wheelIndices.all.length; i++) {
            const idx = this._wheelIndices.all[i];
            const label = this._wheelLabels[idx] ?? `W${idx}`;
            const inContact = !!this._controller.wheelIsInContact?.(idx);
            const suspLenRaw = this._controller.wheelSuspensionLength?.(idx);
            const suspLen = Number.isFinite(suspLenRaw) ? Math.max(minSuspLen, Math.min(maxSuspLen, suspLenRaw)) : suspLenRaw;
            const hardPoint = this._controller.wheelHardPoint?.(idx) ?? null;
            const connectionPointLocal = this._controller.wheelChassisConnectionPointCs?.(idx) ?? null;
            const dirLocal = this._controller.wheelDirectionCs?.(idx) ?? { x: 0, y: -1, z: 0 };
            const contactPoint = this._controller.wheelContactPoint?.(idx) ?? null;
            const contactNormal = this._controller.wheelContactNormal?.(idx) ?? null;

            const dirWorld = rotateVecByQuat(dirLocal, rot);
            let centerWorld = null;
            if (inContact && contactPoint && contactNormal) {
                centerWorld = {
                    x: contactPoint.x + contactNormal.x * cfg.wheelRadius,
                    y: contactPoint.y + contactNormal.y * cfg.wheelRadius,
                    z: contactPoint.z + contactNormal.z * cfg.wheelRadius
                };
            } else if (hardPoint && Number.isFinite(suspLen)) {
                centerWorld = {
                    x: hardPoint.x + dirWorld.x * suspLen,
                    y: hardPoint.y + dirWorld.y * suspLen,
                    z: hardPoint.z + dirWorld.z * suspLen
                };
            } else if (hardPoint) {
                centerWorld = { x: hardPoint.x, y: hardPoint.y, z: hardPoint.z };
            }

            let centerLocal = null;
            let centerDeltaLocal = null;
            const expectedLocal = expectedCenters[i] ?? null;
            const expectedConnectionLocal = expectedLocal
                ? { x: expectedLocal.x, y: expectedLocal.y + (cfg.restLength ?? 0), z: expectedLocal.z }
                : null;
            let connectionDeltaLocal = null;
            if (centerWorld) {
                const deltaWorld = { x: centerWorld.x - pos.x, y: centerWorld.y - pos.y, z: centerWorld.z - pos.z };
                centerLocal = rotateVecByQuatConjugate(deltaWorld, rot);
            }
            if (centerLocal && expectedLocal) {
                centerDeltaLocal = {
                    x: centerLocal.x - expectedLocal.x,
                    y: centerLocal.y - expectedLocal.y,
                    z: centerLocal.z - expectedLocal.z
                };
            }
            if (connectionPointLocal && expectedConnectionLocal) {
                connectionDeltaLocal = {
                    x: connectionPointLocal.x - expectedConnectionLocal.x,
                    y: connectionPointLocal.y - expectedConnectionLocal.y,
                    z: connectionPointLocal.z - expectedConnectionLocal.z
                };
            }

            wheelStates.push({
                index: idx,
                label,
                inContact,
                expectedLocal,
                expectedConnectionLocal,
                connectionPointLocal,
                connectionDeltaLocal,
                centerWorld,
                centerLocal,
                centerDeltaLocal,
                hardPoint,
                suspensionLength: suspLen,
                suspensionForce: this._controller.wheelSuspensionForce?.(idx),
                forwardImpulse: this._controller.wheelForwardImpulse?.(idx),
                sideImpulse: this._controller.wheelSideImpulse?.(idx),
                steering: this._controller.wheelSteering?.(idx),
                rotation: this._controller.wheelRotation?.(idx),
                directionCs: dirLocal,
                contactPoint,
                contactNormal
            });
        }

        const bodies = this._world.bodies?.len?.() ?? 0;
        const colliders = this._world.colliders?.len?.() ?? 0;

        let rayHit = null;
        try {
            const rayOrigin = { x: pos.x, y: pos.y + 5, z: pos.z };
            const rayDir = { x: 0, y: -1, z: 0 };
            const ray = new this._rapier.Ray(rayOrigin, rayDir);
            const hit = this._world.castRay(ray, 50, true);
            if (hit) {
                const toi = typeof hit.toi === 'function' ? hit.toi() : hit.toi;
                rayHit = { hit: true, toi };
            } else {
                rayHit = { hit: false, toi: null };
            }
        } catch {
            rayHit = { hit: false, toi: null };
        }

        const safeSpeed = Number.isFinite(speed) ? speed : 0;
        const safeSpeedProj = Number.isFinite(speedProj) ? speedProj : 0;
        const safeYaw = Number.isFinite(yaw) ? yaw : 0;

        return {
            status: this._initError ? 'Init failed' : 'Ready',
            initError: this._initError ? String(this._initError?.message ?? this._initError) : null,
            inputs: this.getInputs(),
            body: {
                position: { x: pos.x, y: pos.y, z: pos.z },
                rotation: { x: rot.x, y: rot.y, z: rot.z, w: rot.w },
                linvel: { x: linvel.x, y: linvel.y, z: linvel.z },
                angvel: { x: angvel.x, y: angvel.y, z: angvel.z }
            },
            speedMps: safeSpeed,
            speedProjMps: safeSpeedProj,
            yawRad: safeYaw,
            controllerAxes: {
                up: Number.isFinite(upAxis) ? upAxis : null,
                forward: Number.isFinite(forwardAxis) ? forwardAxis : null
            },
            massKg,
            contacts: { count: contactCount, total: this._wheelIndices.all.length },
            wheelStates,
            world: { bodies, colliders },
            rayDown: rayHit
        };
    }
}
