// src/graphics/gui/building_fabrication2/BuildingFabrication2View.js
// Orchestrates UI and 3D rendering for Building Fabrication 2.
import * as THREE from 'three';

import { getBuildingConfigById, getBuildingConfigs } from '../../content3d/catalogs/BuildingConfigCatalog.js';
import { createLayerId } from '../../assets3d/generators/building_fabrication/BuildingFabricationTypes.js';
import {
    buildingConfigIdToFileBaseName,
    createCityBuildingConfigFromFabrication,
    sanitizeBuildingConfigId,
    sanitizeBuildingConfigName,
    serializeCityBuildingConfigToEsModule
} from '../../../app/city/buildings/BuildingConfigExport.js';

import { BuildingFabrication2Scene } from './BuildingFabrication2Scene.js';
import { BuildingFabrication2ThumbnailRenderer } from './BuildingFabrication2ThumbnailRenderer.js';
import { BuildingFabrication2UI } from './BuildingFabrication2UI.js';
import { ensureGlobalPerfBar } from '../perf_bar/PerfBar.js';

const UP = new THREE.Vector3(0, 1, 0);

function deepClone(value) {
    if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
        return out;
    }
    return value;
}

function isTextEditingElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    if (target?.isContentEditable) return true;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

const FACE_IDS = Object.freeze(['A', 'B', 'C', 'D']);
const DEFAULT_FACE_LINKS = Object.freeze({ C: 'A', D: 'B' });
const FLOOR_COUNT_MIN = 1;
const FLOOR_COUNT_MAX = 30;
const FLOOR_HEIGHT_MIN = 1.0;
const FLOOR_HEIGHT_MAX = 12.0;
const BAY_MIN_WIDTH_M = 0.1;
const BAY_DEFAULT_WIDTH_M = 1.0;
const BAY_DEPTH_MIN_M = -2.0;
const BAY_DEPTH_MAX_M = 2.0;
const BAY_GROUP_MIN_SIZE = 2;

function normalizeMaterialSpec(value) {
    const kind = value?.kind;
    const id = typeof value?.id === 'string' ? value.id : '';
    if ((kind === 'texture' || kind === 'color') && id) return { kind, id };
    return null;
}

function normalizeBayTextureFlow(value) {
    const typed = typeof value === 'string' ? value : '';
    if (typed === 'restart' || typed === 'repeats' || typed === 'overflow_left' || typed === 'overflow_right') return typed;
    return 'restart';
}

function normalizeBayExpandPreference(value) {
    const typed = typeof value === 'string' ? value : '';
    if (typed === 'no_repeat' || typed === 'prefer_repeat' || typed === 'prefer_expand') return typed;
    return 'prefer_expand';
}

function resolveBayLinkFromSpec(bay) {
    const spec = bay && typeof bay === 'object' ? bay : null;
    const link = typeof spec?.linkFromBayId === 'string' ? spec.linkFromBayId : '';
    if (link) return link;
    const legacy = typeof spec?.materialLinkFromBayId === 'string' ? spec.materialLinkFromBayId : '';
    return legacy || null;
}

function normalizeFacadeBayGroupRepeat(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return { minRepeats: 1, maxRepeats: 'auto' };
    const minRepeats = clampInt(src.minRepeats ?? 1, 1, 9999);
    const maxRaw = src.maxRepeats;
    if (maxRaw === 'auto') return { minRepeats, maxRepeats: 'auto' };
    if (maxRaw === null || maxRaw === undefined) return { minRepeats, maxRepeats: 'auto' };
    const maxRepeats = clampInt(maxRaw, minRepeats, 9999);
    return { minRepeats, maxRepeats };
}

function applyBaseWallMaterialFallbackToFloorLayers(config) {
    const cfg = config && typeof config === 'object' ? config : null;
    if (!cfg) return;

    const base = normalizeMaterialSpec(cfg?.baseWallMaterial ?? null);
    if (!base) return;

    const layers = Array.isArray(cfg.layers) ? cfg.layers : [];
    for (const layer of layers) {
        if (layer?.type !== 'floor') continue;
        const hasMaterial = !!normalizeMaterialSpec(layer?.material ?? null);
        if (!hasMaterial) layer.material = base;
    }

    delete cfg.baseWallMaterial;
}

function isFaceId(faceId) {
    return faceId === 'A' || faceId === 'B' || faceId === 'C' || faceId === 'D';
}

function normalizeFaceLinking(value) {
    const src = value && typeof value === 'object' ? value : null;
    const links = src?.links && typeof src.links === 'object' ? src.links : null;
    if (!links) return null;

    const out = {};
    for (const [slave, master] of Object.entries(links)) {
        if (!isFaceId(slave) || !isFaceId(master) || slave === master) continue;
        out[slave] = master;
    }

    return Object.keys(out).length ? { links: out } : null;
}

function createEmptyFaceLockMap() {
    const out = new Map();
    for (const faceId of FACE_IDS) out.set(faceId, null);
    return out;
}

function createFaceLockMapFromConfigLayer(layer) {
    const out = createEmptyFaceLockMap();
    const linking = normalizeFaceLinking(layer?.faceLinking ?? null);
    const links = linking?.links ?? null;
    if (!links) return out;
    for (const [slave, master] of Object.entries(links)) {
        if (!isFaceId(slave) || !isFaceId(master)) continue;
        out.set(slave, master);
    }
    return out;
}

function resolveDefaultLayerWallMaterial(layer) {
    const raw = layer?.material && typeof layer.material === 'object' ? layer.material : null;
    const kind = raw?.kind;
    const id = typeof raw?.id === 'string' ? raw.id : '';
    if ((kind === 'texture' || kind === 'color') && id) return { kind, id };
    const styleId = typeof layer?.style === 'string' && layer.style ? layer.style : 'default';
    return { kind: 'texture', id: styleId };
}

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function getFloorLayers(layers) {
    if (!Array.isArray(layers)) return [];
    return layers.filter((layer) => layer?.type === 'floor');
}

function resolveLayerFaceFacades(config, layerId) {
    const cfg = config && typeof config === 'object' ? config : null;
    if (!cfg) return null;
    const facadesByLayerId = cfg.facades && typeof cfg.facades === 'object' ? cfg.facades : null;
    if (!facadesByLayerId) return null;
    const layerFacades = facadesByLayerId[layerId];
    return layerFacades && typeof layerFacades === 'object' ? layerFacades : null;
}

function ensureLayerFaceFacades(config, layerId) {
    const cfg = config && typeof config === 'object' ? config : null;
    if (!cfg) return null;
    cfg.facades ??= {};
    if (!cfg.facades || typeof cfg.facades !== 'object') return null;
    cfg.facades[layerId] ??= {};
    const layerFacades = cfg.facades[layerId];
    return layerFacades && typeof layerFacades === 'object' ? layerFacades : null;
}

function cleanupEmptyLayerFacades(config, layerId) {
    const cfg = config && typeof config === 'object' ? config : null;
    if (!cfg) return;
    const facadesByLayerId = cfg.facades && typeof cfg.facades === 'object' ? cfg.facades : null;
    if (!facadesByLayerId) return;
    const layerFacades = facadesByLayerId[layerId];
    if (!layerFacades || typeof layerFacades !== 'object') return;
    if (Object.keys(layerFacades).length) return;
    delete facadesByLayerId[layerId];
    if (!Object.keys(facadesByLayerId).length) delete cfg.facades;
}

