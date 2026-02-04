// src/graphics/visuals/postprocessing/PostProcessingPipeline.js
// Post-processing pipeline: global bloom + sun-only bloom + color grading.
// @ts-check

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { createColorGradingPass, setColorGradingPassState } from './ColorGradingPass.js';
import { SUN_BLOOM_LAYER, SUN_BLOOM_LAYER_ID } from '../sun/SunBloomLayers.js';
import { sanitizeAntiAliasingSettings } from './AntiAliasingSettings.js';
import { sanitizeAmbientOcclusionSettings } from './AmbientOcclusionSettings.js';
import { TemporalAAPass } from './TemporalAAPass.js';

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function halton(index, base) {
    let i = Math.max(0, Math.floor(Number(index) || 0));
    let f = 1;
    let r = 0;
    while (i > 0) {
        f /= base;
        r += f * (i % base);
        i = Math.floor(i / base);
    }
    return r;
}

function getJitterOffsetPx(index, strength) {
    const k = clamp(strength, 0, 1, 0);
    if (k <= 0) return { x: 0, y: 0 };
    const i = (Math.max(0, Math.floor(Number(index) || 0)) % 8) + 1;
    return {
        x: (halton(i, 2) - 0.5) * k,
        y: (halton(i, 3) - 0.5) * k
    };
}

function cloneCameraView(view) {
    const v = view && typeof view === 'object' ? view : null;
    if (!v) return null;
    return {
        enabled: !!v.enabled,
        fullWidth: Number.isFinite(v.fullWidth) ? v.fullWidth : null,
        fullHeight: Number.isFinite(v.fullHeight) ? v.fullHeight : null,
        offsetX: Number.isFinite(v.offsetX) ? v.offsetX : 0,
        offsetY: Number.isFinite(v.offsetY) ? v.offsetY : 0,
        width: Number.isFinite(v.width) ? v.width : null,
        height: Number.isFinite(v.height) ? v.height : null
    };
}

function restoreCameraView(camera, view) {
    const cam = camera ?? null;
    if (!cam) return;

    const v = view && typeof view === 'object' ? view : null;
    if (v?.enabled && Number.isFinite(v.fullWidth) && Number.isFinite(v.fullHeight) && Number.isFinite(v.width) && Number.isFinite(v.height)) {
        cam.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX ?? 0, v.offsetY ?? 0, v.width, v.height);
    } else {
        cam.clearViewOffset();
    }
    cam.updateProjectionMatrix();
}

function getMsaaSupportInfo(renderer) {
    const caps = renderer?.capabilities ?? null;
    const isWebGL2 = !!caps?.isWebGL2;
    const maxSamples = Number.isFinite(caps?.maxSamples) ? Number(caps.maxSamples) : 0;
    return {
        supported: isWebGL2 && maxSamples > 0,
        maxSamples: Math.max(0, Math.floor(maxSamples))
    };
}

function setComposerSamples(composer, samples) {
    const c = composer ?? null;
    const rt1 = c?.renderTarget1 ?? null;
    const rt2 = c?.renderTarget2 ?? null;
    if (!rt1 || !rt2) return false;
    if (!('samples' in rt1) || !('samples' in rt2)) return false;
    const next = Math.max(0, Math.floor(Number(samples) || 0));
    const prev1 = Math.max(0, Math.floor(Number(rt1.samples) || 0));
    const prev2 = Math.max(0, Math.floor(Number(rt2.samples) || 0));
    if (prev1 === next && prev2 === next) return true;

    rt1.samples = next;
    rt2.samples = next;

    // Important: three.js render target GPU resources are not guaranteed to reconfigure
    // correctly just by changing `.samples` after first use. Force a re-init.
    rt1.dispose?.();
    rt2.dispose?.();
    return true;
}

function createTunableFxaaShader() {
    const src = FXAAShader ?? null;
    const fragmentShader = typeof src?.fragmentShader === 'string' ? src.fragmentShader : '';
    let out = fragmentShader.replace(/-100(?:\.0+)?/g, '-16.0');
    out = out.replace(
        /uniform\\s+vec2\\s+resolution\\s*;/,
        (match) => `${match}\n\tuniform float edgeThreshold;`
    );
    out = out.replace(
        /const\\s+float\\s+edgeDetectionQuality\\s*=\\s*([0-9.]+)\\s*;/,
        'const float edgeDetectionQuality = edgeThreshold;'
    );

    return {
        ...src,
        uniforms: {
            ...(src?.uniforms ?? {}),
            edgeThreshold: { value: 0.2 }
        },
        fragmentShader: out || fragmentShader
    };
}

