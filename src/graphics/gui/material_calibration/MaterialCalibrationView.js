// src/graphics/gui/material_calibration/MaterialCalibrationView.js
// Orchestrates UI, input, and 3D rendering for the Material Calibration tool.
import * as THREE from 'three';
import { getPbrMaterialClassOptions, getPbrMaterialOptions } from '../../content3d/catalogs/PbrMaterialCatalog.js';
import { MaterialCalibrationScene } from './MaterialCalibrationScene.js';
import { MaterialCalibrationUI } from './MaterialCalibrationUI.js';
import { getMaterialCalibrationIlluminationPresetById } from './MaterialCalibrationIlluminationPresets.js';

const UP = new THREE.Vector3(0, 1, 0);

const STORAGE_KEY = 'bus_sim.material_calibration.v1';

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

function isTextEditingElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    if (target?.isContentEditable) return true;
    if (tag === 'TEXTAREA') return true;
    if (tag !== 'INPUT') return false;

    const type = String(target.type ?? '').toLowerCase();
    if (!type) return true;
    return (
        type === 'text'
        || type === 'search'
        || type === 'email'
        || type === 'password'
        || type === 'url'
        || type === 'tel'
        || type === 'number'
    );
}

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function sanitizeSlotIndex(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const idx = Math.round(n);
    if (idx < 0 || idx > 2) return null;
    return idx;
}

function sanitizeClassId(value, { fallback = null } = {}) {
    const typed = typeof value === 'string' ? value.trim() : '';
    if (!typed) return fallback;
    const options = getPbrMaterialClassOptions();
    return options.some((o) => o?.id === typed) ? typed : fallback;
}

function sanitizeMaterialId(value) {
    const typed = typeof value === 'string' ? value.trim() : '';
    return typed ? typed : null;
}

function sanitizeLayoutMode(value) {
    const typed = typeof value === 'string' ? value.trim() : '';
    if (typed === 'full' || typed === 'panel' || typed === 'sphere') return typed;
    return 'full';
}

function sanitizeTilingMode(value) {
    const typed = typeof value === 'string' ? value.trim() : '';
    if (typed === 'default' || typed === '2x2') return typed;
    return 'default';
}

function sanitizeOverrides(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return {};

    const out = {};
    if (Number.isFinite(Number(src.tileMeters))) out.tileMeters = Math.max(1e-6, Number(src.tileMeters));
    if (Number.isFinite(Number(src.normalStrength))) out.normalStrength = clamp(src.normalStrength, 0, 8);
    if (Number.isFinite(Number(src.roughness))) out.roughness = clamp(src.roughness, 0, 1);
    if (Number.isFinite(Number(src.metalness))) out.metalness = clamp(src.metalness, 0, 1);
    if (Number.isFinite(Number(src.aoIntensity))) out.aoIntensity = clamp(src.aoIntensity, 0, 2);
    if (Number.isFinite(Number(src.albedoBrightness))) out.albedoBrightness = clamp(src.albedoBrightness, 0, 4);
    if (Number.isFinite(Number(src.albedoTintStrength))) out.albedoTintStrength = clamp(src.albedoTintStrength, 0, 1);
    if (Number.isFinite(Number(src.albedoHueDegrees))) out.albedoHueDegrees = clamp(src.albedoHueDegrees, -180, 180);
    if (Number.isFinite(Number(src.albedoSaturation))) out.albedoSaturation = clamp(src.albedoSaturation, -1, 1);
    return out;
}

