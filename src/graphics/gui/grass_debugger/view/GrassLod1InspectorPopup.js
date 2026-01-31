// src/graphics/gui/grass_debugger/view/GrassLod1InspectorPopup.js
// Popup viewport for inspecting the Soccer Grass Blade used by LOD1.
// @ts-check

import * as THREE from 'three';

const EPS = 1e-6;

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

function clampHex(value, fallbackHex) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallbackHex;
    return (n >>> 0) & 0xffffff;
}

function colorHexToCss(hex) {
    return `#${clampHex(hex, 0xffffff).toString(16).padStart(6, '0')}`;
}

function cssToColorHex(css, fallbackHex) {
    const raw = typeof css === 'string' ? css.trim() : '';
    if (!raw) return fallbackHex;
    const s = raw.startsWith('#') ? raw.slice(1) : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return fallbackHex;
    const parsed = Number.parseInt(s, 16);
    if (!Number.isFinite(parsed)) return fallbackHex;
    return parsed & 0xffffff;
}

function makeSelectRow({ label, value = '', options = [], onChange }) {
    const row = makeEl('div', 'options-row');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control');

    const select = document.createElement('select');
    select.className = 'options-select';
    for (const opt of Array.isArray(options) ? options : []) {
        const id = String(opt?.id ?? '');
        const text = String(opt?.label ?? id);
        if (!id) continue;
        const optionEl = document.createElement('option');
        optionEl.value = id;
        optionEl.textContent = text;
        select.appendChild(optionEl);
    }
    select.value = String(value ?? '');
    select.addEventListener('change', () => onChange?.(String(select.value)));

    right.appendChild(select);
    row.appendChild(left);
    row.appendChild(right);
    return { row, select };
}

