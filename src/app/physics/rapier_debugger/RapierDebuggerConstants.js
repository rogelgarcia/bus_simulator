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
    wheelSideInset: -0.08
};

export const RAPIER_DEBUGGER_TUNING = {
    chassis: {
        additionalMass: 6500,
        linearDamping: 0.3,
        angularDamping: 0.8,
        gravityScale: 1.0,
        ccdEnabled: true
    },
    suspension: {
        maxTravel: 0.65,
        stiffness: 180000,
        compression: 25000,
        relaxation: 30000,
        maxForce: 200000
    },
    tires: {
        frictionSlip: 5.5,
        sideFrictionStiffness: 1.2
    }
};
