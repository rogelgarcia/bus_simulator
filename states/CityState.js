// states/CityState.js
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { getSharedCity } from '../src/city/City.js';
import { createCityConfig } from '../src/city/CityConfig.js';
import { CityMap } from '../src/city/CityMap.js';
import { CityDebugPanel } from '../graphics/gui/CityDebugPanel.js';
import { CityDebugsPanel } from '../graphics/gui/CityDebugsPanel.js';
import { CityShortcutsPanel } from '../graphics/gui/CityShortcutsPanel.js';
import { CityPoleInfoPanel } from '../graphics/gui/CityPoleInfoPanel.js';
import { CityConnectorDebugOverlay } from '../graphics/CityConnectorDebugOverlay.js';

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

export class CityState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this.canvas = engine.canvas;

        this.uiWelcome = document.getElementById('ui-welcome');
        this.uiSelect = document.getElementById('ui-select');
        this.uiHudTest = document.getElementById('ui-test');

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
        this._cityOptions.generatorConfig = { render: { roadMode: this._roadRenderMode } };

        this._baseSpec = null;
        this.debugPanel = null;
        this.debugsPanel = null;
        this.shortcutsPanel = null;
        this.poleInfoPanel = null;
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

        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onKeyUp = (e) => this._handleKeyUp(e);
        this._onPointerMove = (e) => this._handlePointerMove(e);
        this._onPointerLeave = () => this._handlePointerLeave();

    }

    enter() {
        document.body.classList.remove('splash-bg');
        if (this.uiSelect) this.uiSelect.classList.add('hidden');
        if (this.uiWelcome) this.uiWelcome.classList.add('hidden');
        if (this.uiHudTest) this.uiHudTest.classList.add('hidden');

        this.engine.clearScene();

        this._roadRenderMode = 'debug';
        const currentGen = this._cityOptions.generatorConfig ?? {};
        this._cityOptions.generatorConfig = {
            ...currentGen,
            render: { ...(currentGen.render ?? {}), roadMode: this._roadRenderMode }
        };

        const config = createCityConfig(this._cityOptions);
        this._baseSpec = CityMap.demoSpec(config);

        this.debugPanel = new CityDebugPanel({
            roads: this._baseSpec.roads,
            onReload: () => this._reloadCity(),
            onHover: (road) => this._updateHighlight(road)
        });
        this.debugPanel.show();

        this.debugsPanel = new CityDebugsPanel({
            connectorDebugEnabled: this._connectorDebugEnabled,
            hoverOutlineEnabled: this._hoverOutlineEnabled,
            collisionDebugEnabled: this._collisionDebugEnabled,
            roadRenderMode: this._roadRenderMode,
            onConnectorDebugToggle: (enabled) => this._setConnectorDebugEnabled(enabled),
            onHoverOutlineToggle: (enabled) => this._setHoverOutlineEnabled(enabled),
            onCollisionDebugToggle: (enabled) => this._setCollisionDebugEnabled(enabled),
            onRoadRenderModeChange: (mode) => this._setRoadRenderMode(mode)
        });
        this.debugsPanel.show();

        this.shortcutsPanel = new CityShortcutsPanel();
        this.shortcutsPanel.show();

        this.poleInfoPanel = new CityPoleInfoPanel();
        this.poleInfoPanel.show();

        this._setCity(this._baseSpec);

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
        this._zoom = clamp(Math.max(zoomV, zoomH), this._zoomMin, this._zoomMax);
        this._moveSpeed = size * 0.12;
        this._zoomSpeed = size * 0.6;

        cam.position.set(0, this._zoom, 0);
        cam.rotation.order = 'YXZ';
        cam.rotation.set(-Math.PI * 0.5, 0, 0);

        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        window.addEventListener('keyup', this._onKeyUp, { passive: false });
        this.canvas?.addEventListener('pointermove', this._onPointerMove);
        this.canvas?.addEventListener('pointerleave', this._onPointerLeave);
    }

    exit() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        this.canvas?.removeEventListener('pointermove', this._onPointerMove);
        this.canvas?.removeEventListener('pointerleave', this._onPointerLeave);

        this.debugPanel?.destroy();
        this.debugPanel = null;
        this.debugsPanel?.destroy();
        this.debugsPanel = null;
        this.shortcutsPanel?.destroy();
        this.shortcutsPanel = null;
        this.poleInfoPanel?.destroy();
        this.poleInfoPanel = null;
        this._baseSpec = null;
        this._clearHighlight();
        this._clearCollisionMarkers();
        this._clearConnectorOverlay();
        this._destroyHoverOutline();

        this.city?.detach(this.engine);
        this.engine.clearScene();
        this.city = null;
    }

    update(dt) {
        const cam = this.engine.camera;

        this.city?.update(this.engine);

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
        if (this._keys.KeyA) zoomDir -= 1;
        if (this._keys.KeyZ) zoomDir += 1;
        if (zoomDir !== 0) {
            this._zoom = clamp(this._zoom + zoomDir * this._zoomSpeed * dt, this._zoomMin, this._zoomMax);
        }

        cam.position.y = this._zoom;
        cam.rotation.order = 'YXZ';
        cam.rotation.set(-Math.PI * 0.5, 0, 0);
    }

    _handleKeyDown(e) {
        const code = e.code;

        if (code in this._keys) {
            e.preventDefault();
            this._keys[code] = true;
            return;
        }

        if (code === 'Escape') {
            e.preventDefault();
            this.sm.go('welcome');
        }
    }

    _handleKeyUp(e) {
        const code = e.code;

        if (code in this._keys) {
            e.preventDefault();
            this._keys[code] = false;
        }
    }

    _setCity(mapSpec) {
        this.city?.detach(this.engine);
        this._clearConnectorOverlay();
        this._clearCollisionMarkers();
        this.engine.clearScene();
        this.engine.context.city = null;
        this.city = getSharedCity(this.engine, { ...this._cityOptions, mapSpec });
        this.city.attach(this.engine);
        this._setupHighlight();
        this._setupConnectorOverlay();
        this._setupCollisionMarkers();
        this._setupHoverOutline();
        this._setPoleInfoData(null);
    }

    _reloadCity() {
        if (!this._baseSpec || !this.debugPanel) return;
        const selected = this.debugPanel.getSelectedRoads();
        const roads = selected.map((road) => ({
            a: [road.a[0], road.a[1]],
            b: [road.b[0], road.b[1]],
            lanesF: road.lanesF,
            lanesB: road.lanesB,
            tag: road.tag
        }));
        const mapSpec = {
            version: this._baseSpec.version,
            seed: this._baseSpec.seed,
            width: this._baseSpec.width,
            height: this._baseSpec.height,
            tileSize: this._baseSpec.tileSize,
            origin: this._baseSpec.origin,
            roads
        };
        this._setCity(mapSpec);
    }

    _setupHighlight() {
        this._clearHighlight();
        const map = this.city?.map;
        if (!map) return;
        this._highlightGeo = new THREE.BufferGeometry();
        this._highlightPos = new Float32Array(18);
        const posAttr = new THREE.BufferAttribute(this._highlightPos, 3);
        posAttr.setUsage(THREE.DynamicDrawUsage);
        this._highlightGeo.setAttribute('position', posAttr);
        this._highlightMat = new THREE.MeshBasicMaterial({
            color: 0xfff3a3,
            transparent: true,
            opacity: HIGHLIGHT_OPACITY,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide
        });
        this._highlightMesh = new THREE.Mesh(this._highlightGeo, this._highlightMat);
        this._highlightMesh.renderOrder = 20;
        this._highlightMesh.frustumCulled = false;
        this._highlightMesh.visible = false;
        const roadCfg = this.city?.generatorConfig?.road ?? {};
        const groundCfg = this.city?.generatorConfig?.ground ?? {};
        const baseRoadY = roadCfg.surfaceY ?? 0.02;
        const curbHeight = roadCfg.curb?.height ?? 0.17;
        const groundY = groundCfg.surfaceY ?? (baseRoadY + curbHeight);
        const roadY = Math.max(baseRoadY, groundY + ROAD_SURFACE_LIFT);
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
        const roadY = Math.max(baseRoadY, groundY + ROAD_SURFACE_LIFT);
        const markerY = roadY + COLLISION_MARKER_LIFT;
        const curbT = roadCfg.curb?.thickness ?? DEFAULT_CURB_THICKNESS;
        const endPoleRadius = Math.max(POLE_DOT_RADIUS_MIN, curbT * POLE_DOT_RADIUS_FACTOR * POLE_DOT_SCALE);
        const radius = endPoleRadius * COLLISION_POLE_SCALE;
        const ringInner = endPoleRadius * 1.2;
        const ringOuter = endPoleRadius * 1.7;
        const originRadius = Math.max(POLE_DOT_RADIUS_MIN * 0.6, endPoleRadius * 0.6);
        const dummy = new THREE.Object3D();
        if (collisionMarkers.length) {
            this._collisionMarkerGeo = new THREE.CircleGeometry(radius, COLLISION_MARKER_SEGMENTS);
            this._collisionMarkerGeo.rotateX(-Math.PI / 2);
            this._collisionMarkerMat = new THREE.MeshBasicMaterial({
                color: COLLISION_MARKER_COLOR_HEX,
                transparent: true,
                opacity: COLLISION_MARKER_OPACITY,
                depthWrite: false,
                depthTest: false
            });
            this._collisionMarkerMesh = new THREE.InstancedMesh(this._collisionMarkerGeo, this._collisionMarkerMat, collisionMarkers.length);
            this._collisionMarkerMesh.renderOrder = 25;
            this._collisionMarkerMesh.frustumCulled = false;
            let k = 0;
            for (let i = 0; i < collisionMarkers.length; i++) {
                const p = collisionMarkers[i];
                if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
                dummy.position.set(p.x, markerY, p.z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                this._collisionMarkerMesh.setMatrixAt(k, dummy.matrix);
                k += 1;
            }
            this._collisionMarkerMesh.count = k;
            this._collisionMarkerMesh.instanceMatrix.needsUpdate = true;
            this._collisionMarkerMesh.visible = this._collisionDebugEnabled;
            city.group.add(this._collisionMarkerMesh);
        }
        if (connectionMarkers.length) {
            this._connectionMarkerGeo = new THREE.CircleGeometry(radius, COLLISION_MARKER_SEGMENTS);
            this._connectionMarkerGeo.rotateX(-Math.PI / 2);
            this._connectionMarkerMat = new THREE.MeshBasicMaterial({
                color: CONNECTION_MARKER_COLOR_HEX,
                transparent: true,
                opacity: CONNECTION_MARKER_OPACITY,
                depthWrite: false,
                depthTest: false
            });
            this._connectionMarkerMesh = new THREE.InstancedMesh(this._connectionMarkerGeo, this._connectionMarkerMat, connectionMarkers.length);
            this._connectionMarkerMesh.renderOrder = 24;
            this._connectionMarkerMesh.frustumCulled = false;
            let k = 0;
            for (let i = 0; i < connectionMarkers.length; i++) {
                const p = connectionMarkers[i];
                if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
                dummy.position.set(p.x, markerY, p.z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                this._connectionMarkerMesh.setMatrixAt(k, dummy.matrix);
                k += 1;
            }
            this._connectionMarkerMesh.count = k;
            this._connectionMarkerMesh.instanceMatrix.needsUpdate = true;
            this._connectionMarkerMesh.visible = this._collisionDebugEnabled;
            city.group.add(this._connectionMarkerMesh);
        }
        if (adjustedEndRings.length) {
            this._adjustedEndRingGeo = new THREE.RingGeometry(ringInner, ringOuter, COLLISION_MARKER_SEGMENTS);
            this._adjustedEndRingGeo.rotateX(-Math.PI / 2);
            this._adjustedEndRingMat = new THREE.MeshBasicMaterial({
                color: ADJUSTED_END_RING_COLOR_HEX,
                transparent: true,
                opacity: ADJUSTED_END_RING_OPACITY,
                depthWrite: false,
                depthTest: false
            });
            this._adjustedEndRingMesh = new THREE.InstancedMesh(this._adjustedEndRingGeo, this._adjustedEndRingMat, adjustedEndRings.length);
            this._adjustedEndRingMesh.renderOrder = 26;
            this._adjustedEndRingMesh.frustumCulled = false;
            let k = 0;
            for (let i = 0; i < adjustedEndRings.length; i++) {
                const p = adjustedEndRings[i];
                if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
                dummy.position.set(p.x, markerY, p.z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                this._adjustedEndRingMesh.setMatrixAt(k, dummy.matrix);
                k += 1;
            }
            this._adjustedEndRingMesh.count = k;
            this._adjustedEndRingMesh.instanceMatrix.needsUpdate = true;
            this._adjustedEndRingMesh.visible = this._collisionDebugEnabled;
            city.group.add(this._adjustedEndRingMesh);
        }
        if (adjustedEndOrigins.length) {
            this._adjustedEndOriginGeo = new THREE.CircleGeometry(originRadius, COLLISION_MARKER_SEGMENTS);
            this._adjustedEndOriginGeo.rotateX(-Math.PI / 2);
            this._adjustedEndOriginMat = new THREE.MeshBasicMaterial({
                color: ADJUSTED_END_ORIGIN_COLOR_HEX,
                transparent: true,
                opacity: ADJUSTED_END_ORIGIN_OPACITY,
                depthWrite: false,
                depthTest: false
            });
            this._adjustedEndOriginMesh = new THREE.InstancedMesh(this._adjustedEndOriginGeo, this._adjustedEndOriginMat, adjustedEndOrigins.length);
            this._adjustedEndOriginMesh.renderOrder = 23;
            this._adjustedEndOriginMesh.frustumCulled = false;
            let k = 0;
            for (let i = 0; i < adjustedEndOrigins.length; i++) {
                const p = adjustedEndOrigins[i];
                if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
                dummy.position.set(p.x, markerY, p.z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                this._adjustedEndOriginMesh.setMatrixAt(k, dummy.matrix);
                k += 1;
            }
            this._adjustedEndOriginMesh.count = k;
            this._adjustedEndOriginMesh.instanceMatrix.needsUpdate = true;
            this._adjustedEndOriginMesh.visible = this._collisionDebugEnabled;
            city.group.add(this._adjustedEndOriginMesh);
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

    _setRoadRenderMode(mode) {
        const next = mode === 'normal' ? 'normal' : 'debug';
        if (next === this._roadRenderMode) return;
        this._roadRenderMode = next;
        const current = this._cityOptions.generatorConfig ?? {};
        const render = { ...(current.render ?? {}), roadMode: next };
        this._cityOptions.generatorConfig = { ...current, render };
        this.debugsPanel?.setRoadRenderMode(this._roadRenderMode);
        this._reloadCity();
    }

    _setHoverOutlineEnabled(enabled) {
        this._hoverOutlineEnabled = !!enabled;
        this.debugsPanel?.setHoverOutlineEnabled(this._hoverOutlineEnabled);
        if (this._hoverOutlineEnabled) this._ensureHoverOutline();
        else this._clearHoverOutline();
    }

    _handlePointerMove(e) {
        if (!this._connectorDebugEnabled && !this._hoverOutlineEnabled) return;
        if (this.debugPanel?.root?.contains(e.target) || this.debugsPanel?.root?.contains(e.target) || this.shortcutsPanel?.root?.contains(e.target)) {
            this._clearConnectorHover();
            this._clearHoverOutline();
            return;
        }
        this._setPointerFromEvent(e);
        if (this._connectorDebugEnabled && this._connectorOverlay) {
            const hit = this._intersectHoverPlane();
            if (!hit) {
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
                            const dx = p0.x - hit.x;
                            const dz = p0.z - hit.z;
                            const d2 = dx * dx + dz * dz;
                            if (d2 < bestDistSq) {
                                bestDistSq = d2;
                                bestIndex = i;
                                bestPole = 0;
                            }
                        }
                        const p1 = item?.p1;
                        if (p1) {
                            const dx = p1.x - hit.x;
                            const dz = p1.z - hit.z;
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

        if (this._hoverOutlineEnabled) this._updateHoverOutline();
        else this._clearHoverOutline();
    }

    _clearConnectorHover() {
        this._hoverConnectorIndex = -1;
        this._hoverPoleIndex = -1;
        this._connectorOverlay?.setHoverSelection(null);
        this._setPoleInfoData(null);
    }

    _handlePointerLeave() {
        this._clearConnectorHover();
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
        this._outlineMaterial = new LineMaterial({
            color: 0xff0000,
            linewidth: 4,
            worldUnits: false,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false
        });
        const size = this.engine.renderer.getSize(new THREE.Vector2());
        this._outlineMaterial.resolution.set(size.x, size.y);
        this._outlineLine = new LineSegments2(new LineSegmentsGeometry(), this._outlineMaterial);
        this._outlineLine.visible = false;
        this._outlineLine.renderOrder = 12;
        this._outlineLine.frustumCulled = false;
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

    _updateHoverOutline() {
        if (!this._outlineLine) this._ensureHoverOutline();
        if (!this._outlineLine) return;
        const hit = this._pickHoverMesh();
        if (!hit) {
            this._clearHoverOutline();
            return;
        }
        const obj = hit.object;
        const instanceId = hit.instanceId;
        const baseGeo = obj.geometry;
        if (!baseGeo) {
            this._clearHoverOutline();
            return;
        }
        const ranges = baseGeo.userData?.mergeRanges;
        const rangeIndex = this._getHoverRangeIndex(ranges, hit.faceIndex);
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
        const overlay = this._connectorOverlay?.group;
        if (!overlay) return false;
        let cur = obj;
        while (cur) {
            if (cur === overlay) return true;
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
