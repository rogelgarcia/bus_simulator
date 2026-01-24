// src/graphics/gui/building_fabrication/BuildingFabricationUI.js
// Builds the HUD controls for the building fabrication scene.
import { getBuildingStyleOptions } from '../../assets3d/generators/buildings/BuildingGenerator.js';
import { BUILDING_STYLE, isBuildingStyle } from '../../../app/buildings/BuildingStyle.js';
import { WINDOW_STYLE, isWindowStyle } from '../../../app/buildings/WindowStyle.js';
import { BELT_COURSE_COLOR, getBeltCourseColorOptions, isBeltCourseColor } from '../../../app/buildings/BeltCourseColor.js';
import { ROOF_COLOR, getRoofColorOptions, isRoofColor } from '../../../app/buildings/RoofColor.js';
import { PickerPopup } from '../shared/PickerPopup.js';
import { applyMaterialSymbolToButton } from '../shared/materialSymbols.js';
import { WINDOW_TYPE, getDefaultWindowParams, isWindowTypeId } from '../../assets3d/generators/buildings/WindowTextureGenerator.js';
import { normalizeWindowParams, normalizeWindowTypeIdOrLegacyStyle } from '../../assets3d/generators/buildings/WindowTypeCompatibility.js';
import { getPbrMaterialOptionsForBuildings } from '../../assets3d/materials/PbrMaterialCatalog.js';
import { LAYER_TYPE, cloneBuildingLayers, createDefaultFloorLayer, createDefaultRoofLayer, normalizeBuildingLayers } from '../../assets3d/generators/building_fabrication/BuildingFabricationTypes.js';
import { getBuildingConfigs } from '../../content3d/catalogs/BuildingConfigCatalog.js';
import { createTextureTilingMiniController } from './mini_controllers/TextureTilingMiniController.js';
import { createMaterialPickerRowController } from './mini_controllers/MaterialPickerRowController.js';
import { createMaterialVariationUIController } from './MaterialVariationUIController.js';
import { createWindowUIController } from './WindowUIController.js';
import { createWallsUIController } from './WallsUIController.js';

const _warnedThumbUrls = new Set();

