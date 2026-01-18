// src/graphics/gui/inspector_room/InspectorRoomView.js
// Orchestrates UI, input, and 3D rendering for the unified Inspector Room.
import * as THREE from 'three';
import { InspectorRoomScene } from './InspectorRoomScene.js';
import { InspectorRoomMeshesProvider } from './InspectorRoomMeshesProvider.js';
import { InspectorRoomTexturesProvider } from './InspectorRoomTexturesProvider.js';
import { InspectorRoomUI } from './InspectorRoomUI.js';
import { lightHexIntToHueTone, lightHueToneToHexInt } from './InspectorRoomLightUtils.js';
import { computeBoundsSize, formatMeters } from './InspectorRoomMeasurementUtils.js';

const STORAGE_KEY = 'bus_sim.inspector_room.v1';
const UP = new THREE.Vector3(0, 1, 0);

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

function readStoredSelection() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        const mode = parsed?.mode === 'textures' ? 'textures' : 'meshes';
        const meshes = parsed?.meshes && typeof parsed.meshes === 'object' ? parsed.meshes : {};
        const textures = parsed?.textures && typeof parsed.textures === 'object' ? parsed.textures : {};
        const light = parsed?.light && typeof parsed.light === 'object' ? parsed.light : null;
        return {
            mode,
            meshes: {
                collectionId: typeof meshes.collectionId === 'string' ? meshes.collectionId : null,
                itemId: typeof meshes.itemId === 'string' ? meshes.itemId : null
            },
            textures: {
                collectionId: typeof textures.collectionId === 'string' ? textures.collectionId : null,
                itemId: typeof textures.itemId === 'string' ? textures.itemId : null
            },
            light
        };
    } catch {
        return null;
    }
}

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function sanitizeStoredLight(light, { fallbackHueDegrees = 0 } = {}) {
    const src = light && typeof light === 'object' ? light : null;
    if (!src) return null;

    const x = Number(src.x);
    const y = Number(src.y);
    const z = Number(src.z);
    const enabled = src.enabled !== undefined ? !!src.enabled : undefined;
    const markerEnabled = src.markerEnabled !== undefined ? !!src.markerEnabled : undefined;
    const intensity = Number(src.intensity);

    const hueRaw = Number(src.colorHueDegrees ?? src.hueDegrees ?? src.hue);
    const toneRaw = Number(src.colorTone ?? src.tone);
    const hexRaw = Number(src.colorHex ?? src.hex ?? src.color);

    let colorHueDegrees = Number.isFinite(hueRaw) ? clamp(hueRaw, 0, 360) : null;
    let colorTone = Number.isFinite(toneRaw) ? clamp(toneRaw, -1, 1) : null;
    let colorHex = Number.isFinite(hexRaw) ? (hexRaw >>> 0) : null;

    if (!(colorHueDegrees !== null && colorTone !== null) && colorHex !== null) {
        const next = lightHexIntToHueTone(colorHex, { fallbackHueDegrees });
        colorHueDegrees = next.hueDegrees;
        colorTone = next.tone;
    }

    if (colorHueDegrees !== null && colorTone !== null) {
        colorHex = lightHueToneToHexInt(colorHueDegrees, colorTone);
    }

    const payload = {};
    if (Number.isFinite(x)) payload.x = x;
    if (Number.isFinite(y)) payload.y = y;
    if (Number.isFinite(z)) payload.z = z;
    if (enabled !== undefined) payload.enabled = enabled;
    if (markerEnabled !== undefined) payload.markerEnabled = markerEnabled;
    if (Number.isFinite(intensity)) payload.intensity = clamp(intensity, 0, 4);
    if (colorHueDegrees !== null) payload.colorHueDegrees = colorHueDegrees;
    if (colorTone !== null) payload.colorTone = colorTone;
    if (colorHex !== null) payload.colorHex = colorHex;

    return Object.keys(payload).length ? payload : null;
}