export class BuildingFabrication2View {
    constructor(engine) {
        this.engine = engine;
        this.scene = new BuildingFabrication2Scene(engine);
        this.ui = new BuildingFabrication2UI();
        this._thumbRenderer = new BuildingFabrication2ThumbnailRenderer(engine, { size: 512 });
        this._perfBar = ensureGlobalPerfBar();

        this._catalogEntries = [];
        this._thumbCache = new Map();
        this._thumbJobId = 0;
        this._currentConfig = null;
        this._floorLayerFaceStateById = new Map();
        this._activeFloorLayerId = null;
        this._materialConfigLayerId = null;
        this._materialConfigFaceId = null;
        this._materialConfigBayId = null;
        this._pendingRebuild = false;
        this._pendingRebuildPreserveCamera = true;

        this._hideFaceMarkEnabled = false;
        this._showDummyEnabled = false;
        this._rulerEnabled = false;
        this._rulerPointA = null;
        this._rulerPointB = null;
        this._rulerFixed = false;
        this._rulerPointer = new THREE.Vector2();
        this._rulerMidpoint = new THREE.Vector3();
        this._rulerProject = new THREE.Vector3();
        this._rulerPointerDown = null;
        this._rulerPointerMoved = false;

        this._pointerInViewport = false;
        this._onCanvasPointerEnter = () => {
            this._pointerInViewport = true;
            this._syncFaceHighlightSuppression();
        };
        this._onCanvasPointerLeave = () => {
            this._pointerInViewport = false;
            this._syncFaceHighlightSuppression();
            this._handleRulerPointerLeave();
        };
        this._onCanvasPointerMove = (e) => this._handleRulerPointerMove(e);
        this._onCanvasPointerDown = (e) => this._handleRulerPointerDown(e);
        this._onCanvasPointerUp = (e) => this._handleRulerPointerUp(e);
        this._onCanvasPointerCancel = (e) => this._handleRulerPointerUp(e);

        this._keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            ShiftLeft: false,
            ShiftRight: false
        };
        this._moveForward = new THREE.Vector3();
        this._moveRight = new THREE.Vector3();
        this._moveDir = new THREE.Vector3();

        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onKeyUp = (e) => this._handleKeyUp(e);
    }

    enter() {
        this.scene.enter();

        // View toggles are non-persistent; reset to defaults whenever BF2 is entered.
        this._pointerInViewport = false;
        this._setHideFaceMarkEnabled(false);
        this._setShowDummyEnabled(false);
        this._setRulerEnabled(false);
        this.ui.setViewToggles({ hideFaceMarkEnabled: false, showDummyEnabled: false });
        this.ui.setRulerEnabled(false);
        this.ui.setRulerLabel({ visible: false });

        this.ui.mount();
        this.scene.setUiRoot(this.ui.root);

        this._catalogEntries = this._buildCatalogEntries();
        this.ui.setCatalogEntries(this._catalogEntries);

        this._syncUiState();

        this.ui.onCreateBuilding = () => this._createBuilding();
        this.ui.onRequestLoad = () => this._openLoadBrowser();
        this.ui.onRequestExport = () => this._exportCurrentConfig();
        this.ui.onReset = () => this._reset();
        this.ui.onSetFloorLayerFloors = (layerId, floors) => this._setFloorLayerFloors(layerId, floors);
        this.ui.onSetFloorLayerFloorHeight = (layerId, height) => this._setFloorLayerFloorHeight(layerId, height);
        this.ui.onSetFloorLayerMaterial = (layerId, faceId, material) => this._setFloorLayerMaterial(layerId, faceId, material);
        this.ui.onRequestMaterialConfig = (layerId, faceId) => this._openMaterialConfigForLayer(layerId, faceId);
        this.ui.onViewModeChange = (mode) => this._applyViewMode(mode);
        this.ui.onHideFaceMarkChange = (enabled) => this._setHideFaceMarkEnabled(enabled);
        this.ui.onShowDummyChange = (enabled) => this._setShowDummyEnabled(enabled);
        this.ui.onRulerToggle = (enabled) => this._setRulerEnabled(enabled);
        this.ui.onSelectCatalogEntry = (configId) => this._loadConfigFromCatalog(configId);

        this.ui.onAddFloorLayer = () => this._addFloorLayer();
        this.ui.onAddRoofLayer = () => this._addRoofLayer();
        this.ui.onMoveLayer = (layerId, dir) => this._moveLayer(layerId, dir);
        this.ui.onDeleteLayer = (layerId) => this._deleteLayer(layerId);
        this.ui.onSelectFace = (layerId, faceId) => this._setSelectedFace(layerId, faceId);
        this.ui.onToggleFaceLock = (layerId, masterFaceId, targetFaceId) => this._toggleFaceLock(layerId, masterFaceId, targetFaceId);
        this.ui.onHoverLayer = (layerId) => this._setHoveredLayer(layerId);
        this.ui.onHoverLayerTitle = (layerId) => this._setHoveredLayerHighlight(layerId);
        this.ui.onAddBay = (layerId, faceId) => this._addBay(layerId, faceId);
        this.ui.onMoveBay = (layerId, faceId, bayId, dir) => this._moveBay(layerId, faceId, bayId, dir);
        this.ui.onDeleteBay = (layerId, faceId, bayId) => this._deleteBay(layerId, faceId, bayId);
        this.ui.onSetBaySizeMode = (layerId, faceId, bayId, mode) => this._setBaySizeMode(layerId, faceId, bayId, mode);
        this.ui.onSetBayFixedWidth = (layerId, faceId, bayId, width) => this._setBayFixedWidth(layerId, faceId, bayId, width);
        this.ui.onSetBayMinWidth = (layerId, faceId, bayId, min) => this._setBayMinWidth(layerId, faceId, bayId, min);
        this.ui.onSetBayMaxWidth = (layerId, faceId, bayId, max) => this._setBayMaxWidth(layerId, faceId, bayId, max);
        this.ui.onSetBayExpandPreference = (layerId, faceId, bayId, pref) => this._setBayExpandPreference(layerId, faceId, bayId, pref);
        this.ui.onSetBayWallMaterialOverride = (layerId, faceId, bayId, material) => this._setBayWallMaterialOverride(layerId, faceId, bayId, material);
        this.ui.onSetBayTextureFlow = (layerId, faceId, bayId, mode) => this._setBayTextureFlow(layerId, faceId, bayId, mode);
        this.ui.onSetBayDepthEdge = (layerId, faceId, bayId, edge, depth) => this._setBayDepthEdge(layerId, faceId, bayId, edge, depth);
        this.ui.onToggleBayDepthLink = (layerId, faceId, bayId) => this._toggleBayDepthLink(layerId, faceId, bayId);
        this.ui.onSetBayLink = (layerId, faceId, bayId, masterBayId) => this._setBayLink(layerId, faceId, bayId, masterBayId);
        this.ui.onCreateBayGroup = (layerId, faceId, bayIds) => this._createBayGroup(layerId, faceId, bayIds);
        this.ui.onRemoveBayGroup = (layerId, faceId, groupId) => this._removeBayGroup(layerId, faceId, groupId);
        this.ui.onDuplicateBay = (layerId, faceId, bayId) => this._duplicateBay(layerId, faceId, bayId);
        this.ui.onRequestBayMaterialConfig = (layerId, faceId, bayId) => this._openMaterialConfigForBay(layerId, faceId, bayId);
        this.ui.onSidePanelChange = () => this._syncUiState();
        this.ui.onMaterialConfigChange = () => this._requestRebuild({ preserveCamera: true });
        this.ui.onMaterialConfigRequestUiSync = () => this._syncUiState();

        const canvas = this.engine?.canvas ?? null;
        canvas?.addEventListener?.('pointerenter', this._onCanvasPointerEnter, { passive: true });
        canvas?.addEventListener?.('pointerleave', this._onCanvasPointerLeave, { passive: true });
        canvas?.addEventListener?.('pointermove', this._onCanvasPointerMove, { passive: true });
        canvas?.addEventListener?.('pointerdown', this._onCanvasPointerDown, { passive: true });
        canvas?.addEventListener?.('pointerup', this._onCanvasPointerUp, { passive: true });
        canvas?.addEventListener?.('pointercancel', this._onCanvasPointerCancel, { passive: true });

        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        window.addEventListener('keyup', this._onKeyUp, { passive: false });
    }

    exit() {
        const canvas = this.engine?.canvas ?? null;
        canvas?.removeEventListener?.('pointerenter', this._onCanvasPointerEnter);
        canvas?.removeEventListener?.('pointerleave', this._onCanvasPointerLeave);
        canvas?.removeEventListener?.('pointermove', this._onCanvasPointerMove);
        canvas?.removeEventListener?.('pointerdown', this._onCanvasPointerDown);
        canvas?.removeEventListener?.('pointerup', this._onCanvasPointerUp);
        canvas?.removeEventListener?.('pointercancel', this._onCanvasPointerCancel);

        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        this._clearKeys();
        this._pointerInViewport = false;
        this._hideFaceMarkEnabled = false;
        this._showDummyEnabled = false;
        this._rulerEnabled = false;
        this._rulerPointA = null;
        this._rulerPointB = null;
        this._rulerFixed = false;
        this._rulerPointerDown = null;
        this._rulerPointerMoved = false;
        if (canvas) canvas.style.cursor = '';
        this.scene?.setFaceHighlightSuppressed?.(false);
        this.scene?.setShowDummy?.(false);
        this.scene?.setRulerSegment?.(null, null);
        this.ui?.setRulerLabel?.({ visible: false });

        this._thumbJobId += 1;
        this.ui.onCreateBuilding = null;
        this.ui.onRequestLoad = null;
        this.ui.onRequestExport = null;
        this.ui.onReset = null;
        this.ui.onSetFloorLayerFloors = null;
        this.ui.onSetFloorLayerFloorHeight = null;
        this.ui.onSetFloorLayerMaterial = null;
        this.ui.onRequestMaterialConfig = null;
        this.ui.onViewModeChange = null;
        this.ui.onHideFaceMarkChange = null;
        this.ui.onShowDummyChange = null;
        this.ui.onRulerToggle = null;
        this.ui.onSelectCatalogEntry = null;
        this.ui.onAddFloorLayer = null;
        this.ui.onAddRoofLayer = null;
        this.ui.onMoveLayer = null;
        this.ui.onDeleteLayer = null;
        this.ui.onSelectFace = null;
        this.ui.onToggleFaceLock = null;
        this.ui.onHoverLayer = null;
        this.ui.onHoverLayerTitle = null;
        this.ui.onAddBay = null;
        this.ui.onMoveBay = null;
        this.ui.onDeleteBay = null;
        this.ui.onSetBaySizeMode = null;
        this.ui.onSetBayFixedWidth = null;
        this.ui.onSetBayMinWidth = null;
        this.ui.onSetBayMaxWidth = null;
        this.ui.onSetBayExpandPreference = null;
        this.ui.onSetBayWallMaterialOverride = null;
        this.ui.onSetBayTextureFlow = null;
        this.ui.onSetBayDepthEdge = null;
        this.ui.onToggleBayDepthLink = null;
        this.ui.onSetBayLink = null;
        this.ui.onCreateBayGroup = null;
        this.ui.onRemoveBayGroup = null;
        this.ui.onDuplicateBay = null;
        this.ui.onRequestBayMaterialConfig = null;
        this.ui.onSidePanelChange = null;
        this.ui.onMaterialConfigChange = null;
        this.ui.onMaterialConfigRequestUiSync = null;

        this.ui.unmount();
        this.scene.exit();
        this._thumbRenderer.dispose();
    }

    update(dt) {
        if (this._pendingRebuild) {
            const preserveCamera = this._pendingRebuildPreserveCamera;
            this._pendingRebuild = false;
            this._pendingRebuildPreserveCamera = true;
            if (this._currentConfig) {
                const loaded = this.scene.loadBuildingConfig(this._currentConfig, { preserveCamera });
                if (loaded) this._perfBar?.requestUpdate?.();
            }
        }

        this.scene.update(dt);
        this._updateCameraFromKeys(dt);
        this._syncRulerOverlay();
    }

    handleEscape() {
        if (this.ui?.isLoadBrowserOpen?.()) {
            this.ui.closeLoadBrowser();
            return true;
        }
        if (this.ui?.isLinkPopupOpen?.()) {
            this.ui.closeLinkPopup();
            return true;
        }
        if (this.ui?.isGroupingPanelOpen?.()) {
            this.ui.closeGroupingPanel();
            return true;
        }
        if (this.ui?.isSidePanelOpen?.()) {
            this.ui.closeSidePanel();
            return true;
        }
        return false;
    }

    _buildCatalogEntries() {
        const items = getBuildingConfigs();
        items.sort((a, b) => {
            const al = String(a?.name ?? a?.id ?? '').toLowerCase();
            const bl = String(b?.name ?? b?.id ?? '').toLowerCase();
            return al.localeCompare(bl);
        });
        return items
            .map((cfg) => ({
                id: typeof cfg?.id === 'string' ? cfg.id : '',
                name: typeof cfg?.name === 'string' ? cfg.name : ''
            }))
            .filter((e) => !!e.id);
    }

    _syncUiState() {
        const has = this.scene.getHasBuilding();
        const name = has ? (this._currentConfig?.name ?? '') : '';
        const layers = has ? (this._currentConfig?.layers ?? null) : null;
        const layerList = Array.isArray(layers) ? layers : [];

        this.ui.setBuildingState({
            hasBuilding: has,
            buildingName: typeof name === 'string' ? name : '',
            buildingType: 'business'
        });

        this.ui.setLayers(layerList);
        if (!(this.ui?.isSidePanelOpen?.() ?? false)) {
            this._materialConfigLayerId = null;
            this._materialConfigFaceId = null;
            this._materialConfigBayId = null;
        }

        const floorLayers = getFloorLayers(layerList);
        const floorLayerIds = new Set(floorLayers.map((l) => l.id));

        for (const layer of floorLayers) {
            const layerId = layer.id;
            if (this._floorLayerFaceStateById.has(layerId)) continue;
            this._floorLayerFaceStateById.set(layerId, {
                selectedFaceId: null,
                lockedToByFace: createFaceLockMapFromConfigLayer(layer)
            });
        }

        for (const layerId of Array.from(this._floorLayerFaceStateById.keys())) {
            if (!floorLayerIds.has(layerId)) this._floorLayerFaceStateById.delete(layerId);
        }

        if (this._activeFloorLayerId && !floorLayerIds.has(this._activeFloorLayerId)) {
            this._activeFloorLayerId = null;
            this.scene.setSelectedFaceId(null);
        }

        this.ui.setFloorLayerFaceStates(this._floorLayerFaceStateById);
        this.ui.setMaterialConfigContext(this._buildMaterialConfigContext());
        this.ui.setFacadesByLayerId(this._currentConfig?.facades ?? null);
    }

    _buildMaterialConfigContext() {
        const cfg = this._currentConfig;
        const layers = Array.isArray(cfg?.layers) ? cfg.layers : [];

        const requestedId = typeof this._materialConfigLayerId === 'string' ? this._materialConfigLayerId : '';
        const fallbackId = typeof this._activeFloorLayerId === 'string' ? this._activeFloorLayerId : '';

        const selected = layers.find((l) => l?.type === 'floor' && l?.id === requestedId)
            ?? layers.find((l) => l?.type === 'floor' && l?.id === fallbackId)
            ?? layers.find((l) => l?.type === 'floor')
            ?? null;

        const selectedLayerId = typeof selected?.id === 'string' ? selected.id : null;
        const state = selectedLayerId ? (this._floorLayerFaceStateById.get(selectedLayerId) ?? null) : null;
        const selectedFaceId = isFaceId(state?.selectedFaceId) ? state.selectedFaceId : null;
        const lockedToFaceId = selectedFaceId ? (state?.lockedToByFace?.get?.(selectedFaceId) ?? null) : null;
        const fallbackMasterFaceId = lockedToFaceId ?? selectedFaceId;
        const pinnedMasterFaceId = isFaceId(this._materialConfigFaceId) ? this._materialConfigFaceId : null;
        const masterFaceId = pinnedMasterFaceId ?? fallbackMasterFaceId;

        const faceMaterials = selected?.faceMaterials && typeof selected.faceMaterials === 'object' ? selected.faceMaterials : null;
        const faceConfig = masterFaceId && faceMaterials?.[masterFaceId] && typeof faceMaterials[masterFaceId] === 'object'
            ? faceMaterials[masterFaceId]
            : null;

        const bayId = typeof this._materialConfigBayId === 'string' ? this._materialConfigBayId : null;
        if (bayId && selectedLayerId && masterFaceId) {
            const { bay, index } = this._resolveBaySpec({ layerId: selectedLayerId, faceId: masterFaceId, bayId });
            if (bay) {
                return {
                    target: 'bay',
                    bayId,
                    bayIndex: index,
                    layerId: selectedLayerId,
                    faceId: selectedFaceId,
                    lockedToFaceId,
                    masterFaceId,
                    layer: selected && typeof selected === 'object' ? selected : null,
                    faceConfig,
                    config: bay
                };
            }
        }

        return {
            target: 'face',
            layerId: selectedLayerId,
            faceId: selectedFaceId,
            lockedToFaceId,
            masterFaceId,
            layer: selected && typeof selected === 'object' ? selected : null,
            config: faceConfig
        };
    }

    _applyViewMode(mode) {
        const next = (mode === 'wireframe' || mode === 'floors' || mode === 'floorplan' || mode === 'mesh')
            ? mode
            : 'mesh';

        this.scene.setShowWireframe(next === 'wireframe');
        this.scene.setShowFloorDivisions(next === 'floors');
        this.scene.setShowFloorplan(next === 'floorplan');
        this._perfBar?.requestUpdate?.();
    }

    _openLoadBrowser() {
        this.ui.openLoadBrowser();
        this._renderAllThumbnails();
    }

    async _renderAllThumbnails() {
        const jobId = (this._thumbJobId += 1);
        const entries = this._catalogEntries.slice();
        for (const entry of entries) {
            if (!entry?.id) continue;
            if (this._thumbCache.has(entry.id)) continue;
            if (jobId !== this._thumbJobId) return;

            const cfg = getBuildingConfigById(entry.id);
            if (!cfg) continue;

            const url = await this._thumbRenderer.renderConfigToDataUrl(cfg);
            if (jobId !== this._thumbJobId) return;
            if (typeof url === 'string' && url) {
                this._thumbCache.set(entry.id, url);
                this.ui.setCatalogThumbnail(entry.id, url);
            }

            await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        }
    }

    _loadConfigFromCatalog(configId) {
        const id = typeof configId === 'string' ? configId : '';
        if (!id) return;

        const cfg = getBuildingConfigById(id);
        if (!cfg) return;

        this._currentConfig = deepClone(cfg);
        applyBaseWallMaterialFallbackToFloorLayers(this._currentConfig);
        this._floorLayerFaceStateById = new Map();
        this._activeFloorLayerId = null;
        this._materialConfigLayerId = null;
        this._materialConfigFaceId = null;
        this._materialConfigBayId = null;
        this.scene.setSelectedFaceId(null);

        const loaded = this.scene.loadBuildingConfig(this._currentConfig, { preserveCamera: true });
        if (!loaded) return;
        this._perfBar?.requestUpdate?.();

        this.ui.closeLoadBrowser();
        this.ui.closeLinkPopup();
        this._syncUiState();
    }

    _createBuilding() {
        const faceLinking = { links: { ...DEFAULT_FACE_LINKS } };
        const floor = {
            id: createLayerId('floor'),
            type: 'floor',
            floors: 4,
            floorHeight: 4.2,
            faceLinking
        };
        const cfg = {
            id: 'bf2_building',
            name: 'Building',
            layers: [floor]
        };

        this._currentConfig = cfg;
        this._materialConfigLayerId = null;
        this._materialConfigFaceId = null;
        this._materialConfigBayId = null;
        const lockedToByFace = createEmptyFaceLockMap();
        for (const [slave, master] of Object.entries(faceLinking.links)) lockedToByFace.set(slave, master);
        this._floorLayerFaceStateById = new Map();
        this._floorLayerFaceStateById.set(floor.id, {
            selectedFaceId: null,
            lockedToByFace
        });
        this._activeFloorLayerId = floor.id;
        this.scene.setSelectedFaceId(null);

        const loaded = this.scene.loadBuildingConfig(this._currentConfig, { preserveCamera: true });
        if (!loaded) return;
        this._perfBar?.requestUpdate?.();

        this.ui.closeLoadBrowser();
        this.ui.closeLinkPopup();
        this._syncUiState();
    }

    _reset() {
        if (!this.scene.getHasBuilding()) return;
        this.scene.clearBuilding();
        this._currentConfig = null;
        this._floorLayerFaceStateById = new Map();
        this._activeFloorLayerId = null;
        this._materialConfigLayerId = null;
        this._materialConfigFaceId = null;
        this._materialConfigBayId = null;
        this.scene.setSelectedFaceId(null);
        this.ui.closeLoadBrowser();
        this.ui.closeLinkPopup();
        this._perfBar?.requestUpdate?.();
        this._syncUiState();
    }

    _requestRebuild({ preserveCamera = true } = {}) {
        const keepCamera = !!preserveCamera;
        if (this._pendingRebuild) {
            this._pendingRebuildPreserveCamera &&= keepCamera;
            return;
        }
        this._pendingRebuild = true;
        this._pendingRebuildPreserveCamera = keepCamera;
    }

    _addFloorLayer() {
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(cfg.layers)) return;

        const layers = cfg.layers;
        const lastFloor = [...layers].reverse().find((layer) => layer?.type === 'floor') ?? null;
        const height = Number.isFinite(lastFloor?.floorHeight) ? lastFloor.floorHeight : 4.2;
        const faceLinking = { links: { ...DEFAULT_FACE_LINKS } };
        const layer = {
            id: createLayerId('floor'),
            type: 'floor',
            floors: 1,
            floorHeight: height,
            faceLinking
        };

        const insertAt = layers.findIndex((l) => l?.type === 'roof');
        if (insertAt >= 0) layers.splice(insertAt, 0, layer);
        else layers.push(layer);

        this._floorLayerFaceStateById.set(layer.id, { selectedFaceId: null, lockedToByFace: createFaceLockMapFromConfigLayer(layer) });

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _addRoofLayer() {
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(cfg.layers)) return;

        cfg.layers.push({
            id: createLayerId('roof'),
            type: 'roof'
        });
        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _moveLayer(layerId, dir) {
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(cfg.layers)) return;
        const id = typeof layerId === 'string' ? layerId : '';
        const d = Math.sign(Number(dir));
        if (!id || (d !== -1 && d !== 1)) return;

        const layers = cfg.layers;
        const idx = layers.findIndex((l) => l?.id === id);
        if (idx < 0) return;
        const nextIdx = idx + d;
        if (nextIdx < 0 || nextIdx >= layers.length) return;

        const tmp = layers[idx];
        layers[idx] = layers[nextIdx];
        layers[nextIdx] = tmp;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _deleteLayer(layerId) {
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(cfg.layers)) return;
        const id = typeof layerId === 'string' ? layerId : '';
        if (!id) return;

        const layers = cfg.layers;
        const idx = layers.findIndex((l) => l?.id === id);
        if (idx < 0) return;

        const layer = layers[idx];
        const type = layer?.type;
        if (type !== 'floor' && type !== 'roof') return;

        const floorCount = layers.filter((l) => l?.type === 'floor').length;
        if (type === 'floor' && floorCount <= 1) return;

        layers.splice(idx, 1);
        if (type === 'floor') {
            this._floorLayerFaceStateById.delete(id);
            if (this._activeFloorLayerId === id) {
                this._activeFloorLayerId = null;
                this.scene.setSelectedFaceId(null);
                this.ui.closeLinkPopup();
            }
            if (this._materialConfigLayerId === id) {
                this._materialConfigLayerId = null;
                this._materialConfigFaceId = null;
                this._materialConfigBayId = null;
                this.ui.closeSidePanel();
            }

            const facadesByLayerId = cfg.facades && typeof cfg.facades === 'object' ? cfg.facades : null;
            if (facadesByLayerId && facadesByLayerId[id]) {
                delete facadesByLayerId[id];
                if (!Object.keys(facadesByLayerId).length) delete cfg.facades;
            }
        }
        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setFloorLayerFloors(layerId, floors) {
        const id = typeof layerId === 'string' ? layerId : '';
        if (!id || !Number.isFinite(floors)) return;
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(cfg.layers)) return;

        const layer = cfg.layers.find((l) => l?.type === 'floor' && l?.id === id) ?? null;
        if (!layer) return;

        const next = clampInt(floors, FLOOR_COUNT_MIN, FLOOR_COUNT_MAX);
        if (Number(layer.floors) === next) return;

        layer.floors = next;
        this._requestRebuild({ preserveCamera: true });
    }

    _setFloorLayerFloorHeight(layerId, height) {
        const id = typeof layerId === 'string' ? layerId : '';
        if (!id || !Number.isFinite(height)) return;
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(cfg.layers)) return;

        const next = clamp(height, FLOOR_HEIGHT_MIN, FLOOR_HEIGHT_MAX);
        const layer = cfg.layers.find((l) => l?.type === 'floor' && l?.id === id) ?? null;
        if (!layer) return;

        if (Math.abs(next - (Number(layer?.floorHeight) || 0)) < 1e-6) return;
        layer.floorHeight = next;
        this._requestRebuild({ preserveCamera: true });
    }

    _ensureFaceMaterialConfigForMaster(layer, faceId) {
        const master = isFaceId(faceId) ? faceId : null;
        if (!master || !layer || typeof layer !== 'object') return null;

        layer.faceMaterials ??= {};
        const faceMaterials = layer.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
        if (!faceMaterials) return null;

        let cfg = faceMaterials[master] ?? null;
        if (!cfg || typeof cfg !== 'object') {
            cfg = {
                material: resolveDefaultLayerWallMaterial(layer),
                wallBase: layer.wallBase ? deepClone(layer.wallBase) : null,
                tiling: layer.tiling ? deepClone(layer.tiling) : null,
                materialVariation: layer.materialVariation ? deepClone(layer.materialVariation) : null
            };
            faceMaterials[master] = cfg;
        }
        return cfg;
    }

    _setFloorLayerMaterial(layerId, faceId, material) {
        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        if (!id || !face) return;
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(cfg.layers)) return;

        const layer = cfg.layers.find((l) => l?.type === 'floor' && l?.id === id) ?? null;
        if (!layer) return;

        const state = this._floorLayerFaceStateById.get(id) ?? null;
        const lockedToByFace = state?.lockedToByFace ?? null;
        if (lockedToByFace instanceof Map) {
            const lockedTo = lockedToByFace.get(face) ?? null;
            if (lockedTo) return;
        }

        const next = normalizeMaterialSpec(material);
        if (!next) return;

        const faceCfg = this._ensureFaceMaterialConfigForMaster(layer, face);
        if (!faceCfg) return;

        const prev = normalizeMaterialSpec(faceCfg?.material ?? null);
        if ((prev?.kind ?? null) === next.kind && (prev?.id ?? null) === next.id) return;
        faceCfg.material = next;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _ensureFacadeBaysForMaster(layerId, faceId) {
        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        if (!id || !face) return null;
        const cfg = this._currentConfig;
        if (!cfg || !Array.isArray(cfg.layers)) return null;

        const layer = cfg.layers.find((l) => l?.type === 'floor' && l?.id === id) ?? null;
        if (!layer) return null;

        const state = this._floorLayerFaceStateById.get(id) ?? null;
        const lockedToByFace = state?.lockedToByFace ?? null;
        if (lockedToByFace instanceof Map) {
            const lockedTo = lockedToByFace.get(face) ?? null;
            if (lockedTo) return null;
        }

        const layerFacades = ensureLayerFaceFacades(cfg, id);
        if (!layerFacades) return null;
        layerFacades[face] ??= {};
        const facade = layerFacades[face];
        if (!facade || typeof facade !== 'object') return null;

        facade.layout ??= {};
        if (!facade.layout || typeof facade.layout !== 'object') facade.layout = {};
        facade.layout.bays ??= {};
        if (!facade.layout.bays || typeof facade.layout.bays !== 'object') facade.layout.bays = {};
        facade.layout.bays.items ??= [];
        if (!Array.isArray(facade.layout.bays.items)) facade.layout.bays.items = [];
        facade.layout.bays.nextBayIndex = clampInt(facade.layout.bays.nextBayIndex ?? 1, 1, 9999);
        return { cfg, layer, layerFacades, facade, bays: facade.layout.bays };
    }

    _ensureFacadeBayGroupsForMaster(layerId, faceId) {
        const ctx = this._ensureFacadeBaysForMaster(layerId, faceId);
        if (!ctx) return null;

        const facade = ctx.facade;
        facade.layout.groups ??= {};
        if (!facade.layout.groups || typeof facade.layout.groups !== 'object') facade.layout.groups = {};
        facade.layout.groups.items ??= [];
        if (!Array.isArray(facade.layout.groups.items)) facade.layout.groups.items = [];
        facade.layout.groups.nextGroupIndex = clampInt(facade.layout.groups.nextGroupIndex ?? 1, 1, 9999);
        return { ...ctx, groups: facade.layout.groups };
    }

    _findBaySpec({ layerId, faceId, bayId }) {
        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        const bid = typeof bayId === 'string' ? bayId : '';
        if (!id || !face || !bid) return null;
        const cfg = this._currentConfig;
        if (!cfg) return null;

        const layerFacades = resolveLayerFaceFacades(cfg, id);
        if (!layerFacades) return null;
        const facade = layerFacades[face];
        if (!facade || typeof facade !== 'object') return null;
        const items = Array.isArray(facade?.layout?.bays?.items) ? facade.layout.bays.items : null;
        if (!items) return null;
        const idx = items.findIndex((b) => b && typeof b === 'object' && b.id === bid);
        if (idx < 0) return null;
        return { cfg, layerFacades, facade, items, idx, bay: items[idx] };
    }

    _createBayGroup(layerId, faceId, bayIds) {
        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        if (!id || !face) return null;

        const srcBayIds = Array.isArray(bayIds) ? bayIds : [];
        const raw = srcBayIds.map((bid) => (typeof bid === 'string' ? bid : '')).filter(Boolean);
        if (raw.length < BAY_GROUP_MIN_SIZE) return null;

        const ctx = this._ensureFacadeBayGroupsForMaster(id, face);
        if (!ctx) return null;

        const bays = Array.isArray(ctx.bays?.items) ? ctx.bays.items : [];
        if (bays.length < BAY_GROUP_MIN_SIZE) return null;

        const indexById = new Map();
        for (let i = 0; i < bays.length; i++) {
            const bay = bays[i] && typeof bays[i] === 'object' ? bays[i] : null;
            const bid = typeof bay?.id === 'string' ? bay.id : '';
            if (bid) indexById.set(bid, i);
        }

        const uniq = new Set();
        const indices = [];
        for (const bid of raw) {
            if (uniq.has(bid)) continue;
            uniq.add(bid);
            const idx = indexById.get(bid);
            if (!Number.isInteger(idx)) {
                console.warn(`[BuildingFabrication2View] Cannot create bay group: bay "${bid}" not found.`);
                return null;
            }
            indices.push(idx);
        }

        if (indices.length < BAY_GROUP_MIN_SIZE) return null;
        indices.sort((a, b) => a - b);
        for (let i = 1; i < indices.length; i++) {
            if (indices[i] !== indices[i - 1] + 1) {
                console.warn('[BuildingFabrication2View] Cannot create bay group: selection must be contiguous.');
                return null;
            }
        }

        const selectionIdSet = new Set(indices.map((idx) => {
            const bay = bays[idx] && typeof bays[idx] === 'object' ? bays[idx] : null;
            return typeof bay?.id === 'string' ? bay.id : '';
        }).filter(Boolean));

        const groups = Array.isArray(ctx.groups?.items) ? ctx.groups.items : [];
        for (const group of groups) {
            const memberIds = Array.isArray(group?.bayIds) ? group.bayIds : [];
            if (memberIds.some((bid) => selectionIdSet.has(bid))) {
                const gid = typeof group?.id === 'string' ? group.id : '(unknown)';
                console.warn(`[BuildingFabrication2View] Cannot create bay group: selection overlaps existing group "${gid}".`);
                return null;
            }
        }

        const used = new Set(groups.map((g) => (g && typeof g === 'object' ? g.id : '')).filter(Boolean));
        let nextIndex = clampInt(ctx.groups.nextGroupIndex ?? 1, 1, 9999);
        let groupId = `group_${nextIndex}`;
        for (let guard = 0; guard < 9999 && used.has(groupId); guard++) {
            nextIndex += 1;
            groupId = `group_${nextIndex}`;
        }
        ctx.groups.nextGroupIndex = nextIndex + 1;

        const orderedBayIds = indices.map((idx) => {
            const bay = bays[idx] && typeof bays[idx] === 'object' ? bays[idx] : null;
            return typeof bay?.id === 'string' ? bay.id : '';
        }).filter(Boolean);

        groups.push({
            id: groupId,
            bayIds: orderedBayIds,
            repeat: normalizeFacadeBayGroupRepeat({ minRepeats: 1, maxRepeats: 'auto' })
        });
        ctx.groups.items = groups;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
        return groupId;
    }

    _removeBayGroup(layerId, faceId, groupId) {
        const ctx = this._ensureFacadeBayGroupsForMaster(layerId, faceId);
        if (!ctx) return;

        const gid = typeof groupId === 'string' ? groupId : '';
        if (!gid) return;

        const groups = Array.isArray(ctx.groups?.items) ? ctx.groups.items : [];
        const idx = groups.findIndex((g) => (g && typeof g === 'object' ? g.id : '') === gid);
        if (idx < 0) return;
        groups.splice(idx, 1);
        ctx.groups.items = groups;

        if (!groups.length) delete ctx.facade.layout.groups;

        const hasAnyLayout = ctx.facade.layout && typeof ctx.facade.layout === 'object' && Object.keys(ctx.facade.layout).length > 0;
        if (!hasAnyLayout) delete ctx.facade.layout;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _addBay(layerId, faceId) {
        const ctx = this._ensureFacadeBaysForMaster(layerId, faceId);
        if (!ctx) return null;

        const bays = ctx.bays;
        const items = Array.isArray(bays.items) ? bays.items : [];

        const used = new Set(items.map((b) => (b && typeof b === 'object' ? b.id : '')).filter(Boolean));
        let nextIndex = clampInt(bays.nextBayIndex ?? 1, 1, 9999);
        let id = `bay_${nextIndex}`;
        for (let guard = 0; guard < 9999 && used.has(id); guard++) {
            nextIndex += 1;
            id = `bay_${nextIndex}`;
        }
        bays.nextBayIndex = nextIndex + 1;

        items.push({
            id,
            size: { mode: 'range', minMeters: BAY_DEFAULT_WIDTH_M, maxMeters: null },
            expandPreference: 'prefer_expand',
            wallMaterialOverride: null
        });
        bays.items = items;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
        return id;
    }

    _moveBay(layerId, faceId, bayId, dir) {
        const delta = Math.sign(Number(dir));
        if (delta !== -1 && delta !== 1) return;

        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;

        const items = ctx.items;
        const from = ctx.idx;
        const to = from + delta;
        if (to < 0 || to >= items.length) return;

        const tmp = items[from];
        items[from] = items[to];
        items[to] = tmp;

        const groups = Array.isArray(ctx.facade?.layout?.groups?.items) ? ctx.facade.layout.groups.items : null;
        if (groups && groups.length) {
            const indexById = new Map();
            for (let i = 0; i < items.length; i++) {
                const bay = items[i] && typeof items[i] === 'object' ? items[i] : null;
                const bid = typeof bay?.id === 'string' ? bay.id : '';
                if (bid) indexById.set(bid, i);
            }

            for (let gi = groups.length - 1; gi >= 0; gi--) {
                const group = groups[gi] && typeof groups[gi] === 'object' ? groups[gi] : null;
                const ids = Array.isArray(group?.bayIds) ? group.bayIds : [];
                if (ids.length < BAY_GROUP_MIN_SIZE) {
                    groups.splice(gi, 1);
                    continue;
                }

                const indices = [];
                let invalid = false;
                for (const bid of ids) {
                    const idx = indexById.get(bid);
                    if (!Number.isInteger(idx)) {
                        invalid = true;
                        break;
                    }
                    indices.push(idx);
                }
                if (invalid) {
                    const gid = typeof group?.id === 'string' ? group.id : '(unknown)';
                    console.warn(`[BuildingFabrication2View] Dropping bay group "${gid}" after move because a member bay is missing.`);
                    groups.splice(gi, 1);
                    continue;
                }

                indices.sort((a, b) => a - b);
                let contiguous = true;
                for (let i = 1; i < indices.length; i++) {
                    if (indices[i] !== indices[i - 1] + 1) {
                        contiguous = false;
                        break;
                    }
                }

                if (!contiguous) {
                    const gid = typeof group?.id === 'string' ? group.id : '(unknown)';
                    console.warn(`[BuildingFabrication2View] Dropping bay group "${gid}" after move because it is no longer contiguous.`);
                    groups.splice(gi, 1);
                    continue;
                }

                group.bayIds = indices.map((idx) => {
                    const bay = items[idx] && typeof items[idx] === 'object' ? items[idx] : null;
                    return typeof bay?.id === 'string' ? bay.id : '';
                }).filter(Boolean);
            }

            if (!groups.length) delete ctx.facade.layout.groups;
        }

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _deleteBay(layerId, faceId, bayId) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;

        ctx.items.splice(ctx.idx, 1);
        for (const bay of ctx.items) {
            if (!bay || typeof bay !== 'object') continue;
            if ((bay.linkFromBayId ?? null) === bayId) bay.linkFromBayId = null;
            if ((bay.materialLinkFromBayId ?? null) === bayId) bay.materialLinkFromBayId = null;
        }

        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        if (!id || !face) return;

        const groups = Array.isArray(ctx.facade?.layout?.groups?.items) ? ctx.facade.layout.groups.items : null;
        if (groups && groups.length) {
            for (let gi = groups.length - 1; gi >= 0; gi--) {
                const group = groups[gi] && typeof groups[gi] === 'object' ? groups[gi] : null;
                const bayIds = Array.isArray(group?.bayIds) ? group.bayIds : [];
                const nextIds = bayIds.filter((bid) => bid !== bayId);
                if (nextIds.length < BAY_GROUP_MIN_SIZE) {
                    groups.splice(gi, 1);
                    continue;
                }
                group.bayIds = nextIds;
            }
            if (!groups.length) delete ctx.facade.layout.groups;
        }

        const items = Array.isArray(ctx.facade?.layout?.bays?.items) ? ctx.facade.layout.bays.items : null;
        if (items && !items.length) {
            delete ctx.facade.layout.bays;
        }
        const hasOtherLayout = ctx.facade.layout && typeof ctx.facade.layout === 'object' && Object.keys(ctx.facade.layout).length > 0;
        if (!hasOtherLayout) delete ctx.facade.layout;
        if (!Object.keys(ctx.facade).length) delete ctx.layerFacades[face];
        cleanupEmptyLayerFacades(ctx.cfg, id);

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBaySizeMode(layerId, faceId, bayId, mode) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;

        const nextMode = mode === 'fixed' ? 'fixed' : 'range';
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;

        const curMode = bay?.size?.mode === 'fixed' ? 'fixed' : 'range';
        if (curMode === nextMode) return;

        if (nextMode === 'fixed') {
            const min = clamp(bay?.size?.minMeters ?? BAY_MIN_WIDTH_M, BAY_MIN_WIDTH_M, 9999);
            const maxRaw = bay?.size?.maxMeters;
            const max = Number.isFinite(maxRaw) ? clamp(maxRaw, min, 9999) : null;
            const width = Number.isFinite(max) ? ((min + max) * 0.5) : min;
            bay.size = { mode: 'fixed', widthMeters: width };
        } else {
            const width = clamp(bay?.size?.widthMeters ?? 1.0, BAY_MIN_WIDTH_M, 9999);
            bay.size = { mode: 'range', minMeters: width, maxMeters: null };
        }

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayFixedWidth(layerId, faceId, bayId, width) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;
        if (bay?.size?.mode !== 'fixed') return;

        const next = clamp(width, BAY_MIN_WIDTH_M, 9999);
        if (Math.abs(next - (Number(bay.size?.widthMeters) || 0)) < 1e-6) return;
        bay.size.widthMeters = next;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayMinWidth(layerId, faceId, bayId, min) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;
        if (bay?.size?.mode !== 'range') return;

        const next = clamp(min, BAY_MIN_WIDTH_M, 9999);
        bay.size.minMeters = next;

        const maxRaw = bay.size.maxMeters;
        if (Number.isFinite(maxRaw) && maxRaw < next) bay.size.maxMeters = next;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayMaxWidth(layerId, faceId, bayId, max) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;
        if (bay?.size?.mode !== 'range') return;

        if (max === null) {
            bay.size.maxMeters = null;
        } else {
            const min = clamp(bay.size.minMeters ?? BAY_MIN_WIDTH_M, BAY_MIN_WIDTH_M, 9999);
            bay.size.maxMeters = clamp(max, min, 9999);
        }

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayExpandPreference(layerId, faceId, bayId, pref) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;

        const next = normalizeBayExpandPreference(pref);
        const prev = normalizeBayExpandPreference(bay.expandPreference ?? null);
        if (prev === next) return;

        bay.expandPreference = next;
        if (bay.repeatable !== undefined) delete bay.repeatable;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayTextureFlow(layerId, faceId, bayId, mode) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;

        const next = normalizeBayTextureFlow(mode);
        const prev = normalizeBayTextureFlow(bay?.textureFlow ?? null);
        if (prev === next) return;

        if (next === 'restart') delete bay.textureFlow;
        else bay.textureFlow = next;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayDepthEdge(layerId, faceId, bayId, edge, depthMeters) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;

        const side = edge === 'right' ? 'right' : 'left';
        const nextValue = clamp(depthMeters, BAY_DEPTH_MIN_M, BAY_DEPTH_MAX_M);

        const depth = bay.depth && typeof bay.depth === 'object' ? bay.depth : null;
        const linked = (depth?.linked ?? true) !== false;
        const prevLeft = clamp(Number(depth?.left) || 0, BAY_DEPTH_MIN_M, BAY_DEPTH_MAX_M);
        const prevRightRaw = Number(depth?.right);
        const prevRight = clamp(Number.isFinite(prevRightRaw) ? prevRightRaw : (linked ? prevLeft : 0), BAY_DEPTH_MIN_M, BAY_DEPTH_MAX_M);

        const left = linked ? nextValue : (side === 'left' ? nextValue : prevLeft);
        const right = linked ? nextValue : (side === 'right' ? nextValue : prevRight);

        if (linked) {
            if (Math.abs(left) < 1e-6 && Math.abs(right) < 1e-6) delete bay.depth;
            else bay.depth = { left, right };
        } else {
            bay.depth = { left, right, linked: false };
        }

        this._requestRebuild({ preserveCamera: true });
    }

    _toggleBayDepthLink(layerId, faceId, bayId) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;

        const depth = bay.depth && typeof bay.depth === 'object' ? bay.depth : null;
        const linked = (depth?.linked ?? true) !== false;

        const prevLeft = clamp(Number(depth?.left) || 0, BAY_DEPTH_MIN_M, BAY_DEPTH_MAX_M);
        const prevRightRaw = Number(depth?.right);
        const prevRight = clamp(Number.isFinite(prevRightRaw) ? prevRightRaw : prevLeft, BAY_DEPTH_MIN_M, BAY_DEPTH_MAX_M);

        if (linked) {
            bay.depth = { left: prevLeft, right: prevRight, linked: false };
        } else {
            const next = Math.abs(prevRight) > Math.abs(prevLeft) ? prevRight : prevLeft;
            if (Math.abs(next) < 1e-6) delete bay.depth;
            else bay.depth = { left: next, right: next };
        }

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayWallMaterialOverride(layerId, faceId, bayId, material) {
        const ctx = this._findBaySpec({ layerId, faceId, bayId });
        if (!ctx) return;
        const bay = ctx.bay && typeof ctx.bay === 'object' ? ctx.bay : null;
        if (!bay) return;
        if (resolveBayLinkFromSpec(bay)) return;

        const next = normalizeMaterialSpec(material);
        if (material === null) {
            if (bay.wallMaterialOverride === null || bay.wallMaterialOverride === undefined) return;
            bay.wallMaterialOverride = null;
        } else {
            if (!next) return;
            const prev = normalizeMaterialSpec(bay.wallMaterialOverride ?? null);
            if ((prev?.kind ?? null) === next.kind && (prev?.id ?? null) === next.id) return;
            bay.wallMaterialOverride = next;
        }

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setBayLink(layerId, faceId, bayId, masterBayId) {
        const ctx = this._ensureFacadeBaysForMaster(layerId, faceId);
        if (!ctx) return;
        const bid = typeof bayId === 'string' ? bayId : '';
        if (!bid) return;

        const items = Array.isArray(ctx.bays?.items) ? ctx.bays.items : [];
        const bay = items.find((b) => (b && typeof b === 'object' ? b.id : '') === bid) ?? null;
        if (!bay || typeof bay !== 'object') return;

        const nextMaster = typeof masterBayId === 'string' && masterBayId ? masterBayId : null;
        if (!nextMaster) {
            if (!resolveBayLinkFromSpec(bay)) return;
            bay.linkFromBayId = null;
            bay.materialLinkFromBayId = null;
            this._syncUiState();
            this._requestRebuild({ preserveCamera: true });
            return;
        }

        if (nextMaster === bid) {
            console.warn(`[BuildingFabrication2View] Ignoring linkFromBayId cycle: bay "${bid}" cannot link to itself.`);
            return;
        }
        const masterExists = items.some((b) => (b && typeof b === 'object' ? b.id : '') === nextMaster);
        if (!masterExists) {
            console.warn(`[BuildingFabrication2View] Cannot link bay "${bid}" to missing bay "${nextMaster}".`);
            return;
        }

        const byId = new Map(items.map((b) => [b && typeof b === 'object' ? b.id : '', b]).filter((it) => typeof it[0] === 'string' && it[0]));
        let rootMaster = nextMaster;
        let curId = nextMaster;
        const visited = new Set([bid]);
        for (let i = 0; i < 32; i++) {
            if (visited.has(curId)) {
                console.warn(`[BuildingFabrication2View] Cannot link bay "${bid}" to "${nextMaster}" because it would create a cycle.`);
                return;
            }
            visited.add(curId);

            const cur = byId.get(curId) ?? null;
            if (!cur || typeof cur !== 'object') break;
            rootMaster = curId;

            const link = resolveBayLinkFromSpec(cur);
            if (!link || link === curId) break;

            const next = byId.get(link) ?? null;
            if (!next || typeof next !== 'object') break;

            curId = link;
        }

        if (rootMaster === bid) {
            console.warn(`[BuildingFabrication2View] Ignoring linkFromBayId cycle: bay "${bid}" cannot link to itself.`);
            return;
        }

        const slaves = items.filter((b) => {
            if (!b || typeof b !== 'object') return false;
            const id = typeof b.id === 'string' ? b.id : '';
            if (!id || id === bid) return false;
            return resolveBayLinkFromSpec(b) === bid;
        });
        const hasSlavesToRedirect = slaves.length > 0;

        if ((bay.linkFromBayId ?? null) === rootMaster && (bay.materialLinkFromBayId ?? null) === null && !hasSlavesToRedirect) return;

        bay.linkFromBayId = rootMaster;
        bay.materialLinkFromBayId = null;
        for (const slave of slaves) {
            slave.linkFromBayId = rootMaster;
            slave.materialLinkFromBayId = null;
        }

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _duplicateBay(layerId, faceId, bayId) {
        const ctx = this._ensureFacadeBaysForMaster(layerId, faceId);
        if (!ctx) return null;
        const bid = typeof bayId === 'string' ? bayId : '';
        if (!bid) return null;

        const items = Array.isArray(ctx.bays?.items) ? ctx.bays.items : [];
        const master = items.find((b) => (b && typeof b === 'object' ? b.id : '') === bid) ?? null;
        if (!master || typeof master !== 'object') return null;
        if (resolveBayLinkFromSpec(master)) {
            console.warn(`[BuildingFabrication2View] Cannot duplicate bay "${bid}" because it is linked (slave).`);
            return null;
        }

        const used = new Set(items.map((b) => (b && typeof b === 'object' ? b.id : '')).filter(Boolean));
        let nextIndex = clampInt(ctx.bays.nextBayIndex ?? 1, 1, 9999);
        let id = `bay_${nextIndex}`;
        for (let guard = 0; guard < 9999 && used.has(id); guard++) {
            nextIndex += 1;
            id = `bay_${nextIndex}`;
        }
        ctx.bays.nextBayIndex = nextIndex + 1;

        items.push({
            id,
            linkFromBayId: bid,
            size: { mode: 'range', minMeters: BAY_DEFAULT_WIDTH_M, maxMeters: null },
            expandPreference: 'prefer_expand',
            wallMaterialOverride: null
        });
        ctx.bays.items = items;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
        return id;
    }

    _setSelectedFace(layerId, faceId) {
        const id = typeof layerId === 'string' ? layerId : '';
        if (!id) return;

        const state = this._floorLayerFaceStateById.get(id) ?? null;
        if (!state) return;

        let clearedOtherSelection = false;
        for (const [otherId, other] of this._floorLayerFaceStateById.entries()) {
            if (otherId === id) continue;
            if (!other || other.selectedFaceId === null) continue;
            other.selectedFaceId = null;
            clearedOtherSelection = true;
        }

        const next = isFaceId(faceId) ? faceId : null;
        if (!clearedOtherSelection && next === state.selectedFaceId && this._activeFloorLayerId === id) return;

        state.selectedFaceId = next;
        this._activeFloorLayerId = id;
        this.scene.setSelectedFaceId(next);
        this.scene.setActiveFaceLayerId?.(id);
        this.ui.setFloorLayerFaceStates(this._floorLayerFaceStateById);
        this.ui.setMaterialConfigContext(this._buildMaterialConfigContext());
    }

    _getSelectedFaceId() {
        for (const state of this._floorLayerFaceStateById.values()) {
            const faceId = isFaceId(state?.selectedFaceId) ? state.selectedFaceId : null;
            if (faceId) return faceId;
        }
        return null;
    }

    _openMaterialConfigForLayer(layerId, faceId) {
        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        if (!id || !face) return;
        const cfg = this._currentConfig;
        const layers = Array.isArray(cfg?.layers) ? cfg.layers : [];
        const layer = layers.find((l) => l?.type === 'floor' && l?.id === id) ?? null;
        if (!layer) return;

        const state = this._floorLayerFaceStateById.get(id) ?? null;
        const lockedToByFace = state?.lockedToByFace ?? null;
        if (lockedToByFace instanceof Map) {
            const lockedTo = lockedToByFace.get(face) ?? null;
            if (lockedTo) return;
        }

        this._ensureFaceMaterialConfigForMaster(layer, face);

        this._materialConfigLayerId = id;
        this._materialConfigFaceId = face;
        this._materialConfigBayId = null;
        this.ui.setMaterialConfigContext(this._buildMaterialConfigContext());
        this.ui.openMaterialConfigPanel();
    }

    _openMaterialConfigForBay(layerId, faceId, bayId) {
        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        const bay = typeof bayId === 'string' ? bayId : '';
        if (!id || !face || !bay) return;

        const cfg = this._currentConfig;
        const layers = Array.isArray(cfg?.layers) ? cfg.layers : [];
        const layer = layers.find((l) => l?.type === 'floor' && l?.id === id) ?? null;
        if (!layer) return;

        const state = this._floorLayerFaceStateById.get(id) ?? null;
        const lockedToByFace = state?.lockedToByFace ?? null;
        if (lockedToByFace instanceof Map) {
            const lockedTo = lockedToByFace.get(face) ?? null;
            if (lockedTo) return;
        }

        const spec = this._resolveBaySpec({ layerId: id, faceId: face, bayId: bay });
        if (!spec.bay) return;

        this._materialConfigLayerId = id;
        this._materialConfigFaceId = face;
        this._materialConfigBayId = bay;
        this.ui.setMaterialConfigContext(this._buildMaterialConfigContext());
        this.ui.openMaterialConfigPanel();
    }

    _resolveBaySpec({ layerId, faceId, bayId } = {}) {
        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        const bay = typeof bayId === 'string' ? bayId : '';
        if (!id || !face || !bay) return { bay: null, index: -1 };

        const cfg = this._currentConfig;
        const facades = cfg?.facades && typeof cfg.facades === 'object' ? cfg.facades : null;
        const layerFacades = facades?.[id] && typeof facades[id] === 'object' ? facades[id] : null;
        const facade = layerFacades?.[face] && typeof layerFacades[face] === 'object' ? layerFacades[face] : null;
        const bays = facade?.layout?.bays?.items;
        if (!Array.isArray(bays)) return { bay: null, index: -1 };

        const idx = bays.findIndex((it) => (it && typeof it === 'object' && typeof it.id === 'string' ? it.id : '') === bay);
        if (idx < 0) return { bay: null, index: -1 };
        const spec = bays[idx];
        return { bay: spec && typeof spec === 'object' ? spec : null, index: idx };
    }

    _toggleFaceLock(layerId, masterFaceId, targetFaceId) {
        const id = typeof layerId === 'string' ? layerId : '';
        if (!id) return;
        const master = isFaceId(masterFaceId) ? masterFaceId : null;
        const target = isFaceId(targetFaceId) ? targetFaceId : null;
        if (!master || !target || master === target) return;

        const state = this._floorLayerFaceStateById.get(id) ?? null;
        if (!state) return;

        const lockedToByFace = state.lockedToByFace;
        if (!(lockedToByFace instanceof Map)) return;

        const cfg = this._currentConfig;
        const layers = Array.isArray(cfg?.layers) ? cfg.layers : [];
        const layer = layers.find((l) => l?.type === 'floor' && l?.id === id) ?? null;
        if (!layer) return;

        // The master cannot be a slave.
        if (lockedToByFace.get(master) ?? null) return;

        const lockedToMaster = (lockedToByFace.get(target) ?? null) === master;
        if (lockedToMaster) {
            const masterCfg = this._ensureFaceMaterialConfigForMaster(layer, master);
            if (masterCfg) {
                layer.faceMaterials ??= {};
                const faceMaterials = layer.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
                if (faceMaterials) faceMaterials[target] = deepClone(masterCfg);
            }

            const srcLayerFacades = resolveLayerFaceFacades(cfg, id);
            const srcFacade = (srcLayerFacades?.[master] && typeof srcLayerFacades[master] === 'object') ? srcLayerFacades[master] : null;
            if (srcFacade) {
                const dstLayerFacades = ensureLayerFaceFacades(cfg, id);
                if (dstLayerFacades) dstLayerFacades[target] = deepClone(srcFacade);
            }
            lockedToByFace.set(target, null);
        } else {
            const targetParent = lockedToByFace.get(target) ?? target;
            const targetCfg = this._ensureFaceMaterialConfigForMaster(layer, targetParent);
            const targetLayerFacades = resolveLayerFaceFacades(cfg, id);
            const targetFacade = (targetLayerFacades?.[targetParent] && typeof targetLayerFacades[targetParent] === 'object')
                ? targetLayerFacades[targetParent]
                : null;

            // If the target is becoming a slave, it cannot have slaves.
            for (const faceId of FACE_IDS) {
                if ((lockedToByFace.get(faceId) ?? null) !== target) continue;
                lockedToByFace.set(faceId, null);
                if (targetCfg) {
                    layer.faceMaterials ??= {};
                    const faceMaterials = layer.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
                    if (faceMaterials) faceMaterials[faceId] = deepClone(targetCfg);
                }
                if (targetFacade) {
                    const dstLayerFacades = ensureLayerFaceFacades(cfg, id);
                    if (dstLayerFacades) dstLayerFacades[faceId] = deepClone(targetFacade);
                }
            }
            lockedToByFace.set(target, master);

            const faceMaterials = layer.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
            if (faceMaterials) {
                delete faceMaterials[target];
                if (!Object.keys(faceMaterials).length) delete layer.faceMaterials;
            }

            const layerFacades = resolveLayerFaceFacades(cfg, id);
            if (layerFacades) {
                delete layerFacades[target];
                cleanupEmptyLayerFacades(cfg, id);
            }
        }

        const links = {};
        for (const faceId of FACE_IDS) {
            const to = lockedToByFace.get(faceId) ?? null;
            if (to) links[faceId] = to;
        }
        const linking = Object.keys(links).length ? { links } : null;
        if (linking) layer.faceLinking = linking;
        else delete layer.faceLinking;

        this._syncUiState();
        this._requestRebuild({ preserveCamera: true });
    }

    _setHoveredLayer(layerId) {
        const id = typeof layerId === 'string' ? layerId : '';
        if (!id) return;

        const cfg = this._currentConfig;
        const layers = Array.isArray(cfg?.layers) ? cfg.layers : [];
        const isFloor = layers.some((layer) => layer?.type === 'floor' && layer?.id === id);
        if (!isFloor) return;

        this.scene.setActiveFaceLayerId?.(id);

        const selectedFaceId = this._getSelectedFaceId();
        if (selectedFaceId) {
            this._setSelectedFace(id, selectedFaceId);
        }
    }

    _setHoveredLayerHighlight(layerId) {
        const id = typeof layerId === 'string' ? layerId : '';
        if (!id) {
            this.scene.setHoveredFloorLayerId?.(null);
            return;
        }

        const cfg = this._currentConfig;
        const layers = Array.isArray(cfg?.layers) ? cfg.layers : [];
        const isFloor = layers.some((layer) => layer?.type === 'floor' && layer?.id === id);
        this.scene.setHoveredFloorLayerId?.(isFloor ? id : null);
    }

    _setHideFaceMarkEnabled(enabled) {
        this._hideFaceMarkEnabled = !!enabled;
        this._syncFaceHighlightSuppression();
    }

    _setShowDummyEnabled(enabled) {
        this._showDummyEnabled = !!enabled;
        this.scene?.setShowDummy?.(this._showDummyEnabled);
    }

    _setRulerEnabled(enabled) {
        const next = !!enabled;
        if (next === this._rulerEnabled) return;
        this._rulerEnabled = next;

        const canvas = this.engine?.canvas ?? null;
        if (canvas) canvas.style.cursor = next ? 'crosshair' : '';

        this.ui.setRulerEnabled(next);

        this._rulerPointerDown = null;
        this._rulerPointerMoved = false;

        if (!next) {
            this._clearRulerMeasurement();
            return;
        }

        this._clearRulerMeasurement();
    }

    _clearRulerMeasurement() {
        this._rulerPointA = null;
        this._rulerPointB = null;
        this._rulerFixed = false;
        this.scene?.setRulerSegment?.(null, null);
        this.ui.setRulerLabel({ visible: false });
    }

    _setRulerPointerFromEvent(event) {
        const canvas = this.engine?.canvas ?? null;
        if (!canvas || !event || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;

        const rect = canvas.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) return false;
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        this._rulerPointer.set(x * 2 - 1, -(y * 2 - 1));
        return true;
    }

    _handleRulerPointerDown(event) {
        if (!this._rulerEnabled) return;
        if (!event || event.button !== 0) return;
        this._rulerPointerDown = { x: event.clientX, y: event.clientY };
        this._rulerPointerMoved = false;
    }

    _handleRulerPointerMove(event) {
        if (!this._rulerEnabled) return;
        if (!event) return;

        if (this._rulerPointerDown) {
            const dx = event.clientX - this._rulerPointerDown.x;
            const dy = event.clientY - this._rulerPointerDown.y;
            if (dx * dx + dy * dy > 25) this._rulerPointerMoved = true;
        }

        if (!this._rulerPointA || this._rulerFixed) return;
        if (!this._setRulerPointerFromEvent(event)) return;

        const hit = this.scene?.raycastSurface?.(this._rulerPointer) ?? null;
        if (!hit) {
            if (this._rulerPointB) {
                this._rulerPointB = null;
                this.scene?.setRulerSegment?.(null, null);
                this.ui.setRulerLabel({ visible: false });
            }
            return;
        }

        this._rulerPointB = hit;
        this.scene?.setRulerSegment?.(this._rulerPointA, this._rulerPointB);
        this._syncRulerOverlay();
    }

    _handleRulerPointerUp(event) {
        if (!this._rulerEnabled) return;
        if (!event || event.button !== 0) return;

        const moved = this._rulerPointerMoved;
        this._rulerPointerDown = null;
        this._rulerPointerMoved = false;
        if (moved) return;

        if (this._rulerFixed) return;
        if (!this._setRulerPointerFromEvent(event)) return;

        const hit = this.scene?.raycastSurface?.(this._rulerPointer) ?? null;
        if (!hit) return;

        if (!this._rulerPointA) {
            this._rulerPointA = hit;
            this._rulerPointB = null;
            this.scene?.setRulerSegment?.(null, null);
            this.ui.setRulerLabel({ visible: false });
            return;
        }

        this._rulerPointB = hit;
        this._rulerFixed = true;
        this.scene?.setRulerSegment?.(this._rulerPointA, this._rulerPointB);
        this._syncRulerOverlay();
    }

    _handleRulerPointerLeave() {
        this._rulerPointerDown = null;
        this._rulerPointerMoved = false;

        if (!this._rulerEnabled) return;
        if (!this._rulerPointA || this._rulerFixed) return;
        if (!this._rulerPointB) return;

        this._rulerPointB = null;
        this.scene?.setRulerSegment?.(null, null);
        this.ui.setRulerLabel({ visible: false });
    }

    _syncRulerOverlay() {
        const a = this._rulerPointA;
        const b = this._rulerPointB;
        if (!this._rulerEnabled || !a || !b) return;

        const canvas = this.engine?.canvas ?? null;
        const camera = this.engine?.camera ?? null;
        if (!canvas || !camera) return;

        const rect = canvas.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) return;

        this._rulerMidpoint.copy(a).add(b).multiplyScalar(0.5);
        this._rulerProject.copy(this._rulerMidpoint).project(camera);

        const x = rect.left + (this._rulerProject.x * 0.5 + 0.5) * rect.width;
        const y = rect.top + (-this._rulerProject.y * 0.5 + 0.5) * rect.height;
        const visible = this._rulerProject.z >= -1 && this._rulerProject.z <= 1;
        const dist = a.distanceTo(b);
        this.ui.setRulerLabel({ visible, x, y, text: `${dist.toFixed(2)}m` });
    }

    _syncFaceHighlightSuppression() {
        const suppressed = this._hideFaceMarkEnabled && this._pointerInViewport;
        this.scene.setFaceHighlightSuppressed?.(suppressed);
    }

    _exportCurrentConfig() {
        if (!this.scene.getHasBuilding()) return;
        const cfg = this._currentConfig;
        if (!cfg) return;

        const rawLayers = Array.isArray(cfg.layers) ? cfg.layers : null;
        if (!Array.isArray(rawLayers) || !rawLayers.length) return;
        const baseWallMaterial = normalizeMaterialSpec(cfg?.baseWallMaterial ?? null);
        const layers = baseWallMaterial
            ? rawLayers.map((layer) => {
                if (layer?.type !== 'floor') return layer;
                const has = !!normalizeMaterialSpec(layer?.material ?? null);
                return has ? layer : { ...layer, material: baseWallMaterial };
            })
            : rawLayers;

        const defaultName = this.ui.getBuildingName() || cfg.name || cfg.id || 'Building config';
        const name = sanitizeBuildingConfigName(defaultName, { fallback: cfg.name || cfg.id || 'Building config' });

        const suggestedId = sanitizeBuildingConfigId(cfg.id || name);
        const idRaw = window.prompt('Export building config id (used as configId):', suggestedId);
        if (idRaw === null) return;
        const exportId = sanitizeBuildingConfigId(idRaw, { fallback: suggestedId });

        const wallInset = Number.isFinite(cfg.wallInset) ? cfg.wallInset : 0.0;
        const materialVariationSeed = Number.isFinite(cfg.materialVariationSeed) ? cfg.materialVariationSeed : null;
        const windowVisuals = cfg?.windowVisuals ?? null;
        const exported = createCityBuildingConfigFromFabrication({
            id: exportId,
            name,
            layers,
            wallInset,
            materialVariationSeed,
            windowVisuals,
            facades: cfg?.facades ?? null,
            windowDefinitions: cfg?.windowDefinitions ?? null
        });

        const fileBaseName = buildingConfigIdToFileBaseName(exported.id);
        const source = serializeCityBuildingConfigToEsModule(exported, { fileBaseName });

        const blob = new Blob([source], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileBaseName}.js`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 250);
    }

    _handleKeyDown(e) {
        if (!e) return;

        if (!isTextEditingElement(e.target) && !isTextEditingElement(document.activeElement)) {
            if (e.key === 'l' || e.key === 'L') {
                e.preventDefault();
                this._openLoadBrowser();
                return;
            }
        }

        this._handleCameraKey(e, true);
    }

    _handleKeyUp(e) {
        this._handleCameraKey(e, false);
    }

    _handleCameraKey(e, isDown) {
        const code = e?.code;
        if (!code || !(code in this._keys)) return;
        if (isDown) {
            if (isTextEditingElement(e.target) || isTextEditingElement(document.activeElement)) return;
            e.preventDefault();
            this._keys[code] = true;
            return;
        }

        this._keys[code] = false;
    }

    _updateCameraFromKeys(dt) {
        const camera = this.scene?.camera;
        const controls = this.scene?.controls;
        if (!controls?.panWorld || !camera || !controls.enabled) return;
        if (isTextEditingElement(document.activeElement)) return;

        const up = this._keys.ArrowUp ? 1 : 0;
        const down = this._keys.ArrowDown ? 1 : 0;
        const left = this._keys.ArrowLeft ? 1 : 0;
        const right = this._keys.ArrowRight ? 1 : 0;

        const forwardSign = up - down;
        const rightSign = right - left;
        if (!forwardSign && !rightSign) return;

        camera.getWorldDirection(this._moveForward);
        this._moveForward.y = 0;
        const len = this._moveForward.length();
        if (len < 1e-6) return;
        this._moveForward.multiplyScalar(1 / len);

        this._moveRight.crossVectors(this._moveForward, UP);
        const rLen = this._moveRight.length();
        if (rLen < 1e-6) return;
        this._moveRight.multiplyScalar(1 / rLen);

        this._moveDir.set(0, 0, 0);
        this._moveDir.addScaledVector(this._moveForward, forwardSign);
        this._moveDir.addScaledVector(this._moveRight, rightSign);
        const dLen = this._moveDir.length();
        if (dLen < 1e-6) return;
        this._moveDir.multiplyScalar(1 / dLen);

        const dist = camera.position.distanceTo(controls.target);
        const baseSpeed = Math.max(10, dist * 0.6);
        const isFast = this._keys.ShiftLeft || this._keys.ShiftRight;
        const speed = baseSpeed * (isFast ? 2.5 : 1.0);
        const delta = speed * Math.max(0.001, Number(dt) || 0);

        controls.panWorld(this._moveDir.x * delta, 0, this._moveDir.z * delta);
    }

    _clearKeys() {
        for (const k of Object.keys(this._keys)) this._keys[k] = false;
    }
}
