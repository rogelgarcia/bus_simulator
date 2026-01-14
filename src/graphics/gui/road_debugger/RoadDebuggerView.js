// src/graphics/gui/road_debugger/RoadDebuggerView.js
// Orchestrates the Road Debugger scene (authoring, debug rendering, camera controls, UI).
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createCityConfig } from '../../../app/city/CityConfig.js';
import { computeRoadEngineEdges } from '../../../app/road_engine/RoadEngineCompute.js';
import { buildRoadEnginePolygonMeshData, triangulateSimplePolygonXZ } from '../../../app/road_engine/RoadEngineMeshData.js';
import { clampRoadDebuggerTileOffsetForMap, normalizeRoadDebuggerTileOffsetForMap } from '../../../app/road_debugger/RoadDebuggerTileOffset.js';
import { setupScene, disposeScene } from './RoadDebuggerScene.js';
import { attachEvents, detachEvents, handleKeyDown, handleKeyUp, handlePointerDown, handlePointerMove, handlePointerUp, handleWheel, setupCamera, updateCamera } from './RoadDebuggerInput.js';
import { setupUI, destroyUI } from './RoadDebuggerUI.js';

function clampInt(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n | 0));
}

function clamp(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function fnv1a32(str) {
    const s = String(str ?? '');
    let hash = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        hash ^= s.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

function stableHashId(prefix, key) {
    const hex = fnv1a32(key).toString(16).padStart(8, '0');
    return `${prefix}${hex}`;
}

function compareString(a, b) {
    const aa = String(a ?? '');
    const bb = String(b ?? '');
    if (aa < bb) return -1;
    if (aa > bb) return 1;
    return 0;
}

function baseColorForKind(kind) {
    switch (kind) {
        case 'centerline': return 0xe5e7eb;
        case 'forward_centerline':
        case 'backward_centerline': return 0x5eead4;
        case 'lane_edge_left':
        case 'lane_edge_right': return 0xfbbf24;
        case 'asphalt_edge_left':
        case 'asphalt_edge_right': return 0xf59e0b;
        case 'junction_boundary': return 0xc084fc;
        case 'junction_connector': return 0x34c759;
        case 'junction_endpoints': return 0xf97316;
        case 'junction_edge_order': return 0x22d3ee;
        case 'trim_removed_interval': return 0xf87171;
        default: return 0x94a3b8;
    }
}

function baseLineWidthForKind(kind) {
    switch (kind) {
        case 'asphalt_edge_left':
        case 'asphalt_edge_right': return 4;
        case 'centerline': return 3;
        case 'junction_connector': return 3;
        case 'junction_boundary': return 3;
        case 'junction_edge_order': return 3;
        default: return 2;
    }
}

function baseLineOpacityForKind(kind) {
    switch (kind) {
        case 'asphalt_edge_left':
        case 'asphalt_edge_right': return 0.96;
        case 'centerline': return 0.92;
        case 'forward_centerline':
        case 'backward_centerline': return 0.86;
        case 'junction_connector': return 0.88;
        case 'junction_boundary': return 0.88;
        case 'junction_edge_order': return 0.88;
        default: return 0.82;
    }
}

function baseLineRenderOrderForKind(kind) {
    switch (kind) {
        case 'junction_connector': return 35;
        case 'junction_edge_order': return 35;
        case 'junction_boundary': return 34;
        case 'asphalt_edge_left':
        case 'asphalt_edge_right': return 32;
        case 'centerline': return 31;
        case 'forward_centerline':
        case 'backward_centerline': return 30;
        case 'lane_edge_left':
        case 'lane_edge_right': return 29;
        default: return 28;
    }
}

function getLineMaterialResolution(view) {
    const renderer = view?.engine?.renderer ?? null;
    if (renderer?.getSize) {
        const size = renderer.getSize(new THREE.Vector2());
        return { x: size.x, y: size.y };
    }

    const canvas = view?.canvas ?? null;
    const w = canvas?.clientWidth || canvas?.width || window.innerWidth || 1;
    const h = canvas?.clientHeight || canvas?.height || window.innerHeight || 1;
    return { x: w, y: h };
}

function ensureMapEntry(map, key, factory) {
    if (map.has(key)) return map.get(key);
    const value = factory();
    map.set(key, value);
    return value;
}

const JUNCTION_CANDIDATE_HOVER_RADIUS_PX = 20;
const JUNCTION_CANDIDATE_CLICK_RADIUS_PX = 22;
const CONTROL_POINT_HOVER_RADIUS_PX = 16;
const CONTROL_POINT_CLICK_RADIUS_PX = 18;
const tmpProjectVec = new THREE.Vector3();

export class RoadDebuggerView {
    constructor(engine, { uiEnabled = true } = {}) {
        this.engine = engine;
        this.canvas = engine.canvas;
        this.scene = engine.scene;
        this.camera = engine.camera;

        this.root = null;
        this.world = null;

        this.pointer = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();

        this._groundY = 0;
        this.hoverPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this._groundY);

        this._cityConfig = createCityConfig({
            size: 400,
            tileMeters: 2,
            mapTileSize: 24,
            seed: 'road-debugger'
        });

        this._tileSize = this._cityConfig.map.tileSize;
        this._mapWidth = this._cityConfig.map.width;
        this._mapHeight = this._cityConfig.map.height;
        this._origin = { x: this._cityConfig.map.origin.x, z: this._cityConfig.map.origin.z };
        this._worldSize = this._cityConfig.size;
        this._tileMeters = this._cityConfig.tileMeters;

        this._gridEnabled = true;
        this._gridLines = null;

        this._laneWidth = 4.8;
        this._marginFactor = 0.1;
        this._renderOptions = {
            centerline: true,
            directionCenterlines: true,
            edges: true,
            points: true,
            asphalt: true,
            markings: false
        };
        this._arrowTangentDebugEnabled = false;

        this._trimThresholdFactor = 0.1;
        this._trimDebug = {
            rawSegments: false,
            strips: false,
            overlaps: false,
            intervals: false,
            removedPieces: false,
            keptPieces: false,
            droppedPieces: false,
            highlight: false
        };

        this._junctionEnabled = true;
        this._junctionThresholdFactor = 1.5;
        this._junctionDebug = {
            endpoints: false,
            boundary: false,
            connectors: false,
            rejected: false,
            edgeOrder: false
        };
        this._mergedConnectorIds = new Set();
        this._authoredJunctions = [];
        this._hiddenJunctionIds = new Set();
        this._suppressedAutoJunctionIds = new Set();
        this._junctionToolEnabled = false;
        this._junctionToolHoverCandidateId = null;
        this._junctionToolSelectedCandidateIds = new Set();

        this._snapEnabled = true;
        this._snapHighlightMesh = null;
        this._snapHighlightGeo = null;

        this._draftFirstTileMarkerMesh = null;
        this._draftFirstTileMarkerGeo = null;
        this._draftHoverTileMarkerMesh = null;
        this._draftHoverTileMarkerGeo = null;

        this._draftPreviewLine = null;
        this._draftPreviewGeo = null;

        this._hoverCubeMesh = null;
        this._hoverCubeGeo = null;
        this._approachMarkerMesh = null;
        this._approachMarkerGeo = null;

        this._roads = [];
        this._draft = null;
        this._roadCounter = 1;
        this._pointCounter = 1;

        this._undoStack = [];
        this._redoStack = [];
        this._undoMax = 64;

        this._hover = { roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        this._derived = null;

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

        this._orbitTarget = new THREE.Vector3();
        this._orbitYaw = 0;
        this._orbitPitch = 0;

        this._isDraggingCamera = false;
        this._cameraDragPointerId = null;
        this._cameraDragStartWorld = new THREE.Vector3();
        this._cameraDragStartCam = new THREE.Vector3();
        this._cameraDragStartTarget = new THREE.Vector3();
        this._pointerDownButton = null;
        this._pointerDownClient = { x: 0, y: 0 };
        this._pointerDownWorld = new THREE.Vector3();
        this._pointerDownCam = new THREE.Vector3();
        this._pendingClick = false;
        this._dragThresholdPx = 6;

        this._pointDrag = {
            active: false,
            pointerId: null,
            roadId: null,
            pointId: null,
            dragOffset: new THREE.Vector3(),
            startWorld: new THREE.Vector3(),
            axisLock: null,
            undoPushed: false
        };

        this._overlayRoot = null;
        this._asphaltGroup = null;
        this._markingsGroup = null;
        this._debugGroup = null;
        this._highlightGroup = null;
        this._overlayLines = [];
        this._overlayPoints = [];
        this._asphaltMeshes = [];
        this._junctionSurfaceMeshes = [];
        this._markingLines = [];
        this._arrowMeshes = [];
        this._arrowTangentLines = [];
        this._controlPointMeshes = [];
        this._segmentPickMeshes = [];
        this._junctionPickMeshes = [];
        this._connectorPickMeshes = [];
        this._junctionCandidateMeshes = [];
        this._junctionCandidatePickMeshes = [];
        this._materials = {
            lineBase: new Map(),
            lineHover: new Map(),
            lineSelected: new Map(),
            pointBase: new Map(),
            hoverPoint: new THREE.PointsMaterial({ color: 0x34c759, size: 6, sizeAttenuation: false, depthTest: false, depthWrite: false }),
            selectedPoint: new THREE.PointsMaterial({ color: 0x3b82f6, size: 7, sizeAttenuation: false, depthTest: false, depthWrite: false }),
            pickHover: new THREE.MeshBasicMaterial({ color: 0x34c759, transparent: true, opacity: 0.18, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            pickSelected: new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            pickHidden: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.0, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            controlPoint: new THREE.MeshBasicMaterial({ color: 0xe5e7eb, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }),
            controlPointDraft: new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false }),
            controlPointHover: new THREE.MeshBasicMaterial({ color: 0x34c759, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false }),
            controlPointSelected: new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 1.0, depthTest: false, depthWrite: false }),
            hoverCube: new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }),
            draftPreviewLine: new THREE.LineBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }),
            snapHighlight: new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.34, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            draftFirstTileMarker: new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            draftHoverTileMarker: new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            asphaltBase: new THREE.MeshBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            markingLine: new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }),
            arrow: new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.97, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            arrowTangent: new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }),
            debugRawAsphalt: new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.38, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            debugStrip: new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.36, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            debugOverlap: new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.46, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            debugKeptPiece: new THREE.MeshBasicMaterial({ color: 0x34c759, transparent: true, opacity: 0.36, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            debugRemovedPiece: new THREE.MeshBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0.42, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            debugDroppedPiece: new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            junctionCandidateEndpoint: new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false }),
            junctionCandidateCorner: new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false }),
            junctionCandidateHover: new THREE.MeshBasicMaterial({ color: 0x34c759, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false }),
            junctionCandidateSelected: new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 1.0, depthTest: false, depthWrite: false }),
            junctionCandidateRing: new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            approachMarkerHover: new THREE.MeshBasicMaterial({ color: 0x34c759, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            approachMarkerSelected: new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            highlightObb: new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }),
            highlightAabb: new THREE.LineBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }),
            highlightPiece: new THREE.LineBasicMaterial({ color: 0x34c759, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false })
        };
        this._lineMaterialResolution = new THREE.Vector2(0, 0);
        this._sphereGeo = new THREE.SphereGeometry(0.45, 12, 10);
        this._junctionCandidateGeo = new THREE.SphereGeometry(0.32, 10, 8);
        this._junctionCandidateRingGeo = null;

        this._uiEnabled = uiEnabled !== false;
        this.ui = null;
        this.onExit = null;

        this._onPointerMove = (e) => handlePointerMove(this, e);
        this._onPointerDown = (e) => handlePointerDown(this, e);
        this._onPointerUp = (e) => handlePointerUp(this, e);
        this._onWheel = (e) => handleWheel(this, e);
        this._onKeyDown = (e) => handleKeyDown(this, e);
        this._onKeyUp = (e) => handleKeyUp(this, e);
        this._onContextMenu = (e) => e.preventDefault();
    }

    enter() {
        if (this.root) return;
        setupCamera(this);
        setupScene(this);
        this._ensureSnapHighlight();
        if (this._uiEnabled) setupUI(this);
        attachEvents(this);
        this.setGridEnabled(this._gridEnabled);
        this._rebuildPipeline();
    }

    exit() {
        handlePointerUp(this, null);
        detachEvents(this);
        destroyUI(this);
        this._setSnapHighlightVisible(false);
        this._setDraftPreviewVisible(false);
        this._setDraftHoverTileMarkerVisible(false);
        this._clearOverlays();
        disposeScene(this);
        this._disposeResources();
    }

    update(dt) {
        updateCamera(this, dt);
    }

    setGridEnabled(enabled) {
        this._gridEnabled = !!enabled;
        if (this._gridLines) this._gridLines.visible = this._gridEnabled;
    }

    setRenderOptions({ centerlines = null, centerline = null, directionCenterlines = null, edges = null, points = null, asphalt = null, markings = null } = {}) {
        if (centerlines !== null) {
            this._renderOptions.centerline = !!centerlines;
            this._renderOptions.directionCenterlines = !!centerlines;
        }
        if (centerline !== null) this._renderOptions.centerline = !!centerline;
        if (directionCenterlines !== null) this._renderOptions.directionCenterlines = !!directionCenterlines;
        if (edges !== null) this._renderOptions.edges = !!edges;
        if (points !== null) this._renderOptions.points = !!points;
        if (asphalt !== null) this._renderOptions.asphalt = !!asphalt;
        if (markings !== null) this._renderOptions.markings = !!markings;
        this._rebuildPipeline();
    }

    _edgeLineWidthScale() {
        const zoomMin = Number.isFinite(this._zoomMin) ? this._zoomMin : 0;
        const zoomMax = Number.isFinite(this._zoomMax) ? this._zoomMax : zoomMin;
        if (!(zoomMax > zoomMin + 1e-6)) return 1;
        const zoom = clamp(Number(this._zoom) || zoomMin, zoomMin, zoomMax);
        const t = clamp((zoom - zoomMin) / (zoomMax - zoomMin), 0, 1);
        const minScale = 0.25;
        const curved = Math.pow(t, 1.25);
        return 1 - curved * (1 - minScale);
    }

    _applyDistanceScaledEdgeLineWidths() {
        const scale = this._edgeLineWidthScale();
        const kinds = ['lane_edge_left', 'lane_edge_right', 'asphalt_edge_left', 'asphalt_edge_right'];
        const configs = [
            { map: this._materials?.lineBase, add: 0, min: 0.55 },
            { map: this._materials?.lineHover, add: 0.25, min: 0.75 },
            { map: this._materials?.lineSelected, add: 0.45, min: 0.85 }
        ];

        for (const kind of kinds) {
            const base = baseLineWidthForKind(kind);
            for (const cfg of configs) {
                const map = cfg.map;
                if (!(map instanceof Map)) continue;
                const mat = map.get(kind);
                if (!mat) continue;
                const target = Math.max(cfg.min, (base + cfg.add) * scale);
                if (Math.abs((Number(mat.linewidth) || 0) - target) > 1e-4) mat.linewidth = target;
            }
        }
    }

    setArrowTangentDebugEnabled(enabled) {
        const next = !!enabled;
        if (this._arrowTangentDebugEnabled === next) return;
        this._arrowTangentDebugEnabled = next;
        this._rebuildOverlaysFromDerived();
        this._applyHighlights();
        this.ui?.sync?.();
    }

    getArrowTangentDebugEnabled() {
        return this._arrowTangentDebugEnabled === true;
    }

    setTrimThresholdFactor(value) {
        const next = clamp(value, 0, 0.5);
        if (Math.abs((this._trimThresholdFactor ?? 0) - next) < 1e-9) return;
        this._trimThresholdFactor = next;
        this._rebuildPipeline();
    }

    setTrimDebugOptions(opts = {}) {
        const o = opts && typeof opts === 'object' ? opts : {};
        const keys = ['rawSegments', 'strips', 'overlaps', 'intervals', 'removedPieces', 'keptPieces', 'droppedPieces', 'highlight'];
        let changed = false;
        for (const key of keys) {
            if (o[key] === undefined) continue;
            const next = !!o[key];
            if (this._trimDebug[key] !== next) {
                this._trimDebug[key] = next;
                changed = true;
            }
        }
        if (!changed) return;
        this._rebuildPipeline();
    }

    getTrimThresholdFactor() {
        return this._trimThresholdFactor ?? 0.1;
    }

    getTrimDebugOptions() {
        return { ...this._trimDebug };
    }

    setJunctionEnabled(enabled) {
        const next = enabled !== false;
        if (this._junctionEnabled === next) return;
        this._junctionEnabled = next;
        this._rebuildPipeline();
    }

    getJunctionEnabled() {
        return this._junctionEnabled !== false;
    }

    setJunctionThresholdFactor(value) {
        const next = clamp(value, 0.25, 3.5);
        if (Math.abs((this._junctionThresholdFactor ?? 0) - next) < 1e-9) return;
        this._junctionThresholdFactor = next;
        this._rebuildPipeline();
    }

    getJunctionThresholdFactor() {
        return this._junctionThresholdFactor ?? 1.5;
    }

    setJunctionDebugOptions(opts = {}) {
        const o = opts && typeof opts === 'object' ? opts : {};
        const keys = ['endpoints', 'boundary', 'connectors', 'rejected', 'edgeOrder'];
        let changed = false;
        for (const key of keys) {
            if (o[key] === undefined) continue;
            const next = !!o[key];
            if (this._junctionDebug[key] !== next) {
                this._junctionDebug[key] = next;
                changed = true;
            }
        }
        if (!changed) return;
        this._rebuildPipeline();
    }

    getJunctionDebugOptions() {
        return { ...this._junctionDebug };
    }

    setJunctionToolEnabled(enabled) {
        const next = enabled !== false;
        if (this._junctionToolEnabled === next) return;
        this._junctionToolEnabled = next;
        this._junctionToolHoverCandidateId = null;
        this._junctionToolSelectedCandidateIds.clear();
        this._rebuildOverlaysFromDerived();
        this._applyHighlights();
        this.ui?.sync?.();
    }

    getJunctionToolEnabled() {
        return this._junctionToolEnabled === true;
    }

    getJunctionToolSelection() {
        return Array.from(this._junctionToolSelectedCandidateIds ?? []).sort(compareString);
    }

    clearJunctionToolSelection() {
        if (!(this._junctionToolSelectedCandidateIds?.size > 0) && !this._junctionToolHoverCandidateId) return;
        this._junctionToolHoverCandidateId = null;
        this._junctionToolSelectedCandidateIds.clear();
        this._applyHighlights();
        this.ui?.sync?.();
    }

    _isJunctionCandidateIdValid(candidateId) {
        const id = typeof candidateId === 'string' && candidateId.trim() ? candidateId.trim() : null;
        if (!id) return false;
        const derived = this._derived ?? null;
        const candidates = derived?.junctionCandidates ?? null;
        const endpoints = candidates?.endpoints ?? [];
        for (const ep of endpoints) {
            if (ep?.id === id) return true;
        }
        const corners = candidates?.corners ?? [];
        for (const corner of corners) {
            if (corner?.id === id) return true;
        }
        return false;
    }

    setJunctionToolHoverCandidate(candidateId) {
        if (!this._junctionToolEnabled) return false;
        const id = typeof candidateId === 'string' && candidateId.trim() ? candidateId.trim() : null;
        if (!id) return false;
        if (!this._isJunctionCandidateIdValid(id)) return false;
        if (this._junctionToolHoverCandidateId === id) return true;
        this._junctionToolHoverCandidateId = id;
        this._applyHighlights();
        this.ui?.sync?.();
        return true;
    }

    clearJunctionToolHoverCandidate(candidateId) {
        if (!this._junctionToolEnabled) return false;
        const current = this._junctionToolHoverCandidateId ?? null;
        if (!current) return false;
        const id = typeof candidateId === 'string' && candidateId.trim() ? candidateId.trim() : null;
        if (id && id !== current) return false;
        this._junctionToolHoverCandidateId = null;
        this._applyHighlights();
        this.ui?.sync?.();
        return true;
    }

    toggleJunctionToolCandidate(candidateId) {
        if (!this._junctionToolEnabled) return false;
        const id = typeof candidateId === 'string' && candidateId.trim() ? candidateId.trim() : null;
        if (!id) return false;
        if (this._junctionToolSelectedCandidateIds.has(id)) this._junctionToolSelectedCandidateIds.delete(id);
        else this._junctionToolSelectedCandidateIds.add(id);
        this._applyHighlights();
        this.ui?.sync?.();
        return true;
    }

    setJunctionToolSelection(candidateIds) {
        if (!this._junctionToolEnabled) return false;
        const ids = Array.isArray(candidateIds)
            ? candidateIds
            : candidateIds instanceof Set
                ? Array.from(candidateIds)
                : [];

        const derived = this._derived ?? null;
        const candidates = derived?.junctionCandidates ?? null;
        const endpoints = candidates?.endpoints ?? [];
        const corners = candidates?.corners ?? [];

        const roads = this._getRoadsForPipeline({ includeDraft: true });
        const visibleByRoadId = new Map();
        for (const road of roads) {
            if (!road?.id) continue;
            visibleByRoadId.set(road.id, road.visible !== false);
        }
        const isRoadVisible = (roadId) => {
            if (!roadId) return true;
            return visibleByRoadId.get(roadId) !== false;
        };

        const valid = new Map();
        for (const ep of endpoints) {
            if (!ep?.id) continue;
            if (!isRoadVisible(ep.roadId ?? null)) continue;
            valid.set(ep.id, true);
        }
        for (const corner of corners) {
            if (!corner?.id) continue;
            if (!isRoadVisible(corner.roadId ?? null)) continue;
            valid.set(corner.id, true);
        }

        const next = new Set();
        for (const id of ids) {
            const safe = typeof id === 'string' && id.trim() ? id.trim() : null;
            if (!safe) continue;
            if (!valid.has(safe)) continue;
            next.add(safe);
        }

        const prev = this._junctionToolSelectedCandidateIds ?? new Set();
        let changed = false;
        if (prev.size !== next.size) changed = true;
        else {
            for (const id of prev) {
                if (!next.has(id)) {
                    changed = true;
                    break;
                }
            }
        }
        if (!changed) return false;

        prev.clear();
        for (const id of next) prev.add(id);
        this._applyHighlights();
        this.ui?.sync?.();
        return true;
    }

    selectJunctionToolCandidatesInScreenRect({ x0, y0, x1, y1, mode = 'replace', baseSelected = null } = {}) {
        if (!this._junctionToolEnabled) return false;
        if (!this.canvas) return false;
        const rect = this.canvas.getBoundingClientRect?.() ?? null;
        if (!rect || !(rect.width > 1) || !(rect.height > 1)) return false;

        const minX = Math.min(Number(x0) || 0, Number(x1) || 0);
        const maxX = Math.max(Number(x0) || 0, Number(x1) || 0);
        const minY = Math.min(Number(y0) || 0, Number(y1) || 0);
        const maxY = Math.max(Number(y0) || 0, Number(y1) || 0);

        const derived = this._derived ?? null;
        const candidates = derived?.junctionCandidates ?? null;
        if (!candidates) return false;

        const roads = this._getRoadsForPipeline({ includeDraft: true });
        const visibleByRoadId = new Map();
        for (const road of roads) {
            if (!road?.id) continue;
            visibleByRoadId.set(road.id, road.visible !== false);
        }
        const isRoadVisible = (roadId) => {
            if (!roadId) return true;
            return visibleByRoadId.get(roadId) !== false;
        };

        const w = Number(rect.width) || 1;
        const h = Number(rect.height) || 1;
        const left = Number(rect.left) || 0;
        const top = Number(rect.top) || 0;
        const y = this._groundY + 0.055;

        const inside = new Set();
        const addIfInside = (cand) => {
            if (!cand?.id || !cand?.world) return;
            if (!isRoadVisible(cand.roadId ?? null)) return;
            tmpProjectVec.set(Number(cand.world.x) || 0, y, Number(cand.world.z) || 0);
            tmpProjectVec.project(this.camera);
            if (!(tmpProjectVec.z >= -1 && tmpProjectVec.z <= 1)) return;
            const sx = left + (tmpProjectVec.x * 0.5 + 0.5) * w;
            const sy = top + (-tmpProjectVec.y * 0.5 + 0.5) * h;
            if (sx < minX || sx > maxX || sy < minY || sy > maxY) return;
            inside.add(cand.id);
        };

        const endpoints = candidates?.endpoints ?? [];
        for (const ep of endpoints) addIfInside(ep);

        const corners = candidates?.corners ?? [];
        for (const corner of corners) addIfInside(corner);

        const additive = mode === 'add';
        const base = additive
            ? (baseSelected instanceof Set ? baseSelected : this._junctionToolSelectedCandidateIds)
            : null;
        if (base) {
            for (const id of Array.from(base)) inside.add(id);
        }

        return this.setJunctionToolSelection(inside);
    }

    createJunctionFromToolSelection() {
        if (!this._junctionToolEnabled) return false;
        const candidateIds = this.getJunctionToolSelection();
        if (!candidateIds.length) return false;
        if (candidateIds.length < 2) {
            const derived = this._derived ?? null;
            const corners = derived?.junctionCandidates?.corners ?? [];
            const isCorner = corners.some((c) => c?.id === candidateIds[0]);
            if (!isCorner) return false;
        }

        const id = stableHashId('junc_', candidateIds.join('|'));
        if (this._authoredJunctions.some((j) => j?.id === id)) {
            this.clearJunctionToolSelection();
            this.selectJunction(id);
            return true;
        }

        this._pushUndoSnapshot();
        this._authoredJunctions.push({ id, candidateIds });
        this._authoredJunctions.sort((a, b) => compareString(a?.id, b?.id));
        this._junctionToolHoverCandidateId = null;
        this._junctionToolSelectedCandidateIds.clear();
        this._selection = { type: 'junction', roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: id, connectorId: null };
        this._rebuildPipeline();
        return true;
    }

    toggleJunctionAsphaltVisibility(junctionId) {
        const id = typeof junctionId === 'string' && junctionId.trim() ? junctionId.trim() : null;
        if (!id) return false;
        this._pushUndoSnapshot();
        if (this._hiddenJunctionIds.has(id)) this._hiddenJunctionIds.delete(id);
        else this._hiddenJunctionIds.add(id);
        this._rebuildPipeline();
        return true;
    }

    deleteJunction(junctionId) {
        const id = typeof junctionId === 'string' && junctionId.trim() ? junctionId.trim() : null;
        if (!id) return false;
        const manualIndex = this._authoredJunctions.findIndex((j) => j?.id === id);
        const isManual = manualIndex >= 0;
        const alreadySuppressed = this._suppressedAutoJunctionIds.has(id);
        if (!isManual && alreadySuppressed) return false;

        this._pushUndoSnapshot();
        if (isManual) this._authoredJunctions.splice(manualIndex, 1);
        else this._suppressedAutoJunctionIds.add(id);
        this._hiddenJunctionIds.delete(id);

        if (this._hover?.junctionId === id) this.clearHover();
        if (this._selection?.junctionId === id) this.clearSelection();
        this._rebuildPipeline();
        this._sanitizeSelection();
        return true;
    }

    _sanitizeJunctionToolSelection() {
        if (!this._junctionToolEnabled) return;
        const derived = this._derived ?? null;
        const candidates = derived?.junctionCandidates ?? null;
        const endpoints = candidates?.endpoints ?? [];
        const corners = candidates?.corners ?? [];
        const valid = new Set();
        for (const ep of endpoints) if (ep?.id) valid.add(ep.id);
        for (const corner of corners) if (corner?.id) valid.add(corner.id);

        if (this._junctionToolHoverCandidateId && !valid.has(this._junctionToolHoverCandidateId)) {
            this._junctionToolHoverCandidateId = null;
        }
        if (!(this._junctionToolSelectedCandidateIds?.size > 0)) return;
        let changed = false;
        for (const id of Array.from(this._junctionToolSelectedCandidateIds)) {
            if (!valid.has(id)) {
                this._junctionToolSelectedCandidateIds.delete(id);
                changed = true;
            }
        }
        if (changed) {
            this._applyHighlights();
            this.ui?.sync?.();
        }
    }

    setSnapEnabled(enabled) {
        this._snapEnabled = !!enabled;
        if (!this._snapEnabled) this._setSnapHighlightVisible(false);
        this.ui?.sync?.();
    }

    getSnapEnabled() {
        return this._snapEnabled !== false;
    }

    _syncLineMaterialResolution({ force = false } = {}) {
        const size = getLineMaterialResolution(this);
        if (!force && this._lineMaterialResolution.x === size.x && this._lineMaterialResolution.y === size.y) return;
        this._lineMaterialResolution.set(size.x, size.y);
        const maps = [this._materials?.lineBase, this._materials?.lineHover, this._materials?.lineSelected];
        for (const map of maps) {
            if (!(map instanceof Map)) continue;
            for (const mat of map.values()) {
                if (!mat?.resolution?.set) continue;
                mat.resolution.set(size.x, size.y);
            }
        }
    }

    startRoadDraft() {
        if (this._draft) return;
        this.closeExitConfirm?.();
        this.clearDraftPreview?.();
        this._pushUndoSnapshot();
        const id = `road_${this._roadCounter++}`;
        this._draft = { id, name: `Road ${this._roadCounter - 1}`, lanesF: 1, lanesB: 1, visible: true, points: [] };
        this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        this._rebuildPipeline();
    }

    cancelRoadDraft() {
        if (!this._draft) return;
        this._pushUndoSnapshot();
        const draftId = this._draft.id;
        this._draft = null;
        if (this._selection.roadId === draftId) this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null };
        this.clearDraftPreview?.();
        this._rebuildPipeline();
    }

    finishRoadDraft() {
        const draft = this._draft;
        if (!draft) return;
        if ((draft.points?.length ?? 0) < 2) return;
        this._pushUndoSnapshot();
        this._roads.push(draft);
        this._draft = null;
        this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        this.clearDraftPreview?.();
        this._rebuildPipeline();
    }

    addDraftPointByTile(tileX, tileY, { offsetX = 0, offsetY = 0 } = {}) {
        const draft = this._draft;
        if (!draft) return false;

        const norm = clampRoadDebuggerTileOffsetForMap(
            { tileX, tileY, offsetX, offsetY },
            { tileSize: this._tileSize, mapWidth: this._mapWidth, mapHeight: this._mapHeight }
        );
        const tx = norm.tileX;
        const ty = norm.tileY;
        const ox = norm.offsetX;
        const oy = norm.offsetY;
        const last = draft.points[draft.points.length - 1] ?? null;
        if (last && last.tileX === tx && last.tileY === ty && Number(last.offsetX) === Number(ox) && Number(last.offsetY) === Number(oy)) return false;

        this._pushUndoSnapshot();
        const pointId = `pt_${this._pointCounter++}`;
        draft.points.push({
            id: pointId,
            tileX: tx,
            tileY: ty,
            offsetX: Number(ox) || 0,
            offsetY: Number(oy) || 0,
            tangentFactor: 1
        });

        if ((draft.points?.length ?? 0) >= 2) this._setDraftHoverTileMarkerVisible(false);
        this._rebuildPipeline();
        return true;
    }

    addDraftPointFromWorld(world, { altKey = false } = {}) {
        if (!this._draft) return false;
        const hit = world ?? null;
        if (!hit) return false;
        if (!this._isWorldInsideMapBounds(hit.x, hit.z)) return false;
        const res = this._worldToTilePoint(hit.x, hit.z, { snap: false });
        if (!res) return false;
        return this.addDraftPointByTile(res.tileX, res.tileY, { offsetX: 0, offsetY: 0 });
    }

    setHoverRoad(roadId) {
        const nextRoadId = roadId ?? null;
        if (this._hover.roadId === nextRoadId && !this._hover.segmentId && !this._hover.pointId && !this._hover.pieceId && !this._hover.junctionId && !this._hover.connectorId && !this._hover.approachId) return;
        this._hover.roadId = nextRoadId;
        this._hover.segmentId = null;
        this._hover.pointId = null;
        this._hover.pieceId = null;
        this._hover.junctionId = null;
        this._hover.connectorId = null;
        this._hover.approachId = null;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    setHoverSegment(segmentId) {
        const seg = this._derived?.segments?.find?.((s) => s?.id === segmentId) ?? null;
        const nextSegId = seg?.id ?? null;
        const nextRoadId = seg?.roadId ?? null;
        if (this._hover.segmentId === nextSegId && this._hover.roadId === nextRoadId && !this._hover.pointId && !this._hover.pieceId && !this._hover.junctionId && !this._hover.connectorId && !this._hover.approachId) return;
        this._hover.segmentId = nextSegId;
        this._hover.roadId = nextRoadId;
        this._hover.pointId = null;
        this._hover.pieceId = null;
        this._hover.junctionId = null;
        this._hover.connectorId = null;
        this._hover.approachId = null;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    setHoverPoint(roadId, pointId) {
        const nextRoadId = roadId ?? null;
        const nextPointId = pointId ?? null;
        if (this._hover.roadId === nextRoadId && this._hover.pointId === nextPointId && !this._hover.segmentId && !this._hover.pieceId && !this._hover.junctionId && !this._hover.connectorId && !this._hover.approachId) return;
        this._hover.roadId = nextRoadId;
        this._hover.segmentId = null;
        this._hover.pointId = nextPointId;
        this._hover.pieceId = null;
        this._hover.junctionId = null;
        this._hover.connectorId = null;
        this._hover.approachId = null;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    setHoverJunction(junctionId) {
        const nextJunctionId = junctionId ?? null;
        if (this._hover.junctionId === nextJunctionId && !this._hover.roadId && !this._hover.segmentId && !this._hover.pointId && !this._hover.pieceId && !this._hover.connectorId && !this._hover.approachId) return;
        this._hover.roadId = null;
        this._hover.segmentId = null;
        this._hover.pointId = null;
        this._hover.pieceId = null;
        this._hover.junctionId = nextJunctionId;
        this._hover.connectorId = null;
        this._hover.approachId = null;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    setHoverConnector(connectorId) {
        const nextConnectorId = connectorId ?? null;
        if (!nextConnectorId) {
            this.clearHover();
            return;
        }
        const derived = this._derived ?? null;
        const junctions = derived?.junctions ?? [];
        let junctionId = null;
        for (const j of junctions) {
            const hit = j?.connectors?.find?.((c) => c?.id === nextConnectorId) ?? null;
            if (hit) {
                junctionId = hit.junctionId ?? j?.id ?? null;
                break;
            }
        }
        if (this._hover.connectorId === nextConnectorId && this._hover.junctionId === junctionId && !this._hover.roadId && !this._hover.segmentId && !this._hover.pointId && !this._hover.pieceId && !this._hover.approachId) return;
        this._hover.roadId = null;
        this._hover.segmentId = null;
        this._hover.pointId = null;
        this._hover.pieceId = null;
        this._hover.junctionId = junctionId;
        this._hover.connectorId = nextConnectorId;
        this._hover.approachId = null;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    setHoverApproach(junctionId, approachId) {
        const nextJunctionId = junctionId ?? null;
        const nextApproachId = approachId ?? null;
        if (!nextJunctionId || !nextApproachId) {
            this.clearHover();
            return;
        }
        if (this._hover.approachId === nextApproachId && this._hover.junctionId === nextJunctionId && !this._hover.roadId && !this._hover.segmentId && !this._hover.pointId && !this._hover.pieceId && !this._hover.connectorId) return;
        this._hover.roadId = null;
        this._hover.segmentId = null;
        this._hover.pointId = null;
        this._hover.pieceId = null;
        this._hover.junctionId = nextJunctionId;
        this._hover.connectorId = null;
        this._hover.approachId = nextApproachId;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    clearHover() {
        if (!this._hover.roadId && !this._hover.segmentId && !this._hover.pointId && !this._hover.pieceId && !this._hover.junctionId && !this._hover.connectorId && !this._hover.approachId) return;
        this._hover.roadId = null;
        this._hover.segmentId = null;
        this._hover.pointId = null;
        this._hover.pieceId = null;
        this._hover.junctionId = null;
        this._hover.connectorId = null;
        this._hover.approachId = null;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectRoad(roadId) {
        this._selection = { type: 'road', roadId, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectSegment(segmentId) {
        const seg = this._derived?.segments?.find?.((s) => s?.id === segmentId) ?? null;
        if (!seg) return;
        this._selection = { type: 'segment', roadId: seg.roadId, segmentId: seg.id, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectPoint(roadId, pointId) {
        this._selection = { type: 'point', roadId, segmentId: null, pointId, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectPiece(roadId, segmentId, pieceId) {
        this._selection = { type: 'piece', roadId, segmentId, pointId: null, pieceId, junctionId: null, connectorId: null, approachId: null };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectJunction(junctionId) {
        const nextJunctionId = junctionId ?? null;
        if (!nextJunctionId) return;
        this._selection = { type: 'junction', roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: nextJunctionId, connectorId: null, approachId: null };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectConnector(connectorId) {
        const nextConnectorId = connectorId ?? null;
        if (!nextConnectorId) return;
        const derived = this._derived ?? null;
        const junctions = derived?.junctions ?? [];
        let junctionId = null;
        for (const j of junctions) {
            const hit = j?.connectors?.find?.((c) => c?.id === nextConnectorId) ?? null;
            if (hit) {
                junctionId = hit.junctionId ?? j?.id ?? null;
                break;
            }
        }
        this._selection = { type: 'connector', roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId, connectorId: nextConnectorId, approachId: null };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectApproach(junctionId, approachId) {
        const nextJunctionId = junctionId ?? null;
        const nextApproachId = approachId ?? null;
        if (!nextJunctionId || !nextApproachId) return;
        this._selection = { type: 'approach', roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: nextJunctionId, connectorId: null, approachId: nextApproachId };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    clearSelection() {
        this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    setRoadLaneConfig(roadId, { lanesF = null, lanesB = null } = {}) {
        const all = this._getRoadsForPipeline({ includeDraft: true });
        const road = all.find((r) => r?.id === roadId) ?? null;
        if (!road) return;

        const nextF = lanesF !== null ? clampInt(lanesF, 1, 5) : null;
        const nextB = lanesB !== null ? clampInt(lanesB, 0, 5) : null;
        if ((nextF === null || (Number(road.lanesF) || 0) === nextF) && (nextB === null || (Number(road.lanesB) || 0) === nextB)) return;

        this._pushUndoSnapshot();
        if (nextF !== null) road.lanesF = nextF;
        if (nextB !== null) road.lanesB = nextB;
        this._rebuildPipeline();
    }

    setPointTangentFactor(roadId, pointId, value) {
        const found = this._findSchemaPoint(roadId, pointId);
        if (!found) return false;
        const next = Number.isFinite(Number(value)) ? Number(value) : 1;
        const clamped = clamp(next, 0, 5);
        if (Math.abs((Number(found.point.tangentFactor) || 0) - clamped) < 1e-9) return false;
        this._pushUndoSnapshot();
        found.point.tangentFactor = clamped;
        this._rebuildPipeline();
        return true;
    }

    beginPointDrag({ roadId, pointId, hitWorld = null, pointerId = null } = {}) {
        const found = this._findSchemaPoint(roadId, pointId);
        if (!found) return false;
        const w = this._schemaPointWorld(found.point);
        if (!w) return false;

        const hit = hitWorld ?? w;
        this._pointDrag.active = true;
        this._pointDrag.pointerId = pointerId;
        this._pointDrag.roadId = roadId ?? null;
        this._pointDrag.pointId = pointId ?? null;
        this._pointDrag.dragOffset.set((w.x ?? 0) - (hit.x ?? 0), 0, (w.z ?? 0) - (hit.z ?? 0));
        this._pointDrag.startWorld.set(w.x ?? 0, 0, w.z ?? 0);
        this._pointDrag.axisLock = null;
        this._pointDrag.undoPushed = false;

        this.selectPoint(roadId, pointId);
        this._setSnapHighlightVisible(false);
        return true;
    }

    updatePointDrag(hitWorld, { altKey = false, shiftKey = false } = {}) {
        if (!this._pointDrag.active) return false;
        const hit = hitWorld ?? null;
        if (!hit) return false;

        let targetX = (hit.x ?? 0) + (this._pointDrag.dragOffset.x ?? 0);
        let targetZ = (hit.z ?? 0) + (this._pointDrag.dragOffset.z ?? 0);

        if (shiftKey) {
            if (!this._pointDrag.axisLock) {
                const dx = Math.abs(targetX - this._pointDrag.startWorld.x);
                const dz = Math.abs(targetZ - this._pointDrag.startWorld.z);
                this._pointDrag.axisLock = dx >= dz ? 'x' : 'z';
            }
        } else {
            this._pointDrag.axisLock = null;
        }

        if (this._pointDrag.axisLock === 'x') targetZ = this._pointDrag.startWorld.z;
        if (this._pointDrag.axisLock === 'z') targetX = this._pointDrag.startWorld.x;

        const snapActive = this._snapEnabled && !altKey;
        const res = this._worldToTilePoint(targetX, targetZ, { snap: snapActive });
        if (!res) return false;

        const moved = this._applyPointTileUpdate(this._pointDrag.roadId, this._pointDrag.pointId, res, { pushUndo: !this._pointDrag.undoPushed });
        if (moved && !this._pointDrag.undoPushed) this._pointDrag.undoPushed = true;
        this._updateSnapHighlight(res.x, res.z, { visible: snapActive });
        return moved;
    }

    endPointDrag() {
        if (!this._pointDrag.active) return;
        this._pointDrag.active = false;
        this._pointDrag.pointerId = null;
        this._pointDrag.roadId = null;
        this._pointDrag.pointId = null;
        this._pointDrag.axisLock = null;
        this._pointDrag.undoPushed = false;
        this._setSnapHighlightVisible(false);
    }

    isPointDragActive() {
        return this._pointDrag.active;
    }

    handleCanvasClick(hitWorld, { altKey = false } = {}) {
        if (this._draft) {
            this.addDraftPointFromWorld(hitWorld, { altKey });
            return;
        }

        const pick = this._pickAtPointer();
        if (this._junctionToolEnabled) {
            if (pick?.type === 'junction_candidate') {
                this.toggleJunctionToolCandidate(pick.candidateId);
                return;
            }
            if (pick?.type === 'connector') {
                this.selectConnector(pick.connectorId);
                return;
            }
            if (pick?.type === 'junction') {
                this.selectJunction(pick.junctionId);
                return;
            }
            return;
        }
        if (pick?.type === 'connector') {
            this.selectConnector(pick.connectorId);
            return;
        }
        if (pick?.type === 'junction') {
            this.selectJunction(pick.junctionId);
            return;
        }
        if (pick?.type === 'point') {
            this.selectPoint(pick.roadId, pick.pointId);
            return;
        }
        if (pick?.type === 'piece') {
            this.selectPiece(pick.roadId, pick.segmentId, pick.pieceId);
            return;
        }
        if (pick?.type === 'segment') {
            this.selectSegment(pick.segmentId);
            return;
        }

        this.clearSelection();
    }

    handleEnter() {
        if (this._draft) {
            this.finishRoadDraft();
            return true;
        }
        if (this._junctionToolEnabled) return this.createJunctionFromToolSelection();
        return false;
    }

    handleEscape() {
        if (this._draft) {
            this.finishRoadDraft();
            return true;
        }

        if (this._junctionToolEnabled) {
            if (this._junctionToolSelectedCandidateIds?.size > 0) {
                this.clearJunctionToolSelection();
                return true;
            }
            this.setJunctionToolEnabled(false);
            return true;
        }

        if (this.isExitConfirmOpen()) {
            this.closeExitConfirm();
            return true;
        }

        if (this.ui?.openExitConfirm) {
            this.openExitConfirm();
            return true;
        }

        if (typeof this.onExit === 'function') {
            this.onExit();
            return true;
        }

        return false;
    }

    isExitConfirmOpen() {
        return !!this.ui?.isExitConfirmOpen?.();
    }

    openExitConfirm() {
        this.ui?.openExitConfirm?.();
    }

    closeExitConfirm() {
        this.ui?.closeExitConfirm?.();
    }

    confirmExit() {
        this.closeExitConfirm();
        if (typeof this.onExit === 'function') this.onExit();
    }

    clearDraftPreview() {
        this._setDraftPreviewVisible(false);
        this._setDraftHoverTileMarkerVisible(false);
    }

    updateDraftPreviewFromWorld(world, { altKey = false } = {}) {
        const draft = this._draft ?? null;
        if (!draft) {
            this._setDraftPreviewVisible(false);
            this._setDraftHoverTileMarkerVisible(false);
            return false;
        }

        const hit = world ?? null;
        if (!hit || !this._isWorldInsideMapBounds(hit.x, hit.z)) {
            this._setDraftPreviewVisible(false);
            this._setDraftHoverTileMarkerVisible(false);
            return false;
        }

        const snapActive = (this.getSnapEnabled?.() ?? this._snapEnabled !== false) && !altKey;
        const res = this._worldToTilePoint(hit.x, hit.z, { snap: snapActive });
        if (!res) {
            this._setDraftPreviewVisible(false);
            this._setDraftHoverTileMarkerVisible(false);
            return false;
        }

        const endX = Number(res.x) || 0;
        const endZ = Number(res.z) || 0;

        const showHover = (draft.points?.length ?? 0) < 2;
        if (showHover) {
            this._ensureDraftHoverTileMarker();
            const mesh = this._draftHoverTileMarkerMesh;
            if (mesh) {
                mesh.position.set(endX, this._groundY + 0.021, endZ);
                this._setDraftHoverTileMarkerVisible(true);
            }
        } else {
            this._setDraftHoverTileMarkerVisible(false);
        }

        const last = draft?.points?.[draft.points.length - 1] ?? null;
        if (!last) {
            this._setDraftPreviewVisible(false);
            return true;
        }

        const start = this._schemaPointWorld(last);
        const y = this._groundY + 0.041;

        this._ensureDraftPreviewLine();
        const line = this._draftPreviewLine;
        const attr = line?.geometry?.getAttribute?.('position') ?? null;
        const arr = attr?.array ?? null;
        if (!arr || arr.length < 6) {
            this._setDraftPreviewVisible(false);
            return false;
        }

        arr[0] = Number(start.x) || 0;
        arr[1] = y;
        arr[2] = Number(start.z) || 0;
        arr[3] = endX;
        arr[4] = y;
        arr[5] = endZ;
        attr.needsUpdate = true;

        this._setDraftPreviewVisible(true);
        return true;
    }

    getRoads() {
        return this._roads.slice();
    }

    getDraftRoad() {
        return this._draft;
    }

    getDerived() {
        return this._derived;
    }

    getCameraOrbit() {
        return {
            yaw: Number(this._orbitYaw) || 0,
            pitch: Number(this._orbitPitch) || 0,
            target: { x: Number(this._orbitTarget?.x) || 0, z: Number(this._orbitTarget?.z) || 0 }
        };
    }

    setCameraOrbit({ yaw = null, pitch = null } = {}) {
        if (yaw !== null) this._orbitYaw = Number(yaw) || 0;
        if (pitch !== null) this._orbitPitch = Number(pitch) || 0;
        this._syncOrbitCamera();
    }

    orbitCameraBy({ yawDelta = 0, pitchDelta = 0 } = {}) {
        const dyaw = Number(yawDelta) || 0;
        const dpitch = Number(pitchDelta) || 0;
        this._orbitYaw = (Number(this._orbitYaw) || 0) + dyaw;
        this._orbitPitch = (Number(this._orbitPitch) || 0) + dpitch;
        this._syncOrbitCamera();
    }

    resetCameraOrbit() {
        this._orbitYaw = 0;
        this._orbitPitch = 0;
        this._syncOrbitCamera();
    }

    _syncOrbitCamera() {
        const cam = this.camera;
        if (!cam) return;

        const min = Number.isFinite(this._zoomMin) ? this._zoomMin : 0;
        const max = Number.isFinite(this._zoomMax) ? this._zoomMax : min;
        this._zoom = clamp(Number(this._zoom) || min, min, max);

        const yaw = Number(this._orbitYaw) || 0;
        const pitchMax = Math.PI * 0.5 - 0.08;
        const pitch = clamp(Number(this._orbitPitch) || 0, 0, pitchMax);
        this._orbitPitch = pitch;

        const r = Number(this._zoom) || 0;
        const sin = Math.sin(pitch);
        const cos = Math.cos(pitch);
        const target = this._orbitTarget ?? new THREE.Vector3();
        const tx = Number(target.x) || 0;
        const ty = Number.isFinite(target.y) ? target.y : this._groundY;
        const tz = Number(target.z) || 0;

        const ox = r * sin * Math.sin(yaw);
        const oz = r * sin * Math.cos(yaw);
        const oy = r * cos;

        cam.position.set(tx + ox, ty + oy, tz + oz);
        if (Math.abs(sin) < 1e-6) cam.up.set(Math.sin(yaw), 0, Math.cos(yaw));
        else cam.up.set(0, 1, 0);
        cam.lookAt(tx, ty, tz);
        cam.updateMatrixWorld(true);
        this._applyDistanceScaledEdgeLineWidths();
    }

    movePointToWorld(roadId, pointId, world, { snap = null } = {}) {
        const hit = world ?? null;
        if (!hit) return false;
        const snapActive = snap === null ? this._snapEnabled : !!snap;
        const res = this._worldToTilePoint(hit.x, hit.z, { snap: snapActive });
        if (!res) return false;
        return this._applyPointTileUpdate(roadId, pointId, res, { pushUndo: true });
    }

    canUndo() {
        return (this._undoStack?.length ?? 0) > 0;
    }

    canRedo() {
        return (this._redoStack?.length ?? 0) > 0;
    }

    undo() {
        if (!this._undoStack.length) return false;
        this.endPointDrag();
        const snapshot = this._undoStack.pop();
        this._redoStack.push(this._createSnapshot());
        this._restoreSnapshot(snapshot);
        this._rebuildPipeline();
        this._sanitizeSelection();
        return true;
    }

    redo() {
        if (!this._redoStack.length) return false;
        this.endPointDrag();
        const snapshot = this._redoStack.pop();
        this._undoStack.push(this._createSnapshot());
        this._restoreSnapshot(snapshot);
        this._rebuildPipeline();
        this._sanitizeSelection();
        return true;
    }

    exportSchema({ pretty = true, includeDraft = true } = {}) {
        const payload = cloneJson({
            roads: this._roads,
            draft: includeDraft ? this._draft : null
        });
        for (const road of payload.roads ?? []) this._normalizeSchemaRoadInPlace(road);
        this._normalizeSchemaRoadInPlace(payload.draft);

        const junctions = Array.isArray(this._authoredJunctions)
            ? this._authoredJunctions
                .map((j) => ({
                    id: typeof j?.id === 'string' && j.id.trim() ? j.id.trim() : null,
                    candidateIds: Array.isArray(j?.candidateIds)
                        ? Array.from(new Set(j.candidateIds.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()))).sort()
                        : []
                }))
                .filter((j) => j.candidateIds.length > 0)
                .map((j) => ({ id: j.id ?? stableHashId('junc_', j.candidateIds.join('|')), candidateIds: j.candidateIds }))
                .sort((a, b) => compareString(a?.id, b?.id))
            : [];

        const schema = {
            version: 1,
            laneWidth: Number(this._laneWidth) || 4.8,
            marginFactor: Number.isFinite(this._marginFactor) ? Number(this._marginFactor) : 0.1,
            snapEnabled: this._snapEnabled !== false,
            roads: payload.roads,
            draft: payload.draft,
            mergedConnectorIds: Array.from(this._mergedConnectorIds ?? []).filter((id) => typeof id === 'string' && id.trim()).sort(),
            junctions,
            hiddenJunctionIds: Array.from(this._hiddenJunctionIds ?? []).filter((id) => typeof id === 'string' && id.trim()).sort(),
            suppressedAutoJunctionIds: Array.from(this._suppressedAutoJunctionIds ?? []).filter((id) => typeof id === 'string' && id.trim()).sort()
        };
        return JSON.stringify(schema, null, pretty ? 2 : 0);
    }

    importSchema(schema, { pushUndo = true } = {}) {
        const parsed = this._parseSchema(schema);
        if (!parsed) return false;
        if (pushUndo) this._pushUndoSnapshot();

        this._roads = parsed.roads;
        this._draft = parsed.draft;
        this._laneWidth = parsed.laneWidth;
        this._marginFactor = parsed.marginFactor;
        this._snapEnabled = parsed.snapEnabled;
        this._mergedConnectorIds = new Set(parsed.mergedConnectorIds ?? []);
        this._authoredJunctions = parsed.junctions ?? [];
        this._hiddenJunctionIds = new Set(parsed.hiddenJunctionIds ?? []);
        this._suppressedAutoJunctionIds = new Set(parsed.suppressedAutoJunctionIds ?? []);
        this._junctionToolHoverCandidateId = null;
        this._junctionToolSelectedCandidateIds?.clear?.();
        this._hover = { roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null };
        this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null };

        const counters = this._resolveCounters();
        this._roadCounter = counters.roadCounter;
        this._pointCounter = counters.pointCounter;

        this._redoStack = [];
        this._rebuildPipeline();
        this.clearDraftPreview?.();
        return true;
    }

    _schemaPointWorld(point) {
        const tileSize = Number(this._tileSize) || 24;
        const ox = Number(this._origin?.x) || 0;
        const oz = Number(this._origin?.z) || 0;
        const tileX = Number(point?.tileX) || 0;
        const tileY = Number(point?.tileY) || 0;
        const offsetX = Number(point?.offsetX) || 0;
        const offsetY = Number(point?.offsetY) || 0;
        return { x: ox + tileX * tileSize + offsetX, z: oz + tileY * tileSize + offsetY };
    }

    _findSchemaPoint(roadId, pointId) {
        if (!roadId || !pointId) return null;
        const list = [];
        if (this._draft?.id === roadId) list.push(this._draft);
        for (const road of this._roads) {
            if (road?.id === roadId) list.push(road);
        }
        for (const road of list) {
            const pts = road?.points ?? [];
            const point = pts.find((p) => p?.id === pointId) ?? null;
            if (point) return { road, point };
        }
        return null;
    }

    _findSchemaRoad(roadId) {
        if (!roadId) return null;
        if (this._draft?.id === roadId) return { road: this._draft, isDraft: true };
        const road = this._roads.find((r) => r?.id === roadId) ?? null;
        if (!road) return null;
        return { road, isDraft: false };
    }

    deleteRoad(roadId) {
        if (!roadId) return false;
        if (this._draft?.id === roadId) {
            this.cancelRoadDraft();
            return true;
        }
        const index = this._roads.findIndex((r) => r?.id === roadId);
        if (index < 0) return false;
        this._pushUndoSnapshot();
        this._roads.splice(index, 1);
        this._rebuildPipeline();
        this._sanitizeSelection();
        return true;
    }

    setRoadVisibility(roadId, visible) {
        const found = this._findSchemaRoad(roadId);
        if (!found) return false;
        const next = visible !== false;
        const prev = found.road.visible !== false;
        if (prev === next) return false;
        this._pushUndoSnapshot();
        found.road.visible = next;
        this._rebuildOverlaysFromDerived();
        this._applyHighlights();
        this.ui?.sync?.();
        return true;
    }

    mergeConnectorIntoRoad(connectorId) {
        const id = connectorId ?? null;
        if (!id) return false;
        const derived = this._derived ?? null;
        const junctions = derived?.junctions ?? [];
        let connector = null;
        for (const j of junctions) {
            const hit = j?.connectors?.find?.((c) => c?.id === id) ?? null;
            if (hit) {
                connector = hit;
                break;
            }
        }
        if (!connector?.sameRoad) return false;
        if (connector?.mergedIntoRoad) return false;
        if (this._mergedConnectorIds?.has?.(id)) return false;
        this._pushUndoSnapshot();
        this._mergedConnectorIds.add(id);
        this._rebuildPipeline();
        return true;
    }

    _worldToTilePoint(worldX, worldZ, { snap = false } = {}) {
        const tileSize = Number(this._tileSize) || 24;
        const half = tileSize * 0.5;
        const step = tileSize / 10;
        const ox = Number(this._origin?.x) || 0;
        const oz = Number(this._origin?.z) || 0;
        const maxX = Math.max(0, (this._mapWidth ?? 1) - 1);
        const maxY = Math.max(0, (this._mapHeight ?? 1) - 1);

        let tileX = Math.round(((Number(worldX) || 0) - ox) / tileSize);
        let tileY = Math.round(((Number(worldZ) || 0) - oz) / tileSize);
        tileX = clampInt(tileX, 0, maxX);
        tileY = clampInt(tileY, 0, maxY);

        let offsetX = (Number(worldX) || 0) - (ox + tileX * tileSize);
        let offsetY = (Number(worldZ) || 0) - (oz + tileY * tileSize);
        offsetX = clamp(offsetX, -half, half);
        offsetY = clamp(offsetY, -half, half);

        if (snap) {
            const ix = clampInt(Math.round(offsetX / step), -5, 5);
            const iy = clampInt(Math.round(offsetY / step), -5, 5);
            offsetX = ix * step;
            offsetY = iy * step;
        }

        const norm = normalizeRoadDebuggerTileOffsetForMap(
            { tileX, tileY, offsetX, offsetY },
            { tileSize, mapWidth: this._mapWidth, mapHeight: this._mapHeight }
        );
        const x = Math.fround(ox + norm.tileX * tileSize + norm.offsetX);
        const z = Math.fround(oz + norm.tileY * tileSize + norm.offsetY);
        return { tileX: norm.tileX, tileY: norm.tileY, offsetX: norm.offsetX, offsetY: norm.offsetY, x, z };
    }

    _isWorldInsideMapBounds(worldX, worldZ) {
        const tileSize = Number(this._tileSize) || 24;
        const half = tileSize * 0.5;
        const ox = Number(this._origin?.x) || 0;
        const oz = Number(this._origin?.z) || 0;
        const maxX = Math.max(0, (this._mapWidth ?? 1) - 1);
        const maxY = Math.max(0, (this._mapHeight ?? 1) - 1);

        const x = Number(worldX);
        const z = Number(worldZ);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return false;

        const minX = ox - half;
        const maxWorldX = ox + maxX * tileSize + half;
        const minZ = oz - half;
        const maxWorldZ = oz + maxY * tileSize + half;
        const eps = 1e-6;
        return x >= minX - eps && x <= maxWorldX + eps && z >= minZ - eps && z <= maxWorldZ + eps;
    }

    _applyPointTileUpdate(roadId, pointId, next, { pushUndo = false } = {}) {
        const found = this._findSchemaPoint(roadId, pointId);
        if (!found) return false;

        const norm = normalizeRoadDebuggerTileOffsetForMap(
            next,
            { tileSize: this._tileSize, mapWidth: this._mapWidth, mapHeight: this._mapHeight }
        );
        const eps = 1e-6;
        const changed =
            (Number(found.point.tileX) || 0) !== (Number(norm.tileX) || 0) ||
            (Number(found.point.tileY) || 0) !== (Number(norm.tileY) || 0) ||
            Math.abs((Number(found.point.offsetX) || 0) - (Number(norm.offsetX) || 0)) > eps ||
            Math.abs((Number(found.point.offsetY) || 0) - (Number(norm.offsetY) || 0)) > eps;
        if (!changed) return false;

        if (pushUndo) this._pushUndoSnapshot();
        found.point.tileX = norm.tileX;
        found.point.tileY = norm.tileY;
        found.point.offsetX = norm.offsetX;
        found.point.offsetY = norm.offsetY;
        this._rebuildPipeline();
        return true;
    }

    _normalizeSchemaRoadInPlace(road) {
        const r = road ?? null;
        if (!r) return;
        const pts = Array.isArray(r.points) ? r.points : [];
        for (const point of pts) {
            if (!point || typeof point !== 'object') continue;
            const norm = normalizeRoadDebuggerTileOffsetForMap(
                point,
                { tileSize: this._tileSize, mapWidth: this._mapWidth, mapHeight: this._mapHeight }
            );
            point.tileX = norm.tileX;
            point.tileY = norm.tileY;
            point.offsetX = norm.offsetX;
            point.offsetY = norm.offsetY;
        }
    }

    _createSnapshot() {
        const snapshot = cloneJson({
            roads: this._roads,
            draft: this._draft,
            roadCounter: this._roadCounter,
            pointCounter: this._pointCounter,
            selection: this._selection,
            mergedConnectorIds: Array.from(this._mergedConnectorIds ?? []).filter((id) => typeof id === 'string' && id.trim()).sort(),
            junctions: Array.isArray(this._authoredJunctions) ? this._authoredJunctions : [],
            hiddenJunctionIds: Array.from(this._hiddenJunctionIds ?? []).filter((id) => typeof id === 'string' && id.trim()).sort(),
            suppressedAutoJunctionIds: Array.from(this._suppressedAutoJunctionIds ?? []).filter((id) => typeof id === 'string' && id.trim()).sort()
        });
        for (const road of snapshot.roads ?? []) this._normalizeSchemaRoadInPlace(road);
        this._normalizeSchemaRoadInPlace(snapshot.draft);
        return snapshot;
    }

    _restoreSnapshot(snapshot) {
        const next = snapshot ?? {};
        this._roads = Array.isArray(next.roads) ? next.roads : [];
        this._draft = next.draft ?? null;
        this._roadCounter = Number.isFinite(Number(next.roadCounter)) ? Number(next.roadCounter) : 1;
        this._pointCounter = Number.isFinite(Number(next.pointCounter)) ? Number(next.pointCounter) : 1;
        const merged = Array.isArray(next.mergedConnectorIds) ? next.mergedConnectorIds : [];
        this._mergedConnectorIds = new Set(merged.filter((id) => typeof id === 'string' && id.trim()));
        this._authoredJunctions = Array.isArray(next.junctions) ? next.junctions : [];
        const hidden = Array.isArray(next.hiddenJunctionIds) ? next.hiddenJunctionIds : [];
        this._hiddenJunctionIds = new Set(hidden.filter((id) => typeof id === 'string' && id.trim()));
        const suppressed = Array.isArray(next.suppressedAutoJunctionIds) ? next.suppressedAutoJunctionIds : [];
        this._suppressedAutoJunctionIds = new Set(suppressed.filter((id) => typeof id === 'string' && id.trim()));
        for (const road of this._roads ?? []) this._normalizeSchemaRoadInPlace(road);
        this._normalizeSchemaRoadInPlace(this._draft);
        const sel = next.selection && typeof next.selection === 'object' ? next.selection : {};
        this._selection = {
            type: sel.type ?? null,
            roadId: sel.roadId ?? null,
            segmentId: sel.segmentId ?? null,
            pointId: sel.pointId ?? null,
            pieceId: sel.pieceId ?? null,
            junctionId: sel.junctionId ?? null,
            connectorId: sel.connectorId ?? null,
            approachId: sel.approachId ?? null
        };
        this._hover = { roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        this._junctionToolHoverCandidateId = null;
        this._junctionToolSelectedCandidateIds?.clear?.();
    }

    _pushUndoSnapshot() {
        this._undoStack.push(this._createSnapshot());
        if (this._undoStack.length > (this._undoMax ?? 64)) this._undoStack.shift();
        this._redoStack = [];
        this.ui?.sync?.();
    }

    _sanitizeSelection() {
        const sel = this._selection ?? {};
        if (!sel.type) return;
        const derived = this._derived ?? null;
        if (!derived) return;

        if (sel.type === 'road') {
            const ok = derived.roads?.some?.((r) => r?.id === sel.roadId) ?? false;
            if (!ok) this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        } else if (sel.type === 'point') {
            const road = derived.roads?.find?.((r) => r?.id === sel.roadId) ?? null;
            const ok = !!(road?.points?.some?.((p) => p?.id === sel.pointId));
            if (!ok) this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        } else if (sel.type === 'piece') {
            const seg = derived.segments?.find?.((s) => s?.id === sel.segmentId) ?? null;
            const ok = !!(seg?.keptPieces?.some?.((p) => p?.id === sel.pieceId));
            if (!ok) this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        } else if (sel.type === 'segment') {
            const ok = derived.segments?.some?.((s) => s?.id === sel.segmentId) ?? false;
            if (!ok) this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        } else if (sel.type === 'junction') {
            const ok = derived.junctions?.some?.((j) => j?.id === sel.junctionId) ?? false;
            if (!ok) this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        } else if (sel.type === 'approach') {
            const junction = derived.junctions?.find?.((j) => j?.id === sel.junctionId) ?? null;
            const ok = !!junction?.endpoints?.some?.((e) => e?.id === sel.approachId);
            if (!ok) this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        } else if (sel.type === 'connector') {
            const junctions = derived.junctions ?? [];
            let ok = false;
            for (const j of junctions) {
                if (j?.connectors?.some?.((c) => c?.id === sel.connectorId)) {
                    ok = true;
                    break;
                }
            }
            if (!ok) this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        }

        this._applyHighlights();
        this.ui?.sync?.();
    }

    _parseSchema(input) {
        let raw = input;
        if (typeof raw === 'string') {
            try {
                raw = JSON.parse(raw);
            } catch (err) {
                return null;
            }
        }

        const obj = raw && typeof raw === 'object' ? raw : null;
        const roadsRaw = Array.isArray(obj?.roads) ? obj.roads : (Array.isArray(raw) ? raw : null);
        if (!roadsRaw) return null;

        const tileSize = Number(this._tileSize) || 24;

        const normalizePoint = (pt, index) => {
            const id = typeof pt?.id === 'string' && pt.id.trim() ? pt.id.trim() : `pt_${index + 1}`;
            const norm = clampRoadDebuggerTileOffsetForMap(
                {
                    tileX: pt?.tileX ?? 0,
                    tileY: pt?.tileY ?? 0,
                    offsetX: pt?.offsetX ?? 0,
                    offsetY: pt?.offsetY ?? 0
                },
                { tileSize, mapWidth: this._mapWidth, mapHeight: this._mapHeight }
            );
            const tangentFactor = clamp(Number.isFinite(Number(pt?.tangentFactor)) ? Number(pt.tangentFactor) : 1, 0, 5);
            return { id, tileX: norm.tileX, tileY: norm.tileY, offsetX: norm.offsetX, offsetY: norm.offsetY, tangentFactor };
        };

        const normalizeRoad = (road, index) => {
            const id = typeof road?.id === 'string' && road.id.trim() ? road.id.trim() : `road_${index + 1}`;
            const name = typeof road?.name === 'string' && road.name.trim() ? road.name.trim() : id;
            const lanesF = clampInt(road?.lanesF ?? 1, 1, 5);
            const lanesB = clampInt(road?.lanesB ?? 1, 0, 5);
            const visible = road?.visible === undefined ? true : road.visible !== false;
            const ptsRaw = Array.isArray(road?.points) ? road.points : [];
            const points = ptsRaw.map((pt, i) => normalizePoint(pt, i));
            return { id, name, lanesF, lanesB, visible, points };
        };

        const roads = roadsRaw.map((road, i) => normalizeRoad(road, i));
        const draft = obj?.draft ? normalizeRoad(obj.draft, roads.length) : null;
        const laneWidth = Number(obj?.laneWidth) || this._laneWidth || 4.8;
        const marginFactor = Number.isFinite(obj?.marginFactor) ? Number(obj.marginFactor) : (Number.isFinite(this._marginFactor) ? this._marginFactor : 0.1);
        const snapEnabled = obj?.snapEnabled === undefined ? (this._snapEnabled !== false) : !!obj.snapEnabled;
        const mergedConnectorIds = Array.isArray(obj?.mergedConnectorIds)
            ? obj.mergedConnectorIds.filter((id) => typeof id === 'string' && id.trim()).sort()
            : [];

        const junctionsRaw = Array.isArray(obj?.junctions) ? obj.junctions : [];
        const junctions = junctionsRaw
            .filter((j) => j && typeof j === 'object' && Array.isArray(j.candidateIds))
            .map((j) => {
                const candidateIds = Array.isArray(j.candidateIds)
                    ? Array.from(new Set(j.candidateIds.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()))).sort()
                    : [];
                if (!candidateIds.length) return null;
                return {
                    id: stableHashId('junc_', candidateIds.join('|')),
                    candidateIds
                };
            })
            .filter(Boolean)
            .sort((a, b) => compareString(a?.id, b?.id));

        const hiddenJunctionIds = Array.isArray(obj?.hiddenJunctionIds)
            ? obj.hiddenJunctionIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()).sort()
            : [];
        const suppressedAutoJunctionIds = Array.isArray(obj?.suppressedAutoJunctionIds)
            ? obj.suppressedAutoJunctionIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()).sort()
            : [];

        return { roads, draft, laneWidth, marginFactor, snapEnabled, mergedConnectorIds, junctions, hiddenJunctionIds, suppressedAutoJunctionIds };
    }

    _resolveCounters() {
        let maxRoad = 0;
        let maxPt = 0;
        const scanRoad = (road) => {
            if (!road) return;
            const rid = typeof road.id === 'string' ? road.id : '';
            const rm = /^road_(\d+)$/.exec(rid);
            if (rm) maxRoad = Math.max(maxRoad, Number(rm[1]) || 0);
            for (const pt of road.points ?? []) {
                const pid = typeof pt?.id === 'string' ? pt.id : '';
                const pm = /^pt_(\d+)$/.exec(pid);
                if (pm) maxPt = Math.max(maxPt, Number(pm[1]) || 0);
            }
        };
        for (const road of this._roads ?? []) scanRoad(road);
        if (this._draft) scanRoad(this._draft);
        return { roadCounter: Math.max(1, maxRoad + 1), pointCounter: Math.max(1, maxPt + 1) };
    }

    _ensureSnapHighlight() {
        if (this._snapHighlightMesh) return;
        if (!this.root) return;
        const step = (Number(this._tileSize) || 24) / 10;
        const geo = new THREE.PlaneGeometry(step, step);
        geo.rotateX(-Math.PI * 0.5);
        this._snapHighlightGeo = geo;

        const mesh = new THREE.Mesh(geo, this._materials.snapHighlight);
        mesh.visible = false;
        mesh.position.set(0, this._groundY + 0.011, 0);
        mesh.frustumCulled = false;
        mesh.renderOrder = -100;
        mesh.userData = { type: 'snap_highlight' };
        this._snapHighlightMesh = mesh;
        this.root.add(mesh);
    }

    _updateSnapHighlight(worldX, worldZ, { visible = true } = {}) {
        if (!visible) {
            this._setSnapHighlightVisible(false);
            return;
        }
        this._ensureSnapHighlight();
        if (!this._snapHighlightMesh) return;
        this._snapHighlightMesh.position.set(Number(worldX) || 0, this._groundY + 0.011, Number(worldZ) || 0);
        this._setSnapHighlightVisible(true);
    }

    _setSnapHighlightVisible(visible) {
        if (!this._snapHighlightMesh) return;
        this._snapHighlightMesh.visible = !!visible;
    }

    _ensureHoverCube() {
        if (this._hoverCubeMesh) return;
        if (!this.root) return;
        const radius = Number(this._sphereGeo?.parameters?.radius) || 0.45;
        const padding = Math.max(0.08, radius * 0.18);
        const size = radius * 2 + padding * 2;
        const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size));
        this._hoverCubeGeo = geo;

        const mesh = new THREE.LineSegments(geo, this._materials.hoverCube);
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.renderOrder = 90;
        mesh.userData = { type: 'hover_cube' };
        this._hoverCubeMesh = mesh;
        this.root.add(mesh);
    }

    _setHoverCubeVisible(visible) {
        if (!this._hoverCubeMesh) return;
        this._hoverCubeMesh.visible = !!visible;
    }

    _syncHoverCube() {
        const hoverRoadId = this._hover?.roadId ?? null;
        const hoverPointId = this._hover?.pointId ?? null;
        const sel = this._selection ?? {};
        const selRoadId = sel?.type === 'point' ? (sel.roadId ?? null) : null;
        const selPointId = sel?.type === 'point' ? (sel.pointId ?? null) : null;

        const roadId = hoverRoadId ?? selRoadId;
        const pointId = hoverPointId ?? selPointId;
        if (!roadId || !pointId) {
            this._setHoverCubeVisible(false);
            return;
        }

        const found = this._findSchemaRoad?.(roadId) ?? null;
        if (found?.road?.visible === false) {
            this._setHoverCubeVisible(false);
            return;
        }

        this._ensureHoverCube();
        const cube = this._hoverCubeMesh;
        if (!cube) return;

        const pointMesh = (this._controlPointMeshes ?? []).find((mesh) => mesh?.userData?.roadId === roadId && mesh?.userData?.pointId === pointId) ?? null;
        if (pointMesh?.position) {
            cube.position.copy(pointMesh.position);
            this._setHoverCubeVisible(true);
            return;
        }

        const derivedRoad = this._derived?.roads?.find?.((r) => r?.id === roadId) ?? null;
        const pt = derivedRoad?.points?.find?.((p) => p?.id === pointId) ?? null;
        const w = pt?.world ?? null;
        if (!w) {
            this._setHoverCubeVisible(false);
            return;
        }

        cube.position.set(Number(w.x) || 0, this._groundY + 0.06, Number(w.z) || 0);
        this._setHoverCubeVisible(true);
    }

    _ensureDraftPreviewLine() {
        if (this._draftPreviewLine) return;
        if (!this.root) return;

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        this._draftPreviewGeo = geo;

        const line = new THREE.Line(geo, this._materials.draftPreviewLine);
        line.visible = false;
        line.frustumCulled = false;
        line.renderOrder = 110;
        line.userData = { type: 'draft_preview_line' };
        this._draftPreviewLine = line;
        this.root.add(line);
    }

    _setDraftPreviewVisible(visible) {
        if (!this._draftPreviewLine) return;
        this._draftPreviewLine.visible = !!visible;
    }

    _ensureDraftFirstTileMarker() {
        if (this._draftFirstTileMarkerMesh) return;
        if (!this.root) return;
        const tileSize = Number(this._tileSize) || 24;
        const outer = Math.max(2, tileSize * 0.38);
        const inner = Math.max(1, outer * 0.85);
        const geo = new THREE.RingGeometry(inner, outer, 48);
        geo.rotateX(-Math.PI * 0.5);
        this._draftFirstTileMarkerGeo = geo;

        const mesh = new THREE.Mesh(geo, this._materials.draftFirstTileMarker);
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.renderOrder = 120;
        mesh.userData = { type: 'draft_first_tile_marker' };
        this._draftFirstTileMarkerMesh = mesh;
        this.root.add(mesh);
    }

    _ensureDraftHoverTileMarker() {
        if (this._draftHoverTileMarkerMesh) return;
        if (!this.root) return;
        const tileSize = Number(this._tileSize) || 24;
        const outer = Math.max(2, tileSize * 0.38);
        const inner = Math.max(1, outer * 0.85);
        const geo = new THREE.RingGeometry(inner, outer, 48);
        geo.rotateX(-Math.PI * 0.5);
        this._draftHoverTileMarkerGeo = geo;

        const mesh = new THREE.Mesh(geo, this._materials.draftHoverTileMarker);
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.renderOrder = 119;
        mesh.userData = { type: 'draft_hover_tile_marker' };
        this._draftHoverTileMarkerMesh = mesh;
        this.root.add(mesh);
    }

    _setDraftHoverTileMarkerVisible(visible) {
        if (!this._draftHoverTileMarkerMesh) return;
        this._draftHoverTileMarkerMesh.visible = !!visible;
    }

    _setDraftFirstTileMarkerVisible(visible) {
        if (!this._draftFirstTileMarkerMesh) return;
        this._draftFirstTileMarkerMesh.visible = !!visible;
    }

    _syncDraftFirstTileMarker() {
        const draft = this._draft ?? null;
        const first = draft?.points?.[0] ?? null;
        if (!draft || !first) {
            this._setDraftFirstTileMarkerVisible(false);
            return;
        }

        this._ensureDraftFirstTileMarker();
        const mesh = this._draftFirstTileMarkerMesh;
        if (!mesh) return;
        const tileSize = Number(this._tileSize) || 24;
        const ox = Number(this._origin?.x) || 0;
        const oz = Number(this._origin?.z) || 0;
        const tx = Number(first.tileX) || 0;
        const ty = Number(first.tileY) || 0;
        mesh.position.set(ox + tx * tileSize, this._groundY + 0.021, oz + ty * tileSize);
        this._setDraftFirstTileMarkerVisible(true);
    }

    _ensureApproachMarker() {
        if (this._approachMarkerMesh) return;
        if (!this.root) return;
        const tileSize = Number(this._tileSize) || 24;
        const outer = Math.max(1.5, tileSize * 0.08);
        const inner = Math.max(0.9, outer * 0.7);
        const geo = new THREE.RingGeometry(inner, outer, 36);
        geo.rotateX(-Math.PI * 0.5);
        this._approachMarkerGeo = geo;

        const mesh = new THREE.Mesh(geo, this._materials.approachMarkerHover);
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.renderOrder = 125;
        mesh.userData = { type: 'junction_approach_marker' };
        this._approachMarkerMesh = mesh;
        this.root.add(mesh);
    }

    _setApproachMarkerVisible(visible) {
        if (!this._approachMarkerMesh) return;
        this._approachMarkerMesh.visible = !!visible;
    }

    _syncApproachMarker() {
        const derived = this._derived ?? null;
        if (!derived) {
            this._setApproachMarkerVisible(false);
            return;
        }

        const sel = this._selection ?? {};
        const hover = this._hover ?? {};

        const selApproach = sel?.type === 'approach' ? (sel.approachId ?? null) : null;
        const selJunction = selApproach ? (sel.junctionId ?? null) : null;
        const hoverApproach = hover?.approachId ?? null;
        const hoverJunction = hoverApproach ? (hover.junctionId ?? null) : null;

        const approachId = selApproach ?? hoverApproach ?? null;
        const junctionId = selApproach ? selJunction : hoverJunction;
        if (!approachId || !junctionId) {
            this._setApproachMarkerVisible(false);
            return;
        }

        const junction = derived?.junctions?.find?.((j) => j?.id === junctionId) ?? null;
        const endpoint = junction?.endpoints?.find?.((e) => e?.id === approachId) ?? null;
        const w = endpoint?.world ?? null;
        if (!w) {
            this._setApproachMarkerVisible(false);
            return;
        }

        this._ensureApproachMarker();
        const mesh = this._approachMarkerMesh;
        if (!mesh) return;
        const isSelected = !!selApproach && selApproach === approachId;
        mesh.material = isSelected ? this._materials.approachMarkerSelected : this._materials.approachMarkerHover;
        mesh.position.set(Number(w.x) || 0, this._groundY + 0.024, Number(w.z) || 0);
        this._setApproachMarkerVisible(true);
    }

    _pickJunctionCandidateAtPointer({ radiusPx = JUNCTION_CANDIDATE_CLICK_RADIUS_PX } = {}) {
        if (!this.canvas) return null;
        const rect = this.canvas.getBoundingClientRect?.() ?? null;
        if (!rect || !(rect.width > 1) || !(rect.height > 1)) return null;
        const ndcX = Number(this.pointer?.x) || 0;
        const ndcY = Number(this.pointer?.y) || 0;
        const clientX = Number(rect.left) + (ndcX * 0.5 + 0.5) * Number(rect.width);
        const clientY = Number(rect.top) + (-ndcY * 0.5 + 0.5) * Number(rect.height);
        return this._pickJunctionCandidateAtClient(clientX, clientY, { rect, radiusPx });
    }

    _pickJunctionCandidateAtClient(clientX, clientY, { rect, radiusPx = JUNCTION_CANDIDATE_CLICK_RADIUS_PX } = {}) {
        const derived = this._derived ?? null;
        const candidates = derived?.junctionCandidates ?? null;
        if (!candidates) return null;

        const roads = this._getRoadsForPipeline({ includeDraft: true });
        const visibleByRoadId = new Map();
        for (const road of roads) {
            if (!road?.id) continue;
            visibleByRoadId.set(road.id, road.visible !== false);
        }
        const isRoadVisible = (roadId) => {
            if (!roadId) return true;
            return visibleByRoadId.get(roadId) !== false;
        };

        const r = Number(radiusPx) || 0;
        const radiusSq = r * r;
        const rectObj = rect ?? (this.canvas?.getBoundingClientRect?.() ?? null);
        if (!rectObj || !(rectObj.width > 1) || !(rectObj.height > 1)) return null;

        const w = Number(rectObj.width) || 1;
        const h = Number(rectObj.height) || 1;
        const left = Number(rectObj.left) || 0;
        const top = Number(rectObj.top) || 0;
        const y = this._groundY + 0.055;

        let best = null;
        let bestDistSq = radiusSq;

        const tryCandidate = (cand, kind) => {
            if (!cand?.id || !cand?.world) return;
            if (!isRoadVisible(cand.roadId ?? null)) return;

            tmpProjectVec.set(Number(cand.world.x) || 0, y, Number(cand.world.z) || 0);
            tmpProjectVec.project(this.camera);
            if (!(tmpProjectVec.z >= -1 && tmpProjectVec.z <= 1)) return;
            const sx = left + (tmpProjectVec.x * 0.5 + 0.5) * w;
            const sy = top + (-tmpProjectVec.y * 0.5 + 0.5) * h;
            const dx = sx - clientX;
            const dy = sy - clientY;
            const d2 = dx * dx + dy * dy;
            if (d2 > bestDistSq) return;
            bestDistSq = d2;
            best = { candidateId: cand.id, candidateKind: kind };
        };

        const endpoints = candidates?.endpoints ?? [];
        for (const ep of endpoints) tryCandidate(ep, 'endpoint');

        const corners = candidates?.corners ?? [];
        for (const corner of corners) tryCandidate(corner, 'corner');

        return best;
    }

    _pickControlPointAtPointer({ radiusPx = CONTROL_POINT_CLICK_RADIUS_PX } = {}) {
        if (!this.canvas) return null;
        const rect = this.canvas.getBoundingClientRect?.() ?? null;
        if (!rect || !(rect.width > 1) || !(rect.height > 1)) return null;

        const ndcX = Number(this.pointer?.x) || 0;
        const ndcY = Number(this.pointer?.y) || 0;
        const clientX = Number(rect.left) + (ndcX * 0.5 + 0.5) * Number(rect.width);
        const clientY = Number(rect.top) + (-ndcY * 0.5 + 0.5) * Number(rect.height);

        const r = Number(radiusPx) || 0;
        const radiusSq = r * r;
        const w = Number(rect.width) || 1;
        const h = Number(rect.height) || 1;
        const left = Number(rect.left) || 0;
        const top = Number(rect.top) || 0;

        let best = null;
        let bestDistSq = radiusSq;

        const meshes = this._controlPointMeshes ?? [];
        for (const mesh of meshes) {
            const roadId = mesh?.userData?.roadId ?? null;
            const pointId = mesh?.userData?.pointId ?? null;
            if (!roadId || !pointId) continue;
            if (!mesh?.position) continue;

            tmpProjectVec.copy(mesh.position);
            tmpProjectVec.project(this.camera);
            if (!(tmpProjectVec.z >= -1 && tmpProjectVec.z <= 1)) continue;
            const sx = left + (tmpProjectVec.x * 0.5 + 0.5) * w;
            const sy = top + (-tmpProjectVec.y * 0.5 + 0.5) * h;
            const dx = sx - clientX;
            const dy = sy - clientY;
            const d2 = dx * dx + dy * dy;
            if (d2 > bestDistSq) continue;
            bestDistSq = d2;
            best = { roadId, pointId };
        }

        if (!best) return null;
        return { type: 'point', roadId: best.roadId, pointId: best.pointId };
    }

    _pickAtPointer() {
        if (this._junctionToolEnabled) {
            const cand = this._pickJunctionCandidateAtPointer({ radiusPx: JUNCTION_CANDIDATE_CLICK_RADIUS_PX });
            if (cand?.candidateId) {
                return {
                    type: 'junction_candidate',
                    candidateId: cand.candidateId,
                    candidateKind: cand.candidateKind ?? null
                };
            }
        }
        const pointPick = this._pickControlPointAtPointer({ radiusPx: CONTROL_POINT_CLICK_RADIUS_PX });
        if (pointPick) return pointPick;

        this.raycaster.setFromCamera(this.pointer, this.camera);
        const connHits = this.raycaster.intersectObjects(this._connectorPickMeshes ?? [], false);
        const connObj = connHits[0]?.object ?? null;
        if (connObj?.userData?.connectorId) {
            return { type: 'connector', connectorId: connObj.userData.connectorId, junctionId: connObj.userData.junctionId ?? null };
        }

        const junctionHits = this.raycaster.intersectObjects(this._junctionPickMeshes ?? [], false);
        const junctionObj = junctionHits[0]?.object ?? null;
        if (junctionObj?.userData?.junctionId) {
            return { type: 'junction', junctionId: junctionObj.userData.junctionId };
        }

        const asphaltHits = this.raycaster.intersectObjects(this._asphaltMeshes ?? [], false);
        const asphaltObj = asphaltHits[0]?.object ?? null;
        if (asphaltObj?.userData?.roadId && asphaltObj?.userData?.segmentId && asphaltObj?.userData?.pieceId) {
            return { type: 'piece', roadId: asphaltObj.userData.roadId, segmentId: asphaltObj.userData.segmentId, pieceId: asphaltObj.userData.pieceId };
        }

        const segHits = this.raycaster.intersectObjects(this._segmentPickMeshes ?? [], false);
        const segObj = segHits[0]?.object ?? null;
        if (segObj?.userData?.roadId && segObj?.userData?.segmentId) {
            return { type: 'segment', roadId: segObj.userData.roadId, segmentId: segObj.userData.segmentId };
        }

        return null;
    }

    _pickHoverAtPointer() {
        if (this._junctionToolEnabled) {
            const cand = this._pickJunctionCandidateAtPointer({ radiusPx: JUNCTION_CANDIDATE_HOVER_RADIUS_PX });
            if (cand?.candidateId) {
                return {
                    type: 'junction_candidate',
                    candidateId: cand.candidateId,
                    candidateKind: cand.candidateKind ?? null
                };
            }
        }
        const pointPick = this._pickControlPointAtPointer({ radiusPx: CONTROL_POINT_HOVER_RADIUS_PX });
        if (pointPick) return pointPick;

        this.raycaster.setFromCamera(this.pointer, this.camera);
        const connHits = this.raycaster.intersectObjects(this._connectorPickMeshes ?? [], false);
        const connObj = connHits[0]?.object ?? null;
        if (connObj?.userData?.connectorId) {
            return { type: 'connector', connectorId: connObj.userData.connectorId, junctionId: connObj.userData.junctionId ?? null };
        }

        const junctionHits = this.raycaster.intersectObjects(this._junctionPickMeshes ?? [], false);
        const junctionObj = junctionHits[0]?.object ?? null;
        if (junctionObj?.userData?.junctionId) {
            return { type: 'junction', junctionId: junctionObj.userData.junctionId };
        }

        const segHits = this.raycaster.intersectObjects(this._segmentPickMeshes ?? [], false);
        const segObj = segHits[0]?.object ?? null;
        if (segObj?.userData?.roadId && segObj?.userData?.segmentId) {
            return { type: 'segment', roadId: segObj.userData.roadId, segmentId: segObj.userData.segmentId };
        }

        const asphaltHits = this.raycaster.intersectObjects(this._asphaltMeshes ?? [], false);
        const asphaltObj = asphaltHits[0]?.object ?? null;
        if (asphaltObj?.userData?.roadId && asphaltObj?.userData?.segmentId && asphaltObj?.userData?.pieceId) {
            return { type: 'piece', roadId: asphaltObj.userData.roadId, segmentId: asphaltObj.userData.segmentId, pieceId: asphaltObj.userData.pieceId };
        }

        return null;
    }

    updateHoverFromPointer() {
        if (this._isDraggingCamera || this._pendingClick || this.isPointDragActive?.()) return;
        const pick = this._pickHoverAtPointer();
        if (pick?.type === 'junction_candidate') {
            const next = pick.candidateId ?? null;
            if (this._junctionToolHoverCandidateId !== next) {
                this._junctionToolHoverCandidateId = next;
                this._applyHighlights();
                this.ui?.sync?.();
            }
            return;
        }
        if (this._junctionToolHoverCandidateId) {
            this._junctionToolHoverCandidateId = null;
            this._applyHighlights();
            this.ui?.sync?.();
        }
        if (pick?.type === 'connector') {
            this.setHoverConnector(pick.connectorId);
            return;
        }
        if (pick?.type === 'junction') {
            this.setHoverJunction(pick.junctionId);
            return;
        }
        if (pick?.type === 'point') {
            this.setHoverPoint(pick.roadId, pick.pointId);
            return;
        }
        if (pick?.type === 'segment') {
            this.setHoverSegment(pick.segmentId);
            return;
        }
        if (pick?.type === 'piece') {
            this.setHoverSegment(pick.segmentId);
            return;
        }
        this.clearHover();
    }

    _getRoadsForPipeline({ includeDraft = false } = {}) {
        if (!includeDraft || !this._draft) return this._roads;
        return [...this._roads, this._draft];
    }

    _rebuildPipeline() {
        const flags = {
            centerline: this._renderOptions.centerline,
            directionCenterlines: this._renderOptions.directionCenterlines,
            laneEdges: this._renderOptions.edges,
            asphaltEdges: this._renderOptions.edges,
            markers: this._renderOptions.points,
            asphaltObb: false
        };

        const roads = this._getRoadsForPipeline({ includeDraft: true });
        this._derived = computeRoadEngineEdges({
            roads,
            settings: {
                origin: this._origin,
                tileSize: this._tileSize,
                laneWidth: this._laneWidth,
                marginFactor: this._marginFactor,
                flags,
                trim: {
                    enabled: true,
                    threshold: (Number(this._laneWidth) || 4.8) * (this._trimThresholdFactor ?? 0.1),
                    debug: { ...this._trimDebug }
                },
                junctions: {
                    enabled: this._junctionEnabled !== false,
                    thresholdFactor: Number(this._junctionThresholdFactor) || 1.5,
                    debug: { ...this._junctionDebug },
                    mergedConnectorIds: Array.from(this._mergedConnectorIds ?? []),
                    manualJunctions: cloneJson(this._authoredJunctions ?? []),
                    hiddenJunctionIds: Array.from(this._hiddenJunctionIds ?? []),
                    suppressedAutoJunctionIds: Array.from(this._suppressedAutoJunctionIds ?? [])
                }
            }
        });

        this._sanitizeJunctionToolSelection?.();
        this._rebuildOverlaysFromDerived();
        this._syncDraftFirstTileMarker();
        this._applyHighlights();
        this.ui?.sync?.();
    }

    _clearOverlays() {
        if (this._overlayRoot) {
            this.root?.remove?.(this._overlayRoot);
            this._overlayRoot.traverse((child) => {
                if (!child?.geometry?.dispose) return;
                if (child.geometry === this._sphereGeo) return;
                if (child.geometry === this._junctionCandidateGeo) return;
                if (child.geometry === this._junctionCandidateRingGeo) return;
                child.geometry.dispose();
            });
            this._overlayRoot = null;
        }
        this._asphaltGroup = null;
        this._markingsGroup = null;
        this._debugGroup = null;
        this._highlightGroup = null;
        this._overlayLines = [];
        this._overlayPoints = [];
        this._asphaltMeshes = [];
        this._junctionSurfaceMeshes = [];
        this._markingLines = [];
        this._arrowMeshes = [];
        this._arrowTangentLines = [];
        this._controlPointMeshes = [];
        this._segmentPickMeshes = [];
        this._junctionPickMeshes = [];
        this._connectorPickMeshes = [];
        this._junctionCandidateMeshes = [];
        this._junctionCandidatePickMeshes = [];
    }

    _rebuildOverlaysFromDerived() {
        if (!this.root) return;
        this._clearOverlays();
        this._syncLineMaterialResolution({ force: true });

        const overlay = new THREE.Group();
        overlay.name = 'RoadDebuggerOverlays';
        this._overlayRoot = overlay;
        this.root.add(overlay);

        const asphaltGroup = new THREE.Group();
        asphaltGroup.name = 'RoadDebuggerAsphalt';
        asphaltGroup.visible = this._renderOptions.asphalt !== false;
        overlay.add(asphaltGroup);
        this._asphaltGroup = asphaltGroup;

        const markingsGroup = new THREE.Group();
        markingsGroup.name = 'RoadDebuggerMarkings';
        markingsGroup.visible = this._renderOptions.markings === true;
        overlay.add(markingsGroup);
        this._markingsGroup = markingsGroup;

        const debugGroup = new THREE.Group();
        debugGroup.name = 'RoadDebuggerTrimDebug';
        overlay.add(debugGroup);
        this._debugGroup = debugGroup;

        const highlightGroup = new THREE.Group();
        highlightGroup.name = 'RoadDebuggerHighlight';
        overlay.add(highlightGroup);
        this._highlightGroup = highlightGroup;

        const linesGroup = new THREE.Group();
        linesGroup.name = 'RoadDebuggerLines';
        overlay.add(linesGroup);

        const pointsGroup = new THREE.Group();
        pointsGroup.name = 'RoadDebuggerPoints';
        overlay.add(pointsGroup);

        const controlGroup = new THREE.Group();
        controlGroup.name = 'RoadDebuggerControlPoints';
        overlay.add(controlGroup);

        const junctionToolGroup = new THREE.Group();
        junctionToolGroup.name = 'RoadDebuggerJunctionTool';
        overlay.add(junctionToolGroup);

        const pickGroup = new THREE.Group();
        pickGroup.name = 'RoadDebuggerPickMeshes';
        overlay.add(pickGroup);

        const lineY = this._groundY + 0.03;
        const pointY = this._groundY + 0.04;
        const asphaltY = this._groundY + 0.012;
        const markingY = this._groundY + 0.016;
        const arrowY = this._groundY + 0.017;
        const debugY0 = this._groundY + 0.013;
        const debugY1 = this._groundY + 0.014;
        const debugY2 = this._groundY + 0.015;
        const pickY = this._groundY + 0.02;

        const primitives = this._derived?.primitives ?? [];
        const schemaRoads = this._getRoadsForPipeline({ includeDraft: true });
        const visibleByRoadId = new Map();
        for (const road of schemaRoads) {
            if (!road?.id) continue;
            visibleByRoadId.set(road.id, road.visible !== false);
        }
        const isRoadVisible = (roadId) => {
            if (!roadId) return true;
            return visibleByRoadId.get(roadId) !== false;
        };

        const derivedJunctions = this._derived?.junctions ?? [];
        const visibleByJunctionId = new Map();
        const junctionById = new Map();
        for (const junction of derivedJunctions) {
            const jid = junction?.id ?? null;
            if (!jid) continue;
            junctionById.set(jid, junction);
            const roadIds = Array.isArray(junction?.roadIds) ? junction.roadIds : [];
            const anyVisible = roadIds.length ? roadIds.some((rid) => isRoadVisible(rid)) : true;
            visibleByJunctionId.set(jid, anyVisible);
        }
        const isJunctionVisible = (junctionId) => {
            if (!junctionId) return true;
            const v = visibleByJunctionId.get(junctionId);
            return v !== false;
        };

        const polygonMeshData = buildRoadEnginePolygonMeshData(primitives);
        const polygonMeshById = new Map();
        for (const mesh of polygonMeshData) {
            if (!mesh?.id) continue;
            polygonMeshById.set(mesh.id, mesh);
        }

        const makePolygonGeometry = (id, pts, y) => {
            const mesh = polygonMeshById.get(id) ?? null;
            const fallback = mesh ? null : triangulateSimplePolygonXZ(pts);
            const vertices = mesh?.vertices ?? fallback?.vertices ?? [];
            const indices = mesh?.indices ?? fallback?.indices ?? [];
            if (vertices.length < 3 || indices.length < 3) return null;

            const positions = new Float32Array(vertices.length * 3);
            for (let i = 0; i < vertices.length; i++) {
                const p = vertices[i];
                const base = i * 3;
                positions[base] = Number(p?.x) || 0;
                positions[base + 1] = y;
                positions[base + 2] = Number(p?.z) || 0;
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geo.setIndex(indices);
            geo.computeBoundingSphere();
            return geo;
        };

        const makePickStripGeometry = (a, b, width, y) => {
            const ax = Number(a?.x) || 0;
            const az = Number(a?.z) || 0;
            const bx = Number(b?.x) || 0;
            const bz = Number(b?.z) || 0;
            const dx = bx - ax;
            const dz = bz - az;
            const len = Math.hypot(dx, dz);
            if (!(len > 1e-6)) return null;
            const inv = 1 / len;
            const ux = dx * inv;
            const uz = dz * inv;
            const rx = uz;
            const rz = -ux;
            const hw = (Number(width) || 0) * 0.5;
            const p0 = { x: ax + rx * hw, z: az + rz * hw };
            const p1 = { x: ax - rx * hw, z: az - rz * hw };
            const p2 = { x: bx - rx * hw, z: bz - rz * hw };
            const p3 = { x: bx + rx * hw, z: bz + rz * hw };
            const positions = new Float32Array([
                p0.x, y, p0.z,
                p1.x, y, p1.z,
                p2.x, y, p2.z,
                p0.x, y, p0.z,
                p2.x, y, p2.z,
                p3.x, y, p3.z
            ]);
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geo.computeBoundingSphere();
            return geo;
        };

        for (const prim of primitives) {
            if (!prim || prim.type !== 'polyline') continue;
            const pts = Array.isArray(prim.points) ? prim.points : [];
            if (pts.length < 2) continue;
            const roadId = prim.roadId ?? null;
            const junctionId = prim.junctionId ?? null;
            if (roadId) {
                if (!isRoadVisible(roadId)) continue;
            } else if (junctionId && !isJunctionVisible(junctionId)) {
                continue;
            }

            const positions = [];
            for (const p of pts) {
                positions.push(Number(p.x) || 0, lineY, Number(p.z) || 0);
            }

            const geo = new LineGeometry();
            geo.setPositions(positions);

            const kind = prim.kind ?? 'unknown';
            const baseMat = ensureMapEntry(this._materials.lineBase, kind, () => {
                const mat = new LineMaterial({
                    color: baseColorForKind(kind),
                    linewidth: baseLineWidthForKind(kind),
                    worldUnits: false,
                    transparent: true,
                    opacity: baseLineOpacityForKind(kind),
                    depthTest: false,
                    depthWrite: false
                });
                mat.resolution.set(this._lineMaterialResolution.x, this._lineMaterialResolution.y);
                return mat;
            });

            const line = new Line2(geo, baseMat);
            line.computeLineDistances();
            line.frustumCulled = false;
            line.userData = { type: 'polyline', roadId, segmentId: prim.segmentId ?? null, kind, junctionId, connectorId: prim.connectorId ?? null };
            line.renderOrder = baseLineRenderOrderForKind(kind);
            linesGroup.add(line);
            this._overlayLines.push(line);

            if (kind === 'junction_connector' && prim.connectorId && pts.length >= 2) {
                const pickWidth = Math.max(1.25, (Number(this._laneWidth) || 4.8) * 0.28);
                const pickGeo = makePickStripGeometry(pts[0], pts[1], pickWidth, pickY);
                if (pickGeo) {
                    const pick = new THREE.Mesh(pickGeo, this._materials.pickHidden);
                    pick.userData = { type: 'connector_pick', junctionId, connectorId: prim.connectorId };
                    pick.renderOrder = 4;
                    pickGroup.add(pick);
                    this._connectorPickMeshes.push(pick);
                }
            }
        }

        for (const prim of primitives) {
            if (!prim || prim.type !== 'points') continue;
            const pts = Array.isArray(prim.points) ? prim.points : [];
            if (!pts.length) continue;
            const roadId = prim.roadId ?? null;
            const junctionId = prim.junctionId ?? null;
            if (roadId) {
                if (!isRoadVisible(roadId)) continue;
            } else if (junctionId && !isJunctionVisible(junctionId)) {
                continue;
            }
            const positions = [];
            for (const p of pts) {
                positions.push(Number(p.x) || 0, pointY, Number(p.z) || 0);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const kind = prim.kind ?? 'markers';
            const baseMat = ensureMapEntry(this._materials.pointBase, kind, () => new THREE.PointsMaterial({
                color: baseColorForKind(kind.replace(/_markers$/, '')),
                size: kind === 'junction_endpoints' ? 7 : 5,
                sizeAttenuation: false,
                transparent: true,
                opacity: 0.85,
                depthTest: false,
                depthWrite: false
            }));

            const points = new THREE.Points(geo, baseMat);
            points.frustumCulled = false;
            points.userData = { type: 'points', roadId, segmentId: prim.segmentId ?? null, kind, junctionId };
            pointsGroup.add(points);
            this._overlayPoints.push(points);
        }

        for (const prim of primitives) {
            if (!prim || prim.type !== 'polygon') continue;
            const pts = Array.isArray(prim.points) ? prim.points : [];
            if (pts.length < 3) continue;
            const kind = prim.kind ?? 'polygon';
            const roadId = prim.roadId ?? null;
            const segmentId = prim.segmentId ?? null;
            const junctionId = prim.junctionId ?? null;
            const id = prim.id ?? `${segmentId ?? 'poly'}__${kind}`;
            if (roadId) {
                if (!isRoadVisible(roadId)) continue;
            } else if (junctionId && !isJunctionVisible(junctionId)) {
                continue;
            }

            if (kind === 'asphalt_piece') {
                const geo = makePolygonGeometry(id, pts, asphaltY);
                if (!geo) continue;
                const mesh = new THREE.Mesh(geo, this._materials.asphaltBase);
                mesh.userData = { type: 'asphalt_piece', roadId, segmentId, pieceId: id };
                mesh.renderOrder = 0;
                asphaltGroup.add(mesh);
                this._asphaltMeshes.push(mesh);

                const pickGeo = makePolygonGeometry(id, pts, pickY);
                if (pickGeo) {
                    const pick = new THREE.Mesh(pickGeo, this._materials.pickHidden);
                    pick.userData = { type: 'segment_pick', roadId, segmentId, pieceId: id };
                    pick.renderOrder = 5;
                    pickGroup.add(pick);
                    this._segmentPickMeshes.push(pick);
                }
                continue;
            }

            if (kind === 'junction_surface') {
                const geo = makePolygonGeometry(id, pts, asphaltY);
                if (!geo) continue;
                const junction = junctionById.get(junctionId) ?? null;
                const showAsphalt = junction?.asphaltVisible !== false;
                if (showAsphalt) {
                    const mesh = new THREE.Mesh(geo, this._materials.asphaltBase);
                    mesh.userData = { type: 'junction_surface', junctionId, id };
                    mesh.renderOrder = -1;
                    asphaltGroup.add(mesh);
                    this._junctionSurfaceMeshes.push(mesh);
                }

                const pickGeo = makePolygonGeometry(id, pts, pickY);
                if (pickGeo) {
                    const pick = new THREE.Mesh(pickGeo, this._materials.pickHidden);
                    pick.userData = { type: 'junction_pick', junctionId, id };
                    pick.renderOrder = 3;
                    pickGroup.add(pick);
                    this._junctionPickMeshes.push(pick);
                }
                continue;
            }

            const mat = (() => {
                if (kind === 'trim_raw_asphalt') return this._materials.debugRawAsphalt;
                if (kind === 'trim_strip') return this._materials.debugStrip;
                if (kind === 'trim_overlap') return this._materials.debugOverlap;
                if (kind === 'trim_removed_piece') return this._materials.debugRemovedPiece;
                if (kind === 'trim_kept_piece') return this._materials.debugKeptPiece;
                if (kind === 'trim_dropped_piece') return this._materials.debugDroppedPiece;
                return this._materials.debugStrip;
            })();

            const y = kind === 'trim_overlap'
                ? debugY1
                : (kind === 'trim_kept_piece' || kind === 'trim_removed_piece' || kind === 'trim_dropped_piece')
                    ? debugY2
                    : debugY0;
            const geo = makePolygonGeometry(id, pts, y);
            if (!geo) continue;
            const mesh = new THREE.Mesh(geo, mat);
            mesh.userData = { type: 'debug_polygon', kind, roadId, segmentId, id };
            mesh.renderOrder = kind === 'trim_overlap'
                ? 1
                : kind === 'trim_kept_piece'
                    ? 2
                    : kind === 'trim_removed_piece'
                        ? 3
                        : kind === 'trim_dropped_piece'
                            ? 4
                            : 0;
            debugGroup.add(mesh);
        }

        const roads = this._derived?.roads ?? [];
        for (const road of roads) {
            const isDraft = this._draft?.id === road?.id;
            if (!isRoadVisible(road?.id)) continue;
            const mat = isDraft ? this._materials.controlPointDraft : this._materials.controlPoint;
            const pts = road?.points ?? [];
            for (const pt of pts) {
                const w = pt?.world ?? null;
                if (!w) continue;
                const mesh = new THREE.Mesh(this._sphereGeo, mat);
                mesh.position.set(Number(w.x) || 0, pointY + 0.02, Number(w.z) || 0);
                mesh.userData = { type: 'control_point', roadId: road.id, pointId: pt.id };
                mesh.renderOrder = 50;
                controlGroup.add(mesh);
                this._controlPointMeshes.push(mesh);
            }
        }

        if (this._junctionToolEnabled) {
            const candidates = this._derived?.junctionCandidates ?? null;
            const endpointCandidates = candidates?.endpoints ?? [];
            const cornerCandidates = candidates?.corners ?? [];
            const candidateY = this._groundY + 0.055;
            const ringY = this._groundY + 0.022;

            if (!this._junctionCandidateRingGeo) {
                const laneWidth = Number(this._laneWidth) || 4.8;
                const outer = Math.max(1.2, laneWidth * 0.28);
                const inner = Math.max(0.75, outer * 0.72);
                const geo = new THREE.RingGeometry(inner, outer, 32);
                geo.rotateX(-Math.PI * 0.5);
                this._junctionCandidateRingGeo = geo;
            }
            const ringGeo = this._junctionCandidateRingGeo;

            const addCandidate = ({ candidateId, kind, world, roadId }) => {
                if (!candidateId || !world) return;
                if (roadId && !isRoadVisible(roadId)) return;
                const mat = kind === 'corner' ? this._materials.junctionCandidateCorner : this._materials.junctionCandidateEndpoint;
                const mesh = new THREE.Mesh(this._junctionCandidateGeo, mat);
                mesh.position.set(Number(world.x) || 0, candidateY, Number(world.z) || 0);
                mesh.userData = { type: 'junction_candidate', candidateId, candidateKind: kind };
                mesh.renderOrder = 55;
                mesh.frustumCulled = false;
                junctionToolGroup.add(mesh);
                this._junctionCandidateMeshes.push(mesh);

                if (ringGeo) {
                    const ring = new THREE.Mesh(ringGeo, this._materials.junctionCandidateRing);
                    ring.position.set(mesh.position.x, ringY, mesh.position.z);
                    ring.userData = { type: 'junction_candidate_ring', candidateId, candidateKind: kind };
                    ring.renderOrder = 54;
                    ring.frustumCulled = false;
                    junctionToolGroup.add(ring);
                }

                const pick = new THREE.Mesh(this._junctionCandidateGeo, this._materials.pickHidden);
                pick.position.copy(mesh.position);
                pick.scale.setScalar(2.1);
                pick.userData = { type: 'junction_candidate_pick', candidateId, candidateKind: kind };
                pick.renderOrder = 4;
                pickGroup.add(pick);
                this._junctionCandidatePickMeshes.push(pick);
            };

            for (const ep of endpointCandidates) {
                addCandidate({
                    candidateId: ep?.id ?? null,
                    kind: 'endpoint',
                    world: ep?.world ?? null,
                    roadId: ep?.roadId ?? null
                });
            }

            for (const corner of cornerCandidates) {
                addCandidate({
                    candidateId: corner?.id ?? null,
                    kind: 'corner',
                    world: corner?.world ?? null,
                    roadId: corner?.roadId ?? null
                });
            }
        }

        const markingPositions = [];
        const arrowPositions = [];
        const arrowTangentPositions = [];

        const segs = this._derived?.segments ?? [];
        for (const seg of segs) {
            if (!isRoadVisible(seg?.roadId)) continue;
            const dir = seg?.dir ?? null;
            const right = seg?.right ?? null;
            const laneWidth = Number(seg?.laneWidth) || Number(this._laneWidth) || 4.8;
            const lanesF = clampInt(seg?.lanesF ?? 0, 0, 99);
            const lanesB = clampInt(seg?.lanesB ?? 0, 0, 99);
            const pieces = Array.isArray(seg?.keptPieces) ? seg.keptPieces : [];
            if (dir && right && (laneWidth > 1e-6) && pieces.length) {
                const offsets = [0];
                for (let i = 1; i < lanesF; i++) offsets.push(i * laneWidth);
                for (let i = 1; i < lanesB; i++) offsets.push(-i * laneWidth);
                if (lanesF > 0) offsets.push(lanesF * laneWidth);
                if (lanesB > 0) offsets.push(-lanesB * laneWidth);

                for (const piece of pieces) {
                    const a = piece?.aWorld ?? null;
                    const b = piece?.bWorld ?? null;
                    if (!a || !b) continue;
                    const len = Number(piece?.length) || 0;
                    if (!(len > 1e-6)) continue;

                    const dash = laneWidth * 0.7;
                    const gap = laneWidth * 0.35;
                    const inset = Math.min(laneWidth * 0.3, len * 0.18);
                    const usable = Math.max(0, len - inset * 2);

                    for (const offset of offsets) {
                        if (!(usable > 1e-6)) continue;
                        const baseX = (Number(a.x) || 0) + (Number(dir.x) || 0) * inset + (Number(right.x) || 0) * offset;
                        const baseZ = (Number(a.z) || 0) + (Number(dir.z) || 0) * inset + (Number(right.z) || 0) * offset;
                        const step = dash + gap;
                        if (!(step > 1e-6)) continue;
                        for (let t = 0; t < usable - 1e-6; t += step) {
                            const t0 = t;
                            const t1 = Math.min(t + dash, usable);
                            const sx = baseX + (Number(dir.x) || 0) * t0;
                            const sz = baseZ + (Number(dir.z) || 0) * t0;
                            const ex = baseX + (Number(dir.x) || 0) * t1;
                            const ez = baseZ + (Number(dir.z) || 0) * t1;
                            markingPositions.push(sx, markingY, sz, ex, markingY, ez);
                        }
                    }

                    const baseArrowLen = laneWidth * 0.85;
                    const maxArrowLen = len * 0.65;
                    const arrowLen = Math.min(baseArrowLen, maxArrowLen);
                    if (arrowLen > laneWidth * 0.25) {
                        const scale = arrowLen / baseArrowLen;
                        const headLen = arrowLen * 0.35;
                        const bodyHalf = laneWidth * 0.10 * scale;
                        const headHalf = laneWidth * 0.22 * scale;
                        const tailX = -arrowLen * 0.5;
                        const bodyX = arrowLen * 0.5 - headLen;
                        const tipX = arrowLen * 0.5;

                        const midX = (Number(a.x) || 0) + (Number(dir.x) || 0) * (len * 0.5);
                        const midZ = (Number(a.z) || 0) + (Number(dir.z) || 0) * (len * 0.5);

                        const laneOffsets = [];
                        for (let i = 0; i < lanesF; i++) laneOffsets.push({ offset: (i + 0.5) * laneWidth, dirX: dir.x, dirZ: dir.z });
                        for (let i = 0; i < lanesB; i++) laneOffsets.push({ offset: -(i + 0.5) * laneWidth, dirX: -dir.x, dirZ: -dir.z });

                        for (const lane of laneOffsets) {
                            const cx = midX + (Number(right.x) || 0) * lane.offset;
                            const cz = midZ + (Number(right.z) || 0) * lane.offset;
                            const fx = Number(lane.dirX) || 0;
                            const fz = Number(lane.dirZ) || 0;
                            const rx = fz;
                            const rz = -fx;

                            if (this._arrowTangentDebugEnabled) {
                                const tangentLen = arrowLen * 0.75;
                                const y = arrowY + 0.003;
                                arrowTangentPositions.push(
                                    cx, y, cz,
                                    cx + fx * tangentLen, y, cz + fz * tangentLen
                                );
                            }

                            const local = [
                                [tailX, bodyHalf], [bodyX, bodyHalf], [bodyX, -bodyHalf],
                                [tailX, bodyHalf], [bodyX, -bodyHalf], [tailX, -bodyHalf],
                                [tipX, 0], [bodyX, headHalf], [bodyX, -headHalf]
                            ];

                            for (const v of local) {
                                const lx = v[0];
                                const lz = v[1];
                                const wx = cx + fx * lx + rx * lz;
                                const wz = cz + fz * lx + rz * lz;
                                arrowPositions.push(wx, arrowY, wz);
                            }
                        }
                    }
                }
            }
        }

        if (markingPositions.length) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(markingPositions, 3));
            geo.computeBoundingSphere();
            const lines = new THREE.LineSegments(geo, this._materials.markingLine);
            lines.userData = { type: 'lane_markings' };
            lines.renderOrder = 1;
            markingsGroup.add(lines);
            this._markingLines.push(lines);
        }

        if (arrowPositions.length) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(arrowPositions, 3));
            geo.computeBoundingSphere();
            const mesh = new THREE.Mesh(geo, this._materials.arrow);
            mesh.userData = { type: 'lane_arrows' };
            mesh.renderOrder = 2;
            markingsGroup.add(mesh);
            this._arrowMeshes.push(mesh);
        }

        if (arrowTangentPositions.length) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(arrowTangentPositions, 3));
            geo.computeBoundingSphere();
            const lines = new THREE.LineSegments(geo, this._materials.arrowTangent);
            lines.userData = { type: 'arrow_tangents' };
            lines.renderOrder = 3;
            markingsGroup.add(lines);
            this._arrowTangentLines.push(lines);
        }

        this._applyDistanceScaledEdgeLineWidths();
        this._rebuildSelectionHighlight();
    }

    _disposeResources() {
        for (const mat of this._materials.lineBase.values()) mat?.dispose?.();
        for (const mat of this._materials.lineHover.values()) mat?.dispose?.();
        for (const mat of this._materials.lineSelected.values()) mat?.dispose?.();
        for (const mat of this._materials.pointBase.values()) mat?.dispose?.();
        for (const mat of Object.values(this._materials)) {
            if (!mat || typeof mat === 'function' || mat instanceof Map) continue;
            mat?.dispose?.();
        }
        this._materials.lineBase.clear();
        this._materials.lineHover.clear();
        this._materials.lineSelected.clear();
        this._materials.pointBase.clear();
        this._sphereGeo?.dispose?.();
        this._junctionCandidateGeo?.dispose?.();
        this._junctionCandidateGeo = null;
        this._junctionCandidateRingGeo?.dispose?.();
        this._junctionCandidateRingGeo = null;
        this._snapHighlightGeo?.dispose?.();
        this._snapHighlightGeo = null;
        this._snapHighlightMesh = null;
        this._hoverCubeGeo?.dispose?.();
        this._hoverCubeGeo = null;
        this._hoverCubeMesh = null;
        this._draftPreviewGeo?.dispose?.();
        this._draftPreviewGeo = null;
        this._draftPreviewLine = null;
        this._draftFirstTileMarkerGeo?.dispose?.();
        this._draftFirstTileMarkerGeo = null;
        this._draftFirstTileMarkerMesh = null;
        this._draftHoverTileMarkerGeo?.dispose?.();
        this._draftHoverTileMarkerGeo = null;
        this._draftHoverTileMarkerMesh = null;
        this._approachMarkerGeo?.dispose?.();
        this._approachMarkerGeo = null;
        this._approachMarkerMesh = null;
    }

    _rebuildSelectionHighlight() {
        if (!this._highlightGroup) return;
        for (const child of this._highlightGroup.children ?? []) child?.geometry?.dispose?.();
        this._highlightGroup.clear();
        if (!this._trimDebug.highlight) return;

        const sel = this._selection ?? {};
        const derived = this._derived ?? null;
        if (!sel?.type || !derived) return;

        const lineY = this._groundY + 0.045;

        const addLoop = (pts, color = null) => {
            const points = Array.isArray(pts) ? pts : [];
            if (points.length < 3) return;
            const positions = new Float32Array((points.length + 1) * 3);
            for (let i = 0; i <= points.length; i++) {
                const p = points[i % points.length];
                const j = i * 3;
                positions[j] = Number(p.x) || 0;
                positions[j + 1] = lineY;
                positions[j + 2] = Number(p.z) || 0;
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geo.computeBoundingSphere();
            const mat = color ?? this._materials.highlightObb;
            const line = new THREE.Line(geo, mat);
            line.frustumCulled = false;
            this._highlightGroup.add(line);
        };

        if (sel.type === 'segment' || sel.type === 'piece') {
            const seg = derived.segments?.find?.((s) => s?.id === sel.segmentId) ?? null;
            if (!seg) return;
            const corners = seg.asphaltObb?.corners ?? null;
            if (Array.isArray(corners) && corners.length === 4) addLoop(corners, this._materials.highlightObb);

            const aabb = seg.asphaltObb?.aabb ?? null;
            if (aabb) {
                addLoop([
                    { x: aabb.minX, z: aabb.minZ },
                    { x: aabb.maxX, z: aabb.minZ },
                    { x: aabb.maxX, z: aabb.maxZ },
                    { x: aabb.minX, z: aabb.maxZ }
                ], this._materials.highlightAabb);
            }

            if (sel.type === 'piece') {
                const piece = seg.keptPieces?.find?.((p) => p?.id === sel.pieceId) ?? null;
                if (piece?.corners) addLoop(piece.corners, this._materials.highlightPiece);
            }
        }
    }

    _applyHighlights() {
        this._syncLineMaterialResolution();
        const derived = this._derived ?? null;
        const sel = this._selection ?? {};
        const hover = this._hover ?? {};

        const hoverRoadId = hover.roadId ?? null;
        const hoverSegmentId = hover.segmentId ?? null;
        const hoverPointId = hover.pointId ?? null;
        const hoverJunctionId = hover.junctionId ?? null;
        const hoverConnectorId = hover.connectorId ?? null;
        const hoverApproachId = hover.approachId ?? null;
        const hoverJunctionHighlightId = (!hoverConnectorId && !hoverApproachId) ? hoverJunctionId : null;

        const selRoadId = sel.type ? (sel.roadId ?? null) : null;
        const selSegmentId = (sel.type === 'segment' || sel.type === 'piece') ? (sel.segmentId ?? null) : null;
        const selPointId = sel.type === 'point' ? (sel.pointId ?? null) : null;
        const selJunctionId = sel.type === 'junction' ? (sel.junctionId ?? null) : null;
        const selConnectorId = sel.type === 'connector' ? (sel.connectorId ?? null) : null;
        const selApproachId = sel.type === 'approach' ? (sel.approachId ?? null) : null;

        const extraSelectedRoadIds = new Set();
        const extraSelectedSegmentIds = new Set();
        if (sel.type === 'junction' && selJunctionId) {
            const junction = derived?.junctions?.find?.((j) => j?.id === selJunctionId) ?? null;
            for (const rid of junction?.roadIds ?? []) extraSelectedRoadIds.add(rid);
            for (const sid of junction?.segmentIds ?? []) extraSelectedSegmentIds.add(sid);
        }

        const extraHoverRoadIds = new Set();
        const extraHoverSegmentIds = new Set();
        if (hoverJunctionHighlightId) {
            const junction = derived?.junctions?.find?.((j) => j?.id === hoverJunctionHighlightId) ?? null;
            for (const rid of junction?.roadIds ?? []) extraHoverRoadIds.add(rid);
            for (const sid of junction?.segmentIds ?? []) extraHoverSegmentIds.add(sid);
        }

        for (const line of this._overlayLines) {
            const roadId = line?.userData?.roadId ?? null;
            const segmentId = line?.userData?.segmentId ?? null;
            const junctionId = line?.userData?.junctionId ?? null;
            const connectorId = line?.userData?.connectorId ?? null;
            const kind = line?.userData?.kind ?? 'unknown';
            const selected =
                (!!selSegmentId && segmentId === selSegmentId)
                || (!!selRoadId && roadId === selRoadId)
                || (!!selJunctionId && junctionId === selJunctionId)
                || (!!selConnectorId && connectorId === selConnectorId)
                || (!!segmentId && extraSelectedSegmentIds.has(segmentId))
                || (!!roadId && extraSelectedRoadIds.has(roadId));
            const hovered = !selected && (
                (!!hoverSegmentId && segmentId === hoverSegmentId)
                || (!hoverSegmentId && !!hoverRoadId && !hoverPointId && roadId === hoverRoadId)
                || (!!hoverJunctionHighlightId && junctionId === hoverJunctionHighlightId)
                || (!!hoverConnectorId && connectorId === hoverConnectorId)
                || (!!segmentId && extraHoverSegmentIds.has(segmentId))
                || (!!roadId && extraHoverRoadIds.has(roadId))
            );
            const baseMat = ensureMapEntry(this._materials.lineBase, kind, () => {
                const mat = new LineMaterial({
                    color: baseColorForKind(kind),
                    linewidth: baseLineWidthForKind(kind),
                    worldUnits: false,
                    transparent: true,
                    opacity: baseLineOpacityForKind(kind),
                    depthTest: false,
                    depthWrite: false
                });
                mat.resolution.set(this._lineMaterialResolution.x, this._lineMaterialResolution.y);
                return mat;
            });
            const hoverMat = ensureMapEntry(this._materials.lineHover, kind, () => {
                const mat = new LineMaterial({
                    color: 0x34c759,
                    linewidth: baseLineWidthForKind(kind),
                    worldUnits: false,
                    transparent: true,
                    opacity: 0.95,
                    depthTest: false,
                    depthWrite: false
                });
                mat.resolution.set(this._lineMaterialResolution.x, this._lineMaterialResolution.y);
                return mat;
            });
            const selectedMat = ensureMapEntry(this._materials.lineSelected, kind, () => {
                const mat = new LineMaterial({
                    color: 0x3b82f6,
                    linewidth: baseLineWidthForKind(kind),
                    worldUnits: false,
                    transparent: true,
                    opacity: 0.98,
                    depthTest: false,
                    depthWrite: false
                });
                mat.resolution.set(this._lineMaterialResolution.x, this._lineMaterialResolution.y);
                return mat;
            });

            line.material = selected ? selectedMat : (hovered ? hoverMat : baseMat);
            line.visible = true;
        }

        this._applyDistanceScaledEdgeLineWidths();

        for (const pts of this._overlayPoints) {
            const roadId = pts?.userData?.roadId ?? null;
            const segmentId = pts?.userData?.segmentId ?? null;
            const junctionId = pts?.userData?.junctionId ?? null;
            const kind = pts?.userData?.kind ?? 'markers';
            const selected =
                (!!selSegmentId && segmentId === selSegmentId)
                || (!!selRoadId && roadId === selRoadId)
                || (!!selJunctionId && junctionId === selJunctionId)
                || (!!segmentId && extraSelectedSegmentIds.has(segmentId))
                || (!!roadId && extraSelectedRoadIds.has(roadId));
            const hovered = !selected && (
                (!!hoverSegmentId && segmentId === hoverSegmentId)
                || (!hoverSegmentId && !!hoverRoadId && !hoverPointId && roadId === hoverRoadId)
                || (!!hoverJunctionHighlightId && junctionId === hoverJunctionHighlightId)
                || (!!segmentId && extraHoverSegmentIds.has(segmentId))
                || (!!roadId && extraHoverRoadIds.has(roadId))
            );
            const baseMat = ensureMapEntry(this._materials.pointBase, kind, () => new THREE.PointsMaterial({
                color: baseColorForKind(kind.replace(/_markers$/, '')),
                size: kind === 'junction_endpoints' ? 7 : 5,
                sizeAttenuation: false,
                transparent: true,
                opacity: 0.85,
                depthTest: false,
                depthWrite: false
            }));
            pts.material = selected ? this._materials.selectedPoint : (hovered ? this._materials.hoverPoint : baseMat);
            pts.visible = true;
        }

        for (const mesh of this._controlPointMeshes) {
            const roadId = mesh?.userData?.roadId ?? null;
            const pointId = mesh?.userData?.pointId ?? null;
            const selected = !!selPointId && pointId === selPointId;
            const hovered = !selected && !!hoverPointId && pointId === hoverPointId;
            const isDraft = this._draft?.id === roadId;
            const base = isDraft ? this._materials.controlPointDraft : this._materials.controlPoint;
            mesh.material = selected ? this._materials.controlPointSelected : (hovered ? this._materials.controlPointHover : base);
            mesh.visible = true;
        }

        for (const mesh of this._segmentPickMeshes) {
            const roadId = mesh?.userData?.roadId ?? null;
            const segmentId = mesh?.userData?.segmentId ?? null;
            const selected =
                (!!selSegmentId && segmentId === selSegmentId)
                || (!!selRoadId && roadId === selRoadId)
                || (!!segmentId && extraSelectedSegmentIds.has(segmentId))
                || (!!roadId && extraSelectedRoadIds.has(roadId));
            const hovered = !selected && (
                (!!hoverSegmentId && segmentId === hoverSegmentId)
                || (!hoverSegmentId && !!hoverRoadId && !hoverPointId && roadId === hoverRoadId)
                || (!!segmentId && extraHoverSegmentIds.has(segmentId))
                || (!!roadId && extraHoverRoadIds.has(roadId))
            );
            mesh.material = selected ? this._materials.pickSelected : (hovered ? this._materials.pickHover : this._materials.pickHidden);
            mesh.visible = true;
        }

        for (const mesh of this._junctionPickMeshes) {
            const junctionId = mesh?.userData?.junctionId ?? null;
            const selected = !!selJunctionId && junctionId === selJunctionId;
            const hovered = !selected && !!hoverJunctionHighlightId && junctionId === hoverJunctionHighlightId;
            mesh.material = selected ? this._materials.pickSelected : (hovered ? this._materials.pickHover : this._materials.pickHidden);
            mesh.visible = true;
        }

        for (const mesh of this._connectorPickMeshes) {
            const connectorId = mesh?.userData?.connectorId ?? null;
            const selected = !!selConnectorId && connectorId === selConnectorId;
            const hovered = !selected && !!hoverConnectorId && connectorId === hoverConnectorId;
            mesh.material = selected ? this._materials.pickSelected : (hovered ? this._materials.pickHover : this._materials.pickHidden);
            mesh.visible = true;
        }

        if (this._junctionToolEnabled) {
            const hoverCandidateId = this._junctionToolHoverCandidateId ?? null;
            const selectedCandidates = this._junctionToolSelectedCandidateIds ?? new Set();

            for (const mesh of this._junctionCandidatePickMeshes) {
                const candidateId = mesh?.userData?.candidateId ?? null;
                const selected = candidateId && selectedCandidates.has(candidateId);
                const hovered = !selected && candidateId && candidateId === hoverCandidateId;
                mesh.material = selected ? this._materials.pickSelected : (hovered ? this._materials.pickHover : this._materials.pickHidden);
                mesh.visible = true;
            }

            for (const mesh of this._junctionCandidateMeshes) {
                const candidateId = mesh?.userData?.candidateId ?? null;
                const kind = mesh?.userData?.candidateKind ?? 'endpoint';
                const selected = candidateId && selectedCandidates.has(candidateId);
                const hovered = !selected && candidateId && candidateId === hoverCandidateId;
                const base = kind === 'corner' ? this._materials.junctionCandidateCorner : this._materials.junctionCandidateEndpoint;
                mesh.material = selected ? this._materials.junctionCandidateSelected : (hovered ? this._materials.junctionCandidateHover : base);
                const scale = selected ? 1.25 : (hovered ? 1.15 : 1);
                mesh.scale.setScalar(scale);
                mesh.visible = true;
            }
        }

        this._rebuildSelectionHighlight();
        this._syncApproachMarker();
        this._syncHoverCube();
    }
}
