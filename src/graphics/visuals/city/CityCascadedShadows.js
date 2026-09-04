// src/graphics/visuals/city/CityCascadedShadows.js
// Cascaded shadow maps for the city sun, wrapping three's CSM addon.
//
// The addon replaces two global ShaderChunk entries at construction time
// (guarded by USE_CSM defines, so unregistered materials keep stock behavior),
// creates one shadow-casting DirectionalLight per cascade under `parent`, and
// expects every lit material to be registered. Registration here deliberately
// does NOT use csm.setupMaterial(): CSM instead owns one entry in the shared
// material shader-hook registry, so independently owned extensions survive its
// teardown. The CSM hook only adds uniforms and does no source surgery.
//
// csm.dispose() is never called either: it deletes material.onBeforeCompile
// unconditionally, which would nuke other registered extensions on shared
// materials. Teardown removes only the CSM-owned registry entry.
// @ts-check

import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { isLitMaterial } from '../../lighting/SceneShadowMaterials.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

// Texel density the shadow presets' normalBias values are tuned for: the
// single fitted map (110 m radius -> 220 m box) at 4096 px = ~0.054 m/texel.
// Each cascade's normalBias is scaled by its own density relative to this.
const REFERENCE_TEXEL_METERS = 220 / 4096;

// Cascade split distances in meters from the camera. The last split equals
// maxFar (the shadow horizon).
//
// The first split is where sharpness visibly steps down, so it is placed well
// past the near ground a driver actually looks at (~90 m: the far kerb and
// second tree row from a bus-level camera) rather than at the edge of the
// bonnet. A cascade's shadow-map box is ~1.5x its split distance, so pushing
// the first split out costs texel density unless the map grows with it --
// hence the `cascaded` preset's 4096 maps. Scale the whole layout with
// `splitScale` (settings / ?shadowSplitScale=) to trade range against density.
const SPLITS_BY_CASCADES = Object.freeze({
    2: Object.freeze([110, 340]),
    3: Object.freeze([55, 150, 340]),
    4: Object.freeze([45, 90, 190, 340])
});

// Per-cascade shadow-map size, as a multiplier on the preset's base size.
// A uniform size spends texels badly: a cascade's box grows ~2.2x with its
// split distance, so the third band -- where foliage detail actually dies --
// ends up four times coarser than the nearest one. Stepping the third band up
// evens density out across everything within ~190 m.
//
// The near cascade gets double size, not half. It was tried at half (the eye
// "should not" resolve 2.4 cm texels at 45 m) and the bus shadow visibly
// degraded: the bus sits a few metres from the camera and fills much of the
// screen, so its shadow texels are always under scrutiny. Distance-based
// reasoning does not apply to a caster that close, and the correct cure for a
// stepped edge is resolution -- blurring it with a wider PCF radius just trades
// a staircase for an overcast-looking smear, which is wrong under a high sun.
//
// Multipliers must stay powers of two: the texel-snapping grid below relies on
// every cascade's texel size being a whole multiple of the smallest one.
// Neighbouring cascades must also stay CLOSE to each other, not just be dense
// individually: a 4x density step at a split is visible as a line across the
// ground where detail collapses (reported at the 45 m boundary once the near
// cascade alone was doubled). Keeping every in-view cascade at 2x holds each
// step to ~2x, which the fade blends invisibly. Only the last cascade, whose
// band starts at 190 m, stays at base size.
const MAP_SIZE_SCALE_BY_CASCADES = Object.freeze({
    2: Object.freeze([2, 1]),
    3: Object.freeze([2, 2, 1]),
    4: Object.freeze([2, 2, 2, 1])
});

const MAX_CASCADE_MAP_SIZE = 8192;

// The most cascades any preset or override can ask for (the constructor clamps
// to this). Every CSM_cascades uniform array is held at this length — see
// _padCascadeUniforms.
const MAX_SUPPORTED_CASCADES = 4;
const CSM_MATERIAL_HOOK_ID = 'city.cascaded_shadows';
const CSM_MATERIAL_HOOK_PRIORITY = 100;

