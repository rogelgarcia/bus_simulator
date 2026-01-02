// src/app/physics/systems/DrivetrainSystem.js
function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

/**
 * Default drivetrain configuration (bus-like).
 */
const DEFAULT_CONFIG = {
    RPM_IDLE: 900,
    RPM_LAUNCH: 2000,
    RPM_UPSHIFT: 7000,
    RPM_DOWNSHIFT: 1800,
    RPM_AFTER_UPSHIFT: 2200,
    RPM_MAX: 7800,

    SHIFT_COOLDOWN_UP: 0.25,
    SHIFT_COOLDOWN_DOWN: 0.18,
    SHIFT_HOLD: 0.16,

    LAUNCH_HOLD: 0.55,
    LAUNCH_RISE_RATE: 6.0,
    RPM_RISE_RATE: 1.25,
    RPM_FALL_RATE: 3.2
};

/**
 * Default gear specifications (speed ranges per gear).
 */
const DEFAULT_GEAR_SPECS = [
    null,
    { minKph: 0, maxKph: 18 },   // 1
    { minKph: 12, maxKph: 38 },  // 2
    { minKph: 28, maxKph: 68 },  // 3
    { minKph: 50, maxKph: 98 },  // 4
    { minKph: 80, maxKph: 140 }  // 5
];

/**
 * Slip RPM added under throttle per gear.
 */
const DEFAULT_SLIP_RPM = [null, 650, 520, 420, 320, 260];

/**
 * DrivetrainSystem handles engine and transmission simulation.
 *
 * Responsibilities:
 * - Engine RPM simulation
 * - Automatic gear shifting
 * - Clutch engagement
 * - Launch control
 */
export class DrivetrainSystem {
    constructor(config = {}) {
        /** @type {Map<string, object>} */
        this.vehicles = new Map();

        /** @type {object} */
        this.config = { ...DEFAULT_CONFIG, ...config };

        /** @type {Array} */
        this.gearSpecs = DEFAULT_GEAR_SPECS;

        /** @type {Array} */
        this.slipRpm = DEFAULT_SLIP_RPM;

        /** @type {number} */
        this.maxGear = this.gearSpecs.length - 1;
    }

