// src/graphics/gui/terrain_debugger/view/TerrainDebuggerUI.js
// Docked tabbed panel for the Terrain Debugger.
// @ts-check

import { DEFAULT_IBL_ID, getIblOptions } from '../../../content3d/catalogs/IBLCatalog.js';
import { getPbrMaterialClassSectionsForGround, getPbrMaterialOptionsForGround } from '../../../content3d/catalogs/PbrMaterialCatalog.js';
import { createDefaultGrassEngineConfig } from '../../../engine3d/grass/GrassConfig.js';
import { PickerPopup } from '../../shared/PickerPopup.js';
import { createBuildOutputPanel } from './ui/tab_builders/createBuildOutputPanel.js';
import { createBuildEnvironmentTab } from './ui/tab_builders/createBuildEnvironmentTab.js';
import { createBuildVisualizationTab } from './ui/tab_builders/createBuildVisualizationTab.js';
import { createBuildTerrainTab } from './ui/tab_builders/createBuildTerrainTab.js';
import { createBuildBiomeTransitionTab } from './ui/tab_builders/createBuildBiomeTransitionTab.js';
import { createBuildBiomeTilingTab } from './ui/tab_builders/createBuildBiomeTilingTab.js';
import { createBuildVariationTab } from './ui/tab_builders/createBuildVariationTab.js';
import { createBuildGrassTab } from './ui/tab_builders/createBuildGrassTab.js';
import {
    makeButtonRow,
    makeChoiceRow,
    makeColorRow,
    makeNumberSliderRow,
    makeSelectRow,
    makeTextRow,
    makeToggleRow
} from './ui/TerrainDebuggerUiControlBuilders.js';
import {
    TerrainDebuggerUiActionType,
    createTerrainDebuggerCameraPresetAction,
    createTerrainDebuggerFlyoverLoopChangedAction,
    createTerrainDebuggerFocusBiomeTilingAction,
    createTerrainDebuggerFocusBiomeTransitionAction,
    createTerrainDebuggerInspectGrassAction,
    createTerrainDebuggerInspectGrassLodAction,
    createTerrainDebuggerResetCameraAction,
    createTerrainDebuggerStateChangedAction,
    createTerrainDebuggerToggleFlyoverAction,
    isTerrainDebuggerUiAction
} from './contracts/TerrainDebuggerUiActionContract.js';

function clamp(value, min, max, fallback) {
    const num = Number(value);
    const fb = fallback === undefined ? min : fallback;
    if (!Number.isFinite(num)) return fb;
    return Math.max(min, Math.min(max, num));
}

function formatFixedWidthNumber(value, width = 10, digits = 2) {
    const num = Number(value);
    if (!Number.isFinite(num)) return `${'-'.repeat(width)}`;
    return String(num.toFixed(digits)).padStart(width, ' ');
}

function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

function deepClone(obj) {
    return obj && typeof obj === 'object' ? JSON.parse(JSON.stringify(obj)) : obj;
}

function deepMerge(base, override) {
    const baseObj = base && typeof base === 'object' ? base : {};
    const overrideObj = override && typeof override === 'object' ? override : null;
    if (!overrideObj) return deepClone(baseObj);

    const out = {};
    for (const [key, value] of Object.entries(baseObj)) out[key] = deepClone(value);
    for (const [key, value] of Object.entries(overrideObj)) {
        const prev = baseObj[key];
        const next = value;
        const bothObjects = prev && typeof prev === 'object' && !Array.isArray(prev)
            && next && typeof next === 'object' && !Array.isArray(next);
        out[key] = bothObjects ? deepMerge(prev, next) : deepClone(next);
    }
    return out;
}

const TERRAIN_BIOME_IDS = Object.freeze(['stone', 'grass', 'land']);
const TERRAIN_HUMIDITY_SLOT_IDS = Object.freeze(['dry', 'neutral', 'wet']);

const DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS = Object.freeze({
    stone: Object.freeze({ dry: 'pbr.rock_ground', neutral: 'pbr.rock_ground', wet: 'pbr.coast_sand_rocks_02' }),
    grass: Object.freeze({ dry: 'pbr.grass_005', neutral: 'pbr.grass_005', wet: 'pbr.grass_005' }),
    land: Object.freeze({ dry: 'pbr.ground_037', neutral: 'pbr.ground_037', wet: 'pbr.ground_037' })
});

const BIOME_TRANSITION_INTENT_IDS = Object.freeze(['soft', 'medium', 'hard']);

const BIOME_TRANSITION_INTENT_PRESETS = Object.freeze({
    soft: Object.freeze({
        widthScale: 1.45,
        falloffPower: 0.85,
        edgeNoiseScale: 0.02,
        edgeNoiseStrength: 0.42,
        dominanceBias: 0.0,
        heightInfluence: 0.28,
        contrast: 0.82
    }),
    medium: Object.freeze({
        widthScale: 1.0,
        falloffPower: 1.0,
        edgeNoiseScale: 0.02,
        edgeNoiseStrength: 0.22,
        dominanceBias: 0.0,
        heightInfluence: 0.0,
        contrast: 1.0
    }),
    hard: Object.freeze({
        widthScale: 0.65,
        falloffPower: 1.45,
        edgeNoiseScale: 0.02,
        edgeNoiseStrength: 0.08,
        dominanceBias: 0.0,
        heightInfluence: -0.12,
        contrast: 1.45
    })
});

const BIOME_TRANSITION_DEBUG_MODE_OPTIONS = Object.freeze([
    Object.freeze({ id: 'pair_isolation', label: 'Pair Isolation' }),
    Object.freeze({ id: 'transition_result', label: 'Final Result' }),
    Object.freeze({ id: 'transition_weight', label: 'Weight / Intensity' }),
    Object.freeze({ id: 'transition_falloff', label: 'Falloff Contribution' }),
    Object.freeze({ id: 'transition_noise', label: 'Edge Irregularity' }),
    Object.freeze({ id: 'pair_compare', label: 'Baseline vs Tuned' })
]);

const BIOME_TRANSITION_PROFILE_DEFAULT = Object.freeze({
    intent: 'medium',
    ...BIOME_TRANSITION_INTENT_PRESETS.medium
});
const TERRAIN_BIOME_SHADER_TEMP_DISABLED = true;
const TERRAIN_BIOME_SHADER_TEMP_DISABLED_REASON = 'Biome blend is temporarily disabled while terrain biome shader validation is being fixed.';

function titleCaseHumSlot(id) {
    const v = String(id ?? '');
    if (v === 'dry') return 'Dry';
    if (v === 'wet') return 'Wet';
    return 'Neutral';
}

function titleCaseBiome(id) {
    const v = String(id ?? '');
    if (v === 'stone') return 'Stone';
    if (v === 'grass') return 'Grass';
    return 'Land';
}

function normalizeHumiditySlotId(value) {
    const id = String(value ?? '');
    if (id === 'dry' || id === 'wet') return id;
    return 'neutral';
}

function getBiomeSortIndex(id) {
    const biome = String(id ?? '');
    if (biome === 'stone') return 0;
    if (biome === 'grass') return 1;
    if (biome === 'land') return 2;
    return 3;
}

function makeBiomePairKey(a, b) {
    const aId = TERRAIN_BIOME_IDS.includes(String(a ?? '')) ? String(a) : 'land';
    const bId = TERRAIN_BIOME_IDS.includes(String(b ?? '')) ? String(b) : aId;
    if (aId === bId) return `${aId}|${aId}`;
    if (getBiomeSortIndex(aId) <= getBiomeSortIndex(bId)) return `${aId}|${bId}`;
    return `${bId}|${aId}`;
}

function normalizeTransitionIntentId(value, fallback = 'medium') {
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === 'soft' || raw === 'medium' || raw === 'hard') return raw;
    const fb = String(fallback ?? '').trim().toLowerCase();
    if (fb === 'soft' || fb === 'hard') return fb;
    return 'medium';
}

function getTransitionIntentPreset(intent) {
    const id = normalizeTransitionIntentId(intent, 'medium');
    return BIOME_TRANSITION_INTENT_PRESETS[id] ?? BIOME_TRANSITION_INTENT_PRESETS.medium;
}

function sanitizeTransitionPairProfile(input, { fallbackProfile = BIOME_TRANSITION_PROFILE_DEFAULT } = {}) {
    const src = input && typeof input === 'object' ? input : {};
    const fallback = fallbackProfile && typeof fallbackProfile === 'object' ? fallbackProfile : BIOME_TRANSITION_PROFILE_DEFAULT;
    const intent = normalizeTransitionIntentId(src.intent, fallback.intent ?? 'medium');
    const preset = getTransitionIntentPreset(intent);
    return {
        intent,
        widthScale: clamp(src.widthScale, 0.25, 4.0, preset.widthScale ?? fallback.widthScale ?? BIOME_TRANSITION_PROFILE_DEFAULT.widthScale),
        falloffPower: clamp(src.falloffPower, 0.3, 3.5, preset.falloffPower ?? fallback.falloffPower ?? BIOME_TRANSITION_PROFILE_DEFAULT.falloffPower),
        edgeNoiseScale: clamp(src.edgeNoiseScale, 0.0005, 0.2, preset.edgeNoiseScale ?? fallback.edgeNoiseScale ?? BIOME_TRANSITION_PROFILE_DEFAULT.edgeNoiseScale),
        edgeNoiseStrength: clamp(src.edgeNoiseStrength, 0.0, 1.0, preset.edgeNoiseStrength ?? fallback.edgeNoiseStrength ?? BIOME_TRANSITION_PROFILE_DEFAULT.edgeNoiseStrength),
        dominanceBias: clamp(src.dominanceBias, -0.5, 0.5, preset.dominanceBias ?? fallback.dominanceBias ?? BIOME_TRANSITION_PROFILE_DEFAULT.dominanceBias),
        heightInfluence: clamp(src.heightInfluence, -1.0, 1.0, preset.heightInfluence ?? fallback.heightInfluence ?? BIOME_TRANSITION_PROFILE_DEFAULT.heightInfluence),
        contrast: clamp(src.contrast, 0.25, 3.0, preset.contrast ?? fallback.contrast ?? BIOME_TRANSITION_PROFILE_DEFAULT.contrast)
    };
}

function buildTransitionPreviewGradient({ biome1, biome2, profile } = {}) {
    const a = String(biome1 ?? 'grass');
    const b = String(biome2 ?? 'land');
    const p = sanitizeTransitionPairProfile(profile);
    const biomeColor = (id) => {
        if (id === 'stone') return '#969696';
        if (id === 'grass') return '#46A04E';
        return '#D79146';
    };
    const c0 = biomeColor(a);
    const c1 = biomeColor(b);
    const center = clamp(50 + (p.dominanceBias * 30), 30, 70, 50);
    const spread = clamp((p.widthScale * 18) + 8, 8, 30, 18);
    const stop0 = clamp(center - spread, 2, 98, 38);
    const stop1 = clamp(center + spread, 2, 98, 62);
    return `linear-gradient(90deg, ${c0} 0%, ${c0} ${stop0.toFixed(1)}%, ${c1} ${stop1.toFixed(1)}%, ${c1} 100%)`;
}

function getPatternTypeLabel(type) {
    const t = String(type ?? 'linear');
    if (t === 'contrast') return 'Noise (Contrast)';
    if (t === 'soft') return 'Noise (Soft)';
    if (t === 'threshold') return 'Noise (Threshold)';
    return 'Noise (Linear)';
}

