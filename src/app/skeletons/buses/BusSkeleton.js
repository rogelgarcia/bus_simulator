// src/app/skeletons/buses/BusSkeleton.js
import * as THREE from 'three';

/**
 * Parts convention (all optional):
 * parts = {
 *   headlights: Mesh[] | Light[],
 *   brakeLights: Mesh[] | Light[],
 *   reverseLights: Mesh[] | Light[],
 *   turnLeft: Mesh[] | Light[],
 *   turnRight: Mesh[] | Light[],
 * }
 *
 * Suspension tuning convention (optional, owned by the bus):
 * bus.userData.suspensionTuning = {
 *   stiffness: number,        // per-corner spring stiffness (relative N/m)
 *   dampingRatio: number,     // dimensionless (used to derive damping if damping not provided)
 *   damping: number,          // optional direct damper coefficient
 *   mass: number,             // per-corner mass (relative)
 *   inertiaScale: number,     // larger = slower pitch/roll response
 *   bumpTravel: number,       // max compression (+), meters
 *   droopTravel: number,      // max extension (-), meters
 *   stopStiffness: number,    // optional bump-stop stiffness
 *   stopDamping: number,      // optional bump-stop damping
 *   maxAngleDeg: number,      // pitch/roll clamp
 *   angularDamping: number,   // extra angular damping (1/s)
 *   heaveDamping: number      // extra heave damping (1/s)
 *
 *   // progressive spring feel (optional)
 *   springNonlinear: number,      // 0 = linear. >0 ramps stiffness with compression.
 *   springNonlinearPow: number    // shape exponent (e.g. 2 = quadratic ramp)
 * }
 */

function asArray(v) {
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
}

function collectByName(root, token) {
    const out = [];
    const t = token.toLowerCase();
    root.traverse((o) => {
        const n = (o.name || '').toLowerCase();
        if (!n) return;
        if ((o.isMesh || o.isLight) && n.includes(t)) out.push(o);
    });
    return out;
}

function normalizeParts(searchRoot, parts = {}) {
    const p = {
        headlights: asArray(parts.headlights),
        brakeLights: asArray(parts.brakeLights),
        reverseLights: asArray(parts.reverseLights),
        turnLeft: asArray(parts.turnLeft),
        turnRight: asArray(parts.turnRight),
    };

    if (p.headlights.length === 0) p.headlights = collectByName(searchRoot, 'headlight');
    if (p.brakeLights.length === 0) p.brakeLights = collectByName(searchRoot, 'brakelight');
    if (p.reverseLights.length === 0) p.reverseLights = collectByName(searchRoot, 'reverselight');
    if (p.turnLeft.length === 0) p.turnLeft = collectByName(searchRoot, 'turnleft');
    if (p.turnRight.length === 0) p.turnRight = collectByName(searchRoot, 'turnright');

    return p;
}

function applyToMaterials(mesh, fn) {
    const m = mesh.material;
    if (!m) return;
    if (Array.isArray(m)) m.forEach(fn);
    else fn(m);
}

function setEmitter(obj, { on, color, intensity }) {
    if (!obj) return;

    if (obj.isLight) {
        obj.color?.set?.(color);
        obj.intensity = on ? intensity : 0;
        obj.visible = true;
        return;
    }

    if (obj.isMesh) {
        applyToMaterials(obj, (mat) => {
            if (!mat || mat.emissive === undefined) return;
            mat.emissive.set(color);
            mat.emissiveIntensity = on ? intensity : 0;
            mat.needsUpdate = true;
        });
    }
}

function setEmitters(list, opts) {
    for (const o of list) setEmitter(o, opts);
}

function isWheelLike(obj) {
    if (!obj) return false;
    if (obj.userData?.isWheel === true) return true;
    const n = (obj.name || '').toLowerCase();
    if (n.includes('wheel') || n.includes('tire') || n.includes('rim')) return true;

    let found = false;
    obj.traverse((o) => {
        if (found) return;
        if (o === obj) return;
        if (o.userData?.isWheel === true) found = true;
        const nn = (o.name || '').toLowerCase();
        if (nn.includes('wheel') || nn.includes('tire') || nn.includes('rim')) found = true;
    });
    return found;
}

function findTopChildUnder(bus, node) {
    let cur = node;
    while (cur && cur.parent && cur.parent !== bus) cur = cur.parent;
    if (cur && cur.parent === bus) return cur;
    return null;
}

function collectWheelRootsFromRig(bus, rig) {
    const roots = new Set();
    if (!rig) return roots;

    const lists = [rig.front ?? [], rig.rear ?? []];
    for (const list of lists) {
        for (const w of list) {
            const rp = w?.rollPivot ?? null;
            const sp = w?.steerPivot ?? null;

            const rRoot = rp ? findTopChildUnder(bus, rp) : null;
            const sRoot = sp ? findTopChildUnder(bus, sp) : null;

            if (rRoot) roots.add(rRoot);
            if (sRoot) roots.add(sRoot);
        }
    }
    return roots;
}

