// Harness scenario: standalone showcase of one catalog building, rendered the
// same way the game renders it (grass terrain, foundation slab, gradient sky,
// city sun/hemisphere lighting and resolved option defaults).
import { City } from '/src/graphics/visuals/city/City.js';
import { createCityConfig } from '/src/app/city/CityConfig.js';
import { getBuildingConfigById, getBuildingConfigs } from '/src/graphics/content3d/catalogs/BuildingConfigCatalog.js';
import { getResolvedLightingSettings } from '/src/graphics/lighting/LightingSettings.js';
import { getIBLConfig } from '/src/graphics/content3d/lighting/IBLConfig.js';
import { applyIBLIntensity, applyIBLToScene, loadIBLTexture } from '/src/graphics/lighting/IBL.js';
import { computeFrameDistanceForSphere } from '/src/graphics/engine3d/camera/ToolCameraController.js';
import { PbrTextureLoaderService } from '/src/graphics/content3d/materials/PbrTexturePipeline.js';
import { preloadPortalOrnamentParts } from '/src/graphics/assets3d/generators/building_fabrication/PortalOrnamentParts.js';
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
    'portalDefinitions',
    'windowVisuals',
    'windows',
    'floors',
    'floorHeight',
    'style',
    'wallInset',
    'materialVariationSeed',
    'cornerTreatment',
    'edgeBevel',
    'materialSlots'
]);