function getAntiTilingLabel(mode) {
    const m = String(mode ?? 'fast');
    return m === 'quality' ? 'Quality' : 'Fast';
}

function pickNextPatternType(layers) {
    const used = new Set();
    for (const layer of Array.isArray(layers) ? layers : []) {
        if (!layer || typeof layer !== 'object') continue;
        if (layer.kind !== 'pattern') continue;
        if (layer.enabled === false) continue;
        used.add(String(layer.patternType ?? 'linear'));
    }
    const order = ['linear', 'soft', 'contrast', 'threshold'];
    for (const t of order) if (!used.has(t)) return t;
    return 'linear';
}

export class TerrainDebuggerUI {
    constructor({
        initialState,
        dispatchAction,
        onChange,
        onResetCamera,
        onCameraPreset,
        onFocusBiomeTransition,
        onFocusBiomeTiling,
        onToggleFlyover,
        onFlyoverLoopChange,
        onInspectGrass,
        onInspectGrassLod
    } = {}) {
        this._terrainTileSize = 24;
        this._terrainBaseDepthTiles = 16;
        this._syncCloudTilesMax = null;
        this._syncDrawDistanceForTerrain = null;

        this._dispatchAction = typeof dispatchAction === 'function' ? dispatchAction : null;
        this._onChange = typeof onChange === 'function' ? onChange : null;
        this._onResetCamera = typeof onResetCamera === 'function' ? onResetCamera : null;
        this._onCameraPreset = typeof onCameraPreset === 'function' ? onCameraPreset : null;
        this._onFocusBiomeTransition = typeof onFocusBiomeTransition === 'function' ? onFocusBiomeTransition : null;
        this._onFocusBiomeTiling = typeof onFocusBiomeTiling === 'function' ? onFocusBiomeTiling : null;
        this._onToggleFlyover = typeof onToggleFlyover === 'function' ? onToggleFlyover : null;
        this._onFlyoverLoopChange = typeof onFlyoverLoopChange === 'function' ? onFlyoverLoopChange : null;
        this._onInspectGrass = typeof onInspectGrass === 'function' ? onInspectGrass : null;
        this._onInspectGrassLod = typeof onInspectGrassLod === 'function' ? onInspectGrassLod : null;
        this._isSetting = false;
        this._sectionCollapsed = new Map();
        this._terrainLegendKey = '';
        this._pickerPopup = new PickerPopup();
        this._tabBuilders = this._createTabBuilders();

        const defaultTerrainEngine = {
            seed: 'terrain-debugger',
            patch: { sizeMeters: 72, originX: 0, originZ: 0, layout: 'voronoi', voronoiJitter: 0.85, warpScale: 0.02, warpAmplitudeMeters: 36 },
            biomes: {
                mode: 'patch_grid',
                defaultBiomeId: 'land',
                weights: { stone: 0.25, grass: 0.35, land: 0.40 }
            },
            humidity: {
                mode: 'source_map',
                cloud: {
                    subtilePerTile: 8,
                    scale: 0.02,
                    octaves: 4,
                    gain: 0.5,
                    lacunarity: 2.0,
                    bias: 0.0,
                    amplitude: 1.0
                }
            },
            materialBindings: {
                biomes: {
                    stone: { dry: 'pbr.rock_ground', neutral: 'pbr.rock_ground', wet: 'pbr.coast_sand_rocks_02' },
                    grass: { dry: 'pbr.grass_005', neutral: 'pbr.grass_005', wet: 'pbr.grass_005' },
                    land: { dry: 'pbr.ground_037', neutral: 'pbr.ground_037', wet: 'pbr.ground_037' }
                },
                humidity: {
                    dryMax: 0.33,
                    wetMin: 0.67,
                    blendBand: 0.02,
                    edgeNoiseScale: 0.025,
                    edgeNoiseStrength: 0.0
                }
            },
            transition: {
                cameraBlendRadiusMeters: 140,
                cameraBlendFeatherMeters: 24,
                boundaryBandMeters: 10,
                profileDefaults: deepClone(BIOME_TRANSITION_PROFILE_DEFAULT),
                pairProfiles: {}
            }
        };

        const baseState = {
            tab: 'environment',
            ibl: {
                enabled: true,
                iblId: DEFAULT_IBL_ID,
                setBackground: true,
                envMapIntensity: 0.3
            },
            exposure: 1.14,
            visualization: {
                landWireframe: false,
                asphaltWireframe: false
            },
            camera: {
                drawDistance: 4000,
                presetId: 'low',
                flyoverLoop: false
            },
            terrain: {
                layout: {
                    extraEndTiles: 80,
                    extraSideTiles: 20
                },
                slope: {
                    leftDeg: 1.5,
                    rightDeg: 3.5,
                    endDeg: 3,
                    endStartAfterRoadTiles: 0
                },
                showGrid: false,
                cloud: {
                    enabled: true,
                    amplitude: 11,
                    worldScale: 0.1,
                    tiles: 50,
                    blendMeters: 1000
                },
                engine: defaultTerrainEngine,
                debug: {
                    mode: 'standard'
                },
                biomeTransition: {
                    biome1: 'grass',
                    biome2: 'land',
                    debugMode: 'transition_result',
                    compareEnabled: false,
                    leftMaterialId: '',
                    rightMaterialId: '',
                    selectedPresetId: '',
                    catalog: [],
                    baselineProfiles: {}
                },
                biomeTiling: {
                    calibrationRigDebugEnabled: false,
                    materialId: '',
                    distanceTiling: {
                        enabled: false,
                        nearScale: 4.0,
                        farScale: 0.36,
                        blendStartMeters: 40,
                        blendEndMeters: 240,
                        blendCurve: 1.0,
                        debugView: 'blended'
                    },
                    variation: {
                        antiTilingEnabled: false,
                        antiTilingStrength: 0.45,
                        antiTilingCellMeters: 2.0,
                        macroVariationEnabled: false,
                        macroVariationStrength: 0.16,
                        macroVariationScale: 0.02,
                        nearIntensity: 1.0,
                        farIntensity: 0.65
                    },
                    displacement: {
                        enabled: false,
                        strength: 0.02,
                        bias: 0.0,
                        source: 'auto',
                        debugView: 'standard'
                    },
                    geometryDensity: {
                        enabled: false,
                        mode: 'uniform',
                        detailPreset: 'medium',
                        segmentsPerTile: 1,
                        nearSegmentsPerTile: 16,
                        farSegmentsPerTile: 1,
                        nearRadiusMeters: 0,
                        transitionWidthMeters: 0,
                        renderDistanceMeters: 0,
                        transitionSmoothing: 0.72,
                        transitionBias: 0.0,
                        transitionDebugBands: 0,
                        waveStrength: 0.02,
                        waveMaxHeightMeters: 2.0,
                        waveMaxNeighborDeltaMeters: 0.5,
                        waveMaxTileRangeMeters: 0.5,
                        ringOverlayEnabled: false,
                        tileLodDebugEnabled: false,
                        centerOnApplyCamera: true,
                        rebuildCadence: 'off',
                        centerX: 0,
                        centerZ: 0,
                        applyNonce: 0
                    },
                    performance: {
                        fragmentShaderEnabled: false,
                        fragmentShaderBiomeEnabled: false,
                        fragmentShaderPbrLightingEnabled: false,
                        fragmentShaderAlbedoEnabled: false,
                        fragmentShaderSurfaceEnabled: false,
                        shadowsEnabled: true,
                        highDpiEnabled: true
                    }
                }
            },
            grass: createDefaultGrassEngineConfig(),
        };
        this._state = deepMerge(baseState, initialState && typeof initialState === 'object' ? initialState : null);

        this.root = makeEl('div', 'ui-layer options-layer');
        this.root.id = 'ui-terrain-debugger';

        this.panel = makeEl('div', 'ui-panel is-interactive options-panel');

        const header = makeEl('div', 'options-header');
        const title = makeEl('div', 'options-title', 'Terrain Debugger');
        const subtitle = makeEl('div', 'options-subtitle', 'LMB look · RMB orbit · MMB pan · WASD/Arrow keys move · Shift = fast · Wheel dolly · F frame · R reset');
        header.appendChild(title);
        header.appendChild(subtitle);

        this.tabs = makeEl('div', 'options-tabs');
        this._tabButtons = {
            environment: makeEl('button', 'options-tab', 'Environment'),
            terrain: makeEl('button', 'options-tab', 'Terrain'),
            biome_transition: makeEl('button', 'options-tab', 'Biome Transition'),
            biome_tiling: makeEl('button', 'options-tab', 'Biome Tiling'),
            visualization: makeEl('button', 'options-tab', 'Visualization'),
            grass: makeEl('button', 'options-tab', 'Grass')
        };
        for (const [key, btn] of Object.entries(this._tabButtons)) {
            btn.type = 'button';
            btn.addEventListener('click', () => this.setTab(key));
            this.tabs.appendChild(btn);
        }

        this.body = makeEl('div', 'options-body');
        this._tabBodies = {
            environment: makeEl('div', null),
            terrain: makeEl('div', null),
            biome_transition: makeEl('div', null),
            biome_tiling: makeEl('div', null),
            visualization: makeEl('div', null),
            grass: makeEl('div', null)
        };
        this.body.appendChild(this._tabBodies.environment);
        this.body.appendChild(this._tabBodies.terrain);
        this.body.appendChild(this._tabBodies.biome_transition);
        this.body.appendChild(this._tabBodies.biome_tiling);
        this.body.appendChild(this._tabBodies.visualization);
        this.body.appendChild(this._tabBodies.grass);

        this.panel.appendChild(header);
        this.panel.appendChild(this.tabs);
        this.panel.appendChild(this.body);
        this.root.appendChild(this.panel);

        this._controls = {};
        this._outputPanel = null;
        this._buildOutputPanel();
        this._buildEnvironmentTab();
        this._buildTerrainTab();
        this._buildBiomeTransitionTab();
        this._buildBiomeTilingTab();
        this._buildVisualizationTab();
        this._buildGrassTab();

        this.setTab(this._state.tab);

        this._onKeyDown = (e) => {
            if (!e) return;
            if (e.code !== 'Escape' && e.key !== 'Escape') return;
            if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;
            e.preventDefault();
        };
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
    }

    _createTabBuilderDeps() {
        return Object.freeze({
            clamp,
            formatFixedWidthNumber,
            makeEl,
            makeToggleRow,
            makeSelectRow,
            makeChoiceRow,
            makeNumberSliderRow,
            makeTextRow,
            makeColorRow,
            makeButtonRow,
            deepClone,
            deepMerge,
            TERRAIN_BIOME_IDS,
            TERRAIN_HUMIDITY_SLOT_IDS,
            DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS,
            BIOME_TRANSITION_INTENT_IDS,
            BIOME_TRANSITION_INTENT_PRESETS,
            BIOME_TRANSITION_DEBUG_MODE_OPTIONS,
            BIOME_TRANSITION_PROFILE_DEFAULT,
            TERRAIN_BIOME_SHADER_TEMP_DISABLED,
            TERRAIN_BIOME_SHADER_TEMP_DISABLED_REASON,
            titleCaseHumSlot,
            titleCaseBiome,
            normalizeHumiditySlotId,
            getBiomeSortIndex,
            makeBiomePairKey,
            normalizeTransitionIntentId,
            getTransitionIntentPreset,
            sanitizeTransitionPairProfile,
            buildTransitionPreviewGradient,
            getPatternTypeLabel,
            getAntiTilingLabel,
            pickNextPatternType,
            getIblOptions,
            DEFAULT_IBL_ID,
            getPbrMaterialOptionsForGround,
            getPbrMaterialClassSectionsForGround,
            createDefaultGrassEngineConfig,
            createTerrainDebuggerCameraPresetAction,
            createTerrainDebuggerFlyoverLoopChangedAction,
            createTerrainDebuggerFocusBiomeTilingAction,
            createTerrainDebuggerFocusBiomeTransitionAction,
            createTerrainDebuggerInspectGrassAction,
            createTerrainDebuggerInspectGrassLodAction,
            createTerrainDebuggerResetCameraAction,
            createTerrainDebuggerToggleFlyoverAction
        });
    }

