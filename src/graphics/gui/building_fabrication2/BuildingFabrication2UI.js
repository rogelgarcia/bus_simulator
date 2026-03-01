// src/graphics/gui/building_fabrication2/BuildingFabrication2UI.js
// Builds the HUD controls for Building Fabrication 2.

import { getBeltCourseColorOptions } from '../../../app/buildings/BeltCourseColor.js';
import {
    WALL_BASE_TINT_STATE_DEFAULT,
    applyWallBaseTintStateToWallBase,
    resolveWallBaseTintStateFromWallBase
} from '../../../app/buildings/WallBaseTintModel.js';
import {
    getWallDecoratorTypeEntries,
    WALL_DECORATOR_POSITION,
    WALL_DECORATOR_PROPERTY_TYPE
} from '../../../app/buildings/wall_decorators/index.js';
import { resolveBuildingStylePbrMaterialId } from '../../content3d/catalogs/BuildingStyleCatalog.js';
import { getPbrMaterialClassSectionsForBuildings } from '../../assets3d/materials/PbrMaterialCatalog.js';
import { createTextureTilingMiniController } from '../building_fabrication/mini_controllers/TextureTilingMiniController.js';
import { createHint, createRangeRow } from '../building_fabrication/mini_controllers/UiMiniControlPrimitives.js';
import { applyMaterialSymbolToButton, createMaterialSymbolIcon } from '../shared/materialSymbols.js';
import { MaterialPickerPopupController } from '../shared/material_picker/MaterialPickerPopupController.js';
import { createMaterialPickerRowController } from '../shared/material_picker/MaterialPickerRowController.js';
import { setMaterialThumbToColor, setMaterialThumbToTexture } from '../shared/material_picker/materialThumb.js';
import { SharedHsvbTintPicker } from '../shared/tint_picker/SharedHsvbTintPicker.js';

const PAGE_SIZE = 6;
const FACE_IDS = Object.freeze(['A', 'B', 'C', 'D']);
const BF2_EDITOR_MODE = Object.freeze({
    BUILDING: 'building',
    DECORATION: 'decoration',
    WEAR: 'wear'
});

const FLOOR_COUNT_MIN = 1;
const FLOOR_COUNT_MAX = 30;
const FLOOR_HEIGHT_MIN = 1.0;
const FLOOR_HEIGHT_MAX = 12.0;

const BAY_DEPTH_MIN_M = -2.0;
const BAY_DEPTH_MAX_M = 2.0;
const BAY_DEPTH_STEP_M = 0.05;
const OPENING_ASSET_TYPE = Object.freeze({
    WINDOW: 'window',
    DOOR: 'door',
    GARAGE: 'garage'
});
const OPENING_HEIGHT_MODE = Object.freeze({
    FIXED: 'fixed',
    FULL: 'full'
});
const OPENING_REPEAT_MIN = 1;
const OPENING_REPEAT_MAX = 5;
const OPENING_INTERIOR_MODE = Object.freeze({
    NONE: 'none',
    RES: 'res',
    OFFICE: 'office'
});
const GARAGE_FACADE_STATE = Object.freeze({
    OPEN: 'open',
    CLOSED: 'closed'
});

const BAY_GROUP_CONNECTOR_HALF_GAP_PX = 5;
const BAY_GROUP_CONNECTOR_STRIP_HEIGHT_PX = 14;
const BAY_GROUP_CONNECTOR_LEVEL_SPACING_PX = 4;
const BAY_GROUP_CONNECTOR_LEVEL_TOP_PADDING_PX = 2;
const BAY_GROUP_CONNECTOR_MAX_LEVELS = 3;
const BAY_LINK_MASTER_HUES = Object.freeze([14, 44, 88, 152, 204, 242, 304]);
const DECORATION_FLOOR_INTERVAL_PRESET = Object.freeze({
    FIRST: 'first',
    LAST: 'last',
    ALL: 'all',
    EVERY_2: 'every_2'
});
const FOOTPRINT_PRESET_SIZES_M = Object.freeze([10, 16, 20, 25, 30, 36]);

function isFaceId(faceId) {
    return faceId === 'A' || faceId === 'B' || faceId === 'C' || faceId === 'D';
}

function resolveBayLinkFromSpec(bay) {
    const spec = bay && typeof bay === 'object' ? bay : null;
    const link = typeof spec?.linkFromBayId === 'string' ? spec.linkFromBayId : '';
    if (link) return link;
    const legacy = typeof spec?.materialLinkFromBayId === 'string' ? spec.materialLinkFromBayId : '';
    return legacy || null;
}

function resolveBayWindowFromSpec(bay) {
    const spec = bay && typeof bay === 'object' ? bay : null;
    if (!spec) return null;
    if (spec.window && typeof spec.window === 'object') return spec.window;
    const legacy = spec.features && typeof spec.features === 'object' ? spec.features.window : null;
    return legacy && typeof legacy === 'object' ? legacy : null;
}

function normalizeGarageFacadeState(value) {
    const typed = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (typed === GARAGE_FACADE_STATE.OPEN) return GARAGE_FACADE_STATE.OPEN;
    return GARAGE_FACADE_STATE.CLOSED;
}

function buildBayLinkGraph(bays) {
    const list = Array.isArray(bays) ? bays : [];
    const byId = new Map();
    const orderedIds = [];
    for (const entry of list) {
        const bay = entry && typeof entry === 'object' ? entry : null;
        const id = typeof bay?.id === 'string' ? bay.id : '';
        if (!id || byId.has(id)) continue;
        byId.set(id, bay);
        orderedIds.push(id);
    }

    const resolveRootMasterId = (startId) => {
        const start = typeof startId === 'string' ? startId : '';
        if (!start || !byId.has(start)) return null;
        const visited = new Set();
        let cur = start;
        for (let i = 0; i < 32; i++) {
            if (visited.has(cur)) return start;
            visited.add(cur);
            const bay = byId.get(cur) ?? null;
            if (!bay || typeof bay !== 'object') return start;
            const next = resolveBayLinkFromSpec(bay);
            if (!next) return cur;
            if (next === cur) return cur;
            if (!byId.has(next)) return cur;
            cur = next;
        }
        return start;
    };

    const rootMasterByBayId = new Map();
    const directMasterByBayId = new Map();
    const slaveIdsByMasterId = new Map();
    for (const bayId of orderedIds) {
        const bay = byId.get(bayId) ?? null;
        const directMasterId = resolveBayLinkFromSpec(bay);
        directMasterByBayId.set(bayId, directMasterId);
        const rootMasterId = resolveRootMasterId(bayId) ?? bayId;
        rootMasterByBayId.set(bayId, rootMasterId);
        if (rootMasterId && rootMasterId !== bayId) {
            if (!slaveIdsByMasterId.has(rootMasterId)) slaveIdsByMasterId.set(rootMasterId, []);
            slaveIdsByMasterId.get(rootMasterId).push(bayId);
        }
    }

    const hueByMasterId = new Map();
    let hueIndex = 0;
    for (const bayId of orderedIds) {
        const slaves = slaveIdsByMasterId.get(bayId) ?? [];
        if (!slaves.length) continue;
        hueByMasterId.set(bayId, BAY_LINK_MASTER_HUES[hueIndex % BAY_LINK_MASTER_HUES.length]);
        hueIndex += 1;
    }

    return {
        byId,
        orderedIds,
        rootMasterByBayId,
        directMasterByBayId,
        slaveIdsByMasterId,
        hueByMasterId
    };
}

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function normalizeOpeningAssetType(value, fallback = OPENING_ASSET_TYPE.WINDOW) {
    const typed = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (typed === OPENING_ASSET_TYPE.WINDOW) return OPENING_ASSET_TYPE.WINDOW;
    if (typed === OPENING_ASSET_TYPE.DOOR) return OPENING_ASSET_TYPE.DOOR;
    if (typed === OPENING_ASSET_TYPE.GARAGE) return OPENING_ASSET_TYPE.GARAGE;
    return fallback;
}

function normalizeOpeningHeightMode(value, fallback = OPENING_HEIGHT_MODE.FIXED) {
    const typed = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (typed === OPENING_HEIGHT_MODE.FULL) return OPENING_HEIGHT_MODE.FULL;
    if (typed === OPENING_HEIGHT_MODE.FIXED) return OPENING_HEIGHT_MODE.FIXED;
    return fallback;
}

function normalizeOpeningRepeatCount(value, fallback = OPENING_REPEAT_MIN) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return clampInt(fallback, OPENING_REPEAT_MIN, OPENING_REPEAT_MAX);
    return clampInt(raw, OPENING_REPEAT_MIN, OPENING_REPEAT_MAX);
}

function normalizeOpeningInteriorMode(value, fallback = OPENING_INTERIOR_MODE.RES) {
    const typed = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!typed) return fallback;
    if (typed === OPENING_INTERIOR_MODE.NONE || typed === 'off' || typed === 'disabled') return OPENING_INTERIOR_MODE.NONE;
    if (typed === OPENING_INTERIOR_MODE.OFFICE) return OPENING_INTERIOR_MODE.OFFICE;
    if (typed === OPENING_INTERIOR_MODE.RES || typed === 'residential') return OPENING_INTERIOR_MODE.RES;
    return fallback;
}

function resolveOpeningInteriorModeFromSettings(settings, fallback = OPENING_INTERIOR_MODE.RES) {
    const interior = settings?.interior;
    if (!interior || typeof interior !== 'object') return fallback;
    if (interior.enabled === false) return OPENING_INTERIOR_MODE.NONE;

    const presetId = typeof interior.parallaxInteriorPresetId === 'string'
        ? interior.parallaxInteriorPresetId.toLowerCase()
        : '';
    if (presetId.includes('office')) return OPENING_INTERIOR_MODE.OFFICE;
    if (presetId.includes('residential')) return OPENING_INTERIOR_MODE.RES;

    const atlasId = typeof interior.atlasId === 'string' ? interior.atlasId.toLowerCase() : '';
    if (atlasId.includes('office')) return OPENING_INTERIOR_MODE.OFFICE;
    if (atlasId.includes('residential')) return OPENING_INTERIOR_MODE.RES;

    return interior.enabled === false ? OPENING_INTERIOR_MODE.NONE : OPENING_INTERIOR_MODE.RES;
}

function normalizeCatalogEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries
        .filter(Boolean)
        .map((e) => ({
            id: typeof e?.id === 'string' ? e.id : '',
            name: typeof e?.name === 'string' ? e.name : ''
        }))
        .filter((e) => !!e.id);
}

function normalizeLayers(layers) {
    if (!Array.isArray(layers)) return [];
    const out = [];
    for (const layer of layers) {
        if (!layer || typeof layer !== 'object') continue;
        const id = typeof layer.id === 'string' ? layer.id : '';
        const type = layer.type === 'floor' || layer.type === 'roof' ? layer.type : null;
        if (!id || !type) continue;
        out.push(layer);
    }
    return out;
}

function normalizeLockedToByFace(value) {
    const out = new Map();
    for (const faceId of FACE_IDS) out.set(faceId, null);

    if (!value) return out;

    if (value instanceof Map) {
        for (const faceId of FACE_IDS) {
            const lockedTo = value.get(faceId);
            out.set(faceId, isFaceId(lockedTo) ? lockedTo : null);
        }
        return out;
    }

    if (typeof value === 'object') {
        for (const faceId of FACE_IDS) {
            const lockedTo = value[faceId];
            out.set(faceId, isFaceId(lockedTo) ? lockedTo : null);
        }
        return out;
    }

    return out;
}

function normalizeReverseByFace(value) {
    const out = new Map();
    for (const faceId of FACE_IDS) out.set(faceId, false);

    if (!value) return out;

    if (value instanceof Map) {
        for (const faceId of FACE_IDS) out.set(faceId, !!value.get(faceId));
        return out;
    }

    if (typeof value === 'object') {
        for (const faceId of FACE_IDS) out.set(faceId, !!value[faceId]);
        return out;
    }

    return out;
}

function parseMaterialPickerId(value) {
    if (typeof value !== 'string' || !value) return null;
    const idx = value.indexOf(':');
    if (idx <= 0) return null;
    const kind = value.slice(0, idx);
    const id = value.slice(idx + 1);
    if (!id) return null;
    if (kind !== 'texture' && kind !== 'color') return null;
    return { kind, id };
}

function normalizeBf2EditorMode(value) {
    if (value === BF2_EDITOR_MODE.DECORATION) return BF2_EDITOR_MODE.DECORATION;
    if (value === BF2_EDITOR_MODE.WEAR) return BF2_EDITOR_MODE.WEAR;
    return BF2_EDITOR_MODE.BUILDING;
}

function normalizeWallDecoratorPropertyType(value) {
    const typed = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (typed === WALL_DECORATOR_PROPERTY_TYPE.INT) return WALL_DECORATOR_PROPERTY_TYPE.INT;
    if (typed === WALL_DECORATOR_PROPERTY_TYPE.ENUM) return WALL_DECORATOR_PROPERTY_TYPE.ENUM;
    if (typed === WALL_DECORATOR_PROPERTY_TYPE.BOOL) return WALL_DECORATOR_PROPERTY_TYPE.BOOL;
    return WALL_DECORATOR_PROPERTY_TYPE.FLOAT;
}

function clampUnit(value, fallback = 0) {
    const v = Number(value);
    if (!Number.isFinite(v)) return clamp(fallback, 0, 1);
    return clamp(v, 0, 1);
}

export class BuildingFabrication2UI {
    constructor() {
        this.root = document.createElement('div');
        this.root.className = 'ui-hud-root building-fab2-hud';
        this.root.id = 'building-fab2-hud';

        this.leftStack = document.createElement('div');
        this.leftStack.className = 'building-fab2-left-stack';

        this.fabPanel = document.createElement('div');
        this.fabPanel.className = 'ui-panel is-interactive building-fab2-panel building-fab2-fab-panel';

        this.viewPanel = document.createElement('div');
        this.viewPanel.className = 'ui-panel is-interactive building-fab2-panel building-fab2-view-panel';

        this.rightPanel = document.createElement('div');
        this.rightPanel.className = 'ui-panel is-interactive building-fab2-panel building-fab2-right-panel';

        this._materialPickerPopup = new MaterialPickerPopupController();
        this._beltCourseColorOptions = getBeltCourseColorOptions();
        this._wallTextureSections = getPbrMaterialClassSectionsForBuildings();
        this._wallTextureDefs = this._wallTextureSections.flatMap((section) => (
            (section.options ?? []).map((opt) => ({
                id: opt.id,
                label: opt.label,
                wallTextureUrl: opt.previewUrl ?? null
            }))
        ));
        this._wallTextureDefById = new Map(this._wallTextureDefs.map((opt) => [opt.id, opt]));
        this._baseWallTexturePickerSections = this._wallTextureSections.map((section) => ({
            label: section.label,
            options: (section.options ?? []).map((opt) => ({
                id: `texture:${opt.id}`,
                label: opt.label,
                kind: 'texture',
                previewUrl: opt.previewUrl ?? null
            }))
        }));
        this._baseWallColorPickerOptions = (this._beltCourseColorOptions ?? []).map((opt) => ({
            id: `color:${opt.id}`,
            label: opt.label,
            kind: 'color',
            hex: opt.hex
        }));

        this.fabTitle = document.createElement('div');
        this.fabTitle.className = 'ui-title';
        this.fabTitle.textContent = 'Fabrication';

        this.createBuildingBtn = document.createElement('button');
        this.createBuildingBtn.type = 'button';
        this.createBuildingBtn.className = 'building-fab2-btn building-fab2-btn-primary building-fab2-create-btn';
        this.createBuildingBtn.textContent = 'Create Building';

        this.footprintPresetsSection = document.createElement('div');
        this.footprintPresetsSection.className = 'building-fab2-footprint-presets';
        this.footprintPresetsLabel = document.createElement('div');
        this.footprintPresetsLabel.className = 'building-fab2-row-label';
        this.footprintPresetsLabel.textContent = 'Footprint';
        this.footprintPresetsRow = document.createElement('div');
        this.footprintPresetsRow.className = 'building-fab2-footprint-preset-row';
        this.footprintPresetButtons = [];
        for (const sizeMeters of FOOTPRINT_PRESET_SIZES_M) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab2-btn building-fab2-btn-small building-fab2-footprint-preset-btn';
            btn.dataset.sizeMeters = String(sizeMeters);
            btn.textContent = `${sizeMeters}x${sizeMeters}`;
            this.footprintPresetsRow.appendChild(btn);
            this.footprintPresetButtons.push(btn);
        }
        this.footprintPresetsSection.appendChild(this.footprintPresetsLabel);
        this.footprintPresetsSection.appendChild(this.footprintPresetsRow);

        this.adjustLayoutBtn = document.createElement('button');
        this.adjustLayoutBtn.type = 'button';
        this.adjustLayoutBtn.className = 'building-fab2-icon-btn building-fab2-layout-adjust-btn';
        this.adjustLayoutBtn.title = 'Adjust Layout';
        this.adjustLayoutBtn.setAttribute('aria-label', 'Adjust Layout');
        this.adjustLayoutBtn.appendChild(createMaterialSymbolIcon('open_with', { size: 'sm' }));
        this.adjustLayoutBtnLabel = document.createElement('span');
        this.adjustLayoutBtnLabel.className = 'building-fab2-layout-adjust-label';
        this.adjustLayoutBtnLabel.textContent = 'Adjust Layout';
        this.adjustLayoutBtn.appendChild(this.adjustLayoutBtnLabel);

        this.nameRow = document.createElement('div');
        this.nameRow.className = 'building-fab2-row';
        this.nameLabel = document.createElement('div');
        this.nameLabel.className = 'building-fab2-row-label';
        this.nameLabel.textContent = 'Name';
        this.nameInput = document.createElement('input');
        this.nameInput.type = 'text';
        this.nameInput.className = 'building-fab2-input';
        this.nameInput.placeholder = 'No building loaded';
        this.nameRow.appendChild(this.nameLabel);
        this.nameRow.appendChild(this.nameInput);

        this.typeRow = document.createElement('div');
        this.typeRow.className = 'building-fab2-row';
        this.typeLabel = document.createElement('div');
        this.typeLabel.className = 'building-fab2-row-label';
        this.typeLabel.textContent = 'Type';
        this.typeSelect = document.createElement('select');
        this.typeSelect.className = 'building-fab2-select';

