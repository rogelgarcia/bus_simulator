// src/states/TestModeState.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { BUS_CATALOG } from '../graphics/assets3d/factories/BusCatalog.js';
import { createBus } from '../graphics/assets3d/factories/BusFactory.js';
import { tuneBusMaterials } from '../graphics/assets3d/factories/tuneBusMaterials.js';
import { makeCheckerTexture } from '../graphics/assets3d/textures/CityTextures.js';

import { createVehicleFromBus } from '../app/vehicle/createVehicle.js';
import { VehicleController } from '../app/vehicle/VehicleController.js';

function resolveBoundsTarget(model) {
    const api = model?.userData?.bus ?? model?.userData?.api ?? null;
    if (api?.bodyRoot?.isObject3D) return api.bodyRoot;
    return model;
}

function makeVehicleAnchor(model) {
    const anchor = new THREE.Group();
    anchor.name = `${model.name || 'bus'}_anchor`;

    anchor.userData.type = model.userData?.type;
    anchor.userData.id = model.userData?.id;
    anchor.userData.model = model;
    anchor.userData.origin = 'center';

    anchor.add(model);

    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);

    const boundsTarget = resolveBoundsTarget(model);
    const box = new THREE.Box3().setFromObject(boundsTarget);
    if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
    }

    return anchor;
}

function snapToGroundY(object3d, groundY) {
    if (!object3d) return;
    const y = Number.isFinite(groundY) ? groundY : 0;
    object3d.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object3d);
    if (box.isEmpty()) return;
    const delta = y - box.min.y;
    if (Number.isFinite(delta) && Math.abs(delta) > 1e-5) {
        object3d.position.y += delta;
        object3d.updateMatrixWorld(true);
    }
}

function applyFloorClipToObject(object3d, { renderer, groundY = 0 } = {}) {
    if (!object3d || !renderer) return;
    renderer.localClippingEnabled = true;

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);

    object3d.traverse((o) => {
        if (!o?.isMesh) return;
        if (o.userData?._floorClipApplied) return;

        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const next = [];
        let changed = false;

        for (const mat of mats) {
            if (!mat) {
                next.push(mat);
                continue;
            }
            // Avoid mutating shared template materials by cloning per mesh.
            const cloned = mat.clone();
            cloned.clippingPlanes = [plane];
            cloned.clipIntersection = false;
            cloned.needsUpdate = true;
            next.push(cloned);
            changed = true;
        }

        if (!changed) return;
        o.material = Array.isArray(o.material) ? next : next[0];
        if (!o.userData) o.userData = {};
        o.userData._floorClipApplied = true;
    });
}

function disposeMaterial(mat, { disposeTextures = true } = {}) {
    if (!mat) return;
    if (disposeTextures) {
        for (const k of Object.keys(mat)) {
            const v = mat[k];
            if (v && v.isTexture) v.dispose();
        }
    }
    mat.dispose?.();
}

function disposeObject3D(obj, { disposeGeometry = true, disposeMaterials = true, disposeTextures = true } = {}) {
    if (!obj) return;
    obj.traverse((o) => {
        if (!o.isMesh) return;
        if (disposeGeometry) o.geometry?.dispose?.();
        if (!disposeMaterials) return;
        if (Array.isArray(o.material)) o.material.forEach((mat) => disposeMaterial(mat, { disposeTextures }));
        else disposeMaterial(o.material, { disposeTextures });
    });
}

function createSkyline({ spanX = 160, baseZ = -85, depth = 10, minH = 10, maxH = 42, step = 3.2 } = {}) {
    const g = new THREE.Group();
    g.name = 'skyline';

    const mat = new THREE.MeshStandardMaterial({
        color: 0x0b0f1a,
        roughness: 0.95,
        metalness: 0.02
    });

    const seed = 1337;
    const rand = (i) => {
        const x = Math.sin((i + seed) * 999.123) * 43758.5453;
        return x - Math.floor(x);
    };

    let idx = 0;
    for (let x = -spanX / 2; x <= spanX / 2; x += step) {
        const r1 = rand(idx++);
        const r2 = rand(idx++);
        const h = THREE.MathUtils.lerp(minH, maxH, r1);
        const w = THREE.MathUtils.lerp(1.6, 3.2, r2);
        const d = THREE.MathUtils.lerp(depth * 0.6, depth * 1.4, rand(idx++));

        const geo = new THREE.BoxGeometry(w, h, d);
        const b = new THREE.Mesh(geo, mat);

        b.position.set(
            x + (rand(idx++) - 0.5) * 0.3,
            h / 2,
            baseZ + (rand(idx++) - 0.5) * 1.8
        );

        b.castShadow = false;
        b.receiveShadow = true;
        g.add(b);

        if (rand(idx++) > 0.70) {
            const h2 = h * THREE.MathUtils.lerp(0.55, 0.95, rand(idx++));
            const geo2 = new THREE.BoxGeometry(w * 0.85, h2, d * 0.75);
            const t = new THREE.Mesh(geo2, mat);
            t.position.set(
                b.position.x + (rand(idx++) - 0.5) * 0.8,
                h2 / 2,
                b.position.z - 6 - rand(idx++) * 4
            );
            t.castShadow = false;
            t.receiveShadow = true;
            g.add(t);
        }
    }

    return g;
}

/* ---------------- HUD UI (DOM) ---------------- */

function makeHudRoot() {
    const root = document.createElement('div');
    root.id = 'testmode-hud';
    root.className = 'ui-hud-root testmode-hud';
    return root;
}

function stylePanel(el, { interactive = false } = {}) {
    el.classList.add('ui-panel');
    el.classList.toggle('is-interactive', !!interactive);
}

function makeTitle(text) {
    const t = document.createElement('div');
    t.textContent = text;
    t.className = 'ui-title';
    return t;
}

