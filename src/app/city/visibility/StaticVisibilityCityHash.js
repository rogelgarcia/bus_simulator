// Builds the canonical city/config input used by both the baker and gameplay.
// @ts-check

import { hashCanonicalValue } from './StaticVisibilityHash.js';
import { STATIC_VISIBILITY_PROFILE } from './StaticVisibilityProfile.js';

export function createStaticVisibilityCityHashInput(city) {
    const map = city?.map;
    if (!map?.exportSpec) throw new Error('Static visibility city hash requires an exportable map');
    const exportedSpec = map.exportSpec({ seed: city.genConfig?.seed ?? null, version: 1 });
    return {
        cityId: city.cityId,
        sourceSpec: city.visibilitySourceSpec,
        resolvedMapSpec: exportedSpec,
        resolvedBuildings: map.buildings,
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