    _createTabBuilders() {
        const deps = this._createTabBuilderDeps();
        return Object.freeze({
            buildOutputPanel: createBuildOutputPanel(deps),
            buildEnvironmentTab: createBuildEnvironmentTab(deps),
            buildVisualizationTab: createBuildVisualizationTab(deps),
            buildTerrainTab: createBuildTerrainTab(deps),
            buildBiomeTransitionTab: createBuildBiomeTransitionTab(deps),
            buildBiomeTilingTab: createBuildBiomeTilingTab(deps),
            buildVariationTab: createBuildVariationTab(deps),
            buildGrassTab: createBuildGrassTab(deps)
        });
    }

    mount() {
        document.body.appendChild(this.root);
        if (this._outputPanel) {
            document.body.appendChild(this._outputPanel);
        }
    }

    unmount() {
        window.removeEventListener('keydown', this._onKeyDown);
        this._pickerPopup?.dispose?.();
        this._pickerPopup = null;
        this.root.remove();
        this._outputPanel?.remove?.();
    }

    _buildOutputPanel() {
        return this._tabBuilders.buildOutputPanel.call(this);
    }

    getState() {
        return deepClone(this._state);
    }

    setGrassConfig(nextGrass, { emit = true } = {}) {
        const next = nextGrass && typeof nextGrass === 'object' ? nextGrass : null;
        if (!next) return;

        this._isSetting = true;
        this._state.grass = deepClone(next);

        const grass = this._state.grass;
        const setSlider = (ctrl, value, digits) => {
            if (!ctrl?.range || !ctrl?.number) return;
            const v = Number(value);
            if (!Number.isFinite(v)) return;
            ctrl.range.value = String(v);
            ctrl.number.value = String(Number.isFinite(digits) ? v.toFixed(digits) : v);
        };

        setSlider(this._controls?.grassRoughness, grass?.material?.roughness, 2);
        setSlider(this._controls?.grassMetalness, grass?.material?.metalness, 2);

        setSlider(this._controls?.grassBladesPerTuft, grass?.geometry?.tuft?.bladesPerTuft, 0);
        setSlider(this._controls?.grassTuftRadius, grass?.geometry?.tuft?.radius, 2);
        setSlider(this._controls?.grassBladeWidth, grass?.geometry?.blade?.width, 3);
        setSlider(this._controls?.grassHeightMult, grass?.geometry?.blade?.height, 2);

        setSlider(this._controls?.grassFieldHeightMin, grass?.field?.height?.min, 2);
        setSlider(this._controls?.grassFieldHeightMax, grass?.field?.height?.max, 2);

        setSlider(this._controls?.grassDensityMasterMul, grass?.density?.masterMul, 2);
        setSlider(this._controls?.grassDensityNearMul, grass?.density?.nearMul, 2);
        setSlider(this._controls?.grassDensityMidMul, grass?.density?.midMul, 2);
        setSlider(this._controls?.grassDensityFarMul, grass?.density?.farMul, 2);

        const render = grass?.lod?.renderMode ?? {};
        if (this._controls?.grassRenderModeMaster?.select) this._controls.grassRenderModeMaster.select.value = String(render.master ?? 'tuft');
        if (this._controls?.grassRenderModeNear?.select) this._controls.grassRenderModeNear.select.value = String(render.near ?? 'star');
        if (this._controls?.grassRenderModeMid?.select) this._controls.grassRenderModeMid.select.value = String(render.mid ?? 'cross');
        if (this._controls?.grassRenderModeFar?.select) this._controls.grassRenderModeFar.select.value = String(render.far ?? 'cross_sparse');

        this._isSetting = false;
        if (emit) this._emit();
    }

    setTab(key) {
        const next = (key === 'terrain' || key === 'biome_transition' || key === 'biome_tiling' || key === 'grass' || key === 'visualization') ? key : 'environment';
        this._state.tab = next;
        for (const [id, btn] of Object.entries(this._tabButtons)) btn.classList.toggle('is-active', id === next);
        for (const [id, body] of Object.entries(this._tabBodies)) body.style.display = id === next ? '' : 'none';
        this._emit();
    }

    setTerrainMeta({ tileSize, baseDepthTiles } = {}) {
        const nextTileSize = Number(tileSize);
        if (Number.isFinite(nextTileSize) && nextTileSize > 0) this._terrainTileSize = nextTileSize;

        const nextBaseDepthTiles = Math.round(Number(baseDepthTiles));
        if (Number.isFinite(nextBaseDepthTiles) && nextBaseDepthTiles > 0) this._terrainBaseDepthTiles = nextBaseDepthTiles;

        this._syncCloudTilesMax?.();
        this._syncDrawDistanceForTerrain?.();
    }

    setTerrainSampleInfo({
        x = null,
        z = null,
        patchId = null,
        primaryBiomeId = null,
        secondaryBiomeId = null,
        biomeBlend = null,
        humidity = null
    } = {}) {
        const note = this._controls?.terrainSampleNote ?? null;
        if (!note) return;

        const xx = Number(x);
        const zz = Number(z);
        const pid = Number(patchId);
        if (!(Number.isFinite(xx) && Number.isFinite(zz) && Number.isFinite(pid) && pid !== 0)) {
            note.textContent = 'Sample: (move mouse over terrain)';
            return;
        }

        const toIndex = (id) => (id === 'stone' ? 0 : id === 'grass' ? 1 : id === 'land' ? 2 : '?');
        const prim = String(primaryBiomeId ?? '');
        const sec = String(secondaryBiomeId ?? '');
        const blend = clamp(biomeBlend, 0.0, 1.0, 0.0);
        const hum = clamp(humidity, 0.0, 1.0, 0.5);

        note.textContent = `Sample: x ${xx.toFixed(1)} z ${zz.toFixed(1)} · patchId ${(pid >>> 0).toString()} · biome ${toIndex(prim)}:${prim || '?'} → ${toIndex(sec)}:${sec || '?'} (blend ${blend.toFixed(2)}) · humidity ${hum.toFixed(2)}`;
    }

