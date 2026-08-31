// src/graphics/gui/grass_debugger/view/GrassDebuggerUI.js
// Docked panel for the Grass Debugger tool.
// @ts-check

import { DEFAULT_IBL_ID, getIblOptions } from '../../../content3d/catalogs/IBLCatalog.js';
import { getPbrMaterialClassSectionsForGround, getPbrMaterialOptionsForGround } from '../../../content3d/catalogs/PbrMaterialCatalog.js';
import { PROCEDURAL_MESH } from '../../../content3d/catalogs/ProceduralMeshCatalog.js';
import {
    LOW_CUT_GRASS_SHADER_DEFAULTS,
    LOW_CUT_GRASS_SUBSTRATE_MATERIAL_ID
} from '../../../content3d/catalogs/LowCutGrassMaterialCatalog.js';
import { createDefaultLowCutGrassProfile, serializeLowCutGrassProfile } from '../../../engine3d/grass/LowCutGrassProfile.js';
import { PickerPopup } from '../../shared/PickerPopup.js';
import { GRASS_LAB_DEFAULT_SEED } from '../GrassLabContract.js';
import {
    GRASS_LAB_CAMERA_PRESETS,
    GRASS_LAB_LIGHTING_PRESETS,
    GRASS_LAB_MOTION_PATHS,
    GRASS_LAB_QUALITY_PRESETS,
    applyGrassLabQualityPreset,
    createGrassLabValidationState
} from '../../../../app/grass/GrassLabValidationContract.js';

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function deepClone(obj) {
    return obj && typeof obj === 'object' ? JSON.parse(JSON.stringify(obj)) : obj;
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

function normalizeSeed(value) {
    const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
    return raw || 'lod';
}

function makeToggleRow({ label, value = false, tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');

    const wrap = makeEl('label', 'options-toggle-switch');
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = !!value;
    toggle.className = 'options-toggle';
    toggle.addEventListener('change', () => onChange?.(!!toggle.checked));
    wrap.appendChild(toggle);
    wrap.appendChild(makeEl('span', 'options-toggle-ui'));

    right.appendChild(wrap);
    row.appendChild(left);
    row.appendChild(right);
    if (tooltip) {
        left.title = tooltip;
        toggle.title = tooltip;
    }
    return { row, toggle };
}

function makeSelectRow({ label, value = '', options = [], tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');

    const select = document.createElement('select');
    select.className = 'options-select';
    for (const opt of Array.isArray(options) ? options : []) {
        const id = String(opt?.id ?? '');
        const text = String(opt?.label ?? id);
        if (!id) continue;
        const optionEl = document.createElement('option');
        optionEl.value = id;
        optionEl.textContent = text;
        select.appendChild(optionEl);
    }
    select.value = String(value ?? '');
    select.addEventListener('change', () => onChange?.(String(select.value)));

    right.appendChild(select);
    row.appendChild(left);
    row.appendChild(right);
    if (tooltip) {
        left.title = tooltip;
        select.title = tooltip;
    }
    return { row, select };
}

function makeNumberSliderRow({ label, value = 0, min = 0, max = 1, step = 0.01, digits = 2, tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.value = String(clamp(value, min, max, value));
    range.className = 'options-range';

    const number = document.createElement('input');
    number.type = 'number';
    number.min = String(min);
    number.max = String(max);
    number.step = String(step);
    number.value = String(clamp(value, min, max, value).toFixed(digits));
    number.className = 'options-number';

    const emit = (raw) => {
        const next = clamp(raw, min, max, min);
        range.value = String(next);
        number.value = String(next.toFixed(digits));
        onChange?.(next);
    };

    range.addEventListener('input', () => emit(Number(range.value)));
    number.addEventListener('input', () => emit(Number(number.value)));

    right.appendChild(range);
    right.appendChild(number);
    row.appendChild(left);
    row.appendChild(right);
    if (tooltip) {
        left.title = tooltip;
        range.title = tooltip;
        number.title = tooltip;
    }
    return { row, range, number };
}

function makeLogNumberSliderRow({ label, value = 0, min = 0, max = 1, step = 1, digits = 0, sliderStep = 0.0001, tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const minVal = Number.isFinite(Number(min)) ? Number(min) : 0;
    const maxVal = Number.isFinite(Number(max)) ? Number(max) : 1;
    const span = Math.max(0, maxVal - minVal);
    const logSpan = Math.log10(span + 1);
    const stepVal = Number(step) > 0 ? Number(step) : 1;

    const quantize = (v) => {
        if (!(stepVal > 0)) return v;
        return Math.round(v / stepVal) * stepVal;
    };

    const valueToT = (v) => {
        const clamped = clamp(v, minVal, maxVal, minVal);
        const off = Math.max(0, clamped - minVal);
        if (!(logSpan > 0)) return 0;
        return clamp(Math.log10(off + 1) / logSpan, 0, 1, 0);
    };

    const tToValue = (t) => {
        const tt = clamp(t, 0, 1, 0);
        if (!(logSpan > 0)) return minVal;
        return clamp(minVal + (Math.pow(10, tt * logSpan) - 1), minVal, maxVal, minVal);
    };

    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '1';
    range.step = String(sliderStep);
    range.className = 'options-range';

    const number = document.createElement('input');
    number.type = 'number';
    number.min = String(minVal);
    number.max = String(maxVal);
    number.step = String(stepVal);
    number.className = 'options-number';

    const applyValue = (raw) => {
        const next = quantize(clamp(raw, minVal, maxVal, minVal));
        range.value = String(valueToT(next));
        number.value = String(next.toFixed(digits));
        return next;
    };

    const emit = (raw) => {
        const next = applyValue(raw);
        onChange?.(next);
    };

    range.addEventListener('input', () => emit(tToValue(Number(range.value))));
    number.addEventListener('input', () => {
        if (number.value === '') return;
        const parsed = Number(number.value);
        if (!Number.isFinite(parsed)) return;
        emit(parsed);
    });

    applyValue(value);

    right.appendChild(range);
    right.appendChild(number);
    row.appendChild(left);
    row.appendChild(right);
    if (tooltip) {
        left.title = tooltip;
        range.title = tooltip;
        number.title = tooltip;
    }
    return { row, range, number };
}

function makeSeedRow({ label, value = '', tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'options-number';
    input.value = String(value ?? '');
    input.placeholder = 'seed';

    input.addEventListener('change', () => onChange?.(normalizeSeed(input.value)));
    input.addEventListener('blur', () => onChange?.(normalizeSeed(input.value)));

    right.appendChild(input);
    row.appendChild(left);
    row.appendChild(right);
    if (tooltip) {
        left.title = tooltip;
        input.title = tooltip;
    }
    return { row, input };
}

function makeTextRow({ label, value = '', placeholder = '', tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'options-number';
    input.value = String(value ?? '');
    input.placeholder = placeholder;
    input.addEventListener('change', () => onChange?.(String(input.value ?? '').trim()));
    input.addEventListener('blur', () => onChange?.(String(input.value ?? '').trim()));
    right.appendChild(input);
    row.append(left, right);
    if (tooltip) {
        left.title = tooltip;
        input.title = tooltip;
    }
    return { row, input };
}

function makeColorRow({ label, value, tooltip = '', onChange }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');
    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'ui-grass-authoring-color';
    input.value = String(value ?? '#FFFFFF');
    input.addEventListener('input', () => onChange?.(String(input.value).toUpperCase()));
    right.appendChild(input);
    row.append(left, right);
    if (tooltip) {
        left.title = tooltip;
        input.title = tooltip;
    }
    return { row, input };
}

function makeButtonRow({ label, text, tooltip = '', onClick }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');
    const btn = makeEl('button', 'options-btn', text);
    btn.type = 'button';
    btn.addEventListener('click', () => onClick?.());
    right.appendChild(btn);
    row.appendChild(left);
    row.appendChild(right);
    if (tooltip) {
        left.title = tooltip;
        btn.title = tooltip;
    }
    return { row, btn };
}

function makeReadoutRow(label, initialValue = '—') {
    const row = makeEl('div', 'ui-grass-lab-readout-row');
    const labelEl = makeEl('div', 'ui-grass-lab-readout-label', label);
    const valueEl = makeEl('div', 'ui-grass-lab-readout-value', initialValue);
    row.append(labelEl, valueEl);
    return { row, valueEl };
}

function setOptionsThumbToTexture(thumb, url, label) {
    if (!thumb) return;
    thumb.textContent = '';
    thumb.classList.remove('has-image');
    thumb.replaceChildren();

    const safeUrl = typeof url === 'string' ? url : '';
    if (safeUrl) {
        const img = document.createElement('img');
        img.className = 'options-material-thumb-img';
        img.alt = typeof label === 'string' ? label : '';
        img.loading = 'lazy';
        img.addEventListener('error', () => {
            thumb.classList.remove('has-image');
            thumb.textContent = typeof label === 'string' ? label : '';
        }, { once: true });
        img.src = safeUrl;
        thumb.classList.add('has-image');
        thumb.appendChild(img);
        return;
    }

    thumb.textContent = typeof label === 'string' ? label : '';
}

function makeGroundMaterialPickerRow({ label, tooltip = '', onPick }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'options-btn options-btn-primary options-material-picker';

    const thumb = makeEl('div', 'options-material-thumb');
    const textEl = makeEl('div', 'options-material-text');
    btn.appendChild(thumb);
    btn.appendChild(textEl);
    btn.addEventListener('click', () => onPick?.());

    right.appendChild(btn);
    row.appendChild(left);
    row.appendChild(right);
    if (tooltip) {
        left.title = tooltip;
        btn.title = tooltip;
    }
    return { row, btn, thumb, textEl };
}

function makeSection({ title, collapsedByDefault = false } = {}) {
    let collapsed = !!collapsedByDefault;

    const section = makeEl('div', 'options-section');
    const header = makeEl('div', 'options-section-header');
    header.setAttribute('role', 'button');
    header.tabIndex = 0;

    const titleEl = makeEl('div', 'options-section-title', title);
    const caret = makeEl('button', 'options-btn options-btn-small options-icon-btn', collapsed ? '▸' : '▾');
    caret.type = 'button';

    const applyCollapsed = () => {
        section.classList.toggle('is-collapsed', collapsed);
        caret.textContent = collapsed ? '▸' : '▾';
    };

    const toggle = () => {
        collapsed = !collapsed;
        applyCollapsed();
    };

    caret.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
    });
    header.addEventListener('click', (e) => {
        const btn = e?.target?.closest?.('button');
        if (btn && header.contains(btn)) return;
        toggle();
    });
    header.addEventListener('keydown', (e) => {
        const key = e?.key ?? '';
        if (key !== 'Enter' && key !== ' ') return;
        e.preventDefault();
        toggle();
    });

    header.appendChild(titleEl);
    header.appendChild(caret);
    section.appendChild(header);
    applyCollapsed();
    return section;
}

export class GrassDebuggerUI {
    constructor({
        initialState,
        onChange,
        onInspectLod1,
        onCameraBehindBus,
        onResetLab,
        onCaptureBaseline,
        onFocusNearCarpet,
        onFocusAutoLod,
        onFocusCoverage,
        onFocusLocalizedAccent,
        onFocusAuthoringFixture,
        onFocusMaterialFixture,
        onMaterialLightingPreset,
        onSaveAuthoringProfile,
        onExportAuthoringProfile,
        onImportAuthoringProfile,
        onResetAuthoringProfile,
        onValidationCameraPreset,
        onValidationLightingPreset,
        onValidationMotionPath,
        onValidationStress,
        onValidationResetSamples,
        onValidationApprove
    } = {}) {
        this._onChange = typeof onChange === 'function' ? onChange : null;
        this._onInspectLod1 = typeof onInspectLod1 === 'function' ? onInspectLod1 : null;
        this._onCameraBehindBus = typeof onCameraBehindBus === 'function' ? onCameraBehindBus : null;
        this._onResetLab = typeof onResetLab === 'function' ? onResetLab : null;
        this._onCaptureBaseline = typeof onCaptureBaseline === 'function' ? onCaptureBaseline : null;
        this._onFocusNearCarpet = typeof onFocusNearCarpet === 'function' ? onFocusNearCarpet : null;
        this._onFocusAutoLod = typeof onFocusAutoLod === 'function' ? onFocusAutoLod : null;
        this._onFocusCoverage = typeof onFocusCoverage === 'function' ? onFocusCoverage : null;
        this._onFocusLocalizedAccent = typeof onFocusLocalizedAccent === 'function' ? onFocusLocalizedAccent : null;
        this._onFocusAuthoringFixture = typeof onFocusAuthoringFixture === 'function' ? onFocusAuthoringFixture : null;
        this._onFocusMaterialFixture = typeof onFocusMaterialFixture === 'function' ? onFocusMaterialFixture : null;
        this._onMaterialLightingPreset = typeof onMaterialLightingPreset === 'function' ? onMaterialLightingPreset : null;
        this._onSaveAuthoringProfile = typeof onSaveAuthoringProfile === 'function' ? onSaveAuthoringProfile : null;
        this._onExportAuthoringProfile = typeof onExportAuthoringProfile === 'function' ? onExportAuthoringProfile : null;
        this._onImportAuthoringProfile = typeof onImportAuthoringProfile === 'function' ? onImportAuthoringProfile : null;
        this._onResetAuthoringProfile = typeof onResetAuthoringProfile === 'function' ? onResetAuthoringProfile : null;
        this._onValidationCameraPreset = typeof onValidationCameraPreset === 'function' ? onValidationCameraPreset : null;
        this._onValidationLightingPreset = typeof onValidationLightingPreset === 'function' ? onValidationLightingPreset : null;
        this._onValidationMotionPath = typeof onValidationMotionPath === 'function' ? onValidationMotionPath : null;
        this._onValidationStress = typeof onValidationStress === 'function' ? onValidationStress : null;
        this._onValidationResetSamples = typeof onValidationResetSamples === 'function' ? onValidationResetSamples : null;
        this._onValidationApprove = typeof onValidationApprove === 'function' ? onValidationApprove : null;
        this._isSetting = false;

        const groundOptions = getPbrMaterialOptionsForGround();
        const defaultGroundMaterialId = groundOptions.find((option) => option?.id === LOW_CUT_GRASS_SUBSTRATE_MATERIAL_ID)?.id
            ?? groundOptions[0]?.id
            ?? '';

        const defaultState = {
            tab: 'lab',
            lab: {
                seed: GRASS_LAB_DEFAULT_SEED,
                showFixtures: true
            },
            validation: createGrassLabValidationState(),
            authoring: {
                profile: createDefaultLowCutGrassProfile()
            },
            material: {
                enabled: LOW_CUT_GRASS_SHADER_DEFAULTS.enabled,
                macroScaleMeters: LOW_CUT_GRASS_SHADER_DEFAULTS.macroScaleMeters,
                macroVariationStrength: LOW_CUT_GRASS_SHADER_DEFAULTS.macroVariationStrength,
                secondaryScale: LOW_CUT_GRASS_SHADER_DEFAULTS.secondaryScale,
                secondaryBlend: LOW_CUT_GRASS_SHADER_DEFAULTS.secondaryBlend,
                seedOffset: { ...LOW_CUT_GRASS_SHADER_DEFAULTS.seedOffset },
                lightingPreset: 'daylight'
            },
            environment: {
                ibl: {
                    enabled: true,
                    iblId: DEFAULT_IBL_ID,
                    setBackground: true,
                    envMapIntensity: 0.25
                },
                sunIntensity: 1.05
            },
            terrain: {
                showGrid: false,
                groundMaterialId: defaultGroundMaterialId,
                substrate: {
                    enabled: false,
                    seed: 0,
                    layer1: {
                        enabled: true,
                        materialId: 'pbr.forrest_ground_01',
                        coverage: 0.55,
                        blendWidth: 0.16,
                        patchSizeMeters: 55,
                        edgeSizeMeters: 11,
                        edgeStrength: 0.25
                    },
                    layer2: {
                        enabled: true,
                        materialId: 'pbr.grass_004',
                        coverage: 0.35,
                        blendWidth: 0.16,
                        patchSizeMeters: 85,
                        edgeSizeMeters: 14,
                        edgeStrength: 0.22
                    }
                }
            },
            coverage: {
                enabled: true,
                showSurface: true,
                showEdge: true,
                showLip: true,
                showFringe: true,
                layerHeightMillimeters: 27.5,
                substrateRevealMillimeters: 80,
                densityMultiplier: 1,
                farCoverageThreshold: 0.35,
                edgeAntialiasMillimeters: 12,
                rootClearanceMillimeters: 3,
                cutEdgeEnabled: true,
                cutEdgeSpacingMeters: 0.018,
                cutEdgeInsetMeters: 0.004,
                visibleBladeTipMinMillimeters: 40,
                visibleBladeTipMaxMillimeters: 75,
                accentEligibility: true
            },
            accents: {
                enabled: true,
                wornEnabled: false,
                featureAccentsEnabled: true,
                clustersPerTree: 4,
                clustersPerFeature: 3,
                trunkRadiusMeters: 0.55,
                ringInnerMeters: 0.82,
                ringOuterMeters: 1.25,
                wornRadiusMeters: 0.76,
                cardWidthMeters: 0.24,
                cardHeightMeters: 0.075
            },
            autoLod: {
                force: 'auto',
                nearEndMeters: 3,
                billboardEndMeters: 8,
                middleEndMeters: 25,
                clusterEndMeters: 25,
                transitionWidthMeters: 2,
                hysteresisMeters: 0.75,
                overlapMeters: 0.5,
                grazingDistanceScale: 0.8,
                topDownDistanceScale: 1.2
            },
            lod1: {
                enabled: true,
                carpetMode: 'auto',
                carpetPatchSizeMeters: 1,
                carpetBladesPerSquareMeter: 64,
                carpetFibersPerRoot: 3,
                carpetRadiusMeters: 3,
                region: { innerMeters: 0, outerMeters: 3 },
                angle: { minGrazingDeg: 0, maxGrazingDeg: 90 },
                debug: { printRegion: true, drawBounds: true },
                bladeMeshId: PROCEDURAL_MESH.SOCCER_GRASS_BLADE_V1,
                seed: 'lod1',
                densityPerTile: 350,
                randomYawDeg: 360,
                bladeBend: { min: -35, max: 35 },
                tipBend: { min: -35, max: 35 },
                curvature: { min: 0.4, max: 1.2 }
            },
            lod2: {
                enabled: true,
                billboardEnabled: true,
                middleEnabled: true,
                ownershipCellMeters: 1,
                billboardCardsPerUnit: 1,
                middleCardsPerUnit: 2,
                billboardCardWidthMeters: 1.15,
                middleCardWidthMeters: 1.15,
                cardHeightMeters: 0.055,
                clusterPatchSizeMeters: 1,
                clusterCardsPerPatch: 2,
                clusterCardWidthMeters: 1.15,
                clusterCardHeightMeters: 0.055,
                region: { innerMeters: 3, outerMeters: 25 },
                angle: { minGrazingDeg: 0, maxGrazingDeg: 90 },
                debug: { printRegion: false, drawBounds: false },
                bladeMeshId: PROCEDURAL_MESH.SOCCER_GRASS_BLADE_V1,
                seed: 'lod2',
                densityPerTile: 110,
                randomYawDeg: 360,
                bladeBend: { min: -35, max: 35 },
                tipBend: { min: -35, max: 35 },
                curvature: { min: 0.4, max: 1.2 }
            },
            lod3: {
                enabled: true,
                region: { innerMeters: 25, outerMeters: 25 },
                angle: { minGrazingDeg: 0, maxGrazingDeg: 90 },
                debug: { printRegion: false, drawBounds: false }
            },
            lod4: {
                enabled: true,
                region: { innerMeters: 25, outerMeters: 25 },
                angle: { minGrazingDeg: 0, maxGrazingDeg: 90 },
                debug: { printRegion: false, drawBounds: false }
            }
        };

        this._state = { ...defaultState, ...(initialState ?? {}) };

        this.root = makeEl('div', 'ui-layer options-layer');
        this.root.id = 'ui-grass-debugger';

        this._pickerPopup = new PickerPopup();

        this.panel = makeEl('div', 'ui-panel is-interactive options-panel');

        const header = makeEl('div', 'options-header');
        const title = makeEl('div', 'options-title', 'Grass Lab');
        const subtitle = makeEl('div', 'options-subtitle', 'Canonical GrassEngine runtime · deterministic offline fixtures · no gameplay integration');
        header.appendChild(title);
        header.appendChild(subtitle);

        this.panel.appendChild(header);

        this.body = makeEl('div', 'options-body');
        this.panel.appendChild(this.body);

        this.root.appendChild(this.panel);

        this._controls = {};
        this._buildTabs();
        this._buildTabBodies();

        this._setActiveTab(this._state.tab);

        this._onKeyDown = (e) => {
            if (!e) return;
            if (e.code !== 'Escape' && e.key !== 'Escape') return;
            if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;
            e.preventDefault();
        };
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
    }

    mount() {
        document.body.appendChild(this.root);
    }

    unmount() {
        window.removeEventListener('keydown', this._onKeyDown);
        this._pickerPopup?.dispose?.();
        this._pickerPopup = null;
        this.root.remove();
    }

    getState() {
        return deepClone(this._state);
    }

    applyQualityPreset(presetId, { emit = true } = {}) {
        this._state = applyGrassLabQualityPreset(this._state, presetId);
        this._refreshValidationPresetReadout();
        if (emit) this._emit();
        return this.getState();
    }

    recordValidationReview(kind, id) {
        const validation = this._state.validation ?? (this._state.validation = createGrassLabValidationState());
        const value = String(id ?? '');
        if (!value) return;
        if (kind === 'camera') {
            validation.cameraPreset = value;
            this._markValidationReview('reviewedCameraIds', value);
        } else if (kind === 'lighting') {
            validation.lightingPreset = value;
            this._markValidationReview('reviewedLightingIds', value);
        } else if (kind === 'motion') {
            validation.motionPath = value;
            this._markValidationReview('reviewedMotionPathIds', value);
        }
    }

    setLod1(nextLod1, { emit = true } = {}) {
        const src = nextLod1 && typeof nextLod1 === 'object' ? nextLod1 : null;
        if (!src) return;

        this._isSetting = true;
        const lod = this._state.lod1;
        if (lod && typeof lod === 'object') {
            lod.bladeBend = lod.bladeBend && typeof lod.bladeBend === 'object' ? lod.bladeBend : { min: 0, max: 0 };
            lod.tipBend = lod.tipBend && typeof lod.tipBend === 'object' ? lod.tipBend : { min: 0, max: 0 };
            lod.curvature = lod.curvature && typeof lod.curvature === 'object' ? lod.curvature : { min: 0, max: 0 };

            const nextBladeBend = src.bladeBend && typeof src.bladeBend === 'object' ? src.bladeBend : {};
            const nextTipBend = src.tipBend && typeof src.tipBend === 'object' ? src.tipBend : {};
            const nextCurvature = src.curvature && typeof src.curvature === 'object' ? src.curvature : {};

            if (Number.isFinite(Number(nextBladeBend.min))) lod.bladeBend.min = Number(nextBladeBend.min);
            if (Number.isFinite(Number(nextBladeBend.max))) lod.bladeBend.max = Number(nextBladeBend.max);
            if (Number.isFinite(Number(nextTipBend.min))) lod.tipBend.min = Number(nextTipBend.min);
            if (Number.isFinite(Number(nextTipBend.max))) lod.tipBend.max = Number(nextTipBend.max);
            if (Number.isFinite(Number(nextCurvature.min))) lod.curvature.min = Number(nextCurvature.min);
            if (Number.isFinite(Number(nextCurvature.max))) lod.curvature.max = Number(nextCurvature.max);
        }

        const setSlider = (ctrl, value, digits = 0) => {
            if (!ctrl?.range || !ctrl?.number) return;
            const v = Number(value);
            if (!Number.isFinite(v)) return;
            ctrl.range.value = String(v);
            ctrl.number.value = String(Number.isFinite(digits) ? v.toFixed(digits) : v);
        };

        setSlider(this._controls?.lod1BladeBendMin, lod?.bladeBend?.min, 0);
        setSlider(this._controls?.lod1BladeBendMax, lod?.bladeBend?.max, 0);
        setSlider(this._controls?.lod1TipBendMin, lod?.tipBend?.min, 0);
        setSlider(this._controls?.lod1TipBendMax, lod?.tipBend?.max, 0);
        setSlider(this._controls?.lod1CurvatureMin, lod?.curvature?.min, 2);
        setSlider(this._controls?.lod1CurvatureMax, lod?.curvature?.max, 2);

        this._isSetting = false;
        if (emit) this._emit();
    }

    _emit() {
        if (this._isSetting) return;
        this._onChange?.(this.getState());
    }

    _buildEnvironmentTab(parent) {
        const section = makeSection({ title: 'Environment', collapsedByDefault: false });
        parent.appendChild(section);

        const ibl = this._state.environment.ibl;
        const iblOptions = getIblOptions();

        const enabledRow = makeToggleRow({
            label: 'IBL enabled',
            value: ibl.enabled,
            onChange: (v) => {
                this._state.environment.ibl.enabled = v;
                this._emit();
            }
        });

        const iblRow = makeSelectRow({
            label: 'IBL',
            value: ibl.iblId,
            options: iblOptions,
            onChange: (id) => {
                this._state.environment.ibl.iblId = id;
                this._emit();
            }
        });

        const bgRow = makeToggleRow({
            label: 'IBL background',
            value: ibl.setBackground,
            onChange: (v) => {
                this._state.environment.ibl.setBackground = v;
                this._emit();
            }
        });

        const iblIntensityRow = makeNumberSliderRow({
            label: 'IBL intensity',
            value: ibl.envMapIntensity,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.environment.ibl.envMapIntensity = v;
                this._emit();
            }
        });

        const sunRow = makeNumberSliderRow({
            label: 'Sun intensity',
            value: this._state.environment.sunIntensity,
            min: 0,
            max: 4,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.environment.sunIntensity = v;
                this._emit();
            }
        });

        section.appendChild(enabledRow.row);
        section.appendChild(iblRow.row);
        section.appendChild(bgRow.row);
        section.appendChild(iblIntensityRow.row);
        section.appendChild(sunRow.row);

        this._controls.iblEnabled = enabledRow;
        this._controls.iblSelect = iblRow;
        this._controls.iblBackground = bgRow;
        this._controls.iblIntensity = iblIntensityRow;
        this._controls.sunIntensity = sunRow;

        const camSection = makeSection({ title: 'Camera', collapsedByDefault: false });
        parent.appendChild(camSection);

        camSection.appendChild(makeButtonRow({
            label: 'Preset',
            text: 'Behind Bus (Gameplay)',
            onClick: () => this._onCameraBehindBus?.()
        }).row);
    }

    _buildMaterialTab(parent) {
        const material = this._state.material && typeof this._state.material === 'object'
            ? this._state.material
            : (this._state.material = { ...LOW_CUT_GRASS_SHADER_DEFAULTS, lightingPreset: 'daylight' });

        const contract = makeSection({ title: 'Matched grass material family', collapsedByDefault: false });
        parent.appendChild(contract);
        contract.appendChild(makeEl(
            'div',
            'ui-grass-lab-note',
            'The three floor swatches compare Grass004, the approved 1.4 m low-cut surface, and its substrate. The vertical board is the single 4×2 alpha atlas used by later cluster LODs.'
        ));
        contract.appendChild(makeButtonRow({
            label: 'Fixture camera',
            text: 'Focus material fixture',
            onClick: () => this._onFocusMaterialFixture?.({ grazing: material.lightingPreset === 'grazing' })
        }).row);
        contract.appendChild(makeToggleRow({
            label: 'Anti-tiling',
            value: material.enabled !== false,
            tooltip: 'Stable world-space macro variation; the grass footprint is unchanged.',
            onChange: (value) => {
                material.enabled = value;
                this._emit();
            }
        }).row);

        const variation = makeSection({ title: 'Stable macro / micro variation', collapsedByDefault: false });
        parent.appendChild(variation);
        variation.appendChild(makeNumberSliderRow({
            label: 'Macro scale (m)',
            value: material.macroScaleMeters,
            min: 2,
            max: 80,
            step: 0.5,
            digits: 1,
            onChange: (value) => {
                material.macroScaleMeters = value;
                this._emit();
            }
        }).row);
        variation.appendChild(makeNumberSliderRow({
            label: 'Macro strength',
            value: material.macroVariationStrength,
            min: 0,
            max: 0.35,
            step: 0.01,
            digits: 2,
            onChange: (value) => {
                material.macroVariationStrength = value;
                this._emit();
            }
        }).row);
        variation.appendChild(makeNumberSliderRow({
            label: 'Second sample blend',
            value: material.secondaryBlend,
            min: 0,
            max: 0.75,
            step: 0.01,
            digits: 2,
            onChange: (value) => {
                material.secondaryBlend = value;
                this._emit();
            }
        }).row);

        const lighting = makeSection({ title: 'Acceptance lighting', collapsedByDefault: false });
        parent.appendChild(lighting);
        const applyPreset = (presetId) => {
            const presets = {
                daylight: { sun: 1.05, ibl: 0.25 },
                overcast: { sun: 0.18, ibl: 0.48 },
                grazing: { sun: 1.65, ibl: 0.2 }
            };
            const preset = presets[presetId] ?? presets.daylight;
            material.lightingPreset = presetId in presets ? presetId : 'daylight';
            this._state.environment.sunIntensity = preset.sun;
            this._state.environment.ibl.envMapIntensity = preset.ibl;
            if (this._controls?.sunIntensity) {
                this._controls.sunIntensity.range.value = String(preset.sun);
                this._controls.sunIntensity.number.value = preset.sun.toFixed(2);
            }
            if (this._controls?.iblIntensity) {
                this._controls.iblIntensity.range.value = String(preset.ibl);
                this._controls.iblIntensity.number.value = preset.ibl.toFixed(2);
            }
            this._onMaterialLightingPreset?.(material.lightingPreset);
            this._emit();
        };
        lighting.appendChild(makeButtonRow({ label: 'Neutral', text: 'Daylight', onClick: () => applyPreset('daylight') }).row);
        lighting.appendChild(makeButtonRow({ label: 'Diffuse', text: 'Overcast', onClick: () => applyPreset('overcast') }).row);
        lighting.appendChild(makeButtonRow({ label: 'Low angle', text: 'Grazing', onClick: () => applyPreset('grazing') }).row);

        const diagnostics = makeSection({ title: 'Material contract', collapsedByDefault: false });
        parent.appendChild(diagnostics);
        const grid = makeEl('div', 'ui-grass-lab-readouts');
        diagnostics.appendChild(grid);
        this._controls.materialReadouts = {};
        for (const [key, label] of [
            ['surface', 'Matched surface'],
            ['scale', 'Physical scale'],
            ['maps', 'Separated far maps'],
            ['substrate', 'Substrate'],
            ['atlas', 'Cluster atlas'],
            ['mips', 'Alpha / mips'],
            ['provenance', 'Provenance'],
            ['pipeline', 'Texture pipeline']
        ]) {
            const readout = makeReadoutRow(label);
            grid.appendChild(readout.row);
            this._controls.materialReadouts[key] = readout.valueEl;
        }
    }

    _buildTabs() {
        this.tabs = makeEl('div', 'options-tabs');
        this._tabButtons = {
            lab: makeEl('button', 'options-tab', 'Lab'),
            validation: makeEl('button', 'options-tab', 'Validation'),
            authoring: makeEl('button', 'options-tab', 'Authoring'),
            material: makeEl('button', 'options-tab', 'Material'),
            environment: makeEl('button', 'options-tab', 'Environment'),
            terrain: makeEl('button', 'options-tab', 'Terrain'),
            coverage: makeEl('button', 'options-tab', 'Coverage'),
            accents: makeEl('button', 'options-tab', 'Tree accents'),
            lod1: makeEl('button', 'options-tab', 'Near geometry'),
            lod2: makeEl('button', 'options-tab', 'Cluster LOD'),
            lod3: makeEl('button', 'options-tab', 'Texture surface'),
            lod4: makeEl('button', 'options-tab', 'Geometry cutoff')
        };

        for (const [key, btn] of Object.entries(this._tabButtons)) {
            btn.type = 'button';
            btn.addEventListener('click', () => this._setActiveTab(key));
            this.tabs.appendChild(btn);
        }

        this.body.appendChild(this.tabs);
    }

    _buildTabBodies() {
        this._tabBodies = {
            lab: makeEl('div', null),
            validation: makeEl('div', null),
            authoring: makeEl('div', null),
            material: makeEl('div', null),
            environment: makeEl('div', null),
            terrain: makeEl('div', null),
            coverage: makeEl('div', null),
            accents: makeEl('div', null),
            lod1: makeEl('div', null),
            lod2: makeEl('div', null),
            lod3: makeEl('div', null),
            lod4: makeEl('div', null)
        };

        for (const el of Object.values(this._tabBodies)) {
            el.style.display = 'none';
            this.body.appendChild(el);
        }

        this._buildLabTab(this._tabBodies.lab);
        this._buildValidationTab(this._tabBodies.validation);
        this._buildAuthoringTab(this._tabBodies.authoring);
        this._buildMaterialTab(this._tabBodies.material);
        this._buildEnvironmentTab(this._tabBodies.environment);
        this._buildTerrainTab(this._tabBodies.terrain);
        this._buildCoverageTab(this._tabBodies.coverage);
        this._buildLocalizedAccentsTab(this._tabBodies.accents);
        this._buildLod1Body(this._tabBodies.lod1);
        this._buildAutoLodBody(this._tabBodies.lod2);
        this._buildLodStubBody(this._tabBodies.lod3, { key: 'lod3', title: 'Texture-only maintained grass' });
        this._buildLodStubBody(this._tabBodies.lod4, { key: 'lod4', title: 'Hard geometry cutoff' });
    }

    _buildLabTab(parent) {
        const lab = this._state.lab && typeof this._state.lab === 'object'
            ? this._state.lab
            : (this._state.lab = { seed: GRASS_LAB_DEFAULT_SEED, showFixtures: true });

        const contract = makeSection({ title: 'Canonical runtime', collapsedByDefault: false });
        parent.appendChild(contract);
        const ownership = makeEl(
            'div',
            'ui-grass-lab-note',
            'This screen owns offline grass approval and runs GrassEngine. The high-resolution bake source is isolated in Authoring; the field uses the derived lightweight, single-material runtime contract.'
        );
        contract.appendChild(ownership);

        contract.appendChild(makeSeedRow({
            label: 'Lab seed',
            value: lab.seed,
            tooltip: 'Reset returns to the canonical baseline seed.',
            onChange: (value) => {
                lab.seed = value || GRASS_LAB_DEFAULT_SEED;
                this._emit();
            }
        }).row);
        contract.appendChild(makeToggleRow({
            label: 'Tree fixtures',
            value: lab.showFixtures !== false,
            onChange: (value) => {
                lab.showFixtures = value;
                this._emit();
            }
        }).row);
        contract.appendChild(makeButtonRow({
            label: 'Deterministic state',
            text: 'Reset canonical baseline',
            onClick: () => this._onResetLab?.()
        }).row);
        contract.appendChild(makeButtonRow({
            label: 'Diagnostics',
            text: 'Capture baseline JSON',
            onClick: () => this._onCaptureBaseline?.()
        }).row);

        const status = makeEl('div', 'ui-grass-lab-status', 'Baseline not captured yet.');
        contract.appendChild(status);
        this._controls.labCaptureStatus = status;

        const metrics = makeSection({ title: 'Live baseline metrics', collapsedByDefault: false });
        parent.appendChild(metrics);
        const grid = makeEl('div', 'ui-grass-lab-readouts');
        metrics.appendChild(grid);
        const definitions = [
            ['runtime', 'Runtime'],
            ['fixtures', 'Fixtures'],
            ['instances', 'Grass instances'],
            ['triangles', 'Grass triangles'],
            ['draws', 'Logical grass draws'],
            ['nearCarpet', 'Near carpet'],
            ['midCluster', 'Billboard + middle field'],
            ['accents', 'Localized accents'],
            ['coverage', 'Hard coverage'],
            ['cpu', 'Grass update CPU'],
            ['gpu', 'Whole-frame GPU'],
            ['renderer', 'Renderer totals'],
            ['lod', 'LOD evaluation']
        ];
        this._controls.labReadouts = {};
        for (const [key, label] of definitions) {
            const readout = makeReadoutRow(label);
            grid.appendChild(readout.row);
            this._controls.labReadouts[key] = readout.valueEl;
        }
    }

    _markValidationReview(key, id) {
        const validation = this._state.validation ?? (this._state.validation = createGrassLabValidationState());
        const list = Array.isArray(validation[key]) ? validation[key] : (validation[key] = []);
        if (!list.includes(id)) list.push(id);
    }

    _refreshValidationPresetReadout() {
        const validation = this._state.validation ?? createGrassLabValidationState();
        const preset = GRASS_LAB_QUALITY_PRESETS[validation.qualityPreset] ?? GRASS_LAB_QUALITY_PRESETS.default;
        const value = this._controls?.validationPresetSummary;
        if (value) {
            value.textContent = `${preset.label} · near ${preset.nearRadiusMeters} m · cluster ${preset.clusterRadiusMeters} m · density ×${preset.densityMultiplier.toFixed(2)} · accents ${preset.localizedAccents ? 'on' : 'off'} · cutoff ${preset.farCutoffMeters} m`;
        }
        for (const [id, button] of Object.entries(this._controls?.validationQualityButtons ?? {})) {
            button.classList.toggle('options-btn-primary', id === preset.id);
        }
    }

    _buildValidationTab(parent) {
        const validation = this._state.validation && typeof this._state.validation === 'object'
            ? this._state.validation
            : (this._state.validation = createGrassLabValidationState());

        const quality = makeSection({ title: 'Quality presets · automatic LOD canonical', collapsedByDefault: false });
        parent.appendChild(quality);
        quality.appendChild(makeEl('div', 'ui-grass-lab-note', 'Low preserves the raised, hard-cut maintained surface with texture-only grass. Default is the approval target. High is a review/stress preset. Manual tier forcing remains in Cluster LOD only for diagnosis.'));
        this._controls.validationQualityButtons = {};
        for (const preset of Object.values(GRASS_LAB_QUALITY_PRESETS)) {
            const row = makeButtonRow({
                label: preset.id === 'default' ? 'Approval target' : 'Quality',
                text: preset.label,
                tooltip: preset.description,
                onClick: () => {
                    this.applyQualityPreset(preset.id);
                }
            });
            quality.appendChild(row.row);
            this._controls.validationQualityButtons[preset.id] = row.btn;
        }
        const presetSummary = makeEl('div', 'ui-grass-lab-status');
        quality.appendChild(presetSummary);
        this._controls.validationPresetSummary = presetSummary;

        const cameras = makeSection({ title: 'Repeatable cameras and poses', collapsedByDefault: false });
        parent.appendChild(cameras);
        cameras.appendChild(makeEl('div', 'ui-grass-lab-note', 'The 0.30 m shot supplements the required 0.5–5 m inspection ladder. Handoff and texture-only poses measure center-screen focus distance under automatic LOD.'));
        for (const preset of GRASS_LAB_CAMERA_PRESETS) {
            cameras.appendChild(makeButtonRow({
                label: preset.pose.replaceAll('_', ' '),
                text: preset.label,
                onClick: () => {
                    const currentValidation = this._state.validation ?? (this._state.validation = createGrassLabValidationState());
                    currentValidation.cameraPreset = preset.id;
                    this._markValidationReview('reviewedCameraIds', preset.id);
                    this._onValidationCameraPreset?.(preset.id);
                    this._emit();
                }
            }).row);
        }

        const lighting = makeSection({ title: 'Deterministic lighting reviews', collapsedByDefault: false });
        parent.appendChild(lighting);
        for (const preset of Object.values(GRASS_LAB_LIGHTING_PRESETS)) {
            lighting.appendChild(makeButtonRow({
                label: 'Lighting',
                text: preset.label,
                onClick: () => {
                    const currentValidation = this._state.validation ?? (this._state.validation = createGrassLabValidationState());
                    currentValidation.lightingPreset = preset.id;
                    this._state.environment.sunIntensity = preset.sunIntensity;
                    this._markValidationReview('reviewedLightingIds', preset.id);
                    this._emit();
                    this._onValidationLightingPreset?.(preset.id);
                }
            }).row);
        }

        const motion = makeSection({ title: 'Stationary, flyover, and stress', collapsedByDefault: false });
        parent.appendChild(motion);
        for (const path of Object.values(GRASS_LAB_MOTION_PATHS)) {
            motion.appendChild(makeButtonRow({
                label: 'Path',
                text: path.label,
                onClick: () => {
                    const currentValidation = this._state.validation ?? (this._state.validation = createGrassLabValidationState());
                    currentValidation.motionPath = path.id;
                    this._markValidationReview('reviewedMotionPathIds', path.id);
                    this._onValidationMotionPath?.(path.id);
                    this._emit();
                }
            }).row);
        }
        motion.appendChild(makeButtonRow({
            label: 'Structural ceiling',
            text: 'Run high-preset stress view',
            onClick: () => this._onValidationStress?.()
        }).row);
        motion.appendChild(makeButtonRow({
            label: 'Measurements',
            text: 'Clear rolling samples',
            onClick: () => this._onValidationResetSamples?.()
        }).row);

        const diagnostics = makeSection({ title: 'Approval diagnostics', collapsedByDefault: false });
        parent.appendChild(diagnostics);
        const grid = makeEl('div', 'ui-grass-lab-readouts');
        diagnostics.appendChild(grid);
        const definitions = [
            ['review', 'Active review'],
            ['lod', 'Active LOD / response'],
            ['instances', 'Per-tier instances'],
            ['triangles', 'Per-tier triangles'],
            ['draws', 'Grass draws'],
            ['timing', 'Rolling CPU / GPU proxy'],
            ['buffers', 'Instance-buffer uploads'],
            ['budget', 'Default budget'],
            ['coverage', 'Review coverage'],
            ['stress', 'Stress baseline'],
            ['approval', 'Approval record']
        ];
        this._controls.validationReadouts = {};
        for (const [key, label] of definitions) {
            const readout = makeReadoutRow(label);
            grid.appendChild(readout.row);
            this._controls.validationReadouts[key] = readout.valueEl;
        }
        diagnostics.appendChild(makeButtonRow({
            label: 'Explicit gate',
            text: 'Record current approval candidate',
            tooltip: 'Creates an in-memory approval candidate. Checked-in approval evidence is recorded only after all automated and visual reviews pass.',
            onClick: () => this._onValidationApprove?.()
        }).row);
        this._refreshValidationPresetReadout();
    }

    _buildAuthoringTab(parent) {
        const authoring = this._state.authoring && typeof this._state.authoring === 'object'
            ? this._state.authoring
            : (this._state.authoring = { profile: createDefaultLowCutGrassProfile() });
        const profile = authoring.profile && typeof authoring.profile === 'object'
            ? authoring.profile
            : (authoring.profile = createDefaultLowCutGrassProfile());
        const emit = () => this._emit();
        const metersToMillimeters = (value) => Number(value) * 1000;
        const millimetersToMeters = (value) => Number(value) / 1000;

        const contract = makeSection({ title: 'Versioned authoring profile', collapsedByDefault: false });
        parent.appendChild(contract);
        contract.appendChild(makeEl(
            'div',
            'ui-grass-lab-note',
            'Left fixture: deterministic high-resolution procedural bake source. Right fixture: the derived one-triangle, one-material runtime blade. Neither source-authoring complexity nor saved profiles enter gameplay in AI 351.'
        ));
        contract.appendChild(makeTextRow({
            label: 'Profile ID',
            value: profile.profileId,
            placeholder: 'grass.lowcut.maintained.v1',
            onChange: (value) => {
                profile.profileId = value;
                emit();
            }
        }).row);
        contract.appendChild(makeSeedRow({
            label: 'Seed',
            value: profile.seed,
            tooltip: 'The same sanitized profile and seed produce the same bake-source descriptors and geometry.',
            onChange: (value) => {
                profile.seed = value;
                emit();
            }
        }).row);
        contract.appendChild(makeButtonRow({
            label: 'Fixture camera',
            text: 'Focus comparison fixture',
            onClick: () => this._onFocusAuthoringFixture?.()
        }).row);
        contract.appendChild(makeButtonRow({
            label: 'Persist locally',
            text: 'Save profile',
            onClick: () => this._onSaveAuthoringProfile?.(this.getState())
        }).row);

        const blade = makeSection({ title: 'Maintained blade silhouette', collapsedByDefault: false });
        parent.appendChild(blade);
        blade.appendChild(makeEl('div', 'ui-grass-lab-note', 'Canonical maintained-turf target: 25–30 mm. Wider bounds are exposed only for controlled authoring experiments.'));
        blade.appendChild(makeNumberSliderRow({
            label: 'Height min (mm)',
            value: metersToMillimeters(profile.blade.heightMeters.min),
            min: 15,
            max: 80,
            step: 0.5,
            digits: 1,
            onChange: (value) => {
                profile.blade.heightMeters.min = millimetersToMeters(value);
                if (profile.blade.heightMeters.max < profile.blade.heightMeters.min) profile.blade.heightMeters.max = profile.blade.heightMeters.min;
                emit();
            }
        }).row);
        blade.appendChild(makeNumberSliderRow({
            label: 'Height max (mm)',
            value: metersToMillimeters(profile.blade.heightMeters.max),
            min: 15,
            max: 80,
            step: 0.5,
            digits: 1,
            onChange: (value) => {
                profile.blade.heightMeters.max = millimetersToMeters(value);
                if (profile.blade.heightMeters.min > profile.blade.heightMeters.max) profile.blade.heightMeters.min = profile.blade.heightMeters.max;
                emit();
            }
        }).row);
        blade.appendChild(makeNumberSliderRow({
            label: 'Width min (mm)',
            value: metersToMillimeters(profile.blade.widthMeters.min),
            min: 0.8,
            max: 10,
            step: 0.1,
            digits: 1,
            onChange: (value) => {
                profile.blade.widthMeters.min = millimetersToMeters(value);
                if (profile.blade.widthMeters.max < profile.blade.widthMeters.min) profile.blade.widthMeters.max = profile.blade.widthMeters.min;
                emit();
            }
        }).row);
        blade.appendChild(makeNumberSliderRow({
            label: 'Width max (mm)',
            value: metersToMillimeters(profile.blade.widthMeters.max),
            min: 0.8,
            max: 10,
            step: 0.1,
            digits: 1,
            onChange: (value) => {
                profile.blade.widthMeters.max = millimetersToMeters(value);
                if (profile.blade.widthMeters.min > profile.blade.widthMeters.max) profile.blade.widthMeters.min = profile.blade.widthMeters.max;
                emit();
            }
        }).row);

        const shape = makeSection({ title: 'Shape variation', collapsedByDefault: false });
        parent.appendChild(shape);
        const shapeRows = [
            ['Bend mean (deg)', profile.shape.bendDegrees, 'mean', -60, 60, 1, 0],
            ['Bend variation (deg)', profile.shape.bendDegrees, 'variation', 0, 45, 1, 0],
            ['Inclination mean (deg)', profile.shape.inclinationDegrees, 'mean', -45, 45, 1, 0],
            ['Inclination variation (deg)', profile.shape.inclinationDegrees, 'variation', 0, 35, 1, 0],
            ['Curvature mean', profile.shape.curvature, 'mean', 0, 3, 0.01, 2],
            ['Curvature variation', profile.shape.curvature, 'variation', 0, 1.5, 0.01, 2]
        ];
        for (const [label, target, key, min, max, step, digits] of shapeRows) {
            shape.appendChild(makeNumberSliderRow({
                label,
                value: target[key],
                min,
                max,
                step,
                digits,
                onChange: (value) => {
                    target[key] = value;
                    emit();
                }
            }).row);
        }

        const appearance = makeSection({ title: 'Appearance response', collapsedByDefault: false });
        parent.appendChild(appearance);
        appearance.appendChild(makeColorRow({
            label: 'Base color',
            value: profile.appearance.baseColor,
            onChange: (value) => {
                profile.appearance.baseColor = value;
                emit();
            }
        }).row);
        appearance.appendChild(makeColorRow({
            label: 'Tip color',
            value: profile.appearance.tipColor,
            onChange: (value) => {
                profile.appearance.tipColor = value;
                emit();
            }
        }).row);
        const appearanceRows = [
            ['Hue variation (deg)', profile.appearance.colorVariation, 'hueDegrees', 0, 40, 1, 0],
            ['Saturation variation', profile.appearance.colorVariation, 'saturation', 0, 0.5, 0.01, 2],
            ['Brightness variation', profile.appearance.colorVariation, 'brightness', 0, 0.5, 0.01, 2],
            ['Dryness response', profile.appearance, 'dryness', 0, 1, 0.01, 2],
            ['Humidity response', profile.appearance, 'humidity', 0, 1, 0.01, 2]
        ];
        for (const [label, target, key, min, max, step, digits] of appearanceRows) {
            appearance.appendChild(makeNumberSliderRow({
                label,
                value: target[key],
                min,
                max,
                step,
                digits,
                onChange: (value) => {
                    target[key] = value;
                    emit();
                }
            }).row);
        }

        const carpet = makeSection({ title: 'Carpet patch', collapsedByDefault: false });
        parent.appendChild(carpet);
        carpet.appendChild(makeEl('div', 'ui-grass-lab-note', 'Primary field layout is always area_patch. It is authored independently from localized tree, edge, and corner accents.'));
        const carpetRows = [
            ['Blade density (/m²)', 'bladeDensityPerSquareMeter', 1000, 30000, 100, 0],
            ['Patch size (m)', 'patchSizeMeters', 0.25, 8, 0.05, 2],
            ['Coverage', 'coverage', 0.1, 1, 0.01, 2],
            ['Clumpiness', 'clumpiness', 0, 0.45, 0.01, 2]
        ];
        for (const [label, key, min, max, step, digits] of carpetRows) {
            carpet.appendChild(makeNumberSliderRow({
                label,
                value: profile.carpet[key],
                min,
                max,
                step,
                digits,
                onChange: (value) => {
                    profile.carpet[key] = key === 'bladeDensityPerSquareMeter' ? Math.round(value) : value;
                    emit();
                }
            }).row);
        }

        const accents = makeSection({ title: 'Localized accent tufts', collapsedByDefault: false });
        parent.appendChild(accents);
        accents.appendChild(makeEl('div', 'ui-grass-lab-note', 'Accent tufts are a separate localized recipe for future tree bases and boundary cuts; they do not define the uniform gameplay carpet.'));
        accents.appendChild(makeToggleRow({
            label: 'Enabled in recipe',
            value: profile.accents.enabled,
            onChange: (value) => {
                profile.accents.enabled = value;
                emit();
            }
        }).row);
        accents.appendChild(makeNumberSliderRow({
            label: 'Blades per tuft',
            value: profile.accents.bladesPerTuft,
            min: 1,
            max: 32,
            step: 1,
            digits: 0,
            onChange: (value) => {
                profile.accents.bladesPerTuft = Math.round(value);
                emit();
            }
        }).row);
        accents.appendChild(makeNumberSliderRow({
            label: 'Tuft radius (mm)',
            value: metersToMillimeters(profile.accents.radiusMeters),
            min: 5,
            max: 250,
            step: 1,
            digits: 0,
            onChange: (value) => {
                profile.accents.radiusMeters = millimetersToMeters(value);
                emit();
            }
        }).row);
        accents.appendChild(makeNumberSliderRow({
            label: 'Density multiplier',
            value: profile.accents.densityMultiplier,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (value) => {
                profile.accents.densityMultiplier = value;
                emit();
            }
        }).row);

        const interchange = makeSection({ title: 'Stable export / import', collapsedByDefault: false });
        parent.appendChild(interchange);
        interchange.appendChild(makeEl('div', 'ui-grass-lab-note', 'Import validates the profile schema and version before rebuilding. Save or import, reload, and compare the source hash/signature below.'));
        interchange.appendChild(makeButtonRow({
            label: 'Canonical JSON',
            text: 'Export profile',
            onClick: () => this._onExportAuthoringProfile?.(this.getState())
        }).row);
        const json = document.createElement('textarea');
        json.className = 'ui-grass-authoring-json';
        json.spellcheck = false;
        json.value = serializeLowCutGrassProfile(profile);
        interchange.appendChild(json);
        this._controls.authoringJson = json;
        interchange.appendChild(makeButtonRow({
            label: 'Validated JSON',
            text: 'Import and reload',
            onClick: () => this._onImportAuthoringProfile?.(json.value)
        }).row);
        interchange.appendChild(makeButtonRow({
            label: 'Defaults',
            text: 'Reset maintained-turf profile',
            onClick: () => this._onResetAuthoringProfile?.()
        }).row);
        const status = makeEl('div', 'ui-grass-lab-status', 'Profile is sanitized and ready for save or export.');
        interchange.appendChild(status);
        this._controls.authoringStatus = status;

        const diagnostics = makeSection({ title: 'Derivation diagnostics', collapsedByDefault: false });
        parent.appendChild(diagnostics);
        const grid = makeEl('div', 'ui-grass-lab-readouts');
        diagnostics.appendChild(grid);
        const definitions = [
            ['profile', 'Profile'],
            ['source', 'Bake source'],
            ['sourceGeometry', 'Source geometry'],
            ['signature', 'Stable signature'],
            ['runtimeGeometry', 'Runtime geometry'],
            ['runtimeMaterial', 'Runtime material'],
            ['runtimeDraws', 'Runtime fixture draws'],
            ['layouts', 'Layout split']
        ];
        this._controls.authoringReadouts = {};
        for (const [key, label] of definitions) {
            const readout = makeReadoutRow(label);
            grid.appendChild(readout.row);
            this._controls.authoringReadouts[key] = readout.valueEl;
        }
    }

    setAuthoringProfileJson(json, { preserveEditing = false } = {}) {
        const textarea = this._controls?.authoringJson ?? null;
        if (!textarea) return;
        if (preserveEditing && document.activeElement === textarea) return;
        textarea.value = String(json ?? '');
    }

    setAuthoringStatus(message) {
        const status = this._controls?.authoringStatus ?? null;
        if (status) status.textContent = String(message ?? '');
    }

    setAuthoringDiagnostics(stats) {
        const values = this._controls?.authoringReadouts ?? null;
        if (!values || !stats) return;
        const number = (value) => Number(value).toLocaleString('en-US');
        values.profile.textContent = `${stats.profileId ?? '?'} · v${stats.profileVersion ?? '?'} · seed ${stats.profileSeed ?? '?'}`;
        values.source.textContent = `${stats.sourceMeshId ?? '?'} · ${number(stats.sourceBladeCount ?? 0)} blades`;
        values.sourceGeometry.textContent = `${number(stats.sourceTriangles ?? 0)} tris · hash ${stats.sourceGeometryHash ?? '?'}`;
        values.signature.textContent = String(stats.sourceSignature ?? '?');
        values.runtimeGeometry.textContent = `${stats.runtimeSourceMeshId ?? '?'} · ${number(stats.runtimeTrianglesPerBlade ?? 0)} tri/blade`;
        values.runtimeMaterial.textContent = `${number(stats.runtimeMaterialSlots ?? 0)} slot · ${number(stats.runtimeGroupCount ?? 0)} groups`;
        values.runtimeDraws.textContent = `${number(stats.runtimeDrawCalls ?? 0)} draw for comparison patch`;
        values.layouts.textContent = `${stats.carpetLayout ?? '?'} carpet / ${stats.accentLayout ?? '?'} accents`;
    }

    setMaterialDiagnostics(stats) {
        const values = this._controls?.materialReadouts ?? null;
        if (!values || !stats) return;
        values.surface.textContent = stats.matchedMaterialId ?? '?';
        values.scale.textContent = `${Number(stats.physicalTileMeters ?? 0).toFixed(1)} × ${Number(stats.physicalTileMeters ?? 0).toFixed(1)} m`;
        values.maps.textContent = `${Number(stats.farMapCount ?? 0)} maps · no baked light`;
        values.substrate.textContent = stats.substrateMaterialId ?? '?';
        values.atlas.textContent = `${Number(stats.clusterAtlas?.variants ?? 0)} variants · ${Number(stats.clusterAtlas?.materialPaths ?? 0)} material · ${Number(stats.clusterAtlas?.logicalDraws ?? 0)} draw`;
        values.mips.textContent = `alpha ${Number(stats.clusterAtlas?.alphaCutoff ?? 0).toFixed(2)} · A2C · trilinear · dilated RGB`;
        values.provenance.textContent = `${stats.provenance?.profileId ?? '?'} v${stats.provenance?.profileVersion ?? '?'} · ${stats.provenance?.license ?? '?'}`;
        values.pipeline.textContent = 'global catalog → calibration → local overrides';
    }

    setLabDiagnostics(snapshot) {
        const values = this._controls?.labReadouts ?? null;
        if (!values || !snapshot) return;
        const grass = snapshot.grass ?? {};
        const frame = snapshot.frame ?? {};
        const fixtures = snapshot.fixtures ?? {};
        const lod = snapshot.lod ?? {};
        const number = (value) => Number(value).toLocaleString('en-US');
        const milliseconds = (value) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)} ms` : 'unavailable';
        values.runtime.textContent = `${snapshot.canonicalRuntime ?? 'GrassEngine'} · contract v${snapshot.contractVersion ?? '?'}`;
        values.fixtures.textContent = `${number(fixtures.roadSegments ?? 0)} road / ${number(fixtures.boundaryFeatures ?? 0)} exact boundary features / ${number(fixtures.treePlacements ?? 0)} trees`;
        values.instances.textContent = number(grass.instances ?? 0);
        values.triangles.textContent = number(grass.triangles ?? 0);
        values.draws.textContent = number(grass.logicalDrawCalls ?? 0);
        values.cpu.textContent = milliseconds(grass.updateCpuMs);
        values.gpu.textContent = milliseconds(frame.gpuMs);
        values.renderer.textContent = `${number(frame.rendererDrawCalls ?? 0)} draws / ${number(frame.rendererTriangles ?? 0)} tris`;
        values.lod.textContent = `${Number(lod.viewAngleDeg ?? 0).toFixed(1)}° / scale ${Number(lod.angleScale ?? 1).toFixed(2)}`;
        const near = grass.nearCarpet ?? {};
        values.nearCarpet.textContent = near.enabled
            ? `${number(near.cellInstances ?? 0)} cells · ${number(near.rootInstances ?? 0)} roots · ${number(near.fiberInstances ?? 0)} fibers · ${number(near.drawCalls ?? 0)} draws`
            : 'disabled';
        this.setNearCarpetDiagnostics(near);
        const mid = grass.midCluster ?? {};
        const billboard = mid.billboard ?? {};
        const middle = mid.middle ?? {};
        values.midCluster.textContent = mid.enabled
            ? `${number(billboard.visibleUnits ?? billboard.instances ?? 0)} billboard / ${number(middle.visibleUnits ?? middle.instances ?? 0)} middle · ${number(mid.triangles ?? 0)} tris · ${number(mid.drawCalls ?? 0)} draws`
            : 'disabled';
        this.setAutoLodDiagnostics(lod, mid);
        const localized = grass.localizedAccents ?? {};
        values.accents.textContent = localized.enabled
            ? `${number(localized.visibleClusters ?? 0)}/${number(localized.potentialClusters ?? 0)} clusters · ${number(localized.totalTriangles ?? 0)} tris · ${number(localized.totalDrawCalls ?? 0)} draws`
            : 'disabled';
        this.setLocalizedAccentDiagnostics(localized, snapshot.coverage ?? {});
        const coverage = snapshot.coverage ?? {};
        values.coverage.textContent = coverage.enabled
            ? `${Number(coverage.structuralBaseHeightMeters ?? 0) * 1000} mm base · ${number(coverage.triangles ?? 0)} tris · ${number(coverage.drawCalls ?? 0)} draws`
            : 'disabled';
        this.setCoverageDiagnostics(coverage);
    }

    setValidationDiagnostics(report) {
        const values = this._controls?.validationReadouts ?? null;
        if (!values || !report) return;
        const snapshot = report.snapshot ?? {};
        const validation = report.validation ?? {};
        const grass = snapshot.grass ?? {};
        const lod = snapshot.lod ?? {};
        const budget = report.budgetResult ?? {};
        const measurements = budget.measurements ?? {};
        const instances = grass.instancesByTier ?? {};
        const triangles = grass.trianglesByTier ?? {};
        const number = (value) => Number(value ?? 0).toLocaleString('en-US');
        const milliseconds = (value) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)} ms` : 'unavailable';
        values.review.textContent = `${validation.qualityPreset ?? 'default'} · ${validation.cameraPreset ?? '?'} · ${validation.lightingPreset ?? '?'} · ${validation.motionPath ?? 'stationary'}`;
        values.lod.textContent = `${lod.activeTier ?? 'texture'} · ${Number(lod.effectiveDistanceMeters ?? 0).toFixed(2)} m · ${Number(lod.viewAngleDeg ?? 0).toFixed(1)}° · scale ${Number(lod.angleScale ?? 1).toFixed(2)}`;
        values.instances.textContent = `near ${number(instances.near)} · billboard ${number(instances.billboard)} · middle ${number(instances.middle ?? instances.mid)} · accents ${number(instances.accent)}`;
        values.triangles.textContent = `near ${number(triangles.near)} · billboard ${number(triangles.billboard)} · middle ${number(triangles.middle ?? triangles.mid)} · accents ${number(triangles.accent)} · total ${number(grass.triangles)}`;
        values.draws.textContent = `${Number(measurements.averageDrawCalls ?? grass.logicalDrawCalls ?? 0).toFixed(2)} avg · ${number(measurements.maximumDrawCalls ?? grass.logicalDrawCalls)} max · 12 hard ceiling`;
        values.timing.textContent = `${milliseconds(measurements.averageCpuMs)} CPU · ${milliseconds(measurements.averageGpuMs)} whole-frame GPU proxy · ${number(budget.sampleCount)} samples`;
        values.buffers.textContent = `${Number(report.bufferUpdatesPerSecond ?? 0).toFixed(2)}/s · ${number(report.bufferUpdatesTotal ?? 0)} total · stationary should settle to 0/s`;
        values.budget.textContent = `${budget.pass ? 'PASS' : 'MEASURING'} · CPU ≤0.60 ms · GPU proxy ≤1.50 ms · ≤12 draws · field ≈50K / combined ≤200K`;
        const cameraSeen = validation.reviewedCameraIds?.length ?? 0;
        const lightSeen = validation.reviewedLightingIds?.length ?? 0;
        const pathSeen = validation.reviewedMotionPathIds?.length ?? 0;
        values.coverage.textContent = `${cameraSeen} cameras · ${lightSeen}/4 lights · ${pathSeen}/5 paths`;
        values.stress.textContent = report.stress?.completed
            ? `${report.stress.pass ? 'PASS' : 'REVIEW'} · ${number(report.stress.triangles)} tris · ${number(report.stress.drawCalls)} draws`
            : 'not run';
        values.approval.textContent = report.approval?.status === 'approved'
            ? `APPROVED · ${report.approval.generatedAt ?? ''}`
            : `PENDING · ${report.approval?.missingRegressions?.length ?? 11} regression checks remaining`;
    }

    setNearCarpetDiagnostics(stats) {
        const values = this._controls?.nearCarpetReadouts ?? null;
        if (!values || !stats) return;
        const number = (value) => Number(value).toLocaleString('en-US');
        const signature = String(stats.boundarySignature ?? '');
        const tips = stats.bladeTipElevationMeters ?? {};
        const visibleLengths = stats.visibleBladeLengthMeters ?? {};
        const observedTips = stats.observedTipElevationMeters ?? {};
        values.layout.textContent = `${Number(stats.ownershipCellSizeMeters ?? 0).toFixed(2)} m cells · ${number(stats.rootBinsPerSquareMeter ?? 0)} root bins/m² · ${number(stats.fibersPerRoot ?? 0)} fibers/root`;
        values.coverage.textContent = `${stats.coverageMode ?? 'unknown'} · ${number(stats.eligibleBins ?? 0)} eligible / ${number(stats.representedBins ?? 0)} represented / ${number(stats.unrepresentedEligibleBins ?? 0)} missing`;
        values.area.textContent = `${Number(stats.eligibleAreaSquareMeters ?? 0).toFixed(2)} m² eligible · ${Number(stats.representedAreaSquareMeters ?? 0).toFixed(2)} m² represented`;
        values.clipping.textContent = `${number(stats.boundaryRoots ?? 0)} boundary roots · ${number(stats.clippedRoots ?? 0)} clipped · sidewalk ${number(stats.sidewalkRejectedRoots ?? 0)} / tree ${number(stats.treeRejectedRoots ?? 0)}`;
        values.boundary.textContent = `${signature ? signature.slice(0, 24) : 'no exact signature'} · ${(Number(stats.rootClearanceMeters ?? 0) * 1000).toFixed(1)} mm clearance · ${number(stats.exactPostcheckFailures ?? 0)} postcheck failures`;
        values.height.textContent = `${(Number(stats.structuralBaseHeightMeters ?? 0) * 1000).toFixed(1)} mm base · ${(Number(tips.min ?? 0) * 1000).toFixed(1)}–${(Number(tips.max ?? 0) * 1000).toFixed(1)} mm absolute tips · ${(Number(visibleLengths.min ?? 0) * 1000).toFixed(1)}–${(Number(visibleLengths.max ?? 0) * 1000).toFixed(1)} mm visible · observed ${(Number(observedTips.min ?? 0) * 1000).toFixed(1)}–${(Number(observedTips.max ?? 0) * 1000).toFixed(1)} mm`;
        values.visible.textContent = `${number(stats.cellInstances ?? 0)} cells · ${number(stats.rootInstances ?? 0)} roots · ${number(stats.fiberInstances ?? 0)} fibers · ${number(stats.chunks ?? 0)} chunks`;
        values.cost.textContent = `${number(stats.triangles ?? 0)} tris · ${number(stats.drawCalls ?? 0)} draws · ${number(stats.materialPaths ?? 0)} material`;
        values.material.textContent = `${stats.materialId ?? 'unresolved'} · ${stats.depthWrite ? 'depth write' : 'no depth write'} · zero emissive`;
        values.buffers.textContent = `${number(stats.lastBufferUpdates ?? 0)} now · ${number(stats.totalBufferUpdates ?? 0)} total · ${number(stats.stationaryFrames ?? 0)} stationary frames · cache ${number(stats.cacheHits ?? 0)} hit / ${number(stats.cacheMisses ?? 0)} miss`;
        values.churn.textContent = `${number(stats.lastEnteringCells ?? 0)} enter / ${number(stats.lastLeavingCells ?? 0)} leave / ${number(stats.retainedCells ?? 0)} retained · ${number(stats.cacheInvalidations ?? 0)} invalidations`;
        values.safety.textContent = `${stats.frustumCulled ? 'culled' : 'unculled'} · ${stats.castShadow ? 'shadows' : 'no shadows'} · ${stats.transparent ? 'transparent' : 'opaque'}`;
    }

    setAutoLodDiagnostics(lod, field) {
        const values = this._controls?.autoLodReadouts ?? null;
        if (!values || !lod) return;
        const number = (value) => Number(value).toLocaleString('en-US');
        values.mode.textContent = `${lod.force ?? 'auto'} · ${lod.activeTier ?? 'texture'}`;
        values.response.textContent = `${Number(lod.effectiveDistanceMeters ?? 0).toFixed(2)} m effective · ${Number(lod.viewAngleDeg ?? 0).toFixed(1)}° · scale ${Number(lod.angleScale ?? 1).toFixed(2)}`;
        values.ranges.textContent = `close ${Number(lod.nearEndMeters ?? 0).toFixed(1)} m · billboard ${Number(lod.billboardEndMeters ?? 0).toFixed(1)} m · middle ${Number(lod.middleEndMeters ?? 0).toFixed(1)} m · cutoff ${Number(lod.geometryCutoffWorldMeters ?? 0).toFixed(1)} m world`;
        values.transition.textContent = `${String(lod.transitionState ?? 'texture_only').replaceAll('_', ' ')} · ${number(field?.transitionUnits ?? 0)} transition / ${number(field?.overlapUnits ?? 0)} overlap units`;
        values.field.textContent = `${number(field?.billboard?.visibleUnits ?? 0)} billboard · ${number(field?.middle?.visibleUnits ?? 0)} middle · ${number(field?.representedUnits ?? 0)}/${number(field?.eligibleUnits ?? 0)} represented · ${number(field?.atlasVariants ?? 0)} variants`;
        values.cost.textContent = `${number(field?.triangles ?? 0)} tris · ${number(field?.drawCalls ?? 0)} draws/${number(field?.batches ?? 0)} batches · ${number(field?.lastBufferUpdates ?? 0)} now/${number(field?.totalBufferUpdates ?? 0)} total uploads`;
        values.material.textContent = `${Number(field?.alphaCutoff ?? 0).toFixed(2)} cutoff · ${field?.alphaToCoverage ? 'A2C' : 'no A2C'} · ${field?.transparent ? 'transparent' : 'opaque'} · zero emissive`;
        values.cutoff.textContent = `${number(lod.geometryBeyondCutoff ?? 0)} beyond cutoff · ${number(field?.exactPostcheckFailures ?? 0)} root / ${number(field?.exactEnvelopeFailures ?? 0)} envelope failures · ${String(field?.boundarySignature ?? 'no signature').slice(0, 20)}`;
    }

    setLocalizedAccentDiagnostics(stats, coverage) {
        const values = this._controls?.localizedAccentReadouts ?? null;
        if (!values || !stats) return;
        const number = (value) => Number(value).toLocaleString('en-US');
        values.eligibility.textContent = `${coverage?.accentEligibility ? 'eligible' : 'blocked'} · ${stats.layout ?? 'localized_feature_accents'} only · ${stats.substrateOwnership ?? 'coverage_tree_hole'}`;
        values.placements.textContent = `${number(stats.eligibleTrees ?? 0)}/${number(stats.treePlacements ?? 0)} trees · ${number(stats.optionalFeatures ?? 0)} optional feature`;
        values.visible.textContent = `${number(stats.visibleClusters ?? 0)}/${number(stats.potentialClusters ?? 0)} clusters · ${number(stats.clustersPerTree ?? 0)}/tree`;
        values.cost.textContent = `${number(stats.grassTriangles ?? 0)} tris · ${number(stats.grassDrawCalls ?? 0)} draw · ${number(stats.grassMaterialPaths ?? 0)} atlas material`;
        values.worn.textContent = `${number(stats.wornPatches ?? 0)} patches · ${number(stats.wornTriangles ?? 0)} tris · ${number(stats.wornDrawCalls ?? 0)} draws · V2 requires zero`;
        values.batching.textContent = `${number(stats.totalDrawCalls ?? 0)} global draws · ${number(stats.trianglesPerTreeAccent ?? 0)} grass tris/tree`;
        values.determinism.textContent = String(stats.deterministicSignature ?? '?');
        values.rejections.textContent = `${number(stats.rejectedCoverage ?? 0)} coverage · ${number(stats.rejectedInsideTrunk ?? 0)} inside trunk`;
        values.safety.textContent = `${stats.frustumCulled ? 'culled' : 'unculled'} · ${stats.castShadow ? 'shadows' : 'no shadows'} · ${stats.transparent ? 'transparent' : 'opaque'} · ${number(stats.geometryBeyondCutoff ?? 0)} beyond cutoff`;
    }

    setCoverageDiagnostics(stats) {
        const values = this._controls?.coverageReadouts ?? null;
        if (!values || !stats) return;
        const number = (value) => Number(value).toLocaleString('en-US');
        values.occupancy.textContent = `${stats.occupancy ?? '?'} · substrate blend ${stats.substrateBlendIndependent ? 'independent' : 'coupled'}`;
        values.response.textContent = `density ×${Number(stats.densityMultiplier ?? 0).toFixed(2)} · humidity ${Number(stats.humidity ?? 0).toFixed(2)} · dryness ${Number(stats.dryness ?? 0).toFixed(2)} · accents ${stats.accentEligibility ? 'eligible' : 'blocked'}`;
        values.height.textContent = `${(Number(stats.structuralBaseHeightMeters ?? 0) * 1000).toFixed(1)} mm base · ${(Number(stats.visibleBladeTipMinMeters ?? 0) * 1000).toFixed(0)}–${(Number(stats.visibleBladeTipMaxMeters ?? 0) * 1000).toFixed(0)} mm tips`;
        values.boundary.textContent = `${number(stats.sidewalkSegments ?? 0)} sidewalk / ${number(stats.curvedSegments ?? 0)} curve / ${number(stats.diagonalSegments ?? 0)} diagonal segments`;
        values.corners.textContent = `${number(stats.outsideCorners ?? 0)} outside / ${number(stats.insideCorners ?? 0)} inside`;
        values.geometry.textContent = `${number(stats.capTriangles ?? 0)} cap + ${number(stats.rootThatchTriangles ?? 0)} root/thatch + ${number(stats.cutEdgeTriangles ?? 0)} cut-edge tris`;
        values.cost.textContent = `${number(stats.drawCalls ?? 0)} draws · ${number(stats.physicalEdgeLogicalDraws ?? 0)} physical-edge draw · ${number(stats.fringeBlades ?? 0)} dense edge pairs`;
        values.data.textContent = `${(Number(stats.grassOnsetWidthMeters ?? 0) * 1000).toFixed(0)} mm sidewalk reveal · ${(Number(stats.antialiasWidthMeters ?? 0) * 1000).toFixed(0)} mm AA · opaque polygon cap`;
        values.safety.textContent = `${number(stats.hardExclusionIntrusions ?? 0)} intrusions · ${number(stats.ineligibleCutEdgeRoots ?? 0)} ineligible roots · ${stats.sourceLoopIdentity ?? '?'}`;
    }

    setLabCaptureStatus(message) {
        const status = this._controls?.labCaptureStatus ?? null;
        if (status) status.textContent = String(message ?? '');
    }

    _buildRegionRows(lodState, { onAnyChange } = {}) {
        const rows = [];

        rows.push(makeNumberSliderRow({
            label: 'Inner radius (m)',
            value: lodState.region.innerMeters,
            min: 0,
            max: 800,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lodState.region.innerMeters = v;
                if (lodState.region.outerMeters < v) lodState.region.outerMeters = v;
                onAnyChange?.();
            }
        }).row);

        rows.push(makeNumberSliderRow({
            label: 'Outer radius (m)',
            value: lodState.region.outerMeters,
            min: 0,
            max: 800,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lodState.region.outerMeters = v;
                if (lodState.region.innerMeters > v) lodState.region.innerMeters = v;
                onAnyChange?.();
            }
        }).row);

        rows.push(makeNumberSliderRow({
            label: 'Min grazing (deg)',
            value: lodState.angle.minGrazingDeg,
            min: 0,
            max: 90,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lodState.angle.minGrazingDeg = v;
                if (lodState.angle.maxGrazingDeg < v) lodState.angle.maxGrazingDeg = v;
                onAnyChange?.();
            }
        }).row);

        rows.push(makeNumberSliderRow({
            label: 'Max grazing (deg)',
            value: lodState.angle.maxGrazingDeg,
            min: 0,
            max: 90,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lodState.angle.maxGrazingDeg = v;
                if (lodState.angle.minGrazingDeg > v) lodState.angle.minGrazingDeg = v;
                onAnyChange?.();
            }
        }).row);

        return rows;
    }

    _buildDebugRows(lodState, { onAnyChange } = {}) {
        const rows = [];

        rows.push(makeToggleRow({
            label: 'Print region on floor',
            value: lodState.debug.printRegion,
            onChange: (v) => {
                lodState.debug.printRegion = v;
                onAnyChange?.();
            }
        }).row);

        rows.push(makeToggleRow({
            label: 'Draw boundary lines',
            value: lodState.debug.drawBounds,
            onChange: (v) => {
                lodState.debug.drawBounds = v;
                onAnyChange?.();
            }
        }).row);

        return rows;
    }

    _buildCoverageTab(parent) {
        const coverage = this._state.coverage && typeof this._state.coverage === 'object'
            ? this._state.coverage
            : (this._state.coverage = {});
        const defaults = {
            enabled: true,
            showSurface: true,
            showEdge: true,
            showLip: true,
            showFringe: true,
            layerHeightMillimeters: 27.5,
            substrateRevealMillimeters: 80,
            densityMultiplier: 1,
            farCoverageThreshold: 0.35,
            edgeAntialiasMillimeters: 12,
            rootClearanceMillimeters: 3,
            cutEdgeEnabled: true,
            cutEdgeSpacingMeters: 0.018,
            cutEdgeInsetMeters: 0.004,
            visibleBladeTipMinMillimeters: 40,
            visibleBladeTipMaxMillimeters: 75,
            accentEligibility: true
        };
        for (const [key, value] of Object.entries(defaults)) if (coverage[key] === undefined) coverage[key] = value;

        const contract = makeSection({ title: 'AI 359 exact polygon coverage contract', collapsedByDefault: false });
        parent.appendChild(contract);
        contract.appendChild(makeEl('div', 'ui-grass-lab-note', 'The rendered sidewalk outer loop drives an 80 mm uncovered substrate reveal and an opaque polygon cap. The 27.5 mm root/thatch base is separate from irregular 40–75 mm cut-edge blade tips.'));
        contract.appendChild(makeToggleRow({
            label: 'Coverage enabled',
            value: coverage.enabled !== false,
            onChange: (value) => {
                coverage.enabled = value;
                this._emit();
            }
        }).row);
        contract.appendChild(makeNumberSliderRow({
            label: 'Structural base height (mm)',
            value: coverage.layerHeightMillimeters,
            min: 15,
            max: 50,
            step: 0.5,
            digits: 1,
            onChange: (value) => {
                coverage.layerHeightMillimeters = value;
                this._emit();
            }
        }).row);
        contract.appendChild(makeNumberSliderRow({
            label: 'Exposed substrate (mm)',
            value: coverage.substrateRevealMillimeters,
            min: 60,
            max: 100,
            step: 1,
            digits: 0,
            onChange: (value) => {
                coverage.substrateRevealMillimeters = value;
                this._emit();
            }
        }).row);
        contract.appendChild(makeNumberSliderRow({
            label: 'Density multiplier',
            value: coverage.densityMultiplier,
            min: 0,
            max: 2,
            step: 0.05,
            digits: 2,
            onChange: (value) => {
                coverage.densityMultiplier = value;
                this._emit();
            }
        }).row);
        contract.appendChild(makeNumberSliderRow({
            label: 'Visible tip maximum (mm)',
            value: coverage.visibleBladeTipMaxMillimeters,
            min: 40,
            max: 120,
            step: 1,
            digits: 0,
            onChange: (value) => {
                coverage.visibleBladeTipMaxMillimeters = value;
                this._emit();
            }
        }).row);
        contract.appendChild(makeNumberSliderRow({
            label: 'Edge AA limit (mm)',
            value: coverage.edgeAntialiasMillimeters,
            min: 0,
            max: 15,
            step: 1,
            digits: 0,
            tooltip: 'Documents the maximum narrow antialias treatment. The footprint itself stays binary.',
            onChange: (value) => {
                coverage.edgeAntialiasMillimeters = value;
                this._emit();
            }
        }).row);
        contract.appendChild(makeToggleRow({
            label: 'Accent eligible',
            value: coverage.accentEligibility !== false,
            tooltip: 'Consumed later by AI 356; this does not place tufts in AI 354.',
            onChange: (value) => {
                coverage.accentEligibility = value;
                this._emit();
            }
        }).row);

        const layers = makeSection({ title: 'Two-draw boundary layers', collapsedByDefault: false });
        parent.appendChild(layers);
        for (const [key, label] of [['showSurface', 'Opaque polygon cap'], ['showEdge', 'Continuous root/thatch cut edge']]) {
            layers.appendChild(makeToggleRow({
                label,
                value: coverage[key] !== false,
                onChange: (value) => {
                    coverage[key] = value;
                    this._emit();
                }
            }).row);
        }
        layers.appendChild(makeNumberSliderRow({
            label: 'Dense edge spacing (m)',
            value: coverage.cutEdgeSpacingMeters,
            min: 0.008,
            max: 0.04,
            step: 0.001,
            digits: 3,
            onChange: (value) => {
                coverage.cutEdgeSpacingMeters = value;
                this._emit();
            }
        }).row);
        layers.appendChild(makeNumberSliderRow({
            label: 'Cut-edge root inset (m)',
            value: coverage.cutEdgeInsetMeters,
            min: 0.001,
            max: 0.02,
            step: 0.001,
            digits: 3,
            onChange: (value) => {
                coverage.cutEdgeInsetMeters = value;
                this._emit();
            }
        }).row);

        const cameras = makeSection({ title: 'Deterministic acceptance cameras', collapsedByDefault: false });
        parent.appendChild(cameras);
        cameras.appendChild(makeButtonRow({ label: 'Straight sidewalk', text: 'Focus straight hard edge', onClick: () => this._onFocusCoverage?.('straight') }).row);
        cameras.appendChild(makeButtonRow({ label: 'Curved sidewalk', text: 'Focus rendered curve chords', onClick: () => this._onFocusCoverage?.('curve') }).row);
        cameras.appendChild(makeButtonRow({ label: 'Diagonal sidewalk', text: 'Focus long diagonal cut', onClick: () => this._onFocusCoverage?.('diagonal') }).row);
        cameras.appendChild(makeButtonRow({ label: 'Inside corner', text: 'Focus physical inside corner', onClick: () => this._onFocusCoverage?.('inside_corner') }).row);
        cameras.appendChild(makeButtonRow({ label: 'Outside corner', text: 'Focus physical outside corner', onClick: () => this._onFocusCoverage?.('outside_corner') }).row);
        cameras.appendChild(makeButtonRow({ label: 'Tree base', text: 'Focus shared-substrate exclusion', onClick: () => this._onFocusCoverage?.('tree_base') }).row);

        const diagnostics = makeSection({ title: 'Coverage diagnostics', collapsedByDefault: false });
        parent.appendChild(diagnostics);
        const grid = makeEl('div', 'ui-grass-lab-readouts');
        diagnostics.appendChild(grid);
        this._controls.coverageReadouts = {};
        for (const [key, label] of [
            ['occupancy', 'Occupancy'],
            ['response', 'Control response'],
            ['height', 'Physical edge'],
            ['boundary', 'Boundary batches'],
            ['corners', 'Corner fixtures'],
            ['geometry', 'Geometry split'],
            ['cost', 'Boundary cost'],
            ['data', 'Coverage data'],
            ['safety', 'Render safety']
        ]) {
            const readout = makeReadoutRow(label);
            grid.appendChild(readout.row);
            this._controls.coverageReadouts[key] = readout.valueEl;
        }
    }

    _buildLocalizedAccentsTab(parent) {
        const accents = this._state.accents && typeof this._state.accents === 'object'
            ? this._state.accents
            : (this._state.accents = {});
        const defaults = {
            enabled: true,
            wornEnabled: false,
            featureAccentsEnabled: true,
            clustersPerTree: 4,
            clustersPerFeature: 3,
            trunkRadiusMeters: 0.55,
            ringInnerMeters: 0.82,
            ringOuterMeters: 1.25,
            wornRadiusMeters: 0.76,
            cardWidthMeters: 0.24,
            cardHeightMeters: 0.075
        };
        for (const [key, value] of Object.entries(defaults)) if (accents[key] === undefined) accents[key] = value;

        const contract = makeSection({ title: 'AI 361 localized accent contract', collapsedByDefault: false });
        parent.appendChild(contract);
        contract.appendChild(makeEl('div', 'ui-grass-lab-note', 'Low clumps are reserved for explicit tree and optional-feature records. Four deterministic two-card clumps provide sixteen grass triangles per tree; worn-substrate geometry remains disabled.'));
        contract.appendChild(makeToggleRow({
            label: 'Localized accents enabled',
            value: accents.enabled !== false,
            onChange: (value) => {
                accents.enabled = value;
                this._emit();
            }
        }).row);
        contract.appendChild(makeEl('div', 'ui-grass-lab-note', 'Tree wear is an AI 359 polygon exclusion that reveals the shared substrate. The legacy opaque worn disc is disabled.'));
        contract.appendChild(makeToggleRow({
            label: 'Optional feature accent',
            value: accents.featureAccentsEnabled !== false,
            onChange: (value) => {
                accents.featureAccentsEnabled = value;
                this._emit();
            }
        }).row);

        const geometry = makeSection({ title: 'Bounded tree ring', collapsedByDefault: false });
        parent.appendChild(geometry);
        for (const definition of [
            ['clustersPerTree', 'Clusters / tree', 3, 6, 1, 0],
            ['ringInnerMeters', 'Ring inner radius (m)', 0.35, 1.5, 0.01, 2],
            ['ringOuterMeters', 'Ring outer radius (m)', 0.5, 2.4, 0.01, 2],
            ['wornRadiusMeters', 'Worn radius (m)', 0.25, 1.2, 0.01, 2],
            ['cardWidthMeters', 'Card width (m)', 0.08, 0.45, 0.01, 2],
            ['cardHeightMeters', 'Card height (m)', 0.035, 0.12, 0.005, 3]
        ]) {
            const [key, label, min, max, step, digits] = definition;
            geometry.appendChild(makeNumberSliderRow({
                label,
                value: accents[key],
                min,
                max,
                step,
                digits,
                onChange: (value) => {
                    accents[key] = key === 'clustersPerTree' ? Math.round(value) : value;
                    this._emit();
                }
            }).row);
        }

        const cameras = makeSection({ title: 'Deterministic comparison cameras', collapsedByDefault: false });
        parent.appendChild(cameras);
        cameras.appendChild(makeButtonRow({ label: 'Tree base', text: 'Focus tree intersection', onClick: () => this._onFocusLocalizedAccent?.('tree') }).row);
        cameras.appendChild(makeButtonRow({ label: 'Feature irregularity', text: 'Focus explicit feature accent', onClick: () => this._onFocusLocalizedAccent?.('wornFeature') }).row);

        const diagnostics = makeSection({ title: 'Localized accent diagnostics', collapsedByDefault: false });
        parent.appendChild(diagnostics);
        const grid = makeEl('div', 'ui-grass-lab-readouts');
        diagnostics.appendChild(grid);
        this._controls.localizedAccentReadouts = {};
        for (const [key, label] of [
            ['eligibility', 'Coverage eligibility'],
            ['placements', 'Placement records'],
            ['visible', 'Visible accents'],
            ['cost', 'Grass accent cost'],
            ['worn', 'Worn substrate cost'],
            ['batching', 'Batching'],
            ['determinism', 'Determinism'],
            ['rejections', 'Rejected roots'],
            ['safety', 'Render safety']
        ]) {
            const readout = makeReadoutRow(label);
            grid.appendChild(readout.row);
            this._controls.localizedAccentReadouts[key] = readout.valueEl;
        }
    }

    _buildLod1Body(parent) {
        const lod = this._state.lod1;
        lod.carpetMode = ['auto', 'force', 'disabled'].includes(String(lod.carpetMode)) ? String(lod.carpetMode) : 'auto';
        lod.carpetPatchSizeMeters = Number.isFinite(Number(lod.carpetPatchSizeMeters)) ? Number(lod.carpetPatchSizeMeters) : 1;
        lod.carpetBladesPerSquareMeter = Number.isFinite(Number(lod.carpetBladesPerSquareMeter)) ? Number(lod.carpetBladesPerSquareMeter) : 64;
        lod.carpetFibersPerRoot = Number.isFinite(Number(lod.carpetFibersPerRoot)) ? Number(lod.carpetFibersPerRoot) : 3;
        lod.carpetRadiusMeters = Number.isFinite(Number(lod.carpetRadiusMeters)) ? Number(lod.carpetRadiusMeters) : 3;

        const carpet = makeSection({ title: 'Near geometry tier', collapsedByDefault: false });
        parent.appendChild(carpet);
        carpet.appendChild(makeEl('div', 'ui-grass-lab-note', 'Cohesive V2 root bins fill one-metre ownership cells, follow the exact AI359 polygon cut, and render three varied physical fibers per root. Forced-near is the AI360 diagnostic; AI361 owns automatic handoffs.'));

        carpet.appendChild(makeToggleRow({
            label: 'Enabled',
            value: lod.enabled,
            onChange: (v) => {
                lod.enabled = v;
                this._emit();
            }
        }).row);

        carpet.appendChild(makeSelectRow({
            label: 'Tier availability',
            value: lod.carpetMode,
            options: [
                { id: 'auto', label: 'Auto LOD' },
                { id: 'force', label: 'Force near diagnostic' },
                { id: 'disabled', label: 'Disabled' }
            ],
            onChange: (value) => {
                lod.carpetMode = value;
                if (value === 'force') this._state.autoLod.force = 'near';
                else if (this._state.autoLod.force === 'near') this._state.autoLod.force = 'auto';
                this._emit();
            }
        }).row);

        const patchSize = makeNumberSliderRow({
            label: 'Ownership cell (m)',
            value: lod.carpetPatchSizeMeters,
            min: 0.5,
            max: 2,
            step: 0.25,
            digits: 2,
            onChange: (value) => {
                lod.carpetPatchSizeMeters = value;
                this._emit();
            }
        });
        carpet.appendChild(patchSize.row);

        const density = makeNumberSliderRow({
            label: 'Root bins / m²',
            value: lod.carpetBladesPerSquareMeter,
            min: 1,
            max: 96,
            step: 1,
            digits: 0,
            onChange: (value) => {
                lod.carpetBladesPerSquareMeter = Math.round(value);
                this._emit();
            }
        });
        carpet.appendChild(density.row);
        this._controls.nearCarpetDensity = density;

        const fibers = makeNumberSliderRow({
            label: 'Fibers / root',
            value: lod.carpetFibersPerRoot,
            min: 2,
            max: 4,
            step: 1,
            digits: 0,
            onChange: (value) => {
                lod.carpetFibersPerRoot = Math.round(value);
                this._emit();
            }
        });
        carpet.appendChild(fibers.row);

        const radius = makeNumberSliderRow({
            label: 'Near end (m)',
            value: lod.carpetRadiusMeters,
            min: 1,
            max: 12,
            step: 0.5,
            digits: 1,
            onChange: (value) => {
                lod.carpetRadiusMeters = value;
                this._state.autoLod.nearEndMeters = value;
                this._emit();
            }
        });
        carpet.appendChild(radius.row);

        carpet.appendChild(makeButtonRow({
            label: 'Camera',
            text: 'Focus near carpet',
            onClick: () => this._onFocusNearCarpet?.()
        }).row);

        const diagnostics = makeEl('div', 'ui-grass-lab-readouts');
        carpet.appendChild(diagnostics);
        this._controls.nearCarpetReadouts = {};
        for (const [key, label] of [
            ['layout', 'Ownership / root layout'],
            ['coverage', 'Exact coverage bins'],
            ['area', 'Represented area'],
            ['clipping', 'Root clipping'],
            ['boundary', 'Boundary safety'],
            ['height', 'Physical height'],
            ['visible', 'Visible instances'],
            ['cost', 'Geometry cost'],
            ['material', 'Shared material'],
            ['buffers', 'Buffer updates'],
            ['churn', 'Cell churn'],
            ['safety', 'Render safety']
        ]) {
            const readout = makeReadoutRow(label);
            diagnostics.appendChild(readout.row);
            this._controls.nearCarpetReadouts[key] = readout.valueEl;
        }

        const section = makeSection({ title: 'Legacy LOD 1 inputs (dormant)', collapsedByDefault: true });
        parent.appendChild(section);
        section.appendChild(makeEl('div', 'ui-grass-lab-note', 'Preserved for later LOD reconciliation and the blade inspector. AI 353 does not render this older sparse per-blade field.'));

        for (const row of this._buildRegionRows(lod, { onAnyChange: () => this._emit() })) section.appendChild(row);
        for (const row of this._buildDebugRows(lod, { onAnyChange: () => this._emit() })) section.appendChild(row);

        section.appendChild(makeSelectRow({
            label: 'Blade mesh',
            value: lod.bladeMeshId,
            options: [
                { id: PROCEDURAL_MESH.SOCCER_GRASS_BLADE_V1, label: 'Soccer Grass Blade (lo-res)' },
                { id: PROCEDURAL_MESH.SOCCER_GRASS_BLADE_HIRES_V1, label: 'Blade (hi-res)' }
            ],
            onChange: (id) => {
                lod.bladeMeshId = id;
                this._emit();
            }
        }).row);

        section.appendChild(makeSeedRow({
            label: 'Seed',
            value: lod.seed,
            onChange: (v) => {
                lod.seed = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeLogNumberSliderRow({
            label: 'Density (blades / tile)',
            value: lod.densityPerTile,
            min: 0,
            max: 2000000,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.densityPerTile = Math.round(v);
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Random yaw (deg)',
            value: lod.randomYawDeg,
            min: 0,
            max: 360,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.randomYawDeg = v;
                this._emit();
            }
        }).row);

        const bladeBendMinRow = makeNumberSliderRow({
            label: 'Blade bend min (deg)',
            value: lod.bladeBend.min,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.bladeBend.min = v;
                if (lod.bladeBend.max < v) lod.bladeBend.max = v;
                this._emit();
            }
        });
        section.appendChild(bladeBendMinRow.row);
        this._controls.lod1BladeBendMin = bladeBendMinRow;

        const bladeBendMaxRow = makeNumberSliderRow({
            label: 'Blade bend max (deg)',
            value: lod.bladeBend.max,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.bladeBend.max = v;
                if (lod.bladeBend.min > v) lod.bladeBend.min = v;
                this._emit();
            }
        });
        section.appendChild(bladeBendMaxRow.row);
        this._controls.lod1BladeBendMax = bladeBendMaxRow;

        const tipBendMinRow = makeNumberSliderRow({
            label: 'Tip bend min (deg)',
            value: lod.tipBend.min,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.tipBend.min = v;
                if (lod.tipBend.max < v) lod.tipBend.max = v;
                this._emit();
            }
        });
        section.appendChild(tipBendMinRow.row);
        this._controls.lod1TipBendMin = tipBendMinRow;

        const tipBendMaxRow = makeNumberSliderRow({
            label: 'Tip bend max (deg)',
            value: lod.tipBend.max,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.tipBend.max = v;
                if (lod.tipBend.min > v) lod.tipBend.min = v;
                this._emit();
            }
        });
        section.appendChild(tipBendMaxRow.row);
        this._controls.lod1TipBendMax = tipBendMaxRow;

        const curvatureMinRow = makeNumberSliderRow({
            label: 'Curvature min',
            value: lod.curvature.min,
            min: 0,
            max: 3,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                lod.curvature.min = v;
                if (lod.curvature.max < v) lod.curvature.max = v;
                this._emit();
            }
        });
        section.appendChild(curvatureMinRow.row);
        this._controls.lod1CurvatureMin = curvatureMinRow;

        const curvatureMaxRow = makeNumberSliderRow({
            label: 'Curvature max',
            value: lod.curvature.max,
            min: 0,
            max: 3,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                lod.curvature.max = v;
                if (lod.curvature.min > v) lod.curvature.min = v;
                this._emit();
            }
        });
        section.appendChild(curvatureMaxRow.row);
        this._controls.lod1CurvatureMax = curvatureMaxRow;

        section.appendChild(makeButtonRow({
            label: 'Inspector',
            text: 'Inspect LOD 1 Grass',
            onClick: () => this._onInspectLod1?.()
        }).row);
    }

    _buildAutoLodBody(parent) {
        const lod = this._state.lod2;
        const auto = this._state.autoLod;
        lod.billboardEnabled = lod.billboardEnabled !== false;
        lod.middleEnabled = lod.middleEnabled !== false;
        lod.billboardCardsPerUnit = 1;
        lod.middleCardsPerUnit = 2;
        lod.billboardCardWidthMeters = Number(lod.billboardCardWidthMeters) || 1.15;
        lod.middleCardWidthMeters = Number(lod.middleCardWidthMeters) || 1.15;
        lod.cardHeightMeters = Number(lod.cardHeightMeters) || 0.055;

        const section = makeSection({ title: 'AI 361 cohesive automatic hierarchy', collapsedByDefault: false });
        parent.appendChild(section);
        section.appendChild(makeEl('div', 'ui-grass-lab-note', 'Canonical order: close mesh → dense billboard coverage → cohesive middle patches → texture-only turf. Shared one-metre exact-coverage units, complementary masks, overlap, and hysteresis keep the carpet connected.'));
        section.appendChild(makeToggleRow({
            label: 'Simplified field enabled',
            value: lod.enabled,
            onChange: (value) => {
                lod.enabled = value;
                this._emit();
            }
        }).row);
        section.appendChild(makeSelectRow({
            label: 'Manual tier override',
            value: auto.force,
            options: [
                { id: 'auto', label: 'Automatic (canonical)' },
                { id: 'near', label: 'Force near geometry' },
                { id: 'billboard', label: 'Force billboard coverage' },
                { id: 'middle', label: 'Force middle patches' },
                { id: 'texture', label: 'Force texture only' }
            ],
            onChange: (value) => {
                auto.force = value;
                if (value === 'near') this._state.lod1.carpetMode = 'force';
                else if (this._state.lod1.carpetMode === 'force') this._state.lod1.carpetMode = 'auto';
                this._emit();
            }
        }).row);
        for (const options of [
            { label: 'Close end (m)', key: 'nearEndMeters', min: 1, max: 12, step: 0.5, digits: 1 },
            { label: 'Billboard end (m)', key: 'billboardEndMeters', min: 4, max: 24, step: 0.5, digits: 1 },
            { label: 'Middle / geometry cutoff (m)', key: 'middleEndMeters', min: 10, max: 48, step: 1, digits: 0 },
            { label: 'Dither band (m)', key: 'transitionWidthMeters', min: 0.5, max: 5, step: 0.25, digits: 2 },
            { label: 'Hysteresis (m)', key: 'hysteresisMeters', min: 0, max: 2.5, step: 0.05, digits: 2 },
            { label: 'Guaranteed overlap (m)', key: 'overlapMeters', min: 0, max: 2, step: 0.05, digits: 2 },
            { label: 'Grazing distance scale', key: 'grazingDistanceScale', min: 0.55, max: 1, step: 0.01, digits: 2 },
            { label: 'Top-down distance scale', key: 'topDownDistanceScale', min: 1, max: 1.75, step: 0.01, digits: 2 }
        ]) section.appendChild(makeNumberSliderRow({
            ...options,
            value: auto[options.key],
            onChange: (value) => {
                auto[options.key] = value;
                if (options.key === 'nearEndMeters') this._state.lod1.carpetRadiusMeters = value;
                if (options.key === 'middleEndMeters') auto.clusterEndMeters = value;
                this._emit();
            }
        }).row);

        const geometry = makeSection({ title: 'Two-batch cohesive field geometry', collapsedByDefault: false });
        parent.appendChild(geometry);
        geometry.appendChild(makeEl('div', 'ui-grass-lab-note', 'Every eligible one-metre unit is represented: one billboard card and one crossed two-card middle patch. Both batches share AI 358 MID_CLUSTER material ownership.'));
        for (const options of [
            { label: 'Billboard width (m)', key: 'billboardCardWidthMeters', min: 0.35, max: 1.5, step: 0.05, digits: 2 },
            { label: 'Middle width (m)', key: 'middleCardWidthMeters', min: 0.35, max: 1.5, step: 0.05, digits: 2 },
            { label: 'Visible card height (m)', key: 'cardHeightMeters', min: 0.025, max: 0.12, step: 0.005, digits: 3 }
        ]) geometry.appendChild(makeNumberSliderRow({
            ...options,
            value: lod[options.key],
            onChange: (value) => {
                lod[options.key] = value;
                this._emit();
            }
        }).row);

        const cameras = makeSection({ title: 'Deterministic LOD cameras', collapsedByDefault: false });
        parent.appendChild(cameras);
        for (const [id, label, text] of [
            ['grazing', 'Grazing', 'Review close → billboard'],
            ['topDown', 'Top-down', 'Review angle contraction'],
            ['cutoff', 'Cutoff', 'Review middle → texture']
        ]) cameras.appendChild(makeButtonRow({ label, text, onClick: () => this._onFocusAutoLod?.(id) }).row);

        const diagnostics = makeSection({ title: 'Automatic LOD diagnostics', collapsedByDefault: false });
        parent.appendChild(diagnostics);
        this._controls.autoLodReadouts = {};
        for (const [key, label] of [
            ['mode', 'Mode / active tier'],
            ['response', 'Distance / angle response'],
            ['ranges', 'Effective ranges'],
            ['transition', 'Transition state'],
            ['field', 'Billboard / middle units'],
            ['cost', 'Cohesive field cost'],
            ['material', 'Atlas material'],
            ['cutoff', 'Far geometry']
        ]) {
            const readout = makeReadoutRow(label);
            diagnostics.appendChild(readout.row);
            this._controls.autoLodReadouts[key] = readout.valueEl;
        }
    }

    _buildLod2Body(parent) {
        const lod = this._state.lod2;

        const section = makeSection({ title: 'Mid source controls', collapsedByDefault: false });
        parent.appendChild(section);
        section.appendChild(makeEl('div', 'ui-grass-lab-note', 'Enable, range, density, seed, and debug bounds feed GrassEngine. These legacy bend controls remain inspector-only; use Authoring for the canonical profile.'));

        section.appendChild(makeToggleRow({
            label: 'Enabled',
            value: lod.enabled,
            onChange: (v) => {
                lod.enabled = v;
                this._emit();
            }
        }).row);

        for (const row of this._buildRegionRows(lod, { onAnyChange: () => this._emit() })) section.appendChild(row);
        for (const row of this._buildDebugRows(lod, { onAnyChange: () => this._emit() })) section.appendChild(row);

        section.appendChild(makeSelectRow({
            label: 'Blade mesh',
            value: lod.bladeMeshId,
            options: [
                { id: PROCEDURAL_MESH.SOCCER_GRASS_BLADE_V1, label: 'Soccer Grass Blade (lo-res)' }
            ],
            onChange: (id) => {
                lod.bladeMeshId = id;
                this._emit();
            }
        }).row);

        section.appendChild(makeSeedRow({
            label: 'Seed',
            value: lod.seed,
            onChange: (v) => {
                lod.seed = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeLogNumberSliderRow({
            label: 'Density (blades / tile)',
            value: lod.densityPerTile,
            min: 0,
            max: 2000000,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.densityPerTile = Math.round(v);
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Random yaw (deg)',
            value: lod.randomYawDeg,
            min: 0,
            max: 360,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.randomYawDeg = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Blade bend min (deg)',
            value: lod.bladeBend.min,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.bladeBend.min = v;
                if (lod.bladeBend.max < v) lod.bladeBend.max = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Blade bend max (deg)',
            value: lod.bladeBend.max,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.bladeBend.max = v;
                if (lod.bladeBend.min > v) lod.bladeBend.min = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Tip bend min (deg)',
            value: lod.tipBend.min,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.tipBend.min = v;
                if (lod.tipBend.max < v) lod.tipBend.max = v;
                this._emit();
            }
        }).row);

        section.appendChild(makeNumberSliderRow({
            label: 'Tip bend max (deg)',
            value: lod.tipBend.max,
            min: -180,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => {
                lod.tipBend.max = v;
                if (lod.tipBend.min > v) lod.tipBend.min = v;
                this._emit();
            }
        }).row);
    }

    _buildLodStubBody(parent, { key, title }) {
        const section = makeSection({ title, collapsedByDefault: false });
        parent.appendChild(section);

        const msg = makeEl('div', 'ui-grass-lab-note', key === 'lod3'
            ? 'The AI 352/354 raised PBR surface is always the far representation. Geometry tiers dither into it without a second far-card renderer.'
            : 'Automatic mode emits no blade or cluster geometry after the configured cutoff. The binary grass surface and sidewalk edge remain visible.');
        section.appendChild(msg);
    }

    _buildTerrainTab(parent) {
        const terrain = this._state.terrain && typeof this._state.terrain === 'object'
            ? this._state.terrain
            : (this._state.terrain = { showGrid: false, groundMaterialId: '' });

        const substrate = terrain.substrate && typeof terrain.substrate === 'object'
            ? terrain.substrate
            : (terrain.substrate = {
                enabled: true,
                seed: 0,
                layer1: { enabled: true, materialId: '', coverage: 0.55, blendWidth: 0.16, patchSizeMeters: 55, edgeSizeMeters: 11, edgeStrength: 0.25 },
                layer2: { enabled: true, materialId: '', coverage: 0.35, blendWidth: 0.16, patchSizeMeters: 85, edgeSizeMeters: 14, edgeStrength: 0.22 }
            });
        substrate.layer1 = substrate.layer1 && typeof substrate.layer1 === 'object'
            ? substrate.layer1
            : (substrate.layer1 = { enabled: true, materialId: '', coverage: 0.55, blendWidth: 0.16, patchSizeMeters: 55, edgeSizeMeters: 11, edgeStrength: 0.25 });
        substrate.layer2 = substrate.layer2 && typeof substrate.layer2 === 'object'
            ? substrate.layer2
            : (substrate.layer2 = { enabled: true, materialId: '', coverage: 0.35, blendWidth: 0.16, patchSizeMeters: 85, edgeSizeMeters: 14, edgeStrength: 0.22 });

        const section = makeSection({ title: 'Ground', collapsedByDefault: false });
        parent.appendChild(section);

        section.appendChild(makeToggleRow({
            label: 'Show tile grid',
            value: terrain.showGrid,
            onChange: (v) => {
                terrain.showGrid = v;
                this._emit();
            }
        }).row);

        const options = getPbrMaterialOptionsForGround().map((opt) => ({
            id: String(opt?.id ?? ''),
            label: String(opt?.label ?? opt?.id ?? '')
        })).filter((opt) => opt.id);

        if (!options.length) {
            const msg = makeEl('div', 'options-row-label', 'No ground PBR textures available.');
            msg.style.opacity = '0.75';
            section.appendChild(msg);
            return;
        }

        const desired = String(terrain.groundMaterialId ?? '');
        const current = options.find((o) => o.id === desired)?.id ?? options[0].id;
        terrain.groundMaterialId = current;

        const validIds = new Set(options.map((o) => o.id));
        const normalizeGroundId = (value, fallback) => {
            const id = String(value ?? '');
            if (validIds.has(id)) return id;
            const fb = String(fallback ?? '');
            return validIds.has(fb) ? fb : options[0].id;
        };

        substrate.layer1.materialId = normalizeGroundId(substrate.layer1.materialId, options[1]?.id ?? options[0].id);
        substrate.layer2.materialId = normalizeGroundId(substrate.layer2.materialId, options[2]?.id ?? options[0].id);

        const pickerRow = makeGroundMaterialPickerRow({
            label: 'Base substrate',
            onPick: () => this._openGroundMaterialPicker()
        });
        section.appendChild(pickerRow.row);
        this._controls.groundMaterialPicker = pickerRow;
        this._syncGroundMaterialPicker();

        const substrateSection = makeSection({ title: 'Optional substrate variation', collapsedByDefault: false });
        parent.appendChild(substrateSection);

        substrateSection.appendChild(makeToggleRow({
            label: 'Enabled',
            value: substrate.enabled !== false,
            onChange: (v) => {
                substrate.enabled = !!v;
                this._emit();
            }
        }).row);

        substrateSection.appendChild(makeNumberSliderRow({
            label: 'Seed',
            value: Number(substrate.seed) || 0,
            min: 0,
            max: 9999,
            step: 1,
            digits: 0,
            onChange: (v) => {
                substrate.seed = Math.round(v);
                this._emit();
            }
        }).row);

        const makeLayerSection = (title, layerKey) => {
            const layer = substrate[layerKey];
            const s = makeSection({ title, collapsedByDefault: true });
            parent.appendChild(s);

            s.appendChild(makeToggleRow({
                label: 'Enabled',
                value: layer.enabled !== false,
                onChange: (v) => {
                    layer.enabled = !!v;
                    this._emit();
                }
            }).row);

            const picker = makeGroundMaterialPickerRow({
                label: 'Material',
                onPick: () => this._openSubstrateLayerPicker(layerKey)
            });
            s.appendChild(picker.row);
            if (layerKey === 'layer1') this._controls.substrateLayer1Picker = picker;
            else this._controls.substrateLayer2Picker = picker;

            s.appendChild(makeNumberSliderRow({
                label: 'Coverage',
                value: Number(layer.coverage) || 0,
                min: 0.0,
                max: 1.0,
                step: 0.01,
                digits: 2,
                onChange: (v) => {
                    layer.coverage = v;
                    this._emit();
                }
            }).row);

            s.appendChild(makeNumberSliderRow({
                label: 'Blend width',
                value: Number(layer.blendWidth) || 0.16,
                min: 0.0,
                max: 0.49,
                step: 0.01,
                digits: 2,
                onChange: (v) => {
                    layer.blendWidth = v;
                    this._emit();
                }
            }).row);

            s.appendChild(makeNumberSliderRow({
                label: 'Patch size (m)',
                value: Number(layer.patchSizeMeters) || 55,
                min: 4,
                max: 280,
                step: 1,
                digits: 0,
                onChange: (v) => {
                    layer.patchSizeMeters = Math.round(v);
                    this._emit();
                }
            }).row);

            s.appendChild(makeNumberSliderRow({
                label: 'Edge size (m)',
                value: Number(layer.edgeSizeMeters) || 11,
                min: 1,
                max: 80,
                step: 1,
                digits: 0,
                onChange: (v) => {
                    layer.edgeSizeMeters = Math.round(v);
                    this._emit();
                }
            }).row);

            s.appendChild(makeNumberSliderRow({
                label: 'Edge strength',
                value: Number(layer.edgeStrength) || 0.25,
                min: 0.0,
                max: 1.0,
                step: 0.01,
                digits: 2,
                onChange: (v) => {
                    layer.edgeStrength = v;
                    this._emit();
                }
            }).row);
        };

        makeLayerSection('Blend Layer 1', 'layer1');
        makeLayerSection('Blend Layer 2', 'layer2');
        this._syncSubstrateLayerPicker('layer1');
        this._syncSubstrateLayerPicker('layer2');
    }

    _syncGroundMaterialPicker() {
        const picker = this._controls?.groundMaterialPicker ?? null;
        if (!picker) return;
        const id = String(this._state?.terrain?.groundMaterialId ?? '');
        const options = getPbrMaterialOptionsForGround();
        const found = options.find((opt) => opt?.id === id) ?? options[0] ?? null;
        if (found && this._state?.terrain) this._state.terrain.groundMaterialId = found.id;
        const label = found?.label ?? id ?? '';
        picker.textEl.textContent = label;
        setOptionsThumbToTexture(picker.thumb, found?.previewUrl ?? '', label);
    }

    _openGroundMaterialPicker() {
        const picker = this._controls?.groundMaterialPicker ?? null;
        if (!picker || picker.btn?.disabled) return;

        const sections = getPbrMaterialClassSectionsForGround().map((section) => ({
            label: section.label,
            options: (section.options ?? []).map((opt) => ({
                id: opt.id,
                label: opt.label,
                kind: 'texture',
                previewUrl: opt.previewUrl ?? null
            }))
        }));

        this._pickerPopup?.open?.({
            title: 'Base substrate material',
            sections,
            selectedId: String(this._state?.terrain?.groundMaterialId ?? ''),
            onSelect: (opt) => {
                this._state.terrain.groundMaterialId = String(opt?.id ?? '');
                this._syncGroundMaterialPicker();
                this._emit();
            }
        });
    }

    _syncSubstrateLayerPicker(layerKey) {
        const key = layerKey === 'layer2' ? 'layer2' : 'layer1';
        const picker = key === 'layer2' ? this._controls?.substrateLayer2Picker : this._controls?.substrateLayer1Picker;
        if (!picker) return;

        const substrate = this._state?.terrain?.substrate ?? null;
        const layer = substrate?.[key] ?? null;
        const id = String(layer?.materialId ?? '');
        const options = getPbrMaterialOptionsForGround();
        const found = options.find((opt) => opt?.id === id) ?? options[0] ?? null;
        if (found && layer) layer.materialId = found.id;

        const label = found?.label ?? id ?? '';
        picker.textEl.textContent = label;
        setOptionsThumbToTexture(picker.thumb, found?.previewUrl ?? '', label);
    }

    _openSubstrateLayerPicker(layerKey) {
        const key = layerKey === 'layer2' ? 'layer2' : 'layer1';
        const picker = key === 'layer2' ? this._controls?.substrateLayer2Picker : this._controls?.substrateLayer1Picker;
        if (!picker || picker.btn?.disabled) return;

        const sections = getPbrMaterialClassSectionsForGround().map((section) => ({
            label: section.label,
            options: (section.options ?? []).map((opt) => ({
                id: opt.id,
                label: opt.label,
                kind: 'texture',
                previewUrl: opt.previewUrl ?? null
            }))
        }));

        this._pickerPopup?.open?.({
            title: `Substrate ${key === 'layer2' ? 'layer 2' : 'layer 1'} material`,
            sections,
            selectedId: String(this._state?.terrain?.substrate?.[key]?.materialId ?? ''),
            onSelect: (opt) => {
                const substrate = this._state?.terrain?.substrate ?? null;
                const layer = substrate?.[key] ?? null;
                if (!layer) return;
                layer.materialId = String(opt?.id ?? '');
                this._syncSubstrateLayerPicker(key);
                this._emit();
            }
        });
    }

    _setActiveTab(key) {
        const next = (key === 'lab' || key === 'validation' || key === 'authoring' || key === 'material' || key === 'environment' || key === 'terrain' || key === 'coverage' || key === 'accents' || key === 'lod1' || key === 'lod2' || key === 'lod3' || key === 'lod4') ? key : 'lab';
        this._state.tab = next;
        for (const [id, btn] of Object.entries(this._tabButtons)) btn.classList.toggle('is-active', id === next);
        for (const [id, body] of Object.entries(this._tabBodies)) body.style.display = id === next ? '' : 'none';
        this._emit();
    }
}
