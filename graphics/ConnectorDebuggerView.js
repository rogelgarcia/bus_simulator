// graphics/ConnectorDebuggerView.js
import * as THREE from 'three';
import { City } from '../src/city/City.js';
import { createCityConfig } from '../src/city/CityConfig.js';
import { getCityMaterials } from './assets3d/textures/CityMaterials.js';
import { createCurbBuilder } from './assets3d/generators/internal_road/CurbBuilder.js';
import { sampleConnector } from './assets3d/generators/internal_road/ArcConnector.js';
import { solveConnectorPath, CONNECTOR_PATH_TYPES } from '../src/geometry/ConnectorPathSolver.js';
import { CURB_COLOR_PALETTE } from './assets3d/generators/GeneratorParams.js';
import { ConnectorDebugPanel } from './gui/ConnectorDebugPanel.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const TAU = Math.PI * 2;
const CANDIDATE_TYPES = CONNECTOR_PATH_TYPES;

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

function wrapAngleLocal(a) {
    a = a % TAU;
    if (a < 0) a += TAU;
    return a;
}

function curbArcSpan(arc) {
    const dir = arc.turnDir === 'L' ? 1 : -1;
    const worldStart = arc.startAngle;
    const worldEnd = worldStart + dir * arc.deltaAngle;
    const start = wrapAngleLocal(-worldStart);
    const end = wrapAngleLocal(-worldEnd);
    if (arc.turnDir === 'L') return { startAng: end, spanAng: arc.deltaAngle };
    return { startAng: start, spanAng: arc.deltaAngle };
}

function createDebugCitySpec(config) {
    const w = config.map.width;
    const h = config.map.height;
    return {
        version: 1,
        seed: config.seed,
        width: w,
        height: h,
        tileSize: config.map.tileSize,
        origin: config.map.origin,
        roads: []
    };
}

export class ConnectorDebuggerView {
    constructor(engine) {
        this.engine = engine;
        this.canvas = engine.canvas;

        this.city = null;
        this.group = null;
        this.panel = null;

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
        this._curbGeo = null;
        this._markerGeo = null;
        this._markerMat = null;
        this._markerRingGeo = null;
        this._markerRingMat = null;
        this._markerDotGeo = null;
        this._markerDotMat = null;
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
        this._connector = null;
        this._minStraight = 0.05;
        this._enableConnectorMesh = false;
        this._lastPayload = null;
        this._connectorBoxGeo = null;

        this._onPointerMove = (e) => this._handlePointerMove(e);
        this._onPointerDown = (e) => this._handlePointerDown(e);
        this._onPointerUp = (e) => this._handlePointerUp(e);
        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onKeyUp = (e) => this._handleKeyUp(e);
    }

    enter() {
        this._setupCity();
        this._setupCamera();
        this._setupSceneObjects();
        this._setupPanel();
        this._attachEvents();
        this._lastInteractionTime = performance.now();
        this._updateMarkers();
        this._updateConnector();
    }