function writeStoredSelection({ mode, meshes, textures, light }) {
    if (typeof window === 'undefined') return;
    const storage = window.localStorage;
    if (!storage) return;
    const sanitizedLight = sanitizeStoredLight(light, { fallbackHueDegrees: 0 });
    const payload = {
        mode: mode === 'textures' ? 'textures' : 'meshes',
        meshes: {
            collectionId: typeof meshes?.collectionId === 'string' ? meshes.collectionId : null,
            itemId: typeof meshes?.itemId === 'string' ? meshes.itemId : null
        },
        textures: {
            collectionId: typeof textures?.collectionId === 'string' ? textures.collectionId : null,
            itemId: typeof textures?.itemId === 'string' ? textures.itemId : null
        },
        light: sanitizedLight
    };
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
        // ignore
    }
}

export class InspectorRoomView {
    constructor(engine) {
        this.engine = engine;
        this.canvas = engine.canvas;

        this.room = new InspectorRoomScene(engine);
        this.ui = new InspectorRoomUI();

        this.meshes = new InspectorRoomMeshesProvider(engine);
        this.textures = new InspectorRoomTexturesProvider(engine, this.room);

        this._active = null;
        this._mode = 'meshes';

        this._raycaster = new THREE.Raycaster();
        this._pointer = new THREE.Vector2();
        this._hoverInfo = null;
        this._selectedInfo = null;
        this._measureBox = new THREE.Box3();
        this._scratchVec = new THREE.Vector3();
        this._lightMapForward = new THREE.Vector3();
        this._lightMapRight = new THREE.Vector3();

        this._pointerDown = null;
        this._pointerMoved = false;

        const stored = readStoredSelection();
        this._selection = stored ?? {
            mode: 'meshes',
            meshes: { collectionId: null, itemId: null },
            textures: { collectionId: null, itemId: null },
            light: null
        };

        this.onExit = null;

        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onContextMenu = (e) => this._handleContextMenu(e);
        this._onPointerMove = (e) => this._handlePointerMove(e);
        this._onPointerDown = (e) => this._handlePointerDown(e);
        this._onPointerUp = (e) => this._handlePointerUp(e);
        this._onPointerLeave = () => this._handlePointerLeave();

        this._persistLightTimer = null;
    }

