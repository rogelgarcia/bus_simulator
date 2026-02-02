// src/graphics/visuals/city/City.js
// Builds and manages the city scene
// @ts-check
import * as THREE from 'three';
import { createCityConfig } from '../../../app/city/CityConfig.js';
import { CityMap } from '../../../app/city/CityMap.js';
import { CityRNG } from '../../../app/city/CityRNG.js';
import { computeTrafficControlPlacements } from '../../../app/city/TrafficControlPlacement.js';
import { createCityWorld } from '../../assets3d/generators/TerrainGenerator.js';
import { createGeneratorConfig } from '../../assets3d/generators/GeneratorParams.js';
import { applyAtmosphereToSkyDome, createGradientSkyDome, shouldShowSkyDome } from '../../assets3d/generators/SkyGenerator.js';
import { BuildingWallTextureCache, buildBuildingVisualParts } from '../../assets3d/generators/buildings/BuildingGenerator.js';
import { buildBuildingFabricationVisualParts } from '../../assets3d/generators/building_fabrication/BuildingFabricationGenerator.js';
import { getCityMaterials } from '../../assets3d/textures/CityMaterials.js';
import { getResolvedLightingSettings } from '../../lighting/LightingSettings.js';
import { getResolvedShadowSettings, getShadowQualityPreset } from '../../lighting/ShadowSettings.js';
import { azimuthElevationDegToDir } from '../atmosphere/SunDirection.js';
import { getResolvedBuildingWindowVisualsSettings } from '../buildings/BuildingWindowVisualsSettings.js';
import { getResolvedSunFlareSettings } from '../sun/SunFlareSettings.js';
import { SunFlareRig } from '../sun/SunFlareRig.js';
import { SunBloomRig } from '../sun/SunBloomRig.js';
import { getResolvedSunBloomSettings } from '../postprocessing/SunBloomSettings.js';
import { SunRaysRig } from '../sun/SunRaysRig.js';
import { createRoadEngineRoads } from './RoadEngineRoads.js';
import { createTrafficControlProps } from './TrafficControlProps.js';

const MATERIAL_SHADOW_SIDE_ORIGINAL = new WeakMap();

function applyShadowSideToObject(root, shadowSide) {
    if (!root?.traverse) return;

    root.traverse((o) => {
        if (!o || !o.isMesh || !o.material || !o.castShadow) return;

        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) {
            if (!mat || typeof mat !== 'object' || !('shadowSide' in mat)) continue;

            if (shadowSide !== null && shadowSide !== undefined) {
                if (!MATERIAL_SHADOW_SIDE_ORIGINAL.has(mat)) MATERIAL_SHADOW_SIDE_ORIGINAL.set(mat, mat.shadowSide ?? null);
                mat.shadowSide = shadowSide;
                continue;
            }

            if (MATERIAL_SHADOW_SIDE_ORIGINAL.has(mat)) {
                mat.shadowSide = MATERIAL_SHADOW_SIDE_ORIGINAL.get(mat);
                MATERIAL_SHADOW_SIDE_ORIGINAL.delete(mat);
            }
        }
    });
}

