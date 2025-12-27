// src/physics/shared/RearAxleBicycleModel.js
/**
 * Rear-axle bicycle kinematics shared by both:
 * - legacy DriveSim (TestModeState)
 * - LocomotionSystem (Gameplay)
 *
 * Key behavior:
 * - Front wheels (steer angle) determine curvature.
 * - Motion is integrated at the REAR axle (rear wheels follow).
 * - The rendered worldRoot/anchor is positioned so the rear axle stays on the
 *   kinematic path (prevents “center pivot” turning).
 *
 * NOTE: This is purely kinematic (no tire slip model).
 */
import * as THREE from 'three';

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function expLerp(cur, target, dt, tau) {
    const t = 1 - Math.exp(-dt / Math.max(1e-4, tau));
    return cur + (target - cur) * t;
}

function moveTowards(cur, target, maxDelta) {
    const d = clamp(target - cur, -maxDelta, maxDelta);
    return cur + d;
}

function normalizeAngleRad(a) {
    // Normalize to [-PI, PI]
    a = a % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a < -Math.PI) a += Math.PI * 2;
    return a;
}

/**
 * Compute axle geometry from a BusSkeleton wheel rig.
 *
 * @param {object|null} busApi - BusSkeleton API (expects .wheelRig)
 * @param {THREE.Object3D|null} worldRoot - The anchor/root that is moved in world space
 * @param {object} [fallback]
 * @param {number} [fallback.wheelRadius=0.55]
 * @param {number} [fallback.wheelbase=5.5]
 * @returns {{
 *   wheelRadius: number,
 *   wheelbase: number,
 *   forwardSign: 1|-1,
 *   rearAxleLocal: {x:number, z:number}
 * }}
 */
export function computeWheelRigGeometry(busApi, worldRoot, fallback = {}) {
    const fallbackWheelRadius = Math.max(0.05, fallback.wheelRadius ?? 0.55);
    const fallbackWheelbase = Math.max(0.5, fallback.wheelbase ?? 5.5);

    // Default assumption: model origin roughly centered between axles.
    const defaultRearAxleLocal = { x: 0, z: -(fallbackWheelbase * 0.5) };

    const rig = busApi?.wheelRig ?? null;
    if (!rig || !worldRoot?.updateMatrixWorld || !worldRoot?.worldToLocal) {
        return {
            wheelRadius: fallbackWheelRadius,
            wheelbase: fallbackWheelbase,
            forwardSign: 1,
            rearAxleLocal: defaultRearAxleLocal
        };
    }

    worldRoot.updateMatrixWorld(true);

    const tmp = new THREE.Vector3();
    const pts = [];

    const readLocal = (w) => {
        const pivot = w?.rollPivot ?? w?.steerPivot ?? null;
        if (!pivot?.getWorldPosition) return null;
        pivot.getWorldPosition(tmp);
        return worldRoot.worldToLocal(tmp.clone());
    };

    for (const w of rig.front ?? []) {
        const p = readLocal(w);
        if (p) pts.push(p);
    }
    for (const w of rig.rear ?? []) {
        const p = readLocal(w);
        if (p) pts.push(p);
    }

    if (pts.length < 2) {
        return {
            wheelRadius: Math.max(0.05, rig.wheelRadius ?? fallbackWheelRadius),
            wheelbase: fallbackWheelbase,
            forwardSign: 1,
            rearAxleLocal: defaultRearAxleLocal
        };
    }

    const minZ = Math.min(...pts.map((p) => p.z));
    const maxZ = Math.max(...pts.map((p) => p.z));
    const midZ = (minZ + maxZ) * 0.5;

    const front = pts.filter((p) => p.z > midZ);
    const rear = pts.filter((p) => p.z <= midZ);

    const centerOf = (arr) => {
        const c = new THREE.Vector3();
        for (const p of arr) c.add(p);
        c.multiplyScalar(1 / Math.max(1, arr.length));
        return c;
    };

    // If split failed (weird rigs), fall back to extreme points.
    const frontC = front.length
        ? centerOf(front)
        : centerOf([pts.reduce((a, b) => (a.z > b.z ? a : b))]);
    const rearC = rear.length
        ? centerOf(rear)
        : centerOf([pts.reduce((a, b) => (a.z < b.z ? a : b))]);

    const forwardSign = (frontC.z >= rearC.z) ? 1 : -1;

    const wb = Math.abs(frontC.z - rearC.z);
    const wheelbase = clamp(wb || fallbackWheelbase, 2.5, 10.0);

    return {
        wheelRadius: Math.max(0.05, rig.wheelRadius ?? fallbackWheelRadius),
        wheelbase,
        forwardSign,
        rearAxleLocal: { x: rearC.x, z: rearC.z }
    };
}

/**
 * Rear-axle bicycle model integrator.
 *
 * Stores the kinematic state (rear axle position + yaw + curvature),
 * and returns the derived worldRoot (anchor) transform each step.
 */
export class RearAxleBicycleModel {
    constructor({
                    wheelbase = 5.5,
                    wheelRadius = 0.55,
                    forwardSign = 1,
                    rearAxleLocal = { x: 0, z: -2.6 },
                    yaw = 0,
                    anchorPos = { x: 0, z: 0 }
                } = {}) {
        this.wheelbase = Math.max(1e-3, wheelbase);
        this.wheelRadius = Math.max(1e-3, wheelRadius);
        this.forwardSign = (forwardSign === -1) ? -1 : 1;

        this.rearAxleLocalX = rearAxleLocal?.x ?? 0;
        this.rearAxleLocalZ = rearAxleLocal?.z ?? -this.wheelbase * 0.5;

        this.yaw = yaw;
        this.curvature = 0;
        this.curvatureSusp = 0;

        // Rear axle world position (XZ)
        this.rearPosX = 0;
        this.rearPosZ = 0;

        // Derived anchor position (XZ)
        this.anchorPosX = anchorPos?.x ?? 0;
        this.anchorPosZ = anchorPos?.z ?? 0;

        // Initialize rear position assuming current anchor position/yaw.
        this._resetRearFromAnchor(this.anchorPosX, this.anchorPosZ, this.yaw);
    }

