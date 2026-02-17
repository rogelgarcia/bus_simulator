// src/graphics/gui/lab_scene/LabSceneView.js
// Standalone urban visual-tuning lab scene with deterministic content and camera presets.
// @ts-check

import * as THREE from 'three';
import { GameEngine } from '../../../app/core/GameEngine.js';
import { createCityConfig } from '../../../app/city/CityConfig.js';
import { computeRoadTrafficControlPlacementsFromRoadEngineDerived } from '../../../app/road_decoration/traffic_controls/RoadTrafficControlPlacement.js';
import { createBus } from '../../assets3d/factories/BusFactory.js';
import { BUS_CATALOG } from '../../assets3d/factories/BusCatalog.js';
import { ROAD_DEFAULTS } from '../../assets3d/generators/GeneratorParams.js';
import { primePbrAssetsAvailability, setPbrAssetsEnabled } from '../../content3d/materials/PbrAssetsRuntime.js';
import { createToolCameraController } from '../../engine3d/camera/ToolCameraPrefab.js';
import { getResolvedLightingSettings, sanitizeLightingSettings } from '../../lighting/LightingSettings.js';
import { getResolvedShadowSettings, sanitizeShadowSettings } from '../../lighting/ShadowSettings.js';
import { City } from '../../visuals/city/City.js';
import { createTrafficControlProps } from '../../visuals/city/TrafficControlProps.js';
import { getResolvedAtmosphereSettings, sanitizeAtmosphereSettings } from '../../visuals/atmosphere/AtmosphereSettings.js';
import { getResolvedBuildingWindowVisualsSettings, sanitizeBuildingWindowVisualsSettings } from '../../visuals/buildings/BuildingWindowVisualsSettings.js';
import { applyBuildingWindowVisualsToCityMeshes } from '../../visuals/buildings/BuildingWindowVisualsRuntime.js';
import { getResolvedAntiAliasingSettings, sanitizeAntiAliasingSettings } from '../../visuals/postprocessing/AntiAliasingSettings.js';
import { getResolvedAmbientOcclusionSettings, sanitizeAmbientOcclusionSettings } from '../../visuals/postprocessing/AmbientOcclusionSettings.js';
import { getResolvedBloomSettings, sanitizeBloomSettings } from '../../visuals/postprocessing/BloomSettings.js';
import { getResolvedColorGradingSettings, sanitizeColorGradingSettings } from '../../visuals/postprocessing/ColorGradingSettings.js';
import { getResolvedSunBloomSettings, sanitizeSunBloomSettings } from '../../visuals/postprocessing/SunBloomSettings.js';
import { getResolvedSunFlareSettings, sanitizeSunFlareSettings } from '../../visuals/sun/SunFlareSettings.js';
import { makeChoiceRow, makeToggleRow } from '../options/OptionsUiControls.js';

const LAB_STORAGE_KEY = 'bus_sim.lab_scene.v3';
const LAB_STORAGE_VERSION = 3;

const LAB_CAMERA_PRESETS = Object.freeze([
    Object.freeze({
        id: 'overview',
        key: '1',
        label: 'Overview',
        description: 'Wide city framing for global balance checks.'
    }),
    Object.freeze({
        id: 'near_road',
        key: '2',
        label: 'Near-road',
        description: 'Asphalt and curb readability at street level.'
    }),
    Object.freeze({
        id: 'bus_follow',
        key: '3',
        label: 'Bus follow',
        description: 'Vehicle-scale framing and contact shadow read.'
    }),
    Object.freeze({
        id: 'corner_detail',
        key: '4',
        label: 'Corner detail',
        description: 'Intersection edge detail and contrast check.'
    }),
    Object.freeze({
        id: 'crossing_bus_front',
        key: '7',
        label: 'Crossing front',
        description: 'Near-crossing framing with bus front readability.'
    }),
    Object.freeze({
        id: 'crossing_bus_right_wide',
        key: '8',
        label: 'Crossing right wide',
        description: 'Lower far crossing shot from the opposite sidewalk with stop-sign read.'
    }),
    Object.freeze({
        id: 'material_close',
        key: '5',
        label: 'Material close',
        description: 'Reference spheres/cube for roughness and tone.'
    }),
    Object.freeze({
        id: 'building_glass',
        key: '6',
        label: 'Building glass',
        description: 'Window reflections and skyline composition.'
    })
]);

const DEFAULT_CAMERA_PRESET_ID = LAB_CAMERA_PRESETS[0].id;

const LAB_BUS_POSE = Object.freeze({
    x: -24,
    y: 0,
    z: 0,
    yawDeg: 90
});

function deepClone(value) {
    return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : null;
}

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

function getCameraPresetById(id) {
    const key = typeof id === 'string' ? id.trim() : '';
    return LAB_CAMERA_PRESETS.find((preset) => preset.id === key) ?? LAB_CAMERA_PRESETS[0];
}

function getCameraPresetByKey(key) {
    const typed = typeof key === 'string' ? key.trim().toUpperCase() : '';
    if (!typed) return null;
    return LAB_CAMERA_PRESETS.find((preset) => preset.key === typed) ?? null;
}

