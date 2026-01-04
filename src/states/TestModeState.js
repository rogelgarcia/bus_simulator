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
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.zIndex = '50';
    root.style.pointerEvents = 'none';
    root.style.display = 'flex';
    root.style.justifyContent = 'space-between';
    root.style.alignItems = 'flex-start';
    root.style.padding = '16px';
    root.style.gap = '16px';
    return root;
}

function stylePanel(el, { interactive = false } = {}) {
    el.style.pointerEvents = interactive ? 'auto' : 'none';
    el.style.userSelect = 'none';
    el.style.minWidth = '260px';
    el.style.maxWidth = '440px';
    el.style.background = 'rgba(10, 14, 20, 0.52)';
    el.style.border = '1px solid rgba(255,255,255,0.12)';
    el.style.backdropFilter = 'blur(8px)';
    el.style.borderRadius = '14px';
    el.style.padding = '12px 14px';
    el.style.color = '#e9f2ff';
    el.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial';
    el.style.boxShadow = '0 10px 28px rgba(0,0,0,0.35)';
}

function makeTitle(text) {
    const t = document.createElement('div');
    t.textContent = text;
    t.style.fontWeight = '800';
    t.style.fontSize = '14px';
    t.style.letterSpacing = '0.6px';
    t.style.textTransform = 'uppercase';
    t.style.opacity = '0.92';
    t.style.marginBottom = '10px';
    return t;
}

function makeRow(key, label) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';
    row.style.margin = '8px 0';

    const k = document.createElement('div');
    k.textContent = key;
    k.style.minWidth = '34px';
    k.style.textAlign = 'center';
    k.style.fontWeight = '900';
    k.style.fontSize = '12px';
    k.style.padding = '4px 8px';
    k.style.borderRadius = '9px';
    k.style.background = 'rgba(255,255,255,0.10)';
    k.style.border = '1px solid rgba(255,255,255,0.14)';

    const l = document.createElement('div');
    l.textContent = label;
    l.style.fontSize = '13px';
    l.style.opacity = '0.95';

    row.appendChild(k);
    row.appendChild(l);
    return row;
}

function makeValueRow(label) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '10px';
    row.style.margin = '6px 0';

    const k = document.createElement('div');
    k.textContent = label;
    k.style.fontSize = '12px';
    k.style.fontWeight = '800';
    k.style.opacity = '0.85';

    const v = document.createElement('div');
    v.textContent = '—';
    v.style.fontSize = '12px';
    v.style.fontWeight = '700';
    v.style.opacity = '0.9';
    v.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';

    row.appendChild(k);
    row.appendChild(v);
    return { row, valueEl: v };
}

function makeSeparator() {
    const hr = document.createElement('div');
    hr.style.height = '1px';
    hr.style.margin = '10px 0';
    hr.style.background = 'rgba(255,255,255,0.10)';
    return hr;
}

function makeLabel(text) {
    const l = document.createElement('div');
    l.textContent = text;
    l.style.fontSize = '12px';
    l.style.fontWeight = '800';
    l.style.opacity = '0.85';
    l.style.marginTop = '10px';
    l.style.marginBottom = '6px';
    l.style.textTransform = 'uppercase';
    l.style.letterSpacing = '0.4px';
    return l;
}

function makeRangeControl({ title, min, max, step, value, fmt = (v) => String(v) }) {
    const wrap = document.createElement('div');
    wrap.style.margin = '8px 0 10px';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.alignItems = 'center';
    head.style.justifyContent = 'space-between';
    head.style.gap = '10px';

    const label = document.createElement('div');
    label.textContent = title;
    label.style.fontSize = '13px';
    label.style.fontWeight = '700';
    label.style.opacity = '0.95';

    const val = document.createElement('div');
    val.style.fontSize = '12px';
    val.style.opacity = '0.75';
    val.textContent = fmt(value);

    head.appendChild(label);
    head.appendChild(val);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.style.width = '100%';
    input.style.marginTop = '6px';

    wrap.appendChild(head);
    wrap.appendChild(input);

    return { wrap, input, valEl: val, fmt };
}