function getShaderMaterials(container) {
    const out = [];
    const c = container && typeof container === 'object' ? container : null;
    if (!c) return out;

    for (const value of Object.values(c)) {
        if (value && typeof value === 'object' && value.isShaderMaterial) out.push(value);
    }

    return out;
}

function setToneMappedForPassMaterials(pass, toneMapped) {
    for (const mat of getShaderMaterials(pass)) {
        mat.toneMapped = !!toneMapped;
    }
}

function setComposerRenderTargetColorSpace(composer, colorSpace) {
    const c = composer ?? null;
    const rt1 = c?.renderTarget1 ?? null;
    const rt2 = c?.renderTarget2 ?? null;
    const tex1 = rt1?.texture ?? null;
    const tex2 = rt2?.texture ?? null;
    if (!tex1 || !tex2) return;
    if (!('colorSpace' in tex1) || !('colorSpace' in tex2)) return;
    const cs = colorSpace ?? null;
    if (cs) {
        tex1.colorSpace = cs;
        tex2.colorSpace = cs;
    }
}

function applySmaaDefines(pass, { threshold, maxSearchSteps, maxSearchStepsDiag, cornerRounding } = {}) {
    const p = pass && typeof pass === 'object' ? pass : null;
    if (!p) return;

    const materials = getShaderMaterials(p);

    for (const mat of materials) {
        const defines = mat?.defines ?? null;
        if (!defines || typeof defines !== 'object') continue;

        let changed = false;
        if ('SMAA_THRESHOLD' in defines && Number.isFinite(threshold)) {
            defines.SMAA_THRESHOLD = Number(threshold);
            changed = true;
        }
        if ('SMAA_MAX_SEARCH_STEPS' in defines && Number.isFinite(maxSearchSteps)) {
            defines.SMAA_MAX_SEARCH_STEPS = Math.max(0, Math.floor(Number(maxSearchSteps)));
            changed = true;
        }
        if ('SMAA_MAX_SEARCH_STEPS_DIAG' in defines && Number.isFinite(maxSearchStepsDiag)) {
            defines.SMAA_MAX_SEARCH_STEPS_DIAG = Math.max(0, Math.floor(Number(maxSearchStepsDiag)));
            changed = true;
        }
        if ('SMAA_CORNER_ROUNDING' in defines && Number.isFinite(cornerRounding)) {
            defines.SMAA_CORNER_ROUNDING = Math.max(0, Math.floor(Number(cornerRounding)));
            changed = true;
        }
        if (changed) mat.needsUpdate = true;
    }
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
                vec4 base = texture2D(baseTexture, vUv);
                vec3 bloom = texture2D(uGlobalBloomTexture, vUv).rgb;
                vec3 sun = texture2D(uSunBloomTexture, vUv).rgb;
                if (uSunBrightnessOnly > 0.5) {
                    float y = luma(sun);
                    sun = vec3(y);
                }
                vec3 outColor = base.rgb + bloom + sun;
                gl_FragColor = vec4(outColor, base.a);
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

const OUTPUT_COLORSPACE_SHADER = Object.freeze({
    uniforms: {
        tDiffuse: { value: null }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;

        void main() {
            gl_FragColor = texture2D(tDiffuse, vUv);
            #include <colorspace_fragment>
        }
    `
});

export class PostProcessingPipeline {
    constructor({
        renderer,
        scene,
        camera,
        bloom = null,
        ambientOcclusion = null,
        sunBloom = null,
        colorGrading = null,
        antiAliasing = null
    } = {}) {
        if (!renderer) throw new Error('[PostProcessingPipeline] renderer is required');
        if (!scene) throw new Error('[PostProcessingPipeline] scene is required');
        if (!camera) throw new Error('[PostProcessingPipeline] camera is required');

        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this._pixelRatio = 1;
        this._size = { w: 1, h: 1 };
        this._taaJitterIndex = 0;

        this._blackTex = createBlackTexture();

        this._globalBloom = sanitizeGlobalBloomRuntimeSettings(bloom);
        this._sunBloom = sanitizeSunBloomRuntimeSettings(sunBloom);
        this._ambientOcclusion = sanitizeAmbientOcclusionSettings(ambientOcclusion);
        this._colorGrading = { enabled: false, intensity: 0, lutTexture: null };
        this._ao = { mode: 'off', pass: null };
        this._antiAliasing = {
            requested: sanitizeAntiAliasingSettings(antiAliasing),
            activeMode: 'off',
            msaaSupported: false,
            msaaMaxSamples: 0,
            msaaSamples: 0
        };

        this._darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this._materialCache = new Map();
        this._hidden = [];

        const linearColorSpace = THREE.LinearSRGBColorSpace ?? THREE.NoColorSpace;

        // Global bloom composer (full scene)
        this._globalBloomComposer = new EffectComposer(renderer);
        this._globalBloomComposer.renderToScreen = false;
        setComposerRenderTargetColorSpace(this._globalBloomComposer, linearColorSpace);
        this._globalBloomRenderPass = new RenderPass(scene, camera);
        this._globalBloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), this._globalBloom.strength, this._globalBloom.radius, this._globalBloom.threshold);
        this._globalBloomComposer.addPass(this._globalBloomRenderPass);
        this._globalBloomComposer.addPass(this._globalBloomPass);

        // Sun bloom composer (selective/occlusion-aware)
        this._sunBloomComposer = new EffectComposer(renderer);
        this._sunBloomComposer.renderToScreen = false;
        setComposerRenderTargetColorSpace(this._sunBloomComposer, linearColorSpace);
        this._sunBloomRenderPass = new RenderPass(scene, camera);
        this._sunBloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), this._sunBloom.strength, this._sunBloom.radius, this._sunBloom.threshold);
        this._sunBloomComposer.addPass(this._sunBloomRenderPass);
        this._sunBloomComposer.addPass(this._sunBloomPass);

        // Final composer
        this.composer = new EffectComposer(renderer);
        this.composer.renderToScreen = true;
        setComposerRenderTargetColorSpace(this.composer, linearColorSpace);
        this.renderPass = new RenderPass(scene, camera);

        this.compositePass = makeCompositePass({
            globalBloomTexture: this._globalBloomComposer.renderTarget2.texture,
            sunBloomTexture: this._sunBloomComposer.renderTarget2.texture
        });

        this.colorGradingPass = createColorGradingPass();
        if (this.colorGradingPass?.material) this.colorGradingPass.material.toneMapped = false;

        this.taaPass = new TemporalAAPass({ colorSpace: linearColorSpace });
        this.taaPass.enabled = false;

        this.smaaPass = new SMAAPass(1, 1);
        this.smaaPass.enabled = false;
        setToneMappedForPassMaterials(this.smaaPass, false);

        this.fxaaPass = new ShaderPass(createTunableFxaaShader());
        this.fxaaPass.enabled = false;
        if (this.fxaaPass?.material) this.fxaaPass.material.toneMapped = false;

        this.outputPass = new ShaderPass(OUTPUT_COLORSPACE_SHADER);
        if (this.outputPass?.material) this.outputPass.material.toneMapped = false;

        this.composer.addPass(this.renderPass);
        this._syncAmbientOcclusionPass();
        this.composer.addPass(this.compositePass);
        this.composer.addPass(this.colorGradingPass);
        this.composer.addPass(this.taaPass);
        this.composer.addPass(this.smaaPass);
        this.composer.addPass(this.fxaaPass);
        this.composer.addPass(this.outputPass);

        this.setSettings({ bloom, sunBloom });
        this.setAmbientOcclusion(ambientOcclusion);
        this.setColorGrading(colorGrading);
        this.setAntiAliasing(antiAliasing);
    }

    setPixelRatio(pixelRatio) {
        const pr = clamp(pixelRatio, 0.1, 8, 1);
        this._pixelRatio = pr;
        this.composer?.setPixelRatio?.(pr);
        this._globalBloomComposer?.setPixelRatio?.(pr);
        this._sunBloomComposer?.setPixelRatio?.(pr);
        this._syncAaPassSizes();
        this._syncAoPassSizes();
    }

    setSize(width, height) {
        const w = Math.max(1, Math.floor(Number(width)));
        const h = Math.max(1, Math.floor(Number(height)));
        this._size.w = w;
        this._size.h = h;
        this.composer.setSize(w, h);
        this._globalBloomComposer.setSize(w, h);
        this._sunBloomComposer.setSize(w, h);
        this._globalBloomPass?.setSize?.(w, h);
        this._sunBloomPass?.setSize?.(w, h);
        this._syncAaPassSizes();
        this._syncAoPassSizes();
    }

    _syncAaPassSizes() {
        const w = this._size?.w ?? 1;
        const h = this._size?.h ?? 1;
        const pr = this._pixelRatio ?? 1;
        const pxW = Math.max(1, Math.floor(w * pr));
        const pxH = Math.max(1, Math.floor(h * pr));

        const updateFxaaResolution = (pass) => {
            const uniforms = pass?.material?.uniforms ?? null;
            if (uniforms?.resolution?.value?.set) uniforms.resolution.value.set(1 / pxW, 1 / pxH);
        };
        updateFxaaResolution(this.fxaaPass);

        if (this.smaaPass?.setSize) this.smaaPass.setSize(pxW, pxH);
        if (this.taaPass?.setSize) this.taaPass.setSize(pxW, pxH);
    }

    _getAoPixelSize() {
        const w = this._size?.w ?? 1;
        const h = this._size?.h ?? 1;
        const pr = this._pixelRatio ?? 1;
        const pxW = Math.max(1, Math.floor(w * pr));
        const pxH = Math.max(1, Math.floor(h * pr));

        const mode = this._ambientOcclusion?.mode ?? 'off';
        const quality = mode === 'ssao'
            ? (this._ambientOcclusion?.ssao?.quality ?? 'medium')
            : (this._ambientOcclusion?.gtao?.quality ?? 'medium');
        const scale = quality === 'low' ? 0.5 : (quality === 'medium' ? 0.75 : 1.0);

        return {
            w: Math.max(1, Math.floor(pxW * scale)),
            h: Math.max(1, Math.floor(pxH * scale))
        };
    }

    _syncAoPassSizes() {
        const pass = this._ao?.pass ?? null;
        if (!pass?.setSize) return;
        const size = this._getAoPixelSize();
        pass.setSize(size.w, size.h);
    }

    _removeComposerPass(pass) {
        if (!pass) return;
        const passes = this.composer?.passes ?? null;
        if (!Array.isArray(passes)) return;
        const idx = passes.indexOf(pass);
        if (idx >= 0) passes.splice(idx, 1);
    }

    _getSsaoKernelSize(quality) {
        const q = typeof quality === 'string' ? quality : 'medium';
        if (q === 'low') return 8;
        if (q === 'high') return 32;
        return 16;
    }

    _getGtaoSampleCount(quality) {
        const q = typeof quality === 'string' ? quality : 'medium';
        if (q === 'low') return 8;
        if (q === 'high') return 24;
        return 16;
    }

    _getGtaoDenoiseRadius(quality) {
        const q = typeof quality === 'string' ? quality : 'medium';
        if (q === 'low') return 4;
        if (q === 'high') return 8;
        return 6;
    }

    _syncAmbientOcclusionPass() {
        const settings = this._ambientOcclusion ?? null;
        const nextMode = typeof settings?.mode === 'string' ? settings.mode : 'off';
        const prevMode = this._ao?.mode ?? 'off';
        const prevPass = this._ao?.pass ?? null;

        if (prevPass && prevMode !== nextMode) {
            this._removeComposerPass(prevPass);
            prevPass.dispose?.();
            this._ao.pass = null;
            this._ao.mode = 'off';
        }

        if (nextMode === 'off') {
            if (this._ao.pass) {
                this._removeComposerPass(this._ao.pass);
                this._ao.pass.dispose?.();
                this._ao.pass = null;
                this._ao.mode = 'off';
            }
            return;
        }

        if (!this._ao.pass) {
            const size = this._getAoPixelSize();
            const passes = this.composer?.passes ?? [];
            const renderIdx = passes.indexOf(this.renderPass);
            const insertAt = renderIdx >= 0 ? renderIdx + 1 : 1;

            if (nextMode === 'ssao') {
                const ssao = settings?.ssao ?? null;
                const kernelSize = this._getSsaoKernelSize(ssao?.quality);
                const pass = new SSAOPass(this.scene, this.camera, size.w, size.h, kernelSize);
                pass.enabled = true;
                if ('output' in pass && SSAOPass?.OUTPUT?.Default !== undefined) pass.output = SSAOPass.OUTPUT.Default;
                passes.splice(Math.max(0, Math.min(insertAt, passes.length)), 0, pass);
                this._ao.pass = pass;
                this._ao.mode = 'ssao';
            } else if (nextMode === 'gtao') {
                const pass = new GTAOPass(this.scene, this.camera, size.w, size.h);
                pass.enabled = true;
                passes.splice(Math.max(0, Math.min(insertAt, passes.length)), 0, pass);
                this._ao.pass = pass;
                this._ao.mode = 'gtao';
            }
        }

        const pass = this._ao.pass;
        if (!pass) return;

        if (nextMode === 'ssao') {
            const ssao = settings?.ssao ?? null;
            if ('kernelRadius' in pass) pass.kernelRadius = clamp(ssao?.radius, 0.1, 64, 8);
            if ('minDistance' in pass) pass.minDistance = 0.01;
            if ('maxDistance' in pass) pass.maxDistance = 0.15;
            if ('aoClamp' in pass) pass.aoClamp = 0.25;
            if ('lumInfluence' in pass) pass.lumInfluence = 0.7;
            if ('aoIntensity' in pass) pass.aoIntensity = clamp(ssao?.intensity, 0, 2, 0.35);
            if ('kernelSize' in pass) pass.kernelSize = this._getSsaoKernelSize(ssao?.quality);
            if ('output' in pass && SSAOPass?.OUTPUT?.Default !== undefined) pass.output = SSAOPass.OUTPUT.Default;
            this._syncAoPassSizes();
            return;
        }

        if (nextMode === 'gtao') {
            const gtao = settings?.gtao ?? null;
            const quality = gtao?.quality ?? 'medium';
            const samples = this._getGtaoSampleCount(quality);
            const denoise = gtao?.denoise !== false;

            if ('blendIntensity' in pass) pass.blendIntensity = clamp(gtao?.intensity, 0, 2, 0.35);

            const aoParams = {
                radius: clamp(gtao?.radius, 0.05, 8, 0.25),
                distanceExponent: 1.0,
                thickness: 1.0,
                scale: 1.0,
                samples,
                distanceFallOff: 1.0,
                screenSpaceRadius: false
            };
            pass.updateGtaoMaterial?.(aoParams);

            const pdParams = {
                lumaPhi: 10.0,
                depthPhi: 2.0,
                normalPhi: 3.0,
                radius: this._getGtaoDenoiseRadius(quality),
                radiusExponent: 1.0,
                rings: 2,
                samples
            };
            pass.updatePdMaterial?.(pdParams);

            if ('output' in pass && GTAOPass?.OUTPUT) {
                pass.output = denoise && GTAOPass.OUTPUT.Denoise !== undefined ? GTAOPass.OUTPUT.Denoise : GTAOPass.OUTPUT.Default;
            }

            this._syncAoPassSizes();
        }
    }

    setAmbientOcclusion(ambientOcclusion) {
        this._ambientOcclusion = sanitizeAmbientOcclusionSettings(ambientOcclusion);
        this._syncAmbientOcclusionPass();
    }

    setAntiAliasing(antiAliasing) {
        const prevActiveMode = this._antiAliasing?.activeMode ?? 'off';
        const requested = sanitizeAntiAliasingSettings(antiAliasing);
        const msaaInfo = getMsaaSupportInfo(this.renderer);
        const requestedMode = requested?.mode ?? 'off';
        const requestedMsaaSamples = requested?.msaa?.samples ?? 0;

        let activeMode = requestedMode;
        let msaaSamples = 0;

        if (requestedMode === 'msaa') {
            if (!msaaInfo.supported || requestedMsaaSamples <= 0) {
                activeMode = 'off';
            } else {
                msaaSamples = Math.min(requestedMsaaSamples, msaaInfo.maxSamples);
                if (msaaSamples <= 0) activeMode = 'off';
            }
        }

        this._antiAliasing = {
            requested,
            activeMode,
            msaaSupported: msaaInfo.supported,
            msaaMaxSamples: msaaInfo.maxSamples,
            msaaSamples
        };

        if (prevActiveMode !== activeMode && (prevActiveMode === 'taa' || activeMode === 'taa')) {
            this._taaJitterIndex = 0;
            this.taaPass?.resetHistory?.();
        }

        const enableTaa = activeMode === 'taa';
        const enableSmaa = activeMode === 'smaa';
        const enableFxaa = activeMode === 'fxaa';
        this.taaPass.enabled = enableTaa;
        this.smaaPass.enabled = enableSmaa;
        this.fxaaPass.enabled = enableFxaa;

        if (enableTaa) {
            const taa = requested?.taa ?? null;
            this.taaPass?.setSettings?.(taa);
        }

        if (enableSmaa) {
            const smaa = requested?.smaa ?? null;
            const defs = {
                threshold: smaa?.threshold,
                maxSearchSteps: smaa?.maxSearchSteps,
                maxSearchStepsDiag: smaa?.maxSearchStepsDiag,
                cornerRounding: smaa?.cornerRounding
            };
            applySmaaDefines(this.smaaPass, defs);
        }

        const fxaaUniforms = (pass) => pass?.material?.uniforms ?? null;
        const fxaa = requested?.fxaa ?? null;
        const edgeThreshold = clamp(fxaa?.edgeThreshold, 0.02, 0.5, 0.2);
        if (fxaaUniforms(this.fxaaPass)?.edgeThreshold) fxaaUniforms(this.fxaaPass).edgeThreshold.value = edgeThreshold;

        setComposerSamples(this.composer, activeMode === 'msaa' ? msaaSamples : 0);
        this._syncAaPassSizes();
        this.setSize(this._size.w, this._size.h);
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
            ambientOcclusion: {
                mode: this._ambientOcclusion?.mode ?? 'off'
            },
            antiAliasing: {
                mode: this._antiAliasing?.activeMode ?? 'off',
                requestedMode: this._antiAliasing?.requested?.mode ?? 'off',
                msaaSupported: !!this._antiAliasing?.msaaSupported,
                msaaMaxSamples: this._antiAliasing?.msaaMaxSamples ?? 0,
                msaaSamples: this._antiAliasing?.msaaSamples ?? 0
            },
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
        const aoMode = this._ambientOcclusion?.mode ?? 'off';
        const aoOn = aoMode === 'ssao' || aoMode === 'gtao';
        const gradeOn = !!this._colorGrading?.enabled;
        const aaMode = this._antiAliasing?.activeMode ?? 'off';
        const taa = aaMode === 'taa' ? (this._antiAliasing?.requested?.taa ?? null) : null;
        const taaJitterStrength = taa ? clamp(taa.jitter, 0, 1, 0) : 0;
        const jitterApplied = aaMode === 'taa' && taaJitterStrength > 0;
        const wantsPipeline = globalBloomOn || sunBloomOn || aoOn || gradeOn || aaMode !== 'off';

        const prevView = jitterApplied ? cloneCameraView(this.camera?.view) : null;
        if (jitterApplied) {
            const w = this._size?.w ?? 1;
            const h = this._size?.h ?? 1;
            const pr = this._pixelRatio ?? 1;
            const pxW = Math.max(1, Math.floor(w * pr));
            const pxH = Math.max(1, Math.floor(h * pr));
            const jitter = getJitterOffsetPx(this._taaJitterIndex, taaJitterStrength);
            this.camera.setViewOffset(pxW, pxH, jitter.x, jitter.y, pxW, pxH);
            this.camera.updateProjectionMatrix();
        }

        try {
            if (!wantsPipeline) {
                this.renderer.render(this.scene, this.camera);
                return;
            }

            if (globalBloomOn) this._renderGlobalBloom(deltaTime);
            if (sunBloomOn) this._renderSunBloom(deltaTime);

            // Avoid running the composite pass when both bloom layers are disabled;
            // even a "no-op" shader pass can subtly change output (alpha/dither/color space).
            this.compositePass.enabled = globalBloomOn || sunBloomOn;

            const mat = this.compositePass?.material ?? null;
            if (mat?.uniforms?.uGlobalBloomTexture) mat.uniforms.uGlobalBloomTexture.value = globalBloomOn ? (this._globalBloomComposer.renderTarget2?.texture ?? this._blackTex) : this._blackTex;
            if (mat?.uniforms?.uSunBloomTexture) mat.uniforms.uSunBloomTexture.value = sunBloomOn ? (this._sunBloomComposer.renderTarget2?.texture ?? this._blackTex) : this._blackTex;

            this.composer.render(deltaTime);
        } finally {
            if (jitterApplied) restoreCameraView(this.camera, prevView);
            if (aaMode === 'taa') this._taaJitterIndex += 1;
            if (canCapture) info.autoReset = prevAutoReset;
        }
    }

    dispose() {
        this._globalBloomPass?.dispose?.();
        this._sunBloomPass?.dispose?.();
        this._ao?.pass?.dispose?.();
        this.taaPass?.dispose?.();
        this.smaaPass?.dispose?.();
        this.fxaaPass?.material?.dispose?.();
        this.outputPass?.material?.dispose?.();
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
