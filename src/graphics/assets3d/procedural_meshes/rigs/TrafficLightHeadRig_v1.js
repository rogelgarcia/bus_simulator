// src/graphics/assets3d/procedural_meshes/rigs/TrafficLightHeadRig_v1.js
// Provides schema-driven runtime controls for procedural traffic light head meshes.
import { createEnumProperty, normalizeEnumValue } from '../../../../app/rigs/RigSchema.js';

export const RIG_ID = 'rig.traffic_light_head.v1';
export const LEGACY_SKELETON_ID = 'skeleton.traffic_light_head.v1';

export const SIGNAL = Object.freeze({
    NONE: 'none',
    RED: 'red',
    YELLOW: 'yellow',
    GREEN: 'green'
});

export const SCHEMA = Object.freeze({
    id: RIG_ID,
    label: 'Traffic light head',
    properties: Object.freeze([
        createEnumProperty({
            id: 'signal',
            label: 'Signal',
            options: [
                { id: SIGNAL.NONE, label: 'None' },
                { id: SIGNAL.RED, label: 'Red' },
                { id: SIGNAL.YELLOW, label: 'Yellow' },
                { id: SIGNAL.GREEN, label: 'Green' }
            ],
            defaultValue: SIGNAL.RED
        })
    ]),
    children: Object.freeze([])
});

export const LEGACY_SCHEMA = Object.freeze({
    id: LEGACY_SKELETON_ID,
    label: 'Traffic light head',
    properties: Object.freeze([
        createEnumProperty({
            id: 'activeLight',
            label: 'Active light',
            options: [
                { id: SIGNAL.NONE, label: 'None' },
                { id: SIGNAL.RED, label: 'Red' },
                { id: SIGNAL.YELLOW, label: 'Yellow' },
                { id: SIGNAL.GREEN, label: 'Green' }
            ],
            defaultValue: SIGNAL.RED
        })
    ]),
    children: Object.freeze([])
});

function findRegionIndex(regions, regionId) {
    if (!Array.isArray(regions)) return -1;
    return regions.findIndex((r) => r?.id === regionId);
}

function applySignalToMaterials(materials, indices, signal) {
    if (!Array.isArray(materials)) return;
    const key = typeof signal === 'string' ? signal : SIGNAL.NONE;

    const apply = (idx, enabled) => {
        const mat = idx >= 0 ? materials[idx] : null;
        if (!mat || mat.emissive === undefined) return;
        if (mat.color?.isColor && mat.emissive?.isColor) mat.emissive.copy(mat.color);
        if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = enabled ? 1.8 : 0.0;
        mat.needsUpdate = true;
    };

    apply(indices.red, key === SIGNAL.RED);
    apply(indices.yellow, key === SIGNAL.YELLOW);
    apply(indices.green, key === SIGNAL.GREEN);
}

export function createTrafficLightHeadRig({
    regions,
    materials = null,
    initialState = null
} = {}) {
    const indices = {
        red: findRegionIndex(regions, 'traffic_light_head:light_red'),
        yellow: findRegionIndex(regions, 'traffic_light_head:light_yellow'),
        green: findRegionIndex(regions, 'traffic_light_head:light_green')
    };

    const prop = SCHEMA.properties[0];
    const initialSignal = initialState?.signal ?? initialState?.activeLight ?? null;
    const state = {
        signal: normalizeEnumValue(initialSignal, prop.options, prop.defaultValue)
    };

    const apply = () => {
        const semantic = materials?.semantic ?? null;
        const solid = materials?.solid ?? null;
        applySignalToMaterials(semantic, indices, state.signal);
        applySignalToMaterials(solid, indices, state.signal);
    };

    const api = {
        schema: SCHEMA,
        children: [],
        getState: () => ({ ...state }),
        getValue: (propId) => {
            if (propId === 'signal' || propId === 'activeLight') return state.signal;
            return null;
        },
        setValue: (propId, value) => {
            if (propId !== 'signal' && propId !== 'activeLight') return;
            state.signal = normalizeEnumValue(value, prop.options, prop.defaultValue);
            apply();
        },
        apply
    };

    apply();
    return api;
}

export function createTrafficLightHeadLegacySkeletonApi(rig) {
    const api = rig && typeof rig === 'object' ? rig : null;
    if (!api) return null;

    return {
        schema: LEGACY_SCHEMA,
        children: [],
        getValue: (propId) => {
            if (propId !== 'activeLight') return null;
            return api.getValue?.('signal') ?? api.getValue?.('activeLight') ?? null;
        },
        setValue: (propId, value) => {
            if (propId !== 'activeLight') return;
            api.setValue?.('signal', value);
        },
        apply: () => {
            api.apply?.();
        }
    };
}
