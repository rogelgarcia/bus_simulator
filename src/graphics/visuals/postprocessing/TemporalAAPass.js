// src/graphics/visuals/postprocessing/TemporalAAPass.js
// Temporal anti-aliasing pass (history accumulation + clamp + optional sharpen).
// @ts-check

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const TAA_SHADER = Object.freeze({
    uniforms: {
        tDiffuse: { value: null },
        tHistory: { value: null },
        uHistoryStrength: { value: 0.85 },
        uClampStrength: { value: 0.75 },
        uSharpenStrength: { value: 0.15 },
        uInvResolution: { value: new THREE.Vector2(1, 1) }
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
        uniform sampler2D tHistory;
        uniform float uHistoryStrength;
        uniform float uClampStrength;
        uniform float uSharpenStrength;
        uniform vec2 uInvResolution;
        varying vec2 vUv;

        vec3 sampleTex(sampler2D tex, vec2 uv) {
            return texture2D(tex, uv).rgb;
        }

        void main() {
            vec4 cur4 = texture2D(tDiffuse, vUv);
            vec3 cur = cur4.rgb;
            vec3 his = sampleTex(tHistory, vUv);

            vec2 dx = vec2(uInvResolution.x, 0.0);
            vec2 dy = vec2(0.0, uInvResolution.y);

            vec3 n0 = sampleTex(tDiffuse, vUv - dx);
            vec3 n1 = sampleTex(tDiffuse, vUv + dx);
            vec3 n2 = sampleTex(tDiffuse, vUv - dy);
            vec3 n3 = sampleTex(tDiffuse, vUv + dy);

            vec3 minC = min(cur, min(min(n0, n1), min(n2, n3)));
            vec3 maxC = max(cur, max(max(n0, n1), max(n2, n3)));

            float clampK = clamp(uClampStrength, 0.0, 1.0);
            float padding = mix(16.0, 0.0, clampK);
            vec3 lo = minC - vec3(padding);
            vec3 hi = maxC + vec3(padding);
            vec3 hisClamped = clamp(his, lo, hi);

            float k = clamp(uHistoryStrength, 0.0, 0.98);
            vec3 blended = mix(cur, hisClamped, k);

            float sharpK = clamp(uSharpenStrength, 0.0, 1.0);
            vec3 blur4 = 0.25 * (n0 + n1 + n2 + n3);
            vec3 detail = cur - blur4;
            vec3 outColor = blended + detail * sharpK;

            gl_FragColor = vec4(outColor, cur4.a);
        }
    `
});

const COPY_SHADER = Object.freeze({
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
        }
    `
});

function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

export class TemporalAAPass extends ShaderPass {
    constructor({ colorSpace = null } = {}) {
        super({
            uniforms: THREE.UniformsUtils.clone(TAA_SHADER.uniforms),
            vertexShader: TAA_SHADER.vertexShader,
            fragmentShader: TAA_SHADER.fragmentShader
        });

        this.enabled = false;
        if (this.material) this.material.toneMapped = false;

        this._historyValid = false;
        this._historyRt = new THREE.WebGLRenderTarget(1, 1, {
            depthBuffer: false,
            stencilBuffer: false
        });
        if (colorSpace && this._historyRt?.texture && 'colorSpace' in this._historyRt.texture) {
            this._historyRt.texture.colorSpace = colorSpace;
        }

        this._copyPass = new ShaderPass(COPY_SHADER);
        if (this._copyPass?.material) this._copyPass.material.toneMapped = false;
    }

    resetHistory() {
        this._historyValid = false;
    }

    setSize(width, height) {
        const w = Math.max(1, Math.floor(Number(width)));
        const h = Math.max(1, Math.floor(Number(height)));
        const prevW = this._historyRt?.width ?? 1;
        const prevH = this._historyRt?.height ?? 1;
        if (prevW === w && prevH === h) return;
        this._historyRt.setSize(w, h);
        this.resetHistory();
        const inv = this.uniforms?.uInvResolution?.value ?? null;
        if (inv?.set) inv.set(1 / w, 1 / h);
    }

    setSettings({ historyStrength, sharpen, clampStrength } = {}) {
        if (this.uniforms?.uHistoryStrength) {
            this.uniforms.uHistoryStrength.value = clampNumber(historyStrength, 0, 0.98, this.uniforms.uHistoryStrength.value);
        }
        if (this.uniforms?.uSharpenStrength) {
            this.uniforms.uSharpenStrength.value = clampNumber(sharpen, 0, 1, this.uniforms.uSharpenStrength.value);
        }
        if (this.uniforms?.uClampStrength) {
            this.uniforms.uClampStrength.value = clampNumber(clampStrength, 0, 1, this.uniforms.uClampStrength.value);
        }
    }

    render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
        if (!this.uniforms) return;

        const historyTex = this._historyValid ? (this._historyRt?.texture ?? null) : null;
        if (this.uniforms.tHistory) this.uniforms.tHistory.value = historyTex || readBuffer?.texture || null;

        super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);

        if (this._copyPass && this._historyRt) {
            this._copyPass.render(renderer, this._historyRt, writeBuffer, deltaTime, maskActive);
            this._historyValid = true;
        }
    }

    dispose() {
        this._historyRt?.dispose?.();
        this.material?.dispose?.();
        this._copyPass?.material?.dispose?.();
    }
}

