// src/graphics/gui/ao_foliage_debugger/view/AOFoliageDebuggerView.js
// Minimal scene for validating AO alpha foliage handling.
// @ts-check

import * as THREE from 'three';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { createToolCameraController } from '../../../engine3d/camera/ToolCameraPrefab.js';
import { getResolvedAmbientOcclusionSettings } from '../../../visuals/postprocessing/AmbientOcclusionSettings.js';
import { getResolvedAntiAliasingSettings, sanitizeAntiAliasingSettings } from '../../../visuals/postprocessing/AntiAliasingSettings.js';
import { PostProcessingPipeline } from '../../../visuals/postprocessing/PostProcessingPipeline.js';
import { OptionsUI } from '../../options/OptionsUI.js';

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function getCanvasSizePx(canvas, pixelRatio) {
    const rect = canvas?.getBoundingClientRect?.() ?? null;
    const wCss = Math.max(1, Math.floor(Number(rect?.width) || 1));
    const hCss = Math.max(1, Math.floor(Number(rect?.height) || 1));
    const pr = Math.max(0.1, Number(pixelRatio) || 1);
    return { wCss, hCss, pr };
}

export class AOFoliageDebuggerView {
    constructor({ canvas }) {
        this.canvas = canvas;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this._pipeline = null;
        this._ui = null;
        this._raf = 0;
        this._lastT = 0;
        this._onResize = () => this._resize();
        this.onFrame = null;
    }

    async start() {
        const canvas = this.canvas;

        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance'
        });
        this.renderer.setClearColor(0x0b0f14, 1);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b0f14);

        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);

        const hemi = new THREE.HemisphereLight(0xd7f1ff, 0x2c2b33, 0.75);
        hemi.position.set(0, 1, 0);
        this.scene.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(10, 14, 8);
        this.scene.add(sun);

        await this._initReproScene();

        const initialAa = sanitizeAntiAliasingSettings(getResolvedAntiAliasingSettings({ includeUrlOverrides: true }));
        const initialAo = getResolvedAmbientOcclusionSettings({ includeUrlOverrides: true });
        if (initialAo.mode === 'off') initialAo.mode = 'ssao';

        this._pipeline = new PostProcessingPipeline({
            renderer: this.renderer,
            scene: this.scene,
            camera: this.camera,
            bloom: { enabled: false },
            sunBloom: { enabled: false },
            colorGrading: null,
            antiAliasing: initialAa,
            ambientOcclusion: initialAo
        });

        this._ui = new OptionsUI({
            visibleTabs: ['graphics'],
            initialTab: 'graphics',
            titleText: 'AO Foliage Debugger',
            subtitleText: 'Esc returns to the Welcome screen',
            initialAntiAliasing: initialAa,
            initialAmbientOcclusion: initialAo,
            onLiveChange: (draft) => {
                this._pipeline?.setAntiAliasing?.(draft?.antiAliasing ?? null);
                this._pipeline?.setAmbientOcclusion?.(draft?.ambientOcclusion ?? null);
            }
        });
        this._ui.mount();

        this.controls = createToolCameraController(this.camera, canvas, {
            uiRoot: this._ui.root,
            enabled: true,
            enableDamping: true,
            dampingFactor: 0.08,
            rotateSpeed: 0.9,
            panSpeed: 0.85,
            zoomSpeed: 1.0,
            minDistance: 0.35,
            maxDistance: 160,
            minPolarAngle: 0.001,
            maxPolarAngle: Math.PI - 0.001,
            getFocusTarget: () => ({ center: new THREE.Vector3(0, 1.2, 0), radius: 6 }),
            initialPose: {
                position: new THREE.Vector3(0, 1.4, 4.4),
                target: new THREE.Vector3(0, 1.2, -0.6)
            }
        });

        window.addEventListener('resize', this._onResize, { passive: true });
        this._resize();
        this._lastT = performance.now();
        this._raf = requestAnimationFrame((t) => this._tick(t));
    }

    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = 0;
        window.removeEventListener('resize', this._onResize);
        this.controls?.dispose?.();
        this.controls = null;
        this._ui?.unmount?.();
        this._ui = null;
        this._pipeline?.dispose?.();
        this._pipeline = null;
        this.renderer?.dispose?.();
        this.renderer = null;
        this.scene = null;
        this.camera = null;
    }

    _resize() {
        if (!this.renderer || !this.camera || !this.canvas) return;
        const pr = this.renderer.getPixelRatio?.() ?? (window.devicePixelRatio || 1);
        const size = getCanvasSizePx(this.canvas, pr);
        this.renderer.setSize(size.wCss, size.hCss, false);
        this.camera.aspect = size.wCss / Math.max(1, size.hCss);
        this.camera.updateProjectionMatrix();
        this._pipeline?.setPixelRatio?.(pr);
        this._pipeline?.setSize?.(size.wCss, size.hCss);
    }

    _tick(t) {
        const renderer = this.renderer;
        const pipeline = this._pipeline;
        if (!renderer || !pipeline) return;

        const now = Number(t) || 0;
        const dt = this._lastT ? Math.min(0.05, Math.max(0, (now - this._lastT) / 1000)) : 0;
        this._lastT = now;

        this.controls?.update?.(dt);
        pipeline.render(dt);

        const onFrame = this.onFrame;
        if (typeof onFrame === 'function') onFrame({ dt, nowMs: now, renderer });
        this._raf = requestAnimationFrame((ts) => this._tick(ts));
    }

    async _initReproScene() {
        if (!this.scene) return;

        const loader = new TGALoader();
        const leafMap = await loader.loadAsync(new URL('../../../../../assets/trees/Textures/T_Leaf_Realistic9.TGA', import.meta.url).toString());
        applyTextureColorSpace(leafMap, { srgb: true });
        leafMap.anisotropy = 8;
        leafMap.needsUpdate = true;

        const groundMat = new THREE.MeshStandardMaterial({ color: 0x1d232b, roughness: 1.0, metalness: 0.0 });
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, 0, 0);
        ground.receiveShadow = true;
        this.scene.add(ground);

        const wallMat = new THREE.MeshStandardMaterial({ color: 0xd7dde7, roughness: 0.9, metalness: 0.0 });
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), wallMat);
        wall.position.set(0, 1.5, -2.0);
        wall.receiveShadow = true;
        this.scene.add(wall);

        const leafCutout = new THREE.MeshStandardMaterial({
            map: leafMap,
            roughness: 0.95,
            metalness: 0.0,
            alphaTest: 0.5,
            side: THREE.DoubleSide
        });
        leafCutout.userData.isFoliage = true;

        const leafTransparent = new THREE.MeshStandardMaterial({
            map: leafMap,
            roughness: 0.95,
            metalness: 0.0,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        leafTransparent.userData.isFoliage = true;

        const leafGeo = new THREE.PlaneGeometry(2.2, 2.2);
        const leafA = new THREE.Mesh(leafGeo, leafCutout);
        leafA.position.set(-1.4, 1.2, -1.6);
        leafA.rotation.y = Math.PI * 0.12;
        this.scene.add(leafA);

        const leafB = new THREE.Mesh(leafGeo, leafTransparent);
        leafB.position.set(1.4, 1.2, -1.6);
        leafB.rotation.y = -Math.PI * 0.12;
        this.scene.add(leafB);

        const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.6), new THREE.MeshStandardMaterial({ color: 0x4a515e, roughness: 1.0, metalness: 0.0 }));
        base.position.set(0, 0.175, -0.4);
        base.castShadow = true;
        base.receiveShadow = true;
        this.scene.add(base);
    }
}

