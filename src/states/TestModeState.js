// src/states/TestModeState.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { BUS_CATALOG } from '../assets3d/factories/BusCatalog.js';
import { createBus } from '../assets3d/factories/BusFactory.js';
import { tuneBusMaterials } from '../assets3d/factories/tuneBusMaterials.js';

import { PhysicsLoop } from '../physics/PhysicsLoop.js';
import { SuspensionSim } from '../physics/SuspensionSim.js';
import { DriveSim } from '../physics/DriveSim.js';

function degToRad(d) { return (d * Math.PI) / 180; }

function makeFloorAnchor(model) {
    const anchor = new THREE.Group();
    anchor.name = `${model.name || 'bus'}_anchor`;

    anchor.userData.type = model.userData?.type;
    anchor.userData.id = model.userData?.id;
    anchor.userData.model = model;

    anchor.add(model);

    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);

    const box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;

    return anchor;
}

function disposeMaterial(mat) {
    if (!mat) return;
    for (const k of Object.keys(mat)) {
        const v = mat[k];
        if (v && v.isTexture) v.dispose();
    }
    mat.dispose?.();
}

function disposeObject3D(obj) {
    if (!obj) return;
    obj.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach(disposeMaterial);
        else disposeMaterial(o.material);
    });
}

function makeCheckerTexture({ size = 256, squares = 8, colorA = '#ffffff', colorB = '#d01818' } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    const cell = size / squares;

    for (let y = 0; y < squares; y++) {
        for (let x = 0; x < squares; x++) {
            ctx.fillStyle = ((x + y) % 2 === 0) ? colorA : colorB;
            ctx.fillRect(x * cell, y * cell, cell, cell);
        }
    }

    // subtle grain
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 10;
        d[i] = Math.min(255, Math.max(0, d[i] + n));
        d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
        d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
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

function makeButton(text) {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.width = '100%';
    b.style.marginTop = '10px';
    b.style.padding = '9px 10px';
    b.style.borderRadius = '12px';
    b.style.border = '1px solid rgba(255,255,255,0.16)';
    b.style.background = 'rgba(255,255,255,0.08)';
    b.style.color = '#e9f2ff';
    b.style.fontWeight = '800';
    b.style.cursor = 'pointer';
    b.style.pointerEvents = 'auto';
    return b;
}

function makeVerticalRangeControl({
                                      title,
                                      min,
                                      max,
                                      step,
                                      value,
                                      fmt = (v) => String(v),
                                      disabled = false
                                  }) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '6px';

    const t = document.createElement('div');
    t.textContent = title;
    t.style.fontSize = '12px';
    t.style.fontWeight = '800';
    t.style.opacity = '0.86';

    const val = document.createElement('div');
    val.style.fontSize = '12px';
    val.style.opacity = '0.75';
    val.textContent = fmt(value);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);

    input.style.writingMode = 'bt-lr';
    input.style.webkitAppearance = 'slider-vertical';
    input.style.appearance = 'slider-vertical';
    input.style.width = '18px';
    input.style.height = '140px';

    if (disabled) {
        input.disabled = true;
        input.style.pointerEvents = 'none';
        input.style.opacity = '0.75';
    }

    wrap.appendChild(t);
    wrap.appendChild(val);
    wrap.appendChild(input);

    return { wrap, input, valEl: val, fmt };
}

