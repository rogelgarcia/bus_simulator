// src/graphics/gui/building_fabrication/BuildingFabricationView.js
// Orchestrates UI, input, and 3D rendering for building fabrication.
import * as THREE from 'three';
import { BuildingFabricationScene } from './BuildingFabricationScene.js';
import { BuildingFabricationUI } from './BuildingFabricationUI.js';
import {
    buildingConfigIdToFileBaseName,
    createCityBuildingConfigFromFabrication,
    sanitizeBuildingConfigId,
    sanitizeBuildingConfigName,
    serializeCityBuildingConfigToEsModule
} from '../../../app/city/buildings/BuildingConfigExport.js';

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

export class BuildingFabricationView {
    constructor(engine) {
        this.engine = engine;
        this.canvas = engine.canvas;

        this.scene = new BuildingFabricationScene(engine);
        this.ui = new BuildingFabricationUI();

        this._raycaster = new THREE.Raycaster();
        this._pointer = new THREE.Vector2();
        this._hoveredTile = null;
        this._pointerDown = null;
        this._pointerMoved = false;
        this._keyState = new Map();
        this._moveDir = new THREE.Vector3();
        this._moveForward = new THREE.Vector3();
        this._moveRight = new THREE.Vector3();

        this._onPointerMove = (e) => this._handlePointerMove(e);
        this._onPointerDown = (e) => this._handlePointerDown(e);
        this._onPointerUp = (e) => this._handlePointerUp(e);
        this._onPointerLeave = () => this._handlePointerLeave();
        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onKeyUp = (e) => this._handleKeyUp(e);
    }

    enter() {
        this.scene.enter();
        this.ui.mount();
        this.scene.setUiRoot(this.ui.root);

        this.ui.setGridSize(this.scene.getGridSize());
        this.ui.setFloorHeight(this.scene.getFloorHeight());
        this.ui.setWireframeEnabled(false);
        this.ui.setFloorDivisionsEnabled(false);
        this.ui.setFloorplanEnabled(false);
        this.ui.setRoadModeEnabled(false);
        this.ui.setBuildingModeEnabled(false);
        this.ui.setSelectedBuilding(null);
        this._syncUiCounts();
        this._syncRoadList();
        this._syncBuildings();

        this.ui.onBuildingModeChange = (enabled) => {
            this.scene.setBuildingModeEnabled(enabled);
            this.ui.setBuildingModeEnabled(this.scene.getBuildingModeEnabled());
            this.ui.setRoadModeEnabled(this.scene.getRoadModeEnabled());
            this._syncUiCounts();
            this._syncBuildings();
        };

        this.ui.onBuildBuildings = () => {
            this.scene.createBuildingsFromSelection({
                floors: this.ui.getFloorCount(),
                floorHeight: this.ui.getFloorHeight(),
                layers: this.ui.getTemplateLayers(),
                materialVariationSeed: this.ui.getTemplateMaterialVariationSeed(),
                windowVisuals: this.ui.getTemplateWindowVisuals()
            });
            this.ui.setBuildingModeEnabled(this.scene.getBuildingModeEnabled());
            this._syncUiCounts();
            this._syncBuildings();
        };

        this.ui.onClearSelection = () => {
            this.scene.clearSelection();
            this._syncUiCounts();
        };

        this.ui.onSelectBuilding = (buildingId) => {
            this.scene.setSelectedBuildingId(buildingId);
            const selected = this.scene.getSelectedBuilding();
            this.ui.setSelectedBuilding(selected);
            if (selected) this.ui.setFloorCount(selected.floors);
            this._syncBuildings();
        };

        this.ui.onDeleteSelectedBuilding = () => {
            if (this.scene.removeSelectedBuilding()) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncUiCounts();
                this._syncBuildings();
            }
        };

        this.ui.onLoadBuildingConfigFromCatalog = (configId) => {
            const created = this.scene.loadBuildingConfigFromCatalog(configId);
            if (!created) return;
            this.ui.setRoadModeEnabled(this.scene.getRoadModeEnabled());
            this.ui.setBuildingModeEnabled(this.scene.getBuildingModeEnabled());
            this._syncUiCounts();
            this._syncRoadStatus();
            this._syncBuildings();
        };