function collectPbrMaterialIds(config, configOverrides = null) {
    const ids = new Set(['pbr.grass_004']);
    const json = JSON.stringify(config) + (configOverrides ? JSON.stringify(configOverrides) : '');
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

async function waitForTextureImages(textures, { timeoutMs = 20_000 } = {}) {
    const unique = Array.from(new Set(textures.filter((texture) => texture?.isTexture)));
    if (!unique.length) throw new Error('Building showcase requires decoded ground textures');
    const deadline = performance.now() + timeoutMs;
    while (unique.some((texture) => !isTextureImageLoaded(texture))) {
        if (performance.now() >= deadline) {
            throw new Error('Building showcase timed out waiting for ground textures');
        }
        await new Promise((resolve) => setTimeout(resolve, 16));
    }
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
        const overridesForPreload = options?.configOverrides && typeof options.configOverrides === 'object'
            ? options.configOverrides
            : null;
        const calibrationLoader = new PbrTextureLoaderService({ renderer: engine.renderer });
        await calibrationLoader.preloadCalibrationForMaterialIds(collectPbrMaterialIds(config, overridesForPreload));
        // AI 510: portal ornament GLBs follow the same cold-start contract —
        // the sync building generator can only use preloaded templates.
        await preloadPortalOrnamentParts();

        const size = Number.isFinite(options?.size) ? options.size : DEFAULT_SIZE;
        const mapTileSize = Number.isFinite(options?.mapTileSize) ? options.mapTileSize : DEFAULT_MAP_TILE_SIZE;
        const cityCfg = createCityConfig({ size, tileMeters: 2, mapTileSize, seed });
        const tileSize = cityCfg.map.tileSize;
        const origin = cityCfg.map.origin;

        // Lets a test render the catalog design with one part swapped out (a
        // facade, a decoration set) without adding a config to the catalog.
        const configOverrides = options?.configOverrides && typeof options.configOverrides === 'object'
            ? options.configOverrides
            : null;
        // A footprint override wins over the catalog's; both are authored
        // around the origin and translated onto the build site here.
        const footprintLoops = Array.isArray(configOverrides?.footprintLoops) && configOverrides.footprintLoops.length
            ? configOverrides.footprintLoops
            : config.footprintLoops;

        // Build area near the map center, sized FROM the footprint: a fixed
        // 2x1-tile area silently COMPRESSED any footprint deeper/wider than
        // 48x24m (CityMap squeezes the loop into the buildable area, which
        // shrinks every solved bay — the bradbury 46x38 lost ~40% of its
        // depth this way). Default stays 2x1 for footprint-less configs.
        const cx = Math.floor(cityCfg.map.width / 2);
        const cy = Math.floor(cityCfg.map.height / 2);
        let tilesX = 2;
        let tilesY = 1;
        if (Array.isArray(footprintLoops) && footprintLoops.length) {
            let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
            for (const loop of footprintLoops) {
                for (const p of (Array.isArray(loop) ? loop : [])) {
                    const px = Number(p?.x) || 0;
                    const pz = Number(p?.z) || 0;
                    if (px < minX) minX = px;
                    if (px > maxX) maxX = px;
                    if (pz < minZ) minZ = pz;
                    if (pz > maxZ) maxZ = pz;
                }
            }
            if (maxX > minX && maxZ > minZ) {
                tilesX = Math.max(2, Math.ceil((maxX - minX + 2) / tileSize));
                tilesY = Math.max(1, Math.ceil((maxZ - minZ + 2) / tileSize));
            }
        }
        const x0 = cx - Math.ceil(tilesX / 2);
        const y0 = cy - Math.ceil(tilesY / 2);
        const tiles = [];
        for (let iy = 0; iy < tilesY; iy++) {
            for (let ix = 0; ix < tilesX; ix++) tiles.push([x0 + ix, y0 + iy]);
        }
        const centroid = {
            x: origin.x + (x0 + (tilesX - 1) * 0.5) * tileSize,
            z: origin.z + (y0 + (tilesY - 1) * 0.5) * tileSize
        };

        const entryId = `showcase_${config.id}`;
        const entry = { id: entryId, configId: config.id, tiles };
        for (const key of CONFIG_OVERRIDE_KEYS) {
            const value = config[key];
            if (value !== undefined && value !== null) entry[key] = value;
        }
        for (const key of CONFIG_OVERRIDE_KEYS) {
            const value = configOverrides?.[key];
            if (value !== undefined && value !== null) entry[key] = value;
        }
        if (Array.isArray(footprintLoops) && footprintLoops.length) {
            entry.footprintLoops = footprintLoops.map((loop) => loop.map((point) => ({
                x: (Number(point?.x) || 0) + centroid.x,
                z: (Number(point?.z) || 0) + centroid.z,
                ...(typeof point?.cornerId === 'string' && point.cornerId ? { cornerId: point.cornerId } : {}),
                ...(typeof point?.runId === 'string' ? { runId: point.runId } : {}),
                ...(typeof point?.runForward === 'boolean' ? { runForward: point.runForward } : {}),
                ...(point?.split === true ? { split: true } : {}),
                ...(point?.arc && typeof point.arc === 'object' ? { arc: { ...point.arc } } : {})
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
            mergeBuildingWindowAssemblies: options?.mergeBuildingWindowAssemblies !== false,
            mergeDedupeMaterials: options?.mergeDedupeMaterials !== false
        });

        if (options?.waitForGroundTextures === true) {
            await waitForTextureImages([
                city.world?.floor?.material?.map,
                city.world?.groundTiles?.material?.map
            ]);
        }

        const groundMaterialRestore = [];
        const groundPresentation = options?.groundPresentation && typeof options.groundPresentation === 'object'
            ? options.groundPresentation
            : null;
        if (groundPresentation) {
            for (const mesh of [city.world?.floor, city.world?.groundTiles]) {
                const original = mesh?.material ?? null;
                if (!mesh || !original?.map) continue;
                const visibleMaterial = new THREE.MeshBasicMaterial({
                    color: Number.isFinite(groundPresentation.color) ? groundPresentation.color : 0xffffff,
                    map: original.map,
                    fog: true
                });
                groundMaterialRestore.push({ mesh, original, visibleMaterial });
                mesh.material = visibleMaterial;
            }
        }

        engine.context.city = city;
        city.attach(engine);

        const lightingOptions = options?.lighting && typeof options.lighting === 'object'
            ? options.lighting
            : null;
        if (Number.isFinite(lightingOptions?.hemiIntensity) && city.hemi) {
            city.hemi.intensity = Math.max(0, lightingOptions.hemiIntensity);
        }
        if (Number.isFinite(lightingOptions?.sunIntensity)) {
            city.setSunIntensity(Math.max(0, lightingOptions.sunIntensity));
        }

        const hdriOptions = options?.hdri && typeof options.hdri === 'object'
            ? options.hdri
            : null;
        const previousLighting = hdriOptions ? engine.lightingSettings : null;
        const previousEnvironmentPresentation = hdriOptions ? {
            backgroundBlurriness: engine.scene.backgroundBlurriness,
            backgroundIntensity: engine.scene.backgroundIntensity,
            backgroundRotationY: engine.scene.backgroundRotation?.y ?? 0,
            environmentRotationY: engine.scene.environmentRotation?.y ?? 0
        } : null;
        let showcaseIblConfig = null;
        if (hdriOptions) {
            showcaseIblConfig = getIBLConfig({
                ...(engine.lightingSettings?.ibl ?? {}),
                ...hdriOptions,
                enabled: true,
                setBackground: true
            }, { includeUrlOverrides: false });
            engine.setLightingSettings({
                ...engine.lightingSettings,
                ibl: showcaseIblConfig
            });
            const backgroundRotationY = THREE.MathUtils.degToRad(
                Number(hdriOptions.backgroundRotationDeg ?? hdriOptions.rotationDeg) || 0
            );
            const environmentRotationY = THREE.MathUtils.degToRad(
                Number(hdriOptions.environmentRotationDeg ?? hdriOptions.rotationDeg) || 0
            );
            if (engine.scene.backgroundRotation?.set) engine.scene.backgroundRotation.set(0, backgroundRotationY, 0);
            if (engine.scene.environmentRotation?.set) engine.scene.environmentRotation.set(0, environmentRotationY, 0);
            const envMap = await loadIBLTexture(engine.renderer, showcaseIblConfig);
            applyIBLToScene(engine.scene, envMap, showcaseIblConfig);
            applyIBLIntensity(engine.scene, showcaseIblConfig, { force: true });
            if (Number.isFinite(hdriOptions.backgroundBlurriness)) {
                engine.scene.backgroundBlurriness = Math.max(0, Math.min(1, hdriOptions.backgroundBlurriness));
            }
            if (Number.isFinite(hdriOptions.backgroundIntensity)) {
                engine.scene.backgroundIntensity = Math.max(0, hdriOptions.backgroundIntensity);
            }
            city.update(engine);
        }

        // Default showcase sun: high right of the corner view (azimuth 65)
        // so the +x face is always the lit one, with reveal shadows falling
        // the reference's way. Overridable per capture via options.sun.
        const sunOpt = options?.sun && typeof options.sun === 'object' ? options.sun : null;
        if (engine?.atmosphereSettings?.sun) {
            engine.atmosphereSettings.sun.azimuthDeg = Number.isFinite(sunOpt?.azimuthDeg) ? sunOpt.azimuthDeg : 65;
            engine.atmosphereSettings.sun.elevationDeg = Number.isFinite(sunOpt?.elevationDeg) ? sunOpt.elevationDeg : 35;
        }

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

        const iblExpected = !!showcaseIblConfig?.enabled || getResolvedLightingSettings()?.ibl?.enabled === true;

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
                        present: !!engine.scene.environment,
                        backgroundExpected: !!showcaseIblConfig?.setBackground,
                        backgroundPresent: !!engine.scene.background?.isTexture,
                        hdrUrl: engine.scene.environment?.userData?.iblHdrUrl ?? null,
                        iblId: showcaseIblConfig?.iblId ?? null,
                        iblLabel: showcaseIblConfig?.iblLabel ?? null,
                        skyDomeVisible: city.sky?.visible !== false
                    },
                    render: {
                        shadowMapEnabled: !!engine.renderer?.shadowMap?.enabled,
                        toneMapping: engine.renderer?.toneMapping ?? null,
                        toneMappingExposure: engine.renderer?.toneMappingExposure ?? null
                    },
                    ground: {
                        materialId: 'pbr.grass_004',
                        floorMapPresent: !!city.world?.floor?.material?.map,
                        floorMapReady: isTextureImageLoaded(city.world?.floor?.material?.map),
                        tileMapPresent: !!city.world?.groundTiles?.material?.map,
                        tileMapReady: isTextureImageLoaded(city.world?.groundTiles?.material?.map),
                        floorColorHex: city.world?.floor?.material?.color?.getHex?.() ?? null,
                        visibilityBoostApplied: !!city.world?.floor?.material?.isMeshBasicMaterial
                    },
                    camera: {
                        position: engine.camera.position.toArray(),
                        quaternion: engine.camera.quaternion.toArray(),
                        target: target.toArray()
                    }
                };
            },
            dispose() {
                for (const entry of groundMaterialRestore) {
                    entry.mesh.material = entry.original;
                    entry.visibleMaterial.dispose();
                }
                city.detach(engine);
                if (previousLighting) engine.setLightingSettings(previousLighting);
                if (previousEnvironmentPresentation) {
                    engine.scene.backgroundBlurriness = previousEnvironmentPresentation.backgroundBlurriness;
                    engine.scene.backgroundIntensity = previousEnvironmentPresentation.backgroundIntensity;
                    if (engine.scene.backgroundRotation?.set) {
                        engine.scene.backgroundRotation.set(0, previousEnvironmentPresentation.backgroundRotationY, 0);
                    }
                    if (engine.scene.environmentRotation?.set) {
                        engine.scene.environmentRotation.set(0, previousEnvironmentPresentation.environmentRotationY, 0);
                    }
                }
                engine.context.city = null;
                engine.clearScene();
            }
        };
    }
};