function readStoredState() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        const selectedClassId = sanitizeClassId(parsed?.selectedClassId, { fallback: null });
        const illuminationPresetId = typeof parsed?.illuminationPresetId === 'string' ? parsed.illuminationPresetId : null;
        const layoutMode = sanitizeLayoutMode(parsed?.layoutMode);
        const tilingMode = sanitizeTilingMode(parsed?.tilingMode);
        const activeSlotIndex = sanitizeSlotIndex(parsed?.activeSlotIndex) ?? 0;

        const slotMaterialIdsRaw = Array.isArray(parsed?.slotMaterialIds) ? parsed.slotMaterialIds : [];
        const slotMaterialIds = [0, 1, 2].map((i) => sanitizeMaterialId(slotMaterialIdsRaw[i]));

        const baselineMaterialId = sanitizeMaterialId(parsed?.baselineMaterialId);

        const overridesRaw = parsed?.overridesByMaterialId && typeof parsed.overridesByMaterialId === 'object'
            ? parsed.overridesByMaterialId
            : null;
        const overridesByMaterialId = {};
        if (overridesRaw) {
            for (const [materialId, overrides] of Object.entries(overridesRaw)) {
                const id = sanitizeMaterialId(materialId);
                if (!id) continue;
                const clean = sanitizeOverrides(overrides);
                if (Object.keys(clean).length) overridesByMaterialId[id] = clean;
            }
        }

        return {
            selectedClassId,
            illuminationPresetId,
            layoutMode,
            tilingMode,
            activeSlotIndex,
            slotMaterialIds,
            baselineMaterialId,
            overridesByMaterialId
        };
    } catch {
        return null;
    }
}

function writeStoredState(state) {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch {
        return false;
    }
}

