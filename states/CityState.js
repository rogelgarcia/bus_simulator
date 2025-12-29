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
import { CityConnectorDebugOverlay } from '../graphics/CityConnectorDebugOverlay.js';

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
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

        this._baseSpec = null;
        this.debugPanel = null;
        this.debugsPanel = null;
        this.shortcutsPanel = null;
        this._highlightMesh = null;
        this._highlightGeo = null;
        this._highlightMat = null;
        this._highlightDummy = null;
        this._highlightY = 0.03;
        this._highlightCapacity = 0;
        this._connectorOverlay = null;
        this._connectorDebugEnabled = true;
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
            onConnectorDebugToggle: (enabled) => this._setConnectorDebugEnabled(enabled),
            onHoverOutlineToggle: (enabled) => this._setHoverOutlineEnabled(enabled)
        });
        this.debugsPanel.show();

        this.shortcutsPanel = new CityShortcutsPanel();
        this.shortcutsPanel.show();

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
        this._baseSpec = null;
        this._clearHighlight();
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
        this.engine.clearScene();
        this.engine.context.city = null;
        this.city = getSharedCity(this.engine, { ...this._cityOptions, mapSpec });
        this.city.attach(this.engine);
        this._setupHighlight();
        this._setupConnectorOverlay();
        this._setupHoverOutline();
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
        const tileSize = map.tileSize;
        this._highlightGeo = new THREE.PlaneGeometry(tileSize * 0.92, tileSize * 0.92, 1, 1);
        this._highlightGeo.rotateX(-Math.PI / 2);
        this._highlightMat = new THREE.MeshBasicMaterial({ color: 0xfff3a3, transparent: true, opacity: 0.45, depthWrite: false });
        const capacity = Math.max(map.width, map.height) + 1;
        this._highlightMesh = new THREE.InstancedMesh(this._highlightGeo, this._highlightMat, capacity);
        this._highlightMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this._highlightMesh.count = 0;
        this._highlightMesh.renderOrder = 5;
        this._highlightMesh.frustumCulled = false;
        this._highlightDummy = new THREE.Object3D();
        const roadY = this.city?.generatorConfig?.road?.surfaceY ?? 0.02;
        const curbHeight = this.city?.generatorConfig?.road?.curb?.height ?? 0.17;
        const groundY = this.city?.generatorConfig?.ground?.surfaceY ?? (roadY + curbHeight);
        this._highlightY = Math.max(roadY, groundY) + 0.01;
        this._highlightCapacity = capacity;
        this.city.group.add(this._highlightMesh);
    }

    _clearHighlight() {
        if (this._highlightMesh) this._highlightMesh.removeFromParent();
        this._highlightMesh = null;
        this._highlightGeo = null;
        this._highlightMat = null;
        this._highlightDummy = null;
        this._highlightCapacity = 0;
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
                        const p1 = item?.p1;
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
        const dummy = this._highlightDummy;
        if (!map || !mesh || !dummy) return;
        if (!road) {
            mesh.count = 0;
            mesh.instanceMatrix.needsUpdate = true;
            return;
        }
        const a = road.a ?? [0, 0];
        const b = road.b ?? [0, 0];
        const x0 = a[0] | 0;
        const y0 = a[1] | 0;
        const x1 = b[0] | 0;
        const y1 = b[1] | 0;
        const dx = Math.sign(x1 - x0);
        const dy = Math.sign(y1 - y0);
        const steps = Math.abs(x1 - x0) + Math.abs(y1 - y0);
        let k = 0;
        const capacity = this._highlightCapacity || 0;
        for (let i = 0; i <= steps && k < capacity; i++) {
            const x = x0 + dx * i;
            const y = y0 + dy * i;
            if (!map.inBounds(x, y)) continue;
            const p = map.tileToWorldCenter(x, y);
            dummy.position.set(p.x, this._highlightY, p.z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(k++, dummy.matrix);
        }
        mesh.count = k;
        mesh.instanceMatrix.needsUpdate = true;
    }
}
