// src/graphics/gui/road_debugger/RoadDebuggerView.js
// Orchestrates the Road Debugger scene (authoring, debug rendering, camera controls, UI).
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createCityConfig } from '../../../app/city/CityConfig.js';
import { sampleArcXZ } from '../../../app/geometry/RoadEdgeFillet.js';
import { computeRoadEngineEdges } from '../../../app/road_engine/RoadEngineCompute.js';
import { buildRoadEnginePolygonMeshData, triangulateSimplePolygonXZ } from '../../../app/road_engine/RoadEngineMeshData.js';
import { getDefaultRoadDecorationPipeline } from '../../../app/road_decoration/RoadDecorationPipeline.js';
import { buildRoadCurbMeshDataFromRoadEnginePrimitives } from '../../../app/road_decoration/curbs/RoadCurbBuilder.js';
import { buildRoadMarkingsMeshDataFromRoadEngineDerived } from '../../../app/road_decoration/markings/RoadMarkingsBuilder.js';
import { buildRoadSidewalkMeshDataFromRoadEnginePrimitives } from '../../../app/road_decoration/sidewalks/RoadSidewalkBuilder.js';
import { clampRoadDebuggerTileOffsetForMap, normalizeRoadDebuggerTileOffsetForMap } from '../../../app/road_debugger/RoadDebuggerTileOffset.js';
import { validateRoadDebuggerIssues } from '../../../app/road_debugger/RoadDebuggerValidation.js';
import { setupScene, disposeScene } from './RoadDebuggerScene.js';
import { attachEvents, detachEvents, handleKeyDown, handleKeyUp, handlePointerDown, handlePointerMove, handlePointerUp, setupCamera, updateCamera } from './RoadDebuggerInput.js';
import { setupUI, destroyUI } from './RoadDebuggerUI.js';
import { RoadDebuggerPicking } from './RoadDebuggerPicking.js';
import { createTrafficControlProps } from '../../visuals/city/TrafficControlProps.js';
import { createRoadMarkingsMeshesFromData } from '../../visuals/city/RoadMarkingsMeshes.js';
import { computeRoadTrafficControlPlacementsFromRoadEngineDerived, ROAD_TRAFFIC_CONTROL } from '../../../app/road_decoration/traffic_controls/RoadTrafficControlPlacement.js';

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
        case 'junction_tat_tangent': return 0x22d3ee;
        case 'junction_tat_arc': return 0xc084fc;
        case 'trim_removed_interval': return 0xf87171;
        default: return 0x94a3b8;
    }
}

function baseLineWidthForKind(kind) {
    switch (kind) {
        case 'asphalt_edge_left':
        case 'asphalt_edge_right': return 2;
        case 'centerline': return 3;
        case 'junction_connector': return 3;
        case 'junction_boundary': return 3;
        case 'junction_edge_order': return 3;
        case 'junction_tat_tangent':
        case 'junction_tat_arc': return 3;
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
        case 'junction_tat_tangent':
        case 'junction_tat_arc': return 0.92;
        default: return 0.82;
    }
}

