// src/app/physics/SuspensionSim.js
/**
 * @deprecated This file is part of the legacy architecture.
 * Use SuspensionSystem from src/physics/systems/SuspensionSystem.js instead.
 * This file is kept for TestModeState (debug tool).
 */
import * as THREE from 'three';

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function det3(m) {
    return (
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
        m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
        m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    );
}

function solve3(A, b) {
    const detA = det3(A);
    if (Math.abs(detA) < 1e-10) return null;

    const A1 = [[b[0], A[0][1], A[0][2]], [b[1], A[1][1], A[1][2]], [b[2], A[2][1], A[2][2]]];
    const A2 = [[A[0][0], b[0], A[0][2]], [A[1][0], b[1], A[1][2]], [A[2][0], b[2], A[2][2]]];
    const A3 = [[A[0][0], A[0][1], b[0]], [A[1][0], A[1][1], b[1]], [A[2][0], A[2][1], b[2]]];

    return [det3(A1) / detA, det3(A2) / detA, det3(A3) / detA];
}

function expLerp(cur, target, dt, tau) {
    const t = 1 - Math.exp(-dt / Math.max(1e-4, tau));
    return cur + (target - cur) * t;
}

function moveTowards(cur, target, maxDelta) {
    const d = clamp(target - cur, -maxDelta, maxDelta);
    return cur + d;
}

function deriveDampingFromRatio({ stiffness, mass, dampingRatio }) {
    const k = Math.max(1e-6, stiffness ?? 0);
    const m = Math.max(1e-6, mass ?? 0);
    const z = Math.max(0, dampingRatio ?? 0);
    // c = 2 ζ sqrt(k m)
    return 2 * z * Math.sqrt(k * m);
}

/**
 * 4-corner suspension.
 * x = compression (m), v = velocity (m/s)
 * x'' = (k*(target-x) - c*v)/m
 *
 * pose from plane fit:
 * y = a*x + b*z + c0  => roll≈atan(a), pitch≈-atan(b)
 */
export class SuspensionSim {
    constructor(opts = {}) {
        // More “bus-like” baseline defaults
        this.k = 360;
        this.c = 140;
        this.m = 18.0;

        this.travel = 0.22;
        this.maxAngle = THREE.MathUtils.degToRad(14);

        this.cgHeightM = 1.15;
        this.latGain = 1.75;
        this.longGain = 2.15;
        this.maxTransferG = 1.05;

        this.latTransferTau = 0.26;
        this.longTransferTau = 0.16;

        this.latBiasMaxRate = 0.24;
        this.longBiasMaxRate = 0.45;

        // nonlinear damping (already existed)
        this.damperNonlinear = 1.35;
        this.damperNonlinearV0 = 0.35;

        // ✅ nonlinear spring stiffness (new)
        this.springNonlinear = 2.0;     // 0 = linear
        this.springNonlinearPow = 2.0;  // 2 = quadratic ramp

        this.s = {
            fl: { x: 0, v: 0, cmd: 0, eff: 0 },
            fr: { x: 0, v: 0, cmd: 0, eff: 0 },
            rl: { x: 0, v: 0, cmd: 0, eff: 0 },
            rr: { x: 0, v: 0, cmd: 0, eff: 0 }
        };

        this.p = {
            fl: { x: -1.2, z:  2.6 },
            fr: { x:  1.2, z:  2.6 },
            rl: { x: -1.2, z: -2.6 },
            rr: { x:  1.2, z: -2.6 }
        };

        this.geom = { track: 2.4, wheelbase: 5.5 };

        this.pose = { pitch: 0, roll: 0, heave: 0 };

        this.chassis = { aLat: 0, aLong: 0 };
        this._latBias = 0;
        this._longBias = 0;

        this.debug = {
            xActualCm: { fl: 0, fr: 0, rl: 0, rr: 0 },
            xCmdCm: { fl: 0, fr: 0, rl: 0, rr: 0 },
            xEffCm: { fl: 0, fr: 0, rl: 0, rr: 0 }
        };

        this.configure(opts, { reset: true });
    }

