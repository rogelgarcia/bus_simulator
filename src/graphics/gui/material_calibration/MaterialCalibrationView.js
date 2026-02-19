// src/graphics/gui/material_calibration/MaterialCalibrationView.js
// Orchestrates UI, input, and 3D rendering for the Material Calibration tool.
import * as THREE from 'three';
import { getPbrMaterialClassOptions, getPbrMaterialOptions, getPbrMaterialTileMeters } from '../../content3d/catalogs/PbrMaterialCatalog.js';
import { MaterialCalibrationScene } from './MaterialCalibrationScene.js';
import { MaterialCalibrationUI } from './MaterialCalibrationUI.js';
import { getMaterialCalibrationIlluminationPresetById, getMaterialCalibrationIlluminationPresetOptions } from './MaterialCalibrationIlluminationPresets.js';

const UP = new THREE.Vector3(0, 1, 0);

const STORAGE_KEY = 'bus_sim.material_calibration.v3';
const SLOT_CAMERA_FOCUS_DISTANCE_SCALE = 2.35;
const SCREENSHOT_SLOT_FOCUS_DISTANCE_SCALE = 1.95;
const SCREENSHOT_CAPTURE_WIDTH = 1280;
const SCREENSHOT_CAPTURE_HEIGHT = 720;
const SCREENSHOT_REPORT_WIDTH = 1920;
const SCREENSHOT_REPORT_HEIGHT = 1280;
const SCREENSHOT_RENDER_SCALE = 2.0;
const SCREENSHOT_RENDER_MIN_WIDTH = 1920;
const SCREENSHOT_RENDER_MIN_HEIGHT = 1080;
const SCREENSHOT_RENDER_MAX_WIDTH = 3840;
const SCREENSHOT_RENDER_MAX_HEIGHT = 2160;
const CALIBRATION_PRESET_ID = 'aces';
const CORRECTION_CONFIG_FILE = 'pbr.material.correction.config.js';
const PBR_ID_PREFIX = 'pbr.';
const PBR_CORRECTION_BASE_URL = new URL('../../../../assets/public/pbr/', import.meta.url);

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

