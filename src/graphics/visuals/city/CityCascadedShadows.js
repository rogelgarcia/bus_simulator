// src/graphics/visuals/city/CityCascadedShadows.js
// Cascaded shadow maps for the city sun, wrapping three's CSM addon.
//
// The addon replaces two global ShaderChunk entries at construction time
// (guarded by USE_CSM defines, so unregistered materials keep stock behavior),
// creates one shadow-casting DirectionalLight per cascade under `parent`, and
// expects every lit material to be registered. Registration here deliberately
// does NOT use csm.setupMaterial(): that overwrites material.onBeforeCompile,
// while this codebase chains it (capture previous, call it). The CSM hook only
// adds uniforms — it does no source surgery — so chain order is irrelevant.
//
// csm.dispose() is never called either: it deletes material.onBeforeCompile
// unconditionally, which would nuke chained wrappers (material variation, UV
// tiling, static AO) on shared materials. Teardown restores each material to
// its exact pre-registration state instead.
// @ts-check

import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { isLitMaterial } from '../../lighting/SceneShadowMaterials.js';

// Texel density the shadow presets' normalBias values are tuned for: the
// single fitted map (110 m radius -> 220 m box) at 4096 px = ~0.054 m/texel.
// Each cascade's normalBias is scaled by its own density relative to this.
const REFERENCE_TEXEL_METERS = 220 / 4096;

// Cascade split distances in meters from the camera, tuned for a bus-level
// camera: crisp near the bus, mid range for the street, far out to the
// skyline. The last split equals maxFar.
const SPLITS_BY_CASCADES = Object.freeze({
    2: Object.freeze([45, 300]),
    3: Object.freeze([30, 90, 300]),
    4: Object.freeze([20, 55, 130, 300])
});

export class CityCascadedShadows {
    constructor({ camera, parent, sunRef, preset, cascades = 3, mapSize = 2048 }) {
        if (!camera) throw new Error('[CityCascadedShadows] camera is required');
        if (!parent) throw new Error('[CityCascadedShadows] parent is required');
        if (!sunRef?.direction?.isVector3) throw new Error('[CityCascadedShadows] sunRef is required');

        this.sunRef = sunRef;
        this.cascades = Math.max(2, Math.min(4, Math.round(cascades) || 3));
        this.mapSize = Math.max(256, mapSize | 0);
        this._preset = preset ?? null;
        const splits = SPLITS_BY_CASCADES[this.cascades] ?? SPLITS_BY_CASCADES[3];
        this.maxFar = splits[splits.length - 1];

        // CSM mutates lightDirection's referenced vector never replaces it, so
        // keeping our own instance means per-frame sync is a plain copy.
        this._lightDirection = sunRef.direction.clone().negate().normalize();

        this.csm = new CSM({
            camera,
            parent,
            cascades: this.cascades,
            maxFar: this.maxFar,
            mode: 'custom',
            customSplitsCallback: (amount, near, far, target) => {
                for (let i = 0; i < amount - 1; i++) {
                    target.push(Math.min(0.99, splits[i] / far));
                }
                target.push(1);
            },
            shadowMapSize: this.mapSize,
            shadowBias: Number.isFinite(preset?.bias) ? preset.bias : -0.00015,
            lightDirection: this._lightDirection,
            lightIntensity: Number.isFinite(sunRef.intensity) ? sunRef.intensity : 1,
            lightNear: 1,
            lightFar: 600,
            lightMargin: 160
        });
        // Blend neighbouring cascades across the split instead of hard-switching
        // (decided at construction; toggling later forces shader recompiles).
        this.csm.fade = true;
        this.csm.updateFrustums();
        this._applyPresetToLights();

        /** @type {Map<any, { hadOwnOnBeforeCompile: boolean, prevOnBeforeCompile: any }>} */
        this._registered = new Map();
        this._camState = null;
        this._disposed = false;
    }

    /** Per-light knobs the quality preset carries. */
    _applyPresetToLights() {
        const preset = this._preset ?? {};
        const normalBias = Number.isFinite(preset.normalBias) ? preset.normalBias : 0.02;
        const radius = Number.isFinite(preset.radius) ? preset.radius : 1;
        for (const light of this.csm.lights) {
            const cam = light.shadow.camera;
            const extent = Math.max(1e-3, cam.right - cam.left);
            const texel = extent / this.mapSize;
            // Bias tuned for a 220 m map is wrong for a 40 m one: scale the
            // world-space normal offset with each cascade's texel size.
            if ('normalBias' in light.shadow) {
                light.shadow.normalBias = normalBias * (texel / REFERENCE_TEXEL_METERS);
            }
            if ('radius' in light.shadow) light.shadow.radius = radius;
            light.color.copy(this.sunRef.color ?? light.color);
        }
    }

