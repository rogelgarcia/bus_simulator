// src/physics/systems/LocomotionSystem.js

import { computeWheelRigGeometry, RearAxleBicycleModel } from '../shared/RearAxleBicycleModel.js';

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

function moveTowards(current, target, maxDelta) {
    const diff = target - current;
    if (Math.abs(diff) <= maxDelta) return target;
    return current + Math.sign(diff) * maxDelta;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function degToRad(deg) {
    return deg * Math.PI / 180;
}

/**
 * Default locomotion configuration.
 */
const DEFAULT_CONFIG = {
    // Speed limits
    maxSpeedKph: 80,

    // Acceleration curve (fast at start, tapers at high speed)
    maxAccel0: 2.2,              // m/s² at 0 speed
    maxAccelAtMaxSpeed: 0.55,    // m/s² at max speed
    accelSpeedCurve: 1.2,        // Power curve exponent
    accelKp: 0.60,               // Proportional gain for acceleration

    // Braking
    maxBrake: 4.4,               // m/s² max braking
    brakeKp: 0.90,               // Proportional gain for braking

    // Resistances
    rollingResistance: 0.22,     // m/s² constant resistance
    dragCoeff: 0.0022,           // Aerodynamic drag coefficient
    engineBrake: 0.25,           // Engine braking when coasting

    // Stop behavior
    brakeSnapSpeed: 0.14,        // Speed below which we snap to 0
    coastSnapSpeed: 0.03,        // Speed below which coasting stops

    // Steering
    maxSteerDeg: 55,             // Max steering angle at low speed
    minSteerDegAtMaxSpeed: 16,   // Max steering angle at max speed
    steerSpeedCurve: 1.3,        // Power curve for speed-dependent steering
    steerRateDegPerSec: 140,     // Steering slew rate
    steerEffect: 1.0,            // Steering effectiveness multiplier

    // Curvature inertia (shared with DriveSim)
    curvatureTau: 0.28,          // Time constant for curvature lag
    curvatureMaxRate: 0.22,      // Max curvature change rate (1/m per sec)

    // Suspension curvature response (faster than motion curvature)
    curvatureSuspTau: 0.10,
    curvatureSuspMaxRate: 1.2,

    // Geometry (defaults, overridden by vehicle/rig)
    wheelbase: 5.5,              // Distance between axles (m)
    wheelRadius: 0.55            // Wheel radius (m)
};

/**
 * LocomotionSystem handles vehicle movement and steering.
 *
 * Responsibilities:
 * - Speed control (acceleration, braking, coasting)
 * - Steering + turning using a REAR-AXLE bicycle model (no center-pivot)
 * - Position/yaw integration
 * - Wheel spin calculation
 * - Longitudinal acceleration output (for suspension)
 */
export class LocomotionSystem {
    constructor(config = {}) {
        /** @type {Map<string, object>} */
        this.vehicles = new Map();

        /** @type {object} */
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Register a vehicle with this system.
     * @param {object} vehicleData - Vehicle registration object (expects { id, vehicle, api, anchor })
     */
    addVehicle(vehicleData) {
        if (!vehicleData?.id) return;

        const c = this.config;

        const vehicleCfg = vehicleData.vehicle ?? null;
        const api = vehicleData.api ?? null;
        const anchor = vehicleData.anchor ?? null;

        // Start transform (so we don't "snap" on first frame)
        const startX = anchor?.position?.x ?? 0;
        const startY = anchor?.position?.y ?? 0;
        const startZ = anchor?.position?.z ?? 0;
        const startYaw = anchor?.rotation?.y ?? 0;

        // Base geometry from config (if provided)
        let wheelbase = c.wheelbase;
        let wheelRadius = c.wheelRadius;

        if (vehicleCfg && typeof vehicleCfg === 'object') {
            if (typeof vehicleCfg.wheelbase === 'number' && isFinite(vehicleCfg.wheelbase)) {
                wheelbase = clamp(vehicleCfg.wheelbase, 2.5, 10.0);
            }
            if (typeof vehicleCfg.wheelRadius === 'number' && isFinite(vehicleCfg.wheelRadius)) {
                wheelRadius = Math.max(0.05, vehicleCfg.wheelRadius);
            }
        }

        // Prefer wheel-rig-derived geometry when possible (matches DriveSim/TestMode)
        const geom = computeWheelRigGeometry(api, anchor, { wheelbase, wheelRadius });

        const kin = new RearAxleBicycleModel({
            wheelbase: geom.wheelbase,
            wheelRadius: geom.wheelRadius,
            forwardSign: geom.forwardSign,
            rearAxleLocal: geom.rearAxleLocal,
            yaw: startYaw,
            anchorPos: { x: startX, z: startZ }
        });

        this.vehicles.set(vehicleData.id, {
            vehicle: vehicleData,
            api,
            anchor,

            // Speed state
            speed: 0,              // Current speed (m/s)
            targetSpeed: 0,        // Target speed (m/s)
            longAccel: 0,          // Longitudinal acceleration (m/s²)

            // Steering state
            steerCmd: 0,           // Commanded steer angle (rad)
            steerAngle: 0,         // Actual steer angle (rad)

            // Kinematic outputs (anchor pose)
            yaw: startYaw,
            position: { x: startX, y: startY, z: startZ },

            // Curvatures (for debug + suspension)
            curvature: 0,
            curvatureSusp: 0,

            // Geometry
            wheelbase: geom.wheelbase,
            wheelRadius: geom.wheelRadius,
            forwardSign: geom.forwardSign,

            // Shared rear-axle model (the important part)
            _kin: kin,

            // Input
            input: { throttle: 0, brake: 0, steering: 0 },

            // External brake force (from BrakeSystem)
            externalBrakeForce: 0,

            // Wheel spin accumulator
            wheelSpinAccum: 0
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
     * Set input for a vehicle.
     * @param {string} vehicleId
     * @param {object} input - { throttle, brake, steering }
     */
    setInput(vehicleId, input) {
        const state = this.vehicles.get(vehicleId);
        if (!state) return;

        if (typeof input.throttle === 'number') {
            state.input.throttle = clamp(input.throttle, 0, 1);
        }
        if (typeof input.brake === 'number') {
            state.input.brake = clamp(input.brake, 0, 1);
        }
        if (typeof input.steering === 'number') {
            state.input.steering = clamp(input.steering, -1, 1);
        }
    }

    /**
     * Set external brake force (from BrakeSystem).
     * @param {string} vehicleId
     * @param {number} force - Brake deceleration (m/s²)
     */
    setExternalBrakeForce(vehicleId, force) {
        const state = this.vehicles.get(vehicleId);
        if (!state) return;
        state.externalBrakeForce = Math.max(0, force ?? 0);
    }

    /**
     * Fixed timestep update.
     * @param {number} dt - Delta time in seconds
     */
    fixedUpdate(dt) {
        if (dt <= 0) return;

        for (const state of this.vehicles.values()) {
            this._updateVehicle(state, dt);
        }
    }

    /**
     * Update a single vehicle.
     * @param {object} s - Vehicle state
     * @param {number} dt - Delta time
     */
    _updateVehicle(s, dt) {
        const c = this.config;
        const v0 = s.speed;

        // Calculate target speed from throttle input
        const maxSpeed = (c.maxSpeedKph) / 3.6;
        const targetSpeed = s.input.throttle * maxSpeed;
        s.targetSpeed = targetSpeed;

        // Determine if we're braking to stop
        const brakeToStop = s.input.brake > 0.5 || s.externalBrakeForce > 2;

        // Calculate acceleration command
        let aCmd = 0;
        const speed01 = maxSpeed > 1e-3 ? clamp(v0 / maxSpeed, 0, 1) : 0;
        const accelAvail = lerp(
            c.maxAccel0,
            c.maxAccelAtMaxSpeed,
            Math.pow(speed01, c.accelSpeedCurve)
        );

        if (brakeToStop && v0 > 0.0001) {
            // Full braking
            aCmd = -Math.max(c.maxBrake, s.externalBrakeForce);
        } else {
            // Speed control
            const err = targetSpeed - v0;
            if (err >= 0) {
                aCmd = clamp(err * c.accelKp, 0, accelAvail);
            } else {
                aCmd = clamp(err * c.brakeKp, -c.maxBrake, 0);
            }
        }

        // Apply resistances
        const rolling = v0 > 0.001 ? c.rollingResistance : 0;
        const drag = c.dragCoeff * v0 * v0;
        const engineBrake = (targetSpeed <= 0.05 && v0 > 0.1) ? c.engineBrake : 0;
        const resist = rolling + drag + engineBrake;

        let a = aCmd;
        if (v0 > 0.001) a -= resist;

        // Integrate speed
        let v1 = v0 + a * dt;

        // Snap to zero at low speeds
        if (brakeToStop && v1 <= c.brakeSnapSpeed) {
            v1 = 0;
        } else if (v1 <= 0) {
            v1 = 0;
        }

        if (s.input.throttle < 0.01 && v1 < c.coastSnapSpeed) {
            v1 = 0;
        }

        s.speed = v1;
        s.longAccel = dt > 0 ? (v1 - v0) / dt : 0;

        const vAvg = (v0 + v1) * 0.5;

        // Steering (compute actual steer angle only)
        this._updateSteering(s, vAvg, maxSpeed, dt);

        // ✅ Rear-axle bicycle kinematics (shared with DriveSim)
        const kinOut = s._kin.step({
            dt,
            speedMps: vAvg,
            steerAngleRad: s.steerAngle,
            steerEffect: c.steerEffect,
            curvatureTau: c.curvatureTau,
            curvatureMaxRate: c.curvatureMaxRate,
            curvatureSuspTau: c.curvatureSuspTau,
            curvatureSuspMaxRate: c.curvatureSuspMaxRate
        });

        s.yaw = kinOut.yaw;
        s.curvature = kinOut.curvature;
        s.curvatureSusp = kinOut.curvatureSusp;

        // Position is the anchor/worldRoot position (NOT rear axle position)
        s.position.x = kinOut.anchorPosX;
        s.position.z = kinOut.anchorPosZ;
        // Keep Y stable here; suspension system handles body heave separately.
        // If an anchor existed at registration, we preserve that baseline Y.
        // (If Y is driven elsewhere, VehicleController can choose how to apply it.)
        // We do not integrate Y in locomotion.
        // s.position.y remains whatever was set at registration (or updated externally).

        // Wheel spin
        s.wheelSpinAccum += kinOut.wheelSpinDelta;
    }

    /**
     * Update steering for a vehicle (no curvature/understeer here).
     * @param {object} s - Vehicle state
     * @param {number} vAvg - Average speed this frame
     * @param {number} maxSpeed - Maximum speed
     * @param {number} dt - Delta time
     */
    _updateSteering(s, vAvg, maxSpeed, dt) {
        const c = this.config;

        // Speed-dependent max steering angle
        const s01 = maxSpeed > 1e-3 ? clamp(vAvg / maxSpeed, 0, 1) : 0;
        const t = Math.pow(s01, c.steerSpeedCurve);
        const maxSteerDynDeg = lerp(c.maxSteerDeg, c.minSteerDegAtMaxSpeed, t);
        const maxSteerDyn = degToRad(maxSteerDynDeg);

        // Commanded steer angle from input
        // NOTE: Keep this convention unchanged; it matches existing gameplay input mapping.
        s.steerCmd = -s.input.steering * maxSteerDyn;

        // Slew-limited actual steer angle
        const steerRate = degToRad(c.steerRateDegPerSec);
        s.steerAngle = moveTowards(s.steerAngle, s.steerCmd, steerRate * dt);
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
            position: { ...state.position },
            yaw: state.yaw,
            speed: state.speed,
            speedKph: state.speed * 3.6,
            steerAngle: state.steerAngle,
            curvature: state.curvature,
            longAccel: state.longAccel,
            wheelSpinAccum: state.wheelSpinAccum
        };
    }

    /**
     * Get lateral acceleration for suspension.
     * @param {string} vehicleId
     * @returns {number} Lateral acceleration (m/s²)
     */
    getLateralAccel(vehicleId) {
        const state = this.vehicles.get(vehicleId);
        if (!state) return 0;

        // a_lat = v² * curvature
        // Use the faster "suspension curvature" channel to match DriveSim feel.
        const curv = (typeof state.curvatureSusp === 'number') ? state.curvatureSusp : state.curvature;
        return state.speed * state.speed * curv;
    }
}