    enter() {
        this.room.enter();
        this.ui.mount();
        this.room.setUiRoot(this.ui.root);

        const storedLight = sanitizeStoredLight(this._selection.light, { fallbackHueDegrees: 0 });
        if (storedLight) {
            this._selection.light = storedLight;
            this.room.setLightPosition(storedLight);
            if (storedLight.markerEnabled !== undefined) this.room.setLightMarkerVisible(storedLight.markerEnabled);
            if (storedLight.enabled !== undefined) this.room.setLightEnabled(storedLight.enabled);
            if (Number.isFinite(Number(storedLight.intensity))) this.room.setLightIntensity(storedLight.intensity);
            if (Number.isFinite(Number(storedLight.colorHex))) this.room.setLightColorHex(storedLight.colorHex);
        }

        this.ui.onModeChange = (mode) => this._setMode(mode, { user: true });
        this.ui.onCollectionChange = (collectionId) => this._setCollection(collectionId);
        this.ui.onItemChange = (itemId) => this._setItem(itemId);
        this.ui.onItemPrev = () => this._setItemIndex(this._getActiveItemIndex() - 1);
        this.ui.onItemNext = () => this._setItemIndex(this._getActiveItemIndex() + 1);

        this.ui.onWireframeChange = (enabled) => {
            if (this._active !== this.meshes) return;
            this.meshes.setWireframeEnabled(enabled);
            this.ui.setWireframeEnabled(this.meshes.getWireframeEnabled());
        };
        this.ui.onEdgesChange = (enabled) => {
            if (this._active !== this.meshes) return;
            this.meshes.setEdgesEnabled(enabled);
            this.ui.setEdgesEnabled(this.meshes.getEdgesEnabled());
        };
        this.ui.onPivotChange = (enabled) => {
            if (this._active !== this.meshes) return;
            this.meshes.setPivotEnabled(enabled);
            this.ui.setPivotEnabled(this.meshes.getPivotEnabled());
        };
        this.ui.onColorModeChange = (mode) => {
            if (this._active !== this.meshes) return;
            this.meshes.setColorMode(mode);
            this.ui.setColorMode(this.meshes.getColorMode());
        };

        this.ui.onBaseColorChange = (baseId) => {
            if (this._active !== this.textures) return;
            this.ui.setBaseColorId(baseId);
            this.textures.setBaseColorHex(this.ui.getBaseColorHex());
            this.room.setPlaneBaseColor(this.textures.getBaseColorHex());
        };
        this.ui.onPreviewModeChange = (modeId) => {
            if (this._active !== this.textures) return;
            this.textures.setPreviewModeId(modeId);
            this.ui.setPreviewModeId(this.textures.getPreviewModeId());
            this._syncFocusToRoom({ instantCamera: false, fitCamera: false, keepCamera: true });
        };
        this.ui.onTextureSizeChange = ({ widthMeters, heightMeters } = {}) => {
            if (this._active !== this.textures) return;
            this.textures.setSelectedRealWorldSizeMeters({ widthMeters, heightMeters });
            this.ui.setTextureRealWorldSizeMeters(this.textures.getSelectedRealWorldSizeMeters());
            this._syncFocusToRoom({ instantCamera: false, fitCamera: false, keepCamera: true });
        };
        this.ui.onTileGapChange = (gap) => {
            if (this._active !== this.textures) return;
            this.textures.setTileGap(gap);
            this.ui.setTileGap(this.textures.getTileGap());
        };

        this.ui.onAxisLabelsToggle = () => this._syncViewportOverlays();
        this.ui.onMeasurementsToggle = () => this._syncViewportOverlays();
        this.ui.onAxisLinesToggle = (enabled) => {
            this.room.setAxisLinesVisible(enabled);
            this.ui.setAxisLegendState({ axisLinesEnabled: this.room.getAxisLinesVisible() });
        };
        this.ui.onAxisAlwaysVisibleToggle = (enabled) => {
            this.room.setAxisAlwaysVisible(enabled);
            this.ui.setAxisLegendState({ axesAlwaysVisible: this.room.getAxisAlwaysVisible() });
        };
        this.ui.onGridToggle = (enabled) => {
            this.room.setGridVisible(enabled);
            this.ui.setAxisLegendState({ gridEnabled: this.room.getGridVisible() });
        };
        this.ui.onPlaneToggle = (enabled) => {
            this.room.setPlaneVisible(enabled);
            this.ui.setAxisLegendState({ planeEnabled: this.room.getPlaneVisible() });
        };

        this.ui.onLightChange = (light) => {
            this.room.setLightPosition(light);
            this._schedulePersistLight();
        };
        this.ui.onLightMarkerToggle = (enabled) => {
            this.room.setLightMarkerVisible(enabled);
            this.ui.setLightState({ markerEnabled: this.room.getLightMarkerVisible() });
            this._persistLightFromUi();
        };
        this.ui.onLightEnabledToggle = (enabled) => {
            this.room.setLightEnabled(enabled);
            this.ui.setLightState({ enabled: this.room.getLightEnabled() });
            this._persistLightFromUi();
        };
        this.ui.onLightIntensityChange = (intensity) => {
            this.room.setLightIntensity(intensity);
            this.ui.setLightState({ intensity: this.room.getLightIntensity() });
            this._persistLightFromUi();
        };
        this.ui.onLightColorChange = (hex) => {
            this.room.setLightColorHex(hex);
            this.ui.setLightState({ colorHex: this.room.getLightColorHex() });
            this._persistLightFromUi();
        };

        this.ui.onCameraPreset = (presetId) => {
            this.room.setCameraPreset(presetId, { duration: 0.26, instant: false });
        };

        this._setMode(this._selection.mode ?? 'meshes', { user: false, instantCamera: true });

        const lightPos = this.room.getLightPosition();
        const colorHex = this.room.getLightColorHex();
        const lightColorFallbackHue = storedLight?.colorHueDegrees ?? 0;
        const derivedColor = lightHexIntToHueTone(colorHex, { fallbackHueDegrees: lightColorFallbackHue });
        this.ui.setLightState({
            x: lightPos.x,
            y: lightPos.y,
            z: lightPos.z,
            markerEnabled: this.room.getLightMarkerVisible(),
            enabled: this.room.getLightEnabled(),
            intensity: this.room.getLightIntensity(),
            colorHex,
            colorHueDegrees: storedLight?.colorHueDegrees ?? derivedColor.hueDegrees,
            colorTone: storedLight?.colorTone ?? derivedColor.tone,
            range: 10
        });

        if (storedLight) this._persistLightFromUi();

        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        this.canvas.addEventListener('contextmenu', this._onContextMenu, { passive: false });
        this.canvas.addEventListener('pointermove', this._onPointerMove, { passive: true });
        this.canvas.addEventListener('pointerdown', this._onPointerDown, { passive: true });
        this.canvas.addEventListener('pointerup', this._onPointerUp, { passive: true });
        this.canvas.addEventListener('pointerleave', this._onPointerLeave, { passive: true });
    }

