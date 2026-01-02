// src/app/physics/systems/DemoDrivetrainSim.js
/**
 * Demo drivetrain simulation for HUD demo mode.
 * Used by GameHUD when mode='demo' (no real physics connected).
 *
 * For gameplay, use DrivetrainSystem from src/physics/systems/DrivetrainSystem.js
 */

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

const DEFAULT_CONFIG = {
    // RPM behavior
    RPM_IDLE: 900,
    RPM_LAUNCH: 2000,
    RPM_UPSHIFT: 7000,
    RPM_DOWNSHIFT: 1800,
    RPM_AFTER_UPSHIFT: 2200,
    RPM_MAX: 7800,

    // Timing (seconds)
    SHIFT_COOLDOWN_UP: 0.25,
    SHIFT_COOLDOWN_DOWN: 0.18,
    SHIFT_HOLD: 0.16,

    LAUNCH_HOLD: 0.55,
    LAUNCH_RISE_RATE: 6.0,
    RPM_RISE_RATE: 1.25,
    RPM_FALL_RATE: 3.2,

    // Speed dynamics (demo-believable)
    DRIVE_MAX_ACCEL: 1.8,   // m/s^2 in 1st at peak torque
    BRAKE_DECEL: 6.5,       // m/s^2
    ROLLING_DECEL: 0.16,    // m/s^2
    AERO_COEF: 0.00028,     // m/s^2 per (m/s)^2
};

const DEFAULT_GEAR_SPECS = [
    null,
    { minKph: 0,  maxKph: 18 },   // 1
    { minKph: 12, maxKph: 38 },   // 2
    { minKph: 28, maxKph: 68 },   // 3
    { minKph: 50, maxKph: 98 },   // 4
    { minKph: 80, maxKph: 140 },  // 5
];

const DEFAULT_GEAR_PULL = [null, 1.00, 0.78, 0.60, 0.46, 0.38];
const DEFAULT_SLIP_RPM = [null, 650, 520, 420, 320, 260];

export class DemoDrivetrainSim {
    constructor({
                    config = {},
                    gearSpecs = DEFAULT_GEAR_SPECS,
                    gearPull = DEFAULT_GEAR_PULL,
                    slipRpm = DEFAULT_SLIP_RPM,
                    startGear = 1,
                } = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.gearSpecs = gearSpecs;
        this.gearPull = gearPull;
        this.slipRpm = slipRpm;

        this.maxGear = Math.max(1, this.gearSpecs.length - 1);
        this.reset({ gear: startGear });
    }

    reset({ speedMps = 0, rpm = this.config.RPM_IDLE, gear = 1 } = {}) {
        this.state = {
            speedMps,
            rpm, // <-- actual RPM (physics)
            gear: clamp(Math.round(gear), 1, this.maxGear),

            shiftCd: 0,
            shiftHold: 0,

            launchActive: false,
            launchHold: 0,
            prevThrottle: 0,
        };
    }

    getGear() {
        return this.state.gear;
    }

    getSpeedKph() {
        return this.state.speedMps * 3.6;
    }

    getRpm() {
        return this.state.rpm;
    }

    /**
     * Input: throttle/brake (0..1)
     * Output: speed + actual rpm (gears are internal; access via getGear()).
     */
    /**
     * Input: throttle/brake (0..1)
     * Optional: externalSpeedKph (number) to drive RPM/gear from real vehicle speed.
     * Output: speed + actual rpm
     */
    update(dt, throttle, brake, { externalSpeedKph = null } = {}) {
        const c = this.config;
        const s = this.state;

        const t = clamp(throttle, 0, 1);
        const b = clamp(brake, 0, 1);

        // If connected to real bus speed: force internal speed to match.
        const hasExternalSpeed = typeof externalSpeedKph === "number" && isFinite(externalSpeedKph);
        if (hasExternalSpeed) {
            s.speedMps = Math.max(0, externalSpeedKph / 3.6);
        }

        const speedKph = s.speedMps * 3.6;

        // Launch behavior
        if (t > 0.08 && s.prevThrottle <= 0.08 && speedKph < 5 && s.gear === 1) {
            s.launchActive = true;
            s.launchHold = c.LAUNCH_HOLD;
        }
        s.prevThrottle = t;

        // Coupled RPM from speed + gear range
        const clutchEngaged = speedKph > 1 || t > 0.05;
        const coupled = clutchEngaged ? this._rpmFromSpeedKph(speedKph, s.gear) : c.RPM_IDLE;

        // Slip/load rpm under throttle
        let rpmTarget = Math.max(c.RPM_IDLE, coupled + t * (this.slipRpm[s.gear] || 0));

        // After upshift, hold low RPM briefly
        if (s.shiftHold > 0) {
            rpmTarget = Math.min(rpmTarget, c.RPM_AFTER_UPSHIFT);
            s.shiftHold = Math.max(0, s.shiftHold - dt);
        }

        // Launch: force rpm toward ~2000 then “stick” briefly
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

        // Auto shifting (your rules)
        if (s.shiftCd === 0) {
            if (s.rpm >= c.RPM_UPSHIFT && s.gear < this.maxGear) {
                s.gear += 1;
                s.rpm = c.RPM_AFTER_UPSHIFT;

                s.shiftCd = c.SHIFT_COOLDOWN_UP;
                s.shiftHold = c.SHIFT_HOLD;

                s.launchActive = false;
                s.launchHold = 0;
            } else if (s.rpm <= c.RPM_DOWNSHIFT && s.gear > 1) {
                s.gear -= 1;

                // bump rpm to match new gear at current speed
                const bumped = this._rpmFromSpeedKph(speedKph, s.gear);
                s.rpm = Math.max(bumped, 2400);

                s.shiftCd = c.SHIFT_COOLDOWN_DOWN;
            }
        }

        // If external speed is provided, do NOT integrate speed here.
        if (!hasExternalSpeed) {
            // Speed dynamics
            const torque01 = this._torqueCurve01(s.rpm);
            const pull = this.gearPull[s.gear] ?? 0.5;

            const driveAccel = t * torque01 * pull * c.DRIVE_MAX_ACCEL;
            const brakeDecel = b * c.BRAKE_DECEL;

            const rolling = s.speedMps > 0.2 ? c.ROLLING_DECEL : 0;
            const aero = c.AERO_COEF * s.speedMps * s.speedMps;

            s.speedMps += (driveAccel - brakeDecel - rolling - aero) * dt;
            if (s.speedMps < 0) s.speedMps = 0;
        }

        return {
            speedMps: s.speedMps,
            speedKph: s.speedMps * 3.6,
            rpm: s.rpm, // actual rpm
        };
    }

    _rpmFromSpeedKph(speedKph, gear) {
        const c = this.config;
        const spec = this.gearSpecs[gear];
        if (!spec) return c.RPM_IDLE;

        const span = Math.max(0.0001, spec.maxKph - spec.minKph);
        const tt = clamp((speedKph - spec.minKph) / span, 0, 1);

        return c.RPM_DOWNSHIFT + tt * (c.RPM_UPSHIFT - c.RPM_DOWNSHIFT);
    }

    _torqueCurve01(rpm) {
        const c = this.config;
        const x = clamp((rpm - c.RPM_IDLE) / Math.max(1, (c.RPM_UPSHIFT - c.RPM_IDLE)), 0, 1);
        return 0.25 + 0.75 * Math.sin(x * Math.PI);
    }
}
