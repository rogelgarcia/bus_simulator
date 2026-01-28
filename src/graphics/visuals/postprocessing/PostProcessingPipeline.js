// src/graphics/visuals/postprocessing/PostProcessingPipeline.js
// Post-processing pipeline: global bloom + sun-only bloom + color grading.
// @ts-check

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createColorGradingPass, setColorGradingPassState } from './ColorGradingPass.js';
import { SUN_BLOOM_LAYER, SUN_BLOOM_LAYER_ID } from '../sun/SunBloomLayers.js';

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function sanitizeGlobalBloomRuntimeSettings(settings) {
    const src = settings && typeof settings === 'object' ? settings : {};
    const enabled = src.enabled !== undefined ? !!src.enabled : false;
    return {
        enabled,
        strength: enabled ? clamp(src.strength, 0, 3, 0.22) : 0,
        radius: clamp(src.radius, 0, 1, 0.12),
        threshold: clamp(src.threshold, 0, 5, 1.05)
    };
}

function sanitizeSunBloomRuntimeSettings(settings) {
    const src = settings && typeof settings === 'object' ? settings : {};
    const enabled = src.enabled !== undefined ? !!src.enabled : false;
    const modeRaw = typeof src.mode === 'string' ? src.mode.trim().toLowerCase() : '';
    const mode = modeRaw === 'selective' ? 'selective' : 'occlusion';
    return {
        enabled,
        mode,
        strength: enabled ? clamp(src.strength, 0, 5, 0.9) : 0,
        radius: clamp(src.radius, 0, 1, 0.25),
        threshold: clamp(src.threshold, 0, 5, 1.05),
        brightnessOnly: src.brightnessOnly !== undefined ? !!src.brightnessOnly : true
    };
}

