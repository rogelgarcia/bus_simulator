// src/states/MapDebuggerState.js
// Manages the interactive map debugger state and visual overlays.
// Design: Draft road preview renders segment-by-segment (no joins) for stability; later work can reintroduce connected polyline joins.
import * as THREE from 'three';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { getSharedCity } from '../app/city/City.js';
import { createCityConfig } from '../app/city/CityConfig.js';
import { CityMap, TILE } from '../app/city/CityMap.js';
import { CITY_SPEC_REGISTRY, DEFAULT_CITY_SPEC_ID, createCitySpecById } from '../app/city/specs/CitySpecRegistry.js';
import { generateCenterlineFromPolyline } from '../app/geometry/PolylineTAT.js';
import { getBuildingConfigs } from '../app/city/buildings/index.js';
import { MapDebuggerEditorPanel } from '../graphics/gui/map_debugger/MapDebuggerEditorPanel.js';
import { MapDebuggerControlsPanel } from '../graphics/gui/map_debugger/MapDebuggerControlsPanel.js';
import { MapDebuggerShortcutsPanel } from '../graphics/gui/map_debugger/MapDebuggerShortcutsPanel.js';
import { MapDebuggerInfoPanel } from '../graphics/gui/map_debugger/MapDebuggerInfoPanel.js';
import { computeBuildingLoopsFromTiles } from '../graphics/assets3d/generators/buildings/BuildingGenerator.js';
import { ConnectorCameraTour } from '../graphics/gui/connector_debugger/ConnectorCameraTour.js';
import { CityConnectorDebugOverlay } from '../graphics/visuals/city/CityConnectorDebugOverlay.js';
import { createRoadHighlightMesh } from '../graphics/visuals/city/RoadHighlightMesh.js';
import { createCollisionPoleMarkers } from '../graphics/visuals/city/CollisionPoleMarkers.js';
import { createConnectionPoleMarkers } from '../graphics/visuals/city/ConnectionPoleMarkers.js';
import { createAdjustedEndRingMarkers } from '../graphics/visuals/city/AdjustedEndRingMarkers.js';
import { createAdjustedEndOriginMarkers } from '../graphics/visuals/city/AdjustedEndOriginMarkers.js';
import { createHoverOutlineLine } from '../graphics/visuals/city/HoverOutlineLine.js';
import { RoadGraphDebugOverlay } from '../graphics/visuals/city/RoadGraphDebugOverlay.js';
import { createRoadEngineRoads } from '../graphics/visuals/city/RoadEngineRoads.js';
import { createToolCameraController, getTopDownToolCameraHomeDirection } from '../graphics/engine3d/camera/ToolCameraPrefab.js';

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

const EPS = 1e-6;
const HALF = 0.5;
const DOUBLE = 2;
const MIN_LANES_ONEWAY = 2;
const ROAD_SURFACE_LIFT = 0.004;
const HIGHLIGHT_OPACITY = 0.25;
const HIGHLIGHT_LIFT = 0.04;
const HIGHLIGHT_PAD_TILE_FRACTION = 0.18;
const HIGHLIGHT_PAD_LANE_FACTOR = 0.6;
const HIGHLIGHT_PAD_CURB_FACTOR = 2.4;
const HIGHLIGHT_PAD_MIN = 1.2;
const POLE_DOT_SCALE = 1.5;
const POLE_DOT_RADIUS_FACTOR = 0.25;
const POLE_DOT_RADIUS_MIN = 0.04;
const COLLISION_POLE_SCALE = 2;
const DEFAULT_CURB_THICKNESS = 0.48;
const COLLISION_MARKER_COLOR_HEX = 0xff3b30;
const COLLISION_MARKER_OPACITY = 0.7;
const CONNECTION_MARKER_COLOR_HEX = 0x34c759;
const CONNECTION_MARKER_OPACITY = 0.7;
const ADJUSTED_END_RING_COLOR_HEX = 0x34c759;
const ADJUSTED_END_RING_OPACITY = 0.85;
const ADJUSTED_END_ORIGIN_COLOR_HEX = 0xff3b30;
const ADJUSTED_END_ORIGIN_OPACITY = 0.45;
const COLLISION_MARKER_LIFT = 0.002;
const COLLISION_MARKER_SEGMENTS = 32;

function normalizeDir(x, y) {
    const len = Math.hypot(x, y);
    if (!(len > EPS)) return null;
    const inv = 1 / len;
    return { x: x * inv, y: y * inv };
}

function laneCount(lanesF, lanesB) {
    const f = lanesF ?? 0;
    const b = lanesB ?? 0;
    const total = f + b;
    if (total <= 0) return 0;
    if (f === 0 || b === 0) return Math.max(MIN_LANES_ONEWAY, total);
    return total;
}

function roadWidth(lanesF, lanesB, laneWidth, shoulder, tileSize) {
    const lanes = laneCount(lanesF, lanesB);
    const raw = lanes * laneWidth + shoulder * DOUBLE;
    return clamp(raw, laneWidth, tileSize);
}

function offsetEndpoints(p0, p1, normal, offset) {
    return {
        start: { x: p0.x + normal.x * offset, y: p0.y + normal.y * offset },
        end: { x: p1.x + normal.x * offset, y: p1.y + normal.y * offset }
    };
}

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

function edgeBoundaryAtNode(edge, nodeId) {
    if (!edge || !nodeId) return null;
    const left = edge.left ?? null;
    const right = edge.right ?? null;
    if (!left || !right) return null;
    if (edge.a === nodeId) {
        return { left: left.a ?? null, right: right.a ?? null };
    }
    if (edge.b === nodeId) {
        return { left: right.b ?? null, right: left.b ?? null };
    }
    return null;
}

function disposeMaterial(mat) {
    if (!mat) return;
    if (Array.isArray(mat)) {
        for (const entry of mat) disposeMaterial(entry);
        return;
    }
    if (typeof mat.dispose === 'function') mat.dispose();
}

