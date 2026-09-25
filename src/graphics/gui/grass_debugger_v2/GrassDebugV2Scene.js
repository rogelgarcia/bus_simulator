// Builds the fixed Grass Debug v2 baseline from the game's terrain, road, bus and tree assets.
// @ts-check
import * as THREE from 'three';
import { BIG_CITY_SPEC_SOURCE } from '../../../app/city/specs/BigCitySpec.js';
import { BUS_CATALOG } from '../../../app/vehicle/buses/BusCatalog.js';
import { createBus } from '../../assets3d/factories/BusFactory.js';
import { loadTreeTemplates } from '../../assets3d/generators/TreeGenerator.js';
import { createGeneratorConfig, ROAD_DEFAULTS } from '../../assets3d/generators/GeneratorParams.js';
import { getCityMaterials } from '../../assets3d/textures/CityMaterials.js';
import { createRoadEngineRoads } from '../../visuals/city/RoadEngineRoads.js';
import { ASPHALT_NOISE_DEFAULTS } from '../../visuals/city/AsphaltNoiseSettings.js';
import { createGrassDebugV2Land } from './GrassDebugV2Land.js';
import dirtDefinition from '../../../../assets/public/pbr/gravelly_sand/pbr.material.config.js';

export const GRASS_V2_TERRAIN = Object.freeze({
    width: BIG_CITY_SPEC_SOURCE.width * BIG_CITY_SPEC_SOURCE.tileSize,
    depth: BIG_CITY_SPEC_SOURCE.height * BIG_CITY_SPEC_SOURCE.tileSize,
    centerX: BIG_CITY_SPEC_SOURCE.origin.x + (BIG_CITY_SPEC_SOURCE.width - 1) * BIG_CITY_SPEC_SOURCE.tileSize / 2,
    centerZ: BIG_CITY_SPEC_SOURCE.origin.z + (BIG_CITY_SPEC_SOURCE.height - 1) * BIG_CITY_SPEC_SOURCE.tileSize / 2,
    materialId: dirtDefinition.materialId
});

const TREE_PLACEMENTS = Object.freeze([
    [-18, -5, 10], [22, 14, 13], [-26, 39, 12], [19, 59, 10],
    [-34, 92, 14], [32, 120, 11], [-60, 155, 13], [63, 190, 12],
    [-115, 58, 12], [108, -50, 14], [-150, -145, 11], [152, 130, 13]
]);

function createRoad() {
    const map = {
        ...BIG_CITY_SPEC_SOURCE,
        roadNetwork: { seed: 'grass-debug-v2' },
        roadSegments: [{
            id: 'grass-v2-road', kind: 'polyline', tag: 'grass_v2_straight',
            lanesF: 1, lanesB: 1, rendered: true,
            points: [
                { x: 0, z: -GRASS_V2_TERRAIN.depth / 2 + 24 },
                { x: 0, z: GRASS_V2_TERRAIN.depth / 2 - 24 }
            ]
        }]
    };
    const materials = getCityMaterials({ isolated: true });
    const road = createRoadEngineRoads({
        map,
        config: createGeneratorConfig({ ground: { surfaceY: ROAD_DEFAULTS.surfaceY } }),
        materials,
        options: {
            includeCurbs: true, includeSidewalks: true, includeMarkings: true,
            includeDebug: false, suppressSidewalkEdgeDirtStrip: true,
            asphaltNoise: ASPHALT_NOISE_DEFAULTS
        }
    });
    road.group.name = 'GrassV2GameRoad';
    return { ...road, materials };
}

async function createTrees() {
    const assets = await loadTreeTemplates('desktop');
    if (!assets?.templates?.length) throw new Error('Game tree assets did not load.');
    const trees = new THREE.Group();
    trees.name = 'GrassV2GameTrees';
    TREE_PLACEMENTS.forEach(([x, z, height], index) => {
        const template = assets.templates[index % assets.templates.length];
        const tree = template.clone(true);
        const scale = height / template.userData.treeHeight;
        tree.scale.multiplyScalar(scale);
        const placement = new THREE.Group();
        placement.name = `GrassV2Tree${index + 1}`;
        placement.position.set(x, -template.userData.treeBaseY * scale - 0.03, z);
        placement.rotation.y = index * 2.399963;
        placement.add(tree);
        trees.add(placement);
    });
    return trees;
}

export async function createGrassDebugV2Scene(scene, renderer) {
    const road = createRoad();
    scene.add(road.group);
    const bus = createBus(BUS_CATALOG.find(entry => entry.id === 'city'));
    bus.name = 'GrassV2CityBus';
    bus.position.set(-ROAD_DEFAULTS.laneWidth / 2, ROAD_DEFAULTS.surfaceY, 0);
    scene.add(bus);
    const [land, trees] = await Promise.all([
        createGrassDebugV2Land(renderer, GRASS_V2_TERRAIN), createTrees(), bus.userData.readyPromise
    ]);
    const bounds = new THREE.Box3().setFromObject(bus);
    if (bounds.getSize(new THREE.Vector3()).z < 10) throw new Error('The full city bus model did not load.');
    bus.position.y += ROAD_DEFAULTS.surfaceY - bounds.min.y;
    scene.add(land.ground, trees);
    return { ground: land.ground, land, road, bus, trees };
}