function makeCompositePass({ globalBloomTexture, sunBloomTexture } = {}) {
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            baseTexture: { value: null },
            uGlobalBloomTexture: { value: globalBloomTexture ?? null },
            uSunBloomTexture: { value: sunBloomTexture ?? null },
            uSunBrightnessOnly: { value: 1.0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D baseTexture;
            uniform sampler2D uGlobalBloomTexture;
            uniform sampler2D uSunBloomTexture;
            uniform float uSunBrightnessOnly;
            varying vec2 vUv;

            float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

            void main() {
                vec3 base = texture2D(baseTexture, vUv).rgb;
                vec3 bloom = texture2D(uGlobalBloomTexture, vUv).rgb;
                vec3 sun = texture2D(uSunBloomTexture, vUv).rgb;
                if (uSunBrightnessOnly > 0.5) {
                    float y = luma(sun);
                    sun = vec3(y);
                }
                vec3 outColor = base + bloom + sun;
                gl_FragColor = vec4(outColor, 1.0);
            }
        `,
        depthWrite: false,
        depthTest: false,
        toneMapped: true
    });

    return new ShaderPass(mat, 'baseTexture');
}

function createBlackTexture() {
    const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    tex.needsUpdate = true;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

export class PostProcessingPipeline {
    constructor({
        renderer,
        scene,
        camera,
        bloom = null,
        sunBloom = null,
        colorGrading = null
    } = {}) {
        if (!renderer) throw new Error('[PostProcessingPipeline] renderer is required');
        if (!scene) throw new Error('[PostProcessingPipeline] scene is required');
        if (!camera) throw new Error('[PostProcessingPipeline] camera is required');

        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        this._blackTex = createBlackTexture();

        this._globalBloom = sanitizeGlobalBloomRuntimeSettings(bloom);
        this._sunBloom = sanitizeSunBloomRuntimeSettings(sunBloom);
        this._colorGrading = { enabled: false, intensity: 0, lutTexture: null };

        this._darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this._materialCache = new Map();
        this._hidden = [];

        // Global bloom composer (full scene)
        this._globalBloomComposer = new EffectComposer(renderer);
        this._globalBloomComposer.renderToScreen = false;
        this._globalBloomRenderPass = new RenderPass(scene, camera);
        this._globalBloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), this._globalBloom.strength, this._globalBloom.radius, this._globalBloom.threshold);
        this._globalBloomComposer.addPass(this._globalBloomRenderPass);
        this._globalBloomComposer.addPass(this._globalBloomPass);

        // Sun bloom composer (selective/occlusion-aware)
        this._sunBloomComposer = new EffectComposer(renderer);
        this._sunBloomComposer.renderToScreen = false;
        this._sunBloomRenderPass = new RenderPass(scene, camera);
        this._sunBloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), this._sunBloom.strength, this._sunBloom.radius, this._sunBloom.threshold);
        this._sunBloomComposer.addPass(this._sunBloomRenderPass);
        this._sunBloomComposer.addPass(this._sunBloomPass);

        // Final composer
        this.composer = new EffectComposer(renderer);
        this.composer.renderToScreen = true;
        this.renderPass = new RenderPass(scene, camera);

        this.compositePass = makeCompositePass({
            globalBloomTexture: this._globalBloomComposer.renderTarget2.texture,
            sunBloomTexture: this._sunBloomComposer.renderTarget2.texture
        });

        this.colorGradingPass = createColorGradingPass();
        this.outputPass = new OutputPass();
        this.composer.addPass(this.renderPass);
        this.composer.addPass(this.compositePass);
        this.composer.addPass(this.colorGradingPass);
        this.composer.addPass(this.outputPass);

        this.setSettings({ bloom, sunBloom });
        this.setColorGrading(colorGrading);
    }

    setPixelRatio(pixelRatio) {
        const pr = clamp(pixelRatio, 0.1, 8, 1);
        this.composer?.setPixelRatio?.(pr);
        this._globalBloomComposer?.setPixelRatio?.(pr);
        this._sunBloomComposer?.setPixelRatio?.(pr);
    }

    setSize(width, height) {
        const w = Math.max(1, Math.floor(Number(width)));
        const h = Math.max(1, Math.floor(Number(height)));
        this.composer.setSize(w, h);
        this._globalBloomComposer.setSize(w, h);
        this._sunBloomComposer.setSize(w, h);
        this._globalBloomPass?.setSize?.(w, h);
        this._sunBloomPass?.setSize?.(w, h);
    }

    setSettings({ bloom = null, sunBloom = null } = {}) {
        this._globalBloom = sanitizeGlobalBloomRuntimeSettings(bloom);
        this._sunBloom = sanitizeSunBloomRuntimeSettings(sunBloom);

        this._globalBloomPass.enabled = this._globalBloom.enabled && this._globalBloom.strength > 0;
        this._globalBloomPass.strength = this._globalBloom.strength;
        this._globalBloomPass.radius = this._globalBloom.radius;
        this._globalBloomPass.threshold = this._globalBloom.threshold;

        this._sunBloomPass.enabled = this._sunBloom.enabled && this._sunBloom.strength > 0;
        this._sunBloomPass.strength = this._sunBloom.strength;
        this._sunBloomPass.radius = this._sunBloom.radius;
        this._sunBloomPass.threshold = this._sunBloom.threshold;

        const mat = this.compositePass?.material ?? null;
        if (mat?.uniforms?.uSunBrightnessOnly) mat.uniforms.uSunBrightnessOnly.value = this._sunBloom.brightnessOnly ? 1.0 : 0.0;
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
            globalBloomEnabled: !!this._globalBloom?.enabled,
            sunBloomEnabled: !!this._sunBloom?.enabled,
            globalBloom: { ...(this._globalBloom ?? {}) },
            sunBloom: { ...(this._sunBloom ?? {}) }
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

    _renderGlobalBloom(deltaTime) {
        if (!this._globalBloom.enabled || this._globalBloom.strength <= 0) return;
        const scene = this.scene;
        const prevBackground = scene.background ?? null;
        scene.background = null;
        try {
            this._globalBloomComposer.render(deltaTime);
        } finally {
            scene.background = prevBackground;
        }
    }

    _renderSunBloom(deltaTime) {
        if (!this._sunBloom.enabled || this._sunBloom.strength <= 0) return;

        const camera = this.camera;
        const scene = this.scene;
        const prevLayers = camera.layers.mask;
        const prevBackground = scene.background ?? null;
        scene.background = null;

        try {
            if (this._sunBloom.mode === 'selective') {
                camera.layers.set(SUN_BLOOM_LAYER_ID);
                this._sunBloomComposer.render(deltaTime);
                return;
            }

            camera.layers.set(0);
            camera.layers.enable(SUN_BLOOM_LAYER_ID);

            this._materialCache.clear();
            this._hidden.length = 0;
            scene.traverse((obj) => {
                if (!obj) return;

                const inBloom = SUN_BLOOM_LAYER.test(obj.layers);
                if (inBloom) return;

                if (obj.isMesh) {
                    const mat = obj.material ?? null;
                    if (!mat) return;
                    this._materialCache.set(obj, mat);
                    obj.material = this._darkMaterial;
                    return;
                }

                if (obj.isSprite || obj.isPoints || obj.isLine || obj.isLineSegments || obj.isLineLoop) {
                    if (obj.visible !== false) {
                        this._hidden.push(obj);
                        obj.visible = false;
                    }
                }
            });

            this._sunBloomComposer.render(deltaTime);
        } finally {
            for (const [obj, mat] of this._materialCache.entries()) {
                if (obj && obj.isMesh) obj.material = mat;
            }
            this._materialCache.clear();
            for (const obj of this._hidden) obj.visible = true;
            this._hidden.length = 0;

            camera.layers.mask = prevLayers;
            scene.background = prevBackground;
        }
    }

    render(deltaTime = undefined) {
        const info = this.renderer?.info ?? null;
        const canCapture = !!info && typeof info.reset === 'function' && 'autoReset' in info;
        const prevAutoReset = canCapture ? info.autoReset : null;
        if (canCapture) {
            info.autoReset = false;
            info.reset();
        }

        const globalBloomOn = !!this._globalBloom?.enabled && (this._globalBloom?.strength > 0);
        const sunBloomOn = !!this._sunBloom?.enabled && (this._sunBloom?.strength > 0);
        const gradeOn = !!this._colorGrading?.enabled;
        const wantsPipeline = globalBloomOn || sunBloomOn || gradeOn;

        try {
            if (!wantsPipeline) {
                this.renderer.render(this.scene, this.camera);
                return;
            }

            if (globalBloomOn) this._renderGlobalBloom(deltaTime);
            if (sunBloomOn) this._renderSunBloom(deltaTime);

            const mat = this.compositePass?.material ?? null;
            if (mat?.uniforms?.uGlobalBloomTexture) mat.uniforms.uGlobalBloomTexture.value = globalBloomOn ? (this._globalBloomComposer.renderTarget2?.texture ?? this._blackTex) : this._blackTex;
            if (mat?.uniforms?.uSunBloomTexture) mat.uniforms.uSunBloomTexture.value = sunBloomOn ? (this._sunBloomComposer.renderTarget2?.texture ?? this._blackTex) : this._blackTex;

            this.composer.render(deltaTime);
        } finally {
            if (canCapture) info.autoReset = prevAutoReset;
        }
    }

    dispose() {
        this._globalBloomPass?.dispose?.();
        this._sunBloomPass?.dispose?.();
        this.outputPass?.dispose?.();
        this.compositePass?.material?.dispose?.();
        this.colorGradingPass?.material?.dispose?.();

        this._globalBloomComposer?.dispose?.();
        this._sunBloomComposer?.dispose?.();
        this.composer?.dispose?.();

        this._globalBloomComposer?.renderTarget1?.dispose?.();
        this._globalBloomComposer?.renderTarget2?.dispose?.();
        this._sunBloomComposer?.renderTarget1?.dispose?.();
        this._sunBloomComposer?.renderTarget2?.dispose?.();
        this.composer?.renderTarget1?.dispose?.();
        this.composer?.renderTarget2?.dispose?.();

        this._darkMaterial?.dispose?.();
        this._blackTex?.dispose?.();
    }
}