function createDefaultDraft() {
    return {
        lighting: sanitizeLightingSettings(getResolvedLightingSettings()),
        // Atmosphere is intentionally fixed for the lab scene.
        atmosphere: sanitizeAtmosphereSettings(getResolvedAtmosphereSettings()),
        shadows: sanitizeShadowSettings(getResolvedShadowSettings()),
        antiAliasing: sanitizeAntiAliasingSettings(getResolvedAntiAliasingSettings()),
        ambientOcclusion: sanitizeAmbientOcclusionSettings(getResolvedAmbientOcclusionSettings()),
        bloom: sanitizeBloomSettings(getResolvedBloomSettings()),
        sunBloom: sanitizeSunBloomSettings(getResolvedSunBloomSettings()),
        colorGrading: sanitizeColorGradingSettings(getResolvedColorGradingSettings()),
        buildingWindowVisuals: sanitizeBuildingWindowVisualsSettings(getResolvedBuildingWindowVisualsSettings()),
        sunFlare: sanitizeSunFlareSettings(getResolvedSunFlareSettings())
    };
}

function normalizeStoredState(raw) {
    const defaults = createDefaultDraft();
    const src = raw && typeof raw === 'object' ? raw : {};
    const draftIn = src?.draft && typeof src.draft === 'object' ? src.draft : {};
    const preset = getCameraPresetById(src?.activeCameraPresetId).id;

    return {
        draft: {
            lighting: sanitizeLightingSettings(draftIn.lighting ?? defaults.lighting),
            atmosphere: sanitizeAtmosphereSettings(defaults.atmosphere),
            shadows: sanitizeShadowSettings(draftIn.shadows ?? defaults.shadows),
            antiAliasing: sanitizeAntiAliasingSettings(draftIn.antiAliasing ?? defaults.antiAliasing),
            ambientOcclusion: sanitizeAmbientOcclusionSettings(draftIn.ambientOcclusion ?? defaults.ambientOcclusion),
            bloom: sanitizeBloomSettings(draftIn.bloom ?? defaults.bloom),
            sunBloom: sanitizeSunBloomSettings(draftIn.sunBloom ?? defaults.sunBloom),
            colorGrading: sanitizeColorGradingSettings(draftIn.colorGrading ?? defaults.colorGrading),
            buildingWindowVisuals: sanitizeBuildingWindowVisualsSettings(draftIn.buildingWindowVisuals ?? defaults.buildingWindowVisuals),
            sunFlare: sanitizeSunFlareSettings(draftIn.sunFlare ?? defaults.sunFlare)
        },
        activeCameraPresetId: preset
    };
}

function loadStoredState() {
    if (typeof window === 'undefined') {
        return normalizeStoredState({
            draft: createDefaultDraft(),
            activeCameraPresetId: DEFAULT_CAMERA_PRESET_ID
        });
    }

    const storage = window.localStorage;
    if (!storage) {
        return normalizeStoredState({
            draft: createDefaultDraft(),
            activeCameraPresetId: DEFAULT_CAMERA_PRESET_ID
        });
    }

    try {
        const raw = storage.getItem(LAB_STORAGE_KEY);
        if (!raw) {
            return normalizeStoredState({
                draft: createDefaultDraft(),
                activeCameraPresetId: DEFAULT_CAMERA_PRESET_ID
            });
        }
        const parsed = JSON.parse(raw);
        return normalizeStoredState(parsed);
    } catch {
        return normalizeStoredState({
            draft: createDefaultDraft(),
            activeCameraPresetId: DEFAULT_CAMERA_PRESET_ID
        });
    }
}