    exit() {
        if (this._persistLightTimer !== null) {
            clearTimeout(this._persistLightTimer);
            this._persistLightTimer = null;
        }

        window.removeEventListener('keydown', this._onKeyDown);
        this.canvas.removeEventListener('contextmenu', this._onContextMenu);
        this.canvas.removeEventListener('pointermove', this._onPointerMove);
        this.canvas.removeEventListener('pointerdown', this._onPointerDown);
        this.canvas.removeEventListener('pointerup', this._onPointerUp);
        this.canvas.removeEventListener('pointerleave', this._onPointerLeave);

        this.ui.onModeChange = null;
        this.ui.onCollectionChange = null;
        this.ui.onItemChange = null;
        this.ui.onItemPrev = null;
        this.ui.onItemNext = null;
        this.ui.onWireframeChange = null;
        this.ui.onEdgesChange = null;
        this.ui.onPivotChange = null;
        this.ui.onColorModeChange = null;
        this.ui.onBaseColorChange = null;
        this.ui.onPreviewModeChange = null;
        this.ui.onTextureSizeChange = null;
        this.ui.onTileGapChange = null;
        this.ui.onAxisLabelsToggle = null;
        this.ui.onAxisLinesToggle = null;
        this.ui.onAxisAlwaysVisibleToggle = null;
        this.ui.onGridToggle = null;
        this.ui.onPlaneToggle = null;
        this.ui.onMeasurementsToggle = null;
        this.ui.onLightChange = null;
        this.ui.onLightMarkerToggle = null;
        this.ui.onLightEnabledToggle = null;
        this.ui.onLightIntensityChange = null;
        this.ui.onLightColorChange = null;
        this.ui.onCameraPreset = null;

        this.ui.unmount();
        this.room.setUiRoot(null);

        this.meshes.dispose();
        this.textures.dispose();
        this.room.dispose();

        this._clearMeshSelection();
    }

    update(dt) {
        this.room.update(dt);
        this.meshes.update();
        this.textures.update();
        this._syncLightMapBasis();
        this._syncViewportOverlays();
    }

    _syncLightMapBasis() {
        const camera = this.engine?.camera ?? null;
        if (!camera) return;
        this._lightMapForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
        this._lightMapForward.y = 0;
        const len = this._lightMapForward.lengthSq();
        if (len <= 1e-6) return;
        this._lightMapForward.multiplyScalar(1 / Math.sqrt(len));
        this._lightMapRight.crossVectors(this._lightMapForward, UP);
        const rLen = this._lightMapRight.lengthSq();
        if (rLen <= 1e-6) return;
        this._lightMapRight.multiplyScalar(1 / Math.sqrt(rLen));

        this.ui.setLightMapBasis({
            rightX: this._lightMapRight.x,
            rightZ: this._lightMapRight.z,
            forwardX: this._lightMapForward.x,
            forwardZ: this._lightMapForward.z
        });
    }