        this.ui.onReset = (gridSize) => {
            this.scene.resetScene({ gridSize });
            this.ui.setGridSize(this.scene.getGridSize());
            this.ui.setFloorHeight(this.scene.getFloorHeight());
            this.ui.setRoadModeEnabled(this.scene.getRoadModeEnabled());
            this.ui.setBuildingModeEnabled(this.scene.getBuildingModeEnabled());
            this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
            this._syncUiCounts();
            this._syncRoadStatus();
            this._syncRoadList();
            this._syncBuildings();
        };

        this.ui.onRoadModeChange = (enabled) => {
            this.scene.setRoadModeEnabled(enabled);
            this.ui.setRoadModeEnabled(this.scene.getRoadModeEnabled());
            this.ui.setBuildingModeEnabled(this.scene.getBuildingModeEnabled());
            this._syncRoadStatus();
            this._syncUiCounts();
            this._syncBuildings();
        };

        this.ui.onRoadCancel = () => {
            const { startTileId, endTileId } = this.scene.getRoadSelection();
            if (startTileId || endTileId) {
                this.scene.cancelRoadSelection();
                this._syncRoadStatus();
                return;
            }

            this.scene.setRoadModeEnabled(false);
            this.ui.setRoadModeEnabled(this.scene.getRoadModeEnabled());
            this.ui.setBuildingModeEnabled(this.scene.getBuildingModeEnabled());
            this._syncRoadStatus();
            this._syncRoadList();
            this._syncBuildings();
            this._syncUiCounts();
        };

        this.ui.onRoadDone = () => {
            this.scene.setRoadModeEnabled(false);
            this.ui.setRoadModeEnabled(this.scene.getRoadModeEnabled());
            this.ui.setBuildingModeEnabled(this.scene.getBuildingModeEnabled());
            this._syncRoadStatus();
            this._syncRoadList();
            this._syncBuildings();
            this._syncUiCounts();
        };

        this.ui.onRoadRemove = (roadId) => {
            if (this.scene.removeRoad(roadId)) {
                this._syncUiCounts();
                this._syncRoadList();
                this._syncBuildings();
            }
        };

        this.ui.onRoadHover = (roadId) => {
            this.scene.setHoveredRoadId(roadId);
        };

        this.ui.onWireframeChange = (enabled) => {
            this.scene.setShowWireframe(enabled);
        };

        this.ui.onFloorDivisionsChange = (enabled) => {
            this.scene.setShowFloorDivisions(enabled);
        };

        this.ui.onFloorplanChange = (enabled) => {
            this.scene.setShowFloorplan(enabled);
        };

        this.scene.setHideSelectionBorder(this.ui.getHideSelectionBorder());
        this.ui.onHideSelectionBorderChange = (hidden) => {
            this.scene.setHideSelectionBorder(hidden);
        };

