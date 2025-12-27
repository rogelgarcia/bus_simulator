// src/physics/systems/BrakeSystem.js

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

/**
 * Default brake configuration.
 */
const DEFAULT_CONFIG = {
    // Maximum brake deceleration (m/s²)
    maxBrakeDecel: 4.4,

    // Handbrake multiplier (stronger than regular brake)
    handbrakeMultiplier: 1.2,

    // Brake force response rate (how fast brake force builds)
    brakeResponseRate: 8.0,

    // Brake light threshold (input level to turn on lights)
    brakeLightThreshold: 0.05,

    // ABS parameters (future)
    absEnabled: false,
    absCycleRate: 15,      // Hz
    absSlipThreshold: 0.15
};

/**
 * BrakeSystem handles dedicated braking physics.
 *
 * Responsibilities:
 * - Brake force calculation
 * - Brake light state
 * - Handbrake support
 * - ABS simulation (future)
 */
export class BrakeSystem {
    constructor(config = {}) {
        /** @type {Map<string, object>} */
        this.vehicles = new Map();

        /** @type {object} */
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Register a vehicle with this system.
     * @param {object} vehicle - Vehicle instance
     */
    addVehicle(vehicle) {
        if (!vehicle?.id) return;

        this.vehicles.set(vehicle.id, {
            vehicle,
            brakeInput: 0,
            brakeForce: 0,
            targetBrakeForce: 0,
            handbrake: false,
            brakeLightsOn: false,

            // External speed (from LocomotionSystem)
            externalSpeedMps: 0,

            // ABS state (future)
            absActive: false,
            absCyclePhase: 0
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
     * @param {object} input - { brake, handbrake }
     */
    setInput(vehicleId, input) {
        const state = this.vehicles.get(vehicleId);
        if (!state) return;

        if (typeof input.brake === 'number') {
            state.brakeInput = clamp(input.brake, 0, 1);
        }
        if (typeof input.handbrake === 'boolean') {
            state.handbrake = input.handbrake;
        }
    }

    /**
     * Set external speed (for ABS calculation).
     * @param {string} vehicleId
     * @param {number} speedMps - Speed in m/s
     */
    setExternalSpeed(vehicleId, speedMps) {
        const state = this.vehicles.get(vehicleId);
        if (!state) return;
        state.externalSpeedMps = Math.max(0, speedMps ?? 0);
    }

    /**
     * Fixed timestep update.
     * @param {number} dt - Delta time in seconds
     */
    fixedUpdate(dt) {
        if (dt <= 0) return;

        for (const state of this.vehicles.values()) {
            this._updateBrakes(state, dt);
        }
    }

    /**
     * Update brakes for a single vehicle.
     * @param {object} s - Vehicle state
     * @param {number} dt - Delta time
     */
    _updateBrakes(s, dt) {
        const c = this.config;

        // Calculate target brake force
        let targetForce = s.brakeInput * c.maxBrakeDecel;

        // Handbrake adds extra force
        if (s.handbrake) {
            targetForce = Math.max(targetForce, c.maxBrakeDecel * c.handbrakeMultiplier);
        }

        s.targetBrakeForce = targetForce;

        // Smooth brake force response (hydraulic feel)
        const rate = c.brakeResponseRate;
        s.brakeForce += (targetForce - s.brakeForce) * (1 - Math.exp(-dt * rate));

        // Clamp to valid range
        s.brakeForce = clamp(s.brakeForce, 0, c.maxBrakeDecel * c.handbrakeMultiplier);

        // ABS simulation (future - placeholder)
        if (c.absEnabled && s.brakeInput > 0.5 && s.externalSpeedMps > 2) {
            s.absCyclePhase += dt * c.absCycleRate * Math.PI * 2;
            if (s.absCyclePhase > Math.PI * 2) s.absCyclePhase -= Math.PI * 2;

            // Modulate brake force with ABS
            const absModulation = 0.7 + 0.3 * Math.sin(s.absCyclePhase);
            s.brakeForce *= absModulation;
            s.absActive = true;
        } else {
            s.absActive = false;
            s.absCyclePhase = 0;
        }

        // Brake lights: on if braking or handbrake
        s.brakeLightsOn = s.brakeInput > c.brakeLightThreshold || s.handbrake;
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
            brakeForce: state.brakeForce,
            brakeInput: state.brakeInput,
            handbrake: state.handbrake,
            brakeLightsOn: state.brakeLightsOn,
            absActive: state.absActive
        };
    }
}

