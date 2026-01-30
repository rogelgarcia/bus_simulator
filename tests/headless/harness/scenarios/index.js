// Scenario registry for the deterministic harness.
import { scenarioEmpty } from './scenario_empty.js';
import { scenarioCityStraightRoad } from './scenario_city_straight_road.js';
import { scenarioCityCrossing } from './scenario_city_crossing.js';
import { scenarioRoadSurfaceVariationCompare } from './scenario_road_surface_variation_compare.js';
import { scenarioAsphaltNoiseDebug } from './scenario_asphalt_noise_debug.js';
import { scenarioRoadMarkingsTexturedAsphalt } from './scenario_road_markings_textured_asphalt.js';
import { scenarioRoadMarkingsAsphaltNoiseToggle } from './scenario_road_markings_asphalt_noise_toggle.js';
import { scenarioRoadLivedInWearToggle } from './scenario_road_lived_in_wear_toggle.js';
import { scenarioWindowMeshShadeVisibility } from './scenario_window_mesh_shade_visibility.js';
import { scenarioWindowMeshInteriorParallax } from './scenario_window_mesh_interior_parallax.js';

const REGISTRY = new Map([
    [scenarioEmpty.id, scenarioEmpty],
    [scenarioCityStraightRoad.id, scenarioCityStraightRoad],
    [scenarioCityCrossing.id, scenarioCityCrossing],
    [scenarioRoadSurfaceVariationCompare.id, scenarioRoadSurfaceVariationCompare],
    [scenarioAsphaltNoiseDebug.id, scenarioAsphaltNoiseDebug],
    [scenarioRoadMarkingsTexturedAsphalt.id, scenarioRoadMarkingsTexturedAsphalt],
    [scenarioRoadMarkingsAsphaltNoiseToggle.id, scenarioRoadMarkingsAsphaltNoiseToggle],
    [scenarioRoadLivedInWearToggle.id, scenarioRoadLivedInWearToggle],
    [scenarioWindowMeshShadeVisibility.id, scenarioWindowMeshShadeVisibility],
    [scenarioWindowMeshInteriorParallax.id, scenarioWindowMeshInteriorParallax]
]);

export function listScenarioIds() {
    return Array.from(REGISTRY.keys()).sort();
}

export function getScenarioById(id) {
    const key = String(id ?? '');
    return REGISTRY.get(key) ?? null;
}