    _syncViewportOverlays() {
        const rect = this.canvas.getBoundingClientRect();
        const camera = this.engine?.camera ?? null;
        if (!camera || !rect?.width || !rect?.height) return;

        const axisState = this.ui.getAxisLegendState();
        const endpoints = this.room.getAxisEndpoints?.() ?? null;
        const showAxisLabels = !!axisState.labelsEnabled && !!axisState.axisLinesEnabled && !!endpoints;

        const project = (pt) => {
            this._scratchVec.set(Number(pt?.x) || 0, Number(pt?.y) || 0, Number(pt?.z) || 0);
            this._scratchVec.project(camera);
            const nx = this._scratchVec.x;
            const ny = this._scratchVec.y;
            const nz = this._scratchVec.z;
            const visible = nx >= -1 && nx <= 1 && ny >= -1 && ny <= 1 && nz >= -1 && nz <= 1;
            return {
                x: rect.left + (nx * 0.5 + 0.5) * rect.width,
                y: rect.top + (-ny * 0.5 + 0.5) * rect.height,
                visible
            };
        };

        if (showAxisLabels) {
            this.ui.setViewportAxisLabelPositions({
                xn: project(endpoints.xn),
                xp: project(endpoints.xp),
                yn: project(endpoints.yn),
                yp: project(endpoints.yp),
                zn: project(endpoints.zn),
                zp: project(endpoints.zp)
            });
        } else {
            this.ui.setViewportAxisLabelPositions(null);
        }

        const measurementsEnabled = !!axisState.measurementsEnabled;
        if (!measurementsEnabled) {
            this.room.setMeasurementOverlay?.({ enabled: false });
            this.ui.setViewportMeasurementLabelPositions(null);
            return;
        }

        const target = this._active?.getMeasurementObject3d?.() ?? null;
        if (!target) {
            this.room.setMeasurementOverlay?.({ enabled: false });
            this.ui.setViewportMeasurementLabelPositions(null);
            return;
        }

        target.updateWorldMatrix(true, true);
        this._measureBox.setFromObject(target);
        if (this._measureBox.isEmpty()) {
            this.room.setMeasurementOverlay?.({ enabled: false });
            this.ui.setViewportMeasurementLabelPositions(null);
            return;
        }

        const mode = this._mode === 'textures' ? 'xz' : 'xyz';
        this.room.setMeasurementOverlay?.({ enabled: true, mode, bounds: { min: this._measureBox.min, max: this._measureBox.max } });

        const size = computeBoundsSize({ min: this._measureBox.min, max: this._measureBox.max });
        const min = this._measureBox.min;
        const max = this._measureBox.max;

        const xMid = { x: (min.x + max.x) * 0.5, y: max.y, z: max.z };
        const zMid = { x: max.x, y: max.y, z: (min.z + max.z) * 0.5 };
        const yMid = { x: max.x, y: (min.y + max.y) * 0.5, z: max.z };

        const xPos = project(xMid);
        const yPos = project(yMid);
        const zPos = project(zMid);

        this.ui.setViewportMeasurementLabelPositions({
            x: { ...xPos, text: formatMeters(size?.x), visible: xPos.visible && Number.isFinite(size?.x) },
            y: { ...yPos, text: formatMeters(size?.y), visible: mode === 'xyz' && yPos.visible && Number.isFinite(size?.y) },
            z: { ...zPos, text: formatMeters(size?.z), visible: zPos.visible && Number.isFinite(size?.z) }
        });
    }

    _handleKeyDown(e) {
        const code = e.code;
        const key = e.key;
        if (code === 'Escape' || key === 'Escape') {
            e.preventDefault();
            this.onExit?.();
        }
    }

    _handleContextMenu(e) {
        e.preventDefault();
    }

    _setMode(modeId, { user = false, instantCamera = false } = {}) {
        const next = modeId === 'textures' ? 'textures' : 'meshes';
        if (next === this._mode && this._active) return;
        this._mode = next;
        this._selection.mode = next;

        if (this._active) this._active.unmount();

        const provider = next === 'textures' ? this.textures : this.meshes;
        this._active = provider;
        const cfg = provider.getRoomConfig?.() ?? null;
        if (cfg) this.room.configureRoom(cfg);

        provider.mount(this.room.getContentRoot());

        this.ui.setMode(next);
        this._syncGlobalTogglesToUi();
        this._syncSelectionFromStored(provider);
        this._syncActiveControls();
        this._syncFocusToRoom({ instantCamera, fitCamera: true, keepCamera: false });

        if (user) this._persistSelection();
        this._clearMeshSelection();
    }

