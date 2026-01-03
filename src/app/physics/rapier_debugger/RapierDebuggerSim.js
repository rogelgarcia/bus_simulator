// src/app/physics/rapier_debugger/RapierDebuggerSim.js
import { loadRapier } from '../rapier/RapierLoader.js';
import { RAPIER_DEBUGGER_TUNING, RAPIER_DEBUGGER_VEHICLE_CONFIG, RAPIER_DEBUGGER_WORLD_CONFIG } from './RapierDebuggerConstants.js';

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

function axisFromIndex(index) {
    if (index === 0) return { x: 1, y: 0, z: 0 };
    if (index === 1) return { x: 0, y: 1, z: 0 };
    return { x: 0, y: 0, z: 1 };
}

function dotVec3(a, b) {
    return (a?.x ?? 0) * (b?.x ?? 0) + (a?.y ?? 0) * (b?.y ?? 0) + (a?.z ?? 0) * (b?.z ?? 0);
}

function crossVec3(a, b) {
    return {
        x: (a?.y ?? 0) * (b?.z ?? 0) - (a?.z ?? 0) * (b?.y ?? 0),
        y: (a?.z ?? 0) * (b?.x ?? 0) - (a?.x ?? 0) * (b?.z ?? 0),
        z: (a?.x ?? 0) * (b?.y ?? 0) - (a?.y ?? 0) * (b?.x ?? 0)
    };
}

function normalizeVec3(v) {
    if (!v) return { x: 0, y: 0, z: 0 };
    const len = Math.hypot(v.x ?? 0, v.y ?? 0, v.z ?? 0);
    if (!Number.isFinite(len) || len < 1e-8) return { x: 0, y: 0, z: 0 };
    return { x: (v.x ?? 0) / len, y: (v.y ?? 0) / len, z: (v.z ?? 0) / len };
}