function sanitizeOptionalSlotIndex(value) {
    if (value === null || value === undefined || value === '') return null;
    return sanitizeSlotIndex(value);
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

function sanitizeCalibrationMode(value) {
    const typed = typeof value === 'string' ? value.trim() : '';
    if (typed === 'raw' || typed === 'calibrated') return typed;
    return 'calibrated';
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
    if (src.roughnessRemap && typeof src.roughnessRemap === 'object') {
        const rr = src.roughnessRemap;
        const min = Number(rr.min);
        const maxRaw = Number(rr.max);
        const gamma = Number(rr.gamma);
        const lowPercentile = Number(rr.lowPercentile);
        const highPercentile = Number(rr.highPercentile);
        const invertInput = rr.invertInput === true;
        if (Number.isFinite(min) && Number.isFinite(maxRaw) && Number.isFinite(gamma)) {
            const max = Math.max(min, maxRaw);
            out.roughnessRemap = {
                min: clamp(min, 0, 1),
                max: clamp(max, 0, 1),
                gamma: clamp(gamma, 0.1, 4),
                invertInput
            };
            if (Number.isFinite(lowPercentile) && Number.isFinite(highPercentile)) {
                const lo = clamp(lowPercentile, 0, 100);
                const hi = clamp(highPercentile, 0, 100);
                if (hi > lo) {
                    out.roughnessRemap.lowPercentile = lo;
                    out.roughnessRemap.highPercentile = hi;
                }
            }
        }
    }
    return out;
}

function materialIdToSlug(materialId) {
    const id = sanitizeMaterialId(materialId);
    if (!id) return null;
    if (!id.startsWith(PBR_ID_PREFIX)) return null;
    const slug = id.slice(PBR_ID_PREFIX.length).trim();
    if (!slug || slug.includes('/') || slug.includes('\\')) return null;
    return slug;
}

function toPlainObject(value) {
    return value && typeof value === 'object' ? value : null;
}

function mapCorrectionAdjustmentsToOverrides(adjustments) {
    const src = toPlainObject(adjustments);
    if (!src) return null;

    const out = {};

    const albedo = toPlainObject(src.albedo);
    if (albedo) {
        if (Number.isFinite(Number(albedo.brightness))) out.albedoBrightness = clamp(albedo.brightness, 0, 4);
        if (Number.isFinite(Number(albedo.hueDegrees))) out.albedoHueDegrees = clamp(albedo.hueDegrees, -180, 180);
        if (Number.isFinite(Number(albedo.tintStrength))) out.albedoTintStrength = clamp(albedo.tintStrength, 0, 1);
        if (Number.isFinite(Number(albedo.saturation))) out.albedoSaturation = clamp(Number(albedo.saturation) - 1, -1, 1);
    }

    const normal = toPlainObject(src.normal);
    if (normal && Number.isFinite(Number(normal.strength))) out.normalStrength = clamp(normal.strength, 0, 8);

    const roughness = toPlainObject(src.roughness);
    if (roughness) {
        const min = Number(roughness.min);
        const maxRaw = Number(roughness.max);
        const gamma = Number(roughness.gamma);
        const invertInput = roughness.invertInput === true;
        if (Number.isFinite(min) && Number.isFinite(maxRaw) && Number.isFinite(gamma)) {
            const max = Math.max(min, maxRaw);
            const roughnessRemap = {
                min: clamp(min, 0, 1),
                max: clamp(max, 0, 1),
                gamma: clamp(gamma, 0.1, 4),
                invertInput
            };
            const norm = Array.isArray(roughness.normalizeInputPercentiles) ? roughness.normalizeInputPercentiles : null;
            if (norm && norm.length === 2) {
                const lowPercentile = clamp(norm[0], 0, 100);
                const highPercentile = clamp(norm[1], 0, 100);
                if (highPercentile > lowPercentile) {
                    roughnessRemap.lowPercentile = lowPercentile;
                    roughnessRemap.highPercentile = highPercentile;
                }
            }
            out.roughnessRemap = roughnessRemap;
        } else if (Number.isFinite(Number(roughness.strength))) {
            out.roughness = clamp(roughness.strength, 0, 1);
        }
    }

    const ao = toPlainObject(src.ao);
    if (ao && Number.isFinite(Number(ao.intensity))) out.aoIntensity = clamp(ao.intensity, 0, 2);

    const metal = toPlainObject(src.metalness);
    if (metal && Number.isFinite(Number(metal.value))) out.metalness = clamp(metal.value, 0, 1);

    return Object.keys(out).length ? out : null;
}

function getCorrectionConfigUrlForMaterial(materialId) {
    const slug = materialIdToSlug(materialId);
    if (!slug) return null;
    return new URL(`${slug}/${CORRECTION_CONFIG_FILE}`, PBR_CORRECTION_BASE_URL).toString();
}

function getDefaultOverridesForMaterial(materialId) {
    const id = typeof materialId === 'string' ? materialId.trim() : '';
    if (!id) return null;
    return {
        tileMeters: getPbrMaterialTileMeters(id),
        albedoBrightness: 1.0,
        albedoTintStrength: 0.0,
        albedoHueDegrees: 0.0,
        albedoSaturation: 0.0,
        roughness: 1.0,
        normalStrength: 1.0,
        aoIntensity: 1.0,
        metalness: 0.0
    };
}

function normalizeRoughnessRemapForDiff(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return null;

    const minRaw = Number(src.min);
    const maxRaw = Number(src.max);
    const gammaRaw = Number(src.gamma);
    if (!(Number.isFinite(minRaw) && Number.isFinite(maxRaw) && Number.isFinite(gammaRaw))) return null;

    const out = {
        min: clamp(minRaw, 0, 1),
        max: clamp(Math.max(minRaw, maxRaw), 0, 1),
        gamma: clamp(gammaRaw, 0.1, 4),
        invertInput: src.invertInput === true,
        lowPercentile: 0,
        highPercentile: 100
    };

    const lowRaw = Number(src.lowPercentile);
    const highRaw = Number(src.highPercentile);
    if (Number.isFinite(lowRaw) && Number.isFinite(highRaw)) {
        const lo = clamp(lowRaw, 0, 100);
        const hi = clamp(highRaw, 0, 100);
        if (hi > lo) {
            out.lowPercentile = lo;
            out.highPercentile = hi;
        }
    }
    return out;
}

function areRoughnessRemapsEqual(a, b, eps = 1e-6) {
    const left = normalizeRoughnessRemapForDiff(a);
    const right = normalizeRoughnessRemapForDiff(b);
    if (!left && !right) return true;
    if (!left || !right) return false;
    if (left.invertInput !== right.invertInput) return false;
    return (
        Math.abs(left.min - right.min) <= eps
        && Math.abs(left.max - right.max) <= eps
        && Math.abs(left.gamma - right.gamma) <= eps
        && Math.abs(left.lowPercentile - right.lowPercentile) <= eps
        && Math.abs(left.highPercentile - right.highPercentile) <= eps
    );
}

function diffOverridesFromBaseline(baselineOverrides, overrides) {
    const base = sanitizeOverrides(baselineOverrides);
    const ovr = sanitizeOverrides(overrides);
    if (!Object.keys(ovr).length) return {};

    const out = {};
    const eps = 1e-6;
    const addIfDiff = (key) => {
        const value = ovr[key];
        const baselineValue = base[key];
        const v = Number(value);
        if (!Number.isFinite(v)) return;
        if (Number.isFinite(Number(baselineValue)) && Math.abs(v - Number(baselineValue)) <= eps) return;
        out[key] = v;
    };

    addIfDiff('tileMeters');
    addIfDiff('albedoBrightness');
    addIfDiff('albedoTintStrength');
    addIfDiff('albedoHueDegrees');
    addIfDiff('albedoSaturation');
    addIfDiff('roughness');
    addIfDiff('normalStrength');
    addIfDiff('aoIntensity');
    addIfDiff('metalness');

    const roughnessRemap = normalizeRoughnessRemapForDiff(ovr.roughnessRemap);
    if (roughnessRemap && !areRoughnessRemapsEqual(roughnessRemap, base.roughnessRemap)) {
        out.roughnessRemap = roughnessRemap;
    }

    return out;
}

function findNextEmptySlotAfter(slotMaterialIds, startIndex) {
    const list = Array.isArray(slotMaterialIds) ? slotMaterialIds : [];
    const start = sanitizeSlotIndex(startIndex);
    if (start === null) return null;
    for (let i = start + 1; i < 3; i++) {
        if (!sanitizeMaterialId(list[i])) return i;
    }
    return null;
}

function formatFixed(value, digits = 2, fallback = '-') {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return num.toFixed(digits);
}

function formatBool(value) {
    return value ? 'yes' : 'no';
}

function formatHexColor(value, fallback = '-') {
    const color = value?.isColor ? value : null;
    if (!color) return fallback;
    const hex = typeof color.getHexString === 'function' ? color.getHexString() : '';
    return hex ? `#${hex}` : fallback;
}

function getToneMappingLabel(renderer) {
    const mode = renderer?.toneMapping;
    if (mode === THREE.NoToneMapping) return 'none';
    if (mode === THREE.ACESFilmicToneMapping) return 'aces';
    if (THREE.AgXToneMapping !== undefined && mode === THREE.AgXToneMapping) return 'agx';
    if (THREE.NeutralToneMapping !== undefined && mode === THREE.NeutralToneMapping) return 'neutral';
    return String(mode ?? '-');
}

function getOutputColorSpaceLabel(renderer) {
    const colorSpace = renderer?.outputColorSpace;
    if (typeof colorSpace === 'string' && colorSpace) return colorSpace;
    const encoding = renderer?.outputEncoding;
    if (encoding === THREE.sRGBEncoding) return 'sRGBEncoding';
    return String(encoding ?? '-');
}

function makeCanvas(width, height) {
    const w = Math.max(1, Math.floor(Number(width) || 0));
    const h = Math.max(1, Math.floor(Number(height) || 0));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
}

function drawCanvasCover(ctx, source, x, y, width, height, { fill = '#090d12' } = {}) {
    const dstW = Math.max(1, Number(width) || 0);
    const dstH = Math.max(1, Number(height) || 0);
    const src = source && typeof source === 'object' ? source : null;
    const srcW = Number(src?.width);
    const srcH = Number(src?.height);

    ctx.fillStyle = fill;
    ctx.fillRect(x, y, dstW, dstH);

    if (!Number.isFinite(srcW) || !Number.isFinite(srcH) || srcW <= 0 || srcH <= 0) return;

    const scale = Math.max(dstW / srcW, dstH / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    const drawX = x + (dstW - drawW) * 0.5;
    const drawY = y + (dstH - drawH) * 0.5;
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, drawX, drawY, drawW, drawH);
}

function fitTextWithEllipsis(ctx, text, maxWidth) {
    const limit = Math.max(0, Number(maxWidth) || 0);
    const raw = typeof text === 'string' ? text : String(text ?? '');
    if (ctx.measureText(raw).width <= limit) return raw;
    if (limit <= 0) return '';
    const suffix = '…';
    if (ctx.measureText(suffix).width > limit) return '';
    let end = raw.length;
    while (end > 0) {
        const candidate = `${raw.slice(0, end)}${suffix}`;
        if (ctx.measureText(candidate).width <= limit) return candidate;
        end--;
    }
    return suffix;
}

function wrapTextLines(ctx, text, maxWidth) {
    const width = Math.max(0, Number(maxWidth) || 0);
    const lines = [];
    const paragraphs = String(text ?? '').split(/\r?\n/g);

    for (const paragraph of paragraphs) {
        const trimmed = paragraph.trim();
        if (!trimmed) {
            lines.push('');
            continue;
        }

        const words = trimmed.split(/\s+/g);
        let line = '';
        for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (!line || ctx.measureText(candidate).width <= width) {
                line = candidate;
                continue;
            }
            lines.push(line);
            if (ctx.measureText(word).width <= width) {
                line = word;
                continue;
            }

            let remainder = word;
            while (remainder.length > 0) {
                let cut = remainder.length;
                while (cut > 1 && ctx.measureText(remainder.slice(0, cut)).width > width) cut--;
                const part = remainder.slice(0, cut);
                if (!part) break;
                lines.push(part);
                remainder = remainder.slice(cut);
            }
            line = '';
        }
        if (line) lines.push(line);
    }

    return lines.length ? lines : [''];
}

