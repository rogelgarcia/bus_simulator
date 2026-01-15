// src/graphics/gui/connector_debugger/ConnectorDebuggerView.js
// Orchestrates the connector debugger screen and its 3D interactions.
import * as THREE from 'three';
import { CONNECTOR_PATH_TYPES } from '../../../app/geometry/ConnectorPathSolver.js';
import { sampleConnector } from '../../../app/geometry/ConnectorSampling.js';
import {
    buildConnectorMesh,
    clearConnectorMesh,
    clearCreatedCurbs,
    hardResetDebugLines,
    hideDebugLines,
    rebuildCurbsIfEnabled,
    selectConnectorInputs,
    setupCity,
    setupSceneObjects,
    syncLineResolution,
    updateArrows,
    updateCandidateLines,
    updateLine,
    updateMarkers,
    updateTurnCircles,
    getCurbEndPosition,
    getMapCenter
} from './ConnectorDebuggerScene.js';
import {
    attachEvents,
    detachEvents,
    handleKeyDown,
    handleKeyUp,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    setupCamera,
    updateCamera,
    updateRotation
} from './ConnectorDebuggerInput.js';
import {
    applyAutoSelectLine,
    buildDebugData,
    buildPayload,
    setupPanel,
    setupShortcutsPanel
} from './ConnectorDebuggerUI.js';
import { ConnectorCameraTour } from './ConnectorCameraTour.js';

const CANDIDATE_TYPES = CONNECTOR_PATH_TYPES;

export class ConnectorDebuggerView {
    constructor(engine) {
        this.engine = engine;
        this.canvas = engine.canvas;

        this.city = null;
        this.group = null;
        this.panel = null;
        this.shortcutsPanel = null;

        this.pointer = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

        this.curbs = [];
        this._curbMeshes = [];
        this._hoveredCurb = null;
        this._activeCurb = null;
        this._dragOffset = new THREE.Vector3();
        this._isDragging = false;
        this._isRotating = false;
        this._wasDragging = false;
        this._wasRotating = false;
        this._lastDragMoveTime = 0;
        this._dragIdleMs = 120;
        this._dragIdleReset = false;
        this._pendingHardReset = false;
        this._hardResetFrame = 0;
        this._hardResetStride = 3;

        this._keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            KeyA: false,
            KeyQ: false,
            KeyW: false,
            KeyZ: false
        };

        this._moveSpeed = 10;
        this._zoomSpeed = 40;
        this._zoom = 0;
        this._zoomMin = 0;
        this._zoomMax = 0;

        this._rotationModeHold = true;
        this._rotationSpeed = Math.PI / 2;
        this._rotationStep = Math.PI / 90;

        this._buildDelayMs = 1000;
        this._lastInteractionTime = 0;

        this._tileSize = 0;
        this._groundY = 0;
        this._curbY = 0;
        this._curbH = 0;
        this._curbT = 0;
        this._curbBottom = 0;
        this._curbTop = 0;
        this._lineY = 0;
        this._markerY = 0;
        this._curbArcSegs = 24;
        this._turnRadius = 0;
        this._radius = 0;
        this._sampleStep = 0.25;

        this._materials = null;
        this._markerAssets = null;
        this._curbGeo = null;
        this._line = null;
        this._lineGeometry = null;
        this._lineMaterial = null;
        this._lineResolution = new THREE.Vector2();
        this._candidateLines = [];
        this._candidateMaterials = [];
        this._circleLines = [];
        this._circleMaterials = [];
        this._arrowLines = [];
        this._arrowMaterials = [];
        this._arrowConeGeo = null;
        this._candidateTypes = CANDIDATE_TYPES.slice();
        this._lineVisibility = {};
        for (const type of this._candidateTypes) this._lineVisibility[type] = true;
        this._autoSelectLine = false;
        this._manualLineVisibility = { ...this._lineVisibility };
        this._displayDebug = true;
        this._connectorMesh = null;
        this._createdCurbGroup = null;
        this._curbAutoCreate = false;
        this._connector = null;
        this._enableConnectorMesh = false;
        this._lastPayload = null;
        this._connectorBoxGeo = null;
        this._inputEnabled = true;
        this._tourActive = false;
        this._tour = null;

