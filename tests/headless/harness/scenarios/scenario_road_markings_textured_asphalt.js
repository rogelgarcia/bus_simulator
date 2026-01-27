// Road markings visibility scenario: textured + polygon-offset asphalt (regression guard).
import { createCityConfig } from '/src/app/city/CityConfig.js';
import { CityMap } from '/src/app/city/CityMap.js';
import { createGeneratorConfig } from '/src/graphics/assets3d/generators/GeneratorParams.js';
import { getCityMaterials } from '/src/graphics/assets3d/textures/CityMaterials.js';
import { createRoadEngineRoads } from '/src/graphics/visuals/city/RoadEngineRoads.js';
import { createHarnessCitySpec } from './ScenarioCitySpec.js';

function makeSolidTexture(THREE, { r, g, b, size = 4 } = {}) {
    const w = Math.max(1, size | 0);
    const h = w;
    const data = new Uint8Array(w * h * 3);
    const rr = Math.max(0, Math.min(255, Number(r) | 0));
    const gg = Math.max(0, Math.min(255, Number(g) | 0));
    const bb = Math.max(0, Math.min(255, Number(b) | 0));
    for (let i = 0; i + 2 < data.length; i += 3) {
        data[i] = rr;
        data[i + 1] = gg;
        data[i + 2] = bb;
    }
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    if ('colorSpace' in tex) tex.colorSpace = THREE.NoColorSpace;
    return tex;
}

export const scenarioRoadMarkingsTexturedAsphalt = {
    id: 'road_markings_textured_asphalt',
    async create({ engine, seed, options, THREE }) {
        engine.clearScene();

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
        const road = base.road.clone();
        road.normalMap = makeSolidTexture(THREE, { r: 128, g: 128, b: 255, size: 4 });
        road.roughnessMap = makeSolidTexture(THREE, { r: 220, g: 220, b: 220, size: 4 });
        road.transparent = true;
        road.opacity = 1.0;
        road.polygonOffset = true;
        road.polygonOffsetFactor = -1;
        road.polygonOffsetUnits = -4;

        const materials = {
            road,
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
                includeDebug: false
            }
        });

        engine.scene.add(roads.group);

        engine.camera.position.set(0, 55, 65);
        engine.camera.lookAt(0, 0, 0);

        return {
            update() {},
            getMetrics() { return { seed, scenario: { kind: 'road_markings_textured_asphalt' } }; },
            dispose() {
                roads.group.removeFromParent();
                roads.group.traverse((obj) => {
                    if (obj?.geometry) obj.geometry.dispose?.();
                    if (obj?.material) {
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        for (const mat of mats) {
                            if (mat?.roughnessMap) mat.roughnessMap.dispose?.();
                            if (mat?.normalMap) mat.normalMap.dispose?.();
                            mat?.dispose?.();
                        }
                    }
                });
                engine.clearScene();
            }
        };
    }
};

