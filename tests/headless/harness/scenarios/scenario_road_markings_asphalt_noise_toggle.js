// Harness scenario: road markings should pick up asphalt variation (noise/PBR) when enabled.
import * as THREE from 'three';
import { createCityConfig } from '/src/app/city/CityConfig.js';
import { CityMap } from '/src/app/city/CityMap.js';
import { createGeneratorConfig } from '/src/graphics/assets3d/generators/GeneratorParams.js';
import { getCityMaterials } from '/src/graphics/assets3d/textures/CityMaterials.js';
import { createRoadEngineRoads } from '/src/graphics/visuals/city/RoadEngineRoads.js';
import { createHarnessCitySpec } from './ScenarioCitySpec.js';

export const scenarioRoadMarkingsAsphaltNoiseToggle = {
    id: 'road_markings_asphalt_noise_toggle',
    async create({ engine, seed, options }) {
        engine.clearScene();

        const group = new THREE.Group();
        group.name = 'RoadMarkingsAsphaltNoiseToggle';
        engine.scene.add(group);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x101827, 0.55);
        hemi.position.set(0, 60, 0);
        group.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 2.35);
        sun.position.set(24, 18, 14);
        sun.target.position.set(0, 0, 0);
        group.add(sun);
        group.add(sun.target);

        const size = options?.size ?? 220;
        const tileMeters = options?.tileMeters ?? 2;
        const mapTileSize = options?.mapTileSize ?? 24;

        const cityCfg = createCityConfig({ size, tileMeters, mapTileSize, seed });
        const mapSpec = createHarnessCitySpec({
            seed,
            size,
            tileMeters,
            mapTileSize,
            roads: [
                { a: [1, 4], b: [7, 4], lanesF: 2, lanesB: 2, tag: 'straight' }
            ],
            buildings: []
        });
        const map = CityMap.fromSpec(mapSpec, cityCfg);

        const genConfig = createGeneratorConfig(options?.generatorConfig ?? {});
        const base = getCityMaterials();
        const materials = {
            road: base.road.clone(),
            roadEdgeWear: base.roadEdgeWear.clone(),
            sidewalk: base.sidewalk.clone(),
            curb: base.curb.clone(),
            laneWhite: base.laneWhite.clone(),
            laneYellow: base.laneYellow.clone()
        };

        const roads = createRoadEngineRoads({
            map,
            config: genConfig,
            materials,
            options: {
                includeCurbs: false,
                includeSidewalks: false,
                includeMarkings: true,
                includeJunctions: false,
                includeDebug: false,
                markingsMode: 'meshes',
                asphaltNoise: options?.asphaltNoise ?? null
            }
        });

        group.add(roads.group);

        engine.camera.position.set(0, 8, 22);
        engine.camera.lookAt(0, 0.05, 0);

        return {
            update() {},
            getMetrics() {
                return {
                    seed: String(seed ?? ''),
                    scenario: {
                        kind: 'road_markings_asphalt_noise_toggle',
                        markingsMode: 'meshes',
                        asphaltNoise: options?.asphaltNoise ?? null
                    }
                };
            },
            dispose() {
                roads.group.removeFromParent();
                roads.group.traverse((obj) => {
                    if (obj?.geometry) obj.geometry.dispose?.();
                    if (obj?.material) {
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        for (const mat of mats) mat?.dispose?.();
                    }
                });
                group.removeFromParent();
                engine.clearScene();
            }
        };
    }
};

