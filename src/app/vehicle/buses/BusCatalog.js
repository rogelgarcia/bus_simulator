// src/app/vehicle/buses/BusCatalog.js
// Central, data-driven bus catalog shared by states, physics, and model loaders.
//
// Conventions:
// - Units: meters (Rapier/Three are treated as 1u = 1m)
// - `dimensions`: approximate chassis bounds { width, height, length }
// - `wheel`: approximate wheel geometry { radius, width }
// - `tuning`: gameplay/physics defaults (engine, suspension, damping, etc)

const ENGINE_POWER_SCALE = 1.3;

export const BUS_CATALOG = [
    {
        id: 'city',
        name: 'City Bus',
        variant: 'city',
        color: 0xffcc00,
        wheelCount: 4,
        dimensions: { width: 2.60 * 1.15, height: 3.20 * 1.15, length: 12.00 * 1.15 },
        wheel: { radius: 0.55 * 1.15, width: 0.32 * 1.15 },
        tuning: {
            mass: 10000,
            engineForce: 200000 * ENGINE_POWER_SCALE,
            brakeForce: 15000,
            handbrakeForce: 17000,
            maxSteerDeg: 38,
            linearDamping: 0.32,
            angularDamping: 1.0,
            bodyTiltScale: 0.8,
            maxBodyAngleDeg: 6,
            suspension: {
                restLength: 0.32,
                stiffness: 500,
                compression: 0.8,
                relaxation: 0.6,
                travel: 0.18,
                maxForce: 95000
            },
            frictionSlip: 8.2,
            sideFrictionStiffness: 1.45,
            engine: {
                maxTorque: 2300 * ENGINE_POWER_SCALE,
                finalDrive: 4.4
            }
        }
    },
    {
        id: 'coach',
        name: 'Coach',
        variant: 'coach',
        color: 0x4fd1ff,
        wheelCount: 6,
        dimensions: { width: 2.6, height: 3.35, length: 13.2 },
        wheel: { radius: 0.55, width: 0.32 },
        tuning: {
            mass: 11800,
            engineForce: 210000 * ENGINE_POWER_SCALE,
            brakeForce: 15500,
            handbrakeForce: 17500,
            maxSteerDeg: 36,
            linearDamping: 0.26,
            angularDamping: 0.85,
            bodyTiltScale: 1.0,
            maxBodyAngleDeg: 8,
            suspension: {
                restLength: 0.38,
                stiffness: 520,
                compression: 0.85,
                relaxation: 0.65,
                travel: 0.22,
                maxForce: 85000
            },
            frictionSlip: 7.4,
            sideFrictionStiffness: 1.22,
            engine: {
                maxTorque: 2500 * ENGINE_POWER_SCALE,
                finalDrive: 4.1
            }
        }
    },
    {
        id: 'double',
        name: 'Double Decker',
        variant: 'double',
        color: 0xff5aa5,
        wheelCount: 6,
        dimensions: { width: 2.7, height: 4.35, length: (12.0 * 1.15 + 13.2) * 0.5 },
        wheel: { radius: 0.55, width: 0.30 },
        tuning: {
            mass: 13500,
            engineForce: 220000 * ENGINE_POWER_SCALE,
            brakeForce: 16500,
            handbrakeForce: 18500,
            maxSteerDeg: 32,
            linearDamping: 0.34,
            angularDamping: 1.15,
            bodyTiltScale: 0.75,
            maxBodyAngleDeg: 5,
            suspension: {
                restLength: 0.36,
                stiffness: 560,
                compression: 0.9,
                relaxation: 0.7,
                travel: 0.2,
                maxForce: 110000
            },
            frictionSlip: 8.6,
            sideFrictionStiffness: 1.35,
            engine: {
                maxTorque: 2650 * ENGINE_POWER_SCALE,
                finalDrive: 4.6
            }
        }
    }
];

export function getBusSpec(id) {
    const key = String(id ?? '').toLowerCase();
    return BUS_CATALOG.find((spec) => String(spec.id).toLowerCase() === key) ?? null;
}
