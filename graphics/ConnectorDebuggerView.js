// graphics/ConnectorDebuggerView.js
import * as THREE from 'three';
import { City } from '../src/city/City.js';
import { createCityConfig } from '../src/city/CityConfig.js';
import { getCityMaterials } from './assets3d/textures/CityMaterials.js';
import { createCurbBuilder } from './assets3d/generators/internal_road/CurbBuilder.js';
import { solveArcStraightArcConnector, sampleConnector } from './assets3d/generators/internal_road/ArcConnector.js';
import { CURB_COLOR_PALETTE } from './assets3d/generators/GeneratorParams.js';
import { ConnectorDebugPanel } from './gui/ConnectorDebugPanel.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const TAU = Math.PI * 2;

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
            KeyS: false,
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
        this._curbArcSegs = 24;
        this._turnRadius = 0;
        this._radius = 0;
        this._sampleStep = 0.25;

        this._materials = null;
        this._curbGeo = null;
        this._markerGeo = null;
        this._markerMat = null;
        this._line = null;
        this._lineGeometry = null;
        this._lineMaterial = null;
        this._lineResolution = new THREE.Vector2();
        this._connectorMesh = null;
        this._connector = null;
        this._lastPayload = null;
        this._connectorBoxGeo = null;
        this._selectedDirSigns = null;

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
            if (!this._connectorMesh && this._connector) this._buildConnectorMesh(this._connector);
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
        this._markerGeo = new THREE.CircleGeometry(markerRadius, 40);
        this._markerMat = new THREE.MeshBasicMaterial({
            color: 0x3bc9ff,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const markerA = new THREE.Mesh(this._markerGeo, this._markerMat);
        markerA.rotation.x = -Math.PI / 2;
        markerA.position.y = this._groundY + 0.01;
        markerA.renderOrder = 6;

        const markerB = new THREE.Mesh(this._markerGeo, this._markerMat);
        markerB.rotation.x = -Math.PI / 2;
        markerB.position.y = this._groundY + 0.01;
        markerB.renderOrder = 6;

        const curbDataA = { id: 'A', mesh: curbA, marker: markerA, endSign: 1, length };
        const curbDataB = { id: 'B', mesh: curbB, marker: markerB, endSign: -1, length };
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
        this._lineMaterial = new LineMaterial({
            color: 0x3b82f6,
            linewidth: 6,
            worldUnits: false
        });
        this._syncLineResolution();
        this._line = new Line2(this._lineGeometry, this._lineMaterial);
        this._line.computeLineDistances();
        this._line.visible = false;
        this._line.frustumCulled = false;
        this._line.renderOrder = 5;
        this.group.add(this._line);
    }

    _setupPanel() {
        this.panel = new ConnectorDebugPanel({
            radius: this._radius,
            holdRotate: this._rotationModeHold,
            onHoldRotateChange: (holdRotate) => {
                this._rotationModeHold = !!holdRotate;
                this._markInteraction();
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
        if (!this._rotationModeHold && this._hoveredCurb && (code === 'KeyA' || code === 'KeyS')) {
            e.preventDefault();
            const dir = code === 'KeyA' ? -1 : 1;
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
        if (this._rotationModeHold && (code === 'KeyA' || code === 'KeyS')) {
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
        if (this._keys.KeyZ) zoomDir += 1;
        if (this._keys.KeyA && !this._hoveredCurb && !this._isDragging) zoomDir -= 1;
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
            if (this._keys.KeyA) dir -= 1;
            if (this._keys.KeyS) dir += 1;
            if (dir !== 0) {
                this._hoveredCurb.mesh.rotation.y += dir * this._rotationSpeed * dt;
                this._markInteraction();
            }
        }
        this._isRotating = this._rotationModeHold && this._hoveredCurb && dir !== 0;
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

    _getCurbTangentOptions(curb) {
        const end = this._getCurbEndPosition(curb);
        if (!end) return [];
        const options = [];
        for (const sign of [1, -1]) {
            const dir = end.axis.clone().multiplyScalar(sign);
            options.push({ sign, position: end.position, direction: dir });
        }
        return options;
    }

    _updateMarkers() {
        for (const curb of this.curbs) {
            const end = this._getCurbEndPosition(curb);
            if (!end) continue;
            curb.marker.position.set(end.position.x, this._groundY + 0.01, end.position.z);
        }
    }

    _selectConnectorInputs() {
        const endA = this._getCurbEndPosition(this.curbs[0]);
        const endB = this._getCurbEndPosition(this.curbs[1]);
        if (!endA || !endB) return { valid: false, error: 'missing-curb' };
        const optionsA = this._getCurbTangentOptions(this.curbs[0]);
        const optionsB = this._getCurbTangentOptions(this.curbs[1]);
        if (!optionsA.length || !optionsB.length) return { valid: false, error: 'missing-curb' };
        let best = null;
        let bestScore = -Infinity;
        for (const a of optionsA) {
            for (const b of optionsB) {
                if (a.direction.lengthSq() < 1e-6 || b.direction.lengthSq() < 1e-6) continue;
                const p0 = new THREE.Vector2(a.position.x, a.position.z);
                const p1 = new THREE.Vector2(b.position.x, b.position.z);
                const dir0 = a.direction.clone();
                const dir1 = b.direction.clone();
                const connector = solveArcStraightArcConnector({
                    p0,
                    dir0,
                    p1,
                    dir1,
                    R: this._radius,
                    preferS: true,
                    allowFallback: true
                });
                if (!connector) continue;
                const score = connector.score ?? -connector.totalLength;
                if (score > bestScore) {
                    bestScore = score;
                    best = { connector, p0, p1, dir0, dir1, dirSigns: [a.sign, b.sign] };
                }
            }
        }
        if (best) return { valid: true, error: null, ...best };
        const toB = new THREE.Vector2(endB.position.x - endA.position.x, endB.position.z - endA.position.z);
        const toA = new THREE.Vector2(endA.position.x - endB.position.x, endA.position.z - endB.position.z);
        const signA = endA.axis.lengthSq() > 1e-6 ? (endA.axis.dot(toB) >= 0 ? 1 : -1) : 1;
        const signB = endB.axis.lengthSq() > 1e-6 ? (endB.axis.dot(toA) >= 0 ? 1 : -1) : 1;
        const dirA = endA.axis.clone().multiplyScalar(signA);
        const dirB = endB.axis.clone().multiplyScalar(signB);
        return {
            valid: false,
            error: 'no-solution',
            connector: null,
            p0: new THREE.Vector2(endA.position.x, endA.position.z),
            p1: new THREE.Vector2(endB.position.x, endB.position.z),
            dir0: dirA,
            dir1: dirB,
            dirSigns: [signA, signB]
        };
    }

    _updateConnector() {
        const inputs = this._selectConnectorInputs();
        const connector = inputs.connector ?? null;
        const error = inputs.error ?? null;
        this._connector = connector;
        this._selectedDirSigns = inputs.dirSigns ?? null;
        const { points } = sampleConnector(connector, this._sampleStep);
        this._updateLine(points);
        const data = this._buildDebugData(inputs, connector, error);
        this.panel?.setData(data);
        this._lastPayload = this._buildPayload(inputs, connector, data, error);
    }

    _updateLine(points) {
        if (!this._line) return;
        const positions = [];
        for (const p of points) {
            positions.push(p.x, this._lineY, p.y);
        }
        if (positions.length >= 6) {
            this._lineGeometry.setPositions(positions);
            this._line.computeLineDistances();
            this._line.visible = true;
        } else {
            this._lineGeometry.setPositions([0, this._lineY, 0, 0, this._lineY, 0]);
            this._line.visible = false;
        }
    }

    _syncLineResolution() {
        if (!this._lineMaterial) return;
        const size = this.engine.renderer.getSize(this._lineResolution);
        this._lineMaterial.resolution.set(size.x, size.y);
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
        const dirSigns = this._selectedDirSigns ?? [];
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
            dirSign: dirSigns[index] ?? null
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
