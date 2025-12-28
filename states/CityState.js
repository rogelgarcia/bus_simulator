// states/CityState.js
import * as THREE from 'three';
import { getSharedCity } from '../src/city/City.js';
import { createCityConfig } from '../src/city/CityConfig.js';
import { CityMap } from '../src/city/CityMap.js';
import { CityDebugPanel } from '../graphics/gui/CityDebugPanel.js';

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
            onReload: () => this._reloadCity()
        });
        this.debugPanel.show();

        this._setCity(this._baseSpec);

        const cam = this.engine.camera;
        const size = this.city?.config?.size ?? this._cityOptions.size;
        const fovRad = cam.fov * Math.PI / 180;
        const aspect = cam.aspect || 1;
        const hFov = 2 * Math.atan(Math.tan(fovRad * 0.5) * aspect);
        const viewHalf = size * 0.45;
        this._zoomMin = Math.max(8, size * 0.12);
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
        this._baseSpec = null;

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
}
