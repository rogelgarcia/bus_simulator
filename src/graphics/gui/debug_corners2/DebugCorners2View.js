// src/graphics/gui/debug_corners2/DebugCorners2View.js
// Orchestrates the Debug Corners 2 scene (two road segments + edge connection).
import * as THREE from 'three';
import { setupScene, disposeScene, syncScene, rebuildConnection } from './DebugCorners2Scene.js';
import {
    attachEvents,
    detachEvents,
    handleKeyDown,
    handleKeyUp,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    setupCamera,
    updateCamera,
    updateRotation
} from './DebugCorners2Input.js';
import { setupPanels, destroyPanels, syncPanels } from './DebugCorners2UI.js';

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function clampInt(v, lo, hi) {
    return Math.max(lo, Math.min(hi, Number(v) | 0));
}

export class DebugCorners2View {
    constructor(engine, { uiEnabled = true } = {}) {
        this.engine = engine;
        this.canvas = engine.canvas;

        this.group = null;

        this.pointer = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.hoverPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

        this._origin = { x: 0, z: 0 };
        this._tileSize = 24;
        this._pivot = new THREE.Vector3(0, 0, 0);

        this._roadY = 0.02;
        this._laneWidth = 4.8;
        this._shoulder = 0.525;
        this._segmentLen = 60;
        this._filletRadius = 6;
        this._arcSegments = 32;

        this._roads = [
            { key: 'A', lanes: 4, yaw: 0, targetEdge: 'left' },
            { key: 'B', lanes: 4, yaw: Math.PI / 2, targetEdge: 'left' }
        ];
        this._roadsByKey = new Map(this._roads.map((r) => [r.key, r]));

        this._renderAsphalt = true;
        this._renderEdges = true;
        this._renderCenterline = true;
        this._showConnectingPoint = false;

        this._hoveredRoadKey = null;
        this._activeRoadKey = null;
        this._dragOffset = new THREE.Vector3();
        this._isDraggingRoad = false;
        this._isDraggingCamera = false;
        this._cameraDragPointerId = null;
        this._cameraDragStartWorld = new THREE.Vector3();
        this._cameraDragStartCam = new THREE.Vector3();

        this._keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            KeyA: false,
            KeyZ: false,
            KeyQ: false,
            KeyW: false
        };

        this._zoom = 0;
        this._zoomMin = 0;
        this._zoomMax = 0;
        this._moveSpeed = 10;
        this._zoomSpeed = 40;
        this._rotationSpeed = Math.PI / 2;

        this._uiEnabled = uiEnabled !== false;
        this.optionsPanel = null;
        this.legendPanel = null;
        this.telemetryPanel = null;

        this._lastInteractionTime = 0;
        this._rebuildDelayMs = 90;
        this._needsRebuild = true;
        this._telemetry = {};

        this._onPointerMove = (e) => handlePointerMove(this, e);
        this._onPointerDown = (e) => handlePointerDown(this, e);
        this._onPointerUp = (e) => handlePointerUp(this, e);
        this._onWheel = (e) => handleWheel(this, e);
        this._onKeyDown = (e) => handleKeyDown(this, e);
        this._onKeyUp = (e) => handleKeyUp(this, e);
    }

    enter() {
        setupCamera(this);
        setupScene(this);
        if (this._uiEnabled) setupPanels(this);
        attachEvents(this);
        this._markInteraction();
        syncScene(this);
        rebuildConnection(this);
        syncPanels(this);
    }

    exit() {
        detachEvents(this);
        destroyPanels(this);
        disposeScene(this);
        this._roadsByKey.clear();
        this._hoveredRoadKey = null;
        this._activeRoadKey = null;
    }

    update(dt) {
        updateCamera(this, dt);
        updateRotation(this, dt);
        this._syncLineResolution();
        syncScene(this);

        const now = performance.now();
        if (!this._isDraggingRoad && !this._isDraggingCamera && now - this._lastInteractionTime >= this._rebuildDelayMs) {
            if (this._needsRebuild) {
                rebuildConnection(this);
                this._needsRebuild = false;
            }
        } else {
            this._needsRebuild = true;
        }

        syncPanels(this);
    }

    setRoadConfig(key, { lanes = null, yaw = null, targetEdge = null } = {}) {
        const road = this._roadsByKey.get(key) ?? null;
        if (!road) return;

        if (Number.isFinite(lanes)) road.lanes = clampInt(lanes, 1, 20);
        if (Number.isFinite(yaw)) road.yaw = yaw;
        if (targetEdge === 'left' || targetEdge === 'right') road.targetEdge = targetEdge;

        this._markInteraction();
        this._needsRebuild = true;
    }

    setDebugOptions({
        renderAsphalt = null,
        renderEdges = null,
        renderCenterline = null,
        showConnectingPoint = null
    } = {}) {
        if (renderAsphalt !== null) this._renderAsphalt = !!renderAsphalt;
        if (renderEdges !== null) this._renderEdges = !!renderEdges;
        if (renderCenterline !== null) this._renderCenterline = !!renderCenterline;
        if (showConnectingPoint !== null) this._showConnectingPoint = !!showConnectingPoint;
        this._markInteraction();
        this._needsRebuild = true;
    }

    setFilletRadius(value) {
        const r = Number(value) || 0;
        this._filletRadius = clamp(r, 0, 50);
        this._markInteraction();
        this._needsRebuild = true;
    }

    getTelemetry() {
        return this._telemetry ?? {};
    }

    getDebugOptions() {
        return {
            renderAsphalt: !!this._renderAsphalt,
            renderEdges: !!this._renderEdges,
            renderCenterline: !!this._renderCenterline,
            showConnectingPoint: !!this._showConnectingPoint
        };
    }

    forceRebuild() {
        rebuildConnection(this);
        syncScene(this);
        this._needsRebuild = false;
        syncPanels(this);
    }

    _markInteraction() {
        this._lastInteractionTime = performance.now();
    }

    _syncLineResolution() {
        const renderer = this.engine?.renderer ?? null;
        if (!renderer) return;
        const lines = this._lines ?? null;
        if (!lines) return;
        const size = renderer.getSize(new THREE.Vector2());
        for (const entry of Object.values(lines)) {
            entry?.mat?.resolution?.set?.(size.x, size.y);
        }
    }
}