function makeToggleControl({ title, checked }) {
    const row = document.createElement('label');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '12px';
    row.style.margin = '10px 0';
    row.style.cursor = 'pointer';

    const text = document.createElement('div');
    text.textContent = title;
    text.style.fontSize = '13px';
    text.style.fontWeight = '700';
    text.style.opacity = '0.95';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!checked;
    input.style.transform = 'scale(1.1)';

    row.appendChild(text);
    row.appendChild(input);

    return { row, input };
}

function makeSelectControl({ title, options = [], value = '' }) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '12px';
    row.style.margin = '10px 0';

    const label = document.createElement('div');
    label.textContent = title;
    label.style.fontSize = '13px';
    label.style.fontWeight = '700';
    label.style.opacity = '0.95';

    const select = document.createElement('select');
    select.style.flex = '0 0 120px';
    select.style.padding = '6px 8px';
    select.style.borderRadius = '10px';
    select.style.border = '1px solid rgba(255,255,255,0.16)';
    select.style.background = 'rgba(10, 14, 20, 0.75)';
    select.style.color = '#e9f2ff';
    select.style.fontWeight = '700';
    select.style.cursor = 'pointer';

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
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '12px';
    row.style.margin = '10px 0';

    const label = document.createElement('div');
    label.textContent = title;
    label.style.fontSize = '13px';
    label.style.fontWeight = '700';
    label.style.opacity = '0.95';

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.alignItems = 'center';
    controls.style.gap = '8px';

    const makeBtn = (text) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        btn.style.width = '34px';
        btn.style.height = '32px';
        btn.style.borderRadius = '10px';
        btn.style.border = '1px solid rgba(255,255,255,0.16)';
        btn.style.background = 'rgba(10, 14, 20, 0.75)';
        btn.style.color = '#e9f2ff';
        btn.style.fontWeight = '900';
        btn.style.cursor = 'pointer';
        btn.style.display = 'grid';
        btn.style.placeItems = 'center';
        return btn;
    };

    const downBtn = makeBtn('−');
    const upBtn = makeBtn('+');

    const pill = document.createElement('div');
    pill.style.minWidth = '44px';
    pill.style.height = '32px';
    pill.style.display = 'grid';
    pill.style.placeItems = 'center';
    pill.style.padding = '0 10px';
    pill.style.borderRadius = '999px';
    pill.style.border = '1px solid rgba(255,255,255,0.16)';
    pill.style.background = 'rgba(255,255,255,0.08)';
    pill.style.fontWeight = '900';
    pill.style.letterSpacing = '0.2px';

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
        downBtn.style.opacity = downBtn.disabled ? '0.45' : '1';
        upBtn.style.opacity = upBtn.disabled ? '0.45' : '1';

        if (flash && current !== null) {
            if (flashTimer) clearTimeout(flashTimer);
            pill.style.boxShadow = '0 0 0 2px rgba(255,204,0,0.55), 0 10px 24px rgba(0,0,0,0.22)';
            pill.style.borderColor = 'rgba(255,204,0,0.6)';
            flashTimer = setTimeout(() => {
                pill.style.boxShadow = '';
                pill.style.borderColor = 'rgba(255,255,255,0.16)';
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
    wrap.style.padding = '10px 12px';
    wrap.style.borderRadius = '12px';
    wrap.style.background = 'rgba(255,255,255,0.08)';
    wrap.style.border = '1px solid rgba(255,255,255,0.12)';
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '4px';

    const title = document.createElement('div');
    title.textContent = label;
    title.style.fontSize = '11px';
    title.style.fontWeight = '800';
    title.style.textTransform = 'uppercase';
    title.style.opacity = '0.7';
    title.style.letterSpacing = '0.4px';

    const val = document.createElement('div');
    val.textContent = value;
    val.style.fontSize = '20px';
    val.style.fontWeight = '900';
    val.style.letterSpacing = '0.4px';

    const unitEl = document.createElement('div');
    unitEl.textContent = unit;
    unitEl.style.fontSize = '11px';
    unitEl.style.fontWeight = '700';
    unitEl.style.opacity = '0.65';

    wrap.appendChild(title);
    wrap.appendChild(val);
    wrap.appendChild(unitEl);

    return { wrap, valueEl: val, unitEl };
}

function makeSteerWidget() {
    const wrap = document.createElement('div');
    wrap.style.width = '72px';
    wrap.style.height = '72px';
    wrap.style.borderRadius = '50%';
    wrap.style.border = '2px solid rgba(255,255,255,0.25)';
    wrap.style.position = 'relative';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';
    wrap.style.background = 'rgba(255,255,255,0.04)';

    const needle = document.createElement('div');
    needle.style.position = 'absolute';
    needle.style.width = '3px';
    needle.style.height = '28px';
    needle.style.borderRadius = '4px';
    needle.style.background = 'linear-gradient(180deg, #f6d87a, #f2b84e)';
    needle.style.transformOrigin = '50% 80%';
    needle.style.transform = 'rotate(0deg)';

    const dot = document.createElement('div');
    dot.style.width = '8px';
    dot.style.height = '8px';
    dot.style.borderRadius = '50%';
    dot.style.background = '#f6d87a';

    wrap.appendChild(needle);
    wrap.appendChild(dot);

    return { wrap, needle };
}

function makeWheelBox() {
    const wrap = document.createElement('div');
    wrap.style.width = '66px';
    wrap.style.height = '42px';
    wrap.style.borderRadius = '12px';
    wrap.style.border = '1px solid rgba(255,255,255,0.18)';
    wrap.style.background = 'rgba(255,255,255,0.06)';
    wrap.style.position = 'relative';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';

    const spin = document.createElement('div');
    spin.style.width = '46px';
    spin.style.height = '2px';
    spin.style.borderRadius = '2px';
    spin.style.background = 'rgba(255,255,255,0.9)';
    spin.style.transformOrigin = '50% 50%';

    const contact = document.createElement('div');
    contact.style.position = 'absolute';
    contact.style.right = '6px';
    contact.style.bottom = '6px';
    contact.style.width = '8px';
    contact.style.height = '8px';
    contact.style.borderRadius = '50%';
    contact.style.background = 'rgba(255,255,255,0.35)';

    wrap.appendChild(spin);
    wrap.appendChild(contact);

    return { wrap, spin, contact };
}

function makeSuspensionBar() {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '6px';

    const track = document.createElement('div');
    track.style.width = '16px';
    track.style.height = '70px';
    track.style.borderRadius = '10px';
    track.style.background = 'rgba(255,255,255,0.08)';
    track.style.border = '1px solid rgba(255,255,255,0.12)';
    track.style.position = 'relative';

    const center = document.createElement('div');
    center.style.position = 'absolute';
    center.style.left = '2px';
    center.style.right = '2px';
    center.style.top = '50%';
    center.style.height = '1px';
    center.style.background = 'rgba(255,255,255,0.45)';

    const bar = document.createElement('div');
    bar.style.position = 'absolute';
    bar.style.left = '50%';
    bar.style.top = '50%';
    bar.style.width = '6px';
    bar.style.height = '20px';
    bar.style.borderRadius = '6px';
    bar.style.background = 'linear-gradient(180deg, #8dd6ff, #4ea0ff)';
    bar.style.transform = 'translate(-50%, -50%)';

    track.appendChild(center);
    track.appendChild(bar);

    const value = document.createElement('div');
    value.style.fontSize = '11px';
    value.style.fontWeight = '800';
    value.style.minWidth = '46px';
    value.style.textAlign = 'left';
    value.textContent = '0.0 cm';

    wrap.appendChild(track);
    wrap.appendChild(value);

    const range = (70 - 20) / 2;
    return { wrap, bar, valueEl: value, range };
}

function makeWheelVizCell({ label, wheelFirst }) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '4px';
    wrap.style.flex = '1';

    const title = document.createElement('div');
    title.textContent = label;
    title.style.fontSize = '10px';
    title.style.fontWeight = '800';
    title.style.opacity = '0.7';
    title.style.textTransform = 'uppercase';
    title.style.letterSpacing = '0.4px';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';

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

        this._prevChipDisplay = null;
        this._onKeyDown = (e) => this._handleKeyDown(e);
    }

    enter() {
        document.body.classList.remove('splash-bg');

        if (this.uiWelcome) this.uiWelcome.classList.add('hidden');
        if (this.uiSelect) this.uiSelect.classList.remove('hidden');

        if (this.hudChip) {
            this._prevChipDisplay = this.hudChip.style.display;
            this.hudChip.style.display = 'none';
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
        scene.add(new THREE.HemisphereLight(0xbad7ff, 0x0a0b10, 0.45));

        const key = new THREE.DirectionalLight(0xffffff, 0.95);
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

        if (this.hudChip) this.hudChip.style.display = this._prevChipDisplay ?? '';
        if (this.uiSelect) this.uiSelect.classList.add('hidden');
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
        shortcuts.appendChild(makeTitle('Shortcuts'));
        shortcuts.appendChild(makeRow('B', 'Toggle Bus'));
        shortcuts.appendChild(makeRow('X', 'Exit to Main Menu'));
        shortcuts.appendChild(makeRow('Esc', 'Exit to Main Menu'));
        shortcuts.appendChild(makeSeparator());

        const hint = document.createElement('div');
        hint.textContent = 'Orbit: drag mouse (camera follows bus translation)';
        hint.style.fontSize = '12px';
        hint.style.opacity = '0.72';
        shortcuts.appendChild(hint);

        // Ops
        const ops = document.createElement('div');
        stylePanel(ops, { interactive: true });
        ops.appendChild(makeTitle('Bus Controls'));

        // ✅ scrollable
        ops.style.maxHeight = 'calc(100vh - 32px)';
        ops.style.overflowY = 'auto';
        ops.style.paddingRight = '10px';

        const busName = document.createElement('div');
        busName.style.fontSize = '13px';
        busName.style.fontWeight = '800';
        busName.style.opacity = '0.92';
        busName.style.marginBottom = '10px';
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
        telemetryPanel.style.position = 'absolute';
        telemetryPanel.style.left = '16px';
        telemetryPanel.style.bottom = '16px';
        telemetryPanel.style.minWidth = '320px';
        telemetryPanel.style.maxWidth = '440px';
        telemetryPanel.appendChild(makeTitle('Simulation Output'));

        const topRow = document.createElement('div');
        topRow.style.display = 'flex';
        topRow.style.alignItems = 'flex-start';
        topRow.style.gap = '12px';

        const statGrid = document.createElement('div');
        statGrid.style.display = 'grid';
        statGrid.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
        statGrid.style.gap = '10px';
        statGrid.style.flex = '1';

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
        steerWrap.style.display = 'flex';
        steerWrap.style.flexDirection = 'column';
        steerWrap.style.alignItems = 'center';
        steerWrap.style.gap = '6px';

        const steerLabel = document.createElement('div');
        steerLabel.textContent = 'Steer Input';
        steerLabel.style.fontSize = '11px';
        steerLabel.style.fontWeight = '800';
        steerLabel.style.textTransform = 'uppercase';
        steerLabel.style.letterSpacing = '0.4px';
        steerLabel.style.opacity = '0.7';

        const steerWidget = makeSteerWidget();
        steerWrap.appendChild(steerLabel);
        steerWrap.appendChild(steerWidget.wrap);

        topRow.appendChild(statGrid);
        topRow.appendChild(steerWrap);
        telemetryPanel.appendChild(topRow);

        telemetryPanel.appendChild(makeLabel('Wheels + Suspension'));

        const wheelGrid = document.createElement('div');
        wheelGrid.style.display = 'flex';
        wheelGrid.style.flexDirection = 'column';
        wheelGrid.style.gap = '12px';

        const makeAxleRow = () => {
            const row = document.createElement('div');
            row.style.position = 'relative';
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '12px';

            const line = document.createElement('div');
            line.style.position = 'absolute';
            line.style.left = '8px';
            line.style.right = '8px';
            line.style.top = '50%';
            line.style.height = '1px';
            line.style.background = 'rgba(255,255,255,0.2)';
            line.style.zIndex = '0';

            row.appendChild(line);
            return row;
        };

        const frontRow = makeAxleRow();
        const rearRow = makeAxleRow();

        const fl = makeWheelVizCell({ label: 'Front Left', wheelFirst: true });
        const fr = makeWheelVizCell({ label: 'Front Right', wheelFirst: false });
        const rl = makeWheelVizCell({ label: 'Rear Left', wheelFirst: true });
        const rr = makeWheelVizCell({ label: 'Rear Right', wheelFirst: false });

        fl.wrap.style.zIndex = '1';
        fr.wrap.style.zIndex = '1';
        rl.wrap.style.zIndex = '1';
        rr.wrap.style.zIndex = '1';

        frontRow.appendChild(fl.wrap);
        frontRow.appendChild(fr.wrap);
        rearRow.appendChild(rl.wrap);
        rearRow.appendChild(rr.wrap);

        wheelGrid.appendChild(frontRow);
        wheelGrid.appendChild(rearRow);

        telemetryPanel.appendChild(wheelGrid);

        const rapierPanel = document.createElement('div');
        stylePanel(rapierPanel, { interactive: false });
        rapierPanel.style.position = 'absolute';
        rapierPanel.style.right = '16px';
        rapierPanel.style.bottom = '16px';
        rapierPanel.style.minWidth = '260px';
        rapierPanel.style.maxWidth = '320px';
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
            RL: rl,
            RR: rr
        };

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
        if (this.hudRoot?.parentNode) this.hudRoot.parentNode.removeChild(this.hudRoot);
        this.hudRoot = null;

        this.opsBusName = null;

        this.telemetryPanel = null;
        this.telemetryFields = null;
        this.steerWidget = null;
        this.wheelViz = null;

        this.rapierPanel = null;
        this.rapierFields = null;
        this.gearControl = null;
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
        if (!this.rapierFields || !this.vehicle?.id) return;

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
                for (const key of Object.keys(this.wheelViz)) {
                    const wheel = this.wheelViz[key];
                    wheel.wheel.spin.style.transform = 'rotate(0deg)';
                    wheel.wheel.contact.style.background = 'rgba(255,255,255,0.35)';
                    wheel.suspension.bar.style.transform = 'translate(-50%, -50%)';
                    wheel.suspension.valueEl.textContent = '0.0 cm';
                }
            }
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
            for (const wheel of wheels) {
                const slot = this.wheelViz[wheel.label];
                if (!slot) continue;
                slot.wheel.spin.style.transform = `rotate(${spinDeg.toFixed(1)}deg)`;
                slot.wheel.contact.style.background = wheel.inContact ? '#7cff9a' : 'rgba(255,255,255,0.35)';

                if (Number.isFinite(restLen) && Number.isFinite(travel) && Number.isFinite(wheel.suspensionLength)) {
                    const compression = restLen - wheel.suspensionLength;
                    const norm = THREE.MathUtils.clamp(compression / Math.max(1e-3, travel), -1, 1);
                    const offset = -norm * slot.suspension.range;
                    slot.suspension.bar.style.transform = `translate(-50%, -50%) translateY(${offset.toFixed(1)}px)`;
                    const cm = compression * 100;
                    slot.suspension.valueEl.textContent = `${cm >= 0 ? '+' : ''}${cm.toFixed(1)} cm`;
                } else {
                    slot.suspension.bar.style.transform = 'translate(-50%, -50%)';
                    slot.suspension.valueEl.textContent = '0.0 cm';
                }
            }
        }
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
            disposeObject3D(this.busAnchor, { disposeGeometry: false, disposeMaterials: false });
            this.busAnchor = null;
            this.busModel = null;
            this.busApi = null;
        }

        const spec = BUS_CATALOG[index] ?? BUS_CATALOG[0];
        const busModel = createBus(spec);

        tuneBusMaterials(busModel, { colorScale: 0.72, roughness: 0.85, metalness: 0.02 });

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
