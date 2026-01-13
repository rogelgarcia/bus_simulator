// src/graphics/gui/road_debugger/RoadDebuggerView.js
// Orchestrates the Road Debugger scene (authoring, debug rendering, camera controls, UI).
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createCityConfig } from '../../../app/city/CityConfig.js';
import { rebuildRoadDebuggerPipeline } from '../../../app/road_debugger/RoadDebuggerPipeline.js';
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

function baseColorForKind(kind) {
    switch (kind) {
        case 'centerline': return 0xe5e7eb;
        case 'forward_centerline':
        case 'backward_centerline': return 0x5eead4;
        case 'lane_edge_left':
        case 'lane_edge_right': return 0xfbbf24;
        case 'asphalt_edge_left':
        case 'asphalt_edge_right': return 0xfb7185;
        case 'trim_removed_interval': return 0xf87171;
        default: return 0x94a3b8;
    }
}

function baseLineWidthForKind(kind) {
    switch (kind) {
        case 'asphalt_edge_left':
        case 'asphalt_edge_right': return 4;
        case 'centerline': return 3;
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
        default: return 0.82;
    }
}

function baseLineRenderOrderForKind(kind) {
    switch (kind) {
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

        this._trimThresholdFactor = 0.1;
        this._trimDebug = {
            rawSegments: false,
            strips: false,
            overlaps: false,
            intervals: false,
            keptPieces: false,
            droppedPieces: false,
            highlight: false
        };

        this._snapEnabled = true;
        this._snapHighlightMesh = null;
        this._snapHighlightGeo = null;

        this._draftFirstTileMarkerMesh = null;
        this._draftFirstTileMarkerGeo = null;

        this._roads = [];
        this._draft = null;
        this._roadCounter = 1;
        this._pointCounter = 1;

        this._undoStack = [];
        this._redoStack = [];
        this._undoMax = 64;

        this._hover = { roadId: null, segmentId: null, pointId: null, pieceId: null };
        this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null };
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
        this._markingLines = [];
        this._arrowMeshes = [];
        this._controlPointMeshes = [];
        this._segmentPickMeshes = [];
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
            snapHighlight: new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.26, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            draftFirstTileMarker: new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            asphaltBase: new THREE.MeshBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            markingLine: new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.82, depthTest: false, depthWrite: false }),
            arrow: new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            debugRawAsphalt: new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.26, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            debugStrip: new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.24, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            debugOverlap: new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.34, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            debugKeptPiece: new THREE.MeshBasicMaterial({ color: 0x34c759, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            debugDroppedPiece: new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
            highlightObb: new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }),
            highlightAabb: new THREE.LineBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }),
            highlightPiece: new THREE.LineBasicMaterial({ color: 0x34c759, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false })
        };
        this._lineMaterialResolution = new THREE.Vector2(0, 0);
        this._sphereGeo = new THREE.SphereGeometry(0.45, 12, 10);

        this._uiEnabled = uiEnabled !== false;
        this.ui = null;

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

    setTrimThresholdFactor(value) {
        const next = clamp(value, 0, 0.5);
        if (Math.abs((this._trimThresholdFactor ?? 0) - next) < 1e-9) return;
        this._trimThresholdFactor = next;
        this._rebuildPipeline();
    }

    setTrimDebugOptions(opts = {}) {
        const o = opts && typeof opts === 'object' ? opts : {};
        const keys = ['rawSegments', 'strips', 'overlaps', 'intervals', 'keptPieces', 'droppedPieces', 'highlight'];
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
        this._pushUndoSnapshot();
        const id = `road_${this._roadCounter++}`;
        this._draft = { id, name: `Road ${this._roadCounter - 1}`, lanesF: 1, lanesB: 1, visible: true, points: [] };
        this._selection = { type: 'road', roadId: id, segmentId: null, pointId: null, pieceId: null };
        this._rebuildPipeline();
    }

    cancelRoadDraft() {
        if (!this._draft) return;
        this._pushUndoSnapshot();
        const draftId = this._draft.id;
        this._draft = null;
        if (this._selection.roadId === draftId) this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null };
        this._rebuildPipeline();
    }

    finishRoadDraft() {
        const draft = this._draft;
        if (!draft) return;
        if ((draft.points?.length ?? 0) < 2) return;
        this._pushUndoSnapshot();
        this._roads.push(draft);
        this._draft = null;
        this._selection = { type: 'road', roadId: draft.id, segmentId: null, pointId: null, pieceId: null };
        this._rebuildPipeline();
    }

    addDraftPointByTile(tileX, tileY, { offsetX = 0, offsetY = 0 } = {}) {
        const draft = this._draft;
        if (!draft) return false;

        const tx = clampInt(tileX, 0, Math.max(0, (this._mapWidth ?? 1) - 1));
        const ty = clampInt(tileY, 0, Math.max(0, (this._mapHeight ?? 1) - 1));
        const last = draft.points[draft.points.length - 1] ?? null;
        if (last && last.tileX === tx && last.tileY === ty && Number(last.offsetX) === Number(offsetX) && Number(last.offsetY) === Number(offsetY)) return false;

        this._pushUndoSnapshot();
        const pointId = `pt_${this._pointCounter++}`;
        draft.points.push({
            id: pointId,
            tileX: tx,
            tileY: ty,
            offsetX: Number(offsetX) || 0,
            offsetY: Number(offsetY) || 0,
            tangentFactor: 1
        });

        this._rebuildPipeline();
        return true;
    }

    addDraftPointFromWorld(world) {
        if (!this._draft) return false;
        const hit = world ?? null;
        if (!hit) return false;
        const tileSize = this._tileSize;
        const ox = this._origin.x;
        const oz = this._origin.z;
        const tileX = Math.round((hit.x - ox) / tileSize);
        const tileY = Math.round((hit.z - oz) / tileSize);
        return this.addDraftPointByTile(tileX, tileY);
    }

    setHoverRoad(roadId) {
        const nextRoadId = roadId ?? null;
        if (this._hover.roadId === nextRoadId && !this._hover.segmentId && !this._hover.pointId && !this._hover.pieceId) return;
        this._hover.roadId = nextRoadId;
        this._hover.segmentId = null;
        this._hover.pointId = null;
        this._hover.pieceId = null;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    setHoverSegment(segmentId) {
        const seg = this._derived?.segments?.find?.((s) => s?.id === segmentId) ?? null;
        const nextSegId = seg?.id ?? null;
        const nextRoadId = seg?.roadId ?? null;
        if (this._hover.segmentId === nextSegId && this._hover.roadId === nextRoadId && !this._hover.pointId && !this._hover.pieceId) return;
        this._hover.segmentId = nextSegId;
        this._hover.roadId = nextRoadId;
        this._hover.pointId = null;
        this._hover.pieceId = null;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    clearHover() {
        if (!this._hover.roadId && !this._hover.segmentId && !this._hover.pointId && !this._hover.pieceId) return;
        this._hover.roadId = null;
        this._hover.segmentId = null;
        this._hover.pointId = null;
        this._hover.pieceId = null;
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectRoad(roadId) {
        this._selection = { type: 'road', roadId, segmentId: null, pointId: null, pieceId: null };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectSegment(segmentId) {
        const seg = this._derived?.segments?.find?.((s) => s?.id === segmentId) ?? null;
        if (!seg) return;
        this._selection = { type: 'segment', roadId: seg.roadId, segmentId: seg.id, pointId: null, pieceId: null };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectPoint(roadId, pointId) {
        this._selection = { type: 'point', roadId, segmentId: null, pointId, pieceId: null };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    selectPiece(roadId, segmentId, pieceId) {
        this._selection = { type: 'piece', roadId, segmentId, pointId: null, pieceId };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    clearSelection() {
        this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null };
        this._applyHighlights();
        this.ui?.sync?.();
    }

    setRoadLaneConfig(roadId, { lanesF = null, lanesB = null } = {}) {
        const all = this._getRoadsForPipeline({ includeDraft: true });
        const road = all.find((r) => r?.id === roadId) ?? null;
        if (!road) return;

        const nextF = lanesF !== null ? clampInt(lanesF, 1, 5) : null;
        const nextB = lanesB !== null ? clampInt(lanesB, 1, 5) : null;
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

    handleCanvasClick(hitWorld) {
        if (this._draft) {
            this.addDraftPointFromWorld(hitWorld);
            return;
        }

        const pick = this._pickAtPointer();
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
        cam.up.set(0, 1, 0);
        cam.lookAt(tx, ty, tz);
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
        const schema = {
            version: 1,
            laneWidth: Number(this._laneWidth) || 4.8,
            marginFactor: Number.isFinite(this._marginFactor) ? Number(this._marginFactor) : 0.1,
            snapEnabled: this._snapEnabled !== false,
            roads: this._roads,
            draft: includeDraft ? this._draft : null
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
        this._hover = { roadId: null, segmentId: null, pointId: null, pieceId: null };
        this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null };

        const counters = this._resolveCounters();
        this._roadCounter = counters.roadCounter;
        this._pointCounter = counters.pointCounter;

        this._redoStack = [];
        this._rebuildPipeline();
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

        const x = ox + tileX * tileSize + offsetX;
        const z = oz + tileY * tileSize + offsetY;
        return { tileX, tileY, offsetX, offsetY, x, z };
    }

    _applyPointTileUpdate(roadId, pointId, next, { pushUndo = false } = {}) {
        const found = this._findSchemaPoint(roadId, pointId);
        if (!found) return false;

        const eps = 1e-6;
        const changed =
            (Number(found.point.tileX) || 0) !== (Number(next.tileX) || 0) ||
            (Number(found.point.tileY) || 0) !== (Number(next.tileY) || 0) ||
            Math.abs((Number(found.point.offsetX) || 0) - (Number(next.offsetX) || 0)) > eps ||
            Math.abs((Number(found.point.offsetY) || 0) - (Number(next.offsetY) || 0)) > eps;
        if (!changed) return false;

        if (pushUndo) this._pushUndoSnapshot();
        found.point.tileX = next.tileX;
        found.point.tileY = next.tileY;
        found.point.offsetX = next.offsetX;
        found.point.offsetY = next.offsetY;
        this._rebuildPipeline();
        return true;
    }

    _createSnapshot() {
        return cloneJson({
            roads: this._roads,
            draft: this._draft,
            roadCounter: this._roadCounter,
            pointCounter: this._pointCounter,
            selection: this._selection
        });
    }

    _restoreSnapshot(snapshot) {
        const next = snapshot ?? {};
        this._roads = Array.isArray(next.roads) ? next.roads : [];
        this._draft = next.draft ?? null;
        this._roadCounter = Number.isFinite(Number(next.roadCounter)) ? Number(next.roadCounter) : 1;
        this._pointCounter = Number.isFinite(Number(next.pointCounter)) ? Number(next.pointCounter) : 1;
        const sel = next.selection && typeof next.selection === 'object' ? next.selection : {};
        this._selection = {
            type: sel.type ?? null,
            roadId: sel.roadId ?? null,
            segmentId: sel.segmentId ?? null,
            pointId: sel.pointId ?? null,
            pieceId: sel.pieceId ?? null
        };
        this._hover = { roadId: null, segmentId: null, pointId: null, pieceId: null };
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
            if (!ok) this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null };
        } else if (sel.type === 'point') {
            const road = derived.roads?.find?.((r) => r?.id === sel.roadId) ?? null;
            const ok = !!(road?.points?.some?.((p) => p?.id === sel.pointId));
            if (!ok) this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null };
        } else if (sel.type === 'piece') {
            const seg = derived.segments?.find?.((s) => s?.id === sel.segmentId) ?? null;
            const ok = !!(seg?.keptPieces?.some?.((p) => p?.id === sel.pieceId));
            if (!ok) this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null };
        } else if (sel.type === 'segment') {
            const ok = derived.segments?.some?.((s) => s?.id === sel.segmentId) ?? false;
            if (!ok) this._selection = { type: null, roadId: null, segmentId: null, pointId: null, pieceId: null };
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
        const half = tileSize * 0.5;
        const maxX = Math.max(0, (this._mapWidth ?? 1) - 1);
        const maxY = Math.max(0, (this._mapHeight ?? 1) - 1);

        const normalizePoint = (pt, index) => {
            const id = typeof pt?.id === 'string' && pt.id.trim() ? pt.id.trim() : `pt_${index + 1}`;
            const tileX = clampInt(pt?.tileX ?? 0, 0, maxX);
            const tileY = clampInt(pt?.tileY ?? 0, 0, maxY);
            const offsetX = clamp(pt?.offsetX ?? 0, -half, half);
            const offsetY = clamp(pt?.offsetY ?? 0, -half, half);
            const tangentFactor = clamp(Number.isFinite(Number(pt?.tangentFactor)) ? Number(pt.tangentFactor) : 1, 0, 5);
            return { id, tileX, tileY, offsetX, offsetY, tangentFactor };
        };

        const normalizeRoad = (road, index) => {
            const id = typeof road?.id === 'string' && road.id.trim() ? road.id.trim() : `road_${index + 1}`;
            const name = typeof road?.name === 'string' && road.name.trim() ? road.name.trim() : id;
            const lanesF = clampInt(road?.lanesF ?? 1, 1, 5);
            const lanesB = clampInt(road?.lanesB ?? 1, 1, 5);
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
        return { roads, draft, laneWidth, marginFactor, snapEnabled };
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

    _pickAtPointer() {
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const pointHits = this.raycaster.intersectObjects(this._controlPointMeshes ?? [], false);
        const pointObj = pointHits[0]?.object ?? null;
        if (pointObj?.userData?.roadId && pointObj?.userData?.pointId) {
            return { type: 'point', roadId: pointObj.userData.roadId, pointId: pointObj.userData.pointId };
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
        this.raycaster.setFromCamera(this.pointer, this.camera);

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

        const pointHits = this.raycaster.intersectObjects(this._controlPointMeshes ?? [], false);
        const pointObj = pointHits[0]?.object ?? null;
        if (pointObj?.userData?.roadId) {
            return { type: 'road', roadId: pointObj.userData.roadId };
        }

        return null;
    }

    updateHoverFromPointer() {
        if (this._isDraggingCamera || this._pendingClick || this.isPointDragActive?.()) return;
        const pick = this._pickHoverAtPointer();
        if (pick?.type === 'segment') {
            this.setHoverSegment(pick.segmentId);
            return;
        }
        if (pick?.type === 'piece') {
            this.setHoverSegment(pick.segmentId);
            return;
        }
        if (pick?.type === 'road') {
            this.setHoverRoad(pick.roadId);
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
        this._derived = rebuildRoadDebuggerPipeline({
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
                }
            }
        });

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
        this._markingLines = [];
        this._arrowMeshes = [];
        this._controlPointMeshes = [];
        this._segmentPickMeshes = [];
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
        const makePolygonGeometry = (pts, y) => {
            const points = Array.isArray(pts) ? pts : [];
            if (points.length < 3) return null;
            const triCount = points.length - 2;
            const positions = new Float32Array(triCount * 9);
            const a = points[0];
            for (let i = 0; i < triCount; i++) {
                const b = points[i + 1];
                const c = points[i + 2];
                const base = i * 9;
                positions[base] = Number(a.x) || 0;
                positions[base + 1] = y;
                positions[base + 2] = Number(a.z) || 0;
                positions[base + 3] = Number(b.x) || 0;
                positions[base + 4] = y;
                positions[base + 5] = Number(b.z) || 0;
                positions[base + 6] = Number(c.x) || 0;
                positions[base + 7] = y;
                positions[base + 8] = Number(c.z) || 0;
            }
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
            if (!isRoadVisible(roadId)) continue;

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
            line.userData = { type: 'polyline', roadId, segmentId: prim.segmentId ?? null, kind };
            line.renderOrder = baseLineRenderOrderForKind(kind);
            linesGroup.add(line);
            this._overlayLines.push(line);
        }

        for (const prim of primitives) {
            if (!prim || prim.type !== 'points') continue;
            const pts = Array.isArray(prim.points) ? prim.points : [];
            if (!pts.length) continue;
            const roadId = prim.roadId ?? null;
            if (!isRoadVisible(roadId)) continue;
            const positions = [];
            for (const p of pts) {
                positions.push(Number(p.x) || 0, pointY, Number(p.z) || 0);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const kind = prim.kind ?? 'markers';
            const baseMat = ensureMapEntry(this._materials.pointBase, kind, () => new THREE.PointsMaterial({
                color: baseColorForKind(kind.replace(/_markers$/, '')),
                size: 5,
                sizeAttenuation: false,
                transparent: true,
                opacity: 0.85,
                depthTest: false,
                depthWrite: false
            }));

            const points = new THREE.Points(geo, baseMat);
            points.frustumCulled = false;
            points.userData = { type: 'points', roadId, segmentId: prim.segmentId ?? null, kind };
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
            const id = prim.id ?? `${segmentId ?? 'poly'}__${kind}`;
            if (!isRoadVisible(roadId)) continue;

            if (kind === 'asphalt_piece') {
                const geo = makePolygonGeometry(pts, asphaltY);
                if (!geo) continue;
                const mesh = new THREE.Mesh(geo, this._materials.asphaltBase);
                mesh.userData = { type: 'asphalt_piece', roadId, segmentId, pieceId: id };
                mesh.renderOrder = 0;
                asphaltGroup.add(mesh);
                this._asphaltMeshes.push(mesh);

                const pickGeo = makePolygonGeometry(pts, pickY);
                if (pickGeo) {
                    const pick = new THREE.Mesh(pickGeo, this._materials.pickHidden);
                    pick.userData = { type: 'segment_pick', roadId, segmentId, pieceId: id };
                    pick.renderOrder = 5;
                    pickGroup.add(pick);
                    this._segmentPickMeshes.push(pick);
                }
                continue;
            }

            const mat = (() => {
                if (kind === 'trim_raw_asphalt') return this._materials.debugRawAsphalt;
                if (kind === 'trim_strip') return this._materials.debugStrip;
                if (kind === 'trim_overlap') return this._materials.debugOverlap;
                if (kind === 'trim_kept_piece') return this._materials.debugKeptPiece;
                if (kind === 'trim_dropped_piece') return this._materials.debugDroppedPiece;
                return this._materials.debugStrip;
            })();

            const y = kind === 'trim_overlap'
                ? debugY1
                : (kind === 'trim_kept_piece' || kind === 'trim_dropped_piece')
                    ? debugY2
                    : debugY0;
            const geo = makePolygonGeometry(pts, y);
            if (!geo) continue;
            const mesh = new THREE.Mesh(geo, mat);
            mesh.userData = { type: 'debug_polygon', kind, roadId, segmentId, id };
            mesh.renderOrder = kind === 'trim_overlap'
                ? 1
                : kind === 'trim_kept_piece'
                    ? 2
                    : kind === 'trim_dropped_piece'
                        ? 3
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

        const markingPositions = [];
        const arrowPositions = [];

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
        this._snapHighlightGeo?.dispose?.();
        this._snapHighlightGeo = null;
        this._snapHighlightMesh = null;
        this._draftFirstTileMarkerGeo?.dispose?.();
        this._draftFirstTileMarkerGeo = null;
        this._draftFirstTileMarkerMesh = null;
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
        const hoverRoadId = this._hover.roadId;
        const hoverSegmentId = this._hover.segmentId;
        const hoverPointId = this._hover.pointId;
        const selRoadId = this._selection.type ? this._selection.roadId : null;
        const selSegmentId = (this._selection.type === 'segment' || this._selection.type === 'piece') ? this._selection.segmentId : null;
        const selPointId = this._selection.type === 'point' ? this._selection.pointId : null;

        for (const line of this._overlayLines) {
            const roadId = line?.userData?.roadId ?? null;
            const segmentId = line?.userData?.segmentId ?? null;
            const kind = line?.userData?.kind ?? 'unknown';
            const selected = (!!selSegmentId && segmentId === selSegmentId) || (!!selRoadId && roadId === selRoadId);
            const hovered = !selected && ((!!hoverSegmentId && segmentId === hoverSegmentId) || (!!hoverRoadId && roadId === hoverRoadId));
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

        for (const pts of this._overlayPoints) {
            const roadId = pts?.userData?.roadId ?? null;
            const segmentId = pts?.userData?.segmentId ?? null;
            const kind = pts?.userData?.kind ?? 'markers';
            const selected = (!!selSegmentId && segmentId === selSegmentId) || (!!selRoadId && roadId === selRoadId);
            const hovered = !selected && ((!!hoverSegmentId && segmentId === hoverSegmentId) || (!!hoverRoadId && roadId === hoverRoadId));
            const baseMat = ensureMapEntry(this._materials.pointBase, kind, () => new THREE.PointsMaterial({
                color: baseColorForKind(kind.replace(/_markers$/, '')),
                size: 5,
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
            const selected = (!!selSegmentId && segmentId === selSegmentId) || (!!selRoadId && roadId === selRoadId);
            const hovered = !selected && ((!!hoverSegmentId && segmentId === hoverSegmentId) || (!!hoverRoadId && roadId === hoverRoadId));
            mesh.material = selected ? this._materials.pickSelected : (hovered ? this._materials.pickHover : this._materials.pickHidden);
            mesh.visible = true;
        }

        this._rebuildSelectionHighlight();
    }
}
