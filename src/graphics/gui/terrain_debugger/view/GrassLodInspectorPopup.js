// src/graphics/gui/terrain_debugger/view/GrassLodInspectorPopup.js
// Popup viewport for inspecting and editing a single grass LOD tier with a separate renderer.
// @ts-check

import * as THREE from 'three';
import { createGrassBladeTuftGeometry, createGrassCrossGeometry, createGrassStarGeometry } from '../../../engine3d/grass/GrassGeometry.js';

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

function formatTierLabel(tier) {
    const t = String(tier ?? '');
    if (t === 'master') return 'Master';
    if (t === 'near') return 'Near';
    if (t === 'mid') return 'Mid';
    if (t === 'far') return 'Far';
    return 'LOD';
}

function sanitizeTier(tier, fallback = 'near') {
    const t = String(tier ?? '');
    if (t === 'master' || t === 'near' || t === 'mid' || t === 'far') return t;
    return String(fallback);
}

function sanitizeRenderMode(mode, fallback) {
    const m = String(mode ?? '');
    if (m === 'tuft' || m === 'star' || m === 'cross' || m === 'cross_sparse' || m === 'none') return m;
    return String(fallback ?? 'cross');
}

export class GrassLodInspectorPopup {
    constructor() {
        this.overlay = makeEl('div', 'ui-grass-inspector-overlay hidden');
        this.panel = makeEl('div', 'ui-panel is-interactive ui-grass-inspector-panel');
        this.header = makeEl('div', 'ui-grass-inspector-header');
        this.titleEl = makeEl('div', 'ui-title ui-grass-inspector-title', 'Grass LOD Inspector');
        this.subtitleEl = makeEl('div', 'ui-grass-inspector-subtitle', 'Drag to rotate · Wheel to zoom');

        this.saveBtn = makeEl('button', 'ui-grass-inspector-close', 'Save');
        this.saveBtn.type = 'button';
        this.closeBtn = makeEl('button', 'ui-grass-inspector-close', 'Close');
        this.closeBtn.type = 'button';

        const headerText = makeEl('div', 'ui-grass-inspector-header-text');
        headerText.appendChild(this.titleEl);
        headerText.appendChild(this.subtitleEl);

        const headerBtns = makeEl('div', null);
        headerBtns.style.display = 'flex';
        headerBtns.style.gap = '8px';
        headerBtns.appendChild(this.saveBtn);
        headerBtns.appendChild(this.closeBtn);

        this.header.appendChild(headerText);
        this.header.appendChild(headerBtns);

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

        this._state = {
            tier: 'near',
            renderMode: 'star',
            densityMul: 1.0,
            bladesPerTuft: 9,
            tuftRadius: 1.6,
            bladeWidthMeters: 0.01,
            heightMult: 1.0,
            fieldHeightMinMeters: 0.03,
            fieldHeightMaxMeters: 0.05,
            roughness: 1.0,
            metalness: 0.0
        };

        this._orbit = {
            active: false,
            pointerId: null,
            startX: 0,
            startY: 0,
            theta: 0.95,
            phi: 1.0,
            radius: 1.6,
            target: new THREE.Vector3(0, 0.35, 0)
        };

        this._tuftGeo = null;
        this._starGeo = null;
        this._crossGeo = null;
        this._tuftMesh = null;
        this._starMesh = null;
        this._crossMesh = null;
        this._material = null;

        this._onSave = null;

        this._onOverlayClick = (e) => {
            if (e?.target === this.overlay) this.close();
        };
        this._onClose = () => this.close();
        this._onSaveClick = () => this._handleSave();
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

    open({
        tier = null,
        renderMode = null,
        densityMul = null,
        bladesPerTuft = null,
        tuftRadius = null,
        bladeWidthMeters = null,
        heightMult = null,
        fieldHeightMinMeters = null,
        fieldHeightMaxMeters = null,
        roughness = null,
        metalness = null,
        onSave = null
    } = {}) {
        this._onSave = typeof onSave === 'function' ? onSave : null;

        if (tier !== null) this._state.tier = sanitizeTier(tier, this._state.tier);
        const defaultMode = this._state.tier === 'master' ? 'tuft' : (this._state.tier === 'near' ? 'star' : 'cross');
        if (renderMode !== null) this._state.renderMode = sanitizeRenderMode(renderMode, defaultMode);
        if (densityMul !== null) this._state.densityMul = clamp(densityMul, 0.0, 20.0, this._state.densityMul);
        if (bladesPerTuft !== null) this._state.bladesPerTuft = Math.round(clamp(bladesPerTuft, 1, 64, this._state.bladesPerTuft));
        if (tuftRadius !== null) this._state.tuftRadius = clamp(tuftRadius, 0.0, 6.0, this._state.tuftRadius);
        if (bladeWidthMeters !== null) this._state.bladeWidthMeters = clamp(bladeWidthMeters, 0.001, 0.25, this._state.bladeWidthMeters);
        if (heightMult !== null) this._state.heightMult = clamp(heightMult, 0.05, 10.0, this._state.heightMult);
        if (fieldHeightMinMeters !== null) this._state.fieldHeightMinMeters = clamp(fieldHeightMinMeters, 0.01, 5.0, this._state.fieldHeightMinMeters);
        if (fieldHeightMaxMeters !== null) this._state.fieldHeightMaxMeters = clamp(fieldHeightMaxMeters, 0.01, 5.0, this._state.fieldHeightMaxMeters);
        if (this._state.fieldHeightMaxMeters < this._state.fieldHeightMinMeters) this._state.fieldHeightMaxMeters = this._state.fieldHeightMinMeters;
        if (roughness !== null) this._state.roughness = clamp(roughness, 0.0, 1.0, this._state.roughness);
        if (metalness !== null) this._state.metalness = clamp(metalness, 0.0, 1.0, this._state.metalness);

        this.titleEl.textContent = `Grass LOD Inspector (${formatTierLabel(this._state.tier)})`;

        if (!this.overlay.isConnected) document.body.appendChild(this.overlay);
        this.overlay.classList.remove('hidden');
        this._bind();
        this._initRendererIfNeeded();
        this._buildControls();
        this._syncScene();
        this._resize();
        this._startLoop();
    }

    close() {
        if (!this.isOpen()) return;
        this.overlay.classList.add('hidden');
        this._unbind();
        this._stopLoop();
        this._onSave = null;
    }

    dispose() {
        this.close();
        this._disposeRenderer();
        this.overlay.remove();
    }

    _bind() {
        this.overlay.addEventListener('click', this._onOverlayClick);
        this.closeBtn.addEventListener('click', this._onClose);
        this.saveBtn.addEventListener('click', this._onSaveClick);
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
        this.saveBtn.removeEventListener('click', this._onSaveClick);
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

        const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
        camera.position.set(1.4, 1.1, 1.4);
        camera.lookAt(this._orbit.target);

        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        this._tuftGeo = createGrassBladeTuftGeometry({
            bladesPerTuft: this._state.bladesPerTuft,
            radius: this._state.tuftRadius,
            seed: 'lod_inspector_tuft'
        });
        this._starGeo = createGrassStarGeometry();
        this._crossGeo = createGrassCrossGeometry();

        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
        mat.roughness = this._state.roughness;
        mat.metalness = this._state.metalness;
        this._material = mat;

        this._tuftMesh = new THREE.Mesh(this._tuftGeo, mat);
        this._tuftMesh.name = 'Tuft';
        scene.add(this._tuftMesh);

        this._starMesh = new THREE.Mesh(this._starGeo, mat);
        this._starMesh.name = 'Star';
        scene.add(this._starMesh);

        this._crossMesh = new THREE.Mesh(this._crossGeo, mat);
        this._crossMesh.name = 'Cross';
        scene.add(this._crossMesh);
    }

    _disposeRenderer() {
        this._tuftMesh?.removeFromParent?.();
        this._starMesh?.removeFromParent?.();
        this._crossMesh?.removeFromParent?.();
        this._tuftGeo?.dispose?.();
        this._starGeo?.dispose?.();
        this._crossGeo?.dispose?.();
        this._material?.dispose?.();
        this.renderer?.dispose?.();

        this._tuftGeo = null;
        this._starGeo = null;
        this._crossGeo = null;
        this._tuftMesh = null;
        this._starMesh = null;
        this._crossMesh = null;
        this._material = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
    }

    _buildControls() {
        this.controls.textContent = '';

        const makeSection = (title) => {
            const section = makeEl('div', 'options-section');
            const header = makeEl('div', 'options-section-header');
            const t = makeEl('div', 'options-section-title', title);
            header.appendChild(t);
            section.appendChild(header);
            return section;
        };

        const makeRow = (label, controlEl) => {
            const row = makeEl('div', 'options-row options-row-wide');
            row.appendChild(makeEl('div', 'options-row-label', label));
            const right = makeEl('div', 'options-row-control options-row-control-wide');
            right.appendChild(controlEl);
            row.appendChild(right);
            return row;
        };

        const lodSection = makeSection('LOD');

        const modeSelect = document.createElement('select');
        modeSelect.className = 'options-select';
        const modeOptions = [
            { id: 'tuft', label: 'True 3D (Tuft)' },
            { id: 'star', label: 'Star' },
            { id: 'cross', label: 'Cross Billboard' },
            { id: 'cross_sparse', label: 'Cross Billboard (Sparse)' },
            { id: 'none', label: 'None' }
        ];
        for (const opt of modeOptions) {
            const el = document.createElement('option');
            el.value = opt.id;
            el.textContent = opt.label;
            modeSelect.appendChild(el);
        }
        modeSelect.value = this._state.renderMode;
        modeSelect.addEventListener('change', () => {
            this._state.renderMode = sanitizeRenderMode(modeSelect.value, this._state.renderMode);
            modeSelect.value = this._state.renderMode;
            this._syncScene();
        });
        lodSection.appendChild(makeRow('Render Mode', modeSelect));

        const densityInput = document.createElement('input');
        densityInput.type = 'number';
        densityInput.className = 'options-number';
        densityInput.min = '0';
        densityInput.max = '20';
        densityInput.step = '0.01';
        densityInput.value = String(this._state.densityMul.toFixed(2));
        densityInput.addEventListener('input', () => {
            const v = clamp(densityInput.value, 0.0, 20.0, this._state.densityMul);
            this._state.densityMul = v;
            densityInput.value = String(v.toFixed(2));
        });
        lodSection.appendChild(makeRow('Density Mul', densityInput));

        const bladeSection = makeSection('Blade');

        const widthInput = document.createElement('input');
        widthInput.type = 'number';
        widthInput.className = 'options-number';
        widthInput.min = '0.001';
        widthInput.max = '0.25';
        widthInput.step = '0.001';
        widthInput.value = String(this._state.bladeWidthMeters.toFixed(3));
        widthInput.addEventListener('input', () => {
            const v = clamp(widthInput.value, 0.001, 0.25, this._state.bladeWidthMeters);
            this._state.bladeWidthMeters = v;
            widthInput.value = String(v.toFixed(3));
            this._syncScene();
        });
        bladeSection.appendChild(makeRow('Width (m)', widthInput));

        const heightMultInput = document.createElement('input');
        heightMultInput.type = 'number';
        heightMultInput.className = 'options-number';
        heightMultInput.min = '0.05';
        heightMultInput.max = '10';
        heightMultInput.step = '0.01';
        heightMultInput.value = String(this._state.heightMult.toFixed(2));
        heightMultInput.addEventListener('input', () => {
            const v = clamp(heightMultInput.value, 0.05, 10.0, this._state.heightMult);
            this._state.heightMult = v;
            heightMultInput.value = String(v.toFixed(2));
            this._syncScene();
        });
        bladeSection.appendChild(makeRow('Height Mult', heightMultInput));

        const hMinInput = document.createElement('input');
        hMinInput.type = 'number';
        hMinInput.className = 'options-number';
        hMinInput.min = '0.01';
        hMinInput.max = '5';
        hMinInput.step = '0.01';
        hMinInput.value = String(this._state.fieldHeightMinMeters.toFixed(2));
        hMinInput.addEventListener('input', () => {
            const v = clamp(hMinInput.value, 0.01, 5.0, this._state.fieldHeightMinMeters);
            this._state.fieldHeightMinMeters = v;
            if (this._state.fieldHeightMaxMeters < v) this._state.fieldHeightMaxMeters = v;
            hMinInput.value = String(v.toFixed(2));
            hMaxInput.value = String(this._state.fieldHeightMaxMeters.toFixed(2));
            this._syncScene();
        });
        bladeSection.appendChild(makeRow('Field Height Min (m)', hMinInput));

        const hMaxInput = document.createElement('input');
        hMaxInput.type = 'number';
        hMaxInput.className = 'options-number';
        hMaxInput.min = '0.01';
        hMaxInput.max = '5';
        hMaxInput.step = '0.01';
        hMaxInput.value = String(this._state.fieldHeightMaxMeters.toFixed(2));
        hMaxInput.addEventListener('input', () => {
            const v = clamp(hMaxInput.value, this._state.fieldHeightMinMeters, 5.0, this._state.fieldHeightMaxMeters);
            this._state.fieldHeightMaxMeters = v;
            hMaxInput.value = String(v.toFixed(2));
            this._syncScene();
        });
        bladeSection.appendChild(makeRow('Field Height Max (m)', hMaxInput));

        const tuftSection = makeSection('Tuft');

        const bladesInput = document.createElement('input');
        bladesInput.type = 'number';
        bladesInput.className = 'options-number';
        bladesInput.min = '1';
        bladesInput.max = '64';
        bladesInput.step = '1';
        bladesInput.value = String(this._state.bladesPerTuft);
        bladesInput.addEventListener('input', () => {
            this._state.bladesPerTuft = Math.round(clamp(bladesInput.value, 1, 64, this._state.bladesPerTuft));
            bladesInput.value = String(this._state.bladesPerTuft);
            this._rebuildTuftGeometry();
        });
        tuftSection.appendChild(makeRow('Blades / Tuft', bladesInput));

        const radiusInput = document.createElement('input');
        radiusInput.type = 'number';
        radiusInput.className = 'options-number';
        radiusInput.min = '0';
        radiusInput.max = '6';
        radiusInput.step = '0.01';
        radiusInput.value = String(this._state.tuftRadius.toFixed(2));
        radiusInput.addEventListener('input', () => {
            const v = clamp(radiusInput.value, 0.0, 6.0, this._state.tuftRadius);
            this._state.tuftRadius = v;
            radiusInput.value = String(v.toFixed(2));
            this._rebuildTuftGeometry();
        });
        tuftSection.appendChild(makeRow('Radius (x width)', radiusInput));

        const materialSection = makeSection('Material');

        const roughInput = document.createElement('input');
        roughInput.type = 'number';
        roughInput.className = 'options-number';
        roughInput.min = '0';
        roughInput.max = '1';
        roughInput.step = '0.01';
        roughInput.value = String(this._state.roughness.toFixed(2));
        roughInput.addEventListener('input', () => {
            const v = clamp(roughInput.value, 0.0, 1.0, this._state.roughness);
            this._state.roughness = v;
            roughInput.value = String(v.toFixed(2));
            if (this._material) this._material.roughness = v;
        });
        materialSection.appendChild(makeRow('Roughness', roughInput));

        const metalInput = document.createElement('input');
        metalInput.type = 'number';
        metalInput.className = 'options-number';
        metalInput.min = '0';
        metalInput.max = '1';
        metalInput.step = '0.01';
        metalInput.value = String(this._state.metalness.toFixed(2));
        metalInput.addEventListener('input', () => {
            const v = clamp(metalInput.value, 0.0, 1.0, this._state.metalness);
            this._state.metalness = v;
            metalInput.value = String(v.toFixed(2));
            if (this._material) this._material.metalness = v;
        });
        materialSection.appendChild(makeRow('Metalness', metalInput));

        this.controls.appendChild(lodSection);
        this.controls.appendChild(bladeSection);
        this.controls.appendChild(tuftSection);
        this.controls.appendChild(materialSection);
    }

    _rebuildTuftGeometry() {
        if (!this.scene || !this._tuftMesh) return;
        const prev = this._tuftGeo;
        const next = createGrassBladeTuftGeometry({
            bladesPerTuft: this._state.bladesPerTuft,
            radius: this._state.tuftRadius,
            seed: 'lod_inspector_tuft'
        });
        this._tuftGeo = next;
        this._tuftMesh.geometry = next;
        prev?.dispose?.();
        this._syncScene();
    }

    _syncScene() {
        if (!this._tuftMesh || !this._starMesh || !this._crossMesh) return;

        const w = this._state.bladeWidthMeters;
        const hMin = this._state.fieldHeightMinMeters;
        const hMax = this._state.fieldHeightMaxMeters;
        const h = Math.max(0.001, ((hMin + hMax) * 0.5) * this._state.heightMult);
        const footprint = w * Math.max(1.0, this._state.tuftRadius * 2.0);

        this._tuftMesh.scale.set(w, h, w);
        this._starMesh.scale.set(footprint, h, footprint);
        this._crossMesh.scale.set(footprint, h, footprint);

        const mode = sanitizeRenderMode(this._state.renderMode, 'cross');
        this._tuftMesh.visible = mode === 'tuft';
        this._starMesh.visible = mode === 'star';
        this._crossMesh.visible = mode === 'cross' || mode === 'cross_sparse';
        if (mode === 'none') {
            this._tuftMesh.visible = false;
            this._starMesh.visible = false;
            this._crossMesh.visible = false;
        }
    }

    _handleSave() {
        if (!this._onSave) return;
        const s = this._state;
        this._onSave({
            tier: sanitizeTier(s.tier),
            renderMode: sanitizeRenderMode(s.renderMode, 'cross'),
            densityMul: clamp(s.densityMul, 0.0, 20.0, s.densityMul),
            bladesPerTuft: Math.round(clamp(s.bladesPerTuft, 1, 64, s.bladesPerTuft)),
            tuftRadius: clamp(s.tuftRadius, 0.0, 6.0, s.tuftRadius),
            bladeWidthMeters: clamp(s.bladeWidthMeters, 0.001, 0.25, s.bladeWidthMeters),
            heightMult: clamp(s.heightMult, 0.05, 10.0, s.heightMult),
            fieldHeightMinMeters: clamp(s.fieldHeightMinMeters, 0.01, 5.0, s.fieldHeightMinMeters),
            fieldHeightMaxMeters: Math.max(
                clamp(s.fieldHeightMinMeters, 0.01, 5.0, s.fieldHeightMinMeters),
                clamp(s.fieldHeightMaxMeters, 0.01, 5.0, s.fieldHeightMaxMeters)
            ),
            roughness: clamp(s.roughness, 0.0, 1.0, s.roughness),
            metalness: clamp(s.metalness, 0.0, 1.0, s.metalness)
        });
        this.close();
    }

    _resize() {
        const renderer = this.renderer;
        const camera = this.camera;
        const canvas = this.canvas;
        if (!renderer || !camera || !canvas) return;

        const rect = this.viewport.getBoundingClientRect?.() ?? null;
        const w = Math.max(1, Math.floor(rect?.width ?? canvas.clientWidth ?? 1));
        const h = Math.max(1, Math.floor(rect?.height ?? canvas.clientHeight ?? 1));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix?.();
    }

    _startLoop() {
        if (this._raf) return;
        const tick = () => {
            this._raf = requestAnimationFrame(tick);
            this._render();
        };
        this._raf = requestAnimationFrame(tick);
    }

    _stopLoop() {
        if (!this._raf) return;
        cancelAnimationFrame(this._raf);
        this._raf = 0;
    }

    _render() {
        const renderer = this.renderer;
        const scene = this.scene;
        const camera = this.camera;
        if (!renderer || !scene || !camera) return;
        this._applyOrbitToCamera();
        renderer.render(scene, camera);
    }

    _applyOrbitToCamera() {
        const cam = this.camera;
        if (!cam) return;
        const o = this._orbit;
        const sinPhi = Math.sin(o.phi);
        const x = o.target.x + o.radius * sinPhi * Math.cos(o.theta);
        const y = o.target.y + o.radius * Math.cos(o.phi);
        const z = o.target.z + o.radius * sinPhi * Math.sin(o.theta);
        cam.position.set(x, y, z);
        cam.lookAt(o.target);
    }

    _handlePointerDown(e) {
        if (!e) return;
        if (e.button !== 0) return;
        e.preventDefault();

        this._orbit.active = true;
        this._orbit.pointerId = e.pointerId;
        this._orbit.startX = e.clientX;
        this._orbit.startY = e.clientY;
        try {
            this.canvas.setPointerCapture?.(e.pointerId);
        } catch {}
    }

    _handlePointerMove(e) {
        const o = this._orbit;
        if (!o.active || o.pointerId !== e.pointerId) return;
        e.preventDefault?.();

        const dx = e.clientX - o.startX;
        const dy = e.clientY - o.startY;
        o.startX = e.clientX;
        o.startY = e.clientY;

        o.theta -= dx * 0.006;
        o.phi -= dy * 0.006;
        o.phi = clamp(o.phi, 0.08, Math.PI - 0.08, o.phi);
    }

    _handlePointerUp(e) {
        const o = this._orbit;
        if (!o.active || o.pointerId !== e.pointerId) return;
        e.preventDefault?.();
        o.active = false;
        o.pointerId = null;
    }

    _handleWheel(e) {
        if (!e) return;
        e.preventDefault();
        const o = this._orbit;
        const delta = clamp(e.deltaY, -200, 200, 0);
        const factor = Math.exp(delta * 0.002);
        o.radius = clamp(o.radius * factor, 0.15, 20.0, o.radius);
    }
}
