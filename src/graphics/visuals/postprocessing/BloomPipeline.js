// src/graphics/visuals/postprocessing/BloomPipeline.js
// EffectComposer-based bloom post-processing pipeline.
// @ts-check

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createColorGradingPass, setColorGradingPassState } from './ColorGradingPass.js';

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function sanitizeBloomRuntimeSettings(settings) {
    const src = settings && typeof settings === 'object' ? settings : {};
    const enabled = src.enabled !== undefined ? !!src.enabled : false;
    return {
        enabled,
        strength: enabled ? clamp(src.strength, 0, 3, 0.22) : 0,
        radius: clamp(src.radius, 0, 1, 0.12),
        threshold: clamp(src.threshold, 0, 5, 1.05),
        mode: 'full'
    };
}

export class BloomPipeline {
    constructor({ renderer, scene, camera, settings = null, colorGrading = null } = {}) {
        if (!renderer) throw new Error('[BloomPipeline] renderer is required');
        if (!scene) throw new Error('[BloomPipeline] scene is required');
        if (!camera) throw new Error('[BloomPipeline] camera is required');

        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        const initial = sanitizeBloomRuntimeSettings(settings);

        this.composer = new EffectComposer(renderer);
        this.composer.renderToScreen = true;

        this.renderPass = new RenderPass(scene, camera);
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), initial.strength, initial.radius, initial.threshold);
        this.outputPass = new OutputPass();
        this.colorGradingPass = createColorGradingPass();

        this.composer.addPass(this.renderPass);
        this.composer.addPass(this.bloomPass);
        this.composer.addPass(this.colorGradingPass);
        this.composer.addPass(this.outputPass);

        this._settings = initial;
        this._colorGrading = { enabled: false, intensity: 0, lutTexture: null };
        this.setSettings(settings);
        this.setColorGrading(colorGrading);
    }

    setPixelRatio(pixelRatio) {
        const pr = clamp(pixelRatio, 0.1, 8, 1);
        this.composer?.setPixelRatio?.(pr);
    }

    setSize(width, height) {
        const w = Math.max(1, Math.floor(Number(width)));
        const h = Math.max(1, Math.floor(Number(height)));
        this.composer.setSize(w, h);
        this.bloomPass?.setSize?.(w, h);
    }

    setSettings(settings) {
        const next = sanitizeBloomRuntimeSettings(settings);
        this._settings = next;
        this.bloomPass.enabled = next.enabled && next.strength > 0;
        this.bloomPass.strength = next.strength;
        this.bloomPass.radius = next.radius;
        this.bloomPass.threshold = next.threshold;
    }

    setColorGrading(colorGrading) {
        const src = colorGrading && typeof colorGrading === 'object' ? colorGrading : {};
        const intensity = clamp(src.intensity, 0, 1, 0);
        const lutTexture = src.lutTexture ?? null;
        this._colorGrading = {
            enabled: !!lutTexture && intensity > 0,
            intensity,
            lutTexture
        };
        setColorGradingPassState(this.colorGradingPass, { lutTexture, intensity });
    }

    getDebugInfo() {
        return {
            enabled: !!this._settings?.enabled,
            ...this._settings
        };
    }

    getColorGradingDebugInfo() {
        const g = this._colorGrading ?? null;
        return {
            enabled: !!g?.enabled,
            intensity: g?.intensity ?? 0,
            hasLut: !!g?.lutTexture
        };
    }

    render(deltaTime = undefined) {
        const bloomOn = !!this._settings?.enabled && (this._settings?.strength > 0);
        const gradeOn = !!this._colorGrading?.enabled;
        if (!bloomOn && !gradeOn) {
            this.renderer.render(this.scene, this.camera);
            return;
        }
        this.composer.render(deltaTime);
    }

    dispose() {
        this.bloomPass?.dispose?.();
        this.outputPass?.dispose?.();
        this.colorGradingPass?.material?.dispose?.();
        this.composer?.dispose?.();
        if (this.composer?.renderTarget1) this.composer.renderTarget1.dispose();
        if (this.composer?.renderTarget2) this.composer.renderTarget2.dispose();
    }
}
