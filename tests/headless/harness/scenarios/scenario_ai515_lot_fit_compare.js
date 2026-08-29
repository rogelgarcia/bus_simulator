// Harness scenario: the same catalog building fitted to narrow and wide city lots.
import { City } from '/src/graphics/visuals/city/City.js';
import { getBuildingConfigById } from '/src/graphics/content3d/catalogs/BuildingConfigCatalog.js';
import { computeFrameDistanceForSphere } from '/src/graphics/engine3d/camera/ToolCameraController.js';
import { PbrTextureLoaderService } from '/src/graphics/content3d/materials/PbrTexturePipeline.js';
import { createHarnessCitySpec } from './ScenarioCitySpec.js';

function collectPbrMaterialIds(config) {
    const ids = new Set(['pbr.grass_004']);
    for (const match of JSON.stringify(config).matchAll(/"(pbr\.[a-z0-9_]+)"/g)) ids.add(match[1]);
    return Array.from(ids);
}

function isTextureReady(texture) {
    const image = texture?.source?.data ?? texture?.image ?? null;
    if (!image || image.complete === false) return false;
    return Number(image.width) > 0 || !!image.data;
}

function collectTextureStats(root) {
    const seen = new Set();
    const stats = { total: 0, ready: 0 };
    root?.traverse?.((object) => {
        const materials = Array.isArray(object?.material) ? object.material : (object?.material ? [object.material] : []);
        for (const material of materials) {
            for (const value of Object.values(material ?? {})) {
                if (!value?.isTexture || seen.has(value)) continue;
                seen.add(value);
                stats.total += 1;
                if (isTextureReady(value)) stats.ready += 1;
            }
        }
    });
    return stats;
}

function objectBounds(THREE, object) {
    object?.updateMatrixWorld?.(true);
    const box = new THREE.Box3().setFromObject(object);
    return {
        minX: box.min.x,
        maxX: box.max.x,
        minZ: box.min.z,
        maxZ: box.max.z,
        width: box.max.x - box.min.x,
        depth: box.max.z - box.min.z
    };
}

export const scenarioAi515LotFitCompare = {
    id: 'ai515_lot_fit_compare',
    async create({ engine, THREE, seed }) {
        const buildingId = 'banded_loft_2';
        const config = getBuildingConfigById(buildingId);
        if (!config) throw new Error(`Missing catalog building "${buildingId}".`);

        engine.clearScene();
        const loader = new PbrTextureLoaderService({ renderer: engine.renderer });
        await loader.preloadCalibrationForMaterialIds(collectPbrMaterialIds(config));

        const size = 288;
        const mapTileSize = 24;
        const common = {
            configId: buildingId,
            fitToLot: true,
            materialVariationSeed: 515,
            footprintStretch: { quantumMeters: 0.1 },
            materialSlots: {
                slots: {
                    wallPrimary: { material: { kind: 'color', id: 'orange' } },
                    wallAccent: { material: { kind: 'color', id: 'offwhite' } },
                    trim: { material: { kind: 'color', id: 'offwhite' } },
                    base: { material: { kind: 'color', id: 'brown' } }
                }
            }
        };
        const mapSpec = createHarnessCitySpec({
            seed,
            size,
            mapTileSize,
            roads: [],
            buildings: [
                { ...common, id: 'ai515_narrow', tiles: [[4, 6]] },
                { ...common, id: 'ai515_wide', tiles: [[6, 6], [7, 6]] }
            ]
        });
        const city = new City({
            size,
            tileMeters: 2,
            mapTileSize,
            seed,
            mapSpec,
            generatorConfig: { render: { treesEnabled: false } },
            mergeBuildingGeometry: false
        });
        engine.context.city = city;
        city.attach(engine);
        if (city.world?.gridLines) city.world.gridLines.visible = false;
        const captureGroundMaterial = city.world?.floor
            ? new THREE.MeshStandardMaterial({ color: 0x526048, roughness: 1, metalness: 0 })
            : null;
        if (captureGroundMaterial) city.world.floor.material = captureGroundMaterial;
        const axes = city.group?.getObjectByName?.('OriginAxes') ?? null;
        if (axes) axes.visible = false;
        const hemisphere = new THREE.HemisphereLight(0xf4f7ff, 0x4a5548, 2.2);
        const sunlight = new THREE.DirectionalLight(0xfff1d2, 3.5);
        sunlight.position.set(55, 80, 65);
        engine.scene.add(hemisphere, sunlight);

        const narrow = city.buildings?.group?.getObjectByName('ai515_narrow') ?? null;
        const wide = city.buildings?.group?.getObjectByName('ai515_wide') ?? null;
        const frameRoot = city.buildings?.group ?? city.group;
        frameRoot.updateMatrixWorld(true);
        const frameBox = new THREE.Box3().setFromObject(frameRoot);
        const sphere = frameBox.getBoundingSphere(new THREE.Sphere());
        const distance = computeFrameDistanceForSphere({
            radius: sphere.radius || 1,
            fovDeg: engine.camera.fov,
            aspect: engine.camera.aspect || 1,
            padding: 1.06
        });
        const direction = new THREE.Vector3(0, 0.42, 1).normalize();
        const target = sphere.center.clone();
        target.y = Math.max(5, frameBox.min.y + (frameBox.max.y - frameBox.min.y) * 0.42);
        engine.camera.position.copy(target).addScaledVector(direction, distance);
        engine.camera.lookAt(target);
        engine.camera.updateProjectionMatrix();

        return {
            update() {
                city.update(engine);
            },
            getMetrics() {
                return {
                    buildingId,
                    narrow: objectBounds(THREE, narrow),
                    wide: objectBounds(THREE, wide),
                    textures: collectTextureStats(city.group)
                };
            },
            dispose() {
                engine.scene.remove(hemisphere, sunlight);
                city.detach(engine);
                captureGroundMaterial?.dispose();
                engine.context.city = null;
                engine.clearScene();
            }
        };
    }
};