    setBiomeTilingDiagnostics({
        active = false,
        requestedAdaptiveEnabled = true,
        appliedAdaptiveEnabled = true,
        requestedGeometryMode = 'uniform',
        appliedGeometryMode = 'uniform',
        requestedSegmentsPerTile = null,
        appliedSegmentsPerTile = null,
        requestedNearSegmentsPerTile = null,
        requestedFarSegmentsPerTile = null,
        appliedNearSegmentsPerTile = null,
        appliedFarSegmentsPerTile = null,
        requestedNearRadiusMeters = null,
        requestedTransitionWidthMeters = null,
        appliedNearRadiusMeters = null,
        appliedTransitionWidthMeters = null,
        requestedTransitionSmoothing = null,
        requestedTransitionBias = null,
        requestedTransitionDebugBands = null,
        appliedTransitionSmoothing = null,
        appliedTransitionBias = null,
        appliedTransitionDebugBands = null,
        requestedRenderDistanceMeters = null,
        appliedRenderDistanceMeters = null,
        requestedWaveStrength = null,
        appliedWaveStrength = null,
        requestedWaveMaxHeightMeters = null,
        requestedWaveMaxNeighborDeltaMeters = null,
        appliedRingCenterX = null,
        appliedRingCenterZ = null,
        ringOverlayEnabled = false,
        overlayVisible = false,
        overlayWidthTiles = null,
        overlayDepthTiles = null,
        overlayWidthMeters = null,
        overlayDepthMeters = null,
        overlayVertices = null,
        overlayTriangles = null,
        widthTiles = null,
        depthTiles = null,
        vertices = null,
        triangles = null,
        baseWidthTiles = null,
        baseDepthTiles = null,
        baseVertices = null,
        baseTriangles = null,
        lastGeometryApplyMs = null,
        lastDisplacementUpdateMs = null,
        displacementEnabled = false,
        displacementSourceMode = 'auto',
        displacementResolvedSource = 'none',
        displacementFallbackActive = false,
        displacementTextureUrl = '',
        displacementMissing = false,
        lodDetailPreset = 'medium',
        lodQuadLevels = null,
        lodTileCounts = null,
        lodTotalQuads = null,
        lodBandWidthsMeters = null,
        lodSamplerEstimateUsed = null,
        lodSamplerMaxTextures = null,
        gpuSamplerHeadroom = null,
        gpuWebglVersion = '',
        gpuFrameTimeMs = null,
        fragmentShaderEnabled = false,
        fragmentShaderBiomeEnabled = false,
        fragmentShaderPbrLightingEnabled = false,
        fragmentShaderAlbedoEnabled = false,
        fragmentShaderSurfaceEnabled = false,
        distanceBlendEnabled = false,
        antiTilingEnabled = false,
        macroVariationEnabled = false,
        fragmentToggleStates = null,
        fragmentPathStates = null,
        gpuSamplerPathRows = null,
        activeLodZone = 'n/a',
        activeLodBlend = null,
        activeLodSegmentsPerTile = null,
        activeLodDistanceMeters = null,
        historyWindowSec = null,
        historyNearPct = null,
        historyTransitionPct = null,
        historyFarPct = null,
        historyBoundaryCrossings = 0,
        historyPopCandidates = 0,
        historyMaxSegmentsDeltaPerSec = null
    } = {}) {
        const sourceNote = this._controls?.biomeTilingDisplacementStatus ?? null;
        const geometryNote = this._controls?.biomeTilingGeometryStats ?? null;
        const adaptiveNote = this._controls?.biomeTilingAdaptiveStatus ?? null;
        const perfNote = this._controls?.biomeTilingAdaptivePerf ?? null;
        const updateCostNote = this._controls?.biomeTilingUpdateCost ?? null;
        const pendingNote = this._controls?.biomeTilingPendingApply ?? null;
        const lodStateNote = this._controls?.biomeTilingLodState ?? null;
        const lodHistoryNote = this._controls?.biomeTilingLodHistory ?? null;
        const terrainLodSummaryNote = this._controls?.biomeTilingTerrainLodSummary ?? null;
        const terrainLodStatusCell = this._controls?.biomeTilingTerrainLodStatusCell ?? null;
        const terrainLodCountCells = this._controls?.biomeTilingTerrainLodCountCells ?? null;
        const terrainLodTotalCell = this._controls?.biomeTilingTerrainLodTotalCell ?? null;
        const lodSamplerDiagnosticsNote = this._controls?.biomeTilingLodSamplerDiagnostics ?? null;
        const fragmentPathBreakdownNote = this._controls?.biomeTilingFragmentPathBreakdown ?? null;
        const gpuSamplerUsageNote = this._controls?.biomeTilingGpuSamplerUsage ?? null;
        const gpuMaxTexturesNote = this._controls?.biomeTilingGpuMaxTextures ?? null;
        const gpuSamplerHeadroomNote = this._controls?.biomeTilingGpuSamplerHeadroom ?? null;
        const gpuWebglVersionNote = this._controls?.biomeTilingGpuWebglVersion ?? null;
        const gpuFrameTimeNote = this._controls?.biomeTilingGpuFrameTime ?? null;
        const gpuSamplerPathsTableBody = this._controls?.biomeTilingGpuSamplerPathsBody ?? null;
        const baseGeometryNote = this._controls?.biomeTilingBaseGeometryStats ?? null;
        const baseModeNote = this._controls?.biomeTilingBaseMode ?? null;
        const renderGpuSamplerPathRows = ({ rows = null, totalUsed = null, maxTextures = null } = {}) => {
            if (!gpuSamplerPathsTableBody) return;
            while (gpuSamplerPathsTableBody.firstChild) gpuSamplerPathsTableBody.removeChild(gpuSamplerPathsTableBody.firstChild);
            const samplerRows = Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
            if (!samplerRows.length) {
                const tr = document.createElement('tr');
                const tdPath = document.createElement('td');
                const tdSamplers = document.createElement('td');
                const tdNotes = document.createElement('td');
                tdPath.textContent = 'n/a';
                tdSamplers.textContent = 'n/a';
                tdNotes.textContent = 'No active fragment paths.';
                tdPath.style.padding = '5px 8px';
                tdSamplers.style.padding = '5px 8px';
                tdNotes.style.padding = '5px 8px';
                tdSamplers.style.textAlign = 'right';
                tdPath.style.whiteSpace = 'nowrap';
                tdSamplers.style.whiteSpace = 'nowrap';
                tr.appendChild(tdPath);
                tr.appendChild(tdSamplers);
                tr.appendChild(tdNotes);
                gpuSamplerPathsTableBody.appendChild(tr);
                return;
            }

            for (const row of samplerRows) {
                const tr = document.createElement('tr');
                const tdPath = document.createElement('td');
                const tdSamplers = document.createElement('td');
                const tdNotes = document.createElement('td');
                const label = String(row?.label ?? '').trim() || '(path)';
                const samplers = Math.max(0, Math.round(Number(row?.samplers) || 0));
                const note = String(row?.note ?? '').trim();
                tdPath.textContent = label;
                tdSamplers.textContent = samplers.toLocaleString();
                tdNotes.textContent = note || '-';
                tdPath.style.padding = '5px 8px';
                tdSamplers.style.padding = '5px 8px';
                tdNotes.style.padding = '5px 8px';
                tdSamplers.style.textAlign = 'right';
                tdPath.style.whiteSpace = 'nowrap';
                tdSamplers.style.whiteSpace = 'nowrap';
                tr.appendChild(tdPath);
                tr.appendChild(tdSamplers);
                tr.appendChild(tdNotes);
                gpuSamplerPathsTableBody.appendChild(tr);
            }

            const totalRow = document.createElement('tr');
            const totalPath = document.createElement('td');
            const totalSamplers = document.createElement('td');
            const totalNote = document.createElement('td');
            totalPath.textContent = 'Total';
            const used = Math.max(0, Math.round(Number(totalUsed) || 0));
            const max = Math.max(0, Math.round(Number(maxTextures) || 0));
            totalSamplers.textContent = max > 0
                ? `${used.toLocaleString()} / ${max.toLocaleString()}`
                : `${used.toLocaleString()} / n/a`;
            totalNote.textContent = 'Estimated total fragment samplers vs max fragment texture units.';
            totalPath.style.padding = '5px 8px';
            totalSamplers.style.padding = '5px 8px';
            totalNote.style.padding = '5px 8px';
            totalSamplers.style.textAlign = 'right';
            totalPath.style.whiteSpace = 'nowrap';
            totalSamplers.style.whiteSpace = 'nowrap';
            totalPath.style.fontWeight = '700';
            totalSamplers.style.fontWeight = '700';
            totalNote.style.opacity = '0.8';
            totalRow.appendChild(totalPath);
            totalRow.appendChild(totalSamplers);
            totalRow.appendChild(totalNote);
            gpuSamplerPathsTableBody.appendChild(totalRow);
        };
        if (!(
            sourceNote
            || geometryNote
            || adaptiveNote
            || perfNote
            || updateCostNote
            || pendingNote
            || lodStateNote
            || lodHistoryNote
            || terrainLodSummaryNote
            || terrainLodStatusCell
            || terrainLodCountCells
            || terrainLodTotalCell
            || lodSamplerDiagnosticsNote
            || fragmentPathBreakdownNote
            || gpuSamplerUsageNote
            || gpuMaxTexturesNote
            || gpuSamplerHeadroomNote
            || gpuWebglVersionNote
            || gpuFrameTimeNote
            || gpuSamplerPathsTableBody
            || baseGeometryNote
            || baseModeNote
        )) return;

        if (!active) {
            if (sourceNote) sourceNote.textContent = 'Displacement overlay: (Biome Tiling tab inactive)';
            if (geometryNote) geometryNote.textContent = 'Adaptive terrain geometry: (Biome Tiling tab inactive)';
            if (adaptiveNote) adaptiveNote.textContent = 'Adaptive terrain LOD: (Biome Tiling tab inactive)';
            if (perfNote) perfNote.textContent = 'Adaptive terrain diagnostics: (Biome Tiling tab inactive)';
            if (updateCostNote) updateCostNote.textContent = 'Adaptive terrain update cost: (Biome Tiling tab inactive)';
            if (pendingNote) pendingNote.textContent = 'Adaptive terrain pending: (Biome Tiling tab inactive)';
            if (lodStateNote) lodStateNote.textContent = 'Adaptive terrain state: (Biome Tiling tab inactive)';
            if (lodHistoryNote) lodHistoryNote.textContent = 'Adaptive terrain history: (Biome Tiling tab inactive)';
            if (terrainLodSummaryNote) terrainLodSummaryNote.textContent = 'Terrain LOD: (Biome Tiling tab inactive)';
            if (terrainLodStatusCell) terrainLodStatusCell.textContent = 'n/a';
            if (terrainLodCountCells && typeof terrainLodCountCells === 'object') {
                for (const level of ['256', '64', '16', '4', '1']) {
                    const cell = terrainLodCountCells[level];
                    if (cell) cell.textContent = 'n/a';
                }
            }
            if (terrainLodTotalCell) terrainLodTotalCell.textContent = 'n/a';
            if (lodSamplerDiagnosticsNote) lodSamplerDiagnosticsNote.textContent = 'Fragment samplers: n/a';
            if (fragmentPathBreakdownNote) fragmentPathBreakdownNote.textContent = 'Fragment paths: n/a';
            if (gpuSamplerUsageNote) gpuSamplerUsageNote.textContent = 'GPU samplers: n/a';
            if (gpuMaxTexturesNote) gpuMaxTexturesNote.textContent = 'GPU max fragment texture units: n/a';
            if (gpuSamplerHeadroomNote) gpuSamplerHeadroomNote.textContent = 'GPU sampler headroom: n/a';
            if (gpuWebglVersionNote) gpuWebglVersionNote.textContent = 'GPU WebGL: n/a';
            if (gpuFrameTimeNote) gpuFrameTimeNote.textContent = 'GPU frame time: n/a';
            renderGpuSamplerPathRows();
            if (baseGeometryNote) baseGeometryNote.textContent = 'Base terrain geometry: (Biome Tiling tab inactive)';
            if (baseModeNote) baseModeNote.textContent = 'Base terrain mode: (Biome Tiling tab inactive)';
            return;
        }

        const requestedMode = String(requestedGeometryMode ?? 'uniform') === 'adaptive_rings' ? 'adaptive_rings' : 'uniform';
        const appliedMode = String(appliedGeometryMode ?? 'uniform') === 'adaptive_rings' ? 'adaptive_rings' : 'uniform';
        const sourceMode = String(displacementSourceMode ?? 'auto');
        const resolvedSource = String(displacementResolvedSource ?? 'none');
        const url = String(displacementTextureUrl ?? '');
        if (sourceNote) {
            const enabledText = displacementEnabled ? 'enabled' : 'disabled';
            const fallbackText = displacementFallbackActive ? ' · fallback active' : '';
            const missingText = displacementMissing ? ' · source missing' : '';
            const fileText = url ? ` · ${url.split('/').pop() || 'texture'}` : '';
            sourceNote.textContent = `Displacement overlay: ${enabledText} · mode ${sourceMode} · using ${resolvedSource}${fallbackText}${missingText}${fileText}`;
        }

        const overlayW = Number.isFinite(Number(overlayWidthTiles)) ? Math.max(0, Number(overlayWidthTiles)) : Math.max(0, Number(widthTiles) || 0);
        const overlayD = Number.isFinite(Number(overlayDepthTiles)) ? Math.max(0, Number(overlayDepthTiles)) : Math.max(0, Number(depthTiles) || 0);
        const overlayWm = Number.isFinite(Number(overlayWidthMeters)) ? Math.max(0, Number(overlayWidthMeters)) : null;
        const overlayDm = Number.isFinite(Number(overlayDepthMeters)) ? Math.max(0, Number(overlayDepthMeters)) : null;
        const oV = Math.max(0, Math.round(Number(overlayVertices) || Number(vertices) || 0));
        const oT = Math.max(0, Math.round(Number(overlayTriangles) || Number(triangles) || 0));
        if (geometryNote) {
            const sizeMetersText = (overlayWm !== null && overlayDm !== null)
                ? `${overlayWm.toFixed(1)}m x ${overlayDm.toFixed(1)}m`
                : 'n/a';
            const sizeTilesText = `${overlayW.toFixed(1)}x${overlayD.toFixed(1)} tiles`;
            if (overlayVisible || oT > 0 || oV > 0) {
                const visText = overlayVisible ? 'visible' : 'hidden';
                geometryNote.textContent = `Adaptive terrain geometry: ${sizeMetersText} (${sizeTilesText}) · ${oV.toLocaleString()} verts · ${oT.toLocaleString()} tris · mode ${appliedMode === 'adaptive_rings' ? 'adaptive' : 'uniform'} · ${visText}`;
            } else {
                geometryNote.textContent = 'Adaptive terrain geometry: not built yet';
            }
        }

        const lodLevels = [256, 64, 16, 4, 1];
        const lodCounts = (lodTileCounts && typeof lodTileCounts === 'object') ? lodTileCounts : {};
        const lodTotalQuadsRounded = Math.max(0, Math.round(Number(lodTotalQuads) || 0));
        if (terrainLodSummaryNote) {
            const countsText = lodLevels
                .map((level) => `${level}:${Math.max(0, Math.round(Number(lodCounts[String(level)]) || 0)).toLocaleString()}`)
                .join(' · ');
            terrainLodSummaryNote.textContent = `Terrain LOD (${String(lodDetailPreset ?? 'medium')}): ${countsText} · total quads ${lodTotalQuadsRounded.toLocaleString()}`;
        }
        if (terrainLodStatusCell) {
            terrainLodStatusCell.textContent = (appliedAdaptiveEnabled !== false) ? 'On' : 'Off';
        }
        if (terrainLodCountCells && typeof terrainLodCountCells === 'object') {
            for (const level of lodLevels) {
                const cell = terrainLodCountCells[String(level)] ?? null;
                if (!cell) continue;
                const count = Math.max(0, Math.round(Number(lodCounts[String(level)]) || 0));
                cell.textContent = count.toLocaleString();
            }
        }
        if (terrainLodTotalCell) terrainLodTotalCell.textContent = lodTotalQuadsRounded.toLocaleString();
        if (lodSamplerDiagnosticsNote) {
            const used = Math.max(0, Math.round(Number(lodSamplerEstimateUsed) || 0));
            const max = Math.max(0, Math.round(Number(lodSamplerMaxTextures) || 0));
            const shaderEnabledText = fragmentShaderEnabled === false ? ' · shader off' : '';
            lodSamplerDiagnosticsNote.textContent = (max > 0)
                ? `Fragment samplers: ${used.toLocaleString()} / ${max.toLocaleString()}${shaderEnabledText}`
                : `Fragment samplers: ${used.toLocaleString()} / n/a${shaderEnabledText}`;
        }
        const fallbackToggleRows = [
            { label: 'Fragment Shader', requested: fragmentShaderEnabled === true, effective: fragmentShaderEnabled === true, reason: fragmentShaderEnabled ? '' : 'set Off' },
            {
                label: 'Albedo',
                requested: fragmentShaderAlbedoEnabled === true,
                effective: fragmentShaderEnabled === true && fragmentShaderAlbedoEnabled === true,
                reason: fragmentShaderAlbedoEnabled === true
                    ? (fragmentShaderEnabled === true ? '' : 'blocked by Fragment Shader')
                    : 'set Off'
            },
            {
                label: 'Distance Blend Shader',
                requested: distanceBlendEnabled === true,
                effective: fragmentShaderEnabled === true && fragmentShaderAlbedoEnabled === true && distanceBlendEnabled === true,
                reason: distanceBlendEnabled === true
                    ? (fragmentShaderEnabled === true
                        ? (fragmentShaderAlbedoEnabled === true ? '' : 'blocked by Albedo')
                        : 'blocked by Fragment Shader')
                    : 'set Off'
            },
            {
                label: 'Anti-tiling Shader',
                requested: antiTilingEnabled === true,
                effective: fragmentShaderEnabled === true && fragmentShaderAlbedoEnabled === true && antiTilingEnabled === true,
                reason: antiTilingEnabled === true
                    ? (fragmentShaderEnabled === true
                        ? (fragmentShaderAlbedoEnabled === true ? '' : 'blocked by Albedo')
                        : 'blocked by Fragment Shader')
                    : 'set Off'
            },
            {
                label: 'Macro Variation Shader',
                requested: macroVariationEnabled === true,
                effective: fragmentShaderEnabled === true && fragmentShaderAlbedoEnabled === true && macroVariationEnabled === true,
                reason: macroVariationEnabled === true
                    ? (fragmentShaderEnabled === true
                        ? (fragmentShaderAlbedoEnabled === true ? '' : 'blocked by Albedo')
                        : 'blocked by Fragment Shader')
                    : 'set Off'
            },
            {
                label: 'PBR Lighting',
                requested: fragmentShaderPbrLightingEnabled === true,
                effective: fragmentShaderEnabled === true && fragmentShaderPbrLightingEnabled === true,
                reason: fragmentShaderPbrLightingEnabled === true
                    ? (fragmentShaderEnabled === true ? '' : 'blocked by Fragment Shader')
                    : 'set Off'
            },
            {
                label: 'Surface (Normal+ORM)',
                requested: fragmentShaderSurfaceEnabled === true,
                effective: fragmentShaderEnabled === true
                    && fragmentShaderPbrLightingEnabled === true
                    && fragmentShaderSurfaceEnabled === true,
                reason: fragmentShaderSurfaceEnabled === true
                    ? (fragmentShaderEnabled === true
                        ? (fragmentShaderPbrLightingEnabled === true ? '' : 'blocked by PBR Lighting')
                        : 'blocked by Fragment Shader')
                    : 'set Off'
            },
            {
                label: 'Biome',
                requested: fragmentShaderBiomeEnabled === true,
                effective: fragmentShaderEnabled === true && fragmentShaderBiomeEnabled === true,
                reason: fragmentShaderBiomeEnabled === true
                    ? (fragmentShaderEnabled === true ? '' : 'blocked by Fragment Shader')
                    : 'set Off'
            }
        ];
        const normalizedToggleRows = Array.isArray(fragmentToggleStates)
            ? fragmentToggleStates
                .filter((row) => row && typeof row === 'object')
                .map((row) => ({
                    label: String(row.label ?? '').trim() || '(toggle)',
                    requested: row.requested === true,
                    effective: row.effective === true,
                    reason: String(row.reason ?? '').trim()
                }))
            : [];
        const toggleRows = normalizedToggleRows.length > 0 ? normalizedToggleRows : fallbackToggleRows;
        const toggleSummary = toggleRows
            .map((row) => {
                const status = row.effective ? 'On' : 'Off';
                const reason = String(row.reason ?? '').trim();
                return reason ? `${row.label} ${status} (${reason})` : `${row.label} ${status}`;
            })
            .join(' · ');
        if (fragmentPathBreakdownNote) {
            const pathRows = Array.isArray(fragmentPathStates) ? fragmentPathStates : [];
            const activePaths = pathRows
                .filter((row) => row && typeof row === 'object' && row.active !== false)
                .map((row) => String(row.label ?? '').trim())
                .filter((label) => label.length > 0);
            const pathSummary = activePaths.length > 0
                ? `Paths: ${activePaths.join(' · ')}`
                : (fragmentShaderEnabled ? 'Paths: none' : 'Paths: shader off');
            fragmentPathBreakdownNote.textContent = `Fragment toggles: ${toggleSummary} | ${pathSummary}`;
        }
        {
            const used = Math.max(0, Math.round(Number(lodSamplerEstimateUsed) || 0));
            const max = Math.max(0, Math.round(Number(lodSamplerMaxTextures) || 0));
            const headroomValue = Number.isFinite(Number(gpuSamplerHeadroom))
                ? Math.max(0, Math.round(Number(gpuSamplerHeadroom)))
                : (max > 0 ? Math.max(0, max - used) : null);
            const shaderEnabledText = fragmentShaderEnabled === false ? ' · shader off' : '';
            if (gpuSamplerUsageNote) {
                gpuSamplerUsageNote.textContent = (max > 0)
                    ? `GPU samplers: ${used.toLocaleString()} / ${max.toLocaleString()}${shaderEnabledText}`
                    : `GPU samplers: ${used.toLocaleString()} / n/a${shaderEnabledText}`;
            }
            if (gpuMaxTexturesNote) {
                gpuMaxTexturesNote.textContent = max > 0
                    ? `GPU max fragment texture units: ${max.toLocaleString()}`
                    : 'GPU max fragment texture units: n/a';
            }
            if (gpuSamplerHeadroomNote) {
                gpuSamplerHeadroomNote.textContent = headroomValue === null
                    ? 'GPU sampler headroom: n/a'
                    : `GPU sampler headroom: ${headroomValue.toLocaleString()}`;
            }
            if (gpuWebglVersionNote) {
                const versionText = String(gpuWebglVersion ?? '').trim() || 'n/a';
                gpuWebglVersionNote.textContent = `GPU WebGL: ${versionText}`;
            }
            if (gpuFrameTimeNote) {
                const frameMs = Number(gpuFrameTimeMs);
                gpuFrameTimeNote.textContent = Number.isFinite(frameMs)
                    ? `GPU frame time: ${Math.max(0, frameMs).toFixed(2)}ms`
                    : 'GPU frame time: n/a';
            }
            renderGpuSamplerPathRows({
                rows: gpuSamplerPathRows,
                totalUsed: used,
                maxTextures: max
            });
        }

        const normalizeMeters = (value, fallback = 0) => {
            const n = Number(value);
            if (!Number.isFinite(n)) return fallback;
            return Math.max(0, n);
        };
        const appliedNearSeg = Math.max(1, Math.round(Number(appliedNearSegmentsPerTile) || Number(requestedNearSegmentsPerTile) || 1));
        const appliedFarSeg = Math.max(1, Math.round(Number(appliedFarSegmentsPerTile) || Number(requestedFarSegmentsPerTile) || 1));
        const appliedRadius = normalizeMeters(appliedNearRadiusMeters, 0);
        const appliedTransition = normalizeMeters(appliedTransitionWidthMeters, 0);
        const appliedSmoothing = clamp(appliedTransitionSmoothing, 0.0, 1.0, 0.72);
        const appliedBias = clamp(appliedTransitionBias, -0.85, 0.85, 0.0);
        const appliedDebugBands = Math.max(0, Math.min(6, Math.round(Number(appliedTransitionDebugBands) || 0)));
        const requestedRenderDistance = normalizeMeters(
            requestedRenderDistanceMeters,
            normalizeMeters(requestedNearRadiusMeters, 0) + normalizeMeters(requestedTransitionWidthMeters, 0)
        );
        const appliedRenderDistance = normalizeMeters(
            appliedRenderDistanceMeters,
            appliedRadius + appliedTransition
        );
        const requestedWave = clamp(requestedWaveStrength, 0.0, 1.0, 0.02);
        const appliedWave = clamp(appliedWaveStrength, 0.0, 1.0, requestedWave);
        const requestedWaveHeight = normalizeMeters(requestedWaveMaxHeightMeters, 2.0);
        const requestedWaveNeighborDelta = normalizeMeters(requestedWaveMaxNeighborDeltaMeters, 0.5);
        const ringCenterX = Number(appliedRingCenterX);
        const ringCenterZ = Number(appliedRingCenterZ);
        const appliedEnabled = appliedAdaptiveEnabled !== false;
        const requestedEnabled = requestedAdaptiveEnabled !== false;
        if (adaptiveNote) {
            adaptiveNote.textContent = !appliedEnabled
                ? 'Terrain LOD: disabled'
                : `Terrain LOD: enabled · preset ${String(lodDetailPreset ?? 'medium')} · levels 256/64/16/4/1`;
        }

        if (perfNote) {
            const totalQuadsText = Math.max(0, Math.round(Number(lodTotalQuads) || 0)).toLocaleString();
            perfNote.textContent = !appliedEnabled
                ? 'Terrain LOD diagnostics: n/a (enable Terrain LOD)'
                : `Terrain LOD diagnostics: ${oT.toLocaleString()} tris · ${oV.toLocaleString()} verts · ${totalQuadsText} quads`;
        }

        const geoMs = Number(lastGeometryApplyMs);
        const dispMs = Number(lastDisplacementUpdateMs);
        const geoText = Number.isFinite(geoMs) ? `${geoMs.toFixed(2)}ms` : 'n/a';
        const dispText = Number.isFinite(dispMs) ? `${dispMs.toFixed(2)}ms` : 'n/a';
        if (updateCostNote) updateCostNote.textContent = `Adaptive terrain update cost: geometry ${geoText} · displacement ${dispText}`;

        const requested = Math.max(1, Math.round(Number(requestedSegmentsPerTile) || 1));
        const applied = Math.max(1, Math.round(Number(appliedSegmentsPerTile) || requested));
        const requestedNear = Math.max(1, Math.round(Number(requestedNearSegmentsPerTile) || appliedNearSeg));
        const requestedFar = Math.max(1, Math.round(Number(requestedFarSegmentsPerTile) || appliedFarSeg));
        const requestedRadius = normalizeMeters(requestedNearRadiusMeters, appliedRadius);
        const requestedTransition = normalizeMeters(requestedTransitionWidthMeters, appliedTransition);
        const requestedSmoothing = clamp(requestedTransitionSmoothing, 0.0, 1.0, appliedSmoothing);
        const requestedBias = clamp(requestedTransitionBias, -0.85, 0.85, appliedBias);
        const requestedDebugBands = Math.max(
            0,
            Math.min(
                6,
                Math.round(Number.isFinite(Number(requestedTransitionDebugBands))
                    ? Number(requestedTransitionDebugBands)
                    : appliedDebugBands)
            )
        );
        const radiusDiff = Math.abs((requestedRadius || 0) - (appliedRadius || 0));
        const transitionDiff = Math.abs((requestedTransition || 0) - (appliedTransition || 0));
        const smoothingDiff = Math.abs(requestedSmoothing - appliedSmoothing);
        const biasDiff = Math.abs(requestedBias - appliedBias);
        const renderDistanceDiff = Math.abs(requestedRenderDistance - appliedRenderDistance);
        const waveDiff = Math.abs(requestedWave - appliedWave);
        const pendingAdaptive = requestedMode === 'adaptive_rings' && (
            appliedMode !== 'adaptive_rings'
            || requestedNear !== appliedNearSeg
            || requestedFar !== appliedFarSeg
            || radiusDiff > 0.05
            || transitionDiff > 0.05
            || smoothingDiff > 0.001
            || biasDiff > 0.001
            || requestedDebugBands !== appliedDebugBands
            || renderDistanceDiff > 0.05
            || waveDiff > 0.0005
        );
        const pendingUniform = requestedMode === 'uniform' && (appliedMode !== 'uniform' || requested !== applied);
        if (pendingNote) {
            if (!requestedEnabled || !appliedEnabled) {
                pendingNote.textContent = 'Adaptive terrain pending: disabled';
            } else if (pendingAdaptive) {
                pendingNote.textContent = `Adaptive terrain pending: adaptive near ${requestedNear}/tile · far ${requestedFar}/tile · render ${requestedRenderDistance.toFixed(1)}m · wave ${requestedWave.toFixed(3)} (h<=${requestedWaveHeight.toFixed(1)}m, step<=${requestedWaveNeighborDelta.toFixed(2)}m) · smooth ${requestedSmoothing.toFixed(2)} · bias ${requestedBias.toFixed(2)} · bands ${requestedDebugBands} staged.`;
            } else if (pendingUniform) {
                pendingNote.textContent = `Adaptive terrain pending: uniform ${requested}/tile staged (applied ${applied}/tile).`;
            } else if (appliedMode === 'adaptive_rings') {
                pendingNote.textContent = `Adaptive terrain pending: none · applied adaptive near ${appliedNearSeg}/tile · far ${appliedFarSeg}/tile · render ${appliedRenderDistance.toFixed(1)}m · wave ${appliedWave.toFixed(3)} · smooth ${appliedSmoothing.toFixed(2)} · bias ${appliedBias.toFixed(2)} · bands ${appliedDebugBands}`;
            } else {
                pendingNote.textContent = `Adaptive terrain pending: none · applied uniform ${applied}/tile`;
            }
        }

        if (lodStateNote) {
            const zoneRaw = String(activeLodZone ?? '').trim().toLowerCase();
            const zone = zoneRaw === 'near' || zoneRaw === 'transition' || zoneRaw === 'far' || zoneRaw === 'uniform'
                ? zoneRaw
                : 'n/a';
            const blendPct = Number.isFinite(Number(activeLodBlend))
                ? `${(clamp(activeLodBlend, 0.0, 1.0, 0.0) * 100).toFixed(0)}%`
                : 'n/a';
            const segText = Number.isFinite(Number(activeLodSegmentsPerTile))
                ? `${Math.max(0, Number(activeLodSegmentsPerTile)).toFixed(2)}/tile`
                : 'n/a';
            const distText = Number.isFinite(Number(activeLodDistanceMeters))
                ? `${Math.max(0, Number(activeLodDistanceMeters)).toFixed(1)}m`
                : 'n/a';
            lodStateNote.textContent = `Adaptive terrain state: ${zone} · blend ${blendPct} · seg ${segText} · ring distance ${distText}`;
        }

        if (lodHistoryNote) {
            const windowText = Number.isFinite(Number(historyWindowSec))
                ? `${Math.max(0, Number(historyWindowSec)).toFixed(1)}s`
                : 'n/a';
            const nearText = Number.isFinite(Number(historyNearPct))
                ? `${clamp(historyNearPct, 0, 100, 0).toFixed(0)}%`
                : 'n/a';
            const transitionText = Number.isFinite(Number(historyTransitionPct))
                ? `${clamp(historyTransitionPct, 0, 100, 0).toFixed(0)}%`
                : 'n/a';
            const farText = Number.isFinite(Number(historyFarPct))
                ? `${clamp(historyFarPct, 0, 100, 0).toFixed(0)}%`
                : 'n/a';
            const crossings = Math.max(0, Math.round(Number(historyBoundaryCrossings) || 0));
            const popCandidates = Math.max(0, Math.round(Number(historyPopCandidates) || 0));
            const maxDeltaText = Number.isFinite(Number(historyMaxSegmentsDeltaPerSec))
                ? `${Math.max(0, Number(historyMaxSegmentsDeltaPerSec)).toFixed(2)}/s`
                : 'n/a';
            lodHistoryNote.textContent = `Adaptive terrain history (${windowText}): near ${nearText} · transition ${transitionText} · far ${farText} · crossings ${crossings} · pop candidates ${popCandidates} · max Δseg ${maxDeltaText}`;
        }

        const bW = Math.max(0, Math.round(Number(baseWidthTiles) || 0));
        const bD = Math.max(0, Math.round(Number(baseDepthTiles) || 0));
        const bV = Math.max(0, Math.round(Number(baseVertices) || 0));
        const bT = Math.max(0, Math.round(Number(baseTriangles) || 0));
        if (baseGeometryNote) {
            baseGeometryNote.textContent = `Base terrain geometry: ${bW}x${bD} tiles · ${bV.toLocaleString()} verts · ${bT.toLocaleString()} tris`;
        }
        if (baseModeNote) {
            const appliedEnabledText = (appliedEnabled && overlayVisible) ? 'hidden while adaptive terrain mesh is visible' : 'visible';
            baseModeNote.textContent = `Base terrain mode: fixed fallback mesh (${appliedEnabledText})`;
        }
    }