function makeWheelSpringBlock({ key, label, minCm, maxCm, stepCm, initialTargetCm }) {
    const card = document.createElement('div');
    card.style.borderRadius = '12px';
    card.style.padding = '10px';
    card.style.background = 'rgba(255,255,255,0.06)';
    card.style.border = '1px solid rgba(255,255,255,0.12)';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '10px';

    const head = document.createElement('div');
    head.textContent = label;
    head.style.fontSize = '12px';
    head.style.fontWeight = '900';
    head.style.letterSpacing = '0.5px';
    head.style.textTransform = 'uppercase';
    head.style.opacity = '0.9';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-around';
    row.style.gap = '14px';

    const target = makeVerticalRangeControl({
        title: 'Target',
        min: minCm,
        max: maxCm,
        step: stepCm,
        value: initialTargetCm,
        fmt: (v) => `${Number(v).toFixed(0)} cm`,
        disabled: false
    });

    const actual = makeVerticalRangeControl({
        title: 'Actual',
        min: minCm,
        max: maxCm,
        step: 0.1,
        value: 0,
        fmt: (v) => `${Number(v).toFixed(1)} cm`,
        disabled: true
    });

    row.appendChild(target.wrap);
    row.appendChild(actual.wrap);

    card.appendChild(head);
    card.appendChild(row);

    return { key, card, target, actual };
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

        this.scene = null;
        this.busAnchor = null;
        this.busModel = null;
        this.busIndex = 0;

        // Infinite floor tiling
        this.floorGroup = null;
        this.floorTiles = [];
        this.floorTileSize = 160;
        this._tmpV = new THREE.Vector3();

        // Camera follow state
        this._prevBusPos = new THREE.Vector3();

        // Fixed-step physics loop
        this.physics = new PhysicsLoop({ fixedDt: 1 / 60, maxSubSteps: 10 });

        // ✅ ORDER matters: drive first, suspension second (susp sees latest aLat/aLong)
        this.drive = new DriveSim();
        this.susp = new SuspensionSim();

        this.physics.add(this.drive);
        this.physics.add(this.susp);

        this.busState = {
            steerDeg: 0,              // UI: + = LEFT
            pitchDeg: 0,
            rollDeg: 0,
            headlights: false,
            taillights: false,
            targetSpeedKph: 0,
            coastRelease: false,      // coast to stop

            bodyPitchDeg: 0,
            bodyRollDeg: 0,

            suspensionEnabled: true,
            suspTargetsCm: { fl: 0, fr: 0, rl: 0, rr: 0 }
        };

        // HUD refs
        this.hudRoot = null;
        this.opsBusName = null;
        this.opsSpeed = null;

        // UI refs for spring blocks
        this.suspTargetCtrls = null; // {fl,fr,rl,rr}
        this.suspOutBars = null;     // {fl,fr,rl,rr}

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
        this.controls.dampingFactor = 0.08;
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

        if (this.busAnchor && this.scene) {
            this.scene.remove(this.busAnchor);
            disposeObject3D(this.busAnchor);
        }

        if (this.floorGroup && this.scene) {
            this.scene.remove(this.floorGroup);
            disposeObject3D(this.floorGroup);
        }

        this.floorGroup = null;
        this.floorTiles = [];

        this.busAnchor = null;
        this.busModel = null;
        this.scene = null;

        this._unmountHud();

        if (this.hudChip) this.hudChip.style.display = this._prevChipDisplay ?? '';
        if (this.uiSelect) this.uiSelect.classList.add('hidden');
    }

    update(dt) {
        const api = this._getBusApi();
        if (!api || !this.busAnchor) return;

        // UI: + is left => invert for our wheel yaw convention
        const steerRad = -degToRad(this.busState.steerDeg);

        // base controls (stateful)
        api.setSteerAngle(steerRad);
        api.setTilt(degToRad(this.busState.pitchDeg), degToRad(this.busState.rollDeg));
        api.setHeadlights(!!this.busState.headlights);
        api.setBrake(this.busState.taillights ? 0.12 : 0.0);

        // drive inputs
        this.drive.setSteerAngleRad(steerRad);
        this.drive.setTargetSpeedKph(this.busState.targetSpeedKph);
        this.drive.setReleaseMode(this.busState.coastRelease);

        // suspension inputs (manual cmd)
        this.susp.setTargetsCm(this.busState.suspTargetsCm);

        // fixed step
        this.physics.update(dt);

        // apply suspension pose + manual offsets
        const manualPitch = degToRad(this.busState.bodyPitchDeg);
        const manualRoll = degToRad(this.busState.bodyRollDeg);

        if (this.busState.suspensionEnabled) {
            const sus = this.susp.pose;
            api.setBodyHeave(sus.heave);
            api.setBodyTilt(sus.pitch + manualPitch, sus.roll + manualRoll);
        } else {
            api.setBodyHeave(0);
            api.setBodyTilt(manualPitch, manualRoll);
        }

        // infinite floor reposition
        this._updateInfiniteFloor(this.busAnchor.position);

        // camera follow
        this._updateCameraFollow();

        // speedometer
        if (this.opsSpeed) this.opsSpeed.textContent = `${this.drive.speedKph.toFixed(1)} km/h`;

        // auto-exit coastRelease once stopped
        if (this.busState.coastRelease && this.drive.speedKph < 0.05) {
            this.busState.coastRelease = false;
        }

        // spring output bars (actual compression)
        if (this.suspOutBars && this.susp?.debug?.xActualCm) {
            const a = this.susp.debug.xActualCm;
            for (const k of ['fl', 'fr', 'rl', 'rr']) {
                const ctrl = this.suspOutBars[k];
                if (!ctrl) continue;
                const v = a[k] ?? 0;
                ctrl.input.value = String(v);
                ctrl.valEl.textContent = ctrl.fmt(v);
            }
        }

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

    _updateCameraFollow() {
        if (!this.controls || !this.busAnchor) return;

        const cam = this.engine.camera;
        const cur = this.busAnchor.position;

        this._tmpV.copy(cur).sub(this._prevBusPos);

        cam.position.add(this._tmpV);
        this.controls.target.add(this._tmpV);

        this._prevBusPos.copy(cur);
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
        ops.appendChild(makeTitle('Bus Operations'));

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
        const targetSpeed = makeRangeControl({
            title: 'Target Speed (km/h)',
            min: 0,
            max: 80,
            step: 1,
            value: this.busState.targetSpeedKph,
            fmt: (v) => `${v} km/h`
        });
        ops.appendChild(targetSpeed.wrap);

        const releaseBtn = makeButton('Release Speed (coast to stop)');
        ops.appendChild(releaseBtn);

        const speedNowLabel = document.createElement('div');
        speedNowLabel.style.fontSize = '12px';
        speedNowLabel.style.fontWeight = '800';
        speedNowLabel.style.opacity = '0.85';
        speedNowLabel.style.marginTop = '6px';
        speedNowLabel.textContent = 'Speed';
        ops.appendChild(speedNowLabel);

        const speedNow = document.createElement('div');
        speedNow.style.fontSize = '22px';
        speedNow.style.fontWeight = '900';
        speedNow.style.letterSpacing = '0.2px';
        speedNow.style.marginTop = '2px';
        speedNow.style.marginBottom = '6px';
        speedNow.textContent = '0.0 km/h';
        ops.appendChild(speedNow);
        this.opsSpeed = speedNow;

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

        const taillights = makeToggleControl({ title: 'Taillights', checked: this.busState.taillights });
        ops.appendChild(taillights.row);

        ops.appendChild(makeLabel('Vehicle Tilt (debug)'));
        const pitch = makeRangeControl({ title: 'Pitch (deg)', min: -10, max: 10, step: 0.5, value: this.busState.pitchDeg, fmt: (v) => `${Number(v).toFixed(1)}°` });
        ops.appendChild(pitch.wrap);

        const roll = makeRangeControl({ title: 'Roll (deg)', min: -10, max: 10, step: 0.5, value: this.busState.rollDeg, fmt: (v) => `${Number(v).toFixed(1)}°` });
        ops.appendChild(roll.wrap);

        ops.appendChild(makeLabel('Suspension'));
        const suspEnabled = makeToggleControl({ title: 'Enable Suspension', checked: this.busState.suspensionEnabled });
        ops.appendChild(suspEnabled.row);

        // ✅ 2 columns, wheel blocks (Target + Actual vertical)
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = '1fr 1fr';
        grid.style.gap = '10px';
        grid.style.marginTop = '8px';

        const minCm = -35;
        const maxCm = 35;

        const blocks = [
            makeWheelSpringBlock({ key: 'fl', label: 'Front Left', minCm, maxCm, stepCm: 1, initialTargetCm: this.busState.suspTargetsCm.fl }),
            makeWheelSpringBlock({ key: 'fr', label: 'Front Right', minCm, maxCm, stepCm: 1, initialTargetCm: this.busState.suspTargetsCm.fr }),
            makeWheelSpringBlock({ key: 'rl', label: 'Rear Left', minCm, maxCm, stepCm: 1, initialTargetCm: this.busState.suspTargetsCm.rl }),
            makeWheelSpringBlock({ key: 'rr', label: 'Rear Right', minCm, maxCm, stepCm: 1, initialTargetCm: this.busState.suspTargetsCm.rr })
        ];

        this.suspTargetCtrls = {};
        this.suspOutBars = {};

        for (const b of blocks) {
            grid.appendChild(b.card);
            this.suspTargetCtrls[b.key] = b.target;
            this.suspOutBars[b.key] = b.actual;

            b.target.input.addEventListener('input', () => {
                this.busState.suspTargetsCm[b.key] = parseFloat(b.target.input.value);
                b.target.valEl.textContent = b.target.fmt(this.busState.suspTargetsCm[b.key]);
            });
        }

        ops.appendChild(grid);

        const resetBtn = makeButton('Release Springs (bounce)');
        ops.appendChild(resetBtn);

        ops.appendChild(makeLabel('Body Tilt Offset (wheels planted)'));
        const bodyPitch = makeRangeControl({ title: 'Body Pitch (deg)', min: -10, max: 10, step: 0.5, value: this.busState.bodyPitchDeg, fmt: (v) => `${Number(v).toFixed(1)}°` });
        ops.appendChild(bodyPitch.wrap);

        const bodyRoll = makeRangeControl({ title: 'Body Roll (deg)', min: -10, max: 10, step: 0.5, value: this.busState.bodyRollDeg, fmt: (v) => `${Number(v).toFixed(1)}°` });
        ops.appendChild(bodyRoll.wrap);

        // Events
        targetSpeed.input.addEventListener('input', () => {
            this.busState.coastRelease = false;
            this.busState.targetSpeedKph = parseFloat(targetSpeed.input.value);
            targetSpeed.valEl.textContent = targetSpeed.fmt(this.busState.targetSpeedKph);
        });

        releaseBtn.addEventListener('click', () => {
            this.busState.coastRelease = true;
            this.busState.targetSpeedKph = 0;
            targetSpeed.input.value = '0';
            targetSpeed.valEl.textContent = targetSpeed.fmt(0);
        });

        steer.input.addEventListener('input', () => {
            this.busState.steerDeg = parseFloat(steer.input.value);
            steer.valEl.textContent = steer.fmt(this.busState.steerDeg);
        });

        headlights.input.addEventListener('change', () => { this.busState.headlights = !!headlights.input.checked; });
        taillights.input.addEventListener('change', () => { this.busState.taillights = !!taillights.input.checked; });

        pitch.input.addEventListener('input', () => {
            this.busState.pitchDeg = parseFloat(pitch.input.value);
            pitch.valEl.textContent = pitch.fmt(this.busState.pitchDeg);
        });

        roll.input.addEventListener('input', () => {
            this.busState.rollDeg = parseFloat(roll.input.value);
            roll.valEl.textContent = roll.fmt(this.busState.rollDeg);
        });

        suspEnabled.input.addEventListener('change', () => { this.busState.suspensionEnabled = !!suspEnabled.input.checked; });

        resetBtn.addEventListener('click', () => {
            for (const k of ['fl', 'fr', 'rl', 'rr']) {
                this.busState.suspTargetsCm[k] = 0;
                const ctrl = this.suspTargetCtrls?.[k];
                if (ctrl) {
                    ctrl.input.value = '0';
                    ctrl.valEl.textContent = ctrl.fmt(0);
                }
            }
        });

        bodyPitch.input.addEventListener('input', () => {
            this.busState.bodyPitchDeg = parseFloat(bodyPitch.input.value);
            bodyPitch.valEl.textContent = bodyPitch.fmt(this.busState.bodyPitchDeg);
        });

        bodyRoll.input.addEventListener('input', () => {
            this.busState.bodyRollDeg = parseFloat(bodyRoll.input.value);
            bodyRoll.valEl.textContent = bodyRoll.fmt(this.busState.bodyRollDeg);
        });

        root.appendChild(shortcuts);
        root.appendChild(ops);
        document.body.appendChild(root);

        this.hudRoot = root;
        this._updateHudBusName();
    }

    _unmountHud() {
        if (this.hudRoot?.parentNode) this.hudRoot.parentNode.removeChild(this.hudRoot);
        this.hudRoot = null;

        this.opsBusName = null;
        this.opsSpeed = null;

        this.suspTargetCtrls = null;
        this.suspOutBars = null;
    }

    _updateHudBusName() {
        if (!this.opsBusName) return;
        const name = BUS_CATALOG[this.busIndex]?.name ?? 'Bus';
        this.opsBusName.textContent = `Selected: ${name}`;
    }

    _setBus(index) {
        if (!this.scene) return;

        if (this.busAnchor) {
            this.scene.remove(this.busAnchor);
            disposeObject3D(this.busAnchor);
            this.busAnchor = null;
            this.busModel = null;
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

        const anchor = makeFloorAnchor(busModel);
        anchor.position.set(0, 0, -10);
        anchor.rotation.set(0, 0, 0);

        this.scene.add(anchor);

        this.busAnchor = anchor;
        this.busModel = busModel;

        const api = this._getBusApi();
        if (api) {
            // layout so load transfer scales properly with real wheel positions
            this.susp.setLayoutFromBus(api);

            // wire suspension into drive (drive publishes aLat/aLong)
            this.drive.bind(api, anchor, this.susp);

            this._prevBusPos.copy(anchor.position);
        }

        if (this.controls) {
            this.controls.target.set(anchor.position.x, 1.8, anchor.position.z);
        }

        this._updateHudBusName();
    }

    _nextBus() {
        if (!BUS_CATALOG.length) return;
        this.busIndex = (this.busIndex + 1) % BUS_CATALOG.length;
        this._setBus(this.busIndex);
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