    _syncSelectionFromStored(provider) {
        const mode = provider === this.textures ? 'textures' : 'meshes';
        const stored = this._selection?.[mode] ?? {};

        const collections = provider.getCollectionOptions?.() ?? [];
        const desiredCollection = stored.collectionId;
        const resolvedCollection = collections.find((c) => c?.id === desiredCollection)?.id ?? collections[0]?.id ?? null;
        if (resolvedCollection && provider.setSelectedCollectionId) provider.setSelectedCollectionId(resolvedCollection);

        const items = provider === this.textures ? provider.getTextureOptions?.() : provider.getMeshOptions?.();
        const desiredItem = stored.itemId;
        const resolvedItem = (items ?? []).find((it) => it?.id === desiredItem)?.id ?? (items ?? [])[0]?.id ?? null;
        if (resolvedItem) {
            if (provider === this.textures) provider.setSelectedTextureId(resolvedItem);
            else provider.setSelectedMeshId(resolvedItem);
        }

        this.ui.setCollectionOptions(provider.getCollectionOptions?.() ?? []);
        this.ui.setSelectedCollectionId(provider.getSelectedCollectionId?.() ?? null);

        if (provider === this.textures) {
            this.ui.setItemOptions(provider.getTextureOptions?.() ?? []);
            this.ui.setSelectedItemId(provider.getSelectedTextureId?.() ?? null);
            this.ui.setSelectedItemMeta(provider.getSelectedTextureMeta?.() ?? {});
            this.ui.setTextureRealWorldSizeMeters(provider.getSelectedRealWorldSizeMeters?.() ?? {});
        } else {
            this.ui.setItemOptions(provider.getMeshOptions?.() ?? []);
            this.ui.setSelectedItemId(provider.getSelectedMeshId?.() ?? null);
            this.ui.setSelectedItemMeta(provider.getSelectedMeshMeta?.() ?? {});
        }

        this._selection[mode] = {
            collectionId: provider.getSelectedCollectionId?.() ?? null,
            itemId: provider === this.textures ? (provider.getSelectedTextureId?.() ?? null) : (provider.getSelectedMeshId?.() ?? null)
        };

        this._persistSelection();
    }

    _persistSelection() {
        writeStoredSelection(this._selection);
    }

    _persistLightFromUi() {
        const state = this.ui.getLightState();
        const round = (value, digits) => {
            const v = Number(value);
            if (!Number.isFinite(v)) return null;
            const d = Number(digits);
            if (!Number.isFinite(d) || d < 0) return v;
            const f = Math.pow(10, Math.floor(d));
            return Math.round(v * f) / f;
        };

        const x = round(state?.x, 3);
        const y = round(state?.y, 3);
        const z = round(state?.z, 3);
        const intensity = round(clamp(state?.intensity, 0, 4), 2);
        const hueDegrees = Math.round(clamp(state?.colorHueDegrees, 0, 360));
        const tone = Math.round(clamp(state?.colorTone, -1, 1) * 100) / 100;
        const colorHex = lightHueToneToHexInt(hueDegrees, tone);

        this._selection.light = {
            ...(x !== null ? { x } : {}),
            ...(y !== null ? { y } : {}),
            ...(z !== null ? { z } : {}),
            enabled: !!state?.enabled,
            markerEnabled: !!state?.markerEnabled,
            intensity: intensity ?? 1.2,
            colorHueDegrees: hueDegrees,
            colorTone: tone,
            colorHex
        };

        this._persistSelection();
    }

    _schedulePersistLight() {
        if (this._persistLightTimer !== null) clearTimeout(this._persistLightTimer);
        this._persistLightTimer = setTimeout(() => {
            this._persistLightTimer = null;
            this._persistLightFromUi();
        }, 175);
    }

    _syncGlobalTogglesToUi() {
        this.ui.setAxisLegendState({
            axisLinesEnabled: this.room.getAxisLinesVisible(),
            axesAlwaysVisible: this.room.getAxisAlwaysVisible(),
            gridEnabled: this.room.getGridVisible(),
            planeEnabled: this.room.getPlaneVisible()
        });
    }