    setOutputInfo({
        cameraX = null,
        cameraY = null,
        cameraZ = null,
        pointerDistance = null
    } = {}) {
        const cameraXzLine = this._controls?.outputCameraXzLine ?? null;
        const cameraHeightLine = this._controls?.outputCameraHeightLine ?? null;
        const pointerDistanceLine = this._controls?.outputPointerDistanceLine ?? null;

        if (cameraXzLine) {
            const cx = formatFixedWidthNumber(cameraX, 10, 2);
            const cz = formatFixedWidthNumber(cameraZ, 10, 2);
            cameraXzLine.textContent = `${cx}  ${cz}`;
        }

        if (cameraHeightLine) {
            const cy = formatFixedWidthNumber(cameraY, 10, 2);
            cameraHeightLine.textContent = `${cy} m`;
        }

        const d = Number(pointerDistance);
        if (!pointerDistanceLine) return;
        if (!Number.isFinite(d)) {
            pointerDistanceLine.textContent = 'Move mouse over terrain';
            return;
        }
            pointerDistanceLine.textContent = `${formatFixedWidthNumber(d, 9, 1)} m`;
        }

    getOutputPanelViewportMetrics() {
        const panel = this._outputPanel;
        if (!panel?.getBoundingClientRect || typeof window === 'undefined') return null;
        const rect = panel.getBoundingClientRect();
        const width = Math.max(0, Number(rect.width) || 0);
        const height = Math.max(0, Number(rect.height) || 0);
        const bottomInset = Math.max(0, Number(window.innerHeight) - Number(rect.bottom));
        return {
            left: Number(rect.left) || 0,
            top: Number(rect.top) || 0,
            width,
            height,
            bottomInset
        };
    }