function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Default “bus-like” baseline:
 * - heavier
 * - stiffer
 * - more damping (less oscillation)
 * - progressive spring rate (soft near center, ramps hard near extremes)
 */
const DEFAULT_SUSPENSION_TUNING = {
    stiffness: 720,
    dampingRatio: 0.62,
    mass: 85.0,
    inertiaScale: 26.0,

    bumpTravel: 0.28,
    droopTravel: 0.28,

    maxAngleDeg: 8,
    angularDamping: 2.1,
    heaveDamping: 0.10,

    // progressive spring feel
    springNonlinear: 2.2,
    springNonlinearPow: 2.0,
};

function deriveSuspensionTuningFromBody(bodyRoot) {
    const base = { ...DEFAULT_SUSPENSION_TUNING };

    try {
        bodyRoot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(bodyRoot);
        const size = box.getSize(new THREE.Vector3());

        // Model units are “meter-ish”. Use length as primary scale.
        const length = Math.max(0.001, size.z || 1);
        const s = THREE.MathUtils.clamp(length / 6.5, 0.85, 1.45);

        // Scale mass + stiffness together so bigger buses feel heavier,
        // but the overall “bus frequency band” stays sensible.
        base.mass = base.mass * s * s;
        base.stiffness = base.stiffness * s * s;

        // Bigger buses resist pitch/roll more
        base.inertiaScale = base.inertiaScale * s;

        return base;
    } catch {
        return base;
    }
}

function mergeSuspensionTuning(bodyRoot, ...overrides) {
    const derived = deriveSuspensionTuningFromBody(bodyRoot);
    let out = { ...derived };
    for (const o of overrides) {
        if (!isPlainObject(o)) continue;
        out = { ...out, ...o };
    }
    return out;
}

/**
 * BusSkeleton structure:
 * root (bus group)
 *  -> yawPivot (Y rotation)
 *     -> vehicleTiltPivot (X/Z rotation for whole vehicle)
 *        -> wheelsRoot (wheels only, planted)
 *        -> bodyTiltPivot (X/Z rotation + Y heave for body only)
 *           -> bodyRoot (everything except wheels)
 */
export class BusSkeleton {
    constructor({
                    root,
                    yawPivot,
                    vehicleTiltPivot,
                    wheelsRoot,
                    bodyTiltPivot,
                    bodyRoot,
                    wheelRig,
                    parts,
                    bodyPivotBase,
                    suspensionTuning
                }) {
        this.root = root;

        this.yawPivot = yawPivot;

        // keep old property name for compatibility
        this.tiltPivot = vehicleTiltPivot;

        this.wheelsRoot = wheelsRoot;
        this.bodyTiltPivot = bodyTiltPivot;
        this.bodyRoot = bodyRoot;

        this.wheelRig = wheelRig ?? null;
        this.parts = parts ?? {
            headlights: [],
            brakeLights: [],
            reverseLights: [],
            turnLeft: [],
            turnRight: []
        };

        this._bodyPivotBase = bodyPivotBase ? bodyPivotBase.clone() : this.bodyTiltPivot.position.clone();

        // exposed (so physics can align to the same pivot)
        this.bodyPivotBase = this._bodyPivotBase.clone();

        // ✅ Bus-owned tuning (state reads this; it does not own it)
        this.suspensionTuning = suspensionTuning ?? null;

        this._steer = 0;
        this._spin = 0;

        this._pitch = 0;
        this._roll = 0;

        this._bodyPitch = 0;
        this._bodyRoll = 0;
        this._bodyHeave = 0;

        this._headOn = false;
        this._brakeAmount = 0;
    }

    getSuspensionTuning() {
        return this.suspensionTuning ? { ...this.suspensionTuning } : null;
    }

    // ---- transforms ----
    setPosition(x, y, z) {
        this.root.position.set(x, y, z);
    }

    setYaw(yawRad) {
        this.yawPivot.rotation.y = yawRad;
    }

    /** Whole vehicle tilt (includes wheels) */
    setTilt(pitchRad = 0, rollRad = 0) {
        this._pitch = pitchRad;
        this._roll = rollRad;
        this.tiltPivot.rotation.x = pitchRad;
        this.tiltPivot.rotation.z = rollRad;
    }

    /** Body-only tilt (wheels remain planted) */
    setBodyTilt(pitchRad = 0, rollRad = 0) {
        this._bodyPitch = pitchRad;
        this._bodyRoll = rollRad;
        this.bodyTiltPivot.rotation.x = pitchRad;
        this.bodyTiltPivot.rotation.z = rollRad;
    }

    /** Body-only vertical offset (wheels remain planted) */
    setBodyHeave(heaveY = 0) {
        this._bodyHeave = heaveY;
        this.bodyTiltPivot.position.set(
            this._bodyPivotBase.x,
            this._bodyPivotBase.y + heaveY,
            this._bodyPivotBase.z
        );
    }

