// src/app/core/GameEngine.js
import * as THREE from 'three';
import { SimulationContext } from './SimulationContext.js';
import { applyIBLIntensity, applyIBLToScene, getIBLConfig, loadIBLTexture } from '../../graphics/lighting/IBL.js';

export class GameEngine {
    constructor({ canvas }) {
        this.canvas = canvas;

        // Helps in modern Three versions
        if (THREE.ColorManagement) THREE.ColorManagement.enabled = true;

        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true
        });

        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);

        // ✅ CRITICAL: correct output color space (otherwise things look dark/flat)
        if ('outputColorSpace' in this.renderer) {
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        } else {
            // older three.js fallback
            this.renderer.outputEncoding = THREE.sRGBEncoding;
        }

        // ✅ CRITICAL (newer three): keep old light intensity behavior
        // If this is false, your intensity values need to be ~10x-100x higher.
        if ('useLegacyLights' in this.renderer) {
            this.renderer.useLegacyLights = true;
        }

        // ✅ Shadows
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // ✅ Tone mapping
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.6; // try 2.2 if still dark

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
        this.camera.position.set(0, 4, 14);

        this._ibl = null;
        this._iblPromise = null;
        this._initIBL();

        // ✅ SimulationContext owns EventBus, VehicleManager, PhysicsController
        this.simulation = new SimulationContext();

        // ✅ Backward-compatible context proxy
        // Existing code using engine.context.selectedBus will still work
        this._contextProxy = {
            get selectedBusId() { return this._sim.selectedBusId; },
            set selectedBusId(v) { this._sim.selectedBusId = v; },
            get selectedBus() { return this._sim.selectedBus; },
            set selectedBus(v) { this._sim.selectedBus = v; },
            _sim: this.simulation
        };

        this._stateMachine = null;
        this._running = false;
        this._lastT = 0;

        this._onResize = () => this.resize();
        window.addEventListener('resize', this._onResize, { passive: true });
        this.resize();
    }

    _initIBL() {
        const config = getIBLConfig();
        this._ibl = {
            config,
            envMap: null,
            lastState: null,
            scanUntilMs: 0,
            nextScanMs: 0,
            scanIntervalMs: 500,
            scanDurationMs: 2000
        };

        this._iblPromise = loadIBLTexture(this.renderer, config).then((envMap) => {
            this._ibl.envMap = envMap;
            if (envMap) {
                applyIBLToScene(this.scene, envMap, config);
                const now = performance.now();
                this._ibl.scanUntilMs = now + this._ibl.scanDurationMs;
                this._ibl.nextScanMs = 0;
                applyIBLIntensity(this.scene, config, { force: true });
            }
            return envMap;
        }).catch((err) => {
            console.warn('[IBL] Failed to load HDR environment map:', err);
            this._ibl.envMap = null;
            return null;
        });
    }

    /**
     * Backward-compatible context getter.
     * States can use engine.context.selectedBus as before.
     * @returns {object}
     */
    get context() {
        return this._contextProxy;
    }

    setStateMachine(sm) {
        this._stateMachine = sm;
    }

    resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    clearScene() {
        while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
    }

    start() {
        if (this._running) return;
        this._running = true;
        this._lastT = performance.now();
        requestAnimationFrame((t) => this._tick(t));
    }

    stop() {
        this._running = false;
    }

    _tick(t) {
        if (!this._running) return;

        const dt = Math.min((t - this._lastT) / 1000, 0.05);
        this._lastT = t;

        this._stateMachine?.update(dt);

        if (this._ibl?.envMap) {
            const state = this._stateMachine?.current ?? null;
            const now = performance.now();
            if (state !== this._ibl.lastState) {
                this._ibl.lastState = state;
                applyIBLToScene(this.scene, this._ibl.envMap, this._ibl.config);
                this._ibl.scanUntilMs = now + this._ibl.scanDurationMs;
                this._ibl.nextScanMs = 0;
            }

            if (now < this._ibl.scanUntilMs && now >= this._ibl.nextScanMs) {
                applyIBLIntensity(this.scene, this._ibl.config, { force: false });
                this._ibl.nextScanMs = now + this._ibl.scanIntervalMs;
            }
        }

        this.renderer.render(this.scene, this.camera);

        requestAnimationFrame((tt) => this._tick(tt));
    }
}

