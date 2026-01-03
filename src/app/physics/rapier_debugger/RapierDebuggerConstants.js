// src/app/physics/rapier_debugger/RapierDebuggerConstants.js
export const RAPIER_DEBUGGER_WORLD_CONFIG = {
    fixedDt: 1 / 60,
    gravity: { x: 0, y: -9.81, z: 0 },
    groundSize: 180,
    groundThickness: 4.0
};

export const RAPIER_DEBUGGER_VEHICLE_CONFIG = {
    width: 2.2,
    height: 1.2,
    length: 4.2,
    spawnHeight: 3,
    groundClearance: 0.24,
    wheelRadius: 0.42,
    wheelWidth: 0.28,
    restLength: 0.35,
    wheelbaseRatio: 0.65,
    wheelSideInset: 0.08
};

export const RAPIER_DEBUGGER_TUNING = {
    chassis: {
        bodyType: 'dynamic',
        translation: { x: 0, y: RAPIER_DEBUGGER_VEHICLE_CONFIG.spawnHeight, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        linvel: { x: 0, y: 0, z: 0 },
        angvel: { x: 0, y: 0, z: 0 },
        additionalMass: 6500,
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
            mass: NaN,
            com: { x: 0, y: 0, z: 0 },
            inertia: { x: 0.3, y: 0.2, z: 0.1 },
            inertiaFrame: { w: 1, x: 0, y: 0, z: 0 }
        }
    },
    suspension: {
        maxTravel: 0.2,
        stiffness: 34000,
        compression: 4000,
        relaxation: 4600,
        maxForce: 95000
    },
    tires: {
        frictionSlip: 8.2,
        sideFrictionStiffness: 1.45
    }
};
