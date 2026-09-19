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
import { applyTextureColorSpace } from '../../content3d/materials/PbrTexturePipeline.js';
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

async function createDirtPlane(renderer) {
    const loader = new THREE.TextureLoader();
    const keys = ['baseColor', 'normal', 'orm'];
    const textures = await Promise.all(keys.map(async (key) => {
        const texture = await loader.loadAsync(new URL(`../../../../${dirtDefinition.allMapFiles[key]}`, import.meta.url).href);
        applyTextureColorSpace(texture, { srgb: key === 'baseColor' });
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(GRASS_V2_TERRAIN.width / dirtDefinition.tileMeters, GRASS_V2_TERRAIN.depth / dirtDefinition.tileMeters);
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        return texture;
    }));
    const [map, normalMap, orm] = textures;
    const material = new THREE.MeshStandardMaterial({
        map, normalMap, aoMap: orm, roughnessMap: orm, metalnessMap: orm,
        roughness: 1, metalness: 0, side: THREE.DoubleSide
    });
    const geometry = new THREE.PlaneGeometry(GRASS_V2_TERRAIN.width, GRASS_V2_TERRAIN.depth);
    geometry.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(geometry, material);
    ground.name = 'GrassV2DirtTerrain';
    ground.position.set(GRASS_V2_TERRAIN.centerX, 0, GRASS_V2_TERRAIN.centerZ);
    ground.receiveShadow = true;
    return ground;
}

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

/** @returns {Promise<{ground: THREE.Mesh, road: object, bus: THREE.Group, trees: THREE.Group}>} */
export async function createGrassDebugV2Scene(scene, renderer) {
    const road = createRoad();
    scene.add(road.group);
    const bus = createBus(BUS_CATALOG.find(entry => entry.id === 'city'));
    bus.name = 'GrassV2CityBus';
    bus.position.set(-ROAD_DEFAULTS.laneWidth / 2, ROAD_DEFAULTS.surfaceY, 0);
    scene.add(bus);
    const [ground, trees] = await Promise.all([
        createDirtPlane(renderer), createTrees(), bus.userData.readyPromise
    ]);
    const bounds = new THREE.Box3().setFromObject(bus);
    if (bounds.getSize(new THREE.Vector3()).z < 10) throw new Error('The full city bus model did not load.');
    bus.position.y += ROAD_DEFAULTS.surfaceY - bounds.min.y;
    scene.add(ground, trees);
    return { ground, road, bus, trees };
}