/**
 * Grow a CSM_cascades uniform array to MAX_SUPPORTED_CASCADES, repeating the
 * last real break. Must be applied both where the array is BORN (our
 * onBeforeCompile, which asks CSM for an array sized to the live count) and
 * after every csm.update() (which truncates it back). Missing either place
 * leaves the window open — the first version of this fix only did the latter,
 * and the very compile that creates a mismatched program also creates a fresh
 * short array, after that frame's padding has already run.
 */
function padBreaks(arr) {
    if (!Array.isArray(arr) || arr.length >= MAX_SUPPORTED_CASCADES) return arr;
    const last = arr[arr.length - 1] ?? null;
    while (arr.length < MAX_SUPPORTED_CASCADES) {
        const v = new THREE.Vector2();
        if (last) v.copy(last);
        arr.push(v);
    }
    return arr;
}

export class CityCascadedShadows {
    constructor({ camera, parent, sunRef, preset, cascades = 3, mapSize = 2048, splitScale = 1, maxTextureSize = 0 }) {
        if (!camera) throw new Error('[CityCascadedShadows] camera is required');
        if (!parent) throw new Error('[CityCascadedShadows] parent is required');
        if (!sunRef?.direction?.isVector3) throw new Error('[CityCascadedShadows] sunRef is required');

        this.sunRef = sunRef;
        this.cascades = Math.max(2, Math.min(4, Math.round(cascades) || 3));
        this.mapSize = Math.max(256, mapSize | 0);
        this._preset = preset ?? null;

        // A cascade preset may carry its own layout. The by-count tables below
        // remain the fallback, and are also what a `?shadowCascades=` override
        // falls back to, since a preset's arrays only fit the count it declares.
        const fromPreset = (value) => (Array.isArray(value) && value.length === this.cascades ? value : null);

        const sizeCap = Number.isFinite(maxTextureSize) && maxTextureSize >= 256
            ? Math.min(MAX_CASCADE_MAP_SIZE, Math.floor(maxTextureSize))
            : MAX_CASCADE_MAP_SIZE;
        const scales = fromPreset(preset?.mapSizeScales)
            ?? MAP_SIZE_SCALE_BY_CASCADES[this.cascades]
            ?? MAP_SIZE_SCALE_BY_CASCADES[4];
        this.mapSizes = scales.map((s) => Math.max(256, Math.min(sizeCap, Math.round(this.mapSize * s))));
        const scale = Number.isFinite(splitScale) && splitScale > 0
            ? Math.max(0.5, Math.min(2.5, splitScale))
            : 1;
        this.splitScale = scale;
        const baseSplits = fromPreset(preset?.splits)
            ?? SPLITS_BY_CASCADES[this.cascades]
            ?? SPLITS_BY_CASCADES[3];
        const splits = baseSplits.map((d) => d * scale);
        this.splits = splits;
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
            // Must clear the far cascade's light-space depth extent (its box is
            // ~1.5x maxFar) plus the margin the light sits back by, at any sun
            // elevation; a receiver past this plane samples outside the map and
            // renders unshadowed.
            lightFar: Math.max(600, this.maxFar * 3 + 200),
            lightMargin: 160
        });
        // CSM sizes every cascade map from its single `shadowMapSize`; give each
        // light its own. Done before the first render, so nothing is allocated
        // at the constructor size.
        this.csm.lights.forEach((light, i) => {
            const size = this.mapSizes[i];
            light.shadow.mapSize.set(size, size);
        });
        // CSM.update() snaps each cascade's centre to a texel grid derived from
        // this one value, and a grid finer than a cascade's real texels lets its
        // centre land mid-texel, which is exactly the edge crawl the snapping
        // exists to prevent. The smallest size is the safe grid: every other
        // cascade's texel size divides it (all sizes are power-of-two related),
        // so they stay snapped too, just quantised more coarsely than required.
        this.csm.shadowMapSize = Math.min(...this.mapSizes);

        // Blend neighbouring cascades across the split instead of hard-switching
        // (decided at construction; toggling later forces shader recompiles).
        this.csm.fade = true;
        this.csm.updateFrustums();
        this._applyPresetToLights();

        /** @type {Map<any, { remove: () => boolean }>} */
        this._registered = new Map();
        this._camState = null;
        this._disposed = false;
    }

    /** Per-light knobs the quality preset carries. */
    _applyPresetToLights() {
        const preset = this._preset ?? {};
        const normalBias = Number.isFinite(preset.normalBias) ? preset.normalBias : 0.02;
        const radius = Number.isFinite(preset.radius) ? preset.radius : 1;
        this.csm.lights.forEach((light, i) => {
            const cam = light.shadow.camera;
            const extent = Math.max(1e-3, cam.right - cam.left);
            const texel = extent / (this.mapSizes[i] ?? this.mapSize);
            // Bias tuned for a 220 m map is wrong for a 40 m one: scale the
            // world-space normal offset with each cascade's texel size.
            if ('normalBias' in light.shadow) {
                light.shadow.normalBias = normalBias * (texel / REFERENCE_TEXEL_METERS);
            }
            if ('radius' in light.shadow) light.shadow.radius = radius;
            light.color.copy(this.sunRef.color ?? light.color);
        });
    }

    /**
     * Prepare one lit material for cascaded shadows. Idempotent. Equivalent to
     * csm.setupMaterial(), with independently removable registry ownership.
     */
    registerMaterial(material) {
        if (this._disposed || !isLitMaterial(material)) return;
        if (this._registered.has(material)) return;

        material.defines = material.defines || {};
        material.defines.USE_CSM = 1;
        material.defines.CSM_CASCADES = this.csm.cascades;
        if (this.csm.fade) material.defines.CSM_FADE = '';

        const csm = this.csm;
        const hook = registerMaterialShaderHook(material, {
            id: CSM_MATERIAL_HOOK_ID,
            priority: CSM_MATERIAL_HOOK_PRIORITY,
            variantKey: 'v1:c' + this.csm.cascades + ':f' + (this.csm.fade ? 1 : 0),
            apply(shader) {
                const far = Math.min(csm.camera.far, csm.maxFar);
                const breaksVec2 = [];
                csm._getExtendedBreaks(breaksVec2);
                // Born at full length: this compile may be producing a program that
                // declares MORE cascades than the live count (see padCascadeUniforms).
                shader.uniforms.CSM_cascades = { value: padBreaks(breaksVec2) };
                shader.uniforms.cameraNear = { value: csm.camera.near };
                shader.uniforms.shadowFar = { value: far };
                csm.shaders.set(material, shader);
            }
        });
        csm.shaders.set(material, null);

        this._registered.set(material, hook);
    }

    /**
     * Re-assert USE_CSM / CSM_CASCADES over a subtree, and report how many were
     * wrong.
     *
     * The CSM fragment loop runs over NUM_DIR_LIGHTS — the scene's directional
     * light count — but only index CSM_CASCADES-1 acts as the catch-all last
     * cascade. So a material whose define is BELOW the live light count keeps
     * iterating past its own cascades and applies those surplus lights again,
     * and a lit material with no USE_CSM at all sees every cascade light as a
     * plain full-intensity sun. Either way the scene brightens with the cascade
     * count: measured +81 luma (nearly double) at 3 and 4 cascades, and exactly
     * zero at 2, where there is nothing above the floor to over-apply.
     *
     * That is the mirror of the crash padCascadeUniforms guards: a define ABOVE
     * the live count reads past the uniform array, a define BELOW it silently
     * doubles the light.
     */
    reconcileMaterials(root) {
        if (this._disposed || !root?.traverse) return 0;
        const live = this.csm.cascades;
        let repaired = 0;
        root.traverse((o) => {
            const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
            for (const material of mats) {
                if (!isLitMaterial(material)) continue;
                if (!this._registered.has(material)) {
                    this.registerMaterial(material);
                    repaired++;
                    continue;
                }
                // Registered but carrying the wrong count — someone rewrote the
                // defines, or it was registered against a previous cascade set.
                if (!material.defines?.USE_CSM || material.defines.CSM_CASCADES !== live) {
                    material.defines ||= {};
                    material.defines.USE_CSM = 1;
                    material.defines.CSM_CASCADES = live;
                    if (this.csm.fade) material.defines.CSM_FADE = '';
                    material.needsUpdate = true;
                    repaired++;
                }
            }
        });
        return repaired;
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
        // csm.update() re-truncates every array to the live cascade count, so
        // this has to run after it, every frame.
        this.padCascadeUniforms();
    }

    /**
     * Hold every CSM_cascades uniform array at MAX_SUPPORTED_CASCADES entries.
     *
     * Three's CSM keeps ONE Vector2 array per material and truncates it to the
     * live cascade count on every update (`_getExtendedBreaks` ends with
     * `target.length = this.breaks.length`). Uniform upload, however, is driven
     * by whichever PROGRAM a mesh currently holds, and one material can hold
     * several — instanced vs not, different light hashes, variants that were
     * not visible when the cascade set was rebuilt. If any of those still
     * declares a LARGER CSM_CASCADES than the live count, three walks off the
     * end of the array and dies in flatten(): "cannot read properties of
     * undefined (reading 'toArray')".
     *
     * Only LOWERING the count can do this — raising it merely leaves entries
     * unread — which is why single tiers and upward cascade steps are always
     * safe while cascade med -> low crashed. Rebuilding programs eagerly
     * (renderer.compile) narrows the window but cannot close it, because it
     * only reaches material variants that are visible and in the scene at that
     * instant. Padding closes it outright: the upload is in range whichever
     * program wins the race.
     *
     * Padding repeats the last real break so a stale program samples a
     * saturated range rather than zeros for the one frame before it recompiles.
     */
    padCascadeUniforms() {
        this.csm.shaders.forEach((shader) => {
            padBreaks(shader?.uniforms?.CSM_cascades?.value);
        });
    }

    /** m/texel and VRAM numbers for the perf report. */
    getMetrics() {
        const cascades = [];
        let vramBytes = 0;
        for (let i = 0; i < this.csm.lights.length; i++) {
            const cam = this.csm.lights[i].shadow.camera;
            const extent = cam.right - cam.left;
            const size = this.mapSizes[i] ?? this.mapSize;
            cascades.push({
                extentMeters: extent,
                mapSize: size,
                metersPerTexel: extent / size,
                breakEnd: this.csm.breaks[i] ?? null
            });
            // 4 bytes/texel depth per map.
            vramBytes += size * size * 4;
        }
        return { mapSize: this.mapSize, mapSizes: this.mapSizes.slice(), maxFar: this.maxFar, cascades, vramBytes };
    }

    /**
     * Restore every registered material to its pre-registration state and
     * remove the cascade lights. Intentionally not csm.dispose() — see header.
     */
    dispose() {
        if (this._disposed) return;
        this._disposed = true;

        for (const [material, hook] of this._registered) {
            hook.remove();
            if (material.defines) {
                delete material.defines.USE_CSM;
                delete material.defines.CSM_CASCADES;
                delete material.defines.CSM_FADE;
            }
            // Deliberately NOT deleting shader.uniforms.CSM_cascades and
            // friends, which is what three's own CSM.dispose() does. The
            // compiled program still declares those uniforms until the
            // recompile that `needsUpdate` schedules actually happens, and
            // WebGLUniforms.upload dereferences every declared uniform by
            // name — a deleted entry crashes it with "cannot read properties
            // of undefined (reading 'needsUpdate')". Leaving the values in
            // place is harmless: the next program simply stops asking for
            // them. Reproduced by changing splitScale at runtime, which
            // disposes and rebuilds the whole cascade set mid-frame.
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
