// src/graphics/visuals/sun/SunRaysRig.js
// Procedural sun-ray starburst (shader billboard) used with sun bloom.
// @ts-check

import * as THREE from 'three';
import { sanitizeSunBloomSettings } from '../postprocessing/SunBloomSettings.js';
import { SUN_BLOOM_LAYER_ID } from './SunBloomLayers.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { createSunRaysShaderPayload } from '../../shaders/sun/SunRaysShader.js';

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function smoothstep(edge0, edge1, x) {
    const t = clamp((Number(x) - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

function getSkyRadius(sky) {
    const mesh = sky && typeof sky === 'object' ? sky : null;
    const geom = mesh?.geometry ?? null;
    const r = geom?.parameters?.radius ?? null;
    if (Number.isFinite(r) && r > 0) return r;
    return null;
}

function createSunRaysStarburstMesh() {
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    const payload = createSunRaysShaderPayload({
        uniforms: {
            uColor: new THREE.Color('#fff2d6')
        }
    });
    const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(payload.uniforms),
        vertexShader: payload.vertexSource,
        fragmentShader: payload.fragmentSource,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        toneMapped: false
    });
    attachShaderMetadata(mat, payload, 'sun-rays-starburst');

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'sun_bloom_rays';
    mesh.frustumCulled = false;
    mesh.renderOrder = 948;
    mesh.layers.set(0);
    mesh.layers.enable(SUN_BLOOM_LAYER_ID);
    return mesh;
}

export class SunRaysRig {
    constructor({ light, sky = null, settings = null } = {}) {
        if (!light) throw new Error('[SunRaysRig] light is required');
        this.light = light;
        this.sky = sky;

        this.group = new THREE.Group();
        this.group.name = 'SunRaysRig';
        this.group.frustumCulled = false;

        this._mesh = createSunRaysStarburstMesh();
        this.group.add(this._mesh);
        this._mat = this._mesh.material;

        this._sunWorldPos = new THREE.Vector3();
        this._ndc = new THREE.Vector3();
        this._camForward = new THREE.Vector3();
        this._viewport = new THREE.Vector2();
        this._tmpV3 = new THREE.Vector3();

        this._visibility = 0;
        this._settings = sanitizeSunBloomSettings(settings);
        this.setSettings(settings);
    }

    setSettings(settings) {
        this._settings = sanitizeSunBloomSettings(settings);
        const s = this._settings;
        const u = this._mat?.uniforms ?? null;
        if (u) {
            if (u.uRayCount) u.uRayCount.value = clamp(s.raysCount ?? 48, 3, 256);
            if (u.uRayLength) u.uRayLength.value = clamp(s.raysLength ?? 0.95, 0, 1.6);
            if (u.uLengthJitter) u.uLengthJitter.value = clamp(s.raysLengthJitter ?? 0.45, 0, 1.0);
            if (u.uBaseWidthRad) u.uBaseWidthRad.value = (clamp(s.raysBaseWidthDeg ?? 1.6, 0, 12) * Math.PI) / 180;
            if (u.uTipWidthRad) u.uTipWidthRad.value = (clamp(s.raysTipWidthDeg ?? 0.28, 0, 12) * Math.PI) / 180;
            if (u.uSoftnessRad) u.uSoftnessRad.value = (clamp(s.raysSoftnessDeg ?? 0.9, 0, 12) * Math.PI) / 180;
            if (u.uCoreGlow) u.uCoreGlow.value = clamp(s.raysCoreGlow ?? 0.35, 0, 2.0);
            if (u.uOuterGlow) u.uOuterGlow.value = clamp(s.raysOuterGlow ?? 0.18, 0, 2.0);
            if (u.uRotationRad) u.uRotationRad.value = (clamp(s.raysRotationDeg ?? 0, -360, 360) * Math.PI) / 180;
        }
        const on = !!s.enabled && !!s.raysEnabled;
        this.group.visible = on;
        this._mesh.visible = on;
    }

    update(engine) {
        const camera = engine?.camera ?? null;
        const renderer = engine?.renderer ?? null;
        if (!camera || !renderer) return;

        const s = this._settings;
        const enabled = !!s?.enabled && !!s?.raysEnabled;
        this.group.visible = enabled;
        if (!enabled) return;

        const far = Number.isFinite(camera.far) ? camera.far : 2000;
        const skyRadius = getSkyRadius(this.sky);
        const dist = Math.max(50, Math.min(far * 0.92, (skyRadius ?? far) * 0.92));

        const sunDir = this._tmpV3.copy(this.light.position).normalize();
        this._sunWorldPos.copy(camera.position).addScaledVector(sunDir, dist);

        this._ndc.copy(this._sunWorldPos).project(camera);
        const edge = Math.max(Math.abs(this._ndc.x), Math.abs(this._ndc.y));
        const inFront = this._ndc.z >= -1 && this._ndc.z <= 1;
        const edgeFade = 1 - smoothstep(0.92, 1.02, edge);

        this._camForward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        const forwardDot = this._camForward.dot(sunDir);
        const forwardFade = smoothstep(0.02, 0.10, forwardDot);

        const target = inFront ? (edgeFade * forwardFade) : 0;
        this._visibility = this._visibility * 0.88 + target * 0.12;

        const u = this._mat?.uniforms ?? null;
        if (u?.uIntensity) u.uIntensity.value = clamp(s.raysIntensity ?? 0.85, 0, 6) * this._visibility;

        const mesh = this._mesh;
        mesh.visible = this._visibility > 0.002;
        if (!mesh.visible) return;

        mesh.position.copy(this._sunWorldPos);
        mesh.quaternion.copy(camera.quaternion);

        renderer.getSize(this._viewport);
        const viewportH = Math.max(1, this._viewport.y || 720);
        const fovRad = (Number.isFinite(camera.fov) ? camera.fov : 55) * (Math.PI / 180);
        const tanHalfFov = Math.tan(fovRad * 0.5);
        const dToCam = mesh.position.distanceTo(camera.position);
        const worldUnitsPerPixel = (2 * dToCam * tanHalfFov) / viewportH;

        const sizePx = clamp(s.raysSizePx ?? 950, 64, 2400);
        const sizeFactor = Math.sqrt(clamp(this._visibility, 0, 1));
        const scale = sizePx * worldUnitsPerPixel * sizeFactor;
        mesh.scale.set(scale, scale, 1);
        mesh.updateMatrixWorld?.();
    }

    dispose() {
        const mesh = this._mesh;
        mesh?.removeFromParent?.();
        mesh?.geometry?.dispose?.();
        mesh?.material?.dispose?.();
        this._mesh = null;
        this._mat = null;
        this.group.removeFromParent?.();
    }
}
