// src/graphics/assets3d/procedural_meshes/skeletons/TrafficLightHeadSkeleton_v1.js
// Provides schema-driven controls for procedural traffic light head meshes.
import { createEnumProperty, normalizeEnumValue } from './MeshSkeletonSchema.js';

export const SKELETON_ID = 'skeleton.traffic_light_head.v1';

const ACTIVE_LIGHT = Object.freeze({
    NONE: 'none',
    RED: 'red',
    YELLOW: 'yellow',
    GREEN: 'green'
});

export const SCHEMA = Object.freeze({
    id: SKELETON_ID,
    label: 'Traffic light head',
    properties: Object.freeze([
        createEnumProperty({
            id: 'activeLight',
            label: 'Active light',
            options: [
                { id: ACTIVE_LIGHT.NONE, label: 'None' },
                { id: ACTIVE_LIGHT.RED, label: 'Red' },
                { id: ACTIVE_LIGHT.YELLOW, label: 'Yellow' },
                { id: ACTIVE_LIGHT.GREEN, label: 'Green' }
            ],
            defaultValue: ACTIVE_LIGHT.RED
        })
    ]),
    children: Object.freeze([])
});

function findRegionIndex(regions, regionId) {
    if (!Array.isArray(regions)) return -1;
    return regions.findIndex((r) => r?.id === regionId);
}

function applyActiveLightToMaterials(materials, indices, activeLight) {
    if (!Array.isArray(materials)) return;
    const onKey = typeof activeLight === 'string' ? activeLight : ACTIVE_LIGHT.NONE;

    const apply = (idx, enabled) => {
        const mat = idx >= 0 ? materials[idx] : null;
        if (!mat || mat.emissive === undefined) return;
        if (mat.color?.isColor && mat.emissive?.isColor) mat.emissive.copy(mat.color);
        if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = enabled ? 1.8 : 0.0;
        mat.needsUpdate = true;
    };

    apply(indices.red, onKey === ACTIVE_LIGHT.RED);
    apply(indices.yellow, onKey === ACTIVE_LIGHT.YELLOW);
    apply(indices.green, onKey === ACTIVE_LIGHT.GREEN);
}

export function createTrafficLightHeadSkeletonApi({
    regions,
    materials = null,
    initial = null
} = {}) {
    const indices = {
        red: findRegionIndex(regions, 'traffic_light_head:light_red'),
        yellow: findRegionIndex(regions, 'traffic_light_head:light_yellow'),
        green: findRegionIndex(regions, 'traffic_light_head:light_green')
    };

    const prop = SCHEMA.properties[0];
    const state = {
        activeLight: normalizeEnumValue(initial?.activeLight, prop.options, prop.defaultValue)
    };

    const apply = () => {
        const semantic = materials?.semantic ?? null;
        const solid = materials?.solid ?? null;
        applyActiveLightToMaterials(semantic, indices, state.activeLight);
        applyActiveLightToMaterials(solid, indices, state.activeLight);
    };

    const api = {
        schema: SCHEMA,
        children: [],
        getValue: (propId) => {
            if (propId === 'activeLight') return state.activeLight;
            return null;
        },
        setValue: (propId, value) => {
            if (propId !== 'activeLight') return;
            state.activeLight = normalizeEnumValue(value, prop.options, prop.defaultValue);
            apply();
        },
        apply
    };

    apply();
    return api;
}