    exit() {
        this._detachEvents();
        this.panel?.destroy();
        this.panel = null;
        if (this.group) this.group.removeFromParent();
        this.group = null;
        this._connectorMesh = null;
        this._createdCurbGroup = null;
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
        this.city?.update(this.engine);
        this._updateCamera(dt);
        const now = performance.now();
        const wasRotating = this._wasRotating;
        const wasInteracting = this._wasDragging || this._wasRotating;
        this._updateRotation(dt);
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
                this._hardResetDebugLines();
                this._pendingHardReset = false;
            }
        } else if (this._pendingHardReset) {
            this._hardResetDebugLines();
            this._pendingHardReset = false;
        }
        this._updateConnector();
        this._updateMarkers();
        this._syncLineResolution();
        if (interacting && this._connectorMesh) this._clearConnectorMesh();
        if (!interacting && now - this._lastInteractionTime >= this._buildDelayMs) {
            if (!this._connectorMesh && this._connector && this._enableConnectorMesh) {
                this._buildConnectorMesh(this._connector);
            }
        }
        this._wasRotating = this._isRotating;
        this._wasDragging = this._isDragging;
    }

    _setupCity() {
        const baseConfig = createCityConfig();
        const tileSize = baseConfig.map.tileSize;
        const debugConfig = createCityConfig({
            size: tileSize * 3,
            tileMeters: baseConfig.tileMeters,
            mapTileSize: tileSize,
            seed: 'connector-debug'
        });
        const mapSpec = createDebugCitySpec(debugConfig);
        this.city = new City({
            size: debugConfig.size,
            tileMeters: debugConfig.tileMeters,
            mapTileSize: debugConfig.map.tileSize,
            seed: debugConfig.seed,
            mapSpec
        });
        this.city.attach(this.engine);
        this._tileSize = debugConfig.map.tileSize;
    }

    _setupCamera() {
        const cam = this.engine.camera;
        const size = this.city?.config?.size ?? 1;
        const fovRad = cam.fov * Math.PI / 180;
        const aspect = cam.aspect || 1;
        const hFov = 2 * Math.atan(Math.tan(fovRad * 0.5) * aspect);
        const viewHalf = size * 0.45;
        this._zoomMin = Math.max(3, size * 0.03);
        this._zoomMax = size * 1.25;
        const zoomV = viewHalf / Math.tan(fovRad * 0.5);
        const zoomH = viewHalf / Math.tan(hFov * 0.5);
        this._zoom = clamp(Math.max(zoomV, zoomH), this._zoomMin, this._zoomMax);
        this._moveSpeed = size * 0.12;
        this._zoomSpeed = size * 0.6;
        cam.position.set(0, this._zoom, 0);
        cam.rotation.order = 'YXZ';
        cam.rotation.set(-Math.PI * 0.5, 0, 0);
    }

    _setupSceneObjects() {
        this.group = new THREE.Group();
        this.group.name = 'ConnectorDebugger';
        this.engine.scene.add(this.group);

        this._materials = getCityMaterials();
        const roadCfg = this.city?.generatorConfig?.road ?? {};
        const groundCfg = this.city?.generatorConfig?.ground ?? {};
        const roadY = roadCfg.surfaceY ?? 0.02;
        const curbHeight = roadCfg.curb?.height ?? 0.17;
        const curbExtra = roadCfg.curb?.extraHeight ?? 0.0;
        const curbSink = roadCfg.curb?.sink ?? 0.03;
        const groundY = groundCfg.surfaceY ?? (roadY + curbHeight);
        const curbLift = Math.max(curbExtra, Math.min(0.06, curbHeight * 0.25));
        const curbTop = groundY + curbLift;
        const curbBottom = roadY - curbSink;
        const curbH = Math.max(0.04, curbTop - curbBottom);
        const curbY = (curbTop + curbBottom) * 0.5;
        const curbT = roadCfg.curb?.thickness ?? 0.32;

        this._groundY = groundY;
        this._curbY = curbY;
        this._curbH = curbH;
        this._curbT = curbT;
        this._curbBottom = curbBottom;
        this._curbTop = curbTop;
        this._curbArcSegs = roadCfg.curves?.curbArcSegments ?? 24;
        this._turnRadius = roadCfg.curves?.turnRadius ?? 6.8;
        this._radius = this._turnRadius;
        this._lineY = curbTop + 0.04;
        this._markerY = groundY + 0.003;

        this.dragPlane.set(new THREE.Vector3(0, 1, 0), -this._groundY);

        const length = this._tileSize * 0.8;
        this._curbGeo = new THREE.BoxGeometry(length, curbH, curbT);

        const curbMat = this._materials?.curb ?? new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.9, metalness: 0.0 });

        const curbA = new THREE.Mesh(this._curbGeo, curbMat);
        curbA.position.set(-this._tileSize * 0.6, curbY, -this._tileSize * 0.15);
        curbA.rotation.set(0, 0, 0);
        curbA.castShadow = true;
        curbA.receiveShadow = true;

        const curbB = new THREE.Mesh(this._curbGeo, curbMat);
        curbB.position.set(this._tileSize * 0.85, curbY, this._tileSize * 0.45);
        curbB.rotation.set(0, 0, 0);
        curbB.castShadow = true;
        curbB.receiveShadow = true;

        const markerRadius = Math.max(0.35, this._tileSize * 0.07);
        const markerTexture = this._createMarkerTexture(128, {
            center: 'rgba(45, 123, 232, 0.95)',
            mid: 'rgba(120, 200, 255, 0.7)',
            edge: 'rgba(120, 200, 255, 0.0)'
        });
        this._markerGeo = new THREE.CircleGeometry(markerRadius, 40);
        this._markerMat = new THREE.MeshBasicMaterial({
            map: markerTexture,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this._markerRingGeo = new THREE.RingGeometry(markerRadius * 0.9, markerRadius * 1.06, 48);
        this._markerRingMat = new THREE.MeshBasicMaterial({
            color: 0x1d4d8f,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this._markerDotGeo = new THREE.CircleGeometry(markerRadius * 0.16, 24);
        this._markerDotMat = new THREE.MeshBasicMaterial({
            color: 0x1d4d8f,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const markerA = this._buildMarkerGroup();
        const markerB = this._buildMarkerGroup();

        const curbDataA = { id: 'A', mesh: curbA, marker: markerA, endSign: 1, dirSign: 1, length };
        const curbDataB = { id: 'B', mesh: curbB, marker: markerB, endSign: -1, dirSign: 1, length };
        curbA.userData.debugCurb = curbDataA;
        curbB.userData.debugCurb = curbDataB;

        this.curbs = [curbDataA, curbDataB];
        this._curbMeshes = [curbA, curbB];

        this.group.add(curbA);
        this.group.add(curbB);
        this.group.add(markerA);
        this.group.add(markerB);

        this._lineGeometry = new LineGeometry();
        this._lineGeometry.setPositions([0, this._lineY, 0, 0, this._lineY, 0]);
        const lineWidth = 6;
        this._lineMaterial = new LineMaterial({
            color: 0x3b82f6,
            linewidth: lineWidth,
            worldUnits: false,
            transparent: true,
            opacity: 1,
            depthTest: false,
            depthWrite: false
        });
        this._syncLineResolution();
        this._line = new Line2(this._lineGeometry, this._lineMaterial);
        this._line.computeLineDistances();
        this._line.visible = false;
        this._line.frustumCulled = false;
        this._line.renderOrder = 7;
        this.group.add(this._line);

        const candidateLineWidth = Math.max(1, lineWidth * 0.35);
        const candidateCount = this._candidateTypes.length;
        for (let i = 0; i < candidateCount; i++) {
            const geo = new LineGeometry();
            geo.setPositions([0, this._lineY, 0, 0, this._lineY, 0]);
            const mat = new LineMaterial({
                color: 0xef4444,
                linewidth: candidateLineWidth,
                worldUnits: false,
                transparent: true,
                opacity: 1,
                depthTest: false,
                depthWrite: false
            });
            mat.resolution.set(this._lineResolution.x, this._lineResolution.y);
            const line = new Line2(geo, mat);
            line.computeLineDistances();
            line.visible = false;
            line.frustumCulled = false;
            line.renderOrder = 6;
            this.group.add(line);
            this._candidateLines.push({ line, geo, mat });
            this._candidateMaterials.push(mat);
        }

        const circleWidth = Math.max(1, lineWidth * 0.45);
        const circleCount = 4;
        for (let i = 0; i < circleCount; i++) {
            const geo = new LineGeometry();
            geo.setPositions([0, this._markerY, 0, 0, this._markerY, 0]);
            const baseColor = i < 2 ? 0x15803d : 0x8b5cf6;
            const mat = new LineMaterial({
                color: baseColor,
                linewidth: circleWidth,
                worldUnits: false,
                transparent: true,
                opacity: 0.55
            });
            mat.resolution.set(this._lineResolution.x, this._lineResolution.y);
            const line = new Line2(geo, mat);
            line.computeLineDistances();
            line.visible = false;
            line.frustumCulled = false;
            line.renderOrder = 2;
            this.group.add(line);
            this._circleLines.push({ line, geo, mat, baseColor });
            this._circleMaterials.push(mat);
        }

        const arrowLineWidth = Math.max(1, lineWidth * 0.3);
        this._arrowConeGeo = new THREE.ConeGeometry(markerRadius * 0.16, markerRadius * 0.4, 16, 1);
        for (let i = 0; i < 2; i++) {
            const geo = new LineGeometry();
            geo.setPositions([0, this._markerY, 0, 0, this._markerY, 0]);
            const mat = new LineMaterial({
                color: 0x000000,
                linewidth: arrowLineWidth,
                worldUnits: false,
                transparent: true,
                opacity: 0.95,
                depthTest: false,
                depthWrite: false
            });
            mat.resolution.set(this._lineResolution.x, this._lineResolution.y);
            const line = new Line2(geo, mat);
            line.computeLineDistances();
            line.visible = false;
            line.frustumCulled = false;
            line.renderOrder = 8;
            const coneMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const cone = new THREE.Mesh(this._arrowConeGeo, coneMat);
            cone.visible = false;
            cone.renderOrder = 6;
            this.group.add(line);
            this.group.add(cone);
            this._arrowLines.push({ line, geo, cone });
            this._arrowMaterials.push(mat);
        }
    }

    _setupPanel() {
        this.panel = new ConnectorDebugPanel({
            radius: this._radius,
            holdRotate: this._rotationModeHold,
            lineVisibility: { ...this._lineVisibility },
            displayEnabled: this._displayDebug,
            autoSelect: this._autoSelectLine,
            pathTypes: this._candidateTypes.slice(),
            onHoldRotateChange: (holdRotate) => {
                this._rotationModeHold = !!holdRotate;
                this._markInteraction();
            },
            onLineVisibilityChange: (visibility) => {
                if (this._autoSelectLine) return;
                this._lineVisibility = { ...this._lineVisibility, ...visibility };
                this._manualLineVisibility = { ...this._lineVisibility };
            },
            onAutoSelectChange: (autoSelect) => {
                this._setAutoSelectLine(autoSelect);
            },
            onDisplayChange: (enabled) => {
                this._displayDebug = !!enabled;
                if (!this._displayDebug) this._hideDebugLines();
            },
            onRadiusChange: (radius) => {
                if (!Number.isFinite(radius)) return;
                this._radius = Math.max(0.1, radius);
                this._markInteraction();
                this._requestHardReset();
            },
            onCopy: () => this._copyPayload(),
            onCreateCurbs: () => this._createCurbs(),
            onRemoveCurbs: () => this._removeCreatedCurbs()
        });
        this.panel.show();
    }

    _attachEvents() {
        this.canvas?.addEventListener('pointerdown', this._onPointerDown);
        window.addEventListener('pointermove', this._onPointerMove, { passive: true });
        window.addEventListener('pointerup', this._onPointerUp, { passive: true });
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        window.addEventListener('keyup', this._onKeyUp, { passive: false });
    }

    _detachEvents() {
        this.canvas?.removeEventListener('pointerdown', this._onPointerDown);
        window.removeEventListener('pointermove', this._onPointerMove);
        window.removeEventListener('pointerup', this._onPointerUp);
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
    }

    _handlePointerMove(e) {
        if (this.panel?.root?.contains(e.target)) {
            this._hoveredCurb = null;
            return;
        }
        this._setPointerFromEvent(e);
        if (this._isDragging && this._activeCurb) {
            const hit = this._intersectGround();
            if (hit) {
                const nextX = hit.x + this._dragOffset.x;
                const nextZ = hit.z + this._dragOffset.z;
                const pos = this._activeCurb.mesh.position;
                if (Math.abs(pos.x - nextX) > 1e-6 || Math.abs(pos.z - nextZ) > 1e-6) {
                    this._activeCurb.mesh.position.set(nextX, this._curbY, nextZ);
                    this._lastDragMoveTime = performance.now();
                    this._dragIdleReset = false;
                    this._markInteraction();
                }
            }
        }
        this._updateHover();
    }

    _handlePointerDown(e) {
        if (e.button !== 0) return;
        if (this.panel?.root?.contains(e.target)) return;
        this._setPointerFromEvent(e);
        const pick = this._pickCurb();
        if (!pick) return;
        this._activeCurb = pick;
        this._isDragging = true;
        this._lastDragMoveTime = performance.now();
        this._dragIdleReset = false;
        const hit = this._intersectGround();
        if (hit) {
            this._dragOffset.set(
                pick.mesh.position.x - hit.x,
                0,
                pick.mesh.position.z - hit.z
            );
        }
        this._markInteraction();
    }

    _handlePointerUp() {
        if (!this._isDragging) return;
        this._isDragging = false;
        this._activeCurb = null;
        this._dragOffset.set(0, 0, 0);
        this._lastInteractionTime = performance.now();
        this._requestHardReset();
    }

    _setAutoSelectLine(autoSelect) {
        this._autoSelectLine = !!autoSelect;
        if (this._autoSelectLine) {
            this._manualLineVisibility = { ...this._lineVisibility };
            this._applyAutoSelectLine(this._connector?.type ?? null);
            return;
        }
        if (this._manualLineVisibility) {
            this._lineVisibility = { ...this._manualLineVisibility };
            this.panel?.setLineVisibility(this._lineVisibility);
        }
    }

    _applyAutoSelectLine(selectedType) {
        if (!this._autoSelectLine) return;
        const visibility = {};
        for (const type of this._candidateTypes) {
            visibility[type] = type === selectedType;
        }
        if (!this._lineVisibilityEquals(visibility)) {
            this._lineVisibility = visibility;
            this.panel?.setLineVisibility(this._lineVisibility);
        }
    }

    _lineVisibilityEquals(next) {
        for (const type of this._candidateTypes) {
            if (!!next[type] !== !!this._lineVisibility[type]) return false;
        }
        return true;
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

    _hardResetDebugLines() {
        if (this._line) {
            if (this._lineGeometry) this._lineGeometry.dispose();
            const geo = new LineGeometry();
            geo.setPositions([0, this._lineY, 0, 0, this._lineY, 0]);
            this._line.geometry = geo;
            this._lineGeometry = geo;
            this._line.computeLineDistances();
        }
        for (const entry of this._candidateLines) {
            if (entry.geo) entry.geo.dispose();
            const geo = new LineGeometry();
            geo.setPositions([0, this._lineY, 0, 0, this._lineY, 0]);
            entry.line.geometry = geo;
            entry.geo = geo;
            entry.line.computeLineDistances();
        }
        for (const entry of this._circleLines) {
            if (entry.geo) entry.geo.dispose();
            const geo = new LineGeometry();
            geo.setPositions([0, this._markerY, 0, 0, this._markerY, 0]);
            entry.line.geometry = geo;
            entry.geo = geo;
            entry.line.computeLineDistances();
        }
        for (const entry of this._arrowLines) {
            if (entry.geo) entry.geo.dispose();
            const geo = new LineGeometry();
            geo.setPositions([0, this._markerY, 0, 0, this._markerY, 0]);
            entry.line.geometry = geo;
            entry.geo = geo;
            entry.line.computeLineDistances();
        }
        this._syncLineResolution();
    }

    _hideDebugLines() {
        if (this._line) this._line.visible = false;
        for (const entry of this._candidateLines) entry.line.visible = false;
        for (const entry of this._circleLines) entry.line.visible = false;
        for (const entry of this._arrowLines) {
            entry.line.visible = false;
            entry.cone.visible = false;
        }
    }

    _requestHardReset() {
        this._pendingHardReset = true;
    }

    _handleKeyDown(e) {
        const tag = e.target?.tagName?.toLowerCase?.();
        if (tag === 'input' || tag === 'textarea') return;
        const code = e.code;
        if (code in this._keys) {
            e.preventDefault();
            this._keys[code] = true;
        }
        if (!this._rotationModeHold && this._hoveredCurb && (code === 'KeyQ' || code === 'KeyW')) {
            e.preventDefault();
            const dir = code === 'KeyQ' ? 1 : -1;
            this._hoveredCurb.mesh.rotation.y += dir * this._rotationStep;
            this._markInteraction();
            this._requestHardReset();
        }
    }

    _handleKeyUp(e) {
        const tag = e.target?.tagName?.toLowerCase?.();
        if (tag === 'input' || tag === 'textarea') return;
        const code = e.code;
        if (code in this._keys) {
            e.preventDefault();
            this._keys[code] = false;
        }
        if (this._rotationModeHold && (code === 'KeyQ' || code === 'KeyW')) {
            this._lastInteractionTime = performance.now();
        }
        if (code === 'KeyQ' || code === 'KeyW') {
            this._requestHardReset();
        }
    }

    _setPointerFromEvent(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        this.pointer.set(x * 2 - 1, -(y * 2 - 1));
    }

    _intersectGround() {
        this.raycaster.setFromCamera(this.pointer, this.engine.camera);
        const hit = new THREE.Vector3();
        const ok = this.raycaster.ray.intersectPlane(this.dragPlane, hit);
        return ok ? hit : null;
    }

    _pickCurb() {
        this.raycaster.setFromCamera(this.pointer, this.engine.camera);
        const hits = this.raycaster.intersectObjects(this._curbMeshes, false);
        if (!hits.length) return null;
        const obj = hits[0].object;
        return obj.userData?.debugCurb ?? null;
    }

    _updateHover() {
        this.raycaster.setFromCamera(this.pointer, this.engine.camera);
        const hits = this.raycaster.intersectObjects(this._curbMeshes, false);
        if (!hits.length) {
            this._hoveredCurb = null;
            return;
        }
        const obj = hits[0].object;
        this._hoveredCurb = obj.userData?.debugCurb ?? null;
    }

    _updateCamera(dt) {
        const cam = this.engine.camera;
        const move = new THREE.Vector3();
        if (this._keys.ArrowUp) move.z -= 1;
        if (this._keys.ArrowDown) move.z += 1;
        if (this._keys.ArrowRight) move.x += 1;
        if (this._keys.ArrowLeft) move.x -= 1;
        if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(this._moveSpeed * dt);
            cam.position.add(move);
        }
        let zoomDir = 0;
        if (this._keys.KeyA && !this._isDragging) zoomDir -= 1;
        if (this._keys.KeyZ) zoomDir += 1;
        if (zoomDir !== 0) {
            this._zoom = clamp(this._zoom + zoomDir * this._zoomSpeed * dt, this._zoomMin, this._zoomMax);
        }
        cam.position.y = this._zoom;
        cam.rotation.order = 'YXZ';
        cam.rotation.set(-Math.PI * 0.5, 0, 0);
    }

    _updateRotation(dt) {
        let dir = 0;
        if (this._rotationModeHold && this._hoveredCurb) {
            if (this._keys.KeyQ) dir += 1;
            if (this._keys.KeyW) dir -= 1;
            if (dir !== 0) {
                this._hoveredCurb.mesh.rotation.y += dir * this._rotationSpeed * dt;
                this._markInteraction();
            }
        }
        this._isRotating = this._rotationModeHold && this._hoveredCurb && dir !== 0;
    }

    _createMarkerTexture(size, colors) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const c = size * 0.5;
        const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
        grad.addColorStop(0, colors.center);
        grad.addColorStop(0.5, colors.mid);
        grad.addColorStop(1, colors.edge);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(c, c, c, 0, TAU);
        ctx.fill();
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        return tex;
    }

    _buildMarkerGroup() {
        const g = new THREE.Group();
        const disc = new THREE.Mesh(this._markerGeo, this._markerMat);
        const ring = new THREE.Mesh(this._markerRingGeo, this._markerRingMat);
        const dot = new THREE.Mesh(this._markerDotGeo, this._markerDotMat);
        disc.rotation.x = -Math.PI / 2;
        ring.rotation.x = -Math.PI / 2;
        dot.rotation.x = -Math.PI / 2;
        disc.renderOrder = 3;
        ring.renderOrder = 4;
        dot.renderOrder = 5;
        g.add(disc);
        g.add(ring);
        g.add(dot);
        return g;
    }

    _getCurbEndPosition(curb) {
        if (!curb) return null;
        curb.mesh.updateMatrixWorld();
        const half = curb.length * 0.5;
        const localPos = new THREE.Vector3(curb.endSign * half, 0, 0);
        const worldPos = curb.mesh.localToWorld(localPos);
        const axis3 = new THREE.Vector3(1, 0, 0).applyQuaternion(curb.mesh.quaternion).normalize();
        const axis2 = new THREE.Vector2(axis3.x, axis3.z);
        if (axis2.lengthSq() > 0) axis2.normalize();
        return { position: worldPos, axis: axis2 };
    }

    _updateMarkers() {
        for (const curb of this.curbs) {
            const end = this._getCurbEndPosition(curb);
            if (!end) continue;
            curb.marker.position.set(end.position.x, this._markerY, end.position.z);
        }
    }

    _selectConnectorInputs() {
        const endA = this._getCurbEndPosition(this.curbs[0]);
        const endB = this._getCurbEndPosition(this.curbs[1]);
        if (!endA || !endB) return { valid: false, error: 'missing-curb' };
        if (endA.axis.lengthSq() < 1e-6 || endB.axis.lengthSq() < 1e-6) {
            return { valid: false, error: 'invalid-direction' };
        }
        const p0 = new THREE.Vector2(endA.position.x, endA.position.z);
        const p1 = new THREE.Vector2(endB.position.x, endB.position.z);
        const axisA = endA.axis.clone().normalize();
        const axisB = endB.axis.clone().normalize();
        const endSignA = this.curbs[0]?.endSign ?? 1;
        const endSignB = this.curbs[1]?.endSign ?? 1;
        const signA = endSignA;
        const signB = -endSignB;
        const dir0 = axisA.clone().multiplyScalar(signA);
        const dir1 = axisB.clone().multiplyScalar(signB);
        const solver = solveConnectorPath({
            start: { position: p0, direction: dir0 },
            end: { position: p1, direction: dir1 },
            radius: this._radius,
            allowFallback: false,
            minStraight: this._minStraight,
            preferS: true,
            includeCandidates: true
        });
        if (Array.isArray(solver.candidateTypes) && solver.candidateTypes.length === this._candidateTypes.length) {
            this._candidateTypes = solver.candidateTypes.slice();
        }
        this._ensureLineVisibilityKeys();
        return {
            valid: solver.ok,
            error: solver.ok ? null : (solver.failure?.code ?? 'no-solution'),
            connector: solver,
            candidatesByType: solver.candidatesByType ?? [],
            candidateTypes: this._candidateTypes,
            p0,
            p1,
            dir0,
            dir1,
            dirSigns: [signA, signB]
        };
    }

    _updateConnector() {
        const inputs = this._selectConnectorInputs();
        const connector = inputs.connector ?? null;
        const candidatesByType = inputs.candidatesByType ?? [];
        const error = inputs.error ?? null;
        this._connector = connector;
        this._applyAutoSelectLine(connector?.type ?? null);
        if (!this._displayDebug) {
            this._hideDebugLines();
            const data = this._buildDebugData(inputs, connector, error);
            this.panel?.setData(data);
            this._lastPayload = this._buildPayload(inputs, connector);
            this._updateCurbButtonState();
            return;
        }
        this._updateTurnCircles(inputs, connector);
        this._updateArrows(inputs);
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
        this._updateLine(points, typeVisible);
        this._updateCandidateLines(inputs, connector, candidatesByType);
        const data = this._buildDebugData(inputs, connector, error);
        this.panel?.setData(data);
        this._lastPayload = this._buildPayload(inputs, connector);
        this._updateCurbButtonState();
    }

    _updateCurbButtonState() {
        const canCreate = !!(this._connector && this._connector.ok);
        const canRemove = !!this._createdCurbGroup;
        this.panel?.setCurbActions({ canCreate, canRemove });
    }

    _updateLine(points, visible) {
        if (!this._line) return;
        if (!this._displayDebug) {
            this._line.visible = false;
            return;
        }
        const positions = [];
        for (const p of points) {
            positions.push(p.x, this._lineY, p.y);
        }
        if (!visible) {
            this._setLinePositions(this._lineGeometry, [0, this._lineY, 0, 0, this._lineY, 0]);
            this._line.visible = false;
        } else if (positions.length >= 6) {
            this._setLinePositions(this._lineGeometry, positions);
            this._line.computeLineDistances();
            this._line.visible = true;
        } else {
            this._setLinePositions(this._lineGeometry, [0, this._lineY, 0, 0, this._lineY, 0]);
            this._line.visible = false;
        }
    }

    _updateCandidateLines(inputs, connector, candidatesByType) {
        if (!this._displayDebug) {
            for (const entry of this._candidateLines) {
                entry.line.visible = false;
            }
            return;
        }
        const chosenType = connector?.type ?? null;
        const redColor = 0xef4444;
        for (let i = 0; i < this._candidateLines.length; i++) {
            const entry = this._candidateLines[i];
            const type = this._candidateTypes[i];
            const isVisible = this._lineVisibility[type] !== false;
            const isChosen = type && chosenType === type;
            const candidate = candidatesByType[i] ?? null;
            if (!candidate || !isVisible || isChosen) {
                this._setLinePositions(entry.geo, [0, this._lineY, 0, 0, this._lineY, 0]);
                entry.line.visible = false;
                continue;
            }
            const sample = sampleConnector(candidate, this._sampleStep);
            let points = sample.points;
            if (points.length >= 2) {
                points = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
            }
            if (points.length < 2) {
                const fallback = [];
                const segments = candidate.segments ?? [];
                const startPoint = segments[0]?.startPoint;
                const endPoint = segments[segments.length - 1]?.endPoint;
                if (startPoint) fallback.push(startPoint.clone());
                else if (inputs.p0) fallback.push(inputs.p0.clone());
                if (endPoint) fallback.push(endPoint.clone());
                else if (inputs.p1) fallback.push(inputs.p1.clone());
                points = fallback.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
            }
            if (points.length >= 2) {
                const segments = candidate.segments ?? [];
                const startPoint = segments[0]?.startPoint;
                const endPoint = segments[segments.length - 1]?.endPoint;
                if (startPoint) points[0] = startPoint.clone();
                else if (inputs.p0) points[0] = inputs.p0.clone();
                if (endPoint) points[points.length - 1] = endPoint.clone();
                else if (inputs.p1) points[points.length - 1] = inputs.p1.clone();
            }
            const positions = [];
            for (const p of points) {
                positions.push(p.x, this._lineY, p.y);
            }
            if (positions.length >= 6) {
                this._setLinePositions(entry.geo, positions);
                entry.line.computeLineDistances();
                entry.line.visible = true;
            } else {
                this._setLinePositions(entry.geo, [0, this._lineY, 0, 0, this._lineY, 0]);
                entry.line.visible = false;
            }
            entry.mat.color.setHex(redColor);
            entry.mat.opacity = 1;
        }
    }

    _syncLineResolution() {
        if (!this._lineMaterial) return;
        const size = this.engine.renderer.getSize(this._lineResolution);
        this._lineMaterial.resolution.set(size.x, size.y);
        for (const mat of this._candidateMaterials) {
            mat.resolution.set(size.x, size.y);
        }
        for (const mat of this._circleMaterials) {
            mat.resolution.set(size.x, size.y);
        }
        for (const mat of this._arrowMaterials) {
            mat.resolution.set(size.x, size.y);
        }
    }

    _updateTurnCircles(inputs, connector) {
        if (!this._circleLines.length) return;
        if (!this._displayDebug) {
            for (const entry of this._circleLines) entry.line.visible = false;
            return;
        }
        const startLeft = connector?.startLeftCircle ?? null;
        const startRight = connector?.startRightCircle ?? null;
        const endLeft = connector?.endLeftCircle ?? null;
        const endRight = connector?.endRightCircle ?? null;
        if (!startLeft || !startRight || !endLeft || !endRight) {
            for (const entry of this._circleLines) entry.line.visible = false;
            return;
        }
        const r = Math.max(0.01, connector?.radius ?? this._radius);
        const centers = [
            new THREE.Vector3(startLeft.center.x, this._markerY, startLeft.center.y),
            new THREE.Vector3(startRight.center.x, this._markerY, startRight.center.y),
            new THREE.Vector3(endLeft.center.x, this._markerY, endLeft.center.y),
            new THREE.Vector3(endRight.center.x, this._markerY, endRight.center.y)
        ];
        const chosen = new Set();
        const segments = connector?.segments ?? [];
        const startTurn = segments[0]?.turnDir ?? null;
        const endTurn = segments[segments.length - 1]?.turnDir ?? null;
        if (startTurn === 'L') chosen.add(0);
        if (startTurn === 'R') chosen.add(1);
        if (endTurn === 'L') chosen.add(2);
        if (endTurn === 'R') chosen.add(3);
        const dashSize = Math.max(0.2, r * 0.08);
        const gapSize = Math.max(0.15, r * 0.06);
        const segs = 64;
        for (let i = 0; i < this._circleLines.length; i++) {
            const entry = this._circleLines[i];
            const center = centers[i];
            const positions = [];
            for (let k = 0; k <= segs; k++) {
                const t = (k / segs) * TAU;
                positions.push(center.x + Math.cos(t) * r, center.y, center.z + Math.sin(t) * r);
            }
            this._setLinePositions(entry.geo, positions);
            entry.line.computeLineDistances();
            const isChosen = chosen.has(i);
            entry.mat.dashed = !isChosen;
            entry.mat.dashSize = dashSize;
            entry.mat.gapSize = gapSize;
            entry.mat.needsUpdate = true;
            entry.line.visible = true;
        }
    }

    _updateArrows(inputs) {
        if (!this._arrowLines.length) return;
        if (!this._displayDebug) {
            for (const entry of this._arrowLines) {
                entry.line.visible = false;
                entry.cone.visible = false;
            }
            return;
        }
        const p0 = inputs?.p0;
        const p1 = inputs?.p1;
        const dir0 = inputs?.dir0;
        const dir1 = inputs?.dir1;
        if (!p0 || !p1 || !dir0 || !dir1) {
            for (const entry of this._arrowLines) {
                entry.line.visible = false;
                entry.cone.visible = false;
            }
            return;
        }
        const arrowY = this._markerY + 0.01;
        const arrowLen = Math.max(0.5, this._radius * 0.35);
        const data = [
            { p: p0, dir: dir0 },
            { p: p1, dir: dir1 }
        ];
        for (let i = 0; i < this._arrowLines.length; i++) {
            const entry = this._arrowLines[i];
            const item = data[i];
            if (!item) continue;
            const dir = item.dir.clone();
            if (dir.lengthSq() < 1e-6) {
                entry.line.visible = false;
                entry.cone.visible = false;
                continue;
            }
            dir.normalize();
            const start = new THREE.Vector3(item.p.x, arrowY, item.p.y);
            const end = start.clone().add(new THREE.Vector3(dir.x, 0, dir.y).multiplyScalar(arrowLen));
            this._setLinePositions(entry.geo, [start.x, start.y, start.z, end.x, end.y, end.z]);
            entry.line.computeLineDistances();
            entry.line.visible = true;
            entry.cone.position.set(end.x, arrowY, end.z);
            const dir3 = new THREE.Vector3(dir.x, 0, dir.y).normalize();
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir3);
            entry.cone.quaternion.copy(q);
            entry.cone.visible = true;
        }
    }

    _setLinePositions(geo, positions) {
        if (!geo) return;
        geo.setPositions(positions);
        const start = geo.attributes?.instanceStart ?? null;
        const end = geo.attributes?.instanceEnd ?? null;
        if (start) start.needsUpdate = true;
        if (end) end.needsUpdate = true;
        if (start?.count !== undefined) geo.instanceCount = start.count;
    }

    _buildDebugData(inputs, connector, error) {
        const p0 = inputs?.p0 ? { x: inputs.p0.x, z: inputs.p0.y } : null;
        const p1 = inputs?.p1 ? { x: inputs.p1.x, z: inputs.p1.y } : null;
        const dir0 = inputs?.dir0 ? { x: inputs.dir0.x, z: inputs.dir0.y } : null;
        const dir1 = inputs?.dir1 ? { x: inputs.dir1.x, z: inputs.dir1.y } : null;

        const segments = (connector?.segments ?? []).map((segment) => {
            if (segment.type === 'ARC') {
                return {
                    type: 'ARC',
                    center: { x: segment.center.x, z: segment.center.y },
                    startAngle: segment.startAngle,
                    deltaAngle: segment.deltaAngle,
                    turnDir: segment.turnDir,
                    length: segment.length
                };
            }
            if (segment.type === 'STRAIGHT') {
                return {
                    type: 'STRAIGHT',
                    start: segment.startPoint ? { x: segment.startPoint.x, z: segment.startPoint.y } : null,
                    end: segment.endPoint ? { x: segment.endPoint.x, z: segment.endPoint.y } : null,
                    length: segment.length
                };
            }
            return null;
        }).filter(Boolean);

        const metrics = connector?.metrics ?? {};

        return {
            p0,
            dir0,
            p1,
            dir1,
            type: connector?.type ?? 'none',
            radius: connector?.radius ?? this._radius,
            segments,
            totalLength: connector?.totalLength ?? 0,
            metrics,
            feasible: !!connector?.ok,
            error: error ?? connector?.failure?.code ?? null
        };
    }

    _buildPayload(inputs, connector) {
        const endSigns = this.curbs.map((curb) => curb.endSign);
        const dirSigns = inputs?.dirSigns ?? this.curbs.map((curb) => curb.dirSign ?? 1);
        const curbTransforms = this.curbs.map((curb, index) => ({
            id: curb.id,
            position: {
                x: curb.mesh.position.x,
                y: curb.mesh.position.y,
                z: curb.mesh.position.z
            },
            rotation: {
                x: curb.mesh.rotation.x,
                y: curb.mesh.rotation.y,
                z: curb.mesh.rotation.z
            },
            length: curb.length,
            endSign: endSigns[index],
            dirSign: dirSigns[index] ?? 1
        }));

        const vec2 = (v) => (v ? { x: v.x, z: v.y } : null);
        const pose = (p) => (p ? { position: vec2(p.position), direction: vec2(p.direction), heading: p.heading } : null);
        const circle = (c) => (c ? { center: vec2(c.center), radius: c.radius } : null);
        const segment = (s) => {
            if (!s) return null;
            if (s.type === 'ARC') {
                return {
                    type: 'ARC',
                    center: vec2(s.center),
                    startPoint: vec2(s.startPoint),
                    endPoint: vec2(s.endPoint),
                    startAngle: s.startAngle,
                    deltaAngle: s.deltaAngle,
                    turnDir: s.turnDir,
                    length: s.length,
                    radius: s.radius
                };
            }
            if (s.type === 'STRAIGHT') {
                return {
                    type: 'STRAIGHT',
                    startPoint: vec2(s.startPoint),
                    endPoint: vec2(s.endPoint),
                    direction: vec2(s.direction),
                    length: s.length
                };
            }
            return null;
        };
        const segments = (list) => (Array.isArray(list) ? list.map(segment).filter(Boolean) : []);
        const candidate = (cand) => cand ? ({
            type: cand.type,
            radius: cand.radius,
            totalLength: cand.totalLength,
            segments: segments(cand.segments)
        }) : null;

        const solverResult = connector ? {
            ok: connector.ok,
            type: connector.type,
            radius: connector.radius,
            totalLength: connector.totalLength,
            segments: segments(connector.segments),
            startLeftCircle: circle(connector.startLeftCircle),
            startRightCircle: circle(connector.startRightCircle),
            endLeftCircle: circle(connector.endLeftCircle),
            endRightCircle: circle(connector.endRightCircle),
            metrics: connector.metrics ?? null,
            failure: connector.failure ?? null,
            radiusPolicy: connector.radiusPolicy ?? null,
            startPose: pose(connector.startPose),
            endPose: pose(connector.endPose),
            endPoseComputed: pose(connector.endPoseComputed),
            candidateTypes: connector.candidateTypes ?? null,
            candidatesByType: Array.isArray(connector.candidatesByType)
                ? connector.candidatesByType.map(candidate)
                : null
        } : null;

        return {
            solverResult,
            curbs: curbTransforms,
            engineConfig: {
                tileSize: this._tileSize,
                road: this.city?.generatorConfig?.road ?? null,
                ground: this.city?.generatorConfig?.ground ?? null,
                solver: {
                    radius: this._radius,
                    minStraight: this._minStraight,
                    allowFallback: false,
                    preferS: true
                },
                rotationMode: this._rotationModeHold ? 'hold' : 'step'
            }
        };
    }

    _copyPayload() {
        if (!this._lastPayload) return;
        const text = JSON.stringify(this._lastPayload, null, 2);
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text);
            return;
        }
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
    }

    _markInteraction() {
        this._lastInteractionTime = performance.now();
        if (this._connectorMesh) this._clearConnectorMesh();
    }

    _clearConnectorMesh() {
        if (!this._connectorMesh) return;
        this._connectorMesh.removeFromParent();
        this._connectorMesh = null;
    }

    _clearCreatedCurbs() {
        if (!this._createdCurbGroup) return;
        this._createdCurbGroup.removeFromParent();
        this._createdCurbGroup = null;
    }

    _createCurbs() {
        if (!this._connector || !this._connector.ok) return;
        if (!Array.isArray(this._connector.segments) || this._connector.segments.length === 0) return;
        this._clearCreatedCurbs();
        const group = this._buildCurbGroup(this._connector, 'ConnectorCurbs');
        if (!group) return;
        this._createdCurbGroup = group;
        this.group.add(group);
        this._updateCurbButtonState();
    }

    _removeCreatedCurbs() {
        this._clearCreatedCurbs();
        this._updateCurbButtonState();
    }

    _addCurbConnector({ curb, key, color, connector, curveSegs }) {
        if (!connector) return;
        const eps = 1e-4;
        const segments = Array.isArray(connector) ? connector : (connector.segments ?? []);
        if (!segments.length) return;
        for (const segment of segments) {
            if (segment.type === 'ARC' && segment.deltaAngle > eps) {
                const span = curbArcSpan(segment);
                curb.addArcSolidKey({
                    key,
                    centerX: segment.center.x,
                    centerZ: segment.center.y,
                    radiusCenter: segment.radius,
                    startAng: span.startAng,
                    spanAng: span.spanAng,
                    curveSegs
                });
            } else if (segment.type === 'STRAIGHT') {
                const start = segment.startPoint;
                const end = segment.endPoint;
                if (!start || !end) continue;
                const s = end.clone().sub(start);
                const len = s.length();
                if (len > eps) {
                    const mid = start.clone().add(end).multiplyScalar(0.5);
                    const dir = segment.direction ? segment.direction.clone() : s.multiplyScalar(1 / len);
                    const ry = Math.atan2(dir.y, dir.x);
                    curb.addBox(mid.x, this._curbY, mid.y, len, this._curbH, this._curbT, ry, color);
                }
            }
        }
    }

    _buildCurbGroup(connector, name) {
        if (!connector) return null;
        const baseMat = this._materials?.curb ?? new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.9, metalness: 0.0 });
        const instancedMat = CURB_COLOR_PALETTE.instancedMaterial(baseMat, 'curb');
        this._connectorBoxGeo ??= new THREE.BoxGeometry(1, 1, 1);
        const curb = createCurbBuilder({
            boxGeo: this._connectorBoxGeo,
            instancedMaterial: instancedMat,
            baseMaterial: baseMat,
            palette: CURB_COLOR_PALETTE,
            capacity: 32,
            curbT: this._curbT,
            curbH: this._curbH,
            curbBottom: this._curbBottom,
            name: `${name}Blocks`
        });
        const key = CURB_COLOR_PALETTE.key('connector', 'all');
        const color = CURB_COLOR_PALETTE.instanceColor('curb') ?? 0xffffff;
        const curveSegs = Math.max(12, this._curbArcSegs * 2);
        this._addCurbConnector({ curb, key, color, connector, curveSegs });
        curb.finalize();
        const group = new THREE.Group();
        group.name = name;
        group.add(curb.mesh);
        for (const m of curb.buildCurveMeshes()) group.add(m);
        return group;
    }

    _buildConnectorMesh(connector) {
        if (!connector) return;
        this._clearConnectorMesh();
        const group = this._buildCurbGroup(connector, 'ConnectorCurb');
        if (!group) return;
        this._connectorMesh = group;
        this.group.add(group);
    }
}
