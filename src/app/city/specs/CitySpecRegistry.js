// src/app/city/specs/CitySpecRegistry.js
// Registry of available city specs for tools/debuggers.
// Design: JS module exports are the source of truth (JSON files are export artifacts).

import { createDemoCitySpec } from './DemoCitySpec.js';
import { createBigCitySpec } from './BigCitySpec.js';
import { createBigCity2Spec } from './BigCity2Spec.js';

export const DEFAULT_CITY_SPEC_ID = 'demo';

export const CITY_SPEC_REGISTRY = Object.freeze([
    Object.freeze({
        id: 'demo',
        label: 'Demo',
        createSpec: (config) => createDemoCitySpec(config)
    }),
    Object.freeze({
        id: 'bigcity',
        label: 'Big City',
        createSpec: () => createBigCitySpec()
    }),
    Object.freeze({
        id: 'bigcity2',
        label: 'Big City 2',
        createSpec: () => createBigCity2Spec()
    })
]);

export function getCitySpecEntryById(id) {
    const key = typeof id === 'string' ? id : '';
    return CITY_SPEC_REGISTRY.find((entry) => entry?.id === key) ?? null;
}

export function createCitySpecById(id, config) {
    const entry = getCitySpecEntryById(id);
    if (!entry) return null;
    const spec = entry.createSpec(config);
    return spec && typeof spec === 'object' ? spec : null;
}
