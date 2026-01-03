// src/app/physics/rapier_debugger/RapierDebuggerConstants.js
export const RAPIER_DEBUGGER_WORLD_CONFIG = {
    fixedDt: 1 / 60,
    gravity: { x: 0, y: -9.81, z: 0 },
    groundSize: 180,
    groundThickness: 4.0
};

export const RAPIER_DEBUGGER_VEHICLE_CONFIG = {
    // Bus-like proportions (meters)
    width: 2.5,
    height: 3.0,
    length: 10.0,
    spawnHeight: 3,
    groundClearance: 0.24,
    wheelRadius: 0.55,
    wheelWidth: 0.35,
    restLength: 0.35,
    wheelbaseRatio: 0.6,
    wheelSideInset: 0.1
};

function computeBoxInertia(mass, width, height, length) {
    if (!Number.isFinite(mass) || mass <= 0) return { x: 0, y: 0, z: 0 };
    const w2 = width * width;
    const h2 = height * height;
    const l2 = length * length;
    const k = mass / 12;
    return {
        x: k * (h2 + l2),
        y: k * (w2 + l2),
        z: k * (w2 + h2)
    };
}

export const RAPIER_DEBUGGER_TUNING = {
    chassis: {
        bodyType: 'dynamic',
        translation: { x: 0, y: RAPIER_DEBUGGER_VEHICLE_CONFIG.spawnHeight, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        linvel: { x: 0, y: 0, z: 0 },
        angvel: { x: 0, y: 0, z: 0 },
        additionalMass: 0,
        linearDamping: 0.32,
        angularDamping: 1.0,
        gravityScale: 1.0,
        canSleep: true,
        ccdEnabled: true,
        dominanceGroup: 0,
        lockTranslations: false,
        lockRotations: false,
        enabledRotations: { x: true, y: true, z: true },
        additionalMassProperties: {
            mass: 1500,
            com: { x: 0, y: -0.6, z: 0 },
            inertia: computeBoxInertia(
                1500,
                RAPIER_DEBUGGER_VEHICLE_CONFIG.width,
                RAPIER_DEBUGGER_VEHICLE_CONFIG.height,
                RAPIER_DEBUGGER_VEHICLE_CONFIG.length
            ),
            inertiaFrame: { w: 1, x: 0, y: 0, z: 0 }
        }
    },
    suspension: {
        maxTravel: 0.18,
        stiffness: 500,
        compression: 1.0,
        relaxation: 1.0,
        maxForce: 10000
    },
    tires: {
        frictionSlip: 8.2,
        sideFrictionStiffness: 1.45
    }
};
