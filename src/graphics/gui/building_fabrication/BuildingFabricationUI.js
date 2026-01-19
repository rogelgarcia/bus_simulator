// src/graphics/gui/building_fabrication/BuildingFabricationUI.js
// Builds the HUD controls for the building fabrication scene.
import { getBuildingStyleOptions } from '../../assets3d/generators/buildings/BuildingGenerator.js';
import { BUILDING_STYLE, isBuildingStyle } from '../../../app/buildings/BuildingStyle.js';
import { WINDOW_STYLE, isWindowStyle } from '../../../app/buildings/WindowStyle.js';
import { BELT_COURSE_COLOR, getBeltCourseColorOptions, isBeltCourseColor } from '../../../app/buildings/BeltCourseColor.js';
import { ROOF_COLOR, getRoofColorOptions, isRoofColor } from '../../../app/buildings/RoofColor.js';
import { PickerPopup } from '../shared/PickerPopup.js';
import { applyMaterialSymbolToButton } from '../shared/materialSymbols.js';
import { WINDOW_TYPE, getDefaultWindowParams, getWindowTypeOptions, isWindowTypeId } from '../../assets3d/generators/buildings/WindowTextureGenerator.js';
import { normalizeWindowParams, normalizeWindowTypeIdOrLegacyStyle } from '../../assets3d/generators/buildings/WindowTypeCompatibility.js';
import { getPbrMaterialOptionsForBuildings } from '../../assets3d/materials/PbrMaterialCatalog.js';
import { MATERIAL_VARIATION_DEBUG_DEFAULT, MATERIAL_VARIATION_ROOT, getDefaultMaterialVariationPreset, normalizeMaterialVariationConfig, normalizeMaterialVariationDebugConfig } from '../../assets3d/materials/MaterialVariationSystem.js';
import { LAYER_TYPE, cloneBuildingLayers, createDefaultFloorLayer, createDefaultRoofLayer, normalizeBuildingLayers } from '../../assets3d/generators/building_fabrication/BuildingFabricationTypes.js';
import { getBuildingConfigs } from '../../content3d/catalogs/BuildingConfigCatalog.js';
import { createTextureTilingMiniController } from './mini_controllers/TextureTilingMiniController.js';
import { createMaterialVariationAntiTilingMiniController } from './mini_controllers/MaterialVariationAntiTilingMiniController.js';

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

function formatFloat(value, digits = 1) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    return num.toFixed(digits);
}

function setMaterialThumbToTexture(thumb, url, label) {
    if (!thumb) return;
    thumb.textContent = '';
    thumb.style.background = 'rgba(0,0,0,0.2)';
    thumb.style.backgroundImage = '';
    thumb.style.backgroundSize = '';
    thumb.style.backgroundRepeat = '';
    thumb.style.backgroundPosition = '';
    thumb.style.color = '';

    if (typeof url === 'string' && url) {
        const img = document.createElement('img');
        img.className = 'building-fab-material-thumb-img';
        img.alt = label || '';
        img.loading = 'lazy';
        img.src = url;
        thumb.appendChild(img);
        return;
    }

    thumb.textContent = label || '';
    thumb.style.color = '#e9f2ff';
}

function setMaterialThumbToColor(thumb, hex, { isDefaultRoof = false } = {}) {
    if (!thumb) return;
    thumb.textContent = '';
    thumb.innerHTML = '';
    thumb.style.background = 'rgba(0,0,0,0.2)';
    thumb.style.backgroundImage = '';
    thumb.style.backgroundSize = '';
    thumb.style.backgroundRepeat = '';
    thumb.style.backgroundPosition = '';

    if (isDefaultRoof) {
        thumb.style.backgroundImage = 'repeating-linear-gradient(45deg, rgba(255,255,255,0.85), rgba(255,255,255,0.85) 6px, rgba(0,0,0,0.12) 6px, rgba(0,0,0,0.12) 12px)';
        thumb.style.backgroundSize = 'auto';
        return;
    }

    const safe = Number.isFinite(hex) ? hex : 0xffffff;
    thumb.style.background = `#${safe.toString(16).padStart(6, '0')}`;
}

function buildRoofDefaultPreviewUrl({ size = 96 } = {}) {
    const s = Math.max(16, Math.round(Number(size) || 96));
    const c = document.createElement('canvas');
    c.width = s;
    c.height = s;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let i = -s; i < s * 2; i += 12) {
        ctx.moveTo(i, -2);
        ctx.lineTo(i + s, s + 2);
    }
    ctx.stroke();
    return c.toDataURL('image/png');
}

export class BuildingFabricationUI {
    constructor({
        floorMin = 1,
        floorMax = 30,
        floorCount = 8,
        floorHeightMin = 1.0,
        floorHeightMax = 12.0,
        floorHeight = 4.2,
        gridMin = 3,
        gridMax = 25,
        gridSize = 5
    } = {}) {
        this.floorMin = clampInt(floorMin, 1, 9999);
        this.floorMax = clampInt(floorMax, this.floorMin, 9999);
        this._floorCount = clampInt(floorCount, this.floorMin, this.floorMax);

        this.floorHeightMin = clamp(floorHeightMin, 0.5, 20);
        this.floorHeightMax = clamp(floorHeightMax, this.floorHeightMin, 20);
        this._floorHeight = clamp(floorHeight, this.floorHeightMin, this.floorHeightMax);

        this.gridMin = clampInt(gridMin, 1, 99);
        this.gridMax = clampInt(gridMax, this.gridMin, 99);
        this._gridSize = clampInt(gridSize, this.gridMin, this.gridMax);

        this._buildingModeEnabled = false;
        this._roadModeEnabled = false;
        this._wireframeEnabled = false;
        this._floorDivisionsEnabled = false;
        this._floorplanEnabled = false;
        this._enabled = true;
        this._hideSelectionBorder = false;
        this._selectedBuildingId = null;
        this._buildingType = 'business';
        this._buildingStyle = BUILDING_STYLE.DEFAULT;
        this._buildingStyleOptions = getBuildingStyleOptions();
        this._windowTypeOptions = getWindowTypeOptions();
        this._streetEnabled = false;
        this._streetFloors = 0;
        this._streetFloorHeight = this._floorHeight;
        this._streetStyle = BUILDING_STYLE.DEFAULT;
        this._wallInset = 0.0;
        this._beltCourseEnabled = false;
        this._beltCourseMargin = 0.4;
        this._beltCourseHeight = 0.18;
        this._beltCourseColorOptions = getBeltCourseColorOptions();
        this._beltCourseColor = BELT_COURSE_COLOR.OFFWHITE;
        this._topBeltEnabled = false;
        this._topBeltWidth = 0.4;
        this._topBeltHeight = 0.18;
        this._topBeltInnerWidth = 0.0;
        this._topBeltColor = BELT_COURSE_COLOR.OFFWHITE;
        this._roofColorOptions = getRoofColorOptions();
        this._roofColor = ROOF_COLOR.DEFAULT;
        this._windowParamColorOptions = [
            { id: 'offwhite', label: 'Off-white', hex: 0xdfe7f2 },
            { id: 'beige', label: 'Beige', hex: 0xd9c4a1 },
            { id: 'brown', label: 'Brown', hex: 0x6a4c3b },
            { id: 'warm', label: 'Warm', hex: 0xffcc78 },
            { id: 'blue', label: 'Blue', hex: 0x1d5c8d },
            { id: 'navy', label: 'Navy', hex: 0x061a2c },
            { id: 'dark', label: 'Dark', hex: 0x0a101a }
        ];
        this._windowTypeId = WINDOW_TYPE.STYLE_DEFAULT;
        this._windowParams = getDefaultWindowParams(this._windowTypeId);
        this._windowWidth = 2.2;
        this._windowGap = 1.6;
        this._windowHeight = 1.4;
        this._windowY = 1.0;
        this._windowSpacerEnabled = false;
        this._windowSpacerEvery = 4;
        this._windowSpacerWidth = 0.9;
        this._windowSpacerExtrude = false;
        this._windowSpacerExtrudeDistance = 0.12;
        this._streetWindowTypeId = WINDOW_TYPE.STYLE_DEFAULT;
        this._streetWindowParams = getDefaultWindowParams(this._streetWindowTypeId);
        this._streetWindowWidth = 2.2;
        this._streetWindowGap = 1.6;
        this._streetWindowHeight = 1.4;
        this._streetWindowY = 1.0;
        this._streetWindowSpacerEnabled = false;
        this._streetWindowSpacerEvery = 4;
        this._streetWindowSpacerWidth = 0.9;
        this._streetWindowSpacerExtrude = false;
        this._streetWindowSpacerExtrudeDistance = 0.12;
        this._hoveredBuildingRow = null;
        this._selectedTileCount = 0;
        this._roadStartTileId = null;
        this._layerMiniControllers = [];
        this._hoveredRoadId = null;
        this._hoveredRoadRow = null;
        this._roadRemoveButtons = [];
        this._pickerPopup = new PickerPopup();
        this._detailsOpenByKey = new Map();

        this._templateLayers = normalizeBuildingLayers([
            createDefaultFloorLayer({
                floors: this._floorCount,
                floorHeight: this._floorHeight,
                style: this._buildingStyle,
                planOffset: 0.0,
                belt: {
                    enabled: this._beltCourseEnabled,
                    height: this._beltCourseHeight,
                    extrusion: 0.0,
                    material: { color: this._beltCourseColor }
                },
                windows: {
                    enabled: true,
                    typeId: this._windowTypeId,
                    params: this._windowParams,
                    width: this._windowWidth,
                    height: this._windowHeight,
                    sillHeight: this._windowY,
                    spacing: this._windowGap,
                    spaceColumns: {
                        enabled: this._windowSpacerEnabled,
                        every: this._windowSpacerEvery,
                        width: this._windowSpacerWidth,
                        material: { color: this._beltCourseColor },
                        extrude: this._windowSpacerExtrude,
                        extrudeDistance: this._windowSpacerExtrudeDistance
                    }
                }
            }),
            createDefaultRoofLayer({
                ring: {
                    enabled: this._topBeltEnabled,
                    outerRadius: this._topBeltWidth,
                    innerRadius: this._topBeltInnerWidth,
                    height: this._topBeltHeight,
                    material: { color: this._topBeltColor }
                },
                roof: { color: this._roofColor, type: 'Asphalt' }
            })
        ]);
        this._selectedLayers = [];
        this._templateMaterialVariationSeed = null;
        this._selectedMaterialVariationSeed = null;
        this._materialVariationDebug = normalizeMaterialVariationDebugConfig(null);
        this._catalogBuildingConfigId = '';
        this.onSelectedBuildingLayersChange = null;
        this.onSelectedBuildingMaterialVariationSeedChange = null;
        this.onMaterialVariationDebugChange = null;

        this.root = document.createElement('div');
        this.root.className = 'ui-hud-root building-fab-hud';
        this.root.id = 'building-fab-hud';

        this.panel = document.createElement('div');
        this.panel.className = 'ui-panel is-interactive building-fab-panel building-fab-create-panel';

        this.leftStack = document.createElement('div');
        this.leftStack.className = 'building-fab-left-stack';

        this.viewPanel = document.createElement('div');
        this.viewPanel.className = 'ui-panel is-interactive building-fab-panel building-fab-view-panel';

        this.propsPanel = document.createElement('div');
        this.propsPanel.className = 'ui-panel is-interactive building-fab-panel building-fab-props-panel';

        this.roadsPanel = document.createElement('div');
        this.roadsPanel.className = 'ui-panel is-interactive building-fab-panel building-fab-roads-panel';

        this.buildingsPanel = document.createElement('div');
        this.buildingsPanel.className = 'ui-panel is-interactive building-fab-panel building-fab-buildings-panel';

        this.toastPanel = document.createElement('div');
        this.toastPanel.className = 'ui-panel is-interactive building-fab-panel building-fab-toast-panel hidden';

        this.bottomRow = document.createElement('div');
        this.bottomRow.className = 'building-fab-bottom-row';

        this.title = document.createElement('div');
        this.title.className = 'ui-title';
        this.title.textContent = 'Fabrication';

        this.hint = document.createElement('div');
        this.hint.className = 'building-fab-hint';
        this.hint.textContent = 'Start a new construction on the left, then follow the steps.';

        this.counts = document.createElement('div');
        this.counts.className = 'building-fab-counts';
        this.selectedCountEl = document.createElement('div');
        this.selectedCountEl.className = 'building-fab-count';
        this.buildingCountEl = document.createElement('div');
        this.buildingCountEl.className = 'building-fab-count';
        this.roadCountEl = document.createElement('div');
        this.roadCountEl.className = 'building-fab-count';
        this.counts.appendChild(this.selectedCountEl);
        this.counts.appendChild(this.buildingCountEl);
        this.counts.appendChild(this.roadCountEl);
        this.setSelectedCount(0);
        this.setBuildingCount(0);
        this.setRoadCount(0);

        this.createSection = document.createElement('div');
        this.createSection.className = 'building-fab-section';
        this.createTitle = document.createElement('div');
        this.createTitle.className = 'ui-section-label is-tight';
        this.createTitle.textContent = 'Create';

        this.floorRow = document.createElement('div');
        this.floorRow.className = 'building-fab-row';
        this.floorLabel = document.createElement('div');
        this.floorLabel.className = 'building-fab-row-label';
        this.floorLabel.textContent = 'Floors';
        this.floorRange = document.createElement('input');
        this.floorRange.type = 'range';
        this.floorRange.min = String(this.floorMin);
        this.floorRange.max = String(this.floorMax);
        this.floorRange.step = '1';
        this.floorRange.value = String(this._floorCount);
        this.floorRange.className = 'building-fab-range';
        this.floorNumber = document.createElement('input');
        this.floorNumber.type = 'number';
        this.floorNumber.min = String(this.floorMin);
        this.floorNumber.max = String(this.floorMax);
        this.floorNumber.step = '1';
        this.floorNumber.value = String(this._floorCount);
        this.floorNumber.className = 'building-fab-number';
        this.floorRow.appendChild(this.floorLabel);
        this.floorRow.appendChild(this.floorRange);
        this.floorRow.appendChild(this.floorNumber);

        this.floorHeightRow = document.createElement('div');
        this.floorHeightRow.className = 'building-fab-row';
        this.floorHeightLabel = document.createElement('div');
        this.floorHeightLabel.className = 'building-fab-row-label';
        this.floorHeightLabel.textContent = 'Floor height (m)';
        this.floorHeightRange = document.createElement('input');
        this.floorHeightRange.type = 'range';
        this.floorHeightRange.min = String(this.floorHeightMin);
        this.floorHeightRange.max = String(this.floorHeightMax);
        this.floorHeightRange.step = '0.1';
        this.floorHeightRange.value = String(this._floorHeight);
        this.floorHeightRange.className = 'building-fab-range';
        this.floorHeightNumber = document.createElement('input');
        this.floorHeightNumber.type = 'number';
        this.floorHeightNumber.min = String(this.floorHeightMin);
        this.floorHeightNumber.max = String(this.floorHeightMax);
        this.floorHeightNumber.step = '0.1';
        this.floorHeightNumber.value = formatFloat(this._floorHeight, 1);
        this.floorHeightNumber.className = 'building-fab-number';
        this.floorHeightRow.appendChild(this.floorHeightLabel);
        this.floorHeightRow.appendChild(this.floorHeightRange);
        this.floorHeightRow.appendChild(this.floorHeightNumber);

        this.viewModeRow = document.createElement('div');
        this.viewModeRow.className = 'building-fab-view-modes';

        const makeViewModeBtn = (mode, label) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab-view-mode';
            btn.dataset.mode = mode;
            btn.textContent = label;
            return btn;
        };

        this.meshModeBtn = makeViewModeBtn('mesh', 'Mesh');
        this.wireframeModeBtn = makeViewModeBtn('wireframe', 'Wireframe');
        this.floorModeBtn = makeViewModeBtn('floors', 'Floors');
        this.floorplanModeBtn = makeViewModeBtn('floorplan', 'Floorplan');

        this._viewModeButtons = [
            this.meshModeBtn,
            this.wireframeModeBtn,
            this.floorModeBtn,
            this.floorplanModeBtn
        ];

        this.viewModeRow.appendChild(this.meshModeBtn);
        this.viewModeRow.appendChild(this.wireframeModeBtn);
        this.viewModeRow.appendChild(this.floorModeBtn);
        this.viewModeRow.appendChild(this.floorplanModeBtn);

        this.createActions = document.createElement('div');
        this.createActions.className = 'building-fab-actions';

        this.addRoadBtn = document.createElement('button');
        this.addRoadBtn.type = 'button';
        this.addRoadBtn.className = 'building-fab-btn building-fab-btn-road';
        this.addRoadBtn.textContent = 'Create Road';

        this.startBuildingBtn = document.createElement('button');
        this.startBuildingBtn.type = 'button';
        this.startBuildingBtn.className = 'building-fab-btn building-fab-btn-primary building-fab-btn-start-building';
        this.startBuildingBtn.textContent = 'Create Building';

        this.createActions.appendChild(this.addRoadBtn);
        this.createActions.appendChild(this.startBuildingBtn);

        this.createSection.appendChild(this.createTitle);
        this.createSection.appendChild(this.createActions);

        this.toastTitle = document.createElement('div');
        this.toastTitle.className = 'ui-title is-inline';
        this.toastTitle.textContent = 'Next step';

        this.toastText = document.createElement('div');
        this.toastText.className = 'building-fab-toast-text';
        this.toastText.textContent = '';

        this.toastActions = document.createElement('div');
        this.toastActions.className = 'building-fab-toast-actions';

        this.cancelModeBtn = document.createElement('button');
        this.cancelModeBtn.type = 'button';
        this.cancelModeBtn.className = 'building-fab-btn';
        this.cancelModeBtn.textContent = 'Cancel';

        this.clearSelBtn = document.createElement('button');
        this.clearSelBtn.type = 'button';
        this.clearSelBtn.className = 'building-fab-btn';
        this.clearSelBtn.textContent = 'Clear selection';

        this.buildBtn = document.createElement('button');
        this.buildBtn.type = 'button';
        this.buildBtn.className = 'building-fab-btn building-fab-btn-primary';
        this.buildBtn.textContent = 'Build';

        this.roadDoneBtn = document.createElement('button');
        this.roadDoneBtn.type = 'button';
        this.roadDoneBtn.className = 'building-fab-btn building-fab-btn-primary hidden';
        this.roadDoneBtn.textContent = 'Done';

        this.toastActions.appendChild(this.cancelModeBtn);
        this.toastActions.appendChild(this.clearSelBtn);
        this.toastActions.appendChild(this.buildBtn);
        this.toastActions.appendChild(this.roadDoneBtn);

        this.toastPanel.appendChild(this.toastTitle);
        this.toastPanel.appendChild(this.toastText);
        this.toastPanel.appendChild(this.toastActions);

        this.roadsTitle = document.createElement('div');
        this.roadsTitle.className = 'ui-title';
        this.roadsTitle.textContent = 'Roads';

        this.roadList = document.createElement('div');
        this.roadList.className = 'building-fab-road-list';

        this.roadsPanel.appendChild(this.roadsTitle);
        this.roadsPanel.appendChild(this.roadList);

        this.resetBtn = document.createElement('button');
        this.resetBtn.type = 'button';
        this.resetBtn.className = 'building-fab-btn building-fab-btn-danger building-fab-view-reset';
        this.resetBtn.textContent = 'Reset scene';

        this.viewTitle = document.createElement('div');
        this.viewTitle.className = 'ui-title';
        this.viewTitle.textContent = 'View';

        this.viewPanel.appendChild(this.viewTitle);
        this.viewPanel.appendChild(this.viewModeRow);

        this.viewOptionsRow = document.createElement('div');
        this.viewOptionsRow.className = 'building-fab-toggle-row building-fab-view-options';

        this.hideSelectionBorderToggle = document.createElement('label');
        this.hideSelectionBorderToggle.className = 'building-fab-toggle';

        this.hideSelectionBorderInput = document.createElement('input');
        this.hideSelectionBorderInput.type = 'checkbox';
        this.hideSelectionBorderInput.checked = this._hideSelectionBorder;

        this.hideSelectionBorderText = document.createElement('span');
        this.hideSelectionBorderText.textContent = 'Hide selection border';

        this.hideSelectionBorderToggle.appendChild(this.hideSelectionBorderInput);
        this.hideSelectionBorderToggle.appendChild(this.hideSelectionBorderText);
        this.viewOptionsRow.appendChild(this.hideSelectionBorderToggle);

        this.viewPanel.appendChild(this.viewOptionsRow);
        this.viewPanel.appendChild(this.resetBtn);

        this.propsTitle = document.createElement('div');
        this.propsTitle.className = 'ui-title';
        this.propsTitle.textContent = 'PROPERTIES';

        this.nameRow = document.createElement('div');
        this.nameRow.className = 'building-fab-row building-fab-row-wide';
        this.nameLabel = document.createElement('div');
        this.nameLabel.className = 'building-fab-row-label';
        this.nameLabel.textContent = 'Name';
        this.nameValue = document.createElement('div');
        this.nameValue.className = 'building-fab-selected-building';
        this.nameValue.textContent = 'No building selected.';
        this.nameRow.appendChild(this.nameLabel);
        this.nameRow.appendChild(this.nameValue);

        this.typeRow = document.createElement('div');
        this.typeRow.className = 'building-fab-row building-fab-row-wide';
        this.typeLabel = document.createElement('div');
        this.typeLabel.className = 'building-fab-row-label';
        this.typeLabel.textContent = 'Type';
        this.typeSelect = document.createElement('select');
        this.typeSelect.className = 'building-fab-select';

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
        this.typeSelect.value = this._buildingType;

        this.loadCatalogRow = document.createElement('div');
        this.loadCatalogRow.className = 'building-fab-row';
        this.loadCatalogLabel = document.createElement('div');
        this.loadCatalogLabel.className = 'building-fab-row-label';
        this.loadCatalogLabel.textContent = 'Load config';
        this.loadCatalogSelect = document.createElement('select');
        this.loadCatalogSelect.className = 'building-fab-select';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select building config';
        this.loadCatalogSelect.appendChild(placeholder);

        const catalogConfigs = getBuildingConfigs();
        catalogConfigs.sort((a, b) => {
            const al = String(a?.name ?? a?.id ?? '').toLowerCase();
            const bl = String(b?.name ?? b?.id ?? '').toLowerCase();
            return al.localeCompare(bl);
        });
        for (const cfg of catalogConfigs) {
            const id = typeof cfg?.id === 'string' ? cfg.id : '';
            if (!id) continue;
            const opt = document.createElement('option');
            opt.value = id;
            const name = typeof cfg?.name === 'string' ? cfg.name : '';
            opt.textContent = name ? `${name} (${id})` : id;
            this.loadCatalogSelect.appendChild(opt);
        }
        this.loadCatalogSelect.value = this._catalogBuildingConfigId;

        this.loadCatalogBtn = document.createElement('button');
        this.loadCatalogBtn.type = 'button';
        this.loadCatalogBtn.className = 'building-fab-btn building-fab-btn-road';
        this.loadCatalogBtn.textContent = 'Load';
        this.loadCatalogBtn.disabled = true;

        this.loadCatalogRow.appendChild(this.loadCatalogLabel);
        this.loadCatalogRow.appendChild(this.loadCatalogSelect);
        this.loadCatalogRow.appendChild(this.loadCatalogBtn);

        this.deleteBuildingBtn = document.createElement('button');
        this.deleteBuildingBtn.type = 'button';
        this.deleteBuildingBtn.className = 'building-fab-btn building-fab-btn-danger';
        this.deleteBuildingBtn.textContent = 'Delete selected building';
        this.deleteBuildingBtn.disabled = true;

        this.exportBuildingBtn = document.createElement('button');
        this.exportBuildingBtn.type = 'button';
        this.exportBuildingBtn.className = 'building-fab-btn building-fab-btn-road building-fab-btn-export';
        this.exportBuildingBtn.textContent = 'EXPORT';

        this.typeRow.appendChild(this.typeLabel);
        this.typeRow.appendChild(this.typeSelect);

        this.styleRow = document.createElement('div');
        this.styleRow.className = 'building-fab-row building-fab-row-texture';
        this.styleLabel = document.createElement('div');
        this.styleLabel.className = 'building-fab-row-label';
        this.styleLabel.textContent = 'Style';
        this.stylePicker = document.createElement('div');
        this.stylePicker.className = 'building-fab-texture-picker building-fab-material-picker';
        this.stylePickButton = document.createElement('button');
        this.stylePickButton.type = 'button';
        this.stylePickButton.className = 'building-fab-material-button';
        this.stylePickThumb = document.createElement('div');
        this.stylePickThumb.className = 'building-fab-material-thumb';
        this.stylePickText = document.createElement('div');
        this.stylePickText.className = 'building-fab-material-text';
        this.stylePickText.textContent = '';
        this.stylePickButton.appendChild(this.stylePickThumb);
        this.stylePickButton.appendChild(this.stylePickText);
        this.styleStatus = document.createElement('div');
        this.styleStatus.className = 'building-fab-texture-status';
        this.styleStatus.textContent = '';
        this.stylePicker.appendChild(this.stylePickButton);
        this.stylePicker.appendChild(this.styleStatus);
        this.styleRow.appendChild(this.styleLabel);
        this.styleRow.appendChild(this.stylePicker);

        this.propsPanel.appendChild(this.propsTitle);
        this.propsPanel.appendChild(this.nameRow);
        this.propsPanel.appendChild(this.typeRow);
        this.propsPanel.appendChild(this.loadCatalogRow);
        this.propsPanel.appendChild(this.deleteBuildingBtn);
        this.propsPanel.appendChild(this.exportBuildingBtn);

        const makeRangeRow = (label) => {
            const row = document.createElement('div');
            row.className = 'building-fab-row';
            const l = document.createElement('div');
            l.className = 'building-fab-row-label';
            l.textContent = label;
            const range = document.createElement('input');
            range.type = 'range';
            range.className = 'building-fab-range';
            const number = document.createElement('input');
            number.type = 'number';
            number.className = 'building-fab-number';
            row.appendChild(l);
            row.appendChild(range);
            row.appendChild(number);
            return { row, range, number };
        };

        this.streetEnabledToggle = document.createElement('label');
        this.streetEnabledToggle.className = 'building-fab-toggle building-fab-toggle-wide building-fab-section-toggle';

        this.streetEnabledInput = document.createElement('input');
        this.streetEnabledInput.type = 'checkbox';
        this.streetEnabledInput.checked = this._streetEnabled;

        this.streetEnabledText = document.createElement('span');
        this.streetEnabledText.textContent = 'Enable street floors';

        this.streetEnabledToggle.appendChild(this.streetEnabledInput);
        this.streetEnabledToggle.appendChild(this.streetEnabledText);

        const streetFloorsRow = makeRangeRow('Street floors');
        this.streetFloorsRow = streetFloorsRow.row;
        this.streetFloorsRange = streetFloorsRow.range;
        this.streetFloorsNumber = streetFloorsRow.number;
        this.streetFloorsRange.min = '0';
        this.streetFloorsRange.max = String(this.floorMax);
        this.streetFloorsRange.step = '1';
        this.streetFloorsNumber.min = '0';
        this.streetFloorsNumber.max = String(this.floorMax);
        this.streetFloorsNumber.step = '1';

        const streetHeightRow = makeRangeRow('Street floor height (m)');
        this.streetHeightRow = streetHeightRow.row;
        this.streetHeightRange = streetHeightRow.range;
        this.streetHeightNumber = streetHeightRow.number;
        this.streetHeightRange.min = '1.0';
        this.streetHeightRange.max = '12.0';
        this.streetHeightRange.step = '0.1';
        this.streetHeightNumber.min = '1.0';
        this.streetHeightNumber.max = '12.0';
        this.streetHeightNumber.step = '0.1';

        this.streetStyleRow = document.createElement('div');
        this.streetStyleRow.className = 'building-fab-row building-fab-row-texture';
        this.streetStyleLabel = document.createElement('div');
        this.streetStyleLabel.className = 'building-fab-row-label';
        this.streetStyleLabel.textContent = 'Street style';
        this.streetStylePicker = document.createElement('div');
        this.streetStylePicker.className = 'building-fab-texture-picker building-fab-material-picker';
        this.streetStylePickButton = document.createElement('button');
        this.streetStylePickButton.type = 'button';
        this.streetStylePickButton.className = 'building-fab-material-button';
        this.streetStylePickThumb = document.createElement('div');
        this.streetStylePickThumb.className = 'building-fab-material-thumb';
        this.streetStylePickText = document.createElement('div');
        this.streetStylePickText.className = 'building-fab-material-text';
        this.streetStylePickText.textContent = '';
        this.streetStylePickButton.appendChild(this.streetStylePickThumb);
        this.streetStylePickButton.appendChild(this.streetStylePickText);
        this.streetStyleStatus = document.createElement('div');
        this.streetStyleStatus.className = 'building-fab-texture-status';
        this.streetStyleStatus.textContent = '';
        this.streetStylePicker.appendChild(this.streetStylePickButton);
        this.streetStylePicker.appendChild(this.streetStyleStatus);
        this.streetStyleRow.appendChild(this.streetStyleLabel);
        this.streetStyleRow.appendChild(this.streetStylePicker);

        this.beltCourseToggle = document.createElement('label');
        this.beltCourseToggle.className = 'building-fab-toggle building-fab-toggle-wide';

        this.beltCourseInput = document.createElement('input');
        this.beltCourseInput.type = 'checkbox';
        this.beltCourseInput.checked = this._beltCourseEnabled;

        this.beltCourseText = document.createElement('span');
        this.beltCourseText.textContent = 'Street Floor Belt';

        this.beltCourseToggle.appendChild(this.beltCourseInput);
        this.beltCourseToggle.appendChild(this.beltCourseText);

        this.beltStatus = document.createElement('div');
        this.beltStatus.className = 'building-fab-texture-status';
        this.beltStatus.textContent = '';

        const beltMarginRow = makeRangeRow('Belt margin (m)');
        this.beltMarginRow = beltMarginRow.row;
        this.beltMarginRange = beltMarginRow.range;
        this.beltMarginNumber = beltMarginRow.number;
        this.beltMarginRange.min = '0';
        this.beltMarginRange.max = '4';
        this.beltMarginRange.step = '0.1';
        this.beltMarginNumber.min = '0';
        this.beltMarginNumber.max = '4';
        this.beltMarginNumber.step = '0.1';

        const beltHeightRow = makeRangeRow('Belt height (m)');
        this.beltHeightRow = beltHeightRow.row;
        this.beltHeightRange = beltHeightRow.range;
        this.beltHeightNumber = beltHeightRow.number;
        this.beltHeightRange.min = '0.02';
        this.beltHeightRange.max = '1.2';
        this.beltHeightRange.step = '0.01';
        this.beltHeightNumber.min = '0.02';
        this.beltHeightNumber.max = '1.2';
        this.beltHeightNumber.step = '0.01';

        this.topBeltToggle = document.createElement('label');
        this.topBeltToggle.className = 'building-fab-toggle building-fab-toggle-wide';

        this.topBeltInput = document.createElement('input');
        this.topBeltInput.type = 'checkbox';
        this.topBeltInput.checked = this._topBeltEnabled;

        this.topBeltText = document.createElement('span');
        this.topBeltText.textContent = 'Top level belt';

        this.topBeltToggle.appendChild(this.topBeltInput);
        this.topBeltToggle.appendChild(this.topBeltText);

        const topBeltWidthRow = makeRangeRow('Top belt width (m)');
        this.topBeltWidthRow = topBeltWidthRow.row;
        this.topBeltWidthRange = topBeltWidthRow.range;
        this.topBeltWidthNumber = topBeltWidthRow.number;
        this.topBeltWidthRange.min = '0';
        this.topBeltWidthRange.max = '4';
        this.topBeltWidthRange.step = '0.1';
        this.topBeltWidthNumber.min = '0';
        this.topBeltWidthNumber.max = '4';
        this.topBeltWidthNumber.step = '0.1';

        const topBeltInnerWidthRow = makeRangeRow('Top belt inner width (m)');
        this.topBeltInnerWidthRow = topBeltInnerWidthRow.row;
        this.topBeltInnerWidthRange = topBeltInnerWidthRow.range;
        this.topBeltInnerWidthNumber = topBeltInnerWidthRow.number;
        this.topBeltInnerWidthRange.min = '0';
        this.topBeltInnerWidthRange.max = '4';
        this.topBeltInnerWidthRange.step = '0.1';
        this.topBeltInnerWidthNumber.min = '0';
        this.topBeltInnerWidthNumber.max = '4';
        this.topBeltInnerWidthNumber.step = '0.1';

        const topBeltHeightRow = makeRangeRow('Top belt height (m)');
        this.topBeltHeightRow = topBeltHeightRow.row;
        this.topBeltHeightRange = topBeltHeightRow.range;
        this.topBeltHeightNumber = topBeltHeightRow.number;
        this.topBeltHeightRange.min = '0.02';
        this.topBeltHeightRange.max = '1.2';
        this.topBeltHeightRange.step = '0.01';
        this.topBeltHeightNumber.min = '0.02';
        this.topBeltHeightNumber.max = '1.2';
        this.topBeltHeightNumber.step = '0.01';

        this.beltColorRow = document.createElement('div');
        this.beltColorRow.className = 'building-fab-row building-fab-row-texture';
        this.beltColorLabel = document.createElement('div');
        this.beltColorLabel.className = 'building-fab-row-label';
        this.beltColorLabel.textContent = 'Belt color';
        this.beltColorPicker = document.createElement('div');
        this.beltColorPicker.className = 'building-fab-texture-picker building-fab-material-picker';
        this.beltColorPickButton = document.createElement('button');
        this.beltColorPickButton.type = 'button';
        this.beltColorPickButton.className = 'building-fab-material-button';
        this.beltColorPickThumb = document.createElement('div');
        this.beltColorPickThumb.className = 'building-fab-material-thumb';
        this.beltColorPickText = document.createElement('div');
        this.beltColorPickText.className = 'building-fab-material-text';
        this.beltColorPickText.textContent = '';
        this.beltColorPickButton.appendChild(this.beltColorPickThumb);
        this.beltColorPickButton.appendChild(this.beltColorPickText);
        this.beltColorStatus = document.createElement('div');
        this.beltColorStatus.className = 'building-fab-texture-status';
        this.beltColorStatus.textContent = '';
        this.beltColorPicker.appendChild(this.beltColorPickButton);
        this.beltColorPicker.appendChild(this.beltColorStatus);
        this.beltColorRow.appendChild(this.beltColorLabel);
        this.beltColorRow.appendChild(this.beltColorPicker);

        this.topBeltColorRow = document.createElement('div');
        this.topBeltColorRow.className = 'building-fab-row building-fab-row-texture';
        this.topBeltColorLabel = document.createElement('div');
        this.topBeltColorLabel.className = 'building-fab-row-label';
        this.topBeltColorLabel.textContent = 'Roof belt color';
        this.topBeltColorPicker = document.createElement('div');
        this.topBeltColorPicker.className = 'building-fab-texture-picker building-fab-material-picker';
        this.topBeltColorPickButton = document.createElement('button');
        this.topBeltColorPickButton.type = 'button';
        this.topBeltColorPickButton.className = 'building-fab-material-button';
        this.topBeltColorPickThumb = document.createElement('div');
        this.topBeltColorPickThumb.className = 'building-fab-material-thumb';
        this.topBeltColorPickText = document.createElement('div');
        this.topBeltColorPickText.className = 'building-fab-material-text';
        this.topBeltColorPickText.textContent = '';
        this.topBeltColorPickButton.appendChild(this.topBeltColorPickThumb);
        this.topBeltColorPickButton.appendChild(this.topBeltColorPickText);
        this.topBeltColorStatus = document.createElement('div');
        this.topBeltColorStatus.className = 'building-fab-texture-status';
        this.topBeltColorStatus.textContent = '';
        this.topBeltColorPicker.appendChild(this.topBeltColorPickButton);
        this.topBeltColorPicker.appendChild(this.topBeltColorStatus);
        this.topBeltColorRow.appendChild(this.topBeltColorLabel);
        this.topBeltColorRow.appendChild(this.topBeltColorPicker);

        this.roofColorRow = document.createElement('div');
        this.roofColorRow.className = 'building-fab-row building-fab-row-texture';
        this.roofColorLabel = document.createElement('div');
        this.roofColorLabel.className = 'building-fab-row-label';
        this.roofColorLabel.textContent = 'Roof color';
        this.roofColorPicker = document.createElement('div');
        this.roofColorPicker.className = 'building-fab-texture-picker building-fab-material-picker';
        this.roofColorPickButton = document.createElement('button');
        this.roofColorPickButton.type = 'button';
        this.roofColorPickButton.className = 'building-fab-material-button';
        this.roofColorPickThumb = document.createElement('div');
        this.roofColorPickThumb.className = 'building-fab-material-thumb';
        this.roofColorPickText = document.createElement('div');
        this.roofColorPickText.className = 'building-fab-material-text';
        this.roofColorPickText.textContent = '';
        this.roofColorPickButton.appendChild(this.roofColorPickThumb);
        this.roofColorPickButton.appendChild(this.roofColorPickText);
        this.roofColorStatus = document.createElement('div');
        this.roofColorStatus.className = 'building-fab-texture-status';
        this.roofColorStatus.textContent = '';
        this.roofColorPicker.appendChild(this.roofColorPickButton);
        this.roofColorPicker.appendChild(this.roofColorStatus);
        this.roofColorRow.appendChild(this.roofColorLabel);
        this.roofColorRow.appendChild(this.roofColorPicker);

        this.windowStyleRow = document.createElement('div');
        this.windowStyleRow.className = 'building-fab-row building-fab-row-texture';
        this.windowStyleLabel = document.createElement('div');
        this.windowStyleLabel.className = 'building-fab-row-label';
        this.windowStyleLabel.textContent = 'Window';
        this.windowStylePicker = document.createElement('div');
        this.windowStylePicker.className = 'building-fab-texture-picker building-fab-material-picker';
        this.windowStylePickButton = document.createElement('button');
        this.windowStylePickButton.type = 'button';
        this.windowStylePickButton.className = 'building-fab-material-button';
        this.windowStylePickThumb = document.createElement('div');
        this.windowStylePickThumb.className = 'building-fab-material-thumb';
        this.windowStylePickText = document.createElement('div');
        this.windowStylePickText.className = 'building-fab-material-text';
        this.windowStylePickText.textContent = '';
        this.windowStylePickButton.appendChild(this.windowStylePickThumb);
        this.windowStylePickButton.appendChild(this.windowStylePickText);
        this.windowStyleStatus = document.createElement('div');
        this.windowStyleStatus.className = 'building-fab-texture-status';
        this.windowStyleStatus.textContent = '';
        this.windowStylePicker.appendChild(this.windowStylePickButton);
        this.windowStylePicker.appendChild(this.windowStyleStatus);
        this.windowStyleRow.appendChild(this.windowStyleLabel);
        this.windowStyleRow.appendChild(this.windowStylePicker);

        this.streetWindowStyleRow = document.createElement('div');
        this.streetWindowStyleRow.className = 'building-fab-row building-fab-row-texture';
        this.streetWindowStyleLabel = document.createElement('div');
        this.streetWindowStyleLabel.className = 'building-fab-row-label';
        this.streetWindowStyleLabel.textContent = 'Window';
        this.streetWindowStylePicker = document.createElement('div');
        this.streetWindowStylePicker.className = 'building-fab-texture-picker building-fab-material-picker';
        this.streetWindowStylePickButton = document.createElement('button');
        this.streetWindowStylePickButton.type = 'button';
        this.streetWindowStylePickButton.className = 'building-fab-material-button';
        this.streetWindowStylePickThumb = document.createElement('div');
        this.streetWindowStylePickThumb.className = 'building-fab-material-thumb';
        this.streetWindowStylePickText = document.createElement('div');
        this.streetWindowStylePickText.className = 'building-fab-material-text';
        this.streetWindowStylePickText.textContent = '';
        this.streetWindowStylePickButton.appendChild(this.streetWindowStylePickThumb);
        this.streetWindowStylePickButton.appendChild(this.streetWindowStylePickText);
        this.streetWindowStyleStatus = document.createElement('div');
        this.streetWindowStyleStatus.className = 'building-fab-texture-status';
        this.streetWindowStyleStatus.textContent = '';
        this.streetWindowStylePicker.appendChild(this.streetWindowStylePickButton);
        this.streetWindowStylePicker.appendChild(this.streetWindowStyleStatus);
        this.streetWindowStyleRow.appendChild(this.streetWindowStyleLabel);
        this.streetWindowStyleRow.appendChild(this.streetWindowStylePicker);

        const widthRow = makeRangeRow('Window width (m)');
        this.windowWidthRow = widthRow.row;
        this.windowWidthRange = widthRow.range;
        this.windowWidthNumber = widthRow.number;
        this.windowWidthRange.min = '0.3';
        this.windowWidthRange.max = '12';
        this.windowWidthRange.step = '0.1';
        this.windowWidthNumber.min = '0.3';
        this.windowWidthNumber.max = '12';
        this.windowWidthNumber.step = '0.1';

        const gapRow = makeRangeRow('Window spacing (m)');
        this.windowGapRow = gapRow.row;
        this.windowGapRange = gapRow.range;
        this.windowGapNumber = gapRow.number;
        this.windowGapRange.min = '0';
        this.windowGapRange.max = '24';
        this.windowGapRange.step = '0.1';
        this.windowGapNumber.min = '0';
        this.windowGapNumber.max = '24';
        this.windowGapNumber.step = '0.1';

        const heightRow = makeRangeRow('Window height (m)');
        this.windowHeightRow = heightRow.row;
        this.windowHeightRange = heightRow.range;
        this.windowHeightNumber = heightRow.number;
        this.windowHeightRange.min = '0.3';
        this.windowHeightRange.max = '10';
        this.windowHeightRange.step = '0.1';
        this.windowHeightNumber.min = '0.3';
        this.windowHeightNumber.max = '10';
        this.windowHeightNumber.step = '0.1';

        const yRow = makeRangeRow('Window y (m)');
        this.windowYRow = yRow.row;
        this.windowYRange = yRow.range;
        this.windowYNumber = yRow.number;
        this.windowYRange.min = '0';
        this.windowYRange.max = '12';
        this.windowYRange.step = '0.1';
        this.windowYNumber.min = '0';
        this.windowYNumber.max = '12';
        this.windowYNumber.step = '0.1';

        const makeParamColorRow = (labelText) => {
            const row = document.createElement('div');
            row.className = 'building-fab-row building-fab-row-texture';
            const label = document.createElement('div');
            label.className = 'building-fab-row-label';
            label.textContent = labelText;
            const picker = document.createElement('div');
            picker.className = 'building-fab-texture-picker building-fab-material-picker';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab-material-button';
            const thumb = document.createElement('div');
            thumb.className = 'building-fab-material-thumb';
            const text = document.createElement('div');
            text.className = 'building-fab-material-text';
            text.textContent = '';
            btn.appendChild(thumb);
            btn.appendChild(text);
            picker.appendChild(btn);
            row.appendChild(label);
            row.appendChild(picker);
            return { row, btn, thumb, text };
        };

        const windowFrameWidthRow = makeRangeRow('Frame width');
        this.windowFrameWidthRow = windowFrameWidthRow.row;
        this.windowFrameWidthRange = windowFrameWidthRow.range;
        this.windowFrameWidthNumber = windowFrameWidthRow.number;
        this.windowFrameWidthRange.min = '0.02';
        this.windowFrameWidthRange.max = '0.2';
        this.windowFrameWidthRange.step = '0.01';
        this.windowFrameWidthNumber.min = '0.02';
        this.windowFrameWidthNumber.max = '0.2';
        this.windowFrameWidthNumber.step = '0.01';

        const windowFrameColorRow = makeParamColorRow('Frame color');
        this.windowFrameColorRow = windowFrameColorRow.row;
        this.windowFrameColorPickButton = windowFrameColorRow.btn;
        this.windowFrameColorPickThumb = windowFrameColorRow.thumb;
        this.windowFrameColorPickText = windowFrameColorRow.text;

        const windowGlassTopRow = makeParamColorRow('Glass top');
        this.windowGlassTopRow = windowGlassTopRow.row;
        this.windowGlassTopPickButton = windowGlassTopRow.btn;
        this.windowGlassTopPickThumb = windowGlassTopRow.thumb;
        this.windowGlassTopPickText = windowGlassTopRow.text;

        const windowGlassBottomRow = makeParamColorRow('Glass bottom');
        this.windowGlassBottomRow = windowGlassBottomRow.row;
        this.windowGlassBottomPickButton = windowGlassBottomRow.btn;
        this.windowGlassBottomPickThumb = windowGlassBottomRow.thumb;
        this.windowGlassBottomPickText = windowGlassBottomRow.text;

        const wallInsetRow = makeRangeRow('Wall inset (m)');
        this.wallInsetRow = wallInsetRow.row;
        this.wallInsetRange = wallInsetRow.range;
        this.wallInsetNumber = wallInsetRow.number;
        this.wallInsetRange.min = '0';
        this.wallInsetRange.max = '4';
        this.wallInsetRange.step = '0.05';
        this.wallInsetNumber.min = '0';
        this.wallInsetNumber.max = '4';
        this.wallInsetNumber.step = '0.05';

        this.windowSpacerToggle = document.createElement('label');
        this.windowSpacerToggle.className = 'building-fab-toggle building-fab-toggle-wide';
        this.windowSpacerInput = document.createElement('input');
        this.windowSpacerInput.type = 'checkbox';
        this.windowSpacerInput.checked = this._windowSpacerEnabled;
        this.windowSpacerText = document.createElement('span');
        this.windowSpacerText.textContent = 'Window spacer';
        this.windowSpacerToggle.appendChild(this.windowSpacerInput);
        this.windowSpacerToggle.appendChild(this.windowSpacerText);

        const windowSpacerEveryRow = makeRangeRow('Spacer every (windows)');
        this.windowSpacerEveryRow = windowSpacerEveryRow.row;
        this.windowSpacerEveryRange = windowSpacerEveryRow.range;
        this.windowSpacerEveryNumber = windowSpacerEveryRow.number;
        this.windowSpacerEveryRange.min = '1';
        this.windowSpacerEveryRange.max = '99';
        this.windowSpacerEveryRange.step = '1';
        this.windowSpacerEveryNumber.min = '1';
        this.windowSpacerEveryNumber.max = '99';
        this.windowSpacerEveryNumber.step = '1';

        const windowSpacerWidthRow = makeRangeRow('Spacer width (m)');
        this.windowSpacerWidthRow = windowSpacerWidthRow.row;
        this.windowSpacerWidthRange = windowSpacerWidthRow.range;
        this.windowSpacerWidthNumber = windowSpacerWidthRow.number;
        this.windowSpacerWidthRange.min = '0.1';
        this.windowSpacerWidthRange.max = '10';
        this.windowSpacerWidthRange.step = '0.1';
        this.windowSpacerWidthNumber.min = '0.1';
        this.windowSpacerWidthNumber.max = '10';
        this.windowSpacerWidthNumber.step = '0.1';

        this.windowSpacerExtrudeToggle = document.createElement('label');
        this.windowSpacerExtrudeToggle.className = 'building-fab-toggle building-fab-toggle-wide';
        this.windowSpacerExtrudeInput = document.createElement('input');
        this.windowSpacerExtrudeInput.type = 'checkbox';
        this.windowSpacerExtrudeInput.checked = this._windowSpacerExtrude;
        this.windowSpacerExtrudeText = document.createElement('span');
        this.windowSpacerExtrudeText.textContent = 'Spacer extrude';
        this.windowSpacerExtrudeToggle.appendChild(this.windowSpacerExtrudeInput);
        this.windowSpacerExtrudeToggle.appendChild(this.windowSpacerExtrudeText);

        const windowSpacerExtrudeRow = makeRangeRow('Spacer extrude (m)');
        this.windowSpacerExtrudeDistanceRow = windowSpacerExtrudeRow.row;
        this.windowSpacerExtrudeDistanceRange = windowSpacerExtrudeRow.range;
        this.windowSpacerExtrudeDistanceNumber = windowSpacerExtrudeRow.number;
        this.windowSpacerExtrudeDistanceRange.min = '0';
        this.windowSpacerExtrudeDistanceRange.max = '1';
        this.windowSpacerExtrudeDistanceRange.step = '0.01';
        this.windowSpacerExtrudeDistanceNumber.min = '0';
        this.windowSpacerExtrudeDistanceNumber.max = '1';
        this.windowSpacerExtrudeDistanceNumber.step = '0.01';

        const streetWidthRow = makeRangeRow('Window width (m)');
        this.streetWindowWidthRow = streetWidthRow.row;
        this.streetWindowWidthRange = streetWidthRow.range;
        this.streetWindowWidthNumber = streetWidthRow.number;
        this.streetWindowWidthRange.min = '0.3';
        this.streetWindowWidthRange.max = '12';
        this.streetWindowWidthRange.step = '0.1';
        this.streetWindowWidthNumber.min = '0.3';
        this.streetWindowWidthNumber.max = '12';
        this.streetWindowWidthNumber.step = '0.1';

        const streetGapRow = makeRangeRow('Window spacing (m)');
        this.streetWindowGapRow = streetGapRow.row;
        this.streetWindowGapRange = streetGapRow.range;
        this.streetWindowGapNumber = streetGapRow.number;
        this.streetWindowGapRange.min = '0';
        this.streetWindowGapRange.max = '24';
        this.streetWindowGapRange.step = '0.1';
        this.streetWindowGapNumber.min = '0';
        this.streetWindowGapNumber.max = '24';
        this.streetWindowGapNumber.step = '0.1';

        const streetHeight2Row = makeRangeRow('Window height (m)');
        this.streetWindowHeightRow = streetHeight2Row.row;
        this.streetWindowHeightRange = streetHeight2Row.range;
        this.streetWindowHeightNumber = streetHeight2Row.number;
        this.streetWindowHeightRange.min = '0.3';
        this.streetWindowHeightRange.max = '10';
        this.streetWindowHeightRange.step = '0.1';
        this.streetWindowHeightNumber.min = '0.3';
        this.streetWindowHeightNumber.max = '10';
        this.streetWindowHeightNumber.step = '0.1';

        const streetYRow = makeRangeRow('Window y (m)');
        this.streetWindowYRow = streetYRow.row;
        this.streetWindowYRange = streetYRow.range;
        this.streetWindowYNumber = streetYRow.number;
        this.streetWindowYRange.min = '0';
        this.streetWindowYRange.max = '12';
        this.streetWindowYRange.step = '0.1';
        this.streetWindowYNumber.min = '0';
        this.streetWindowYNumber.max = '12';
        this.streetWindowYNumber.step = '0.1';

        const streetWindowFrameWidthRow = makeRangeRow('Frame width');
        this.streetWindowFrameWidthRow = streetWindowFrameWidthRow.row;
        this.streetWindowFrameWidthRange = streetWindowFrameWidthRow.range;
        this.streetWindowFrameWidthNumber = streetWindowFrameWidthRow.number;
        this.streetWindowFrameWidthRange.min = '0.02';
        this.streetWindowFrameWidthRange.max = '0.2';
        this.streetWindowFrameWidthRange.step = '0.01';
        this.streetWindowFrameWidthNumber.min = '0.02';
        this.streetWindowFrameWidthNumber.max = '0.2';
        this.streetWindowFrameWidthNumber.step = '0.01';

        const streetWindowFrameColorRow = makeParamColorRow('Frame color');
        this.streetWindowFrameColorRow = streetWindowFrameColorRow.row;
        this.streetWindowFrameColorPickButton = streetWindowFrameColorRow.btn;
        this.streetWindowFrameColorPickThumb = streetWindowFrameColorRow.thumb;
        this.streetWindowFrameColorPickText = streetWindowFrameColorRow.text;

        const streetWindowGlassTopRow = makeParamColorRow('Glass top');
        this.streetWindowGlassTopRow = streetWindowGlassTopRow.row;
        this.streetWindowGlassTopPickButton = streetWindowGlassTopRow.btn;
        this.streetWindowGlassTopPickThumb = streetWindowGlassTopRow.thumb;
        this.streetWindowGlassTopPickText = streetWindowGlassTopRow.text;

        const streetWindowGlassBottomRow = makeParamColorRow('Glass bottom');
        this.streetWindowGlassBottomRow = streetWindowGlassBottomRow.row;
        this.streetWindowGlassBottomPickButton = streetWindowGlassBottomRow.btn;
        this.streetWindowGlassBottomPickThumb = streetWindowGlassBottomRow.thumb;
        this.streetWindowGlassBottomPickText = streetWindowGlassBottomRow.text;

        this.streetWindowSpacerToggle = document.createElement('label');
        this.streetWindowSpacerToggle.className = 'building-fab-toggle building-fab-toggle-wide';
        this.streetWindowSpacerInput = document.createElement('input');
        this.streetWindowSpacerInput.type = 'checkbox';
        this.streetWindowSpacerInput.checked = this._streetWindowSpacerEnabled;
        this.streetWindowSpacerText = document.createElement('span');
        this.streetWindowSpacerText.textContent = 'Window spacer';
        this.streetWindowSpacerToggle.appendChild(this.streetWindowSpacerInput);
        this.streetWindowSpacerToggle.appendChild(this.streetWindowSpacerText);

        const streetWindowSpacerEveryRow = makeRangeRow('Spacer every (windows)');
        this.streetWindowSpacerEveryRow = streetWindowSpacerEveryRow.row;
        this.streetWindowSpacerEveryRange = streetWindowSpacerEveryRow.range;
        this.streetWindowSpacerEveryNumber = streetWindowSpacerEveryRow.number;
        this.streetWindowSpacerEveryRange.min = '1';
        this.streetWindowSpacerEveryRange.max = '99';
        this.streetWindowSpacerEveryRange.step = '1';
        this.streetWindowSpacerEveryNumber.min = '1';
        this.streetWindowSpacerEveryNumber.max = '99';
        this.streetWindowSpacerEveryNumber.step = '1';

        const streetWindowSpacerWidthRow = makeRangeRow('Spacer width (m)');
        this.streetWindowSpacerWidthRow = streetWindowSpacerWidthRow.row;
        this.streetWindowSpacerWidthRange = streetWindowSpacerWidthRow.range;
        this.streetWindowSpacerWidthNumber = streetWindowSpacerWidthRow.number;
        this.streetWindowSpacerWidthRange.min = '0.1';
        this.streetWindowSpacerWidthRange.max = '10';
        this.streetWindowSpacerWidthRange.step = '0.1';
        this.streetWindowSpacerWidthNumber.min = '0.1';
        this.streetWindowSpacerWidthNumber.max = '10';
        this.streetWindowSpacerWidthNumber.step = '0.1';

        this.streetWindowSpacerExtrudeToggle = document.createElement('label');
        this.streetWindowSpacerExtrudeToggle.className = 'building-fab-toggle building-fab-toggle-wide';
        this.streetWindowSpacerExtrudeInput = document.createElement('input');
        this.streetWindowSpacerExtrudeInput.type = 'checkbox';
        this.streetWindowSpacerExtrudeInput.checked = this._streetWindowSpacerExtrude;
        this.streetWindowSpacerExtrudeText = document.createElement('span');
        this.streetWindowSpacerExtrudeText.textContent = 'Spacer extrude';
        this.streetWindowSpacerExtrudeToggle.appendChild(this.streetWindowSpacerExtrudeInput);
        this.streetWindowSpacerExtrudeToggle.appendChild(this.streetWindowSpacerExtrudeText);

        const streetWindowSpacerExtrudeRow = makeRangeRow('Spacer extrude (m)');
        this.streetWindowSpacerExtrudeDistanceRow = streetWindowSpacerExtrudeRow.row;
        this.streetWindowSpacerExtrudeDistanceRange = streetWindowSpacerExtrudeRow.range;
        this.streetWindowSpacerExtrudeDistanceNumber = streetWindowSpacerExtrudeRow.number;
        this.streetWindowSpacerExtrudeDistanceRange.min = '0';
        this.streetWindowSpacerExtrudeDistanceRange.max = '1';
        this.streetWindowSpacerExtrudeDistanceRange.step = '0.01';
        this.streetWindowSpacerExtrudeDistanceNumber.min = '0';
        this.streetWindowSpacerExtrudeDistanceNumber.max = '1';
        this.streetWindowSpacerExtrudeDistanceNumber.step = '0.01';

        const makeDetailsSection = (title, { open = true } = {}) => {
            const details = document.createElement('details');
            details.className = 'building-fab-details';
            details.open = !!open;
            const summary = document.createElement('summary');
            summary.className = 'building-fab-details-summary';
            const label = document.createElement('span');
            label.className = 'building-fab-details-title';
            label.textContent = title;
            summary.appendChild(label);
            details.appendChild(summary);
            const body = document.createElement('div');
            body.className = 'building-fab-details-body';
            details.appendChild(body);
            return { details, summary, body, label };
        };

        this.layersActions = document.createElement('div');
        this.layersActions.className = 'building-fab-layer-actions building-fab-layer-actions-bar';
        this.layersActions.addEventListener('click', (e) => e.stopPropagation());

        this.addFloorLayerBtn = document.createElement('button');
        this.addFloorLayerBtn.type = 'button';
        this.addFloorLayerBtn.className = 'building-fab-layer-btn';
        this.addFloorLayerBtn.textContent = '+ Floor layer';

        this.addRoofLayerBtn = document.createElement('button');
        this.addRoofLayerBtn.type = 'button';
        this.addRoofLayerBtn.className = 'building-fab-layer-btn';
        this.addRoofLayerBtn.textContent = '+ Roof layer';

        this.layersActions.appendChild(this.addFloorLayerBtn);
        this.layersActions.appendChild(this.addRoofLayerBtn);
        this.propsPanel.appendChild(this.layersActions);

        this.addFloorLayerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._handleAddLayer(LAYER_TYPE.FLOOR);
        });
        this.addRoofLayerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._handleAddLayer(LAYER_TYPE.ROOF);
        });

        this.layersStatus = document.createElement('div');
        this.layersStatus.className = 'building-fab-hint building-fab-layer-status';
        this.layersStatus.textContent = 'Edit the template layers, then create a building.';

        this.materialVariationSeedSection = makeDetailsSection('Material variation seed', { open: false });

        this.materialVariationSeedToggle = document.createElement('label');
        this.materialVariationSeedToggle.className = 'building-fab-toggle building-fab-toggle-wide';
        this.materialVariationSeedToggleInput = document.createElement('input');
        this.materialVariationSeedToggleInput.type = 'checkbox';
        this.materialVariationSeedToggleText = document.createElement('span');
        this.materialVariationSeedToggleText.textContent = 'Override building seed';
        this.materialVariationSeedToggle.appendChild(this.materialVariationSeedToggleInput);
        this.materialVariationSeedToggle.appendChild(this.materialVariationSeedToggleText);
        this.materialVariationSeedSection.body.appendChild(this.materialVariationSeedToggle);

        this.materialVariationSeedRow = document.createElement('div');
        this.materialVariationSeedRow.className = 'building-fab-row';
        this.materialVariationSeedLabel = document.createElement('div');
        this.materialVariationSeedLabel.className = 'building-fab-row-label';
        this.materialVariationSeedLabel.textContent = 'Seed';
        this.materialVariationSeedNumber = document.createElement('input');
        this.materialVariationSeedNumber.type = 'number';
        this.materialVariationSeedNumber.min = '0';
        this.materialVariationSeedNumber.max = '4294967295';
        this.materialVariationSeedNumber.step = '1';
        this.materialVariationSeedNumber.className = 'building-fab-number';
        this.materialVariationSeedRow.appendChild(this.materialVariationSeedLabel);
        this.materialVariationSeedRow.appendChild(this.materialVariationSeedNumber);
        this.materialVariationSeedSection.body.appendChild(this.materialVariationSeedRow);

        this.materialVariationSeedHint = document.createElement('div');
        this.materialVariationSeedHint.className = 'building-fab-hint';
        this.materialVariationSeedHint.textContent = 'When disabled, the seed is derived from the building footprint.';
        this.materialVariationSeedSection.body.appendChild(this.materialVariationSeedHint);

        this.materialVariationDebugSection = makeDetailsSection('Material variation debug', { open: false });
        this.materialVariationDebugResetBtn = document.createElement('button');
        this.materialVariationDebugResetBtn.type = 'button';
        this.materialVariationDebugResetBtn.className = 'building-fab-details-reset';
        applyMaterialSymbolToButton(this.materialVariationDebugResetBtn, { name: 'restart_alt', label: 'Reset to defaults', size: 'sm' });
        this.materialVariationDebugSection.summary.appendChild(this.materialVariationDebugResetBtn);

        const makeDebugToggle = (label) => {
            const toggle = document.createElement('label');
            toggle.className = 'building-fab-toggle building-fab-toggle-wide';
            const input = document.createElement('input');
            input.type = 'checkbox';
            const text = document.createElement('span');
            text.textContent = label;
            toggle.appendChild(input);
            toggle.appendChild(text);
            return { toggle, input, text };
        };

        const debugMasterLabel = document.createElement('div');
        debugMasterLabel.className = 'ui-section-label';
        debugMasterLabel.textContent = 'Master';
        this.materialVariationDebugSection.body.appendChild(debugMasterLabel);

        const dbgUseMatVar = makeDebugToggle('Enable mat-var injection (USE_MATVAR)');
        this.materialVariationDebugUseMatVarInput = dbgUseMatVar.input;
        this.materialVariationDebugSection.body.appendChild(dbgUseMatVar.toggle);

        const debugUvLabel = document.createElement('div');
        debugUvLabel.className = 'ui-section-label';
        debugUvLabel.textContent = 'UV transforms';
        this.materialVariationDebugSection.body.appendChild(debugUvLabel);

        const dbgStair = makeDebugToggle('Stair shift UV');
        this.materialVariationDebugUvStairInput = dbgStair.input;
        this.materialVariationDebugSection.body.appendChild(dbgStair.toggle);

        const dbgAntiOffset = makeDebugToggle('Anti-tiling offset');
        this.materialVariationDebugUvAntiOffsetInput = dbgAntiOffset.input;
        this.materialVariationDebugSection.body.appendChild(dbgAntiOffset.toggle);

        const dbgAntiRot = makeDebugToggle('Anti-tiling rotation');
        this.materialVariationDebugUvAntiRotationInput = dbgAntiRot.input;
        this.materialVariationDebugSection.body.appendChild(dbgAntiRot.toggle);

        const dbgWarp = makeDebugToggle('UV warp (quality)');
        this.materialVariationDebugUvWarpInput = dbgWarp.input;
        this.materialVariationDebugSection.body.appendChild(dbgWarp.toggle);

        const debugContribLabel = document.createElement('div');
        debugContribLabel.className = 'ui-section-label';
        debugContribLabel.textContent = 'Contributions';
        this.materialVariationDebugSection.body.appendChild(debugContribLabel);

        const dbgRough = makeDebugToggle('Roughness contribution');
        this.materialVariationDebugContribRoughnessInput = dbgRough.input;
        this.materialVariationDebugSection.body.appendChild(dbgRough.toggle);

        const dbgColor = makeDebugToggle('Tint/value/saturation contribution');
        this.materialVariationDebugContribColorInput = dbgColor.input;
        this.materialVariationDebugSection.body.appendChild(dbgColor.toggle);

        const dbgOrm = makeDebugToggle('Use AO/ORM remap');
        this.materialVariationDebugUseOrmInput = dbgOrm.input;
        this.materialVariationDebugSection.body.appendChild(dbgOrm.toggle);

        const dbgNormFactor = makeDebugToggle('Normal factor contribution');
        this.materialVariationDebugContribNormalFactorInput = dbgNormFactor.input;
        this.materialVariationDebugSection.body.appendChild(dbgNormFactor.toggle);

        const debugNormalLabel = document.createElement('div');
        debugNormalLabel.className = 'ui-section-label';
        debugNormalLabel.textContent = 'Normal map handling';
        this.materialVariationDebugSection.body.appendChild(debugNormalLabel);

        const dbgBasis = makeDebugToggle('Use original UVs for tangent basis');
        this.materialVariationDebugBasisOriginalUvInput = dbgBasis.input;
        this.materialVariationDebugSection.body.appendChild(dbgBasis.toggle);

        const dbgFlipY = makeDebugToggle('Flip normal Y (green channel)');
        this.materialVariationDebugFlipNormalYInput = dbgFlipY.input;
        this.materialVariationDebugSection.body.appendChild(dbgFlipY.toggle);

        this.materialVariationDebugHint = document.createElement('div');
        this.materialVariationDebugHint.className = 'building-fab-hint';
        this.materialVariationDebugHint.textContent = 'Debug-only, session-only shader overrides (not saved into building data).';
        this.materialVariationDebugSection.body.appendChild(this.materialVariationDebugHint);

        this.materialVariationDebugReadout = document.createElement('div');
        this.materialVariationDebugReadout.className = 'building-fab-hint building-fab-debug-readout';
        this.materialVariationDebugSection.body.appendChild(this.materialVariationDebugReadout);

        this.layersList = document.createElement('div');
        this.layersList.className = 'building-fab-layer-list';

        this.propsPanel.appendChild(this.layersStatus);
        this.propsPanel.appendChild(this.materialVariationSeedSection.details);
        this.propsPanel.appendChild(this.materialVariationDebugSection.details);
        this.propsPanel.appendChild(this.layersList);

        const floorsSection = makeDetailsSection('Floors', { open: true });
        floorsSection.body.appendChild(this.styleRow);
        floorsSection.body.appendChild(this.windowStyleRow);
        floorsSection.body.appendChild(this.floorRow);
        floorsSection.body.appendChild(this.floorHeightRow);
        floorsSection.body.appendChild(this.wallInsetRow);
        floorsSection.body.appendChild(this.windowWidthRow);
        floorsSection.body.appendChild(this.windowGapRow);
        floorsSection.body.appendChild(this.windowHeightRow);
        floorsSection.body.appendChild(this.windowYRow);
        floorsSection.body.appendChild(this.windowFrameWidthRow);
        floorsSection.body.appendChild(this.windowFrameColorRow);
        floorsSection.body.appendChild(this.windowGlassTopRow);
        floorsSection.body.appendChild(this.windowGlassBottomRow);
        floorsSection.body.appendChild(this.windowSpacerToggle);
        floorsSection.body.appendChild(this.windowSpacerEveryRow);
        floorsSection.body.appendChild(this.windowSpacerWidthRow);
        floorsSection.body.appendChild(this.windowSpacerExtrudeToggle);
        floorsSection.body.appendChild(this.windowSpacerExtrudeDistanceRow);

        const streetSection = makeDetailsSection('Street floors', { open: true });
        streetSection.summary.appendChild(this.streetEnabledToggle);
        this.streetEnabledToggle.addEventListener('click', (e) => e.stopPropagation());
        this.streetEnabledInput.addEventListener('click', (e) => e.stopPropagation());

        streetSection.body.appendChild(this.streetStyleRow);
        streetSection.body.appendChild(this.streetWindowStyleRow);
        streetSection.body.appendChild(this.streetFloorsRow);
        streetSection.body.appendChild(this.streetHeightRow);
        streetSection.body.appendChild(this.streetWindowWidthRow);
        streetSection.body.appendChild(this.streetWindowGapRow);
        streetSection.body.appendChild(this.streetWindowHeightRow);
        streetSection.body.appendChild(this.streetWindowYRow);
        streetSection.body.appendChild(this.streetWindowFrameWidthRow);
        streetSection.body.appendChild(this.streetWindowFrameColorRow);
        streetSection.body.appendChild(this.streetWindowGlassTopRow);
        streetSection.body.appendChild(this.streetWindowGlassBottomRow);
        streetSection.body.appendChild(this.streetWindowSpacerToggle);
        streetSection.body.appendChild(this.streetWindowSpacerEveryRow);
        streetSection.body.appendChild(this.streetWindowSpacerWidthRow);
        streetSection.body.appendChild(this.streetWindowSpacerExtrudeToggle);
        streetSection.body.appendChild(this.streetWindowSpacerExtrudeDistanceRow);
        streetSection.body.appendChild(this.beltCourseToggle);
        streetSection.body.appendChild(this.beltStatus);
        streetSection.body.appendChild(this.beltColorRow);
        streetSection.body.appendChild(this.beltMarginRow);
        streetSection.body.appendChild(this.beltHeightRow);

        const roofSection = makeDetailsSection('Roof', { open: true });
        roofSection.body.appendChild(this.roofColorRow);
        roofSection.body.appendChild(this.topBeltToggle);
        roofSection.body.appendChild(this.topBeltColorRow);
        roofSection.body.appendChild(this.topBeltWidthRow);
        roofSection.body.appendChild(this.topBeltInnerWidthRow);
        roofSection.body.appendChild(this.topBeltHeightRow);

        this.propsPanel.appendChild(floorsSection.details);
        this.propsPanel.appendChild(streetSection.details);
        this.propsPanel.appendChild(roofSection.details);

        floorsSection.details.classList.add('hidden');
        streetSection.details.classList.add('hidden');
        roofSection.details.classList.add('hidden');

        this.buildingsTitle = document.createElement('div');
        this.buildingsTitle.className = 'ui-title';
        this.buildingsTitle.textContent = 'Buildings';

        this.buildingsList = document.createElement('div');
        this.buildingsList.className = 'building-fab-building-list';

        this.buildingsPanel.appendChild(this.buildingsTitle);
        this.buildingsPanel.appendChild(this.buildingsList);

        this.panel.appendChild(this.title);
        this.panel.appendChild(this.createSection);

        this.leftStack.appendChild(this.viewPanel);
        this.leftStack.appendChild(this.panel);
        this.leftStack.appendChild(this.buildingsPanel);
        this.leftStack.appendChild(this.roadsPanel);
        this.root.appendChild(this.leftStack);
        this.root.appendChild(this.propsPanel);

        this.bottomRow.appendChild(this.toastPanel);
        this.root.appendChild(this.bottomRow);

        this.resetOverlay = document.createElement('div');
        this.resetOverlay.className = 'building-fab-reset-overlay hidden';

        this.resetPanel = document.createElement('div');
        this.resetPanel.className = 'ui-panel is-interactive building-fab-panel building-fab-reset-panel';

        this.resetTitle = document.createElement('div');
        this.resetTitle.className = 'ui-title';
        this.resetTitle.textContent = 'Reset Scene';

        this.resetBody = document.createElement('div');
        this.resetBody.className = 'building-fab-reset-body';

        this.resetGridRow = document.createElement('div');
        this.resetGridRow.className = 'building-fab-reset-row';

        this.resetGridLabel = document.createElement('div');
        this.resetGridLabel.className = 'building-fab-row-label';
        this.resetGridLabel.textContent = 'Grid size';

        this.resetGridNumber = document.createElement('input');
        this.resetGridNumber.type = 'number';
        this.resetGridNumber.min = String(this.gridMin);
        this.resetGridNumber.max = String(this.gridMax);
        this.resetGridNumber.step = '1';
        this.resetGridNumber.value = String(this._gridSize);
        this.resetGridNumber.className = 'building-fab-number';

        this.resetGridRow.appendChild(this.resetGridLabel);
        this.resetGridRow.appendChild(this.resetGridNumber);

        this.resetActions = document.createElement('div');
        this.resetActions.className = 'building-fab-reset-actions';

        this.resetCancelBtn = document.createElement('button');
        this.resetCancelBtn.type = 'button';
        this.resetCancelBtn.className = 'building-fab-btn';
        this.resetCancelBtn.textContent = 'Cancel';

        this.resetConfirmBtn = document.createElement('button');
        this.resetConfirmBtn.type = 'button';
        this.resetConfirmBtn.className = 'building-fab-btn building-fab-btn-danger';
        this.resetConfirmBtn.textContent = 'Reset scene';

        this.resetActions.appendChild(this.resetCancelBtn);
        this.resetActions.appendChild(this.resetConfirmBtn);

        this.resetBody.appendChild(this.resetGridRow);
        this.resetBody.appendChild(this.resetActions);

        this.resetPanel.appendChild(this.resetTitle);
        this.resetPanel.appendChild(this.resetBody);
        this.resetOverlay.appendChild(this.resetPanel);
        this.root.appendChild(this.resetOverlay);

        this.onBuildingModeChange = null;
        this.onBuildBuildings = null;
        this.onClearSelection = null;
        this.onSelectBuilding = null;
        this.onDeleteSelectedBuilding = null;
        this.onLoadBuildingConfigFromCatalog = null;
        this.onExportBuildingConfig = null;
        this.onReset = null;
        this.onRoadModeChange = null;
        this.onRoadCancel = null;
        this.onRoadDone = null;
        this.onRoadRemove = null;
        this.onRoadHover = null;
        this.onWireframeChange = null;
        this.onFloorDivisionsChange = null;
        this.onFloorplanChange = null;
        this.onHideSelectionBorderChange = null;
        this.onBuildingTypeChange = null;
        this.onBuildingStyleChange = null;
        this.onFloorCountChange = null;
        this.onFloorHeightChange = null;
        this.onStreetEnabledChange = null;
        this.onStreetFloorsChange = null;
        this.onStreetFloorHeightChange = null;
        this.onStreetStyleChange = null;
        this.onWallInsetChange = null;
        this.onBeltCourseEnabledChange = null;
        this.onBeltCourseMarginChange = null;
        this.onBeltCourseHeightChange = null;
        this.onBeltCourseColorChange = null;
        this.onTopBeltEnabledChange = null;
        this.onTopBeltWidthChange = null;
        this.onTopBeltInnerWidthChange = null;
        this.onTopBeltHeightChange = null;
        this.onTopBeltColorChange = null;
        this.onRoofColorChange = null;
        this.onWindowStyleChange = null;
        this.onWindowFrameWidthChange = null;
        this.onWindowFrameColorChange = null;
        this.onWindowGlassTopChange = null;
        this.onWindowGlassBottomChange = null;
        this.onWindowWidthChange = null;
        this.onWindowGapChange = null;
        this.onWindowHeightChange = null;
        this.onWindowYChange = null;
        this.onWindowSpacerEnabledChange = null;
        this.onWindowSpacerEveryChange = null;
        this.onWindowSpacerWidthChange = null;
        this.onWindowSpacerExtrudeChange = null;
        this.onWindowSpacerExtrudeDistanceChange = null;
        this.onStreetWindowStyleChange = null;
        this.onStreetWindowFrameWidthChange = null;
        this.onStreetWindowFrameColorChange = null;
        this.onStreetWindowGlassTopChange = null;
        this.onStreetWindowGlassBottomChange = null;
        this.onStreetWindowWidthChange = null;
        this.onStreetWindowGapChange = null;
        this.onStreetWindowHeightChange = null;
        this.onStreetWindowYChange = null;
        this.onStreetWindowSpacerEnabledChange = null;
        this.onStreetWindowSpacerEveryChange = null;
        this.onStreetWindowSpacerWidthChange = null;
        this.onStreetWindowSpacerExtrudeChange = null;
        this.onStreetWindowSpacerExtrudeDistanceChange = null;

        this._bound = false;

        this._onFloorRangeInput = () => this._setFloorCountFromUi(this.floorRange.value);
        this._onFloorNumberInput = () => this._setFloorCountFromUi(this.floorNumber.value);
        this._onFloorHeightRangeInput = () => this._setFloorHeightFromUi(this.floorHeightRange.value);
        this._onFloorHeightNumberInput = () => this._setFloorHeightFromUi(this.floorHeightNumber.value);
        this._onWallInsetRangeInput = () => this._setWallInsetFromUi(this.wallInsetRange.value);
        this._onWallInsetNumberInput = () => this._setWallInsetFromUi(this.wallInsetNumber.value);
        this._onWindowWidthRangeInput = () => this._setWindowWidthFromUi(this.windowWidthRange.value);
        this._onWindowWidthNumberInput = () => this._setWindowWidthFromUi(this.windowWidthNumber.value);
        this._onWindowGapRangeInput = () => this._setWindowGapFromUi(this.windowGapRange.value);
        this._onWindowGapNumberInput = () => this._setWindowGapFromUi(this.windowGapNumber.value);
        this._onWindowHeightRangeInput = () => this._setWindowHeightFromUi(this.windowHeightRange.value);
        this._onWindowHeightNumberInput = () => this._setWindowHeightFromUi(this.windowHeightNumber.value);
        this._onWindowYRangeInput = () => this._setWindowYFromUi(this.windowYRange.value);
        this._onWindowYNumberInput = () => this._setWindowYFromUi(this.windowYNumber.value);
        this._onWindowFrameWidthRangeInput = () => this._setWindowFrameWidthFromUi(this.windowFrameWidthRange.value);
        this._onWindowFrameWidthNumberInput = () => this._setWindowFrameWidthFromUi(this.windowFrameWidthNumber.value);
        this._onWindowFrameColorPickClick = () => this._openWindowFrameColorPicker();
        this._onWindowGlassTopPickClick = () => this._openWindowGlassTopPicker();
        this._onWindowGlassBottomPickClick = () => this._openWindowGlassBottomPicker();
        this._onWindowSpacerEnabledChange = () => this._setWindowSpacerEnabledFromUi(this.windowSpacerInput.checked);
        this._onWindowSpacerEveryRangeInput = () => this._setWindowSpacerEveryFromUi(this.windowSpacerEveryRange.value);
        this._onWindowSpacerEveryNumberInput = () => this._setWindowSpacerEveryFromUi(this.windowSpacerEveryNumber.value);
        this._onWindowSpacerWidthRangeInput = () => this._setWindowSpacerWidthFromUi(this.windowSpacerWidthRange.value);
        this._onWindowSpacerWidthNumberInput = () => this._setWindowSpacerWidthFromUi(this.windowSpacerWidthNumber.value);
        this._onWindowSpacerExtrudeChange = () => this._setWindowSpacerExtrudeFromUi(this.windowSpacerExtrudeInput.checked);
        this._onWindowSpacerExtrudeDistanceRangeInput = () => this._setWindowSpacerExtrudeDistanceFromUi(this.windowSpacerExtrudeDistanceRange.value);
        this._onWindowSpacerExtrudeDistanceNumberInput = () => this._setWindowSpacerExtrudeDistanceFromUi(this.windowSpacerExtrudeDistanceNumber.value);
        this._onStreetEnabledChange = () => this._setStreetEnabledFromUi(this.streetEnabledInput.checked);
        this._onStreetFloorsRangeInput = () => this._setStreetFloorsFromUi(this.streetFloorsRange.value);
        this._onStreetFloorsNumberInput = () => this._setStreetFloorsFromUi(this.streetFloorsNumber.value);
        this._onStreetHeightRangeInput = () => this._setStreetFloorHeightFromUi(this.streetHeightRange.value);
        this._onStreetHeightNumberInput = () => this._setStreetFloorHeightFromUi(this.streetHeightNumber.value);
        this._onStreetStylePickClick = () => this._openStreetStylePicker();
        this._onBeltCourseEnabledChange = () => this._setBeltCourseEnabledFromUi(this.beltCourseInput.checked);
        this._onBeltMarginRangeInput = () => this._setBeltMarginFromUi(this.beltMarginRange.value);
        this._onBeltMarginNumberInput = () => this._setBeltMarginFromUi(this.beltMarginNumber.value);
        this._onBeltHeightRangeInput = () => this._setBeltHeightFromUi(this.beltHeightRange.value);
        this._onBeltHeightNumberInput = () => this._setBeltHeightFromUi(this.beltHeightNumber.value);
        this._onBeltColorPickClick = () => this._openBeltCourseColorPicker();
        this._onTopBeltEnabledChange = () => this._setTopBeltEnabledFromUi(this.topBeltInput.checked);
        this._onTopBeltWidthRangeInput = () => this._setTopBeltWidthFromUi(this.topBeltWidthRange.value);
        this._onTopBeltWidthNumberInput = () => this._setTopBeltWidthFromUi(this.topBeltWidthNumber.value);
        this._onTopBeltInnerWidthRangeInput = () => this._setTopBeltInnerWidthFromUi(this.topBeltInnerWidthRange.value);
        this._onTopBeltInnerWidthNumberInput = () => this._setTopBeltInnerWidthFromUi(this.topBeltInnerWidthNumber.value);
        this._onTopBeltHeightRangeInput = () => this._setTopBeltHeightFromUi(this.topBeltHeightRange.value);
        this._onTopBeltHeightNumberInput = () => this._setTopBeltHeightFromUi(this.topBeltHeightNumber.value);
        this._onWindowStylePickClick = () => this._openWindowTypePicker();
        this._onRoofColorPickClick = () => this._openRoofColorPicker();
        this._onTopBeltColorPickClick = () => this._openTopBeltColorPicker();
        this._onTypeSelectChange = () => this._setBuildingTypeFromUi(this.typeSelect.value);
        this._onStylePickClick = () => this._openBuildingStylePicker();
        this._onStreetWindowStylePickClick = () => this._openStreetWindowTypePicker();
        this._onStreetWindowWidthRangeInput = () => this._setStreetWindowWidthFromUi(this.streetWindowWidthRange.value);
        this._onStreetWindowWidthNumberInput = () => this._setStreetWindowWidthFromUi(this.streetWindowWidthNumber.value);
        this._onStreetWindowGapRangeInput = () => this._setStreetWindowGapFromUi(this.streetWindowGapRange.value);
        this._onStreetWindowGapNumberInput = () => this._setStreetWindowGapFromUi(this.streetWindowGapNumber.value);
        this._onStreetWindowHeightRangeInput = () => this._setStreetWindowHeightFromUi(this.streetWindowHeightRange.value);
        this._onStreetWindowHeightNumberInput = () => this._setStreetWindowHeightFromUi(this.streetWindowHeightNumber.value);
        this._onStreetWindowYRangeInput = () => this._setStreetWindowYFromUi(this.streetWindowYRange.value);
        this._onStreetWindowYNumberInput = () => this._setStreetWindowYFromUi(this.streetWindowYNumber.value);
        this._onStreetWindowFrameWidthRangeInput = () => this._setStreetWindowFrameWidthFromUi(this.streetWindowFrameWidthRange.value);
        this._onStreetWindowFrameWidthNumberInput = () => this._setStreetWindowFrameWidthFromUi(this.streetWindowFrameWidthNumber.value);
        this._onStreetWindowFrameColorPickClick = () => this._openStreetWindowFrameColorPicker();
        this._onStreetWindowGlassTopPickClick = () => this._openStreetWindowGlassTopPicker();
        this._onStreetWindowGlassBottomPickClick = () => this._openStreetWindowGlassBottomPicker();
        this._onStreetWindowSpacerEnabledChange = () => this._setStreetWindowSpacerEnabledFromUi(this.streetWindowSpacerInput.checked);
        this._onStreetWindowSpacerEveryRangeInput = () => this._setStreetWindowSpacerEveryFromUi(this.streetWindowSpacerEveryRange.value);
        this._onStreetWindowSpacerEveryNumberInput = () => this._setStreetWindowSpacerEveryFromUi(this.streetWindowSpacerEveryNumber.value);
        this._onStreetWindowSpacerWidthRangeInput = () => this._setStreetWindowSpacerWidthFromUi(this.streetWindowSpacerWidthRange.value);
        this._onStreetWindowSpacerWidthNumberInput = () => this._setStreetWindowSpacerWidthFromUi(this.streetWindowSpacerWidthNumber.value);
        this._onStreetWindowSpacerExtrudeChange = () => this._setStreetWindowSpacerExtrudeFromUi(this.streetWindowSpacerExtrudeInput.checked);
        this._onStreetWindowSpacerExtrudeDistanceRangeInput = () => this._setStreetWindowSpacerExtrudeDistanceFromUi(this.streetWindowSpacerExtrudeDistanceRange.value);
        this._onStreetWindowSpacerExtrudeDistanceNumberInput = () => this._setStreetWindowSpacerExtrudeDistanceFromUi(this.streetWindowSpacerExtrudeDistanceNumber.value);
        this._onMaterialVariationSeedOverrideChange = () => this._setMaterialVariationSeedOverrideFromUi(this.materialVariationSeedToggleInput.checked);
        this._onMaterialVariationSeedNumberChange = () => this._setMaterialVariationSeedFromUi(this.materialVariationSeedNumber.value);
        this._onMaterialVariationDebugChange = () => this._setMaterialVariationDebugFromUi();
        this._onMaterialVariationDebugReset = (e) => {
            e?.preventDefault?.();
            e?.stopPropagation?.();
            this._resetMaterialVariationDebugFromUi();
        };
        this._onHideSelectionBorderChange = () => this._setHideSelectionBorderFromUi(this.hideSelectionBorderInput.checked);
        this._onViewModeClick = (e) => {
            const btn = e?.target?.closest?.('.building-fab-view-mode');
            if (!btn || !this.viewModeRow?.contains(btn)) return;
            if (btn.disabled) return;
            const mode = btn.dataset?.mode ?? null;
            this._setViewModeFromUi(mode);
        };
        this._onAddRoad = () => this._toggleRoadModeFromUi();
        this._onStartBuilding = () => this._toggleBuildingModeFromUi();
        this._onCancelMode = () => this._cancelActiveModeFromUi();
        this._onBuild = () => this.onBuildBuildings?.();
        this._onLoadCatalogSelectChange = () => this._setCatalogBuildingConfigFromUi(this.loadCatalogSelect.value, { autoLoad: true });
        this._onLoadCatalogBtnClick = () => this._loadCatalogBuildingConfigFromUi();
        this._onExportBuildingConfig = () => this.onExportBuildingConfig?.();
        this._onClearSelection = () => this.onClearSelection?.();
        this._onDeleteSelectedBuilding = () => this.onDeleteSelectedBuilding?.();
        this._onRoadDone = () => this.onRoadDone?.();
        this._onReset = () => this._openResetDialog();
        this._onResetOverlayClick = (e) => {
            if (e?.target === this.resetOverlay) this._closeResetDialog();
        };
        this._onResetCancel = () => this._closeResetDialog();
        this._onResetConfirm = () => this._confirmResetDialog();
        this._onResetGridKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this._closeResetDialog();
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                this._confirmResetDialog();
            }
        };
    }

    mount(parent = document.body) {
        if (this.root.isConnected) return;
        parent.appendChild(this.root);
        this._bind();
    }

    unmount() {
        this._pickerPopup?.dispose?.();
        for (const ctrl of this._layerMiniControllers) ctrl?.dispose?.();
        this._layerMiniControllers.length = 0;
        this._unbind();
        if (this.root.isConnected) this.root.remove();
    }

    setEnabled(enabled) {
        const on = !!enabled;
        this._enabled = on;
        this.cancelModeBtn.disabled = !on;
        this.buildBtn.disabled = !on || !this._buildingModeEnabled || this._selectedTileCount <= 0;
        this.clearSelBtn.disabled = !on || !this._buildingModeEnabled || this._selectedTileCount <= 0;
        this.roadDoneBtn.disabled = !on;
        for (const btn of this._roadRemoveButtons) btn.disabled = !on;
        this._syncCreatePanelControls();
        this._syncViewControls();
        this._syncPropertyWidgets();
        this._renderLayersPanel();
        this.propsPanel.classList.toggle('is-disabled', !on);
        this.roadsPanel.classList.toggle('is-disabled', !on);
        this.toastPanel.classList.toggle('is-disabled', !on);
        this.buildingsPanel.classList.toggle('is-disabled', !on);
    }

    getFloorCount() {
        return this._floorCount;
    }

    setFloorCount(floors) {
        const next = clampInt(floors, this.floorMin, this.floorMax);
        if (next === this._floorCount) return;
        this._floorCount = next;
        this.floorRange.value = String(next);
        this.floorNumber.value = String(next);
        this._syncPropertyWidgets();
    }

    getFloorHeight() {
        return this._floorHeight;
    }

    getTemplateLayers() {
        return cloneBuildingLayers(this._templateLayers);
    }

    getTemplateMaterialVariationSeed() {
        return Number.isFinite(this._templateMaterialVariationSeed) ? this._templateMaterialVariationSeed : null;
    }

    getMaterialVariationDebugConfig() {
        return { ...this._materialVariationDebug };
    }

    setFloorHeight(height) {
        const next = clamp(height, this.floorHeightMin, this.floorHeightMax);
        if (Math.abs(next - this._floorHeight) < 1e-6) return;
        this._floorHeight = next;
        this.floorHeightRange.value = String(next);
        this.floorHeightNumber.value = formatFloat(next, 1);
        this._syncPropertyWidgets();
    }

    getGridSize() {
        return this._gridSize;
    }

    setGridSize(size) {
        const next = clampInt(size, this.gridMin, this.gridMax);
        if (next === this._gridSize) return;
        this._gridSize = next;
        if (this.resetGridNumber) this.resetGridNumber.value = String(next);
    }

    getBuildingModeEnabled() {
        return this._buildingModeEnabled;
    }

    setBuildingModeEnabled(enabled) {
        const next = !!enabled;
        if (next === this._buildingModeEnabled) return;
        if (next) this.setRoadModeEnabled(false);
        this._buildingModeEnabled = next;
        this.startBuildingBtn.classList.toggle('is-active', next);
        this.buildBtn.disabled = !next || this._selectedTileCount <= 0;
        this.clearSelBtn.disabled = !next || this._selectedTileCount <= 0;
        this._syncHint();
    }

    getRoadModeEnabled() {
        return this._roadModeEnabled;
    }

    setRoadModeEnabled(enabled) {
        const next = !!enabled;
        if (next === this._roadModeEnabled) return;
        if (next) this.setBuildingModeEnabled(false);
        this._roadModeEnabled = next;
        this.addRoadBtn.classList.toggle('is-active', next);
        if (!next) this._roadStartTileId = null;
        this._syncHint();
    }

    _currentViewMode() {
        if (this._floorplanEnabled) return 'floorplan';
        if (this._floorDivisionsEnabled) return 'floors';
        if (this._wireframeEnabled) return 'wireframe';
        return 'mesh';
    }

    _syncViewModeButtons() {
        const active = this._currentViewMode();
        for (const btn of this._viewModeButtons ?? []) {
            if (!btn) continue;
            const mode = btn.dataset?.mode ?? null;
            const isActive = mode === active;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        }
    }

    getWireframeEnabled() {
        return this._wireframeEnabled;
    }

    setWireframeEnabled(enabled) {
        const on = !!enabled;
        if (on) {
            if (this._wireframeEnabled && !this._floorDivisionsEnabled && !this._floorplanEnabled) return;
            this._wireframeEnabled = true;
            this._floorDivisionsEnabled = false;
            this._floorplanEnabled = false;
        } else {
            if (!this._wireframeEnabled) return;
            this._wireframeEnabled = false;
        }
        this._syncViewControls();
    }

    getFloorDivisionsEnabled() {
        return this._floorDivisionsEnabled;
    }

    setFloorDivisionsEnabled(enabled) {
        const on = !!enabled;
        if (on) {
            if (!this._wireframeEnabled && this._floorDivisionsEnabled && !this._floorplanEnabled) return;
            this._wireframeEnabled = false;
            this._floorDivisionsEnabled = true;
            this._floorplanEnabled = false;
        } else {
            if (!this._floorDivisionsEnabled) return;
            this._floorDivisionsEnabled = false;
        }
        this._syncViewControls();
    }

    getFloorplanEnabled() {
        return this._floorplanEnabled;
    }

    setFloorplanEnabled(enabled) {
        const on = !!enabled;
        if (on) {
            if (!this._wireframeEnabled && !this._floorDivisionsEnabled && this._floorplanEnabled) return;
            this._wireframeEnabled = false;
            this._floorDivisionsEnabled = false;
            this._floorplanEnabled = true;
        } else {
            if (!this._floorplanEnabled) return;
            this._floorplanEnabled = false;
        }
        this._syncViewControls();
    }

    getHideSelectionBorder() {
        return this._hideSelectionBorder;
    }

    setHideSelectionBorder(hidden) {
        const next = !!hidden;
        if (next === this._hideSelectionBorder) return;
        this._hideSelectionBorder = next;
        if (this.hideSelectionBorderInput) this.hideSelectionBorderInput.checked = next;
    }

    setSelectedBuilding(building) {
        const nextId = typeof building?.id === 'string' ? building.id : null;
        const hasSelected = !!nextId;
        if (hasSelected && Number.isFinite(building?.floors)) {
            this._floorCount = clampInt(building.floors, this.floorMin, this.floorMax);
        }
        if (hasSelected && Number.isFinite(building?.floorHeight)) {
            this._floorHeight = clamp(building.floorHeight, this.floorHeightMin, this.floorHeightMax);
        }
        if (hasSelected) {
            this._streetEnabled = !!building.streetEnabled;
        } else {
            this._streetEnabled = false;
        }
        if (hasSelected && Number.isFinite(building?.streetFloors)) {
            this._streetFloors = clampInt(building.streetFloors, 0, this._floorCount);
        } else {
            this._streetFloors = 0;
        }
        if (hasSelected && Number.isFinite(building?.streetFloorHeight)) {
            this._streetFloorHeight = clamp(building.streetFloorHeight, 1.0, 12.0);
        } else {
            this._streetFloorHeight = this._floorHeight;
        }
        if (hasSelected) {
            const style = typeof building?.streetStyle === 'string' ? building.streetStyle : null;
            const fallback = typeof building?.style === 'string' ? building.style : BUILDING_STYLE.DEFAULT;
            this._streetStyle = isBuildingStyle(style)
                ? style
                : (isBuildingStyle(fallback) ? fallback : BUILDING_STYLE.DEFAULT);
        } else {
            this._streetStyle = BUILDING_STYLE.DEFAULT;
        }
        if (hasSelected && Number.isFinite(building?.wallInset)) {
            this._wallInset = clamp(building.wallInset, 0.0, 4.0);
        } else {
            this._wallInset = 0.0;
        }
        if (hasSelected) {
            this._beltCourseEnabled = !!building.beltCourseEnabled;
        } else {
            this._beltCourseEnabled = false;
        }
        if (hasSelected && Number.isFinite(building?.beltCourseMargin)) {
            this._beltCourseMargin = clamp(building.beltCourseMargin, 0.0, 4.0);
        } else {
            this._beltCourseMargin = 0.4;
        }
        if (hasSelected && Number.isFinite(building?.beltCourseHeight)) {
            this._beltCourseHeight = clamp(building.beltCourseHeight, 0.02, 1.2);
        } else {
            this._beltCourseHeight = 0.18;
        }
        if (hasSelected) {
            const color = typeof building?.beltCourseColor === 'string' ? building.beltCourseColor : null;
            this._beltCourseColor = isBeltCourseColor(color) ? color : BELT_COURSE_COLOR.OFFWHITE;
        } else {
            this._beltCourseColor = BELT_COURSE_COLOR.OFFWHITE;
        }
        if (hasSelected) {
            this._topBeltEnabled = !!building.topBeltEnabled;
        } else {
            this._topBeltEnabled = false;
        }
        if (hasSelected && Number.isFinite(building?.topBeltWidth)) {
            this._topBeltWidth = clamp(building.topBeltWidth, 0.0, 4.0);
        } else {
            this._topBeltWidth = 0.4;
        }
        if (hasSelected && Number.isFinite(building?.topBeltHeight)) {
            this._topBeltHeight = clamp(building.topBeltHeight, 0.02, 1.2);
        } else {
            this._topBeltHeight = 0.18;
        }
        if (hasSelected && Number.isFinite(building?.topBeltInnerWidth)) {
            this._topBeltInnerWidth = clamp(building.topBeltInnerWidth, 0.0, 4.0);
        } else {
            this._topBeltInnerWidth = 0.0;
        }
        if (hasSelected) {
            const color = typeof building?.topBeltColor === 'string' ? building.topBeltColor : null;
            this._topBeltColor = isBeltCourseColor(color) ? color : BELT_COURSE_COLOR.OFFWHITE;
        } else {
            this._topBeltColor = BELT_COURSE_COLOR.OFFWHITE;
        }
        if (hasSelected) {
            const color = typeof building?.roofColor === 'string' ? building.roofColor : null;
            this._roofColor = isRoofColor(color) ? color : ROOF_COLOR.DEFAULT;
        } else {
            this._roofColor = ROOF_COLOR.DEFAULT;
        }
        if (hasSelected) {
            const legacy = typeof building?.windowStyle === 'string' ? building.windowStyle : null;
            const typeId = typeof building?.windowTypeId === 'string' ? building.windowTypeId : null;
            this._windowTypeId = isWindowTypeId(typeId) ? typeId : normalizeWindowTypeIdOrLegacyStyle(legacy);
            const p = building?.windowParams && typeof building.windowParams === 'object' ? building.windowParams : null;
            this._windowParams = normalizeWindowParams(this._windowTypeId, p);
        } else {
            this._windowTypeId = WINDOW_TYPE.STYLE_DEFAULT;
            this._windowParams = getDefaultWindowParams(this._windowTypeId);
        }
        if (hasSelected && Number.isFinite(building?.windowWidth)) {
            this._windowWidth = clamp(building.windowWidth, 0.3, 12.0);
        }
        if (hasSelected && Number.isFinite(building?.windowGap)) {
            this._windowGap = clamp(building.windowGap, 0.0, 24.0);
        }
        if (hasSelected && Number.isFinite(building?.windowHeight)) {
            this._windowHeight = clamp(building.windowHeight, 0.3, 10.0);
        }
        if (hasSelected && Number.isFinite(building?.windowY)) {
            this._windowY = clamp(building.windowY, 0.0, 12.0);
        }
        if (hasSelected) {
            this._windowSpacerEnabled = !!building.windowSpacerEnabled;
        } else {
            this._windowSpacerEnabled = false;
        }
        if (hasSelected && Number.isFinite(building?.windowSpacerEvery)) {
            this._windowSpacerEvery = clampInt(building.windowSpacerEvery, 1, 99);
        } else {
            this._windowSpacerEvery = 4;
        }
        if (hasSelected && Number.isFinite(building?.windowSpacerWidth)) {
            this._windowSpacerWidth = clamp(building.windowSpacerWidth, 0.1, 10.0);
        } else {
            this._windowSpacerWidth = 0.9;
        }
        if (hasSelected) {
            this._windowSpacerExtrude = !!building.windowSpacerExtrude;
        } else {
            this._windowSpacerExtrude = false;
        }
        if (hasSelected && Number.isFinite(building?.windowSpacerExtrudeDistance)) {
            this._windowSpacerExtrudeDistance = clamp(building.windowSpacerExtrudeDistance, 0.0, 1.0);
        } else {
            this._windowSpacerExtrudeDistance = 0.12;
        }
        if (hasSelected) {
            const legacy = typeof building?.streetWindowStyle === 'string' ? building.streetWindowStyle : null;
            const fallbackLegacy = typeof building?.windowStyle === 'string' ? building.windowStyle : WINDOW_STYLE.DEFAULT;
            const typeId = typeof building?.streetWindowTypeId === 'string' ? building.streetWindowTypeId : null;
            if (isWindowTypeId(typeId)) {
                this._streetWindowTypeId = typeId;
            } else if (isWindowStyle(legacy)) {
                this._streetWindowTypeId = normalizeWindowTypeIdOrLegacyStyle(legacy);
            } else if (isWindowStyle(fallbackLegacy)) {
                this._streetWindowTypeId = normalizeWindowTypeIdOrLegacyStyle(fallbackLegacy);
            } else {
                this._streetWindowTypeId = this._windowTypeId;
            }
            const p = building?.streetWindowParams && typeof building.streetWindowParams === 'object' ? building.streetWindowParams : null;
            this._streetWindowParams = normalizeWindowParams(this._streetWindowTypeId, p);
        } else {
            this._streetWindowTypeId = WINDOW_TYPE.STYLE_DEFAULT;
            this._streetWindowParams = getDefaultWindowParams(this._streetWindowTypeId);
        }
        if (hasSelected && Number.isFinite(building?.streetWindowWidth)) {
            this._streetWindowWidth = clamp(building.streetWindowWidth, 0.3, 12.0);
        } else {
            this._streetWindowWidth = this._windowWidth;
        }
        if (hasSelected && Number.isFinite(building?.streetWindowGap)) {
            this._streetWindowGap = clamp(building.streetWindowGap, 0.0, 24.0);
        } else {
            this._streetWindowGap = this._windowGap;
        }
        if (hasSelected && Number.isFinite(building?.streetWindowHeight)) {
            this._streetWindowHeight = clamp(building.streetWindowHeight, 0.3, 10.0);
        } else {
            this._streetWindowHeight = this._windowHeight;
        }
        if (hasSelected && Number.isFinite(building?.streetWindowY)) {
            this._streetWindowY = clamp(building.streetWindowY, 0.0, 12.0);
        } else {
            this._streetWindowY = this._windowY;
        }
        if (hasSelected) {
            this._streetWindowSpacerEnabled = !!building.streetWindowSpacerEnabled;
        } else {
            this._streetWindowSpacerEnabled = false;
        }
        if (hasSelected && Number.isFinite(building?.streetWindowSpacerEvery)) {
            this._streetWindowSpacerEvery = clampInt(building.streetWindowSpacerEvery, 1, 99);
        } else {
            this._streetWindowSpacerEvery = 4;
        }
        if (hasSelected && Number.isFinite(building?.streetWindowSpacerWidth)) {
            this._streetWindowSpacerWidth = clamp(building.streetWindowSpacerWidth, 0.1, 10.0);
        } else {
            this._streetWindowSpacerWidth = this._windowSpacerWidth;
        }
        if (hasSelected) {
            this._streetWindowSpacerExtrude = !!building.streetWindowSpacerExtrude;
        } else {
            this._streetWindowSpacerExtrude = false;
        }
        if (hasSelected && Number.isFinite(building?.streetWindowSpacerExtrudeDistance)) {
            this._streetWindowSpacerExtrudeDistance = clamp(building.streetWindowSpacerExtrudeDistance, 0.0, 1.0);
        } else {
            this._streetWindowSpacerExtrudeDistance = this._windowSpacerExtrudeDistance;
        }
        if (hasSelected) {
            const type = typeof building?.type === 'string' ? building.type : null;
            this._buildingType = type === 'business' || type === 'industrial' || type === 'apartments' || type === 'house'
                ? type
                : 'business';
        }
        if (hasSelected) {
            const style = typeof building?.style === 'string' ? building.style : null;
            this._buildingStyle = isBuildingStyle(style) ? style : BUILDING_STYLE.DEFAULT;
        } else {
            this._buildingStyle = BUILDING_STYLE.DEFAULT;
        }
        this._selectedBuildingId = nextId;
        if (!hasSelected) {
            this.nameValue.textContent = 'No building selected.';
        } else {
            this.nameValue.textContent = nextId;
        }
        this._selectedLayers = hasSelected && Array.isArray(building?.layers) && building.layers.length
            ? cloneBuildingLayers(building.layers)
            : [];
        this._selectedMaterialVariationSeed = hasSelected && Number.isFinite(building?.materialVariationSeed)
            ? clampInt(building.materialVariationSeed, 0, 4294967295)
            : null;
        this._syncLayersPanel();
        this._renderLayersPanel();
        this._syncPropertyWidgets();
        this._syncHint();
    }

    _getActiveLayers() {
        return this._selectedBuildingId ? (this._selectedLayers ?? []) : (this._templateLayers ?? []);
    }

    _getActiveMaterialVariationSeed() {
        return this._selectedBuildingId ? this._selectedMaterialVariationSeed : this._templateMaterialVariationSeed;
    }

    _setActiveLayers(nextLayers) {
        const layers = Array.isArray(nextLayers) ? nextLayers : [];
        if (this._selectedBuildingId) {
            this._selectedLayers = layers;
            return;
        }
        this._templateLayers = layers;
    }

    _setActiveMaterialVariationSeed(seed) {
        const next = Number.isFinite(seed) ? clampInt(seed, 0, 4294967295) : null;
        if (this._selectedBuildingId) {
            this._selectedMaterialVariationSeed = next;
            return;
        }
        this._templateMaterialVariationSeed = next;
    }

    _notifySelectedLayersChanged() {
        if (!this._selectedBuildingId) return;
        if (typeof this.onSelectedBuildingLayersChange !== 'function') return;
        this.onSelectedBuildingLayersChange(cloneBuildingLayers(this._selectedLayers));
    }

    _notifySelectedMaterialVariationSeedChanged() {
        if (!this._selectedBuildingId) return;
        if (typeof this.onSelectedBuildingMaterialVariationSeedChange !== 'function') return;
        this.onSelectedBuildingMaterialVariationSeedChange(this._selectedMaterialVariationSeed);
    }

    _syncMaterialVariationSeedPanel() {
        if (!this.materialVariationSeedToggleInput || !this.materialVariationSeedNumber) return;

        const hasSelected = !!this._selectedBuildingId;
        const allow = !!this._enabled;
        const seed = this._getActiveMaterialVariationSeed();
        const override = Number.isFinite(seed);

        this.materialVariationSeedToggleInput.checked = override;
        this.materialVariationSeedToggleInput.disabled = !allow;
        this.materialVariationSeedNumber.disabled = !allow || !override;
        this.materialVariationSeedNumber.value = String(override ? seed : 0);

        if (this.materialVariationSeedSection?.label) {
            this.materialVariationSeedSection.label.textContent = hasSelected ? 'Material variation seed (building)' : 'Material variation seed (template)';
        }
    }

    _setMaterialVariationSeedOverrideFromUi(enabled) {
        if (!this._enabled) return;
        const on = !!enabled;
        if (!on) {
            this._setActiveMaterialVariationSeed(null);
            this._syncMaterialVariationSeedPanel();
            this._notifySelectedMaterialVariationSeedChanged();
            return;
        }

        const current = this._getActiveMaterialVariationSeed();
        const next = Number.isFinite(current) ? current : 0;
        this._setActiveMaterialVariationSeed(next);
        this._syncMaterialVariationSeedPanel();
        this._notifySelectedMaterialVariationSeedChanged();
    }

    _setMaterialVariationSeedFromUi(value) {
        if (!this._enabled) return;
        const next = clampInt(value, 0, 4294967295);
        this._setActiveMaterialVariationSeed(next);
        this._syncMaterialVariationSeedPanel();
        this._notifySelectedMaterialVariationSeedChanged();
    }

    _notifyMaterialVariationDebugChanged() {
        if (typeof this.onMaterialVariationDebugChange !== 'function') return;
        this.onMaterialVariationDebugChange({ ...this._materialVariationDebug });
    }

    _formatMaterialVariationDebugReadout(debugConfig) {
        const dbg = debugConfig && typeof debugConfig === 'object' ? debugConfig : normalizeMaterialVariationDebugConfig(null);
        const onOff = (value) => (value ? 'on' : 'off');
        const basis = dbg.basisUsesOriginalUv ? 'original' : 'transformed';
        return [
            `USE_MATVAR: ${onOff(dbg.useMatVarDefine)}`,
            `UV: stair=${onOff(dbg.uvStairShift)} antiOffset=${onOff(dbg.uvAntiOffset)} antiRot=${onOff(dbg.uvAntiRotation)} warp=${onOff(dbg.uvWarp)}`,
            `Contrib: rough=${onOff(dbg.contribRoughness)} color=${onOff(dbg.contribColor)} orm=${onOff(dbg.useOrm)} normalFactor=${onOff(dbg.contribNormalFactor)}`,
            `Normal: basis=${basis} flipY=${onOff(dbg.flipNormalY)}`
        ].join('\n');
    }

    _syncMaterialVariationDebugPanel() {
        const allow = !!this._enabled;
        const dbg = this._materialVariationDebug;

        if (this.materialVariationDebugUseMatVarInput) {
            this.materialVariationDebugUseMatVarInput.checked = !!dbg.useMatVarDefine;
            this.materialVariationDebugUseMatVarInput.disabled = !allow;
        }
        if (this.materialVariationDebugUvStairInput) {
            this.materialVariationDebugUvStairInput.checked = !!dbg.uvStairShift;
            this.materialVariationDebugUvStairInput.disabled = !allow;
        }
        if (this.materialVariationDebugUvAntiOffsetInput) {
            this.materialVariationDebugUvAntiOffsetInput.checked = !!dbg.uvAntiOffset;
            this.materialVariationDebugUvAntiOffsetInput.disabled = !allow;
        }
        if (this.materialVariationDebugUvAntiRotationInput) {
            this.materialVariationDebugUvAntiRotationInput.checked = !!dbg.uvAntiRotation;
            this.materialVariationDebugUvAntiRotationInput.disabled = !allow;
        }
        if (this.materialVariationDebugUvWarpInput) {
            this.materialVariationDebugUvWarpInput.checked = !!dbg.uvWarp;
            this.materialVariationDebugUvWarpInput.disabled = !allow;
        }

        if (this.materialVariationDebugContribRoughnessInput) {
            this.materialVariationDebugContribRoughnessInput.checked = !!dbg.contribRoughness;
            this.materialVariationDebugContribRoughnessInput.disabled = !allow;
        }
        if (this.materialVariationDebugContribColorInput) {
            this.materialVariationDebugContribColorInput.checked = !!dbg.contribColor;
            this.materialVariationDebugContribColorInput.disabled = !allow;
        }
        if (this.materialVariationDebugUseOrmInput) {
            this.materialVariationDebugUseOrmInput.checked = !!dbg.useOrm;
            this.materialVariationDebugUseOrmInput.disabled = !allow;
        }
        if (this.materialVariationDebugContribNormalFactorInput) {
            this.materialVariationDebugContribNormalFactorInput.checked = !!dbg.contribNormalFactor;
            this.materialVariationDebugContribNormalFactorInput.disabled = !allow;
        }

        if (this.materialVariationDebugBasisOriginalUvInput) {
            this.materialVariationDebugBasisOriginalUvInput.checked = !!dbg.basisUsesOriginalUv;
            this.materialVariationDebugBasisOriginalUvInput.disabled = !allow;
        }
        if (this.materialVariationDebugFlipNormalYInput) {
            this.materialVariationDebugFlipNormalYInput.checked = !!dbg.flipNormalY;
            this.materialVariationDebugFlipNormalYInput.disabled = !allow;
        }

        if (this.materialVariationDebugResetBtn) this.materialVariationDebugResetBtn.disabled = !allow;
        if (this.materialVariationDebugReadout) this.materialVariationDebugReadout.textContent = this._formatMaterialVariationDebugReadout(dbg);
    }

    _setMaterialVariationDebugFromUi() {
        if (!this._enabled) return;
        const next = normalizeMaterialVariationDebugConfig({
            useMatVarDefine: !!this.materialVariationDebugUseMatVarInput?.checked,
            uvStairShift: !!this.materialVariationDebugUvStairInput?.checked,
            uvAntiOffset: !!this.materialVariationDebugUvAntiOffsetInput?.checked,
            uvAntiRotation: !!this.materialVariationDebugUvAntiRotationInput?.checked,
            uvWarp: !!this.materialVariationDebugUvWarpInput?.checked,
            contribRoughness: !!this.materialVariationDebugContribRoughnessInput?.checked,
            contribColor: !!this.materialVariationDebugContribColorInput?.checked,
            useOrm: !!this.materialVariationDebugUseOrmInput?.checked,
            contribNormalFactor: !!this.materialVariationDebugContribNormalFactorInput?.checked,
            basisUsesOriginalUv: !!this.materialVariationDebugBasisOriginalUvInput?.checked,
            flipNormalY: !!this.materialVariationDebugFlipNormalYInput?.checked
        });
        this._materialVariationDebug = next;
        this._syncMaterialVariationDebugPanel();
        this._notifyMaterialVariationDebugChanged();
    }

    _resetMaterialVariationDebugFromUi() {
        if (!this._enabled) return;
        this._materialVariationDebug = normalizeMaterialVariationDebugConfig(MATERIAL_VARIATION_DEBUG_DEFAULT);
        this._syncMaterialVariationDebugPanel();
        this._notifyMaterialVariationDebugChanged();
    }

    _syncLayersPanel() {
        if (!this.layersStatus) return;
        const hasSelected = !!this._selectedBuildingId;
        this.layersStatus.textContent = hasSelected
            ? 'Edit layers for the selected building.'
            : 'Edit the template layers, then create a building.';

        const allow = !!this._enabled;
        if (this.addFloorLayerBtn) this.addFloorLayerBtn.disabled = !allow;
        if (this.addRoofLayerBtn) this.addRoofLayerBtn.disabled = !allow;
    }

    _handleAddLayer(layerType) {
        if (!this._enabled) return;
        const type = layerType === LAYER_TYPE.ROOF ? LAYER_TYPE.ROOF : LAYER_TYPE.FLOOR;

        const layers = this._getActiveLayers();
        const lastFloor = [...layers].reverse().find((layer) => layer?.type === LAYER_TYPE.FLOOR) ?? null;
        const lastRoof = [...layers].reverse().find((layer) => layer?.type === LAYER_TYPE.ROOF) ?? null;

        const next = layers.slice();
        if (type === LAYER_TYPE.FLOOR) {
            next.push(createDefaultFloorLayer({
                floors: lastFloor?.floors ?? 2,
                floorHeight: lastFloor?.floorHeight ?? this._floorHeight,
                planOffset: 0.0,
                style: lastFloor?.style ?? this._buildingStyle,
                material: lastFloor?.material ?? null,
                tiling: lastFloor?.tiling ?? null,
                materialVariation: lastFloor?.materialVariation ?? null,
                belt: lastFloor?.belt ?? null,
                windows: lastFloor?.windows ?? null
            }));
        } else {
            next.push(createDefaultRoofLayer({
                ring: lastRoof?.ring ?? null,
                roof: lastRoof?.roof ?? null
            }));
        }

        const normalized = normalizeBuildingLayers(next);
        this._setActiveLayers(normalized);
        this._renderLayersPanel();
        this._notifySelectedLayersChanged();
    }

    _handleMoveLayer(layerId, delta) {
        if (!this._enabled) return;
        const layers = this._getActiveLayers();
        const idx = layers.findIndex((l) => l?.id === layerId);
        if (idx < 0) return;
        const nextIdx = idx + (delta < 0 ? -1 : 1);
        if (nextIdx < 0 || nextIdx >= layers.length) return;
        const next = layers.slice();
        const tmp = next[idx];
        next[idx] = next[nextIdx];
        next[nextIdx] = tmp;
        const normalized = normalizeBuildingLayers(next);
        this._setActiveLayers(normalized);
        this._renderLayersPanel();
        this._notifySelectedLayersChanged();
    }

    _handleRemoveLayer(layerId) {
        if (!this._enabled) return;
        const layers = this._getActiveLayers();
        const idx = layers.findIndex((l) => l?.id === layerId);
        if (idx < 0) return;

        const next = layers.filter((l) => l?.id !== layerId);
        const hasFloor = next.some((l) => l?.type === LAYER_TYPE.FLOOR);
        const hasRoof = next.some((l) => l?.type === LAYER_TYPE.ROOF);
        if (!hasFloor || !hasRoof) return;

        const normalized = normalizeBuildingLayers(next);
        this._setActiveLayers(normalized);
        this._renderLayersPanel();
        this._notifySelectedLayersChanged();
    }

    _renderLayersPanel() {
        for (const ctrl of this._layerMiniControllers) ctrl?.dispose?.();
        this._layerMiniControllers.length = 0;
        if (!this.layersList) return;
        this.layersList.textContent = '';

        const layers = this._getActiveLayers();
        if (!layers.length) return;

        const allow = !!this._enabled;
        const scopeKey = this._selectedBuildingId ? `building:${this._selectedBuildingId}` : 'template';

        const bindDetailsState = (details, key, { open = true } = {}) => {
            if (!details || typeof key !== 'string' || !key) return;
            details.dataset.detailsKey = key;
            const stored = this._detailsOpenByKey.get(key);
            details.open = typeof stored === 'boolean' ? stored : !!open;
            this._detailsOpenByKey.set(key, details.open);
            details.addEventListener('toggle', () => {
                this._detailsOpenByKey.set(key, details.open);
            });
        };

        const makeDetailsSection = (title, { open = true, nested = false, key = null } = {}) => {
            const details = document.createElement('details');
            details.className = nested ? 'building-fab-details building-fab-layer-subdetails' : 'building-fab-details';
            const summary = document.createElement('summary');
            summary.className = 'building-fab-details-summary';
            const label = document.createElement('span');
            label.className = 'building-fab-details-title';
            label.textContent = title;
            summary.appendChild(label);
            details.appendChild(summary);
            const body = document.createElement('div');
            body.className = 'building-fab-details-body';
            details.appendChild(body);
            bindDetailsState(details, key, { open });
            return { details, summary, body, label };
        };

        const makeRangeRow = (labelText) => {
            const row = document.createElement('div');
            row.className = 'building-fab-row';
            const l = document.createElement('div');
            l.className = 'building-fab-row-label';
            l.textContent = labelText;
            const range = document.createElement('input');
            range.type = 'range';
            range.className = 'building-fab-range';
            const number = document.createElement('input');
            number.type = 'number';
            number.className = 'building-fab-number';
            row.appendChild(l);
            row.appendChild(range);
            row.appendChild(number);
            return { row, range, number, label: l };
        };

        const makeToggleRow = (labelText) => {
            const toggle = document.createElement('label');
            toggle.className = 'building-fab-toggle building-fab-toggle-wide';
            const input = document.createElement('input');
            input.type = 'checkbox';
            const text = document.createElement('span');
            text.textContent = labelText;
            toggle.appendChild(input);
            toggle.appendChild(text);
            return { toggle, input, text };
        };

	        const makePickerRow = (labelText) => {
	            const row = document.createElement('div');
	            row.className = 'building-fab-row building-fab-row-texture';
            const label = document.createElement('div');
            label.className = 'building-fab-row-label';
            label.textContent = labelText;
            const picker = document.createElement('div');
            picker.className = 'building-fab-texture-picker building-fab-material-picker';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'building-fab-material-button';
            const thumb = document.createElement('div');
            thumb.className = 'building-fab-material-thumb';
            const text = document.createElement('div');
            text.className = 'building-fab-material-text';
            button.appendChild(thumb);
            button.appendChild(text);
            picker.appendChild(button);
            row.appendChild(label);
            row.appendChild(picker);
            return { row, button, thumb, text };
	        };

	        const tip = (...lines) => lines.filter((line) => typeof line === 'string' && line.trim()).join('\n');

	        const normalizeDirection = (dir, fallback = { x: 0.4, y: 0.85, z: 0.2 }) => {
	            const x = Number.isFinite(dir?.x) ? Number(dir.x) : Number(fallback?.x ?? 0);
	            const y = Number.isFinite(dir?.y) ? Number(dir.y) : Number(fallback?.y ?? 0);
	            const z = Number.isFinite(dir?.z) ? Number(dir.z) : Number(fallback?.z ?? 0);
	            const len = Math.hypot(x, y, z);
	            if (len > 1e-6) return { x: x / len, y: y / len, z: z / len };
	            const fx = Number.isFinite(fallback?.x) ? Number(fallback.x) : 0;
	            const fy = Number.isFinite(fallback?.y) ? Number(fallback.y) : 0;
	            const fz = Number.isFinite(fallback?.z) ? Number(fallback.z) : 0;
	            const fl = Math.hypot(fx, fy, fz);
	            if (fl > 1e-6) return { x: fx / fl, y: fy / fl, z: fz / fl };
	            return { x: 0, y: 1, z: 0 };
	        };

	        const directionToAzimuthElevationDegrees = (dir) => {
	            const n = normalizeDirection(dir, { x: 0, y: 1, z: 0 });
	            const elevationDegrees = Math.asin(clamp(n.y, -1, 1)) * (180 / Math.PI);
	            let azimuthDegrees = Math.atan2(n.z, n.x) * (180 / Math.PI);
	            if (azimuthDegrees < 0) azimuthDegrees += 360;
	            return { azimuthDegrees, elevationDegrees };
	        };

	        const azimuthElevationDegreesToDirection = (azimuthDegrees, elevationDegrees) => {
	            const az = clamp(azimuthDegrees, 0, 360) * (Math.PI / 180);
	            const el = clamp(elevationDegrees, 0, 90) * (Math.PI / 180);
	            const cosEl = Math.cos(el);
	            const x = cosEl * Math.cos(az);
	            const z = cosEl * Math.sin(az);
	            const y = Math.sin(el);
	            return normalizeDirection({ x, y, z }, { x: 0, y: 1, z: 0 });
	        };

	        const applyTooltip = (node, text) => {
	            const el = node && typeof node === 'object' ? node : null;
	            const t = typeof text === 'string' ? text : '';
	            if (!el || !t) return;
            el.title = t;
        };

        const appendMustHaveDot = (target) => {
            const el = target && typeof target === 'object' ? target : null;
            if (!el) return;
            const dot = document.createElement('span');
            dot.className = 'building-fab-must-have-dot';
            dot.setAttribute('aria-hidden', 'true');
            dot.textContent = '•';
            el.appendChild(dot);
            const sr = document.createElement('span');
            sr.className = 'building-fab-sr-only';
            sr.textContent = ' (must-have)';
            el.appendChild(sr);
        };

        const applyRangeRowMeta = (row, { tooltip = '', mustHave = false } = {}) => {
            if (!row) return;
            if (tooltip) {
                applyTooltip(row.label, tooltip);
                applyTooltip(row.range, tooltip);
                applyTooltip(row.number, tooltip);
            }
            if (mustHave) appendMustHaveDot(row.label);
        };

        const applyToggleRowMeta = (row, { tooltip = '', mustHave = false } = {}) => {
            if (!row) return;
            if (tooltip) {
                applyTooltip(row.text, tooltip);
                applyTooltip(row.toggle, tooltip);
            }
            if (mustHave) appendMustHaveDot(row.text);
        };

        const applySelectRowMeta = (row, { tooltip = '', mustHave = false } = {}) => {
            const r = row && typeof row === 'object' ? row : null;
            if (!r) return;
            if (tooltip) {
                applyTooltip(r.label, tooltip);
                applyTooltip(r.select, tooltip);
            }
            if (mustHave) appendMustHaveDot(r.label);
        };

        const addDetailsResetButton = (section, { label = 'Reset to defaults', onReset = null } = {}) => {
            const summary = section?.summary ?? null;
            const reset = typeof onReset === 'function' ? onReset : null;
            if (!summary || !reset) return null;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab-details-reset';
            btn.disabled = !allow;
            applyMaterialSymbolToButton(btn, { name: 'restart_alt', label, size: 'sm' });
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                reset();
            });
            summary.appendChild(btn);
            return btn;
        };

        const isMinimalMaterialVariationConfig = (cfg) => {
            const src = cfg && typeof cfg === 'object' ? cfg : null;
            if (!src) return true;
            const keys = Object.keys(src);
            for (const key of keys) {
                if (key !== 'enabled' && key !== 'seedOffset' && key !== 'normalMap') return false;
            }
            return true;
        };

        const createDisabledMaterialVariationConfig = (root, { seedOffset = 0, normalMap = null } = {}) => {
            const preset = getDefaultMaterialVariationPreset(root);
            const srcNormalMap = normalMap && typeof normalMap === 'object' ? normalMap : null;
            const presetNormalMap = preset.normalMap && typeof preset.normalMap === 'object' ? preset.normalMap : {};
            return {
                enabled: true,
                seedOffset: clampInt(seedOffset, -9999, 9999),
                root: preset.root,
                space: preset.space,
                worldSpaceScale: preset.worldSpaceScale,
                objectSpaceScale: preset.objectSpaceScale,
                globalIntensity: preset.globalIntensity,
                aoAmount: preset.aoAmount,
                normalMap: {
                    flipX: srcNormalMap?.flipX === undefined ? !!presetNormalMap.flipX : !!srcNormalMap.flipX,
                    flipY: srcNormalMap?.flipY === undefined ? !!presetNormalMap.flipY : !!srcNormalMap.flipY,
                    flipZ: srcNormalMap?.flipZ === undefined ? !!presetNormalMap.flipZ : !!srcNormalMap.flipZ
                },
                macroLayers: [{ enabled: false }, { enabled: false }, { enabled: false }, { enabled: false }],
                streaks: { enabled: false },
                exposure: { enabled: false },
                wearTop: { enabled: false },
                wearBottom: { enabled: false },
                wearSide: { enabled: false },
                cracksLayer: { enabled: false },
                antiTiling: { enabled: false },
                stairShift: { enabled: false },
                brick: {
                    ...(preset.brick ?? {}),
                    perBrick: { enabled: false },
                    mortar: { enabled: false }
                }
            };
        };

        const getStyleOption = (id) => (this._buildingStyleOptions ?? []).find((opt) => opt?.id === id) ?? null;
        const wallTextureDefs = [
            ...(this._buildingStyleOptions ?? []).map((opt) => ({
                id: opt.id,
                label: opt.label,
                wallTextureUrl: opt.wallTextureUrl ?? null
            })),
            ...getPbrMaterialOptionsForBuildings().map((opt) => ({
                id: opt.id,
                label: opt.label,
                wallTextureUrl: opt.previewUrl ?? null
            }))
        ];
        const getWallTextureOption = (id) => wallTextureDefs.find((opt) => opt?.id === id) ?? null;
        const getWindowOption = (id) => (this._windowTypeOptions ?? []).find((opt) => opt?.id === id) ?? null;
        const getBeltColorOption = (id) => (this._beltCourseColorOptions ?? []).find((opt) => opt?.id === id) ?? null;
        const getRoofColorOption = (id) => (this._roofColorOptions ?? []).find((opt) => opt?.id === id) ?? null;

        const parseMaterialPickerId = (value) => {
            if (typeof value !== 'string' || !value) return null;
            const idx = value.indexOf(':');
            if (idx <= 0) return null;
            const kind = value.slice(0, idx);
            const id = value.slice(idx + 1);
            if (!id) return null;
            if (kind !== 'texture' && kind !== 'color') return null;
            return { kind, id };
        };

        const makeTextureMaterialOptions = () => (this._buildingStyleOptions ?? []).map((opt) => ({
            id: `texture:${opt.id}`,
            label: opt.label,
            kind: 'texture',
            previewUrl: opt.wallTextureUrl
        }));

        const makeWallTextureMaterialOptions = () => wallTextureDefs.map((opt) => ({
            id: `texture:${opt.id}`,
            label: opt.label,
            kind: 'texture',
            previewUrl: opt.wallTextureUrl
        }));

        const makeBeltColorMaterialOptions = () => (this._beltCourseColorOptions ?? []).map((opt) => ({
            id: `color:${opt.id}`,
            label: opt.label,
            kind: 'color',
            hex: opt.hex
        }));

        const makeRoofColorMaterialOptions = () => {
            const defaultPreviewUrl = buildRoofDefaultPreviewUrl({ size: 96 });
            return (this._roofColorOptions ?? []).map((opt) => {
                if (opt.id === ROOF_COLOR.DEFAULT) {
                    return {
                        id: `color:${opt.id}`,
                        label: opt.label,
                        kind: 'color',
                        previewUrl: defaultPreviewUrl
                    };
                }
                return {
                    id: `color:${opt.id}`,
                    label: opt.label,
                    kind: 'color',
                    hex: opt.hex
                };
            });
        };

        const openMaterialPicker = ({
            title = 'Material',
            material = null,
            textureOptions = [],
            colorOptions = [],
            onSelect = null
        } = {}) => {
            const kind = material?.kind;
            const id = material?.id;
            const selectedId = (kind === 'texture' || kind === 'color') && typeof id === 'string' && id
                ? `${kind}:${id}`
                : null;

            this._pickerPopup.open({
                title,
                sections: [
                    { label: 'Texture', options: textureOptions },
                    { label: 'Color', options: colorOptions }
                ],
                selectedId,
                onSelect: (opt) => {
                    if (typeof onSelect !== 'function') return;
                    const next = parseMaterialPickerId(opt?.id);
                    if (!next) return;
                    onSelect(next);
                }
            });
        };

        const openWindowPicker = (layer, picker) => {
            const options = (this._windowTypeOptions ?? []).map((opt) => ({
                id: opt.id,
                label: opt.label,
                kind: 'texture',
                previewUrl: opt.previewUrl
            }));
            this._pickerPopup.open({
                title: 'Window type',
                sections: [{ label: 'Types', options }],
                selectedId: layer?.windows?.typeId || WINDOW_TYPE.STYLE_DEFAULT,
                onSelect: (opt) => {
                    layer.windows.typeId = opt.id;
                    const found = getWindowOption(layer.windows.typeId) ?? null;
                    const label = found?.label ?? layer.windows.typeId;
                    picker.text.textContent = label;
                    setMaterialThumbToTexture(picker.thumb, found?.previewUrl ?? '', label);
                    layer.windows.params = { ...getDefaultWindowParams(layer.windows.typeId), ...(layer.windows.params ?? {}) };
                    this._notifySelectedLayersChanged();
                }
            });
        };

        const textureMaterialOptions = makeTextureMaterialOptions();
        const wallTextureMaterialOptions = makeWallTextureMaterialOptions();
        const beltColorMaterialOptions = makeBeltColorMaterialOptions();
        const roofColorMaterialOptions = makeRoofColorMaterialOptions();

        for (const [idx, layer] of layers.entries()) {
            const layerId = layer?.id ?? `layer_${idx}`;
            const isFloor = layer?.type === LAYER_TYPE.FLOOR;
            const titleBase = isFloor ? 'Floor layer' : 'Roof layer';

            const layerSection = makeDetailsSection(titleBase, { open: true, key: `${scopeKey}:layer:${layerId}` });
            layerSection.details.classList.add('building-fab-layer');

            const actions = document.createElement('div');
            actions.className = 'building-fab-layer-row-actions';
            actions.addEventListener('click', (e) => e.stopPropagation());

            const makeActionBtn = (text) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'building-fab-layer-action';
                btn.textContent = text;
                return btn;
            };

            const upBtn = makeActionBtn('Up');
            const downBtn = makeActionBtn('Down');
            const delBtn = makeActionBtn('Remove');

            upBtn.disabled = !allow || idx === 0;
            downBtn.disabled = !allow || idx === layers.length - 1;
            delBtn.disabled = !allow;

            upBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleMoveLayer(layerId, -1);
            });
            downBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleMoveLayer(layerId, 1);
            });
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleRemoveLayer(layerId);
            });

            actions.appendChild(upBtn);
            actions.appendChild(downBtn);
            actions.appendChild(delBtn);
            layerSection.summary.appendChild(actions);

            const updateLayerTitle = () => {
                if (layer?.type === LAYER_TYPE.FLOOR) {
                    const floors = clampInt(layer.floors, 1, 99);
                    layerSection.label.textContent = `Floor layer · ${floors} floors`;
                    return;
                }
                layerSection.label.textContent = 'Roof layer';
            };
            updateLayerTitle();

            if (isFloor) {
                const floorsGroup = makeDetailsSection('Floors', { open: true, nested: true, key: `${scopeKey}:layer:${layerId}:floors` });
                const floorsRow = makeRangeRow('Floors');
                floorsRow.range.min = '1';
                floorsRow.range.max = String(this.floorMax);
                floorsRow.range.step = '1';
                floorsRow.number.min = '1';
                floorsRow.number.max = String(this.floorMax);
                floorsRow.number.step = '1';
                floorsRow.range.value = String(layer.floors);
                floorsRow.number.value = String(layer.floors);
                floorsRow.range.disabled = !allow;
                floorsRow.number.disabled = !allow;
                floorsRow.range.addEventListener('input', () => {
                    const next = clampInt(floorsRow.range.value, 1, this.floorMax);
                    layer.floors = next;
                    floorsRow.range.value = String(next);
                    floorsRow.number.value = String(next);
                    updateLayerTitle();
                    this._notifySelectedLayersChanged();
                });
                floorsRow.number.addEventListener('change', () => {
                    const next = clampInt(floorsRow.number.value, 1, this.floorMax);
                    layer.floors = next;
                    floorsRow.range.value = String(next);
                    floorsRow.number.value = String(next);
                    updateLayerTitle();
                    this._notifySelectedLayersChanged();
                });

                const heightRow = makeRangeRow('Floor height (m)');
                heightRow.range.min = '1.0';
                heightRow.range.max = '12.0';
                heightRow.range.step = '0.1';
                heightRow.number.min = '1.0';
                heightRow.number.max = '12.0';
                heightRow.number.step = '0.1';
                heightRow.range.value = String(layer.floorHeight);
                heightRow.number.value = formatFloat(layer.floorHeight, 1);
                heightRow.range.disabled = !allow;
                heightRow.number.disabled = !allow;
                heightRow.range.addEventListener('input', () => {
                    const next = clamp(heightRow.range.value, 1.0, 12.0);
                    layer.floorHeight = next;
                    heightRow.range.value = String(next);
                    heightRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });
                heightRow.number.addEventListener('change', () => {
                    const next = clamp(heightRow.number.value, 1.0, 12.0);
                    layer.floorHeight = next;
                    heightRow.range.value = String(next);
                    heightRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });

                floorsGroup.body.appendChild(floorsRow.row);
                floorsGroup.body.appendChild(heightRow.row);

                const planGroup = makeDetailsSection('Floorplan', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:floorplan` });
                const insetRow = makeRangeRow('Plan offset (m)');
                insetRow.range.min = '-8';
                insetRow.range.max = '8';
                insetRow.range.step = '0.1';
                insetRow.number.min = '-8';
                insetRow.number.max = '8';
                insetRow.number.step = '0.1';
                insetRow.range.value = String(layer.planOffset ?? 0);
                insetRow.number.value = formatFloat(layer.planOffset ?? 0, 1);
                insetRow.range.disabled = !allow;
                insetRow.number.disabled = !allow;
                insetRow.range.addEventListener('input', () => {
                    const next = clamp(insetRow.range.value, -8.0, 8.0);
                    layer.planOffset = next;
                    insetRow.range.value = String(next);
                    insetRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });
                insetRow.number.addEventListener('change', () => {
                    const next = clamp(insetRow.number.value, -8.0, 8.0);
                    layer.planOffset = next;
                    insetRow.range.value = String(next);
                    insetRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });
                planGroup.body.appendChild(insetRow.row);

                const wallsGroup = makeDetailsSection('Walls', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls` });
                const wallMaterialPicker = makePickerRow('Wall material');
                const wallMaterial = layer?.material ?? { kind: 'texture', id: layer?.style ?? BUILDING_STYLE.DEFAULT };
                if (wallMaterial?.kind === 'color') {
                    const colorId = typeof wallMaterial.id === 'string' && wallMaterial.id ? wallMaterial.id : BELT_COURSE_COLOR.OFFWHITE;
                    const found = getBeltColorOption(colorId) ?? null;
                    const label = found?.label ?? colorId;
                    wallMaterialPicker.text.textContent = label;
                    setMaterialThumbToColor(wallMaterialPicker.thumb, found?.hex ?? 0xffffff);
                } else {
                    const styleId = typeof wallMaterial?.id === 'string' && wallMaterial.id ? wallMaterial.id : (layer?.style ?? BUILDING_STYLE.DEFAULT);
                    const found = getWallTextureOption(styleId) ?? null;
                    const label = found?.label ?? styleId;
                    wallMaterialPicker.text.textContent = label;
                    setMaterialThumbToTexture(wallMaterialPicker.thumb, found?.wallTextureUrl ?? '', label);
                }
                wallMaterialPicker.button.disabled = !allow;
                wallMaterialPicker.button.addEventListener('click', () => {
                    openMaterialPicker({
                        title: 'Wall material',
                        material: layer.material ?? wallMaterial,
                        textureOptions: wallTextureMaterialOptions,
                        colorOptions: beltColorMaterialOptions,
                        onSelect: (spec) => {
                            layer.material = spec;
                            if (spec.kind === 'texture') layer.style = spec.id;

                            if (spec.kind === 'color') {
                                const found = getBeltColorOption(spec.id) ?? null;
                                const label = found?.label ?? spec.id;
                                wallMaterialPicker.text.textContent = label;
                                setMaterialThumbToColor(wallMaterialPicker.thumb, found?.hex ?? 0xffffff);
                            } else {
                                const found = getWallTextureOption(spec.id) ?? null;
                                const label = found?.label ?? spec.id;
                                wallMaterialPicker.text.textContent = label;
                                setMaterialThumbToTexture(wallMaterialPicker.thumb, found?.wallTextureUrl ?? '', label);
                            }
                            this._notifySelectedLayersChanged();
                        }
                    });
                });
                wallsGroup.body.appendChild(wallMaterialPicker.row);

                const wallTilingController = createTextureTilingMiniController({
                    mode: 'details',
                    title: 'Texture tiling',
                    detailsOpenByKey: this._detailsOpenByKey,
                    detailsKey: `${scopeKey}:layer:${layerId}:walls:tiling`,
                    allow,
                    tiling: (layer.tiling ??= {}),
                    defaults: { tileMeters: 2.0 },
                    hintText: 'Overrides the material tile size in meters.',
                    onChange: () => this._notifySelectedLayersChanged()
                });
                wallTilingController.mount(wallsGroup.body);
                this._layerMiniControllers.push(wallTilingController);

                const wallMatVarGroup = makeDetailsSection('Material variation', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar` });
                layer.materialVariation ??= { enabled: false, seedOffset: 0 };
                const wallMatVarNormalized = normalizeMaterialVariationConfig(layer.materialVariation, { root: MATERIAL_VARIATION_ROOT.WALL });

                const wallMatVarBasicsGroup = makeDetailsSection('Basics', { open: true, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:basics` });
                const wallMatVarMacroGroup = makeDetailsSection('Macro variation', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:macro` });
                const wallMatVarMidGroup = makeDetailsSection('Mid variation (patches)', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:mid` });
                const wallMatVarMicroGroup = makeDetailsSection('Micro variation (surface response)', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:micro` });
                const wallMatVarWeatherGroup = makeDetailsSection('Weathering', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:weather` });
                const wallMatVarBrickGroup = makeDetailsSection('Brick-specific', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:brick` });
                const wallMatVarAdvancedGroup = makeDetailsSection('Advanced', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:advanced` });

                wallMatVarGroup.body.appendChild(wallMatVarBasicsGroup.details);
                wallMatVarGroup.body.appendChild(wallMatVarMacroGroup.details);
                wallMatVarGroup.body.appendChild(wallMatVarMidGroup.details);
                wallMatVarGroup.body.appendChild(wallMatVarMicroGroup.details);
                wallMatVarGroup.body.appendChild(wallMatVarWeatherGroup.details);
                wallMatVarGroup.body.appendChild(wallMatVarBrickGroup.details);
                wallMatVarGroup.body.appendChild(wallMatVarAdvancedGroup.details);

                applyTooltip(
                    wallMatVarGroup.label,
                    tip(
                        'Procedural material variation and weathering for this layer.',
                        'Start with Basics → Intensity and World scale.',
                        'Too much: stacked effects look noisy or overly dirty.'
                    )
                );
                addDetailsResetButton(wallMatVarGroup, {
                    onReset: () => {
                        const prevEnabled = !!layer.materialVariation.enabled;
                        const prevSeedOffset = clampInt(layer.materialVariation.seedOffset ?? 0, -9999, 9999);
                        const preset = getDefaultMaterialVariationPreset(MATERIAL_VARIATION_ROOT.WALL);
                        layer.materialVariation = { ...preset, enabled: prevEnabled, seedOffset: prevSeedOffset };
                        this._renderLayersPanel();
                        this._notifySelectedLayersChanged();
                    }
                });
                applyTooltip(
                    wallMatVarBasicsGroup.label,
                    tip(
                        'Global controls that affect all enabled strategies.',
                        'Start here before touching the deeper groups.',
                        'Too much: high intensity + small world scale looks like grain/noise.'
                    )
                );
                applyTooltip(
                    wallMatVarMacroGroup.label,
                    tip(
                        'Large-scale breakup to fight repeating textures.',
                        'Start with Intensity + Scale on Macro layer 1.',
                        'Too much: obvious cloudy blotches.'
                    )
                );
                applyTooltip(
                    wallMatVarMidGroup.label,
                    tip(
                        'Patchy mid-scale variation (repairs/batches/fade).',
                        'Use sparingly for subtle material history.',
                        'Too much: looks like painted camouflage.'
                    )
                );
                applyTooltip(
                    wallMatVarMicroGroup.label,
                    tip(
                        'High-frequency variation for surface response (mostly roughness/normal).',
                        'Use small amounts to avoid flat, CG-looking materials.',
                        'Too much: sparkly, noisy specular.'
                    )
                );
                applyTooltip(
                    wallMatVarWeatherGroup.label,
                    tip(
                        'Purpose-driven weathering: runoff streaks, top deposits, ground grime, edge wear, cracks.',
                        'Prefer one or two subtle effects rather than everything at once.',
                        'Too much: uniformly dirty walls with no believable story.'
                    )
                );
                applyTooltip(
                    wallMatVarBrickGroup.label,
                    tip(
                        'Brick-specific controls (bonding / per-brick / mortar).',
                        'Use only for brick-like materials.',
                        'Too much: patterning becomes more obvious than the base texture.'
                    )
                );
                applyTooltip(
                    wallMatVarAdvancedGroup.label,
                    tip(
                        'Advanced controls (projection/space/debug/perf).',
                        'Usually leave defaults.',
                        'Too much: can cause distortion or artifacts.'
                    )
                );

                const matVarToggle = makeToggleRow('Enable variation');
                matVarToggle.input.checked = !!wallMatVarNormalized.enabled;
                matVarToggle.input.disabled = !allow;
                applyToggleRowMeta(matVarToggle, {
                    mustHave: true,
                    tooltip: tip(
                        'Turns on the variation system for this layer.',
                        'Typical: enable for subtle breakup and weathering.',
                        'Too much: high intensity across many strategies looks noisy/dirty.'
                    )
                });
                wallMatVarBasicsGroup.body.appendChild(matVarToggle.toggle);

                const seedOffsetRow = makeRangeRow('Seed offset');
                seedOffsetRow.range.min = '-9999';
                seedOffsetRow.range.max = '9999';
                seedOffsetRow.range.step = '1';
                seedOffsetRow.number.min = '-9999';
                seedOffsetRow.number.max = '9999';
                seedOffsetRow.number.step = '1';
                seedOffsetRow.range.value = String(layer.materialVariation.seedOffset ?? 0);
                seedOffsetRow.number.value = String(layer.materialVariation.seedOffset ?? 0);
                applyRangeRowMeta(seedOffsetRow, {
                    tooltip: tip(
                        'Offsets the random seed for this layer.',
                        'Use to make the same style look different per building.',
                        'Too much: not harmful, but makes iteration harder to compare.'
                    )
                });
                wallMatVarBasicsGroup.body.appendChild(seedOffsetRow.row);

                const intensityRow = makeRangeRow('Intensity');
                intensityRow.range.min = '0';
                intensityRow.range.max = '2';
                intensityRow.range.step = '0.01';
                intensityRow.number.min = '0';
                intensityRow.number.max = '2';
                intensityRow.number.step = '0.01';
                intensityRow.range.value = String(wallMatVarNormalized.globalIntensity);
                intensityRow.number.value = formatFloat(wallMatVarNormalized.globalIntensity, 2);
                applyRangeRowMeta(intensityRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Overall multiplier for all enabled variation strategies.',
                        'Typical: 0.5–1.5 for subtle breakup.',
                        'Too much: everything becomes noisy and over-processed.'
                    )
                });
                wallMatVarBasicsGroup.body.appendChild(intensityRow.row);

                const scaleRow = makeRangeRow('World scale');
                scaleRow.range.min = '0.05';
                scaleRow.range.max = '4';
                scaleRow.range.step = '0.01';
                scaleRow.number.min = '0.05';
                scaleRow.number.max = '4';
                scaleRow.number.step = '0.01';
                scaleRow.range.value = String(wallMatVarNormalized.worldSpaceScale);
                scaleRow.number.value = formatFloat(wallMatVarNormalized.worldSpaceScale, 2);
                applyRangeRowMeta(scaleRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Sets the world-space scale for the procedural patterns.',
                        'Lower = larger features; higher = smaller features.',
                        'Too much: very high values look like grain/noise.'
                    )
	                });
	                wallMatVarBasicsGroup.body.appendChild(scaleRow.row);

	                const aoAmountRow = makeRangeRow('AO amount');
	                aoAmountRow.range.min = '0';
	                aoAmountRow.range.max = '1';
                aoAmountRow.range.step = '0.01';
                aoAmountRow.number.min = '0';
                aoAmountRow.number.max = '1';
                aoAmountRow.number.step = '0.01';
                aoAmountRow.range.value = String(wallMatVarNormalized.aoAmount);
                aoAmountRow.number.value = formatFloat(wallMatVarNormalized.aoAmount, 2);
                applyRangeRowMeta(aoAmountRow, {
                    tooltip: tip(
                        'Ambient occlusion influence inside the variation system.',
                        'Typical: 0.30–0.70 depending on how strong you want crevices.',
                        'Too much: everything looks dirty and crushed.'
                    )
                });
                wallMatVarBasicsGroup.body.appendChild(aoAmountRow.row);

                const matVarSpaceRow = document.createElement('div');
                matVarSpaceRow.className = 'building-fab-row building-fab-row-wide';
                const matVarSpaceLabel = document.createElement('div');
                matVarSpaceLabel.className = 'building-fab-row-label';
                matVarSpaceLabel.textContent = 'Space';
                const matVarSpaceSelect = document.createElement('select');
                matVarSpaceSelect.className = 'building-fab-select';
                for (const v of ['world', 'object']) {
                    const opt = document.createElement('option');
                    opt.value = v;
                    opt.textContent = v === 'object' ? 'Object space (sticks to mesh)' : 'World space (sticks to scene)';
                    matVarSpaceSelect.appendChild(opt);
                }
                matVarSpaceSelect.value = wallMatVarNormalized.space === 'object' ? 'object' : 'world';
                matVarSpaceRow.appendChild(matVarSpaceLabel);
                matVarSpaceRow.appendChild(matVarSpaceSelect);
                applySelectRowMeta(
                    { label: matVarSpaceLabel, select: matVarSpaceSelect },
                    {
                        tooltip: tip(
                            'Chooses the coordinate space for the procedural patterns.',
                            'World: stable across objects; Object: sticks to the mesh (good for moving parts).',
                            'Too much: Object space can reveal stretching on low-UV assets.'
                        )
                    }
                );
                wallMatVarAdvancedGroup.body.appendChild(matVarSpaceRow);

                const objectScaleRow = makeRangeRow('Object scale');
                objectScaleRow.range.min = '0.05';
                objectScaleRow.range.max = '4';
                objectScaleRow.range.step = '0.01';
                objectScaleRow.number.min = '0.05';
                objectScaleRow.number.max = '4';
                objectScaleRow.number.step = '0.01';
                objectScaleRow.range.value = String(wallMatVarNormalized.objectSpaceScale);
                objectScaleRow.number.value = formatFloat(wallMatVarNormalized.objectSpaceScale, 2);
                applyRangeRowMeta(objectScaleRow, {
                    tooltip: tip(
                        'Scale used when Space is set to Object.',
                        'Lower = larger features; higher = smaller features.',
                        'Too much: very high values look like grain/noise.'
                    )
                });
                wallMatVarAdvancedGroup.body.appendChild(objectScaleRow.row);

                const wallMatVarNormalMapGroup = makeDetailsSection('Normal map', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:normalMap` });
                applyTooltip(
                    wallMatVarNormalMapGroup.label,
                    tip(
                        'Per-layer normal map channel fixes.',
                        'Typical: flip Y (green) if the normal map is authored for a different convention (DirectX vs OpenGL).',
                        'Use with care: flipping X/Z can make lighting look inside-out.'
                    )
                );

                const wallMatVarNormalFlipXToggle = makeToggleRow('Flip normal X (red)');
                wallMatVarNormalFlipXToggle.input.checked = !!wallMatVarNormalized.normalMap?.flipX;
                wallMatVarNormalFlipXToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                applyToggleRowMeta(wallMatVarNormalFlipXToggle, {
                    tooltip: tip(
                        'Flips the red channel of the normal map.',
                        'Use if lighting looks mirrored left/right.',
                        'Not commonly needed for standard OpenGL normal maps.'
                    )
                });
                wallMatVarNormalMapGroup.body.appendChild(wallMatVarNormalFlipXToggle.toggle);

                const wallMatVarNormalFlipYToggle = makeToggleRow('Flip normal Y (green)');
                wallMatVarNormalFlipYToggle.input.checked = !!wallMatVarNormalized.normalMap?.flipY;
                wallMatVarNormalFlipYToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                applyToggleRowMeta(wallMatVarNormalFlipYToggle, {
                    tooltip: tip(
                        'Flips the green channel of the normal map.',
                        'Typical: enable when using DirectX-authored normal maps.',
                        'If shading becomes worse, turn it back off.'
                    )
                });
                wallMatVarNormalMapGroup.body.appendChild(wallMatVarNormalFlipYToggle.toggle);

                const wallMatVarNormalFlipZToggle = makeToggleRow('Flip normal Z (blue)');
                wallMatVarNormalFlipZToggle.input.checked = !!wallMatVarNormalized.normalMap?.flipZ;
                wallMatVarNormalFlipZToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                applyToggleRowMeta(wallMatVarNormalFlipZToggle, {
                    tooltip: tip(
                        'Flips the blue channel of the normal map.',
                        'Rarely needed.',
                        'If enabled, lighting can look inverted.'
                    )
                });
                wallMatVarNormalMapGroup.body.appendChild(wallMatVarNormalFlipZToggle.toggle);

                wallMatVarAdvancedGroup.body.appendChild(wallMatVarNormalMapGroup.details);

                const macro0 = wallMatVarNormalized.macroLayers?.[0] ?? null;
                const macroGroup = makeDetailsSection('Macro layer 1', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:macro0` });
                applyTooltip(
                    macroGroup.label,
                    tip(
                        'Macro layer 1 (Macro A): primary large-scale breakup.',
                        'Start with Intensity + Scale for subtle variation.',
                        'Too much: big cloudy blobs that overpower the base material.'
                    )
                );
                const macroToggle = makeToggleRow('Enable macro layer 1');
                macroToggle.input.checked = !!macro0?.enabled;
                macroToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                applyToggleRowMeta(macroToggle, {
                    mustHave: true,
                    tooltip: tip(
                        'Enables Macro A (large-scale breakup).',
                        'Typical: enabled for walls to reduce repetition.',
                        'Too much: combined with high intensity can look blotchy.'
                    )
                });
                macroGroup.body.appendChild(macroToggle.toggle);
                const macroIntensityRow = makeRangeRow('Intensity');
                macroIntensityRow.range.min = '0';
                macroIntensityRow.range.max = '2';
                macroIntensityRow.range.step = '0.01';
                macroIntensityRow.number.min = '0';
                macroIntensityRow.number.max = '2';
                macroIntensityRow.number.step = '0.01';
                macroIntensityRow.range.value = String(macro0?.intensity ?? 0.0);
                macroIntensityRow.number.value = formatFloat(macro0?.intensity ?? 0.0, 2);
                applyRangeRowMeta(macroIntensityRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Strength of Macro A.',
                        'Typical: 0.2–1.0 (depending on the material).',
                        'Too much: obvious blotches and loss of texture identity.'
                    )
                });
                macroGroup.body.appendChild(macroIntensityRow.row);
                const macroScaleRow = makeRangeRow('Scale');
                macroScaleRow.range.min = '0.01';
                macroScaleRow.range.max = '20';
                macroScaleRow.range.step = '0.01';
                macroScaleRow.number.min = '0.01';
                macroScaleRow.number.max = '20';
                macroScaleRow.number.step = '0.01';
                macroScaleRow.range.value = String(macro0?.scale ?? 1.0);
                macroScaleRow.number.value = formatFloat(macro0?.scale ?? 1.0, 2);
                applyRangeRowMeta(macroScaleRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Frequency of Macro A (higher = smaller features).',
                        'Typical: 0.1–5 depending on your tile size.',
                        'Too much: looks like noisy speckling instead of macro breakup.'
                    )
                });
                macroGroup.body.appendChild(macroScaleRow.row);

                const macroHueRow = makeRangeRow('Hue shift (deg)');
                macroHueRow.range.min = '-180';
                macroHueRow.range.max = '180';
                macroHueRow.range.step = '1';
                macroHueRow.number.min = '-180';
                macroHueRow.number.max = '180';
                macroHueRow.number.step = '1';
                macroHueRow.range.value = String(macro0?.hueDegrees ?? 0.0);
                macroHueRow.number.value = String(Math.round(macro0?.hueDegrees ?? 0.0));
                applyRangeRowMeta(macroHueRow, {
                    tooltip: tip(
                        'Hue shift for Macro A.',
                        'Typical: ±5–20° for subtle hue drift.',
                        'Too much: unnatural rainbow color variation.'
                    )
                });
                macroGroup.body.appendChild(macroHueRow.row);

                const macroValueRow = makeRangeRow('Value');
                macroValueRow.range.min = '-1';
                macroValueRow.range.max = '1';
                macroValueRow.range.step = '0.01';
                macroValueRow.number.min = '-1';
                macroValueRow.number.max = '1';
                macroValueRow.number.step = '0.01';
                macroValueRow.range.value = String(macro0?.value ?? 0.0);
                macroValueRow.number.value = formatFloat(macro0?.value ?? 0.0, 2);
                applyRangeRowMeta(macroValueRow, {
                    tooltip: tip(
                        'Brightness/value shift for Macro A.',
                        'Typical: small positive/negative values.',
                        'Too much: strong patchiness and contrast.'
                    )
                });
                macroGroup.body.appendChild(macroValueRow.row);

                const macroSaturationRow = makeRangeRow('Saturation');
                macroSaturationRow.range.min = '-1';
                macroSaturationRow.range.max = '1';
                macroSaturationRow.range.step = '0.01';
                macroSaturationRow.number.min = '-1';
                macroSaturationRow.number.max = '1';
                macroSaturationRow.number.step = '0.01';
                macroSaturationRow.range.value = String(macro0?.saturation ?? 0.0);
                macroSaturationRow.number.value = formatFloat(macro0?.saturation ?? 0.0, 2);
                applyRangeRowMeta(macroSaturationRow, {
                    tooltip: tip(
                        'Saturation shift for Macro A.',
                        'Typical: subtle.',
                        'Too much: cartoonish saturation swings or desaturated blotches.'
                    )
                });
                macroGroup.body.appendChild(macroSaturationRow.row);

                const macroRoughnessRow = makeRangeRow('Roughness');
                macroRoughnessRow.range.min = '-1';
                macroRoughnessRow.range.max = '1';
                macroRoughnessRow.range.step = '0.01';
                macroRoughnessRow.number.min = '-1';
                macroRoughnessRow.number.max = '1';
                macroRoughnessRow.number.step = '0.01';
                macroRoughnessRow.range.value = String(macro0?.roughness ?? 0.0);
                macroRoughnessRow.number.value = formatFloat(macro0?.roughness ?? 0.0, 2);
                applyRangeRowMeta(macroRoughnessRow, {
                    tooltip: tip(
                        'Roughness shift for Macro A.',
                        'Typical: subtle (helps break uniform specular).',
                        'Too much: sparkly highlights or overly matte patches.'
                    )
                });
                macroGroup.body.appendChild(macroRoughnessRow.row);

                const macroNormalRow = makeRangeRow('Normal');
                macroNormalRow.range.min = '-1';
                macroNormalRow.range.max = '1';
                macroNormalRow.range.step = '0.01';
                macroNormalRow.number.min = '-1';
                macroNormalRow.number.max = '1';
                macroNormalRow.number.step = '0.01';
                macroNormalRow.range.value = String(macro0?.normal ?? 0.0);
                macroNormalRow.number.value = formatFloat(macro0?.normal ?? 0.0, 2);
                applyRangeRowMeta(macroNormalRow, {
                    tooltip: tip(
                        'Normal shift for Macro A.',
                        'Typical: small (mostly leave at 0).',
                        'Too much: warping/bumpy shading artifacts.'
                    )
                });
                macroGroup.body.appendChild(macroNormalRow.row);
                wallMatVarMacroGroup.body.appendChild(macroGroup.details);

                const streaksGroup = makeDetailsSection('Streaks', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:streaks` });
                applyTooltip(
                    streaksGroup.label,
                    tip(
                        'Runoff streaks and drip marks (gravity-aligned).',
                        'Good for subtle staining and variation directionality.',
                        'Too much: walls look uniformly dirty and overdone.'
                    )
                );
                const streaksToggle = makeToggleRow('Enable streaks');
                streaksToggle.input.checked = !!wallMatVarNormalized.streaks.enabled;
                streaksToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                applyToggleRowMeta(streaksToggle, {
                    mustHave: true,
                    tooltip: tip(
                        'Enables gravity-aligned streaking/runoff.',
                        'Typical: enable with low Strength for realism.',
                        'Too much: obvious drips on every surface.'
                    )
                });
                streaksGroup.body.appendChild(streaksToggle.toggle);
                const streakStrengthRow = makeRangeRow('Strength');
                streakStrengthRow.range.min = '0';
                streakStrengthRow.range.max = '2';
                streakStrengthRow.range.step = '0.01';
                streakStrengthRow.number.min = '0';
                streakStrengthRow.number.max = '2';
                streakStrengthRow.number.step = '0.01';
                streakStrengthRow.range.value = String(wallMatVarNormalized.streaks.strength);
                streakStrengthRow.number.value = formatFloat(wallMatVarNormalized.streaks.strength, 2);
                applyRangeRowMeta(streakStrengthRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Strength of streaking/runoff.',
                        'Typical: 0.05–0.30 for subtle staining.',
                        'Too much: heavy grime everywhere.'
                    )
                });
                streaksGroup.body.appendChild(streakStrengthRow.row);
                const streakScaleRow = makeRangeRow('Scale');
                streakScaleRow.range.min = '0.01';
                streakScaleRow.range.max = '20';
                streakScaleRow.range.step = '0.01';
                streakScaleRow.number.min = '0.01';
                streakScaleRow.number.max = '20';
                streakScaleRow.number.step = '0.01';
                streakScaleRow.range.value = String(wallMatVarNormalized.streaks.scale);
                streakScaleRow.number.value = formatFloat(wallMatVarNormalized.streaks.scale, 2);
                applyRangeRowMeta(streakScaleRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Size of streak features (higher = smaller streak detail).',
                        'Typical: 0.3–2.0 depending on wall size.',
                        'Too much: tiny scale reads as noisy speckles.'
                    )
                });
                streaksGroup.body.appendChild(streakScaleRow.row);

                const streakLedgeStrengthRow = makeRangeRow('Ledge strength');
                streakLedgeStrengthRow.range.min = '0';
                streakLedgeStrengthRow.range.max = '2';
                streakLedgeStrengthRow.range.step = '0.01';
                streakLedgeStrengthRow.number.min = '0';
                streakLedgeStrengthRow.number.max = '2';
                streakLedgeStrengthRow.number.step = '0.01';
                streakLedgeStrengthRow.range.value = String(wallMatVarNormalized.streaks.ledgeStrength);
                streakLedgeStrengthRow.number.value = formatFloat(wallMatVarNormalized.streaks.ledgeStrength, 2);
                applyRangeRowMeta(streakLedgeStrengthRow, {
                    tooltip: tip(
                        'Extra streaking under ledges/edges.',
                        'Typical: small values (often 0).',
                        'Too much: zebra stripes under every edge.'
                    )
                });
                streaksGroup.body.appendChild(streakLedgeStrengthRow.row);

                const streakLedgeScaleRow = makeRangeRow('Ledge scale');
                streakLedgeScaleRow.range.min = '0';
                streakLedgeScaleRow.range.max = '20';
                streakLedgeScaleRow.range.step = '0.1';
                streakLedgeScaleRow.number.min = '0';
                streakLedgeScaleRow.number.max = '20';
                streakLedgeScaleRow.number.step = '0.1';
                streakLedgeScaleRow.range.value = String(wallMatVarNormalized.streaks.ledgeScale);
                streakLedgeScaleRow.number.value = formatFloat(wallMatVarNormalized.streaks.ledgeScale, 1);
                applyRangeRowMeta(streakLedgeScaleRow, {
                    tooltip: tip(
                        'Frequency of ledge streak detail.',
                        'Typical: leave default unless you use ledge strength.',
                        'Too much: repetitive banding under edges.'
                    )
                });
                streaksGroup.body.appendChild(streakLedgeScaleRow.row);

                const streakHueRow = makeRangeRow('Hue shift (deg)');
                streakHueRow.range.min = '-180';
                streakHueRow.range.max = '180';
                streakHueRow.range.step = '1';
                streakHueRow.number.min = '-180';
                streakHueRow.number.max = '180';
                streakHueRow.number.step = '1';
                streakHueRow.range.value = String(wallMatVarNormalized.streaks.hueDegrees);
                streakHueRow.number.value = String(Math.round(wallMatVarNormalized.streaks.hueDegrees));
                applyRangeRowMeta(streakHueRow, {
                    tooltip: tip(
                        'Hue shift applied inside streaks.',
                        'Typical: subtle warm/cool shift.',
                        'Too much: colored paint-like drips.'
                    )
                });
                streaksGroup.body.appendChild(streakHueRow.row);

                const streakValueRow = makeRangeRow('Value');
                streakValueRow.range.min = '-1';
                streakValueRow.range.max = '1';
                streakValueRow.range.step = '0.01';
                streakValueRow.number.min = '-1';
                streakValueRow.number.max = '1';
                streakValueRow.number.step = '0.01';
                streakValueRow.range.value = String(wallMatVarNormalized.streaks.value ?? 0.0);
                streakValueRow.number.value = formatFloat(wallMatVarNormalized.streaks.value ?? 0.0, 2);
                applyRangeRowMeta(streakValueRow, {
                    tooltip: tip(
                        'Brightness/value shift inside streaks.',
                        'Typical: slightly darker for grime or slightly brighter for chalky deposits.',
                        'Too much: harsh painted streaks.'
                    )
                });
                streaksGroup.body.appendChild(streakValueRow.row);

                const streakSaturationRow = makeRangeRow('Saturation');
                streakSaturationRow.range.min = '-1';
                streakSaturationRow.range.max = '1';
                streakSaturationRow.range.step = '0.01';
                streakSaturationRow.number.min = '-1';
                streakSaturationRow.number.max = '1';
                streakSaturationRow.number.step = '0.01';
                streakSaturationRow.range.value = String(wallMatVarNormalized.streaks.saturation ?? 0.0);
                streakSaturationRow.number.value = formatFloat(wallMatVarNormalized.streaks.saturation ?? 0.0, 2);
                applyRangeRowMeta(streakSaturationRow, {
                    tooltip: tip(
                        'Saturation shift inside streaks.',
                        'Typical: small negative saturation for grime.',
                        'Too much: colored streaks that look like paint.'
                    )
                });
                streaksGroup.body.appendChild(streakSaturationRow.row);

                const streakRoughnessRow = makeRangeRow('Roughness');
	                streakRoughnessRow.range.min = '-1';
	                streakRoughnessRow.range.max = '1';
	                streakRoughnessRow.range.step = '0.01';
	                streakRoughnessRow.number.min = '-1';
	                streakRoughnessRow.number.max = '1';
	                streakRoughnessRow.number.step = '0.01';
	                streakRoughnessRow.range.value = String(wallMatVarNormalized.streaks.roughness ?? 0.0);
	                streakRoughnessRow.number.value = formatFloat(wallMatVarNormalized.streaks.roughness ?? 0.0, 2);
	                applyRangeRowMeta(streakRoughnessRow, {
                    tooltip: tip(
                        'Roughness shift inside streaks.',
                        'Typical: slightly rougher for dried deposits.',
                        'Too much: inconsistent specular that reads as noise.'
                    )
                });
                streaksGroup.body.appendChild(streakRoughnessRow.row);

                const streakNormalRow = makeRangeRow('Normal');
                streakNormalRow.range.min = '-1';
                streakNormalRow.range.max = '1';
                streakNormalRow.range.step = '0.01';
                streakNormalRow.number.min = '-1';
                streakNormalRow.number.max = '1';
                streakNormalRow.number.step = '0.01';
                streakNormalRow.range.value = String(wallMatVarNormalized.streaks.normal ?? 0.0);
                streakNormalRow.number.value = formatFloat(wallMatVarNormalized.streaks.normal ?? 0.0, 2);
                applyRangeRowMeta(streakNormalRow, {
                    tooltip: tip(
                        'Normal shift inside streaks.',
                        'Typical: 0 (leave off unless you need stronger texture response).',
                        'Too much: bumpy streak artifacts.'
                    )
	                });
	                streaksGroup.body.appendChild(streakNormalRow.row);
	                wallMatVarWeatherGroup.body.appendChild(streaksGroup.details);

	                const exposure = wallMatVarNormalized.exposure ?? null;
	                const exposureGroup = makeDetailsSection('Orientation exposure', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:exposure` });
	                applyTooltip(
	                    exposureGroup.label,
	                    tip(
	                        'Directional exposure based on surface orientation (sun bleaching / windward rain).',
	                        'Use subtle Strength and tune Exponent to control falloff.',
	                        'Too much: one side of the building looks unnaturally different.'
	                    )
	                );
	                const exposureToggle = makeToggleRow('Enable exposure');
	                exposureToggle.input.checked = !!exposure?.enabled;
	                exposureToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
	                applyToggleRowMeta(exposureToggle, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Enables orientation-based exposure.',
	                        'Typical: on for sun bleaching or windward staining.',
	                        'Too much: a harsh split between directions.'
	                    )
	                });
	                exposureGroup.body.appendChild(exposureToggle.toggle);

	                const exposureStrengthRow = makeRangeRow('Strength');
	                exposureStrengthRow.range.min = '0';
	                exposureStrengthRow.range.max = '2';
	                exposureStrengthRow.range.step = '0.01';
	                exposureStrengthRow.number.min = '0';
	                exposureStrengthRow.number.max = '2';
	                exposureStrengthRow.number.step = '0.01';
	                exposureStrengthRow.range.value = String(exposure?.strength ?? 0.0);
	                exposureStrengthRow.number.value = formatFloat(exposure?.strength ?? 0.0, 2);
	                applyRangeRowMeta(exposureStrengthRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Strength of the exposure mask.',
	                        'Typical: 0.05–0.30.',
	                        'Too much: strong directional discoloration.'
	                    )
	                });
	                exposureGroup.body.appendChild(exposureStrengthRow.row);

	                const exposureExponentRow = makeRangeRow('Exponent');
	                exposureExponentRow.range.min = '0.1';
	                exposureExponentRow.range.max = '8';
	                exposureExponentRow.range.step = '0.01';
	                exposureExponentRow.number.min = '0.1';
	                exposureExponentRow.number.max = '8';
	                exposureExponentRow.number.step = '0.01';
	                exposureExponentRow.range.value = String(exposure?.exponent ?? 1.6);
	                exposureExponentRow.number.value = formatFloat(exposure?.exponent ?? 1.6, 2);
	                applyRangeRowMeta(exposureExponentRow, {
	                    tooltip: tip(
	                        'Sharpness of the direction falloff (higher = tighter).',
	                        'Typical: 1.2–2.5.',
	                        'Too much: abrupt “cutoff” bands.'
	                    )
	                });
	                exposureGroup.body.appendChild(exposureExponentRow.row);

	                const exposureAngles = directionToAzimuthElevationDegrees(exposure?.direction);
	                const exposureAzimuthRow = makeRangeRow('Azimuth (deg)');
	                exposureAzimuthRow.range.min = '0';
	                exposureAzimuthRow.range.max = '360';
	                exposureAzimuthRow.range.step = '1';
	                exposureAzimuthRow.number.min = '0';
	                exposureAzimuthRow.number.max = '360';
	                exposureAzimuthRow.number.step = '1';
	                exposureAzimuthRow.range.value = String(Math.round(exposureAngles.azimuthDegrees));
	                exposureAzimuthRow.number.value = String(Math.round(exposureAngles.azimuthDegrees));
	                applyRangeRowMeta(exposureAzimuthRow, {
	                    tooltip: tip(
	                        'Direction azimuth in world space.',
	                        'Typical: aim toward the “sun” or prevailing weather.',
	                        'Too much: direction mismatched to scene lighting.'
	                    )
	                });
	                exposureGroup.body.appendChild(exposureAzimuthRow.row);

	                const exposureElevationRow = makeRangeRow('Elevation (deg)');
	                exposureElevationRow.range.min = '0';
	                exposureElevationRow.range.max = '90';
	                exposureElevationRow.range.step = '1';
	                exposureElevationRow.number.min = '0';
	                exposureElevationRow.number.max = '90';
	                exposureElevationRow.number.step = '1';
	                exposureElevationRow.range.value = String(Math.round(exposureAngles.elevationDegrees));
	                exposureElevationRow.number.value = String(Math.round(exposureAngles.elevationDegrees));
	                applyRangeRowMeta(exposureElevationRow, {
	                    tooltip: tip(
	                        'Direction elevation in world space (0 = horizon, 90 = straight up).',
	                        'Typical: 25–70 for sun bleaching.',
	                        'Too much: extreme values can feel arbitrary.'
	                    )
	                });
	                exposureGroup.body.appendChild(exposureElevationRow.row);

	                const exposureValueRow = makeRangeRow('Value');
	                exposureValueRow.range.min = '-1';
	                exposureValueRow.range.max = '1';
	                exposureValueRow.range.step = '0.01';
	                exposureValueRow.number.min = '-1';
	                exposureValueRow.number.max = '1';
	                exposureValueRow.number.step = '0.01';
	                exposureValueRow.range.value = String(exposure?.value ?? 0.0);
	                exposureValueRow.number.value = formatFloat(exposure?.value ?? 0.0, 2);
	                applyRangeRowMeta(exposureValueRow, {
	                    tooltip: tip(
	                        'Brightness shift in exposed areas.',
	                        'Typical: small positive for bleaching.',
	                        'Too much: chalky, washed-out faces.'
	                    )
	                });
	                exposureGroup.body.appendChild(exposureValueRow.row);

	                const exposureSaturationRow = makeRangeRow('Saturation');
	                exposureSaturationRow.range.min = '-1';
	                exposureSaturationRow.range.max = '1';
	                exposureSaturationRow.range.step = '0.01';
	                exposureSaturationRow.number.min = '-1';
	                exposureSaturationRow.number.max = '1';
	                exposureSaturationRow.number.step = '0.01';
	                exposureSaturationRow.range.value = String(exposure?.saturation ?? 0.0);
	                exposureSaturationRow.number.value = formatFloat(exposure?.saturation ?? 0.0, 2);
	                applyRangeRowMeta(exposureSaturationRow, {
	                    tooltip: tip(
	                        'Saturation shift in exposed areas.',
	                        'Typical: slight desaturation for bleaching.',
	                        'Too much: color pops or dulls unnaturally.'
	                    )
	                });
	                exposureGroup.body.appendChild(exposureSaturationRow.row);

	                const exposureRoughnessRow = makeRangeRow('Roughness');
	                exposureRoughnessRow.range.min = '-1';
	                exposureRoughnessRow.range.max = '1';
	                exposureRoughnessRow.range.step = '0.01';
	                exposureRoughnessRow.number.min = '-1';
	                exposureRoughnessRow.number.max = '1';
	                exposureRoughnessRow.number.step = '0.01';
	                exposureRoughnessRow.range.value = String(exposure?.roughness ?? 0.0);
	                exposureRoughnessRow.number.value = formatFloat(exposure?.roughness ?? 0.0, 2);
	                applyRangeRowMeta(exposureRoughnessRow, {
	                    tooltip: tip(
	                        'Roughness shift in exposed areas.',
	                        'Typical: slightly smoother or rougher depending on material.',
	                        'Too much: sparkly or overly flat highlights.'
	                    )
	                });
	                exposureGroup.body.appendChild(exposureRoughnessRow.row);
	                wallMatVarWeatherGroup.body.appendChild(exposureGroup.details);

	                const wearSide = wallMatVarNormalized.wearSide ?? null;
	                const edgeGroup = makeDetailsSection('Side wear (vertical edges)', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:wearSide` });
	                applyTooltip(
                    edgeGroup.label,
                    tip(
                        'Edge/side wear along vertical corners and edges.',
                        'Good for subtle exposure and chipped-edge feel.',
                        'Too much: outlines every edge like a cartoon.'
                    )
                );
                const edgeToggle = makeToggleRow('Enable side wear');
                edgeToggle.input.checked = !!wearSide?.enabled;
                edgeToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                applyToggleRowMeta(edgeToggle, {
                    mustHave: true,
                    tooltip: tip(
                        'Enables vertical edge wear.',
                        'Typical: enable with low Strength.',
                        'Too much: edges become uniformly highlighted.'
                    )
                });
                edgeGroup.body.appendChild(edgeToggle.toggle);
                const edgeStrengthRow = makeRangeRow('Strength');
                edgeStrengthRow.range.min = '0';
                edgeStrengthRow.range.max = '2';
                edgeStrengthRow.range.step = '0.01';
                edgeStrengthRow.number.min = '0';
                edgeStrengthRow.number.max = '2';
                edgeStrengthRow.number.step = '0.01';
                edgeStrengthRow.range.value = String(wearSide?.intensity ?? 0.0);
                edgeStrengthRow.number.value = formatFloat(wearSide?.intensity ?? 0.0, 2);
                applyRangeRowMeta(edgeStrengthRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Strength of edge wear.',
                        'Typical: 0.05–0.30.',
                        'Too much: bright/dirty outlines on every corner.'
                    )
                });
                edgeGroup.body.appendChild(edgeStrengthRow.row);

                const edgeWidthRow = makeRangeRow('Width');
                edgeWidthRow.range.min = '0';
                edgeWidthRow.range.max = '4';
                edgeWidthRow.range.step = '0.01';
                edgeWidthRow.number.min = '0';
                edgeWidthRow.number.max = '4';
                edgeWidthRow.number.step = '0.01';
                edgeWidthRow.range.value = String(wearSide?.width ?? 1.0);
                edgeWidthRow.number.value = formatFloat(wearSide?.width ?? 1.0, 2);
                applyRangeRowMeta(edgeWidthRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Width of the edge wear band.',
                        'Typical: 0.2–1.0 depending on building scale.',
                        'Too much: looks like painted stripes on corners.'
                    )
                });
                edgeGroup.body.appendChild(edgeWidthRow.row);

                const edgeScaleRow = makeRangeRow('Scale');
                edgeScaleRow.range.min = '0.01';
                edgeScaleRow.range.max = '20';
                edgeScaleRow.range.step = '0.01';
                edgeScaleRow.number.min = '0.01';
                edgeScaleRow.number.max = '20';
                edgeScaleRow.number.step = '0.01';
                edgeScaleRow.range.value = String(wearSide?.scale ?? 1.0);
                edgeScaleRow.number.value = formatFloat(wearSide?.scale ?? 1.0, 2);
                applyRangeRowMeta(edgeScaleRow, {
                    tooltip: tip(
                        'Noise scale used to break up the edge band.',
                        'Typical: 0.5–2.0.',
                        'Too much: noisy, peppery edges.'
                    )
                });
                edgeGroup.body.appendChild(edgeScaleRow.row);

                const edgeHueRow = makeRangeRow('Hue shift (deg)');
                edgeHueRow.range.min = '-180';
                edgeHueRow.range.max = '180';
                edgeHueRow.range.step = '1';
                edgeHueRow.number.min = '-180';
                edgeHueRow.number.max = '180';
                edgeHueRow.number.step = '1';
                edgeHueRow.range.value = String(wearSide?.hueDegrees ?? 0.0);
                edgeHueRow.number.value = String(Math.round(wearSide?.hueDegrees ?? 0.0));
                applyRangeRowMeta(edgeHueRow, {
                    tooltip: tip(
                        'Hue shift applied to edge wear.',
                        'Typical: small (often 0).',
                        'Too much: colorful outlines on edges.'
                    )
                });
                edgeGroup.body.appendChild(edgeHueRow.row);

                const edgeValueRow = makeRangeRow('Value');
                edgeValueRow.range.min = '-1';
                edgeValueRow.range.max = '1';
                edgeValueRow.range.step = '0.01';
                edgeValueRow.number.min = '-1';
                edgeValueRow.number.max = '1';
                edgeValueRow.number.step = '0.01';
                edgeValueRow.range.value = String(wearSide?.value ?? 0.0);
                edgeValueRow.number.value = formatFloat(wearSide?.value ?? 0.0, 2);
                applyRangeRowMeta(edgeValueRow, {
                    tooltip: tip(
                        'Value/brightness shift applied to edge wear.',
                        'Typical: subtle brightening/darkening.',
                        'Too much: chalky edges or overly dark outlines.'
                    )
                });
                edgeGroup.body.appendChild(edgeValueRow.row);

                const edgeSaturationRow = makeRangeRow('Saturation');
                edgeSaturationRow.range.min = '-1';
                edgeSaturationRow.range.max = '1';
                edgeSaturationRow.range.step = '0.01';
                edgeSaturationRow.number.min = '-1';
                edgeSaturationRow.number.max = '1';
                edgeSaturationRow.number.step = '0.01';
                edgeSaturationRow.range.value = String(wearSide?.saturation ?? 0.0);
                edgeSaturationRow.number.value = formatFloat(wearSide?.saturation ?? 0.0, 2);
                applyRangeRowMeta(edgeSaturationRow, {
                    tooltip: tip(
                        'Saturation shift applied to edge wear.',
                        'Typical: small negative saturation for dusty edges.',
                        'Too much: colored/painterly edges.'
                    )
                });
                edgeGroup.body.appendChild(edgeSaturationRow.row);

                const edgeRoughnessRow = makeRangeRow('Roughness');
                edgeRoughnessRow.range.min = '-1';
                edgeRoughnessRow.range.max = '1';
                edgeRoughnessRow.range.step = '0.01';
                edgeRoughnessRow.number.min = '-1';
                edgeRoughnessRow.number.max = '1';
                edgeRoughnessRow.number.step = '0.01';
                edgeRoughnessRow.range.value = String(wearSide?.roughness ?? 0.0);
                edgeRoughnessRow.number.value = formatFloat(wearSide?.roughness ?? 0.0, 2);
                applyRangeRowMeta(edgeRoughnessRow, {
                    tooltip: tip(
                        'Roughness shift applied to edge wear.',
                        'Typical: slightly rougher for exposed edges.',
                        'Too much: noisy specular along edges.'
                    )
                });
                edgeGroup.body.appendChild(edgeRoughnessRow.row);

                const edgeNormalRow = makeRangeRow('Normal');
                edgeNormalRow.range.min = '-1';
                edgeNormalRow.range.max = '1';
                edgeNormalRow.range.step = '0.01';
                edgeNormalRow.number.min = '-1';
                edgeNormalRow.number.max = '1';
                edgeNormalRow.number.step = '0.01';
                edgeNormalRow.range.value = String(wearSide?.normal ?? 0.0);
                edgeNormalRow.number.value = formatFloat(wearSide?.normal ?? 0.0, 2);
                applyRangeRowMeta(edgeNormalRow, {
                    tooltip: tip(
                        'Normal shift applied to edge wear.',
                        'Typical: 0.',
                        'Too much: bumpy edge artifacts.'
                    )
                });
                edgeGroup.body.appendChild(edgeNormalRow.row);
                wallMatVarWeatherGroup.body.appendChild(edgeGroup.details);

                const wearBottom = wallMatVarNormalized.wearBottom ?? null;
                const grimeGroup = makeDetailsSection('Bottom wear', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:wearBottom` });
                applyTooltip(
                    grimeGroup.label,
                    tip(
                        'Ground grime band near the bottom of the wall.',
                        'Great for subtle splashback and dirt accumulation.',
                        'Too much: the whole wall looks uniformly dirty.'
                    )
                );
                const grimeToggle = makeToggleRow('Enable bottom wear');
                grimeToggle.input.checked = !!wearBottom?.enabled;
                grimeToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                applyToggleRowMeta(grimeToggle, {
                    mustHave: true,
                    tooltip: tip(
                        'Enables bottom wear/grime.',
                        'Typical: enable with low Strength + narrow Width.',
                        'Too much: a thick dirty band that dominates the facade.'
                    )
                });
                grimeGroup.body.appendChild(grimeToggle.toggle);
                const grimeStrengthRow = makeRangeRow('Strength');
                grimeStrengthRow.range.min = '0';
                grimeStrengthRow.range.max = '2';
                grimeStrengthRow.range.step = '0.01';
                grimeStrengthRow.number.min = '0';
                grimeStrengthRow.number.max = '2';
                grimeStrengthRow.number.step = '0.01';
                grimeStrengthRow.range.value = String(wearBottom?.intensity ?? 0.0);
                grimeStrengthRow.number.value = formatFloat(wearBottom?.intensity ?? 0.0, 2);
                applyRangeRowMeta(grimeStrengthRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Strength of bottom grime.',
                        'Typical: 0.05–0.30.',
                        'Too much: looks like a painted dark band.'
                    )
                });
                grimeGroup.body.appendChild(grimeStrengthRow.row);

                const grimeWidthRow = makeRangeRow('Width');
                grimeWidthRow.range.min = '0';
                grimeWidthRow.range.max = '1';
                grimeWidthRow.range.step = '0.01';
                grimeWidthRow.number.min = '0';
                grimeWidthRow.number.max = '1';
                grimeWidthRow.number.step = '0.01';
                grimeWidthRow.range.value = String(wearBottom?.width ?? 0.5);
                grimeWidthRow.number.value = formatFloat(wearBottom?.width ?? 0.5, 2);
                applyRangeRowMeta(grimeWidthRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Height of the bottom grime band (0–1 relative).',
                        'Typical: 0.10–0.40.',
                        'Too much: grime climbs too high and looks unrealistic.'
                    )
                });
                grimeGroup.body.appendChild(grimeWidthRow.row);

                const grimeScaleRow = makeRangeRow('Scale');
                grimeScaleRow.range.min = '0.01';
                grimeScaleRow.range.max = '20';
                grimeScaleRow.range.step = '0.01';
                grimeScaleRow.number.min = '0.01';
                grimeScaleRow.number.max = '20';
                grimeScaleRow.number.step = '0.01';
                grimeScaleRow.range.value = String(wearBottom?.scale ?? 1.0);
                grimeScaleRow.number.value = formatFloat(wearBottom?.scale ?? 1.0, 2);
                applyRangeRowMeta(grimeScaleRow, {
                    tooltip: tip(
                        'Noise scale for breaking up the grime band.',
                        'Typical: 0.5–2.0.',
                        'Too much: noisy, speckled dirt.'
                    )
                });
                grimeGroup.body.appendChild(grimeScaleRow.row);

                const grimeHueRow = makeRangeRow('Hue shift (deg)');
                grimeHueRow.range.min = '-180';
                grimeHueRow.range.max = '180';
                grimeHueRow.range.step = '1';
                grimeHueRow.number.min = '-180';
                grimeHueRow.number.max = '180';
                grimeHueRow.number.step = '1';
                grimeHueRow.range.value = String(wearBottom?.hueDegrees ?? 0.0);
                grimeHueRow.number.value = String(Math.round(wearBottom?.hueDegrees ?? 0.0));
                applyRangeRowMeta(grimeHueRow, {
                    tooltip: tip(
                        'Hue shift applied to bottom grime.',
                        'Typical: subtle (often 0).',
                        'Too much: colored dirt band.'
                    )
                });
                grimeGroup.body.appendChild(grimeHueRow.row);

                const grimeValueRow = makeRangeRow('Value');
                grimeValueRow.range.min = '-1';
                grimeValueRow.range.max = '1';
                grimeValueRow.range.step = '0.01';
                grimeValueRow.number.min = '-1';
                grimeValueRow.number.max = '1';
                grimeValueRow.number.step = '0.01';
                grimeValueRow.range.value = String(wearBottom?.value ?? 0.0);
                grimeValueRow.number.value = formatFloat(wearBottom?.value ?? 0.0, 2);
                applyRangeRowMeta(grimeValueRow, {
                    tooltip: tip(
                        'Value/brightness shift applied to bottom grime.',
                        'Typical: slightly darker for dirt.',
                        'Too much: heavy black band.'
                    )
                });
                grimeGroup.body.appendChild(grimeValueRow.row);

                const grimeSaturationRow = makeRangeRow('Saturation');
                grimeSaturationRow.range.min = '-1';
                grimeSaturationRow.range.max = '1';
                grimeSaturationRow.range.step = '0.01';
                grimeSaturationRow.number.min = '-1';
                grimeSaturationRow.number.max = '1';
                grimeSaturationRow.number.step = '0.01';
                grimeSaturationRow.range.value = String(wearBottom?.saturation ?? 0.0);
                grimeSaturationRow.number.value = formatFloat(wearBottom?.saturation ?? 0.0, 2);
                applyRangeRowMeta(grimeSaturationRow, {
                    tooltip: tip(
                        'Saturation shift applied to bottom grime.',
                        'Typical: small negative saturation for dirt.',
                        'Too much: unnatural colored dirt.'
                    )
                });
                grimeGroup.body.appendChild(grimeSaturationRow.row);

                const grimeRoughnessRow = makeRangeRow('Roughness');
                    grimeRoughnessRow.range.min = '-1';
                    grimeRoughnessRow.range.max = '1';
                    grimeRoughnessRow.range.step = '0.01';
                    grimeRoughnessRow.number.min = '-1';
                    grimeRoughnessRow.number.max = '1';
                    grimeRoughnessRow.number.step = '0.01';
                    grimeRoughnessRow.range.value = String(wearBottom?.roughness ?? 0.0);
                    grimeRoughnessRow.number.value = formatFloat(wearBottom?.roughness ?? 0.0, 2);
                    applyRangeRowMeta(grimeRoughnessRow, {
                    tooltip: tip(
                        'Roughness shift applied to bottom grime.',
                        'Typical: slightly rougher.',
                        'Too much: noisy or chalky specular response.'
                    )
                });
                grimeGroup.body.appendChild(grimeRoughnessRow.row);

                const grimeNormalRow = makeRangeRow('Normal');
                grimeNormalRow.range.min = '-1';
                grimeNormalRow.range.max = '1';
                grimeNormalRow.range.step = '0.01';
                grimeNormalRow.number.min = '-1';
                grimeNormalRow.number.max = '1';
                grimeNormalRow.number.step = '0.01';
                grimeNormalRow.range.value = String(wearBottom?.normal ?? 0.0);
                grimeNormalRow.number.value = formatFloat(wearBottom?.normal ?? 0.0, 2);
                applyRangeRowMeta(grimeNormalRow, {
                    tooltip: tip(
                        'Normal shift applied to bottom grime.',
                        'Typical: 0.',
                        'Too much: bumpy artifacts in the grime band.'
                    )
                });
                grimeGroup.body.appendChild(grimeNormalRow.row);
                wallMatVarWeatherGroup.body.appendChild(grimeGroup.details);

                const wearTop = wallMatVarNormalized.wearTop ?? null;
                const dustGroup = makeDetailsSection('Top wear', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:wearTop` });
                applyTooltip(
                    dustGroup.label,
                    tip(
                        'Top deposits and wear near the roofline/top of the wall.',
                        'Good for subtle dust/soot accumulation and sun-faded areas.',
                        'Too much: the whole wall top looks painted.'
                    )
                );
                const dustToggle = makeToggleRow('Enable top wear');
                dustToggle.input.checked = !!wearTop?.enabled;
                dustToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                applyToggleRowMeta(dustToggle, {
                    mustHave: true,
                    tooltip: tip(
                        'Enables top wear/deposits.',
                        'Typical: enable with low Strength + moderate Width.',
                        'Too much: a thick band that dominates the facade.'
                    )
                });
                dustGroup.body.appendChild(dustToggle.toggle);
                const dustStrengthRow = makeRangeRow('Strength');
                dustStrengthRow.range.min = '0';
                dustStrengthRow.range.max = '2';
                dustStrengthRow.range.step = '0.01';
                dustStrengthRow.number.min = '0';
                dustStrengthRow.number.max = '2';
                dustStrengthRow.number.step = '0.01';
                dustStrengthRow.range.value = String(wearTop?.intensity ?? 0.0);
                dustStrengthRow.number.value = formatFloat(wearTop?.intensity ?? 0.0, 2);
                applyRangeRowMeta(dustStrengthRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Strength of top wear/deposits.',
                        'Typical: 0.05–0.25.',
                        'Too much: looks like painted grime on the top.'
                    )
                });
                dustGroup.body.appendChild(dustStrengthRow.row);

                const dustWidthRow = makeRangeRow('Width');
                dustWidthRow.range.min = '0';
                dustWidthRow.range.max = '1';
                dustWidthRow.range.step = '0.01';
                dustWidthRow.number.min = '0';
                dustWidthRow.number.max = '1';
                dustWidthRow.number.step = '0.01';
                dustWidthRow.range.value = String(wearTop?.width ?? 0.4);
                dustWidthRow.number.value = formatFloat(wearTop?.width ?? 0.4, 2);
                applyRangeRowMeta(dustWidthRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Height of the top wear band (0–1 relative).',
                        'Typical: 0.10–0.45.',
                        'Too much: top wear covers most of the wall.'
                    )
                });
                dustGroup.body.appendChild(dustWidthRow.row);

                const dustScaleRow = makeRangeRow('Scale');
                dustScaleRow.range.min = '0.01';
                dustScaleRow.range.max = '20';
                dustScaleRow.range.step = '0.01';
                dustScaleRow.number.min = '0.01';
                dustScaleRow.number.max = '20';
                dustScaleRow.number.step = '0.01';
                dustScaleRow.range.value = String(wearTop?.scale ?? 1.0);
                dustScaleRow.number.value = formatFloat(wearTop?.scale ?? 1.0, 2);
                applyRangeRowMeta(dustScaleRow, {
                    tooltip: tip(
                        'Noise scale for breaking up the top band.',
                        'Typical: 0.5–2.0.',
                        'Too much: noisy speckling.'
                    )
                });
                dustGroup.body.appendChild(dustScaleRow.row);

                const dustHueRow = makeRangeRow('Hue shift (deg)');
                dustHueRow.range.min = '-180';
                dustHueRow.range.max = '180';
                dustHueRow.range.step = '1';
                dustHueRow.number.min = '-180';
                dustHueRow.number.max = '180';
                dustHueRow.number.step = '1';
                dustHueRow.range.value = String(wearTop?.hueDegrees ?? 0.0);
                dustHueRow.number.value = String(Math.round(wearTop?.hueDegrees ?? 0.0));
                applyRangeRowMeta(dustHueRow, {
                    tooltip: tip(
                        'Hue shift applied to top wear.',
                        'Typical: subtle.',
                        'Too much: colored/painterly top band.'
                    )
                });
                dustGroup.body.appendChild(dustHueRow.row);

                const dustValueRow = makeRangeRow('Value');
                dustValueRow.range.min = '-1';
                dustValueRow.range.max = '1';
                dustValueRow.range.step = '0.01';
                dustValueRow.number.min = '-1';
                dustValueRow.number.max = '1';
                dustValueRow.number.step = '0.01';
                dustValueRow.range.value = String(wearTop?.value ?? 0.0);
                dustValueRow.number.value = formatFloat(wearTop?.value ?? 0.0, 2);
                applyRangeRowMeta(dustValueRow, {
                    tooltip: tip(
                        'Value/brightness shift applied to top wear.',
                        'Typical: small brightening for dust or darkening for soot.',
                        'Too much: harsh contrast at the top.'
                    )
                });
                dustGroup.body.appendChild(dustValueRow.row);

                const dustSaturationRow = makeRangeRow('Saturation');
                dustSaturationRow.range.min = '-1';
                dustSaturationRow.range.max = '1';
                dustSaturationRow.range.step = '0.01';
                dustSaturationRow.number.min = '-1';
                dustSaturationRow.number.max = '1';
                dustSaturationRow.number.step = '0.01';
                dustSaturationRow.range.value = String(wearTop?.saturation ?? 0.0);
                dustSaturationRow.number.value = formatFloat(wearTop?.saturation ?? 0.0, 2);
                applyRangeRowMeta(dustSaturationRow, {
                    tooltip: tip(
                        'Saturation shift applied to top wear.',
                        'Typical: slightly desaturated for dust/soot.',
                        'Too much: colored/painterly top band.'
                    )
                });
                dustGroup.body.appendChild(dustSaturationRow.row);

                const dustRoughnessRow = makeRangeRow('Roughness');
                dustRoughnessRow.range.min = '-1';
                dustRoughnessRow.range.max = '1';
                dustRoughnessRow.range.step = '0.01';
                dustRoughnessRow.number.min = '-1';
                dustRoughnessRow.number.max = '1';
                dustRoughnessRow.number.step = '0.01';
                dustRoughnessRow.range.value = String(wearTop?.roughness ?? 0.0);
                dustRoughnessRow.number.value = formatFloat(wearTop?.roughness ?? 0.0, 2);
                applyRangeRowMeta(dustRoughnessRow, {
                    tooltip: tip(
                        'Roughness shift applied to top wear.',
                        'Typical: slightly rougher for dusty deposits.',
                        'Too much: sparkly/noisy specular response.'
                    )
                });
                dustGroup.body.appendChild(dustRoughnessRow.row);

                const dustNormalRow = makeRangeRow('Normal');
                dustNormalRow.range.min = '-1';
                dustNormalRow.range.max = '1';
                dustNormalRow.range.step = '0.01';
                dustNormalRow.number.min = '-1';
                dustNormalRow.number.max = '1';
                dustNormalRow.number.step = '0.01';
                dustNormalRow.range.value = String(wearTop?.normal ?? 0.0);
                dustNormalRow.number.value = formatFloat(wearTop?.normal ?? 0.0, 2);
                applyRangeRowMeta(dustNormalRow, {
                    tooltip: tip(
                        'Normal shift applied to top wear.',
                        'Typical: 0.',
                        'Too much: bumpy artifacts in the top band.'
                    )
                });
                dustGroup.body.appendChild(dustNormalRow.row);
                wallMatVarWeatherGroup.body.appendChild(dustGroup.details);

                const antiController = createMaterialVariationAntiTilingMiniController({
                    allow,
                    detailsOpenByKey: this._detailsOpenByKey,
                    detailsKey: `${scopeKey}:layer:${layerId}:walls:matvar:anti`,
                    parentEnabled: !!layer.materialVariation.enabled,
                    normalizedAntiTiling: wallMatVarNormalized.antiTiling,
                    targetMaterialVariation: layer.materialVariation,
                    labels: { offsetU: 'Horizontal shift', offsetV: 'Vertical shift' },
                    tooltips: {
                        group: tip(
                            'Breaks up visible texture tiling by offset/rotation per cell.',
                            'Use when you can see repeating patterns.',
                            'Too much: UV distortion and “swimming” details.'
                        ),
                        enable: tip(
                            'Enables anti-tiling UV variation.',
                            'Typical: enable for materials that obviously repeat.',
                            'Too much: distortion that looks like warping.'
                        ),
                        strength: tip(
                            'How strong the anti-tiling UV shift/rotation is.',
                            'Typical: 0.3–0.9.',
                            'Too much: obvious distortion and blurred details.'
                        ),
                        cellSize: tip(
                            'Size of the anti-tiling cells in tile units.',
                            'Typical: 1–4.',
                            'Too much: very small sizes become noisy; very large sizes repeat again.'
                        ),
                        blendWidth: tip(
                            'Softness of transitions between anti-tiling cells.',
                            'Typical: 0.10–0.30.',
                            'Too much: blurry blending; too little: visible seams.'
                        ),
                        offsetV: tip(
                            'Per-cell vertical (V) UV jitter amount.',
                            'Typical: small values.',
                            'Too much: texture features misalign noticeably.'
                        ),
                        offsetU: tip(
                            'Per-cell horizontal (U) UV jitter amount.',
                            'Typical: small values.',
                            'Too much: texture features misalign noticeably.'
                        ),
                        rotation: tip(
                            'Per-cell UV rotation amount.',
                            'Typical: 5–25° for subtle breakup.',
                            'Too much: rotated details look obviously wrong.'
                        ),
                        quality: tip(
                            'Uses a higher-quality anti-tiling blend (slower).',
                            'Typical: off unless you see seams/artifacts.',
                            'Too much: unnecessary cost when not needed.'
                        )
                    },
                    onChange: () => this._notifySelectedLayersChanged()
                });
                antiController.mount(wallMatVarGroup.body, { before: wallMatVarMacroGroup.details });
                this._layerMiniControllers.push(antiController);

	                const brickCfg = wallMatVarNormalized.brick ?? null;
	                const brickLayoutGroup = makeDetailsSection('Brick layout', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:brickLayout` });
	                applyTooltip(
	                    brickLayoutGroup.label,
	                    tip(
	                        'Brick grid layout used by brick/mortar strategies.',
	                        'Set bricks per tile to match your base texture.',
	                        'Too much: wrong values make mortar lines drift.'
	                    )
	                );

	                const bricksPerTileXRow = makeRangeRow('Bricks per tile X');
	                bricksPerTileXRow.range.min = '0.25';
	                bricksPerTileXRow.range.max = '200';
	                bricksPerTileXRow.range.step = '0.25';
	                bricksPerTileXRow.number.min = '0.25';
	                bricksPerTileXRow.number.max = '200';
	                bricksPerTileXRow.number.step = '0.25';
	                bricksPerTileXRow.range.value = String(brickCfg?.bricksPerTileX ?? 6.0);
	                bricksPerTileXRow.number.value = formatFloat(brickCfg?.bricksPerTileX ?? 6.0, 2);
	                applyRangeRowMeta(bricksPerTileXRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Brick count across one UV tile (U/X).',
	                        'Typical: 5–10 depending on texture.',
	                        'Too much: very high values become noisy.'
	                    )
	                });
	                brickLayoutGroup.body.appendChild(bricksPerTileXRow.row);

	                const bricksPerTileYRow = makeRangeRow('Bricks per tile Y');
	                bricksPerTileYRow.range.min = '0.25';
	                bricksPerTileYRow.range.max = '200';
	                bricksPerTileYRow.range.step = '0.25';
	                bricksPerTileYRow.number.min = '0.25';
	                bricksPerTileYRow.number.max = '200';
	                bricksPerTileYRow.number.step = '0.25';
	                bricksPerTileYRow.range.value = String(brickCfg?.bricksPerTileY ?? 3.0);
	                bricksPerTileYRow.number.value = formatFloat(brickCfg?.bricksPerTileY ?? 3.0, 2);
	                applyRangeRowMeta(bricksPerTileYRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Brick count across one UV tile (V/Y).',
	                        'Typical: 2–6 depending on texture.',
	                        'Too much: wrong values misalign the grid.'
	                    )
	                });
	                brickLayoutGroup.body.appendChild(bricksPerTileYRow.row);

	                const mortarWidthRow = makeRangeRow('Mortar width');
	                mortarWidthRow.range.min = '0';
	                mortarWidthRow.range.max = '0.49';
	                mortarWidthRow.range.step = '0.01';
	                mortarWidthRow.number.min = '0';
	                mortarWidthRow.number.max = '0.49';
	                mortarWidthRow.number.step = '0.01';
	                mortarWidthRow.range.value = String(brickCfg?.mortarWidth ?? 0.08);
	                mortarWidthRow.number.value = formatFloat(brickCfg?.mortarWidth ?? 0.08, 2);
	                applyRangeRowMeta(mortarWidthRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Thickness of mortar lines (as a fraction of a brick cell).',
	                        'Typical: 0.04–0.12.',
	                        'Too much: mortar dominates and bricks disappear.'
	                    )
	                });
	                brickLayoutGroup.body.appendChild(mortarWidthRow.row);

	                const brickOffsetXRow = makeRangeRow('Layout offset X (cells)');
	                brickOffsetXRow.range.min = '-10';
	                brickOffsetXRow.range.max = '10';
	                brickOffsetXRow.range.step = '0.01';
	                brickOffsetXRow.number.min = '-10';
	                brickOffsetXRow.number.max = '10';
	                brickOffsetXRow.number.step = '0.01';
	                brickOffsetXRow.range.value = String(brickCfg?.offsetX ?? 0.0);
	                brickOffsetXRow.number.value = formatFloat(brickCfg?.offsetX ?? 0.0, 2);
	                applyRangeRowMeta(brickOffsetXRow, {
	                    tooltip: tip(
	                        'Shifts the brick grid horizontally for this section (in brick cell units).',
	                        'Use small values (0–1) to de-sync sections without changing brick scale.',
	                        '0 keeps the original alignment.'
	                    )
	                });
	                brickLayoutGroup.body.appendChild(brickOffsetXRow.row);

	                const brickOffsetYRow = makeRangeRow('Layout offset Y (cells)');
	                brickOffsetYRow.range.min = '-10';
	                brickOffsetYRow.range.max = '10';
	                brickOffsetYRow.range.step = '0.01';
	                brickOffsetYRow.number.min = '-10';
	                brickOffsetYRow.number.max = '10';
	                brickOffsetYRow.number.step = '0.01';
	                brickOffsetYRow.range.value = String(brickCfg?.offsetY ?? 0.0);
	                brickOffsetYRow.number.value = formatFloat(brickCfg?.offsetY ?? 0.0, 2);
	                applyRangeRowMeta(brickOffsetYRow, {
	                    tooltip: tip(
	                        'Shifts the brick grid vertically for this section (in brick cell units).',
	                        'Use small values (0–1) to de-sync sections without changing brick scale.',
	                        '0 keeps the original alignment.'
	                    )
	                });
	                brickLayoutGroup.body.appendChild(brickOffsetYRow.row);
	                wallMatVarBrickGroup.body.appendChild(brickLayoutGroup.details);

	                const stairGroup = makeDetailsSection('Stair shift', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:stair` });
	                applyTooltip(
	                    stairGroup.label,
	                    tip(
                        'Brick-style UV staggering / bond shifting.',
                        'Useful for brick/bonded patterns to reduce obvious repetition.',
                        'Too much: misaligned mortar/brick pattern.'
                    )
                );
                const stairToggle = makeToggleRow('Enable stair shift');
                stairToggle.input.checked = !!wallMatVarNormalized.stairShift.enabled;
                stairToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                applyToggleRowMeta(stairToggle, {
                    mustHave: true,
                    tooltip: tip(
                        'Enables per-row/step UV shifting.',
                        'Typical: enable for brick-like walls.',
                        'Too much: makes the pattern look broken.'
                    )
                });
                stairGroup.body.appendChild(stairToggle.toggle);

                const stairStrengthRow = makeRangeRow('Strength');
                stairStrengthRow.range.min = '0';
                stairStrengthRow.range.max = '1';
                stairStrengthRow.range.step = '0.01';
                stairStrengthRow.number.min = '0';
                stairStrengthRow.number.max = '1';
                stairStrengthRow.number.step = '0.01';
                stairStrengthRow.range.value = String(wallMatVarNormalized.stairShift.strength);
                stairStrengthRow.number.value = formatFloat(wallMatVarNormalized.stairShift.strength, 2);
                applyRangeRowMeta(stairStrengthRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Strength of the stair shift effect.',
                        'Typical: 0.2–1.0 for subtle staggering.',
                        'Too much: severe pattern discontinuities.'
                    )
                });
                stairGroup.body.appendChild(stairStrengthRow.row);

                const stairStepRow = makeRangeRow('Step size (tiles)');
                stairStepRow.range.min = '0.01';
                stairStepRow.range.max = '20';
                stairStepRow.range.step = '0.01';
                stairStepRow.number.min = '0.01';
                stairStepRow.number.max = '20';
                stairStepRow.number.step = '0.01';
                stairStepRow.range.value = String(wallMatVarNormalized.stairShift.stepSize);
                stairStepRow.number.value = formatFloat(wallMatVarNormalized.stairShift.stepSize, 2);
                applyRangeRowMeta(stairStepRow, {
                    tooltip: tip(
                        'How often the shift increments (in tile units).',
                        'Typical: 1 for per-row staggering.',
                        'Too much: large values make the shift rare and less useful.'
                    )
                });
                stairGroup.body.appendChild(stairStepRow.row);

                const stairShiftRow = makeRangeRow('Shift per step');
                stairShiftRow.range.min = '-1';
                stairShiftRow.range.max = '1';
                stairShiftRow.range.step = '0.01';
                stairShiftRow.number.min = '-1';
                stairShiftRow.number.max = '1';
                stairShiftRow.number.step = '0.01';
                stairShiftRow.range.value = String(wallMatVarNormalized.stairShift.shift);
                stairShiftRow.number.value = formatFloat(wallMatVarNormalized.stairShift.shift, 2);
                applyRangeRowMeta(stairShiftRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Shift amount applied per step (in UV tile units).',
                        'Typical brick bond: small offsets like 0.4 / 0.8 patterns.',
                        'Too much: bricks/mortar stop lining up.'
                    )
                });
                stairGroup.body.appendChild(stairShiftRow.row);

                const stairModeRow = document.createElement('div');
                stairModeRow.className = 'building-fab-row building-fab-row-wide';
                const stairModeLabel = document.createElement('div');
                stairModeLabel.className = 'building-fab-row-label';
                stairModeLabel.textContent = 'Mode';
	                const stairModeSelect = document.createElement('select');
	                stairModeSelect.className = 'building-fab-select';
	                for (const v of ['stair', 'alternate', 'random', 'pattern3']) {
	                    const opt = document.createElement('option');
	                    opt.value = v;
	                    opt.textContent =
	                        v === 'random'
	                            ? 'Random (per step)'
	                            : (v === 'alternate'
	                                ? 'Alternate (0 / shift)'
	                                : (v === 'pattern3' ? 'Bond 3-step (0 / A / B)' : 'Stair (shift += stepIndex)'));
	                    stairModeSelect.appendChild(opt);
	                }
	                stairModeSelect.value = wallMatVarNormalized.stairShift.mode || 'stair';
                applySelectRowMeta(
                    { label: stairModeLabel, select: stairModeSelect },
                    {
	                        tooltip: tip(
	                            'How the shift evolves per step.',
	                            'Typical: Stair/Alternate for simple bonds, Bond 3-step for 0/A/B patterns, Random for noise.',
	                            'Too much: Random can look chaotic for brick bonds.'
	                        )
	                    }
	                );
	                stairModeRow.appendChild(stairModeLabel);
	                stairModeRow.appendChild(stairModeSelect);
	                stairGroup.body.appendChild(stairModeRow);

	                const stairPatternARow = makeRangeRow('Pattern A');
	                stairPatternARow.range.min = '-1';
	                stairPatternARow.range.max = '1';
	                stairPatternARow.range.step = '0.01';
	                stairPatternARow.number.min = '-1';
	                stairPatternARow.number.max = '1';
	                stairPatternARow.number.step = '0.01';
	                stairPatternARow.range.value = String(wallMatVarNormalized.stairShift.patternA ?? 0.4);
	                stairPatternARow.number.value = formatFloat(wallMatVarNormalized.stairShift.patternA ?? 0.4, 2);
	                applyRangeRowMeta(stairPatternARow, {
	                    tooltip: tip(
	                        'Multiplier used for the 2nd step when Mode is Bond 3-step.',
	                        'Typical: 0.4.',
	                        'Too much: bricks stop lining up.'
	                    )
	                });
	                stairGroup.body.appendChild(stairPatternARow.row);

	                const stairPatternBRow = makeRangeRow('Pattern B');
	                stairPatternBRow.range.min = '-1';
	                stairPatternBRow.range.max = '1';
	                stairPatternBRow.range.step = '0.01';
	                stairPatternBRow.number.min = '-1';
	                stairPatternBRow.number.max = '1';
	                stairPatternBRow.number.step = '0.01';
	                stairPatternBRow.range.value = String(wallMatVarNormalized.stairShift.patternB ?? 0.8);
	                stairPatternBRow.number.value = formatFloat(wallMatVarNormalized.stairShift.patternB ?? 0.8, 2);
	                applyRangeRowMeta(stairPatternBRow, {
	                    tooltip: tip(
	                        'Multiplier used for the 3rd step when Mode is Bond 3-step.',
	                        'Typical: 0.8.',
	                        'Too much: bricks stop lining up.'
	                    )
	                });
	                stairGroup.body.appendChild(stairPatternBRow.row);

	                const stairBlendRow = makeRangeRow('Blend width');
	                stairBlendRow.range.min = '0';
                stairBlendRow.range.max = '0.49';
                stairBlendRow.range.step = '0.01';
                stairBlendRow.number.min = '0';
                stairBlendRow.number.max = '0.49';
                stairBlendRow.number.step = '0.01';
                stairBlendRow.range.value = String(wallMatVarNormalized.stairShift.blendWidth ?? 0.0);
                stairBlendRow.number.value = formatFloat(wallMatVarNormalized.stairShift.blendWidth ?? 0.0, 2);
                applyRangeRowMeta(stairBlendRow, {
                    tooltip: tip(
                        'Softness of blending between steps.',
                        'Typical: 0–0.2.',
                        'Too much: blurs the bond pattern.'
                    )
                });
                stairGroup.body.appendChild(stairBlendRow.row);

                const stairDirRow = document.createElement('div');
                stairDirRow.className = 'building-fab-row building-fab-row-wide';
                const stairDirLabel = document.createElement('div');
                stairDirLabel.className = 'building-fab-row-label';
                stairDirLabel.textContent = 'Direction';
                const stairDirSelect = document.createElement('select');
                stairDirSelect.className = 'building-fab-select';
                for (const v of ['horizontal', 'vertical']) {
                    const opt = document.createElement('option');
                    opt.value = v;
                    opt.textContent = v === 'vertical' ? 'Vertical (shift V per U step)' : 'Horizontal (shift U per V step)';
                    stairDirSelect.appendChild(opt);
                }
                stairDirSelect.value = wallMatVarNormalized.stairShift.direction;
                applySelectRowMeta(
                    { label: stairDirLabel, select: stairDirSelect },
                    {
                        tooltip: tip(
                            'Which axis is shifted per step.',
                            'Typical: Horizontal for brick rows.',
                            'Too much: wrong direction makes the pattern feel off.'
                        )
                    }
                );
	                stairDirRow.appendChild(stairDirLabel);
	                stairDirRow.appendChild(stairDirSelect);
	                stairGroup.body.appendChild(stairDirRow);
	
	                wallMatVarBrickGroup.body.appendChild(stairGroup.details);

	                const perBrick = brickCfg?.perBrick ?? null;
	                const perBrickGroup = makeDetailsSection('Per-brick variation', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:perBrick` });
	                applyTooltip(
	                    perBrickGroup.label,
	                    tip(
	                        'Subtle per-brick breakup (hue/value/roughness per brick).',
	                        'Use low Strength and keep shifts small.',
	                        'Too much: noisy, speckled brickwork.'
	                    )
	                );
	                const perBrickToggle = makeToggleRow('Enable per-brick variation');
	                perBrickToggle.input.checked = !!perBrick?.enabled;
	                perBrickToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
	                applyToggleRowMeta(perBrickToggle, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Enables per-brick variation.',
	                        'Typical: enabled for brick materials, low strength.',
	                        'Too much: bricks look randomly colored.'
	                    )
	                });
	                perBrickGroup.body.appendChild(perBrickToggle.toggle);

	                const perBrickStrengthRow = makeRangeRow('Strength');
	                perBrickStrengthRow.range.min = '0';
	                perBrickStrengthRow.range.max = '2';
	                perBrickStrengthRow.range.step = '0.01';
	                perBrickStrengthRow.number.min = '0';
	                perBrickStrengthRow.number.max = '2';
	                perBrickStrengthRow.number.step = '0.01';
	                perBrickStrengthRow.range.value = String(perBrick?.intensity ?? 0.0);
	                perBrickStrengthRow.number.value = formatFloat(perBrick?.intensity ?? 0.0, 2);
	                applyRangeRowMeta(perBrickStrengthRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Overall strength of per-brick variation.',
	                        'Typical: 0.05–0.40.',
	                        'Too much: noisy speckled bricks.'
	                    )
	                });
	                perBrickGroup.body.appendChild(perBrickStrengthRow.row);

	                const perBrickHueRow = makeRangeRow('Hue shift (deg)');
	                perBrickHueRow.range.min = '-180';
	                perBrickHueRow.range.max = '180';
	                perBrickHueRow.range.step = '1';
	                perBrickHueRow.number.min = '-180';
	                perBrickHueRow.number.max = '180';
	                perBrickHueRow.number.step = '1';
	                perBrickHueRow.range.value = String(perBrick?.hueDegrees ?? 0.0);
	                perBrickHueRow.number.value = String(Math.round(perBrick?.hueDegrees ?? 0.0));
	                applyRangeRowMeta(perBrickHueRow, {
	                    tooltip: tip(
	                        'Hue drift per brick.',
	                        'Typical: ±5–20°.',
	                        'Too much: rainbow bricks.'
	                    )
	                });
	                perBrickGroup.body.appendChild(perBrickHueRow.row);

	                const perBrickValueRow = makeRangeRow('Value');
	                perBrickValueRow.range.min = '-1';
	                perBrickValueRow.range.max = '1';
	                perBrickValueRow.range.step = '0.01';
	                perBrickValueRow.number.min = '-1';
	                perBrickValueRow.number.max = '1';
	                perBrickValueRow.number.step = '0.01';
	                perBrickValueRow.range.value = String(perBrick?.value ?? 0.0);
	                perBrickValueRow.number.value = formatFloat(perBrick?.value ?? 0.0, 2);
	                applyRangeRowMeta(perBrickValueRow, {
	                    tooltip: tip(
	                        'Brightness variation per brick.',
	                        'Typical: small.',
	                        'Too much: patchy, noisy bricks.'
	                    )
	                });
	                perBrickGroup.body.appendChild(perBrickValueRow.row);

	                const perBrickSaturationRow = makeRangeRow('Saturation');
	                perBrickSaturationRow.range.min = '-1';
	                perBrickSaturationRow.range.max = '1';
	                perBrickSaturationRow.range.step = '0.01';
	                perBrickSaturationRow.number.min = '-1';
	                perBrickSaturationRow.number.max = '1';
	                perBrickSaturationRow.number.step = '0.01';
	                perBrickSaturationRow.range.value = String(perBrick?.saturation ?? 0.0);
	                perBrickSaturationRow.number.value = formatFloat(perBrick?.saturation ?? 0.0, 2);
	                applyRangeRowMeta(perBrickSaturationRow, {
	                    tooltip: tip(
	                        'Saturation variation per brick.',
	                        'Typical: small.',
	                        'Too much: colored brick noise.'
	                    )
	                });
	                perBrickGroup.body.appendChild(perBrickSaturationRow.row);

	                const perBrickRoughnessRow = makeRangeRow('Roughness');
	                perBrickRoughnessRow.range.min = '-1';
	                perBrickRoughnessRow.range.max = '1';
	                perBrickRoughnessRow.range.step = '0.01';
	                perBrickRoughnessRow.number.min = '-1';
	                perBrickRoughnessRow.number.max = '1';
	                perBrickRoughnessRow.number.step = '0.01';
	                perBrickRoughnessRow.range.value = String(perBrick?.roughness ?? 0.0);
	                perBrickRoughnessRow.number.value = formatFloat(perBrick?.roughness ?? 0.0, 2);
	                applyRangeRowMeta(perBrickRoughnessRow, {
	                    tooltip: tip(
	                        'Roughness variation per brick.',
	                        'Typical: subtle.',
	                        'Too much: sparkly/noisy highlights.'
	                    )
	                });
	                perBrickGroup.body.appendChild(perBrickRoughnessRow.row);

	                const perBrickNormalRow = makeRangeRow('Normal');
	                perBrickNormalRow.range.min = '-1';
	                perBrickNormalRow.range.max = '1';
	                perBrickNormalRow.range.step = '0.01';
	                perBrickNormalRow.number.min = '-1';
	                perBrickNormalRow.number.max = '1';
	                perBrickNormalRow.number.step = '0.01';
	                perBrickNormalRow.range.value = String(perBrick?.normal ?? 0.0);
	                perBrickNormalRow.number.value = formatFloat(perBrick?.normal ?? 0.0, 2);
	                applyRangeRowMeta(perBrickNormalRow, {
	                    tooltip: tip(
	                        'Optional normal response variation per brick.',
	                        'Typical: 0.',
	                        'Too much: bumpy noisy shading.'
	                    )
	                });
	                perBrickGroup.body.appendChild(perBrickNormalRow.row);
	                wallMatVarBrickGroup.body.appendChild(perBrickGroup.details);

	                const mortar = brickCfg?.mortar ?? null;
	                const mortarGroup = makeDetailsSection('Mortar variation', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:mortar` });
	                applyTooltip(
	                    mortarGroup.label,
	                    tip(
	                        'Separate-ish look for mortar lines (value/roughness shifts in mortar).',
	                        'Great for dusty mortar and grime-in-grooves.',
	                        'Too much: mortar becomes a grid overlay.'
	                    )
	                );
	                const mortarToggle = makeToggleRow('Enable mortar variation');
	                mortarToggle.input.checked = !!mortar?.enabled;
	                mortarToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
	                applyToggleRowMeta(mortarToggle, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Enables mortar-line variation.',
	                        'Typical: enabled for brick materials.',
	                        'Too much: mortar reads as dark/bright outlines everywhere.'
	                    )
	                });
	                mortarGroup.body.appendChild(mortarToggle.toggle);

	                const mortarStrengthRow = makeRangeRow('Strength');
	                mortarStrengthRow.range.min = '0';
	                mortarStrengthRow.range.max = '2';
	                mortarStrengthRow.range.step = '0.01';
	                mortarStrengthRow.number.min = '0';
	                mortarStrengthRow.number.max = '2';
	                mortarStrengthRow.number.step = '0.01';
	                mortarStrengthRow.range.value = String(mortar?.intensity ?? 0.0);
	                mortarStrengthRow.number.value = formatFloat(mortar?.intensity ?? 0.0, 2);
	                applyRangeRowMeta(mortarStrengthRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Overall strength of mortar variation.',
	                        'Typical: 0.05–0.50.',
	                        'Too much: mortar dominates the look.'
	                    )
	                });
	                mortarGroup.body.appendChild(mortarStrengthRow.row);

	                const mortarHueRow = makeRangeRow('Hue shift (deg)');
	                mortarHueRow.range.min = '-180';
	                mortarHueRow.range.max = '180';
	                mortarHueRow.range.step = '1';
	                mortarHueRow.number.min = '-180';
	                mortarHueRow.number.max = '180';
	                mortarHueRow.number.step = '1';
	                mortarHueRow.range.value = String(mortar?.hueDegrees ?? 0.0);
	                mortarHueRow.number.value = String(Math.round(mortar?.hueDegrees ?? 0.0));
	                applyRangeRowMeta(mortarHueRow, {
	                    tooltip: tip(
	                        'Hue shift in mortar lines.',
	                        'Typical: subtle.',
	                        'Too much: colored mortar grid.'
	                    )
	                });
	                mortarGroup.body.appendChild(mortarHueRow.row);

	                const mortarValueRow = makeRangeRow('Value');
	                mortarValueRow.range.min = '-1';
	                mortarValueRow.range.max = '1';
	                mortarValueRow.range.step = '0.01';
	                mortarValueRow.number.min = '-1';
	                mortarValueRow.number.max = '1';
	                mortarValueRow.number.step = '0.01';
	                mortarValueRow.range.value = String(mortar?.value ?? 0.0);
	                mortarValueRow.number.value = formatFloat(mortar?.value ?? 0.0, 2);
	                applyRangeRowMeta(mortarValueRow, {
	                    tooltip: tip(
	                        'Brightness shift in mortar lines.',
	                        'Typical: slightly darker or lighter.',
	                        'Too much: high-contrast grid.'
	                    )
	                });
	                mortarGroup.body.appendChild(mortarValueRow.row);

	                const mortarSaturationRow = makeRangeRow('Saturation');
	                mortarSaturationRow.range.min = '-1';
	                mortarSaturationRow.range.max = '1';
	                mortarSaturationRow.range.step = '0.01';
	                mortarSaturationRow.number.min = '-1';
	                mortarSaturationRow.number.max = '1';
	                mortarSaturationRow.number.step = '0.01';
	                mortarSaturationRow.range.value = String(mortar?.saturation ?? 0.0);
	                mortarSaturationRow.number.value = formatFloat(mortar?.saturation ?? 0.0, 2);
	                applyRangeRowMeta(mortarSaturationRow, {
	                    tooltip: tip(
	                        'Saturation shift in mortar lines.',
	                        'Typical: slight desaturation.',
	                        'Too much: colored outlines.'
	                    )
	                });
	                mortarGroup.body.appendChild(mortarSaturationRow.row);

	                const mortarRoughnessRow = makeRangeRow('Roughness');
	                mortarRoughnessRow.range.min = '-1';
	                mortarRoughnessRow.range.max = '1';
	                mortarRoughnessRow.range.step = '0.01';
	                mortarRoughnessRow.number.min = '-1';
	                mortarRoughnessRow.number.max = '1';
	                mortarRoughnessRow.number.step = '0.01';
	                mortarRoughnessRow.range.value = String(mortar?.roughness ?? 0.0);
	                mortarRoughnessRow.number.value = formatFloat(mortar?.roughness ?? 0.0, 2);
	                applyRangeRowMeta(mortarRoughnessRow, {
	                    tooltip: tip(
	                        'Roughness shift in mortar lines.',
	                        'Typical: slightly rougher.',
	                        'Too much: noisy highlights in a grid.'
	                    )
	                });
	                mortarGroup.body.appendChild(mortarRoughnessRow.row);

	                const mortarNormalRow = makeRangeRow('Normal');
	                mortarNormalRow.range.min = '-1';
	                mortarNormalRow.range.max = '1';
	                mortarNormalRow.range.step = '0.01';
	                mortarNormalRow.number.min = '-1';
	                mortarNormalRow.number.max = '1';
	                mortarNormalRow.number.step = '0.01';
	                mortarNormalRow.range.value = String(mortar?.normal ?? 0.0);
	                mortarNormalRow.number.value = formatFloat(mortar?.normal ?? 0.0, 2);
	                applyRangeRowMeta(mortarNormalRow, {
	                    tooltip: tip(
	                        'Optional normal response shift in mortar lines.',
	                        'Typical: 0.',
	                        'Too much: bumpy grid artifacts.'
	                    )
	                });
	                mortarGroup.body.appendChild(mortarNormalRow.row);
	                wallMatVarBrickGroup.body.appendChild(mortarGroup.details);
	
	                const macro1 = wallMatVarNormalized.macroLayers?.[1] ?? null;
	                const detailGroup = makeDetailsSection('Macro layer 2', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:macro1` });
	                applyTooltip(
                    detailGroup.label,
                    tip(
                        'Macro layer 2 (Macro B): secondary breakup at a different scale.',
                        'Use after Macro A for richer, less repetitive results.',
                        'Too much: busy, noisy surfaces.'
                    )
                );
                const detailToggle = makeToggleRow('Enable macro layer 2');
                detailToggle.input.checked = !!macro1?.enabled;
                detailToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                applyToggleRowMeta(detailToggle, {
                    mustHave: true,
                    tooltip: tip(
                        'Enables Macro B (secondary breakup).',
                        'Typical: enable if Macro A is not enough.',
                        'Too much: stacked breakup becomes noisy.'
                    )
                });
                detailGroup.body.appendChild(detailToggle.toggle);
                const detailStrengthRow = makeRangeRow('Intensity');
                detailStrengthRow.range.min = '0';
                detailStrengthRow.range.max = '2';
                detailStrengthRow.range.step = '0.01';
                detailStrengthRow.number.min = '0';
                detailStrengthRow.number.max = '2';
                detailStrengthRow.number.step = '0.01';
                detailStrengthRow.range.value = String(macro1?.intensity ?? 0.0);
                detailStrengthRow.number.value = formatFloat(macro1?.intensity ?? 0.0, 2);
                applyRangeRowMeta(detailStrengthRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Strength of Macro B.',
                        'Typical: 0.1–0.8.',
                        'Too much: obvious noisy patterning.'
                    )
                });
                detailGroup.body.appendChild(detailStrengthRow.row);

                const detailScaleRow = makeRangeRow('Scale');
                detailScaleRow.range.min = '0.01';
                detailScaleRow.range.max = '20';
                detailScaleRow.range.step = '0.01';
                detailScaleRow.number.min = '0.01';
                detailScaleRow.number.max = '20';
                detailScaleRow.number.step = '0.01';
                detailScaleRow.range.value = String(macro1?.scale ?? 1.0);
                detailScaleRow.number.value = formatFloat(macro1?.scale ?? 1.0, 2);
                applyRangeRowMeta(detailScaleRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Frequency of Macro B (higher = smaller features).',
                        'Typical: 1–10 depending on your base tile size.',
                        'Too much: becomes micro-noise.'
                    )
                });
                detailGroup.body.appendChild(detailScaleRow.row);

                const detailHueRow = makeRangeRow('Hue shift (deg)');
                detailHueRow.range.min = '-180';
                detailHueRow.range.max = '180';
                detailHueRow.range.step = '1';
                detailHueRow.number.min = '-180';
                detailHueRow.number.max = '180';
                detailHueRow.number.step = '1';
                detailHueRow.range.value = String(macro1?.hueDegrees ?? 0.0);
                detailHueRow.number.value = String(Math.round(macro1?.hueDegrees ?? 0.0));
                applyRangeRowMeta(detailHueRow, {
                    tooltip: tip(
                        'Hue shift for Macro B.',
                        'Typical: subtle.',
                        'Too much: obvious colored patches.'
                    )
                });
                detailGroup.body.appendChild(detailHueRow.row);

                const detailValueRow = makeRangeRow('Value');
                detailValueRow.range.min = '-1';
                detailValueRow.range.max = '1';
                detailValueRow.range.step = '0.01';
                detailValueRow.number.min = '-1';
                detailValueRow.number.max = '1';
                detailValueRow.number.step = '0.01';
                detailValueRow.range.value = String(macro1?.value ?? 0.0);
                detailValueRow.number.value = formatFloat(macro1?.value ?? 0.0, 2);
                applyRangeRowMeta(detailValueRow, {
                    tooltip: tip(
                        'Value/brightness shift for Macro B.',
                        'Typical: small.',
                        'Too much: harsh patchiness.'
                    )
                });
                detailGroup.body.appendChild(detailValueRow.row);

                const detailSaturationRow = makeRangeRow('Saturation');
                detailSaturationRow.range.min = '-1';
                detailSaturationRow.range.max = '1';
                detailSaturationRow.range.step = '0.01';
                detailSaturationRow.number.min = '-1';
                detailSaturationRow.number.max = '1';
                detailSaturationRow.number.step = '0.01';
                detailSaturationRow.range.value = String(macro1?.saturation ?? 0.0);
                detailSaturationRow.number.value = formatFloat(macro1?.saturation ?? 0.0, 2);
                applyRangeRowMeta(detailSaturationRow, {
                    tooltip: tip(
                        'Saturation shift for Macro B.',
                        'Typical: subtle.',
                        'Too much: obvious saturation swings.'
                    )
                });
                detailGroup.body.appendChild(detailSaturationRow.row);

                const detailRoughnessRow = makeRangeRow('Roughness');
                detailRoughnessRow.range.min = '-1';
                detailRoughnessRow.range.max = '1';
                detailRoughnessRow.range.step = '0.01';
                detailRoughnessRow.number.min = '-1';
                detailRoughnessRow.number.max = '1';
                detailRoughnessRow.number.step = '0.01';
                detailRoughnessRow.range.value = String(macro1?.roughness ?? 0.0);
                detailRoughnessRow.number.value = formatFloat(macro1?.roughness ?? 0.0, 2);
                applyRangeRowMeta(detailRoughnessRow, {
                    tooltip: tip(
                        'Roughness shift for Macro B.',
                        'Typical: subtle.',
                        'Too much: noisy specular response.'
                    )
                });
                detailGroup.body.appendChild(detailRoughnessRow.row);

                const detailNormalRow = makeRangeRow('Normal');
                detailNormalRow.range.min = '-1';
                detailNormalRow.range.max = '1';
                detailNormalRow.range.step = '0.01';
                detailNormalRow.number.min = '-1';
                detailNormalRow.number.max = '1';
                detailNormalRow.number.step = '0.01';
                detailNormalRow.range.value = String(macro1?.normal ?? 0.0);
                detailNormalRow.number.value = formatFloat(macro1?.normal ?? 0.0, 2);
                applyRangeRowMeta(detailNormalRow, {
                    tooltip: tip(
                        'Normal shift for Macro B.',
                        'Typical: 0.',
                        'Too much: bumpy/shimmering artifacts.'
                    )
                });
                detailGroup.body.appendChild(detailNormalRow.row);
                wallMatVarMacroGroup.body.appendChild(detailGroup.details);

                const macro2 = wallMatVarNormalized.macroLayers?.[2] ?? null;
                const macro2Group = makeDetailsSection('Macro layer 3', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:macro2` });
                applyTooltip(
                    macro2Group.label,
                    tip(
                        'Macro layer 3 (Patches): mid-scale patchy variation.',
                        'Good for repairs/batches and less uniform surfaces.',
                        'Too much: camouflage-like patchiness.'
                    )
                );
                const macro2Toggle = makeToggleRow('Enable macro layer 3');
                macro2Toggle.input.checked = !!macro2?.enabled;
                macro2Toggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                applyToggleRowMeta(macro2Toggle, {
                    mustHave: true,
                    tooltip: tip(
                        'Enables the patchy mid-variation layer.',
                        'Typical: enable with low intensity.',
                        'Too much: patch patterns dominate the material.'
                    )
                });
                macro2Group.body.appendChild(macro2Toggle.toggle);

                const macro2StrengthRow = makeRangeRow('Intensity');
                macro2StrengthRow.range.min = '0';
                macro2StrengthRow.range.max = '2';
                macro2StrengthRow.range.step = '0.01';
                macro2StrengthRow.number.min = '0';
                macro2StrengthRow.number.max = '2';
                macro2StrengthRow.number.step = '0.01';
                macro2StrengthRow.range.value = String(macro2?.intensity ?? 0.0);
                macro2StrengthRow.number.value = formatFloat(macro2?.intensity ?? 0.0, 2);
                applyRangeRowMeta(macro2StrengthRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Strength of patch variation.',
                        'Typical: 0.1–0.6.',
                        'Too much: obvious patch camouflage.'
                    )
                });
                macro2Group.body.appendChild(macro2StrengthRow.row);

                const macro2ScaleRow = makeRangeRow('Scale');
                macro2ScaleRow.range.min = '0.01';
                macro2ScaleRow.range.max = '20';
                macro2ScaleRow.range.step = '0.01';
                macro2ScaleRow.number.min = '0.01';
                macro2ScaleRow.number.max = '20';
                macro2ScaleRow.number.step = '0.01';
                macro2ScaleRow.range.value = String(macro2?.scale ?? 1.0);
                macro2ScaleRow.number.value = formatFloat(macro2?.scale ?? 1.0, 2);
	                applyRangeRowMeta(macro2ScaleRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Frequency of patch shapes (higher = smaller patches).',
	                        'Typical: 0.5–4.0.',
	                        'Too much: tiny noisy patches.'
	                    )
	                });
	                macro2Group.body.appendChild(macro2ScaleRow.row);

	                const macro2CoverageRow = makeRangeRow('Coverage');
	                macro2CoverageRow.range.min = '0';
	                macro2CoverageRow.range.max = '1';
	                macro2CoverageRow.range.step = '0.01';
	                macro2CoverageRow.number.min = '0';
	                macro2CoverageRow.number.max = '1';
	                macro2CoverageRow.number.step = '0.01';
	                macro2CoverageRow.range.value = String(macro2?.coverage ?? 0.0);
	                macro2CoverageRow.number.value = formatFloat(macro2?.coverage ?? 0.0, 2);
	                applyRangeRowMeta(macro2CoverageRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'How much of the surface becomes “patches”. Higher = fewer patches.',
	                        'Typical: 0.55–0.80.',
	                        'Too much: 0 means everywhere; 1 means almost none.'
	                    )
	                });
	                macro2Group.body.appendChild(macro2CoverageRow.row);

                const macro2HueRow = makeRangeRow('Hue shift (deg)');
                macro2HueRow.range.min = '-180';
                macro2HueRow.range.max = '180';
                macro2HueRow.range.step = '1';
                macro2HueRow.number.min = '-180';
                macro2HueRow.number.max = '180';
                macro2HueRow.number.step = '1';
                macro2HueRow.range.value = String(macro2?.hueDegrees ?? 0.0);
                macro2HueRow.number.value = String(Math.round(macro2?.hueDegrees ?? 0.0));
                applyRangeRowMeta(macro2HueRow, {
                    tooltip: tip(
                        'Hue shift for patch variation.',
                        'Typical: subtle (often 0).',
                        'Too much: colorful patch camouflage.'
                    )
                });
                macro2Group.body.appendChild(macro2HueRow.row);

                const macro2ValueRow = makeRangeRow('Value');
                macro2ValueRow.range.min = '-1';
                macro2ValueRow.range.max = '1';
                macro2ValueRow.range.step = '0.01';
                macro2ValueRow.number.min = '-1';
                macro2ValueRow.number.max = '1';
                macro2ValueRow.number.step = '0.01';
                macro2ValueRow.range.value = String(macro2?.value ?? 0.0);
                macro2ValueRow.number.value = formatFloat(macro2?.value ?? 0.0, 2);
                applyRangeRowMeta(macro2ValueRow, {
                    tooltip: tip(
                        'Value/brightness shift for patches.',
                        'Typical: small.',
                        'Too much: harsh patch contrast.'
                    )
                });
                macro2Group.body.appendChild(macro2ValueRow.row);

                const macro2SaturationRow = makeRangeRow('Saturation');
                macro2SaturationRow.range.min = '-1';
                macro2SaturationRow.range.max = '1';
                macro2SaturationRow.range.step = '0.01';
                macro2SaturationRow.number.min = '-1';
                macro2SaturationRow.number.max = '1';
                macro2SaturationRow.number.step = '0.01';
                macro2SaturationRow.range.value = String(macro2?.saturation ?? 0.0);
                macro2SaturationRow.number.value = formatFloat(macro2?.saturation ?? 0.0, 2);
                applyRangeRowMeta(macro2SaturationRow, {
                    tooltip: tip(
                        'Saturation shift for patches.',
                        'Typical: subtle.',
                        'Too much: obvious colored patch areas.'
                    )
                });
                macro2Group.body.appendChild(macro2SaturationRow.row);

                const macro2RoughnessRow = makeRangeRow('Roughness');
	                macro2RoughnessRow.range.min = '-1';
	                macro2RoughnessRow.range.max = '1';
	                macro2RoughnessRow.range.step = '0.01';
	                macro2RoughnessRow.number.min = '-1';
	                macro2RoughnessRow.number.max = '1';
	                macro2RoughnessRow.number.step = '0.01';
	                macro2RoughnessRow.range.value = String(macro2?.roughness ?? 0.0);
	                macro2RoughnessRow.number.value = formatFloat(macro2?.roughness ?? 0.0, 2);
	                applyRangeRowMeta(macro2RoughnessRow, {
                    tooltip: tip(
                        'Roughness shift for patches.',
                        'Typical: subtle.',
                        'Too much: noisy specular variation.'
                    )
                });
                macro2Group.body.appendChild(macro2RoughnessRow.row);

                const macro2NormalRow = makeRangeRow('Normal');
                macro2NormalRow.range.min = '-1';
                macro2NormalRow.range.max = '1';
                macro2NormalRow.range.step = '0.01';
                macro2NormalRow.number.min = '-1';
                macro2NormalRow.number.max = '1';
                macro2NormalRow.number.step = '0.01';
                macro2NormalRow.range.value = String(macro2?.normal ?? 0.0);
                macro2NormalRow.number.value = formatFloat(macro2?.normal ?? 0.0, 2);
                applyRangeRowMeta(macro2NormalRow, {
                    tooltip: tip(
                        'Normal shift for patches.',
                        'Typical: 0.',
                        'Too much: bumpy patch artifacts.'
                    )
                });
	                macro2Group.body.appendChild(macro2NormalRow.row);
	                wallMatVarMidGroup.body.appendChild(macro2Group.details);

	                const micro0 = wallMatVarNormalized.macroLayers?.[3] ?? null;
	                const microGroup = makeDetailsSection('Micro roughness', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:micro0` });
	                applyTooltip(
	                    microGroup.label,
	                    tip(
	                        'Micro breakup for surface response (mostly roughness, optionally normals).',
	                        'Use to avoid large flat glossy/matte areas.',
	                        'Too much: sparkly specular noise.'
	                    )
	                );
	                const microToggle = makeToggleRow('Enable micro variation');
	                microToggle.input.checked = !!micro0?.enabled;
	                microToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
	                applyToggleRowMeta(microToggle, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Enables micro-scale variation (roughness-first).',
	                        'Typical: enable with low Intensity.',
	                        'Too much: noisy shimmer on highlights.'
	                    )
	                });
	                microGroup.body.appendChild(microToggle.toggle);

	                const microIntensityRow = makeRangeRow('Intensity');
	                microIntensityRow.range.min = '0';
	                microIntensityRow.range.max = '2';
	                microIntensityRow.range.step = '0.01';
	                microIntensityRow.number.min = '0';
	                microIntensityRow.number.max = '2';
	                microIntensityRow.number.step = '0.01';
	                microIntensityRow.range.value = String(micro0?.intensity ?? 0.0);
	                microIntensityRow.number.value = formatFloat(micro0?.intensity ?? 0.0, 2);
	                applyRangeRowMeta(microIntensityRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Strength of the micro mask.',
	                        'Typical: 0.1–0.8.',
	                        'Too much: micro-noise dominates.'
	                    )
	                });
	                microGroup.body.appendChild(microIntensityRow.row);

	                const microScaleRow = makeRangeRow('Scale');
	                microScaleRow.range.min = '0.01';
	                microScaleRow.range.max = '20';
	                microScaleRow.range.step = '0.01';
	                microScaleRow.number.min = '0.01';
	                microScaleRow.number.max = '20';
	                microScaleRow.number.step = '0.01';
	                microScaleRow.range.value = String(micro0?.scale ?? 1.0);
	                microScaleRow.number.value = formatFloat(micro0?.scale ?? 1.0, 2);
	                applyRangeRowMeta(microScaleRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Frequency of micro breakup (higher = smaller micro detail).',
	                        'Typical: 6–20.',
	                        'Too much: glittery surface noise.'
	                    )
	                });
	                microGroup.body.appendChild(microScaleRow.row);

	                const microRoughnessRow = makeRangeRow('Roughness');
	                microRoughnessRow.range.min = '-1';
	                microRoughnessRow.range.max = '1';
	                microRoughnessRow.range.step = '0.01';
	                microRoughnessRow.number.min = '-1';
	                microRoughnessRow.number.max = '1';
	                microRoughnessRow.number.step = '0.01';
	                microRoughnessRow.range.value = String(micro0?.roughness ?? 0.0);
	                microRoughnessRow.number.value = formatFloat(micro0?.roughness ?? 0.0, 2);
	                applyRangeRowMeta(microRoughnessRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Roughness shift driven by the micro mask.',
	                        'Typical: small positive values for subtle breakup.',
	                        'Too much: unstable specular response.'
	                    )
	                });
	                microGroup.body.appendChild(microRoughnessRow.row);

	                const microNormalRow = makeRangeRow('Normal');
	                microNormalRow.range.min = '-1';
	                microNormalRow.range.max = '1';
	                microNormalRow.range.step = '0.01';
	                microNormalRow.number.min = '-1';
	                microNormalRow.number.max = '1';
	                microNormalRow.number.step = '0.01';
	                microNormalRow.range.value = String(micro0?.normal ?? 0.0);
	                microNormalRow.number.value = formatFloat(micro0?.normal ?? 0.0, 2);
	                applyRangeRowMeta(microNormalRow, {
	                    tooltip: tip(
	                        'Optional micro normal boost/attenuation.',
	                        'Typical: 0.',
	                        'Too much: bumpy/shimmering shading artifacts.'
	                    )
	                });
	                microGroup.body.appendChild(microNormalRow.row);
	                wallMatVarMicroGroup.body.appendChild(microGroup.details);

	                const cracksLayer = wallMatVarNormalized.cracksLayer ?? null;
	                const cracksGroup = makeDetailsSection('Cracks', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:cracks` });
	                applyTooltip(
                    cracksGroup.label,
                    tip(
                        'Procedural cracks and fine damage.',
                        'Use sparingly to avoid a “ruined” look.',
                        'Too much: the surface reads as broken everywhere.'
                    )
                );
                const cracksToggle = makeToggleRow('Enable cracks');
                cracksToggle.input.checked = !!cracksLayer?.enabled;
                cracksToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                applyToggleRowMeta(cracksToggle, {
                    mustHave: true,
                    tooltip: tip(
                        'Enables procedural cracks.',
                        'Typical: enable with very low Strength.',
                        'Too much: cracks dominate the material.'
                    )
                });
                cracksGroup.body.appendChild(cracksToggle.toggle);
                const crackStrengthRow = makeRangeRow('Strength');
                crackStrengthRow.range.min = '0';
                crackStrengthRow.range.max = '2';
                crackStrengthRow.range.step = '0.01';
                crackStrengthRow.number.min = '0';
                crackStrengthRow.number.max = '2';
                crackStrengthRow.number.step = '0.01';
                crackStrengthRow.range.value = String(cracksLayer?.intensity ?? 0.0);
                crackStrengthRow.number.value = formatFloat(cracksLayer?.intensity ?? 0.0, 2);
                applyRangeRowMeta(crackStrengthRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Strength/visibility of cracks.',
                        'Typical: 0.02–0.20.',
                        'Too much: strong crack networks everywhere.'
                    )
                });
                cracksGroup.body.appendChild(crackStrengthRow.row);

                const crackScaleRow = makeRangeRow('Scale');
                crackScaleRow.range.min = '0.01';
                crackScaleRow.range.max = '20';
                crackScaleRow.range.step = '0.01';
                crackScaleRow.number.min = '0.01';
                crackScaleRow.number.max = '20';
                crackScaleRow.number.step = '0.01';
                crackScaleRow.range.value = String(cracksLayer?.scale ?? 1.0);
                crackScaleRow.number.value = formatFloat(cracksLayer?.scale ?? 1.0, 2);
                applyRangeRowMeta(crackScaleRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Frequency of crack patterns (higher = smaller cracks).',
                        'Typical: 1–6.',
                        'Too much: tiny noisy crack texture.'
                    )
                });
                cracksGroup.body.appendChild(crackScaleRow.row);

                const crackHueRow = makeRangeRow('Hue shift (deg)');
                crackHueRow.range.min = '-180';
                crackHueRow.range.max = '180';
                crackHueRow.range.step = '1';
                crackHueRow.number.min = '-180';
                crackHueRow.number.max = '180';
                crackHueRow.number.step = '1';
                crackHueRow.range.value = String(cracksLayer?.hueDegrees ?? 0.0);
                crackHueRow.number.value = String(Math.round(cracksLayer?.hueDegrees ?? 0.0));
                applyRangeRowMeta(crackHueRow, {
                    tooltip: tip(
                        'Hue shift inside cracks.',
                        'Typical: 0.',
                        'Too much: colored cracks look like paint.'
                    )
                });
                cracksGroup.body.appendChild(crackHueRow.row);

                const crackValueRow = makeRangeRow('Value');
                crackValueRow.range.min = '-1';
                crackValueRow.range.max = '1';
                crackValueRow.range.step = '0.01';
                crackValueRow.number.min = '-1';
                crackValueRow.number.max = '1';
                crackValueRow.number.step = '0.01';
                crackValueRow.range.value = String(cracksLayer?.value ?? 0.0);
                crackValueRow.number.value = formatFloat(cracksLayer?.value ?? 0.0, 2);
                applyRangeRowMeta(crackValueRow, {
                    tooltip: tip(
                        'Value/brightness shift inside cracks.',
                        'Typical: slightly darker.',
                        'Too much: looks like drawn lines.'
                    )
                });
                cracksGroup.body.appendChild(crackValueRow.row);

                const crackSaturationRow = makeRangeRow('Saturation');
                crackSaturationRow.range.min = '-1';
                crackSaturationRow.range.max = '1';
                crackSaturationRow.range.step = '0.01';
                crackSaturationRow.number.min = '-1';
                crackSaturationRow.number.max = '1';
                crackSaturationRow.number.step = '0.01';
                crackSaturationRow.range.value = String(cracksLayer?.saturation ?? 0.0);
                crackSaturationRow.number.value = formatFloat(cracksLayer?.saturation ?? 0.0, 2);
                applyRangeRowMeta(crackSaturationRow, {
                    tooltip: tip(
                        'Saturation shift inside cracks.',
                        'Typical: small negative saturation.',
                        'Too much: colored crack lines.'
                    )
                });
                cracksGroup.body.appendChild(crackSaturationRow.row);

                const crackRoughnessRow = makeRangeRow('Roughness');
                    crackRoughnessRow.range.min = '-1';
                    crackRoughnessRow.range.max = '1';
                    crackRoughnessRow.range.step = '0.01';
                    crackRoughnessRow.number.min = '-1';
                    crackRoughnessRow.number.max = '1';
                    crackRoughnessRow.number.step = '0.01';
                    crackRoughnessRow.range.value = String(cracksLayer?.roughness ?? 0.0);
                    crackRoughnessRow.number.value = formatFloat(cracksLayer?.roughness ?? 0.0, 2);
                    applyRangeRowMeta(crackRoughnessRow, {
                    tooltip: tip(
                        'Roughness shift inside cracks.',
                        'Typical: small changes.',
                        'Too much: noisy specular along crack lines.'
                    )
                });
                cracksGroup.body.appendChild(crackRoughnessRow.row);

                const crackNormalRow = makeRangeRow('Normal');
                crackNormalRow.range.min = '-1';
                crackNormalRow.range.max = '1';
                crackNormalRow.range.step = '0.01';
                crackNormalRow.number.min = '-1';
                crackNormalRow.number.max = '1';
                crackNormalRow.number.step = '0.01';
                crackNormalRow.range.value = String(cracksLayer?.normal ?? 0.0);
                crackNormalRow.number.value = formatFloat(cracksLayer?.normal ?? 0.0, 2);
                applyRangeRowMeta(crackNormalRow, {
                    tooltip: tip(
                        'Normal shift inside cracks.',
                        'Typical: 0.',
                        'Too much: bumpy crack artifacts.'
                    )
                });
                cracksGroup.body.appendChild(crackNormalRow.row);
                wallMatVarWeatherGroup.body.appendChild(cracksGroup.details);

	                const syncMatVarEnabled = () => {
	                    const enabled = !!layer.materialVariation.enabled;
                        const objectSpace = matVarSpaceSelect.value === 'object';
                        matVarSpaceSelect.disabled = !allow || !enabled;
	                    seedOffsetRow.range.disabled = !allow || !enabled;
	                    seedOffsetRow.number.disabled = seedOffsetRow.range.disabled;
	                    intensityRow.range.disabled = !allow || !enabled;
	                    intensityRow.number.disabled = intensityRow.range.disabled;
	                    scaleRow.range.disabled = !allow || !enabled || objectSpace;
	                    scaleRow.number.disabled = scaleRow.range.disabled;
                        objectScaleRow.range.disabled = !allow || !enabled || !objectSpace;
                        objectScaleRow.number.disabled = objectScaleRow.range.disabled;
                        wallMatVarNormalFlipXToggle.input.disabled = !allow || !enabled;
                        wallMatVarNormalFlipYToggle.input.disabled = !allow || !enabled;
                        wallMatVarNormalFlipZToggle.input.disabled = !allow || !enabled;
	                    aoAmountRow.range.disabled = !allow || !enabled;
	                    aoAmountRow.number.disabled = aoAmountRow.range.disabled;

                    macroToggle.input.disabled = !allow || !enabled;
                    macroIntensityRow.range.disabled = !allow || !enabled || !macroToggle.input.checked;
                    macroIntensityRow.number.disabled = macroIntensityRow.range.disabled;
                    macroScaleRow.range.disabled = !allow || !enabled || !macroToggle.input.checked;
                    macroScaleRow.number.disabled = macroScaleRow.range.disabled;
                    macroHueRow.range.disabled = !allow || !enabled || !macroToggle.input.checked;
                    macroHueRow.number.disabled = macroHueRow.range.disabled;
                    macroValueRow.range.disabled = !allow || !enabled || !macroToggle.input.checked;
                    macroValueRow.number.disabled = macroValueRow.range.disabled;
                    macroSaturationRow.range.disabled = !allow || !enabled || !macroToggle.input.checked;
                    macroSaturationRow.number.disabled = macroSaturationRow.range.disabled;
                    macroRoughnessRow.range.disabled = !allow || !enabled || !macroToggle.input.checked;
                    macroRoughnessRow.number.disabled = macroRoughnessRow.range.disabled;
                    macroNormalRow.range.disabled = !allow || !enabled || !macroToggle.input.checked;
                    macroNormalRow.number.disabled = macroNormalRow.range.disabled;

                    streaksToggle.input.disabled = !allow || !enabled;
                    streakStrengthRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
                    streakStrengthRow.number.disabled = streakStrengthRow.range.disabled;
                    streakScaleRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
                    streakScaleRow.number.disabled = streakScaleRow.range.disabled;
                    streakLedgeStrengthRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
                    streakLedgeStrengthRow.number.disabled = streakLedgeStrengthRow.range.disabled;
                    streakLedgeScaleRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
                    streakLedgeScaleRow.number.disabled = streakLedgeScaleRow.range.disabled;
                    streakHueRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
                    streakHueRow.number.disabled = streakHueRow.range.disabled;
                    streakValueRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
                    streakValueRow.number.disabled = streakValueRow.range.disabled;
                    streakSaturationRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
                    streakSaturationRow.number.disabled = streakSaturationRow.range.disabled;
	                    streakRoughnessRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
	                    streakRoughnessRow.number.disabled = streakRoughnessRow.range.disabled;
	                    streakNormalRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
	                    streakNormalRow.number.disabled = streakNormalRow.range.disabled;

	                    exposureToggle.input.disabled = !allow || !enabled;
	                    exposureStrengthRow.range.disabled = !allow || !enabled || !exposureToggle.input.checked;
	                    exposureStrengthRow.number.disabled = exposureStrengthRow.range.disabled;
	                    exposureExponentRow.range.disabled = !allow || !enabled || !exposureToggle.input.checked;
	                    exposureExponentRow.number.disabled = exposureExponentRow.range.disabled;
	                    exposureAzimuthRow.range.disabled = !allow || !enabled || !exposureToggle.input.checked;
	                    exposureAzimuthRow.number.disabled = exposureAzimuthRow.range.disabled;
	                    exposureElevationRow.range.disabled = !allow || !enabled || !exposureToggle.input.checked;
	                    exposureElevationRow.number.disabled = exposureElevationRow.range.disabled;
	                    exposureValueRow.range.disabled = !allow || !enabled || !exposureToggle.input.checked;
	                    exposureValueRow.number.disabled = exposureValueRow.range.disabled;
	                    exposureSaturationRow.range.disabled = !allow || !enabled || !exposureToggle.input.checked;
	                    exposureSaturationRow.number.disabled = exposureSaturationRow.range.disabled;
	                    exposureRoughnessRow.range.disabled = !allow || !enabled || !exposureToggle.input.checked;
	                    exposureRoughnessRow.number.disabled = exposureRoughnessRow.range.disabled;
	
	                    edgeToggle.input.disabled = !allow || !enabled;
	                    edgeStrengthRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
	                    edgeStrengthRow.number.disabled = edgeStrengthRow.range.disabled;
                    edgeWidthRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
                    edgeWidthRow.number.disabled = edgeWidthRow.range.disabled;
                    edgeScaleRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
                    edgeScaleRow.number.disabled = edgeScaleRow.range.disabled;
                    edgeHueRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
                    edgeHueRow.number.disabled = edgeHueRow.range.disabled;
                    edgeValueRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
                    edgeValueRow.number.disabled = edgeValueRow.range.disabled;
                    edgeSaturationRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
                    edgeSaturationRow.number.disabled = edgeSaturationRow.range.disabled;
                    edgeRoughnessRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
                    edgeRoughnessRow.number.disabled = edgeRoughnessRow.range.disabled;
                    edgeNormalRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
                    edgeNormalRow.number.disabled = edgeNormalRow.range.disabled;

                    grimeToggle.input.disabled = !allow || !enabled;
                    grimeStrengthRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
                    grimeStrengthRow.number.disabled = grimeStrengthRow.range.disabled;
                    grimeWidthRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
                    grimeWidthRow.number.disabled = grimeWidthRow.range.disabled;
                    grimeScaleRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
                    grimeScaleRow.number.disabled = grimeScaleRow.range.disabled;
                    grimeHueRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
                    grimeHueRow.number.disabled = grimeHueRow.range.disabled;
                    grimeValueRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
                    grimeValueRow.number.disabled = grimeValueRow.range.disabled;
                    grimeSaturationRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
                    grimeSaturationRow.number.disabled = grimeSaturationRow.range.disabled;
                    grimeRoughnessRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
                    grimeRoughnessRow.number.disabled = grimeRoughnessRow.range.disabled;
                    grimeNormalRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
                    grimeNormalRow.number.disabled = grimeNormalRow.range.disabled;

                    dustToggle.input.disabled = !allow || !enabled;
                    dustStrengthRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
                    dustStrengthRow.number.disabled = dustStrengthRow.range.disabled;
                    dustWidthRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
                    dustWidthRow.number.disabled = dustWidthRow.range.disabled;
                    dustScaleRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
                    dustScaleRow.number.disabled = dustScaleRow.range.disabled;
                    dustHueRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
                    dustHueRow.number.disabled = dustHueRow.range.disabled;
                    dustValueRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
                    dustValueRow.number.disabled = dustValueRow.range.disabled;
                    dustSaturationRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
                    dustSaturationRow.number.disabled = dustSaturationRow.range.disabled;
                    dustRoughnessRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
                    dustRoughnessRow.number.disabled = dustRoughnessRow.range.disabled;
                    dustNormalRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
                    dustNormalRow.number.disabled = dustNormalRow.range.disabled;

                    antiController.syncDisabled({ allow, parentEnabled: enabled });

	                    bricksPerTileXRow.range.disabled = !allow || !enabled;
	                    bricksPerTileXRow.number.disabled = bricksPerTileXRow.range.disabled;
	                    bricksPerTileYRow.range.disabled = !allow || !enabled;
	                    bricksPerTileYRow.number.disabled = bricksPerTileYRow.range.disabled;
	                    mortarWidthRow.range.disabled = !allow || !enabled;
	                    mortarWidthRow.number.disabled = mortarWidthRow.range.disabled;
	                    brickOffsetXRow.range.disabled = !allow || !enabled;
	                    brickOffsetXRow.number.disabled = brickOffsetXRow.range.disabled;
	                    brickOffsetYRow.range.disabled = !allow || !enabled;
	                    brickOffsetYRow.number.disabled = brickOffsetYRow.range.disabled;

	                    stairToggle.input.disabled = !allow || !enabled;
	                    stairStrengthRow.range.disabled = !allow || !enabled || !stairToggle.input.checked;
	                    stairStrengthRow.number.disabled = stairStrengthRow.range.disabled;
	                    stairStepRow.range.disabled = !allow || !enabled || !stairToggle.input.checked;
	                    stairStepRow.number.disabled = stairStepRow.range.disabled;
	                    stairShiftRow.range.disabled = !allow || !enabled || !stairToggle.input.checked;
	                    stairShiftRow.number.disabled = stairShiftRow.range.disabled;
	                    stairModeSelect.disabled = !allow || !enabled || !stairToggle.input.checked;
	                    const stairIsPattern3 = stairModeSelect.value === 'pattern3';
	                    stairPatternARow.range.disabled = !allow || !enabled || !stairToggle.input.checked || !stairIsPattern3;
	                    stairPatternARow.number.disabled = stairPatternARow.range.disabled;
	                    stairPatternBRow.range.disabled = !allow || !enabled || !stairToggle.input.checked || !stairIsPattern3;
	                    stairPatternBRow.number.disabled = stairPatternBRow.range.disabled;
	                    stairBlendRow.range.disabled = !allow || !enabled || !stairToggle.input.checked;
	                    stairBlendRow.number.disabled = stairBlendRow.range.disabled;
	                    stairDirSelect.disabled = !allow || !enabled || !stairToggle.input.checked;

	                    perBrickToggle.input.disabled = !allow || !enabled;
	                    perBrickStrengthRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
	                    perBrickStrengthRow.number.disabled = perBrickStrengthRow.range.disabled;
	                    perBrickHueRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
	                    perBrickHueRow.number.disabled = perBrickHueRow.range.disabled;
	                    perBrickValueRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
	                    perBrickValueRow.number.disabled = perBrickValueRow.range.disabled;
	                    perBrickSaturationRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
	                    perBrickSaturationRow.number.disabled = perBrickSaturationRow.range.disabled;
	                    perBrickRoughnessRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
	                    perBrickRoughnessRow.number.disabled = perBrickRoughnessRow.range.disabled;
	                    perBrickNormalRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
	                    perBrickNormalRow.number.disabled = perBrickNormalRow.range.disabled;

	                    mortarToggle.input.disabled = !allow || !enabled;
	                    mortarStrengthRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
	                    mortarStrengthRow.number.disabled = mortarStrengthRow.range.disabled;
	                    mortarHueRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
	                    mortarHueRow.number.disabled = mortarHueRow.range.disabled;
	                    mortarValueRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
	                    mortarValueRow.number.disabled = mortarValueRow.range.disabled;
	                    mortarSaturationRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
	                    mortarSaturationRow.number.disabled = mortarSaturationRow.range.disabled;
	                    mortarRoughnessRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
	                    mortarRoughnessRow.number.disabled = mortarRoughnessRow.range.disabled;
	                    mortarNormalRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
	                    mortarNormalRow.number.disabled = mortarNormalRow.range.disabled;

	                    detailToggle.input.disabled = !allow || !enabled;
	                    detailStrengthRow.range.disabled = !allow || !enabled || !detailToggle.input.checked;
	                    detailStrengthRow.number.disabled = detailStrengthRow.range.disabled;
                    detailScaleRow.range.disabled = !allow || !enabled || !detailToggle.input.checked;
                    detailScaleRow.number.disabled = detailScaleRow.range.disabled;
                    detailHueRow.range.disabled = !allow || !enabled || !detailToggle.input.checked;
                    detailHueRow.number.disabled = detailHueRow.range.disabled;
                    detailValueRow.range.disabled = !allow || !enabled || !detailToggle.input.checked;
                    detailValueRow.number.disabled = detailValueRow.range.disabled;
                    detailSaturationRow.range.disabled = !allow || !enabled || !detailToggle.input.checked;
                    detailSaturationRow.number.disabled = detailSaturationRow.range.disabled;
                    detailRoughnessRow.range.disabled = !allow || !enabled || !detailToggle.input.checked;
                    detailRoughnessRow.number.disabled = detailRoughnessRow.range.disabled;
                    detailNormalRow.range.disabled = !allow || !enabled || !detailToggle.input.checked;
                    detailNormalRow.number.disabled = detailNormalRow.range.disabled;

                    macro2Toggle.input.disabled = !allow || !enabled;
	                    macro2StrengthRow.range.disabled = !allow || !enabled || !macro2Toggle.input.checked;
	                    macro2StrengthRow.number.disabled = macro2StrengthRow.range.disabled;
	                    macro2ScaleRow.range.disabled = !allow || !enabled || !macro2Toggle.input.checked;
	                    macro2ScaleRow.number.disabled = macro2ScaleRow.range.disabled;
	                    macro2CoverageRow.range.disabled = !allow || !enabled || !macro2Toggle.input.checked;
	                    macro2CoverageRow.number.disabled = macro2CoverageRow.range.disabled;
	                    macro2HueRow.range.disabled = !allow || !enabled || !macro2Toggle.input.checked;
	                    macro2HueRow.number.disabled = macro2HueRow.range.disabled;
                    macro2ValueRow.range.disabled = !allow || !enabled || !macro2Toggle.input.checked;
                    macro2ValueRow.number.disabled = macro2ValueRow.range.disabled;
                    macro2SaturationRow.range.disabled = !allow || !enabled || !macro2Toggle.input.checked;
                    macro2SaturationRow.number.disabled = macro2SaturationRow.range.disabled;
                    macro2RoughnessRow.range.disabled = !allow || !enabled || !macro2Toggle.input.checked;
	                    macro2RoughnessRow.number.disabled = macro2RoughnessRow.range.disabled;
	                    macro2NormalRow.range.disabled = !allow || !enabled || !macro2Toggle.input.checked;
	                    macro2NormalRow.number.disabled = macro2NormalRow.range.disabled;

	                    microToggle.input.disabled = !allow || !enabled;
	                    microIntensityRow.range.disabled = !allow || !enabled || !microToggle.input.checked;
	                    microIntensityRow.number.disabled = microIntensityRow.range.disabled;
	                    microScaleRow.range.disabled = !allow || !enabled || !microToggle.input.checked;
	                    microScaleRow.number.disabled = microScaleRow.range.disabled;
	                    microRoughnessRow.range.disabled = !allow || !enabled || !microToggle.input.checked;
	                    microRoughnessRow.number.disabled = microRoughnessRow.range.disabled;
	                    microNormalRow.range.disabled = !allow || !enabled || !microToggle.input.checked;
	                    microNormalRow.number.disabled = microNormalRow.range.disabled;
	
	                    cracksToggle.input.disabled = !allow || !enabled;
	                    crackStrengthRow.range.disabled = !allow || !enabled || !cracksToggle.input.checked;
	                    crackStrengthRow.number.disabled = crackStrengthRow.range.disabled;
                    crackScaleRow.range.disabled = !allow || !enabled || !cracksToggle.input.checked;
                    crackScaleRow.number.disabled = crackScaleRow.range.disabled;
                    crackHueRow.range.disabled = !allow || !enabled || !cracksToggle.input.checked;
                    crackHueRow.number.disabled = crackHueRow.range.disabled;
                    crackValueRow.range.disabled = !allow || !enabled || !cracksToggle.input.checked;
                    crackValueRow.number.disabled = crackValueRow.range.disabled;
                    crackSaturationRow.range.disabled = !allow || !enabled || !cracksToggle.input.checked;
                    crackSaturationRow.number.disabled = crackSaturationRow.range.disabled;
                    crackRoughnessRow.range.disabled = !allow || !enabled || !cracksToggle.input.checked;
                    crackRoughnessRow.number.disabled = crackRoughnessRow.range.disabled;
                    crackNormalRow.range.disabled = !allow || !enabled || !cracksToggle.input.checked;
                    crackNormalRow.number.disabled = crackNormalRow.range.disabled;
                };

                matVarToggle.input.addEventListener('change', () => {
                    const nextEnabled = !!matVarToggle.input.checked;
                    const wasEnabled = !!layer.materialVariation.enabled;
                    if (nextEnabled && !wasEnabled && isMinimalMaterialVariationConfig(layer.materialVariation)) {
                        const prevSeedOffset = clampInt(layer.materialVariation.seedOffset ?? 0, -9999, 9999);
                        const prevNormalMap = layer.materialVariation.normalMap && typeof layer.materialVariation.normalMap === 'object'
                            ? { ...layer.materialVariation.normalMap }
                            : null;
                        layer.materialVariation = createDisabledMaterialVariationConfig(MATERIAL_VARIATION_ROOT.WALL, { seedOffset: prevSeedOffset, normalMap: prevNormalMap });
                        this._renderLayersPanel();
                        this._notifySelectedLayersChanged();
                        return;
                    }

                    layer.materialVariation.enabled = nextEnabled;
                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                seedOffsetRow.range.addEventListener('input', () => {
                    const next = clampInt(seedOffsetRow.range.value, -9999, 9999);
                    layer.materialVariation.seedOffset = next;
                    seedOffsetRow.number.value = String(next);
                    this._notifySelectedLayersChanged();
                });
                seedOffsetRow.number.addEventListener('change', () => {
                    const next = clampInt(seedOffsetRow.number.value, -9999, 9999);
                    layer.materialVariation.seedOffset = next;
                    seedOffsetRow.range.value = String(next);
                    seedOffsetRow.number.value = String(next);
                    this._notifySelectedLayersChanged();
                });
                intensityRow.range.addEventListener('input', () => {
                    const next = clamp(intensityRow.range.value, 0.0, 2.0);
                    layer.materialVariation.globalIntensity = next;
                    intensityRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                intensityRow.number.addEventListener('change', () => {
                    const next = clamp(intensityRow.number.value, 0.0, 2.0);
                    layer.materialVariation.globalIntensity = next;
                    intensityRow.range.value = String(next);
                    intensityRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                scaleRow.range.addEventListener('input', () => {
                    const next = clamp(scaleRow.range.value, 0.05, 4.0);
                    layer.materialVariation.worldSpaceScale = next;
                    scaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
	                scaleRow.number.addEventListener('change', () => {
	                    const next = clamp(scaleRow.number.value, 0.05, 4.0);
	                    layer.materialVariation.worldSpaceScale = next;
	                    scaleRow.range.value = String(next);
	                    scaleRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                aoAmountRow.range.addEventListener('input', () => {
	                    const next = clamp(aoAmountRow.range.value, 0.0, 1.0);
	                    layer.materialVariation.aoAmount = next;
                    aoAmountRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                aoAmountRow.number.addEventListener('change', () => {
                    const next = clamp(aoAmountRow.number.value, 0.0, 1.0);
                    layer.materialVariation.aoAmount = next;
                    aoAmountRow.range.value = String(next);
                    aoAmountRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                matVarSpaceSelect.addEventListener('change', () => {
                    layer.materialVariation.space = matVarSpaceSelect.value === 'object' ? 'object' : 'world';
                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });

                objectScaleRow.range.addEventListener('input', () => {
                    const next = clamp(objectScaleRow.range.value, 0.05, 4.0);
                    layer.materialVariation.objectSpaceScale = next;
                    objectScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                objectScaleRow.number.addEventListener('change', () => {
                    const next = clamp(objectScaleRow.number.value, 0.05, 4.0);
                    layer.materialVariation.objectSpaceScale = next;
                    objectScaleRow.range.value = String(next);
                    objectScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                wallMatVarNormalFlipXToggle.input.addEventListener('change', () => {
                    layer.materialVariation.normalMap ??= {};
                    layer.materialVariation.normalMap.flipX = !!wallMatVarNormalFlipXToggle.input.checked;
                    this._notifySelectedLayersChanged();
                });
                wallMatVarNormalFlipYToggle.input.addEventListener('change', () => {
                    layer.materialVariation.normalMap ??= {};
                    layer.materialVariation.normalMap.flipY = !!wallMatVarNormalFlipYToggle.input.checked;
                    this._notifySelectedLayersChanged();
                });
                wallMatVarNormalFlipZToggle.input.addEventListener('change', () => {
                    layer.materialVariation.normalMap ??= {};
                    layer.materialVariation.normalMap.flipZ = !!wallMatVarNormalFlipZToggle.input.checked;
                    this._notifySelectedLayersChanged();
                });

                macroToggle.input.addEventListener('change', () => {
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[0] ??= {};
                    layer.materialVariation.macroLayers[0].enabled = !!macroToggle.input.checked;
                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                macroIntensityRow.range.addEventListener('input', () => {
                    const next = clamp(macroIntensityRow.range.value, 0.0, 2.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[0] ??= {};
                    layer.materialVariation.macroLayers[0].intensity = next;
                    macroIntensityRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                macroIntensityRow.number.addEventListener('change', () => {
                    const next = clamp(macroIntensityRow.number.value, 0.0, 2.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[0] ??= {};
                    layer.materialVariation.macroLayers[0].intensity = next;
                    macroIntensityRow.range.value = String(next);
                    macroIntensityRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                macroScaleRow.range.addEventListener('input', () => {
                    const next = clamp(macroScaleRow.range.value, 0.01, 20.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[0] ??= {};
                    layer.materialVariation.macroLayers[0].scale = next;
                    macroScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                macroScaleRow.number.addEventListener('change', () => {
                    const next = clamp(macroScaleRow.number.value, 0.01, 20.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[0] ??= {};
                    layer.materialVariation.macroLayers[0].scale = next;
                    macroScaleRow.range.value = String(next);
                    macroScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                macroHueRow.range.addEventListener('input', () => {
                    const next = clamp(macroHueRow.range.value, -180.0, 180.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[0] ??= {};
                    layer.materialVariation.macroLayers[0].hueDegrees = next;
                    macroHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                macroHueRow.number.addEventListener('change', () => {
                    const next = clamp(macroHueRow.number.value, -180.0, 180.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[0] ??= {};
                    layer.materialVariation.macroLayers[0].hueDegrees = next;
                    macroHueRow.range.value = String(next);
                    macroHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                macroValueRow.range.addEventListener('input', () => {
                    const next = clamp(macroValueRow.range.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[0] ??= {};
                    layer.materialVariation.macroLayers[0].value = next;
                    macroValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                macroValueRow.number.addEventListener('change', () => {
                    const next = clamp(macroValueRow.number.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[0] ??= {};
                    layer.materialVariation.macroLayers[0].value = next;
                    macroValueRow.range.value = String(next);
                    macroValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                macroSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(macroSaturationRow.range.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[0] ??= {};
                    layer.materialVariation.macroLayers[0].saturation = next;
                    macroSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                macroSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(macroSaturationRow.number.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[0] ??= {};
                    layer.materialVariation.macroLayers[0].saturation = next;
                    macroSaturationRow.range.value = String(next);
                    macroSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                macroRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(macroRoughnessRow.range.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[0] ??= {};
                    layer.materialVariation.macroLayers[0].roughness = next;
                    macroRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                macroRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(macroRoughnessRow.number.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[0] ??= {};
                    layer.materialVariation.macroLayers[0].roughness = next;
                    macroRoughnessRow.range.value = String(next);
                    macroRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                macroNormalRow.range.addEventListener('input', () => {
                    const next = clamp(macroNormalRow.range.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[0] ??= {};
                    layer.materialVariation.macroLayers[0].normal = next;
                    macroNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                macroNormalRow.number.addEventListener('change', () => {
                    const next = clamp(macroNormalRow.number.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[0] ??= {};
                    layer.materialVariation.macroLayers[0].normal = next;
                    macroNormalRow.range.value = String(next);
                    macroNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                streaksToggle.input.addEventListener('change', () => {
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.enabled = !!streaksToggle.input.checked;
                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                streakStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(streakStrengthRow.range.value, 0.0, 2.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.strength = next;
                    streakStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                streakStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(streakStrengthRow.number.value, 0.0, 2.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.strength = next;
                    streakStrengthRow.range.value = String(next);
                    streakStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                streakScaleRow.range.addEventListener('input', () => {
                    const next = clamp(streakScaleRow.range.value, 0.01, 20.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.scale = next;
                    streakScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                streakScaleRow.number.addEventListener('change', () => {
                    const next = clamp(streakScaleRow.number.value, 0.01, 20.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.scale = next;
                    streakScaleRow.range.value = String(next);
                    streakScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                streakLedgeStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(streakLedgeStrengthRow.range.value, 0.0, 2.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.ledgeStrength = next;
                    streakLedgeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                streakLedgeStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(streakLedgeStrengthRow.number.value, 0.0, 2.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.ledgeStrength = next;
                    streakLedgeStrengthRow.range.value = String(next);
                    streakLedgeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                streakLedgeScaleRow.range.addEventListener('input', () => {
                    const next = clamp(streakLedgeScaleRow.range.value, 0.0, 20.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.ledgeScale = next;
                    streakLedgeScaleRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });
                streakLedgeScaleRow.number.addEventListener('change', () => {
                    const next = clamp(streakLedgeScaleRow.number.value, 0.0, 20.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.ledgeScale = next;
                    streakLedgeScaleRow.range.value = String(next);
                    streakLedgeScaleRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });

                streakHueRow.range.addEventListener('input', () => {
                    const next = clamp(streakHueRow.range.value, -180.0, 180.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.hueDegrees = next;
                    streakHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                streakHueRow.number.addEventListener('change', () => {
                    const next = clamp(streakHueRow.number.value, -180.0, 180.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.hueDegrees = next;
                    streakHueRow.range.value = String(next);
                    streakHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                streakValueRow.range.addEventListener('input', () => {
                    const next = clamp(streakValueRow.range.value, -1.0, 1.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.value = next;
                    streakValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                streakValueRow.number.addEventListener('change', () => {
                    const next = clamp(streakValueRow.number.value, -1.0, 1.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.value = next;
                    streakValueRow.range.value = String(next);
                    streakValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                streakSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(streakSaturationRow.range.value, -1.0, 1.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.saturation = next;
                    streakSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                streakSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(streakSaturationRow.number.value, -1.0, 1.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.saturation = next;
                    streakSaturationRow.range.value = String(next);
                    streakSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                streakRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(streakRoughnessRow.range.value, -1.0, 1.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.roughness = next;
                    streakRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                streakRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(streakRoughnessRow.number.value, -1.0, 1.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.roughness = next;
                    streakRoughnessRow.range.value = String(next);
                    streakRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                streakNormalRow.range.addEventListener('input', () => {
                    const next = clamp(streakNormalRow.range.value, -1.0, 1.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.normal = next;
                    streakNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
	                streakNormalRow.number.addEventListener('change', () => {
	                    const next = clamp(streakNormalRow.number.value, -1.0, 1.0);
	                    layer.materialVariation.streaks ??= {};
	                    layer.materialVariation.streaks.normal = next;
	                    streakNormalRow.range.value = String(next);
	                    streakNormalRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                exposureToggle.input.addEventListener('change', () => {
	                    layer.materialVariation.exposure ??= {};
	                    layer.materialVariation.exposure.enabled = !!exposureToggle.input.checked;
	                    syncMatVarEnabled();
	                    this._notifySelectedLayersChanged();
	                });

	                exposureStrengthRow.range.addEventListener('input', () => {
	                    const next = clamp(exposureStrengthRow.range.value, 0.0, 2.0);
	                    layer.materialVariation.exposure ??= {};
	                    layer.materialVariation.exposure.strength = next;
	                    exposureStrengthRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                exposureStrengthRow.number.addEventListener('change', () => {
	                    const next = clamp(exposureStrengthRow.number.value, 0.0, 2.0);
	                    layer.materialVariation.exposure ??= {};
	                    layer.materialVariation.exposure.strength = next;
	                    exposureStrengthRow.range.value = String(next);
	                    exposureStrengthRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                exposureExponentRow.range.addEventListener('input', () => {
	                    const next = clamp(exposureExponentRow.range.value, 0.1, 8.0);
	                    layer.materialVariation.exposure ??= {};
	                    layer.materialVariation.exposure.exponent = next;
	                    exposureExponentRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                exposureExponentRow.number.addEventListener('change', () => {
	                    const next = clamp(exposureExponentRow.number.value, 0.1, 8.0);
	                    layer.materialVariation.exposure ??= {};
	                    layer.materialVariation.exposure.exponent = next;
	                    exposureExponentRow.range.value = String(next);
	                    exposureExponentRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                const setExposureDirectionFromUi = () => {
	                    const az = clampInt(exposureAzimuthRow.number.value, 0, 360);
	                    const el = clampInt(exposureElevationRow.number.value, 0, 90);
	                    layer.materialVariation.exposure ??= {};
	                    layer.materialVariation.exposure.direction = azimuthElevationDegreesToDirection(az, el);
	                };
	                exposureAzimuthRow.range.addEventListener('input', () => {
	                    const next = clampInt(exposureAzimuthRow.range.value, 0, 360);
	                    exposureAzimuthRow.number.value = String(next);
	                    setExposureDirectionFromUi();
	                    this._notifySelectedLayersChanged();
	                });
	                exposureAzimuthRow.number.addEventListener('change', () => {
	                    const next = clampInt(exposureAzimuthRow.number.value, 0, 360);
	                    exposureAzimuthRow.range.value = String(next);
	                    exposureAzimuthRow.number.value = String(next);
	                    setExposureDirectionFromUi();
	                    this._notifySelectedLayersChanged();
	                });

	                exposureElevationRow.range.addEventListener('input', () => {
	                    const next = clampInt(exposureElevationRow.range.value, 0, 90);
	                    exposureElevationRow.number.value = String(next);
	                    setExposureDirectionFromUi();
	                    this._notifySelectedLayersChanged();
	                });
	                exposureElevationRow.number.addEventListener('change', () => {
	                    const next = clampInt(exposureElevationRow.number.value, 0, 90);
	                    exposureElevationRow.range.value = String(next);
	                    exposureElevationRow.number.value = String(next);
	                    setExposureDirectionFromUi();
	                    this._notifySelectedLayersChanged();
	                });

	                exposureValueRow.range.addEventListener('input', () => {
	                    const next = clamp(exposureValueRow.range.value, -1.0, 1.0);
	                    layer.materialVariation.exposure ??= {};
	                    layer.materialVariation.exposure.value = next;
	                    exposureValueRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                exposureValueRow.number.addEventListener('change', () => {
	                    const next = clamp(exposureValueRow.number.value, -1.0, 1.0);
	                    layer.materialVariation.exposure ??= {};
	                    layer.materialVariation.exposure.value = next;
	                    exposureValueRow.range.value = String(next);
	                    exposureValueRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                exposureSaturationRow.range.addEventListener('input', () => {
	                    const next = clamp(exposureSaturationRow.range.value, -1.0, 1.0);
	                    layer.materialVariation.exposure ??= {};
	                    layer.materialVariation.exposure.saturation = next;
	                    exposureSaturationRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                exposureSaturationRow.number.addEventListener('change', () => {
	                    const next = clamp(exposureSaturationRow.number.value, -1.0, 1.0);
	                    layer.materialVariation.exposure ??= {};
	                    layer.materialVariation.exposure.saturation = next;
	                    exposureSaturationRow.range.value = String(next);
	                    exposureSaturationRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                exposureRoughnessRow.range.addEventListener('input', () => {
	                    const next = clamp(exposureRoughnessRow.range.value, -1.0, 1.0);
	                    layer.materialVariation.exposure ??= {};
	                    layer.materialVariation.exposure.roughness = next;
	                    exposureRoughnessRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                exposureRoughnessRow.number.addEventListener('change', () => {
	                    const next = clamp(exposureRoughnessRow.number.value, -1.0, 1.0);
	                    layer.materialVariation.exposure ??= {};
	                    layer.materialVariation.exposure.roughness = next;
	                    exposureRoughnessRow.range.value = String(next);
	                    exposureRoughnessRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	
	                edgeToggle.input.addEventListener('change', () => {
	                    layer.materialVariation.wearSide ??= {};
	                    layer.materialVariation.wearSide.enabled = !!edgeToggle.input.checked;
	                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                edgeStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(edgeStrengthRow.range.value, 0.0, 2.0);
                    layer.materialVariation.wearSide ??= {};
                    layer.materialVariation.wearSide.strength = next;
                    edgeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                edgeStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(edgeStrengthRow.number.value, 0.0, 2.0);
                    layer.materialVariation.wearSide ??= {};
                    layer.materialVariation.wearSide.strength = next;
                    edgeStrengthRow.range.value = String(next);
                    edgeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                edgeWidthRow.range.addEventListener('input', () => {
                    const next = clamp(edgeWidthRow.range.value, 0.0, 4.0);
                    layer.materialVariation.wearSide ??= {};
                    layer.materialVariation.wearSide.width = next;
                    edgeWidthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                edgeWidthRow.number.addEventListener('change', () => {
                    const next = clamp(edgeWidthRow.number.value, 0.0, 4.0);
                    layer.materialVariation.wearSide ??= {};
                    layer.materialVariation.wearSide.width = next;
                    edgeWidthRow.range.value = String(next);
                    edgeWidthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                edgeScaleRow.range.addEventListener('input', () => {
                    const next = clamp(edgeScaleRow.range.value, 0.01, 20.0);
                    layer.materialVariation.wearSide ??= {};
                    layer.materialVariation.wearSide.scale = next;
                    edgeScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                edgeScaleRow.number.addEventListener('change', () => {
                    const next = clamp(edgeScaleRow.number.value, 0.01, 20.0);
                    layer.materialVariation.wearSide ??= {};
                    layer.materialVariation.wearSide.scale = next;
                    edgeScaleRow.range.value = String(next);
                    edgeScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                edgeHueRow.range.addEventListener('input', () => {
                    const next = clamp(edgeHueRow.range.value, -180.0, 180.0);
                    layer.materialVariation.wearSide ??= {};
                    layer.materialVariation.wearSide.hueDegrees = next;
                    edgeHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                edgeHueRow.number.addEventListener('change', () => {
                    const next = clamp(edgeHueRow.number.value, -180.0, 180.0);
                    layer.materialVariation.wearSide ??= {};
                    layer.materialVariation.wearSide.hueDegrees = next;
                    edgeHueRow.range.value = String(next);
                    edgeHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                edgeValueRow.range.addEventListener('input', () => {
                    const next = clamp(edgeValueRow.range.value, -1.0, 1.0);
                    layer.materialVariation.wearSide ??= {};
                    layer.materialVariation.wearSide.value = next;
                    edgeValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                edgeValueRow.number.addEventListener('change', () => {
                    const next = clamp(edgeValueRow.number.value, -1.0, 1.0);
                    layer.materialVariation.wearSide ??= {};
                    layer.materialVariation.wearSide.value = next;
                    edgeValueRow.range.value = String(next);
                    edgeValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                edgeSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(edgeSaturationRow.range.value, -1.0, 1.0);
                    layer.materialVariation.wearSide ??= {};
                    layer.materialVariation.wearSide.saturation = next;
                    edgeSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                edgeSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(edgeSaturationRow.number.value, -1.0, 1.0);
                    layer.materialVariation.wearSide ??= {};
                    layer.materialVariation.wearSide.saturation = next;
                    edgeSaturationRow.range.value = String(next);
                    edgeSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                edgeRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(edgeRoughnessRow.range.value, -1.0, 1.0);
                    layer.materialVariation.wearSide ??= {};
                    layer.materialVariation.wearSide.roughness = next;
                    edgeRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                edgeRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(edgeRoughnessRow.number.value, -1.0, 1.0);
                    layer.materialVariation.wearSide ??= {};
                    layer.materialVariation.wearSide.roughness = next;
                    edgeRoughnessRow.range.value = String(next);
                    edgeRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                edgeNormalRow.range.addEventListener('input', () => {
                    const next = clamp(edgeNormalRow.range.value, -1.0, 1.0);
                    layer.materialVariation.wearSide ??= {};
                    layer.materialVariation.wearSide.normal = next;
                    edgeNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                edgeNormalRow.number.addEventListener('change', () => {
                    const next = clamp(edgeNormalRow.number.value, -1.0, 1.0);
                    layer.materialVariation.wearSide ??= {};
                    layer.materialVariation.wearSide.normal = next;
                    edgeNormalRow.range.value = String(next);
                    edgeNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                grimeToggle.input.addEventListener('change', () => {
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.enabled = !!grimeToggle.input.checked;
                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                grimeStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(grimeStrengthRow.range.value, 0.0, 2.0);
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.strength = next;
                    grimeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                grimeStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(grimeStrengthRow.number.value, 0.0, 2.0);
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.strength = next;
                    grimeStrengthRow.range.value = String(next);
                    grimeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                grimeWidthRow.range.addEventListener('input', () => {
                    const next = clamp(grimeWidthRow.range.value, 0.0, 1.0);
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.width = next;
                    grimeWidthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                grimeWidthRow.number.addEventListener('change', () => {
                    const next = clamp(grimeWidthRow.number.value, 0.0, 1.0);
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.width = next;
                    grimeWidthRow.range.value = String(next);
                    grimeWidthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                grimeScaleRow.range.addEventListener('input', () => {
                    const next = clamp(grimeScaleRow.range.value, 0.01, 20.0);
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.scale = next;
                    grimeScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                grimeScaleRow.number.addEventListener('change', () => {
                    const next = clamp(grimeScaleRow.number.value, 0.01, 20.0);
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.scale = next;
                    grimeScaleRow.range.value = String(next);
                    grimeScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                grimeHueRow.range.addEventListener('input', () => {
                    const next = clamp(grimeHueRow.range.value, -180.0, 180.0);
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.hueDegrees = next;
                    grimeHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                grimeHueRow.number.addEventListener('change', () => {
                    const next = clamp(grimeHueRow.number.value, -180.0, 180.0);
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.hueDegrees = next;
                    grimeHueRow.range.value = String(next);
                    grimeHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                grimeValueRow.range.addEventListener('input', () => {
                    const next = clamp(grimeValueRow.range.value, -1.0, 1.0);
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.value = next;
                    grimeValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                grimeValueRow.number.addEventListener('change', () => {
                    const next = clamp(grimeValueRow.number.value, -1.0, 1.0);
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.value = next;
                    grimeValueRow.range.value = String(next);
                    grimeValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                grimeSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(grimeSaturationRow.range.value, -1.0, 1.0);
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.saturation = next;
                    grimeSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                grimeSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(grimeSaturationRow.number.value, -1.0, 1.0);
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.saturation = next;
                    grimeSaturationRow.range.value = String(next);
                    grimeSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                grimeRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(grimeRoughnessRow.range.value, -1.0, 1.0);
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.roughness = next;
                    grimeRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                grimeRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(grimeRoughnessRow.number.value, -1.0, 1.0);
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.roughness = next;
                    grimeRoughnessRow.range.value = String(next);
                    grimeRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                grimeNormalRow.range.addEventListener('input', () => {
                    const next = clamp(grimeNormalRow.range.value, -1.0, 1.0);
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.normal = next;
                    grimeNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                grimeNormalRow.number.addEventListener('change', () => {
                    const next = clamp(grimeNormalRow.number.value, -1.0, 1.0);
                    layer.materialVariation.wearBottom ??= {};
                    layer.materialVariation.wearBottom.normal = next;
                    grimeNormalRow.range.value = String(next);
                    grimeNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                dustToggle.input.addEventListener('change', () => {
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.enabled = !!dustToggle.input.checked;
                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                dustStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(dustStrengthRow.range.value, 0.0, 2.0);
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.strength = next;
                    dustStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                dustStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(dustStrengthRow.number.value, 0.0, 2.0);
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.strength = next;
                    dustStrengthRow.range.value = String(next);
                    dustStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                dustWidthRow.range.addEventListener('input', () => {
                    const next = clamp(dustWidthRow.range.value, 0.0, 1.0);
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.width = next;
                    dustWidthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                dustWidthRow.number.addEventListener('change', () => {
                    const next = clamp(dustWidthRow.number.value, 0.0, 1.0);
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.width = next;
                    dustWidthRow.range.value = String(next);
                    dustWidthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                dustScaleRow.range.addEventListener('input', () => {
                    const next = clamp(dustScaleRow.range.value, 0.01, 20.0);
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.scale = next;
                    dustScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                dustScaleRow.number.addEventListener('change', () => {
                    const next = clamp(dustScaleRow.number.value, 0.01, 20.0);
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.scale = next;
                    dustScaleRow.range.value = String(next);
                    dustScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                dustHueRow.range.addEventListener('input', () => {
                    const next = clamp(dustHueRow.range.value, -180.0, 180.0);
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.hueDegrees = next;
                    dustHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                dustHueRow.number.addEventListener('change', () => {
                    const next = clamp(dustHueRow.number.value, -180.0, 180.0);
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.hueDegrees = next;
                    dustHueRow.range.value = String(next);
                    dustHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                dustValueRow.range.addEventListener('input', () => {
                    const next = clamp(dustValueRow.range.value, -1.0, 1.0);
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.value = next;
                    dustValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                dustValueRow.number.addEventListener('change', () => {
                    const next = clamp(dustValueRow.number.value, -1.0, 1.0);
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.value = next;
                    dustValueRow.range.value = String(next);
                    dustValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                dustSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(dustSaturationRow.range.value, -1.0, 1.0);
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.saturation = next;
                    dustSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                dustSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(dustSaturationRow.number.value, -1.0, 1.0);
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.saturation = next;
                    dustSaturationRow.range.value = String(next);
                    dustSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                dustRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(dustRoughnessRow.range.value, -1.0, 1.0);
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.roughness = next;
                    dustRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                dustRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(dustRoughnessRow.number.value, -1.0, 1.0);
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.roughness = next;
                    dustRoughnessRow.range.value = String(next);
                    dustRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                dustNormalRow.range.addEventListener('input', () => {
                    const next = clamp(dustNormalRow.range.value, -1.0, 1.0);
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.normal = next;
                    dustNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                dustNormalRow.number.addEventListener('change', () => {
                    const next = clamp(dustNormalRow.number.value, -1.0, 1.0);
                    layer.materialVariation.wearTop ??= {};
                    layer.materialVariation.wearTop.normal = next;
                    dustNormalRow.range.value = String(next);
                    dustNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

	                bricksPerTileXRow.range.addEventListener('input', () => {
	                    const next = clamp(bricksPerTileXRow.range.value, 0.25, 200.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.bricksPerTileX = next;
	                    bricksPerTileXRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                bricksPerTileXRow.number.addEventListener('change', () => {
	                    const next = clamp(bricksPerTileXRow.number.value, 0.25, 200.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.bricksPerTileX = next;
	                    bricksPerTileXRow.range.value = String(next);
	                    bricksPerTileXRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                bricksPerTileYRow.range.addEventListener('input', () => {
	                    const next = clamp(bricksPerTileYRow.range.value, 0.25, 200.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.bricksPerTileY = next;
	                    bricksPerTileYRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                bricksPerTileYRow.number.addEventListener('change', () => {
	                    const next = clamp(bricksPerTileYRow.number.value, 0.25, 200.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.bricksPerTileY = next;
	                    bricksPerTileYRow.range.value = String(next);
	                    bricksPerTileYRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                mortarWidthRow.range.addEventListener('input', () => {
	                    const next = clamp(mortarWidthRow.range.value, 0.0, 0.49);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.mortarWidth = next;
	                    mortarWidthRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                mortarWidthRow.number.addEventListener('change', () => {
	                    const next = clamp(mortarWidthRow.number.value, 0.0, 0.49);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.mortarWidth = next;
	                    mortarWidthRow.range.value = String(next);
	                    mortarWidthRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                brickOffsetXRow.range.addEventListener('input', () => {
	                    const next = clamp(brickOffsetXRow.range.value, -10.0, 10.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.offsetX = next;
	                    brickOffsetXRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                brickOffsetXRow.number.addEventListener('change', () => {
	                    const next = clamp(brickOffsetXRow.number.value, -10.0, 10.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.offsetX = next;
	                    brickOffsetXRow.range.value = String(next);
	                    brickOffsetXRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                brickOffsetYRow.range.addEventListener('input', () => {
	                    const next = clamp(brickOffsetYRow.range.value, -10.0, 10.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.offsetY = next;
	                    brickOffsetYRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                brickOffsetYRow.number.addEventListener('change', () => {
	                    const next = clamp(brickOffsetYRow.number.value, -10.0, 10.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.offsetY = next;
	                    brickOffsetYRow.range.value = String(next);
	                    brickOffsetYRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	
	                stairToggle.input.addEventListener('change', () => {
	                    layer.materialVariation.stairShift ??= {};
	                    layer.materialVariation.stairShift.enabled = !!stairToggle.input.checked;
	                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                stairStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(stairStrengthRow.range.value, 0.0, 1.0);
                    layer.materialVariation.stairShift ??= {};
                    layer.materialVariation.stairShift.strength = next;
                    stairStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                stairStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(stairStrengthRow.number.value, 0.0, 1.0);
                    layer.materialVariation.stairShift ??= {};
                    layer.materialVariation.stairShift.strength = next;
                    stairStrengthRow.range.value = String(next);
                    stairStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                stairStepRow.range.addEventListener('input', () => {
                    const next = clamp(stairStepRow.range.value, 0.01, 20.0);
                    layer.materialVariation.stairShift ??= {};
                    layer.materialVariation.stairShift.stepSize = next;
                    stairStepRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                stairStepRow.number.addEventListener('change', () => {
                    const next = clamp(stairStepRow.number.value, 0.01, 20.0);
                    layer.materialVariation.stairShift ??= {};
                    layer.materialVariation.stairShift.stepSize = next;
                    stairStepRow.range.value = String(next);
                    stairStepRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                stairShiftRow.range.addEventListener('input', () => {
                    const next = clamp(stairShiftRow.range.value, -1.0, 1.0);
                    layer.materialVariation.stairShift ??= {};
                    layer.materialVariation.stairShift.shift = next;
                    stairShiftRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                stairShiftRow.number.addEventListener('change', () => {
                    const next = clamp(stairShiftRow.number.value, -1.0, 1.0);
                    layer.materialVariation.stairShift ??= {};
                    layer.materialVariation.stairShift.shift = next;
                    stairShiftRow.range.value = String(next);
                    stairShiftRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
	                stairModeSelect.addEventListener('change', () => {
	                    layer.materialVariation.stairShift ??= {};
	                    const v = stairModeSelect.value;
	                    layer.materialVariation.stairShift.mode =
	                        v === 'random' ? 'random' : (v === 'alternate' ? 'alternate' : (v === 'pattern3' ? 'pattern3' : 'stair'));
	                    syncMatVarEnabled();
	                    this._notifySelectedLayersChanged();
	                });

	                stairPatternARow.range.addEventListener('input', () => {
	                    const next = clamp(stairPatternARow.range.value, -1.0, 1.0);
	                    layer.materialVariation.stairShift ??= {};
	                    layer.materialVariation.stairShift.patternA = next;
	                    stairPatternARow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                stairPatternARow.number.addEventListener('change', () => {
	                    const next = clamp(stairPatternARow.number.value, -1.0, 1.0);
	                    layer.materialVariation.stairShift ??= {};
	                    layer.materialVariation.stairShift.patternA = next;
	                    stairPatternARow.range.value = String(next);
	                    stairPatternARow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                stairPatternBRow.range.addEventListener('input', () => {
	                    const next = clamp(stairPatternBRow.range.value, -1.0, 1.0);
	                    layer.materialVariation.stairShift ??= {};
	                    layer.materialVariation.stairShift.patternB = next;
	                    stairPatternBRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                stairPatternBRow.number.addEventListener('change', () => {
	                    const next = clamp(stairPatternBRow.number.value, -1.0, 1.0);
	                    layer.materialVariation.stairShift ??= {};
	                    layer.materialVariation.stairShift.patternB = next;
	                    stairPatternBRow.range.value = String(next);
	                    stairPatternBRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
                stairBlendRow.range.addEventListener('input', () => {
                    const next = clamp(stairBlendRow.range.value, 0.0, 0.49);
                    layer.materialVariation.stairShift ??= {};
                    layer.materialVariation.stairShift.blendWidth = next;
                    stairBlendRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                stairBlendRow.number.addEventListener('change', () => {
                    const next = clamp(stairBlendRow.number.value, 0.0, 0.49);
                    layer.materialVariation.stairShift ??= {};
                    layer.materialVariation.stairShift.blendWidth = next;
                    stairBlendRow.range.value = String(next);
                    stairBlendRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
	                stairDirSelect.addEventListener('change', () => {
	                    layer.materialVariation.stairShift ??= {};
	                    layer.materialVariation.stairShift.direction = stairDirSelect.value === 'vertical' ? 'vertical' : 'horizontal';
	                    this._notifySelectedLayersChanged();
	                });

	                perBrickToggle.input.addEventListener('change', () => {
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.perBrick ??= {};
	                    layer.materialVariation.brick.perBrick.enabled = !!perBrickToggle.input.checked;
	                    syncMatVarEnabled();
	                    this._notifySelectedLayersChanged();
	                });

	                perBrickStrengthRow.range.addEventListener('input', () => {
	                    const next = clamp(perBrickStrengthRow.range.value, 0.0, 2.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.perBrick ??= {};
	                    layer.materialVariation.brick.perBrick.strength = next;
	                    perBrickStrengthRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                perBrickStrengthRow.number.addEventListener('change', () => {
	                    const next = clamp(perBrickStrengthRow.number.value, 0.0, 2.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.perBrick ??= {};
	                    layer.materialVariation.brick.perBrick.strength = next;
	                    perBrickStrengthRow.range.value = String(next);
	                    perBrickStrengthRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                perBrickHueRow.range.addEventListener('input', () => {
	                    const next = clamp(perBrickHueRow.range.value, -180.0, 180.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.perBrick ??= {};
	                    layer.materialVariation.brick.perBrick.hueDegrees = next;
	                    perBrickHueRow.number.value = String(Math.round(next));
	                    this._notifySelectedLayersChanged();
	                });
	                perBrickHueRow.number.addEventListener('change', () => {
	                    const next = clamp(perBrickHueRow.number.value, -180.0, 180.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.perBrick ??= {};
	                    layer.materialVariation.brick.perBrick.hueDegrees = next;
	                    perBrickHueRow.range.value = String(next);
	                    perBrickHueRow.number.value = String(Math.round(next));
	                    this._notifySelectedLayersChanged();
	                });

	                perBrickValueRow.range.addEventListener('input', () => {
	                    const next = clamp(perBrickValueRow.range.value, -1.0, 1.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.perBrick ??= {};
	                    layer.materialVariation.brick.perBrick.value = next;
	                    perBrickValueRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                perBrickValueRow.number.addEventListener('change', () => {
	                    const next = clamp(perBrickValueRow.number.value, -1.0, 1.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.perBrick ??= {};
	                    layer.materialVariation.brick.perBrick.value = next;
	                    perBrickValueRow.range.value = String(next);
	                    perBrickValueRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                perBrickSaturationRow.range.addEventListener('input', () => {
	                    const next = clamp(perBrickSaturationRow.range.value, -1.0, 1.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.perBrick ??= {};
	                    layer.materialVariation.brick.perBrick.saturation = next;
	                    perBrickSaturationRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                perBrickSaturationRow.number.addEventListener('change', () => {
	                    const next = clamp(perBrickSaturationRow.number.value, -1.0, 1.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.perBrick ??= {};
	                    layer.materialVariation.brick.perBrick.saturation = next;
	                    perBrickSaturationRow.range.value = String(next);
	                    perBrickSaturationRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                perBrickRoughnessRow.range.addEventListener('input', () => {
	                    const next = clamp(perBrickRoughnessRow.range.value, -1.0, 1.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.perBrick ??= {};
	                    layer.materialVariation.brick.perBrick.roughness = next;
	                    perBrickRoughnessRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                perBrickRoughnessRow.number.addEventListener('change', () => {
	                    const next = clamp(perBrickRoughnessRow.number.value, -1.0, 1.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.perBrick ??= {};
	                    layer.materialVariation.brick.perBrick.roughness = next;
	                    perBrickRoughnessRow.range.value = String(next);
	                    perBrickRoughnessRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                perBrickNormalRow.range.addEventListener('input', () => {
	                    const next = clamp(perBrickNormalRow.range.value, -1.0, 1.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.perBrick ??= {};
	                    layer.materialVariation.brick.perBrick.normal = next;
	                    perBrickNormalRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                perBrickNormalRow.number.addEventListener('change', () => {
	                    const next = clamp(perBrickNormalRow.number.value, -1.0, 1.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.perBrick ??= {};
	                    layer.materialVariation.brick.perBrick.normal = next;
	                    perBrickNormalRow.range.value = String(next);
	                    perBrickNormalRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                mortarToggle.input.addEventListener('change', () => {
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.mortar ??= {};
	                    layer.materialVariation.brick.mortar.enabled = !!mortarToggle.input.checked;
	                    syncMatVarEnabled();
	                    this._notifySelectedLayersChanged();
	                });

	                mortarStrengthRow.range.addEventListener('input', () => {
	                    const next = clamp(mortarStrengthRow.range.value, 0.0, 2.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.mortar ??= {};
	                    layer.materialVariation.brick.mortar.strength = next;
	                    mortarStrengthRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                mortarStrengthRow.number.addEventListener('change', () => {
	                    const next = clamp(mortarStrengthRow.number.value, 0.0, 2.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.mortar ??= {};
	                    layer.materialVariation.brick.mortar.strength = next;
	                    mortarStrengthRow.range.value = String(next);
	                    mortarStrengthRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                mortarHueRow.range.addEventListener('input', () => {
	                    const next = clamp(mortarHueRow.range.value, -180.0, 180.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.mortar ??= {};
	                    layer.materialVariation.brick.mortar.hueDegrees = next;
	                    mortarHueRow.number.value = String(Math.round(next));
	                    this._notifySelectedLayersChanged();
	                });
	                mortarHueRow.number.addEventListener('change', () => {
	                    const next = clamp(mortarHueRow.number.value, -180.0, 180.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.mortar ??= {};
	                    layer.materialVariation.brick.mortar.hueDegrees = next;
	                    mortarHueRow.range.value = String(next);
	                    mortarHueRow.number.value = String(Math.round(next));
	                    this._notifySelectedLayersChanged();
	                });

	                mortarValueRow.range.addEventListener('input', () => {
	                    const next = clamp(mortarValueRow.range.value, -1.0, 1.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.mortar ??= {};
	                    layer.materialVariation.brick.mortar.value = next;
	                    mortarValueRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                mortarValueRow.number.addEventListener('change', () => {
	                    const next = clamp(mortarValueRow.number.value, -1.0, 1.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.mortar ??= {};
	                    layer.materialVariation.brick.mortar.value = next;
	                    mortarValueRow.range.value = String(next);
	                    mortarValueRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                mortarSaturationRow.range.addEventListener('input', () => {
	                    const next = clamp(mortarSaturationRow.range.value, -1.0, 1.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.mortar ??= {};
	                    layer.materialVariation.brick.mortar.saturation = next;
	                    mortarSaturationRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                mortarSaturationRow.number.addEventListener('change', () => {
	                    const next = clamp(mortarSaturationRow.number.value, -1.0, 1.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.mortar ??= {};
	                    layer.materialVariation.brick.mortar.saturation = next;
	                    mortarSaturationRow.range.value = String(next);
	                    mortarSaturationRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                mortarRoughnessRow.range.addEventListener('input', () => {
	                    const next = clamp(mortarRoughnessRow.range.value, -1.0, 1.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.mortar ??= {};
	                    layer.materialVariation.brick.mortar.roughness = next;
	                    mortarRoughnessRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                mortarRoughnessRow.number.addEventListener('change', () => {
	                    const next = clamp(mortarRoughnessRow.number.value, -1.0, 1.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.mortar ??= {};
	                    layer.materialVariation.brick.mortar.roughness = next;
	                    mortarRoughnessRow.range.value = String(next);
	                    mortarRoughnessRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                mortarNormalRow.range.addEventListener('input', () => {
	                    const next = clamp(mortarNormalRow.range.value, -1.0, 1.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.mortar ??= {};
	                    layer.materialVariation.brick.mortar.normal = next;
	                    mortarNormalRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                mortarNormalRow.number.addEventListener('change', () => {
	                    const next = clamp(mortarNormalRow.number.value, -1.0, 1.0);
	                    layer.materialVariation.brick ??= {};
	                    layer.materialVariation.brick.mortar ??= {};
	                    layer.materialVariation.brick.mortar.normal = next;
	                    mortarNormalRow.range.value = String(next);
	                    mortarNormalRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	
	                detailToggle.input.addEventListener('change', () => {
	                    layer.materialVariation.macroLayers ??= [];
	                    layer.materialVariation.macroLayers[1] ??= {};
                    layer.materialVariation.macroLayers[1].enabled = !!detailToggle.input.checked;
                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                detailStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(detailStrengthRow.range.value, 0.0, 2.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[1] ??= {};
                    layer.materialVariation.macroLayers[1].intensity = next;
                    detailStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                detailStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(detailStrengthRow.number.value, 0.0, 2.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[1] ??= {};
                    layer.materialVariation.macroLayers[1].intensity = next;
                    detailStrengthRow.range.value = String(next);
                    detailStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                detailScaleRow.range.addEventListener('input', () => {
                    const next = clamp(detailScaleRow.range.value, 0.01, 20.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[1] ??= {};
                    layer.materialVariation.macroLayers[1].scale = next;
                    detailScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                detailScaleRow.number.addEventListener('change', () => {
                    const next = clamp(detailScaleRow.number.value, 0.01, 20.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[1] ??= {};
                    layer.materialVariation.macroLayers[1].scale = next;
                    detailScaleRow.range.value = String(next);
                    detailScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                detailHueRow.range.addEventListener('input', () => {
                    const next = clamp(detailHueRow.range.value, -180.0, 180.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[1] ??= {};
                    layer.materialVariation.macroLayers[1].hueDegrees = next;
                    detailHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                detailHueRow.number.addEventListener('change', () => {
                    const next = clamp(detailHueRow.number.value, -180.0, 180.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[1] ??= {};
                    layer.materialVariation.macroLayers[1].hueDegrees = next;
                    detailHueRow.range.value = String(next);
                    detailHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                detailValueRow.range.addEventListener('input', () => {
                    const next = clamp(detailValueRow.range.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[1] ??= {};
                    layer.materialVariation.macroLayers[1].value = next;
                    detailValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                detailValueRow.number.addEventListener('change', () => {
                    const next = clamp(detailValueRow.number.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[1] ??= {};
                    layer.materialVariation.macroLayers[1].value = next;
                    detailValueRow.range.value = String(next);
                    detailValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                detailSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(detailSaturationRow.range.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[1] ??= {};
                    layer.materialVariation.macroLayers[1].saturation = next;
                    detailSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                detailSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(detailSaturationRow.number.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[1] ??= {};
                    layer.materialVariation.macroLayers[1].saturation = next;
                    detailSaturationRow.range.value = String(next);
                    detailSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                detailRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(detailRoughnessRow.range.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[1] ??= {};
                    layer.materialVariation.macroLayers[1].roughness = next;
                    detailRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                detailRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(detailRoughnessRow.number.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[1] ??= {};
                    layer.materialVariation.macroLayers[1].roughness = next;
                    detailRoughnessRow.range.value = String(next);
                    detailRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                detailNormalRow.range.addEventListener('input', () => {
                    const next = clamp(detailNormalRow.range.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[1] ??= {};
                    layer.materialVariation.macroLayers[1].normal = next;
                    detailNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                detailNormalRow.number.addEventListener('change', () => {
                    const next = clamp(detailNormalRow.number.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[1] ??= {};
                    layer.materialVariation.macroLayers[1].normal = next;
                    detailNormalRow.range.value = String(next);
                    detailNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                macro2Toggle.input.addEventListener('change', () => {
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[2] ??= {};
                    layer.materialVariation.macroLayers[2].enabled = !!macro2Toggle.input.checked;
                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });

                macro2StrengthRow.range.addEventListener('input', () => {
                    const next = clamp(macro2StrengthRow.range.value, 0.0, 2.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[2] ??= {};
                    layer.materialVariation.macroLayers[2].intensity = next;
                    macro2StrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                macro2StrengthRow.number.addEventListener('change', () => {
                    const next = clamp(macro2StrengthRow.number.value, 0.0, 2.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[2] ??= {};
                    layer.materialVariation.macroLayers[2].intensity = next;
                    macro2StrengthRow.range.value = String(next);
                    macro2StrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                macro2ScaleRow.range.addEventListener('input', () => {
                    const next = clamp(macro2ScaleRow.range.value, 0.01, 20.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[2] ??= {};
                    layer.materialVariation.macroLayers[2].scale = next;
                    macro2ScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                macro2ScaleRow.number.addEventListener('change', () => {
                    const next = clamp(macro2ScaleRow.number.value, 0.01, 20.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[2] ??= {};
                    layer.materialVariation.macroLayers[2].scale = next;
                    macro2ScaleRow.range.value = String(next);
                    macro2ScaleRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                macro2CoverageRow.range.addEventListener('input', () => {
	                    const next = clamp(macro2CoverageRow.range.value, 0.0, 1.0);
	                    layer.materialVariation.macroLayers ??= [];
	                    layer.materialVariation.macroLayers[2] ??= {};
	                    layer.materialVariation.macroLayers[2].coverage = next;
	                    macro2CoverageRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                macro2CoverageRow.number.addEventListener('change', () => {
	                    const next = clamp(macro2CoverageRow.number.value, 0.0, 1.0);
	                    layer.materialVariation.macroLayers ??= [];
	                    layer.materialVariation.macroLayers[2] ??= {};
	                    layer.materialVariation.macroLayers[2].coverage = next;
	                    macro2CoverageRow.range.value = String(next);
	                    macro2CoverageRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                macro2HueRow.range.addEventListener('input', () => {
	                    const next = clamp(macro2HueRow.range.value, -180.0, 180.0);
	                    layer.materialVariation.macroLayers ??= [];
	                    layer.materialVariation.macroLayers[2] ??= {};
                    layer.materialVariation.macroLayers[2].hueDegrees = next;
                    macro2HueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                macro2HueRow.number.addEventListener('change', () => {
                    const next = clamp(macro2HueRow.number.value, -180.0, 180.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[2] ??= {};
                    layer.materialVariation.macroLayers[2].hueDegrees = next;
                    macro2HueRow.range.value = String(next);
                    macro2HueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                macro2ValueRow.range.addEventListener('input', () => {
                    const next = clamp(macro2ValueRow.range.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[2] ??= {};
                    layer.materialVariation.macroLayers[2].value = next;
                    macro2ValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                macro2ValueRow.number.addEventListener('change', () => {
                    const next = clamp(macro2ValueRow.number.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[2] ??= {};
                    layer.materialVariation.macroLayers[2].value = next;
                    macro2ValueRow.range.value = String(next);
                    macro2ValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                macro2SaturationRow.range.addEventListener('input', () => {
                    const next = clamp(macro2SaturationRow.range.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[2] ??= {};
                    layer.materialVariation.macroLayers[2].saturation = next;
                    macro2SaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                macro2SaturationRow.number.addEventListener('change', () => {
                    const next = clamp(macro2SaturationRow.number.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[2] ??= {};
                    layer.materialVariation.macroLayers[2].saturation = next;
                    macro2SaturationRow.range.value = String(next);
                    macro2SaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                macro2RoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(macro2RoughnessRow.range.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[2] ??= {};
                    layer.materialVariation.macroLayers[2].roughness = next;
                    macro2RoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                macro2RoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(macro2RoughnessRow.number.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[2] ??= {};
                    layer.materialVariation.macroLayers[2].roughness = next;
                    macro2RoughnessRow.range.value = String(next);
                    macro2RoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                macro2NormalRow.range.addEventListener('input', () => {
                    const next = clamp(macro2NormalRow.range.value, -1.0, 1.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[2] ??= {};
                    layer.materialVariation.macroLayers[2].normal = next;
                    macro2NormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
	                macro2NormalRow.number.addEventListener('change', () => {
	                    const next = clamp(macro2NormalRow.number.value, -1.0, 1.0);
	                    layer.materialVariation.macroLayers ??= [];
	                    layer.materialVariation.macroLayers[2] ??= {};
	                    layer.materialVariation.macroLayers[2].normal = next;
	                    macro2NormalRow.range.value = String(next);
	                    macro2NormalRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                microToggle.input.addEventListener('change', () => {
	                    layer.materialVariation.macroLayers ??= [];
	                    layer.materialVariation.macroLayers[3] ??= {};
	                    layer.materialVariation.macroLayers[3].enabled = !!microToggle.input.checked;
	                    syncMatVarEnabled();
	                    this._notifySelectedLayersChanged();
	                });
	                microIntensityRow.range.addEventListener('input', () => {
	                    const next = clamp(microIntensityRow.range.value, 0.0, 2.0);
	                    layer.materialVariation.macroLayers ??= [];
	                    layer.materialVariation.macroLayers[3] ??= {};
	                    layer.materialVariation.macroLayers[3].intensity = next;
	                    microIntensityRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                microIntensityRow.number.addEventListener('change', () => {
	                    const next = clamp(microIntensityRow.number.value, 0.0, 2.0);
	                    layer.materialVariation.macroLayers ??= [];
	                    layer.materialVariation.macroLayers[3] ??= {};
	                    layer.materialVariation.macroLayers[3].intensity = next;
	                    microIntensityRow.range.value = String(next);
	                    microIntensityRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

                microScaleRow.range.addEventListener('input', () => {
                    const next = clamp(microScaleRow.range.value, 0.01, 20.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[3] ??= {};
                    layer.materialVariation.macroLayers[3].scale = next;
                    microScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                microScaleRow.number.addEventListener('change', () => {
                    const next = clamp(microScaleRow.number.value, 0.01, 20.0);
                    layer.materialVariation.macroLayers ??= [];
                    layer.materialVariation.macroLayers[3] ??= {};
                    layer.materialVariation.macroLayers[3].scale = next;
                    microScaleRow.range.value = String(next);
                    microScaleRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                microRoughnessRow.range.addEventListener('input', () => {
	                    const next = clamp(microRoughnessRow.range.value, -1.0, 1.0);
	                    layer.materialVariation.macroLayers ??= [];
	                    layer.materialVariation.macroLayers[3] ??= {};
	                    layer.materialVariation.macroLayers[3].roughness = next;
	                    microRoughnessRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                microRoughnessRow.number.addEventListener('change', () => {
	                    const next = clamp(microRoughnessRow.number.value, -1.0, 1.0);
	                    layer.materialVariation.macroLayers ??= [];
	                    layer.materialVariation.macroLayers[3] ??= {};
	                    layer.materialVariation.macroLayers[3].roughness = next;
	                    microRoughnessRow.range.value = String(next);
	                    microRoughnessRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                microNormalRow.range.addEventListener('input', () => {
	                    const next = clamp(microNormalRow.range.value, -1.0, 1.0);
	                    layer.materialVariation.macroLayers ??= [];
	                    layer.materialVariation.macroLayers[3] ??= {};
	                    layer.materialVariation.macroLayers[3].normal = next;
	                    microNormalRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                microNormalRow.number.addEventListener('change', () => {
	                    const next = clamp(microNormalRow.number.value, -1.0, 1.0);
	                    layer.materialVariation.macroLayers ??= [];
	                    layer.materialVariation.macroLayers[3] ??= {};
	                    layer.materialVariation.macroLayers[3].normal = next;
	                    microNormalRow.range.value = String(next);
	                    microNormalRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	
	                cracksToggle.input.addEventListener('change', () => {
	                    layer.materialVariation.cracksLayer ??= {};
	                    layer.materialVariation.cracksLayer.enabled = !!cracksToggle.input.checked;
	                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                crackStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(crackStrengthRow.range.value, 0.0, 2.0);
                    layer.materialVariation.cracksLayer ??= {};
                    layer.materialVariation.cracksLayer.strength = next;
                    crackStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                crackStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(crackStrengthRow.number.value, 0.0, 2.0);
                    layer.materialVariation.cracksLayer ??= {};
                    layer.materialVariation.cracksLayer.strength = next;
                    crackStrengthRow.range.value = String(next);
                    crackStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                crackScaleRow.range.addEventListener('input', () => {
                    const next = clamp(crackScaleRow.range.value, 0.01, 20.0);
                    layer.materialVariation.cracksLayer ??= {};
                    layer.materialVariation.cracksLayer.scale = next;
                    crackScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                crackScaleRow.number.addEventListener('change', () => {
                    const next = clamp(crackScaleRow.number.value, 0.01, 20.0);
                    layer.materialVariation.cracksLayer ??= {};
                    layer.materialVariation.cracksLayer.scale = next;
                    crackScaleRow.range.value = String(next);
                    crackScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                crackHueRow.range.addEventListener('input', () => {
                    const next = clamp(crackHueRow.range.value, -180.0, 180.0);
                    layer.materialVariation.cracksLayer ??= {};
                    layer.materialVariation.cracksLayer.hueDegrees = next;
                    crackHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                crackHueRow.number.addEventListener('change', () => {
                    const next = clamp(crackHueRow.number.value, -180.0, 180.0);
                    layer.materialVariation.cracksLayer ??= {};
                    layer.materialVariation.cracksLayer.hueDegrees = next;
                    crackHueRow.range.value = String(next);
                    crackHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                crackValueRow.range.addEventListener('input', () => {
                    const next = clamp(crackValueRow.range.value, -1.0, 1.0);
                    layer.materialVariation.cracksLayer ??= {};
                    layer.materialVariation.cracksLayer.value = next;
                    crackValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                crackValueRow.number.addEventListener('change', () => {
                    const next = clamp(crackValueRow.number.value, -1.0, 1.0);
                    layer.materialVariation.cracksLayer ??= {};
                    layer.materialVariation.cracksLayer.value = next;
                    crackValueRow.range.value = String(next);
                    crackValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                crackSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(crackSaturationRow.range.value, -1.0, 1.0);
                    layer.materialVariation.cracksLayer ??= {};
                    layer.materialVariation.cracksLayer.saturation = next;
                    crackSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                crackSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(crackSaturationRow.number.value, -1.0, 1.0);
                    layer.materialVariation.cracksLayer ??= {};
                    layer.materialVariation.cracksLayer.saturation = next;
                    crackSaturationRow.range.value = String(next);
                    crackSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                crackRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(crackRoughnessRow.range.value, -1.0, 1.0);
                    layer.materialVariation.cracksLayer ??= {};
                    layer.materialVariation.cracksLayer.roughness = next;
                    crackRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                crackRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(crackRoughnessRow.number.value, -1.0, 1.0);
                    layer.materialVariation.cracksLayer ??= {};
                    layer.materialVariation.cracksLayer.roughness = next;
                    crackRoughnessRow.range.value = String(next);
                    crackRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                crackNormalRow.range.addEventListener('input', () => {
                    const next = clamp(crackNormalRow.range.value, -1.0, 1.0);
                    layer.materialVariation.cracksLayer ??= {};
                    layer.materialVariation.cracksLayer.normal = next;
                    crackNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                crackNormalRow.number.addEventListener('change', () => {
                    const next = clamp(crackNormalRow.number.value, -1.0, 1.0);
                    layer.materialVariation.cracksLayer ??= {};
                    layer.materialVariation.cracksLayer.normal = next;
                    crackNormalRow.range.value = String(next);
                    crackNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                syncMatVarEnabled();
                wallMatVarBasicsGroup.body.appendChild(document.createElement('div')).className = 'building-fab-hint';
                wallMatVarBasicsGroup.body.lastChild.textContent = 'Enable the variation system to add weathering and breakup.';
                wallsGroup.body.appendChild(wallMatVarGroup.details);

                const beltGroup = makeDetailsSection('Belt', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:belt` });
                const beltToggle = makeToggleRow('Enable belt');
                beltToggle.input.checked = !!layer?.belt?.enabled;
                beltToggle.input.disabled = !allow;
                beltToggle.input.addEventListener('change', () => {
                    layer.belt.enabled = !!beltToggle.input.checked;
                    beltHeightRow.range.disabled = !allow || !layer.belt.enabled;
                    beltHeightRow.number.disabled = !allow || !layer.belt.enabled;
                    beltExtrudeRow.range.disabled = !allow || !layer.belt.enabled;
                    beltExtrudeRow.number.disabled = !allow || !layer.belt.enabled;
                    beltMaterialPicker.button.disabled = !allow || !layer.belt.enabled;
                    this._notifySelectedLayersChanged();
                });
                beltGroup.body.appendChild(beltToggle.toggle);

                const beltHeightRow = makeRangeRow('Belt height (m)');
                beltHeightRow.range.min = '0.02';
                beltHeightRow.range.max = '1.2';
                beltHeightRow.range.step = '0.01';
                beltHeightRow.number.min = '0.02';
                beltHeightRow.number.max = '1.2';
                beltHeightRow.number.step = '0.01';
                beltHeightRow.range.value = String(layer?.belt?.height ?? 0.18);
                beltHeightRow.number.value = formatFloat(layer?.belt?.height ?? 0.18, 2);
                beltHeightRow.range.disabled = !allow || !layer?.belt?.enabled;
                beltHeightRow.number.disabled = !allow || !layer?.belt?.enabled;
                beltHeightRow.range.addEventListener('input', () => {
                    const next = clamp(beltHeightRow.range.value, 0.02, 1.2);
                    layer.belt.height = next;
                    beltHeightRow.range.value = String(next);
                    beltHeightRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                beltHeightRow.number.addEventListener('change', () => {
                    const next = clamp(beltHeightRow.number.value, 0.02, 1.2);
                    layer.belt.height = next;
                    beltHeightRow.range.value = String(next);
                    beltHeightRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                beltGroup.body.appendChild(beltHeightRow.row);

                const beltExtrudeRow = makeRangeRow('Belt extrusion (m)');
                beltExtrudeRow.range.min = '0';
                beltExtrudeRow.range.max = '4';
                beltExtrudeRow.range.step = '0.01';
                beltExtrudeRow.number.min = '0';
                beltExtrudeRow.number.max = '4';
                beltExtrudeRow.number.step = '0.01';
                beltExtrudeRow.range.value = String(layer?.belt?.extrusion ?? 0);
                beltExtrudeRow.number.value = formatFloat(layer?.belt?.extrusion ?? 0, 2);
                beltExtrudeRow.range.disabled = !allow || !layer?.belt?.enabled;
                beltExtrudeRow.number.disabled = !allow || !layer?.belt?.enabled;
                beltExtrudeRow.range.addEventListener('input', () => {
                    const next = clamp(beltExtrudeRow.range.value, 0.0, 4.0);
                    layer.belt.extrusion = next;
                    beltExtrudeRow.range.value = String(next);
                    beltExtrudeRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                beltExtrudeRow.number.addEventListener('change', () => {
                    const next = clamp(beltExtrudeRow.number.value, 0.0, 4.0);
                    layer.belt.extrusion = next;
                    beltExtrudeRow.range.value = String(next);
                    beltExtrudeRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                beltGroup.body.appendChild(beltExtrudeRow.row);

                const beltMaterialPicker = makePickerRow('Belt material');
                const beltMaterial = layer?.belt?.material ?? { kind: 'color', id: BELT_COURSE_COLOR.OFFWHITE };
                if (beltMaterial?.kind === 'texture') {
                    const styleId = typeof beltMaterial.id === 'string' && beltMaterial.id ? beltMaterial.id : BUILDING_STYLE.DEFAULT;
                    const found = getStyleOption(styleId) ?? null;
                    const label = found?.label ?? styleId;
                    beltMaterialPicker.text.textContent = label;
                    setMaterialThumbToTexture(beltMaterialPicker.thumb, found?.wallTextureUrl ?? '', label);
                } else {
                    const colorId = typeof beltMaterial?.id === 'string' && beltMaterial.id ? beltMaterial.id : BELT_COURSE_COLOR.OFFWHITE;
                    const found = getBeltColorOption(colorId) ?? null;
                    const label = found?.label ?? colorId;
                    beltMaterialPicker.text.textContent = label;
                    setMaterialThumbToColor(beltMaterialPicker.thumb, found?.hex ?? 0xffffff);
                }
                beltMaterialPicker.button.disabled = !allow || !layer?.belt?.enabled;
                beltMaterialPicker.button.addEventListener('click', () => {
                    openMaterialPicker({
                        title: 'Belt material',
                        material: layer.belt.material ?? beltMaterial,
                        textureOptions: textureMaterialOptions,
                        colorOptions: beltColorMaterialOptions,
                        onSelect: (spec) => {
                            layer.belt.material = spec;
                            if (spec.kind === 'color') {
                                const found = getBeltColorOption(spec.id) ?? null;
                                const label = found?.label ?? spec.id;
                                beltMaterialPicker.text.textContent = label;
                                setMaterialThumbToColor(beltMaterialPicker.thumb, found?.hex ?? 0xffffff);
                            } else {
                                const found = getStyleOption(spec.id) ?? null;
                                const label = found?.label ?? spec.id;
                                beltMaterialPicker.text.textContent = label;
                                setMaterialThumbToTexture(beltMaterialPicker.thumb, found?.wallTextureUrl ?? '', label);
                            }
                            this._notifySelectedLayersChanged();
                        }
                    });
                });
                beltGroup.body.appendChild(beltMaterialPicker.row);

                const windowsGroup = makeDetailsSection('Windows', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:windows` });
                const windowsToggle = makeToggleRow('Enable windows');
                windowsToggle.input.checked = !!layer?.windows?.enabled;
                windowsToggle.input.disabled = !allow;
                windowsGroup.body.appendChild(windowsToggle.toggle);

                const windowPicker = makePickerRow('Window type');
                const winTypeId = layer?.windows?.typeId ?? WINDOW_TYPE.STYLE_DEFAULT;
                const winFound = getWindowOption(winTypeId) ?? null;
                const winLabel = winFound?.label ?? winTypeId;
                windowPicker.text.textContent = winLabel;
                setMaterialThumbToTexture(windowPicker.thumb, winFound?.previewUrl ?? '', winLabel);
                windowPicker.button.disabled = !allow || !layer?.windows?.enabled;
                windowPicker.button.addEventListener('click', () => openWindowPicker(layer, windowPicker));
                windowsGroup.body.appendChild(windowPicker.row);

                const winWidthRow = makeRangeRow('Window width (m)');
                winWidthRow.range.min = '0.3';
                winWidthRow.range.max = '12';
                winWidthRow.range.step = '0.1';
                winWidthRow.number.min = '0.3';
                winWidthRow.number.max = '12';
                winWidthRow.number.step = '0.1';
                winWidthRow.range.value = String(layer?.windows?.width ?? 2.2);
                winWidthRow.number.value = formatFloat(layer?.windows?.width ?? 2.2, 1);
                winWidthRow.range.disabled = !allow || !layer?.windows?.enabled;
                winWidthRow.number.disabled = !allow || !layer?.windows?.enabled;
                winWidthRow.range.addEventListener('input', () => {
                    const next = clamp(winWidthRow.range.value, 0.3, 12.0);
                    layer.windows.width = next;
                    winWidthRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });
                winWidthRow.number.addEventListener('change', () => {
                    const next = clamp(winWidthRow.number.value, 0.3, 12.0);
                    layer.windows.width = next;
                    winWidthRow.range.value = String(next);
                    winWidthRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });
                windowsGroup.body.appendChild(winWidthRow.row);

                const winSpacingRow = makeRangeRow('Window spacing (m)');
                winSpacingRow.range.min = '0';
                winSpacingRow.range.max = '24';
                winSpacingRow.range.step = '0.1';
                winSpacingRow.number.min = '0';
                winSpacingRow.number.max = '24';
                winSpacingRow.number.step = '0.1';
                winSpacingRow.range.value = String(layer?.windows?.spacing ?? 1.6);
                winSpacingRow.number.value = formatFloat(layer?.windows?.spacing ?? 1.6, 1);
                winSpacingRow.range.disabled = !allow || !layer?.windows?.enabled;
                winSpacingRow.number.disabled = !allow || !layer?.windows?.enabled;
                winSpacingRow.range.addEventListener('input', () => {
                    const next = clamp(winSpacingRow.range.value, 0.0, 24.0);
                    layer.windows.spacing = next;
                    winSpacingRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });
                winSpacingRow.number.addEventListener('change', () => {
                    const next = clamp(winSpacingRow.number.value, 0.0, 24.0);
                    layer.windows.spacing = next;
                    winSpacingRow.range.value = String(next);
                    winSpacingRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });
                windowsGroup.body.appendChild(winSpacingRow.row);

                const winHeightRow = makeRangeRow('Window height (m)');
                winHeightRow.range.min = '0.3';
                winHeightRow.range.max = '10';
                winHeightRow.range.step = '0.1';
                winHeightRow.number.min = '0.3';
                winHeightRow.number.max = '10';
                winHeightRow.number.step = '0.1';
                winHeightRow.range.value = String(layer?.windows?.height ?? 1.4);
                winHeightRow.number.value = formatFloat(layer?.windows?.height ?? 1.4, 1);
                winHeightRow.range.disabled = !allow || !layer?.windows?.enabled;
                winHeightRow.number.disabled = !allow || !layer?.windows?.enabled;
                winHeightRow.range.addEventListener('input', () => {
                    const next = clamp(winHeightRow.range.value, 0.3, 10.0);
                    layer.windows.height = next;
                    winHeightRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });
                winHeightRow.number.addEventListener('change', () => {
                    const next = clamp(winHeightRow.number.value, 0.3, 10.0);
                    layer.windows.height = next;
                    winHeightRow.range.value = String(next);
                    winHeightRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });
                windowsGroup.body.appendChild(winHeightRow.row);

                const winSillRow = makeRangeRow('Sill height (m)');
                winSillRow.range.min = '0';
                winSillRow.range.max = '12';
                winSillRow.range.step = '0.1';
                winSillRow.number.min = '0';
                winSillRow.number.max = '12';
                winSillRow.number.step = '0.1';
                winSillRow.range.value = String(layer?.windows?.sillHeight ?? 1.0);
                winSillRow.number.value = formatFloat(layer?.windows?.sillHeight ?? 1.0, 1);
                winSillRow.range.disabled = !allow || !layer?.windows?.enabled;
                winSillRow.number.disabled = !allow || !layer?.windows?.enabled;
                winSillRow.range.addEventListener('input', () => {
                    const next = clamp(winSillRow.range.value, 0.0, 12.0);
                    layer.windows.sillHeight = next;
                    winSillRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });
                winSillRow.number.addEventListener('change', () => {
                    const next = clamp(winSillRow.number.value, 0.0, 12.0);
                    layer.windows.sillHeight = next;
                    winSillRow.range.value = String(next);
                    winSillRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });
                windowsGroup.body.appendChild(winSillRow.row);

                layer.windows.fakeDepth ??= { enabled: false, strength: 0.06, insetStrength: 0.25 };
                const fakeDepthToggle = makeToggleRow('Fake depth (parallax)');
                fakeDepthToggle.input.checked = !!layer?.windows?.fakeDepth?.enabled;
                fakeDepthToggle.input.disabled = !allow || !layer?.windows?.enabled;
                windowsGroup.body.appendChild(fakeDepthToggle.toggle);

                const fakeDepthStrengthRow = makeRangeRow('Fake depth strength');
                fakeDepthStrengthRow.range.min = '0';
                fakeDepthStrengthRow.range.max = '0.25';
                fakeDepthStrengthRow.range.step = '0.01';
                fakeDepthStrengthRow.number.min = '0';
                fakeDepthStrengthRow.number.max = '0.25';
                fakeDepthStrengthRow.number.step = '0.01';
                fakeDepthStrengthRow.range.value = String(layer?.windows?.fakeDepth?.strength ?? 0.06);
                fakeDepthStrengthRow.number.value = formatFloat(layer?.windows?.fakeDepth?.strength ?? 0.06, 2);
                fakeDepthStrengthRow.range.disabled = !allow || !layer?.windows?.enabled || !layer?.windows?.fakeDepth?.enabled;
                fakeDepthStrengthRow.number.disabled = fakeDepthStrengthRow.range.disabled;
                fakeDepthStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(fakeDepthStrengthRow.range.value, 0.0, 0.25);
                    layer.windows.fakeDepth.strength = next;
                    fakeDepthStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                fakeDepthStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(fakeDepthStrengthRow.number.value, 0.0, 0.25);
                    layer.windows.fakeDepth.strength = next;
                    fakeDepthStrengthRow.range.value = String(next);
                    fakeDepthStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                windowsGroup.body.appendChild(fakeDepthStrengthRow.row);

                const fakeDepthInsetRow = makeRangeRow('Inset / recess');
                fakeDepthInsetRow.range.min = '0';
                fakeDepthInsetRow.range.max = '1';
                fakeDepthInsetRow.range.step = '0.01';
                fakeDepthInsetRow.number.min = '0';
                fakeDepthInsetRow.number.max = '1';
                fakeDepthInsetRow.number.step = '0.01';
                fakeDepthInsetRow.range.value = String(layer?.windows?.fakeDepth?.insetStrength ?? 0.25);
                fakeDepthInsetRow.number.value = formatFloat(layer?.windows?.fakeDepth?.insetStrength ?? 0.25, 2);
                fakeDepthInsetRow.range.disabled = !allow || !layer?.windows?.enabled || !layer?.windows?.fakeDepth?.enabled;
                fakeDepthInsetRow.number.disabled = fakeDepthInsetRow.range.disabled;
                fakeDepthInsetRow.range.addEventListener('input', () => {
                    const next = clamp(fakeDepthInsetRow.range.value, 0.0, 1.0);
                    layer.windows.fakeDepth.insetStrength = next;
                    fakeDepthInsetRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                fakeDepthInsetRow.number.addEventListener('change', () => {
                    const next = clamp(fakeDepthInsetRow.number.value, 0.0, 1.0);
                    layer.windows.fakeDepth.insetStrength = next;
                    fakeDepthInsetRow.range.value = String(next);
                    fakeDepthInsetRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                windowsGroup.body.appendChild(fakeDepthInsetRow.row);

                const columnsGroup = makeDetailsSection('Space columns', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:space_columns` });
                const colsToggle = makeToggleRow('Enable space columns');
                colsToggle.input.checked = !!layer?.windows?.spaceColumns?.enabled;
                colsToggle.input.disabled = !allow || !layer?.windows?.enabled;
                columnsGroup.body.appendChild(colsToggle.toggle);

                const colsEveryRow = makeRangeRow('Every N windows');
                colsEveryRow.range.min = '1';
                colsEveryRow.range.max = '99';
                colsEveryRow.range.step = '1';
                colsEveryRow.number.min = '1';
                colsEveryRow.number.max = '99';
                colsEveryRow.number.step = '1';
                colsEveryRow.range.value = String(layer?.windows?.spaceColumns?.every ?? 4);
                colsEveryRow.number.value = String(layer?.windows?.spaceColumns?.every ?? 4);
                colsEveryRow.range.disabled = !allow || !layer?.windows?.enabled || !layer?.windows?.spaceColumns?.enabled;
                colsEveryRow.number.disabled = colsEveryRow.range.disabled;
                colsEveryRow.range.addEventListener('input', () => {
                    const next = clampInt(colsEveryRow.range.value, 1, 99);
                    layer.windows.spaceColumns.every = next;
                    colsEveryRow.number.value = String(next);
                    this._notifySelectedLayersChanged();
                });
                colsEveryRow.number.addEventListener('change', () => {
                    const next = clampInt(colsEveryRow.number.value, 1, 99);
                    layer.windows.spaceColumns.every = next;
                    colsEveryRow.range.value = String(next);
                    colsEveryRow.number.value = String(next);
                    this._notifySelectedLayersChanged();
                });
                columnsGroup.body.appendChild(colsEveryRow.row);

                const colsWidthRow = makeRangeRow('Column width (m)');
                colsWidthRow.range.min = '0.1';
                colsWidthRow.range.max = '10';
                colsWidthRow.range.step = '0.1';
                colsWidthRow.number.min = '0.1';
                colsWidthRow.number.max = '10';
                colsWidthRow.number.step = '0.1';
                colsWidthRow.range.value = String(layer?.windows?.spaceColumns?.width ?? 0.9);
                colsWidthRow.number.value = formatFloat(layer?.windows?.spaceColumns?.width ?? 0.9, 1);
                colsWidthRow.range.disabled = !allow || !layer?.windows?.enabled || !layer?.windows?.spaceColumns?.enabled;
                colsWidthRow.number.disabled = colsWidthRow.range.disabled;
                colsWidthRow.range.addEventListener('input', () => {
                    const next = clamp(colsWidthRow.range.value, 0.1, 10.0);
                    layer.windows.spaceColumns.width = next;
                    colsWidthRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });
                colsWidthRow.number.addEventListener('change', () => {
                    const next = clamp(colsWidthRow.number.value, 0.1, 10.0);
                    layer.windows.spaceColumns.width = next;
                    colsWidthRow.range.value = String(next);
                    colsWidthRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });
                columnsGroup.body.appendChild(colsWidthRow.row);

                const colsMaterialPicker = makePickerRow('Column material');
                const colsMaterial = layer?.windows?.spaceColumns?.material ?? { kind: 'color', id: BELT_COURSE_COLOR.OFFWHITE };
                if (colsMaterial?.kind === 'texture') {
                    const styleId = typeof colsMaterial.id === 'string' && colsMaterial.id ? colsMaterial.id : BUILDING_STYLE.DEFAULT;
                    const found = getStyleOption(styleId) ?? null;
                    const label = found?.label ?? styleId;
                    colsMaterialPicker.text.textContent = label;
                    setMaterialThumbToTexture(colsMaterialPicker.thumb, found?.wallTextureUrl ?? '', label);
                } else {
                    const colorId = typeof colsMaterial?.id === 'string' && colsMaterial.id ? colsMaterial.id : BELT_COURSE_COLOR.OFFWHITE;
                    const found = getBeltColorOption(colorId) ?? null;
                    const label = found?.label ?? colorId;
                    colsMaterialPicker.text.textContent = label;
                    setMaterialThumbToColor(colsMaterialPicker.thumb, found?.hex ?? 0xffffff);
                }
                colsMaterialPicker.button.disabled = !allow || !layer?.windows?.enabled || !layer?.windows?.spaceColumns?.enabled;
                colsMaterialPicker.button.addEventListener('click', () => {
                    openMaterialPicker({
                        title: 'Column material',
                        material: layer.windows.spaceColumns.material ?? colsMaterial,
                        textureOptions: textureMaterialOptions,
                        colorOptions: beltColorMaterialOptions,
                        onSelect: (spec) => {
                            layer.windows.spaceColumns.material = spec;
                            if (spec.kind === 'color') {
                                const found = getBeltColorOption(spec.id) ?? null;
                                const label = found?.label ?? spec.id;
                                colsMaterialPicker.text.textContent = label;
                                setMaterialThumbToColor(colsMaterialPicker.thumb, found?.hex ?? 0xffffff);
                            } else {
                                const found = getStyleOption(spec.id) ?? null;
                                const label = found?.label ?? spec.id;
                                colsMaterialPicker.text.textContent = label;
                                setMaterialThumbToTexture(colsMaterialPicker.thumb, found?.wallTextureUrl ?? '', label);
                            }
                            this._notifySelectedLayersChanged();
                        }
                    });
                });
                columnsGroup.body.appendChild(colsMaterialPicker.row);

                const colsExtrudeToggle = makeToggleRow('Extrude columns');
                colsExtrudeToggle.input.checked = !!layer?.windows?.spaceColumns?.extrude;
                colsExtrudeToggle.input.disabled = !allow || !layer?.windows?.enabled || !layer?.windows?.spaceColumns?.enabled;
                columnsGroup.body.appendChild(colsExtrudeToggle.toggle);

                const colsExtrudeRow = makeRangeRow('Extrude distance (m)');
                colsExtrudeRow.range.min = '0';
                colsExtrudeRow.range.max = '1';
                colsExtrudeRow.range.step = '0.01';
                colsExtrudeRow.number.min = '0';
                colsExtrudeRow.number.max = '1';
                colsExtrudeRow.number.step = '0.01';
                colsExtrudeRow.range.value = String(layer?.windows?.spaceColumns?.extrudeDistance ?? 0.12);
                colsExtrudeRow.number.value = formatFloat(layer?.windows?.spaceColumns?.extrudeDistance ?? 0.12, 2);
                colsExtrudeRow.range.disabled = !allow || !layer?.windows?.enabled || !layer?.windows?.spaceColumns?.enabled || !layer?.windows?.spaceColumns?.extrude;
                colsExtrudeRow.number.disabled = colsExtrudeRow.range.disabled;
                colsExtrudeRow.range.addEventListener('input', () => {
                    const next = clamp(colsExtrudeRow.range.value, 0.0, 1.0);
                    layer.windows.spaceColumns.extrudeDistance = next;
                    colsExtrudeRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                colsExtrudeRow.number.addEventListener('change', () => {
                    const next = clamp(colsExtrudeRow.number.value, 0.0, 1.0);
                    layer.windows.spaceColumns.extrudeDistance = next;
                    colsExtrudeRow.range.value = String(next);
                    colsExtrudeRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                columnsGroup.body.appendChild(colsExtrudeRow.row);

                colsToggle.input.addEventListener('change', () => {
                    layer.windows.spaceColumns.enabled = !!colsToggle.input.checked;
                    const enabled = layer.windows.enabled && layer.windows.spaceColumns.enabled;
                    colsEveryRow.range.disabled = !allow || !enabled;
                    colsEveryRow.number.disabled = colsEveryRow.range.disabled;
                    colsWidthRow.range.disabled = !allow || !enabled;
                    colsWidthRow.number.disabled = colsWidthRow.range.disabled;
                    colsMaterialPicker.button.disabled = !allow || !enabled;
                    colsExtrudeToggle.input.disabled = !allow || !enabled;
                    colsExtrudeRow.range.disabled = !allow || !enabled || !layer.windows.spaceColumns.extrude;
                    colsExtrudeRow.number.disabled = colsExtrudeRow.range.disabled;
                    this._notifySelectedLayersChanged();
                });

                colsExtrudeToggle.input.addEventListener('change', () => {
                    layer.windows.spaceColumns.extrude = !!colsExtrudeToggle.input.checked;
                    const enabled = layer.windows.enabled && layer.windows.spaceColumns.enabled && layer.windows.spaceColumns.extrude;
                    colsExtrudeRow.range.disabled = !allow || !enabled;
                    colsExtrudeRow.number.disabled = colsExtrudeRow.range.disabled;
                    this._notifySelectedLayersChanged();
                });

                fakeDepthToggle.input.addEventListener('change', () => {
                    layer.windows.fakeDepth.enabled = !!fakeDepthToggle.input.checked;
                    const enabled = layer.windows.enabled && layer.windows.fakeDepth.enabled;
                    fakeDepthStrengthRow.range.disabled = !allow || !enabled;
                    fakeDepthStrengthRow.number.disabled = fakeDepthStrengthRow.range.disabled;
                    fakeDepthInsetRow.range.disabled = !allow || !enabled;
                    fakeDepthInsetRow.number.disabled = fakeDepthInsetRow.range.disabled;
                    this._notifySelectedLayersChanged();
                });

                windowsToggle.input.addEventListener('change', () => {
                    layer.windows.enabled = !!windowsToggle.input.checked;
                    const winEnabled = layer.windows.enabled;
                    windowPicker.button.disabled = !allow || !winEnabled;
                    winWidthRow.range.disabled = !allow || !winEnabled;
                    winWidthRow.number.disabled = winWidthRow.range.disabled;
                    winSpacingRow.range.disabled = !allow || !winEnabled;
                    winSpacingRow.number.disabled = winSpacingRow.range.disabled;
                    winHeightRow.range.disabled = !allow || !winEnabled;
                    winHeightRow.number.disabled = winHeightRow.range.disabled;
                    winSillRow.range.disabled = !allow || !winEnabled;
                    winSillRow.number.disabled = winSillRow.range.disabled;
                    fakeDepthToggle.input.disabled = !allow || !winEnabled;
                    const fakeEnabled = winEnabled && layer.windows.fakeDepth.enabled;
                    fakeDepthStrengthRow.range.disabled = !allow || !fakeEnabled;
                    fakeDepthStrengthRow.number.disabled = fakeDepthStrengthRow.range.disabled;
                    fakeDepthInsetRow.range.disabled = !allow || !fakeEnabled;
                    fakeDepthInsetRow.number.disabled = fakeDepthInsetRow.range.disabled;
                    colsToggle.input.disabled = !allow || !winEnabled;
                    const colsEnabled = winEnabled && layer.windows.spaceColumns.enabled;
                    colsEveryRow.range.disabled = !allow || !colsEnabled;
                    colsEveryRow.number.disabled = colsEveryRow.range.disabled;
                    colsWidthRow.range.disabled = !allow || !colsEnabled;
                    colsWidthRow.number.disabled = colsWidthRow.range.disabled;
                    colsMaterialPicker.button.disabled = !allow || !colsEnabled;
                    colsExtrudeToggle.input.disabled = !allow || !colsEnabled;
                    colsExtrudeRow.range.disabled = !allow || !colsEnabled || !layer.windows.spaceColumns.extrude;
                    colsExtrudeRow.number.disabled = colsExtrudeRow.range.disabled;
                    this._notifySelectedLayersChanged();
                });

                const doorsGroup = makeDetailsSection('Doors', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:doors` });
                const doorsHint = document.createElement('div');
                doorsHint.className = 'building-fab-hint';
                doorsHint.textContent = 'Doors: TBD.';
                doorsGroup.body.appendChild(doorsHint);

                layerSection.body.appendChild(floorsGroup.details);
                layerSection.body.appendChild(planGroup.details);
                layerSection.body.appendChild(wallsGroup.details);
                layerSection.body.appendChild(beltGroup.details);
                layerSection.body.appendChild(windowsGroup.details);
                layerSection.body.appendChild(columnsGroup.details);
                layerSection.body.appendChild(doorsGroup.details);
            } else {
                const roofTypeRow = document.createElement('div');
                roofTypeRow.className = 'building-fab-row building-fab-row-wide';
                const roofTypeLabel = document.createElement('div');
                roofTypeLabel.className = 'building-fab-row-label';
                roofTypeLabel.textContent = 'Type';
                const roofTypeSelect = document.createElement('select');
                roofTypeSelect.className = 'building-fab-select';
                const types = ['Asphalt', 'Metal', 'Tile'];
                for (const t of types) {
                    const opt = document.createElement('option');
                    opt.value = t;
                    opt.textContent = t;
                    roofTypeSelect.appendChild(opt);
                }
                roofTypeSelect.value = layer?.roof?.type ?? 'Asphalt';
                roofTypeSelect.disabled = !allow;
                roofTypeSelect.addEventListener('change', () => {
                    layer.roof.type = roofTypeSelect.value;
                    this._notifySelectedLayersChanged();
                });
                roofTypeRow.appendChild(roofTypeLabel);
                roofTypeRow.appendChild(roofTypeSelect);
                layerSection.body.appendChild(roofTypeRow);

                const roofMaterialPicker = makePickerRow('Roof material');
                const roofMaterial = layer?.roof?.material ?? { kind: 'color', id: layer?.roof?.color ?? ROOF_COLOR.DEFAULT };
                if (roofMaterial?.kind === 'texture') {
                    const styleId = typeof roofMaterial.id === 'string' && roofMaterial.id ? roofMaterial.id : BUILDING_STYLE.DEFAULT;
                    const found = getStyleOption(styleId) ?? null;
                    const label = found?.label ?? styleId;
                    roofMaterialPicker.text.textContent = label;
                    setMaterialThumbToTexture(roofMaterialPicker.thumb, found?.wallTextureUrl ?? '', label);
                } else {
                    const colorId = typeof roofMaterial?.id === 'string' && roofMaterial.id ? roofMaterial.id : ROOF_COLOR.DEFAULT;
                    const found = getRoofColorOption(colorId) ?? null;
                    const label = found?.label ?? colorId;
                    roofMaterialPicker.text.textContent = label;
                    setMaterialThumbToColor(roofMaterialPicker.thumb, found?.hex ?? 0xffffff, { isDefaultRoof: colorId === ROOF_COLOR.DEFAULT });
                }
                roofMaterialPicker.button.disabled = !allow;
                roofMaterialPicker.button.addEventListener('click', () => {
                    openMaterialPicker({
                        title: 'Roof material',
                        material: layer.roof.material ?? roofMaterial,
                        textureOptions: textureMaterialOptions,
                        colorOptions: roofColorMaterialOptions,
                        onSelect: (spec) => {
                            layer.roof.material = spec;
                            if (spec.kind === 'color') layer.roof.color = spec.id;

                            if (spec.kind === 'color') {
                                const found = getRoofColorOption(spec.id) ?? null;
                                const label = found?.label ?? spec.id;
                                roofMaterialPicker.text.textContent = label;
                                setMaterialThumbToColor(roofMaterialPicker.thumb, found?.hex ?? 0xffffff, { isDefaultRoof: spec.id === ROOF_COLOR.DEFAULT });
                            } else {
                                const found = getStyleOption(spec.id) ?? null;
                                const label = found?.label ?? spec.id;
                                roofMaterialPicker.text.textContent = label;
                                setMaterialThumbToTexture(roofMaterialPicker.thumb, found?.wallTextureUrl ?? '', label);
                            }
                            this._notifySelectedLayersChanged();
                        }
                    });
                });
                layerSection.body.appendChild(roofMaterialPicker.row);
                const roofTilingController = createTextureTilingMiniController({
                    mode: 'inline',
                    title: 'Texture tiling',
                    allow,
                    tiling: (layer.roof.tiling ??= {}),
                    defaults: { tileMeters: 4.0 },
                    hintText: 'Overrides the material tile size in meters.',
                    onChange: () => this._notifySelectedLayersChanged()
                });
                roofTilingController.mount(layerSection.body);
                this._layerMiniControllers.push(roofTilingController);

                const roofMatVarGroup = makeDetailsSection('Material variation', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar` });
                layer.roof.materialVariation ??= { enabled: false, seedOffset: 0 };
                const roofMatVarNormalized = normalizeMaterialVariationConfig(layer.roof.materialVariation, { root: MATERIAL_VARIATION_ROOT.SURFACE });

                const roofMatVarBasicsGroup = makeDetailsSection('Basics', { open: true, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:basics` });
                const roofMatVarMacroGroup = makeDetailsSection('Macro variation', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:macro` });
                const roofMatVarMidGroup = makeDetailsSection('Mid variation (patches)', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:mid` });
                const roofMatVarMicroGroup = makeDetailsSection('Micro variation (surface response)', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:micro` });
                const roofMatVarWeatherGroup = makeDetailsSection('Weathering', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:weather` });
                const roofMatVarBrickGroup = makeDetailsSection('Brick-specific', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:brick` });
                const roofMatVarAdvancedGroup = makeDetailsSection('Advanced', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:advanced` });

                roofMatVarGroup.body.appendChild(roofMatVarBasicsGroup.details);
                roofMatVarGroup.body.appendChild(roofMatVarMacroGroup.details);
                roofMatVarGroup.body.appendChild(roofMatVarMidGroup.details);
                roofMatVarGroup.body.appendChild(roofMatVarMicroGroup.details);
                roofMatVarGroup.body.appendChild(roofMatVarWeatherGroup.details);
                roofMatVarGroup.body.appendChild(roofMatVarBrickGroup.details);
                roofMatVarGroup.body.appendChild(roofMatVarAdvancedGroup.details);

                applyTooltip(
                    roofMatVarGroup.label,
                    tip(
                        'Procedural material variation and weathering for this roof/surface layer.',
                        'Start with Basics → Intensity and World scale.',
                        'Too much: stacked effects look noisy or overly dirty.'
                    )
                );
                addDetailsResetButton(roofMatVarGroup, {
                    onReset: () => {
                        const prevEnabled = !!layer.roof.materialVariation.enabled;
                        const prevSeedOffset = clampInt(layer.roof.materialVariation.seedOffset ?? 0, -9999, 9999);
                        const preset = getDefaultMaterialVariationPreset(MATERIAL_VARIATION_ROOT.SURFACE);
                        layer.roof.materialVariation = { ...preset, enabled: prevEnabled, seedOffset: prevSeedOffset };
                        this._renderLayersPanel();
                        this._notifySelectedLayersChanged();
                    }
                });
                applyTooltip(
                    roofMatVarBasicsGroup.label,
                    tip(
                        'Global controls that affect all enabled strategies.',
                        'Start here before touching the deeper groups.',
                        'Too much: high intensity + small world scale looks like grain/noise.'
                    )
                );
                applyTooltip(
                    roofMatVarMacroGroup.label,
                    tip(
                        'Large-scale breakup to fight repeating textures.',
                        'Start with Intensity + Scale on Macro layer 1.',
                        'Too much: obvious cloudy blotches.'
                    )
                );
                applyTooltip(
                    roofMatVarMidGroup.label,
                    tip(
                        'Patchy mid-scale variation (repairs/batches/fade).',
                        'Use sparingly for subtle material history.',
                        'Too much: looks like painted camouflage.'
                    )
                );
                applyTooltip(
                    roofMatVarMicroGroup.label,
                    tip(
                        'High-frequency variation for surface response (mostly roughness/normal).',
                        'Use small amounts to avoid flat, CG-looking materials.',
                        'Too much: sparkly, noisy specular.'
                    )
                );
                applyTooltip(
                    roofMatVarWeatherGroup.label,
                    tip(
                        'Purpose-driven weathering: runoff streaks, top deposits, ground grime, edge wear, cracks.',
                        'Prefer one or two subtle effects rather than everything at once.',
                        'Too much: uniformly dirty surfaces with no believable story.'
                    )
                );
                applyTooltip(
                    roofMatVarBrickGroup.label,
                    tip(
                        'Brick-specific controls (bonding / per-brick / mortar).',
                        'Use only for brick-like materials.',
                        'Too much: patterning becomes more obvious than the base texture.'
                    )
                );
                applyTooltip(
                    roofMatVarAdvancedGroup.label,
                    tip(
                        'Advanced controls (projection/space/debug/perf).',
                        'Usually leave defaults.',
                        'Too much: can cause distortion or artifacts.'
                    )
                );

                const roofMatVarToggle = makeToggleRow('Enable variation');
                roofMatVarToggle.input.checked = !!roofMatVarNormalized.enabled;
                roofMatVarToggle.input.disabled = !allow;
                applyToggleRowMeta(roofMatVarToggle, {
                    mustHave: true,
                    tooltip: tip(
                        'Turns on the variation system for this roof/surface layer.',
                        'Typical: enable for subtle breakup and weathering.',
                        'Too much: high intensity across many strategies looks noisy/dirty.'
                    )
                });
                roofMatVarBasicsGroup.body.appendChild(roofMatVarToggle.toggle);

                const roofSeedOffsetRow = makeRangeRow('Seed offset');
                roofSeedOffsetRow.range.min = '-9999';
                roofSeedOffsetRow.range.max = '9999';
                roofSeedOffsetRow.range.step = '1';
                roofSeedOffsetRow.number.min = '-9999';
                roofSeedOffsetRow.number.max = '9999';
                roofSeedOffsetRow.number.step = '1';
                roofSeedOffsetRow.range.value = String(layer.roof.materialVariation.seedOffset ?? 0);
                roofSeedOffsetRow.number.value = String(layer.roof.materialVariation.seedOffset ?? 0);
                applyRangeRowMeta(roofSeedOffsetRow, {
                    tooltip: tip(
                        'Offsets the random seed for this layer.',
                        'Use to make the same style look different per building.',
                        'Too much: not harmful, but makes iteration harder to compare.'
                    )
                });
                roofMatVarBasicsGroup.body.appendChild(roofSeedOffsetRow.row);

                const roofIntensityRow = makeRangeRow('Intensity');
                roofIntensityRow.range.min = '0';
                roofIntensityRow.range.max = '2';
                roofIntensityRow.range.step = '0.01';
                roofIntensityRow.number.min = '0';
                roofIntensityRow.number.max = '2';
                roofIntensityRow.number.step = '0.01';
                roofIntensityRow.range.value = String(roofMatVarNormalized.globalIntensity);
                roofIntensityRow.number.value = formatFloat(roofMatVarNormalized.globalIntensity, 2);
                applyRangeRowMeta(roofIntensityRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Overall multiplier for all enabled variation strategies.',
                        'Typical: 0.5–1.5 for subtle breakup.',
                        'Too much: everything becomes noisy and over-processed.'
                    )
                });
                roofMatVarBasicsGroup.body.appendChild(roofIntensityRow.row);

                const roofScaleRow = makeRangeRow('World scale');
                roofScaleRow.range.min = '0.05';
                roofScaleRow.range.max = '4';
                roofScaleRow.range.step = '0.01';
                roofScaleRow.number.min = '0.05';
                roofScaleRow.number.max = '4';
                roofScaleRow.number.step = '0.01';
                roofScaleRow.range.value = String(roofMatVarNormalized.worldSpaceScale);
                roofScaleRow.number.value = formatFloat(roofMatVarNormalized.worldSpaceScale, 2);
                applyRangeRowMeta(roofScaleRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Sets the world-space scale for the procedural patterns.',
                        'Lower = larger features; higher = smaller features.',
                        'Too much: very high values look like grain/noise.'
                    )
	                });
	                roofMatVarBasicsGroup.body.appendChild(roofScaleRow.row);

	                const roofAoAmountRow = makeRangeRow('AO amount');
	                roofAoAmountRow.range.min = '0';
	                roofAoAmountRow.range.max = '1';
                roofAoAmountRow.range.step = '0.01';
                roofAoAmountRow.number.min = '0';
                roofAoAmountRow.number.max = '1';
                roofAoAmountRow.number.step = '0.01';
                roofAoAmountRow.range.value = String(roofMatVarNormalized.aoAmount);
                roofAoAmountRow.number.value = formatFloat(roofMatVarNormalized.aoAmount, 2);
                applyRangeRowMeta(roofAoAmountRow, {
                    tooltip: tip(
                        'Ambient occlusion influence inside the variation system.',
                        'Typical: 0.30–0.70 depending on how strong you want crevices.',
                        'Too much: everything looks dirty and crushed.'
                    )
                });
                roofMatVarBasicsGroup.body.appendChild(roofAoAmountRow.row);

                const roofMatVarSpaceRow = document.createElement('div');
                roofMatVarSpaceRow.className = 'building-fab-row building-fab-row-wide';
                const roofMatVarSpaceLabel = document.createElement('div');
                roofMatVarSpaceLabel.className = 'building-fab-row-label';
                roofMatVarSpaceLabel.textContent = 'Space';
                const roofMatVarSpaceSelect = document.createElement('select');
                roofMatVarSpaceSelect.className = 'building-fab-select';
                for (const v of ['world', 'object']) {
                    const opt = document.createElement('option');
                    opt.value = v;
                    opt.textContent = v === 'object' ? 'Object space (sticks to mesh)' : 'World space (sticks to scene)';
                    roofMatVarSpaceSelect.appendChild(opt);
                }
                roofMatVarSpaceSelect.value = roofMatVarNormalized.space === 'object' ? 'object' : 'world';
                roofMatVarSpaceRow.appendChild(roofMatVarSpaceLabel);
                roofMatVarSpaceRow.appendChild(roofMatVarSpaceSelect);
                applySelectRowMeta(
                    { label: roofMatVarSpaceLabel, select: roofMatVarSpaceSelect },
                    {
                        tooltip: tip(
                            'Chooses the coordinate space for the procedural patterns.',
                            'World: stable across objects; Object: sticks to the mesh (good for moving parts).',
                            'Too much: Object space can reveal stretching on low-UV assets.'
                        )
                    }
                );
                roofMatVarAdvancedGroup.body.appendChild(roofMatVarSpaceRow);

                const roofObjectScaleRow = makeRangeRow('Object scale');
                roofObjectScaleRow.range.min = '0.05';
                roofObjectScaleRow.range.max = '4';
                roofObjectScaleRow.range.step = '0.01';
                roofObjectScaleRow.number.min = '0.05';
                roofObjectScaleRow.number.max = '4';
                roofObjectScaleRow.number.step = '0.01';
                roofObjectScaleRow.range.value = String(roofMatVarNormalized.objectSpaceScale);
                roofObjectScaleRow.number.value = formatFloat(roofMatVarNormalized.objectSpaceScale, 2);
                applyRangeRowMeta(roofObjectScaleRow, {
                    tooltip: tip(
                        'Scale used when Space is set to Object.',
                        'Lower = larger features; higher = smaller features.',
                        'Too much: very high values look like grain/noise.'
                    )
                });
                roofMatVarAdvancedGroup.body.appendChild(roofObjectScaleRow.row);

                const roofMatVarNormalMapGroup = makeDetailsSection('Normal map', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:normalMap` });
                applyTooltip(
                    roofMatVarNormalMapGroup.label,
                    tip(
                        'Per-layer normal map channel fixes.',
                        'Typical: flip Y (green) if the normal map is authored for a different convention (DirectX vs OpenGL).',
                        'Use with care: flipping X/Z can make lighting look inside-out.'
                    )
                );

                const roofMatVarNormalFlipXToggle = makeToggleRow('Flip normal X (red)');
                roofMatVarNormalFlipXToggle.input.checked = !!roofMatVarNormalized.normalMap?.flipX;
                roofMatVarNormalFlipXToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
                applyToggleRowMeta(roofMatVarNormalFlipXToggle, {
                    tooltip: tip(
                        'Flips the red channel of the normal map.',
                        'Use if lighting looks mirrored left/right.',
                        'Not commonly needed for standard OpenGL normal maps.'
                    )
                });
                roofMatVarNormalMapGroup.body.appendChild(roofMatVarNormalFlipXToggle.toggle);

                const roofMatVarNormalFlipYToggle = makeToggleRow('Flip normal Y (green)');
                roofMatVarNormalFlipYToggle.input.checked = !!roofMatVarNormalized.normalMap?.flipY;
                roofMatVarNormalFlipYToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
                applyToggleRowMeta(roofMatVarNormalFlipYToggle, {
                    tooltip: tip(
                        'Flips the green channel of the normal map.',
                        'Typical: enable when using DirectX-authored normal maps.',
                        'If shading becomes worse, turn it back off.'
                    )
                });
                roofMatVarNormalMapGroup.body.appendChild(roofMatVarNormalFlipYToggle.toggle);

                const roofMatVarNormalFlipZToggle = makeToggleRow('Flip normal Z (blue)');
                roofMatVarNormalFlipZToggle.input.checked = !!roofMatVarNormalized.normalMap?.flipZ;
                roofMatVarNormalFlipZToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
                applyToggleRowMeta(roofMatVarNormalFlipZToggle, {
                    tooltip: tip(
                        'Flips the blue channel of the normal map.',
                        'Rarely needed.',
                        'If enabled, lighting can look inverted.'
                    )
                });
                roofMatVarNormalMapGroup.body.appendChild(roofMatVarNormalFlipZToggle.toggle);

                roofMatVarAdvancedGroup.body.appendChild(roofMatVarNormalMapGroup.details);

                const roofMacro0 = roofMatVarNormalized.macroLayers?.[0] ?? null;
                const roofMacroGroup = makeDetailsSection('Macro layer 1', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:macro0` });
                applyTooltip(
                    roofMacroGroup.label,
                    tip(
                        'Macro layer 1 (Macro A): primary large-scale breakup.',
                        'Start with Intensity + Scale for subtle variation.',
                        'Too much: big cloudy blobs that overpower the base material.'
                    )
                );
                const roofMacroToggle = makeToggleRow('Enable macro layer 1');
                roofMacroToggle.input.checked = !!roofMacro0?.enabled;
                roofMacroToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
                applyToggleRowMeta(roofMacroToggle, {
                    mustHave: true,
                    tooltip: tip(
                        'Enables Macro A (large-scale breakup).',
                        'Typical: enabled for roofs/surfaces to reduce repetition.',
                        'Too much: combined with high intensity can look blotchy.'
                    )
                });
                roofMacroGroup.body.appendChild(roofMacroToggle.toggle);

                const roofMacroIntensityRow = makeRangeRow('Intensity');
                roofMacroIntensityRow.range.min = '0';
                roofMacroIntensityRow.range.max = '2';
                roofMacroIntensityRow.range.step = '0.01';
                roofMacroIntensityRow.number.min = '0';
                roofMacroIntensityRow.number.max = '2';
                roofMacroIntensityRow.number.step = '0.01';
                roofMacroIntensityRow.range.value = String(roofMacro0?.intensity ?? 0.0);
                roofMacroIntensityRow.number.value = formatFloat(roofMacro0?.intensity ?? 0.0, 2);
                applyRangeRowMeta(roofMacroIntensityRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Strength of Macro A.',
                        'Typical: 0.2–1.0 (depending on the material).',
                        'Too much: obvious blotches and loss of texture identity.'
                    )
                });
                roofMacroGroup.body.appendChild(roofMacroIntensityRow.row);

                const roofMacroScaleRow = makeRangeRow('Scale');
                roofMacroScaleRow.range.min = '0.01';
                roofMacroScaleRow.range.max = '20';
                roofMacroScaleRow.range.step = '0.01';
                roofMacroScaleRow.number.min = '0.01';
                roofMacroScaleRow.number.max = '20';
                roofMacroScaleRow.number.step = '0.01';
                roofMacroScaleRow.range.value = String(roofMacro0?.scale ?? 1.0);
                roofMacroScaleRow.number.value = formatFloat(roofMacro0?.scale ?? 1.0, 2);
                applyRangeRowMeta(roofMacroScaleRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Frequency of Macro A (higher = smaller features).',
                        'Typical: 0.1–5 depending on your tile size.',
                        'Too much: looks like noisy speckling instead of macro breakup.'
                    )
                });
                roofMacroGroup.body.appendChild(roofMacroScaleRow.row);

                const roofMacroHueRow = makeRangeRow('Hue shift (deg)');
                roofMacroHueRow.range.min = '-180';
                roofMacroHueRow.range.max = '180';
                roofMacroHueRow.range.step = '1';
                roofMacroHueRow.number.min = '-180';
                roofMacroHueRow.number.max = '180';
                roofMacroHueRow.number.step = '1';
                roofMacroHueRow.range.value = String(roofMacro0?.hueDegrees ?? 0.0);
                roofMacroHueRow.number.value = String(Math.round(roofMacro0?.hueDegrees ?? 0.0));
                applyRangeRowMeta(roofMacroHueRow, {
                    tooltip: tip(
                        'Hue shift for Macro A.',
                        'Typical: ±5–20° for subtle hue drift.',
                        'Too much: unnatural rainbow color variation.'
                    )
                });
                roofMacroGroup.body.appendChild(roofMacroHueRow.row);

                const roofMacroValueRow = makeRangeRow('Value');
                roofMacroValueRow.range.min = '-1';
                roofMacroValueRow.range.max = '1';
                roofMacroValueRow.range.step = '0.01';
                roofMacroValueRow.number.min = '-1';
                roofMacroValueRow.number.max = '1';
                roofMacroValueRow.number.step = '0.01';
                roofMacroValueRow.range.value = String(roofMacro0?.value ?? 0.0);
                roofMacroValueRow.number.value = formatFloat(roofMacro0?.value ?? 0.0, 2);
                applyRangeRowMeta(roofMacroValueRow, {
                    tooltip: tip(
                        'Brightness/value shift for Macro A.',
                        'Typical: small positive/negative values.',
                        'Too much: strong patchiness and contrast.'
                    )
                });
                roofMacroGroup.body.appendChild(roofMacroValueRow.row);

                const roofMacroSaturationRow = makeRangeRow('Saturation');
                roofMacroSaturationRow.range.min = '-1';
                roofMacroSaturationRow.range.max = '1';
                roofMacroSaturationRow.range.step = '0.01';
                roofMacroSaturationRow.number.min = '-1';
                roofMacroSaturationRow.number.max = '1';
                roofMacroSaturationRow.number.step = '0.01';
                roofMacroSaturationRow.range.value = String(roofMacro0?.saturation ?? 0.0);
                roofMacroSaturationRow.number.value = formatFloat(roofMacro0?.saturation ?? 0.0, 2);
                applyRangeRowMeta(roofMacroSaturationRow, {
                    tooltip: tip(
                        'Saturation shift for Macro A.',
                        'Typical: subtle.',
                        'Too much: cartoonish saturation swings or desaturated blotches.'
                    )
                });
                roofMacroGroup.body.appendChild(roofMacroSaturationRow.row);

                const roofMacroRoughnessRow = makeRangeRow('Roughness');
                roofMacroRoughnessRow.range.min = '-1';
                roofMacroRoughnessRow.range.max = '1';
                roofMacroRoughnessRow.range.step = '0.01';
                roofMacroRoughnessRow.number.min = '-1';
                roofMacroRoughnessRow.number.max = '1';
                roofMacroRoughnessRow.number.step = '0.01';
                roofMacroRoughnessRow.range.value = String(roofMacro0?.roughness ?? 0.0);
                roofMacroRoughnessRow.number.value = formatFloat(roofMacro0?.roughness ?? 0.0, 2);
                applyRangeRowMeta(roofMacroRoughnessRow, {
                    tooltip: tip(
                        'Roughness shift for Macro A.',
                        'Typical: subtle (helps break uniform specular).',
                        'Too much: sparkly highlights or overly matte patches.'
                    )
                });
                roofMacroGroup.body.appendChild(roofMacroRoughnessRow.row);

                const roofMacroNormalRow = makeRangeRow('Normal');
                roofMacroNormalRow.range.min = '-1';
                roofMacroNormalRow.range.max = '1';
                roofMacroNormalRow.range.step = '0.01';
                roofMacroNormalRow.number.min = '-1';
                roofMacroNormalRow.number.max = '1';
                roofMacroNormalRow.number.step = '0.01';
                roofMacroNormalRow.range.value = String(roofMacro0?.normal ?? 0.0);
                roofMacroNormalRow.number.value = formatFloat(roofMacro0?.normal ?? 0.0, 2);
                applyRangeRowMeta(roofMacroNormalRow, {
                    tooltip: tip(
                        'Normal shift for Macro A.',
                        'Typical: small (mostly leave at 0).',
                        'Too much: warping/bumpy shading artifacts.'
                    )
                });
                roofMacroGroup.body.appendChild(roofMacroNormalRow.row);
                roofMatVarMacroGroup.body.appendChild(roofMacroGroup.details);

                const roofWearBottom = roofMatVarNormalized.wearBottom ?? null;
                const roofGrimeGroup = makeDetailsSection('Bottom wear', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:wearBottom` });
                applyTooltip(
                    roofGrimeGroup.label,
                    tip(
                        'Ground grime band near the bottom of the surface.',
                        'Great for subtle splashback and dirt accumulation.',
                        'Too much: the whole surface looks uniformly dirty.'
                    )
                );
                const roofGrimeToggle = makeToggleRow('Enable bottom wear');
                roofGrimeToggle.input.checked = !!roofWearBottom?.enabled;
                roofGrimeToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
                applyToggleRowMeta(roofGrimeToggle, {
                    mustHave: true,
                    tooltip: tip(
                        'Enables bottom wear/grime.',
                        'Typical: enable with low Strength + narrow Width.',
                        'Too much: a thick dirty band that dominates the surface.'
                    )
                });
                roofGrimeGroup.body.appendChild(roofGrimeToggle.toggle);
                const roofGrimeStrengthRow = makeRangeRow('Strength');
                roofGrimeStrengthRow.range.min = '0';
                roofGrimeStrengthRow.range.max = '2';
                roofGrimeStrengthRow.range.step = '0.01';
                roofGrimeStrengthRow.number.min = '0';
                roofGrimeStrengthRow.number.max = '2';
                roofGrimeStrengthRow.number.step = '0.01';
                roofGrimeStrengthRow.range.value = String(roofWearBottom?.intensity ?? 0.0);
                roofGrimeStrengthRow.number.value = formatFloat(roofWearBottom?.intensity ?? 0.0, 2);
                applyRangeRowMeta(roofGrimeStrengthRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Strength of bottom grime.',
                        'Typical: 0.05–0.30.',
                        'Too much: looks like a painted dark band.'
                    )
                });
                roofGrimeGroup.body.appendChild(roofGrimeStrengthRow.row);

                const roofGrimeWidthRow = makeRangeRow('Width');
                roofGrimeWidthRow.range.min = '0';
                roofGrimeWidthRow.range.max = '1';
                roofGrimeWidthRow.range.step = '0.01';
                roofGrimeWidthRow.number.min = '0';
                roofGrimeWidthRow.number.max = '1';
                roofGrimeWidthRow.number.step = '0.01';
                roofGrimeWidthRow.range.value = String(roofWearBottom?.width ?? 0.5);
                roofGrimeWidthRow.number.value = formatFloat(roofWearBottom?.width ?? 0.5, 2);
                applyRangeRowMeta(roofGrimeWidthRow, {
                    mustHave: true,
                    tooltip: tip(
                        'Height of the bottom grime band (0–1 relative).',
                        'Typical: 0.10–0.40.',
                        'Too much: grime climbs too high and looks unrealistic.'
                    )
                });
                roofGrimeGroup.body.appendChild(roofGrimeWidthRow.row);

                const roofGrimeScaleRow = makeRangeRow('Scale');
                roofGrimeScaleRow.range.min = '0.01';
                roofGrimeScaleRow.range.max = '20';
                roofGrimeScaleRow.range.step = '0.01';
                roofGrimeScaleRow.number.min = '0.01';
                roofGrimeScaleRow.number.max = '20';
                roofGrimeScaleRow.number.step = '0.01';
                roofGrimeScaleRow.range.value = String(roofWearBottom?.scale ?? 1.0);
                roofGrimeScaleRow.number.value = formatFloat(roofWearBottom?.scale ?? 1.0, 2);
                applyRangeRowMeta(roofGrimeScaleRow, {
                    tooltip: tip(
                        'Noise scale for breaking up the grime band.',
                        'Typical: 0.5–2.0.',
                        'Too much: noisy, speckled dirt.'
                    )
                });
                roofGrimeGroup.body.appendChild(roofGrimeScaleRow.row);

                const roofGrimeHueRow = makeRangeRow('Hue shift (deg)');
                roofGrimeHueRow.range.min = '-180';
                roofGrimeHueRow.range.max = '180';
                roofGrimeHueRow.range.step = '1';
                roofGrimeHueRow.number.min = '-180';
                roofGrimeHueRow.number.max = '180';
                roofGrimeHueRow.number.step = '1';
                roofGrimeHueRow.range.value = String(roofWearBottom?.hueDegrees ?? 0.0);
                roofGrimeHueRow.number.value = String(Math.round(roofWearBottom?.hueDegrees ?? 0.0));
                applyRangeRowMeta(roofGrimeHueRow, {
                    tooltip: tip(
                        'Hue shift applied to bottom grime.',
                        'Typical: subtle (often 0).',
                        'Too much: colored dirt band.'
                    )
                });
                roofGrimeGroup.body.appendChild(roofGrimeHueRow.row);

                const roofGrimeValueRow = makeRangeRow('Value');
                roofGrimeValueRow.range.min = '-1';
                roofGrimeValueRow.range.max = '1';
                roofGrimeValueRow.range.step = '0.01';
                roofGrimeValueRow.number.min = '-1';
                roofGrimeValueRow.number.max = '1';
                roofGrimeValueRow.number.step = '0.01';
                roofGrimeValueRow.range.value = String(roofWearBottom?.value ?? 0.0);
                roofGrimeValueRow.number.value = formatFloat(roofWearBottom?.value ?? 0.0, 2);
                applyRangeRowMeta(roofGrimeValueRow, {
                    tooltip: tip(
                        'Value/brightness shift applied to bottom grime.',
                        'Typical: slightly darker for dirt.',
                        'Too much: heavy black band.'
                    )
                });
                roofGrimeGroup.body.appendChild(roofGrimeValueRow.row);

                const roofGrimeSaturationRow = makeRangeRow('Saturation');
                roofGrimeSaturationRow.range.min = '-1';
                roofGrimeSaturationRow.range.max = '1';
                roofGrimeSaturationRow.range.step = '0.01';
                roofGrimeSaturationRow.number.min = '-1';
                roofGrimeSaturationRow.number.max = '1';
                roofGrimeSaturationRow.number.step = '0.01';
                roofGrimeSaturationRow.range.value = String(roofWearBottom?.saturation ?? 0.0);
                roofGrimeSaturationRow.number.value = formatFloat(roofWearBottom?.saturation ?? 0.0, 2);
                applyRangeRowMeta(roofGrimeSaturationRow, {
                    tooltip: tip(
                        'Saturation shift applied to bottom grime.',
                        'Typical: small negative saturation for dirt.',
                        'Too much: unnatural colored dirt.'
                    )
                });
                roofGrimeGroup.body.appendChild(roofGrimeSaturationRow.row);

                const roofGrimeRoughnessRow = makeRangeRow('Roughness');
                roofGrimeRoughnessRow.range.min = '-1';
                roofGrimeRoughnessRow.range.max = '1';
                roofGrimeRoughnessRow.range.step = '0.01';
                roofGrimeRoughnessRow.number.min = '-1';
                roofGrimeRoughnessRow.number.max = '1';
                roofGrimeRoughnessRow.number.step = '0.01';
                roofGrimeRoughnessRow.range.value = String(roofWearBottom?.roughness ?? 0.0);
                roofGrimeRoughnessRow.number.value = formatFloat(roofWearBottom?.roughness ?? 0.0, 2);
                applyRangeRowMeta(roofGrimeRoughnessRow, {
                    tooltip: tip(
                        'Roughness shift applied to bottom grime.',
                        'Typical: slightly rougher.',
                        'Too much: noisy or chalky specular response.'
                    )
                });
                roofGrimeGroup.body.appendChild(roofGrimeRoughnessRow.row);

                const roofGrimeNormalRow = makeRangeRow('Normal');
                roofGrimeNormalRow.range.min = '-1';
                roofGrimeNormalRow.range.max = '1';
                roofGrimeNormalRow.range.step = '0.01';
                roofGrimeNormalRow.number.min = '-1';
                roofGrimeNormalRow.number.max = '1';
                roofGrimeNormalRow.number.step = '0.01';
                roofGrimeNormalRow.range.value = String(roofWearBottom?.normal ?? 0.0);
                roofGrimeNormalRow.number.value = formatFloat(roofWearBottom?.normal ?? 0.0, 2);
                applyRangeRowMeta(roofGrimeNormalRow, {
                    tooltip: tip(
                        'Normal shift applied to bottom grime.',
                        'Typical: 0.',
                        'Too much: bumpy artifacts in the grime band.'
                    )
                });
                roofGrimeGroup.body.appendChild(roofGrimeNormalRow.row);
                roofMatVarWeatherGroup.body.appendChild(roofGrimeGroup.details);

	                const roofStreaksGroup = makeDetailsSection('Streaks', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:streaks` });
	                applyTooltip(
	                    roofStreaksGroup.label,
	                    tip(
	                        'Runoff streaks and drip marks (gravity-aligned).',
	                        'Good for subtle staining and variation directionality.',
	                        'Too much: surfaces look uniformly dirty and overdone.'
	                    )
	                );
	                const roofStreaksToggle = makeToggleRow('Enable streaks');
	                roofStreaksToggle.input.checked = !!roofMatVarNormalized.streaks.enabled;
	                roofStreaksToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
	                applyToggleRowMeta(roofStreaksToggle, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Enables gravity-aligned streaking/runoff.',
	                        'Typical: enable with low Strength for realism.',
	                        'Too much: obvious drips on every surface.'
	                    )
	                });
	                roofStreaksGroup.body.appendChild(roofStreaksToggle.toggle);
	                const roofStreakStrengthRow = makeRangeRow('Strength');
                roofStreakStrengthRow.range.min = '0';
                roofStreakStrengthRow.range.max = '2';
                roofStreakStrengthRow.range.step = '0.01';
                roofStreakStrengthRow.number.min = '0';
                roofStreakStrengthRow.number.max = '2';
	                roofStreakStrengthRow.number.step = '0.01';
	                roofStreakStrengthRow.range.value = String(roofMatVarNormalized.streaks.strength);
	                roofStreakStrengthRow.number.value = formatFloat(roofMatVarNormalized.streaks.strength, 2);
	                applyRangeRowMeta(roofStreakStrengthRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Strength of streaking/runoff.',
	                        'Typical: 0.05–0.30 for subtle staining.',
	                        'Too much: heavy grime everywhere.'
	                    )
	                });
	                roofStreaksGroup.body.appendChild(roofStreakStrengthRow.row);
	                const roofStreakScaleRow = makeRangeRow('Scale');
                roofStreakScaleRow.range.min = '0.01';
                roofStreakScaleRow.range.max = '20';
                roofStreakScaleRow.range.step = '0.01';
                roofStreakScaleRow.number.min = '0.01';
	                roofStreakScaleRow.number.max = '20';
	                roofStreakScaleRow.number.step = '0.01';
	                roofStreakScaleRow.range.value = String(roofMatVarNormalized.streaks.scale);
	                roofStreakScaleRow.number.value = formatFloat(roofMatVarNormalized.streaks.scale, 2);
	                applyRangeRowMeta(roofStreakScaleRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Size of streak features (higher = smaller streak detail).',
	                        'Typical: 0.3–2.0 depending on surface size.',
	                        'Too much: tiny scale reads as noisy speckles.'
	                    )
	                });
	                roofStreaksGroup.body.appendChild(roofStreakScaleRow.row);

                const roofStreakLedgeStrengthRow = makeRangeRow('Ledge strength');
                roofStreakLedgeStrengthRow.range.min = '0';
                roofStreakLedgeStrengthRow.range.max = '2';
                roofStreakLedgeStrengthRow.range.step = '0.01';
                roofStreakLedgeStrengthRow.number.min = '0';
                roofStreakLedgeStrengthRow.number.max = '2';
	                roofStreakLedgeStrengthRow.number.step = '0.01';
	                roofStreakLedgeStrengthRow.range.value = String(roofMatVarNormalized.streaks.ledgeStrength);
	                roofStreakLedgeStrengthRow.number.value = formatFloat(roofMatVarNormalized.streaks.ledgeStrength, 2);
	                applyRangeRowMeta(roofStreakLedgeStrengthRow, {
	                    tooltip: tip(
	                        'Extra streaking under ledges/edges.',
	                        'Typical: small values (often 0).',
	                        'Too much: zebra stripes under every edge.'
	                    )
	                });
	                roofStreaksGroup.body.appendChild(roofStreakLedgeStrengthRow.row);

                const roofStreakLedgeScaleRow = makeRangeRow('Ledge scale');
                roofStreakLedgeScaleRow.range.min = '0';
                roofStreakLedgeScaleRow.range.max = '20';
                roofStreakLedgeScaleRow.range.step = '0.1';
                roofStreakLedgeScaleRow.number.min = '0';
		                roofStreakLedgeScaleRow.number.max = '20';
	                roofStreakLedgeScaleRow.number.step = '0.1';
	                roofStreakLedgeScaleRow.range.value = String(roofMatVarNormalized.streaks.ledgeScale);
	                roofStreakLedgeScaleRow.number.value = formatFloat(roofMatVarNormalized.streaks.ledgeScale, 1);
	                applyRangeRowMeta(roofStreakLedgeScaleRow, {
	                    tooltip: tip(
	                        'Frequency of ledge streak detail.',
	                        'Typical: leave default unless you use ledge strength.',
	                        'Too much: repetitive banding under edges.'
	                    )
	                });
	                roofStreaksGroup.body.appendChild(roofStreakLedgeScaleRow.row);

                const roofStreakHueRow = makeRangeRow('Hue shift (deg)');
                roofStreakHueRow.range.min = '-180';
                roofStreakHueRow.range.max = '180';
                roofStreakHueRow.range.step = '1';
                roofStreakHueRow.number.min = '-180';
	                roofStreakHueRow.number.max = '180';
	                roofStreakHueRow.number.step = '1';
	                roofStreakHueRow.range.value = String(roofMatVarNormalized.streaks.hueDegrees);
	                roofStreakHueRow.number.value = String(Math.round(roofMatVarNormalized.streaks.hueDegrees));
	                applyRangeRowMeta(roofStreakHueRow, {
	                    tooltip: tip(
	                        'Hue shift applied inside streaks.',
	                        'Typical: subtle warm/cool shift.',
	                        'Too much: colored paint-like drips.'
	                    )
	                });
	                roofStreaksGroup.body.appendChild(roofStreakHueRow.row);

                const roofStreakValueRow = makeRangeRow('Value');
                roofStreakValueRow.range.min = '-1';
                roofStreakValueRow.range.max = '1';
                roofStreakValueRow.range.step = '0.01';
                roofStreakValueRow.number.min = '-1';
                roofStreakValueRow.number.max = '1';
                roofStreakValueRow.number.step = '0.01';
                roofStreakValueRow.range.value = String(roofMatVarNormalized.streaks.value ?? 0.0);
                roofStreakValueRow.number.value = formatFloat(roofMatVarNormalized.streaks.value ?? 0.0, 2);
                applyRangeRowMeta(roofStreakValueRow, {
	                    tooltip: tip(
	                        'Brightness/value shift inside streaks.',
	                        'Typical: slightly darker for grime or slightly brighter for chalky deposits.',
	                        'Too much: harsh painted streaks.'
	                    )
	                });
	                roofStreaksGroup.body.appendChild(roofStreakValueRow.row);

                const roofStreakSaturationRow = makeRangeRow('Saturation');
                roofStreakSaturationRow.range.min = '-1';
                roofStreakSaturationRow.range.max = '1';
                roofStreakSaturationRow.range.step = '0.01';
                roofStreakSaturationRow.number.min = '-1';
                roofStreakSaturationRow.number.max = '1';
                roofStreakSaturationRow.number.step = '0.01';
                roofStreakSaturationRow.range.value = String(roofMatVarNormalized.streaks.saturation ?? 0.0);
                roofStreakSaturationRow.number.value = formatFloat(roofMatVarNormalized.streaks.saturation ?? 0.0, 2);
                applyRangeRowMeta(roofStreakSaturationRow, {
	                    tooltip: tip(
	                        'Saturation shift inside streaks.',
	                        'Typical: small negative saturation for grime.',
	                        'Too much: colored streaks that look like paint.'
	                    )
	                });
	                roofStreaksGroup.body.appendChild(roofStreakSaturationRow.row);

                const roofStreakRoughnessRow = makeRangeRow('Roughness');
                roofStreakRoughnessRow.range.min = '-1';
                roofStreakRoughnessRow.range.max = '1';
                roofStreakRoughnessRow.range.step = '0.01';
                roofStreakRoughnessRow.number.min = '-1';
                roofStreakRoughnessRow.number.max = '1';
                roofStreakRoughnessRow.number.step = '0.01';
                roofStreakRoughnessRow.range.value = String(roofMatVarNormalized.streaks.roughness ?? 0.0);
                roofStreakRoughnessRow.number.value = formatFloat(roofMatVarNormalized.streaks.roughness ?? 0.0, 2);
                applyRangeRowMeta(roofStreakRoughnessRow, {
	                    tooltip: tip(
	                        'Roughness shift inside streaks.',
	                        'Typical: slightly rougher for dried deposits.',
	                        'Too much: inconsistent specular that reads as noise.'
	                    )
	                });
	                roofStreaksGroup.body.appendChild(roofStreakRoughnessRow.row);

                const roofStreakNormalRow = makeRangeRow('Normal');
                roofStreakNormalRow.range.min = '-1';
                roofStreakNormalRow.range.max = '1';
                roofStreakNormalRow.range.step = '0.01';
                roofStreakNormalRow.number.min = '-1';
                roofStreakNormalRow.number.max = '1';
                roofStreakNormalRow.number.step = '0.01';
                roofStreakNormalRow.range.value = String(roofMatVarNormalized.streaks.normal ?? 0.0);
                roofStreakNormalRow.number.value = formatFloat(roofMatVarNormalized.streaks.normal ?? 0.0, 2);
                applyRangeRowMeta(roofStreakNormalRow, {
		                    tooltip: tip(
		                        'Normal shift inside streaks.',
		                        'Typical: 0 (leave off unless you need stronger texture response).',
		                        'Too much: bumpy streak artifacts.'
		                    )
		                });
		                roofStreaksGroup.body.appendChild(roofStreakNormalRow.row);
	                roofMatVarWeatherGroup.body.appendChild(roofStreaksGroup.details);

		                const roofExposure = roofMatVarNormalized.exposure ?? null;
		                const roofExposureGroup = makeDetailsSection('Orientation exposure', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:exposure` });
		                applyTooltip(
		                    roofExposureGroup.label,
		                    tip(
		                        'Directional exposure based on surface orientation (sun bleaching / windward rain).',
		                        'Use subtle Strength and tune Exponent to control falloff.',
		                        'Too much: one side of the building looks unnaturally different.'
		                    )
		                );
		                const roofExposureToggle = makeToggleRow('Enable exposure');
		                roofExposureToggle.input.checked = !!roofExposure?.enabled;
		                roofExposureToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
		                applyToggleRowMeta(roofExposureToggle, {
		                    mustHave: true,
		                    tooltip: tip(
		                        'Enables orientation-based exposure.',
		                        'Typical: on for sun bleaching or windward staining.',
		                        'Too much: a harsh split between directions.'
		                    )
		                });
		                roofExposureGroup.body.appendChild(roofExposureToggle.toggle);

	                const roofExposureStrengthRow = makeRangeRow('Strength');
	                roofExposureStrengthRow.range.min = '0';
	                roofExposureStrengthRow.range.max = '2';
	                roofExposureStrengthRow.range.step = '0.01';
	                roofExposureStrengthRow.number.min = '0';
	                roofExposureStrengthRow.number.max = '2';
		                roofExposureStrengthRow.number.step = '0.01';
		                roofExposureStrengthRow.range.value = String(roofExposure?.strength ?? 0.0);
		                roofExposureStrengthRow.number.value = formatFloat(roofExposure?.strength ?? 0.0, 2);
		                applyRangeRowMeta(roofExposureStrengthRow, {
		                    mustHave: true,
		                    tooltip: tip(
		                        'Strength of the exposure mask.',
		                        'Typical: 0.05–0.30.',
		                        'Too much: strong directional discoloration.'
		                    )
		                });
		                roofExposureGroup.body.appendChild(roofExposureStrengthRow.row);

	                const roofExposureExponentRow = makeRangeRow('Exponent');
	                roofExposureExponentRow.range.min = '0.1';
	                roofExposureExponentRow.range.max = '8';
	                roofExposureExponentRow.range.step = '0.01';
	                roofExposureExponentRow.number.min = '0.1';
		                roofExposureExponentRow.number.max = '8';
		                roofExposureExponentRow.number.step = '0.01';
		                roofExposureExponentRow.range.value = String(roofExposure?.exponent ?? 1.6);
		                roofExposureExponentRow.number.value = formatFloat(roofExposure?.exponent ?? 1.6, 2);
		                applyRangeRowMeta(roofExposureExponentRow, {
		                    tooltip: tip(
		                        'Sharpness of the direction falloff (higher = tighter).',
		                        'Typical: 1.2–2.5.',
		                        'Too much: abrupt “cutoff” bands.'
		                    )
		                });
		                roofExposureGroup.body.appendChild(roofExposureExponentRow.row);

	                const roofExposureAngles = directionToAzimuthElevationDegrees(roofExposure?.direction);
	                const roofExposureAzimuthRow = makeRangeRow('Azimuth (deg)');
	                roofExposureAzimuthRow.range.min = '0';
	                roofExposureAzimuthRow.range.max = '360';
	                roofExposureAzimuthRow.range.step = '1';
	                roofExposureAzimuthRow.number.min = '0';
		                roofExposureAzimuthRow.number.max = '360';
		                roofExposureAzimuthRow.number.step = '1';
		                roofExposureAzimuthRow.range.value = String(Math.round(roofExposureAngles.azimuthDegrees));
		                roofExposureAzimuthRow.number.value = String(Math.round(roofExposureAngles.azimuthDegrees));
		                applyRangeRowMeta(roofExposureAzimuthRow, {
		                    tooltip: tip(
		                        'Direction azimuth in world space.',
		                        'Typical: aim toward the “sun” or prevailing weather.',
		                        'Too much: direction mismatched to scene lighting.'
		                    )
		                });
		                roofExposureGroup.body.appendChild(roofExposureAzimuthRow.row);

	                const roofExposureElevationRow = makeRangeRow('Elevation (deg)');
	                roofExposureElevationRow.range.min = '0';
	                roofExposureElevationRow.range.max = '90';
	                roofExposureElevationRow.range.step = '1';
	                roofExposureElevationRow.number.min = '0';
		                roofExposureElevationRow.number.max = '90';
		                roofExposureElevationRow.number.step = '1';
		                roofExposureElevationRow.range.value = String(Math.round(roofExposureAngles.elevationDegrees));
		                roofExposureElevationRow.number.value = String(Math.round(roofExposureAngles.elevationDegrees));
		                applyRangeRowMeta(roofExposureElevationRow, {
		                    tooltip: tip(
		                        'Elevation angle (0 = horizon, 90 = straight up).',
		                        'Typical: 30–80 depending on how “top-down” the exposure is.',
		                        'Too much: overly top-lit effect.'
		                    )
		                });
		                roofExposureGroup.body.appendChild(roofExposureElevationRow.row);

	                const roofExposureValueRow = makeRangeRow('Value');
	                roofExposureValueRow.range.min = '-1';
	                roofExposureValueRow.range.max = '1';
	                roofExposureValueRow.range.step = '0.01';
	                roofExposureValueRow.number.min = '-1';
	                roofExposureValueRow.number.max = '1';
	                roofExposureValueRow.number.step = '0.01';
	                roofExposureValueRow.range.value = String(roofExposure?.value ?? 0.0);
	                roofExposureValueRow.number.value = formatFloat(roofExposure?.value ?? 0.0, 2);
	                applyRangeRowMeta(roofExposureValueRow, {
		                    tooltip: tip(
		                        'Value shift applied to the exposed side.',
		                        'Typical: small positive for bleach, negative for staining.',
		                        'Too much: obvious light/dark split.'
		                    )
		                });
		                roofExposureGroup.body.appendChild(roofExposureValueRow.row);

	                const roofExposureSaturationRow = makeRangeRow('Saturation');
	                roofExposureSaturationRow.range.min = '-1';
	                roofExposureSaturationRow.range.max = '1';
	                roofExposureSaturationRow.range.step = '0.01';
	                roofExposureSaturationRow.number.min = '-1';
	                roofExposureSaturationRow.number.max = '1';
	                roofExposureSaturationRow.number.step = '0.01';
	                roofExposureSaturationRow.range.value = String(roofExposure?.saturation ?? 0.0);
	                roofExposureSaturationRow.number.value = formatFloat(roofExposure?.saturation ?? 0.0, 2);
	                applyRangeRowMeta(roofExposureSaturationRow, {
		                    tooltip: tip(
		                        'Saturation shift applied to the exposed side.',
		                        'Typical: slightly negative for bleaching.',
		                        'Too much: oddly colored exposure.'
		                    )
		                });
		                roofExposureGroup.body.appendChild(roofExposureSaturationRow.row);

	                const roofExposureRoughnessRow = makeRangeRow('Roughness');
	                roofExposureRoughnessRow.range.min = '-1';
		                roofExposureRoughnessRow.range.max = '1';
		                roofExposureRoughnessRow.range.step = '0.01';
	                roofExposureRoughnessRow.number.min = '-1';
		                roofExposureRoughnessRow.number.max = '1';
		                roofExposureRoughnessRow.number.step = '0.01';
		                roofExposureRoughnessRow.range.value = String(roofExposure?.roughness ?? 0.0);
		                roofExposureRoughnessRow.number.value = formatFloat(roofExposure?.roughness ?? 0.0, 2);
		                applyRangeRowMeta(roofExposureRoughnessRow, {
		                    tooltip: tip(
		                        'Roughness shift applied to the exposed side.',
		                        'Typical: subtle.',
		                        'Too much: unnatural glossy/matte directionality.'
		                    )
		                });
		                roofExposureGroup.body.appendChild(roofExposureRoughnessRow.row);
	                roofMatVarWeatherGroup.body.appendChild(roofExposureGroup.details);

		                const roofWearSide = roofMatVarNormalized.wearSide ?? null;
		                const roofEdgeGroup = makeDetailsSection('Side wear (vertical edges)', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:wearSide` });
		                applyTooltip(
		                    roofEdgeGroup.label,
		                    tip(
		                        'Edge/side wear along vertical corners and edges.',
		                        'Good for subtle exposure and chipped-edge feel.',
		                        'Too much: outlines every edge like a cartoon.'
		                    )
		                );
		                const roofEdgeToggle = makeToggleRow('Enable side wear');
	                roofEdgeToggle.input.checked = !!roofWearSide?.enabled;
	                roofEdgeToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
	                applyToggleRowMeta(roofEdgeToggle, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Enables vertical edge wear.',
	                        'Typical: enable with low Strength.',
	                        'Too much: edges become uniformly highlighted.'
	                    )
	                });
	                roofEdgeGroup.body.appendChild(roofEdgeToggle.toggle);
	                const roofEdgeStrengthRow = makeRangeRow('Strength');
                roofEdgeStrengthRow.range.min = '0';
                roofEdgeStrengthRow.range.max = '2';
                roofEdgeStrengthRow.range.step = '0.01';
                roofEdgeStrengthRow.number.min = '0';
                roofEdgeStrengthRow.number.max = '2';
	                roofEdgeStrengthRow.number.step = '0.01';
	                roofEdgeStrengthRow.range.value = String(roofWearSide?.intensity ?? 0.0);
	                roofEdgeStrengthRow.number.value = formatFloat(roofWearSide?.intensity ?? 0.0, 2);
	                applyRangeRowMeta(roofEdgeStrengthRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Strength of edge wear.',
	                        'Typical: 0.05–0.30.',
	                        'Too much: bright/dirty outlines on every corner.'
	                    )
	                });
	                roofEdgeGroup.body.appendChild(roofEdgeStrengthRow.row);

                const roofEdgeWidthRow = makeRangeRow('Width');
                roofEdgeWidthRow.range.min = '0';
                roofEdgeWidthRow.range.max = '4';
                roofEdgeWidthRow.range.step = '0.01';
                roofEdgeWidthRow.number.min = '0';
	                roofEdgeWidthRow.number.max = '4';
	                roofEdgeWidthRow.number.step = '0.01';
	                roofEdgeWidthRow.range.value = String(roofWearSide?.width ?? 1.0);
	                roofEdgeWidthRow.number.value = formatFloat(roofWearSide?.width ?? 1.0, 2);
	                applyRangeRowMeta(roofEdgeWidthRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Width of the edge wear band.',
	                        'Typical: 0.2–1.0 depending on building scale.',
	                        'Too much: looks like painted stripes on corners.'
	                    )
	                });
	                roofEdgeGroup.body.appendChild(roofEdgeWidthRow.row);

                const roofEdgeScaleRow = makeRangeRow('Scale');
                roofEdgeScaleRow.range.min = '0.01';
                roofEdgeScaleRow.range.max = '20';
                roofEdgeScaleRow.range.step = '0.01';
                roofEdgeScaleRow.number.min = '0.01';
		                roofEdgeScaleRow.number.max = '20';
	                roofEdgeScaleRow.number.step = '0.01';
	                roofEdgeScaleRow.range.value = String(roofWearSide?.scale ?? 1.0);
	                roofEdgeScaleRow.number.value = formatFloat(roofWearSide?.scale ?? 1.0, 2);
	                applyRangeRowMeta(roofEdgeScaleRow, {
	                    tooltip: tip(
	                        'Noise scale used to break up the edge band.',
	                        'Typical: 0.5–2.0.',
	                        'Too much: noisy, peppery edges.'
	                    )
	                });
	                roofEdgeGroup.body.appendChild(roofEdgeScaleRow.row);

                const roofEdgeHueRow = makeRangeRow('Hue shift (deg)');
                roofEdgeHueRow.range.min = '-180';
                roofEdgeHueRow.range.max = '180';
                roofEdgeHueRow.range.step = '1';
                roofEdgeHueRow.number.min = '-180';
	                roofEdgeHueRow.number.max = '180';
	                roofEdgeHueRow.number.step = '1';
	                roofEdgeHueRow.range.value = String(roofWearSide?.hueDegrees ?? 0.0);
	                roofEdgeHueRow.number.value = String(Math.round(roofWearSide?.hueDegrees ?? 0.0));
	                applyRangeRowMeta(roofEdgeHueRow, {
	                    tooltip: tip(
	                        'Hue shift applied to edge wear.',
	                        'Typical: small (often 0).',
	                        'Too much: colorful outlines on edges.'
	                    )
	                });
	                roofEdgeGroup.body.appendChild(roofEdgeHueRow.row);

                const roofEdgeValueRow = makeRangeRow('Value');
                roofEdgeValueRow.range.min = '-1';
                roofEdgeValueRow.range.max = '1';
                roofEdgeValueRow.range.step = '0.01';
                roofEdgeValueRow.number.min = '-1';
                roofEdgeValueRow.number.max = '1';
                roofEdgeValueRow.number.step = '0.01';
                roofEdgeValueRow.range.value = String(roofWearSide?.value ?? 0.0);
                roofEdgeValueRow.number.value = formatFloat(roofWearSide?.value ?? 0.0, 2);
                applyRangeRowMeta(roofEdgeValueRow, {
	                    tooltip: tip(
	                        'Value/brightness shift applied to edge wear.',
	                        'Typical: subtle brightening/darkening.',
	                        'Too much: chalky edges or overly dark outlines.'
	                    )
	                });
	                roofEdgeGroup.body.appendChild(roofEdgeValueRow.row);

                const roofEdgeSaturationRow = makeRangeRow('Saturation');
                roofEdgeSaturationRow.range.min = '-1';
                roofEdgeSaturationRow.range.max = '1';
                roofEdgeSaturationRow.range.step = '0.01';
                roofEdgeSaturationRow.number.min = '-1';
                roofEdgeSaturationRow.number.max = '1';
                roofEdgeSaturationRow.number.step = '0.01';
                roofEdgeSaturationRow.range.value = String(roofWearSide?.saturation ?? 0.0);
                roofEdgeSaturationRow.number.value = formatFloat(roofWearSide?.saturation ?? 0.0, 2);
                applyRangeRowMeta(roofEdgeSaturationRow, {
	                    tooltip: tip(
	                        'Saturation shift applied to edge wear.',
	                        'Typical: small negative saturation for dusty edges.',
	                        'Too much: colored/painterly edges.'
	                    )
	                });
	                roofEdgeGroup.body.appendChild(roofEdgeSaturationRow.row);

                const roofEdgeRoughnessRow = makeRangeRow('Roughness');
                roofEdgeRoughnessRow.range.min = '-1';
                roofEdgeRoughnessRow.range.max = '1';
                roofEdgeRoughnessRow.range.step = '0.01';
                roofEdgeRoughnessRow.number.min = '-1';
                roofEdgeRoughnessRow.number.max = '1';
                roofEdgeRoughnessRow.number.step = '0.01';
                roofEdgeRoughnessRow.range.value = String(roofWearSide?.roughness ?? 0.0);
                roofEdgeRoughnessRow.number.value = formatFloat(roofWearSide?.roughness ?? 0.0, 2);
                applyRangeRowMeta(roofEdgeRoughnessRow, {
	                    tooltip: tip(
	                        'Roughness shift applied to edge wear.',
	                        'Typical: slightly rougher for exposed edges.',
	                        'Too much: noisy specular along edges.'
	                    )
	                });
	                roofEdgeGroup.body.appendChild(roofEdgeRoughnessRow.row);

                const roofEdgeNormalRow = makeRangeRow('Normal');
                roofEdgeNormalRow.range.min = '-1';
                roofEdgeNormalRow.range.max = '1';
                roofEdgeNormalRow.range.step = '0.01';
                roofEdgeNormalRow.number.min = '-1';
	                roofEdgeNormalRow.number.max = '1';
	                roofEdgeNormalRow.number.step = '0.01';
	                roofEdgeNormalRow.range.value = String(roofWearSide?.normal ?? 0.0);
	                roofEdgeNormalRow.number.value = formatFloat(roofWearSide?.normal ?? 0.0, 2);
	                applyRangeRowMeta(roofEdgeNormalRow, {
	                    tooltip: tip(
	                        'Normal shift applied to edge wear.',
	                        'Typical: 0.',
	                        'Too much: bumpy edge artifacts.'
	                    )
	                });
	                roofEdgeGroup.body.appendChild(roofEdgeNormalRow.row);
                roofMatVarWeatherGroup.body.appendChild(roofEdgeGroup.details);

	                const roofWearTop = roofMatVarNormalized.wearTop ?? null;
	                const roofDustGroup = makeDetailsSection('Top wear', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:wearTop` });
	                applyTooltip(
	                    roofDustGroup.label,
	                    tip(
	                        'Top deposits and wear near the top of the surface.',
	                        'Good for subtle dust/soot accumulation and sun-faded areas.',
	                        'Too much: the whole top looks painted.'
	                    )
	                );
	                const roofDustToggle = makeToggleRow('Enable top wear');
	                roofDustToggle.input.checked = !!roofWearTop?.enabled;
	                roofDustToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
	                applyToggleRowMeta(roofDustToggle, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Enables top wear/deposits.',
	                        'Typical: enable with low Strength + moderate Width.',
	                        'Too much: a thick band that dominates the surface.'
	                    )
	                });
	                roofDustGroup.body.appendChild(roofDustToggle.toggle);
	                const roofDustStrengthRow = makeRangeRow('Strength');
                roofDustStrengthRow.range.min = '0';
                roofDustStrengthRow.range.max = '2';
                roofDustStrengthRow.range.step = '0.01';
                roofDustStrengthRow.number.min = '0';
                roofDustStrengthRow.number.max = '2';
	                roofDustStrengthRow.number.step = '0.01';
	                roofDustStrengthRow.range.value = String(roofWearTop?.intensity ?? 0.0);
	                roofDustStrengthRow.number.value = formatFloat(roofWearTop?.intensity ?? 0.0, 2);
	                applyRangeRowMeta(roofDustStrengthRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Strength of top wear/deposits.',
	                        'Typical: 0.05–0.30.',
	                        'Too much: looks like painted grime on the top.'
	                    )
	                });
	                roofDustGroup.body.appendChild(roofDustStrengthRow.row);

                const roofDustWidthRow = makeRangeRow('Width');
                roofDustWidthRow.range.min = '0';
                roofDustWidthRow.range.max = '1';
                roofDustWidthRow.range.step = '0.01';
                roofDustWidthRow.number.min = '0';
	                roofDustWidthRow.number.max = '1';
	                roofDustWidthRow.number.step = '0.01';
	                roofDustWidthRow.range.value = String(roofWearTop?.width ?? 0.4);
	                roofDustWidthRow.number.value = formatFloat(roofWearTop?.width ?? 0.4, 2);
	                applyRangeRowMeta(roofDustWidthRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Height of the top wear band (0–1 relative).',
	                        'Typical: 0.10–0.45.',
	                        'Too much: top wear covers most of the surface.'
	                    )
	                });
	                roofDustGroup.body.appendChild(roofDustWidthRow.row);

                const roofDustScaleRow = makeRangeRow('Scale');
                roofDustScaleRow.range.min = '0.01';
                roofDustScaleRow.range.max = '20';
                roofDustScaleRow.range.step = '0.01';
                roofDustScaleRow.number.min = '0.01';
		                roofDustScaleRow.number.max = '20';
	                roofDustScaleRow.number.step = '0.01';
	                roofDustScaleRow.range.value = String(roofWearTop?.scale ?? 1.0);
	                roofDustScaleRow.number.value = formatFloat(roofWearTop?.scale ?? 1.0, 2);
	                applyRangeRowMeta(roofDustScaleRow, {
	                    tooltip: tip(
	                        'Noise scale for breaking up the top band.',
	                        'Typical: 0.5–2.0.',
	                        'Too much: noisy speckling.'
	                    )
	                });
	                roofDustGroup.body.appendChild(roofDustScaleRow.row);

                const roofDustHueRow = makeRangeRow('Hue shift (deg)');
                roofDustHueRow.range.min = '-180';
                roofDustHueRow.range.max = '180';
                roofDustHueRow.range.step = '1';
                roofDustHueRow.number.min = '-180';
	                roofDustHueRow.number.max = '180';
	                roofDustHueRow.number.step = '1';
	                roofDustHueRow.range.value = String(roofWearTop?.hueDegrees ?? 0.0);
	                roofDustHueRow.number.value = String(Math.round(roofWearTop?.hueDegrees ?? 0.0));
	                applyRangeRowMeta(roofDustHueRow, {
	                    tooltip: tip(
	                        'Hue shift applied to top wear.',
	                        'Typical: subtle.',
	                        'Too much: colored/painterly top band.'
	                    )
	                });
	                roofDustGroup.body.appendChild(roofDustHueRow.row);

                const roofDustValueRow = makeRangeRow('Value');
                roofDustValueRow.range.min = '-1';
                roofDustValueRow.range.max = '1';
                roofDustValueRow.range.step = '0.01';
                roofDustValueRow.number.min = '-1';
                roofDustValueRow.number.max = '1';
                roofDustValueRow.number.step = '0.01';
                roofDustValueRow.range.value = String(roofWearTop?.value ?? 0.0);
                roofDustValueRow.number.value = formatFloat(roofWearTop?.value ?? 0.0, 2);
                applyRangeRowMeta(roofDustValueRow, {
	                    tooltip: tip(
	                        'Value/brightness shift applied to top wear.',
	                        'Typical: small brightening for dust or darkening for soot.',
	                        'Too much: harsh contrast at the top.'
	                    )
	                });
	                roofDustGroup.body.appendChild(roofDustValueRow.row);

                const roofDustSaturationRow = makeRangeRow('Saturation');
                roofDustSaturationRow.range.min = '-1';
                roofDustSaturationRow.range.max = '1';
                roofDustSaturationRow.range.step = '0.01';
                roofDustSaturationRow.number.min = '-1';
                roofDustSaturationRow.number.max = '1';
                roofDustSaturationRow.number.step = '0.01';
                roofDustSaturationRow.range.value = String(roofWearTop?.saturation ?? 0.0);
                roofDustSaturationRow.number.value = formatFloat(roofWearTop?.saturation ?? 0.0, 2);
                applyRangeRowMeta(roofDustSaturationRow, {
	                    tooltip: tip(
	                        'Saturation shift applied to top wear.',
	                        'Typical: slightly desaturated for dust/soot.',
	                        'Too much: colored/painterly top band.'
	                    )
	                });
	                roofDustGroup.body.appendChild(roofDustSaturationRow.row);

                const roofDustRoughnessRow = makeRangeRow('Roughness');
                roofDustRoughnessRow.range.min = '-1';
                roofDustRoughnessRow.range.max = '1';
                roofDustRoughnessRow.range.step = '0.01';
                roofDustRoughnessRow.number.min = '-1';
                roofDustRoughnessRow.number.max = '1';
                roofDustRoughnessRow.number.step = '0.01';
                roofDustRoughnessRow.range.value = String(roofWearTop?.roughness ?? 0.0);
                roofDustRoughnessRow.number.value = formatFloat(roofWearTop?.roughness ?? 0.0, 2);
                applyRangeRowMeta(roofDustRoughnessRow, {
	                    tooltip: tip(
	                        'Roughness shift applied to top wear.',
	                        'Typical: slightly rougher for dusty deposits.',
	                        'Too much: sparkly/noisy specular response.'
	                    )
	                });
	                roofDustGroup.body.appendChild(roofDustRoughnessRow.row);

                const roofDustNormalRow = makeRangeRow('Normal');
                roofDustNormalRow.range.min = '-1';
                roofDustNormalRow.range.max = '1';
                roofDustNormalRow.range.step = '0.01';
                roofDustNormalRow.number.min = '-1';
	                roofDustNormalRow.number.max = '1';
	                roofDustNormalRow.number.step = '0.01';
	                roofDustNormalRow.range.value = String(roofWearTop?.normal ?? 0.0);
	                roofDustNormalRow.number.value = formatFloat(roofWearTop?.normal ?? 0.0, 2);
	                applyRangeRowMeta(roofDustNormalRow, {
	                    tooltip: tip(
	                        'Normal shift applied to top wear.',
	                        'Typical: 0.',
	                        'Too much: bumpy artifacts in the top band.'
	                    )
	                });
                roofDustGroup.body.appendChild(roofDustNormalRow.row);
                roofMatVarWeatherGroup.body.appendChild(roofDustGroup.details);

	                const roofAntiController = createMaterialVariationAntiTilingMiniController({
	                    allow,
	                    detailsOpenByKey: this._detailsOpenByKey,
	                    detailsKey: `${scopeKey}:layer:${layerId}:roof:matvar:anti`,
                        nested: false,
	                    parentEnabled: !!layer.roof.materialVariation.enabled,
	                    normalizedAntiTiling: roofMatVarNormalized.antiTiling,
	                    targetMaterialVariation: layer.roof.materialVariation,
	                    labels: { offsetU: 'U shift', offsetV: 'V shift' },
                        offsetOrder: ['offsetU', 'offsetV'],
	                    tooltips: {
	                        group: tip(
	                            'Breaks up visible texture tiling by offset/rotation per cell.',
	                            'Use when you can see repeating patterns.',
	                            'Too much: UV distortion and “swimming” details.'
	                        ),
	                        enable: tip(
	                            'Enables anti-tiling UV variation.',
	                            'Typical: enable for materials that obviously repeat.',
	                            'Too much: distortion that looks like warping.'
	                        ),
	                        strength: tip(
	                            'How strong the anti-tiling UV shift/rotation is.',
	                            'Typical: 0.3–0.9.',
	                            'Too much: obvious distortion and blurred details.'
	                        ),
	                        cellSize: tip(
	                            'Size of the anti-tiling cells in tile units.',
	                            'Typical: 1–4.',
	                            'Too much: very small sizes become noisy; very large sizes repeat again.'
	                        ),
	                        blendWidth: tip(
	                            'Softness of transitions between anti-tiling cells.',
	                            'Typical: 0.10–0.30.',
	                            'Too much: blurry blending; too little: visible seams.'
	                        ),
	                        offsetU: tip(
	                            'Per-cell U UV jitter amount.',
	                            'Typical: small values.',
	                            'Too much: texture features misalign noticeably.'
	                        ),
	                        offsetV: tip(
	                            'Per-cell V UV jitter amount.',
	                            'Typical: small values.',
	                            'Too much: texture features misalign noticeably.'
	                        ),
	                        rotation: tip(
	                            'Per-cell UV rotation amount.',
	                            'Typical: 5–25° for subtle breakup.',
	                            'Too much: rotated details look obviously wrong.'
	                        ),
	                        quality: tip(
	                            'Uses a higher-quality anti-tiling blend (slower).',
	                            'Typical: off unless you see seams/artifacts.',
	                            'Too much: unnecessary cost when not needed.'
	                        )
	                    },
	                    onChange: () => this._notifySelectedLayersChanged()
	                });
	                roofAntiController.mount(roofMatVarGroup.body, { before: roofMatVarMacroGroup.details });
	                this._layerMiniControllers.push(roofAntiController);

	                const roofBrickCfg = roofMatVarNormalized.brick ?? null;
	                const roofBrickLayoutGroup = makeDetailsSection('Brick layout', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:brickLayout` });
	                applyTooltip(
	                    roofBrickLayoutGroup.label,
	                    tip(
	                        'Brick grid layout used by brick/mortar strategies.',
	                        'Set bricks per tile to match your base texture.',
	                        'Too much: wrong values make mortar lines drift.'
	                    )
	                );

	                const roofBricksPerTileXRow = makeRangeRow('Bricks per tile X');
	                roofBricksPerTileXRow.range.min = '0.25';
	                roofBricksPerTileXRow.range.max = '200';
	                roofBricksPerTileXRow.range.step = '0.25';
	                roofBricksPerTileXRow.number.min = '0.25';
	                roofBricksPerTileXRow.number.max = '200';
	                roofBricksPerTileXRow.number.step = '0.25';
	                roofBricksPerTileXRow.range.value = String(roofBrickCfg?.bricksPerTileX ?? 6.0);
	                roofBricksPerTileXRow.number.value = formatFloat(roofBrickCfg?.bricksPerTileX ?? 6.0, 2);
	                applyRangeRowMeta(roofBricksPerTileXRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Brick count across one UV tile (U/X).',
	                        'Typical: 5–10 depending on texture.',
	                        'Too much: very high values become noisy.'
	                    )
	                });
	                roofBrickLayoutGroup.body.appendChild(roofBricksPerTileXRow.row);

	                const roofBricksPerTileYRow = makeRangeRow('Bricks per tile Y');
	                roofBricksPerTileYRow.range.min = '0.25';
	                roofBricksPerTileYRow.range.max = '200';
	                roofBricksPerTileYRow.range.step = '0.25';
	                roofBricksPerTileYRow.number.min = '0.25';
	                roofBricksPerTileYRow.number.max = '200';
	                roofBricksPerTileYRow.number.step = '0.25';
	                roofBricksPerTileYRow.range.value = String(roofBrickCfg?.bricksPerTileY ?? 3.0);
	                roofBricksPerTileYRow.number.value = formatFloat(roofBrickCfg?.bricksPerTileY ?? 3.0, 2);
	                applyRangeRowMeta(roofBricksPerTileYRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Brick count across one UV tile (V/Y).',
	                        'Typical: 2–6 depending on texture.',
	                        'Too much: wrong values misalign the grid.'
	                    )
	                });
	                roofBrickLayoutGroup.body.appendChild(roofBricksPerTileYRow.row);

	                const roofMortarWidthRow = makeRangeRow('Mortar width');
	                roofMortarWidthRow.range.min = '0';
	                roofMortarWidthRow.range.max = '0.49';
	                roofMortarWidthRow.range.step = '0.01';
	                roofMortarWidthRow.number.min = '0';
	                roofMortarWidthRow.number.max = '0.49';
	                roofMortarWidthRow.number.step = '0.01';
	                roofMortarWidthRow.range.value = String(roofBrickCfg?.mortarWidth ?? 0.08);
	                roofMortarWidthRow.number.value = formatFloat(roofBrickCfg?.mortarWidth ?? 0.08, 2);
	                applyRangeRowMeta(roofMortarWidthRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Thickness of mortar lines (as a fraction of a brick cell).',
	                        'Typical: 0.04–0.12.',
	                        'Too much: mortar dominates and bricks disappear.'
	                    )
	                });
	                roofBrickLayoutGroup.body.appendChild(roofMortarWidthRow.row);

	                const roofBrickOffsetXRow = makeRangeRow('Layout offset X (cells)');
	                roofBrickOffsetXRow.range.min = '-10';
	                roofBrickOffsetXRow.range.max = '10';
	                roofBrickOffsetXRow.range.step = '0.01';
	                roofBrickOffsetXRow.number.min = '-10';
	                roofBrickOffsetXRow.number.max = '10';
	                roofBrickOffsetXRow.number.step = '0.01';
	                roofBrickOffsetXRow.range.value = String(roofBrickCfg?.offsetX ?? 0.0);
	                roofBrickOffsetXRow.number.value = formatFloat(roofBrickCfg?.offsetX ?? 0.0, 2);
	                applyRangeRowMeta(roofBrickOffsetXRow, {
	                    tooltip: tip(
	                        'Shifts the brick grid horizontally for this roof section (in brick cell units).',
	                        'Use small values (0–1) to de-sync sections without changing brick scale.',
	                        '0 keeps the original alignment.'
	                    )
	                });
	                roofBrickLayoutGroup.body.appendChild(roofBrickOffsetXRow.row);

	                const roofBrickOffsetYRow = makeRangeRow('Layout offset Y (cells)');
	                roofBrickOffsetYRow.range.min = '-10';
	                roofBrickOffsetYRow.range.max = '10';
	                roofBrickOffsetYRow.range.step = '0.01';
	                roofBrickOffsetYRow.number.min = '-10';
	                roofBrickOffsetYRow.number.max = '10';
	                roofBrickOffsetYRow.number.step = '0.01';
	                roofBrickOffsetYRow.range.value = String(roofBrickCfg?.offsetY ?? 0.0);
	                roofBrickOffsetYRow.number.value = formatFloat(roofBrickCfg?.offsetY ?? 0.0, 2);
	                applyRangeRowMeta(roofBrickOffsetYRow, {
	                    tooltip: tip(
	                        'Shifts the brick grid vertically for this roof section (in brick cell units).',
	                        'Use small values (0–1) to de-sync sections without changing brick scale.',
	                        '0 keeps the original alignment.'
	                    )
	                });
	                roofBrickLayoutGroup.body.appendChild(roofBrickOffsetYRow.row);
	                roofMatVarBrickGroup.body.appendChild(roofBrickLayoutGroup.details);

		                const roofStairGroup = makeDetailsSection('Stair shift', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:stair` });
		                applyTooltip(
		                    roofStairGroup.label,
	                    tip(
	                        'Brick-style UV staggering / bond shifting.',
	                        'Useful for brick/bonded patterns to reduce obvious repetition.',
	                        'Too much: misaligned mortar/brick pattern.'
	                    )
	                );
	                const roofStairToggle = makeToggleRow('Enable stair shift');
	                roofStairToggle.input.checked = !!roofMatVarNormalized.stairShift.enabled;
	                roofStairToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
	                applyToggleRowMeta(roofStairToggle, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Enables per-row/step UV shifting.',
	                        'Typical: enable for brick-like surfaces.',
	                        'Too much: makes the pattern look broken.'
	                    )
	                });
	                roofStairGroup.body.appendChild(roofStairToggle.toggle);

                const roofStairStrengthRow = makeRangeRow('Strength');
                roofStairStrengthRow.range.min = '0';
                roofStairStrengthRow.range.max = '1';
                roofStairStrengthRow.range.step = '0.01';
                roofStairStrengthRow.number.min = '0';
	                roofStairStrengthRow.number.max = '1';
	                roofStairStrengthRow.number.step = '0.01';
	                roofStairStrengthRow.range.value = String(roofMatVarNormalized.stairShift.strength);
	                roofStairStrengthRow.number.value = formatFloat(roofMatVarNormalized.stairShift.strength, 2);
	                applyRangeRowMeta(roofStairStrengthRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Strength of the stair shift effect.',
	                        'Typical: 0.2–1.0 for subtle staggering.',
	                        'Too much: severe pattern discontinuities.'
	                    )
	                });
	                roofStairGroup.body.appendChild(roofStairStrengthRow.row);

                const roofStairStepRow = makeRangeRow('Step size (tiles)');
                roofStairStepRow.range.min = '0.01';
                roofStairStepRow.range.max = '20';
                roofStairStepRow.range.step = '0.01';
                roofStairStepRow.number.min = '0.01';
		                roofStairStepRow.number.max = '20';
	                roofStairStepRow.number.step = '0.01';
	                roofStairStepRow.range.value = String(roofMatVarNormalized.stairShift.stepSize);
	                roofStairStepRow.number.value = formatFloat(roofMatVarNormalized.stairShift.stepSize, 2);
	                applyRangeRowMeta(roofStairStepRow, {
	                    tooltip: tip(
	                        'How often the shift increments (in tile units).',
	                        'Typical: 1 for per-row staggering.',
	                        'Too much: large values make the shift rare and less useful.'
	                    )
	                });
	                roofStairGroup.body.appendChild(roofStairStepRow.row);

                const roofStairShiftRow = makeRangeRow('Shift per step');
                roofStairShiftRow.range.min = '-1';
                roofStairShiftRow.range.max = '1';
                roofStairShiftRow.range.step = '0.01';
                roofStairShiftRow.number.min = '-1';
	                roofStairShiftRow.number.max = '1';
	                roofStairShiftRow.number.step = '0.01';
	                roofStairShiftRow.range.value = String(roofMatVarNormalized.stairShift.shift);
	                roofStairShiftRow.number.value = formatFloat(roofMatVarNormalized.stairShift.shift, 2);
	                applyRangeRowMeta(roofStairShiftRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Shift amount applied per step (in UV tile units).',
	                        'Typical brick bond: small offsets like 0.4 / 0.8 patterns.',
	                        'Too much: bricks/mortar stop lining up.'
	                    )
	                });
	                roofStairGroup.body.appendChild(roofStairShiftRow.row);

                const roofStairModeRow = document.createElement('div');
                roofStairModeRow.className = 'building-fab-row building-fab-row-wide';
                const roofStairModeLabel = document.createElement('div');
	                roofStairModeLabel.className = 'building-fab-row-label';
	                roofStairModeLabel.textContent = 'Mode';
	                const roofStairModeSelect = document.createElement('select');
	                roofStairModeSelect.className = 'building-fab-select';
	                for (const v of ['stair', 'alternate', 'random', 'pattern3']) {
	                    const opt = document.createElement('option');
	                    opt.value = v;
	                    opt.textContent =
	                        v === 'random'
	                            ? 'Random (per step)'
	                            : (v === 'alternate'
	                                ? 'Alternate (0 / shift)'
	                                : (v === 'pattern3' ? 'Bond 3-step (0 / A / B)' : 'Stair (shift += stepIndex)'));
	                    roofStairModeSelect.appendChild(opt);
	                }
	                roofStairModeSelect.value = roofMatVarNormalized.stairShift.mode || 'stair';
	                applySelectRowMeta(
	                    { label: roofStairModeLabel, select: roofStairModeSelect },
	                    {
	                        tooltip: tip(
	                            'How the shift evolves per step.',
	                            'Typical: Stair/Alternate for simple bonds, Bond 3-step for 0/A/B patterns, Random for noise.',
	                            'Too much: Random can look chaotic for brick bonds.'
	                        )
	                    }
	                );
	                roofStairModeRow.appendChild(roofStairModeLabel);
	                roofStairModeRow.appendChild(roofStairModeSelect);
	                roofStairGroup.body.appendChild(roofStairModeRow);

	                const roofStairPatternARow = makeRangeRow('Pattern A');
	                roofStairPatternARow.range.min = '-1';
	                roofStairPatternARow.range.max = '1';
	                roofStairPatternARow.range.step = '0.01';
	                roofStairPatternARow.number.min = '-1';
	                roofStairPatternARow.number.max = '1';
	                roofStairPatternARow.number.step = '0.01';
	                roofStairPatternARow.range.value = String(roofMatVarNormalized.stairShift.patternA ?? 0.4);
	                roofStairPatternARow.number.value = formatFloat(roofMatVarNormalized.stairShift.patternA ?? 0.4, 2);
	                applyRangeRowMeta(roofStairPatternARow, {
	                    tooltip: tip(
	                        'Multiplier used for the 2nd step when Mode is Bond 3-step.',
	                        'Typical: 0.4.',
	                        'Too much: bricks stop lining up.'
	                    )
	                });
	                roofStairGroup.body.appendChild(roofStairPatternARow.row);

	                const roofStairPatternBRow = makeRangeRow('Pattern B');
	                roofStairPatternBRow.range.min = '-1';
	                roofStairPatternBRow.range.max = '1';
	                roofStairPatternBRow.range.step = '0.01';
	                roofStairPatternBRow.number.min = '-1';
	                roofStairPatternBRow.number.max = '1';
	                roofStairPatternBRow.number.step = '0.01';
	                roofStairPatternBRow.range.value = String(roofMatVarNormalized.stairShift.patternB ?? 0.8);
	                roofStairPatternBRow.number.value = formatFloat(roofMatVarNormalized.stairShift.patternB ?? 0.8, 2);
	                applyRangeRowMeta(roofStairPatternBRow, {
	                    tooltip: tip(
	                        'Multiplier used for the 3rd step when Mode is Bond 3-step.',
	                        'Typical: 0.8.',
	                        'Too much: bricks stop lining up.'
	                    )
	                });
	                roofStairGroup.body.appendChild(roofStairPatternBRow.row);

	                const roofStairBlendRow = makeRangeRow('Blend width');
	                roofStairBlendRow.range.min = '0';
	                roofStairBlendRow.range.max = '0.49';
                roofStairBlendRow.range.step = '0.01';
                roofStairBlendRow.number.min = '0';
                roofStairBlendRow.number.max = '0.49';
	                roofStairBlendRow.number.step = '0.01';
	                roofStairBlendRow.range.value = String(roofMatVarNormalized.stairShift.blendWidth ?? 0.0);
	                roofStairBlendRow.number.value = formatFloat(roofMatVarNormalized.stairShift.blendWidth ?? 0.0, 2);
	                applyRangeRowMeta(roofStairBlendRow, {
	                    tooltip: tip(
	                        'Softness of blending between steps.',
	                        'Typical: 0.0–0.25.',
	                        'Too much: mushy/blurred shifting.'
	                    )
	                });
	                roofStairGroup.body.appendChild(roofStairBlendRow.row);

                const roofStairDirRow = document.createElement('div');
                roofStairDirRow.className = 'building-fab-row building-fab-row-wide';
                const roofStairDirLabel = document.createElement('div');
                roofStairDirLabel.className = 'building-fab-row-label';
                roofStairDirLabel.textContent = 'Direction';
                const roofStairDirSelect = document.createElement('select');
                roofStairDirSelect.className = 'building-fab-select';
	                for (const v of ['horizontal', 'vertical']) {
	                    const opt = document.createElement('option');
	                    opt.value = v;
	                    opt.textContent = v === 'vertical' ? 'Vertical (shift V per U step)' : 'Horizontal (shift U per V step)';
	                    roofStairDirSelect.appendChild(opt);
	                }
	                roofStairDirSelect.value = roofMatVarNormalized.stairShift.direction;
	                applySelectRowMeta(
	                    { label: roofStairDirLabel, select: roofStairDirSelect },
	                    {
	                        tooltip: tip(
	                            'Which UV axis is shifted per step.',
	                            'Typical: horizontal for brick bonds.',
	                            'Too much: wrong direction makes the bond look odd.'
	                        )
	                    }
	                );
	                roofStairDirRow.appendChild(roofStairDirLabel);
	                roofStairDirRow.appendChild(roofStairDirSelect);
	                roofStairGroup.body.appendChild(roofStairDirRow);
	                roofMatVarBrickGroup.body.appendChild(roofStairGroup.details);

	                const roofPerBrick = roofBrickCfg?.perBrick ?? null;
	                const roofPerBrickGroup = makeDetailsSection('Per-brick variation', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:perBrick` });
	                applyTooltip(
	                    roofPerBrickGroup.label,
	                    tip(
	                        'Subtle per-brick breakup (hue/value/roughness per brick).',
	                        'Use low Strength and keep shifts small.',
	                        'Too much: noisy, speckled brickwork.'
	                    )
	                );
	                const roofPerBrickToggle = makeToggleRow('Enable per-brick variation');
	                roofPerBrickToggle.input.checked = !!roofPerBrick?.enabled;
	                roofPerBrickToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
	                applyToggleRowMeta(roofPerBrickToggle, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Enables per-brick variation.',
	                        'Typical: enabled for brick materials, low strength.',
	                        'Too much: bricks look randomly colored.'
	                    )
	                });
	                roofPerBrickGroup.body.appendChild(roofPerBrickToggle.toggle);

	                const roofPerBrickStrengthRow = makeRangeRow('Strength');
	                roofPerBrickStrengthRow.range.min = '0';
	                roofPerBrickStrengthRow.range.max = '2';
	                roofPerBrickStrengthRow.range.step = '0.01';
	                roofPerBrickStrengthRow.number.min = '0';
	                roofPerBrickStrengthRow.number.max = '2';
	                roofPerBrickStrengthRow.number.step = '0.01';
	                roofPerBrickStrengthRow.range.value = String(roofPerBrick?.intensity ?? 0.0);
	                roofPerBrickStrengthRow.number.value = formatFloat(roofPerBrick?.intensity ?? 0.0, 2);
	                applyRangeRowMeta(roofPerBrickStrengthRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Overall strength of per-brick variation.',
	                        'Typical: 0.05–0.40.',
	                        'Too much: noisy speckled bricks.'
	                    )
	                });
	                roofPerBrickGroup.body.appendChild(roofPerBrickStrengthRow.row);

	                const roofPerBrickHueRow = makeRangeRow('Hue shift (deg)');
	                roofPerBrickHueRow.range.min = '-180';
	                roofPerBrickHueRow.range.max = '180';
	                roofPerBrickHueRow.range.step = '1';
	                roofPerBrickHueRow.number.min = '-180';
	                roofPerBrickHueRow.number.max = '180';
	                roofPerBrickHueRow.number.step = '1';
	                roofPerBrickHueRow.range.value = String(roofPerBrick?.hueDegrees ?? 0.0);
	                roofPerBrickHueRow.number.value = String(Math.round(roofPerBrick?.hueDegrees ?? 0.0));
	                applyRangeRowMeta(roofPerBrickHueRow, {
	                    tooltip: tip(
	                        'Hue drift per brick.',
	                        'Typical: ±5–20°.',
	                        'Too much: rainbow bricks.'
	                    )
	                });
	                roofPerBrickGroup.body.appendChild(roofPerBrickHueRow.row);

	                const roofPerBrickValueRow = makeRangeRow('Value');
	                roofPerBrickValueRow.range.min = '-1';
	                roofPerBrickValueRow.range.max = '1';
	                roofPerBrickValueRow.range.step = '0.01';
	                roofPerBrickValueRow.number.min = '-1';
	                roofPerBrickValueRow.number.max = '1';
	                roofPerBrickValueRow.number.step = '0.01';
	                roofPerBrickValueRow.range.value = String(roofPerBrick?.value ?? 0.0);
	                roofPerBrickValueRow.number.value = formatFloat(roofPerBrick?.value ?? 0.0, 2);
	                applyRangeRowMeta(roofPerBrickValueRow, {
	                    tooltip: tip(
	                        'Brightness variation per brick.',
	                        'Typical: small.',
	                        'Too much: patchy, noisy bricks.'
	                    )
	                });
	                roofPerBrickGroup.body.appendChild(roofPerBrickValueRow.row);

	                const roofPerBrickSaturationRow = makeRangeRow('Saturation');
	                roofPerBrickSaturationRow.range.min = '-1';
	                roofPerBrickSaturationRow.range.max = '1';
	                roofPerBrickSaturationRow.range.step = '0.01';
	                roofPerBrickSaturationRow.number.min = '-1';
	                roofPerBrickSaturationRow.number.max = '1';
	                roofPerBrickSaturationRow.number.step = '0.01';
	                roofPerBrickSaturationRow.range.value = String(roofPerBrick?.saturation ?? 0.0);
	                roofPerBrickSaturationRow.number.value = formatFloat(roofPerBrick?.saturation ?? 0.0, 2);
	                applyRangeRowMeta(roofPerBrickSaturationRow, {
	                    tooltip: tip(
	                        'Saturation variation per brick.',
	                        'Typical: small.',
	                        'Too much: unnaturally colorful bricks.'
	                    )
	                });
	                roofPerBrickGroup.body.appendChild(roofPerBrickSaturationRow.row);

	                const roofPerBrickRoughnessRow = makeRangeRow('Roughness');
	                roofPerBrickRoughnessRow.range.min = '-1';
	                roofPerBrickRoughnessRow.range.max = '1';
	                roofPerBrickRoughnessRow.range.step = '0.01';
	                roofPerBrickRoughnessRow.number.min = '-1';
	                roofPerBrickRoughnessRow.number.max = '1';
	                roofPerBrickRoughnessRow.number.step = '0.01';
	                roofPerBrickRoughnessRow.range.value = String(roofPerBrick?.roughness ?? 0.0);
	                roofPerBrickRoughnessRow.number.value = formatFloat(roofPerBrick?.roughness ?? 0.0, 2);
	                applyRangeRowMeta(roofPerBrickRoughnessRow, {
	                    tooltip: tip(
	                        'Roughness variation per brick.',
	                        'Typical: subtle.',
	                        'Too much: sparkly speckling.'
	                    )
	                });
	                roofPerBrickGroup.body.appendChild(roofPerBrickRoughnessRow.row);

	                const roofPerBrickNormalRow = makeRangeRow('Normal');
	                roofPerBrickNormalRow.range.min = '-1';
	                roofPerBrickNormalRow.range.max = '1';
	                roofPerBrickNormalRow.range.step = '0.01';
	                roofPerBrickNormalRow.number.min = '-1';
	                roofPerBrickNormalRow.number.max = '1';
	                roofPerBrickNormalRow.number.step = '0.01';
	                roofPerBrickNormalRow.range.value = String(roofPerBrick?.normal ?? 0.0);
	                roofPerBrickNormalRow.number.value = formatFloat(roofPerBrick?.normal ?? 0.0, 2);
	                applyRangeRowMeta(roofPerBrickNormalRow, {
	                    tooltip: tip(
	                        'Normal variation per brick.',
	                        'Typical: 0.',
	                        'Too much: bumpy noisy bricks.'
	                    )
	                });
	                roofPerBrickGroup.body.appendChild(roofPerBrickNormalRow.row);
	                roofMatVarBrickGroup.body.appendChild(roofPerBrickGroup.details);

	                const roofMortar = roofBrickCfg?.mortar ?? null;
	                const roofMortarGroup = makeDetailsSection('Mortar variation', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:mortar` });
	                applyTooltip(
	                    roofMortarGroup.label,
	                    tip(
	                        'Separate-ish look for mortar lines (different value/roughness + optional grime).',
	                        'Use low Strength and keep it subtle.',
	                        'Too much: mortar becomes more prominent than the bricks.'
	                    )
	                );
	                const roofMortarToggle = makeToggleRow('Enable mortar variation');
	                roofMortarToggle.input.checked = !!roofMortar?.enabled;
	                roofMortarToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
	                applyToggleRowMeta(roofMortarToggle, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Enables mortar-line variation.',
	                        'Typical: slight darkening + roughness increase.',
	                        'Too much: bright/dirty outlines around every brick.'
	                    )
	                });
	                roofMortarGroup.body.appendChild(roofMortarToggle.toggle);

	                const roofMortarStrengthRow = makeRangeRow('Strength');
	                roofMortarStrengthRow.range.min = '0';
	                roofMortarStrengthRow.range.max = '2';
	                roofMortarStrengthRow.range.step = '0.01';
	                roofMortarStrengthRow.number.min = '0';
	                roofMortarStrengthRow.number.max = '2';
	                roofMortarStrengthRow.number.step = '0.01';
	                roofMortarStrengthRow.range.value = String(roofMortar?.intensity ?? 0.0);
	                roofMortarStrengthRow.number.value = formatFloat(roofMortar?.intensity ?? 0.0, 2);
	                applyRangeRowMeta(roofMortarStrengthRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Overall strength of mortar variation.',
	                        'Typical: 0.05–0.40.',
	                        'Too much: thick, noisy mortar lines.'
	                    )
	                });
	                roofMortarGroup.body.appendChild(roofMortarStrengthRow.row);

	                const roofMortarHueRow = makeRangeRow('Hue shift (deg)');
	                roofMortarHueRow.range.min = '-180';
	                roofMortarHueRow.range.max = '180';
	                roofMortarHueRow.range.step = '1';
	                roofMortarHueRow.number.min = '-180';
	                roofMortarHueRow.number.max = '180';
	                roofMortarHueRow.number.step = '1';
	                roofMortarHueRow.range.value = String(roofMortar?.hueDegrees ?? 0.0);
	                roofMortarHueRow.number.value = String(Math.round(roofMortar?.hueDegrees ?? 0.0));
	                applyRangeRowMeta(roofMortarHueRow, {
	                    tooltip: tip(
	                        'Hue shift applied to mortar.',
	                        'Typical: small.',
	                        'Too much: colorful mortar.'
	                    )
	                });
	                roofMortarGroup.body.appendChild(roofMortarHueRow.row);

	                const roofMortarValueRow = makeRangeRow('Value');
	                roofMortarValueRow.range.min = '-1';
	                roofMortarValueRow.range.max = '1';
	                roofMortarValueRow.range.step = '0.01';
	                roofMortarValueRow.number.min = '-1';
	                roofMortarValueRow.number.max = '1';
	                roofMortarValueRow.number.step = '0.01';
	                roofMortarValueRow.range.value = String(roofMortar?.value ?? 0.0);
	                roofMortarValueRow.number.value = formatFloat(roofMortar?.value ?? 0.0, 2);
	                applyRangeRowMeta(roofMortarValueRow, {
	                    tooltip: tip(
	                        'Brightness/value shift applied to mortar.',
	                        'Typical: slightly darker.',
	                        'Too much: high-contrast outlines.'
	                    )
	                });
	                roofMortarGroup.body.appendChild(roofMortarValueRow.row);

	                const roofMortarSaturationRow = makeRangeRow('Saturation');
	                roofMortarSaturationRow.range.min = '-1';
	                roofMortarSaturationRow.range.max = '1';
	                roofMortarSaturationRow.range.step = '0.01';
	                roofMortarSaturationRow.number.min = '-1';
	                roofMortarSaturationRow.number.max = '1';
	                roofMortarSaturationRow.number.step = '0.01';
	                roofMortarSaturationRow.range.value = String(roofMortar?.saturation ?? 0.0);
	                roofMortarSaturationRow.number.value = formatFloat(roofMortar?.saturation ?? 0.0, 2);
	                applyRangeRowMeta(roofMortarSaturationRow, {
	                    tooltip: tip(
	                        'Saturation shift applied to mortar.',
	                        'Typical: slightly desaturated.',
	                        'Too much: colorful mortar.'
	                    )
	                });
	                roofMortarGroup.body.appendChild(roofMortarSaturationRow.row);

	                const roofMortarRoughnessRow = makeRangeRow('Roughness');
	                roofMortarRoughnessRow.range.min = '-1';
	                roofMortarRoughnessRow.range.max = '1';
	                roofMortarRoughnessRow.range.step = '0.01';
	                roofMortarRoughnessRow.number.min = '-1';
	                roofMortarRoughnessRow.number.max = '1';
	                roofMortarRoughnessRow.number.step = '0.01';
	                roofMortarRoughnessRow.range.value = String(roofMortar?.roughness ?? 0.0);
	                roofMortarRoughnessRow.number.value = formatFloat(roofMortar?.roughness ?? 0.0, 2);
	                applyRangeRowMeta(roofMortarRoughnessRow, {
	                    tooltip: tip(
	                        'Roughness shift applied to mortar.',
	                        'Typical: slightly rougher than bricks.',
	                        'Too much: sparkly outlines.'
	                    )
	                });
	                roofMortarGroup.body.appendChild(roofMortarRoughnessRow.row);

	                const roofMortarNormalRow = makeRangeRow('Normal');
	                roofMortarNormalRow.range.min = '-1';
	                roofMortarNormalRow.range.max = '1';
	                roofMortarNormalRow.range.step = '0.01';
	                roofMortarNormalRow.number.min = '-1';
	                roofMortarNormalRow.number.max = '1';
	                roofMortarNormalRow.number.step = '0.01';
	                roofMortarNormalRow.range.value = String(roofMortar?.normal ?? 0.0);
	                roofMortarNormalRow.number.value = formatFloat(roofMortar?.normal ?? 0.0, 2);
	                applyRangeRowMeta(roofMortarNormalRow, {
	                    tooltip: tip(
	                        'Normal shift applied to mortar.',
	                        'Typical: 0.',
	                        'Too much: bumpy mortar artifacts.'
	                    )
	                });
	                roofMortarGroup.body.appendChild(roofMortarNormalRow.row);
	                roofMatVarBrickGroup.body.appendChild(roofMortarGroup.details);

	                const roofMacro1 = roofMatVarNormalized.macroLayers?.[1] ?? null;
	                const roofDetailGroup = makeDetailsSection('Macro layer 2', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:macro1` });
	                applyTooltip(
	                    roofDetailGroup.label,
	                    tip(
	                        'Macro layer 2 (Macro B): secondary breakup at a different scale.',
	                        'Use after Macro A for richer, less repetitive results.',
	                        'Too much: busy, noisy surfaces.'
	                    )
	                );
	                const roofDetailToggle = makeToggleRow('Enable macro layer 2');
	                roofDetailToggle.input.checked = !!roofMacro1?.enabled;
	                roofDetailToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
	                applyToggleRowMeta(roofDetailToggle, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Enables Macro B (secondary breakup).',
	                        'Typical: enabled for richer variation after Macro A.',
	                        'Too much: can make surfaces feel noisy.'
	                    )
	                });
	                roofDetailGroup.body.appendChild(roofDetailToggle.toggle);
	                const roofDetailStrengthRow = makeRangeRow('Intensity');
                roofDetailStrengthRow.range.min = '0';
                roofDetailStrengthRow.range.max = '2';
                roofDetailStrengthRow.range.step = '0.01';
                roofDetailStrengthRow.number.min = '0';
                roofDetailStrengthRow.number.max = '2';
	                roofDetailStrengthRow.number.step = '0.01';
	                roofDetailStrengthRow.range.value = String(roofMacro1?.intensity ?? 0.0);
	                roofDetailStrengthRow.number.value = formatFloat(roofMacro1?.intensity ?? 0.0, 2);
	                applyRangeRowMeta(roofDetailStrengthRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Strength of Macro B.',
	                        'Typical: 0.1–0.8.',
	                        'Too much: obvious noisy patterning.'
	                    )
	                });
	                roofDetailGroup.body.appendChild(roofDetailStrengthRow.row);

                const roofDetailScaleRow = makeRangeRow('Scale');
                roofDetailScaleRow.range.min = '0.01';
                roofDetailScaleRow.range.max = '20';
                roofDetailScaleRow.range.step = '0.01';
                roofDetailScaleRow.number.min = '0.01';
		                roofDetailScaleRow.number.max = '20';
	                roofDetailScaleRow.number.step = '0.01';
	                roofDetailScaleRow.range.value = String(roofMacro1?.scale ?? 1.0);
	                roofDetailScaleRow.number.value = formatFloat(roofMacro1?.scale ?? 1.0, 2);
	                applyRangeRowMeta(roofDetailScaleRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Frequency of Macro B (higher = smaller features).',
	                        'Typical: 1–10 depending on your base tile size.',
	                        'Too much: becomes micro-noise.'
	                    )
	                });
	                roofDetailGroup.body.appendChild(roofDetailScaleRow.row);

                const roofDetailHueRow = makeRangeRow('Hue shift (deg)');
                roofDetailHueRow.range.min = '-180';
                roofDetailHueRow.range.max = '180';
                roofDetailHueRow.range.step = '1';
                roofDetailHueRow.number.min = '-180';
	                roofDetailHueRow.number.max = '180';
	                roofDetailHueRow.number.step = '1';
	                roofDetailHueRow.range.value = String(roofMacro1?.hueDegrees ?? 0.0);
	                roofDetailHueRow.number.value = String(Math.round(roofMacro1?.hueDegrees ?? 0.0));
	                applyRangeRowMeta(roofDetailHueRow, {
	                    tooltip: tip(
	                        'Hue shift for Macro B.',
	                        'Typical: subtle.',
	                        'Too much: obvious colored patches.'
	                    )
	                });
	                roofDetailGroup.body.appendChild(roofDetailHueRow.row);

                const roofDetailValueRow = makeRangeRow('Value');
                roofDetailValueRow.range.min = '-1';
                roofDetailValueRow.range.max = '1';
                roofDetailValueRow.range.step = '0.01';
                roofDetailValueRow.number.min = '-1';
                roofDetailValueRow.number.max = '1';
                roofDetailValueRow.number.step = '0.01';
                roofDetailValueRow.range.value = String(roofMacro1?.value ?? 0.0);
                roofDetailValueRow.number.value = formatFloat(roofMacro1?.value ?? 0.0, 2);
                applyRangeRowMeta(roofDetailValueRow, {
	                    tooltip: tip(
	                        'Value/brightness shift for Macro B.',
	                        'Typical: small.',
	                        'Too much: harsh patchiness.'
	                    )
	                });
	                roofDetailGroup.body.appendChild(roofDetailValueRow.row);

                const roofDetailSaturationRow = makeRangeRow('Saturation');
                roofDetailSaturationRow.range.min = '-1';
                roofDetailSaturationRow.range.max = '1';
                roofDetailSaturationRow.range.step = '0.01';
                roofDetailSaturationRow.number.min = '-1';
                roofDetailSaturationRow.number.max = '1';
                roofDetailSaturationRow.number.step = '0.01';
                roofDetailSaturationRow.range.value = String(roofMacro1?.saturation ?? 0.0);
                roofDetailSaturationRow.number.value = formatFloat(roofMacro1?.saturation ?? 0.0, 2);
                applyRangeRowMeta(roofDetailSaturationRow, {
	                    tooltip: tip(
	                        'Saturation shift for Macro B.',
	                        'Typical: subtle.',
	                        'Too much: obvious saturation swings.'
	                    )
	                });
	                roofDetailGroup.body.appendChild(roofDetailSaturationRow.row);

                const roofDetailRoughnessRow = makeRangeRow('Roughness');
                roofDetailRoughnessRow.range.min = '-1';
                roofDetailRoughnessRow.range.max = '1';
                roofDetailRoughnessRow.range.step = '0.01';
                roofDetailRoughnessRow.number.min = '-1';
                roofDetailRoughnessRow.number.max = '1';
                roofDetailRoughnessRow.number.step = '0.01';
                roofDetailRoughnessRow.range.value = String(roofMacro1?.roughness ?? 0.0);
                roofDetailRoughnessRow.number.value = formatFloat(roofMacro1?.roughness ?? 0.0, 2);
                applyRangeRowMeta(roofDetailRoughnessRow, {
	                    tooltip: tip(
	                        'Roughness shift for Macro B.',
	                        'Typical: subtle.',
	                        'Too much: sparkly highlights or overly matte patches.'
	                    )
	                });
	                roofDetailGroup.body.appendChild(roofDetailRoughnessRow.row);

                const roofDetailNormalRow = makeRangeRow('Normal');
                roofDetailNormalRow.range.min = '-1';
                roofDetailNormalRow.range.max = '1';
                roofDetailNormalRow.range.step = '0.01';
                roofDetailNormalRow.number.min = '-1';
	                roofDetailNormalRow.number.max = '1';
	                roofDetailNormalRow.number.step = '0.01';
	                roofDetailNormalRow.range.value = String(roofMacro1?.normal ?? 0.0);
	                roofDetailNormalRow.number.value = formatFloat(roofMacro1?.normal ?? 0.0, 2);
	                applyRangeRowMeta(roofDetailNormalRow, {
	                    tooltip: tip(
	                        'Normal shift for Macro B.',
	                        'Typical: 0.',
	                        'Too much: warping/bumpy shading artifacts.'
	                    )
	                });
	                roofDetailGroup.body.appendChild(roofDetailNormalRow.row);
                roofMatVarMacroGroup.body.appendChild(roofDetailGroup.details);

	                const roofMacro2 = roofMatVarNormalized.macroLayers?.[2] ?? null;
	                const roofMacro2Group = makeDetailsSection('Macro layer 3', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:macro2` });
	                applyTooltip(
	                    roofMacro2Group.label,
	                    tip(
	                        'Macro layer 3 (Patches): mid-scale patchy variation.',
	                        'Good for repairs/batches and less uniform surfaces.',
	                        'Too much: camouflage-like patchiness.'
	                    )
	                );
	                const roofMacro2Toggle = makeToggleRow('Enable macro layer 3');
	                roofMacro2Toggle.input.checked = !!roofMacro2?.enabled;
	                roofMacro2Toggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
	                applyToggleRowMeta(roofMacro2Toggle, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Enables the patchy mid-variation layer.',
	                        'Typical: enable with low intensity.',
	                        'Too much: patch patterns dominate the material.'
	                    )
	                });
	                roofMacro2Group.body.appendChild(roofMacro2Toggle.toggle);

                const roofMacro2StrengthRow = makeRangeRow('Intensity');
                roofMacro2StrengthRow.range.min = '0';
                roofMacro2StrengthRow.range.max = '2';
                roofMacro2StrengthRow.range.step = '0.01';
                roofMacro2StrengthRow.number.min = '0';
                roofMacro2StrengthRow.number.max = '2';
	                roofMacro2StrengthRow.number.step = '0.01';
	                roofMacro2StrengthRow.range.value = String(roofMacro2?.intensity ?? 0.0);
	                roofMacro2StrengthRow.number.value = formatFloat(roofMacro2?.intensity ?? 0.0, 2);
	                applyRangeRowMeta(roofMacro2StrengthRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Strength of patch variation.',
	                        'Typical: 0.1–0.6.',
	                        'Too much: obvious patch camouflage.'
	                    )
	                });
	                roofMacro2Group.body.appendChild(roofMacro2StrengthRow.row);

                const roofMacro2ScaleRow = makeRangeRow('Scale');
                roofMacro2ScaleRow.range.min = '0.01';
                roofMacro2ScaleRow.range.max = '20';
                roofMacro2ScaleRow.range.step = '0.01';
                roofMacro2ScaleRow.number.min = '0.01';
		                roofMacro2ScaleRow.number.max = '20';
	                roofMacro2ScaleRow.number.step = '0.01';
		                roofMacro2ScaleRow.range.value = String(roofMacro2?.scale ?? 1.0);
		                roofMacro2ScaleRow.number.value = formatFloat(roofMacro2?.scale ?? 1.0, 2);
		                applyRangeRowMeta(roofMacro2ScaleRow, {
		                    mustHave: true,
		                    tooltip: tip(
		                        'Frequency of patch shapes (higher = smaller patches).',
		                        'Typical: 0.5–4.0.',
		                        'Too much: tiny noisy patches.'
		                    )
		                });
		                roofMacro2Group.body.appendChild(roofMacro2ScaleRow.row);

	                const roofMacro2CoverageRow = makeRangeRow('Coverage');
	                roofMacro2CoverageRow.range.min = '0';
	                roofMacro2CoverageRow.range.max = '1';
	                roofMacro2CoverageRow.range.step = '0.01';
	                roofMacro2CoverageRow.number.min = '0';
		                roofMacro2CoverageRow.number.max = '1';
		                roofMacro2CoverageRow.number.step = '0.01';
		                roofMacro2CoverageRow.range.value = String(roofMacro2?.coverage ?? 0.0);
		                roofMacro2CoverageRow.number.value = formatFloat(roofMacro2?.coverage ?? 0.0, 2);
		                applyRangeRowMeta(roofMacro2CoverageRow, {
		                    mustHave: true,
		                    tooltip: tip(
		                        'How much of the surface becomes “patches”. Higher = fewer patches.',
		                        'Typical: 0.55–0.80.',
		                        'Too much: 0 means everywhere; 1 means almost none.'
		                    )
		                });
		                roofMacro2Group.body.appendChild(roofMacro2CoverageRow.row);

	                const roofMacro2HueRow = makeRangeRow('Hue shift (deg)');
	                roofMacro2HueRow.range.min = '-180';
	                roofMacro2HueRow.range.max = '180';
                roofMacro2HueRow.range.step = '1';
                roofMacro2HueRow.number.min = '-180';
	                roofMacro2HueRow.number.max = '180';
	                roofMacro2HueRow.number.step = '1';
	                roofMacro2HueRow.range.value = String(roofMacro2?.hueDegrees ?? 0.0);
	                roofMacro2HueRow.number.value = String(Math.round(roofMacro2?.hueDegrees ?? 0.0));
	                applyRangeRowMeta(roofMacro2HueRow, {
	                    tooltip: tip(
	                        'Hue shift for patch variation.',
	                        'Typical: subtle (often 0).',
	                        'Too much: colorful patch camouflage.'
	                    )
	                });
	                roofMacro2Group.body.appendChild(roofMacro2HueRow.row);

                const roofMacro2ValueRow = makeRangeRow('Value');
                roofMacro2ValueRow.range.min = '-1';
                roofMacro2ValueRow.range.max = '1';
                roofMacro2ValueRow.range.step = '0.01';
                roofMacro2ValueRow.number.min = '-1';
                roofMacro2ValueRow.number.max = '1';
                roofMacro2ValueRow.number.step = '0.01';
                roofMacro2ValueRow.range.value = String(roofMacro2?.value ?? 0.0);
                roofMacro2ValueRow.number.value = formatFloat(roofMacro2?.value ?? 0.0, 2);
                applyRangeRowMeta(roofMacro2ValueRow, {
	                    tooltip: tip(
	                        'Value/brightness shift for patches.',
	                        'Typical: small.',
	                        'Too much: harsh patch contrast.'
	                    )
	                });
	                roofMacro2Group.body.appendChild(roofMacro2ValueRow.row);

                const roofMacro2SaturationRow = makeRangeRow('Saturation');
                roofMacro2SaturationRow.range.min = '-1';
                roofMacro2SaturationRow.range.max = '1';
                roofMacro2SaturationRow.range.step = '0.01';
                roofMacro2SaturationRow.number.min = '-1';
                roofMacro2SaturationRow.number.max = '1';
                roofMacro2SaturationRow.number.step = '0.01';
                roofMacro2SaturationRow.range.value = String(roofMacro2?.saturation ?? 0.0);
                roofMacro2SaturationRow.number.value = formatFloat(roofMacro2?.saturation ?? 0.0, 2);
                applyRangeRowMeta(roofMacro2SaturationRow, {
	                    tooltip: tip(
	                        'Saturation shift for patches.',
	                        'Typical: subtle.',
	                        'Too much: colored patches.'
	                    )
	                });
	                roofMacro2Group.body.appendChild(roofMacro2SaturationRow.row);

                const roofMacro2RoughnessRow = makeRangeRow('Roughness');
                roofMacro2RoughnessRow.range.min = '-1';
                roofMacro2RoughnessRow.range.max = '1';
                roofMacro2RoughnessRow.range.step = '0.01';
                roofMacro2RoughnessRow.number.min = '-1';
                roofMacro2RoughnessRow.number.max = '1';
                roofMacro2RoughnessRow.number.step = '0.01';
                roofMacro2RoughnessRow.range.value = String(roofMacro2?.roughness ?? 0.0);
                roofMacro2RoughnessRow.number.value = formatFloat(roofMacro2?.roughness ?? 0.0, 2);
                applyRangeRowMeta(roofMacro2RoughnessRow, {
	                    tooltip: tip(
	                        'Roughness shift for patches.',
	                        'Typical: subtle.',
	                        'Too much: sparkly or overly matte patch noise.'
	                    )
	                });
	                roofMacro2Group.body.appendChild(roofMacro2RoughnessRow.row);

                const roofMacro2NormalRow = makeRangeRow('Normal');
                roofMacro2NormalRow.range.min = '-1';
                roofMacro2NormalRow.range.max = '1';
                roofMacro2NormalRow.range.step = '0.01';
                roofMacro2NormalRow.number.min = '-1';
		                roofMacro2NormalRow.number.max = '1';
		                roofMacro2NormalRow.number.step = '0.01';
		                roofMacro2NormalRow.range.value = String(roofMacro2?.normal ?? 0.0);
		                roofMacro2NormalRow.number.value = formatFloat(roofMacro2?.normal ?? 0.0, 2);
		                applyRangeRowMeta(roofMacro2NormalRow, {
		                    tooltip: tip(
		                        'Normal shift for patch variation.',
		                        'Typical: 0.',
		                        'Too much: bumpy patch artifacts.'
		                    )
		                });
		                roofMacro2Group.body.appendChild(roofMacro2NormalRow.row);
	                roofMatVarMidGroup.body.appendChild(roofMacro2Group.details);

		                const roofMicro0 = roofMatVarNormalized.macroLayers?.[3] ?? null;
		                const roofMicroGroup = makeDetailsSection('Micro roughness', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:micro0` });
		                applyTooltip(
		                    roofMicroGroup.label,
		                    tip(
		                        'Micro breakup for surface response (mostly roughness, optionally normals).',
		                        'Use to avoid large flat glossy/matte areas.',
		                        'Too much: sparkly specular noise.'
		                    )
		                );
		                const roofMicroToggle = makeToggleRow('Enable micro variation');
		                roofMicroToggle.input.checked = !!roofMicro0?.enabled;
		                roofMicroToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
		                applyToggleRowMeta(roofMicroToggle, {
		                    mustHave: true,
		                    tooltip: tip(
		                        'Enables micro-scale variation (roughness-first).',
		                        'Typical: enable with low Intensity.',
		                        'Too much: noisy shimmer on highlights.'
		                    )
		                });
		                roofMicroGroup.body.appendChild(roofMicroToggle.toggle);

	                const roofMicroIntensityRow = makeRangeRow('Intensity');
	                roofMicroIntensityRow.range.min = '0';
	                roofMicroIntensityRow.range.max = '2';
	                roofMicroIntensityRow.range.step = '0.01';
	                roofMicroIntensityRow.number.min = '0';
	                roofMicroIntensityRow.number.max = '2';
		                roofMicroIntensityRow.number.step = '0.01';
		                roofMicroIntensityRow.range.value = String(roofMicro0?.intensity ?? 0.0);
		                roofMicroIntensityRow.number.value = formatFloat(roofMicro0?.intensity ?? 0.0, 2);
		                applyRangeRowMeta(roofMicroIntensityRow, {
		                    mustHave: true,
		                    tooltip: tip(
		                        'Strength of the micro mask.',
		                        'Typical: 0.1–0.8.',
		                        'Too much: micro-noise dominates.'
		                    )
		                });
		                roofMicroGroup.body.appendChild(roofMicroIntensityRow.row);

	                const roofMicroScaleRow = makeRangeRow('Scale');
	                roofMicroScaleRow.range.min = '0.01';
	                roofMicroScaleRow.range.max = '20';
	                roofMicroScaleRow.range.step = '0.01';
	                roofMicroScaleRow.number.min = '0.01';
			                roofMicroScaleRow.number.max = '20';
		                roofMicroScaleRow.number.step = '0.01';
		                roofMicroScaleRow.range.value = String(roofMicro0?.scale ?? 1.0);
		                roofMicroScaleRow.number.value = formatFloat(roofMicro0?.scale ?? 1.0, 2);
		                applyRangeRowMeta(roofMicroScaleRow, {
		                    mustHave: true,
		                    tooltip: tip(
		                        'Frequency of micro breakup (higher = smaller micro detail).',
		                        'Typical: 6–20.',
		                        'Too much: glittery surface noise.'
		                    )
		                });
		                roofMicroGroup.body.appendChild(roofMicroScaleRow.row);

	                const roofMicroRoughnessRow = makeRangeRow('Roughness');
	                roofMicroRoughnessRow.range.min = '-1';
		                roofMicroRoughnessRow.range.max = '1';
		                roofMicroRoughnessRow.range.step = '0.01';
	                roofMicroRoughnessRow.number.min = '-1';
		                roofMicroRoughnessRow.number.max = '1';
		                roofMicroRoughnessRow.number.step = '0.01';
		                roofMicroRoughnessRow.range.value = String(roofMicro0?.roughness ?? 0.0);
		                roofMicroRoughnessRow.number.value = formatFloat(roofMicro0?.roughness ?? 0.0, 2);
		                applyRangeRowMeta(roofMicroRoughnessRow, {
		                    mustHave: true,
		                    tooltip: tip(
		                        'Roughness shift driven by the micro mask.',
		                        'Typical: small positive values for subtle breakup.',
		                        'Too much: unstable specular response.'
		                    )
		                });
		                roofMicroGroup.body.appendChild(roofMicroRoughnessRow.row);

	                const roofMicroNormalRow = makeRangeRow('Normal');
	                roofMicroNormalRow.range.min = '-1';
		                roofMicroNormalRow.range.max = '1';
		                roofMicroNormalRow.range.step = '0.01';
	                roofMicroNormalRow.number.min = '-1';
		                roofMicroNormalRow.number.max = '1';
		                roofMicroNormalRow.number.step = '0.01';
		                roofMicroNormalRow.range.value = String(roofMicro0?.normal ?? 0.0);
		                roofMicroNormalRow.number.value = formatFloat(roofMicro0?.normal ?? 0.0, 2);
		                applyRangeRowMeta(roofMicroNormalRow, {
		                    tooltip: tip(
		                        'Optional micro normal boost/attenuation.',
		                        'Typical: 0.',
		                        'Too much: bumpy/shimmering shading artifacts.'
		                    )
		                });
		                roofMicroGroup.body.appendChild(roofMicroNormalRow.row);
	                roofMatVarMicroGroup.body.appendChild(roofMicroGroup.details);

		                const roofCracksLayer = roofMatVarNormalized.cracksLayer ?? null;
		                const roofCracksGroup = makeDetailsSection('Cracks', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:cracks` });
		                const roofCracksToggle = makeToggleRow('Enable cracks');
	                roofCracksToggle.input.checked = !!roofCracksLayer?.enabled;
	                roofCracksToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
	                applyTooltip(
	                    roofCracksGroup.label,
	                    tip(
	                        'Procedural cracks and fine damage.',
	                        'Use sparingly to avoid a “ruined” look.',
	                        'Too much: the surface reads as broken everywhere.'
	                    )
	                );
	                applyToggleRowMeta(roofCracksToggle, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Enables procedural cracks.',
	                        'Typical: enable with very low Strength.',
	                        'Too much: cracks dominate the material.'
	                    )
	                });
	                roofCracksGroup.body.appendChild(roofCracksToggle.toggle);
	                const roofCrackStrengthRow = makeRangeRow('Strength');
                roofCrackStrengthRow.range.min = '0';
                roofCrackStrengthRow.range.max = '2';
                roofCrackStrengthRow.range.step = '0.01';
                roofCrackStrengthRow.number.min = '0';
                roofCrackStrengthRow.number.max = '2';
	                roofCrackStrengthRow.number.step = '0.01';
	                roofCrackStrengthRow.range.value = String(roofCracksLayer?.intensity ?? 0.0);
	                roofCrackStrengthRow.number.value = formatFloat(roofCracksLayer?.intensity ?? 0.0, 2);
	                applyRangeRowMeta(roofCrackStrengthRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Strength/visibility of cracks.',
	                        'Typical: 0.02–0.20.',
	                        'Too much: strong crack networks everywhere.'
	                    )
	                });
	                roofCracksGroup.body.appendChild(roofCrackStrengthRow.row);

                const roofCrackScaleRow = makeRangeRow('Scale');
                roofCrackScaleRow.range.min = '0.01';
                roofCrackScaleRow.range.max = '20';
                roofCrackScaleRow.range.step = '0.01';
                roofCrackScaleRow.number.min = '0.01';
		                roofCrackScaleRow.number.max = '20';
	                roofCrackScaleRow.number.step = '0.01';
	                roofCrackScaleRow.range.value = String(roofCracksLayer?.scale ?? 1.0);
	                roofCrackScaleRow.number.value = formatFloat(roofCracksLayer?.scale ?? 1.0, 2);
	                applyRangeRowMeta(roofCrackScaleRow, {
	                    mustHave: true,
	                    tooltip: tip(
	                        'Frequency of crack patterns (higher = smaller cracks).',
	                        'Typical: 1–6.',
	                        'Too much: tiny noisy crack texture.'
	                    )
	                });
	                roofCracksGroup.body.appendChild(roofCrackScaleRow.row);

                const roofCrackHueRow = makeRangeRow('Hue shift (deg)');
                roofCrackHueRow.range.min = '-180';
                roofCrackHueRow.range.max = '180';
                roofCrackHueRow.range.step = '1';
                roofCrackHueRow.number.min = '-180';
	                roofCrackHueRow.number.max = '180';
	                roofCrackHueRow.number.step = '1';
	                roofCrackHueRow.range.value = String(roofCracksLayer?.hueDegrees ?? 0.0);
	                roofCrackHueRow.number.value = String(Math.round(roofCracksLayer?.hueDegrees ?? 0.0));
	                applyRangeRowMeta(roofCrackHueRow, {
	                    tooltip: tip(
	                        'Hue shift inside cracks.',
	                        'Typical: 0.',
	                        'Too much: colored cracks look like paint.'
	                    )
	                });
	                roofCracksGroup.body.appendChild(roofCrackHueRow.row);

                const roofCrackValueRow = makeRangeRow('Value');
                roofCrackValueRow.range.min = '-1';
                roofCrackValueRow.range.max = '1';
                roofCrackValueRow.range.step = '0.01';
                roofCrackValueRow.number.min = '-1';
                roofCrackValueRow.number.max = '1';
                roofCrackValueRow.number.step = '0.01';
                roofCrackValueRow.range.value = String(roofCracksLayer?.value ?? 0.0);
                roofCrackValueRow.number.value = formatFloat(roofCracksLayer?.value ?? 0.0, 2);
                applyRangeRowMeta(roofCrackValueRow, {
	                    tooltip: tip(
	                        'Value/brightness shift inside cracks.',
	                        'Typical: slightly darker.',
	                        'Too much: looks like drawn lines.'
	                    )
	                });
	                roofCracksGroup.body.appendChild(roofCrackValueRow.row);

                const roofCrackSaturationRow = makeRangeRow('Saturation');
                roofCrackSaturationRow.range.min = '-1';
                roofCrackSaturationRow.range.max = '1';
                roofCrackSaturationRow.range.step = '0.01';
                roofCrackSaturationRow.number.min = '-1';
                roofCrackSaturationRow.number.max = '1';
                roofCrackSaturationRow.number.step = '0.01';
                roofCrackSaturationRow.range.value = String(roofCracksLayer?.saturation ?? 0.0);
                roofCrackSaturationRow.number.value = formatFloat(roofCracksLayer?.saturation ?? 0.0, 2);
                applyRangeRowMeta(roofCrackSaturationRow, {
	                    tooltip: tip(
	                        'Saturation shift inside cracks.',
	                        'Typical: small negative saturation.',
	                        'Too much: colored crack lines.'
	                    )
	                });
	                roofCracksGroup.body.appendChild(roofCrackSaturationRow.row);

                const roofCrackRoughnessRow = makeRangeRow('Roughness');
                roofCrackRoughnessRow.range.min = '-1';
                roofCrackRoughnessRow.range.max = '1';
                roofCrackRoughnessRow.range.step = '0.01';
                roofCrackRoughnessRow.number.min = '-1';
                roofCrackRoughnessRow.number.max = '1';
                roofCrackRoughnessRow.number.step = '0.01';
                roofCrackRoughnessRow.range.value = String(roofCracksLayer?.roughness ?? 0.0);
                roofCrackRoughnessRow.number.value = formatFloat(roofCracksLayer?.roughness ?? 0.0, 2);
                applyRangeRowMeta(roofCrackRoughnessRow, {
	                    tooltip: tip(
	                        'Roughness shift inside cracks.',
	                        'Typical: small changes.',
	                        'Too much: noisy specular along crack lines.'
	                    )
	                });
	                roofCracksGroup.body.appendChild(roofCrackRoughnessRow.row);

                const roofCrackNormalRow = makeRangeRow('Normal');
                roofCrackNormalRow.range.min = '-1';
                roofCrackNormalRow.range.max = '1';
                roofCrackNormalRow.range.step = '0.01';
                roofCrackNormalRow.number.min = '-1';
	                roofCrackNormalRow.number.max = '1';
	                roofCrackNormalRow.number.step = '0.01';
	                roofCrackNormalRow.range.value = String(roofCracksLayer?.normal ?? 0.0);
	                roofCrackNormalRow.number.value = formatFloat(roofCracksLayer?.normal ?? 0.0, 2);
	                applyRangeRowMeta(roofCrackNormalRow, {
	                    tooltip: tip(
	                        'Normal shift inside cracks.',
	                        'Typical: 0.',
	                        'Too much: bumpy crack artifacts.'
	                    )
	                });
	                roofCracksGroup.body.appendChild(roofCrackNormalRow.row);
                roofMatVarWeatherGroup.body.appendChild(roofCracksGroup.details);

	                const syncRoofMatVarEnabled = () => {
	                    const enabled = !!layer.roof.materialVariation.enabled;
                        const objectSpace = roofMatVarSpaceSelect.value === 'object';
                        roofMatVarSpaceSelect.disabled = !allow || !enabled;
	                    roofSeedOffsetRow.range.disabled = !allow || !enabled;
	                    roofSeedOffsetRow.number.disabled = roofSeedOffsetRow.range.disabled;
	                    roofIntensityRow.range.disabled = !allow || !enabled;
	                    roofIntensityRow.number.disabled = roofIntensityRow.range.disabled;
	                    roofScaleRow.range.disabled = !allow || !enabled || objectSpace;
	                    roofScaleRow.number.disabled = roofScaleRow.range.disabled;
                        roofObjectScaleRow.range.disabled = !allow || !enabled || !objectSpace;
                        roofObjectScaleRow.number.disabled = roofObjectScaleRow.range.disabled;
                        roofMatVarNormalFlipXToggle.input.disabled = !allow || !enabled;
                        roofMatVarNormalFlipYToggle.input.disabled = !allow || !enabled;
                        roofMatVarNormalFlipZToggle.input.disabled = !allow || !enabled;
	                    roofAoAmountRow.range.disabled = !allow || !enabled;
	                    roofAoAmountRow.number.disabled = roofAoAmountRow.range.disabled;

                    roofMacroToggle.input.disabled = !allow || !enabled;
                    roofMacroIntensityRow.range.disabled = !allow || !enabled || !roofMacroToggle.input.checked;
                    roofMacroIntensityRow.number.disabled = roofMacroIntensityRow.range.disabled;
                    roofMacroScaleRow.range.disabled = !allow || !enabled || !roofMacroToggle.input.checked;
                    roofMacroScaleRow.number.disabled = roofMacroScaleRow.range.disabled;
                    roofMacroHueRow.range.disabled = !allow || !enabled || !roofMacroToggle.input.checked;
                    roofMacroHueRow.number.disabled = roofMacroHueRow.range.disabled;
                    roofMacroValueRow.range.disabled = !allow || !enabled || !roofMacroToggle.input.checked;
                    roofMacroValueRow.number.disabled = roofMacroValueRow.range.disabled;
                    roofMacroSaturationRow.range.disabled = !allow || !enabled || !roofMacroToggle.input.checked;
                    roofMacroSaturationRow.number.disabled = roofMacroSaturationRow.range.disabled;
                    roofMacroRoughnessRow.range.disabled = !allow || !enabled || !roofMacroToggle.input.checked;
                    roofMacroRoughnessRow.number.disabled = roofMacroRoughnessRow.range.disabled;
                    roofMacroNormalRow.range.disabled = !allow || !enabled || !roofMacroToggle.input.checked;
                    roofMacroNormalRow.number.disabled = roofMacroNormalRow.range.disabled;

                    roofGrimeToggle.input.disabled = !allow || !enabled;
                    roofGrimeStrengthRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
                    roofGrimeStrengthRow.number.disabled = roofGrimeStrengthRow.range.disabled;
                    roofGrimeWidthRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
                    roofGrimeWidthRow.number.disabled = roofGrimeWidthRow.range.disabled;
                    roofGrimeScaleRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
                    roofGrimeScaleRow.number.disabled = roofGrimeScaleRow.range.disabled;
                    roofGrimeHueRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
                    roofGrimeHueRow.number.disabled = roofGrimeHueRow.range.disabled;
                    roofGrimeValueRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
                    roofGrimeValueRow.number.disabled = roofGrimeValueRow.range.disabled;
                    roofGrimeSaturationRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
                    roofGrimeSaturationRow.number.disabled = roofGrimeSaturationRow.range.disabled;
                    roofGrimeRoughnessRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
                    roofGrimeRoughnessRow.number.disabled = roofGrimeRoughnessRow.range.disabled;
                    roofGrimeNormalRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
                    roofGrimeNormalRow.number.disabled = roofGrimeNormalRow.range.disabled;

                    roofStreaksToggle.input.disabled = !allow || !enabled;
                    roofStreakStrengthRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
                    roofStreakStrengthRow.number.disabled = roofStreakStrengthRow.range.disabled;
                    roofStreakScaleRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
                    roofStreakScaleRow.number.disabled = roofStreakScaleRow.range.disabled;
                    roofStreakLedgeStrengthRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
                    roofStreakLedgeStrengthRow.number.disabled = roofStreakLedgeStrengthRow.range.disabled;
                    roofStreakLedgeScaleRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
                    roofStreakLedgeScaleRow.number.disabled = roofStreakLedgeScaleRow.range.disabled;
                    roofStreakHueRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
                    roofStreakHueRow.number.disabled = roofStreakHueRow.range.disabled;
                    roofStreakValueRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
                    roofStreakValueRow.number.disabled = roofStreakValueRow.range.disabled;
                    roofStreakSaturationRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
                    roofStreakSaturationRow.number.disabled = roofStreakSaturationRow.range.disabled;
                    roofStreakRoughnessRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
                    roofStreakRoughnessRow.number.disabled = roofStreakRoughnessRow.range.disabled;
	                    roofStreakNormalRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
	                    roofStreakNormalRow.number.disabled = roofStreakNormalRow.range.disabled;

	                    roofExposureToggle.input.disabled = !allow || !enabled;
	                    roofExposureStrengthRow.range.disabled = !allow || !enabled || !roofExposureToggle.input.checked;
	                    roofExposureStrengthRow.number.disabled = roofExposureStrengthRow.range.disabled;
	                    roofExposureExponentRow.range.disabled = !allow || !enabled || !roofExposureToggle.input.checked;
	                    roofExposureExponentRow.number.disabled = roofExposureExponentRow.range.disabled;
	                    roofExposureAzimuthRow.range.disabled = !allow || !enabled || !roofExposureToggle.input.checked;
	                    roofExposureAzimuthRow.number.disabled = roofExposureAzimuthRow.range.disabled;
	                    roofExposureElevationRow.range.disabled = !allow || !enabled || !roofExposureToggle.input.checked;
	                    roofExposureElevationRow.number.disabled = roofExposureElevationRow.range.disabled;
	                    roofExposureValueRow.range.disabled = !allow || !enabled || !roofExposureToggle.input.checked;
	                    roofExposureValueRow.number.disabled = roofExposureValueRow.range.disabled;
	                    roofExposureSaturationRow.range.disabled = !allow || !enabled || !roofExposureToggle.input.checked;
	                    roofExposureSaturationRow.number.disabled = roofExposureSaturationRow.range.disabled;
	                    roofExposureRoughnessRow.range.disabled = !allow || !enabled || !roofExposureToggle.input.checked;
	                    roofExposureRoughnessRow.number.disabled = roofExposureRoughnessRow.range.disabled;

	                    roofEdgeToggle.input.disabled = !allow || !enabled;
	                    roofEdgeStrengthRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
	                    roofEdgeStrengthRow.number.disabled = roofEdgeStrengthRow.range.disabled;
                    roofEdgeWidthRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
                    roofEdgeWidthRow.number.disabled = roofEdgeWidthRow.range.disabled;
                    roofEdgeScaleRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
                    roofEdgeScaleRow.number.disabled = roofEdgeScaleRow.range.disabled;
                    roofEdgeHueRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
                    roofEdgeHueRow.number.disabled = roofEdgeHueRow.range.disabled;
                    roofEdgeValueRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
                    roofEdgeValueRow.number.disabled = roofEdgeValueRow.range.disabled;
                    roofEdgeSaturationRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
                    roofEdgeSaturationRow.number.disabled = roofEdgeSaturationRow.range.disabled;
                    roofEdgeRoughnessRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
                    roofEdgeRoughnessRow.number.disabled = roofEdgeRoughnessRow.range.disabled;
                    roofEdgeNormalRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
                    roofEdgeNormalRow.number.disabled = roofEdgeNormalRow.range.disabled;

                    roofDustToggle.input.disabled = !allow || !enabled;
                    roofDustStrengthRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
                    roofDustStrengthRow.number.disabled = roofDustStrengthRow.range.disabled;
                    roofDustWidthRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
                    roofDustWidthRow.number.disabled = roofDustWidthRow.range.disabled;
                    roofDustScaleRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
                    roofDustScaleRow.number.disabled = roofDustScaleRow.range.disabled;
                    roofDustHueRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
                    roofDustHueRow.number.disabled = roofDustHueRow.range.disabled;
                    roofDustValueRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
                    roofDustValueRow.number.disabled = roofDustValueRow.range.disabled;
                    roofDustSaturationRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
                    roofDustSaturationRow.number.disabled = roofDustSaturationRow.range.disabled;
                    roofDustRoughnessRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
                    roofDustRoughnessRow.number.disabled = roofDustRoughnessRow.range.disabled;
                    roofDustNormalRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
                    roofDustNormalRow.number.disabled = roofDustNormalRow.range.disabled;

                    roofAntiController.syncDisabled({ allow, parentEnabled: enabled });

	                    roofBricksPerTileXRow.range.disabled = !allow || !enabled;
	                    roofBricksPerTileXRow.number.disabled = roofBricksPerTileXRow.range.disabled;
	                    roofBricksPerTileYRow.range.disabled = !allow || !enabled;
	                    roofBricksPerTileYRow.number.disabled = roofBricksPerTileYRow.range.disabled;
	                    roofMortarWidthRow.range.disabled = !allow || !enabled;
	                    roofMortarWidthRow.number.disabled = roofMortarWidthRow.range.disabled;
	                    roofBrickOffsetXRow.range.disabled = !allow || !enabled;
	                    roofBrickOffsetXRow.number.disabled = roofBrickOffsetXRow.range.disabled;
	                    roofBrickOffsetYRow.range.disabled = !allow || !enabled;
	                    roofBrickOffsetYRow.number.disabled = roofBrickOffsetYRow.range.disabled;

	                    roofPerBrickToggle.input.disabled = !allow || !enabled;
	                    roofPerBrickStrengthRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
	                    roofPerBrickStrengthRow.number.disabled = roofPerBrickStrengthRow.range.disabled;
	                    roofPerBrickHueRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
	                    roofPerBrickHueRow.number.disabled = roofPerBrickHueRow.range.disabled;
	                    roofPerBrickValueRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
	                    roofPerBrickValueRow.number.disabled = roofPerBrickValueRow.range.disabled;
	                    roofPerBrickSaturationRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
	                    roofPerBrickSaturationRow.number.disabled = roofPerBrickSaturationRow.range.disabled;
	                    roofPerBrickRoughnessRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
	                    roofPerBrickRoughnessRow.number.disabled = roofPerBrickRoughnessRow.range.disabled;
	                    roofPerBrickNormalRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
	                    roofPerBrickNormalRow.number.disabled = roofPerBrickNormalRow.range.disabled;

	                    roofMortarToggle.input.disabled = !allow || !enabled;
	                    roofMortarStrengthRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
	                    roofMortarStrengthRow.number.disabled = roofMortarStrengthRow.range.disabled;
	                    roofMortarHueRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
	                    roofMortarHueRow.number.disabled = roofMortarHueRow.range.disabled;
	                    roofMortarValueRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
	                    roofMortarValueRow.number.disabled = roofMortarValueRow.range.disabled;
	                    roofMortarSaturationRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
	                    roofMortarSaturationRow.number.disabled = roofMortarSaturationRow.range.disabled;
	                    roofMortarRoughnessRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
	                    roofMortarRoughnessRow.number.disabled = roofMortarRoughnessRow.range.disabled;
	                    roofMortarNormalRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
	                    roofMortarNormalRow.number.disabled = roofMortarNormalRow.range.disabled;

	                    roofStairToggle.input.disabled = !allow || !enabled;
	                    roofStairStrengthRow.range.disabled = !allow || !enabled || !roofStairToggle.input.checked;
	                    roofStairStrengthRow.number.disabled = roofStairStrengthRow.range.disabled;
                    roofStairStepRow.range.disabled = !allow || !enabled || !roofStairToggle.input.checked;
                    roofStairStepRow.number.disabled = roofStairStepRow.range.disabled;
	                    roofStairShiftRow.range.disabled = !allow || !enabled || !roofStairToggle.input.checked;
	                    roofStairShiftRow.number.disabled = roofStairShiftRow.range.disabled;
	                    roofStairModeSelect.disabled = !allow || !enabled || !roofStairToggle.input.checked;
	                    const roofStairIsPattern3 = roofStairModeSelect.value === 'pattern3';
	                    roofStairPatternARow.range.disabled = !allow || !enabled || !roofStairToggle.input.checked || !roofStairIsPattern3;
	                    roofStairPatternARow.number.disabled = roofStairPatternARow.range.disabled;
	                    roofStairPatternBRow.range.disabled = !allow || !enabled || !roofStairToggle.input.checked || !roofStairIsPattern3;
	                    roofStairPatternBRow.number.disabled = roofStairPatternBRow.range.disabled;
	                    roofStairBlendRow.range.disabled = !allow || !enabled || !roofStairToggle.input.checked;
	                    roofStairBlendRow.number.disabled = roofStairBlendRow.range.disabled;
	                    roofStairDirSelect.disabled = !allow || !enabled || !roofStairToggle.input.checked;

                    roofDetailToggle.input.disabled = !allow || !enabled;
                    roofDetailStrengthRow.range.disabled = !allow || !enabled || !roofDetailToggle.input.checked;
                    roofDetailStrengthRow.number.disabled = roofDetailStrengthRow.range.disabled;
                    roofDetailScaleRow.range.disabled = !allow || !enabled || !roofDetailToggle.input.checked;
                    roofDetailScaleRow.number.disabled = roofDetailScaleRow.range.disabled;
                    roofDetailHueRow.range.disabled = !allow || !enabled || !roofDetailToggle.input.checked;
                    roofDetailHueRow.number.disabled = roofDetailHueRow.range.disabled;
                    roofDetailValueRow.range.disabled = !allow || !enabled || !roofDetailToggle.input.checked;
                    roofDetailValueRow.number.disabled = roofDetailValueRow.range.disabled;
                    roofDetailSaturationRow.range.disabled = !allow || !enabled || !roofDetailToggle.input.checked;
                    roofDetailSaturationRow.number.disabled = roofDetailSaturationRow.range.disabled;
                    roofDetailRoughnessRow.range.disabled = !allow || !enabled || !roofDetailToggle.input.checked;
                    roofDetailRoughnessRow.number.disabled = roofDetailRoughnessRow.range.disabled;
                    roofDetailNormalRow.range.disabled = !allow || !enabled || !roofDetailToggle.input.checked;
                    roofDetailNormalRow.number.disabled = roofDetailNormalRow.range.disabled;

                    roofMacro2Toggle.input.disabled = !allow || !enabled;
	                    roofMacro2StrengthRow.range.disabled = !allow || !enabled || !roofMacro2Toggle.input.checked;
	                    roofMacro2StrengthRow.number.disabled = roofMacro2StrengthRow.range.disabled;
	                    roofMacro2ScaleRow.range.disabled = !allow || !enabled || !roofMacro2Toggle.input.checked;
	                    roofMacro2ScaleRow.number.disabled = roofMacro2ScaleRow.range.disabled;
	                    roofMacro2CoverageRow.range.disabled = !allow || !enabled || !roofMacro2Toggle.input.checked;
	                    roofMacro2CoverageRow.number.disabled = roofMacro2CoverageRow.range.disabled;
	                    roofMacro2HueRow.range.disabled = !allow || !enabled || !roofMacro2Toggle.input.checked;
	                    roofMacro2HueRow.number.disabled = roofMacro2HueRow.range.disabled;
                    roofMacro2ValueRow.range.disabled = !allow || !enabled || !roofMacro2Toggle.input.checked;
                    roofMacro2ValueRow.number.disabled = roofMacro2ValueRow.range.disabled;
                    roofMacro2SaturationRow.range.disabled = !allow || !enabled || !roofMacro2Toggle.input.checked;
                    roofMacro2SaturationRow.number.disabled = roofMacro2SaturationRow.range.disabled;
	                    roofMacro2RoughnessRow.range.disabled = !allow || !enabled || !roofMacro2Toggle.input.checked;
	                    roofMacro2RoughnessRow.number.disabled = roofMacro2RoughnessRow.range.disabled;
	                    roofMacro2NormalRow.range.disabled = !allow || !enabled || !roofMacro2Toggle.input.checked;
	                    roofMacro2NormalRow.number.disabled = roofMacro2NormalRow.range.disabled;

	                    roofMicroToggle.input.disabled = !allow || !enabled;
	                    roofMicroIntensityRow.range.disabled = !allow || !enabled || !roofMicroToggle.input.checked;
	                    roofMicroIntensityRow.number.disabled = roofMicroIntensityRow.range.disabled;
	                    roofMicroScaleRow.range.disabled = !allow || !enabled || !roofMicroToggle.input.checked;
	                    roofMicroScaleRow.number.disabled = roofMicroScaleRow.range.disabled;
	                    roofMicroRoughnessRow.range.disabled = !allow || !enabled || !roofMicroToggle.input.checked;
	                    roofMicroRoughnessRow.number.disabled = roofMicroRoughnessRow.range.disabled;
	                    roofMicroNormalRow.range.disabled = !allow || !enabled || !roofMicroToggle.input.checked;
	                    roofMicroNormalRow.number.disabled = roofMicroNormalRow.range.disabled;

	                    roofCracksToggle.input.disabled = !allow || !enabled;
	                    roofCrackStrengthRow.range.disabled = !allow || !enabled || !roofCracksToggle.input.checked;
	                    roofCrackStrengthRow.number.disabled = roofCrackStrengthRow.range.disabled;
                    roofCrackScaleRow.range.disabled = !allow || !enabled || !roofCracksToggle.input.checked;
                    roofCrackScaleRow.number.disabled = roofCrackScaleRow.range.disabled;
                    roofCrackHueRow.range.disabled = !allow || !enabled || !roofCracksToggle.input.checked;
                    roofCrackHueRow.number.disabled = roofCrackHueRow.range.disabled;
                    roofCrackValueRow.range.disabled = !allow || !enabled || !roofCracksToggle.input.checked;
                    roofCrackValueRow.number.disabled = roofCrackValueRow.range.disabled;
                    roofCrackSaturationRow.range.disabled = !allow || !enabled || !roofCracksToggle.input.checked;
                    roofCrackSaturationRow.number.disabled = roofCrackSaturationRow.range.disabled;
                    roofCrackRoughnessRow.range.disabled = !allow || !enabled || !roofCracksToggle.input.checked;
                    roofCrackRoughnessRow.number.disabled = roofCrackRoughnessRow.range.disabled;
                    roofCrackNormalRow.range.disabled = !allow || !enabled || !roofCracksToggle.input.checked;
                    roofCrackNormalRow.number.disabled = roofCrackNormalRow.range.disabled;
                };

                roofMatVarToggle.input.addEventListener('change', () => {
                    const nextEnabled = !!roofMatVarToggle.input.checked;
                    const wasEnabled = !!layer.roof.materialVariation.enabled;
                    if (nextEnabled && !wasEnabled && isMinimalMaterialVariationConfig(layer.roof.materialVariation)) {
                        const prevSeedOffset = clampInt(layer.roof.materialVariation.seedOffset ?? 0, -9999, 9999);
                        const prevNormalMap = layer.roof.materialVariation.normalMap && typeof layer.roof.materialVariation.normalMap === 'object'
                            ? { ...layer.roof.materialVariation.normalMap }
                            : null;
                        layer.roof.materialVariation = createDisabledMaterialVariationConfig(MATERIAL_VARIATION_ROOT.SURFACE, { seedOffset: prevSeedOffset, normalMap: prevNormalMap });
                        this._renderLayersPanel();
                        this._notifySelectedLayersChanged();
                        return;
                    }

                    layer.roof.materialVariation.enabled = nextEnabled;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofSeedOffsetRow.range.addEventListener('input', () => {
                    const next = clampInt(roofSeedOffsetRow.range.value, -9999, 9999);
                    layer.roof.materialVariation.seedOffset = next;
                    roofSeedOffsetRow.number.value = String(next);
                    this._notifySelectedLayersChanged();
                });
                roofSeedOffsetRow.number.addEventListener('change', () => {
                    const next = clampInt(roofSeedOffsetRow.number.value, -9999, 9999);
                    layer.roof.materialVariation.seedOffset = next;
                    roofSeedOffsetRow.range.value = String(next);
                    roofSeedOffsetRow.number.value = String(next);
                    this._notifySelectedLayersChanged();
                });
                roofIntensityRow.range.addEventListener('input', () => {
                    const next = clamp(roofIntensityRow.range.value, 0.0, 2.0);
                    layer.roof.materialVariation.globalIntensity = next;
                    roofIntensityRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofIntensityRow.number.addEventListener('change', () => {
                    const next = clamp(roofIntensityRow.number.value, 0.0, 2.0);
                    layer.roof.materialVariation.globalIntensity = next;
                    roofIntensityRow.range.value = String(next);
                    roofIntensityRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofScaleRow.range.addEventListener('input', () => {
                    const next = clamp(roofScaleRow.range.value, 0.05, 4.0);
                    layer.roof.materialVariation.worldSpaceScale = next;
                    roofScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
	                roofScaleRow.number.addEventListener('change', () => {
	                    const next = clamp(roofScaleRow.number.value, 0.05, 4.0);
	                    layer.roof.materialVariation.worldSpaceScale = next;
	                    roofScaleRow.range.value = String(next);
	                    roofScaleRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                roofAoAmountRow.range.addEventListener('input', () => {
	                    const next = clamp(roofAoAmountRow.range.value, 0.0, 1.0);
	                    layer.roof.materialVariation.aoAmount = next;
                    roofAoAmountRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofAoAmountRow.number.addEventListener('change', () => {
                    const next = clamp(roofAoAmountRow.number.value, 0.0, 1.0);
                    layer.roof.materialVariation.aoAmount = next;
                    roofAoAmountRow.range.value = String(next);
                    roofAoAmountRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMatVarSpaceSelect.addEventListener('change', () => {
                    layer.roof.materialVariation.space = roofMatVarSpaceSelect.value === 'object' ? 'object' : 'world';
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });

                roofObjectScaleRow.range.addEventListener('input', () => {
                    const next = clamp(roofObjectScaleRow.range.value, 0.05, 4.0);
                    layer.roof.materialVariation.objectSpaceScale = next;
                    roofObjectScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofObjectScaleRow.number.addEventListener('change', () => {
                    const next = clamp(roofObjectScaleRow.number.value, 0.05, 4.0);
                    layer.roof.materialVariation.objectSpaceScale = next;
                    roofObjectScaleRow.range.value = String(next);
                    roofObjectScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMatVarNormalFlipXToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.normalMap ??= {};
                    layer.roof.materialVariation.normalMap.flipX = !!roofMatVarNormalFlipXToggle.input.checked;
                    this._notifySelectedLayersChanged();
                });
                roofMatVarNormalFlipYToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.normalMap ??= {};
                    layer.roof.materialVariation.normalMap.flipY = !!roofMatVarNormalFlipYToggle.input.checked;
                    this._notifySelectedLayersChanged();
                });
                roofMatVarNormalFlipZToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.normalMap ??= {};
                    layer.roof.materialVariation.normalMap.flipZ = !!roofMatVarNormalFlipZToggle.input.checked;
                    this._notifySelectedLayersChanged();
                });
                roofMacroToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[0] ??= {};
                    layer.roof.materialVariation.macroLayers[0].enabled = !!roofMacroToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofMacroIntensityRow.range.addEventListener('input', () => {
                    const next = clamp(roofMacroIntensityRow.range.value, 0.0, 2.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[0] ??= {};
                    layer.roof.materialVariation.macroLayers[0].intensity = next;
                    roofMacroIntensityRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacroIntensityRow.number.addEventListener('change', () => {
                    const next = clamp(roofMacroIntensityRow.number.value, 0.0, 2.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[0] ??= {};
                    layer.roof.materialVariation.macroLayers[0].intensity = next;
                    roofMacroIntensityRow.range.value = String(next);
                    roofMacroIntensityRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacroScaleRow.range.addEventListener('input', () => {
                    const next = clamp(roofMacroScaleRow.range.value, 0.01, 20.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[0] ??= {};
                    layer.roof.materialVariation.macroLayers[0].scale = next;
                    roofMacroScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacroScaleRow.number.addEventListener('change', () => {
                    const next = clamp(roofMacroScaleRow.number.value, 0.01, 20.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[0] ??= {};
                    layer.roof.materialVariation.macroLayers[0].scale = next;
                    roofMacroScaleRow.range.value = String(next);
                    roofMacroScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacroHueRow.range.addEventListener('input', () => {
                    const next = clamp(roofMacroHueRow.range.value, -180.0, 180.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[0] ??= {};
                    layer.roof.materialVariation.macroLayers[0].hueDegrees = next;
                    roofMacroHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                roofMacroHueRow.number.addEventListener('change', () => {
                    const next = clamp(roofMacroHueRow.number.value, -180.0, 180.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[0] ??= {};
                    layer.roof.materialVariation.macroLayers[0].hueDegrees = next;
                    roofMacroHueRow.range.value = String(next);
                    roofMacroHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                roofMacroValueRow.range.addEventListener('input', () => {
                    const next = clamp(roofMacroValueRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[0] ??= {};
                    layer.roof.materialVariation.macroLayers[0].value = next;
                    roofMacroValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacroValueRow.number.addEventListener('change', () => {
                    const next = clamp(roofMacroValueRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[0] ??= {};
                    layer.roof.materialVariation.macroLayers[0].value = next;
                    roofMacroValueRow.range.value = String(next);
                    roofMacroValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMacroSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(roofMacroSaturationRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[0] ??= {};
                    layer.roof.materialVariation.macroLayers[0].saturation = next;
                    roofMacroSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacroSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(roofMacroSaturationRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[0] ??= {};
                    layer.roof.materialVariation.macroLayers[0].saturation = next;
                    roofMacroSaturationRow.range.value = String(next);
                    roofMacroSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMacroRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(roofMacroRoughnessRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[0] ??= {};
                    layer.roof.materialVariation.macroLayers[0].roughness = next;
                    roofMacroRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacroRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(roofMacroRoughnessRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[0] ??= {};
                    layer.roof.materialVariation.macroLayers[0].roughness = next;
                    roofMacroRoughnessRow.range.value = String(next);
                    roofMacroRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMacroNormalRow.range.addEventListener('input', () => {
                    const next = clamp(roofMacroNormalRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[0] ??= {};
                    layer.roof.materialVariation.macroLayers[0].normal = next;
                    roofMacroNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacroNormalRow.number.addEventListener('change', () => {
                    const next = clamp(roofMacroNormalRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[0] ??= {};
                    layer.roof.materialVariation.macroLayers[0].normal = next;
                    roofMacroNormalRow.range.value = String(next);
                    roofMacroNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofGrimeToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.enabled = !!roofGrimeToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofGrimeStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofGrimeStrengthRow.range.value, 0.0, 2.0);
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.strength = next;
                    roofGrimeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofGrimeStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofGrimeStrengthRow.number.value, 0.0, 2.0);
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.strength = next;
                    roofGrimeStrengthRow.range.value = String(next);
                    roofGrimeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofGrimeWidthRow.range.addEventListener('input', () => {
                    const next = clamp(roofGrimeWidthRow.range.value, 0.0, 1.0);
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.width = next;
                    roofGrimeWidthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofGrimeWidthRow.number.addEventListener('change', () => {
                    const next = clamp(roofGrimeWidthRow.number.value, 0.0, 1.0);
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.width = next;
                    roofGrimeWidthRow.range.value = String(next);
                    roofGrimeWidthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofGrimeScaleRow.range.addEventListener('input', () => {
                    const next = clamp(roofGrimeScaleRow.range.value, 0.01, 20.0);
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.scale = next;
                    roofGrimeScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofGrimeScaleRow.number.addEventListener('change', () => {
                    const next = clamp(roofGrimeScaleRow.number.value, 0.01, 20.0);
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.scale = next;
                    roofGrimeScaleRow.range.value = String(next);
                    roofGrimeScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofGrimeHueRow.range.addEventListener('input', () => {
                    const next = clamp(roofGrimeHueRow.range.value, -180.0, 180.0);
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.hueDegrees = next;
                    roofGrimeHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                roofGrimeHueRow.number.addEventListener('change', () => {
                    const next = clamp(roofGrimeHueRow.number.value, -180.0, 180.0);
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.hueDegrees = next;
                    roofGrimeHueRow.range.value = String(next);
                    roofGrimeHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                roofGrimeValueRow.range.addEventListener('input', () => {
                    const next = clamp(roofGrimeValueRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.value = next;
                    roofGrimeValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofGrimeValueRow.number.addEventListener('change', () => {
                    const next = clamp(roofGrimeValueRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.value = next;
                    roofGrimeValueRow.range.value = String(next);
                    roofGrimeValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofGrimeSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(roofGrimeSaturationRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.saturation = next;
                    roofGrimeSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofGrimeSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(roofGrimeSaturationRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.saturation = next;
                    roofGrimeSaturationRow.range.value = String(next);
                    roofGrimeSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofGrimeRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(roofGrimeRoughnessRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.roughness = next;
                    roofGrimeRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofGrimeRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(roofGrimeRoughnessRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.roughness = next;
                    roofGrimeRoughnessRow.range.value = String(next);
                    roofGrimeRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofGrimeNormalRow.range.addEventListener('input', () => {
                    const next = clamp(roofGrimeNormalRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.normal = next;
                    roofGrimeNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofGrimeNormalRow.number.addEventListener('change', () => {
                    const next = clamp(roofGrimeNormalRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearBottom ??= {};
                    layer.roof.materialVariation.wearBottom.normal = next;
                    roofGrimeNormalRow.range.value = String(next);
                    roofGrimeNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofStreaksToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.enabled = !!roofStreaksToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofStreakStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofStreakStrengthRow.range.value, 0.0, 2.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.strength = next;
                    roofStreakStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStreakStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofStreakStrengthRow.number.value, 0.0, 2.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.strength = next;
                    roofStreakStrengthRow.range.value = String(next);
                    roofStreakStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStreakScaleRow.range.addEventListener('input', () => {
                    const next = clamp(roofStreakScaleRow.range.value, 0.01, 20.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.scale = next;
                    roofStreakScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStreakScaleRow.number.addEventListener('change', () => {
                    const next = clamp(roofStreakScaleRow.number.value, 0.01, 20.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.scale = next;
                    roofStreakScaleRow.range.value = String(next);
                    roofStreakScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStreakLedgeStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofStreakLedgeStrengthRow.range.value, 0.0, 2.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.ledgeStrength = next;
                    roofStreakLedgeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStreakLedgeStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofStreakLedgeStrengthRow.number.value, 0.0, 2.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.ledgeStrength = next;
                    roofStreakLedgeStrengthRow.range.value = String(next);
                    roofStreakLedgeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStreakLedgeScaleRow.range.addEventListener('input', () => {
                    const next = clamp(roofStreakLedgeScaleRow.range.value, 0.0, 20.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.ledgeScale = next;
                    roofStreakLedgeScaleRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });
                roofStreakLedgeScaleRow.number.addEventListener('change', () => {
                    const next = clamp(roofStreakLedgeScaleRow.number.value, 0.0, 20.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.ledgeScale = next;
                    roofStreakLedgeScaleRow.range.value = String(next);
                    roofStreakLedgeScaleRow.number.value = formatFloat(next, 1);
                    this._notifySelectedLayersChanged();
                });

                roofStreakHueRow.range.addEventListener('input', () => {
                    const next = clamp(roofStreakHueRow.range.value, -180.0, 180.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.hueDegrees = next;
                    roofStreakHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                roofStreakHueRow.number.addEventListener('change', () => {
                    const next = clamp(roofStreakHueRow.number.value, -180.0, 180.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.hueDegrees = next;
                    roofStreakHueRow.range.value = String(next);
                    roofStreakHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                roofStreakValueRow.range.addEventListener('input', () => {
                    const next = clamp(roofStreakValueRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.value = next;
                    roofStreakValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStreakValueRow.number.addEventListener('change', () => {
                    const next = clamp(roofStreakValueRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.value = next;
                    roofStreakValueRow.range.value = String(next);
                    roofStreakValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofStreakSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(roofStreakSaturationRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.saturation = next;
                    roofStreakSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStreakSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(roofStreakSaturationRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.saturation = next;
                    roofStreakSaturationRow.range.value = String(next);
                    roofStreakSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofStreakRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(roofStreakRoughnessRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.roughness = next;
                    roofStreakRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStreakRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(roofStreakRoughnessRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.roughness = next;
                    roofStreakRoughnessRow.range.value = String(next);
                    roofStreakRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofStreakNormalRow.range.addEventListener('input', () => {
                    const next = clamp(roofStreakNormalRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.normal = next;
                    roofStreakNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStreakNormalRow.number.addEventListener('change', () => {
                    const next = clamp(roofStreakNormalRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.normal = next;
                    roofStreakNormalRow.range.value = String(next);
                    roofStreakNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                const setRoofExposureDirectionFromUi = () => {
                    const az = clamp(roofExposureAzimuthRow.range.value, 0.0, 360.0);
                    const el = clamp(roofExposureElevationRow.range.value, 0.0, 90.0);
                    layer.roof.materialVariation.exposure ??= {};
                    layer.roof.materialVariation.exposure.direction = azimuthElevationDegreesToDirection(az, el);
                };

                roofExposureToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.exposure ??= {};
                    layer.roof.materialVariation.exposure.enabled = !!roofExposureToggle.input.checked;
                    setRoofExposureDirectionFromUi();
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofExposureStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofExposureStrengthRow.range.value, 0.0, 2.0);
                    layer.roof.materialVariation.exposure ??= {};
                    layer.roof.materialVariation.exposure.strength = next;
                    roofExposureStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofExposureStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofExposureStrengthRow.number.value, 0.0, 2.0);
                    layer.roof.materialVariation.exposure ??= {};
                    layer.roof.materialVariation.exposure.strength = next;
                    roofExposureStrengthRow.range.value = String(next);
                    roofExposureStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofExposureExponentRow.range.addEventListener('input', () => {
                    const next = clamp(roofExposureExponentRow.range.value, 0.1, 8.0);
                    layer.roof.materialVariation.exposure ??= {};
                    layer.roof.materialVariation.exposure.exponent = next;
                    roofExposureExponentRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofExposureExponentRow.number.addEventListener('change', () => {
                    const next = clamp(roofExposureExponentRow.number.value, 0.1, 8.0);
                    layer.roof.materialVariation.exposure ??= {};
                    layer.roof.materialVariation.exposure.exponent = next;
                    roofExposureExponentRow.range.value = String(next);
                    roofExposureExponentRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofExposureAzimuthRow.range.addEventListener('input', () => {
                    const next = clamp(roofExposureAzimuthRow.range.value, 0.0, 360.0);
                    roofExposureAzimuthRow.number.value = String(Math.round(next));
                    setRoofExposureDirectionFromUi();
                    this._notifySelectedLayersChanged();
                });
                roofExposureAzimuthRow.number.addEventListener('change', () => {
                    const next = clamp(roofExposureAzimuthRow.number.value, 0.0, 360.0);
                    roofExposureAzimuthRow.range.value = String(next);
                    roofExposureAzimuthRow.number.value = String(Math.round(next));
                    setRoofExposureDirectionFromUi();
                    this._notifySelectedLayersChanged();
                });
                roofExposureElevationRow.range.addEventListener('input', () => {
                    const next = clamp(roofExposureElevationRow.range.value, 0.0, 90.0);
                    roofExposureElevationRow.number.value = String(Math.round(next));
                    setRoofExposureDirectionFromUi();
                    this._notifySelectedLayersChanged();
                });
                roofExposureElevationRow.number.addEventListener('change', () => {
                    const next = clamp(roofExposureElevationRow.number.value, 0.0, 90.0);
                    roofExposureElevationRow.range.value = String(next);
                    roofExposureElevationRow.number.value = String(Math.round(next));
                    setRoofExposureDirectionFromUi();
                    this._notifySelectedLayersChanged();
                });
                roofExposureValueRow.range.addEventListener('input', () => {
                    const next = clamp(roofExposureValueRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.exposure ??= {};
                    layer.roof.materialVariation.exposure.value = next;
                    roofExposureValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofExposureValueRow.number.addEventListener('change', () => {
                    const next = clamp(roofExposureValueRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.exposure ??= {};
                    layer.roof.materialVariation.exposure.value = next;
                    roofExposureValueRow.range.value = String(next);
                    roofExposureValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofExposureSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(roofExposureSaturationRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.exposure ??= {};
                    layer.roof.materialVariation.exposure.saturation = next;
                    roofExposureSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofExposureSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(roofExposureSaturationRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.exposure ??= {};
                    layer.roof.materialVariation.exposure.saturation = next;
                    roofExposureSaturationRow.range.value = String(next);
                    roofExposureSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofExposureRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(roofExposureRoughnessRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.exposure ??= {};
                    layer.roof.materialVariation.exposure.roughness = next;
                    roofExposureRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofExposureRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(roofExposureRoughnessRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.exposure ??= {};
                    layer.roof.materialVariation.exposure.roughness = next;
                    roofExposureRoughnessRow.range.value = String(next);
                    roofExposureRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofEdgeToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.enabled = !!roofEdgeToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofEdgeStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofEdgeStrengthRow.range.value, 0.0, 2.0);
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.strength = next;
                    roofEdgeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofEdgeStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofEdgeStrengthRow.number.value, 0.0, 2.0);
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.strength = next;
                    roofEdgeStrengthRow.range.value = String(next);
                    roofEdgeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofEdgeWidthRow.range.addEventListener('input', () => {
                    const next = clamp(roofEdgeWidthRow.range.value, 0.0, 4.0);
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.width = next;
                    roofEdgeWidthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofEdgeWidthRow.number.addEventListener('change', () => {
                    const next = clamp(roofEdgeWidthRow.number.value, 0.0, 4.0);
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.width = next;
                    roofEdgeWidthRow.range.value = String(next);
                    roofEdgeWidthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofEdgeScaleRow.range.addEventListener('input', () => {
                    const next = clamp(roofEdgeScaleRow.range.value, 0.01, 20.0);
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.scale = next;
                    roofEdgeScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofEdgeScaleRow.number.addEventListener('change', () => {
                    const next = clamp(roofEdgeScaleRow.number.value, 0.01, 20.0);
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.scale = next;
                    roofEdgeScaleRow.range.value = String(next);
                    roofEdgeScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofEdgeHueRow.range.addEventListener('input', () => {
                    const next = clamp(roofEdgeHueRow.range.value, -180.0, 180.0);
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.hueDegrees = next;
                    roofEdgeHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                roofEdgeHueRow.number.addEventListener('change', () => {
                    const next = clamp(roofEdgeHueRow.number.value, -180.0, 180.0);
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.hueDegrees = next;
                    roofEdgeHueRow.range.value = String(next);
                    roofEdgeHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                roofEdgeValueRow.range.addEventListener('input', () => {
                    const next = clamp(roofEdgeValueRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.value = next;
                    roofEdgeValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofEdgeValueRow.number.addEventListener('change', () => {
                    const next = clamp(roofEdgeValueRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.value = next;
                    roofEdgeValueRow.range.value = String(next);
                    roofEdgeValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofEdgeSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(roofEdgeSaturationRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.saturation = next;
                    roofEdgeSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofEdgeSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(roofEdgeSaturationRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.saturation = next;
                    roofEdgeSaturationRow.range.value = String(next);
                    roofEdgeSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofEdgeRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(roofEdgeRoughnessRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.roughness = next;
                    roofEdgeRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofEdgeRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(roofEdgeRoughnessRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.roughness = next;
                    roofEdgeRoughnessRow.range.value = String(next);
                    roofEdgeRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofEdgeNormalRow.range.addEventListener('input', () => {
                    const next = clamp(roofEdgeNormalRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.normal = next;
                    roofEdgeNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofEdgeNormalRow.number.addEventListener('change', () => {
                    const next = clamp(roofEdgeNormalRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearSide ??= {};
                    layer.roof.materialVariation.wearSide.normal = next;
                    roofEdgeNormalRow.range.value = String(next);
                    roofEdgeNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofDustToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.enabled = !!roofDustToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofDustStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofDustStrengthRow.range.value, 0.0, 2.0);
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.strength = next;
                    roofDustStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDustStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofDustStrengthRow.number.value, 0.0, 2.0);
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.strength = next;
                    roofDustStrengthRow.range.value = String(next);
                    roofDustStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDustWidthRow.range.addEventListener('input', () => {
                    const next = clamp(roofDustWidthRow.range.value, 0.0, 1.0);
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.width = next;
                    roofDustWidthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDustWidthRow.number.addEventListener('change', () => {
                    const next = clamp(roofDustWidthRow.number.value, 0.0, 1.0);
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.width = next;
                    roofDustWidthRow.range.value = String(next);
                    roofDustWidthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDustScaleRow.range.addEventListener('input', () => {
                    const next = clamp(roofDustScaleRow.range.value, 0.01, 20.0);
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.scale = next;
                    roofDustScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDustScaleRow.number.addEventListener('change', () => {
                    const next = clamp(roofDustScaleRow.number.value, 0.01, 20.0);
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.scale = next;
                    roofDustScaleRow.range.value = String(next);
                    roofDustScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofDustHueRow.range.addEventListener('input', () => {
                    const next = clamp(roofDustHueRow.range.value, -180.0, 180.0);
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.hueDegrees = next;
                    roofDustHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                roofDustHueRow.number.addEventListener('change', () => {
                    const next = clamp(roofDustHueRow.number.value, -180.0, 180.0);
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.hueDegrees = next;
                    roofDustHueRow.range.value = String(next);
                    roofDustHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                roofDustValueRow.range.addEventListener('input', () => {
                    const next = clamp(roofDustValueRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.value = next;
                    roofDustValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDustValueRow.number.addEventListener('change', () => {
                    const next = clamp(roofDustValueRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.value = next;
                    roofDustValueRow.range.value = String(next);
                    roofDustValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofDustSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(roofDustSaturationRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.saturation = next;
                    roofDustSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDustSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(roofDustSaturationRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.saturation = next;
                    roofDustSaturationRow.range.value = String(next);
                    roofDustSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofDustRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(roofDustRoughnessRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.roughness = next;
                    roofDustRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDustRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(roofDustRoughnessRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.roughness = next;
                    roofDustRoughnessRow.range.value = String(next);
                    roofDustRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofDustNormalRow.range.addEventListener('input', () => {
                    const next = clamp(roofDustNormalRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.normal = next;
                    roofDustNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDustNormalRow.number.addEventListener('change', () => {
                    const next = clamp(roofDustNormalRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.wearTop ??= {};
                    layer.roof.materialVariation.wearTop.normal = next;
                    roofDustNormalRow.range.value = String(next);
                    roofDustNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofBricksPerTileXRow.range.addEventListener('input', () => {
                    const next = clamp(roofBricksPerTileXRow.range.value, 0.25, 200.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.bricksPerTileX = next;
                    roofBricksPerTileXRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofBricksPerTileXRow.number.addEventListener('change', () => {
                    const next = clamp(roofBricksPerTileXRow.number.value, 0.25, 200.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.bricksPerTileX = next;
                    roofBricksPerTileXRow.range.value = String(next);
                    roofBricksPerTileXRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofBricksPerTileYRow.range.addEventListener('input', () => {
                    const next = clamp(roofBricksPerTileYRow.range.value, 0.25, 200.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.bricksPerTileY = next;
                    roofBricksPerTileYRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofBricksPerTileYRow.number.addEventListener('change', () => {
                    const next = clamp(roofBricksPerTileYRow.number.value, 0.25, 200.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.bricksPerTileY = next;
                    roofBricksPerTileYRow.range.value = String(next);
                    roofBricksPerTileYRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMortarWidthRow.range.addEventListener('input', () => {
                    const next = clamp(roofMortarWidthRow.range.value, 0.0, 0.49);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.mortarWidth = next;
                    roofMortarWidthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMortarWidthRow.number.addEventListener('change', () => {
                    const next = clamp(roofMortarWidthRow.number.value, 0.0, 0.49);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.mortarWidth = next;
                    roofMortarWidthRow.range.value = String(next);
                    roofMortarWidthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofBrickOffsetXRow.range.addEventListener('input', () => {
                    const next = clamp(roofBrickOffsetXRow.range.value, -10.0, 10.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.offsetX = next;
                    roofBrickOffsetXRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofBrickOffsetXRow.number.addEventListener('change', () => {
                    const next = clamp(roofBrickOffsetXRow.number.value, -10.0, 10.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.offsetX = next;
                    roofBrickOffsetXRow.range.value = String(next);
                    roofBrickOffsetXRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofBrickOffsetYRow.range.addEventListener('input', () => {
                    const next = clamp(roofBrickOffsetYRow.range.value, -10.0, 10.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.offsetY = next;
                    roofBrickOffsetYRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofBrickOffsetYRow.number.addEventListener('change', () => {
                    const next = clamp(roofBrickOffsetYRow.number.value, -10.0, 10.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.offsetY = next;
                    roofBrickOffsetYRow.range.value = String(next);
                    roofBrickOffsetYRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofPerBrickToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.perBrick ??= {};
                    layer.roof.materialVariation.brick.perBrick.enabled = !!roofPerBrickToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofPerBrickStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofPerBrickStrengthRow.range.value, 0.0, 2.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.perBrick ??= {};
                    layer.roof.materialVariation.brick.perBrick.strength = next;
                    roofPerBrickStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofPerBrickStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofPerBrickStrengthRow.number.value, 0.0, 2.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.perBrick ??= {};
                    layer.roof.materialVariation.brick.perBrick.strength = next;
                    roofPerBrickStrengthRow.range.value = String(next);
                    roofPerBrickStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofPerBrickHueRow.range.addEventListener('input', () => {
                    const next = clamp(roofPerBrickHueRow.range.value, -180.0, 180.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.perBrick ??= {};
                    layer.roof.materialVariation.brick.perBrick.hueDegrees = next;
                    roofPerBrickHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                roofPerBrickHueRow.number.addEventListener('change', () => {
                    const next = clamp(roofPerBrickHueRow.number.value, -180.0, 180.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.perBrick ??= {};
                    layer.roof.materialVariation.brick.perBrick.hueDegrees = next;
                    roofPerBrickHueRow.range.value = String(next);
                    roofPerBrickHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                roofPerBrickValueRow.range.addEventListener('input', () => {
                    const next = clamp(roofPerBrickValueRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.perBrick ??= {};
                    layer.roof.materialVariation.brick.perBrick.value = next;
                    roofPerBrickValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofPerBrickValueRow.number.addEventListener('change', () => {
                    const next = clamp(roofPerBrickValueRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.perBrick ??= {};
                    layer.roof.materialVariation.brick.perBrick.value = next;
                    roofPerBrickValueRow.range.value = String(next);
                    roofPerBrickValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofPerBrickSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(roofPerBrickSaturationRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.perBrick ??= {};
                    layer.roof.materialVariation.brick.perBrick.saturation = next;
                    roofPerBrickSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofPerBrickSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(roofPerBrickSaturationRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.perBrick ??= {};
                    layer.roof.materialVariation.brick.perBrick.saturation = next;
                    roofPerBrickSaturationRow.range.value = String(next);
                    roofPerBrickSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofPerBrickRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(roofPerBrickRoughnessRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.perBrick ??= {};
                    layer.roof.materialVariation.brick.perBrick.roughness = next;
                    roofPerBrickRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofPerBrickRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(roofPerBrickRoughnessRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.perBrick ??= {};
                    layer.roof.materialVariation.brick.perBrick.roughness = next;
                    roofPerBrickRoughnessRow.range.value = String(next);
                    roofPerBrickRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofPerBrickNormalRow.range.addEventListener('input', () => {
                    const next = clamp(roofPerBrickNormalRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.perBrick ??= {};
                    layer.roof.materialVariation.brick.perBrick.normal = next;
                    roofPerBrickNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofPerBrickNormalRow.number.addEventListener('change', () => {
                    const next = clamp(roofPerBrickNormalRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.perBrick ??= {};
                    layer.roof.materialVariation.brick.perBrick.normal = next;
                    roofPerBrickNormalRow.range.value = String(next);
                    roofPerBrickNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMortarToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.mortar ??= {};
                    layer.roof.materialVariation.brick.mortar.enabled = !!roofMortarToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });

                roofMortarStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofMortarStrengthRow.range.value, 0.0, 2.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.mortar ??= {};
                    layer.roof.materialVariation.brick.mortar.strength = next;
                    roofMortarStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMortarStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofMortarStrengthRow.number.value, 0.0, 2.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.mortar ??= {};
                    layer.roof.materialVariation.brick.mortar.strength = next;
                    roofMortarStrengthRow.range.value = String(next);
                    roofMortarStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMortarHueRow.range.addEventListener('input', () => {
                    const next = clamp(roofMortarHueRow.range.value, -180.0, 180.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.mortar ??= {};
                    layer.roof.materialVariation.brick.mortar.hueDegrees = next;
                    roofMortarHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                roofMortarHueRow.number.addEventListener('change', () => {
                    const next = clamp(roofMortarHueRow.number.value, -180.0, 180.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.mortar ??= {};
                    layer.roof.materialVariation.brick.mortar.hueDegrees = next;
                    roofMortarHueRow.range.value = String(next);
                    roofMortarHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                roofMortarValueRow.range.addEventListener('input', () => {
                    const next = clamp(roofMortarValueRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.mortar ??= {};
                    layer.roof.materialVariation.brick.mortar.value = next;
                    roofMortarValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMortarValueRow.number.addEventListener('change', () => {
                    const next = clamp(roofMortarValueRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.mortar ??= {};
                    layer.roof.materialVariation.brick.mortar.value = next;
                    roofMortarValueRow.range.value = String(next);
                    roofMortarValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMortarSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(roofMortarSaturationRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.mortar ??= {};
                    layer.roof.materialVariation.brick.mortar.saturation = next;
                    roofMortarSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMortarSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(roofMortarSaturationRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.mortar ??= {};
                    layer.roof.materialVariation.brick.mortar.saturation = next;
                    roofMortarSaturationRow.range.value = String(next);
                    roofMortarSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMortarRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(roofMortarRoughnessRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.mortar ??= {};
                    layer.roof.materialVariation.brick.mortar.roughness = next;
                    roofMortarRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMortarRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(roofMortarRoughnessRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.mortar ??= {};
                    layer.roof.materialVariation.brick.mortar.roughness = next;
                    roofMortarRoughnessRow.range.value = String(next);
                    roofMortarRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMortarNormalRow.range.addEventListener('input', () => {
                    const next = clamp(roofMortarNormalRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.mortar ??= {};
                    layer.roof.materialVariation.brick.mortar.normal = next;
                    roofMortarNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMortarNormalRow.number.addEventListener('change', () => {
                    const next = clamp(roofMortarNormalRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.brick ??= {};
                    layer.roof.materialVariation.brick.mortar ??= {};
                    layer.roof.materialVariation.brick.mortar.normal = next;
                    roofMortarNormalRow.range.value = String(next);
                    roofMortarNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofStairToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.stairShift ??= {};
                    layer.roof.materialVariation.stairShift.enabled = !!roofStairToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofStairStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofStairStrengthRow.range.value, 0.0, 1.0);
                    layer.roof.materialVariation.stairShift ??= {};
                    layer.roof.materialVariation.stairShift.strength = next;
                    roofStairStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStairStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofStairStrengthRow.number.value, 0.0, 1.0);
                    layer.roof.materialVariation.stairShift ??= {};
                    layer.roof.materialVariation.stairShift.strength = next;
                    roofStairStrengthRow.range.value = String(next);
                    roofStairStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStairStepRow.range.addEventListener('input', () => {
                    const next = clamp(roofStairStepRow.range.value, 0.01, 20.0);
                    layer.roof.materialVariation.stairShift ??= {};
                    layer.roof.materialVariation.stairShift.stepSize = next;
                    roofStairStepRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStairStepRow.number.addEventListener('change', () => {
                    const next = clamp(roofStairStepRow.number.value, 0.01, 20.0);
                    layer.roof.materialVariation.stairShift ??= {};
                    layer.roof.materialVariation.stairShift.stepSize = next;
                    roofStairStepRow.range.value = String(next);
                    roofStairStepRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStairShiftRow.range.addEventListener('input', () => {
                    const next = clamp(roofStairShiftRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.stairShift ??= {};
                    layer.roof.materialVariation.stairShift.shift = next;
                    roofStairShiftRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStairShiftRow.number.addEventListener('change', () => {
                    const next = clamp(roofStairShiftRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.stairShift ??= {};
                    layer.roof.materialVariation.stairShift.shift = next;
                    roofStairShiftRow.range.value = String(next);
                    roofStairShiftRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStairModeSelect.addEventListener('change', () => {
                    layer.roof.materialVariation.stairShift ??= {};
                    const v = roofStairModeSelect.value;
                    layer.roof.materialVariation.stairShift.mode = v === 'random'
                        ? 'random'
                        : (v === 'alternate' ? 'alternate' : (v === 'pattern3' ? 'pattern3' : 'stair'));
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });

                roofStairPatternARow.range.addEventListener('input', () => {
                    const next = clamp(roofStairPatternARow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.stairShift ??= {};
                    layer.roof.materialVariation.stairShift.patternA = next;
                    roofStairPatternARow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStairPatternARow.number.addEventListener('change', () => {
                    const next = clamp(roofStairPatternARow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.stairShift ??= {};
                    layer.roof.materialVariation.stairShift.patternA = next;
                    roofStairPatternARow.range.value = String(next);
                    roofStairPatternARow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofStairPatternBRow.range.addEventListener('input', () => {
                    const next = clamp(roofStairPatternBRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.stairShift ??= {};
                    layer.roof.materialVariation.stairShift.patternB = next;
                    roofStairPatternBRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStairPatternBRow.number.addEventListener('change', () => {
                    const next = clamp(roofStairPatternBRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.stairShift ??= {};
                    layer.roof.materialVariation.stairShift.patternB = next;
                    roofStairPatternBRow.range.value = String(next);
                    roofStairPatternBRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStairBlendRow.range.addEventListener('input', () => {
                    const next = clamp(roofStairBlendRow.range.value, 0.0, 0.49);
                    layer.roof.materialVariation.stairShift ??= {};
                    layer.roof.materialVariation.stairShift.blendWidth = next;
                    roofStairBlendRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStairBlendRow.number.addEventListener('change', () => {
                    const next = clamp(roofStairBlendRow.number.value, 0.0, 0.49);
                    layer.roof.materialVariation.stairShift ??= {};
                    layer.roof.materialVariation.stairShift.blendWidth = next;
                    roofStairBlendRow.range.value = String(next);
                    roofStairBlendRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStairDirSelect.addEventListener('change', () => {
                    layer.roof.materialVariation.stairShift ??= {};
                    layer.roof.materialVariation.stairShift.direction = roofStairDirSelect.value === 'vertical' ? 'vertical' : 'horizontal';
                    this._notifySelectedLayersChanged();
                });

                roofDetailToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[1] ??= {};
                    layer.roof.materialVariation.macroLayers[1].enabled = !!roofDetailToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofDetailStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofDetailStrengthRow.range.value, 0.0, 2.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[1] ??= {};
                    layer.roof.materialVariation.macroLayers[1].intensity = next;
                    roofDetailStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDetailStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofDetailStrengthRow.number.value, 0.0, 2.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[1] ??= {};
                    layer.roof.materialVariation.macroLayers[1].intensity = next;
                    roofDetailStrengthRow.range.value = String(next);
                    roofDetailStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDetailScaleRow.range.addEventListener('input', () => {
                    const next = clamp(roofDetailScaleRow.range.value, 0.01, 20.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[1] ??= {};
                    layer.roof.materialVariation.macroLayers[1].scale = next;
                    roofDetailScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDetailScaleRow.number.addEventListener('change', () => {
                    const next = clamp(roofDetailScaleRow.number.value, 0.01, 20.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[1] ??= {};
                    layer.roof.materialVariation.macroLayers[1].scale = next;
                    roofDetailScaleRow.range.value = String(next);
                    roofDetailScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDetailHueRow.range.addEventListener('input', () => {
                    const next = clamp(roofDetailHueRow.range.value, -180.0, 180.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[1] ??= {};
                    layer.roof.materialVariation.macroLayers[1].hueDegrees = next;
                    roofDetailHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                roofDetailHueRow.number.addEventListener('change', () => {
                    const next = clamp(roofDetailHueRow.number.value, -180.0, 180.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[1] ??= {};
                    layer.roof.materialVariation.macroLayers[1].hueDegrees = next;
                    roofDetailHueRow.range.value = String(next);
                    roofDetailHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                roofDetailValueRow.range.addEventListener('input', () => {
                    const next = clamp(roofDetailValueRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[1] ??= {};
                    layer.roof.materialVariation.macroLayers[1].value = next;
                    roofDetailValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDetailValueRow.number.addEventListener('change', () => {
                    const next = clamp(roofDetailValueRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[1] ??= {};
                    layer.roof.materialVariation.macroLayers[1].value = next;
                    roofDetailValueRow.range.value = String(next);
                    roofDetailValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofDetailSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(roofDetailSaturationRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[1] ??= {};
                    layer.roof.materialVariation.macroLayers[1].saturation = next;
                    roofDetailSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDetailSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(roofDetailSaturationRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[1] ??= {};
                    layer.roof.materialVariation.macroLayers[1].saturation = next;
                    roofDetailSaturationRow.range.value = String(next);
                    roofDetailSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofDetailRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(roofDetailRoughnessRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[1] ??= {};
                    layer.roof.materialVariation.macroLayers[1].roughness = next;
                    roofDetailRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDetailRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(roofDetailRoughnessRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[1] ??= {};
                    layer.roof.materialVariation.macroLayers[1].roughness = next;
                    roofDetailRoughnessRow.range.value = String(next);
                    roofDetailRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofDetailNormalRow.range.addEventListener('input', () => {
                    const next = clamp(roofDetailNormalRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[1] ??= {};
                    layer.roof.materialVariation.macroLayers[1].normal = next;
                    roofDetailNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDetailNormalRow.number.addEventListener('change', () => {
                    const next = clamp(roofDetailNormalRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[1] ??= {};
                    layer.roof.materialVariation.macroLayers[1].normal = next;
                    roofDetailNormalRow.range.value = String(next);
                    roofDetailNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMacro2Toggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[2] ??= {};
                    layer.roof.materialVariation.macroLayers[2].enabled = !!roofMacro2Toggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofMacro2StrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofMacro2StrengthRow.range.value, 0.0, 2.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[2] ??= {};
                    layer.roof.materialVariation.macroLayers[2].intensity = next;
                    roofMacro2StrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacro2StrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofMacro2StrengthRow.number.value, 0.0, 2.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[2] ??= {};
                    layer.roof.materialVariation.macroLayers[2].intensity = next;
                    roofMacro2StrengthRow.range.value = String(next);
                    roofMacro2StrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacro2ScaleRow.range.addEventListener('input', () => {
                    const next = clamp(roofMacro2ScaleRow.range.value, 0.01, 20.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[2] ??= {};
                    layer.roof.materialVariation.macroLayers[2].scale = next;
                    roofMacro2ScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacro2ScaleRow.number.addEventListener('change', () => {
                    const next = clamp(roofMacro2ScaleRow.number.value, 0.01, 20.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[2] ??= {};
                    layer.roof.materialVariation.macroLayers[2].scale = next;
                    roofMacro2ScaleRow.range.value = String(next);
                    roofMacro2ScaleRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                roofMacro2CoverageRow.range.addEventListener('input', () => {
	                    const next = clamp(roofMacro2CoverageRow.range.value, 0.0, 1.0);
	                    layer.roof.materialVariation.macroLayers ??= [];
	                    layer.roof.materialVariation.macroLayers[2] ??= {};
	                    layer.roof.materialVariation.macroLayers[2].coverage = next;
	                    roofMacro2CoverageRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });
	                roofMacro2CoverageRow.number.addEventListener('change', () => {
	                    const next = clamp(roofMacro2CoverageRow.number.value, 0.0, 1.0);
	                    layer.roof.materialVariation.macroLayers ??= [];
	                    layer.roof.materialVariation.macroLayers[2] ??= {};
	                    layer.roof.materialVariation.macroLayers[2].coverage = next;
	                    roofMacro2CoverageRow.range.value = String(next);
	                    roofMacro2CoverageRow.number.value = formatFloat(next, 2);
	                    this._notifySelectedLayersChanged();
	                });

	                roofMacro2HueRow.range.addEventListener('input', () => {
	                    const next = clamp(roofMacro2HueRow.range.value, -180.0, 180.0);
	                    layer.roof.materialVariation.macroLayers ??= [];
	                    layer.roof.materialVariation.macroLayers[2] ??= {};
                    layer.roof.materialVariation.macroLayers[2].hueDegrees = next;
                    roofMacro2HueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                roofMacro2HueRow.number.addEventListener('change', () => {
                    const next = clamp(roofMacro2HueRow.number.value, -180.0, 180.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[2] ??= {};
                    layer.roof.materialVariation.macroLayers[2].hueDegrees = next;
                    roofMacro2HueRow.range.value = String(next);
                    roofMacro2HueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                roofMacro2ValueRow.range.addEventListener('input', () => {
                    const next = clamp(roofMacro2ValueRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[2] ??= {};
                    layer.roof.materialVariation.macroLayers[2].value = next;
                    roofMacro2ValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacro2ValueRow.number.addEventListener('change', () => {
                    const next = clamp(roofMacro2ValueRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[2] ??= {};
                    layer.roof.materialVariation.macroLayers[2].value = next;
                    roofMacro2ValueRow.range.value = String(next);
                    roofMacro2ValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMacro2SaturationRow.range.addEventListener('input', () => {
                    const next = clamp(roofMacro2SaturationRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[2] ??= {};
                    layer.roof.materialVariation.macroLayers[2].saturation = next;
                    roofMacro2SaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacro2SaturationRow.number.addEventListener('change', () => {
                    const next = clamp(roofMacro2SaturationRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[2] ??= {};
                    layer.roof.materialVariation.macroLayers[2].saturation = next;
                    roofMacro2SaturationRow.range.value = String(next);
                    roofMacro2SaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMacro2RoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(roofMacro2RoughnessRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[2] ??= {};
                    layer.roof.materialVariation.macroLayers[2].roughness = next;
                    roofMacro2RoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacro2RoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(roofMacro2RoughnessRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[2] ??= {};
                    layer.roof.materialVariation.macroLayers[2].roughness = next;
                    roofMacro2RoughnessRow.range.value = String(next);
                    roofMacro2RoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMacro2NormalRow.range.addEventListener('input', () => {
                    const next = clamp(roofMacro2NormalRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[2] ??= {};
                    layer.roof.materialVariation.macroLayers[2].normal = next;
                    roofMacro2NormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacro2NormalRow.number.addEventListener('change', () => {
                    const next = clamp(roofMacro2NormalRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[2] ??= {};
                    layer.roof.materialVariation.macroLayers[2].normal = next;
                    roofMacro2NormalRow.range.value = String(next);
                    roofMacro2NormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMicroToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[3] ??= {};
                    layer.roof.materialVariation.macroLayers[3].enabled = !!roofMicroToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofMicroIntensityRow.range.addEventListener('input', () => {
                    const next = clamp(roofMicroIntensityRow.range.value, 0.0, 2.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[3] ??= {};
                    layer.roof.materialVariation.macroLayers[3].intensity = next;
                    roofMicroIntensityRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMicroIntensityRow.number.addEventListener('change', () => {
                    const next = clamp(roofMicroIntensityRow.number.value, 0.0, 2.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[3] ??= {};
                    layer.roof.materialVariation.macroLayers[3].intensity = next;
                    roofMicroIntensityRow.range.value = String(next);
                    roofMicroIntensityRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMicroScaleRow.range.addEventListener('input', () => {
                    const next = clamp(roofMicroScaleRow.range.value, 0.01, 20.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[3] ??= {};
                    layer.roof.materialVariation.macroLayers[3].scale = next;
                    roofMicroScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMicroScaleRow.number.addEventListener('change', () => {
                    const next = clamp(roofMicroScaleRow.number.value, 0.01, 20.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[3] ??= {};
                    layer.roof.materialVariation.macroLayers[3].scale = next;
                    roofMicroScaleRow.range.value = String(next);
                    roofMicroScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMicroRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(roofMicroRoughnessRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[3] ??= {};
                    layer.roof.materialVariation.macroLayers[3].roughness = next;
                    roofMicroRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMicroRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(roofMicroRoughnessRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[3] ??= {};
                    layer.roof.materialVariation.macroLayers[3].roughness = next;
                    roofMicroRoughnessRow.range.value = String(next);
                    roofMicroRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofMicroNormalRow.range.addEventListener('input', () => {
                    const next = clamp(roofMicroNormalRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[3] ??= {};
                    layer.roof.materialVariation.macroLayers[3].normal = next;
                    roofMicroNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMicroNormalRow.number.addEventListener('change', () => {
                    const next = clamp(roofMicroNormalRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.macroLayers ??= [];
                    layer.roof.materialVariation.macroLayers[3] ??= {};
                    layer.roof.materialVariation.macroLayers[3].normal = next;
                    roofMicroNormalRow.range.value = String(next);
                    roofMicroNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofCracksToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.cracksLayer ??= {};
                    layer.roof.materialVariation.cracksLayer.enabled = !!roofCracksToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofCrackStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofCrackStrengthRow.range.value, 0.0, 2.0);
                    layer.roof.materialVariation.cracksLayer ??= {};
                    layer.roof.materialVariation.cracksLayer.strength = next;
                    roofCrackStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofCrackStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofCrackStrengthRow.number.value, 0.0, 2.0);
                    layer.roof.materialVariation.cracksLayer ??= {};
                    layer.roof.materialVariation.cracksLayer.strength = next;
                    roofCrackStrengthRow.range.value = String(next);
                    roofCrackStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofCrackScaleRow.range.addEventListener('input', () => {
                    const next = clamp(roofCrackScaleRow.range.value, 0.01, 20.0);
                    layer.roof.materialVariation.cracksLayer ??= {};
                    layer.roof.materialVariation.cracksLayer.scale = next;
                    roofCrackScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofCrackScaleRow.number.addEventListener('change', () => {
                    const next = clamp(roofCrackScaleRow.number.value, 0.01, 20.0);
                    layer.roof.materialVariation.cracksLayer ??= {};
                    layer.roof.materialVariation.cracksLayer.scale = next;
                    roofCrackScaleRow.range.value = String(next);
                    roofCrackScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofCrackHueRow.range.addEventListener('input', () => {
                    const next = clamp(roofCrackHueRow.range.value, -180.0, 180.0);
                    layer.roof.materialVariation.cracksLayer ??= {};
                    layer.roof.materialVariation.cracksLayer.hueDegrees = next;
                    roofCrackHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                roofCrackHueRow.number.addEventListener('change', () => {
                    const next = clamp(roofCrackHueRow.number.value, -180.0, 180.0);
                    layer.roof.materialVariation.cracksLayer ??= {};
                    layer.roof.materialVariation.cracksLayer.hueDegrees = next;
                    roofCrackHueRow.range.value = String(next);
                    roofCrackHueRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                roofCrackValueRow.range.addEventListener('input', () => {
                    const next = clamp(roofCrackValueRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.cracksLayer ??= {};
                    layer.roof.materialVariation.cracksLayer.value = next;
                    roofCrackValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofCrackValueRow.number.addEventListener('change', () => {
                    const next = clamp(roofCrackValueRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.cracksLayer ??= {};
                    layer.roof.materialVariation.cracksLayer.value = next;
                    roofCrackValueRow.range.value = String(next);
                    roofCrackValueRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofCrackSaturationRow.range.addEventListener('input', () => {
                    const next = clamp(roofCrackSaturationRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.cracksLayer ??= {};
                    layer.roof.materialVariation.cracksLayer.saturation = next;
                    roofCrackSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofCrackSaturationRow.number.addEventListener('change', () => {
                    const next = clamp(roofCrackSaturationRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.cracksLayer ??= {};
                    layer.roof.materialVariation.cracksLayer.saturation = next;
                    roofCrackSaturationRow.range.value = String(next);
                    roofCrackSaturationRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofCrackRoughnessRow.range.addEventListener('input', () => {
                    const next = clamp(roofCrackRoughnessRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.cracksLayer ??= {};
                    layer.roof.materialVariation.cracksLayer.roughness = next;
                    roofCrackRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofCrackRoughnessRow.number.addEventListener('change', () => {
                    const next = clamp(roofCrackRoughnessRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.cracksLayer ??= {};
                    layer.roof.materialVariation.cracksLayer.roughness = next;
                    roofCrackRoughnessRow.range.value = String(next);
                    roofCrackRoughnessRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofCrackNormalRow.range.addEventListener('input', () => {
                    const next = clamp(roofCrackNormalRow.range.value, -1.0, 1.0);
                    layer.roof.materialVariation.cracksLayer ??= {};
                    layer.roof.materialVariation.cracksLayer.normal = next;
                    roofCrackNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofCrackNormalRow.number.addEventListener('change', () => {
                    const next = clamp(roofCrackNormalRow.number.value, -1.0, 1.0);
                    layer.roof.materialVariation.cracksLayer ??= {};
                    layer.roof.materialVariation.cracksLayer.normal = next;
                    roofCrackNormalRow.range.value = String(next);
                    roofCrackNormalRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                syncRoofMatVarEnabled();
                roofMatVarBasicsGroup.body.appendChild(document.createElement('div')).className = 'building-fab-hint';
                roofMatVarBasicsGroup.body.lastChild.textContent = 'Enable the variation system to add weathering and breakup.';
                layerSection.body.appendChild(roofMatVarGroup.details);

                const ringToggle = makeToggleRow('Enable ring');
                ringToggle.input.checked = !!layer?.ring?.enabled;
                ringToggle.input.disabled = !allow;
                layerSection.body.appendChild(ringToggle.toggle);

                const ringOuterRow = makeRangeRow('Outer radius (m)');
                ringOuterRow.range.min = '0';
                ringOuterRow.range.max = '8';
                ringOuterRow.range.step = '0.05';
                ringOuterRow.number.min = '0';
                ringOuterRow.number.max = '8';
                ringOuterRow.number.step = '0.05';
                ringOuterRow.range.value = String(layer?.ring?.outerRadius ?? 0.4);
                ringOuterRow.number.value = formatFloat(layer?.ring?.outerRadius ?? 0.4, 2);
                ringOuterRow.range.disabled = !allow || !layer?.ring?.enabled;
                ringOuterRow.number.disabled = ringOuterRow.range.disabled;
                ringOuterRow.range.addEventListener('input', () => {
                    const next = clamp(ringOuterRow.range.value, 0.0, 8.0);
                    layer.ring.outerRadius = next;
                    ringOuterRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                ringOuterRow.number.addEventListener('change', () => {
                    const next = clamp(ringOuterRow.number.value, 0.0, 8.0);
                    layer.ring.outerRadius = next;
                    ringOuterRow.range.value = String(next);
                    ringOuterRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                layerSection.body.appendChild(ringOuterRow.row);

                const ringInnerRow = makeRangeRow('Inner radius (m)');
                ringInnerRow.range.min = '0';
                ringInnerRow.range.max = '8';
                ringInnerRow.range.step = '0.05';
                ringInnerRow.number.min = '0';
                ringInnerRow.number.max = '8';
                ringInnerRow.number.step = '0.05';
                ringInnerRow.range.value = String(layer?.ring?.innerRadius ?? 0.0);
                ringInnerRow.number.value = formatFloat(layer?.ring?.innerRadius ?? 0.0, 2);
                ringInnerRow.range.disabled = !allow || !layer?.ring?.enabled;
                ringInnerRow.number.disabled = ringInnerRow.range.disabled;
                ringInnerRow.range.addEventListener('input', () => {
                    const next = clamp(ringInnerRow.range.value, 0.0, 8.0);
                    layer.ring.innerRadius = next;
                    ringInnerRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                ringInnerRow.number.addEventListener('change', () => {
                    const next = clamp(ringInnerRow.number.value, 0.0, 8.0);
                    layer.ring.innerRadius = next;
                    ringInnerRow.range.value = String(next);
                    ringInnerRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                layerSection.body.appendChild(ringInnerRow.row);

                const ringHeightRow = makeRangeRow('Height (m)');
                ringHeightRow.range.min = '0';
                ringHeightRow.range.max = '2';
                ringHeightRow.range.step = '0.02';
                ringHeightRow.number.min = '0';
                ringHeightRow.number.max = '2';
                ringHeightRow.number.step = '0.02';
                ringHeightRow.range.value = String(layer?.ring?.height ?? 0.4);
                ringHeightRow.number.value = formatFloat(layer?.ring?.height ?? 0.4, 2);
                ringHeightRow.range.disabled = !allow || !layer?.ring?.enabled;
                ringHeightRow.number.disabled = ringHeightRow.range.disabled;
                ringHeightRow.range.addEventListener('input', () => {
                    const next = clamp(ringHeightRow.range.value, 0.0, 2.0);
                    layer.ring.height = next;
                    ringHeightRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                ringHeightRow.number.addEventListener('change', () => {
                    const next = clamp(ringHeightRow.number.value, 0.0, 2.0);
                    layer.ring.height = next;
                    ringHeightRow.range.value = String(next);
                    ringHeightRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                layerSection.body.appendChild(ringHeightRow.row);

                const ringMaterialPicker = makePickerRow('Ring material');
                const ringMaterial = layer?.ring?.material ?? { kind: 'color', id: BELT_COURSE_COLOR.OFFWHITE };
                if (ringMaterial?.kind === 'texture') {
                    const styleId = typeof ringMaterial.id === 'string' && ringMaterial.id ? ringMaterial.id : BUILDING_STYLE.DEFAULT;
                    const found = getStyleOption(styleId) ?? null;
                    const label = found?.label ?? styleId;
                    ringMaterialPicker.text.textContent = label;
                    setMaterialThumbToTexture(ringMaterialPicker.thumb, found?.wallTextureUrl ?? '', label);
                } else {
                    const colorId = typeof ringMaterial?.id === 'string' && ringMaterial.id ? ringMaterial.id : BELT_COURSE_COLOR.OFFWHITE;
                    const found = getBeltColorOption(colorId) ?? null;
                    const label = found?.label ?? colorId;
                    ringMaterialPicker.text.textContent = label;
                    setMaterialThumbToColor(ringMaterialPicker.thumb, found?.hex ?? 0xffffff);
                }
                ringMaterialPicker.button.disabled = !allow || !layer?.ring?.enabled;
                ringMaterialPicker.button.addEventListener('click', () => {
                    openMaterialPicker({
                        title: 'Ring material',
                        material: layer.ring.material ?? ringMaterial,
                        textureOptions: textureMaterialOptions,
                        colorOptions: beltColorMaterialOptions,
                        onSelect: (spec) => {
                            layer.ring.material = spec;
                            if (spec.kind === 'color') {
                                const found = getBeltColorOption(spec.id) ?? null;
                                const label = found?.label ?? spec.id;
                                ringMaterialPicker.text.textContent = label;
                                setMaterialThumbToColor(ringMaterialPicker.thumb, found?.hex ?? 0xffffff);
                            } else {
                                const found = getStyleOption(spec.id) ?? null;
                                const label = found?.label ?? spec.id;
                                ringMaterialPicker.text.textContent = label;
                                setMaterialThumbToTexture(ringMaterialPicker.thumb, found?.wallTextureUrl ?? '', label);
                            }
                            this._notifySelectedLayersChanged();
                        }
                    });
                });
                layerSection.body.appendChild(ringMaterialPicker.row);

                ringToggle.input.addEventListener('change', () => {
                    layer.ring.enabled = !!ringToggle.input.checked;
                    const enabled = layer.ring.enabled;
                    ringOuterRow.range.disabled = !allow || !enabled;
                    ringOuterRow.number.disabled = ringOuterRow.range.disabled;
                    ringInnerRow.range.disabled = !allow || !enabled;
                    ringInnerRow.number.disabled = ringInnerRow.range.disabled;
                    ringHeightRow.range.disabled = !allow || !enabled;
                    ringHeightRow.number.disabled = ringHeightRow.range.disabled;
                    ringMaterialPicker.button.disabled = !allow || !enabled;
                    this._notifySelectedLayersChanged();
                });
            }

            this.layersList.appendChild(layerSection.details);
        }
    }

    _syncPropertyWidgets() {
        const hasSelected = !!this._selectedBuildingId;
        const allow = !!this._enabled && hasSelected;
        const allowStreetStyle = allow && this._streetEnabled && this._streetFloors > 0;
        const allowStreetFloors = allow;
        const allowStreetWindows = allow && this._streetFloors > 0;
        const showWindowParams = hasSelected && this._isParametricWindowType(this._windowTypeId);
        const showStreetWindowParams = hasSelected
            && allowStreetWindows
            && this._isParametricWindowType(this._streetWindowTypeId);
        const allowWindowParams = allow && showWindowParams;
        const allowStreetWindowParams = allowStreetWindows && showStreetWindowParams;
        const allowBelt = allow && this._streetFloors < this._floorCount;
        const allowTopBelt = allow && this._topBeltEnabled;
        const allowWindowSpacer = allow && this._windowSpacerEnabled;
        const allowStreetWindowSpacer = allowStreetWindows && this._streetWindowSpacerEnabled;
        this._syncLayersPanel();
        this._syncMaterialVariationSeedPanel();
        this._syncMaterialVariationDebugPanel();

        if (this.windowFrameWidthRow) this.windowFrameWidthRow.classList.toggle('hidden', !showWindowParams);
        if (this.windowFrameColorRow) this.windowFrameColorRow.classList.toggle('hidden', !showWindowParams);
        if (this.windowGlassTopRow) this.windowGlassTopRow.classList.toggle('hidden', !showWindowParams);
        if (this.windowGlassBottomRow) this.windowGlassBottomRow.classList.toggle('hidden', !showWindowParams);
        if (this.streetWindowFrameWidthRow) this.streetWindowFrameWidthRow.classList.toggle('hidden', !showStreetWindowParams);
        if (this.streetWindowFrameColorRow) this.streetWindowFrameColorRow.classList.toggle('hidden', !showStreetWindowParams);
        if (this.streetWindowGlassTopRow) this.streetWindowGlassTopRow.classList.toggle('hidden', !showStreetWindowParams);
        if (this.streetWindowGlassBottomRow) this.streetWindowGlassBottomRow.classList.toggle('hidden', !showStreetWindowParams);

        this.deleteBuildingBtn.disabled = !allow;
        if (this.exportBuildingBtn) this.exportBuildingBtn.disabled = !this._enabled;
        if (this.loadCatalogSelect) this.loadCatalogSelect.disabled = !this._enabled;
        if (this.loadCatalogBtn) this.loadCatalogBtn.disabled = !this._enabled || !this._catalogBuildingConfigId;
        this.typeSelect.disabled = !allow;
        this._syncBuildingStyleButtons({ allow });
        this._syncWindowStyleButtons({ allow });
        this.floorRange.disabled = !allow;
        this.floorNumber.disabled = !allow;
        this.floorHeightRange.disabled = !allow;
        this.floorHeightNumber.disabled = !allow;
        this.wallInsetRange.disabled = !allow;
        this.wallInsetNumber.disabled = !allow;
        this.streetEnabledInput.disabled = !allow;
        this.streetFloorsRange.disabled = !allowStreetFloors;
        this.streetFloorsNumber.disabled = !allowStreetFloors;
        this.streetHeightRange.disabled = !allowStreetStyle;
        this.streetHeightNumber.disabled = !allowStreetStyle;
        this._syncStreetStyleButtons({ allow: allowStreetStyle });
        this._syncStreetWindowStyleButtons({ allow: allowStreetWindows });
        this.beltCourseInput.disabled = !allowBelt;
        this._syncBeltCourseColorButtons({ allow: allowBelt && this._beltCourseEnabled });
        this.beltMarginRange.disabled = !allowBelt || !this._beltCourseEnabled;
        this.beltMarginNumber.disabled = !allowBelt || !this._beltCourseEnabled;
        this.beltHeightRange.disabled = !allowBelt || !this._beltCourseEnabled;
        this.beltHeightNumber.disabled = !allowBelt || !this._beltCourseEnabled;
        this.topBeltInput.disabled = !allow;
        this.topBeltWidthRange.disabled = !allowTopBelt;
        this.topBeltWidthNumber.disabled = !allowTopBelt;
        this.topBeltInnerWidthRange.disabled = !allowTopBelt;
        this.topBeltInnerWidthNumber.disabled = !allowTopBelt;
        this.topBeltHeightRange.disabled = !allowTopBelt;
        this.topBeltHeightNumber.disabled = !allowTopBelt;
        this._syncTopBeltColorButtons({ allow: allowTopBelt });
        this._syncRoofColorButtons({ allow });
        this.windowWidthRange.disabled = !allow;
        this.windowWidthNumber.disabled = !allow;
        this.windowGapRange.disabled = !allow;
        this.windowGapNumber.disabled = !allow;
        this.windowHeightRange.disabled = !allow;
        this.windowHeightNumber.disabled = !allow;
        this.windowYRange.disabled = !allow;
        this.windowYNumber.disabled = !allow;
        this.windowFrameWidthRange.disabled = !allowWindowParams;
        this.windowFrameWidthNumber.disabled = !allowWindowParams;
        this.windowFrameColorPickButton.disabled = !allowWindowParams;
        this.windowGlassTopPickButton.disabled = !allowWindowParams;
        this.windowGlassBottomPickButton.disabled = !allowWindowParams;
        this.windowSpacerInput.disabled = !allow;
        this.windowSpacerEveryRange.disabled = !allowWindowSpacer;
        this.windowSpacerEveryNumber.disabled = !allowWindowSpacer;
        this.windowSpacerWidthRange.disabled = !allowWindowSpacer;
        this.windowSpacerWidthNumber.disabled = !allowWindowSpacer;
        this.windowSpacerExtrudeInput.disabled = !allowWindowSpacer;
        this.windowSpacerExtrudeDistanceRange.disabled = !allowWindowSpacer || !this._windowSpacerExtrude;
        this.windowSpacerExtrudeDistanceNumber.disabled = !allowWindowSpacer || !this._windowSpacerExtrude;
        this.streetWindowWidthRange.disabled = !allowStreetWindows;
        this.streetWindowWidthNumber.disabled = !allowStreetWindows;
        this.streetWindowGapRange.disabled = !allowStreetWindows;
        this.streetWindowGapNumber.disabled = !allowStreetWindows;
        this.streetWindowHeightRange.disabled = !allowStreetWindows;
        this.streetWindowHeightNumber.disabled = !allowStreetWindows;
        this.streetWindowYRange.disabled = !allowStreetWindows;
        this.streetWindowYNumber.disabled = !allowStreetWindows;
        this.streetWindowFrameWidthRange.disabled = !allowStreetWindowParams;
        this.streetWindowFrameWidthNumber.disabled = !allowStreetWindowParams;
        this.streetWindowFrameColorPickButton.disabled = !allowStreetWindowParams;
        this.streetWindowGlassTopPickButton.disabled = !allowStreetWindowParams;
        this.streetWindowGlassBottomPickButton.disabled = !allowStreetWindowParams;
        this.streetWindowSpacerInput.disabled = !allowStreetWindows;
        this.streetWindowSpacerEveryRange.disabled = !allowStreetWindowSpacer;
        this.streetWindowSpacerEveryNumber.disabled = !allowStreetWindowSpacer;
        this.streetWindowSpacerWidthRange.disabled = !allowStreetWindowSpacer;
        this.streetWindowSpacerWidthNumber.disabled = !allowStreetWindowSpacer;
        this.streetWindowSpacerExtrudeInput.disabled = !allowStreetWindowSpacer;
        this.streetWindowSpacerExtrudeDistanceRange.disabled = !allowStreetWindowSpacer || !this._streetWindowSpacerExtrude;
        this.streetWindowSpacerExtrudeDistanceNumber.disabled = !allowStreetWindowSpacer || !this._streetWindowSpacerExtrude;

        if (!hasSelected) {
            this.typeSelect.value = 'business';
            this.floorRange.value = String(this.floorMin);
            this.floorNumber.value = '';

            this.floorHeightRange.value = String(this.floorHeightMin);
            this.floorHeightNumber.value = '';

            this.streetEnabledInput.checked = false;
            this.streetFloorsRange.value = '0';
            this.streetFloorsNumber.value = '';
            this.streetHeightRange.value = '1.0';
            this.streetHeightNumber.value = '';
            this._syncStreetStyleButtons({ allow: false });
            this._syncStreetWindowStyleButtons({ allow: false });
            this.streetWindowWidthRange.value = '0.3';
            this.streetWindowWidthNumber.value = '';
            this.streetWindowGapRange.value = '0';
            this.streetWindowGapNumber.value = '';
            this.streetWindowHeightRange.value = '0.3';
            this.streetWindowHeightNumber.value = '';
            this.streetWindowYRange.value = '0';
            this.streetWindowYNumber.value = '';
            this.streetWindowSpacerInput.checked = false;
            this.streetWindowSpacerEveryRange.value = '1';
            this.streetWindowSpacerEveryNumber.value = '';
            this.streetWindowSpacerWidthRange.value = '0.1';
            this.streetWindowSpacerWidthNumber.value = '';
            this.streetWindowSpacerExtrudeInput.checked = false;
            this.streetWindowSpacerExtrudeDistanceRange.value = '0';
            this.streetWindowSpacerExtrudeDistanceNumber.value = '';

            this.beltCourseInput.checked = false;
            this.beltMarginRange.value = '0';
            this.beltMarginNumber.value = '';
            this.beltHeightRange.value = '0.18';
            this.beltHeightNumber.value = '';
            this._syncBeltCourseColorButtons({ allow: false });
            this.beltColorStatus.textContent = '';
            this.beltStatus.textContent = '';

            this.topBeltInput.checked = false;
            this.topBeltWidthRange.value = '0';
            this.topBeltWidthNumber.value = '';
            this.topBeltInnerWidthRange.value = '0';
            this.topBeltInnerWidthNumber.value = '';
            this.topBeltHeightRange.value = '0.18';
            this.topBeltHeightNumber.value = '';
            this._syncTopBeltColorButtons({ allow: false });
            this.topBeltColorStatus.textContent = '';

            this._syncRoofColorButtons({ allow: false });
            this.roofColorStatus.textContent = '';
            this.wallInsetRange.value = '0';
            this.wallInsetNumber.value = '';

            this._syncWindowStyleButtons({ allow: false });
            this.windowWidthRange.value = '0.3';
            this.windowWidthNumber.value = '';
            this.windowGapRange.value = '0';
            this.windowGapNumber.value = '';
            this.windowHeightRange.value = '0.3';
            this.windowHeightNumber.value = '';
            this.windowYRange.value = '0';
            this.windowYNumber.value = '';
            this.windowSpacerInput.checked = false;
            this.windowSpacerEveryRange.value = '1';
            this.windowSpacerEveryNumber.value = '';
            this.windowSpacerWidthRange.value = '0.1';
            this.windowSpacerWidthNumber.value = '';
            this.windowSpacerExtrudeInput.checked = false;
            this.windowSpacerExtrudeDistanceRange.value = '0';
            this.windowSpacerExtrudeDistanceNumber.value = '';
            this._syncBuildingStyleButtons({ allow: false });
            return;
        }

        this.typeSelect.value = this._buildingType;
        this._syncBuildingStyleButtons({ allow });
        this.floorRange.value = String(this._floorCount);
        this.floorNumber.value = String(this._floorCount);

        this.floorHeightRange.value = String(this._floorHeight);
        this.floorHeightNumber.value = formatFloat(this._floorHeight, 1);

        this.streetEnabledInput.checked = this._streetEnabled;
        this.streetFloorsRange.max = String(this._floorCount);
        this.streetFloorsNumber.max = String(this._floorCount);
        this.streetFloorsRange.value = String(this._streetFloors);
        this.streetFloorsNumber.value = String(this._streetFloors);
        this.streetHeightRange.value = String(this._streetFloorHeight);
        this.streetHeightNumber.value = formatFloat(this._streetFloorHeight, 1);
        this._syncStreetStyleButtons({ allow: allowStreetStyle });
        this._syncStreetWindowStyleButtons({ allow: allowStreetWindows });
        const streetWindowParams = { ...getDefaultWindowParams(this._streetWindowTypeId), ...(this._streetWindowParams ?? {}) };
        const streetWindowFrameWidth = clamp(streetWindowParams.frameWidth, 0.02, 0.2);
        const streetWindowFrameColor = Number.isFinite(streetWindowParams.frameColor) ? streetWindowParams.frameColor : 0xffffff;
        const streetWindowGlassTop = Number.isFinite(streetWindowParams.glassTop) ? streetWindowParams.glassTop : 0x94d9ff;
        const streetWindowGlassBottom = Number.isFinite(streetWindowParams.glassBottom) ? streetWindowParams.glassBottom : 0x12507a;
        const streetWindowFrameLabel = (this._windowParamColorOptions ?? []).find((c) => c.hex === streetWindowFrameColor)?.label
            ?? `#${streetWindowFrameColor.toString(16).padStart(6, '0')}`;
        const streetWindowGlassTopLabel = (this._windowParamColorOptions ?? []).find((c) => c.hex === streetWindowGlassTop)?.label
            ?? `#${streetWindowGlassTop.toString(16).padStart(6, '0')}`;
        const streetWindowGlassBottomLabel = (this._windowParamColorOptions ?? []).find((c) => c.hex === streetWindowGlassBottom)?.label
            ?? `#${streetWindowGlassBottom.toString(16).padStart(6, '0')}`;
        this.streetWindowFrameWidthRange.value = String(streetWindowFrameWidth);
        this.streetWindowFrameWidthNumber.value = formatFloat(streetWindowFrameWidth, 2);
        if (this.streetWindowFrameColorPickText) this.streetWindowFrameColorPickText.textContent = streetWindowFrameLabel;
        if (this.streetWindowGlassTopPickText) this.streetWindowGlassTopPickText.textContent = streetWindowGlassTopLabel;
        if (this.streetWindowGlassBottomPickText) this.streetWindowGlassBottomPickText.textContent = streetWindowGlassBottomLabel;
        setMaterialThumbToColor(this.streetWindowFrameColorPickThumb, streetWindowFrameColor);
        setMaterialThumbToColor(this.streetWindowGlassTopPickThumb, streetWindowGlassTop);
        setMaterialThumbToColor(this.streetWindowGlassBottomPickThumb, streetWindowGlassBottom);
        this.streetWindowWidthRange.value = String(this._streetWindowWidth);
        this.streetWindowWidthNumber.value = formatFloat(this._streetWindowWidth, 1);
        this.streetWindowGapRange.value = String(this._streetWindowGap);
        this.streetWindowGapNumber.value = formatFloat(this._streetWindowGap, 1);
        this.streetWindowHeightRange.value = String(this._streetWindowHeight);
        this.streetWindowHeightNumber.value = formatFloat(this._streetWindowHeight, 1);
        this.streetWindowYRange.value = String(this._streetWindowY);
        this.streetWindowYNumber.value = formatFloat(this._streetWindowY, 1);
        this.streetWindowSpacerInput.checked = this._streetWindowSpacerEnabled;
        this.streetWindowSpacerEveryRange.value = String(this._streetWindowSpacerEvery);
        this.streetWindowSpacerEveryNumber.value = String(this._streetWindowSpacerEvery);
        this.streetWindowSpacerWidthRange.value = String(this._streetWindowSpacerWidth);
        this.streetWindowSpacerWidthNumber.value = formatFloat(this._streetWindowSpacerWidth, 1);
        this.streetWindowSpacerExtrudeInput.checked = this._streetWindowSpacerExtrude;
        this.streetWindowSpacerExtrudeDistanceRange.value = String(this._streetWindowSpacerExtrudeDistance);
        this.streetWindowSpacerExtrudeDistanceNumber.value = formatFloat(this._streetWindowSpacerExtrudeDistance, 2);

        this.beltCourseInput.checked = this._beltCourseEnabled;
        this.beltMarginRange.value = String(this._beltCourseMargin);
        this.beltMarginNumber.value = formatFloat(this._beltCourseMargin, 1);
        this.beltHeightRange.value = String(this._beltCourseHeight);
        this.beltHeightNumber.value = formatFloat(this._beltCourseHeight, 2);
        this._syncBeltCourseColorButtons({ allow: allowBelt && this._beltCourseEnabled });
        if (this._streetFloors >= this._floorCount) {
            this.beltStatus.textContent = 'Add at least one upper floor to use a belt course.';
        } else {
            this.beltStatus.textContent = '';
        }

        this._syncWindowStyleButtons({ allow });
        const windowParams = { ...getDefaultWindowParams(this._windowTypeId), ...(this._windowParams ?? {}) };
        const windowFrameWidth = clamp(windowParams.frameWidth, 0.02, 0.2);
        const windowFrameColor = Number.isFinite(windowParams.frameColor) ? windowParams.frameColor : 0xffffff;
        const windowGlassTop = Number.isFinite(windowParams.glassTop) ? windowParams.glassTop : 0x94d9ff;
        const windowGlassBottom = Number.isFinite(windowParams.glassBottom) ? windowParams.glassBottom : 0x12507a;
        const windowFrameLabel = (this._windowParamColorOptions ?? []).find((c) => c.hex === windowFrameColor)?.label
            ?? `#${windowFrameColor.toString(16).padStart(6, '0')}`;
        const windowGlassTopLabel = (this._windowParamColorOptions ?? []).find((c) => c.hex === windowGlassTop)?.label
            ?? `#${windowGlassTop.toString(16).padStart(6, '0')}`;
        const windowGlassBottomLabel = (this._windowParamColorOptions ?? []).find((c) => c.hex === windowGlassBottom)?.label
            ?? `#${windowGlassBottom.toString(16).padStart(6, '0')}`;
        this.windowFrameWidthRange.value = String(windowFrameWidth);
        this.windowFrameWidthNumber.value = formatFloat(windowFrameWidth, 2);
        if (this.windowFrameColorPickText) this.windowFrameColorPickText.textContent = windowFrameLabel;
        if (this.windowGlassTopPickText) this.windowGlassTopPickText.textContent = windowGlassTopLabel;
        if (this.windowGlassBottomPickText) this.windowGlassBottomPickText.textContent = windowGlassBottomLabel;
        setMaterialThumbToColor(this.windowFrameColorPickThumb, windowFrameColor);
        setMaterialThumbToColor(this.windowGlassTopPickThumb, windowGlassTop);
        setMaterialThumbToColor(this.windowGlassBottomPickThumb, windowGlassBottom);
        this.windowWidthRange.value = String(this._windowWidth);
        this.windowWidthNumber.value = formatFloat(this._windowWidth, 1);
        this.windowGapRange.value = String(this._windowGap);
        this.windowGapNumber.value = formatFloat(this._windowGap, 1);
        this.windowHeightRange.value = String(this._windowHeight);
        this.windowHeightNumber.value = formatFloat(this._windowHeight, 1);
        this.windowYRange.value = String(this._windowY);
        this.windowYNumber.value = formatFloat(this._windowY, 1);
        this.windowSpacerInput.checked = this._windowSpacerEnabled;
        this.windowSpacerEveryRange.value = String(this._windowSpacerEvery);
        this.windowSpacerEveryNumber.value = String(this._windowSpacerEvery);
        this.windowSpacerWidthRange.value = String(this._windowSpacerWidth);
        this.windowSpacerWidthNumber.value = formatFloat(this._windowSpacerWidth, 1);
        this.windowSpacerExtrudeInput.checked = this._windowSpacerExtrude;
        this.windowSpacerExtrudeDistanceRange.value = String(this._windowSpacerExtrudeDistance);
        this.windowSpacerExtrudeDistanceNumber.value = formatFloat(this._windowSpacerExtrudeDistance, 2);

        this.topBeltInput.checked = this._topBeltEnabled;
        this._syncTopBeltColorButtons({ allow: allowTopBelt });
        this.topBeltWidthRange.value = String(this._topBeltWidth);
        this.topBeltWidthNumber.value = formatFloat(this._topBeltWidth, 1);
        this.topBeltInnerWidthRange.value = String(this._topBeltInnerWidth);
        this.topBeltInnerWidthNumber.value = formatFloat(this._topBeltInnerWidth, 1);
        this.topBeltHeightRange.value = String(this._topBeltHeight);
        this.topBeltHeightNumber.value = formatFloat(this._topBeltHeight, 2);
        this.wallInsetRange.value = String(this._wallInset);
        this.wallInsetNumber.value = formatFloat(this._wallInset, 2);
    }

    setSelectedCount(count) {
        const safe = clampInt(count, 0, 9999);
        this._selectedTileCount = safe;
        this.selectedCountEl.textContent = `Selected: ${safe}`;
        if (this.buildBtn) this.buildBtn.disabled = !this._buildingModeEnabled || safe <= 0;
        if (this.clearSelBtn) this.clearSelBtn.disabled = !this._buildingModeEnabled || safe <= 0;
        this._syncToast();
    }

    setBuildingCount(count) {
        const safe = clampInt(count, 0, 9999);
        this.buildingCountEl.textContent = `Buildings: ${safe}`;
    }

    setRoadCount(count) {
        const safe = clampInt(count, 0, 9999);
        this.roadCountEl.textContent = `Road tiles: ${safe}`;
    }

    setRoadStatus({ startTileId = null } = {}) {
        this._roadStartTileId = startTileId ?? null;
        this._syncToast();
    }

    setRoads(roads = []) {
        const list = Array.isArray(roads) ? roads : [];
        this._roadRemoveButtons.length = 0;
        this.roadList.textContent = '';

        if (this._hoveredRoadId !== null || this._hoveredRoadRow) {
            this._hoveredRoadId = null;
            this._hoveredRoadRow = null;
            this.onRoadHover?.(null);
        }

        if (!list.length) {
            const empty = document.createElement('div');
            empty.className = 'building-fab-road-empty';
            empty.textContent = 'No roads yet.';
            this.roadList.appendChild(empty);
            return;
        }

        for (const road of list) {
            const roadId = Number.isFinite(road?.id) ? road.id : null;
            if (roadId === null) continue;

            const row = document.createElement('div');
            row.className = 'building-fab-road-item';

            const label = document.createElement('div');
            label.className = 'building-fab-road-item-label';
            const a = road?.a ?? {};
            const b = road?.b ?? {};
            const ax = Number.isFinite(a.x) ? a.x : 0;
            const ay = Number.isFinite(a.y) ? a.y : 0;
            const bx = Number.isFinite(b.x) ? b.x : 0;
            const by = Number.isFinite(b.y) ? b.y : 0;
            label.textContent = `Road ${roadId}: ${ax},${ay} → ${bx},${by}`;

            const actions = document.createElement('div');
            actions.className = 'building-fab-road-item-actions';

            const trash = document.createElement('button');
            trash.type = 'button';
            trash.className = 'building-fab-road-trash';
            trash.setAttribute('aria-label', 'Remove road');
            trash.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                    <path fill="currentColor" d="M9 3h6l1 2h5v2H3V5h5l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9ZM6 9h2v9H6V9Zm1-1h10l-1 14H8L7 8Z"/>
                </svg>
            `;

            trash.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.onRoadRemove?.(roadId);
            });

            row.addEventListener('mouseenter', () => {
                if (this._hoveredRoadRow && this._hoveredRoadRow !== row) {
                    this._hoveredRoadRow.classList.remove('is-hovered');
                }
                this._hoveredRoadId = roadId;
                this._hoveredRoadRow = row;
                row.classList.add('is-hovered');
                this.onRoadHover?.(roadId);
            });

            row.addEventListener('mouseleave', () => {
                if (this._hoveredRoadRow === row) {
                    this._hoveredRoadId = null;
                    this._hoveredRoadRow = null;
                }
                row.classList.remove('is-hovered');
                this.onRoadHover?.(null);
            });

            actions.appendChild(trash);
            row.appendChild(label);
            row.appendChild(actions);
            this.roadList.appendChild(row);
            this._roadRemoveButtons.push(trash);
        }
    }

    setBuildings(buildings = [], { selectedBuildingId = null } = {}) {
        const list = Array.isArray(buildings) ? buildings : [];
        const selectedId = typeof selectedBuildingId === 'string' ? selectedBuildingId : this._selectedBuildingId;

        this.buildingsList.textContent = '';
        this._hoveredBuildingRow = null;

        if (!list.length) {
            const empty = document.createElement('div');
            empty.className = 'building-fab-building-empty';
            empty.textContent = 'No buildings yet.';
            this.buildingsList.appendChild(empty);
            return;
        }

        for (const building of list) {
            const id = typeof building?.id === 'string' ? building.id : null;
            if (!id) continue;

            const row = document.createElement('div');
            row.className = `building-fab-building-item${id === selectedId ? ' is-selected' : ''}`;

            const tiles = Number.isFinite(building?.tileCount) ? building.tileCount : null;
            const floors = Number.isFinite(building?.floors) ? building.floors : null;

            const label = document.createElement('div');
            label.className = 'building-fab-building-item-label';
            const parts = [`${id}`];
            if (tiles !== null) parts.push(`${tiles} tiles`);
            if (floors !== null) parts.push(`${floors} floors`);
            label.textContent = parts.join(' • ');

            row.appendChild(label);

            row.addEventListener('click', () => {
                if (this._roadModeEnabled || this._buildingModeEnabled) return;
                const next = id === selectedId ? null : id;
                this.onSelectBuilding?.(next);
            });

            this.buildingsList.appendChild(row);
        }
    }

    _setFloorCountFromUi(raw) {
        const next = clampInt(raw, this.floorMin, this.floorMax);
        const changed = next !== this._floorCount;
        this._floorCount = next;
        this.floorRange.value = String(next);
        this.floorNumber.value = String(next);
        if (changed) this.onFloorCountChange?.(next);
    }

    _setFloorHeightFromUi(raw) {
        const next = clamp(raw, this.floorHeightMin, this.floorHeightMax);
        const changed = Math.abs(next - this._floorHeight) >= 1e-6;
        this._floorHeight = next;
        this.floorHeightRange.value = String(next);
        this.floorHeightNumber.value = formatFloat(next, 1);
        if (changed) this.onFloorHeightChange?.(next);
    }

    _setWallInsetFromUi(raw) {
        const next = clamp(raw, 0.0, 4.0);
        const changed = Math.abs(next - this._wallInset) >= 1e-6;
        this._wallInset = next;
        this.wallInsetRange.value = String(next);
        this.wallInsetNumber.value = formatFloat(next, 2);
        if (changed) this.onWallInsetChange?.(next);
    }

    _setWindowWidthFromUi(raw) {
        const next = clamp(raw, 0.3, 12.0);
        const changed = Math.abs(next - this._windowWidth) >= 1e-6;
        this._windowWidth = next;
        this.windowWidthRange.value = String(next);
        this.windowWidthNumber.value = formatFloat(next, 1);
        if (changed) this.onWindowWidthChange?.(next);
    }

    _setWindowGapFromUi(raw) {
        const next = clamp(raw, 0.0, 24.0);
        const changed = Math.abs(next - this._windowGap) >= 1e-6;
        this._windowGap = next;
        this.windowGapRange.value = String(next);
        this.windowGapNumber.value = formatFloat(next, 1);
        if (changed) this.onWindowGapChange?.(next);
    }

    _setWindowHeightFromUi(raw) {
        const next = clamp(raw, 0.3, 10.0);
        const changed = Math.abs(next - this._windowHeight) >= 1e-6;
        this._windowHeight = next;
        this.windowHeightRange.value = String(next);
        this.windowHeightNumber.value = formatFloat(next, 1);
        if (changed) this.onWindowHeightChange?.(next);
    }

    _setWindowYFromUi(raw) {
        const next = clamp(raw, 0.0, 12.0);
        const changed = Math.abs(next - this._windowY) >= 1e-6;
        this._windowY = next;
        this.windowYRange.value = String(next);
        this.windowYNumber.value = formatFloat(next, 1);
        if (changed) this.onWindowYChange?.(next);
    }

    _isParametricWindowType(typeId) {
        const id = isWindowTypeId(typeId) ? typeId : WINDOW_TYPE.STYLE_DEFAULT;
        return id === WINDOW_TYPE.ARCH_V1 || id === WINDOW_TYPE.MODERN_V1;
    }

    _setWindowFrameWidthFromUi(raw) {
        const next = clamp(raw, 0.02, 0.2);
        const prev = Number(this._windowParams?.frameWidth) || 0;
        const changed = Math.abs(next - prev) >= 1e-6;
        this._windowParams = { ...(this._windowParams ?? {}), frameWidth: next };
        this.windowFrameWidthRange.value = String(next);
        this.windowFrameWidthNumber.value = formatFloat(next, 2);
        if (changed) this.onWindowFrameWidthChange?.(next);
    }

    _setStreetWindowFrameWidthFromUi(raw) {
        const next = clamp(raw, 0.02, 0.2);
        const prev = Number(this._streetWindowParams?.frameWidth) || 0;
        const changed = Math.abs(next - prev) >= 1e-6;
        this._streetWindowParams = { ...(this._streetWindowParams ?? {}), frameWidth: next };
        this.streetWindowFrameWidthRange.value = String(next);
        this.streetWindowFrameWidthNumber.value = formatFloat(next, 2);
        if (changed) this.onStreetWindowFrameWidthChange?.(next);
    }

    _openWindowParamColorPicker({ title, selectedHex, onPick } = {}) {
        if (typeof onPick !== 'function') return;
        const options = (this._windowParamColorOptions ?? []).map((c) => ({
            id: c.id,
            label: c.label,
            kind: 'color',
            hex: c.hex
        }));
        const selected = (this._windowParamColorOptions ?? []).find((c) => c.hex === selectedHex)?.id ?? null;
        this._pickerPopup.open({
            title: title || 'Select color',
            sections: [{ label: 'Colors', options }],
            selectedId: selected,
            onSelect: (opt) => onPick(opt?.hex)
        });
    }

    _openWindowFrameColorPicker() {
        const hex = Number(this._windowParams?.frameColor);
        this._openWindowParamColorPicker({
            title: 'Frame color',
            selectedHex: Number.isFinite(hex) ? hex : null,
            onPick: (pickedHex) => {
                if (!Number.isFinite(pickedHex)) return;
                this._windowParams = { ...(this._windowParams ?? {}), frameColor: pickedHex };
                this.onWindowFrameColorChange?.(pickedHex);
                this._syncPropertyWidgets();
            }
        });
    }

    _openWindowGlassTopPicker() {
        const hex = Number(this._windowParams?.glassTop);
        this._openWindowParamColorPicker({
            title: 'Glass top',
            selectedHex: Number.isFinite(hex) ? hex : null,
            onPick: (pickedHex) => {
                if (!Number.isFinite(pickedHex)) return;
                this._windowParams = { ...(this._windowParams ?? {}), glassTop: pickedHex };
                this.onWindowGlassTopChange?.(pickedHex);
                this._syncPropertyWidgets();
            }
        });
    }

    _openWindowGlassBottomPicker() {
        const hex = Number(this._windowParams?.glassBottom);
        this._openWindowParamColorPicker({
            title: 'Glass bottom',
            selectedHex: Number.isFinite(hex) ? hex : null,
            onPick: (pickedHex) => {
                if (!Number.isFinite(pickedHex)) return;
                this._windowParams = { ...(this._windowParams ?? {}), glassBottom: pickedHex };
                this.onWindowGlassBottomChange?.(pickedHex);
                this._syncPropertyWidgets();
            }
        });
    }

    _openStreetWindowFrameColorPicker() {
        const hex = Number(this._streetWindowParams?.frameColor);
        this._openWindowParamColorPicker({
            title: 'Street frame color',
            selectedHex: Number.isFinite(hex) ? hex : null,
            onPick: (pickedHex) => {
                if (!Number.isFinite(pickedHex)) return;
                this._streetWindowParams = { ...(this._streetWindowParams ?? {}), frameColor: pickedHex };
                this.onStreetWindowFrameColorChange?.(pickedHex);
                this._syncPropertyWidgets();
            }
        });
    }

    _openStreetWindowGlassTopPicker() {
        const hex = Number(this._streetWindowParams?.glassTop);
        this._openWindowParamColorPicker({
            title: 'Street glass top',
            selectedHex: Number.isFinite(hex) ? hex : null,
            onPick: (pickedHex) => {
                if (!Number.isFinite(pickedHex)) return;
                this._streetWindowParams = { ...(this._streetWindowParams ?? {}), glassTop: pickedHex };
                this.onStreetWindowGlassTopChange?.(pickedHex);
                this._syncPropertyWidgets();
            }
        });
    }

    _openStreetWindowGlassBottomPicker() {
        const hex = Number(this._streetWindowParams?.glassBottom);
        this._openWindowParamColorPicker({
            title: 'Street glass bottom',
            selectedHex: Number.isFinite(hex) ? hex : null,
            onPick: (pickedHex) => {
                if (!Number.isFinite(pickedHex)) return;
                this._streetWindowParams = { ...(this._streetWindowParams ?? {}), glassBottom: pickedHex };
                this.onStreetWindowGlassBottomChange?.(pickedHex);
                this._syncPropertyWidgets();
            }
        });
    }

    _setWindowSpacerEnabledFromUi(raw) {
        const next = !!raw;
        const changed = next !== this._windowSpacerEnabled;
        this._windowSpacerEnabled = next;
        this.windowSpacerInput.checked = next;
        this._syncPropertyWidgets();
        if (changed) this.onWindowSpacerEnabledChange?.(next);
    }

    _setWindowSpacerEveryFromUi(raw) {
        const next = clampInt(raw, 1, 99);
        const changed = next !== this._windowSpacerEvery;
        this._windowSpacerEvery = next;
        this.windowSpacerEveryRange.value = String(next);
        this.windowSpacerEveryNumber.value = String(next);
        this._syncPropertyWidgets();
        if (changed) this.onWindowSpacerEveryChange?.(next);
    }

    _setWindowSpacerWidthFromUi(raw) {
        const next = clamp(raw, 0.1, 10.0);
        const changed = Math.abs(next - this._windowSpacerWidth) >= 1e-6;
        this._windowSpacerWidth = next;
        this.windowSpacerWidthRange.value = String(next);
        this.windowSpacerWidthNumber.value = formatFloat(next, 1);
        this._syncPropertyWidgets();
        if (changed) this.onWindowSpacerWidthChange?.(next);
    }

    _setWindowSpacerExtrudeFromUi(raw) {
        const next = !!raw;
        const changed = next !== this._windowSpacerExtrude;
        this._windowSpacerExtrude = next;
        this.windowSpacerExtrudeInput.checked = next;
        this._syncPropertyWidgets();
        if (changed) this.onWindowSpacerExtrudeChange?.(next);
    }

    _setWindowSpacerExtrudeDistanceFromUi(raw) {
        const next = clamp(raw, 0.0, 1.0);
        const changed = Math.abs(next - this._windowSpacerExtrudeDistance) >= 1e-6;
        this._windowSpacerExtrudeDistance = next;
        this.windowSpacerExtrudeDistanceRange.value = String(next);
        this.windowSpacerExtrudeDistanceNumber.value = formatFloat(next, 2);
        this._syncPropertyWidgets();
        if (changed) this.onWindowSpacerExtrudeDistanceChange?.(next);
    }

    _setBuildingTypeFromUi(raw) {
        const next = typeof raw === 'string' ? raw : '';
        const safe = next === 'business' || next === 'industrial' || next === 'apartments' || next === 'house'
            ? next
            : 'business';
        const changed = safe !== this._buildingType;
        this._buildingType = safe;
        this.typeSelect.value = safe;
        if (changed) this.onBuildingTypeChange?.(safe);
    }

    _setCatalogBuildingConfigFromUi(raw, { autoLoad = false } = {}) {
        const next = typeof raw === 'string' ? raw : '';
        this._catalogBuildingConfigId = next;
        if (this.loadCatalogSelect) this.loadCatalogSelect.value = next;
        this._syncPropertyWidgets();
        if (autoLoad && this._enabled && next) this.onLoadBuildingConfigFromCatalog?.(next);
    }

    _loadCatalogBuildingConfigFromUi() {
        if (!this._enabled) return;
        const id = this._catalogBuildingConfigId;
        if (!id) return;
        this.onLoadBuildingConfigFromCatalog?.(id);
    }

    _setBuildingStyleFromUi(raw) {
        const next = isBuildingStyle(raw) ? raw : BUILDING_STYLE.DEFAULT;
        const changed = next !== this._buildingStyle;
        this._buildingStyle = next;
        this._syncBuildingStyleButtons({ allow: true });
        if (changed) this.onBuildingStyleChange?.(next);
    }

    _setStreetEnabledFromUi(raw) {
        const next = !!raw;
        const changed = next !== this._streetEnabled;
        this._streetEnabled = next;
        this.streetEnabledInput.checked = next;
        this._syncPropertyWidgets();
        if (changed) this.onStreetEnabledChange?.(next);
    }

    _setStreetFloorsFromUi(raw) {
        const max = Math.max(0, this._floorCount);
        const next = clampInt(raw, 0, max);
        const changed = next !== this._streetFloors;
        this._streetFloors = next;
        this.streetFloorsRange.value = String(next);
        this.streetFloorsNumber.value = String(next);
        this._syncPropertyWidgets();
        if (changed) this.onStreetFloorsChange?.(next);
    }

    _setStreetFloorHeightFromUi(raw) {
        const next = clamp(raw, 1.0, 12.0);
        const changed = Math.abs(next - this._streetFloorHeight) >= 1e-6;
        this._streetFloorHeight = next;
        this.streetHeightRange.value = String(next);
        this.streetHeightNumber.value = formatFloat(next, 1);
        this._syncPropertyWidgets();
        if (changed) this.onStreetFloorHeightChange?.(next);
    }

    _setStreetStyleFromUi(raw) {
        const next = isBuildingStyle(raw) ? raw : BUILDING_STYLE.DEFAULT;
        const changed = next !== this._streetStyle;
        this._streetStyle = next;
        this._syncStreetStyleButtons({ allow: true });
        if (changed) this.onStreetStyleChange?.(next);
    }

    _setBeltCourseEnabledFromUi(raw) {
        const next = !!raw;
        const changed = next !== this._beltCourseEnabled;
        this._beltCourseEnabled = next;
        this.beltCourseInput.checked = next;
        this._syncPropertyWidgets();
        if (changed) this.onBeltCourseEnabledChange?.(next);
    }

    _setBeltMarginFromUi(raw) {
        const next = clamp(raw, 0.0, 4.0);
        const changed = Math.abs(next - this._beltCourseMargin) >= 1e-6;
        this._beltCourseMargin = next;
        this.beltMarginRange.value = String(next);
        this.beltMarginNumber.value = formatFloat(next, 1);
        this._syncPropertyWidgets();
        if (changed) this.onBeltCourseMarginChange?.(next);
    }

    _setBeltHeightFromUi(raw) {
        const next = clamp(raw, 0.02, 1.2);
        const changed = Math.abs(next - this._beltCourseHeight) >= 1e-6;
        this._beltCourseHeight = next;
        this.beltHeightRange.value = String(next);
        this.beltHeightNumber.value = formatFloat(next, 2);
        this._syncPropertyWidgets();
        if (changed) this.onBeltCourseHeightChange?.(next);
    }

    _setBeltCourseColorFromUi(raw) {
        const next = isBeltCourseColor(raw) ? raw : BELT_COURSE_COLOR.OFFWHITE;
        const changed = next !== this._beltCourseColor;
        this._beltCourseColor = next;
        this._syncBeltCourseColorButtons({ allow: true });
        if (changed) this.onBeltCourseColorChange?.(next);
    }

    _setTopBeltColorFromUi(raw) {
        const next = isBeltCourseColor(raw) ? raw : BELT_COURSE_COLOR.OFFWHITE;
        const changed = next !== this._topBeltColor;
        this._topBeltColor = next;
        this._syncTopBeltColorButtons({ allow: true });
        if (changed) this.onTopBeltColorChange?.(next);
    }

    _setRoofColorFromUi(raw) {
        const next = isRoofColor(raw) ? raw : ROOF_COLOR.DEFAULT;
        const changed = next !== this._roofColor;
        this._roofColor = next;
        this._syncRoofColorButtons({ allow: true });
        if (changed) this.onRoofColorChange?.(next);
    }

    _setTopBeltEnabledFromUi(raw) {
        const next = !!raw;
        const changed = next !== this._topBeltEnabled;
        this._topBeltEnabled = next;
        this.topBeltInput.checked = next;
        this._syncPropertyWidgets();
        if (changed) this.onTopBeltEnabledChange?.(next);
    }

    _setTopBeltWidthFromUi(raw) {
        const next = clamp(raw, 0.0, 4.0);
        const changed = Math.abs(next - this._topBeltWidth) >= 1e-6;
        this._topBeltWidth = next;
        this.topBeltWidthRange.value = String(next);
        this.topBeltWidthNumber.value = formatFloat(next, 1);
        this._syncPropertyWidgets();
        if (changed) this.onTopBeltWidthChange?.(next);
    }

    _setTopBeltInnerWidthFromUi(raw) {
        const next = clamp(raw, 0.0, 4.0);
        const changed = Math.abs(next - this._topBeltInnerWidth) >= 1e-6;
        this._topBeltInnerWidth = next;
        this.topBeltInnerWidthRange.value = String(next);
        this.topBeltInnerWidthNumber.value = formatFloat(next, 1);
        this._syncPropertyWidgets();
        if (changed) this.onTopBeltInnerWidthChange?.(next);
    }

    _setTopBeltHeightFromUi(raw) {
        const next = clamp(raw, 0.02, 1.2);
        const changed = Math.abs(next - this._topBeltHeight) >= 1e-6;
        this._topBeltHeight = next;
        this.topBeltHeightRange.value = String(next);
        this.topBeltHeightNumber.value = formatFloat(next, 2);
        this._syncPropertyWidgets();
        if (changed) this.onTopBeltHeightChange?.(next);
    }

    _renderBeltCourseColorOptions() {
        if (!this.beltColorGrid) return;
        this.beltColorGrid.textContent = '';

        for (const opt of this._beltCourseColorOptions ?? []) {
            const id = typeof opt?.id === 'string' ? opt.id : '';
            if (!id) continue;
            const label = typeof opt?.label === 'string' ? opt.label : id;
            const hex = Number.isFinite(opt?.hex) ? opt.hex : 0xffffff;
            const hexCss = `#${hex.toString(16).padStart(6, '0')}`;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab-texture-option';
            btn.dataset.colorId = id;
            btn.title = label;
            btn.setAttribute('aria-label', label);

            const swatch = document.createElement('div');
            swatch.className = 'building-fab-color-swatch';
            swatch.style.background = hexCss;
            btn.appendChild(swatch);
            this.beltColorGrid.appendChild(btn);
        }
    }

    _syncBeltCourseColorButtons({ allow } = {}) {
        const enabled = !!allow;
        const selected = this._beltCourseColor || BELT_COURSE_COLOR.OFFWHITE;
        const found = (this._beltCourseColorOptions ?? []).find((opt) => opt?.id === selected) ?? null;
        const label = found?.label ?? selected;
        const hex = Number.isFinite(found?.hex) ? found.hex : 0xffffff;

        if (this.beltColorPickButton) this.beltColorPickButton.disabled = !enabled;
        if (this.beltColorPickText) this.beltColorPickText.textContent = label;
        setMaterialThumbToColor(this.beltColorPickThumb, hex);
        this.beltColorStatus.textContent = enabled ? label : '';
    }

    _openBeltCourseColorPicker() {
        if (this.beltColorPickButton?.disabled) return;
        const options = (this._beltCourseColorOptions ?? []).map((opt) => ({
            id: opt.id,
            label: opt.label,
            kind: 'color',
            hex: opt.hex
        }));
        this._pickerPopup.open({
            title: 'Belt color',
            sections: [{ label: 'Colors', options }],
            selectedId: this._beltCourseColor || BELT_COURSE_COLOR.OFFWHITE,
            onSelect: (opt) => this._setBeltCourseColorFromUi(opt.id)
        });
    }

    _handleBeltCourseColorGridClick(e) {
        if (e) e.preventDefault?.();
        this._openBeltCourseColorPicker();
    }

    _renderTopBeltColorOptions() {
        if (!this.topBeltColorGrid) return;
        this.topBeltColorGrid.textContent = '';

        for (const opt of this._beltCourseColorOptions ?? []) {
            const id = typeof opt?.id === 'string' ? opt.id : '';
            if (!id) continue;
            const label = typeof opt?.label === 'string' ? opt.label : id;
            const hex = Number.isFinite(opt?.hex) ? opt.hex : 0xffffff;
            const hexCss = `#${hex.toString(16).padStart(6, '0')}`;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab-texture-option';
            btn.dataset.colorId = id;
            btn.title = label;
            btn.setAttribute('aria-label', label);

            const swatch = document.createElement('div');
            swatch.className = 'building-fab-color-swatch';
            swatch.style.background = hexCss;
            btn.appendChild(swatch);
            this.topBeltColorGrid.appendChild(btn);
        }
    }

    _syncTopBeltColorButtons({ allow } = {}) {
        const enabled = !!allow;
        const selected = this._topBeltColor || BELT_COURSE_COLOR.OFFWHITE;
        const found = (this._beltCourseColorOptions ?? []).find((opt) => opt?.id === selected) ?? null;
        const label = found?.label ?? selected;
        const hex = Number.isFinite(found?.hex) ? found.hex : 0xffffff;

        if (this.topBeltColorPickButton) this.topBeltColorPickButton.disabled = !enabled;
        if (this.topBeltColorPickText) this.topBeltColorPickText.textContent = label;
        setMaterialThumbToColor(this.topBeltColorPickThumb, hex);
        this.topBeltColorStatus.textContent = enabled ? label : '';
    }

    _openTopBeltColorPicker() {
        if (this.topBeltColorPickButton?.disabled) return;
        const options = (this._beltCourseColorOptions ?? []).map((opt) => ({
            id: opt.id,
            label: opt.label,
            kind: 'color',
            hex: opt.hex
        }));
        this._pickerPopup.open({
            title: 'Roof belt color',
            sections: [{ label: 'Colors', options }],
            selectedId: this._topBeltColor || BELT_COURSE_COLOR.OFFWHITE,
            onSelect: (opt) => this._setTopBeltColorFromUi(opt.id)
        });
    }

    _handleTopBeltColorGridClick(e) {
        if (e) e.preventDefault?.();
        this._openTopBeltColorPicker();
    }

    _renderRoofColorOptions() {
        if (!this.roofColorGrid) return;
        this.roofColorGrid.textContent = '';

        for (const opt of this._roofColorOptions ?? []) {
            const id = typeof opt?.id === 'string' ? opt.id : '';
            if (!id) continue;
            const label = typeof opt?.label === 'string' ? opt.label : id;
            const hex = Number.isFinite(opt?.hex) ? opt.hex : 0xffffff;
            const hexCss = `#${hex.toString(16).padStart(6, '0')}`;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab-texture-option';
            btn.dataset.roofColorId = id;
            btn.title = label;
            btn.setAttribute('aria-label', label);

            const swatch = document.createElement('div');
            swatch.className = 'building-fab-color-swatch';
            swatch.style.background = id === ROOF_COLOR.DEFAULT
                ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.85), rgba(255,255,255,0.85) 6px, rgba(0,0,0,0.12) 6px, rgba(0,0,0,0.12) 12px)'
                : hexCss;
            btn.appendChild(swatch);
            this.roofColorGrid.appendChild(btn);
        }
    }

    _syncRoofColorButtons({ allow } = {}) {
        const enabled = !!allow;
        const selected = this._roofColor || ROOF_COLOR.DEFAULT;
        const found = (this._roofColorOptions ?? []).find((opt) => opt?.id === selected) ?? null;
        const label = found?.label ?? selected;
        const hex = Number.isFinite(found?.hex) ? found.hex : 0xffffff;

        if (this.roofColorPickButton) this.roofColorPickButton.disabled = !enabled;
        if (this.roofColorPickText) this.roofColorPickText.textContent = label;
        setMaterialThumbToColor(this.roofColorPickThumb, hex, { isDefaultRoof: selected === ROOF_COLOR.DEFAULT });
        this.roofColorStatus.textContent = enabled ? label : '';
    }

    _openRoofColorPicker() {
        if (this.roofColorPickButton?.disabled) return;
        const roofDefaultPreviewUrl = buildRoofDefaultPreviewUrl({ size: 96 });
        const options = (this._roofColorOptions ?? []).map((opt) => {
            const id = typeof opt?.id === 'string' ? opt.id : '';
            const label = typeof opt?.label === 'string' ? opt.label : id;
            const hex = Number.isFinite(opt?.hex) ? opt.hex : 0xffffff;
            if (id === ROOF_COLOR.DEFAULT && roofDefaultPreviewUrl) {
                return { id, label, kind: 'texture', previewUrl: roofDefaultPreviewUrl };
            }
            return { id, label, kind: 'color', hex };
        });
        this._pickerPopup.open({
            title: 'Roof color',
            sections: [{ label: 'Colors', options }],
            selectedId: this._roofColor || ROOF_COLOR.DEFAULT,
            onSelect: (opt) => this._setRoofColorFromUi(opt.id)
        });
    }

    _handleRoofColorGridClick(e) {
        if (e) e.preventDefault?.();
        this._openRoofColorPicker();
    }

    _setWindowStyleFromUi(raw) {
        const typeId = normalizeWindowTypeIdOrLegacyStyle(raw);
        const changed = typeId !== this._windowTypeId;
        this._windowTypeId = typeId;
        this._windowParams = getDefaultWindowParams(typeId);
        this._syncWindowStyleButtons({ allow: true });
        this._syncPropertyWidgets();
        if (changed) this.onWindowStyleChange?.(typeId);
    }

    _setStreetWindowStyleFromUi(raw) {
        const typeId = normalizeWindowTypeIdOrLegacyStyle(raw);
        const changed = typeId !== this._streetWindowTypeId;
        this._streetWindowTypeId = typeId;
        this._streetWindowParams = getDefaultWindowParams(typeId);
        this._syncStreetWindowStyleButtons({ allow: true });
        this._syncPropertyWidgets();
        if (changed) this.onStreetWindowStyleChange?.(typeId);
    }

    _setStreetWindowWidthFromUi(raw) {
        const next = clamp(raw, 0.3, 12.0);
        const changed = Math.abs(next - this._streetWindowWidth) >= 1e-6;
        this._streetWindowWidth = next;
        this.streetWindowWidthRange.value = String(next);
        this.streetWindowWidthNumber.value = formatFloat(next, 1);
        if (changed) this.onStreetWindowWidthChange?.(next);
    }

    _setStreetWindowGapFromUi(raw) {
        const next = clamp(raw, 0.0, 24.0);
        const changed = Math.abs(next - this._streetWindowGap) >= 1e-6;
        this._streetWindowGap = next;
        this.streetWindowGapRange.value = String(next);
        this.streetWindowGapNumber.value = formatFloat(next, 1);
        if (changed) this.onStreetWindowGapChange?.(next);
    }

    _setStreetWindowHeightFromUi(raw) {
        const next = clamp(raw, 0.3, 10.0);
        const changed = Math.abs(next - this._streetWindowHeight) >= 1e-6;
        this._streetWindowHeight = next;
        this.streetWindowHeightRange.value = String(next);
        this.streetWindowHeightNumber.value = formatFloat(next, 1);
        if (changed) this.onStreetWindowHeightChange?.(next);
    }

    _setStreetWindowYFromUi(raw) {
        const next = clamp(raw, 0.0, 12.0);
        const changed = Math.abs(next - this._streetWindowY) >= 1e-6;
        this._streetWindowY = next;
        this.streetWindowYRange.value = String(next);
        this.streetWindowYNumber.value = formatFloat(next, 1);
        if (changed) this.onStreetWindowYChange?.(next);
    }

    _setStreetWindowSpacerEnabledFromUi(raw) {
        const next = !!raw;
        const changed = next !== this._streetWindowSpacerEnabled;
        this._streetWindowSpacerEnabled = next;
        this.streetWindowSpacerInput.checked = next;
        this._syncPropertyWidgets();
        if (changed) this.onStreetWindowSpacerEnabledChange?.(next);
    }

    _setStreetWindowSpacerEveryFromUi(raw) {
        const next = clampInt(raw, 1, 99);
        const changed = next !== this._streetWindowSpacerEvery;
        this._streetWindowSpacerEvery = next;
        this.streetWindowSpacerEveryRange.value = String(next);
        this.streetWindowSpacerEveryNumber.value = String(next);
        this._syncPropertyWidgets();
        if (changed) this.onStreetWindowSpacerEveryChange?.(next);
    }

    _setStreetWindowSpacerWidthFromUi(raw) {
        const next = clamp(raw, 0.1, 10.0);
        const changed = Math.abs(next - this._streetWindowSpacerWidth) >= 1e-6;
        this._streetWindowSpacerWidth = next;
        this.streetWindowSpacerWidthRange.value = String(next);
        this.streetWindowSpacerWidthNumber.value = formatFloat(next, 1);
        this._syncPropertyWidgets();
        if (changed) this.onStreetWindowSpacerWidthChange?.(next);
    }

    _setStreetWindowSpacerExtrudeFromUi(raw) {
        const next = !!raw;
        const changed = next !== this._streetWindowSpacerExtrude;
        this._streetWindowSpacerExtrude = next;
        this.streetWindowSpacerExtrudeInput.checked = next;
        this._syncPropertyWidgets();
        if (changed) this.onStreetWindowSpacerExtrudeChange?.(next);
    }

    _setStreetWindowSpacerExtrudeDistanceFromUi(raw) {
        const next = clamp(raw, 0.0, 1.0);
        const changed = Math.abs(next - this._streetWindowSpacerExtrudeDistance) >= 1e-6;
        this._streetWindowSpacerExtrudeDistance = next;
        this.streetWindowSpacerExtrudeDistanceRange.value = String(next);
        this.streetWindowSpacerExtrudeDistanceNumber.value = formatFloat(next, 2);
        this._syncPropertyWidgets();
        if (changed) this.onStreetWindowSpacerExtrudeDistanceChange?.(next);
    }

    _renderWindowStyleOptions() {
        if (!this.windowStyleGrid) return;
        this.windowStyleGrid.textContent = '';

        for (const styleOpt of this._windowStyleOptions ?? []) {
            const id = typeof styleOpt?.id === 'string' ? styleOpt.id : '';
            if (!id) continue;
            const label = typeof styleOpt?.label === 'string' ? styleOpt.label : id;
            const previewUrl = typeof styleOpt?.previewUrl === 'string' ? styleOpt.previewUrl : '';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab-texture-option';
            btn.dataset.styleId = id;
            btn.title = label;
            btn.setAttribute('aria-label', label);

            if (!previewUrl) {
                const placeholder = document.createElement('div');
                placeholder.className = 'building-fab-texture-default';
                placeholder.textContent = label;
                btn.appendChild(placeholder);
            } else {
                const img = document.createElement('img');
                img.className = 'building-fab-texture-img';
                img.alt = label;
                img.loading = 'lazy';
                img.src = previewUrl;
                btn.appendChild(img);
            }

            this.windowStyleGrid.appendChild(btn);
        }
    }

    _renderStreetWindowStyleOptions() {
        if (!this.streetWindowStyleGrid) return;
        this.streetWindowStyleGrid.textContent = '';

        for (const styleOpt of this._windowStyleOptions ?? []) {
            const id = typeof styleOpt?.id === 'string' ? styleOpt.id : '';
            if (!id) continue;
            const label = typeof styleOpt?.label === 'string' ? styleOpt.label : id;
            const previewUrl = typeof styleOpt?.previewUrl === 'string' ? styleOpt.previewUrl : '';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab-texture-option';
            btn.dataset.styleId = id;
            btn.title = label;
            btn.setAttribute('aria-label', label);

            if (!previewUrl) {
                const placeholder = document.createElement('div');
                placeholder.className = 'building-fab-texture-default';
                placeholder.textContent = label;
                btn.appendChild(placeholder);
            } else {
                const img = document.createElement('img');
                img.className = 'building-fab-texture-img';
                img.alt = label;
                img.loading = 'lazy';
                img.src = previewUrl;
                btn.appendChild(img);
            }

            this.streetWindowStyleGrid.appendChild(btn);
        }
    }

    _renderStreetStyleOptions() {
        if (!this.streetStyleGrid) return;
        this.streetStyleGrid.textContent = '';

        for (const styleOpt of this._buildingStyleOptions ?? []) {
            const id = typeof styleOpt?.id === 'string' ? styleOpt.id : '';
            if (!id) continue;
            const label = typeof styleOpt?.label === 'string' ? styleOpt.label : id;
            const wallTextureUrl = typeof styleOpt?.wallTextureUrl === 'string' ? styleOpt.wallTextureUrl : '';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab-texture-option';
            btn.dataset.styleId = id;
            btn.title = label;
            btn.setAttribute('aria-label', label);

            if (!wallTextureUrl) {
                const placeholder = document.createElement('div');
                placeholder.className = 'building-fab-texture-default';
                placeholder.textContent = label;
                btn.appendChild(placeholder);
            } else {
                const img = document.createElement('img');
                img.className = 'building-fab-texture-img';
                img.alt = label;
                img.loading = 'lazy';
                img.src = wallTextureUrl;
                btn.appendChild(img);
            }

            this.streetStyleGrid.appendChild(btn);
        }
    }

    _renderBuildingStyleOptions() {
        if (!this.styleGrid) return;
        this.styleGrid.textContent = '';

        for (const styleOpt of this._buildingStyleOptions ?? []) {
            const id = typeof styleOpt?.id === 'string' ? styleOpt.id : '';
            if (!id) continue;
            const label = typeof styleOpt?.label === 'string' ? styleOpt.label : id;
            const wallTextureUrl = typeof styleOpt?.wallTextureUrl === 'string' ? styleOpt.wallTextureUrl : '';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-fab-texture-option';
            btn.dataset.styleId = id;
            btn.title = label;
            btn.setAttribute('aria-label', label);

            if (!wallTextureUrl) {
                const placeholder = document.createElement('div');
                placeholder.className = 'building-fab-texture-default';
                placeholder.textContent = label;
                btn.appendChild(placeholder);
            } else {
                const img = document.createElement('img');
                img.className = 'building-fab-texture-img';
                img.alt = label;
                img.loading = 'lazy';
                img.src = wallTextureUrl;
                btn.appendChild(img);
            }

            this.styleGrid.appendChild(btn);
        }
    }

    _syncBuildingStyleButtons({ allow } = {}) {
        const enabled = !!allow;
        const selected = this._buildingStyle || BUILDING_STYLE.DEFAULT;
        const found = (this._buildingStyleOptions ?? []).find((opt) => opt?.id === selected) ?? null;
        const label = found?.label ?? selected;
        const url = typeof found?.wallTextureUrl === 'string' ? found.wallTextureUrl : '';

        if (this.stylePickButton) this.stylePickButton.disabled = !enabled;
        if (this.stylePickText) this.stylePickText.textContent = label;
        setMaterialThumbToTexture(this.stylePickThumb, url, label);
        this.styleStatus.textContent = enabled ? '' : 'Select a building to change style.';
    }

    _openBuildingStylePicker() {
        if (this.stylePickButton?.disabled) return;
        const options = (this._buildingStyleOptions ?? []).map((opt) => ({
            id: opt.id,
            label: opt.label,
            kind: 'texture',
            previewUrl: opt.wallTextureUrl
        }));
        this._pickerPopup.open({
            title: 'Building style',
            sections: [{ label: 'Textures', options }],
            selectedId: this._buildingStyle || BUILDING_STYLE.DEFAULT,
            onSelect: (opt) => this._setBuildingStyleFromUi(opt.id)
        });
    }

    _syncWindowStyleButtons({ allow } = {}) {
        const enabled = !!allow;
        const selected = this._windowTypeId || WINDOW_TYPE.STYLE_DEFAULT;
        const found = (this._windowTypeOptions ?? []).find((opt) => opt?.id === selected) ?? null;
        const label = found?.label ?? selected;
        const url = typeof found?.previewUrl === 'string' ? found.previewUrl : '';

        if (this.windowStylePickButton) this.windowStylePickButton.disabled = !enabled;
        if (this.windowStylePickText) this.windowStylePickText.textContent = label;
        setMaterialThumbToTexture(this.windowStylePickThumb, url, label);
        this.windowStyleStatus.textContent = enabled ? '' : 'Select a building to change windows.';
    }

    _openWindowTypePicker() {
        if (this.windowStylePickButton?.disabled) return;
        const options = (this._windowTypeOptions ?? []).map((opt) => ({
            id: opt.id,
            label: opt.label,
            kind: 'texture',
            previewUrl: opt.previewUrl
        }));
        this._pickerPopup.open({
            title: 'Window type',
            sections: [{ label: 'Types', options }],
            selectedId: this._windowTypeId || WINDOW_TYPE.STYLE_DEFAULT,
            onSelect: (opt) => this._setWindowStyleFromUi(opt.id)
        });
    }

    _syncStreetStyleButtons({ allow } = {}) {
        const enabled = !!allow;
        const selected = this._streetStyle || BUILDING_STYLE.DEFAULT;
        const found = (this._buildingStyleOptions ?? []).find((opt) => opt?.id === selected) ?? null;
        const label = found?.label ?? selected;
        const url = typeof found?.wallTextureUrl === 'string' ? found.wallTextureUrl : '';

        if (this.streetStylePickButton) this.streetStylePickButton.disabled = !enabled;
        if (this.streetStylePickText) this.streetStylePickText.textContent = label;
        setMaterialThumbToTexture(this.streetStylePickThumb, url, label);
        this.streetStyleStatus.textContent = enabled ? '' : 'Select a building and enable street floors.';
    }

    _openStreetStylePicker() {
        if (this.streetStylePickButton?.disabled) return;
        const options = (this._buildingStyleOptions ?? []).map((opt) => ({
            id: opt.id,
            label: opt.label,
            kind: 'texture',
            previewUrl: opt.wallTextureUrl
        }));
        this._pickerPopup.open({
            title: 'Street style',
            sections: [{ label: 'Textures', options }],
            selectedId: this._streetStyle || BUILDING_STYLE.DEFAULT,
            onSelect: (opt) => this._setStreetStyleFromUi(opt.id)
        });
    }

    _syncStreetWindowStyleButtons({ allow } = {}) {
        const enabled = !!allow;
        const selected = this._streetWindowTypeId || WINDOW_TYPE.STYLE_DEFAULT;
        const found = (this._windowTypeOptions ?? []).find((opt) => opt?.id === selected) ?? null;
        const label = found?.label ?? selected;
        const url = typeof found?.previewUrl === 'string' ? found.previewUrl : '';

        if (this.streetWindowStylePickButton) this.streetWindowStylePickButton.disabled = !enabled;
        if (this.streetWindowStylePickText) this.streetWindowStylePickText.textContent = label;
        setMaterialThumbToTexture(this.streetWindowStylePickThumb, url, label);
        this.streetWindowStyleStatus.textContent = enabled ? '' : 'Select a building and enable street floors.';
    }

    _openStreetWindowTypePicker() {
        if (this.streetWindowStylePickButton?.disabled) return;
        const options = (this._windowTypeOptions ?? []).map((opt) => ({
            id: opt.id,
            label: opt.label,
            kind: 'texture',
            previewUrl: opt.previewUrl
        }));
        this._pickerPopup.open({
            title: 'Street window type',
            sections: [{ label: 'Types', options }],
            selectedId: this._streetWindowTypeId || WINDOW_TYPE.STYLE_DEFAULT,
            onSelect: (opt) => this._setStreetWindowStyleFromUi(opt.id)
        });
    }

    _handleBuildingStyleGridClick(e) {
        const btn = e?.target?.closest?.('.building-fab-texture-option');
        if (!btn || !this.styleGrid?.contains(btn)) return;
        if (btn.disabled) return;
        const raw = btn.dataset?.styleId ?? '';
        this._setBuildingStyleFromUi(raw);
    }

    _handleWindowStyleGridClick(e) {
        const btn = e?.target?.closest?.('.building-fab-texture-option');
        if (!btn || !this.windowStyleGrid?.contains(btn)) return;
        if (btn.disabled) return;
        const raw = btn.dataset?.styleId ?? '';
        this._setWindowStyleFromUi(raw);
    }

    _handleStreetStyleGridClick(e) {
        const btn = e?.target?.closest?.('.building-fab-texture-option');
        if (!btn || !this.streetStyleGrid?.contains(btn)) return;
        if (btn.disabled) return;
        const raw = btn.dataset?.styleId ?? '';
        this._setStreetStyleFromUi(raw);
    }

    _handleStreetWindowStyleGridClick(e) {
        const btn = e?.target?.closest?.('.building-fab-texture-option');
        if (!btn || !this.streetWindowStyleGrid?.contains(btn)) return;
        if (btn.disabled) return;
        const raw = btn.dataset?.styleId ?? '';
        this._setStreetWindowStyleFromUi(raw);
    }

    _setRoadModeFromUi(enabled) {
        const next = !!enabled;
        if (next === this._roadModeEnabled) return;
        this._roadModeEnabled = next;
        if (next) this.setBuildingModeEnabled(false);
        this._roadStartTileId = null;
        this._syncHint();
        this.onRoadModeChange?.(next);
    }

    _toggleRoadModeFromUi() {
        this._setRoadModeFromUi(!this._roadModeEnabled);
        this.addRoadBtn.classList.toggle('is-active', this._roadModeEnabled);
    }

    _setBuildingModeFromUi(enabled) {
        const next = !!enabled;
        if (next === this._buildingModeEnabled) return;
        if (next) this.setRoadModeEnabled(false);
        this._buildingModeEnabled = next;
        this.startBuildingBtn.classList.toggle('is-active', next);
        this.buildBtn.disabled = !next || this._selectedTileCount <= 0;
        this.clearSelBtn.disabled = !next || this._selectedTileCount <= 0;
        this._syncHint();
        this.onBuildingModeChange?.(next);
    }

    _toggleBuildingModeFromUi() {
        this._setBuildingModeFromUi(!this._buildingModeEnabled);
    }

    _cancelActiveModeFromUi() {
        if (this._buildingModeEnabled) {
            this._setBuildingModeFromUi(false);
            return;
        }

        if (this._roadModeEnabled) {
            if (this.onRoadCancel) {
                this.onRoadCancel();
            } else {
                this._setRoadModeFromUi(false);
            }
        }
    }

    _setViewModeFromUi(mode) {
        const next = (mode === 'wireframe' || mode === 'floors' || mode === 'floorplan' || mode === 'mesh')
            ? mode
            : 'mesh';

        const wireframe = next === 'wireframe';
        const floors = next === 'floors';
        const floorplan = next === 'floorplan';

        const changed = wireframe !== this._wireframeEnabled
            || floors !== this._floorDivisionsEnabled
            || floorplan !== this._floorplanEnabled;
        if (!changed) return;

        this._wireframeEnabled = wireframe;
        this._floorDivisionsEnabled = floors;
        this._floorplanEnabled = floorplan;

        this.onWireframeChange?.(wireframe);
        this.onFloorDivisionsChange?.(floors);
        this.onFloorplanChange?.(floorplan);
        this._syncViewControls();
    }

    _setHideSelectionBorderFromUi(checked) {
        const next = !!checked;
        const changed = next !== this._hideSelectionBorder;
        this._hideSelectionBorder = next;
        this.hideSelectionBorderInput.checked = next;
        if (changed) this.onHideSelectionBorderChange?.(next);
    }

    _syncToast() {
        if (!this.toastPanel || !this.toastText || !this.toastTitle || !this.cancelModeBtn) return;

        const show = this._roadModeEnabled || this._buildingModeEnabled;
        this.toastPanel.classList.toggle('hidden', !show);
        if (!show) return;

        if (this._roadModeEnabled) {
            this.toastTitle.textContent = 'Create Road';
            this.cancelModeBtn.textContent = 'Cancel segment';

            const start = this._roadStartTileId;
            this.toastText.textContent = start
                ? `Select end tile (start: ${start}).`
                : 'Select start tile.';

            this.clearSelBtn?.classList.add('hidden');
            this.buildBtn?.classList.add('hidden');
            this.roadDoneBtn?.classList.remove('hidden');
            if (this.cancelModeBtn) this.cancelModeBtn.disabled = !this._enabled || !start;
            return;
        }

        if (this._buildingModeEnabled) {
            this.toastTitle.textContent = 'Create Building';
            this.cancelModeBtn.textContent = 'Cancel building';
            if (this.cancelModeBtn) this.cancelModeBtn.disabled = !this._enabled;

            const count = Number.isFinite(this._selectedTileCount) ? this._selectedTileCount : 0;
            this.toastText.textContent = count > 0
                ? `Select tiles (click to add/remove). Selected: ${count}.`
                : 'Select tiles (click to add/remove).';

            this.clearSelBtn?.classList.remove('hidden');
            this.buildBtn?.classList.remove('hidden');
            this.roadDoneBtn?.classList.add('hidden');
            if (this.buildBtn) this.buildBtn.disabled = count <= 0;
            if (this.clearSelBtn) this.clearSelBtn.disabled = count <= 0;
        }
    }

    _syncHint() {
        if (this._roadModeEnabled || this._buildingModeEnabled) {
            this.hint.textContent = 'Follow the popup steps at the bottom of the screen.';
        } else if (this._selectedBuildingId) {
            this.hint.textContent = 'Select an existing building, or create a new one.';
        } else {
            this.hint.textContent = 'Create a road or building, then select it to edit properties.';
        }

        this._syncCreatePanelControls();
        this._syncViewControls();
        this._syncToast();
    }

    _syncCreatePanelControls() {
        if (!this.panel) return;
        const creating = this._roadModeEnabled || this._buildingModeEnabled;
        const allow = this._enabled && !creating;
        const disable = !allow;

        this.addRoadBtn.disabled = disable;
        this.startBuildingBtn.disabled = disable;

        this.panel.classList.toggle('is-disabled', !this._enabled || creating);
    }

    _syncViewControls() {
        if (!this.viewPanel) return;

        const creating = this._roadModeEnabled || this._buildingModeEnabled;
        const allowReset = this._enabled && !creating;
        const disableView = !this._enabled;

        for (const btn of this._viewModeButtons ?? []) {
            if (!btn) continue;
            btn.disabled = disableView;
        }
        if (this.hideSelectionBorderInput) this.hideSelectionBorderInput.disabled = disableView;
        this.resetBtn.disabled = !allowReset;

        this._syncViewModeButtons();
        this.viewPanel.classList.toggle('is-disabled', disableView);
        if (disableView) this._closeResetDialog();
    }

    _openResetDialog() {
        if (!this.resetOverlay || !this.resetGridNumber) return;
        if (!this._enabled) return;
        const creating = this._roadModeEnabled || this._buildingModeEnabled;
        if (creating) return;

        this.resetGridNumber.value = String(this._gridSize);
        this.resetOverlay.classList.remove('hidden');
        this.resetGridNumber.focus();
        this.resetGridNumber.select?.();
    }

    _closeResetDialog() {
        if (!this.resetOverlay) return;
        this.resetOverlay.classList.add('hidden');
    }

    _confirmResetDialog() {
        if (!this.resetGridNumber) return;
        const next = clampInt(this.resetGridNumber.value, this.gridMin, this.gridMax);
        this._gridSize = next;
        this._closeResetDialog();
        this.onReset?.(next);
    }

    isResetDialogOpen() {
        return !!this.resetOverlay && !this.resetOverlay.classList.contains('hidden');
    }

    closeResetDialog() {
        this._closeResetDialog();
    }

    _bind() {
        if (this._bound) return;
        this._bound = true;

        this.floorRange.addEventListener('input', this._onFloorRangeInput);
        this.floorNumber.addEventListener('input', this._onFloorNumberInput);
        this.floorHeightRange.addEventListener('input', this._onFloorHeightRangeInput);
        this.floorHeightNumber.addEventListener('input', this._onFloorHeightNumberInput);
        this.wallInsetRange.addEventListener('input', this._onWallInsetRangeInput);
        this.wallInsetNumber.addEventListener('input', this._onWallInsetNumberInput);
        this.streetEnabledInput.addEventListener('change', this._onStreetEnabledChange);
        this.streetFloorsRange.addEventListener('input', this._onStreetFloorsRangeInput);
        this.streetFloorsNumber.addEventListener('input', this._onStreetFloorsNumberInput);
        this.streetHeightRange.addEventListener('input', this._onStreetHeightRangeInput);
        this.streetHeightNumber.addEventListener('input', this._onStreetHeightNumberInput);
        this.streetStylePickButton.addEventListener('click', this._onStreetStylePickClick);
        this.beltCourseInput.addEventListener('change', this._onBeltCourseEnabledChange);
        this.beltMarginRange.addEventListener('input', this._onBeltMarginRangeInput);
        this.beltMarginNumber.addEventListener('input', this._onBeltMarginNumberInput);
        this.beltHeightRange.addEventListener('input', this._onBeltHeightRangeInput);
        this.beltHeightNumber.addEventListener('input', this._onBeltHeightNumberInput);
        this.beltColorPickButton.addEventListener('click', this._onBeltColorPickClick);
        this.topBeltInput.addEventListener('change', this._onTopBeltEnabledChange);
        this.topBeltColorPickButton.addEventListener('click', this._onTopBeltColorPickClick);
        this.topBeltWidthRange.addEventListener('input', this._onTopBeltWidthRangeInput);
        this.topBeltWidthNumber.addEventListener('input', this._onTopBeltWidthNumberInput);
        this.topBeltInnerWidthRange.addEventListener('input', this._onTopBeltInnerWidthRangeInput);
        this.topBeltInnerWidthNumber.addEventListener('input', this._onTopBeltInnerWidthNumberInput);
        this.topBeltHeightRange.addEventListener('input', this._onTopBeltHeightRangeInput);
        this.topBeltHeightNumber.addEventListener('input', this._onTopBeltHeightNumberInput);
        this.roofColorPickButton.addEventListener('click', this._onRoofColorPickClick);
        this.windowStylePickButton.addEventListener('click', this._onWindowStylePickClick);
        this.windowWidthRange.addEventListener('input', this._onWindowWidthRangeInput);
        this.windowWidthNumber.addEventListener('input', this._onWindowWidthNumberInput);
        this.windowGapRange.addEventListener('input', this._onWindowGapRangeInput);
        this.windowGapNumber.addEventListener('input', this._onWindowGapNumberInput);
        this.windowHeightRange.addEventListener('input', this._onWindowHeightRangeInput);
        this.windowHeightNumber.addEventListener('input', this._onWindowHeightNumberInput);
        this.windowYRange.addEventListener('input', this._onWindowYRangeInput);
        this.windowYNumber.addEventListener('input', this._onWindowYNumberInput);
        this.windowFrameWidthRange.addEventListener('input', this._onWindowFrameWidthRangeInput);
        this.windowFrameWidthNumber.addEventListener('input', this._onWindowFrameWidthNumberInput);
        this.windowFrameColorPickButton.addEventListener('click', this._onWindowFrameColorPickClick);
        this.windowGlassTopPickButton.addEventListener('click', this._onWindowGlassTopPickClick);
        this.windowGlassBottomPickButton.addEventListener('click', this._onWindowGlassBottomPickClick);
        this.windowSpacerInput.addEventListener('change', this._onWindowSpacerEnabledChange);
        this.windowSpacerEveryRange.addEventListener('input', this._onWindowSpacerEveryRangeInput);
        this.windowSpacerEveryNumber.addEventListener('input', this._onWindowSpacerEveryNumberInput);
        this.windowSpacerWidthRange.addEventListener('input', this._onWindowSpacerWidthRangeInput);
        this.windowSpacerWidthNumber.addEventListener('input', this._onWindowSpacerWidthNumberInput);
        this.windowSpacerExtrudeInput.addEventListener('change', this._onWindowSpacerExtrudeChange);
        this.windowSpacerExtrudeDistanceRange.addEventListener('input', this._onWindowSpacerExtrudeDistanceRangeInput);
        this.windowSpacerExtrudeDistanceNumber.addEventListener('input', this._onWindowSpacerExtrudeDistanceNumberInput);
        this.streetWindowStylePickButton.addEventListener('click', this._onStreetWindowStylePickClick);
        this.streetWindowWidthRange.addEventListener('input', this._onStreetWindowWidthRangeInput);
        this.streetWindowWidthNumber.addEventListener('input', this._onStreetWindowWidthNumberInput);
        this.streetWindowGapRange.addEventListener('input', this._onStreetWindowGapRangeInput);
        this.streetWindowGapNumber.addEventListener('input', this._onStreetWindowGapNumberInput);
        this.streetWindowHeightRange.addEventListener('input', this._onStreetWindowHeightRangeInput);
        this.streetWindowHeightNumber.addEventListener('input', this._onStreetWindowHeightNumberInput);
        this.streetWindowYRange.addEventListener('input', this._onStreetWindowYRangeInput);
        this.streetWindowYNumber.addEventListener('input', this._onStreetWindowYNumberInput);
        this.streetWindowFrameWidthRange.addEventListener('input', this._onStreetWindowFrameWidthRangeInput);
        this.streetWindowFrameWidthNumber.addEventListener('input', this._onStreetWindowFrameWidthNumberInput);
        this.streetWindowFrameColorPickButton.addEventListener('click', this._onStreetWindowFrameColorPickClick);
        this.streetWindowGlassTopPickButton.addEventListener('click', this._onStreetWindowGlassTopPickClick);
        this.streetWindowGlassBottomPickButton.addEventListener('click', this._onStreetWindowGlassBottomPickClick);
        this.streetWindowSpacerInput.addEventListener('change', this._onStreetWindowSpacerEnabledChange);
        this.streetWindowSpacerEveryRange.addEventListener('input', this._onStreetWindowSpacerEveryRangeInput);
        this.streetWindowSpacerEveryNumber.addEventListener('input', this._onStreetWindowSpacerEveryNumberInput);
        this.streetWindowSpacerWidthRange.addEventListener('input', this._onStreetWindowSpacerWidthRangeInput);
        this.streetWindowSpacerWidthNumber.addEventListener('input', this._onStreetWindowSpacerWidthNumberInput);
        this.streetWindowSpacerExtrudeInput.addEventListener('change', this._onStreetWindowSpacerExtrudeChange);
        this.streetWindowSpacerExtrudeDistanceRange.addEventListener('input', this._onStreetWindowSpacerExtrudeDistanceRangeInput);
        this.streetWindowSpacerExtrudeDistanceNumber.addEventListener('input', this._onStreetWindowSpacerExtrudeDistanceNumberInput);
        this.typeSelect.addEventListener('change', this._onTypeSelectChange);
        this.loadCatalogSelect.addEventListener('change', this._onLoadCatalogSelectChange);
        this.loadCatalogBtn.addEventListener('click', this._onLoadCatalogBtnClick);
        this.stylePickButton.addEventListener('click', this._onStylePickClick);
        this.materialVariationSeedToggleInput.addEventListener('change', this._onMaterialVariationSeedOverrideChange);
        this.materialVariationSeedNumber.addEventListener('change', this._onMaterialVariationSeedNumberChange);
        this.materialVariationDebugResetBtn.addEventListener('click', this._onMaterialVariationDebugReset);
        this.materialVariationDebugUseMatVarInput.addEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugUvStairInput.addEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugUvAntiOffsetInput.addEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugUvAntiRotationInput.addEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugUvWarpInput.addEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugContribRoughnessInput.addEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugContribColorInput.addEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugUseOrmInput.addEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugContribNormalFactorInput.addEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugBasisOriginalUvInput.addEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugFlipNormalYInput.addEventListener('change', this._onMaterialVariationDebugChange);
        this.hideSelectionBorderInput.addEventListener('change', this._onHideSelectionBorderChange);
        this.viewModeRow.addEventListener('click', this._onViewModeClick);
        this.addRoadBtn.addEventListener('click', this._onAddRoad);
        this.startBuildingBtn.addEventListener('click', this._onStartBuilding);
        this.cancelModeBtn.addEventListener('click', this._onCancelMode);
        this.buildBtn.addEventListener('click', this._onBuild);
        this.clearSelBtn.addEventListener('click', this._onClearSelection);
        this.deleteBuildingBtn.addEventListener('click', this._onDeleteSelectedBuilding);
        this.exportBuildingBtn.addEventListener('click', this._onExportBuildingConfig);
        this.resetBtn.addEventListener('click', this._onReset);
        this.roadDoneBtn.addEventListener('click', this._onRoadDone);
        this.resetOverlay.addEventListener('click', this._onResetOverlayClick);
        this.resetCancelBtn.addEventListener('click', this._onResetCancel);
        this.resetConfirmBtn.addEventListener('click', this._onResetConfirm);
        this.resetGridNumber.addEventListener('keydown', this._onResetGridKeyDown);
    }

    _unbind() {
        if (!this._bound) return;
        this._bound = false;

        this.floorRange.removeEventListener('input', this._onFloorRangeInput);
        this.floorNumber.removeEventListener('input', this._onFloorNumberInput);
        this.floorHeightRange.removeEventListener('input', this._onFloorHeightRangeInput);
        this.floorHeightNumber.removeEventListener('input', this._onFloorHeightNumberInput);
        this.wallInsetRange.removeEventListener('input', this._onWallInsetRangeInput);
        this.wallInsetNumber.removeEventListener('input', this._onWallInsetNumberInput);
        this.streetEnabledInput.removeEventListener('change', this._onStreetEnabledChange);
        this.streetFloorsRange.removeEventListener('input', this._onStreetFloorsRangeInput);
        this.streetFloorsNumber.removeEventListener('input', this._onStreetFloorsNumberInput);
        this.streetHeightRange.removeEventListener('input', this._onStreetHeightRangeInput);
        this.streetHeightNumber.removeEventListener('input', this._onStreetHeightNumberInput);
        this.streetStylePickButton.removeEventListener('click', this._onStreetStylePickClick);
        this.beltCourseInput.removeEventListener('change', this._onBeltCourseEnabledChange);
        this.beltMarginRange.removeEventListener('input', this._onBeltMarginRangeInput);
        this.beltMarginNumber.removeEventListener('input', this._onBeltMarginNumberInput);
        this.beltHeightRange.removeEventListener('input', this._onBeltHeightRangeInput);
        this.beltHeightNumber.removeEventListener('input', this._onBeltHeightNumberInput);
        this.beltColorPickButton.removeEventListener('click', this._onBeltColorPickClick);
        this.topBeltInput.removeEventListener('change', this._onTopBeltEnabledChange);
        this.topBeltColorPickButton.removeEventListener('click', this._onTopBeltColorPickClick);
        this.topBeltWidthRange.removeEventListener('input', this._onTopBeltWidthRangeInput);
        this.topBeltWidthNumber.removeEventListener('input', this._onTopBeltWidthNumberInput);
        this.topBeltInnerWidthRange.removeEventListener('input', this._onTopBeltInnerWidthRangeInput);
        this.topBeltInnerWidthNumber.removeEventListener('input', this._onTopBeltInnerWidthNumberInput);
        this.topBeltHeightRange.removeEventListener('input', this._onTopBeltHeightRangeInput);
        this.topBeltHeightNumber.removeEventListener('input', this._onTopBeltHeightNumberInput);
        this.roofColorPickButton.removeEventListener('click', this._onRoofColorPickClick);
        this.windowStylePickButton.removeEventListener('click', this._onWindowStylePickClick);
        this.windowWidthRange.removeEventListener('input', this._onWindowWidthRangeInput);
        this.windowWidthNumber.removeEventListener('input', this._onWindowWidthNumberInput);
        this.windowGapRange.removeEventListener('input', this._onWindowGapRangeInput);
        this.windowGapNumber.removeEventListener('input', this._onWindowGapNumberInput);
        this.windowHeightRange.removeEventListener('input', this._onWindowHeightRangeInput);
        this.windowHeightNumber.removeEventListener('input', this._onWindowHeightNumberInput);
        this.windowYRange.removeEventListener('input', this._onWindowYRangeInput);
        this.windowYNumber.removeEventListener('input', this._onWindowYNumberInput);
        this.windowFrameWidthRange.removeEventListener('input', this._onWindowFrameWidthRangeInput);
        this.windowFrameWidthNumber.removeEventListener('input', this._onWindowFrameWidthNumberInput);
        this.windowFrameColorPickButton.removeEventListener('click', this._onWindowFrameColorPickClick);
        this.windowGlassTopPickButton.removeEventListener('click', this._onWindowGlassTopPickClick);
        this.windowGlassBottomPickButton.removeEventListener('click', this._onWindowGlassBottomPickClick);
        this.windowSpacerInput.removeEventListener('change', this._onWindowSpacerEnabledChange);
        this.windowSpacerEveryRange.removeEventListener('input', this._onWindowSpacerEveryRangeInput);
        this.windowSpacerEveryNumber.removeEventListener('input', this._onWindowSpacerEveryNumberInput);
        this.windowSpacerWidthRange.removeEventListener('input', this._onWindowSpacerWidthRangeInput);
        this.windowSpacerWidthNumber.removeEventListener('input', this._onWindowSpacerWidthNumberInput);
        this.windowSpacerExtrudeInput.removeEventListener('change', this._onWindowSpacerExtrudeChange);
        this.windowSpacerExtrudeDistanceRange.removeEventListener('input', this._onWindowSpacerExtrudeDistanceRangeInput);
        this.windowSpacerExtrudeDistanceNumber.removeEventListener('input', this._onWindowSpacerExtrudeDistanceNumberInput);
        this.streetWindowStylePickButton.removeEventListener('click', this._onStreetWindowStylePickClick);
        this.streetWindowWidthRange.removeEventListener('input', this._onStreetWindowWidthRangeInput);
        this.streetWindowWidthNumber.removeEventListener('input', this._onStreetWindowWidthNumberInput);
        this.streetWindowGapRange.removeEventListener('input', this._onStreetWindowGapRangeInput);
        this.streetWindowGapNumber.removeEventListener('input', this._onStreetWindowGapNumberInput);
        this.streetWindowHeightRange.removeEventListener('input', this._onStreetWindowHeightRangeInput);
        this.streetWindowHeightNumber.removeEventListener('input', this._onStreetWindowHeightNumberInput);
        this.streetWindowYRange.removeEventListener('input', this._onStreetWindowYRangeInput);
        this.streetWindowYNumber.removeEventListener('input', this._onStreetWindowYNumberInput);
        this.streetWindowFrameWidthRange.removeEventListener('input', this._onStreetWindowFrameWidthRangeInput);
        this.streetWindowFrameWidthNumber.removeEventListener('input', this._onStreetWindowFrameWidthNumberInput);
        this.streetWindowFrameColorPickButton.removeEventListener('click', this._onStreetWindowFrameColorPickClick);
        this.streetWindowGlassTopPickButton.removeEventListener('click', this._onStreetWindowGlassTopPickClick);
        this.streetWindowGlassBottomPickButton.removeEventListener('click', this._onStreetWindowGlassBottomPickClick);
        this.streetWindowSpacerInput.removeEventListener('change', this._onStreetWindowSpacerEnabledChange);
        this.streetWindowSpacerEveryRange.removeEventListener('input', this._onStreetWindowSpacerEveryRangeInput);
        this.streetWindowSpacerEveryNumber.removeEventListener('input', this._onStreetWindowSpacerEveryNumberInput);
        this.streetWindowSpacerWidthRange.removeEventListener('input', this._onStreetWindowSpacerWidthRangeInput);
        this.streetWindowSpacerWidthNumber.removeEventListener('input', this._onStreetWindowSpacerWidthNumberInput);
        this.streetWindowSpacerExtrudeInput.removeEventListener('change', this._onStreetWindowSpacerExtrudeChange);
        this.streetWindowSpacerExtrudeDistanceRange.removeEventListener('input', this._onStreetWindowSpacerExtrudeDistanceRangeInput);
        this.streetWindowSpacerExtrudeDistanceNumber.removeEventListener('input', this._onStreetWindowSpacerExtrudeDistanceNumberInput);
        this.typeSelect.removeEventListener('change', this._onTypeSelectChange);
        this.loadCatalogSelect.removeEventListener('change', this._onLoadCatalogSelectChange);
        this.loadCatalogBtn.removeEventListener('click', this._onLoadCatalogBtnClick);
        this.stylePickButton.removeEventListener('click', this._onStylePickClick);
        this.materialVariationSeedToggleInput.removeEventListener('change', this._onMaterialVariationSeedOverrideChange);
        this.materialVariationSeedNumber.removeEventListener('change', this._onMaterialVariationSeedNumberChange);
        this.materialVariationDebugResetBtn.removeEventListener('click', this._onMaterialVariationDebugReset);
        this.materialVariationDebugUseMatVarInput.removeEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugUvStairInput.removeEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugUvAntiOffsetInput.removeEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugUvAntiRotationInput.removeEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugUvWarpInput.removeEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugContribRoughnessInput.removeEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugContribColorInput.removeEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugUseOrmInput.removeEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugContribNormalFactorInput.removeEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugBasisOriginalUvInput.removeEventListener('change', this._onMaterialVariationDebugChange);
        this.materialVariationDebugFlipNormalYInput.removeEventListener('change', this._onMaterialVariationDebugChange);
        this.hideSelectionBorderInput.removeEventListener('change', this._onHideSelectionBorderChange);
        this.viewModeRow.removeEventListener('click', this._onViewModeClick);
        this.addRoadBtn.removeEventListener('click', this._onAddRoad);
        this.startBuildingBtn.removeEventListener('click', this._onStartBuilding);
        this.cancelModeBtn.removeEventListener('click', this._onCancelMode);
        this.buildBtn.removeEventListener('click', this._onBuild);
        this.clearSelBtn.removeEventListener('click', this._onClearSelection);
        this.deleteBuildingBtn.removeEventListener('click', this._onDeleteSelectedBuilding);
        this.exportBuildingBtn.removeEventListener('click', this._onExportBuildingConfig);
        this.resetBtn.removeEventListener('click', this._onReset);
        this.roadDoneBtn.removeEventListener('click', this._onRoadDone);
        this.resetOverlay.removeEventListener('click', this._onResetOverlayClick);
        this.resetCancelBtn.removeEventListener('click', this._onResetCancel);
        this.resetConfirmBtn.removeEventListener('click', this._onResetConfirm);
        this.resetGridNumber.removeEventListener('keydown', this._onResetGridKeyDown);
    }
}
