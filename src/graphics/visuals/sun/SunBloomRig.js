// src/graphics/visuals/sun/SunBloomRig.js
// Physical sun bloom emitter mesh (occlusion-capable).
// @ts-check

import * as THREE from 'three';
import { sanitizeSunBloomSettings } from '../postprocessing/SunBloomSettings.js';
import { SUN_BLOOM_LAYER_ID } from './SunBloomLayers.js';
import { createSunBloomDebuggerEmitterPayload } from '../../shaders/diagnostics/SunBloomDebuggerShader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function getSkyRadius(sky) {
    const mesh = sky && typeof sky === 'object' ? sky : null;
    const geom = mesh?.geometry ?? null;
    const r = geom?.parameters?.radius ?? null;
    if (Number.isFinite(r) && r > 0) return r;
    return null;
}

function createSunDiscEmitter() {
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    const payload = createSunBloomDebuggerEmitterPayload({
        uniforms: {
            uIntensity: 25.0,
            uFalloff: 2.2
        }
    });
    const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(payload.uniforms),
        vertexShader: payload.vertexSource,
        fragmentShader: payload.fragmentSource,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        toneMapped: false
    });
    attachShaderMetadata(mat, payload, 'sun-bloom-emitter');

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'sun_bloom_emitter';
    mesh.frustumCulled = false;
    mesh.renderOrder = 940;
    mesh.layers.set(SUN_BLOOM_LAYER_ID);
    return mesh;
}

export class SunBloomRig {
    constructor({ light, sky = null, settings = null } = {}) {
        if (!light) throw new Error('[SunBloomRig] light is required');
        this.light = light;
        this.sky = sky;
        this.group = new THREE.Group();
        this.group.name = 'SunBloomRig';
        this.group.frustumCulled = false;

        this._sunWorldPos = new THREE.Vector3();
        this._tmpV3 = new THREE.Vector3();

        this._mesh = createSunDiscEmitter();
        this.group.add(this._mesh);

        this._settings = sanitizeSunBloomSettings(settings);
        this.setSettings(settings);
    }

    setSettings(settings) {
        this._settings = sanitizeSunBloomSettings(settings);
        const s = this._settings;
        const mat = this._mesh?.material ?? null;
        if (mat?.uniforms?.uIntensity) mat.uniforms.uIntensity.value = clamp(s.discIntensity, 0, 200, 25);
        if (mat?.uniforms?.uFalloff) mat.uniforms.uFalloff.value = clamp(s.discFalloff, 0.5, 10, 2.2);
        this.group.visible = !!s.enabled;
        this._mesh.visible = !!s.enabled;
    }

    update(engine) {
        const camera = engine?.camera ?? null;
        if (!camera) return;
        if (!this._settings?.enabled) return;

        const far = Number.isFinite(camera.far) ? camera.far : 2000;
        const skyRadius = getSkyRadius(this.sky);
        const dist = Math.max(60, Math.min(far * 0.92, (skyRadius ?? far) * 0.92));

        const sunDir = this._tmpV3.copy(this.light.position).normalize();
        this._sunWorldPos.copy(camera.position).addScaledVector(sunDir, dist);

        const rDeg = clamp(this._settings.discRadiusDeg, 0.05, 6, 0.55);
        const rRad = (rDeg * Math.PI) / 180;
        const radius = dist * Math.tan(rRad);
        const size = Math.max(0.01, radius * 2);

        const mesh = this._mesh;
        mesh.position.copy(this._sunWorldPos);
        mesh.scale.set(size, size, 1);
        mesh.quaternion.copy(camera.quaternion);
        mesh.updateMatrixWorld?.();
    }

    dispose() {
        const mesh = this._mesh;
        mesh?.removeFromParent?.();
        mesh?.geometry?.dispose?.();
        mesh?.material?.dispose?.();
        this._mesh = null;
        this.group.removeFromParent?.();
    }
}