export class City {
    constructor(options = {}) {
        const {
            size = 400,
            tileMeters = 2,
            mapTileSize = 24,
            seed = 'demo-001',
            mapSpec = null,
            generatorConfig = null
        } = options;

        this.config = {
            size,
            tileMeters,
            fogColor: '#EAF9FF',
            fogNear: 80,
            fogFar: 900,
            cameraNear: 0.5,
            cameraFar: 1800
        };

        this.group = new THREE.Group();
        this.group.name = 'City';

        const originAxes = new THREE.AxesHelper(8);
        originAxes.name = 'OriginAxes';
        originAxes.position.set(0, 0, 0);
        this.group.add(originAxes);

        const lighting = getResolvedLightingSettings();
        const buildingWindowVisuals = getResolvedBuildingWindowVisualsSettings();

        this.hemi = new THREE.HemisphereLight(0xffffff, 0x2a3b1f, lighting.hemiIntensity);
        this.hemi.position.set(0, 100, 0);
        this.group.add(this.hemi);

        this.sun = new THREE.DirectionalLight(0xffffff, lighting.sunIntensity);
        this.sun.position.set(80, 140, 60);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        this.sun.shadow.camera.near = 1;
        this.sun.shadow.camera.far = 600;
        const halfSize = Math.max(50, size * 0.5);
        const padding = Math.max(20, Math.min(80, halfSize * 0.1));
        const half = halfSize + padding;
        this.sun.shadow.camera.left = -half;
        this.sun.shadow.camera.right = half;
        this.sun.shadow.camera.top = half;
        this.sun.shadow.camera.bottom = -half;
        this.sun.shadow.camera.updateProjectionMatrix();
        this.group.add(this.sun);

        this.sky = createGradientSkyDome({
            sunDir: this.sun.position.clone().normalize(),
            sunIntensity: 0.28
        });
        this.group.add(this.sky);

        this.sunFlare = null;
        if (typeof window !== 'undefined') {
            const sunFlareSettings = getResolvedSunFlareSettings();
            this.sunFlare = new SunFlareRig({ light: this.sun, settings: sunFlareSettings });
            this.group.add(this.sunFlare.group);
        }

        this.sunBloom = null;
        if (typeof window !== 'undefined') {
            const sunBloomSettings = getResolvedSunBloomSettings();
            this.sunBloom = new SunBloomRig({ light: this.sun, sky: this.sky, settings: sunBloomSettings });
            this.group.add(this.sunBloom.group);
        }

        this.sunRays = null;
        if (typeof window !== 'undefined') {
            const sunBloomSettings = getResolvedSunBloomSettings();
            this.sunRays = new SunRaysRig({ light: this.sun, sky: this.sky, settings: sunBloomSettings });
            this.group.add(this.sunRays.group);
        }

        const resolvedSeed = mapSpec?.seed ?? seed;
        this.genConfig = createCityConfig({ size, tileMeters, mapTileSize, seed: resolvedSeed });
        this.generatorConfig = createGeneratorConfig(generatorConfig ?? {});

        this.rng = new CityRNG(this.genConfig.seed);

        const spec = mapSpec ?? CityMap.demoSpec(this.genConfig);
        this.map = CityMap.fromSpec(spec, this.genConfig);

        this.world = createCityWorld({
            size,
            tileMeters,
            map: this.map,
            config: this.generatorConfig,
            rng: this.rng
        });
        this.group.add(this.world.group);

        this.materials = getCityMaterials();
        this.roads = createRoadEngineRoads({ map: this.map, config: this.generatorConfig, materials: this.materials });
        this.group.add(this.roads.group);

        this.trafficControls = null;
        const trafficControlPlacements = computeTrafficControlPlacements({
            map: this.map,
            generatorConfig: this.generatorConfig
        });
        if (trafficControlPlacements.length) {
            this.trafficControls = createTrafficControlProps({ placements: trafficControlPlacements });
            this.group.add(this.trafficControls.group);
        }

        this.buildings = null;
        const buildingsList = Array.isArray(this.map.buildings) ? this.map.buildings : [];
        if (buildingsList.length) {
            const buildingsGroup = new THREE.Group();
            buildingsGroup.name = 'Buildings';

            const textures = new BuildingWallTextureCache();
            for (const entry of buildingsList) {
                const wallInset = Number.isFinite(entry?.wallInset) ? entry.wallInset : 0.0;
                const hasLayers = Array.isArray(entry?.layers) && entry.layers.length;
                const windowsSpec = entry?.windows ?? null;
                const windowsEnabled = !!windowsSpec && typeof windowsSpec === 'object';
                const overrideWindowVisuals = entry?.windowVisuals ?? null;
                const resolvedWindowVisuals = overrideWindowVisuals ?? buildingWindowVisuals;
                const windowVisualsIsOverride = !!overrideWindowVisuals && typeof overrideWindowVisuals === 'object';
                const parts = hasLayers
                    ? buildBuildingFabricationVisualParts({
                        map: this.map,
                        tiles: entry.tiles,
                        generatorConfig: this.generatorConfig,
                        tileSize: this.map.tileSize,
                        occupyRatio: 1.0,
                        layers: entry.layers,
                        materialVariationSeed: entry.materialVariationSeed,
                        textureCache: textures,
                        renderer: null,
                        windowVisuals: resolvedWindowVisuals,
                        windowVisualsIsOverride,
                        facades: entry.facades ?? null,
                        windowDefinitions: entry.windowDefinitions ?? null,
                        overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
                        walls: { inset: wallInset }
                    })
                    : buildBuildingVisualParts({
                        map: this.map,
                        tiles: entry.tiles,
                        generatorConfig: this.generatorConfig,
                        tileSize: this.map.tileSize,
                        occupyRatio: 1.0,
                        floors: entry.floors,
                        floorHeight: entry.floorHeight,
                        style: entry.style,
                        textureCache: textures,
                        renderer: null,
                        windowVisuals: resolvedWindowVisuals,
                        windowVisualsIsOverride,
                        overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
                        walls: { inset: wallInset },
                        windows: windowsEnabled ? {
                            enabled: true,
                            width: windowsSpec.width,
                            gap: windowsSpec.gap,
                            height: windowsSpec.height,
                            y: windowsSpec.y,
                            cornerEps: 0.12,
                            offset: 0.005
                        } : null
                    });
                if (!parts) continue;
                if (Array.isArray(parts.warnings) && parts.warnings.length) {
                    console.warn(`[City] Building "${entry.id ?? 'building'}":`, parts.warnings);
                }

                const buildingGroup = new THREE.Group();
                buildingGroup.name = entry.id ?? 'building';
                for (const mesh of parts.solidMeshes) buildingGroup.add(mesh);
                if (parts.windows) buildingGroup.add(parts.windows);
                if (parts.beltCourse) buildingGroup.add(parts.beltCourse);
                if (parts.topBelt) buildingGroup.add(parts.topBelt);
                buildingsGroup.add(buildingGroup);
            }

            this.buildings = { group: buildingsGroup, textures };
            this.group.add(buildingsGroup);
        }

        this._attached = false;
        this._restore = null;
    }