export class MaterialCalibrationView {
    constructor(engine) {
        this.engine = engine;
        this.scene = new MaterialCalibrationScene(engine);
        this.ui = new MaterialCalibrationUI();

        this.onExit = null;

        const stored = readStoredState();

        const classOptions = getPbrMaterialClassOptions();
        const defaultClassId = classOptions[0]?.id ?? null;
        const selectedClassId = stored?.selectedClassId ?? defaultClassId;

        this._state = {
            selectedClassId,
            illuminationPresetId: stored?.illuminationPresetId ?? 'neutral',
            layoutMode: stored?.layoutMode ?? 'full',
            tilingMode: stored?.tilingMode ?? 'default',
            activeSlotIndex: stored?.activeSlotIndex ?? 0,
            slotMaterialIds: Array.isArray(stored?.slotMaterialIds) ? stored.slotMaterialIds.slice(0, 3) : [null, null, null],
            baselineMaterialId: stored?.baselineMaterialId ?? null,
            overridesByMaterialId: stored?.overridesByMaterialId && typeof stored.overridesByMaterialId === 'object'
                ? { ...stored.overridesByMaterialId }
                : {}
        };

        this._materialOptions = getPbrMaterialOptions()
            .filter((opt) => !!opt?.id)
            .map((opt) => ({
                id: String(opt.id),
                label: String(opt.label ?? opt.id),
                previewUrl: opt.previewUrl ?? null,
                classId: opt.classId ?? null
            }))
            .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));

        this._rulerEnabled = false;
        this._rulerPointA = null;
        this._rulerPointB = null;
        this._rulerFixed = false;
        this._rulerPointer = new THREE.Vector2();
        this._rulerMidpoint = new THREE.Vector3();
        this._rulerProject = new THREE.Vector3();
        this._rulerPointerDown = null;
        this._rulerPointerMoved = false;

        this._lmbPointerDown = null;
        this._lmbPointerMoved = false;

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

        this._onCanvasPointerMove = (e) => this._handlePointerMove(e);
        this._onCanvasPointerDown = (e) => this._handlePointerDown(e);
        this._onCanvasPointerUp = (e) => this._handlePointerUp(e);
        this._onCanvasPointerCancel = (e) => this._handlePointerUp(e);

        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onKeyUp = (e) => this._handleKeyUp(e);
    }

    enter() {
        this.scene.enter();
        this.ui.mount();
        this.scene.setUiRoot(this.ui.root);

        this._syncUiStatic();
        this._syncSceneFromState({ keepCamera: false });
        this._syncUiFromState();

        this.ui.onExit = () => this.onExit?.();
        this.ui.onSelectClass = (classId) => this._setSelectedClass(classId);
        this.ui.onToggleMaterial = (materialId) => this._toggleMaterial(materialId, { focus: false });
        this.ui.onFocusMaterial = (materialId) => this._toggleMaterial(materialId, { focus: true });
        this.ui.onFocusSlot = (slotIndex) => this._focusSlot(slotIndex, { keepOrbit: true });
        this.ui.onSetLayoutMode = (layoutMode) => this._setLayoutMode(layoutMode);
        this.ui.onSetTilingMode = (tilingMode) => this._setTilingMode(tilingMode);
        this.ui.onSelectIlluminationPreset = (presetId) => this._setIlluminationPreset(presetId);
        this.ui.onSetBaselineMaterial = (materialId) => this._setBaselineMaterial(materialId);
        this.ui.onSetOverrides = (materialId, overrides) => this._setMaterialOverrides(materialId, overrides);
        this.ui.onToggleRuler = (enabled) => this._setRulerEnabled(enabled);

        const canvas = this.engine?.canvas ?? null;
        canvas?.addEventListener?.('pointermove', this._onCanvasPointerMove, { passive: true });
        canvas?.addEventListener?.('pointerdown', this._onCanvasPointerDown, { passive: true });
        canvas?.addEventListener?.('pointerup', this._onCanvasPointerUp, { passive: true });
        canvas?.addEventListener?.('pointercancel', this._onCanvasPointerCancel, { passive: true });

        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        window.addEventListener('keyup', this._onKeyUp, { passive: false });
    }

    exit() {
        const canvas = this.engine?.canvas ?? null;
        canvas?.removeEventListener?.('pointermove', this._onCanvasPointerMove);
        canvas?.removeEventListener?.('pointerdown', this._onCanvasPointerDown);
        canvas?.removeEventListener?.('pointerup', this._onCanvasPointerUp);
        canvas?.removeEventListener?.('pointercancel', this._onCanvasPointerCancel);

        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        this._clearKeys();

        this._setRulerEnabled(false);
        this.scene?.clearRuler?.();
        this.ui?.setRulerLabel?.({ visible: false });

        this.ui.onExit = null;
        this.ui.onSelectClass = null;
        this.ui.onToggleMaterial = null;
        this.ui.onFocusMaterial = null;
        this.ui.onFocusSlot = null;
        this.ui.onSetLayoutMode = null;
        this.ui.onSetTilingMode = null;
        this.ui.onSelectIlluminationPreset = null;
        this.ui.onSetBaselineMaterial = null;
        this.ui.onSetOverrides = null;
        this.ui.onToggleRuler = null;

        this.ui.unmount();
        this.scene.exit();
    }

    update(dt) {
        this.scene.update(dt);
        this._updateCameraFromKeys(dt);
        this._syncRulerOverlay();
    }

    _persist() {
        const state = this._state;
        const payload = {
            selectedClassId: state.selectedClassId,
            illuminationPresetId: state.illuminationPresetId,
            layoutMode: state.layoutMode,
            tilingMode: state.tilingMode,
            activeSlotIndex: state.activeSlotIndex,
            slotMaterialIds: state.slotMaterialIds.slice(0, 3),
            baselineMaterialId: state.baselineMaterialId,
            overridesByMaterialId: state.overridesByMaterialId
        };
        writeStoredState(payload);
    }

    _syncUiStatic() {
        this.ui.setClassOptions(getPbrMaterialClassOptions());
        this.ui.setMaterialOptions(this._materialOptions);
        this.ui.setIlluminationPresetOptions(getMaterialCalibrationIlluminationPresetById('neutral') ? null : null);
        this.ui.setIlluminationPresetOptions?.(null);
    }

    _syncSceneFromState({ keepCamera = true } = {}) {
        const state = this._state;
        this.scene.setLayoutMode(state.layoutMode);
        this.scene.setTilingMultiplier(state.tilingMode === '2x2' ? 2.0 : 1.0);
        this.scene.setActiveSlotIndex(state.activeSlotIndex);
        this.scene.applyIlluminationPreset(state.illuminationPresetId);

        for (let i = 0; i < 3; i++) {
            const id = sanitizeMaterialId(state.slotMaterialIds[i]);
            const overrides = id ? (state.overridesByMaterialId[id] ?? null) : null;
            this.scene.setSlotMaterial(i, id, { overrides });
        }

        if (!keepCamera) this.scene.focusSlot(state.activeSlotIndex, { keepOrbit: false, immediate: true });
    }

    _syncUiFromState() {
        const state = this._state;

        this.ui.setSelectedClassId(state.selectedClassId);
        this.ui.setLayoutMode(state.layoutMode);
        this.ui.setTilingMode(state.tilingMode);
        this.ui.setIlluminationPresetId(state.illuminationPresetId);
        this.ui.setSelectedMaterials({
            slotMaterialIds: state.slotMaterialIds.slice(0, 3),
            activeSlotIndex: state.activeSlotIndex,
            baselineMaterialId: state.baselineMaterialId
        });

        const activeMaterialId = sanitizeMaterialId(state.slotMaterialIds[state.activeSlotIndex]);
        this.ui.setActiveMaterial({
            materialId: activeMaterialId,
            overrides: activeMaterialId ? (state.overridesByMaterialId[activeMaterialId] ?? null) : null
        });

        this.ui.setRulerEnabled(this._rulerEnabled);
    }

    _setSelectedClass(classId) {
        const next = sanitizeClassId(classId, { fallback: this._state.selectedClassId });
        if (!next || next === this._state.selectedClassId) return;
        this._state.selectedClassId = next;
        this._syncUiFromState();
        this._persist();
    }

    _ensureBaselineAndActive() {
        const state = this._state;
        const selected = state.slotMaterialIds.filter(Boolean);
        const baseline = sanitizeMaterialId(state.baselineMaterialId);
        if (!baseline || !selected.includes(baseline)) state.baselineMaterialId = selected[0] ?? null;

        const activeIdx = sanitizeSlotIndex(state.activeSlotIndex) ?? 0;
        const activeMat = sanitizeMaterialId(state.slotMaterialIds[activeIdx]);
        if (!activeMat && selected.length) {
            const firstIdx = state.slotMaterialIds.findIndex(Boolean);
            state.activeSlotIndex = firstIdx >= 0 ? firstIdx : 0;
        }
    }

    _toggleMaterial(materialId, { focus = false } = {}) {
        const id = sanitizeMaterialId(materialId);
        if (!id) return;

        const state = this._state;
        const existingSlot = state.slotMaterialIds.findIndex((v) => v === id);
        if (existingSlot >= 0) {
            if (focus) {
                this._focusSlot(existingSlot, { keepOrbit: true });
                return;
            }
            state.slotMaterialIds[existingSlot] = null;
            if (state.activeSlotIndex === existingSlot) {
                state.activeSlotIndex = 0;
            }
            this._ensureBaselineAndActive();
            this._applyStateToSceneAndUi({ keepCamera: true });
            return;
        }

        const emptySlot = state.slotMaterialIds.findIndex((v) => !sanitizeMaterialId(v));
        const targetSlot = emptySlot >= 0 ? emptySlot : (sanitizeSlotIndex(state.activeSlotIndex) ?? 0);

        state.slotMaterialIds[targetSlot] = id;
        state.activeSlotIndex = targetSlot;
        this._ensureBaselineAndActive();
        this._applyStateToSceneAndUi({ keepCamera: true });
        if (focus) this._focusSlot(targetSlot, { keepOrbit: true });
    }

    _applyStateToSceneAndUi({ keepCamera = true } = {}) {
        this._syncSceneFromState({ keepCamera });
        this._syncUiFromState();
        this._persist();
    }

    _focusSlot(slotIndex, { keepOrbit = true } = {}) {
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return;
        this.scene.focusSlot(idx, { keepOrbit: !!keepOrbit });
    }

    _setLayoutMode(layoutMode) {
        const next = sanitizeLayoutMode(layoutMode);
        if (next === this._state.layoutMode) return;
        this._state.layoutMode = next;
        this._applyStateToSceneAndUi({ keepCamera: true });
    }

    _setTilingMode(tilingMode) {
        const next = sanitizeTilingMode(tilingMode);
        if (next === this._state.tilingMode) return;
        this._state.tilingMode = next;
        this._applyStateToSceneAndUi({ keepCamera: true });
    }

    _setIlluminationPreset(presetId) {
        const preset = getMaterialCalibrationIlluminationPresetById(presetId);
        if (!preset) return;
        if (preset.id === this._state.illuminationPresetId) return;
        this._state.illuminationPresetId = preset.id;
        this._applyStateToSceneAndUi({ keepCamera: true });
    }

    _setBaselineMaterial(materialId) {
        const id = sanitizeMaterialId(materialId);
        if (!id) return;
        const selected = this._state.slotMaterialIds.filter(Boolean);
        if (!selected.includes(id)) return;
        if (id === this._state.baselineMaterialId) return;
        this._state.baselineMaterialId = id;
        this._syncUiFromState();
        this._persist();
    }

    _setMaterialOverrides(materialId, overrides) {
        const id = sanitizeMaterialId(materialId);
        if (!id) return;
        const clean = sanitizeOverrides(overrides);
        if (Object.keys(clean).length) this._state.overridesByMaterialId[id] = clean;
        else delete this._state.overridesByMaterialId[id];

        const slotIdx = this.scene.getSlotIndexForMaterialId(id);
        if (slotIdx !== null) {
            this.scene.setSlotMaterial(slotIdx, id, { overrides: this._state.overridesByMaterialId[id] ?? null });
        }
        this._syncUiFromState();
        this._persist();
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

    _setPointerNdcFromEvent(event, outVec2) {
        const canvas = this.engine?.canvas ?? null;
        if (!canvas || !event || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
        const rect = canvas.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) return false;
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        outVec2.set(x * 2 - 1, -(y * 2 - 1));
        return true;
    }

    _handlePointerDown(event) {
        if (!event) return;
        if (event.button !== 0) return;
        this._lmbPointerDown = { x: event.clientX, y: event.clientY };
        this._lmbPointerMoved = false;

        if (!this._rulerEnabled) return;
        this._rulerPointerDown = { x: event.clientX, y: event.clientY };
        this._rulerPointerMoved = false;
    }

    _handlePointerMove(event) {
        if (!event) return;

        if (this._lmbPointerDown) {
            const dx = event.clientX - this._lmbPointerDown.x;
            const dy = event.clientY - this._lmbPointerDown.y;
            if (dx * dx + dy * dy > 25) this._lmbPointerMoved = true;
        }

        if (!this._rulerEnabled) return;

        if (this._rulerPointerDown) {
            const dx = event.clientX - this._rulerPointerDown.x;
            const dy = event.clientY - this._rulerPointerDown.y;
            if (dx * dx + dy * dy > 25) this._rulerPointerMoved = true;
        }

        if (!this._rulerPointA || this._rulerFixed) return;
        if (!this._setPointerNdcFromEvent(event, this._rulerPointer)) return;

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

    _handlePointerUp(event) {
        if (!event || event.button !== 0) return;

        const moved = this._lmbPointerMoved;
        this._lmbPointerDown = null;
        this._lmbPointerMoved = false;

        if (this._rulerEnabled) {
            const rulerMoved = this._rulerPointerMoved;
            this._rulerPointerDown = null;
            this._rulerPointerMoved = false;
            if (rulerMoved) return;

            if (this._rulerFixed) return;
            if (!this._setPointerNdcFromEvent(event, this._rulerPointer)) return;
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
            return;
        }

        if (moved) return;
        if (isInteractiveElement(event.target) || isInteractiveElement(document.activeElement)) return;
        if (!this._setPointerNdcFromEvent(event, this._rulerPointer)) return;
        const slotIndex = this.scene.pickSlot(this._rulerPointer);
        if (slotIndex === null) return;

        this._state.activeSlotIndex = slotIndex;
        this.scene.setActiveSlotIndex(slotIndex);
        this._ensureBaselineAndActive();
        this._syncUiFromState();
        this._persist();
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

    _handleKeyDown(e) {
        const code = e.code;
        const key = e.key;

        if (code === 'Escape' || key === 'Escape') {
            e.preventDefault();
            this.onExit?.();
            return;
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