export class MapDebuggerState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this.canvas = engine.canvas;

        this.uiWelcome = document.getElementById('ui-welcome');
        this.uiSelect = document.getElementById('ui-select');
        this.uiHudTest = document.getElementById('ui-test');

        this.uiRoot = null;
        this.city = null;

        this._keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            KeyA: false,
            KeyZ: false
        };

        this._moveSpeed = 10;
        this._zoomSpeed = 40;
        this._zoom = 0;
        this._zoomMin = 0;
        this._zoomMax = 0;

        this._cityOptions = {
            size: 400,
            tileMeters: 2,
            mapTileSize: 24,
            seed: 'x'
        };
        this._roadRenderMode = 'debug';
        this._treesEnabled = false;
        this._junctionThresholdFactor = 1.5;
        this._junctionFilletRadiusFactor = 1;
        this._junctionMinThreshold = 7.2;
        this._junctionMaxThreshold = Infinity;
        this._cityOptions.generatorConfig = {
            render: { roadMode: this._roadRenderMode, treesEnabled: this._treesEnabled },
            road: {
                junctions: {
                    thresholdFactor: this._junctionThresholdFactor,
                    filletRadiusFactor: this._junctionFilletRadiusFactor,
                    minThreshold: this._junctionMinThreshold
                }
            }
        };

        this._spec = null;
        this._citySpecId = null;
        this.editorPanel = null;
        this._editorTab = 'road';
        this._roadParams = { tag: 'road', lanesF: 1, lanesB: 1, defaultRadius: 12 };
        this._roadModeEnabled = false;
        this._roadDraftPoints = [];
        this._roadDraftStart = null;
        this._buildingModeEnabled = false;
        this._buildingSelection = new Set();
        this._newBuildingConfigId = null;
        this.debugsPanel = null;
        this.shortcutsPanel = null;
        this.poleInfoPanel = null;
        this._selectionOverlayMesh = null;
        this._selectionOverlayGeo = null;
        this._selectionOverlayMat = null;
        this._roadStartOverlayMesh = null;
        this._roadStartOverlayGeo = null;
        this._roadStartOverlayMat = null;
        this._roadDraftMarkerMesh = null;
        this._roadDraftMarkerGeo = null;
        this._roadDraftMarkerMat = null;
        this._roadDraftPreviewGroup = null;
        this._edgeConnectionLine = null;
        this._edgeConnectionMaterial = null;
        this._selectedRoadPoint = null;
        this._roadPointPopup = null;
        this._roadPointPopupInput = null;
        this._roadPointPopupTitle = null;
        this._roadPointPopupClose = null;
        this._roadPointPopupActive = false;
        this._roadPointPreviewGroup = null;
        this._roadPointPreviewMat = null;
        this._roadPointPreviewTangentLine = null;
        this._roadPointPreviewArcLine = null;
        this._buildingHoverOverlayMesh = null;
        this._buildingHoverOverlayGeo = null;
        this._buildingHoverOverlayMat = null;
        this._buildingSelectionOutlineLine = null;
        this._buildingSelectionOutlineMaterial = null;
        this._hoverBuildingTiles = null;
        this._highlightMesh = null;
        this._highlightGeo = null;
        this._highlightMat = null;
        this._highlightPos = null;
        this._highlightY = 0.03;
        this._collisionMarkerMesh = null;
        this._collisionMarkerGeo = null;
        this._collisionMarkerMat = null;
        this._connectionMarkerMesh = null;
        this._connectionMarkerGeo = null;
        this._connectionMarkerMat = null;
        this._adjustedEndRingMesh = null;
        this._adjustedEndRingGeo = null;
        this._adjustedEndRingMat = null;
        this._adjustedEndOriginMesh = null;
        this._adjustedEndOriginGeo = null;
        this._adjustedEndOriginMat = null;
        this._connectorOverlay = null;
        this._connectorDebugEnabled = true;
        this._collisionDebugEnabled = true;
        this._hoverOutlineEnabled = true;
        this._roadEdgesDebugEnabled = true;
        this._roadCrossingsDebugEnabled = true;
        this._roadCenterlineDebugEnabled = true;
        this._roadDirectionLinesDebugEnabled = true;
        this._roadEndpointsDebugEnabled = true;
        this._roadGraphOverlay = null;
        this._outlineLine = null;
        this._outlineMaterial = null;
        this._outlineGeoCache = new WeakMap();
        this._outlineDynamicGeo = null;
        this._outlineMatrix = new THREE.Matrix4();
        this._outlineTarget = null;
        this._pointer = new THREE.Vector2();
        this._raycaster = new THREE.Raycaster();
        this._hoverPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this._hoverThreshold = 1;
        this._hoverConnectorIndex = -1;
        this._hoverPoleIndex = -1;
        this.controls = null;
        this._cameraDragActive = false;
        this._cameraDragPointerId = null;
        this._cameraDragStartWorld = new THREE.Vector3();
        this._cameraDragStartCam = new THREE.Vector3();
        this._tourActive = false;
        this._tour = null;

        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onKeyUp = (e) => this._handleKeyUp(e);
        this._onPointerMove = (e) => this._handlePointerMove(e);
        this._onPointerDown = (e) => this._handlePointerDown(e);
        this._onPointerUp = (e) => this._handlePointerUp(e);
        this._onPointerLeave = () => this._handlePointerLeave();
        this._onWheel = (e) => this._handleWheel(e);

    }

    enter() {
        document.body.classList.remove('splash-bg');
        if (this.uiSelect) this.uiSelect.classList.add('hidden');
        if (this.uiWelcome) this.uiWelcome.classList.add('hidden');
        if (this.uiHudTest) this.uiHudTest.classList.add('hidden');

        this.engine.clearScene();

        if (this.uiRoot?.isConnected) this.uiRoot.remove();
        this.uiRoot = document.createElement('div');
        this.uiRoot.className = 'map-debugger-ui-root';
        document.body.appendChild(this.uiRoot);

        this._roadRenderMode = 'debug';
        const currentGen = this._cityOptions.generatorConfig ?? {};
        this._cityOptions.generatorConfig = {
            ...currentGen,
            render: { ...(currentGen.render ?? {}), roadMode: this._roadRenderMode, treesEnabled: this._treesEnabled }
        };

        const config = createCityConfig(this._cityOptions);
        this._spec = CityMap.demoSpec(config);
        this._citySpecId = DEFAULT_CITY_SPEC_ID;

        const buildingConfigs = getBuildingConfigs();
        if (!this._newBuildingConfigId) this._newBuildingConfigId = buildingConfigs[0]?.id ?? null;

        this.editorPanel = new MapDebuggerEditorPanel({
            spec: this._spec,
            citySpecs: CITY_SPEC_REGISTRY,
            citySpecId: this._citySpecId,
            buildingConfigs,
            roadParams: this._roadParams,
            tab: this._editorTab,
            roadModeEnabled: this._roadModeEnabled,
            roadDraftStart: this._roadDraftStart,
            roadDraftCount: this._roadDraftPoints.length,
            buildingModeEnabled: this._buildingModeEnabled,
            buildingSelectionCount: this._buildingSelection.size,
            newBuildingConfigId: this._newBuildingConfigId,
            onApplyCity: (settings) => this._applyCitySettings(settings),
            onClearCity: () => this._clearCity(),
            onResetDemo: () => this._resetDemo(),
            onRandomizeSeed: () => this._randomizeSeed(),
            onLoadCitySpec: (id) => this._loadCitySpec(id),
            onRoadParamsChange: (params) => this._setRoadParams(params),
            onTabChange: (tab) => this._setEditorTab(tab),
            onStartRoadMode: () => this._startRoadMode(),
            onDoneRoadMode: () => this._doneRoadMode(),
            onCancelRoadDraft: () => this._cancelRoadDraft(),
            onRoadRenderedChange: (index, rendered) => this._setRoadRendered(index, rendered),
            onDeleteRoad: (index) => this._deleteRoadAtIndex(index),
            onStartBuildingMode: () => this._startBuildingMode(),
            onDoneBuildingMode: () => this._doneBuildingMode(),
            onCancelBuildingMode: () => this._cancelBuildingMode(),
            onClearBuildingSelection: () => this._clearBuildingSelection(),
            onNewBuildingConfigIdChange: (configId) => this._setNewBuildingConfigId(configId),
            onBuildingRenderedChange: (id, rendered) => this._setBuildingRendered(id, rendered),
            onDeleteBuilding: (id) => this._deleteBuildingById(id),
            onBuildingConfigChange: (data) => this._setBuildingConfigForBuilding(data),
            onRoadHover: (road) => this._updateHighlight(road),
            onBuildingHover: (building) => this._setHoveredBuilding(building),
        });
        this.editorPanel.attach(this.uiRoot);
        this.editorPanel.root.classList.remove('hidden');

        this.debugsPanel = new MapDebuggerControlsPanel({
            connectorDebugEnabled: this._connectorDebugEnabled,
            hoverOutlineEnabled: this._hoverOutlineEnabled,
            collisionDebugEnabled: this._collisionDebugEnabled,
            treesEnabled: this._treesEnabled,
            roadEdgesEnabled: this._roadEdgesDebugEnabled,
            roadCrossingsEnabled: this._roadCrossingsDebugEnabled,
            roadCenterlineEnabled: this._roadCenterlineDebugEnabled,
            roadDirectionLinesEnabled: this._roadDirectionLinesDebugEnabled,
            roadEndpointsEnabled: this._roadEndpointsDebugEnabled,
            roadRenderMode: this._roadRenderMode,
            junctionThresholdFactor: this._junctionThresholdFactor,
            junctionFilletRadiusFactor: this._junctionFilletRadiusFactor,
            junctionMinThreshold: this._junctionMinThreshold,
            junctionMaxThreshold: this._junctionMaxThreshold,
            onConnectorDebugToggle: (enabled) => this._setConnectorDebugEnabled(enabled),
            onHoverOutlineToggle: (enabled) => this._setHoverOutlineEnabled(enabled),
            onCollisionDebugToggle: (enabled) => this._setCollisionDebugEnabled(enabled),
            onTreesToggle: (enabled) => this._setTreesEnabled(enabled),
            onRoadEdgesToggle: (enabled) => this._setRoadEdgesDebugEnabled(enabled),
            onRoadCrossingsToggle: (enabled) => this._setRoadCrossingsDebugEnabled(enabled),
            onRoadCenterlineToggle: (enabled) => this._setRoadCenterlineDebugEnabled(enabled),
            onRoadDirectionLinesToggle: (enabled) => this._setRoadDirectionLinesDebugEnabled(enabled),
            onRoadEndpointsToggle: (enabled) => this._setRoadEndpointsDebugEnabled(enabled),
            onRoadRenderModeChange: (mode) => this._setRoadRenderMode(mode),
            onJunctionParamsChange: (params) => this._setJunctionParams(params)
        });
        this.debugsPanel.attach(this.uiRoot);
        this.debugsPanel.root.classList.remove('hidden');

        this.shortcutsPanel = new MapDebuggerShortcutsPanel();
        this.shortcutsPanel.attach(this.uiRoot);
        this.shortcutsPanel.root.classList.remove('hidden');

        this.poleInfoPanel = new MapDebuggerInfoPanel();
        this.poleInfoPanel.attach(this.uiRoot);
        this.poleInfoPanel.root.classList.remove('hidden');

        this._applySpec(this._spec, { resetCamera: true });

        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        window.addEventListener('keyup', this._onKeyUp, { passive: false });
        this.canvas?.addEventListener('pointermove', this._onPointerMove);
        this.canvas?.addEventListener('pointerdown', this._onPointerDown);
        this.canvas?.addEventListener('pointerup', this._onPointerUp);
        this.canvas?.addEventListener('pointercancel', this._onPointerUp);
        this.canvas?.addEventListener('pointerleave', this._onPointerLeave);

        this._ensureToolCameraControls({ resetHome: true });
    }

    exit() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        this.canvas?.removeEventListener('pointermove', this._onPointerMove);
        this.canvas?.removeEventListener('pointerdown', this._onPointerDown);
        this.canvas?.removeEventListener('pointerup', this._onPointerUp);
        this.canvas?.removeEventListener('pointercancel', this._onPointerUp);
        this.canvas?.removeEventListener('pointerleave', this._onPointerLeave);
        this.canvas?.removeEventListener('wheel', this._onWheel);

        this._clearRoadPointEditor();

        this.editorPanel?.destroy();
        this.editorPanel = null;
        this.debugsPanel?.destroy();
        this.debugsPanel = null;
        this.shortcutsPanel?.destroy();
        this.shortcutsPanel = null;
        this.poleInfoPanel?.destroy();
        this.poleInfoPanel = null;
        if (this.uiRoot?.isConnected) this.uiRoot.remove();
        this.uiRoot = null;
        this._spec = null;
        this._citySpecId = null;
        this._clearHighlight();
        this._clearSelectionOverlays();
        this._clearCollisionMarkers();
        this._clearConnectorOverlay();
        this._clearRoadGraphOverlay();
        this._destroyHoverOutline();
        this._stopTour();
        this._stopCameraDrag();
        this.controls?.dispose?.();
        this.controls = null;

        this.city?.detach(this.engine);
        this.engine.clearScene();
        this.city = null;
    }

    update(dt) {
        this.city?.update(this.engine);

        if (this._tourActive && this._tour) {
            this._tour.update(dt);
            return;
        }

        const controls = this.controls ?? null;
        if (!controls) return;

        const move = new THREE.Vector3();
        if (this._keys.ArrowUp) move.z -= 1;
        if (this._keys.ArrowDown) move.z += 1;
        if (this._keys.ArrowRight) move.x += 1;
        if (this._keys.ArrowLeft) move.x -= 1;

        if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(this._moveSpeed * dt);
            controls.panWorld(move.x, 0, move.z);
        }

        let zoomDir = 0;
        if (this._keys.KeyA) zoomDir -= 1;
        if (this._keys.KeyZ) zoomDir += 1;
        if (zoomDir !== 0) {
            controls.dollyBy?.(zoomDir * this._zoomSpeed * dt);
        }

        controls.update(dt);
        const orbit = controls.getOrbit?.() ?? null;
        const radius = Number(orbit?.radius);
        if (Number.isFinite(radius)) this._zoom = clamp(radius, this._zoomMin, this._zoomMax);
        this._syncRoadPointPopupPosition();
    }

    _handleKeyDown(e) {
        const code = e.code;

        if (code === 'Escape') {
            e.preventDefault();
            if (this._roadModeEnabled) {
                this._cancelRoadDraft();
                return;
            }
            if (this._buildingModeEnabled) {
                this._cancelBuildingMode();
                return;
            }
            this.sm.go('welcome');
            return;
        }

        if (code === 'Backspace') {
            if (!this._roadModeEnabled) return;
            if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;
            e.preventDefault();
            this._undoRoadDraftPoint();
            return;
        }

        if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;

        if (code === 'KeyR') {
            e.preventDefault();
            e.stopImmediatePropagation?.();
            this._stopTour();
            this._stopCameraDrag();
            for (const key of Object.keys(this._keys)) this._keys[key] = false;
            this.controls?.reset?.();
            const orbit = this.controls?.getOrbit?.() ?? null;
            const radius = Number(orbit?.radius);
            if (Number.isFinite(radius)) this._zoom = clamp(radius, this._zoomMin, this._zoomMax);
            return;
        }

        if (code === 'KeyF') {
            e.preventDefault();
            e.stopImmediatePropagation?.();
            this.controls?.frame?.();
            const orbit = this.controls?.getOrbit?.() ?? null;
            const radius = Number(orbit?.radius);
            if (Number.isFinite(radius)) this._zoom = clamp(radius, this._zoomMin, this._zoomMax);
            return;
        }

        if (code === 'KeyT') {
            if (this._roadModeEnabled || this._buildingModeEnabled) return;
            if (this._tourActive) return;
            e.preventDefault();
            this._startTour();
            return;
        }

        if (this._tourActive) return;

        if (code in this._keys) {
            e.preventDefault();
            this._keys[code] = true;
            return;
        }
    }

    _handleKeyUp(e) {
        const code = e.code;

        if (code in this._keys) {
            e.preventDefault();
            this._keys[code] = false;
        }
    }

    _resetCamera() {
        this._stopTour();
        this._stopCameraDrag();
        for (const key of Object.keys(this._keys)) this._keys[key] = false;
        this._recomputeCameraLimits({ resetPosition: true });
    }

    _ensureToolCameraControls({ resetHome = false } = {}) {
        if (!this.engine?.camera || !this.canvas) return false;

        const map = this.city?.map ?? null;
        const origin = map?.origin ?? { x: 0, z: 0 };
        const cx = Number(origin.x) + ((Number(map?.width) || 1) - 1) * (Number(map?.tileSize) || 1) * 0.5;
        const cz = Number(origin.z) + ((Number(map?.height) || 1) - 1) * (Number(map?.tileSize) || 1) * 0.5;
        const y = -(this._hoverPlane?.constant ?? 0);
        const target = new THREE.Vector3(cx, y, cz);

        const zoom = clamp(Number(this._zoom) || this._zoomMin, this._zoomMin, this._zoomMax);
        const dir = getTopDownToolCameraHomeDirection();
        const position = target.clone().addScaledVector(dir, zoom);

        this.controls?.dispose?.();
        this.controls = createToolCameraController(this.engine.camera, this.canvas, {
            uiRoot: this.uiRoot ?? document.body,
            enabled: true,
            enableDamping: true,
            dampingFactor: 0.08,
            rotateSpeed: 1.0,
            panSpeed: 1.0,
            zoomSpeed: 1.0,
            minDistance: this._zoomMin,
            maxDistance: this._zoomMax,
            minPolarAngle: 0.001,
            maxPolarAngle: Math.PI * 0.5 - 0.08,
            getFocusTarget: () => this._getCameraFocusTarget(),
            initialPose: { position, target }
        });

        if (resetHome) this.controls.setHomeFromCurrent();
        return true;
    }

    _getCameraFocusTarget() {
        const map = this.city?.map ?? null;
        if (!map) return null;
        const tileSize = Number(map.tileSize) || 1;
        const half = tileSize * 0.5;
        const origin = map.origin ?? { x: 0, z: 0 };
        const ox = Number(origin.x) || 0;
        const oz = Number(origin.z) || 0;
        const maxX = Math.max(0, (map.width ?? 1) - 1);
        const maxY = Math.max(0, (map.height ?? 1) - 1);
        const y = -(this._hoverPlane?.constant ?? 0);
        return {
            box: {
                min: { x: ox - half, y, z: oz - half },
                max: { x: ox + maxX * tileSize + half, y, z: oz + maxY * tileSize + half }
            }
        };
    }

    _setTourActive(active) {
        this._tourActive = !!active;
        if (this.controls) {
            this.controls.enabled = !this._tourActive;
            if (!this._tourActive) this.controls.syncFromCamera?.();
        }
        this.shortcutsPanel?.setTourActive(this._tourActive);
    }

    _ensureTour() {
        if (this._tour) return;
        this._tour = new ConnectorCameraTour({
            engine: this.engine,
            getCurbs: () => this.city?.roads?.curbConnectors ?? [],
            getCurbEndPosition: () => null,
            getCenter: () => {
                const map = this.city?.map;
                const y = -(this._hoverPlane?.constant ?? 0);
                if (!map) return new THREE.Vector3(0, y, 0);
                const cx = map.origin.x + (map.width - 1) * map.tileSize * 0.5;
                const cz = map.origin.z + (map.height - 1) * map.tileSize * 0.5;
                return new THREE.Vector3(cx, y, cz);
            },
            getGroundY: () => -(this._hoverPlane?.constant ?? 0),
            getZoom: () => this._zoom,
            setZoom: (value) => {
                this._zoom = value;
            },
            onActiveChange: (active) => this._setTourActive(active)
        });
    }

    _startTour() {
        this._ensureTour();
        if (this._tourActive || !this._tour) return;
        if (!this._tour.start()) return;
        this._stopCameraDrag();
        this._clearConnectorHover();
        this._clearHoverOutline();
        for (const key of Object.keys(this._keys)) this._keys[key] = false;
    }

    _stopTour() {
        this._tour?.stop();
        this._tour = null;
    }

    _setCity(mapSpec) {
        this.city?.detach(this.engine);
        this._clearConnectorOverlay();
        this._clearRoadGraphOverlay();
        this._clearCollisionMarkers();
        this._clearSelectionOverlays();
        this.engine.clearScene();
        this.engine.context.city = null;
        if (mapSpec?.seed !== undefined) this._cityOptions.seed = mapSpec.seed;
        this.city = getSharedCity(this.engine, { ...this._cityOptions, mapSpec });
        this.city.attach(this.engine);
        this._setupHighlight();
        this._setupSelectionOverlays();
        this._setupConnectorOverlay();
        this._setupRoadGraphOverlay();
        this._setupCollisionMarkers();
        this._setupHoverOutline();
        this._setTreesEnabled(this._treesEnabled);
        this._setPoleInfoData(null);
    }

    _applySpec(spec, { resetCamera = false } = {}) {
        const fullSpec = this._normalizeSpec(spec);
        const renderSpec = this._filterSpecForRender(fullSpec);
        this._setCity(renderSpec);

        const version = fullSpec.version ?? 1;
        const seed = this.city?.genConfig?.seed ?? fullSpec.seed;
        const sanitized = this.city?.map?.exportSpec ? this.city.map.exportSpec({ seed, version }) : renderSpec;
        this._spec = this._mergeSanitizedRenderSpec(fullSpec, sanitized);

        this.editorPanel?.setSpec(this._spec);
        this.editorPanel?.setTab(this._editorTab);
        this.editorPanel?.setRoadParams(this._roadParams);
        this.editorPanel?.setRoadModeEnabled(this._roadModeEnabled);
        this.editorPanel?.setRoadDraftStart(this._roadDraftStart);
        this.editorPanel?.setRoadDraftCount(this._roadDraftPoints.length);
        this.editorPanel?.setBuildingModeEnabled(this._buildingModeEnabled);
        this.editorPanel?.setBuildingSelectionCount(this._buildingSelection.size);
        this.editorPanel?.setNewBuildingConfigId(this._newBuildingConfigId);

        this._recomputeCameraLimits({ resetPosition: resetCamera });
    }

    _filterSpecForRender(spec) {
        const input = spec && typeof spec === 'object' ? spec : {};
        const roadsIn = Array.isArray(input.roads) ? input.roads : [];
        const buildingsIn = Array.isArray(input.buildings) ? input.buildings : [];
        return {
            ...input,
            roads: roadsIn.filter((road) => road?.rendered !== false),
            buildings: buildingsIn.filter((building) => building?.rendered !== false)
        };
    }

    _mergeSanitizedRenderSpec(fullSpec, sanitizedRenderSpec) {
        const full = fullSpec && typeof fullSpec === 'object' ? fullSpec : {};
        const sanitized = sanitizedRenderSpec && typeof sanitizedRenderSpec === 'object' ? sanitizedRenderSpec : {};

        const fullRoads = Array.isArray(full.roads) ? full.roads : [];
        const sanitizedRoads = Array.isArray(sanitized.roads) ? sanitized.roads : [];

        const mergedRoads = [];
        let roadIndex = 0;
        for (const road of fullRoads) {
            if (road?.rendered === false) {
                mergedRoads.push({ ...road, rendered: false });
                continue;
            }

            const clean = sanitizedRoads[roadIndex] ?? road;
            if (sanitizedRoads[roadIndex]) roadIndex += 1;
            mergedRoads.push({ ...clean, rendered: true });
        }

        const fullBuildings = Array.isArray(full.buildings) ? full.buildings : [];
        const sanitizedBuildings = Array.isArray(sanitized.buildings) ? sanitized.buildings : [];

        const mergedBuildings = [];
        let buildingIndex = 0;
        for (const building of fullBuildings) {
            if (building?.rendered === false) {
                mergedBuildings.push({ ...building, rendered: false });
                continue;
            }

            const clean = sanitizedBuildings[buildingIndex] ?? building;
            if (sanitizedBuildings[buildingIndex]) buildingIndex += 1;
            mergedBuildings.push({ ...clean, rendered: true });
        }

        return {
            ...full,
            ...sanitized,
            roads: mergedRoads,
            buildings: mergedBuildings
        };
    }

    _normalizeSpec(spec) {
        const input = spec && typeof spec === 'object' ? spec : {};
        const cfg = createCityConfig(this._cityOptions);

        const version = Number.isFinite(input.version) ? (input.version | 0) : 1;
        const width = Number.isFinite(input.width) ? Math.max(1, input.width | 0) : (cfg.map.width | 0);
        const height = Number.isFinite(input.height) ? Math.max(1, input.height | 0) : (cfg.map.height | 0);
        const tileSize = Number.isFinite(input.tileSize) ? Number(input.tileSize) : cfg.map.tileSize;

        const seedRaw = input.seed ?? cfg.seed ?? this._cityOptions.seed ?? 'city';
        const seed = String(seedRaw);

        const originIn = input.origin ?? null;
        const originOk = originIn && Number.isFinite(originIn.x) && Number.isFinite(originIn.z);
        const origin = originOk ? { x: originIn.x, z: originIn.z } : this._centerOrigin(width, height, tileSize);

        const roads = Array.isArray(input.roads) ? input.roads.slice() : [];
        const buildings = Array.isArray(input.buildings) ? input.buildings.slice() : [];

        if (Number.isFinite(tileSize) && tileSize > 0 && tileSize !== this._cityOptions.mapTileSize) {
            this._cityOptions.mapTileSize = tileSize;
        }

        return {
            version,
            seed,
            width,
            height,
            tileSize,
            origin,
            roads,
            buildings
        };
    }

    _centerOrigin(width, height, tileSize) {
        const w = Math.max(1, width | 0);
        const h = Math.max(1, height | 0);
        const t = Number.isFinite(tileSize) ? tileSize : 1;
        const originX = -w * t * 0.5 + t * 0.5;
        const originZ = -h * t * 0.5 + t * 0.5;
        return { x: originX, z: originZ };
    }

    _recomputeCameraLimits({ resetPosition = false } = {}) {
        const cam = this.engine.camera;
        const size = this.city?.config?.size ?? this._cityOptions.size;
        const fovRad = cam.fov * Math.PI / 180;
        const aspect = cam.aspect || 1;
        const hFov = 2 * Math.atan(Math.tan(fovRad * 0.5) * aspect);
        const viewHalf = size * 0.45;
        this._zoomMin = Math.max(3, size * 0.03);
        this._zoomMax = size * 1.25;
        const zoomV = viewHalf / Math.tan(fovRad * 0.5);
        const zoomH = viewHalf / Math.tan(hFov * 0.5);
        const suggested = clamp(Math.max(zoomV, zoomH), this._zoomMin, this._zoomMax);
        this._moveSpeed = size * 0.12;
        this._zoomSpeed = size * 0.6;

        if (this.controls?.setOrbit) {
            this.controls.minDistance = this._zoomMin;
            this.controls.maxDistance = this._zoomMax;

            if (resetPosition) {
                this._zoom = suggested;
                const map = this.city?.map ?? null;
                const origin = map?.origin ?? { x: 0, z: 0 };
                const cx = Number(origin.x) + ((Number(map?.width) || 1) - 1) * (Number(map?.tileSize) || 1) * 0.5;
                const cz = Number(origin.z) + ((Number(map?.height) || 1) - 1) * (Number(map?.tileSize) || 1) * 0.5;
                const y = -(this._hoverPlane?.constant ?? 0);
                const target = new THREE.Vector3(cx, y, cz);
                const dir = getTopDownToolCameraHomeDirection();
                const position = target.clone().addScaledVector(dir, this._zoom);
                this.controls.setLookAt({ position, target });
                this.controls.setHomeFromCurrent();
            } else {
                const orbit = this.controls.getOrbit?.() ?? null;
                const radius = Number(orbit?.radius);
                if (!Number.isFinite(this._zoom)) this._zoom = Number.isFinite(radius) ? radius : suggested;
                this._zoom = clamp(this._zoom, this._zoomMin, this._zoomMax);
                this.controls.setOrbit({ radius: this._zoom }, { immediate: true });
            }
            return;
        }

        if (resetPosition) {
            this._zoom = suggested;
            cam.position.set(0, this._zoom, 0);
        } else {
            if (!Number.isFinite(this._zoom)) this._zoom = suggested;
            this._zoom = clamp(this._zoom, this._zoomMin, this._zoomMax);
            cam.position.y = this._zoom;
        }

        cam.rotation.order = 'YXZ';
        cam.rotation.set(-Math.PI * 0.5, 0, 0);
    }

    _applyCitySettings({ width, height, seed } = {}) {
        if (!this._spec) return;
        const nextWidth = Number.isFinite(width) ? Math.max(1, width | 0) : this._spec.width;
        const nextHeight = Number.isFinite(height) ? Math.max(1, height | 0) : this._spec.height;
        const tileSize = Number.isFinite(this._spec.tileSize) ? this._spec.tileSize : this._cityOptions.mapTileSize;
        const nextSeed = typeof seed === 'string' && seed.trim() ? seed.trim() : this._spec.seed;
        const origin = this._centerOrigin(nextWidth, nextHeight, tileSize);

        this._roadDraftPoints = [];
        this._roadDraftStart = null;
        this._roadModeEnabled = false;
        this._buildingModeEnabled = false;
        this._buildingSelection.clear();

        const desiredSize = Math.max(1, Math.max(nextWidth, nextHeight) * tileSize);
        this._cityOptions.size = desiredSize;

        this._applySpec({ ...this._spec, width: nextWidth, height: nextHeight, seed: nextSeed, origin }, { resetCamera: true });
    }

    _clearCity() {
        if (!this._spec) return;
        this._roadDraftPoints = [];
        this._roadDraftStart = null;
        this._roadModeEnabled = false;
        this._buildingModeEnabled = false;
        this._buildingSelection.clear();
        this._applySpec({ ...this._spec, roads: [], buildings: [] }, { resetCamera: false });
    }

    _loadCitySpec(id) {
        const key = typeof id === 'string' ? id : '';
        if (!key) return;

        const cfg = createCityConfig(this._cityOptions);
        const spec = createCitySpecById(key, cfg);
        if (!spec) return;

        this._roadDraftPoints = [];
        this._roadDraftStart = null;
        this._roadModeEnabled = false;
        this._buildingModeEnabled = false;
        this._buildingSelection.clear();

        this._citySpecId = key;
        this.editorPanel?.setCitySpecId(this._citySpecId);

        const normalized = this._normalizeSpec(spec);
        const desiredSize = Math.max(1, Math.max(normalized.width, normalized.height) * normalized.tileSize);
        this._cityOptions.size = desiredSize;

        this._applySpec(spec, { resetCamera: true });
    }

    _resetDemo() {
        const cfg = createCityConfig(this._cityOptions);
        this._roadDraftPoints = [];
        this._roadDraftStart = null;
        this._roadModeEnabled = false;
        this._buildingModeEnabled = false;
        this._buildingSelection.clear();
        this._citySpecId = DEFAULT_CITY_SPEC_ID;
        this.editorPanel?.setCitySpecId(this._citySpecId);
        this._applySpec(CityMap.demoSpec(cfg), { resetCamera: true });
    }

    _randomizeSeed() {
        if (!this._spec) return;
        const seed = this._makeRandomSeed();
        this._applySpec({ ...this._spec, seed }, { resetCamera: false });
    }

    _makeRandomSeed() {
        const part = Math.random().toString(36).slice(2, 10);
        return `seed_${part || Date.now()}`;
    }

    _setEditorTab(tab) {
        const next = tab === 'building' ? 'building' : 'road';
        if (next === this._editorTab) return;
        this._editorTab = next;
        this._cancelRoadMode();
        this._cancelBuildingMode();
        this.editorPanel?.setTab(this._editorTab);
    }

    _setRoadParams(params) {
        const next = params && typeof params === 'object' ? params : {};
        const tag = typeof next.tag === 'string' ? next.tag.trim() : this._roadParams.tag;
        const lanesF = Number.isFinite(next.lanesF) ? Math.max(0, next.lanesF | 0) : this._roadParams.lanesF;
        const lanesB = Number.isFinite(next.lanesB) ? Math.max(0, next.lanesB | 0) : this._roadParams.lanesB;
        const defaultRadius = Number.isFinite(next.defaultRadius)
            ? Math.max(0, Number(next.defaultRadius))
            : (Number.isFinite(this._roadParams.defaultRadius) ? this._roadParams.defaultRadius : 0);
        this._roadParams = { tag: tag || 'road', lanesF, lanesB, defaultRadius };
        this.editorPanel?.setRoadParams(this._roadParams);
        this._syncRoadDraftPreview();
    }

    _startRoadMode() {
        this._roadModeEnabled = true;
        this._roadDraftPoints = [];
        this._roadDraftStart = null;
        this._buildingModeEnabled = false;
        this._buildingSelection.clear();
        this.editorPanel?.setRoadModeEnabled(this._roadModeEnabled);
        this.editorPanel?.setRoadDraftStart(this._roadDraftStart);
        this.editorPanel?.setRoadDraftCount(this._roadDraftPoints.length);
        this.editorPanel?.setBuildingModeEnabled(this._buildingModeEnabled);
        this.editorPanel?.setBuildingSelectionCount(this._buildingSelection.size);
        this._syncSelectionOverlay();
        this._syncRoadStartOverlay();
        this._syncRoadDraftMarkers();
        this._syncRoadDraftPreview();
    }

    _cancelRoadMode() {
        this._roadModeEnabled = false;
        this._roadDraftPoints = [];
        this._roadDraftStart = null;
        this.editorPanel?.setRoadModeEnabled(this._roadModeEnabled);
        this.editorPanel?.setRoadDraftStart(this._roadDraftStart);
        this.editorPanel?.setRoadDraftCount(this._roadDraftPoints.length);
        this._syncRoadStartOverlay();
        this._syncRoadDraftMarkers();
        this._syncRoadDraftPreview();
    }

    _doneRoadMode() {
        if (!this._spec) {
            this._cancelRoadMode();
            return;
        }

        const draft = Array.isArray(this._roadDraftPoints) ? this._roadDraftPoints : [];
        if (draft.length < 2) {
            this._cancelRoadMode();
            return;
        }

        const map = this.city?.map ?? null;
        if (!map) {
            this._cancelRoadMode();
            return;
        }

        const points = draft.map((p) => {
            const world = map.tileToWorldCenter(p.x | 0, p.y | 0);
            const entry = { x: world.x, z: world.z };
            if (Number.isFinite(p?.radius)) entry.radius = Math.max(0, Number(p.radius));
            return entry;
        });

        const road = {
            points,
            defaultRadius: Number.isFinite(this._roadParams.defaultRadius) ? this._roadParams.defaultRadius : 0,
            lanesF: this._roadParams.lanesF ?? 1,
            lanesB: this._roadParams.lanesB ?? 1,
            tag: this._roadParams.tag ?? 'road',
            rendered: true
        };

        const roads = Array.isArray(this._spec.roads) ? this._spec.roads.slice() : [];
        roads.push(road);

        this._roadModeEnabled = false;
        this._roadDraftPoints = [];
        this._roadDraftStart = null;
        this.editorPanel?.setRoadModeEnabled(this._roadModeEnabled);
        this.editorPanel?.setRoadDraftStart(this._roadDraftStart);
        this.editorPanel?.setRoadDraftCount(this._roadDraftPoints.length);
        this._syncRoadStartOverlay();
        this._syncRoadDraftMarkers();
        this._syncRoadDraftPreview();

        this._applySpec({ ...this._spec, roads }, { resetCamera: false });
    }

    _cancelRoadDraft() {
        this._roadDraftPoints = [];
        this._roadDraftStart = null;
        this.editorPanel?.setRoadDraftStart(this._roadDraftStart);
        this.editorPanel?.setRoadDraftCount(this._roadDraftPoints.length);
        this._syncRoadStartOverlay();
        this._syncRoadDraftMarkers();
        this._syncRoadDraftPreview();
    }

    _deleteRoadAtIndex(index) {
        if (!this._spec) return;
        const idx = Number(index);
        if (!Number.isFinite(idx) || idx < 0) return;
        const roads = Array.isArray(this._spec.roads) ? this._spec.roads.slice() : [];
        if (idx >= roads.length) return;
        roads.splice(idx, 1);
        this._applySpec({ ...this._spec, roads }, { resetCamera: false });
    }

    _setRoadRendered(index, rendered) {
        if (!this._spec) return;
        const idx = Number(index);
        if (!Number.isFinite(idx) || idx < 0) return;
        const roads = Array.isArray(this._spec.roads) ? this._spec.roads.slice() : [];
        if (idx >= roads.length) return;
        const road = roads[idx];
        if (!road || typeof road !== 'object') return;
        roads[idx] = { ...road, rendered: !!rendered };
        this._applySpec({ ...this._spec, roads }, { resetCamera: false });
    }

    _startBuildingMode() {
        this._buildingModeEnabled = true;
        this._buildingSelection.clear();
        this._roadModeEnabled = false;
        this._roadDraftPoints = [];
        this._roadDraftStart = null;
        this.editorPanel?.setBuildingModeEnabled(this._buildingModeEnabled);
        this.editorPanel?.setBuildingSelectionCount(this._buildingSelection.size);
        this.editorPanel?.setRoadModeEnabled(this._roadModeEnabled);
        this.editorPanel?.setRoadDraftStart(this._roadDraftStart);
        this.editorPanel?.setRoadDraftCount(this._roadDraftPoints.length);
        this._syncSelectionOverlay();
        this._syncRoadStartOverlay();
        this._syncRoadDraftMarkers();
        this._syncRoadDraftPreview();
    }

    _doneBuildingMode() {
        if (!this._spec) return;
        if (!this._buildingSelection.size) {
            this._cancelBuildingMode();
            return;
        }
        const map = this.city?.map ?? null;
        if (!map) return;

        const width = map.width | 0;
        const selectedIdx = new Set(this._buildingSelection);

        const buildingsIn = Array.isArray(this._spec.buildings) ? this._spec.buildings : [];
        const kept = [];
        for (const building of buildingsIn) {
            const tiles = Array.isArray(building?.tiles) ? building.tiles : [];
            let overlaps = false;
            for (const t of tiles) {
                const tx = t?.[0] | 0;
                const ty = t?.[1] | 0;
                const tidx = tx + ty * width;
                if (selectedIdx.has(tidx)) {
                    overlaps = true;
                    break;
                }
            }
            if (!overlaps) kept.push(building);
        }

        const clusters = this._clusterTileIndices(selectedIdx, width, map.height | 0);
        const buildings = kept.slice();
        const configId = typeof this._newBuildingConfigId === 'string' ? this._newBuildingConfigId : null;
        for (const cluster of clusters) {
            const tiles = cluster.map((idx) => [idx % width, Math.floor(idx / width)]);
            if (!tiles.length) continue;
            const id = this._nextBuildingId(buildings);
            buildings.push({ id, configId, tiles });
        }

        this._buildingModeEnabled = false;
        this._buildingSelection.clear();
        this.editorPanel?.setBuildingModeEnabled(this._buildingModeEnabled);
        this.editorPanel?.setBuildingSelectionCount(this._buildingSelection.size);
        this._syncSelectionOverlay();

        this._applySpec({ ...this._spec, buildings }, { resetCamera: false });
    }

    _cancelBuildingMode() {
        this._buildingModeEnabled = false;
        this._buildingSelection.clear();
        this.editorPanel?.setBuildingModeEnabled(this._buildingModeEnabled);
        this.editorPanel?.setBuildingSelectionCount(this._buildingSelection.size);
        this._syncSelectionOverlay();
    }

    _clearBuildingSelection() {
        this._buildingSelection.clear();
        this.editorPanel?.setBuildingSelectionCount(this._buildingSelection.size);
        this._syncSelectionOverlay();
    }

    _setNewBuildingConfigId(configId) {
        const next = typeof configId === 'string' && configId ? configId : null;
        if (!next) return;
        this._newBuildingConfigId = next;
        this.editorPanel?.setNewBuildingConfigId(next);
    }

    _deleteBuildingById(id) {
        if (!this._spec) return;
        const key = typeof id === 'string' ? id : '';
        if (!key) return;
        const buildings = Array.isArray(this._spec.buildings) ? this._spec.buildings.filter((b) => b?.id !== key) : [];
        this._applySpec({ ...this._spec, buildings }, { resetCamera: false });
    }

    _setBuildingRendered(id, rendered) {
        if (!this._spec) return;
        const key = typeof id === 'string' ? id : '';
        if (!key) return;
        const buildings = Array.isArray(this._spec.buildings) ? this._spec.buildings.slice() : [];
        const idx = buildings.findIndex((b) => b?.id === key);
        if (idx < 0) return;
        const building = buildings[idx];
        if (!building || typeof building !== 'object') return;
        buildings[idx] = { ...building, rendered: !!rendered };
        this._applySpec({ ...this._spec, buildings }, { resetCamera: false });
    }

    _setBuildingConfigForBuilding(data) {
        if (!this._spec) return;
        const buildingId = typeof data?.buildingId === 'string' ? data.buildingId : '';
        const configId = typeof data?.configId === 'string' ? data.configId : '';
        if (!buildingId || !configId) return;

        const buildings = Array.isArray(this._spec.buildings) ? this._spec.buildings.slice() : [];
        const idx = buildings.findIndex((b) => b?.id === buildingId);
        if (idx < 0) return;
        buildings[idx] = { ...buildings[idx], configId };
        this._applySpec({ ...this._spec, buildings }, { resetCamera: false });
    }

    _clusterTileIndices(indices, width, height) {
        const remaining = new Set(indices);
        const clusters = [];

        const takeOne = () => remaining.values().next().value;
        const isValid = (idx) => Number.isFinite(idx) && idx >= 0 && idx < width * height;

        while (remaining.size) {
            const root = takeOne();
            remaining.delete(root);
            if (!isValid(root)) continue;
            const queue = [root];
            const cluster = [];

            while (queue.length) {
                const idx = queue.shift();
                if (!isValid(idx)) continue;
                cluster.push(idx);

                const x = idx % width;
                const y = Math.floor(idx / width);
                const neighbors = [];
                if (x + 1 < width) neighbors.push(idx + 1);
                if (x - 1 >= 0) neighbors.push(idx - 1);
                if (y + 1 < height) neighbors.push(idx + width);
                if (y - 1 >= 0) neighbors.push(idx - width);

                for (const n of neighbors) {
                    if (!remaining.has(n)) continue;
                    remaining.delete(n);
                    queue.push(n);
                }
            }

            if (cluster.length) clusters.push(cluster);
        }

        return clusters;
    }

    _nextBuildingId(buildings) {
        const list = Array.isArray(buildings) ? buildings : [];
        let max = 0;
        for (const b of list) {
            const id = typeof b?.id === 'string' ? b.id : '';
            const match = id.match(/^building_(\d+)$/);
            if (!match) continue;
            const n = Number(match[1]);
            if (Number.isFinite(n) && n > max) max = n;
        }
        return `building_${max + 1}`;
    }

    _isAdjacentToTiles(x, y, tiles) {
        const list = Array.isArray(tiles) ? tiles : [];
        for (const tile of list) {
            const tx = Array.isArray(tile) ? tile[0] : tile?.x;
            const ty = Array.isArray(tile) ? tile[1] : tile?.y;
            if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
            const dx = Math.abs((tx | 0) - x);
            const dy = Math.abs((ty | 0) - y);
            if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) return true;
        }
        return false;
    }

    _handleRoadToolClick(tile, { selectPoint = false } = {}) {
        if (!this._spec) return;
        if (!this.city?.map) return;

        const tx = tile.x | 0;
        const ty = tile.y | 0;

        if (selectPoint) {
            const hit = this._findRoadPointAtTile({ x: tx, y: ty });
            if (hit) {
                this._selectRoadPoint(hit);
                return;
            }
        }

        const draft = Array.isArray(this._roadDraftPoints) ? this._roadDraftPoints : [];
        const last = draft[draft.length - 1] ?? null;
        if (last && (last.x | 0) === tx && (last.y | 0) === ty) return;
        draft.push({ x: tx, y: ty, radius: null });
        this._roadDraftPoints = draft;
        this._roadDraftStart = { x: tx, y: ty };
        this.editorPanel?.setRoadDraftStart(this._roadDraftStart);
        this.editorPanel?.setRoadDraftCount(this._roadDraftPoints.length);
        this._syncRoadStartOverlay();
        this._syncRoadDraftMarkers();
        this._syncRoadDraftPreview();
    }

    _undoRoadDraftPoint() {
        const draft = Array.isArray(this._roadDraftPoints) ? this._roadDraftPoints : [];
        if (!draft.length) return;
        draft.pop();
        this._roadDraftPoints = draft;
        const last = draft[draft.length - 1] ?? null;
        this._roadDraftStart = last ? { x: last.x | 0, y: last.y | 0 } : null;
        this.editorPanel?.setRoadDraftStart(this._roadDraftStart);
        this.editorPanel?.setRoadDraftCount(this._roadDraftPoints.length);
        this._syncRoadStartOverlay();
        this._syncRoadDraftMarkers();
        this._syncRoadDraftPreview();
    }

    _handleBuildingToolClick(tile) {
        if (!this._spec || !this.city?.map) return;
        const map = this.city.map;
        const x = tile.x | 0;
        const y = tile.y | 0;
        const idx = map.index(x, y);
        if (map.kind[idx] === TILE.ROAD) return;

        if (this._buildingSelection.has(idx)) this._buildingSelection.delete(idx);
        else this._buildingSelection.add(idx);

        this.editorPanel?.setBuildingSelectionCount(this._buildingSelection.size);
        this._syncSelectionOverlay();
    }

    _findRoadPointAtTile(tile) {
        const map = this.city?.map ?? null;
        if (!map || !this._spec) return null;
        const tx = tile?.x;
        const ty = tile?.y;
        if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;

        const roads = Array.isArray(this._spec.roads) ? this._spec.roads : [];
        for (let roadIndex = 0; roadIndex < roads.length; roadIndex++) {
            const road = roads[roadIndex];
            const points = Array.isArray(road?.points) ? road.points : null;
            if (!points) continue;
            for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
                const p = points[pointIndex];
                const x = p?.x;
                const z = Number.isFinite(p?.z) ? p.z : p?.y;
                if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
                const t = map.worldToTile(x, z);
                if (!t) continue;
                if ((t.x | 0) === (tx | 0) && (t.y | 0) === (ty | 0)) return { roadIndex, pointIndex };
            }
        }
        return null;
    }

    _selectRoadPoint(sel) {
        if (!sel || !Number.isFinite(sel.roadIndex) || !Number.isFinite(sel.pointIndex)) {
            this._clearRoadPointEditor();
            return;
        }
        this._selectedRoadPoint = { roadIndex: sel.roadIndex | 0, pointIndex: sel.pointIndex | 0 };
        this._ensureRoadPointPopup();
        this._roadPointPopupActive = true;
        this._roadPointPopup?.classList.remove('hidden');
        this._syncRoadPointPopupPosition();
        this._syncRoadPointPopupValue();
        this._updateRoadPointPreview();
    }

    _clearRoadPointEditor() {
        this._selectedRoadPoint = null;
        this._roadPointPopupActive = false;
        if (this._roadPointPopup) {
            this._roadPointPopup.classList.add('hidden');
            if (this._roadPointPopup.isConnected) this._roadPointPopup.remove();
        }
        this._roadPointPopup = null;
        this._roadPointPopupInput = null;
        this._roadPointPopupTitle = null;
        this._roadPointPopupClose = null;

        if (this._roadPointPreviewGroup) this._roadPointPreviewGroup.removeFromParent();
        if (this._roadPointPreviewTangentLine?.geometry) this._roadPointPreviewTangentLine.geometry.dispose?.();
        if (this._roadPointPreviewArcLine?.geometry) this._roadPointPreviewArcLine.geometry.dispose?.();
        if (this._roadPointPreviewMat) this._roadPointPreviewMat.dispose?.();
        this._roadPointPreviewGroup = null;
        this._roadPointPreviewMat = null;
        this._roadPointPreviewTangentLine = null;
        this._roadPointPreviewArcLine = null;
    }

    _ensureRoadPointPopup() {
        if (this._roadPointPopup) return;

        const root = document.createElement('div');
        root.className = 'map-debugger-road-point-popup hidden';

        const title = document.createElement('div');
        title.className = 'map-debugger-road-point-popup-title';
        title.textContent = 'Corner radius';

        const input = document.createElement('input');
        input.className = 'map-debugger-road-point-popup-input';
        input.type = 'number';
        input.min = '0';
        input.step = '0.25';

        const actions = document.createElement('div');
        actions.className = 'map-debugger-road-point-popup-actions';

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'map-debugger-road-point-popup-close';
        close.textContent = 'Close';

        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'map-debugger-road-point-popup-close';
        clear.textContent = 'Clear';

        actions.appendChild(clear);
        actions.appendChild(close);

        root.appendChild(title);
        root.appendChild(input);
        root.appendChild(actions);

        close.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._clearRoadPointEditor();
        });

        clear.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._setSelectedRoadPointRadius(null);
        });

        input.addEventListener('change', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const value = Number(input.value);
            const radius = Number.isFinite(value) ? Math.max(0, value) : 0;
            this._setSelectedRoadPointRadius(radius);
        });

        document.body.appendChild(root);
        this._roadPointPopup = root;
        this._roadPointPopupInput = input;
        this._roadPointPopupTitle = title;
        this._roadPointPopupClose = close;
    }

    _getSelectedRoadPointData() {
        const sel = this._selectedRoadPoint;
        const roads = Array.isArray(this._spec?.roads) ? this._spec.roads : [];
        if (!sel) return null;
        const road = roads[sel.roadIndex] ?? null;
        const points = Array.isArray(road?.points) ? road.points : null;
        if (!road || !points) return null;
        const point = points[sel.pointIndex] ?? null;
        const x = point?.x;
        const z = Number.isFinite(point?.z) ? point.z : point?.y;
        if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
        return { road, points, point: { ...point, x, z }, roadIndex: sel.roadIndex, pointIndex: sel.pointIndex };
    }

    _syncRoadPointPopupValue() {
        if (!this._roadPointPopupInput) return;
        const data = this._getSelectedRoadPointData();
        if (!data) return;
        const pointRadius = Number.isFinite(data.point?.radius) ? data.point.radius : null;
        const defaultRadius = Number.isFinite(data.road?.defaultRadius) ? data.road.defaultRadius : 0;
        const value = pointRadius !== null ? pointRadius : defaultRadius;
        this._roadPointPopupInput.value = String(value);
        if (this._roadPointPopupTitle) {
            const idx = data.pointIndex;
            this._roadPointPopupTitle.textContent = `Corner radius (p${idx})`;
        }
    }

    _syncRoadPointPopupPosition() {
        if (!this._roadPointPopupActive || !this._roadPointPopup || !this._selectedRoadPoint) return;
        if (!this.canvas || !this.engine?.camera) return;
        const data = this._getSelectedRoadPointData();
        if (!data) return;

        const rect = this.canvas.getBoundingClientRect?.() ?? null;
        if (!rect) return;

        const v = new THREE.Vector3(data.point.x, 0, data.point.z);
        v.project(this.engine.camera);
        const sx = rect.left + (v.x * 0.5 + 0.5) * rect.width;
        const sy = rect.top + (-v.y * 0.5 + 0.5) * rect.height;

        this._roadPointPopup.style.left = `${Math.round(sx + 12)}px`;
        this._roadPointPopup.style.top = `${Math.round(sy + 12)}px`;
    }

    _setSelectedRoadPointRadius(radius) {
        if (!this._spec || !this._selectedRoadPoint) return;
        const sel = this._selectedRoadPoint;

        const roads = Array.isArray(this._spec.roads) ? this._spec.roads.slice() : [];
        const road = roads[sel.roadIndex] ?? null;
        if (!road || !Array.isArray(road.points)) return;

        const points = road.points.map((p) => {
            const x = p?.x;
            const z = Number.isFinite(p?.z) ? p.z : p?.y;
            if (!Number.isFinite(x) || !Number.isFinite(z)) return p;
            const out = { ...(p ?? {}), x, z };
            if (out.y !== undefined) delete out.y;
            return out;
        });

        const current = points[sel.pointIndex] ?? null;
        if (!current || !Number.isFinite(current.x) || !Number.isFinite(current.z)) return;

        if (radius === null) {
            const next = { ...current };
            delete next.radius;
            points[sel.pointIndex] = next;
        } else {
            points[sel.pointIndex] = { ...current, radius };
        }

        roads[sel.roadIndex] = { ...road, points };
        const nextSpec = { ...this._spec, roads };

        this._applySpec(nextSpec, { resetCamera: false });
        this._selectedRoadPoint = sel;
        this._ensureRoadPointPopup();
        this._roadPointPopupActive = true;
        this._roadPointPopup?.classList.remove('hidden');
        this._syncRoadPointPopupPosition();
        this._syncRoadPointPopupValue();
        this._updateRoadPointPreview();
    }

    _updateRoadPointPreview() {
        if (!this.city?.group) return;
        if (!this._selectedRoadPoint) {
            if (this._roadPointPreviewGroup) this._roadPointPreviewGroup.visible = false;
            return;
        }
        const map = this.city?.map ?? null;
        const data = this._getSelectedRoadPointData();
        if (!map || !data) return;

        const points = Array.isArray(data.road?.points) ? data.road.points : [];
        if (data.pointIndex <= 0 || data.pointIndex >= points.length - 1) {
            if (this._roadPointPreviewGroup) this._roadPointPreviewGroup.visible = false;
            return;
        }

        const chord = Math.max(0.25, map.tileSize * 0.02);
        const tat = generateCenterlineFromPolyline({
            points,
            defaultRadius: data.road?.defaultRadius ?? 0,
            chord
        });
        const corner = Array.isArray(tat?.corners) ? tat.corners.find((c) => c?.index === data.pointIndex) : null;
        if (!corner || corner.ok !== true) {
            if (this._roadPointPreviewGroup) this._roadPointPreviewGroup.visible = false;
            return;
        }

        if (!this._roadPointPreviewGroup) {
            this._roadPointPreviewGroup = new THREE.Group();
            this._roadPointPreviewGroup.name = 'RoadPointPreview';
            this._roadPointPreviewGroup.renderOrder = 40;
            this.city.group.add(this._roadPointPreviewGroup);
        } else if (this._roadPointPreviewGroup.parent !== this.city.group) {
            this._roadPointPreviewGroup.removeFromParent();
            this.city.group.add(this._roadPointPreviewGroup);
        }

        if (!this._roadPointPreviewMat) {
            this._roadPointPreviewMat = new THREE.LineBasicMaterial({ color: 0xff9f0a, transparent: true, opacity: 0.9 });
        }

        const y = this._overlaySurfaceY() + 0.05;
        const tangentPos = new Float32Array([
            corner.inTangent.x, y, corner.inTangent.z,
            data.point.x, y, data.point.z,
            corner.outTangent.x, y, corner.outTangent.z
        ]);
        const tangentGeo = new THREE.BufferGeometry();
        tangentGeo.setAttribute('position', new THREE.BufferAttribute(tangentPos, 3));

        const arcPts = [];
        const center = corner.center;
        const r = corner.radiusUsed;
        const startAng = corner.startAng;
        const spanAng = corner.spanAng;
        const ccw = corner.ccw === true;
        const segs = Math.max(12, Math.ceil((r * spanAng) / chord));
        const dir = ccw ? 1 : -1;
        for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const a = startAng + dir * spanAng * t;
            arcPts.push(center.x + Math.cos(a) * r, y, center.z + Math.sin(a) * r);
        }
        const arcGeo = new THREE.BufferGeometry();
        arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arcPts), 3));

        if (this._roadPointPreviewTangentLine) {
            this._roadPointPreviewTangentLine.geometry.dispose?.();
            this._roadPointPreviewTangentLine.geometry = tangentGeo;
        } else {
            this._roadPointPreviewTangentLine = new THREE.Line(tangentGeo, this._roadPointPreviewMat);
            this._roadPointPreviewTangentLine.name = 'RoadPointTangents';
            this._roadPointPreviewGroup.add(this._roadPointPreviewTangentLine);
        }

        if (this._roadPointPreviewArcLine) {
            this._roadPointPreviewArcLine.geometry.dispose?.();
            this._roadPointPreviewArcLine.geometry = arcGeo;
        } else {
            this._roadPointPreviewArcLine = new THREE.Line(arcGeo, this._roadPointPreviewMat);
            this._roadPointPreviewArcLine.name = 'RoadPointArc';
            this._roadPointPreviewGroup.add(this._roadPointPreviewArcLine);
        }

        this._roadPointPreviewGroup.visible = true;
    }

    _setHoveredBuilding(building) {
        this._hoverBuildingTiles = Array.isArray(building?.tiles) ? building.tiles : null;
        this._syncBuildingHoverOverlay();
    }

    _setupHighlight() {
        this._clearHighlight();
        const map = this.city?.map;
        if (!map) return;
        const highlight = createRoadHighlightMesh({
            color: 0xfff3a3,
            opacity: HIGHLIGHT_OPACITY,
            renderOrder: 20,
            depthTest: false,
            depthWrite: false
        });
        this._highlightGeo = highlight.geo;
        this._highlightPos = highlight.positions;
        this._highlightMat = highlight.mat;
        this._highlightMesh = highlight.mesh;
        const roadCfg = this.city?.generatorConfig?.road ?? {};
        const groundCfg = this.city?.generatorConfig?.ground ?? {};
        const baseRoadY = roadCfg.surfaceY ?? 0.02;
        const curbHeight = roadCfg.curb?.height ?? 0.17;
        const groundY = groundCfg.surfaceY ?? (baseRoadY + curbHeight);
        const roadY = groundY;
        this._highlightY = roadY + HIGHLIGHT_LIFT;
        this.city.group.add(this._highlightMesh);
    }

    _clearHighlight() {
        if (this._highlightMesh) this._highlightMesh.removeFromParent();
        if (this._highlightGeo) this._highlightGeo.dispose();
        if (this._highlightMat) this._highlightMat.dispose();
        this._highlightMesh = null;
        this._highlightGeo = null;
        this._highlightMat = null;
        this._highlightPos = null;
    }

    _clearSelectionOverlays() {
        if (this._selectionOverlayMesh) this._selectionOverlayMesh.removeFromParent();
        if (this._selectionOverlayGeo) this._selectionOverlayGeo.dispose();
        if (this._selectionOverlayMat) this._selectionOverlayMat.dispose();
        if (this._roadStartOverlayMesh) this._roadStartOverlayMesh.removeFromParent();
        if (this._roadStartOverlayGeo) this._roadStartOverlayGeo.dispose();
        if (this._roadStartOverlayMat) this._roadStartOverlayMat.dispose();
        if (this._roadDraftMarkerMesh) this._roadDraftMarkerMesh.removeFromParent();
        if (this._roadDraftMarkerGeo) this._roadDraftMarkerGeo.dispose();
        if (this._roadDraftMarkerMat) this._roadDraftMarkerMat.dispose();
        if (this._edgeConnectionLine) this._edgeConnectionLine.removeFromParent();
        if (this._edgeConnectionLine?.geometry) this._edgeConnectionLine.geometry.dispose?.();
        if (this._edgeConnectionMaterial) this._edgeConnectionMaterial.dispose?.();
        this._edgeConnectionLine = null;
        this._edgeConnectionMaterial = null;
        this._clearRoadDraftPreview();
        if (this._buildingHoverOverlayMesh) this._buildingHoverOverlayMesh.removeFromParent();
        if (this._buildingHoverOverlayGeo) this._buildingHoverOverlayGeo.dispose();
        if (this._buildingHoverOverlayMat) this._buildingHoverOverlayMat.dispose();
        if (this._buildingSelectionOutlineLine) this._buildingSelectionOutlineLine.removeFromParent();
        if (this._buildingSelectionOutlineLine?.geometry) this._buildingSelectionOutlineLine.geometry.dispose?.();
        if (this._buildingSelectionOutlineMaterial) this._buildingSelectionOutlineMaterial.dispose?.();
        this._selectionOverlayMesh = null;
        this._selectionOverlayGeo = null;
        this._selectionOverlayMat = null;
        this._roadStartOverlayMesh = null;
        this._roadStartOverlayGeo = null;
        this._roadStartOverlayMat = null;
        this._roadDraftMarkerMesh = null;
        this._roadDraftMarkerGeo = null;
        this._roadDraftMarkerMat = null;
        this._buildingHoverOverlayMesh = null;
        this._buildingHoverOverlayGeo = null;
        this._buildingHoverOverlayMat = null;
        this._buildingSelectionOutlineLine = null;
        this._buildingSelectionOutlineMaterial = null;
    }

    _setupSelectionOverlays() {
        this._clearSelectionOverlays();
        const map = this.city?.map ?? null;
        if (!map) return;

        const tileSize = map.tileSize ?? 1;
        const baseGeo = new THREE.PlaneGeometry(tileSize * 0.94, tileSize * 0.94, 1, 1);
        baseGeo.rotateX(-Math.PI / 2);

        const selMat = new THREE.MeshBasicMaterial({
            color: 0x34c759,
            transparent: true,
            opacity: 0.28,
            depthTest: false,
            depthWrite: false
        });

        const max = Math.max(1, map.width * map.height);
        const selMesh = new THREE.InstancedMesh(baseGeo, selMat, max);
        selMesh.name = 'EditorSelectionTiles';
        selMesh.renderOrder = 40;
        selMesh.frustumCulled = false;
        this._selectionOverlayGeo = baseGeo;
        this._selectionOverlayMat = selMat;
        this._selectionOverlayMesh = selMesh;
        this.city.group.add(selMesh);

        const hoverGeo = new THREE.PlaneGeometry(tileSize * 0.96, tileSize * 0.96, 1, 1);
        hoverGeo.rotateX(-Math.PI / 2);

        const hoverMat = new THREE.MeshBasicMaterial({
            color: 0xfff3a3,
            transparent: true,
            opacity: 0.22,
            depthTest: false,
            depthWrite: false
        });

        const hoverMesh = new THREE.InstancedMesh(hoverGeo, hoverMat, max);
        hoverMesh.name = 'EditorHoveredBuildingTiles';
        hoverMesh.renderOrder = 39;
        hoverMesh.frustumCulled = false;
        hoverMesh.visible = false;
        this._buildingHoverOverlayGeo = hoverGeo;
        this._buildingHoverOverlayMat = hoverMat;
        this._buildingHoverOverlayMesh = hoverMesh;
        this.city.group.add(hoverMesh);

        const outline = createHoverOutlineLine({
            renderer: this.engine?.renderer ?? null,
            color: 0xff3b30,
            lineWidth: 5,
            opacity: 1.0,
            renderOrder: 42,
            depthTest: false,
            depthWrite: false
        });
        outline.line.name = 'EditorBuildingSelectionOutline';
        this._buildingSelectionOutlineLine = outline.line;
        this._buildingSelectionOutlineMaterial = outline.material;
        this.city.group.add(outline.line);

        const startGeo = new THREE.PlaneGeometry(tileSize * 0.86, tileSize * 0.86, 1, 1);
        startGeo.rotateX(-Math.PI / 2);
        const startMat = new THREE.MeshBasicMaterial({
            color: 0xff9500,
            transparent: true,
            opacity: 0.38,
            depthTest: false,
            depthWrite: false
        });
        const startMesh = new THREE.Mesh(startGeo, startMat);
        startMesh.name = 'EditorRoadStartTile';
        startMesh.renderOrder = 41;
        startMesh.frustumCulled = false;
        startMesh.visible = false;
        this._roadStartOverlayGeo = startGeo;
        this._roadStartOverlayMat = startMat;
        this._roadStartOverlayMesh = startMesh;
        this.city.group.add(startMesh);

        const ringOuter = tileSize * 0.22;
        const ringInner = tileSize * 0.18;
        const markerGeo = new THREE.RingGeometry(ringInner, ringOuter, 36, 1);
        markerGeo.rotateX(-Math.PI / 2);
        const markerMat = new THREE.MeshBasicMaterial({
            color: 0xff9f0a,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const markerMesh = new THREE.InstancedMesh(markerGeo, markerMat, 512);
        markerMesh.name = 'EditorRoadDraftMarkers';
        markerMesh.renderOrder = 42;
        markerMesh.frustumCulled = false;
        markerMesh.visible = false;
        this._roadDraftMarkerGeo = markerGeo;
        this._roadDraftMarkerMat = markerMat;
        this._roadDraftMarkerMesh = markerMesh;
        this.city.group.add(markerMesh);

        const edgeLine = createHoverOutlineLine({
            renderer: this.engine?.renderer ?? null,
            color: 0x0a84ff,
            lineWidth: 6,
            opacity: 0.95,
            renderOrder: 44,
            depthTest: false,
            depthWrite: false
        });
        edgeLine.line.name = 'EditorEdgeConnectionHoverLine';
        this._edgeConnectionLine = edgeLine.line;
        this._edgeConnectionMaterial = edgeLine.material;
        this.city.group.add(edgeLine.line);

        const previewGroup = new THREE.Group();
        previewGroup.name = 'EditorRoadDraftPreview';
        previewGroup.visible = false;
        this._roadDraftPreviewGroup = previewGroup;
        this.city.group.add(previewGroup);

        this._syncSelectionOverlay();
        this._syncBuildingHoverOverlay();
        this._syncRoadStartOverlay();
        this._syncRoadDraftMarkers();
        this._syncRoadDraftPreview();
    }

    _clearEdgeConnectionHover() {
        const line = this._edgeConnectionLine;
        if (!line) return;
        line.visible = false;
        if (line.geometry?.setPositions) {
            line.geometry.setPositions([]);
            line.geometry.computeBoundingSphere?.();
        }
    }

    _updateEdgeConnectionHover(hit) {
        const line = this._edgeConnectionLine;
        const city = this.city;
        if (!line || !city) return;
        if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.z)) {
            this._clearEdgeConnectionHover();
            return;
        }
        if (this._hoverConnectorIndex >= 0) {
            this._clearEdgeConnectionHover();
            return;
        }

        const debug = city?.roads?.debug ?? null;
        const edges = Array.isArray(debug?.edges) ? debug.edges : [];
        const joins = Array.isArray(debug?.cornerJoins) ? debug.cornerJoins : [];
        const map = city?.map ?? null;
        if (!map || !edges.length || !joins.length) {
            this._clearEdgeConnectionHover();
            return;
        }

        const tileSize = Number.isFinite(map.tileSize) ? map.tileSize : 1;
        const threshold = clamp(tileSize * 0.08, 0.75, 3.0);
        const maxDistSq = threshold * threshold;

        let best = null;
        let bestD2 = maxDistSq;
        for (const edge of edges) {
            const edgeId = edge?.edgeId ?? null;
            if (!edgeId) continue;
            const ends = [edge?.a ?? null, edge?.b ?? null];
            for (const nodeId of ends) {
                if (!nodeId) continue;
                const boundary = edgeBoundaryAtNode(edge, nodeId);
                if (!boundary?.left || !boundary?.right) continue;
                for (const side of ['left', 'right']) {
                    const p = boundary[side];
                    if (!p) continue;
                    const dx = (p.x ?? 0) - hit.x;
                    const dz = (p.z ?? 0) - hit.z;
                    const d2 = dx * dx + dz * dz;
                    if (d2 < bestD2) {
                        bestD2 = d2;
                        best = { nodeId, edgeId, side, point: p };
                    }
                }
            }
        }

        if (!best) {
            this._clearEdgeConnectionHover();
            return;
        }

        const join = joins.find((j) => j?.nodeId === best.nodeId && Array.isArray(j?.connections) && j.connections.length) ?? null;
        if (!join) {
            this._clearEdgeConnectionHover();
            return;
        }

        const connections = Array.isArray(join.connections) ? join.connections : [];
        let target = null;
        for (const conn of connections) {
            const a = conn?.a ?? null;
            const b = conn?.b ?? null;
            if (a?.edgeId === best.edgeId && a?.side === best.side) {
                target = b;
                break;
            }
            if (b?.edgeId === best.edgeId && b?.side === best.side) {
                target = a;
                break;
            }
        }
        if (!target?.edgeId || (target.side !== 'left' && target.side !== 'right')) {
            this._clearEdgeConnectionHover();
            return;
        }

        const edgeById = new Map(edges.map((e) => [e.edgeId, e]));
        const targetEdge = edgeById.get(target.edgeId) ?? null;
        if (!targetEdge) {
            this._clearEdgeConnectionHover();
            return;
        }
        const targetBoundary = edgeBoundaryAtNode(targetEdge, best.nodeId);
        const targetPoint = targetBoundary?.[target.side] ?? null;
        if (!targetPoint) {
            this._clearEdgeConnectionHover();
            return;
        }

        const roadY = Number.isFinite(city?.generatorConfig?.road?.surfaceY) ? city.generatorConfig.road.surfaceY : 0.02;
        const y = roadY + 0.08;
        line.geometry?.setPositions?.([
            best.point.x, y, best.point.z,
            targetPoint.x, y, targetPoint.z
        ]);
        line.geometry?.computeBoundingSphere?.();
        line.visible = true;
    }

    _clearRoadDraftPreview() {
        const group = this._roadDraftPreviewGroup;
        if (!group) return;
        const children = group.children.slice();
        for (const child of children) {
            child.removeFromParent();
            child.traverse((obj) => {
                if (obj?.geometry) obj.geometry.dispose?.();
                if (obj?.material) disposeMaterial(obj.material);
            });
        }
        if (group.parent) group.removeFromParent();
        this._roadDraftPreviewGroup = null;
    }

    _syncRoadDraftMarkers() {
        const mesh = this._roadDraftMarkerMesh;
        const map = this.city?.map ?? null;
        if (!mesh || !map) return;

        if (!this._roadModeEnabled) {
            mesh.visible = false;
            mesh.count = 0;
            return;
        }

        const draft = Array.isArray(this._roadDraftPoints) ? this._roadDraftPoints : [];
        if (!draft.length) {
            mesh.visible = false;
            mesh.count = 0;
            return;
        }

        const dummy = new THREE.Object3D();
        const y = this._overlaySurfaceY() + 0.002;
        let count = 0;
        for (const p of draft) {
            const x = p?.x;
            const yTile = p?.y;
            if (!Number.isFinite(x) || !Number.isFinite(yTile)) continue;
            if (!map.inBounds(x | 0, yTile | 0)) continue;
            const w = map.tileToWorldCenter(x | 0, yTile | 0);
            dummy.position.set(w.x, y, w.z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(count, dummy.matrix);
            count += 1;
        }
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.visible = count > 0;
    }

    _syncRoadDraftPreview() {
        const group = this._roadDraftPreviewGroup;
        const map = this.city?.map ?? null;
        if (!group || !map) return;

        if (!this._roadModeEnabled) {
            group.visible = false;
            this._clearDraftPreviewChildren(group);
            return;
        }

        const draft = Array.isArray(this._roadDraftPoints) ? this._roadDraftPoints : [];
        if (draft.length < 2) {
            group.visible = false;
            this._clearDraftPreviewChildren(group);
            return;
        }

        this._clearDraftPreviewChildren(group);
        group.visible = true;

        const origin = map.origin ?? { x: 0, z: 0 };
        const tileSize = map.tileSize ?? 1;
        const tag = this._roadParams?.tag ?? 'road';
        const lanesF = this._roadParams?.lanesF ?? 1;
        const lanesB = this._roadParams?.lanesB ?? 1;
        const config = this.city?.generatorConfig ?? {};
        const debugMode = (config?.render?.roadMode ?? null) === 'debug';
        const baseMats = (!debugMode) ? (this.city?.materials ?? null) : null;
        const previewMaterials = baseMats ? {
            road: baseMats.road?.clone?.() ?? baseMats.road,
            curb: baseMats.curb?.clone?.() ?? baseMats.curb,
            sidewalk: baseMats.sidewalk?.clone?.() ?? baseMats.sidewalk,
            laneWhite: baseMats.laneWhite?.clone?.() ?? baseMats.laneWhite,
            laneYellow: baseMats.laneYellow?.clone?.() ?? baseMats.laneYellow
        } : {};

        const previewLift = ROAD_SURFACE_LIFT + 0.001;

        for (let i = 0; i + 1 < draft.length; i++) {
            const aTile = draft[i];
            const bTile = draft[i + 1];
            const draftRoads = [
                {
                    id: `draft_${i}`,
                    name: tag,
                    lanesF,
                    lanesB,
                    points: [
                        { tileX: aTile.x | 0, tileY: aTile.y | 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
                        { tileX: bTile.x | 0, tileY: bTile.y | 0, offsetU: 0, offsetV: 0, tangentFactor: 1 }
                    ]
                }
            ];
            const roads = createRoadEngineRoads({
                map,
                roads: draftRoads,
                config,
                materials: previewMaterials,
                options: { includeCurbs: false, includeSidewalks: false, includeMarkings: false, includeDebug: false }
            });
            const segmentGroup = roads?.group ?? null;
            if (!segmentGroup) continue;
            segmentGroup.name = `RoadDraftPreviewSegment_${i}`;
            segmentGroup.position.y += previewLift;
            group.add(segmentGroup);
        }
    }

    _clearDraftPreviewChildren(group) {
        const children = group.children.slice();
        for (const child of children) {
            child.removeFromParent();
            child.traverse((obj) => {
                if (obj?.geometry) obj.geometry.dispose?.();
                if (obj?.material) disposeMaterial(obj.material);
            });
        }
    }

    _overlaySurfaceY() {
        const roadCfg = this.city?.generatorConfig?.road ?? {};
        const groundCfg = this.city?.generatorConfig?.ground ?? {};
        const baseRoadY = roadCfg.surfaceY ?? 0.02;
        const curbHeight = roadCfg.curb?.height ?? 0.17;
        const groundY = groundCfg.surfaceY ?? (baseRoadY + curbHeight);
        return groundY + ROAD_SURFACE_LIFT;
    }

    _syncSelectionOverlay() {
        const mesh = this._selectionOverlayMesh;
        const map = this.city?.map ?? null;
        if (!mesh || !map) return;

        const dummy = new THREE.Object3D();
        const y = this._overlaySurfaceY();
        let count = 0;
        for (const idx of this._buildingSelection) {
            const x = idx % map.width;
            const yTile = Math.floor(idx / map.width);
            if (!map.inBounds(x, yTile)) continue;
            const p = map.tileToWorldCenter(x, yTile);
            dummy.position.set(p.x, y, p.z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(count++, dummy.matrix);
        }
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        this._syncBuildingSelectionOutline();
    }

    _syncRoadStartOverlay() {
        const mesh = this._roadStartOverlayMesh;
        const map = this.city?.map ?? null;
        if (!mesh || !map) return;
        const start = this._roadDraftStart;
        if (!start) {
            mesh.visible = false;
            return;
        }
        const x = start.x | 0;
        const yTile = start.y | 0;
        if (!map.inBounds(x, yTile)) {
            mesh.visible = false;
            return;
        }
        const p = map.tileToWorldCenter(x, yTile);
        mesh.position.set(p.x, this._overlaySurfaceY(), p.z);
        mesh.rotation.set(0, 0, 0);
        mesh.visible = true;
    }

    _selectionPlanY() {
        const roadCfg = this.city?.generatorConfig?.road ?? {};
        const baseRoadY = Number.isFinite(roadCfg.surfaceY) ? roadCfg.surfaceY : 0;
        const curbHeight = Number.isFinite(roadCfg?.curb?.height) ? roadCfg.curb.height : 0;
        const curbExtra = Number.isFinite(roadCfg?.curb?.extraHeight) ? roadCfg.curb.extraHeight : 0;
        const sidewalkLift = Number.isFinite(roadCfg?.sidewalk?.lift) ? roadCfg.sidewalk.lift : 0;
        const sidewalkWidth = Number.isFinite(roadCfg?.sidewalk?.extraWidth) ? roadCfg.sidewalk.extraWidth : 0;
        const hasSidewalk = sidewalkWidth > EPS;

        const groundY = this.city?.generatorConfig?.ground?.surfaceY ?? baseRoadY;
        const sidewalkSurfaceY = hasSidewalk ? (baseRoadY + curbHeight + curbExtra + sidewalkLift) : null;
        const planBase = (hasSidewalk && Number.isFinite(sidewalkSurfaceY))
            ? sidewalkSurfaceY
            : (Number.isFinite(baseRoadY) ? baseRoadY : (Number.isFinite(groundY) ? groundY : 0));
        return planBase + 0.07;
    }

    _syncBuildingSelectionOutline() {
        const line = this._buildingSelectionOutlineLine;
        const map = this.city?.map ?? null;
        if (!line || !map) return;

        const selection = this._buildingSelection;
        if (!this._buildingModeEnabled || !selection?.size) {
            line.visible = false;
            line.geometry.setPositions([]);
            line.geometry.computeBoundingSphere?.();
            return;
        }

        const tiles = [];
        for (const idx of selection) {
            const x = idx % map.width;
            const y = Math.floor(idx / map.width);
            if (!map.inBounds(x, y)) continue;
            tiles.push([x, y]);
        }

        const loops = computeBuildingLoopsFromTiles({
            map,
            tiles,
            generatorConfig: this.city?.generatorConfig ?? null,
            tileSize: map.tileSize,
            occupyRatio: 1.0
        });

        const y = this._selectionPlanY();
        const positions = [];
        for (const loop of loops) {
            if (!loop || loop.length < 2) continue;
            for (let i = 0; i < loop.length; i++) {
                const a = loop[i];
                const b = loop[(i + 1) % loop.length];
                positions.push(a.x, y, a.z, b.x, y, b.z);
            }
        }

        if (!positions.length) {
            line.visible = false;
            line.geometry.setPositions([]);
            line.geometry.computeBoundingSphere?.();
            return;
        }

        line.geometry.setPositions(positions);
        line.geometry.computeBoundingSphere?.();
        line.visible = true;
    }

    _syncBuildingHoverOverlay() {
        const mesh = this._buildingHoverOverlayMesh;
        const map = this.city?.map ?? null;
        if (!mesh || !map) return;

        const tiles = Array.isArray(this._hoverBuildingTiles) ? this._hoverBuildingTiles : [];
        if (!tiles.length) {
            mesh.visible = false;
            mesh.count = 0;
            mesh.instanceMatrix.needsUpdate = true;
            return;
        }

        const dummy = new THREE.Object3D();
        const y = this._overlaySurfaceY();
        let count = 0;
        for (const tile of tiles) {
            const x = Array.isArray(tile) ? tile[0] : tile?.x;
            const yTile = Array.isArray(tile) ? tile[1] : tile?.y;
            if (!Number.isFinite(x) || !Number.isFinite(yTile)) continue;
            const tx = x | 0;
            const ty = yTile | 0;
            if (!map.inBounds(tx, ty)) continue;
            const p = map.tileToWorldCenter(tx, ty);
            dummy.position.set(p.x, y, p.z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(count++, dummy.matrix);
        }

        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.visible = count > 0;
    }

    _setupCollisionMarkers() {
        this._clearCollisionMarkers();
        const city = this.city;
        const map = city?.map ?? null;
        if (!map) return;
        const collisionMarkers = [];
        const connectionMarkers = [];
        const adjustedEndRings = [];
        const adjustedEndOrigins = [];
        const roads = Array.isArray(map.roadSegments) ? map.roadSegments : [];
        for (const road of roads) {
            const collisionPoles = road?.poles?.collision;
            if (Array.isArray(collisionPoles)) {
                for (const pole of collisionPoles) {
                    if (!pole || !Number.isFinite(pole.x) || !Number.isFinite(pole.z)) continue;
                    collisionMarkers.push(pole);
                }
            }
            const connectionPoles = road?.poles?.connection;
            if (Array.isArray(connectionPoles)) {
                for (const pole of connectionPoles) {
                    if (!pole || !Number.isFinite(pole.x) || !Number.isFinite(pole.z)) continue;
                    connectionMarkers.push(pole);
                }
            }
            const adjustedEndPoles = road?.poles?.adjustedEnd;
            if (Array.isArray(adjustedEndPoles)) {
                for (const entry of adjustedEndPoles) {
                    const adjusted = entry?.adjusted;
                    if (adjusted && Number.isFinite(adjusted.x) && Number.isFinite(adjusted.z)) {
                        adjustedEndRings.push(adjusted);
                    }
                    const original = entry?.original;
                    if (original && Number.isFinite(original.x) && Number.isFinite(original.z)) {
                        adjustedEndOrigins.push(original);
                    }
                }
            }
        }
        if (!collisionMarkers.length && !connectionMarkers.length && !adjustedEndRings.length && !adjustedEndOrigins.length) return;
        const roadCfg = city?.generatorConfig?.road ?? {};
        const groundCfg = city?.generatorConfig?.ground ?? {};
        const baseRoadY = roadCfg.surfaceY ?? 0.02;
        const curbHeight = roadCfg.curb?.height ?? 0.17;
        const groundY = groundCfg.surfaceY ?? (baseRoadY + curbHeight);
        const roadY = groundY;
        const markerY = roadY + COLLISION_MARKER_LIFT;
        const curbT = roadCfg.curb?.thickness ?? DEFAULT_CURB_THICKNESS;
        const endPoleRadius = Math.max(POLE_DOT_RADIUS_MIN, curbT * POLE_DOT_RADIUS_FACTOR * POLE_DOT_SCALE);
        const radius = endPoleRadius * COLLISION_POLE_SCALE;
        const ringInner = endPoleRadius * 1.2;
        const ringOuter = endPoleRadius * 1.7;
        const originRadius = Math.max(POLE_DOT_RADIUS_MIN * 0.6, endPoleRadius * 0.6);
        if (collisionMarkers.length) {
            const result = createCollisionPoleMarkers({
                points: collisionMarkers,
                radius,
                y: markerY,
                color: COLLISION_MARKER_COLOR_HEX,
                opacity: COLLISION_MARKER_OPACITY,
                segments: COLLISION_MARKER_SEGMENTS,
                renderOrder: 25,
                visible: this._collisionDebugEnabled
            });
            if (result) {
                this._collisionMarkerGeo = result.geo;
                this._collisionMarkerMat = result.mat;
                this._collisionMarkerMesh = result.mesh;
                city.group.add(this._collisionMarkerMesh);
            }
        }
        if (connectionMarkers.length) {
            const result = createConnectionPoleMarkers({
                points: connectionMarkers,
                radius,
                y: markerY,
                color: CONNECTION_MARKER_COLOR_HEX,
                opacity: CONNECTION_MARKER_OPACITY,
                segments: COLLISION_MARKER_SEGMENTS,
                renderOrder: 24,
                visible: this._collisionDebugEnabled
            });
            if (result) {
                this._connectionMarkerGeo = result.geo;
                this._connectionMarkerMat = result.mat;
                this._connectionMarkerMesh = result.mesh;
                city.group.add(this._connectionMarkerMesh);
            }
        }
        if (adjustedEndRings.length) {
            const result = createAdjustedEndRingMarkers({
                points: adjustedEndRings,
                innerRadius: ringInner,
                outerRadius: ringOuter,
                y: markerY,
                color: ADJUSTED_END_RING_COLOR_HEX,
                opacity: ADJUSTED_END_RING_OPACITY,
                segments: COLLISION_MARKER_SEGMENTS,
                renderOrder: 26,
                visible: this._collisionDebugEnabled
            });
            if (result) {
                this._adjustedEndRingGeo = result.geo;
                this._adjustedEndRingMat = result.mat;
                this._adjustedEndRingMesh = result.mesh;
                city.group.add(this._adjustedEndRingMesh);
            }
        }
        if (adjustedEndOrigins.length) {
            const result = createAdjustedEndOriginMarkers({
                points: adjustedEndOrigins,
                radius: originRadius,
                y: markerY,
                color: ADJUSTED_END_ORIGIN_COLOR_HEX,
                opacity: ADJUSTED_END_ORIGIN_OPACITY,
                segments: COLLISION_MARKER_SEGMENTS,
                renderOrder: 23,
                visible: this._collisionDebugEnabled
            });
            if (result) {
                this._adjustedEndOriginGeo = result.geo;
                this._adjustedEndOriginMat = result.mat;
                this._adjustedEndOriginMesh = result.mesh;
                city.group.add(this._adjustedEndOriginMesh);
            }
        }
    }

    _clearCollisionMarkers() {
        if (this._collisionMarkerMesh) this._collisionMarkerMesh.removeFromParent();
        if (this._collisionMarkerGeo) this._collisionMarkerGeo.dispose();
        if (this._collisionMarkerMat) this._collisionMarkerMat.dispose();
        if (this._connectionMarkerMesh) this._connectionMarkerMesh.removeFromParent();
        if (this._connectionMarkerGeo) this._connectionMarkerGeo.dispose();
        if (this._connectionMarkerMat) this._connectionMarkerMat.dispose();
        if (this._adjustedEndRingMesh) this._adjustedEndRingMesh.removeFromParent();
        if (this._adjustedEndRingGeo) this._adjustedEndRingGeo.dispose();
        if (this._adjustedEndRingMat) this._adjustedEndRingMat.dispose();
        if (this._adjustedEndOriginMesh) this._adjustedEndOriginMesh.removeFromParent();
        if (this._adjustedEndOriginGeo) this._adjustedEndOriginGeo.dispose();
        if (this._adjustedEndOriginMat) this._adjustedEndOriginMat.dispose();
        this._collisionMarkerMesh = null;
        this._collisionMarkerGeo = null;
        this._collisionMarkerMat = null;
        this._connectionMarkerMesh = null;
        this._connectionMarkerGeo = null;
        this._connectionMarkerMat = null;
        this._adjustedEndRingMesh = null;
        this._adjustedEndRingGeo = null;
        this._adjustedEndRingMat = null;
        this._adjustedEndOriginMesh = null;
        this._adjustedEndOriginGeo = null;
        this._adjustedEndOriginMat = null;
    }

    _setupConnectorOverlay() {
        const city = this.city;
        if (!city) return;
        const tileSize = city.map?.tileSize ?? 1;
        const roadCfg = city.generatorConfig?.road ?? {};
        const groundCfg = city.generatorConfig?.ground ?? {};
        const roadY = roadCfg.surfaceY ?? 0.02;
        const curbHeight = roadCfg.curb?.height ?? 0.17;
        const curbExtra = roadCfg.curb?.extraHeight ?? 0.0;
        const curbSink = roadCfg.curb?.sink ?? 0.03;
        const groundY = groundCfg.surfaceY ?? (roadY + curbHeight);
        const curbLift = Math.max(curbExtra, Math.min(0.06, curbHeight * 0.25));
        const curbTop = groundY + curbLift;
        const markerY = roadY + 0.003;
        const lineY = curbTop + 0.04;
        const markerRadius = Math.max(0.35, tileSize * 0.07);
        const arrowLen = Math.max(0.5, (roadCfg.curves?.turnRadius ?? 4) * 0.35);
        const overlay = new CityConnectorDebugOverlay(this.engine, {
            markerY,
            markerRadius,
            arrowLen,
            lineY
        });
        overlay.setConnectors(city.roads?.curbConnectors ?? []);
        overlay.setEnabled(this._connectorDebugEnabled);
        city.group.add(overlay.group);
        this._connectorOverlay = overlay;
        const hoverY = Math.max(roadY, groundY);
        this._hoverPlane.set(new THREE.Vector3(0, 1, 0), -hoverY);
        this._hoverThreshold = markerRadius * 2.4;
    }

    _clearConnectorOverlay() {
        if (!this._connectorOverlay) return;
        this._connectorOverlay.destroy();
        this._connectorOverlay = null;
        this._hoverConnectorIndex = -1;
        this._hoverPoleIndex = -1;
    }

    _setupRoadGraphOverlay() {
        const city = this.city;
        if (!city) return;
        const network = city?.map?.roadNetwork ?? null;
        const edges = city?.roads?.debug?.edges ?? [];
        const intersections = city?.roads?.debug?.intersections ?? [];
        if (!network || (!edges.length && !intersections.length)) return;

        const roadCfg = city.generatorConfig?.road ?? {};
        const laneWidth = Number.isFinite(roadCfg.laneWidth) ? roadCfg.laneWidth : 4.8;

        if (!this._roadGraphOverlay) {
            const roadY = Number.isFinite(roadCfg.surfaceY) ? roadCfg.surfaceY : 0.02;
            this._roadGraphOverlay = new RoadGraphDebugOverlay(this.engine, { y: roadY + 0.006 });
            city.group.add(this._roadGraphOverlay.group);
        }

        this._roadGraphOverlay.setData({ network, edges, intersections, laneWidth });
        this._roadGraphOverlay.setEdgesEnabled(this._roadEdgesDebugEnabled);
        this._roadGraphOverlay.setCrossingsEnabled(this._roadCrossingsDebugEnabled);
        this._roadGraphOverlay.setCenterlinesEnabled(this._roadCenterlineDebugEnabled);
        this._roadGraphOverlay.setDirectionLinesEnabled(this._roadDirectionLinesDebugEnabled);
        this._roadGraphOverlay.setEndpointsEnabled(this._roadEndpointsDebugEnabled);
    }

    _clearRoadGraphOverlay() {
        if (!this._roadGraphOverlay) return;
        this._roadGraphOverlay.destroy();
        this._roadGraphOverlay = null;
    }

    _setRoadEdgesDebugEnabled(enabled) {
        this._roadEdgesDebugEnabled = !!enabled;
        this.debugsPanel?.setRoadEdgesEnabled(this._roadEdgesDebugEnabled);
        if (!this._roadGraphOverlay && this._roadEdgesDebugEnabled) {
            this._setupRoadGraphOverlay();
        }
        this._roadGraphOverlay?.setEdgesEnabled(this._roadEdgesDebugEnabled);
    }

    _setRoadCrossingsDebugEnabled(enabled) {
        this._roadCrossingsDebugEnabled = !!enabled;
        this.debugsPanel?.setRoadCrossingsEnabled(this._roadCrossingsDebugEnabled);
        if (!this._roadGraphOverlay && this._roadCrossingsDebugEnabled) {
            this._setupRoadGraphOverlay();
        }
        this._roadGraphOverlay?.setCrossingsEnabled(this._roadCrossingsDebugEnabled);
    }

    _setRoadCenterlineDebugEnabled(enabled) {
        this._roadCenterlineDebugEnabled = !!enabled;
        this.debugsPanel?.setRoadCenterlineEnabled(this._roadCenterlineDebugEnabled);
        if (!this._roadGraphOverlay && this._roadCenterlineDebugEnabled) {
            this._setupRoadGraphOverlay();
        }
        this._roadGraphOverlay?.setCenterlinesEnabled(this._roadCenterlineDebugEnabled);
    }

    _setRoadDirectionLinesDebugEnabled(enabled) {
        this._roadDirectionLinesDebugEnabled = !!enabled;
        this.debugsPanel?.setRoadDirectionLinesEnabled(this._roadDirectionLinesDebugEnabled);
        if (!this._roadGraphOverlay && this._roadDirectionLinesDebugEnabled) {
            this._setupRoadGraphOverlay();
        }
        this._roadGraphOverlay?.setDirectionLinesEnabled(this._roadDirectionLinesDebugEnabled);
    }

    _setRoadEndpointsDebugEnabled(enabled) {
        this._roadEndpointsDebugEnabled = !!enabled;
        this.debugsPanel?.setRoadEndpointsEnabled(this._roadEndpointsDebugEnabled);
        if (!this._roadGraphOverlay && this._roadEndpointsDebugEnabled) {
            this._setupRoadGraphOverlay();
        }
        this._roadGraphOverlay?.setEndpointsEnabled(this._roadEndpointsDebugEnabled);
    }

    _setConnectorDebugEnabled(enabled) {
        this._connectorDebugEnabled = !!enabled;
        this._connectorOverlay?.setEnabled(this._connectorDebugEnabled);
        this.debugsPanel?.setConnectorDebugEnabled(this._connectorDebugEnabled);
        if (!this._connectorDebugEnabled) this._clearConnectorHover();
    }

    _setCollisionDebugEnabled(enabled) {
        this._collisionDebugEnabled = !!enabled;
        this.debugsPanel?.setCollisionDebugEnabled(this._collisionDebugEnabled);
        if (this._collisionMarkerMesh) {
            this._collisionMarkerMesh.visible = this._collisionDebugEnabled;
        }
        if (this._connectionMarkerMesh) {
            this._connectionMarkerMesh.visible = this._collisionDebugEnabled;
        }
        if (this._adjustedEndRingMesh) {
            this._adjustedEndRingMesh.visible = this._collisionDebugEnabled;
        }
        if (this._adjustedEndOriginMesh) {
            this._adjustedEndOriginMesh.visible = this._collisionDebugEnabled;
        }
        if (!this._collisionMarkerMesh && !this._connectionMarkerMesh && !this._adjustedEndRingMesh && !this._adjustedEndOriginMesh && this._collisionDebugEnabled) {
            this._setupCollisionMarkers();
        }
    }

    _setTreesEnabled(enabled) {
        this._treesEnabled = !!enabled;
        this.debugsPanel?.setTreesEnabled(this._treesEnabled);

        const currentGen = this._cityOptions.generatorConfig ?? {};
        this._cityOptions.generatorConfig = {
            ...currentGen,
            render: { ...(currentGen.render ?? {}), roadMode: this._roadRenderMode, treesEnabled: this._treesEnabled }
        };

        const treesGroup = this.city?.world?.trees?.group ?? null;
        if (treesGroup) {
            treesGroup.visible = this._treesEnabled;
            return;
        }

        if (this._treesEnabled) {
            this._applySpec(this._spec, { resetCamera: false });
        }
    }

    _setRoadRenderMode(mode) {
        const next = mode === 'normal' ? 'normal' : 'debug';
        if (next === this._roadRenderMode) return;
        this._roadRenderMode = next;
        const current = this._cityOptions.generatorConfig ?? {};
        const render = { ...(current.render ?? {}), roadMode: next, treesEnabled: this._treesEnabled };
        this._cityOptions.generatorConfig = { ...current, render };
        this.debugsPanel?.setRoadRenderMode(this._roadRenderMode);
        this._applySpec(this._spec, { resetCamera: false });
    }

    _setJunctionParams(params) {
        const thresholdFactor = Number(params?.thresholdFactor);
        const filletRadiusFactor = Number(params?.filletRadiusFactor);
        const minThreshold = Number(params?.minThreshold);
        const maxThreshold = params?.maxThreshold === null || params?.maxThreshold === undefined
            ? Infinity
            : Number(params.maxThreshold);
        if (!Number.isFinite(thresholdFactor) || !Number.isFinite(filletRadiusFactor)) return;
        if (!Number.isFinite(minThreshold)) return;
        if (maxThreshold !== Infinity && !Number.isFinite(maxThreshold)) return;

        const nextThresholdFactor = Math.max(0, thresholdFactor);
        const nextFilletRadiusFactor = Math.max(0, Math.min(1, filletRadiusFactor));
        const nextMinThreshold = Math.max(0, minThreshold);
        const nextMaxThreshold = maxThreshold === Infinity ? Infinity : Math.max(nextMinThreshold, maxThreshold);

        if (
            nextThresholdFactor === this._junctionThresholdFactor
            && nextFilletRadiusFactor === this._junctionFilletRadiusFactor
            && nextMinThreshold === this._junctionMinThreshold
            && nextMaxThreshold === this._junctionMaxThreshold
        ) return;

        this._junctionThresholdFactor = nextThresholdFactor;
        this._junctionFilletRadiusFactor = nextFilletRadiusFactor;
        this._junctionMinThreshold = nextMinThreshold;
        this._junctionMaxThreshold = nextMaxThreshold;
        this.debugsPanel?.setJunctionThresholdFactor(nextThresholdFactor);
        this.debugsPanel?.setJunctionFilletRadiusFactor(nextFilletRadiusFactor);
        this.debugsPanel?.setJunctionMinThreshold(nextMinThreshold);
        this.debugsPanel?.setJunctionMaxThreshold(nextMaxThreshold);

        const current = this._cityOptions.generatorConfig ?? {};
        const road = { ...(current.road ?? {}) };
        const junctions = {
            ...(road.junctions ?? {}),
            thresholdFactor: nextThresholdFactor,
            filletRadiusFactor: nextFilletRadiusFactor,
            minThreshold: nextMinThreshold
        };
        if (Number.isFinite(nextMaxThreshold)) junctions.maxThreshold = nextMaxThreshold;
        else delete junctions.maxThreshold;
        road.junctions = junctions;
        this._cityOptions.generatorConfig = { ...current, road };

        this._applySpec(this._spec, { resetCamera: false });
    }

    _setHoverOutlineEnabled(enabled) {
        this._hoverOutlineEnabled = !!enabled;
        this.debugsPanel?.setHoverOutlineEnabled(this._hoverOutlineEnabled);
        if (this._hoverOutlineEnabled) this._ensureHoverOutline();
        else this._clearHoverOutline();
    }

    _handlePointerMove(e) {
        if (this._tourActive) return;

        if (this._cameraDragActive) {
            this._clearEdgeConnectionHover();
            this._setPointerFromEvent(e);
            const hit = this._intersectHoverPlane();
            if (!hit) return;
            const cam = this.engine.camera;
            cam.position.x = this._cameraDragStartCam.x + (this._cameraDragStartWorld.x - hit.x);
            cam.position.z = this._cameraDragStartCam.z + (this._cameraDragStartWorld.z - hit.z);
            return;
        }

        if (this.editorPanel?.root?.contains(e.target) || this.debugsPanel?.root?.contains(e.target) || this.shortcutsPanel?.root?.contains(e.target)) {
            this._clearConnectorHover();
            this._clearEdgeConnectionHover();
            this._clearHoverOutline();
            return;
        }
        this._setPointerFromEvent(e);
        const planeHit = this._intersectHoverPlane();
        if (this._connectorDebugEnabled && this._connectorOverlay) {
            if (!planeHit) {
                this._clearConnectorHover();
            } else {
                const connectors = this.city?.roads?.curbConnectors ?? [];
                if (!connectors.length) {
                    this._clearConnectorHover();
                } else {
                    const maxDistSq = this._hoverThreshold * this._hoverThreshold;
                    let bestDistSq = maxDistSq;
                    let bestIndex = -1;
                    let bestPole = -1;
                    for (let i = 0; i < connectors.length; i++) {
                        const item = connectors[i];
                        const p0 = item?.p0;
                        if (p0) {
                            const dx = p0.x - planeHit.x;
                            const dz = p0.z - planeHit.z;
                            const d2 = dx * dx + dz * dz;
                            if (d2 < bestDistSq) {
                                bestDistSq = d2;
                                bestIndex = i;
                                bestPole = 0;
                            }
                        }
                        const p1 = item?.p1;
                        if (p1) {
                            const dx = p1.x - planeHit.x;
                            const dz = p1.z - planeHit.z;
                            const d2 = dx * dx + dz * dz;
                            if (d2 < bestDistSq) {
                                bestDistSq = d2;
                                bestIndex = i;
                                bestPole = 1;
                            }
                        }
                    }
                    if (bestIndex < 0) {
                        this._clearConnectorHover();
                    } else if (bestIndex !== this._hoverConnectorIndex || bestPole !== this._hoverPoleIndex) {
                        this._hoverConnectorIndex = bestIndex;
                        this._hoverPoleIndex = bestPole;
                        this._connectorOverlay.setHoverSelection({ connectorIndex: bestIndex, poleIndex: bestPole });
                        this._updatePoleInfoFromHover(bestIndex, bestPole);
                    }
                }
            }
        } else {
            this._clearConnectorHover();
        }

        this._updateEdgeConnectionHover(planeHit);

        const hoverHit = this._pickHoverMesh();
        if (this._hoverOutlineEnabled) this._updateHoverOutline(hoverHit);
        else this._clearHoverOutline();
        this._updateHoverInfo(hoverHit);
    }

    _handlePointerDown(e) {
        if (!e) return;
        if (this._tourActive) return;

        if (this.editorPanel?.root?.contains(e.target) || this.debugsPanel?.root?.contains(e.target) || this.shortcutsPanel?.root?.contains(e.target)) {
            return;
        }

        if (!this._roadModeEnabled && !this._buildingModeEnabled) return;

        if (e.button !== 0) return;
        if (!this.city?.map) return;

        this._setPointerFromEvent(e);
        const hit = this._intersectHoverPlane();
        if (!hit) return;

        const tile = this.city.map.worldToTile(hit.x, hit.z);
        const x = tile?.x;
        const y = tile?.y;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (!this.city.map.inBounds(x | 0, y | 0)) return;

        if (this._roadModeEnabled) {
            this._handleRoadToolClick({ x: x | 0, y: y | 0 }, { selectPoint: !!e.shiftKey });
        } else if (this._buildingModeEnabled) {
            this._handleBuildingToolClick({ x: x | 0, y: y | 0 });
        }
    }

    _handlePointerUp() {
        this._stopCameraDrag();
    }

    _handleWheel(e) {
        if (this._tourActive) return;
        if (this._roadModeEnabled || this._buildingModeEnabled) return;
        if (!e) return;
        e.preventDefault();

        const mode = e.deltaMode ?? 0;
        const scale = mode === 1 ? 16 : (mode === 2 ? 400 : 1);
        const delta = (Number(e.deltaY) || 0) * scale;
        if (!Number.isFinite(delta) || delta === 0) return;

        const zoomSpeed = Number.isFinite(this._zoomSpeed) ? this._zoomSpeed : 1;
        const amount = delta * (zoomSpeed / 12000);
        const usedControls = !!this.controls?.dollyBy?.(amount, { immediate: true });

        const orbit = this.controls?.getOrbit?.() ?? null;
        const radius = Number(orbit?.radius);
        if (Number.isFinite(radius)) this._zoom = clamp(radius, this._zoomMin, this._zoomMax);
        else if (!usedControls) this._zoom = clamp((Number(this._zoom) || 0) + amount, this._zoomMin, this._zoomMax);

        this._syncRoadPointPopupPosition();
    }

    _startCameraDrag(e) {
        if (!this.canvas) return;
        if (this._cameraDragActive) return;
        if (this._roadModeEnabled || this._buildingModeEnabled) return;
        if (!e) return;

        this._setPointerFromEvent(e);
        const hit = this._intersectHoverPlane();
        if (!hit) return;

        this._cameraDragActive = true;
        this._cameraDragPointerId = Number.isFinite(e.pointerId) ? e.pointerId : null;
        this._cameraDragStartWorld.copy(hit);
        this._cameraDragStartCam.copy(this.engine.camera.position);
        this._clearConnectorHover();
        this._clearHoverOutline();

        if (this._cameraDragPointerId !== null) {
            try {
                this.canvas.setPointerCapture(this._cameraDragPointerId);
            } catch (err) {
                // Ignore capture failures (e.g. older browsers).
            }
        }
    }

    _stopCameraDrag() {
        if (!this._cameraDragActive) return;
        const id = this._cameraDragPointerId;
        this._cameraDragActive = false;
        this._cameraDragPointerId = null;
        if (this.canvas && id !== null) {
            try {
                this.canvas.releasePointerCapture(id);
            } catch (err) {
                // Ignore release failures.
            }
        }
    }

    _clearConnectorHover() {
        this._hoverConnectorIndex = -1;
        this._hoverPoleIndex = -1;
        this._connectorOverlay?.setHoverSelection(null);
        this._setPoleInfoData(null);
    }

    _handlePointerLeave() {
        this._stopCameraDrag();
        this._clearConnectorHover();
        this._clearEdgeConnectionHover();
        this._clearHoverOutline();
    }

    _setPointerFromEvent(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        this._pointer.set(x * 2 - 1, -(y * 2 - 1));
    }

    _intersectHoverPlane() {
        this._raycaster.setFromCamera(this._pointer, this.engine.camera);
        const hit = new THREE.Vector3();
        const ok = this._raycaster.ray.intersectPlane(this._hoverPlane, hit);
        return ok ? hit : null;
    }

    _setPoleInfoData(data) {
        if (this.poleInfoPanel) this.poleInfoPanel.setData(data);
    }

    _updateHoverInfo(hit) {
        if (this._hoverConnectorIndex >= 0) return;
        const data = this._getHoverInfoData(hit);
        this._setPoleInfoData(data);
    }

    _getHoverInfoData(hit) {
        const obj = hit?.object ?? null;
        if (!obj) return null;
        const info = this._describeHoverObject(obj);
        if (!info?.type) return null;
        const fields = [];
        if (info.part) fields.push({ label: 'Part', value: info.part });
        const baseGeo = obj.geometry ?? null;
        const ranges = baseGeo?.userData?.mergeRanges ?? null;
        const rangeIndex = this._getHoverRangeIndex(ranges, hit?.faceIndex);
        const metaList = baseGeo?.userData?.mergeRangeData ?? null;
        const meta = (rangeIndex !== null && Array.isArray(metaList)) ? metaList[rangeIndex] : null;
        if (meta && typeof meta.kind === 'string') {
            const fmtNum = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '--');
            const fmt = (value) => (value === null || value === undefined ? '--' : String(value));
            fields.push({ label: 'Feature', value: meta.kind });
            if (meta.kind === 'segment') {
                fields.push({ label: 'Edge id', value: fmt(meta.edgeId) });
                fields.push({ label: 'Source id', value: fmt(meta.sourceId) });
                if (meta.tag) fields.push({ label: 'Tag', value: fmt(meta.tag) });
                if (meta.nodeA != null && meta.nodeB != null) fields.push({ label: 'Nodes', value: `${fmt(meta.nodeA)} → ${fmt(meta.nodeB)}` });
                if (Number.isFinite(meta.lanesF) && Number.isFinite(meta.lanesB)) fields.push({ label: 'Lanes', value: `${meta.lanesF}/${meta.lanesB}` });
                if (Number.isFinite(meta.width)) fields.push({ label: 'Width', value: fmtNum(meta.width) });
                if (Number.isFinite(meta.length)) fields.push({ label: 'Length', value: fmtNum(meta.length) });
            } else if (meta.kind === 'intersection') {
                fields.push({ label: 'Node', value: fmt(meta.nodeId) });
                if (Number.isFinite(meta.degree)) fields.push({ label: 'Degree', value: `${meta.degree | 0}` });
            } else if (meta.kind === 'fillet') {
                fields.push({ label: 'Node', value: fmt(meta.nodeId) });
                if (Number.isFinite(meta.radius)) fields.push({ label: 'Radius', value: fmtNum(meta.radius) });
                if (Number.isFinite(meta.spanAng)) fields.push({ label: 'Span', value: fmtNum(meta.spanAng * (180 / Math.PI), 1) + ' deg' });
                if (Number.isFinite(meta.halfWidth)) fields.push({ label: 'Half width', value: fmtNum(meta.halfWidth) });
            } else if (meta.kind === 'join') {
                fields.push({ label: 'Node', value: fmt(meta.nodeId) });
                if (Number.isFinite(meta.cutback)) fields.push({ label: 'Cutback', value: fmtNum(meta.cutback) });
            } else if (meta.kind === 'curb' || meta.kind === 'sidewalk') {
                if (meta.edgeId != null) fields.push({ label: 'Edge id', value: fmt(meta.edgeId) });
                if (meta.nodeId != null) fields.push({ label: 'Node', value: fmt(meta.nodeId) });
            }
        }
        if (info.isTile && hit?.point && this.city?.map) {
            const tile = this.city.map.worldToTile(hit.point.x, hit.point.z);
            if (Number.isFinite(tile?.x) && Number.isFinite(tile?.y) && this.city.map.inBounds(tile.x, tile.y)) {
                fields.push({ label: 'Tile', value: `${tile.x}:${tile.y}` });
            }
        }
        return { type: info.type, fields };
    }

    _describeHoverObject(obj) {
        const userType = this._findUserDataType(obj);
        if (userType) return { type: this._formatTypeLabel(userType) };
        const names = this._getNameChain(obj);
        const lowers = names.map((name) => name.toLowerCase());
        const has = (token) => lowers.some((name) => name.includes(token));
        if (has('groundtiles')) return { type: 'Tile', isTile: true };
        if (has('tilegrid')) return { type: 'Tile grid' };
        if (has('asphalt')) return { type: 'Road', part: 'Asphalt' };
        if (has('markings')) return { type: 'Road', part: 'Markings' };
        if (has('curb')) return { type: 'Road', part: 'Curb' };
        if (has('sidewalk')) return { type: 'Road', part: 'Sidewalk' };
        if (has('roadpoledots') || has('poledot')) return { type: 'Road', part: 'Poles' };
        if (has('roads')) return { type: 'Road' };
        if (has('building')) return { type: 'Building' };
        if (has('bus')) return { type: 'Vehicle' };
        if (has('cityfloor') || has('cityworld')) return { type: 'Ground' };
        if (has('skydome') || has('sky')) return { type: 'Sky' };
        return { type: 'Object' };
    }

    _getNameChain(obj) {
        const names = [];
        let cur = obj;
        while (cur) {
            const name = typeof cur.name === 'string' ? cur.name.trim() : '';
            if (name) names.push(name);
            cur = cur.parent;
        }
        return names;
    }

    _findUserDataType(obj) {
        let cur = obj;
        while (cur) {
            const raw = typeof cur.userData?.type === 'string' ? cur.userData.type.trim() : '';
            if (raw) return raw;
            cur = cur.parent;
        }
        return '';
    }

    _formatTypeLabel(raw) {
        const cleaned = raw.trim();
        if (!cleaned) return '';
        const lower = cleaned.toLowerCase();
        if (lower === 'bus' || lower === 'vehicle' || lower === 'car') return 'Vehicle';
        return cleaned[0].toUpperCase() + cleaned.slice(1);
    }

    _updatePoleInfoFromHover(connectorIndex, poleIndex) {
        const panel = this.poleInfoPanel;
        if (!panel) return;
        const connectors = this.city?.roads?.curbConnectors ?? [];
        const record = connectors[connectorIndex];
        if (!record) {
            panel.setData(null);
            return;
        }
        const pole = poleIndex === 1 ? record?.p1 : record?.p0;
        const connector = record?.connector ?? pole?.connector ?? record?.p0?.connector ?? record?.p1?.connector ?? null;
        const radius = connector?.radius ?? null;
        let poleType = null;
        if (pole) {
            const rawType = typeof pole.type === 'string' ? pole.type.trim() : '';
            if (rawType) {
                poleType = rawType;
            } else if (pole.end) {
                poleType = 'end pole';
            } else if (pole.collisionId != null || pole.cut != null) {
                poleType = 'connection pole';
            } else if (pole.id != null && pole.along != null) {
                poleType = 'collision pole';
            } else {
                poleType = 'pole';
            }
        }
        let collisionDistance = null;
        const collision = pole?.collision ?? null;
        const px = pole?.x;
        const pz = Number.isFinite(pole?.z) ? pole.z : pole?.y;
        const cx = collision?.x;
        const cz = Number.isFinite(collision?.z) ? collision.z : collision?.y;
        if (Number.isFinite(px) && Number.isFinite(pz) && Number.isFinite(cx) && Number.isFinite(cz)) {
            collisionDistance = Math.hypot(cx - px, cz - pz);
        }
        let endDistance = null;
        let endDx = null;
        let endDz = null;
        let lIntersection = null;
        const p0 = record?.p0;
        const p1 = record?.p1;
        const isEndConnector = record?.tag === 'end' || (p0?.end && p1?.end);
        if (isEndConnector && p0 && p1) {
            const p0x = p0.x;
            const p0z = Number.isFinite(p0.z) ? p0.z : p0.y;
            const p1x = p1.x;
            const p1z = Number.isFinite(p1.z) ? p1.z : p1.y;
            if (Number.isFinite(p0x) && Number.isFinite(p0z) && Number.isFinite(p1x) && Number.isFinite(p1z)) {
                const dx = p1x - p0x;
                const dz = p1z - p0z;
                endDistance = Math.hypot(dx, dz);
                endDx = Math.abs(dx);
                endDz = Math.abs(dz);
            }
            let lValue = pole?.lIntersection ?? pole?.lIntersectionSide ?? pole?.intersectionSide ?? pole?.lShape ?? pole?.lShapeSide ?? pole?.cornerSide ?? null;
            if (lValue == null && typeof pole?.insideL === 'boolean') lValue = pole.insideL ? 'inside' : 'outside';
            if (lValue == null && typeof pole?.outsideL === 'boolean') lValue = pole.outsideL ? 'outside' : 'inside';
            if (typeof lValue === 'boolean') lValue = lValue ? 'inside' : 'outside';
            if (typeof lValue === 'string') {
                const normalized = lValue.trim().toLowerCase();
                if (normalized === 'inside' || normalized === 'inner' || normalized === 'in') lIntersection = 'inside';
                else if (normalized === 'outside' || normalized === 'outer' || normalized === 'out') lIntersection = 'outside';
                else lIntersection = lValue;
            }
        }
        const fields = [];
        if (Number.isFinite(radius)) fields.push({ label: 'Radius', value: radius.toFixed(2) });
        const loopIndex = Number.isFinite(pole?.loopIndex) ? pole.loopIndex : null;
        const loopCount = Number.isFinite(pole?.loopCount) ? pole.loopCount : null;
        if (loopIndex != null) {
            const loopLabel = loopCount != null ? `${loopIndex + 1}/${loopCount}` : `${loopIndex + 1}`;
            fields.push({ label: 'Loop idx', value: loopLabel });
        }
        if (Number.isFinite(collisionDistance)) fields.push({ label: 'Collision dist', value: collisionDistance.toFixed(2) });
        const dubinsType = typeof connector?.type === 'string' ? connector.type : null;
        if (dubinsType) fields.push({ label: 'Dubins type', value: dubinsType });
        const segmentLengths = Array.isArray(connector?.segments)
            ? connector.segments.map((segment) => segment?.length).filter((len) => Number.isFinite(len))
            : [];
        if (segmentLengths.length) {
            const segmentLine = segmentLengths.map((len) => len.toFixed(2)).join(', ');
            fields.push({ label: 'Segment lengths', value: segmentLine });
        }
        if (Number.isFinite(endDistance) && Number.isFinite(endDx) && Number.isFinite(endDz)) {
            fields.push({ label: 'End dist', value: endDistance.toFixed(2) });
            fields.push({ label: 'End dx', value: endDx.toFixed(2) });
            fields.push({ label: 'End dz', value: endDz.toFixed(2) });
        }
        if (pole?.arrowRole === 'p0') fields.push({ label: 'Pole role', value: 'P0' });
        if (pole?.arrowRole === 'p1') fields.push({ label: 'Pole role', value: 'P1' });
        if (typeof pole?.curveSide === 'string' && pole.curveSide.length > 0) {
            const normalized = pole.curveSide.trim().toLowerCase();
            const curveLabel = normalized === 'internal' ? 'Inner curve' : (normalized === 'external' ? 'Outer curve' : pole.curveSide);
            fields.push({ label: 'Curve', value: curveLabel });
        }
        if (typeof lIntersection === 'string' && lIntersection.length > 0) {
            fields.push({ label: 'L side', value: lIntersection });
        }
        panel.setData({ type: poleType, fields });
    }

    _setupHoverOutline() {
        if (!this._outlineLine) return;
        if (this._outlineLine.parent) this._outlineLine.removeFromParent();
        this.city?.group?.add(this._outlineLine);
    }

    _ensureHoverOutline() {
        if (this._outlineLine) {
            this._setupHoverOutline();
            return;
        }
        const outline = createHoverOutlineLine({
            renderer: this.engine.renderer,
            color: 0xff0000,
            lineWidth: 4,
            opacity: 0.9,
            renderOrder: 12,
            depthTest: false,
            depthWrite: false
        });
        this._outlineLine = outline.line;
        this._outlineMaterial = outline.material;
        this._setupHoverOutline();
    }

    _destroyHoverOutline() {
        if (this._outlineLine) this._outlineLine.removeFromParent();
        if (this._outlineLine?.geometry) this._outlineLine.geometry.dispose();
        if (this._outlineMaterial) this._outlineMaterial.dispose();
        if (this._outlineDynamicGeo) this._outlineDynamicGeo.dispose();
        this._outlineLine = null;
        this._outlineMaterial = null;
        this._outlineDynamicGeo = null;
        this._outlineTarget = null;
    }

    _clearHoverOutline() {
        this._outlineTarget = null;
        if (this._outlineLine) this._outlineLine.visible = false;
        if (this._outlineDynamicGeo) {
            this._outlineDynamicGeo.dispose();
            this._outlineDynamicGeo = null;
        }
    }

    _updateHoverOutline(hit) {
        if (!this._outlineLine) this._ensureHoverOutline();
        if (!this._outlineLine) return;
        const hover = (hit !== undefined) ? hit : this._pickHoverMesh();
        if (!hover) {
            this._clearHoverOutline();
            return;
        }
        const obj = hover.object;
        const instanceId = hover.instanceId;
        const baseGeo = obj.geometry;
        if (!baseGeo) {
            this._clearHoverOutline();
            return;
        }
        const ranges = baseGeo.userData?.mergeRanges;
        const rangeIndex = this._getHoverRangeIndex(ranges, hover.faceIndex);
        if (this._outlineTarget && this._outlineTarget.obj === obj && this._outlineTarget.instanceId === instanceId && this._outlineTarget.rangeIndex === rangeIndex) {
            return;
        }
        if (this._outlineDynamicGeo) {
            this._outlineDynamicGeo.dispose();
            this._outlineDynamicGeo = null;
        }
        let edgesGeo = null;
        if (rangeIndex !== null) {
            edgesGeo = this._buildOutlineRangeGeometry(baseGeo, ranges[rangeIndex]);
            if (!edgesGeo) {
                this._clearHoverOutline();
                return;
            }
            this._outlineDynamicGeo = edgesGeo;
        } else {
            edgesGeo = this._outlineGeoCache.get(baseGeo);
            if (!edgesGeo) {
                const edges = new THREE.EdgesGeometry(baseGeo, 25);
                edgesGeo = new LineSegmentsGeometry();
                edgesGeo.setPositions(edges.attributes.position.array);
                edges.dispose();
                this._outlineGeoCache.set(baseGeo, edgesGeo);
            }
        }
        this._outlineLine.geometry = edgesGeo;
        if (obj.isInstancedMesh && Number.isFinite(instanceId)) {
            obj.getMatrixAt(instanceId, this._outlineMatrix);
            this._outlineMatrix.premultiply(obj.matrixWorld);
            this._outlineLine.matrix.copy(this._outlineMatrix);
            this._outlineLine.matrixAutoUpdate = false;
            this._outlineLine.matrixWorldNeedsUpdate = true;
        } else {
            this._outlineLine.matrix.copy(obj.matrixWorld);
            this._outlineLine.matrixAutoUpdate = false;
            this._outlineLine.matrixWorldNeedsUpdate = true;
        }
        this._outlineLine.visible = true;
        this._outlineTarget = { obj, instanceId, rangeIndex };
    }

    _getHoverRangeIndex(ranges, faceIndex) {
        if (!Array.isArray(ranges) || !Number.isFinite(faceIndex)) return null;
        const vertexIndex = faceIndex * 3;
        for (let i = 0; i < ranges.length; i++) {
            const range = ranges[i];
            if (!range) continue;
            const start = range.start ?? 0;
            const count = range.count ?? 0;
            if (vertexIndex >= start && vertexIndex < start + count) return i;
        }
        return null;
    }

    _buildOutlineRangeGeometry(baseGeo, range) {
        const posAttr = baseGeo?.attributes?.position;
        if (!posAttr || !range) return null;
        const start = range.start ?? 0;
        const count = range.count ?? 0;
        if (count <= 0) return null;
        const src = posAttr.array;
        const startIdx = start * 3;
        const endIdx = (start + count) * 3;
        if (!src || endIdx > src.length) return null;
        const positions = src.slice(startIdx, endIdx);
        const temp = new THREE.BufferGeometry();
        temp.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const edges = new THREE.EdgesGeometry(temp, 25);
        temp.dispose();
        const edgesGeo = new LineSegmentsGeometry();
        edgesGeo.setPositions(edges.attributes.position.array);
        edges.dispose();
        return edgesGeo;
    }

    _pickHoverMesh() {
        const root = this.city?.group;
        if (!root) return null;
        this._raycaster.setFromCamera(this._pointer, this.engine.camera);
        const hits = this._raycaster.intersectObjects(root.children, true);
        if (!hits.length) return null;
        for (const hit of hits) {
            const obj = hit.object;
            if (!obj || !obj.isMesh) continue;
            if (obj === this._highlightMesh) continue;
            if (obj === this._outlineLine) continue;
            if (this._isOverlayObject(obj)) continue;
            return hit;
        }
        return null;
    }

    _isOverlayObject(obj) {
        const overlays = [];
        if (this._connectorOverlay?.group) overlays.push(this._connectorOverlay.group);
        if (this._roadGraphOverlay?.group) overlays.push(this._roadGraphOverlay.group);
        if (!overlays.length) return false;
        let cur = obj;
        while (cur) {
            if (overlays.includes(cur)) return true;
            cur = cur.parent;
        }
        return false;
    }

    _updateHighlight(road) {
        const map = this.city?.map;
        const mesh = this._highlightMesh;
        const geo = this._highlightGeo;
        const pos = this._highlightPos;
        if (!map || !mesh || !geo || !pos) return;
        if (!road) {
            mesh.visible = false;
            return;
        }
        const a = road.a ?? [0, 0];
        const b = road.b ?? [0, 0];
        const x0 = a[0] | 0;
        const y0 = a[1] | 0;
        const x1 = b[0] | 0;
        const y1 = b[1] | 0;
        const rawDir = normalizeDir(x1 - x0, y1 - y0);
        if (!rawDir) {
            mesh.visible = false;
            return;
        }
        const dir = rawDir;
        const normal = { x: -dir.y, y: dir.x };

        const startCenter = map.tileToWorldCenter(x0, y0);
        const endCenter = map.tileToWorldCenter(x1, y1);
        const halfTile = map.tileSize * HALF;
        const centerlineStart = {
            x: startCenter.x - dir.x * halfTile,
            y: startCenter.z - dir.y * halfTile
        };
        const centerlineEnd = {
            x: endCenter.x + dir.x * halfTile,
            y: endCenter.z + dir.y * halfTile
        };

        const roadCfg = this.city?.generatorConfig?.road ?? {};
        const laneWidth = roadCfg.laneWidth ?? 4.8;
        const shoulder = roadCfg.shoulder ?? 0.525;
        const curbT = roadCfg.curb?.thickness ?? 0.48;
        const width = roadWidth(road.lanesF, road.lanesB, laneWidth, shoulder, map.tileSize);
        const halfWidth = width * HALF;
        const pad = Math.max(
            map.tileSize * HIGHLIGHT_PAD_TILE_FRACTION,
            curbT * HIGHLIGHT_PAD_CURB_FACTOR,
            laneWidth * HIGHLIGHT_PAD_LANE_FACTOR,
            HIGHLIGHT_PAD_MIN
        );
        const expandedStart = {
            x: centerlineStart.x - dir.x * pad,
            y: centerlineStart.y - dir.y * pad
        };
        const expandedEnd = {
            x: centerlineEnd.x + dir.x * pad,
            y: centerlineEnd.y + dir.y * pad
        };

        const leftEdge = offsetEndpoints(expandedStart, expandedEnd, normal, halfWidth + pad);
        const rightEdge = offsetEndpoints(expandedStart, expandedEnd, normal, -(halfWidth + pad));
        const y = this._highlightY;

        pos[0] = leftEdge.start.x;
        pos[1] = y;
        pos[2] = leftEdge.start.y;
        pos[3] = leftEdge.end.x;
        pos[4] = y;
        pos[5] = leftEdge.end.y;
        pos[6] = rightEdge.end.x;
        pos[7] = y;
        pos[8] = rightEdge.end.y;
        pos[9] = leftEdge.start.x;
        pos[10] = y;
        pos[11] = leftEdge.start.y;
        pos[12] = rightEdge.end.x;
        pos[13] = y;
        pos[14] = rightEdge.end.y;
        pos[15] = rightEdge.start.x;
        pos[16] = y;
        pos[17] = rightEdge.start.y;

        geo.attributes.position.needsUpdate = true;
        geo.computeBoundingSphere?.();
        mesh.visible = true;
    }
}