function labelFromLocal(point, forward, right, fallback) {
    if (!point || !forward || !right) return fallback;
    const f = dotVec3(point, forward);
    const r = dotVec3(point, right);
    if (!Number.isFinite(f) || !Number.isFinite(r)) return fallback;
    const front = f >= 0 ? 'F' : 'R';
    const side = r >= 0 ? 'R' : 'L';
    return `${front}${side}`;
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

function numChanged(prev, next, eps = 1e-6) {
    if (!Number.isFinite(next)) return false;
    if (!Number.isFinite(prev)) return true;
    return Math.abs(prev - next) > eps;
}

function boolChanged(prev, next) {
    if (typeof next !== 'boolean') return false;
    return prev !== next;
}

function updateVec3(target, next, eps = 1e-6) {
    if (!next) return false;
    if (!target) return false;
    let changed = false;
    if (Number.isFinite(next.x) && numChanged(target.x, next.x, eps)) {
        target.x = next.x;
        changed = true;
    }
    if (Number.isFinite(next.y) && numChanged(target.y, next.y, eps)) {
        target.y = next.y;
        changed = true;
    }
    if (Number.isFinite(next.z) && numChanged(target.z, next.z, eps)) {
        target.z = next.z;
        changed = true;
    }
    return changed;
}

function updateQuat(target, next, eps = 1e-6) {
    if (!next) return false;
    if (!target) return false;
    let changed = false;
    if (Number.isFinite(next.w) && numChanged(target.w, next.w, eps)) {
        target.w = next.w;
        changed = true;
    }
    if (Number.isFinite(next.x) && numChanged(target.x, next.x, eps)) {
        target.x = next.x;
        changed = true;
    }
    if (Number.isFinite(next.y) && numChanged(target.y, next.y, eps)) {
        target.y = next.y;
        changed = true;
    }
    if (Number.isFinite(next.z) && numChanged(target.z, next.z, eps)) {
        target.z = next.z;
        changed = true;
    }
    return changed;
}

function updateBoolVec3(target, next) {
    if (!next) return false;
    if (!target) return false;
    let changed = false;
    if (typeof next.x === 'boolean' && boolChanged(target.x, next.x)) {
        target.x = next.x;
        changed = true;
    }
    if (typeof next.y === 'boolean' && boolChanged(target.y, next.y)) {
        target.y = next.y;
        changed = true;
    }
    if (typeof next.z === 'boolean' && boolChanged(target.z, next.z)) {
        target.z = next.z;
        changed = true;
    }
    return changed;
}

function resolveBodyTypeEnum(rapier, type) {
    const types = rapier?.RigidBodyType;
    if (!types) return null;
    if (type === 'fixed') return types.Fixed;
    if (type === 'kinematicPositionBased') return types.KinematicPositionBased;
    if (type === 'kinematicVelocityBased') return types.KinematicVelocityBased;
    return types.Dynamic;
}

function makeBodyDesc(rapier, type) {
    if (!rapier?.RigidBodyDesc) return null;
    if (type === 'fixed') return rapier.RigidBodyDesc.fixed();
    if (type === 'kinematicPositionBased') return rapier.RigidBodyDesc.kinematicPositionBased();
    if (type === 'kinematicVelocityBased') return rapier.RigidBodyDesc.kinematicVelocityBased();
    return rapier.RigidBodyDesc.dynamic();
}

function vec3Finite(v) {
    return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function readVec3(v) {
    if (!v) return null;
    const x = typeof v.x === 'function' ? v.x() : v.x;
    const y = typeof v.y === 'function' ? v.y() : v.y;
    const z = typeof v.z === 'function' ? v.z() : v.z;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x, y, z };
}

function resolveMassProps(props) {
    if (!props) return null;
    const com = props.com ?? {};
    const inertia = props.inertia ?? {};
    const frame = props.inertiaFrame ?? {};
    if (!Number.isFinite(props.mass)) return null;
    if (!Number.isFinite(com.x) || !Number.isFinite(com.y) || !Number.isFinite(com.z)) return null;
    if (!Number.isFinite(inertia.x) || !Number.isFinite(inertia.y) || !Number.isFinite(inertia.z)) return null;
    if (!Number.isFinite(frame.w) || !Number.isFinite(frame.x) || !Number.isFinite(frame.y) || !Number.isFinite(frame.z)) return null;
    return {
        mass: props.mass,
        com: { x: com.x, y: com.y, z: com.z },
        inertia: { x: inertia.x, y: inertia.y, z: inertia.z },
        frame: { w: frame.w, x: frame.x, y: frame.y, z: frame.z }
    };
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

        if (this.tuning?.chassis?.translation && Number.isFinite(this.vehicleConfig.spawnHeight)) {
            this.tuning.chassis.translation.y = this.vehicleConfig.spawnHeight;
        }

        this._wheelIndices = { front: [], rear: [], all: [] };
        this._wheelLabels = [];

        this._snapshot = null;

        this._dirty = {
            chassis: true,
            pose: false,
            bodyType: false,
            wheels: true,
            suspension: true,
            tires: true
        };
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
        this.resetForces();
        this.resetTorques();
        const cfg = this.vehicleConfig;
        const chassisCfg = this.tuning?.chassis ?? {};
        const translation = chassisCfg.translation ?? {};
        const rotation = chassisCfg.rotation ?? {};
        const linvel = chassisCfg.linvel ?? {};
        const angvel = chassisCfg.angvel ?? {};
        const spawnY = Number.isFinite(translation.y)
            ? translation.y
            : (Number.isFinite(cfg.spawnHeight) ? cfg.spawnHeight : 3);
        const spawnX = Number.isFinite(translation.x) ? translation.x : 0;
        const spawnZ = Number.isFinite(translation.z) ? translation.z : 0;
        this._body.setTranslation({ x: spawnX, y: spawnY, z: spawnZ }, true);
        this._body.setRotation({
            x: Number.isFinite(rotation.x) ? rotation.x : 0,
            y: Number.isFinite(rotation.y) ? rotation.y : 0,
            z: Number.isFinite(rotation.z) ? rotation.z : 0,
            w: Number.isFinite(rotation.w) ? rotation.w : 1
        }, true);
        this._body.setLinvel({
            x: Number.isFinite(linvel.x) ? linvel.x : 0,
            y: Number.isFinite(linvel.y) ? linvel.y : 0,
            z: Number.isFinite(linvel.z) ? linvel.z : 0
        }, true);
        this._body.setAngvel({
            x: Number.isFinite(angvel.x) ? angvel.x : 0,
            y: Number.isFinite(angvel.y) ? angvel.y : 0,
            z: Number.isFinite(angvel.z) ? angvel.z : 0
        }, true);
        this._body.wakeUp();
    }

    setVehicleConfig(next) {
        if (!next) return;
        let changed = false;
        let wheelLayoutChanged = false;
        let spawnHeightChanged = false;

        for (const [key, value] of Object.entries(next)) {
            if (!Object.prototype.hasOwnProperty.call(this.vehicleConfig, key)) {
                this.vehicleConfig[key] = value;
                changed = true;
                if (key !== 'spawnHeight') wheelLayoutChanged = true;
                continue;
            }

            const prev = this.vehicleConfig[key];
            if (typeof value === 'number' && numChanged(prev, value)) {
                this.vehicleConfig[key] = value;
                changed = true;
                if (key !== 'spawnHeight') wheelLayoutChanged = true;
                else spawnHeightChanged = true;
                continue;
            }
            if (typeof value === 'boolean' && boolChanged(prev, value)) {
                this.vehicleConfig[key] = value;
                changed = true;
                wheelLayoutChanged = true;
            }
        }

        if (!changed) return;

        if (wheelLayoutChanged) {
            this._dirty.wheels = true;
        }
        if (spawnHeightChanged && this.tuning?.chassis?.translation) {
            this.tuning.chassis.translation.y = this.vehicleConfig.spawnHeight;
            this._dirty.pose = true;
        }
        this._snapshot = null;
        this._body?.wakeUp?.();
    }

    setTuning(next) {
        if (!next) return;
        let changed = false;

        if (next.chassis) {
            const chassis = this.tuning.chassis ?? (this.tuning.chassis = {});
            if (typeof next.chassis.bodyType === 'string' && next.chassis.bodyType !== chassis.bodyType) {
                chassis.bodyType = next.chassis.bodyType;
                this._dirty.bodyType = true;
                changed = true;
            }

            const translation = chassis.translation ?? (chassis.translation = { x: 0, y: 0, z: 0 });
            if (updateVec3(translation, next.chassis.translation)) {
                this._dirty.pose = true;
                changed = true;
            }

            const rotation = chassis.rotation ?? (chassis.rotation = { x: 0, y: 0, z: 0, w: 1 });
            if (updateQuat(rotation, next.chassis.rotation)) {
                this._dirty.pose = true;
                changed = true;
            }

            const linvel = chassis.linvel ?? (chassis.linvel = { x: 0, y: 0, z: 0 });
            if (updateVec3(linvel, next.chassis.linvel)) {
                this._dirty.pose = true;
                changed = true;
            }

            const angvel = chassis.angvel ?? (chassis.angvel = { x: 0, y: 0, z: 0 });
            if (updateVec3(angvel, next.chassis.angvel)) {
                this._dirty.pose = true;
                changed = true;
            }

            const enabledRotations = chassis.enabledRotations ?? (chassis.enabledRotations = { x: true, y: true, z: true });
            if (updateBoolVec3(enabledRotations, next.chassis.enabledRotations)) {
                this._dirty.chassis = true;
                changed = true;
            }

            for (const [key, value] of Object.entries(next.chassis)) {
                if (key === 'additionalMassProperties') continue;
                const prev = this.tuning.chassis[key];
                if (typeof value === 'number' && numChanged(prev, value)) {
                    this.tuning.chassis[key] = value;
                    this._dirty.chassis = true;
                    changed = true;
                    continue;
                }
                if (typeof value === 'boolean' && boolChanged(prev, value)) {
                    this.tuning.chassis[key] = value;
                    this._dirty.chassis = true;
                    changed = true;
                }
            }

            if (next.chassis.additionalMassProperties) {
                const props = next.chassis.additionalMassProperties;
                const target = this.tuning.chassis.additionalMassProperties ?? {
                    mass: NaN,
                    com: { x: 0, y: 0, z: 0 },
                    inertia: { x: 0, y: 0, z: 0 },
                    inertiaFrame: { w: 1, x: 0, y: 0, z: 0 }
                };
                const targetCom = target.com ?? (target.com = { x: 0, y: 0, z: 0 });
                const targetInertia = target.inertia ?? (target.inertia = { x: 0, y: 0, z: 0 });
                const targetFrame = target.inertiaFrame ?? (target.inertiaFrame = { w: 1, x: 0, y: 0, z: 0 });
                let propsChanged = false;

                if (Number.isFinite(props.mass) && numChanged(target.mass, props.mass)) {
                    target.mass = props.mass;
                    propsChanged = true;
                }

                if (props.com) {
                    if (Number.isFinite(props.com.x) && numChanged(targetCom.x, props.com.x)) {
                        targetCom.x = props.com.x;
                        propsChanged = true;
                    }
                    if (Number.isFinite(props.com.y) && numChanged(targetCom.y, props.com.y)) {
                        targetCom.y = props.com.y;
                        propsChanged = true;
                    }
                    if (Number.isFinite(props.com.z) && numChanged(targetCom.z, props.com.z)) {
                        targetCom.z = props.com.z;
                        propsChanged = true;
                    }
                }

                if (props.inertia) {
                    if (Number.isFinite(props.inertia.x) && numChanged(targetInertia.x, props.inertia.x)) {
                        targetInertia.x = props.inertia.x;
                        propsChanged = true;
                    }
                    if (Number.isFinite(props.inertia.y) && numChanged(targetInertia.y, props.inertia.y)) {
                        targetInertia.y = props.inertia.y;
                        propsChanged = true;
                    }
                    if (Number.isFinite(props.inertia.z) && numChanged(targetInertia.z, props.inertia.z)) {
                        targetInertia.z = props.inertia.z;
                        propsChanged = true;
                    }
                }

                if (props.inertiaFrame) {
                    if (Number.isFinite(props.inertiaFrame.w) && numChanged(targetFrame.w, props.inertiaFrame.w)) {
                        targetFrame.w = props.inertiaFrame.w;
                        propsChanged = true;
                    }
                    if (Number.isFinite(props.inertiaFrame.x) && numChanged(targetFrame.x, props.inertiaFrame.x)) {
                        targetFrame.x = props.inertiaFrame.x;
                        propsChanged = true;
                    }
                    if (Number.isFinite(props.inertiaFrame.y) && numChanged(targetFrame.y, props.inertiaFrame.y)) {
                        targetFrame.y = props.inertiaFrame.y;
                        propsChanged = true;
                    }
                    if (Number.isFinite(props.inertiaFrame.z) && numChanged(targetFrame.z, props.inertiaFrame.z)) {
                        targetFrame.z = props.inertiaFrame.z;
                        propsChanged = true;
                    }
                }

                this.tuning.chassis.additionalMassProperties = target;
                if (propsChanged) {
                    this._dirty.chassis = true;
                    changed = true;
                }
            }
        }

        if (next.suspension) {
            for (const [key, value] of Object.entries(next.suspension)) {
                const prev = this.tuning.suspension[key];
                if (typeof value === 'number' && numChanged(prev, value)) {
                    this.tuning.suspension[key] = value;
                    this._dirty.suspension = true;
                    changed = true;
                }
            }
        }

        if (next.tires) {
            for (const [key, value] of Object.entries(next.tires)) {
                const prev = this.tuning.tires[key];
                if (typeof value === 'number' && numChanged(prev, value)) {
                    this.tuning.tires[key] = value;
                    this._dirty.tires = true;
                    changed = true;
                }
            }
        }

        if (!changed) return;
        this._snapshot = null;
        this._body?.wakeUp?.();
    }

    setWorldConfig(next) {
        if (!next) return;
        let gravityChanged = false;
        if (next.gravity) {
            const gravity = this.worldConfig.gravity ?? (this.worldConfig.gravity = { x: 0, y: -9.81, z: 0 });
            if (Number.isFinite(next.gravity.x) && numChanged(gravity.x, next.gravity.x)) {
                gravity.x = next.gravity.x;
                gravityChanged = true;
            }
            if (Number.isFinite(next.gravity.y) && numChanged(gravity.y, next.gravity.y)) {
                gravity.y = next.gravity.y;
                gravityChanged = true;
            }
            if (Number.isFinite(next.gravity.z) && numChanged(gravity.z, next.gravity.z)) {
                gravity.z = next.gravity.z;
                gravityChanged = true;
            }
        }
        if (gravityChanged && this._world) {
            const gravity = this.worldConfig.gravity ?? { x: 0, y: -9.81, z: 0 };
            this._world.gravity = { x: gravity.x, y: gravity.y, z: gravity.z };
            this._body?.wakeUp?.();
        }
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

    resetForces() {
        if (!this._body?.resetForces) return;
        this._body.resetForces(true);
    }

    resetTorques() {
        if (!this._body?.resetTorques) return;
        this._body.resetTorques(true);
    }

    addForce(force) {
        if (!this._body?.addForce || !vec3Finite(force)) return;
        const rot = this._body.rotation?.();
        const worldForce = rot ? rotateVecByQuat(force, rot) : force;
        this._body.addForce({ x: worldForce.x, y: worldForce.y, z: worldForce.z }, true);
    }

    addTorque(torque) {
        if (!this._body?.addTorque || !vec3Finite(torque)) return;
        const rot = this._body.rotation?.();
        const worldTorque = rot ? rotateVecByQuat(torque, rot) : torque;
        this._body.addTorque({ x: worldTorque.x, y: worldTorque.y, z: worldTorque.z }, true);
    }

    addForceAtPoint(force, point) {
        if (!this._body?.addForceAtPoint || !vec3Finite(force) || !vec3Finite(point)) return;
        const pos = this._body.translation?.();
        const rot = this._body.rotation?.();
        const worldForce = rot ? rotateVecByQuat(force, rot) : force;
        const rotatedPoint = (pos && rot) ? rotateVecByQuat(point, rot) : point;
        const worldPoint = pos
            ? { x: pos.x + rotatedPoint.x, y: pos.y + rotatedPoint.y, z: pos.z + rotatedPoint.z }
            : rotatedPoint;
        this._body.addForceAtPoint(
            { x: worldForce.x, y: worldForce.y, z: worldForce.z },
            { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z },
            true
        );
    }

    applyImpulse(impulse) {
        if (!this._body?.applyImpulse || !vec3Finite(impulse)) return;
        const rot = this._body.rotation?.();
        const worldImpulse = rot ? rotateVecByQuat(impulse, rot) : impulse;
        this._body.applyImpulse({ x: worldImpulse.x, y: worldImpulse.y, z: worldImpulse.z }, true);
    }

    applyTorqueImpulse(torque) {
        if (!this._body?.applyTorqueImpulse || !vec3Finite(torque)) return;
        const rot = this._body.rotation?.();
        const worldTorque = rot ? rotateVecByQuat(torque, rot) : torque;
        this._body.applyTorqueImpulse({ x: worldTorque.x, y: worldTorque.y, z: worldTorque.z }, true);
    }

    applyImpulseAtPoint(impulse, point) {
        if (!this._body?.applyImpulseAtPoint || !vec3Finite(impulse) || !vec3Finite(point)) return;
        const pos = this._body.translation?.();
        const rot = this._body.rotation?.();
        const worldImpulse = rot ? rotateVecByQuat(impulse, rot) : impulse;
        const rotatedPoint = (pos && rot) ? rotateVecByQuat(point, rot) : point;
        const worldPoint = pos
            ? { x: pos.x + rotatedPoint.x, y: pos.y + rotatedPoint.y, z: pos.z + rotatedPoint.z }
            : rotatedPoint;
        this._body.applyImpulseAtPoint(
            { x: worldImpulse.x, y: worldImpulse.y, z: worldImpulse.z },
            { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z },
            true
        );
    }

    resetVelocities() {
        if (!this._body?.setLinvel || !this._body?.setAngvel) return;
        this._body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this._body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    wakeUp() {
        this._body?.wakeUp?.();
    }

    sleep() {
        if (this._body?.sleep) {
            this._body.sleep();
            return;
        }
        if (this._body?.setSleeping) {
            this._body.setSleeping(true);
        }
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
        const wheelX = halfW - (cfg.wheelWidth * 0.5) + (cfg.wheelSideInset ?? 0);
        const wheelZ = halfL * cfg.wheelbaseRatio;

        const chassisCfg = this.tuning.chassis ?? {};
        const bodyType = chassisCfg.bodyType ?? 'dynamic';
        const bodyDesc = makeBodyDesc(this._rapier, bodyType) ?? this._rapier.RigidBodyDesc.dynamic();
        const translation = chassisCfg.translation ?? {};
        const startY = Number.isFinite(translation.y)
            ? translation.y
            : (Number.isFinite(cfg.spawnHeight) ? cfg.spawnHeight : (halfH + cfg.restLength));
        const startX = Number.isFinite(translation.x) ? translation.x : 0;
        const startZ = Number.isFinite(translation.z) ? translation.z : 0;
        bodyDesc.setTranslation(startX, startY, startZ);
        const rotation = chassisCfg.rotation ?? {};
        bodyDesc.setRotation({
            w: Number.isFinite(rotation.w) ? rotation.w : 1,
            x: Number.isFinite(rotation.x) ? rotation.x : 0,
            y: Number.isFinite(rotation.y) ? rotation.y : 0,
            z: Number.isFinite(rotation.z) ? rotation.z : 0
        });
        const linvel = chassisCfg.linvel ?? null;
        if (vec3Finite(linvel)) bodyDesc.setLinvel(linvel.x, linvel.y, linvel.z);
        const angvel = chassisCfg.angvel ?? null;
        if (vec3Finite(angvel)) bodyDesc.setAngvel({ x: angvel.x, y: angvel.y, z: angvel.z });
        if (Number.isFinite(chassisCfg.linearDamping)) bodyDesc.setLinearDamping(chassisCfg.linearDamping);
        if (Number.isFinite(chassisCfg.angularDamping)) bodyDesc.setAngularDamping(chassisCfg.angularDamping);
        if (Number.isFinite(chassisCfg.gravityScale) && typeof bodyDesc.setGravityScale === 'function') {
            bodyDesc.setGravityScale(chassisCfg.gravityScale);
        }
        if (typeof chassisCfg.canSleep === 'boolean' && typeof bodyDesc.setCanSleep === 'function') {
            bodyDesc.setCanSleep(chassisCfg.canSleep);
        }
        if (typeof chassisCfg.ccdEnabled === 'boolean' && typeof bodyDesc.setCcdEnabled === 'function') {
            bodyDesc.setCcdEnabled(chassisCfg.ccdEnabled);
        }
        if (Number.isFinite(chassisCfg.dominanceGroup) && typeof bodyDesc.setDominanceGroup === 'function') {
            bodyDesc.setDominanceGroup(chassisCfg.dominanceGroup);
        }
        if (typeof chassisCfg.lockTranslations === 'boolean' && chassisCfg.lockTranslations && typeof bodyDesc.lockTranslations === 'function') {
            bodyDesc.lockTranslations();
        }
        if (typeof chassisCfg.lockRotations === 'boolean' && chassisCfg.lockRotations && typeof bodyDesc.lockRotations === 'function') {
            bodyDesc.lockRotations();
        }
        const enabledRotations = chassisCfg.enabledRotations ?? null;
        if (enabledRotations && typeof bodyDesc.enabledRotations === 'function') {
            bodyDesc.enabledRotations(
                typeof enabledRotations.x === 'boolean' ? enabledRotations.x : true,
                typeof enabledRotations.y === 'boolean' ? enabledRotations.y : true,
                typeof enabledRotations.z === 'boolean' ? enabledRotations.z : true
            );
        }
        const massProps = resolveMassProps(chassisCfg.additionalMassProperties);
        if (massProps && typeof bodyDesc.setAdditionalMassProperties === 'function') {
            bodyDesc.setAdditionalMassProperties(massProps.mass, massProps.com, massProps.inertia, massProps.frame);
        } else if (Number.isFinite(chassisCfg.additionalMass)) {
            bodyDesc.setAdditionalMass(chassisCfg.additionalMass);
        }
        const body = this._world.createRigidBody(bodyDesc);
        if (Number.isFinite(chassisCfg.gravityScale)) {
            body.setGravityScale(chassisCfg.gravityScale, true);
        }
        if (!massProps && Number.isFinite(chassisCfg.additionalMass)) {
            body.setAdditionalMass(chassisCfg.additionalMass, true);
        }

        const colliderDesc = this._rapier.ColliderDesc.cuboid(halfW, halfH, halfL);
        if (typeof colliderDesc.setDensity === 'function') {
            colliderDesc.setDensity(0);
        }
        colliderDesc.setFriction(0.2);
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

        if (!this._dirty.chassis && !this._dirty.wheels && !this._dirty.suspension && !this._dirty.tires && !this._dirty.pose && !this._dirty.bodyType) return;

        const chassisCfg = this.tuning.chassis ?? {};
        if (this._dirty.bodyType) {
            const nextType = resolveBodyTypeEnum(this._rapier, chassisCfg.bodyType);
            if (nextType !== null && typeof this._body.setBodyType === 'function') {
                this._body.setBodyType(nextType, true);
            }
            this._dirty.bodyType = false;
        }
        if (this._dirty.chassis) {
            if (Number.isFinite(chassisCfg.linearDamping)) this._body.setLinearDamping(chassisCfg.linearDamping);
            if (Number.isFinite(chassisCfg.angularDamping)) this._body.setAngularDamping(chassisCfg.angularDamping);
            if (Number.isFinite(chassisCfg.gravityScale)) this._body.setGravityScale(chassisCfg.gravityScale, false);
            const massProps = resolveMassProps(chassisCfg.additionalMassProperties);
            if (massProps && typeof this._body.setAdditionalMassProperties === 'function') {
                this._body.setAdditionalMassProperties(massProps.mass, massProps.com, massProps.inertia, massProps.frame, false);
            } else if (Number.isFinite(chassisCfg.additionalMass)) {
                this._body.setAdditionalMass(chassisCfg.additionalMass, false);
            }
            if (typeof chassisCfg.canSleep === 'boolean' && typeof this._body.setCanSleep === 'function') {
                this._body.setCanSleep(chassisCfg.canSleep);
            }
            if (typeof chassisCfg.ccdEnabled === 'boolean') this._body.enableCcd(chassisCfg.ccdEnabled);
            if (Number.isFinite(chassisCfg.dominanceGroup) && typeof this._body.setDominanceGroup === 'function') {
                this._body.setDominanceGroup(chassisCfg.dominanceGroup);
            }
            if (typeof chassisCfg.lockTranslations === 'boolean' && typeof this._body.lockTranslations === 'function') {
                this._body.lockTranslations(chassisCfg.lockTranslations, true);
            }
            if (typeof chassisCfg.lockRotations === 'boolean' && typeof this._body.lockRotations === 'function') {
                this._body.lockRotations(chassisCfg.lockRotations, true);
            }
            const enabledRotations = chassisCfg.enabledRotations ?? null;
            if (enabledRotations && typeof this._body.setEnabledRotations === 'function') {
                this._body.setEnabledRotations(
                    typeof enabledRotations.x === 'boolean' ? enabledRotations.x : true,
                    typeof enabledRotations.y === 'boolean' ? enabledRotations.y : true,
                    typeof enabledRotations.z === 'boolean' ? enabledRotations.z : true,
                    true
                );
            }
            this._dirty.chassis = false;
        }

        const wheelsDirty = this._dirty.wheels;
        const suspensionDirty = this._dirty.suspension;
        const tiresDirty = this._dirty.tires;
        if (wheelsDirty || suspensionDirty || tiresDirty) {
            const cfg = this.vehicleConfig;
            const halfW = cfg.width * 0.5;
            const halfH = cfg.height * 0.5;
            const halfL = cfg.length * 0.5;
            const wheelY = -halfH - (cfg.groundClearance ?? 0) + cfg.wheelRadius;
            const wheelX = halfW - (cfg.wheelWidth * 0.5) + (cfg.wheelSideInset ?? 0);
            const wheelZ = halfL * cfg.wheelbaseRatio;

            const hardpoints = wheelsDirty
                ? [
                    { x: -wheelX, y: wheelY + cfg.restLength, z: wheelZ },
                    { x: wheelX, y: wheelY + cfg.restLength, z: wheelZ },
                    { x: -wheelX, y: wheelY + cfg.restLength, z: -wheelZ },
                    { x: wheelX, y: wheelY + cfg.restLength, z: -wheelZ }
                ]
                : null;

            const susp = this.tuning.suspension ?? {};
            const tires = this.tuning.tires ?? {};

            for (let i = 0; i < this._wheelIndices.all.length; i++) {
                const idx = this._wheelIndices.all[i];

                if (wheelsDirty && hardpoints?.[i]) {
                    this._controller.setWheelChassisConnectionPointCs?.(idx, hardpoints[i]);
                    if (Number.isFinite(cfg.restLength)) this._controller.setWheelSuspensionRestLength(idx, cfg.restLength);
                    if (Number.isFinite(cfg.wheelRadius)) this._controller.setWheelRadius(idx, cfg.wheelRadius);
                }

                if (suspensionDirty) {
                    if (Number.isFinite(susp.maxTravel)) this._controller.setWheelMaxSuspensionTravel(idx, susp.maxTravel);
                    if (Number.isFinite(susp.stiffness)) this._controller.setWheelSuspensionStiffness(idx, susp.stiffness);
                    if (Number.isFinite(susp.compression)) this._controller.setWheelSuspensionCompression(idx, susp.compression);
                    if (Number.isFinite(susp.relaxation)) this._controller.setWheelSuspensionRelaxation(idx, susp.relaxation);
                    if (Number.isFinite(susp.maxForce)) this._controller.setWheelMaxSuspensionForce(idx, susp.maxForce);
                }

                if (tiresDirty) {
                    if (Number.isFinite(tires.frictionSlip)) this._controller.setWheelFrictionSlip(idx, tires.frictionSlip);
                    if (Number.isFinite(tires.sideFrictionStiffness)) this._controller.setWheelSideFrictionStiffness(idx, tires.sideFrictionStiffness);
                }
            }

            this._dirty.wheels = false;
            this._dirty.suspension = false;
            this._dirty.tires = false;
        }

        if (this._dirty.pose) {
            const translation = chassisCfg.translation ?? null;
            if (vec3Finite(translation)) {
                this._body.setTranslation({ x: translation.x, y: translation.y, z: translation.z }, true);
            }
            const rotation = chassisCfg.rotation ?? null;
            if (rotation && Number.isFinite(rotation.x) && Number.isFinite(rotation.y) && Number.isFinite(rotation.z) && Number.isFinite(rotation.w)) {
                this._body.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }, true);
            }
            const linvel = chassisCfg.linvel ?? null;
            if (vec3Finite(linvel)) {
                this._body.setLinvel({ x: linvel.x, y: linvel.y, z: linvel.z }, true);
            }
            const angvel = chassisCfg.angvel ?? null;
            if (vec3Finite(angvel)) {
                this._body.setAngvel({ x: angvel.x, y: angvel.y, z: angvel.z }, true);
            }
            this._dirty.pose = false;
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
        const sleepingRaw = safeCall(this._body, 'isSleeping') ?? safeGet(this._body, 'isSleeping');
        const sleeping = typeof sleepingRaw === 'boolean' ? sleepingRaw : null;
        const canForceSleep = typeof safeGet(this._body, 'sleep') === 'function'
            || typeof safeGet(this._body, 'setSleeping') === 'function';
        const speed = this._controller.currentVehicleSpeed ? this._controller.currentVehicleSpeed() : 0;
        const force = readVec3(safeCall(this._body, 'force') ?? safeGet(this._body, 'force'));
        const torque = readVec3(safeCall(this._body, 'torque') ?? safeGet(this._body, 'torque'));
        const upAxis = safeGet(this._controller, 'indexUpAxis');
        const forwardAxis = safeGet(this._controller, 'indexForwardAxis');
        const forwardIndex = Number.isFinite(forwardAxis) ? forwardAxis : 2;
        const localForward = axisFromIndex(forwardIndex);
        const upIndex = Number.isFinite(upAxis) ? upAxis : 1;
        const localUp = axisFromIndex(upIndex);
        const localRight = normalizeVec3(crossVec3(localUp, localForward));
        const worldForward = rotateVecByQuat(localForward, rot);
        const speedProj = (linvel.x * worldForward.x) + (linvel.y * worldForward.y) + (linvel.z * worldForward.z);
        const yaw = Math.atan2(worldForward.x ?? 0, worldForward.z ?? 0);

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
        const wheelX = halfW - (cfg.wheelWidth * 0.5) + (cfg.wheelSideInset ?? 0);
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
            const fallbackLabel = this._wheelLabels[idx] ?? `W${idx}`;
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

            const labelSource = connectionPointLocal ?? centerLocal ?? expectedLocal;
            const label = labelFromLocal(labelSource, localForward, localRight, fallbackLabel);

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
                angvel: { x: angvel.x, y: angvel.y, z: angvel.z },
                sleeping,
                force,
                torque,
                canForceSleep
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