function makeNumberSliderRow({ label, value = 0, min = 0, max = 1, step = 0.01, digits = 2, onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.value = String(clamp(value, min, max, value));
    range.className = 'options-range';

    const number = document.createElement('input');
    number.type = 'number';
    number.min = String(min);
    number.max = String(max);
    number.step = String(step);
    number.value = String(clamp(value, min, max, value).toFixed(digits));
    number.className = 'options-number';

    const emit = (raw) => {
        const next = clamp(raw, min, max, min);
        range.value = String(next);
        number.value = String(next.toFixed(digits));
        onChange?.(next);
    };

    range.addEventListener('input', () => emit(Number(range.value)));
    number.addEventListener('input', () => emit(Number(number.value)));

    right.appendChild(range);
    right.appendChild(number);
    row.appendChild(left);
    row.appendChild(right);
    return { row, range, number };
}

function makeColorRow({ label, valueHex, defaultHex, onChange }) {
    const row = makeEl('div', 'options-row options-row-wide');
    const left = makeEl('div', 'options-row-label', label);
    const right = makeEl('div', 'options-row-control options-row-control-wide');

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.className = 'options-color';

    const text = document.createElement('input');
    text.type = 'text';
    text.className = 'options-number';

    const initial = clampHex(valueHex ?? defaultHex, defaultHex);
    picker.value = colorHexToCss(initial);
    text.value = picker.value.toUpperCase();

    const apply = (rawCss) => {
        const next = cssToColorHex(rawCss, defaultHex);
        picker.value = colorHexToCss(next);
        text.value = picker.value.toUpperCase();
        onChange?.(next);
    };

    picker.addEventListener('input', () => apply(picker.value));
    picker.addEventListener('change', () => apply(picker.value));
    text.addEventListener('change', () => apply(text.value));
    text.addEventListener('blur', () => apply(text.value));

    right.appendChild(picker);
    right.appendChild(text);
    row.appendChild(left);
    row.appendChild(right);
    return { row, picker, text };
}

function resolvePrefabApi(asset) {
    const api = asset?.mesh?.userData?.prefab ?? null;
    const valid = !!api && typeof api === 'object' && !!api.schema && typeof api.getParam === 'function' && typeof api.setParam === 'function';
    return valid ? api : null;
}

function applyOrbitCamera(camera, orbit, { phiMin = 0.08, phiMax = Math.PI - 0.08 } = {}) {
    if (!camera) return;
    const theta = Number(orbit?.theta) || 0;
    const phi = clamp(Number(orbit?.phi) || 1.1, phiMin, phiMax, 1.1);
    const radius = Math.max(0.02, Number(orbit?.radius) || 1.4);
    const target = orbit?.target?.isVector3 ? orbit.target : new THREE.Vector3(0, 0.45, 0);

    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    camera.position.set(
        target.x + radius * sinPhi * sinTheta,
        target.y + radius * cosPhi,
        target.z + radius * sinPhi * cosTheta
    );
    camera.lookAt(target);
}

export class GrassLod1InspectorPopup {
    constructor({ onParamChange } = {}) {
        this.overlay = makeEl('div', 'ui-grass-inspector-overlay hidden');
        this.panel = makeEl('div', 'ui-panel is-interactive ui-grass-inspector-panel');
        this.header = makeEl('div', 'ui-grass-inspector-header');
        this.titleEl = makeEl('div', 'ui-title ui-grass-inspector-title', 'LOD 1 Grass Inspector');
        this.subtitleEl = makeEl('div', 'ui-grass-inspector-subtitle', 'LMB rotate · MMB pan · Wheel zoom');
        this.closeBtn = makeEl('button', 'ui-grass-inspector-close', 'Close');
        this.closeBtn.type = 'button';

        const headerText = makeEl('div', 'ui-grass-inspector-header-text');
        headerText.appendChild(this.titleEl);
        headerText.appendChild(this.subtitleEl);

        this.header.appendChild(headerText);
        this.header.appendChild(this.closeBtn);

        this.content = makeEl('div', 'ui-grass-inspector-content');
        this.viewport = makeEl('div', 'ui-grass-inspector-viewport');
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'ui-grass-inspector-canvas';
        this.viewport.appendChild(this.canvas);

        this.controls = makeEl('div', 'ui-grass-inspector-controls options-panel ui-panel is-interactive');

        this.content.appendChild(this.viewport);
        this.content.appendChild(this.controls);

        this.panel.appendChild(this.header);
        this.panel.appendChild(this.content);
        this.overlay.appendChild(this.panel);

        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this._raf = 0;

        this._asset = null;
        this._prefab = null;
        this._onParamChange = typeof onParamChange === 'function' ? onParamChange : null;

        this._orbit = {
            active: false,
            mode: 'orbit',
            pointerId: null,
            startX: 0,
            startY: 0,
            startTarget: new THREE.Vector3(),
            startTheta: 0,
            startPhi: 0,
            theta: 0.95,
            phi: 1.0,
            radius: 1.6,
            target: new THREE.Vector3(0, 0.35, 0)
        };

        this._pan = {
            right: new THREE.Vector3(),
            up: new THREE.Vector3(),
            tmp: new THREE.Vector3()
        };

        this._onOverlayClick = (e) => {
            if (e?.target === this.overlay) this.close();
        };
        this._onClose = () => this.close();
        this._onResize = () => this._resize();
        this._onKeyDownCapture = (e) => {
            if (!e) return;
            if (e.key !== 'Escape' && e.code !== 'Escape') return;
            e.preventDefault();
            e.stopImmediatePropagation?.();
            this.close();
        };

        this._onPointerDown = (e) => this._handlePointerDown(e);
        this._onPointerMove = (e) => this._handlePointerMove(e);
        this._onPointerUp = (e) => this._handlePointerUp(e);
        this._onWheel = (e) => this._handleWheel(e);
    }

    isOpen() {
        return this.overlay.isConnected && !this.overlay.classList.contains('hidden');
    }

    open({ asset, title = null } = {}) {
        if (this.isOpen()) this.close();
        const nextAsset = asset && typeof asset === 'object' ? asset : null;
        if (!nextAsset?.mesh) return;

        this._asset = nextAsset;
        this._prefab = resolvePrefabApi(nextAsset);
        if (!this._prefab) return;

        if (title) this.titleEl.textContent = String(title);

        if (!this.overlay.isConnected) document.body.appendChild(this.overlay);
        this.overlay.classList.remove('hidden');
        this._bind();
        this._initRendererIfNeeded();
        this._syncScene();
        this._buildControls();
        this._resize();
        this._startLoop();
    }

    close() {
        if (!this.isOpen()) return;
        this.overlay.classList.add('hidden');
        this._unbind();
        this._stopLoop();
        this._detachAssetFromScene();
        this._asset = null;
        this._prefab = null;
    }

    dispose() {
        this.close();
        this._disposeRenderer();
        this.overlay.remove();
    }

    _bind() {
        this.overlay.addEventListener('click', this._onOverlayClick);
        this.closeBtn.addEventListener('click', this._onClose);
        window.addEventListener('resize', this._onResize, { passive: true });
        window.addEventListener('keydown', this._onKeyDownCapture, { passive: false, capture: true });

        this.canvas.addEventListener('pointerdown', this._onPointerDown, { passive: false });
        window.addEventListener('pointermove', this._onPointerMove, { passive: false });
        window.addEventListener('pointerup', this._onPointerUp, { passive: false });
        this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
    }

    _unbind() {
        this.overlay.removeEventListener('click', this._onOverlayClick);
        this.closeBtn.removeEventListener('click', this._onClose);
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('keydown', this._onKeyDownCapture, { capture: true });

        this.canvas.removeEventListener('pointerdown', this._onPointerDown);
        window.removeEventListener('pointermove', this._onPointerMove);
        window.removeEventListener('pointerup', this._onPointerUp);
        this.canvas.removeEventListener('wheel', this._onWheel);
    }

    _initRendererIfNeeded() {
        if (this.renderer) return;

        const renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

        if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
        else renderer.outputEncoding = THREE.sRGBEncoding;

        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b0f16);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x1b2b18, 0.6);
        hemi.position.set(0, 2, 0);
        scene.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 1.05);
        sun.position.set(2.5, 4.0, 2.0);
        scene.add(sun);

        const floorGeo = new THREE.PlaneGeometry(2.2, 2.2, 1, 1);
        floorGeo.rotateX(-Math.PI * 0.5);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x1b2330, roughness: 1.0, metalness: 0.0 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.y = -0.001;
        scene.add(floor);

        const grid = new THREE.GridHelper(2.2, 22, 0x2f2f2f, 0x2f2f2f);
        grid.position.y = 0.0;
        scene.add(grid);

        const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
        camera.position.set(1.4, 1.1, 1.4);

        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
    }

    _disposeRenderer() {
        this._detachAssetFromScene();
        this.scene = null;
        this.camera = null;
        this.renderer?.dispose?.();
        this.renderer = null;
    }

    _detachAssetFromScene() {
        const scene = this.scene;
        const mesh = this._asset?.mesh ?? null;
        if (!scene || !mesh) return;
        scene.remove(mesh);
    }

    _syncScene() {
        const scene = this.scene;
        const camera = this.camera;
        const mesh = this._asset?.mesh ?? null;
        if (!scene || !camera || !mesh) return;
        if (!mesh.parent) scene.add(mesh);
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.frustumCulled = false;

        this._orbit.target.set(0, 0.35, 0);
        this._orbit.radius = 1.35;
        applyOrbitCamera(camera, this._orbit);
    }

    _buildControls() {
        const prefab = this._prefab;
        const asset = this._asset;
        if (!prefab || !asset) return;

        this.controls.textContent = '';

        const previewRow = makeSelectRow({
            label: 'Preview',
            value: this._previewMode ?? 'single',
            options: [
                { id: 'single', label: 'Single blade' },
                { id: 'tuft', label: 'Tuft' }
            ],
            onChange: (mode) => {
                const next = mode === 'tuft' ? 'tuft' : 'single';
                this._previewMode = next;
                const max = Number(prefab?.schema?.properties?.find?.((p) => p?.id === 'count')?.max ?? 9) || 9;
                const count = next === 'tuft' ? Math.min(9, Math.max(2, Math.floor(max))) : 1;
                prefab.setParam?.('count', count);
                this._onParamChange?.({ propId: 'count', value: prefab.getParam?.('count') });
            }
        });
        this.controls.appendChild(previewRow.row);

        const allow = new Set([
            'baseColorHex',
            'tipColorHex',
            'roughness',
            'metalness',
            'bladeBendDegrees',
            'bendDegrees',
            'curvature',
            'edgeTintHex',
            'edgeTintStrength',
            'grazingShine',
            'grazingShineRoughness'
        ]);

        const props = Array.isArray(prefab?.schema?.properties) ? prefab.schema.properties : [];
        for (const prop of props) {
            const propId = typeof prop?.id === 'string' ? prop.id : '';
            if (!propId || !allow.has(propId)) continue;

            if (prop?.type === 'color') {
                const defaultHex = clampHex(prop.defaultValue, 0xffffff);
                const current = prefab.getParam?.(propId);
                const valueHex = clampHex(current ?? defaultHex, defaultHex);
                const row = makeColorRow({
                    label: prop?.label ?? propId,
                    valueHex,
                    defaultHex,
                    onChange: (hex) => {
                        prefab.setParam?.(propId, hex);
                        this._onParamChange?.({ propId, value: prefab.getParam?.(propId) });
                    }
                });
                this.controls.appendChild(row.row);
                continue;
            }

            if (prop?.type === 'number') {
                const min = Number.isFinite(prop?.min) ? prop.min : 0;
                const max = Number.isFinite(prop?.max) ? prop.max : 1;
                const step = Number.isFinite(prop?.step) ? prop.step : 0.01;
                const current = Number(prefab.getParam?.(propId) ?? prop.defaultValue ?? 0);

                const row = makeNumberSliderRow({
                    label: prop?.label ?? propId,
                    value: current,
                    min,
                    max,
                    step,
                    digits: Math.abs(step) >= 1 ? 0 : 2,
                    onChange: (v) => {
                        prefab.setParam?.(propId, v);
                        this._onParamChange?.({ propId, value: prefab.getParam?.(propId) });
                    }
                });
                this.controls.appendChild(row.row);
            }
        }
    }

    _resize() {
        const renderer = this.renderer;
        const camera = this.camera;
        if (!renderer || !camera) return;
        const rect = this.viewport.getBoundingClientRect?.() ?? null;
        const w = Math.max(1, Number(rect?.width) || 1);
        const h = Math.max(1, Number(rect?.height) || 1);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    _startLoop() {
        if (this._raf) return;
        const loop = () => {
            this._raf = requestAnimationFrame(loop);
            if (!this.isOpen()) return;
            applyOrbitCamera(this.camera, this._orbit);
            this.renderer?.render?.(this.scene, this.camera);
        };
        this._raf = requestAnimationFrame(loop);
    }

    _stopLoop() {
        if (!this._raf) return;
        cancelAnimationFrame(this._raf);
        this._raf = 0;
    }

    _handlePointerDown(e) {
        if (!e) return;
        if (e.pointerType === 'touch') return;
        const button = Number(e.button);
        if (button !== 0 && button !== 1 && button !== 2) return;

        const orbit = this._orbit;
        orbit.mode = button === 1 ? 'pan' : 'orbit';
        this._orbit.active = true;
        this._orbit.pointerId = e.pointerId;
        this._orbit.startX = e.clientX;
        this._orbit.startY = e.clientY;
        this._orbit.startTheta = this._orbit.theta;
        this._orbit.startPhi = this._orbit.phi;
        this._orbit.startTarget.copy(this._orbit.target);
        try {
            this.canvas.setPointerCapture(e.pointerId);
        } catch {}
        e.preventDefault?.();
        e.stopImmediatePropagation?.();
    }

    _handlePointerMove(e) {
        if (!e) return;
        if (!this._orbit.active || e.pointerId !== this._orbit.pointerId) return;
        const dx = (e.clientX - this._orbit.startX) || 0;
        const dy = (e.clientY - this._orbit.startY) || 0;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;

        if (this._orbit.mode === 'pan') {
            const camera = this.camera;
            const rect = this.viewport.getBoundingClientRect?.() ?? null;
            const h = Math.max(1, Number(rect?.height) || 1);
            if (!camera) return;
            camera.updateMatrixWorld?.();

            const distance = Math.max(EPS, Number(this._orbit.radius) || 1.0);
            const fovRad = (Number(camera.fov) || 45) * (Math.PI / 180);
            const viewH = 2 * Math.tan(fovRad * 0.5) * distance;
            const perPx = viewH / h;

            const pan = this._pan;
            pan.right.setFromMatrixColumn(camera.matrixWorld, 0);
            pan.up.setFromMatrixColumn(camera.matrixWorld, 1);
            pan.tmp.copy(pan.right).multiplyScalar(-dx * perPx);
            pan.tmp.addScaledVector(pan.up, dy * perPx);
            this._orbit.target.copy(this._orbit.startTarget).add(pan.tmp);
        } else {
            this._orbit.theta = this._orbit.startTheta - dx * 0.01;
            this._orbit.phi = clamp(this._orbit.startPhi - dy * 0.01, 0.08, Math.PI - 0.08, this._orbit.startPhi);
        }

        e.preventDefault?.();
        e.stopImmediatePropagation?.();
    }

    _handlePointerUp(e) {
        if (!e) return;
        if (e.pointerType === 'touch') return;
        if (e.pointerId !== this._orbit.pointerId) return;
        this._orbit.active = false;
        this._orbit.pointerId = null;
        try {
            this.canvas.releasePointerCapture(e.pointerId);
        } catch {}
        e.preventDefault?.();
        e.stopImmediatePropagation?.();
    }

    _handleWheel(e) {
        if (!e) return;
        e.preventDefault?.();
        const dy = clamp(e.deltaY, -250, 250, 0);
        const amt = dy * 0.002;
        this._orbit.radius = clamp(this._orbit.radius + amt, 0.2, 12.0, this._orbit.radius);
        e.stopImmediatePropagation?.();
    }
}
