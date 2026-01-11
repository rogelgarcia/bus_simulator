// src/graphics/gui/building_fabrication/BuildingFabricationUI.js
// Builds the HUD controls for the building fabrication scene.
import { getBuildingStyleOptions } from '../../assets3d/generators/buildings/BuildingGenerator.js';
import { BUILDING_STYLE, isBuildingStyle } from '../../../app/buildings/BuildingStyle.js';
import { WINDOW_STYLE, isWindowStyle } from '../../../app/buildings/WindowStyle.js';
import { BELT_COURSE_COLOR, getBeltCourseColorOptions, isBeltCourseColor } from '../../../app/buildings/BeltCourseColor.js';
import { ROOF_COLOR, getRoofColorOptions, isRoofColor } from '../../../app/buildings/RoofColor.js';
import { PickerPopup } from '../shared/PickerPopup.js';
import { WINDOW_TYPE, getDefaultWindowParams, getWindowTypeOptions, isWindowTypeId } from '../../assets3d/generators/buildings/WindowTextureGenerator.js';

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

        this.propsHint = document.createElement('div');
        this.propsHint.className = 'building-fab-hint';
        this.propsHint.textContent = 'Select a building to edit its properties.';

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

        this.deleteBuildingBtn = document.createElement('button');
        this.deleteBuildingBtn.type = 'button';
        this.deleteBuildingBtn.className = 'building-fab-btn building-fab-btn-danger';
        this.deleteBuildingBtn.textContent = 'Delete selected building';
        this.deleteBuildingBtn.disabled = true;

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
        this.propsPanel.appendChild(this.propsHint);
        this.propsPanel.appendChild(this.nameRow);
        this.propsPanel.appendChild(this.typeRow);
        this.propsPanel.appendChild(this.deleteBuildingBtn);

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
            return { details, summary, body };
        };

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
            if (isWindowTypeId(typeId)) {
                this._windowTypeId = typeId;
            } else if (isWindowStyle(legacy)) {
                this._windowTypeId = legacy === WINDOW_STYLE.DARK
                    ? WINDOW_TYPE.STYLE_DARK
                    : legacy === WINDOW_STYLE.BLUE
                        ? WINDOW_TYPE.STYLE_BLUE
                        : legacy === WINDOW_STYLE.WARM
                            ? WINDOW_TYPE.STYLE_WARM
                            : legacy === WINDOW_STYLE.GRID
                                ? WINDOW_TYPE.STYLE_GRID
                                : WINDOW_TYPE.STYLE_DEFAULT;
            } else {
                this._windowTypeId = WINDOW_TYPE.STYLE_DEFAULT;
            }
            const p = building?.windowParams && typeof building.windowParams === 'object' ? building.windowParams : null;
            this._windowParams = { ...getDefaultWindowParams(this._windowTypeId), ...(p ?? {}) };
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
                this._streetWindowTypeId = legacy === WINDOW_STYLE.DARK
                    ? WINDOW_TYPE.STYLE_DARK
                    : legacy === WINDOW_STYLE.BLUE
                        ? WINDOW_TYPE.STYLE_BLUE
                        : legacy === WINDOW_STYLE.WARM
                            ? WINDOW_TYPE.STYLE_WARM
                            : legacy === WINDOW_STYLE.GRID
                                ? WINDOW_TYPE.STYLE_GRID
                                : WINDOW_TYPE.STYLE_DEFAULT;
            } else if (isWindowStyle(fallbackLegacy)) {
                this._streetWindowTypeId = fallbackLegacy === WINDOW_STYLE.DARK
                    ? WINDOW_TYPE.STYLE_DARK
                    : fallbackLegacy === WINDOW_STYLE.BLUE
                        ? WINDOW_TYPE.STYLE_BLUE
                        : fallbackLegacy === WINDOW_STYLE.WARM
                            ? WINDOW_TYPE.STYLE_WARM
                            : fallbackLegacy === WINDOW_STYLE.GRID
                                ? WINDOW_TYPE.STYLE_GRID
                                : WINDOW_TYPE.STYLE_DEFAULT;
            } else {
                this._streetWindowTypeId = this._windowTypeId;
            }
            const p = building?.streetWindowParams && typeof building.streetWindowParams === 'object' ? building.streetWindowParams : null;
            this._streetWindowParams = { ...getDefaultWindowParams(this._streetWindowTypeId), ...(p ?? {}) };
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
        this._syncPropertyWidgets();
        this._syncHint();
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

        if (this.windowFrameWidthRow) this.windowFrameWidthRow.classList.toggle('hidden', !showWindowParams);
        if (this.windowFrameColorRow) this.windowFrameColorRow.classList.toggle('hidden', !showWindowParams);
        if (this.windowGlassTopRow) this.windowGlassTopRow.classList.toggle('hidden', !showWindowParams);
        if (this.windowGlassBottomRow) this.windowGlassBottomRow.classList.toggle('hidden', !showWindowParams);
        if (this.streetWindowFrameWidthRow) this.streetWindowFrameWidthRow.classList.toggle('hidden', !showStreetWindowParams);
        if (this.streetWindowFrameColorRow) this.streetWindowFrameColorRow.classList.toggle('hidden', !showStreetWindowParams);
        if (this.streetWindowGlassTopRow) this.streetWindowGlassTopRow.classList.toggle('hidden', !showStreetWindowParams);
        if (this.streetWindowGlassBottomRow) this.streetWindowGlassBottomRow.classList.toggle('hidden', !showStreetWindowParams);

        this.deleteBuildingBtn.disabled = !allow;
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
        const typeId = isWindowTypeId(raw)
            ? raw
            : (isWindowStyle(raw) ? (raw === WINDOW_STYLE.DARK
                ? WINDOW_TYPE.STYLE_DARK
                : raw === WINDOW_STYLE.BLUE
                    ? WINDOW_TYPE.STYLE_BLUE
                    : raw === WINDOW_STYLE.WARM
                        ? WINDOW_TYPE.STYLE_WARM
                        : raw === WINDOW_STYLE.GRID
                            ? WINDOW_TYPE.STYLE_GRID
                            : WINDOW_TYPE.STYLE_DEFAULT) : WINDOW_TYPE.STYLE_DEFAULT);
        const changed = typeId !== this._windowTypeId;
        this._windowTypeId = typeId;
        this._windowParams = getDefaultWindowParams(typeId);
        this._syncWindowStyleButtons({ allow: true });
        this._syncPropertyWidgets();
        if (changed) this.onWindowStyleChange?.(typeId);
    }

    _setStreetWindowStyleFromUi(raw) {
        const typeId = isWindowTypeId(raw)
            ? raw
            : (isWindowStyle(raw) ? (raw === WINDOW_STYLE.DARK
                ? WINDOW_TYPE.STYLE_DARK
                : raw === WINDOW_STYLE.BLUE
                    ? WINDOW_TYPE.STYLE_BLUE
                    : raw === WINDOW_STYLE.WARM
                        ? WINDOW_TYPE.STYLE_WARM
                        : raw === WINDOW_STYLE.GRID
                            ? WINDOW_TYPE.STYLE_GRID
                            : WINDOW_TYPE.STYLE_DEFAULT) : WINDOW_TYPE.STYLE_DEFAULT);
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

        this.propsHint.textContent = this._selectedBuildingId
            ? ''
            : 'Select a building to edit its properties.';

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
        this.stylePickButton.addEventListener('click', this._onStylePickClick);
        this.hideSelectionBorderInput.addEventListener('change', this._onHideSelectionBorderChange);
        this.viewModeRow.addEventListener('click', this._onViewModeClick);
        this.addRoadBtn.addEventListener('click', this._onAddRoad);
        this.startBuildingBtn.addEventListener('click', this._onStartBuilding);
        this.cancelModeBtn.addEventListener('click', this._onCancelMode);
        this.buildBtn.addEventListener('click', this._onBuild);
        this.clearSelBtn.addEventListener('click', this._onClearSelection);
        this.deleteBuildingBtn.addEventListener('click', this._onDeleteSelectedBuilding);
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
        this.stylePickButton.removeEventListener('click', this._onStylePickClick);
        this.hideSelectionBorderInput.removeEventListener('change', this._onHideSelectionBorderChange);
        this.viewModeRow.removeEventListener('click', this._onViewModeClick);
        this.addRoadBtn.removeEventListener('click', this._onAddRoad);
        this.startBuildingBtn.removeEventListener('click', this._onStartBuilding);
        this.cancelModeBtn.removeEventListener('click', this._onCancelMode);
        this.buildBtn.removeEventListener('click', this._onBuild);
        this.clearSelBtn.removeEventListener('click', this._onClearSelection);
        this.deleteBuildingBtn.removeEventListener('click', this._onDeleteSelectedBuilding);
        this.resetBtn.removeEventListener('click', this._onReset);
        this.roadDoneBtn.removeEventListener('click', this._onRoadDone);
        this.resetOverlay.removeEventListener('click', this._onResetOverlayClick);
        this.resetCancelBtn.removeEventListener('click', this._onResetCancel);
        this.resetConfirmBtn.removeEventListener('click', this._onResetConfirm);
        this.resetGridNumber.removeEventListener('keydown', this._onResetGridKeyDown);
    }
}
