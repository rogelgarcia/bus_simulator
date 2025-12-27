// src/physics/systems/SuspensionSystem.js
function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

function expLerp(cur, target, dt, tau) {
    const t = 1 - Math.exp(-dt / Math.max(1e-4, tau));
    return cur + (target - cur) * t;
}

function moveTowards(cur, target, maxDelta) {
    const d = clamp(target - cur, -maxDelta, maxDelta);
    return cur + d;
}

/**
 * 3x3 determinant for plane fitting.
 */
function det3(m) {
    return (
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
        m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
        m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    );
}

/**
 * Solve 3x3 linear system using Cramer's rule.
 */
function solve3(A, b) {
    const detA = det3(A);
    if (Math.abs(detA) < 1e-10) return null;

    const A1 = [[b[0], A[0][1], A[0][2]], [b[1], A[1][1], A[1][2]], [b[2], A[2][1], A[2][2]]];
    const A2 = [[A[0][0], b[0], A[0][2]], [A[1][0], b[1], A[1][2]], [A[2][0], b[2], A[2][2]]];
    const A3 = [[A[0][0], A[0][1], b[0]], [A[1][0], A[1][1], b[1]], [A[2][0], A[2][1], b[2]]];

    return [det3(A1) / detA, det3(A2) / detA, det3(A3) / detA];
}

/**
 * Default suspension configuration (bus-like).
 */
const DEFAULT_CONFIG = {
    // Spring-damper parameters
    stiffness: 360,          // N/m (spring constant k)
    damping: 140,            // Ns/m (damping coefficient c)
    mass: 18.0,              // kg (sprung mass per corner)

    // Travel limits
    travel: 0.22,            // m (max compression/extension)
    maxAngleDeg: 14,         // degrees (max pitch/roll)

    // Load transfer
    cgHeightM: 1.15,         // m (center of gravity height)
    latGain: 1.75,           // Lateral load transfer gain
    longGain: 2.15,          // Longitudinal load transfer gain
    maxTransferG: 1.05,      // Max G-force for transfer calculation

    // Transfer dynamics
    latTransferTau: 0.26,    // Time constant for lateral transfer
    longTransferTau: 0.16,   // Time constant for longitudinal transfer
    latBiasMaxRate: 0.24,    // Max rate for lateral bias change
    longBiasMaxRate: 0.45,   // Max rate for longitudinal bias change

    // Nonlinear damping
    damperNonlinear: 1.35,   // Nonlinear damping multiplier
    damperNonlinearV0: 0.35, // Reference velocity for nonlinear damping

    // Progressive spring stiffness
    springNonlinear: 2.0,    // Progressive spring multiplier
    springNonlinearPow: 2.0, // Power curve for progressive spring

    // Geometry (defaults, overridden by vehicle)
    track: 2.4,              // m (distance between left/right wheels)
    wheelbase: 5.5           // m (distance between front/rear axles)
};

/**
 * SuspensionSystem handles 4-corner spring-damper simulation.
 *
 * Responsibilities:
 * - Spring-damper physics per wheel
 * - Load transfer from acceleration
 * - Body pitch/roll/heave calculation
 * - Progressive spring stiffness
 * - Nonlinear damping
 */