    /**
     * Prepare one lit material for cascaded shadows. Idempotent. Equivalent to
     * csm.setupMaterial() but chains onBeforeCompile instead of overwriting it.
     */
    registerMaterial(material) {
        if (this._disposed || !isLitMaterial(material)) return;
        if (this._registered.has(material)) return;

        const hadOwnOnBeforeCompile = Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile');
        const prevOnBeforeCompile = hadOwnOnBeforeCompile ? material.onBeforeCompile : null;

        material.defines = material.defines || {};
        material.defines.USE_CSM = 1;
        material.defines.CSM_CASCADES = this.csm.cascades;
        if (this.csm.fade) material.defines.CSM_FADE = '';

        const csm = this.csm;
        const prev = typeof material.onBeforeCompile === 'function' ? material.onBeforeCompile.bind(material) : null;
        material.onBeforeCompile = (shader, renderer) => {
            if (prev) prev(shader, renderer);
            const far = Math.min(csm.camera.far, csm.maxFar);
            const breaksVec2 = [];
            csm._getExtendedBreaks(breaksVec2);
            shader.uniforms.CSM_cascades = { value: breaksVec2 };
            shader.uniforms.cameraNear = { value: csm.camera.near };
            shader.uniforms.shadowFar = { value: far };
            csm.shaders.set(material, shader);
        };
        csm.shaders.set(material, null);

        this._registered.set(material, { hadOwnOnBeforeCompile, prevOnBeforeCompile });
        material.needsUpdate = true;
    }

    /** Sun intensity changed (options slider); mirror it onto every cascade light. */
    setIntensity(value) {
        if (!Number.isFinite(value)) return;
        for (const light of this.csm.lights) light.intensity = value;
    }

    /** Drive the cascades: camera sync, sun direction sync, cascade fitting. */
    updateFrame(engine) {
        if (this._disposed) return;
        const camera = engine?.camera ?? null;
        if (!camera) return;

        const csm = this.csm;
        if (csm.camera !== camera) {
            csm.camera = camera;
            this._camState = null;
        }
        const s = this._camState;
        if (!s || s.near !== camera.near || s.far !== camera.far
            || s.fov !== camera.fov || s.aspect !== camera.aspect) {
            csm.updateFrustums();
            this._applyPresetToLights();
            this._camState = { near: camera.near, far: camera.far, fov: camera.fov, aspect: camera.aspect };
        }

        this._lightDirection.copy(this.sunRef.direction).negate().normalize();
        const intensity = this.sunRef.intensity;
        if (Number.isFinite(intensity) && csm.lights[0]?.intensity !== intensity) {
            this.setIntensity(intensity);
        }
        csm.update();
    }

    /** m/texel and VRAM numbers for the perf report. */
    getMetrics() {
        const cascades = [];
        for (let i = 0; i < this.csm.lights.length; i++) {
            const cam = this.csm.lights[i].shadow.camera;
            const extent = cam.right - cam.left;
            cascades.push({
                extentMeters: extent,
                metersPerTexel: extent / this.mapSize,
                breakEnd: this.csm.breaks[i] ?? null
            });
        }
        // 4 bytes/texel depth per map.
        const vramBytes = this.csm.lights.length * this.mapSize * this.mapSize * 4;
        return { mapSize: this.mapSize, maxFar: this.maxFar, cascades, vramBytes };
    }

    /**
     * Restore every registered material to its pre-registration state and
     * remove the cascade lights. Intentionally not csm.dispose() — see header.
     */
    dispose() {
        if (this._disposed) return;
        this._disposed = true;

        for (const [material, entry] of this._registered) {
            const shader = this.csm.shaders.get(material) ?? null;
            if (entry.hadOwnOnBeforeCompile) material.onBeforeCompile = entry.prevOnBeforeCompile;
            else delete material.onBeforeCompile;
            if (material.defines) {
                delete material.defines.USE_CSM;
                delete material.defines.CSM_CASCADES;
                delete material.defines.CSM_FADE;
            }
            if (shader?.uniforms) {
                delete shader.uniforms.CSM_cascades;
                delete shader.uniforms.cameraNear;
                delete shader.uniforms.shadowFar;
            }
            material.needsUpdate = true;
        }
        this._registered.clear();
        this.csm.shaders.clear();

        for (const light of this.csm.lights) {
            light.target.removeFromParent?.();
            light.removeFromParent?.();
            light.shadow?.map?.dispose?.();
            if (light.shadow) light.shadow.map = null;
        }
    }
}
