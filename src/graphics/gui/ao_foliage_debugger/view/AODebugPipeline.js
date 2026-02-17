// src/graphics/gui/ao_foliage_debugger/view/AODebugPipeline.js
// Standalone AO-only post-processing pipeline for the AO debug screen.
// @ts-check

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

const AO_DEFAULTS = Object.freeze({
    mode: 'off',
    alpha: Object.freeze({
        handling: 'alpha_test',
        threshold: 0.5
    }),
    ssao: Object.freeze({
        intensity: 0.35,
        radius: 8,
        quality: 'medium'
    }),
    gtao: Object.freeze({
        intensity: 0.35,
        radius: 0.25,
        quality: 'medium',
        denoise: true,
        debugView: false
    })
});

const OUTPUT_COLORSPACE_SHADER = Object.freeze({
    uniforms: {
        tDiffuse: { value: null },
        uEnableToneMapping: { value: 1.0 },
        uEnableOutputColorSpace: { value: 1.0 }
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
        uniform float uEnableToneMapping;
        uniform float uEnableOutputColorSpace;
        varying vec2 vUv;

        #include <common>

        void main() {
            gl_FragColor = texture2D(tDiffuse, vUv);
            if (uEnableToneMapping > 0.5) {
                #include <tonemapping_fragment>
            }
            if (uEnableOutputColorSpace > 0.5) {
                #include <colorspace_fragment>
            }
        }
    `
});

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function deepClone(value) {
    return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function sanitizeQuality(value, fallback) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;
    return fallback;
}

function sanitizeAoMode(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'ssao') return 'ssao';
    if (raw === 'gtao') return 'gtao';
    return 'off';
}

function sanitizeAlphaHandling(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'exclude') return 'exclude';
    return 'alpha_test';
}

function sanitizeAmbientOcclusionSettings(settings) {
    const src = settings && typeof settings === 'object' ? settings : {};
    const alpha = src.alpha && typeof src.alpha === 'object' ? src.alpha : {};
    const ssao = src.ssao && typeof src.ssao === 'object' ? src.ssao : {};
    const gtao = src.gtao && typeof src.gtao === 'object' ? src.gtao : {};

    return {
        mode: sanitizeAoMode(src.mode),
        alpha: {
            handling: sanitizeAlphaHandling(alpha.handling),
            threshold: clamp(alpha.threshold, 0.01, 0.99, AO_DEFAULTS.alpha.threshold)
        },
        ssao: {
            intensity: clamp(ssao.intensity, 0, 2, AO_DEFAULTS.ssao.intensity),
            radius: clamp(ssao.radius, 0.1, 64, AO_DEFAULTS.ssao.radius),
            quality: sanitizeQuality(ssao.quality, AO_DEFAULTS.ssao.quality)
        },
        gtao: {
            intensity: clamp(gtao.intensity, 0, 2, AO_DEFAULTS.gtao.intensity),
            radius: clamp(gtao.radius, 0.05, 8, AO_DEFAULTS.gtao.radius),
            quality: sanitizeQuality(gtao.quality, AO_DEFAULTS.gtao.quality),
            denoise: gtao.denoise !== undefined ? !!gtao.denoise : AO_DEFAULTS.gtao.denoise,
            debugView: gtao.debugView !== undefined ? !!gtao.debugView : AO_DEFAULTS.gtao.debugView
        }
    };
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
    rt1.dispose?.();
    rt2.dispose?.();
    return true;
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
    if (!cs) return;
    tex1.colorSpace = cs;
    tex2.colorSpace = cs;
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

function createWhiteTexture() {
    const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    tex.needsUpdate = true;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

function isLikelyFoliageName(name) {
    const s = String(name ?? '').trim().toLowerCase();
    if (!s) return false;
    return s.includes('leaf') || s.includes('foliage') || s.includes('bush') || s.includes('grass') || s.includes('hedge');
}

function hasAlphaTexture(material) {
    const mat = material && typeof material === 'object' ? material : null;
    if (!mat) return false;
    return !!(mat.alphaMap || mat.map || mat.userData?.aoAlphaMap);
}

function shouldApplyAoAlphaCutout(material, object) {
    const mat = material && typeof material === 'object' ? material : null;
    if (!mat || !hasAlphaTexture(mat)) return false;

    const alphaTest = Number(mat.alphaTest) || 0;
    if (alphaTest > 1e-6) return true;

    const tagged = mat.userData?.isFoliage === true || object?.userData?.isFoliage === true;
    if (tagged) return true;

    if (isLikelyFoliageName(mat.name) || isLikelyFoliageName(object?.name)) return true;

    const transparent = mat.transparent === true;
    const depthWriteDisabled = mat.depthWrite === false;
    const opacity = Number.isFinite(mat.opacity) ? Number(mat.opacity) : 1;
    return transparent && (depthWriteDisabled || opacity < 0.999 || !!mat.alphaMap);
}

function getMaterialForAoGroup(object, group) {
    const obj = object ?? null;
    if (!obj) return null;
    const mat = obj.material ?? null;
    if (!mat) return null;
    if (!Array.isArray(mat)) return mat;
    const idx = Number.isFinite(group?.materialIndex) ? Math.max(0, Math.floor(group.materialIndex)) : 0;
    return mat[idx] ?? mat[0] ?? null;
}

function resolveAoOverrideMaterial({ drawMaterial, sceneOverrideMaterial, overrideMaterials }) {
    const mats = overrideMaterials instanceof Set ? overrideMaterials : null;
    if (!mats || mats.size === 0) return null;
    if (drawMaterial && mats.has(drawMaterial)) return drawMaterial;
    if (sceneOverrideMaterial && mats.has(sceneOverrideMaterial)) return sceneOverrideMaterial;
    return null;
}

function primeAoOverrideMaterial(material, whiteTexture) {
    const mat = material && typeof material === 'object' ? material : null;
    if (!mat?.isMaterial) return;

    let needsUpdate = false;
    if ('transparent' in mat && mat.transparent !== false) {
        mat.transparent = false;
        needsUpdate = true;
    }
    if ('depthWrite' in mat && mat.depthWrite !== true) {
        mat.depthWrite = true;
        needsUpdate = true;
    }
    if (!((Number(mat.alphaTest) || 0) > 0)) {
        mat.alphaTest = 0.0001;
        needsUpdate = true;
    }

    if (mat.map !== whiteTexture) {
        mat.map = whiteTexture;
        needsUpdate = true;
    }
    if (mat.alphaMap !== whiteTexture) {
        mat.alphaMap = whiteTexture;
        needsUpdate = true;
    }

    if (needsUpdate) mat.needsUpdate = true;
}

function applyAoAlphaHandlingToMaterial({
    overrideMaterial,
    sourceMaterial,
    object,
    handling,
    threshold,
    whiteTexture
}) {
    const mat = overrideMaterial && typeof overrideMaterial === 'object' ? overrideMaterial : null;
    if (!mat?.isMaterial) return;

    const src = sourceMaterial && typeof sourceMaterial === 'object' ? sourceMaterial : null;
    const srcAoAlphaMap = src?.userData?.aoAlphaMap?.isTexture ? src.userData.aoAlphaMap : null;
    const mode = String(handling ?? 'alpha_test').toLowerCase();
    const t = Number.isFinite(Number(threshold))
        ? Math.max(0.01, Math.min(0.99, Number(threshold)))
        : 0.5;

    mat.map = whiteTexture;
    mat.alphaMap = whiteTexture;
    mat.alphaTest = 0.0001;

    if (!shouldApplyAoAlphaCutout(src, object)) return;

    if (mode === 'exclude') {
        mat.alphaTest = 1.1;
        return;
    }

    const sourceAlphaTest = Number(src?.alphaTest) || 0;
    const effectiveThreshold = sourceAlphaTest > 0 ? Math.max(t, sourceAlphaTest) : t;
    if (srcAoAlphaMap) {
        // For foliage, prefer dedicated AO alpha maps so AO depth/normal uses the
        // same cutout silhouette as gameplay and does not darken full cards.
        mat.map = whiteTexture;
        mat.alphaMap = srcAoAlphaMap;
    } else {
        mat.map = src?.map ?? whiteTexture;
        mat.alphaMap = src?.alphaMap ?? whiteTexture;
    }
    mat.alphaTest = effectiveThreshold;
}

function resolveSsaoPreset(quality) {
    const q = typeof quality === 'string' ? quality.toLowerCase() : 'medium';
    if (q === 'low') {
        return {
            kernelScaleRange: { min: 0.08, max: 0.18 },
            minDistanceMetersRange: { min: 0.02, max: 0.01 },
            maxDistanceMetersRange: { min: 0.5, max: 0.9 }
        };
    }
    if (q === 'high') {
        return {
            kernelScaleRange: { min: 0.12, max: 0.30 },
            minDistanceMetersRange: { min: 0.015, max: 0.006 },
            maxDistanceMetersRange: { min: 0.8, max: 1.6 }
        };
    }
    return {
        kernelScaleRange: { min: 0.10, max: 0.24 },
        minDistanceMetersRange: { min: 0.018, max: 0.008 },
        maxDistanceMetersRange: { min: 0.65, max: 1.2 }
    };
}

function resolveScaledValue(range, ramp) {
    return range.min + (range.max - range.min) * ramp;
}

function resolveSsaoPassParams({
    quality = 'medium',
    radius = 8,
    intensity = 0.35,
    cameraNear = 0.1,
    cameraFar = 500
} = {}) {
    const q = sanitizeQuality(quality, 'medium');
    const preset = resolveSsaoPreset(q);
    const requestedIntensity = clamp(intensity, 0, 2, 0.35);
    const effectiveIntensity = requestedIntensity;
    const enabled = effectiveIntensity > 0;
    const normalized = clamp(effectiveIntensity / 2, 0, 1, 0);
    const ramp = clamp(Math.pow(normalized, 0.65), 0, 1, 0);
    const radiusInput = clamp(radius, 0.1, 64, 8);
    const near = clamp(cameraNear, 0.0001, 1000, 0.1);
    const far = clamp(cameraFar, near + 0.0001, 100000, 500);
    const depthSpan = Math.max(0.0001, far - near);
    const unitPerMeter = 1 / depthSpan;

    if (!enabled) {
        return {
            quality: q,
            enabled: false,
            kernelRadius: 0,
            minDistance: resolveScaledValue(preset.minDistanceMetersRange, 0) * unitPerMeter,
            maxDistance: 0
        };
    }

    const kernelScale = resolveScaledValue(preset.kernelScaleRange, ramp);
    const minDistanceMeters = resolveScaledValue(preset.minDistanceMetersRange, ramp);
    const maxDistanceMeters = resolveScaledValue(preset.maxDistanceMetersRange, ramp);
    const minDistance = minDistanceMeters * unitPerMeter;
    const maxDistance = Math.max(minDistance * 1.25, maxDistanceMeters * unitPerMeter);

    return {
        quality: q,
        enabled: true,
        kernelRadius: radiusInput * kernelScale,
        minDistance,
        maxDistance
    };
}

export class AODebugPipeline {
    constructor({
        renderer,
        scene,
        camera,
        ambientOcclusion = null,
        msaaSamples = 8
    } = {}) {
        if (!renderer) throw new Error('[AODebugPipeline] renderer is required');
        if (!scene) throw new Error('[AODebugPipeline] scene is required');
        if (!camera) throw new Error('[AODebugPipeline] camera is required');

        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        this._pixelRatio = 1;
        this._size = { w: 1, h: 1 };
        this._ambientOcclusion = sanitizeAmbientOcclusionSettings(ambientOcclusion);
        this._ao = { mode: 'off', pass: null };

        this._whiteTex = createWhiteTexture();

        this._aoAlpha = {
            overrideMaterials: new Set(),
            patchedObjects: new WeakSet(),
            originalOnBeforeRender: new WeakMap(),
            lastSceneScanMs: -Infinity
        };

        const linearColorSpace = THREE.LinearSRGBColorSpace ?? THREE.NoColorSpace;
        this.composer = new EffectComposer(renderer);
        this.composer.renderToScreen = true;
        setComposerRenderTargetColorSpace(this.composer, linearColorSpace);

        this.renderPass = new RenderPass(scene, camera);
        this.outputPass = new ShaderPass(OUTPUT_COLORSPACE_SHADER);
        if (this.outputPass?.material) this.outputPass.material.toneMapped = true;

        this.composer.addPass(this.renderPass);
        this.composer.addPass(this.outputPass);

        const msaa = getMsaaSupportInfo(renderer);
        const targetSamples = msaa.supported
            ? Math.min(Math.max(0, Number(msaaSamples) || 0), Math.max(0, msaa.maxSamples))
            : 0;
        setComposerSamples(this.composer, targetSamples);

        this.setAmbientOcclusion(this._ambientOcclusion);
    }

    _removeComposerPass(pass) {
        if (!pass) return;
        const passes = this.composer?.passes ?? null;
        if (!Array.isArray(passes)) return;
        const idx = passes.indexOf(pass);
        if (idx >= 0) passes.splice(idx, 1);
    }

    _getSsaoKernelSize(quality) {
        const q = sanitizeQuality(quality, 'medium');
        if (q === 'low') return 8;
        if (q === 'high') return 32;
        return 16;
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

        const scale = mode === 'ssao'
            ? (quality === 'low' ? 0.75 : (quality === 'high' ? 1.0 : 0.9))
            : (quality === 'low' ? 0.5 : (quality === 'high' ? 1.0 : 0.75));

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

    _syncAoAlphaCutoutSupport() {
        const aoMode = this._ambientOcclusion?.mode ?? 'off';
        const aoOn = aoMode === 'ssao' || aoMode === 'gtao';
        if (!aoOn) {
            this._aoAlpha.overrideMaterials.clear();
            return;
        }

        const pass = this._ao?.pass ?? null;
        const materials = this._aoAlpha.overrideMaterials;
        materials.clear();

        const maybeAdd = (mat) => {
            if (!mat || typeof mat !== 'object' || !mat.isMaterial) return;
            materials.add(mat);
        };

        maybeAdd(pass?.normalMaterial);
        maybeAdd(pass?.depthMaterial);
        maybeAdd(pass?.depthRenderMaterial);

        const normalPass = pass?.normalPass ?? pass?._normalPass ?? null;
        maybeAdd(normalPass?.normalMaterial);
        maybeAdd(normalPass?.overrideMaterial);

        const depthPass = pass?.depthPass ?? pass?._depthPass ?? null;
        maybeAdd(depthPass?.depthMaterial);
        maybeAdd(depthPass?.overrideMaterial);

        if (pass && typeof pass === 'object') {
            for (const [key, value] of Object.entries(pass)) {
                const k = String(key ?? '').toLowerCase();
                if (!k.includes('normal') && !k.includes('depth')) continue;
                if (!value || typeof value !== 'object') continue;
                maybeAdd(value.normalMaterial);
                maybeAdd(value.depthMaterial);
                maybeAdd(value.overrideMaterial);
            }
        }

        for (const mat of materials) {
            primeAoOverrideMaterial(mat, this._whiteTex);
        }

        if (!Number.isFinite(this._aoAlpha.lastSceneScanMs)) {
            this._scanSceneForAoAlphaHooks();
            this._aoAlpha.lastSceneScanMs = 0;
        }
    }

    _scanSceneForAoAlphaHooks() {
        const scene = this.scene ?? null;
        if (!scene?.traverse) return;

        scene.traverse((obj) => {
            if (!obj?.isMesh) return;
            if (this._aoAlpha.patchedObjects.has(obj)) return;
            this._aoAlpha.patchedObjects.add(obj);

            const prev = typeof obj.onBeforeRender === 'function' ? obj.onBeforeRender : null;
            this._aoAlpha.originalOnBeforeRender.set(obj, prev);

            obj.onBeforeRender = (renderer, s, camera, geometry, material, group) => {
                this._applyAoAlphaCutout(obj, material, group);
                prev?.call(obj, renderer, s, camera, geometry, material, group);
            };
        });
    }

    _applyAoAlphaCutout(object, material, group) {
        const overrideMaterials = this._aoAlpha?.overrideMaterials ?? null;
        if (!overrideMaterials?.size) return;

        const sceneOverrideMaterial = this.scene?.overrideMaterial ?? null;
        const overrideMaterial = resolveAoOverrideMaterial({
            drawMaterial: material,
            sceneOverrideMaterial,
            overrideMaterials
        });
        if (!overrideMaterial) return;

        const ao = this._ambientOcclusion ?? null;
        const handling = ao?.alpha?.handling ?? 'alpha_test';
        const threshold = clamp(ao?.alpha?.threshold, 0.01, 0.99, 0.5);
        const srcMat = getMaterialForAoGroup(object, group);

        applyAoAlphaHandlingToMaterial({
            overrideMaterial,
            sourceMaterial: srcMat,
            object,
            handling,
            threshold,
            whiteTexture: this._whiteTex
        });
    }

    _getGtaoSampleCount(quality) {
        const q = sanitizeQuality(quality, 'medium');
        if (q === 'low') return 8;
        if (q === 'high') return 24;
        return 16;
    }

    _getGtaoDenoiseRadius(quality) {
        const q = sanitizeQuality(quality, 'medium');
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
            this._aoAlpha.overrideMaterials.clear();
            return;
        }

        if (!this._ao.pass) {
            const size = this._getAoPixelSize();
            const passes = this.composer?.passes ?? [];
            const renderIdx = passes.indexOf(this.renderPass);
            const insertAt = renderIdx >= 0 ? renderIdx + 1 : 1;

            if (nextMode === 'ssao') {
                const kernelSize = this._getSsaoKernelSize(settings?.ssao?.quality);
                const pass = new SSAOPass(this.scene, this.camera, size.w, size.h, kernelSize);
                pass.enabled = true;
                if ('output' in pass && SSAOPass?.OUTPUT?.Default !== undefined) {
                    pass.output = SSAOPass.OUTPUT.Default;
                }
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

            this._syncAoAlphaCutoutSupport();
        }

        const pass = this._ao.pass;
        if (!pass) return;

        setToneMappedForPassMaterials(pass, false);
        this._syncAoAlphaCutoutSupport();

        if (nextMode === 'ssao') {
            const ssao = settings?.ssao ?? null;
            const params = resolveSsaoPassParams({
                quality: ssao?.quality,
                radius: ssao?.radius,
                intensity: ssao?.intensity,
                cameraNear: this.camera?.near,
                cameraFar: this.camera?.far
            });

            if ('kernelRadius' in pass) pass.kernelRadius = params.kernelRadius;
            if ('radius' in pass) pass.radius = params.kernelRadius;
            if ('minDistance' in pass) pass.minDistance = params.minDistance;
            if ('maxDistance' in pass) pass.maxDistance = params.maxDistance;
            if ('kernelSize' in pass) pass.kernelSize = this._getSsaoKernelSize(params.quality);
            if ('output' in pass && SSAOPass?.OUTPUT?.Default !== undefined) {
                pass.output = SSAOPass.OUTPUT.Default;
            }
            pass.enabled = params.enabled === true;
            this._syncAoPassSizes();
            return;
        }

        if (nextMode === 'gtao') {
            const gtao = settings?.gtao ?? null;
            const quality = gtao?.quality ?? 'medium';
            const samples = this._getGtaoSampleCount(quality);
            const intensity = clamp(gtao?.intensity, 0, 2, AO_DEFAULTS.gtao.intensity);
            const denoise = gtao?.denoise !== false;
            const debugView = gtao?.debugView === true;

            if ('blendIntensity' in pass) pass.blendIntensity = intensity;

            pass.updateGtaoMaterial?.({
                radius: clamp(gtao?.radius, 0.05, 8, AO_DEFAULTS.gtao.radius),
                distanceExponent: 1.0,
                thickness: 1.0,
                scale: 1.0,
                samples,
                distanceFallOff: 1.0,
                screenSpaceRadius: false
            });

            if (denoise && typeof pass.updatePdMaterial === 'function') {
                pass.updatePdMaterial({
                    lumaPhi: 10.0,
                    depthPhi: 2.0,
                    normalPhi: 3.0,
                    radius: this._getGtaoDenoiseRadius(quality),
                    radiusExponent: 1.0,
                    rings: 2,
                    samples
                });
            }

            if ('output' in pass && GTAOPass?.OUTPUT) {
                const canDebug = debugView && denoise && GTAOPass?.OUTPUT?.Denoise !== undefined;
                pass.output = canDebug ? GTAOPass.OUTPUT.Denoise : GTAOPass.OUTPUT.Default;
            }

            pass.enabled = true;
            this._syncAoPassSizes();
        }
    }

    setPixelRatio(pixelRatio) {
        const pr = clamp(pixelRatio, 0.1, 8, 1);
        this._pixelRatio = pr;
        this.composer?.setPixelRatio?.(pr);
        this._syncAoPassSizes();
    }

    setSize(width, height) {
        const w = Math.max(1, Math.floor(Number(width)));
        const h = Math.max(1, Math.floor(Number(height)));
        this._size.w = w;
        this._size.h = h;
        this.composer?.setSize?.(w, h);
        this._syncAoPassSizes();
    }

    setToneMapping({ toneMapping = null, exposure = null } = {}) {
        const renderer = this.renderer ?? null;
        if (renderer) {
            if (Number.isFinite(toneMapping)) renderer.toneMapping = Number(toneMapping);
            if (Number.isFinite(exposure)) renderer.toneMappingExposure = Number(exposure);
        }
        if (this.outputPass?.material) this.outputPass.material.needsUpdate = true;
    }

    setAmbientOcclusion(ambientOcclusion) {
        const next = sanitizeAmbientOcclusionSettings(ambientOcclusion);
        this._ambientOcclusion = next;
        this._syncAmbientOcclusionPass();
    }

    getAmbientOcclusion() {
        return deepClone(this._ambientOcclusion);
    }

    getAoOverrideDebugInfo() {
        const list = [];
        const mats = this._aoAlpha?.overrideMaterials ?? null;
        if (mats instanceof Set) {
            for (const mat of mats) {
                list.push({
                    type: mat?.type ?? null,
                    alphaTest: Number(mat?.alphaTest) || 0,
                    hasMap: !!mat?.map,
                    hasAlphaMap: !!mat?.alphaMap
                });
            }
        }
        return {
            count: list.length,
            materials: list
        };
    }

    render(deltaTime = undefined) {
        const aoMode = this._ambientOcclusion?.mode ?? 'off';
        const aoOn = aoMode === 'ssao' || aoMode === 'gtao';
        if (aoOn && typeof performance !== 'undefined' && typeof performance.now === 'function') {
            const now = performance.now();
            if ((now - (this._aoAlpha?.lastSceneScanMs ?? -Infinity)) > 1000) {
                this._aoAlpha.lastSceneScanMs = now;
                this._scanSceneForAoAlphaHooks();
            }
        }
        this.composer?.render?.(deltaTime);
    }

    dispose() {
        const pass = this._ao?.pass ?? null;
        this._removeComposerPass(pass);
        pass?.dispose?.();
        this._ao.pass = null;
        this._ao.mode = 'off';

        this.scene?.traverse?.((obj) => {
            if (!obj?.isMesh) return;
            if (!this._aoAlpha.patchedObjects.has(obj)) return;
            const prev = this._aoAlpha.originalOnBeforeRender.get(obj);
            obj.onBeforeRender = typeof prev === 'function' ? prev : undefined;
        });

        this.outputPass?.material?.dispose?.();
        this.composer?.dispose?.();
        this.composer?.renderTarget1?.dispose?.();
        this.composer?.renderTarget2?.dispose?.();
        this._whiteTex?.dispose?.();

        this._aoAlpha.overrideMaterials.clear();
    }
}
