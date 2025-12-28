// graphics/ConnectorDebuggerView.js
import * as THREE from 'three';
import { City } from '../src/city/City.js';
import { createCityConfig } from '../src/city/CityConfig.js';
import { getCityMaterials } from './assets3d/textures/CityMaterials.js';
import { createCurbBuilder } from './assets3d/generators/internal_road/CurbBuilder.js';
import { sampleConnector, leftNormal, arcDelta, circleTangents, travelTangent } from './assets3d/generators/internal_road/ArcConnector.js';
import { CURB_COLOR_PALETTE } from './assets3d/generators/GeneratorParams.js';
import { ConnectorDebugPanel } from './gui/ConnectorDebugPanel.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const TAU = Math.PI * 2;
const EPS = 1e-8;
const CANDIDATE_TYPES = ['LSL', 'RSR', 'LSR', 'RSL'];

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

function wrapAngleLocal(a) {
    a = a % TAU;
    if (a < 0) a += TAU;
    return a;
}

function curbArcSpan(arc) {
    const start = wrapAngleLocal(arc.startAngle);
    const dir = arc.turnDir === 'L' ? 1 : -1;
    const end = wrapAngleLocal(start + dir * arc.deltaAngle);
    if (arc.turnDir === 'L') return { startAng: start, spanAng: arc.deltaAngle };
    return { startAng: end, spanAng: arc.deltaAngle };
}