        this.ui.onFloorHeightChange = (height) => {
            if (this.scene.setSelectedBuildingFloorHeight(height)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onFloorCountChange = (floors) => {
            if (this.scene.setSelectedBuildingFloors(floors)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onBuildingTypeChange = (type) => {
            if (this.scene.setSelectedBuildingType(type)) {
                this._syncBuildings();
            }
        };

        this.ui.onBuildingStyleChange = (style) => {
            if (this.scene.setSelectedBuildingStyle(style)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onWallInsetChange = (inset) => {
            if (this.scene.setSelectedBuildingWallInset(inset)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onWindowStyleChange = (style) => {
            if (this.scene.setSelectedBuildingWindowStyle(style)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onWindowFrameWidthChange = (value) => {
            if (this.scene.setSelectedBuildingWindowFrameWidth(value)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onWindowFrameColorChange = (hex) => {
            if (this.scene.setSelectedBuildingWindowFrameColor(hex)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onSelectedBuildingLayersChange = (layers) => {
            if (this.scene.setSelectedBuildingLayers(layers)) {
                const selected = this.scene.getSelectedBuilding();
                this.ui.setBuildings(this.scene.getBuildings(), { selectedBuildingId: selected?.id ?? null });
                if (selected) this.ui.setFloorCount(selected.floors);
            }
        };

        this.ui.onSelectedBuildingMaterialVariationSeedChange = (seed) => {
            if (this.scene.setSelectedBuildingMaterialVariationSeed(seed)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onSelectedBuildingWindowVisualsChange = (windowVisuals) => {
            if (this.scene.setSelectedBuildingWindowVisuals(windowVisuals)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.scene.setMaterialVariationDebugConfig(this.ui.getMaterialVariationDebugConfig());
        this.ui.onMaterialVariationDebugChange = (debug) => {
            this.scene.setMaterialVariationDebugConfig(debug);
        };

        this.ui.onExportBuildingConfig = () => {
            const selected = this.scene.getSelectedBuilding();
            const layers = Array.isArray(selected?.layers) && selected.layers.length
                ? selected.layers
                : this.ui.getTemplateLayers();
            if (!Array.isArray(layers) || !layers.length) return;

            const defaultName = selected?.id ?? 'Building config';
            const nameRaw = window.prompt('Export building config name:', defaultName);
            if (nameRaw === null) return;
            const name = sanitizeBuildingConfigName(nameRaw, { fallback: defaultName });

            const suggestedId = sanitizeBuildingConfigId(name);
            const idRaw = window.prompt('Export building config id (used as configId):', suggestedId);
            if (idRaw === null) return;
            const id = sanitizeBuildingConfigId(idRaw, { fallback: suggestedId });

            const wallInset = Number.isFinite(selected?.wallInset) ? selected.wallInset : 0.0;
            const materialVariationSeed = Number.isFinite(selected?.materialVariationSeed)
                ? selected.materialVariationSeed
                : this.ui.getTemplateMaterialVariationSeed();
            const windowVisuals = selected?.windowVisuals ?? this.ui.getTemplateWindowVisuals();
            const cfg = createCityBuildingConfigFromFabrication({ id, name, layers, wallInset, materialVariationSeed, windowVisuals });
            const fileBaseName = buildingConfigIdToFileBaseName(cfg.id);
            const source = serializeCityBuildingConfigToEsModule(cfg, { fileBaseName });

            const blob = new Blob([source], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileBaseName}.js`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 250);
        };

        this.ui.onWindowGlassTopChange = (hex) => {
            if (this.scene.setSelectedBuildingWindowGlassTop(hex)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onWindowGlassBottomChange = (hex) => {
            if (this.scene.setSelectedBuildingWindowGlassBottom(hex)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetEnabledChange = (enabled) => {
            if (this.scene.setSelectedBuildingStreetEnabled(enabled)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetFloorsChange = (count) => {
            if (this.scene.setSelectedBuildingStreetFloors(count)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetFloorHeightChange = (height) => {
            if (this.scene.setSelectedBuildingStreetFloorHeight(height)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetStyleChange = (style) => {
            if (this.scene.setSelectedBuildingStreetStyle(style)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetWindowStyleChange = (style) => {
            if (this.scene.setSelectedBuildingStreetWindowStyle(style)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetWindowFrameWidthChange = (value) => {
            if (this.scene.setSelectedBuildingStreetWindowFrameWidth(value)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetWindowFrameColorChange = (hex) => {
            if (this.scene.setSelectedBuildingStreetWindowFrameColor(hex)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetWindowGlassTopChange = (hex) => {
            if (this.scene.setSelectedBuildingStreetWindowGlassTop(hex)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetWindowGlassBottomChange = (hex) => {
            if (this.scene.setSelectedBuildingStreetWindowGlassBottom(hex)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetWindowWidthChange = (width) => {
            if (this.scene.setSelectedBuildingStreetWindowWidth(width)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetWindowGapChange = (gap) => {
            if (this.scene.setSelectedBuildingStreetWindowGap(gap)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetWindowHeightChange = (height) => {
            if (this.scene.setSelectedBuildingStreetWindowHeight(height)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetWindowYChange = (offset) => {
            if (this.scene.setSelectedBuildingStreetWindowY(offset)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetWindowSpacerEnabledChange = (enabled) => {
            if (this.scene.setSelectedBuildingStreetWindowSpacerEnabled(enabled)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetWindowSpacerEveryChange = (count) => {
            if (this.scene.setSelectedBuildingStreetWindowSpacerEvery(count)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetWindowSpacerWidthChange = (width) => {
            if (this.scene.setSelectedBuildingStreetWindowSpacerWidth(width)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetWindowSpacerExtrudeChange = (enabled) => {
            if (this.scene.setSelectedBuildingStreetWindowSpacerExtrude(enabled)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onStreetWindowSpacerExtrudeDistanceChange = (distance) => {
            if (this.scene.setSelectedBuildingStreetWindowSpacerExtrudeDistance(distance)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onBeltCourseEnabledChange = (enabled) => {
            if (this.scene.setSelectedBuildingBeltCourseEnabled(enabled)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onBeltCourseMarginChange = (margin) => {
            if (this.scene.setSelectedBuildingBeltCourseMargin(margin)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onBeltCourseHeightChange = (height) => {
            if (this.scene.setSelectedBuildingBeltCourseHeight(height)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onBeltCourseColorChange = (color) => {
            if (this.scene.setSelectedBuildingBeltCourseColor(color)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onTopBeltEnabledChange = (enabled) => {
            if (this.scene.setSelectedBuildingTopBeltEnabled(enabled)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onTopBeltColorChange = (color) => {
            if (this.scene.setSelectedBuildingTopBeltColor(color)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onTopBeltWidthChange = (width) => {
            if (this.scene.setSelectedBuildingTopBeltWidth(width)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onTopBeltInnerWidthChange = (width) => {
            if (this.scene.setSelectedBuildingTopBeltInnerWidth(width)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onTopBeltHeightChange = (height) => {
            if (this.scene.setSelectedBuildingTopBeltHeight(height)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onRoofColorChange = (color) => {
            if (this.scene.setSelectedBuildingRoofColor(color)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onWindowWidthChange = (width) => {
            if (this.scene.setSelectedBuildingWindowWidth(width)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onWindowGapChange = (gap) => {
            if (this.scene.setSelectedBuildingWindowGap(gap)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onWindowHeightChange = (height) => {
            if (this.scene.setSelectedBuildingWindowHeight(height)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onWindowYChange = (offset) => {
            if (this.scene.setSelectedBuildingWindowY(offset)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onWindowSpacerEnabledChange = (enabled) => {
            if (this.scene.setSelectedBuildingWindowSpacerEnabled(enabled)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onWindowSpacerEveryChange = (count) => {
            if (this.scene.setSelectedBuildingWindowSpacerEvery(count)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onWindowSpacerWidthChange = (width) => {
            if (this.scene.setSelectedBuildingWindowSpacerWidth(width)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onWindowSpacerExtrudeChange = (enabled) => {
            if (this.scene.setSelectedBuildingWindowSpacerExtrude(enabled)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.ui.onWindowSpacerExtrudeDistanceChange = (distance) => {
            if (this.scene.setSelectedBuildingWindowSpacerExtrudeDistance(distance)) {
                this.ui.setSelectedBuilding(this.scene.getSelectedBuilding());
                this._syncBuildings();
            }
        };

        this.canvas.addEventListener('pointermove', this._onPointerMove, { passive: true });
        this.canvas.addEventListener('pointerdown', this._onPointerDown, { passive: true });
        this.canvas.addEventListener('pointerup', this._onPointerUp, { passive: true });
        this.canvas.addEventListener('pointerleave', this._onPointerLeave, { passive: true });
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        window.addEventListener('keyup', this._onKeyUp, { passive: true });
    }

    exit() {
        this.canvas.removeEventListener('pointermove', this._onPointerMove);
        this.canvas.removeEventListener('pointerdown', this._onPointerDown);
        this.canvas.removeEventListener('pointerup', this._onPointerUp);
        this.canvas.removeEventListener('pointerleave', this._onPointerLeave);
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);

        this.ui.onBuildingModeChange = null;
        this.ui.onBuildBuildings = null;
        this.ui.onClearSelection = null;
        this.ui.onSelectBuilding = null;
        this.ui.onDeleteSelectedBuilding = null;
        this.ui.onReset = null;
        this.ui.onRoadModeChange = null;
        this.ui.onRoadCancel = null;
        this.ui.onRoadDone = null;
        this.ui.onRoadRemove = null;
        this.ui.onRoadHover = null;
        this.ui.onWireframeChange = null;
        this.ui.onFloorDivisionsChange = null;
        this.ui.onFloorplanChange = null;
        this.ui.onFloorCountChange = null;
        this.ui.onFloorHeightChange = null;
        this.ui.onBuildingTypeChange = null;
        this.ui.onBuildingStyleChange = null;
        this.ui.onWallInsetChange = null;
        this.ui.onHideSelectionBorderChange = null;
        this.ui.onStreetEnabledChange = null;
        this.ui.onStreetFloorsChange = null;
        this.ui.onStreetFloorHeightChange = null;
        this.ui.onStreetStyleChange = null;
        this.ui.onWindowStyleChange = null;
        this.ui.onWindowFrameWidthChange = null;
        this.ui.onWindowFrameColorChange = null;
        this.ui.onWindowGlassTopChange = null;
        this.ui.onWindowGlassBottomChange = null;
        this.ui.onWindowSpacerEnabledChange = null;
        this.ui.onWindowSpacerEveryChange = null;
        this.ui.onWindowSpacerWidthChange = null;
        this.ui.onWindowSpacerExtrudeChange = null;
        this.ui.onWindowSpacerExtrudeDistanceChange = null;
        this.ui.onStreetWindowStyleChange = null;
        this.ui.onStreetWindowFrameWidthChange = null;
        this.ui.onStreetWindowFrameColorChange = null;
        this.ui.onStreetWindowGlassTopChange = null;
        this.ui.onStreetWindowGlassBottomChange = null;
        this.ui.onStreetWindowWidthChange = null;
        this.ui.onStreetWindowGapChange = null;
        this.ui.onStreetWindowHeightChange = null;
        this.ui.onStreetWindowYChange = null;
        this.ui.onStreetWindowSpacerEnabledChange = null;
        this.ui.onStreetWindowSpacerEveryChange = null;
        this.ui.onStreetWindowSpacerWidthChange = null;
        this.ui.onStreetWindowSpacerExtrudeChange = null;
        this.ui.onStreetWindowSpacerExtrudeDistanceChange = null;
        this.ui.onBeltCourseEnabledChange = null;
        this.ui.onBeltCourseMarginChange = null;
        this.ui.onBeltCourseHeightChange = null;
        this.ui.onBeltCourseColorChange = null;
        this.ui.onTopBeltEnabledChange = null;
        this.ui.onTopBeltColorChange = null;
        this.ui.onTopBeltWidthChange = null;
        this.ui.onTopBeltInnerWidthChange = null;
        this.ui.onTopBeltHeightChange = null;
        this.ui.onRoofColorChange = null;
        this.ui.onWindowWidthChange = null;
        this.ui.onWindowGapChange = null;
        this.ui.onWindowHeightChange = null;
        this.ui.onWindowYChange = null;
        this.ui.unmount();

        this.scene.dispose();

        this._hoveredTile = null;
        this._pointerDown = null;
        this._pointerMoved = false;
        this._keyState.clear();
        this.canvas.classList.remove('cursor-pointer');
    }

    update(dt) {
        this.scene.update(dt);
        this._updateCameraArrows(dt);
    }

    _updateCameraArrows(dt) {
        const camera = this.scene?.camera;
        const controls = this.scene?.controls;
        if (!camera || !controls) return;

        const up = this._keyState.get('ArrowUp') ? 1 : 0;
        const down = this._keyState.get('ArrowDown') ? 1 : 0;
        const left = this._keyState.get('ArrowLeft') ? 1 : 0;
        const right = this._keyState.get('ArrowRight') ? 1 : 0;

        const forwardSign = up - down;
        const rightSign = right - left;
        if (!forwardSign && !rightSign) return;

        camera.getWorldDirection(this._moveForward);
        this._moveForward.y = 0;
        const len = this._moveForward.length();
        if (len < 1e-6) return;
        this._moveForward.multiplyScalar(1 / len);

        this._moveRight.crossVectors(this._moveForward, new THREE.Vector3(0, 1, 0));
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
        const speed = Math.max(10, dist * 0.6);
        const delta = speed * (Number(dt) || 0);

        this.scene.panCameraOnGround(this._moveDir.x * delta, this._moveDir.z * delta);
    }

    _handleKeyDown(e) {
        const code = e?.code;
        const key = e?.key;
        if (code !== 'ArrowUp' && code !== 'ArrowDown' && code !== 'ArrowLeft' && code !== 'ArrowRight'
            && key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowRight') {
            return;
        }

        if (isInteractiveElement(document.activeElement)) return;
        e.preventDefault();
        this._keyState.set(code || key, true);
    }

    _handleKeyUp(e) {
        const code = e?.code;
        const key = e?.key;
        if (!code && !key) return;
        if (code) this._keyState.delete(code);
        if (key) this._keyState.delete(key);
    }

    handleEscape() {
        if (this.ui?.isResetDialogOpen?.() && this.ui.isResetDialogOpen()) {
            this.ui.closeResetDialog();
            return true;
        }

        if (this.scene.getRoadModeEnabled()) {
            this.scene.cancelRoadSelection();
            this._syncRoadStatus();
            return true;
        }

        return false;
    }

    _syncUiCounts() {
        this.ui.setSelectedCount(this.scene.getSelectedCount());
        this.ui.setBuildingCount(this.scene.getBuildingCount());
        this.ui.setRoadCount(this.scene.getRoadTileCount());
    }

    _syncRoadStatus() {
        this.ui.setRoadStatus(this.scene.getRoadSelection());
    }

    _syncRoadList() {
        this.ui.setRoads(this.scene.getRoadSegments());
    }

    _syncBuildings() {
        const selected = this.scene.getSelectedBuilding();
        this.ui.setSelectedBuilding(selected);
        this.ui.setBuildings(this.scene.getBuildings(), { selectedBuildingId: selected?.id ?? null });
        if (selected) this.ui.setFloorCount(selected.floors);
    }

    _setPointerFromEvent(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        this._pointer.set(x * 2 - 1, -(y * 2 - 1));
    }

    _pickTileId(event) {
        this._setPointerFromEvent(event);
        this._raycaster.setFromCamera(this._pointer, this.engine.camera);
        const hits = this._raycaster.intersectObjects(this.scene.getTileMeshes(), false);
        if (!hits.length) return null;
        return this.scene.getTileIdFromMesh(hits[0].object);
    }

    _handlePointerMove(event) {
        if (!event || isInteractiveElement(event.target)) return;
        if (this._pointerDown) {
            const dx = event.clientX - this._pointerDown.x;
            const dy = event.clientY - this._pointerDown.y;
            if (dx * dx + dy * dy > 25) this._pointerMoved = true;
        }

        const tileId = this._pickTileId(event);
        if (tileId !== this._hoveredTile) {
            this._hoveredTile = tileId;
            this.scene.setHoveredTile(tileId);
            this.canvas.classList.toggle('cursor-pointer', !!tileId);
        }
    }

    _handlePointerDown(event) {
        if (!event || isInteractiveElement(event.target)) return;
        if (event.button !== 0) return;
        this._pointerDown = { x: event.clientX, y: event.clientY };
        this._pointerMoved = false;
    }

    _handlePointerUp(event) {
        if (!event || isInteractiveElement(event.target)) return;
        if (event.button !== 0) return;
        const down = this._pointerDown;
        this._pointerDown = null;
        if (!down) return;
        if (this._pointerMoved) return;

        const tileId = this._pickTileId(event);
        if (!tileId) return;

        if (this.scene.getRoadModeEnabled()) {
            this.scene.handleRoadTileClick(tileId);
            this.ui.setRoadModeEnabled(this.scene.getRoadModeEnabled());
            this.ui.setBuildingModeEnabled(this.scene.getBuildingModeEnabled());
            this._syncRoadStatus();
            this._syncRoadList();
            this._syncBuildings();
        } else if (this.scene.getBuildingModeEnabled()) {
            this.scene.toggleTileSelection(tileId);
        } else {
            this.scene.selectBuildingByTileId(tileId);
            this._syncBuildings();
        }

        this._syncUiCounts();
    }

    _handlePointerLeave() {
        if (!this._hoveredTile) return;
        this._hoveredTile = null;
        this.scene.setHoveredTile(null);
        this.canvas.classList.remove('cursor-pointer');
    }
}