function saveStoredState(state) {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const payload = {
        version: LAB_STORAGE_VERSION,
        draft: state?.draft ?? createDefaultDraft(),
        activeCameraPresetId: getCameraPresetById(state?.activeCameraPresetId).id
    };
    try {
        storage.setItem(LAB_STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

function toWorldPoint(config, tileX, tileY) {
    return {
        x: config.map.origin.x + (tileX | 0) * config.map.tileSize,
        z: config.map.origin.z + (tileY | 0) * config.map.tileSize
    };
}

function rectTiles(startX, startY, width, height) {
    const x0 = startX | 0;
    const y0 = startY | 0;
    const w = Math.max(1, width | 0);
    const h = Math.max(1, height | 0);
    const out = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) out.push([x0 + x, y0 + y]);
    }
    return out;
}

function makeLabCitySpec({ config, seed }) {
    return {
        version: 1,
        seed,
        width: config.map.width,
        height: config.map.height,
        tileSize: config.map.tileSize,
        origin: config.map.origin,
        roads: [
            {
                points: [toWorldPoint(config, 1, 7), toWorldPoint(config, 13, 7)],
                lanesF: 2,
                lanesB: 2,
                tag: 'main_arterial'
            },
            {
                points: [toWorldPoint(config, 7, 3), toWorldPoint(config, 7, 11)],
                lanesF: 1,
                lanesB: 1,
                tag: 'crossing'
            },
            {
                points: [toWorldPoint(config, 2, 9), toWorldPoint(config, 5, 9), toWorldPoint(config, 6, 10)],
                lanesF: 1,
                lanesB: 0,
                tag: 'one_way_curve'
            }
        ],
        buildings: [
            { id: 'lab_building_1', configId: 'gov_center', tiles: rectTiles(2, 2, 3, 3) },
            { id: 'lab_building_2', configId: 'stone_setback_tower', tiles: rectTiles(10, 2, 3, 3) },
            { id: 'lab_building_3', configId: 'brick_midrise', tiles: rectTiles(2, 10, 3, 3) },
            { id: 'lab_building_4', configId: 'blue_belt_tower', tiles: rectTiles(10, 10, 3, 3) },
            { id: 'lab_building_5', configId: 'stone_lowrise', tiles: rectTiles(12, 5, 2, 2) }
        ]
    };
}

function resolveSurfaceHeights(city) {
    const gen = city?.generatorConfig ?? {};
    const roadCfg = { ...ROAD_DEFAULTS, ...(gen.road ?? {}) };
    roadCfg.curb = { ...(ROAD_DEFAULTS.curb ?? {}), ...(roadCfg.curb ?? {}) };
    roadCfg.sidewalk = { ...(ROAD_DEFAULTS.sidewalk ?? {}), ...(roadCfg.sidewalk ?? {}) };

    const roadY = Number.isFinite(city?.roads?.debug?.asphaltY)
        ? city.roads.debug.asphaltY
        : (Number.isFinite(roadCfg.surfaceY) ? roadCfg.surfaceY : ROAD_DEFAULTS.surfaceY);
    const groundY = Number.isFinite(city?.roads?.debug?.groundY)
        ? city.roads.debug.groundY
        : (Number.isFinite(gen?.ground?.surfaceY) ? gen.ground.surfaceY : roadY);
    const curbH = Number.isFinite(roadCfg.curb?.height) ? roadCfg.curb.height : 0;
    const curbExtra = Number.isFinite(roadCfg.curb?.extraHeight) ? roadCfg.curb.extraHeight : 0;
    const sidewalkLift = Number.isFinite(roadCfg.sidewalk?.lift) ? roadCfg.sidewalk.lift : 0;
    const sidewalkY = roadY + curbH + curbExtra + sidewalkLift;

    return { roadY, groundY, sidewalkY };
}

function resolveRoadEngineTrafficControlPlacements(city) {
    const derived = city?.roads?.debug?.derived ?? null;
    const segments = Array.isArray(derived?.segments) ? derived.segments : [];
    const junctions = Array.isArray(derived?.junctions) ? derived.junctions : [];
    if (!segments.length || !junctions.length) return [];

    const gen = city?.generatorConfig ?? {};
    const roadCfg = { ...ROAD_DEFAULTS, ...(gen.road ?? {}) };
    roadCfg.curb = { ...(ROAD_DEFAULTS.curb ?? {}), ...(roadCfg.curb ?? {}) };
    roadCfg.sidewalk = { ...(ROAD_DEFAULTS.sidewalk ?? {}), ...(roadCfg.sidewalk ?? {}) };
    const trafficCfg = roadCfg.trafficControls && typeof roadCfg.trafficControls === 'object'
        ? roadCfg.trafficControls
        : {};

    const laneWidth = Number.isFinite(roadCfg.laneWidth) ? roadCfg.laneWidth : ROAD_DEFAULTS.laneWidth;
    const tileSize = Number.isFinite(city?.map?.tileSize) ? city.map.tileSize : 24;
    const asphaltY = Number.isFinite(city?.roads?.debug?.asphaltY)
        ? city.roads.debug.asphaltY
        : (Number.isFinite(roadCfg.surfaceY) ? roadCfg.surfaceY : ROAD_DEFAULTS.surfaceY);
    const curbThickness = Number.isFinite(roadCfg.curb?.thickness)
        ? roadCfg.curb.thickness
        : (ROAD_DEFAULTS.curb?.thickness ?? 0.48);
    const curbHeightBase = Number.isFinite(roadCfg.curb?.height) ? roadCfg.curb.height : (ROAD_DEFAULTS.curb?.height ?? 0);
    const curbExtra = Number.isFinite(roadCfg.curb?.extraHeight) ? roadCfg.curb.extraHeight : 0;
    const sidewalkWidth = Number.isFinite(roadCfg.sidewalk?.extraWidth)
        ? roadCfg.sidewalk.extraWidth
        : (ROAD_DEFAULTS.sidewalk?.extraWidth ?? 0);
    const sidewalkLift = Number.isFinite(roadCfg.sidewalk?.lift) ? roadCfg.sidewalk.lift : 0;
    const trafficLightLaneThreshold = Number.isFinite(Number(trafficCfg.trafficLightLaneThreshold))
        ? Number(trafficCfg.trafficLightLaneThreshold)
        : 5;

    return computeRoadTrafficControlPlacementsFromRoadEngineDerived(
        { segments, junctions },
        {
            laneWidth,
            tileSize,
            asphaltY,
            curbThickness,
            curbHeight: curbHeightBase + curbExtra,
            sidewalkWidth,
            sidewalkLift,
            trafficLightLaneThreshold
        }
    );
}

function snapObjectBaseToY(object3d, baseY) {
    if (!object3d || !Number.isFinite(baseY)) return false;
    object3d.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object3d);
    if (box.isEmpty()) return false;
    const delta = baseY - box.min.y;
    if (!Number.isFinite(delta) || Math.abs(delta) < 1e-6) return false;
    object3d.position.y += delta;
    object3d.updateMatrixWorld(true);
    return true;
}