function pointSegDistSq(p, a, b) {
    const ab = b.clone().sub(a);
    const abLenSq = ab.lengthSq();
    if (abLenSq < EPS) return p.distanceToSquared(a);
    const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / abLenSq));
    const proj = a.clone().add(ab.multiplyScalar(t));
    return p.distanceToSquared(proj);
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
        this._lineVisibility = {
            LSL: true,
            RSR: true,
            LSR: true,
            RSL: true
        };
        this._connectorMesh = null;
        this._connector = null;
        this._candidatesByType = [];
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
        this._updateRotation(dt);
        this._updateConnector();
        this._updateMarkers();
        this._syncLineResolution();
        const interacting = this._isDragging || this._isRotating;
        if (interacting && this._connectorMesh) this._clearConnectorMesh();
        const now = performance.now();
        if (!interacting && now - this._lastInteractionTime >= this._buildDelayMs) {
            if (!this._connectorMesh && this._connector && this._enableConnectorMesh) {
                this._buildConnectorMesh(this._connector);
            }
        }
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
        const curbTop = groundY + curbExtra;
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
        curbB.position.set(this._tileSize * 0.6, curbY, this._tileSize * 0.25);
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
            worldUnits: false
        });
        this._syncLineResolution();
        this._line = new Line2(this._lineGeometry, this._lineMaterial);
        this._line.computeLineDistances();
        this._line.visible = false;
        this._line.frustumCulled = false;
        this._line.renderOrder = 5;
        this.group.add(this._line);

        const candidateLineWidth = Math.max(1, lineWidth * 0.35);
        const candidateCount = 4;
        for (let i = 0; i < candidateCount; i++) {
            const geo = new LineGeometry();
            geo.setPositions([0, this._lineY, 0, 0, this._lineY, 0]);
            const mat = new LineMaterial({
                color: 0xef4444,
                linewidth: candidateLineWidth,
                worldUnits: false,
                transparent: false,
                opacity: 1
            });
            mat.resolution.set(this._lineResolution.x, this._lineResolution.y);
            const line = new Line2(geo, mat);
            line.computeLineDistances();
            line.visible = false;
            line.frustumCulled = false;
            line.renderOrder = 4;
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
                opacity: 0.95
            });
            mat.resolution.set(this._lineResolution.x, this._lineResolution.y);
            const line = new Line2(geo, mat);
            line.computeLineDistances();
            line.visible = false;
            line.frustumCulled = false;
            line.renderOrder = 6;
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
            onHoldRotateChange: (holdRotate) => {
                this._rotationModeHold = !!holdRotate;
                this._markInteraction();
            },
            onLineVisibilityChange: (visibility) => {
                this._lineVisibility = { ...this._lineVisibility, ...visibility };
            },
            onRadiusChange: (radius) => {
                if (!Number.isFinite(radius)) return;
                this._radius = Math.max(0.1, radius);
                this._markInteraction();
            },
            onCopy: () => this._copyPayload()
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
                this._activeCurb.mesh.position.set(nextX, this._curbY, nextZ);
                this._markInteraction();
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
        if (this._keys.KeyA && !this._hoveredCurb && !this._isDragging) zoomDir -= 1;
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

    _buildCandidatesForRadius({ p0, dir0, p1, dir1, R, preferS, minStraight }) {
        const d0 = dir0.clone().normalize();
        const d1 = dir1.clone().normalize();
        if (d0.lengthSq() < EPS || d1.lengthSq() < EPS || !(R > EPS)) return [];
        const n0 = leftNormal(d0);
        const n1 = leftNormal(d1);
        const types = preferS ? ['LSR', 'RSL', 'LSL', 'RSR'] : ['LSL', 'RSR', 'LSR', 'RSL'];
        const candidates = [];
        for (const type of types) {
            const turn0 = type[0];
            const turn1 = type[2];
            const c0 = p0.clone().add(n0.clone().multiplyScalar(turn0 === 'L' ? R : -R));
            const c1 = p1.clone().add(n1.clone().multiplyScalar(turn1 === 'L' ? R : -R));
            const internal = turn0 !== turn1;
            const sols = internal ? circleTangents(c0, R, c1, -R) : circleTangents(c0, R, c1, R);
            if (!sols.length) continue;
            for (const { t0, t1 } of sols) {
                const s = t1.clone().sub(t0);
                const lenS = s.length();
                if (!Number.isFinite(lenS) || lenS < EPS) continue;
                const sdir = s.clone().multiplyScalar(1 / lenS);
                const tan0 = travelTangent(c0, t0, turn0);
                const tan1 = travelTangent(c1, t1, turn1);
                const dot0 = tan0.dot(sdir);
                const dot1 = tan1.dot(sdir);
                if (dot0 < 0.1 || dot1 < 0.1) continue;
                const a0s = Math.atan2(p0.y - c0.y, p0.x - c0.x);
                const a0e = Math.atan2(t0.y - c0.y, t0.x - c0.x);
                const a1s = Math.atan2(t1.y - c1.y, t1.x - c1.x);
                const a1e = Math.atan2(p1.y - c1.y, p1.x - c1.x);
                const da0 = arcDelta(a0s, a0e, turn0);
                const da1 = arcDelta(a1s, a1e, turn1);
                const totalLength = da0 * R + lenS + da1 * R;
                const selfIntersecting = (pointSegDistSq(c0, t0, t1) < (R * R * 0.999))
                    || (pointSegDistSq(c1, t0, t1) < (R * R * 0.999));
                let score = -totalLength + (dot0 + dot1) * 0.25;
                if (preferS && internal) score += 0.5;
                if (minStraight > 0 && lenS < minStraight) score -= (minStraight - lenS) / minStraight;
                if (selfIntersecting) score -= 1.0;
                candidates.push({
                    type,
                    R,
                    arc0: {
                        center: c0.clone(),
                        radius: R,
                        startAngle: a0s,
                        deltaAngle: da0,
                        turnDir: turn0,
                        startPoint: p0.clone(),
                        endPoint: t0.clone()
                    },
                    straight: {
                        start: t0.clone(),
                        end: t1.clone(),
                        length: lenS,
                        dir: sdir.clone()
                    },
                    arc1: {
                        center: c1.clone(),
                        radius: R,
                        startAngle: a1s,
                        deltaAngle: da1,
                        turnDir: turn1,
                        startPoint: t1.clone(),
                        endPoint: p1.clone()
                    },
                    totalLength,
                    score,
                    quality: {
                        tangentDot0: dot0,
                        tangentDot1: dot1,
                        straightLength: lenS,
                        selfIntersecting
                    }
                });
            }
        }
        return candidates;
    }

    _generateConnectorCandidates({ p0, dir0, p1, dir1, R, preferS, allowFallback, minStraight }) {
        const radii = [R];
        if (allowFallback && Number.isFinite(R)) {
            radii.push(R * 0.85, R * 0.7, R * 0.55);
        }
        const candidates = [];
        for (const r of radii) {
            const batch = this._buildCandidatesForRadius({ p0, dir0, p1, dir1, R: r, preferS, minStraight });
            for (const cand of batch) candidates.push(cand);
        }
        return candidates;
    }

    _pickBestCandidate(candidates, p0, p1, dir0, dir1) {
        if (!candidates.length) return null;
        const toB = p1.clone().sub(p0);
        const toA = p0.clone().sub(p1);
        const cross0 = dir0.x * toB.y - dir0.y * toB.x;
        const cross1 = dir1.x * toA.y - dir1.y * toA.x;
        const exp0 = Math.abs(cross0) < 1e-6 ? null : (cross0 > 0 ? 'L' : 'R');
        const exp1 = Math.abs(cross1) < 1e-6 ? null : (cross1 > 0 ? 'L' : 'R');
        const matches0 = [];
        const matches1 = [];
        const matchesBoth = [];
        for (const cand of candidates) {
            const m0 = !exp0 || cand.arc0?.turnDir === exp0;
            const m1 = !exp1 || cand.arc1?.turnDir === exp1;
            if (m0 && m1) matchesBoth.push(cand);
            else if (m0) matches0.push(cand);
            else if (m1) matches1.push(cand);
        }
        let pool = null;
        if (matchesBoth.length) {
            pool = matchesBoth;
        } else {
            const abs0 = Math.abs(cross0);
            const abs1 = Math.abs(cross1);
            const preferEnd1 = abs1 >= abs0 - 1e-6;
            if (preferEnd1 && matches1.length) pool = matches1;
            else if (!preferEnd1 && matches0.length) pool = matches0;
            else if (matches1.length) pool = matches1;
            else if (matches0.length) pool = matches0;
        }
        const list = pool ?? candidates;
        let best = null;
        let bestScore = -Infinity;
        for (const cand of list) {
            const score = cand.score ?? -cand.totalLength;
            if (score > bestScore) {
                bestScore = score;
                best = cand;
            }
        }
        return best;
    }

    _pickBestByType(candidates) {
        const byType = new Map();
        for (const cand of candidates) {
            const score = cand.score ?? -cand.totalLength;
            const current = byType.get(cand.type);
            const currentScore = current ? (current.score ?? -current.totalLength) : -Infinity;
            if (!current || score > currentScore) byType.set(cand.type, cand);
        }
        return CANDIDATE_TYPES.map((type) => byType.get(type) ?? null);
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
        const candidates = this._generateConnectorCandidates({
            p0,
            dir0,
            p1,
            dir1,
            R: this._radius,
            preferS: true,
            allowFallback: false,
            minStraight: 0.05
        });
        const connector = this._pickBestCandidate(candidates, p0, p1, dir0, dir1);
        const candidatesByType = this._pickBestByType(candidates);
        if (connector) {
            return {
                valid: true,
                error: null,
                connector,
                candidatesByType,
                p0,
                p1,
                dir0,
                dir1,
                dirSigns: [signA, signB]
            };
        }
        return {
            valid: false,
            error: 'no-solution',
            connector: null,
            candidatesByType: [],
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
        this._candidatesByType = candidatesByType;
        this._updateTurnCircles(inputs, connector);
        this._updateArrows(inputs);
        const sample = sampleConnector(connector, this._sampleStep);
        let points = sample.points;
        if (points.length >= 2) {
            points = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
        }
        if (connector && points.length < 2) {
            const fallback = [];
            if (connector.arc0?.startPoint) fallback.push(connector.arc0.startPoint.clone());
            else if (inputs.p0) fallback.push(inputs.p0.clone());
            if (connector.arc1?.endPoint) fallback.push(connector.arc1.endPoint.clone());
            else if (inputs.p1) fallback.push(inputs.p1.clone());
            points = fallback.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
        }
        if (connector && points.length >= 2) {
            if (connector.arc0?.startPoint) points[0] = connector.arc0.startPoint.clone();
            else if (inputs.p0) points[0] = inputs.p0.clone();
            if (connector.arc1?.endPoint) points[points.length - 1] = connector.arc1.endPoint.clone();
            else if (inputs.p1) points[points.length - 1] = inputs.p1.clone();
        }
        const typeVisible = connector?.type ? this._lineVisibility[connector.type] !== false : true;
        this._updateLine(points, typeVisible);
        this._updateCandidateLines(inputs, connector, candidatesByType);
        const data = this._buildDebugData(inputs, connector, error);
        this.panel?.setData(data);
        this._lastPayload = this._buildPayload(inputs, connector, data, error);
    }

    _updateLine(points, visible) {
        if (!this._line) return;
        const positions = [];
        for (const p of points) {
            positions.push(p.x, this._lineY, p.y);
        }
        if (!visible) {
            this._lineGeometry.setPositions([0, this._lineY, 0, 0, this._lineY, 0]);
            this._line.visible = false;
        } else if (positions.length >= 6) {
            this._lineGeometry.setPositions(positions);
            this._line.computeLineDistances();
            this._line.visible = true;
        } else {
            this._lineGeometry.setPositions([0, this._lineY, 0, 0, this._lineY, 0]);
            this._line.visible = false;
        }
    }

    _updateCandidateLines(inputs, connector, candidatesByType) {
        const chosenType = connector?.type ?? null;
        const redColor = 0xef4444;
        for (let i = 0; i < this._candidateLines.length; i++) {
            const entry = this._candidateLines[i];
            const type = CANDIDATE_TYPES[i];
            const isVisible = this._lineVisibility[type] !== false;
            const isChosen = type && chosenType === type;
            const candidate = candidatesByType[i] ?? null;
            if (!candidate || !isVisible || isChosen) {
                entry.geo.setPositions([0, this._lineY, 0, 0, this._lineY, 0]);
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
                if (candidate.arc0?.startPoint) fallback.push(candidate.arc0.startPoint.clone());
                else if (inputs.p0) fallback.push(inputs.p0.clone());
                if (candidate.arc1?.endPoint) fallback.push(candidate.arc1.endPoint.clone());
                else if (inputs.p1) fallback.push(inputs.p1.clone());
                points = fallback.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
            }
            if (points.length >= 2) {
                if (candidate.arc0?.startPoint) points[0] = candidate.arc0.startPoint.clone();
                else if (inputs.p0) points[0] = inputs.p0.clone();
                if (candidate.arc1?.endPoint) points[points.length - 1] = candidate.arc1.endPoint.clone();
                else if (inputs.p1) points[points.length - 1] = inputs.p1.clone();
            }
            const positions = [];
            for (const p of points) {
                positions.push(p.x, this._lineY, p.y);
            }
            if (positions.length >= 6) {
                entry.geo.setPositions(positions);
                entry.line.computeLineDistances();
                entry.line.visible = true;
            } else {
                entry.geo.setPositions([0, this._lineY, 0, 0, this._lineY, 0]);
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
        const p0 = inputs?.p0;
        const p1 = inputs?.p1;
        const dir0 = inputs?.dir0;
        const dir1 = inputs?.dir1;
        if (!p0 || !p1 || !dir0 || !dir1) {
            for (const entry of this._circleLines) entry.line.visible = false;
            return;
        }
        const r = Math.max(0.01, this._radius);
        const n0 = leftNormal(dir0.clone().normalize());
        const n1 = leftNormal(dir1.clone().normalize());
        const centers = [
            new THREE.Vector3(p0.x + n0.x * r, this._markerY, p0.y + n0.y * r),
            new THREE.Vector3(p0.x - n0.x * r, this._markerY, p0.y - n0.y * r),
            new THREE.Vector3(p1.x + n1.x * r, this._markerY, p1.y + n1.y * r),
            new THREE.Vector3(p1.x - n1.x * r, this._markerY, p1.y - n1.y * r)
        ];
        const chosen = new Set();
        if (connector?.arc0?.turnDir) chosen.add(connector.arc0.turnDir === 'L' ? 0 : 1);
        if (connector?.arc1?.turnDir) chosen.add(connector.arc1.turnDir === 'L' ? 2 : 3);
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
            entry.geo.setPositions(positions);
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
            entry.geo.setPositions([start.x, start.y, start.z, end.x, end.y, end.z]);
            entry.line.computeLineDistances();
            entry.line.visible = true;
            entry.cone.position.set(end.x, arrowY, end.z);
            const dir3 = new THREE.Vector3(dir.x, 0, dir.y).normalize();
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir3);
            entry.cone.quaternion.copy(q);
            entry.cone.visible = true;
        }
    }

    _buildDebugData(inputs, connector, error) {
        const p0 = inputs?.p0 ? { x: inputs.p0.x, z: inputs.p0.y } : null;
        const p1 = inputs?.p1 ? { x: inputs.p1.x, z: inputs.p1.y } : null;
        const dir0 = inputs?.dir0 ? { x: inputs.dir0.x, z: inputs.dir0.y } : null;
        const dir1 = inputs?.dir1 ? { x: inputs.dir1.x, z: inputs.dir1.y } : null;

        const arc0 = connector?.arc0;
        const arc1 = connector?.arc1;
        const straight = connector?.straight;

        const arc0Data = arc0 ? {
            center: { x: arc0.center.x, z: arc0.center.y },
            startAngle: arc0.startAngle,
            deltaAngle: arc0.deltaAngle,
            length: arc0.deltaAngle * arc0.radius
        } : {};

        const arc1Data = arc1 ? {
            center: { x: arc1.center.x, z: arc1.center.y },
            startAngle: arc1.startAngle,
            deltaAngle: arc1.deltaAngle,
            length: arc1.deltaAngle * arc1.radius
        } : {};

        const straightData = straight ? {
            start: straight.start ? { x: straight.start.x, z: straight.start.y } : null,
            end: straight.end ? { x: straight.end.x, z: straight.end.y } : null,
            length: straight.length ?? 0
        } : {};

        const quality = connector?.quality ?? {};

        return {
            p0,
            dir0,
            p1,
            dir1,
            type: connector?.type ?? 'none',
            radius: this._radius,
            arc0: arc0Data,
            straight: straightData,
            arc1: arc1Data,
            totalLength: connector?.totalLength ?? 0,
            quality,
            feasible: !!connector,
            error
        };
    }

    _buildPayload(inputs, connector, data, error) {
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

        return {
            inputs: {
                p0: data.p0,
                dir0: data.dir0,
                p1: data.p1,
                dir1: data.dir1,
                radius: this._radius
            },
            connector: connector ? {
                type: connector.type,
                arc0: data.arc0,
                straight: data.straight,
                arc1: data.arc1,
                totalLength: connector.totalLength,
                quality: connector.quality ?? null
            } : null,
            feasible: data.feasible,
            error,
            curbs: curbTransforms,
            endSigns,
            dirSigns,
            tileSize: this._tileSize,
            radius: this._radius,
            rotationMode: this._rotationModeHold ? 'hold' : 'step'
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

    _addCurbConnector({ curb, key, color, connector, curveSegs }) {
        if (!connector) return;
        const eps = 1e-4;
        const arc0 = connector.arc0;
        const arc1 = connector.arc1;
        const straight = connector.straight;
        if (arc0 && arc0.deltaAngle > eps) {
            const span = curbArcSpan(arc0);
            curb.addArcSolidKey({
                key,
                centerX: arc0.center.x,
                centerZ: arc0.center.y,
                radiusCenter: arc0.radius,
                startAng: span.startAng,
                spanAng: span.spanAng,
                curveSegs
            });
        }
        if (straight?.start && straight?.end) {
            const s = straight.end.clone().sub(straight.start);
            const len = s.length();
            if (len > eps) {
                const mid = straight.start.clone().add(straight.end).multiplyScalar(0.5);
                const dir = s.multiplyScalar(1 / len);
                const ry = Math.atan2(dir.y, dir.x);
                curb.addBox(mid.x, this._curbY, mid.y, len, this._curbH, this._curbT, ry, color);
            }
        }
        if (arc1 && arc1.deltaAngle > eps) {
            const span = curbArcSpan(arc1);
            curb.addArcSolidKey({
                key,
                centerX: arc1.center.x,
                centerZ: arc1.center.y,
                radiusCenter: arc1.radius,
                startAng: span.startAng,
                spanAng: span.spanAng,
                curveSegs
            });
        }
    }

    _buildConnectorMesh(connector) {
        if (!connector) return;
        this._clearConnectorMesh();
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
            name: 'ConnectorCurb'
        });
        const key = CURB_COLOR_PALETTE.key('connector', 'all');
        const color = CURB_COLOR_PALETTE.instanceColor('curb') ?? 0xffffff;
        const curveSegs = Math.max(12, this._curbArcSegs * 2);
        this._addCurbConnector({ curb, key, color, connector, curveSegs });
        curb.finalize();
        const group = new THREE.Group();
        group.name = 'ConnectorCurb';
        group.add(curb.mesh);
        for (const m of curb.buildCurveMeshes()) group.add(m);
        this._connectorMesh = group;
        this.group.add(group);
    }
}
