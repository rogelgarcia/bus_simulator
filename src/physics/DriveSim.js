// src/physics/DriveSim.js
/**
 * @deprecated This file is part of the legacy architecture.
 * Use LocomotionSystem from src/physics/systems/LocomotionSystem.js instead.
 * This file is kept for TestModeState (debug tool).
 */
import * as THREE from 'three';

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function avg(list) {
    if (!list.length) return 0;
    let s = 0;
    for (const x of list) s += x;
    return s / list.length;
}
function expLerp(cur, target, dt, tau) {
    const t = 1 - Math.exp(-dt / Math.max(1e-4, tau));
    return cur + (target - cur) * t;
}
function moveTowards(cur, target, maxDelta) {
    const d = clamp(target - cur, -maxDelta, maxDelta);
    return cur + d;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export class DriveSim {
    constructor(tuning = {}) {
        this.api = null;
        this.worldRoot = null;
        this.suspension = null;

        this._baseY = 0;

        this._curvSusp = 0;

        // wheel/ground speed
        this.speed = 0;            // m/s
        this.targetSpeed = 0;      // m/s

        // yaw of the whole bus in world (applied to worldRoot)
        this.yaw = 0;

        // model forward: +1 means front axle is +Z of worldRoot local, -1 means front is -Z
        this.forwardSign = 1;

        // geometry
        this.wheelRadius = 0.55;
        this.wheelbase = 5.5;

        // steering command vs actual (slew-limited)
        this._steerCmd = 0;
        this._steer = 0;           // actual applied steer (rad)

        // actual curvature (lags command)
        this._curv = 0;            // 1/m

        // accel from wheel speed, and accel fed to suspension (held/filtered)
        this.longAccel = 0;        // m/s^2 (wheel kinematics)
        this._aLongSusp = 0;       // m/s^2 (body inertia)

        this.releaseMode = false;

        // rear axle pivot tracking
        this._rearAxleLocal = new THREE.Vector3(0, 0, -2.6); // in worldRoot local space
        this._rearPosWorld = new THREE.Vector3();            // desired rear axle world position

        // stop inertia hold / release bump
        this._stopHoldT = 0;
        this._stopHoldALong = 0;
        this._stopReboundT = 0;

        this.tuning = {
            maxSpeedKph: 80,

            // ✅ if you ever want to flip input direction, do it per-bus in userData.driveTuning
            // driveTuning: { invertSteer: true }
            invertSteer: false,

            // steering limits
            maxSteerDeg: 55,
            minSteerDegAtMaxSpeed: 16,
            steerSpeedCurve: 1.3,
            steerEffect: 1.0,

            // steering slew
            steerRateDegPerSec: 140,

            // understeer saturation
            understeerK: 0.0028,

            // curvature inertia
            curvatureTau: 0.28,
            curvatureMaxRate: 0.22, // 1/m per sec

            urvatureSuspTau: 0.10,        // faster than curvatureTau
            curvatureSuspMaxRate: 1.2,     // faster than curvatureMaxRate

            // acceleration curve (fast at start, tapers)
            maxAccel0: 2.2,
            maxAccelAtMaxSpeed: 0.55,
            accelSpeedCurve: 1.2,
            accelKp: 0.60,

            // braking
            maxBrake: 4.4,
            brakeKp: 0.90,

            // resistances
            rollingResistance: 0.22,
            dragCoeff: 0.0022,
            engineBrake: 0.25,

            // stop behavior
            fullBrakeTargetEps: 0.05,
            brakeSnapSpeed: 0.14,
            coastSnapSpeed: 0.03,

            // body inertia hold after wheel lock
            stopHoldDuration: 0.22,
            stopHoldBrakeScale: 0.85,

            // tiny single release bump after hold
            stopReboundDuration: 0.14,
            stopReboundAccel: 0.25,

            // filter for what suspension sees
            aLongSuspTau: 0.06,

            ...tuning
        };
    }

    bind(api, worldRoot, suspension = null) {
        this._curvSusp = 0;
        this.api = api ?? null;
        this.worldRoot = worldRoot ?? null;
        this.suspension = suspension ?? null;

        if (!this.api || !this.worldRoot) return;

        this.worldRoot.updateMatrixWorld(true);

        this._baseY = this.worldRoot.position.y;
        this.yaw = this.worldRoot.rotation.y ?? 0;

        this.wheelRadius = Math.max(0.05, this.api?.wheelRig?.wheelRadius ?? this.wheelRadius);

        this._configureFromBus();
        this._computeAxlesFromRig(); // rear axle local + wheelbase + forwardSign

        // init rear axle world pos
        this._rearPosWorld.copy(this._rearAxleLocal);
        this._rearPosWorld.applyAxisAngle(Y_AXIS, this.yaw);
        this._rearPosWorld.add(this.worldRoot.position);

        // reset dynamics
        this.speed = 0;
        this.targetSpeed = 0;
        this.releaseMode = false;

        this._steerCmd = 0;
        this._steer = 0;

        this._curv = 0;

        this.longAccel = 0;
        this._aLongSusp = 0;

        this._stopHoldT = 0;
        this._stopHoldALong = 0;
        this._stopReboundT = 0;
    }

    setTargetSpeedKph(kph) {
        const maxKph = Math.max(1, this.tuning.maxSpeedKph ?? 80);
        const clamped = clamp(kph ?? 0, 0, maxKph);
        this.targetSpeed = clamped / 3.6;
    }

    setSteerAngleRad(rad) {
        this._steerCmd = rad ?? 0;
    }

    setReleaseMode(on) {
        this.releaseMode = !!on;
    }

    get speedKph() {
        return this.speed * 3.6;
    }

    _configureFromBus() {
        const overrides = this.api?.root?.userData?.driveTuning ?? null;
        if (overrides && typeof overrides === 'object') {
            this.tuning = { ...this.tuning, ...overrides };
        }
    }

    _computeAxlesFromRig() {
        const rig = this.api?.wheelRig;
        if (!rig || (!rig.front?.length && !rig.rear?.length)) return;

        this.worldRoot.updateMatrixWorld(true);

        const tmp = new THREE.Vector3();
        const pts = [];

        const readLocal = (w) => {
            const pivot = w?.rollPivot ?? w?.steerPivot;
            if (!pivot) return null;
            pivot.getWorldPosition(tmp);
            return this.worldRoot.worldToLocal(tmp.clone());
        };

        for (const w of rig.front ?? []) {
            const p = readLocal(w);
            if (p) pts.push(p);
        }
        for (const w of rig.rear ?? []) {
            const p = readLocal(w);
            if (p) pts.push(p);
        }

        if (pts.length < 2) return;

        const minZ = Math.min(...pts.map((p) => p.z));
        const maxZ = Math.max(...pts.map((p) => p.z));
        const midZ = (minZ + maxZ) / 2;

        const front = pts.filter((p) => p.z > midZ);
        const rear = pts.filter((p) => p.z <= midZ);

        if (front.length < 1 || rear.length < 1) return;

        const centerOf = (arr) => {
            const c = new THREE.Vector3();
            for (const p of arr) c.add(p);
            c.multiplyScalar(1 / arr.length);
            return c;
        };

        const frontC = centerOf(front);
        const rearC = centerOf(rear);

        this.forwardSign = (frontC.z >= rearC.z) ? 1 : -1;

        const wb = Math.abs(frontC.z - rearC.z);
        this.wheelbase = clamp(wb || this.wheelbase, 2.5, 10.0);

        this._rearAxleLocal.copy(rearC);
    }

    fixedUpdate(dtRaw) {
        const dt = clamp(dtRaw ?? 0, 0, 1 / 30);
        if (!dt || !this.api || !this.worldRoot) return;

        const v0 = this.speed;

        const maxSpeed = (this.tuning.maxSpeedKph ?? 80) / 3.6;
        const vTarget = this.releaseMode ? 0 : clamp(this.targetSpeed, 0, maxSpeed);

        const brakeToStop = (!this.releaseMode && vTarget <= (this.tuning.fullBrakeTargetEps ?? 0.05));

        // ----------------------------
        // accel/brake command
        // ----------------------------
        let aCmd = 0;

        const speed01 = maxSpeed > 1e-3 ? clamp(v0 / maxSpeed, 0, 1) : 0;
        const accelAvail = THREE.MathUtils.lerp(
            this.tuning.maxAccel0 ?? 2.2,
            this.tuning.maxAccelAtMaxSpeed ?? 0.55,
            Math.pow(speed01, this.tuning.accelSpeedCurve ?? 1.2)
        );

        if (this.releaseMode) {
            aCmd = 0;
        } else if (brakeToStop && v0 > 0.0001) {
            aCmd = -(this.tuning.maxBrake ?? 4.4);
        } else {
            const err = vTarget - v0;
            if (err >= 0) {
                aCmd = clamp(err * (this.tuning.accelKp ?? 0.6), 0, accelAvail);
            } else {
                aCmd = clamp(err * (this.tuning.brakeKp ?? 0.9), -(this.tuning.maxBrake ?? 4.4), 0);
            }
        }

        // resistances
        const rr = (this.tuning.rollingResistance ?? 0.22);
        const drag = (this.tuning.dragCoeff ?? 0.0022) * v0 * v0;
        const eng = (!this.releaseMode && vTarget <= 0.05) ? (this.tuning.engineBrake ?? 0.25) : 0;

        const resist = rr + drag + eng;

        let a = aCmd;
        if (v0 > 0.001) a -= resist;

        // integrate speed
        let v1 = v0 + a * dt;

        let snappedToZero = false;
        const brakeSnapSpeed = this.tuning.brakeSnapSpeed ?? 0.14;

        if (brakeToStop && !this.releaseMode && v1 <= brakeSnapSpeed) {
            if (v0 > 0.001) snappedToZero = true;
            v1 = 0;
        } else if (v1 <= 0) {
            if (v0 > 0.001) snappedToZero = true;
            v1 = 0;
        }

        if (this.releaseMode && v1 < (this.tuning.coastSnapSpeed ?? 0.03)) v1 = 0;

        this.speed = v1;
        this.longAccel = (v1 - v0) / dt;

        // stop inertia hold (keeps nose down after wheel lock)
        if (snappedToZero && brakeToStop && !this.releaseMode) {
            this._stopHoldT = Math.max(0, this.tuning.stopHoldDuration ?? 0.22);
            this._stopHoldALong = -(Math.abs(this.tuning.maxBrake ?? 4.4) * (this.tuning.stopHoldBrakeScale ?? 0.85));
            this._stopReboundT = 0;
        }

        let aLongTarget = this.longAccel;

        if (this.speed === 0 && this._stopHoldT > 0) {
            this._stopHoldT -= dt;
            aLongTarget = this._stopHoldALong;

            if (this._stopHoldT <= 0) {
                this._stopReboundT = Math.max(0, this.tuning.stopReboundDuration ?? 0.14);
            }
        } else if (this.speed === 0 && this._stopReboundT > 0) {
            const dur = Math.max(1e-4, this.tuning.stopReboundDuration ?? 0.14);
            const u = clamp(this._stopReboundT / dur, 0, 1);
            aLongTarget = (this.tuning.stopReboundAccel ?? 0.25) * u;
            this._stopReboundT -= dt;
        } else if (this.speed === 0 && brakeToStop) {
            aLongTarget = 0;
        }

        // filter suspension accel
        this._aLongSusp = expLerp(this._aLongSusp, aLongTarget, dt, this.tuning.aLongSuspTau ?? 0.06);

        const vAvg = (v0 + v1) * 0.5;
        const ds = vAvg * dt;

        // ----------------------------
        // steering: speed-dependent max + slew rate
        // ----------------------------
        const maxSteerDeg = (this.tuning.maxSteerDeg ?? 55);
        const minSteerDeg = (this.tuning.minSteerDegAtMaxSpeed ?? 16);

        const s01 = maxSpeed > 1e-3 ? clamp(vAvg / maxSpeed, 0, 1) : 0;
        const pow = this.tuning.steerSpeedCurve ?? 1.3;
        const t = Math.pow(s01, pow);

        const maxSteerDynDeg = THREE.MathUtils.lerp(maxSteerDeg, minSteerDeg, t);
        const maxSteerDyn = THREE.MathUtils.degToRad(maxSteerDynDeg);

        const steerInput = (this.tuning.invertSteer ? -this._steerCmd : this._steerCmd);
        const steerCmdClamped = clamp(steerInput, -maxSteerDyn, maxSteerDyn);

        const steerRate = THREE.MathUtils.degToRad(this.tuning.steerRateDegPerSec ?? 140);
        this._steer = moveTowards(this._steer, steerCmdClamped, steerRate * dt);

        // apply actual steer to wheels (visuals == physics)
        this.api?.setSteerAngle?.(this._steer);

        // ----------------------------
        // ✅ REAR-AXLE bicycle kinematics (NO rear slip)
        // ----------------------------
        const L = Math.max(1e-3, this.wheelbase);

        // ✅ FIX: DO NOT negate by forwardSign — it was flipping the turn direction
        const steerEff = (this.tuning.steerEffect ?? 1.0);
        let curvCmd = (Math.tan(this._steer) * steerEff) / L;

        // understeer: reduce curvature with v^2
        const K = this.tuning.understeerK ?? 0.0028;
        curvCmd = curvCmd / (1 + K * vAvg * vAvg);

        // --- suspension curvature (faster response than motion curvature) ---
        const curvSuspTau = this.tuning.curvatureSuspTau ?? 0.10;
        const curvSuspWanted = expLerp(this._curvSusp, curvCmd, dt, curvSuspTau);

        const curvSuspMaxRate = Math.max(1e-4, this.tuning.curvatureSuspMaxRate ?? 1.2);
        this._curvSusp = moveTowards(this._curvSusp, curvSuspWanted, curvSuspMaxRate * dt);

        // inertia + rate limit
        const curvTau = this.tuning.curvatureTau ?? 0.28;
        const curvWanted = expLerp(this._curv, curvCmd, dt, curvTau);

        const maxRate = Math.max(1e-4, this.tuning.curvatureMaxRate ?? 0.22);
        this._curv = moveTowards(this._curv, curvWanted, maxRate * dt);

        // yaw update
        const yawRate = vAvg * this._curv;
        this.yaw += yawRate * dt;

        // rear axle moves along bus heading (no lateral slip at rear)
        const forwardLocal = new THREE.Vector3(0, 0, this.forwardSign);
        const forwardWorld = forwardLocal.applyAxisAngle(Y_AXIS, this.yaw);
        forwardWorld.y = 0;
        forwardWorld.normalize();

        this._rearPosWorld.addScaledVector(forwardWorld, ds);

        // set worldRoot rotation
        this.worldRoot.rotation.y = this.yaw;

        // position worldRoot so rear axle point lands on _rearPosWorld
        const rearOffsetWorld = this._rearAxleLocal.clone().applyAxisAngle(Y_AXIS, this.yaw);

        this.worldRoot.position.x = this._rearPosWorld.x - rearOffsetWorld.x;
        this.worldRoot.position.z = this._rearPosWorld.z - rearOffsetWorld.z;
        this.worldRoot.position.y = this._baseY;

        // wheel spin from travel
        const r = Math.max(1e-3, this.wheelRadius);
        const dSpin = (ds * this.forwardSign) / r;
        this.api?.addWheelSpin?.(dSpin);

        // lateral accel for suspension
        const aLat = (vAvg * vAvg) * this._curvSusp;


        this.suspension?.setChassisAccel?.({
            aLat,
            aLong: this._aLongSusp
        });
    }
}