    attach(engine) {
        if (this._attached) return;

        this._restore = {
            bg: engine.scene.background,
            fog: engine.scene.fog,
            near: engine.camera.near,
            far: engine.camera.far
        };

        this._syncSkyVisibility(engine);
        this._applyAtmosphere(engine);
        const bg = engine.scene.background ?? null;
        const bgIsTexture = !!bg && !!bg.isTexture;
        const wantsIblBackground = !!engine?.lightingSettings?.ibl?.setBackground;
        if (!wantsIblBackground || !bgIsTexture) engine.scene.background = null;
        engine.scene.fog = new THREE.Fog(this.config.fogColor, this.config.fogNear, this.config.fogFar);

        engine.camera.near = Math.max(engine.camera.near, this.config.cameraNear);
        engine.camera.far = Math.max(engine.camera.far, this.config.cameraFar);
        engine.camera.updateProjectionMatrix();

        engine.scene.add(this.group);
        this.applyShadowSettings(engine);
        this._attached = true;
    }

    detach(engine) {
        if (!this._attached) return;

        engine.scene.remove(this.group);
        applyShadowSideToObject(this.group, null);

        if (this._restore) {
            engine.scene.background = this._restore.bg ?? null;
            engine.scene.fog = this._restore.fog ?? null;
            engine.camera.near = this._restore.near ?? engine.camera.near;
            engine.camera.far = this._restore.far ?? engine.camera.far;
            engine.camera.updateProjectionMatrix();
        }

        this._restore = null;
        this._attached = false;
    }

    applyShadowSettings(engine) {
        const renderer = engine?.renderer ?? null;
        const settings = engine?.shadowSettings ?? getResolvedShadowSettings();
        const preset = getShadowQualityPreset(settings?.quality);
        const enabled = !!preset.enabled;

        if (this.sun) {
            this.sun.castShadow = enabled;
            this.sun.shadow.bias = preset.bias;
            if ('normalBias' in this.sun.shadow) this.sun.shadow.normalBias = preset.normalBias;
            if ('radius' in this.sun.shadow) this.sun.shadow.radius = preset.radius;

            if (enabled && preset.mapSize > 0) {
                const capsMax = Number.isFinite(renderer?.capabilities?.maxTextureSize)
                    ? Math.max(256, Math.floor(renderer.capabilities.maxTextureSize))
                    : preset.mapSize;
                const size = Math.max(256, Math.min(preset.mapSize, 4096, capsMax));
                const current = this.sun.shadow.mapSize;
                if (current?.x !== size || current?.y !== size) {
                    this.sun.shadow.mapSize.set(size, size);
                    if (this.sun.shadow.map?.dispose) this.sun.shadow.map.dispose();
                    this.sun.shadow.map = null;
                }
            }
        }

        const wantsTwoSided = enabled && preset.twoSidedCasting;
        applyShadowSideToObject(this.group, wantsTwoSided ? THREE.DoubleSide : null);
    }

    update(engine) {
        this._applyAtmosphere(engine);
        this.sky.position.copy(engine.camera.position);
        this._syncSkyVisibility(engine);
        this.sunFlare?.update?.(engine);
        this.sunBloom?.update?.(engine);
        this.sunRays?.update?.(engine);
    }

    _applyAtmosphere(engine) {
        const atmo = engine?.atmosphereSettings ?? null;
        if (!atmo) return;

        const azimuthDeg = atmo?.sun?.azimuthDeg ?? null;
        const elevationDeg = atmo?.sun?.elevationDeg ?? null;
        if (this.sun && Number.isFinite(azimuthDeg) && Number.isFinite(elevationDeg)) {
            const dir = azimuthElevationDegToDir(azimuthDeg, elevationDeg);
            const dist = this.sun.position.length() > 1e-6 ? this.sun.position.length() : 200;
            this.sun.position.copy(dir).multiplyScalar(dist);
            this.sun.target.position.set(0, 0, 0);
            this.sun.target.updateMatrixWorld?.();
        }

        applyAtmosphereToSkyDome(this.sky, atmo, { sunDir: this.sun?.position ?? null });

        const fogColor = atmo?.sky?.horizonColor ?? null;
        if (typeof fogColor === 'string' && fogColor) this.config.fogColor = fogColor;
        const fog = engine?.scene?.fog ?? null;
        if (fog?.isFog && typeof fogColor === 'string' && fogColor) fog.color.set(fogColor);
    }

    _syncSkyVisibility(engine) {
        const wantsIblBackground = !!engine?.lightingSettings?.ibl?.setBackground;
        const showSky = shouldShowSkyDome({
            skyIblBackgroundMode: engine?.atmosphereSettings?.sky?.iblBackgroundMode ?? 'ibl',
            lightingIblSetBackground: wantsIblBackground,
            sceneBackground: engine?.scene?.background ?? null
        });
        if (this.sky) this.sky.visible = showSky;
    }
}

export function getSharedCity(engine, options = {}) {
    engine.context.city ??= new City(options);
    return engine.context.city;
}
