// src/graphics/gui/building_fabrication2/BuildingFabrication2UI.js
// Builds the HUD controls for Building Fabrication 2.

import { getBeltCourseColorOptions } from '../../../app/buildings/BeltCourseColor.js';
import { resolveBuildingStylePbrMaterialId } from '../../content3d/catalogs/BuildingStyleCatalog.js';
import { getPbrMaterialClassSectionsForBuildings } from '../../assets3d/materials/PbrMaterialCatalog.js';
import { appendMaterialVariationLayerUI } from '../building_fabrication/MaterialVariationLayerUI.js';
import { createTextureTilingMiniController } from '../building_fabrication/mini_controllers/TextureTilingMiniController.js';
import { createDetailsSection, createHint, createRangeRow } from '../building_fabrication/mini_controllers/UiMiniControlPrimitives.js';
import { applyMaterialSymbolToButton, createMaterialSymbolIcon } from '../shared/materialSymbols.js';
import { MaterialPickerPopupController } from '../shared/material_picker/MaterialPickerPopupController.js';
import { createMaterialPickerRowController } from '../shared/material_picker/MaterialPickerRowController.js';
import { setMaterialThumbToColor, setMaterialThumbToTexture } from '../shared/material_picker/materialThumb.js';

const PAGE_SIZE = 6;
const FACE_IDS = Object.freeze(['A', 'B', 'C', 'D']);

const FLOOR_COUNT_MIN = 1;
const FLOOR_COUNT_MAX = 30;
const FLOOR_HEIGHT_MIN = 1.0;
const FLOOR_HEIGHT_MAX = 12.0;

const BAY_DEPTH_MIN_M = -2.0;
const BAY_DEPTH_MAX_M = 2.0;
const BAY_DEPTH_STEP_M = 0.05;