        this._onPointerMove = (e) => handlePointerMove(this, e);
        this._onPointerDown = (e) => handlePointerDown(this, e);
        this._onPointerUp = () => handlePointerUp(this);
        this._onKeyDown = (e) => handleKeyDown(this, e);
        this._onKeyUp = (e) => handleKeyUp(this, e);
    }

    enter() {
        setupCity(this);
        setupCamera(this);
        setupSceneObjects(this);
        setupPanel(this);
        setupShortcutsPanel(this);
        this._setupTour();
        attachEvents(this);
        this._lastInteractionTime = performance.now();
        updateMarkers(this);
        this._updateConnector();
    }

    exit() {
        detachEvents(this);
        this.panel?.destroy();
        this.panel = null;
        this.shortcutsPanel?.destroy();
        this.shortcutsPanel = null;
        this._tour?.stop();
        this._tour = null;
        if (this.group) this.group.removeFromParent();
        this.group = null;
        clearConnectorMesh(this);
        clearCreatedCurbs(this);
        this._curbAutoCreate = false;
        this._tourActive = false;
        this._inputEnabled = true;
        this.curbs = [];
        this._curbMeshes = [];
        this._hoveredCurb = null;
        this._activeCurb = null;
        this._isDragging = false;
        this._isRotating = false;
        this._connector = null;
        this._lastPayload = null;
        this.city?.detach(this.engine);
        this.city = null;
    }

    update(dt) {
        if (this._tourActive) {
            this._tour?.update(dt);
            return;
        }
        const now = performance.now();
        this.city?.update(this.engine);
        updateCamera(this, dt);
        const wasRotating = this._wasRotating;
        const wasInteracting = this._wasDragging || this._wasRotating;
        updateRotation(this, dt);
        const interacting = this._isDragging || this._isRotating;
        if (wasRotating && !this._isRotating) {
            this._requestHardReset();
        }
        if (this._isDragging) {
            if (!this._dragIdleReset && now - this._lastDragMoveTime > this._dragIdleMs) {
                this._requestHardReset();
                this._dragIdleReset = true;
            }
        }
        if (interacting && !wasInteracting) {
            this._hardResetFrame = 0;
        }
        if (interacting) {
            this._hardResetFrame += 1;
            if (this._hardResetFrame % this._hardResetStride === 0) {
                hardResetDebugLines(this);
                this._pendingHardReset = false;
            }
        } else if (this._pendingHardReset) {
            hardResetDebugLines(this);
            this._pendingHardReset = false;
        }
        this._updateConnector();
        if (!interacting) rebuildCurbsIfEnabled(this);
        updateMarkers(this);
        syncLineResolution(this);
        if (interacting && this._connectorMesh) clearConnectorMesh(this);
        if (!interacting && now - this._lastInteractionTime >= this._buildDelayMs) {
            if (!this._connectorMesh && this._connector && this._enableConnectorMesh) {
                buildConnectorMesh(this, this._connector);
            }
        }
        this._wasRotating = this._isRotating;
        this._wasDragging = this._isDragging;
    }

    _setupTour() {
        this._tour = new ConnectorCameraTour({
            engine: this.engine,
            getCurbs: () => this.curbs,
            getCurbEndPosition: (curb) => getCurbEndPosition(this, curb),
            getCenter: () => getMapCenter(this),
            getGroundY: () => this._groundY,
            getZoom: () => this._zoom,
            setZoom: (value) => {
                this._zoom = value;
            },
            onActiveChange: (active) => this._setTourActive(active),
            onFinish: () => {
                this._lastInteractionTime = performance.now();
            }
        });
    }

    _updateConnector() {
        const inputs = selectConnectorInputs(this);
        const connector = inputs.connector ?? null;
        const candidatesByType = inputs.candidatesByType ?? [];
        const error = inputs.error ?? null;
        this._connector = connector;
        applyAutoSelectLine(this, connector?.type ?? null);
        if (!this._displayDebug) {
            hideDebugLines(this);
            const data = buildDebugData(this, inputs, connector, error);
            this.panel?.setData(data);
            this._lastPayload = buildPayload(this, inputs, connector);
            return;
        }
        updateTurnCircles(this, inputs, connector);
        updateArrows(this, inputs);
        const sample = sampleConnector(connector, this._sampleStep);
        let points = sample.points;
        if (points.length >= 2) {
            points = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
        }
        if (connector && points.length < 2) {
            const fallback = [];
            const segments = connector.segments ?? [];
            const startPoint = segments[0]?.startPoint;
            const endPoint = segments[segments.length - 1]?.endPoint;
            if (startPoint) fallback.push(startPoint.clone());
            else if (inputs.p0) fallback.push(inputs.p0.clone());
            if (endPoint) fallback.push(endPoint.clone());
            else if (inputs.p1) fallback.push(inputs.p1.clone());
            points = fallback.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
        }
        if (connector && points.length >= 2) {
            const segments = connector.segments ?? [];
            const startPoint = segments[0]?.startPoint;
            const endPoint = segments[segments.length - 1]?.endPoint;
            if (startPoint) points[0] = startPoint.clone();
            else if (inputs.p0) points[0] = inputs.p0.clone();
            if (endPoint) points[points.length - 1] = endPoint.clone();
            else if (inputs.p1) points[points.length - 1] = inputs.p1.clone();
        }
        const typeVisible = connector?.type ? this._lineVisibility[connector.type] !== false : true;
        updateLine(this, points, typeVisible);
        updateCandidateLines(this, inputs, connector, candidatesByType);
        const data = buildDebugData(this, inputs, connector, error);
        this.panel?.setData(data);
        this._lastPayload = buildPayload(this, inputs, connector);
    }

    _ensureLineVisibilityKeys() {
        let changed = false;
        for (const type of this._candidateTypes) {
            if (!(type in this._lineVisibility)) {
                this._lineVisibility[type] = true;
                changed = true;
            }
            if (!this._manualLineVisibility || !(type in this._manualLineVisibility)) {
                this._manualLineVisibility = { ...(this._manualLineVisibility ?? {}) };
                this._manualLineVisibility[type] = true;
            }
        }
        if (changed && !this._autoSelectLine) {
            this.panel?.setLineVisibility(this._lineVisibility);
        }
    }

    _requestHardReset() {
        this._pendingHardReset = true;
    }

    _markInteraction() {
        this._lastInteractionTime = performance.now();
        if (this._connectorMesh) clearConnectorMesh(this);
        if (this._curbAutoCreate && this._createdCurbGroup) clearCreatedCurbs(this);
    }

    _setTourActive(active) {
        this._tourActive = !!active;
        this._inputEnabled = !this._tourActive;
        this.panel?.setTourActive(this._tourActive);
        this.shortcutsPanel?.setTourActive(this._tourActive);
    }

    _startTour() {
        if (this._tourActive || !this._tour) return;
        if (!this._tour.start()) return;
        this._isDragging = false;
        this._isRotating = false;
        this._hoveredCurb = null;
        this._activeCurb = null;
        for (const key of Object.keys(this._keys)) this._keys[key] = false;
    }
}