    setTerrainPbrLegend(entries = []) {
        const root = this._controls?.terrainPbrLegend ?? null;
        if (!root) return;
        const list = Array.isArray(entries) ? entries : [];
        const key = list.map((e) => {
            const biome = String(e?.biomeId ?? '');
            const slot = String(e?.humiditySlotId ?? '');
            const mat = String(e?.materialId ?? '');
            const preview = String(e?.previewUrl ?? '');
            return `${biome}|${slot}|${mat}|${preview}`;
        }).join(';');
        if (key === this._terrainLegendKey) return;
        this._terrainLegendKey = key;

        root.textContent = '';
        for (const e of list) {
            const biomeId = String(e?.biomeId ?? '');
            const humiditySlotId = normalizeHumiditySlotId(e?.humiditySlotId);
            const biome = titleCaseBiome(biomeId);
            const hum = titleCaseHumSlot(humiditySlotId);
            const materialId = String(e?.materialId ?? '');
            const previewUrl = String(e?.previewUrl ?? '');

            const card = makeEl('div', 'options-note');
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.gap = '4px';
            card.style.border = '1px solid rgba(255,255,255,0.14)';
            card.style.borderRadius = '8px';
            card.style.padding = '6px';
            card.style.background = 'rgba(0,0,0,0.18)';
            card.style.minWidth = '0';

            const thumbBtn = document.createElement('button');
            thumbBtn.type = 'button';
            thumbBtn.className = 'options-btn';
            thumbBtn.style.padding = '0';
            thumbBtn.style.width = '100%';
            thumbBtn.style.height = '38px';
            thumbBtn.style.borderRadius = '6px';
            thumbBtn.style.border = '1px solid rgba(0,0,0,0.35)';
            thumbBtn.style.overflow = 'hidden';
            thumbBtn.style.background = 'transparent';
            thumbBtn.style.cursor = 'pointer';
            thumbBtn.title = `Change ${biome} ${hum} texture`;
            thumbBtn.setAttribute('data-terrain-legend-slot', `${biomeId}:${humiditySlotId}`);
            thumbBtn.addEventListener('click', () => {
                this._openTerrainLegendSlotPicker({
                    biomeId,
                    humiditySlotId,
                    selectedId: materialId
                });
            });
            if (previewUrl) {
                const thumbImg = document.createElement('img');
                thumbImg.src = previewUrl;
                thumbImg.alt = `${biome} ${hum}`;
                thumbImg.style.width = '100%';
                thumbImg.style.height = '100%';
                thumbImg.style.objectFit = 'cover';
                thumbBtn.appendChild(thumbImg);
            } else {
                thumbBtn.style.background = 'linear-gradient(135deg, #4e4e4e, #808080)';
            }

            const title = makeEl('div', null, `${biome} · ${hum}`);
            title.style.fontWeight = '600';
            title.style.fontSize = '11px';
            const detail = makeEl('div', null, materialId);
            detail.style.fontSize = '10px';
            detail.style.opacity = '0.82';
            detail.style.wordBreak = 'break-word';

            card.appendChild(thumbBtn);
            card.appendChild(title);
            card.appendChild(detail);
            root.appendChild(card);
        }
    }