    /**
     * Register a vehicle with this system.
     * @param {object} vehicle - Vehicle instance
     */
    addVehicle(vehicle) {
        if (!vehicle?.id) return;

        const c = this.config;

        this.vehicles.set(vehicle.id, {
            vehicle,
            rpm: c.RPM_IDLE,
            gear: 1,
            throttle: 0,
            clutchEngaged: false,

            // Timing state
            shiftCd: 0,
            shiftHold: 0,
            launchActive: false,
            launchHold: 0,
            prevThrottle: 0,

            // External speed (from LocomotionSystem)
            externalSpeedKph: 0,

            // Input
            input: { throttle: 0 }
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
     * @param {object} input - { throttle }
     */
    setInput(vehicleId, input) {
        const state = this.vehicles.get(vehicleId);
        if (!state) return;
        if (typeof input.throttle === 'number') {
            state.input.throttle = clamp(input.throttle, 0, 1);
        }
    }

    /**
     * Set external speed (for RPM calculation from actual vehicle speed).
     * @param {string} vehicleId
     * @param {number} speedKph
     */
    setExternalSpeed(vehicleId, speedKph) {
        const state = this.vehicles.get(vehicleId);
        if (!state) return;
        state.externalSpeedKph = Math.max(0, speedKph ?? 0);
    }

    /**
     * Fixed timestep update.
     * @param {number} dt - Delta time in seconds
     */
    fixedUpdate(dt) {
        if (dt <= 0) return;

        for (const state of this.vehicles.values()) {
            this._updateDrivetrain(state, dt);
        }
    }

    /**
     * Update drivetrain for a single vehicle.
     * @param {object} s - Vehicle state
     * @param {number} dt - Delta time
     */
    _updateDrivetrain(s, dt) {
        const c = this.config;
        const t = clamp(s.input.throttle, 0, 1);
        const speedKph = s.externalSpeedKph;

        // Launch behavior: throttle pressed from rest in 1st gear
        if (t > 0.08 && s.prevThrottle <= 0.08 && speedKph < 5 && s.gear === 1) {
            s.launchActive = true;
            s.launchHold = c.LAUNCH_HOLD;
        }
        s.prevThrottle = t;

        // Clutch engagement
        s.clutchEngaged = speedKph > 1 || t > 0.05;

        // Coupled RPM from speed + gear range
        const coupled = s.clutchEngaged
            ? this._rpmFromSpeedKph(speedKph, s.gear)
            : c.RPM_IDLE;

        // Slip/load RPM under throttle
        let rpmTarget = Math.max(c.RPM_IDLE, coupled + t * (this.slipRpm[s.gear] || 0));

        // After upshift, hold low RPM briefly
        if (s.shiftHold > 0) {
            rpmTarget = Math.min(rpmTarget, c.RPM_AFTER_UPSHIFT);
            s.shiftHold = Math.max(0, s.shiftHold - dt);
        }

        // Launch: force RPM toward ~2000 then "stick" briefly
        let riseRate = c.RPM_RISE_RATE;
        if (s.launchActive) {
            rpmTarget = Math.min(rpmTarget, c.RPM_LAUNCH);

            if (s.rpm < c.RPM_LAUNCH * 0.985) {
                riseRate = Math.max(riseRate, c.LAUNCH_RISE_RATE);
            } else {
                s.launchHold = Math.max(0, s.launchHold - dt);
                if (s.launchHold === 0) s.launchActive = false;
            }
        }

        // Smooth actual RPM response
        const rate = rpmTarget > s.rpm ? riseRate : c.RPM_FALL_RATE;
        s.rpm += (rpmTarget - s.rpm) * (1 - Math.exp(-dt * rate));
        s.rpm = clamp(s.rpm, c.RPM_IDLE, c.RPM_MAX);

        // Shift cooldown
        if (s.shiftCd > 0) s.shiftCd = Math.max(0, s.shiftCd - dt);

        // Auto shifting
        if (s.shiftCd === 0) {
            if (s.rpm >= c.RPM_UPSHIFT && s.gear < this.maxGear) {
                // Upshift
                s.gear += 1;
                s.rpm = c.RPM_AFTER_UPSHIFT;
                s.shiftCd = c.SHIFT_COOLDOWN_UP;
                s.shiftHold = c.SHIFT_HOLD;
                s.launchActive = false;
                s.launchHold = 0;
            } else if (s.rpm <= c.RPM_DOWNSHIFT && s.gear > 1) {
                // Downshift
                s.gear -= 1;
                const bumped = this._rpmFromSpeedKph(speedKph, s.gear);
                s.rpm = Math.max(bumped, 2400);
                s.shiftCd = c.SHIFT_COOLDOWN_DOWN;
            }
        }

        // Update throttle output
        s.throttle = t;
    }

    /**
     * Calculate RPM from speed and gear.
     * @param {number} speedKph
     * @param {number} gear
     * @returns {number}
     */
    _rpmFromSpeedKph(speedKph, gear) {
        const c = this.config;
        const spec = this.gearSpecs[gear];
        if (!spec) return c.RPM_IDLE;

        const span = Math.max(0.0001, spec.maxKph - spec.minKph);
        const tt = clamp((speedKph - spec.minKph) / span, 0, 1);

        return c.RPM_DOWNSHIFT + tt * (c.RPM_UPSHIFT - c.RPM_DOWNSHIFT);
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
            rpm: state.rpm,
            gear: state.gear,
            throttle: state.throttle,
            clutchEngaged: state.clutchEngaged,
            launchActive: state.launchActive
        };
    }
}

