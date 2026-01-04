// src/app/physics/simulations/EngineTransmissionSim.js
// Powertrain math only; does not move vehicles or apply forces.
const DEFAULT_ENGINE_GEARS = [
    { label: 'R', ratio: -3.1 },
    { label: 'N', ratio: 0 },
    { label: '1', ratio: 3.6 },
    { label: '2', ratio: 2.2 },
    { label: '3', ratio: 1.45 },
    { label: '4', ratio: 1.05 },
    { label: '5', ratio: 0.82 }
];

const DEFAULT_ENGINE = {
    idleRpm: 650,
    redlineRpm: 2400,
    peakTorqueRpm: 1400,
    maxTorque: 1250,
    idleTorqueFrac: 0.62,
    torqueDrop: 0.35,
    curveSharpness: 1.0,
    finalDrive: 4.2,
    efficiency: 0.88,
    engineInertia: 9.5,
    clutchStiffness: 22.0,
    clutchMaxTorque: 2200,
    clutchEngageTime: 0.25,
    clutchLockSpeed: 4.0,
    idleControlKp: 42.0,
    frictionTorque: 90.0,
    frictionViscous: 0.35,
    shiftTimeSec: 0.32,
    shiftCooldownSec: 0.55,
    shiftUpRpm: 2000,
    shiftDownRpm: 1100,
    autoShift: true,
    gears: DEFAULT_ENGINE_GEARS,
    defaultGearIndex: 2
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function rpmToOmega(rpm) {
    return (rpm ?? 0) * (Math.PI * 2) / 60;
}

function omegaToRpm(omega) {
    return (omega ?? 0) * 60 / (Math.PI * 2);
}

function cloneGears(gears) {
    if (!Array.isArray(gears)) return [];
    return gears.map((gear) => ({
        label: String(gear.label ?? ''),
        ratio: Number.isFinite(gear.ratio) ? gear.ratio : 0
    }));
}

function resolveDefaultGearIndex(gears, preferred) {
    if (Number.isFinite(preferred) && gears[preferred]) return preferred;
    const labelIndex = gears.findIndex((gear) => String(gear.label).toUpperCase() === '1');
    if (labelIndex >= 0) return labelIndex;
    const forwardIndex = gears.findIndex((gear) => (gear.ratio ?? 0) > 0);
    return forwardIndex >= 0 ? forwardIndex : 0;
}

function buildEngineConfig(engine, lengthScale) {
    const base = { ...DEFAULT_ENGINE, ...(engine ?? {}) };
    const gears = cloneGears(base.gears ?? DEFAULT_ENGINE.gears);
    const maxTorque = Number.isFinite(base.maxTorque)
        ? base.maxTorque * (Number.isFinite(lengthScale) ? lengthScale : 1)
        : DEFAULT_ENGINE.maxTorque;
    const clutchMaxTorque = Number.isFinite(engine?.clutchMaxTorque)
        ? Math.max(0, engine.clutchMaxTorque)
        : Math.max(100, maxTorque * 1.75);
    return {
        ...base,
        maxTorque,
        engineInertia: Number.isFinite(base.engineInertia)
            ? Math.max(0.1, base.engineInertia * (Number.isFinite(lengthScale) ? lengthScale : 1))
            : DEFAULT_ENGINE.engineInertia,
        clutchMaxTorque,
        gears,
        defaultGearIndex: resolveDefaultGearIndex(gears, base.defaultGearIndex)
    };
}

function gearLabelToNumber(label) {
    const text = String(label ?? '').toUpperCase();
    if (text === 'R') return -1;
    if (text === 'N') return 0;
    const parsed = Number.parseInt(text, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function sampleTorque(engineConfig, rpm) {
    const idle = Math.max(0, engineConfig.idleRpm ?? DEFAULT_ENGINE.idleRpm);
    const peak = Math.max(idle + 1, engineConfig.peakTorqueRpm ?? DEFAULT_ENGINE.peakTorqueRpm);
    const redline = Math.max(peak + 1, engineConfig.redlineRpm ?? DEFAULT_ENGINE.redlineRpm);
    const idleFrac = clamp(engineConfig.idleTorqueFrac ?? DEFAULT_ENGINE.idleTorqueFrac, 0, 1);
    const drop = clamp(engineConfig.torqueDrop ?? DEFAULT_ENGINE.torqueDrop, 0, 1);
    const sharpness = Math.max(0.1, engineConfig.curveSharpness ?? DEFAULT_ENGINE.curveSharpness);

    const riseT = clamp((rpm - idle) / (peak - idle), 0, 1);
    const fallT = clamp((rpm - peak) / (redline - peak), 0, 1);
    const rise = lerp(idleFrac, 1, riseT);
    const fall = lerp(1, 1 - drop, fallT);
    const base = rpm <= peak ? rise : fall;
    return Math.max(0, (engineConfig.maxTorque ?? DEFAULT_ENGINE.maxTorque) * Math.pow(base, sharpness));
}

function computeEngineOutput(engineConfig, engineState, speed, wheelRadius, throttle, dt = 1 / 60, driveWheelCount = 2) {
    const gears = engineState.gears;
    const forwardIndices = engineState.forwardIndices;
    let gearIndex = engineState.gearIndex;

    const pickGear = (idx) => gears[idx] ?? { label: 'N', ratio: 0 };

    const clampedDt = Number.isFinite(dt) ? clamp(dt, 0, 0.05) : (1 / 60);

    const idleRpm = engineConfig.idleRpm ?? DEFAULT_ENGINE.idleRpm;
    const redlineRpm = engineConfig.redlineRpm ?? DEFAULT_ENGINE.redlineRpm;
    const idleOmega = rpmToOmega(idleRpm);
    const redlineOmega = rpmToOmega(redlineRpm);
    const wheelOmega = (Number.isFinite(speed) ? speed : 0) / Math.max(1e-3, wheelRadius);

    let omega = Number.isFinite(engineState.omega) ? engineState.omega : rpmToOmega(engineState.rpm ?? idleRpm);
    if (!Number.isFinite(omega) || omega <= 0) omega = idleOmega;

    const speedAbs = Math.abs(Number.isFinite(speed) ? speed : 0);

    if (engineState.shiftTimer > 0) {
        engineState.shiftTimer = Math.max(0, engineState.shiftTimer - clampedDt);
    }

    if (engineState.shiftCooldown > 0) {
        engineState.shiftCooldown = Math.max(0, engineState.shiftCooldown - clampedDt);
    }

    const driveRatioForIndex = (idx) => (pickGear(idx).ratio ?? 0) * (engineConfig.finalDrive ?? DEFAULT_ENGINE.finalDrive);
    const currentRpm = omegaToRpm(omega);
    const currentDrivelineRpm = omegaToRpm(Math.abs(wheelOmega * driveRatioForIndex(gearIndex)));

    if (engineConfig.autoShift && !engineState.manual && forwardIndices.length && engineState.shiftCooldown <= 0) {
        if (!forwardIndices.includes(gearIndex)) {
            gearIndex = forwardIndices[0];
        } else {
            const upRpm = engineConfig.shiftUpRpm ?? DEFAULT_ENGINE.shiftUpRpm;
            const downRpm = engineConfig.shiftDownRpm ?? DEFAULT_ENGINE.shiftDownRpm;
            const pos = forwardIndices.indexOf(gearIndex);

            const canUpshift = (pos >= 0) && (pos < forwardIndices.length - 1) && throttle > 0.05 && speedAbs > 0.25;
            const canDownshift = (pos > 0);

            if (canUpshift && currentDrivelineRpm > upRpm) {
                const candidate = forwardIndices[pos + 1];
                const predictedOmega = Math.abs(wheelOmega * driveRatioForIndex(candidate));
                const predictedRpm = omegaToRpm(predictedOmega);
                if (predictedRpm > downRpm * 1.08) {
                    gearIndex = candidate;
                }
            } else if (canDownshift && currentDrivelineRpm < downRpm) {
                const candidate = forwardIndices[pos - 1];
                const predictedOmega = Math.abs(wheelOmega * driveRatioForIndex(candidate));
                const predictedRpm = omegaToRpm(predictedOmega);
                if (predictedRpm < redlineRpm * 0.98) {
                    gearIndex = candidate;
                }
            }
        }
    }

    const prevGear = engineState.gearIndex;
    if (prevGear !== gearIndex) {
        const shiftTimeSec = Math.max(0, engineConfig.shiftTimeSec ?? DEFAULT_ENGINE.shiftTimeSec);
        engineState.shiftTimer = shiftTimeSec;
        const cooldownSec = Math.max(shiftTimeSec, engineConfig.shiftCooldownSec ?? DEFAULT_ENGINE.shiftCooldownSec);
        engineState.shiftCooldown = Math.max(engineState.shiftCooldown ?? 0, cooldownSec);
    }
    engineState.gearIndex = gearIndex;

    const gear = pickGear(engineState.gearIndex);
    const gearRatio = gear.ratio ?? 0;
    const driveRatio = gearRatio * (engineConfig.finalDrive ?? DEFAULT_ENGINE.finalDrive);

    const drivelineOmega = Math.abs(wheelOmega * driveRatio);

    const clutchTarget = (Math.abs(driveRatio) > 1e-4) && (speedAbs > 0.35 || throttle > 0.04) ? 1 : 0;
    const clutchTau = Math.max(1e-3, engineConfig.clutchEngageTime ?? DEFAULT_ENGINE.clutchEngageTime);
    const clutchAlpha = 1 - Math.exp(-clampedDt / clutchTau);
    engineState.clutch = lerp(Number.isFinite(engineState.clutch) ? engineState.clutch : clutchTarget, clutchTarget, clutchAlpha);

    const shiftBlend = engineState.shiftTimer > 0
        ? (1 - clamp(engineState.shiftTimer / Math.max(1e-3, engineConfig.shiftTimeSec ?? DEFAULT_ENGINE.shiftTimeSec), 0, 1))
        : 1;

    const lockSpeed = Math.max(0.1, engineConfig.clutchLockSpeed ?? DEFAULT_ENGINE.clutchLockSpeed);
    const lockT = clamp(speedAbs / lockSpeed, 0, 1);
    const lockFactor = 0.15 + 0.85 * (lockT * lockT * (3 - 2 * lockT));
    const slipOmega = omega - drivelineOmega;
    const maxClutchTorque = Math.max(0, engineConfig.clutchMaxTorque ?? DEFAULT_ENGINE.clutchMaxTorque);
    const clutchStiffness = Math.max(0, engineConfig.clutchStiffness ?? DEFAULT_ENGINE.clutchStiffness);

    const rpmBefore = omegaToRpm(omega);
    const torqueCurve = sampleTorque(engineConfig, rpmBefore);
    const throttleClamped = clamp(throttle, 0, 1);
    const engineTorque = torqueCurve * throttleClamped;

    const friction = Math.max(0, (engineConfig.frictionTorque ?? DEFAULT_ENGINE.frictionTorque))
        + Math.max(0, (engineConfig.frictionViscous ?? DEFAULT_ENGINE.frictionViscous)) * Math.abs(omega);

    const idleErr = idleOmega - omega;
    const idleAssist = idleErr > 0
        ? idleErr * Math.max(0, engineConfig.idleControlKp ?? DEFAULT_ENGINE.idleControlKp)
        : 0;

    const clutchBlend = clamp(engineState.clutch * shiftBlend, 0, 1);
    const coupling = clamp(clutchBlend * lockFactor, 0, 1);
    const syncTorque = clutchStiffness * coupling * slipOmega;
    const desiredTorque = engineTorque + idleAssist;
    const clutchCap = maxClutchTorque * coupling;
    let clutchTorque = desiredTorque + syncTorque;
    clutchTorque = clamp(clutchTorque, -clutchCap, clutchCap);

    const inertia = Math.max(0.05, engineConfig.engineInertia ?? DEFAULT_ENGINE.engineInertia);
    omega += ((engineTorque + idleAssist - clutchTorque - friction) / inertia) * clampedDt;
    omega = clamp(omega, idleOmega, redlineOmega);

    const rpm = omegaToRpm(omega);

    const efficiency = engineConfig.efficiency ?? DEFAULT_ENGINE.efficiency;
    const driveTorque = clutchTorque * driveRatio * efficiency;
    const driveForceTotal = Math.abs(driveRatio) > 1e-4 ? (driveTorque / Math.max(1e-3, wheelRadius)) : 0;
    const driven = Math.max(1, Number.isFinite(driveWheelCount) ? Math.round(driveWheelCount) : 1);
    const driveForce = driveForceTotal / driven;

    engineState.omega = omega;
    engineState.rpm = rpm;
    engineState.torque = engineTorque;
    engineState.drivelineRpm = omegaToRpm(drivelineOmega);
    engineState.slipOmega = slipOmega;
    engineState.clutchTorque = clutchTorque;
    engineState.coupling = coupling;
    engineState.shiftBlend = shiftBlend;

    return {
        gearIndex: engineState.gearIndex,
        gearLabel: gear.label ?? 'N',
        gearNumber: gearLabelToNumber(gear.label),
        rpm,
        torque: engineTorque,
        driveForce,
        driveForceTotal,
        drivelineRpm: engineState.drivelineRpm,
        slipOmega: engineState.slipOmega,
        clutchTorque: engineState.clutchTorque,
        clutch: engineState.clutch,
        coupling: engineState.coupling,
        shiftBlend: engineState.shiftBlend,
        shiftTimer: engineState.shiftTimer,
        shiftCooldown: engineState.shiftCooldown
    };
}

function createEngineState(engineConfig) {
    const gears = cloneGears(engineConfig?.gears ?? DEFAULT_ENGINE.gears);
    const forwardIndices = gears
        .map((gear, index) => ({ gear, index }))
        .filter((entry) => (entry.gear.ratio ?? 0) > 0)
        .map((entry) => entry.index);
    const gearIndex = resolveDefaultGearIndex(gears, engineConfig?.defaultGearIndex ?? DEFAULT_ENGINE.defaultGearIndex);
    const idleRpm = engineConfig?.idleRpm ?? DEFAULT_ENGINE.idleRpm;
    return {
        gears,
        forwardIndices,
        gearIndex,
        rpm: idleRpm,
        omega: rpmToOmega(idleRpm),
        torque: 0,
        drivelineRpm: idleRpm,
        slipOmega: 0,
        clutchTorque: 0,
        clutch: 1,
        shiftTimer: 0,
        shiftCooldown: 0,
        manual: false
    };
}

export {
    DEFAULT_ENGINE,
    DEFAULT_ENGINE_GEARS,
    buildEngineConfig,
    computeEngineOutput,
    createEngineState,
    gearLabelToNumber
};