export class SuspensionSystem {
    constructor(config = {}) {
        /** @type {Map<string, object>} */
        this.vehicles = new Map();

        /** @type {object} */
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Register a vehicle with this system.
     * @param {object} vehicle - Vehicle instance with { id, api, anchor }
     */
    addVehicle(vehicle) {
        if (!vehicle?.id) return;

        const c = this.config;

        this.vehicles.set(vehicle.id, {
            vehicle,
            api: vehicle.api ?? null,
            anchor: vehicle.anchor ?? null,

            // Per-wheel spring state
            springs: {
                fl: { x: 0, v: 0, cmd: 0, eff: 0 },
                fr: { x: 0, v: 0, cmd: 0, eff: 0 },
                rl: { x: 0, v: 0, cmd: 0, eff: 0 },
                rr: { x: 0, v: 0, cmd: 0, eff: 0 }
            },

            // Wheel positions (local coordinates)
            wheelPos: {
                fl: { x: -1.2, z: 2.6 },
                fr: { x: 1.2, z: 2.6 },
                rl: { x: -1.2, z: -2.6 },
                rr: { x: 1.2, z: -2.6 }
            },

            // Body pose output
            pose: { pitch: 0, roll: 0, heave: 0 },

            // Chassis acceleration input
            chassisAccel: { lateral: 0, longitudinal: 0 },

            // Load transfer bias (smoothed)
            latBias: 0,
            longBias: 0,

            // Geometry
            track: c.track,
            wheelbase: c.wheelbase
        });
    }

    /**
     * Unregister a vehicle from this system.
     * @param {string} vehicleId
     */
    removeVehicle(vehicleId) {
        this.vehicles.delete(vehicleId);
    }

    /**
     * Set chassis acceleration for load transfer calculation.
     * @param {string} vehicleId
     * @param {number} aLat - Lateral acceleration (m/s²)
     * @param {number} aLong - Longitudinal acceleration (m/s²)
     */
    setChassisAcceleration(vehicleId, aLat, aLong) {
        const state = this.vehicles.get(vehicleId);
        if (!state) return;
        state.chassisAccel.lateral = aLat ?? 0;
        state.chassisAccel.longitudinal = aLong ?? 0;
    }

    /**
     * Set wheel compression command (from collision system).
     * @param {string} vehicleId
     * @param {string} wheel - 'fl', 'fr', 'rl', 'rr'
     * @param {number} compression - Compression in meters
     */
    setWheelCompression(vehicleId, wheel, compression) {
        const state = this.vehicles.get(vehicleId);
        if (!state || !state.springs[wheel]) return;
        state.springs[wheel].cmd = compression ?? 0;
    }

    /**
     * Apply curb impact to a wheel (creates bounce effect).
     * Call this when a wheel transitions onto/off a curb.
     * @param {string} vehicleId
     * @param {string} wheel - 'fl', 'fr', 'rl', 'rr'
     * @param {number} heightDelta - Height change in meters (positive = up onto curb)
     * @param {object} [options]
     * @param {number} [options.impactKick=10.0] - Velocity multiplier for impact
     * @param {number} [options.maxVelocity=3.0] - Max spring velocity
     */
    applyCurbImpact(vehicleId, wheel, heightDelta, options = {}) {
        const state = this.vehicles.get(vehicleId);
        if (!state || !state.springs[wheel]) return;

        const dh = heightDelta ?? 0;
        if (Math.abs(dh) < 1e-6) return;

        const impactKick = options.impactKick ?? 10.0;
        const maxVelocity = options.maxVelocity ?? 3.0;
        const c = this.config;

        const sp = state.springs[wheel];

        // 1) Instant spring compression/extension by curb delta
        sp.x = clamp((sp.x ?? 0) + dh, -c.travel, c.travel);

        // 2) Shift equilibrium so pose stays inclined on curb
        sp.cmd = clamp((sp.cmd ?? 0) + dh, -c.travel, c.travel);

        // 3) Add velocity kick for bounce effect
        // Up step (dh>0): kick negative => starts decompressing
        // Down step (dh<0): kick positive => starts compressing
        const v = (sp.v ?? 0) - dh * impactKick;
        sp.v = clamp(v, -maxVelocity, maxVelocity);
    }

    /**
     * Fixed timestep update.
     * @param {number} dt - Delta time in seconds
     */
    fixedUpdate(dt) {
        if (dt <= 0) return;

        for (const state of this.vehicles.values()) {
            this._updateSuspension(state, dt);
        }
    }

    /**
     * Update suspension for a single vehicle.
     * @param {object} s - Vehicle state
     * @param {number} dt - Delta time
     */
    _updateSuspension(s, dt) {
        const c = this.config;
        const g = 9.81;

        // Calculate load transfer biases
        const latG = clamp(s.chassisAccel.lateral / g, -c.maxTransferG, c.maxTransferG);
        const longG = clamp(s.chassisAccel.longitudinal / g, -c.maxTransferG, c.maxTransferG);

        const track = Math.max(1.2, s.track);
        const wb = Math.max(2.6, s.wheelbase);
        const cg = Math.max(0.4, c.cgHeightM);

        const latBiasTarget = latG * c.travel * c.latGain * (cg / track);
        const longBiasTarget = longG * c.travel * c.longGain * (cg / wb);

        // Smooth bias changes
        const latWanted = expLerp(s.latBias, latBiasTarget, dt, c.latTransferTau);
        const longWanted = expLerp(s.longBias, longBiasTarget, dt, c.longTransferTau);

        s.latBias = moveTowards(s.latBias, latWanted, c.latBiasMaxRate * dt);
        s.longBias = moveTowards(s.longBias, longWanted, c.longBiasMaxRate * dt);

        // Calculate effective targets with load transfer
        const frontBias = -s.longBias;
        const rearBias = +s.longBias;

        const effTargets = {
            fl: clamp(s.springs.fl.cmd + frontBias + s.latBias, -c.travel, c.travel),
            fr: clamp(s.springs.fr.cmd + frontBias - s.latBias, -c.travel, c.travel),
            rl: clamp(s.springs.rl.cmd + rearBias + s.latBias, -c.travel, c.travel),
            rr: clamp(s.springs.rr.cmd + rearBias - s.latBias, -c.travel, c.travel)
        };

        // Integrate springs
        for (const key of ['fl', 'fr', 'rl', 'rr']) {
            const sp = s.springs[key];
            const target = effTargets[key];
            sp.eff = target;

            // Nonlinear damping
            const vAbs = Math.abs(sp.v);
            const v0 = Math.max(1e-3, c.damperNonlinearV0);
            const dGain = 1 + (c.damperNonlinear * clamp(vAbs / v0, 0, 2.5));
            const cEff = c.damping * dGain;

            // Progressive spring stiffness
            const tr = Math.max(1e-4, c.travel);
            const xN = clamp(Math.abs(sp.x) / tr, 0, 2.0);
            const kGain = 1 + (c.springNonlinear * Math.pow(xN, c.springNonlinearPow));
            const kEff = c.stiffness * kGain;

            // Spring-damper equation: a = (k*(target-x) - c*v) / m
            const a = (kEff * (target - sp.x) - cEff * sp.v) / Math.max(1e-6, c.mass);

            sp.v += a * dt;
            sp.x += sp.v * dt;

            // Clamp to travel limits
            sp.x = clamp(sp.x, -c.travel, c.travel);
        }

        // Calculate body pose from plane fit
        this._calculatePose(s);
    }

    /**
     * Calculate body pitch/roll/heave from wheel compressions.
     * Uses least-squares plane fitting.
     * @param {object} s - Vehicle state
     */
    _calculatePose(s) {
        const c = this.config;

        // Points: wheel positions with compression as Y
        const pts = [
            { x: s.wheelPos.fl.x, z: s.wheelPos.fl.z, y: -s.springs.fl.x },
            { x: s.wheelPos.fr.x, z: s.wheelPos.fr.z, y: -s.springs.fr.x },
            { x: s.wheelPos.rl.x, z: s.wheelPos.rl.z, y: -s.springs.rl.x },
            { x: s.wheelPos.rr.x, z: s.wheelPos.rr.z, y: -s.springs.rr.x }
        ];

        // Build least-squares matrix
        let Sxx = 0, Sxz = 0, Sx = 0, Szz = 0, Sz = 0, Sy = 0, Sxy = 0, Szy = 0;
        const n = pts.length;

        for (const p of pts) {
            Sxx += p.x * p.x;
            Sxz += p.x * p.z;
            Sx += p.x;
            Szz += p.z * p.z;
            Sz += p.z;
            Sy += p.y;
            Sxy += p.x * p.y;
            Szy += p.z * p.y;
        }

        const A = [
            [Sxx, Sxz, Sx],
            [Sxz, Szz, Sz],
            [Sx, Sz, n]
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

            const maxAngle = c.maxAngleDeg * Math.PI / 180;

            s.pose.roll = clamp(roll, -maxAngle, maxAngle);
            s.pose.pitch = clamp(pitch, -maxAngle, maxAngle);
            s.pose.heave = clamp(heave, -c.travel * 1.2, c.travel * 1.2);
        }
    }

    /**
     * Get the current state for a vehicle.
     * @param {string} vehicleId
     * @returns {object|null}
     */
    getState(vehicleId) {
        const state = this.vehicles.get(vehicleId);
        if (!state) return null;

        return {
            suspensionCompression: {
                fl: state.springs.fl.x,
                fr: state.springs.fr.x,
                rl: state.springs.rl.x,
                rr: state.springs.rr.x
            },
            bodyPitch: state.pose.pitch,
            bodyRoll: state.pose.roll,
            bodyHeave: state.pose.heave,
            latBias: state.latBias,
            longBias: state.longBias
        };
    }
}