function makePopupDraggable(wrap, handle) {
    if (!wrap || !handle) return;
    handle.classList.add('ui-drag-handle');

    const onPointerDown = (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const rect = wrap.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        wrap.style.left = `${rect.left}px`;
        wrap.style.top = `${rect.top}px`;
        wrap.style.bottom = '';
        wrap.style.right = '';
        handle.classList.add('is-dragging');

        const onPointerMove = (moveEvent) => {
            wrap.style.left = `${moveEvent.clientX - offsetX}px`;
            wrap.style.top = `${moveEvent.clientY - offsetY}px`;
        };

        const onPointerUp = () => {
            handle.classList.remove('is-dragging');
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
    };

    handle.addEventListener('pointerdown', onPointerDown);
}

function makeRow(key, label) {
    const row = document.createElement('div');
    row.className = 'testmode-row';

    const k = document.createElement('div');
    k.textContent = key;
    k.className = 'testmode-key';

    const l = document.createElement('div');
    l.textContent = label;
    l.className = 'testmode-row-label';

    row.appendChild(k);
    row.appendChild(l);
    return row;
}

function makeValueRow(label) {
    const row = document.createElement('div');
    row.className = 'testmode-value-row';

    const k = document.createElement('div');
    k.textContent = label;
    k.className = 'testmode-value-key';

    const v = document.createElement('div');
    v.textContent = '—';
    v.className = 'testmode-value-val';

    row.appendChild(k);
    row.appendChild(v);
    return { row, valueEl: v };
}

function makeActionButton(label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.className = 'testmode-action-btn';
    return btn;
}

function makeSeparator() {
    const hr = document.createElement('div');
    hr.className = 'ui-separator';
    return hr;
}

function makeLabel(text) {
    const l = document.createElement('div');
    l.textContent = text;
    l.className = 'ui-section-label';
    return l;
}

function makeRangeControl({ title, min, max, step, value, fmt = (v) => String(v) }) {
    const wrap = document.createElement('div');
    wrap.className = 'testmode-range';

    const head = document.createElement('div');
    head.className = 'testmode-range-head';

    const label = document.createElement('div');
    label.textContent = title;
    label.className = 'testmode-range-label';

    const val = document.createElement('div');
    val.className = 'testmode-range-val';
    val.textContent = fmt(value);

    head.appendChild(label);
    head.appendChild(val);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.className = 'testmode-range-input';

    wrap.appendChild(head);
    wrap.appendChild(input);

    return { wrap, input, valEl: val, fmt };
}

function makeToggleControl({ title, checked }) {
    const row = document.createElement('label');
    row.className = 'testmode-toggle-row';

    const text = document.createElement('div');
    text.textContent = title;
    text.className = 'testmode-toggle-text';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!checked;
    input.className = 'testmode-toggle-input';

    row.appendChild(text);
    row.appendChild(input);

    return { row, input };
}

function makeSelectControl({ title, options = [], value = '' }) {
    const row = document.createElement('div');
    row.className = 'testmode-select-row';

    const label = document.createElement('div');
    label.textContent = title;
    label.className = 'testmode-select-label';

    const select = document.createElement('select');
    select.className = 'testmode-select';

    const updateOptions = () => {
        select.innerHTML = '';
        for (const opt of options) {
            const option = document.createElement('option');
            option.value = String(opt.value);
            option.textContent = opt.label;
            select.appendChild(option);
        }
        if (value !== '' && value !== null && value !== undefined) {
            select.value = String(value);
        }
    };

    updateOptions();

    row.appendChild(label);
    row.appendChild(select);

    return { row, select, updateOptions };
}

function makeGearShiftControl({ title, options = [], value = null }) {
    const row = document.createElement('div');
    row.className = 'testmode-gear-row';

    const label = document.createElement('div');
    label.textContent = title;
    label.className = 'testmode-gear-label';

    const controls = document.createElement('div');
    controls.className = 'testmode-gear-controls';

    const makeBtn = (text) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        btn.className = 'testmode-gear-btn';
        return btn;
    };

    const downBtn = makeBtn('−');
    const upBtn = makeBtn('+');

    const pill = document.createElement('div');
    pill.className = 'testmode-gear-pill';

    let flashTimer = null;
    let current = Number.isFinite(value) ? value : null;
    let opts = Array.isArray(options) ? [...options] : [];

    const sortOptions = (list) => list.slice().sort((a, b) => (a.value ?? 0) - (b.value ?? 0));

    const getLabel = (val) => {
        const hit = opts.find((o) => o?.value === val);
        return hit?.label ?? '—';
    };

    const update = ({ flash = false } = {}) => {
        pill.textContent = getLabel(current);

        const sorted = sortOptions(opts);
        const idx = sorted.findIndex((o) => o?.value === current);
        downBtn.disabled = idx <= 0;
        upBtn.disabled = idx < 0 || idx >= sorted.length - 1;
        if (flash && current !== null) {
            if (flashTimer) clearTimeout(flashTimer);
            pill.classList.add('is-flash');
            flashTimer = setTimeout(() => {
                pill.classList.remove('is-flash');
                flashTimer = null;
            }, 220);
        }
    };

    const setOptions = (next) => {
        opts = Array.isArray(next) ? [...next] : [];
        update({ flash: false });
    };

    const setValue = (val, { flash = true } = {}) => {
        if (!Number.isFinite(val)) return;
        const prev = current;
        current = val;
        update({ flash: flash && prev !== val });
    };

    const step = (dir) => {
        const sorted = sortOptions(opts);
        if (!sorted.length) return current;

        let idx = sorted.findIndex((o) => o?.value === current);
        if (idx < 0) idx = 0;

        const nextIdx = THREE.MathUtils.clamp(idx + (dir >= 0 ? 1 : -1), 0, sorted.length - 1);
        const next = sorted[nextIdx]?.value;
        if (!Number.isFinite(next) || next === current) return current;
        current = next;
        update({ flash: true });
        return current;
    };

    controls.appendChild(downBtn);
    controls.appendChild(pill);
    controls.appendChild(upBtn);
    row.appendChild(label);
    row.appendChild(controls);

    update({ flash: false });

    return {
        row,
        downBtn,
        upBtn,
        valueEl: pill,
        setOptions,
        setValue,
        step,
        getValue: () => current
    };
}

function makeStatTile({ label, value = '—', unit = '' }) {
    const wrap = document.createElement('div');
    wrap.className = 'testmode-stat';

    const title = document.createElement('div');
    title.textContent = label;
    title.className = 'testmode-stat-title';

    const val = document.createElement('div');
    val.textContent = value;
    val.className = 'testmode-stat-value';

    const unitEl = document.createElement('div');
    unitEl.textContent = unit;
    unitEl.className = 'testmode-stat-unit';

    wrap.appendChild(title);
    wrap.appendChild(val);
    wrap.appendChild(unitEl);

    return { wrap, valueEl: val, unitEl };
}

function makeSteerWidget() {
    const wrap = document.createElement('div');
    wrap.className = 'testmode-steer';

    const needle = document.createElement('div');
    needle.className = 'testmode-steer-needle';

    const dot = document.createElement('div');
    dot.className = 'testmode-steer-dot';

    wrap.appendChild(needle);
    wrap.appendChild(dot);

    return { wrap, needle };
}

function makeWheelBox() {
    const wrap = document.createElement('div');
    wrap.className = 'testmode-wheel-box';

    const spin = document.createElement('div');
    spin.className = 'testmode-wheel-spin';

    const contact = document.createElement('div');
    contact.className = 'testmode-wheel-contact';

    wrap.appendChild(spin);
    wrap.appendChild(contact);

    return { wrap, spin, contact };
}

function makeSuspensionBar() {
    const wrap = document.createElement('div');
    wrap.className = 'testmode-susp';

    const track = document.createElement('div');
    track.className = 'testmode-susp-track';

    const center = document.createElement('div');
    center.className = 'testmode-susp-center';

    const bar = document.createElement('div');
    bar.className = 'testmode-susp-bar';

    track.appendChild(center);
    track.appendChild(bar);

    const value = document.createElement('div');
    value.className = 'testmode-susp-value';
    value.textContent = '0.0 cm';

    wrap.appendChild(track);
    wrap.appendChild(value);

    const range = (70 - 20) / 2;
    return { wrap, bar, valueEl: value, range };
}

