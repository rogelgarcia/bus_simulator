// Harness scenario: standalone showcase of one catalog building, rendered the
// same way the game renders it (grass terrain, foundation slab, gradient sky,
// city sun/hemisphere lighting and resolved option defaults).
import { City } from '/src/graphics/visuals/city/City.js';
import { createCityConfig } from '/src/app/city/CityConfig.js';
import { getBuildingConfigById, getBuildingConfigs } from '/src/graphics/content3d/catalogs/BuildingConfigCatalog.js';
import { getResolvedLightingSettings } from '/src/graphics/lighting/LightingSettings.js';
import { computeFrameDistanceForSphere } from '/src/graphics/engine3d/camera/ToolCameraController.js';
import { PbrTextureLoaderService } from '/src/graphics/content3d/materials/PbrTexturePipeline.js';
import { createHarnessCitySpec } from './ScenarioCitySpec.js';

const DEFAULT_SIZE = 240;
const DEFAULT_MAP_TILE_SIZE = 24;
// Default view: designed front facade (A, +z) sunlit, with the sun shadow cast
// toward -x/-z falling on the visible side of the building.
const CAMERA_DIR = { x: -0.75, y: 0.45, z: 1.0 };
const CAMERA_PADDING = 1.2;

// Keys CityMap.fromSpec reads via raw-first override; passing them pins the
// requested design even where configId resolution would pick a variant
// (e.g. brick_midrise randomly swaps with brick_midrise_2 per map seed).
const CONFIG_OVERRIDE_KEYS = Object.freeze([
    'layers',
    'facades',
    'wallDecorations',
    'attachments',
    'windowDefinitions',
    'windowVisuals',
    'windows',
    'floors',
    'floorHeight',
    'style',
    'wallInset',
    'materialVariationSeed',
    'cornerTreatment',
    'materialSlots'
]);

function collectPbrMaterialIds(config) {
    const ids = new Set(['pbr.grass_004']);
    const json = JSON.stringify(config);
    for (const match of json.matchAll(/"(pbr\.[a-z0-9_]+)"/g)) ids.add(match[1]);
    return Array.from(ids);
}

function isTextureImageLoaded(texture) {
    // A window interior atlas starts life as a procedural placeholder canvas
    // that already "has an image", so without this check the readiness gate is
    // satisfied while the real atlas is still missing (AI 500).
    if (texture?.userData?.windowInteriorAtlasPending) return false;
    const img = texture?.source?.data ?? texture?.image ?? null;
    if (!img) return false;
    if (img.complete === false) return false;
    if (Number(img.width) > 0) return true;
    return !!img.data;
}

function collectTextureStats(root) {
    const seen = new Set();
    const stats = { total: 0, ready: 0 };
    root?.traverse?.((obj) => {
        const mat = obj?.material ?? null;
        const mats = Array.isArray(mat) ? mat : (mat ? [mat] : []);
        for (const m of mats) {
            if (!m || typeof m !== 'object') continue;
            for (const key of Object.keys(m)) {
                const value = m[key];
                if (!value?.isTexture || seen.has(value)) continue;
                seen.add(value);
                stats.total += 1;
                if (isTextureImageLoaded(value)) stats.ready += 1;
            }
        }
    });
    return stats;
}