function drawTextPanel(ctx, {
    x = 0,
    y = 0,
    width = 100,
    height = 100,
    title = '',
    lines = [],
    panelFill = 'rgba(5, 10, 16, 0.78)',
    panelStroke = 'rgba(173, 199, 226, 0.28)',
    titleColor = '#e9f2ff',
    textColor = '#d2ddea'
} = {}) {
    const px = Number(x) || 0;
    const py = Number(y) || 0;
    const pw = Math.max(1, Number(width) || 0);
    const ph = Math.max(1, Number(height) || 0);
    const innerPad = 12;

    ctx.fillStyle = panelFill;
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = panelStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

    const titleY = py + 20;
    ctx.fillStyle = titleColor;
    ctx.font = '600 16px Inter, system-ui, sans-serif';
    ctx.fillText(fitTextWithEllipsis(ctx, title, pw - innerPad * 2), px + innerPad, titleY);

    const contentTop = titleY + 14;
    const lineHeight = 15;
    const maxLines = Math.max(0, Math.floor((ph - (contentTop - py) - 10) / lineHeight));

    ctx.fillStyle = textColor;
    ctx.font = '400 13px Inter, system-ui, sans-serif';

    const flattened = [];
    for (const line of Array.isArray(lines) ? lines : []) {
        const wrapped = wrapTextLines(ctx, line, pw - innerPad * 2);
        for (const entry of wrapped) flattened.push(entry);
    }

    const visibleLines = flattened.slice(0, maxLines);
    if (flattened.length > visibleLines.length && visibleLines.length) {
        const lastIdx = visibleLines.length - 1;
        visibleLines[lastIdx] = fitTextWithEllipsis(ctx, `${visibleLines[lastIdx]} …`, pw - innerPad * 2);
    }

    let yy = contentTop;
    for (const line of visibleLines) {
        yy += lineHeight;
        ctx.fillText(line, px + innerPad, yy);
    }
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
        const illuminationPresetId = typeof parsed?.illuminationPresetId === 'string' ? parsed.illuminationPresetId.trim() : '';
        const layoutMode = sanitizeLayoutMode(parsed?.layoutMode);
        const tilingMode = sanitizeTilingMode(parsed?.tilingMode);
        const calibrationMode = sanitizeCalibrationMode(parsed?.calibrationMode);
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
            calibrationMode,
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
            illuminationPresetId: stored?.illuminationPresetId ?? '',
            layoutMode: stored?.layoutMode ?? 'full',
            tilingMode: stored?.tilingMode ?? 'default',
            calibrationMode: sanitizeCalibrationMode(stored?.calibrationMode ?? 'calibrated'),
            activeSlotIndex: 0,
            slotMaterialIds: [null, null, null],
            baselineMaterialId: null,
            overridesByMaterialId: {}
        };
        this._lastIlluminationStatus = null;

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
        this._selectedSlotCameraIndex = null;
        this._initialCameraPose = null;
        this._screenshotBusy = false;
        this._pendingCorrectionSync = false;
        this._correctionOverridesByMaterialId = {};
        this._correctionLoadToken = 0;
        this._lastCalibratedOverridesByMaterialId = {};
        this._rawToggleCalibrationSnapshot = null;

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
        this._selectedSlotCameraIndex = null;
        this.ui.setSelectedSlotCameraIndex?.(null);
        this._initialCameraPose = this._captureCurrentCameraPose();
        this._primeCorrectionOverridesForCatalog().catch(() => {});

        this.ui.onExit = () => this.onExit?.();
        this.ui.onSelectClass = (classId) => this._setSelectedClass(classId);
        this.ui.onToggleMaterial = (materialId) => this._toggleMaterial(materialId, { focus: false });
        this.ui.onFocusMaterial = (materialId) => this._toggleMaterial(materialId, { focus: true });
        this.ui.onFocusSlot = (slotIndex) => {
            const idx = sanitizeSlotIndex(slotIndex);
            if (idx === null) return;
            if (this._selectedSlotCameraIndex === idx) {
                this._selectedSlotCameraIndex = null;
                this.ui.setSelectedSlotCameraIndex?.(null);
                this._restoreInitialCameraPose();
                return;
            }
            this._selectedSlotCameraIndex = idx;
            this.ui.setSelectedSlotCameraIndex?.(idx);
            this._state.activeSlotIndex = idx;
            this.scene.setActiveSlotIndex(idx);
            this._syncUiFromState();
            this._persist();
            this._focusSlot(idx, { keepOrbit: true, zoomClose: true });
        };
        this.ui.onSetLayoutMode = (layoutMode) => this._setLayoutMode(layoutMode);
        this.ui.onSetTilingMode = (tilingMode) => this._setTilingMode(tilingMode);
        this.ui.onSetCalibrationMode = (calibrationMode) => this._setCalibrationMode(calibrationMode);
        this.ui.onSelectIlluminationPreset = (presetId) => this._setIlluminationPreset(presetId);
        this.ui.onSetBaselineMaterial = (materialId) => this._setBaselineMaterial(materialId);
        this.ui.onSetOverrides = (materialId, overrides) => this._setMaterialOverrides(materialId, overrides);
        this.ui.onToggleRuler = (enabled) => this._setRulerEnabled(enabled);
        this.ui.onRequestExport = () => {};
        this.ui.onRequestScreenshot = () => this._requestCalibrationScreenshot();
        this.ui.setScreenshotBusy?.(false);

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
        this.ui.onSetCalibrationMode = null;
        this.ui.onSelectIlluminationPreset = null;
        this.ui.onSetBaselineMaterial = null;
        this.ui.onSetOverrides = null;
        this.ui.onToggleRuler = null;
        this.ui.onRequestExport = null;
        this.ui.onRequestScreenshot = null;
        this.ui.setScreenshotBusy?.(false);
        this._selectedSlotCameraIndex = null;
        this._initialCameraPose = null;
        this._screenshotBusy = false;
        this._pendingCorrectionSync = false;
        this._correctionLoadToken += 1;
        this._correctionOverridesByMaterialId = {};
        this._lastCalibratedOverridesByMaterialId = {};
        this._rawToggleCalibrationSnapshot = null;

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
            calibrationMode: state.calibrationMode,
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
        this.ui.setIlluminationPresetOptions(getMaterialCalibrationIlluminationPresetOptions({ includeDefault: true }));
    }

    _syncSceneFromState({ keepCamera = true } = {}) {
        const state = this._state;
        let correctedInvalidPreset = false;
        this.scene.setLayoutMode(state.layoutMode);
        this.scene.setTilingMultiplier(state.tilingMode === '2x2' ? 2.0 : 1.0);
        this.scene.setActiveSlotIndex(state.activeSlotIndex);
        this._lastIlluminationStatus = this.scene.applyIlluminationPreset(state.illuminationPresetId);
        const reason = this._lastIlluminationStatus?.reason ?? null;
        if (state.illuminationPresetId && (reason === 'missing_preset' || reason === 'incomplete_preset')) {
            state.illuminationPresetId = '';
            correctedInvalidPreset = true;
        }

        for (let i = 0; i < 3; i++) {
            const id = sanitizeMaterialId(state.slotMaterialIds[i]);
            const overrides = this._getResolvedSceneOverridesForMaterial(id);
            this.scene.setSlotMaterial(i, id, { overrides });
        }

        if (!keepCamera) this.scene.focusSlot(state.activeSlotIndex, { keepOrbit: false, immediate: true });
        if (correctedInvalidPreset) this._persist();
    }

    _syncUiFromState() {
        const state = this._state;

        this.ui.setSelectedClassId(state.selectedClassId);
        this.ui.setLayoutMode(state.layoutMode);
        this.ui.setTilingMode(state.tilingMode);
        this.ui.setCalibrationMode(state.calibrationMode);
        this.ui.setIlluminationPresetId(state.illuminationPresetId);
        this.ui.setIlluminationStatus(this._lastIlluminationStatus ?? { mode: 'default', reason: null });
        this.ui.setSelectedMaterials({
            slotMaterialIds: state.slotMaterialIds.slice(0, 3),
            activeSlotIndex: state.activeSlotIndex,
            baselineMaterialId: state.baselineMaterialId
        });

        const activeMaterialId = sanitizeMaterialId(state.slotMaterialIds[state.activeSlotIndex]);
        this.ui.setActiveMaterial({
            materialId: activeMaterialId,
            overrides: this._getResolvedUiOverridesForMaterial(activeMaterialId)
        });

        this.ui.setRulerEnabled(this._rulerEnabled);
        this.ui.setSelectedSlotCameraIndex?.(this._selectedSlotCameraIndex);
    }

    _captureCurrentCameraPose() {
        const camera = this.scene?.camera ?? null;
        const controls = this.scene?.controls ?? null;
        if (!camera?.position?.isVector3 || !controls?.target?.isVector3) return null;

        const orbit = controls.getOrbit?.() ?? null;
        const radius = Number(orbit?.radius);
        const theta = Number(orbit?.theta);
        const phi = Number(orbit?.phi);
        const tx = Number(orbit?.target?.x);
        const ty = Number(orbit?.target?.y);
        const tz = Number(orbit?.target?.z);
        const safeOrbit = (
            Number.isFinite(radius)
            && Number.isFinite(theta)
            && Number.isFinite(phi)
            && Number.isFinite(tx)
            && Number.isFinite(ty)
            && Number.isFinite(tz)
        )
            ? { radius, theta, phi, target: { x: tx, y: ty, z: tz } }
            : null;

        return {
            orbit: safeOrbit,
            position: camera.position.clone(),
            target: controls.target.clone()
        };
    }

    _restoreInitialCameraPose() {
        const pose = this._initialCameraPose;
        if (!pose) return;

        const controls = this.scene?.controls ?? null;
        if (controls?.setOrbit && pose.orbit) {
            controls.setOrbit(pose.orbit, { immediate: false });
            return;
        }
        if (controls?.setLookAt && pose.position?.isVector3 && pose.target?.isVector3) {
            controls.setLookAt({ position: pose.position, target: pose.target });
        }
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
        state.activeSlotIndex = sanitizeSlotIndex(state.activeSlotIndex) ?? 0;
    }

    _getResolvedActiveSlotIndex() {
        const stateIdx = sanitizeSlotIndex(this._state.activeSlotIndex);
        const sceneIdx = sanitizeSlotIndex(this.scene?.getActiveSlotIndex?.());
        if (sceneIdx !== null && sceneIdx !== stateIdx) {
            this._state.activeSlotIndex = sceneIdx;
            return sceneIdx;
        }
        return stateIdx ?? 0;
    }

    _getCorrectionOverridesForMaterial(materialId) {
        const id = sanitizeMaterialId(materialId);
        if (!id) return null;
        const raw = this._correctionOverridesByMaterialId[id] ?? null;
        return raw && typeof raw === 'object' ? raw : null;
    }

    _getCalibrationBaselineOverridesForMaterial(materialId) {
        const id = sanitizeMaterialId(materialId);
        if (!id) return null;
        const defaults = getDefaultOverridesForMaterial(id) ?? {};
        const correction = this._getCorrectionOverridesForMaterial(id);
        return { ...defaults, ...(correction ?? {}) };
    }

    _getResolvedUiOverridesForMaterial(materialId) {
        const id = sanitizeMaterialId(materialId);
        if (!id) return null;

        if (this._state.calibrationMode === 'raw') {
            return getDefaultOverridesForMaterial(id);
        }
        const cached = this._lastCalibratedOverridesByMaterialId[id] ?? null;
        const manual = this._state.overridesByMaterialId[id] ?? null;
        const correction = this._getCorrectionOverridesForMaterial(id);
        if (!manual && !correction && cached && typeof cached === 'object') return { ...cached };
        const baseline = this._getCalibrationBaselineOverridesForMaterial(id) ?? {};
        return { ...baseline, ...(manual ?? {}) };
    }

    _getResolvedSceneOverridesForMaterial(materialId) {
        const id = sanitizeMaterialId(materialId);
        if (!id) return null;
        if (this._state.calibrationMode === 'raw') return null;

        const manual = this._state.overridesByMaterialId[id] ?? null;
        const correction = this._getCorrectionOverridesForMaterial(id);
        if (!manual && !correction) {
            const cached = this._lastCalibratedOverridesByMaterialId[id] ?? null;
            return cached && typeof cached === 'object' ? { ...cached } : null;
        }

        const baseline = this._getCalibrationBaselineOverridesForMaterial(id) ?? {};
        const resolved = { ...baseline, ...(manual ?? {}) };
        this._lastCalibratedOverridesByMaterialId[id] = sanitizeOverrides(resolved);
        return resolved;
    }

    _captureRawToggleCalibrationSnapshot() {
        const snapshot = [];
        for (let i = 0; i < 3; i++) {
            const id = sanitizeMaterialId(this._state.slotMaterialIds[i]);
            if (!id) continue;
            const sceneOverrides = this.scene?._slotOverrides?.[i] ?? null;
            const fromScene = sceneOverrides && typeof sceneOverrides === 'object'
                ? sanitizeOverrides(sceneOverrides)
                : null;
            const fromSceneHasValues = !!fromScene && Object.keys(fromScene).length > 0;
            const resolved = fromSceneHasValues ? fromScene : this._getResolvedSceneOverridesForMaterial(id);
            const clean = resolved && typeof resolved === 'object' ? sanitizeOverrides(resolved) : null;
            if (clean) this._lastCalibratedOverridesByMaterialId[id] = clean;
            snapshot.push({
                slotIndex: i,
                materialId: id,
                overrides: clean
            });
        }
        return snapshot;
    }

    _restoreRawToggleCalibrationSnapshot() {
        const snapshot = Array.isArray(this._rawToggleCalibrationSnapshot) ? this._rawToggleCalibrationSnapshot : null;
        if (!snapshot || !snapshot.length) return;

        for (const entry of snapshot) {
            const idx = sanitizeSlotIndex(entry?.slotIndex);
            const id = sanitizeMaterialId(entry?.materialId);
            if (idx === null || !id) continue;
            if (sanitizeMaterialId(this._state.slotMaterialIds[idx]) !== id) continue;
            const overrides = entry?.overrides && typeof entry.overrides === 'object'
                ? sanitizeOverrides(entry.overrides)
                : null;
            const hasOverrides = !!overrides && Object.keys(overrides).length > 0;
            if (hasOverrides) this._lastCalibratedOverridesByMaterialId[id] = overrides;
            this.scene.setSlotMaterial(idx, id, { overrides: hasOverrides ? overrides : null });
        }
    }

    async _primeCorrectionOverridesForCatalog() {
        const token = ++this._correctionLoadToken;
        const materialIds = this._materialOptions.map((opt) => sanitizeMaterialId(opt?.id)).filter(Boolean);
        const resolved = await Promise.all(materialIds.map(async (id) => ({
            id,
            overrides: await this._loadCorrectionOverridesForMaterial(id)
        })));
        if (token !== this._correctionLoadToken) return;

        const out = {};
        for (const entry of resolved) {
            if (entry?.overrides) out[entry.id] = entry.overrides;
        }
        this._correctionOverridesByMaterialId = out;

        if (this._state.calibrationMode === 'calibrated') {
            if (this._screenshotBusy) {
                this._pendingCorrectionSync = true;
                return;
            }
            this._syncSceneFromState({ keepCamera: true });
            this._syncUiFromState();
        }
    }

    async _refreshCorrectionOverridesForSelectedSlots({ forceReload = false } = {}) {
        const slotIds = this._state.slotMaterialIds
            .map((id) => sanitizeMaterialId(id))
            .filter(Boolean);
        const uniqueSlotIds = [...new Set(slotIds)];
        const materialIds = forceReload
            ? uniqueSlotIds
            : uniqueSlotIds.filter((id) => !Object.prototype.hasOwnProperty.call(this._correctionOverridesByMaterialId, id));
        if (!materialIds.length) return;

        const token = ++this._correctionLoadToken;
        const resolved = await Promise.all(materialIds.map(async (id) => ({
            id,
            overrides: await this._loadCorrectionOverridesForMaterial(id)
        })));
        if (token !== this._correctionLoadToken) return;

        const next = { ...this._correctionOverridesByMaterialId };
        for (const entry of resolved) {
            if (entry?.overrides) next[entry.id] = entry.overrides;
        }
        this._correctionOverridesByMaterialId = next;

        if (this._state.calibrationMode !== 'calibrated') return;
        if (this._screenshotBusy) {
            this._pendingCorrectionSync = true;
            return;
        }
        this._syncSceneFromState({ keepCamera: true });
        this._syncUiFromState();
    }

    async _loadCorrectionOverridesForMaterial(materialId) {
        const id = sanitizeMaterialId(materialId);
        if (!id) return null;
        const moduleUrl = getCorrectionConfigUrlForMaterial(id);
        if (!moduleUrl) return null;
        try {
            const mod = await import(moduleUrl);
            const config = toPlainObject(mod?.default ?? mod);
            if (!config) return null;
            if (sanitizeMaterialId(config.materialId) !== id) return null;
            const presets = toPlainObject(config.presets);
            const preset = presets ? toPlainObject(presets[CALIBRATION_PRESET_ID]) : null;
            const adjustments = preset ? toPlainObject(preset.adjustments) : null;
            return mapCorrectionAdjustmentsToOverrides(adjustments);
        } catch {
            return null;
        }
    }

    _toggleMaterial(materialId, { focus = false } = {}) {
        const id = sanitizeMaterialId(materialId);
        if (!id) return;

        const state = this._state;
        const activeSlot = this._getResolvedActiveSlotIndex();
        const existingSlot = state.slotMaterialIds.findIndex((v) => v === id);
        if (existingSlot >= 0) {
            if (focus) {
                state.activeSlotIndex = existingSlot;
                this.scene.setActiveSlotIndex(existingSlot);
                this._syncUiFromState();
                this._persist();
                this._focusSlot(existingSlot, { keepOrbit: true });
                return;
            }
            if (existingSlot === activeSlot) return;
            state.activeSlotIndex = existingSlot;
            this.scene.setActiveSlotIndex(existingSlot);
            this._syncUiFromState();
            this._persist();
            return;
        }

        state.slotMaterialIds[activeSlot] = id;
        const nextEmpty = findNextEmptySlotAfter(state.slotMaterialIds, activeSlot);
        state.activeSlotIndex = nextEmpty === null ? activeSlot : nextEmpty;
        this._ensureBaselineAndActive();
        this._applyStateToSceneAndUi({ keepCamera: true });
        if (focus) this._focusSlot(activeSlot, { keepOrbit: true });
    }

    _applyStateToSceneAndUi({ keepCamera = true } = {}) {
        this._syncSceneFromState({ keepCamera });
        this._syncUiFromState();
        this._persist();
    }

    _focusSlot(slotIndex, { keepOrbit = true, zoomClose = false } = {}) {
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return;
        this.scene.focusSlot(idx, {
            keepOrbit: !!keepOrbit,
            distanceScale: zoomClose ? SLOT_CAMERA_FOCUS_DISTANCE_SCALE : null
        });
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

    _setCalibrationMode(calibrationMode) {
        const next = sanitizeCalibrationMode(calibrationMode);
        if (next === this._state.calibrationMode) return;
        this._state.overridesByMaterialId = {};
        this._lastCalibratedOverridesByMaterialId = {};
        this._rawToggleCalibrationSnapshot = null;
        this._state.calibrationMode = next;
        this._applyStateToSceneAndUi({ keepCamera: true });
        if (next === 'calibrated') {
            this._refreshCorrectionOverridesForSelectedSlots({ forceReload: true }).catch(() => {});
        }
    }

    _setIlluminationPreset(presetId) {
        const id = typeof presetId === 'string' ? presetId.trim() : '';
        if (id === this._state.illuminationPresetId) return;
        if (id) {
            const preset = getMaterialCalibrationIlluminationPresetById(id, { fallbackToFirst: false });
            if (!preset) return;
        }
        this._state.illuminationPresetId = id;
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
        if (this._state.calibrationMode !== 'calibrated') return;
        const raw = sanitizeOverrides(overrides);
        const baseline = this._getCalibrationBaselineOverridesForMaterial(id) ?? getDefaultOverridesForMaterial(id) ?? {};
        const clean = diffOverridesFromBaseline(baseline, raw);
        if (Object.keys(clean).length) this._state.overridesByMaterialId[id] = clean;
        else delete this._state.overridesByMaterialId[id];

        for (let i = 0; i < 3; i++) {
            if (sanitizeMaterialId(this._state.slotMaterialIds[i]) !== id) continue;
            this.scene.setSlotMaterial(i, id, { overrides: this._getResolvedSceneOverridesForMaterial(id) });
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

    async _requestCalibrationScreenshot() {
        if (this._screenshotBusy) return;
        this._screenshotBusy = true;
        this.ui.setScreenshotBusy?.(true);

        try {
            await new Promise((resolve) => requestAnimationFrame(() => resolve()));
            const reportCanvas = await this._captureCalibrationReportCanvas();
            if (!reportCanvas) return;
            await this._downloadCalibrationReport(reportCanvas);
        } catch (err) {
            console.error('[MaterialCalibration] Screenshot capture failed:', err);
        } finally {
            this._screenshotBusy = false;
            this.ui.setScreenshotBusy?.(false);
            if (this._pendingCorrectionSync) {
                this._pendingCorrectionSync = false;
                this._syncSceneFromState({ keepCamera: true });
                this._syncUiFromState();
            }
        }
    }

    async _captureCalibrationReportCanvas() {
        const renderer = this.engine?.renderer ?? null;
        const canvas = this.engine?.canvas ?? renderer?.domElement ?? null;
        if (!renderer || !canvas) return null;

        const snapshot = this._captureScreenshotStateSnapshot();
        const viewportSnapshot = this._captureViewportSizeSnapshot();
        this._setScreenshotCaptureViewportSize(viewportSnapshot);
        const focusedShots = [null, null, null];
        const panelShots = [null, null, null];
        let fixedSurfacePose = null;
        let fixedPanelPose = null;

        try {
            this._applySceneRenderModes({
                layoutMode: this._state.layoutMode,
                tilingMode: this._state.tilingMode
            });
            this.scene.setPlateVisible?.(true);

            for (let i = 0; i < 3; i++) {
                const capture = this._captureSlotScreenshot(i, {
                    distanceScale: SCREENSHOT_SLOT_FOCUS_DISTANCE_SCALE,
                    fixedPose: fixedSurfacePose,
                    poseMode: 'slot_focus'
                });
                focusedShots[i] = capture?.image ?? null;
                if (!fixedSurfacePose && capture?.pose) fixedSurfacePose = capture.pose;
            }

            this._applySceneRenderModes({ layoutMode: 'panel', tilingMode: '2x2' });
            this.scene.setPlateVisible?.(false);
            for (let i = 0; i < 3; i++) {
                const capture = this._captureSlotScreenshot(i, {
                    distanceScale: SCREENSHOT_SLOT_FOCUS_DISTANCE_SCALE,
                    fixedPose: fixedPanelPose,
                    poseMode: 'panel_perpendicular'
                });
                panelShots[i] = capture?.image ?? null;
                if (!fixedPanelPose && capture?.pose) fixedPanelPose = capture.pose;
            }

            return this._composeCalibrationReportCanvas({ focusedShots, panelShots });
        } finally {
            this._restoreViewportSizeSnapshot(viewportSnapshot);
            this._restoreScreenshotStateSnapshot(snapshot);
        }
    }

    _captureViewportSizeSnapshot() {
        const renderer = this.engine?.renderer ?? null;
        if (!renderer?.getSize) return null;
        const size = renderer.getSize(new THREE.Vector2());
        const width = Math.max(1, Math.floor(Number(size?.x) || 0));
        const height = Math.max(1, Math.floor(Number(size?.y) || 0));
        if (!(width > 0 && height > 0)) return null;
        return { width, height };
    }

    _setScreenshotCaptureViewportSize(snapshot) {
        const src = snapshot && typeof snapshot === 'object' ? snapshot : null;
        if (!src) return false;

        const baseW = Math.max(1, Math.floor(Number(src.width) || 1));
        const baseH = Math.max(1, Math.floor(Number(src.height) || 1));

        const scaledW = Math.floor(baseW * SCREENSHOT_RENDER_SCALE);
        const scaledH = Math.floor(baseH * SCREENSHOT_RENDER_SCALE);
        const targetW = Math.min(
            SCREENSHOT_RENDER_MAX_WIDTH,
            Math.max(baseW, SCREENSHOT_RENDER_MIN_WIDTH, scaledW)
        );
        const targetH = Math.min(
            SCREENSHOT_RENDER_MAX_HEIGHT,
            Math.max(baseH, SCREENSHOT_RENDER_MIN_HEIGHT, scaledH)
        );

        if (targetW === baseW && targetH === baseH) return false;
        this.engine?.setViewportSize?.(targetW, targetH);
        this.scene?.controls?.update?.(0);
        this.engine?.renderFrame?.();
        return true;
    }

    _restoreViewportSizeSnapshot(snapshot) {
        const src = snapshot && typeof snapshot === 'object' ? snapshot : null;
        if (!src) return;

        const width = Math.max(1, Math.floor(Number(src.width) || 1));
        const height = Math.max(1, Math.floor(Number(src.height) || 1));
        this.engine?.setViewportSize?.(width, height);
    }

    _captureScreenshotStateSnapshot() {
        return {
            cameraPose: this._captureCurrentCameraPose(),
            activeSlotIndex: this.scene?.getActiveSlotIndex?.() ?? this._state.activeSlotIndex,
            layoutMode: this._state.layoutMode,
            tilingMode: this._state.tilingMode,
            plateVisible: this.scene?.isPlateVisible?.() !== false,
            isolatedSlotIndex: this.scene?.getIsolatedSlotIndex?.() ?? null,
            centeredSlotIndex: this.scene?.getCenteredCaptureSlot?.() ?? null
        };
    }

    _restoreScreenshotStateSnapshot(snapshot) {
        const src = snapshot && typeof snapshot === 'object' ? snapshot : null;
        if (!src) return;

        this._applySceneRenderModes({
            layoutMode: sanitizeLayoutMode(src.layoutMode),
            tilingMode: sanitizeTilingMode(src.tilingMode)
        });
        this.scene?.setPlateVisible?.(src.plateVisible !== false);
        this.scene?.setIsolatedSlotIndex?.(sanitizeOptionalSlotIndex(src.isolatedSlotIndex));
        this.scene?.setCenteredCaptureSlot?.(sanitizeOptionalSlotIndex(src.centeredSlotIndex));

        const active = sanitizeSlotIndex(src.activeSlotIndex);
        if (active !== null) this.scene?.setActiveSlotIndex?.(active);

        this._applyCameraPose(src.cameraPose, { immediate: true });
        this.scene?.controls?.update?.(0);
        this.engine?.renderFrame?.();
    }

    _applySceneRenderModes({ layoutMode = null, tilingMode = null } = {}) {
        const layout = sanitizeLayoutMode(layoutMode ?? this._state.layoutMode);
        const tiling = sanitizeTilingMode(tilingMode ?? this._state.tilingMode);
        this.scene?.setLayoutMode?.(layout);
        this.scene?.setTilingMultiplier?.(tiling === '2x2' ? 2.0 : 1.0);
    }

    _applyCameraPose(pose, { immediate = false } = {}) {
        const src = pose && typeof pose === 'object' ? pose : null;
        if (!src) return;

        const controls = this.scene?.controls ?? null;
        if (controls?.setOrbit && src.orbit) {
            controls.setOrbit(src.orbit, { immediate: !!immediate });
            if (immediate) controls.update?.(0);
            return;
        }

        const position = src.position?.isVector3 ? src.position : null;
        const target = src.target?.isVector3 ? src.target : null;
        if (controls?.setLookAt && position && target) {
            controls.setLookAt({ position, target });
            return;
        }

        const camera = this.scene?.camera ?? null;
        if (!camera || !position || !target) return;
        camera.position.copy(position);
        camera.lookAt(target);
        camera.updateProjectionMatrix();
    }

    _captureSlotScreenshot(slotIndex, {
        distanceScale = SCREENSHOT_SLOT_FOCUS_DISTANCE_SCALE,
        fixedPose = null,
        poseMode = 'slot_focus'
    } = {}) {
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return { image: null, pose: null };

        this.scene?.setIsolatedSlotIndex?.(idx);
        this.scene?.setCenteredCaptureSlot?.(idx);
        this.scene?.setActiveSlotIndex?.(idx);

        let pose = fixedPose ?? null;
        if (!pose) {
            if (poseMode === 'panel_perpendicular') {
                pose = this.scene?.getSlotPanelCapturePose?.(idx, { framing: 1.0, fit: 'cover' }) ?? null;
            } else {
                pose = this.scene?.getSlotCapturePose?.(idx, { distanceScale }) ?? null;
            }
        }
        if (pose) this._applyCameraPose(pose, { immediate: true });

        this.scene?.controls?.update?.(0);
        this.engine?.renderFrame?.();
        return { image: this._captureCurrentViewportCanvas(), pose: pose ?? null };
    }

    _captureCurrentViewportCanvas() {
        const source = this.engine?.canvas ?? this.engine?.renderer?.domElement ?? null;
        if (!source) return null;

        const canvas = makeCanvas(SCREENSHOT_CAPTURE_WIDTH, SCREENSHOT_CAPTURE_HEIGHT);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        drawCanvasCover(ctx, source, 0, 0, canvas.width, canvas.height, { fill: '#090f16' });
        return canvas;
    }

    _composeCalibrationReportCanvas({ focusedShots = null, panelShots = null } = {}) {
        const report = makeCanvas(SCREENSHOT_REPORT_WIDTH, SCREENSHOT_REPORT_HEIGHT);
        const ctx = report.getContext('2d');
        if (!ctx) return null;

        ctx.fillStyle = '#04080d';
        ctx.fillRect(0, 0, report.width, report.height);

        const padX = 30;
        const padY = 26;
        const rowGap = 16;
        const colGap = 16;
        const rowLabelH = 24;
        const rowHeights = [320, 320, 220, 320];
        const contentW = report.width - (padX * 2);
        const shotColW = (contentW - (colGap * 2)) / 3;
        const titleColor = '#b0c5dc';
        const textColor = '#cfe0f1';

        const slotMaterialIds = [0, 1, 2].map((idx) => sanitizeMaterialId(this._state.slotMaterialIds[idx]));

        const drawRowTitle = (title, y) => {
            ctx.fillStyle = titleColor;
            ctx.font = '600 15px Inter, system-ui, sans-serif';
            ctx.fillText(title, padX, y + 17);
        };

        const drawImageRow = (rowTop, rowHeight, title, shots) => {
            drawRowTitle(title, rowTop);
            const cardsTop = rowTop + rowLabelH;
            const cardsHeight = rowHeight - rowLabelH;

            for (let i = 0; i < 3; i++) {
                const x = padX + (i * (shotColW + colGap));
                const y = cardsTop;
                const w = shotColW;
                const h = cardsHeight;
                const imageY = y + 8;
                const imageH = Math.max(10, h - 42);

                ctx.fillStyle = 'rgba(5, 10, 16, 0.8)';
                ctx.fillRect(x, y, w, h);
                ctx.strokeStyle = 'rgba(173, 199, 226, 0.3)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

                drawCanvasCover(ctx, shots?.[i] ?? null, x + 8, imageY, w - 16, imageH, { fill: '#0a1119' });

                const label = slotMaterialIds[i] ? `#${i + 1} ${slotMaterialIds[i]}` : `#${i + 1} (empty)`;
                ctx.fillStyle = textColor;
                ctx.font = '500 13px Inter, system-ui, sans-serif';
                ctx.fillText(fitTextWithEllipsis(ctx, label, w - 16), x + 8, y + h - 12);
            }
        };

        let y = padY;
        drawImageRow(y, rowHeights[0], 'Row 1 · focused textures', focusedShots);
        y += rowHeights[0] + rowGap;

        drawImageRow(y, rowHeights[1], 'Row 2 · back plane only · 2×2 tiling', panelShots);
        y += rowHeights[1] + rowGap;

        drawRowTitle('Row 3 · texture + material parameters', y);
        const row3Top = y + rowLabelH;
        const row3Height = rowHeights[2] - rowLabelH;
        for (let i = 0; i < 3; i++) {
            const lines = this._getSlotParameterLines(i);
            drawTextPanel(ctx, {
                x: padX + (i * (shotColW + colGap)),
                y: row3Top,
                width: shotColW,
                height: row3Height,
                title: `Platform ${i + 1}`,
                lines
            });
        }
        y += rowHeights[2] + rowGap;

        drawRowTitle('Row 4 · illumination, filters, shaders', y);
        const row4Top = y + rowLabelH;
        const row4Height = rowHeights[3] - rowLabelH;
        const infoColumns = this._getGlobalParameterColumns();
        const infoColCount = 4;
        const infoColW = (contentW - (colGap * (infoColCount - 1))) / infoColCount;
        for (let i = 0; i < infoColCount; i++) {
            const col = infoColumns[i] ?? { title: `Info ${i + 1}`, lines: ['-'] };
            drawTextPanel(ctx, {
                x: padX + (i * (infoColW + colGap)),
                y: row4Top,
                width: infoColW,
                height: row4Height,
                title: col.title,
                lines: col.lines
            });
        }

        return report;
    }

    _getSlotParameterLines(slotIndex) {
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return ['slot unavailable'];

        const materialId = sanitizeMaterialId(this._state.slotMaterialIds[idx]);
        if (!materialId) return ['Texture: (empty)', 'No texture selected for this platform.'];

        const baselineId = sanitizeMaterialId(this._state.baselineMaterialId);
        const ovr = this._getResolvedUiOverridesForMaterial(materialId) ?? getDefaultOverridesForMaterial(materialId) ?? {};
        const mode = this._state.calibrationMode === 'raw' ? 'raw' : 'calibrated';
        const hasPipelineCorrection = !!this._getCorrectionOverridesForMaterial(materialId);
        const roughnessRemap = ovr.roughnessRemap && typeof ovr.roughnessRemap === 'object' ? ovr.roughnessRemap : null;
        const remapLow = Number.isFinite(Number(roughnessRemap?.lowPercentile)) ? Number(roughnessRemap.lowPercentile) : 0;
        const remapHigh = Number.isFinite(Number(roughnessRemap?.highPercentile)) ? Number(roughnessRemap.highPercentile) : 100;

        return [
            `Texture: ${materialId}`,
            `mode: ${mode}`,
            `pipeline correction: ${formatBool(hasPipelineCorrection)}`,
            `baseline: ${formatBool(materialId === baselineId)}`,
            `tileMeters: ${formatFixed(ovr.tileMeters, 2)}`,
            `albedoBrightness: ${formatFixed(ovr.albedoBrightness, 2)}`,
            `albedoHueDegrees: ${formatFixed(ovr.albedoHueDegrees, 0)}`,
            `albedoTintStrength: ${formatFixed(ovr.albedoTintStrength, 2)}`,
            `albedoSaturation: ${formatFixed(ovr.albedoSaturation, 2)}`,
            `roughness: ${formatFixed(ovr.roughness, 2)}`,
            `roughnessRemap: ${roughnessRemap ? `${formatFixed(roughnessRemap.min, 2)}..${formatFixed(roughnessRemap.max, 2)}` : 'off'}`,
            `roughnessGamma: ${roughnessRemap ? formatFixed(roughnessRemap.gamma, 2) : '-'}`,
            `roughnessNormPct: ${roughnessRemap ? `${formatFixed(remapLow, 0)}..${formatFixed(remapHigh, 0)}` : '-'}`,
            `roughnessInvert: ${roughnessRemap ? formatBool(roughnessRemap.invertInput === true) : '-'}`,
            `normalStrength: ${formatFixed(ovr.normalStrength, 2)}`,
            `aoIntensity: ${formatFixed(ovr.aoIntensity, 2)}`,
            `metalness: ${formatFixed(ovr.metalness, 2)}`
        ];
    }

    _getGlobalParameterColumns() {
        const renderer = this.engine?.renderer ?? null;
        const lighting = this.engine?.lightingSettings ?? null;
        const aaInfo = this.engine?.getAntiAliasingDebugInfo?.() ?? null;
        const aoInfo = this.engine?.getAmbientOcclusionDebugInfo?.() ?? null;
        const bloomInfo = this.engine?.getBloomDebugInfo?.() ?? null;
        const sunBloomInfo = this.engine?.getSunBloomDebugInfo?.() ?? null;
        const colorInfo = this.engine?.getColorGradingDebugInfo?.() ?? null;
        const iblInfo = this.engine?.getIBLDebugInfo?.() ?? null;

        const preset = this._state.illuminationPresetId
            ? getMaterialCalibrationIlluminationPresetById(this._state.illuminationPresetId, { fallbackToFirst: false })
            : null;
        const illumStatus = this._lastIlluminationStatus ?? null;
        const sun = this.scene?.sun ?? null;
        const hemi = this.scene?.hemi ?? null;
        const sceneBg = this.scene?.scene?.background ?? null;

        const renderSize = renderer?.getSize?.(new THREE.Vector2()) ?? null;
        const sizeLabel = (renderSize && Number.isFinite(renderSize.x) && Number.isFinite(renderSize.y))
            ? `${Math.round(renderSize.x)}×${Math.round(renderSize.y)}`
            : '-';

        const aoGtao = aoInfo?.mode === 'gtao' ? (aoInfo.gtao ?? null) : null;
        const bloomStrength = Number.isFinite(bloomInfo?.strength) ? ` s=${formatFixed(bloomInfo.strength, 2)}` : '';
        const sunBloomStrength = Number.isFinite(sunBloomInfo?.strength) ? ` s=${formatFixed(sunBloomInfo.strength, 2)}` : '';

        return [
            {
                title: 'Illumination',
                lines: [
                    `mode: ${illumStatus?.mode ?? '-'}`,
                    `preset: ${preset?.label ?? 'User mode'}`,
                    `scene bg: ${formatHexColor(sceneBg, 'n/a')}`,
                    `hemi intensity: ${formatFixed(hemi?.intensity, 2)}`,
                    `sun enabled: ${formatBool(sun?.visible !== false)}`,
                    `sun intensity: ${formatFixed(sun?.intensity, 2)}`,
                    `sun pos: ${formatFixed(sun?.position?.x, 2)}, ${formatFixed(sun?.position?.y, 2)}, ${formatFixed(sun?.position?.z, 2)}`
                ]
            },
            {
                title: 'Renderer',
                lines: [
                    `tone mapping: ${typeof lighting?.toneMapping === 'string' ? lighting.toneMapping : getToneMappingLabel(renderer)}`,
                    `exposure: ${formatFixed(renderer?.toneMappingExposure, 2)}`,
                    `output color space: ${getOutputColorSpaceLabel(renderer)}`,
                    `pixel ratio: ${formatFixed(renderer?.getPixelRatio?.(), 2)}`,
                    `viewport: ${sizeLabel}`,
                    `shadow map: ${formatBool(renderer?.shadowMap?.enabled)}`
                ]
            },
            {
                title: 'Filters / Shaders',
                lines: [
                    `AA: ${aaInfo?.activeMode ?? '-'} (req ${aaInfo?.requestedMode ?? '-'})`,
                    `AO: ${aoInfo?.mode ?? '-'}`,
                    `GTAO update: ${aoGtao?.updateMode ?? '-'}`,
                    `Bloom: ${formatBool(bloomInfo?.enabled)}${bloomStrength}`,
                    `Sun bloom: ${formatBool(sunBloomInfo?.enabled)}${sunBloomStrength}`,
                    `Color grading: ${colorInfo?.requestedPreset ?? '-'} i=${formatFixed(colorInfo?.intensity, 2)} active=${formatBool(colorInfo?.enabled)}`
                ]
            },
            {
                title: 'IBL / View',
                lines: [
                    `IBL enabled: ${formatBool(iblInfo?.enabled)}`,
                    `IBL loaded: ${formatBool(iblInfo?.envMapLoaded)}`,
                    `IBL env intensity: ${formatFixed(iblInfo?.envMapIntensity, 2)}`,
                    `IBL bg mode: ${iblInfo?.sceneBackgroundMode ?? '-'}`,
                    `mode: ${this._state.calibrationMode}`,
                    `layout: ${this._state.layoutMode}`,
                    `tiling: ${this._state.tilingMode}`,
                    `active slot: #${(sanitizeSlotIndex(this._state.activeSlotIndex) ?? 0) + 1}`,
                    `baseline: ${sanitizeMaterialId(this._state.baselineMaterialId) ?? '-'}`
                ]
            }
        ];
    }

    async _downloadCalibrationReport(canvas) {
        const src = canvas && typeof canvas === 'object' ? canvas : null;
        if (!src) return;

        const blob = await new Promise((resolve) => src.toBlob?.(resolve, 'image/png'));
        if (!blob) return;

        const stamp = new Date();
        const pad2 = (v) => String(v).padStart(2, '0');
        const fileName = `material_calibration_${stamp.getFullYear()}${pad2(stamp.getMonth() + 1)}${pad2(stamp.getDate())}_${pad2(stamp.getHours())}${pad2(stamp.getMinutes())}${pad2(stamp.getSeconds())}.png`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    _clearKeys() {
        for (const k of Object.keys(this._keys)) this._keys[k] = false;
    }
}