function makeWheelVizCell({ label, wheelFirst }) {
    const wrap = document.createElement('div');
    wrap.className = 'testmode-wheelviz';

    const title = document.createElement('div');
    title.textContent = label;
    title.className = 'testmode-wheelviz-title';

    const row = document.createElement('div');
    row.className = 'testmode-wheelviz-row';

    const wheel = makeWheelBox();
    const suspension = makeSuspensionBar();

    if (wheelFirst) {
        row.appendChild(wheel.wrap);
        row.appendChild(suspension.wrap);
    } else {
        row.appendChild(suspension.wrap);
        row.appendChild(wheel.wrap);
    }

    wrap.appendChild(title);
    wrap.appendChild(row);

    return { wrap, wheel, suspension };
}

/* ---------------- State ---------------- */

export class TestModeState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this.uiWelcome = document.getElementById('ui-welcome');
        this.uiSelect = document.getElementById('ui-select');
        this.hudChip = this.uiSelect?.querySelector?.('.chip') ?? null;

        this.controls = null;

        this.sim = this.engine.simulation;
        this.vehicle = null;
        this.vehicleController = null;

        this.scene = null;
        this.busAnchor = null;
        this.busModel = null;
        this.busApi = null;
        this.busIndex = 0;

        // Infinite floor tiling
        this.floorGroup = null;
        this.floorTiles = [];
        this.floorTileSize = 160;
        this._tmpV = new THREE.Vector3();

        // Camera follow state
        this._prevBusPos = new THREE.Vector3();
        this._cameraFollowPending = new THREE.Vector3();
        this._cameraFollowTau = 0.22;
        this._busReadyToken = 0;

        this.busState = {
            steerDeg: 0,
            throttle: 0,
            brake: 0,
            headlights: false,
            gearIndex: null
        };

        // HUD refs
        this.hudRoot = null;
        this.opsBusName = null;

        this.telemetryPanel = null;
        this.telemetryFields = null;
        this.steerWidget = null;
        this.wheelViz = null;

        this.rapierPanel = null;
        this.rapierFields = null;
        this.gearControl = null;
        this.rapierConfigPanel = null;
        this.rapierConfigOverlay = null;
        this.rapierConfigFields = null;

        this._chipWasHidden = null;
        this._prevLocalClippingEnabled = null;
        this._onKeyDown = (e) => this._handleKeyDown(e);
    }

    enter() {
        document.body.classList.remove('splash-bg');

        if (this.uiWelcome) this.uiWelcome.classList.add('hidden');
        if (this.uiSelect) this.uiSelect.classList.remove('hidden');

        if (this.hudChip) {
            this._chipWasHidden = this.hudChip.classList.contains('hidden');
            this.hudChip.classList.add('hidden');
        }

        this.engine.clearScene();

        const scene = this.engine.scene;
        this.scene = scene;

        scene.background = new THREE.Color(0x08101f);
        scene.fog = new THREE.Fog(0x08101f, 35, 180);

        // Infinite floor
        this._buildInfiniteFloor();

        // Skyline
        scene.add(createSkyline({ baseZ: -85 }));

        // Lights
        scene.add(new THREE.AmbientLight(0xffffff, 0.55));

        const lighting = this.engine?.lightingSettings ?? {};
        const hemiIntensity = Number.isFinite(lighting.hemiIntensity) ? lighting.hemiIntensity : 0.45;
        const sunIntensity = Number.isFinite(lighting.sunIntensity) ? lighting.sunIntensity : 0.95;

        scene.add(new THREE.HemisphereLight(0xbad7ff, 0x0a0b10, hemiIntensity));

        const key = new THREE.DirectionalLight(0xffffff, sunIntensity);
        key.position.set(18, 28, 22);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.bias = -0.00025;
        scene.add(key);

        const rim = new THREE.DirectionalLight(0xbad7ff, 0.45);
        rim.position.set(-22, 18, -28);
        rim.castShadow = false;
        scene.add(rim);

        // Bus
        this.busIndex = this._defaultBusIndex();
        this._prevLocalClippingEnabled = this.engine?.renderer?.localClippingEnabled ?? null;
        this._setBus(this.busIndex);

        // Camera + controls
        const cam = this.engine.camera;
        cam.position.set(10.5, 5.2, 18);

        this.controls = new OrbitControls(cam, this.engine.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enablePan = false;
        this.controls.minDistance = 10;
        this.controls.maxDistance = 80;
        this.controls.maxPolarAngle = Math.PI * 0.47;

        if (this.busAnchor) {
            this.controls.target.set(this.busAnchor.position.x, 1.8, this.busAnchor.position.z);
            this._prevBusPos.copy(this.busAnchor.position);
        } else {
            this.controls.target.set(0, 1.8, -10);
        }

        this._mountHud();

        window.addEventListener('keydown', this._onKeyDown, { passive: false });
    }

    exit() {
        window.removeEventListener('keydown', this._onKeyDown);

        this.controls?.dispose?.();
        this.controls = null;

        if (this.vehicleController) {
            this.vehicleController.dispose();
            this.vehicleController = null;
        }

        if (this.vehicle) {
            this.sim?.physics?.removeVehicle?.(this.vehicle.id);
            this.vehicle = null;
        }

        if (this.busAnchor && this.scene) {
            this.scene.remove(this.busAnchor);
            disposeObject3D(this.busAnchor, { disposeGeometry: false, disposeMaterials: false });
        }

        if (this.floorGroup && this.scene) {
            this.scene.remove(this.floorGroup);
            disposeObject3D(this.floorGroup);
        }

        this.floorGroup = null;
        this.floorTiles = [];

        this.busAnchor = null;
        this.busModel = null;
        this.busApi = null;
        this.scene = null;

        this._unmountHud();

        if (this.hudChip && !this._chipWasHidden) this.hudChip.classList.remove('hidden');
        this._chipWasHidden = null;
        if (this.uiSelect) this.uiSelect.classList.add('hidden');

        if (this._prevLocalClippingEnabled !== null && this.engine?.renderer) {
            this.engine.renderer.localClippingEnabled = this._prevLocalClippingEnabled;
        }
        this._prevLocalClippingEnabled = null;
    }

    update(dt) {
        const api = this._getBusApi();
        if (!api || !this.busAnchor || !this.vehicle) return;

        const maxSteer = this.vehicle.config?.maxSteerDeg ?? 55;

        const steerInput = THREE.MathUtils.clamp(this.busState.steerDeg / maxSteer, -1, 1);
        const throttleInput = THREE.MathUtils.clamp(this.busState.throttle, 0, 1);
        const brakeInput = THREE.MathUtils.clamp(this.busState.brake, 0, 1);

        this.vehicleController?.setInput({
            throttle: throttleInput,
            steering: steerInput,
            brake: brakeInput,
            handbrake: 0
        });

        // base controls (stateful)
        api.setHeadlights(!!this.busState.headlights);

        // fixed step
        this.sim?.physics?.update?.(dt);
        this.vehicleController?.update(dt);

        // infinite floor reposition
        this._updateInfiniteFloor(this.busAnchor.position);

        // camera follow
        this._updateCameraFollow(dt);

        this._updateRapierDebug();
        this.controls?.update();
    }

    _defaultBusIndex() {
        const idx = BUS_CATALOG.findIndex((s) => /city/i.test(s?.name ?? s?.id ?? ''));
        return idx >= 0 ? idx : 0;
    }

    _getBusApi() {
        return this.busModel?.userData?.bus ?? this.busModel?.userData?.api ?? null;
    }

    _buildInfiniteFloor() {
        if (!this.scene) return;

        const tileSize = this.floorTileSize;

        const tex = makeCheckerTexture({ size: 256, squares: 8, colorA: '#ffffff', colorB: '#d01818' });
        tex.repeat.set(8, 8);

        const mat = new THREE.MeshStandardMaterial({
            map: tex,
            color: 0xffffff,
            roughness: 0.92,
            metalness: 0.02
        });

        const geo = new THREE.PlaneGeometry(tileSize, tileSize);

        const group = new THREE.Group();
        group.name = 'floor_tiles';

        this.floorTiles = [];

        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                const tile = new THREE.Mesh(geo, mat);
                tile.rotation.x = -Math.PI / 2;
                tile.position.y = 0;
                tile.receiveShadow = true;
                tile.name = `floor_${dx}_${dz}`;
                group.add(tile);
                this.floorTiles.push({ mesh: tile, dx, dz });
            }
        }

        this.floorGroup = group;
        this.scene.add(group);
    }

    _updateInfiniteFloor(busPos) {
        if (!this.floorTiles.length) return;

        const ts = this.floorTileSize;
        const cx = Math.floor(busPos.x / ts);
        const cz = Math.floor(busPos.z / ts);

        for (const t of this.floorTiles) {
            t.mesh.position.x = (cx + t.dx + 0.5) * ts;
            t.mesh.position.z = (cz + t.dz + 0.5) * ts;
        }
    }

    _updateCameraFollow(dt) {
        if (!this.controls || !this.busAnchor) return;

        const cam = this.engine.camera;
        const cur = this.busAnchor.position;

        this._tmpV.copy(cur).sub(this._prevBusPos);
        this._cameraFollowPending.add(this._tmpV);
        this._prevBusPos.copy(cur);

        const tau = this._cameraFollowTau;
        const clampedDt = Math.min(Math.max(dt ?? 0, 0), 0.05);
        const alpha = tau > 0 ? (1 - Math.exp(-clampedDt / tau)) : 1;
        if (alpha <= 0) return;
        if (this._cameraFollowPending.lengthSq() < 1e-12) return;

        const step = this._tmpV.copy(this._cameraFollowPending).multiplyScalar(alpha);
        cam.position.add(step);
        this.controls.target.add(step);
        this._cameraFollowPending.sub(step);
    }

    _mountHud() {
        this._unmountHud();

        const root = makeHudRoot();

        // Shortcuts
        const shortcuts = document.createElement('div');
        stylePanel(shortcuts, { interactive: false });
        shortcuts.classList.add('testmode-shortcuts');
        shortcuts.appendChild(makeTitle('Shortcuts'));
        shortcuts.appendChild(makeRow('B', 'Toggle Bus'));
        shortcuts.appendChild(makeRow('X', 'Exit to Main Menu'));
        shortcuts.appendChild(makeRow('Esc', 'Exit to Main Menu'));
        shortcuts.appendChild(makeSeparator());

        const hint = document.createElement('div');
        hint.textContent = 'Orbit: drag mouse (camera follows bus translation)';
        hint.className = 'testmode-hint';
        shortcuts.appendChild(hint);

        // Ops
        const ops = document.createElement('div');
        stylePanel(ops, { interactive: true });
        ops.classList.add('testmode-ops');
        ops.appendChild(makeTitle('Bus Controls'));

        const busName = document.createElement('div');
        busName.className = 'testmode-bus-name';
        busName.textContent = 'Selected: —';
        ops.appendChild(busName);
        this.opsBusName = busName;

        ops.appendChild(makeLabel('Drive'));
        const throttle = makeRangeControl({
            title: 'Throttle',
            min: 0,
            max: 1,
            step: 0.01,
            value: this.busState.throttle,
            fmt: (v) => `${Math.round(Number(v) * 100)}%`
        });
        ops.appendChild(throttle.wrap);

        const brake = makeRangeControl({
            title: 'Brake',
            min: 0,
            max: 1,
            step: 0.01,
            value: this.busState.brake,
            fmt: (v) => `${Math.round(Number(v) * 100)}%`
        });
        ops.appendChild(brake.wrap);

        const gearOptions = (this.sim?.physics?.getGearOptions?.(this.vehicle?.id) ?? [
            { index: 0, label: 'R' },
            { index: 1, label: 'N' },
            { index: 2, label: '1' },
            { index: 3, label: '2' },
            { index: 4, label: '3' },
            { index: 5, label: '4' },
            { index: 6, label: '5' }
        ]).map((gear) => ({ label: gear.label, value: gear.index }));

        const currentGear = this.sim?.physics?.getGearIndex?.(this.vehicle?.id);
        const fallbackGear = gearOptions.find((gear) => gear.label === '1')?.value ?? gearOptions[0]?.value;
        const gearControl = makeGearShiftControl({
            title: 'Gear',
            options: gearOptions,
            value: Number.isFinite(currentGear) ? currentGear : fallbackGear
        });
        ops.appendChild(gearControl.row);
        this.gearControl = gearControl;

        ops.appendChild(makeLabel('Steering'));
        const steer = makeRangeControl({
            title: 'Steer (deg, + = left)',
            min: -55,
            max: 55,
            step: 1,
            value: this.busState.steerDeg,
            fmt: (v) => `${v}°`
        });
        ops.appendChild(steer.wrap);

        ops.appendChild(makeLabel('Lights'));
        const headlights = makeToggleControl({ title: 'Headlights', checked: this.busState.headlights });
        ops.appendChild(headlights.row);

        // Events
        throttle.input.addEventListener('input', () => {
            this.busState.throttle = parseFloat(throttle.input.value);
            throttle.valEl.textContent = throttle.fmt(this.busState.throttle);
        });

        brake.input.addEventListener('input', () => {
            this.busState.brake = parseFloat(brake.input.value);
            brake.valEl.textContent = brake.fmt(this.busState.brake);
        });

        const applyGear = (value) => {
            if (!Number.isFinite(value) || !this.vehicle?.id) return;
            this.busState.gearIndex = value;
            this.sim?.physics?.setGear?.(this.vehicle.id, value);
        };

        gearControl.downBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const prev = gearControl.getValue();
            const next = gearControl.step(-1);
            if (next !== prev) applyGear(next);
        });

        gearControl.upBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const prev = gearControl.getValue();
            const next = gearControl.step(1);
            if (next !== prev) applyGear(next);
        });

        steer.input.addEventListener('input', () => {
            this.busState.steerDeg = parseFloat(steer.input.value);
            steer.valEl.textContent = steer.fmt(this.busState.steerDeg);
        });

        headlights.input.addEventListener('change', () => { this.busState.headlights = !!headlights.input.checked; });
        const telemetryPanel = document.createElement('div');
        stylePanel(telemetryPanel, { interactive: false });
        telemetryPanel.classList.add('testmode-telemetry');
        telemetryPanel.appendChild(makeTitle('Simulation Output'));

        const topRow = document.createElement('div');
        topRow.className = 'testmode-telemetry-top';

        const statGrid = document.createElement('div');
        statGrid.className = 'testmode-stat-grid';

        const speedTile = makeStatTile({ label: 'Speed', unit: 'km/h' });
        const gearTile = makeStatTile({ label: 'Gear' });
        gearTile.unitEl.textContent = '';
        const rpmTile = makeStatTile({ label: 'RPM', unit: 'rpm' });
        const torqueTile = makeStatTile({ label: 'Torque', unit: 'Nm' });

        statGrid.appendChild(speedTile.wrap);
        statGrid.appendChild(gearTile.wrap);
        statGrid.appendChild(rpmTile.wrap);
        statGrid.appendChild(torqueTile.wrap);

        const steerWrap = document.createElement('div');
        steerWrap.className = 'testmode-telemetry-steer';

        const steerLabel = document.createElement('div');
        steerLabel.textContent = 'Steer Input';
        steerLabel.className = 'testmode-telemetry-steer-label';

        const steerWidget = makeSteerWidget();
        steerWrap.appendChild(steerLabel);
        steerWrap.appendChild(steerWidget.wrap);

        topRow.appendChild(statGrid);
        topRow.appendChild(steerWrap);
        telemetryPanel.appendChild(topRow);

        telemetryPanel.appendChild(makeLabel('Wheels + Suspension'));

        const wheelGrid = document.createElement('div');
        wheelGrid.className = 'testmode-wheel-grid';

        const makeAxleRow = () => {
            const row = document.createElement('div');
            row.className = 'testmode-axle-row';

            const line = document.createElement('div');
            line.className = 'testmode-axle-line';

            row.appendChild(line);
            return row;
        };

        const frontRow = makeAxleRow();
        const midRow = makeAxleRow();
        const rearRow = makeAxleRow();
        midRow.classList.add('hidden');

        const fl = makeWheelVizCell({ label: 'Front Left', wheelFirst: true });
        const fr = makeWheelVizCell({ label: 'Front Right', wheelFirst: false });
        const ml = makeWheelVizCell({ label: 'Mid Left', wheelFirst: true });
        const mr = makeWheelVizCell({ label: 'Mid Right', wheelFirst: false });
        const rl = makeWheelVizCell({ label: 'Rear Left', wheelFirst: true });
        const rr = makeWheelVizCell({ label: 'Rear Right', wheelFirst: false });

        frontRow.appendChild(fl.wrap);
        frontRow.appendChild(fr.wrap);
        midRow.appendChild(ml.wrap);
        midRow.appendChild(mr.wrap);
        rearRow.appendChild(rl.wrap);
        rearRow.appendChild(rr.wrap);

        wheelGrid.appendChild(frontRow);
        wheelGrid.appendChild(midRow);
        wheelGrid.appendChild(rearRow);

        telemetryPanel.appendChild(wheelGrid);

        const rapierPanel = document.createElement('div');
        stylePanel(rapierPanel, { interactive: true });
        rapierPanel.classList.add('testmode-rapier-panel');
        rapierPanel.appendChild(makeTitle('Rapier'));

        rapierPanel.appendChild(makeLabel('Input'));
        const inputThrottle = makeValueRow('Throttle');
        const inputSteer = makeValueRow('Steer');
        const inputBrake = makeValueRow('Brake');
        const inputHandbrake = makeValueRow('Handbrake');
        rapierPanel.appendChild(inputThrottle.row);
        rapierPanel.appendChild(inputSteer.row);
        rapierPanel.appendChild(inputBrake.row);
        rapierPanel.appendChild(inputHandbrake.row);

        rapierPanel.appendChild(makeLabel('Output'));
        const outSpeed = makeValueRow('Speed');
        const outYaw = makeValueRow('Yaw');
        const outSteer = makeValueRow('Steer L/R');
        const outContacts = makeValueRow('Contacts');
        const outForces = makeValueRow('Drive/Brake');
        rapierPanel.appendChild(outSpeed.row);
        rapierPanel.appendChild(outYaw.row);
        rapierPanel.appendChild(outSteer.row);
        rapierPanel.appendChild(outContacts.row);
        rapierPanel.appendChild(outForces.row);

        const rapierConfigBtn = makeActionButton('Show configuration');
        rapierConfigBtn.addEventListener('click', (event) => {
            event.preventDefault();
            this._toggleRapierConfigPanel();
        });
        rapierPanel.appendChild(makeSeparator());
        rapierPanel.appendChild(rapierConfigBtn);

        root.appendChild(shortcuts);
        root.appendChild(ops);
        root.appendChild(telemetryPanel);
        root.appendChild(rapierPanel);
        document.body.appendChild(root);

        this.hudRoot = root;
        this._updateHudBusName();

        this.telemetryPanel = telemetryPanel;
        this.telemetryFields = {
            speed: speedTile.valueEl,
            gear: gearTile.valueEl,
            rpm: rpmTile.valueEl,
            torque: torqueTile.valueEl
        };
        this.steerWidget = steerWidget;
        this.wheelViz = {
            FL: fl,
            FR: fr,
            ML: ml,
            MR: mr,
            RL: rl,
            RR: rr
        };
        this._wheelVizRows = { midRow };

        this.rapierPanel = rapierPanel;
        this.rapierFields = {
            inputThrottle: inputThrottle.valueEl,
            inputSteer: inputSteer.valueEl,
            inputBrake: inputBrake.valueEl,
            inputHandbrake: inputHandbrake.valueEl,
            outSpeed: outSpeed.valueEl,
            outYaw: outYaw.valueEl,
            outSteer: outSteer.valueEl,
            outContacts: outContacts.valueEl,
            outForces: outForces.valueEl
        };
    }

    _unmountHud() {
        this._closeRapierConfigPanel();

        if (this.hudRoot?.parentNode) this.hudRoot.parentNode.removeChild(this.hudRoot);
        this.hudRoot = null;

        this.opsBusName = null;

        this.telemetryPanel = null;
        this.telemetryFields = null;
        this.steerWidget = null;
        this.wheelViz = null;
        this._wheelVizRows = null;

        this.rapierPanel = null;
        this.rapierFields = null;
        this.gearControl = null;
        this.rapierConfigPanel = null;
        this.rapierConfigOverlay = null;
        this.rapierConfigFields = null;
    }

    _updateHudBusName() {
        if (!this.opsBusName) return;
        const name = BUS_CATALOG[this.busIndex]?.name ?? 'Bus';
        this.opsBusName.textContent = `Selected: ${name}`;
    }

    _syncGearOptions() {
        if (!this.gearControl || !this.vehicle?.id) return;
        const gears = this.sim?.physics?.getGearOptions?.(this.vehicle.id) ?? [];
        if (!gears.length) return;
        this.gearControl.setOptions(gears.map((gear) => ({ label: gear.label, value: gear.index })));
        const current = this.sim?.physics?.getGearIndex?.(this.vehicle.id);
        if (Number.isFinite(current)) {
            this.gearControl.setValue(current, { flash: false });
            this.busState.gearIndex = current;
        }
    }

    _updateRapierDebug() {
        if (!this.rapierFields || !this.vehicle?.id) {
            this._updateRapierConfigPanel();
            return;
        }

        const fmt = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '—');
        const fmtDeg = (v) => (Number.isFinite(v) ? `${THREE.MathUtils.radToDeg(v).toFixed(1)}°` : '—');

        const debug = this.sim?.physics?.getVehicleDebug?.(this.vehicle.id);
        if (!debug) {
            for (const key of Object.keys(this.rapierFields)) this.rapierFields[key].textContent = '—';
            if (this.telemetryFields) {
                this.telemetryFields.speed.textContent = '—';
                this.telemetryFields.gear.textContent = '—';
                this.telemetryFields.rpm.textContent = '—';
                this.telemetryFields.torque.textContent = '—';
            }
            if (this.steerWidget?.needle) {
                this.steerWidget.needle.style.transform = 'rotate(0deg)';
            }
            if (this.wheelViz) {
                if (this._wheelVizRows?.midRow) this._wheelVizRows.midRow.classList.add('hidden');
                for (const key of Object.keys(this.wheelViz)) {
                    const wheel = this.wheelViz[key];
                    wheel.wheel.spin.style.transform = 'rotate(0deg)';
                    wheel.wheel.contact.classList.remove('is-contact');
                    wheel.suspension.bar.style.removeProperty('--testmode-susp-offset');
                    wheel.suspension.valueEl.textContent = '0.0 cm';
                }
            }
            this._updateRapierConfigPanel();
            return;
        }

        const input = debug.input ?? {};
        this.rapierFields.inputThrottle.textContent = fmt(input.throttle);
        this.rapierFields.inputSteer.textContent = fmt(input.steering);
        this.rapierFields.inputBrake.textContent = fmt(input.brake);
        this.rapierFields.inputHandbrake.textContent = fmt(input.handbrake);

        const loco = debug.locomotion ?? {};
        this.rapierFields.outSpeed.textContent = Number.isFinite(loco.speedKph)
            ? `${loco.speedKph.toFixed(1)} km/h`
            : '—';
        this.rapierFields.outYaw.textContent = fmtDeg(loco.yaw);
        this.rapierFields.outSteer.textContent = `${fmtDeg(loco.steerAngleLeft)} / ${fmtDeg(loco.steerAngleRight)}`;

        const wheels = debug.wheels ?? [];
        const contactCount = wheels.filter((w) => w.inContact).length;
        this.rapierFields.outContacts.textContent = wheels.length ? `${contactCount}/${wheels.length}` : '—';

        const driveForce = debug.forces?.driveForce;
        const brakeForce = debug.forces?.brakeForce;
        this.rapierFields.outForces.textContent = `${fmt(driveForce, 0)} / ${fmt(brakeForce, 0)}`;

        const drivetrain = debug.drivetrain ?? {};
        const gearLabel = drivetrain.gearLabel ?? null;
        const gearNum = Number.isFinite(drivetrain.gear) ? drivetrain.gear : null;

        if (this.telemetryFields) {
            this.telemetryFields.speed.textContent = Number.isFinite(loco.speedKph) ? loco.speedKph.toFixed(1) : '—';
            if (gearLabel) this.telemetryFields.gear.textContent = gearLabel;
            else if (gearNum !== null) this.telemetryFields.gear.textContent = String(gearNum);
            else this.telemetryFields.gear.textContent = '—';
            this.telemetryFields.rpm.textContent = Number.isFinite(drivetrain.rpm) ? Math.round(drivetrain.rpm).toString() : '—';
            this.telemetryFields.torque.textContent = Number.isFinite(drivetrain.torque) ? Math.round(drivetrain.torque).toString() : '—';
        }

        if (this.gearControl && drivetrain.gearIndex !== undefined && drivetrain.gearIndex !== null) {
            this.gearControl.setValue(drivetrain.gearIndex, { flash: false });
        }

        if (this.steerWidget?.needle) {
            const steer = THREE.MathUtils.clamp(input.steering ?? 0, -1, 1);
            const steerDeg = steer * 135;
            this.steerWidget.needle.style.transform = `rotate(${steerDeg.toFixed(1)}deg)`;
        }

        const restLen = debug.suspension?.restLength;
        const travel = debug.suspension?.travel ?? restLen;
        const wheelSpin = loco.wheelSpinAccum ?? 0;
        const spinDeg = Number.isFinite(wheelSpin) ? (wheelSpin * 180 / Math.PI) : 0;

        if (this.wheelViz) {
            const midRow = this._wheelVizRows?.midRow ?? null;
            const hasMid = wheels.some((w) => w?.labelEx === 'ML' || w?.labelEx === 'MR');
            if (midRow) midRow.classList.toggle('hidden', !hasMid);

            for (const wheel of wheels) {
                const key = wheel.labelEx ?? wheel.label;
                const slot = this.wheelViz[key];
                if (!slot) continue;
                slot.wheel.spin.style.transform = `rotate(${spinDeg.toFixed(1)}deg)`;
                slot.wheel.contact.classList.toggle('is-contact', !!wheel.inContact);

                if (Number.isFinite(restLen) && Number.isFinite(travel) && Number.isFinite(wheel.suspensionLength)) {
                    const compression = restLen - wheel.suspensionLength;
                    const norm = THREE.MathUtils.clamp(compression / Math.max(1e-3, travel), -1, 1);
                    const offset = -norm * slot.suspension.range;
                    slot.suspension.bar.style.setProperty('--testmode-susp-offset', `${offset.toFixed(1)}px`);
                    const cm = compression * 100;
                    slot.suspension.valueEl.textContent = `${cm >= 0 ? '+' : ''}${cm.toFixed(1)} cm`;
                } else {
                    slot.suspension.bar.style.removeProperty('--testmode-susp-offset');
                    slot.suspension.valueEl.textContent = '0.0 cm';
                }
            }
        }

        this._updateRapierConfigPanel();
    }

    _toggleRapierConfigPanel() {
        if (this.rapierConfigPanel) {
            this._closeRapierConfigPanel();
        } else {
            this._openRapierConfigPanel();
        }
    }

    _openRapierConfigPanel() {
        if (this.rapierConfigPanel || !this.hudRoot) return;

        const overlay = document.createElement('div');
        overlay.className = 'testmode-config-overlay';

        const panel = document.createElement('div');
        stylePanel(panel, { interactive: true });
        panel.classList.add('testmode-config-panel');

        const header = document.createElement('div');
        header.className = 'testmode-config-header';

        const title = makeTitle('Rapier Configuration');
        title.classList.add('is-inline');

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = 'X';
        closeBtn.className = 'testmode-config-close';

        closeBtn.addEventListener('click', (event) => {
            event.preventDefault();
            this._closeRapierConfigPanel();
        });

        header.appendChild(title);
        header.appendChild(closeBtn);
        panel.appendChild(header);
        panel.appendChild(makeSeparator());

        const fields = {
            mass: makeValueRow('Mass (kg)'),
            additionalMass: makeValueRow('Additional mass (kg)'),
            com: makeValueRow('COM (m)'),
            inertia: makeValueRow('Inertia (kg m^2)'),
            dimensions: makeValueRow('Dimensions (m)'),
            centerLocal: makeValueRow('Chassis center (m)'),
            halfExtents: makeValueRow('Half extents (m)'),
            linearDamping: makeValueRow('Linear damping'),
            angularDamping: makeValueRow('Angular damping'),
            chassisFriction: makeValueRow('Chassis friction'),
            bodyTilt: makeValueRow('Body tilt scale'),
            maxBodyAngle: makeValueRow('Max body angle (deg)'),
            suspensionRest: makeValueRow('Rest length (m)'),
            suspensionTravel: makeValueRow('Travel (m)'),
            suspensionStiffness: makeValueRow('Stiffness'),
            suspensionCompression: makeValueRow('Compression'),
            suspensionRelaxation: makeValueRow('Relaxation'),
            suspensionMaxForce: makeValueRow('Max force (N)'),
            wheelRadius: makeValueRow('Wheel radius (m)'),
            wheelbase: makeValueRow('Wheelbase (m)'),
            frontTrack: makeValueRow('Front track (m)'),
            frictionSlip: makeValueRow('Friction slip'),
            sideFriction: makeValueRow('Side stiffness'),
            wheelLayout: document.createElement('div'),
            engineForce: makeValueRow('Engine force (N)'),
            brakeForce: makeValueRow('Brake force (N)'),
            handbrakeForce: makeValueRow('Handbrake force (N)'),
            brakeBias: makeValueRow('Brake bias'),
            maxSteer: makeValueRow('Max steer (rad)')
        };

        panel.appendChild(makeLabel('Chassis'));
        panel.appendChild(fields.mass.row);
        panel.appendChild(fields.additionalMass.row);
        panel.appendChild(fields.com.row);
        panel.appendChild(fields.inertia.row);
        panel.appendChild(fields.dimensions.row);
        panel.appendChild(fields.centerLocal.row);
        panel.appendChild(fields.halfExtents.row);
        panel.appendChild(fields.linearDamping.row);
        panel.appendChild(fields.angularDamping.row);
        panel.appendChild(fields.chassisFriction.row);
        panel.appendChild(fields.bodyTilt.row);
        panel.appendChild(fields.maxBodyAngle.row);

        panel.appendChild(makeLabel('Suspension'));
        panel.appendChild(fields.suspensionRest.row);
        panel.appendChild(fields.suspensionTravel.row);
        panel.appendChild(fields.suspensionStiffness.row);
        panel.appendChild(fields.suspensionCompression.row);
        panel.appendChild(fields.suspensionRelaxation.row);
        panel.appendChild(fields.suspensionMaxForce.row);

        panel.appendChild(makeLabel('Wheels'));
        panel.appendChild(fields.wheelRadius.row);
        panel.appendChild(fields.wheelbase.row);
        panel.appendChild(fields.frontTrack.row);
        panel.appendChild(fields.frictionSlip.row);
        panel.appendChild(fields.sideFriction.row);
        fields.wheelLayout.className = 'testmode-wheel-layout';
        fields.wheelLayout.textContent = '—';
        panel.appendChild(fields.wheelLayout);

        panel.appendChild(makeLabel('Forces'));
        panel.appendChild(fields.engineForce.row);
        panel.appendChild(fields.brakeForce.row);
        panel.appendChild(fields.handbrakeForce.row);
        panel.appendChild(fields.brakeBias.row);
        panel.appendChild(fields.maxSteer.row);

        overlay.appendChild(panel);
        overlay.addEventListener('pointerdown', (event) => {
            if (event.target === overlay) this._closeRapierConfigPanel();
        });

        this.hudRoot.appendChild(overlay);

        this.rapierConfigOverlay = overlay;
        this.rapierConfigPanel = panel;
        this.rapierConfigFields = fields;

        makePopupDraggable(panel, title);
        this._updateRapierConfigPanel();
    }

    _closeRapierConfigPanel() {
        if (this.rapierConfigOverlay?.parentNode) {
            this.rapierConfigOverlay.parentNode.removeChild(this.rapierConfigOverlay);
        }
        this.rapierConfigOverlay = null;
        this.rapierConfigPanel = null;
        this.rapierConfigFields = null;
    }

    _updateRapierConfigPanel() {
        if (!this.rapierConfigFields) return;
        const config = this.vehicle?.id
            ? this.sim?.physics?.getVehicleConfig?.(this.vehicle.id)
            : null;

        const fmt = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '—');
        const fmtVec3 = (vec, digits = 2) => {
            if (!vec || !Number.isFinite(vec.x) || !Number.isFinite(vec.y) || !Number.isFinite(vec.z)) return '—';
            return `x:${fmt(vec.x, digits)} y:${fmt(vec.y, digits)} z:${fmt(vec.z, digits)}`;
        };
        const fmtDims = (dims, digits = 2) => {
            if (!dims) return '—';
            return `${fmt(dims.width, digits)} x ${fmt(dims.height, digits)} x ${fmt(dims.length, digits)}`;
        };

        const fields = this.rapierConfigFields;
        if (!config) {
            for (const key of Object.keys(fields)) {
                const field = fields[key];
                if (field?.valueEl) field.valueEl.textContent = '—';
                else if (field && typeof field.textContent === 'string') field.textContent = '—';
            }
            return;
        }

        fields.mass.valueEl.textContent = fmt(config.massKg, 1);
        fields.additionalMass.valueEl.textContent = fmt(config.additionalMassKg, 1);
        fields.com.valueEl.textContent = fmtVec3(config.com, 2);
        fields.inertia.valueEl.textContent = fmtVec3(config.inertia, 2);
        fields.dimensions.valueEl.textContent = fmtDims(config.dimensions, 2);
        fields.centerLocal.valueEl.textContent = fmtVec3(config.centerLocal, 2);
        fields.halfExtents.valueEl.textContent = fmtVec3(config.halfExtents, 2);
        fields.linearDamping.valueEl.textContent = fmt(config.chassis?.linearDamping, 2);
        fields.angularDamping.valueEl.textContent = fmt(config.chassis?.angularDamping, 2);
        fields.chassisFriction.valueEl.textContent = fmt(config.chassis?.friction, 2);
        fields.bodyTilt.valueEl.textContent = fmt(config.chassis?.bodyTiltScale, 2);
        fields.maxBodyAngle.valueEl.textContent = Number.isFinite(config.chassis?.maxBodyAngleRad)
            ? `${THREE.MathUtils.radToDeg(config.chassis.maxBodyAngleRad).toFixed(1)}°`
            : '—';

        fields.suspensionRest.valueEl.textContent = fmt(config.suspension?.restLength, 3);
        fields.suspensionTravel.valueEl.textContent = fmt(config.suspension?.travel, 3);
        fields.suspensionStiffness.valueEl.textContent = fmt(config.suspension?.stiffness, 1);
        fields.suspensionCompression.valueEl.textContent = fmt(config.suspension?.compression, 2);
        fields.suspensionRelaxation.valueEl.textContent = fmt(config.suspension?.relaxation, 2);
        fields.suspensionMaxForce.valueEl.textContent = fmt(config.suspension?.maxForce, 0);

        fields.wheelRadius.valueEl.textContent = fmt(config.wheels?.radius, 3);
        fields.wheelbase.valueEl.textContent = fmt(config.wheels?.wheelbase, 3);
        fields.frontTrack.valueEl.textContent = fmt(config.wheels?.frontTrack, 3);
        fields.frictionSlip.valueEl.textContent = fmt(config.wheels?.frictionSlip, 2);
        fields.sideFriction.valueEl.textContent = fmt(config.wheels?.sideFrictionStiffness, 2);

        const wheelLines = [];
        const wheels = config.wheelLayout ?? [];
        if (Array.isArray(wheels) && wheels.length) {
            wheelLines.push(`wheels: ${wheels.length}`);
            wheelLines.push('label   conn(x y z)           center(x y z)');
            for (const w of wheels) {
                const label = String(w.labelEx ?? w.label ?? `W${w.index}`).padEnd(5, ' ');
                const c = w.connection ?? null;
                const cc = w.center ?? null;
                const conn = c ? `x:${fmt(c.x, 2)} y:${fmt(c.y, 2)} z:${fmt(c.z, 2)}` : 'x:— y:— z:—';
                const ctr = cc ? `x:${fmt(cc.x, 2)} y:${fmt(cc.y, 2)} z:${fmt(cc.z, 2)}` : 'x:— y:— z:—';
                wheelLines.push(`${label} ${conn}   ${ctr}`);
            }
        }
        fields.wheelLayout.textContent = wheelLines.length ? wheelLines.join('\n') : '—';

        fields.engineForce.valueEl.textContent = fmt(config.forces?.engineForce, 0);
        fields.brakeForce.valueEl.textContent = fmt(config.forces?.brakeForce, 0);
        fields.handbrakeForce.valueEl.textContent = fmt(config.forces?.handbrakeForce, 0);
        fields.brakeBias.valueEl.textContent = fmt(config.forces?.brakeBias, 2);
        fields.maxSteer.valueEl.textContent = fmt(config.forces?.maxSteerRad, 3);
    }

    _setBus(index) {
        if (!this.scene) return;

        if (this.vehicleController) {
            this.vehicleController.dispose();
            this.vehicleController = null;
        }

        if (this.vehicle) {
            this.sim?.physics?.removeVehicle?.(this.vehicle.id);
            this.vehicle = null;
        }

        if (this.busAnchor) {
            this.scene.remove(this.busAnchor);
            // Materials were cloned for clipping; dispose them but keep textures (often shared via loaders).
            disposeObject3D(this.busAnchor, { disposeGeometry: false, disposeMaterials: true, disposeTextures: false });
            this.busAnchor = null;
            this.busModel = null;
            this.busApi = null;
        }

        const spec = BUS_CATALOG[index] ?? BUS_CATALOG[0];
        const busModel = createBus(spec);

        const tuneOpts = { colorScale: 0.72, roughness: 0.85, metalness: 0.02 };
        tuneBusMaterials(busModel, tuneOpts);
        busModel.userData?.readyPromise?.then?.(() => {
            if (this.busModel !== busModel) return;
            tuneBusMaterials(busModel, tuneOpts);
        });

        busModel.traverse((o) => {
            if (o.isMesh) {
                o.castShadow = true;
                o.receiveShadow = true;
            }
        });

        const vehicle = createVehicleFromBus(busModel, { id: 'test_bus' });
        const anchor = vehicle?.anchor ?? makeVehicleAnchor(busModel);
        anchor.position.set(0, 0, -10);
        anchor.rotation.set(0, 0, 0);
        snapToGroundY(anchor, 0);

        this.scene.add(anchor);

        this.vehicle = vehicle;
        this.busAnchor = anchor;
        this.busModel = vehicle?.model ?? busModel;
        this.busApi = vehicle?.api ?? this._getBusApi();

        applyFloorClipToObject(anchor, { renderer: this.engine?.renderer, groundY: 0 });

        if (this.vehicle?.id) {
            this.sim?.physics?.addVehicle?.(this.vehicle.id, this.vehicle.config, anchor, this.vehicle.api);
            this.vehicleController = new VehicleController(this.vehicle.id, this.sim.physics, this.sim.events);
            this.vehicleController.setVehicleApi(this.vehicle.api, anchor);
            this.sim?.physics?.setAutoShift?.(this.vehicle.id, false);
        }

        this._prevBusPos.copy(anchor.position);
        this._cameraFollowPending.set(0, 0, 0);

        if (this.controls) {
            this.controls.target.set(anchor.position.x, 1.8, anchor.position.z);
        }

        this._updateHudBusName();
        this._syncGearOptions();
        this._scheduleBusPhysicsRefresh();
        this._updateRapierConfigPanel();
    }

    _nextBus() {
        if (!BUS_CATALOG.length) return;
        this.busIndex = (this.busIndex + 1) % BUS_CATALOG.length;
        this._setBus(this.busIndex);
    }

    _scheduleBusPhysicsRefresh() {
        const readyPromise = this.busModel?.userData?.readyPromise;
        if (!readyPromise || typeof readyPromise.then !== 'function') return;
        this._busReadyToken += 1;
        const token = this._busReadyToken;
        readyPromise.then(() => {
            if (this._busReadyToken !== token) return;
            if (!this.vehicle || !this.busAnchor) return;
            this._refreshVehiclePhysics();
        });
    }

    _refreshVehiclePhysics() {
        if (!this.vehicle || !this.busAnchor) return;
        snapToGroundY(this.busAnchor, 0);
        this.sim?.physics?.removeVehicle?.(this.vehicle.id);
        this.sim?.physics?.addVehicle?.(this.vehicle.id, this.vehicle.config, this.busAnchor, this.vehicle.api);
        this.vehicleController?.setVehicleApi?.(this.vehicle.api, this.busAnchor);
        this.sim?.physics?.setAutoShift?.(this.vehicle.id, false);
        applyFloorClipToObject(this.busAnchor, { renderer: this.engine?.renderer, groundY: 0 });
        this._prevBusPos.copy(this.busAnchor.position);
        this._cameraFollowPending.set(0, 0, 0);
        if (this.controls) {
            this.controls.target.set(this.busAnchor.position.x, 1.8, this.busAnchor.position.z);
        }
        this._syncGearOptions();
    }

    _handleKeyDown(e) {
        const code = e.code;
        const key = e.key;

        const isB = code === 'KeyB' || key === 'b' || key === 'B';
        const isX = code === 'KeyX' || key === 'x' || key === 'X';
        const isEsc = code === 'Escape' || key === 'Escape';

        if (isB || isX || isEsc) e.preventDefault();

        if (isB) return this._nextBus();
        if (isX || isEsc) return this.sm.go('welcome');
    }
}