export const scenarioBuildingShowcase = {
    id: 'building_showcase',
    async create({ engine, THREE, seed, options }) {
        const buildingId = typeof options?.buildingId === 'string' ? options.buildingId.trim() : '';
        const config = getBuildingConfigById(buildingId);
        if (!config) {
            const available = getBuildingConfigs().map((cfg) => cfg.id).join(', ');
            throw new Error(`Unknown buildingId "${buildingId}". Available: ${available}`);
        }

        engine.clearScene();

        // Warm the shared PBR calibration cache before the city resolves its
        // materials; a cold start would otherwise render uncorrected textures
        // (the running game has this cache warm long before a city builds).
        const calibrationLoader = new PbrTextureLoaderService({ renderer: engine.renderer });
        await calibrationLoader.preloadCalibrationForMaterialIds(collectPbrMaterialIds(config));

        const size = Number.isFinite(options?.size) ? options.size : DEFAULT_SIZE;
        const mapTileSize = Number.isFinite(options?.mapTileSize) ? options.mapTileSize : DEFAULT_MAP_TILE_SIZE;
        const cityCfg = createCityConfig({ size, tileMeters: 2, mapTileSize, seed });
        const tileSize = cityCfg.map.tileSize;
        const origin = cityCfg.map.origin;

        // Two adjacent tiles near the map center (catalog footprints are
        // authored against a 2x1-tile build area).
        const cx = Math.floor(cityCfg.map.width / 2);
        const cy = Math.floor(cityCfg.map.height / 2);
        const tiles = [[cx - 1, cy], [cx, cy]];
        const centroid = {
            x: origin.x + (cx - 0.5) * tileSize,
            z: origin.z + cy * tileSize
        };

        const entryId = `showcase_${config.id}`;
        const entry = { id: entryId, configId: config.id, tiles };
        for (const key of CONFIG_OVERRIDE_KEYS) {
            const value = config[key];
            if (value !== undefined && value !== null) entry[key] = value;
        }
        if (Array.isArray(config.footprintLoops) && config.footprintLoops.length) {
            entry.footprintLoops = config.footprintLoops.map((loop) => loop.map((point) => ({
                x: (Number(point?.x) || 0) + centroid.x,
                z: (Number(point?.z) || 0) + centroid.z
            })));
        }

        const mapSpec = createHarnessCitySpec({
            seed,
            size,
            mapTileSize,
            roads: [],
            buildings: [entry]
        });

        const city = new City({
            size,
            tileMeters: 2,
            mapTileSize,
            seed,
            mapSpec,
            generatorConfig: { render: { treesEnabled: false } },
            // A/B hook: lets a capture compare merged vs unmerged building geometry.
            mergeBuildingGeometry: options?.mergeBuildingGeometry !== false,
            mergeDedupeMaterials: options?.mergeDedupeMaterials !== false
        });

        engine.context.city = city;
        city.attach(engine);

        // Showcase should read like the game, not the debug view: hide the tile
        // grid and origin axes helpers the city adds for development.
        if (city.world?.gridLines) city.world.gridLines.visible = false;
        const originAxes = city.group?.getObjectByName?.('OriginAxes') ?? null;
        if (originAxes) originAxes.visible = false;

        const buildingGroup = city.buildings?.group?.getObjectByName(entryId) ?? null;
        const frameTarget = buildingGroup ?? city.buildings?.group ?? city.group;
        frameTarget.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(frameTarget);
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);

        const cameraDir = options?.cameraDir && typeof options.cameraDir === 'object'
            ? options.cameraDir
            : CAMERA_DIR;
        const padding = Number.isFinite(options?.cameraPadding) ? options.cameraPadding : CAMERA_PADDING;
        const dist = computeFrameDistanceForSphere({
            radius: sphere.radius || 1,
            fovDeg: engine.camera.fov,
            aspect: engine.camera.aspect || 1,
            padding
        });
        const dir = new THREE.Vector3(
            Number(cameraDir.x) || 0,
            Number(cameraDir.y) || 0,
            Number(cameraDir.z) || 0
        ).normalize();
        // Optional close-up aim: 0 = building bottom, 1 = top (default center).
        const target = sphere.center.clone();
        if (Number.isFinite(options?.cameraTargetYFrac)) {
            const frac = Math.max(0, Math.min(1, Number(options.cameraTargetYFrac)));
            target.y = box.min.y + (box.max.y - box.min.y) * frac;
        }
        engine.camera.position.copy(target).addScaledVector(dir, dist);
        engine.camera.lookAt(target);
        engine.camera.updateProjectionMatrix();

        const iblExpected = getResolvedLightingSettings()?.ibl?.enabled === true;

        return {
            update(dt) {
                void dt;
                city.update(engine);
            },
            getMetrics() {
                return {
                    buildingId: config.id,
                    buildingName: config.name ?? config.id,
                    entryId,
                    building: {
                        present: !!buildingGroup,
                        meshCount: buildingGroup ? buildingGroup.children.length : 0
                    },
                    textures: collectTextureStats(city.group),
                    environment: {
                        expected: iblExpected,
                        present: !!engine.scene.environment
                    },
                    render: {
                        shadowMapEnabled: !!engine.renderer?.shadowMap?.enabled,
                        toneMapping: engine.renderer?.toneMapping ?? null,
                        toneMappingExposure: engine.renderer?.toneMappingExposure ?? null
                    },
                    ground: {
                        floorMapPresent: !!city.world?.floor?.material?.map,
                        floorMapReady: isTextureImageLoaded(city.world?.floor?.material?.map),
                        floorColorHex: city.world?.floor?.material?.color?.getHex?.() ?? null
                    }
                };
            },
            dispose() {
                city.detach(engine);
                engine.context.city = null;
                engine.clearScene();
            }
        };
    }
};
