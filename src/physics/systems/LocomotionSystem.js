// src/physics/systems/LocomotionSystem.js
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

    // Understeer
    understeerK: 0.0028,         // Understeer saturation coefficient

    // Curvature inertia
    curvatureTau: 0.28,          // Time constant for curvature lag
    curvatureMaxRate: 0.22,      // Max curvature change rate (1/m per sec)

    // Geometry (defaults, overridden by vehicle)
    wheelbase: 5.5,              // Distance between axles (m)
    wheelRadius: 0.55            // Wheel radius (m)
};

/**
 * LocomotionSystem handles vehicle movement and steering.
 *
 * Responsibilities:
 * - Speed control (acceleration, braking, coasting)
 * - Steering (rear-axle bicycle model)
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
     * @param {object} vehicle - Vehicle instance with { id, api, anchor }
     */
    addVehicle(vehicle) {
        if (!vehicle?.id) return;

        const c = this.config;

        this.vehicles.set(vehicle.id, {
            vehicle,
            api: vehicle.api ?? null,
            anchor: vehicle.anchor ?? null,

            // Speed state
            speed: 0,              // Current speed (m/s)
            targetSpeed: 0,        // Target speed (m/s)
            longAccel: 0,          // Longitudinal acceleration (m/s²)

            // Steering state
            steerCmd: 0,           // Commanded steer angle (rad)
            steerAngle: 0,         // Actual steer angle (rad)
            curvature: 0,          // Current path curvature (1/m)

            // Position state
            yaw: 0,                // Heading angle (rad)
            position: { x: 0, y: 0, z: 0 },

            // Geometry (from vehicle or defaults)
            wheelbase: c.wheelbase,
            wheelRadius: c.wheelRadius,
            forwardSign: 1,        // +1 if front is +Z, -1 if front is -Z

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

        // Steering
        const vAvg = (v0 + v1) * 0.5;
        this._updateSteering(s, vAvg, maxSpeed, dt);

        // Position/yaw integration
        this._updatePosition(s, vAvg, dt);
    }

    /**
     * Update steering for a vehicle.
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
        // Negate because input convention is +1=right, but yaw convention is +angle=left
        s.steerCmd = -s.input.steering * maxSteerDyn;

        // Slew-limited actual steer angle
        const steerRate = degToRad(c.steerRateDegPerSec);
        s.steerAngle = moveTowards(s.steerAngle, s.steerCmd, steerRate * dt);

        // Calculate curvature from steering (bicycle model)
        const L = Math.max(1e-3, s.wheelbase);
        let curvCmd = (Math.tan(s.steerAngle) * c.steerEffect) / L;

        // Understeer saturation at high speed
        const understeerSat = 1 / (1 + c.understeerK * vAvg * vAvg);
        curvCmd *= understeerSat;

        // Curvature inertia (lag)
        const maxRate = Math.max(1e-4, c.curvatureMaxRate);
        s.curvature = moveTowards(s.curvature, curvCmd, maxRate * dt);
    }

    /**
     * Update position and yaw for a vehicle.
     * @param {object} s - Vehicle state
     * @param {number} vAvg - Average speed this frame
     * @param {number} dt - Delta time
     */
    _updatePosition(s, vAvg, dt) {
        const ds = vAvg * dt;

        // Yaw rate from curvature
        const yawRate = vAvg * s.curvature;
        s.yaw += yawRate * dt;

        // Normalize yaw to [-PI, PI]
        while (s.yaw > Math.PI) s.yaw -= 2 * Math.PI;
        while (s.yaw < -Math.PI) s.yaw += 2 * Math.PI;

        // Move forward in heading direction
        const cosYaw = Math.cos(s.yaw);
        const sinYaw = Math.sin(s.yaw);

        s.position.x += sinYaw * ds * s.forwardSign;
        s.position.z += cosYaw * ds * s.forwardSign;

        // Wheel spin
        const r = Math.max(1e-3, s.wheelRadius);
        s.wheelSpinAccum += (ds * s.forwardSign) / r;
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
        return state.speed * state.speed * state.curvature;
    }
}