    setGeometry({ wheelbase, wheelRadius, forwardSign, rearAxleLocal } = {}) {
        if (typeof wheelbase === 'number' && isFinite(wheelbase)) this.wheelbase = Math.max(1e-3, wheelbase);
        if (typeof wheelRadius === 'number' && isFinite(wheelRadius)) this.wheelRadius = Math.max(1e-3, wheelRadius);
        if (forwardSign === 1 || forwardSign === -1) this.forwardSign = forwardSign;
        if (rearAxleLocal && typeof rearAxleLocal === 'object') {
            if (typeof rearAxleLocal.x === 'number' && isFinite(rearAxleLocal.x)) this.rearAxleLocalX = rearAxleLocal.x;
            if (typeof rearAxleLocal.z === 'number' && isFinite(rearAxleLocal.z)) this.rearAxleLocalZ = rearAxleLocal.z;
        }
    }

    /**
     * Reset kinematics from the current worldRoot transform.
     * @param {THREE.Object3D|null} worldRoot
     */
    resetFromWorldRoot(worldRoot) {
        const yaw = worldRoot?.rotation?.y ?? 0;
        const x = worldRoot?.position?.x ?? 0;
        const z = worldRoot?.position?.z ?? 0;

        this.yaw = yaw;
        this.anchorPosX = x;
        this.anchorPosZ = z;

        this.curvature = 0;
        this.curvatureSusp = 0;

        this._resetRearFromAnchor(x, z, yaw);
    }

    _resetRearFromAnchor(anchorX, anchorZ, yaw) {
        const sin = Math.sin(yaw);
        const cos = Math.cos(yaw);

        const offX = this.rearAxleLocalX * cos + this.rearAxleLocalZ * sin;
        const offZ = -this.rearAxleLocalX * sin + this.rearAxleLocalZ * cos;

        this.rearPosX = anchorX + offX;
        this.rearPosZ = anchorZ + offZ;
    }

    /**
     * Advance the kinematic model.
     *
     * @param {object} args
     * @param {number} args.dt - seconds
     * @param {number} args.speedMps - average speed this step (m/s)
     * @param {number} args.steerAngleRad - actual steer (rad)
     * @param {number} [args.steerEffect=1.0]
     * @param {number} [args.curvatureTau=0.28]
     * @param {number} [args.curvatureMaxRate=0.22]
     * @param {number} [args.curvatureSuspTau=0.10]
     * @param {number} [args.curvatureSuspMaxRate=1.2]
     * @returns {{
     *   ds: number,
     *   yaw: number,
     *   yawRate: number,
     *   curvature: number,
     *   curvatureSusp: number,
     *   rearPosX: number,
     *   rearPosZ: number,
     *   anchorPosX: number,
     *   anchorPosZ: number,
     *   wheelSpinDelta: number
     * }}
     */
    step({
             dt,
             speedMps,
             steerAngleRad,
             steerEffect = 1.0,
             curvatureTau = 0.28,
             curvatureMaxRate = 0.22,
             curvatureSuspTau = 0.10,
             curvatureSuspMaxRate = 1.2
         }) {
        const t = Math.max(0, dt ?? 0);
        const v = speedMps ?? 0;
        const ds = v * t;

        const L = Math.max(1e-3, this.wheelbase);
        const steer = steerAngleRad ?? 0;

        // Front-steer determines curvature (rear axle bicycle model).
        // IMPORTANT: no understeer saturation here; steer limits already handle high speed.
        const curvCmd = (Math.tan(steer) * (steerEffect ?? 1.0)) / L;

        // Suspension curvature (faster response than motion curvature)
        const suspWanted = expLerp(this.curvatureSusp, curvCmd, t, curvatureSuspTau);
        this.curvatureSusp = moveTowards(
            this.curvatureSusp,
            suspWanted,
            Math.max(1e-4, curvatureSuspMaxRate) * t
        );

        // Motion curvature (lag + rate limit)
        const wanted = expLerp(this.curvature, curvCmd, t, curvatureTau);
        this.curvature = moveTowards(
            this.curvature,
            wanted,
            Math.max(1e-4, curvatureMaxRate) * t
        );

        // Update yaw
        const yawRate = v * this.curvature;
        this.yaw = normalizeAngleRad(this.yaw + yawRate * t);

        // Advance rear axle along heading (rear wheels "follow")
        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);

        this.rearPosX += sin * ds * this.forwardSign;
        this.rearPosZ += cos * ds * this.forwardSign;

        // Compute anchor position so the rear axle point lands on the kinematic rear position
        const offX = this.rearAxleLocalX * cos + this.rearAxleLocalZ * sin;
        const offZ = -this.rearAxleLocalX * sin + this.rearAxleLocalZ * cos;

        this.anchorPosX = this.rearPosX - offX;
        this.anchorPosZ = this.rearPosZ - offZ;

        const r = Math.max(1e-3, this.wheelRadius);
        const wheelSpinDelta = (ds * this.forwardSign) / r;

        return {
            ds,
            yaw: this.yaw,
            yawRate,
            curvature: this.curvature,
            curvatureSusp: this.curvatureSusp,
            rearPosX: this.rearPosX,
            rearPosZ: this.rearPosZ,
            anchorPosX: this.anchorPosX,
            anchorPosZ: this.anchorPosZ,
            wheelSpinDelta
        };
    }
}
