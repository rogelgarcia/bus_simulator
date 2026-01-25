// Scenario registry for the deterministic harness.
import { scenarioEmpty } from './scenario_empty.js';
import { scenarioCityStraightRoad } from './scenario_city_straight_road.js';
import { scenarioCityCrossing } from './scenario_city_crossing.js';
import { scenarioRoadSurfaceVariationCompare } from './scenario_road_surface_variation_compare.js';
import { scenarioAsphaltNoiseDebug } from './scenario_asphalt_noise_debug.js';

const REGISTRY = new Map([
    [scenarioEmpty.id, scenarioEmpty],
    [scenarioCityStraightRoad.id, scenarioCityStraightRoad],
    [scenarioCityCrossing.id, scenarioCityCrossing],
    [scenarioRoadSurfaceVariationCompare.id, scenarioRoadSurfaceVariationCompare],
    [scenarioAsphaltNoiseDebug.id, scenarioAsphaltNoiseDebug]
]);

export function listScenarioIds() {
    return Array.from(REGISTRY.keys()).sort();
}

export function getScenarioById(id) {
    const key = String(id ?? '');
    return REGISTRY.get(key) ?? null;
}