function getForwardFromYawRad(yawRad) {
    const yaw = Number(yawRad);
    if (!Number.isFinite(yaw)) return new THREE.Vector3(1, 0, 0);
    return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
}

function setShadowsRecursive(root, { cast = true, receive = true } = {}) {
    if (!root?.traverse) return;
    root.traverse((node) => {
        if (!node?.isMesh) return;
        node.castShadow = !!cast;
        node.receiveShadow = !!receive;
    });
}

function createReferencePropsGroup() {
    const group = new THREE.Group();
    group.name = 'LabReferenceProps';

    const baseX = 18;
    const baseZ = -22;

    const plate = new THREE.Mesh(
        new THREE.CircleGeometry(4.2, 40),
        new THREE.MeshStandardMaterial({ color: 0x6f7378, roughness: 0.92, metalness: 0.0 })
    );
    plate.rotation.x = -Math.PI * 0.5;
    plate.position.set(baseX, 0.02, baseZ);
    plate.receiveShadow = true;
    group.add(plate);

    const metalSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 48, 24),
        new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1.0, roughness: 0.12 })
    );
    metalSphere.position.set(baseX - 1.7, 0.9, baseZ - 0.2);
    metalSphere.castShadow = true;
    metalSphere.receiveShadow = true;
    group.add(metalSphere);

    const roughSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 48, 24),
        new THREE.MeshStandardMaterial({ color: 0xefe3cf, metalness: 0.0, roughness: 0.84 })
    );
    roughSphere.position.set(baseX + 0.2, 0.9, baseZ + 0.4);
    roughSphere.castShadow = true;
    roughSphere.receiveShadow = true;
    group.add(roughSphere);

    const clearCoatCube = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.6, 1.6),
        new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            roughness: 0.18,
            metalness: 0.0,
            clearcoat: 1.0,
            clearcoatRoughness: 0.06
        })
    );
    clearCoatCube.position.set(baseX + 2.3, 0.82, baseZ - 0.35);
    clearCoatCube.castShadow = true;
    clearCoatCube.receiveShadow = true;
    group.add(clearCoatCube);

    return group;
}

export class LabSceneView {
    constructor({ canvas } = {}) {
        this.canvas = canvas;
        this.engine = null;
        this.city = null;
        this.controls = null;
        this._hudLayer = null;
        this._activePresetEl = null;
        this._presetButtons = new Map();
        this._layerControls = null;
        this._propsRoot = null;
        this._busRoot = null;
        this._surfaceHeights = null;
        this._busGroundSnapFrames = 0;
        this._raf = 0;
        this._lastT = 0;

        this._state = loadStoredState();

        this._onKeyDown = (e) => this._handleKeyDown(e);
    }

    async start() {
        if (!this.canvas) throw new Error('[LabScene] Missing canvas');
        if (this.engine) return;

        await primePbrAssetsAvailability().catch(() => false);
        setPbrAssetsEnabled(true);

        const engine = new GameEngine({
            canvas: this.canvas,
            autoResize: true
        });
        this.engine = engine;

        const seed = 'lab-scene-326';
        const config = createCityConfig({ size: 360, tileMeters: 2, mapTileSize: 24, seed });
        const mapSpec = makeLabCitySpec({ config, seed });
        const city = new City({
            size: 360,
            tileMeters: 2,
            mapTileSize: 24,
            seed,
            mapSpec,
            generatorConfig: { render: { roadMode: 'normal', treesEnabled: true } }
        });
        this.city = city;
        city.attach(engine);
        const originAxes = city.group?.getObjectByName?.('OriginAxes') ?? null;
        if (originAxes?.parent) originAxes.parent.remove(originAxes);
        engine.context.city = city;
        this._surfaceHeights = resolveSurfaceHeights(city);
        this._rebuildTrafficControlsFromRoadEngine();

        this._propsRoot = new THREE.Group();
        this._propsRoot.name = 'LabSceneProps';
        city.group.add(this._propsRoot);
        this._buildProps();
        this._busGroundSnapFrames = 180;

        this._mountPresetPanel();
        this._applyDraft(this._state.draft);
        this._syncLayerPanelFromState();

        this.controls = createToolCameraController(engine.camera, this.canvas, {
            uiRoot: this._hudLayer,
            enabled: true,
            enableDamping: true,
            dampingFactor: 0.08,
            rotateSpeed: 0.95,
            panSpeed: 0.9,
            zoomSpeed: 1.0,
            minDistance: 0.4,
            maxDistance: 700,
            minPolarAngle: 0.001,
            maxPolarAngle: Math.PI - 0.001,
            orbitMouseButtons: [0, 2],
            panMouseButtons: [1],
            shiftPanFromOrbitButtons: true,
            getFocusTarget: () => ({ center: new THREE.Vector3(0, 0, 0), radius: 140 }),
            initialPose: this._resolvePresetPose(this._state.activeCameraPresetId)
        });
        this._applyCameraPreset(this._state.activeCameraPresetId);

        window.addEventListener('keydown', this._onKeyDown, { passive: false });

        requestAnimationFrame(() => this.engine?.resize?.());
        this._lastT = performance.now();
        this._raf = requestAnimationFrame((t) => this._tick(t));
    }

    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = 0;

