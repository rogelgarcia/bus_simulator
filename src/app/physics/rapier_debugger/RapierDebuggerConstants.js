// src/app/physics/rapier_debugger/RapierDebuggerConstants.js
// Default configs/tuning for the standalone Rapier debugger simulation.
import { getBusSpec } from '../../vehicle/buses/BusCatalog.js';

const CITY_BUS_SPEC = getBusSpec('city');
const CITY_BUS_DIMENSIONS = CITY_BUS_SPEC?.dimensions ?? null;
const CITY_BUS_WHEEL = CITY_BUS_SPEC?.wheel ?? null;
const CITY_BUS_TUNING = CITY_BUS_SPEC?.tuning ?? null;
const CITY_BUS_SUSPENSION = CITY_BUS_TUNING?.suspension ?? null;

const FALLBACK_DIMENSIONS = {
    width: 2.60 * 1.15,
    height: 3.20 * 1.15,
    length: 12.00 * 1.15
};

const FALLBACK_WHEEL = {
    radius: 0.55 * 1.15,
    width: 0.32 * 1.15
};
export const RAPIER_DEBUGGER_WORLD_CONFIG = {
    fixedDt: 1 / 60,
    gravity: { x: 0, y: -9.81, z: 0 },
    groundSize: 400,
    groundThickness: 1.0
};

export const RAPIER_DEBUGGER_VEHICLE_CONFIG = {
    width: CITY_BUS_DIMENSIONS?.width ?? FALLBACK_DIMENSIONS.width,
    height: CITY_BUS_DIMENSIONS?.height ?? FALLBACK_DIMENSIONS.height,
    length: CITY_BUS_DIMENSIONS?.length ?? FALLBACK_DIMENSIONS.length,
    spawnHeight: 3.2,
    groundClearance: 0.24,
    wheelRadius: CITY_BUS_WHEEL?.radius ?? FALLBACK_WHEEL.radius,
    wheelWidth: CITY_BUS_WHEEL?.width ?? FALLBACK_WHEEL.width,
    restLength: CITY_BUS_SUSPENSION?.restLength ?? 0.35,
    wheelbaseRatio: 0.56,
    wheelSideInset: 0.1
};

function computeBoxInertia(mass, width, height, length) {
    if (!Number.isFinite(mass) || mass <= 0) return { x: 0, y: 0, z: 0 };
    const round100 = (value) => Math.round(value / 100) * 100;
    const w2 = width * width;
    const h2 = height * height;
    const l2 = length * length;
    const k = mass / 12;
    return {
        x: round100(k * (h2 + l2)),
        y: round100(k * (w2 + l2)),
        z: round100(k * (w2 + h2))
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
        linearDamping: CITY_BUS_TUNING?.linearDamping ?? 0.45,
        angularDamping: CITY_BUS_TUNING?.angularDamping ?? 1.4,
        gravityScale: 1.0,
        canSleep: true,
        ccdEnabled: true,
        dominanceGroup: 0,
        lockTranslations: false,
        lockRotations: false,
        enabledRotations: { x: true, y: true, z: true },
        additionalMassProperties: {
            inertiaMode: 'auto',
            mass: CITY_BUS_TUNING?.mass ?? 13500,
            density: null,
            com: { x: 0, y: -0.6, z: 0 },
            inertia: computeBoxInertia(
                CITY_BUS_TUNING?.mass ?? 13500,
                RAPIER_DEBUGGER_VEHICLE_CONFIG.width,
                RAPIER_DEBUGGER_VEHICLE_CONFIG.height,
                RAPIER_DEBUGGER_VEHICLE_CONFIG.length
            ),
            inertiaFrame: { w: 1, x: 0, y: 0, z: 0 }
        }
    },
    suspension: {
        maxTravel: CITY_BUS_SUSPENSION?.travel ?? 0.25,
        stiffness: CITY_BUS_SUSPENSION?.stiffness ?? 500,
        compression: CITY_BUS_SUSPENSION?.compression ?? 1.0,
        relaxation: CITY_BUS_SUSPENSION?.relaxation ?? 1.0,
        maxForce: CITY_BUS_SUSPENSION?.maxForce ?? 100000
    },
    tires: {
        frictionSlip: CITY_BUS_TUNING?.frictionSlip ?? 9.0,
        sideFrictionStiffness: CITY_BUS_TUNING?.sideFrictionStiffness ?? 1.8
    }
};