    // ---- wheels ----
    setSteerAngle(angleRad) {
        this._steer = angleRad;
        if (this.wheelRig?.setSteerAngle) this.wheelRig.setSteerAngle(angleRad);
    }

    setWheelSpin(spinRad) {
        this._spin = spinRad;
        if (this.wheelRig?.setSpinAngle) this.wheelRig.setSpinAngle(spinRad);
    }

    addWheelSpin(deltaRad) {
        this._spin += deltaRad;
        if (this.wheelRig?.addSpin) this.wheelRig.addSpin(deltaRad);
        else if (this.wheelRig?.setSpinAngle) this.wheelRig.setSpinAngle(this._spin);
    }

    // ---- lights ----
    setHeadlights(on, intensity = 1.6) {
        this._headOn = !!on;
        setEmitters(this.parts.headlights, { on: this._headOn, color: 0xffffff, intensity });
    }

    /** amount: 0..1 (boolean allowed) */
    setBrake(amount) {
        const a = typeof amount === 'number' ? THREE.MathUtils.clamp(amount, 0, 1) : (amount ? 1 : 0);
        this._brakeAmount = a;
        setEmitters(this.parts.brakeLights, {
            on: a > 0.001,
            color: 0xff2222,
            intensity: 0.6 + a * 2.4
        });
    }

    setReverse(on, intensity = 1.4) {
        setEmitters(this.parts.reverseLights, { on: !!on, color: 0xffffff, intensity });
    }

    setTurnSignal(side, on, intensity = 1.6) {
        const list = side === 'left' ? this.parts.turnLeft : this.parts.turnRight;
        setEmitters(list, { on: !!on, color: 0xffaa22, intensity });
    }
}

export function attachBusSkeleton(bus, { wheelRig = null, parts = null, suspensionTuning = null } = {}) {
    if (!bus || !bus.isObject3D) throw new Error('attachBusSkeleton(bus): bus must be a THREE.Object3D');
    if (bus.userData?.bus) return bus;

    const rig = wheelRig ?? bus.userData?.wheelRig ?? null;
    bus.userData.wheelRig = rig;

    // identify wheel roots BEFORE reparent
    const wheelRootsFromRig = collectWheelRootsFromRig(bus, rig);

    // stash children
    const originalChildren = [...bus.children];
    for (const c of originalChildren) bus.remove(c);

    const yawPivot = new THREE.Group();
    yawPivot.name = 'bus_yaw';

    const vehicleTiltPivot = new THREE.Group();
    vehicleTiltPivot.name = 'bus_vehicle_tilt';

    const wheelsRoot = new THREE.Group();
    wheelsRoot.name = 'bus_wheels';

    const bodyTiltPivot = new THREE.Group();
    bodyTiltPivot.name = 'bus_body_tilt';

    const bodyRoot = new THREE.Group();
    bodyRoot.name = 'bus_bodyRoot';

    bus.add(yawPivot);
    yawPivot.add(vehicleTiltPivot);
    vehicleTiltPivot.add(wheelsRoot);
    vehicleTiltPivot.add(bodyTiltPivot);
    bodyTiltPivot.add(bodyRoot);

    // re-add children to wheelsRoot or bodyRoot
    for (const child of originalChildren) {
        const isWheelByRig = wheelRootsFromRig.size > 0 && wheelRootsFromRig.has(child);
        if (isWheelByRig || isWheelLike(child)) wheelsRoot.add(child);
        else bodyRoot.add(child);
    }

    // Center body tilt pivot in X/Y/Z around BODY (not wheels).
    let bodyPivotBase = new THREE.Vector3(0, 0, 0);

    if (bodyRoot.children.length) {
        bodyRoot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(bodyRoot);
        const center = box.getCenter(new THREE.Vector3());

        bodyTiltPivot.position.copy(center);
        bodyRoot.position.sub(center);

        bodyPivotBase.copy(bodyTiltPivot.position);
    }

    // parts live in bodyRoot typically
    const normalizedParts = normalizeParts(bodyRoot, parts ?? bus.userData?.parts ?? {});
    bus.userData.parts = normalizedParts;

    // ✅ Suspension tuning is BUS-OWNED.
    // Priority: explicit arg > bus.userData.suspensionTuning > derived defaults.
    const tuning = mergeSuspensionTuning(
        bodyRoot,
        bus.userData?.suspensionTuning ?? null,
        suspensionTuning
    );
    bus.userData.suspensionTuning = tuning;

    const skeleton = new BusSkeleton({
        root: bus,
        yawPivot,
        vehicleTiltPivot,
        wheelsRoot,
        bodyTiltPivot,
        bodyRoot,
        wheelRig: rig,
        parts: normalizedParts,
        bodyPivotBase,
        suspensionTuning: tuning
    });

    bus.userData.bus = skeleton;
    bus.userData.api = skeleton;
    return bus;
}