        window.removeEventListener('keydown', this._onKeyDown);

        this.controls?.dispose?.();
        this.controls = null;

        this._unmountPresetPanel();

        if (this._propsRoot?.parent) this._propsRoot.parent.remove(this._propsRoot);
        this._propsRoot = null;
        this._busRoot = null;
        this._surfaceHeights = null;
        this._busGroundSnapFrames = 0;

        if (this.city && this.engine) this.city.detach(this.engine);
        this.city = null;

        if (this.engine) {
            this.engine.dispose();
            this.engine = null;
        }
    }

    _tick(t) {
        if (!this.engine) return;
        const dt = Math.min((t - this._lastT) / 1000, 0.05);
        this._lastT = t;
        if (this._busGroundSnapFrames > 0 && this._busRoot && this._surfaceHeights) {
            this._busGroundSnapFrames--;
            snapObjectBaseToY(this._busRoot, this._surfaceHeights.roadY);
        }
        this.controls?.update?.(dt);
        this.engine.updateFrame(dt, { render: true, nowMs: t });
        this._raf = requestAnimationFrame((tt) => this._tick(tt));
    }

    _rebuildTrafficControlsFromRoadEngine() {
        const city = this.city;
        if (!city) return;

        if (city.trafficControls?.group?.parent) city.trafficControls.group.parent.remove(city.trafficControls.group);
        city.trafficControls = null;

        const placements = resolveRoadEngineTrafficControlPlacements(city);
        if (!placements.length) return;

        const props = createTrafficControlProps({ placements, useSolidMaterials: true });
        const group = props?.group ?? null;
        if (!group) return;

        group.name = 'LabRoadEngineTrafficControls';
        setShadowsRecursive(group, { cast: true, receive: true });
        city.group.add(group);
        city.trafficControls = { ...props, group };
    }

    _buildProps() {
        const root = this._propsRoot;
        const city = this.city;
        if (!root || !city) return;
        const heights = this._surfaceHeights ?? resolveSurfaceHeights(city);

        const busSpec = BUS_CATALOG.find((entry) => entry?.id === 'city') ?? BUS_CATALOG[0] ?? null;
        if (busSpec) {
            const bus = createBus(busSpec);
            bus.name = 'LabBus';
            bus.position.set(LAB_BUS_POSE.x, heights.roadY, LAB_BUS_POSE.z);
            bus.rotation.y = THREE.MathUtils.degToRad(LAB_BUS_POSE.yawDeg);
            snapObjectBaseToY(bus, heights.roadY);
            this._busRoot = bus;
            root.add(bus);
        }

        const references = createReferencePropsGroup();
        references.position.set(20, 0, 0);
        root.add(references);
        snapObjectBaseToY(references, heights.groundY + 0.02);
    }

    _resolvePresetPose(presetId) {
        const preset = getCameraPresetById(presetId);
        if (preset.id === 'overview') {
            return {
                position: new THREE.Vector3(116, 94, 118),
                target: new THREE.Vector3(0, 0, 0)
            };
        }
        if (preset.id === 'near_road') {
            return {
                position: new THREE.Vector3(-34, 5.0, 18),
                target: new THREE.Vector3(0, 1.4, 0)
            };
        }
        if (preset.id === 'bus_follow') {
            const busPos = this._busRoot?.position ?? new THREE.Vector3(LAB_BUS_POSE.x, LAB_BUS_POSE.y, LAB_BUS_POSE.z);
            return {
                position: new THREE.Vector3(busPos.x - 13, busPos.y + 4.4, busPos.z + 1.2),
                target: new THREE.Vector3(busPos.x, busPos.y + 2.1, busPos.z + 0.4)
            };
        }
        if (preset.id === 'corner_detail') {
            return {
                position: new THREE.Vector3(16, 5.6, 15),
                target: new THREE.Vector3(0, 0.8, 0)
            };
        }
        if (preset.id === 'crossing_bus_front') {
            const busPos = this._busRoot?.position ?? new THREE.Vector3(LAB_BUS_POSE.x, LAB_BUS_POSE.y, LAB_BUS_POSE.z);
            const busYaw = this._busRoot?.rotation?.y ?? THREE.MathUtils.degToRad(LAB_BUS_POSE.yawDeg);
            const forward = getForwardFromYawRad(busYaw);
            const side = new THREE.Vector3(-forward.z, 0, forward.x);
            const camPos = busPos.clone()
                .addScaledVector(forward, 14.5)
                .addScaledVector(side, 1.6);
            camPos.y += 4.6;
            return {
                position: camPos,
                target: new THREE.Vector3(busPos.x, busPos.y + 2.2, busPos.z)
            };
        }
        if (preset.id === 'crossing_bus_right_wide') {
            const busPos = this._busRoot?.position ?? new THREE.Vector3(LAB_BUS_POSE.x, LAB_BUS_POSE.y, LAB_BUS_POSE.z);
            const busYaw = this._busRoot?.rotation?.y ?? THREE.MathUtils.degToRad(LAB_BUS_POSE.yawDeg);
            const forward = getForwardFromYawRad(busYaw);
            const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
            const crossing = this.city?.map?.tileToWorldCenter?.(7, 7) ?? { x: 0, z: 0 };
            const baseRoadY = this._surfaceHeights?.roadY ?? 0;
            const camPos = busPos.clone()
                .addScaledVector(forward, 30.0)
                .addScaledVector(right, -14.0);
            camPos.y = baseRoadY + 1.85;
            return {
                position: camPos,
                target: new THREE.Vector3(crossing.x + 2.4, baseRoadY + 1.15, crossing.z + 2.4)
            };
        }
        if (preset.id === 'material_close') {
            return {
                position: new THREE.Vector3(44, 2.2, -13),
                target: new THREE.Vector3(38.3, 0.9, -22)
            };
        }
        return {
            position: new THREE.Vector3(82, 18, -64),
            target: new THREE.Vector3(89, 17, -92)
        };
    }

    _applyCameraPreset(presetId) {
        const preset = getCameraPresetById(presetId);
        const pose = this._resolvePresetPose(preset.id);
        this.controls?.setLookAt?.(pose);
        this._state.activeCameraPresetId = preset.id;
        this._syncPresetUi();
        this._persist();
    }

    _mountPresetPanel() {
        const layer = document.createElement('div');
        layer.className = 'ui-layer lab-scene-layer';

        const panel = document.createElement('div');
        panel.className = 'ui-panel is-interactive lab-scene-panel';

        const title = document.createElement('div');
        title.className = 'lab-scene-title';
        title.textContent = 'Lab Scene';
        panel.appendChild(title);

        const subtitle = document.createElement('div');
        subtitle.className = 'lab-scene-subtitle';
        subtitle.textContent = 'Camera presets for reproducible visual reviews. Keys 1-8 switch views. Mouse drag orbits/pans.';
        panel.appendChild(subtitle);

        const grid = document.createElement('div');
        grid.className = 'lab-scene-preset-grid';
        for (const preset of LAB_CAMERA_PRESETS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lab-scene-preset-btn';
            btn.dataset.presetId = preset.id;
            btn.addEventListener('click', () => this._applyCameraPreset(preset.id));

            const key = document.createElement('div');
            key.className = 'lab-scene-preset-key';
            key.textContent = `${preset.key} · preset`;
            btn.appendChild(key);

            const label = document.createElement('div');
            label.className = 'lab-scene-preset-label';
            label.textContent = preset.label;
            btn.appendChild(label);

            const desc = document.createElement('div');
            desc.className = 'lab-scene-preset-desc';
            desc.textContent = preset.description;
            btn.appendChild(desc);

            this._presetButtons.set(preset.id, btn);
            grid.appendChild(btn);
        }
        panel.appendChild(grid);

        const footer = document.createElement('div');
        footer.className = 'lab-scene-footer';

        const active = document.createElement('div');
        active.className = 'lab-scene-active';
        footer.appendChild(active);
        this._activePresetEl = active;

        panel.appendChild(footer);

        const optionsLayer = document.createElement('div');
        optionsLayer.className = 'options-layer is-embedded lab-scene-options-layer';

        const optionsPanel = document.createElement('div');
        optionsPanel.className = 'ui-panel is-interactive options-panel lab-scene-options-panel';

        const optionsHeader = document.createElement('div');
        optionsHeader.className = 'options-header';
        const optionsTitle = document.createElement('div');
        optionsTitle.className = 'options-title';
        optionsTitle.textContent = 'Options';
        optionsHeader.appendChild(optionsTitle);
        const optionsSubtitle = document.createElement('div');
        optionsSubtitle.className = 'options-subtitle';
        optionsSubtitle.textContent = 'Visual layers (lab-only)';
        optionsHeader.appendChild(optionsSubtitle);
        optionsPanel.appendChild(optionsHeader);

        const optionsTabs = document.createElement('div');
        optionsTabs.className = 'options-tabs';
        const optionsLayersTab = document.createElement('button');
        optionsLayersTab.type = 'button';
        optionsLayersTab.className = 'options-tab is-active';
        optionsLayersTab.textContent = 'Layers';
        optionsTabs.appendChild(optionsLayersTab);
        optionsPanel.appendChild(optionsTabs);

        this._layerControls = {};
        const optionsBody = document.createElement('div');
        optionsBody.className = 'options-body lab-scene-controls';
        const section = document.createElement('div');
        section.className = 'options-section';
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'options-section-title';
        sectionTitle.textContent = 'Layers';
        section.appendChild(sectionTitle);

        const createToggleControl = (key, label) => {
            const control = makeToggleRow({
                label,
                value: false,
                onChange: () => this._onLayerControlChanged()
            });
            section.appendChild(control.row);
            this._layerControls[key] = control.toggle;
        };

        const createChoiceControl = (key, label, options) => {
            const normalized = Array.isArray(options) ? options.map((entry) => ({
                id: String(entry?.value ?? ''),
                label: String(entry?.label ?? entry?.value ?? '')
            })) : [];
            const first = normalized[0]?.id ?? '';
            const control = makeChoiceRow({
                label,
                value: first,
                options: normalized,
                onChange: () => this._onLayerControlChanged()
            });
            section.appendChild(control.row);
            this._layerControls[key] = control;
        };

        createToggleControl('shadowsEnabled', 'Shadows');
        createToggleControl('bloomEnabled', 'Bloom');
        createToggleControl('sunBloomEnabled', 'Sun Bloom');
        createToggleControl('sunFlareEnabled', 'Sun Flare');
        createToggleControl('windowReflectionsEnabled', 'Window Reflections');
        createChoiceControl('aoMode', 'AO Mode', [
            { value: 'off', label: 'Off' },
            { value: 'ssao', label: 'SSAO' },
            { value: 'gtao', label: 'GTAO' }
        ]);
        createChoiceControl('aaSamples', 'AA (MSAA)', [
            { value: '2', label: '2x' },
            { value: '8', label: '8x' }
        ]);

        optionsBody.appendChild(section);
        optionsPanel.appendChild(optionsBody);

        const optionsFooter = document.createElement('div');
        optionsFooter.className = 'options-footer';
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'options-btn';
        resetBtn.textContent = 'Reset';
        resetBtn.addEventListener('click', () => this._resetToFactoryDefaults());
        optionsFooter.appendChild(resetBtn);
        optionsPanel.appendChild(optionsFooter);

        optionsLayer.appendChild(optionsPanel);

        layer.appendChild(panel);
        layer.appendChild(optionsLayer);
        document.body.appendChild(layer);
        this._hudLayer = layer;
        this._syncPresetUi();
    }

    _unmountPresetPanel() {
        this._presetButtons.clear();
        this._layerControls = null;
        this._activePresetEl = null;
        this._hudLayer?.remove?.();
        this._hudLayer = null;
    }

    _syncPresetUi() {
        const activePreset = getCameraPresetById(this._state.activeCameraPresetId);
        for (const preset of LAB_CAMERA_PRESETS) {
            const btn = this._presetButtons.get(preset.id) ?? null;
            if (!btn) continue;
            btn.classList.toggle('is-active', preset.id === activePreset.id);
        }
        if (this._activePresetEl) {
            this._activePresetEl.textContent = `Active: ${activePreset.label} (${activePreset.key})`;
        }
    }

    _onLayerControlChanged() {
        const controls = this._layerControls ?? null;
        if (!controls || !this._state?.draft) return;

        const draft = deepClone(this._state.draft) ?? createDefaultDraft();

        const shadowsEnabled = !!controls.shadowsEnabled?.checked;
        if (draft.shadows && typeof draft.shadows === 'object') {
            draft.shadows.quality = shadowsEnabled ? 'high' : 'off';
        }

        if (draft.bloom && typeof draft.bloom === 'object') {
            draft.bloom.enabled = !!controls.bloomEnabled?.checked;
        }

        if (draft.sunBloom && typeof draft.sunBloom === 'object') {
            draft.sunBloom.enabled = !!controls.sunBloomEnabled?.checked;
        }

        if (draft.sunFlare && typeof draft.sunFlare === 'object') {
            draft.sunFlare.enabled = !!controls.sunFlareEnabled?.checked;
        }

        const windowVisuals = draft.buildingWindowVisuals && typeof draft.buildingWindowVisuals === 'object'
            ? draft.buildingWindowVisuals
            : {};
        const reflective = windowVisuals.reflective && typeof windowVisuals.reflective === 'object'
            ? windowVisuals.reflective
            : {};
        reflective.enabled = !!controls.windowReflectionsEnabled?.checked;
        windowVisuals.reflective = reflective;
        draft.buildingWindowVisuals = windowVisuals;

        const aaSamples = controls.aaSamples?.getValue?.() === '8' ? 8 : 2;
        const aa = draft.antiAliasing && typeof draft.antiAliasing === 'object' ? draft.antiAliasing : {};
        aa.mode = 'msaa';
        aa.msaa = { ...(aa.msaa ?? {}), samples: aaSamples };
        draft.antiAliasing = aa;

        const ao = draft.ambientOcclusion && typeof draft.ambientOcclusion === 'object' ? draft.ambientOcclusion : {};
        const aoModeRaw = String(controls.aoMode?.getValue?.() ?? 'off').toLowerCase();
        ao.mode = aoModeRaw === 'gtao'
            ? 'gtao'
            : aoModeRaw === 'ssao'
                ? 'ssao'
                : 'off';
        draft.ambientOcclusion = ao;

        this._state.draft = this._normalizeDraft(draft);
        this._applyDraft(this._state.draft);
        this._syncLayerPanelFromState();
        this._persist();
    }

    _syncLayerPanelFromState() {
        const controls = this._layerControls ?? null;
        const draft = this._state?.draft ?? null;
        if (!controls || !draft) return;

        const aaMode = String(draft?.antiAliasing?.mode ?? '').toLowerCase();
        const aaSamplesRaw = Number(draft?.antiAliasing?.msaa?.samples);
        const aaSamples = aaSamplesRaw >= 8 ? '8' : '2';

        const aoModeRaw = String(draft?.ambientOcclusion?.mode ?? '').toLowerCase();
        const aoMode = aoModeRaw === 'gtao' ? 'gtao' : aoModeRaw === 'ssao' ? 'ssao' : 'off';

        if (controls.shadowsEnabled) controls.shadowsEnabled.checked = String(draft?.shadows?.quality ?? 'off').toLowerCase() !== 'off';
        if (controls.bloomEnabled) controls.bloomEnabled.checked = !!draft?.bloom?.enabled;
        if (controls.sunBloomEnabled) controls.sunBloomEnabled.checked = !!draft?.sunBloom?.enabled;
        if (controls.sunFlareEnabled) controls.sunFlareEnabled.checked = !!draft?.sunFlare?.enabled;
        if (controls.windowReflectionsEnabled) controls.windowReflectionsEnabled.checked = !!draft?.buildingWindowVisuals?.reflective?.enabled;
        controls.aoMode?.setValue?.(aoMode);
        controls.aaSamples?.setValue?.(aaMode === 'msaa' ? aaSamples : '2');
    }

    _handleKeyDown(e) {
        if (!e) return;
        if (isInteractiveElement(e.target)) return;

        const code = String(e.code || '');
        const key = String(e.key || '');
        const typed = key.trim().toUpperCase();

        const preset = getCameraPresetByKey(typed)
            ?? (() => {
                if (code.startsWith('Digit')) return getCameraPresetByKey(code.slice(5));
                if (code.startsWith('Numpad')) return getCameraPresetByKey(code.slice(6));
                return null;
            })();
        if (preset) {
            e.preventDefault();
            this._applyCameraPreset(preset.id);
            return;
        }

        const isR = code === 'KeyR' || typed === 'R';
        if (isR) {
            e.preventDefault();
            this.controls?.reset?.();
            return;
        }

        const isF = code === 'KeyF' || typed === 'F';
        if (isF) {
            e.preventDefault();
            this.controls?.frame?.();
        }
    }

    _normalizeDraft(rawDraft) {
        const normalized = normalizeStoredState({ draft: rawDraft, activeCameraPresetId: this._state.activeCameraPresetId });
        return normalized.draft;
    }

    _resetToFactoryDefaults() {
        this._state = normalizeStoredState({
            draft: createDefaultDraft(),
            activeCameraPresetId: DEFAULT_CAMERA_PRESET_ID
        });
        this._applyDraft(this._state.draft);
        this._applyCameraPreset(this._state.activeCameraPresetId);
        this._syncLayerPanelFromState();
        this._persist();
    }

    _persist() {
        saveStoredState(this._state);
    }

    _applyDraft(draft) {
        const d = draft && typeof draft === 'object' ? draft : null;
        if (!d || !this.engine) return;

        const lighting = d.lighting ?? null;
        const atmosphere = d.atmosphere ?? null;
        const shadows = d.shadows ?? null;
        const antiAliasing = d.antiAliasing ?? null;
        const ambientOcclusion = d.ambientOcclusion ?? null;
        const bloom = d.bloom ?? null;
        const sunBloom = d.sunBloom ?? null;
        const colorGrading = d.colorGrading ?? null;
        const buildingWindowVisuals = d.buildingWindowVisuals ?? null;
        const sunFlare = d.sunFlare ?? null;

        this.engine.setShadowSettings(shadows);
        this.engine.setLightingSettings(lighting);
        this.engine.setAtmosphereSettings(atmosphere);
        this.engine.setAntiAliasingSettings(antiAliasing);
        this.engine.setAmbientOcclusionSettings(ambientOcclusion);
        this.engine.setBloomSettings(bloom);
        this.engine.setSunBloomSettings(sunBloom);
        this.engine.setColorGradingSettings(colorGrading);

        const city = this.city ?? null;
        if (city && lighting) {
            if (city.hemi) city.hemi.intensity = lighting.hemiIntensity;
            if (city.sun) city.sun.intensity = lighting.sunIntensity;
        }
        city?.applyShadowSettings?.(this.engine);

        if (sunFlare && city?.sunFlare?.setSettings) city.sunFlare.setSettings(sunFlare);
        if (sunBloom && city?.sunBloom?.setSettings) city.sunBloom.setSettings(sunBloom);
        if (sunBloom && city?.sunRays?.setSettings) city.sunRays.setSettings(sunBloom);

        if (city?.buildings?.group && buildingWindowVisuals) {
            const sanitized = sanitizeBuildingWindowVisualsSettings(buildingWindowVisuals);
            const iblEnabled = !!this.engine?.lightingSettings?.ibl?.enabled && !!this.engine?.scene?.environment;
            const baseEnvMapIntensity = Number.isFinite(this.engine?.lightingSettings?.ibl?.envMapIntensity)
                ? this.engine.lightingSettings.ibl.envMapIntensity
                : 0.25;
            applyBuildingWindowVisualsToCityMeshes(city.buildings.group, sanitized, {
                iblEnabled,
                baseEnvMapIntensity
            });
        }
    }
}
