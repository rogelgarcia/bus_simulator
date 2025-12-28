// states/CityState.js
import * as THREE from 'three';
import { getSharedCity } from '../src/city/City.js';
import { createCityConfig } from '../src/city/CityConfig.js';
import { CityMap } from '../src/city/CityMap.js';
import { CityDebugPanel } from '../graphics/gui/CityDebugPanel.js';
import { CityShortcutsPanel } from '../graphics/gui/CityShortcutsPanel.js';

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
        this.shortcutsPanel = null;
        this._highlightMesh = null;
        this._highlightGeo = null;
        this._highlightMat = null;
        this._highlightDummy = null;
        this._highlightY = 0.03;
        this._highlightCapacity = 0;

        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onKeyUp = (e) => this._handleKeyUp(e);

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
    }

    exit() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);

        this.debugPanel?.destroy();
        this.debugPanel = null;
        this.shortcutsPanel?.destroy();
        this.shortcutsPanel = null;
        this._baseSpec = null;
        this._clearHighlight();

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
        this.engine.clearScene();
        this.engine.context.city = null;
        this.city = getSharedCity(this.engine, { ...this._cityOptions, mapSpec });
        this.city.attach(this.engine);
        this._setupHighlight();
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