    configure(opts = {}, { reset = false } = {}) {
        const {
            stiffness = this.k,

            // You can pass either:
            // - damping (direct c), OR
            // - dampingRatio (ζ), which we convert to c
            damping = undefined,
            dampingRatio = undefined,

            mass = this.m,

            // travel: if not provided, we can derive from bump/droop travel
            travel = undefined,
            bumpTravel = undefined,
            droopTravel = undefined,

            maxAngleDeg = THREE.MathUtils.radToDeg(this.maxAngle),

            cgHeightM = this.cgHeightM,
            latGain = this.latGain,
            longGain = this.longGain,
            maxTransferG = this.maxTransferG,

            latTransferTau = this.latTransferTau,
            longTransferTau = this.longTransferTau,

            latBiasMaxRate = this.latBiasMaxRate,
            longBiasMaxRate = this.longBiasMaxRate,

            damperNonlinear = this.damperNonlinear,
            damperNonlinearV0 = this.damperNonlinearV0,

            // ✅ progressive spring params
            springNonlinear = this.springNonlinear,
            springNonlinearPow = this.springNonlinearPow,
        } = opts;

        this.k = stiffness;
        this.m = mass;

        // derive damping if needed
        if (damping != null && isFinite(damping)) {
            this.c = damping;
        } else if (dampingRatio != null && isFinite(dampingRatio)) {
            this.c = deriveDampingFromRatio({
                stiffness: this.k,
                mass: this.m,
                dampingRatio
            });
        }

        // derive travel if not explicitly set
        let t = travel;
        if (t == null || !isFinite(t)) {
            const bt = (bumpTravel != null && isFinite(bumpTravel)) ? Math.abs(bumpTravel) : null;
            const dt = (droopTravel != null && isFinite(droopTravel)) ? Math.abs(droopTravel) : null;

            if (bt != null && dt != null) t = Math.min(bt, dt);
            else if (bt != null) t = bt;
            else if (dt != null) t = dt;
        }
        if (t != null && isFinite(t)) this.travel = t;

        this.maxAngle = THREE.MathUtils.degToRad(maxAngleDeg);

        this.cgHeightM = cgHeightM;
        this.latGain = latGain;
        this.longGain = longGain;
        this.maxTransferG = maxTransferG;

        this.latTransferTau = latTransferTau;
        this.longTransferTau = longTransferTau;

        this.latBiasMaxRate = latBiasMaxRate;
        this.longBiasMaxRate = longBiasMaxRate;

        this.damperNonlinear = damperNonlinear;
        this.damperNonlinearV0 = damperNonlinearV0;

        this.springNonlinear = springNonlinear;
        this.springNonlinearPow = springNonlinearPow;

        if (reset) this.hardReset();
    }

    setTargetsCm({ fl, fr, rl, rr }) {
        this.s.fl.cmd = (fl ?? 0) / 100;
        this.s.fr.cmd = (fr ?? 0) / 100;
        this.s.rl.cmd = (rl ?? 0) / 100;
        this.s.rr.cmd = (rr ?? 0) / 100;
    }

    setChassisAccel({ aLat = 0, aLong = 0 } = {}) {
        this.chassis.aLat = aLat;
        this.chassis.aLong = aLong;
    }

    hardReset() {
        for (const k of Object.keys(this.s)) {
            this.s[k].x = 0;
            this.s[k].v = 0;
            this.s[k].cmd = 0;
            this.s[k].eff = 0;
        }
        this.pose.pitch = 0;
        this.pose.roll = 0;
        this.pose.heave = 0;
        this._latBias = 0;
        this._longBias = 0;
    }

    _recomputeGeom() {
        const trackFront = Math.abs(this.p.fr.x - this.p.fl.x);
        const trackRear  = Math.abs(this.p.rr.x - this.p.rl.x);
        const track = (trackFront + trackRear) * 0.5;

        const frontZ = (this.p.fl.z + this.p.fr.z) * 0.5;
        const rearZ  = (this.p.rl.z + this.p.rr.z) * 0.5;
        const wheelbase = Math.abs(frontZ - rearZ);

        this.geom.track = clamp(track || this.geom.track, 1.4, 3.8);
        this.geom.wheelbase = clamp(wheelbase || this.geom.wheelbase, 2.8, 10.0);
    }

    setLayoutFromBus(busApi) {
        const rig = busApi?.wheelRig;
        const root = busApi?.root;
        if (!rig || !root) return;

        const wheels = [];
        const tmp = new THREE.Vector3();

        root.updateMatrixWorld(true);

        const all = [...(rig.front ?? []), ...(rig.rear ?? [])];
        for (const w of all) {
            const pivot = w?.rollPivot ?? w?.steerPivot;
            if (!pivot) continue;
            pivot.getWorldPosition(tmp);
            const local = root.worldToLocal(tmp.clone());
            wheels.push(local);
        }

        if (wheels.length < 4) return;

        const minZ = Math.min(...wheels.map((w) => w.z));
        const maxZ = Math.max(...wheels.map((w) => w.z));
        const midZ = (minZ + maxZ) / 2;

        const front = wheels.filter((w) => w.z > midZ);
        const rear = wheels.filter((w) => w.z <= midZ);
        if (front.length < 2 || rear.length < 2) return;

        const fl = front.find((w) => w.x < 0) ?? front[0];
        const fr = front.find((w) => w.x >= 0) ?? front[1] ?? front[0];
        const rl = rear.find((w) => w.x < 0) ?? rear[0];
        const rr = rear.find((w) => w.x >= 0) ?? rear[1] ?? rear[0];

        this.p.fl = { x: fl.x, z: fl.z };
        this.p.fr = { x: fr.x, z: fr.z };
        this.p.rl = { x: rl.x, z: rl.z };
        this.p.rr = { x: rr.x, z: rr.z };

        this._recomputeGeom();

        const t = root.userData?.suspensionTuning;
        if (t && typeof t === 'object') this.configure(t, { reset: false });
    }