function baseLineRenderOrderForKind(kind) {
    switch (kind) {
        case 'junction_tat_build_tangent': return 37;
        case 'junction_tat_tangent':
        case 'junction_tat_arc': return 36;
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

const tmpProjectVec = new THREE.Vector3();

export class RoadDebuggerView {
    constructor(engine, { uiEnabled = true } = {}) {
        this.engine = engine;
        this.canvas = engine.canvas;
        this.scene = engine.scene;
        this.camera = engine.camera;

        this._cameraRestore = null;

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
            centerline: false,
            directionCenterlines: false,
            edges: false,
            points: true,
            asphalt: true,
            markings: true
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
        this._autoJunctionEnabled = true;
        this._junctionThresholdFactor = 1.5;
        this._junctionFilletRadiusFactor = 1;
        this._junctionDebug = {
            endpoints: false,
            boundary: false,
            connectors: false,
            tat: false,
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
        this._trafficControlMarkerMesh = null;
        this._trafficControlMarkerGeo = null;

        this._hoverTatGroup = null;
        this._hoverTatOverlayKey = '';

        this._roads = [];
        this._draft = null;
        this._roadCounter = 1;
        this._pointCounter = 1;

        this._undoStack = [];
        this._redoStack = [];
        this._undoMax = 64;

        this._hover = { roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null, tatId: null, tatType: null };
        this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        this._issues = [];
        this._issuesById = new Map();
        this._hoverIssueId = null;
        this._selectedIssueId = null;
        this._derived = null;
        this._decorationPipeline = getDefaultRoadDecorationPipeline();

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

        this.controls = null;
        this._cameraDragPointerId = null;
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
        this._curbsGroup = null;
        this._sidewalksGroup = null;
        this._stopSignsGroup = null;
        this._trafficLightsGroup = null;
        this._markingsGroup = null;
        this._debugGroup = null;
        this._highlightGroup = null;
        this._hoverTatGroup = null;
        this._hoverTatOverlayKey = '';
        this._overlayLines = [];
        this._overlayPoints = [];
        this._asphaltMeshes = [];
        this._junctionSurfaceMeshes = [];
        this._curbMeshes = [];
        this._sidewalkMeshes = [];
        this._markingLines = [];
        this._arrowMeshes = [];
        this._arrowTangentLines = [];
        this._crosswalkMeshes = [];
        this._controlPointMeshes = [];
        this._segmentPickMeshes = [];
        this._junctionPickMeshes = [];
        this._connectorPickMeshes = [];
        this._junctionTatPickMeshes = [];
        this._junctionCandidateMeshes = [];
        this._junctionCandidatePickMeshes = [];
        this._meshWireframeEnabled = false;
        this._worldLayers = null;
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
            controlPointConnection: new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }),
            hoverCube: new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }),
            draftPreviewLine: new THREE.LineBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }),
            snapHighlight: new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.34, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            draftFirstTileMarker: new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            draftHoverTileMarker: new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            asphaltBase: new THREE.MeshBasicMaterial({ color: 0x111827, transparent: false, opacity: 1.0, depthTest: true, depthWrite: true, side: THREE.DoubleSide }),
            curbBase: new THREE.MeshStandardMaterial({ color: 0x6f6f6f, roughness: 1.0, metalness: 0.0, transparent: false, opacity: 1.0, depthTest: true, depthWrite: true, side: THREE.DoubleSide }),
            sidewalkBase: new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 1.0, metalness: 0.0, transparent: false, opacity: 1.0, depthTest: true, depthWrite: true, side: THREE.DoubleSide }),
            markingLine: new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: false, opacity: 1.0, depthTest: true, depthWrite: true }),
            arrow: new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: false, opacity: 1.0, depthTest: true, depthWrite: true, side: THREE.DoubleSide }),
            markingYellow: new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: false, opacity: 1.0, depthTest: true, depthWrite: true, side: THREE.DoubleSide }),
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
        this._onKeyDown = (e) => handleKeyDown(this, e);
        this._onKeyUp = (e) => handleKeyUp(this, e);

        this._picking = new RoadDebuggerPicking(this);
    }

    enter() {
        if (this.root) return;
        if (!this._cameraRestore && this.camera?.isPerspectiveCamera) {
            this._cameraRestore = { near: this.camera.near, far: this.camera.far };
        }
        setupCamera(this);
        setupScene(this);
        this._ensureSnapHighlight();
        if (this._uiEnabled) setupUI(this);
        this.controls?.setUiRoot?.(this.ui?.root ?? null);
        attachEvents(this);
        this.setGridEnabled(this._gridEnabled);
        this._rebuildPipeline();
    }

    exit() {
        handlePointerUp(this, null);
        detachEvents(this);
        this.controls?.dispose?.();
        this.controls = null;
        destroyUI(this);
        this._setSnapHighlightVisible(false);
        this._setDraftPreviewVisible(false);
        this._setDraftHoverTileMarkerVisible(false);
        this._clearOverlays();
        disposeScene(this);
        this._disposeResources();
        if (this._cameraRestore && this.camera?.isPerspectiveCamera) {
            this.camera.near = this._cameraRestore.near;
            this.camera.far = this._cameraRestore.far;
            this.camera.updateProjectionMatrix?.();
        }
        this._cameraRestore = null;
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
        if (markings !== null) {
            const next = !!markings;
            this._renderOptions.markings = next;
            const step = (this._decorationPipeline ?? []).find((candidate) => candidate?.id === 'markings') ?? null;
            if (step) step.enabled = next;
        }
        this._rebuildPipeline();
    }

    getDecorationPipeline() {
        const steps = Array.isArray(this._decorationPipeline) ? this._decorationPipeline : [];
        return steps.map((step) => ({ ...step }));
    }

    toggleDecorationPipelineStep(stepId) {
        const id = typeof stepId === 'string' ? stepId.trim() : '';
        if (!id) return false;
        const steps = Array.isArray(this._decorationPipeline) ? this._decorationPipeline : [];
        const step = steps.find((candidate) => candidate?.id === id) ?? null;
        if (!step) return false;
        step.enabled = !(step.enabled === true);
        if (id === 'markings') this._renderOptions.markings = step.enabled === true;
        this._rebuildOverlaysFromDerived();
        this._applyHighlights();
        this.ui?.sync?.();
        return true;
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

    _controlPointScale() {
        const zoomMin = Number.isFinite(this._zoomMin) ? this._zoomMin : 0;
        const zoomMax = Number.isFinite(this._zoomMax) ? this._zoomMax : zoomMin;
        if (!(zoomMax > zoomMin + 1e-6)) return 1;
        const zoom = clamp(Number(this._zoom) || zoomMin, zoomMin, zoomMax);
        const t = clamp((zoom - zoomMin) / (zoomMax - zoomMin), 0, 1);
        const minScale = 1;
        const maxScale = 2.4;
        const curved = Math.pow(t, 1.25);
        return minScale + curved * (maxScale - minScale);
    }

    _applyControlPointBaseScales() {
        const scale = this._controlPointScale();
        for (const mesh of this._controlPointMeshes ?? []) {
            mesh?.scale?.setScalar?.(scale);
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

    setMeshWireframeEnabled(enabled) {
        const next = !!enabled;
        if (this._meshWireframeEnabled === next) return;
        this._meshWireframeEnabled = next;
        this._applyMeshWireframeToOverlays();
        this.ui?.sync?.();
    }

    getMeshWireframeEnabled() {
        return this._meshWireframeEnabled === true;
    }

    setTrimThresholdFactor(value) {
        const next = clamp(value, 0, 5);
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

    _applyMeshWireframeToOverlays() {
        const enabled = this._meshWireframeEnabled === true;
        const applyMaterial = (material) => {
            if (!material) return;
            if (Array.isArray(material)) {
                for (const m of material) {
                    if (!m) continue;
                    if ('wireframe' in m) m.wireframe = enabled;
                }
                return;
            }
            if ('wireframe' in material) material.wireframe = enabled;
        };

        applyMaterial(this._materials.asphaltBase);
        applyMaterial(this._materials.curbBase);
        applyMaterial(this._materials.sidewalkBase);
        applyMaterial(this._materials.arrow);
        applyMaterial(this._materials.markingYellow);

        const applyGroup = (group) => {
            group?.traverse?.((child) => {
                if (!child?.isMesh) return;
                applyMaterial(child.material);
            });
        };

        applyGroup(this._asphaltGroup);
        applyGroup(this._curbsGroup);
        applyGroup(this._sidewalksGroup);
        applyGroup(this._stopSignsGroup);
        applyGroup(this._trafficLightsGroup);
        applyGroup(this._markingsGroup);
    }

    _applyOpaqueMaterialsToWorld() {
        const applyMaterial = (material) => {
            if (!material) return;
            if (Array.isArray(material)) {
                for (const entry of material) applyMaterial(entry);
                return;
            }
            if ('transparent' in material) material.transparent = false;
            if ('opacity' in material) material.opacity = 1.0;
            if ('depthTest' in material) material.depthTest = true;
            if ('depthWrite' in material) material.depthWrite = true;
        };

        const applyGroup = (group) => {
            group?.traverse?.((child) => {
                if (!child?.isMesh) return;
                applyMaterial(child.material);
            });
        };

        applyGroup(this._asphaltGroup);
        applyGroup(this._curbsGroup);
        applyGroup(this._sidewalksGroup);
        applyGroup(this._stopSignsGroup);
        applyGroup(this._trafficLightsGroup);
        applyGroup(this._markingsGroup);
    }

    setJunctionEnabled(enabled) {
        const next = enabled !== false;
        if (this._junctionEnabled === next) return;
        this._junctionEnabled = next;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    getJunctionEnabled() {
        return this._junctionEnabled !== false;
    }

    setAutoJunctionEnabled(enabled) {
        const next = enabled === true;
        if (this._autoJunctionEnabled === next) return;
        this._autoJunctionEnabled = next;
        this._rebuildPipeline();
    }

    getAutoJunctionEnabled() {
        return this._autoJunctionEnabled === true;
    }

    setJunctionFilletRadiusFactor(value) {
        const next = clamp(value, 0, 1);
        if (Math.abs((this._junctionFilletRadiusFactor ?? 1) - next) < 1e-9) return;
        this._junctionFilletRadiusFactor = next;
        this._rebuildPipeline();
    }

    getJunctionFilletRadiusFactor() {
        return this._junctionFilletRadiusFactor ?? 1;
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
        const keys = ['endpoints', 'boundary', 'connectors', 'tat', 'rejected', 'edgeOrder'];
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

    startRoadDraft({ lanesF = 1, lanesB = 1 } = {}) {
        if (this._draft) return;
        this.closeExitConfirm?.();
        this.clearDraftPreview?.();
        this._pushUndoSnapshot();
        const id = `road_${this._roadCounter++}`;
        const nextLanesF = clampInt(lanesF, 1, 5);
        const nextLanesB = clampInt(lanesB, 0, 5);
        this._draft = { id, name: `Road ${this._roadCounter - 1}`, lanesF: nextLanesF, lanesB: nextLanesB, visible: true, points: [] };
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

    addDraftPointByTile(tileX, tileY, { offsetU = 0, offsetV = 0 } = {}) {
        const draft = this._draft;
        if (!draft) return false;

        const norm = clampRoadDebuggerTileOffsetForMap(
            { tileX, tileY, offsetU, offsetV },
            { tileSize: this._tileSize, mapWidth: this._mapWidth, mapHeight: this._mapHeight }
        );
        const tx = norm.tileX;
        const ty = norm.tileY;
        const ou = norm.offsetU;
        const ov = norm.offsetV;
        const last = draft.points[draft.points.length - 1] ?? null;
        if (last && last.tileX === tx && last.tileY === ty && Number(last.offsetU) === Number(ou) && Number(last.offsetV) === Number(ov)) return false;

        this._pushUndoSnapshot();
        const pointId = `pt_${this._pointCounter++}`;
        draft.points.push({
            id: pointId,
            tileX: tx,
            tileY: ty,
            offsetU: Number(ou) || 0,
            offsetV: Number(ov) || 0,
            tangentFactor: 1
        });

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
        return this.addDraftPointByTile(res.tileX, res.tileY, { offsetU: 0, offsetV: 0 });
    }

    setHoverRoad(roadId) {
        this._hoverIssueId = null;
        const nextRoadId = roadId ?? null;
        if (this._hover.roadId === nextRoadId && !this._hover.segmentId && !this._hover.pointId && !this._hover.pieceId && !this._hover.junctionId && !this._hover.connectorId && !this._hover.approachId && !this._hover.tatId) return;
        this._hover.roadId = nextRoadId;
        this._hover.segmentId = null;
        this._hover.pointId = null;
        this._hover.pieceId = null;
        this._hover.junctionId = null;
        this._hover.connectorId = null;
        this._hover.approachId = null;
        this._hover.tatId = null;
        this._hover.tatType = null;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    setHoverSegment(segmentId) {
        this._hoverIssueId = null;
        const seg = this._derived?.segments?.find?.((s) => s?.id === segmentId) ?? null;
        const nextSegId = seg?.id ?? null;
        const nextRoadId = seg?.roadId ?? null;
        if (this._hover.segmentId === nextSegId && this._hover.roadId === nextRoadId && !this._hover.pointId && !this._hover.pieceId && !this._hover.junctionId && !this._hover.connectorId && !this._hover.approachId && !this._hover.tatId) return;
        this._hover.segmentId = nextSegId;
        this._hover.roadId = nextRoadId;
        this._hover.pointId = null;
        this._hover.pieceId = null;
        this._hover.junctionId = null;
        this._hover.connectorId = null;
        this._hover.approachId = null;
        this._hover.tatId = null;
        this._hover.tatType = null;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    setHoverPoint(roadId, pointId) {
        this._hoverIssueId = null;
        const nextRoadId = roadId ?? null;
        const nextPointId = pointId ?? null;
        if (this._hover.roadId === nextRoadId && this._hover.pointId === nextPointId && !this._hover.segmentId && !this._hover.pieceId && !this._hover.junctionId && !this._hover.connectorId && !this._hover.approachId && !this._hover.tatId) return;
        this._hover.roadId = nextRoadId;
        this._hover.segmentId = null;
        this._hover.pointId = nextPointId;
        this._hover.pieceId = null;
        this._hover.junctionId = null;
        this._hover.connectorId = null;
        this._hover.approachId = null;
        this._hover.tatId = null;
        this._hover.tatType = null;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    setHoverJunction(junctionId) {
        this._hoverIssueId = null;
        const nextJunctionId = junctionId ?? null;
        if (this._hover.junctionId === nextJunctionId && !this._hover.roadId && !this._hover.segmentId && !this._hover.pointId && !this._hover.pieceId && !this._hover.connectorId && !this._hover.approachId && !this._hover.tatId) return;
        this._hover.roadId = null;
        this._hover.segmentId = null;
        this._hover.pointId = null;
        this._hover.pieceId = null;
        this._hover.junctionId = nextJunctionId;
        this._hover.connectorId = null;
        this._hover.approachId = null;
        this._hover.tatId = null;
        this._hover.tatType = null;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    setHoverJunctionTat(junctionId, tatId, tatType = null) {
        this._hoverIssueId = null;
        const nextJunctionId = junctionId ?? null;
        const nextTatId = tatId ?? null;
        const nextTatType = tatType ?? null;
        if (!nextJunctionId || !nextTatId) {
            this.clearHover();
            return;
        }
        if (this._hover.junctionId === nextJunctionId && this._hover.tatId === nextTatId && this._hover.tatType === nextTatType) return;
        this._hover.roadId = null;
        this._hover.segmentId = null;
        this._hover.pointId = null;
        this._hover.pieceId = null;
        this._hover.junctionId = nextJunctionId;
        this._hover.connectorId = null;
        this._hover.approachId = null;
        this._hover.tatId = nextTatId;
        this._hover.tatType = nextTatType;
        this._syncHoverTatOverlay();
        this._applyHighlights();
        this.ui?.sync?.();
    }

    setHoverConnector(connectorId) {
        this._hoverIssueId = null;
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
        if (this._hover.connectorId === nextConnectorId && this._hover.junctionId === junctionId && !this._hover.roadId && !this._hover.segmentId && !this._hover.pointId && !this._hover.pieceId && !this._hover.approachId && !this._hover.tatId) return;
        this._hover.roadId = null;
        this._hover.segmentId = null;
        this._hover.pointId = null;
        this._hover.pieceId = null;
        this._hover.junctionId = junctionId;
        this._hover.connectorId = nextConnectorId;
        this._hover.approachId = null;
        this._hover.tatId = null;
        this._hover.tatType = null;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    setHoverApproach(junctionId, approachId) {
        this._hoverIssueId = null;
        const nextJunctionId = junctionId ?? null;
        const nextApproachId = approachId ?? null;
        if (!nextJunctionId || !nextApproachId) {
            this.clearHover();
            return;
        }
        if (this._hover.approachId === nextApproachId && this._hover.junctionId === nextJunctionId && !this._hover.roadId && !this._hover.segmentId && !this._hover.pointId && !this._hover.pieceId && !this._hover.connectorId && !this._hover.tatId) return;
        this._hover.roadId = null;
        this._hover.segmentId = null;
        this._hover.pointId = null;
        this._hover.pieceId = null;
        this._hover.junctionId = nextJunctionId;
        this._hover.connectorId = null;
        this._hover.approachId = nextApproachId;
        this._hover.tatId = null;
        this._hover.tatType = null;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    clearHover() {
        this._hoverIssueId = null;
        if (!this._hover.roadId && !this._hover.segmentId && !this._hover.pointId && !this._hover.pieceId && !this._hover.junctionId && !this._hover.connectorId && !this._hover.approachId && !this._hover.tatId) return;
        this._hover.roadId = null;
        this._hover.segmentId = null;
        this._hover.pointId = null;
        this._hover.pieceId = null;
        this._hover.junctionId = null;
        this._hover.connectorId = null;
        this._hover.approachId = null;
        this._hover.tatId = null;
        this._hover.tatType = null;
        this._syncHoverTatOverlay();
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectRoad(roadId) {
        this._selectedIssueId = null;
        this._selection = { type: 'road', roadId, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectSegment(segmentId) {
        this._selectedIssueId = null;
        const seg = this._derived?.segments?.find?.((s) => s?.id === segmentId) ?? null;
        if (!seg) return;
        this._selection = { type: 'segment', roadId: seg.roadId, segmentId: seg.id, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectPoint(roadId, pointId) {
        this._selectedIssueId = null;
        this._selection = { type: 'point', roadId, segmentId: null, pointId, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectPiece(roadId, segmentId, pieceId) {
        this._selectedIssueId = null;
        this._selection = { type: 'piece', roadId, segmentId, pointId: null, pieceId, junctionId: null, connectorId: null, approachId: null };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectJunction(junctionId) {
        this._selectedIssueId = null;
        const nextJunctionId = junctionId ?? null;
        if (!nextJunctionId) return;
        this._selection = { type: 'junction', roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: nextJunctionId, connectorId: null, approachId: null };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectConnector(connectorId) {
        this._selectedIssueId = null;
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
        this._selectedIssueId = null;
        const nextJunctionId = junctionId ?? null;
        const nextApproachId = approachId ?? null;
        if (!nextJunctionId || !nextApproachId) return;
        this._selection = { type: 'approach', roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: nextJunctionId, connectorId: null, approachId: nextApproachId };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    clearSelection() {
        this._selectedIssueId = null;
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

        const res = this._worldToTilePoint(hit.x, hit.z, { snap: false });
        if (!res) {
            this._setDraftPreviewVisible(false);
            this._setDraftHoverTileMarkerVisible(false);
            return false;
        }

        const tileSize = Number(this._tileSize) || 24;
        const ox = Number(this._origin?.x) || 0;
        const oz = Number(this._origin?.z) || 0;
        const endX = Math.fround(ox + (Number(res.tileX) || 0) * tileSize);
        const endZ = Math.fround(oz + (Number(res.tileY) || 0) * tileSize);

        const showHover = true;
        if (showHover) {
            this._ensureDraftHoverTileMarker();
            const mesh = this._draftHoverTileMarkerMesh;
            if (mesh) {
                const markerY = this._worldLayers?.markerY ?? (this._groundY + 0.021);
                mesh.position.set(endX, markerY, endZ);
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
        const y = this._worldLayers?.lineY ?? (this._groundY + 0.041);

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

    getIssues() {
        return Array.isArray(this._issues) ? this._issues.slice() : [];
    }

    getIssueById(issueId) {
        const id = typeof issueId === 'string' && issueId.trim() ? issueId.trim() : null;
        if (!id) return null;
        return this._issuesById?.get?.(id) ?? null;
    }

    getHoverIssueId() {
        return this._hoverIssueId ?? null;
    }

    getSelectedIssueId() {
        return this._selectedIssueId ?? null;
    }

    setHoverIssue(issueId) {
        const id = typeof issueId === 'string' && issueId.trim() ? issueId.trim() : null;
        if (!id || !this._issuesById?.has?.(id)) {
            return this.clearHoverIssue();
        }
        if (this._hoverIssueId === id) return true;
        this._hoverIssueId = id;
        this._applyHighlights();
        this.ui?.sync?.();
        return true;
    }

    clearHoverIssue() {
        if (!this._hoverIssueId) return false;
        this._hoverIssueId = null;
        this._applyHighlights();
        this.ui?.sync?.();
        return true;
    }

    selectIssue(issueId) {
        const id = typeof issueId === 'string' && issueId.trim() ? issueId.trim() : null;
        if (!id) return false;
        const issue = this._issuesById?.get?.(id) ?? null;
        if (!issue) return false;
        this._selectedIssueId = id;
        const primary = issue?.primary ?? null;
        if (primary?.type === 'road' && primary.roadId) {
            this._selection = { type: 'road', roadId: primary.roadId, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        } else if (primary?.type === 'segment' && primary.segmentId) {
            const seg = this._derived?.segments?.find?.((s) => s?.id === primary.segmentId) ?? null;
            if (seg) this._selection = { type: 'segment', roadId: seg.roadId, segmentId: seg.id, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };
        } else if (primary?.type === 'junction' && primary.junctionId) {
            this._selection = { type: 'junction', roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: primary.junctionId, connectorId: null, approachId: null };
        }
        this._applyHighlights();
        this.ui?.sync?.();
        return true;
    }

    clearSelectedIssue() {
        if (!this._selectedIssueId) return false;
        this._selectedIssueId = null;
        this._applyHighlights();
        this.ui?.sync?.();
        return true;
    }

    createManualJunctionFromCandidateIds(candidateIds) {
        const ids = Array.isArray(candidateIds)
            ? candidateIds
            : candidateIds instanceof Set
                ? Array.from(candidateIds)
                : [];
        const safeIds = Array.from(new Set(ids.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()))).sort(compareString);
        if (!safeIds.length) return false;
        if (safeIds.length < 2) {
            const corners = this._derived?.junctionCandidates?.corners ?? [];
            const isCorner = corners.some((c) => c?.id === safeIds[0]);
            if (!isCorner) return false;
        }
        const id = stableHashId('junc_', safeIds.join('|'));
        if (this._authoredJunctions.some((j) => j?.id === id)) {
            this.selectJunction(id);
            return true;
        }
        this._pushUndoSnapshot();
        this._authoredJunctions.push({ id, candidateIds: safeIds });
        this._authoredJunctions.sort((a, b) => compareString(a?.id, b?.id));
        this._selection = { type: 'junction', roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: id, connectorId: null, approachId: null };
        this._rebuildPipeline();
        return true;
    }

    applyIssueFix(issueId, fixId) {
        const id = typeof issueId === 'string' && issueId.trim() ? issueId.trim() : null;
        const fid = typeof fixId === 'string' && fixId.trim() ? fixId.trim() : null;
        if (!id || !fid) return false;
        const issue = this._issuesById?.get?.(id) ?? null;
        if (!issue) return false;
        const fixes = Array.isArray(issue?.fixes) ? issue.fixes : [];
        const fix = fixes.find((f) => f?.fixId === fid) ?? null;
        const action = fix?.action ?? null;
        if (!action || typeof action !== 'object') return false;

        if (action.type === 'delete_junction') {
            this._selectedIssueId = null;
            this._hoverIssueId = null;
            return this.deleteJunction(action.junctionId);
        }

        if (action.type === 'create_manual_junction') {
            this._selectedIssueId = null;
            this._hoverIssueId = null;
            return this.createManualJunctionFromCandidateIds(action.candidateIds);
        }

        return false;
    }

    getCameraFocusTarget() {
        const y = Number.isFinite(this._groundY) ? this._groundY : 0;
        const derived = this._derived ?? null;
        const selection = this._selection ?? null;

        const points = [];
        const addXZ = (x, z) => {
            const xx = Number(x);
            const zz = Number(z);
            if (!Number.isFinite(xx) || !Number.isFinite(zz)) return;
            points.push({ x: xx, y, z: zz });
        };

        const addWorldXZ = (w) => {
            if (!w) return;
            addXZ(w.x, w.z);
        };

        if (selection?.type === 'point') {
            const found = this._findSchemaPoint(selection.roadId, selection.pointId);
            if (found?.point) {
                const w = this._schemaPointWorld(found.point);
                addXZ(w.x, w.z);
            }
        } else if (selection?.type === 'segment') {
            const segId = selection.segmentId ?? null;
            const seg = derived?.segments?.find?.((s) => s?.id === segId) ?? null;
            if (seg?.aWorld && seg?.bWorld) {
                addWorldXZ(seg.aWorld);
                addWorldXZ(seg.bWorld);
            }
        } else if (selection?.type === 'road') {
            const roadId = selection.roadId ?? null;
            const found = this._findSchemaRoad(roadId);
            const pts = found?.road?.points ?? [];
            for (const p of pts) {
                const w = this._schemaPointWorld(p);
                addXZ(w.x, w.z);
            }
        } else if (selection?.type === 'junction') {
            const id = selection.junctionId ?? null;
            const junction = derived?.junctions?.find?.((j) => j?.id === id) ?? null;
            const endpoints = junction?.endpoints ?? [];
            for (const ep of endpoints) addWorldXZ(ep?.world);
        }

        if (!points.length) {
            const draft = this._draft ?? null;
            const pts = draft?.points ?? [];
            for (const p of pts) {
                const w = this._schemaPointWorld(p);
                addXZ(w.x, w.z);
            }
        }

        if (!points.length) {
            const tileSize = Number(this._tileSize) || 24;
            const half = tileSize * 0.5;
            const ox = Number(this._origin?.x) || 0;
            const oz = Number(this._origin?.z) || 0;
            const maxX = Math.max(0, (this._mapWidth ?? 1) - 1);
            const maxY = Math.max(0, (this._mapHeight ?? 1) - 1);
            return {
                box: {
                    min: { x: ox - half, y, z: oz - half },
                    max: { x: ox + maxX * tileSize + half, y, z: oz + maxY * tileSize + half }
                }
            };
        }

        let minX = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxZ = -Infinity;
        for (const p of points) {
            if (p.x < minX) minX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.x > maxX) maxX = p.x;
            if (p.z > maxZ) maxZ = p.z;
        }

        const pad = Math.max(2, (Number(this._tileSize) || 24) * 0.4);
        return {
            box: {
                min: { x: minX - pad, y, z: minZ - pad },
                max: { x: maxX + pad, y, z: maxZ + pad }
            }
        };
    }

    _syncOrbitCamera() {
        const min = Number.isFinite(this._zoomMin) ? this._zoomMin : 0;
        const max = Number.isFinite(this._zoomMax) ? this._zoomMax : min;

        const orbit = this.controls?.getOrbit?.() ?? null;
        const radius = Number(orbit?.radius);
        const current = Number.isFinite(radius) ? radius : (Number(this._zoom) || min);
        this._zoom = clamp(current, min, max);

        this._applyDistanceScaledEdgeLineWidths();
        this._applyControlPointBaseScales();
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
            version: 2,
            tileSize: Number(this._tileSize) || 24,
            laneWidth: Number(this._laneWidth) || 4.8,
            marginFactor: Number.isFinite(this._marginFactor) ? Number(this._marginFactor) : 0.1,
            snapEnabled: this._snapEnabled !== false,
            autoJunctionEnabled: this._autoJunctionEnabled === true,
            roads: payload.roads,
            draft: payload.draft,
            mergedConnectorIds: Array.from(this._mergedConnectorIds ?? []).filter((id) => typeof id === 'string' && id.trim()).sort(),
            junctions,
            hiddenJunctionIds: Array.from(this._hiddenJunctionIds ?? []).filter((id) => typeof id === 'string' && id.trim()).sort(),
            suppressedAutoJunctionIds: Array.from(this._suppressedAutoJunctionIds ?? []).filter((id) => typeof id === 'string' && id.trim()).sort()
        };
        return JSON.stringify(schema, null, pretty ? 2 : 0);
    }

    importSchema(schema, { pushUndo = true, legacyTileSize = null } = {}) {
        const parsed = this._parseSchema(schema, { legacyTileSize });
        if (!parsed) return false;
        if (pushUndo) this._pushUndoSnapshot();

        this._roads = parsed.roads;
        this._draft = parsed.draft;
        this._laneWidth = parsed.laneWidth;
        this._marginFactor = parsed.marginFactor;
        this._snapEnabled = parsed.snapEnabled;
        this._autoJunctionEnabled = parsed.autoJunctionEnabled === true;
        this._mergedConnectorIds = new Set(parsed.mergedConnectorIds ?? []);
        this._authoredJunctions = parsed.junctions ?? [];
        this._hiddenJunctionIds = new Set(parsed.hiddenJunctionIds ?? []);
        this._suppressedAutoJunctionIds = new Set(parsed.suppressedAutoJunctionIds ?? []);
        this._junctionToolHoverCandidateId = null;
        this._junctionToolSelectedCandidateIds?.clear?.();
        this._hover = { roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null, tatId: null, tatType: null };
        this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null };

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
        const offsetU = Number(point?.offsetU) || 0;
        const offsetV = Number(point?.offsetV) || 0;
        return { x: ox + (tileX + offsetU) * tileSize, z: oz + (tileY + offsetV) * tileSize };
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
        const half = 0.5;
        const step = 0.1;
        const ox = Number(this._origin?.x) || 0;
        const oz = Number(this._origin?.z) || 0;
        const maxX = Math.max(0, (this._mapWidth ?? 1) - 1);
        const maxY = Math.max(0, (this._mapHeight ?? 1) - 1);

        let tileX = Math.round(((Number(worldX) || 0) - ox) / tileSize);
        let tileY = Math.round(((Number(worldZ) || 0) - oz) / tileSize);
        tileX = clampInt(tileX, 0, maxX);
        tileY = clampInt(tileY, 0, maxY);

        let offsetU = ((Number(worldX) || 0) - (ox + tileX * tileSize)) / tileSize;
        let offsetV = ((Number(worldZ) || 0) - (oz + tileY * tileSize)) / tileSize;
        offsetU = clamp(offsetU, -half, half);
        offsetV = clamp(offsetV, -half, half);

        if (snap) {
            const ix = clampInt(Math.round(offsetU / step), -5, 5);
            const iy = clampInt(Math.round(offsetV / step), -5, 5);
            offsetU = ix * step;
            offsetV = iy * step;
        }

        const norm = normalizeRoadDebuggerTileOffsetForMap(
            { tileX, tileY, offsetU, offsetV },
            { tileSize, mapWidth: this._mapWidth, mapHeight: this._mapHeight }
        );
        const x = Math.fround(ox + (norm.tileX + norm.offsetU) * tileSize);
        const z = Math.fround(oz + (norm.tileY + norm.offsetV) * tileSize);
        return { tileX: norm.tileX, tileY: norm.tileY, offsetU: norm.offsetU, offsetV: norm.offsetV, x, z };
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
            Math.abs((Number(found.point.offsetU) || 0) - (Number(norm.offsetU) || 0)) > eps ||
            Math.abs((Number(found.point.offsetV) || 0) - (Number(norm.offsetV) || 0)) > eps;
        if (!changed) return false;

        if (pushUndo) this._pushUndoSnapshot();
        found.point.tileX = norm.tileX;
        found.point.tileY = norm.tileY;
        found.point.offsetU = norm.offsetU;
        found.point.offsetV = norm.offsetV;
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
            point.offsetU = norm.offsetU;
            point.offsetV = norm.offsetV;
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
        this._hover = { roadId: null, segmentId: null, pointId: null, pieceId: null, junctionId: null, connectorId: null, approachId: null, tatId: null, tatType: null };
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

    _parseSchema(input, { legacyTileSize = null } = {}) {
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
        const legacyTileSizeResolved = Number.isFinite(Number(legacyTileSize))
            ? Number(legacyTileSize)
            : Number.isFinite(Number(obj?.tileSize))
                ? Number(obj.tileSize)
                : tileSize;

        const normalizePoint = (pt, index) => {
            const id = typeof pt?.id === 'string' && pt.id.trim() ? pt.id.trim() : `pt_${index + 1}`;
            const rawU = Number(pt?.offsetU);
            const rawV = Number(pt?.offsetV);
            const hasUv = Number.isFinite(rawU) || Number.isFinite(rawV);
            const offsetU = hasUv ? (Number.isFinite(rawU) ? rawU : 0) : (Number(pt?.offsetX) || 0) / legacyTileSizeResolved;
            const offsetV = hasUv ? (Number.isFinite(rawV) ? rawV : 0) : (Number(pt?.offsetY) || 0) / legacyTileSizeResolved;
            const norm = clampRoadDebuggerTileOffsetForMap(
                {
                    tileX: pt?.tileX ?? 0,
                    tileY: pt?.tileY ?? 0,
                    offsetU,
                    offsetV
                },
                { tileSize, mapWidth: this._mapWidth, mapHeight: this._mapHeight }
            );
            const tangentFactor = clamp(Number.isFinite(Number(pt?.tangentFactor)) ? Number(pt.tangentFactor) : 1, 0, 5);
            return { id, tileX: norm.tileX, tileY: norm.tileY, offsetU: norm.offsetU, offsetV: norm.offsetV, tangentFactor };
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
        const autoJunctionEnabled = obj?.autoJunctionEnabled === undefined ? (this._autoJunctionEnabled === true) : !!obj.autoJunctionEnabled;
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

        return { roads, draft, laneWidth, marginFactor, snapEnabled, autoJunctionEnabled, mergedConnectorIds, junctions, hiddenJunctionIds, suppressedAutoJunctionIds };
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
        const markerY = this._worldLayers?.markerY ?? (this._groundY + 0.011);
        mesh.position.set(0, markerY, 0);
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
        const markerY = this._worldLayers?.markerY ?? (this._groundY + 0.011);
        this._snapHighlightMesh.position.set(Number(worldX) || 0, markerY, Number(worldZ) || 0);
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

        const baseY = this._worldLayers?.pointY ?? (this._groundY + 0.04);
        cube.position.set(Number(w.x) || 0, baseY + 0.02, Number(w.z) || 0);
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
        const markerY = this._worldLayers?.markerY ?? (this._groundY + 0.021);
        mesh.position.set(ox + tx * tileSize, markerY, oz + ty * tileSize);
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
        const markerY = this._worldLayers?.markerY ?? (this._groundY + 0.024);
        mesh.position.set(Number(w.x) || 0, markerY, Number(w.z) || 0);
        this._setApproachMarkerVisible(true);
    }

    _ensureTrafficControlMarker() {
        if (this._trafficControlMarkerMesh) return;
        if (!this.root) return;
        const tileSize = Number(this._tileSize) || 24;
        const outer = Math.max(1.5, tileSize * 0.08);
        const inner = Math.max(0.9, outer * 0.7);

        const shape = new THREE.Shape();
        shape.moveTo(-outer, -outer);
        shape.lineTo(outer, -outer);
        shape.lineTo(outer, outer);
        shape.lineTo(-outer, outer);
        shape.lineTo(-outer, -outer);

        const hole = new THREE.Path();
        hole.moveTo(-inner, -inner);
        hole.lineTo(-inner, inner);
        hole.lineTo(inner, inner);
        hole.lineTo(inner, -inner);
        hole.lineTo(-inner, -inner);
        shape.holes.push(hole);

        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(-Math.PI * 0.5);
        this._trafficControlMarkerGeo = geo;

        const mesh = new THREE.Mesh(geo, this._materials.approachMarkerHover);
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.renderOrder = 125;
        mesh.userData = { type: 'junction_traffic_control_marker' };
        this._trafficControlMarkerMesh = mesh;
        this.root.add(mesh);
    }

    _setTrafficControlMarkerVisible(visible) {
        if (!this._trafficControlMarkerMesh) return;
        this._trafficControlMarkerMesh.visible = !!visible;
    }

    _syncTrafficControlMarker() {
        const derived = this._derived ?? null;
        if (!derived) {
            this._setTrafficControlMarkerVisible(false);
            return;
        }

        const hover = this._hover ?? {};
        const junctionId = hover?.junctionId ?? null;
        const approachId = hover?.approachId ?? null;
        if (!junctionId || !approachId) {
            this._setTrafficControlMarkerVisible(false);
            return;
        }

        const candidates = [];
        if (this._stopSignsGroup?.visible) candidates.push(this._stopSignsGroup);
        if (this._trafficLightsGroup?.visible) candidates.push(this._trafficLightsGroup);
        if (!candidates.length) {
            this._setTrafficControlMarkerVisible(false);
            return;
        }

        const stack = [];
        for (const group of candidates) {
            for (const child of group?.children ?? []) stack.push(child);
        }

        let target = null;
        while (stack.length) {
            const node = stack.pop();
            if (!node) continue;
            const tc = node?.userData?.trafficControl ?? null;
            if (tc && tc.corner === approachId) {
                target = node;
                break;
            }
            for (const child of node?.children ?? []) stack.push(child);
        }

        if (!target) {
            this._setTrafficControlMarkerVisible(false);
            return;
        }

        const pos = new THREE.Vector3();
        target.getWorldPosition(pos);

        this._ensureTrafficControlMarker();
        const mesh = this._trafficControlMarkerMesh;
        if (!mesh) return;
        mesh.material = this._materials.approachMarkerHover;
        const markerY = this._worldLayers?.markerY ?? (this._groundY + 0.024);
        mesh.position.set(pos.x, markerY, pos.z);
        this._setTrafficControlMarkerVisible(true);
    }

    _pickAtPointer() {
        return this._picking?.pickClick?.() ?? null;
    }

    _pickHoverAtPointer() {
        return this._picking?.pickHover?.() ?? null;
    }

    updateHoverFromPointer() {
        if (this._pendingClick || this.isPointDragActive?.()) return;
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
        if (pick?.type === 'junction_tat') {
            this.setHoverJunctionTat(pick.junctionId, pick.tatId, pick.tatType ?? null);
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
                    enabled: true,
                    thresholdFactor: Number(this._junctionThresholdFactor) || 1.5,
                    autoCreate: this._autoJunctionEnabled === true,
                    filletRadiusFactor: Number.isFinite(this._junctionFilletRadiusFactor) ? this._junctionFilletRadiusFactor : 1,
                    debug: { ...this._junctionDebug },
                    mergedConnectorIds: Array.from(this._mergedConnectorIds ?? []),
                    manualJunctions: cloneJson(this._authoredJunctions ?? []),
                    hiddenJunctionIds: Array.from(this._hiddenJunctionIds ?? []),
                    suppressedAutoJunctionIds: Array.from(this._suppressedAutoJunctionIds ?? [])
                }
            }
        });

        const issues = validateRoadDebuggerIssues(this._derived);
        this._issues = issues;
        this._issuesById = new Map(issues.map((issue) => [issue.issueId, issue]));
        if (this._hoverIssueId && !this._issuesById.has(this._hoverIssueId)) this._hoverIssueId = null;
        if (this._selectedIssueId && !this._issuesById.has(this._selectedIssueId)) this._selectedIssueId = null;

        this._sanitizeJunctionToolSelection?.();
        this._rebuildOverlaysFromDerived();
        this._syncDraftFirstTileMarker();
        this._applyHighlights();
        this.ui?.sync?.();
    }

    _clearOverlays() {
        if (this._overlayRoot) {
            this.root?.remove?.(this._overlayRoot);
            const ownedMaterials = new Set();
            const registerMaterial = (mat) => {
                if (!mat) return;
                if (Array.isArray(mat)) {
                    for (const m of mat) registerMaterial(m);
                    return;
                }
                ownedMaterials.add(mat);
            };
            for (const value of Object.values(this._materials ?? {})) {
                if (!value) continue;
                if (value instanceof Map) {
                    for (const mat of value.values()) registerMaterial(mat);
                    continue;
                }
                registerMaterial(value);
            }
            this._overlayRoot.traverse((child) => {
                if (!child?.geometry?.dispose) return;
                if (child.geometry === this._sphereGeo) return;
                if (child.geometry === this._junctionCandidateGeo) return;
                if (child.geometry === this._junctionCandidateRingGeo) return;
                child.geometry.dispose();
            });
            this._overlayRoot.traverse((child) => {
                const mat = child?.material ?? null;
                if (!mat) return;
                if (Array.isArray(mat)) {
                    for (const entry of mat) {
                        if (!entry?.dispose || ownedMaterials.has(entry)) continue;
                        entry.dispose();
                    }
                    return;
                }
                if (!mat?.dispose || ownedMaterials.has(mat)) return;
                mat.dispose();
            });
            this._overlayRoot = null;
        }
        this._asphaltGroup = null;
        this._curbsGroup = null;
        this._sidewalksGroup = null;
        this._stopSignsGroup = null;
        this._trafficLightsGroup = null;
        this._markingsGroup = null;
        this._debugGroup = null;
        this._highlightGroup = null;
        this._overlayLines = [];
        this._overlayPoints = [];
        this._asphaltMeshes = [];
        this._junctionSurfaceMeshes = [];
        this._curbMeshes = [];
        this._sidewalkMeshes = [];
        this._markingLines = [];
        this._arrowMeshes = [];
        this._arrowTangentLines = [];
        this._crosswalkMeshes = [];
        this._controlPointMeshes = [];
        this._segmentPickMeshes = [];
        this._junctionPickMeshes = [];
        this._connectorPickMeshes = [];
        this._junctionTatPickMeshes = [];
        this._junctionCandidateMeshes = [];
        this._junctionCandidatePickMeshes = [];
        this._worldLayers = null;
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

        const curbsGroup = new THREE.Group();
        curbsGroup.name = 'RoadDebuggerCurbs';
        const curbStep = (this._decorationPipeline ?? []).find((step) => step?.id === 'curbs') ?? null;
        curbsGroup.visible = curbStep?.enabled === true;
        overlay.add(curbsGroup);
        this._curbsGroup = curbsGroup;

        const sidewalksGroup = new THREE.Group();
        sidewalksGroup.name = 'RoadDebuggerSidewalks';
        const sidewalkStep = (this._decorationPipeline ?? []).find((step) => step?.id === 'sidewalks') ?? null;
        sidewalksGroup.visible = sidewalkStep?.enabled === true;
        overlay.add(sidewalksGroup);
        this._sidewalksGroup = sidewalksGroup;

        const stopSignsGroup = new THREE.Group();
        stopSignsGroup.name = 'RoadDebuggerStopSigns';
        const stopSignsStep = (this._decorationPipeline ?? []).find((step) => step?.id === 'stop_signs') ?? null;
        stopSignsGroup.visible = stopSignsStep?.enabled === true;
        overlay.add(stopSignsGroup);
        this._stopSignsGroup = stopSignsGroup;

        const trafficLightsGroup = new THREE.Group();
        trafficLightsGroup.name = 'RoadDebuggerTrafficLights';
        const trafficLightsStep = (this._decorationPipeline ?? []).find((step) => step?.id === 'traffic_lights') ?? null;
        trafficLightsGroup.visible = trafficLightsStep?.enabled === true;
        overlay.add(trafficLightsGroup);
        this._trafficLightsGroup = trafficLightsGroup;

        const markingsGroup = new THREE.Group();
        markingsGroup.name = 'RoadDebuggerMarkings';
        const markingsStep = (this._decorationPipeline ?? []).find((step) => step?.id === 'markings') ?? null;
        markingsGroup.visible = markingsStep?.enabled === true;
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

        const hoverTatGroup = new THREE.Group();
        hoverTatGroup.name = 'RoadDebuggerHoverTat';
        overlay.add(hoverTatGroup);
        this._hoverTatGroup = hoverTatGroup;

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

        const laneWidth = Number(this._laneWidth) || 4.8;
        const curbThickness = Math.max(0.01, laneWidth * 0.1);
        const curbHeight = Math.max(0.02, laneWidth * 0.2);
        const sidewalkWidth = Math.max(0.01, laneWidth * (1.875 / 4.8));
        const sidewalkLift = Math.max(0, laneWidth * (0.001 / 4.8));

        const layerEps = Math.max(0.004, laneWidth * 0.0015);
        const asphaltY = this._groundY + Math.max(0.04, laneWidth * 0.0125);
        const markingY = asphaltY + layerEps;
        const arrowY = markingY + layerEps * 0.6;
        const lineY = asphaltY + layerEps * 2.5;
        const pointY = asphaltY + layerEps * 4.0;
        const debugY0 = asphaltY + layerEps * 0.2;
        const debugY1 = asphaltY + layerEps * 0.3;
        const debugY2 = asphaltY + layerEps * 0.4;
        const pickY = asphaltY + Math.max(0.03, layerEps * 3);
        const markerY = arrowY + layerEps * 1.2;

        this._worldLayers = {
            laneWidth,
            curbThickness,
            curbHeight,
            sidewalkWidth,
            sidewalkLift,
            layerEps,
            asphaltY,
            markingY,
            arrowY,
            markerY,
            lineY,
            pointY,
            pickY
        };

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

        if (stopSignsGroup.visible || trafficLightsGroup.visible) {
            const trafficSegments = (this._derived?.segments ?? []).filter((seg) => seg && isRoadVisible(seg?.roadId));
            const trafficJunctions = [];
            for (const junction of derivedJunctions) {
                const jid = junction?.id ?? null;
                if (!jid) continue;
                if (!isJunctionVisible(jid)) continue;
                const endpointsRaw = Array.isArray(junction?.endpoints) ? junction.endpoints : [];
                const endpoints = endpointsRaw.filter((ep) => ep?.roadId && isRoadVisible(ep.roadId));
                trafficJunctions.push({ ...junction, endpoints });
            }

            const placements = computeRoadTrafficControlPlacementsFromRoadEngineDerived(
                { segments: trafficSegments, junctions: trafficJunctions },
                {
                    laneWidth,
                    tileSize: this._tileSize,
                    asphaltY,
                    curbThickness,
                    curbHeight,
                    sidewalkWidth,
                    sidewalkLift,
                    trafficLightLaneThreshold: 3
                }
            );

            if (stopSignsGroup.visible) {
                const stopPlacements = placements.filter((p) => p?.kind === ROAD_TRAFFIC_CONTROL.STOP_SIGN);
                if (stopPlacements.length) {
                    const props = createTrafficControlProps({ placements: stopPlacements, useSolidMaterials: true });
                    const group = props?.group ?? null;
                    if (group) {
                        group.name = 'RoadDebuggerStopSignProps';
                        stopSignsGroup.add(group);
                    }
                }
            }

            if (trafficLightsGroup.visible) {
                const lightPlacements = placements.filter((p) => p?.kind === ROAD_TRAFFIC_CONTROL.TRAFFIC_LIGHT);
                if (lightPlacements.length) {
                    const props = createTrafficControlProps({ placements: lightPlacements, useSolidMaterials: true });
                    const group = props?.group ?? null;
                    if (group) {
                        group.name = 'RoadDebuggerTrafficLightProps';
                        trafficLightsGroup.add(group);
                    }
                }
            }
        }

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

        if (curbsGroup.visible) {
            const curbPrimitives = [];
            for (const prim of primitives) {
                if (!prim || prim.type !== 'polygon') continue;
                const kind = prim.kind ?? null;
                if (kind !== 'asphalt_piece' && kind !== 'junction_surface') continue;
                const roadId = prim.roadId ?? null;
                const junctionId = prim.junctionId ?? null;
                if (roadId && !isRoadVisible(roadId)) continue;
                if (!roadId && junctionId && !isJunctionVisible(junctionId)) continue;
                curbPrimitives.push(prim);
            }

            const curbData = buildRoadCurbMeshDataFromRoadEnginePrimitives(curbPrimitives, {
                surfaceY: asphaltY,
                curbThickness,
                curbHeight,
                curbExtraHeight: 0,
                curbSink: 0,
                boundaryEpsilon: 1e-4,
                miterLimit: 4
            });
            if (curbData?.positions?.length) {
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(curbData.positions, 3));
                geo.computeVertexNormals();
                geo.computeBoundingSphere();
                const mesh = new THREE.Mesh(geo, this._materials.curbBase);
                mesh.userData = { type: 'curbs' };
                mesh.renderOrder = 0.5;
                curbsGroup.add(mesh);
                this._curbMeshes.push(mesh);
            }
        }

        if (sidewalksGroup.visible) {
            const sidewalkPrimitives = [];
            for (const prim of primitives) {
                if (!prim || prim.type !== 'polygon') continue;
                const kind = prim.kind ?? null;
                if (kind !== 'asphalt_piece' && kind !== 'junction_surface') continue;
                const roadId = prim.roadId ?? null;
                const junctionId = prim.junctionId ?? null;
                if (roadId && !isRoadVisible(roadId)) continue;
                if (!roadId && junctionId && !isJunctionVisible(junctionId)) continue;
                sidewalkPrimitives.push(prim);
            }

            const sidewalkData = buildRoadSidewalkMeshDataFromRoadEnginePrimitives(sidewalkPrimitives, {
                surfaceY: asphaltY,
                curbThickness,
                curbHeight,
                curbExtraHeight: 0,
                sidewalkWidth,
                sidewalkLift,
                startFromCurb: curbsGroup.visible,
                boundaryEpsilon: 1e-4,
                miterLimit: 4
            });
            if (sidewalkData?.positions?.length) {
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(sidewalkData.positions, 3));
                geo.computeVertexNormals();
                geo.computeBoundingSphere();
                const mesh = new THREE.Mesh(geo, this._materials.sidewalkBase);
                mesh.userData = { type: 'sidewalks' };
                mesh.renderOrder = 0.6;
                sidewalksGroup.add(mesh);
                this._sidewalkMeshes.push(mesh);
            }
        }

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

        const makePickPolylineGeometry = (points, width, y) => {
            const pts = Array.isArray(points) ? points : [];
            if (pts.length < 2) return null;
            const hw = (Number(width) || 0) * 0.5;
            if (!(hw > 1e-6)) return null;

            const positions = [];
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i];
                const b = pts[i + 1];
                const ax = Number(a?.x) || 0;
                const az = Number(a?.z) || 0;
                const bx = Number(b?.x) || 0;
                const bz = Number(b?.z) || 0;
                const dx = bx - ax;
                const dz = bz - az;
                const len = Math.hypot(dx, dz);
                if (!(len > 1e-6)) continue;
                const inv = 1 / len;
                const ux = dx * inv;
                const uz = dz * inv;
                const rx = uz;
                const rz = -ux;

                const p0x = ax + rx * hw;
                const p0z = az + rz * hw;
                const p1x = ax - rx * hw;
                const p1z = az - rz * hw;
                const p2x = bx - rx * hw;
                const p2z = bz - rz * hw;
                const p3x = bx + rx * hw;
                const p3z = bz + rz * hw;

                positions.push(
                    p0x, y, p0z,
                    p1x, y, p1z,
                    p2x, y, p2z,
                    p0x, y, p0z,
                    p2x, y, p2z,
                    p3x, y, p3z
                );
            }

            if (positions.length < 18) return null;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
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
            line.userData = {
                type: 'polyline',
                roadId,
                segmentId: prim.segmentId ?? null,
                kind,
                junctionId,
                connectorId: prim.connectorId ?? null,
                tatId: prim.tatId ?? null,
                tatType: prim.tatType ?? null
            };
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

            if ((kind === 'junction_tat_tangent' || kind === 'junction_tat_arc') && prim.tatId && pts.length >= 2) {
                const pickWidth = Math.max(0.85, (Number(this._laneWidth) || 4.8) * 0.18);
                const pickGeo = makePickPolylineGeometry(pts, pickWidth, pickY);
                if (pickGeo) {
                    const pick = new THREE.Mesh(pickGeo, this._materials.pickHidden);
                    pick.userData = { type: 'junction_tat_pick', junctionId, tatId: prim.tatId, tatType: prim.tatType ?? null };
                    pick.renderOrder = 4;
                    pickGroup.add(pick);
                    this._junctionTatPickMeshes.push(pick);
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

        if (markingsGroup.visible) {
            const markingsSegments = [];
            for (const seg of this._derived?.segments ?? []) {
                if (!seg) continue;
                if (!isRoadVisible(seg?.roadId)) continue;
                markingsSegments.push(seg);
            }

            const markingsPrimitives = [];
            for (const prim of primitives) {
                if (!prim || prim.type !== 'polygon') continue;
                const kind = prim.kind ?? null;
                if (kind !== 'asphalt_piece' && kind !== 'junction_surface') continue;
                const roadId = prim.roadId ?? null;
                const junctionId = prim.junctionId ?? null;
                if (roadId && !isRoadVisible(roadId)) continue;
                if (!roadId && junctionId && !isJunctionVisible(junctionId)) continue;
                markingsPrimitives.push(prim);
            }

            const markingsJunctions = [];
            for (const junction of derivedJunctions) {
                const jid = junction?.id ?? null;
                if (!jid) continue;
                if (!isJunctionVisible(jid)) continue;
                const endpointsRaw = Array.isArray(junction?.endpoints) ? junction.endpoints : [];
                const endpoints = endpointsRaw.filter((ep) => !ep?.roadId || isRoadVisible(ep.roadId));
                markingsJunctions.push({ ...junction, endpoints });
            }

            const paintLift = Math.max(0.001, layerEps * 0.15);
            const data = buildRoadMarkingsMeshDataFromRoadEngineDerived(
                { segments: markingsSegments, junctions: markingsJunctions, primitives: markingsPrimitives },
                {
                    laneWidth,
                    markingY,
                    arrowY,
                    arrowTangentY: arrowY + paintLift,
                    crosswalkY: markingY + paintLift,
                    boundaryEpsilon: 1e-4,
                    includeArrowTangents: this._arrowTangentDebugEnabled === true
                }
            );

            const meshes = createRoadMarkingsMeshesFromData(data, {
                laneWidth,
                materials: {
                    white: this._materials.arrow,
                    yellow: this._materials.markingYellow,
                    crosswalk: this._materials.arrow,
                    arrow: this._materials.arrow,
                    arrowTangent: this._materials.arrowTangent
                },
                renderOrder: {
                    white: 1,
                    yellow: 1.1,
                    crosswalk: 1.5,
                    arrow: 2,
                    arrowTangent: 3
                },
                includeArrowTangents: this._arrowTangentDebugEnabled === true,
                userData: {
                    white: { type: 'lane_markings_white' },
                    yellow: { type: 'lane_markings_centerline' },
                    crosswalk: { type: 'crosswalks' },
                    arrow: { type: 'lane_arrows' },
                    arrowTangent: { type: 'arrow_tangents' }
                }
            });

            if (meshes.markingsWhite) {
                markingsGroup.add(meshes.markingsWhite);
                this._markingLines.push(meshes.markingsWhite);
            }
            if (meshes.markingsYellow) {
                markingsGroup.add(meshes.markingsYellow);
                this._markingLines.push(meshes.markingsYellow);
            }
            if (meshes.crosswalks) {
                markingsGroup.add(meshes.crosswalks);
                this._crosswalkMeshes.push(meshes.crosswalks);
            }
            if (meshes.arrows) {
                markingsGroup.add(meshes.arrows);
                this._arrowMeshes.push(meshes.arrows);
            }
            if (meshes.arrowTangents) {
                markingsGroup.add(meshes.arrowTangents);
                this._arrowTangentLines.push(meshes.arrowTangents);
            }
        }

        this._applyDistanceScaledEdgeLineWidths();
        this._applyOpaqueMaterialsToWorld();
        this._applyMeshWireframeToOverlays();
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
        this._trafficControlMarkerGeo?.dispose?.();
        this._trafficControlMarkerGeo = null;
        this._trafficControlMarkerMesh = null;
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

    _syncHoverTatOverlay({ force = false } = {}) {
        const group = this._hoverTatGroup ?? null;
        if (!group) return;

        const hover = this._hover ?? {};
        const junctionId = hover?.junctionId ?? null;
        const tatId = hover?.tatId ?? null;
        const enabled = !!junctionId && !!tatId;
        const key = enabled ? `${junctionId}|${tatId}` : '';
        if (!force && key === this._hoverTatOverlayKey) return;
        this._hoverTatOverlayKey = key;

        group.traverse((child) => {
            if (child?.geometry?.dispose) child.geometry.dispose();
        });
        group.clear();
        if (!enabled) return;

        const junction = this._derived?.junctions?.find?.((j) => j?.id === junctionId) ?? null;
        const tat = junction?.tat?.find?.((t) => t?.id === tatId) ?? null;
        if (!tat) return;

        this._syncLineMaterialResolution();
        const lineY = this._groundY + 0.03;
        const chord = Math.max(0.12, (Number(this._laneWidth) || 4.8) * 0.03);

        const makeLine = (points, { kind, color = 0x34c759, linewidth = baseLineWidthForKind(kind), opacity = 0.95 } = {}) => {
            const pts = Array.isArray(points) ? points.filter(Boolean) : [];
            if (pts.length < 2) return;
            const positions = [];
            for (const p of pts) {
                positions.push(Number(p.x) || 0, lineY, Number(p.z) || 0);
            }
            if (positions.length < 6) return;

            const geo = new LineGeometry();
            geo.setPositions(positions);

            const matKey = `${kind}|${String(color)}`;
            const mat = ensureMapEntry(this._materials.lineHover, matKey, () => {
                const material = new LineMaterial({
                    color,
                    linewidth,
                    worldUnits: false,
                    transparent: true,
                    opacity,
                    depthTest: false,
                    depthWrite: false
                });
                material.resolution.set(this._lineMaterialResolution.x, this._lineMaterialResolution.y);
                return material;
            });

            const line = new Line2(geo, mat);
            line.computeLineDistances();
            line.frustumCulled = false;
            line.userData = { type: 'polyline', kind, junctionId, tatId, tatType: tat?.type ?? null };
            line.renderOrder = baseLineRenderOrderForKind(kind);
            group.add(line);
        };

        const buildTangents = Array.isArray(tat?.buildTangents) ? tat.buildTangents : [];
        if (buildTangents.length) {
            const laneWidth = Number(this._laneWidth) || 4.8;
            const maxLen = Math.max(2, laneWidth * 3);
            const minLen = Math.max(1, laneWidth * 0.8);
            for (const line of buildTangents) {
                const origin = line?.origin ?? null;
                const dir = line?.dir ?? null;
                if (!origin || !dir) continue;
                const rawLen = Number(line?.length);
                const len = Number.isFinite(rawLen) && rawLen > 1e-6 ? Math.min(maxLen, Math.max(minLen, rawLen)) : maxLen;
                const end = { x: Number(origin.x) + (Number(dir.x) || 0) * len, z: Number(origin.z) + (Number(dir.z) || 0) * len };
                makeLine([origin, end], { kind: 'junction_tat_build_tangent', color: 0x93c5fd, linewidth: 1, opacity: 0.82 });
            }
        }

        for (const seg of tat?.tangents ?? []) {
            const a = seg?.a ?? null;
            const b = seg?.b ?? null;
            if (!a || !b) continue;
            makeLine([a, b], { kind: 'junction_tat_tangent' });
        }

        const arc = tat?.arc ?? null;
        if (arc?.center && Number.isFinite(arc.radius) && arc.radius > 1e-6 && Number.isFinite(arc.startAng) && Number.isFinite(arc.spanAng) && arc.spanAng > 1e-6) {
            const arcLen = Math.abs(Number(arc.spanAng) || 0) * (Number(arc.radius) || 0);
            const span = Math.abs(Number(arc.spanAng) || 0);
            const chordSegments = Math.ceil(arcLen / chord);
            const angleSegments = Math.ceil(span / (Math.PI / 24));
            const segments = Math.max(8, Math.min(96, Math.max(chordSegments, angleSegments)));
            const pts = sampleArcXZ({
                center: arc.center,
                radius: arc.radius,
                startAng: arc.startAng,
                spanAng: arc.spanAng,
                ccw: arc.ccw !== false,
                segments
            });
            makeLine(pts, { kind: 'junction_tat_arc' });
        }
    }

    _applyHighlights() {
        this._syncLineMaterialResolution();
        this._syncHoverTatOverlay();
        const derived = this._derived ?? null;
        const sel = this._selection ?? {};
        const hover = this._hover ?? {};

        const hoverRoadId = hover.roadId ?? null;
        const hoverSegmentId = hover.segmentId ?? null;
        const hoverPointId = hover.pointId ?? null;
        const hoverJunctionId = hover.junctionId ?? null;
        const hoverConnectorId = hover.connectorId ?? null;
        const hoverApproachId = hover.approachId ?? null;
        const hoverTatId = hover.tatId ?? null;
        const hoverJunctionHighlightId = (!hoverConnectorId && !hoverApproachId && !hoverTatId) ? hoverJunctionId : null;

        const selRoadId = sel.type ? (sel.roadId ?? null) : null;
        const selSegmentId = (sel.type === 'segment' || sel.type === 'piece') ? (sel.segmentId ?? null) : null;
        const selPointId = sel.type === 'point' ? (sel.pointId ?? null) : null;
        const selJunctionId = sel.type === 'junction' ? (sel.junctionId ?? null) : null;
        const selConnectorId = sel.type === 'connector' ? (sel.connectorId ?? null) : null;
        const selApproachId = sel.type === 'approach' ? (sel.approachId ?? null) : null;

        const junctionOverlaysEnabled = this._junctionEnabled !== false;
        const forcedJunctionIds = new Set();
        if (sel?.junctionId) forcedJunctionIds.add(sel.junctionId);
        if (hoverJunctionId) forcedJunctionIds.add(hoverJunctionId);

        const extraSelectedRoadIds = new Set();
        const extraSelectedSegmentIds = new Set();
        const extraSelectedPointIds = new Set();
        const extraSelectedJunctionIds = new Set();
        const extraSelectedConnectorIds = new Set();
        if (sel.type === 'junction' && selJunctionId) {
            const junction = derived?.junctions?.find?.((j) => j?.id === selJunctionId) ?? null;
            for (const rid of junction?.roadIds ?? []) extraSelectedRoadIds.add(rid);
            for (const sid of junction?.segmentIds ?? []) extraSelectedSegmentIds.add(sid);
        }

        const selectedIssue = this._selectedIssueId ? (this._issuesById?.get?.(this._selectedIssueId) ?? null) : null;
        if (selectedIssue) {
            for (const rid of selectedIssue?.refs?.roadIds ?? []) extraSelectedRoadIds.add(rid);
            for (const sid of selectedIssue?.refs?.segmentIds ?? []) extraSelectedSegmentIds.add(sid);
            for (const pid of selectedIssue?.refs?.pointIds ?? []) extraSelectedPointIds.add(pid);
            for (const jid of selectedIssue?.refs?.junctionIds ?? []) {
                extraSelectedJunctionIds.add(jid);
                forcedJunctionIds.add(jid);
            }
            for (const cid of selectedIssue?.refs?.connectorIds ?? []) extraSelectedConnectorIds.add(cid);
        }

        const extraHoverRoadIds = new Set();
        const extraHoverSegmentIds = new Set();
        const extraHoverPointIds = new Set();
        const extraHoverJunctionIds = new Set();
        const extraHoverConnectorIds = new Set();
        if (hoverJunctionHighlightId) {
            const junction = derived?.junctions?.find?.((j) => j?.id === hoverJunctionHighlightId) ?? null;
            for (const rid of junction?.roadIds ?? []) extraHoverRoadIds.add(rid);
            for (const sid of junction?.segmentIds ?? []) extraHoverSegmentIds.add(sid);
        }

        const hoverIssue = this._hoverIssueId ? (this._issuesById?.get?.(this._hoverIssueId) ?? null) : null;
        if (hoverIssue) {
            for (const rid of hoverIssue?.refs?.roadIds ?? []) extraHoverRoadIds.add(rid);
            for (const sid of hoverIssue?.refs?.segmentIds ?? []) extraHoverSegmentIds.add(sid);
            for (const pid of hoverIssue?.refs?.pointIds ?? []) extraHoverPointIds.add(pid);
            for (const jid of hoverIssue?.refs?.junctionIds ?? []) {
                extraHoverJunctionIds.add(jid);
                forcedJunctionIds.add(jid);
            }
            for (const cid of hoverIssue?.refs?.connectorIds ?? []) extraHoverConnectorIds.add(cid);
        }

        for (const line of this._overlayLines) {
            const roadId = line?.userData?.roadId ?? null;
            const segmentId = line?.userData?.segmentId ?? null;
            const junctionId = line?.userData?.junctionId ?? null;
            const connectorId = line?.userData?.connectorId ?? null;
            const tatId = line?.userData?.tatId ?? null;
            const kind = line?.userData?.kind ?? 'unknown';
            const selected =
                (!!selSegmentId && segmentId === selSegmentId)
                || (!!selRoadId && roadId === selRoadId)
                || (!!selJunctionId && junctionId === selJunctionId)
                || (!!selConnectorId && connectorId === selConnectorId)
                || (!!junctionId && extraSelectedJunctionIds.has(junctionId))
                || (!!connectorId && extraSelectedConnectorIds.has(connectorId))
                || (!!segmentId && extraSelectedSegmentIds.has(segmentId))
                || (!!roadId && extraSelectedRoadIds.has(roadId));
            const hovered = (
                (!!hoverSegmentId && segmentId === hoverSegmentId)
                || (!hoverSegmentId && !!hoverRoadId && !hoverPointId && roadId === hoverRoadId)
                || (!!hoverJunctionHighlightId && junctionId === hoverJunctionHighlightId)
                || (!!hoverConnectorId && connectorId === hoverConnectorId)
                || (!!junctionId && extraHoverJunctionIds.has(junctionId))
                || (!!connectorId && extraHoverConnectorIds.has(connectorId))
                || (!!segmentId && extraHoverSegmentIds.has(segmentId))
                || (!!roadId && extraHoverRoadIds.has(roadId))
                || (!!hoverTatId && !!junctionId && junctionId === hoverJunctionId && !!tatId && tatId === hoverTatId)
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

            const isJunctionOverlay = !!junctionId && String(kind).startsWith('junction_');
            const junctionAllowed = !isJunctionOverlay
                || junctionOverlaysEnabled
                || forcedJunctionIds.has(junctionId);

            line.material = hovered ? hoverMat : (selected ? selectedMat : baseMat);
            line.visible = junctionAllowed;
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
                || (!!junctionId && extraSelectedJunctionIds.has(junctionId))
                || (!!segmentId && extraSelectedSegmentIds.has(segmentId))
                || (!!roadId && extraSelectedRoadIds.has(roadId));
            const hovered = (
                (!!hoverSegmentId && segmentId === hoverSegmentId)
                || (!hoverSegmentId && !!hoverRoadId && !hoverPointId && roadId === hoverRoadId)
                || (!!hoverJunctionHighlightId && junctionId === hoverJunctionHighlightId)
                || (!!junctionId && extraHoverJunctionIds.has(junctionId))
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
            const isJunctionOverlay = !!junctionId && String(kind).startsWith('junction_');
            const junctionAllowed = !isJunctionOverlay
                || junctionOverlaysEnabled
                || forcedJunctionIds.has(junctionId);
            pts.material = hovered ? this._materials.hoverPoint : (selected ? this._materials.selectedPoint : baseMat);
            pts.visible = junctionAllowed;
        }

        const showControlPoints = this._renderOptions.points !== false;
        const selectedRoadPoints = sel.type === 'road' ? selRoadId : null;
        const hoveredRoadPoints = (!hoverSegmentId && !hoverPointId) ? hoverRoadId : null;
        const connectionPointIds = new Set();
        if (hoverSegmentId) {
            const seg = derived?.segments?.find?.((s) => s?.id === hoverSegmentId) ?? null;
            if (seg?.aPointId) connectionPointIds.add(seg.aPointId);
            if (seg?.bPointId) connectionPointIds.add(seg.bPointId);
        }

        for (const mesh of this._controlPointMeshes) {
            const roadId = mesh?.userData?.roadId ?? null;
            const pointId = mesh?.userData?.pointId ?? null;
            const issueSelected = !!pointId && extraSelectedPointIds.has(pointId);
            const issueHovered = !!pointId && extraHoverPointIds.has(pointId);
            const selected = (!!selPointId && pointId === selPointId) || issueSelected;
            const hovered = (!!hoverPointId && pointId === hoverPointId) || issueHovered;
            const isDraft = this._draft?.id === roadId;
            const base = isDraft ? this._materials.controlPointDraft : this._materials.controlPoint;
            const isConnection = !!pointId && connectionPointIds.has(pointId);
            mesh.material = hovered
                ? this._materials.controlPointHover
                : selected
                    ? this._materials.controlPointSelected
                    : isConnection
                        ? this._materials.controlPointConnection
                        : base;
            mesh.visible = showControlPoints
                || !!isDraft
                || selected
                || hovered
                || isConnection
                || (!!selectedRoadPoints && roadId === selectedRoadPoints)
                || (!!hoveredRoadPoints && roadId === hoveredRoadPoints);
        }

        const asphaltVisible = this._renderOptions.asphalt !== false;
        for (const mesh of this._junctionSurfaceMeshes) {
            const junctionId = mesh?.userData?.junctionId ?? null;
            const junctionAllowed = junctionOverlaysEnabled || (!!junctionId && forcedJunctionIds.has(junctionId));
            mesh.visible = asphaltVisible && junctionAllowed;
        }

        for (const mesh of this._segmentPickMeshes) {
            const roadId = mesh?.userData?.roadId ?? null;
            const segmentId = mesh?.userData?.segmentId ?? null;
            const selected =
                (!!selSegmentId && segmentId === selSegmentId)
                || (!!selRoadId && roadId === selRoadId)
                || (!!segmentId && extraSelectedSegmentIds.has(segmentId))
                || (!!roadId && extraSelectedRoadIds.has(roadId));
            const hovered = (
                (!!hoverSegmentId && segmentId === hoverSegmentId)
                || (!hoverSegmentId && !!hoverRoadId && !hoverPointId && roadId === hoverRoadId)
                || (!!segmentId && extraHoverSegmentIds.has(segmentId))
                || (!!roadId && extraHoverRoadIds.has(roadId))
            );
            mesh.material = hovered ? this._materials.pickHover : (selected ? this._materials.pickSelected : this._materials.pickHidden);
            mesh.visible = true;
        }

        for (const mesh of this._junctionPickMeshes) {
            const junctionId = mesh?.userData?.junctionId ?? null;
            const selected = (!!selJunctionId && junctionId === selJunctionId) || (!!junctionId && extraSelectedJunctionIds.has(junctionId));
            const hovered = (!!hoverJunctionHighlightId && junctionId === hoverJunctionHighlightId) || (!!junctionId && extraHoverJunctionIds.has(junctionId));
            mesh.material = hovered ? this._materials.pickHover : (selected ? this._materials.pickSelected : this._materials.pickHidden);
            mesh.visible = true;
        }

        for (const mesh of this._connectorPickMeshes) {
            const connectorId = mesh?.userData?.connectorId ?? null;
            const selected = (!!selConnectorId && connectorId === selConnectorId) || (!!connectorId && extraSelectedConnectorIds.has(connectorId));
            const hovered = (!!hoverConnectorId && connectorId === hoverConnectorId) || (!!connectorId && extraHoverConnectorIds.has(connectorId));
            mesh.material = hovered ? this._materials.pickHover : (selected ? this._materials.pickSelected : this._materials.pickHidden);
            mesh.visible = true;
        }

        for (const mesh of this._junctionTatPickMeshes) {
            const junctionId = mesh?.userData?.junctionId ?? null;
            const tatId = mesh?.userData?.tatId ?? null;
            const hovered = (!!hoverTatId && !!junctionId && junctionId === hoverJunctionId && !!tatId && tatId === hoverTatId);
            const junctionAllowed = junctionOverlaysEnabled || (!!junctionId && forcedJunctionIds.has(junctionId));
            mesh.material = hovered ? this._materials.pickHover : this._materials.pickHidden;
            mesh.visible = junctionAllowed;
        }

        if (this._junctionToolEnabled) {
            const hoverCandidateId = this._junctionToolHoverCandidateId ?? null;
            const selectedCandidates = this._junctionToolSelectedCandidateIds ?? new Set();

            for (const mesh of this._junctionCandidatePickMeshes) {
                const candidateId = mesh?.userData?.candidateId ?? null;
                const selected = candidateId && selectedCandidates.has(candidateId);
                const hovered = candidateId && candidateId === hoverCandidateId;
                mesh.material = hovered ? this._materials.pickHover : (selected ? this._materials.pickSelected : this._materials.pickHidden);
                mesh.visible = true;
            }

            for (const mesh of this._junctionCandidateMeshes) {
                const candidateId = mesh?.userData?.candidateId ?? null;
                const kind = mesh?.userData?.candidateKind ?? 'endpoint';
                const selected = candidateId && selectedCandidates.has(candidateId);
                const hovered = candidateId && candidateId === hoverCandidateId;
                const base = kind === 'corner' ? this._materials.junctionCandidateCorner : this._materials.junctionCandidateEndpoint;
                mesh.material = hovered ? this._materials.junctionCandidateHover : (selected ? this._materials.junctionCandidateSelected : base);
                const scale = selected ? 1.25 : (hovered ? 1.15 : 1);
                mesh.scale.setScalar(scale);
                mesh.visible = true;
            }
        }

        this._rebuildSelectionHighlight();
        this._syncApproachMarker();
        this._syncTrafficControlMarker();
        this._syncHoverCube();
    }
}
