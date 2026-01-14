// src/graphics/gui/inspector_room/InspectorRoomView.js
// Orchestrates UI, input, and 3D rendering for the unified Inspector Room.
import * as THREE from 'three';
import { InspectorRoomScene } from './InspectorRoomScene.js';
import { InspectorRoomMeshesProvider } from './InspectorRoomMeshesProvider.js';
import { InspectorRoomTexturesProvider } from './InspectorRoomTexturesProvider.js';
import { InspectorRoomUI } from './InspectorRoomUI.js';

const STORAGE_KEY = 'bus_sim.inspector_room.v1';

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
        return {
            mode,
            meshes: {
                collectionId: typeof meshes.collectionId === 'string' ? meshes.collectionId : null,
                itemId: typeof meshes.itemId === 'string' ? meshes.itemId : null
            },
            textures: {
                collectionId: typeof textures.collectionId === 'string' ? textures.collectionId : null,
                itemId: typeof textures.itemId === 'string' ? textures.itemId : null
            }
        };
    } catch {
        return null;
    }
}

function writeStoredSelection({ mode, meshes, textures }) {
    if (typeof window === 'undefined') return;
    const storage = window.localStorage;
    if (!storage) return;
    const payload = {
        mode: mode === 'textures' ? 'textures' : 'meshes',
        meshes: {
            collectionId: typeof meshes?.collectionId === 'string' ? meshes.collectionId : null,
            itemId: typeof meshes?.itemId === 'string' ? meshes.itemId : null
        },
        textures: {
            collectionId: typeof textures?.collectionId === 'string' ? textures.collectionId : null,
            itemId: typeof textures?.itemId === 'string' ? textures.itemId : null
        }
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

        this._pointerDown = null;
        this._pointerMoved = false;

        const stored = readStoredSelection();
        this._selection = stored ?? {
            mode: 'meshes',
            meshes: { collectionId: null, itemId: null },
            textures: { collectionId: null, itemId: null }
        };

        this.onExit = null;

        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onContextMenu = (e) => this._handleContextMenu(e);
        this._onPointerMove = (e) => this._handlePointerMove(e);
        this._onPointerDown = (e) => this._handlePointerDown(e);
        this._onPointerUp = (e) => this._handlePointerUp(e);
        this._onPointerLeave = () => this._handlePointerLeave();
    }

    enter() {
        this.room.enter();
        this.ui.mount();

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
        };
        this.ui.onTileGapChange = (gap) => {
            if (this._active !== this.textures) return;
            this.textures.setTileGap(gap);
            this.ui.setTileGap(this.textures.getTileGap());
        };

        this.ui.onAxisLabelsToggle = () => {};
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
        };
        this.ui.onLightMarkerToggle = (enabled) => {
            this.room.setLightMarkerVisible(enabled);
            this.ui.setLightState({ markerEnabled: this.room.getLightMarkerVisible() });
        };

        this.ui.onCameraPreset = (presetId) => {
            this.room.setCameraPreset(presetId, { duration: 0.26, instant: false });
        };

        this._setMode(this._selection.mode ?? 'meshes', { user: false, instantCamera: true });

        const lightPos = this.room.getLightPosition();
        this.ui.setLightState({ x: lightPos.x, y: lightPos.y, z: lightPos.z, markerEnabled: this.room.getLightMarkerVisible(), range: 10 });

        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        this.canvas.addEventListener('contextmenu', this._onContextMenu, { passive: false });
        this.canvas.addEventListener('pointermove', this._onPointerMove, { passive: true });
        this.canvas.addEventListener('pointerdown', this._onPointerDown, { passive: true });
        this.canvas.addEventListener('pointerup', this._onPointerUp, { passive: true });
        this.canvas.addEventListener('pointerleave', this._onPointerLeave, { passive: true });
    }

    exit() {
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
        this.ui.onTileGapChange = null;
        this.ui.onAxisLabelsToggle = null;
        this.ui.onAxisLinesToggle = null;
        this.ui.onAxisAlwaysVisibleToggle = null;
        this.ui.onGridToggle = null;
        this.ui.onPlaneToggle = null;
        this.ui.onLightChange = null;
        this.ui.onLightMarkerToggle = null;
        this.ui.onCameraPreset = null;

        this.ui.unmount();

        this.meshes.dispose();
        this.textures.dispose();
        this.room.dispose();

        this._clearMeshSelection();
    }

    update(dt) {
        this.room.update(dt);
        this.meshes.update();
        this.textures.update();
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
        const hits = this._raycaster.intersectObject(mesh, false);
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