    _openTerrainLegendSlotPicker({ biomeId, humiditySlotId, selectedId } = {}) {
        const biome = String(biomeId ?? '');
        if (!TERRAIN_BIOME_IDS.includes(biome)) return;
        const slot = normalizeHumiditySlotId(humiditySlotId);

        const sections = getPbrMaterialClassSectionsForGround().map((section) => ({
            label: section.label,
            options: (section.options ?? []).map((opt) => ({
                id: String(opt?.id ?? ''),
                label: String(opt?.label ?? opt?.id ?? ''),
                kind: 'texture',
                previewUrl: opt?.previewUrl ?? null
            })).filter((opt) => !!opt.id)
        })).filter((section) => Array.isArray(section.options) && section.options.length > 0);
        if (!sections.length) return;

        this._pickerPopup?.open?.({
            title: `${titleCaseBiome(biome)} · ${titleCaseHumSlot(slot)} texture`,
            sections,
            selectedId: String(selectedId ?? ''),
            onSelect: (opt) => {
                const engine = this._state?.terrain?.engine ?? null;
                if (!engine || typeof engine !== 'object') return;
                const bindings = (engine.materialBindings && typeof engine.materialBindings === 'object')
                    ? engine.materialBindings
                    : (engine.materialBindings = {});
                const biomeBindings = (bindings.biomes && typeof bindings.biomes === 'object')
                    ? bindings.biomes
                    : (bindings.biomes = {});
                const row = (biomeBindings[biome] && typeof biomeBindings[biome] === 'object')
                    ? biomeBindings[biome]
                    : (biomeBindings[biome] = {});
                row[slot] = String(opt?.id ?? '');
                this._emit();
            }
        });
    }

    _dispatchUiAction(action) {
        if (!isTerrainDebuggerUiAction(action)) return;

        this._dispatchAction?.(action);
        if (this._dispatchAction) return;

        const payload = action.payload && typeof action.payload === 'object' ? action.payload : {};
        switch (action.type) {
        case TerrainDebuggerUiActionType.RESET_CAMERA:
            this._onResetCamera?.();
            return;
        case TerrainDebuggerUiActionType.CAMERA_PRESET:
            this._onCameraPreset?.(String(payload.presetId ?? ''));
            return;
        case TerrainDebuggerUiActionType.FOCUS_BIOME_TRANSITION:
            this._onFocusBiomeTransition?.();
            return;
        case TerrainDebuggerUiActionType.FOCUS_BIOME_TILING:
            this._onFocusBiomeTiling?.(String(payload.mode ?? ''));
            return;
        case TerrainDebuggerUiActionType.TOGGLE_FLYOVER:
            this._onToggleFlyover?.();
            return;
        case TerrainDebuggerUiActionType.FLYOVER_LOOP_CHANGED:
            this._onFlyoverLoopChange?.(payload.enabled === true);
            return;
        case TerrainDebuggerUiActionType.INSPECT_GRASS:
            this._onInspectGrass?.();
            return;
        case TerrainDebuggerUiActionType.INSPECT_GRASS_LOD:
            this._onInspectGrassLod?.(String(payload.tier ?? ''));
            return;
        case TerrainDebuggerUiActionType.STATE_CHANGED:
        default:
            return;
        }
    }

    _emit() {
        if (this._isSetting) return;
        const state = this.getState();
        this._dispatchUiAction(createTerrainDebuggerStateChangedAction(state));
        this._onChange?.(state);
    }

    _buildSection(tabKey, titleText) {
        const sectionId = `${String(tabKey)}:${String(titleText)}`;
        let collapsed = this._sectionCollapsed.get(sectionId) === true;

        const applyCollapsed = (section, collapseBtn) => {
            section.classList.toggle('is-collapsed', collapsed);
            collapseBtn.textContent = collapsed ? '▸' : '▾';
            collapseBtn.title = collapsed ? 'Expand' : 'Collapse';
            collapseBtn.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
        };

        const preserveScroll = (fn) => {
            const body = this.body;
            const scrollTop = Number(body?.scrollTop) || 0;
            const scrollLeft = Number(body?.scrollLeft) || 0;
            fn?.();
            if (!body) return;
            body.scrollTop = scrollTop;
            body.scrollLeft = scrollLeft;
        };

        const section = makeEl('div', 'options-section');
        const header = makeEl('div', 'options-section-header');
        header.setAttribute('role', 'button');
        header.tabIndex = 0;

        const title = makeEl('div', 'options-section-title', titleText);
        const collapseBtn = makeEl('button', 'options-btn options-btn-small options-icon-btn', collapsed ? '▸' : '▾');
        collapseBtn.type = 'button';
        collapseBtn.addEventListener('click', () => {
            preserveScroll(() => {
                collapsed = !collapsed;
                this._sectionCollapsed.set(sectionId, collapsed);
                applyCollapsed(section, collapseBtn);
            });
        });

        header.appendChild(title);
        header.appendChild(collapseBtn);
        header.addEventListener('click', (e) => {
            const btn = e?.target?.closest?.('button');
            if (btn && header.contains(btn)) return;
            preserveScroll(() => {
                collapsed = !collapsed;
                this._sectionCollapsed.set(sectionId, collapsed);
                applyCollapsed(section, collapseBtn);
            });
        });
        header.addEventListener('keydown', (e) => {
            const key = e?.key ?? '';
            if (key !== 'Enter' && key !== ' ') return;
            e.preventDefault?.();
            preserveScroll(() => {
                collapsed = !collapsed;
                this._sectionCollapsed.set(sectionId, collapsed);
                applyCollapsed(section, collapseBtn);
            });
        });

        section.appendChild(header);
        this._tabBodies[tabKey].appendChild(section);
        applyCollapsed(section, collapseBtn);
        return section;
    }

    _buildEnvironmentTab() {
        return this._tabBuilders.buildEnvironmentTab.call(this);
    }

    _buildVisualizationTab() {
        return this._tabBuilders.buildVisualizationTab.call(this);
    }

    _buildTerrainTab() {
        return this._tabBuilders.buildTerrainTab.call(this);
    }

    _buildBiomeTransitionTab() {
        return this._tabBuilders.buildBiomeTransitionTab.call(this);
    }

    _buildBiomeTilingTab() {
        return this._tabBuilders.buildBiomeTilingTab.call(this);
    }

    _buildVariationTab() {
        return this._tabBuilders.buildVariationTab.call(this);
    }

    _getLayers() {
        const t = this._state?.terrain && typeof this._state.terrain === 'object' ? this._state.terrain : null;
        const layers = Array.isArray(t?.layers) ? t.layers : [];
        return layers;
    }


    _addLayer(kind) {
        const k = kind === 'pattern' ? 'pattern' : 'anti_tiling';
        const layers = this._getLayers().slice(0);
        const id = `layer_${this._nextLayerId++}`;
        if (k === 'pattern') {
            layers.push({
                id,
                kind: 'pattern',
                enabled: true,
                patternType: pickNextPatternType(layers),
                intensity: 0.35,
                scale: 1.0,
                hueDegrees: 0.0,
                value: 0.08,
                saturation: 0.05,
                roughness: 0.12,
                normal: 0.12,
                coverage: 0.65,
                collapsed: false
            });
        } else {
            layers.push({
                id,
                kind: 'anti_tiling',
                enabled: true,
                mode: 'fast',
                strength: 0.55,
                cellSize: 2.0,
                blendWidth: 0.2,
                offsetU: 0.22,
                offsetV: 0.22,
                rotationDegrees: 18.0,
                collapsed: false
            });
        }

        this._state.terrain.layers = layers;
        this._renderVariationLayers();
        this._emit();
    }


    _removeLayer(layerId) {
        const id = String(layerId ?? '');
        if (!id) return;
        const layers = this._getLayers();
        const next = layers.filter((l) => String(l?.id ?? '') !== id);
        this._state.terrain.layers = next;
        this._renderVariationLayers();
        this._emit();
    }


    _renderVariationLayers() {
        const host = this._layersHost;
        if (!host) return;
        const body = this.body;
        const scrollTop = Number(body?.scrollTop) || 0;
        const scrollLeft = Number(body?.scrollLeft) || 0;
        const active = document.activeElement;
        const activeId = (active && active instanceof HTMLElement && active.id && this.root?.contains(active)) ? String(active.id) : '';

        host.replaceChildren();

        const layers = this._getLayers();
        if (!layers.length) {
            host.appendChild(makeEl('div', null, 'No variation layers.'));
            return;
        }

        const makeHeader = ({ layer, index, title, collapsed, summaryText }) => {
            const header = makeEl('div', 'options-layer-header');
            const top = makeEl('div', 'options-layer-header-top');
            top.setAttribute('role', 'button');
            top.tabIndex = 0;

            const titleEl = makeEl('div', 'options-section-title', `${index + 1}. ${title}`);
            const actions = makeEl('div', 'options-layer-header-actions');

            const collapseBtn = makeEl('button', 'options-btn options-btn-small options-icon-btn', collapsed ? '▸' : '▾');
            collapseBtn.type = 'button';
            collapseBtn.id = `layer-${String(layer?.id ?? index)}-collapse`;
            collapseBtn.title = collapsed ? 'Expand' : 'Collapse';
            collapseBtn.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
            collapseBtn.addEventListener('click', () => {
                layer.collapsed = !layer.collapsed;
                this._renderVariationLayers();
                this._emit();
            });

            const removeBtn = makeEl('button', 'options-btn options-btn-small', 'Remove');
            removeBtn.type = 'button';
            removeBtn.id = `layer-${String(layer?.id ?? index)}-remove`;
            removeBtn.addEventListener('click', () => this._removeLayer(layer?.id));

            actions.appendChild(collapseBtn);
            actions.appendChild(removeBtn);
            top.appendChild(titleEl);
            top.appendChild(actions);
            top.addEventListener('click', (e) => {
                const btn = e?.target?.closest?.('button');
                if (btn && top.contains(btn)) return;
                layer.collapsed = !layer.collapsed;
                this._renderVariationLayers();
                this._emit();
            });
            top.addEventListener('keydown', (e) => {
                const key = e?.key ?? '';
                if (key !== 'Enter' && key !== ' ') return;
                e.preventDefault?.();
                layer.collapsed = !layer.collapsed;
                this._renderVariationLayers();
                this._emit();
            });
            header.appendChild(top);

            const summary = makeEl('div', 'options-layer-summary');
            summary.textContent = summaryText;
            summary.style.display = collapsed ? '' : 'none';
            header.appendChild(summary);

            return { header };
        };

        layers.forEach((layer, index) => {
            const kind = layer?.kind === 'pattern' ? 'pattern' : 'anti_tiling';
            const title = kind === 'pattern' ? 'Pattern' : 'Anti-Tiling';
            const section = makeEl('div', 'options-section');
            const collapsed = !!layer?.collapsed;
            const summaryText = kind === 'pattern'
                ? getPatternTypeLabel(layer?.patternType)
                : `Mode: ${getAntiTilingLabel(layer?.mode)}`;
            const header = makeHeader({ layer, index, title, collapsed, summaryText });
            section.appendChild(header.header);

            const enabledRow = makeToggleRow({
                label: 'Enabled',
                value: layer?.enabled !== false,
                onChange: (v) => {
                    layer.enabled = !!v;
                    this._renderVariationLayers();
                    this._emit();
                }
            });
            section.appendChild(enabledRow.row);

            const disabled = layer?.enabled === false;
            enabledRow.toggle.id = `layer-${String(layer?.id ?? index)}-enabled`;

            if (collapsed) {
                enabledRow.toggle.disabled = false;
                host.appendChild(section);
                return;
            }

            if (kind === 'anti_tiling') {
                const modeRow = makeChoiceRow({
                    label: 'Mode',
                    value: String(layer?.mode ?? 'fast'),
                    options: [
                        { id: 'fast', label: 'Fast' },
                        { id: 'quality', label: 'Quality' }
                    ],
                    onChange: (id) => {
                        layer.mode = String(id ?? 'fast');
                        this._emit();
                    }
                });
                section.appendChild(modeRow.row);

                const strengthRow = makeNumberSliderRow({
                    label: 'Strength',
                    value: Number(layer?.strength) || 0,
                    min: 0.0,
                    max: 4.0,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.strength = v;
                        this._emit();
                    }
                });
                section.appendChild(strengthRow.row);

                const cellRow = makeNumberSliderRow({
                    label: 'Cell Size',
                    value: Number(layer?.cellSize) || 0,
                    min: 0.25,
                    max: 12.0,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.cellSize = v;
                        this._emit();
                    }
                });
                section.appendChild(cellRow.row);

                const blendRow = makeNumberSliderRow({
                    label: 'Blend Width',
                    value: Number(layer?.blendWidth) || 0,
                    min: 0.0,
                    max: 0.49,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.blendWidth = v;
                        this._emit();
                    }
                });
                section.appendChild(blendRow.row);

                const offsetURow = makeNumberSliderRow({
                    label: 'Offset U',
                    value: Number(layer?.offsetU) || 0,
                    min: 0.0,
                    max: 2.0,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.offsetU = v;
                        this._emit();
                    }
                });
                section.appendChild(offsetURow.row);

