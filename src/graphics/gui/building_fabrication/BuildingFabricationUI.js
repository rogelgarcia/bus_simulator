// src/graphics/gui/building_fabrication/BuildingFabricationUI.js
// Builds the HUD controls for the building fabrication scene.
import { getBuildingStyleOptions } from '../../assets3d/generators/buildings/BuildingGenerator.js';
import { BUILDING_STYLE, isBuildingStyle } from '../../../app/buildings/BuildingStyle.js';
import { WINDOW_STYLE, isWindowStyle } from '../../../app/buildings/WindowStyle.js';
import { BELT_COURSE_COLOR, getBeltCourseColorOptions, isBeltCourseColor } from '../../../app/buildings/BeltCourseColor.js';
import { ROOF_COLOR, getRoofColorOptions, isRoofColor } from '../../../app/buildings/RoofColor.js';
import { PickerPopup } from '../shared/PickerPopup.js';
import { WINDOW_TYPE, getDefaultWindowParams, getWindowTypeOptions, isWindowTypeId } from '../../assets3d/generators/buildings/WindowTextureGenerator.js';
import { normalizeWindowParams, normalizeWindowTypeIdOrLegacyStyle } from '../../assets3d/generators/buildings/WindowTypeCompatibility.js';
import { getPbrMaterialOptionsForBuildings } from '../../assets3d/materials/PbrMaterialCatalog.js';
import { MATERIAL_VARIATION_ROOT, normalizeMaterialVariationConfig } from '../../assets3d/materials/MaterialVariationSystem.js';
import { LAYER_TYPE, cloneBuildingLayers, createDefaultFloorLayer, createDefaultRoofLayer, normalizeBuildingLayers } from '../../assets3d/generators/building_fabrication/BuildingFabricationTypes.js';
import { getBuildingConfigs } from '../../content3d/catalogs/BuildingConfigCatalog.js';

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
        this._catalogBuildingConfigId = '';
        this.onSelectedBuildingLayersChange = null;
        this.onSelectedBuildingMaterialVariationSeedChange = null;

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

        this.layersList = document.createElement('div');
        this.layersList.className = 'building-fab-layer-list';

        this.propsPanel.appendChild(this.layersStatus);
        this.propsPanel.appendChild(this.materialVariationSeedSection.details);
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
            return { row, range, number };
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
            return { toggle, input };
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

                const wallTilingGroup = makeDetailsSection('Texture tiling', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:tiling` });
                layer.tiling ??= { enabled: false, tileMeters: 2.0 };
                const tilingToggle = makeToggleRow('Override tile meters');
                tilingToggle.input.checked = !!layer?.tiling?.enabled;
                tilingToggle.input.disabled = !allow;
                wallTilingGroup.body.appendChild(tilingToggle.toggle);

                const tileMetersRow = makeRangeRow('Tile meters');
                tileMetersRow.range.min = '0.25';
                tileMetersRow.range.max = '20';
                tileMetersRow.range.step = '0.25';
                tileMetersRow.number.min = '0.25';
                tileMetersRow.number.max = '20';
                tileMetersRow.number.step = '0.25';
                tileMetersRow.range.value = String(layer?.tiling?.tileMeters ?? 2.0);
                tileMetersRow.number.value = formatFloat(layer?.tiling?.tileMeters ?? 2.0, 2);
                tileMetersRow.range.disabled = !allow || !layer?.tiling?.enabled;
                tileMetersRow.number.disabled = tileMetersRow.range.disabled;
                tilingToggle.input.addEventListener('change', () => {
                    layer.tiling.enabled = !!tilingToggle.input.checked;
                    tileMetersRow.range.disabled = !allow || !layer.tiling.enabled;
                    tileMetersRow.number.disabled = tileMetersRow.range.disabled;
                    this._notifySelectedLayersChanged();
                });
                tileMetersRow.range.addEventListener('input', () => {
                    const next = clamp(tileMetersRow.range.value, 0.25, 20.0);
                    layer.tiling.tileMeters = next;
                    tileMetersRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                tileMetersRow.number.addEventListener('change', () => {
                    const next = clamp(tileMetersRow.number.value, 0.25, 20.0);
                    layer.tiling.tileMeters = next;
                    tileMetersRow.range.value = String(next);
                    tileMetersRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                wallTilingGroup.body.appendChild(tileMetersRow.row);

                const tilingHint = document.createElement('div');
                tilingHint.className = 'building-fab-hint';
                tilingHint.textContent = 'Overrides the material tile size in meters.';
                wallTilingGroup.body.appendChild(tilingHint);
                wallsGroup.body.appendChild(wallTilingGroup.details);

                const wallMatVarGroup = makeDetailsSection('Material variation', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar` });
                layer.materialVariation ??= { enabled: false, seedOffset: 0 };
                const wallMatVarNormalized = normalizeMaterialVariationConfig(layer.materialVariation, { root: MATERIAL_VARIATION_ROOT.WALL });

                const matVarToggle = makeToggleRow('Enable variation');
                matVarToggle.input.checked = !!wallMatVarNormalized.enabled;
                matVarToggle.input.disabled = !allow;
                wallMatVarGroup.body.appendChild(matVarToggle.toggle);

                const seedOffsetRow = makeRangeRow('Seed offset');
                seedOffsetRow.range.min = '-9999';
                seedOffsetRow.range.max = '9999';
                seedOffsetRow.range.step = '1';
                seedOffsetRow.number.min = '-9999';
                seedOffsetRow.number.max = '9999';
                seedOffsetRow.number.step = '1';
                seedOffsetRow.range.value = String(layer.materialVariation.seedOffset ?? 0);
                seedOffsetRow.number.value = String(layer.materialVariation.seedOffset ?? 0);
                wallMatVarGroup.body.appendChild(seedOffsetRow.row);

                const intensityRow = makeRangeRow('Intensity');
                intensityRow.range.min = '0';
                intensityRow.range.max = '2';
                intensityRow.range.step = '0.01';
                intensityRow.number.min = '0';
                intensityRow.number.max = '2';
                intensityRow.number.step = '0.01';
                intensityRow.range.value = String(wallMatVarNormalized.globalIntensity);
                intensityRow.number.value = formatFloat(wallMatVarNormalized.globalIntensity, 2);
                wallMatVarGroup.body.appendChild(intensityRow.row);

                const scaleRow = makeRangeRow('World scale');
                scaleRow.range.min = '0.05';
                scaleRow.range.max = '1';
                scaleRow.range.step = '0.01';
                scaleRow.number.min = '0.05';
                scaleRow.number.max = '1';
                scaleRow.number.step = '0.01';
                scaleRow.range.value = String(wallMatVarNormalized.worldSpaceScale);
                scaleRow.number.value = formatFloat(wallMatVarNormalized.worldSpaceScale, 2);
                wallMatVarGroup.body.appendChild(scaleRow.row);

                const macroGroup = makeDetailsSection('Macro', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:macro` });
                const macroToggle = makeToggleRow('Enable macro');
                macroToggle.input.checked = !!wallMatVarNormalized.macro.enabled;
                macroToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                macroGroup.body.appendChild(macroToggle.toggle);
                const macroIntensityRow = makeRangeRow('Intensity');
                macroIntensityRow.range.min = '0';
                macroIntensityRow.range.max = '2';
                macroIntensityRow.range.step = '0.01';
                macroIntensityRow.number.min = '0';
                macroIntensityRow.number.max = '2';
                macroIntensityRow.number.step = '0.01';
                macroIntensityRow.range.value = String(wallMatVarNormalized.macro.intensity);
                macroIntensityRow.number.value = formatFloat(wallMatVarNormalized.macro.intensity, 2);
                macroGroup.body.appendChild(macroIntensityRow.row);
                const macroScaleRow = makeRangeRow('Scale');
                macroScaleRow.range.min = '0.05';
                macroScaleRow.range.max = '2';
                macroScaleRow.range.step = '0.01';
                macroScaleRow.number.min = '0.05';
                macroScaleRow.number.max = '2';
                macroScaleRow.number.step = '0.01';
                macroScaleRow.range.value = String(wallMatVarNormalized.macro.scale);
                macroScaleRow.number.value = formatFloat(wallMatVarNormalized.macro.scale, 2);
                macroGroup.body.appendChild(macroScaleRow.row);
                wallMatVarGroup.body.appendChild(macroGroup.details);

                const streaksGroup = makeDetailsSection('Streaks', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:streaks` });
                const streaksToggle = makeToggleRow('Enable streaks');
                streaksToggle.input.checked = !!wallMatVarNormalized.streaks.enabled;
                streaksToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                streaksGroup.body.appendChild(streaksToggle.toggle);
                const streakStrengthRow = makeRangeRow('Strength');
                streakStrengthRow.range.min = '0';
                streakStrengthRow.range.max = '1';
                streakStrengthRow.range.step = '0.01';
                streakStrengthRow.number.min = '0';
                streakStrengthRow.number.max = '1';
                streakStrengthRow.number.step = '0.01';
                streakStrengthRow.range.value = String(wallMatVarNormalized.streaks.strength);
                streakStrengthRow.number.value = formatFloat(wallMatVarNormalized.streaks.strength, 2);
                streaksGroup.body.appendChild(streakStrengthRow.row);
                const streakScaleRow = makeRangeRow('Scale');
                streakScaleRow.range.min = '0.05';
                streakScaleRow.range.max = '5';
                streakScaleRow.range.step = '0.01';
                streakScaleRow.number.min = '0.05';
                streakScaleRow.number.max = '5';
                streakScaleRow.number.step = '0.01';
                streakScaleRow.range.value = String(wallMatVarNormalized.streaks.scale);
                streakScaleRow.number.value = formatFloat(wallMatVarNormalized.streaks.scale, 2);
                streaksGroup.body.appendChild(streakScaleRow.row);
                wallMatVarGroup.body.appendChild(streaksGroup.details);

                const edgeGroup = makeDetailsSection('Edge wear', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:edge` });
                const edgeToggle = makeToggleRow('Enable edge wear');
                edgeToggle.input.checked = !!wallMatVarNormalized.edgeWear.enabled;
                edgeToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                edgeGroup.body.appendChild(edgeToggle.toggle);
                const edgeStrengthRow = makeRangeRow('Strength');
                edgeStrengthRow.range.min = '0';
                edgeStrengthRow.range.max = '1';
                edgeStrengthRow.range.step = '0.01';
                edgeStrengthRow.number.min = '0';
                edgeStrengthRow.number.max = '1';
                edgeStrengthRow.number.step = '0.01';
                edgeStrengthRow.range.value = String(wallMatVarNormalized.edgeWear.strength);
                edgeStrengthRow.number.value = formatFloat(wallMatVarNormalized.edgeWear.strength, 2);
                edgeGroup.body.appendChild(edgeStrengthRow.row);
                wallMatVarGroup.body.appendChild(edgeGroup.details);

                const grimeGroup = makeDetailsSection('Grime', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:grime` });
                const grimeToggle = makeToggleRow('Enable grime');
                grimeToggle.input.checked = !!wallMatVarNormalized.grime.enabled;
                grimeToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                grimeGroup.body.appendChild(grimeToggle.toggle);
                const grimeStrengthRow = makeRangeRow('Strength');
                grimeStrengthRow.range.min = '0';
                grimeStrengthRow.range.max = '1';
                grimeStrengthRow.range.step = '0.01';
                grimeStrengthRow.number.min = '0';
                grimeStrengthRow.number.max = '1';
                grimeStrengthRow.number.step = '0.01';
                grimeStrengthRow.range.value = String(wallMatVarNormalized.grime.strength);
                grimeStrengthRow.number.value = formatFloat(wallMatVarNormalized.grime.strength, 2);
                grimeGroup.body.appendChild(grimeStrengthRow.row);
                wallMatVarGroup.body.appendChild(grimeGroup.details);

                const dustGroup = makeDetailsSection('Dust', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:dust` });
                const dustToggle = makeToggleRow('Enable dust');
                dustToggle.input.checked = !!wallMatVarNormalized.dust.enabled;
                dustToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                dustGroup.body.appendChild(dustToggle.toggle);
                const dustStrengthRow = makeRangeRow('Strength');
                dustStrengthRow.range.min = '0';
                dustStrengthRow.range.max = '1';
                dustStrengthRow.range.step = '0.01';
                dustStrengthRow.number.min = '0';
                dustStrengthRow.number.max = '1';
                dustStrengthRow.number.step = '0.01';
                dustStrengthRow.range.value = String(wallMatVarNormalized.dust.strength);
                dustStrengthRow.number.value = formatFloat(wallMatVarNormalized.dust.strength, 2);
                dustGroup.body.appendChild(dustStrengthRow.row);
                wallMatVarGroup.body.appendChild(dustGroup.details);

                const antiGroup = makeDetailsSection('Anti-tiling', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:anti` });
                const antiToggle = makeToggleRow('Enable anti-tiling');
                antiToggle.input.checked = !!wallMatVarNormalized.antiTiling.enabled;
                antiToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                antiGroup.body.appendChild(antiToggle.toggle);
                const antiStrengthRow = makeRangeRow('Strength');
                antiStrengthRow.range.min = '0';
                antiStrengthRow.range.max = '1';
                antiStrengthRow.range.step = '0.01';
                antiStrengthRow.number.min = '0';
                antiStrengthRow.number.max = '1';
                antiStrengthRow.number.step = '0.01';
                antiStrengthRow.range.value = String(wallMatVarNormalized.antiTiling.strength);
                antiStrengthRow.number.value = formatFloat(wallMatVarNormalized.antiTiling.strength, 2);
                antiGroup.body.appendChild(antiStrengthRow.row);

                const antiCellSizeRow = makeRangeRow('Cell size (tiles)');
                antiCellSizeRow.range.min = '0.25';
                antiCellSizeRow.range.max = '20';
                antiCellSizeRow.range.step = '0.25';
                antiCellSizeRow.number.min = '0.25';
                antiCellSizeRow.number.max = '20';
                antiCellSizeRow.number.step = '0.25';
                antiCellSizeRow.range.value = String(wallMatVarNormalized.antiTiling.cellSize);
                antiCellSizeRow.number.value = formatFloat(wallMatVarNormalized.antiTiling.cellSize, 2);
                antiGroup.body.appendChild(antiCellSizeRow.row);

                const antiBlendRow = makeRangeRow('Blend width');
                antiBlendRow.range.min = '0';
                antiBlendRow.range.max = '0.49';
                antiBlendRow.range.step = '0.01';
                antiBlendRow.number.min = '0';
                antiBlendRow.number.max = '0.49';
                antiBlendRow.number.step = '0.01';
                antiBlendRow.range.value = String(wallMatVarNormalized.antiTiling.blendWidth);
                antiBlendRow.number.value = formatFloat(wallMatVarNormalized.antiTiling.blendWidth, 2);
                antiGroup.body.appendChild(antiBlendRow.row);

                const antiOffsetVRow = makeRangeRow('Vertical shift');
                antiOffsetVRow.range.min = '0';
                antiOffsetVRow.range.max = '0.5';
                antiOffsetVRow.range.step = '0.01';
                antiOffsetVRow.number.min = '0';
                antiOffsetVRow.number.max = '0.5';
                antiOffsetVRow.number.step = '0.01';
                antiOffsetVRow.range.value = String(wallMatVarNormalized.antiTiling.offsetV);
                antiOffsetVRow.number.value = formatFloat(wallMatVarNormalized.antiTiling.offsetV, 2);
                antiGroup.body.appendChild(antiOffsetVRow.row);

                const antiOffsetURow = makeRangeRow('Horizontal shift');
                antiOffsetURow.range.min = '0';
                antiOffsetURow.range.max = '0.5';
                antiOffsetURow.range.step = '0.01';
                antiOffsetURow.number.min = '0';
                antiOffsetURow.number.max = '0.5';
                antiOffsetURow.number.step = '0.01';
                antiOffsetURow.range.value = String(wallMatVarNormalized.antiTiling.offsetU);
                antiOffsetURow.number.value = formatFloat(wallMatVarNormalized.antiTiling.offsetU, 2);
                antiGroup.body.appendChild(antiOffsetURow.row);

                const antiRotationRow = makeRangeRow('Rotation (deg)');
                antiRotationRow.range.min = '0';
                antiRotationRow.range.max = '180';
                antiRotationRow.range.step = '1';
                antiRotationRow.number.min = '0';
                antiRotationRow.number.max = '180';
                antiRotationRow.number.step = '1';
                antiRotationRow.range.value = String(wallMatVarNormalized.antiTiling.rotationDegrees);
                antiRotationRow.number.value = String(Math.round(wallMatVarNormalized.antiTiling.rotationDegrees));
                antiGroup.body.appendChild(antiRotationRow.row);

                const antiQualityToggle = makeToggleRow('Quality mode');
                antiQualityToggle.input.checked = wallMatVarNormalized.antiTiling.mode === 'quality';
                antiQualityToggle.input.disabled = !allow || !wallMatVarNormalized.enabled || !wallMatVarNormalized.antiTiling.enabled;
                antiGroup.body.appendChild(antiQualityToggle.toggle);
                wallMatVarGroup.body.appendChild(antiGroup.details);

                const detailGroup = makeDetailsSection('Detail', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:detail` });
                const detailToggle = makeToggleRow('Enable detail');
                detailToggle.input.checked = !!wallMatVarNormalized.detail.enabled;
                detailToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                detailGroup.body.appendChild(detailToggle.toggle);
                const detailStrengthRow = makeRangeRow('Strength');
                detailStrengthRow.range.min = '0';
                detailStrengthRow.range.max = '1';
                detailStrengthRow.range.step = '0.01';
                detailStrengthRow.number.min = '0';
                detailStrengthRow.number.max = '1';
                detailStrengthRow.number.step = '0.01';
                detailStrengthRow.range.value = String(wallMatVarNormalized.detail.strength);
                detailStrengthRow.number.value = formatFloat(wallMatVarNormalized.detail.strength, 2);
                detailGroup.body.appendChild(detailStrengthRow.row);
                wallMatVarGroup.body.appendChild(detailGroup.details);

                const cracksGroup = makeDetailsSection('Cracks', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:cracks` });
                const cracksToggle = makeToggleRow('Enable cracks');
                cracksToggle.input.checked = !!wallMatVarNormalized.cracks.enabled;
                cracksToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
                cracksGroup.body.appendChild(cracksToggle.toggle);
                const crackStrengthRow = makeRangeRow('Strength');
                crackStrengthRow.range.min = '0';
                crackStrengthRow.range.max = '1';
                crackStrengthRow.range.step = '0.01';
                crackStrengthRow.number.min = '0';
                crackStrengthRow.number.max = '1';
                crackStrengthRow.number.step = '0.01';
                crackStrengthRow.range.value = String(wallMatVarNormalized.cracks.strength);
                crackStrengthRow.number.value = formatFloat(wallMatVarNormalized.cracks.strength, 2);
                cracksGroup.body.appendChild(crackStrengthRow.row);
                wallMatVarGroup.body.appendChild(cracksGroup.details);

                const syncMatVarEnabled = () => {
                    const enabled = !!layer.materialVariation.enabled;
                    seedOffsetRow.range.disabled = !allow || !enabled;
                    seedOffsetRow.number.disabled = seedOffsetRow.range.disabled;
                    intensityRow.range.disabled = !allow || !enabled;
                    intensityRow.number.disabled = intensityRow.range.disabled;
                    scaleRow.range.disabled = !allow || !enabled;
                    scaleRow.number.disabled = scaleRow.range.disabled;

                    macroToggle.input.disabled = !allow || !enabled;
                    macroIntensityRow.range.disabled = !allow || !enabled || !macroToggle.input.checked;
                    macroIntensityRow.number.disabled = macroIntensityRow.range.disabled;
                    macroScaleRow.range.disabled = !allow || !enabled || !macroToggle.input.checked;
                    macroScaleRow.number.disabled = macroScaleRow.range.disabled;

                    streaksToggle.input.disabled = !allow || !enabled;
                    streakStrengthRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
                    streakStrengthRow.number.disabled = streakStrengthRow.range.disabled;
                    streakScaleRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
                    streakScaleRow.number.disabled = streakScaleRow.range.disabled;

                    edgeToggle.input.disabled = !allow || !enabled;
                    edgeStrengthRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
                    edgeStrengthRow.number.disabled = edgeStrengthRow.range.disabled;

                    grimeToggle.input.disabled = !allow || !enabled;
                    grimeStrengthRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
                    grimeStrengthRow.number.disabled = grimeStrengthRow.range.disabled;

                    dustToggle.input.disabled = !allow || !enabled;
                    dustStrengthRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
                    dustStrengthRow.number.disabled = dustStrengthRow.range.disabled;

                    antiToggle.input.disabled = !allow || !enabled;
                    antiStrengthRow.range.disabled = !allow || !enabled || !antiToggle.input.checked;
                    antiStrengthRow.number.disabled = antiStrengthRow.range.disabled;
                    antiCellSizeRow.range.disabled = !allow || !enabled || !antiToggle.input.checked;
                    antiCellSizeRow.number.disabled = antiCellSizeRow.range.disabled;
                    antiBlendRow.range.disabled = !allow || !enabled || !antiToggle.input.checked;
                    antiBlendRow.number.disabled = antiBlendRow.range.disabled;
                    antiOffsetVRow.range.disabled = !allow || !enabled || !antiToggle.input.checked;
                    antiOffsetVRow.number.disabled = antiOffsetVRow.range.disabled;
                    antiOffsetURow.range.disabled = !allow || !enabled || !antiToggle.input.checked;
                    antiOffsetURow.number.disabled = antiOffsetURow.range.disabled;
                    antiRotationRow.range.disabled = !allow || !enabled || !antiToggle.input.checked;
                    antiRotationRow.number.disabled = antiRotationRow.range.disabled;
                    antiQualityToggle.input.disabled = !allow || !enabled || !antiToggle.input.checked;

                    detailToggle.input.disabled = !allow || !enabled;
                    detailStrengthRow.range.disabled = !allow || !enabled || !detailToggle.input.checked;
                    detailStrengthRow.number.disabled = detailStrengthRow.range.disabled;

                    cracksToggle.input.disabled = !allow || !enabled;
                    crackStrengthRow.range.disabled = !allow || !enabled || !cracksToggle.input.checked;
                    crackStrengthRow.number.disabled = crackStrengthRow.range.disabled;
                };

                matVarToggle.input.addEventListener('change', () => {
                    layer.materialVariation.enabled = !!matVarToggle.input.checked;
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
                    const next = clamp(scaleRow.range.value, 0.05, 1.0);
                    layer.materialVariation.worldSpaceScale = next;
                    scaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                scaleRow.number.addEventListener('change', () => {
                    const next = clamp(scaleRow.number.value, 0.05, 1.0);
                    layer.materialVariation.worldSpaceScale = next;
                    scaleRow.range.value = String(next);
                    scaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                macroToggle.input.addEventListener('change', () => {
                    layer.materialVariation.macro ??= {};
                    layer.materialVariation.macro.enabled = !!macroToggle.input.checked;
                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                macroIntensityRow.range.addEventListener('input', () => {
                    const next = clamp(macroIntensityRow.range.value, 0.0, 2.0);
                    layer.materialVariation.macro ??= {};
                    layer.materialVariation.macro.intensity = next;
                    macroIntensityRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                macroIntensityRow.number.addEventListener('change', () => {
                    const next = clamp(macroIntensityRow.number.value, 0.0, 2.0);
                    layer.materialVariation.macro ??= {};
                    layer.materialVariation.macro.intensity = next;
                    macroIntensityRow.range.value = String(next);
                    macroIntensityRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                macroScaleRow.range.addEventListener('input', () => {
                    const next = clamp(macroScaleRow.range.value, 0.05, 2.0);
                    layer.materialVariation.macro ??= {};
                    layer.materialVariation.macro.scale = next;
                    macroScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                macroScaleRow.number.addEventListener('change', () => {
                    const next = clamp(macroScaleRow.number.value, 0.05, 2.0);
                    layer.materialVariation.macro ??= {};
                    layer.materialVariation.macro.scale = next;
                    macroScaleRow.range.value = String(next);
                    macroScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                streaksToggle.input.addEventListener('change', () => {
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.enabled = !!streaksToggle.input.checked;
                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                streakStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(streakStrengthRow.range.value, 0.0, 1.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.strength = next;
                    streakStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                streakStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(streakStrengthRow.number.value, 0.0, 1.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.strength = next;
                    streakStrengthRow.range.value = String(next);
                    streakStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                streakScaleRow.range.addEventListener('input', () => {
                    const next = clamp(streakScaleRow.range.value, 0.05, 5.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.scale = next;
                    streakScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                streakScaleRow.number.addEventListener('change', () => {
                    const next = clamp(streakScaleRow.number.value, 0.05, 5.0);
                    layer.materialVariation.streaks ??= {};
                    layer.materialVariation.streaks.scale = next;
                    streakScaleRow.range.value = String(next);
                    streakScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                edgeToggle.input.addEventListener('change', () => {
                    layer.materialVariation.edgeWear ??= {};
                    layer.materialVariation.edgeWear.enabled = !!edgeToggle.input.checked;
                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                edgeStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(edgeStrengthRow.range.value, 0.0, 1.0);
                    layer.materialVariation.edgeWear ??= {};
                    layer.materialVariation.edgeWear.strength = next;
                    edgeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                edgeStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(edgeStrengthRow.number.value, 0.0, 1.0);
                    layer.materialVariation.edgeWear ??= {};
                    layer.materialVariation.edgeWear.strength = next;
                    edgeStrengthRow.range.value = String(next);
                    edgeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                grimeToggle.input.addEventListener('change', () => {
                    layer.materialVariation.grime ??= {};
                    layer.materialVariation.grime.enabled = !!grimeToggle.input.checked;
                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                grimeStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(grimeStrengthRow.range.value, 0.0, 1.0);
                    layer.materialVariation.grime ??= {};
                    layer.materialVariation.grime.strength = next;
                    grimeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                grimeStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(grimeStrengthRow.number.value, 0.0, 1.0);
                    layer.materialVariation.grime ??= {};
                    layer.materialVariation.grime.strength = next;
                    grimeStrengthRow.range.value = String(next);
                    grimeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                dustToggle.input.addEventListener('change', () => {
                    layer.materialVariation.dust ??= {};
                    layer.materialVariation.dust.enabled = !!dustToggle.input.checked;
                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                dustStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(dustStrengthRow.range.value, 0.0, 1.0);
                    layer.materialVariation.dust ??= {};
                    layer.materialVariation.dust.strength = next;
                    dustStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                dustStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(dustStrengthRow.number.value, 0.0, 1.0);
                    layer.materialVariation.dust ??= {};
                    layer.materialVariation.dust.strength = next;
                    dustStrengthRow.range.value = String(next);
                    dustStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                antiToggle.input.addEventListener('change', () => {
                    layer.materialVariation.antiTiling ??= {};
                    layer.materialVariation.antiTiling.enabled = !!antiToggle.input.checked;
                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                antiStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(antiStrengthRow.range.value, 0.0, 1.0);
                    layer.materialVariation.antiTiling ??= {};
                    layer.materialVariation.antiTiling.strength = next;
                    antiStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                antiStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(antiStrengthRow.number.value, 0.0, 1.0);
                    layer.materialVariation.antiTiling ??= {};
                    layer.materialVariation.antiTiling.strength = next;
                    antiStrengthRow.range.value = String(next);
                    antiStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                antiCellSizeRow.range.addEventListener('input', () => {
                    const next = clamp(antiCellSizeRow.range.value, 0.25, 20.0);
                    layer.materialVariation.antiTiling ??= {};
                    layer.materialVariation.antiTiling.cellSize = next;
                    antiCellSizeRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                antiCellSizeRow.number.addEventListener('change', () => {
                    const next = clamp(antiCellSizeRow.number.value, 0.25, 20.0);
                    layer.materialVariation.antiTiling ??= {};
                    layer.materialVariation.antiTiling.cellSize = next;
                    antiCellSizeRow.range.value = String(next);
                    antiCellSizeRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                antiBlendRow.range.addEventListener('input', () => {
                    const next = clamp(antiBlendRow.range.value, 0.0, 0.49);
                    layer.materialVariation.antiTiling ??= {};
                    layer.materialVariation.antiTiling.blendWidth = next;
                    antiBlendRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                antiBlendRow.number.addEventListener('change', () => {
                    const next = clamp(antiBlendRow.number.value, 0.0, 0.49);
                    layer.materialVariation.antiTiling ??= {};
                    layer.materialVariation.antiTiling.blendWidth = next;
                    antiBlendRow.range.value = String(next);
                    antiBlendRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                antiOffsetVRow.range.addEventListener('input', () => {
                    const next = clamp(antiOffsetVRow.range.value, 0.0, 0.5);
                    layer.materialVariation.antiTiling ??= {};
                    layer.materialVariation.antiTiling.offsetV = next;
                    antiOffsetVRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                antiOffsetVRow.number.addEventListener('change', () => {
                    const next = clamp(antiOffsetVRow.number.value, 0.0, 0.5);
                    layer.materialVariation.antiTiling ??= {};
                    layer.materialVariation.antiTiling.offsetV = next;
                    antiOffsetVRow.range.value = String(next);
                    antiOffsetVRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                antiOffsetURow.range.addEventListener('input', () => {
                    const next = clamp(antiOffsetURow.range.value, 0.0, 0.5);
                    layer.materialVariation.antiTiling ??= {};
                    layer.materialVariation.antiTiling.offsetU = next;
                    antiOffsetURow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                antiOffsetURow.number.addEventListener('change', () => {
                    const next = clamp(antiOffsetURow.number.value, 0.0, 0.5);
                    layer.materialVariation.antiTiling ??= {};
                    layer.materialVariation.antiTiling.offsetU = next;
                    antiOffsetURow.range.value = String(next);
                    antiOffsetURow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                antiRotationRow.range.addEventListener('input', () => {
                    const next = clamp(antiRotationRow.range.value, 0.0, 180.0);
                    layer.materialVariation.antiTiling ??= {};
                    layer.materialVariation.antiTiling.rotationDegrees = next;
                    antiRotationRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                antiRotationRow.number.addEventListener('change', () => {
                    const next = clamp(antiRotationRow.number.value, 0.0, 180.0);
                    layer.materialVariation.antiTiling ??= {};
                    layer.materialVariation.antiTiling.rotationDegrees = next;
                    antiRotationRow.range.value = String(next);
                    antiRotationRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                antiQualityToggle.input.addEventListener('change', () => {
                    layer.materialVariation.antiTiling ??= {};
                    layer.materialVariation.antiTiling.mode = antiQualityToggle.input.checked ? 'quality' : 'fast';
                    this._notifySelectedLayersChanged();
                });

                detailToggle.input.addEventListener('change', () => {
                    layer.materialVariation.detail ??= {};
                    layer.materialVariation.detail.enabled = !!detailToggle.input.checked;
                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                detailStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(detailStrengthRow.range.value, 0.0, 1.0);
                    layer.materialVariation.detail ??= {};
                    layer.materialVariation.detail.strength = next;
                    detailStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                detailStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(detailStrengthRow.number.value, 0.0, 1.0);
                    layer.materialVariation.detail ??= {};
                    layer.materialVariation.detail.strength = next;
                    detailStrengthRow.range.value = String(next);
                    detailStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                cracksToggle.input.addEventListener('change', () => {
                    layer.materialVariation.cracks ??= {};
                    layer.materialVariation.cracks.enabled = !!cracksToggle.input.checked;
                    syncMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                crackStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(crackStrengthRow.range.value, 0.0, 1.0);
                    layer.materialVariation.cracks ??= {};
                    layer.materialVariation.cracks.strength = next;
                    crackStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                crackStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(crackStrengthRow.number.value, 0.0, 1.0);
                    layer.materialVariation.cracks ??= {};
                    layer.materialVariation.cracks.strength = next;
                    crackStrengthRow.range.value = String(next);
                    crackStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                syncMatVarEnabled();
                wallMatVarGroup.body.appendChild(document.createElement('div')).className = 'building-fab-hint';
                wallMatVarGroup.body.lastChild.textContent = 'Enable the variation system to add weathering and breakup.';
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

                const appendRoofSectionLabel = (text) => {
                    const label = document.createElement('div');
                    label.className = 'ui-section-label';
                    label.textContent = text;
                    layerSection.body.appendChild(label);
                };

                appendRoofSectionLabel('Texture tiling');
                layer.roof.tiling ??= { enabled: false, tileMeters: 4.0 };
                const roofTilingToggle = makeToggleRow('Override tile meters');
                roofTilingToggle.input.checked = !!layer?.roof?.tiling?.enabled;
                roofTilingToggle.input.disabled = !allow;
                layerSection.body.appendChild(roofTilingToggle.toggle);

                const roofTileMetersRow = makeRangeRow('Tile meters');
                roofTileMetersRow.range.min = '0.25';
                roofTileMetersRow.range.max = '20';
                roofTileMetersRow.range.step = '0.25';
                roofTileMetersRow.number.min = '0.25';
                roofTileMetersRow.number.max = '20';
                roofTileMetersRow.number.step = '0.25';
                roofTileMetersRow.range.value = String(layer?.roof?.tiling?.tileMeters ?? 4.0);
                roofTileMetersRow.number.value = formatFloat(layer?.roof?.tiling?.tileMeters ?? 4.0, 2);
                roofTileMetersRow.range.disabled = !allow || !layer?.roof?.tiling?.enabled;
                roofTileMetersRow.number.disabled = roofTileMetersRow.range.disabled;
                roofTilingToggle.input.addEventListener('change', () => {
                    layer.roof.tiling.enabled = !!roofTilingToggle.input.checked;
                    roofTileMetersRow.range.disabled = !allow || !layer.roof.tiling.enabled;
                    roofTileMetersRow.number.disabled = roofTileMetersRow.range.disabled;
                    this._notifySelectedLayersChanged();
                });
                roofTileMetersRow.range.addEventListener('input', () => {
                    const next = clamp(roofTileMetersRow.range.value, 0.25, 20.0);
                    layer.roof.tiling.tileMeters = next;
                    roofTileMetersRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofTileMetersRow.number.addEventListener('change', () => {
                    const next = clamp(roofTileMetersRow.number.value, 0.25, 20.0);
                    layer.roof.tiling.tileMeters = next;
                    roofTileMetersRow.range.value = String(next);
                    roofTileMetersRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                layerSection.body.appendChild(roofTileMetersRow.row);

                const roofTilingHint = document.createElement('div');
                roofTilingHint.className = 'building-fab-hint';
                roofTilingHint.textContent = 'Overrides the material tile size in meters.';
                layerSection.body.appendChild(roofTilingHint);

                appendRoofSectionLabel('Material variation');
                layer.roof.materialVariation ??= { enabled: false, seedOffset: 0 };
                const roofMatVarNormalized = normalizeMaterialVariationConfig(layer.roof.materialVariation, { root: MATERIAL_VARIATION_ROOT.SURFACE });

                const roofMatVarToggle = makeToggleRow('Enable variation');
                roofMatVarToggle.input.checked = !!roofMatVarNormalized.enabled;
                roofMatVarToggle.input.disabled = !allow;
                layerSection.body.appendChild(roofMatVarToggle.toggle);

                const roofSeedOffsetRow = makeRangeRow('Seed offset');
                roofSeedOffsetRow.range.min = '-9999';
                roofSeedOffsetRow.range.max = '9999';
                roofSeedOffsetRow.range.step = '1';
                roofSeedOffsetRow.number.min = '-9999';
                roofSeedOffsetRow.number.max = '9999';
                roofSeedOffsetRow.number.step = '1';
                roofSeedOffsetRow.range.value = String(layer.roof.materialVariation.seedOffset ?? 0);
                roofSeedOffsetRow.number.value = String(layer.roof.materialVariation.seedOffset ?? 0);
                layerSection.body.appendChild(roofSeedOffsetRow.row);

                const roofIntensityRow = makeRangeRow('Intensity');
                roofIntensityRow.range.min = '0';
                roofIntensityRow.range.max = '2';
                roofIntensityRow.range.step = '0.01';
                roofIntensityRow.number.min = '0';
                roofIntensityRow.number.max = '2';
                roofIntensityRow.number.step = '0.01';
                roofIntensityRow.range.value = String(roofMatVarNormalized.globalIntensity);
                roofIntensityRow.number.value = formatFloat(roofMatVarNormalized.globalIntensity, 2);
                layerSection.body.appendChild(roofIntensityRow.row);

                const roofScaleRow = makeRangeRow('World scale');
                roofScaleRow.range.min = '0.05';
                roofScaleRow.range.max = '1';
                roofScaleRow.range.step = '0.01';
                roofScaleRow.number.min = '0.05';
                roofScaleRow.number.max = '1';
                roofScaleRow.number.step = '0.01';
                roofScaleRow.range.value = String(roofMatVarNormalized.worldSpaceScale);
                roofScaleRow.number.value = formatFloat(roofMatVarNormalized.worldSpaceScale, 2);
                layerSection.body.appendChild(roofScaleRow.row);

                appendRoofSectionLabel('Macro');
                const roofMacroToggle = makeToggleRow('Enable macro');
                roofMacroToggle.input.checked = !!roofMatVarNormalized.macro.enabled;
                roofMacroToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
                layerSection.body.appendChild(roofMacroToggle.toggle);
                const roofMacroIntensityRow = makeRangeRow('Intensity');
                roofMacroIntensityRow.range.min = '0';
                roofMacroIntensityRow.range.max = '2';
                roofMacroIntensityRow.range.step = '0.01';
                roofMacroIntensityRow.number.min = '0';
                roofMacroIntensityRow.number.max = '2';
                roofMacroIntensityRow.number.step = '0.01';
                roofMacroIntensityRow.range.value = String(roofMatVarNormalized.macro.intensity);
                roofMacroIntensityRow.number.value = formatFloat(roofMatVarNormalized.macro.intensity, 2);
                layerSection.body.appendChild(roofMacroIntensityRow.row);
                const roofMacroScaleRow = makeRangeRow('Scale');
                roofMacroScaleRow.range.min = '0.05';
                roofMacroScaleRow.range.max = '2';
                roofMacroScaleRow.range.step = '0.01';
                roofMacroScaleRow.number.min = '0.05';
                roofMacroScaleRow.number.max = '2';
                roofMacroScaleRow.number.step = '0.01';
                roofMacroScaleRow.range.value = String(roofMatVarNormalized.macro.scale);
                roofMacroScaleRow.number.value = formatFloat(roofMatVarNormalized.macro.scale, 2);
                layerSection.body.appendChild(roofMacroScaleRow.row);

                appendRoofSectionLabel('Grime');
                const roofGrimeToggle = makeToggleRow('Enable grime');
                roofGrimeToggle.input.checked = !!roofMatVarNormalized.grime.enabled;
                roofGrimeToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
                layerSection.body.appendChild(roofGrimeToggle.toggle);
                const roofGrimeStrengthRow = makeRangeRow('Strength');
                roofGrimeStrengthRow.range.min = '0';
                roofGrimeStrengthRow.range.max = '1';
                roofGrimeStrengthRow.range.step = '0.01';
                roofGrimeStrengthRow.number.min = '0';
                roofGrimeStrengthRow.number.max = '1';
                roofGrimeStrengthRow.number.step = '0.01';
                roofGrimeStrengthRow.range.value = String(roofMatVarNormalized.grime.strength);
                roofGrimeStrengthRow.number.value = formatFloat(roofMatVarNormalized.grime.strength, 2);
                layerSection.body.appendChild(roofGrimeStrengthRow.row);

                appendRoofSectionLabel('Streaks');
                const roofStreaksToggle = makeToggleRow('Enable streaks');
                roofStreaksToggle.input.checked = !!roofMatVarNormalized.streaks.enabled;
                roofStreaksToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
                layerSection.body.appendChild(roofStreaksToggle.toggle);
                const roofStreakStrengthRow = makeRangeRow('Strength');
                roofStreakStrengthRow.range.min = '0';
                roofStreakStrengthRow.range.max = '1';
                roofStreakStrengthRow.range.step = '0.01';
                roofStreakStrengthRow.number.min = '0';
                roofStreakStrengthRow.number.max = '1';
                roofStreakStrengthRow.number.step = '0.01';
                roofStreakStrengthRow.range.value = String(roofMatVarNormalized.streaks.strength);
                roofStreakStrengthRow.number.value = formatFloat(roofMatVarNormalized.streaks.strength, 2);
                layerSection.body.appendChild(roofStreakStrengthRow.row);
                const roofStreakScaleRow = makeRangeRow('Scale');
                roofStreakScaleRow.range.min = '0.05';
                roofStreakScaleRow.range.max = '5';
                roofStreakScaleRow.range.step = '0.01';
                roofStreakScaleRow.number.min = '0.05';
                roofStreakScaleRow.number.max = '5';
                roofStreakScaleRow.number.step = '0.01';
                roofStreakScaleRow.range.value = String(roofMatVarNormalized.streaks.scale);
                roofStreakScaleRow.number.value = formatFloat(roofMatVarNormalized.streaks.scale, 2);
                layerSection.body.appendChild(roofStreakScaleRow.row);

                appendRoofSectionLabel('Edge wear');
                const roofEdgeToggle = makeToggleRow('Enable edge wear');
                roofEdgeToggle.input.checked = !!roofMatVarNormalized.edgeWear.enabled;
                roofEdgeToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
                layerSection.body.appendChild(roofEdgeToggle.toggle);
                const roofEdgeStrengthRow = makeRangeRow('Strength');
                roofEdgeStrengthRow.range.min = '0';
                roofEdgeStrengthRow.range.max = '1';
                roofEdgeStrengthRow.range.step = '0.01';
                roofEdgeStrengthRow.number.min = '0';
                roofEdgeStrengthRow.number.max = '1';
                roofEdgeStrengthRow.number.step = '0.01';
                roofEdgeStrengthRow.range.value = String(roofMatVarNormalized.edgeWear.strength);
                roofEdgeStrengthRow.number.value = formatFloat(roofMatVarNormalized.edgeWear.strength, 2);
                layerSection.body.appendChild(roofEdgeStrengthRow.row);

                appendRoofSectionLabel('Dust');
                const roofDustToggle = makeToggleRow('Enable dust');
                roofDustToggle.input.checked = !!roofMatVarNormalized.dust.enabled;
                roofDustToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
                layerSection.body.appendChild(roofDustToggle.toggle);
                const roofDustStrengthRow = makeRangeRow('Strength');
                roofDustStrengthRow.range.min = '0';
                roofDustStrengthRow.range.max = '1';
                roofDustStrengthRow.range.step = '0.01';
                roofDustStrengthRow.number.min = '0';
                roofDustStrengthRow.number.max = '1';
                roofDustStrengthRow.number.step = '0.01';
                roofDustStrengthRow.range.value = String(roofMatVarNormalized.dust.strength);
                roofDustStrengthRow.number.value = formatFloat(roofMatVarNormalized.dust.strength, 2);
                layerSection.body.appendChild(roofDustStrengthRow.row);

                appendRoofSectionLabel('Anti-tiling');
                const roofAntiToggle = makeToggleRow('Enable anti-tiling');
                roofAntiToggle.input.checked = !!roofMatVarNormalized.antiTiling.enabled;
                roofAntiToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
                layerSection.body.appendChild(roofAntiToggle.toggle);
                const roofAntiStrengthRow = makeRangeRow('Strength');
                roofAntiStrengthRow.range.min = '0';
                roofAntiStrengthRow.range.max = '1';
                roofAntiStrengthRow.range.step = '0.01';
                roofAntiStrengthRow.number.min = '0';
                roofAntiStrengthRow.number.max = '1';
                roofAntiStrengthRow.number.step = '0.01';
                roofAntiStrengthRow.range.value = String(roofMatVarNormalized.antiTiling.strength);
                roofAntiStrengthRow.number.value = formatFloat(roofMatVarNormalized.antiTiling.strength, 2);
                layerSection.body.appendChild(roofAntiStrengthRow.row);

                const roofAntiCellSizeRow = makeRangeRow('Cell size (tiles)');
                roofAntiCellSizeRow.range.min = '0.25';
                roofAntiCellSizeRow.range.max = '20';
                roofAntiCellSizeRow.range.step = '0.25';
                roofAntiCellSizeRow.number.min = '0.25';
                roofAntiCellSizeRow.number.max = '20';
                roofAntiCellSizeRow.number.step = '0.25';
                roofAntiCellSizeRow.range.value = String(roofMatVarNormalized.antiTiling.cellSize);
                roofAntiCellSizeRow.number.value = formatFloat(roofMatVarNormalized.antiTiling.cellSize, 2);
                layerSection.body.appendChild(roofAntiCellSizeRow.row);

                const roofAntiBlendRow = makeRangeRow('Blend width');
                roofAntiBlendRow.range.min = '0';
                roofAntiBlendRow.range.max = '0.49';
                roofAntiBlendRow.range.step = '0.01';
                roofAntiBlendRow.number.min = '0';
                roofAntiBlendRow.number.max = '0.49';
                roofAntiBlendRow.number.step = '0.01';
                roofAntiBlendRow.range.value = String(roofMatVarNormalized.antiTiling.blendWidth);
                roofAntiBlendRow.number.value = formatFloat(roofMatVarNormalized.antiTiling.blendWidth, 2);
                layerSection.body.appendChild(roofAntiBlendRow.row);

                const roofAntiOffsetURow = makeRangeRow('U shift');
                roofAntiOffsetURow.range.min = '0';
                roofAntiOffsetURow.range.max = '0.5';
                roofAntiOffsetURow.range.step = '0.01';
                roofAntiOffsetURow.number.min = '0';
                roofAntiOffsetURow.number.max = '0.5';
                roofAntiOffsetURow.number.step = '0.01';
                roofAntiOffsetURow.range.value = String(roofMatVarNormalized.antiTiling.offsetU);
                roofAntiOffsetURow.number.value = formatFloat(roofMatVarNormalized.antiTiling.offsetU, 2);
                layerSection.body.appendChild(roofAntiOffsetURow.row);

                const roofAntiOffsetVRow = makeRangeRow('V shift');
                roofAntiOffsetVRow.range.min = '0';
                roofAntiOffsetVRow.range.max = '0.5';
                roofAntiOffsetVRow.range.step = '0.01';
                roofAntiOffsetVRow.number.min = '0';
                roofAntiOffsetVRow.number.max = '0.5';
                roofAntiOffsetVRow.number.step = '0.01';
                roofAntiOffsetVRow.range.value = String(roofMatVarNormalized.antiTiling.offsetV);
                roofAntiOffsetVRow.number.value = formatFloat(roofMatVarNormalized.antiTiling.offsetV, 2);
                layerSection.body.appendChild(roofAntiOffsetVRow.row);

                const roofAntiRotationRow = makeRangeRow('Rotation (deg)');
                roofAntiRotationRow.range.min = '0';
                roofAntiRotationRow.range.max = '180';
                roofAntiRotationRow.range.step = '1';
                roofAntiRotationRow.number.min = '0';
                roofAntiRotationRow.number.max = '180';
                roofAntiRotationRow.number.step = '1';
                roofAntiRotationRow.range.value = String(roofMatVarNormalized.antiTiling.rotationDegrees);
                roofAntiRotationRow.number.value = String(Math.round(roofMatVarNormalized.antiTiling.rotationDegrees));
                layerSection.body.appendChild(roofAntiRotationRow.row);

                const roofAntiQualityToggle = makeToggleRow('Quality mode');
                roofAntiQualityToggle.input.checked = roofMatVarNormalized.antiTiling.mode === 'quality';
                roofAntiQualityToggle.input.disabled = !allow || !roofMatVarNormalized.enabled || !roofMatVarNormalized.antiTiling.enabled;
                layerSection.body.appendChild(roofAntiQualityToggle.toggle);

                appendRoofSectionLabel('Detail');
                const roofDetailToggle = makeToggleRow('Enable detail');
                roofDetailToggle.input.checked = !!roofMatVarNormalized.detail.enabled;
                roofDetailToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
                layerSection.body.appendChild(roofDetailToggle.toggle);
                const roofDetailStrengthRow = makeRangeRow('Strength');
                roofDetailStrengthRow.range.min = '0';
                roofDetailStrengthRow.range.max = '1';
                roofDetailStrengthRow.range.step = '0.01';
                roofDetailStrengthRow.number.min = '0';
                roofDetailStrengthRow.number.max = '1';
                roofDetailStrengthRow.number.step = '0.01';
                roofDetailStrengthRow.range.value = String(roofMatVarNormalized.detail.strength);
                roofDetailStrengthRow.number.value = formatFloat(roofMatVarNormalized.detail.strength, 2);
                layerSection.body.appendChild(roofDetailStrengthRow.row);

                appendRoofSectionLabel('Cracks');
                const roofCracksToggle = makeToggleRow('Enable cracks');
                roofCracksToggle.input.checked = !!roofMatVarNormalized.cracks.enabled;
                roofCracksToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
                layerSection.body.appendChild(roofCracksToggle.toggle);
                const roofCrackStrengthRow = makeRangeRow('Strength');
                roofCrackStrengthRow.range.min = '0';
                roofCrackStrengthRow.range.max = '1';
                roofCrackStrengthRow.range.step = '0.01';
                roofCrackStrengthRow.number.min = '0';
                roofCrackStrengthRow.number.max = '1';
                roofCrackStrengthRow.number.step = '0.01';
                roofCrackStrengthRow.range.value = String(roofMatVarNormalized.cracks.strength);
                roofCrackStrengthRow.number.value = formatFloat(roofMatVarNormalized.cracks.strength, 2);
                layerSection.body.appendChild(roofCrackStrengthRow.row);

                const syncRoofMatVarEnabled = () => {
                    const enabled = !!layer.roof.materialVariation.enabled;
                    roofSeedOffsetRow.range.disabled = !allow || !enabled;
                    roofSeedOffsetRow.number.disabled = roofSeedOffsetRow.range.disabled;
                    roofIntensityRow.range.disabled = !allow || !enabled;
                    roofIntensityRow.number.disabled = roofIntensityRow.range.disabled;
                    roofScaleRow.range.disabled = !allow || !enabled;
                    roofScaleRow.number.disabled = roofScaleRow.range.disabled;

                    roofMacroToggle.input.disabled = !allow || !enabled;
                    roofMacroIntensityRow.range.disabled = !allow || !enabled || !roofMacroToggle.input.checked;
                    roofMacroIntensityRow.number.disabled = roofMacroIntensityRow.range.disabled;
                    roofMacroScaleRow.range.disabled = !allow || !enabled || !roofMacroToggle.input.checked;
                    roofMacroScaleRow.number.disabled = roofMacroScaleRow.range.disabled;

                    roofGrimeToggle.input.disabled = !allow || !enabled;
                    roofGrimeStrengthRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
                    roofGrimeStrengthRow.number.disabled = roofGrimeStrengthRow.range.disabled;

                    roofStreaksToggle.input.disabled = !allow || !enabled;
                    roofStreakStrengthRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
                    roofStreakStrengthRow.number.disabled = roofStreakStrengthRow.range.disabled;
                    roofStreakScaleRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
                    roofStreakScaleRow.number.disabled = roofStreakScaleRow.range.disabled;

                    roofEdgeToggle.input.disabled = !allow || !enabled;
                    roofEdgeStrengthRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
                    roofEdgeStrengthRow.number.disabled = roofEdgeStrengthRow.range.disabled;

                    roofDustToggle.input.disabled = !allow || !enabled;
                    roofDustStrengthRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
                    roofDustStrengthRow.number.disabled = roofDustStrengthRow.range.disabled;

                    roofAntiToggle.input.disabled = !allow || !enabled;
                    roofAntiStrengthRow.range.disabled = !allow || !enabled || !roofAntiToggle.input.checked;
                    roofAntiStrengthRow.number.disabled = roofAntiStrengthRow.range.disabled;
                    roofAntiCellSizeRow.range.disabled = !allow || !enabled || !roofAntiToggle.input.checked;
                    roofAntiCellSizeRow.number.disabled = roofAntiCellSizeRow.range.disabled;
                    roofAntiBlendRow.range.disabled = !allow || !enabled || !roofAntiToggle.input.checked;
                    roofAntiBlendRow.number.disabled = roofAntiBlendRow.range.disabled;
                    roofAntiOffsetURow.range.disabled = !allow || !enabled || !roofAntiToggle.input.checked;
                    roofAntiOffsetURow.number.disabled = roofAntiOffsetURow.range.disabled;
                    roofAntiOffsetVRow.range.disabled = !allow || !enabled || !roofAntiToggle.input.checked;
                    roofAntiOffsetVRow.number.disabled = roofAntiOffsetVRow.range.disabled;
                    roofAntiRotationRow.range.disabled = !allow || !enabled || !roofAntiToggle.input.checked;
                    roofAntiRotationRow.number.disabled = roofAntiRotationRow.range.disabled;
                    roofAntiQualityToggle.input.disabled = !allow || !enabled || !roofAntiToggle.input.checked;

                    roofDetailToggle.input.disabled = !allow || !enabled;
                    roofDetailStrengthRow.range.disabled = !allow || !enabled || !roofDetailToggle.input.checked;
                    roofDetailStrengthRow.number.disabled = roofDetailStrengthRow.range.disabled;

                    roofCracksToggle.input.disabled = !allow || !enabled;
                    roofCrackStrengthRow.range.disabled = !allow || !enabled || !roofCracksToggle.input.checked;
                    roofCrackStrengthRow.number.disabled = roofCrackStrengthRow.range.disabled;
                };

                roofMatVarToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.enabled = !!roofMatVarToggle.input.checked;
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
                    const next = clamp(roofScaleRow.range.value, 0.05, 1.0);
                    layer.roof.materialVariation.worldSpaceScale = next;
                    roofScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofScaleRow.number.addEventListener('change', () => {
                    const next = clamp(roofScaleRow.number.value, 0.05, 1.0);
                    layer.roof.materialVariation.worldSpaceScale = next;
                    roofScaleRow.range.value = String(next);
                    roofScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacroToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.macro ??= {};
                    layer.roof.materialVariation.macro.enabled = !!roofMacroToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofMacroIntensityRow.range.addEventListener('input', () => {
                    const next = clamp(roofMacroIntensityRow.range.value, 0.0, 2.0);
                    layer.roof.materialVariation.macro ??= {};
                    layer.roof.materialVariation.macro.intensity = next;
                    roofMacroIntensityRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacroIntensityRow.number.addEventListener('change', () => {
                    const next = clamp(roofMacroIntensityRow.number.value, 0.0, 2.0);
                    layer.roof.materialVariation.macro ??= {};
                    layer.roof.materialVariation.macro.intensity = next;
                    roofMacroIntensityRow.range.value = String(next);
                    roofMacroIntensityRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacroScaleRow.range.addEventListener('input', () => {
                    const next = clamp(roofMacroScaleRow.range.value, 0.05, 2.0);
                    layer.roof.materialVariation.macro ??= {};
                    layer.roof.materialVariation.macro.scale = next;
                    roofMacroScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofMacroScaleRow.number.addEventListener('change', () => {
                    const next = clamp(roofMacroScaleRow.number.value, 0.05, 2.0);
                    layer.roof.materialVariation.macro ??= {};
                    layer.roof.materialVariation.macro.scale = next;
                    roofMacroScaleRow.range.value = String(next);
                    roofMacroScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofGrimeToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.grime ??= {};
                    layer.roof.materialVariation.grime.enabled = !!roofGrimeToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofGrimeStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofGrimeStrengthRow.range.value, 0.0, 1.0);
                    layer.roof.materialVariation.grime ??= {};
                    layer.roof.materialVariation.grime.strength = next;
                    roofGrimeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofGrimeStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofGrimeStrengthRow.number.value, 0.0, 1.0);
                    layer.roof.materialVariation.grime ??= {};
                    layer.roof.materialVariation.grime.strength = next;
                    roofGrimeStrengthRow.range.value = String(next);
                    roofGrimeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofStreaksToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.enabled = !!roofStreaksToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofStreakStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofStreakStrengthRow.range.value, 0.0, 1.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.strength = next;
                    roofStreakStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStreakStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofStreakStrengthRow.number.value, 0.0, 1.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.strength = next;
                    roofStreakStrengthRow.range.value = String(next);
                    roofStreakStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStreakScaleRow.range.addEventListener('input', () => {
                    const next = clamp(roofStreakScaleRow.range.value, 0.05, 5.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.scale = next;
                    roofStreakScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofStreakScaleRow.number.addEventListener('change', () => {
                    const next = clamp(roofStreakScaleRow.number.value, 0.05, 5.0);
                    layer.roof.materialVariation.streaks ??= {};
                    layer.roof.materialVariation.streaks.scale = next;
                    roofStreakScaleRow.range.value = String(next);
                    roofStreakScaleRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofEdgeToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.edgeWear ??= {};
                    layer.roof.materialVariation.edgeWear.enabled = !!roofEdgeToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofEdgeStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofEdgeStrengthRow.range.value, 0.0, 1.0);
                    layer.roof.materialVariation.edgeWear ??= {};
                    layer.roof.materialVariation.edgeWear.strength = next;
                    roofEdgeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofEdgeStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofEdgeStrengthRow.number.value, 0.0, 1.0);
                    layer.roof.materialVariation.edgeWear ??= {};
                    layer.roof.materialVariation.edgeWear.strength = next;
                    roofEdgeStrengthRow.range.value = String(next);
                    roofEdgeStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofDustToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.dust ??= {};
                    layer.roof.materialVariation.dust.enabled = !!roofDustToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofDustStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofDustStrengthRow.range.value, 0.0, 1.0);
                    layer.roof.materialVariation.dust ??= {};
                    layer.roof.materialVariation.dust.strength = next;
                    roofDustStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDustStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofDustStrengthRow.number.value, 0.0, 1.0);
                    layer.roof.materialVariation.dust ??= {};
                    layer.roof.materialVariation.dust.strength = next;
                    roofDustStrengthRow.range.value = String(next);
                    roofDustStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofAntiToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.antiTiling ??= {};
                    layer.roof.materialVariation.antiTiling.enabled = !!roofAntiToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofAntiStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofAntiStrengthRow.range.value, 0.0, 1.0);
                    layer.roof.materialVariation.antiTiling ??= {};
                    layer.roof.materialVariation.antiTiling.strength = next;
                    roofAntiStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofAntiStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofAntiStrengthRow.number.value, 0.0, 1.0);
                    layer.roof.materialVariation.antiTiling ??= {};
                    layer.roof.materialVariation.antiTiling.strength = next;
                    roofAntiStrengthRow.range.value = String(next);
                    roofAntiStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofAntiCellSizeRow.range.addEventListener('input', () => {
                    const next = clamp(roofAntiCellSizeRow.range.value, 0.25, 20.0);
                    layer.roof.materialVariation.antiTiling ??= {};
                    layer.roof.materialVariation.antiTiling.cellSize = next;
                    roofAntiCellSizeRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofAntiCellSizeRow.number.addEventListener('change', () => {
                    const next = clamp(roofAntiCellSizeRow.number.value, 0.25, 20.0);
                    layer.roof.materialVariation.antiTiling ??= {};
                    layer.roof.materialVariation.antiTiling.cellSize = next;
                    roofAntiCellSizeRow.range.value = String(next);
                    roofAntiCellSizeRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofAntiBlendRow.range.addEventListener('input', () => {
                    const next = clamp(roofAntiBlendRow.range.value, 0.0, 0.49);
                    layer.roof.materialVariation.antiTiling ??= {};
                    layer.roof.materialVariation.antiTiling.blendWidth = next;
                    roofAntiBlendRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofAntiBlendRow.number.addEventListener('change', () => {
                    const next = clamp(roofAntiBlendRow.number.value, 0.0, 0.49);
                    layer.roof.materialVariation.antiTiling ??= {};
                    layer.roof.materialVariation.antiTiling.blendWidth = next;
                    roofAntiBlendRow.range.value = String(next);
                    roofAntiBlendRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofAntiOffsetURow.range.addEventListener('input', () => {
                    const next = clamp(roofAntiOffsetURow.range.value, 0.0, 0.5);
                    layer.roof.materialVariation.antiTiling ??= {};
                    layer.roof.materialVariation.antiTiling.offsetU = next;
                    roofAntiOffsetURow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofAntiOffsetURow.number.addEventListener('change', () => {
                    const next = clamp(roofAntiOffsetURow.number.value, 0.0, 0.5);
                    layer.roof.materialVariation.antiTiling ??= {};
                    layer.roof.materialVariation.antiTiling.offsetU = next;
                    roofAntiOffsetURow.range.value = String(next);
                    roofAntiOffsetURow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofAntiOffsetVRow.range.addEventListener('input', () => {
                    const next = clamp(roofAntiOffsetVRow.range.value, 0.0, 0.5);
                    layer.roof.materialVariation.antiTiling ??= {};
                    layer.roof.materialVariation.antiTiling.offsetV = next;
                    roofAntiOffsetVRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofAntiOffsetVRow.number.addEventListener('change', () => {
                    const next = clamp(roofAntiOffsetVRow.number.value, 0.0, 0.5);
                    layer.roof.materialVariation.antiTiling ??= {};
                    layer.roof.materialVariation.antiTiling.offsetV = next;
                    roofAntiOffsetVRow.range.value = String(next);
                    roofAntiOffsetVRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofAntiRotationRow.range.addEventListener('input', () => {
                    const next = clamp(roofAntiRotationRow.range.value, 0.0, 180.0);
                    layer.roof.materialVariation.antiTiling ??= {};
                    layer.roof.materialVariation.antiTiling.rotationDegrees = next;
                    roofAntiRotationRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });
                roofAntiRotationRow.number.addEventListener('change', () => {
                    const next = clamp(roofAntiRotationRow.number.value, 0.0, 180.0);
                    layer.roof.materialVariation.antiTiling ??= {};
                    layer.roof.materialVariation.antiTiling.rotationDegrees = next;
                    roofAntiRotationRow.range.value = String(next);
                    roofAntiRotationRow.number.value = String(Math.round(next));
                    this._notifySelectedLayersChanged();
                });

                roofAntiQualityToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.antiTiling ??= {};
                    layer.roof.materialVariation.antiTiling.mode = roofAntiQualityToggle.input.checked ? 'quality' : 'fast';
                    this._notifySelectedLayersChanged();
                });

                roofDetailToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.detail ??= {};
                    layer.roof.materialVariation.detail.enabled = !!roofDetailToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofDetailStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofDetailStrengthRow.range.value, 0.0, 1.0);
                    layer.roof.materialVariation.detail ??= {};
                    layer.roof.materialVariation.detail.strength = next;
                    roofDetailStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofDetailStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofDetailStrengthRow.number.value, 0.0, 1.0);
                    layer.roof.materialVariation.detail ??= {};
                    layer.roof.materialVariation.detail.strength = next;
                    roofDetailStrengthRow.range.value = String(next);
                    roofDetailStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                roofCracksToggle.input.addEventListener('change', () => {
                    layer.roof.materialVariation.cracks ??= {};
                    layer.roof.materialVariation.cracks.enabled = !!roofCracksToggle.input.checked;
                    syncRoofMatVarEnabled();
                    this._notifySelectedLayersChanged();
                });
                roofCrackStrengthRow.range.addEventListener('input', () => {
                    const next = clamp(roofCrackStrengthRow.range.value, 0.0, 1.0);
                    layer.roof.materialVariation.cracks ??= {};
                    layer.roof.materialVariation.cracks.strength = next;
                    roofCrackStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });
                roofCrackStrengthRow.number.addEventListener('change', () => {
                    const next = clamp(roofCrackStrengthRow.number.value, 0.0, 1.0);
                    layer.roof.materialVariation.cracks ??= {};
                    layer.roof.materialVariation.cracks.strength = next;
                    roofCrackStrengthRow.range.value = String(next);
                    roofCrackStrengthRow.number.value = formatFloat(next, 2);
                    this._notifySelectedLayersChanged();
                });

                syncRoofMatVarEnabled();
                const roofMatVarHint = document.createElement('div');
                roofMatVarHint.className = 'building-fab-hint';
                roofMatVarHint.textContent = 'Enable the variation system to add weathering and breakup.';
                layerSection.body.appendChild(roofMatVarHint);

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
