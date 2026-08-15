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
import { BuildingWallTextureCache, buildBuildingVisualParts, computeBuildingBaseAndSidewalk, computeBuildingLoopsFromTiles } from '../../assets3d/generators/buildings/BuildingGenerator.js';
import { createBuildingSlabMeshes } from '../../assets3d/generators/buildings/BuildingSlabGenerator.js';
import { buildRoadSidewalkOuterBoundaryLoopsFromRoadEnginePrimitives } from '../../../app/road_decoration/sidewalks/RoadSidewalkBuilder.js';
import { buildBuildingFabricationVisualParts } from '../../assets3d/generators/building_fabrication/BuildingFabricationGenerator.js';
import { mergeBuildingGroupGeometry } from '../../assets3d/generators/building_fabrication/BuildingGeometryMerger.js';
import { getCityMaterials } from '../../assets3d/textures/CityMaterials.js';
import { getResolvedLightingSettings } from '../../lighting/LightingSettings.js';
import { getResolvedShadowSettings, getShadowQualityPreset } from '../../lighting/ShadowSettings.js';
import { registerObjectForSceneShadows, setActiveSceneShadowSystem, getActiveSceneShadowSystem } from '../../lighting/SceneShadowMaterials.js';
import { CityCascadedShadows } from './CityCascadedShadows.js';
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

const ZERO_VEC = new THREE.Vector3(0, 0, 0);
const UP_DEFAULT = new THREE.Vector3(0, 1, 0);
const UP_ALT = new THREE.Vector3(0, 0, 1);