                const offsetVRow = makeNumberSliderRow({
                    label: 'Offset V',
                    value: Number(layer?.offsetV) || 0,
                    min: 0.0,
                    max: 2.0,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.offsetV = v;
                        this._emit();
                    }
                });
                section.appendChild(offsetVRow.row);

                const rotRow = makeNumberSliderRow({
                    label: 'Rotation (deg)',
                    value: Number(layer?.rotationDegrees) || 0,
                    min: 0.0,
                    max: 90.0,
                    step: 0.1,
                    digits: 1,
                    onChange: (v) => {
                        layer.rotationDegrees = v;
                        this._emit();
                    }
                });
                section.appendChild(rotRow.row);

                modeRow.setDisabled(disabled);
                strengthRow.range.disabled = disabled;
                strengthRow.number.disabled = disabled;
                cellRow.range.disabled = disabled;
                cellRow.number.disabled = disabled;
                blendRow.range.disabled = disabled;
                blendRow.number.disabled = disabled;
                offsetURow.range.disabled = disabled;
                offsetURow.number.disabled = disabled;
                offsetVRow.range.disabled = disabled;
                offsetVRow.number.disabled = disabled;
                rotRow.range.disabled = disabled;
                rotRow.number.disabled = disabled;
            } else {
                const typeRow = makeSelectRow({
                    label: 'Type',
                    value: String(layer?.patternType ?? 'linear'),
                    options: [
                        { id: 'contrast', label: 'Noise (Contrast)' },
                        { id: 'linear', label: 'Noise (Linear)' },
                        { id: 'soft', label: 'Noise (Soft)' },
                        { id: 'threshold', label: 'Noise (Threshold)' }
                    ],
                    onChange: (id) => {
                        layer.patternType = String(id ?? 'linear');
                        this._renderVariationLayers();
                        this._emit();
                    }
                });
                section.appendChild(typeRow.row);

                const intensityRow = makeNumberSliderRow({
                    label: 'Intensity',
                    value: Number(layer?.intensity) || 0,
                    min: 0.0,
                    max: 2.0,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.intensity = v;
                        this._emit();
                    }
                });
                section.appendChild(intensityRow.row);

                const scaleRow = makeNumberSliderRow({
                    label: 'Scale',
                    value: Number(layer?.scale) || 1,
                    min: 0.02,
                    max: 24.0,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.scale = v;
                        this._emit();
                    }
                });
                section.appendChild(scaleRow.row);

                const hueRow = makeNumberSliderRow({
                    label: 'Hue (deg)',
                    value: Number(layer?.hueDegrees) || 0,
                    min: -60.0,
                    max: 60.0,
                    step: 0.1,
                    digits: 1,
                    onChange: (v) => {
                        layer.hueDegrees = v;
                        this._emit();
                    }
                });
                section.appendChild(hueRow.row);

                const valueRow = makeNumberSliderRow({
                    label: 'Brightness',
                    value: Number(layer?.value) || 0,
                    min: -0.5,
                    max: 0.5,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.value = v;
                        this._emit();
                    }
                });
                section.appendChild(valueRow.row);

                const satRow = makeNumberSliderRow({
                    label: 'Saturation',
                    value: Number(layer?.saturation) || 0,
                    min: -1.0,
                    max: 1.0,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.saturation = v;
                        this._emit();
                    }
                });
                section.appendChild(satRow.row);

                const roughRow = makeNumberSliderRow({
                    label: 'Roughness',
                    value: Number(layer?.roughness) || 0,
                    min: -0.5,
                    max: 0.5,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.roughness = v;
                        this._emit();
                    }
                });
                section.appendChild(roughRow.row);

                const normalRow = makeNumberSliderRow({
                    label: 'Normal',
                    value: Number(layer?.normal) || 0,
                    min: -0.5,
                    max: 0.5,
                    step: 0.01,
                    digits: 2,
                    onChange: (v) => {
                        layer.normal = v;
                        this._emit();
                    }
                });
                section.appendChild(normalRow.row);

                const wantsCoverage = String(layer?.patternType ?? '') === 'threshold';
                if (wantsCoverage) {
                    const covRow = makeNumberSliderRow({
                        label: 'Coverage',
                        value: Number(layer?.coverage) || 0,
                        min: 0.0,
                        max: 1.0,
                        step: 0.01,
                        digits: 2,
                        onChange: (v) => {
                            layer.coverage = v;
                            this._emit();
                        }
                    });
                    section.appendChild(covRow.row);
                    covRow.range.disabled = disabled;
                    covRow.number.disabled = disabled;
                }

                typeRow.select.disabled = disabled;
                intensityRow.range.disabled = disabled;
                intensityRow.number.disabled = disabled;
                scaleRow.range.disabled = disabled;
                scaleRow.number.disabled = disabled;
                hueRow.range.disabled = disabled;
                hueRow.number.disabled = disabled;
                valueRow.range.disabled = disabled;
                valueRow.number.disabled = disabled;
                satRow.range.disabled = disabled;
                satRow.number.disabled = disabled;
                roughRow.range.disabled = disabled;
                roughRow.number.disabled = disabled;
                normalRow.range.disabled = disabled;
                normalRow.number.disabled = disabled;
            }

            host.appendChild(section);
        });

        if (body) {
            body.scrollTop = scrollTop;
            body.scrollLeft = scrollLeft;
        }
        if (activeId) {
            const esc = globalThis.CSS?.escape ? globalThis.CSS.escape(activeId) : activeId;
            const el = this.root?.querySelector?.(`#${esc}`) ?? null;
            if (el && el instanceof HTMLElement && typeof el.focus === 'function') {
                try {
                    el.focus({ preventScroll: true });
                } catch {
                    el.focus();
                    if (body) {
                        body.scrollTop = scrollTop;
                        body.scrollLeft = scrollLeft;
                    }
                }
            }
        }
    }


    setCameraStatus({
        activePresetId = null,
        flyoverActive = false,
        flyoverTimeSec = 0,
        flyoverDurationSec = 15
    } = {}) {
        const note = this._controls?.cameraStatusNote ?? null;
        if (!note) return;

        const preset = typeof activePresetId === 'string' && activePresetId ? activePresetId : '';
        const presetLabel = this._getCameraPresetLabel(preset) || preset;
        const lines = [];
        if (presetLabel) lines.push(`Preset: ${presetLabel}`);

        const presetControl = this._controls?.cameraPreset ?? null;
        if (typeof presetControl?.setValue === 'function') presetControl.setValue(preset);
        if (presetControl?.select) presetControl.select.value = preset;

        if (flyoverActive) {
            const t = Math.max(0, Number(flyoverTimeSec) || 0);
            const d = Math.max(0.001, Number(flyoverDurationSec) || 15);
            lines.push(`Flyover: ${t.toFixed(1)}s / ${d.toFixed(1)}s`);
        }

        note.textContent = lines.join(' · ');
    }

    setBiomeTilingFocusButtons({ activePresetId = '' } = {}) {
        const buttons = this._controls?.biomeTilingFocusButtons ?? null;
        if (!buttons || typeof buttons !== 'object') return;
        const activeId = String(activePresetId ?? '').trim().toLowerCase();
        for (const [id, btn] of Object.entries(buttons)) {
            if (!btn?.classList) continue;
            btn.classList.toggle('is-active', id === activeId);
        }
    }

    setGrassStats({
        enabled = false,
        patches = 0,
        drawCalls = 0,
        totalInstances = 0,
        totalTriangles = 0,
        instancesByTier = null
    } = {}) {
        const controls = this._controls ?? {};
        const inst = controls.grassStatsInstances ?? null;
        const tris = controls.grassStatsTriangles ?? null;
        const calls = controls.grassStatsDrawCalls ?? null;
        const byTier = instancesByTier && typeof instancesByTier === 'object' ? instancesByTier : {};

        if (inst) {
            inst.textContent = enabled
                ? `Instances: ${Math.round(Number(totalInstances) || 0).toLocaleString()} (M ${Math.round(Number(byTier.master) || 0).toLocaleString()} · N ${Math.round(Number(byTier.near) || 0).toLocaleString()} · Mid ${Math.round(Number(byTier.mid) || 0).toLocaleString()} · Far ${Math.round(Number(byTier.far) || 0).toLocaleString()})`
                : 'Instances: (disabled)';
        }
        if (tris) {
            tris.textContent = enabled
                ? `Triangles: ${Math.round(Number(totalTriangles) || 0).toLocaleString()}`
                : 'Triangles: (disabled)';
        }
        if (calls) {
            calls.textContent = enabled
                ? `Draw calls: ${Math.round(Number(drawCalls) || 0).toLocaleString()} (patches: ${Math.round(Number(patches) || 0).toLocaleString()})`
                : 'Draw calls: (disabled)';
        }
    }

    setGrassLodDebugInfo({ viewAngleDeg = null, angleScale = null, masterActiveByAngle = false } = {}) {
        const note = this._controls?.grassLodDebugInfo ?? null;
        if (!note) return;

        const angle = Number(viewAngleDeg);
        const scale = Number(angleScale);
        if (!(Number.isFinite(angle) && Number.isFinite(scale))) {
            note.textContent = 'View angle: (n/a) · AngleScale: (n/a)';
            return;
        }

        const parts = [
            `View angle: ${angle.toFixed(1)}°`,
            `AngleScale: ${scale.toFixed(2)}`,
            `Master: ${masterActiveByAngle ? 'active' : 'inactive'}`
        ];
        note.textContent = parts.join(' · ');
    }

    setFlyoverActive(active) {
        const isActive = !!active;
        const flyover = this._controls?.flyoverToggle ?? null;
        const camPreset = this._controls?.cameraPreset ?? null;
        const reset = this._controls?.resetCamera ?? null;

        if (flyover?.btn) flyover.btn.textContent = isActive ? 'Stop' : 'Start';
        if (typeof camPreset?.setDisabled === 'function') camPreset.setDisabled(isActive);
        if (camPreset?.select) camPreset.select.disabled = isActive;
        if (reset?.btn) reset.btn.disabled = isActive;
    }

    _getCameraPresetLabel(id) {
        const preset = String(id ?? '');
        if (preset === 'custom') return 'Manual';
        if (preset === 'high_far') return 'High (Far)';
        if (preset === 'behind_gameplay') return 'Behind Bus (Gameplay)';
        if (preset === 'behind_low_horizon') return 'Behind Bus (Low / Horizon)';
        if (preset === 'high') return 'High';
        if (preset === 'low') return 'Low';
        return '';
    }

    _buildGrassTab() {
        return this._tabBuilders.buildGrassTab.call(this);
    }

}