function isDevHost() {
    if (typeof window === 'undefined') return false;
    const host = String(window.location.hostname || '').toLowerCase();
    const protocol = String(window.location.protocol || '').toLowerCase();
    if (protocol === 'file:') return true;
    if (!host) return true;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true;
    if (host.endsWith('.localhost')) return true;

    const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return false;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
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
    thumb.classList.remove('has-image');

    if (typeof url === 'string' && url) {
        const img = document.createElement('img');
        img.className = 'building-fab-material-thumb-img';
        img.alt = label || '';
        img.loading = 'lazy';
        img.addEventListener('error', () => {
            const failedUrl = img.currentSrc || url;
            if (isDevHost() && failedUrl && !_warnedThumbUrls.has(failedUrl)) {
                _warnedThumbUrls.add(failedUrl);
                console.warn(`[BuildingFabricationUI] Thumbnail failed to load: ${failedUrl}`);
            }
            thumb.classList.remove('has-image');
            thumb.textContent = label || '';
            thumb.style.color = '#e9f2ff';
        }, { once: true });
        img.src = url;
        thumb.classList.add('has-image');
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
        this._pickerRowControllers = [];
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

        const makeMaterialPickerRow = (labelText, { status = false, onPick = null } = {}) => {
            const ctrl = createMaterialPickerRowController({ label: labelText, status, onPick });
            this._pickerRowControllers.push(ctrl);
            return ctrl;
        };

        const styleRow = makeMaterialPickerRow('Style', { status: true, onPick: () => this._openBuildingStylePicker() });
        this.styleRow = styleRow.row;
        this.styleLabel = styleRow.label;
        this.stylePicker = styleRow.picker;
        this.stylePickButton = styleRow.button;
        this.stylePickThumb = styleRow.thumb;
        this.stylePickText = styleRow.text;
        this.styleStatus = styleRow.status;

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

        const streetStyleRow = makeMaterialPickerRow('Street style', { status: true, onPick: () => this._openStreetStylePicker() });
        this.streetStyleRow = streetStyleRow.row;
        this.streetStyleLabel = streetStyleRow.label;
        this.streetStylePicker = streetStyleRow.picker;
        this.streetStylePickButton = streetStyleRow.button;
        this.streetStylePickThumb = streetStyleRow.thumb;
        this.streetStylePickText = streetStyleRow.text;
        this.streetStyleStatus = streetStyleRow.status;

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

        const beltColorRow = makeMaterialPickerRow('Belt color', { status: true, onPick: () => this._openBeltCourseColorPicker() });
        this.beltColorRow = beltColorRow.row;
        this.beltColorLabel = beltColorRow.label;
        this.beltColorPicker = beltColorRow.picker;
        this.beltColorPickButton = beltColorRow.button;
        this.beltColorPickThumb = beltColorRow.thumb;
        this.beltColorPickText = beltColorRow.text;
        this.beltColorStatus = beltColorRow.status;

        const topBeltColorRow = makeMaterialPickerRow('Roof belt color', { status: true, onPick: () => this._openTopBeltColorPicker() });
        this.topBeltColorRow = topBeltColorRow.row;
        this.topBeltColorLabel = topBeltColorRow.label;
        this.topBeltColorPicker = topBeltColorRow.picker;
        this.topBeltColorPickButton = topBeltColorRow.button;
        this.topBeltColorPickThumb = topBeltColorRow.thumb;
        this.topBeltColorPickText = topBeltColorRow.text;
        this.topBeltColorStatus = topBeltColorRow.status;

        const roofColorRow = makeMaterialPickerRow('Roof color', { status: true, onPick: () => this._openRoofColorPicker() });
        this.roofColorRow = roofColorRow.row;
        this.roofColorLabel = roofColorRow.label;
        this.roofColorPicker = roofColorRow.picker;
        this.roofColorPickButton = roofColorRow.button;
        this.roofColorPickThumb = roofColorRow.thumb;
        this.roofColorPickText = roofColorRow.text;
        this.roofColorStatus = roofColorRow.status;

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

        this._materialVariationUI = createMaterialVariationUIController({
            detailsOpenByKey: this._detailsOpenByKey,
            getAllow: () => this._enabled,
            getHasSelected: () => !!this._selectedBuildingId,
            getSeed: () => this._getActiveMaterialVariationSeed(),
            setSeed: (seed) => this._setActiveMaterialVariationSeed(seed),
            notifySeedChanged: () => this._notifySelectedMaterialVariationSeedChanged(),
            onDebugChanged: (cfg) => this.onMaterialVariationDebugChange?.({ ...cfg })
        });

        this._windowUI = createWindowUIController({
            pickerPopup: this._pickerPopup,
            detailsOpenByKey: this._detailsOpenByKey,
            clamp,
            clampInt,
            formatFloat,
            setMaterialThumbToTexture,
            setMaterialThumbToColor,
            getWindowTypeId: () => this._windowTypeId,
            setWindowTypeId: (typeId) => { this._windowTypeId = typeId; },
            getWindowParams: () => this._windowParams,
            setWindowParams: (params) => { this._windowParams = params; },
            getWindowWidth: () => this._windowWidth,
            setWindowWidth: (v) => { this._windowWidth = v; },
            getWindowGap: () => this._windowGap,
            setWindowGap: (v) => { this._windowGap = v; },
            getWindowHeight: () => this._windowHeight,
            setWindowHeight: (v) => { this._windowHeight = v; },
            getWindowY: () => this._windowY,
            setWindowY: (v) => { this._windowY = v; },
            getWindowSpacerEnabled: () => this._windowSpacerEnabled,
            setWindowSpacerEnabled: (v) => { this._windowSpacerEnabled = v; },
            getWindowSpacerEvery: () => this._windowSpacerEvery,
            setWindowSpacerEvery: (v) => { this._windowSpacerEvery = v; },
            getWindowSpacerWidth: () => this._windowSpacerWidth,
            setWindowSpacerWidth: (v) => { this._windowSpacerWidth = v; },
            getWindowSpacerExtrude: () => this._windowSpacerExtrude,
            setWindowSpacerExtrude: (v) => { this._windowSpacerExtrude = v; },
            getWindowSpacerExtrudeDistance: () => this._windowSpacerExtrudeDistance,
            setWindowSpacerExtrudeDistance: (v) => { this._windowSpacerExtrudeDistance = v; },
            getStreetWindowTypeId: () => this._streetWindowTypeId,
            setStreetWindowTypeId: (typeId) => { this._streetWindowTypeId = typeId; },
            getStreetWindowParams: () => this._streetWindowParams,
            setStreetWindowParams: (params) => { this._streetWindowParams = params; },
            getStreetWindowWidth: () => this._streetWindowWidth,
            setStreetWindowWidth: (v) => { this._streetWindowWidth = v; },
            getStreetWindowGap: () => this._streetWindowGap,
            setStreetWindowGap: (v) => { this._streetWindowGap = v; },
            getStreetWindowHeight: () => this._streetWindowHeight,
            setStreetWindowHeight: (v) => { this._streetWindowHeight = v; },
            getStreetWindowY: () => this._streetWindowY,
            setStreetWindowY: (v) => { this._streetWindowY = v; },
            getStreetWindowSpacerEnabled: () => this._streetWindowSpacerEnabled,
            setStreetWindowSpacerEnabled: (v) => { this._streetWindowSpacerEnabled = v; },
            getStreetWindowSpacerEvery: () => this._streetWindowSpacerEvery,
            setStreetWindowSpacerEvery: (v) => { this._streetWindowSpacerEvery = v; },
            getStreetWindowSpacerWidth: () => this._streetWindowSpacerWidth,
            setStreetWindowSpacerWidth: (v) => { this._streetWindowSpacerWidth = v; },
            getStreetWindowSpacerExtrude: () => this._streetWindowSpacerExtrude,
            setStreetWindowSpacerExtrude: (v) => { this._streetWindowSpacerExtrude = v; },
            getStreetWindowSpacerExtrudeDistance: () => this._streetWindowSpacerExtrudeDistance,
            setStreetWindowSpacerExtrudeDistance: (v) => { this._streetWindowSpacerExtrudeDistance = v; },
            requestSync: () => this._syncPropertyWidgets(),
            onWindowStyleChange: (v) => this.onWindowStyleChange?.(v),
            onWindowFrameWidthChange: (v) => this.onWindowFrameWidthChange?.(v),
            onWindowFrameColorChange: (v) => this.onWindowFrameColorChange?.(v),
            onWindowGlassTopChange: (v) => this.onWindowGlassTopChange?.(v),
            onWindowGlassBottomChange: (v) => this.onWindowGlassBottomChange?.(v),
            onWindowWidthChange: (v) => this.onWindowWidthChange?.(v),
            onWindowGapChange: (v) => this.onWindowGapChange?.(v),
            onWindowHeightChange: (v) => this.onWindowHeightChange?.(v),
            onWindowYChange: (v) => this.onWindowYChange?.(v),
            onWindowSpacerEnabledChange: (v) => this.onWindowSpacerEnabledChange?.(v),
            onWindowSpacerEveryChange: (v) => this.onWindowSpacerEveryChange?.(v),
            onWindowSpacerWidthChange: (v) => this.onWindowSpacerWidthChange?.(v),
            onWindowSpacerExtrudeChange: (v) => this.onWindowSpacerExtrudeChange?.(v),
            onWindowSpacerExtrudeDistanceChange: (v) => this.onWindowSpacerExtrudeDistanceChange?.(v),
            onStreetWindowStyleChange: (v) => this.onStreetWindowStyleChange?.(v),
            onStreetWindowFrameWidthChange: (v) => this.onStreetWindowFrameWidthChange?.(v),
            onStreetWindowFrameColorChange: (v) => this.onStreetWindowFrameColorChange?.(v),
            onStreetWindowGlassTopChange: (v) => this.onStreetWindowGlassTopChange?.(v),
            onStreetWindowGlassBottomChange: (v) => this.onStreetWindowGlassBottomChange?.(v),
            onStreetWindowWidthChange: (v) => this.onStreetWindowWidthChange?.(v),
            onStreetWindowGapChange: (v) => this.onStreetWindowGapChange?.(v),
            onStreetWindowHeightChange: (v) => this.onStreetWindowHeightChange?.(v),
            onStreetWindowYChange: (v) => this.onStreetWindowYChange?.(v),
            onStreetWindowSpacerEnabledChange: (v) => this.onStreetWindowSpacerEnabledChange?.(v),
            onStreetWindowSpacerEveryChange: (v) => this.onStreetWindowSpacerEveryChange?.(v),
            onStreetWindowSpacerWidthChange: (v) => this.onStreetWindowSpacerWidthChange?.(v),
            onStreetWindowSpacerExtrudeChange: (v) => this.onStreetWindowSpacerExtrudeChange?.(v),
            onStreetWindowSpacerExtrudeDistanceChange: (v) => this.onStreetWindowSpacerExtrudeDistanceChange?.(v)
        });

        this._wallsUI = createWallsUIController({
            detailsOpenByKey: this._detailsOpenByKey,
            clamp,
            formatFloat,
            setMaterialThumbToTexture,
            setMaterialThumbToColor,
            getWallInset: () => this._wallInset,
            setWallInset: (v) => { this._wallInset = v; },
            onWallInsetChange: (v) => this.onWallInsetChange?.(v),
            appendWallMaterialVariationUI: (args) => this._materialVariationUI.appendWallMaterialVariationUI(args),
            requestReRenderLayersPanel: () => this._renderLayersPanel(),
            registerLayerMiniController: (ctrl) => this._layerMiniControllers.push(ctrl)
        });

        this.layersList = document.createElement('div');
        this.layersList.className = 'building-fab-layer-list';

        this.propsPanel.appendChild(this.layersStatus);
        this._materialVariationUI.mount(this.propsPanel);
        this.propsPanel.appendChild(this.layersList);

        const floorsSection = makeDetailsSection('Floors', { open: true });
        floorsSection.body.appendChild(this.styleRow);
        this._windowUI.mountFloorsWindowStyle(floorsSection.body);
        floorsSection.body.appendChild(this.floorRow);
        floorsSection.body.appendChild(this.floorHeightRow);
        this._wallsUI.mountWallInset(floorsSection.body);
        this._windowUI.mountFloorsWindowControls(floorsSection.body);

        const streetSection = makeDetailsSection('Street floors', { open: true });
        streetSection.summary.appendChild(this.streetEnabledToggle);
        this.streetEnabledToggle.addEventListener('click', (e) => e.stopPropagation());
        this.streetEnabledInput.addEventListener('click', (e) => e.stopPropagation());

        streetSection.body.appendChild(this.streetStyleRow);
        this._windowUI.mountStreetWindowStyle(streetSection.body);
        streetSection.body.appendChild(this.streetFloorsRow);
        streetSection.body.appendChild(this.streetHeightRow);
        this._windowUI.mountStreetWindowControls(streetSection.body);
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
        this._onRoofColorPickClick = () => this._openRoofColorPicker();
        this._onTopBeltColorPickClick = () => this._openTopBeltColorPicker();
        this._onTypeSelectChange = () => this._setBuildingTypeFromUi(this.typeSelect.value);
        this._onStylePickClick = () => this._openBuildingStylePicker();
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
        this._windowUI?.dispose?.();
        this._wallsUI?.dispose?.();
        for (const ctrl of this._pickerRowControllers) ctrl?.destroy?.();
        this._pickerRowControllers.length = 0;
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
        return this._materialVariationUI?.getDebugConfig?.() ?? {};
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
        const notifySelectedLayersChanged = this._notifySelectedLayersChanged.bind(this);

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

                const wallsGroup = this._wallsUI.appendLayerWallsUI({
                    allow,
                    scopeKey,
                    layerId,
                    layer,
                    openMaterialPicker,
                    textureMaterialOptions: wallTextureMaterialOptions,
                    colorMaterialOptions: beltColorMaterialOptions,
                    getWallTextureOption,
                    getWallColorOption: getBeltColorOption,
                    onChange: notifySelectedLayersChanged
                });

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

                const { windowsGroup, columnsGroup } = this._windowUI.appendLayerWindowsUI({
                    parent: null,
                    allow,
                    scopeKey,
                    layerId,
                    layer,
                    openMaterialPicker,
                    textureMaterialOptions,
                    beltColorMaterialOptions,
                    getStyleOption,
                    getBeltColorOption,
                    onChange: notifySelectedLayersChanged
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
                    onChange: notifySelectedLayersChanged
                });
                roofTilingController.mount(layerSection.body);
                this._layerMiniControllers.push(roofTilingController);

                this._materialVariationUI.appendRoofMaterialVariationUI({
                    parent: layerSection.body,
                    allow,
                    scopeKey,
                    layerId,
                    layer,
                    onChange: notifySelectedLayersChanged,
                    onReRender: () => this._renderLayersPanel(),
                    registerMiniController: (ctrl) => this._layerMiniControllers.push(ctrl)
                });

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
        const allowBelt = allow && this._streetFloors < this._floorCount;
        const allowTopBelt = allow && this._topBeltEnabled;
        this._syncLayersPanel();
        this._materialVariationUI?.sync?.();
        this._windowUI?.sync?.({ hasSelected, allow, allowStreetWindows });
        this._wallsUI?.syncGlobal?.({ hasSelected, allow });

        this.deleteBuildingBtn.disabled = !allow;
        if (this.exportBuildingBtn) this.exportBuildingBtn.disabled = !this._enabled;
        if (this.loadCatalogSelect) this.loadCatalogSelect.disabled = !this._enabled;
        if (this.loadCatalogBtn) this.loadCatalogBtn.disabled = !this._enabled || !this._catalogBuildingConfigId;
        this.typeSelect.disabled = !allow;
        this._syncBuildingStyleButtons({ allow });
        this.floorRange.disabled = !allow;
        this.floorNumber.disabled = !allow;
        this.floorHeightRange.disabled = !allow;
        this.floorHeightNumber.disabled = !allow;
        this.streetEnabledInput.disabled = !allow;
        this.streetFloorsRange.disabled = !allowStreetFloors;
        this.streetFloorsNumber.disabled = !allowStreetFloors;
        this.streetHeightRange.disabled = !allowStreetStyle;
        this.streetHeightNumber.disabled = !allowStreetStyle;
        this._syncStreetStyleButtons({ allow: allowStreetStyle });
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

        this.topBeltInput.checked = this._topBeltEnabled;
        this._syncTopBeltColorButtons({ allow: allowTopBelt });
        this.topBeltWidthRange.value = String(this._topBeltWidth);
        this.topBeltWidthNumber.value = formatFloat(this._topBeltWidth, 1);
        this.topBeltInnerWidthRange.value = String(this._topBeltInnerWidth);
        this.topBeltInnerWidthNumber.value = formatFloat(this._topBeltInnerWidth, 1);
        this.topBeltHeightRange.value = String(this._topBeltHeight);
        this.topBeltHeightNumber.value = formatFloat(this._topBeltHeight, 2);
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

    _handleBuildingStyleGridClick(e) {
        const btn = e?.target?.closest?.('.building-fab-texture-option');
        if (!btn || !this.styleGrid?.contains(btn)) return;
        if (btn.disabled) return;
        const raw = btn.dataset?.styleId ?? '';
        this._setBuildingStyleFromUi(raw);
    }

    _handleStreetStyleGridClick(e) {
        const btn = e?.target?.closest?.('.building-fab-texture-option');
        if (!btn || !this.streetStyleGrid?.contains(btn)) return;
        if (btn.disabled) return;
        const raw = btn.dataset?.styleId ?? '';
        this._setStreetStyleFromUi(raw);
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
        this.streetEnabledInput.addEventListener('change', this._onStreetEnabledChange);
        this.streetFloorsRange.addEventListener('input', this._onStreetFloorsRangeInput);
        this.streetFloorsNumber.addEventListener('input', this._onStreetFloorsNumberInput);
        this.streetHeightRange.addEventListener('input', this._onStreetHeightRangeInput);
        this.streetHeightNumber.addEventListener('input', this._onStreetHeightNumberInput);
        this.beltCourseInput.addEventListener('change', this._onBeltCourseEnabledChange);
        this.beltMarginRange.addEventListener('input', this._onBeltMarginRangeInput);
        this.beltMarginNumber.addEventListener('input', this._onBeltMarginNumberInput);
        this.beltHeightRange.addEventListener('input', this._onBeltHeightRangeInput);
        this.beltHeightNumber.addEventListener('input', this._onBeltHeightNumberInput);
        this.topBeltInput.addEventListener('change', this._onTopBeltEnabledChange);
        this.topBeltWidthRange.addEventListener('input', this._onTopBeltWidthRangeInput);
        this.topBeltWidthNumber.addEventListener('input', this._onTopBeltWidthNumberInput);
        this.topBeltInnerWidthRange.addEventListener('input', this._onTopBeltInnerWidthRangeInput);
        this.topBeltInnerWidthNumber.addEventListener('input', this._onTopBeltInnerWidthNumberInput);
        this.topBeltHeightRange.addEventListener('input', this._onTopBeltHeightRangeInput);
        this.topBeltHeightNumber.addEventListener('input', this._onTopBeltHeightNumberInput);
        this._wallsUI?.bind?.();
        this._windowUI?.bind?.();
        this.typeSelect.addEventListener('change', this._onTypeSelectChange);
        this.loadCatalogSelect.addEventListener('change', this._onLoadCatalogSelectChange);
        this.loadCatalogBtn.addEventListener('click', this._onLoadCatalogBtnClick);
        this._materialVariationUI?.bind?.();
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
        this._wallsUI?.unbind?.();
        this.roofColorPickButton.removeEventListener('click', this._onRoofColorPickClick);
        this._windowUI?.unbind?.();
        this.typeSelect.removeEventListener('change', this._onTypeSelectChange);
        this.loadCatalogSelect.removeEventListener('change', this._onLoadCatalogSelectChange);
        this.loadCatalogBtn.removeEventListener('click', this._onLoadCatalogBtnClick);
        this.stylePickButton.removeEventListener('click', this._onStylePickClick);
        this._materialVariationUI?.unbind?.();
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
