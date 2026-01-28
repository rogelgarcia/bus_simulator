// src/graphics/visuals/sun/SunBloomRig.js
// Physical sun bloom emitter mesh (occlusion-capable).
// @ts-check

import * as THREE from 'three';
import { sanitizeSunBloomSettings } from '../postprocessing/SunBloomSettings.js';
import { SUN_BLOOM_LAYER_ID } from './SunBloomLayers.js';

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
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uIntensity: { value: 25.0 },
            uFalloff: { value: 2.2 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uIntensity;
            uniform float uFalloff;
            varying vec2 vUv;

            void main() {
                vec2 p = vUv * 2.0 - 1.0;
                float r = length(p);
                float a = exp(-pow(r, max(0.05, uFalloff)) * 6.0);
                vec3 col = vec3(1.0) * (a * uIntensity);
                gl_FragColor = vec4(col, a);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        toneMapped: false
    });

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

