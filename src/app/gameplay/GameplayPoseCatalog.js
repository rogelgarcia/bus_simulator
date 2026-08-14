// @ts-check
// Stable, named launch poses for gameplay scenes.

function freezeDeep(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const entry of Object.values(value)) freezeDeep(entry);
    return Object.freeze(value);
}

export const GAMEPLAY_POSE_CATALOG = freezeDeep([
    {
        id: 'civic_center_curve_front',
        label: 'Civic Center Curve — Front',
        description: 'Front view of the city bus at the curved civic-center junction.',
        pose: {
            version: 1,
            city: 'bigcity2',
            bus: {
                modelId: 'city',
                position: { x: -144, z: 48 },
                yawDeg: -45,
                steeringWheelDeg: 0,
                wheelSpinDeg: 0
            },
            camera: {
                position: { x: -157, y: 4.2, z: 61 },
                target: { x: -144, y: 2.72, z: 48 },
                fovDeg: 55,
                locked: true
            },
            simulation: { paused: true },
            hud: { visible: true }
        }
    }
]);

/**
 * Returns an immutable catalog entry by id.
 * @param {string} id
 * @returns {object|null}
 */
export function getGameplayPosePreset(id) {
    const key = typeof id === 'string' ? id.trim().toLowerCase() : '';
    if (!key) return null;
    return GAMEPLAY_POSE_CATALOG.find((entry) => entry.id === key) ?? null;
}