        const addTypeOption = (value, label, { disabled = false } = {}) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            opt.disabled = !!disabled;
            this.typeSelect.appendChild(opt);
        };

        addTypeOption('business', 'Business');
        addTypeOption('industrial', 'Industrial (coming later)', { disabled: true });
        addTypeOption('apartments', 'Apartments (coming later)', { disabled: true });
        addTypeOption('house', 'House (coming later)', { disabled: true });
        this.typeSelect.value = 'business';

        this.typeRow.appendChild(this.typeLabel);
        this.typeRow.appendChild(this.typeSelect);

        this.actionsRow = document.createElement('div');
        this.actionsRow.className = 'building-fab2-actions';

        this.loadBtn = document.createElement('button');
        this.loadBtn.type = 'button';
        this.loadBtn.className = 'building-fab2-btn building-fab2-btn-primary';
        this.loadBtn.textContent = 'Load';

        this.exportBtn = document.createElement('button');
        this.exportBtn.type = 'button';
        this.exportBtn.className = 'building-fab2-btn building-fab2-btn-primary';
        this.exportBtn.textContent = 'Export';
        this.exportBtn.disabled = true;

        this.actionsRow.appendChild(this.loadBtn);
        this.actionsRow.appendChild(this.exportBtn);

        this.resetBtn = document.createElement('button');
        this.resetBtn.type = 'button';
        this.resetBtn.className = 'building-fab2-btn building-fab2-btn-danger building-fab2-btn-full';
        this.resetBtn.textContent = 'Reset';

        this.fabPanel.appendChild(this.fabTitle);
        this.fabPanel.appendChild(this.createBuildingBtn);
        this.fabPanel.appendChild(this.footprintPresetsSection);
        this.fabPanel.appendChild(this.adjustLayoutBtn);
        this.fabPanel.appendChild(this.nameRow);
        this.fabPanel.appendChild(this.typeRow);
        this.fabPanel.appendChild(this.actionsRow);
        this.fabPanel.appendChild(this.resetBtn);

        this.viewTitle = document.createElement('div');
        this.viewTitle.className = 'ui-title';
        this.viewTitle.textContent = 'View';

        this.viewModes = document.createElement('div');
        this.viewModes.className = 'building-fab2-view-modes';

        const makeViewModeBtn = (label, mode) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab2-view-mode';
            btn.dataset.mode = mode;
            btn.textContent = label;
            return btn;
        };

        this.meshModeBtn = makeViewModeBtn('Mesh', 'mesh');
        this.wireModeBtn = makeViewModeBtn('Wireframe', 'wireframe');
        this.floorsModeBtn = makeViewModeBtn('Floors', 'floors');
        this.planModeBtn = makeViewModeBtn('Plan', 'floorplan');

        this.viewModes.appendChild(this.meshModeBtn);
        this.viewModes.appendChild(this.wireModeBtn);
        this.viewModes.appendChild(this.floorsModeBtn);
        this.viewModes.appendChild(this.planModeBtn);

        const makeViewToggle = (label) => {
            const toggle = document.createElement('label');
            toggle.className = 'building-fab2-toggle-switch';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.setAttribute('aria-label', label);
            const text = document.createElement('span');
            text.textContent = label;
            toggle.appendChild(input);
            toggle.appendChild(text);
            return { toggle, input, text };
        };

        this.viewToggles = document.createElement('div');
        this.viewToggles.className = 'building-fab2-view-toggles';

        const renderSkyToggle = makeViewToggle('Render sky');
        this.renderSkyToggle = renderSkyToggle.toggle;
        this.renderSkyToggleInput = renderSkyToggle.input;

        const hideFaceToggle = makeViewToggle('Hide face mark in view');
        this.hideFaceMarkToggle = hideFaceToggle.toggle;
        this.hideFaceMarkToggleInput = hideFaceToggle.input;

        const dummyToggle = makeViewToggle('Show dummy');
        this.showDummyToggle = dummyToggle.toggle;
        this.showDummyToggleInput = dummyToggle.input;
        const renderSlabToggle = makeViewToggle('Render slab');
        this.renderSlabToggle = renderSlabToggle.toggle;
        this.renderSlabToggleInput = renderSlabToggle.input;

        this.viewToggles.appendChild(this.renderSkyToggle);
        this.viewToggles.appendChild(this.hideFaceMarkToggle);
        this.viewToggles.appendChild(this.showDummyToggle);
        this.viewToggles.appendChild(this.renderSlabToggle);

        this.viewPanel.appendChild(this.viewTitle);
        this.viewPanel.appendChild(this.viewModes);
        this.viewPanel.appendChild(this.viewToggles);

        this.rightEmptyHint = document.createElement('div');
        this.rightEmptyHint.className = 'building-fab2-hint building-fab2-right-hint';
        this.rightEmptyHint.textContent = 'Empty state: create a building to edit layers and faces.';

        this.editorModes = document.createElement('div');
        this.editorModes.className = 'building-fab2-editor-modes';
        const makeEditorModeBtn = (label, mode) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab2-editor-mode';
            btn.dataset.mode = mode;
            btn.textContent = label;
            return btn;
        };
        this.editorModeBuildingBtn = makeEditorModeBtn('Building', BF2_EDITOR_MODE.BUILDING);
        this.editorModeDecorationBtn = makeEditorModeBtn('Decoration', BF2_EDITOR_MODE.DECORATION);
        this.editorModeWearBtn = makeEditorModeBtn('Wear', BF2_EDITOR_MODE.WEAR);
        this.editorModes.appendChild(this.editorModeBuildingBtn);
        this.editorModes.appendChild(this.editorModeDecorationBtn);
        this.editorModes.appendChild(this.editorModeWearBtn);

        this.addFloorBtn = document.createElement('button');
        this.addFloorBtn.type = 'button';
        this.addFloorBtn.className = 'building-fab2-btn building-fab2-btn-small';
        this.addFloorBtn.textContent = '+ Floor';

        this.addRoofBtn = document.createElement('button');
        this.addRoofBtn.type = 'button';
        this.addRoofBtn.className = 'building-fab2-btn building-fab2-btn-small';
        this.addRoofBtn.textContent = '+ Roof';

        this.rightActions = document.createElement('div');
        this.rightActions.className = 'building-fab2-right-actions';
        this.rightActions.appendChild(this.addFloorBtn);
        this.rightActions.appendChild(this.addRoofBtn);

        this.layersList = document.createElement('div');
        this.layersList.className = 'building-fab2-layer-list';

        this.decorationPanel = document.createElement('div');
        this.decorationPanel.className = 'building-fab2-decoration-panel';
        this.wearPanel = document.createElement('div');
        this.wearPanel.className = 'building-fab2-wear-panel';

        this.rightPanel.appendChild(this.editorModes);
        this.rightPanel.appendChild(this.rightEmptyHint);
        this.rightPanel.appendChild(this.rightActions);
        this.rightPanel.appendChild(this.layersList);
        this.rightPanel.appendChild(this.decorationPanel);
        this.rightPanel.appendChild(this.wearPanel);

        this.materialPanel = document.createElement('div');
        this.materialPanel.className = 'ui-panel is-interactive building-fab2-panel building-fab2-material-panel hidden';

        this.materialHeader = document.createElement('div');
        this.materialHeader.className = 'building-fab2-material-header';

        this.materialTitle = document.createElement('div');
        this.materialTitle.className = 'ui-title';
        this.materialTitle.textContent = 'Material Configuration';

        this.materialCloseBtn = document.createElement('button');
        this.materialCloseBtn.type = 'button';
        this.materialCloseBtn.className = 'building-fab2-btn';
        this.materialCloseBtn.textContent = 'Close';

        this.materialHeader.appendChild(this.materialTitle);
        this.materialHeader.appendChild(this.materialCloseBtn);

        this.materialBody = document.createElement('div');
        this.materialBody.className = 'building-fab2-material-body';

        this.materialPanel.appendChild(this.materialHeader);
        this.materialPanel.appendChild(this.materialBody);

        this.sideHandle = document.createElement('div');
        this.sideHandle.className = 'building-fab2-side-handle hidden';

        this.sideHandleBtn = document.createElement('button');
        this.sideHandleBtn.type = 'button';
        this.sideHandleBtn.className = 'building-fab2-icon-btn building-fab2-side-handle-btn';
        applyMaterialSymbolToButton(this.sideHandleBtn, { name: 'chevron_left', label: 'Expand building panel', size: 'sm' });
        this.sideHandle.appendChild(this.sideHandleBtn);

        this.rightDock = document.createElement('div');
        this.rightDock.className = 'building-fab2-right-dock';
        this.rightDock.appendChild(this.materialPanel);
        this.rightDock.appendChild(this.rightPanel);
        this.rightDock.appendChild(this.sideHandle);

        this.leftStack.appendChild(this.fabPanel);
        this.leftStack.appendChild(this.viewPanel);
        this.root.appendChild(this.leftStack);
        this.root.appendChild(this.rightDock);

        this.bottomToolsPanel = document.createElement('div');
        this.bottomToolsPanel.className = 'building-fab2-bottom-tools';

        this.adjustModeOverlayPanel = document.createElement('div');
        this.adjustModeOverlayPanel.className = 'building-fab2-adjust-overlay hidden';

        this.adjustModeCloseBtn = document.createElement('button');
        this.adjustModeCloseBtn.type = 'button';
        this.adjustModeCloseBtn.className = 'building-fab2-btn building-fab2-btn-small';
        this.adjustModeCloseBtn.textContent = 'Close';
        this.adjustModeOverlayPanel.appendChild(this.adjustModeCloseBtn);

        this.rulerBtn = document.createElement('button');
        this.rulerBtn.type = 'button';
        this.rulerBtn.className = 'building-fab2-icon-btn building-fab2-bottom-tool-btn';
        applyMaterialSymbolToButton(this.rulerBtn, { name: 'straighten', label: 'Ruler', size: 'md' });
        this.bottomToolsPanel.appendChild(this.rulerBtn);

        this.viewportOverlay = document.createElement('div');
        this.viewportOverlay.className = 'building-fab2-viewport-overlay';

        this.rulerLabel = document.createElement('div');
        this.rulerLabel.className = 'building-fab2-viewport-label building-fab2-ruler-label';
        this.rulerLabel.style.display = 'none';
        this.viewportOverlay.appendChild(this.rulerLabel);

        this.layoutWidthLabelA = document.createElement('div');
        this.layoutWidthLabelA.className = 'building-fab2-viewport-label building-fab2-layout-width-label';
        this.layoutWidthLabelA.style.display = 'none';
        this.viewportOverlay.appendChild(this.layoutWidthLabelA);

        this.layoutWidthLabelB = document.createElement('div');
        this.layoutWidthLabelB.className = 'building-fab2-viewport-label building-fab2-layout-width-label';
        this.layoutWidthLabelB.style.display = 'none';
        this.viewportOverlay.appendChild(this.layoutWidthLabelB);

        this.root.appendChild(this.adjustModeOverlayPanel);
        this.root.appendChild(this.bottomToolsPanel);
        this.root.appendChild(this.viewportOverlay);

        this.loadOverlay = document.createElement('div');
        this.loadOverlay.className = 'ui-picker-overlay hidden building-fab2-load-overlay';

        this.loadPanel = document.createElement('div');
        this.loadPanel.className = 'ui-panel is-interactive building-fab2-load-panel';

        this.loadHeader = document.createElement('div');
        this.loadHeader.className = 'building-fab2-load-header';

        this.loadTitle = document.createElement('div');
        this.loadTitle.className = 'ui-title';
        this.loadTitle.textContent = 'Load building config';

        this.loadCloseBtn = document.createElement('button');
        this.loadCloseBtn.type = 'button';
        this.loadCloseBtn.className = 'building-fab2-btn';
        this.loadCloseBtn.textContent = 'Close';

        this.loadHeader.appendChild(this.loadTitle);
        this.loadHeader.appendChild(this.loadCloseBtn);

        this.loadBody = document.createElement('div');
        this.loadBody.className = 'building-fab2-load-body';

        this.prevPageBtn = document.createElement('button');
        this.prevPageBtn.type = 'button';
        this.prevPageBtn.className = 'building-fab2-page-btn';
        this.prevPageBtn.textContent = '←';

        this.nextPageBtn = document.createElement('button');
        this.nextPageBtn.type = 'button';
        this.nextPageBtn.className = 'building-fab2-page-btn';
        this.nextPageBtn.textContent = '→';

        this.thumbGrid = document.createElement('div');
        this.thumbGrid.className = 'building-fab2-thumb-grid';

        this.loadBody.appendChild(this.prevPageBtn);
        this.loadBody.appendChild(this.thumbGrid);
        this.loadBody.appendChild(this.nextPageBtn);

        this.loadFooter = document.createElement('div');
        this.loadFooter.className = 'building-fab2-load-footer';
        this.pageIndicator = document.createElement('div');
        this.pageIndicator.className = 'building-fab2-hint';
        this.pageIndicator.textContent = '';
        this.loadFooter.appendChild(this.pageIndicator);

        this.loadPanel.appendChild(this.loadHeader);
        this.loadPanel.appendChild(this.loadBody);
        this.loadPanel.appendChild(this.loadFooter);
        this.loadOverlay.appendChild(this.loadPanel);

        this.linkOverlay = document.createElement('div');
        this.linkOverlay.className = 'ui-picker-overlay hidden building-fab2-link-overlay';

        this.linkPanel = document.createElement('div');
        this.linkPanel.className = 'ui-panel is-interactive building-fab2-link-panel';

        this.linkHeader = document.createElement('div');
        this.linkHeader.className = 'building-fab2-link-header';

        this.linkTitle = document.createElement('div');
        this.linkTitle.className = 'ui-title';
        this.linkTitle.textContent = 'Link faces';

        this.linkCloseBtn = document.createElement('button');
        this.linkCloseBtn.type = 'button';
        this.linkCloseBtn.className = 'building-fab2-btn';
        this.linkCloseBtn.textContent = 'Close';

        this.linkHeader.appendChild(this.linkTitle);
        this.linkHeader.appendChild(this.linkCloseBtn);

        this.linkBody = document.createElement('div');
        this.linkBody.className = 'building-fab2-link-body';

        this.linkFooter = document.createElement('div');
        this.linkFooter.className = 'building-fab2-hint building-fab2-link-footer';
        this.linkFooter.textContent = 'Select which faces to link. Reverse changes bay assignment order only (no mirroring).';

        this.linkPanel.appendChild(this.linkHeader);
        this.linkPanel.appendChild(this.linkBody);
        this.linkPanel.appendChild(this.linkFooter);
        this.linkOverlay.appendChild(this.linkPanel);

        this.groupOverlay = document.createElement('div');
        this.groupOverlay.className = 'ui-picker-overlay hidden building-fab2-group-overlay';

        this.groupPanel = document.createElement('div');
        this.groupPanel.className = 'ui-panel is-interactive building-fab2-group-panel';

        this.groupHeader = document.createElement('div');
        this.groupHeader.className = 'building-fab2-group-header';

        this.groupTitle = document.createElement('div');
        this.groupTitle.className = 'ui-title';
        this.groupTitle.textContent = 'Grouping';

        this.groupDoneBtn = document.createElement('button');
        this.groupDoneBtn.type = 'button';
        this.groupDoneBtn.className = 'building-fab2-btn';
        this.groupDoneBtn.textContent = 'Done';

        this.groupHeader.appendChild(this.groupTitle);
        this.groupHeader.appendChild(this.groupDoneBtn);

        this.groupBody = document.createElement('div');
        this.groupBody.className = 'building-fab2-group-body';

        this.groupPanel.appendChild(this.groupHeader);
        this.groupPanel.appendChild(this.groupBody);
        this.groupOverlay.appendChild(this.groupPanel);

        this.decorationLayerPickerOverlay = document.createElement('div');
        this.decorationLayerPickerOverlay.className = 'ui-picker-overlay hidden building-fab2-decoration-layer-picker-overlay';
        this.decorationLayerPickerPanel = document.createElement('div');
        this.decorationLayerPickerPanel.className = 'ui-panel is-interactive building-fab2-decoration-layer-picker-panel';
        this.decorationLayerPickerHeader = document.createElement('div');
        this.decorationLayerPickerHeader.className = 'building-fab2-decoration-layer-picker-header';
        this.decorationLayerPickerTitle = document.createElement('div');
        this.decorationLayerPickerTitle.className = 'ui-title';
        this.decorationLayerPickerTitle.textContent = 'Pick Layer';
        this.decorationLayerPickerCloseBtn = document.createElement('button');
        this.decorationLayerPickerCloseBtn.type = 'button';
        this.decorationLayerPickerCloseBtn.className = 'building-fab2-btn';
        this.decorationLayerPickerCloseBtn.textContent = 'Close';
        this.decorationLayerPickerBody = document.createElement('div');
        this.decorationLayerPickerBody.className = 'building-fab2-decoration-layer-picker-body';
        this.decorationLayerPickerHeader.appendChild(this.decorationLayerPickerTitle);
        this.decorationLayerPickerHeader.appendChild(this.decorationLayerPickerCloseBtn);
        this.decorationLayerPickerPanel.appendChild(this.decorationLayerPickerHeader);
        this.decorationLayerPickerPanel.appendChild(this.decorationLayerPickerBody);
        this.decorationLayerPickerOverlay.appendChild(this.decorationLayerPickerPanel);

        this._bound = false;
        this._enabled = true;
        this._hasBuilding = false;
        this._viewMode = 'mesh';
        this._renderSkyEnabled = true;
        this._hideFaceMarkEnabled = false;
        this._showDummyEnabled = false;
        this._renderSlabEnabled = true;
        this._rulerEnabled = false;
        this._layoutAdjustEnabled = false;
        this._editorMode = BF2_EDITOR_MODE.BUILDING;
        this._layers = [];
        this._layerOpenById = new Map();
        this._floorLayerFaceStateById = new Map();
        this._selectedBayIdByKey = new Map();
        this._linkPopup = null;
        this._groupPopup = null;
        this._facadesByLayerId = null;
        this._windowDefinitions = null;

        this._catalogEntries = [];
        this._thumbById = new Map();
        this._page = 0;
        this._activeSidePanel = null;
        this._buildingPanelExpanded = true;
        this._materialPanelDetailsOpenByKey = new Map();
        this._materialPanelDisposables = [];
        this._materialContext = null;
        this._wallDecoratorTypeEntries = getWallDecoratorTypeEntries();
        this._wallDecoratorTypeEntryById = new Map(this._wallDecoratorTypeEntries.map((entry) => [entry.id, entry]));
        this._decorationSets = [];
        this._decorationLayerOptions = [];
        this._decorationBayOptionsByLayerId = {};
        this._decorationSetOpenById = new Map();
        this._decorationEntryTabByKey = new Map();
        this._decorationLayerPicker = null;

        this.onCreateBuilding = null;
        this.onApplyFootprintPreset = null;
        this.onRequestLoad = null;
        this.onRequestExport = null;
        this.onReset = null;
        this.onSetFloorLayerMaterial = null;
        this.onRequestMaterialConfig = null;
        this.onSidePanelChange = null;
        this.onMaterialConfigChange = null;
        this.onMaterialConfigRequestUiSync = null;
        this.onSetFloorLayerFloors = null;
        this.onSetFloorLayerFloorHeight = null;
        this.onSetFloorLayerInteriorEnabled = null;
        this.onViewModeChange = null;
        this.onRenderSkyChange = null;
        this.onHideFaceMarkChange = null;
        this.onShowDummyChange = null;
        this.onRenderSlabChange = null;
        this.onRulerToggle = null;
        this.onAdjustLayoutToggle = null;
        this.onSelectCatalogEntry = null;

        this.onAddFloorLayer = null;
        this.onAddRoofLayer = null;
        this.onMoveLayer = null;
        this.onDeleteLayer = null;
        this.onSelectFace = null;
        this.onToggleFaceLock = null;
        this.onSetFaceLockReverse = null;
        this.onHoverLayer = null;
        this.onHoverLayerTitle = null;
        this.onHoverBay = null;
        this.onAddBay = null;
        this.onMoveBay = null;
        this.onDeleteBay = null;
        this.onSetBaySizeMode = null;
        this.onSetBayFixedWidth = null;
        this.onSetBayMinWidth = null;
        this.onSetBayMaxWidth = null;
        this.onSetBayExpandPreference = null;
        this.onSetBayWallMaterialOverride = null;
        this.onSetBayTextureFlow = null;
        this.onSetBayDepthEdge = null;
        this.onToggleBayDepthLink = null;
        this.onSetBayLink = null;
        this.onCreateBayGroup = null;
        this.onRemoveBayGroup = null;
        this.onDuplicateBay = null;
        this.onRequestBayMaterialConfig = null;
        this.onSetBayWindowEnabled = null;
        this.onRequestBayWindowPicker = null;
        this.onSetBayWindowAssetType = null;
        this.onSetBayWindowHeightMode = null;
        this.onSetBayWindowVerticalOffset = null;
        this.onSetBayWindowRepeatCount = null;
        this.onSetBayWindowMuntinsEnabled = null;
        this.onSetBayWindowShadesDisabled = null;
        this.onSetBayWindowInteriorPreset = null;
        this.onSetBayGarageFacadeState = null;
        this.onSetBayTopWindowEnabled = null;
        this.onSetBayTopWindowHeightMode = null;
        this.onSetBayTopWindowHeight = null;
        this.onSetBayTopWindowGap = null;
        this.onSetBayTopWindowFrameWidth = null;
        this.onSetBayWindowPlacementWidth = null;
        this.onSetBayWindowPlacementHeight = null;
        this.onSetBayWindowMinWidth = null;
        this.onSetBayWindowMaxWidth = null;
        this.onSetBayWindowPadding = null;
        this.onToggleBayWindowPaddingLink = null;
        this.onEditorModeChange = null;
        this.onAddDecorationSet = null;
        this.onDeleteDecorationSet = null;
        this.onSetDecorationSetLayer = null;
        this.onSetDecorationSetAllBays = null;
        this.onToggleDecorationSetBay = null;
        this.onSetDecorationSetFloorIntervalField = null;
        this.onApplyDecorationSetFloorIntervalPreset = null;
        this.onAddDecorationEntry = null;
        this.onDeleteDecorationEntry = null;
        this.onSetDecorationEntrySpanField = null;
        this.onSetDecorationEntryType = null;
        this.onSetDecorationEntryPlacementField = null;
        this.onApplyDecorationEntryPresetGroup = null;
        this.onSetDecorationEntryProperty = null;
        this.onSetDecorationEntryMaterialKind = null;
        this.onSetDecorationEntryMaterialId = null;
        this.onSetDecorationEntryWallBaseField = null;
        this.onSetDecorationEntryTilingField = null;

        this._onCreateClick = () => this.onCreateBuilding?.();
        this._onFootprintPresetClick = (e) => {
            const btn = e?.target?.closest?.('.building-fab2-footprint-preset-btn');
            if (!btn || !this.footprintPresetsRow.contains(btn) || btn.disabled) return;
            const sizeMeters = Number(btn.dataset?.sizeMeters);
            if (!(sizeMeters > 0)) return;
            this.onApplyFootprintPreset?.(sizeMeters);
        };
        this._onLoadClick = () => this.onRequestLoad?.();
        this._onExportClick = () => this.onRequestExport?.();
        this._onResetClick = () => this.onReset?.();
        this._onCloseMaterialPanelClick = () => this.closeSidePanel();
        this._onSideHandleClick = () => this._toggleBuildingPanelExpanded();
        this._onViewModesClick = (e) => this._handleViewModeClick(e);
        this._onEditorModesClick = (e) => this._handleEditorModeClick(e);
        this._onRenderSkyToggleChange = () => {
            if (this.renderSkyToggleInput.disabled) return;
            this._renderSkyEnabled = !!this.renderSkyToggleInput.checked;
            this._syncRenderSkyToggle();
            this.onRenderSkyChange?.(this._renderSkyEnabled);
        };
        this._onHideFaceMarkToggleChange = () => {
            if (this.hideFaceMarkToggleInput.disabled) return;
            this._hideFaceMarkEnabled = !!this.hideFaceMarkToggleInput.checked;
            this._syncHideFaceMarkToggle();
            this.onHideFaceMarkChange?.(this._hideFaceMarkEnabled);
        };
        this._onShowDummyToggleChange = () => {
            if (this.showDummyToggleInput.disabled) return;
            this._showDummyEnabled = !!this.showDummyToggleInput.checked;
            this._syncShowDummyToggle();
            this.onShowDummyChange?.(this._showDummyEnabled);
        };
        this._onRenderSlabToggleChange = () => {
            if (this.renderSlabToggleInput.disabled) return;
            this._renderSlabEnabled = !!this.renderSlabToggleInput.checked;
            this._syncRenderSlabToggle();
            this.onRenderSlabChange?.(this._renderSlabEnabled);
        };
        this._onRulerClick = () => {
            if (this.rulerBtn.disabled) return;
            this._rulerEnabled = !this._rulerEnabled;
            this._syncRulerButton();
            this.onRulerToggle?.(this._rulerEnabled);
        };
        this._onAdjustLayoutClick = () => {
            if (this.adjustLayoutBtn.disabled) return;
            this._layoutAdjustEnabled = !this._layoutAdjustEnabled;
            this._syncAdjustLayoutButton();
            this.onAdjustLayoutToggle?.(this._layoutAdjustEnabled);
        };
        this._onAdjustModeCloseClick = () => {
            if (this.adjustModeCloseBtn.disabled) return;
            if (!this._layoutAdjustEnabled) return;
            this._layoutAdjustEnabled = false;
            this._syncAdjustLayoutButton();
            this.onAdjustLayoutToggle?.(false);
        };
        this._onAddFloorClick = () => this.onAddFloorLayer?.();
        this._onAddRoofClick = () => this.onAddRoofLayer?.();
        this._onLinkOverlayClick = (e) => this._handleLinkOverlayClick(e);
        this._onCloseLink = () => this.closeLinkPopup();
        this._onLinkBodyClick = (e) => this._handleLinkBodyClick(e);
        this._onLinkBodyChange = (e) => this._handleLinkBodyChange(e);

        this._onOverlayClick = (e) => this._handleLoadOverlayClick(e);
        this._onCloseLoad = () => this.closeLoadBrowser();
        this._onPrevPage = () => this._setPage(this._page - 1);
        this._onNextPage = () => this._setPage(this._page + 1);
        this._onThumbGridClick = (e) => this._handleThumbGridClick(e);

        this._onGroupOverlayClick = (e) => this._handleGroupOverlayClick(e);
        this._onCloseGrouping = () => this.closeGroupingPanel();
        this._onGroupBodyClick = (e) => this._handleGroupBodyClick(e);
        this._onDecorationLayerPickerOverlayClick = (e) => this._handleDecorationLayerPickerOverlayClick(e);
        this._onDecorationLayerPickerCloseClick = () => this.closeDecorationLayerPicker();

        this._renderRightPanel();
        this._renderLayers();
    }

    mount(parent = document.body) {
        if (this.root.isConnected) return;
        parent.appendChild(this.root);
        this._bind();
    }

    unmount() {
        this.closeLoadBrowser();
        this.closeLinkPopup();
        this.closeGroupingPanel();
        this.closeDecorationLayerPicker();
        this.closeSidePanel();
        this._materialPickerPopup?.dispose?.();
        this._unbind();
        if (this.loadOverlay.isConnected) this.loadOverlay.remove();
        if (this.linkOverlay.isConnected) this.linkOverlay.remove();
        if (this.groupOverlay.isConnected) this.groupOverlay.remove();
        if (this.decorationLayerPickerOverlay.isConnected) this.decorationLayerPickerOverlay.remove();
        if (this.root.isConnected) this.root.remove();
    }

    setEnabled(enabled) {
        this._enabled = !!enabled;
        this._syncControls();
        this._renderLayers();
        this._renderDecorationPanel();
        if (this.isDecorationLayerPickerOpen()) this._renderDecorationLayerPicker();
        if (this._activeSidePanel === 'material') this._renderMaterialPanel();
        if (this.isLinkPopupOpen()) this._renderLinkPopup();
    }

    setViewToggles({
        renderSkyEnabled = null,
        hideFaceMarkEnabled = null,
        showDummyEnabled = null,
        renderSlabEnabled = null
    } = {}) {
        if (renderSkyEnabled !== null) this._renderSkyEnabled = !!renderSkyEnabled;
        if (hideFaceMarkEnabled !== null) this._hideFaceMarkEnabled = !!hideFaceMarkEnabled;
        if (showDummyEnabled !== null) this._showDummyEnabled = !!showDummyEnabled;
        if (renderSlabEnabled !== null) this._renderSlabEnabled = !!renderSlabEnabled;
        this._syncViewButtons();
    }

    setRulerEnabled(enabled) {
        this._rulerEnabled = !!enabled;
        this._syncRulerButton();
    }

    setLayoutAdjustEnabled(enabled) {
        this._layoutAdjustEnabled = !!enabled;
        this._syncAdjustLayoutButton();
    }

    setRulerLabel({ visible = false, x = 0, y = 0, text = '' } = {}) {
        if (!this.rulerLabel) return;
        const show = !!visible && Number.isFinite(x) && Number.isFinite(y) && typeof text === 'string' && text;
        if (!show) {
            this.rulerLabel.style.display = 'none';
            return;
        }
        this.rulerLabel.textContent = text;
        this.rulerLabel.style.display = 'block';
        this.rulerLabel.style.left = `${x}px`;
        this.rulerLabel.style.top = `${y}px`;
    }

    setLayoutWidthLabels(labels = []) {
        const entries = Array.isArray(labels) ? labels : [];
        const targets = [this.layoutWidthLabelA, this.layoutWidthLabelB];
        for (let i = 0; i < targets.length; i++) {
            const labelEl = targets[i];
            if (!labelEl) continue;
            const item = entries[i];
            const show = !!item?.visible
                && Number.isFinite(item?.x)
                && Number.isFinite(item?.y)
                && typeof item?.text === 'string'
                && item.text;
            if (!show) {
                labelEl.style.display = 'none';
                continue;
            }
            labelEl.textContent = item.text;
            labelEl.style.display = 'block';
            labelEl.style.left = `${item.x}px`;
            labelEl.style.top = `${item.y}px`;
        }
    }

    setBuildingState({
        hasBuilding = false,
        buildingName = '',
        buildingType = 'business'
    } = {}) {
        this._hasBuilding = !!hasBuilding;
        if (!this._hasBuilding) {
            this._selectedBayIdByKey.clear();
            this.closeGroupingPanel();
            this.closeDecorationLayerPicker();
            this.closeSidePanel();
            this._layoutAdjustEnabled = false;
            this._editorMode = BF2_EDITOR_MODE.BUILDING;
            this._syncAdjustLayoutButton();
            this.setLayoutWidthLabels([]);
        }
        const name = typeof buildingName === 'string' ? buildingName : '';
        const type = (buildingType === 'business' || buildingType === 'industrial' || buildingType === 'apartments' || buildingType === 'house')
            ? buildingType
            : 'business';

        this.nameInput.value = name;
        this.typeSelect.value = type;

        this._renderRightPanel();
        this._syncControls();
    }

    getBuildingName() {
        return String(this.nameInput.value || '').trim();
    }

    getBuildingType() {
        return String(this.typeSelect.value || '').trim();
    }

    setEditorMode(mode) {
        this._editorMode = normalizeBf2EditorMode(mode);
        this._renderRightPanel();
        this._syncControls();
    }

    setDecorationEditorState({
        sets = [],
        layerOptions = [],
        bayOptionsByLayerId = null
    } = {}) {
        this._decorationSets = Array.isArray(sets) ? sets : [];
        this._decorationLayerOptions = Array.isArray(layerOptions) ? layerOptions : [];
        this._decorationBayOptionsByLayerId = bayOptionsByLayerId && typeof bayOptionsByLayerId === 'object'
            ? bayOptionsByLayerId
            : {};
        this._renderDecorationPanel();
        if (this.isDecorationLayerPickerOpen()) this._renderDecorationLayerPicker();
    }

    setLayers(layers) {
        this._layers = normalizeLayers(layers);
        if (this._linkPopup) {
            const linkLayerId = this._linkPopup.layerId;
            const stillExists = this._layers.some((l) => l?.type === 'floor' && l?.id === linkLayerId);
            if (!stillExists) this.closeLinkPopup();
        }
        if (this._groupPopup) {
            const groupLayerId = this._groupPopup.layerId;
            const stillExists = this._layers.some((l) => l?.type === 'floor' && l?.id === groupLayerId);
            if (!stillExists) this.closeGroupingPanel();
        }
        this._renderLayers();
        this._renderDecorationPanel();
        if (this.isDecorationLayerPickerOpen()) this._renderDecorationLayerPicker();
        this._syncControls();
    }

    setFloorLayerFaceStates(faceStateByLayerId) {
        const next = new Map();
        if (faceStateByLayerId instanceof Map) {
            for (const [layerId, state] of faceStateByLayerId.entries()) {
                if (typeof layerId !== 'string' || !layerId) continue;
                next.set(layerId, {
                    selectedFaceId: isFaceId(state?.selectedFaceId) ? state.selectedFaceId : null,
                    lockedToByFace: normalizeLockedToByFace(state?.lockedToByFace ?? null),
                    reverseByFace: normalizeReverseByFace(state?.reverseByFace ?? null)
                });
            }
        }
        this._floorLayerFaceStateById = next;
        this._renderLayers();
        if (this._linkPopup && !this._floorLayerFaceStateById.has(this._linkPopup.layerId)) this.closeLinkPopup();
        if (this._groupPopup && !this._floorLayerFaceStateById.has(this._groupPopup.layerId)) this.closeGroupingPanel();
        if (this.isLinkPopupOpen()) this._renderLinkPopup();
        if (this.isGroupingPanelOpen()) this._renderGroupingPanel();
        this._syncControls();
    }

    setMaterialConfigContext(context) {
        this._materialContext = context && typeof context === 'object' ? context : null;
        if (this._activeSidePanel === 'material') this._renderMaterialPanel();
    }

    setFacadesByLayerId(facadesByLayerId) {
        this._facadesByLayerId = facadesByLayerId && typeof facadesByLayerId === 'object' ? facadesByLayerId : null;
        this._renderLayers();
        this._renderDecorationPanel();
        if (this._activeSidePanel === 'material') this._renderMaterialPanel();
        if (this.isLinkPopupOpen()) this._renderLinkPopup();
        if (this.isGroupingPanelOpen()) this._renderGroupingPanel();
        this._syncControls();
    }

    setWindowDefinitions(windowDefinitions) {
        this._windowDefinitions = windowDefinitions && typeof windowDefinitions === 'object' ? windowDefinitions : null;
        this._renderLayers();
        this._syncControls();
    }

    setCatalogEntries(entries) {
        this._catalogEntries = normalizeCatalogEntries(entries);
        this._page = 0;
        if (this.isLoadBrowserOpen()) this._renderLoadGrid();
    }

    setCatalogThumbnail(configId, url) {
        const id = typeof configId === 'string' ? configId : '';
        const u = typeof url === 'string' ? url : '';
        if (!id || !u) return;
        this._thumbById.set(id, u);
        if (this.isLoadBrowserOpen()) this._renderLoadGrid();
    }

    isLoadBrowserOpen() {
        return this.loadOverlay.isConnected && !this.loadOverlay.classList.contains('hidden');
    }

    openLoadBrowser() {
        if (!this.loadOverlay.isConnected) document.body.appendChild(this.loadOverlay);
        this.loadOverlay.classList.remove('hidden');
        this._setPage(0);
    }

    closeLoadBrowser() {
        if (!this.loadOverlay.isConnected) return;
        this.loadOverlay.classList.add('hidden');
    }

    isSidePanelOpen() {
        return !!this._activeSidePanel;
    }

    openMaterialConfigPanel() {
        if (!this._enabled || !this._hasBuilding) return;
        this._activeSidePanel = 'material';
        this._syncSidePanelLayout();
        this._renderMaterialPanel();
        this.onSidePanelChange?.();
    }

    closeSidePanel() {
        if (!this._activeSidePanel) return;
        this._activeSidePanel = null;
        this._buildingPanelExpanded = true;
        for (const d of this._materialPanelDisposables) d?.dispose?.();
        this._materialPanelDisposables.length = 0;
        this.materialBody.textContent = '';
        this._syncSidePanelLayout();
        this.onSidePanelChange?.();
    }

    _toggleBuildingPanelExpanded() {
        if (!this._activeSidePanel) return;
        this._buildingPanelExpanded = !this._buildingPanelExpanded;
        this._syncSidePanelLayout();
    }

    _syncSidePanelLayout() {
        const open = !!this._activeSidePanel;
        this.materialPanel.classList.toggle('hidden', this._activeSidePanel !== 'material');
        this.sideHandle.classList.toggle('hidden', !open);
        this.rightPanel.classList.toggle('hidden', open && !this._buildingPanelExpanded);

        const isExpanded = !open || this._buildingPanelExpanded;
        applyMaterialSymbolToButton(this.sideHandleBtn, {
            name: isExpanded ? 'chevron_right' : 'chevron_left',
            label: isExpanded ? 'Collapse building panel' : 'Expand building panel',
            size: 'sm'
        });
    }

    _renderMaterialPanel() {
        for (const d of this._materialPanelDisposables) d?.dispose?.();
        this._materialPanelDisposables.length = 0;
        this.materialBody.textContent = '';

        const ctx = this._materialContext;
        const layerId = typeof ctx?.layerId === 'string' ? ctx.layerId : '';
        const layer = ctx?.layer && typeof ctx.layer === 'object' ? ctx.layer : null;
        const masterFaceId = isFaceId(ctx?.masterFaceId) ? ctx.masterFaceId : null;
        const cfg = ctx?.config && typeof ctx.config === 'object' ? ctx.config : null;
        const target = ctx?.target === 'bay' ? 'bay' : 'face';
        const bayId = target === 'bay' && typeof ctx?.bayId === 'string' ? ctx.bayId : '';
        const bayIndex = target === 'bay' && Number.isFinite(ctx?.bayIndex) ? Math.max(0, Math.floor(ctx.bayIndex)) : null;
        const faceCfgForBay = target === 'bay' && ctx?.faceConfig && typeof ctx.faceConfig === 'object' ? ctx.faceConfig : null;

        if (target === 'bay' && layerId && masterFaceId && bayId) {
            const bayLabel = Number.isInteger(bayIndex) ? `Bay ${bayIndex + 1}` : 'Bay';
            this.materialTitle.textContent = `Material Configuration · ${bayLabel} · Face ${masterFaceId}`;
        } else {
            this.materialTitle.textContent = (layerId && masterFaceId)
                ? `Material Configuration · Face ${masterFaceId}`
                : 'Material Configuration';
        }

        const allowEdit = this._enabled && this._hasBuilding && !!layerId && !!masterFaceId && !!cfg && (target !== 'bay' || !!bayId);
        const onChange = () => this.onMaterialConfigChange?.();

        const hintText = (!layerId || !masterFaceId)
            ? (target === 'bay'
                ? 'Select a bay and click its material picker to edit.'
                : 'Select a face and click the wall material picker to edit.')
            : 'Material editing is currently disabled.';

        const normalizeWallTextureId = (texId) => {
            const id = typeof texId === 'string' ? texId : '';
            return resolveBuildingStylePbrMaterialId(id) ?? id;
        };

        const getTexOpt = (id) => this._wallTextureDefById?.get(normalizeWallTextureId(id));
        const getColorOpt = (id) => (this._beltCourseColorOptions ?? []).find((o) => o?.id === id) ?? null;

        const deepClone = (value) => {
            if (Array.isArray(value)) return value.map((it) => deepClone(it));
            if (value && typeof value === 'object') {
                const out = {};
                for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
                return out;
            }
            return value;
        };

        const bayConfig = target === 'bay' ? cfg : null;
        const linkedFromBayId = target === 'bay' ? resolveBayLinkFromSpec(bayConfig) : null;

        let bayIndexById = null;
        if (target === 'bay' && layerId && masterFaceId) {
            const layerFacades = (this._facadesByLayerId?.[layerId] && typeof this._facadesByLayerId[layerId] === 'object')
                ? this._facadesByLayerId[layerId]
                : null;
            const facade = (layerFacades?.[masterFaceId] && typeof layerFacades[masterFaceId] === 'object')
                ? layerFacades[masterFaceId]
                : null;
            const bays = Array.isArray(facade?.layout?.bays?.items) ? facade.layout.bays.items : [];
            const map = new Map();
            for (let i = 0; i < bays.length; i++) {
                const bay = bays[i] && typeof bays[i] === 'object' ? bays[i] : null;
                const id = typeof bay?.id === 'string' ? bay.id : '';
                if (id) map.set(id, i);
            }
            bayIndexById = map;
        }

        const resolveBayIndexLabel = (id) => {
            const idx = bayIndexById?.get?.(id) ?? null;
            return Number.isInteger(idx) ? `Bay ${idx + 1}` : id;
        };

        const linkedOverlay = document.createElement('div');
        linkedOverlay.className = 'building-fab2-material-linked-overlay';
        linkedOverlay.classList.toggle('hidden', !linkedFromBayId);

        if (linkedFromBayId) {
            const label = document.createElement('div');
            label.className = 'building-fab2-material-linked-label';
            label.appendChild(createMaterialSymbolIcon('link', { size: 'sm' }));
            const text = document.createElement('span');
            text.textContent = `Linked to ${resolveBayIndexLabel(linkedFromBayId)}`;
            label.appendChild(text);
            linkedOverlay.appendChild(label);

            const unlinkBtn = document.createElement('button');
            unlinkBtn.type = 'button';
            unlinkBtn.className = 'building-fab2-btn building-fab2-btn-danger building-fab2-btn-small';
            unlinkBtn.textContent = 'Unlink';
            unlinkBtn.disabled = !allowEdit;
            unlinkBtn.addEventListener('click', () => {
                if (!allowEdit) return;
                this.onSetBayLink?.(layerId, masterFaceId, bayId, null);
                this.onMaterialConfigRequestUiSync?.();
                this._renderMaterialPanel();
            });
            linkedOverlay.appendChild(unlinkBtn);
        }

        const sections = document.createElement('div');
        sections.className = 'building-fab2-material-sections';
        sections.classList.toggle('is-hidden', !!linkedFromBayId);

        this.materialBody.appendChild(linkedOverlay);
        this.materialBody.appendChild(sections);

        const createFlatSection = (title) => {
            const section = document.createElement('div');
            section.className = 'building-fab2-material-flat-section';
            const label = document.createElement('div');
            label.className = 'building-fab2-material-flat-title';
            label.textContent = title;
            const body = document.createElement('div');
            body.className = 'building-fab2-material-flat-body';
            section.appendChild(label);
            section.appendChild(body);
            sections.appendChild(section);
            return { section, label, body };
        };

        const syncMaterialPicker = (picker, material) => {
            const spec = material && typeof material === 'object' ? material : {};
            const kind = spec.kind === 'color' ? 'color' : 'texture';
            const id = typeof spec.id === 'string' ? spec.id : '';
            if (kind === 'color') {
                const opt = getColorOpt(id);
                picker.text.textContent = opt?.label ?? id;
                setMaterialThumbToColor(picker.thumb, opt?.hex ?? 0xffffff);
                return;
            }
            const opt = getTexOpt(id);
            picker.text.textContent = opt?.label ?? id;
            setMaterialThumbToTexture(picker.thumb, opt?.wallTextureUrl ?? '', opt?.label ?? id);
        };

        const resolveLayerMaterial = () => {
            const layerRaw = layer?.material && typeof layer.material === 'object' ? layer.material : null;
            const layerKind = layerRaw?.kind;
            const layerMatId = typeof layerRaw?.id === 'string' ? layerRaw.id : '';
            if ((layerKind === 'texture' || layerKind === 'color') && layerMatId) {
                if (layerKind === 'texture') return { kind: layerKind, id: normalizeWallTextureId(layerMatId) };
                return { kind: layerKind, id: layerMatId };
            }
            const styleId = typeof layer?.style === 'string' && layer.style ? layer.style : 'default';
            return { kind: 'texture', id: normalizeWallTextureId(styleId) };
        };

        const resolveMaterialWithFallback = (sourceCfg) => {
            const raw = sourceCfg?.material && typeof sourceCfg.material === 'object' ? sourceCfg.material : null;
            const kind = raw?.kind;
            const id = typeof raw?.id === 'string' ? raw.id : '';
            if ((kind === 'texture' || kind === 'color') && id) {
                if (kind === 'texture') return { kind, id: normalizeWallTextureId(id) };
                return { kind, id };
            }
            return resolveLayerMaterial();
        };

        const getMaterialTilingKey = (material) => {
            const spec = material && typeof material === 'object' ? material : null;
            const kind = spec?.kind === 'color' ? 'color' : (spec?.kind === 'texture' ? 'texture' : '');
            const rawId = typeof spec?.id === 'string' ? spec.id : '';
            if (!kind || !rawId) return '';
            const id = kind === 'texture' ? normalizeWallTextureId(rawId) : rawId;
            return `${kind}:${id}`;
        };

        const getTilingMap = (owner) => {
            if (!owner || typeof owner !== 'object') return null;
            const raw = owner.tilingByMaterial;
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
            owner.tilingByMaterial = {};
            return owner.tilingByMaterial;
        };

        const ensureMaterialTilingEntry = ({ owner, material, legacyTiling = null, fallbackTiling = null } = {}) => {
            const key = getMaterialTilingKey(material);
            const map = getTilingMap(owner);
            const fallback = fallbackTiling && typeof fallbackTiling === 'object' ? fallbackTiling : {};
            const legacy = legacyTiling && typeof legacyTiling === 'object' ? legacyTiling : null;
            if (!key || !map) {
                const entry = deepClone(legacy ?? fallback ?? {});
                return { key: '', map: null, entry };
            }
            const existing = map[key];
            if (existing && typeof existing === 'object') return { key, map, entry: existing };
            const hasEntries = Object.keys(map).length > 0;
            const seed = (!hasEntries && legacy) ? legacy : fallback;
            const entry = deepClone(seed ?? {});
            map[key] = entry;
            return { key, map, entry };
        };

        const resolveWallBaseProxy = (source) => {
            const src = source && typeof source === 'object' ? source : {};
            const tintState = resolveWallBaseTintStateFromWallBase(src, WALL_BASE_TINT_STATE_DEFAULT);
            const out = {
                roughness: clamp(src.roughness ?? 0.85, 0.0, 1.0),
                normalStrength: clamp(src.normalStrength ?? src.normal ?? 0.9, 0.0, 2.0)
            };
            applyWallBaseTintStateToWallBase(out, tintState);
            return out;
        };

        const createCommittedWallBaseFromProxy = (proxy) => {
            const src = proxy && typeof proxy === 'object' ? proxy : {};
            const tintState = resolveWallBaseTintStateFromWallBase(src, WALL_BASE_TINT_STATE_DEFAULT);
            const out = {
                roughness: clamp(src.roughness ?? 0.85, 0.0, 1.0),
                normalStrength: clamp(src.normalStrength ?? src.normal ?? 0.9, 0.0, 2.0)
            };
            applyWallBaseTintStateToWallBase(out, tintState);
            return out;
        };

        const appendTintControls = ({
            container,
            allow = false,
            wallBaseProxy,
            isTexturedMaterial = null,
            onCommit = null
        } = {}) => {
            const textured = typeof isTexturedMaterial === 'function' ? isTexturedMaterial : () => true;
            const commit = typeof onCommit === 'function' ? onCommit : null;
            const row = document.createElement('div');
            row.className = 'building-fab-row building-fab-row-wide';
            const label = document.createElement('div');
            label.className = 'building-fab-row-label';
            label.textContent = 'Tint';
            const control = document.createElement('div');
            control.className = 'building-fab2-tint-picker-host';
            row.appendChild(label);
            row.appendChild(control);
            container.appendChild(row);

            const picker = new SharedHsvbTintPicker({
                initialState: resolveWallBaseTintStateFromWallBase(wallBaseProxy, WALL_BASE_TINT_STATE_DEFAULT),
                onChange: (nextState) => {
                    if (!wallBaseProxy || typeof wallBaseProxy !== 'object') return;
                    applyWallBaseTintStateToWallBase(wallBaseProxy, nextState);
                    commit?.();
                    syncRows();
                }
            });
            control.appendChild(picker.element);
            this._materialPanelDisposables.push(picker);

            const syncRows = () => {
                const enabled = !!allow && !!textured();
                picker.setDisabled(!enabled);
                picker.setState(resolveWallBaseTintStateFromWallBase(wallBaseProxy, WALL_BASE_TINT_STATE_DEFAULT));
            };

            syncRows();
            return { syncRows };
        };

        const baseSection = createFlatSection('Base material');
        const tilingSection = createFlatSection('Texture tiling');

        if (!allowEdit) {
            baseSection.body.appendChild(createHint(hintText));
            tilingSection.body.appendChild(createHint(hintText));
            return;
        }

        if (target === 'bay') {
            const bayCfg = cfg;
            const allowBayEdit = allowEdit && !linkedFromBayId;
            const resolveMasterFaceMaterial = () => resolveMaterialWithFallback(faceCfgForBay);
            const resolveBayOverrideMaterial = () => {
                const raw = bayCfg?.wallMaterialOverride && typeof bayCfg.wallMaterialOverride === 'object' ? bayCfg.wallMaterialOverride : null;
                const kind = raw?.kind;
                const id = typeof raw?.id === 'string' ? raw.id : '';
                if ((kind === 'texture' || kind === 'color') && id) {
                    if (kind === 'texture') return { kind, id: normalizeWallTextureId(id) };
                    return { kind, id };
                }
                return null;
            };
            const resolveEffectiveBayMaterial = () => resolveBayOverrideMaterial() ?? resolveMasterFaceMaterial();
            const resolveFaceTilingForMaterial = (material) => {
                const key = getMaterialTilingKey(material);
                const faceMap = faceCfgForBay?.tilingByMaterial && typeof faceCfgForBay.tilingByMaterial === 'object'
                    ? faceCfgForBay.tilingByMaterial
                    : null;
                if (key && faceMap?.[key] && typeof faceMap[key] === 'object') return deepClone(faceMap[key]);
                if (faceCfgForBay?.tiling && typeof faceCfgForBay.tiling === 'object') return deepClone(faceCfgForBay.tiling);
                if (layer?.tiling && typeof layer.tiling === 'object') return deepClone(layer.tiling);
                return {};
            };
            const syncBayLegacyTilingFromActiveMaterial = () => {
                const activeMaterial = resolveEffectiveBayMaterial();
                const legacy = bayCfg?.tiling && typeof bayCfg.tiling === 'object' ? bayCfg.tiling : null;
                const fallback = resolveFaceTilingForMaterial(activeMaterial);
                const { entry } = ensureMaterialTilingEntry({
                    owner: bayCfg,
                    material: activeMaterial,
                    legacyTiling: legacy,
                    fallbackTiling: fallback
                });
                bayCfg.tiling = deepClone(entry);
            };

            const bayMaterialPicker = createMaterialPickerRowController({
                label: '',
                rowExtraClassName: 'building-fab2-no-label',
                disabled: !allowBayEdit,
                onPick: () => {
                    if (!allowBayEdit) return;
                    const current = resolveEffectiveBayMaterial();
                    const selectedId = current ? `${current.kind}:${current.id}` : null;
                    const label = Number.isInteger(bayIndex) ? `Bay ${bayIndex + 1}` : 'Bay';

                    this._materialPickerPopup.open({
                        title: `Wall material · ${label} · Face ${masterFaceId ?? ''}`.trim(),
                        sections: [
                            ...this._baseWallTexturePickerSections,
                            { label: 'Color', options: this._baseWallColorPickerOptions }
                        ],
                        selectedId,
                        onSelect: (opt) => {
                            const next = parseMaterialPickerId(opt?.id);
                            if (!next) return;
                            if (next.kind === 'texture') next.id = normalizeWallTextureId(next.id);
                            const inherited = resolveMasterFaceMaterial();
                            const matchesInherited = !!inherited && inherited.kind === next.kind && inherited.id === next.id;
                            bayCfg.wallMaterialOverride = matchesInherited ? null : next;
                            syncBayLegacyTilingFromActiveMaterial();
                            syncBayPicker();
                            onChange();
                            this.onMaterialConfigRequestUiSync?.();
                            this._renderMaterialPanel();
                        }
                    });
                }
            });

            const syncBayPicker = () => {
                const override = resolveBayOverrideMaterial();
                syncMaterialPicker(bayMaterialPicker, override ?? resolveMasterFaceMaterial());
                if (!override) bayMaterialPicker.text.textContent = `${bayMaterialPicker.text.textContent} (inherited)`;
            };

            syncBayPicker();
            baseSection.body.appendChild(bayMaterialPicker.row);

            if (resolveBayOverrideMaterial()) {
                const clearBtn = document.createElement('button');
                clearBtn.type = 'button';
                clearBtn.className = 'building-fab2-btn building-fab2-btn-full';
                clearBtn.textContent = 'Clear bay override';
                clearBtn.addEventListener('click', () => {
                    if (!allowBayEdit) return;
                    if (bayCfg.wallMaterialOverride === null || bayCfg.wallMaterialOverride === undefined) return;
                    bayCfg.wallMaterialOverride = null;
                    syncBayLegacyTilingFromActiveMaterial();
                    syncBayPicker();
                    onChange();
                    this.onMaterialConfigRequestUiSync?.();
                    this._renderMaterialPanel();
                });
                baseSection.body.appendChild(clearBtn);
            }

            baseSection.body.appendChild(createHint('These controls affect this bay wall surface.'));

            const resolveEffectiveWallBase = () => {
                const src = (bayCfg?.wallBase && typeof bayCfg.wallBase === 'object')
                    ? bayCfg.wallBase
                    : ((faceCfgForBay?.wallBase && typeof faceCfgForBay.wallBase === 'object')
                        ? faceCfgForBay.wallBase
                        : ((layer?.wallBase && typeof layer.wallBase === 'object') ? layer.wallBase : null));
                return resolveWallBaseProxy(src ?? null);
            };

            const wallBaseProxy = resolveEffectiveWallBase();
            const commitWallBase = () => {
                if (!allowBayEdit) return;
                bayCfg.wallBase = createCommittedWallBaseFromProxy(wallBaseProxy);
                onChange();
            };

            const tintControls = appendTintControls({
                container: baseSection.body,
                allow: allowBayEdit,
                wallBaseProxy,
                isTexturedMaterial: () => resolveEffectiveBayMaterial()?.kind !== 'color',
                onCommit: commitWallBase
            });

            const roughRow = createRangeRow('Wall roughness');
            roughRow.range.min = '0';
            roughRow.range.max = '1';
            roughRow.range.step = '0.01';
            roughRow.number.min = '0';
            roughRow.number.max = '1';
            roughRow.number.step = '0.01';

            const normalRow = createRangeRow('Wall normal strength');
            normalRow.range.min = '0';
            normalRow.range.max = '2';
            normalRow.range.step = '0.01';
            normalRow.number.min = '0';
            normalRow.number.max = '2';
            normalRow.number.step = '0.01';

            const syncRanges = () => {
                const rough = clamp(wallBaseProxy.roughness ?? 0.85, 0.0, 1.0);
                roughRow.range.disabled = !allowBayEdit;
                roughRow.number.disabled = !allowBayEdit;
                roughRow.range.value = String(rough);
                roughRow.number.value = rough.toFixed(2);

                const normal = clamp(wallBaseProxy.normalStrength ?? 0.9, 0.0, 2.0);
                normalRow.range.disabled = !allowBayEdit;
                normalRow.number.disabled = !allowBayEdit;
                normalRow.range.value = String(normal);
                normalRow.number.value = normal.toFixed(2);

                tintControls.syncRows();
            };

            const setRoughnessFromUi = (raw) => {
                wallBaseProxy.roughness = clamp(raw, 0.0, 1.0);
                commitWallBase();
                syncRanges();
            };
            const setNormalFromUi = (raw) => {
                wallBaseProxy.normalStrength = clamp(raw, 0.0, 2.0);
                commitWallBase();
                syncRanges();
            };

            roughRow.range.addEventListener('input', () => setRoughnessFromUi(roughRow.range.value));
            roughRow.number.addEventListener('input', () => setRoughnessFromUi(roughRow.number.value));
            normalRow.range.addEventListener('input', () => setNormalFromUi(normalRow.range.value));
            normalRow.number.addEventListener('input', () => setNormalFromUi(normalRow.number.value));

            syncRanges();
            baseSection.body.appendChild(roughRow.row);
            baseSection.body.appendChild(normalRow.row);

            const activeMaterial = resolveEffectiveBayMaterial();
            const legacy = bayCfg?.tiling && typeof bayCfg.tiling === 'object' ? bayCfg.tiling : null;
            const fallback = resolveFaceTilingForMaterial(activeMaterial);
            const activeTiling = ensureMaterialTilingEntry({
                owner: bayCfg,
                material: activeMaterial,
                legacyTiling: legacy,
                fallbackTiling: fallback
            });
            const tilingProxy = deepClone(activeTiling.entry);

            const tilingController = createTextureTilingMiniController({
                mode: 'inline',
                showTitle: false,
                allow: allowBayEdit,
                tiling: tilingProxy,
                defaults: { tileMeters: 2.0 },
                hintText: 'Overrides the material tile size in meters for the selected material.',
                onChange: () => {
                    if (!allowBayEdit) return;
                    if (activeTiling.key) {
                        const map = getTilingMap(bayCfg);
                        if (map) map[activeTiling.key] = deepClone(tilingProxy);
                    }
                    bayCfg.tiling = deepClone(tilingProxy);
                    onChange();
                }
            });
            tilingController.mount(tilingSection.body);
            this._materialPanelDisposables.push(tilingController);
            return;
        }

        cfg.wallBase ??= {
            ...applyWallBaseTintStateToWallBase({}, WALL_BASE_TINT_STATE_DEFAULT),
            roughness: 0.85,
            normalStrength: 0.9
        };
        const resolveFaceMaterial = () => resolveMaterialWithFallback(cfg);
        const syncFaceLegacyTilingFromActiveMaterial = () => {
            const activeMaterial = resolveFaceMaterial();
            const legacy = cfg?.tiling && typeof cfg.tiling === 'object' ? cfg.tiling : null;
            const fallback = (layer?.tiling && typeof layer.tiling === 'object') ? layer.tiling : {};
            const { entry } = ensureMaterialTilingEntry({
                owner: cfg,
                material: activeMaterial,
                legacyTiling: legacy,
                fallbackTiling: fallback
            });
            cfg.tiling = deepClone(entry);
        };

        const wallMaterialPicker = createMaterialPickerRowController({
            label: '',
            rowExtraClassName: 'building-fab2-no-label',
            disabled: !allowEdit,
            onPick: () => {
                const current = resolveFaceMaterial();
                const selectedId = current ? `${current.kind}:${current.id}` : null;

                this._materialPickerPopup.open({
                    title: `Wall material · Face ${masterFaceId ?? ''}`.trim(),
                    sections: [
                        ...this._baseWallTexturePickerSections,
                        { label: 'Color', options: this._baseWallColorPickerOptions }
                    ],
                    selectedId,
                    onSelect: (opt) => {
                        const next = parseMaterialPickerId(opt?.id);
                        if (!next) return;
                        if (next.kind === 'texture') next.id = normalizeWallTextureId(next.id);
                        cfg.material = next;
                        syncFaceLegacyTilingFromActiveMaterial();
                        syncMaterialPicker(wallMaterialPicker, cfg.material);
                        onChange();
                        this.onMaterialConfigRequestUiSync?.();
                        this._renderMaterialPanel();
                    }
                });
            }
        });

        syncMaterialPicker(wallMaterialPicker, resolveFaceMaterial());
        baseSection.body.appendChild(wallMaterialPicker.row);
        baseSection.body.appendChild(createHint('These controls affect the full face wall surface.'));

        const wallBaseProxy = resolveWallBaseProxy(cfg.wallBase);
        const commitWallBase = () => {
            cfg.wallBase = createCommittedWallBaseFromProxy(wallBaseProxy);
            onChange();
        };

        const tintControls = appendTintControls({
            container: baseSection.body,
            allow: allowEdit,
            wallBaseProxy,
            isTexturedMaterial: () => resolveFaceMaterial()?.kind !== 'color',
            onCommit: commitWallBase
        });

        const roughRow = createRangeRow('Wall roughness');
        roughRow.range.min = '0';
        roughRow.range.max = '1';
        roughRow.range.step = '0.01';
        roughRow.number.min = '0';
        roughRow.number.max = '1';
        roughRow.number.step = '0.01';

        const normalRow = createRangeRow('Wall normal strength');
        normalRow.range.min = '0';
        normalRow.range.max = '2';
        normalRow.range.step = '0.01';
        normalRow.number.min = '0';
        normalRow.number.max = '2';
        normalRow.number.step = '0.01';

        const syncRanges = () => {
            const rough = clamp(wallBaseProxy.roughness ?? 0.85, 0.0, 1.0);
            roughRow.range.disabled = !allowEdit;
            roughRow.number.disabled = !allowEdit;
            roughRow.range.value = String(rough);
            roughRow.number.value = rough.toFixed(2);

            const normal = clamp(wallBaseProxy.normalStrength ?? 0.9, 0.0, 2.0);
            normalRow.range.disabled = !allowEdit;
            normalRow.number.disabled = !allowEdit;
            normalRow.range.value = String(normal);
            normalRow.number.value = normal.toFixed(2);

            tintControls.syncRows();
        };

        const setRoughnessFromUi = (raw) => {
            wallBaseProxy.roughness = clamp(raw, 0.0, 1.0);
            commitWallBase();
            syncRanges();
        };
        const setNormalFromUi = (raw) => {
            wallBaseProxy.normalStrength = clamp(raw, 0.0, 2.0);
            commitWallBase();
            syncRanges();
        };

        roughRow.range.addEventListener('input', () => setRoughnessFromUi(roughRow.range.value));
        roughRow.number.addEventListener('input', () => setRoughnessFromUi(roughRow.number.value));
        normalRow.range.addEventListener('input', () => setNormalFromUi(normalRow.range.value));
        normalRow.number.addEventListener('input', () => setNormalFromUi(normalRow.number.value));

        syncRanges();
        baseSection.body.appendChild(roughRow.row);
        baseSection.body.appendChild(normalRow.row);

        const activeMaterial = resolveFaceMaterial();
        const legacy = cfg?.tiling && typeof cfg.tiling === 'object' ? cfg.tiling : null;
        const fallback = (layer?.tiling && typeof layer.tiling === 'object') ? layer.tiling : {};
        const activeTiling = ensureMaterialTilingEntry({
            owner: cfg,
            material: activeMaterial,
            legacyTiling: legacy,
            fallbackTiling: fallback
        });
        const tilingProxy = deepClone(activeTiling.entry);

        const tilingController = createTextureTilingMiniController({
            mode: 'inline',
            showTitle: false,
            allow: true,
            tiling: tilingProxy,
            defaults: { tileMeters: 2.0 },
            hintText: 'Overrides the material tile size in meters for the selected material.',
            onChange: () => {
                if (activeTiling.key) {
                    const map = getTilingMap(cfg);
                    if (map) map[activeTiling.key] = deepClone(tilingProxy);
                }
                cfg.tiling = deepClone(tilingProxy);
                onChange();
            }
        });
        tilingController.mount(tilingSection.body);
        this._materialPanelDisposables.push(tilingController);
    }

    _bind() {
        if (this._bound) return;
        this._bound = true;

        this.createBuildingBtn.addEventListener('click', this._onCreateClick);
        this.footprintPresetsRow.addEventListener('click', this._onFootprintPresetClick);
        this.loadBtn.addEventListener('click', this._onLoadClick);
        this.exportBtn.addEventListener('click', this._onExportClick);
        this.resetBtn.addEventListener('click', this._onResetClick);
        this.materialCloseBtn.addEventListener('click', this._onCloseMaterialPanelClick);
        this.sideHandleBtn.addEventListener('click', this._onSideHandleClick);
        this.viewModes.addEventListener('click', this._onViewModesClick);
        this.editorModes.addEventListener('click', this._onEditorModesClick);
        this.renderSkyToggleInput.addEventListener('change', this._onRenderSkyToggleChange);
        this.hideFaceMarkToggleInput.addEventListener('change', this._onHideFaceMarkToggleChange);
        this.showDummyToggleInput.addEventListener('change', this._onShowDummyToggleChange);
        this.renderSlabToggleInput.addEventListener('change', this._onRenderSlabToggleChange);
        this.adjustLayoutBtn.addEventListener('click', this._onAdjustLayoutClick);
        this.adjustModeCloseBtn.addEventListener('click', this._onAdjustModeCloseClick);
        this.rulerBtn.addEventListener('click', this._onRulerClick);
        this.addFloorBtn.addEventListener('click', this._onAddFloorClick);
        this.addRoofBtn.addEventListener('click', this._onAddRoofClick);

        this.loadOverlay.addEventListener('click', this._onOverlayClick);
        this.loadCloseBtn.addEventListener('click', this._onCloseLoad);
        this.prevPageBtn.addEventListener('click', this._onPrevPage);
        this.nextPageBtn.addEventListener('click', this._onNextPage);
        this.thumbGrid.addEventListener('click', this._onThumbGridClick);

        this.linkOverlay.addEventListener('click', this._onLinkOverlayClick);
        this.linkCloseBtn.addEventListener('click', this._onCloseLink);
        this.linkBody.addEventListener('click', this._onLinkBodyClick);
        this.linkBody.addEventListener('change', this._onLinkBodyChange);

        this.groupOverlay.addEventListener('click', this._onGroupOverlayClick);
        this.groupDoneBtn.addEventListener('click', this._onCloseGrouping);
        this.groupBody.addEventListener('click', this._onGroupBodyClick);
        this.decorationLayerPickerOverlay.addEventListener('click', this._onDecorationLayerPickerOverlayClick);
        this.decorationLayerPickerCloseBtn.addEventListener('click', this._onDecorationLayerPickerCloseClick);

        this._syncControls();
        this._syncViewButtons();
        this._renderLayers();
    }

    _unbind() {
        if (!this._bound) return;
        this._bound = false;

        this.createBuildingBtn.removeEventListener('click', this._onCreateClick);
        this.footprintPresetsRow.removeEventListener('click', this._onFootprintPresetClick);
        this.loadBtn.removeEventListener('click', this._onLoadClick);
        this.exportBtn.removeEventListener('click', this._onExportClick);
        this.resetBtn.removeEventListener('click', this._onResetClick);
        this.materialCloseBtn.removeEventListener('click', this._onCloseMaterialPanelClick);
        this.sideHandleBtn.removeEventListener('click', this._onSideHandleClick);
        this.viewModes.removeEventListener('click', this._onViewModesClick);
        this.editorModes.removeEventListener('click', this._onEditorModesClick);
        this.renderSkyToggleInput.removeEventListener('change', this._onRenderSkyToggleChange);
        this.hideFaceMarkToggleInput.removeEventListener('change', this._onHideFaceMarkToggleChange);
        this.showDummyToggleInput.removeEventListener('change', this._onShowDummyToggleChange);
        this.renderSlabToggleInput.removeEventListener('change', this._onRenderSlabToggleChange);
        this.adjustLayoutBtn.removeEventListener('click', this._onAdjustLayoutClick);
        this.adjustModeCloseBtn.removeEventListener('click', this._onAdjustModeCloseClick);
        this.rulerBtn.removeEventListener('click', this._onRulerClick);
        this.addFloorBtn.removeEventListener('click', this._onAddFloorClick);
        this.addRoofBtn.removeEventListener('click', this._onAddRoofClick);

        this.loadOverlay.removeEventListener('click', this._onOverlayClick);
        this.loadCloseBtn.removeEventListener('click', this._onCloseLoad);
        this.prevPageBtn.removeEventListener('click', this._onPrevPage);
        this.nextPageBtn.removeEventListener('click', this._onNextPage);
        this.thumbGrid.removeEventListener('click', this._onThumbGridClick);

        this.linkOverlay.removeEventListener('click', this._onLinkOverlayClick);
        this.linkCloseBtn.removeEventListener('click', this._onCloseLink);
        this.linkBody.removeEventListener('click', this._onLinkBodyClick);
        this.linkBody.removeEventListener('change', this._onLinkBodyChange);

        this.groupOverlay.removeEventListener('click', this._onGroupOverlayClick);
        this.groupDoneBtn.removeEventListener('click', this._onCloseGrouping);
        this.groupBody.removeEventListener('click', this._onGroupBodyClick);
        this.decorationLayerPickerOverlay.removeEventListener('click', this._onDecorationLayerPickerOverlayClick);
        this.decorationLayerPickerCloseBtn.removeEventListener('click', this._onDecorationLayerPickerCloseClick);
    }

    _syncControls() {
        const allow = this._enabled;
        const hasBuilding = this._hasBuilding;

        this.createBuildingBtn.disabled = !allow || hasBuilding;
        for (const btn of this.footprintPresetButtons) btn.disabled = !allow;
        this.loadBtn.disabled = !allow;
        this.exportBtn.disabled = !allow || !hasBuilding;
        this.resetBtn.disabled = !allow || !hasBuilding;
        this.nameInput.disabled = !allow || !hasBuilding;
        this.typeSelect.disabled = !allow || !hasBuilding;
        this.renderSkyToggleInput.disabled = !allow;
        this.hideFaceMarkToggleInput.disabled = !allow;
        this.showDummyToggleInput.disabled = !allow || !hasBuilding;
        this.renderSlabToggleInput.disabled = !allow || !hasBuilding;
        this.adjustLayoutBtn.disabled = !allow || !hasBuilding;
        this.adjustModeCloseBtn.disabled = !allow || !hasBuilding || !this._layoutAdjustEnabled;
        this.rulerBtn.disabled = !allow;

        this.addFloorBtn.disabled = !allow || !hasBuilding;
        this.addRoofBtn.disabled = !allow || !hasBuilding;
        this.editorModeBuildingBtn.disabled = !allow || !hasBuilding;
        this.editorModeDecorationBtn.disabled = !allow || !hasBuilding;
        this.editorModeWearBtn.disabled = !allow || !hasBuilding;
        this.decorationLayerPickerCloseBtn.disabled = !allow || !hasBuilding;

        this.fabPanel.classList.toggle('is-disabled', !allow);
        this.viewPanel.classList.toggle('is-disabled', !allow);
        this.rightPanel.classList.toggle('is-disabled', !allow);
        this._syncEditorModeButtons();
    }

    _syncViewButtons() {
        const mode = this._viewMode;
        for (const btn of [this.meshModeBtn, this.wireModeBtn, this.floorsModeBtn, this.planModeBtn]) {
            const m = btn.dataset?.mode ?? '';
            btn.classList.toggle('is-active', m === mode);
        }
        this._syncRenderSkyToggle();
        this._syncHideFaceMarkToggle();
        this._syncShowDummyToggle();
        this._syncRenderSlabToggle();
        this._syncAdjustLayoutButton();
        this._syncRulerButton();
    }

    _syncEditorModeButtons() {
        const mode = normalizeBf2EditorMode(this._editorMode);
        this.editorModeBuildingBtn.classList.toggle('is-active', mode === BF2_EDITOR_MODE.BUILDING);
        this.editorModeDecorationBtn.classList.toggle('is-active', mode === BF2_EDITOR_MODE.DECORATION);
        this.editorModeWearBtn.classList.toggle('is-active', mode === BF2_EDITOR_MODE.WEAR);
    }

    _syncRenderSkyToggle() {
        this.renderSkyToggleInput.checked = this._renderSkyEnabled;
    }

    _syncHideFaceMarkToggle() {
        this.hideFaceMarkToggleInput.checked = this._hideFaceMarkEnabled;
    }

    _syncShowDummyToggle() {
        this.showDummyToggleInput.checked = this._showDummyEnabled;
    }

    _syncRenderSlabToggle() {
        this.renderSlabToggleInput.checked = this._renderSlabEnabled;
    }

    _syncRulerButton() {
        if (!this.rulerBtn) return;
        this.rulerBtn.classList.toggle('is-active', this._rulerEnabled);
    }

    _syncAdjustLayoutButton() {
        if (!this.adjustLayoutBtn) return;
        this.adjustLayoutBtn.classList.toggle('is-active', this._layoutAdjustEnabled);
        this._syncAdjustModeOverlay();
    }

    _syncAdjustModeOverlay() {
        if (!this.adjustModeOverlayPanel) return;
        this.adjustModeOverlayPanel.classList.toggle('hidden', !this._layoutAdjustEnabled);
        if (this.adjustModeCloseBtn) {
            this.adjustModeCloseBtn.disabled = !this._enabled || !this._hasBuilding || !this._layoutAdjustEnabled;
        }
    }

    _handleViewModeClick(e) {
        const btn = e?.target?.closest?.('.building-fab2-view-mode');
        if (!btn || !this.viewModes.contains(btn)) return;
        if (btn.disabled) return;
        const mode = btn.dataset?.mode ?? 'mesh';
        const next = (mode === 'wireframe' || mode === 'floors' || mode === 'floorplan' || mode === 'mesh')
            ? mode
            : 'mesh';
        if (next === this._viewMode) return;
        this._viewMode = next;
        this._syncViewButtons();
        this.onViewModeChange?.(next);
    }

    _handleEditorModeClick(e) {
        const btn = e?.target?.closest?.('.building-fab2-editor-mode');
        if (!btn || !this.editorModes.contains(btn)) return;
        if (btn.disabled) return;
        const next = normalizeBf2EditorMode(btn.dataset?.mode);
        if (next === this._editorMode) return;
        this._editorMode = next;
        this._renderRightPanel();
        this._syncControls();
        this.onEditorModeChange?.(next);
    }

    _resolveDecorationLayerOptions() {
        if (Array.isArray(this._decorationLayerOptions) && this._decorationLayerOptions.length) {
            return this._decorationLayerOptions;
        }
        return this._layers
            .filter((layer) => layer?.type === 'floor')
            .map((layer, index) => ({
                id: String(layer?.id ?? ''),
                label: `Floor layer ${index + 1}`
            }))
            .filter((entry) => !!entry.id);
    }

    _resolveDecorationBayOptions(layerId) {
        const id = typeof layerId === 'string' ? layerId : '';
        if (!id) return [];
        const src = this._decorationBayOptionsByLayerId && typeof this._decorationBayOptionsByLayerId === 'object'
            ? this._decorationBayOptionsByLayerId[id]
            : null;
        if (!Array.isArray(src)) return [];
        const out = src
            .map((entry) => {
                const refId = String(entry?.id ?? '');
                if (!refId) return null;
                const parsedFaceId = String(refId.split(':')[0] ?? '').toUpperCase();
                const parsedBayId = String(refId.slice(refId.indexOf(':') + 1) ?? '');
                return {
                    id: refId,
                    label: String(entry?.label ?? entry?.id ?? ''),
                    faceId: isFaceId(entry?.faceId) ? entry.faceId : (isFaceId(parsedFaceId) ? parsedFaceId : null),
                    bayId: String(entry?.bayId ?? parsedBayId ?? ''),
                    bayIndex: Number.isInteger(entry?.bayIndex) ? Math.max(0, entry.bayIndex | 0) : null,
                    linkRole: null,
                    linkHue: null
                };
            })
            .filter((entry) => !!entry?.id);

        const layerFacades = this._facadesByLayerId?.[id] && typeof this._facadesByLayerId[id] === 'object'
            ? this._facadesByLayerId[id]
            : null;
        if (!layerFacades) return out;
        for (const faceId of FACE_IDS) {
            const facade = layerFacades?.[faceId] && typeof layerFacades[faceId] === 'object'
                ? layerFacades[faceId]
                : null;
            const bays = Array.isArray(facade?.layout?.bays?.items) ? facade.layout.bays.items : [];
            if (!bays.length) continue;
            const graph = buildBayLinkGraph(bays);
            for (const option of out) {
                if ((option.faceId ?? null) !== faceId) continue;
                const bayId = typeof option.bayId === 'string' ? option.bayId : '';
                if (!bayId) continue;
                const rootMasterId = graph.rootMasterByBayId.get(bayId) ?? bayId;
                const hue = graph.hueByMasterId.get(rootMasterId);
                if (!Number.isFinite(hue)) continue;
                option.linkHue = hue;
                option.linkRole = rootMasterId === bayId ? 'master' : 'slave';
            }
        }
        return out;
    }

    _isDecorationPresetValueMatchForSpec(spec, presetValue, currentValue) {
        const type = normalizeWallDecoratorPropertyType(spec?.type);
        if (type === WALL_DECORATOR_PROPERTY_TYPE.BOOL) return !!presetValue === !!currentValue;
        if (type === WALL_DECORATOR_PROPERTY_TYPE.ENUM) return String(presetValue ?? '') === String(currentValue ?? '');
        if (type === WALL_DECORATOR_PROPERTY_TYPE.INT) {
            const a = Number(presetValue);
            const b = Number(currentValue);
            if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
            return Math.round(a) === Math.round(b);
        }
        const a = Number(presetValue);
        const b = Number(currentValue);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
        const step = Number.isFinite(spec?.step) ? Math.abs(Number(spec.step)) : 0.0;
        const eps = Math.max(1e-6, step * 0.5);
        return Math.abs(a - b) <= eps;
    }

    _isDecorationPresetMatch(typeEntry, preset, config) {
        const presetCfg = preset?.configuration && typeof preset.configuration === 'object' ? preset.configuration : null;
        if (!presetCfg) return false;
        const keys = Object.keys(presetCfg);
        if (!keys.length) return false;

        const propertyById = new Map(
            (Array.isArray(typeEntry?.properties) ? typeEntry.properties : [])
                .map((spec) => [String(spec?.id ?? '').trim(), spec])
        );
        for (const propertyId of keys) {
            const spec = propertyById.get(String(propertyId ?? '').trim()) ?? null;
            if (!spec) return false;
            const presetValue = presetCfg[propertyId];
            const currentValue = config?.[propertyId];
            if (!this._isDecorationPresetValueMatchForSpec(spec, presetValue, currentValue)) return false;
        }
        return true;
    }

    _resolveMatchingDecorationPresetId(typeEntry, groupId, config) {
        const target = String(groupId ?? '').trim();
        if (!target) return '';
        const group = (Array.isArray(typeEntry?.presetGroups) ? typeEntry.presetGroups : [])
            .find((entry) => String(entry?.id ?? '').trim() === target) ?? null;
        const options = Array.isArray(group?.options) ? group.options : [];
        for (const option of options) {
            if (this._isDecorationPresetMatch(typeEntry, option, config)) return String(option?.id ?? '');
        }
        return '';
    }

    _renderDecorationPanel() {
        this.decorationPanel.textContent = '';
        this.onHoverBay?.(null);
        if (!this._hasBuilding) return;
        if (normalizeBf2EditorMode(this._editorMode) !== BF2_EDITOR_MODE.DECORATION) return;

        const allowEdit = this._enabled && this._hasBuilding;
        const layerOptions = this._resolveDecorationLayerOptions();
        const sets = Array.isArray(this._decorationSets) ? this._decorationSets : [];
        if (this._decorationLayerPicker) {
            const pickerSetId = String(this._decorationLayerPicker?.setId ?? '');
            const pickerSet = sets.find((entry) => String(entry?.id ?? '') === pickerSetId) ?? null;
            if (!pickerSet) {
                this.closeDecorationLayerPicker();
            } else {
                const nextLayerId = typeof pickerSet?.target?.layerId === 'string' ? pickerSet.target.layerId : '';
                this._decorationLayerPicker.layerId = nextLayerId;
                if (this.isDecorationLayerPickerOpen()) this._renderDecorationLayerPicker();
            }
        }

        const header = document.createElement('div');
        header.className = 'building-fab2-decoration-header';
        const title = document.createElement('div');
        title.className = 'building-fab2-subtitle is-inline';
        title.textContent = 'Decoration Sets';
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'building-fab2-btn building-fab2-btn-small';
        addBtn.textContent = '+ Decoration Set';
        addBtn.disabled = !allowEdit || !layerOptions.length;
        addBtn.addEventListener('click', () => {
            if (!allowEdit) return;
            this.onAddDecorationSet?.();
        });
        header.appendChild(title);
        header.appendChild(addBtn);
        this.decorationPanel.appendChild(header);

        if (!layerOptions.length) {
            const hint = document.createElement('div');
            hint.className = 'building-fab2-hint';
            hint.textContent = 'Add a floor layer to create decoration sets.';
            this.decorationPanel.appendChild(hint);
            return;
        }

        if (!sets.length) {
            const hint = document.createElement('div');
            hint.className = 'building-fab2-hint';
            hint.textContent = 'No decoration sets. Use + Decoration Set to start.';
            this.decorationPanel.appendChild(hint);
            return;
        }

        const setList = document.createElement('div');
        setList.className = 'building-fab2-decoration-set-list';
        this.decorationPanel.appendChild(setList);

        for (let setIndex = 0; setIndex < sets.length; setIndex += 1) {
            const set = sets[setIndex] && typeof sets[setIndex] === 'object' ? sets[setIndex] : null;
            if (!set) continue;
            const setId = typeof set.id === 'string' ? set.id : '';
            if (!setId) continue;
            const target = set.target && typeof set.target === 'object' ? set.target : {};
            const floorInterval = set.floorInterval && typeof set.floorInterval === 'object' ? set.floorInterval : {};
            const selectedLayerId = typeof target.layerId === 'string' ? target.layerId : '';
            const explicitSelectedBayRefs = new Set(
                Array.isArray(target.bayRefs)
                    ? target.bayRefs.map((id) => String(id ?? '')).filter(Boolean)
                    : []
            );
            const bayOptions = this._resolveDecorationBayOptions(selectedLayerId);
            const validBayRefs = new Set(bayOptions.map((entry) => String(entry?.id ?? '')).filter(Boolean));
            const selectedBayRefs = (() => {
                if (target.allBays === true) return new Set(validBayRefs);
                const out = new Set();
                for (const ref of explicitSelectedBayRefs) {
                    if (validBayRefs.has(ref)) out.add(ref);
                }
                return out;
            })();
            const hasAllBays = bayOptions.length > 0 && selectedBayRefs.size === bayOptions.length;
            const setOpen = this._decorationSetOpenById.has(setId) ? !!this._decorationSetOpenById.get(setId) : true;

            const card = document.createElement('div');
            card.className = 'building-fab2-decoration-set';
            setList.appendChild(card);

            const setHeader = document.createElement('div');
            setHeader.className = 'building-fab2-decoration-set-header';
            const setTitle = document.createElement('div');
            setTitle.className = 'building-fab2-decoration-set-title';
            setTitle.textContent = `Set ${setIndex + 1}`;
            const setActions = document.createElement('div');
            setActions.className = 'building-fab2-decoration-set-actions';

            const collapseBtn = document.createElement('button');
            collapseBtn.type = 'button';
            collapseBtn.className = 'building-fab2-icon-btn';
            applyMaterialSymbolToButton(collapseBtn, {
                name: setOpen ? 'expand_less' : 'expand_more',
                label: setOpen ? 'Collapse set' : 'Expand set',
                size: 'sm'
            });
            collapseBtn.addEventListener('click', () => {
                this._decorationSetOpenById.set(setId, !setOpen);
                this._renderDecorationPanel();
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'building-fab2-icon-btn';
            applyMaterialSymbolToButton(deleteBtn, { name: 'delete', label: 'Delete decoration set', size: 'sm' });
            deleteBtn.disabled = !allowEdit;
            deleteBtn.addEventListener('click', () => {
                if (!allowEdit) return;
                this.onDeleteDecorationSet?.(setId);
            });

            setActions.appendChild(collapseBtn);
            setActions.appendChild(deleteBtn);
            setHeader.appendChild(setTitle);
            setHeader.appendChild(setActions);
            card.appendChild(setHeader);

            if (!setOpen) continue;

            const setBody = document.createElement('div');
            setBody.className = 'building-fab2-decoration-set-body';
            card.appendChild(setBody);

            const targetTitle = document.createElement('div');
            targetTitle.className = 'building-fab2-subtitle';
            targetTitle.textContent = 'Target';
            setBody.appendChild(targetTitle);

            const selectedLayerLabel = (() => {
                const match = layerOptions.find((entry) => String(entry?.id ?? '') === selectedLayerId) ?? null;
                return String(match?.label ?? 'Pick layer');
            })();
            const layerRow = document.createElement('div');
            layerRow.className = 'building-fab2-row';
            const layerLabel = document.createElement('div');
            layerLabel.className = 'building-fab2-row-label';
            layerLabel.textContent = 'Layer';
            const layerPickBtn = document.createElement('button');
            layerPickBtn.type = 'button';
            layerPickBtn.className = 'building-fab2-btn building-fab2-btn-small building-fab2-decoration-layer-pick-btn';
            layerPickBtn.textContent = selectedLayerLabel;
            layerPickBtn.disabled = !allowEdit || !layerOptions.length;
            layerPickBtn.addEventListener('click', () => {
                if (layerPickBtn.disabled) return;
                this.openDecorationLayerPicker({ setId, layerId: selectedLayerId });
            });
            layerRow.appendChild(layerLabel);
            layerRow.appendChild(layerPickBtn);
            setBody.appendChild(layerRow);

            const baysHeader = document.createElement('div');
            baysHeader.className = 'building-fab2-decoration-bays-header';
            const baysTitle = document.createElement('div');
            baysTitle.className = 'building-fab2-subtitle is-inline';
            baysTitle.textContent = 'Bays';
            const allBaysBtn = document.createElement('button');
            allBaysBtn.type = 'button';
            allBaysBtn.className = 'building-fab2-btn building-fab2-btn-small';
            allBaysBtn.textContent = 'All bays';
            allBaysBtn.classList.toggle('is-active', hasAllBays);
            allBaysBtn.disabled = !allowEdit || !bayOptions.length;
            allBaysBtn.addEventListener('click', () => {
                if (allBaysBtn.disabled) return;
                this.onSetDecorationSetAllBays?.(setId, !hasAllBays);
            });
            baysHeader.appendChild(baysTitle);
            baysHeader.appendChild(allBaysBtn);
            setBody.appendChild(baysHeader);

            if (!bayOptions.length) {
                const hint = document.createElement('div');
                hint.className = 'building-fab2-hint';
                hint.textContent = 'Selected layer has no bays yet.';
                setBody.appendChild(hint);
            } else {
                const byFace = new Map(FACE_IDS.map((faceId) => [faceId, []]));
                for (const bay of bayOptions) {
                    const faceId = isFaceId(bay?.faceId) ? bay.faceId : null;
                    if (!faceId) continue;
                    byFace.get(faceId)?.push(bay);
                }
                const baySelector = document.createElement('div');
                baySelector.className = 'building-fab2-decoration-bay-selector';
                setBody.appendChild(baySelector);

                for (const faceId of FACE_IDS) {
                    const faceBays = byFace.get(faceId) ?? [];
                    if (!faceBays.length) continue;
                    const row = document.createElement('div');
                    row.className = 'building-fab2-decoration-bay-row';
                    const bayGrid = document.createElement('div');
                    bayGrid.className = 'building-fab2-decoration-bay-grid';
                    row.appendChild(bayGrid);
                    baySelector.appendChild(row);

                    for (const bay of faceBays) {
                        const bayFaceId = isFaceId(bay?.faceId) ? bay.faceId : null;
                        const bayId = typeof bay?.bayId === 'string' ? bay.bayId : '';
                        const bayNumberText = Number.isInteger(bay?.bayIndex) ? String((bay.bayIndex | 0) + 1) : String(bay?.label ?? '');
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'building-fab2-bay-btn building-fab2-decoration-bay-btn';
                        const bayNum = document.createElement('div');
                        bayNum.className = 'building-fab2-decoration-bay-num';
                        bayNum.textContent = bayNumberText;
                        btn.appendChild(bayNum);
                        const selected = selectedBayRefs.has(bay.id);
                        btn.classList.toggle('is-active', selected);
                        btn.disabled = !allowEdit;
                        const linkRole = String(bay?.linkRole ?? '');
                        if (Number.isFinite(Number(bay?.linkHue))) {
                            btn.style.setProperty('--building-fab2-bay-link-hue', String(Number(bay.linkHue)));
                        }
                        if (linkRole === 'master') btn.classList.add('is-link-master');
                        else if (linkRole === 'slave') btn.classList.add('is-link-slave');
                        btn.addEventListener('pointerenter', () => {
                            if (!bayFaceId || !bayId) return;
                            this.onHoverBay?.({ layerId: selectedLayerId, faceId: bayFaceId, bayId });
                        });
                        btn.addEventListener('pointerleave', () => {
                            this.onHoverBay?.(null);
                        });
                        btn.addEventListener('click', () => {
                            if (!allowEdit) return;
                            this.onToggleDecorationSetBay?.(setId, bay.id, !selected);
                        });
                        bayGrid.appendChild(btn);
                    }
                }
            }

            const baysSeparator = document.createElement('hr');
            baysSeparator.className = 'building-fab2-decoration-separator';
            setBody.appendChild(baysSeparator);

            const presetButtons = document.createElement('div');
            presetButtons.className = 'building-fab2-decoration-preset-row building-fab2-decoration-floor-interval-presets';
            const intervalPresets = [
                { id: DECORATION_FLOOR_INTERVAL_PRESET.FIRST, label: 'First' },
                { id: DECORATION_FLOOR_INTERVAL_PRESET.LAST, label: 'Last' },
                { id: DECORATION_FLOOR_INTERVAL_PRESET.ALL, label: 'All' },
                { id: DECORATION_FLOOR_INTERVAL_PRESET.EVERY_2, label: 'Every 2' }
            ];
            for (const preset of intervalPresets) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'building-fab2-btn building-fab2-btn-small';
                btn.textContent = preset.label;
                btn.disabled = !allowEdit;
                btn.addEventListener('click', () => {
                    if (!allowEdit) return;
                    this.onApplyDecorationSetFloorIntervalPreset?.(setId, preset.id);
                });
                presetButtons.appendChild(btn);
            }
            setBody.appendChild(presetButtons);

            const intervalRow = document.createElement('div');
            intervalRow.className = 'building-fab2-decoration-floor-interval-row';
            const intervalLabel = document.createElement('div');
            intervalLabel.className = 'building-fab2-row-label';
            intervalLabel.textContent = 'Floor interval';
            const intervalControls = document.createElement('div');
            intervalControls.className = 'building-fab2-decoration-floor-interval-controls';
            intervalRow.appendChild(intervalLabel);
            intervalRow.appendChild(intervalControls);
            setBody.appendChild(intervalRow);
            const intervalFields = [
                { id: 'start', label: 'Start', min: 1, max: 999, value: Number(floorInterval.start) || 1 },
                {
                    id: 'end',
                    label: 'End',
                    min: 0,
                    max: 999,
                    value: floorInterval.end === null || floorInterval.end === undefined ? 0 : Number(floorInterval.end)
                },
                { id: 'every', label: 'Every', min: 1, max: 99, value: Number(floorInterval.every) || 1 }
            ];
            for (const field of intervalFields) {
                const fieldWrap = document.createElement('label');
                fieldWrap.className = 'building-fab2-decoration-floor-interval-field';
                const fieldLabel = document.createElement('span');
                fieldLabel.className = 'building-fab2-decoration-floor-interval-field-label';
                fieldLabel.textContent = field.label;
                const input = document.createElement('input');
                input.type = 'number';
                input.className = 'building-fab2-layer-number';
                input.min = String(field.min);
                input.max = String(field.max);
                input.step = '1';
                input.disabled = !allowEdit;
                input.value = String(Math.max(field.min, Math.floor(Number(field.value) || 0)));
                input.addEventListener('change', () => {
                    if (!allowEdit) return;
                    const nextRaw = Number(input.value);
                    const next = Number.isFinite(nextRaw) ? Math.floor(nextRaw) : field.min;
                    this.onSetDecorationSetFloorIntervalField?.(setId, field.id, next);
                });
                fieldWrap.appendChild(fieldLabel);
                fieldWrap.appendChild(input);
                intervalControls.appendChild(fieldWrap);
            }

            const decorationsTitle = document.createElement('div');
            decorationsTitle.className = 'building-fab2-subtitle';
            decorationsTitle.textContent = 'Decorations';
            setBody.appendChild(decorationsTitle);

            const addDecorationBtn = document.createElement('button');
            addDecorationBtn.type = 'button';
            addDecorationBtn.className = 'building-fab2-btn building-fab2-btn-small';
            addDecorationBtn.textContent = '+ Decoration';
            addDecorationBtn.disabled = !allowEdit;
            addDecorationBtn.addEventListener('click', () => {
                if (!allowEdit) return;
                this.onAddDecorationEntry?.(setId);
            });
            setBody.appendChild(addDecorationBtn);

            const decorations = Array.isArray(set.decorations) ? set.decorations : [];
            if (!decorations.length) {
                const hint = document.createElement('div');
                hint.className = 'building-fab2-hint';
                hint.textContent = 'This set has no decorations yet.';
                setBody.appendChild(hint);
                continue;
            }

            const decorationsList = document.createElement('div');
            decorationsList.className = 'building-fab2-decoration-entry-list';
            setBody.appendChild(decorationsList);
            for (let decorationIndex = 0; decorationIndex < decorations.length; decorationIndex += 1) {
                const decoration = decorations[decorationIndex] && typeof decorations[decorationIndex] === 'object'
                    ? decorations[decorationIndex]
                    : null;
                if (!decoration) continue;
                this._renderDecorationEntryCard({
                    host: decorationsList,
                    setId,
                    decoration,
                    decorationIndex,
                    allowEdit
                });
            }
        }
    }

    _renderDecorationEntryCard({
        host,
        setId,
        decoration,
        decorationIndex = 0,
        allowEdit = false
    } = {}) {
        const container = host && typeof host.appendChild === 'function' ? host : null;
        const entry = decoration && typeof decoration === 'object' ? decoration : null;
        if (!container || !entry) return;

        const entryId = typeof entry.id === 'string' ? entry.id : '';
        if (!entryId) return;
        const state = entry.state && typeof entry.state === 'object' ? entry.state : {};
        const span = entry.span && typeof entry.span === 'object' ? entry.span : {};
        const key = `${setId}:${entryId}`;
        const tabDefs = [
            { id: 'type', label: 'Type' },
            { id: 'configuration', label: 'Configuration' },
            { id: 'material', label: 'Material' }
        ];
        const validTabIds = new Set(tabDefs.map((tab) => tab.id));
        const savedTabId = String(this._decorationEntryTabByKey.get(key) ?? 'type');
        const tabId = validTabIds.has(savedTabId) ? savedTabId : 'type';
        if (tabId !== savedTabId) this._decorationEntryTabByKey.set(key, tabId);
        const typeId = typeof state.decoratorId === 'string' ? state.decoratorId : '';
        const typeEntry = this._wallDecoratorTypeEntryById.get(typeId) ?? null;

        const card = document.createElement('div');
        card.className = 'building-fab2-decoration-entry';
        container.appendChild(card);

        const header = document.createElement('div');
        header.className = 'building-fab2-decoration-entry-header';
        const title = document.createElement('div');
        title.className = 'building-fab2-decoration-entry-title';
        title.textContent = typeEntry?.label
            ? `Decoration ${decorationIndex + 1}: ${typeEntry.label}`
            : `Decoration ${decorationIndex + 1}`;
        const actions = document.createElement('div');
        actions.className = 'building-fab2-decoration-entry-actions';
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'building-fab2-icon-btn';
        applyMaterialSymbolToButton(deleteBtn, { name: 'delete', label: 'Delete decoration', size: 'sm' });
        deleteBtn.disabled = !allowEdit;
        deleteBtn.addEventListener('click', () => {
            if (!allowEdit) return;
            this.onDeleteDecorationEntry?.(setId, entryId);
        });
        actions.appendChild(deleteBtn);
        header.appendChild(title);
        header.appendChild(actions);
        card.appendChild(header);

        const tabs = document.createElement('div');
        tabs.className = 'building-fab2-decoration-tabs';
        for (const tab of tabDefs) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab2-decoration-tab';
            btn.textContent = tab.label;
            btn.classList.toggle('is-active', tabId === tab.id);
            btn.addEventListener('click', () => {
                this._decorationEntryTabByKey.set(key, tab.id);
                this._renderDecorationPanel();
            });
            tabs.appendChild(btn);
        }
        card.appendChild(tabs);

        const body = document.createElement('div');
        body.className = 'building-fab2-decoration-entry-body';
        card.appendChild(body);

        const appendChoiceRow = (label, value, options, onSelect, { disabled = false } = {}) => {
            const row = document.createElement('div');
            row.className = 'building-fab2-row';
            const left = document.createElement('div');
            left.className = 'building-fab2-row-label';
            left.textContent = label;
            const right = document.createElement('div');
            right.className = 'building-fab2-decoration-choice-row';
            for (const option of options) {
                const optionId = String(option?.id ?? '');
                if (!optionId) continue;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'building-fab2-btn building-fab2-btn-small';
                btn.textContent = String(option?.label ?? optionId);
                btn.classList.toggle('is-active', String(value ?? '') === optionId);
                btn.disabled = !!disabled;
                btn.addEventListener('click', () => {
                    if (btn.disabled) return;
                    onSelect?.(optionId);
                });
                right.appendChild(btn);
            }
            row.appendChild(left);
            row.appendChild(right);
            body.appendChild(row);
        };

        const appendSelectRow = (label, value, options, onSelect, { disabled = false } = {}) => {
            const row = document.createElement('div');
            row.className = 'building-fab2-row';
            const left = document.createElement('div');
            left.className = 'building-fab2-row-label';
            left.textContent = String(label ?? '');
            const select = document.createElement('select');
            select.className = 'building-fab2-select';

            const normalizedOptions = Array.isArray(options) ? options : [];
            for (const option of normalizedOptions) {
                const optionId = String(option?.id ?? '');
                if (!optionId) continue;
                const opt = document.createElement('option');
                opt.value = optionId;
                opt.textContent = String(option?.label ?? optionId);
                select.appendChild(opt);
            }
            if (select.options.length) {
                const nextValue = String(value ?? '');
                const hasValue = Array.from(select.options).some((opt) => opt.value === nextValue);
                select.value = hasValue ? nextValue : select.options[0].value;
            }
            select.disabled = !!disabled;
            select.addEventListener('change', () => {
                if (select.disabled) return;
                onSelect?.(String(select.value ?? ''));
            });

            row.appendChild(left);
            row.appendChild(select);
            body.appendChild(row);
        };

        const appendNumberSliderRow = ({
            label,
            min = 0,
            max = 1,
            step = 0.01,
            value = 0,
            isInt = false,
            disabled = false,
            onChange = null
        } = {}) => {
            const safeMin = Number.isFinite(min) ? Number(min) : 0;
            const safeMax = Number.isFinite(max) ? Number(max) : 1;
            const safeStep = Number.isFinite(step) && step > 0 ? Number(step) : (isInt ? 1 : 0.01);
            const numericValue = Number(value);
            const safeValue = Number.isFinite(numericValue) ? clamp(numericValue, safeMin, safeMax) : safeMin;
            const digits = isInt ? 0 : Math.max(0, (() => {
                const stepText = String(safeStep);
                const dotIdx = stepText.indexOf('.');
                return dotIdx >= 0 ? Math.min(6, stepText.length - dotIdx - 1) : 2;
            })());

            const row = document.createElement('div');
            row.className = 'building-fab2-decoration-slider-row';
            const left = document.createElement('div');
            left.className = 'building-fab2-row-label';
            left.textContent = String(label ?? '');
            const right = document.createElement('div');
            right.className = 'building-fab2-decoration-slider-control';

            const range = document.createElement('input');
            range.type = 'range';
            range.className = 'building-fab2-decoration-range';
            range.min = String(safeMin);
            range.max = String(safeMax);
            range.step = String(safeStep);

            const numberInput = document.createElement('input');
            numberInput.type = 'number';
            numberInput.className = 'building-fab2-layer-number building-fab2-decoration-slider-number';
            numberInput.min = String(safeMin);
            numberInput.max = String(safeMax);
            numberInput.step = String(safeStep);

            const setInputs = (raw) => {
                const clamped = clamp(raw, safeMin, safeMax);
                const next = isInt ? Math.round(clamped) : clamped;
                range.value = String(next);
                numberInput.value = isInt ? String(next) : next.toFixed(digits);
                return next;
            };
            const emit = (raw) => {
                const next = setInputs(raw);
                onChange?.(next);
            };
            range.addEventListener('input', () => emit(Number(range.value)));
            numberInput.addEventListener('input', () => emit(Number(numberInput.value)));

            const isDisabled = !!disabled;
            range.disabled = isDisabled;
            numberInput.disabled = isDisabled;
            setInputs(safeValue);

            right.appendChild(range);
            right.appendChild(numberInput);
            row.appendChild(left);
            row.appendChild(right);
            body.appendChild(row);
        };

        if (tabId === 'type') {
            const bySection = new Map();
            const order = [];
            for (const type of this._wallDecoratorTypeEntries) {
                const sectionId = String(type?.catalogSectionId ?? 'decorations');
                const sectionLabel = String(type?.catalogSectionLabel ?? (sectionId === 'cornice' ? 'Cornice' : 'Decorations'));
                if (!bySection.has(sectionId)) {
                    bySection.set(sectionId, { label: sectionLabel, options: [] });
                    order.push(sectionId);
                }
                bySection.get(sectionId).options.push(type);
            }
            for (const sectionId of order) {
                const section = bySection.get(sectionId);
                if (!section) continue;
                const sectionTitle = document.createElement('div');
                sectionTitle.className = 'building-fab2-subtitle';
                sectionTitle.textContent = section.label;
                body.appendChild(sectionTitle);
                const optionRow = document.createElement('div');
                optionRow.className = 'building-fab2-decoration-type-grid';
                body.appendChild(optionRow);
                for (const opt of section.options) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'building-fab2-decoration-type-btn';
                    btn.textContent = String(opt?.label ?? opt?.id ?? '');
                    const optId = String(opt?.id ?? '');
                    btn.classList.toggle('is-active', optId === typeId);
                    btn.disabled = !allowEdit;
                    btn.addEventListener('click', () => {
                        if (!allowEdit || !optId) return;
                        this.onSetDecorationEntryType?.(setId, entryId, optId);
                    });
                    optionRow.appendChild(btn);
                }
            }
            return;
        }

        if (tabId === 'configuration') {
            const properties = Array.isArray(typeEntry?.properties) ? typeEntry.properties : [];
            const presetGroups = Array.isArray(typeEntry?.presetGroups) ? typeEntry.presetGroups : [];
            if (!typeEntry) {
                const hint = document.createElement('div');
                hint.className = 'building-fab2-hint';
                hint.textContent = 'Select a type first.';
                body.appendChild(hint);
                return;
            }

            const placementTitle = document.createElement('div');
            placementTitle.className = 'building-fab2-subtitle';
            placementTitle.textContent = 'Placement';
            body.appendChild(placementTitle);
            appendChoiceRow('Vertical', state.position, [
                { id: WALL_DECORATOR_POSITION.TOP, label: 'Top' },
                { id: WALL_DECORATOR_POSITION.NEAR_TOP, label: 'Near Top' },
                { id: WALL_DECORATOR_POSITION.NEAR_BOTTOM, label: 'Near Bottom' },
                { id: WALL_DECORATOR_POSITION.BOTTOM, label: 'Bottom' }
            ], (next) => this.onSetDecorationEntryPlacementField?.(setId, entryId, 'position', next), {
                disabled: !allowEdit
            });
            appendNumberSliderRow({
                label: 'Start U',
                min: 0.0,
                max: 1.0,
                step: 0.01,
                value: clampUnit(span.start, 0.0),
                disabled: !allowEdit,
                onChange: (next) => this.onSetDecorationEntrySpanField?.(setId, entryId, 'start', next)
            });
            appendNumberSliderRow({
                label: 'End U',
                min: 0.0,
                max: 1.0,
                step: 0.01,
                value: clampUnit(span.end, 1.0),
                disabled: !allowEdit,
                onChange: (next) => this.onSetDecorationEntrySpanField?.(setId, entryId, 'end', next)
            });

            if (presetGroups.length) {
                const presetTitle = document.createElement('div');
                presetTitle.className = 'building-fab2-subtitle';
                presetTitle.textContent = 'Presets';
                body.appendChild(presetTitle);
                for (const group of presetGroups) {
                    const groupId = String(group?.id ?? '').trim();
                    const options = Array.isArray(group?.options) ? group.options : [];
                    if (!groupId || !options.length) continue;
                    const row = document.createElement('div');
                    row.className = 'building-fab2-decoration-preset-row';
                    body.appendChild(row);
                    const matchedPresetId = this._resolveMatchingDecorationPresetId(typeEntry, groupId, state.configuration);
                    for (const option of options) {
                        const optionId = String(option?.id ?? '');
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'building-fab2-btn building-fab2-btn-small';
                        btn.textContent = String(option?.label ?? optionId);
                        btn.disabled = !allowEdit;
                        btn.classList.toggle('is-active', optionId === matchedPresetId);
                        btn.addEventListener('click', () => {
                            if (!allowEdit) return;
                            this.onApplyDecorationEntryPresetGroup?.(setId, entryId, groupId, optionId);
                        });
                        row.appendChild(btn);
                    }
                }
            }

            const propTitle = document.createElement('div');
            propTitle.className = 'building-fab2-subtitle';
            propTitle.textContent = 'Properties';
            body.appendChild(propTitle);

            for (const spec of properties) {
                const propertyId = String(spec?.id ?? '').trim();
                if (!propertyId) continue;
                const propertyType = normalizeWallDecoratorPropertyType(spec?.type);
                if (propertyType === WALL_DECORATOR_PROPERTY_TYPE.BOOL) {
                    const toggle = document.createElement('label');
                    toggle.className = 'building-fab2-toggle-switch';
                    const input = document.createElement('input');
                    input.type = 'checkbox';
                    input.checked = !!state?.configuration?.[propertyId];
                    input.disabled = !allowEdit;
                    const text = document.createElement('span');
                    text.textContent = String(spec?.label ?? propertyId);
                    toggle.appendChild(input);
                    toggle.appendChild(text);
                    input.addEventListener('change', () => {
                        if (!allowEdit) return;
                        this.onSetDecorationEntryProperty?.(setId, entryId, propertyId, !!input.checked);
                    });
                    body.appendChild(toggle);
                    continue;
                }

                if (propertyType === WALL_DECORATOR_PROPERTY_TYPE.ENUM) {
                    const options = Array.isArray(spec?.options) ? spec.options : [];
                    const enumOptions = options.map((option) => ({
                        id: String(option?.id ?? ''),
                        label: String(option?.label ?? option?.id ?? '')
                    }));
                    const controlMode = String(spec?.control ?? '').trim().toLowerCase();
                    if (controlMode === 'combobox') {
                        appendSelectRow(
                            String(spec?.label ?? propertyId),
                            String(state?.configuration?.[propertyId] ?? ''),
                            enumOptions,
                            (next) => this.onSetDecorationEntryProperty?.(setId, entryId, propertyId, next),
                            { disabled: !allowEdit }
                        );
                    } else {
                        appendChoiceRow(
                            String(spec?.label ?? propertyId),
                            String(state?.configuration?.[propertyId] ?? ''),
                            enumOptions,
                            (next) => this.onSetDecorationEntryProperty?.(setId, entryId, propertyId, next),
                            { disabled: !allowEdit }
                        );
                    }
                    continue;
                }

                const isInt = propertyType === WALL_DECORATOR_PROPERTY_TYPE.INT;
                const min = Number.isFinite(spec?.min) ? Number(spec.min) : (isInt ? 0 : 0.0);
                const max = Number.isFinite(spec?.max) ? Number(spec.max) : (isInt ? 999 : 10.0);
                const step = Number.isFinite(spec?.step) ? Number(spec.step) : (isInt ? 1 : 0.01);
                const value = Number(state?.configuration?.[propertyId]);
                const nextValue = Number.isFinite(value) ? value : min;
                appendNumberSliderRow({
                    label: String(spec?.label ?? propertyId),
                    min,
                    max,
                    step,
                    value: nextValue,
                    isInt,
                    disabled: !allowEdit,
                    onChange: (next) => this.onSetDecorationEntryProperty?.(setId, entryId, propertyId, next)
                });
            }
            return;
        }

        const materialSelection = state.materialSelection && typeof state.materialSelection === 'object'
            ? state.materialSelection
            : { kind: 'match_wall', id: 'match_wall' };
        const materialKind = materialSelection.kind === 'texture' || materialSelection.kind === 'color'
            ? materialSelection.kind
            : 'match_wall';
        const isTexture = materialKind === 'texture';
        const isMatchWall = materialKind === 'match_wall';

        const materialTitle = document.createElement('div');
        materialTitle.className = 'building-fab2-subtitle';
        materialTitle.textContent = 'Surface';
        body.appendChild(materialTitle);

        appendChoiceRow('Kind', materialKind, [
            { id: 'match_wall', label: 'Match wall' },
            { id: 'texture', label: 'Texture' },
            { id: 'color', label: 'Color' }
        ], (next) => this.onSetDecorationEntryMaterialKind?.(setId, entryId, next), {
            disabled: !allowEdit
        });

        const idRow = document.createElement('div');
        idRow.className = 'building-fab2-row';
        const idLabel = document.createElement('div');
        idLabel.className = 'building-fab2-row-label';
        idLabel.textContent = 'Material';
        const idSelect = document.createElement('select');
        idSelect.className = 'building-fab2-select';
        const idOptions = materialKind === 'color'
            ? this._baseWallColorPickerOptions.map((entry) => ({
                id: String(entry?.id ?? '').replace(/^color:/, ''),
                label: String(entry?.label ?? entry?.id ?? '')
            }))
            : this._wallTextureDefs.map((entry) => ({
                id: String(entry?.id ?? ''),
                label: String(entry?.label ?? entry?.id ?? '')
            }));
        for (const option of idOptions) {
            const opt = document.createElement('option');
            opt.value = option.id;
            opt.textContent = option.label;
            idSelect.appendChild(opt);
        }
        idSelect.value = String(materialSelection.id ?? '');
        idSelect.disabled = !allowEdit || isMatchWall;
        idSelect.addEventListener('change', () => {
            if (!allowEdit || isMatchWall) return;
            this.onSetDecorationEntryMaterialId?.(setId, entryId, String(idSelect.value ?? ''));
        });
        idRow.appendChild(idLabel);
        idRow.appendChild(idSelect);
        body.appendChild(idRow);

        const wallBase = state.wallBase && typeof state.wallBase === 'object' ? state.wallBase : {};
        appendNumberSliderRow({
            label: 'Roughness',
            min: 0.0,
            max: 1.0,
            step: 0.01,
            value: Number(wallBase.roughness) || 0.85,
            disabled: !allowEdit || isMatchWall,
            onChange: (next) => this.onSetDecorationEntryWallBaseField?.(setId, entryId, 'roughness', next)
        });
        appendNumberSliderRow({
            label: 'Normal',
            min: 0.0,
            max: 2.0,
            step: 0.01,
            value: Number(wallBase.normalStrength) || 0.9,
            disabled: !allowEdit || isMatchWall,
            onChange: (next) => this.onSetDecorationEntryWallBaseField?.(setId, entryId, 'normalStrength', next)
        });

        const tiling = state.tiling && typeof state.tiling === 'object' ? state.tiling : {};
        const tilingEnabled = !!tiling.enabled;
        const uvEnabled = !!tiling.uvEnabled;

        const tilingToggle = document.createElement('label');
        tilingToggle.className = 'building-fab2-toggle-switch';
        const tilingInput = document.createElement('input');
        tilingInput.type = 'checkbox';
        tilingInput.checked = tilingEnabled;
        tilingInput.disabled = !allowEdit || !isTexture || isMatchWall;
        const tilingText = document.createElement('span');
        tilingText.textContent = 'Override tile meters';
        tilingToggle.appendChild(tilingInput);
        tilingToggle.appendChild(tilingText);
        tilingInput.addEventListener('change', () => {
            if (!allowEdit || !isTexture || isMatchWall) return;
            this.onSetDecorationEntryTilingField?.(setId, entryId, 'enabled', !!tilingInput.checked);
        });
        body.appendChild(tilingToggle);

        appendNumberSliderRow({
            label: 'Tile U',
            min: 0.1,
            max: 20.0,
            step: 0.01,
            value: Number(tiling.tileMetersU) || 2.0,
            disabled: !allowEdit || !isTexture || isMatchWall || !tilingEnabled,
            onChange: (next) => this.onSetDecorationEntryTilingField?.(setId, entryId, 'tileMetersU', next)
        });
        appendNumberSliderRow({
            label: 'Tile V',
            min: 0.1,
            max: 20.0,
            step: 0.01,
            value: Number(tiling.tileMetersV) || 2.0,
            disabled: !allowEdit || !isTexture || isMatchWall || !tilingEnabled,
            onChange: (next) => this.onSetDecorationEntryTilingField?.(setId, entryId, 'tileMetersV', next)
        });

        const uvToggle = document.createElement('label');
        uvToggle.className = 'building-fab2-toggle-switch';
        const uvInput = document.createElement('input');
        uvInput.type = 'checkbox';
        uvInput.checked = uvEnabled;
        uvInput.disabled = !allowEdit || !isTexture || isMatchWall;
        const uvText = document.createElement('span');
        uvText.textContent = 'Override UV positioning';
        uvToggle.appendChild(uvInput);
        uvToggle.appendChild(uvText);
        uvInput.addEventListener('change', () => {
            if (!allowEdit || !isTexture || isMatchWall) return;
            this.onSetDecorationEntryTilingField?.(setId, entryId, 'uvEnabled', !!uvInput.checked);
        });
        body.appendChild(uvToggle);

        appendNumberSliderRow({
            label: 'Offset U',
            min: -10.0,
            max: 10.0,
            step: 0.01,
            value: Number(tiling.offsetU) || 0.0,
            disabled: !allowEdit || !isTexture || isMatchWall || !uvEnabled,
            onChange: (next) => this.onSetDecorationEntryTilingField?.(setId, entryId, 'offsetU', next)
        });
        appendNumberSliderRow({
            label: 'Offset V',
            min: -10.0,
            max: 10.0,
            step: 0.01,
            value: Number(tiling.offsetV) || 0.0,
            disabled: !allowEdit || !isTexture || isMatchWall || !uvEnabled,
            onChange: (next) => this.onSetDecorationEntryTilingField?.(setId, entryId, 'offsetV', next)
        });
        appendNumberSliderRow({
            label: 'UV Rotation',
            min: -180.0,
            max: 180.0,
            step: 0.1,
            value: Number(tiling.rotationDegrees) || 0.0,
            disabled: !allowEdit || !isTexture || isMatchWall || !uvEnabled,
            onChange: (next) => this.onSetDecorationEntryTilingField?.(setId, entryId, 'rotationDegrees', next)
        });
    }

    _renderRightPanel() {
        const showEditor = this._hasBuilding;
        const mode = normalizeBf2EditorMode(this._editorMode);
        const decorationMode = mode === BF2_EDITOR_MODE.DECORATION;
        const wearMode = mode === BF2_EDITOR_MODE.WEAR;
        this.editorModes.classList.toggle('hidden', !showEditor);
        this.rightEmptyHint.classList.toggle('hidden', showEditor);
        this.rightActions.classList.toggle('hidden', !showEditor || decorationMode || wearMode);
        this.layersList.classList.toggle('hidden', !showEditor || decorationMode || wearMode);
        this.decorationPanel.classList.toggle('hidden', !showEditor || !decorationMode);
        this.wearPanel.classList.toggle('hidden', !showEditor || !wearMode);
        this._syncEditorModeButtons();
        if (showEditor && decorationMode) this._renderDecorationPanel();
        if (showEditor && wearMode) this._renderWearPanel();
    }

    _renderWearPanel() {
        this.wearPanel.textContent = '';
        if (!this._hasBuilding) return;
        if (normalizeBf2EditorMode(this._editorMode) !== BF2_EDITOR_MODE.WEAR) return;

        const title = document.createElement('div');
        title.className = 'building-fab2-subtitle';
        title.textContent = 'Wear';
        this.wearPanel.appendChild(title);

        const hint = document.createElement('div');
        hint.className = 'building-fab2-hint';
        hint.textContent = 'Wear mode placeholder.';
        this.wearPanel.appendChild(hint);
    }

    _renderLayers() {
        this.onHoverBay?.(null);
        this.layersList.textContent = '';

        if (!this._hasBuilding) return;

        const layers = this._layers;
        const floorCount = layers.filter((l) => l?.type === 'floor').length;
        const roofCount = layers.filter((l) => l?.type === 'roof').length;

        if (!layers.length) {
            const hint = document.createElement('div');
            hint.className = 'building-fab2-hint';
            hint.textContent = 'No layers.';
            this.layersList.appendChild(hint);
            return;
        }

        const allowEdit = this._enabled && this._hasBuilding;
        let globalSelectedFaceId = null;
        for (const faceState of this._floorLayerFaceStateById.values()) {
            const faceId = isFaceId(faceState?.selectedFaceId) ? faceState.selectedFaceId : null;
            if (faceId) {
                globalSelectedFaceId = faceId;
                break;
            }
        }

	        for (const [idx, layer] of layers.entries()) {
	            const layerId = layer.id;
	            const type = layer.type;
	            const isFloor = type === 'floor';

	            const group = document.createElement('div');
	            group.className = `building-fab2-layer-group ${isFloor ? 'is-floor' : 'is-roof'}`;
	            if (isFloor) {
	                group.addEventListener('pointerenter', () => this.onHoverLayer?.(layerId));
	                group.addEventListener('pointerleave', () => this.onHoverLayer?.(null));
	            }
	            const isOpen = this._layerOpenById.get(layerId) ?? true;

	            const header = document.createElement('div');
	            header.className = 'building-fab2-layer-summary';
	            header.tabIndex = 0;
	            header.setAttribute('role', 'button');
	            header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
	            if (isFloor) {
	                header.addEventListener('pointerenter', () => this.onHoverLayerTitle?.(layerId));
	                header.addEventListener('pointerleave', () => this.onHoverLayerTitle?.(null));
	            }

	            const title = document.createElement('div');
	            title.className = 'building-fab2-layer-title';
	            title.textContent = isFloor ? 'Floor layer' : 'Roof layer';

            const actions = document.createElement('div');
            actions.className = 'building-fab2-layer-actions';

            const upBtn = document.createElement('button');
            upBtn.type = 'button';
            upBtn.className = 'building-fab2-icon-btn';
            applyMaterialSymbolToButton(upBtn, { name: 'arrow_upward', label: 'Move up', size: 'sm' });
            upBtn.disabled = !allowEdit || idx === 0;
            upBtn.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                this.onMoveLayer?.(layerId, -1);
            });

            const downBtn = document.createElement('button');
            downBtn.type = 'button';
            downBtn.className = 'building-fab2-icon-btn';
            applyMaterialSymbolToButton(downBtn, { name: 'arrow_downward', label: 'Move down', size: 'sm' });
            downBtn.disabled = !allowEdit || idx === layers.length - 1;
            downBtn.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                this.onMoveLayer?.(layerId, 1);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'building-fab2-icon-btn';
            applyMaterialSymbolToButton(deleteBtn, { name: 'delete', label: 'Delete layer', size: 'sm' });
            const canDelete = isFloor ? floorCount > 1 : roofCount > 0;
            deleteBtn.disabled = !allowEdit || !canDelete;
            deleteBtn.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                this.onDeleteLayer?.(layerId);
            });

	            actions.appendChild(upBtn);
	            actions.appendChild(downBtn);
	            actions.appendChild(deleteBtn);

	            header.appendChild(title);
	            header.appendChild(actions);

	            const body = document.createElement('div');
	            body.className = 'building-fab2-layer-body';
	            body.classList.toggle('hidden', !isOpen);

	            const setOpen = (open) => {
	                const next = !!open;
	                this._layerOpenById.set(layerId, next);
	                body.classList.toggle('hidden', !next);
	                header.setAttribute('aria-expanded', next ? 'true' : 'false');
	            };

	            header.addEventListener('click', (ev) => {
	                if (ev?.target?.closest?.('button')) return;
	                setOpen(!(this._layerOpenById.get(layerId) ?? true));
	            });
	            header.addEventListener('keydown', (ev) => {
	                if (ev?.key !== 'Enter' && ev?.key !== ' ') return;
	                ev.preventDefault();
	                setOpen(!(this._layerOpenById.get(layerId) ?? true));
	            });

            if (isFloor) {
                const layoutTitle = document.createElement('div');
                layoutTitle.className = 'building-fab2-subtitle';
                layoutTitle.textContent = 'Layout';
                body.appendChild(layoutTitle);

                const floorsRow = document.createElement('div');
                floorsRow.className = 'building-fab2-layer-row';
                const floorsLabel = document.createElement('div');
                floorsLabel.className = 'building-fab2-row-label';
                floorsLabel.textContent = 'Floors';
                const floorsRange = document.createElement('input');
                floorsRange.type = 'range';
                floorsRange.className = 'building-fab2-layer-range';
                floorsRange.min = String(FLOOR_COUNT_MIN);
                floorsRange.max = String(FLOOR_COUNT_MAX);
                floorsRange.step = '1';
                const floorsNumber = document.createElement('input');
                floorsNumber.type = 'number';
                floorsNumber.className = 'building-fab2-layer-number';
                floorsNumber.min = String(FLOOR_COUNT_MIN);
                floorsNumber.max = String(FLOOR_COUNT_MAX);
                floorsNumber.step = '1';

                const floorsValue = clampInt(layer?.floors ?? FLOOR_COUNT_MIN, FLOOR_COUNT_MIN, FLOOR_COUNT_MAX);
                floorsRange.value = String(floorsValue);
                floorsNumber.value = String(floorsValue);

                floorsRange.disabled = !allowEdit;
                floorsNumber.disabled = !allowEdit;

                floorsRange.addEventListener('input', () => {
                    const v = clampInt(floorsRange.value, FLOOR_COUNT_MIN, FLOOR_COUNT_MAX);
                    floorsRange.value = String(v);
                    floorsNumber.value = String(v);
                    this.onSetFloorLayerFloors?.(layerId, v);
                });
                floorsNumber.addEventListener('input', () => {
                    const v = clampInt(floorsNumber.value, FLOOR_COUNT_MIN, FLOOR_COUNT_MAX);
                    floorsRange.value = String(v);
                    floorsNumber.value = String(v);
                    this.onSetFloorLayerFloors?.(layerId, v);
                });

                floorsRow.appendChild(floorsLabel);
                floorsRow.appendChild(floorsRange);
                floorsRow.appendChild(floorsNumber);
                body.appendChild(floorsRow);

                const heightRow = document.createElement('div');
                heightRow.className = 'building-fab2-layer-row';
                const heightLabel = document.createElement('div');
                heightLabel.className = 'building-fab2-row-label';
                heightLabel.textContent = 'Floor height';
                const heightRange = document.createElement('input');
                heightRange.type = 'range';
                heightRange.className = 'building-fab2-layer-range';
                heightRange.min = String(FLOOR_HEIGHT_MIN);
                heightRange.max = String(FLOOR_HEIGHT_MAX);
                heightRange.step = '0.1';
                const heightNumber = document.createElement('input');
                heightNumber.type = 'number';
                heightNumber.className = 'building-fab2-layer-number';
                heightNumber.min = String(FLOOR_HEIGHT_MIN);
                heightNumber.max = String(FLOOR_HEIGHT_MAX);
                heightNumber.step = '0.1';

                const heightValue = clamp(layer?.floorHeight ?? 4.2, FLOOR_HEIGHT_MIN, FLOOR_HEIGHT_MAX);
                heightRange.value = String(heightValue);
                heightNumber.value = String(heightValue);

                heightRange.disabled = !allowEdit;
                heightNumber.disabled = !allowEdit;

                heightRange.addEventListener('input', () => {
                    const v = clamp(heightRange.value, FLOOR_HEIGHT_MIN, FLOOR_HEIGHT_MAX);
                    heightRange.value = String(v);
                    heightNumber.value = String(v);
                    this.onSetFloorLayerFloorHeight?.(layerId, v);
                });
                heightNumber.addEventListener('input', () => {
                    const v = clamp(heightNumber.value, FLOOR_HEIGHT_MIN, FLOOR_HEIGHT_MAX);
                    heightRange.value = String(v);
                    heightNumber.value = String(v);
                    this.onSetFloorLayerFloorHeight?.(layerId, v);
                });

                heightRow.appendChild(heightLabel);
                heightRow.appendChild(heightRange);
                heightRow.appendChild(heightNumber);
                body.appendChild(heightRow);

                const interiorRow = document.createElement('div');
                interiorRow.className = 'building-fab-row building-fab-row-wide building-fab2-bay-window-mode-row';
                const interiorLabel = document.createElement('div');
                interiorLabel.className = 'building-fab-row-label';
                interiorLabel.textContent = 'Interior';
                const interiorControls = document.createElement('div');
                interiorControls.className = 'building-fab2-bay-row-controls';
                const interiorToggle = document.createElement('div');
                interiorToggle.className = 'building-fab2-width-mode-toggle building-fab2-bay-window-mode-toggle';

                const interiorEnabled = !!(layer?.interior?.enabled);
                const addInteriorToggleButton = (enabled, label) => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'building-fab2-width-mode-btn';
                    btn.textContent = label;
                    btn.disabled = !allowEdit;
                    btn.classList.toggle('is-active', interiorEnabled === enabled);
                    btn.addEventListener('click', () => {
                        if (!allowEdit || interiorEnabled === enabled) return;
                        this.onSetFloorLayerInteriorEnabled?.(layerId, enabled);
                    });
                    interiorToggle.appendChild(btn);
                };
                addInteriorToggleButton(false, 'Off');
                addInteriorToggleButton(true, 'On');

                interiorControls.appendChild(interiorToggle);
                interiorRow.appendChild(interiorLabel);
                interiorRow.appendChild(interiorControls);
                body.appendChild(interiorRow);

                const normalizeWallTextureId = (texId) => {
                    const id = typeof texId === 'string' ? texId : '';
                    return resolveBuildingStylePbrMaterialId(id) ?? id;
                };

                const getTexOpt = (id) => this._wallTextureDefById?.get(normalizeWallTextureId(id)) ?? null;
                const getColorOpt = (id) => (this._beltCourseColorOptions ?? []).find((o) => o?.id === id) ?? null;
                const resolveLayerMaterial = () => {
                    const raw = layer?.material && typeof layer.material === 'object' ? layer.material : null;
                    const kind = raw?.kind;
                    const id = typeof raw?.id === 'string' ? raw.id : '';
                    if ((kind === 'texture' || kind === 'color') && id) {
                        if (kind === 'texture') return { kind, id: normalizeWallTextureId(id) };
                        return { kind, id };
                    }
                    const styleId = typeof layer?.style === 'string' && layer.style ? layer.style : 'default';
                    return { kind: 'texture', id: normalizeWallTextureId(styleId) };
                };

                const facesHeader = document.createElement('div');
                facesHeader.className = 'building-fab2-layer-faces-header';
                const facesTitle = document.createElement('div');
                facesTitle.className = 'building-fab2-subtitle is-inline';
                facesTitle.textContent = 'Faces';

                const linkBtn = document.createElement('button');
                linkBtn.type = 'button';
                linkBtn.className = 'building-fab2-btn building-fab2-btn-small';
                linkBtn.textContent = 'Link';

                const faceState = this._getFloorLayerFaceState(layerId);
                const selectedFaceId = globalSelectedFaceId;
                const lockedToByFace = faceState.lockedToByFace;
                const lockedTo = selectedFaceId ? (lockedToByFace.get(selectedFaceId) ?? null) : null;
                const masterFaceId = lockedTo ?? selectedFaceId;

                linkBtn.disabled = !allowEdit || !selectedFaceId || !!lockedTo;
                linkBtn.addEventListener('click', () => {
                    if (!selectedFaceId) return;
                    if (lockedTo) return;
                    this.openLinkPopup({ layerId, masterFaceId: selectedFaceId });
                });

                facesHeader.appendChild(facesTitle);
                facesHeader.appendChild(linkBtn);
                body.appendChild(facesHeader);

                const faceButtonsRow = document.createElement('div');
                faceButtonsRow.className = 'building-fab2-face-buttons';

                const relatedFaces = this._getRelatedFacesForLayer({ selectedFaceId, lockedToByFace });
                for (const faceId of FACE_IDS) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'building-fab2-face-btn';
                    btn.textContent = faceId;
                    btn.disabled = !allowEdit;
                    const slaveOf = lockedToByFace.get(faceId) ?? null;
                    const isSlave = isFaceId(slaveOf);
                    const isRelated = faceId !== selectedFaceId && relatedFaces.has(faceId);
                    btn.classList.toggle('is-active', faceId === selectedFaceId);
                    btn.classList.toggle('is-slave', isSlave);
                    btn.classList.toggle('is-related', isRelated);
                    btn.classList.toggle('is-related-master', isRelated && faceId === masterFaceId);
                    btn.addEventListener('click', () => {
                        this.closeLinkPopup();
                        const next = faceId === selectedFaceId ? null : faceId;
                        this.onSelectFace?.(layerId, next);
                    });
                    faceButtonsRow.appendChild(btn);
                }
                body.appendChild(faceButtonsRow);

                // The rest of the per-face configuration goes below the face selection.
                const dynamicArea = document.createElement('div');
                dynamicArea.className = 'building-fab2-layer-dynamic';

                const dynamicOverlay = document.createElement('div');
                dynamicOverlay.className = 'building-fab2-layer-dynamic-overlay';

                const dynamicOverlayLabel = document.createElement('div');
                dynamicOverlayLabel.className = 'building-fab2-layer-dynamic-overlay-label';
                dynamicOverlay.appendChild(dynamicOverlayLabel);
                dynamicArea.appendChild(dynamicOverlay);

                const dynamicContent = document.createElement('div');
                dynamicContent.className = 'building-fab2-layer-dynamic-content';
                dynamicArea.appendChild(dynamicContent);

                const hasSelection = !!selectedFaceId;
                const isSlaveSelection = hasSelection && !!lockedTo;
                const isMasterSelection = hasSelection && !lockedTo;

                if (!hasSelection) {
                    dynamicOverlayLabel.textContent = 'Select a face to start configuring';
                } else if (isSlaveSelection) {
                    dynamicOverlayLabel.classList.add('building-fab2-face-locked-hint');
                    dynamicOverlayLabel.appendChild(createMaterialSymbolIcon('link', { size: 'sm' }));
                    const text = document.createElement('span');
                    text.textContent = `Locked to ${lockedTo}`;
                    dynamicOverlayLabel.appendChild(text);
                } else {
                    dynamicOverlay.classList.add('hidden');
                }

                dynamicContent.classList.toggle('is-hidden', !isMasterSelection);

                const configFaceId = lockedTo ?? selectedFaceId ?? 'A';
                const allowDynamicEdit = allowEdit && isMasterSelection;

                const materialsTitle = document.createElement('div');
                materialsTitle.className = 'building-fab2-subtitle';
                materialsTitle.textContent = 'Materials';
                dynamicContent.appendChild(materialsTitle);

                const faceMaterials = layer?.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
                const resolveFaceMaterial = () => {
                    const raw = faceMaterials?.[configFaceId]?.material && typeof faceMaterials[configFaceId].material === 'object'
                        ? faceMaterials[configFaceId].material
                        : null;
                    const kind = raw?.kind;
                    const id = typeof raw?.id === 'string' ? raw.id : '';
                    if ((kind === 'texture' || kind === 'color') && id) return { kind, id };
                    return resolveLayerMaterial();
                };

                const syncMaterialPicker = (picker, material) => {
                    const spec = material && typeof material === 'object' ? material : {};
                    const kind = spec.kind === 'color' ? 'color' : 'texture';
                    const id = typeof spec.id === 'string' ? spec.id : '';
                    if (kind === 'color') {
                        const opt = getColorOpt(id);
                        picker.text.textContent = opt?.label ?? id;
                        setMaterialThumbToColor(picker.thumb, opt?.hex ?? 0xffffff);
                        return;
                    }
                    const opt = getTexOpt(id);
                    picker.text.textContent = opt?.label ?? id;
                    setMaterialThumbToTexture(picker.thumb, opt?.wallTextureUrl ?? '', opt?.label ?? id);
                };

                const materialsSection = document.createElement('div');
                materialsSection.className = 'building-fab2-materials-section';

                const wallMaterialPicker = createMaterialPickerRowController({
                    label: '',
                    rowExtraClassName: 'building-fab2-no-label',
                    disabled: !allowDynamicEdit,
                    onPick: () => {
                        this.onRequestMaterialConfig?.(layerId, configFaceId);
                    }
                });
                syncMaterialPicker(wallMaterialPicker, resolveFaceMaterial());
                materialsSection.appendChild(wallMaterialPicker.row);

                dynamicContent.appendChild(materialsSection);

                const baysTitle = document.createElement('div');
                baysTitle.className = 'building-fab2-subtitle';
                baysTitle.textContent = 'Bays';
                dynamicContent.appendChild(baysTitle);

                const baysSection = document.createElement('div');
                baysSection.className = 'building-fab2-bays-section';

                const layerFacades = (this._facadesByLayerId?.[layerId] && typeof this._facadesByLayerId[layerId] === 'object')
                    ? this._facadesByLayerId[layerId]
                    : null;
                const facade = (layerFacades?.[configFaceId] && typeof layerFacades[configFaceId] === 'object')
                    ? layerFacades[configFaceId]
                    : null;
                const bays = Array.isArray(facade?.layout?.bays?.items) ? facade.layout.bays.items : [];

                const bayIndexById = new Map();
                for (let i = 0; i < bays.length; i++) {
                    const bay = bays[i] && typeof bays[i] === 'object' ? bays[i] : null;
                    const id = typeof bay?.id === 'string' ? bay.id : '';
                    if (id) bayIndexById.set(id, i);
                }
                const bayLinkGraph = buildBayLinkGraph(bays);

                const windowDefinitions = this._windowDefinitions && typeof this._windowDefinitions === 'object'
                    ? this._windowDefinitions
                    : null;
                const windowDefItems = Array.isArray(windowDefinitions?.items)
                    ? windowDefinitions.items.filter((entry) => entry && typeof entry === 'object')
                    : [];
                const windowDefById = new Map();
                for (const entry of windowDefItems) {
                    const id = typeof entry?.id === 'string' ? entry.id : '';
                    if (!id) continue;
                    windowDefById.set(id, entry);
                }

                const groupsRaw = Array.isArray(facade?.layout?.groups?.items) ? facade.layout.groups.items : [];
                const groupIntervals = [];
                for (const entry of groupsRaw) {
                    const groupId = typeof entry?.id === 'string' ? entry.id : '';
                    if (!groupId) continue;
                    const ids = Array.isArray(entry?.bayIds) ? entry.bayIds : [];
                    const seen = new Set();
                    const indices = [];
                    for (const bidRaw of ids) {
                        const bid = typeof bidRaw === 'string' ? bidRaw : '';
                        if (!bid || seen.has(bid)) continue;
                        seen.add(bid);
                        const idx = bayIndexById.get(bid);
                        if (!Number.isInteger(idx)) continue;
                        indices.push(idx);
                    }
                    indices.sort((a, b) => a - b);
                    if (indices.length < 2) continue;
                    let contiguous = true;
                    for (let i = 1; i < indices.length; i++) {
                        if (indices[i] !== indices[i - 1] + 1) {
                            contiguous = false;
                            break;
                        }
                    }
                    if (!contiguous) continue;
                    groupIntervals.push({
                        id: groupId,
                        indices,
                        start: indices[0],
                        end: indices[indices.length - 1],
                        level: 0
                    });
                }

                groupIntervals.sort((a, b) => {
                    const diff = a.start - b.start;
                    if (diff) return diff;
                    const endDiff = a.end - b.end;
                    if (endDiff) return endDiff;
                    return String(a.id).localeCompare(String(b.id));
                });

                const levelEnds = [];
                for (const group of groupIntervals) {
                    let level = 0;
                    for (; level < levelEnds.length; level++) {
                        if (group.start > (levelEnds[level] ?? -1)) break;
                    }
                    group.level = level;
                    if (level >= levelEnds.length) levelEnds.push(group.end);
                    else levelEnds[level] = Math.max(levelEnds[level] ?? -1, group.end);
                }

                const membershipsByIndex = Array.from({ length: bays.length }, () => []);
                for (const group of groupIntervals) {
                    const level = Math.max(0, Math.min(BAY_GROUP_CONNECTOR_MAX_LEVELS - 1, group.level));
                    for (const idx of group.indices) {
                        if (!Number.isInteger(idx) || idx < 0 || idx >= bays.length) continue;
                        membershipsByIndex[idx].push({
                            groupId: group.id,
                            level,
                            isStart: idx === group.start,
                            isEnd: idx === group.end
                        });
                    }
                }
                for (const list of membershipsByIndex) {
                    list.sort((a, b) => {
                        const diff = (a.level ?? 0) - (b.level ?? 0);
                        if (diff) return diff;
                        return String(a.groupId ?? '').localeCompare(String(b.groupId ?? ''));
                    });
                }

                const resolveBaySource = (bayId) => {
                    const id = typeof bayId === 'string' ? bayId : '';
                    if (!id) return null;
                    const rootMasterId = bayLinkGraph.rootMasterByBayId.get(id) ?? id;
                    return bayLinkGraph.byId.get(rootMasterId) ?? bayLinkGraph.byId.get(id) ?? null;
                };

                const resolveEffectiveBayMaterial = (bay) => {
                    const bayObj = bay && typeof bay === 'object' ? bay : null;
                    const bayId = typeof bayObj?.id === 'string' ? bayObj.id : '';
                    if (!bayId) return resolveFaceMaterial();
                    const source = resolveBaySource(bayId) ?? bayObj;
                    const raw = source?.wallMaterialOverride && typeof source.wallMaterialOverride === 'object' ? source.wallMaterialOverride : null;
                    const kind = raw?.kind;
                    const id = typeof raw?.id === 'string' ? raw.id : '';
                    if ((kind === 'texture' || kind === 'color') && id) return { kind, id };
                    return resolveFaceMaterial();
                };

                const syncMaterialThumb = (thumb, material) => {
                    const spec = material && typeof material === 'object' ? material : {};
                    const kind = spec.kind === 'color' ? 'color' : 'texture';
                    const id = typeof spec.id === 'string' ? spec.id : '';
                    if (kind === 'color') {
                        const opt = getColorOpt(id);
                        setMaterialThumbToColor(thumb, opt?.hex ?? 0xffffff);
                        return;
                    }
                    const opt = getTexOpt(id);
                    setMaterialThumbToTexture(thumb, opt?.wallTextureUrl ?? '', opt?.label ?? id);
                };

                const resolveBayOpeningPreview = (bay) => {
                    const srcBay = bay && typeof bay === 'object' ? bay : null;
                    const openingCfg = resolveBayWindowFromSpec(srcBay);
                    if (!openingCfg || openingCfg.enabled === false) return null;
                    const openingDefId = typeof openingCfg.defId === 'string' ? openingCfg.defId : '';
                    if (!openingDefId) return null;
                    const openingDef = windowDefById.get(openingDefId) ?? null;
                    const previewUrl = typeof openingDef?.previewUrl === 'string' ? openingDef.previewUrl : '';
                    if (!previewUrl) return null;
                    const fallbackType = normalizeOpeningAssetType(openingDef?.assetType, OPENING_ASSET_TYPE.WINDOW);
                    const openingType = normalizeOpeningAssetType(
                        openingCfg?.assetType ?? openingCfg?.openingType,
                        fallbackType
                    );
                    const openingTypeLabel = openingType === OPENING_ASSET_TYPE.DOOR
                        ? 'Door'
                        : (openingType === OPENING_ASSET_TYPE.GARAGE ? 'Garage' : 'Window');
                    const openingLabel = typeof openingDef?.label === 'string' && openingDef.label.trim()
                        ? openingDef.label.trim()
                        : `${openingTypeLabel} ${openingDefId}`;
                    return { previewUrl, openingLabel };
                };

                const appendBayOpeningPreview = (thumb, preview) => {
                    const target = thumb && typeof thumb === 'object' ? thumb : null;
                    if (!target || !preview || typeof preview !== 'object') return;
                    const previewUrl = typeof preview.previewUrl === 'string' ? preview.previewUrl : '';
                    if (!previewUrl) return;

                    const overlay = document.createElement('div');
                    overlay.className = 'building-fab2-bay-opening-preview';
                    const img = document.createElement('img');
                    img.className = 'building-fab2-bay-opening-preview-img';
                    img.alt = typeof preview.openingLabel === 'string' ? preview.openingLabel : 'Opening preview';
                    img.loading = 'lazy';
                    img.src = previewUrl;
                    overlay.appendChild(img);
                    target.appendChild(overlay);
                };

                let selectedBayId = this._getSelectedBayId(layerId, configFaceId);
                if (selectedBayId) {
                    const exists = bays.some((b) => (b && typeof b === 'object' ? b.id : '') === selectedBayId);
                    if (!exists) selectedBayId = null;
                }
                if (!selectedBayId && bays.length) {
                    const first = bays[0] && typeof bays[0] === 'object' ? bays[0] : null;
                    const id = typeof first?.id === 'string' ? first.id : '';
                    selectedBayId = id || null;
                }
                this._setSelectedBayId(layerId, configFaceId, selectedBayId);

                const baySelector = document.createElement('div');
                baySelector.className = 'building-fab2-bay-selector';

                const bayCards = document.createElement('div');
                bayCards.className = 'building-fab2-bay-selector-cards';

                const applyGroupConnectors = (strip, index) => {
                    const el = strip ?? null;
                    if (!el) return;
                    el.textContent = '';
                    el.style.height = `${BAY_GROUP_CONNECTOR_STRIP_HEIGHT_PX}px`;
                    const idx = Number.isInteger(index) ? index : -1;
                    if (idx < 0 || idx >= membershipsByIndex.length) return;
                    const memberships = membershipsByIndex[idx] ?? [];
                    for (const membership of memberships) {
                        const seg = document.createElement('div');
                        seg.className = 'building-fab2-bay-group-conn';
                        if (membership?.isStart) seg.classList.add('is-start');
                        if (membership?.isEnd) seg.classList.add('is-end');
                        const level = Math.max(0, Math.min(BAY_GROUP_CONNECTOR_MAX_LEVELS - 1, membership?.level ?? 0));
                        seg.style.top = `${BAY_GROUP_CONNECTOR_LEVEL_TOP_PADDING_PX + level * BAY_GROUP_CONNECTOR_LEVEL_SPACING_PX}px`;
                        seg.style.left = membership?.isStart ? '0px' : `-${BAY_GROUP_CONNECTOR_HALF_GAP_PX}px`;
                        seg.style.right = membership?.isEnd ? '0px' : `-${BAY_GROUP_CONNECTOR_HALF_GAP_PX}px`;
                        seg.style.opacity = String(1.0 - level * 0.15);
                        el.appendChild(seg);
                    }
                };

                const appendBaySlot = (btn, index = -1) => {
                    const slot = document.createElement('div');
                    slot.className = 'building-fab2-bay-slot';
                    const i = Number.isInteger(index) ? index : -1;
                    if (i >= 0) slot.dataset.bayIndex = String(i);
                    if (btn?.classList?.contains('is-slave-preview')) slot.classList.add('is-slave-preview');
                    slot.appendChild(btn);

                    const strip = document.createElement('div');
                    strip.className = 'building-fab2-bay-group-strip';
                    applyGroupConnectors(strip, i);
                    slot.appendChild(strip);

                    bayCards.appendChild(slot);
                };

                const resolveBayExpandPreference = (bay) => {
                    const raw = typeof bay?.expandPreference === 'string' ? bay.expandPreference : '';
                    if (raw === 'no_repeat' || raw === 'prefer_repeat' || raw === 'prefer_expand') return raw;
                    if (bay?.repeatable !== undefined) return bay.repeatable ? 'prefer_repeat' : 'no_repeat';
                    return 'prefer_expand';
                };

                if (!bays.length) {
                    const placeholder = document.createElement('button');
                    placeholder.type = 'button';
                    placeholder.className = 'building-fab2-bay-btn is-placeholder';
                    placeholder.disabled = true;

                    const thumb = document.createElement('div');
                    thumb.className = 'building-fab-material-thumb building-fab2-bay-btn-thumb';

                    const label = document.createElement('div');
                    label.className = 'building-fab2-bay-btn-label';
                    label.textContent = '-';

                    const icons = document.createElement('div');
                    icons.className = 'building-fab2-bay-btn-icons';

                    placeholder.appendChild(thumb);
                    placeholder.appendChild(label);
                    placeholder.appendChild(icons);
                    appendBaySlot(placeholder, -1);
                } else {
                    for (let bayIndex = 0; bayIndex < bays.length; bayIndex++) {
                        const bay = bays[bayIndex] && typeof bays[bayIndex] === 'object' ? bays[bayIndex] : null;
                        const bayId = typeof bay?.id === 'string' ? bay.id : '';
                        if (!bayId) continue;
                        const rootMasterBayId = bayLinkGraph.rootMasterByBayId.get(bayId) ?? bayId;
                        const isSlaveBay = rootMasterBayId !== bayId;
                        const linkHue = bayLinkGraph.hueByMasterId.get(rootMasterBayId) ?? null;

                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'building-fab2-bay-btn';
                        btn.disabled = !allowEdit;
                        btn.classList.toggle('is-active', bayId === selectedBayId);
                        if (Number.isFinite(linkHue)) {
                            btn.style.setProperty('--building-fab2-bay-link-hue', String(linkHue));
                            btn.classList.add(isSlaveBay ? 'is-link-slave' : 'is-link-master');
                        }
                        btn.addEventListener('pointerenter', () => {
                            this.onHoverBay?.({ layerId, faceId: configFaceId, bayId });
                        });
                        btn.addEventListener('pointerleave', () => {
                            this.onHoverBay?.(null);
                        });
                        btn.addEventListener('click', () => {
                            if (!allowEdit) return;
                            this._setSelectedBayId(layerId, configFaceId, bayId);
                            this._renderLayers();
                        });

                        if (isSlaveBay) {
                            const linkIcon = createMaterialSymbolIcon('link', { size: 'sm' });
                            linkIcon.classList.add('building-fab2-bay-slave-icon');
                            btn.classList.add('is-linked', 'is-slave-preview');
                            btn.appendChild(linkIcon);
                            appendBaySlot(btn, bayIndex);
                            continue;
                        }

                        const thumb = document.createElement('div');
                        thumb.className = 'building-fab-material-thumb building-fab2-bay-btn-thumb';

                        const effective = resolveEffectiveBayMaterial(bay);
                        syncMaterialThumb(thumb, effective);
                        const source = resolveBaySource(bayId) ?? bay;
                        const openingPreview = resolveBayOpeningPreview(source);
                        if (openingPreview) appendBayOpeningPreview(thumb, openingPreview);

                        const label = document.createElement('div');
                        label.className = 'building-fab2-bay-btn-label';
                        label.textContent = String(bayIndex + 1);

                        const icons = document.createElement('div');
                        icons.className = 'building-fab2-bay-btn-icons';
                        const modeRaw = typeof source?.size?.mode === 'string' ? source.size.mode : 'range';
                        const mode = (modeRaw === 'fixed' || modeRaw === 'range' || modeRaw === 'window_fixed') ? modeRaw : 'range';
                        const modeIcon = mode === 'fixed'
                            ? 'radio_button_checked'
                            : (mode === 'window_fixed' ? 'window' : 'open_in_full');
                        icons.appendChild(createMaterialSymbolIcon(modeIcon, { size: 'sm' }));
                        if (resolveBayExpandPreference(source) === 'prefer_repeat') {
                            icons.appendChild(createMaterialSymbolIcon('content_copy', { size: 'sm' }));
                        }

                        btn.appendChild(thumb);
                        btn.appendChild(label);
                        btn.appendChild(icons);
                        appendBaySlot(btn, bayIndex);
                    }
                }

                const addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.className = 'building-fab2-bay-btn is-add';
                addBtn.disabled = !allowDynamicEdit;
                addBtn.addEventListener('click', () => {
                    if (!allowDynamicEdit) return;
                    const created = this.onAddBay?.(layerId, configFaceId);
                    if (typeof created === 'string' && created) this._setSelectedBayId(layerId, configFaceId, created);
                    this._renderLayers();
                });

                const addThumb = document.createElement('div');
                addThumb.className = 'building-fab-material-thumb building-fab2-bay-btn-thumb';
                addThumb.appendChild(createMaterialSymbolIcon('add', { size: 'sm' }));
                const addLabel = document.createElement('div');
                addLabel.className = 'building-fab2-bay-btn-label';
                addLabel.textContent = '+ Bay';
                addBtn.appendChild(addThumb);
                addBtn.appendChild(addLabel);
                const bayAddRow = document.createElement('div');
                bayAddRow.className = 'building-fab2-bay-selector-add';
                bayAddRow.appendChild(addBtn);

                const groupBtn = document.createElement('button');
                groupBtn.type = 'button';
                groupBtn.className = 'building-fab2-bay-btn is-grouping';
                groupBtn.disabled = !allowDynamicEdit;
                groupBtn.addEventListener('click', () => {
                    if (!allowDynamicEdit) return;
                    this.openGroupingPanel({ layerId, faceId: configFaceId });
                });

                const groupThumb = document.createElement('div');
                groupThumb.className = 'building-fab-material-thumb building-fab2-bay-btn-thumb';
                groupThumb.appendChild(createMaterialSymbolIcon('grid_view', { size: 'sm' }));
                const groupLabel = document.createElement('div');
                groupLabel.className = 'building-fab2-bay-btn-label';
                groupLabel.textContent = 'Grouping';
                groupBtn.appendChild(groupThumb);
                groupBtn.appendChild(groupLabel);

                bayAddRow.appendChild(groupBtn);

                baySelector.appendChild(bayCards);
                baySelector.appendChild(bayAddRow);

                baysSection.appendChild(baySelector);

                const editor = document.createElement('div');
                editor.className = 'building-fab2-bay-card building-fab2-bay-editor';

                const editorOverlay = document.createElement('div');
                editorOverlay.className = 'building-fab2-bay-editor-overlay';
                const editorOverlayLabel = document.createElement('div');
                editorOverlayLabel.className = 'building-fab2-bay-editor-overlay-label';
                editorOverlay.appendChild(editorOverlayLabel);
                editor.appendChild(editorOverlay);

                const editorContent = document.createElement('div');
                editorContent.className = 'building-fab2-bay-editor-content';
                editor.appendChild(editorContent);

                const selectedIndex = selectedBayId ? bays.findIndex((b) => (b && typeof b === 'object' ? b.id : '') === selectedBayId) : -1;
                const selectedBay = selectedIndex >= 0 ? (bays[selectedIndex] && typeof bays[selectedIndex] === 'object' ? bays[selectedIndex] : null) : null;

                const hasSelectedBay = !!selectedBay;
                const editorBay = selectedBay ?? {
                    id: '',
                    linkFromBayId: null,
                    size: { mode: 'range', minMeters: 1.0, maxMeters: null },
                    expandPreference: 'prefer_expand',
                    textureFlow: 'restart',
                    wallMaterialOverride: null
                };
                const bayId = hasSelectedBay && typeof editorBay?.id === 'string' ? editorBay.id : '';
                const isLast = hasSelectedBay ? (selectedIndex === bays.length - 1) : false;
                const allowBayEdit = allowDynamicEdit && hasSelectedBay;

                editorOverlayLabel.textContent = !bays.length
                    ? 'Add a bay to start configuring'
                    : (hasSelectedBay ? '' : 'Select a bay to start configuring');
                editorOverlay.classList.toggle('hidden', hasSelectedBay);
                editorContent.classList.toggle('is-hidden', !hasSelectedBay);

	                const resolveBayIndexLabel = (id) => {
	                    const idx = bayIndexById.get(id) ?? null;
	                    return Number.isInteger(idx) ? `Bay ${idx + 1}` : id;
	                };

                const linkedFromBayId = resolveBayLinkFromSpec(editorBay);
                const linkedLabel = linkedFromBayId ? `Linked to ${resolveBayIndexLabel(linkedFromBayId)}` : '';
                const allowBayConfigEdit = allowBayEdit && !linkedFromBayId;
                const openingCfg = resolveBayWindowFromSpec(editorBay);
                const hasBayOpening = !!openingCfg && openingCfg.enabled !== false;
                const openingDefId = hasBayOpening && typeof openingCfg?.defId === 'string' ? openingCfg.defId : '';
                const selectedOpeningDef = hasBayOpening && openingDefId ? (windowDefById.get(openingDefId) ?? null) : null;
                const selectedOpeningLabel = selectedOpeningDef?.label || openingDefId || '';
                const selectedOpeningPreviewUrl = typeof selectedOpeningDef?.previewUrl === 'string' ? selectedOpeningDef.previewUrl : '';
                const selectedDefAssetType = normalizeOpeningAssetType(selectedOpeningDef?.assetType, OPENING_ASSET_TYPE.WINDOW);
                const openingAssetType = hasBayOpening
                    ? normalizeOpeningAssetType(openingCfg?.assetType ?? openingCfg?.openingType, selectedDefAssetType)
                    : OPENING_ASSET_TYPE.WINDOW;
                const openingAssetTypeLabel = openingAssetType === OPENING_ASSET_TYPE.DOOR
                    ? 'Door'
                    : (openingAssetType === OPENING_ASSET_TYPE.GARAGE ? 'Garage' : 'Window');
                const openingAssetTypeLower = openingAssetTypeLabel.toLowerCase();
                const openingPickerLabel = hasBayOpening ? openingAssetTypeLabel : 'Window';
                const openingWidthLabel = `${openingAssetTypeLabel} width`;
                const openingHeightLabel = `${openingAssetTypeLabel} height`;
                const openingHeightModeLabel = `${openingAssetTypeLabel} height mode`;
                const openingOffsetLabel = `${openingAssetTypeLabel} offset from floor`;
                const openingPaddingLabelText = `${openingAssetTypeLabel} padding`;
                const selectedOpeningName = hasBayOpening
                    ? (selectedOpeningLabel || (openingDefId ? `Missing · ${openingDefId}` : 'none'))
                    : 'none';
                const selectedOpeningDefWidth = Number(selectedOpeningDef?.settings?.width);
                const selectedOpeningDefHeight = Number(selectedOpeningDef?.settings?.height);
                const openingSize = openingCfg?.size && typeof openingCfg.size === 'object' ? openingCfg.size : null;
                const openingWidthRaw = Number(openingSize?.widthMeters);
                const openingHeightRaw = Number(openingSize?.heightMeters);
                const openingWidthMeters = hasBayOpening
                    ? (Number.isFinite(openingWidthRaw)
                        ? Math.max(0.1, openingWidthRaw)
                        : (Number.isFinite(selectedOpeningDefWidth) ? Math.max(0.1, selectedOpeningDefWidth) : 0.1))
                    : 0.1;
                const openingHeightMeters = hasBayOpening
                    ? (Number.isFinite(openingHeightRaw)
                        ? Math.max(0.1, openingHeightRaw)
                        : (Number.isFinite(selectedOpeningDefHeight) ? Math.max(0.1, selectedOpeningDefHeight) : 0.1))
                    : 0.1;
                const openingHeightMode = normalizeOpeningHeightMode(openingCfg?.heightMode, OPENING_HEIGHT_MODE.FIXED);
                const openingVerticalOffsetRaw = Number(openingCfg?.verticalOffsetMeters);
                const openingVerticalOffsetValue = Number.isFinite(openingVerticalOffsetRaw)
                    ? Math.max(0, openingVerticalOffsetRaw)
                    : 0;
                const openingPadding = openingCfg?.padding && typeof openingCfg.padding === 'object' ? openingCfg.padding : null;
                const openingPaddingLinked = (openingPadding?.linked ?? true) !== false;
                const openingPaddingLeft = Math.max(0, Number(openingPadding?.leftMeters) || 0);
                const openingPaddingRight = Math.max(0, Number(openingPadding?.rightMeters) || (openingPaddingLinked ? openingPaddingLeft : 0));
                const openingRepeatAllowed = openingAssetType === OPENING_ASSET_TYPE.WINDOW;
                const openingRepeatCountRaw = normalizeOpeningRepeatCount(
                    openingCfg?.repeat?.count ?? openingCfg?.repeatCount,
                    OPENING_REPEAT_MIN
                );
                const openingRepeatCount = openingRepeatAllowed ? openingRepeatCountRaw : OPENING_REPEAT_MIN;
                const openingVisual = openingCfg?.visual && typeof openingCfg.visual === 'object' ? openingCfg.visual : null;
                const openingDefShadeEnabledRaw = selectedOpeningDef?.settings?.shade?.enabled;
                const openingDisableShadesDefault = openingDefShadeEnabledRaw === undefined
                    ? false
                    : !openingDefShadeEnabledRaw;
                const openingDisableShades = !!(
                    openingVisual?.disableShades
                    ?? openingCfg?.disableShades
                    ?? openingCfg?.shadesDisabled
                    ?? openingDisableShadesDefault
                );
                const openingInteriorDefault = selectedOpeningDef
                    ? resolveOpeningInteriorModeFromSettings(selectedOpeningDef?.settings, OPENING_INTERIOR_MODE.RES)
                    : (openingAssetType === OPENING_ASSET_TYPE.WINDOW ? OPENING_INTERIOR_MODE.RES : OPENING_INTERIOR_MODE.NONE);
                const openingInteriorMode = normalizeOpeningInteriorMode(
                    openingVisual?.interior
                    ?? openingVisual?.interiorMode
                    ?? openingCfg?.interiorPreset
                    ?? openingCfg?.interiorMode,
                    openingInteriorDefault
                );
                const openingGarageFacade = openingCfg?.garageFacade && typeof openingCfg.garageFacade === 'object'
                    ? openingCfg.garageFacade
                    : null;
                const openingGarageFacadeState = normalizeGarageFacadeState(openingGarageFacade?.state);
                const topCfg = openingCfg?.top && typeof openingCfg.top === 'object' ? openingCfg.top : null;
                const allowTopOpening = hasBayOpening && openingAssetType !== OPENING_ASSET_TYPE.GARAGE;
                const topOpeningEnabled = allowTopOpening && !!topCfg?.enabled;
                const topOpeningHeightMode = normalizeOpeningHeightMode(topCfg?.heightMode, OPENING_HEIGHT_MODE.FIXED);
                const topOpeningHeightRaw = Number(topCfg?.heightMeters);
                const topOpeningHeightValue = Number.isFinite(topOpeningHeightRaw)
                    ? Math.max(0.1, topOpeningHeightRaw)
                    : openingHeightMeters;
                const topOpeningGapRaw = Number(topCfg?.verticalGapMeters);
                const topOpeningGapValue = Number.isFinite(topOpeningGapRaw)
                    ? Math.max(0, topOpeningGapRaw)
                    : 0.1;
                const topFrameWidthSource = topCfg?.frameWidthMeters;
                const topFrameWidthRaw = (topFrameWidthSource === null || topFrameWidthSource === undefined)
                    ? Number.NaN
                    : Number(topFrameWidthSource);
                const topFrameWidthValue = Number.isFinite(topFrameWidthRaw)
                    ? Math.max(0.01, Math.round(Math.max(0.01, topFrameWidthRaw) * 100) / 100)
                    : null;
                const topFrameWidthOverrideEnabled = Number.isFinite(topFrameWidthValue);
                const bottomFrameWidthCandidates = [
                    selectedOpeningDef?.settings?.frame?.width,
                    selectedOpeningDef?.settings?.frame?.verticalWidth,
                    selectedOpeningDef?.settings?.frame?.horizontalWidth
                ];
                let topFrameWidthInheritedValue = 0.08;
                for (const candidate of bottomFrameWidthCandidates) {
                    const raw = Number(candidate);
                    if (!Number.isFinite(raw)) continue;
                    topFrameWidthInheritedValue = Math.max(0.01, Math.round(Math.max(0.01, raw) * 100) / 100);
                    break;
                }
                const topFrameWidthDisplayValue = (topFrameWidthOverrideEnabled
                    ? topFrameWidthValue
                    : topFrameWidthInheritedValue).toFixed(2);
                const openingMuntins = openingCfg?.muntins && typeof openingCfg.muntins === 'object' ? openingCfg.muntins : null;
                const bottomMuntinsEnabled = openingMuntins?.bottomEnabled !== false;
                const topMuntinsEnabled = openingMuntins?.topEnabled !== false;
                const openingRequiredWidth = hasBayOpening
                    ? Math.max(0.1, openingWidthMeters * openingRepeatCount + openingPaddingLeft + openingPaddingRight)
                    : null;

	                {
	                    const bayHeader = document.createElement('div');
	                    bayHeader.className = 'building-fab2-bay-card-header';
	                    const bayHeaderTitle = document.createElement('div');
	                    bayHeaderTitle.className = 'building-fab2-bay-card-title';
	                    bayHeaderTitle.textContent = hasSelectedBay ? `Bay ${selectedIndex + 1}` : 'Bay';

	                    const bayHeaderActions = document.createElement('div');
	                    bayHeaderActions.className = 'building-fab2-bay-card-actions';

	                    const bayUpBtn = document.createElement('button');
	                    bayUpBtn.type = 'button';
	                    bayUpBtn.className = 'building-fab2-icon-btn';
	                    applyMaterialSymbolToButton(bayUpBtn, { name: 'arrow_upward', label: 'Move bay up', size: 'sm' });
	                    bayUpBtn.disabled = !allowBayEdit || selectedIndex === 0;
	                    bayUpBtn.addEventListener('click', () => {
	                        if (!allowBayEdit) return;
	                        this.onMoveBay?.(layerId, configFaceId, bayId, -1);
	                    });

	                    const bayDownBtn = document.createElement('button');
	                    bayDownBtn.type = 'button';
	                    bayDownBtn.className = 'building-fab2-icon-btn';
	                    applyMaterialSymbolToButton(bayDownBtn, { name: 'arrow_downward', label: 'Move bay down', size: 'sm' });
	                    bayDownBtn.disabled = !allowBayEdit || isLast;
	                    bayDownBtn.addEventListener('click', () => {
	                        if (!allowBayEdit) return;
	                        this.onMoveBay?.(layerId, configFaceId, bayId, 1);
	                    });

			                    const bayLinkBtn = document.createElement('button');
			                    bayLinkBtn.type = 'button';
			                    bayLinkBtn.className = 'building-fab2-icon-btn building-fab2-bay-link-btn';
			                    bayLinkBtn.classList.toggle('is-linked', !!linkedFromBayId);
			                    applyMaterialSymbolToButton(bayLinkBtn, { name: 'link', label: 'Link bay', size: 'sm' });
			                    bayLinkBtn.disabled = !allowBayEdit;
			                    bayLinkBtn.addEventListener('click', () => {
			                        if (!allowBayEdit) return;
		                        // In the master/slave model, linking is authored from the master bay.
		                        if (linkedFromBayId) this.onSetBayLink?.(layerId, configFaceId, bayId, null);
		                        this.openBayLinkPopup({ layerId, faceId: configFaceId, masterBayId: bayId });
		                    });

	                    const bayDeleteBtn = document.createElement('button');
	                    bayDeleteBtn.type = 'button';
	                    bayDeleteBtn.className = 'building-fab2-icon-btn';
	                    applyMaterialSymbolToButton(bayDeleteBtn, { name: 'delete', label: 'Delete bay', size: 'sm' });
	                    bayDeleteBtn.disabled = !allowBayEdit;
	                    bayDeleteBtn.addEventListener('click', () => {
	                        if (!allowBayEdit) return;
	                        this.onDeleteBay?.(layerId, configFaceId, bayId);
	                    });

	                    bayHeaderActions.appendChild(bayUpBtn);
	                    bayHeaderActions.appendChild(bayDownBtn);
	                    bayHeaderActions.appendChild(bayLinkBtn);
	                    bayHeaderActions.appendChild(bayDeleteBtn);

	                    bayHeader.appendChild(bayHeaderTitle);
	                    bayHeader.appendChild(bayHeaderActions);
	                    editorContent.appendChild(bayHeader);

                        const bayBody = document.createElement('div');
                        bayBody.className = 'building-fab2-bay-editor-body';

                        const bayLinkOverlay = document.createElement('div');
                        bayLinkOverlay.className = 'building-fab2-bay-linked-overlay';
                        const bayLinkOverlayLabel = document.createElement('div');
                        bayLinkOverlayLabel.className = 'building-fab2-bay-linked-overlay-label';
                        bayLinkOverlayLabel.appendChild(createMaterialSymbolIcon('link', { size: 'sm' }));
                        const bayLinkOverlayText = document.createElement('span');
                        bayLinkOverlayText.textContent = linkedLabel;
                        bayLinkOverlayLabel.appendChild(bayLinkOverlayText);
                        bayLinkOverlay.appendChild(bayLinkOverlayLabel);
                        bayBody.appendChild(bayLinkOverlay);

                        const bayBodyContent = document.createElement('div');
                        bayBodyContent.className = 'building-fab2-bay-editor-body-content';
                        bayBody.appendChild(bayBodyContent);

                        bayLinkOverlay.classList.toggle('hidden', !linkedFromBayId);
                        bayBodyContent.classList.toggle('is-hidden', !!linkedFromBayId);
                        editorContent.appendChild(bayBody);

                    const rawSizeMode = typeof editorBay?.size?.mode === 'string' ? editorBay.size.mode : 'range';
                    const sizeMode = (rawSizeMode === 'fixed' || rawSizeMode === 'range' || rawSizeMode === 'window_fixed')
                        ? rawSizeMode
                        : 'range';

	                    const widthRow = document.createElement('div');
	                    widthRow.className = 'building-fab-row building-fab-row-wide building-fab2-bay-width-row';
	                    const widthLabel = document.createElement('div');
	                    widthLabel.className = 'building-fab-row-label';
	                    widthLabel.textContent = 'Width';

	                    const widthControls = document.createElement('div');
	                    widthControls.className = 'building-fab2-bay-width-controls';

	                    const widthModeToggle = document.createElement('div');
	                    widthModeToggle.className = 'building-fab2-width-mode-toggle';

                    const fixedBtn = document.createElement('button');
                    fixedBtn.type = 'button';
                    fixedBtn.className = 'building-fab2-width-mode-btn';
                    applyMaterialSymbolToButton(fixedBtn, { name: 'radio_button_unchecked', label: 'Fixed width', size: 'sm' });
                    fixedBtn.disabled = !allowBayConfigEdit;
	                    fixedBtn.classList.toggle('is-active', sizeMode === 'fixed');
	                    fixedBtn.addEventListener('click', () => {
	                        if (!allowBayConfigEdit) return;
	                        this.onSetBaySizeMode?.(layerId, configFaceId, bayId, 'fixed');
	                    });

                    const rangeBtn = document.createElement('button');
                    rangeBtn.type = 'button';
                    rangeBtn.className = 'building-fab2-width-mode-btn';
                    applyMaterialSymbolToButton(rangeBtn, { name: 'open_in_full', label: 'Width range', size: 'sm' });
                    rangeBtn.disabled = !allowBayConfigEdit;
	                    rangeBtn.classList.toggle('is-active', sizeMode === 'range');
	                    rangeBtn.addEventListener('click', () => {
                        if (!allowBayConfigEdit) return;
                        this.onSetBaySizeMode?.(layerId, configFaceId, bayId, 'range');
                    });

                    const windowFixedBtn = document.createElement('button');
                    windowFixedBtn.type = 'button';
                    windowFixedBtn.className = 'building-fab2-width-mode-btn';
                    applyMaterialSymbolToButton(windowFixedBtn, { name: 'window', label: 'Opening fixed width', size: 'sm' });
                    windowFixedBtn.disabled = !allowBayConfigEdit;
                    windowFixedBtn.classList.toggle('is-active', sizeMode === 'window_fixed');
                    windowFixedBtn.addEventListener('click', () => {
                        if (!allowBayConfigEdit) return;
                        this.onSetBaySizeMode?.(layerId, configFaceId, bayId, 'window_fixed');
                    });

                    widthModeToggle.appendChild(fixedBtn);
                    widthModeToggle.appendChild(rangeBtn);
                    widthModeToggle.appendChild(windowFixedBtn);
                    widthControls.appendChild(widthModeToggle);

	                    const widthInputs = document.createElement('div');
	                    widthInputs.className = 'building-fab2-bay-width-inputs';

                    if (sizeMode === 'fixed') {
                        const widthInput = document.createElement('input');
                        widthInput.type = 'number';
                        widthInput.className = 'building-fab-number building-fab2-bay-width-input';
                        widthInput.min = String(Number.isFinite(openingRequiredWidth) ? openingRequiredWidth : 0.1);
                        widthInput.step = '0.1';
                        widthInput.disabled = !allowBayConfigEdit;
                        widthInput.placeholder = 'Value';
                        widthInput.setAttribute('aria-label', 'Bay width value (m)');
                        const rawWidth = Number(editorBay?.size?.widthMeters);
                        widthInput.value = String(Number.isFinite(rawWidth)
                            ? Math.max(rawWidth, Number.isFinite(openingRequiredWidth) ? openingRequiredWidth : 0.1)
                            : 1.0);
                        widthInput.addEventListener('input', () => {
                            if (!allowBayConfigEdit) return;
                            this.onSetBayFixedWidth?.(layerId, configFaceId, bayId, Number(widthInput.value));
                        });
                        widthInputs.appendChild(widthInput);
                    } else if (sizeMode === 'window_fixed') {
                        const derivedHint = document.createElement('div');
                        derivedHint.className = 'building-fab2-hint building-fab2-bay-window-min-hint';
                        const derivedValue = Number.isFinite(openingRequiredWidth) ? `${openingRequiredWidth.toFixed(2)}m` : 'n/a';
                        derivedHint.textContent = `Derived from opening width + padding: ${derivedValue}`;
                        widthInputs.appendChild(derivedHint);
                    } else {
                        const minInput = document.createElement('input');
                        minInput.type = 'number';
                        minInput.className = 'building-fab-number building-fab2-bay-width-input';
                        minInput.min = String(Number.isFinite(openingRequiredWidth) ? openingRequiredWidth : 0.1);
                        minInput.step = '0.1';
                        minInput.disabled = !allowBayConfigEdit;
                        minInput.placeholder = 'Min';
                        minInput.setAttribute('aria-label', 'Bay min width (m)');
                        const rawMin = Number(editorBay?.size?.minMeters);
                        minInput.value = String(Number.isFinite(rawMin)
                            ? Math.max(rawMin, Number.isFinite(openingRequiredWidth) ? openingRequiredWidth : 0.1)
                            : 1.0);
                        minInput.addEventListener('input', () => {
                            if (!allowBayConfigEdit) return;
                            this.onSetBayMinWidth?.(layerId, configFaceId, bayId, Number(minInput.value));
                        });
	                        widthInputs.appendChild(minInput);

                        const maxInput = document.createElement('input');
                        maxInput.type = 'number';
                        maxInput.className = 'building-fab-number building-fab2-bay-width-input';
                        maxInput.min = String(Number.isFinite(openingRequiredWidth) ? openingRequiredWidth : 0.1);
                        maxInput.step = '0.1';
                        maxInput.placeholder = 'Max';
                        maxInput.setAttribute('aria-label', 'Bay max width (m)');

	                        const rawMax = editorBay?.size?.maxMeters;
	                        const maxIsInfinity = rawMax === null || rawMax === undefined;
	                        const maxValue = Number(rawMax);
	                        maxInput.value = String(Number.isFinite(maxValue) ? maxValue : (Number.isFinite(rawMin) ? rawMin : 1.0));
	                        maxInput.disabled = !allowBayConfigEdit || maxIsInfinity;
	                        maxInput.addEventListener('input', () => {
	                            if (!allowBayConfigEdit) return;
	                            this.onSetBayMaxWidth?.(layerId, configFaceId, bayId, Number(maxInput.value));
	                        });
	                        widthInputs.appendChild(maxInput);

	                        const infinityBtn = document.createElement('button');
	                        infinityBtn.type = 'button';
	                        infinityBtn.className = 'building-fab2-width-inf-btn';
	                        applyMaterialSymbolToButton(infinityBtn, { name: 'all_inclusive', label: 'Infinite max', size: 'sm' });
	                        infinityBtn.disabled = !allowBayConfigEdit;
	                        infinityBtn.classList.toggle('is-active', maxIsInfinity);
	                        infinityBtn.addEventListener('click', () => {
	                            if (!allowBayConfigEdit) return;
	                            this.onSetBayMaxWidth?.(layerId, configFaceId, bayId, maxIsInfinity ? Number(maxInput.value) : null);
	                        });
	                        widthInputs.appendChild(infinityBtn);
	                    }

	                    widthControls.appendChild(widthInputs);

                    widthRow.appendChild(widthLabel);
                    widthRow.appendChild(widthControls);
                    bayBodyContent.appendChild(widthRow);

                    if (Number.isFinite(openingRequiredWidth)) {
                        const windowMinHint = document.createElement('div');
                        windowMinHint.className = 'building-fab2-hint building-fab2-bay-window-min-hint';
                        windowMinHint.textContent = `Effective bay min width (opening + padding): ${openingRequiredWidth.toFixed(2)}m`;
                        bayBodyContent.appendChild(windowMinHint);
                    }

		                    const depthTitle = document.createElement('div');
		                    depthTitle.className = 'building-fab2-subtitle is-inline';
		                    depthTitle.textContent = 'Depth';
		                    bayBodyContent.appendChild(depthTitle);

		                    const depthSpec = editorBay?.depth && typeof editorBay.depth === 'object' ? editorBay.depth : null;
		                    const depthLinked = (depthSpec?.linked ?? true) !== false;
		                    const depthLeft = clamp(Number(depthSpec?.left) || 0, BAY_DEPTH_MIN_M, BAY_DEPTH_MAX_M);
		                    const depthRight = clamp(Number(depthSpec?.right) || (depthLinked ? depthLeft : 0), BAY_DEPTH_MIN_M, BAY_DEPTH_MAX_M);

		                    const depthSection = document.createElement('div');
		                    depthSection.className = 'building-fab2-bay-depth-section';

		                    const leftDepthRow = createRangeRow('Left edge depth');
		                    leftDepthRow.row.classList.add('building-fab2-bay-depth-row');
		                    leftDepthRow.range.min = String(BAY_DEPTH_MIN_M);
		                    leftDepthRow.range.max = String(BAY_DEPTH_MAX_M);
		                    leftDepthRow.range.step = String(BAY_DEPTH_STEP_M);
		                    leftDepthRow.number.min = String(BAY_DEPTH_MIN_M);
		                    leftDepthRow.number.max = String(BAY_DEPTH_MAX_M);
		                    leftDepthRow.number.step = String(BAY_DEPTH_STEP_M);
		                    leftDepthRow.range.value = String(depthLeft);
		                    leftDepthRow.number.value = String(depthLeft);
		                    leftDepthRow.range.disabled = !allowBayConfigEdit;
		                    leftDepthRow.number.disabled = !allowBayConfigEdit;
		                    leftDepthRow.range.setAttribute('aria-label', 'Left edge depth (m)');
		                    leftDepthRow.number.setAttribute('aria-label', 'Left edge depth (m)');

		                    const rightDepthRow = createRangeRow('Right edge depth');
		                    rightDepthRow.row.classList.add('building-fab2-bay-depth-row');
		                    rightDepthRow.range.min = String(BAY_DEPTH_MIN_M);
		                    rightDepthRow.range.max = String(BAY_DEPTH_MAX_M);
		                    rightDepthRow.range.step = String(BAY_DEPTH_STEP_M);
		                    rightDepthRow.number.min = String(BAY_DEPTH_MIN_M);
		                    rightDepthRow.number.max = String(BAY_DEPTH_MAX_M);
		                    rightDepthRow.number.step = String(BAY_DEPTH_STEP_M);
		                    rightDepthRow.range.value = String(depthRight);
		                    rightDepthRow.number.value = String(depthRight);
		                    rightDepthRow.range.disabled = !allowBayConfigEdit;
		                    rightDepthRow.number.disabled = !allowBayConfigEdit;
		                    rightDepthRow.range.setAttribute('aria-label', 'Right edge depth (m)');
		                    rightDepthRow.number.setAttribute('aria-label', 'Right edge depth (m)');

		                    const depthLinkRow = document.createElement('div');
		                    depthLinkRow.className = 'building-fab2-bay-depth-link-row';
		                    const depthLinkBtn = document.createElement('button');
		                    depthLinkBtn.type = 'button';
		                    depthLinkBtn.className = 'building-fab2-icon-btn building-fab2-bay-depth-link-btn';
		                    depthLinkBtn.disabled = !allowBayConfigEdit;
		                    applyMaterialSymbolToButton(depthLinkBtn, {
		                        name: depthLinked ? 'link' : 'link_off',
		                        label: depthLinked ? 'Unlink depth edges' : 'Link depth edges',
		                        size: 'sm'
		                    });
		                    depthLinkBtn.addEventListener('click', () => {
		                        if (!allowBayConfigEdit) return;
		                        this.onToggleBayDepthLink?.(layerId, configFaceId, bayId);
		                    });
		                    depthLinkRow.appendChild(depthLinkBtn);

		                    const setDepth = (edge, raw) => {
		                        if (!allowBayConfigEdit) return;
		                        const v = clamp(raw, BAY_DEPTH_MIN_M, BAY_DEPTH_MAX_M);
		                        if (edge === 'left') {
		                            leftDepthRow.range.value = String(v);
		                            leftDepthRow.number.value = String(v);
		                            if (depthLinked) {
		                                rightDepthRow.range.value = String(v);
		                                rightDepthRow.number.value = String(v);
		                            }
		                            this.onSetBayDepthEdge?.(layerId, configFaceId, bayId, 'left', v);
		                            return;
		                        }
		                        rightDepthRow.range.value = String(v);
		                        rightDepthRow.number.value = String(v);
		                        if (depthLinked) {
		                            leftDepthRow.range.value = String(v);
		                            leftDepthRow.number.value = String(v);
		                        }
		                        this.onSetBayDepthEdge?.(layerId, configFaceId, bayId, 'right', v);
		                    };

		                    leftDepthRow.range.addEventListener('input', () => setDepth('left', Number(leftDepthRow.range.value)));
		                    leftDepthRow.number.addEventListener('input', () => setDepth('left', Number(leftDepthRow.number.value)));
		                    rightDepthRow.range.addEventListener('input', () => setDepth('right', Number(rightDepthRow.range.value)));
		                    rightDepthRow.number.addEventListener('input', () => setDepth('right', Number(rightDepthRow.number.value)));

		                    depthSection.appendChild(leftDepthRow.row);
		                    depthSection.appendChild(depthLinkRow);
		                    depthSection.appendChild(rightDepthRow.row);
		                    bayBodyContent.appendChild(depthSection);

		                    const prefRow = document.createElement('div');
		                    prefRow.className = 'building-fab-row building-fab-row-wide';
		                    const prefLabel = document.createElement('div');
		                    prefLabel.className = 'building-fab-row-label';
	                    prefLabel.textContent = 'Expand preference';
	
	                    const prefControls = document.createElement('div');
	                    prefControls.className = 'building-fab2-bay-row-controls';
	
	                    const prefSelect = document.createElement('select');
	                    prefSelect.className = 'building-fab-select building-fab2-bay-expand-select';
	                    prefSelect.disabled = !allowBayConfigEdit;
	                    prefSelect.setAttribute('aria-label', 'Expand preference');
	
	                    const resolveExpandPreference = () => {
	                        const raw = typeof editorBay?.expandPreference === 'string' ? editorBay.expandPreference : '';
	                        if (raw === 'no_repeat' || raw === 'prefer_repeat' || raw === 'prefer_expand') return raw;
	                        if (editorBay?.repeatable !== undefined) return editorBay.repeatable ? 'prefer_repeat' : 'no_repeat';
	                        return 'prefer_expand';
	                    };
	
	                    const addPrefOption = (value, label) => {
	                        const opt = document.createElement('option');
	                        opt.value = value;
	                        opt.textContent = label;
	                        prefSelect.appendChild(opt);
	                    };
	
	                    addPrefOption('no_repeat', 'No Repeat');
	                    addPrefOption('prefer_repeat', 'Prefer Repeat');
	                    addPrefOption('prefer_expand', 'Prefer Expand');
	                    prefSelect.value = resolveExpandPreference();
	                    prefSelect.addEventListener('change', () => {
	                        if (!allowBayConfigEdit) return;
	                        this.onSetBayExpandPreference?.(layerId, configFaceId, bayId, prefSelect.value);
	                    });
	
	                    prefControls.appendChild(prefSelect);
	                    prefRow.appendChild(prefLabel);
	                    prefRow.appendChild(prefControls);
	                    bayBodyContent.appendChild(prefRow);

	                    const flowRow = document.createElement('div');
	                    flowRow.className = 'building-fab-row building-fab-row-wide';
	                    const flowLabel = document.createElement('div');
	                    flowLabel.className = 'building-fab-row-label';
	                    flowLabel.textContent = 'Texture repeat';

	                    const flowControls = document.createElement('div');
	                    flowControls.className = 'building-fab2-bay-row-controls';

	                    const flowSelect = document.createElement('select');
	                    flowSelect.className = 'building-fab-select building-fab2-bay-flow-select';
	                    flowSelect.disabled = !allowBayConfigEdit;
	                    flowSelect.setAttribute('aria-label', 'Texture repeat type');
	                    const currentFlow = typeof editorBay?.textureFlow === 'string' ? editorBay.textureFlow : 'restart';

	                    const addFlowOption = (value, label, { disabled = false } = {}) => {
	                        const opt = document.createElement('option');
	                        opt.value = value;
	                        opt.textContent = label;
	                        opt.disabled = !!disabled;
	                        flowSelect.appendChild(opt);
	                    };

	                    addFlowOption('restart', 'Restart on new bay');
	                    addFlowOption('repeats', 'Continuous across repeats');
	                    addFlowOption('overflow_left', 'Overflow left', { disabled: selectedIndex === 0 });
	                    addFlowOption('overflow_right', 'Overflow right', { disabled: isLast });
	                    flowSelect.value = ['restart', 'repeats', 'overflow_left', 'overflow_right'].includes(currentFlow) ? currentFlow : 'restart';
	                    flowSelect.addEventListener('change', () => {
	                        if (!allowBayConfigEdit) return;
	                        this.onSetBayTextureFlow?.(layerId, configFaceId, bayId, flowSelect.value);
	                    });
	                    flowControls.appendChild(flowSelect);

	                    flowRow.appendChild(flowLabel);
	                    flowRow.appendChild(flowControls);
	                    bayBodyContent.appendChild(flowRow);

	                    const materialEditor = document.createElement('div');
	                    materialEditor.className = 'building-fab2-bay-material-editor';

	                    const materialContent = document.createElement('div');
	                    materialContent.className = 'building-fab2-bay-material-content';
	                    materialEditor.appendChild(materialContent);

	                    const override = editorBay?.wallMaterialOverride && typeof editorBay.wallMaterialOverride === 'object'
	                        ? editorBay.wallMaterialOverride
	                        : null;
	                    const overridden = !!override;

		                    const bayMaterialPicker = createMaterialPickerRowController({
		                        label: '',
		                        rowExtraClassName: 'building-fab2-no-label',
		                        disabled: !allowBayConfigEdit,
		                        onPick: () => {
		                            if (!allowBayConfigEdit) return;
		                            this.onRequestBayMaterialConfig?.(layerId, configFaceId, bayId);
		                        }
		                    });

		                    const inlinePickerRow = document.createElement('div');
		                    inlinePickerRow.className = 'building-fab2-material-picker-inline';
		                    bayMaterialPicker.picker.insertBefore(inlinePickerRow, bayMaterialPicker.button);
		                    inlinePickerRow.appendChild(bayMaterialPicker.button);

		                    if (overridden) {
		                        syncMaterialPicker(bayMaterialPicker, override);

		                        const clearBtn = document.createElement('button');
		                        clearBtn.type = 'button';
		                        clearBtn.className = 'building-fab2-icon-btn building-fab2-bay-material-clear-btn';
		                        applyMaterialSymbolToButton(clearBtn, { name: 'close', label: 'Clear override', size: 'sm' });
		                        clearBtn.disabled = !allowBayConfigEdit;
		                        clearBtn.addEventListener('click', () => {
		                            if (!allowBayConfigEdit) return;
		                            this.onSetBayWallMaterialOverride?.(layerId, configFaceId, bayId, null);
		                        });
		                        inlinePickerRow.appendChild(clearBtn);
		                    } else {
		                        bayMaterialPicker.text.textContent = 'Inherited';
		                    }
		                    materialContent.appendChild(bayMaterialPicker.row);

		                    bayBodyContent.appendChild(materialEditor);

                            const openingTitle = document.createElement('div');
                            openingTitle.className = 'building-fab2-subtitle is-inline';
                            openingTitle.textContent = 'Windows/Doors';
                            bayBodyContent.appendChild(openingTitle);

                            const openingSection = document.createElement('div');
                            openingSection.className = 'building-fab2-bay-window-section';

                            const openingDetails = document.createElement('div');
                            openingDetails.className = 'building-fab2-bay-window-details';

                            const mainOpeningSection = document.createElement('div');
                            mainOpeningSection.className = 'building-fab2-bay-opening-subsection';
                            const mainOpeningSubtitle = document.createElement('div');
                            mainOpeningSubtitle.className = 'building-fab2-bay-opening-subtitle';
                            mainOpeningSubtitle.textContent = `Main ${openingAssetTypeLower}`;
                            mainOpeningSection.appendChild(mainOpeningSubtitle);
                            openingDetails.appendChild(mainOpeningSection);

                            const topOpeningSection = document.createElement('div');
                            topOpeningSection.className = 'building-fab2-bay-opening-subsection';
                            const topOpeningSubtitle = document.createElement('div');
                            topOpeningSubtitle.className = 'building-fab2-bay-opening-subtitle';
                            topOpeningSubtitle.textContent = 'Top window';
                            topOpeningSection.appendChild(topOpeningSubtitle);
                            openingDetails.appendChild(topOpeningSection);

                            const bayOpeningPicker = createMaterialPickerRowController({
                                label: openingPickerLabel,
                                pickerExtraClassName: 'building-fab2-material-thumb-only building-fab2-bay-window-picker',
                                disabled: !allowBayConfigEdit,
                                onPick: () => {
                                    if (!allowBayConfigEdit) return;
                                    this.onRequestBayWindowPicker?.(layerId, configFaceId, bayId);
                                }
                            });
                            if (hasBayOpening && selectedOpeningDef) {
                                bayOpeningPicker.text.textContent = selectedOpeningLabel;
                                setMaterialThumbToTexture(
                                    bayOpeningPicker.thumb,
                                    selectedOpeningPreviewUrl,
                                    selectedOpeningLabel || openingDefId || openingAssetTypeLabel
                                );
                            } else if (hasBayOpening) {
                                const missingLabel = openingDefId ? `Missing · ${openingDefId}` : `Select ${openingAssetTypeLower}`;
                                bayOpeningPicker.text.textContent = missingLabel;
                                setMaterialThumbToTexture(bayOpeningPicker.thumb, '', missingLabel);
                            } else {
                                bayOpeningPicker.text.textContent = 'none';
                                setMaterialThumbToTexture(bayOpeningPicker.thumb, '', 'none');
                            }
                            mainOpeningSection.appendChild(bayOpeningPicker.row);

                            const selectedOpeningRow = document.createElement('div');
                            selectedOpeningRow.className = 'building-fab-row building-fab-row-wide building-fab2-no-label';
                            const selectedOpeningRowLabel = document.createElement('div');
                            selectedOpeningRowLabel.className = 'building-fab-row-label';
                            selectedOpeningRowLabel.textContent = '';
                            const selectedOpeningRowControls = document.createElement('div');
                            selectedOpeningRowControls.className = 'building-fab2-bay-row-controls';
                            const selectedOpeningValue = document.createElement('div');
                            selectedOpeningValue.className = 'building-fab2-bay-readonly-value';
                            selectedOpeningValue.textContent = selectedOpeningName;
                            selectedOpeningRowControls.appendChild(selectedOpeningValue);
                            const clearOpeningBtn = document.createElement('button');
                            clearOpeningBtn.type = 'button';
                            clearOpeningBtn.className = 'building-fab2-icon-btn building-fab2-bay-window-clear-btn';
                            clearOpeningBtn.disabled = !allowBayConfigEdit || !hasBayOpening;
                            applyMaterialSymbolToButton(clearOpeningBtn, { name: 'delete', label: 'Clear opening selection', size: 'sm' });
                            clearOpeningBtn.addEventListener('click', () => {
                                if (!allowBayConfigEdit || !hasBayOpening) return;
                                this.onSetBayWindowEnabled?.(layerId, configFaceId, bayId, false);
                            });
                            selectedOpeningRowControls.appendChild(clearOpeningBtn);
                            selectedOpeningRow.appendChild(selectedOpeningRowLabel);
                            selectedOpeningRow.appendChild(selectedOpeningRowControls);
                            mainOpeningSection.appendChild(selectedOpeningRow);

                            const openingControlsDisabled = !allowBayConfigEdit || !hasBayOpening;
                            const openingHeightModeRow = document.createElement('div');
                            openingHeightModeRow.className = 'building-fab-row building-fab-row-wide building-fab2-bay-window-mode-row';
                            const openingHeightModeLabelEl = document.createElement('div');
                            openingHeightModeLabelEl.className = 'building-fab-row-label';
                            openingHeightModeLabelEl.textContent = openingHeightModeLabel;
                            const openingHeightModeControls = document.createElement('div');
                            openingHeightModeControls.className = 'building-fab2-bay-row-controls';
                            const openingHeightModeToggle = document.createElement('div');
                            openingHeightModeToggle.className = 'building-fab2-width-mode-toggle building-fab2-bay-window-mode-toggle';

                            const openingHeightFixedBtn = document.createElement('button');
                            openingHeightFixedBtn.type = 'button';
                            openingHeightFixedBtn.className = 'building-fab2-width-mode-btn';
                            openingHeightFixedBtn.textContent = 'Fixed';
                            openingHeightFixedBtn.disabled = openingControlsDisabled;
                            openingHeightFixedBtn.classList.toggle('is-active', openingHeightMode === OPENING_HEIGHT_MODE.FIXED);
                            openingHeightFixedBtn.addEventListener('click', () => {
                                if (openingControlsDisabled || openingHeightMode === OPENING_HEIGHT_MODE.FIXED) return;
                                this.onSetBayWindowHeightMode?.(layerId, configFaceId, bayId, OPENING_HEIGHT_MODE.FIXED);
                            });
                            openingHeightModeToggle.appendChild(openingHeightFixedBtn);

                            const openingHeightFullBtn = document.createElement('button');
                            openingHeightFullBtn.type = 'button';
                            openingHeightFullBtn.className = 'building-fab2-width-mode-btn';
                            openingHeightFullBtn.textContent = 'Full Height';
                            openingHeightFullBtn.disabled = openingControlsDisabled;
                            openingHeightFullBtn.classList.toggle('is-active', openingHeightMode === OPENING_HEIGHT_MODE.FULL);
                            openingHeightFullBtn.addEventListener('click', () => {
                                if (openingControlsDisabled || openingHeightMode === OPENING_HEIGHT_MODE.FULL) return;
                                this.onSetBayWindowHeightMode?.(layerId, configFaceId, bayId, OPENING_HEIGHT_MODE.FULL);
                            });
                            openingHeightModeToggle.appendChild(openingHeightFullBtn);
                            openingHeightModeControls.appendChild(openingHeightModeToggle);
                            openingHeightModeRow.appendChild(openingHeightModeLabelEl);
                            openingHeightModeRow.appendChild(openingHeightModeControls);
                            mainOpeningSection.appendChild(openingHeightModeRow);

                            const openingWidthSliderMax = Math.max(
                                12,
                                Math.ceil(openingWidthMeters),
                                Number.isFinite(openingRequiredWidth) ? Math.ceil(openingRequiredWidth) : 0
                            );
                            const openingWidthRow = createRangeRow(openingWidthLabel);
                            openingWidthRow.row.classList.add('building-fab2-bay-window-range-row');
                            openingWidthRow.range.min = '0.1';
                            openingWidthRow.range.max = String(openingWidthSliderMax);
                            openingWidthRow.range.step = '0.01';
                            openingWidthRow.number.min = '0.1';
                            openingWidthRow.number.step = '0.01';
                            openingWidthRow.range.disabled = openingControlsDisabled;
                            openingWidthRow.number.disabled = openingControlsDisabled;
                            const syncOpeningWidthValue = (rawValue) => {
                                const next = Math.max(0.1, Number(rawValue) || 0.1);
                                openingWidthRow.range.value = String(clamp(next, 0.1, openingWidthSliderMax));
                                openingWidthRow.number.value = next.toFixed(2);
                            };
                            syncOpeningWidthValue(openingWidthMeters);
                            openingWidthRow.range.addEventListener('input', () => {
                                if (openingControlsDisabled) return;
                                const next = Math.max(0.1, Number(openingWidthRow.range.value) || 0.1);
                                syncOpeningWidthValue(next);
                                this.onSetBayWindowPlacementWidth?.(layerId, configFaceId, bayId, next);
                            });
                            openingWidthRow.number.addEventListener('input', () => {
                                if (openingControlsDisabled) return;
                                const next = Number(openingWidthRow.number.value);
                                if (!Number.isFinite(next)) return;
                                const clampedValue = Math.max(0.1, next);
                                syncOpeningWidthValue(clampedValue);
                                this.onSetBayWindowPlacementWidth?.(layerId, configFaceId, bayId, clampedValue);
                            });
                            mainOpeningSection.appendChild(openingWidthRow.row);

                            const openingHeightRow = createRangeRow(openingHeightLabel);
                            openingHeightRow.row.classList.add('building-fab2-bay-window-range-row');
                            openingHeightRow.range.min = '0.1';
                            openingHeightRow.range.max = '12';
                            openingHeightRow.range.step = '0.01';
                            openingHeightRow.number.min = '0.1';
                            openingHeightRow.number.step = '0.01';
                            const openingHeightDisabled = openingControlsDisabled || openingHeightMode === OPENING_HEIGHT_MODE.FULL;
                            openingHeightRow.range.disabled = openingHeightDisabled;
                            openingHeightRow.number.disabled = openingHeightDisabled;
                            const syncOpeningHeightValue = (rawValue) => {
                                const next = Math.max(0.1, Number(rawValue) || 0.1);
                                openingHeightRow.range.value = String(clamp(next, 0.1, 12));
                                openingHeightRow.number.value = next.toFixed(2);
                            };
                            syncOpeningHeightValue(openingHeightMeters);
                            openingHeightRow.range.addEventListener('input', () => {
                                if (openingHeightDisabled) return;
                                const next = Math.max(0.1, Number(openingHeightRow.range.value) || 0.1);
                                syncOpeningHeightValue(next);
                                this.onSetBayWindowPlacementHeight?.(layerId, configFaceId, bayId, next);
                            });
                            openingHeightRow.number.addEventListener('input', () => {
                                if (openingHeightDisabled) return;
                                const next = Number(openingHeightRow.number.value);
                                if (!Number.isFinite(next)) return;
                                const clampedValue = Math.max(0.1, next);
                                syncOpeningHeightValue(clampedValue);
                                this.onSetBayWindowPlacementHeight?.(layerId, configFaceId, bayId, clampedValue);
                            });
                            mainOpeningSection.appendChild(openingHeightRow.row);

                            const openingVerticalOffsetRow = createRangeRow(openingOffsetLabel);
                            openingVerticalOffsetRow.row.classList.add('building-fab2-bay-window-range-row');
                            openingVerticalOffsetRow.range.min = '0';
                            openingVerticalOffsetRow.range.max = '12';
                            openingVerticalOffsetRow.range.step = '0.01';
                            openingVerticalOffsetRow.number.min = '0';
                            openingVerticalOffsetRow.number.step = '0.01';
                            openingVerticalOffsetRow.range.disabled = openingControlsDisabled;
                            openingVerticalOffsetRow.number.disabled = openingControlsDisabled;
                            const syncOpeningOffsetValue = (rawValue) => {
                                const next = Math.max(0, Number(rawValue) || 0);
                                openingVerticalOffsetRow.range.value = String(clamp(next, 0, 12));
                                openingVerticalOffsetRow.number.value = next.toFixed(2);
                            };
                            syncOpeningOffsetValue(openingVerticalOffsetValue);
                            openingVerticalOffsetRow.range.addEventListener('input', () => {
                                if (openingControlsDisabled) return;
                                const next = Math.max(0, Number(openingVerticalOffsetRow.range.value) || 0);
                                syncOpeningOffsetValue(next);
                                this.onSetBayWindowVerticalOffset?.(layerId, configFaceId, bayId, next);
                            });
                            openingVerticalOffsetRow.number.addEventListener('input', () => {
                                if (openingControlsDisabled) return;
                                const next = Number(openingVerticalOffsetRow.number.value);
                                if (!Number.isFinite(next)) return;
                                const clampedValue = Math.max(0, next);
                                syncOpeningOffsetValue(clampedValue);
                                this.onSetBayWindowVerticalOffset?.(layerId, configFaceId, bayId, clampedValue);
                            });
                            mainOpeningSection.appendChild(openingVerticalOffsetRow.row);

                            const openingRepeatRow = createRangeRow(`${openingAssetTypeLabel} repeat`);
                            openingRepeatRow.row.classList.add('building-fab2-bay-window-range-row');
                            openingRepeatRow.range.min = String(OPENING_REPEAT_MIN);
                            openingRepeatRow.range.max = String(OPENING_REPEAT_MAX);
                            openingRepeatRow.range.step = '1';
                            openingRepeatRow.number.min = String(OPENING_REPEAT_MIN);
                            openingRepeatRow.number.max = String(OPENING_REPEAT_MAX);
                            openingRepeatRow.number.step = '1';
                            const openingRepeatDisabled = openingControlsDisabled || !openingRepeatAllowed;
                            openingRepeatRow.range.disabled = openingRepeatDisabled;
                            openingRepeatRow.number.disabled = openingRepeatDisabled;
                            const syncOpeningRepeatValue = (rawValue) => {
                                const next = normalizeOpeningRepeatCount(rawValue, OPENING_REPEAT_MIN);
                                openingRepeatRow.range.value = String(next);
                                openingRepeatRow.number.value = String(next);
                            };
                            syncOpeningRepeatValue(openingRepeatCount);
                            openingRepeatRow.range.addEventListener('input', () => {
                                if (openingRepeatDisabled) return;
                                const next = normalizeOpeningRepeatCount(openingRepeatRow.range.value, OPENING_REPEAT_MIN);
                                syncOpeningRepeatValue(next);
                                this.onSetBayWindowRepeatCount?.(layerId, configFaceId, bayId, next);
                            });
                            openingRepeatRow.number.addEventListener('input', () => {
                                if (openingRepeatDisabled) return;
                                const next = normalizeOpeningRepeatCount(openingRepeatRow.number.value, OPENING_REPEAT_MIN);
                                syncOpeningRepeatValue(next);
                                this.onSetBayWindowRepeatCount?.(layerId, configFaceId, bayId, next);
                            });
                            mainOpeningSection.appendChild(openingRepeatRow.row);

                            if (!openingRepeatAllowed && hasBayOpening) {
                                const repeatHint = document.createElement('div');
                                repeatHint.className = 'building-fab2-hint building-fab2-bay-window-details-hint';
                                repeatHint.textContent = `${openingAssetTypeLabel}s always use repeat 1.`;
                                mainOpeningSection.appendChild(repeatHint);
                            }

                            const openingPaddingRow = document.createElement('div');
                            openingPaddingRow.className = 'building-fab-row building-fab-row-wide';
                            const openingPaddingLabel = document.createElement('div');
                            openingPaddingLabel.className = 'building-fab-row-label';
                            openingPaddingLabel.textContent = openingPaddingLabelText;
                            const openingPaddingControls = document.createElement('div');
                            openingPaddingControls.className = 'building-fab2-bay-window-padding-controls';

                            const openingPaddingLeftInput = document.createElement('input');
                            openingPaddingLeftInput.type = 'number';
                            openingPaddingLeftInput.className = 'building-fab-number building-fab2-bay-window-padding-input';
                            openingPaddingLeftInput.min = '0';
                            openingPaddingLeftInput.step = '0.1';
                            openingPaddingLeftInput.placeholder = 'Left';
                            openingPaddingLeftInput.disabled = !allowBayConfigEdit || !hasBayOpening;
                            openingPaddingLeftInput.value = String(openingPaddingLeft);
                            openingPaddingLeftInput.addEventListener('input', () => {
                                if (!allowBayConfigEdit || !hasBayOpening) return;
                                this.onSetBayWindowPadding?.(layerId, configFaceId, bayId, 'left', Number(openingPaddingLeftInput.value));
                            });
                            openingPaddingControls.appendChild(openingPaddingLeftInput);

                            const openingPaddingLinkBtn = document.createElement('button');
                            openingPaddingLinkBtn.type = 'button';
                            openingPaddingLinkBtn.className = 'building-fab2-icon-btn';
                            openingPaddingLinkBtn.disabled = !allowBayConfigEdit || !hasBayOpening;
                            applyMaterialSymbolToButton(openingPaddingLinkBtn, {
                                name: openingPaddingLinked ? 'link' : 'link_off',
                                label: openingPaddingLinked ? 'Unlink opening padding' : 'Link opening padding',
                                size: 'sm'
                            });
                            openingPaddingLinkBtn.addEventListener('click', () => {
                                if (!allowBayConfigEdit || !hasBayOpening) return;
                                this.onToggleBayWindowPaddingLink?.(layerId, configFaceId, bayId);
                            });
                            openingPaddingControls.appendChild(openingPaddingLinkBtn);

                            const openingPaddingRightInput = document.createElement('input');
                            openingPaddingRightInput.type = 'number';
                            openingPaddingRightInput.className = 'building-fab-number building-fab2-bay-window-padding-input';
                            openingPaddingRightInput.min = '0';
                            openingPaddingRightInput.step = '0.1';
                            openingPaddingRightInput.placeholder = 'Right';
                            openingPaddingRightInput.disabled = !allowBayConfigEdit || !hasBayOpening || openingPaddingLinked;
                            openingPaddingRightInput.value = String(openingPaddingRight);
                            openingPaddingRightInput.addEventListener('input', () => {
                                if (!allowBayConfigEdit || !hasBayOpening || openingPaddingLinked) return;
                                this.onSetBayWindowPadding?.(layerId, configFaceId, bayId, 'right', Number(openingPaddingRightInput.value));
                            });
                            openingPaddingControls.appendChild(openingPaddingRightInput);

                            openingPaddingRow.appendChild(openingPaddingLabel);
                            openingPaddingRow.appendChild(openingPaddingControls);
                            mainOpeningSection.appendChild(openingPaddingRow);

                            const bottomMuntinsRow = document.createElement('div');
                            bottomMuntinsRow.className = 'building-fab-row building-fab-row-wide';
                            const bottomMuntinsLabel = document.createElement('div');
                            bottomMuntinsLabel.className = 'building-fab-row-label';
                            bottomMuntinsLabel.textContent = 'Bottom muntins';
                            const bottomMuntinsControls = document.createElement('div');
                            bottomMuntinsControls.className = 'building-fab2-bay-row-controls';
                            const bottomMuntinsToggle = document.createElement('div');
                            bottomMuntinsToggle.className = 'building-fab2-width-mode-toggle building-fab2-bay-window-mode-toggle';
                            const bottomMuntinsDisabled = !allowBayConfigEdit || !hasBayOpening;
                            const bottomMuntinsOffBtn = document.createElement('button');
                            bottomMuntinsOffBtn.type = 'button';
                            bottomMuntinsOffBtn.className = 'building-fab2-width-mode-btn';
                            bottomMuntinsOffBtn.textContent = 'Off';
                            bottomMuntinsOffBtn.disabled = bottomMuntinsDisabled;
                            bottomMuntinsOffBtn.classList.toggle('is-active', !bottomMuntinsEnabled);
                            bottomMuntinsOffBtn.addEventListener('click', () => {
                                if (bottomMuntinsDisabled || !bottomMuntinsEnabled) return;
                                this.onSetBayWindowMuntinsEnabled?.(layerId, configFaceId, bayId, 'bottom', false);
                            });
                            bottomMuntinsToggle.appendChild(bottomMuntinsOffBtn);
                            const bottomMuntinsOnBtn = document.createElement('button');
                            bottomMuntinsOnBtn.type = 'button';
                            bottomMuntinsOnBtn.className = 'building-fab2-width-mode-btn';
                            bottomMuntinsOnBtn.textContent = 'On';
                            bottomMuntinsOnBtn.disabled = bottomMuntinsDisabled;
                            bottomMuntinsOnBtn.classList.toggle('is-active', !!bottomMuntinsEnabled);
                            bottomMuntinsOnBtn.addEventListener('click', () => {
                                if (bottomMuntinsDisabled || !!bottomMuntinsEnabled) return;
                                this.onSetBayWindowMuntinsEnabled?.(layerId, configFaceId, bayId, 'bottom', true);
                            });
                            bottomMuntinsToggle.appendChild(bottomMuntinsOnBtn);
                            bottomMuntinsControls.appendChild(bottomMuntinsToggle);
                            bottomMuntinsRow.appendChild(bottomMuntinsLabel);
                            bottomMuntinsRow.appendChild(bottomMuntinsControls);
                            mainOpeningSection.appendChild(bottomMuntinsRow);

                            const shadesEnabled = !openingDisableShades;
                            const shadesRow = document.createElement('div');
                            shadesRow.className = 'building-fab-row building-fab-row-wide';
                            const shadesLabel = document.createElement('div');
                            shadesLabel.className = 'building-fab-row-label';
                            shadesLabel.textContent = 'Shades';
                            const shadesControls = document.createElement('div');
                            shadesControls.className = 'building-fab2-bay-row-controls';
                            const shadesToggle = document.createElement('div');
                            shadesToggle.className = 'building-fab2-width-mode-toggle building-fab2-bay-window-mode-toggle';
                            const shadesOffBtn = document.createElement('button');
                            shadesOffBtn.type = 'button';
                            shadesOffBtn.className = 'building-fab2-width-mode-btn';
                            shadesOffBtn.textContent = 'Off';
                            shadesOffBtn.disabled = openingControlsDisabled;
                            shadesOffBtn.classList.toggle('is-active', !shadesEnabled);
                            shadesOffBtn.addEventListener('click', () => {
                                if (openingControlsDisabled || !shadesEnabled) return;
                                this.onSetBayWindowShadesDisabled?.(layerId, configFaceId, bayId, true);
                            });
                            shadesToggle.appendChild(shadesOffBtn);
                            const shadesOnBtn = document.createElement('button');
                            shadesOnBtn.type = 'button';
                            shadesOnBtn.className = 'building-fab2-width-mode-btn';
                            shadesOnBtn.textContent = 'On';
                            shadesOnBtn.disabled = openingControlsDisabled;
                            shadesOnBtn.classList.toggle('is-active', shadesEnabled);
                            shadesOnBtn.addEventListener('click', () => {
                                if (openingControlsDisabled || shadesEnabled) return;
                                this.onSetBayWindowShadesDisabled?.(layerId, configFaceId, bayId, false);
                            });
                            shadesToggle.appendChild(shadesOnBtn);
                            shadesControls.appendChild(shadesToggle);
                            shadesRow.appendChild(shadesLabel);
                            shadesRow.appendChild(shadesControls);
                            mainOpeningSection.appendChild(shadesRow);

                            const openingInteriorRow = document.createElement('div');
                            openingInteriorRow.className = 'building-fab-row building-fab-row-wide';
                            const openingInteriorLabel = document.createElement('div');
                            openingInteriorLabel.className = 'building-fab-row-label';
                            openingInteriorLabel.textContent = 'Interior';
                            const openingInteriorControls = document.createElement('div');
                            openingInteriorControls.className = 'building-fab2-bay-row-controls';
                            const openingInteriorToggle = document.createElement('div');
                            openingInteriorToggle.className = 'building-fab2-width-mode-toggle building-fab2-bay-window-mode-toggle';
                            const addInteriorModeButton = (mode, label) => {
                                const btn = document.createElement('button');
                                btn.type = 'button';
                                btn.className = 'building-fab2-width-mode-btn';
                                btn.textContent = label;
                                btn.disabled = openingControlsDisabled;
                                btn.classList.toggle('is-active', openingInteriorMode === mode);
                                btn.addEventListener('click', () => {
                                    if (openingControlsDisabled || openingInteriorMode === mode) return;
                                    this.onSetBayWindowInteriorPreset?.(layerId, configFaceId, bayId, mode);
                                });
                                openingInteriorToggle.appendChild(btn);
                            };
                            addInteriorModeButton(OPENING_INTERIOR_MODE.NONE, 'None');
                            addInteriorModeButton(OPENING_INTERIOR_MODE.RES, 'Res');
                            addInteriorModeButton(OPENING_INTERIOR_MODE.OFFICE, 'Office');
                            openingInteriorControls.appendChild(openingInteriorToggle);
                            openingInteriorRow.appendChild(openingInteriorLabel);
                            openingInteriorRow.appendChild(openingInteriorControls);
                            mainOpeningSection.appendChild(openingInteriorRow);

                            if (openingAssetType === OPENING_ASSET_TYPE.GARAGE) {
                                const garageStateRow = document.createElement('div');
                                garageStateRow.className = 'building-fab-row building-fab-row-wide';
                                const garageStateLabel = document.createElement('div');
                                garageStateLabel.className = 'building-fab-row-label';
                                garageStateLabel.textContent = 'Garage state';
                                const garageStateControls = document.createElement('div');
                                garageStateControls.className = 'building-fab2-bay-row-controls';
                                const garageStateToggle = document.createElement('div');
                                garageStateToggle.className = 'building-fab2-width-mode-toggle building-fab2-bay-window-mode-toggle';
                                const addGarageStateButton = (state, label) => {
                                    const btn = document.createElement('button');
                                    btn.type = 'button';
                                    btn.className = 'building-fab2-width-mode-btn';
                                    btn.textContent = label;
                                    btn.disabled = openingControlsDisabled;
                                    btn.classList.toggle('is-active', openingGarageFacadeState === state);
                                    btn.addEventListener('click', () => {
                                        if (openingControlsDisabled || openingGarageFacadeState === state) return;
                                        this.onSetBayGarageFacadeState?.(layerId, configFaceId, bayId, state);
                                    });
                                    garageStateToggle.appendChild(btn);
                                };
                                addGarageStateButton(GARAGE_FACADE_STATE.CLOSED, 'Closed');
                                addGarageStateButton(GARAGE_FACADE_STATE.OPEN, 'Open');
                                garageStateControls.appendChild(garageStateToggle);
                                garageStateRow.appendChild(garageStateLabel);
                                garageStateRow.appendChild(garageStateControls);
                                mainOpeningSection.appendChild(garageStateRow);
                            }

                            if (allowTopOpening) {
                                const topOpeningEnableRow = document.createElement('div');
                                topOpeningEnableRow.className = 'building-fab-row building-fab-row-wide';
                                const topOpeningEnableLabel = document.createElement('div');
                                topOpeningEnableLabel.className = 'building-fab-row-label';
                                topOpeningEnableLabel.textContent = 'Enable';
                                const topOpeningEnableControls = document.createElement('div');
                                topOpeningEnableControls.className = 'building-fab2-bay-row-controls';
                                const topOpeningEnableToggle = document.createElement('div');
                                topOpeningEnableToggle.className = 'building-fab2-width-mode-toggle building-fab2-bay-window-mode-toggle';
                                const topOpeningEnableDisabled = !allowBayConfigEdit || !hasBayOpening;
                                const topOpeningOffBtn = document.createElement('button');
                                topOpeningOffBtn.type = 'button';
                                topOpeningOffBtn.className = 'building-fab2-width-mode-btn';
                                topOpeningOffBtn.textContent = 'Off';
                                topOpeningOffBtn.disabled = topOpeningEnableDisabled;
                                topOpeningOffBtn.classList.toggle('is-active', !topOpeningEnabled);
                                topOpeningOffBtn.addEventListener('click', () => {
                                    if (topOpeningEnableDisabled || !topOpeningEnabled) return;
                                    this.onSetBayTopWindowEnabled?.(layerId, configFaceId, bayId, false);
                                });
                                topOpeningEnableToggle.appendChild(topOpeningOffBtn);
                                const topOpeningOnBtn = document.createElement('button');
                                topOpeningOnBtn.type = 'button';
                                topOpeningOnBtn.className = 'building-fab2-width-mode-btn';
                                topOpeningOnBtn.textContent = 'On';
                                topOpeningOnBtn.disabled = topOpeningEnableDisabled;
                                topOpeningOnBtn.classList.toggle('is-active', !!topOpeningEnabled);
                                topOpeningOnBtn.addEventListener('click', () => {
                                    if (topOpeningEnableDisabled || topOpeningEnabled) return;
                                    this.onSetBayTopWindowEnabled?.(layerId, configFaceId, bayId, true);
                                });
                                topOpeningEnableToggle.appendChild(topOpeningOnBtn);
                                topOpeningEnableControls.appendChild(topOpeningEnableToggle);
                                topOpeningEnableRow.appendChild(topOpeningEnableLabel);
                                topOpeningEnableRow.appendChild(topOpeningEnableControls);
                                topOpeningSection.appendChild(topOpeningEnableRow);

                                const topOpeningDetails = document.createElement('div');
                                topOpeningDetails.className = 'building-fab2-bay-window-details';
                                topOpeningDetails.classList.toggle('is-hidden', !topOpeningEnabled);

                                const topMuntinsRow = document.createElement('div');
                                topMuntinsRow.className = 'building-fab-row building-fab-row-wide';
                                const topMuntinsLabel = document.createElement('div');
                                topMuntinsLabel.className = 'building-fab-row-label';
                                topMuntinsLabel.textContent = 'Top muntins';
                                const topMuntinsControls = document.createElement('div');
                                topMuntinsControls.className = 'building-fab2-bay-row-controls';
                                const topMuntinsToggle = document.createElement('div');
                                topMuntinsToggle.className = 'building-fab2-width-mode-toggle building-fab2-bay-window-mode-toggle';
                                const topMuntinsDisabled = !allowBayConfigEdit || !hasBayOpening || !allowTopOpening || !topOpeningEnabled;
                                const topMuntinsOffBtn = document.createElement('button');
                                topMuntinsOffBtn.type = 'button';
                                topMuntinsOffBtn.className = 'building-fab2-width-mode-btn';
                                topMuntinsOffBtn.textContent = 'Off';
                                topMuntinsOffBtn.disabled = topMuntinsDisabled;
                                topMuntinsOffBtn.classList.toggle('is-active', !topMuntinsEnabled);
                                topMuntinsOffBtn.addEventListener('click', () => {
                                    if (topMuntinsDisabled || !topMuntinsEnabled) return;
                                    this.onSetBayWindowMuntinsEnabled?.(layerId, configFaceId, bayId, 'top', false);
                                });
                                topMuntinsToggle.appendChild(topMuntinsOffBtn);
                                const topMuntinsOnBtn = document.createElement('button');
                                topMuntinsOnBtn.type = 'button';
                                topMuntinsOnBtn.className = 'building-fab2-width-mode-btn';
                                topMuntinsOnBtn.textContent = 'On';
                                topMuntinsOnBtn.disabled = topMuntinsDisabled;
                                topMuntinsOnBtn.classList.toggle('is-active', !!topMuntinsEnabled);
                                topMuntinsOnBtn.addEventListener('click', () => {
                                    if (topMuntinsDisabled || !!topMuntinsEnabled) return;
                                    this.onSetBayWindowMuntinsEnabled?.(layerId, configFaceId, bayId, 'top', true);
                                });
                                topMuntinsToggle.appendChild(topMuntinsOnBtn);
                                topMuntinsControls.appendChild(topMuntinsToggle);
                                topMuntinsRow.appendChild(topMuntinsLabel);
                                topMuntinsRow.appendChild(topMuntinsControls);
                                topOpeningDetails.appendChild(topMuntinsRow);

                                const topHeightModeRow = document.createElement('div');
                                topHeightModeRow.className = 'building-fab-row building-fab-row-wide building-fab2-bay-window-mode-row';
                                const topHeightModeLabel = document.createElement('div');
                                topHeightModeLabel.className = 'building-fab-row-label';
                                topHeightModeLabel.textContent = 'Top window height mode';
                                const topHeightModeControls = document.createElement('div');
                                topHeightModeControls.className = 'building-fab2-bay-row-controls';
                                const topHeightModeToggle = document.createElement('div');
                                topHeightModeToggle.className = 'building-fab2-width-mode-toggle building-fab2-bay-window-mode-toggle';

                                const topHeightFixedBtn = document.createElement('button');
                                topHeightFixedBtn.type = 'button';
                                topHeightFixedBtn.className = 'building-fab2-width-mode-btn';
                                topHeightFixedBtn.textContent = 'Fixed';
                                topHeightFixedBtn.disabled = !allowBayConfigEdit || !topOpeningEnabled;
                                topHeightFixedBtn.classList.toggle('is-active', topOpeningHeightMode === OPENING_HEIGHT_MODE.FIXED);
                                topHeightFixedBtn.addEventListener('click', () => {
                                    if (!allowBayConfigEdit || !topOpeningEnabled || topOpeningHeightMode === OPENING_HEIGHT_MODE.FIXED) return;
                                    this.onSetBayTopWindowHeightMode?.(layerId, configFaceId, bayId, OPENING_HEIGHT_MODE.FIXED);
                                });
                                topHeightModeToggle.appendChild(topHeightFixedBtn);

                                const topHeightFullBtn = document.createElement('button');
                                topHeightFullBtn.type = 'button';
                                topHeightFullBtn.className = 'building-fab2-width-mode-btn';
                                topHeightFullBtn.textContent = 'Full Height';
                                topHeightFullBtn.disabled = !allowBayConfigEdit || !topOpeningEnabled;
                                topHeightFullBtn.classList.toggle('is-active', topOpeningHeightMode === OPENING_HEIGHT_MODE.FULL);
                                topHeightFullBtn.addEventListener('click', () => {
                                    if (!allowBayConfigEdit || !topOpeningEnabled || topOpeningHeightMode === OPENING_HEIGHT_MODE.FULL) return;
                                    this.onSetBayTopWindowHeightMode?.(layerId, configFaceId, bayId, OPENING_HEIGHT_MODE.FULL);
                                });
                                topHeightModeToggle.appendChild(topHeightFullBtn);
                                topHeightModeControls.appendChild(topHeightModeToggle);
                                topHeightModeRow.appendChild(topHeightModeLabel);
                                topHeightModeRow.appendChild(topHeightModeControls);
                                topOpeningDetails.appendChild(topHeightModeRow);

                                const topHeightRow = createRangeRow('Top window height');
                                topHeightRow.row.classList.add('building-fab2-bay-window-range-row');
                                topHeightRow.range.min = '0.1';
                                topHeightRow.range.max = '12';
                                topHeightRow.range.step = '0.01';
                                topHeightRow.number.min = '0.1';
                                topHeightRow.number.step = '0.01';
                                const topHeightDisabled = !allowBayConfigEdit || !topOpeningEnabled || topOpeningHeightMode === OPENING_HEIGHT_MODE.FULL;
                                topHeightRow.range.disabled = topHeightDisabled;
                                topHeightRow.number.disabled = topHeightDisabled;
                                const syncTopHeightValue = (rawValue) => {
                                    const next = Math.max(0.1, Number(rawValue) || 0.1);
                                    topHeightRow.range.value = String(clamp(next, 0.1, 12));
                                    topHeightRow.number.value = next.toFixed(2);
                                };
                                syncTopHeightValue(topOpeningHeightValue);
                                topHeightRow.range.addEventListener('input', () => {
                                    if (topHeightDisabled) return;
                                    const next = Math.max(0.1, Number(topHeightRow.range.value) || 0.1);
                                    syncTopHeightValue(next);
                                    this.onSetBayTopWindowHeight?.(layerId, configFaceId, bayId, next);
                                });
                                topHeightRow.number.addEventListener('input', () => {
                                    if (topHeightDisabled) return;
                                    const next = Number(topHeightRow.number.value);
                                    if (!Number.isFinite(next)) return;
                                    const clampedValue = Math.max(0.1, next);
                                    syncTopHeightValue(clampedValue);
                                    this.onSetBayTopWindowHeight?.(layerId, configFaceId, bayId, clampedValue);
                                });
                                topOpeningDetails.appendChild(topHeightRow.row);

                                const topGapRow = createRangeRow('Top vertical gap');
                                topGapRow.row.classList.add('building-fab2-bay-window-range-row');
                                topGapRow.range.min = '0';
                                topGapRow.range.max = '4';
                                topGapRow.range.step = '0.01';
                                topGapRow.number.min = '0';
                                topGapRow.number.step = '0.01';
                                const topGapDisabled = !allowBayConfigEdit || !topOpeningEnabled;
                                topGapRow.range.disabled = topGapDisabled;
                                topGapRow.number.disabled = topGapDisabled;
                                const syncTopGapValue = (rawValue) => {
                                    const next = Math.max(0, Number(rawValue) || 0);
                                    topGapRow.range.value = String(clamp(next, 0, 4));
                                    topGapRow.number.value = next.toFixed(2);
                                };
                                syncTopGapValue(topOpeningGapValue);
                                topGapRow.range.addEventListener('input', () => {
                                    if (topGapDisabled) return;
                                    const next = Math.max(0, Number(topGapRow.range.value) || 0);
                                    syncTopGapValue(next);
                                    this.onSetBayTopWindowGap?.(layerId, configFaceId, bayId, next);
                                });
                                topGapRow.number.addEventListener('input', () => {
                                    if (topGapDisabled) return;
                                    const next = Number(topGapRow.number.value);
                                    if (!Number.isFinite(next)) return;
                                    const clampedValue = Math.max(0, next);
                                    syncTopGapValue(clampedValue);
                                    this.onSetBayTopWindowGap?.(layerId, configFaceId, bayId, clampedValue);
                                });
                                topOpeningDetails.appendChild(topGapRow.row);

                                const topFrameWidthRow = document.createElement('div');
                                topFrameWidthRow.className = 'building-fab-row building-fab-row-wide';
                                const topFrameWidthLabel = document.createElement('div');
                                topFrameWidthLabel.className = 'building-fab-row-label';
                                topFrameWidthLabel.textContent = 'Top frame width';
                                const topFrameWidthControls = document.createElement('div');
                                topFrameWidthControls.className = 'building-fab2-bay-width-controls building-fab2-bay-top-frame-controls';
                                const topFrameWidthModeToggle = document.createElement('div');
                                topFrameWidthModeToggle.className = 'building-fab2-width-mode-toggle building-fab2-bay-top-frame-toggle';

                                const topFrameWidthInheritBtn = document.createElement('button');
                                topFrameWidthInheritBtn.type = 'button';
                                topFrameWidthInheritBtn.className = 'building-fab2-width-mode-btn';
                                topFrameWidthInheritBtn.textContent = 'Inherit';
                                topFrameWidthInheritBtn.disabled = !allowBayConfigEdit || !topOpeningEnabled;
                                topFrameWidthInheritBtn.classList.toggle('is-active', !topFrameWidthOverrideEnabled);
                                topFrameWidthInheritBtn.addEventListener('click', () => {
                                    if (!allowBayConfigEdit || !topOpeningEnabled || !topFrameWidthOverrideEnabled) return;
                                    this.onSetBayTopWindowFrameWidth?.(layerId, configFaceId, bayId, Number.NaN);
                                });
                                topFrameWidthModeToggle.appendChild(topFrameWidthInheritBtn);

                                const topFrameWidthOverrideBtn = document.createElement('button');
                                topFrameWidthOverrideBtn.type = 'button';
                                topFrameWidthOverrideBtn.className = 'building-fab2-width-mode-btn';
                                topFrameWidthOverrideBtn.textContent = 'Override';
                                topFrameWidthOverrideBtn.disabled = !allowBayConfigEdit || !topOpeningEnabled;
                                topFrameWidthOverrideBtn.classList.toggle('is-active', topFrameWidthOverrideEnabled);
                                topFrameWidthOverrideBtn.addEventListener('click', () => {
                                    if (!allowBayConfigEdit || !topOpeningEnabled || topFrameWidthOverrideEnabled) return;
                                    this.onSetBayTopWindowFrameWidth?.(layerId, configFaceId, bayId, topFrameWidthInheritedValue);
                                });
                                topFrameWidthModeToggle.appendChild(topFrameWidthOverrideBtn);
                                topFrameWidthControls.appendChild(topFrameWidthModeToggle);

                                const topFrameWidthInput = document.createElement('input');
                                topFrameWidthInput.type = 'number';
                                topFrameWidthInput.className = 'building-fab-number building-fab2-bay-width-input';
                                topFrameWidthInput.min = '0.01';
                                topFrameWidthInput.step = '0.01';
                                topFrameWidthInput.placeholder = '0.08';
                                topFrameWidthInput.disabled = !allowBayConfigEdit || !topOpeningEnabled || !topFrameWidthOverrideEnabled;
                                topFrameWidthInput.value = topFrameWidthDisplayValue;
                                topFrameWidthInput.addEventListener('input', () => {
                                    if (!allowBayConfigEdit || !topOpeningEnabled || !topFrameWidthOverrideEnabled) return;
                                    const raw = Number(topFrameWidthInput.value);
                                    if (!Number.isFinite(raw)) return;
                                    const next = Math.max(0.01, Math.round(Math.max(0.01, raw) * 100) / 100);
                                    this.onSetBayTopWindowFrameWidth?.(layerId, configFaceId, bayId, next);
                                });
                                topFrameWidthInput.addEventListener('blur', () => {
                                    const raw = Number(topFrameWidthInput.value);
                                    if (!Number.isFinite(raw)) {
                                        topFrameWidthInput.value = topFrameWidthDisplayValue;
                                        return;
                                    }
                                    const next = Math.max(0.01, Math.round(Math.max(0.01, raw) * 100) / 100);
                                    topFrameWidthInput.value = next.toFixed(2);
                                });
                                topFrameWidthControls.appendChild(topFrameWidthInput);
                                topFrameWidthRow.appendChild(topFrameWidthLabel);
                                topFrameWidthRow.appendChild(topFrameWidthControls);
                                topOpeningDetails.appendChild(topFrameWidthRow);

                                const topHint = document.createElement('div');
                                topHint.className = 'building-fab2-hint building-fab2-bay-window-details-hint';
                                topHint.textContent = `Top opening type is fixed to Window. Top window width follows the bottom ${openingAssetTypeLower} width.`;
                                topOpeningDetails.appendChild(topHint);

                                topOpeningSection.appendChild(topOpeningDetails);
                            } else if (hasBayOpening) {
                                const topUnsupportedHint = document.createElement('div');
                                topUnsupportedHint.className = 'building-fab2-hint building-fab2-bay-window-details-hint';
                                topUnsupportedHint.textContent = 'Garage openings do not support stacked top windows.';
                                topOpeningSection.appendChild(topUnsupportedHint);
                            }

                            const openingDetailHint = document.createElement('div');
                            openingDetailHint.className = 'building-fab2-hint building-fab2-bay-window-details-hint';
                            const openingRefWidth = Number.isFinite(selectedOpeningDefWidth) ? `${selectedOpeningDefWidth.toFixed(2)}m` : 'n/a';
                            const openingRefHeight = Number.isFinite(selectedOpeningDefHeight) ? `${selectedOpeningDefHeight.toFixed(2)}m` : 'n/a';
                            const requiredText = Number.isFinite(openingRequiredWidth) ? `${openingRequiredWidth.toFixed(2)}m` : 'n/a';
                            openingDetailHint.textContent = `${openingAssetTypeLabel} definition size: ${openingRefWidth} x ${openingRefHeight} · Effective bay min: ${requiredText}`;
                            mainOpeningSection.appendChild(openingDetailHint);

                            openingSection.appendChild(openingDetails);
                            bayBodyContent.appendChild(openingSection);

		                    if (allowBayEdit && !linkedFromBayId) {
		                        const duplicateBtn = document.createElement('button');
		                        duplicateBtn.type = 'button';
		                        duplicateBtn.className = 'building-fab2-btn building-fab2-btn-small building-fab2-btn-wide';
		                        duplicateBtn.textContent = 'Duplicate';
		                        duplicateBtn.addEventListener('click', () => {
		                            this.onDuplicateBay?.(layerId, configFaceId, bayId);
		                            this._renderLayers();
		                        });
		                        editorContent.appendChild(duplicateBtn);
		                    }
		                }

	                baysSection.appendChild(editor);
	                dynamicContent.appendChild(baysSection);

                body.appendChild(dynamicArea);
            } else {
                const hint = document.createElement('div');
                hint.className = 'building-fab2-hint';
                hint.textContent = 'Roof controls coming later.';
                body.appendChild(hint);
            }

	            group.appendChild(header);
	            group.appendChild(body);
	            this.layersList.appendChild(group);
	        }
	    }

    _getFloorLayerFaceState(layerId) {
        const id = typeof layerId === 'string' ? layerId : '';
        const state = this._floorLayerFaceStateById.get(id) ?? null;
        return {
            selectedFaceId: isFaceId(state?.selectedFaceId) ? state.selectedFaceId : null,
            lockedToByFace: normalizeLockedToByFace(state?.lockedToByFace ?? null),
            reverseByFace: normalizeReverseByFace(state?.reverseByFace ?? null)
        };
    }

    _getRelatedFacesForLayer({ selectedFaceId, lockedToByFace }) {
        const out = new Set();
        const selected = isFaceId(selectedFaceId) ? selectedFaceId : null;
        if (!selected) return out;

        const lockedTo = lockedToByFace.get(selected) ?? null;
        const master = lockedTo ?? selected;

        for (const faceId of FACE_IDS) {
            if (faceId === master) out.add(faceId);
            if ((lockedToByFace.get(faceId) ?? null) === master) out.add(faceId);
        }

        return out;
    }

    _getBaySelectionKey(layerId, faceId) {
        const layer = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        if (!layer || !face) return '';
        return `${layer}:${face}`;
    }

    _getSelectedBayId(layerId, faceId) {
        const key = this._getBaySelectionKey(layerId, faceId);
        if (!key) return null;
        const id = this._selectedBayIdByKey.get(key);
        return typeof id === 'string' && id ? id : null;
    }

    _setSelectedBayId(layerId, faceId, bayId) {
        const key = this._getBaySelectionKey(layerId, faceId);
        if (!key) return false;
        const id = typeof bayId === 'string' ? bayId : '';
        if (!id) {
            if (!this._selectedBayIdByKey.has(key)) return false;
            this._selectedBayIdByKey.delete(key);
            return true;
        }
        if (this._selectedBayIdByKey.get(key) === id) return false;
        this._selectedBayIdByKey.set(key, id);
        return true;
    }

    isDecorationLayerPickerOpen() {
        return this.decorationLayerPickerOverlay.isConnected
            && !this.decorationLayerPickerOverlay.classList.contains('hidden');
    }

    openDecorationLayerPicker({ setId = '', layerId = '' } = {}) {
        const id = typeof setId === 'string' ? setId : '';
        if (!id) return false;
        this._decorationLayerPicker = {
            setId: id,
            layerId: typeof layerId === 'string' ? layerId : ''
        };
        if (!this.decorationLayerPickerOverlay.isConnected) document.body.appendChild(this.decorationLayerPickerOverlay);
        this.decorationLayerPickerOverlay.classList.remove('hidden');
        this._renderDecorationLayerPicker();
        this.onHoverLayerTitle?.(this._decorationLayerPicker.layerId || null);
        return true;
    }

    closeDecorationLayerPicker() {
        this._decorationLayerPicker = null;
        this.onHoverLayerTitle?.(null);
        if (!this.decorationLayerPickerOverlay.isConnected) return;
        this.decorationLayerPickerOverlay.classList.add('hidden');
        this.decorationLayerPickerBody.textContent = '';
    }

    _renderDecorationLayerPicker() {
        this.decorationLayerPickerBody.textContent = '';
        const picker = this._decorationLayerPicker;
        if (!picker) return;
        const options = this._resolveDecorationLayerOptions();
        const selectedLayerId = typeof picker.layerId === 'string' ? picker.layerId : '';
        this.decorationLayerPickerTitle.textContent = 'Pick Layer';
        if (!options.length) {
            const hint = document.createElement('div');
            hint.className = 'building-fab2-hint';
            hint.textContent = 'No floor layers available.';
            this.decorationLayerPickerBody.appendChild(hint);
            return;
        }

        const list = document.createElement('div');
        list.className = 'building-fab2-decoration-layer-picker-list';
        this.decorationLayerPickerBody.appendChild(list);
        for (const option of options) {
            const optId = typeof option?.id === 'string' ? option.id : '';
            if (!optId) continue;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab2-decoration-layer-picker-btn';
            btn.textContent = String(option?.label ?? optId);
            btn.classList.toggle('is-active', optId === selectedLayerId);
            btn.disabled = !this._enabled || !this._hasBuilding;
            btn.addEventListener('pointerenter', () => this.onHoverLayerTitle?.(optId));
            btn.addEventListener('pointerleave', () => this.onHoverLayerTitle?.(null));
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                const setId = typeof this._decorationLayerPicker?.setId === 'string' ? this._decorationLayerPicker.setId : '';
                if (!setId) return;
                this.onSetDecorationSetLayer?.(setId, optId);
                this.closeDecorationLayerPicker();
            });
            list.appendChild(btn);
        }
    }

    isLinkPopupOpen() {
        return this.linkOverlay.isConnected && !this.linkOverlay.classList.contains('hidden');
    }

    openLinkPopup({ layerId = null, masterFaceId = null } = {}) {
        const id = typeof layerId === 'string' ? layerId : '';
        const master = isFaceId(masterFaceId) ? masterFaceId : null;
        if (!id || !master) return false;

        this._linkPopup = { target: 'face', layerId: id, masterFaceId: master };
        if (!this.linkOverlay.isConnected) document.body.appendChild(this.linkOverlay);
        this.linkOverlay.classList.remove('hidden');
        this._renderLinkPopup();
        return true;
    }

    openBayLinkPopup({ layerId = null, faceId = null, masterBayId = null } = {}) {
        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        const masterId = typeof masterBayId === 'string' ? masterBayId : '';
        if (!id || !face || !masterId) return false;

        this._linkPopup = { target: 'bay', layerId: id, faceId: face, masterBayId: masterId };
        if (!this.linkOverlay.isConnected) document.body.appendChild(this.linkOverlay);
        this.linkOverlay.classList.remove('hidden');
        this._renderLinkPopup();
        return true;
    }

    closeLinkPopup() {
        this._linkPopup = null;
        if (!this.linkOverlay.isConnected) return;
        this.linkOverlay.classList.add('hidden');
        this.linkBody.textContent = '';
    }

    isGroupingPanelOpen() {
        return this.groupOverlay.isConnected && !this.groupOverlay.classList.contains('hidden');
    }

    openGroupingPanel({ layerId = null, faceId = null } = {}) {
        const id = typeof layerId === 'string' ? layerId : '';
        const face = isFaceId(faceId) ? faceId : null;
        if (!id || !face) return false;

        this._groupPopup = { layerId: id, faceId: face, createMode: false, createStart: null, createEnd: null };
        if (!this.groupOverlay.isConnected) document.body.appendChild(this.groupOverlay);
        this.groupOverlay.classList.remove('hidden');
        this._renderGroupingPanel();
        return true;
    }

    closeGroupingPanel() {
        this._groupPopup = null;
        if (!this.groupOverlay.isConnected) return;
        this.groupOverlay.classList.add('hidden');
        this.groupBody.textContent = '';
    }

    _renderLinkPopup() {
        this.linkBody.textContent = '';

        const popup = this._linkPopup;
        if (!popup) return;

        if (popup.target === 'bay') {
            this._renderBayLinkPopup(popup);
            return;
        }
        this._renderFaceLinkPopup(popup);
    }

    _renderFaceLinkPopup(popup) {
        const layerId = popup.layerId;
        const masterFaceId = popup.masterFaceId;
        if (!layerId || !isFaceId(masterFaceId)) return;

        this.linkTitle.textContent = `Link faces (master: ${masterFaceId})`;
        this.linkFooter.textContent = 'Select which faces to link to the master face.';

        const faceState = this._getFloorLayerFaceState(layerId);
        const lockedToByFace = faceState.lockedToByFace;
        const reverseByFace = faceState.reverseByFace;

        const grid = document.createElement('div');
        grid.className = 'building-fab2-link-grid';

        for (const faceId of FACE_IDS) {
            const card = document.createElement('div');
            card.className = 'building-fab2-link-face-card';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab2-lock-btn';
            btn.textContent = faceId;
            btn.dataset.faceId = faceId;
            btn.dataset.layerId = layerId;
            btn.dataset.masterFaceId = masterFaceId;

            if (faceId === masterFaceId) {
                btn.disabled = true;
                btn.classList.add('is-active');
            } else {
                btn.disabled = !this._enabled || !this._hasBuilding;
                btn.classList.toggle('is-active', (lockedToByFace.get(faceId) ?? null) === masterFaceId);
            }
            card.appendChild(btn);

            const reverseRow = document.createElement('label');
            reverseRow.className = 'building-fab2-link-face-reverse';
            const reverseInput = document.createElement('input');
            reverseInput.type = 'checkbox';
            reverseInput.dataset.action = 'face-link:reverse';
            reverseInput.dataset.faceId = faceId;
            reverseInput.dataset.layerId = layerId;
            reverseInput.dataset.masterFaceId = masterFaceId;

            const isLinkedToMaster = (lockedToByFace.get(faceId) ?? null) === masterFaceId;
            reverseInput.checked = isLinkedToMaster && !!reverseByFace.get(faceId);
            reverseInput.disabled = faceId === masterFaceId || !this._enabled || !this._hasBuilding || !isLinkedToMaster;

            const reverseText = document.createElement('span');
            reverseText.textContent = 'Reverse';
            reverseRow.appendChild(reverseInput);
            reverseRow.appendChild(reverseText);
            card.appendChild(reverseRow);

            grid.appendChild(card);
        }

        this.linkBody.appendChild(grid);
    }

    _renderBayLinkPopup(popup) {
        const layerId = typeof popup?.layerId === 'string' ? popup.layerId : '';
        const faceId = isFaceId(popup?.faceId) ? popup.faceId : null;
        const masterBayId = typeof popup?.masterBayId === 'string' ? popup.masterBayId : '';
        if (!layerId || !faceId || !masterBayId) return;

        const layerFacades = (this._facadesByLayerId?.[layerId] && typeof this._facadesByLayerId[layerId] === 'object')
            ? this._facadesByLayerId[layerId]
            : null;
        const facade = (layerFacades?.[faceId] && typeof layerFacades[faceId] === 'object')
            ? layerFacades[faceId]
            : null;
        const bays = Array.isArray(facade?.layout?.bays?.items) ? facade.layout.bays.items : [];
        const bayIndexById = new Map(
            bays
                .map((entry, index) => {
                    const bay = entry && typeof entry === 'object' ? entry : null;
                    const id = typeof bay?.id === 'string' ? bay.id : '';
                    return [id, index];
                })
                .filter((entry) => typeof entry[0] === 'string' && entry[0])
        );

        if (!bayIndexById.has(masterBayId)) {
            this.closeLinkPopup();
            return;
        }

        const linkGraph = buildBayLinkGraph(bays);
        const masterIndex = bayIndexById.get(masterBayId);
        const masterLabel = Number.isInteger(masterIndex) ? `Bay ${masterIndex + 1}` : masterBayId;

        this.linkTitle.textContent = `Link bays (master: ${masterLabel})`;
        this.linkFooter.textContent = 'Select bays to link to this master bay. Click a linked bay to unlink it.';

        const layer = this._layers.find((entry) => entry?.type === 'floor' && entry?.id === layerId) ?? null;
        const faceMaterials = layer?.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
        const faceConfig = faceMaterials?.[faceId] && typeof faceMaterials[faceId] === 'object' ? faceMaterials[faceId] : null;
        const faceMaterial = (() => {
            const cfg = faceConfig?.material && typeof faceConfig.material === 'object' ? faceConfig.material : null;
            const kind = cfg?.kind;
            const id = typeof cfg?.id === 'string' ? cfg.id : '';
            if ((kind === 'texture' || kind === 'color') && id) return { kind, id };
            const layerMat = layer?.material && typeof layer.material === 'object' ? layer.material : null;
            const layerKind = layerMat?.kind;
            const layerMaterialId = typeof layerMat?.id === 'string' ? layerMat.id : '';
            if ((layerKind === 'texture' || layerKind === 'color') && layerMaterialId) return { kind: layerKind, id: layerMaterialId };
            const styleId = typeof layer?.style === 'string' && layer.style ? layer.style : 'default';
            return { kind: 'texture', id: styleId };
        })();

        const resolveEffectiveBayMaterial = (bayId) => {
            const id = typeof bayId === 'string' ? bayId : '';
            if (!id) return faceMaterial;
            const rootMasterId = linkGraph.rootMasterByBayId.get(id) ?? id;
            const sourceBay = linkGraph.byId.get(rootMasterId) ?? linkGraph.byId.get(id) ?? null;
            const override = sourceBay?.wallMaterialOverride && typeof sourceBay.wallMaterialOverride === 'object'
                ? sourceBay.wallMaterialOverride
                : null;
            const kind = override?.kind;
            const materialId = typeof override?.id === 'string' ? override.id : '';
            if ((kind === 'texture' || kind === 'color') && materialId) return { kind, id: materialId };
            return faceMaterial;
        };

        const syncMaterialThumb = (thumb, material) => {
            const spec = material && typeof material === 'object' ? material : {};
            const kind = spec.kind === 'color' ? 'color' : 'texture';
            const id = typeof spec.id === 'string' ? spec.id : '';
            if (kind === 'color') {
                const colorOpt = (this._baseWallColorPickerOptions ?? []).find((opt) => opt?.id === `color:${id}`) ?? null;
                setMaterialThumbToColor(thumb, colorOpt?.hex ?? 0xffffff);
                return;
            }
            const texOpt = this._wallTextureDefById.get(id) ?? null;
            setMaterialThumbToTexture(thumb, texOpt?.wallTextureUrl ?? '', texOpt?.label ?? '');
        };

        const list = document.createElement('div');
        list.className = 'building-fab2-link-bay-list';

        for (let i = 0; i < bays.length; i++) {
            const bay = bays[i] && typeof bays[i] === 'object' ? bays[i] : null;
            const bayId = typeof bay?.id === 'string' ? bay.id : '';
            if (!bayId) continue;

            const rootMasterId = linkGraph.rootMasterByBayId.get(bayId) ?? bayId;
            const directMasterId = linkGraph.directMasterByBayId.get(bayId) ?? null;
            const isMaster = bayId === masterBayId;
            const isLinkedToMaster = !isMaster && rootMasterId === masterBayId;
            const groupHue = linkGraph.hueByMasterId.get(rootMasterId) ?? null;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab2-link-bay-btn';
            btn.dataset.layerId = layerId;
            btn.dataset.faceId = faceId;
            btn.dataset.masterBayId = masterBayId;
            btn.dataset.targetBayId = bayId;
            btn.disabled = !this._enabled || !this._hasBuilding || isMaster;
            btn.classList.toggle('is-master', isMaster);
            btn.classList.toggle('is-active', isLinkedToMaster);
            if (Number.isFinite(groupHue)) {
                btn.style.setProperty('--building-fab2-bay-link-hue', String(groupHue));
                btn.classList.add(rootMasterId === bayId ? 'is-link-master' : 'is-link-slave');
            }

            const thumb = document.createElement('div');
            thumb.className = 'building-fab-material-thumb building-fab2-link-bay-thumb';
            syncMaterialThumb(thumb, resolveEffectiveBayMaterial(bayId));

            const meta = document.createElement('div');
            meta.className = 'building-fab2-link-bay-meta';
            const title = document.createElement('div');
            title.className = 'building-fab2-link-bay-title';
            title.textContent = `Bay ${i + 1}`;
            const status = document.createElement('div');
            status.className = 'building-fab2-link-bay-status';

            if (isMaster) {
                status.textContent = 'Master';
            } else if (isLinkedToMaster) {
                status.textContent = 'Linked';
            } else if (directMasterId) {
                const linkedIndex = bayIndexById.get(directMasterId);
                status.textContent = Number.isInteger(linkedIndex) ? `Linked to Bay ${linkedIndex + 1}` : 'Linked';
            } else {
                status.textContent = 'Independent';
            }

            meta.appendChild(title);
            meta.appendChild(status);

            const iconName = isLinkedToMaster ? 'link_off' : 'link';
            const toggleIcon = createMaterialSymbolIcon(iconName, { size: 'sm' });
            toggleIcon.classList.add('building-fab2-link-bay-icon');

            btn.appendChild(thumb);
            btn.appendChild(meta);
            btn.appendChild(toggleIcon);
            list.appendChild(btn);
        }

        this.linkBody.appendChild(list);
    }

    _renderGroupingPanel() {
        this.groupBody.textContent = '';

        const popup = this._groupPopup;
        if (!popup) return;

        const layerId = popup.layerId;
        const faceId = popup.faceId;
        this.groupTitle.textContent = `Grouping · Face ${faceId}`;

        const layerFacades = (this._facadesByLayerId?.[layerId] && typeof this._facadesByLayerId[layerId] === 'object')
            ? this._facadesByLayerId[layerId]
            : null;
        const facade = (layerFacades?.[faceId] && typeof layerFacades[faceId] === 'object')
            ? layerFacades[faceId]
            : null;
        const bays = Array.isArray(facade?.layout?.bays?.items) ? facade.layout.bays.items : [];
        const groups = Array.isArray(facade?.layout?.groups?.items) ? facade.layout.groups.items : [];

        const groupBayIds = new Set();
        for (const group of groups) {
            const ids = Array.isArray(group?.bayIds) ? group.bayIds : [];
            for (const bid of ids) if (typeof bid === 'string' && bid) groupBayIds.add(bid);
        }

        const baysTitle = document.createElement('div');
        baysTitle.className = 'building-fab2-subtitle';
        baysTitle.textContent = 'Bays';
        this.groupBody.appendChild(baysTitle);

        const bayList = document.createElement('div');
        bayList.className = 'building-fab2-group-bay-list';
        this.groupBody.appendChild(bayList);

        const start = Number.isInteger(popup.createStart) ? popup.createStart : null;
        const end = Number.isInteger(popup.createEnd) ? popup.createEnd : null;
        const min = start !== null && end !== null ? Math.min(start, end) : null;
        const max = start !== null && end !== null ? Math.max(start, end) : null;

        for (let i = 0; i < bays.length; i++) {
            const bay = bays[i] && typeof bays[i] === 'object' ? bays[i] : null;
            const bayId = typeof bay?.id === 'string' ? bay.id : '';
            if (!bayId) continue;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab2-group-bay';
            btn.dataset.action = 'group:selectBay';
            btn.dataset.bayIndex = String(i);
            btn.dataset.bayId = bayId;
            btn.disabled = !this._enabled || !this._hasBuilding || (!!popup.createMode && groupBayIds.has(bayId));
            btn.classList.toggle('is-grouped', groupBayIds.has(bayId));

            const inRange = min !== null && max !== null && i >= min && i <= max;
            btn.classList.toggle('is-selected', !!popup.createMode && inRange);

            btn.textContent = String(i + 1);
            bayList.appendChild(btn);
        }

        const groupsTitle = document.createElement('div');
        groupsTitle.className = 'building-fab2-subtitle';
        groupsTitle.textContent = 'Groups';
        this.groupBody.appendChild(groupsTitle);

        const groupList = document.createElement('div');
        groupList.className = 'building-fab2-group-list';
        this.groupBody.appendChild(groupList);

        if (!groups.length) {
            const empty = document.createElement('div');
            empty.className = 'building-fab2-hint';
            empty.textContent = 'No groups yet.';
            groupList.appendChild(empty);
        } else {
            for (const group of groups) {
                const gid = typeof group?.id === 'string' ? group.id : '';
                if (!gid) continue;
                const ids = Array.isArray(group?.bayIds) ? group.bayIds : [];
                const indices = ids
                    .map((bid) => bays.findIndex((b) => (b && typeof b === 'object' ? b.id : '') === bid))
                    .filter((idx) => idx >= 0)
                    .sort((a, b) => a - b);
                const label = indices.length
                    ? (indices.length === 1 ? `Bay ${indices[0] + 1}` : `Bays ${indices[0] + 1}–${indices[indices.length - 1] + 1}`)
                    : 'Invalid group';

                const row = document.createElement('div');
                row.className = 'building-fab2-group-row';

                const name = document.createElement('div');
                name.className = 'building-fab2-group-row-name';
                name.textContent = gid;

                const meta = document.createElement('div');
                meta.className = 'building-fab2-group-row-meta';
                meta.textContent = label;

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'building-fab2-icon-btn';
                applyMaterialSymbolToButton(removeBtn, { name: 'delete', label: 'Remove group', size: 'sm' });
                removeBtn.dataset.action = 'group:remove';
                removeBtn.dataset.groupId = gid;
                removeBtn.disabled = !this._enabled || !this._hasBuilding;

                row.appendChild(name);
                row.appendChild(meta);
                row.appendChild(removeBtn);
                groupList.appendChild(row);
            }
        }

        const actions = document.createElement('div');
        actions.className = 'building-fab2-group-actions';
        this.groupBody.appendChild(actions);

        if (!popup.createMode) {
            const createBtn = document.createElement('button');
            createBtn.type = 'button';
            createBtn.className = 'building-fab2-btn building-fab2-btn-small';
            createBtn.textContent = 'Create group';
            createBtn.dataset.action = 'group:startCreate';
            createBtn.disabled = !this._enabled || !this._hasBuilding || bays.length < 2;
            actions.appendChild(createBtn);
            return;
        }

        const hint = document.createElement('div');
        hint.className = 'building-fab2-hint';
        hint.textContent = 'Select a contiguous range of bays.';
        actions.appendChild(hint);

        const footer = document.createElement('div');
        footer.className = 'building-fab2-group-create-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'building-fab2-btn building-fab2-btn-small';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.dataset.action = 'group:cancelCreate';

        const doneBtn = document.createElement('button');
        doneBtn.type = 'button';
        doneBtn.className = 'building-fab2-btn building-fab2-btn-small';
        doneBtn.textContent = 'Done';
        doneBtn.dataset.action = 'group:doneCreate';

        const selection = (min !== null && max !== null)
            ? bays.slice(min, max + 1).map((b) => (b && typeof b === 'object' ? b.id : '')).filter(Boolean)
            : [];
        const hasOverlap = selection.some((bid) => groupBayIds.has(bid));
        doneBtn.disabled = !(selection.length >= 2 && !hasOverlap);

        footer.appendChild(cancelBtn);
        footer.appendChild(doneBtn);
        actions.appendChild(footer);
    }

    _handleLoadOverlayClick(e) {
        if (e?.target === this.loadOverlay) this.closeLoadBrowser();
    }

    _handleLinkOverlayClick(e) {
        if (e?.target === this.linkOverlay) this.closeLinkPopup();
    }

    _handleGroupOverlayClick(e) {
        if (e?.target === this.groupOverlay) this.closeGroupingPanel();
    }

    _handleDecorationLayerPickerOverlayClick(e) {
        if (e?.target === this.decorationLayerPickerOverlay) this.closeDecorationLayerPicker();
    }

    _handleLinkBodyChange(e) {
        const reverseInput = e?.target?.closest?.('input[data-action=\"face-link:reverse\"]');
        if (!reverseInput || !this.linkBody.contains(reverseInput) || reverseInput.disabled) return;
        const layerId = reverseInput.dataset?.layerId ?? '';
        const masterFaceId = reverseInput.dataset?.masterFaceId ?? null;
        const targetFaceId = reverseInput.dataset?.faceId ?? null;
        if (!layerId || !isFaceId(masterFaceId) || !isFaceId(targetFaceId) || targetFaceId === masterFaceId) return;
        this.onSetFaceLockReverse?.(layerId, masterFaceId, targetFaceId, !!reverseInput.checked);
    }

    _handleLinkBodyClick(e) {
        const btn = e?.target?.closest?.('button');
        if (!btn || !this.linkBody.contains(btn)) return;
        if (btn.disabled) return;
        const popup = this._linkPopup;
        if (popup?.target === 'bay') {
            const layerId = btn.dataset?.layerId ?? '';
            const faceId = btn.dataset?.faceId ?? null;
            const masterBayId = btn.dataset?.masterBayId ?? '';
            const targetBayId = btn.dataset?.targetBayId ?? '';
            if (!layerId || !isFaceId(faceId) || !masterBayId || !targetBayId || targetBayId === masterBayId) return;
            const nextMaster = btn.classList.contains('is-active') ? null : masterBayId;
            this.onSetBayLink?.(layerId, faceId, targetBayId, nextMaster);
            return;
        }

        const layerId = btn.dataset?.layerId ?? '';
        const masterFaceId = btn.dataset?.masterFaceId ?? null;
        const targetFaceId = btn.dataset?.faceId ?? null;
        if (!layerId || !isFaceId(masterFaceId) || !isFaceId(targetFaceId)) return;
        this.onToggleFaceLock?.(layerId, masterFaceId, targetFaceId);
    }

    _handleGroupBodyClick(e) {
        const btn = e?.target?.closest?.('button');
        if (!btn || !this.groupBody.contains(btn)) return;
        if (btn.disabled) return;

        const popup = this._groupPopup;
        if (!popup) return;

        const layerId = popup.layerId;
        const faceId = popup.faceId;
        const action = btn.dataset?.action ?? '';

        if (action === 'group:startCreate') {
            popup.createMode = true;
            popup.createStart = null;
            popup.createEnd = null;
            this._renderGroupingPanel();
            return;
        }

        if (action === 'group:cancelCreate') {
            popup.createMode = false;
            popup.createStart = null;
            popup.createEnd = null;
            this._renderGroupingPanel();
            return;
        }

        if (action === 'group:selectBay') {
            if (!popup.createMode) return;
            const idx = Number(btn.dataset?.bayIndex);
            if (!Number.isInteger(idx)) return;
            if (popup.createStart === null) {
                popup.createStart = idx;
                popup.createEnd = idx;
            } else {
                popup.createEnd = idx;
            }
            this._renderGroupingPanel();
            return;
        }

        if (action === 'group:doneCreate') {
            if (!popup.createMode) return;

            const layerFacades = (this._facadesByLayerId?.[layerId] && typeof this._facadesByLayerId[layerId] === 'object')
                ? this._facadesByLayerId[layerId]
                : null;
            const facade = (layerFacades?.[faceId] && typeof layerFacades[faceId] === 'object')
                ? layerFacades[faceId]
                : null;
            const bays = Array.isArray(facade?.layout?.bays?.items) ? facade.layout.bays.items : [];
            const groups = Array.isArray(facade?.layout?.groups?.items) ? facade.layout.groups.items : [];

            const groupBayIds = new Set();
            for (const group of groups) {
                const ids = Array.isArray(group?.bayIds) ? group.bayIds : [];
                for (const bid of ids) if (typeof bid === 'string' && bid) groupBayIds.add(bid);
            }

            const start = Number.isInteger(popup.createStart) ? popup.createStart : null;
            const end = Number.isInteger(popup.createEnd) ? popup.createEnd : null;
            const min = start !== null && end !== null ? Math.min(start, end) : null;
            const max = start !== null && end !== null ? Math.max(start, end) : null;
            const selection = (min !== null && max !== null)
                ? bays.slice(min, max + 1).map((b) => (b && typeof b === 'object' ? b.id : '')).filter(Boolean)
                : [];

            const hasOverlap = selection.some((bid) => groupBayIds.has(bid));
            if (selection.length >= 2 && !hasOverlap) {
                this.onCreateBayGroup?.(layerId, faceId, selection);
            }

            popup.createMode = false;
            popup.createStart = null;
            popup.createEnd = null;
            this._renderGroupingPanel();
            return;
        }

        if (action === 'group:remove') {
            const gid = btn.dataset?.groupId ?? '';
            if (!gid) return;
            this.onRemoveBayGroup?.(layerId, faceId, gid);
            this._renderGroupingPanel();
        }
    }

    _handleThumbGridClick(e) {
        const btn = e?.target?.closest?.('button');
        if (!btn || !this.thumbGrid.contains(btn)) return;
        if (btn.disabled) return;
        const id = btn.dataset?.configId ?? '';
        if (!id) return;
        this.onSelectCatalogEntry?.(id);
    }

    _setPage(page) {
        const totalPages = Math.max(1, Math.ceil(this._catalogEntries.length / PAGE_SIZE));
        const next = Math.max(0, Math.min(totalPages - 1, Math.floor(Number(page) || 0)));
        if (next === this._page && this.thumbGrid.childElementCount) return;
        this._page = next;
        this._renderLoadGrid();
    }

    _renderLoadGrid() {
        const entries = this._catalogEntries;
        const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
        const page = Math.max(0, Math.min(totalPages - 1, this._page));
        const start = page * PAGE_SIZE;
        const slice = entries.slice(start, start + PAGE_SIZE);

        this.prevPageBtn.disabled = page <= 0;
        this.nextPageBtn.disabled = page >= totalPages - 1;
        this.pageIndicator.textContent = entries.length ? `Page ${page + 1} / ${totalPages}` : 'No configs found.';

        this.thumbGrid.textContent = '';

        for (const entry of slice) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab2-thumb';
            btn.dataset.configId = entry.id;

            const thumb = document.createElement('div');
            thumb.className = 'building-fab2-thumb-image';

            const url = this._thumbById.get(entry.id) ?? null;
            if (url) {
                const img = document.createElement('img');
                img.className = 'building-fab2-thumb-img';
                img.alt = entry.name || entry.id;
                img.loading = 'lazy';
                img.src = url;
                thumb.classList.add('has-image');
                thumb.appendChild(img);
            } else {
                thumb.textContent = 'Rendering…';
            }

            const label = document.createElement('div');
            label.className = 'building-fab2-thumb-label';
            label.textContent = entry.name || entry.id;

            btn.appendChild(thumb);
            btn.appendChild(label);
            this.thumbGrid.appendChild(btn);
        }
    }
}
