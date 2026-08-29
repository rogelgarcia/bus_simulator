// Defines the production static-visibility bake and runtime compatibility profile.
// @ts-check

export const STATIC_VISIBILITY_SCHEMA = 'bus_sim.static_visibility';
export const STATIC_VISIBILITY_VERSION = 1;
export const STATIC_VISIBILITY_HASH_SCHEMA = 'fnv1a64-canonical-json-v1';
export const STATIC_VISIBILITY_GEOMETRY_REVISION = 'bigcity2-static-geometry-2026-08-29';

export const STATIC_VISIBILITY_CATEGORY = Object.freeze({
    BUILDINGS: 'buildings',
    TRAFFIC_LIGHTS: 'traffic_lights',
    TRAFFIC_SIGNS: 'traffic_signs',
    TREES: 'trees'
});

export const STATIC_VISIBILITY_CATEGORIES = Object.freeze(Object.values(STATIC_VISIBILITY_CATEGORY));

export const STATIC_VISIBILITY_PROFILE = Object.freeze({
    id: 'bigcity2-grid3-pitch12-neighbor1-aspect2_5-v1',
    cityId: 'bigcity2',
    directionCount: 12,
    horizontalOffsets: Object.freeze([-8, 0, 8]),
    heights: Object.freeze([1.22, 3.6831812721965655, 6.146362544393131]),
    targetY: 1.12,
    baselinePitchDeg: Object.freeze([-0.38101533705061646, -9.67328903369499, -18.48254682146594]),
    pitchProfiles: Object.freeze([
        Object.freeze({ id: 'low_up_30', heightIndex: 0, pitchDeg: 30 }),
        Object.freeze({ id: 'low_up_60', heightIndex: 0, pitchDeg: 60 }),
        Object.freeze({ id: 'low_straight_up_90', heightIndex: 0, pitchDeg: 90 }),
        Object.freeze({ id: 'mid_down_15', heightIndex: 1, pitchDeg: -15 }),
        Object.freeze({ id: 'high_down_30', heightIndex: 2, pitchDeg: -30 }),
        Object.freeze({ id: 'high_down_45', heightIndex: 2, pitchDeg: -45 })
    ]),
    bakeResolution: Object.freeze([384, 216]),
    validationResolution: Object.freeze([1280, 720]),
    edgeGuardPixels: 2,
    neighborRadius: 1,
    temporalGraceMs: 250,
    camera: Object.freeze({
        fovDeg: 55,
        near: 0.5,
        far: 1800,
        maxAspect: 2.5,
        minPitchDeg: -45,
        maxPitchDeg: 90
    }),
    categories: STATIC_VISIBILITY_CATEGORIES,
    geometryRevision: STATIC_VISIBILITY_GEOMETRY_REVISION
});

function padIndex(index) {
    return String(index).padStart(3, '0');
}

export function createBuildingVisibilityId(buildingId) {
    const id = typeof buildingId === 'string' ? buildingId.trim() : '';
    if (!id) throw new Error('Static visibility building id is required');
    return `building:${id}`;
}

export function createTrafficControlVisibilityId(category, index) {
    if (category !== STATIC_VISIBILITY_CATEGORY.TRAFFIC_LIGHTS && category !== STATIC_VISIBILITY_CATEGORY.TRAFFIC_SIGNS) {
        throw new Error(`Unsupported traffic-control visibility category: ${category}`);
    }
    if (!Number.isInteger(index) || index < 0) throw new Error(`Invalid traffic-control visibility index: ${index}`);
    return `${category}:${padIndex(index)}`;
}

export function createTreeVisibilityId(index) {
    if (!Number.isInteger(index) || index < 0) throw new Error(`Invalid tree visibility index: ${index}`);
    return `trees:${padIndex(index)}`;
}