    _syncActiveControls() {
        if (this._active === this.meshes) {
            this.ui.setWireframeEnabled(this.meshes.getWireframeEnabled());
            this.ui.setEdgesEnabled(this.meshes.getEdgesEnabled());
            this.ui.setPivotEnabled(this.meshes.getPivotEnabled());
            this.ui.setColorMode(this.meshes.getColorMode());
            this.ui.setPrefabParams(this.meshes.getPrefabParamsApi?.() ?? null);
            this.ui.setRig(this.meshes.getRigApi?.() ?? null);
            this.ui.setHoverInfo(null);
            this.ui.setSelectedInfo(null);
        }

        if (this._active === this.textures) {
            this.ui.setBaseColorId('white');
            this.textures.setBaseColorHex(this.ui.getBaseColorHex());
            this.ui.setPreviewModeId('single');
            this.textures.setPreviewModeId(this.ui.getPreviewModeId());
            this.ui.setTextureRealWorldSizeMeters(this.textures.getSelectedRealWorldSizeMeters());
            this.ui.setTileGap(0.0);
            this.textures.setTileGap(0.0);
        }
    }

    _syncFocusToRoom({ instantCamera = false, fitCamera = false, keepCamera = false } = {}) {
        const bounds = this._active?.getFocusBounds?.() ?? null;
        if (bounds) this.room.setFocusBounds(bounds, { keepCamera: !!keepCamera });
        if (fitCamera) this.room.setCameraPreset('free', { duration: 0.26, instant: !!instantCamera });
    }

    _setCollection(collectionId) {
        const provider = this._active;
        if (!provider) return;

        provider.setSelectedCollectionId?.(collectionId);

        this.ui.setSelectedCollectionId(provider.getSelectedCollectionId?.() ?? null);

        if (provider === this.textures) {
            this.ui.setItemOptions(provider.getTextureOptions?.() ?? []);
            this.ui.setSelectedItemId(provider.getSelectedTextureId?.() ?? null);
            this.ui.setSelectedItemMeta(provider.getSelectedTextureMeta?.() ?? {});
            this.ui.setTextureRealWorldSizeMeters(provider.getSelectedRealWorldSizeMeters?.() ?? {});
            this._selection.textures = {
                collectionId: provider.getSelectedCollectionId?.() ?? null,
                itemId: provider.getSelectedTextureId?.() ?? null
            };
        } else {
            this.ui.setItemOptions(provider.getMeshOptions?.() ?? []);
            this.ui.setSelectedItemId(provider.getSelectedMeshId?.() ?? null);
            this.ui.setSelectedItemMeta(provider.getSelectedMeshMeta?.() ?? {});
            this.ui.setPrefabParams(provider.getPrefabParamsApi?.() ?? null);
            this.ui.setRig(provider.getRigApi?.() ?? null);
            this._selection.meshes = {
                collectionId: provider.getSelectedCollectionId?.() ?? null,
                itemId: provider.getSelectedMeshId?.() ?? null
            };
        }

        this._persistSelection();
        this._clearMeshSelection();
    }

    _setItem(itemId) {
        const provider = this._active;
        if (!provider) return;

        if (provider === this.textures) {
            provider.setSelectedTextureId?.(itemId);
            this.ui.setSelectedCollectionId(provider.getSelectedCollectionId?.() ?? null);
            this.ui.setItemOptions(provider.getTextureOptions?.() ?? []);
            this.ui.setSelectedItemId(provider.getSelectedTextureId?.() ?? null);
            this.ui.setSelectedItemMeta(provider.getSelectedTextureMeta?.() ?? {});
            this.ui.setTextureRealWorldSizeMeters(provider.getSelectedRealWorldSizeMeters?.() ?? {});
            this._selection.textures = {
                collectionId: provider.getSelectedCollectionId?.() ?? null,
                itemId: provider.getSelectedTextureId?.() ?? null
            };
        } else {
            provider.setSelectedMeshId?.(itemId);
            this.ui.setSelectedCollectionId(provider.getSelectedCollectionId?.() ?? null);
            this.ui.setItemOptions(provider.getMeshOptions?.() ?? []);
            this.ui.setSelectedItemId(provider.getSelectedMeshId?.() ?? null);
            this.ui.setSelectedItemMeta(provider.getSelectedMeshMeta?.() ?? {});
            this.ui.setPrefabParams(provider.getPrefabParamsApi?.() ?? null);
            this.ui.setRig(provider.getRigApi?.() ?? null);
            this._selection.meshes = {
                collectionId: provider.getSelectedCollectionId?.() ?? null,
                itemId: provider.getSelectedMeshId?.() ?? null
            };
        }

        this._persistSelection();
        this._syncFocusToRoom({ instantCamera: false, fitCamera: false, keepCamera: true });
        this._clearMeshSelection();
    }