function applyShadowSideToObject(root, shadowSide) {
    if (!root?.traverse) return;

    root.traverse((o) => {
        if (!o || !o.isMesh || !o.material || !o.castShadow) return;

        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) {
            if (!mat || typeof mat !== 'object' || !('shadowSide' in mat)) continue;
            const preserveShadowSide = mat.userData?.preserveShadowSide === true || mat.userData?.isFoliage === true;

            if (shadowSide !== null && shadowSide !== undefined) {
                if (preserveShadowSide) continue;
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
            generatorConfig = null,
            // Authoring tools that need per-mesh picking on fabricated buildings
            // (bay/decoration selection) can opt out.
            mergeBuildingGeometry = true,
            mergeDedupeMaterials = true,
            // Sun shadows are fitted to a region around the active camera instead
            // of the whole map: fewer casters per frame, and the same shadow map
            // resolution spread over a much smaller area (sharper edges).
            sunShadowFocusEnabled = true,
            sunShadowRadiusMeters = 110
        } = options;

        this.config = {
            size,
            tileMeters,
            fogColor: '#5AAAD3',
            fogNear: 280,
            fogFar: 1800,
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

        // Single source of truth for the sun independent of whichever light
        // object renders shadows (one fitted light today, N cascade lights under
        // CSM). Rigs and the sky read this; lights are positioned from it.
        this.sunRef = {
            direction: new THREE.Vector3(80, 140, 60).normalize(),
            intensity: lighting.sunIntensity,
            color: new THREE.Color(0xffffff)
        };

        this.sun = new THREE.DirectionalLight(this.sunRef.color.getHex(), this.sunRef.intensity);
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
        // The target must live in the scene graph for its world matrix (and thus
        // the light direction) to update when we move the shadow focus.
        this.group.add(this.sun.target);

        this._sunShadowFocus = {
            enabled: sunShadowFocusEnabled !== false,
            radiusMeters: Math.max(20, Number(sunShadowRadiusMeters) || 110),
            // Keep the authored distance stable while the light itself is moved
            // around to follow the camera. Direction lives on sunRef.
            nominalDistance: this.sun.position.length() || 200,
            fullExtent: half,
            focus: new THREE.Vector3(),
            _rot: new THREE.Matrix4(),
            _tmp: new THREE.Vector3(),
            _forward: new THREE.Vector3()
        };

        this.sky = createGradientSkyDome({
            sunDir: this.sunRef.direction,
            sunIntensity: 0.28
        });
        this.group.add(this.sky);

        this.sunFlare = null;
        if (typeof window !== 'undefined') {
            const sunFlareSettings = getResolvedSunFlareSettings();
            this.sunFlare = new SunFlareRig({ sun: this.sunRef, settings: sunFlareSettings });
            this.group.add(this.sunFlare.group);
        }

        this.sunBloom = null;
        if (typeof window !== 'undefined') {
            const sunBloomSettings = getResolvedSunBloomSettings();
            this.sunBloom = new SunBloomRig({ sun: this.sunRef, sky: this.sky, settings: sunBloomSettings });
            this.group.add(this.sunBloom.group);
        }

        this.sunRays = null;
        if (typeof window !== 'undefined') {
            const sunBloomSettings = getResolvedSunBloomSettings();
            this.sunRays = new SunRaysRig({ sun: this.sunRef, sky: this.sky, settings: sunBloomSettings });
            this.group.add(this.sunRays.group);
        }

        const resolvedSeed = mapSpec?.seed ?? seed;
        this.genConfig = createCityConfig({ size, tileMeters, mapTileSize, seed: resolvedSeed });
        this.generatorConfig = createGeneratorConfig(generatorConfig ?? {});

        this.rng = new CityRNG(this.genConfig.seed);

        const spec = mapSpec ?? CityMap.demoSpec(this.genConfig);
        this.map = CityMap.fromSpec(spec, this.genConfig);

        this.materials = getCityMaterials();
        this.roads = createRoadEngineRoads({ map: this.map, config: this.generatorConfig, materials: this.materials });
        const trafficControlPlacements = computeTrafficControlPlacements({
            map: this.map,
            generatorConfig: this.generatorConfig
        });
        const buildingsList = Array.isArray(this.map.buildings) ? this.map.buildings : [];
        const roadPolygons = (this.roads.debug?.derived?.primitives ?? [])
            .filter((primitive) => primitive?.type === 'polygon' && (primitive.kind === 'asphalt_piece' || primitive.kind === 'junction_surface'))
            .map((primitive) => primitive.points);
        const buildingFootprints = buildingsList.map((entry) => {
            const explicit = Array.isArray(entry?.footprintLoops) ? entry.footprintLoops : null;
            if (Array.isArray(entry?.layers) && entry.layers.length && explicit) return explicit;
            return computeBuildingLoopsFromTiles({
                map: this.map,
                tiles: entry.tiles,
                generatorConfig: this.generatorConfig,
                tileSize: this.map.tileSize,
                occupyRatio: 1.0
            });
        }).filter((loops) => loops.length > 0);
        const roadHardscapeMargin = Math.max(0, this.generatorConfig.road?.curb?.thickness ?? 0)
            + Math.max(0, this.generatorConfig.road?.sidewalk?.extraWidth ?? 0);

        this.world = createCityWorld({
            size,
            tileMeters,
            map: this.map,
            config: this.generatorConfig,
            rng: this.rng,
            treeExclusions: { roadPolygons, roadHardscapeMargin, buildingFootprints, trafficControls: trafficControlPlacements }
        });
        this.group.add(this.world.group);
        this.group.add(this.roads.group);

        this.trafficControls = null;
        if (trafficControlPlacements.length) {
            this.trafficControls = createTrafficControlProps({ placements: trafficControlPlacements });
            this.group.add(this.trafficControls.group);
        }

        this.buildings = null;
        if (buildingsList.length) {
            const buildingsGroup = new THREE.Group();
            buildingsGroup.name = 'Buildings';

            // Collected across all buildings so overlapping foundation slabs
            // can merge into shared geometry.
            const slabFootprintLoops = [];

            const textures = new BuildingWallTextureCache();
            // Fabricated buildings emit one mesh per decoration segment/cap and per
            // window part; merging them by material at build time turns hundreds of
            // ~8-triangle draw calls per building into a handful. Shared across
            // buildings so identical materials collapse city-wide.
            const mergedMaterialCache = mergeBuildingGeometry ? new Map() : null;
            const mergeTotals = { sourceMeshes: 0, resultMeshes: 0, failedBuckets: 0 };
            for (const entry of buildingsList) {
                const wallInset = Number.isFinite(entry?.wallInset) ? entry.wallInset : 0.0;
                const hasLayers = Array.isArray(entry?.layers) && entry.layers.length;
                const footprintLoops = Array.isArray(entry?.footprintLoops) ? entry.footprintLoops : null;
                const buildAreaLoops = hasLayers
                    ? computeBuildingLoopsFromTiles({
                        map: this.map,
                        tiles: entry.tiles,
                        generatorConfig: this.generatorConfig,
                        tileSize: this.map.tileSize,
                        occupyRatio: 1.0
                    })
                    : null;
                const windowsSpec = entry?.windows ?? null;
                const windowsEnabled = !!windowsSpec && typeof windowsSpec === 'object';
                const overrideWindowVisuals = entry?.windowVisuals ?? null;
                const resolvedWindowVisuals = overrideWindowVisuals ?? buildingWindowVisuals;
                const windowVisualsIsOverride = !!overrideWindowVisuals && typeof overrideWindowVisuals === 'object';
                const parts = hasLayers
                    ? buildBuildingFabricationVisualParts({
                        map: this.map,
                        tiles: entry.tiles,
                        footprintLoops,
                        buildAreaLoops,
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
                        wallDecorations: entry.wallDecorations ?? null,
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

                if (mergeBuildingGeometry) {
                    const stats = mergeBuildingGroupGeometry(buildingGroup, {
                        materialCache: mergedMaterialCache,
                        dedupeMaterials: mergeDedupeMaterials
                    });
                    mergeTotals.sourceMeshes += stats.sourceMeshes;
                    mergeTotals.resultMeshes += stats.resultMeshes;
                    mergeTotals.failedBuckets += stats.failedBuckets;
                }

                buildingsGroup.add(buildingGroup);

                const placedLoops = Array.isArray(parts.placedFootprintLoops) && parts.placedFootprintLoops.length
                    ? parts.placedFootprintLoops
                    : (buildAreaLoops ?? footprintLoops ?? []);
                for (const loop of placedLoops) {
                    if (Array.isArray(loop) && loop.length >= 3) slabFootprintLoops.push(loop);
                }
            }

            if (mergeBuildingGeometry && mergeTotals.sourceMeshes > 0) {
                this.buildingMergeStats = { ...mergeTotals };
                if (mergeTotals.failedBuckets > 0) {
                    console.warn(`[City] Building geometry merge: ${mergeTotals.failedBuckets} bucket(s) could not merge; left unmerged.`);
                }
            }

            // Foundation slabs: planned across all buildings at once so slabs
            // within reach of each other merge (slab-to-slab only), then cut
            // exactly against the sidewalk outer boundary geometry.
            if (slabFootprintLoops.length) {
                const { sidewalkSurfaceY } = computeBuildingBaseAndSidewalk({
                    generatorConfig: this.generatorConfig,
                    floorHeight: 3.2
                });
                const slabGroundY = this.generatorConfig?.ground?.surfaceY
                    ?? this.generatorConfig?.road?.surfaceY
                    ?? 0;
                const roadCfg = this.generatorConfig?.road ?? {};
                const sidewalkBoundaries = buildRoadSidewalkOuterBoundaryLoopsFromRoadEnginePrimitives(
                    this.roads.debug?.derived?.primitives ?? [],
                    {
                        curbThickness: roadCfg.curb?.thickness,
                        sidewalkWidth: roadCfg.sidewalk?.extraWidth
                    }
                );
                const slabsGroup = new THREE.Group();
                slabsGroup.name = 'BuildingSlabs';
                slabsGroup.userData.slabDebug = { sidewalkBoundaries, footprintLoops: slabFootprintLoops };
                const slabMeshes = createBuildingSlabMeshes({
                    footprintLoops: slabFootprintLoops,
                    sidewalkBoundaries,
                    topY: Number.isFinite(sidewalkSurfaceY)
                        ? sidewalkSurfaceY
                        : (slabGroundY + 0.17),
                    groundY: slabGroundY,
                    material: this.materials.sidewalk
                });
                for (const slab of slabMeshes) slabsGroup.add(slab);
                buildingsGroup.add(slabsGroup);
            }

            this.buildings = { group: buildingsGroup, textures };
            this.group.add(buildingsGroup);
        }

        this._attached = false;
        this._restore = null;

        // Cascaded shadow maps (activated by the `cascaded` shadow quality).
        this._csm = null;
        // Roots outside this.group whose materials must receive scene shadows
        // (the bus). Remembered so a later mode switch can re-register them.
        this._extraShadowRoots = new Set();
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

        this._deactivateCascadedShadows();
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

    /**
     * Route sun intensity through the sun reference so it reaches whichever
     * light object(s) currently render the sun (single light or CSM cascades).
     */
    setSunIntensity(intensity) {
        const value = Number(intensity);
        if (!Number.isFinite(value)) return;
        this.sunRef.intensity = value;
        if (this.sun) this.sun.intensity = value;
        this._csm?.setIntensity?.(value);
    }

    applyShadowSettings(engine) {
        const renderer = engine?.renderer ?? null;
        const settings = engine?.shadowSettings ?? getResolvedShadowSettings();
        const preset = getShadowQualityPreset(settings?.quality);
        const enabled = !!preset.enabled;
        const wantsCsm = enabled
            && Number.isFinite(preset.cascades)
            && !!engine?.camera
            && typeof window !== 'undefined';

        if (wantsCsm) {
            this._activateCascadedShadows(engine, preset, settings);
        } else {
            this._deactivateCascadedShadows();
        }

        if (this.sun) {
            // Under CSM the single sun light neither lights nor shadows: the
            // cascade lights carry the full sun (one per fragment).
            this.sun.visible = !wantsCsm;
            this.sun.castShadow = enabled && !wantsCsm;
            this.sun.shadow.bias = preset.bias;
            if ('normalBias' in this.sun.shadow) this.sun.shadow.normalBias = preset.normalBias;
            if ('radius' in this.sun.shadow) this.sun.shadow.radius = preset.radius;

            if (!wantsCsm && enabled && preset.mapSize > 0) {
                const size = Math.max(256, Math.min(preset.mapSize, 4096, this._maxShadowTextureSize(renderer, preset.mapSize)));
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

    _maxShadowTextureSize(renderer, fallback) {
        return Number.isFinite(renderer?.capabilities?.maxTextureSize)
            ? Math.max(256, Math.floor(renderer.capabilities.maxTextureSize))
            : fallback;
    }

    _activateCascadedShadows(engine, preset, settings) {
        const cascades = Math.max(2, Math.min(4, Math.round(settings?.cascades ?? preset.cascades) || preset.cascades));
        const mapSize = Math.max(256, Math.min(preset.mapSize, 4096, this._maxShadowTextureSize(engine?.renderer ?? null, preset.mapSize)));
        const splitScale = Number.isFinite(settings?.splitScale) && settings.splitScale > 0
            ? Math.max(0.5, Math.min(2.5, settings.splitScale))
            : 1;

        if (this._csm && (this._csm.cascades !== cascades
            || this._csm.mapSize !== mapSize
            || this._csm.splitScale !== splitScale)) {
            this._deactivateCascadedShadows();
        }
        if (this._csm) return;

        this._csm = new CityCascadedShadows({
            camera: engine.camera,
            parent: this.group,
            sunRef: this.sunRef,
            preset,
            cascades,
            mapSize,
            splitScale,
            // Cascades scale off the base size, so the hardware cap is enforced
            // there rather than by the base-size clamp above.
            maxTextureSize: engine?.renderer?.capabilities?.maxTextureSize ?? 0
        });
        setActiveSceneShadowSystem(this._csm);
        registerObjectForSceneShadows(this.group);
        for (const root of this._extraShadowRoots) registerObjectForSceneShadows(root);
    }

    _deactivateCascadedShadows() {
        if (!this._csm) return;
        if (getActiveSceneShadowSystem() === this._csm) setActiveSceneShadowSystem(null);
        this._csm.dispose();
        this._csm = null;
    }

    /**
     * Declare a subtree outside the city group (the bus) whose materials must
     * receive scene sun shadows. No-op unless cascaded shadows are active, and
     * remembered so mode switches re-register it.
     */
    registerShadowReceivers(root) {
        if (!root) return;
        this._extraShadowRoots.add(root);
        if (this._csm) registerObjectForSceneShadows(root);
    }

    update(engine) {
        this._applyAtmosphere(engine);
        if (this._csm) this._csm.updateFrame(engine);
        else this._updateSunShadowFocus(engine);
        this.sky.position.copy(engine.camera.position);
        this._syncSkyVisibility(engine);
        this.sunFlare?.update?.(engine);
        this.sunBloom?.update?.(engine);
        this.sunRays?.update?.(engine);
    }

    /**
     * Fit the sun's shadow camera to a region around the active camera.
     *
     * The shadow map is a fixed pixel budget: spreading it over the whole map
     * wastes almost all of it on geometry nowhere near the view, which both
     * costs a draw call per caster and leaves very few texels per meter (jagged
     * edges). Following the camera keeps every caster dynamic — nothing is
     * frozen, so moving objects such as the bus shadow correctly.
     */
    _updateSunShadowFocus(engine) {
        const state = this._sunShadowFocus ?? null;
        if (!state?.enabled || !this.sun?.castShadow) return;
        const camera = engine?.camera ?? null;
        if (!camera) return;

        const radius = state.radiusMeters;
        const shadow = this.sun.shadow;
        const mapSize = Math.max(256, shadow?.mapSize?.width ?? 2048);
        const groundY = this.generatorConfig?.ground?.surfaceY
            ?? this.generatorConfig?.road?.surfaceY
            ?? 0;

        // Bias the focus ahead of the camera so coverage favours what is on
        // screen rather than what is behind it.
        state._forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
        state._forward.y = 0;
        if (state._forward.lengthSq() < 1e-6) state._forward.set(0, 0, -1);
        state._forward.normalize();
        const focus = state.focus.copy(camera.position).addScaledVector(state._forward, radius * 0.45);
        focus.y = groundY;

        // Snap the focus to whole shadow-map texels in light space, otherwise the
        // shadow edges crawl and shimmer as the camera moves.
        const dirToLight = this.sunRef.direction;
        const up = Math.abs(dirToLight.y) > 0.99 ? UP_ALT : UP_DEFAULT;
        state._rot.lookAt(dirToLight, ZERO_VEC, up);
        const texelWorldSize = (radius * 2) / mapSize;
        const lightSpace = state._tmp.copy(focus).applyMatrix4(state._rot.clone().invert());
        lightSpace.x = Math.round(lightSpace.x / texelWorldSize) * texelWorldSize;
        lightSpace.y = Math.round(lightSpace.y / texelWorldSize) * texelWorldSize;
        focus.copy(lightSpace).applyMatrix4(state._rot);

        const backDistance = Math.max(state.nominalDistance, radius * 2 + 80);
        this.sun.target.position.copy(focus);
        this.sun.target.updateMatrixWorld?.();
        this.sun.position.copy(focus).addScaledVector(dirToLight, backDistance);
        this.sun.updateMatrixWorld?.();

        const cam = shadow.camera;
        if (cam.left !== -radius || cam.right !== radius || cam.top !== radius || cam.bottom !== -radius) {
            cam.left = -radius;
            cam.right = radius;
            cam.top = radius;
            cam.bottom = -radius;
        }
        cam.near = 1;
        cam.far = backDistance + radius * 2;
        cam.updateProjectionMatrix();
    }

    _applyAtmosphere(engine) {
        const atmo = engine?.atmosphereSettings ?? null;
        if (!atmo) return;

        const azimuthDeg = atmo?.sun?.azimuthDeg ?? null;
        const elevationDeg = atmo?.sun?.elevationDeg ?? null;
        if (Number.isFinite(azimuthDeg) && Number.isFinite(elevationDeg)) {
            const dir = azimuthElevationDegToDir(azimuthDeg, elevationDeg);
            this.sunRef.direction.copy(dir).normalize();
            if (this.sun) {
                // Use the stored nominal distance: the light itself gets moved
                // around by the shadow focus, so its current position is not a
                // stable radius.
                const dist = this._sunShadowFocus?.nominalDistance ?? 200;
                this.sun.position.copy(dir).multiplyScalar(dist);
                this.sun.target.position.set(0, 0, 0);
                this.sun.target.updateMatrixWorld?.();
            }
        }

        applyAtmosphereToSkyDome(this.sky, atmo, { sunDir: this.sunRef.direction });

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
