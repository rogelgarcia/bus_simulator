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
    return {
        ...base,
        maxTorque,
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

function computeEngineOutput(engineConfig, engineState, speed, wheelRadius, throttle) {
    const gears = engineState.gears;
    const forwardIndices = engineState.forwardIndices;
    let gearIndex = engineState.gearIndex;

    const wheelRpm = Math.abs(speed) / Math.max(1e-3, wheelRadius) * 60 / (Math.PI * 2);
    const pickGear = (idx) => gears[idx] ?? { label: 'N', ratio: 0 };

    if (engineConfig.autoShift && !engineState.manual && forwardIndices.length) {
        if (!forwardIndices.includes(gearIndex)) {
            gearIndex = forwardIndices[0];
        } else {
            const current = pickGear(gearIndex);
            const currentRatio = (current.ratio ?? 0) * (engineConfig.finalDrive ?? DEFAULT_ENGINE.finalDrive);
            const currentRpm = Math.max(engineConfig.idleRpm ?? DEFAULT_ENGINE.idleRpm, wheelRpm * Math.abs(currentRatio));
            const upRpm = engineConfig.shiftUpRpm ?? DEFAULT_ENGINE.shiftUpRpm;
            const downRpm = engineConfig.shiftDownRpm ?? DEFAULT_ENGINE.shiftDownRpm;
            const pos = forwardIndices.indexOf(gearIndex);
            if (currentRpm > upRpm && pos < forwardIndices.length - 1 && throttle > 0.05) {
                gearIndex = forwardIndices[pos + 1];
            } else if (currentRpm < downRpm && pos > 0) {
                gearIndex = forwardIndices[pos - 1];
            }
        }
    }

    const gear = pickGear(gearIndex);
    const gearRatio = gear.ratio ?? 0;
    const driveRatio = gearRatio * (engineConfig.finalDrive ?? DEFAULT_ENGINE.finalDrive);
    const idleRpm = engineConfig.idleRpm ?? DEFAULT_ENGINE.idleRpm;
    const rpmFromWheels = Math.abs(wheelRpm * driveRatio);
    const minRpm = idleRpm + (engineConfig.redlineRpm - idleRpm) * 0.15 * clamp(throttle, 0, 1);
    const rpm = clamp(Math.max(idleRpm, rpmFromWheels, minRpm), idleRpm, engineConfig.redlineRpm ?? DEFAULT_ENGINE.redlineRpm);
    const torque = sampleTorque(engineConfig, rpm) * clamp(throttle, 0, 1);
    const efficiency = engineConfig.efficiency ?? DEFAULT_ENGINE.efficiency;
    const driveTorque = torque * driveRatio * efficiency;
    const driveForce = Math.abs(driveRatio) > 1e-4 ? (driveTorque / Math.max(1e-3, wheelRadius)) : 0;

    return {
        gearIndex,
        gearLabel: gear.label ?? 'N',
        gearNumber: gearLabelToNumber(gear.label),
        rpm,
        torque,
        driveForce
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
        torque: 0,
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