    _setItemIndex(index) {
        const provider = this._active;
        if (!provider) return;

        if (provider === this.textures) {
            provider.setSelectedTextureIndex?.(index);
            this.ui.setSelectedItemId(provider.getSelectedTextureId?.() ?? null);
            this.ui.setSelectedItemMeta(provider.getSelectedTextureMeta?.() ?? {});
            this.ui.setTextureRealWorldSizeMeters(provider.getSelectedRealWorldSizeMeters?.() ?? {});
            this._selection.textures.itemId = provider.getSelectedTextureId?.() ?? null;
        } else {
            provider.setSelectedMeshIndex?.(index);
            this.ui.setSelectedItemId(provider.getSelectedMeshId?.() ?? null);
            this.ui.setSelectedItemMeta(provider.getSelectedMeshMeta?.() ?? {});
            this.ui.setPrefabParams(provider.getPrefabParamsApi?.() ?? null);
            this.ui.setRig(provider.getRigApi?.() ?? null);
            this._selection.meshes.itemId = provider.getSelectedMeshId?.() ?? null;
        }

        this._persistSelection();
        this._syncFocusToRoom({ instantCamera: false, fitCamera: false, keepCamera: true });
        this._clearMeshSelection();
    }

    _getActiveItemIndex() {
        const provider = this._active;
        if (!provider) return 0;
        return provider === this.textures
            ? (provider.getSelectedTextureIndex?.() ?? 0)
            : (provider.getSelectedMeshIndex?.() ?? 0);
    }

    _clearMeshSelection() {
        this._hoverInfo = null;
        this._selectedInfo = null;
        this.ui.setHoverInfo(null);
        this.ui.setSelectedInfo(null);
    }

    _setPointerFromEvent(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        this._pointer.set(x * 2 - 1, -(y * 2 - 1));
    }

    _pickRegionInfo(event) {
        if (this._active !== this.meshes) return null;
        const mesh = this.meshes.getPickMesh?.() ?? null;
        if (!mesh) return null;

        this._setPointerFromEvent(event);
        this._raycaster.setFromCamera(this._pointer, this.engine.camera);
        const hits = this._raycaster.intersectObject(mesh, true);
        if (!hits.length) return null;
        return this.meshes.getRegionInfoFromIntersection(hits[0]);
    }

    _handlePointerMove(event) {
        if (!event || isInteractiveElement(event.target)) return;
        if (this._active !== this.meshes) return;

        if (this._pointerDown) {
            const dx = event.clientX - this._pointerDown.x;
            const dy = event.clientY - this._pointerDown.y;
            if (dx * dx + dy * dy > 25) this._pointerMoved = true;
        }

        const info = this._pickRegionInfo(event);
        const changed = (info?.regionId ?? null) !== (this._hoverInfo?.regionId ?? null);
        if (changed) {
            this._hoverInfo = info;
            this.ui.setHoverInfo(info);
        }
    }

    _handlePointerDown(event) {
        if (!event || isInteractiveElement(event.target)) return;
        if (this._active !== this.meshes) return;
        this._pointerDown = { x: event.clientX, y: event.clientY };
        this._pointerMoved = false;
    }

    _handlePointerUp(event) {
        if (!event || isInteractiveElement(event.target)) return;
        if (this._active !== this.meshes) return;
        if (!this._pointerDown) return;

        const moved = this._pointerMoved;
        this._pointerDown = null;
        this._pointerMoved = false;
        if (moved) return;

        const info = this._pickRegionInfo(event);
        this._selectedInfo = info;
        this.ui.setSelectedInfo(info);
    }

    _handlePointerLeave() {
        this._pointerDown = null;
        this._pointerMoved = false;
        this._hoverInfo = null;
        this.ui.setHoverInfo(null);
    }
}