    fixedUpdate(dtRaw) {
        const dt = clamp(dtRaw, 0, 1 / 30);
        if (!dt) return;

        // load transfer biases (meters)
        const g = 9.81;

        const latG = clamp((this.chassis.aLat ?? 0) / g, -this.maxTransferG, this.maxTransferG);
        const longG = clamp((this.chassis.aLong ?? 0) / g, -this.maxTransferG, this.maxTransferG);

        const track = Math.max(1.2, this.geom.track ?? 2.4);
        const wb = Math.max(2.6, this.geom.wheelbase ?? 5.5);
        const cg = Math.max(0.4, this.cgHeightM ?? 1.1);

        const latBiasTarget  = latG  * this.travel * this.latGain  * (cg / track);
        const longBiasTarget = longG * this.travel * this.longGain * (cg / wb);

        const latWanted  = expLerp(this._latBias,  latBiasTarget,  dt, this.latTransferTau);
        const longWanted = expLerp(this._longBias, longBiasTarget, dt, this.longTransferTau);

        this._latBias  = moveTowards(this._latBias,  latWanted,  this.latBiasMaxRate * dt);
        this._longBias = moveTowards(this._longBias, longWanted, this.longBiasMaxRate * dt);

        const lat = this._latBias;
        const long = this._longBias;

        const frontBias = -long;
        const rearBias  = +long;

        const effTargets = {
            fl: clamp(this.s.fl.cmd + frontBias + lat, -this.travel, this.travel),
            fr: clamp(this.s.fr.cmd + frontBias - lat, -this.travel, this.travel),
            rl: clamp(this.s.rl.cmd + rearBias  + lat, -this.travel, this.travel),
            rr: clamp(this.s.rr.cmd + rearBias  - lat, -this.travel, this.travel)
        };

        // integrate springs
        for (const key of Object.keys(this.s)) {
            const sp = this.s[key];
            const target = effTargets[key];
            sp.eff = target;

            // nonlinear damping (existing behavior)
            const vAbs = Math.abs(sp.v);
            const v0 = Math.max(1e-3, this.damperNonlinearV0);
            const dGain = 1 + (this.damperNonlinear * clamp(vAbs / v0, 0, 2.5));
            const cEff = this.c * dGain;

            // ✅ progressive spring stiffness: ramps with compression magnitude
            const tr = Math.max(1e-4, this.travel);
            const xN = clamp(Math.abs(sp.x) / tr, 0, 2.0);
            const kGain = 1 + (this.springNonlinear * Math.pow(xN, this.springNonlinearPow));
            const kEff = this.k * kGain;

            const a = (kEff * (target - sp.x) - cEff * sp.v) / Math.max(1e-6, this.m);

            sp.v += a * dt;
            sp.x += sp.v * dt;

            sp.x = clamp(sp.x, -this.travel, this.travel);
        }

        // pose from plane fit
        const pts = [
            { x: this.p.fl.x, z: this.p.fl.z, y: -this.s.fl.x },
            { x: this.p.fr.x, z: this.p.fr.z, y: -this.s.fr.x },
            { x: this.p.rl.x, z: this.p.rl.z, y: -this.s.rl.x },
            { x: this.p.rr.x, z: this.p.rr.z, y: -this.s.rr.x }
        ];

        let Sxx = 0, Sxz = 0, Sx = 0, Szz = 0, Sz = 0, Sy = 0, Sxy = 0, Szy = 0;
        const n = pts.length;

        for (const p of pts) {
            Sxx += p.x * p.x;
            Sxz += p.x * p.z;
            Sx  += p.x;
            Szz += p.z * p.z;
            Sz  += p.z;
            Sy  += p.y;
            Sxy += p.x * p.y;
            Szy += p.z * p.y;
        }

        const A = [
            [Sxx, Sxz, Sx],
            [Sxz, Szz, Sz],
            [Sx,  Sz,  n ]
        ];
        const b = [Sxy, Szy, Sy];

        const sol = solve3(A, b);
        if (sol) {
            const a = sol[0];
            const bz = sol[1];
            const c0 = sol[2];

            const roll = Math.atan(a);
            const pitch = -Math.atan(bz);
            const heave = c0;

            this.pose.roll = clamp(roll, -this.maxAngle, this.maxAngle);
            this.pose.pitch = clamp(pitch, -this.maxAngle, this.maxAngle);
            this.pose.heave = clamp(heave, -this.travel * 1.2, this.travel * 1.2);
        }

        // debug (cm)
        for (const k of ['fl', 'fr', 'rl', 'rr']) {
            this.debug.xActualCm[k] = this.s[k].x * 100;
            this.debug.xCmdCm[k] = this.s[k].cmd * 100;
            this.debug.xEffCm[k] = this.s[k].eff * 100;
        }
    }
}
