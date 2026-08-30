// Builds the canonical city/config input used by both the baker and gameplay.
// @ts-check

import { hashCanonicalValue } from './StaticVisibilityHash.js';
import { STATIC_VISIBILITY_PROFILE } from './StaticVisibilityProfile.js';

function createResolvedBuildingHashInput(building) {
    const input = building && typeof building === 'object' ? { ...building } : building;
    if (!input || typeof input !== 'object') return input;

    // CityMap adds disabled defaults as its schema grows. They do not alter
    // generated geometry and must not stale an otherwise compatible bake.
    if (input.fitToLot !== true) delete input.fitToLot;
    if (input.footprintStretch == null) delete input.footprintStretch;
    return input;
}

export function createStaticVisibilityCityHashInput(city) {
    const map = city?.map;
    if (!map?.exportSpec) throw new Error('Static visibility city hash requires an exportable map');
    const exportedSpec = map.exportSpec({ seed: city.genConfig?.seed ?? null, version: 1 });
    return {
        cityId: city.cityId,
        sourceSpec: city.visibilitySourceSpec,
        resolvedMapSpec: exportedSpec,
        // Only resolved configurations referenced by this city are present in
        // map.buildings. Unused building-catalog entries are intentionally not
        // part of the visibility hash.
        resolvedBuildings: Array.isArray(map.buildings)
            ? map.buildings.map(createResolvedBuildingHashInput)
            : [],
        resolvedReservations: map.reservationSpecs,
        generatorConfig: city.generatorConfig,
        trafficControlPlacements: city.trafficControls?.placements ?? [],
        trees: {
            quality: city.world?.trees?.quality ?? null,
            placements: city.world?.trees?.placements ?? []
        },
        visibilityProfile: STATIC_VISIBILITY_PROFILE
    };
}

export function createStaticVisibilityCityHash(city) {
    return hashCanonicalValue(createStaticVisibilityCityHashInput(city));
}