const BAY_GROUP_CONNECTOR_HALF_GAP_PX = 5;
const BAY_GROUP_CONNECTOR_STRIP_HEIGHT_PX = 14;
const BAY_GROUP_CONNECTOR_LEVEL_SPACING_PX = 4;
const BAY_GROUP_CONNECTOR_LEVEL_TOP_PADDING_PX = 2;
const BAY_GROUP_CONNECTOR_MAX_LEVELS = 3;

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

        const hideFaceToggle = makeViewToggle('Hide face mark in view');
        this.hideFaceMarkToggle = hideFaceToggle.toggle;
        this.hideFaceMarkToggleInput = hideFaceToggle.input;

        const dummyToggle = makeViewToggle('Show dummy');
        this.showDummyToggle = dummyToggle.toggle;
        this.showDummyToggleInput = dummyToggle.input;

        this.viewToggles.appendChild(this.hideFaceMarkToggle);
        this.viewToggles.appendChild(this.showDummyToggle);

        this.viewPanel.appendChild(this.viewTitle);
        this.viewPanel.appendChild(this.viewModes);
        this.viewPanel.appendChild(this.viewToggles);

        this.rightEmptyHint = document.createElement('div');
        this.rightEmptyHint.className = 'building-fab2-hint building-fab2-right-hint';
        this.rightEmptyHint.textContent = 'Empty state: create a building to edit layers and faces.';

        this.addFloorBtn = document.createElement('button');
        this.addFloorBtn.type = 'button';
        this.addFloorBtn.className = 'building-fab2-btn building-fab2-btn-small';
        this.addFloorBtn.textContent = '+ Floor';

        this.addRoofBtn = document.createElement('button');
        this.addRoofBtn.type = 'button';
        this.addRoofBtn.className = 'building-fab2-btn building-fab2-btn-small';
        this.addRoofBtn.textContent = '+ Roof';

        this.adjustLayoutBtn = document.createElement('button');
        this.adjustLayoutBtn.type = 'button';
        this.adjustLayoutBtn.className = 'building-fab2-icon-btn building-fab2-right-action-layout-btn';
        this.adjustLayoutBtn.title = 'Adjust Layout';
        this.adjustLayoutBtn.setAttribute('aria-label', 'Adjust Layout');
        this.adjustLayoutBtn.appendChild(createMaterialSymbolIcon('open_with', { size: 'sm' }));
        this.adjustLayoutBtnLabel = document.createElement('span');
        this.adjustLayoutBtnLabel.className = 'building-fab2-right-action-layout-label';
        this.adjustLayoutBtnLabel.textContent = 'Adjust Layout';
        this.adjustLayoutBtn.appendChild(this.adjustLayoutBtnLabel);

        this.rightActions = document.createElement('div');
        this.rightActions.className = 'building-fab2-right-actions';
        this.rightActions.appendChild(this.addFloorBtn);
        this.rightActions.appendChild(this.addRoofBtn);
        this.rightActions.appendChild(this.adjustLayoutBtn);

        this.layersList = document.createElement('div');
        this.layersList.className = 'building-fab2-layer-list';

        this.rightPanel.appendChild(this.rightEmptyHint);
        this.rightPanel.appendChild(this.rightActions);
        this.rightPanel.appendChild(this.layersList);

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
        this.linkFooter.textContent = 'Select which faces to link to the master face.';

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

        this._bound = false;
        this._enabled = true;
        this._hasBuilding = false;
        this._viewMode = 'mesh';
        this._hideFaceMarkEnabled = false;
        this._showDummyEnabled = false;
        this._rulerEnabled = false;
        this._layoutAdjustEnabled = false;
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

        this.onCreateBuilding = null;
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
        this.onViewModeChange = null;
        this.onHideFaceMarkChange = null;
        this.onShowDummyChange = null;
        this.onRulerToggle = null;
        this.onAdjustLayoutToggle = null;
        this.onSelectCatalogEntry = null;

        this.onAddFloorLayer = null;
        this.onAddRoofLayer = null;
        this.onMoveLayer = null;
        this.onDeleteLayer = null;
        this.onSelectFace = null;
        this.onToggleFaceLock = null;
        this.onHoverLayer = null;
        this.onHoverLayerTitle = null;
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
	        this.onSetBayWindowMinWidth = null;
	        this.onSetBayWindowMaxWidth = null;
	        this.onSetBayWindowPadding = null;
	        this.onToggleBayWindowPaddingLink = null;

        this._onCreateClick = () => this.onCreateBuilding?.();
        this._onLoadClick = () => this.onRequestLoad?.();
        this._onExportClick = () => this.onRequestExport?.();
        this._onResetClick = () => this.onReset?.();
        this._onCloseMaterialPanelClick = () => this.closeSidePanel();
        this._onSideHandleClick = () => this._toggleBuildingPanelExpanded();
        this._onViewModesClick = (e) => this._handleViewModeClick(e);
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

        this._onOverlayClick = (e) => this._handleLoadOverlayClick(e);
        this._onCloseLoad = () => this.closeLoadBrowser();
        this._onPrevPage = () => this._setPage(this._page - 1);
        this._onNextPage = () => this._setPage(this._page + 1);
        this._onThumbGridClick = (e) => this._handleThumbGridClick(e);

        this._onGroupOverlayClick = (e) => this._handleGroupOverlayClick(e);
        this._onCloseGrouping = () => this.closeGroupingPanel();
        this._onGroupBodyClick = (e) => this._handleGroupBodyClick(e);

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
        this.closeSidePanel();
        this._materialPickerPopup?.dispose?.();
        this._unbind();
        if (this.loadOverlay.isConnected) this.loadOverlay.remove();
        if (this.linkOverlay.isConnected) this.linkOverlay.remove();
        if (this.groupOverlay.isConnected) this.groupOverlay.remove();
        if (this.root.isConnected) this.root.remove();
    }

    setEnabled(enabled) {
        this._enabled = !!enabled;
        this._syncControls();
        this._renderLayers();
        if (this._activeSidePanel === 'material') this._renderMaterialPanel();
        if (this.isLinkPopupOpen()) this._renderLinkPopup();
    }

    setViewToggles({ hideFaceMarkEnabled = null, showDummyEnabled = null } = {}) {
        if (hideFaceMarkEnabled !== null) this._hideFaceMarkEnabled = !!hideFaceMarkEnabled;
        if (showDummyEnabled !== null) this._showDummyEnabled = !!showDummyEnabled;
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
            this.closeSidePanel();
            this._layoutAdjustEnabled = false;
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
        this._syncControls();
    }

    setFloorLayerFaceStates(faceStateByLayerId) {
        const next = new Map();
        if (faceStateByLayerId instanceof Map) {
            for (const [layerId, state] of faceStateByLayerId.entries()) {
                if (typeof layerId !== 'string' || !layerId) continue;
                next.set(layerId, {
                    selectedFaceId: isFaceId(state?.selectedFaceId) ? state.selectedFaceId : null,
                    lockedToByFace: normalizeLockedToByFace(state?.lockedToByFace ?? null)
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
        this._buildingPanelExpanded = false;
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

        const scopeKey = (layerId && masterFaceId)
            ? (target === 'bay' && bayId ? `bf2:mat:${layerId}:face:${masterFaceId}:bay:${bayId}` : `bf2:mat:${layerId}:face:${masterFaceId}`)
            : 'bf2:mat:none';
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

        const base = createDetailsSection('Base material', { open: true, key: `${scopeKey}:base`, detailsOpenByKey: this._materialPanelDetailsOpenByKey });
        if (!allowEdit) {
            base.body.appendChild(createHint(hintText));
            sections.appendChild(base.details);
        } else {
            if (target !== 'bay') cfg.wallBase ??= { tintHex: 0xffffff, roughness: 0.85, normalStrength: 0.9 };

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

            if (target === 'bay') {
                const bayCfg = cfg;
                const allowBayEdit = allowEdit && !linkedFromBayId;

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

                const resolveMasterFaceMaterial = () => {
                    const raw = faceCfgForBay?.material && typeof faceCfgForBay.material === 'object' ? faceCfgForBay.material : null;
                    const kind = raw?.kind;
                    const id = typeof raw?.id === 'string' ? raw.id : '';
                    if ((kind === 'texture' || kind === 'color') && id) {
                        if (kind === 'texture') return { kind, id: normalizeWallTextureId(id) };
                        return { kind, id };
                    }
                    return resolveLayerMaterial();
                };

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
                                const inherited = resolveMasterFaceMaterial();
                                const matchesInherited = !!inherited && inherited.kind === next.kind && inherited.id === next.id;
                                bayCfg.wallMaterialOverride = matchesInherited ? null : next;
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
                base.body.appendChild(bayMaterialPicker.row);

                if (resolveBayOverrideMaterial()) {
                    const clearBtn = document.createElement('button');
                    clearBtn.type = 'button';
                    clearBtn.className = 'building-fab2-btn building-fab2-btn-full';
                    clearBtn.textContent = 'Clear bay override';
                    clearBtn.addEventListener('click', () => {
                        if (!allowBayEdit) return;
                        if (bayCfg.wallMaterialOverride === null || bayCfg.wallMaterialOverride === undefined) return;
                        bayCfg.wallMaterialOverride = null;
                        syncBayPicker();
                        onChange();
                        this.onMaterialConfigRequestUiSync?.();
                        this._renderMaterialPanel();
                    });
                    base.body.appendChild(clearBtn);
                }

                base.body.appendChild(createHint('These controls affect the bay wall surface (before material variation).'));

                const resolveEffectiveWallBase = () => {
                    const src = (bayCfg?.wallBase && typeof bayCfg.wallBase === 'object')
                        ? bayCfg.wallBase
                        : ((faceCfgForBay?.wallBase && typeof faceCfgForBay.wallBase === 'object')
                            ? faceCfgForBay.wallBase
                            : ((layer?.wallBase && typeof layer.wallBase === 'object') ? layer.wallBase : null));
                    const tintRaw = src?.tintHex ?? src?.tint ?? 0xffffff;
                    const tintHex = Number.isFinite(tintRaw) ? ((Number(tintRaw) >>> 0) & 0xffffff) : 0xffffff;
                    const roughness = clamp(src?.roughness ?? 0.85, 0.0, 1.0);
                    const normalStrength = clamp(src?.normalStrength ?? 0.9, 0.0, 2.0);
                    return { tintHex, roughness, normalStrength };
                };

                const wallBaseProxy = resolveEffectiveWallBase();
                const commitWallBase = () => {
                    if (!allowBayEdit) return;
                    bayCfg.wallBase = {
                        tintHex: (Number(wallBaseProxy.tintHex) >>> 0) & 0xffffff,
                        roughness: clamp(wallBaseProxy.roughness, 0.0, 1.0),
                        normalStrength: clamp(wallBaseProxy.normalStrength, 0.0, 2.0)
                    };
                    onChange();
                };

                const tintPicker = createMaterialPickerRowController({
                    label: 'Wall albedo tint',
                    disabled: !allowBayEdit,
                    onPick: () => {
                        const currentMat = resolveEffectiveBayMaterial();
                        if (currentMat?.kind === 'color') return;

                        const options = [
                            { id: 'tint:white', label: 'White (no tint)', kind: 'color', hex: 0xffffff },
                            ...this._baseWallColorPickerOptions
                                .filter((opt) => opt && opt.kind === 'color' && Number.isFinite(opt.hex))
                                .map((opt) => ({ id: `tint:${opt.id}`, label: opt.label, kind: 'color', hex: opt.hex }))
                        ];

                        const tintHex = Number.isFinite(wallBaseProxy.tintHex) ? ((Number(wallBaseProxy.tintHex) >>> 0) & 0xffffff) : 0xffffff;
                        const selectedId = options.find((o) => o?.hex === tintHex)?.id ?? null;

                        this._materialPickerPopup.open({
                            title: 'Wall albedo tint',
                            sections: [{ label: 'Colors', options }],
                            selectedId,
                            onSelect: (opt) => {
                                const hex = Number(opt?.hex);
                                if (!Number.isFinite(hex)) return;
                                wallBaseProxy.tintHex = (hex >>> 0) & 0xffffff;
                                commitWallBase();
                                syncTint();
                            }
                        });
                    }
                });

                const syncTint = () => {
                    const textured = resolveEffectiveBayMaterial()?.kind !== 'color';
                    tintPicker.button.disabled = !allowBayEdit || !textured;

                    const tintHex = Number.isFinite(wallBaseProxy.tintHex) ? ((Number(wallBaseProxy.tintHex) >>> 0) & 0xffffff) : 0xffffff;
                    const label = [
                        { label: 'White (no tint)', hex: 0xffffff },
                        ...(this._baseWallColorPickerOptions ?? []).filter((o) => Number.isFinite(o?.hex)).map((o) => ({ label: o.label, hex: o.hex }))
                    ].find((o) => o?.hex === tintHex)?.label ?? `#${tintHex.toString(16).padStart(6, '0')}`;
                    tintPicker.text.textContent = label;
                    setMaterialThumbToColor(tintPicker.thumb, tintHex);
                };

                syncTint();
                base.body.appendChild(tintPicker.row);

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
                base.body.appendChild(roughRow.row);
                base.body.appendChild(normalRow.row);

                sections.appendChild(base.details);
            }

            if (target !== 'bay') {
                const resolveFaceMaterial = () => {
                    const raw = cfg?.material && typeof cfg.material === 'object' ? cfg.material : null;
                    const kind = raw?.kind;
                    const id = typeof raw?.id === 'string' ? raw.id : '';
                    if ((kind === 'texture' || kind === 'color') && id) {
                        if (kind === 'texture') return { kind, id: normalizeWallTextureId(id) };
                        return { kind, id };
                    }

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
                                syncMaterialPicker(wallMaterialPicker, cfg.material);
                                onChange();
                                this.onMaterialConfigRequestUiSync?.();
                                this._renderMaterialPanel();
                            }
                        });
                    }
                });

                syncMaterialPicker(wallMaterialPicker, resolveFaceMaterial());
                base.body.appendChild(wallMaterialPicker.row);

                base.body.appendChild(createHint('These controls affect the full wall surface (before material variation).'));

            const tintPicker = createMaterialPickerRowController({
                label: 'Wall albedo tint',
                disabled: !allowEdit,
                onPick: () => {
                    const currentMat = resolveFaceMaterial();
                    if (currentMat?.kind === 'color') return;

                    const options = [
                        { id: 'tint:white', label: 'White (no tint)', kind: 'color', hex: 0xffffff },
                        ...this._baseWallColorPickerOptions
                            .filter((opt) => opt && opt.kind === 'color' && Number.isFinite(opt.hex))
                            .map((opt) => ({ id: `tint:${opt.id}`, label: opt.label, kind: 'color', hex: opt.hex }))
                    ];

                    const tintHex = Number.isFinite(cfg.wallBase?.tintHex) ? ((Number(cfg.wallBase.tintHex) >>> 0) & 0xffffff) : 0xffffff;
                    const selectedId = options.find((o) => o?.hex === tintHex)?.id ?? null;

                    this._materialPickerPopup.open({
                        title: 'Wall albedo tint',
                        sections: [{ label: 'Colors', options }],
                        selectedId,
                        onSelect: (opt) => {
                            const hex = Number(opt?.hex);
                            if (!Number.isFinite(hex)) return;
                            cfg.wallBase.tintHex = (hex >>> 0) & 0xffffff;
                            syncTint();
                            onChange();
                        }
                    });
                }
            });

            const syncTint = () => {
                const textured = resolveFaceMaterial()?.kind !== 'color';
                tintPicker.button.disabled = !allowEdit || !textured;

                const tintHex = Number.isFinite(cfg.wallBase?.tintHex) ? ((Number(cfg.wallBase.tintHex) >>> 0) & 0xffffff) : 0xffffff;
                const label = [
                    { label: 'White (no tint)', hex: 0xffffff },
                    ...(this._baseWallColorPickerOptions ?? []).filter((o) => Number.isFinite(o?.hex)).map((o) => ({ label: o.label, hex: o.hex }))
                ].find((o) => o?.hex === tintHex)?.label ?? `#${tintHex.toString(16).padStart(6, '0')}`;
                tintPicker.text.textContent = label;
                setMaterialThumbToColor(tintPicker.thumb, tintHex);
            };

            syncTint();
            base.body.appendChild(tintPicker.row);

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
                const rough = clamp(cfg.wallBase?.roughness ?? 0.85, 0.0, 1.0);
                roughRow.range.disabled = !allowEdit;
                roughRow.number.disabled = !allowEdit;
                roughRow.range.value = String(rough);
                roughRow.number.value = rough.toFixed(2);

                const normal = clamp(cfg.wallBase?.normalStrength ?? 0.9, 0.0, 2.0);
                normalRow.range.disabled = !allowEdit;
                normalRow.number.disabled = !allowEdit;
                normalRow.range.value = String(normal);
                normalRow.number.value = normal.toFixed(2);
            };

            const setRoughnessFromUi = (raw) => {
                const next = clamp(raw, 0.0, 1.0);
                cfg.wallBase.roughness = next;
                syncRanges();
                onChange();
            };

            const setNormalFromUi = (raw) => {
                const next = clamp(raw, 0.0, 2.0);
                cfg.wallBase.normalStrength = next;
                syncRanges();
                onChange();
            };

            roughRow.range.addEventListener('input', () => setRoughnessFromUi(roughRow.range.value));
            roughRow.number.addEventListener('input', () => setRoughnessFromUi(roughRow.number.value));
            normalRow.range.addEventListener('input', () => setNormalFromUi(normalRow.range.value));
            normalRow.number.addEventListener('input', () => setNormalFromUi(normalRow.number.value));

            syncRanges();
            base.body.appendChild(roughRow.row);
            base.body.appendChild(normalRow.row);

                sections.appendChild(base.details);
            }
        }

        if (!allowEdit) {
            const tiling = createDetailsSection('Texture tiling', { open: false, key: `${scopeKey}:tiling`, detailsOpenByKey: this._materialPanelDetailsOpenByKey });
            tiling.body.appendChild(createHint(hintText));
            sections.appendChild(tiling.details);

            const variation = createDetailsSection('Material variation', { open: false, key: `${scopeKey}:variation`, detailsOpenByKey: this._materialPanelDetailsOpenByKey });
            variation.body.appendChild(createHint(hintText));
            sections.appendChild(variation.details);
            return;
        }

        if (target === 'bay') {
            const bayCfg = cfg;
            const allowBayEdit = !linkedFromBayId;
            const tilingProxy = deepClone((bayCfg?.tiling && typeof bayCfg.tiling === 'object')
                ? bayCfg.tiling
                : ((faceCfgForBay?.tiling && typeof faceCfgForBay.tiling === 'object')
                    ? faceCfgForBay.tiling
                    : (layer?.tiling ?? null))) ?? {};

            const tilingController = createTextureTilingMiniController({
                mode: 'details',
                title: 'Texture tiling',
                detailsOpenByKey: this._materialPanelDetailsOpenByKey,
                detailsKey: `${scopeKey}:tiling`,
                allow: allowBayEdit,
                tiling: tilingProxy,
                defaults: { tileMeters: 2.0 },
                hintText: 'Overrides the material tile size in meters.',
                onChange: () => {
                    if (!allowBayEdit) return;
                    bayCfg.tiling = deepClone(tilingProxy);
                    onChange();
                }
            });
            tilingController.mount(sections);
            this._materialPanelDisposables.push(tilingController);

            const variationProxyLayer = {
                materialVariation: deepClone((bayCfg?.materialVariation && typeof bayCfg.materialVariation === 'object')
                    ? bayCfg.materialVariation
                    : ((faceCfgForBay?.materialVariation && typeof faceCfgForBay.materialVariation === 'object')
                        ? faceCfgForBay.materialVariation
                        : (layer?.materialVariation ?? null)))
            };

            appendMaterialVariationLayerUI({
                parent: sections,
                allow: allowBayEdit,
                scopeKey,
                layerId,
                layer: variationProxyLayer,
                kind: 'walls',
                detailsOpenByKey: this._materialPanelDetailsOpenByKey,
                onChange: () => {
                    if (!allowBayEdit) return;
                    bayCfg.materialVariation = deepClone(variationProxyLayer.materialVariation);
                    onChange();
                },
                onReRender: null,
                registerMiniController: null
            });
            return;
        }

        const tilingController = createTextureTilingMiniController({
            mode: 'details',
            title: 'Texture tiling',
            detailsOpenByKey: this._materialPanelDetailsOpenByKey,
            detailsKey: `${scopeKey}:tiling`,
            allow: true,
            tiling: (cfg.tiling ??= {}),
            defaults: { tileMeters: 2.0 },
            hintText: 'Overrides the material tile size in meters.',
            onChange
        });
        tilingController.mount(sections);
        this._materialPanelDisposables.push(tilingController);

        appendMaterialVariationLayerUI({
            parent: sections,
            allow: true,
            scopeKey,
            layerId,
            layer: cfg,
            kind: 'walls',
            detailsOpenByKey: this._materialPanelDetailsOpenByKey,
            onChange,
            onReRender: null,
            registerMiniController: null
        });
    }

    _bind() {
        if (this._bound) return;
        this._bound = true;

        this.createBuildingBtn.addEventListener('click', this._onCreateClick);
        this.loadBtn.addEventListener('click', this._onLoadClick);
        this.exportBtn.addEventListener('click', this._onExportClick);
        this.resetBtn.addEventListener('click', this._onResetClick);
        this.materialCloseBtn.addEventListener('click', this._onCloseMaterialPanelClick);
        this.sideHandleBtn.addEventListener('click', this._onSideHandleClick);
        this.viewModes.addEventListener('click', this._onViewModesClick);
        this.hideFaceMarkToggleInput.addEventListener('change', this._onHideFaceMarkToggleChange);
        this.showDummyToggleInput.addEventListener('change', this._onShowDummyToggleChange);
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

        this.groupOverlay.addEventListener('click', this._onGroupOverlayClick);
        this.groupDoneBtn.addEventListener('click', this._onCloseGrouping);
        this.groupBody.addEventListener('click', this._onGroupBodyClick);

        this._syncControls();
        this._syncViewButtons();
        this._renderLayers();
    }

    _unbind() {
        if (!this._bound) return;
        this._bound = false;

        this.createBuildingBtn.removeEventListener('click', this._onCreateClick);
        this.loadBtn.removeEventListener('click', this._onLoadClick);
        this.exportBtn.removeEventListener('click', this._onExportClick);
        this.resetBtn.removeEventListener('click', this._onResetClick);
        this.materialCloseBtn.removeEventListener('click', this._onCloseMaterialPanelClick);
        this.sideHandleBtn.removeEventListener('click', this._onSideHandleClick);
        this.viewModes.removeEventListener('click', this._onViewModesClick);
        this.hideFaceMarkToggleInput.removeEventListener('change', this._onHideFaceMarkToggleChange);
        this.showDummyToggleInput.removeEventListener('change', this._onShowDummyToggleChange);
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

        this.groupOverlay.removeEventListener('click', this._onGroupOverlayClick);
        this.groupDoneBtn.removeEventListener('click', this._onCloseGrouping);
        this.groupBody.removeEventListener('click', this._onGroupBodyClick);
    }

    _syncControls() {
        const allow = this._enabled;
        const hasBuilding = this._hasBuilding;

        this.createBuildingBtn.disabled = !allow || hasBuilding;
        this.loadBtn.disabled = !allow;
        this.exportBtn.disabled = !allow || !hasBuilding;
        this.resetBtn.disabled = !allow || !hasBuilding;
        this.nameInput.disabled = !allow || !hasBuilding;
        this.typeSelect.disabled = !allow || !hasBuilding;
        this.hideFaceMarkToggleInput.disabled = !allow;
        this.showDummyToggleInput.disabled = !allow || !hasBuilding;
        this.adjustLayoutBtn.disabled = !allow || !hasBuilding;
        this.adjustModeCloseBtn.disabled = !allow || !hasBuilding || !this._layoutAdjustEnabled;
        this.rulerBtn.disabled = !allow;

        this.addFloorBtn.disabled = !allow || !hasBuilding;
        this.addRoofBtn.disabled = !allow || !hasBuilding;

        this.fabPanel.classList.toggle('is-disabled', !allow);
        this.viewPanel.classList.toggle('is-disabled', !allow);
        this.rightPanel.classList.toggle('is-disabled', !allow);
    }

    _syncViewButtons() {
        const mode = this._viewMode;
        for (const btn of [this.meshModeBtn, this.wireModeBtn, this.floorsModeBtn, this.planModeBtn]) {
            const m = btn.dataset?.mode ?? '';
            btn.classList.toggle('is-active', m === mode);
        }
        this._syncHideFaceMarkToggle();
        this._syncShowDummyToggle();
        this._syncAdjustLayoutButton();
        this._syncRulerButton();
    }

    _syncHideFaceMarkToggle() {
        this.hideFaceMarkToggleInput.checked = this._hideFaceMarkEnabled;
    }

    _syncShowDummyToggle() {
        this.showDummyToggleInput.checked = this._showDummyEnabled;
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

    _renderRightPanel() {
        const showEditor = this._hasBuilding;
        this.rightEmptyHint.classList.toggle('hidden', showEditor);
        this.rightActions.classList.toggle('hidden', !showEditor);
        this.layersList.classList.toggle('hidden', !showEditor);
    }

    _renderLayers() {
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
                    const start = bays.find((b) => (b && typeof b === 'object' ? b.id : '') === id) ?? null;
                    if (!start || typeof start !== 'object') return null;
                    const visited = new Set();
                    let cur = start;
                    for (let i = 0; i < 32; i++) {
                        const curId = typeof cur?.id === 'string' ? cur.id : '';
                        if (!curId) return start;
                        if (visited.has(curId)) return start;
                        visited.add(curId);
                        const nextId = resolveBayLinkFromSpec(cur);
                        if (!nextId) return cur;
                        if (nextId === curId) return cur;
                        const next = bays.find((b) => (b && typeof b === 'object' ? b.id : '') === nextId) ?? null;
                        if (!next || typeof next !== 'object') return cur;
                        cur = next;
                    }
                    return start;
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

                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'building-fab2-bay-btn';
                        btn.disabled = !allowEdit;
                        btn.classList.toggle('is-active', bayId === selectedBayId);
                        btn.addEventListener('click', () => {
                            if (!allowEdit) return;
                            this._setSelectedBayId(layerId, configFaceId, bayId);
                            this._renderLayers();
                        });

                        const thumb = document.createElement('div');
                        thumb.className = 'building-fab-material-thumb building-fab2-bay-btn-thumb';

                        const effective = resolveEffectiveBayMaterial(bay);
                        syncMaterialThumb(thumb, effective);

                        const label = document.createElement('div');
                        label.className = 'building-fab2-bay-btn-label';
                        const linkedFromBayId = resolveBayLinkFromSpec(bay);
                        if (linkedFromBayId) {
                            const linkedFromIndex = bayIndexById.get(linkedFromBayId) ?? null;
                            label.textContent = Number.isInteger(linkedFromIndex) ? String(linkedFromIndex + 1) : String(bayIndex + 1);
                            const linkIcon = createMaterialSymbolIcon('link', { size: 'sm' });
                            linkIcon.classList.add('building-fab2-bay-label-icon');
                            label.appendChild(linkIcon);
                            btn.classList.add('is-linked');
                        } else {
                            label.textContent = String(bayIndex + 1);
                        }

                        const icons = document.createElement('div');
                        icons.className = 'building-fab2-bay-btn-icons';
                        const source = resolveBaySource(bayId) ?? bay;
                        const mode = source?.size?.mode === 'fixed' ? 'fixed' : 'range';
                        icons.appendChild(createMaterialSymbolIcon(mode === 'fixed' ? 'radio_button_checked' : 'open_in_full', { size: 'sm' }));
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
                const windowCfg = resolveBayWindowFromSpec(editorBay);
                const hasBayWindow = !!windowCfg && windowCfg.enabled !== false;
                const windowDefId = hasBayWindow && typeof windowCfg?.defId === 'string' ? windowCfg.defId : '';
                const selectedWindowDef = hasBayWindow && windowDefId ? (windowDefById.get(windowDefId) ?? null) : null;
                const selectedWindowLabel = selectedWindowDef?.label || windowDefId || '';
                const selectedWindowPreviewUrl = typeof selectedWindowDef?.previewUrl === 'string' ? selectedWindowDef.previewUrl : '';
                const selectedWindowDefWidth = Number(selectedWindowDef?.settings?.width);
                const selectedWindowDefHeight = Number(selectedWindowDef?.settings?.height);
                const windowMinRaw = Number(windowCfg?.width?.minMeters);
                const windowMinWidth = hasBayWindow
                    ? (Number.isFinite(windowMinRaw)
                        ? Math.max(0.1, windowMinRaw)
                        : (Number.isFinite(selectedWindowDefWidth) ? Math.max(0.1, selectedWindowDefWidth) : 0.1))
                    : 0.1;
                const windowMaxRaw = windowCfg?.width?.maxMeters;
                const windowMaxIsInfinity = windowMaxRaw === null || windowMaxRaw === undefined;
                const windowMaxWidth = Number(windowMaxRaw);
                const windowPadding = windowCfg?.padding && typeof windowCfg.padding === 'object' ? windowCfg.padding : null;
                const windowPaddingLinked = (windowPadding?.linked ?? true) !== false;
                const windowPaddingLeft = Math.max(0, Number(windowPadding?.leftMeters) || 0);
                const windowPaddingRight = Math.max(0, Number(windowPadding?.rightMeters) || (windowPaddingLinked ? windowPaddingLeft : 0));
                const windowRequiredWidth = hasBayWindow
                    ? Math.max(0.1, windowMinWidth + windowPaddingLeft + windowPaddingRight)
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
	                        const options = [];
	                        options.push({ id: 'baylink:none', label: 'Unlink (independent)' });
	                        for (let i = 0; i < bays.length; i++) {
	                            const b = bays[i] && typeof bays[i] === 'object' ? bays[i] : null;
	                            const id = typeof b?.id === 'string' ? b.id : '';
	                            if (!id) continue;
	                            const eff = resolveEffectiveBayMaterial(b);
	                            if (eff.kind === 'color') {
	                                const c = getColorOpt(eff.id);
	                                options.push({
	                                    id: `baylink:${id}`,
	                                    label: `Bay ${i + 1}`,
	                                    kind: 'color',
	                                    hex: c?.hex ?? 0xffffff,
	                                    disabled: id === bayId
	                                });
	                            } else {
	                                const tex = getTexOpt(eff.id);
	                                options.push({
	                                    id: `baylink:${id}`,
	                                    label: `Bay ${i + 1}`,
	                                    kind: 'texture',
	                                    previewUrl: tex?.wallTextureUrl ?? null,
	                                    disabled: id === bayId
	                                });
	                            }
	                        }

	                        const selectedId = linkedFromBayId ? `baylink:${linkedFromBayId}` : 'baylink:none';
	                        this._materialPickerPopup.open({
	                            title: `Link bay · Face ${configFaceId}`,
	                            sections: [{ label: 'Bays', options }],
	                            selectedId,
	                            onSelect: (opt) => {
	                                const id = typeof opt?.id === 'string' ? opt.id : '';
	                                if (id === 'baylink:none') {
	                                    this.onSetBayLink?.(layerId, configFaceId, bayId, null);
	                                    return;
	                                }
	                                if (!id.startsWith('baylink:')) return;
	                                const next = id.slice('baylink:'.length);
	                                if (!next) return;
	                                this.onSetBayLink?.(layerId, configFaceId, bayId, next);
	                            }
	                        });
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

	                    const sizeMode = editorBay?.size?.mode === 'fixed' ? 'fixed' : 'range';

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

	                    widthModeToggle.appendChild(fixedBtn);
	                    widthModeToggle.appendChild(rangeBtn);
	                    widthControls.appendChild(widthModeToggle);

	                    const widthInputs = document.createElement('div');
	                    widthInputs.className = 'building-fab2-bay-width-inputs';

	                    if (sizeMode === 'fixed') {
	                        const widthInput = document.createElement('input');
	                        widthInput.type = 'number';
	                        widthInput.className = 'building-fab-number building-fab2-bay-width-input';
	                        widthInput.min = String(Number.isFinite(windowRequiredWidth) ? windowRequiredWidth : 0.1);
	                        widthInput.step = '0.1';
	                        widthInput.disabled = !allowBayConfigEdit;
	                        widthInput.placeholder = 'Value';
	                        widthInput.setAttribute('aria-label', 'Bay width value (m)');
	                        const rawWidth = Number(editorBay?.size?.widthMeters);
	                        widthInput.value = String(Number.isFinite(rawWidth)
	                            ? Math.max(rawWidth, Number.isFinite(windowRequiredWidth) ? windowRequiredWidth : 0.1)
	                            : 1.0);
	                        widthInput.addEventListener('input', () => {
	                            if (!allowBayConfigEdit) return;
	                            this.onSetBayFixedWidth?.(layerId, configFaceId, bayId, Number(widthInput.value));
	                        });
	                        widthInputs.appendChild(widthInput);
	                    } else {
	                        const minInput = document.createElement('input');
	                        minInput.type = 'number';
	                        minInput.className = 'building-fab-number building-fab2-bay-width-input';
	                        minInput.min = String(Number.isFinite(windowRequiredWidth) ? windowRequiredWidth : 0.1);
	                        minInput.step = '0.1';
	                        minInput.disabled = !allowBayConfigEdit;
	                        minInput.placeholder = 'Min';
	                        minInput.setAttribute('aria-label', 'Bay min width (m)');
	                        const rawMin = Number(editorBay?.size?.minMeters);
	                        minInput.value = String(Number.isFinite(rawMin)
	                            ? Math.max(rawMin, Number.isFinite(windowRequiredWidth) ? windowRequiredWidth : 0.1)
	                            : 1.0);
	                        minInput.addEventListener('input', () => {
	                            if (!allowBayConfigEdit) return;
	                            this.onSetBayMinWidth?.(layerId, configFaceId, bayId, Number(minInput.value));
	                        });
	                        widthInputs.appendChild(minInput);

	                        const maxInput = document.createElement('input');
	                        maxInput.type = 'number';
	                        maxInput.className = 'building-fab-number building-fab2-bay-width-input';
	                        maxInput.min = String(Number.isFinite(windowRequiredWidth) ? windowRequiredWidth : 0.1);
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

                            if (Number.isFinite(windowRequiredWidth)) {
                                const windowMinHint = document.createElement('div');
                                windowMinHint.className = 'building-fab2-hint building-fab2-bay-window-min-hint';
                                windowMinHint.textContent = `Effective bay min width (window + padding): ${windowRequiredWidth.toFixed(2)}m`;
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

                            const windowTitle = document.createElement('div');
                            windowTitle.className = 'building-fab2-subtitle is-inline';
                            windowTitle.textContent = 'Window';
                            bayBodyContent.appendChild(windowTitle);

                            const windowSection = document.createElement('div');
                            windowSection.className = 'building-fab2-bay-window-section';

                            const windowToggleRow = document.createElement('label');
                            windowToggleRow.className = 'building-fab2-toggle-switch building-fab2-bay-window-toggle-row';
                            const windowToggleLabel = document.createElement('span');
                            windowToggleLabel.textContent = 'Enable window';
                            const windowToggleInput = document.createElement('input');
                            windowToggleInput.type = 'checkbox';
                            windowToggleInput.checked = hasBayWindow;
                            windowToggleInput.disabled = !allowBayConfigEdit;
                            windowToggleInput.addEventListener('change', () => {
                                if (!allowBayConfigEdit) return;
                                this.onSetBayWindowEnabled?.(layerId, configFaceId, bayId, !!windowToggleInput.checked);
                            });
                            windowToggleRow.appendChild(windowToggleLabel);
                            windowToggleRow.appendChild(windowToggleInput);
                            windowSection.appendChild(windowToggleRow);

                            const windowDetails = document.createElement('div');
                            windowDetails.className = 'building-fab2-bay-window-details';
                            windowDetails.classList.toggle('is-hidden', !hasBayWindow);

                            const bayWindowPicker = createMaterialPickerRowController({
                                label: '',
                                rowExtraClassName: 'building-fab2-no-label',
                                pickerExtraClassName: 'building-fab2-material-thumb-only building-fab2-bay-window-picker',
                                disabled: !allowBayConfigEdit || !hasBayWindow,
                                onPick: () => {
                                    if (!allowBayConfigEdit || !hasBayWindow) return;
                                    this.onRequestBayWindowPicker?.(layerId, configFaceId, bayId);
                                }
                            });
                            if (hasBayWindow && selectedWindowDef) {
                                bayWindowPicker.text.textContent = selectedWindowLabel;
                                setMaterialThumbToTexture(bayWindowPicker.thumb, selectedWindowPreviewUrl, selectedWindowLabel || windowDefId || 'Window');
                            } else if (hasBayWindow) {
                                bayWindowPicker.text.textContent = windowDefId ? `Missing · ${windowDefId}` : 'Select window';
                                setMaterialThumbToTexture(bayWindowPicker.thumb, '', windowDefId ? `Missing · ${windowDefId}` : 'Select window');
                            } else {
                                bayWindowPicker.text.textContent = 'Disabled';
                                setMaterialThumbToTexture(bayWindowPicker.thumb, '', 'Disabled');
                            }
                            windowDetails.appendChild(bayWindowPicker.row);

                            const windowSizeRow = document.createElement('div');
                            windowSizeRow.className = 'building-fab-row building-fab-row-wide';
                            const windowSizeLabel = document.createElement('div');
                            windowSizeLabel.className = 'building-fab-row-label';
                            windowSizeLabel.textContent = 'Window width';
                            const windowSizeControls = document.createElement('div');
                            windowSizeControls.className = 'building-fab2-bay-width-controls';

                            const windowWidthInputs = document.createElement('div');
                            windowWidthInputs.className = 'building-fab2-bay-width-inputs';

                            const windowMinInput = document.createElement('input');
                            windowMinInput.type = 'number';
                            windowMinInput.className = 'building-fab-number building-fab2-bay-width-input';
                            windowMinInput.min = '0.1';
                            windowMinInput.step = '0.1';
                            windowMinInput.placeholder = 'Min';
                            windowMinInput.disabled = !allowBayConfigEdit || !hasBayWindow;
                            windowMinInput.value = String(windowMinWidth);
                            windowMinInput.addEventListener('input', () => {
                                if (!allowBayConfigEdit || !hasBayWindow) return;
                                this.onSetBayWindowMinWidth?.(layerId, configFaceId, bayId, Number(windowMinInput.value));
                            });
                            windowWidthInputs.appendChild(windowMinInput);

                            const windowMaxInput = document.createElement('input');
                            windowMaxInput.type = 'number';
                            windowMaxInput.className = 'building-fab-number building-fab2-bay-width-input';
                            windowMaxInput.min = '0.1';
                            windowMaxInput.step = '0.1';
                            windowMaxInput.placeholder = 'Max';
                            windowMaxInput.disabled = !allowBayConfigEdit || !hasBayWindow || windowMaxIsInfinity;
                            windowMaxInput.value = String(Number.isFinite(windowMaxWidth) ? windowMaxWidth : windowMinWidth);
                            windowMaxInput.addEventListener('input', () => {
                                if (!allowBayConfigEdit || !hasBayWindow) return;
                                this.onSetBayWindowMaxWidth?.(layerId, configFaceId, bayId, Number(windowMaxInput.value));
                            });
                            windowWidthInputs.appendChild(windowMaxInput);

                            const windowInfinityBtn = document.createElement('button');
                            windowInfinityBtn.type = 'button';
                            windowInfinityBtn.className = 'building-fab2-width-inf-btn';
                            applyMaterialSymbolToButton(windowInfinityBtn, { name: 'all_inclusive', label: 'Infinite max', size: 'sm' });
                            windowInfinityBtn.disabled = !allowBayConfigEdit || !hasBayWindow;
                            windowInfinityBtn.classList.toggle('is-active', windowMaxIsInfinity);
                            windowInfinityBtn.addEventListener('click', () => {
                                if (!allowBayConfigEdit || !hasBayWindow) return;
                                this.onSetBayWindowMaxWidth?.(layerId, configFaceId, bayId, windowMaxIsInfinity ? Number(windowMaxInput.value) : null);
                            });
                            windowWidthInputs.appendChild(windowInfinityBtn);

                            windowSizeControls.appendChild(windowWidthInputs);
                            windowSizeRow.appendChild(windowSizeLabel);
                            windowSizeRow.appendChild(windowSizeControls);
                            windowDetails.appendChild(windowSizeRow);

                            const windowPaddingRow = document.createElement('div');
                            windowPaddingRow.className = 'building-fab-row building-fab-row-wide';
                            const windowPaddingLabel = document.createElement('div');
                            windowPaddingLabel.className = 'building-fab-row-label';
                            windowPaddingLabel.textContent = 'Window padding';
                            const windowPaddingControls = document.createElement('div');
                            windowPaddingControls.className = 'building-fab2-bay-window-padding-controls';

                            const windowPaddingLeftInput = document.createElement('input');
                            windowPaddingLeftInput.type = 'number';
                            windowPaddingLeftInput.className = 'building-fab-number building-fab2-bay-window-padding-input';
                            windowPaddingLeftInput.min = '0';
                            windowPaddingLeftInput.step = '0.1';
                            windowPaddingLeftInput.placeholder = 'Left';
                            windowPaddingLeftInput.disabled = !allowBayConfigEdit || !hasBayWindow;
                            windowPaddingLeftInput.value = String(windowPaddingLeft);
                            windowPaddingLeftInput.addEventListener('input', () => {
                                if (!allowBayConfigEdit || !hasBayWindow) return;
                                this.onSetBayWindowPadding?.(layerId, configFaceId, bayId, 'left', Number(windowPaddingLeftInput.value));
                            });
                            windowPaddingControls.appendChild(windowPaddingLeftInput);

                            const windowPaddingLinkBtn = document.createElement('button');
                            windowPaddingLinkBtn.type = 'button';
                            windowPaddingLinkBtn.className = 'building-fab2-icon-btn';
                            windowPaddingLinkBtn.disabled = !allowBayConfigEdit || !hasBayWindow;
                            applyMaterialSymbolToButton(windowPaddingLinkBtn, {
                                name: windowPaddingLinked ? 'link' : 'link_off',
                                label: windowPaddingLinked ? 'Unlink window padding' : 'Link window padding',
                                size: 'sm'
                            });
                            windowPaddingLinkBtn.addEventListener('click', () => {
                                if (!allowBayConfigEdit || !hasBayWindow) return;
                                this.onToggleBayWindowPaddingLink?.(layerId, configFaceId, bayId);
                            });
                            windowPaddingControls.appendChild(windowPaddingLinkBtn);

                            const windowPaddingRightInput = document.createElement('input');
                            windowPaddingRightInput.type = 'number';
                            windowPaddingRightInput.className = 'building-fab-number building-fab2-bay-window-padding-input';
                            windowPaddingRightInput.min = '0';
                            windowPaddingRightInput.step = '0.1';
                            windowPaddingRightInput.placeholder = 'Right';
                            windowPaddingRightInput.disabled = !allowBayConfigEdit || !hasBayWindow || windowPaddingLinked;
                            windowPaddingRightInput.value = String(windowPaddingRight);
                            windowPaddingRightInput.addEventListener('input', () => {
                                if (!allowBayConfigEdit || !hasBayWindow || windowPaddingLinked) return;
                                this.onSetBayWindowPadding?.(layerId, configFaceId, bayId, 'right', Number(windowPaddingRightInput.value));
                            });
                            windowPaddingControls.appendChild(windowPaddingRightInput);

                            windowPaddingRow.appendChild(windowPaddingLabel);
                            windowPaddingRow.appendChild(windowPaddingControls);
                            windowDetails.appendChild(windowPaddingRow);

                            const windowDetailHint = document.createElement('div');
                            windowDetailHint.className = 'building-fab2-hint building-fab2-bay-window-details-hint';
                            const windowRefHeight = Number.isFinite(selectedWindowDefHeight) ? `${selectedWindowDefHeight.toFixed(2)}m` : 'n/a';
                            const requiredText = Number.isFinite(windowRequiredWidth) ? `${windowRequiredWidth.toFixed(2)}m` : 'n/a';
                            windowDetailHint.textContent = `Definition height: ${windowRefHeight} · Effective bay min: ${requiredText}`;
                            windowDetails.appendChild(windowDetailHint);

                            windowSection.appendChild(windowDetails);
                            bayBodyContent.appendChild(windowSection);

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
            lockedToByFace: normalizeLockedToByFace(state?.lockedToByFace ?? null)
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

    isLinkPopupOpen() {
        return this.linkOverlay.isConnected && !this.linkOverlay.classList.contains('hidden');
    }

    openLinkPopup({ layerId = null, masterFaceId = null } = {}) {
        const id = typeof layerId === 'string' ? layerId : '';
        const master = isFaceId(masterFaceId) ? masterFaceId : null;
        if (!id || !master) return false;

        this._linkPopup = { layerId: id, masterFaceId: master };
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

        const layerId = popup.layerId;
        const masterFaceId = popup.masterFaceId;
        this.linkTitle.textContent = `Link faces (master: ${masterFaceId})`;

        const faceState = this._getFloorLayerFaceState(layerId);
        const lockedToByFace = faceState.lockedToByFace;

        const grid = document.createElement('div');
        grid.className = 'building-fab2-link-grid';

        for (const faceId of FACE_IDS) {
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
            grid.appendChild(btn);
        }

        this.linkBody.appendChild(grid);
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

    _handleLinkBodyClick(e) {
        const btn = e?.target?.closest?.('button');
        if (!btn || !this.linkBody.contains(btn)) return;
        if (btn.disabled) return;
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
