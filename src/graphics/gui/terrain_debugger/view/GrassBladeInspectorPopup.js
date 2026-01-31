// src/graphics/gui/terrain_debugger/view/GrassBladeInspectorPopup.js
// Popup viewport for inspecting grass blade/tuft geometry with a separate renderer.
// @ts-check

import * as THREE from 'three';
import { createGrassBladeGeometry, createGrassBladeTuftGeometry } from '../../../engine3d/grass/GrassGeometry.js';

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

export class GrassBladeInspectorPopup {
    constructor() {
        this.overlay = makeEl('div', 'ui-grass-inspector-overlay hidden');
        this.panel = makeEl('div', 'ui-panel is-interactive ui-grass-inspector-panel');
        this.header = makeEl('div', 'ui-grass-inspector-header');
        this.titleEl = makeEl('div', 'ui-title ui-grass-inspector-title', 'Grass Inspector');
        this.subtitleEl = makeEl('div', 'ui-grass-inspector-subtitle', 'Drag to rotate · Wheel to zoom');
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

        this._state = {
            mode: 'tuft',
            bladesPerTuft: 9,
            tuftRadius: 1.6,
            bladeWidthMeters: 0.01,
            bladeHeightMeters: 0.04,
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

        this._bladeGeo = null;
        this._tuftGeo = null;
        this._bladeMesh = null;
        this._tuftMesh = null;
        this._material = null;

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

    open({
        mode = null,
        bladesPerTuft = null,
        tuftRadius = null,
        bladeWidthMeters = null,
        bladeHeightMeters = null,
        roughness = null,
        metalness = null
    } = {}) {
        if (mode === 'blade' || mode === 'tuft') this._state.mode = mode;
        if (bladesPerTuft !== null) this._state.bladesPerTuft = Math.round(clamp(bladesPerTuft, 1, 32, this._state.bladesPerTuft));
        if (tuftRadius !== null) this._state.tuftRadius = clamp(tuftRadius, 0.0, 2.0, this._state.tuftRadius);
        if (bladeWidthMeters !== null) this._state.bladeWidthMeters = clamp(bladeWidthMeters, 0.001, 0.25, this._state.bladeWidthMeters);
        if (bladeHeightMeters !== null) this._state.bladeHeightMeters = clamp(bladeHeightMeters, 0.02, 2.5, this._state.bladeHeightMeters);
        if (roughness !== null) this._state.roughness = clamp(roughness, 0.0, 1.0, this._state.roughness);
        if (metalness !== null) this._state.metalness = clamp(metalness, 0.0, 1.0, this._state.metalness);

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

        const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
        camera.position.set(1.4, 1.1, 1.4);
        camera.lookAt(this._orbit.target);

        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        this._bladeGeo = createGrassBladeGeometry();
        this._tuftGeo = createGrassBladeTuftGeometry({
            bladesPerTuft: this._state.bladesPerTuft,
            radius: this._state.tuftRadius,
            seed: 'inspector_tuft'
        });

        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
        mat.roughness = this._state.roughness;
        mat.metalness = this._state.metalness;
        this._material = mat;

        this._bladeMesh = new THREE.Mesh(this._bladeGeo, mat);
        this._bladeMesh.name = 'Blade';
        scene.add(this._bladeMesh);

        this._tuftMesh = new THREE.Mesh(this._tuftGeo, mat);
        this._tuftMesh.name = 'Tuft';
        scene.add(this._tuftMesh);
    }

    _disposeRenderer() {
        this._bladeMesh?.removeFromParent?.();
        this._tuftMesh?.removeFromParent?.();
        this._bladeGeo?.dispose?.();
        this._tuftGeo?.dispose?.();
        this._material?.dispose?.();
        this.renderer?.dispose?.();

        this._bladeGeo = null;
        this._tuftGeo = null;
        this._bladeMesh = null;
        this._tuftMesh = null;
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

        const modeSection = makeSection('View');
        const modeWrap = makeEl('div', 'options-choice-group');
        const btnBlade = makeEl('button', 'options-choice-btn', 'Blade');
        const btnTuft = makeEl('button', 'options-choice-btn', 'Tuft');
        btnBlade.type = 'button';
        btnTuft.type = 'button';
        const syncModeButtons = () => {
            btnBlade.classList.toggle('is-active', this._state.mode === 'blade');
            btnTuft.classList.toggle('is-active', this._state.mode === 'tuft');
        };
        btnBlade.addEventListener('click', () => {
            this._state.mode = 'blade';
            syncModeButtons();
            this._syncScene();
        });
        btnTuft.addEventListener('click', () => {
            this._state.mode = 'tuft';
            syncModeButtons();
            this._syncScene();
        });
        modeWrap.appendChild(btnBlade);
        modeWrap.appendChild(btnTuft);
        syncModeButtons();
        modeSection.appendChild(makeRow('Mode', modeWrap));

        const tuftSection = makeSection('Tuft');
        const bladesInput = document.createElement('input');
        bladesInput.type = 'number';
        bladesInput.className = 'options-number';
        bladesInput.min = '1';
        bladesInput.max = '32';
        bladesInput.step = '1';
        bladesInput.value = String(this._state.bladesPerTuft);
        bladesInput.addEventListener('input', () => {
            this._state.bladesPerTuft = Math.round(clamp(bladesInput.value, 1, 32, this._state.bladesPerTuft));
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

        const scaleSection = makeSection('Scale');
        const widthInput = document.createElement('input');
        widthInput.type = 'number';
        widthInput.className = 'options-number';
        widthInput.min = '0.001';
        widthInput.max = '1.0';
        widthInput.step = '0.001';
        widthInput.value = String(this._state.bladeWidthMeters.toFixed(3));
        widthInput.addEventListener('input', () => {
            const v = clamp(widthInput.value, 0.001, 1.0, this._state.bladeWidthMeters);
            this._state.bladeWidthMeters = v;
            widthInput.value = String(v.toFixed(3));
            this._syncScene();
        });
        scaleSection.appendChild(makeRow('Width (m)', widthInput));

        const heightInput = document.createElement('input');
        heightInput.type = 'number';
        heightInput.className = 'options-number';
        heightInput.min = '0.005';
        heightInput.max = '2.0';
        heightInput.step = '0.005';
        heightInput.value = String(this._state.bladeHeightMeters.toFixed(2));
        heightInput.addEventListener('input', () => {
            const v = clamp(heightInput.value, 0.005, 2.0, this._state.bladeHeightMeters);
            this._state.bladeHeightMeters = v;
            heightInput.value = String(v.toFixed(2));
            this._syncScene();
        });
        scaleSection.appendChild(makeRow('Height (m)', heightInput));

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

        this.controls.appendChild(modeSection);
        this.controls.appendChild(tuftSection);
        this.controls.appendChild(scaleSection);
        this.controls.appendChild(materialSection);
    }

    _rebuildTuftGeometry() {
        if (!this.scene || !this._tuftMesh) return;
        const prev = this._tuftGeo;
        const next = createGrassBladeTuftGeometry({
            bladesPerTuft: this._state.bladesPerTuft,
            radius: this._state.tuftRadius,
            seed: 'inspector_tuft'
        });
        this._tuftGeo = next;
        this._tuftMesh.geometry = next;
        prev?.dispose?.();
        this._syncScene();
    }

    _syncScene() {
        if (!this._bladeMesh || !this._tuftMesh) return;

        const w = this._state.bladeWidthMeters;
        const h = this._state.bladeHeightMeters;
        this._bladeMesh.scale.set(w, h, w);
        this._tuftMesh.scale.set(w, h, w);

        this._bladeMesh.visible = this._state.mode === 'blade';
        this._tuftMesh.visible = this._state.mode === 'tuft';
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
